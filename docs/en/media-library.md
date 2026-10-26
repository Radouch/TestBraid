# Media library

TestBraid stores uploaded images/videos independently of the tests using them. An author can select the same file in many questions, including questions in different lessons.

## 1. Open the library

Sign in and choose **Media library** in the application navigation (`/admin/media` under your installation's base URL). The library shows persistent uploaded files, not just uploads from the current editing session.

Use the available controls to:
- Filter by **home lesson**, by **unassigned** media or by **all lessons**.
- Filter by **images**, **videos** or all kinds.
- Search by the original filename.
- Preview files and inspect which tests reference them.
- Change a media item's home lesson or delete an unused item.

Media access and management require an author account.

## 2. Supported files

| Type | Accepted extensions | Default limit |
| --- | --- | --- |
| Images | `.jpg`/`.jpeg`, `.png`, `.webp` | 10 MiB |
| Videos | `.mp4`, `.webm` | 64 MiB |

Limits are configured in the private `app.json` and further constrained by PHP/web-server settings. The application checks the contents (MIME/signatures), not just the filename; images require recognizable dimensions and are limited to **24 megapixels**. File upload does **not** include antivirus scanning, video transcoding or complete video-codec validation.

For broad browser compatibility, use MP4 with H.264 video/AAC audio or commonly supported WebM codecs. Test actual playback and seeking on target devices. Large uploads may be limited by PHP request size, timeout or temporary disk space, even when `app.json` allows them.

See [Configuration](configuration.md) for custom upload limits.

## 3. Upload new media

Open the library, optionally choose a **home lesson**, and upload a file with the provided uploader. After a successful upload, its entry appears in the persistent library.

In the question editor, choosing **Image** or **Video** opens a media-selection dialog. You can select an existing compatible item or upload a new one there. The chooser initially emphasizes the current lesson but allows selection from another lesson or from unassigned media.

A new media block is attached only when a compatible item is selected or an upload succeeds. Canceling selection does not insert a new media block.

## 4. Home lessons are virtual folders

Every media item has **one optional home lesson** (`groupId` in metadata), but the file is stored in a common private media store. These assignments are **virtual**:

- Moving an item to another home lesson changes metadata, not its physical storage location.
- The same image/video may be referenced by any test regardless of home lesson.
- Selecting a lesson in the library filters the view; it does not grant or deny permission to reuse files.
- A media item may be unassigned.
- Deleting an empty lesson does not delete its media; its home-lesson association is removed.

For an installation with many lessons, assign media to the lesson where they are primarily created or maintained. This is only an organizational convention.

## 5. Find usages and safely delete items

The library indicates **which tests use** each item. Deletion is offered only for media that is **not referenced by any draft or published test**. A confirmation is required, and the server checks all test references again; concurrent changes can cause a deletion to be rejected.

If an item is in use, remove or replace **all** references from the relevant test questions, save the drafts, and return to the library. Unpublishing alone does not necessarily make a media item unused: unpublished drafts can still refer to it.

Removing a media block from a question does not delete the original file. Deleting an entire test likewise does not silently delete its media. These rules protect shared files from accidental loss.

## 6. Privacy and publication

Uploaded originals and metadata live in private backend storage. A signed-in author can preview them through authenticated API routes. TestBraid does not expose private uploaded originals simply because they exist in the library.

When a test is published, TestBraid prepares public static copies of its referenced media under `www/media/`. Anonymous users access the published copies through the test. Unpublishing cleans up copies no longer needed by any **other published** test, while the original private upload remains.

Do not put confidential media in tests intended for public publication. Content and answer keys in public tests are accessible to visitors; TestBraid is intended for self-assessment.

## 7. Troubleshooting media

If an upload fails, check format, dimensions, configured and effective limits, web PHP settings, available space and write permissions. If a preview works for the author but not for learners, check whether the test is published and whether the public `media/` directory retains the supplied Apache rules.

See [Troubleshooting](troubleshooting.md) and [Security and backups](security-and-backups.md).
