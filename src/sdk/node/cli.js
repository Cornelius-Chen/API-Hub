#!/usr/bin/env node
const { ApiHubClient, ApiHubError } = require("./index.js");

function usage() {
  return [
    "Usage:",
    "  api-hub capabilities",
    "  api-hub openapi",
    "  api-hub invoke <capability> [--input-json <json>] [--idempotency-key <key>]",
    "",
    "Environment:",
    "  API_HUB_URL        Gateway URL (default http://127.0.0.1:4310)",
    "  API_HUB_APP_TOKEN  Required application token",
    "  API_HUB_TIMEOUT_MS  Client timeout in milliseconds (default 30000)",
  ].join("\n");
}

function parseInvoke(args) {
  const capability = args[1];
  if (!capability) throw new TypeError("Missing capability identifier.");
  let input = {};
  let idempotencyKey;
  for (let index = 2; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) throw new TypeError(`${flag} requires a value.`);
    if (flag === "--input-json") input = JSON.parse(value);
    else if (flag === "--idempotency-key") idempotencyKey = value;
    else throw new TypeError(`Unknown invoke option: ${flag}`);
  }
  if (!input || Array.isArray(input) || typeof input !== "object") throw new TypeError("--input-json must contain a JSON object.");
  return { capability, input, idempotencyKey };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const token = process.env.API_HUB_APP_TOKEN;
  if (!token) throw new TypeError("API_HUB_APP_TOKEN is required.");
  const configuredTimeout = process.env.API_HUB_TIMEOUT_MS ? Number(process.env.API_HUB_TIMEOUT_MS) : undefined;
  const client = new ApiHubClient({ baseUrl: process.env.API_HUB_URL, token, ...(configuredTimeout ? { timeoutMs: configuredTimeout } : {}) });
  let result;
  if (args[0] === "capabilities" && args.length === 1) {
    result = await client.capabilities();
  } else if (args[0] === "openapi" && args.length === 1) {
    result = await client.openapi();
  } else if (args[0] === "invoke") {
    const request = parseInvoke(args);
    result = await client.invoke(request.capability, request.input, { idempotencyKey: request.idempotencyKey });
  } else {
    throw new TypeError(`Unknown command: ${args[0]}\n${usage()}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  const safe = error instanceof ApiHubError
    ? { error: error.message, status: error.status, reason: error.reason, requestId: error.requestId, retryable: error.retryable, retryAfter: error.retryAfter }
    : { error: error.message };
  process.stderr.write(`${JSON.stringify(safe)}\n`);
  process.exitCode = 1;
});
