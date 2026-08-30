---
name: commit-push-pr
description: Commit the current working changes, push the branch, and open a pull request on hkashlan/quran-companion — end to end. Generates a commit message that matches this repo's style, branches off main first if you're still on main, pushes with upstream tracking, and opens (or reuses) a PR. Use when the user wants to "commit and push", "open a PR", "ship this", "push this up", "make a PR for these changes", or "commit-push-pr". Handles GitHub auth via GH_TOKEN_CLINIC (the ambient GH_TOKEN is invalid on this repo).
user-invocable: true
---

# Commit, push, and open a PR

Take the current working-tree changes from uncommitted → pushed branch → open PR
on `hkashlan/quran-companion`.

**Arguments (all optional):**
- A **commit message** — if omitted, generate one from the diff (see §3).
- `--no-pr` — commit and push only, skip PR creation.
- `--draft` — open the PR as a draft.

§0 (auth) always runs first, then follow §1 → §5 in order.

## 0. GitHub auth (do this first — the ambient token is invalid)

`gh` and the GitHub MCP both fail with the environment's default `GH_TOKEN`
(returns `HTTP 401: Bad credentials`). Authenticate with the **`GH_TOKEN_CLINIC`**
environment variable (the same token `.mcp.json` uses for the GitHub MCP). Prefix
every `gh` call by overriding `GH_TOKEN`:

```sh
GH_TOKEN="$GH_TOKEN_CLINIC" gh <args> --repo hkashlan/quran-companion
```

Confirm it's set before starting (never print the value):

```sh
[ -n "$GH_TOKEN_CLINIC" ] && echo "ok (len ${#GH_TOKEN_CLINIC})" || echo "GH_TOKEN_CLINIC not set"
```

If it's not set, stop and tell the user — the push and PR steps need it.

## 1. Inspect the working tree

```sh
git branch --show-current
git status --short
git diff --stat
```

If there is nothing to commit **and** nothing unpushed, there's nothing to do —
report that and stop. If the tree is clean but the branch is ahead of its remote,
skip to §4 (push) and §5 (PR).

## 2. Branch off main if needed

The default branch is `main`. **Do not commit directly to `main`.** If
`git branch --show-current` is `main`, create a feature branch first, named from
the change (short, kebab-case, e.g. `notify-idle-circle-students`):

```sh
git switch -c <branch-name>
```

If already on a feature branch, stay on it.

## 3. Stage and commit

Stage everything unless the user scoped it to specific files:

```sh
git add -A
```

Write the commit message in **this repo's style**: a single short, lowercase,
imperative summary line — no `feat:`/`fix:` conventional prefixes (match recent
history like `notify circle students who haven't finished when a mate completes
today's review` or `fix push notification`). Only add a body when the change
genuinely needs explanation.

**Never add a `Co-Authored-By` trailer** (global user preference).

```sh
git commit -m "<summary>"
```

## 4. Push with upstream tracking

```sh
git push -u origin HEAD
```

## 5. Open (or reuse) the PR

Skip this section if the user passed `--no-pr`.

First check whether the branch already has a PR:

```sh
GH_TOKEN="$GH_TOKEN_CLINIC" gh pr view --repo hkashlan/quran-companion --json url,state 2>/dev/null
```

- **If a PR exists**, the push in §4 already updated it — report its URL, done.
- **If none exists**, create one. There is no PR template in this repo, so write a
  short body: a one-line summary and a bullet list of the notable changes.

```sh
GH_TOKEN="$GH_TOKEN_CLINIC" gh pr create --repo hkashlan/quran-companion \
  --base main --title "<summary>" --body "<summary + bullets>"
```

Add `--draft` if the user asked for a draft. **Do not** put a `Co-Authored-By`
trailer or a "Generated with Claude Code" line in the PR body.

## 6. Report

Print the branch name, the commit summary, and the PR URL so the user can click
through.
