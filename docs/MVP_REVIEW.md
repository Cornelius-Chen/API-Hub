# MVP Review

Date: 2026-07-19

## Implemented

- Independent governed API Hub repository.
- Provider inventory with official links, API base, credential fingerprint,
  health, quota source, freshness, cost, peak, and remaining amount.
- Capability registry that separates business capabilities from providers.
- Application access view with environment, grants, agents, spend, and budget.
- Metadata-only audit trail.
- Agent-readable health, provider, capability, application, and audit endpoints.
- Write-only provider registration interaction prototype.
- Desktop and mobile responsive layout rules.
- Authenticated owner workspace with server-derived scope.
- Database-style collection browser for providers, credentials, capabilities,
  applications, agents, and audit events.
- Unknown workspace rejection and explicit user-scoped API reads.
- Durable local SQLite storage with strict tables, foreign keys, indexes, and
  seed-on-empty initialization.
- First-run local administrator setup with scrypt password hashing.
- HttpOnly SameSite session cookies, server-derived workspace identity, CSRF
  validation, and session restoration after restart.
- AES-256-GCM write-only credential storage with contextual authenticated data,
  random nonces, fingerprints, and metadata-only audit events.
- One-time, 90-day application tokens stored only as SHA-256 hashes.
- Application-scoped capability discovery and a zero-dependency Node client.
- Local Gateway dry-run with application/grant/budget/RPM/daily policy decisions,
  governed route selection, and metadata-only invocation records.
- New SaaS registration with atomic initial grants, later grant adjustment,
  one-token-per-runtime issuance, and explicitly confirmed immediate revocation.
- Atomic provider onboarding covering official URLs, API base, encrypted
  credential, initial quota provenance, and audit evidence.
- Uniform HTML escaping for user-authored provider, application, token, audit,
  and database projection values.
- Compiled Windows tray launcher with single-instance behavior, health-gated
  browser opening, hidden Node process, and authenticated graceful shutdown.
- Append-only provider metric history with current-state projection, source
  labeling, low-quota/unknown-source alerts, and retained resolution evidence.
- Dynamic risk queue and peak-pressure chart backed by SQLite rather than static
  demonstration values.
- Physically separated capability proposal/activation lifecycle with exact-phrase
  confirmation, atomic publication, separate grants, and runtime input validation.
- Persistent administrator login throttling, timing-equalized unknown-user checks,
  session inventory/revocation, password rotation, and all-session invalidation.
- Uniform CSP, frame, MIME, referrer, permissions, COOP, and CORP response headers.
- Default-locked provider execution engine with exact HTTPS-origin allowlists,
  reviewed-adapter registration, bounded timeout/retry, and visible live gate.
- Self-contained Windows Portable archive with bundled Node runtime, strict
  runtime-file allowlist, internal checksums, and no copied vault/database data.
- Delegated Agent identities with application-subset grants, one-time short-lived
  hashed tokens, dynamic parent-grant intersection, expiry, revocation, and
  identity-aware invocation audit records.
- Gateway-observed UTC-day analytics by application, capability, and agent,
  including allowed/denied decisions, units, latency, peak RPM, and live
  minute/day remaining allowance in discovery responses.
- Durable workspace/identity-scoped idempotency with HMAC-only keys and request
  fingerprints, transactional invocation completion, conflict detection,
  restart-safe replay, replay counters, and no duplicate usage accounting.
- Bounded Gateway request bodies, body deadlines, per-identity/global concurrency,
  standardized request IDs, Retry-After responses, and SDK cancellation metadata.
- MCP 2025-06-18 stdio bridge that dynamically exposes only token-granted
  capability contracts as tools and returns structured governed results.
- Token-scoped OpenAPI 3.1 export for language-neutral client generation, with
  live application/Agent grant projection and no provider route disclosure.

## Validation

- `npm run check`: passed.
- `GET /`: HTTP 200.
- `GET /api/health`: passed with `secretExposure: false`.
- Provider payload secret-field scan: passed.
- 4 providers, 4 capabilities, 3 applications, and 4 audit events returned.
- Six main product views and mobile breakpoint present.
- `npm test`: user workspace isolation passed.
- Authenticated owner scope covers provider, credential, capability, application,
  agent, invocation, usage, idempotency, alert, and audit collections.
- Unknown workspace requests return HTTP 404.
- Scoped responses exclude internal `userId` ownership fields.
- Restart test preserves both workspace datasets without duplicate seeding.
- SQLite foreign-key integrity check returns no violations.
- Unauthenticated workspace reads return HTTP 401.
- A forged `?user=` parameter cannot override the authenticated workspace.
- Invalid CSRF credential writes return HTTP 403.
- Direct database inspection confirms password and provider-secret plaintext are
  absent, and encrypted state survives restart.
- Application-token plaintext is absent from inventory responses and SQLite.
- Cross-workspace token issuance is rejected, ungranted capabilities return 403,
  and the 31st same-minute call is rate-limited after 30 allowed calls.
- Gateway request input is absent from invocation schema and API audit responses.
- Full lifecycle test proves register -> grant -> issue -> discover -> invoke ->
  revoke; the revoked token immediately returns 401.
- Provider tests prove duplicate rollback, authenticated workspace ownership,
  HTTPS-only URLs, ciphertext-only storage, and restart persistence.
- Launcher lifecycle test proves compile -> hidden start -> health -> token-bound
  shutdown -> process exit -> port release; invalid launcher tokens return 404.
- Metric state-machine test proves critical alert at 9%, resolution at 55%, three
  immutable snapshots, source restrictions, restart persistence, and exact cost/
  peak restoration.
- Capability lifecycle test proves candidates are not discoverable or grantable,
  wrong confirmation is rejected, explicit activation publishes the contract,
  and invalid versus valid contract inputs are enforced without payload storage.
- Security lifecycle test proves two-session inventory, owned revocation, revoked
  Cookie rejection, fifth-failure threshold, sixth-attempt 429/Retry-After, wrong
  current-password rejection, all-session password rotation, old-password denial,
  new-password login, and session persistence after restart.
- Agent lifecycle test proves cross-workspace denial, subset-only delegation,
  one-time token secrecy, narrowed discovery, overreach denial, immediate
  revocation, automatic expiry, and persisted identity-type audit metadata.
- Idempotency lifecycle proves one recorded invocation across retries, stable
  request IDs, changed-input conflict, hidden key/fingerprint fields, replay
  counting, and completed replay after service restart.
- Resilience tests prove 32 KB rejection, invalid JSON handling, four-call
  per-identity concurrency, fifth-call overload, Retry-After semantics, SDK
  timeout, caller cancellation, and retry metadata.
- Packed MCP test proves initialization, granted tool discovery, contract schema
  projection, governed invocation, ungranted-tool rejection, and token secrecy.
- OpenAPI tests prove application versus delegated-Agent contract isolation,
  reviewed input-schema projection, revoked-token denial, and absence of token,
  provider API base, or secret material.

## Honest Limits

- Data is synthetic and stored in local SQLite; it is not production data.
- Local password authentication is not SSO/MFA; persistent local throttling is
  implemented but is not a distributed identity protection service.
- The AES key is a local server-side file, not a production KMS or OS keychain.
- No production provider adapter or billing sync exists yet. Provider secrets
  can be encrypted locally, but the key remains a local file rather than KMS.
- Browser control was unavailable in the current environment, so screenshot and
  live click QA remain pending; HTTP, syntax, security flow, structure, and
  responsive CSS checks passed.
- The Portable build is self-contained but unsigned and folder-based; Windows
  code signing and a conventional installer remain future distribution work.

## Next Gate

Before production credential migration, replace the local vault key with KMS or
OS-keychain custody, add MFA/SSO and login rate limiting, encrypted backup and
recovery, network egress allowlists, redacted structured logging, provider
adapters, and destructive-action confirmation.
