# API Hub Agent Instructions

Read `CCOS/START_HERE.md`, then `CCOS/CONTROL_INDEX.yaml` before any task.

API Hub is the controlled API capability layer for the user's SaaS products and
agents. Provider secrets must never enter browser code, logs, fixtures, source
control, screenshots, or agent-visible responses.

Before modifying product files, read
`CCOS/01_domains/api_hub/domain_master.yaml` and `PRODUCT_CONTRACT.md`.

Hard rules:

- Applications request capabilities; they do not receive provider secrets.
- Secret writes are write-only. Secret reads return status and fingerprint only.
- Do not implement an unrestricted arbitrary-URL proxy.
- Development, test, and production credentials remain separate.
- Every invocation must have an application, environment, capability, policy
  decision, provider route, usage record, and audit outcome.
- Estimated quota or balance data must be labeled estimated, never official.
- Any real credential migration, cloud deployment, billing mutation, or public
  exposure requires explicit user confirmation.
- `data/runtime/**` is the governed local database zone. It may contain
  synthetic records and future encrypted ciphertext, never plaintext secrets.
