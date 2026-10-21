# Public test catalog — lessons and published tests

**Status:** Draft PR #30, built on draft PR #28 (author-side publication UI). Real-host testing and integration into `main` remain pending.

## Anonymous home page

The home page `/` displays lessons with published tests. Each lesson section contains the public **test title**, the content language and a link to `/tests/{id}`. The same existing learner runner handles answers and scoring. Users do not need to sign in, provide a session or submit their answers to the backend.

If there are no published tests, the home page displays a translated empty state rather than exposing draft lesson names. If the catalog request fails, it provides a translated retry button. The interface is Czech/English and uses the same responsive Bootstrap styling as the rest of the application.

Lessons with **only draft tests** and empty lessons are intentionally not visible to anonymous users. Any later need for publicly visible empty lesson descriptions or a chosen display order should be an explicit separate requirement; the initial catalog sorts by lesson name then test title.

## API privacy contract

`GET /api/public/catalog` is **anonymous**, read-only and `Cache-Control: no-store`. Its response is a deliberately allowlisted summary rather than the full private JSON records:

```json
{
  "groups": [
    {
      "id": "lesson-uuid",
      "name": "Lesson 1",
      "tests": [
        { "id": "published-test-uuid", "title": "Practice", "language": "cs" }
      ]
    }
  ]
}
```

The example shows the structure only; actual IDs must be valid UUIDs.

The server filters by `status === published` **before** building the response. It includes only groups referenced by at least one published test and sends no drafts, answer keys, questions, uploaded media IDs, full test JSON, private server paths, or author metadata. The public learner detail endpoint independently verifies publication on every request, even if a stale home page link is clicked after withdrawal.

Because the published test itself is public, its title and group name must be treated as **public information**. Do not use confidential names for published lesson groups. Anonymity must be enforced in PHP, not merely by hiding Vue components.

## Deploying and checking

This PR changes **both** PHP and Vue, unlike the previous frontend-only publication controls. After building the `feature/poc-b-public-catalog` branch, upload the prepared `www/` frontend plus the updated backend `src/Http/PublicTestRoutes.php` and `src/Publication/PublicationService.php` files. This branch includes all changes in PR #28 as well. Composer packages and schemas are unchanged.

Preserve server-owned `config/`, `storage/`, `vendor/` and existing public `www/media/` files. Use disposable tests/media and back up any valuable data before changing installed PHP code.

1. Without signing in, open the root home page. Before publishing any test, expect the no-published-tests message; the private API still requires author login.
2. Publish a disposable complete test inside Lesson A via the admin UI. Reload the home page anonymously: Lesson A and its published test are now listed, and **Start test** goes to the test's public learner URL.
3. Create a separate Lesson B containing only a draft; Lesson B must **not** be visible anonymously.
4. Publish another disposable test in Lesson B; both lessons and the correct test names must appear separately.
5. Use a completely incognito session to complete the public test, verify result/retry, and play/seek any public video. Ensure no sign-in is required.
6. Withdraw the test in Lesson A. Reload the home page: Lesson A disappears if it has no other published tests. Test details under its previous URL are unavailable and `GET /api/public/tests/{id}` responds 404. Lesson B stays visible and playable.
7. Withdraw the remaining test. The home page reverts to the translated empty state; private drafts remain available to the author. Verify both Czech and English catalog labels.

The isolated PHP publication smoke suite checks the allowlisted fields, anonymous response, draft/lesson privacy, public media URLs, multiple lesson groups and withdrawal behavior. Vue CI typechecks/builds the homepage and existing learner player; published scoring remains covered by `npm run test:learner`.

**Integration order:** Merge/accept PR #28 first, then retarget PR #30 to `main` and merge after real-host acceptance. Do not merge the stacked child directly into `main` while the parent PR is unreviewed.
