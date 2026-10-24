# Learner matching cards

## Flow

The public test and private saved preview share `MatchingQuestionRunner.vue`.
The author editor and canonical v1 JSON are unchanged by this increment.

1. Select a left item using its card background or **Select** button.
2. Play/read the free right items and use **Assign**, or their card background,
   to associate one with the selected source. Playback controls, links and other
   interactive content never select or assign an answer.
3. The whole pair appears in **Your pairs** above the working area as two distinct
   bordered cards with a link symbol between them and **Unpair** above them. Both items
   disappear from the free pools. Completed pairs remain in the order made;
   remaining items keep their authored left order and attempt-local right order.
4. **Unpair** returns both items to the pools and preselects the source for another
   assignment. Other pairs are retained. This can be repeated until submission.

All original text/image/video blocks are rendered, with bounded media preview
sizes and native playback/fullscreen controls. A pairing means association only:
there are no correctness colors or answer-key hints before submission. The progress
count is the number of chosen pairs, not the number correct.

## Keyboard, viewport and mobile

Explicit, named buttons provide Select/Assign/Unpair actions for keyboard use.
The selected source exposes `aria-pressed`, the paired summary uses named groups,
and an announcement describes pair addition/removal. When the triggering item
moves, focus returns to the next useful working control without native focus
scrolling. Buttons are outside media players rather than wrapping them.
The free-pool headings have no extra counterpart-only hint, so the first cards
start at the same height when the columns sit side by side.

Pair changes measure the working area's position before/after Vue updates and
adjust scrolling immediately, avoiding Bootstrap's global smooth-scroll animation
when preserving the work position. On narrow screens, pair sides stack within the
same row. Source selection takes the user to the counterpart panel, where the
selected source remains visible; **Choose another item** returns to the source pool.

## Results and reset

After submission responses are locked. Valid answer keys produce a textual
Correct/Incorrect pair status and corresponding border color. Incorrect pairs show
both the chosen content and the actual correct counterpart. Unanswered sources
are listed with their correct counterparts. No positional item codes are needed.
The correction stays beneath the chosen counterpart in the right column, and
these two remain grouped when the pair stacks on a phone. Portrait images/videos
receive more vertical space without cropping; see `learner-continuous-page.md`
for the context-specific, viewport-bounded limits.
An incomplete preview key still produces the existing draft warning and cannot
label an arbitrary pair as correct or incorrect.

Scoring remains all-or-nothing, one point per fully correct question, based on
stable item IDs. `matchingPresentation` projects the learner responses independently
of the answer key; it never mutates canonical content or the shuffled order.
**Try again** clears responses, pair groups, selection and feedback and samples a new
right-item permutation. Locale changes retain the ongoing attempt. No response is
sent to the backend or saved to localStorage/cookies.

## Validation and real-host acceptance

`npm run test:learner` covers chronological pair projection, stable free pools,
unpair/reassignment, independent answer-key changes, stale/duplicate response
filtering, canonical immutability, reset and existing ID-based scoring/shuffling.
The production build and other frontend regressions remain required.

On a disposable test/preview, verify:

- Text-only and mixed image/video items; playing/seeking media must not assign it.
- Pair movement into the summary, stable remaining pools, and repeated unpairing
  and reassignment before submission without losing unrelated pairs.
- Keyboard focus and work-area scrolling as pair rows are inserted/removed.
- Correct, wrong and unanswered results with actual counterpart content; controls
  unavailable after submission and restored cleanly by Try again.
- Czech/English, narrow-screen pair grouping/source context, incomplete preview
  keys and identical behavior for anonymous public tests.

Only the frontend build output needs deployment. No backend, storage or schema
migration is involved. Real-host acceptance remains separate from isolated tests.
