# DeepSeek development activation

DeepSeek live invocation is authorized only for the local `development`
environment and the `ai.structured.generate` capability. The reviewed adapter
fixes all of these values server-side:

- provider: `deepseek`
- origin: `https://api.deepseek.com`
- endpoint: `POST /chat/completions`
- model: `deepseek-v4-flash`
- mode: non-thinking JSON output
- capability: `ai.structured.generate`

Callers cannot submit a provider URL, endpoint, model, credential, or arbitrary
headers. The adapter accepts a bounded `prompt`, optional bounded `system`, and
bounded `maxTokens`. It validates the response as one JSON object before it is
returned.

## Credential custody

The provider key is stored only as an AES-256-GCM envelope in
`data/runtime/api-hub.sqlite`. The separate vault key remains in
`data/runtime/vault.key`. HTTP APIs expose only credential status and a one-way
fingerprint. The calling application receives an `ah_dev_` identity token; API
Hub stores only its SHA-256 hash.

## Activation and recovery

`data/runtime/live-activation.json` is the explicit local authorization record.
If it is absent, malformed, or does not match the reviewed provider,
environment, origin, and capability allowlist, API Hub starts in `dry_run`.
Deleting or renaming that file and restarting the service is the immediate
kill switch.

The authorized migration command reads the source environment file inside the
Node process and never accepts or prints the secret value:

```powershell
npm run activate:deepseek:dev -- --source-env <existing-server-env-file> --target-env <calling-app-env-file>
```

The target environment file must remain server-side and Git-ignored. Validate a
running service without printing either credential:

```powershell
npm run smoke:deepseek:dev -- --env <calling-app-env-file>
```

Provider outputs are returned to the caller but not written to invocation,
audit, or idempotency storage. Audit records retain only identity, decision,
route, execution mode, units, and latency.
