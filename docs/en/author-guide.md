# Author guide

This guide covers the signed-in workspace where authors create lessons, prepare multimedia tests, preview them and publish them for anonymous learners. For hosting and account setup, see [Installation](installation.md).

## 1. Sign in and open the catalog

Open `/admin` under your installed application URL and sign in with an author account. If this is the first use of a new installation, the site operator must first complete the one-time author setup described in [Installation](installation.md).

The author catalog contains **Lessons** and the tests assigned to them. Select a lesson on the left (or with the compact selector on a phone), or display all tests. The selected lesson is retained when navigating to and back from a test.

A lesson organizes content; it is not a separate user account or an access-control boundary. The home page lists lessons containing **published** tests; drafts are available only in the author workspace.

## 2. Create and manage lessons

- Use **Add lesson** to create a lesson. Give it a name useful to learners.
- Rename an existing lesson using its available action.
- Change lesson order with the move controls or drag-and-drop where available. Published home-page lessons follow the configured order.
- A lesson containing tests cannot be deleted. Move or delete its tests first. The Delete action is unavailable for a nonempty lesson; the backend independently enforces this restriction.

A media item's *home lesson* is a separate optional organizational assignment, not an ownership rule. Deleting an empty lesson does not delete media; formerly associated media can become unassigned. See [Media library](media-library.md).

## 3. Create a test

Choose a lesson and select **New test**. Fill in:

| Field | Meaning |
| --- | --- |
| Title | Shown in the catalog and at the top of the test |
| Lesson | Where the test belongs; a draft may later be moved |
| Content language | A language code such as `cs` or `en` describing the **test content** |
| Description | Optional introduction displayed in the test |
| Show overall score | Whether aggregate points are shown after answers are evaluated |

Save the new test. It starts as an unpublished **draft**, and the editor opens for that test. The UI language chosen in the header is independent of the test's content language: selecting Czech UI does not translate an English test.

A test can be duplicated from the catalog. The copy becomes a separate draft, with new IDs for its questions/items/blocks but reuses referenced media rather than copying uploaded files.

## 4. Use the combined editor

The editor has **Questions** and **Test settings** tabs, one common **Save changes** action, and a question overview. Both tabs edit the same working copy. Settings include the title, lesson, description, content language, scoring visibility and publication controls.

Changes made in the editor are **not saved automatically**. Use **Save changes** before relying on the content in another view. A navigation guard warns about unsaved edits. **Preview** shows the **last saved** version, not unsaved text in the editor.

A published test's questions and settings are read-only. To modify it, first use the confirmed **Unpublish and edit** action; save the changes and republish it afterward.

## 5. Add questions and answer choices

Use the editor's add-question action. TestBraid currently supports two question types:

### Choice question: one or several correct answers

- Enter the question prompt.
- Choose **Single** or **Multiple** answer mode.
- Add at least two answer options. Each option can have its own text, images and/or videos.
- Mark the correct option with the prominent **Correct answer** radio control (single choice) or checkboxes (multiple choice).
- Reorder or remove options using their local action menus.

For a single-answer question, exactly one answer must be marked correct before publication. For multiple-answer questions, at least one must be marked; the learner must select **exactly the complete correct set** to earn the point.

### Matching question: create correct pairs

- Add pairs of associated items. Each pair has one **left/source** and one **right/counterpart**.
- Compose the content for both sides. Both may contain text, images and videos.
- Add, remove or rearrange pair content as needed. The relationship is stored using stable item IDs, not visual row positions.
- The learner will see source and counterpart choices separately and construct their own matches. Counterpart order may be shuffled for each new attempt.

An older incomplete draft may contain unconfirmed or one-sided matching rows. The editor displays them instead of silently deleting content: confirm a suggested pair or complete a missing side before publication.

### Managing questions

Question cards can be expanded/collapsed, moved, duplicated or removed. Duplicating a question creates new structural IDs and adjusts its answer key, while media references continue pointing to the original uploaded items. The question overview helps jump to a specific question on desktop and mobile. Collapsing is a viewing preference and does not alter the saved question.

## 6. Compose text, images and video

Every question prompt, choice answer and matching item is a sequence of **content blocks**:

- **Text:** an editable, automatically growing text area.
- **Image:** a media reference selected from the library or uploaded while editing.
- **Video:** a media reference with playback controls.

Use **Add content** or the block's local action menu to insert a block at the required position, move it or remove it. Adding an image/video opens a chooser of compatible existing media and an upload option. You may select an item whose home lesson differs from the test's lesson.

Removing a block **does not delete the underlying media file**. The same media may be used by other questions and tests. The library manages media references and deletion separately.

Uploaded originals stay private; the author editor uses protected previews. See [Media library](media-library.md) for accepted file types and limits.

## 7. Save, preview and resolve incomplete content

Save a draft at any stage. Empty/incomplete text can be retained in a draft, but publication requires complete, valid questions and working media references. The UI reports question completeness and test publication readiness; the **server performs the final validation**.

Open **Preview / Try test** to interact with the **saved** test as a learner would. Draft preview is protected by author login and does not make the test or its media public. Incomplete answer keys are explicitly flagged as not gradable rather than marked wrong arbitrarily.

Typical issues to resolve before publishing include missing questions, prompts, answer content, correct answers, unmatched pairs or invalid/missing media.

## 8. Publish, share and unpublish

After saving a complete draft, open its **Publication** controls in Test settings or use the catalog action:

1. Review the saved test in Preview.
2. Select **Publish** and confirm.
3. Open the generated public link, or copy the link from the catalog/publication controls.
4. Check images/video in the public view. Published tests also appear under their lesson in the public home-page catalog.

Publishing makes the test available **anonymously**; no learner account is needed. The application makes media referenced by published tests available as static files. Other draft-only media remains private.

To withdraw a test, select **Unpublish** and confirm. The test stops appearing in the public catalog and its test link is no longer available as a published test. Private draft content and original media remain for future editing/republishing. Media still used by other published tests remains available.

After unpublishing, you can edit the draft. To delete a published test, **unpublish first**, then delete the draft with confirmation. Deleting a test does not automatically remove media from the library.

## 9. Ordering, visibility and scoring

Authors can reorder lessons and the tests inside a lesson; public listings respect those orders. The author's catalog may display both drafts and published tests, with readiness information. Only published tests are shown to anonymous visitors.

Each question awards **one point only if fully correct**; there is no partial credit. Unchecking **Show overall score** hides aggregate point statistics and numeric grading labels, but learners still see question-level correct/incorrect feedback. Answers are evaluated in the learner's browser and are not stored as learner submissions.

TestBraid does not provide learner accounts, progress tracking, secret examinations or a question bank for random generation.

## 10. Practical recommendations

- Save after substantial edits and before previewing.
- Test both correct and incorrect answers in Preview, especially matching tasks on a narrow screen.
- Use broadly supported video codecs and try the published media in a real browser.
- Reuse library media instead of repeatedly uploading identical content.
- Back up private files and published media before major changes or upgrades. See [Security and backups](security-and-backups.md).
