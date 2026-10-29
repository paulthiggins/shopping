#!/usr/bin/env bash
set -euo pipefail
base=${1:-https://shopping.paulhiggins.cloud}
[[ $base == https://* ]] || { echo 'Use an HTTPS origin.' >&2; exit 2; }
curl --fail --silent --show-error "$base/healthz"
curl --fail --silent --show-error "$base/api/healthz"
curl --fail --silent --show-error "$base/manifest.webmanifest" > /dev/null
curl --fail --silent --show-error "$base/sw.js" > /dev/null
[[ $(curl -s -o /dev/null -w '%{http_code}' "$base/api/state") == 404 ]]
[[ $(curl -s -o /dev/null -w '%{http_code}' "$base/assets/missing-verification.js") == 404 ]]
echo 'Public endpoints, unauthenticated access rejection and missing-asset behaviour passed. Test an actual shared list in two browsers too.'
