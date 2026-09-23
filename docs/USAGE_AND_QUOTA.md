# Usage, Quota, Cost, and Peak Evidence

API Hub separates the current provider projection from append-only evidence:

- `quota_snapshots` contains the latest remaining/used projection for fast reads.
- `providers` contains the latest month cost and peak RPM projection.
- `provider_metric_history` preserves every accepted snapshot.
- `alerts` records threshold decisions and their resolution lifecycle.

Updating a provider writes the current projection, immutable history, alerts, and
audit event in one transaction.

## Provenance

Human control-plane updates may use only:

- `manual` for a value transcribed from a known human-observed source;
- `estimated` for an inferred or calculated value;
- `unknown` when no reliable source is available.

The UI and human endpoint cannot claim `provider_api`, `billing_import`, or
`response_headers`. Those labels are reserved for future governed adapters that
can attach actual collection evidence and timestamps.

## Alerts

- Remaining quota from 11% through 20% opens a warning.
- Remaining quota at or below 10% opens or upgrades a critical alert.
- Remaining quota above 20% resolves the open low-quota alert.
- Unknown provenance opens an informational alert.
- Replacing unknown provenance resolves that informational alert.

Resolved alerts are retained. They are evidence, not disposable notifications.

## Gateway-observed usage

API Hub independently derives application, capability, and delegated-agent
usage from metadata-only `invocation_records`. `GET /api/usage` returns the
current UTC-day decision count, allowed and denied counts, policy units, average
latency, application peak RPM, and last invocation time. These values are labeled
`gateway_observed`; they are operational evidence, not provider billing truth.

`GET /gateway/v1/capabilities` attaches live policy consumption to every
discoverable capability:

```json
{
  "usage": {
    "source": "gateway_observed",
    "minute": { "used": 7, "limit": 30, "remaining": 23 },
    "day": { "used": 118, "limit": 1000, "remaining": 882 }
  }
}
```

Only allowed decisions consume RPM and daily grants. Denied decisions remain in
reliability and risk statistics but do not reduce remaining policy allowance.
Agent usage shares its parent application's counters, preventing multiple agent
tokens from bypassing application limits.

## Privacy

Metric history stores provider identity, percentages, cost, peak RPM, provenance,
and capture time. It does not store API credentials, Gateway request inputs,
provider response bodies, prompts, or application payloads.
