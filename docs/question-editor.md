# PoC-B 02 — Question authoring increment

**Status:** Implemented in [draft PR #25](https://github.com/Radouch/TestBraid/pull/25); automated frontend/PHP tests pass. Real-host acceptance **not yet performed**. PR #24 (safe deletion) remains separate and does not block this feature.

## Architecture

This branch starts from the merged `main` containing PoC-B 01's author catalog, **not** from the unmerged `feature/poc-b-safe-deletion`. It changes only frontend files and CI: no new PHP endpoint, schema, Composer dependency or database is required. Later merging PR #24 may require trivial reconciliation within `frontend/src/components/AdminCatalog.vue`; neither PR should be merged until accepted.

Authors first **create a draft** in the group/test catalog. Select that saved draft and choose **Edit questions** to open `/admin/tests/<uuid>/questions`. The editor obtains an authenticated session and loads the canonical JSON test using `GET /api/admin/tests/{id}`. A published test is view-locked and must be unpublished separately before question editing.

The editor keeps question data locally until **Save questions** is selected. Saving transmits a full validated-on-server test document through the existing CSRF-protected `PUT /api/admin/tests/{id}`. Metadata fields are re-read from the server on save rather than overwritten from an earlier page load. A best-effort `updatedAt` preflight helps detect prior writes in another tab, but it is **not transaction-safe conflict resolution**; concurrent edit protection is excluded from the initial PoC.

## Question formats

- **Choice:** Single or multiple answer mode, editable prompt and answer content, add/remove/reorder options, tick correct options. Switching to single mode retains only one correct selection.
- **Matching:** Two editable columns, add/remove pair rows and assign one-to-one correspondences by dropdown. Assigning a right item already used by another left item removes the prior match; the author can resolve incomplete assignments before publication. No drag-and-drop.
- **Content blocks:** A question prompt or option/item supports a mix of text, private JPEG/PNG/WebP image and MP4/WebM video blocks. Authors may reorder blocks, paste the UUID of a previously uploaded media file, or upload through the existing FilePond component. Images and videos preview through the author-only endpoint; no draft media is published by this editor.
- **Draft semantics:** Empty text prompts, incomplete answers and missing matching assignments may remain in a saved draft. Image/video placeholders must have valid UUIDs and resolvable corresponding private media **before** saving because the backend validates media references even in drafts.
- **Publication guidance:** The editor displays a non-authoritative list of incomplete areas. It does **not** itself publish tests yet; only the server's publication validator is authoritative. Browser publication controls and public learner runner are later increments.

`ContentBlocksEditor.vue` and `ContentBlocksViewer.vue` are reusable for the subsequent anonymous learner page; public viewing must receive only the `mediaUrls` returned by the published-test API.

## Automated tests

`npm run typecheck` and `npm run build` check Vue TS/template correctness and Vite build. `npm run test:editor` checks the canonical object shapes, stable UUID generation, correct-answer option state, one-to-one matching reassignment, removing row pairs, media UUID guard, move operations, JSON Schema validation and publication-rule compatibility. Existing `npm run test:schemas` and the complete PHP regression suite continue in CI.

## Later real-host acceptance

Once ready for testing:

1. Back up private `testbraid-backend/storage/` before any author editing, especially if valuable test data have already been created.
2. Build and upload only the `www/` tree from `feature/poc-b-question-editor`; this branch does **not** change the PHP backend. Do not delete existing `www/media/` files or live backend storage when deploying.
3. Sign in, create or select a **disposable draft**, open **Edit questions**, add one choice and one matching question. Fill text, mark correct choices, create matching pairs, attach a test image/video, save, refresh and verify content persists.
4. Confirm unanswered draft content can be saved but a missing media ID is rejected. Check unsaved-change warning, duplicate assignment behavior and correct order after moving blocks/questions.
5. Confirm the editor refuses to save a published test, and check the Czech and English interface.
6. Exercise editing an existing draft that already has questions to verify no old questions or media references disappear when saving.

Do not mark the issue accepted until these browser checks pass. Avoid testing edits against real published material or non-disposable files.
