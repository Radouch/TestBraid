# Architecture and data model

This document describes the **implemented** TestBraid architecture (v0.7.0), rather than earlier proof-of-concept proposals. It is intended for developers and operators inspecting the source.

## 1. Components and deployment boundary

| Layer | Implementation | Responsibility |
| --- | --- | --- |
| Browser frontend | Vue 3, TypeScript, Vite, Vue Router, Vue I18n, Bootstrap 5 | Author editor, catalog, media library, learner runner and client-side evaluation |
| API | PHP 8.1+ declared, Slim 4, native PHP sessions | Authentication, CSRF, validated JSON CRUD, publication and media handling |
| Validation | JSON Schema Draft 2020-12, Ajv in frontend, Opis in PHP | Shared record shapes, with additional semantic validation |
| Storage | Private JSON documents and uploaded files on disk | Lessons, tests, author metadata, uploads; no SQL database |
| Public media | Apache-served files in `www/media/` | Video/image delivery for published tests, including byte ranges |

The frontend can be hosted on ordinary Apache/PHP shared hosting. It does not require a persistent Node.js service, database or message queue.

## 2. Repository and installed layouts

In source control:

~~~text
frontend/            Vue UI, source locale files and npm scripts
backend/             Slim API, PHP libraries, Composer metadata
schemas/             canonical shared JSON Schemas and fixtures
deploy/              public PHP entry points and Apache rules
scripts/             deployment packaging/verification
.github/workflows/   CI and release ZIP automation
docs/en/             English manuals
~~~

The **installed** layout deliberately differs:

~~~text
<public-app-directory>/
  index.php              dynamic frontend HTML entry
  api/index.php          public API entry
  backend-path.php       common resolver
  assets/, locales/      prebuilt frontend resources
  media/                 published file copies + .htaccess
<private-backend>/
  public/index.php       Slim application
  templates/index.html   private built frontend HTML template
  src/, vendor/, schemas/, bin/
  config/app.json
  config/authors.json    created at first-author setup
  storage/               private records and original media
~~~

The canonical root `schemas/` is copied into the private backend by packaging. `frontend/dist/index.html` becomes `<private-backend>/templates/index.html`; the public `index.php` inserts a validated URL-base tag at request time. Therefore one static frontend build works at `/` or at a nested path. The public index and API bootstrap share `backend-path.php`, optionally configured by a local `bootstrap.local.php`.

## 3. Data records and identity

JSON Schema files in `schemas/` define the current v1 document contracts. Server-managed IDs and media references are stable identifiers, not user-supplied filesystem paths.

- **Lesson/group:** named ordering context for tests (historically called `group` in the API and schema).
- **Test:** `schemaVersion: 1`, ID, `groupId`, content `language`, title, description, status (`draft` / `published`), timestamps, optional `showOverallScore`, question sequence and optional ordering position.
- **Choice question:** a sequence of content blocks for the prompt, individual answer options and a set of correct option IDs; mode is `single` or `multiple`.
- **Matching question:** prompt blocks, left/source and right/counterpart item lists, and explicit ID-based matches.
- **Content block:** text, image or video. Image/video blocks reference media IDs, not file paths.
- **Media metadata:** kind, MIME type, size, original filename and optional home lesson `groupId`.

Records are stored in private directories under `storage/`, including `groups/`, `tests/`, `media/` and binary `media-files/`. The latter contains private originals. `config/authors.json` holds password hashes separately from lesson/test data.

## 4. API surface

All paths below are relative to the installation's URL base (e.g. `/courses` before `/api`).

| Area | Method/path | Role |
| --- | --- | --- |
| Availability | `GET /api/health` | Anonymous health JSON |
| Site configuration | `GET /api/public/config` | Anonymous public site identity and enabled UI languages; no private upload settings |
| Author session | `GET /api/auth/session` | Session state, setup state and CSRF token |
| Author setup/login | `POST /api/auth/setup`, `POST /api/auth/login`, `POST /api/auth/logout` | Account initialization and session transitions |
| Public catalog | `GET /api/public/catalog` | Only published test summaries grouped by lessons |
| Public test | `GET /api/public/tests/{id}` | Published test and media URL mapping; draft/nonexistent returns 404 |
| Lessons | `GET/POST /api/admin/groups`; `PATCH/DELETE /api/admin/groups/{id}`; `PUT /api/admin/groups/order` | Lesson CRUD and order |
| Tests | `GET/POST /api/admin/tests`; `GET/PUT/DELETE /api/admin/tests/{id}`; `PUT /api/admin/tests/order` | Test CRUD and order |
| Test actions | `POST /api/admin/tests/{id}/duplicate`, `/publish`, `/unpublish` | Copy, publish and withdraw |
| Test readiness | `GET /api/admin/tests/readiness` | Author-only publication checks |
| Media | `GET/POST /api/admin/media`; `GET/PATCH/DELETE /api/admin/media/{id}`; `GET/HEAD /api/admin/media/{id}/preview` | Private media catalog, upload, assignment, deletion and preview |
| Media limits | `GET /api/admin/media/limits` | Effective author upload limits |
| Diagnostics | `GET /api/admin/storage-diagnostics`, `/environment-diagnostics`, `/installation/security` | Limited signed-in operator checks |

The `/api/admin` group is author-authenticated; modifying requests require CSRF protection. The exact request/response data model and status codes should be taken from the versioned PHP routes and shared schemas, not the older implementation proposals under the previous `docs/` directory.

## 5. Authentication and security boundaries

The first author requires an SFTP-installed, private one-time `config/setup.key` and a CSRF-checked setup request. Author passwords are stored as hashes; PHP sessions use secured production cookies and rate limiting.

Private drafts, original media, backend PHP source and author records must not be HTTP accessible. Published tests intentionally include their answer keys in public JSON because the learner runner grades locally; TestBraid is **not** an exam-secrecy system.

The author-only installation diagnostic inspects placement and Apache protection and optionally checks a harmless marker URL. A 403/404 response for one marker URL is not proof of universal backend isolation.

## 6. Storage, consistency and publishing

`JsonFileRepository` validates IDs, uses private lock files and promotes new JSON documents through temporary files and atomic replacement. Publication operations use a shared private publication lock to coordinate test mutations and media references.

The publication service validates the saved test and required media, prepares static Apache-served copies for its media references, and records the published status. Public listing and test routes only return published records. Unpublishing removes public test availability and reconciles copies not needed by other published tests; private originals are retained. A repair script `bin/reconcile-public-media.php` is provided for operational maintenance.

A media item may have one home lesson for organization yet be referenced across many lessons/tests. Deletion requires **no references in either draft or published tests**. Empty lessons can be removed without deleting media. The standalone library supports multi-file selection and one-click batch processing in FilePond, but sends a separate authenticated upload request for each file (up to two in parallel); editor attachments remain single-file.

This file-backed design makes installation simple, but operators must take consistent backups of multiple related files. There is no integrated database transaction spanning all records and no automatic global migration or backup service.

## 7. Browser-side evaluation

A test is displayed on one continuous page with collapsible question panels and a question overview. Both public tests and author-only saved previews use `TestRunner.vue`. Supported question types:

- **Choice:** one or multiple selected IDs; correctness requires an exact match to the answer key.
- **Matching:** one-to-one associations by IDs, independent of display order. Counterparts are shuffled between attempts.

The grading implementation in `frontend/src/learner/scoring.ts` gives **one point per fully correct question**, without partial credit. `showOverallScore: false` hides aggregate point reporting but retains individual correctness feedback. Learner responses remain in browser state and are not uploaded for storage.

## 8. Localization and extensibility

UI strings load at runtime from `www/locales/<code>.json`; `uiLanguages` in private `app.json` controls offered locales. Site title/description may be locale maps. Test `language` is independent of interface locale; multilingual content variants are not automatically generated.

New question types would require changes to JSON Schemas, editing, rendering, validation, persistence compatibility and scoring. The current system is deliberately **not** a plugin ecosystem or an LMS.

For local setup and tests, see [Development](development.md). For deployment and operational limits, see [Installation](installation.md) and [Security and backups](security-and-backups.md).
