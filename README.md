# Quran Companion

A TanStack Start rewrite of the Quran memorization companion (teacher/student circles,
review plans, sessions, leaderboards, push reminders) — replacing the previous Expo/React
Native app **and** Python/FastAPI backend with a single TypeScript monorepo.

> **Status: Phase 0 — foundation scaffold.** The database schema, auth tables, and app
> skeleton are in place. Screens and domain logic are ported in later phases. See
> [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) for the full roadmap.

## Stack

- **TanStack Start** (Vite + Nitro) — SSR React full-stack framework
- **Drizzle ORM** + Postgres — `packages/db`
- **better-auth** — email/password + sessions
- **shadcn/ui + Tailwind v4** — UI
- **paraglide** — i18n (Arabic / English / German, RTL-first)
- **pnpm + turbo** — monorepo
- **Biome** — lint + format
- **Vercel** (PWA) + **Capacitor** (native, OTA via Capgo)

## Layout

```
packages/db    @quran/db   — Drizzle schema, repositories, migrations
apps/web       @quran/web  — TanStack Start app + Vercel cron + PWA push
```

## Getting started

```bash
pnpm install
cp .env.example .env        # fill DATABASE_URL, BETTER_AUTH_SECRET, VAPID keys
pnpm --filter @quran/db db:generate
pnpm --filter @quran/db db:migrate
pnpm dev                    # apps/web on http://localhost:3000
```
