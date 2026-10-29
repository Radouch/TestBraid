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
www/                       Public website files
testbraid-backend/         Private part, never served directly
├── config/app.json        Settings you may edit
├── storage/               Lessons, tests and uploaded originals (starts with the demo lesson)
├── vendor/                PHP libraries
├── templates/index.html   Page template that belongs to the files in www/assets/
└── …                      Application code
```

The install package also contains a published demo lesson. Its files are in `testbraid-backend/storage/` and `www/media/`. See [Author guide](author-guide.md#remove-the-demo-content) for how to remove it.

## Where to put the files

Upload the **contents** of `www/` into the folder your domain serves (the *public folder*, often `www`, `public_html` or `htdocs`). Upload `testbraid-backend/` **outside** that folder. By default TestBraid expects it right next to the public folder:

```text
hosting-account/
├── www/                   # public folder
└── testbraid-backend/     # private, next to it
```

Keep all hidden `.htaccess` files.

PHP must be able to write to the private `config/` and `storage/` folders and to the public `media/` folder. On most shared hosting, files uploaded with your account are already writable by PHP. Otherwise ask your provider. Never use blanket permissions such as `777`.

### Backend in a different place

If the private folder cannot sit next to the public folder, copy `www/bootstrap.local.example.php` to `www/bootstrap.local.php`. Set its `backendPath` to the private folder's location on disk, written relative to the public application folder. See [Configuration](configuration.md#advanced-installation-path-and-backend-location).

### Installing into a subfolder

To run TestBraid at an address such as `https://example.org/courses/`, put the `www/` contents into that subfolder. Set `basePath` in `testbraid-backend/config/app.json` to `"/courses"`. The default `"/"` means the domain root. The same files work for both.

## Create the first author

TestBraid has no public registration. The first author account is created with a one-time key:

1. Create a text file `testbraid-backend/config/setup.key` containing one line of **32–256 random characters**.
2. Open `/admin` on your site.
3. Enter the key, a username and a password of at least **12 characters**.
4. Sign in. The key file is deleted automatically. Delete it yourself if it is still there.

After the first author exists, this browser setup is disabled. The account is stored in the private `config/authors.json` with a hashed password. Do not delete that file to "reset" access. Further accounts can be created by an operator with SSH access, see [Security and backups](security-and-backups.md#protect-author-accounts).

## Check the installation

1. Open the home page. The demo lesson should be listed.
2. Open `/api/health` on your site. It should return a short JSON message, not a web page.
3. Sign in at `/admin`, open a demo test and try **Preview**.
4. Take a demo test from the public home page and check that images and videos play.
5. Make sure private files are **not** reachable from the web. The author area has an **installation security** check that helps with this. A passing check only proves that the tested address is protected, not every possible address.

Next: [Configuration](configuration.md) · [Author guide](author-guide.md) · [Security and backups](security-and-backups.md).
