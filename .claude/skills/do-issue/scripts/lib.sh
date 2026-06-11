#!/usr/bin/env bash
# Shared config + helpers for the do-issue scripts. Source this; don't run it.
set -euo pipefail

REPO="hkashlan/clinic"
OWNER="hkashlan"
PROJECT=4

# The ambient GH_TOKEN is invalid for this repo; every gh call must use
# GH_TOKEN_CLINIC. This wrapper enforces both — call `gh ...` as normal.
require_token() {
	if [ -z "${GH_TOKEN_CLINIC:-}" ]; then
		echo "GH_TOKEN_CLINIC not set — export it in your shell profile (see SKILL.md §0)." >&2
		exit 1
	fi
}

gh() {
	require_token
	GH_TOKEN="$GH_TOKEN_CLINIC" command gh "$@"
}
