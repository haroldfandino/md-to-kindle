# md-to-kindle

Send a note or supported document from Obsidian to your Kindle through your own email account. Notes become reflowable EPUBs with heading navigation and local images. Every send starts with a preview and requires a click on **Send**.

Desktop only: Windows, macOS, and Linux. Requires Obsidian **1.11.4+** and an SMTP account that accepts an app password or password authentication. No hosted service or subscription is required by this plugin.

> **Required before sending:** add the email account connected to md-to-kindle to Amazon's **Approved Personal Document E-mail List**. Use your **sender email**, not your `@kindle.com` recipient. Amazon will not accept documents from an unapproved sender, even if **Test connection** succeeds.

## Install

Until a community-directory listing is approved:

1. Download and extract `md-to-kindle-0.2.0.zip`.
2. Copy its `md-to-kindle` folder into `<vault>/<config-dir>/plugins/`. The default configuration directory is `.obsidian`.
3. Open Obsidian → Settings → Community plugins. Enable community plugins if needed, then enable **md-to-kindle**. Restart Obsidian if it does not appear.
4. Open the plugin settings and configure your recipient and email account.

Developers can run `npm ci && npm run release` to create the archive. On Windows, the included installer copies the release files into a specified vault:

```powershell
powershell -File .\scripts\install.ps1 -VaultPath 'C:\path\to\vault'
```

For a custom Obsidian configuration folder, add `-ConfigDir '.my-obsidian'`. Existing email settings are preserved. A local developer recipient preset, when present, can be applied with `-UseLocalRecipient`; that preset is excluded from source control and public releases.

Version 0.1.1 renames the plugin and its ID to **md-to-kindle**. If you installed version 0.1.0 under `kindle-courier`, disable that plugin, install the new folder, and copy its `data.json` into `md-to-kindle` before enabling the new plugin to preserve your settings. This migration is unnecessary for a fresh installation.

## Automatic setup across vaults on Windows

Version 0.2.0 adds an optional **Windows background helper** with one shared email profile. The standard plugin still works on Windows, macOS, and Linux; the automatic helper currently requires Windows and Node.js 22+.

1. Update md-to-kindle in the vault where sending already works and reload the plugin.
2. In **Settings → md-to-kindle**, click **Share this setup on this computer**. The linked app password is transferred directly into a Windows-protected local profile, without entering it again.
3. Extract `md-to-kindle-helper-0.2.0.zip` and run `powershell -File .\scripts\install-helper.ps1` from its folder. The same command works in this source project after `npm run release`.

The helper starts silently now and at Windows sign-in. It discovers current and future vaults from Obsidian's registry and installs only md-to-kindle. Vaults must allow community plugins; the helper does not change Restricted Mode. Already-open vaults may need one reload to discover the new plugin. Each Windows user/computer needs its own profile.

You can exclude vaults, pause the helper, or stop it with `powershell -File .\scripts\stop-helper.ps1 -DisableStartup`. Original vault settings and other plugins are preserved. The helper does not send email, read notes, decrypt passwords, or download updates. Shared-mode settings apply to all participating vaults; **Use vault-only settings** restores a vault's previous setup.

See [automatic setup, exclusions, updates and uninstall instructions](docs/AUTOMATIC_SETUP.md) for details.

## Configure email

1. Find your **Send to Kindle email address** in [Amazon’s personal document settings](https://www.amazon.com/hz/mycd/myx#/home/settings/payment).
2. Enter it in md-to-kindle’s **Kindle email** field. Public installations start with an empty recipient.
3. Add your exact **sender email address** to Amazon’s **Approved Personal Document Email List**.
4. Enter the sender, SMTP host, port, username, and TLS mode provided by your email service.
5. Select or create your app password using the **App password** Keychain selector. The plugin saves only the secret’s name.
6. Click **Test connection**. This authenticates without sending mail; it cannot check your Amazon approval list or delivery.

### Approve your connected email in Amazon

1. Sign in to the Amazon account that owns your Kindle and open **Manage Your Content and Devices**.
2. Select **Preferences**, then expand **Personal Document Settings**.
3. Under **Approved Personal Document E-mail List**, choose **Add a new approved e-mail address**.
4. Enter the exact email address configured as **Sender email** in md-to-kindle, then save it. For example, if you connected a Gmail account, approve that Gmail address.
5. Confirm that the sender appears in the approved list before sending your first note.

You approve the **sending account** here; your Kindle address belongs in the separate **Send-to-Kindle E-Mail Settings** section. If you change the connected sender later, approve the new address as well. A successful SMTP connection test confirms access to your email provider, not Amazon's approval. See [Amazon's email requirements](https://digprjsurvey.amazon.co.uk/csad/help/node/G7NECT4B4ZWHQ8WV).

For Gmail: use `smtp.gmail.com`, port `587`, **Required STARTTLS**, and your full Gmail address as the username. Create an [app password](https://support.google.com/accounts/answer/185833) after enabling 2-Step Verification. Some managed accounts and security configurations prohibit app passwords. This release does not offer OAuth sign-in; use another SMTP account if yours requires it. Port `465` with **Implicit TLS** is also supported when your provider specifies it. Certificate validation cannot be disabled.

In vault-only mode, passwords are accessed through Obsidian's Keychain only for an explicit send, connection test, or sharing action. In shared mode, the plugin unlocks the Windows-protected profile for sends/tests. The helper itself does not read or decrypt passwords. Shared profiles are not synced by the plugin. Configure the secret/profile on each device where needed.

## Send

- Open a note and use **md-to-kindle: Send current note** in the command palette. The current editor text is exported, including edits not yet saved to disk.
- Use **md-to-kindle: Choose file to send**, or right-click a supported file and choose **Send to Kindle**.
- Review the filename, attachment size, recipient, and warnings. A converted note has an expandable EPUB preview. Existing files are attached unchanged and are not rendered in the dialog.
- Click **Send**. Editing the recipient in the dialog changes only that send; update the default in settings.

“Submitted to your email provider” means your SMTP server accepted the message. Amazon may require email verification, reject a document, or take time to process it. Check your sender mailbox and sync your Kindle while it is connected to the internet. The plugin cannot confirm delivery to the device and does not retry automatically.

## Supported content and limits

Notes retain paragraphs, headings, lists, block quotes, tables, code, external links, and local PNG/JPEG/GIF images referenced with Markdown or `![[image.png]]`. A table of contents links to headings. Frontmatter and `%%` comments are excluded; comment-like text inside code is preserved. Titles use note filenames.

Vault links become readable labels. Embedded notes, unsupported images, missing images, remote images, Mermaid, Dataview, and query blocks are omitted with warnings. Math remains source text. Raw HTML is sanitized; use Markdown for images. Other plugins are never executed during export. There is no recursive note export or multi-note ebook builder.

Existing files: EPUB, PDF, TXT, HTML/HTM, RTF, JPEG/JPG, PNG, GIF, and BMP. Markdown is converted; MOBI and arbitrary files are not accepted. Existing files are passed through unchanged, so the sender remains responsible for choosing a valid, unencrypted document that Amazon can process. See [Amazon’s supported formats](https://digprjsurvey.amazon.co.uk/csad/help/node/G5WYD9SAF7PGXRNA).

One attachment is sent per email. Default limit: **20 MB**, configurable from **1 to 50 MB** (decimal units). Base64 email encoding adds roughly one third to attachment size. Your provider may reject messages below Amazon’s attachment limit; lower the plugin limit or reduce the document. To bound memory use, note source text plus embedded image bytes must also fit your configured limit before compression. Generated attachments remain in memory and are released after the preview is closed and any pending send finishes. No archive splitting or ZIP workaround is used. See [Amazon’s email requirements](https://digprjsurvey.amazon.co.uk/csad/help/node/G7NECT4B4ZWHQ8WV).

## Privacy

Conversion happens locally. For sends, the selected document and its supported embedded local images go through your configured email provider to Amazon. Existing HTML/EPUB files are not sanitized or modified. Vault-only settings and secret references are stored in this plugin's `data.json`; these may be included by vault backup or sync tools. Shared settings and the encrypted password are stored outside vaults in the Windows user's local application-data directory. Original vault settings are retained for rollback. No password, note content, or raw SMTP response is logged by the plugin.

There is no analytics, telemetry, advertising, hosted relay, whole-vault upload, or background sending. Normal operation makes network connections only to the user-configured SMTP server (and normal DNS resolution). Setup links open Amazon or Google in a browser when clicked. Obsidian and email-provider account requirements, costs, and limits apply independently.

The optional helper reads registered vault paths and writes md-to-kindle assets, its profile-mode flag, and the existing enabled-plugin list. It never reads notes. The shared-profile feature accesses files outside the current vault and invokes Windows password protection through a fixed, hidden PowerShell process. The encrypted password is protected for the current Windows user; other programs running as that user can access it. No plaintext fallback is used.

## Development

Use Node.js 22 or newer:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run samples
npm run release
```

`npm run dev` rebuilds when source changes. `main.js` is bundled for Obsidian’s CommonJS plugin loader; all runtime dependencies except the host-provided `obsidian` API are included. `dist/` contains installable assets and checksums; generated files and `.local/` are ignored by Git. Tests use a local SMTP server with verified test certificates and an Obsidian API double. They do not send external email.

See [CONTRIBUTING.md](CONTRIBUTING.md), [release preparation](docs/RELEASING.md), [verification instructions](docs/VERIFICATION.md), and [recorded validation results](docs/VALIDATION.md).

## License

MIT. Bundled dependency license texts are included in `THIRD_PARTY_NOTICES.md`. Kindle and Obsidian are trademarks of their respective owners; this is an independent community tool.
