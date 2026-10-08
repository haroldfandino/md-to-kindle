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

Windows Shell's actual verb enumeration confirmed exactly one **Send to Kindle** entry on the affected iCloud Markdown file and the synthetic `.md` file. It confirmed no such entry on a `.txt` file. A registry-isolated regression test checks filtered registration, quoted filename forwarding and idempotency. All **53 tests** and strict typechecking passed. The repair can run while the standalone app is open, without reinstalling it or restarting Explorer.
