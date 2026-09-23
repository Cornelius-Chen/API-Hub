# One API Hub, multiple devices

## Architecture and scope

The existing Node server owns one SQLite database and AES-256-GCM vault. There
is no Windows DPAPI dependency. The Windows launcher is a convenience executable,
not the backend. `node:sqlite` needs Node >=22.13; use Node 24 for the server.
Mac clients only need Node >=20 and the small SDK/MCP package, not the server,
SQLite, vault.key, or provider credentials.

The Windows service observed during this change listened on 127.0.0.1:4310.
That live process has NOT been restarted or reconfigured. Default local startup
still uses this address, existing authentication, data paths and execution gates.

## Single-server deployment choices (not activated)

MSI hosting is the shortest reuse path: it must stay powered on, awake, online,
and run API Hub. A reachable trusted HTTPS address is still required. Merely
setting a hostname does not provide routing from a school network to home.
Do not expose port 4310 via a home router or disable TLS/authorization.

Supported configurations:

1. Native TLS: set `API_HUB_PUBLIC_ORIGIN=https://hub.example.com:443`,
   `API_HUB_HOST` to the intended private interface, `PORT` to the listener port,
   and `API_HUB_TLS_CERT_PATH` / `API_HUB_TLS_KEY_PATH` to certificate paths.
   Non-loopback HTTP is rejected. A trusted certificate and an independently
   authorized private network path are external prerequisites.
2. An approved HTTPS reverse proxy on the same host: retain the loopback listener,
   set `API_HUB_PUBLIC_ORIGIN` to its exact HTTPS origin. The proxy must preserve
   that Host, forward Origin/Cookie/Authorization, disable request-body and
   authorization logging, and block `/internal/*`. Forwarded headers are never
   used to grant trust. The backend remains accessible only on loopback.

Example Caddy configuration (prepare only; review domain/access policy before use):

```caddyfile
hub.example.com {
  @internal path /internal/*
  respond @internal 404
  reverse_proxy 127.0.0.1:4310
}
```

In shared HTTPS mode browser cookies become Secure and Host/Origin must match
the configured origin. Both Windows and Mac browsers should use that same URL.
Initialize the administrator locally before enabling shared mode; remote setup
on an empty database is refused. Reuse the existing account; do not reset it.

For hosting independent of MSI, this same code can run on a private cloud host
with Node 24 and a durable local disk. Specify `API_HUB_DB_PATH` and
`API_HUB_VAULT_KEY_PATH`, and preserve both across restarts. Use one server process,
not multiple ephemeral instances or a network-shared SQLite file. TLS, access
policy, certificate renewal, supervisor startup/restart and encrypted backups
must be provisioned and verified. A new empty deployment DOES NOT share the
existing MSI configuration. Transferring the real database and vault key is a
separate user-approved migration; none was performed here.

## Human administration and AI authorization

The existing browser UI is the trusted entry point: sign in, add/update provider
credentials, register an application per device, grant only the required
capabilities, and issue a token. Provider credentials are write-only. The user
copies the device's application token into a private local token file; never
paste it into an AI conversation. This is an API Hub access token, not a
DeepSeek key. Application tokens currently expire after 90 days; renewal is a
user action. Existing delegated-agent tokens can be shorter-lived.

Revoke a device token in the existing Applications/token UI. Discovery and
invocation recheck authorization. To stop a particular capability, disable its
application grant. Saving an arbitrary provider does not implement its API:
new provider execution still requires a reviewed adapter, capability and grants.
Existing live-activation gates are preserved, never automatically unlocked.

## Mac Codex setup after the HTTPS endpoint is ready

1. Obtain only `dist/local-api-hub-client-0.1.1.tgz` from this project and install
   it into a user-owned tools directory using npm. No global/admin install is
   needed. This archive contains client code only, no runtime database or keys.
2. The user saves a scoped API Hub token in a private file, e.g.
   `~/.config/api-hub/mac.token`, with directory mode 700 and file mode 600.
   Local processes with the same user's permissions may read this file; it is
   not an OS vault. Provider keys remain solely at the server.
3. Add to Mac `~/.codex/config.toml` with absolute paths (placeholders below):

```toml
[mcp_servers.api_hub]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/node_modules/@local/api-hub-client/mcp.js"]

[mcp_servers.api_hub.env]
API_HUB_URL = "https://hub.example.com"
API_HUB_APP_TOKEN_FILE = "/Users/USER/.config/api-hub/mac.token"
```

Use the trusted certificate chain. For a private CA, configure the actual CA
certificate using `NODE_EXTRA_CA_CERTS`; never disable certificate validation.
The bridge runs locally over stdio and calls the shared HTTPS Gateway, so the
server does not need a new HTTP MCP implementation or OAuth platform.

Verify tools/list from the Mac, then an authorized synthetic/dry-run tool call,
then revoke the test device token and confirm denial. A real provider call
requires separately approved test content and a spending limit. Adding the
server MCP config does not switch Codex's primary GPT model to DeepSeek.

## Validation and provenance

Reuses `src/security.js`, `src/database.js`, Gateway v1 and the existing SDK/MCP;
adds only the network policy and optional TLS, token-file bridge loading, SDK
HTTPS-only remote origins and redirect rejection. Fixes UTC token expiry parsing
and SQLite session expiry comparisons (no data migration).

Sources: Node HTTPS https://nodejs.org/api/https.html and SQLite
https://nodejs.org/api/sqlite.html; official implementation
https://github.com/nodejs/node/blob/main/doc/api/https.md; Codex MCP
https://learn.chatgpt.com/docs/extend/mcp . No new server dependencies.

Run `npm test`, `npm run check`, and `npm run test:multidevice` (OpenSSL required
for one-day synthetic certificates; `OPENSSL_BIN` may select its executable).
Tests use temporary databases and keys; never point them at real runtime files.
The multidevice test uses real certificate-validated loopback HTTPS, two sessions,
the existing MCP bridge and one synthetic database. It checks persistence,
write-only credential updates, authorization, revocation and no test secret in
responses/logs. It is not a real Mac/network/cloud deployment test.

Not verified: macOS execution, cross-network routing, production certificates,
server boot recovery, hosted supervision or real API billing. Existing Windows
launcher binary was not rebuilt/restarted; Windows source regression and client
package installation tests passed. No credentials were read or migrated.

To return an activated server to local-only behavior in a planned maintenance
window, remove the four API_HUB_HOST/PUBLIC_ORIGIN/TLS_CERT_PATH/TLS_KEY_PATH
overrides and restore the original PORT. Do not replace or copy the database or
vault. Code changes do not require a schema migration. Current live service was
left in its original local-only mode throughout this work.

Shared-mode hardening: when API_HUB_PUBLIC_ORIGIN is set, the backend itself rejects /internal and /internal/* with 404 before authentication or launcher handling, for every HTTP method, including loopback proxy traffic. An external proxy deny rule is defense in depth rather than the sole boundary. Test: node tests/internal-boundary.test.js (no credentials or database).

Default website credential: Security now has a write-only save/update/disable form. It uses the existing AES-256-GCM vault key with a distinct website-default context and a separate workspace-scoped table in the same database. GET exposes status only, without fingerprint or plaintext. No credential retrieval, browser autofill, site binding or MCP tool is implemented. Auth/CSRF and synthetic save/disable tests pass; no real password was entered by the agent.
