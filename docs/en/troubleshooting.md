# Troubleshooting

**English** · [Čeština](../cs/troubleshooting.md)

Most problems come from a file that was not uploaded, a hidden `.htaccess` file that is missing, or PHP not being allowed to write to a folder. Your hosting's PHP error log usually names the cause.

## Common problems

| What you see | What to check |
| --- | --- |
| Blank page, or the page has no styling | Upload the `assets` folder (into your public folder) and `testbraid-backend/templates/index.html` again, both from the **same** ZIP. |
| `/api/health` shows a web page or "not found" | The hidden `.htaccess` file and the `api` folder are in your public folder; your hosting allows `.htaccess` rewrites; `basePath` in `app.json` matches the address. |
| A test link works, but reloading it gives "not found" | Same as above. Also check rewrite rules of any other application in a parent folder. |
| Error about the backend or configuration | The private folder `testbraid-backend` is next to the public folder (or `bootstrap.local.php` points to it); `vendor/` and `config/app.json` exist; `app.json` is valid JSON. |
| Cannot create the first author or sign in | The site uses HTTPS; `testbraid-backend/config/setup.key` contains the setup key (32–256 characters) and you typed the same setup key; PHP can write to `testbraid-backend/config/`. |
| Saving lessons or tests fails | PHP can write to `testbraid-backend/storage/`. |
| Uploading an image or video fails | Supported format (JPEG, PNG, WebP, MP4, WebM); file size within the limits in [Configuration](configuration.md#upload-limits); free disk space. |
| Images or videos of a published test do not show | The test is published; PHP can write to the `media` folder in your public folder; its `.htaccess` is present; the browser supports the video format. |

For a site installed under a URL such as `/courses/`, the folder inside your public folder, `basePath` in `app.json` and Apache routing must all agree. If the private folder lives elsewhere, also check the local `bootstrap.local.php` filesystem path.

## After a failed upgrade

Use the **upgrade ZIP**, not the initial-install archive. Make sure `config` and `storage` in the private folder, `media` in the public folder and any `bootstrap.local.php` were preserved. Replace `vendor/` completely; do not leave old dependencies mixed with new ones. See [Upgrading](upgrading.md).

## Security and support

If a file from the private folder can actually be opened in a web browser, **stop using the installation** until access is corrected. The installation security screen can test a harmless marker, but you should not request real secrets to investigate.

When reporting an issue, give reproduction steps, relevant error/status messages and your hosting environment. Never include passwords, setup keys, session tokens or private data. See [Security and backups](security-and-backups.md).
