# Shopping List deployment

Deployed on 28 October 2026 at **https://shopping.paulhiggins.cloud/** as the separate `shoppinglist` Compose project. Latest sync-policy update deployed on 29 October 2026. See [the live deployment record](../docs/DEPLOYMENT-2026-10-29.md) for actual paths, verification and backups. On this VPS the gateway network addition is merged into its main Compose file; no separate shopping override is required. First-install instructions below are retained for a fresh server/application, not to rerun on the working installation.

## Services and isolation

`web` is a non-root Caddy static server on 8080, proxying `/api/*` to `api:4181`. `api` is a non-root Node/TypeScript service using a persistent SQLite volume. The web service connects to the dedicated internal `shoppinglist-proxy` network and the private app network; API connects only to the app network. Only the shared public gateway publishes internet ports. Health checks cover both services and the database.

The read-only roots, tmpfs, capability drop, no-new-privileges and bounded logs follow the Stillkey pattern. API responses/events are no-store; hashed public assets are immutable. Caddy explicitly streams API events without buffering. Images are pinned to the tested reference version/runtime; review/update supported versions deliberately.

## Package locally

```bash
bash deployment/package.sh
```

Creates `deployment/out/shoppinglist-release-TIMESTAMP.tar.gz` and `.sha256`. It includes only built web assets, API/shared source needed by Node, container files and this app's operational scripts. It excludes personal data, database, credentials, handover/reference sources, node_modules and other apps. The API has no third-party runtime dependencies.

## One-time installation kit

For the first deployment to `https://shopping.paulhiggins.cloud`, package the app first, then pass its archive to:

```bash
bash deployment/package-onboarding.sh deployment/out/shoppinglist-release-TIMESTAMP.tar.gz
```

This creates a separate `shopping-first-install-TIMESTAMP.tar.gz`, checksum and timestamped Markdown runbook under `deployment/out/`. The kit combines the app release with the one-time gateway additions. Follow the included `FIRST-INSTALL.md`; it has exact upload, checksum, backup, Compose merge, Caddy validation, apply and rollback commands. This kit is only for initial onboarding. Later `shoppinglist-release-*` app archives do not contain gateway files.

The `onboarding/shopping.compose.yaml` override is additive. If used, keep including it with the gateway's original Compose file for future gateway operations. The kit was checked against the documented original gateway layout; inspect the live configuration before applying it.

## One-time onboarding (prepare and review first)

1. Point `shopping.paulhiggins.cloud` DNS to the VPS.
2. Inspect and back up the existing gateway configuration. Preserve its environment and certificate volumes.
3. Upload this app's archive/checksum via SCP. Check `sha256sum -c`, then extract into its own release directory.
4. On the VPS, run the extracted script:

   ```bash
   sudo bash ~/shoppinglist-release-TIMESTAMP/setup/deploy.sh --install https://shopping.paulhiggins.cloud
   ```

   This installs only `/srv/stacks/shoppinglist`, creates its internal proxy network if absent, and starts its app services. It does not make the app public yet.

5. Separately attach the shared gateway to `shoppinglist-proxy` and add this route to its existing Caddyfile:

   ```caddyfile
   shopping.paulhiggins.cloud {
       header Strict-Transport-Security "max-age=31536000"
       reverse_proxy shoppinglist-web:8080
   }
   ```

   Validate the gateway configuration before applying. A new Docker network attachment usually requires recreating the gateway container; a subsequent route-only edit can reload Caddy. Prepare the exact Compose change from live files, not by replacing them with an old reference. Retain existing domain routes and named certificate volumes. Never use `down -v`.

6. Run `bash ~/shoppinglist-release-TIMESTAMP/setup/verify.sh`. Test two browsers sharing a synthetic list, stream/fallback, install/offline/reconnect and backup. Check Stillkey and MyClinicHelper still work.

If first installation fails, inspect health/logs and repair that app's configuration before retrying `docker compose up`; the update path intentionally requires running predecessor services. Do not rerun server bootstrap.

## Independent updates

Upload and extract a new `shoppinglist-release-*` package, then:

```bash
sudo bash ~/shoppinglist-release-TIMESTAMP/setup/deploy.sh
bash ~/shoppinglist-release-TIMESTAMP/setup/verify.sh
```

The app lock prevents concurrent deploys. The script retains exact previous images/resolved Compose settings and takes a consistent DB snapshot before replacing containers. Startup failure attempts automatic image/config rollback. The current version-1 schema is compatible across these app builds; future destructive migrations need a reviewed data recovery plan, not just these scripts.

Manual code/config rollback:

```bash
sudo bash ~/shoppinglist-release-TIMESTAMP/setup/rollback.sh /srv/stacks/shoppinglist/history/SNAPSHOT
```

Rollback never automatically restores an older DB. Keep retained images, history and volume. Use [backup guidance](../docs/BACKUPS.md) from the source repository for actual data recovery. Database copies and release files may include sensitive data; protect app history and take an off-VPS backup.

## Current limits

- Scripts are local preparations; see the validation record for which container paths were actually exercised.
- Current packaging does not retain previous hashed assets across releases. This app currently has no lazy-loaded domain chunks, but open-client/update behaviour still needs a deliberate retention policy before broader rollout.
- No scheduled backup/off-VPS destination has been configured.
- Proxy-aware rate limits, real TLS/onboarding and physical-device checks remain deployment validation, not claims made by a local build.

## Local container rehearsal

```bash
python3 deployment/test-local.py --bundle deployment/out/shoppinglist-release-TIMESTAMP.tar.gz
```

Pass `--compose /absolute/path/to/docker-compose` when using a standalone CLI. This uses random loopback ports, a separate data volume and unique networks. It verifies the built services and persistent restart, then removes those test resources. It does not execute the privileged install/update/rollback scripts or exercise the shared public gateway.
