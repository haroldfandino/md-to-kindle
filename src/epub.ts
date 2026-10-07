import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import sanitizeHtml from 'sanitize-html';
import { imageType, localImageTarget, safeFilename, type PreparedDocument } from './files';

export interface NoteSource {
  title: string;
  markdown: string;
  sourcePath: string;
}

export interface LocalImage {
  path: string;
  bytes: Uint8Array;
}

export type ImageResolver = (vaultRelativeTarget: string) => Promise<LocalImage | null>;

export const BOOK_CSS = `body { font-family: serif; line-height: 1.5; margin: 1em; }
h1,h2,h3,h4,h5,h6 { line-height: 1.2; page-break-after: avoid; }
img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.85em; }
code { font-family: monospace; }
table { border-collapse: collapse; width: 100%; }
th,td { border: 1px solid; padding: 0.3em; overflow-wrap: anywhere; }
blockquote { margin-left: 1em; padding-left: 0.75em; border-left: 2px solid; }
a { text-decoration: underline; }`;

export function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

export function cleanMarkdown(markdown: string): string {
  const withoutFrontmatter = markdown.replace(/^\uFEFF?---[^\S\n]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[^\S\n]*(?:\r?\n|$)/, '');
  // Comments are stripped outside fenced and inline code, including comments
  // spanning paragraphs. No regex is applied to the contents of code blocks.
  let comment = false;
  let fence = '';
  let inline = '';
  let lineOffset = 0;
  return withoutFrontmatter.split('\n').map(line => {
    const start = lineOffset;
    lineOffset += line.length + 1;
    const marker = !comment && !inline ? line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1] : undefined;
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = '';
      return line;
    }
    if (marker) { fence = marker; return line; }
    let result = '';
    for (let pos = 0; pos < line.length;) {
      if (!inline && line.startsWith('%%', pos)) { comment = !comment; pos += 2; continue; }
      if (comment) { pos++; continue; }
      if (!inline && line[pos] === '\\' && line[pos + 1] === '`') {
        result += line.slice(pos, pos + 2);
        pos += 2;
      } else if (line[pos] === '`') {
        const run = line.slice(pos).match(/^`+/)![0];
        if (!inline) {
          const tail = withoutFrontmatter.slice(start + pos + run.length);
          const closing = new RegExp(`(^|[^\u0060])${run}(?!\u0060)`).exec(tail);
          // A lone/escaped backtick is text, not a code span. It must not
          // prevent later Obsidian comments from being removed.
          if (closing && !/\n[ \t]*\r?\n/.test(tail.slice(0, closing.index))) inline = run;
        }
        else if (inline === run) inline = '';
        result += run;
        pos += run.length;
      } else { result += line[pos++]; }
    }
    return result;
  }).join('\n');
}

function allTokens(tokens: Token[]): Token[] {
  return tokens.flatMap(token => [token, ...(token.children ? allTokens(token.children) : [])]);
}

export async function createEpub(source: NoteSource, resolveImage: ImageResolver, maxBytes = 20_000_000): Promise<PreparedDocument> {
  if (!source.markdown.trim()) throw new Error('This note is empty.');
  if (Buffer.byteLength(source.markdown, 'utf8') > maxBytes) throw new Error('The note exceeds your attachment limit before conversion.');
  const warnings = new Set<string>();
  const md = new MarkdownIt({ html: true, xhtmlOut: true, linkify: false, typographer: false });
  md.inline.ruler.before('link', 'vault-link', (state, silent) => {
    const embedded = state.src.startsWith('![[', state.pos);
    if (!embedded && !state.src.startsWith('[[', state.pos)) return false;
    const offset = embedded ? 3 : 2;
    const end = state.src.indexOf(']]', state.pos + offset);
    if (end < 0 || end >= state.posMax) return false;
    if (!silent) {
      const raw = state.src.slice(state.pos + offset, end);
      const [target, alias] = raw.split('|');
      const label = alias || target;
      if (embedded && /\.(?:png|jpe?g|gif)(?:#.*)?$/i.test(target)) {
        const token = state.push('image', 'img', 0);
        token.attrSet('src', target);
        token.attrSet('alt', /^\d+(?:x\d+)?$/.test(alias || '') ? target : label);
        token.content = /^\d+(?:x\d+)?$/.test(alias || '') ? target : label;
        token.children = state.md.parseInline(token.content, state.env)[0].children;
      } else {
        const token = state.push('text', '', 0);
        token.content = embedded ? `[Embedded content omitted: ${label}]` : label;
        if (embedded) warnings.add(`Embedded notes or unsupported files are omitted: ${target}`);
      }
    }
    state.pos = end + 2;
    return true;
  });

  const baseFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
    const kind = tokens[index].info.trim().split(/\s/)[0].toLowerCase();
    if (['dataview', 'dataviewjs', 'query', 'mermaid'].includes(kind)) {
      warnings.add(`${kind} content is omitted; dynamic plugin content is not evaluated.`);
      return `<p>[${xml(kind)} content omitted]</p>\n`;
    }
    return baseFence(tokens, index, options, env, renderer);
  };

  const cleaned = cleanMarkdown(source.markdown);
  if (!cleaned.trim()) throw new Error('This note has no content after removing frontmatter and comments.');
  const tokens = md.parse(cleaned, {});

  const images = new Map<string, { name: string; type: string; bytes: Buffer }>();
  const requestedImages = new Map<string, string | null>();
  let sourceBytes = Buffer.byteLength(source.markdown, 'utf8');
  for (const token of allTokens(tokens)) {
    if (token.type === 'inline' && /(?:\$\$|(?<!\\)\$[^$\n]+\$)/.test(token.content)) {
      warnings.add('Math expressions are included as source text; equations are not rendered.');
    }
    if (token.type === 'image') {
      const original = token.attrGet('src') || '';
      let packaged = requestedImages.get(original);
      if (!requestedImages.has(original)) {
        const target = localImageTarget(original);
        if (!target) {
          warnings.add(`Remote or unsafe image omitted: ${original}`);
          packaged = null;
        } else if (!/\.(?:png|jpe?g|gif)$/i.test(target)) {
          warnings.add(`Unsupported image omitted: ${target}`);
          packaged = null;
        } else {
          const asset = await resolveImage(target);
          const kind = asset ? imageType(asset.bytes) : null;
          if (!asset || !kind) {
            warnings.add(`Missing or invalid image omitted: ${target}`);
            packaged = null;
          } else {
            if (!images.has(asset.path)) {
              sourceBytes += asset.bytes.byteLength;
              if (sourceBytes > maxBytes) throw new Error('The note and its images exceed your attachment limit before conversion.');
              images.set(asset.path, { name: `images/image-${images.size + 1}.${kind}`, type: kind === 'jpg' ? 'image/jpeg' : `image/${kind}`, bytes: Buffer.from(asset.bytes) });
            }
            packaged = images.get(asset.path)!.name;
          }
        }
        requestedImages.set(original, packaged ?? null);
      }
      if (packaged) token.attrSet('src', packaged);
      else { token.type = 'text'; token.tag = ''; token.attrs = null; token.children = null; token.content = `[Image omitted: ${token.content || original}]`; }
    }
    // A Kindle has no vault to navigate. Keep the text of local/unsafe links.
    if (token.children) {
      const stack: boolean[] = [];
      for (const child of token.children) {
        if (child.type === 'link_open') {
          const keep = /^(?:https?:\/\/|mailto:)/i.test(child.attrGet('href') || '');
          stack.push(keep);
          if (!keep) { child.type = 'text'; child.tag = ''; child.attrs = null; child.content = ''; }
        } else if (child.type === 'link_close' && !stack.pop()) {
          child.type = 'text'; child.tag = ''; child.content = '';
        }
      }
    }
  }

  let rendered = md.renderer.render(tokens, md.options, {});
  const hadRawHtml = allTokens(tokens).some(token => token.type === 'html_block' || token.type === 'html_inline');
  if (hadRawHtml) warnings.add('Raw HTML is sanitized. Raw HTML images are omitted; use Markdown or Obsidian image embeds.');
  // A raw HTML img is allowed only if its src matches an asset we packaged.
  const imageNames = new Set([...images.values()].map(image => image.name));
  rendered = sanitizeHtml(rendered, {
    allowedTags: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'em', 'strong', 's', 'ul', 'ol', 'li', 'a', 'img', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'sub', 'span', 'div'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt'], ol: ['start'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    exclusiveFilter: frame => frame.tag === 'img' && !imageNames.has(frame.attribs.src),
    transformTags: { a: (tagName, attribs) => ({ tagName: /^(?:https?:\/\/|mailto:)/i.test(attribs.href || '') ? 'a' : 'span', attribs }) },
  });
  const title = source.title.trim() || 'Note';
  const bodyHtml = `<h1 id="book-title">${xml(title)}</h1>\n${rendered}`;
  // XMLSerializer emits XHTML void elements and numeric/Unicode characters,
  // rather than HTML-only entities that would make an EPUB invalid XML.
  const document = new DOMParser().parseFromString(bodyHtml, 'text/html');
  // Assign IDs after sanitization so even raw HTML headings have unique,
  // reliable navigation targets and cannot duplicate the generated title ID.
  const headings = Array.from(document.body.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(1).map((heading, index) => {
    const id = `section-${index + 1}`;
    heading.setAttribute('id', id);
    return { id, title: heading.textContent || 'Section' };
  });
  const serializer = new XMLSerializer();
  const xhtmlBody = Array.from(document.body.childNodes).map(node => serializer.serializeToString(node)).join('');
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  const uuid = randomUUID();
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const manifestImages = [...images.values()].map((image, index) => `<item id="image-${index + 1}" href="${image.name}" media-type="${image.type}"/>`).join('');
  zip.file('EPUB/package.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${uuid}</dc:identifier><dc:title>${xml(title)}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="content" href="content.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="style.css" media-type="text/css"/>${manifestImages}</manifest><spine><itemref idref="content"/></spine></package>`);
  zip.file('EPUB/content.xhtml', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en"><head><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${xhtmlBody}</body></html>`);
  const entries = [{ id: 'book-title', title }, ...headings];
  zip.file('EPUB/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en"><head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${entries.map(entry => `<li><a href="content.xhtml#${entry.id}">${xml(entry.title)}</a></li>`).join('')}</ol></nav></body></html>`);
  zip.file('EPUB/style.css', BOOK_CSS);
  for (const image of images.values()) zip.file(`EPUB/${image.name}`, image.bytes);
  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  if (content.length > maxBytes) throw new Error('The generated EPUB exceeds your attachment limit.');
  // Use data URLs only in the preview, never in the EPUB.
  const preview = document;
  for (const element of Array.from(preview.querySelectorAll('img'))) {
    const image = [...images.values()].find(asset => asset.name === element.getAttribute('src'));
    if (image) element.setAttribute('src', `data:${image.type};base64,${image.bytes.toString('base64')}`);
  }
  return { filename: safeFilename(title, 'epub'), title, contentType: 'application/epub+zip', content, warnings: [...warnings], previewHtml: preview.body.innerHTML };
}
