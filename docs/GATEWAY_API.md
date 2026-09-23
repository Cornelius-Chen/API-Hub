# Gateway v1

Future SaaS products call API Hub with an application token. Short-lived workers
may use a delegated agent token. They do
not select a provider, receive a provider credential, or call arbitrary URLs.

## Runtime configuration

```text
API_HUB_URL=http://127.0.0.1:4310
API_HUB_APP_TOKEN=<copy the one-time application token>
```

Keep the application token in the calling application's server-side environment
or secret store. Never embed it in frontend JavaScript.

For agent runtimes, use the same environment variable with a one-time
`ah_agent_...` token. Agent discovery is automatically narrowed to the
intersection of its own delegated grants and the parent application's current
grants. See `AGENT_IDENTITY.md`.

## Discover grants

```http
GET /gateway/v1/capabilities
Authorization: Bearer <application-token>
```

The response contains only capabilities granted to that application, including
RPM and daily limits. This is the discovery endpoint agents should inspect before
choosing a tool action.

## Export a token-scoped OpenAPI contract

```http
GET /gateway/v1/openapi.json
Authorization: Bearer <application-token>
```

The OpenAPI 3.1 document contains only the caller's live grants. Its invocation
request is a `oneOf` union keyed by stable capability ID, with each capability's
reviewed input JSON Schema. It never contains the token, provider credential, or
provider API base. See `OPENAPI_INTEGRATION.md`.

## Invoke a capability

```http
POST /gateway/v1/invoke
Authorization: Bearer <application-token>
Content-Type: application/json

{
  "capability": "ai.text.generate",
  "input": {
    "prompt": "Application-owned input"
  }
}
```

The application supplies a stable business capability, not an OpenAI model or
provider URL. API Hub performs these decisions in order:

1. Hash and validate the application token.
2. Derive workspace, application, and environment from the token.
3. Require an active application and an enabled capability grant.
4. Enforce application state, budget, and explicit capability grant.
5. Validate the request input against the activated capability contract.
6. Enforce RPM and daily limits.
7. Select the governed primary route and fallback metadata.
8. Record identity, decision, route, units, latency, and outcome.

Candidate capability proposals never appear in discovery. A contract must be
explicitly activated and separately granted before an application can see it.
Contract failures return `403 input_contract_violation` without persisting input.

Request input and provider output are deliberately absent from invocation and
audit tables. The default execution mode is `dry_run`. A provider request can be
sent only when the adapter and local activation record authorize the exact
provider, environment, origin, and capability. Live calls return validated
provider output to the caller without persisting it.

Because live output retention is metadata-only, `Idempotency-Key` is currently
rejected for live invocations. Dry-run replay semantics remain available.

## Install the Node SDK

Build the local package once from API Hub:

```powershell
cd <path-to-api-hub-repo>
npm run build:sdk
```

Install the generated package from a new SaaS backend (use the actual generated
versioned filename in `dist`):

```powershell
npm install "<path-to-api-hub-repo>\dist\local-api-hub-client-0.1.0.tgz"
```

## Node client

```js
const { ApiHubClient } = require("@local/api-hub-client");

const hub = new ApiHubClient({
  baseUrl: process.env.API_HUB_URL,
  token: process.env.API_HUB_APP_TOKEN,
  timeoutMs: 30_000,
});

const manifest = await hub.capabilities();
const openapi = await hub.openapi();
const response = await hub.invoke("ai.text.generate", { prompt: "hello" });
```

For retryable operations, pass a stable logical-operation key:

```js
const response = await hub.invoke("ai.text.generate", { prompt: "hello" }, {
  idempotencyKey: "job-018fd1c0-unique-operation",
});
```

See `GATEWAY_IDEMPOTENCY.md` for replay, conflict, privacy, and TTL semantics.
See `GATEWAY_RESILIENCE.md` for request size, concurrency, timeout, cancellation,
and retry guidance.

The installed package also exposes a CLI suitable for scripts and agents:

```powershell
npx api-hub capabilities
npx api-hub openapi
npx api-hub invoke ai.text.generate --input-json '{"prompt":"hello"}'
```

Application and agent tokens are shown once and stored by API Hub only as
SHA-256 hashes. Application tokens expire after 90 days; agent tokens expire
within 168 hours and never outlive their agent identity. Provider credentials
remain inside the encrypted vault and are never returned to either identity.
