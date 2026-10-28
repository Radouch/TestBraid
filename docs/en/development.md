# Development and contributions

TestBraid is a Vue/TypeScript frontend with a PHP/Slim API, JSON Schema contracts and filesystem storage. This guide is for people building or changing **source code**, not for users installing a prebuilt ZIP. See [Installation](installation.md) for that workflow.

## 1. Toolchain

The project CI uses **Node.js 22** and **PHP 8.5 with Composer 2**, plus standard shell tooling for HTTP smoke tests. `frontend/package-lock.json` and `backend/composer.lock` are committed; use locked installs for reproducible dependency resolution.

The backend declares PHP `^8.1` with the `fileinfo` extension, but not every version in that range has been tested on a real host. For development that matches CI, use PHP 8.5. Apache is used for final deployment tests; PHP's built-in server is sufficient for isolated local API development.

Main technologies: Vue 3, TypeScript, Vite, Vue Router, Vue I18n, Bootstrap, FilePond, Slim 4, Ajv and Opis JSON Schema.

## 2. Install dependencies

From a fresh repository checkout:

~~~sh
cd frontend
npm ci
npm run typecheck
npm run build
cd ../backend
composer install
composer validate --no-check-publish
~~~

`npm ci` installs exactly what the npm lockfile specifies; `composer install` installs locked backend packages. Do not routinely run `npm install` or `composer update` merely to deploy an existing version. Those commands may modify dependency metadata and belong in a deliberate, reviewed dependency update.

For Composer CLI commands, run in `backend/` unless stated otherwise.

## 3. Run locally

Two processes are convenient for development:

**Backend** (from `backend/`):

~~~sh
php -S 127.0.0.1:8080 -t public dev-router.php
~~~

**Frontend** (from `frontend/`, in another terminal):

~~~sh
npm run dev
~~~

The Vite development server proxies `/api` to `http://127.0.0.1:8080`. The local PHP router uses `backend/public/index.php` and does not implement production Apache behavior. Browser URLs are displayed by Vite (normally localhost port 5173).

You will need a local private author account for protected workflows. Use the `/admin` first-author setup with a private `backend/config/setup.key` and an isolated local environment, or use the CLI provisioner. The PHP CLI script expects the password on **standard input**, not in a command argument:

~~~sh
cd backend
php bin/create-author.php your-username < /path/to/private-password-file
~~~

Do not commit local credentials, generated `authors.json`, `setup.key`, runtime storage or media files. Avoid reusing real production passwords locally. Production security and Apache URL rewriting still require a real-host check.

## 4. Frontend tests

From `frontend/`:

| Command | Coverage |
| --- | --- |
| `npm run typecheck` | TypeScript/Vue type checking |
| `npm run build` | Typecheck and production Vite build |
| `npm run test:schemas` | Shared JSON fixtures with Ajv |
| `npm run test:editor` | Question model, answer keys and editing invariants |
| `npm run test:content` | Content blocks and media selection |
| `npm run test:author` | Author workspace and catalog |
| `npm run test:upload` | FilePond upload transport, multi-file library batches and single-file editor attachments |
| `npm run test:learner` | Pure grading logic |
| `npm run test:runner` | Mounted learner/preview interactions |
| `npm run test:published` | Published read-only rendering |
| `npm run test:navigation`, `test:base` | Routing and runtime URL bases |
| `npm run test:branding`, `test:locales` | Installation identity and locale selection |
| `npm run test:security` | Installation diagnostic UI |

The DOM suites use Happy DOM and isolated fixtures. They do not replace manual browser testing of video playback, touch interaction, SFTP deployment or Apache access rules.

## 5. Backend tests

From `backend/`:

~~~sh
composer run lint
composer run test:schemas
composer run test:auth
composer run test:setup
composer run test:storage
composer run test:storage-roots
composer run test:storage-http
composer run test:media-http
composer run test:upload-limits
composer run test:publication-http
composer run test:publication-failures
composer run test:ui-languages
~~~

The backend also contains standalone checks for path resolution, subdirectory configuration, installation diagnostics and dynamic SPA rendering:

~~~sh
php bin/test-bootstrap-path.php
php bin/test-subdirectory-config.php
php bin/test-installation-security.php
php bin/test-runtime-spa.php
~~~

Many HTTP tests start isolated loopback PHP servers, create disposable credentials/storage, and may use utilities such as `curl`, `jq` and POSIX shell. They must **not** be aimed at a production host with real data.

The shared canonical schemas and fixtures are under repository-root `schemas/`. Both Ajv and Opis validate those same contracts; semantic publication rules add constraints beyond raw JSON structure.

## 6. Build a deployable package from source

From the repository root, after installing dependencies and building `frontend/dist`:

~~~sh
node scripts/prepare-deployment.mjs --initial-install
node scripts/verify-deployment-package.mjs
~~~

This creates a vendor-free initial-install **SFTP staging tree** under ignored `deployment-package/`. It intentionally copies no runtime secrets, authors or storage. The staged output contains a public `www/` and a private `testbraid-backend/` with copied schemas and the built `templates/index.html`.

For an existing installation, omit `--initial-install` so the package does not include `config/`:

~~~sh
node scripts/prepare-deployment.mjs
node scripts/verify-deployment-package.mjs
~~~

These default staging modes exclude `vendor/`, so an operator must preserve/provision PHP dependencies separately.

The **release workflow** instead installs reviewed, locked production PHP dependencies, packages with `--include-vendor`, and verifies each final ZIP in `--release` mode. It creates separate install/upgrade ZIPs and `SHA256SUMS`. The package verifier rejects unexpected runtime files, public secrets, symbolic links, missing schemas and incorrect private-template placement.

Do not upload raw `frontend/dist/` as a completed deployment. Its `index.html` must be moved into private `templates/` and the public PHP bootstrap used for correct runtime base URLs.

## 7. CI and releases

`.github/workflows/validation.yml` runs frontend and backend checks on pull requests and manual dispatch. `.github/workflows/release.yml` reuses validation and builds ZIPs; it runs manually or on version tags matching `vMAJOR.MINOR.PATCH`. A **version tag push** triggers publication of a GitHub Release when checks and packaging pass. The tag must equal the version in `frontend/package.json`.

The release produces:

- `testbraid-vX.Y.Z-install.zip` — default `config/app.json` plus locked `vendor/`.
- `testbraid-vX.Y.Z-upgrade.zip` — no private `config/`, but locked `vendor/`.
- `SHA256SUMS`.

The version displayed in the footer comes from frontend package metadata at build time, not `app.json`.

## 8. Editing language files

Runtime UI dictionaries live in `frontend/public/locales/` and are copied to public `www/locales/` during build/packaging. Add a UTF-8 `<code>.json` with the same message keys as `en.json` and a suitable `languageName`. At deployment time, the operator enables that code in private `app.json` `uiLanguages`. Adding a dictionary to an already deployed installation does **not** require recompiling the frontend.

UI translations do not create translations of test content. English and Czech documentation are maintained in parallel under `docs/en/` and `docs/cs/`; when changing a public guide, update its corresponding translation together once both exist.

## 9. Contribution conventions

- Keep code, identifiers, code comments and commits in English; explain non-obvious behavior, security-sensitive choices and API contracts rather than adding obvious comments.
- Follow `AGENTS.md` for source conventions, but correct outdated guidance as the bilingual documentation is integrated.
- Use focused issues and reviewable pull requests for nontrivial changes.
- Update tests and docs together when behavior changes; preserve API/schema compatibility or explicitly plan a migration.
- Keep credentials, host-specific paths, sample real-user data and generated deployment files out of commits.
- Prefer small, verifiable changes; report separately what CI covers and what was actually tested on Apache/shared hosting.

For detailed code behavior consult the versioned sources in `frontend/src/`, `backend/src/` and `schemas/`, and see [Architecture](architecture.md).
