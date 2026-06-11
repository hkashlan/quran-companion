#!/usr/bin/env bash
# Create the feature branch and push it (§1b). Push uses the SSH remote, so it
# does not need GH_TOKEN_CLINIC.
#
# Usage: branch.sh <slug> <issue#>     # creates + pushes feat/<slug>-<issue#>
set -euo pipefail

slug="${1:?slug required (e.g. edit-patient)}"
num="${2:?issue number required}"
branch="feat/${slug}-${num}"

if git show-ref --verify --quiet "refs/heads/$branch"; then
	git checkout "$branch"
else
	git checkout -b "$branch"
fi
git push -u origin "$branch"
echo "$branch"
