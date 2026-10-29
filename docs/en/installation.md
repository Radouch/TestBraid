# Installation

This is the full installation reference. For the usual case, follow the shorter [Quick start](quick-start.md).

## Requirements

- Web hosting with **Apache** that honours `.htaccess` files and URL rewriting (`mod_rewrite`). Other web servers need equivalent rules written by hand.
- **PHP** with file uploads, sessions and the `fileinfo` extension enabled. The supported PHP versions follow the release's dependencies. See the release notes and [`backend/composer.json`](../../backend/composer.json).
- **HTTPS.** Sign-in cookies are secure-only.
- **SFTP** or a file manager, and permission to create folders outside the public web folder.
- Enough disk space for your images and videos. Published media is stored twice: a private original and a public copy.

You do **not** need a database, Node.js or Composer on the server. The release ZIP is ready-built.

## Install package

Download `testbraid-vX.Y.Z-install.zip` from [GitHub Releases](https://github.com/Radouch/TestBraid/releases). It contains:

```text
www/                       Website files; their contents go into your public folder
testbraid-backend/         The private folder, never opened by browsers
├── config/app.json        Settings you may edit
├── storage/               Lessons, tests and uploaded originals (starts with the demo lesson)
├── vendor/                PHP libraries
├── templates/index.html   Page template that belongs to the files in assets/
└── …                      Application code
```

The install package also contains a published demo lesson. Its files are in `testbraid-backend/storage/` and in the `media` folder of the public folder. See [Author guide](author-guide.md#remove-the-demo-content) for how to remove it.

## Where to put the files

The **public folder** is the folder on your hosting whose files anyone can open in a web browser at your site address. Your hosting provider chose its name, often `www`, `public_html`, `htdocs` or `web`. The ZIP's `www` is just a placeholder name.

Upload the **contents** of the ZIP's `www/` into your public folder. Upload the whole `testbraid-backend` folder (the **private folder**) **outside** it. By default TestBraid expects it right next to the public folder, for example:

```text
hosting-account/
├── public_html/           # your public folder, with the contents of the ZIP's www/
└── testbraid-backend/     # the private folder, next to it
```

Keep all hidden `.htaccess` files.

PHP must be able to write to the `config` and `storage` folders in the private folder and to the `media` folder in the public folder. On most shared hosting, files uploaded with your account are already writable by PHP. Otherwise ask your provider. Never use blanket permissions such as `777`.

### Private folder in a different place

If the private folder cannot sit next to the public folder, copy `bootstrap.local.example.php` in your public folder to `bootstrap.local.php`. Set its `backendPath` to the private folder's location on disk, written relative to the folder that holds TestBraid's public files. See [Configuration](configuration.md#advanced-installation-path-and-private-folder-location).

### Installing into a subfolder

To run TestBraid at an address such as `https://example.org/courses/`:

1. Put the contents of the ZIP's `www/` into a `courses` folder inside your public folder.
2. Keep the private folder **outside** the public folder, for example next to it as usual.
3. TestBraid looks for the private folder next to the folder that holds its public files, which is now `courses`. That place is inside your public folder, so you must tell it where the private folder really is. Copy `courses/bootstrap.local.example.php` to `courses/bootstrap.local.php` and set `backendPath` to `'../../testbraid-backend'` (up from `courses`, up from the public folder, then into the private folder).
4. Set `basePath` in `testbraid-backend/config/app.json` to `"/courses"`. The default `"/"` means TestBraid runs at the site address itself.

```text
hosting-account/
├── public_html/              # your public folder
│   └── courses/              # contents of the ZIP's www/, plus bootstrap.local.php
└── testbraid-backend/        # the private folder
```

## Create the first author

TestBraid has no public registration. The first author account is created with a one-time **setup key**:

1. Create a text file `testbraid-backend/config/setup.key` containing the setup key: one line of **32–256 random characters**.
2. Open `/admin` on your site.
3. Choose any username (letters without accents, digits, `.`, `_` or `-`; no spaces) and any password of at least **12 characters**, and enter the setup key.
4. Select **Create first author**. You are signed in, and `setup.key` is deleted automatically. Delete it yourself if it is still there.

After the first author exists, this browser setup is disabled. The account is stored in the private `config/authors.json` with a hashed password. Do not delete that file to "reset" access. Further accounts can be created by an operator with SSH access, see [Security and backups](security-and-backups.md#protect-author-accounts).

## Check the installation

1. Open the home page. The demo lesson should be listed.
2. Open `/api/health` on your site. It should return a short JSON message, not a web page.
3. Sign in at `/admin`, open a demo test and try **Preview**.
4. Take a demo test from the public home page and check that images and videos play.
5. Make sure private files are **not** reachable from the web. The author area has an **installation security** check that helps with this. A passing check only proves that the tested address is protected, not every possible address.

Next: [Configuration](configuration.md) · [Author guide](author-guide.md) · [Security and backups](security-and-backups.md).
