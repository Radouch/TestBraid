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

## Documentation

- [Functional specification](docs/functional-specification.md) — agreed requirements, priorities and open questions.
- [PoC 1 scope](docs/poc-scope.md) — agreed functionality, PoC-A/PoC-B increments, and acceptance criteria.
- [Preliminary technical research](docs/technical-research.md) — reusable libraries, tradeoffs and hosting/security considerations.
- [Data model and API design](docs/data-model-and-api.md) — concrete proposal for JSON documents, validation, public/private media, endpoints and implementation sequence.
- [PoC-A implementation plan](docs/poc-a-implementation-plan.md) — ordered GitHub issues, scaffold setup and the deployment acceptance gate.
- [Apache/PHP deployment](docs/deployment.md) — PHP 8.5 hosting example with public `www/` and private backend, plus portable installation options.
- [Shared JSON schemas](schemas/) — versioned contracts and common structural/publication validation fixtures.

## Status

The PoC scope and main library choices have been agreed. The data model/API design remains a proposal. The scaffold, shared validation and author authentication are implemented in stacked draft PRs. The first author was created on the live host. The filesystem persistence increment is under review; media upload, publication and the learner flow are not yet implemented.

Project documentation and source code will be primarily in English; see [AGENTS.md](AGENTS.md) for code-comment and contribution conventions.

## Initial developer scaffold

See [deployment guide](docs/deployment.md) for a frontend-only local build and installation of PHP dependencies using Composer on the shared host. A local Composer installation is optional. After building the Vue frontend, run `node scripts/prepare-deployment.mjs` from the repository root to create the complete public/private SFTP deployment tree in `deployment-package/`. This copies the canonical root `schemas/` (including `fixtures/`) into the private deployed backend without moving it in source control; server `config/`, `storage/` and `vendor/` are deliberately excluded. The original deployed scaffold exposes `GET /api/health`. Later incremental branches add schema validators and author authentication without yet implementing test editing.

## Schema fixtures

After installing dependencies, run `npm run test:schemas` from `frontend/` and `composer run test:schemas` from `backend/`. These execute the same JSON fixtures against Ajv and Opis. See the [PoC-A plan](docs/poc-a-implementation-plan.md#schema-validation-increment-issue-3). No HTTP validation endpoint exists yet.

## Author authentication (incremental)

The authentication increment adds bilingual sign-in/out and one-time first-author setup forms backed by PHP sessions, CSRF protection and private configuration files. The first account can be created without SSH scripts by uploading a random `setup.key` via SFTP and completing the form in `/admin`. See [deployment instructions](docs/deployment.md#6-first-author-setup-through-the-browser-no-ssh-scripts). This branch adds protected JSON group and draft-test endpoints; they are not a browser-based test editor. Basic storage functionality has been live-tested on the host. No author credentials or private files belong in this repository.
