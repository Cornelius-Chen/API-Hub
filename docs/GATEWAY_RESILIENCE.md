# Gateway Resilience Contract

API Hub applies fixed local safety bounds before any capability execution:

- request body: 32 KB maximum;
- request-body read deadline: 5 seconds;
- active calls: 4 per logical application or agent identity;
- active calls: 16 across the local Gateway process.

An overloaded identity or process receives `429 gateway_overloaded` with
`Retry-After: 1`. RPM and daily exhaustion also return 429 with an appropriate
`Retry-After`. Oversized input returns `413 request_body_too_large`; an incomplete
body that exceeds the read deadline returns `408 request_body_timeout`. JSON
errors include a `requestId`, also returned as `X-Request-Id`.

The Node SDK defaults to a 30-second client deadline. Configure it globally or
for one call, and pass an `AbortSignal` when the caller owns cancellation:

```js
const hub = new ApiHubClient({
  baseUrl: process.env.API_HUB_URL,
  token: process.env.API_HUB_APP_TOKEN,
  timeoutMs: 30_000,
});

const controller = new AbortController();
const result = await hub.invoke("ai.text.generate", input, {
  idempotencyKey: job.id,
  timeoutMs: 10_000,
  signal: controller.signal,
});
```

`ApiHubError` exposes `status`, `reason`, `requestId`, `retryAfter`, and
`retryable`. The SDK does not automatically retry. A caller may retry only after
checking `retryable`, honoring `retryAfter`, and reusing the same idempotency key
for the same logical operation. Never retry contract, permission, credential, or
caller-cancellation failures as if they were transient.
