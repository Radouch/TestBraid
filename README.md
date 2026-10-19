# TestBraid

**TestBraid** is a planned lightweight, multilingual, self-hosted application for creating, sharing and completing multimedia self-assessment tests.

The project is **under active PoC-A development**. The Vue/Slim foundation has passed its initial live deployment smoke test; later schema/authentication features are implemented in stacked PRs but have not been deployed.

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
- [Apache/PHP deployment](docs/deployment.md) — PHP 8.5 hosting example with public `www/` and private backend, plus portable installation options.\n- [Shared JSON schemas](schemas/) — versioned contracts and common structural/publication validation fixtures.

## Status

The PoC scope and main library choices have been agreed. The data model/API design remains a proposal. A preliminary frontend/backend scaffold is under review; authentication, persistence, upload and the complete application are not implemented.

Project documentation and source code will be primarily in English; see [AGENTS.md](AGENTS.md) for code-comment and contribution conventions.

## Initial developer scaffold

See [deployment guide](docs/deployment.md) for a frontend-only local build and installation of PHP dependencies using Composer on the shared host. A local Composer installation is optional. The original deployed scaffold exposes `GET /api/health`. Later incremental branches add schema validators and author authentication without yet implementing test editing.

## Schema fixtures

After installing dependencies, run `npm run test:schemas` from `frontend/` and `composer run test:schemas` from `backend/`. These execute the same JSON fixtures against Ajv and Opis. See the [PoC-A plan](docs/poc-a-implementation-plan.md#schema-validation-increment-issue-3). No HTTP validation endpoint exists yet.

## Author authentication (incremental)

The stacked authentication branch adds a bilingual sign-in/out form backed by PHP sessions, CSRF protection and a private author file. See [deployment instructions](docs/deployment.md#6-author-provisioning-and-security-authentication-increment). There are still no test editing or storage endpoints. No author credentials or private files belong in this repository.
