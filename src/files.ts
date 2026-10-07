export interface PreparedDocument {
  filename: string;
  title: string;
  contentType: string;
  content: Buffer;
  warnings: string[];
  previewHtml?: string;
}

export const SUPPORTED_TYPES: Readonly<Record<string, string>> = Object.freeze({
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  txt: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  rtf: 'application/rtf',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
});

export function fileExtension(path: string): string {
  return path.split('/').pop()?.split('.').pop()?.toLowerCase() ?? '';
}

export function supportedFile(path: string): boolean {
  return Object.hasOwn(SUPPORTED_TYPES, fileExtension(path));
}

export function safeFilename(title: string, extension: string): string {
  const stem = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 100);
  return `${stem || 'Note'}.${extension}`;
}

export function prepareFile(filename: string, bytes: ArrayBuffer | Buffer): PreparedDocument {
  const contentType = SUPPORTED_TYPES[fileExtension(filename)];
  if (!contentType) throw new Error('This file type is not supported. Choose an EPUB, PDF, text, HTML, RTF, or supported image file.');
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (content.length === 0) throw new Error('The selected file is empty.');
  const basename = filename.replace(/\\/g, '/').split('/').pop() ?? 'Document';
  return { filename: basename, title: basename, contentType, content, warnings: [] };
}

// Image targets may refer only to vault-relative paths; no URLs, absolute paths,
// traversal or encoded traversal. The Obsidian adapter still resolves the TFile.
export function localImageTarget(target: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(target); } catch { return null; }
  const path = decoded.split('#')[0];
  if (!path || /^[a-z][a-z\d+.-]*:/i.test(path) || /^[\\/]/.test(path) || /[\u0000-\u001f\\]/.test(path)) return null;
  if (path.split('/').includes('..')) return null;
  return path;
}

export function imageType(bytes: Uint8Array): 'png' | 'jpg' | 'gif' | null {
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(Buffer.from(bytes.subarray(0, 6)).toString('ascii'))) return 'gif';
  return null;
}
