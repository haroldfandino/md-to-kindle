import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { prepareMarkdownFile, selectedFileArgument, markdownFile } from '../src/standalone-file';
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

test('file arguments preserve literal paths and reject other formats', () => {
  const path = resolve('Read me & café.md');
  assert.equal(selectedFileArgument(['app.exe', '--file', path]), path);
  assert.equal(markdownFile('FILE.MARKDOWN'), true);
  assert.equal(selectedFileArgument(['app.exe']), undefined);
  assert.throws(() => selectedFileArgument(['--file', 'program.exe']), /Choose one/);
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
