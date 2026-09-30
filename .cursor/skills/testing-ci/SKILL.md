---
name: testing-ci
description: Writes meaningful outcome tests and CI gates for tenant isolation, the TPO job gate, auth lockout, policy reasons, and UI state. Use when adding features, tests, OpenAPI checks, or GitHub Actions.
---

# Testing and CI

## What counts

Assert status, JSON `error` code, a row's `tenant_id`, a policy `reason`, or visible UI text after an action. Use fake password `password-is-not-real`. Never call production.

## API

Vitest + supertest against `createApp()`. Test database from `DATABASE_URL`. Migrate before the suite.

Required cases when those features exist:

- College A token cannot read college B's job (404 or empty).
- Student gets 404 `job_not_visible` for a submitted, unapproved job.
- Wrong password returns 401. Sixth attempt returns 423 `account_locked`.
- Apply with CGPA under the policy minimum returns 422 and `reason: "cgpa_below_minimum"`.

## Web

Testing Library: after login submit, the student heading or error text is in the document. Do not snapshot the page as the only assertion.

## CI

`.github/workflows/ci.yml`: Postgres service, `npm ci`, lint, typecheck, migrate, test. A failing test fails the job.
