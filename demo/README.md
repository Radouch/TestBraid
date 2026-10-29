# Demo content

This folder holds the demo content that every **install** package ships with: an English lesson with a choice test ("Shapes and colours") and a matching test ("Match the pairs"), and a Czech lesson with the same two tests translated ("Tvary a barvy", "Spoj dvojice"). All four tests share the same pictures and short videos.

There is one lesson per language because the home page lists only tests whose content language matches the interface language the visitor chose.

`storage/` has exactly the layout of a running installation's private `testbraid-backend/storage/`:

| Path | Contents |
| --- | --- |
| `groups/<id>.json` | The two lessons (English and Czech) |
| `tests/<id>.json` | The four tests, already `published` |
| `media/<id>.json` | Image and video metadata (`sizeBytes` must equal the file size) |
| `media-files/<id>.<ext>` | The image and video files |

`scripts/prepare-deployment.mjs --initial-install` copies `storage/` into the private backend and the media files into the public `www/media/`, as publication would have done. Upgrade packages never include any of it.

## GitHub Pages demo

The same lessons also run as a read-only demo on GitHub Pages. `pages/app.json` holds that site's name and introduction, in the same format as an installation's `config/app.json`. See [Development](../docs/en/development.md#github-pages-demo) for how it is built.

## Changing the demo

- Edit the test or lesson JSON directly. IDs of lessons, tests and media must be UUIDv4 values. Question, answer and block IDs only need to be unique where the schemas require.
- Keep the English and Czech tests in step: a change to one test belongs in its counterpart in the other language too.
- To change the pictures or videos, edit and run `generate-media.py` (needs Python with Pillow, and ffmpeg). It rewrites `media-files/` and `media/`.
- Run `composer run test:demo` in `backend/`. It validates everything against the schemas and publication rules and checks that the demo can be unpublished and removed.

## Licence

The demo texts, pictures and videos were made for this project and are dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Site owners may keep, change or delete them freely.
