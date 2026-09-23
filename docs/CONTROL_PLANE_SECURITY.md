# Control-Plane Security

The local administrator plane and application Gateway use separate identities.
An administrator session cannot be substituted for an application token, and an
application token cannot access administrator endpoints.

## Passwords and login attempts

- Passwords are hashed with scrypt and a random per-account salt.
- Plaintext passwords are never stored or logged.
- Unknown and known usernames execute the same password-verification path.
- Five failures for the same local client and username within 15 minutes cause
  subsequent attempts to return HTTP 429 with `Retry-After: 900`.
- Failure records contain only a SHA-256 login-key fingerprint and timestamp.
- Successful authentication clears the applicable failure history.

## Sessions

- Browser sessions use 256-bit random tokens in HttpOnly, SameSite=Strict cookies.
- SQLite stores only the token hash and CSRF hash.
- Session inventory exposes a random session ID, generic device label, timestamps,
  expiry, and current-session marker; token/client hashes are omitted.
- Revocation requires authentication, CSRF, ownership, and exact confirmation.
- Password rotation verifies the current password and atomically revokes every
  control-plane session, including the caller.

## Browser response policy

All responses include a same-origin Content Security Policy, frame denial,
content-type sniffing denial, no-referrer policy, restricted browser permissions,
and cross-origin opener/resource isolation. Inline styles remain allowed because
the dashboard renders local bar widths dynamically; scripts remain self-only.

## Local-only boundary

The cookie does not use `Secure` because the current service is explicitly bound
to loopback HTTP. Before any remote or public deployment, terminate TLS, enable
Secure cookies, add MFA/SSO, use a production identity provider, implement
distributed throttling, and review trusted-proxy/client-IP handling.

Owner-approved personal deployment override (2026-09-14): login failure-count throttling is disabled. Repeated invalid passwords return 401 without Retry-After; valid passwords are still required. Existing failure records are preserved. Gateway rate limits, quotas, authentication, CSRF and private HTTPS remain enabled.
