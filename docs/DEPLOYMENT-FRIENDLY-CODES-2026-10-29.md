# Friendly sharing codes deployment — 29 October 2026

Production: **https://shopping.paulhiggins.cloud/**
Current release: `20261029T002921Z`.
Previous release: `20261029T000855Z`.
Previous rollout: [live sync update](DEPLOYMENT-2026-10-29.md).

## Behaviour

New collections use random nine-character codes grouped `xxx-xxx-xxx`, excluding `0`, `1`, `i`, `l` and `o`. Manual code entry accepts uppercase letters and omitted hyphens. Existing collections keep their original case-sensitive long links. Added collision retries and a shared failed-authentication budget; see [architecture](ARCHITECTURE.md) for the deliberate convenience/privacy trade-off and proxy limits.

## Deployment and validation

Packaged with lint, strict production build and 39 unit/API tests passing; the preceding desktop/mobile Chromium suite passed all 30 checks. Verified that the release includes the shared token module required by the native Node API.

Uploaded the archive and checksum over verified SSH as paul. The remote checksum matched. The normal app-only updater made a consistent database backup, retained previous images/configuration, rebuilt both app containers and waited for healthy services. No gateway changes were required.

Public HTTPS checks passed for health, manifest, service worker, missing assets and unauthenticated API rejection. Fresh desktop/mobile contexts verified short-code creation, uppercase/ungrouped manual entry, live shared changes and reload persistence. A temporary long credential verified continued read/write support in the new API and client. Removed exactly the two synthetic test collections and their receipts. The original collection count and document fingerprint matched the pre-deployment baseline after cleanup. Gateway and neighbouring app container identities/start times and configuration checksums were unchanged; Stillkey and MyClinicHelper returned HTTP 200.

## Rollback and client activation

Rollback snapshot (private on the VPS):

```text
/srv/stacks/shoppinglist/history/20261029T002948Z-cN28sx/
```

Code/config rollback, preserving the current database:

```bash
sudo bash ~/shoppinglist-release-20261029T002921Z/setup/rollback.sh /srv/stacks/shoppinglist/history/20261029T002948Z-cN28sx
```

The database schema is unchanged. The preceding release only recognises long credentials: reverting to it would temporarily make newly created short-code lists inaccessible, while retaining their data. Reapply a release supporting short codes to access them again. Do not restore the database merely to roll back code, as that would discard subsequent user changes.

Existing installed clients should reopen/refresh online and choose **Update app** in the hamburger menu when offered. Previously cached clients continue creating long links until updated and need the new shell to open short links. Existing lists are not automatically converted to short codes.
