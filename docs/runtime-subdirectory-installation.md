# Runtime subdirectory deployment (Apache)

TestBraid supports deployment at `https://example.org/`, `https://example.org/testbraid/`, or `https://example.org/courses/testbraid/` using the **same frontend build**. No per-installation Node.js build is required.

## What the two deployment-package folders mean

- `www/`: the **public app** files. Upload its **contents** into whatever directory maps to the chosen URL. Its name on the server may be `www`, `html`, `public_html` or a nested folder; it does not have to be `www`.
- `testbraid-backend/`: the private PHP/backend files, config, schemas and compiled HTML template. Place it **outside the whole host document root**.

Example safe layout for `https://example.org/courses/testbraid/`:

```text
/home/account/
├── public_html/                      # Apache DOCUMENT_ROOT for example.org
│   └── courses/
│       └── testbraid/                # Application public directory
│           ├── .htaccess
│           ├── index.php             # Injects URL base into HTML
│           ├── api/index.php         # Private backend API bootstrap
│           ├── assets/
│           ├── locales/
│           └── media/.htaccess
└── testbraid-backend/                # Must be outside public_html/
    ├── config/app.json
    ├── src/
    ├── templates/index.html
    ├── public/index.php
    └── vendor/                       # Installed by Composer or included in release
```

An unsafe layout would be `/home/account/public_html/testbraid-backend/`, **even when the app is deployed in `/public_html/courses/testbraid/`**. Apache may expose that backend under its own URL.

## Set the URL base

Edit **private** `testbraid-backend/config/app.json`:

```json
{
  "site": { "name": { "en": "TestBraid", "cs": "TestBraid" }, "description": "" },
  "uploads": { "maxImageSizeMiB": 10, "maxVideoSizeMiB": 64 },
  "uiLanguages": ["en", "cs"],
  "basePath": "/courses/testbraid"
}
```

Use `"/"` for a domain-root installation. The property is optional for older configurations (implicit root). Do not set a full URL or query string. The preexisting `TESTBRAID_BASE_PATH` environment override still works for configurations without `basePath`; if both are explicit, they must match.

## Point the public entry points at the private backend

By default both public bootstrap files resolve `../testbraid-backend/public/index.php` relative to the application directory. This only suits a domain-root layout with a sibling private folder. For a subdirectory install, set `TESTBRAID_BACKEND_ENTRY` in the PHP/webserver environment to the **absolute private** backend entry path, e.g. `/home/account/testbraid-backend/public/index.php`. Both `index.php` and `api/index.php` read it.

Check that your hosting allows setting that environment variable **for web requests** (PHP-FPM may not inherit shell variables). If it does not, the default layout must be adjusted by the operator or host; do not relocate private storage into `public_html/` as a workaround.

## Apache routing

Deploy `deployment-package/www/.htaccess` with hidden files intact in the public app directory and ensure `mod_rewrite` and `.htaccess` rules are honored. Unknown client routes go to the PHP HTML shell. API requests go to Slim; missing `media/` or `assets/` files are real HTTP 404s rather than Vue HTML. The static `index.html` **must not be placed in the public app directory**; it is the private template in `testbraid-backend/templates/`. On an upgrade, remove an obsolete public `index.html` **specifically** (do not delete any private config/storage or uploaded media). The rewrite rules also route any leftover `/index.html` URL through the dynamic `index.php`.

## Checks before accepting deployment

1. Confirm the app homepage, admin login, media library, and a published test open on the configured URL.
2. Refresh a **direct deep link** such as `/courses/testbraid/admin/media?lang=cs`: JavaScript/CSS/favicon/locale requests must resolve within `/courses/testbraid/`.
3. Verify authenticated API calls, login/logout, a media upload and a draft preview.
4. Confirm published MP4 playback including seeking/HTTP Range and verify an invalid media URL returns 404.
5. Confirm an unknown URL gets the application's localized 404 page, not a blank view.
6. Confirm the backend and private draft data are **not reachable** via HTTP; verify server mappings without requesting live credential files.
7. Before upgrades back up private `config/`, `storage/` and published media. Preserve them during upload; do not use a destructive mirror.

This feature does **not** promise support for PHP hosts that provide only a publicly served filesystem and no private directory. That requires a separate, security-reviewed hosting mode.

## Two installations on the same domain (example: /tichotesty)

When another TestBraid already lives at the domain root, do not overwrite its existing `www/index.html`, root `www/.htaccess`, `www/api/`, or existing private `testbraid-backend/`. Use a **new** public subdirectory `www/tichotesty/` and a distinct private sibling of `www/`, for example `tichotesty-backend/`. Copy the archive's public `www/` **contents** into `www/tichotesty/`, and its private backend **contents** into `tichotesty-backend/`. Configure `basePath: "/tichotesty"` in the new backend config only.

The application-relative default private path used by the new public bootstraps does **not** point to a sibling of the host document root in this nested layout. Configure `TESTBRAID_BACKEND_ENTRY` for both PHP entry points or, if the hosting provider cannot make this environment variable visible to PHP-FPM, adjust only the deployed public bootstrap fallbacks:

- In `www/tichotesty/index.php` use `dirname(__DIR__, 2) . '/tichotesty-backend/public/index.php'` as the fallback `$backendEntry`.
- In `www/tichotesty/api/index.php` use `dirname(__DIR__, 3) . '/tichotesty-backend/public/index.php'` as the fallback `$privateEntry`.

These relative directory depths apply to the shown layout (`www/tichotesty` inside the domain's document root); inspect the actual paths before editing. They don't require a frontend rebuild. Keep both pointers identical in their resolved destination.

**Parent Apache rewrite:** The current *root application* `www/.htaccess` rewrites unknown paths to the root `index.html` using `[END]`. That can capture `/tichotesty/admin` before the nested application's rules run. Add an exception to the root app's *last SPA fallback* so it does not rewrite URLs whose path starts with `/tichotesty`; for example, alongside existing `!-f` and `!-d` conditions:

```apache
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_URI} !^/tichotesty(/|$)
RewriteRule ^ index.html [END]
```

Do **not** use a parent `[END]` rule as an exclusion for `tichotesty`, because it can prevent rewrite processing in the child directory. Existing root app behavior should remain unchanged. Check direct reload of `/tichotesty/admin`.
