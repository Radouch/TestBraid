# Upgrading TestBraid

Use the **upgrade** release archive for an existing installation. A normal upgrade should preserve the installation's identity, authors, lessons, tests and media without running a new frontend build or Composer on the host.

## 1. Before changing files

1. Note the currently installed version shown in the TestBraid footer.
2. Download the desired `testbraid-vX.Y.Z-upgrade.zip` and `SHA256SUMS` from [GitHub Releases](https://github.com/Radouch/TestBraid/releases), and verify the checksum if possible.
3. Read the release notes for version-specific breaking changes or manual migration steps. This generic procedure does not replace version-specific notices.
4. **Back up** the private `config/` and complete `storage/` trees, the public `media/` tree (including its `.htaccess`), and the installation-specific `www/bootstrap.local.php` if present. Preserve file ownership and permissions where possible.
5. Avoid author writes while making a consistent backup and replacing files. A set of JSON records is not a database transaction spanning the entire application.

An `upgrade` ZIP deliberately omits private `config/` and `storage/`, public uploaded media files and `bootstrap.local.php`. It **does** include a complete production `vendor/`. These differences are intentional.

## 2. Update the public application

Unpack the archive locally. Copy the archive's `www/` **contents** into the actual public TestBraid directory, merging and replacing application-owned files: PHP bootstraps, `.htaccess`, `assets/`, `locales/`, the favicon and other bundled assets.

Keep the existing uploaded files in `www/media/` and the supplied `media/.htaccess` policy. Keep your `bootstrap.local.php`. Do **not** use SFTP mirroring or synchronization with a global delete option.

If the installation comes from an older layout that still has a public `index.html`, remove **that obsolete application file** after confirming the new `index.php` is in place; never indiscriminately clear the web directory. Missing `assets/` or `locales/` must not be redirected to the SPA fallback.

## 3. Update the private application

Copy the archive's `testbraid-backend/` application files to the installed private backend:

- `public/index.php`, `src/`, `bin/`, `schemas/`, `composer.json`, `composer.lock` and the supplied security files.
- **`templates/index.html` every time the frontend changes.** This private HTML template refers to the newly built hashed JS and CSS filenames. Copying only public `assets/` can leave an outdated or broken page.
- Replace the existing private **`vendor/` directory completely** with the new directory from the release ZIP. Do not simply merge over old Composer dependency files; removed old packages must not remain.

**Never replace or delete** the installed `config/` or `storage/` with distribution contents. Leave any unrelated private host files untouched.

The private destination directory may have a different name from the ZIP's `testbraid-backend/`; follow the paths set during installation. The configured `basePath` and local `backendPath` must still describe the actual locations.

## 4. Verify before resuming normal use

- Open the application home page and directly reload a nested route.
- Confirm `/api/health` responds with JSON; sign in at `/admin`.
- Check the installed footer version, custom title, enabled interface languages and application base URL.
- Inspect a draft test and a published test, including image/video playback and seeking.
- Verify that a file uploaded before the upgrade remains available and that publication/unpublication still behaves correctly.
- Use the author-only installation security check if your hosting layout changed.

If the version displayed in the footer does not change, check **both** the public `assets/` and the private `templates/index.html`. A forced browser reload may be useful after the files are consistent.

## 5. Problems and rollback

For a failed upgrade, stop author writes and review [Troubleshooting](troubleshooting.md) before changing more files. If necessary, restore a previously working **matched code version** and its compatible `vendor/`/template files, plus a consistent backup of the persistent data if it was changed or migrated. Do not assume an older application version can read data written by an arbitrary newer version.

Never try to repair an upgrade by deleting `authors.json`, `storage/`, or uploaded `media/`. There is currently no automatic full-installation migration/rollback utility.

## 6. Source-built deployments are different

`node scripts/prepare-deployment.mjs` normally makes a **vendor-free** SFTP staging directory; the option `--include-vendor` copies installed production dependencies and is used by the release workflow. For first installs, `--initial-install` adds the default `config/app.json`. These flags describe **package construction**, not runtime commands. See [Development](development.md).

This guide assumes the official release archive contains the expected dependencies and passes its package verification. If you deliberately build or customize from source, you must validate that artifact separately.
