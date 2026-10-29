#!/usr/bin/env bash
# Restore app code/config only; never silently restore or discard current database contents.
set -euo pipefail
[[ $EUID -eq 0 && $# -eq 1 ]] || { echo 'Usage: sudo bash rollback.sh /srv/stacks/shoppinglist/history/SNAPSHOT' >&2; exit 2; }
app=/srv/stacks/shoppinglist
snapshot=$(realpath -e "$1")
[[ $snapshot == "$app/history/"* && -f $snapshot/previous.compose.json && -f $snapshot/previous.env ]] || exit 1
exec 9>"$app/.deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
docker compose -p shoppinglist -f "$snapshot/previous.compose.json" up -d --wait --wait-timeout 120
install -m 0644 "$snapshot/previous.compose.json" "$app/compose.yaml"
install -m 0600 "$snapshot/previous.env" "$app/.env"
echo 'Previous app images/configuration restored. Database was retained.'
