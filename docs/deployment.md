# TestBraid — Deployment on Apache/PHP Shared Hosting

**Status:** Initial frontend/API smoke test passed on the example host (2026-10-19); broader deployment/security checks remain open  
**Example target:** `https://testbraid.mariebila.cz/` (PHP 8.5, Apache document root `www/`)  
**Portability:** The hostname is an example only. The app is not bound to a specific domain; see subdirectory and alternate-layout notes below.

## 1. What this build demonstrates

The deployed base was verified with a Vue UI (English and Czech) and `GET /api/health`. The new authentication increment adds a sign-in/out form, native PHP sessions and a protected `GET /api/admin/ping`; **these features have not yet been deployed to the host**.

**Still not implemented:** editing/saving tests, media uploads and learner evaluation. Successful authentication smoke tests do not mean PoC-A is finished.

### Hosting facts and initial deployment results

- The domain's document root is a directory named `www`.
- A sibling directory next to `www` is available for non-public backend files.
- The hosting environment offers PHP **8.5**, SSH and Composer.
- The first test domain is `testbraid.mariebila.cz`.

The paths, PHP version, SSH and Composer availability were **reported by the owner**. On **2026-10-19**, the owner also confirmed a successful live smoke test after adjusting the root Apache rewrite rules:

- `/` displayed the Vue frontend.
- `/api/health` returned `{"status":"ok","service":"testbraid-api"}`.
- `/admin` loaded the placeholder admin view, including a page refresh.
- `/tests/example` loaded the placeholder test view, including a page refresh.

This establishes working frontend/API routing on the selected host; PHP 8.5 was reported, but its version was **not independently checked through the web SAPI**. Composer dependencies are evidently available to Slim, but installation commands and package versions have not been independently audited. Writable storage, permissions, future uploads and media handling remain untested.

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
    ├── config/
    │   └── authors.json            # Provisioned password hashes (NEVER in Git/www)
    ├── storage/
    │   └── login-attempts/         # Writable only by the PHP process
    ├── public/
    │   └── index.php               # Actual Slim application
    └── vendor/                      # Installed by Composer on the host
```

The `www/api/index.php` file is only a public bootstrap. Its default path points to the **sibling** directory `testbraid-backend`; the actual PHP app loads its own `vendor/autoload.php` by a relative path. Author password hashes and the login throttling state must remain **private and writable by the PHP process as appropriate**.

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

Vue Router and the health-check URL use Vite's `BASE_URL`. The default root build uses `/`. In the PHP backend, the default Slim base path is **empty** (domain-root URLs), deliberately independent of Apache's `SCRIPT_NAME` or internal rewrite target. For an actual subdirectory deployment, explicitly configure `TESTBRAID_BASE_PATH=/testbraid` for the PHP web process and deploy the matching Vite build. Also adjust the public bootstrap's relative private path to the actual layout and put the Apache rewrite file in the application directory. Do not set `TESTBRAID_BASE_PATH` for the current root-domain installation.

Do not upload `frontend/node_modules/` or frontend source files to the public web root.

## 4. Upload files to the host

Use SFTP or `rsync`; substitute your real SSH account/paths. **Do not create or guess an absolute server path based on the hostname.**

- Copy **the contents** of `frontend/dist/` into `<domain-directory>/www/`.
- Copy **the contents** of `deploy/www/` into the same `www/` directory, including hidden `.htaccess` files.
- Copy `backend/composer.json`, `backend/public/`, `backend/src/`, and all contents of root `schemas/` into the corresponding `<domain-directory>/testbraid-backend/` paths. `schemas/` must remain outside `www/`. The validators are implemented but not yet used by an API endpoint.
- Do **not** copy `deploy/www/` itself as a nested `www/www` directory.
- Do **not** expose `backend/`, `vendor/`, `storage/` or any password file inside `www/`.

Example `rsync` structure (replace placeholders before running):

```sh
rsync -av frontend/dist/ USER@HOST:/ABSOLUTE/DOMAIN-DIR/www/
rsync -av deploy/www/ USER@HOST:/ABSOLUTE/DOMAIN-DIR/www/
rsync -av backend/composer.json USER@HOST:/ABSOLUTE/DOMAIN-DIR/testbraid-backend/
rsync -av backend/public/ USER@HOST:/ABSOLUTE/DOMAIN-DIR/testbraid-backend/public/\nrsync -av backend/src/ USER@HOST:/ABSOLUTE/DOMAIN-DIR/testbraid-backend/src/\nrsync -av backend/bin/ USER@HOST:/ABSOLUTE/DOMAIN-DIR/testbraid-backend/bin/\nrsync -av schemas/ USER@HOST:/ABSOLUTE/DOMAIN-DIR/testbraid-backend/schemas/
```

Create the destination `testbraid-backend/public/`, `testbraid-backend/src/` and `testbraid-backend/schemas/` directories with SSH/SFTP if absent. The optional `backend/bin/` test runner can also be copied for schema verification. The entire `schemas/` directory (including fixtures) should be deployed into the private backend.

## 5. Install PHP dependencies over SSH

Log in to the host; run Composer in the **private backend** directory:

```sh
cd /ABSOLUTE/DOMAIN-DIR/testbraid-backend
php -v
composer --version
composer install --no-dev --optimize-autoloader
composer check-platform-reqs --no-dev\ncomposer run test:schemas
```

The `test:schemas` command runs shared fixtures against PHP's Opis schema validator and publication rules, once installed. This does not expose test data publicly. The project currently declares PHP 8.1+ for portability; the example host runs PHP 8.5. The Slim requirement is **`^4.15.3`**, avoiding known vulnerabilities in earlier Slim 4 releases.

When `composer.lock` does not exist, the first `composer install` resolves dependencies and creates one. Review and commit that generated lockfile to the repository later so subsequent installations are reproducible. Do not fabricate lockfiles by hand.

If `php -v` on SSH differs from the PHP version serving the website, select the correct CLI binary for Composer and investigate web PHP compatibility separately. Never assume that the CLI and web SAPIs have the same version.

## 6. Author provisioning and security (authentication increment)

**Requires deployment of the authentication branch and successful CI before use.** This feature is not part of the previously verified health-only hosting snapshot.

From the private backend directory on the host, create an author account without putting the password in command history or process arguments. Run this in **Bash** over SSH:

```bash
cd /ABSOLUTE/DOMAIN-DIR/testbraid-backend
read -r -s -p 'New author password: ' TESTBRAID_PASSWORD
printf '\n'
printf '%s\n' "$TESTBRAID_PASSWORD" | php bin/create-author.php alice
unset TESTBRAID_PASSWORD
```

The password must contain at least 12 bytes. The command creates or updates `config/authors.json` using `password_hash()`, with restrictive file permissions. The file and `storage/login-attempts/` **must never be placed under** `www/` or committed to Git. The script refuses duplicate usernames; password updates/revocation are not implemented yet.

The PHP webserver user needs read access to `config/authors.json` and write access to `storage/login-attempts/`. SSH and webserver PHP may use different Unix users; configure owner/group and permissions accordingly **without making secrets world-readable**. Session storage must also be usable by PHP.

Then visit:

- `/admin` — sign in with the provisioned username and password.
- `/api/auth/session` — reports `authenticated`, a session CSRF token, and the current author when logged in.
- `/api/admin/ping` — returns HTTP 401 anonymously or author info when logged in.
- Sign out — invalidates author login, rotates session identifier and CSRF token.

**Security policy:** production sessions use `Secure`, `HttpOnly`, `SameSite=Lax` cookies and do not accept session IDs in URLs. Use HTTPS for the actual site. CSRF is required for state-changing requests, including sign-in, and privileged routes check the server session. The only HTTP exception (`TESTBRAID_ALLOW_HTTP_LOCAL=1`) is restricted to the loopback development server; never configure it on the public host.

For a shell-controlled local integration test or GitHub Actions runner:

```sh
cd backend
composer run test:auth
```

This integration test creates a disposable local test account and starts PHP's development webserver. It is not designed to test the public production domain.

The `/api/auth/session` endpoint is intentionally public to provide the CSRF token needed **before** login. The session cookie itself remains `HttpOnly`. The initial login throttling implementation stores hashed-key failure counters on disk; an eventual cleanup job and multi-server support are outside this first increment.

## 7. Test the web deployment (initial foundation smoke test passed)

Visit:

1. `https://testbraid.mariebila.cz/` — Vue home with language selector.
2. `https://testbraid.mariebila.cz/api/health` — JSON such as:
   ```json
   {"status":"ok","service":"testbraid-api"}
   ```
3. `https://testbraid.mariebila.cz/admin` — placeholder admin page. Reload it: Apache must serve the SPA, not return 404.
4. `https://testbraid.mariebila.cz/tests/example` — placeholder test view, including reload.

The home page should display **Connected/Připojeno** when it successfully reads the API response. The health endpoint must have HTTP 200 and a JSON content type. The four URLs and Vue route refreshes above were **confirmed working by the owner on 2026-10-19**; the exact HTTP headers have not been independently inspected.

### Apache rewrite configuration verified on this host

The initial deployment's `/api/health` responded with a generic HTTP 500. A minimal single-route rule using `[END]` worked; the complete rules using `[END]` and **without** `Options -Indexes` subsequently worked for all tested pages.

The corrected file is `deploy/www/.htaccess`. It routes `/api/*` to the public bootstrap, serves real assets as files, routes Vue deep links to `index.html` and does not turn missing `/media/` resources into SPA HTML.

The exact cause of the original HTTP 500 was **not isolated**: changing the rewrite flags and removing the `Options` directive both differed from the original configuration. Reuse the tested configuration and avoid assuming every Apache host permits `Options`.

A direct request to `/api/index.php` may return Slim HTTP 404 because the only implemented route is `/api/health`; this is not itself a deployment failure.

Security spot checks:

- `/composer.json` and `/vendor/autoload.php` must not expose PHP dependencies or private files.
- Public `/media/` contains no original private uploads.
- Only the bootstrap PHP file under `/api/` is public; do not put actual backend source or secrets there.

## 8. Troubleshooting

| Symptom | Likely reason / check |
| --- | --- |
| Home works, API returns 503 | Private entry point or Composer `vendor/autoload.php` missing / wrongly located |
| Home works, API returns HTML | Apache rewrite sends `/api/health` to the Vue `index.html` instead of Slim |
| API returns 500 | PHP error or missing/incompatible Composer dependencies; inspect private server logs |
| `/api/health` returns 404 after adding authentication | A prior version incorrectly derived Slim's base path from rewritten `SCRIPT_NAME`; use the fixed backend from `feature/poc-a-auth`, confirm `TESTBRAID_BASE_PATH` is unset for root-domain installations, and retain the verified Apache `.htaccess` |
| Direct `/admin` returns 404 | Missing/inactive `mod_rewrite` or disallowed `.htaccess` |
| API `500` with original rewrite file | Use the verified `deploy/www/.htaccess` with `[END]` and without `Options -Indexes`; inspect Apache error logs if it persists |
| Browser shows API unavailable | Inspect the browser Network tab and open `/api/health` directly |
| SSH PHP differs from web PHP | Use the correct CLI binary for Composer; inspect the website's PHP handler configuration |

The root Apache rewrite template has passed the owner's live smoke test; the media directory's separate `.htaccess`, security hardening and future upload/video behavior have **not** been validated. Report HTTP statuses and relevant error-log lines if an issue occurs; do **not** share passwords, tokens or private config files.

## 9. Installation portability

No hostname or absolute path is hardcoded in Vue or Slim. The PHP base path defaults to domain root and can be overridden explicitly by `TESTBRAID_BASE_PATH` for subdirectory deployments. For other domains, copy the same artifacts and point the domain document root to their deployed public directory.

By default `deploy/www/api/index.php` computes the sibling private backend location relative to itself. If a provider uses another layout, change the deployment template's default path **or** set `TESTBRAID_BACKEND_ENTRY` to the private `public/index.php` path. This customization is deployment configuration, not an application-code fork.

The SPA uses Vite's public base path and Vue Router uses the same base. This allows root and subdirectory deployment (with the appropriate build and rewrite configuration). For hosted public test links, production code must also derive the base URL rather than assume the example domain.

## 10. Remaining hosting checks

Before marking [issue #2](https://github.com/Radouch/TestBraid/issues/2) done:

- Confirm PHP **8.5 via web** and required extensions, not only PHP CLI.
- The root `.htaccess`/`mod_rewrite` path is confirmed working; **separately verify** private directory isolation, access permissions and the future media-directory `.htaccess`.
- Confirm allowed upload sizes, timeouts and storage quota.
- Test static video HTTP Range responses after the media workflow exists.
- Verify PHP session storage, secure cookie behavior, login throttling directory permissions, and private author-file access after deploying auth.

Additional environment-specific deployment adjustments should stay in `deploy/` or this guide rather than introduce hardcoded domain logic.
