# Plan: Continuous, page-based, student-paced review (مراجعة)

## Context

Today's review model (ported 1:1 from the old FastAPI app) is **verse-based and
teacher-scheduled**: the teacher defines a full plan (start surah/verse → end
surah/verse + daily amount), and a daily Vercel cron rolls each plan into a
`reviews` row, marking overdue ones `missed`. This is why a student sees nothing
until a teacher assigns a precise verse plan *and* the cron has run — confusing,
rigid, and not what the product wants.

The desired model (confirmed with the user):

- The teacher decides only **X pages/day**, per student.
- The **student** picks the **starting page** and can **change it anytime**.
- Each day the student is reminded to review **X pages from the last page they
  did**; they may review **more**.
- Progress is continuous over the **604 mushaf pages**; on reaching the end it
  **wraps to page 1** and repeats.
- When the student **changes their starting page, the teacher is notified**.

Confirmed design decisions:
1. **On-the-fly from progress** — no pre-created daily review rows; the app
   always computes "next X pages from your last page". Cron only sends reminders.
   No "missed" penalty.
2. **Scoring** — streak = consecutive calendar days with ≥1 review; points = fixed
   amount per page reviewed. Leaderboard stays meaningful.
3. **Pages only** — track mushaf page numbers 1–604 directly (no surah labels).
4. **Per-student** X pages/day; **changing start page notifies the teacher**.

## New domain model

- A student has one active **review plan** holding: `pagesPerDay` (teacher-set),
  `startPage` (student-set anchor, default 1), `currentPage` (last reviewed page;
  null = not started).
- **Today's target** is computed live:
  `from = currentPage ? currentPage+1 : startPage` (wrap `>604 → 1`),
  `to = min(from + pagesPerDay - 1, 604)`. Daily target never wraps mid-range —
  it stops at 604, then the next day starts at 1 (clean display, matches "reach
  the end → repeat").
- A **review session** (the `reviews` row) is created only when the student
  submits: records `fromPage`, `toPage`, `pagesCount`, `reviewedDate`,
  `pointsEarned`. Submitting advances `plan.currentPage = toPage`. The student may
  set `toPage` beyond the target (review more), up to 604.
- "Done today" = a session row exists with `reviewedDate = today`.

## Schema changes (`packages/db/src/tables/`)

- **`review-plan.drizzle.ts`** — repurpose to page model: drop verse fields
  (`startSurahNumber/startVerse/endSurahNumber/endVerse/rangeMode/dailyUnit/
  startPage/endPage`), add `pagesPerDay int`, `startPage int default 1`,
  `currentPage int` (nullable). Keep `studentId/teacherId/isActive`.
- **`review.drizzle.ts`** — repurpose to a completed-session log: drop
  `surahNumber/surahName/verseFrom/endSurahNumber/endSurahName/verseTo/rangeMode/
  startPage/endPage/assignedDate/status` and the `review_status` enum; add
  `fromPage int`, `toPage int`, `pagesCount int`, `reviewedDate date`. Keep
  `studentId/teacherId/reviewPlanId/completedAt/pointsEarned/createdAt`.
- **`review-submission.drizzle.ts`** — **remove** (the `reviews` row now *is* the
  submission record; nothing else references it after the queries rewrite).
  *(Flag if you'd rather keep this table.)*
- **`schema.gen.ts`** — regenerate barrel to drop review-submission export.
- `session-record.drizzle.ts` is the teacher's separate "memorization session"
  log — **out of scope**, left untouched.

## Domain logic (`packages/db/src/domain/`)

- **`review-cycle.ts`** — replace verse math with page math:
  `export const TOTAL_PAGES = 604`; `nextTarget(currentPage, startPage,
  pagesPerDay) → { from, to, count }` (with the wrap/clamp rule above);
  `clampPage(p)`. Remove `VersePosition`/`nextReviewWindow`/`advanceWithinPlan`/
  `nextStartPosition` and the `SURAHS` import.
- **`scoring.ts`** — keep `diffDays`, `nextStreak`, `applyPoints`. Add
  `POINTS_PER_PAGE` const + `pointsForPages(count)`. Remove the lateness-based
  `calculatePoints` (no due dates anymore).
- **`domain.test.ts`** — replace verse-cycle + `calculatePoints` cases with:
  `nextTarget` normal / clamp-at-604 / wrap-604→1 / not-started; `pointsForPages`;
  keep `nextStreak`/`applyPoints` cases.

## Server functions (`apps/web/src/server/queries.ts`)

- **`assignReviewPlan`** → set/update the per-student plan with just
  `{ studentId, pagesPerDay }`; on create, `startPage=1, currentPage=null`.
- **`setStartPage`** (NEW, student) → set `startPage`, reset `currentPage=null`,
  then **notify the teacher** (insert `notificationDeliveries` row +
  `sendPush(plan.teacherId, …)`), reusing the existing notification/push helpers.
- **`getStudentHome`** → from the active plan + `currentPage`, compute today's
  target (`nextTarget`), whether reviewed today, and overall progress
  (`currentPage`/604). Drop the pending/missed `reviews` queries; keep the
  pending-join-requests block added earlier.
- **`submitReview`** → input `{ toPage }` (default = target.to, max 604).
  Compute `fromPage` from the live target, insert a `reviews` session row, set
  `plan.currentPage = toPage`, award `pointsForPages(count)` and update
  streak/points (only the first session of the day touches the streak via
  `nextStreak`). Drop the `reviewSubmissions` insert.
- **`getStudentModalData` / `getSubmitReviewData`** → return the plan + live
  target instead of verse ranges.
- **`getStudentProgress` / `getStudentDetail`** → return page-based session
  history + `pagesPerDay`/`currentPage`.

## Scheduler (`apps/web/src/server/scheduler.ts`)

Rewrite `runDailyScheduler(today)`: for each active plan, compute the live target
and send a **reminder push** ("راجع الصفحات A–B اليوم"), deduped via
`notificationDeliveries.dedupeKey = reminder:<planId>:<today>`. **No** review-row
creation and **no** missed-marking. Keep the `CRON_SECRET`-guarded route
`apps/web/src/routes/api/cron/daily.ts` as-is.

## UI (`apps/web/src/routes/_protected/`)

- **`assign-review.tsx`** (teacher) → replace surah/verse pickers with a single
  "pages per day" number input + student name. Reuse `NumberPicker`/`Button`.
- **`student/index.tsx`** → "Active Review" card shows
  "راجع الصفحات A–B اليوم (عدد X)", a progress line (page N / 604), a **Submit**
  button → `/submit-review`, a done state if reviewed today, and a **"تغيير صفحة
  البداية"** control (NumberPicker 1–604 → `setStartPage`).
- **`submit-review.tsx`** → show the target's `from`, let the student pick the
  page they reached (`NumberPicker`, default target.to, up to 604) → `submitReview`.
- **`progress.tsx`** → render page-session history (from `getStudentProgress`).
- **`lib/i18n.tsx`** → add `review.*` page strings (AR/EN/DE): target, pagesPerDay,
  changeStartPage, reviewedToday, reminder body, teacher-notified, etc.
- `add-session.tsx` (teacher memorization log) is a different feature — untouched.

## Migration & data

Edit the Drizzle tables, then regenerate: `pnpm --filter @quran/db db:generate`
and `db:migrate`. The schema reshape is **breaking** for existing rows; since this
is local test data, the cleanest path is to **reset the dev DB** (drop & re-migrate)
and re-run the updated **`apps/web/scripts/seed.ts`** (page-based plans with some
`currentPage` progress + a few completed session rows). Confirm
`packages/db/src/repositories/leaderboard.repo.ts` and
`packages/db/src/validation/review.schema.ts` only reference surviving fields and
adjust if needed.

## Out of scope

Teacher "memorization sessions" (`session-record` / `add-session`), surah/verse
display for pages, multi-circle plans.

## Verification

1. `pnpm --filter @quran/db test` — domain unit tests (nextTarget wrap/clamp,
   pointsForPages, streak) pass.
2. `pnpm typecheck` (web app clean aside from the 3 pre-existing unrelated errors)
   + `pnpm exec biome check` on touched files.
3. Reset + seed the local DB; `pnpm dev`, then in Chrome:
   - Teacher: set a student's pages/day.
   - Student: see "review pages A–B today", change start page → confirm the
     teacher receives a notification; submit reaching a page → points/streak
     update and tomorrow's target continues from there.
   - Set `currentPage` near 604 and verify the target wraps to page 1.
   - `curl -H "authorization: Bearer $CRON_SECRET" localhost:PORT/api/cron/daily`
     → returns reminder counts, sends a "review pages A–B" push, creates no rows.
