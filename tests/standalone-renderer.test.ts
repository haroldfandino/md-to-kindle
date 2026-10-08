import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('GUI chooses a folder, selects and reviews documents, displays progress and prevents duplicate sends', async () => {
  const browser = new JSDOM(await readFile('standalone/index.html', 'utf8'), { runScripts: 'outside-only', url: 'file:///application/index.html' });
  const { window } = browser;
  const settings = { kindleEmail: 'reader@kindle.com', senderEmail: 'sender@example.com', smtpHost: 'smtp.example.com', smtpUsername: 'sender@example.com', smtpPort: 587, tlsMode: 'starttls', maxAttachmentMB: 20 };
  const current = { configured: true, settings, source: '', files: [] as { id: string; label: string; status: string; selected: boolean; size?: number; warnings: string[] }[], warnings: [], reviewed: false };
  let sent = 0; let prepared = 0; let previews = 0; let selections = 0; let finish!: () => void; let progress!: (event: unknown) => void;
  const preview = { id: 'one', filename: 'note.epub', size: 500, settings, warnings: ['Missing image omitted.'], previewHtml: '<h1>Reviewed note</h1><a href="https://example.com">Link</a>' };
  Object.assign(window, { kindle: {
    state: async () => ({ ok: true, value: structuredClone(current) }),
    chooseFolder: async (recursive: boolean) => { assert.equal(recursive, true); current.source = 'Notes'; current.files = [{ id: 'one', label: '<script>note.md</script>', status: 'selected', selected: false, warnings: [] }]; return { ok: true, value: structuredClone(current) }; },
    chooseFiles: async () => ({ ok: true, value: { ...structuredClone(current), canceled: true } }),
    selection: async (ids: string[]) => { selections++; current.reviewed = false; current.files[0].selected = ids.includes('one'); return { ok: true, value: structuredClone(current) }; },
    prepare: async () => { prepared++; current.reviewed = true; Object.assign(current.files[0], { status: 'ready', size: 500, warnings: preview.warnings }); return { ok: true, value: preview }; },
    preview: async () => { previews++; return { ok: true, value: preview }; },
    onProgress: (callback: typeof progress) => { progress = callback; },
    send: async () => { sent++; progress({ id: 'one', status: 'sending', completed: 0, total: 1 }); await new Promise<void>(resolve => { finish = resolve; }); current.reviewed = false; Object.assign(current.files[0], { status: 'submitted', selected: false }); return { ok: true, value: { submitted: 1 } }; },
  } });
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  window.eval(await readFile('standalone/renderer.js', 'utf8')); await tick();
  const document = window.document; const click = (id: string) => (document.getElementById(id) as HTMLButtonElement).click();
  assert.equal(document.getElementById('settings')!.hidden, true);
  assert.equal((document.getElementById('send') as HTMLButtonElement).disabled, true);
  click('choose-folder'); await tick(); assert.equal(prepared, 0); assert.match(document.getElementById('source')!.textContent!, /Notes/);
  assert.equal(document.querySelector('#files script'), null);
  click('select-all'); await tick(); click('refresh'); await tick();
  assert.equal(prepared, 1); assert.equal(document.getElementById('filename')!.textContent, 'note.epub');
  assert.match(document.getElementById('account')!.textContent!, /sender@example.com/);
  assert.match(document.getElementById('warnings')!.textContent!, /Missing image/);
  assert.equal(document.querySelector('#preview a[href]'), null);
  assert.equal((document.querySelector('input[name="password"]') as HTMLInputElement).value, '');
  // Padding, size text and the status badge all open the same book, without
  // changing which documents are checked for sending.
  for (const selector of ['.file-item', '.file-detail', '.badge']) {
    const selectionCount = selections;
    (document.querySelector(`#files ${selector}`) as HTMLElement).click(); await tick();
    assert.equal(selections, selectionCount); assert.equal(current.files[0].selected, true);
  }
  assert.equal(previews, 3);
  assert.equal(document.getElementById('preview-details')!.tabIndex, 0);
  assert.equal(document.querySelector('#files .file-preview')!.getAttribute('aria-pressed'), 'true');
  click('choose'); await tick(); assert.equal(document.getElementById('filename')!.textContent, 'note.epub');
  assert.equal((document.getElementById('send') as HTMLButtonElement).disabled, false);
  click('send'); click('send'); assert.equal(sent, 1); assert.equal((document.getElementById('send') as HTMLButtonElement).disabled, true);
  assert.equal(document.querySelector('#files .badge')!.textContent, 'Sending');
  finish(); await tick(); assert.match(document.getElementById('status')!.textContent!, /Submitted to your email provider/);
  assert.equal((document.getElementById('send') as HTMLButtonElement).disabled, true);
  // The checkbox keeps its own selection action and does not open a preview.
  current.files[0].status = 'ready'; current.files[0].selected = true; current.reviewed = true;
  (document.getElementById('choose-folder') as HTMLButtonElement).click(); await tick();
  (document.querySelector('#files input[type="checkbox"]') as HTMLInputElement).click(); await tick();
  assert.equal(previews, 3); assert.ok(selections > 1);
  browser.window.close();
});

test('theme controls load and save independently of document selection and recover from save failures', async () => {
  const browser = new JSDOM(await readFile('standalone/index.html', 'utf8'), { runScripts: 'outside-only', url: 'file:///application/index.html' });
  const { window } = browser;
  let stateCalls = 0; let fail = false; const changes: string[] = [];
  Object.assign(window, { kindle: {
    state: async () => { stateCalls++; return { ok: true, value: { configured: true, appearance: 'dark', settings: { kindleEmail: 'reader@kindle.com', senderEmail: 'sender@example.com' }, source: '', files: [], warnings: [], reviewed: false } }; },
    appearance: async (mode: string) => { changes.push(mode); return fail ? { ok: false, error: 'Could not save appearance.' } : { ok: true, value: mode }; },
  } });
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  window.eval(await readFile('standalone/renderer.js', 'utf8')); await tick();
  const selector = window.document.getElementById('appearance') as HTMLSelectElement;
  assert.equal(selector.value, 'dark'); assert.equal(window.document.documentElement.dataset.theme, 'dark');
  for (const mode of ['light', 'system']) { selector.value = mode; selector.dispatchEvent(new window.Event('change')); await tick(); assert.equal(window.document.documentElement.dataset.theme, mode); }
  assert.equal(stateCalls, 1); assert.deepEqual(changes, ['light', 'system']);
  fail = true; selector.value = 'dark'; selector.dispatchEvent(new window.Event('change')); await tick();
  assert.equal(selector.value, 'system'); assert.equal(window.document.documentElement.dataset.theme, 'system');
  assert.match(window.document.getElementById('status')!.textContent!, /Could not save/); assert.equal(selector.disabled, false);
  browser.window.close();
});
