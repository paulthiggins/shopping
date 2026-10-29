#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo"
npm ci
npm run lint
npm test
npm run build
release_id=$(date -u +%Y%m%dT%H%M%SZ)
staging=$(mktemp -d)
trap 'rm -rf -- "$staging"' EXIT
mkdir -p "$staging/content/web/public" "$staging/content/api/server" "$staging/content/api/shared" "$staging/setup" "$staging/docs" deployment/out
cp -R dist/. "$staging/content/web/public/"
cp deployment/web/Dockerfile deployment/web/Caddyfile "$staging/content/web/"
cp deployment/api/Dockerfile "$staging/content/api/"
cp package.json "$staging/content/api/"
cp server/index.ts server/store.ts server/backup.ts server/recovery-epoch.ts "$staging/content/api/server/"
cp shared/model.ts shared/tokens.ts "$staging/content/api/shared/"
cp deployment/compose.yaml deployment/deploy.sh deployment/rollback.sh deployment/verify.sh deployment/README.md "$staging/setup/"
cp docs/BACKUPS.md "$staging/docs/"
printf 'shoppinglist\n' > "$staging/APPLICATION"
printf '%s\n' "$release_id" > "$staging/RELEASE_ID"
tar -czf "deployment/out/shoppinglist-release-$release_id.tar.gz" -C "$staging" APPLICATION RELEASE_ID content setup docs
(cd deployment/out && sha256sum "shoppinglist-release-$release_id.tar.gz" > "shoppinglist-release-$release_id.tar.gz.sha256")
printf '\nRelease created: deployment/out/shoppinglist-release-%s.tar.gz\n' "$release_id"
