# Local Database Schema

The MVP runtime source of truth is `data/runtime/api-hub.sqlite`. The file is
server-side only and ignored by Git.

## Ownership model

Every domain record belongs to a workspace. Provider, credential, application,
and agent relations use composite workspace keys so a child record cannot point
to an object owned by another workspace. All API reads bind the workspace ID in
the database query; the browser never receives the internal ownership column.

## Tables

- `workspaces`: isolation namespace and display metadata.
- `providers`: provider identity, health, cost, and public endpoint metadata.
- `credentials`: status, fingerprint, lifecycle, and a reserved ciphertext field.
- `quota_snapshots`: remaining usage, source, and freshness metadata.
- `provider_metric_history`: append-only quota, cost, peak, source, and capture time.
- `alerts`: open and resolved threshold/provenance decisions linked to snapshots.
- `capabilities`: stable business actions and routing labels.
- `capability_contracts`: activated routing, JSON contracts, data classification,
  retention policy, and activation time.
- `capability_proposals`: candidate/activated review lifecycle separated from
  application discovery and grants.
- `applications`: SaaS clients, grants, budgets, and usage.
- `agents`: delegated identities owned by an application.
- `audit_events`: metadata-only activity trail.
- `auth_accounts`: workspace-bound username and scrypt password hash.
- `auth_sessions`: hashed session token, hashed CSRF token, and expiry.
- `auth_session_metadata`: public session ID, generic device label, anonymous
  client fingerprint, and last-seen time.
- `auth_login_failures`: hashed login-key fingerprints and timestamps for the
  persistent 15-minute throttle window.
- `application_tokens`: hashed, expiring identity scoped to one application.
- `application_capability_grants`: enabled capabilities with RPM and daily limits.
- `agent_capability_grants`: delegated subset of the parent application's grants.
- `agent_tokens`: one-time, short-lived hashed identity scoped to one agent.
- `invocation_records`: metadata-only identity, policy, route, units, latency,
  execution mode, identity type, optional agent ID, and outcome; request input is
  never stored.
- `gateway_idempotency`: workspace/identity-scoped HMAC key and request
  fingerprints plus dry-run replay envelopes, replay count, and expiry; live
  provider responses are never stored for replay.

The `credentials.ciphertext` column stores AES-256-GCM envelopes and never
plaintext API keys; no credential value is exposed through HTTP responses. The
local encryption key is stored separately at
`data/runtime/vault.key`; both files are server-side and Git-ignored. This
separation prevents accidental browser or source exposure but is not equivalent
to hardware-backed or cloud-KMS key custody.
