# Demo content

This folder holds the demo lesson that every **install** package ships with: one lesson, a choice test ("Shapes and colours") and a matching test ("Match the pairs"), using pictures and short videos.

`storage/` has exactly the layout of a running installation's private `testbraid-backend/storage/`:

| Path | Contents |
| --- | --- |
| `groups/<id>.json` | The lesson |
| `tests/<id>.json` | The two tests, already `published` |
| `media/<id>.json` | Image and video metadata (`sizeBytes` must equal the file size) |
| `media-files/<id>.<ext>` | The image and video files |

`scripts/prepare-deployment.mjs --initial-install` copies `storage/` into the private backend and the media files into the public `www/media/`, as publication would have done. Upgrade packages never include any of it.

## Changing the demo

- Edit the test or lesson JSON directly. IDs of lessons, tests and media must be UUIDv4 values. Question, answer and block IDs only need to be unique where the schemas require.
- To change the pictures or videos, edit and run `generate-media.py` (needs Python with Pillow, and ffmpeg). It rewrites `media-files/` and `media/`.
- Run `composer run test:demo` in `backend/`. It validates everything against the schemas and publication rules and checks that the demo can be unpublished and removed.

## Licence

The demo texts, pictures and videos were made for this project and are dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Site owners may keep, change or delete them freely.
