const api = window.kindle;
const byId = id => document.getElementById(id);
let ready = false;
let busy = false;
function status(message) { byId('status').textContent = message; }
function setBusy(value) {
  busy = value;
  for (const button of document.querySelectorAll('button')) button.disabled = value;
  byId('recipient').disabled = value;
  byId('send').disabled = value || !ready;
}
async function request(promise) {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function fillSettings(settings) {
  const form = byId('settings-form');
  for (const [key, value] of Object.entries(settings)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value;
  form.elements.namedItem('password').value = '';
  byId('recipient').value = settings.kindleEmail || '';
}
async function prepare() {
  ready = false;
  setBusy(true);
  status('Preparing your EPUB…');
  try {
    const preview = await request(api.prepare());
    byId('filename').textContent = preview.filename;
    byId('size').textContent = `${(preview.size / 1000000).toFixed(2)} MB · Converted from the saved Markdown file`;
    byId('account').textContent = `Sending from: ${preview.settings.senderEmail}`;
    byId('recipient').value = preview.settings.kindleEmail;
    const warnings = byId('warnings'); warnings.replaceChildren(); warnings.hidden = !preview.warnings.length;
    for (const warning of preview.warnings) { const line = document.createElement('p'); line.textContent = warning; warnings.appendChild(line); }
    byId('preview').innerHTML = preview.previewHtml;
    for (const link of byId('preview').querySelectorAll('a')) link.removeAttribute('href');
    byId('preview-details').hidden = false;
    ready = true;
    status('Review the recipient and preview, then send when ready.');
  } catch (error) { status(error.message); }
  finally { setBusy(false); }
}
async function initialize() {
  try {
    const current = await request(api.state());
    fillSettings(current.settings);
    byId('filename').textContent = current.filename || 'Choose a Markdown file';
    byId('account').textContent = current.configured ? `Sending from: ${current.settings.senderEmail}` : 'Configure your email account to begin.';
    byId('settings').hidden = current.configured;
    if (current.configured && current.filename) await prepare();
    else if (!current.configured) status('Connect an email account below. If you already use md-to-kindle on this Windows account, share its setup from Obsidian first.');
  } catch (error) { status(error.message); }
}
byId('settings-toggle').addEventListener('click', () => { byId('settings').hidden = !byId('settings').hidden; });
byId('choose').addEventListener('click', async () => {
  if (busy) return;
  try { await request(api.choose()); await initialize(); } catch (error) { status(error.message); }
});
byId('refresh').addEventListener('click', () => { if (!busy) void prepare(); });
byId('send').addEventListener('click', async () => {
  if (busy || !ready) return;
  setBusy(true); status('Submitting your document to your email provider…');
  try {
    await request(api.send(byId('recipient').value.trim()));
    ready = false;
    status('Submitted to your email provider. Amazon may ask you to verify the email before Kindle delivery.');
  } catch (error) { status(error.message); }
  finally { setBusy(false); }
});
byId('settings-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const password = values.password; delete values.password;
  values.smtpPort = Number(values.smtpPort); values.maxAttachmentMB = Number(values.maxAttachmentMB);
  setBusy(true);
  try { await request(api.save(values, password)); form.elements.namedItem('password').value = ''; ready = false; await initialize(); if (!ready) status('Protected email settings saved. Choose a Markdown file to send.'); }
  catch (error) { status(error.message); }
  finally { setBusy(false); }
});
byId('test').addEventListener('click', async () => {
  if (busy) return; setBusy(true); status('Testing your saved email connection…');
  try { await request(api.test()); status('Email authentication succeeded. No email was sent.'); }
  catch (error) { status(error.message); }
  finally { setBusy(false); }
});
void initialize();
