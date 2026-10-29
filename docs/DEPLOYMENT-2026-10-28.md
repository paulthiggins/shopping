# Live deployment — 28 October 2026

Production: **https://shopping.paulhiggins.cloud/**
Release at the end of 28 October: `20261028T204025Z`. Latest follow-up: [29 October sync update](DEPLOYMENT-2026-10-29.md). Initial release: `20261028T194352Z`.
SSH administration: `paul@myclinichelper.com`, using sudo for Docker and stack files.

## Installed layout

- App Compose project: `shoppinglist`.
- App directory: `/srv/stacks/shoppinglist/` with an app-local `.env` and Compose file.
- Public origin in the app environment: `https://shopping.paulhiggins.cloud`.
- Containers: `shoppinglist-web-1` (Caddy) and `shoppinglist-api-1` (Node/SQLite).
- Data volume: `shoppinglist-data`; database inside API container: `/data/shopping.sqlite`.
- Proxy network: `shoppinglist-proxy`; private API network: `shoppinglist_app`.
- Extracted installation kit: `/home/paul/shopping-first-install-20261028T194352Z/`.

Only the shared gateway publishes public ports. The app containers run with non-root users, read-only roots and health checks. Local development data and the supplied legacy backup were not uploaded/imported.

## Actual gateway integration

The live gateway was inspected and backed up before changes. The new `shopping` network attachment was merged directly into the existing `/srv/stacks/gateway/compose.yaml`, preserving its original networks, image, ports, logging and certificate volumes. The new domain block was appended to `/srv/stacks/gateway/Caddyfile`. The candidates were checked against the live originals and validated before being applied.

**No separate `shopping.compose.yaml` override is installed on this VPS.** The prepared one-time kit describes an alternative additive-override method. For this actual installation, keep using the gateway's normal single Compose file:

```bash
sudo docker compose -p gateway --env-file /srv/stacks/.env -f /srv/stacks/gateway/compose.yaml ps
```

The gateway container was recreated once to attach the new network. Stillkey and MyClinicHelper containers retained their original IDs/start times. The shared `/srv/stacks/.env` was unchanged. All existing site routes and certificate volumes were retained.

Pre-change gateway files are at:

```text
/srv/stacks/gateway.before-shopping-20261028T194352Z/
```

Do not restore them during an ordinary app update: restoring the old gateway removes Shopping List's route/network. They are rollback material for this initial gateway change.

## Verification performed publicly

- Valid HTTPS and healthy app/API responses; manifest and service worker reachable.
- Unauthenticated API rejection and missing-asset 404 checks passed.
- Two isolated browser contexts (desktop and mobile viewport) created one synthetic collection and observed edits in both directions through the real public gateway.
- Live SSE response passed through both Caddy layers.
- Service worker installed; offline reload retained a queued item; reconnect synchronised it to the second browser.
- No browser page errors occurred.
- Stillkey, MyClinicHelper and its www hostname returned HTTP 200; their app containers were not restarted.
- The synthetic collection, its operation receipts and creation receipt were deleted by exact identifiers after browsers closed. Other collections were untouched.

This is browser automation, not a physical iOS/Android device test. Open the production link on the actual device and use its browser install action. LAN preview connectivity is unrelated to the now-working HTTPS deployment.

## Initial recovery snapshot

A consistent SQLite snapshot and app configuration were retained with root-only host permissions:

```text
/srv/stacks/shoppinglist/history/initial-20261028T194352Z/
```

This is an initial snapshot, not a scheduled backup or an off-VPS copy. Configure the ongoing backup destination/retention separately; see [BACKUPS.md](BACKUPS.md). Code/image rollback does not automatically restore a database.

## Routine updates

Build `deployment/package.sh` locally. Upload the new `shoppinglist-release-*` archive/checksum, verify and extract it into its own directory on the VPS, then run:

```bash
sudo bash ~/shoppinglist-release-TIMESTAMP/setup/deploy.sh
bash ~/shoppinglist-release-TIMESTAMP/setup/verify.sh
```

Do not use `--install`, rerun server bootstrap, or change the gateway for routine app releases. Retain prior images/history for rollback. Inspect logs with:

```bash
sudo docker compose -p shoppinglist --env-file /srv/stacks/shoppinglist/.env -f /srv/stacks/shoppinglist/compose.yaml ps
sudo docker compose -p shoppinglist --env-file /srv/stacks/shoppinglist/.env -f /srv/stacks/shoppinglist/compose.yaml logs --tail 100
```

## Compact-screen update — release 20261028T204025Z

Applied the normal app-only updater from `/home/paul/shoppinglist-release-20261028T204025Z/`. It took a consistent pre-update database snapshot, retained the previous images/configuration, rebuilt and replaced only the shopping web/API services, and waited for both health checks. No database schema migration was needed.

Rollback material is retained at:

```text
/srv/stacks/shoppinglist/history/20261028T204058Z-bBCf5r/
```

For code/config rollback if needed:

```bash
sudo bash ~/shoppinglist-release-20261028T204025Z/setup/rollback.sh /srv/stacks/shoppinglist/history/20261028T204058Z-bBCf5r
```

This retains the current database; do not restore the pre-update snapshot over newer shopping changes during an ordinary code rollback.

The live compact screen was checked in isolated desktop/mobile browser contexts using a temporary 25-row collection: shop buttons and item entry stayed fixed while only the list scrolled; menu options and keyboard focus worked; a shared edit reached the second browser; offline reload retained a queued item and reconnect synchronised it. The temporary collection and receipts were removed afterwards. Existing shared-list contents had an identical read-only fingerprint before deployment, immediately after it, and after validation cleanup.

The gateway, Stillkey and MyClinicHelper retained their container IDs/start times. Gateway configuration and the shared environment had identical checksums before/after the update. Public endpoint verification and neighbouring site checks passed. Existing installed clients should reopen/refresh online and accept Update app when offered to activate the new cached shell.
