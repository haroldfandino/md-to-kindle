import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SharedProfileStore } from '../src/shared-profile';
import { selectedFileArgument } from '../src/standalone-file';
import { StandaloneSession } from './session';

app.setName('md-to-kindle');
const sessions = new Map<number, StandaloneSession>();
const pending: string[] = [];
let ready = false;

function profile(): SharedProfileStore {
  if (process.platform === 'win32') return new SharedProfileStore();
  if (process.platform !== 'darwin') throw new Error('The standalone sender currently supports Windows and macOS.');
  return new SharedProfileStore(join(app.getPath('appData'), 'md-to-kindle'), {
    protect: async secret => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS Keychain protection is unavailable.');
      return safeStorage.encryptString(secret).toString('base64');
    },
    unprotect: async encrypted => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS Keychain protection is unavailable.');
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    },
  }, 'electron-safe-storage');
}

function createWindow(path?: string): void {
  const window = new BrowserWindow({
    title: 'md-to-kindle', width: 900, height: 820, minWidth: 650, minHeight: 620,
    backgroundColor: '#faf7f1', autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  sessions.set(window.webContents.id, new StandaloneSession(profile(), undefined, path));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const id = window.webContents.id;
  window.on('close', event => {
    if (sessions.get(id)?.isBusy) {
      event.preventDefault();
      void dialog.showMessageBox(window, { type: 'info', buttons: ['OK'], message: 'An operation is still running.', detail: 'Wait for it to finish before closing this window.' });
    }
  });
  window.on('closed', () => sessions.delete(id));
  void window.loadFile(join(__dirname, 'index.html'));
}

app.on('open-file', (event, path) => {
  event.preventDefault();
  if (ready) createWindow(path);
  else pending.push(path);
});

const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    try { createWindow(selectedFileArgument(argv)); }
    catch { dialog.showErrorBox('md-to-kindle', 'Choose one .md or .markdown file.'); }
  });
  app.whenReady().then(() => {
    ready = true;
    for (const operation of ['state', 'choose', 'prepare', 'send', 'save', 'test'] as const) {
      ipcMain.handle(`mdk:${operation}`, async (event, ...args: unknown[]) => {
        // Requests must originate in a window we own, from its main frame.
        const session = sessions.get(event.sender.id);
        if (!session || event.senderFrame !== event.sender.mainFrame || event.sender.getURL() !== pathToFileURL(join(__dirname, 'index.html')).toString()) return { ok: false, error: 'Invalid application request.' };
        try {
          let value: unknown;
          if (operation === 'state') value = await session.state();
          if (operation === 'choose') {
            const owner = BrowserWindow.fromWebContents(event.sender);
            if (!owner) throw new Error('The sender window is unavailable.');
            const result = await dialog.showOpenDialog(owner, { properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] });
            if (!result.canceled && result.filePaths[0]) session.select(result.filePaths[0]);
            value = await session.state();
          }
          if (operation === 'prepare') value = await session.prepare();
          if (operation === 'send') await session.send(args[0]);
          if (operation === 'save') await session.saveSetup(args[0], args[1]);
          if (operation === 'test') await session.test();
          return { ok: true, value };
        } catch (error) {
          const code = (error as NodeJS.ErrnoException)?.code;
          const message = code === 'ENOENT' ? 'The selected file is no longer available.' : code === 'EACCES' || code === 'EPERM' ? 'The selected file cannot be read. Check its permissions.' : error instanceof Error ? error.message : 'The operation failed.';
          return { ok: false, error: message };
        }
      });
    }
    try {
      if (pending.length) pending.splice(0).forEach(createWindow);
      else createWindow(selectedFileArgument(process.argv));
    } catch { createWindow(); }
  }).catch(() => { dialog.showErrorBox('md-to-kindle', 'The standalone sender could not start.'); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
