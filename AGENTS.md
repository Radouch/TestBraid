# TestBraid — Development Instructions

These instructions apply to source code, tests, documentation, issues and PRs.

## Language and comments

- Write source code, identifiers, code comments, documentation and commit messages in **English**.
- **Include useful comments in code**: explain the purpose of non-obvious functions and modules, algorithms, security-sensitive decisions, path handling, API contracts and important trade-offs.
- Document public or tricky interfaces with concise docblocks where appropriate.
- Avoid comments that merely restate obvious statements. Keep comments accurate when code changes.
- Do not use comments as a substitute for clear names and tests.

## Architecture

- Vue 3 + TypeScript + Vite, Bootstrap 5 CSS, Vue Router and Vue I18n.
- Slim 4 API with native PHP sessions; no SQL database or persistent Node.js runtime.
- JSON Schema Draft 2020-12; Ajv client validation and Opis PHP validation (not implemented yet).
- FilePond must be hidden behind a local `MediaUploader` abstraction.
- Use an application-owned, typed text/image/video block editor.
- Keep private backend code, credentials, JSON and original media outside the public document root.
- Do not hardcode the example hostname `testbraid.mariebila.cz` or host-specific absolute paths into application code.
- All privileged operations must be authenticated and CSRF-protected server-side before they are exposed.
- Create authors only through private SSH provisioning. Never commit password hashes, passwords or login-throttling state; do not disable secure cookies in production.

## Delivery and testing

- Distinguish the approved functional specification from still-proposed implementation details.
- Do not claim that a component has been installed, built, deployed or tested unless it actually has been.
- Treat the shared-hosting Apache/PHP environment as a compatibility requirement.
- Keep `frontend/package-lock.json` and `backend/composer.lock` once generated from real dependency resolution.
- Use the issue tracker and reviewable PRs for nontrivial changes.
