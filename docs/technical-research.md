# TestBraid — Preliminary Technical Research

**Status:** Working notes; frontend styling choice agreed, other library decisions pending  
**Date:** 2026-10-18  
**Scope:** Reusable components and libraries for the intended Vue 3 + PHP + JSON/filesystem architecture.

The goal is to **avoid reimplementing established components** while keeping deployment possible on ordinary Apache/PHP shared hosting, without a database, persistent Node.js process or desktop editor.

## 1. Constraints and decision criteria

- Vue 3, TypeScript and Vite are preferred for the client.
- PHP handles authorization, JSON persistence and media uploads.
- Learners do not sign in and their results are not stored.
- Authors are few; no public registration or complex role management.
- Both administration and learner-facing UI must support English, Czech and further languages.
- All dependencies must be checked for license, maintenance, accessibility and deployment overhead.
- A library that demands its own server, hosted account or SQL database is not automatically suitable just because it supports the desired interface.

## 2. Frontend fundamentals

| Area | Candidate | Preliminary judgment |
| --- | --- | --- |
| Framework/build | Vue 3 + TypeScript + Vite | Recommended; build-time Node.js only |
| Client routes | Vue Router 4 | Recommended; check Apache SPA fallback behavior |
| Translations | Vue I18n | Recommended, including admin, errors and feedback messages |
| Styling and layout | Bootstrap 5 CSS | **Agreed** for PoC; interactive behavior remains controlled by Vue |
| Vue component suites | PrimeVue / BootstrapVueNext | Not planned for PoC; re-evaluate only if a specific need arises |
| Runtime JSON validation | Ajv | Candidate; useful for validating data in the browser and tests |

Sources:
- Vue TypeScript: https://vuejs.org/guide/typescript/overview
- Vue Router: https://router.vuejs.org/guide/
- Vue I18n: https://vue-i18n.intlify.dev/guide/introduction
- Bootstrap: https://getbootstrap.com/docs/5.3/getting-started/introduction/
- Bootstrap Vue guidance: https://getbootstrap.com/docs/5.3/getting-started/javascript/#using-bootstrap-with-javascript-frameworks
- PrimeVue (considered, not selected): https://github.com/primefaces/primevue
- Ajv: https://github.com/ajv-validator/ajv

**Agreed decision:** Use **Vue 3 + Bootstrap 5 CSS** for the PoC. Use standard HTML controls and Vue components for interaction. Avoid Bootstrap's JavaScript plugins manipulating Vue-managed DOM. Do not adopt a general-purpose Vue component suite for now; add focused dependencies only when justified. Vue Router and Vue I18n remain recommended.

## 3. Upload widgets

### Uppy

- Official Vue integration and ready-made Dashboard / smaller headless components.
- The XHR Upload plugin sends ordinary HTTP requests and can target a PHP endpoint without requiring a permanent Node.js service.
- MIT licensed.
- More features than we need initially; could be attractive if handling larger video uploads becomes important.

Sources:
- https://uppy.io/docs/vue/
- https://uppy.io/docs/xhr-upload/
- https://github.com/transloadit/uppy/blob/main/LICENSE

### FilePond

- Mature drag-and-drop uploader with a Vue adapter and PHP backend integration examples.
- Image previews, type/size controls and locale packs.
- MIT licensed. FilePond v5 is still indicated as alpha in its repository; evaluate a stable release, not an alpha, for the PoC.

Sources:
- https://github.com/pqina/filepond
- https://github.com/pqina/filepond/blob/master/LICENSE

**Preliminary recommendation:** With Bootstrap CSS selected (rather than PrimeVue), compare **FilePond** and **Uppy** as standalone upload widgets. A simple native file input remains a fallback if it meets the PoC needs. No upload library has been chosen. Whichever UI approach we select, backend validation, authorization and secure storage remain our responsibility.

For big video files we must test hosting limits. A client library cannot bypass PHP `upload_max_filesize`, `post_max_size`, timeouts or server-side restrictions merely by displaying a progress bar. Chunked/resumable upload would require explicit backend support.

## 4. Authentication and security

**Recommendation:** Native PHP sessions and password hashing for the initial small author population, rather than introducing an identity platform.

That means using PHP's established APIs, **not** inventing our own cryptography or session IDs. The application still needs its own small login/controller integration and authorization middleware/helper.

Requirements to implement and test:

1. Account/password hashes in a non-public configuration file.
2. Server-side session validation for every administration write endpoint.
3. HTTPS, session ID regeneration on login, secure and HttpOnly cookies, explicit SameSite setting, logout and expiration.
4. A CSRF token mechanism for session-authenticated state-changing calls; SameSite alone does not replace this.
5. Throttling/lockout strategy appropriate to a file-based store.
6. PHP upload validation and permissions, randomized safe filenames, strict allowed formats and size limits.
7. Avoid serving executable uploads; separate private storage from explicitly published, verified media.

Do not choose an external CSRF package without checking license: for example, the available ParagonIE Anti-CSRF repository is AGPL-3.0, potentially a poor fit if repository licensing has not been decided.

Sources:
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- https://www.php.net/manual/en/features.file-upload.php
- https://github.com/paragonie/anti-csrf

**Important design note:** Media ultimately presented publicly should preferably be delivered by Apache as approved static files when possible, rather than making PHP stream every video. Ensure that the media directory cannot execute PHP or other scripts, and do not trust the original file extension or client MIME header.

## 5. PHP API framework / routing

Options:

- **Small native PHP API with a single entry point:** minimal deployment dependencies and suitable for a small endpoint set; we must write disciplined request/error handling.
- **FastRoute:** small router if manual request dispatch becomes unwieldy.
- **Slim 4:** mature PHP microframework, useful if API middleware and routes become larger; brings more dependencies and a PSR-7 stack.

Sources:
- https://github.com/nikic/FastRoute
- https://github.com/slimphp/Slim

**Preliminary recommendation:** Keep the first PoC's PHP layer small; evaluate FastRoute if a router is needed. Do not adopt Slim just to expose a handful of endpoints. Composer packages can be installed during development and deployed as vendor files; Composer itself need not run on the production host, subject to hosting constraints.

## 6. Question content editing

### Structured content blocks (recommended starting point)

Our core requirement is **combinations of text, image and video** within prompts and answers. This does not automatically require unrestricted HTML or a generic rich-text editor.

A block-based model (text/media blocks, with stable IDs and media references) could be easy to validate, render consistently and extend for future question banks and translation variants. The application would need a small custom block editor, not custom media uploading or text input primitives.

### Tiptap (alternative for formatted rich text)

- Headless, extensible editor framework with Vue 3 integration.
- Open-source core is MIT licensed; optional advanced extensions/services can be commercial.
- Useful if authors need rich formatting such as links, lists, headings, emphasis or embedded content in a single text field.
- Adds editor complexity, a separate document schema and HTML/JSON rendering/sanitization considerations.

Sources:
- https://tiptap.dev/docs/editor/getting-started/install/vue3
- https://github.com/ueberdosis/tiptap
- https://tiptap.dev/docs/editor/getting-started/overview

**Preliminary recommendation:** Start with the structured blocks already described in the functional specification. Revisit Tiptap if actual author needs justify formatting beyond straightforward text/media composition.

## 7. Matching-task interaction

There are many drag-and-drop packages, but no need to choose one yet.

A click-to-select or two-column matching interface may be more accessible and easier to use on touch devices than relying solely on dragging. The solution should allow keyboard interaction. Avoid making drag-and-drop a mandatory prerequisite for the proof of concept.

## 8. Data validation and persistence

- Define a versioned JSON schema for test files once the data model is agreed.
- Ajv can validate draft test data in the browser, but **PHP must independently validate incoming data on the server**; frontend validation is not a security boundary.
- Save JSON atomically where feasible and back up files and referenced media together.
- Use stable identifiers independent of filenames and user-facing labels.
- Do not build full reusable question banks or a generalized plugin platform in the first iteration.

Source: https://github.com/ajv-validator/ajv

## 9. Hosting checks before implementation decisions

Verify with the target hosting provider:

- PHP version, enabled extensions and ability to configure PHP settings.
- Writable non-public storage location and what the Apache document root actually is.
- Upload size/time limits and available disk space.
- Rewrite support for SPA routes, or a simpler hash-based route fallback.
- Ability to protect the media directory against script execution.
- HTTPS and basic file-based PHP session behavior.

## 10. Provisional stack and unresolved decisions

**Reasonable baseline to test:**

- Vue 3, TypeScript, Vite, Vue Router, Vue I18n.
- PHP with native sessions, secure password hashes, and a small API.
- JSON files for tests; ordinary files for uploaded media.
- **Bootstrap 5 CSS** for styling/layout, with Vue controlling interactivity.
- An upload widget to be selected separately (FilePond or Uppy are candidates).
- Structured text/image/video blocks; matching interaction designed after a mockup.

**Decisions intentionally deferred:**

1. Upload widget; Bootstrap 5 CSS is already selected (no general Vue component suite planned).
2. Whether the editor needs rich text beyond simple blocks.
3. Whether the first API justifies a routing framework.
4. Detailed scoring rules and matching UX.
5. Exact video size limits and whether resumable upload is needed.
6. Repository license and dependency license policy.
7. Detailed PoC implementation plan; scope and acceptance criteria are in [PoC 1 scope](poc-scope.md).

These notes are **not** a declaration that any listed library is already selected, installed or tested against the real hosting provider.