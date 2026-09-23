class ApiHubError extends Error {
  constructor(message, { status, requestId, reason, retryAfter, retryable = false } = {}) {
    super(message);
    this.name = "ApiHubError";
    this.status = status;
    this.requestId = requestId;
    this.reason = reason;
    this.retryAfter = retryAfter;
    this.retryable = retryable;
  }
}

class ApiHubClient {
  constructor({ baseUrl = "http://127.0.0.1:4310", token, fetchImpl = globalThis.fetch, timeoutMs = 30_000 } = {}) {
    if (!token) throw new TypeError("API Hub application token is required.");
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300_000) throw new TypeError("timeoutMs must be 100-300000.");
    let url;
    try { url = new URL(baseUrl); } catch { throw new TypeError("Invalid API Hub URL."); }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new TypeError("API Hub URL must be an HTTPS origin, or loopback HTTP.");
    }
    this.baseUrl = url.origin;
    this.token = token;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async capabilities({ signal, timeoutMs } = {}) {
    return this.#request("/gateway/v1/capabilities", { method: "GET", signal, timeoutMs });
  }

  async openapi({ signal, timeoutMs } = {}) {
    return this.#request("/gateway/v1/openapi.json", { method: "GET", signal, timeoutMs });
  }

  async invoke(capability, input = {}, { signal, timeoutMs, idempotencyKey } = {}) {
    if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(capability || "")) {
      throw new TypeError("Capability must be a stable dotted identifier.");
    }
    return this.#request("/gateway/v1/invoke", {
      method: "POST",
      signal,
      timeoutMs,
      headers: { "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
      body: JSON.stringify({ capability, input }),
    });
  }

  async #request(path, options) {
    const { signal: callerSignal, timeoutMs = this.timeoutMs, ...fetchOptions } = options;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const forwardAbort = () => controller.abort(callerSignal.reason);
    callerSignal?.addEventListener("abort", forwardAbort, { once: true });
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        ...fetchOptions,
        redirect: "error",
        signal: controller.signal,
        headers: { authorization: `Bearer ${this.token}`, ...fetchOptions.headers },
      });
      let payload;
      try { payload = await response.json(); }
      catch { throw new ApiHubError("API Hub returned a non-JSON response.", { status: response.status, retryable: response.status >= 500 }); }
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("retry-after"));
        throw new ApiHubError(payload.error || payload.reason || "API Hub request failed.", {
          status: response.status,
          requestId: payload.requestId || response.headers.get("x-request-id"),
          reason: payload.reason,
          retryAfter: Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : undefined,
          retryable: new Set([408, 429, 502, 503, 504]).has(response.status),
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof ApiHubError) throw error;
      if (timedOut) throw new ApiHubError(`API Hub request timed out after ${timeoutMs} ms.`, { reason: "client_timeout", retryable: true });
      if (callerSignal?.aborted) throw new ApiHubError("API Hub request was aborted by the caller.", { reason: "request_aborted", retryable: false });
      throw new ApiHubError("API Hub network request failed.", { reason: "network_error", retryable: true });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", forwardAbort);
    }
  }
}

module.exports = { ApiHubClient, ApiHubError };
