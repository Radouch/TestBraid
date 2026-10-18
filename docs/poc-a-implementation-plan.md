# TestBraid — PoC-A Implementation Plan

**Status:** Active plan; scaffold submitted for review  
**Date:** 2026-10-18  
**Scope authority:** [PoC 1 scope](poc-scope.md)  
**Design input:** [Data model and API](data-model-and-api.md)

## Goal and completion gate

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
- `deploy/`: **unverified examples** of Apache rewrite and media protection settings.
- Repository-level `.gitignore` excludes build artifacts, installed dependencies, credentials and writable private state.

### Local startup

Requires a supported Node.js runtime, npm, PHP **8.1+**, Composer and access to npm/Packagist.

Terminal 1:

```sh
cd backend
composer install
php -S 127.0.0.1:8080 -t public dev-router.php
```

Terminal 2:

```sh
cd frontend
npm install
npm run dev
```

Open the Vite URL shown by the terminal. Its dev proxy forwards `/api/*` to PHP on port 8080.

Verification:

```sh
curl -i http://127.0.0.1:8080/api/health
cd frontend && npm run typecheck && npm run build
cd ../backend && composer run lint
```

Expect HTTP 200 JSON with `status: "ok"`. The browser displays either a connected or unavailable API status. The `/admin` and `/tests/:id` routes are placeholders, not usable features.

**Dependency lockfiles:** Install dependencies in a network-enabled environment, review them and commit `frontend/package-lock.json` and `backend/composer.lock` before setting up reproducible CI/deployment. These files are not fabricated by hand.

## Hosting deployment — pending real verification

The intended deployment layout has private PHP source/vendor and secrets **outside** the Apache document root. Copy `frontend/dist/*` to the public web root and wire `/api` to a PHP front controller. The provided `deploy/apache.htaccess.example` is only a starting point.

The PHP entrypoint can use `TESTBRAID_BACKEND_ROOT` to find its private Composer `vendor/`. How to set that value on the actual shared hosting is not decided until issue #2.

Do not upload private JSON, password files or writable originals inside `public_html`. Public media should be approved static files, with script execution disabled. Apache's `.htaccess` capabilities and actual video byte-range handling must be tested.

Record:

- Hosting provider, domain/subpath, document root.
- PHP version/extensions and ability to set PHP environment variables.
- HTTPS, rewrites, permission boundaries and session configuration.
- `upload_max_filesize`, `post_max_size`, timeouts and quota.
- Static media behavior, anti-execution rules and byte-range support.

## Exclusions and cautions

- No login, groups, tests, schema validation or upload exists in the scaffold.
- No secrets or account configuration may be committed.
- The `/api/health` response reveals no environment details.
- API errors must not expose server paths or stack traces.
- The actual API shape and exact JSON properties are still design proposals subject to review.
- Hosting evidence and package installation/build checks cannot be claimed before they occur.

## Transition to PoC-B

PoC-B begins only after foundation deployment and security requirements are satisfied. Its scope is the author editor for choice/matching tasks, test publication/share URL, anonymous learner runner and self-assessment feedback.
