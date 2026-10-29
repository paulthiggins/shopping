# First-build validation — 28 October 2026

This is the first local implementation, not a production deployment or independent security audit. The legacy application, Stillkey and the live VPS were not modified. No personal shopping data was uploaded or added to git.

## Checks completed

- Strict TypeScript, ESLint and production Vite/PWA build: passed.
- Vitest: **30 tests passed** across domain/import behaviour, transactional SQLite, authentication boundaries and HTTP event streaming.
- Production Playwright suite: **18 tests passed** across desktop Chromium and mobile Chromium emulation. It covers shops/quantities, autocomplete/delete/forget, editing and keyboard moves, actual pointer-handle dragging, swipe reveal, backup migration/export, sharing, two independent clients, offline persistence/reconnect, conflict recovery into a surviving shop, remembered collection on root launch, invalid links and service-worker update with queued work.
- Final conflict wording adjustment: both desktop/mobile recovery regressions passed again; only UI text presentation changed after the complete run.
- Desktop/mobile screenshots were visually inspected for the Stillkey-family palette, readable wrapped item names, shop buttons and layout. Horizontal swipe overflow and the mobile backup button's accessible label were corrected during testing.
- Supplied legacy export parsed locally through the new importer: **5 shops, 11 rows and 182 history entries**, no completion fields. Contents were not copied into fixtures or stored in the app server. Committed tests contain synthetic data only.
- Consistent SQLite backup, isolated restore, epoch renewal and rejection of a stale client operation: passed with disposable synthetic data.
- Deployment shell syntax and ShellCheck v0.10.0: passed.
- A real app-only archive was built and inspected for absence of other apps, database, credentials, dependencies and gateway content.
- Docker smoke rehearsal: **passed** with the actual Caddy and Node images. Verified non-root/read-only containers, health and DB access, API authentication, command retry idempotency, live SSE through app Caddy, missing-asset 404, consistent backup and preserved data after container restart. All smoke-test containers, networks and its data volume were removed. The test used loopback ports and made no certificate requests.
- `npm audit`: **4 low-severity advisories** in the Workbox build dependency chain; **0 moderate/high/critical** reported. These are build dependencies, not dependencies imported by the Node API image. No forced dependency downgrade was performed. Review again before release.

The local Docker installation lacks a Compose plugin; the smoke rehearsal used `/tmp/stillkey-deployment-check/docker-compose`. That path is workstation-specific, not a production requirement. Reproduce with a normal `docker compose` installation or pass another standalone CLI.

## Remaining before production rollout

- Review the actual application flow with the owner, particularly gesture feel and history/conflict behaviour.
- Physical iOS/Android install, permissions/storage lifecycle, suspended-page reconnect, touch scroll/swipe/drag coexistence and low-storage handling. Mobile emulation is not physical-device validation.
- Firefox, branded Safari/iOS and Edge runs for this new app; the first run covered Chromium only. Stillkey's older cross-browser results do not validate Shopping List.
- Full adversarial multi-tab/command-dependency fuzzing and every broader SPEC acceptance case. Some dependent offline rename chains intentionally surface a recoverable conflict instead of automatic rebase.
- Production gateway inspection/onboarding, DNS, real HTTPS and event delivery through the shared gateway. Only app Caddy was exercised in containers.
- The actual install/update/automatic-unhealthy-rollback/manual-rollback shell paths need an isolated deployment rehearsal before running on the VPS. Shell lint and container smoke tests do not establish those paths are fully validated.
- Deliberate handling of old hashed assets during rollout. The initial packager carries the current build only.
- Review any future database migration for code/schema rollback compatibility. V1 currently has one schema; do not silently run destructive migrations.
- Schedule consistent server backups, configure off-VPS storage/retention, and rehearse the operational restore procedure on a separate stack. No scheduled backup has been installed.
- Tune aggregate rate limits behind the reverse proxy; implement trusted-proxy handling only with an explicit trust boundary.
- Independent accessibility/security assessment if required. No audit claim is made.

## Reproduce

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
bash deployment/package.sh
python3 deployment/test-local.py --bundle deployment/out/shoppinglist-release-TIMESTAMP.tar.gz
```

For a standalone Compose CLI, append `--compose /absolute/path/to/docker-compose` to the last command. The test creates disposable resources with unique names. Never point a smoke-test configuration at production networks or volumes.

## LAN HTTP preview follow-up

The preview was bound on all IPv4/IPv6 interfaces for the owner's device testing. Verified HTTP access using the LAN IP and `.local` hostname. An actual non-secure browser origin successfully created a list and applied edits from two tabs without randomUUID or Web Locks. Added cryptographically random UUID fallback, server-idempotent per-tab sync fallback, monotonic snapshot checks and manual-copy guidance. Typecheck/build/lint and all 30 unit/API tests passed; six targeted desktop/mobile shared-sync, conflict-recovery and service-worker-update regressions passed. HTTPS remains required for full installed/offline device validation. Production binding/origin defaults remain unchanged.

## Deployment assets for shopping.paulhiggins.cloud

Prepared a fresh app-only release and a separate one-time installation kit, release `20261028T194352Z`. Checksums and archive contents were verified; both exclude personal data, local databases, dependencies and repository metadata. Routine app archives exclude the gateway additions. The first-install kit includes a domain route, additive Compose network configuration, backup notes and exact timestamped SCP/extract/install/gateway validation/apply/rollback instructions.

Package checks passed: TypeScript/build, lint and 30 unit/API tests. Deployment scripts, including the onboarding packager, passed ShellCheck. The fresh app archive passed the real isolated Caddy/Node container rehearsal with `https://shopping.paulhiggins.cloud` as APP_ORIGIN: another origin was rejected, and health, retry idempotency, live events, consistent backup and persistent restart passed. Test resources were removed. The additive gateway override was resolved against the documented reference gateway; removing its one new network attachment made the result identical to the reference, including ports and certificate volumes. This is not a live-server inspection.

No VPS access, uploads, DNS edits or gateway changes were performed. The real device LAN attempt was reported unsuccessful by the owner; the earlier LAN checks were from this workstation and do not establish physical-device reachability. Use the new HTTPS origin for the remaining installation/offline/device checks after deployment. The privileged app install/update/rollback script paths still require their isolated rehearsal; container runtime tests and shell validation do not claim to validate those paths fully.

## Authorised production deployment

Deployed release `20261028T194352Z` to https://shopping.paulhiggins.cloud/ as paul over verified SSH. The uploaded archive checksum matched. The actual first-install script completed and both app containers became healthy. Live gateway files were backed up; only the new network and domain route were added, validated and applied. The new network was merged into the original gateway Compose file, avoiding a persistent override requirement. The shared environment and neighbouring app container identities/start times were unchanged.

Public HTTPS verification, two-browser shared edits, SSE through the shared/app gateways, service-worker offline reload and queued-edit reconnect passed. Temporary synthetic test data was removed by exact collection/creation identifiers. A consistent initial DB/config snapshot was retained privately on the VPS. Stillkey and both MyClinicHelper hostnames returned 200. No supplied personal backup or local development DB was imported.

See [the deployment record](DEPLOYMENT-2026-10-28.md). Physical-device checks, scheduled/off-VPS backups, and update/rollback failure-path rehearsal remain distinct follow-up work. The first installation is now exercised on the VPS; that does not establish the unexercised update/rollback paths.

## Simplified shopping screen — local UI update

Replaced the shopping-screen sidebar, headings, footer, repeated totals and explanatory panel with two static rows: shops plus a hamburger menu, then item entry/Add. The remaining viewport is an independently scrolling item region. Share, history, shop management, backup/import, list selection/creation, theme, sync recovery and app updates are available in the menu. Sync remains announced to assistive technology; update/conflict attention uses a menu badge. First-run creation/import remains available.

Production build/strict types, lint and all **30 unit/API tests passed**. The final production browser suite passed **20 checks** across desktop and mobile Chromium. A 60-row synthetic list verifies native wheel scrolling without page movement, static header/input coordinates, autocomplete above the scroller, shop-switch scroll reset, handle drag auto-scroll inside the list, bottom-row action visibility, menu options, light/dark themes and keyboard focus restoration. Existing shared edits, offline queue/recovery, import/export and prompted service-worker updates continue to pass with menu navigation. Screenshots in both themes were visually inspected.

This update is served by the local preview on port 4183. It has not been uploaded/deployed; production remains on release `20261028T194352Z`. No server data/schema, gateway or production configuration was changed. Real-device keyboard/browser-chrome behaviour should still be checked after rollout.

## Compact-screen production rollout

Authorised app-only deployment of `20261028T204025Z` completed successfully. Packaging passed lint, 30 unit/API tests and strict production build. The normal updater's database backup, previous-image/configuration retention and successful replacement/health-wait path were exercised on the VPS. Its saved rollback path is in the deployment record; deliberately failed-update/manual-rollback paths were not invoked during this live rollout.

Public desktop/mobile browser checks passed for the compact header/input, independent long-list scroll, hamburger access/focus, shared editing and offline reload/reconnect. The temporary synthetic collection was removed by exact identifiers. The original shared lists had the same fingerprint across deployment and cleanup. The gateway and neighbouring app container identities/start times, gateway files and shared environment were unchanged. The compact UI is now live at https://shopping.paulhiggins.cloud/.

## Failure-only refresh fallback — 29 October 2026

Removed unconditional healthy-stream snapshot polling and deployed `20261029T000855Z`. Lint/strict build, 35 unit/API tests and 28 desktop/mobile browser tests passed. Coverage includes heartbeat-only liveness, stale/initial connection timeouts, cleanup, conditional fallback/reconnect, hidden-page pause, independent failed-save retries and cross-tab pending-work notifications. Existing offline, recovery, UI and PWA-update regressions still pass.

The real public HTTPS site made zero snapshot requests during a 17-second idle observation in both desktop/mobile contexts, spanning an SSE heartbeat. Live edits arrived by notification; a blocked event stream enabled polling; reconnect stopped it. A failed save retried exactly once successfully while SSE remained healthy. Temporary validation data was removed. Existing list fingerprints, neighbouring container identities and gateway configuration were unchanged. See [29 October deployment record](DEPLOYMENT-2026-10-29.md) for the exact rollback snapshot and client activation instructions.

## Friendly sharing codes — 29 October 2026

New collections use nine cryptographically random characters grouped `xxx-xxx-xxx`, excluding `0`, `1`, `i`, `l` and `o`. Existing long credentials remain valid; existing collections are not migrated. Short code entry accepts uppercase or omitted hyphens. Creation collisions return a distinct 409 without exposing state, then the browser saves and retries a fresh code. Added a failed-authentication budget alongside existing request/creation limits; behind the bundled proxy the failure budget is aggregate and can briefly block other users after repeated invalid guesses.

Lint, strict production build, all 39 unit/API tests and all 30 desktop/mobile Chromium browser checks passed. New coverage verifies unbiased random-character selection, entry normalisation, long-link API compatibility, allocation collision recovery, failed-guess throttling across endpoints with spoofed forwarding headers, and two-browser sharing/reload using a manually typed code. Native Node imports and short-code collection creation passed. The release packager now includes the shared token module. These changes are local and have not been deployed or committed.

## Friendly-code production rollout

Deployed release `20261029T002921Z` after verified packaging and upload. Both app containers are healthy. Public desktop/mobile checks passed for short-code creation, uppercase/ungrouped entry, live sharing, reload and legacy long-link compatibility. Synthetic test collections were removed; the original list fingerprint and neighbouring services/configuration were unchanged. The backup/rollback snapshot and client activation details are in [the friendly-code deployment record](DEPLOYMENT-FRIENDLY-CODES-2026-10-29.md). Changes remain uncommitted locally.
