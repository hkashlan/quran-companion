---
name: do-issue
description: Work the hkashlan Project board #4 in one of two modes. **Start mode** picks a Backlog/Ready ticket, moves it to In Progress, creates a feature branch attached to the issue, then reads → plans → implements → verifies. **Finish mode** wraps up the branch you're already on — generates a commit message, pushes, and opens a PR if the branch doesn't have one yet. Use when the user wants to "do an issue", "pick a ticket", "work the next ticket", "start an issue", "finish this ticket", "open the PR for this", or names an issue number. Handles GitHub auth via GH_TOKEN_CLINIC, project-board moves, branch/commit/push, and draft-PR creation.
user-invocable: true
---

# Do an issue, end to end

Take a GitHub issue from `hkashlan/clinic` from selection → shipped draft PR.

**Arguments (both optional):**
- An **action**: `start` (pick & implement a ticket) or `finish` (commit + push + draft PR for the current branch).
- An **issue number** (e.g. `/do-issue start 29` or `/do-issue 29`).

§0 (auth) always runs first. Then pick the action (§A) and follow that flow.

## 0. GitHub auth (do this first — the ambient token is invalid)

`gh` and the GitHub MCP both fail with the environment's default `GH_TOKEN`. This
skill authenticates with the **`GH_TOKEN_CLINIC`** environment variable (the same
token `.mcp.json` uses for the GitHub MCP). Prefix every `gh` call by overriding
`GH_TOKEN` with it:

```sh
GH_TOKEN="$GH_TOKEN_CLINIC" gh <args> --repo hkashlan/clinic
```

First, confirm it's set:

```sh
[ -n "$GH_TOKEN_CLINIC" ] && echo "ok (len ${#GH_TOKEN_CLINIC})" || echo "GH_TOKEN_CLINIC not set"
```

If it's missing, ask the user to export `GH_TOKEN_CLINIC` in their shell profile.
The token must have, on `hkashlan/clinic`: **Issues**, **Contents**, **Pull
requests** (read-write) — and, because this skill reads/updates the Project board
(§1), the account-level **Projects (read & write)** permission. (A fine-grained
PAT without "Projects" returns `Resource not accessible by personal access token
(user.projectV2)`; add the permission and re-issue the token.) It's read from the
environment — never commit it or print its value.

The deterministic ceremony (board queries/moves, branch create+push, commit/push/
PR) is factored into [`scripts/`](scripts/) (`board.sh`, `branch.sh`, `finish.sh`,
shared `lib.sh`). They source the token themselves via `lib.sh` — no manual
`GH_TOKEN="$GH_TOKEN_CLINIC"` prefix needed when you call a script. The
judgment-heavy steps (pick, read, plan, implement, verify, write the commit/PR
text) stay in this doc and are yours to do.

## A. Choose the action

If the user already named the action in the argument (`start` / `finish`, or a
synonym like "work" / "implement" → start, "wrap up" / "open the PR" → finish),
use it. Otherwise use **AskUserQuestion** to ask which action to take:

- **Start a ticket** — pick a ticket from the board, move it to In Progress,
  create a branch attached to the issue, then read → plan → implement → verify
  (§1 → §5).
- **Finish the current ticket** — generate the commit message, push, and (if the
  branch has no PR yet) open a PR for the branch you're already on (§6).

Then jump to the matching flow.

---

# START MODE (§1 → §5)

## 1. Pick the issue (from the Project board)

Tickets come from the **GitHub Project board #4**, owner `hkashlan`
(<https://github.com/users/hkashlan/projects/4>). Only consider items in the
**Backlog** or **Ready** Status column. The board ceremony (id resolution, the jq
filters, the card move) lives in [`scripts/board.sh`](scripts/board.sh) — it reads
`GH_TOKEN_CLINIC` itself, so just call it from the repo root:

```sh
.claude/skills/do-issue/scripts/board.sh list   # TSV: itemId  #num  [status] title
```

1. Run `board.sh list` to get the Backlog/Ready issue candidates.
2. If the user named an issue number, pick it. Otherwise present the candidates
   (column + one-line title) and use **AskUserQuestion** to confirm which to
   implement — don't pick silently.
3. **Move the chosen card to "In Progress"** before starting work:
   ```sh
   .claude/skills/do-issue/scripts/board.sh move-issue <n> "In Progress"
   ```
   If the issue isn't on the board, add it first with `board.sh add <n>`, then
   move it. If `board.sh` fails with `Resource not accessible … (user.projectV2)`,
   the token is missing the **Projects** permission — see §0.

## 1b. Create the branch and attach it to the issue

Create the feature branch up front (so all work lands on it) and push it:

```sh
.claude/skills/do-issue/scripts/branch.sh <short-slug> <issue#>   # → feat/<slug>-<n>
```

This links to the issue via `Closes #<n>` on the eventual PR (§6). If the user
wants the branch itself linked in the issue's Development sidebar immediately,
create it through the issue's "Create a branch" UI link instead. Confirm the
branch is checked out before editing any files.

## 2. Read it

```sh
GH_TOKEN=... gh issue view <n> --repo hkashlan/clinic --comments
```
Read the full body, acceptance criteria, and comments. Note anything that depends
on infrastructure that may not exist yet (e.g. RBAC gating, audit logging) — call
those out rather than inventing scope.

## 3. Plan

For anything beyond a trivial change, use an `Explore` agent to map the relevant
code before writing any — identify the existing pattern to mirror (there is almost
always one — e.g. create flow → edit flow, an existing entity → a new entity).
Reserve a full `Workflow` for cases that genuinely need parallel agents (broad
migrations, multi-file fan-out) and confirm with the user before launching one.

Then use **EnterPlanMode**, present a concrete step-by-step plan, and get sign-off
with **ExitPlanMode** before editing. Use AskUserQuestion for genuine forks
(placement, immediate vs explicit save, etc.) — not for things the codebase
already answers.

## 4. Implement (follow repo conventions)

Read root `CLAUDE.md` and `.kiro/steering/*` and honor them:

- **Imports**: Node subpath `#/` for intra-package imports; add the `imports`
  field to a package's `package.json` the first time you introduce `#/` there.
- **React**: no `useMemo`/`useCallback` unless asked. Match surrounding style.
- **UI/design work**: invoke the `clinic-management-design` skill and build with
  `var(--token)` colors and the `ui_kits/management` components — required, not
  optional, for any visual change.
- **i18n (paraglide)**: `apps/management/messages/en.json` is the **full catalog**;
  `ar.json`/`de.json` are intentionally partial and fall back to EN. **Add new keys
  to `en.json` only**, and make sure every new key is actually used (the build
  gates on it — see §5). Use messages via `import { m } from "@/paraglide/messages"`.
- **Server fns / data**: `createServerFn({method:"POST"}).inputValidator(zod).handler`;
  always derive `orgId` via `getCurrentOrgId()` and scope every query by it
  (tenant isolation). Validation schemas live in `packages/db/src/validation`,
  repo in `packages/db/src/repositories`, services in
  `apps/management/src/lib/services`.
- **Forms**: `useAppForm` + `EntityForm`/field components (`field.TextField`,
  `field.RelationField`, …). **Gotcha learned:** for a dialog that edits an
  existing record, seed `defaultValues` from the record and **mount the dialog
  only while open** (`{open ? <Dialog/> : null}`). A post-mount `form.reset()`
  races field subscription and leaves the form blank.

## 5. Verify (don't trust raw `tsc`)

Restart the dev server to regenerate the TanStack route tree **and** paraglide
messages, then confirm the touched pages serve and the gates pass:

```sh
# from apps/management
lsof -ti tcp:3000 | xargs kill 2>/dev/null; (pnpm dev > /tmp/clinic-dev.log 2>&1 &)
# wait for "ready in", then:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/<touched-route>
npm run check:i18n            # build gate: all message keys must be used
```

```sh
# from repo root — format/lint changed files
npx biome check --write <changed paths>
# db package typechecks cleanly; the app's raw `tsc` has repo-wide
# "@clinic/* Cannot find module" noise — filter it out and check only your files:
cd packages/db && npx tsc --noEmit -p tsconfig.json | grep <your-file> || echo clean
```

For behavior changes, verify in a **real browser** via the `chrome-devtools` MCP
(or Playwright). Seed login: `admin@example.com` / `password123`. The app keeps
live connections, so wait on `load`/specific elements, not `networkidle`.

If the change is substantial, run the `code-review` skill on the diff before the PR.

When start mode finishes verification, offer to run **finish mode** (§6) to ship
the PR.

---

# FINISH MODE (§6)

Use this when the user wants to wrap up the branch they're already on: generate a
commit message, push, and open a PR (if one doesn't already exist). First orient
yourself:

```sh
git branch --show-current        # confirm you're on a feature branch, not main
git status --short && git diff --stat
```

Infer the issue number from the branch name (`feat/<slug>-<n>`) or ask. If you're
on `main`, stop and tell the user — finish mode operates on a feature branch.

## 6. Commit + push + PR

**Your two judgment steps, then hand the ceremony to the script:**

1. **Stage ONLY the issue's files** — never commit `.env` (gitignored) or
   local-only tooling like `.mcp.json` / unrelated skill edits. Unstage stray
   files with `git restore --staged <path>`.
2. **Write the commit message and PR body to temp files.** Commit message
   (`/tmp/do-issue-commit.txt`): concise summary `(#<n>)`, a body of what & why,
   and `Closes #<n>`. PR body (`/tmp/do-issue-pr.md`): Summary, what changed,
   Testing (gates run + browser verification), Out-of-scope/follow-ups, and
   `Closes #<n>`. **Do not** add an attribution/`Generated by` line, mention
   Claude, or add `Co-Authored-By` trailers — `finish.sh` appends a
   `Generated by <current git user.name>` line to both the commit and the PR
   automatically.

Then run [`scripts/finish.sh`](scripts/finish.sh) — it commits the staged files,
pushes over the SSH remote, and **opens a non-draft PR only if the branch has
none**. If a PR already exists, the push updates it and this run's PR body is
**appended** to the existing description as an `### Update` section (prior context
is kept):

```sh
.claude/skills/do-issue/scripts/finish.sh <n> "<PR title> (#<n>)" \
  /tmp/do-issue-commit.txt /tmp/do-issue-pr.md
```

If nothing is staged, the script skips the commit and just pushes existing commits.

## 7. Report back

Give the user the PR URL, a short recap of what shipped, anything left
out-of-scope, and offer to watch CI checks.

If the card was moved to **In Progress** in start mode, it stays there. If the
board has a review/done column and the user wants it advanced, move it the same
way as §1.4 using that column's option id — otherwise leave it for the user to
advance on merge.

## 8. Offer the code review (optional — ask first)

The [`review-pr`](../review-pr/SKILL.md) skill is the team review gate, but it's
a long multi-agent run — **do not start it automatically**. After the PR is up,
use **AskUserQuestion** to offer it:

- **Run the review** — invoke it the same way the user would:
  ```
  /review-pr <n>
  ```
  It computes the review surface (branch vs main), runs the multi-agent dimension
  sweep (security, performance, duplication, readability, conventions),
  adversarially verifies findings, and posts the survivors as inline PR comments.
  When it finishes, surface the comment counts by severity and the top findings,
  and offer to apply the confirmed fixes.
- **Skip it** — end the run after §7. Mention the user can trigger it later with
  `/review-pr <n>`.

If the user already said whether they want the review (e.g. "finish and review"
or "skip the review"), honor that and don't ask.
