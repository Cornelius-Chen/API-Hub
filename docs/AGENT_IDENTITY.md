# Delegated Agent Identity

An agent is a short-lived child identity of one API Hub application. It never
receives a provider credential and cannot gain a capability that its parent
application does not already hold.

## Lifecycle

1. Register an agent under one active application.
2. Select a non-empty subset of that application's enabled capability grants.
3. Set the agent lifetime from 1 to 720 hours.
4. Issue a separately labeled token for one runtime, valid for at most 168 hours
   and never beyond the agent's own expiry.
5. Discover capabilities and invoke Gateway v1 with that token.
6. Revoke the token when the runtime stops or exposure is suspected.

For MCP-compatible runtimes, use the packaged `api-hub-mcp` bridge described in
`AGENT_MCP_INTEGRATION.md`. It converts the live delegated capability manifest
into model-discoverable tools without exposing provider credentials.

Agent tokens begin with `ah_agent_`, are shown once, and are stored only as
SHA-256 hashes. Discovery returns the intersection of current application grants
and agent grants. Consequently, revoking an application grant removes the
capability from every child agent immediately without rewriting agent records.

## Gateway identity

Gateway responses include:

```json
{
  "identity": {
    "type": "agent",
    "agentId": "research-worker"
  }
}
```

Invocation records retain `identityType`, `agentId`, token ID, application ID,
capability, policy decision, route and latency. They do not retain the token or
request input.

## Control-plane safeguards

- Agent creation and token issuance require an authenticated administrator,
  same-origin request and CSRF token.
- Cross-workspace applications are not selectable or addressable.
- Token inventory exposes label, prefix, fingerprint and timestamps only.
- Revocation is confirmed and takes effect on the next request.
- Expired or inactive agent identities receive `401` before policy execution.
