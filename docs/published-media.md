# PoC-A 07 — Published static media

**Status:** Implemented in draft PR #14; automated CI is required and anonymous static Apache playback on the actual host has **not** yet been verified. This branch stacks on the media upload PR #13 and JSON storage PR #12.

## Goals and boundaries

Once a test is published, only its validated image/video references become available as static copies served by the actual `www/media/` web root. Draft media stays in private `testbraid-backend/storage/media-files/`. Other tests can reuse the same media UUID without duplicating private files. Public test JSON is available anonymously at `GET /api/public/tests/{id}` only for published tests; the response contains the canonical `test` document and `mediaUrls` mapping from UUID to relative static path.

This is a **backend publication increment**, not the test authoring UI or learner runner. The public JSON includes correct-answer fields because current client-side self-assessment is designed around them; don't present this as a server-secret examination.

### API

| Method | Endpoint | Auth | Result |
| --- | --- | --- | --- |
| POST | `/api/admin/tests/{id}/publish` | Session + CSRF | Validate complete test, stage referenced media, write published test |
| POST | `/api/admin/tests/{id}/unpublish` | Session + CSRF | Hide test publicly and prune media not referenced by other published tests |
| PUT | `/api/admin/tests/{id}` | Session + CSRF | Draft updates as before; published updates validated and promoted before the new test version becomes visible |
| GET | `/api/public/tests/{id}` | Anonymous | HTTP 404 for missing/draft; HTTP 200 for published test plus `mediaUrls` map, `Cache-Control: no-store` |
| Static | `/media/<uuid>.<ext>` | Anonymous | Only published JPEG/PNG/WebP/MP4/WebM copies via Apache; expected HTTP 206 with Range for video |

The `mediaUrls` paths honor `TESTBRAID_BASE_PATH`; there are no server paths or deployment domains in the JSON. Media IDs remain server-generated UUID v4.

### Consistency design

1. An exclusive private `storage/.publication.lock` serializes **all** test updates and publication state changes, preventing a stale draft edit from overwriting a published test.
2. Validate the persisted test schema, publication semantic rules, existence/kind of every referenced media record, and actual private binary file size/readability.
3. Copy any newly referenced binaries to temporary `.stage-*` names in the protected public `www/media` directory. Flush/sync and compare cryptographic hashes before atomic rename to their final UUID file paths.
4. Atomically replace the canonical private JSON test document **after** all new public files exist. Failed validation or failed JSON write leaves the previous test state intact; newly created copies are removed on an ordinary exception.
5. After success, scan all currently published tests before removing obsolete public media copies. Shared files stay while any other published test references them. Editing an already published test uses the same promotion-before-commit ordering.
6. If the process is forcibly terminated between steps, an orphaned copy or `.stage-*` file may remain. A later successful transition performs reconciliation. For explicit repair, back up private and public files first, then run the installed **private CLI script** from the backend directory with the actual public root as an explicit absolute path:

```sh
php bin/reconcile-public-media.php /absolute/path/to/served/www
```

This avoids relying on a host's ambiguous `DOCUMENT_ROOT`. The script invokes `PublicationService::reconcile()` under the private lock and deletes only generated static media copies which are unreferenced by *every* published test and abandoned `.stage-*` files. **Do not run against an unrelated public directory.** Do not expose reconciliation anonymously.

**Important limitation:** Standard Apache static files and JSON records do not share an atomic transaction. During the short promotion-before-JSON interval, the final URL can technically serve a newly copied binary even though the test is not yet publicly published. The URL is a random UUID and is not linked by the public API before the JSON commit, but this is **not strict access revocation or cryptographic capability security**. Similarly, removing a previously published file cannot revoke bytes already downloaded/cached by third parties. `.htaccess` disables browser/proxy caching where mod_headers is available, and denies stage names. We must not describe publication/unpublication as perfectly atomic across HTTP clients. For deployments requiring strict draft isolation at every instant, a PHP access gate or a different artifact-publishing design is necessary, at the expense of direct static video delivery.

**Failure mode:** If the post-commit cleanup itself fails, the test may already be withdrawn while obsolete public copies remain; an error is reported and reconciliation is required. Keep an operational eye on this until a scheduled/manual recovery command and alerting are implemented. Never delete public copies merely because the withdrawing test no longer uses them without scanning every other published test.

### Portable Apache directory

The current public bootstrap `www/api/index.php` provides the physically served `TESTBRAID_PUBLIC_ROOT`. Do **not** use hosting-specific `DOCUMENT_ROOT` alone; on the initial shared host it resolves to a higher-level `subs/` directory. The publisher **fails closed** unless the physically served root and its protected `media/.htaccess` exist. To relocate to a new hosting provider, upload the same `www/` and private backend directory contents and adjust the public bootstrap private entry point when necessary; there are no hard-coded domain paths.

The `deploy/www/media/.htaccess` policy permits only canonical UUID filenames with supported extensions, denies other files including temporary `.stage-*`, and sets `nosniff` and `no-store` when Apache mod_headers exists. Check your provider allows `Require all denied` in `.htaccess`, and test denial explicitly. Apache's static file handler, not PHP, should honor `Range` requests for large video.

### Tests

`composer run test:publication-http` uses an isolated loopback development server and disposable credentials/private storage. It covers incomplete drafts, a published image and public JSON, denial before publication and after withdrawal, shared references, instant published edit to video, failed semantic update and cleanup of unused media. It is not a substitute for testing real Apache.

`composer run test:publication-failures` deliberately fails the test JSON commit *after* staging a media copy and asserts no new static file is left and the old draft document remains unchanged. It also simulates a process crash leaving an orphan published file and a `.stage-*` name; reconciliation must remove both.

### Host acceptance checklist

After backing up private `config/` and `storage/`, build the frontend and prepare deployment package on the new branch; upload/merge `www/` and `testbraid-backend/` without deleting live JSON, credential or vendor files. Include **the changed `www/media/.htaccess`** and ensure PHP can write the public `www/media/` directory without making it world-writable.

1. Log in and upload a small **image** and **real playable MP4** via `/admin`. Keep the returned media UUIDs.
2. Create a test referencing the media via the authenticated JSON API. Confirm `GET /api/public/tests/{id}` returns 404 while the test remains a draft; direct public `/media/<id>.<ext>` must also return 404.
3. Publish through `POST /api/admin/tests/{id}/publish` with the session CSRF token. Check public JSON and image/video URLs while logged out.
4. Play the *published static* MP4 anonymously and seek to a different position. In DevTools Network, inspect `206 Partial Content` and `Content-Range`. The response must come from Apache static serving, not the private PHP preview API.
5. Unpublish and check public API returns 404 and unshared static files disappear. If another published test references the same asset, it must remain accessible.
6. Try `/media/.stage-ABC123` and a dangerous extension such as `/media/example.php` — Apache should return 403/404 (not a file body or index listing). Do not upload a PHP file for this test.
7. Confirm `storage/` and the private backend remain inaccessible by anonymous HTTP, and the public response never contains absolute private server paths.

Do not consider the **host validation complete** until the above checks succeed. The exact hosting maximum for uploads and Apache rule overrides can differ from the PHP development server.
