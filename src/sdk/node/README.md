# @local/api-hub-client

Server-side Node.js SDK and CLI for the local API Hub. Provider credentials are
never accepted by this package; callers use an API Hub application token and a
stable capability identifier.

```js
const { ApiHubClient } = require("@local/api-hub-client");
const { randomUUID } = require("node:crypto");

const hub = new ApiHubClient({
  baseUrl: process.env.API_HUB_URL,
  token: process.env.API_HUB_APP_TOKEN,
});

const manifest = await hub.capabilities();
console.log(manifest.capabilities[0].usage.minute.remaining);
const tokenScopedOpenApi = await hub.openapi();
const result = await hub.invoke("ai.text.generate", { prompt: "hello" }, {
  idempotencyKey: randomUUID(),
});
```

CLI:

```text
api-hub capabilities
api-hub openapi
api-hub invoke ai.text.generate --input-json "{\"prompt\":\"hello\"}"
```

MCP server for Codex, Claude Desktop, and other local MCP hosts:

```json
{
  "command": "api-hub-mcp",
  "env": {
    "API_HUB_URL": "http://127.0.0.1:4310",
    "API_HUB_APP_TOKEN": "<one-time application or agent token>"
  }
}
```

The MCP server exposes only the token's currently granted capabilities as tools.
