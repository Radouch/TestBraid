# Development

This guide is for contributors working on TestBraid's **source code**. Users installing the application should start with the [Quick start](quick-start.md) and the prebuilt release ZIP.

## Prerequisites and project layout

Use Node.js, npm, PHP and Composer versions compatible with the repository's package manifests and lockfiles. CI specifies the toolchain used for automated validation:

- `frontend/` — Vue/TypeScript application, translations and frontend tests.
- `backend/` — Slim/PHP application, Composer dependencies and PHP tests.
- `schemas/` — shared JSON Schema files and fixtures.
- `deploy/` — public PHP bootstraps and Apache rules.
- `demo/` — the English and Czech demo lessons shipped in install packages, see [demo/README.md](../../demo/README.md).
- `scripts/` — deployment assembly and verification.
- `.github/workflows/` — validation and release automation.

## Install and run locally

Install locked dependencies:

```sh
cd frontend && npm ci
cd ../backend && composer install
```

Run the backend (from `backend/`):

```sh
php -S 127.0.0.1:8080 -t public dev-router.php
```

Run the frontend in another terminal (from `frontend/`):

```sh
npm run dev
```

The Vite development server proxies API requests to the local PHP server. Local development is **not** a substitute for checking Apache rewriting and access rules on the target hosting platform.

For protected editor features, create a **local** author account via first-author setup or the private CLI provisioner. Do not commit credentials, account files or uploaded runtime data.

## Validate changes

Typical commands:

```sh
# In frontend/
npm run typecheck
npm run build
npm run test:schemas
npm run test:author
npm run test:upload
npm run test:runner

# In backend/
composer run lint
composer run test:schemas
composer run test:auth
composer run test:storage
composer run test:publication-http
```

These are examples, not an exhaustive test list. Consult the package scripts and CI workflow for the current suites. Browser-facing tests do not replace manual checks of uploads, media playback and hosting security.

## Build a deployment package

Build the frontend and assemble the public/private directory structure from the repository root:

```sh
cd frontend && npm run build
cd ..
node scripts/prepare-deployment.mjs --initial-install
node scripts/verify-deployment-package.mjs
```

Omit `--initial-install` for an upgrade staging package. By default this developer staging output does **not** bundle Composer's `vendor/`; the release workflow uses `--include-vendor` to create complete installation and upgrade ZIPs containing production dependencies.

Use the **assembled deployment directory**, not raw `frontend/dist/`, for hosting. Keep private files outside the web root and never package runtime credentials.

The release workflow builds validated archives when an appropriately versioned tag is pushed. For current tag/version rules and artifact naming, consult `.github/workflows/release.yml`.

## GitHub Pages demo

`.github/workflows/pages.yml` publishes a read-only learner demo of the lessons in `demo/storage` to GitHub Pages on every push to `main`. Pull requests only build it. To build and inspect it locally (with frontend dependencies and `backend/vendor/` installed):

```sh
node scripts/build-pages-demo.mjs /TestBraid
```

The result is in `pages-site/`, ready to be served under `/TestBraid/`. The demo needs no server code:

- **Frontend:** built with `TESTBRAID_STATIC_DEMO=1` (see `frontend/src/static-demo.ts`). That build has no author area, never asks for a sign-in session, and shows a banner linking to the installation guide. It goes into its own directory, so `frontend/dist` is never affected.
- **Data:** `backend/bin/export-static-demo.php` writes `api/public/config`, `api/public/catalog` and `api/public/tests/<id>` as static files, using the same services as a real installation, and copies the media into `media/`. The site name and introduction come from `demo/pages/app.json`.
- **Addresses:** `index.html` gets the same `<base data-testbraid-base>` element that the PHP entry point adds. A copy named `404.html` makes GitHub Pages hand unknown paths, such as a reloaded `/tests/<id>`, to the app's router.

Publishing requires GitHub Pages to be enabled once in the repository settings: Settings → Pages → Build and deployment → Source: **GitHub Actions**.

## Translating and contributing

Interface messages are JSON files under `frontend/public/locales/` and can be added to deployed installations without recompiling. Enabling a new interface language is controlled by private `app.json`; the content language of a test is separate.

Keep code comments and commits clear, update tests and relevant documentation when behavior changes, and use reviewable pull requests for substantial changes. Do not include host-specific secrets or personal test data.

See [Architecture](architecture.md) for the design and [Configuration](configuration.md) for deployment settings.
