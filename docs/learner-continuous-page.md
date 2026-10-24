# Continuous learner test page

The public learner and protected saved author preview share this layout in
`TestRunner.vue`. It implements the approved continuous-page proposal: every
question is initially open, several questions can remain open, and each can be
collapsed manually. The alternative one-question-at-a-time proposal is not part
of this change.

## Orientation and responses

- The existing lesson context and return-to-catalog links remain available.
- At Bootstrap's `lg` breakpoint (992px) and above, a sticky left overview lists
  all questions. Below it, a compact sticky top bar shows the current question
  and answer-completion progress; its button expands the full list.
- The current question follows scrolling and keyboard focus. Overview buttons
  expand their target, close the mobile list, scroll below the sticky bar and
  focus the question's heading button. Escape closes the mobile list and returns
  focus to its toggle. Long desktop lists keep the current entry visible without
  scrolling the surrounding page.
- Each heading shows its ordinal out of the total and a textual state with an
  icon. A neutral circle means unanswered; a neutral half-circle and pair count
  mean partially matched; a neutral check means answered. These states depend
  only on responses, never on the answer key. Selecting any choice counts as
  answered, even when a multiple-choice selection is not fully correct.
- Selected choices have a subtle blue background and border. Native inputs and
  labels support keyboard use; clicking the tile background is a pointer
  shortcut. Playing or seeking a video does not select its answer.
- Collapsing uses `v-show`: response state, matching selection/order and native
  media nodes remain intact. Videos pause on collapse, grading, retry and unmount;
  collapsing does not reset their playback position.

On phones, choices and paired counterparts stack at full available width.
Videos use their native controls and contain their full frame. Matching actions,
question headings and overview entries have generous touch targets. Matching
source/counterpart jumps use the same measured sticky-bar offset.

## Results

Submitting locks responses, pauses media and moves focus to the result heading
above the questions. Manual collapsed/open states are retained. The overview and
collapsed headers show correct, incorrect and unanswered results using text,
icons and restrained success/danger/neutral treatments.

Choice feedback distinguishes:

| Response | Treatment | Label |
| --- | --- | --- |
| Chosen, correct | Success | Your choice – correct |
| Chosen, incorrect | Danger | Your choice – incorrect |
| Correct, not chosen | Success | Correct option – not selected |
| Incorrect, not chosen | Neutral | No extra result label |

Matching results show the chosen content, correct/incorrect pair status, and
the actual correct counterpart for wrong or missing pairs. Missing pairs use
neutral gray, with the correct counterpart in a separate success area. An
incomplete draft key is explicitly ungradable, with no false correctness colors.

Scoring is unchanged: one point per wholly correct question, no partial credit.
`showOverallScore: false` removes point values and aggregate result statistics
from the summary, headings and overview; individual feedback remains visible.
Retry opens all questions, clears responses/results and samples the next
attempt's matching order. Locale changes retain the current attempt. All learner
responses stay in memory, without response requests, localStorage or cookies.

## Verification

`npm run test:learner` checks completion independence from the answer key,
partial/stale/duplicate matching responses, choice feedback and existing scoring.
`npm run test:runner` mounts the actual Vue components in Happy DOM and checks
collapse/media preservation, media-control isolation, overview/focus behavior,
partial matching, locale stability, scroll tracking, measured mobile jump offsets,
grading/corrections, hidden scores, retry and protected incomplete previews.
It uses injected geometry for scrolling; it does not claim browser layout,
native playback or real-device visual acceptance. GitHub Actions runs both suites.

Before deployment acceptance, check a published test and private preview in a
real browser at 320/390/768/1024/1440px widths:

1. Scroll through short and long questions, including a long overview list.
   Check the current entry, sticky positions, keyboard focus and no horizontal
   page overflow. Expand the mobile list, choose a collapsed question and rotate
   the device; its heading must remain visible below the bar.
2. Select multiple choices and make partial matching pairs. Collapse/reopen
   several questions, change UI language and verify response/order preservation.
3. Play, seek and use fullscreen on portrait and landscape videos. Playback
   controls must not choose answers; collapsing must pause and retain position.
4. Submit with correct, incorrect, partially completed and untouched questions.
   Review collapsed headers, selected/missed correct options and actual corrected
   counterparts. Retry and confirm a clean attempt.
5. Repeat with overall scoring disabled and verify no points or aggregate
   result statistics. Preview an incomplete saved draft and check its warning.

Deploy the frontend build including `locales/cs.json` and `locales/en.json`.
There is no backend, schema or content migration.
