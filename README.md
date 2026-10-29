# Shopping List

A React/TypeScript shopping PWA in Stillkey's visual family, with configurable shops, remembered items and shared offline-capable lists. Rewritten from the legacy Svelte app; the legacy source and deployment are unchanged.

Production: **https://shopping.paulhiggins.cloud/**. See [the live deployment record](docs/DEPLOYMENT-2026-10-29.md).

## Run locally

Requires Node 24.15.x or a compatible newer Node 24 release. The server uses Node's built-in SQLite and TypeScript support; strict type checking runs separately.

```bash
npm ci
npm run build
SERVE_DIST=1 PORT=4183 npm start
```

Open `http://127.0.0.1:4183/`. Create a list, or choose **Bring your old list along** to preview a JSON export. Creation/import commit requires a running API. The server defaults to `data/shopping.sqlite`; this directory is ignored by git. Browser data is stored in IndexedDB under this app's origin.

For frontend development, use two terminals:

```bash
npm run api
```

```bash
npm run dev
```

Vite proxies `/api` to port 4181. The production service worker is tested with the production build, not the Vite development server.

## Use

The main shopping screen has only shop buttons and a hamburger menu at the top, then the item input/Add button, with the items scrolling independently underneath. Open the hamburger menu for sharing, history, shop management, backups/import, other lists, theme, sync details and app updates. This compact layout is live in production; release and recovery details are in the deployment record.

- Shop buttons replace the dropdown. New lists start with Aldi, Lidl and Tesco; **Manage shops** adds, renames, reorders or removes shops.
- Add an item by name or autocomplete; adding an existing name increments quantity. Display case is preserved. Minus stops at one. There is no purchased checkbox.
- Drag the dotted handle to reorder. The row's **More actions** menu also has keyboard-accessible move actions.
- Swipe right for Edit; left for Remove & forget. Swiping only reveals a button. The actions menu offers the same functionality without swiping.
- **Delete** removes one row but retains its suggestion. **Remove & forget** also suppresses the name in shared autocomplete. Other shops' rows remain. Explicitly adding the name again remembers it.
- New lists use short random sharing codes such as `k7m-4rt-9wx`, avoiding `0`, `1`, `i`, `l` and `o`. Existing long links still work. Open a list using its link or code; short codes also accept uppercase or omitted hyphens. Short codes trade some privacy for convenience.
- **Share list** copies a link to all shops and their history. Anyone holding it can read/edit. No login or read-only role exists. The link is an access credential; keep it somewhere safe.
- Live sharing uses SSE notifications. Healthy idle connections do not poll for snapshots. A five-second foreground fallback runs only when SSE is unavailable and stops after reconnection. Failed saves retry independently.
- Offline edits persist on the device, then sync. Open Menu → Sync status to inspect pending/conflicting changes. Conflicts retain their command/draft and support reapply/discard. Do not clear site data while changes are pending.
- **Back up** downloads JSON without the sharing credential. Import creates a fresh collection/link, never overwrites the current list. Backups made with unsent work include visible state plus separate `recoveryChanges`; importing restores the visible snapshot, not automatic replay of rejected commands.
- Choose system/light/dark under Menu → Theme. Install using the browser's install action; on iOS use Safari Share → Add to Home Screen. Open online first and wait for Available offline.
- A menu badge indicates an available app update or a sync issue. Open Menu and choose Update app when offered; durable queued operations survive the reload. Reopen online to detect updates.

## Validate

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser suite uses a separate `data/browser-tests.sqlite` and synthetic collections. It does not import personal backups. See [docs/VALIDATION.md](docs/VALIDATION.md) for actual results and remaining work.

## Design and operations

- [SPEC.md](SPEC.md): agreed product decisions and broader acceptance criteria.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): storage, sync, conflict and access boundaries.
- [deployment/README.md](deployment/README.md): independent two-container deployment, onboarding and rollback.
- [docs/BACKUPS.md](docs/BACKUPS.md): consistent SQLite backup and recovery.
- [handover/README.md](handover/README.md): copied reference pack, branding and rebuild lessons.
- `reference/stillkey/`: historical source/configuration reference, excluded from releases. Do not run its deployment scripts for this app.

This application intentionally stores shared shopping content on the server. It is not end-to-end encrypted and does not inherit Stillkey's local-only security claims. The owner subsequently authorised production deployment. The new app and gateway route are deployed; the legacy app and neighbouring application containers were preserved. No personal backup was imported.

## Test from a real device on the LAN

```bash
HOST=:: SERVE_DIST=1 PORT=4183 npm start
```

This listens on IPv6 and IPv4 on the development machine. Open `http://acemagician.local:4183/` on the same network, or use its LAN IPv4 address. Leave APP_ORIGIN unset for this test command so both the hostname and local/IP URLs work; production Compose still sets its exact HTTPS origin.

Normal shopping/editing/sync works on HTTP with cryptographically random ID generation and a per-tab sync fallback when Web Locks are unavailable. Server retry receipts still prevent duplicate mutations across tabs. Full PWA installation/service-worker offline launch and automatic clipboard copying require a secure context; use HTTPS for those device checks. Manual link copying is offered on HTTP. A device's HTTP `.local` origin has separate browser storage from localhost/production; use a shared link or export/import deliberately.
