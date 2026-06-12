# Phase 6 — Deploy to Vercel + cutover

> Needs your accounts: a Vercel project and a managed Postgres (Neon free tier or
> Vercel Postgres). The cron job and build are already configured in-repo.

## 1. Database

Create a Postgres (Neon free tier recommended) and run migrations against it:

```bash
DATABASE_URL="postgres://…neon…/quran?sslmode=require" \
  pnpm --filter @quran/db db:migrate
```

(Seeding is dev-only; production starts empty and fills via registration + the
daily scheduler.)

## 2. Vercel project

- **Import** the GitHub repo `hkashlan/quran-companion` into Vercel.
- **Root directory:** `apps/web`
- **Framework preset:** Other (TanStack Start builds via Vite + Nitro; the Vercel
  preset is auto-selected by Nitro when building on Vercel).
- **Build command:** `pnpm build` · **Install:** `pnpm install` (repo uses pnpm
  workspaces + catalog).
- **Output:** Nitro emits the Vercel build output automatically.

## 3. Environment variables (Vercel → Settings → Environment Variables)

| Var | Notes |
|---|---|
| `DATABASE_URL` | Neon/Vercel Postgres connection string |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | the production URL, e.g. `https://quran-companion.vercel.app` |
| `VITE_BETTER_AUTH_URL` | same production URL (client) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | from `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:hkashlan@gmail.com` |
| `CRON_SECRET` | `openssl rand -hex 32` — also used to authorize the cron route |
| `RESEND_API_KEY` / `EMAIL_FROM` | transactional email (email confirm / reset) |
| `FCM_*` | only for Phase 5 native push |

## 4. Cron

`apps/web/vercel.json` already declares the daily job:

```json
{ "crons": [{ "path": "/api/cron/daily", "schedule": "0 0 * * *" }] }
```

Vercel Cron calls it daily; the route checks `Authorization: Bearer $CRON_SECRET`.
(On Vercel, configure the cron to send that header, or move the secret check to a
query param if you prefer — Vercel cron supports custom headers on Pro.)

## 5. Cutover from the FastAPI backend

1. Stand up the new app on Vercel pointing at a fresh Postgres (greenfield —
   accounts re-register; no data migration was requested).
2. Smoke-test register → login → home → leaderboard → cron on the deployed URL.
3. Point the domain at Vercel.
4. Decommission the Python backend + its Postgres and the Expo/EAS build pipeline.

## Status / parity checklist

- [x] Auth (register/login/sessions) — better-auth
- [x] Student: home, leaderboard, notifications, settings
- [x] Teacher: circles, requests, leaderboard, notifications, settings
- [x] Daily scheduler (reviews roll-forward, missed, notify) — Vercel Cron
- [x] Web Push subscribe + send
- [ ] Screens still to port: progress charts, assign-review / add-session /
      submit-review modals, teacher-student detail, auth email-confirm + reset,
      change-password, forgot-password
- [x] Email provider wiring (Resend) for confirm/reset — set `RESEND_API_KEY` +
      `EMAIL_FROM`; without a key it falls back to logging the OTP (dev)
- [ ] Native (Capacitor) — see CAPACITOR.md
