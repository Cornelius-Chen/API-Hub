const net = require("node:net");

class ExecutionBlockedError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = "ExecutionBlockedError";
    this.reason = reason;
  }
}

class AdapterExecutionError extends Error {
  constructor(message, { reason = "adapter_failed", retryable = false } = {}) {
    super(message);
    this.name = "AdapterExecutionError";
    this.reason = reason;
    this.retryable = retryable;
  }
}

function normalizedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new ExecutionBlockedError("Provider API base must use HTTPS.", "egress_https_required");
  if (url.username || url.password) throw new ExecutionBlockedError("Provider API base cannot contain credentials.", "egress_embedded_credentials");
  if (url.port && url.port !== "443") throw new ExecutionBlockedError("Provider API base must use the standard HTTPS port.", "egress_port_denied");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || net.isIP(host)) {
    throw new ExecutionBlockedError("Literal and local hosts are not allowed for provider egress.", "egress_host_denied");
  }
  return url.origin.toLowerCase();
}

function safeAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") throw new TypeError("Adapter must be an object.");
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(adapter.providerId || "")) throw new TypeError("Adapter requires a stable providerId.");
  if (typeof adapter.invoke !== "function") throw new TypeError("Adapter requires an invoke function.");
  const allowedOrigins = new Set((adapter.allowedOrigins || []).map(normalizedOrigin));
  if (allowedOrigins.size === 0) throw new TypeError("Adapter requires at least one exact allowed HTTPS origin.");
  return { ...adapter, allowedOrigins };
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("Aborted"));
    }, { once: true });
  });
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason || new Error("Aborted"));
    const abort = () => reject(signal.reason || new Error("Aborted"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

function createExecutionEngine({ mode = "dry_run", liveGate = false, adapters = [], timeoutMs = 15_000, maxRetries = 1 } = {}) {
  if (!new Set(["dry_run", "live"]).has(mode)) throw new TypeError("Execution mode must be dry_run or live.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) throw new TypeError("timeoutMs must be 100-120000.");
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) throw new TypeError("maxRetries must be 0-2.");
  const registry = new Map(adapters.map((item) => {
    const adapter = safeAdapter(item);
    return [adapter.providerId, adapter];
  }));

  function describe() {
    return {
      mode,
      liveGate: liveGate ? "unlocked" : "locked",
      registeredProviders: [...registry.keys()].sort(),
      egressPolicy: "exact_https_origin_allowlist",
      timeoutMs,
      maxRetries,
    };
  }

  function plan({ providerId, apiBaseUrl, fallbackProviderId = null }) {
    const origin = normalizedOrigin(apiBaseUrl);
    const adapter = registry.get(providerId);
    return {
      providerId,
      fallbackProviderId,
      origin,
      adapterRegistered: Boolean(adapter),
      originAllowed: Boolean(adapter?.allowedOrigins.has(origin)),
      executionMode: mode,
      externalRequestSent: false,
    };
  }

  async function execute({ providerId, apiBaseUrl, capabilityId, input, credentialResolver, signal }) {
    const route = plan({ providerId, apiBaseUrl });
    if (mode === "dry_run") return { ...route, status: "planned" };
    if (!liveGate) throw new ExecutionBlockedError("Live provider execution is locked.", "live_gate_locked");
    const adapter = registry.get(providerId);
    if (!adapter) throw new ExecutionBlockedError("No reviewed adapter is registered for this provider.", "adapter_not_registered");
    if (!adapter.allowedOrigins.has(route.origin)) throw new ExecutionBlockedError("Provider origin is outside the adapter allowlist.", "egress_origin_denied");
    if (typeof credentialResolver !== "function") throw new ExecutionBlockedError("No server-side credential resolver is available.", "credential_resolver_missing");

    let attempt = 0;
    while (true) {
      attempt += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error("Provider adapter timed out.")), timeoutMs);
      const abort = () => controller.abort(signal.reason || new Error("Caller aborted."));
      signal?.addEventListener("abort", abort, { once: true });
      try {
        const credential = await credentialResolver(providerId);
        const result = await abortable(
          adapter.invoke({ capabilityId, input, apiBaseUrl, credential, signal: controller.signal }),
          controller.signal,
        );
        return { status: "completed", providerId, capabilityId, attempts: attempt, externalRequestSent: true, result };
      } catch (error) {
        const failure = controller.signal.aborted && !signal?.aborted
          ? new AdapterExecutionError("Provider adapter timed out.", { reason: "adapter_timeout", retryable: true })
          : error;
        if (!(failure instanceof AdapterExecutionError) || !failure.retryable || attempt > maxRetries) throw failure;
        await delay(Math.min(250 * (2 ** (attempt - 1)), 1_000), signal);
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    }
  }

  return { describe, plan, execute };
}

module.exports = { AdapterExecutionError, ExecutionBlockedError, createExecutionEngine, normalizedOrigin };
