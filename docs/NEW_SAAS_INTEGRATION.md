# New SaaS Integration Standard

Use this checklist for every new SaaS or server-side agent.

## 1. Register one application

In API Hub, open Applications and choose Register application. Define:

- a stable lowercase application ID;
- `development` or `sandbox` environment;
- an explicit monthly policy budget;
- only the initial capabilities the product requires.

Do not reuse another product's application identity.

## 2. Issue one token per runtime

Issue a separately labeled token for each server runtime, worker, or deployment.
Copy it once into that runtime's server-side secret store:

```text
API_HUB_URL=http://127.0.0.1:4310
API_HUB_APP_TOKEN=<one-time token>
```

Never place the token in frontend code, a repository, logs, screenshots, or an
agent prompt. Revoke a runtime token when the runtime is retired or suspected of
exposure.

## 3. Discover before invoking

The runtime calls `GET /gateway/v1/capabilities` at startup or when configuration
changes. It must treat this response as the authority for available actions and
limits. It must not infer access from provider metadata.

## 4. Invoke stable capabilities

Install the versioned local package from `dist/local-api-hub-client-*.tgz` and
import `@local/api-hub-client`, or send the Gateway v1 HTTP contract directly.
Call `ai.text.generate` or another governed capability; never send a provider
credential, provider URL, or arbitrary target URL. CLI-based agents may use
`npx api-hub capabilities` and `npx api-hub invoke ...` with the same server-side
environment variables.

For other languages or low-code backends, retrieve
`GET /gateway/v1/openapi.json` with the same Bearer token and generate a client
from that live contract. Refresh it after grant or capability changes; do not
commit a token-specific document as a permanent source of authority.

## 5. Handle policy outcomes

- `401`: missing, expired, or revoked application token.
- `403 capability_not_granted`: request the narrow grant in the control plane.
- `403 application_inactive`: application lifecycle blocks all calls.
- `403 application_budget_exhausted`: review budget before changing it.
- `408 request_body_timeout`: retry only if the operation is safe and idempotent.
- `413 request_body_too_large`: reduce the request below the 32 KB Gateway limit.
- `429 rpm_limit_exceeded`: honor `Retry-After`; do not bypass with another token.
- `429 daily_limit_exceeded`: honor `Retry-After` or obtain reviewed approval.
- `429 gateway_overloaded`: honor `Retry-After`; keep the same idempotency key.

Preserve `requestId` for troubleshooting. Do not log request bodies by default.
The Node SDK exposes `status`, `reason`, `requestId`, `retryAfter`, and
`retryable` on `ApiHubError`. It has a 30-second client deadline by default and
supports per-call `timeoutMs` and `AbortSignal`. It deliberately does not retry
automatically.

## 6. Make retries idempotent

Generate one stable `Idempotency-Key` for each logical job, queue item, order, or
side-effecting operation and reuse it only when retrying that same input. Do not
generate a new key on every network retry. A replay returns the original
`requestId` and does not consume usage twice.

## 7. Production gate

Current Gateway execution is `dry_run` and sends no provider traffic. Live mode
requires an explicit control decision covering provider adapter, input/output
retention, egress allowlist, timeout/retry behavior, cost metering, redaction,
and rollback. A local application token does not authorize that activation.
