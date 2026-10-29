# Configuration

**English** · [Čeština](../cs/configuration.md)

All settings are in one private file: `testbraid-backend/config/app.json`. Edit it in a text editor, upload it back and reload the page. Nothing needs to be rebuilt. Upgrades never overwrite this file.

The supplied file looks like this:

```json
{
  "site": {
    "name": { "cs": "TestBraid", "en": "TestBraid" },
    "description": { "cs": "…", "en": "An application for creating and taking …" }
  },
  "uploads": { "maxImageSizeMiB": 10, "maxVideoSizeMiB": 64 },
  "uiLanguages": ["en", "cs"],
  "basePath": "/"
}
```

Keep the file valid JSON: quotes around texts, commas between entries and no comma after the last one. If the site stops loading after an edit, check the file first.

## Site name and description

`site.name` is shown as the website title and in the browser tab. `site.description` is the introduction on the home page.

Give one text per interface language (the language of the site's buttons and menus), as above. Visitors see the text for the language they choose. You can also use a single text for all languages:

```json
"name": "Our training tests"
```

## Interface languages

`uiLanguages` lists the languages offered for the site's buttons and menus (the *interface languages*). English (`en`) and Czech (`cs`) are supplied. To offer only one, list only that one: `["en"]`.

To add a language:

1. Copy `locales/en.json` from your public folder and translate the texts. Keep the keys on the left unchanged.
2. Upload it to the same `locales` folder as `<code>.json`, for example `locales/de.json`.
3. Add the code to `uiLanguages` and reload.

The interface language does **not** translate tests. Each test has its own content language, set by its author.

## Upload limits

`uploads.maxImageSizeMiB` and `uploads.maxVideoSizeMiB` set the largest image and video file allowed, in MiB. Your hosting's PHP limits (`upload_max_filesize` and `post_max_size`) may set a lower limit. Raising those is a hosting setting, not a TestBraid one. Limits apply to each file separately, see [Media library](media-library.md).

## Advanced: installation path and private folder location

Most sites never need to change these.

**`basePath`** is the address path where TestBraid runs. It is not a folder path on disk:

- `"/"` for `https://example.org/` (default).
- `"/courses/tests"` for `https://example.org/courses/tests/`.

It must match where in your public folder you put the contents of the ZIP's `www/`.

**Private folder location.** TestBraid looks for the private folder `testbraid-backend` next to the public folder. If your host needs a different place, copy `bootstrap.local.example.php` in your public folder to `bootstrap.local.php`. Set `backendPath` to the private folder's location on disk, relative to the folder that holds TestBraid's public files. Keep `bootstrap.local.php` during upgrades.

For routing or path problems, see [Troubleshooting](troubleshooting.md).
