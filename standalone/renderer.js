const api = window.kindle;
const byId = id => document.getElementById(id);
let busy = false;
let current;
let previewId;
function status(message) { byId('status').textContent = message; }
async function request(promise) { const result = await promise; if (!result.ok) throw new Error(result.error); return result.value; }
function eligible(file) { return file.status !== 'submitted' && file.status !== 'failed'; }
function selected() { return current?.files.filter(file => file.selected && eligible(file)) || []; }
function setBusy(value) {
  busy = value;
  for (const control of document.querySelectorAll('button, input, select')) control.disabled = value;
  if (!value) {
    const count = selected().length;
    byId('refresh').disabled = !count || !current?.configured;
    byId('select-all').disabled = !current?.files.some(eligible);
    byId('send').disabled = !current?.reviewed || !selected().some(file => file.status === 'ready');
    for (const checkbox of document.querySelectorAll('#files input')) checkbox.disabled = !eligible(current.files.find(file => file.id === checkbox.dataset.id));
    for (const button of document.querySelectorAll('#files button')) button.disabled = !current.files.find(file => file.id === button.dataset.id)?.size;
  }
}
function fillSettings(settings) {
  const form = byId('settings-form');
  for (const [key, value] of Object.entries(settings)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value;
  form.elements.namedItem('password').value = '';
  byId('recipient').value = settings.kindleEmail || '';
}
function resetPreview() { previewId = undefined; byId('preview-details').hidden = true; byId('preview-empty').hidden = false; byId('preview').replaceChildren(); }
function render() {
  byId('source').textContent = current.source || 'No files chosen';
  byId('file-count').textContent = current.files.length ? `${current.files.length} Markdown ${current.files.length === 1 ? 'file' : 'files'}` : 'Markdown files · .md and .markdown';
  byId('selection-count').textContent = `${selected().length} ${selected().length === 1 ? 'document' : 'documents'} selected`;
  const available = current.files.filter(eligible).slice(0, 200);
  byId('select-all').textContent = available.length && available.every(file => file.selected) ? 'Clear selection' : current.files.filter(eligible).length > 200 ? 'Select first 200' : 'Select all';
  byId('send').textContent = selected().length > 1 ? `Send ${selected().length} documents` : 'Send to Kindle';
  byId('account').textContent = current.configured ? `Sending from ${current.settings.senderEmail}` : 'Add your email account in Email settings.';
  const files = byId('files'); const listScroll = files.scrollTop; files.replaceChildren();
  if (!current.files.length) { const empty = document.createElement('div'); empty.className = 'list-empty'; empty.textContent = current.source ? 'No Markdown files found in this folder.' : 'Your documents will appear here. Choose a file or browse a folder to begin.'; files.appendChild(empty); }
  for (const file of current.files) {
    const row = document.createElement('div'); row.className = 'file-item'; row.dataset.id = file.id; if (file.id === previewId) row.classList.add('active'); if (file.size) row.classList.add('reviewable');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = file.selected; checkbox.dataset.id = file.id; checkbox.setAttribute('aria-label', `Select ${file.label}`);
    const button = document.createElement('button'); button.className = 'file-preview'; button.dataset.id = file.id; button.setAttribute('aria-label', `Preview ${file.label}`); button.setAttribute('aria-pressed', String(file.id === previewId));
    const content = document.createElement('span'); content.className = 'file-content';
    const name = document.createElement('span'); name.className = 'file-name'; name.textContent = file.label; name.title = file.label;
    const detail = document.createElement('span'); detail.className = 'file-detail';
    detail.textContent = file.error || [file.size ? `${(file.size / 1000000).toFixed(2)} MB` : 'Markdown', file.warnings.length ? `${file.warnings.length} conversion ${file.warnings.length === 1 ? 'warning' : 'warnings'}` : ''].filter(Boolean).join(' · ');
    content.append(name, detail);
    const badge = document.createElement('span'); badge.className = `badge ${file.status}`; badge.textContent = { selected: 'To review', ready: 'Ready', sending: 'Sending', submitted: 'Submitted', failed: 'Stopped' }[file.status];
    button.append(content, badge); row.append(checkbox, button); files.appendChild(row);
  }
  files.scrollTop = listScroll;
  const warnings = byId('folder-warnings'); warnings.replaceChildren(); warnings.hidden = !current.warnings.length;
  for (const warning of current.warnings) { const line = document.createElement('p'); line.textContent = warning; warnings.appendChild(line); }
  setBusy(busy);
}
function showPreview(preview) {
  previewId = preview.id;
  byId('filename').textContent = preview.filename;
  byId('size').textContent = `${(preview.size / 1000000).toFixed(2)} MB · Reflowable EPUB`;
  const warnings = byId('warnings'); warnings.replaceChildren(); warnings.hidden = !preview.warnings.length;
  for (const warning of preview.warnings) { const line = document.createElement('p'); line.textContent = warning; warnings.appendChild(line); }
  byId('preview').innerHTML = preview.previewHtml;
  for (const link of byId('preview').querySelectorAll('a')) link.removeAttribute('href');
  byId('preview-empty').hidden = true; byId('preview-details').hidden = false;
  byId('preview-details').scrollTop = 0;
  render();
}
async function refreshState() { current = await request(api.state()); render(); }
async function initialize() {
  try { await refreshState(); fillSettings(current.settings); if (!current.configured) { byId('settings').hidden = false; status('Connect your email account to begin.'); } }
  catch (error) { status(error.message); }
}
byId('settings-toggle').addEventListener('click', () => { byId('settings').hidden = false; });
byId('settings-close').addEventListener('click', () => { byId('settings').hidden = true; });
for (const [id, operation] of [['choose', () => api.chooseFiles()], ['choose-folder', () => api.chooseFolder(byId('recursive').checked)]]) {
  byId(id).addEventListener('click', async () => {
    if (busy) return; setBusy(true); status('Browsing your documents…');
    try { const result = await request(operation()); if (result.canceled) { status('Selection unchanged.'); return; } current = result; resetPreview(); render(); status(current.files.length ? 'Choose the documents to send, then click Review selected.' : 'No Markdown files chosen. Try another folder or choose a file.'); }
    catch (error) { status(error.message); }
    finally { setBusy(false); }
  });
}
async function changeSelection(ids) {
  if (busy) return; setBusy(true);
  try { current = await request(api.selection(ids)); resetPreview(); render(); status('Click Review selected to prepare your documents.'); }
  catch (error) { status(error.message); render(); }
  finally { setBusy(false); }
}
byId('files').addEventListener('change', event => {
  if (event.target.type !== 'checkbox') return;
  const ids = new Set(selected().map(file => file.id));
  if (event.target.checked) ids.add(event.target.dataset.id); else ids.delete(event.target.dataset.id);
  void changeSelection([...ids]);
});
byId('select-all').addEventListener('click', () => { const available = current.files.filter(eligible).slice(0, 200); void changeSelection(available.every(file => file.selected) ? [] : available.map(file => file.id)); });
byId('files').addEventListener('click', async event => {
  if (busy || event.target.closest('input[type="checkbox"]')) return;
  const row = event.target.closest('.file-item[data-id]');
  if (!row || !current.files.find(file => file.id === row.dataset.id)?.size) return;
  setBusy(true);
  try { showPreview(await request(api.preview(row.dataset.id))); }
  catch (error) { status(error.message); }
  finally { setBusy(false); }
});
byId('refresh').addEventListener('click', async () => {
  if (busy) return; setBusy(true); status('Preparing the selected EPUBs…'); resetPreview();
  try { const preview = await request(api.prepare()); await refreshState(); showPreview(preview); status('Review the documents and Kindle address. Click a document row to read its preview.'); }
  catch (error) { await refreshState().catch(() => {}); status(error.message); }
  finally { setBusy(false); }
});
byId('send').addEventListener('click', async () => {
  if (busy || !current.reviewed) return;
  setBusy(true); byId('progress').hidden = false; byId('progress').value = 0; status('Submitting your documents to your email provider…');
  try { const result = await request(api.send(byId('recipient').value.trim())); status(`Submitted to your email provider. ${result.submitted} ${result.submitted === 1 ? 'document' : 'documents'} submitted. Amazon may ask you to verify the email before Kindle delivery.`); }
  catch (error) { status(error.message); }
  finally { await refreshState().catch(() => {}); setBusy(false); byId('progress').hidden = true; }
});
api.onProgress?.(event => {
  const file = current?.files.find(file => file.id === event.id); if (!file) return;
  file.status = event.status; if (event.status === 'submitted' || event.status === 'failed') file.selected = false; file.error = event.error;
  byId('progress').max = event.total; byId('progress').value = event.completed;
  if (event.status === 'sending') status(`Sending ${event.completed + 1} of ${event.total}: ${file.label}`);
  render();
});
byId('settings-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
  const password = values.password; delete values.password; values.smtpPort = Number(values.smtpPort); values.maxAttachmentMB = Number(values.maxAttachmentMB);
  setBusy(true);
  try { await request(api.save(values, password)); form.elements.namedItem('password').value = ''; resetPreview(); await refreshState(); fillSettings(current.settings); byId('settings-status').textContent = 'Protected email settings saved.'; status('Email settings saved. Review your selected documents before sending.'); }
  catch (error) { byId('settings-status').textContent = error.message; }
  finally { setBusy(false); }
});
byId('test').addEventListener('click', async () => {
  if (busy) return; setBusy(true); byId('settings-status').textContent = 'Testing your saved email connection…';
  try { await request(api.test()); byId('settings-status').textContent = 'Email authentication succeeded. No email was sent.'; }
  catch (error) { byId('settings-status').textContent = error.message; }
  finally { setBusy(false); }
});
void initialize();
