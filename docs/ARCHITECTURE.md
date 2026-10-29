# Architecture and privacy

## Application boundary

React/strict TypeScript/Vite/Tailwind provide the responsive shell. Dexie stores a server-confirmed snapshot and outbox per collection. Workbox precaches only built public assets. A Node 24 TypeScript HTTP service stores shared data in SQLite, using the built-in `node:sqlite` module. No external fonts, analytics, identity provider or third-party runtime API is used.

The server is one process/replica. SQLite uses WAL and transactions. Collection documents are JSON records, validated through shared semantic commands; operation receipts are separate SQL records. This keeps low-overlap household edits simple without a distributed service or CRDT. Every command transaction atomically updates a snapshot and its retry receipt. No raw whole-snapshot write API exists.

## Sharing and credentials

The browser generates a 32-byte cryptographically random base64url capability token. It appears in the shared URL fragment and is explicitly sent in same-origin bearer headers. The server stores its SHA-256 digest. Every read/write/event subscription is scoped to that credential's collection. Request URLs and event streams contain no credentials. No application access/request body logging is enabled.

Anyone holding the token has full access; there is no separate owner, login, revocation or reader role. The token is retained in browser storage/history and is visible in the clipboard after sharing. Server operators/backups can read shopping contents. XSS or device compromise can expose links and local data. Exported data omits the token. Losing every copy of the link has no account recovery route.

Production uses HTTPS, restrictive security headers, no-referrer and same-origin access checks. The API limits creation/request rate and concurrent streams, validates payload sizes/types, uses parameterised queries and has no unauthenticated listing API. Default creation throttling is deliberately low; operators must size limits for expected usage. Behind Caddy, the current limiter sees the app proxy's socket address, so the budget is aggregate for that proxy, not reliably per internet user. Do not blindly trust forwarded headers to change this.

## Sync and conflicts

Local edits first commit to IndexedDB. The UI applies pending commands optimistically over confirmed state. Web Locks coordinate senders across tabs; SQLite receipts still enforce idempotency. A successful reply atomically stores canonical state and removes the acknowledged job. Duplicate additions return the existing row ID, and dependent queued references are remapped. Failed semantic operations stay in a conflict queue with their payload.

HTTP writes are paired with authorised fetch-based SSE revision notifications. There is no periodic snapshot polling while SSE is healthy. A five-second fallback runs only while the event stream is unavailable and the page is visible, and stops on reconnection. Connect/reconnect, focus/reveal and returning online reconcile immediately. Heartbeats maintain liveness without fetching snapshots; a stalled stream is timed out and retried with bounded backoff. Failed writes have their own retry timer, and committed pending outbox work wakes other tabs through Dexie notifications rather than relying on polling. An event triggers the same serialised sync loop; it does not independently overwrite browser state while a mutation acknowledgement is being handled. Device suspension has no background-delivery guarantee.

Quantity deltas compose; deleted entities cannot be edited back into existence. Name edits carry name-field revisions, so independent quantities do not invalidate a rename. Conflicting renames retain their local draft. Explicit merges require confirmation and bounded sums. Forget has a revision so an older offline addition cannot silently restore a newly suppressed suggestion. Reorders move stable IDs before an anchor or the end.

Receipts are retained for the life of the collection; do not prune them without a defined outbox expiry/recovery protocol. The current implementation may surface a conflict rather than automatically rebase some chains of dependent offline renames. It preserves those operations for review instead of discarding them.

## Formats and recovery

The domain state and native backup schema are version 1. Purchased flags exist only in the legacy input shape, not the new model. Import is validated before collection creation; custom shops/order/history survive. Browser/database schema migrations must not silently reinterpret unknown future formats.

SQLite image rollback is separate from data restore. Normal releases currently use a single compatible database schema. A restored older DB must get new recovery epochs, making old queued commands require review rather than silently replaying against restored history. See BACKUPS.md.

## Module map

- `shared/model.ts`: normalisation, bounded validation, domain commands, import/export.
- `server/store.ts`: credential hashes, transactional documents/receipts, idempotent creation.
- `server/index.ts`: HTTP API, event streams, headers, limits, local production serving.
- `src/data.ts`: Dexie persistence, optimistic state, cross-tab outbox, conditional fallback and failed-request retry scheduling.
- `src/live-updates.ts`: authenticated SSE, heartbeat liveness, stalled-stream watchdog and reconnect lifecycle.
- `src/App.tsx`: app shell, dialogs, input, shop/item/history management and gestures.
- `src/style.css`: extracted visual language with responsive/dark/accessibility styles.

Some UI remains in a large App component for the first build. Split feature components as the next iteration grows; do not entangle API/storage rules with visual components.
