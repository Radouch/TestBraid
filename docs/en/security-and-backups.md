# Security and backups

TestBraid is designed for a small number of trusted authors and anonymous learners. Content is stored in files, so the separation of public code/media from private data is fundamental.

## 1. Public and private files

- The Apache-served **public application** contains `index.php`, `api/index.php`, compiled assets, UI locale JSON and `media/` copies referenced by published tests.
- The **private backend** contains PHP source and `vendor/` dependencies, `config/app.json`, author password hashes in `config/authors.json`, the transient `config/setup.key` and original media, test and lesson records under `storage/`.
- Use a private backend **outside the actual web-served directory** whenever your host allows it. Its provided deny-all `.htaccess` is defense in depth; the existence of a rule alone does not guarantee the server honors it.
- Keep supplied Apache rules and protected `www/media/.htaccess` intact. Do not permit HTTP serving of original uploads, author records, JSON storage, development scripts, backups or `vendor/`.
- PHP must have the minimum write permissions needed for private `config/`/`storage/` and public `media/`. Avoid world-writable permissions such as `777`.

## 2. Author accounts and sessions

There is no public account registration. To create the **first** author, place a private 32–256-character `config/setup.key` and complete the `/admin` form with a password of at least 12 characters. Setup is permanently disabled after an author is created; remove any leftover setup key. Passwords are stored as hashes, not plaintext.

Signed-in authors use native PHP sessions. The production session cookie is `Secure`, `HttpOnly` and `SameSite=Lax`; privileged actions require authentication and a valid CSRF token. Login and first-author setup have rate limiting.

For intentional additional author provisioning by an operator with SSH/PHP CLI access, the private `bin/create-author.php` tool exists; consult its usage and protect your terminal history. There is no general browser-based user-management UI. Do **not** delete `authors.json` to reset a forgotten password: that removes the account records and risks an unsafe re-initialization. Plan account recovery as an administrator operation.

Use HTTPS. The project only permits non-secure session cookies in its isolated local PHP CLI development-server tests.

## 3. What learners can access

Anonymous users can list **published** tests and open their published content. Draft tests and private author media previews require an author session and are not returned by public test endpoints. Published images and video are copied to `www/media/` for efficient static Apache delivery; copies shared by other published tests are retained when appropriate. Private originals remain separate.

TestBraid is a **self-assessment** tool. Its public test payload contains the answer key for browser-side grading. Do not use it for secret, invigilated examinations or upload confidential material that must remain secret from people allowed to take the test.

## 4. Installation security diagnostics

The signed-in author area includes a voluntary **Installation security** check. It inspects backend/storage placement relative to the apparent public directory, relevant Apache deny-policy files and the harmless `security-probe.txt` marker.

An optional browser HTTP check can request a specific same-origin path ending in `/security-probe.txt`. If the known marker content is returned, that path exposes the private marker and needs attention. HTTP **403 or 404** means only that **the tested URL** did not serve the marker; it does not certify other possible URLs, aliases or virtual hosts.

Do not probe `authors.json`, private settings, tests or actual media as an experiment. A safe deployment preferably puts the backend completely outside the public web root, with deny rules as a secondary protection. Diagnostics are informational; they do not automatically block the installation.

## 5. Back up a consistent dataset

At minimum back up together:

| Location | Contains |
| --- | --- |
| Private `config/` | `app.json`, `authors.json` and other installation-owned configuration |
| Private `storage/` | Lessons, tests, media metadata, original uploaded files, locking/runtime records |
| Public `media/` | Published copies required to serve published tests; include its `.htaccess` |
| Public `bootstrap.local.php`, if present | Custom backend filesystem location |

Never place backup archives in the served public directory or commit them to the source repository. Exclude temporary/obsolete setup secrets from long-term backups when they are no longer needed. Preserve the relationships among test JSON, media metadata and original files.

For a consistent snapshot, **pause author writes** during backup: individual JSON file replacements are protected, but copying the whole directory tree while edits continue is not one global transaction. Store backups away from the host and periodically verify that they can be restored. Establish a retention policy appropriate for your installation.

## 6. Restore and maintenance

1. Stop author writes and keep a separate copy of the current (possibly damaged) state for diagnosis.
2. Restore the **matching** private configuration and storage files; restore public media if needed, keeping the Apache deny rules.
3. Check PHP ownership/write access to private directories and public `media/`.
4. Verify the public catalog, a published test, author login and private media preview.
5. If public media copies have become inconsistent, the private CLI `bin/reconcile-public-media.php` can reconcile generated copies against referenced published tests; it needs the real absolute served public directory as an argument. Back up first and run it only on the intended installation.

Do not delete unreferenced-looking files by hand without checking all tests: one media item may be reused across lessons and tests. There is no automatic whole-installation backup or recovery interface.

For routine deployment changes, see [Upgrading](upgrading.md). For errors, see [Troubleshooting](troubleshooting.md).
