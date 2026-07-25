#!/usr/bin/env bash
# Create (or recreate) the Dokploy schedule that fires the teacher-summary cron
# route hourly from 16:00-18:00 UTC — a job the Vercel Hobby plan can't run
# because it only allows once-per-day crons.
#
# Requires:
#   DOKPLOY_URL      e.g. https://dokploy.myclinic-sy.cloud   (in ~/.zshrc)
#   DOKPLOY_API_KEY  Dokploy API token                        (in ~/.zshrc)
#   CRON_SECRET      bearer token for the endpoint            (apps/web/.env.production.local)
set -euo pipefail

: "${DOKPLOY_URL:?set DOKPLOY_URL}"
: "${DOKPLOY_API_KEY:?set DOKPLOY_API_KEY}"
: "${CRON_SECRET:?set CRON_SECRET}"

NAME="quran teacher-summary (hourly 16-18 UTC)"
CRON="0 16-18 * * *"
# Apex domain — the canonical host, and where the Dokploy app is served.
# www.quran-companion.de redirects here (apps/web/src/server.ts), so always
# target the apex directly rather than relying on curl to follow the redirect.
TARGET="https://quran-companion.de/api/cron/teacher-summary"

api() {
  curl -sS -H "x-api-key: $DOKPLOY_API_KEY" -H "Content-Type: application/json" "$@"
}

ORG_ID=$(api "$DOKPLOY_URL/api/organization.all" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])')

# Idempotent: remove any existing schedule with the same name.
EXISTING=$(api "$DOKPLOY_URL/api/schedule.list?scheduleType=dokploy-server&id=$ORG_ID" \
  | python3 -c 'import sys,json;
d=json.load(sys.stdin);
print("\n".join(s["scheduleId"] for s in (d if isinstance(d,list) else []) if s.get("name")=="'"$NAME"'"))' 2>/dev/null || true)
for sid in $EXISTING; do
  echo "deleting existing schedule $sid"
  api -X POST "$DOKPLOY_URL/api/schedule.delete" -d "{\"scheduleId\":\"$sid\"}" >/dev/null
done

CMD="curl -sS --fail --max-time 60 -H 'Authorization: Bearer $CRON_SECRET' $TARGET"

api -X POST "$DOKPLOY_URL/api/schedule.create" -d "$(python3 - <<PY
import json
print(json.dumps({
  "name": "$NAME",
  "description": "Replaces the Vercel Hobby cron (once/day only). Curls the teacher-summary endpoint hourly.",
  "cronExpression": "$CRON",
  "scheduleType": "dokploy-server",
  "shellType": "bash",
  "organizationId": "$ORG_ID",
  "enabled": True,
  "command": """$CMD""",
}))
PY
)"
echo
echo "done."
