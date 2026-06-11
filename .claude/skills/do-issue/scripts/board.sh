#!/usr/bin/env bash
# Project board #4 operations. Deterministic ceremony for §1 of the skill.
#
# Usage:
#   board.sh ids                       # resolve project id + Status field/option ids (JSON)
#   board.sh list                      # Backlog/Ready issue candidates (TSV: itemId  #num  [status] title)
#   board.sh item-id <issue#>          # the PVTI_ item id for an issue number
#   board.sh move <itemId> <status>    # move a card to a Status option (e.g. "In Progress")
#   board.sh move-issue <issue#> <status>   # same, resolving the item id from the issue number
#   board.sh add <issue#>              # add an issue to the board if it isn't already on it
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"

board_ids() {
	local pid
	pid=$(gh project view "$PROJECT" --owner "$OWNER" --format json | jq -r '.id')
	gh project field-list "$PROJECT" --owner "$OWNER" --format json \
		| jq --arg pid "$pid" '
			(.fields[] | select(.name=="Status")) as $s
			| { projectId: $pid,
			    statusFieldId: $s.id,
			    options: ($s.options | map({(.name): .id}) | add) }'
}

cmd="${1:-}"
shift || true

case "$cmd" in
ids)
	board_ids
	;;
list)
	gh project item-list "$PROJECT" --owner "$OWNER" --format json --limit 100 \
		| jq -r '.items[]
			| select(.status=="Backlog" or .status=="Ready")
			| select(.content.type=="Issue")
			| "\(.id)\t#\(.content.number)\t[\(.status)] \(.content.title)"'
	;;
item-id)
	n="${1:?issue number required}"
	gh project item-list "$PROJECT" --owner "$OWNER" --format json --limit 200 \
		| jq -r --argjson n "$n" '.items[]
			| select(.content.type=="Issue" and .content.number==$n) | .id' \
		| head -1
	;;
move)
	item="${1:?item id required}"
	status="${2:?status name required}"
	ids=$(board_ids)
	pid=$(echo "$ids" | jq -r '.projectId')
	fid=$(echo "$ids" | jq -r '.statusFieldId')
	oid=$(echo "$ids" | jq -r --arg s "$status" '.options[$s] // empty')
	[ -n "$oid" ] || { echo "Unknown Status option: '$status'" >&2; exit 1; }
	gh project item-edit --project-id "$pid" --id "$item" \
		--field-id "$fid" --single-select-option-id "$oid" >/dev/null
	echo "Moved $item → $status"
	;;
move-issue)
	n="${1:?issue number required}"
	status="${2:?status name required}"
	item=$("$0" item-id "$n")
	[ -n "$item" ] || { echo "Issue #$n is not on board #$PROJECT (run: board.sh add $n)" >&2; exit 1; }
	"$0" move "$item" "$status"
	;;
add)
	n="${1:?issue number required}"
	url=$(gh issue view "$n" --repo "$REPO" --json url --jq '.url')
	gh project item-add "$PROJECT" --owner "$OWNER" --url "$url" >/dev/null
	echo "Added #$n to board #$PROJECT"
	;;
*)
	echo "Usage: board.sh {ids|list|item-id <n>|move <itemId> <status>|move-issue <n> <status>|add <n>}" >&2
	exit 2
	;;
esac
