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

## Translating and contributing

Interface messages are JSON files under `frontend/public/locales/` and can be added to deployed installations without recompiling. Enabling a new interface language is controlled by private `app.json`; the content language of a test is separate.

Keep code comments and commits clear, update tests and relevant documentation when behavior changes, and use reviewable pull requests for substantial changes. Do not include host-specific secrets or personal test data.

See [Architecture](architecture.md) for the design and [Configuration](configuration.md) for deployment settings.
