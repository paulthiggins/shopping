# Brand and interface reference

Use Stillkey's visual language to make the new app feel part of the same family. The new app should have its own product name, icon identity, and meaningful navigation/copy. The source of truth is the complete `src/style.css`, including its late contrast and mobile overrides.

## Colour tokens

These are effective values after the current CSS cascade, rather than just the first declarations in the file.

| Token       | Light     | Dark      | Role                           |
| ----------- | --------- | --------- | ------------------------------ |
| `--bg`      | `#f6f7f3` | `#151f1a` | Page background                |
| `--panel`   | `#ffffff` | `#1d2a23` | Cards, dialogs, controls       |
| `--text`    | `#233a33` | `#e1e8dc` | Primary text                   |
| `--muted`   | `#64715f` | `#acb9a6` | Supporting text                |
| `--line`    | `#e3e8df` | `#344036` | Borders and dividers           |
| `--green`   | `#244f3f` | `#456d4c` | Primary actions and brand mark |
| `--soft`    | `#eaf0e6` | `#2b3d2d` | Soft highlighted surfaces      |
| `--sidebar` | `#f0f3ec` | `#19271e` | Navigation background          |

Other accents: heading dot `#9aaa77`; brand dot `#89a76a`; light primary hover `#35634b`; destructive button `#a33f34`; focus outline `#79a17c`. Existing PWA theme colour is `#132c27` and manifest background is `#f5f6f2`; these differ slightly from the CSS page background. Set manifest, HTML metadata and icons deliberately for the new app.

## Typography and shape

- Local system font stack: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Inter is a preference if installed, not a downloaded font.
- Restrained weights, dark forest text, generous whitespace, short page introductions. Small uppercase, letter-spaced eyebrow labels give structure.
- Rounded rectangular controls: buttons around 8px, inputs 9px, cards 12px, dialogs 15px. Borders are subtle; shadows are soft.
- Inline SVG icons use a 24×24 viewBox, no fill, round strokes, `currentColor`, and stroke width 1.7. Use visible text or accessible labels for actions.
- Keep the style, but choose readable type sizes for the new app's content. Existing small decorative text sizes are not an accessibility target to reproduce blindly.

## Shell and components

Desktop: fixed 238px sidebar, brand at the top, selected navigation with a soft green background, supporting status at the bottom. The workspace has a top bar, page heading with a primary action, then search/filter controls and the main content.

Responsive rules adjust at 1100px and 760px, with a wider-screen adjustment from 1500px. Reuse behaviour from the CSS rather than fixing a desktop layout to a small screen. Keep main actions and icon controls usable by touch; mobile overrides use 44px targets.

Extract small components into the new app: `AppShell`, `Brand`, `Icon`, `PageHeader`, `Button`, `Field`, `Dialog`, `Notice`, `Toast`, and `EmptyState`. These names are proposed components, not existing exported modules. Separate domain logic from this shell.

Use native `<dialog>` with an accessible heading, visible close control, initial focus, Escape handling and tested keyboard navigation. Confirm focus restoration in the new app. Show errors near the action and preserve entered values after failure. Use status messages for brief success feedback. Respect reduced-motion preferences.

Support light/dark/system themes through `data-theme` on the document root. Store the preference using the new app's own settings mechanism; Stillkey stores it inside its encrypted vault.

## Branding and language

Retain the forest/sage palette, calm surfaces, wordmark proportions and optional dot accent. Existing shield artwork and app icons belong to Stillkey's identity; use them as references unless the owner explicitly wants the identical mark for both apps. Check icon legibility at small sizes and maskable crop safety.

Write short, specific action labels. Combine alternative ways of performing the same task under one clear entry point, as with the revised Add account dialog. Explain supported clipboard/file input explicitly; invisible capabilities are easily missed. Use empty states to give a useful next action.

Only use claims such as “Nothing leaves this device”, “Available offline”, or “No account required” when the new app actually satisfies them. Replace authenticator-specific footer text, installation guidance, security promises and screenshots as needed.

## Visual acceptance

Compare light/dark desktop and narrow mobile screens against Stillkey. Check long names, empty/loading/error states, open dialogs, validation errors, keyboard focus, reduced motion, and overflow at zoom. Test contrast in the actual new screens; the palette alone does not establish accessibility compliance.
