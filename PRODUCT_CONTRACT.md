# API Hub MVP Product Contract

## Outcome

API Hub is the only governed route through which future SaaS products and
agents request external API capabilities.

## MVP Loop

```text
Register provider
-> record write-only credential state
-> publish capability
-> register application
-> grant scoped access
-> invoke through gateway
-> record usage, quota, health, and audit
-> revoke access
```

## MVP Objects

- User Workspace: top-level isolation namespace for one owner or client space.
- Provider: official identity, URLs, API base, status and metadata source.
- Credential: encrypted-value placeholder, fingerprint, environment and lifecycle.
- Capability: stable business-facing action independent of provider.
- Application: one SaaS product and environment.
- Agent: short-lived delegated application identity.
- Policy: capability, budget, rate, model and privacy constraints.
- Route: provider adapter priority and fallback decision.
- Invocation: request metadata, outcome, cost, latency and policy decision.
- Quota Snapshot: limit, used, remaining, reset time and source type.
- Audit Event: actor, object, action, result and redacted context.

## User Data Isolation Contract

```text
User Workspace
├── Provider Accounts
├── Credential Records
├── Capability Grants
├── Applications
│   └── Agent Identities
├── Usage And Quota Snapshots
└── Audit Events
```

Every user-scoped record carries one workspace owner. Human control-plane reads
derive workspace identity from an authenticated session; application calls
derive it from a hashed application token. Query parameters cannot select a
workspace, and responses never merge records from multiple users.

## MVP Security

This prototype uses synthetic records persisted in a local SQLite database.
Workspace ownership is enforced structurally through composite keys, foreign
keys, authenticated-session-derived scope, and workspace-scoped queries. Local
password authentication, HttpOnly SameSite sessions, CSRF validation, and
AES-256-GCM write-only credential encryption are implemented. Production-grade
identity, KMS-backed key custody, adversarial tenant isolation, provider adapters,
distributed rate limiting, and network egress controls are not claimed complete.

## Local Gateway Contract

The internal `/gateway/v1` contract accepts application tokens and stable
capability identifiers. It enforces application state, capability grants, budget,
RPM, and daily limits and records metadata-only invocation decisions. Execution
defaults to `dry_run`; a provider network request requires a reviewed adapter
and an explicit local activation record. The included DeepSeek adapter is scoped
to the authorized development environment.

## Completion Floor

- Human-readable dashboard with drill-down, not a generic card wall.
- Provider, capability, application, credential, quota and audit states visible.
- Secret values absent from all browser payloads.
- Agent-readable capability endpoint.
- Health and quota values label their source and freshness.
- Responsive desktop and mobile layouts.
- Authenticated sessions prove isolated provider, capability, application,
  agent, token, invocation, and audit datasets.
- Database view exposes collection counts and relationships without revealing
  credential values.
- Browser query parameters cannot select or override the authenticated workspace.
- Credential writes require an authenticated session and CSRF token and return
  only status plus fingerprint.
- Provider creation atomically records validated HTTPS metadata, encrypted
  credential, quota provenance, and audit evidence.
- User-authored provider, application, token, audit, and database values are
  HTML-escaped before entering control-plane markup.
- Windows users can start, open, and gracefully stop the local control plane
  through the governed project-bound tray launcher.
- Provider quota, cost, and peak updates atomically refresh current projections,
  append immutable evidence, drive threshold alerts, and retain resolutions.
- Human metric entry cannot claim official automated provenance.
- New capability contracts remain physically isolated candidates until exact
  user activation confirmation; activation never auto-grants an application.
- Gateway validates the active input contract before rate and routing decisions.
- Administrator login uses persistent failure throttling, timing-equalized
  password verification, hashed sessions, CSRF, owned revocation, and all-session
  invalidation on password change.
- Browser responses enforce same-origin content, frame, referrer, permissions,
  MIME-sniffing, and cross-origin isolation policies.
- Delegated agents receive short-lived hashed tokens and only the live
  intersection of their sub-grants and the parent application's grants.
- Capability discovery reports Gateway-observed minute/day usage and remaining
  allowance; application, capability, and agent aggregates remain workspace scoped.
- Idempotent retries replay one durable metadata result without duplicate
  execution or usage, while changed input under the same key is rejected.
- Gateway overload protection bounds request bodies and per-identity/global
  concurrency, returns request IDs and `Retry-After`, and never retries a caller's
  operation implicitly.
- MCP-compatible Agents discover only their live token grants as contract-backed
  tools; every tool call still passes through the same Gateway policy and audit.
- Non-Node runtimes can export a live OpenAPI 3.1 document whose invocation union
  contains only the token's current capability grants and reviewed input schemas.
