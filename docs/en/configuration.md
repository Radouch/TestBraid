# Configuration

Each installation has its own private \`testbraid-backend/config/app.json\`. Changes to site identity, supported UI languages, upload limits and application URL are read at runtime: **no frontend rebuild is needed**.

## Main settings

| Setting | Purpose |
| --- | --- |
| \`site.name\` | Website title and browser-tab title |
| \`site.description\` | Introductory text on the public home page |
| \`uiLanguages\` | Interface languages offered to visitors |
| \`uploads.maxImageSizeMiB\` | Maximum image file size |
| \`uploads.maxVideoSizeMiB\` | Maximum video file size |
| \`basePath\` | URL path where the application is installed |

Use the supplied \`app.json\` as a starting point; it contains working defaults. Do not put this private file in the public directory. Upgrades preserve it.

## Site name and description

Both \`site.name\` and \`site.description\` accept a single string or language-specific values:

\`\`\`json
{
  "en": "Training tests",
  "cs": "Výukové testy"
}
\`\`\`

The description is shown on the home page, not in every screen. Changing the UI language changes the displayed site text when a translation is available.

## Interface languages

The interface reads JSON translation files from the public \`locales/\` directory. English and Czech are supplied. To add another language:

1. Translate a copy of \`locales/en.json\`, keeping the same message keys.
2. Upload it as \`locales/<language-code>.json\`.
3. Add that code to \`uiLanguages\` in \`app.json\` and reload.

No build is needed. You can also offer only one language. **The interface language does not translate test content**; a test has its own content-language setting.

## Upload limits

Configure the per-file image and video limits in \`app.json\`. The hosting provider's PHP limits (\`upload_max_filesize\` and \`post_max_size\`) can reduce the effective maximum.

The library supports selecting multiple files, but uploads and limits still apply **per file**. See [Media library](media-library.md).

## Installation path

Set \`basePath\` to \`"/"\` at the domain root or to a path such as \`"/courses/tests"\` for \`https://example.org/courses/tests/\`. It is a **URL path**, not a filesystem path. Match it to the actual Apache directory and rewrite rules.

By default the public application looks for a sibling private directory named \`testbraid-backend\`. If your host requires a different location, copy \`www/bootstrap.local.example.php\` to \`www/bootstrap.local.php\` and set its \`backendPath\` to the **private filesystem path relative to the public application directory**. Keep this local file during upgrades.

For problems with URL routing or private paths, see [Troubleshooting](troubleshooting.md).
