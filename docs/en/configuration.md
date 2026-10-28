# Configuring an installation

The main installation configuration is the private `testbraid-backend/config/app.json`. The application reads its settings at runtime; changing the site name, visible languages, upload limits or base URL does **not** require rebuilding Vue.

## 1. Main configuration file

The versioned defaults are in `backend/config/app.json` in the source repository. On a new installation, the `install` release archive places that file in the private backend:

~~~json
{
  "site": {
    "name": { "cs": "TestBraid", "en": "TestBraid" },
    "description": {
      "cs": "Aplikace pro tvorbu a vyplňování multimediálních testů se samostatným vyhodnocením odpovědí.",
      "en": "An application for creating and taking multimedia self-assessment tests with immediate feedback."
    }
  },
  "uploads": {
    "maxImageSizeMiB": 10,
    "maxVideoSizeMiB": 64
  },
  "uiLanguages": ["en", "cs"],
  "basePath": "/"
}
~~~

Keep this file **outside the public web root**. Invalid configuration can make the application return HTTP 503 rather than silently ignoring the error. The upgrade ZIP intentionally does not contain `config/`, so your local settings are retained.

## 2. Site title and description

`site.name` supplies the application header and browser-tab title. `site.description` appears as the introduction **only on the public home page**, not as a repeating header in author screens.

Each accepts either a single string or a map from locale codes to translated strings. For example:

~~~json
"name": { "en": "Training Tests", "cs": "Výukové testy" }
~~~

Use a single string for a language-independent title. Missing site-text translations fall back to another available configured translation. The site title is distinct from the fixed TestBraid product identification and build version in the footer.

## 3. Interface languages and translations

`uiLanguages` is a nonempty list of locale codes offered by this installation, such as `["cs"]` for a Czech-only website. These are **interface** languages, not a filter on the language of lesson/test content.

The browser loads translation dictionaries from the public application directory `locales/<code>.json`. Built-in files are `locales/en.json` and `locales/cs.json`. To add a language:

1. Copy the structure of `en.json` into a new UTF-8 JSON file, for example `locales/de.json`.
2. Translate every key and set the dictionary's `languageName`.
3. Upload the new file to the installed public `locales/` directory.
4. Add `"de"` to `uiLanguages` in the private `app.json` and reload the site.

No frontend build is necessary. English is used as a fallback dictionary when available; it need not be an offered language. Unsupported or missing translation files are not shown as selectable languages. Language selection can be carried by an explicit `?lang=cs`/`?lang=en` URL parameter when those locales are enabled; the application also uses saved or browser language preferences.

For precise validation constraints, consult `backend/src/Config/InstallationConfig.php` and the locale loader. A language code accepted as a test's **content language** does not imply its UI dictionary exists.

## 4. File-upload size limits

The `uploads` object configures `maxImageSizeMiB` and `maxVideoSizeMiB` as positive integer sizes in MiB (1–2048). The defaults are **10 MiB per image** and **64 MiB per video**.

PHP and the web server can impose stricter limits (`upload_max_filesize`, `post_max_size`, request size and timeouts). TestBraid uses the effective lower limit and can warn a signed-in author when the server is more restrictive than `app.json`. Multipart uploads need space beyond the nominal media bytes.

Supported media are JPEG, PNG, WebP, MP4 and WebM; they are validated server-side. In the library, selecting several files does not combine them into one request: limits apply independently to each file. A valid container is not a guarantee that every browser supports its codec. See [Media library](media-library.md).

For upgrades from older installations, legacy `config/uploads.json` is read when a unified `app.json` has not been created. Migrate custom limits to `app.json` rather than maintaining two files indefinitely.

## 5. Application URL base

`basePath` specifies the **URL path**, not the backend filesystem path:

| Public URL | `basePath` |
| --- | --- |
| `https://example.org/` | `"/"` |
| `https://example.org/testbraid/` | `"/testbraid"` |
| `https://example.org/courses/tests/` | `"/courses/tests"` |

The old `TESTBRAID_BASE_PATH` environment override remains supported. If both that environment variable and `app.json` define an explicit base, they must agree. Mismatches produce an application configuration error. The PHP public `index.php` inserts the correct HTML `<base>` into a private built template, so there is **one build** for root and nested URLs.

## 6. Filesystem path to the backend

The two public entry points, `index.php` and `api/index.php`, both use the supplied `backend-path.php` resolver. Normally the private backend is a sibling directory named `testbraid-backend`.

For another private path, copy `www/bootstrap.local.example.php` to `www/bootstrap.local.php` and edit the relative `backendPath`:

~~~php
<?php
return [
    'backendPath' => '../../my-private-testbraid',
];
~~~

The relative path is evaluated from the actual **public application folder**. The local file is not included in either release ZIP; keep it through upgrades. Do not edit `backend-path.php` or both entry points separately.

Advanced environment settings (such as `TESTBRAID_BACKEND_ENTRY`, `TESTBRAID_APP_CONFIG_FILE` and `TESTBRAID_STORAGE_DIR`) are available in the PHP code for specialized hosting and testing. Avoid using them unless necessary; never move private storage into a publicly served directory.

## 7. Applying and checking changes

Update `app.json` on the host and reload the application. Check the title, introductory text and language selector. When changing the URL base or backend location, also ensure Apache routing, the actual directory and the host configuration agree; test `/api/health`, author login and a deep link.

For diagnostics see [Troubleshooting](troubleshooting.md). For protecting settings and credentials see [Security and backups](security-and-backups.md).
