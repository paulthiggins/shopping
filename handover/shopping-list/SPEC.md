# Shopping list PWA — rebuild specification

Status: product decisions D1–D5 confirmed by the owner on 28 October 2026; remaining design details are a reviewable implementation brief. Implementation has not started.
Prepared: 28 October 2026.
Target origin: `https://shoppinglist.paulhiggins.cloud/`.
Working product name: Shopping List (final name to be chosen).

## 1. Objective and scope

Rewrite the existing shopping-list application using Stillkey's frontend stack and visual language. Preserve useful shopping behaviour and migrate the existing export, while replacing the legacy Svelte implementation and fragile interaction code.

Provide a mobile-first, installable PWA with configurable shops, ordered item cards, quantity controls, autocomplete history, swipe-revealed actions, and shared server-backed collections. A collection contains all its shops, their rows and its autocomplete history. Sharing, offline editing and item behaviour follow the confirmed decisions in section 2.

This phase produces an agreed specification before code is written. Do not modify the working legacy app, deploy a replacement, or import personal data to a server as part of specification work.

### Evidence inspected

- Legacy source: `/home/paul/shopping-list-app`, especially `src/lib/storage.ts`, `src/lib/stores.ts`, and `src/routes/+page.svelte`.
- Owner-supplied backup: `/home/paul/Downloads/shopping-list-backup-2026-10-28.json`.
- Stillkey source, branding handover and independent deployment scripts.
- The legacy hosted URL was not accessible through the web reading tool; browser appearance has not been independently inspected for this draft.

The supplied version-1 export contains five shops, 11 rows and 182 history entries. No actual item names or personal backup content are reproduced here. The legacy app stores data in localStorage, has fixed shop names, purchased checkboxes, minimum quantity 1, case-insensitive duplicate incrementing, recent-first substring autocomplete, and manual ordering. Its input currently forces lowercase; preserving that restriction is not a requirement of this rebuild.

## 2. Confirmed owner decisions

Confirmed on 28 October 2026:

| ID  | Topic         | Confirmed behaviour                                                                                                                                                                                                                                                       |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Sharing       | One link shares every shop and the collection-wide autocomplete history. Anyone holding it has full editing access, without login.                                                                                                                                        |
| D2  | Offline use   | Allow offline editing. Persist changes locally and synchronise automatically on reconnect.                                                                                                                                                                                |
| D3  | Item actions  | No purchased checkbox or completion state in v1. Quantity stops at 1. Delete removes only the selected row and retains autocomplete history. Forget removes the selected row and suppresses its name in shared autocomplete. Manually adding the name remembers it again. |
| D4  | Letter case   | Preserve entered display spelling/case; match names case-insensitively.                                                                                                                                                                                                   |
| D5  | Default shops | New collections start with Aldi, Lidl and Tesco. Shops can be added, edited and removed.                                                                                                                                                                                  |

Working product name remains Shopping List; no final product name was requested or confirmed. No expiry, account system, separate read-only role or link revocation is included in v1. Technical architecture and the remaining interaction details below are the proposed implementation design; confirmation of these decisions does not start application implementation.

## 3. User experience and branding

Use the Stillkey forest/sage palette, system fonts, rounded cards, restrained borders, clear focus styles, light/dark/system themes, notices and toasts. See [brand reference](../BRAND.md). Give the new app a distinct icon/product name; do not copy authenticator claims such as “Nothing leaves this device”. Shopping data is intentionally sent to this app's server.

Prioritise one-handed mobile shopping: shop selectors near the top, an obvious item input, compact readable horizontal rows, and reliable touch controls. Use a responsive desktop layout in the same design family. All controls must remain usable at narrow mobile widths and with zoom; avoid squeezing long names between tiny buttons.

### 3.1 First visit and collection selection

- With no collection link or locally remembered collection, show Create a list, Open shared link, and Import backup.
- Collection creation requires the server. Never silently create or overwrite a remote collection while offline.
- After server creation succeeds, display its shops and a Share action. Explain that the link grants editing access.
- Remember the current collection on that device. Allow switching to another link or creating another collection without mixing cached data or pending changes.
- If more than one collection has been used, provide a small recent-collections chooser; entries are local to the device. A user-editable collection title is useful for identifying them.
- Distinguish invalid/unavailable links from transient network failures. Retain a previously cached collection if the server is temporarily unavailable.
- Joining a collection fetches its data; it does not upload the device's prior data automatically.

### 3.2 Shop buttons and management

- Replace the shop dropdown with labelled buttons showing the selected shop clearly. On narrow screens allow horizontal scrolling with a visible overflow affordance.
- Select a shop with one tap. Remember selection per collection/device; selection is not shared state.
- Provide Add shop and Manage shops actions. Shops can be added, renamed, reordered and deleted.
- Use stable shop IDs so renaming does not break item ownership or ordering.
- Reject empty/whitespace names and case-insensitive duplicate shop names within a collection. Preserve display spelling.
- Confirm deletion of a shop, stating how many rows will be removed. Delete only that shop's rows; preserve collection history.
- Allow deleting the final shop; then show an Add shop empty state. Do not invent an undeletable special shop.
- If another participant deletes the selected shop, select a surviving shop or show the empty state. Preserve and explain any unsent edits that can no longer apply.

### 3.3 Item cards and quantities

Each row contains a visually obvious drag handle, item name, minus button, integer quantity, plus button and ordinary Delete action. There is no purchased checkbox, strike-through completion state or completion action in v1.

- Add via Enter or an Add button. New rows start at quantity 1 and the end of the selected shop's order.
- Trim input; reject empty names; preserve display case. Define one shared normalisation function for case-insensitive matching and whitespace handling. Do not conflate genuinely different product names.
- Adding an existing normalised name in the same shop increments that row's quantity instead of creating a duplicate. The same name may appear independently in multiple shops.
- Minus is disabled at 1. Deleting is a distinct action, never an accidental consequence of decrementing.
- Actions respond immediately after their local persistence succeeds. If local storage fails, show a clear error; do not pretend an edit was safely queued.
- Ordinary Delete removes just that row and leaves its name available for autocomplete. Offer a short Undo; sync it as a deliberate restore operation, never by uploading an old whole snapshot.
- No prices, totals, units, barcode scanning, recipes or inventory management in v1.

### 3.4 Autocomplete and remembered items

- Share one history across shops in a collection, not across unrelated collections.
- Additions update history and last-used time. Removing a row normally does not forget the name.
- Match case-insensitive substrings, exclude forgotten entries, rank most recently used first, and show at most 10 suggestions. Resolve equal timestamps deterministically.
- Keep display spelling separate from the normalised key. Avoid forcing lowercase at keypress, paste or focus time.
- Selecting a suggestion adds it with one action and clears/refocuses the input. Support keyboard arrows, Enter and Escape with accessible combobox/listbox semantics.
- Typing a name must remain possible even if it was forgotten. Explicit manual addition remembers it again, as confirmed in D3.
- Provide a searchable Remembered items view, including a way to forget a suggestion even when it has no active row. Optionally show forgotten entries there with an explicit Remember action.
- Forget suppresses a normalised name collection-wide. It does not delete other shops' active rows with the same name. Those rows remain usable and are not automatically remembered merely by quantity changes or sync.

### 3.5 Editing, swiping and reordering

- Horizontal swipes reveal actions; they do not execute an action just because the threshold was crossed. Proposed mapping: swipe right reveals Edit; swipe left reveals Forget. Ordinary Delete stays on the row.
- Edit opens a name-edit dialog. Forget is labelled “Remove & forget” on an active row so its dual effect is clear.
- Provide a visible row overflow menu exposing Edit, Delete, Forget and move controls on every input device. Swiping must not be the only way to reach actions.
- Renaming changes that row and remembers the new name. If the old name is no longer desired in autocomplete, use the explicit Forget control; rename alone does not silently forget history.
- If rename would collide with another row in that shop, show a merge preview. A confirmed merge sums quantities and preserves the target row's position. If the sum exceeds the allowed quantity bound, reject the merge with a clear message rather than truncate it. Cancel leaves both unchanged.
- Only dragging the handle starts reordering. Vertical page scrolling, horizontal swipe and quantity taps must not trigger one another.
- Show a clear drag preview and insertion target; support touch, mouse and keyboard. Include accessible Move up/Move down alternatives.
- Persist order per shop and synchronise it. Keep incomplete gestures and open edit drafts stable during remote updates; apply or announce the update safely rather than stealing focus.

## 4. Sharing, access and privacy

As confirmed in D1, a link such as `https://shoppinglist.paulhiggins.cloud/#LONG_RANDOM_TOKEN` identifies and grants access to one collection. The short example token in the request illustrates the shape only; production tokens must be cryptographically random with at least 128 bits of entropy (prefer 32 random bytes, base64url encoded).

- Anyone holding the link can read and edit all shops and history in that collection. No user registration, password or attribution is needed for v1.
- The fragment is not automatically included in HTTP requests. The client reads it and explicitly authenticates same-origin API/event requests using it. It is an access credential, not an encryption key.
- Use an Authorization bearer header, never a token query parameter or URL path in backend requests. Do not log credentials, bodies containing credentials, or whole sharing links.
- Store a cryptographic digest of the access token on the server. Retain the token client-side only as needed for opening/sharing the collection; XSS, browser history, clipboard and recipients can expose it.
- Scope every database/API operation to the authenticated collection. Knowing an item/shop ID alone grants no access to another collection.
- Use HTTPS, no-referrer policy, restrictive CSP, input bounds, request/rate limits, no third-party analytics or runtime CDN assets. No CORS access for arbitrary origins.
- Shopping content is readable by the server operator and in server backups; do not claim end-to-end encryption or authenticator-level privacy.
- There is no public index of lists. Do not expire or delete abandoned collections silently in v1; any future retention policy needs explicit product documentation.
- Losing the link and all device copies means no automatic account-based recovery. Provide Share/copy link, local JSON export and clear recovery guidance.
- Without owner identity, link rotation or collection destruction cannot be owner-only. Those operations require a separate access design if requested later.

## 5. Synchronisation and offline behaviour

### 5.1 Proposed architecture

Use HTTP mutation commands plus a live server-sent event (SSE) stream to announce collection revisions. On an event, fetch the latest canonical snapshot and reconcile it with locally pending commands. This gives near-real-time updates without a bidirectional WebSocket protocol. It is a design proposal for the expected low overlap, not a benchmarked result.

SSE is a one-way server-to-client channel; edits still use HTTP. An authorised fetch-based SSE client can send the bearer header; native `EventSource` cannot simply be assumed to accept custom headers. Do not move the credential into a query string to work around this.

Provide a foreground polling fallback (approximately five seconds) when streaming is unavailable. Always revalidate on initial load, reconnect, window focus and page reveal. Mobile suspension is normal: do not promise background delivery while the OS has suspended the PWA.

Acceptance target on healthy foreground connections: another participant sees committed changes within two seconds via the live path; fallback within ten seconds. Reconnect/page reveal must converge without a manual page reload. Verify these targets in tests and device checks.

### 5.2 Local persistence

To support the offline editing confirmed in D2, use Dexie/IndexedDB for a confirmed server snapshot plus a durable per-collection queue of local commands. Cache app-shell assets separately with Workbox.

- After the first successful online load, launch and edit a known collection offline.
- Atomically persist a local command before presenting it as queued. Show Synced, Syncing, Offline with N pending changes, or Needs attention.
- Reconstruct the visible state from the last confirmed snapshot plus queued commands. Never label pending data as confirmed shared state.
- Queue operations survive reload, app update, server restart and network loss after send/before acknowledgement.
- Retry with backoff and jitter; use one sender per collection/browser via a multi-tab coordination mechanism. Server idempotency remains mandatory even with that coordination.
- Collections are isolated in cache, outbox and event subscriptions. Switching links cannot send one collection's queued work to another.
- If storage is cleared or evicted before sync, unsent edits can be lost. Provide export and pending-state visibility; do not promise browser storage is permanent.

### 5.3 Concurrent edits and conflict rules

Do not implement sync as last-writer-wins replacement of the complete JSON export. Use stable IDs, atomic server transactions and semantic commands with unique operation IDs.

- The server assigns a monotonic collection revision. Each accepted transaction records the operation result and revision atomically, then notifies subscribers.
- Retrying an operation ID returns its original result and does not apply it again. Reusing an ID with a different payload is an error. Preserve deduplication records for as long as the collection can retry its queued operations; do not prune them without an explicit queue-expiry/recovery protocol.
- Quantity changes are deltas, so two independent +1 operations both apply. Enforce quantity bounds on the server; reject impossible stale decrements rather than underflowing or deleting the row.
- Distinct items/shops and unrelated fields can change independently. Use field/entity preconditions where appropriate rather than rejecting everything because a global revision changed.
- Concurrent add of the same normalised name in one shop converges to one row with both additions counted. Return canonical IDs; remap dependent queued operations before sending them.
- Delete wins over later stale edits to the deleted entity. Tombstones or equivalent deletion tracking prevent resurrection. Retain the rejected user's draft/operation for review rather than dropping it silently.
- Edits to a deleted shop are not applied elsewhere. Offer recovery by copying the unsent content into a surviving/new shop.
- Two conflicting renames of the same entity produce a conflict with the server value and local draft; the user can explicitly reapply. Never silently lose the local text.
- Reorder commands move one item relative to stable neighbour IDs, not replace an old full ordering array. Server commit order resolves competing moves. Deleted anchors fall back to the nearest surviving anchor or the end; an absent moved item is a conflict. Document and test deterministic tie handling.
- Forget creates an explicit history suppression state. Ordinary stale history touches cannot unforget it. A deliberate later add/Remember may reverse it under D3; an offline add that predates a newly received Forget must ask before reversing the suppression.
- A rejected operation must not block unrelated queued edits indefinitely. Resolve/rebase independent commands; retain affected dependent operations for user attention. Expose an export of unsent work.
- After stream loss, fetch a complete snapshot with revision. Reconcile outbox results before replaying pending work so a lost acknowledgement does not cause visible double application.

## 6. Technology and module boundaries

### Frontend: match Stillkey

- React, strict TypeScript, Vite, Tailwind plus a small extracted design system.
- Dexie/IndexedDB for app data and durable local queues.
- vite-plugin-pwa/Workbox, locally bundled assets/fonts and prompt-based updates.
- Vitest for domain/sync tests; Playwright for browser, offline and multiple-client tests.
- Pinned dependencies and a lockfile; choose maintained compatible versions at implementation time.

Do not carry over OTPAuth, ZXing, protobuf, Argon2id or the encrypted authenticator vault unless a separate requirement needs them. The shared server is an intentional addition to Stillkey's static-only model.

### Backend: proposed extension

Use a small Node.js/TypeScript service with SQLite in a persistent Docker volume. Pin a supported Node runtime and choose a maintained HTTP library/SQLite driver during implementation. Use one API instance initially; Redis, distributed locking and multi-server scaling are unnecessary for the stated usage.

Keep validation and command types shared between browser and server where practical, while making the server authoritative. Separate modules for shops/items/history, legacy import, persistence, sync/outbox, API authentication/events and UI components.

Suggested project layout:

```text
src/components/         reusable branded UI
src/features/           shops, items, autocomplete, sharing, backups
src/data/               IndexedDB, snapshots, outbox, sync
shared/                 schemas, normalisation, command/result types
server/                 API, SQLite, authentication, SSE, migrations
tests/                  production browser and multi-client tests
deployment/             this app only: package, deploy, rollback, verify
docs/                   architecture, operations, migration and validation
```

### Conceptual persisted model

| Entity            | Required fields / invariants                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Collection        | Stable ID, title, token digest, schema version, server revision, timestamps                                              |
| Shop              | Stable ID, collection ID, display name, normalised name, order, deletion metadata                                        |
| Item              | Stable ID, shop/collection ID, display name, normalised name, integer quantity, order, field revisions/deletion metadata |
| History entry     | Collection ID + normalised name, display name, last-used timestamp, forgotten state and version                          |
| Operation receipt | Collection ID + operation ID, payload fingerprint, outcome, assigned revision                                            |
| Client outbox     | Collection ID, operation ID, local sequence, semantic payload, dependency/precondition metadata, delivery state          |

Browser display timestamps are not authoritative conflict ordering. Server revisions determine commit order. Selected shop, UI theme, open menus and draft text are device preferences rather than shared shopping state.

## 7. API contract requirements

Define and test a versioned JSON API under `/api/`, with endpoints for collection creation, authorised snapshot reads, semantic commands and authenticated event subscription. Use an app health endpoint independent of shopping content.

- Creation returns the token once plus initial state. No unauthenticated list enumeration.
- Snapshot includes schema version, server revision, shops/items/history and enough sync metadata to reconcile queued operations.
- Commands accept unique operation IDs and typed payloads; return accepted canonical changes, canonical IDs/revision or a structured recoverable conflict. Expected conflicts are not generic server errors.
- Scope database reads, writes and receipts using the authenticated collection, not client-supplied ownership fields.
- Validate on client and server. Proposed bounds: shop name 80 characters, item name 200, collection title 100, quantities 1–999, 100 shops, 10,000 active items, 50,000 history entries, JSON import at most 5 MiB. Make bounds explicit/configurable and reject excess without truncation. Confirm existing imported data fits before rollout.
- Bound command batches, stream connections and unauthenticated collection creation. Use transactions and parameterised SQL; treat imported object keys as data.
- Set API and event responses to `Cache-Control: no-store`; service-worker caches must not store them. Do not expose credentials or private content through error/log output.
- Event streams send revision notifications, heartbeat, and reconnect cleanly. Reauthorise reconnects; full snapshot recovery works even if events were missed. No durable event log is required when full snapshot reconciliation is correct.

## 8. Legacy migration, exports and backups

### 8.1 Supported input

Import the supplied legacy version-1 shape:

```typescript
interface LegacyExportV1 {
  version: 1;
  exportedAt: string;
  lists: Record<
    string,
    {
      items: Array<{
        id: string;
        name: string;
        quantity: number;
        purchased: boolean;
      }>;
    }
  >;
  itemHistory: Record<
    string,
    {
      lastUsed: number;
      forgotten: boolean;
      originalName?: string;
    }
  >;
}
```

- Validate all fields, types, lengths, totals and versions before committing anything. Unknown versions are rejected with a useful message.
- Import every shop key, including custom shops; do not retain the legacy fixed-shop whitelist.
- Preserve shop/item array order, quantities, display spelling, history last-used timestamps and forgotten flags. Accept and validate the legacy `purchased` boolean for compatibility, but do not migrate it into the new active model: import every row regardless of its value, with no completion state or filtering. Explain this in the preview so no row disappears because it was previously checked.
- The Aldi/Lidl/Tesco defaults apply only to newly created empty collections. Import preserves all five legacy shops, including Dunnes and Other; defaults never replace imported shop configuration.
- Assign stable new shop IDs; validate/regenerate item IDs with an explicit mapping if duplicates/collisions exist. Do not trust IDs from different shops to be globally unique.
- Normalise history keys consistently, report collisions, and preserve suppression conservatively. Do not silently resurrect forgotten suggestions while rebuilding history from active rows.
- Show a preview of shops/rows/history, warnings and duplicate handling before save. The supplied backup should preview 5 shops, 11 rows and 182 history entries without dropped data.
- Default import creates a new collection. Never overwrite a shared collection just because a file was opened. V1 does not require a general merge-import mode into a populated collection.
- Import into a new shared collection is atomic on the server. A network retry must not create duplicate populated collections; use an idempotent creation/import request identifier.
- Local parsing/preview may work offline; remote collection creation/commit requires connection. Keep the source file unchanged.

The new origin cannot read the old site's localStorage directly. Migration uses export from the old app and import into the new app. No live-site data extraction or server upload happens during this specification phase.

### 8.2 New export and restore

Provide a versioned JSON export of the collection's shops, rows/order and complete history. Include export time and sync status. If changes are pending, clearly distinguish a local visible-state export from a confirmed-server export; do not imply pending work has reached everyone.

Do not include the sharing token in normal data exports. A backup imports as a new collection with a fresh link; it is not automatically a means to overwrite the original collection. Keep Share/copy link separate. Reject malformed backups before any changes.

### 8.3 Server backup and recovery

Use a database-consistent SQLite backup method and back up server configuration separately. Do not blindly copy a live database file and ignore its WAL. Propose daily snapshots, seven daily and four weekly copies, plus an independent off-VPS copy; final backup destination and retention need owner configuration during deployment. Do not claim this is scheduled merely because it is specified.

Rehearse restore into an isolated stack and verify collection access and item/history integrity. Restoring an older server database can invalidate assumptions in client receipts/revisions: document a recovery epoch and require clients to reconcile/export pending work rather than silently replaying against an unrelated restored history.

## 9. PWA, installation and safe updates

- Manifest/icons for this application at the root of its own origin; standalone mode and install guidance for supported browsers.
- All app-shell assets bundled locally and available offline after successful initial preparation. No runtime external fonts/scripts.
- Prompt before service-worker activation. Persist drafts/outbox before reload; show pending edits and keep them across update. Do not reuse Stillkey's vault-lock action for this app.
- Version IndexedDB, API and server schema deliberately. Refuse unsupported future formats safely. Maintain compatibility between old cached clients and a new backend during rollout, or clearly require an update without discarding pending edits.
- Safe update testing must cover the period where an old PWA sends commands to a new API. Server schema migrations need a recovery plan beyond container rollback.
- Retain older hashed assets for a defined rollout window or implement a tested missing-chunk recovery path; the Stillkey packager does not itself preserve old assets.
- Distinguish connection state from sync state; `navigator.onLine` alone does not establish server reachability or successful save.
- Real iOS/Android checks must cover installation, standalone launch, background/page reveal, touch dragging/swipe, keyboard/input and offline queue recovery.

## 10. Deployment alongside existing applications

Use the existing VPS with one shared public Caddy gateway. Add a separate `shoppinglist` Compose project and domain route. Do not rebuild the server or redeploy Stillkey/MyClinicHelper.

Proposed services:

- `web`: non-root Caddy static server, internally on 8080; proxies `/api/*` to the API service and serves the built PWA.
- `api`: non-root Node/TypeScript service with a persistent SQLite data volume, reachable only from this app's private network.
- Gateway route `shoppinglist.paulhiggins.cloud` → `shoppinglist-web:8080` on a dedicated internal proxy network.

Only the gateway publishes internet-facing ports. The API/database are not publicly bound. Since the app network is internal, avoid assuming API internet egress is available or necessary. The database is a volume used by the API, not a separate SQLite server container.

Serve correct security/cache headers for shell/assets and API, maintain HTTPS, preserve event streaming through both proxy hops, and test that events are not buffered. Health checks cover both services and database readiness without exposing user content. Apply read-only roots, dropped capabilities, no privilege escalation, writable mounts only where needed and bounded logs.

### One-time onboarding

Inspect/back up live gateway settings, create this app's directories/networks/volumes, install its initial release, then add only its gateway network attachment and domain route. Validate changes and verify all existing domains. Adding a Docker network attachment can require gateway recreation; do not pretend every change is a route-only reload. Do not run `infrastructure/initial-vps/` installers on the working VPS.

### Routine releases

Adapt Stillkey's app-only packaging, checksum, transfer, lock, retained prior images, resolved Compose snapshots, health wait and automatic/manual rollback. Extend it for two services and migration safety. No app update writes shared gateway configuration or another app's environment. No update deletes the database volume.

Code rollback must be compatible with the current database schema; take a consistent pre-migration snapshot and define recovery before destructive migrations. Keep routine initial onboarding separate from later updates. Validate with isolated synthetic neighbours and assert their files/container identities remain unchanged during app-only releases.

See [deployment handover](../DEPLOYMENT.md) for the existing infrastructure boundaries.

## 11. Required test coverage and acceptance

Use synthetic data in committed fixtures. Use the supplied backup for local preview validation only; do not copy its contents into source control, screenshots, logs or CI artifacts.

### Core and migration tests

- Shop add/rename/reorder/delete, zero-shop state, long/custom names and duplicate detection.
- Item add, duplicate increments, quantity bounds, absence of completion controls, rename/merge, delete/undo and Forget/Remember rules.
- History matching/ranking, normalisation, suppression, old-name behaviour and collection isolation.
- Valid legacy migration, unsupported version, malformed types/oversized input, colliding IDs, forgotten entries, legacy purchased=true and purchased=false rows retained without completion state, custom shops and atomic failure.
- Native export/reimport, preservation of order and metadata, exclusion of token.

### Interaction and PWA tests

- Shop buttons on desktop/mobile, overflow, keyboard navigation and selected-state accessibility.
- Swipe reveal in both directions without immediate action, visible alternative actions, drag handle only, vertical scroll coexistence, pointer cancellation and keyboard reorder.
- Dialog focus/Escape, autocomplete selection, long text, light/dark themes and no horizontal document overflow.
- Production offline launch, offline edits persisted across reload, reconnection, pending-state display and safe service-worker update.

### Multiple-client and recovery tests

Use two independent browser contexts sharing a collection plus a third unrelated collection:

1. A adds an item; B sees it without reload, including across shop switches.
2. A and B increment the same row; both increments remain.
3. Both add the same name concurrently; one row remains with correct quantity and dependent commands remapped.
4. Both change unrelated fields; both changes remain.
5. Rename conflict retains the losing draft and offers a clear resolution.
6. Delete versus offline edit does not resurrect a removed item/shop; unsent work remains recoverable.
7. Reorder concurrent with add/delete gives a deterministic valid order and no lost rows.
8. Forget cannot be undone by a stale history refresh or previously queued add without attention.
9. Lost acknowledgement/retried batch/reload/restart applies each operation once.
10. One device edits offline while the other edits online; reconnect converges under the specified conflict rules.
11. Switching collections or multiple tabs never leaks state, operations or events between collections.
12. Stream failure falls back to polling; page reveal catches missed changes; backend outage never appears as a successful sync.
13. Other collection tokens and guessed item IDs cannot access/mutate the shared collection.
14. First-import retry is idempotent, consistent backup restores successfully, and old/new client versions behave safely during rollout.

### Deployment acceptance

- Health and public HTTPS checks pass, API is private, headers/MIME/cache policy are correct, streaming works through Caddy.
- Database survives container replacement/restart; backup restore is rehearsed.
- Unhealthy release and manual rollback are tested, including schema compatibility limits.
- Neighbouring applications remain unchanged during routine deployment.
- Typecheck, lint, relevant unit/integration/browser tests and a dependency review pass. Record actual versions/results and remaining device checks; do not claim an independent security/accessibility audit.

## 12. Implementation phases after specification agreement

1. Foundation: separate workspace/repository, branded shell, domain model, shops/items/history, tests.
2. Migration and local behaviour: version-1 preview/import, durable IndexedDB, gestures, accessibility and exports.
3. Shared backend: SQLite, capability access, transactional commands, revisions and idempotency.
4. Sync: durable outbox, conflicts, streaming/poll fallback and multi-client tests.
5. PWA: installation, offline launch, safe updates, old-client compatibility and device checks.
6. Deployment: isolated two-service rehearsal, backup/restore, onboarding plan and independent releases.

Deliver source, lockfile, app icons, this updated spec, README, architecture/data-sync notes, privacy/access explanation, migration guide, deployment/rollback/backup runbooks and honest validation evidence. Keep implementation and deployment reviewable in small phases.

## 13. Technical references

- [Stillkey handover overview](../README.md).
- [MDN: using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events): SSE is one-way server-to-client messaging; the proposed HTTP-plus-events split follows that property.
- [SQLite: backup API](https://sqlite.org/backup.html): use a supported consistent backup/snapshot approach for live databases.

These references inform the proposed architecture; they do not establish that this not-yet-built app meets its acceptance criteria.
