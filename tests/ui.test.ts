import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { TestApp } from './obsidian-stub';
import { SharedProfileStore } from '../src/shared-profile';
import { mkdir, mkdtemp } from 'node:fs/promises';

const browser = new JSDOM('');
Object.assign(globalThis, { document: browser.window.document, DOMParser: browser.window.DOMParser, XMLSerializer: browser.window.XMLSerializer });
const prototype = browser.window.HTMLElement.prototype;
Object.assign(prototype, {
  createEl(this: HTMLElement, tag: string, options: { text?: string; cls?: string; href?: string; attr?: Record<string, string> } = {}) {
    const element = this.ownerDocument.createElement(tag);
    if (options.text) element.textContent = options.text;
    if (options.cls) element.className = options.cls;
    if (options.href) element.setAttribute('href', options.href);
    for (const [name, value] of Object.entries(options.attr || {})) element.setAttribute(name, value);
    this.appendChild(element);
    return element;
  },
  createDiv(this: HTMLElement, options: unknown) { return (this as HTMLElement).createEl('div', options as never); },
  empty(this: HTMLElement) { this.replaceChildren(); },
  addClass(this: HTMLElement, name: string) { this.classList.add(name); },
  setText(this: HTMLElement, value: string) { this.textContent = value; },
  appendText(this: HTMLElement, value: string) { this.appendChild(this.ownerDocument.createTextNode(value)); },
});
let api: typeof import('./ui-entry');
before(async () => {
  const output = await build({ entryPoints: ['tests/ui-entry.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, alias: { obsidian: resolve('tests/obsidian-stub.ts') } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  api = module.exports as typeof api;
});

function fixture() {
  const file = new api.TFile('Notes/Example.md');
  const other = new api.TFile('Files/Book.EPUB');
  const ignored = new api.TFile('Files/Book.mobi');
  const view = new api.MarkdownView(file, { getValue: () => '# Unsaved editor contents\n\nFresh text.' });
  let secretReads = 0;
  const app: TestApp = {
    vault: { getFiles: () => [file, other, ignored], read: async () => 'Old saved text', readBinary: async () => new Uint8Array([1, 2, 3]).buffer },
    workspace: { getActiveViewOfType: () => view, on: (_event, callback) => callback },
    metadataCache: { getFirstLinkpathDest: () => null },
    secretStorage: { getSecret: () => { secretReads++; return 'test-secret'; } },
  };
  const plugin = new api.MdToKindlePlugin(app as never, { id: 'md-to-kindle' } as never);
  plugin.settings = { ...DEFAULT_SETTINGS, kindleEmail: 'reader@kindle.com', passwordSecret: 'test-secret', senderEmail: 'sender@example.com' };
  return { plugin, app, file, view, secretReads: () => secretReads };
}

test('plugin loads commands and menu event without reading secrets or sending', async () => {
  const { plugin, secretReads } = fixture();
  await plugin.onload();
  const stub = plugin as unknown as { commands: { id: string; checkCallback?: (checking: boolean) => boolean }[]; events: unknown[] };
  assert.deepEqual(stub.commands.map(command => command.id), ['send-current-note', 'choose-file-to-send']);
  assert.equal(stub.commands[0].checkCallback!(true), true);
  assert.equal(stub.events.length, 1);
  assert.equal(secretReads(), 0);
});

test('current editor contents are exported instead of stale saved notes; picker filters unsupported files', async () => {
  const { plugin, app, file } = fixture();
  const attachment = await plugin.prepareDocument(file as never);
  assert.match(attachment.previewHtml!, /Unsaved editor contents/);
  assert.doesNotMatch(attachment.previewHtml!, /Old saved text/);
  const picker = new api.FilePicker(app as never, () => {});
  assert.deepEqual(picker.getSuggestions('').map(item => item.path), ['Files/Book.EPUB', 'Notes/Example.md']);
  assert.deepEqual(picker.getSuggestions('example').map(item => item.path), ['Notes/Example.md']);
});

test('preview shows attachment, warnings and recipient; rapid duplicate send and post-success send are blocked', async () => {
  const { plugin, app, file } = fixture();
  const attachment = await plugin.prepareDocument(file as never);
  attachment.warnings.push('Missing image omitted.');
  let calls = 0;
  let finish!: () => void;
  plugin.mailer.send = async () => { calls++; await new Promise<void>(resolve => { finish = resolve; }); };
  const modal = new api.SendPreview(app as never, plugin, attachment);
  modal.open();
  assert.match(modal.contentEl.textContent!, /Example.epub/);
  assert.match(modal.contentEl.textContent!, /Missing image omitted/);
  const recipient = modal.contentEl.querySelector('input')!;
  assert.equal(recipient.value, 'reader@kindle.com');
  assert.equal(modal.contentEl.querySelector('.md-to-kindle-book-preview a[href]'), null);
  const first = modal.send();
  await modal.send();
  assert.equal(calls, 1);
  assert.equal(recipient.disabled, true);
  finish();
  await first;
  assert.match(modal.contentEl.textContent!, /Submitted to your email provider/);
  await modal.send();
  assert.equal(calls, 1);
  modal.close();
});

test('validation failures keep the dialog editable; closing a pending send does not retry', async () => {
  const { plugin, app, file } = fixture();
  plugin.settings.kindleEmail = '';
  const attachment = await plugin.prepareDocument(file as never);
  const modal = new api.SendPreview(app as never, plugin, attachment);
  modal.open();
  await modal.send();
  assert.match(modal.contentEl.textContent!, /complete @kindle.com/);
  const recipient = modal.contentEl.querySelector('input')!;
  assert.equal(recipient.disabled, false);
  recipient.value = 'reader@kindle.com';
  recipient.dispatchEvent(new browser.window.Event('input'));
  let calls = 0;
  let finish!: () => void;
  plugin.mailer.send = async () => { calls++; await new Promise<void>(resolve => { finish = resolve; }); };
  const pending = modal.send();
  await Promise.resolve();
  modal.close();
  finish();
  await pending;
  assert.equal(calls, 1);
});

test('settings use a SecretComponent without a password field', () => {
  const { plugin, app } = fixture();
  const tab = new api.MdToKindleSettingTab(app as never, plugin);
  tab.display();
  assert.equal(tab.containerEl.querySelectorAll('[data-secret-component]').length, 1);
  assert.equal(tab.containerEl.querySelector('input[type="password"]'), null);
  assert.match(tab.containerEl.textContent!, /No email is sent/);
});

test('sharing a configured vault preserves its original local settings and uses the shared password', async () => {
  const { plugin, app } = fixture();
  plugin.settings.smtpHost = 'smtp.example.com';
  plugin.settings.smtpUsername = 'sender@example.com';
  const original = { ...plugin.settings };
  await plugin.saveData(original);
  await mkdir('artifacts/ui-profile-tests', { recursive: true });
  const root = await mkdtemp(resolve('artifacts/ui-profile-tests/run-'));
  const store = new SharedProfileStore(root, { protect: async () => 'protected-fixture', unprotect: async () => 'shared-test-secret' });
  Object.defineProperty(plugin, 'sharedProfile', { get: () => store });
  await plugin.shareSetup();
  assert.equal(plugin.settings.profileMode, 'shared');
  assert.equal(await plugin.getSecret(), 'shared-test-secret');
  const tab = new api.MdToKindleSettingTab(app as never, plugin);
  tab.display();
  assert.equal(tab.containerEl.querySelector('[data-secret-component]'), null);
  assert.match(tab.containerEl.textContent!, /Shared email profile is active/);
  await plugin.useVaultSettings();
  assert.deepEqual(plugin.settings, original);
  assert.equal(await plugin.getSecret(), 'test-secret');
});

test('a running vault picks up helper enrollment before the next preview', async () => {
  const { plugin } = fixture();
  await mkdir('artifacts/ui-profile-tests', { recursive: true });
  const root = await mkdtemp(resolve('artifacts/ui-profile-tests/run-'));
  const store = new SharedProfileStore(root, { protect: async () => 'protected-fixture', unprotect: async () => 'shared-test-secret' });
  await store.create({ ...DEFAULT_SETTINGS, kindleEmail: 'reader@kindle.com', senderEmail: 'shared@example.com', smtpHost: 'smtp.example.com', smtpUsername: 'shared@example.com', passwordSecret: 'test-reference' }, 'synthetic-secret');
  Object.defineProperty(plugin, 'sharedProfile', { get: () => store });
  plugin.settings.senderEmail = '';
  plugin.settings.passwordSecret = '';
  await plugin.saveData({ profileMode: 'shared' });
  await plugin.refreshSharedSettings();
  assert.equal(plugin.settings.senderEmail, 'shared@example.com');
  assert.equal(plugin.settings.profileMode, 'shared');
  assert.equal(await plugin.getSecret(), 'shared-test-secret');
});
