# Quick start

Install TestBraid on ordinary web hosting in about ten minutes. You only need to upload files and edit one small text file. No database, Node.js or command line is required.

**You need:** web hosting with Apache and PHP, HTTPS, and a way to upload files (SFTP or the hosting's file manager).

## 1. Download

Download `testbraid-vX.Y.Z-install.zip` from [GitHub Releases](https://github.com/Radouch/TestBraid/releases) and unpack it on your computer. Use the **install** ZIP for a new site. The **upgrade** ZIP is for updating a site that is already running.

The ZIP contains two folders:

| Folder | What it is | Where it goes |
| --- | --- | --- |
| `www/` | The public website | Into the folder your domain shows (often `www`, `public_html` or `htdocs`) |
| `testbraid-backend/` | The private part: settings, accounts, tests, uploaded files | **Next to** that folder, not inside it |

## 2. Upload

Your hosting should end up looking like this:

```text
your-hosting-account/
├── www/                  ← contents of the ZIP's www/ go here
└── testbraid-backend/    ← upload the whole folder here
```

- Upload the **contents** of the ZIP's `www/` into your public folder. Keep the hidden `.htaccess` files; some file managers hide them by default.
- Upload the **whole** `testbraid-backend/` folder next to your public folder, not inside it, so nobody can download your private files.

If your public folder has a different name, that is fine. If you cannot place `testbraid-backend/` next to it, or you install TestBraid into a subfolder such as `https://example.org/tests/`, see [Installation](installation.md).

## 3. Create the setup key

TestBraid has no public registration. You prove that you own the site with a one-time key:

1. Create a plain text file named `setup.key`.
2. Put **one line of at least 32 random characters** in it. A password generator from your password manager works well. Example format: `p8Q2vX7mLr4tZ9wKc3Nf6yHb1Jd5Sg0aE`. Do not reuse this example.
3. Upload it to `testbraid-backend/config/setup.key`.

## 4. Create your author account

1. Open `https://your-domain/admin`.
2. Enter the same key, a username and a password of at least 12 characters.
3. Sign in.

TestBraid deletes `setup.key` after the account is created. If the file is still there, delete it yourself.

## 5. Look around

A new installation has a published **demo lesson** with two short tests, including pictures and videos:

- Open your home page to take the demo tests as a visitor would.
- In `/admin`, open the demo tests to see how questions are built.

Once you know how it works, [remove the demo content](author-guide.md#remove-the-demo-content) and create your own tests. The [Author guide](author-guide.md) explains everything.

## 6. Name your site (optional)

Open `testbraid-backend/config/app.json` in a text editor and change the texts of `name` and `description` under `site`. There is one text per interface language. Upload it back and reload the page. See [Configuration](configuration.md) for other settings.

## Something does not work?

- **Blank page or "not found":** check that the hidden `.htaccess` files were uploaded. Then check that `testbraid-backend/` is next to your public folder.
- **Cannot save or delete anything:** PHP needs permission to write to `testbraid-backend/config/`, `testbraid-backend/storage/` and the public `media/` folder. Ask your hosting provider how to allow that. Do not use permission `777`.
- For more help, see [Troubleshooting](troubleshooting.md).

Before you rely on the site, read [Security and backups](security-and-backups.md). It explains which folders to back up.
