import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('standalone UI displays a reviewed sender and prevents duplicate submission without exposing a password', async () => {
  const browser = new JSDOM(await readFile('standalone/index.html', 'utf8'), { runScripts: 'outside-only', url: 'file:///application/index.html' });
  const { window } = browser;
  const settings = { kindleEmail: 'reader@kindle.com', senderEmail: 'sender@example.com', smtpHost: 'smtp.example.com', smtpUsername: 'sender@example.com', smtpPort: 587, tlsMode: 'starttls', maxAttachmentMB: 20 };
  let sent = 0;
  let finish!: () => void;
  Object.assign(window, { kindle: {
    state: async () => ({ ok: true, value: { configured: true, filename: 'note.md', settings } }),
    prepare: async () => ({ ok: true, value: { filename: 'note.epub', size: 500, settings, warnings: ['Missing image omitted.'], previewHtml: '<h1>Reviewed note</h1><a href="https://example.com">Link</a>' } }),
    send: async () => { sent++; await new Promise<void>(resolve => { finish = resolve; }); return { ok: true }; },
  } });
  window.eval(await readFile('standalone/renderer.js', 'utf8'));
  await new Promise(resolve => setTimeout(resolve, 0));
  const document = window.document;
  assert.equal(document.getElementById('filename')!.textContent, 'note.epub');
  assert.match(document.getElementById('account')!.textContent!, /sender@example.com/);
  assert.match(document.getElementById('warnings')!.textContent!, /Missing image/);
  assert.equal(document.querySelector('#preview a[href]'), null);
  assert.equal((document.querySelector('input[name="password"]') as HTMLInputElement).value, '');
  const button = document.getElementById('send') as HTMLButtonElement;
  button.click(); button.click();
  assert.equal(sent, 1);
  assert.equal(button.disabled, true);
  finish();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(document.getElementById('status')!.textContent!, /Submitted to your email provider/);
  assert.equal(button.disabled, true);
  browser.window.close();
});
