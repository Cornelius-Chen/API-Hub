const assert = require("node:assert/strict");
const { AdapterExecutionError, ExecutionBlockedError, createExecutionEngine, normalizedOrigin } = require("../src/gateway/execution-engine.js");

async function run() {
  assert.equal(normalizedOrigin("https://api.example.com/v1"), "https://api.example.com");
  for (const denied of ["http://api.example.com", "https://localhost", "https://127.0.0.1", "https://api.example.com:8443", "https://user:pass@api.example.com"]) {
    assert.throws(() => normalizedOrigin(denied), ExecutionBlockedError);
  }

  let calls = 0;
  let resolvedCredentials = 0;
  const adapter = {
    providerId: "synthetic-ai",
    allowedOrigins: ["https://api.example.com"],
    async invoke({ capabilityId, input, credential }) {
      calls += 1;
      assert.equal(credential, "synthetic-write-only-secret");
      if (calls === 1) throw new AdapterExecutionError("Synthetic transient failure", { retryable: true });
      return { capabilityId, receivedKeys: Object.keys(input) };
    },
  };

  const dryRun = createExecutionEngine({ adapters: [adapter] });
  const planned = await dryRun.execute({
    providerId: "synthetic-ai",
    apiBaseUrl: "https://api.example.com/v1",
    capabilityId: "ai.text.generate",
    input: { prompt: "private synthetic input" },
    credentialResolver: async () => { resolvedCredentials += 1; return "should-not-resolve"; },
  });
  assert.equal(planned.status, "planned");
  assert.equal(planned.externalRequestSent, false);
  assert.equal(resolvedCredentials, 0, "dry-run must never resolve provider credentials");
  assert.equal(calls, 0, "dry-run must never invoke an adapter");

  const locked = createExecutionEngine({ mode: "live", adapters: [adapter] });
  await assert.rejects(() => locked.execute({
    providerId: "synthetic-ai", apiBaseUrl: "https://api.example.com", capabilityId: "ai.text.generate", input: {}, credentialResolver: async () => "secret",
  }), (error) => error.reason === "live_gate_locked");

  const liveSynthetic = createExecutionEngine({ mode: "live", liveGate: true, adapters: [adapter], maxRetries: 1, timeoutMs: 1_000 });
  const completed = await liveSynthetic.execute({
    providerId: "synthetic-ai",
    apiBaseUrl: "https://api.example.com/v1",
    capabilityId: "ai.text.generate",
    input: { prompt: "private synthetic input" },
    credentialResolver: async () => { resolvedCredentials += 1; return "synthetic-write-only-secret"; },
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.attempts, 2);
  assert.equal(completed.externalRequestSent, true);
  assert.equal(resolvedCredentials, 2);
  assert.equal(JSON.stringify(completed).includes("synthetic-write-only-secret"), false);

  const hangingAdapter = {
    providerId: "hanging-ai",
    allowedOrigins: ["https://hanging.example.com"],
    invoke: async () => new Promise(() => {}),
  };
  const bounded = createExecutionEngine({ mode: "live", liveGate: true, adapters: [hangingAdapter], timeoutMs: 100, maxRetries: 0 });
  const timeoutStarted = Date.now();
  await assert.rejects(() => bounded.execute({
    providerId: "hanging-ai", apiBaseUrl: "https://hanging.example.com", capabilityId: "ai.text.generate", input: {}, credentialResolver: async () => "synthetic-secret",
  }), (error) => error.reason === "adapter_timeout");
  assert.ok(Date.now() - timeoutStarted < 500, "an adapter that ignores AbortSignal must still be bounded");
  console.log("execution gate, egress policy, adapter retry, and dry-run secrecy: passed");
}

run();
