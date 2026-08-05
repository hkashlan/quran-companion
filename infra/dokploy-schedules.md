# Dokploy schedules

Both cron routes are triggered by native `dokploy-server` schedules that `curl`
the corresponding API route with the `CRON_SECRET` bearer token.

| Schedule | Cron (UTC) | Route |
| --- | --- | --- |
| `quran daily scheduler (00:00 UTC)` | `0 0 * * *` | `/api/cron/daily` |
| `quran teacher-summary (hourly 16-18 UTC)` | `0 16-18 * * *` | `/api/cron/teacher-summary` |

Command shape (one line; `CRON_SECRET` value from `apps/web/.env.production.local`):

```sh
curl -sS --max-time 300 -w ' HTTP_STATUS:%{http_code} ' -H 'Authorization: Bearer <CRON_SECRET>' https://quran-companion.de/api/cron/daily 2>&1
```

- No `--fail`, and stderr folded into stdout, so the schedule run log always
  shows the HTTP status / body / curl error instead of appearing empty.
- Each handler also logs `[cron/…] request received` and a summary line to the
  app console, so the container Logs tab independently confirms every run.

## Maintain via the Dokploy UI ONLY

**Create and edit these schedules by pasting the command into the Dokploy UI
(Schedules), never via the `schedule.create` API.** Schedules created through
the API on 2026-07-27 looked correct in `schedule.list` but had no working
command stored — every run logged only "Initializing schedule" and executed
nothing. Re-pasting the same command through the UI fixed it instantly. Until
that Dokploy bug is understood, treat API-created schedules as broken.

If you rotate `CRON_SECRET` (app Environment in Dokploy), update the embedded
token in both schedule commands by hand.

## Pitfalls (learned the hard way, 2026-07-23 → 2026-07-27)

- **Target the apex** `quran-companion.de`. `www.` 301s to the apex
  (`apps/web/src/server.ts`) and curl does not follow redirects here — the old
  teacher-summary schedule pointed at `www.` and died silently when the www
  redirect shipped on 2026-07-23.
- `/api/cron/daily` originally ran on **Vercel Cron** (`apps/web/vercel.json`,
  now vestigial) and silently stopped when the app moved to Dokploy — for four
  days reviews were only created lazily when a student opened the app.
- Dokploy runs cron in the server's timezone (this host is UTC, matching the
  endpoints' use of UTC dates/hours). If the host timezone changes, adjust the
  cron expressions.
- A quick health check: every scheduled daily run must insert `review_assigned`
  rows in `notification_deliveries` at ~00:00 UTC; the 16-18 UTC teacher runs
  insert `student_not_finished` rows. Silence in that table means the trigger
  is broken again.
