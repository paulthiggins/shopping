# Live sync update — 29 October 2026

Production: **https://shopping.paulhiggins.cloud/**
Release described here: `20261029T000855Z`.
Superseded by [friendly sharing codes, release `20261029T002921Z`](DEPLOYMENT-FRIENDLY-CODES-2026-10-29.md).
Previous release: `20261028T204025Z`.
Infrastructure and original installation: [28 October deployment record](DEPLOYMENT-2026-10-28.md).

## What changed

Removed unconditional five-second snapshot polling. A healthy SSE connection now causes snapshot reads only for a real newer revision or connection/lifecycle reconciliation. Server comment heartbeats maintain liveness without fetching shopping data. A stalled stream is aborted after 45 seconds without valid traffic; the initial stream must respond within 10 seconds. Reconnection uses bounded backoff.

A five-second snapshot fallback runs only while the stream is unavailable and the page is visible. It is cancelled on reconnection and paused when hidden. Returning to the app or reconnecting online refreshes immediately. Failed save/read attempts have their own bounded retries, so removing polling cannot strand pending work. Dexie notifications wake committed outbox work in other tabs; that work does not require a full snapshot poll.

No API contract or database schema change was needed. The compact shopping screen remains in place.

## Deployment and preservation

The app-only archive/checksum were uploaded over SSH as paul and verified before extraction. The normal updater saved a consistent database snapshot and previous images/configuration, replaced only Shopping List's two containers and waited for health checks.

Rollback snapshot:

```text
/srv/stacks/shoppinglist/history/20261029T000939Z-ZuK7WE/
```

Schema-compatible code/config rollback, retaining the current database:

```bash
sudo bash ~/shoppinglist-release-20261029T000855Z/setup/rollback.sh /srv/stacks/shoppinglist/history/20261029T000939Z-ZuK7WE
```

The existing shared lists had identical read-only fingerprints before deployment, immediately after it and after test cleanup. Gateway/Stillkey/MyClinicHelper container identities/start times and gateway/shared-environment checksums were unchanged. Public endpoint checks and neighbouring site availability passed.

## Validation

- Strict production build, lint and **35 unit/API tests passed**.
- **28 desktop/mobile Chromium browser checks passed**, including failure-only polling, reconnect cancellation, hidden-page pause, failed-save retries, cross-tab outbox wake-up, existing offline/conflict behaviour, compact layout and safe updates.
- Public HTTPS validation observed **zero snapshot requests in either desktop or mobile during 17 seconds of healthy idle**, spanning a server heartbeat.
- A live edit arrived immediately by SSE. Blocking only the event endpoint enabled polling and delivered a missed change. Restoring SSE stopped polling again.
- A deliberately rejected save retried successfully with SSE still healthy and did not duplicate its quantity.
- Temporary synthetic collection and receipts were deleted by exact identifiers. No personal list contents were printed or modified for validation.

Existing installed clients should reopen/refresh online and choose **Update app** in the hamburger menu when offered. Until the new cached shell is activated, an already-open older client retains its old behaviour.
