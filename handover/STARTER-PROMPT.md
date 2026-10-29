# Starter prompt for the new app chat

Replace the bracketed fields, then paste the following into a new chat in the new app's workspace. Make the existing source and this handover directory accessible to that chat.

---

Rebuild my existing application using the engineering and visual approach established in Stillkey.

Existing application: [NAME AND SOURCE PATH/REPOSITORY]
New project workspace: [PATH]
New application domain: [DOMAIN OR TO BE DECIDED]
Essential workflows to preserve: [LIST OR ASK ME AFTER INSPECTING THE APP]
Changes I want: [LIST]
Existing data/users and migration requirements: [DETAILS OR TO BE DETERMINED]
Offline/backend requirements: [DETAILS OR DETERMINE FROM THE EXISTING APP]
Stillkey reference repository: [/home/paul/my-authenticator IF ACCESSIBLE]

Read `handover/README.md`, `BRAND.md`, `REBUILD.md` and `DEPLOYMENT.md`. Inspect the existing app before designing its replacement. Tell me what you found, identify important ambiguities, and preserve existing behaviour/data unless we agree changes. Ask for inaccessible source rather than guessing.

Reuse Stillkey's forest/sage visual language, responsive shell, theme behaviour, control styling and calm writing. Give this app its own product identity. Extract reusable UI components; do not copy the authenticator state machine or business logic wholesale. Only carry over encryption, QR, OTP or other specialised dependencies if the new app requires them.

Use a separate repository. Preserve reproducible builds, strict types, meaningful domain tests, production-browser checks and honest validation notes. Define data schemas/migrations and a recoverable legacy-data import before replacing storage. Do not copy real user data into fixtures or git.

Deploy alongside the current applications using the existing single Caddy gateway and a separate Compose app stack, domain and network. Routine releases must update only this app and provide health checks plus automatic/manual rollback. Prepare a separate one-time app onboarding procedure; do not rerun the VPS bootstrap or combined installer. Do not modify live infrastructure while implementing locally. First inspect the live setup if deployment work is requested.

Determine whether a static PWA suits the actual requirements. If a backend is needed, explain its services and data ownership; do not silently remove existing server functionality. If offline use is required, test real built assets offline and an update from an older installed version with existing data. Preserve unsaved work and handle incompatible schemas safely.

Deliver the rebuilt app, an updated README, architecture and migration notes, brand-consistent screens, independent deployment/rollback instructions and a record of checks actually run. Start with an inventory and a phased implementation plan, then implement the agreed scope.

---

The bracketed fields are intentionally unresolved. This handover does not assume a domain, runtime, data model or identity for the next app.
