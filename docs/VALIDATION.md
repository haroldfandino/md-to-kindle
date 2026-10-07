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

No real SMTP account was configured and no external email was sent. Kindle arrival and rendering remain unverified pending local sender setup and device access. The source repository is `haroldfandino/md-to-kindle`; the GitHub release and community-directory submission have been prepared but not published.
