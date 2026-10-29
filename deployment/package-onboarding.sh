#!/usr/bin/env bash
# Combine a trusted locally generated release with the separate one-time gateway additions.
set -euo pipefail
[[ $# -eq 1 && -f $1 ]] || { echo 'Usage: bash deployment/package-onboarding.sh deployment/out/shoppinglist-release-TIMESTAMP.tar.gz' >&2; exit 2; }
archive=$(realpath "$1")
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ $(tar -xOf "$archive" APPLICATION) == shoppinglist ]] || { echo 'Not a Shopping List release.' >&2; exit 1; }
release=$(tar -xOf "$archive" RELEASE_ID)
[[ $release =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || exit 1
staging=$(mktemp -d)
trap 'rm -rf -- "$staging"' EXIT
python3 - "$archive" "$staging" <<'PY'
import sys,tarfile
with tarfile.open(sys.argv[1]) as archive: archive.extractall(sys.argv[2],filter='data')
PY
mkdir -p "$staging/onboarding"
cp "$script_dir/onboarding/shopping.Caddyfile" "$script_dir/onboarding/shopping.compose.yaml" "$staging/onboarding/"
sed "s/__RELEASE__/$release/g" "$script_dir/onboarding/FIRST-INSTALL.md" > "$staging/FIRST-INSTALL.md"
output="$script_dir/out/shopping-first-install-$release.tar.gz"
tar -czf "$output" -C "$staging" APPLICATION RELEASE_ID content setup docs onboarding FIRST-INSTALL.md
(cd "$script_dir/out" && sha256sum "$(basename "$output")" > "$(basename "$output").sha256")
cp "$staging/FIRST-INSTALL.md" "$script_dir/out/shopping-first-install-$release.md"
printf '\nFirst-install kit:\n%s\n%s\n%s\n' "$output" "$output.sha256" "$script_dir/out/shopping-first-install-$release.md"
