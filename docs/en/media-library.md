# Media library

**English** · [Čeština](../cs/media-library.md)

The media library stores images and videos for reuse in any test. Sign in and open **Media library** (`/admin/media`).

## Upload files

The library accepts **JPEG, PNG and WebP images** and **MP4 and WebM videos**. File-size limits are configured by the site operator and may also be restricted by the hosting provider.

To upload several files:

1. Choose a **Media lesson** if you want the files organized under a particular lesson.
2. Select or drop **multiple images and videos**.
3. Click **Upload selected files** once to start the batch.
4. Review the result. Successfully uploaded files stay available even if others fail; retry failed files as needed.

Each file is uploaded and checked **separately**. Selecting several files does not combine them into one large server request. Limits apply per file.

The uploader inside a **test question** works differently: it attaches and uploads **one file at a time**. For bulk preparation, upload files into the library first and then select them when editing questions.

## Organize and find media

Media can be assigned to one **media lesson**, or left unassigned. This acts like a virtual folder: changing the lesson does **not** move the file or restrict where it can be used. A test may use media assigned to another lesson.

Filter by lesson and file type, or search for part of the original filename. The library also shows which tests use each item.

## Reuse and deletion

The same media item can appear in several questions and tests without uploading the original again.

You may delete a media item only when **no draft or published test references it**. Removing a media block from a question does not automatically delete the file. If the item is still in use, replace or remove its references in the relevant tests first.

## Private and published media

Uploaded originals are stored in the **private folder** (`testbraid-backend`). Authors can preview them while signed in. When a test is published, copies of its referenced media become available to its learners. Public copies no longer used by any published test can be cleaned up, while private originals remain.

For upload limits, see [Configuration](configuration.md). For hosting issues, see [Troubleshooting](troubleshooting.md).
