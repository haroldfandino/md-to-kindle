# Standalone Markdown sender

**md-to-kindle 0.4.0** is an app you open when you want to read your Markdown documents on Kindle. Choose files or browse a folder, select the documents you want, review their EPUB previews and click Send. Each document is sent in a separate email with one attachment. Obsidian does not need to be running.

The standalone app does not install Explorer/Finder actions, file associations, background services or sign-in startup. Updating removes older desktop context-menu actions. The Obsidian plugin remains version 0.3.0 and its existing features/settings are preserved.

## Install on Windows

Extract `md-to-kindle-0.4.0-win-x64.zip` and keep all of its app files together. Obtain the installer and cleanup script from the same build artifact or source checkout, then run in a normal Windows PowerShell session:

```powershell
powershell -File .\scripts\install-standalone.ps1 -AppFolder 'C:\path\to\extracted\app'
```

Developers can omit `-AppFolder` after packaging; the default is `dist/standalone/win-unpacked`. The app is installed in `%LOCALAPPDATA%\Programs\md-to-kindle`, with Start-menu and desktop shortcuts. Keep `remove-legacy-desktop.ps1` beside the installer. Close the app before updating.

Open **md-to-kindle** from Start or the desktop. The app reuses your protected global email profile on the same Windows account, including the app password. If that profile does not exist, enter your email settings in the app. No private addresses or credentials are preset in public builds.

To remove remaining older hooks separately:

```powershell
powershell -File .\scripts\remove-legacy-desktop.ps1
```

If you also want to stop the optional Obsidian all-vault helper and remove its sign-in startup, add `-RemoveHelperStartup`. This preserves installed vault plugins and email settings, but stops automatic enrollment of new vaults. The GUI installer does not disable that optional Obsidian helper by default.

`uninstall-standalone.ps1` removes app shortcuts and legacy hooks while preserving the app folder and protected email profile. Delete the app folder yourself after closing it if you want to remove its files entirely.

## Install on macOS

Use `md-to-kindle-0.4.0-mac-arm64.zip` for Apple Silicon or `md-to-kindle-0.4.0-mac-x64.zip` for Intel. Extract the app and run the installer from the same artifact/source checkout:

```sh
zsh scripts/install-standalone-mac.sh '/path/to/md-to-kindle.app'
```

Open **md-to-kindle** from `~/Applications` or Spotlight. The installer removes the old Send to Kindle Quick Action, including the disabled backup, and unregisters old app file associations before updating. Keep `remove-legacy-desktop-mac.sh` beside the installer. Neither version starts at sign-in.

Configure the email account on that Mac. The password is protected by macOS Keychain through Electron safeStorage. Windows profiles cannot be copied to a Mac. Current packages are unsigned/not notarized, so macOS may require you to approve the app before opening it. The installer does not change system security settings.

To remove legacy actions separately, run `zsh scripts/remove-legacy-desktop-mac.sh`. This preserves the app and protected profile.

## Choose, review and send

1. Click **Choose files** for one or more `.md`/`.markdown` files, or **Choose folder** to list a folder's Markdown documents. Enable **Include subfolders** before choosing the folder if needed. Hidden folders, dependency folders and symbolic links are skipped. Browsing a folder does not send any files.
2. Use the checkboxes to choose documents. Folders with multiple documents start with none selected. You can browse up to 500 documents and select up to 200 at a time.
3. Click **Review selected**. The app converts only those documents and shows attachment sizes, conversion warnings and readable EPUB previews. Click a document name to switch previews.
4. Check the **Kindle email** and sender, then click **Send to Kindle** or **Send N documents**. Each document is submitted separately; progress and outcomes appear beside its filename.

Success means **Submitted to your email provider**, not confirmed Kindle delivery. Amazon may ask you to verify the email. A failure stops the batch; submitted files are not sent again, the attempted file is blocked, and unattempted documents remain ready. Check your mailbox before choosing a failed file again, since submission may be uncertain. There is no automatic retry.

The app reads saved file contents, so unsaved editor changes are not included. The reviewed EPUB bytes are kept in memory and sent unchanged even if the source changes afterward. Changing the selection or saved email settings requires a new review. The default attachment limit is 20 MB per document, configurable up to 50 MB; provider limits may be lower. The in-memory review budget is 100 MB for the selection.

Local PNG/JPEG/GIF images are supported, including vault-root paths and unique image filenames inside a default Obsidian vault. Missing, remote, unsafe, ambiguous and unsupported images are omitted with warnings. Linked notes and dynamic plugins are not executed or followed. Files must be UTF-8 Markdown. Folder browsing is bounded and does not follow linked directories.

## Connect your email and approve it in Amazon

Use **Email settings** to configure the Kindle recipient, sender, SMTP host, username, port, TLS mode and app password. For Gmail, use `smtp.gmail.com`, port `587`, Required STARTTLS and a Google app password created with 2-Step Verification. Spaces in Google's grouped app password are removed automatically. Leave the password blank to retain the saved one. **Test saved connection** authenticates without sending email.

**Required:** add the exact connected **sender email** to Amazon's **Approved Personal Document E-mail List**. Open Manage Your Content and Devices → Preferences → Personal Document Settings → Approved Personal Document E-mail List → Add a new approved e-mail address. Approve the sender, not the Kindle recipient. A successful SMTP test does not check Amazon approval.

Conversion is local. The chosen documents and supported embedded images travel through your email provider to Amazon only when you click Send. The renderer cannot access passwords, execute note scripts or open note links. Password protection remains in the main process. There is no telemetry, hosted backend, whole-folder upload, automatic sending or background watcher in this app.

## Build

```sh
npm ci
npm run typecheck
npm test
npm run release
npm run standalone:package:win
```

On macOS, use `npm run standalone:package:mac` to build both architectures. `npm run standalone:dev` opens the development GUI. The manual **Build standalone desktop apps** GitHub Actions workflow builds both platforms and uploads artifacts without publishing a release.

`standalone/version.json` controls the GUI version independently of the unchanged Obsidian manifest. Tests cover folder discovery, explicit selection, previews, per-document attachment construction, reviewed-byte preservation, partial failure, duplicate-send prevention, protected profile reuse and safe legacy cleanup.
