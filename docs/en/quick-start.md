# Quick start

**English** · [Čeština](../cs/quick-start.md)

Install TestBraid on ordinary web hosting in about ten minutes. You only upload files and create one small text file. You do not need a database, Node.js or a command line.

**You need:** web hosting with Apache and PHP, HTTPS, and a way to upload files to it (SFTP or your hosting's file manager).

## Words used in this guide

- **Site address:** the address people type into a web browser to open your site, for example `https://example.org`. Replace it with your own address everywhere below.
- **Public folder:** the folder on your hosting whose files anyone can open in a web browser at your site address. Your hosting provider chose its name. It is often `www`, `public_html`, `htdocs` or `web`. If you are not sure which folder it is, ask your hosting provider.
- **Private folder:** the `testbraid-backend` folder from the ZIP. It holds your settings, accounts, tests and uploaded files. It must **not** be inside the public folder, so that nobody can open it in a browser.
- **Setup key:** a secret text you make up once, to prove that you own the site when you create your first account.

## 1. Download

Download `testbraid-vX.Y.Z-install.zip` from [GitHub Releases](https://github.com/Radouch/TestBraid/releases) and unpack it on your computer. Use the **install** ZIP for a new site. The **upgrade** ZIP is only for updating a site that is already running.

The ZIP contains two folders:

| Folder in the ZIP | What it is | Where it goes on your hosting |
| --- | --- | --- |
| `www/` | The website itself | Its **contents** go into your public folder, whatever that folder is called |
| `testbraid-backend/` | The private folder | The **whole folder** goes next to your public folder, not inside it |

The ZIP's folder is named `www` only as a placeholder. It does not matter if your public folder has another name.

## 2. Upload

For example, if your public folder is called `public_html`, your hosting should end up like this:

```text
your-hosting-account/
├── public_html/          ← your public folder: put the CONTENTS of the ZIP's www/ here
│   ├── index.php
│   ├── api/
│   ├── media/
│   └── …
└── testbraid-backend/    ← the private folder: upload the WHOLE folder here
```

- Upload everything that is **inside** the ZIP's `www/` folder into your public folder. Do not upload the `www` folder itself. Include the hidden `.htaccess` files; some file managers do not show them unless you turn that on.
- Upload the **whole** `testbraid-backend` folder next to your public folder, as shown above.

If you cannot put the private folder next to your public folder, or you want TestBraid at an address such as `https://example.org/tests/`, see [Installation](installation.md).

## 3. Create the setup key

TestBraid has no public registration. Instead, you put a setup key on the server, where only you can upload files:

1. On your computer, create a plain text file named `setup.key`.
2. Type or paste **one line of at least 32 random characters** into it. This line is your setup key. A password generator works well. Example of the format: `p8Q2vX7mLr4tZ9wKc3Nf6yHb1Jd5Sg0aE`. Do not use this example.
3. Upload the file into the `config` folder inside the private folder, so it ends up at `testbraid-backend/config/setup.key`.

Keep the setup key at hand. You need it in the next step.

## 4. Create your author account

An **author account** is the account you sign in with to create and edit tests. Visitors who take tests do not need an account.

1. Open `https://example.org/admin` (your site address followed by `/admin`).
2. Fill in the form:
   - **Username:** any name you choose. Use letters without accents, digits, dots, dashes or underscores, and no spaces.
   - **Password:** any password you choose, at least 12 characters long.
   - **One-time setup key:** paste the setup key from step 3.
3. Select **Create first author**. You are now signed in. Next time, sign in at the same address with the username and password you chose.

The setup key works only once. After your account is created, TestBraid deletes `setup.key` from the private folder. If the file is still there, delete it yourself. Remember your username and password: there is no "forgot password" link.

## 5. Look around

A new installation contains a **demo lesson** with two short tests, including pictures and videos. They are already published, so everyone can see them:

- Open your site address to take the demo tests as a visitor would.
- Sign in at `https://example.org/admin` and open the demo tests to see how the questions are built.

Once you know how it works, [remove the demo content](author-guide.md#remove-the-demo-content) and create your own tests. The [Author guide](author-guide.md) explains everything.

## 6. Name your site (optional)

Open `testbraid-backend/config/app.json` in a text editor. Under `site`, change the texts of `name` (your site's title) and `description` (the text on the home page). There is one text for each language the site's buttons and menus are offered in. Upload the file back and reload your site. See [Configuration](configuration.md) for other settings.

## Something does not work?

- **Blank page or "not found":** check that the hidden `.htaccess` files were uploaded into your public folder. Then check that the `testbraid-backend` folder is next to your public folder, not inside it.
- **Cannot save or delete anything:** the website needs permission to change files in `testbraid-backend/config`, `testbraid-backend/storage` and the `media` folder inside your public folder. Ask your hosting provider how to allow PHP to write there. Do not set permissions to `777`.
- For more help, see [Troubleshooting](troubleshooting.md).

Before you rely on the site, read [Security and backups](security-and-backups.md). It explains which folders to back up.
