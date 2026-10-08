# Validation results

Initial validation on **2026-10-06** on Windows with Node.js **24.11.1**. The rename to **md-to-kindle 0.1.1** was checked on **2026-10-07**: all 26 tests, typechecking, release integrity checks, and the renamed sample's EPUBCheck validation passed.

| Check | Result |
| --- | --- |
| Strict TypeScript check against Obsidian 1.11.4 API declarations | Passed |
| Automated export, SMTP and dialog tests | 26 passed; 0 failed |
| Local SMTP STARTTLS and implicit TLS | Passed with certificate verification |
| Invalid certificates and missing STARTTLS | Refused before sending |
| Authentication, recipient, size and uncertain-connection failures | Passed |
| Duplicate clicks and concurrent send protection | Passed |
| EPUBCheck 5.4.0: all three generated sample ebooks | 0 fatals, errors, warnings or infos |
| Dependency audit, including development dependencies | 0 vulnerabilities |
| Windows installer in a temporary vault | Passed |
| Installer preserves existing sender settings | Passed |
| Installer supports a custom config directory | Passed |
| Production bundle and installable ZIP | Built successfully |
| ZIP allowlist, manifest and SHA-256 integrity | Passed |
| Personal recipient absent from every ZIP entry | Passed |
| Public name/ID in Obsidian community directory | No conflict at time of check |
| Git exclusion of local recipient, tools and generated assets | Passed |

Generated ebooks: `md-to-kindle sample.epub`, `Plain note.epub`, and `Sanitized content.epub` in `artifacts/samples/`. The third sample intentionally exercises omitted/sanitized content; its EPUB still validates without errors.

Automated dialog and lifecycle checks use an API double and DOM. On **2026-10-07**, version **0.1.1** was also installed and enabled in the real **Obsidian 1.14.4** app on Windows. The plugin's settings page loaded successfully, including the SMTP configuration and Keychain selector. macOS and Linux runtime smoke tests remain unverified.

The user subsequently confirmed successful Gmail authentication and Kindle delivery using vault-only mode. The source repository is `haroldfandino/md-to-kindle`; the GitHub release and community-directory submission have been prepared but not published.

## Version 0.2.0: automatic vault helper and shared profile

On **2026-10-07**, strict typechecking, all **42 automated tests**, plugin/helper release allowlists and archive checksums passed. Tests cover real Windows DPAPI with synthetic secrets, shared-profile SMTP authentication without a per-vault Keychain reference, helper discovery of a newly registered vault, duplicate-process prevention, shutdown, invalid registries, exclusions, custom configuration directories, linked-path rejection, preservation of unrelated plugins/settings, and deliberate disable/uninstall behavior.

The helper was installed on Windows with sign-in startup. A real configured vault successfully shared its linked app password directly into Windows-protected storage. The helper's status confirmed that the global profile was available and registered vaults were enrolled, with vaults lacking community-plugin configuration held pending that prerequisite. Existing per-vault settings were retained. Already-open plugin instances now read their saved profile mode before preparing a preview.

No private sender/recipient addresses, plaintext passwords, vault contents, or local helper state are included in public release assets. An explicit live connection test loaded the real shared profile, unlocked its protected password in memory, and successfully authenticated with the configured email provider without sending a message. This is available as `npm run profile:test`. Automated SMTP tests send only to a local test server. macOS/Linux helper operation is unsupported; the standard plugin still supports those platforms in vault-only mode.

## Version 0.3.0: standalone desktop app

The EPUB exporter now uses a pure HTML5 parser and XML serializer, with no browser/Obsidian dependency. The existing sample EPUBs were revalidated with EPUBCheck: zero errors or warnings. Standalone tests cover Unicode filenames, on-disk conversion, Obsidian image references, path boundaries, UTF-8 and file limits, protected profile reuse, exact reviewed attachment bytes, settings changes after review, renderer behavior and duplicate submission prevention.

Production dependencies pass `npm audit --omit=dev`. The current Electron packaging toolchain has eight moderate development-only advisory entries through its download/logger dependencies; these are not runtime dependencies of the app. The latest supported builder is used rather than downgrading to an older toolchain with higher-severity advisories.

On **2026-10-07**, all **52 local tests** and strict typechecking passed. The standalone Windows app was packaged, installed and launched. Its Explorer commands for `.md` and `.markdown` were checked in the per-user registry, with existing default editor associations preserved. The actual app reused the saved global account and converted a user-selected Markdown file into a ready-to-send EPUB preview without submitting email.

The [Windows and macOS build run](https://github.com/haroldfandino/md-to-kindle/actions/runs/37716726158) completed successfully. It produced Windows x64 plus macOS Intel/Apple Silicon app ZIPs and passed native macOS plist/shell syntax checks. Desktop packages are unsigned and macOS packages are not notarized. Interactive Finder/Keychain behavior on a user's Mac remains unverified.

## Explorer registration repair

On **2026-10-07**, the Explorer registration was expanded to include a Markdown-filtered generic file verb and the current editor's ProgID keys, alongside extension registrations. The registrar now calls `SHChangeNotify(SHCNE_ASSOCCHANGED)` so Explorer refreshes its association cache. The default editor and its existing Open command were checked before and after repair and remained unchanged.

Windows Shell's actual verb enumeration confirmed exactly one **Send to Kindle** entry on the affected iCloud Markdown file and the synthetic `.md` file. It confirmed no such entry on a `.txt` file. All **53 tests** and strict typechecking passed. This integration has since been retired in standalone 0.4.0; its registration code and workflow bundles have been removed.

## Windows sign-in startup repair

On **2026-10-08**, the old Script Host launcher was replaced with a Startup shortcut to hidden PowerShell. It uses the installed helper's working directory and waits up to 60 seconds for runtime files to become available. Reinstallation now recovers a stale lock only when its recorded process has exited.

All **54 tests**, strict typechecking and release integrity checks passed. The startup regression was also rerun after adding stale-lock coverage: it verifies paths with spaces, legacy entry removal, preservation of unrelated startup entries, delayed file availability, generic failure diagnostics and reinstallation with a dead process lock. Tests use an isolated helper root and synthetic profile, without sending email.

The missing-file error was traced to runtime files visible in the command environment but absent from the normal Windows session. The helper was reinstalled in that Windows session, preserving the protected email profile byte-for-byte. A separate process in that session confirmed the runtime/launcher files, fresh watcher status, all six registered vaults and removal of the old `.vbs` entry. The watcher was then restarted using the exact command and working directory recorded in the Startup shortcut. A full Windows reboot was not performed during verification.

## Standalone 0.4.0: GUI and retirement of desktop actions

On **2026-10-08**, all **58 tests** and strict typechecking passed. The GUI lists Markdown files chosen directly or from a folder, requires explicit selection/review, shows per-document previews and warnings, and sends one attachment per email. Tests cover recursive/shallow discovery, hidden/dependency folders, linked directories, reviewed-byte preservation, duplicate clicks, partial failure and resuming only unattempted documents. The renderer never receives the app password.

An Electron smoke test in a normal Windows session exercised folder and multi-file picker responses, selection, preparation, switching Unicode previews and loading protected synthetic account settings. Rendered empty/review/warning screenshots were inspected; there was no horizontal overflow. No real email was sent. Native picker dialogs were supplied fixture responses in this test.

Legacy registration/Quick Action generation and app file associations were removed from the source. A real Windows cleanup verified zero Send to Kindle Explorer verbs, zero md-to-kindle startup entries and no running helper. The protected email profile and all **24** installed Obsidian plugin/settings files remained byte-for-byte unchanged. The existing Obsidian plugin stays version 0.3.0; the GUI has its own version file. macOS installers remove old workflow bundles, but interactive Mac cleanup/GUI behavior requires verification on a Mac.

The Windows GUI was installed in the normal Windows session with valid Start-menu and desktop shortcuts, preserving the saved profile and leaving no startup entries. The user confirmed that the app and both file/folder buttons were visible. The packaged ASAR reports version 0.4.0 and contains no legacy file argument/open-file handler. The [native Windows/macOS build](https://github.com/haroldfandino/md-to-kindle/actions/runs/37810686468) passed on both platforms, including Mac checks that the app no longer declares document associations. The Windows x64 and Mac Intel/Apple Silicon ZIPs were prepared. No real Kindle submission was made during this GUI revamp.

## Standalone 0.4.1: visible actions and complete document review

On **2026-10-08**, all 58 tests and strict typechecking passed. The document library now has a fixed Review selected action row, and the preview has a bounded scroll container that supports pointer and keyboard scrolling. Clicking a prepared row's padding, text or status badge opens its preview; the checkbox retains its separate selection action.

The new Electron layout check uses 60 synthetic documents, a 150-paragraph preview, long filenames and conversion warnings. It passed default 1160×850, minimum 850×650 and larger 1600×1000 windows, plus 125% and 150% zoom cases. It verifies that Review selected is visible and reachable, the preview scrolls to its final paragraph, switching books resets the preview scroll, and row clicks preserve the checked documents. Rendered default/minimum-size screenshots were inspected. The check is available through `npm run standalone:layout` and is included in the desktop build workflow. No email is sent by it.

Version 0.4.1 was installed and reopened on Windows through a normal close/restart, preserving the protected email profile. The installed ASAR matched the packaged bundle, one GUI window was open, and no startup entries were added. The [Windows/macOS build and layout checks](https://github.com/haroldfandino/md-to-kindle/actions/runs/37818424934) completed successfully on both platforms. Obsidian plugin source, manifest and installed settings were not changed.

## Standalone 0.4.2: Light, Dark and System appearance

On **2026-10-08**, all **61 tests**, strict typechecking and 12 light/dark layout cases passed. The top-bar Theme selector supports Light, Dark and System, with System as the default. System mode follows live OS color-scheme changes; explicit modes override it. Palettes cover the preview, list, controls, badges, warnings and email settings. The selected mode is stored separately in the app's `appearance.json`, with validated values and atomic writes.

Tests verify persistence across store instances, ordered writes, safe fallback for invalid preferences and recovery from failed saves. A production-main-process smoke test applied and saved Dark, then reopened the app with an isolated synthetic profile and confirmed that both its selector and native theme restored Dark. Theme changes do not reset selected documents or modify email settings/EPUB bytes. Rendered dark screenshots were inspected. No real email was sent during validation.
