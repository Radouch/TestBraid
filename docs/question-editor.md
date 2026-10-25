# Question editor

## Authoring and saving

Authors create a draft in the lesson/test catalog and continue in the shared
test workspace (`/admin/tests/<uuid>/questions`). **Questions** and **Test settings**
edit one local draft. **Save changes** sends metadata and questions together in a
CSRF-protected `PUT /api/admin/tests/{id}`; Preview shows the last saved version.
The sticky toolbar is available on desktop and mobile, and question jumps account
for its measured height. See [the author workspace](author-workspace.md) for tabs,
lesson navigation, dialogs and combined save/unsaved-change behavior.

Each question has a collapsible card showing its number, type, a local completeness
hint and, when collapsed, a text summary. The first question and newly added or
duplicated questions start expanded. Question actions include moving, duplicating
and removing. Duplicating regenerates question/item/block IDs and remaps answer-key
references; media references retain the existing private files. It does not copy or
publish media. A question's collapse state is presentation state and is not saved.

Choice answers use a compact radio/checkbox next to the answer label and a visible
**Correct** badge. Single/multiple choice switching and scoring semantics are
unchanged. Answer movement and deletion are available in the answer's action menu.
Menus close after selection, outside click or Escape and support keyboard access.

## Composing content

The same application-owned editor composes question prompts, choice answers and
both sides of matching pairs. There are no nested "Answer content / Block 1" frames.
Text is edited directly in an automatically growing textarea. Every content list
supports arbitrary repeated text/image/video blocks, including media-only content.

- **Add content** appends a text, image or video block to that content list.
- The **+** separator before each block inserts content at that position.
- A horizontal row of outlined up/down and **Remove** buttons moves or removes
  whole blocks directly. On narrow screens the row sits above the full-width
  content; it never becomes a vertical rail that sets a short text block's height.
- **Add answer** creates a distinct answer option, rather than a content block.

Actions use bundled Bootstrap Icons with translated text or accessible names.
Standalone block arrows and menu toggles have 40 px targets; see
[`ui-icons.md`](ui-icons.md) for the shared icon vocabulary and sizing.

Selecting Image or Video opens a modal with existing files of the selected kind
and the FilePond-backed `MediaUploader`. The uploader accepts only that kind in
this context; the standalone media library still accepts both. A new media block
is inserted only after selection or successful upload. Canceling leaves the draft
unchanged. A failed library request does not prevent uploading a file. Existing
media can be replaced using the same dialog. UUIDs remain in the canonical data
but are not exposed as author input fields. Existing incomplete media blocks can
still be filled or removed. Removing a block does not delete its private original.

Pending media operations target stable block IDs, including an insertion anchor,
rather than mutable array indices. Closing the modal or unmounting the editor
aborts an outstanding library request. Wrong-kind uploads are not attached.
Private image/video previews use only the existing author-only API endpoints.

## Compatibility and boundaries

The editor still uses `schemaVersion: 1`. No schema, backend endpoint, publication
or learner rendering change is required. Text can remain empty in saved drafts;
any media block must reference a valid private file before saving. Readiness badges
and the test-level summary are advisory; server publication validation remains the
authority. The existing `updatedAt` save preflight is best effort, not transaction-safe
concurrency control. Unsaved-change navigation warnings remain active.

Matching now uses direct **correct pair** rows: each row contains the associated
left and right content, with no answer-key dropdown. Adding a pair creates both
items and their assignment. Removing a pair removes those exact IDs, even if an
older draft stored a crossed mapping or a different right-item order. The row
stacks left above right in narrow layouts, keeping the pair together.

Opening existing questions is read-only with respect to their data: rows are
projected from saved match IDs. Unassigned legacy items remain visible in suggested,
**unconfirmed** rows; **Confirm pair** explicitly creates their assignment. A row
missing one side offers **Add missing left/right item**. No content or media is
silently discarded and no missing answer key is invented on load.

The runner shuffles right-item IDs once per new attempt (including private preview)
and retains that order in the remaining right-item pool. Learners choose content
cards, with completed pairs shown above the free items and editable until submission
(see `docs/learner-matching.md`). Answer changes, submission and locale changes retain the order; Try again clears responses
and samples a fresh permutation. Fisher–Yates permits any order, including the
original or a previous order by chance. Canonical arrays and ID-based scoring are
unchanged. Metadata and questions now share the workspace described above.
A published test must still be unpublished before editing either tab.

## Validation

- `npm run build`: Vue/TypeScript checks and production build.
- `npm run test:editor`: schema compatibility, answer keys, matching invariants,
  mixed media, ordering, duplication with fresh IDs/remapped references, crossed-pair
  projection/removal and deliberate legacy-pair confirmation.
- `npm run test:schemas`, `npm run test:learner`, `npm run test:navigation`:
  existing regression suites, including deterministic coverage of all three-item
  shuffle permutations and ID-based scoring after reordering.
- In environments where the tsx CLI cannot create its IPC socket, the equivalent
  invocation is `node --import tsx scripts/<test-script>.ts` from `frontend/`.

Before accepting a deployment, use a disposable draft to check:

1. Compose text → video → text → image in one answer; insert at the start and
   between blocks, move/remove blocks and distinguish Add content from Add answer.
2. Select and replace existing image/video files; cancel a new media insertion and
   confirm nothing changes. Upload each kind and check error/retry behavior.
3. Set correct answers in both modes, collapse/expand, reorder and duplicate
   questions. Edit the copy and confirm the original is independent.
4. Save, reload and preview existing and newly composed content; confirm IDs,
   media references, order and answer keys persist. Verify the unsaved-change guard.
5. Open an older crossed matching key: the editor must show actual correct pairs,
   remain clean until edited, and save/remove by the original IDs. Open a draft
   with missing matches or unequal item counts; all content must remain visible
   and only explicit confirmation/completion should add missing assignments.
6. Run a matching preview and public test: free-item order must remain stable through pairing/unpairing/language changes;
   completed pairs and feedback must show the actual associated content.
   Try again must clear responses and draw a new permutation (a repeat is allowed).
7. Check Czech/English labels, keyboard navigation, Escape/outside-click dismissal,
   desktop/mobile layout and a published test's edit lock.

Only frontend build output is needed for this UI increment. Real-host upload and
acceptance are separate from local validation; do not overwrite private storage or
existing published media when deploying.
