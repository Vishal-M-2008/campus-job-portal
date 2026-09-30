---
name: express-rest
description: Implements the Express REST API at /api/v1 with Helmet, CORS, pino, rate limits, Zod, OpenAPI, RBAC, and tenant checks. Use when editing apps/api routes, middleware, or OpenAPI.
---

# Express REST

## Middleware order

1. `requestId` (header `x-request-id`)
2. `pino-http` with that id
3. `helmet`, `cors` allowlist, `cookie-parser`
4. `express-rate-limit` on `/auth/login` and `/auth/register`
5. CSRF on mutating `/api/v1` routes after login
6. routes
7. error middleware (Zod → 400, auth → 401/403, else 500, no stack to client)

## Routes

- Prefix `/api/v1`.
- Validate with Zod. Publish OpenAPI from the same schemas.
- `requireRole("tpo")` style guards.
- Queries always include `tenant_id` except super-admin college routes.

## Errors

JSON `{ error: "snake_case_code", message }` where `message` is safe for the UI.
