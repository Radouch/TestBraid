# Question editor

## Authoring and saving

Authors create a draft in the lesson/test catalog and continue in the shared
test workspace (`/admin/tests/<uuid>/questions`). **Questions** and **Test settings**
edit one local draft. **Save changes** sends metadata and questions together in a
CSRF-protected `PUT /api/admin/tests/{id}`; Preview shows the last saved version.
The sticky toolbar is available on desktop and mobile, and question jumps account
for its measured height. See [the author workspace](author-workspace.md) for tabs,
lesson navigation, dialogs and combined save/unsaved-change behavior.

Each question has a neutral gray collapsible header showing its number, type,
local completeness and, when collapsed, a text summary. Completeness describes
publication readiness and is visually separate from the answer key. The first question and newly added or
duplicated questions start expanded. Question actions include moving, duplicating
and removing. Duplicating regenerates question/item/block IDs and remaps answer-key
references; media references retain the existing private files. It does not copy or
publish media. A question's collapse state is presentation state and is not saved.
Composers mount on first expansion and stay mounted afterward. Collapsing pauses
native video playback while retaining its position and the existing media nodes.

The prompt has a neutral background and a visible heading. Answers form a
separate section, with an explicit **Correct answer** radio/checkbox and a subtle
success background for each marked answer. Video controls are outside those labels.
Single/multiple choice switching and scoring semantics are
unchanged. Answer movement and deletion are available in the answer's action menu.
Menus close after selection, outside click or Escape and support keyboard access.
Removing an answer or matching pair focuses the next remaining item, or its Add
button when the list is empty.

## Composing content

The same application-owned editor composes question prompts, choice answers and
both sides of matching pairs. Each block has a restrained frame, a visible
Text/Image/Video label and one persistent local action disclosure. Text is edited
directly in an automatically growing textarea. Every content list
supports arbitrary repeated text/image/video blocks, including media-only content.

- **Add content** appends a text, image or video block to that content list.
- A block's **…** menu offers Text/Image/Video insertion before that block,
  followed by Move up, Move down and Remove block. This retains every insertion
  position without repeated separator rows or standalone destructive controls.
  Movement retains stable block IDs and disables unavailable boundaries.
- **Add answer** creates a distinct answer option, rather than a content block.

Actions use bundled Bootstrap Icons with translated text or accessible names.
Shared menu triggers and action rows have at least 44 px targets; see
[`ui-icons.md`](ui-icons.md) for the shared icon vocabulary and sizing.
Open menus are positioned using available viewport space, with bounded scrolling
for long lists. Their DOM remains inside the surrounding fieldset, preserving
the native busy/published edit lock. Text insertion focuses the new textarea;
removal focuses the next block or the append control. A media action keeps focus
inside the native dialog and returns it to a persistent trigger on close.

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
They reuse the learner's `ContentMedia` orientation detection: portrait images
and videos can reach 560 px, landscape previews 360 px, both capped by available
viewport height and width. Aspect ratio and the whole frame are retained. Source
replacement resets orientation until intrinsic dimensions arrive. Dialog lesson
selectors use unique IDs across all mounted composers.

## Compatibility and boundaries

The editor still uses `schemaVersion: 1`. No schema, backend endpoint, publication
or learner rendering change is required. Text can remain empty in saved drafts;
any media block must reference a valid private file before saving. Completeness hints
and the test-level summary are advisory; server publication validation remains the
authority. The existing `updatedAt` save preflight is best effort, not transaction-safe
concurrency control. Unsaved-change navigation warnings remain active.

Matching now uses direct **correct pair** rows: each row contains the associated
left and right content, with no answer-key dropdown. Adding a pair creates both
items and their assignment. Removing a pair removes those exact IDs, even if an
older draft stored a crossed mapping or a different right-item order. The row
stacks left above right in narrow layouts, keeping the pair together on one
neutral surface. Both sides retain explicit labels at every width. Pair removal
is in the row's local action menu.

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
- `npm run test:content`: actual question/composer DOM interaction, insertion at
  every position, movement/removal focus, single/multiple answer keys, crossed and
  legacy matching rows, private kind/lesson-aware media selection and cancellation,
  portrait detection/source reset, retained collapsed media, unique control IDs,
  menu keyboard behavior and the native edit lock. API responses are isolated;
  this suite does not save, publish, upload or delete live content.
  Only the third-party FilePond engine uses a DOM test boundary; the actual
  application-owned uploader and its kind restrictions remain mounted. Native
  file selection/playback and frontend upload acceptance require a real browser;
  backend upload transport has separate HTTP integration coverage.
- `npm run test:upload`: the installed FilePond multipart serializer plus the
  mounted application uploader's request/response hooks. It checks binary-only
  `file` parts, lesson assignment, credentials/CSRF and a newly uploaded JPG after
  existing answer text. Only the layout widget and XHR network are isolated.
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
   desktop/mobile layout, a published test's edit lock and the taller portrait
   previews. At 320/390/768/1024/1440 px, open block menus near each viewport edge,
   verify their actions remain reachable and check matching rows and text fields
   for horizontal overflow. DOM tests do not establish real-browser pixel layout
   or native playback acceptance.

Only frontend build output is needed for this UI increment. Real-host upload and
acceptance are separate from local validation; do not overwrite private storage or
existing published media when deploying.
