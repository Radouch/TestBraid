# Installing TestBraid

TestBraid is a self-hosted application for multimedia self-assessment tests. This guide is for people deploying a **prebuilt release ZIP** to Apache/PHP hosting; it does not require Node.js, npm, Composer, a database, or SSH on the hosting account.

> **Release availability:** The repository contains an automated release-building workflow, but as of the documentation review on 26 October 2026 no GitHub Release had been published. Follow the steps below once the first versioned release is available. Developers can prepare an equivalent package from source; see [Development](development.md).

## 1. Hosting requirements

- Apache with `.htaccess` overrides and rewrite support (`mod_rewrite`). TestBraid relies on the supplied rules for API requests, deep links, and protected media.
- PHP compatible with the application's locked dependencies, with `fileinfo`, sessions, JSON support and file uploads enabled. `backend/composer.json` declares PHP `^8.1`; the project's current CI and known live-host verification use **PHP 8.5**. Other PHP versions covered by the declaration have **not** all been independently tested.
- HTTPS for a real installation: production login cookies are marked `Secure`.
- SFTP or an equivalent hosting file manager. You must be able to place a **private backend outside the web-served directory**, or set up and verify effective access restrictions for it.
- Writable private storage and configuration directories for the PHP process; writable public `media/` for published media; adequate storage and PHP upload allowances.
- No SQL database, Node.js server, background worker or PHP Composer command is needed to run the prepared release.

If your host uses Nginx or does not permit the supplied Apache rules, this guide is insufficient: equivalent routing and access-control configuration must be designed and verified separately.

## 2. Download the right archive

From the [GitHub Releases page](https://github.com/Radouch/TestBraid/releases), obtain `testbraid-vX.Y.Z-install.zip` for a **new** installation, together with `SHA256SUMS`. Replace `X.Y.Z` with the version you are downloading. Check the archive against the checksum using a SHA-256 utility if one is available. Do **not** use the `upgrade` archive for an initial installation.

Extract the ZIP locally. It contains two top-level directories:

~~~text
www/                       -> files served by Apache
testbraid-backend/         -> private PHP application and dependencies
~~~

The `install` archive includes `testbraid-backend/config/app.json` with editable defaults and `testbraid-backend/vendor/` with locked PHP production dependencies. It contains **no** author accounts, uploaded media or persistent test data.

## 3. Place the files on the host

A typical domain-root layout is:

~~~text
account-or-domain-directory/
├── www/                              # Apache document root
│   ├── .htaccess
│   ├── index.php
│   ├── backend-path.php
│   ├── api/index.php
│   ├── assets/
│   ├── locales/
│   └── media/.htaccess
└── testbraid-backend/                # not served by Apache
    ├── .htaccess
    ├── config/app.json
    ├── public/index.php
    ├── src/
    ├── schemas/
    ├── templates/index.html
    ├── vendor/
    └── storage/                      # created as needed
~~~

Upload the **contents** of the ZIP's `www/` to the chosen publicly served application directory, and the **contents** of `testbraid-backend/` to a private directory. Your host might call its public directory `public_html`, `htdocs` or something else: `www` is a name inside the archive, not a mandatory server directory name.

Do not upload the whole extracted ZIP into the web root. Do not expose `testbraid-backend/`, `vendor/`, `config/`, private `storage/` or the original private media to unauthenticated HTTP requests. Preserve hidden `.htaccess` files during extraction and upload.

The PHP process must be able to create private files in `testbraid-backend/config/` and `testbraid-backend/storage/`, and write public copies to `www/media/`. Prefer correct user/group ownership or access-control lists; **do not set everything to mode 777**.

## 4. Configure the application URL and backend location

For a domain-root installation such as `https://example.org/`, keep `"basePath": "/"` in the private `config/app.json`. For `https://example.org/courses/` use `"basePath": "/courses"`. For a deeper directory, use e.g. `"/learning/tests"`. Do not include the domain, a trailing slash (except `"/"`), a query string or `..`.

If the backend is a sibling of the application directory named `testbraid-backend`, the public PHP resolver finds it automatically. Otherwise copy the supplied `www/bootstrap.local.example.php` to `www/bootstrap.local.php` **in the installed public application directory** and set its single `backendPath` value relative to that directory:

~~~php
<?php
return [
    'backendPath' => '../../my-private-testbraid',
];
~~~

For example, if the served application lives in `account/www/courses/` and the private backend is `account/my-private-testbraid/`, the relative path above points to it. The path is a filesystem path, **not a URL**. Leave the distributed `backend-path.php` unchanged. The local `bootstrap.local.php` is not provided by release packages and must be retained during upgrades.

A single prebuilt frontend works in the domain root or a URL subdirectory; no recompilation is needed. If another application in a parent directory has an aggressive catch-all Apache rewrite, its rules may need an exception so requests can reach TestBraid's own `.htaccess`. See [Configuration](configuration.md) and [Troubleshooting](troubleshooting.md).

## 5. Create the first author

TestBraid has **no public sign-up**. The first author is initialized with a one-time secret placed privately on the server.

1. Generate a cryptographically random secret of **32–256 characters**. Save it as a plain-text file `testbraid-backend/config/setup.key`, containing only the secret (an optional ending newline is accepted). Never place it under `www/`.
2. Check that PHP can read `setup.key` and create `config/authors.json`; its private login-attempt storage must also be writable.
3. Open `https://example.org/admin` (or `https://example.org/courses/admin` for a subdirectory install).
4. Enter the username, a password of **at least 12 characters**, and the same setup secret.
5. Once the first author is created, sign out and sign in again. The application attempts to delete `setup.key` automatically. Remove it yourself through SFTP if it remains.

Creating an author writes a **password hash** to private `config/authors.json` and permanently disables browser first-author registration. Do not delete `authors.json` as a way of resetting access. Optional SSH provisioning for additional authors is discussed in [Security and backups](security-and-backups.md).

## 6. Check the installation

- Open the home page; you should see the public catalog (empty if no tests are published).
- Open `/api/health` relative to the application URL; it should return JSON containing `"status":"ok"` and `"service":"testbraid-api"`.
- Open `/admin`, sign in, and create a lesson and a draft test.
- Open an author preview, then publish a complete test and follow its public link. Confirm that the page still works after a direct reload.
- Upload a small permitted image and video; verify playback, including seeking in a published MP4 where supported.
- In the author area run the **Installation security** check. Follow its guidance, but remember that an HTTP 403/404 at one tested URL does not establish that every URL is protected.
- Confirm the private backend is not web-accessible. The supplied `security-probe.txt` is a harmless test marker; **never probe real credential or storage files**.

After installation, see [Configuration](configuration.md), [Author guide](author-guide.md) and [Security and backups](security-and-backups.md). For later versions, use **[Upgrading](upgrading.md)**, not this initial-install procedure.
