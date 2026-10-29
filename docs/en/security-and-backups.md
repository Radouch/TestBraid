# Security and backups

**English** · [Čeština](../cs/security-and-backups.md)

TestBraid has public tests for learners and a protected workspace for authors. It stores tests and uploaded originals as private files, so the hosting directory layout matters.

## Keep private files private

Place the private folder `testbraid-backend` **outside the public folder** (the folder web browsers can open) whenever possible. It contains author accounts, configuration, tests, draft media and PHP application code. Only the files you put into the public folder should be reachable from a browser.

Keep the supplied Apache `.htaccess` rules, including the one in the `media` folder of your public folder. Grant PHP the necessary directory write permissions, but do not use unrestricted permissions such as `777`. Use HTTPS.

The author-only **installation security** screen can help check directory placement and an optional harmless HTTP probe. A 403/404 response from a tested URL confirms only that **that URL** did not serve the probe; it is not a security certificate. Never test access restrictions by requesting real credential files.

## Protect author accounts

The first account is created with a one-time setup key in `testbraid-backend/config/setup.key`. TestBraid deletes the file after setup; delete it yourself if it remains. Accounts are stored in `testbraid-backend/config/authors.json` with hashed passwords.

Author operations require login and CSRF protection. Production sessions use secure cookies. There is no public registration or browser-based general account-management screen.

For an operator with SSH access, additional accounts can be provisioned with the private `bin/create-author.php` tool. Do not put passwords in command-line arguments or public bug reports.

## Know what publication means

Only published tests are available to anonymous visitors. Originals uploaded to the media library stay private; media used by published tests is served as public copies.

Published tests deliberately contain their answer keys so the browser can evaluate responses. **Do not use TestBraid for secret examinations or publish material that must remain confidential.**

## Back up and restore

Back up these locations **together**:

| Location | Contents |
| --- | --- |
| `config` in the private folder | Website settings and author accounts |
| `storage` in the private folder | Tests, lessons, media metadata and original uploads |
| `media` in the public folder | Published copies and their access-control rules |
| `bootstrap.local.php` in the public folder, if used | Custom private folder location |

Pause author edits while taking a consistent backup. Store backups outside the public folder, ideally away from the hosting account, and test restoration occasionally.

When restoring, use a mutually compatible application version and data backup, preserve permissions, and check author login plus published media. There is no built-in full-backup or one-click restore function.

For routine file replacement, see [Upgrading](upgrading.md).
