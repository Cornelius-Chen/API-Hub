# Token-Scoped OpenAPI Integration

Every application and delegated Agent token can export its current Gateway
contract as OpenAPI 3.1:

```http
GET http://127.0.0.1:4310/gateway/v1/openapi.json
Authorization: Bearer <API_HUB_APP_TOKEN>
```

The document is generated on demand. It includes:

- local Gateway server URL and Bearer authentication scheme;
- capability discovery and governed invocation operations;
- a `oneOf` invocation request variant for every current grant;
- the reviewed JSON Schema input contract for each capability;
- output contract, data classification, retention policy, RPM, and daily policy
  as API Hub extensions;
- safe application or delegated-Agent identity metadata;
- current `dry_run/live` and activation-gate state.

It excludes application-token plaintext, provider credentials, provider API
bases, arbitrary destination URLs, vault metadata, and other workspaces.

## Export with the SDK or CLI

```js
const { ApiHubClient } = require("@local/api-hub-client");
const hub = new ApiHubClient({
  baseUrl: process.env.API_HUB_URL,
  token: process.env.API_HUB_APP_TOKEN,
});
const document = await hub.openapi();
```

```powershell
api-hub openapi > api-hub.openapi.json
```

The redirected file is not secret because it contains no token, but it does
describe the runtime's authorization surface and should still be treated as
internal configuration.

## Use from another language

Fetch the document at deployment or configuration time using a server-side
Bearer token, then pass it to an OpenAPI 3.1-compatible generator. Runtime calls
must continue to send that Bearer token only to API Hub. Generated clients must
not accept provider credentials or rewrite the server URL to a provider domain.

Refresh the document whenever grants, Agent delegation, capability contracts, or
token lifecycle change. A revoked or expired token receives 401 and can no longer
export a contract. The live Gateway remains authoritative even if a previously
generated client still contains an older operation.
