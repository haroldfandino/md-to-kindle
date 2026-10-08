import { readFile, realpath, stat, readdir } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { createEpub } from './epub';
import { imageType, localImageTarget } from './files';
import type { LocalImage } from './epub';
import { attachmentLimit, type MdToKindleSettings } from './settings';
import type { PreparedDocument } from './files';

export function markdownFile(path: string): boolean { return /^\.(md|markdown)$/i.test(extname(path)); }

export interface MarkdownSource { path: string; label: string }

export async function markdownFolder(path: string, recursive = true): Promise<{ files: MarkdownSource[]; warnings: string[] }> {
  const root = await realpath(path);
  if (!(await stat(root)).isDirectory()) throw new Error('Choose a folder containing Markdown files.');
  const pending = [root];
  const files: MarkdownSource[] = [];
  const warnings: string[] = [];
  let visited = 0;
  while (pending.length) {
    const directory = pending.pop()!;
    let children;
    try { children = await readdir(directory, { withFileTypes: true }); }
    catch { warnings.push(`Could not read ${relative(root, directory) || 'the selected folder'}.`); continue; }
    for (const item of children) {
      if (++visited > 20_000) throw new Error('This folder is too large to browse. Choose a smaller folder.');
      if (item.name.startsWith('.') || ['node_modules', '$RECYCLE.BIN', 'System Volume Information'].includes(item.name)) continue;
      if (item.isSymbolicLink()) continue;
      const child = join(directory, item.name);
      if (recursive && item.isDirectory()) pending.push(child);
      else if (item.isFile() && markdownFile(child)) {
        files.push({ path: child, label: relative(root, child).split(sep).join('/') });
        if (files.length > 500) throw new Error('This folder contains more than 500 Markdown files. Choose a smaller folder.');
      }
    }
  }
  files.sort((left, right) => left.label.localeCompare(right.label, 'en', { numeric: true }));
  return { files, warnings };
}

async function sourceRoot(file: string): Promise<string> {
  let current = dirname(file);
  for (;;) {
    if (await stat(join(current, '.obsidian')).then(info => info.isDirectory(), () => false)) return current;
    const parent = dirname(current);
    if (parent === current) return dirname(file);
    current = parent;
  }
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return !!rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !/^(?:[a-z]:|[\\/])/i.test(rel);
}

async function imageAt(path: string, root: string, limit: number): Promise<LocalImage | null> {
  try {
    const actual = await realpath(path);
    if (!inside(root, actual)) return null;
    const info = await stat(actual);
    if (!info.isFile()) return null;
    if (info.size > limit) throw new Error('An embedded image exceeds your attachment limit.');
    const bytes = await readFile(actual);
    return imageType(bytes) ? { path: actual, bytes } : null;
  } catch (error) {
    if (error instanceof Error && error.message.includes('attachment limit')) throw error;
    return null;
  }
}

async function uniqueVaultImage(root: string, name: string): Promise<string | null> {
  let visited = 0;
  const matches: string[] = [];
  const pending = [root];
  while (pending.length && matches.length < 2) {
    const directory = pending.pop()!;
    for (const item of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      if (++visited > 20_000) return null;
      if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') pending.push(join(directory, item.name));
      else if (item.isFile() && item.name === name) matches.push(join(directory, item.name));
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

export async function prepareMarkdownFile(path: string, settings: MdToKindleSettings): Promise<PreparedDocument> {
  if (!markdownFile(path)) throw new Error('Choose one .md or .markdown file.');
  const actual = await realpath(path);
  const info = await stat(actual);
  if (!info.isFile()) throw new Error('The selected path is not a file.');
  const limit = attachmentLimit(settings);
  if (info.size > limit) throw new Error('The selected Markdown file exceeds your attachment limit.');
  const bytes = await readFile(actual);
  let markdown: string;
  try { markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('The Markdown file must use UTF-8 text encoding.'); }
  const root = await sourceRoot(actual);
  const folder = dirname(actual);
  return createEpub({ title: basename(path, extname(path)), markdown, sourcePath: relative(root, actual).split(sep).join('/') }, async target => {
    const safe = localImageTarget(target);
    if (!safe) return null;
    const nearby = await imageAt(resolve(folder, safe), root, limit);
    if (nearby) return nearby;
    const vaultRelative = await imageAt(resolve(root, safe), root, limit);
    if (vaultRelative) return vaultRelative;
    if (safe.includes('/') || root === folder) return null;
    const unique = await uniqueVaultImage(root, safe);
    return unique ? imageAt(unique, root, limit) : null;
  }, limit);
}
