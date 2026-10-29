#!/usr/bin/env bash
# App-only installation/update. Never edits gateway, DNS, SSH or neighbouring apps.
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
bundle=$(dirname "$script_dir")
app=/srv/stacks/shoppinglist
[[ $EUID -eq 0 ]] || { echo 'Run with sudo on the VPS.' >&2; exit 1; }
[[ $(cat "$bundle/APPLICATION") == shoppinglist ]] || exit 1
release=$(cat "$bundle/RELEASE_ID")
[[ $release =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || exit 1
install_mode=false
if [[ ${1:-} == --install ]]; then
  [[ $# -eq 2 && $2 == https://* ]] || { echo 'Usage: deploy.sh --install https://DOMAIN' >&2; exit 2; }
  origin=$2
  [[ ! -e $app/compose.yaml ]] || { echo 'Already installed. Use deploy.sh without --install.' >&2; exit 1; }
  [[ $origin =~ ^https://[a-zA-Z0-9.-]+$ ]] || { echo 'Use an HTTPS origin without a path.' >&2; exit 2; }
  install_mode=true
else
  [[ $# -eq 0 && -f $app/compose.yaml && -f $app/.env ]] || { echo 'Existing app required; first install needs --install https://DOMAIN.' >&2; exit 2; }
  origin=$(sed -n 's/^APP_ORIGIN=//p' "$app/.env")
fi
mkdir -p "$app/history"
chmod 0700 "$app/history"
exec 9>"$app/.deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
compose() { docker compose -p shoppinglist --env-file "$app/.env" -f "$app/compose.yaml" "$@"; }
snapshot=
if [[ $install_mode == false ]]; then
  snapshot=$(mktemp -d "$app/history/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
  compose config --format json > "$snapshot/previous.compose.json"
  cp "$app/.env" "$snapshot/previous.env"
  for service in web api; do
    cid=$(compose ps --quiet "$service")
    [[ -n $cid ]] || { echo "Missing running $service container." >&2; exit 1; }
    tag="local/shoppinglist-$service:rollback-$(basename "$snapshot")"
    docker image tag "$(docker inspect --format '{{.Image}}' "$cid")" "$tag"
    python3 - "$snapshot/previous.compose.json" "$service" "$tag" <<'PY'
import json,sys
p,service,tag=sys.argv[1:];c=json.load(open(p));c['services'][service]['image']=tag;c['services'][service]['pull_policy']='never'
with open(p,'w') as f:json.dump(c,f,indent=2)
PY
  done
  backup_path="/data/backups/pre-$(basename "$snapshot").sqlite"
  compose exec -T api node server/backup.ts "$backup_path"
  docker cp "$(compose ps --quiet api):$backup_path" "$snapshot/database.sqlite"
  chmod 0600 "$snapshot/"*
fi
# The version-1 schema has no destructive migrations. Future incompatible migrations need a separate plan.
docker build --pull -t "local/shoppinglist-api:$release" "$bundle/content/api"
docker build --pull -t "local/shoppinglist-web:$release" "$bundle/content/web"
docker run --rm --network none --entrypoint caddy "local/shoppinglist-web:$release" validate --config /etc/caddy/Caddyfile --adapter caddyfile
if [[ $install_mode == true ]]; then
  if ! docker network inspect shoppinglist-proxy >/dev/null 2>&1; then docker network create --internal shoppinglist-proxy; fi
fi
[[ $(docker network inspect --format '{{.Internal}}' shoppinglist-proxy) == true ]] || { echo 'Expected an internal shoppinglist-proxy network.' >&2; exit 1; }
printf 'RELEASE_ID=%s\nAPP_ORIGIN=%s\n' "$release" "$origin" > "$app/.env"
chmod 0600 "$app/.env"
install -m 0644 "$script_dir/compose.yaml" "$app/compose.yaml"
if ! compose up -d --wait --wait-timeout 120; then
  if [[ -n $snapshot ]]; then
    echo 'Update failed; attempting app image/configuration rollback.' >&2
    docker compose -p shoppinglist -f "$snapshot/previous.compose.json" up -d --wait --wait-timeout 120
    cp "$snapshot/previous.compose.json" "$app/compose.yaml"
    cp "$snapshot/previous.env" "$app/.env"
  fi
  exit 1
fi
printf 'Shopping List release %s is healthy.\n' "$release"
[[ -z $snapshot ]] || printf 'Rollback snapshot: %s\n' "$snapshot"
[[ $install_mode == false ]] || echo 'App installed. Add the dedicated gateway network attachment and domain route separately.'
