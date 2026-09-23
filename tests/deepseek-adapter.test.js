const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDeepSeekAdapter, MODEL } = require("../src/gateway/adapters/deepseek.js");
const { loadLiveActivation } = require("../src/gateway/live-activation.js");
const { decryptSecret, encryptSecret } = require("../src/security.js");

async function run() {
  const key = Buffer.alloc(32, 7);
  const encrypted = encryptSecret("synthetic-never-log", key, "owner:deepseek:credential:v1");
  assert.equal(decryptSecret(encrypted.envelope, key, "owner:deepseek:credential:v1"), "synthetic-never-log");
  assert.throws(() => decryptSecret(encrypted.envelope, key, "wrong-context"), /could not be decrypted/);

  let captured;
  const adapter = createDeepSeekAdapter({
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return {
        ok: true,
        json: async () => ({
          model: MODEL,
          choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        }),
      };
    },
  });
  const result = await adapter.invoke({
    capabilityId: "ai.structured.generate",
    input: { prompt: "Return a status object", maxTokens: 64 },
    apiBaseUrl: "https://api.deepseek.com",
    credential: "synthetic-api-key",
  });
  assert.equal(captured.url, "https://api.deepseek.com/chat/completions");
  assert.equal(captured.options.headers.authorization, "Bearer synthetic-api-key");
  const request = JSON.parse(captured.options.body);
  assert.equal(request.model, "deepseek-v4-flash");
  assert.deepEqual(request.thinking, { type: "disabled" });
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.deepEqual(result.value, { ok: true });
  assert.equal(JSON.stringify(result).includes("synthetic-api-key"), false);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "api-hub-live-"));
  const activationPath = path.join(root, "live-activation.json");
  assert.equal(loadLiveActivation(activationPath).mode, "dry_run");
  fs.writeFileSync(activationPath, JSON.stringify({
    version: 1,
    status: "active",
    providerId: "deepseek",
    environment: "development",
    allowedOrigin: "https://api.deepseek.com",
    capabilities: ["ai.structured.generate"],
    authorizedBy: "user",
    authorizedAt: "2026-07-21T00:00:00.000Z",
  }));
  const live = loadLiveActivation(activationPath);
  assert.equal(live.mode, "live");
  assert.equal(live.liveGate, true);
  fs.rmSync(root, { recursive: true, force: true });
  console.log("DeepSeek adapter, encrypted credential read, and dual live gate: passed");
}

run();
