# Troubleshooting

If an installation stops working, start by checking the public and private upload locations, \`.htaccess\` files, PHP error logs and the URL \`basePath\` in private \`app.json\`.

## Common problems

| Symptom | First checks |
| --- | --- |
| Blank page, or missing JavaScript/CSS | Public \`assets/\` and private \`templates/index.html\` must come from the same package. |
| \`/api/health\` returns HTML or 404 | Check Apache rewrites, the public API bootstrap and the installation's \`basePath\`. |
| Direct link to a test fails on reload | Check URL rewriting and any parent application's rewrite rules. |
| Backend/configuration error | Check private backend location, \`vendor/\` and \`config/app.json\`. |
| Cannot sign in or create first author | Check HTTPS, PHP sessions, private directory permissions and the one-time \`setup.key\`. |
| Saving lessons or tests fails | Check PHP write access to private \`storage/\`; consult the signed-in storage diagnostic if available. |
| Image/video upload fails | Check supported format, file size, PHP upload limits and available space. |
| Published media does not play | Check publication state, public \`media/\` permissions and the browser's codec support. |

For a site installed under a URL such as \`/courses/\`, the public directory, \`app.json\` \`basePath\` and Apache routing must all agree. If the private backend lives elsewhere, also check the local \`bootstrap.local.php\` filesystem path.

## After a failed upgrade

Use the **upgrade ZIP**, not the initial-install archive. Make sure private \`config/\` and \`storage/\`, public uploaded \`media/\` and local \`bootstrap.local.php\` were preserved. Replace \`vendor/\` completely; do not leave old dependencies mixed with new ones. See [Upgrading](upgrading.md).

## Security and support

If a private backend file is actually available over HTTP, **stop using the installation** until access is corrected. The installation security screen can test a harmless marker, but you should not request real secrets to investigate.

When reporting an issue, give reproduction steps, relevant error/status messages and your hosting environment. Never include passwords, setup keys, session tokens or private data. See [Security and backups](security-and-backups.md).
