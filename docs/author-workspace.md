# Shared author test workspace

The approved author-design work after v0.4.0 implements the unified-editor
direction from #42, the lesson/navigation scope of #68 and the question-composition
design from #70. See [the question editor](question-editor.md) for local block
actions, neutral completeness, correct-answer controls and portrait media previews.

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
  confirmed **Unpublish and edit** action remains available for editing.

The **Test settings** tab includes a separate **Publication** card with the
current status, a confirmed Publish/Unpublish action and, for published tests,
a public test link. It remains usable when the other settings are read-only.
Publishing requires a clean saved draft with no client-detected incomplete
questions or invalid media references. The card explains disabled actions and
links back to questions; it never silently saves or publishes an older version
while local changes remain. The server remains authoritative for readiness,
including private media availability. Failed transitions show an error beside
the action and preserve the current editor state. Successful transitions apply
the canonical returned test without changing the active tab or lesson context.
Both actions use the existing CSRF-protected endpoints and the same best-effort
status/`updatedAt` preflight as saving. They block concurrent writes and leaving
while in flight; the preflight is not an atomic server-side condition.

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
creation handoff, read-only published tests, publication from settings,
unsaved/incomplete publication guards, cancellation, errors/retry, stale state,
busy transitions, explicit unpublishing, route races
and authentication before protected reads. GitHub Actions runs this alongside
the focused `npm run test:content` composition suite, existing regressions,
production build and deployment-package audits.

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
6. From Test settings, cancel and confirm publication, open the public link,
   and unpublish again. Confirm settings/questions lock and unlock with the
   canonical status while the active tab and lesson context remain unchanged.
   Check that unsaved/incomplete drafts cannot be published, errors stay beside
   the action and publication also remains available in the catalog. Verify
   private media access.

Deploy frontend build output including the updated Czech/English locale JSON.
There is no backend, schema or content migration in this increment.
