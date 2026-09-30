---
name: auth-security
description: Implements email and password auth with Argon2id, cookie sessions, lockout, CSRF, and audit logs. Use when editing login, sessions, passwords, or auth middleware.
---

# Auth security

- Hash with Argon2id. Compare with `argon2.verify`. Pepper is `PASSWORD_PEPPER` (placeholder in examples).
- Session id is random. Store only the SHA-256 hash. Cookie `sid` is HttpOnly, SameSite=Lax. Set `Secure` when `COOKIE_SECURE=true`.
- CSRF cookie `csrf` is not HttpOnly. Mutating requests send header `x-csrf-token` equal to that cookie.
- Lockout: 5 failures sets `locked_until` 15 minutes ahead. Tests use `password-is-not-real` and a wrong password.
- Rate-limit login by IP.
- Audit `auth.login`, `auth.login_failed`, `auth.logout`, and admin imports. Do not log passwords or tokens.
- Password reset stores a hash of the token and emails a link through the SMTP adapter.
- Optional HIBP k-anonymity only when `HIBP_ENABLED=true`.
