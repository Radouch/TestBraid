# Troubleshooting

These checks apply to the **prebuilt Apache/PHP** deployment. Before editing files, take a backup of any persistent data; do not delete `config/`, `storage/` or uploaded `media/` to troubleshoot a failure.

## 1. First checks

1. Verify that **both** archive directories were uploaded to their correct destinations. The private backend must contain `vendor/autoload.php` and `templates/index.html`.
2. Verify that hidden `.htaccess` files were uploaded.
3. Check the configured `basePath` URL in private `config/app.json` and `backendPath` in optional `www/bootstrap.local.php`. One is a URL path; the other is a filesystem path.
4. Request `<app-url>/api/health`. A healthy API returns JSON with `status: ok` and `service: testbraid-api`.
5. Review the web server's **PHP error log** if available; web PHP version/configuration can differ from the SSH command-line PHP environment.

## 2. Symptom guide

| Symptom | What to inspect |
| --- | --- |
| Home page or API reports **503** | Missing or wrong private backend directory, missing `vendor/autoload.php`/template, invalid `app.json` or base-path mismatch. Use the allowlisted error code on the response. |
| API returns **HTML** instead of JSON | Apache `.htaccess` rewrite is routing `/api/*` to the SPA instead of `api/index.php`; check parent rewrite rules too. |
| Direct reload on a nested page yields **404** | Missing/ignored rewrite rules, wrong public folder or incorrect `basePath`. |
| Built JS/CSS returns **404** or old interface remains after upgrading | Public `assets/` and private `templates/index.html` are not from the same build. Confirm both were replaced. |
| `/locales/<code>.json` returns 404 | Missing language dictionary or unexpected URL base; copy the JSON file and enable the code in `app.json`. |
| Author sign-in/setup fails | HTTPS, PHP session storage/cookies, password, write access to private config, a valid first-time `setup.key`, or rate limiting. |
| Lessons/test saves fail with **500** | PHP cannot create/write private `storage/` or its temporary/lock files; inspect author-only storage diagnostics. |
| Image/video upload rejected | Supported format, file contents, effective application limit and PHP `upload_max_filesize`/`post_max_size`/timeouts. |
| Published video unavailable | Missing public `media/.htaccess`, permissions, Apache static-file rules, inconsistent public copies or unsupported browser video codec. |
| A URL under the private backend serves a real file | **Stop using the installation** until document-root mapping and access rules are corrected. Never test exposure using a real secret. |

The public PHP `index.php` and `api/index.php` deliberately return short diagnostic **codes** (not server paths) for some failures. Examples include `BACKEND_PATH_NOT_FOUND`, `BACKEND_DEPENDENCIES_MISSING`, `APP_CONFIG_INVALID`, `APP_BASE_PATH_INVALID` and `APP_BASE_PATH_MISMATCH`. Match the code to the files and settings rather than exposing private exception traces publicly.

## 3. Installing in a subdirectory

A browser URL such as `https://example.org/courses/tests/` must correspond to the actual served directory **and** `"basePath": "/courses/tests"`. The public `bootstrap.local.php`, if used, must point to the private backend from **that served folder**. A parent application's unconditional Apache rewrite can intercept requests before the nested application sees them; adjust the parent routing to allow the TestBraid subpath.

If `/api/health` works at the wrong URL but not at the intended subpath, revisit the base-path and Apache placement before making frontend changes. Prebuilt archives work without site-specific JavaScript builds.

## 4. Access and storage diagnostics

A signed-in author can use the application's installation security UI, and developers/operators can inspect the protected endpoints such as `/api/admin/storage-diagnostics` and `/api/admin/environment-diagnostics`. These return selected diagnostic fields, not unrestricted filesystem paths.

The storage diagnostic can distinguish a failed directory write from a listing problem. The security diagnostic's HTTP probe should use **only** the harmless included `security-probe.txt`. A blocked probe at one URL is a useful observation, not a complete audit of all possible entry points.

## 5. After a failed upgrade

Confirm you used the **upgrade** archive, not the initial-install archive. Check that:

- Local `config/` and `storage/` remain intact.
- Local `bootstrap.local.php` has not been overwritten.
- `vendor/` was **replaced**, not merged with stale dependencies.
- Both public `assets/` and private `templates/index.html` were updated.
- Public uploaded `media/` has not been deleted.

Return to a known-good backup and matching application version if necessary. An older version is not guaranteed to read data from a later incompatible version. See [Upgrading](upgrading.md).

## 6. Before reporting a bug

Include the TestBraid version, browser, host OS/Apache/PHP information if known, reproduction steps, the relevant HTTP status/error code and whether the problem affects anonymous users or authors. Describe whether the application is at `/` or a URL subdirectory.

**Do not paste** passwords, `setup.key`, session cookies, CSRF tokens, `authors.json`, private test data or server-private filesystem paths into a public issue.
