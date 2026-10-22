# PoC-B shared runner and private author preview

**Status:** Implemented in draft PR #27 for browser acceptance; do not merge before owner-host verification.

## Why use one runner?

The exact same Vue \`TestRunner.vue\` renders both a protected, saved author test preview and the public self-assessment player. It renders canonical v1 choice/matching questions and shared \`ContentBlocksViewer.vue\` text/image/video blocks. This avoids implementing two visually divergent modes and allows the author to verify the resulting test before publication.

### Author-only saved preview

- Navigate to the author catalog, select a saved draft, and click **Preview / Try test**; alternatively use the link on the question editor itself.
- \`/admin/tests/{id}/preview\` checks \`GET /api/auth/session\` and loads test JSON only through authenticated \`GET /api/admin/tests/{id}\`.
- Private images and video use authenticated \`/api/admin/media/{mediaId}/preview\` endpoints. **Preview never publishes or copies draft media to \`www/media/\`.**
- Navigation from an editor with uncommitted changes invokes its unsaved-change guard. Preview always loads the latest **saved** test; it never mirrors an unsaved form state.
- Incomplete drafts remain viewable. A warning summarizes publish-readiness hints; questions with missing answers may score zero, not a false positive.
- Direct requests without login do not expose a draft: the frontend refuses to fetch it, and the backend's existing author middleware denies the private test JSON/media regardless of frontend route visibility.

### Public self-assessment

- The existing \`/tests/{id}\` route now loads \`GET /api/public/tests/{id}\` with \`credentials: 'omit'\`, and only for status \`published\`.
- The server's \`mediaUrls\` map points to pre-published Apache static assets, preserving HTTP Range/206 seeking for videos.
- Drafts and unknown IDs display **not available**, with HTTP 404 at the underlying public API. No authentication is required for published tests.
- This increment **does not add author publish/unpublish buttons or a copy-link action**. The publication API exists and was accepted in PoC-A. Browser publishing/share controls remain part of Issue #20.

### Answer and feedback behavior

- Single choice: one selected option. Multiple choice: an arbitrary set; full point only when that set exactly equals the correct option IDs (no extra, missing or duplicate answers).
- Matching: associate each left item with one distinct right item from the displayed inventory. Right-hand items are shuffled once per attempt; the inventory, selects and feedback use the same order. A fully correct, complete bijection is worth one point; partial or wrong pairs earn zero.
- No partial credit, no negative scores. Each wholly correct question earns one point. Unanswered questions are explicitly distinguished from answered/incorrect ones.
- **Check answers** shows the numeric total and correct choices / the correct right-hand counterpart for each left item. **Try again** clears all local response state.
- Learner answers are held only in Vue in-memory state; no account, persistence or answer-post request. Existing server access logs may of course record normal page/media fetches, not answer values.
- Both modes support Czech and English UI switching. Question content is displayed as authored; its \`language\` metadata does not automatically translate authors' text.
- A draft preview is not a promise of absolute publication readiness. PHP's publication validator remains the final authority.

## Regression found during first live-host acceptance (2026-10-21)

The owner found that the editor did not clearly communicate how to choose correct answers, and **every selected response was graded incorrect**. Root cause of the grading defect: `TestRunner` stores responses in `ref<Answers>`; Vue exposes `answers.value` as a **reactive Proxy**, but the answer-update functions called `structuredClone(answers)`. Browsers reject cloning the Proxy with `DataCloneError`; the handler fails and does not record the learner's selection. The scoring function then receives empty answer collections, so the result is zero regardless of which controls were clicked.

**Fix in this PR:** Answer update helpers now create immutable plain-object copies via object/array spreads and leave unrelated question answers unchanged; no `structuredClone` on a reactive Proxy. Tests explicitly use Vue `reactive` values, emulate saved/reloaded question answer keys, verify correct multi-choice and matching scores, and verify incomplete answer keys are identified. In the author editor, the correct-answer key controls now appear **above** each answer's content, with clear Czech/English instructions, colored visual indicators and a count of marked correct choices. Matching authoring now uses direct correct-pair rows (see `docs/question-editor.md`); the learner still assigns pairs in selects. In an incomplete draft preview, questions without a valid answer key display an explanatory warning instead of being labeled as an ordinary incorrect answer.

**How to define answers:** For a single-choice question, select the radio circle next to the correct answer. For multiple choice, tick every correct answer's checkbox. For matching, place the two correct counterparts in one pair row; no separate answer-key dropdown is needed. Older incomplete assignments require explicit confirmation. Save the test before opening preview; preview only loads the last saved JSON.


## Matching item order

`learner/presentation.ts` samples right-item ID permutations using Fisher–Yates.
`TestRunner.vue` retains one permutation for the whole attempt, in both public mode
and private preview. Selecting answers, checking them and changing the UI language
do not reshuffle or renumber feedback. **Try again** clears the answers and samples
a new permutation; loading another test also starts a fresh attempt. A repeated or
original ordering is a legitimate random outcome. No canonical content arrays,
answer keys or media references are mutated, and scoring continues to use IDs.

`npm run test:learner` covers all six three-item permutations with deterministic
random inputs, empty/single-item drafts, input immutability and unchanged scoring.

## Automated checks

The new \`npm run test:learner\` checks exact choice sets, single choice replacement, duplicate/extra/partial selection rejection, complete matching bijection, duplicate-right rejection, unanswered behavior, empty tests, reset semantics and incomplete answer keys. GitHub Actions runs this alongside \`npm run typecheck\`, \`npm run build\`, editor and schema parity tests, full PHP/Opis security + publication regressions and deployment package audit.

## Real-host acceptance

Once you are ready to test, create a **disposable** group and draft with:
1. A single-choice question, a multiple-choice question, and matching with at least two items per side.
2. Text, one JPEG/PNG and one MP4 in prompts or answers. Upload via the author editor; verify private media still fail when signed out.
3. Save. Click **Preview / Try test**. Verify image/video playback and seeking, the same question content as in the editor, input keyboard behavior and score after correct and incorrect answers. Try a partial multi-answer and one incorrect matching pair; both must give zero.
4. Use **Try again**, refresh the page, and confirm the responses are not retained.
5. Edit and save one question; reopen preview and verify the saved content changed. Confirm uncommitted changes prompt when leaving the editor.
6. Sign out and try the exact preview URL. It must show the sign-in requirement, not private test data/media. For the still-draft ID, the public \`/api/public/tests/{id}\` must return 404 and \`/tests/{id}\` must show unavailable.
7. To exercise actual learner mode, the test must first be published using the existing author API (browser publication buttons are a following increment). Test \`/tests/{id}\` without cookies, and verify Apache MP4 playback/seek. Unpublish after the disposable test to remove unreferenced public media copies.

No schema, PHP backend, Composer version or database changes are needed in this branch. The new frontend can be tested by uploading the built \`www/\` tree **without deleting the existing \`www/media/\`**. Preserve private backend \`config/\`, \`storage/\`, \`vendor/\` and take a backup of author content if you plan to publish or update real tests. Do not use sensitive or confidential media for public mode testing.
