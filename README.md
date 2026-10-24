# TestBraid

**TestBraid** is a planned lightweight, multilingual, self-hosted application for creating, sharing and completing multimedia self-assessment tests.

The project is **under active PoC-A development**. The Vue/Slim foundation passed a live deployment smoke test, and the owner successfully created the first author through `/admin` on the hosting server (2026-10-19). The storage increment has now passed live authenticated group/draft-test creation and read-back on the host (2026-10-19); editing and renaming remain covered by CI but not yet manually verified there.

## Project goals

- Author tests with text, images and videos in prompts and answer options.
- Support single/multiple-answer questions and one-to-one matching tasks.
- Let learners take tests anonymously and see their scores and correct answers.
- Group tests into author-defined categories.
- Provide an interface in English and Czech, with more languages possible.
- Run on ordinary Apache/PHP shared hosting without a database.
- Keep test configurations as JSON and media as files.
- Support a small number of authenticated test authors.

Randomized test generation from question banks is a **future feature**, not part of the initial delivery.

## Self-hosted installation identity

Each installation can set its own **multilingual** name and short home-page
introduction in the private `testbraid-backend/config/app.json` file. The
repository includes `backend/config/app.json` with Czech and English
defaults; simple language-independent strings remain supported. Upload
limits share the same configuration. First-time deployment packages include
the ready-to-use file with `--initial-install`; normal upgrade packages
**exclude all config/** to preserve local settings. Existing
`config/uploads.json` installations remain compatible until their
limits are migrated. A standard footer identifies **TestBraid** and shows its
build version (currently `0.1.0`), alongside the author sign-in link.
Release tags use `vMAJOR.MINOR.PATCH`; the footer links to the
[GitHub source repository](https://github.com/Radouch/TestBraid), which currently remains
private (anonymous visitors cannot access it). The public branding API is loaded before
Vue renders the interface, so customized site names do not flash the default title.
See [deployment details](docs/deployment.md#6d-installation-branding-version-and-upload-limits).

## Documentation

- [Functional specification](docs/functional-specification.md) — agreed requirements, priorities and open questions.
- [PoC 1 scope](docs/poc-scope.md) — agreed functionality, PoC-A/PoC-B increments, and acceptance criteria.
- [Preliminary technical research](docs/technical-research.md) — reusable libraries, tradeoffs and hosting/security considerations.
- [Private media upload and host acceptance](docs/media-uploads.md) — supported formats, server limits, authentication and verification.
- [Static published media and consistency](docs/published-media.md) — publication workflow, shared references, crash recovery and Apache acceptance.
- [Data model and API design](docs/data-model-and-api.md) — concrete proposal for JSON documents, validation, public/private media, endpoints and implementation sequence.
- [PoC-A implementation plan](docs/poc-a-implementation-plan.md) — ordered GitHub issues, scaffold setup and the deployment acceptance gate.
- [PoC-A acceptance evidence and runbook](docs/poc-a-acceptance.md) — tested CI/hosting behavior, repeatable deploy checks and confirmed PHP/cookie/quota configuration.
- [Apache/PHP deployment](docs/deployment.md) — PHP 8.5 hosting example with public `www/` and private backend, plus portable installation options.
- [Shared JSON schemas](schemas/) — versioned contracts and common structural/publication validation fixtures.

## Status

PoC-A 01–07 are implemented and merged into `main` as PRs #9–#14. On 2026-10-19 the owner verified the live Vue/Slim stack, author login, private JSON storage, authenticated image/video upload, anonymous static video playback, publication/unpublication, shared-media preservation, and Apache deny policies. **PoC-A 08 acceptance checks passed:** deployment-package audits and web-PHP runtime diagnostics are implemented, and the owner confirmed PHP 8.5.2 FPM, configured upload/post limits of 256M, secure session-cookie attributes and unmetered hosting storage on 2026-10-19. The overall PoC-A technical foundation is accepted; follow-up hardening tasks remain tracked separately. No full browser question editor or learner runner exists yet; these are PoC-B work.

Project documentation and source code will be primarily in English; see [AGENTS.md](AGENTS.md) for code-comment and contribution conventions.

## Initial developer scaffold

See [deployment guide](docs/deployment.md) for a frontend-only local build and installation of PHP dependencies using Composer on the shared host. A local Composer installation is optional. After building the Vue frontend, run `node scripts/prepare-deployment.mjs` from the repository root to create the upgrade-safe public/private SFTP deployment tree in `deployment-package/`. Use `--initial-install` on a new server to include the default private `config/app.json`. This copies the canonical root `schemas/` (including `fixtures/`) into the private deployed backend without moving it in source control; server `config/` (on upgrades), `storage/` and `vendor/` are deliberately excluded. The original deployed scaffold exposes `GET /api/health`. Existing functionality includes validation, author authentication, private persistence and media publication. The test editor and learner runner remain PoC-B work.

## Schema fixtures

After installing dependencies, run `npm run test:schemas` from `frontend/` and `composer run test:schemas` from `backend/`. These execute the same JSON fixtures against Ajv and Opis. See the [PoC-A plan](docs/poc-a-implementation-plan.md#schema-validation-increment-issue-3). No HTTP validation endpoint exists yet.

## Author authentication (incremental)

The authentication component provides bilingual sign-in/out and one-time first-author setup forms backed by PHP sessions, CSRF protection and private configuration files. The first account can be created without SSH scripts by uploading a random `setup.key` via SFTP and completing the form in `/admin`. See [deployment instructions](docs/deployment.md#6-first-author-setup-through-the-browser-no-ssh-scripts). Protected JSON group and draft-test endpoints are available, but they are not a browser-based test editor. Basic storage functionality has been live-tested on the host. No author credentials or private files belong in this repository.
