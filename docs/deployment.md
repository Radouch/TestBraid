# TestBraid — Deployment on Apache/PHP Shared Hosting

**Status:** Working guide for the PoC-A foundation; runtime deployment not yet verified  
**Example target:** `https://testbraid.mariebila.cz/` (PHP 8.5, Apache document root `www/`)  
**Portability:** The hostname is an example only. The app is not bound to a specific domain; see subdirectory and alternate-layout notes below.

## 1. What this build demonstrates

The current branch includes only a Vue UI (English and Czech), placeholder admin/test routes, and one Slim API endpoint: `GET /api/health`.

**Not implemented:** author login, editing tests, JSON persistence, FilePond uploads and learner evaluation. Successful deployment does not mean PoC-A is finished.

### Verified hosting facts supplied by the owner

- The domain's document root is a directory named `www`.
- A sibling directory next to `www` is available for non-public backend files.
- The hosting environment offers PHP **8.5**, SSH and Composer.
- The first test domain is `testbraid.mariebila.cz`.

These are **reported environment facts**. We have not yet verified the webserver PHP handler, `.htaccess` directives, Composer dependency installation, web response, permissions or upload limits.

## 2. Target directory layout

```text
<domain-directory>/
├── www/                             # Public: served by Apache
│   ├── index.html                   # From frontend/dist
│   ├── assets/                      # From frontend/dist
│   ├── api/
│   │   └── index.php               # From deploy/www/api/index.php
│   ├── media/
│   │   └── .htaccess               # For future published media
│   └── .htaccess                   # From deploy/www/.htaccess
└── testbraid-backend/              # Private: NOT served by Apache
    ├── composer.json
    ├── composer.lock               # Created on first install, commit afterwards
    ├── public/
    │   └── index.php               # Actual Slim application
    └── vendor/                      # Installed by Composer on the host
```

The `www/api/index.php` file is only a public bootstrap. Its default path points to the **sibling** directory `testbraid-backend`; the actual PHP app loads its own `vendor/autoload.php` by a relative path. Credentials, JSON data and original media will also be stored privately once implemented.

## 3. Prepare frontend locally

Only Node.js/npm are needed on your computer. No local Composer installation is required.

```sh
git clone -b feature/poc-a-foundation https://github.com/Radouch/TestBraid.git
cd TestBraid/frontend
npm install
npm run build
```

The output is `frontend/dist/`. Build and test the default root installation first.

For a **subdirectory** deployment, build with a matching Vite base path (including both slashes):

```sh
npm run build -- --base=/testbraid/
```

Vue Router and the health-check URL use Vite's `BASE_URL`. The default root build uses `/`. For a subdirectory deployment, adjust the public PHP bootstrap's relative private path to the actual layout and place the Apache rewrite file inside the application directory.

Do not upload `frontend/node_modules/` or frontend source files to the public web root.

## 4. Upload files to the host

Use SFTP or `rsync`; substitute your real SSH account/paths. **Do not create or guess an absolute server path based on the hostname.**

- Copy **the contents** of `frontend/dist/` into `<domain-directory>/www/`.
- Copy **the contents** of `deploy/www/` into the same `www/` directory, including hidden `.htaccess` files.
- Copy `backend/composer.json` and `backend/public/index.php` into the matching paths under `<domain-directory>/testbraid-backend/`. Other backend source files will be added later.
- Do **not** copy `deploy/www/` itself as a nested `www/www` directory.
- Do **not** expose `backend/`, `vendor/`, `storage/` or any password file inside `www/`.

Example `rsync` structure (replace placeholders before running):

```sh
rsync -av frontend/dist/ USER@HOST:/ABSOLUTE/DOMAIN-DIR/www/
rsync -av deploy/www/ USER@HOST:/ABSOLUTE/DOMAIN-DIR/www/
rsync -av backend/composer.json USER@HOST:/ABSOLUTE/DOMAIN-DIR/testbraid-backend/
rsync -av backend/public/index.php USER@HOST:/ABSOLUTE/DOMAIN-DIR/testbraid-backend/public/
```

The destination `testbraid-backend/public/` must exist before the last command. Create it with SSH/SFTP first.

## 5. Install PHP dependencies over SSH

Log in to the host; run Composer in the **private backend** directory:

```sh
cd /ABSOLUTE/DOMAIN-DIR/testbraid-backend
php -v
composer --version
composer install --no-dev --optimize-autoloader
composer check-platform-reqs --no-dev
```

The project currently declares PHP 8.1+ for portability; the example host runs PHP 8.5. The Slim requirement is **`^4.15.3`**, avoiding known vulnerabilities in earlier Slim 4 releases.

When `composer.lock` does not exist, the first `composer install` resolves dependencies and creates one. Review and commit that generated lockfile to the repository later so subsequent installations are reproducible. Do not fabricate lockfiles by hand.

If `php -v` on SSH differs from the PHP version serving the website, select the correct CLI binary for Composer and investigate web PHP compatibility separately. Never assume that the CLI and web SAPIs have the same version.

## 6. Test the web deployment

Visit:

1. `https://testbraid.mariebila.cz/` — Vue home with language selector.
2. `https://testbraid.mariebila.cz/api/health` — JSON such as:
   ```json
   {"status":"ok","service":"testbraid-api"}
   ```
3. `https://testbraid.mariebila.cz/admin` — placeholder admin page. Reload it: Apache must serve the SPA, not return 404.
4. `https://testbraid.mariebila.cz/tests/example` — placeholder test view, including reload.

The home page should display **Connected/Připojeno** when it successfully reads the API response. The health endpoint must have HTTP 200 and a JSON content type.

Security spot checks:

- `/composer.json` and `/vendor/autoload.php` must not expose PHP dependencies or private files.
- Public `/media/` contains no original private uploads.
- Only the bootstrap PHP file under `/api/` is public; do not put actual backend source or secrets there.

## 7. Troubleshooting

| Symptom | Likely reason / check |
| --- | --- |
| Home works, API returns 503 | Private entry point or Composer `vendor/autoload.php` missing / wrongly located |
| Home works, API returns HTML | Apache rewrite sends `/api/health` to the Vue `index.html` instead of Slim |
| API returns 500 | PHP error or missing/incompatible Composer dependencies; inspect private server logs |
| Direct `/admin` returns 404 | Missing/inactive `mod_rewrite` or disallowed `.htaccess` |
| All routes return 500 | Apache rejects an `.htaccess` directive (often `Options`); inspect Apache error logs |
| Browser shows API unavailable | Inspect the browser Network tab and open `/api/health` directly |
| SSH PHP differs from web PHP | Use the correct CLI binary for Composer; inspect the website's PHP handler configuration |

The deployment templates are not yet validated on this host. Report HTTP statuses and relevant error-log lines if an issue occurs; do **not** share passwords, tokens or private config files.

## 8. Installation portability

No hostname or absolute path is hardcoded in Vue or Slim. For other domains, copy the same artifacts and point the domain document root to their deployed public directory.

By default `deploy/www/api/index.php` computes the sibling private backend location relative to itself. If a provider uses another layout, change the deployment template's default path **or** set `TESTBRAID_BACKEND_ENTRY` to the private `public/index.php` path. This customization is deployment configuration, not an application-code fork.

The SPA uses Vite's public base path and Vue Router uses the same base. This allows root and subdirectory deployment (with the appropriate build and rewrite configuration). For hosted public test links, production code must also derive the base URL rather than assume the example domain.

## 9. Remaining hosting checks

Before marking [issue #2](https://github.com/Radouch/TestBraid/issues/2) done:

- Confirm PHP **8.5 via web** and required extensions, not only PHP CLI.
- Confirm `.htaccess`/`mod_rewrite` support and the public/private directory boundary.
- Confirm allowed upload sizes, timeouts and storage quota.
- Test static video HTTP Range responses after the media workflow exists.
- Confirm logging and session-storage paths when authentication is added.

Additional environment-specific deployment adjustments should stay in `deploy/` or this guide rather than introduce hardcoded domain logic.
