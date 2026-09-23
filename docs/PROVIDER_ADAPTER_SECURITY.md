# Provider Adapter Security Gate

API Hub now routes every allowed Gateway invocation through one execution
engine. The engine defaults to `dry_run`; it plans the governed provider route
but does not resolve a credential, invoke an adapter, or send network traffic.
Live mode is unlocked only by a validated runtime activation record plus a
reviewed provider adapter.

## Enforced boundary

- Provider API bases must use HTTPS and the standard HTTPS port.
- Embedded URL credentials, localhost, and literal IP targets are rejected.
- Each adapter declares one provider ID and exact allowed origins.
- Unregistered providers cannot execute in live mode.
- Live execution requires a separate gate in addition to adapter registration.
- Adapter timeouts are bounded and transient retries are limited to two.
- Dry-run never asks the credential resolver for a plaintext secret.
- Gateway responses expose execution status, not credentials or request bodies.

The authenticated Security view and `GET /api/security/execution` show the
current mode, gate state, egress policy, timeout, retry limit, and registered
provider adapters.

## Live activation checklist

For each provider, activation requires all of the following:

1. A provider-specific adapter with fixed capability-to-endpoint mappings.
2. Exact reviewed HTTPS origins; no caller-supplied URL or unrestricted proxy.
3. Server-side credential decryption scoped to workspace and provider.
4. Input translation, output validation, redaction, and retention review.
5. Provider-specific timeout, retry, idempotency, and rate-header handling.
6. Synthetic and sandbox tests proving no secret or payload logging.
7. Explicit user confirmation for the named environment and provider.

Setting an environment variable is intentionally insufficient to unlock live
traffic. This prevents a copied launch script or accidental deployment setting
from silently converting the local control plane into a production proxy.

The current reviewed live scope is only DeepSeek in `development`, only
`ai.structured.generate`, and only the exact `https://api.deepseek.com` origin.
All other providers, environments, and capabilities remain denied by the live
authorization layer.
