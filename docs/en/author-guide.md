# Author guide

Authors can create lessons, build tests with text, images and video, preview them and publish them for learners. Sign in at `/admin`; first-time account setup is explained in [Installation](installation.md).

## Organize lessons and tests

A **lesson** groups related tests. Create or rename lessons in the author catalog and change their order as needed. A lesson cannot be deleted while it contains tests.

Choose a lesson and select **New test**. Set its title, optional description, content language and whether the overall score should be shown. The test starts as a **draft**, invisible to anonymous visitors.

You can reorder tests within lessons, duplicate an existing test or move a draft to another lesson. Duplicating a test reuses its referenced media; it does not upload copies of the files.

## Edit a test

The test workspace combines two tabs:

- **Questions** — create, reorder, duplicate and remove questions.
- **Test settings** — change title, lesson, description, content language, score visibility and publication status.

Both tabs use the same **Save changes** action. Changes are **not autosaved**. The preview displays the **last saved version**, so save before previewing. The editor warns about unsaved changes when leaving.

Each question and answer is assembled from **text, image and video blocks**. Add blocks where needed; reorder or remove them using the local menus. Removing a block does **not** delete its file from the media library.

### Choice questions

Choose between **one correct answer** (radio buttons) and **one or more correct answers** (checkboxes). Add answer options, compose their content, and mark the correct option(s). A multiple-answer question is correct only when the learner selects the complete correct set.

### Matching questions

Create pairs of corresponding items. Each side can contain text, images or video. When taking the test, learners choose items and pair them; the order of counterparts may change between attempts.

For both question types, the editor shows completeness warnings. A draft may be saved while unfinished, but must be valid before it can be published.

## Use media

Choose an existing image or video from the media library, or upload a new file from within the question editor. Media may be reused in different questions and lessons.

The **editor attaches one file at a time**. To select and upload several files together, open the standalone [Media library](media-library.md), then choose them from the editor.

## Preview and publish

1. Save the draft, then use **Preview** to test it from a learner's perspective.
2. Resolve incomplete questions or missing media.
3. Select **Publish** and confirm. The test becomes available in the public catalog and by direct link.
4. Use **Unpublish** when it should no longer be publicly available.

A published test is read-only in the author editor. **Unpublish it before editing**, then save and publish again. To delete a published test, unpublish it first.

Media used by other published tests remains available when a test is withdrawn. Original uploads remain in the private library.

## Scoring

Each fully correct question earns one point; there is no partial credit. Disabling **Show overall score** hides overall point statistics, while learners still see which answers were right or wrong.

TestBraid is designed for **self-assessment**, not for storing student results or conducting secret examinations. See [Learner guide](learner-guide.md).
