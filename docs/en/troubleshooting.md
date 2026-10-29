# Troubleshooting

Most problems come from a file that was not uploaded, a hidden `.htaccess` file that is missing, or PHP not being allowed to write to a folder. Your hosting's PHP error log usually names the cause.

## Common problems

| What you see | What to check |
| --- | --- |
| Blank page, or the page has no styling | Upload `www/assets/` and `testbraid-backend/templates/index.html` again, both from the **same** ZIP. |
| `/api/health` shows a web page or "not found" | The hidden `www/.htaccess` and `www/api/` were uploaded; your hosting allows `.htaccess` rewrites; `basePath` in `app.json` matches the address. |
| A test link works, but reloading it gives "not found" | Same as above. Also check rewrite rules of any other application in a parent folder. |
| Error about the backend or configuration | `testbraid-backend/` is next to the public folder (or `bootstrap.local.php` points to it); `vendor/` and `config/app.json` exist; `app.json` is valid JSON. |
| Cannot create the first author or sign in | The site uses HTTPS; `config/setup.key` has 32–256 characters; PHP can write to `config/`. |
| Saving lessons or tests fails | PHP can write to `testbraid-backend/storage/`. |
| Uploading an image or video fails | Supported format (JPEG, PNG, WebP, MP4, WebM); file size within the limits in [Configuration](configuration.md#upload-limits); free disk space. |
| Images or videos of a published test do not show | The test is published; PHP can write to the public `media/` folder; its `.htaccess` is present; the browser supports the video format. |

For a site installed under a URL such as `/courses/`, the public directory, `app.json` `basePath` and Apache routing must all agree. If the private backend lives elsewhere, also check the local `bootstrap.local.php` filesystem path.

## After a failed upgrade

Use the **upgrade ZIP**, not the initial-install archive. Make sure private `config/` and `storage/`, public uploaded `media/` and local `bootstrap.local.php` were preserved. Replace `vendor/` completely; do not leave old dependencies mixed with new ones. See [Upgrading](upgrading.md).

## Security and support

If a private backend file is actually available over HTTP, **stop using the installation** until access is corrected. The installation security screen can test a harmless marker, but you should not request real secrets to investigate.

When reporting an issue, give reproduction steps, relevant error/status messages and your hosting environment. Never include passwords, setup keys, session tokens or private data. See [Security and backups](security-and-backups.md).
