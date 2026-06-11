---
name: review-pr
description: Team code-review gate for a pull request on hkashlan/clinic. Computes the review surface (branch vs main), runs a multi-agent review across security/performance/duplication/readability/conventions, adversarially verifies findings, and posts them as inline PR comments (or a single summary comment). Use when the user wants to "review this PR", "review the branch", "do a team review", "leave review comments", or names a PR number. Complements the built-in /code-review by adding the GitHub posting + team conventions; for a quick local-only pass prefer /code-review.
user-invocable: true
---

# Review a PR (team gate)

Take the current branch (or a named PR) and produce a verified, conventions-aware
review that lands as comments on the GitHub PR — the shared collaboration gate so
every teammate gets the same review bar.

**Arguments (all optional):**
- A **PR number** (e.g. `/review-pr 31`). If omitted, infer from the current branch.
- A **mode**: `inline` (one comment per finding, default) or `summary` (one grouped
  comment). `--no-post` runs the review but posts nothing (local-only).

§0 (auth) always runs first.

## 0. GitHub auth (do this first — the ambient token is invalid)

Same as `do-issue`: the environment's default `GH_TOKEN` fails on this repo. Use
**`GH_TOKEN_CLINIC`** for every `gh` call, and the GitHub MCP (configured in
`.mcp.json` with the same token) for posting review comments.

```sh
[ -n "$GH_TOKEN_CLINIC" ] && echo "ok (len ${#GH_TOKEN_CLINIC})" || echo "GH_TOKEN_CLINIC not set"
GH_TOKEN="$GH_TOKEN_CLINIC" gh <args> --repo hkashlan/clinic
```

The token needs **Pull requests (read-write)** on `hkashlan/clinic` to post
review comments. It's read from the environment — never commit or print it.

## 1. Resolve the PR and compute the review surface

```sh
git branch --show-current
# the PR for this branch (or use the number the user gave):
GH_TOKEN="$GH_TOKEN_CLINIC" gh pr view --repo hkashlan/clinic --json number,title,headRefName,baseRefName
# the files and full diff to hand the reviewers (branch vs main):
git diff --name-only main...HEAD
git diff main...HEAD
```

If there's no PR for the branch yet, tell the user — run `do-issue finish` first to
open one (or pass a PR number). If you're on `main`, stop: review operates on a
feature branch / PR.

## 2. Run the multi-agent review (this repo is standing opt-in for Workflows)

Fan out **one reviewer per dimension**, each reading only the diff plus the files
it needs, returning structured findings (`{severity, file, line, title, detail,
suggestion}`). Cover at least:

- **Security** — tenant isolation (`orgId` scoping on every query), authz/permission
  gates, input validation (zod), injection / raw SQL, secret handling.
- **Performance** — N+1 queries, unnecessary re-renders, missing indexes, work that
  should be batched or moved server-side.
- **Duplication** — logic that already exists elsewhere and should be reused (mirror
  the existing pattern rather than re-implementing).
- **Readability** — clarity, dead code, over-complex control flow, comment density
  matching the surrounding code.
- **Conventions** — repo rules from `CLAUDE.md` / `.kiro/steering/*`: `#/` subpath
  imports (+ the `imports` field on first use), no `useMemo`/`useCallback` unless
  asked, new i18n keys in `en.json` only, server-fn `orgId` scoping, design-skill
  usage for any visual change.

Then run a **verify pass**: spawn skeptic agents that try to *refute* each finding,
and keep only those that survive. This keeps plausible-but-wrong comments off the PR.

For a quick local pass instead of the full sweep, just defer to the built-in
**`/code-review`** skill and post its output via §3.

## 3. Post the review to GitHub

Default **inline** mode — one comment per surviving finding, anchored to its file
and line, via the GitHub MCP (`mcp__github__` review tools) or `gh`:

1. Create a pending review on the PR.
2. Add one inline comment per finding: severity-tagged title, the detail, and the
   `suggestion` as a ```suggestion block when it's a concrete one-liner.
3. Submit the review as **COMMENT** (not "Request changes" / "Approve" — leave the
   verdict to a human). Lead with a one-line summary: counts by dimension/severity.

**`summary` mode**: skip inline anchoring and post a single grouped issue-style
comment (by dimension, severity-ordered) with `file:line` references.

**`--no-post`**: print the grouped report to the user only; touch nothing on GitHub.

## 4. Report back

Give the user the PR URL, the comment counts by severity, and the highest-severity
items in one line each. Offer to **apply the confirmed fixes** to the working tree
(mirror the existing pattern; re-run the relevant §5 gates from `do-issue` after).
