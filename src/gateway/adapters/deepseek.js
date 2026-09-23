const { AdapterExecutionError } = require("../execution-engine.js");

const PROVIDER_ID = "deepseek";
const ALLOWED_ORIGIN = "https://api.deepseek.com";
const MODEL = "deepseek-v4-flash";
const CAPABILITIES = new Set(["ai.text.generate", "ai.structured.generate"]);

function boundedString(value, name, { required = false, max = 50_000 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new AdapterExecutionError(`${name} is required.`, { reason: "adapter_input_invalid" });
    return null;
  }
  if (typeof value !== "string" || value.length > max) {
    throw new AdapterExecutionError(`${name} must be a bounded string.`, { reason: "adapter_input_invalid" });
  }
  return value;
}

function boundedMaxTokens(value) {
  if (value === undefined) return 1_024;
  if (!Number.isInteger(value) || value < 1 || value > 8_192) {
    throw new AdapterExecutionError("maxTokens must be an integer from 1 to 8192.", { reason: "adapter_input_invalid" });
  }
  return value;
}

function safeProviderFailure(status) {
  if (status === 401 || status === 403) return new AdapterExecutionError("Provider authentication failed.", { reason: "provider_auth_failed" });
  if (status === 429) return new AdapterExecutionError("Provider rate limit reached.", { reason: "provider_rate_limited", retryable: true });
  if (status >= 500) return new AdapterExecutionError("Provider is temporarily unavailable.", { reason: "provider_unavailable", retryable: true });
  return new AdapterExecutionError("Provider rejected the request.", { reason: "provider_request_rejected" });
}

function createDeepSeekAdapter({ fetchImpl = globalThis.fetch, model = MODEL } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("DeepSeek adapter requires fetch.");
  if (model !== MODEL) throw new TypeError("DeepSeek model is fixed by the reviewed adapter.");

  return {
    providerId: PROVIDER_ID,
    allowedOrigins: [ALLOWED_ORIGIN],
    async invoke({ capabilityId, input, apiBaseUrl, credential, signal }) {
      if (!CAPABILITIES.has(capabilityId)) {
        throw new AdapterExecutionError("Capability is not implemented by this adapter.", { reason: "adapter_capability_denied" });
      }
      if (typeof credential !== "string" || credential.length < 8) {
        throw new AdapterExecutionError("Provider credential is unavailable.", { reason: "provider_credential_unavailable" });
      }

      const prompt = boundedString(input?.prompt, "prompt", { required: true });
      const system = boundedString(input?.system, "system", { max: 20_000 });
      const structured = capabilityId === "ai.structured.generate";
      const messages = [];
      const structuredInstruction = "Return one valid JSON object only. Do not use Markdown fences or surrounding prose.";
      if (system || structured) messages.push({ role: "system", content: [system, structured ? structuredInstruction : null].filter(Boolean).join("\n\n") });
      messages.push({ role: "user", content: prompt });

      let response;
      try {
        response = await fetchImpl(new URL("/chat/completions", apiBaseUrl), {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${credential}` },
          body: JSON.stringify({
            model,
            messages,
            thinking: { type: "disabled" },
            max_tokens: boundedMaxTokens(input?.maxTokens),
            response_format: { type: structured ? "json_object" : "text" },
            stream: false,
          }),
          signal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new AdapterExecutionError("Provider network request failed.", { reason: "provider_network_failed", retryable: true });
      }
      if (!response.ok) throw safeProviderFailure(response.status);

      let payload;
      try { payload = await response.json(); } catch {
        throw new AdapterExecutionError("Provider returned invalid JSON.", { reason: "provider_response_invalid" });
      }
      const choice = payload?.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== "string" || !content.length) {
        throw new AdapterExecutionError("Provider response did not contain content.", { reason: "provider_response_invalid" });
      }
      let value = content;
      if (structured) {
        try { value = JSON.parse(content); } catch {
          throw new AdapterExecutionError("Provider structured response was not valid JSON.", { reason: "provider_response_invalid" });
        }
        if (!value || Array.isArray(value) || typeof value !== "object") {
          throw new AdapterExecutionError("Provider structured response was not an object.", { reason: "provider_response_invalid" });
        }
      }
      return {
        value,
        model: typeof payload.model === "string" ? payload.model : model,
        finishReason: choice.finish_reason || null,
        usage: {
          promptTokens: Number(payload.usage?.prompt_tokens || 0),
          completionTokens: Number(payload.usage?.completion_tokens || 0),
          totalTokens: Number(payload.usage?.total_tokens || 0),
        },
      };
    },
  };
}

module.exports = { ALLOWED_ORIGIN, CAPABILITIES, MODEL, PROVIDER_ID, createDeepSeekAdapter };
