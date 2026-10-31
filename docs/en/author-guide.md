# Author guide

**English** · [Čeština](../cs/author-guide.md)

Authors can create lessons, build tests with text, images and video, preview them and publish them for learners. Sign in at `/admin`; first-time account setup is explained in the [Quick start](quick-start.md). Once you are signed in, the header offers **Public site** (the site as learners see it), **Edit tests** and **Media library**.

## Start from the demo tests

A new installation has two published **demo lessons**, one in English and one in Czech. Each has the same two short tests with images and videos: one with choice questions and one with matching questions. Open them in the author area to see how questions are put together. Published tests are read-only, so use **Duplicate** to get a draft copy you can change freely.

## Organize lessons and tests

A **lesson** groups related tests. Create or rename lessons on the **Edit tests** page and change their order as needed. A lesson cannot be deleted while it contains tests.

Choose a lesson and select **New test**. Set its title, optional description, **Content language** and whether the overall test result should be shown. The content language is one of the site's interface languages and starts as the language you are using the site in. The home page shows a test only to visitors who have chosen its language. The test starts as a **draft**, invisible to anonymous visitors.

You can reorder tests within lessons, duplicate an existing test or move a draft to another lesson. Duplicating a test reuses its referenced media; it does not upload copies of the files.

## Edit a test

The test workspace combines two tabs:

- **Questions** — create, reorder, duplicate and remove questions.
- **Test settings** — change title, lesson, description, content language, overall result visibility and publication status.

Both tabs use the same **Save changes** action. Changes are **not autosaved**. The preview displays the **last saved version**, so save before previewing. The editor warns about unsaved changes when leaving.

Each question and answer is assembled from **text, image and video blocks**. Add blocks where needed; reorder or remove them using the local menus. Removing a block does **not** delete its file from the media library.

### Choice questions

Choose between **one correct answer** (radio buttons) and **one or more correct answers** (checkboxes). Add answer options, compose their content, and mark the correct option(s). A multiple-answer question is correct only when the learner selects the complete correct set.

### Matching questions

Create pairs of corresponding items. Each side can contain text, images or video. When taking the test, learners choose items and pair them; the order of counterparts may change between attempts.

For both question types, the editor shows completeness warnings. A draft may be saved while unfinished, but must be valid before it can be published.

## Use media

Choose an existing image or video from the media library, or upload a new file from within the question editor. Media may be reused in different questions and lessons.

Under each image or video, fill in **Description for screen readers**: say what the picture shows or what happens in the video. Learners who use a screen reader hear this text instead of seeing the media. When a picture or video is a whole answer or matching item, the description is **required for publishing**; without it, those learners cannot tell the answers apart. Elsewhere it is optional but still helpful.

The **editor attaches one file at a time**. To select and upload several files together, open the standalone [Media library](media-library.md), then choose them from the editor.

## Preview and publish

1. Save the draft, then use **Preview** to test it from a learner's perspective.
2. Resolve incomplete questions or missing media.
3. Select **Publish** and confirm. The test becomes available in the public catalog and by direct link.
4. Use **Unpublish** when it should no longer be publicly available.

A published test is read-only in the author editor. **Unpublish it before editing**, then save and publish again. To delete a published test, unpublish it first.

Media used by other published tests remains available when a test is withdrawn. Original uploads remain in the private library.

## Remove the demo content

Remove the demo lessons before you share your site:

1. Open each of the four demo tests and select **Unpublish**.
2. Delete all four demo tests on the **Edit tests** page.
3. Delete both demo lessons, which are now empty.
4. In the [Media library](media-library.md), delete the demo images and videos. A file can be deleted only after no test uses it, including any copies you made with **Duplicate**.

## Scoring

A question counts as correctly answered only when it is fully correct; there is no partial credit. Turning off **Show overall test result** hides the number of correctly answered questions, while learners still see which answers were right or wrong.

TestBraid is designed for **self-assessment**, not for storing student results or conducting secret examinations. See [Learner guide](learner-guide.md).
