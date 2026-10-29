# Upgrading

Use the **upgrade ZIP** from [GitHub Releases](https://github.com/Radouch/TestBraid/releases). Never upload the install ZIP over a running site: it would replace your `config/app.json` and bring the demo lesson back. Read the release notes first in case the new version requires special steps.

## 1. Back up your installation

Download a copy of the folders listed in [Security and backups](security-and-backups.md#back-up-and-restore), mainly the private `config/` and `storage/` and the public `media/`. Don't edit tests while you back up and upgrade.

## 2. Replace application files

Extract the upgrade archive. Upload its `www/` contents to your actual public application directory and its `testbraid-backend/` contents to the private backend.

**Important:**

- **Preserve** the existing private `config/` and `storage/`, uploaded public `media/`, and any local `bootstrap.local.php`. The upgrade archive deliberately omits these installation-specific files.
- **Replace the private `vendor/` directory completely**, rather than merging new dependency files with old ones.
- Update both public `assets/` and private `templates/index.html`. They belong to the same frontend build.
- Keep the distributed `.htaccess` rules. Do **not** run a synchronization tool with a global “delete missing files” option.

If an older installation still has a public `index.html`, remove that **obsolete application file** after the new `index.php` is in place.

The release ZIP already contains PHP dependencies. No Composer or frontend build is necessary on the host.

## 3. Check the result

Reload the application, sign in, and check that an existing lesson, draft and published test still work. Verify that images and videos are accessible, and try reloading a direct link to a test. Check that your site title, UI languages and URL path remain correct.

If the site fails, compare the uploaded files with the archive and consult [Troubleshooting](troubleshooting.md). Restore a known-good, compatible application version and backup if needed; do not delete persistent files to repair a failed upgrade.
