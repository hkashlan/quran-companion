# Dokploy schedules

The Vercel **Hobby** plan only allows cron jobs that run **once per day**. Anything
that needs to run more often is scheduled from Dokploy instead, using a native
`dokploy-server` schedule that simply `curl`s the corresponding API route.

| Route | Cadence (UTC) | Where it runs |
| --- | --- | --- |
| `/api/cron/daily` | `0 0 * * *` (once/day) | Vercel Cron (`apps/web/vercel.json`) |
| `/api/cron/teacher-summary` | `0 16-18 * * *` (hourly, 3×/day) | Dokploy schedule |

Each route is protected by the `CRON_SECRET` bearer token, so the Dokploy
schedule sends `Authorization: Bearer $CRON_SECRET`.

## Recreate / update

Requires `DOKPLOY_URL` and `DOKPLOY_API_KEY` (already in `~/.zshrc`) plus
`CRON_SECRET` (value lives in `apps/web/.env.production.local`, matching the
Vercel env var). Then:

```sh
CRON_SECRET=<secret> ./infra/dokploy-teacher-summary-schedule.sh
```

The script is idempotent: it deletes any existing schedule with the same name
before creating a fresh one. To disable it, set `enabled: false` via the API or
toggle it in the Dokploy UI (Schedules).

## Current schedule

- **id**: `nup4EHp6O6oUaMCc4khLT`
- **name**: `quran teacher-summary (hourly 16-18 UTC)`
- **cron**: `0 16-18 * * *`
- **command**: `curl -sS --fail --max-time 60 -H 'Authorization: Bearer $CRON_SECRET' https://www.quran-companion.de/api/cron/teacher-summary`

> Note: Dokploy runs cron in the server's timezone. This host is UTC, matching
> the endpoint's use of `now.getUTCHours()`. If the host timezone changes, adjust
> the cron expression or set `timezone` on the schedule.
