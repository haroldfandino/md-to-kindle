# Public release and community-directory submission

The Obsidian plugin remains **0.3.0**, named **md-to-kindle**, ID **md-to-kindle**, desktop only, minimum Obsidian version **1.11.4**. The standalone GUI is independently versioned in `standalone/version.json`, currently **0.4.1**, for Windows and macOS. Source is MIT-licensed. A recipient is never preset in public code or assets. The optional all-vault helper/shared profile currently supports Windows. The GUI app does not register context-menu actions, file associations or startup entries.

## Prepare

1. Run `npm ci`, `npm run typecheck`, `npm test`, `npm audit`, `npm run build`, and `npm run samples`.
2. Run EPUBCheck against the generated sample EPUBs. Follow `VERIFICATION.md` for the real-Obsidian and Kindle smoke tests.
3. Regenerate dependency notices with `node scripts/licenses.mjs`.
4. Keep `package.json`, `manifest.json`, and `versions.json` versions consistent, then run `npm run release`.
5. Inspect the release ZIP: only `main.js`, `manifest.json`, `styles.css`, `LICENSE`, and `THIRD_PARTY_NOTICES.md`. Check that private addresses, `.local/`, passwords, and test fixtures are absent.

## Publish a release from the repository

- Use [haroldfandino/md-to-kindle](https://github.com/haroldfandino/md-to-kindle) for source, the lockfile, MIT license, docs, and build/test scripts. Do not commit generated `main.js` or local settings.
- Plugin releases must use a tag matching the manifest, without a leading `v`. Attach `main.js`, `manifest.json`, `styles.css` and the plugin/helper ZIPs and checksums. Obsidian’s updater needs those plugin assets. Release the independently versioned GUI separately (for example, `standalone-0.4.1`) with its desktop app ZIPs, app installers and legacy-cleanup scripts. The manual GitHub Actions workflow builds Windows/macOS packages; a completed build does not mean the app is signed or notarized.
- Recheck the name and ID against the current community directory before submission. `docs/community-plugin.json` contains the repository slug `haroldfandino/md-to-kindle`.
- Submit an entry to `obsidianmd/obsidian-releases` in `community-plugins.json` with the plugin ID, name, author, description, and repository slug, following the current official submission instructions.
- Include the README account/network disclosures and completed verification results in the submission description. A prepared archive does not mean the plugin has been listed or approved; Obsidian reviews submissions independently.

## Prepared submission description

md-to-kindle converts a single Obsidian note to EPUB or sends an existing supported document to a user-configured Kindle email address through that user’s SMTP server. It provides a send preview, warnings for unsupported note content, mandatory TLS, app-password storage through Obsidian SecretStorage, and a connection test that sends no mail. It is desktop only and requires Obsidian 1.11.4+. It has no telemetry, hosted relay or automatic sending. Source and bundled license notices are available under the MIT license.

Validation: start with [the recorded results](VALIDATION.md), then attach the current typecheck, local SMTP/dialog tests, EPUBCheck report, and real Obsidian/Kindle smoke-test results. Disclose any unverified platform/device checks.
