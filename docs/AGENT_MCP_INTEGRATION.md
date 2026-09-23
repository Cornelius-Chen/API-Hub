# Agent MCP Integration

API Hub includes a zero-dependency stdio MCP server for local Agent hosts. It
uses an application or delegated-agent token to fetch the live capability
manifest, then exposes only those grants as MCP tools. Tool names are the stable
business capabilities, such as `ai.text.generate`; provider names, URLs, models,
and credentials are not Agent inputs.

## Build and locate

```powershell
cd D:\Creativity\API_Hub
npm run build:sdk
```

After installing `dist/local-api-hub-client-0.1.0.tgz`, the executable is
`api-hub-mcp`. The Portable archive also contains both its runtime and bridge:

```text
runtime\node.exe
src\sdk\node\mcp.js
```

## Host configuration

Use the MCP host's environment configuration rather than command-line arguments:

```json
{
  "command": "api-hub-mcp",
  "env": {
    "API_HUB_URL": "http://127.0.0.1:4310",
    "API_HUB_APP_TOKEN": "<one-time application or agent token>",
    "API_HUB_TIMEOUT_MS": "30000"
  }
}
```

For the Portable build, set `command` to its bundled `runtime\\node.exe` and
set `args` to the absolute path of `src\\sdk\\node\\mcp.js`.

Treat the host configuration as a secret-bearing file: restrict its filesystem
permissions, never commit it, and issue a separate short-lived agent token for
each autonomous runtime. This token can invoke only its explicit API Hub grants;
it cannot retrieve any provider credential.

## Protocol behavior

- Supports protocol negotiation for `2025-06-18`, `2025-03-26`, and
  `2024-11-05` over newline-delimited stdio JSON-RPC.
- `tools/list` refreshes the live API Hub manifest, including each capability's
  JSON Schema input contract and remaining allowance.
- `tools/call` rechecks the live manifest before invocation, so grant or token
  revocation takes effect without restarting the Agent.
- Policy failures are MCP tool errors with safe structured fields: `status`,
  `reason`, `requestId`, `retryAfter`, and `retryable`.
- Unknown or ungranted tool names are rejected before Gateway invocation.
- Standard output contains MCP JSON-RPC only; diagnostics never include tokens.

The MCP bridge does not add permissions. Application state, delegated grants,
input contracts, budget, RPM, daily allowance, concurrency, routing, execution
gate, usage records, and audit remain enforced by Gateway v1.
