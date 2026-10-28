# Installation

This guide is for installing TestBraid on ordinary Apache/PHP web hosting. Use a **prebuilt release package**: you do not need Node.js, Composer or a database on the server.

## Requirements

- Apache hosting with working \`.htaccess\` rules and URL rewriting.
- PHP compatible with the release's dependencies, with file uploads, sessions and \`fileinfo\` enabled. Check the [current backend requirements](../../backend/composer.json) and release notes for compatibility details.
- HTTPS, SFTP (or a hosting file manager), and permission to create private writable directories.
- Space for original uploads and public copies of published media.

The supplied hosting rules are for **Apache**. Other web servers need equivalent configuration.

## Download and upload

Download the **install ZIP** from [GitHub Releases](https://github.com/Radouch/TestBraid/releases). The archive contains a ready-built frontend and PHP dependencies, split into two folders:

\`\`\`text
www/                 Public files (the actual folder name depends on your host)
testbraid-backend/   Private application, settings, tests and original media
\`\`\`

Upload the contents of \`www/\` into the directory served by your domain, and \`testbraid-backend/\` **outside that public directory**. Keep hidden \`.htaccess\` files. Do not make private configuration, author accounts or \`storage/\` accessible from the web.

A typical layout is:

\`\`\`text
hosting-account/
├── www/                        # Apache document root
└── testbraid-backend/          # Private; outside the document root
    ├── config/app.json
    ├── vendor/
    ├── templates/index.html
    └── storage/                 # Created as needed
\`\`\`

PHP needs write access to the private \`config/\` and \`storage/\` directories and to the public \`media/\` directory. Use appropriate ownership/permissions, **not** blanket permissions such as \`777\`.

## Configure the application address

The private \`testbraid-backend/config/app.json\` contains \`basePath\`:

- \`"/"\` for \`https://example.org/\`.
- \`"/courses"\` for \`https://example.org/courses/\`.

The same prebuilt frontend works at either address. For a backend not located in the default sibling directory, copy \`www/bootstrap.local.example.php\` to \`www/bootstrap.local.php\` and configure its \`backendPath\` to point to the actual **private filesystem directory**. See [Configuration](configuration.md).

## Create the first author

TestBraid does not allow public registration.

1. Generate a random secret of at least **32 characters** and upload it as \`testbraid-backend/config/setup.key\` (a plain-text file in the **private** backend).
2. Open your installation's \`/admin\` page.
3. Create an author using a username, a password of at least **12 characters**, and the same setup key.
4. Sign out and back in. The key should be deleted automatically; remove it via SFTP if it remains.

The author account is stored privately, with a password hash. Do not delete the account file to reset access.

## Verify the installation

Open the home page and the \`/api/health\` endpoint under the installed URL. Sign in, create a lesson and test, and try a preview. Publish a complete test and verify its public link and media playback.

Finally, confirm that private backend files **cannot** be fetched over HTTP. The author area's installation security check can help, but a successful check of one address is not proof that every possible address is protected.

Next: [Configuration](configuration.md) · [Author guide](author-guide.md) · [Security and backups](security-and-backups.md).
