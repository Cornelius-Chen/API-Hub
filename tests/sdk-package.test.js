const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "api-hub-sdk-"));
const appToken = "ah_dev_synthetic_package_test_token";
const npmCli = process.env.npm_execpath;
let server;
const observedIdempotencyKeys = [];
let capabilityDelayMs = 0;

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result;
}

function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, {
      cwd: root,
      windowsHide: true,
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (status) => {
      if (status !== 0) return reject(new Error(stderr || stdout || `Command exited ${status}`));
      resolve({ stdout, stderr });
    });
  });
}

function runStdio(command, args, lines, options = {}) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, { cwd: root, windowsHide: true, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (status) => status === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || stdout || `Command exited ${status}`)));
    child.stdin.end(`${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  });
}

async function listen() {
  server = http.createServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${appToken}`);
    response.setHeader("content-type", "application/json");
    if (request.method === "GET" && request.url === "/gateway/v1/capabilities") {
      const delay = capabilityDelayMs;
      capabilityDelayMs = 0;
      setTimeout(() => response.end(JSON.stringify({
        gateway: { executionMode: "dry_run" },
        capabilities: [{
          capabilityId: "ai.text.generate",
          label: "Generate text",
          description: "Generate governed synthetic text",
          inputContract: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] },
          dataClassification: "confidential",
          usage: { minute: { remaining: 29 }, day: { remaining: 999 } },
        }],
      })), delay);
      return;
    }
    if (request.method === "GET" && request.url === "/gateway/v1/openapi.json") {
      response.end(JSON.stringify({ openapi: "3.1.0", paths: { "/gateway/v1/invoke": {} }, "x-api-hub-identity": { type: "application", applicationId: "synthetic" } }));
      return;
    }
    if (request.method === "POST" && request.url === "/gateway/v1/invoke") {
      if (request.headers["idempotency-key"]) observedIdempotencyKeys.push(request.headers["idempotency-key"]);
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const payload = JSON.parse(body);
        if (payload.capability === "test.rate.limit") {
          response.statusCode = 429;
          response.setHeader("retry-after", "7");
          response.setHeader("x-request-id", "req-rate-limit");
          response.end(JSON.stringify({ error: "Rate limit exceeded", reason: "rpm_limit_exceeded", requestId: "req-rate-limit" }));
          return;
        }
        response.end(JSON.stringify({ executionMode: "dry_run", capability: payload.capability, result: { externalRequestSent: false } }));
      });
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function main() {
  assert.ok(npmCli, "npm_execpath is required for the package installation test");
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  const packed = run(process.execPath, [npmCli, "pack", "./src/sdk/node", "--pack-destination", temp]);
  const tarballName = packed.stdout.trim().split(/\r?\n/).at(-1);
  const tarball = path.join(temp, tarballName);
  assert.equal(fs.existsSync(tarball), true);

  fs.writeFileSync(path.join(temp, "package.json"), JSON.stringify({ name: "sdk-install-test", private: true }));
  run(process.execPath, [npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], { cwd: temp });

  const baseUrl = await listen();
  const installed = require(path.join(temp, "node_modules", "@local", "api-hub-client"));
  const client = new installed.ApiHubClient({ baseUrl, token: appToken });
  const manifest = await client.capabilities();
  assert.equal(manifest.capabilities[0].capabilityId, "ai.text.generate");
  const openapi = await client.openapi();
  assert.equal(openapi.openapi, "3.1.0");
  const invoked = await client.invoke("ai.text.generate", { prompt: "synthetic" }, { idempotencyKey: "sdk-synthetic-idempotency" });
  assert.equal(invoked.result.externalRequestSent, false);
  assert.deepEqual(observedIdempotencyKeys, ["sdk-synthetic-idempotency"]);

  await assert.rejects(client.invoke("test.rate.limit", {}), (error) => {
    assert.equal(error.name, "ApiHubError");
    assert.equal(error.status, 429);
    assert.equal(error.reason, "rpm_limit_exceeded");
    assert.equal(error.requestId, "req-rate-limit");
    assert.equal(error.retryAfter, 7);
    assert.equal(error.retryable, true);
    return true;
  });

  capabilityDelayMs = 250;
  await assert.rejects(client.capabilities({ timeoutMs: 100 }), (error) => {
    assert.equal(error.reason, "client_timeout");
    assert.equal(error.retryable, true);
    return true;
  });
  capabilityDelayMs = 250;
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(), 25);
  await assert.rejects(client.capabilities({ signal: abortController.signal }), (error) => {
    assert.equal(error.reason, "request_aborted");
    assert.equal(error.retryable, false);
    return true;
  });

  const cliPath = path.join(temp, "node_modules", "@local", "api-hub-client", "cli.js");
  const cli = await runAsync(process.execPath, [cliPath, "capabilities"], {
    cwd: temp,
    env: { ...process.env, API_HUB_URL: baseUrl, API_HUB_APP_TOKEN: appToken },
  });
  assert.equal(JSON.parse(cli.stdout).gateway.executionMode, "dry_run");
  assert.equal(`${cli.stdout}${cli.stderr}`.includes(appToken), false, "CLI must not print its token");
  const cliOpenApi = await runAsync(process.execPath, [cliPath, "openapi"], {
    cwd: temp,
    env: { ...process.env, API_HUB_URL: baseUrl, API_HUB_APP_TOKEN: appToken },
  });
  assert.equal(JSON.parse(cliOpenApi.stdout).openapi, "3.1.0");
  assert.equal(`${cliOpenApi.stdout}${cliOpenApi.stderr}`.includes(appToken), false, "OpenAPI export must not print its token");
  const cliInvoke = await runAsync(process.execPath, [cliPath, "invoke", "ai.text.generate", "--input-json", "{}", "--idempotency-key", "cli-synthetic-idempotency"], {
    cwd: temp,
    env: { ...process.env, API_HUB_URL: baseUrl, API_HUB_APP_TOKEN: appToken },
  });
  assert.equal(JSON.parse(cliInvoke.stdout).result.externalRequestSent, false);
  assert.deepEqual(observedIdempotencyKeys, ["sdk-synthetic-idempotency", "cli-synthetic-idempotency"]);
  assert.equal(`${cliInvoke.stdout}${cliInvoke.stderr}`.includes("cli-synthetic-idempotency"), false, "CLI must not print its idempotency key");

  const mcpPath = path.join(temp, "node_modules", "@local", "api-hub-client", "mcp.js");
  const mcp = await runStdio(process.execPath, [mcpPath], [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "synthetic-host", version: "1.0.0" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ai.text.generate", arguments: { prompt: "synthetic MCP" } } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "provider.secret.read", arguments: {} } },
  ], { cwd: temp, env: { ...process.env, API_HUB_URL: baseUrl, API_HUB_APP_TOKEN: appToken } });
  const mcpResponses = mcp.stdout.trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(mcpResponses.length, 4, "notifications must not receive responses");
  assert.equal(mcpResponses[0].result.protocolVersion, "2025-06-18");
  assert.deepEqual(mcpResponses[0].result.capabilities, { tools: { listChanged: false } });
  assert.equal(mcpResponses[1].result.tools[0].name, "ai.text.generate");
  assert.deepEqual(mcpResponses[1].result.tools[0].inputSchema.required, ["prompt"]);
  assert.equal(mcpResponses[2].result.isError, false);
  assert.equal(mcpResponses[2].result.structuredContent.result.externalRequestSent, false);
  assert.equal(mcpResponses[3].error.code, -32602, "ungranted tools must not be callable");
  assert.equal(`${mcp.stdout}${mcp.stderr}`.includes(appToken), false, "MCP bridge must not print its token");
  console.log("packed SDK install, client, CLI, and MCP bridge: passed");
}

main()
  .finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
