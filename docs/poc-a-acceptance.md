# PoC-A acceptance evidence and deployment gate

**Recorded:** 2026-10-19  
**Source of truth:** [PoC scope](poc-scope.md), [implementation plan](poc-a-implementation-plan.md), Issues #1–#8.  
**Goal:** Prove a portable, secure Vue/Slim/file-storage foundation on actual Apache/PHP hosting before building the PoC-B question editor and learner runner.

This document distinguishes **CI-confirmed behavior**, **owner-reported live-host observations**, and limits that have **not** been measured in an end-to-end stress test. None of the smoke scripts should run against the production host without careful review. Automated backend scripts start isolated loopback PHP servers with disposable passwords, private storage, and media.

## Acceptance evidence

| Area | Automated evidence | Live hosting result (owner, 2026-10-19) | Status |
| --- | --- | --- | --- |
| Vue build, Czech/English UI, same-origin routing | Vue typecheck/build; staging package audit | Home, `/admin`, deep-link refresh and `/api/health` work over HTTPS | Passed |
| Shared JSON Schema with PHP/TS | Same Ajv + Opis fixtures | Production JSON group/test create/read succeeded | Passed |
| Author authentication, session, CSRF | Auth/setup HTTP smoke tests, rate limiting, cookie settings exercised in isolated PHP | Browser setup, sign-in/out and protected administration work | Passed; reported web PHP-FPM session attributes match expected security policy |
| Private JSON persistence | Atomic write failure injection, public-root isolation, protected HTTP create/read/update | Group `1c03bcff-15bb-471c-b5c4-78d60456e906` and draft test `1533e443-51bc-42f8-a448-79f2538801eb` created/read successfully | Passed; rename/edit exercised in CI |
| Author media upload and private preview | Auth and CSRF gate, allowlisted MIME checks, rejected spoofed files, PNG + MP4/WebM ranges | Image/video upload, preview/seek, invalid-file rejection, private persistence, logged-out access denial | Passed; PHP `256M` upload/post limits reported, application video cap remains 64 MiB; actual end-to-end maximum not measured |
| Static publication | Publication, unpublication, shared media and failure-injection tests | Draft anonymous 404, published public JSON and media, anonymous Range 206 with Content-Range, MP4 playback | Passed |
| Unpublication and shared references | Two published tests sharing file; metadata failures leave old state | Shared files survived first unpublish; copies deleted after final unpublish | Passed |
| Apache public media allowlist | Staging checks media `.htaccess`; PHP integration tests use development server, not Apache | Existing non-allowlisted `.txt` sentinel was denied; public video supported byte ranges | Passed |
| Packaging and deploy safety | `node scripts/verify-deployment-package.mjs` runs against complete staged artifact | Owner successfully deployed via SFTP with private backend and public `www/` | Passed; future upgrades should repeat |

**Scope note:** The **PoC-B** author test/question editor, anonymous learner player and scoring UI remain unimplemented. The publication endpoint exists to validate PoC-A infrastructure, but is not yet an author-friendly editor.

**Security limitation:** Copying published static media files and atomically replacing private JSON are not one transaction. A copy may temporarily be addressable by its opaque UUID URL before a publication JSON commit completes. Orphan reconciliation reduces leaks after interrupted operations, but it is not a strict content authorization gate for someone who already knows the URL. See [published media design](published-media.md). Do not describe static URLs as revocable or as protecting against a reader who previously downloaded content.

## Repeatable local/CI validation

Requirements: Node.js 22, npm, PHP 8.1+ with fileinfo, Composer 2, curl, jq, and a POSIX shell for backend smoke scripts. The real deployment uses PHP 8.5 per the owner's hosting report, but CI tests PHP 8.5 independently.

```sh
cd frontend
npm install
npm run typecheck
npm run test:schemas
npm run build
cd ..

cd backend
composer install
composer run lint
composer run test:schemas
composer run test:auth
composer run test:setup
composer run test:storage
composer run test:storage-roots
composer run test:storage-http
composer run test:media-http
composer run test:publication-http
composer run test:publication-failures
cd ..

node scripts/prepare-deployment.mjs
node scripts/verify-deployment-package.mjs
```

The GitHub Actions workflow executes these checks (or their direct equivalent). A fresh release passes only when **both** PHP and Vue jobs are green. Until dependency lockfiles are committed, `npm install` and Composer's manifest resolution may select compatible newer patch releases; reproducible locked installs are a follow-up and must not be claimed yet.

The deployment package includes **source and compiled frontend**, but intentionally omits server-owned `testbraid-backend/config/`, `storage/` and `vendor/` and any existing public media copies. This omission is not a cue to delete them on the server. Treat copying as a **merge**, not synchronization with deletion.

## Host deployment and recovery

1. Back up `testbraid-backend/config/`, the complete private `storage/` and existing published `www/media/` **before** changing code. Pause author writes to take a cross-file-consistent backup. Keep backups outside public `www/`.
2. Build the frontend locally, then prepare and verify the deployment package with the two Node commands above. Upload/merge the staged public and private trees via SFTP. Preserve hosting-specific private settings and the existing `vendor/`.
3. If Composer dependencies changed, install/upgrade **in the private backend**, not under `www/`. No ongoing Node server or database is needed; web PHP must have `fileinfo` enabled.
4. Confirm HTTPS, Vue reload and JSON `GET /api/health`. Confirm existing author login and `GET /api/admin/groups` still work; `storage-diagnostics` can diagnose private directory permissions without leaking paths.
5. For this integration gate, the **authenticated** `GET /api/admin/environment-diagnostics` reports effective web PHP version, fileinfo support, PHP upload/post limits, execution/input time and session cookie flags. It never returns a cookie value, PHP configuration location or any filesystem path. Compare these settings with the host control panel; reverse proxies and Apache can impose *smaller* body limits not visible in PHP.
6. Verify no author credentials or private source JSON are reachable by anonymous HTTP. Recheck that Apache denies an **existing harmless non-allowlisted sentinel** placed temporarily in `www/media/`; remove the sentinel immediately afterward. A 404 for a missing file proves nothing about the deny rules.
7. Repeat a small PNG/MP4 upload to the private author preview, then a temporary published test: anonymous public JSON, actual Apache MP4 seeking (`206` and `Content-Range`), and final-reference withdrawal must all work. Test with *disposable, non-sensitive media* only.
8. If deployment fails, stop author writes and restore **both** code and the coordinated private/public backup. Never restore only one test record while leaving broken media references. Consult error logs privately rather than pasting secrets or absolute paths. If an interrupted publish leaves an orphan, use the private CLI `php bin/reconcile-public-media.php /absolute/path/to/served/www` only after a backup; see [published-media.md](published-media.md).

### Hosting runtime confirmation — received 2026-10-19 (#2, #4 and #6)

The owner deployed the integration-gate PHP diagnostics and returned the following allowlisted values **from the actual HTTPS web process**, not from PHP CLI. The first group of fields confirms runtime capabilities:

- `phpVersion: "8.5.2"`, `phpSapi: "fpm-fcgi"`, `fileUploadsEnabled: true`, `fileinfoEnabled: true`, `jsonEnabled: true`.
- `uploadMaxFilesize: "256M"`, `postMaxSize: "256M"`, `maxInputTimeSeconds: 100`, `maxExecutionTimeSeconds: 120`.
- `sessionCookieSecure: true`, `sessionCookieHttpOnly: true`, `sessionCookieSameSite: "Lax"`, `sessionStrictMode: true`, `sessionUseOnlyCookies: true` (confirmed under real HTTPS).

**Hosting capacity (owner-reported):** account disk capacity is described as *unlimited/unmetered*, not an independently measured promise of infinite space; actual fair-use/resource policies may still apply. Hosting advertises a maximum upload of **256 MB**, consistent with the observed PHP `256M` configuration values. Application-side limits are **10 MiB for images and 64 MiB for videos**. Since `post_max_size` and `upload_max_filesize` are both `256M`, a request close to the PHP upload maximum could exceed the POST limit due to multipart overhead; this does not affect the application's smaller 64 MiB cap. Web-server request-body limits and true end-to-end maximum were not separately stress-tested, and should not be claimed as verified. The largest known published video in live smoke testing was 7,863,189 bytes, but this is a playback fixture, not a claimed upload stress limit. No secrets, cookie values or private paths were supplied.

**Acceptance decision:** PoC-A runtime, authentication configuration, schema/media/publishing and deployment gates have sufficient positive CI and owner-host evidence for closing #2, #4, #6 and #8. Follow-up design/operations work remains intentionally open as issues #16–#18; a browser author editor/learner runner belongs to PoC-B.

The checks above finish the operational evidence required by #2/#4/#6. A later PoC-B acceptance test still needs the complete editor, both question types, anonymous learner evaluation and bilingual feedback.
