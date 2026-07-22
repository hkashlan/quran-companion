# Dokploy deployment — quran-web

The `@quran/web` SSR app + its Postgres database, deployed to the Dokploy server
at https://dokploy.myclinic-sy.cloud as a **Compose** service.

- **Project**: `quran-companion` (`SggSGc56xHBJ8yhS3H74P`)
- **Compose**: `quran-web` (`NKMfiD4d2IK72uqrBR119`)
- **Git source**: `hkashlan/quran-companion` @ `main`, GitHub app `Dokploy-hkashlan`
- **Compose path**: `infra/dokploy/docker-compose.yml`
- **Build**: root [`Dockerfile`](../../Dockerfile) (node:22 slim, `pnpm --filter @quran/web build`)

The stack: a `web` container (Nitro node-server on :3000, runs `drizzle-kit migrate`
on start) and a `db` container (postgres:16, volume `quran_db`). See the compose
file for the full env surface.

## Before the first deploy — required manual steps

1. **Push these files** (`Dockerfile`, `infra/dokploy/`) to `main`, or Dokploy
   has nothing to clone.
2. **Grant repo access**: the `Dokploy-hkashlan` GitHub app installation must be
   able to see `hkashlan/quran-companion` (it currently only sees `hkashlan/clinic`).
   GitHub → Settings → Applications → Dokploy → configure → add the repo.
3. **Domain / DNS**: no domain is attached yet. Attach one in the Dokploy UI
   (Compose → Domains → service `web`, port `3000`) and point its DNS A record at
   the Dokploy server. Do NOT repoint `www.quran-companion.de` until you're ready
   to move production off Vercel — `BETTER_AUTH_URL` / `VITE_BETTER_AUTH_URL` are
   set to that domain, so use a staging host first if you want to test.

## Environment

Env vars are stored on the compose service in Dokploy (seeded from
`apps/web/.env.production.local`). `POSTGRES_PASSWORD` was generated fresh and
`DATABASE_URL` inside the stack points at the internal `db` service — it does NOT
use Neon. To change a value, edit it in the Dokploy UI (Compose → Environment)
and redeploy.

## Deploy

Push to `main` (auto-deploy is on) or trigger manually:

```sh
curl -sS -X POST -H "x-api-key: $DOKPLOY_API_KEY" -H 'Content-Type: application/json' \
  "$DOKPLOY_URL/api/compose.deploy" -d '{"composeId":"NKMfiD4d2IK72uqrBR119"}'
```
