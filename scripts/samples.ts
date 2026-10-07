import { mkdir, writeFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createEpub } from '../src/epub';

const browser = new JSDOM('');
Object.assign(globalThis, { DOMParser: browser.window.DOMParser, XMLSerializer: browser.window.XMLSerializer });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDXsAAAAASUVORK5CYII=', 'base64');
const markdown = `---
private: This frontmatter is excluded
---
# Reading on Kindle

Café, mañana, 日本語 — **bold**, *emphasis*, and an [external link](https://obsidian.md).

%% This comment is excluded %%

## Notes and lists

- Read comfortably with adjustable text.
- Keep your note in Obsidian.

> A useful quotation.

| Feature | Result |
| --- | --- |
| Markdown | Reflowable EPUB |
| Email | Your own SMTP account |

## Code and images

\`\`\`typescript
const greeting = "Hello, Kindle!";
\`\`\`

![[sample.png|A local image]]

## Links to other notes

[[Another note|Readable label]]
`;
const fixtures = [
  { title: 'Kindle Courier sample', markdown },
  { title: 'Plain note', markdown: 'A short note with no headings.' },
  { title: 'Sanitized content', markdown: '<script>alert(1)</script>\n\n<a href="javascript:alert(1)">Readable label</a>\n\n![Missing](missing.png)\n\n```mermaid\ngraph TD; A --> B\n```' },
];
await mkdir('artifacts/samples', { recursive: true });
for (const fixture of fixtures) {
  const epub = await createEpub({ ...fixture, sourcePath: 'Sample.md' }, async target => target === 'sample.png' ? { path: target, bytes: png } : null);
  await writeFile(`artifacts/samples/${epub.filename}`, epub.content);
  await writeFile(`artifacts/samples/${fixture.title}.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>${fixture.title}</title><body>${epub.previewHtml}</body></html>`);
  console.log(`${epub.filename}: ${epub.content.length} bytes, ${epub.warnings.length} warnings`);
}
