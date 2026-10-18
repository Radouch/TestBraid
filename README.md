# TestBraid

**TestBraid** is a planned lightweight, multilingual, self-hosted application for creating, sharing and completing multimedia self-assessment tests.

The project is **in the specification and technical-research stage**. There is no runnable application yet.

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

## Status

The PoC scope and main library choices have been agreed. The data model/API design remains a proposal. A preliminary frontend/backend scaffold is under review; authentication, persistence, upload and the complete application are not implemented.

Project documentation and source code will be primarily in English.
## Initial developer scaffold

See [PoC-A implementation plan](docs/poc-a-implementation-plan.md#initial-scaffold-content) for local Vue + PHP startup. The only operational API route in this scaffold is `GET /api/health`; all other application routes are placeholders.
