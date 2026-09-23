# Provider Onboarding Standard

Provider onboarding creates four records in one database transaction: provider
metadata, encrypted credential, initial quota snapshot, and audit event. If any
record fails, the complete operation rolls back.

## Required metadata

- Stable lowercase provider ID.
- Human-readable name and category.
- Official website, documentation, developer console, and API base URLs.
- Separate `development` or `sandbox` credential environment.
- Write-only credential value.
- Remaining quota percentage, unit, and provenance.

All URLs must use HTTPS. Embedded URL usernames/passwords are rejected. API base
URLs cannot contain a query string or fragment. Recording an API base does not
authorize API Hub to call it; live adapters require a separate egress decision.

## Quota truth

Initial quota provenance may be only:

- `manual`: entered from a human-observed source;
- `estimated`: calculated or inferred;
- `unknown`: no trustworthy source yet.

Do not label manually entered data as `provider_api`. That label is reserved for
a future adapter that actually obtains and timestamps an official provider
response.

## Credential handling

The browser sends the credential once to the authenticated same-origin API under
CSRF protection. The server encrypts it with AES-256-GCM using workspace and
provider context as authenticated data. HTTP responses, inventory views, audit
events, logs, and database projections contain only status and fingerprint.

The local key file is not a production KMS. Real production credential migration,
backup, export, or cloud deployment requires explicit confirmation and a reviewed
key-custody plan.
