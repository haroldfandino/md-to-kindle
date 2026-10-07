# Verification

## Automated

`npm test` covers Unicode EPUB metadata and XHTML, navigation, lists/tables/code, excluded frontmatter and comments, note link labels, packaged images, missing/remote/unsafe references, sanitized HTML, omitted dynamic content, unchanged supported files and size checks.

SMTP tests run entirely on loopback. They verify STARTTLS and implicit TLS with certificate validation, refusal of untrusted certificates or absent STARTTLS, authentication failure, recipient/size rejection, unchanged MIME attachment bytes, a no-mail connection test, concurrent-send protection, and no automatic retry.

UI tests use a DOM and a small Obsidian API double to cover command registration, current unsaved editor contents, file selection, warning/recipient preview, disabled send controls, successful submission, errors, closing while sending, and Keychain references. These are not a replacement for testing the installed plugin in the real Obsidian app.

## EPUBCheck

Generate fixtures with `npm run samples`. Obtain [EPUBCheck](https://github.com/w3c/epubcheck/releases) and Java 11 or newer, then validate every file in `artifacts/samples/`:

```sh
java -jar /path/to/epubcheck.jar "artifacts/samples/md-to-kindle sample.epub"
java -jar /path/to/epubcheck.jar "artifacts/samples/Plain note.epub"
java -jar /path/to/epubcheck.jar "artifacts/samples/Sanitized content.epub"
```

## Real Obsidian smoke test

Use a test vault on each available desktop platform. Install release assets, enable the plugin, and confirm both commands and file context menus. Configure the recipient and an SMTP account locally. Create/select a Keychain app password, test the connection, change settings, restart Obsidian and confirm they persist. Confirm plugin `data.json` contains a secret name and no password.

Try a Unicode note with unsaved edits, headings, a table, code, one local image, a missing image, a note link and an embedded note. Inspect the preview and warnings. Confirm blank/invalid settings give useful errors and double-clicking Send sends only once. Confirm existing PDF and EPUB attachments are sent unchanged.

## Kindle delivery smoke test

Add the exact sender to Amazon’s approved personal-document email list. With the user’s credentials configured locally, explicitly send the sample note and a small valid PDF. Check the sender mailbox for Amazon verification requests and failure messages. Connect/sync the Kindle and verify document titles, heading navigation, Unicode text, adjustable font size, images, table and code readability. Record SMTP submission separately from actual device arrival.

Without sender credentials and access to the receiving Kindle, device delivery remains unverified. Never substitute a test SMTP success for a Kindle delivery claim.
