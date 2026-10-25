# UI icons

Bootstrap Icons is an exact-version frontend dependency recorded in the genuine
npm lockfile. `AppIcon.vue` imports a small, explicit set of SVGs from the package
at build time. Vite bundles these with the application: no icon font, external
sprite, CDN or extra runtime request is required. The package's MIT notice is
copied to `frontend/public/bootstrap-icons-license.txt` and included in `dist/`.

The shared component owns the outer SVG, uses `currentColor`, and exposes only
known icon names to TypeScript callers. Its HTML input comes exclusively from
trusted package SVG imports; never pass user-authored markup to it. All icons
are decorative (`aria-hidden`, `focusable="false"`). The containing button or
link retains its translated visible label or an explicit accessible name.

## Action vocabulary

| Action | Bootstrap icon |
| --- | --- |
| Move up / down | `arrow-up` / `arrow-down` |
| Add | `plus-lg` (test/lesson creation uses file/folder plus) |
| Remove | `trash3`, with the existing danger color and visible label |
| Duplicate | `copy` |
| Edit / replace | `pencil-square` |
| Preview | `eye` |
| Save | `floppy` |
| Publish / open public / copy link | `upload` / `box-arrow-up-right` / `link-45deg` |
| Retry / unpublish | `arrow-counterclockwise`, with visible text |
| Content kind | `text-left` / `image` / `play-btn` |
| More actions / expand / collapse | `three-dots` (vertical in catalog) / chevrons |
| Assign / unpair / paired connection | `link-45deg` / `x-lg` / `arrow-left-right` |

Standalone icon buttons have at least 40 × 40 CSS pixels and 20 px icons. Shared
author-menu triggers and action rows have at least 44 px targets. Block insertion,
movement and removal share the block's local disclosure rather than repeated
standalone controls. Preserve
disabled states, focus indicators, keyboard operation and translated titles.
Retain text for less obvious actions; a selected learner card's check means
selection, never correctness before submission.

## Verification

Build/typecheck, then exercise block movement/removal, nested SVG clicks in
menus and buttons, duplication, media selection/cancel, save/reload and learner
pairing/unpairing. Inspect the editor, catalog menus and learner cards in Czech
and English at desktop and phone widths, including narrow matching columns.
Check icon rendering without external asset requests, accessible control names,
keyboard focus, disabled boundaries, compact spacing and horizontal overflow.

Only the frontend build output needs deployment. Backend, schema and saved
test content are unchanged.
