const fs = require("node:fs");
const path = require("node:path");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function readEnv(filePath) {
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

async function main() {
  const envPath = path.resolve(argument("--env") || "");
  if (!argument("--env")) throw new Error("--env is required.");
  const env = readEnv(envPath);
  if (!env.API_HUB_URL || !env.API_HUB_APP_TOKEN) throw new Error("API Hub development identity is not configured.");
  const response = await fetch(new URL("/gateway/v1/invoke", env.API_HUB_URL), {
    method: "POST",
    headers: { authorization: `Bearer ${env.API_HUB_APP_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      capability: "ai.structured.generate",
      input: { prompt: "Return exactly one JSON object with ok=true and source=deepseek-live-smoke.", maxTokens: 64 },
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    process.stdout.write(`${JSON.stringify({ ok: false, status: response.status, reason: payload.reason || "gateway_failed" })}\n`);
    process.exitCode = 1;
    return;
  }
  const output = payload.result?.output || {};
  process.stdout.write(`${JSON.stringify({
    ok: true,
    status: response.status,
    executionMode: payload.executionMode,
    resultStatus: payload.result?.status,
    externalRequestSent: payload.result?.externalRequestSent,
    provider: payload.result?.provider,
    model: output.model,
    value: output.value,
    usage: output.usage,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
});
