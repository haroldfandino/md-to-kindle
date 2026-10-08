import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { prepareMarkdownFile, markdownFolder, markdownFile } from '../src/standalone-file';
import { DEFAULT_SETTINGS } from '../src/settings';
import { SharedProfileStore } from '../src/shared-profile';
import { MdToKindleMailer } from '../src/mail';
import { StandaloneSession } from '../standalone/session';

const settings = { ...DEFAULT_SETTINGS, profileMode: 'shared' as const, kindleEmail: 'reader@kindle.com', senderEmail: 'sender@example.com', smtpHost: 'smtp.example.com', smtpUsername: 'sender@example.com', passwordSecret: '' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDXsAAAAASUVORK5CYII=', 'base64');

async function fixture(t: { after(callback: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'md-to-kindle-standalone-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('md-to-kindle-standalone-'));
    await rm(root, { recursive: true, force: true });
  });
  const secrets = new Map<string, string>();
  let sequence = 0;
  const profile = new SharedProfileStore(join(root, 'profile'), {
    protect: async secret => { const id = `protected-${++sequence}`; secrets.set(id, secret); return id; },
    unprotect: async id => secrets.get(id)!,
  });
  await profile.create(settings, 'synthetic-password');
  const file = join(root, 'Read me café & notes.md');
  await writeFile(file, '# A note\n\nUnicode 日本語 and **bold**.\n\n![Image](image.png)');
  await writeFile(join(root, 'image.png'), png);
  return { root, profile, file };
}

test('standalone converts Unicode filenames without a browser or Obsidian', async t => {
  const { file } = await fixture(t);
  assert.equal(typeof globalThis.DOMParser, 'undefined');
  const document = await prepareMarkdownFile(file, settings);
  assert.equal(document.filename, 'Read me café & notes.epub');
  assert.equal(document.warnings.length, 0);
  const zip = await JSZip.loadAsync(document.content);
  assert.match(await zip.file('EPUB/content.xhtml')!.async('string'), /日本語/);
  assert.ok(zip.file('EPUB/images/image-1.png'));
});

test('file selection recognizes only Markdown extensions', () => {
  assert.equal(markdownFile('FILE.MARKDOWN'), true);
  assert.equal(markdownFile('program.exe'), false);
});

test('folder browsing sorts Unicode Markdown files, optionally includes subfolders and excludes hidden folders and links', async t => {
  const { root } = await fixture(t);
  await mkdir(join(root, 'Chapters')); await mkdir(join(root, '.private')); await mkdir(join(root, 'node_modules'));
  await writeFile(join(root, 'Chapters', '02 café.MARKDOWN'), '# Chapter');
  await writeFile(join(root, '.private', 'private.md'), '# Hidden');
  await writeFile(join(root, 'node_modules', 'dependency.md'), '# Dependency');
  const outside = join(root, 'Outside'); await mkdir(outside); await writeFile(join(outside, 'outside.md'), '# Outside');
  await symlink(outside, join(root, 'Chapters', 'linked'), 'junction');
  const result = await markdownFolder(join(root, 'Chapters'));
  assert.deepEqual(result.files.map(file => file.label), ['02 café.MARKDOWN']);
  const shallow = await markdownFolder(root, false);
  assert.deepEqual(shallow.files.map(file => file.label), ['Read me café & notes.md']);
  const recursive = await markdownFolder(root);
  assert.ok(recursive.files.some(file => file.label === 'Chapters/02 café.MARKDOWN'));
  assert.ok(recursive.files.every(file => !file.label.includes('.private') && !file.label.includes('node_modules') && !file.label.includes('linked')));
});

test('standalone finds a unique Obsidian image reference without running Obsidian', async t => {
  const { root } = await fixture(t);
  await mkdir(join(root, '.obsidian'));
  await mkdir(join(root, 'Notes'));
  await mkdir(join(root, 'Attachments'));
  await writeFile(join(root, 'Attachments', 'picture.png'), png);
  const note = join(root, 'Notes', 'Note.md');
  await writeFile(note, '![[picture.png]]');
  const document = await prepareMarkdownFile(note, settings);
  assert.deepEqual(document.warnings, []);
});

test('invalid UTF-8, empty, oversized, unsupported and missing files fail before email', async t => {
  const { root } = await fixture(t);
  const invalid = join(root, 'invalid.md');
  await writeFile(invalid, Buffer.from([0xc3, 0x28]));
  await assert.rejects(prepareMarkdownFile(invalid, settings), /UTF-8/);
  const empty = join(root, 'empty.md'); await writeFile(empty, '');
  await assert.rejects(prepareMarkdownFile(empty, settings), /empty/);
  const large = join(root, 'large.md'); await writeFile(large, 'x'.repeat(1_000_001));
  await assert.rejects(prepareMarkdownFile(large, { ...settings, maxAttachmentMB: 1 }), /limit/);
  await assert.rejects(prepareMarkdownFile(join(root, 'file.exe'), settings), /Choose one/);
  await assert.rejects(prepareMarkdownFile(join(root, 'missing.md'), settings), /ENOENT/);
});

test('images outside the source root via links are omitted rather than read', async t => {
  const { root } = await fixture(t);
  const noteRoot = join(root, 'documents'); await mkdir(noteRoot);
  const outside = join(root, 'outside'); await mkdir(outside);
  await writeFile(join(outside, 'secret.png'), png);
  await symlink(outside, join(noteRoot, 'linked'), 'junction');
  const note = join(noteRoot, 'file.md'); await writeFile(note, '![Image](linked/secret.png)');
  const document = await prepareMarkdownFile(note, settings);
  assert.ok(document.warnings.some(warning => warning.includes('omitted')));
  assert.doesNotMatch(document.previewHtml!, /data:image/);
});

test('session prepares a review, transmits the exact bytes once and never exposes credentials', async t => {
  const { file, profile } = await fixture(t);
  let calls = 0;
  let content: unknown;
  const mailer = new MdToKindleMailer(() => ({ verify: async () => true, sendMail: async message => { calls++; content = message.attachments![0].content; return { accepted: ['reader@kindle.com'] }; }, close: () => {} }));
  const session = new StandaloneSession(profile, mailer, file);
  const state = await session.state();
  assert.equal(state.settings.passwordSecret, '');
  assert.equal('password' in state, false);
  const preview = await session.prepare();
  assert.equal(preview.settings.senderEmail, 'sender@example.com');
  await session.send('reader@kindle.com');
  assert.equal(calls, 1);
  assert.equal((content as Buffer).length, preview.size);
  await assert.rejects(session.send('reader@kindle.com'), /already been submitted/);
  assert.equal(calls, 1);
});

test('settings changed after review block sending; preparation and verification never send', async t => {
  const { file, profile } = await fixture(t);
  let sends = 0;
  const mailer = new MdToKindleMailer(() => ({ verify: async () => true, sendMail: async () => { sends++; return { accepted: ['reader@kindle.com'] }; }, close: () => {} }));
  const session = new StandaloneSession(profile, mailer, file);
  await session.prepare(); await session.test();
  assert.equal(sends, 0);
  await profile.updateSettings({ ...settings, senderEmail: 'changed@example.com' });
  await assert.rejects(session.send('reader@kindle.com'), /settings changed/);
  assert.equal(sends, 0);
});

test('folder documents require explicit selection and sends preserve separate reviewed attachments', async t => {
  const { root, profile, file } = await fixture(t);
  const second = join(root, 'Second.md'); await writeFile(second, '# Second\n\nOriginal content');
  const attachments: Buffer[] = [];
  const mailer = new MdToKindleMailer(() => ({ verify: async () => true, sendMail: async message => { assert.equal(message.attachments!.length, 1); attachments.push(message.attachments![0].content as Buffer); return { accepted: ['reader@kindle.com'] }; }, close: () => {} }));
  const session = new StandaloneSession(profile, mailer);
  await session.selectFolder(root, false);
  const state = await session.state(); assert.equal(state.files.length, 2); assert.equal(state.files.some(file => file.selected), false);
  await assert.rejects(session.prepare(), /Choose at least one/);
  session.selection(state.files.map(file => file.id)); await session.prepare();
  await writeFile(second, '# Changed source after review');
  const events: string[] = [];
  const result = await session.send('reader@kindle.com', event => events.push(event.status));
  assert.equal(result.submitted, 2); assert.equal(attachments.length, 2);
  const contents = await Promise.all(attachments.map(async bytes => (await JSZip.loadAsync(bytes)).file('EPUB/content.xhtml')!.async('string')));
  assert.ok(contents.some(html => html.includes('Original content'))); assert.ok(contents.every(html => !html.includes('Changed source')));
  assert.deepEqual(events, ['sending', 'submitted', 'sending', 'submitted']);
  assert.equal((await session.state()).reviewed, false);
  await assert.rejects(session.send('reader@kindle.com'), /already been submitted/);
  assert.equal((await readFile(file, 'utf8')).includes('Unicode'), true);
});

test('a failed batch stops once, blocks the attempted document, and can resume only unattempted documents', async t => {
  const { root, profile } = await fixture(t);
  await writeFile(join(root, 'Second.md'), '# Second'); await writeFile(join(root, 'Third.md'), '# Third');
  let sends = 0; let finish!: () => void; let begin!: () => void;
  const started = new Promise<void>(resolveStart => { begin = resolveStart; });
  const mailer = new MdToKindleMailer(() => ({ verify: async () => true, sendMail: async () => { sends++; if (sends === 1) await new Promise<void>(resolveSend => { finish = resolveSend; begin(); }); if (sends === 2) throw new Error('synthetic connection failure'); return { accepted: ['reader@kindle.com'] }; }, close: () => {} }));
  const session = new StandaloneSession(profile, mailer); await session.selectFolder(root, false);
  const files = (await session.state()).files; session.selection(files.map(file => file.id)); await session.prepare();
  const pending = session.send('reader@kindle.com');
  await started;
  await assert.rejects(session.send('reader@kindle.com'), /current operation/);
  assert.throws(() => session.selection([]), /current operation/);
  finish(); await assert.rejects(pending, /Sending stopped.*delivery may be uncertain/);
  assert.equal(sends, 2);
  const stopped = await session.state(); assert.deepEqual(stopped.files.map(file => file.status), ['submitted', 'failed', 'ready']);
  assert.equal(stopped.files[1].selected, false); assert.equal(stopped.reviewed, true);
  assert.equal((await session.send('reader@kindle.com')).submitted, 1); assert.equal(sends, 3);
});

test('document IDs cannot grant access to an unselected filesystem path and one bad conversion clears the whole review', async t => {
  const { root, file, profile } = await fixture(t);
  const empty = join(root, 'Empty.md'); await writeFile(empty, '');
  const session = new StandaloneSession(profile);
  session.selectFiles([file, empty]); assert.throws(() => session.selection(['C:\\private\\secret.md']), /document list/);
  await assert.rejects(session.prepare(), /empty/); assert.equal((await session.state()).reviewed, false);
  await assert.rejects(session.send('reader@kindle.com'), /review/);
});

test('saving existing settings keeps the password and new grouped Gmail passwords are normalized', async t => {
  const { profile } = await fixture(t);
  const session = new StandaloneSession(profile);
  await session.saveSetup({ ...settings, maxAttachmentMB: 15 }, '');
  assert.equal((await profile.credentials()).password, 'synthetic-password');
  await session.saveSetup({ ...settings, smtpHost: 'smtp.gmail.com' }, 'aaaa bbbb cccc dddd');
  assert.equal((await profile.credentials()).password, 'aaaabbbbccccdddd');
});

test('HTML is sanitized and shell-looking content remains literal Markdown', async t => {
  const { file } = await fixture(t);
  await writeFile(file, '<script>throw new Error("bad")</script>\n\n`$(command)`\n\n![remote](https://example.com/tracker.png)');
  const document = await prepareMarkdownFile(file, settings);
  assert.doesNotMatch(document.previewHtml!, /<script|src="https:/);
  assert.match(document.previewHtml!, /\$\(command\)/);
});
