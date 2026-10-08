# Send Markdown from Explorer or Finder

The standalone md-to-kindle app converts a saved `.md` or `.markdown` file to EPUB and opens a review window. It runs independently of Obsidian. No file is emailed until you click **Send to Kindle** in that window. Each send contains one attachment.

## Windows Explorer

1. Extract the Windows standalone app ZIP. It contains `md-to-kindle.exe` and its supporting files; keep the entire folder together.
2. Obtain `scripts/install-standalone.ps1` from the source checkout/build artifact and run:

```powershell
powershell -File .\scripts\install-standalone.ps1 -AppFolder 'C:\path\to\extracted\app'
```

Developers who packaged the app locally can omit `-AppFolder`; the installer uses `dist/standalone/win-unpacked`.

The app is copied into `%LOCALAPPDATA%\Programs\md-to-kindle`. The installer adds a per-user Explorer verb for `.md` and `.markdown`, plus a Start-menu shortcut. Your default Markdown editor is preserved. On Windows 11, use **Right-click → Show more options → Send to Kindle**. On Windows 10 the entry appears in the regular context menu. One selected file is accepted at a time.

Keep `register-explorer.ps1` beside `install-standalone.ps1`; the installer uses it to register the menu. The registration includes a Markdown-filtered file verb plus extension and active-handler keys, and notifies Explorer that associations changed. It does not replace the existing editor's Open command.

If the entry is missing after an older installation, repair it without closing the sender or reinstalling the app:

```powershell
powershell -File .\scripts\register-explorer.ps1
```

Close any already-open context menu and right-click again after repair. Select a single `.md` or `.markdown` file. No Explorer process restart is performed.

On the same Windows account, the standalone app automatically reuses the protected global email profile configured through Obsidian. Neither Obsidian nor the all-vault background helper has to be running to send a file. If no global profile exists, the standalone app offers its own email setup.

To remove the Explorer menu and shortcut, run `scripts/uninstall-standalone.ps1`. App files and the shared profile are preserved, so uninstalling the context menu does not break Obsidian or its helper. Close the standalone app before installing an update.

## macOS Finder

Use the Mac app ZIP for your architecture: `arm64` for Apple Silicon or `x64` for Intel. Extract it to obtain `md-to-kindle.app`, then run the provided installer from this source checkout or the matching build artifact:

```sh
zsh scripts/install-standalone-mac.sh '/path/to/md-to-kindle.app'
```

It installs the app into `~/Applications` and **Send to Kindle.workflow** into `~/Library/Services`. Right-click a Markdown file and choose **Quick Actions → Send to Kindle** (or the Finder **Services** menu). The workflow supports one selected Markdown file and opens the app with that file even if the app is already running. It does not change your default editor.

Open the app once on that Mac to configure its email profile. macOS settings are stored in `~/Library/Application Support/md-to-kindle/profile.json`; the app password is encrypted using Electron's OS-backed safeStorage in the main process, which uses macOS Keychain protection. Windows DPAPI profiles cannot be copied to a Mac. The Windows all-vault helper is separate and remains Windows-only.

Current builds are unsigned and not notarized. macOS may require you to approve the app before opening it, and Keychain may request access on first use or after an update. The installer does not change Gatekeeper, remove quarantine attributes, or alter system security settings. A signed/notarized release requires the publisher's Apple Developer credentials.

To disable the Finder action, run `zsh scripts/uninstall-standalone-mac.sh`. It renames only that workflow to a disabled bundle, preserving the app and encrypted profile.

## Email setup and sending

- Use your provider's SMTP host, username and app password. For Gmail: `smtp.gmail.com`, port `587`, **Required STARTTLS**, and a Google app password created with 2-Step Verification. Existing saved passwords remain in place when the password field is left empty.
- **Approve the sender with Amazon before sending:** Manage Your Content and Devices → Preferences → Personal Document Settings → Approved Personal Document E-mail List → Add a new approved e-mail address. Add the exact connected **sender**, not the Kindle recipient. A successful connection test does not check Amazon approval.
- Review the sender, editable Kindle recipient, attachment size, warnings and EPUB preview. Click **Send to Kindle** when ready. Success means the email provider accepted submission; Amazon may request verification or take time to process it.
- The file on disk is read, so unsaved editor changes are not included. The reviewed in-memory EPUB is sent unchanged, even if the source file changes afterward. If global email settings change after review, refresh the preview before sending.

Images inside the file's folder are supported. For notes inside a default Obsidian vault, the sender also resolves vault-root image paths and unique image filenames in that vault. Ambiguous, missing, remote, unsafe or unsupported images are omitted with warnings. Parent traversal paths (`../`) are omitted. Other notes are not followed or exported; dynamic Obsidian plugins are not executed. Non-UTF-8, empty, unsupported or oversized files are rejected before sending.

The renderer is sandboxed with Node integration disabled. Notes cannot execute scripts or access email credentials through the preview. Passwords are unlocked only in the main process for explicit sends/tests. Previewing a file and opening the app do not send email. No telemetry or automatic retry is used.

## Build and validation

```sh
npm ci
npm run typecheck
npm test
npm run release
npm run standalone:package:win
```

Use `npm run standalone:package:mac` on macOS to build Intel and Apple Silicon app ZIPs. `npm run standalone:dev` launches the development app. A manual **Build standalone desktop apps** workflow builds Windows and macOS packages in GitHub Actions and validates the Finder workflow property lists and shell syntax. It uploads build artifacts without publishing a release or installing anything on a user's computer.

The same EPUB/mail modules serve Obsidian and the standalone app. Standalone tests cover Unicode filenames, literal shell-looking names/content, file/encoding limits, image boundaries, vault image lookup, settings changes after preview, exact attachment bytes, protected profile reuse and duplicate submissions. Windows runtime and Explorer checks are performed locally; Finder behavior needs a Mac for a full interactive smoke test.
