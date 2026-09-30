# Campus Job Portal

Multi-college placement portal for students, placement offices, recruiters, faculty, and alumni.

## Local API and web

Install Node.js 22. Copy `.env.example` to a private env file if you want overrides. Tests start an embedded Postgres when `DATABASE_URL` is unset.

```bash
npm install
npm test
npm run migrate -w api
npm run seed -w api
npm run dev -w api
npm run dev -w web
```

Demo password for seeded users is the fake value `password-is-not-real`. Super-admin email is `admin@platform.local` (no college slug). Students use slug `srm`.

## Docker

From `infra/compose`:

```bash
docker compose up --build
```

Traefik serves the web app on port 80 and sends `/api` to the API. Postgres, Mailpit, and optional Redis (`--profile scale`) are included.

## Import

```bash
npx tsx scripts/onboard-college.ts <college-uuid> users.csv
```

CSV headers: `email,name,role,department,batch`.
