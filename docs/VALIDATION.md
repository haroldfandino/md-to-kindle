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
