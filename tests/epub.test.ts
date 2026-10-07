import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { cleanMarkdown, createEpub } from '../src/epub';
import { localImageTarget, prepareFile, supportedFile } from '../src/files';

const browser = new JSDOM('');
Object.assign(globalThis, { DOMParser: browser.window.DOMParser, XMLSerializer: browser.window.XMLSerializer });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDXsAAAAASUVORK5CYII=', 'base64');
const source = (markdown: string) => ({ title: 'Café & ideas — 日本語', sourcePath: 'Notes/Reading.md', markdown });

async function contentOf(markdown: string) {
  const document = await createEpub(source(markdown), async () => null);
  const zip = await JSZip.loadAsync(document.content);
  return { document, zip, html: await zip.file('EPUB/content.xhtml')!.async('string') };
}

test('EPUB is UTF-8 XHTML with navigation, metadata, standard Markdown and first uncompressed mimetype', async () => {
  const { document, zip, html } = await contentOf('---\nsecret: hidden\n---\n# Heading\n\n**Bold** and *emphasis* café 日本語.\n\n- One\n- Two\n\n> Quote\n\n| Name | Value |\n| --- | --- |\n| A | B |\n\n```ts\nconst value = "<&>";\n```\n\n[Web](https://example.com)\n\nLine  \nBreak\n\n---');
  assert.equal(document.content.readUInt32LE(0), 0x04034b50);
  assert.equal(document.content.readUInt16LE(8), 0);
  assert.equal(document.content.subarray(30, 38).toString(), 'mimetype');
  assert.equal(await zip.file('mimetype')!.async('string'), 'application/epub+zip');
  assert.match(html, /日本語/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<table(?:\s[^>]*)?>/);
  assert.match(html, /<pre(?:\s[^>]*)?><code/);
  assert.match(html, /<br[^>]*\/>/);
  assert.doesNotMatch(html, /secret: hidden/);
  for (const name of ['EPUB/content.xhtml', 'EPUB/nav.xhtml', 'EPUB/package.opf', 'META-INF/container.xml']) {
    const parsed = new browser.window.DOMParser().parseFromString(await zip.file(name)!.async('string'), 'application/xml');
    assert.equal(parsed.querySelector('parsererror'), null, name);
  }
  assert.match(await zip.file('EPUB/nav.xhtml')!.async('string'), /content.xhtml#section-1/);
  assert.match(await zip.file('EPUB/package.opf')!.async('string'), /Café &amp; ideas/);
});

test('comments and frontmatter are excluded but code is preserved', () => {
  assert.equal(cleanMarkdown('---\nprivate: yes\n---\nVisible %% secret\n\nmore %% end\n\n`%% literal %%`\n\n```md\n%% code %%\n```'), 'Visible \n\n end\n\n`%% literal %%`\n\n```md\n%% code %%\n```');
});

test('unmatched or escaped backticks do not expose comments; multiline code spans remain literal', () => {
  assert.equal(cleanMarkdown('A lone ` tick %% private %% visible'), 'A lone ` tick  visible');
  assert.equal(cleanMarkdown('An escaped \\` tick %% private %% visible'), 'An escaped \\` tick  visible');
  assert.equal(cleanMarkdown('`multi\n%% literal %%\nline` %% private %%'), '`multi\n%% literal %%\nline` ');
});

test('note links are readable labels and never resolve or export another note', async () => {
  const { html, document } = await contentOf('[[Other note|Label]] [Local](Other.md) ![[Private note]] `[[Code]]`');
  assert.match(html, /Label Local \[Embedded content omitted: Private note\]/);
  assert.match(html, /<code>\[\[Code\]\]<\/code>/);
  assert.doesNotMatch(html, /href="Other/);
  assert.ok(document.warnings.some(warning => warning.includes('Private note')));
});

test('local Markdown and Obsidian images are embedded once and previewed as data URLs', async () => {
  const targets: string[] = [];
  const document = await createEpub(source('![[picture.png|100]]\n\n![Picture](picture.png)'), async target => {
    targets.push(target);
    return { path: 'Assets/picture.png', bytes: png };
  });
  const zip = await JSZip.loadAsync(document.content);
  assert.deepEqual(targets, ['picture.png']);
  assert.equal(Object.keys(zip.files).filter(name => name.endsWith('.png')).length, 1);
  assert.deepEqual(await zip.file('EPUB/images/image-1.png')!.async('nodebuffer'), png);
  assert.match(await zip.file('EPUB/content.xhtml')!.async('string'), /src="images\/image-1.png"/);
  assert.match(document.previewHtml!, /data:image\/png;base64/);
  assert.deepEqual(document.warnings, []);
});

test('remote, traversal, unsupported and missing images do not leak file or network content', async () => {
  const targets: string[] = [];
  const document = await createEpub(source('![Remote](https://example.com/tracker.png) ![Unsafe](../private.png) ![Missing](missing.png) ![SVG](vector.svg) ![Bad](spoof.png)'), async target => {
    targets.push(target);
    return target === 'spoof.png' ? { path: target, bytes: Buffer.from('<script>bad</script>') } : null;
  });
  assert.deepEqual(targets, ['missing.png', 'spoof.png']);
  assert.equal(document.warnings.length, 5);
  assert.doesNotMatch(document.previewHtml!, /<img/);
  for (const target of ['../secret.png', '%2e%2e/secret.png', 'file:///secret.png', 'C:\\secret.png', '/secret.png', '//example.com/x.png', 'data:image/png;base64,x', 'https://example.com/x.png']) {
    assert.equal(localImageTarget(target), null, target);
  }
});

test('raw HTML, scripts, style, active URLs and event handlers are sanitized', async () => {
  const { html, document } = await contentOf('<script>alert(1)</script>\n\n<img src="https://example.com/track" onerror="alert(1)"><iframe src="file:///private"></iframe>\n\n<a href="javascript:alert(1)" onclick="alert(1)">unsafe</a> <span style="background:url(https://example.com)">safe</span>');
  assert.doesNotMatch(html, /<script|<iframe|onerror|onclick|javascript:|background:|src="https:/i);
  assert.match(html, /safe/);
  assert.ok(document.warnings.some(warning => warning.includes('Raw HTML')));
});

test('dynamic blocks are omitted without evaluation', async () => {
  const { html, document } = await contentOf('```dataviewjs\napp.vault.read("Private")\n```\n\n```mermaid\ngraph TD; A --> B\n```\n\n$E=mc^2$');
  assert.doesNotMatch(html, /app.vault.read/);
  assert.match(html, /dataviewjs content omitted/);
  assert.equal(document.warnings.length, 3);
});

test('empty and oversized notes or images fail before sending', async () => {
  await assert.rejects(createEpub(source('   '), async () => null), /empty/);
  await assert.rejects(createEpub(source('---\nprivate: yes\n---\n%% comment %%'), async () => null), /no content/);
  await assert.rejects(createEpub(source('x'.repeat(101)), async () => null, 100), /limit/);
  await assert.rejects(createEpub(source('![A](a.png)'), async () => ({ path: 'a.png', bytes: png }), 20), /limit/);
});

test('raw HTML headings retain formatting and get unique navigation targets', async () => {
  const { html, zip } = await contentOf('# Markdown\n\n<h2 id="book-title">Raw <strong>heading</strong></h2>\n\nInline <em>formatting</em>.');
  assert.match(html, /Raw <strong>heading<\/strong>/);
  assert.match(html, /Inline <em>formatting<\/em>/);
  const parsed = new browser.window.DOMParser().parseFromString(html, 'application/xml');
  assert.deepEqual(Array.from(parsed.querySelectorAll('[id]')).map(element => element.id), ['book-title', 'section-1', 'section-2']);
  assert.match(await zip.file('EPUB/nav.xhtml')!.async('string'), /Raw heading/);
});

test('supported files are unchanged; unsupported and empty attachments are rejected', () => {
  const bytes = Buffer.from('%PDF-1.4\nunchanged');
  assert.deepEqual(prepareFile('Vault/Document.PDF', bytes).content, bytes);
  assert.equal(prepareFile('Vault/Document.PDF', bytes).filename, 'Document.PDF');
  assert.equal(supportedFile('book.EPUB'), true);
  assert.equal(supportedFile('book.mobi'), false);
  assert.throws(() => prepareFile('file.exe', bytes), /not supported/);
  assert.throws(() => prepareFile('file.txt', Buffer.alloc(0)), /empty/);
});
