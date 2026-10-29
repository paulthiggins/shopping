# Handover: rebuilding another app with the Stillkey approach

Prepared 28 October 2026 from this repository. This is a reusable project handover, not a deployment bundle. No production services were changed.

## Start here

Create a separate repository for the new app. Keep Stillkey independently buildable and deployable. Give the new app its own name, domain, Compose project, network, storage identifiers, and release archive prefix.

Read these files in order:

1. [Brand and interface](BRAND.md): colours, layout, components, assets, and writing style.
2. [Rebuild brief](REBUILD.md): how to inspect the existing app and preserve its behaviour/data.
3. [Deployment handover](DEPLOYMENT.md): shared gateway, independent releases, onboarding and recovery.
4. [Starter prompt](STARTER-PROMPT.md): paste into the new coding chat with the old app source available.

## What to bring to the new project

Copy this entire `handover/` directory, and make the Stillkey repository available as a reference. If the next agent cannot access this repository, supply these source references too:

| Reference                                                                | Purpose                                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `src/style.css`                                                          | Full visual reference, including responsive and dark-theme overrides             |
| `src/App.tsx`                                                            | Shell, inline icons, dialogs, theme and update interactions; extract selectively |
| `public/icon-192.png`, `public/icon-512.png`, `public/maskable-512.png`  | Existing brand assets as references; create distinct app identity before release |
| `vite.config.ts`, `index.html`                                           | PWA configuration and security policy reference                                  |
| `package.json`, `package-lock.json`, TypeScript/ESLint/Playwright config | Reproducible toolchain reference                                                 |
| `deployment/` excluding `out/`                                           | Tested app-only release/update/rollback design                                   |
| `infrastructure/` excluding all `out/` directories                       | Shared infrastructure reference; not an installer to rerun                       |
| `ARCHITECTURE.md`, `SECURITY.md`, `THREAT_MODEL.md`, `VALIDATION.md`     | Design reasoning and recorded validation limits                                  |
| `.gitignore`, `tests/update.spec.ts`                                     | Exclusion rules and production service-worker update test pattern                |

These are references, not a ready-made application template. In particular, `App.tsx` mixes shell and authenticator behaviour; extract reusable components rather than carrying the whole file into the new app.

Do not copy `.git/`, dependencies, builds, generated archives, `.env` files, private QR samples, backups, or actual user data. Do not copy Stillkey's tests and claim they validate another app.

## Decisions still needed

- App name, source path/repository, and intended domain.
- The existing app's essential workflows and what should change.
- Existing data format and migration/export needs.
- Whether it needs a backend, login, shared data, uploaded files, or external services.
- Whether offline use is essential, useful for selected workflows, or unnecessary.

A static PWA is a good match only if those requirements fit. Keep the shared deployment model even if the new app needs additional backend/database containers.

## Current reference status

Stillkey's Add account action now opens the former import workflow: camera, image upload, image paste, or authenticator URI, followed by preview. There is no separate Import entry button or manual-add dialog; editing existing accounts remains available. The original `SPEC.md` predates this UI change.

For that change, build and lint passed, 37 unit tests passed, and 20 Chromium desktop/mobile browser tests passed. Earlier cross-browser and container validation is recorded in `VALIDATION.md`; these results apply to Stillkey, not the new app. Dependency audit results there are historical and must be checked again for a new release.

## Shopping List rebuild

The first app-specific draft is [Shopping List specification](shopping-list/SPEC.md), based on the legacy source and owner-supplied version-1 export. The owner confirmed product decisions D1–D5 on 28 October 2026, including offline editing, link-based sharing, no purchased checkbox and Aldi/Lidl/Tesco defaults. Section 2 records those decisions; application implementation has not started.
