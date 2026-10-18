# TestBraid — Data Model and API Design

**Status:** Technical proposal; three core design choices approved, remaining details subject to review  
**Date:** 2026-10-18  
**Target:** PoC-A foundation and PoC-B usable vertical slice  
**Companion documents:** [Functional specification](functional-specification.md), [PoC scope](poc-scope.md), [Technical research](technical-research.md)

## 1. Decisions and design boundaries

The following technical choices were agreed before this proposal:

- Vue 3, TypeScript, Vite, Bootstrap 5 CSS, Vue Router and Vue I18n.
- A small application-owned block editor; FilePond wrapped by `MediaUploader`.
- Slim 4, native PHP sessions and built-in secure password hashing.
- JSON files and media on the filesystem; no SQL database and no persistent Node.js server.
- JSON Schema **Draft 2020-12** for structural contracts, validated by **Ajv** in the client and **Opis JSON Schema** in PHP.
- Learners remain anonymous, and attempts/results are not persisted.

**Approved design choices:** (1) complete edits saved to already-published tests become visible immediately; (2) uploaded media remains private until publication, when referenced assets become publicly accessible as static files; (3) matching questions store independently identified left/right items with explicit ID-based associations. The exact JSON field names, endpoint paths, file-copy/cleanup mechanics and other design defaults remain proposals until reviewed.

Guiding principles:

1. Each persisted entity has a stable, opaque ID, not derived from its displayed title or file path.
2. Question-specific data is isolated by a `type` discriminator, while content blocks are shared.
3. Drafts can be saved incomplete; published tests must pass additional semantic checks.
4. The server is authoritative for identity, authorization, storage paths, timestamps and published status.
5. Learner-facing APIs expose no draft tests, private configuration, account information or filesystem paths.
6. Favor file-per-entity storage and simple scans for the initially small data volume, instead of inventing a database/index layer.
7. Keep published media served efficiently by Apache, including byte-range requests for video.

## 2. Identifiers and conventions

- Use **UUID v4** as the suggested ID format for tests, groups, questions, answer options, matching items, blocks and media. IDs are opaque; they are **not** authorization tokens.
- `schemaVersion: 1` refers to the persisted document format. Changes that break existing documents require an explicit migration.
- `language` is a BCP 47 language tag (e.g. `en`, `cs`, `pl`, `pt-BR`), not restricted to installed UI locales.
- Timestamps are server-managed RFC 3339 strings in UTC.
- Persist entities under their own IDs, not under author-provided filenames.
- Test, group and media documents each use their own schema; do not embed full uploaded files in JSON.
- The PoC contains one group per test, with no group nesting.

A few short symbolic IDs appear below to keep examples readable; production IDs should be proper UUIDs.

## 3. Test document

One private file per test: `storage/tests/<test-id>.json`.

```json
{
  "schemaVersion": 1,
  "id": "test-001",
  "groupId": "group-lesson-1",
  "language": "en",
  "title": "Recognizing objects",
  "description": "Identify the objects shown in the questions.",
  "status": "draft",
  "createdAt": "2026-10-18T19:00:00Z",
  "updatedAt": "2026-10-18T19:00:00Z",
  "publishedAt": null,
  "questions": [
    {
      "id": "question-1",
      "type": "choice",
      "mode": "single",
      "prompt": [
        {
          "id": "block-1",
          "type": "text",
          "text": "Which object is shown?"
        },
        {
          "id": "block-2",
          "type": "image",
          "mediaId": "media-photo-1"
        }
      ],
      "options": [
        {
          "id": "option-1",
          "content": [
            {
              "id": "block-3",
              "type": "text",
              "text": "Oak"
            }
          ]
        },
        {
          "id": "option-2",
          "content": [
            {
              "id": "block-4",
              "type": "text",
              "text": "Beech"
            }
          ]
        }
      ],
      "correctOptionIds": ["option-1"]
    },
    {
      "id": "question-2",
      "type": "matching",
      "prompt": [
        {
          "id": "block-5",
          "type": "text",
          "text": "Match each video to its description."
        }
      ],
      "leftItems": [
        {
          "id": "left-1",
          "content": [
            {
              "id": "block-6",
              "type": "video",
              "mediaId": "media-video-1"
            }
          ]
        },
        {
          "id": "left-2",
          "content": [
            {
              "id": "block-7",
              "type": "video",
              "mediaId": "media-video-2"
            }
          ]
        }
      ],
      "rightItems": [
        {
          "id": "right-1",
          "content": [
            {
              "id": "block-8",
              "type": "text",
              "text": "Description A"
            }
          ]
        },
        {
          "id": "right-2",
          "content": [
            {
              "id": "block-9",
              "type": "text",
              "text": "Description B"
            }
          ]
        }
      ],
      "matches": [
        { "leftId": "left-1", "rightId": "right-2" },
        { "leftId": "left-2", "rightId": "right-1" }
      ]
    }
  ]
}
```

### 3.1 Shared content blocks

Every prompt, choice and matching item contains an **ordered array of blocks**.

| `type` | Required data | Notes |
| --- | --- | --- |
| `text` | `id`, `type`, `text` | Plain text; render escaped, preserve newlines as appropriate |
| `image` | `id`, `type`, `mediaId` | May later add caption and alternative text |
| `video` | `id`, `type`, `mediaId` | Render with standard HTML video controls |

Block order is significant. The editor can add, delete and move blocks with ordinary buttons; no rich text or drag-and-drop library is needed.

Do **not** store public URLs as the canonical media reference. Use a stable `mediaId`; the API/view layer resolves a suitable preview or published URL.

### 3.2 Choice question

- Discriminator: `type: "choice"`; mode: `single` or `multiple`.
- `prompt`: content blocks.
- `options`: ordered items, each with an ID and content blocks.
- `correctOptionIds`: an array of IDs from `options`.

Publication checks:

- Nonempty prompt and at least two valid options.
- Exactly one correct option for `single`; at least one for `multiple`.
- No duplicate option IDs; correct IDs must exist, be distinct and match the mode.
- No missing referenced media.

**PoC evaluation:** exact set equality between selected and correct option IDs; one point or zero.

### 3.3 Matching question

- Discriminator: `type: "matching"`.
- `prompt`: content blocks.
- `leftItems` and `rightItems`: independently identified content items.
- `matches`: associations `{leftId, rightId}` holding the correct one-to-one mapping.

**Approved representation:** This model deliberately **does not assume parallel array indices are the answer**. The UI may shuffle the display order independently on each side. While the PoC enforces one-to-one correspondence, storing items separately from the `matches` relationship leaves room for later distractors or different matching rules.

Publication checks:

- Both sides contain the same positive number of meaningful items; the suggested PoC minimum is **two** pairs (confirm this if necessary).
- IDs are unique on their respective sides.
- Every left and every right item appears **exactly once** in `matches`.
- All referenced IDs and media exist.

**PoC evaluation:** all submitted associations must match the stored mapping; one point or zero.

**Future compatibility:** Unmatched distractors can be introduced by relaxing the completeness rule and defining how such items are evaluated, without replacing `leftItems` / `rightItems`.

### 3.4 Extensibility

Type-specific JSON Schemas are composed through a discriminated `oneOf` / `const` structure. Add a new type by introducing its schema and a corresponding editor, runner and evaluator implementation; no requirement for a runtime plugin loader.

Future multilingual variants should be associated with stable logical test/question identifiers, but no translation objects or variant linkage are required for the PoC.

## 4. Group document

One private file per group: `storage/groups/<group-id>.json`.

```json
{
  "schemaVersion": 1,
  "id": "group-lesson-1",
  "name": "Lesson 1",
  "createdAt": "2026-10-18T19:00:00Z",
  "updatedAt": "2026-10-18T19:00:00Z"
}
```

No `testIds` array is necessary: a test's `groupId` is the canonical association. Lists can be built by scanning test metadata. Rename a group without editing the tests in it.

For PoC 1, groups are a single level. Group deletion, reorder and nesting are deferred.

## 5. Media metadata and physical files

Each uploaded asset has a private metadata record: `storage/media/<media-id>.json`.

```json
{
  "schemaVersion": 1,
  "id": "media-video-1",
  "kind": "video",
  "mimeType": "video/mp4",
  "extension": "mp4",
  "sizeBytes": 12345678,
  "originalName": "example.mp4",
  "createdAt": "2026-10-18T19:00:00Z"
}
```

- Files live under `storage/media-files/<media-id>.<validated-extension>`, initially **outside the public document root**.
- `originalName` is informational only and never forms a filesystem path or response header without safe encoding.
- No user-supplied `src`, path or MIME type is trusted. The backend verifies and allowlists the actual file format.
- Media attachment is via `mediaId`, which can be reused in more than one task.
- Do not implement general media deletion in PoC 1; preserve unused uploads until a deliberate cleanup policy is designed.

### 5.1 Approved media visibility policy; proposed implementation

**Approved policy:** Draft attachments remain private; assets used by published tests are exposed as static files served efficiently by Apache, including video. The mechanics below (staging, file copying/linking, shared references and cleanup) remain implementation proposals to validate on the actual host.

1. All uploads start in private storage, accessible for preview only through an authenticated author endpoint.
2. When a test is published, the backend validates its media references and makes approved media available as files under `public/media/<media-id>.<extension>` (copying or safely linking as supported by the host).
3. The public test response provides a resolved public media URL for each required asset; Apache serves it directly, including ordinary byte-range support for video.
4. When a published test is edited, any newly referenced assets must be published **before** the updated test becomes visible.
5. Removing a media reference or unpublishing a test requires checking whether another published test still uses it before removing its public copy.

This makes publication more complex than a single JSON write, but avoids exposing drafts or forcing PHP to stream every published video. For the small PoC, a filesystem scan across published tests is adequate for checking media references. Static copies must not be removed while another published test still needs them. Orphan-cleanup and crash recovery need tests.

**Alternative for evaluation:** Serving all media through PHP would simplify visibility rules, but large videos and HTTP Range handling make that less attractive. The exact publication implementation should be validated on the selected hosting provider before coding it.

## 6. Draft and published lifecycle

Initial states for the PoC: `draft` and `published`.

- **Save draft:** Structural schema validity required, but a question can be incomplete (empty prompt, incomplete options, incomplete matches). Metadata and references must still have structurally valid types.
- **Publish:** Run structural and **publication-ready semantic checks**, verify group and media references, stage public media, then change status to `published` and set `publishedAt`.
- **Edit published test (approved behavior):** Saving a published test **updates its public content immediately**, but only if the resulting test remains publication-ready. Otherwise return a validation error and preserve the previously saved test.
- **Unpublish:** Proposed as a small API operation, but a dedicated UI is optional in PoC 1; it must stop public test access and handle public media references correctly.
- **Learner:** Only published tests are accessible. Publishing does **not** create learner accounts or store answers.

**Trade-off:** A future product may maintain separate editable drafts and published snapshots, with explicit re-publication. That would support incomplete in-progress changes to already published tests; it is intentionally excluded from the initial PoC design.

For self-assessment, the public test data may include the answer key (evaluation runs in the browser). Such a system is **not** intended to provide secure, exam-grade secrecy. If hiding correct answers before evaluation becomes a requirement, client-side scoring must be reconsidered.

## 7. API contract (proposed)

All endpoints are under the same origin as the frontend (no cross-origin API required). JSON requests and responses use UTF-8. Media uploads use `multipart/form-data`.

### 7.1 Authentication

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/auth/session` | Public | Return `authenticated` state; issue CSRF token/session when appropriate |
| `POST` | `/api/auth/login` | Public + CSRF | Authenticate with username/password; regenerate session ID |
| `POST` | `/api/auth/logout` | Author + CSRF | Invalidate session and cookie |

Example authenticated session response:

```json
{
  "authenticated": true,
  "user": { "id": "author-1", "username": "alice" },
  "csrfToken": "opaque-per-session-token"
}
```

Unauthenticated response: `{ "authenticated": false, "csrfToken": "..." }` without a user object. Never expose password hashes or account configuration.

The frontend sends a session cookie automatically and a token header such as `X-CSRF-Token` on all state-changing requests. Configure session cookies for `Secure`, `HttpOnly` and `SameSite`, validate Origin where applicable, throttle login failures, and never treat a Vue route guard as backend security. The `/api/auth/session` endpoint returns `Cache-Control: no-store`.

### 7.2 Admin — groups and tests

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/groups` | List groups |
| `POST` | `/api/admin/groups` | Create group |
| `PATCH` | `/api/admin/groups/{id}` | Rename group |
| `GET` | `/api/admin/tests?groupId=...` | List all tests, optionally filtered |
| `POST` | `/api/admin/tests` | Create new draft test |
| `GET` | `/api/admin/tests/{id}` | Retrieve complete editable test, including drafts |
| `PUT` | `/api/admin/tests/{id}` | Replace author-editable fields and questions |
| `POST` | `/api/admin/tests/{id}/publish` | Validate and publish |
| `POST` | `/api/admin/tests/{id}/unpublish` | Optional PoC control; withdraw publication |

All admin endpoints require a valid author session. State-changing operations additionally require CSRF protection.

The client supplies **editable content** only; server-owned IDs for new entities, status, timestamps and paths are assigned/managed on the server. The `PUT` request does not permit changing `id`, `schemaVersion`, `createdAt`, `updatedAt`, `publishedAt` or `status` directly.

Example editable portion in a `PUT` request:

```json
{
  "groupId": "group-lesson-1",
  "language": "en",
  "title": "Recognizing objects",
  "description": "Identify the objects.",
  "questions": []
}
```

`PUT` replaces all editable fields and the task list; it is not a partial merge. A draft with `questions: []` can be saved, but not published. Response returns the canonical updated test including server metadata.

### 7.3 Admin — media

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/admin/media` | Upload and validate a single file; return media ID/metadata |
| `GET` | `/api/admin/media/{id}` | Metadata and author preview URL |
| `GET` | `/api/admin/media/{id}/content` | Authenticated preview of private image/video |

The FilePond adapter posts to our API. Its response is normalized within the frontend `MediaUploader` component so the block editor only receives an application media ID and metadata.

### 7.4 Learner/public

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/public/tests/{id}` | Retrieve a published test and public media URLs |
| Static | `/media/{id}.{ext}` | Published images and videos served by Apache |

A URL such as `/tests/{id}` opens the Vue learner interface; Vue fetches `/api/public/tests/{id}` and renders the tasks.

A list of public groups/tests is **not essential to the agreed PoC**: a direct shareable URL is sufficient. We can add public discovery endpoints later.

### 7.5 Status codes and errors

| Status | Intended use |
| --- | --- |
| `200` | Successful read/update |
| `201` | Created entity or uploaded file |
| `400` | Invalid request shape or query |
| `401` | Missing/expired author session |
| `403` | Authenticated but unauthorized, or invalid CSRF token |
| `404` | Missing resource, including any non-published test requested publicly |
| `409` | Invalid state transition or resource conflict |
| `413` | Upload exceeds accepted size |
| `415` | Unsupported media type |
| `422` | Valid JSON but failed schema or semantic validation |
| `500` | Unexpected server-side failure; no private paths or stack traces in response |

Use a single error envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The test cannot be published.",
    "details": [
      {
        "path": "/questions/0/correctOptionIds",
        "code": "INVALID_CORRECT_OPTIONS",
        "message": "Exactly one correct option is required."
      }
    ]
  }
}
```

Error `code` values are stable and localizable in the frontend; English developer diagnostics may remain in `message`. Do not depend on matching error-message text.

**Caching:** public test JSON should use `Cache-Control: no-store` (or an explicitly validated revalidation strategy) during the PoC so edits are immediately visible. Authentication and admin responses should never be cached in shared caches. Published media URLs can be immutable with appropriate lifecycle handling.

## 8. Validation and schemas

Planned schema directory:

```text
schemas/
  test.schema.json
  group.schema.json
  media.schema.json
  definitions/
    content-block.schema.json
    choice-question.schema.json
    matching-question.schema.json
```

- Use `"$schema": "https://json-schema.org/draft/2020-12/schema"`.
- For Ajv, instantiate the **2020-12 validator** (`ajv/dist/2020`) rather than the default draft-07 class.
- For PHP, validate through **Opis JSON Schema**.
- Keep schemas portable: avoid library-specific nonstandard keywords.
- Reject unknown unsupported question/block types; require explicit `schemaVersion` handling instead of silently dropping fields.
- Use ordinary JSON Schema for shapes, types, required keys, value bounds and discriminated unions.
- Use **semantic validators** for relationships JSON Schema cannot conveniently express (ID uniqueness, correct-answer references, one-to-one matches, group existence, media existence and publication readiness).
- Enforce storage limits (JSON document size, question count and media sizes) server-side even if UI also warns.
- Generate TypeScript types from schema later if the chosen tooling is stable; avoid manually maintaining inconsistent models.
- Test both Ajv and Opis against the **same valid/invalid fixture corpus**; don't assume that identical schema files imply identical format-check behavior.

### 8.1 Two-stage validation

**Draft save:**
- JSON syntax and structural schema are correct.
- Editable payload uses supported types and IDs.
- The test need not be publishable.
- Server validates that the referenced group exists; media links must not escape storage rules.

**Publish or save while already published:**
- Draft rules plus completeness of prompts, options, mappings.
- No dangling group, answer IDs or missing/invalid media.
- All content required for learners can be rendered.
- Publish media first; make new/updated published test visible only when all dependencies are ready.

**Schema detail to settle during implementation:** Preserve one canonical persisted schema that allows incomplete drafts, with semantic publication checks. Do not design separate incompatible JSON formats for draft and published tests.

## 9. Suggested filesystem layout

```text
repository/
  frontend/                    # Vue, TypeScript, Vite
  backend/
    composer.json
    src/                       # Slim routes, services, validation
    vendor/                    # Created by Composer; deployment artifact
  schemas/                     # Shared JSON Schema contracts
  docs/
  deploy/                      # Deployment configuration/examples

webhost/                        # Outside repository
  private/
    accounts.json              # Password hashes; not committed
    storage/
      groups/<uuid>.json
      tests/<uuid>.json
      media/<uuid>.json
      media-files/<uuid>.<ext>
    sessions/                  # If custom PHP session save path is required
    logs/
  public_html/                 # Apache document root
    index.html                 # Built Vite frontend
    assets/
    api/index.php              # Slim entry point (and rewrite rules)
    media/<uuid>.<ext>         # Only published copies, never executable
    .htaccess                  # Rewrite / API and SPA routes
```

The exact physical layout depends on the hosting provider. Shared schemas and PHP dependencies can be deployed outside `public_html` where possible; never make passwords or private JSON reachable by URL. Protect the published media directory against PHP/script execution and path traversal, and verify rewrite behavior on the real host.

## 10. Persistence and publication consistency

- File-per-test and file-per-group reads/writes are enough at PoC scale.
- Validate, write a temporary file in the same directory, lock as needed, then atomically replace the entity file where supported.
- Simultaneous edits are not resolved at the UI level for the PoC, but filesystem writes still must avoid corruption.
- Preserve old entity data if validation/publish fails.
- The filesystem has **no multi-file transaction**: publishing media plus test JSON requires deliberate staging, failure cleanup and tests for partial failure.
- Never interpolate IDs or client filenames into filesystem paths without strict canonical validation and a server-generated path.
- Keep backups of private JSON, private media and public media lifecycle state. Restore tests should be part of operational documentation before real production use.

**Optional future enhancement:** Add an ETag/revision field for optimistic concurrency; explicitly postponed under the agreed requirement not to resolve editor conflicts yet.

## 11. Implementation sequence and tests

### PoC-A

1. Initialize Vue/Vite and Slim; make both work on the selected host.
2. Add shared schema loader/validation proof with a simple persisted example.
3. Implement session login/logout, CSRF checks and protected admin endpoint.
4. Test media upload, metadata, authenticated preview and published static media.
5. Test actual video upload/size limits, public byte-range playback and privacy.
6. Add deployment and environment documentation.

### PoC-B

1. Implement groups and test persistence/endpoints.
2. Implement common block editors/viewers and both question-specific editors.
3. Implement learner runner and exact-match evaluation.
4. Implement publish/unpublish readiness validation and share URLs.
5. Run the complete agreed [PoC acceptance scenario](poc-scope.md#4-illustrative-acceptance-scenario).

### Minimum automated test cases

- Schema fixtures: valid, invalid and incomplete draft; rejected unknown types.
- Draft saves; publish fails on incomplete/invalid choice/matching tasks.
- Choice exact-set scoring and matching bijection scoring.
- Cannot update another author's session; anonymous admin API rejected; CSRF rejected.
- Public draft requests return 404; private source-media paths are unreachable anonymously.
- Invalid MIME/content and dangerous extensions are rejected.
- Successful upload → preview → publish → public video playback; repeat after test edit.
- Failed publication does not expose an incomplete test or break an already published one.
- Existing public assets remain available if shared by another published test.
- English/Czech UI and a test whose language is neither English nor Czech.

## 12. Decisions and remaining points for review

**Approved in discussion:**

1. Saving a valid edit to an already-published test updates the published content immediately; incomplete/invalid changes must be rejected.
2. Uploaded media is private initially. Media referenced by published tests becomes accessible as static public files, while draft-only attachments remain inaccessible anonymously.
3. Matching questions represent the left and right collections separately and store correct relationships by stable item IDs. The PoC continues to enforce one-to-one matching.

**Implementation details still proposed (not yet individually approved):**

1. UUID v4 and file-per-entity JSON storage.
2. At least two pairs required to publish a matching question.
3. Exact strategy for staging/copying public media, handling shared references, cleanup and recovery after partial failures.
4. Direct public access via share URL initially, without a public directory of groups/tests.
5. `PUT` replaces all editable test fields, while status transitions use dedicated endpoints.
6. Test and media size/count limits based on measurements on the target host.
7. Exact API response shapes, error codes, route names and the selected PSR-7 implementation.

This distinction separates the approved product/architecture choices from the detailed contract that will be finalized before implementation.

## 13. References

- JSON Schema Draft 2020-12: https://json-schema.org/draft/2020-12/
- Ajv 2020-12 support: https://ajv.js.org/json-schema.html#draft-2020-12-breaking
- Opis JSON Schema: https://github.com/opis/json-schema
- Slim 4 PSR-7 response model: https://www.slimframework.com/docs/v4/objects/response.html
- PHP file upload security reference: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- CSRF reference: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
