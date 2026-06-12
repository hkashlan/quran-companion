# Quran Companion — Migration to TanStack Start

Migrating the Expo/React Native app **+** Python/FastAPI backend to a single
TypeScript **TanStack Start** monorepo, modeled on the `clinic2` architecture.

## Locked decisions

| Area | Decision |
|---|---|
| **Delivery** | PWA on Vercel **+** Capacitor native wrapper (Play/App Store). OTA app updates via **Capgo** (free tier). |
| **Push notifications** | **Web Push / VAPID** for the PWA; **FCM/APNs** for Capacitor native. One `push_tokens` table stores both kinds. |
| **Daily scheduler** | **Vercel Cron** → `/api/cron/daily` (replaces the Python `procrastinate` worker + `notification_scheduler`). |
| **Auth** | **better-auth** (email/password + sessions), with `role / points / streak / streakLastDate / language / timezone` as extra `user` fields. |
| **Data** | **Greenfield** — fresh Postgres (Neon free tier or Vercel Postgres), Drizzle migrations from scratch. |
| **Stack extras** | paraglide i18n (AR/EN/DE + RTL), shadcn/ui + Tailwind, `.repo.ts` repositories + server-function layering. |
| **Deferred** | AI/MCP features, Drizzle Studio / ERD GUI tooling. |

## Target architecture (mirrors clinic2)

```
quran-companion-new/
├── package.json            # pnpm + turbo root
├── pnpm-workspace.yaml     # catalog: pinned versions
├── turbo.json
├── biome.json              # lint/format (no ESLint/Prettier)
├── tsconfig.json
├── packages/
│   └── db/                 # @quran/db — Drizzle, no GUI
│       ├── drizzle.config.ts
│       ├── src/
│       │   ├── db.ts
│       │   ├── tables/*.drizzle.ts   # one file per aggregate
│       │   ├── tables/schema.gen.ts  # generated barrel
│       │   ├── repositories/*.repo.ts
│       │   └── validation/*.schema.ts (drizzle-zod)
│       └── drizzle/        # generated SQL migrations
└── apps/
    └── web/                # @quran/web — TanStack Start (Vite + Nitro)
        ├── vite.config.ts
        ├── vercel.json     # cron schedule
        ├── public/         # PWA manifest + push service worker
        └── src/
            ├── routes/     # file-based routing
            ├── lib/auth.ts # better-auth server
            └── server/     # server functions (defineAction)
```

## Schema mapping (FastAPI SQLAlchemy → Drizzle)

13 source tables + 7 enums. UUID PKs preserved for domain tables; `user.id` becomes
better-auth's `text` id (password moves to better-auth `account` table).

| FastAPI model | Drizzle table file | Notes |
|---|---|---|
| `User` | `auth.drizzle.ts` (`user`) | extended better-auth user; `is_email_confirmed`→`emailVerified`, password→`account.password` |
| `PushToken` | `push-token.drizzle.ts` | adds `kind` (webpush \| fcm \| apns) + web-push `endpoint/p256dh/auth` |
| `NotificationDelivery` | `notification-delivery.drizzle.ts` | dedupe_key unique, read tracking |
| `LearningCircle` + `LearningCircleSlot` | `learning-circle.drizzle.ts` | |
| `CircleMembership` | `circle-membership.drizzle.ts` | member/join role enums |
| `JoinRequest` | `join-request.drizzle.ts` | request status enum |
| `ReviewPlan` | `review-plan.drizzle.ts` | |
| `Review` | `review.drizzle.ts` | review status enum |
| `ReviewSubmission` | `review-submission.drizzle.ts` | |
| `SessionRecord` | `session-record.drizzle.ts` | |
| `TeacherInvitation` | `teacher-invitation.drizzle.ts` | invitation status enum |
| `AuditLog` | `audit-log.drizzle.ts` | audit action enum (replaces sqlalchemy-continuum versioning) |

> **Versioning note:** the Python app used `sqlalchemy-continuum` (`__versioned__`) for
> automatic history. There is no drop-in Drizzle equivalent; history is reduced to the
> explicit `audit_logs` table. If full row-history is needed later, add Postgres triggers
> or a `*_versions` shadow-table pattern.

## Backend logic to port (FastAPI services → TS)

These are the parts with real domain complexity — port with care and tests:

- `scoring.py` → points/streak calculation
- `review_cycles.py` + `review_management.py` → assigning/rolling reviews
- `notification_scheduler.py` → daily job that creates due reviews + queues reminders
- `leaderboard.py` → weekly/monthly/overall ranking
- `permissions.py` → teacher/student/circle-owner authorization
- `auth.py` → replaced by better-auth (email confirm + reset via plugins)
- `email.py` → transactional email (Resend free tier recommended)

## Push + scheduler design

**Tokens:** `push_tokens` stores either a Web Push subscription (`endpoint/p256dh/auth`)
or a native FCM/APNs token, discriminated by `kind`.

**Send path:** a single `sendPush(userId, {title, body, data})` helper fans out to all the
user's active tokens — `web-push` lib for VAPID subs, FCM HTTP v1 for native.

**Daily job (`/api/cron/daily`, Vercel Cron @ 00:00 per-region):**
1. Roll review plans → create today's `reviews` (was `notification_scheduler`).
2. Mark overdue reviews `missed`, update streaks.
3. Queue + send circle reminders (`reminder_hours_before_start`).
4. Write `notification_deliveries` rows (dedupe via `dedupe_key`).

Cron auth: header secret (`CRON_SECRET`) checked in the route.

## Screen inventory to rebuild (React Native → React DOM, same look)

Design tokens: primary `#0A7B4F`, secondary `#1B3A5C`, accent `#C8A44E`, bg `#FAFBF9`,
font **Cairo**, single light theme, **RTL-first** (Arabic).

- **Auth:** login (+ email-confirm OTP + not-confirmed state), register (role picker), forgot-password
- **Student tabs:** home/dashboard (stat cards, countdown, active review + submissions, join-by-code), progress (StudentProgressTabs + charts), leaderboard, notifications, settings (language + timezone + detect-from-location)
- **Teacher tabs:** students/circles management (slots, reminders, messaging), requests (approve/reject), leaderboard, notifications, settings
- **Detail/modals:** teacher-student/[id], add-session, assign-review, submit-review, change-password
- **Shared widgets to rebuild:** UiButton/UiText/UiTextInput, VerseSlider, VerseDropdown, TimezoneDropdown, StatsInsightModal (line/bar/donut SVG charts → Recharts), Toast, UpdateBanner, ErrorBoundary

## Phased execution

- [x] **Phase 0 — Foundation:** monorepo scaffold, `packages/db` full schema port, better-auth tables, app skeleton, PWA + push SW, Vercel cron stub, plan doc.
- [x] **Phase 1 — DB + auth live:** install, migrations against local Postgres (docker-compose), better-auth register/login verified, dev seed, Chrome harness.
- [x] **Phase 2 — Domain logic:** scoring / streaks / review-cycle ported as pure functions with 11 passing vitest cases; leaderboard/circle/notification repos.
- [~] **Phase 3 — Screens:** student + teacher tab verticals done (home, leaderboard, notifications, settings, requests) with live data, RTL, AR/EN/DE, Chrome-verified. **Remaining:** progress charts, the 3 review modals, teacher-student detail, full auth screens (email-confirm/reset), change/forgot password.
- [x] **Phase 4 — Push + scheduler:** `/api/cron/daily` runs the real pipeline (roll plans → today's review, mark missed, notify); Web Push subscribe flow + `sendPush`. FCM branch is a documented stub.
- [~] **Phase 5 — Capacitor + OTA:** `capacitor.config.ts` + full runbook ([docs/CAPACITOR.md](docs/CAPACITOR.md)). Native shells/store builds need your accounts.
- [~] **Phase 6 — Cutover:** Vercel deploy + env + cron runbook ([docs/DEPLOY.md](docs/DEPLOY.md)). Actual deploy + domain cutover need your Vercel/Postgres accounts.

## Setup (after this scaffold)

```bash
cd quran-companion-new
pnpm install
cp .env.example .env            # set DATABASE_URL, BETTER_AUTH_SECRET, VAPID keys
pnpm --filter @quran/db db:generate
pnpm --filter @quran/db db:migrate
pnpm dev                        # turbo → apps/web on :3000
```
