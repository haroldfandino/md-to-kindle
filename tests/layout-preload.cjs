const { contextBridge, ipcRenderer } = require('electron');
// Synthetic documents only. This layout fixture cannot authenticate or send mail.
const settings = { kindleEmail: 'reader@kindle.com', senderEmail: 'sender@example.com' };
const files = Array.from({ length: 60 }, (_, index) => ({ id: String(index), label: `${String(index).padStart(2, '0')} A document with a long descriptive filename.md`, selected: false, status: 'selected', warnings: [] }));
let reviewed = false;
function state() { return { configured: true, settings, source: 'Layout test documents', files, warnings: [], reviewed }; }
function preview(id) {
  return { id, filename: `${id} A document with a long descriptive filename.epub`, size: 12000, settings,
    warnings: Array.from({ length: 8 }, (_, index) => `Conversion warning ${index + 1}: unsupported image omitted from this synthetic document.`),
    previewHtml: `<h1>Book ${id}</h1>${Array.from({ length: 150 }, (_, index) => `<p>Paragraph ${index + 1}. A long document must remain readable from its first paragraph to its last.</p>`).join('')}<p id="document-end">FINAL PARAGRAPH — END OF DOCUMENT</p>` };
}
contextBridge.exposeInMainWorld('kindle', {
  appearance: async mode => { await ipcRenderer.invoke('layout:appearance', mode); return { ok: true, value: mode }; },
  state: async () => ({ ok: true, value: state() }),
  chooseFolder: async () => ({ ok: true, value: state() }),
  chooseFiles: async () => ({ ok: true, value: state() }),
  selection: async ids => { reviewed = false; for (const file of files) { file.selected = ids.includes(file.id); file.status = 'selected'; delete file.size; } return { ok: true, value: state() }; },
  prepare: async () => { reviewed = true; for (const file of files) if (file.selected) { file.status = 'ready'; file.size = 12000; } return { ok: true, value: preview('0') }; },
  preview: async id => ({ ok: true, value: preview(id) }),
  send: async () => { throw new Error('Sending is forbidden in the layout test.'); },
  onProgress: () => {},
});
