# Deployment handover

## Existing server model

The owner reports the current VPS is working as intended. This repository contains reference configuration, not a freshly inspected snapshot of the live server. Inspect the live files before preparing any gateway changes.

| Component                          | Domain / endpoint                                                                  | Compose / network                               |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| Shared Caddy gateway               | Public TCP 80/443 and UDP 443                                                      | `gateway`, connected to egress and app networks |
| MyClinicHelper Caddy static server | `myclinichelper.com`, `www.myclinichelper.com`; internal `myclinichelper-web:8080` | MyClinicHelper stack; `mch-proxy`               |
| Stillkey Caddy static server       | `stillkey.paulhiggins.cloud`; internal `stillkey-web:8080`                         | `stillkey`; `stillkey-proxy`                    |

Application stacks live under `/srv/stacks/`. The gateway owns certificates, HTTPS and hostname routing. Each static app has its own Caddy container on port 8080 with no published host ports. App proxy networks are internal; the gateway also has egress for certificate management. Certificate data/config volumes persist independently of app releases.

The checked-in reference pins `caddy:2.11.7-alpine`; it is a recorded version, not a claim about the latest release. Review current support/security and test any base-image update when building the next app.

## Ownership boundaries

Shared infrastructure: host bootstrap, SSH, firewall, gateway routes, gateway network attachments and certificate volumes. Keep these in an infrastructure area or a dedicated infrastructure repository.

Per app: its source, Dockerfile, internal server configuration, Compose file, app-local `.env`, packaging, verification, deployment lock and rollback history. Releases must contain only that application's content and operational scripts.

`infrastructure/initial-vps/` is the original one-time setup/recovery reference. Do not rerun bootstrap or the combined installer to add a new app. The original deployment command intentionally refuses an already configured installation.

## Onboard the new app once

This is planned work, not an action performed by this handover:

1. Select a unique app slug and domain; point the domain's DNS at the VPS and verify it resolves correctly.
2. Inspect and back up the live gateway Compose/Caddy configuration and its existing environment/volume names. Keep existing SSH access and other app settings intact.
3. Prepare `/srv/stacks/NEWAPP/`, a unique Compose project, image prefix, per-app environment and an internal `NEWAPP-proxy` network. Adapt the Dockerfile and health check to the actual runtime. Backend/database services need additional private networks and persistent volumes as appropriate.
4. Build and start the first release through a dedicated initial-app install path. Stillkey's `deployment/deploy.sh` requires an existing container; a simple rename does not turn it into a first-install script.
5. Attach the gateway to the new app network and add only the new domain route to the unique app alias. Review the actual file diff to preserve all existing routes, volumes and environment values.
6. Validate the Caddy configuration before applying it. A route-only change can use a Caddy reload. Adding a Docker network attachment normally requires updating/recreating the gateway container, so plan a short shared gateway interruption. Never use `down -v` for this operation.
7. Verify public HTTPS, health, headers, correct application content and all existing domains. Keep a gateway configuration rollback available.

Prepare exact server commands only after inspecting the live configuration and selecting the new app's name/domain. Do not replace the gateway wholesale with a copy of the initial reference.

## Adapt the tested app-only release design

Use `deployment/` as the implementation reference, not as scripts to run unchanged for the next app. Rename all app identifiers consistently: package marker, archive prefix, content/setup directory, image prefix, Compose project, alias, network, environment variable names, app paths, verification URL and test fixtures.

Keep these properties:

- Locally build from a lockfile; run relevant checks; package only deployable content and that app's operational files.
- Generate a timestamped `.tar.gz` and SHA-256 file; transfer via SSH/SCP and verify before extraction.
- Acquire an app-specific deployment lock; save resolved prior Compose settings and retain the exact previous image.
- Build/validate the new container before replacement, wait for health, and automatically attempt rollback after startup failure.
- Support explicit manual rollback and document retained image/history requirements. Image pruning can remove rollback capability.
- Write only the app's directory and update only its Compose project. Do not rewrite shared environment, gateway routes or neighbouring apps during routine updates.
- Test against an isolated representative installation, including successful updates, deliberately unhealthy startup, manual rollback and unchanged neighbour identities/shared file hashes.

Stillkey includes a one-time compatibility read from `/srv/stacks/.env` for its original installation. A new app should start with its own environment; it does not need that legacy transition.

## Static container policy

The reference app runs as UID/GID 10001, with a read-only filesystem, `/tmp` tmpfs, all capabilities dropped, no privilege escalation, bounded local Docker logs and an HTTP `/healthz` check. Only built public files are copied into the serving image. Do not serve source, `.env`, repository metadata, archives or user backups.

Send restrictive headers suitable for the new app. Stillkey permits camera, WebAssembly and local blob images; another app may require fewer permissions or explicit API connections. Align server and HTML CSP. Use correct MIME types; revalidate HTML, service worker and manifest; cache hashed assets immutably.

Known limit: the current release packager copies only the current `dist/` and does not carry forward old hashed assets. Atomic container replacement does not by itself retain assets for open clients. If the next app uses lazy-loaded assets, implement/test retention of earlier hashed files or a safe recovery/reload path across releases. Deep client-side routes also need a deliberate navigation fallback; the current container file server returns 404 for missing files, including missing assets.

## Operations and data

A container image rollback restores code/configuration, not user data or a database migration. Local-only apps need user export/restore; server-backed apps need separate scheduled backups and tested recovery. Keep certificate volumes and app data volumes out of destructive cleanup commands.

Test with production assets and a real update, then check external HTTPS and offline/install behaviour where applicable. Keep generated bundles, builds, dependencies, caches and credentials out of git. Record validation honestly and review dependencies again rather than relying on Stillkey's historical audit results.
