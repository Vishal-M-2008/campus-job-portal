---
name: docker-traefik
description: Runs the local Docker Compose stack behind Traefik for web, API, Postgres, and Mailpit. Use when editing Dockerfiles, compose files, or infra/compose.
---

# Docker and Traefik

Compose file: `infra/compose/docker-compose.yml`.

Services: `traefik`, `web`, `api`, `postgres`, `mailpit`. Optional profile `scale` adds `redis` and `worker` for AI queues.

Traefik entrypoint `web` on port 80:

- `PathPrefix(/api)` → `api:3001`
- other paths → `web:5173` (or the built nginx port)

API container command waits for Postgres, runs `knex migrate:latest`, then starts the server. Do not put real secrets in the compose file. Use `${DATABASE_URL}` and a gitignored env file. `.env.example` documents names only.

Health: API `GET /api/v1/health`, web serves `index.html`.
