# Architecture

TestBraid is a small, file-based application intended to run on ordinary Apache/PHP hosting.

## Main components

| Component | Role |
| --- | --- |
| **Vue and TypeScript frontend** | Public catalog, test editor, media library and learner interface |
| **PHP/Slim API** | Author authentication, data validation, storage and publication |
| **JSON files and uploaded media** | Persistent private data, without an SQL database |
| **Apache** | Serves the application and public media for published tests |

Shared JSON Schemas are validated by the frontend and backend. The source lives in `frontend/`, `backend/` and `schemas/`.

## Public and private directories

The distribution separates a public `www/` directory from a **private backend**. The latter holds configuration, author accounts, tests, original uploads, PHP code and dependencies.

The public directory contains the frontend assets, the PHP entry points and public copies of media needed by published tests. The built frontend's HTML template stays in the private backend; the public PHP entry point adds the installation's URL base when serving it. This lets one frontend build work in a domain root or subdirectory.

See [Installation](installation.md) for the required layout.

## Data model

- A **lesson** (called `group` in the API) organizes tests.
- A **test** has a lesson, title, description, content language, draft/published status, settings and questions.
- A **choice question** has answer options and one or more correct option IDs.
- A **matching question** stores associated pairs of items.
- A **content block** contains text or a reference to an image/video.
- **Media** has metadata and an optional home lesson. The same item can be reused across tests.

The definitive shapes are in `schemas/`. The backend stores private JSON records and files under `storage/`, with file locking and validated writes.

## API and publication

The API includes:

| Area | Example routes |
| --- | --- |
| Health and public configuration | `GET /api/health`, `GET /api/public/config` |
| Public content | `GET /api/public/catalog`, `GET /api/public/tests/{id}` |
| Author sessions | `/api/auth/*` |
| Lessons, tests and media | `/api/admin/groups`, `/api/admin/tests`, `/api/admin/media` |

Protected author operations use PHP sessions and CSRF checks. Public test endpoints return **published** records only; author previews and original uploads remain private.

Publication prepares public copies of referenced media while retaining the private originals. Removing a test from public view does not remove media still needed by other published tests.

The media library can upload several selected files with one action; the browser sends **individual authenticated requests** for them. The test editor continues to attach one file at a time.

## Evaluation and limitations

The learner interface evaluates answers **in the browser**. A question earns one point only if fully correct. Learner answers are not saved to the server.

Because the public test must be evaluated in the browser, the answer key is included in its public data. TestBraid is suitable for self-assessment, **not secret examinations**. There is no learner account system or built-in progress tracking.

For source setup and tests, see [Development](development.md).
