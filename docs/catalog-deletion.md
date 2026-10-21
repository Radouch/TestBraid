# Safe deletion of lessons and draft tests (PoC-B)

**Status:** Implemented in draft PR #24; automated CI and real-host author acceptance are required before merge.

## Behavior

The author catalog has explicit **Delete** actions for lesson groups and draft tests, with translated Czech/English irreversible-action confirmations. Delete never runs on page load or through navigation: the user must confirm an explicit action.

- `DELETE /api/admin/tests/{id}`: permanently deletes a **draft** test; published tests return HTTP 409 `TEST_PUBLISHED` and must first be withdrawn through the explicit unpublish workflow. Unknown records return 404, invalid IDs return 400.
- `DELETE /api/admin/groups/{id}`: deletes an **empty** group only. A group referenced by *any* test, regardless of draft/published status, returns HTTP 409 `GROUP_NOT_EMPTY`. The author must move or remove the tests first; there is deliberately **no cascade deletion**.
- Both routes are inside the existing authenticated author route group; mutating requests require `X-CSRF-Token`. Unauthorized operations return 401 and missing/invalid CSRF tokens return 403.
- Both operations acquire the same private publication lock used by publishing and test updates. Test **creation** now uses this lock as well, preventing a concurrent test creation from referencing a group that was just deleted. File removal itself uses the JSON repository's per-kind write lock, avoiding races with atomic file replacements.
- Deleting a test leaves all **private uploaded media originals and metadata** intact. Uploads can be shared across multiple tests, and private-media deletion requires a reference-aware retention policy (follow-up [#17](https://github.com/Radouch/TestBraid/issues/17)). Public static copies disappear upon an earlier unpublish when no published test references them, not as a side effect of deleting a draft.

**Irreversible:** This initial PoC action physically removes the small private JSON record. There is no trash/recycle bin or automatic restore UI. Back up `testbraid-backend/storage/` before testing with valuable data. Do not delete content using these actions if it must be preserved.

## Automated tests

`composer run test:storage-http` verifies that an occupied group cannot be deleted, author authentication and CSRF are required, bad/unknown IDs fail predictably, and a draft/group delete is persisted. `composer run test:publication-http` verifies that published tests cannot be deleted while visible and that withdrawn test deletions never remove private original media.

## Real-host acceptance

After deploying both PHP and Vue portions of this PR and backing up the private `storage/`, use **disposable** records:

1. Create lesson `Deletion test` and a draft test inside it. Try deleting the lesson: the UI should report that the group contains tests; both records must remain.
2. Delete the draft test and confirm the browser prompts with its title. Refresh and confirm the test is absent.
3. Delete the now-empty lesson, refresh and confirm it is absent.
4. For a **disposable published test**, confirm the delete control is disabled. Do not delete or withdraw real published tests as a smoke test.
5. Confirm existing private media and other lessons/tests still work.

There is no requirement to delete production test data or private uploaded binaries as part of host acceptance.
