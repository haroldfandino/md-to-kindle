# Contributing

Use Node.js 22+, install with `npm ci`, and run `npm run typecheck`, `npm test`, and `npm run build` before submitting a change. Keep strict TypeScript types and Obsidian styling conventions. Test behavior at the export/email boundary rather than duplicating implementation details.

Do not add telemetry or background sending. Keep passwords out of plugin data, logs, fixtures and diagnostics. Tests must use synthetic documents and a local mail server, never real SMTP credentials or a real Kindle address. Never commit a vault, generated `main.js`, `.local/`, `.tools/`, `dist/`, `artifacts/`, or `data.json`.

When changing dependencies, inspect `npm audit`, bundle compatibility and license notices. Obsidian is externalized; do not bundle the Obsidian host API. Regenerate notices using `node scripts/licenses.mjs` before a release.

Bug reports should describe the Obsidian version, operating system, SMTP provider, and the user-facing error. Do not attach passwords, raw mail server traffic, account addresses, or private notes. A minimal synthetic Markdown sample is preferable for EPUB issues.
