---
name: knex-postgres
description: Runs Knex migrations and seeds for PostgreSQL, including CI on an empty database and a Kubernetes migrate Job. Use when editing knexfile, migrations, seeds, or schema.
---

# Knex and Postgres

## Files

- `apps/api/knexfile.js` environments: `development`, `test`, `production`. Connection from `DATABASE_URL`.
- Migrations: `apps/api/migrations/YYYYMMDDHHMMSS_short_name.js`.
- Seeds: `apps/api/seeds/01_demo.js`.

## Commands

- `npm run migrate -w api` → `knex migrate:latest`
- `npm run migrate:rollback -w api` local and test only
- `npm run seed -w api` → demo college

## Rules

- College tables: `tenant_id` uuid not null, index `(tenant_id, id)`.
- Bind values. No string-built SQL.
- CI: start Postgres, `migrate:latest`, then tests.
- Kubernetes: Job `migrate` completes before API rollout.
- Production never auto-rolls back. Ship a forward migration.

Demo seed password is the fake string `password-is-not-real`.
