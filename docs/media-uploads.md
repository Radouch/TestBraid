# Media upload and private author preview (PoC-A 06)

**Status:** Implemented in merged PR #13 and owner-verified on the live host (2026-10-19); all five agreed acceptance checks passed. Static publication was implemented in merged PR #14; the browser test-question editor is not yet implemented.

## API contract

All routes are under the authenticated `/api/admin` group and require an active author session. Mutating requests also require a valid `X-CSRF-Token`, obtained from `GET /api/auth/session`.

| Method | Route | Result |
| --- | --- | --- |
| POST | `/api/admin/media` | One multipart form field named `file`; returns HTTP 201 with `mediaId`, `kind`, `mimeType`, `sizeBytes`, `originalName` |
| GET | `/api/admin/media/{id}` | Validated private media metadata JSON |
| GET, HEAD | `/api/admin/media/{id}/preview` | Authenticated image/video stream; supports single HTTP byte ranges, `206` / `416` |

The FilePond Vue wrapper emits a typed `UploadedMedia` object. The application stores and references **media IDs**, never user-supplied file paths or URLs. No general media deletion or public access is implemented in this increment. Files remain in private `storage/media-files/<uuid>.<canonical-extension>` and records in `storage/media/<uuid>.json`.

## Allowed content and limits

| Kind | MIME detected from file | Accepted input extensions | Canonical stored extension | Application maximum |
| --- | --- | --- | --- | --- |
| Image | `image/jpeg` | `.jpg`, `.jpeg` | `.jpg` | 10 MiB |
| Image | `image/png` | `.png` | `.png` | 10 MiB |
| Image | `image/webp` | `.webp` | `.webp` | 10 MiB |
| Video | `video/mp4` | `.mp4` | `.mp4` | 64 MiB |
| Video | `video/webm` | `.webm` | `.webm` | 64 MiB |

Files are checked on the server using PHP fileinfo rather than trusting the browser's `Content-Type` header. Images additionally require a recognizable image header, valid dimensions and at most 24 megapixels; videos require known MP4/WebM container signatures. **This is not antivirus scanning, full media decoding, transcoding or a guarantee of browser codec compatibility.** For reliable video playback, use broadly supported MP4 H.264/AAC or WebM VP8/VP9/Opus; individual browser support still varies. SVG, animated GIF, documents and any executable file formats are deliberately excluded.

The upload is copied in bounded chunks into a randomly named private temporary file, validated, and atomically renamed under a generated UUID before the metadata record is committed. A failed metadata write removes the new binary file, and unsuccessful validations remove staging files. Orphan recovery after process termination has not yet been automated; delete is deliberately postponed until media-reference tracking has been designed.

### Actual hosting limits

The **application limits are not guaranteed by the hosting account**. PHP and the web server can reject smaller files before TestBraid sees a request. Verify these settings using your hosting PHP configuration, not SSH `php -i` alone if PHP-FPM and CLI differ:

- `file_uploads = On` and PHP `fileinfo` extension enabled.
- `upload_max_filesize >= 64M` and `post_max_size > 64M` (for multipart overhead, prefer `post_max_size = 70M` or higher).
- Sufficient `upload_tmp_dir` space, private `storage/` space, and appropriate `max_input_time` / `max_execution_time` for upload speed.
- Apache/reverse proxy request-body size limits must be compatible; otherwise requests may fail with `413` or `500` before reaching Slim.
- Private `storage/media-files/` and `storage/media/` must be writable by the PHP process. **Never** move them into `www/` or loosen permissions to `777`.

If the host's hard upload cap is below 64 MiB, reduce TestBraid's accepted video size to match it in **both** the backend limit and the FilePond client. The current implementation does not do resumable/chunked uploads. A future larger-video increment should consider configurable validated limits and chunk handling, without depending on Node or a database.

## Isolation and stream behavior

Draft files are not reachable under public `/media/`; the only preview route is inside the existing author+CSRF middleware group. Normal GET/HEAD previews require author authentication, return an explicit allowlisted MIME type and `X-Content-Type-Options: nosniff`, and disable caching. A private bounded PSR-7 stream serves only the specified HTTP byte range and supports browser video seeking. The displayed original filename is **never** used as a storage path or unescaped response header.

The public `www/api/index.php` bootstrap determines the physically served web root, independent of unusually broad shared-hosting `DOCUMENT_ROOT` metadata. The private backend `.htaccess` denies direct Apache access if directory mapping is unexpectedly broad. This design does not include absolute paths or domain names in the code.

## Verification

**Live owner acceptance (2026-10-19):** The owner confirmed image/video uploading, video playback and seeking, denial of access to private media while logged out, rejection of disallowed files, persistent binary/metadata files and a practical upload-size test. The follow-up authenticated web-PHP diagnostics returned `upload_max_filesize=256M`, `post_max_size=256M`, `file_uploads=true`, `fileinfo=true`, web PHP 8.5.2 (`fpm-fcgi`), with 100-second input and 120-second execution timeouts. Hosting storage is described by the owner as unlimited/unmetered; provider resource policies may still apply. **Application-side limits remain 10 MiB/image and 64 MiB/video.** Neither a successful 64 MiB upload nor an actual 256 MB transfer has been individually verified; PHP multipart overhead may also prevent requests near the `post_max_size` boundary.

Automated CI invokes `composer run test:media-http`, which uses disposable local credentials, private storage and small image, MP4 and WebM fixtures. It verifies authentication, CSRF, MIME and extension rejection, private metadata and binary files, full previews, single-byte-range replies, invalid ranges and denial after logout. It does **not** contact the deployed host.

For repeatable acceptance on new deployments or hosting providers, after backing up `config/` and `storage/` and deploying code and rebuilt `www/`:

1. Confirm private backend files remain inaccessible over anonymous HTTP.
2. Sign in to `/admin`; upload a small PNG/JPEG or WebP, check the displayed preview and its `mediaId`.
3. Upload a **real browser-playable MP4** and confirm playback, seeking and refresh behavior. Also try a WebM where supported.
4. Check that an SVG, `.php` file, renamed text file and oversize upload are rejected; anonymous POST/GET preview must return HTTP 401.
5. Confirm media metadata appears in private `storage/media/` and the binary in `storage/media-files/`; neither should appear in `www/media/`.

The upload panel shows media from the current page session; it is **not yet a persistent media library UI**. Keep test upload files until cleanup/reference management is available or delete them manually only after verifying they are unreferenced.

## Follow-up

PoC-A 07 (publication) will need to securely expose only media referenced by published tests as static Apache files with byte ranges, keep shared references alive when tests are edited, and avoid exposing draft-only media. The authenticated previews here are not a substitute for that publication flow.

## Media library operations and operator-managed limits (Issue #17)

The operator configures the private runtime file
`testbraid-backend/config/app.json`, based on the committed source default
`backend/config/app.json`:

```json
{
  "site": {
    "name": { "cs": "TestBraid", "en": "TestBraid" },
    "description": {
      "cs": "Aplikace pro tvorbu a vyplňování multimediálních testů se samostatným vyhodnocením odpovědí.",
      "en": "An application for creating and taking multimedia self-assessment tests with immediate feedback."
    }
  },
  "uploads": {
    "maxImageSizeMiB": 10,
    "maxVideoSizeMiB": 64
  }
}
```

`site.name` (shown in header and browser title) and
`site.description` (shown only as the home-page lead) may each be
a language-neutral string or a locale map. The active interface language
selects the translation; missing entries fall back to English, Czech, then
the first available entry. Only `site` is exposed through public
`GET /api/public/config`; upload settings are not returned there.

Upload limits are private, positive integer MiB values (1–2048). The
backend reads them on requests; PHP upload_max_filesize and post_max_size
apply, with a 1 MiB multipart margin. The author-only
`GET /api/admin/media/limits` reports configured/effective limits and
warnings. Invalid config fails closed, instead of falling back to
unrestricted uploads.

For a **new installation only**, use
`node scripts/prepare-deployment.mjs --initial-install` to stage
`testbraid-backend/config/app.json` already in place. For every
**upgrade**, use `node scripts/prepare-deployment.mjs` without the flag,
so that no `config/` directory is staged. Never overwrite existing
host-side settings. Existing installations with only
`config/uploads.json` continue to use that file until app.json is
created. Copy the current upload limits into the new file during migration.
Old app.json files with string site fields remain compatible.

- GET /api/admin/media/limits: authenticated effective policy and warnings.
- DELETE /api/admin/media/{id}: authenticated + CSRF; unreferenced media only.

The media library shows Delete only for entries where usedIn is empty.
The backend scans *all* draft and published tests again under the existing
publication lock and returns 409 MEDIA_IN_USE if any still reference the file.
It reconciles orphan public copies first and then removes private metadata
and the original binary, using a temporary rename for rollback on metadata
failure. An interrupted delete may still leave an orphan .deleting file;
automatic abandoned-file cleanup is not part of this increment. No
background garbage collector or standalone unused-media list is added.

## Virtual lesson folders (media home lesson)

Media files remain in the same private physical storage. An optional nullable
`groupId` in each media metadata JSON assigns one home lesson; old records
without this field are treated as unassigned. Tests continue to reference only
`mediaId`, so an asset may be used across lessons without copying it.

Author-only endpoints:

- `GET /api/admin/media` returns `groupId` (or `null`) per entry.
- `POST /api/admin/media` optionally accepts multipart text field `groupId`.
- `PATCH /api/admin/media/{id}` accepts JSON `{"groupId": "<lesson-uuid>"}`
  or `{"groupId": null}` to move an asset to unassigned.

The multipart contract is one **binary** `file` part and optional text `groupId`.
FilePond's default transport also produces a text `file` part containing its JSON
metadata. `MediaUploader.ondata` removes that widget metadata by rebuilding the
request from binary file parts and the application's lesson assignment. Without
this adapter, PHP exposes the extra part in parsed-body fields and the strict
allowlist returns `Unsupported upload fields.` The same adapter serves the
question editor and standalone library; the backend field allowlist is unchanged.

`npm run test:upload` runs the installed FilePond multipart serializer with the
actual mounted uploader configuration, captures its request at the XHR boundary
and round-trips the multipart bytes. It covers the default metadata part, binary
contents, filename/MIME, optional lesson assignment, credentials/CSRF and a new
JPG attachment after existing answer text. The third-party layout widget and
network are isolated, while transport serialization and response callbacks are
real. `composer run test:media-http` separately checks strict field rejection,
JPEG upload/private preview and mixed text/JPG draft persistence against PHP.

The multipart adapter fix requires only rebuilt frontend files to be deployed;
it does not change PHP routes, schemas or existing media.

The server checks group IDs against existing lessons under the same lock used
by lesson deletion and test writes. Removing an empty lesson detaches any
associated media; it never deletes media files or modifies test references.
This metadata has no influence on whether an asset is exposed publicly:
publication still depends exclusively on references from published tests.
