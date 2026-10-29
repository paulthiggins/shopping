# Rebuild brief and engineering lessons

## Inspect before replacing

Start with the existing app running locally, its source, documentation and synthetic representative data. Record the routes/screens, main workflows, calculations, import/export formats, persistence, integrations and any behaviour users depend on. Identify what is already correct before changing its appearance or architecture.

Produce a short behaviour inventory with “preserve”, “change”, and “retire” decisions. Clarify real ambiguities with the owner. Preserve the old source and a usable data export before implementing destructive migrations. Keep unrelated Stillkey and VPS work out of this rebuild.

## Decide the application boundary

Stillkey uses React, strict TypeScript, Vite, Tailwind plus custom CSS, Vitest and Playwright. It builds to static files. Dexie/IndexedDB, encrypted storage, QR libraries, Argon2id, protobuf and OTP generation serve Stillkey's requirements; bring them across only when the new app needs them.

If the existing app needs authentication, collaboration, server-held secrets or scheduled server work, design those explicitly. Browser-delivered code cannot hide API credentials. A shared Caddy gateway and per-app Compose stack can also host an app with a backend and private database; that is an extension requiring its own data backup, health checks and deployment tests.

For a larger app, split presentation, domain logic, storage and integrations early. Stillkey's large `App.tsx` is a behavioural reference, not the preferred module layout for every future project.

## Data and migration

Give the new app its own IndexedDB database name, event-channel names, cache/manifest identity and backup format identifiers. Define versioned schemas. Validate imports fully before committing changes, bound input sizes, and make writes atomic where appropriate. Refuse unsupported future versions without overwriting them.

Use representative synthetic fixtures. Do not put production exports, credentials or personal data into git or screenshots. For legacy data, document export, conversion, verification and recovery. A source-code rollback is not automatically a data-schema rollback: retain backward compatibility or provide a tested data recovery route.

A new domain is a different browser storage origin. Existing browser data does not move with a server deployment or a DNS change. Provide and test export/import before migrating local-only users to another origin.

If sensitive local data needs password encryption, study `src/vault.ts` and the threat model first. Do not invent cryptography or assume a password screen alone encrypts data. New privacy/security claims need their own assessment.

## Offline use and updates

The reference precaches build assets with vite-plugin-pwa/Workbox, bundles dependencies locally and prompts before activating an update. IndexedDB data is separate from service-worker caches. Development mode is not proof of production offline behaviour.

For the new app, define which workflows work offline and whether queued writes or conflict resolution are required. Do not blindly cache authenticated API responses. Warn about unsaved changes and activate updates at a safe point; Stillkey locks its vault before reloading, which may not be the right action for another app.

Test a real production build: first online load, service-worker activation, disabled network, reload, key workflows, and upgrade from build A to build B with existing data. Emulated mobile viewports and WebKit tests do not replace physical iOS/Android installation and permission checks.

## Concrete lessons from Stillkey

- Input decoding can fail before parsing. Dense QR images required bounded image retries; synthetic regressions were added without storing users' secrets.
- Real export formats may differ from initial assumptions. Explicit supported versions, validation and clear unsupported-format messages matter.
- Multiple entry buttons for the same goal add friction. Prefer one task entry point with clear input choices and preview before save.
- Independent app releases prevent an unrelated site from being redeployed. Test that independence by checking other containers and shared files remain unchanged.
- Backups need a restore rehearsal. A requested browser download is not proof of a safe backup.
- Record what was actually tested and what still needs device validation. Passing automated tests is not a security audit.

## Suggested delivery sequence

1. Inventory the existing app and agree the migration/data contract.
2. Build the branded shell with representative empty, populated and error states.
3. Reimplement one complete essential workflow, with real persistence and useful tests.
4. Complete the remaining workflows and legacy import/migration.
5. Add offline/install/update behaviour where required.
6. Adapt independent packaging and rehearse deployment, failure recovery and data restore.
7. Deploy to the new app's domain, verify publicly, then migrate users/data deliberately.

Acceptance should include preserved business behaviour, usable branding on mobile/desktop, no accidental third-party requests, successful migration and restore, safe upgrades with existing data, and unchanged neighbouring apps during a routine release.
