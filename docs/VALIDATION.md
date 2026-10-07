# Validation results

Verified on **2026-10-06** on Windows with Node.js **24.11.1**.

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

Generated ebooks: `Kindle Courier sample.epub`, `Plain note.epub`, and `Sanitized content.epub` in `artifacts/samples/`. The third sample intentionally exercises omitted/sanitized content; its EPUB still validates without errors.

The Obsidian dialogs and lifecycle were exercised using an API double and DOM, not the installed Obsidian app. A temporary vault verified asset installation; no existing vault was modified during these checks. macOS and Linux runtime smoke tests remain unverified.

No real SMTP account was configured and no external email was sent. Kindle arrival and rendering remain unverified pending local sender setup and device access. The source repository is `haroldfandino/md-to-kindle`; the GitHub release and community-directory submission have been prepared but not published.
