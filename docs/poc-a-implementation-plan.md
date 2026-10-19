# TestBraid — PoC-A Implementation Plan

**Status:** PoC-A 01–07 merged to `main`; PoC-A 08 CI/deployment and web-PHP runtime evidence accepted on 2026-10-19. See [acceptance matrix](poc-a-acceptance.md).  
**Date:** 2026-10-18  
**Scope authority:** [PoC 1 scope](poc-scope.md)  
**Design input:** [Data model and API](data-model-and-api.md)

## Goal and completion gate

**Current evidence:** See [PoC-A acceptance runbook](poc-a-acceptance.md). The early implementation notes below describe how milestones were introduced; they are not a current deployment status report. All PRs #9–#14 are merged, and real-host publication/audio-video scenarios passed. Effective web-PHP settings, secure cookies and hosting capacity have since been confirmed in the [acceptance evidence](poc-a-acceptance.md).

PoC-A proves the deployment and security foundation on an actual Apache/PHP host, before building the full author/editor and learner flows. A successful PoC-A demonstrates:

- Vue 3 + TypeScript + Vite + Bootstrap 5 frontend and English/Czech UI.
- Slim 4 API on the same origin, with no database or persistent Node.js process.
- Safe native PHP session login and protected admin operations.
- JSON file write/reload, using shared JSON Schema validation.
- Image/video upload, private draft preview and public static media playback.
- Verified host constraints, repeatable deployment and security checks.

A **repository scaffold is not equivalent to completed PoC-A**.

## Ordered work items

| ID | GitHub issue | Deliverable | Depends on |
| --- | --- | --- | --- |
| A01 | [#1 — Repository scaffold](https://github.com/Radouch/TestBraid/issues/1) | Vue/Vite, Slim, local smoke test, instructions | — |
| A02 | [#2 — Hosting deployment](https://github.com/Radouch/TestBraid/issues/2) | Apache rewrites, runtime/version/size checks, HTTPS | A01 |
| A03 | [#3 — JSON Schema](https://github.com/Radouch/TestBraid/issues/3) | Ajv/Opis schema parity and fixtures | A01 |
| A04 | [#4 — Authentication](https://github.com/Radouch/TestBraid/issues/4) | Sessions, CSRF, throttling, auth middleware | A01, A02 |
| A05 | [#5 — JSON storage](https://github.com/Radouch/TestBraid/issues/5) | Atomic file persistence and protected endpoints | A03, A04 |
| A06 | [#6 — FilePond upload](https://github.com/Radouch/TestBraid/issues/6) | Secure upload, metadata and private preview | A02, A04, A05 |
| A07 | [#7 — Static publication](https://github.com/Radouch/TestBraid/issues/7) | Public media lifecycle and video seek | A02, A05, A06 |
| A08 | [#8 — Validation gate](https://github.com/Radouch/TestBraid/issues/8) | Integration tests, deployment runbook, evidence | A01–A07 |

The sequence is dependency-driven, not a calendar estimate. A02 and A03 can proceed in parallel after A01.

## Initial scaffold content

- `frontend/`: Vue app with Vite, TS, Bootstrap CSS, Vue Router and Vue I18n. The landing page checks the backend via `GET /api/health`.
- `backend/`: Slim 4 + `slim/psr7` manifest, health endpoint, PHP development router. No authentication or writable API yet.
- `deploy/www/`: the public PHP bootstrap, the **host-verified root Apache rewrite rules** and future public media protection (not yet tested).
- `docs/deployment.md`: instructions for the initial PHP 8.5 host with a public `www/` and adjacent private backend.
- Repository-level `.gitignore` excludes build artifacts, installed dependencies, credentials and writable private state.

### Development and first deployment

The owner will **build the frontend locally but install PHP dependencies on the hosting server via SSH Composer**. A local Composer installation is not required.

```sh
cd frontend
npm install
npm run build
```

To test the complete stack locally, a developer may *optionally* install Composer and run the PHP development server, but that is not part of the owner's deployment workflow. Without a local API, the frontend correctly shows that the backend is unavailable.

See [deployment guide](deployment.md) for the exact public/private layout, copy commands and Composer installation on the first host. The example host runs PHP **8.5** and has this directory structure:

```text
<domain-directory>/
  www/                 # public document root
  testbraid-backend/   # sibling private PHP backend
```

The public `www/api/index.php` bootstrap loads the private `testbraid-backend/public/index.php` entry, which in turn loads its own Composer `vendor/`. If a provider uses different paths, override `TESTBRAID_BACKEND_ENTRY` or adapt only the deployment bootstrap.

**Dependency lockfiles:** Generate `frontend/package-lock.json` and `backend/composer.lock` using actual installations, then commit reviewed lockfiles before reproducible CI/production deployment. No lockfiles are fabricated by hand.

## Schema validation increment (Issue #3)

The next incremental PR provides six canonical **JSON Schema Draft 2020-12** contracts under `schemas/`: test, group, media, content block, choice question and matching question. Browser/client code uses Ajv 2020; PHP uses Opis JSON Schema. Both validate the same fixture corpus.

Drafts may contain incomplete questions and still pass structural validation. A separate publication validator checks meaningful content, at least one question, answer-option references, strict one-to-one matching, duplicate IDs, missing groups and missing media.

Run the shared fixtures after installing each runtime's dependencies:

```sh
cd frontend
npm install
npm run typecheck
npm run test:schemas

cd ../backend
composer install
composer run test:schemas
```

Backend fixtures can also run on shared hosting after copying `backend/bin/`, `backend/src/`, and `schemas/` into the private backend directory. Both runners fail with a nonzero exit code if expectations do not match.

**Limits:** schemas and validation helpers are not yet connected to HTTP routes or persistence. The fixture corpus verifies behavior only once dependencies are installed. Real datastore-backed group/media existence checks will be added when storage is implemented. The proposed minimum of two matching pairs is currently enforced as a provisional PoC default.

## Authentication increment (Issue #4)

The authentication PR adds server-side author sessions, login/logout, CSRF protection for mutating operations, brute-force throttling and a guarded `GET /api/admin/ping` endpoint. Credentials are provisioned with `backend/bin/create-author.php` into a private JSON file outside `www/`; no public registration exists.

The Vue `/admin` placeholder becomes a minimal bilingual sign-in/sign-out form. The API still does not allow creating/editing tests; all future `/api/admin/*` routes must live in the protected Slim route group.

GitHub Actions **passed** on 2026-10-19 (PHP 8.5 + Node 22): Vue typecheck/build, both schema fixture runners and the HTTP authentication integration checks for anonymous access, login/logout, CSRF rotation, origin validation and brute-force throttling. See [CI run](https://github.com/Radouch/TestBraid/actions/runs/39248989019). Actual host authentication, filesystem permissions, secure cookies and HTTPS remain to be verified. See [deployment guide](deployment.md#6-author-provisioning-and-security-authentication-increment).

### Apache route-base regression

After the first auth-branch deployment, the owner reported HTTP 404 from `/api/health`, although this endpoint had worked on the foundation branch. Auth had introduced automatic base-path detection from `SCRIPT_NAME`; this was unnecessary for the domain-root deployment and potentially wrong under Apache rewrites. The base path now defaults to empty and may be set explicitly using `TESTBRAID_BASE_PATH` only for subdirectory hosting. The PHP dev-router smoke test simulates a rewritten internal `SCRIPT_NAME` and verifies root API routes remain reachable. The owner subsequently confirmed successful first-author browser setup on the corrected backend, supporting the routing fix; the exact HTTP responses and cookie attributes were not independently captured.

### First-author browser setup

A follow-up to Issue #4 now provides one-time first-author provisioning via the Vue `/admin` page, without running a PHP script over SSH. The owner must upload a randomly generated one-time key as `testbraid-backend/config/setup.key` using SFTP or a hosting file manager. The backend checks that key and the session's CSRF token; no user can be created via the browser after an initial author exists. Invalid setup keys are rate-limited, and concurrent requests use the same private lock as the optional CLI author creator.

The first author is logged in immediately. The private key is removed after successful creation where permissions permit; setup stays locked even if removal fails. A separate PHP HTTP integration test exercises missing/incorrect key, CSRF, successful bootstrap, denial of further bootstrap, and persistence.

The setup flow passed automated CI checks, and on **2026-10-19** the owner confirmed successful creation of the first author on the actual shared hosting via `setup.key` and `/admin`. This verifies the first-account flow and PHP write access to private author configuration. Separate logout/login, secure cookie attributes and independent production security checks are not yet fully documented.

## Hosting verification — initial live smoke test passed

On **2026-10-19**, the owner confirmed the Vue home page, `/api/health` JSON response, and both `/admin` and `/tests/example` deep links (including page reloads) on the example domain.

The original Apache rewrite template caused HTTP 500 for `/api/health`. The owner confirmed that the final rewrite configuration using `[END]`, without the root `Options -Indexes` directive, works for all four checks. We did **not** isolate which original directive caused the failure. The corrected `deploy/www/.htaccess` is committed to this branch; see [deployment guide](deployment.md).

Still to verify before closing [#2](https://github.com/Radouch/TestBraid/issues/2):

- The web PHP handler version and necessary extensions (PHP 8.5 is owner-reported).
- Private Composer/vendor/config/storage paths and file permissions cannot be read via HTTP.
- Media-directory `.htaccess` behavior, future uploads, size limits, quotas and byte-range support for video.
- Error logs and session storage requirements as the auth layer is implemented.

The domain is an example, not an application-code dependency. Portable installations use the Vite base and configurable private backend entry point.

## Exclusions and cautions

- The initially deployed foundation contains no login, groups, tests, schema validation or upload; authentication and schema code are implemented only on later stacked branches until deployed.
- No secrets or account configuration may be committed.
- The `/api/health` response reveals no environment details.
- API errors must not expose server paths or stack traces.
- The actual API shape and exact JSON properties are still design proposals subject to review.
- Hosting evidence and package installation/build checks cannot be claimed before they occur.

## Transition to PoC-B

PoC-B begins only after foundation deployment and security requirements are satisfied. Its scope is the author editor for choice/matching tasks, test publication/share URL, anonymous learner runner and self-assessment feedback.
