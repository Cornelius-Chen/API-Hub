# Gateway Idempotency

SaaS backends, workers, queues, and agents should attach one stable
`Idempotency-Key` when an invocation may be retried. The key must contain 8-200
visible ASCII characters and should be unique to the caller's logical operation.

```http
POST /gateway/v1/invoke
Authorization: Bearer <application-or-agent-token>
Idempotency-Key: order-018fd1c0-...
Content-Type: application/json
```

The first request executes normal identity, contract, budget, grant, rate, route,
usage, and audit decisions. Its metadata response is stored for 24 hours. A
matching retry returns the same `requestId`, adds `replayed: true`, and sends the
`Idempotency-Replayed: true` response header. It does not invoke the execution
engine again or create another usage record.

Each replay increments a metadata-only counter and last-replayed timestamp.
`GET /api/usage` reports how many duplicate executions were avoided today, while
`GET /api/idempotency` exposes safe lifecycle metadata without key hashes or
request fingerprints.

## Scope and conflicts

Keys are scoped by workspace and logical identity. Separate applications or
agents may safely use the same text. Multiple tokens belonging to the same
application or agent share the same idempotency namespace.

Reusing a key with a different capability or input returns:

```json
{ "reason": "idempotency_conflict" }
```

An overlapping concurrent request returns `idempotency_in_progress`; the caller
may retry after the first request finishes. Pending claims older than five
minutes are reclaimed, while completed records expire after 24 hours.

## Privacy and durability

API Hub stores only an HMAC of the key, an HMAC request fingerprint, request ID,
status, and its metadata-only Gateway envelope. It does not store the key, token,
input, prompt, payload, or Provider output. Invocation accounting and completion
of the idempotency record commit in one SQLite transaction. Completed replays
survive service restarts.

Current dry-run responses contain metadata only. Before a live adapter can return
Provider content, its response retention and encrypted replay design must be
reviewed explicitly; the idempotency table must not become a payload store.
