# Shared author test workspace

This is the first approved author-design increment after v0.4.0. It implements
the unified-editor direction from #42 and the lesson/navigation scope of #68.
Individual content-block controls and their media-preview styling are a later
increment; their editing behavior is unchanged here.

## Test editing

The existing `/admin/tests/{id}/questions` URL remains valid. It now opens the
shared test workspace, with **Questions** and **Test settings** tabs. The
`?tab=settings` query opens settings directly; tab changes replace that query
without adding browser-history entries or discarding local edits. Arrow keys,
Home and End navigate the tab controls. Explicit UI language parameters and
installation base paths are preserved in navigation links.

Both tabs edit one detached draft containing title, lesson, description,
content language, score visibility and questions. **Save changes** writes that
whole payload through the existing authenticated, CSRF-protected test PUT.
The existing best-effort `updatedAt` preflight now protects both metadata and
questions. It is still not atomic optimistic concurrency control.

- Native settings validation reveals the settings tab before focusing an invalid
  field. Media-reference failures lead to the affected question instead.
  Enter in a composer's open media dialog cannot submit the test behind it.
- Both panels stay mounted when switching tabs, retaining question expansion,
  composer state and native media nodes. Failed/stale saves retain the draft.
- Leaving the page or loading another test checks all unsaved changes. An
  in-flight save blocks leaving/repeated submissions and disables editing.
- The sticky toolbar contains shared save state and Save/Preview actions on
  desktop and mobile. Its measured height offsets question jumps. Preview
  continues to show the **last saved version**, with the existing discard guard
  when leaving a dirty editor. Returning from preview restores the editor tab.
- A desktop overview and compact mobile selector jump to questions, expand their
  cards and focus the question heading. Existing questions may remain open
  together. Overview completion is structural readiness, not learner grading.
- Published tests expose read-only questions **and** settings. The existing
  confirmed **Unpublish and edit** action remains required for editing.

Lesson names load independently after authentication. A delayed/failed lesson
list does not block the test, clear edits or remove its existing assignment.
Aborted/late responses cannot overwrite the next test when route IDs change.

## Catalog and lessons

The catalog stores the selected lesson in `/admin?lesson={id}`. The editor's
breadcrumbs and return link lead back to that lesson; moving a draft to another
lesson updates the return context. Invalid/deleted catalog lesson filters fall
back to all tests. The selected desktop lesson has a subtle blue background;
on mobile a compact selector replaces the long lesson sidebar.

The old embedded metadata editor is removed. **Edit details** opens the settings
tab, the test title opens questions, and a duplicated draft opens its settings.
**New test** opens a dialog prefilled with the selected lesson and uses the
shared settings fields. Successful creation opens the canonical new ID in the
workspace rather than leaving another form below the catalog.

Creating/renaming a lesson uses a native modal dialog with a visible label,
full-width name field and separate Save/Cancel row. Initial focus selects the
name; closing restores the triggering control. Errors remain inside the dialog
and preserve input. Busy requests prevent cancellation. Existing lesson/test
ordering, publication, duplication, deletion constraints and protected APIs stay
available; mobile lesson actions are available beside the selector.

## Verification

`npm run test:author` mounts the actual Vue views/components with a memory router
and isolated authenticated API responses. It covers direct settings URLs,
delayed/failed lesson metadata, combined saves, tab/media preservation, busy and
unsaved-change guards, invalid hidden settings, failed/stale saves, preview return,
question jumps/focus, lesson filter/base/language links, rename error/retry/focus,
creation handoff, read-only published tests, explicit unpublishing, route races
and authentication before protected reads. GitHub Actions runs this alongside
the existing suites, production build and deployment-package audits.

The DOM tests do not establish real-browser pixel layout, native playback or
device-keyboard behavior. Before accepting deployment, use disposable drafts:

1. At 320/390/768/1024/1440px, inspect settings/questions, long names, the sticky
   toolbar, lesson selector, native dialogs and absence of horizontal overflow.
2. Change title/description/lesson/scoring and question content across tabs;
   save once, reload and confirm everything persisted. Check correct-answer
   keys, ordering, media references and the legacy scoring default.
3. Try an invalid hidden setting, failed save and a second tab's intervening
   edit. Check that local work remains and leaving warns appropriately.
4. Jump to a collapsed question and check focus/scroll offset. Use keyboard tab
   controls and return from saved-version preview to the same editor tab.
5. Rename/create a lesson and create/duplicate a test from a selected lesson.
   Verify selected context, focus restoration, cancellation and errors.
6. Confirm published settings/questions are locked and only the existing
   explicit unpublish action enables editing. Verify private media access.

Deploy frontend build output including the updated Czech/English locale JSON.
There is no backend, schema or content migration in this increment.
