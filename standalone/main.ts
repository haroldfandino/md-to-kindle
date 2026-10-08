import { app, BrowserWindow, ipcMain, dialog, safeStorage, nativeTheme } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SharedProfileStore } from '../src/shared-profile';
import { StandaloneSession } from './session';
import { AppearanceStore, type AppearanceMode } from './appearance';

app.setName('md-to-kindle');
const sessions = new Map<number, StandaloneSession>();
let appearance: AppearanceMode = 'system';
let appearanceStore: AppearanceStore;
const windowBackground = () => nativeTheme.shouldUseDarkColors ? '#171d19' : '#f5f3ed';
nativeTheme.on('updated', () => { for (const window of BrowserWindow.getAllWindows()) window.setBackgroundColor(windowBackground()); });

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

function createWindow(): void {
  const window = new BrowserWindow({
    title: 'md-to-kindle', width: 1160, height: 850, minWidth: 850, minHeight: 650,
    backgroundColor: windowBackground(), autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  sessions.set(window.webContents.id, new StandaloneSession(profile()));
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

const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
    else createWindow();
  });
  app.whenReady().then(async () => {
    appearanceStore = new AppearanceStore(join(app.getPath('userData'), 'appearance.json'));
    appearance = await appearanceStore.load();
    nativeTheme.themeSource = appearance;
    for (const operation of ['state', 'appearance', 'chooseFiles', 'chooseFolder', 'selection', 'prepare', 'preview', 'send', 'save', 'test'] as const) {
      ipcMain.handle(`mdk:${operation}`, async (event, ...args: unknown[]) => {
        // Requests must originate in a window we own, from its main frame.
        const session = sessions.get(event.sender.id);
        if (!session || event.senderFrame !== event.sender.mainFrame || event.sender.getURL() !== pathToFileURL(join(__dirname, 'index.html')).toString()) return { ok: false, error: 'Invalid application request.' };
        try {
          let value: unknown;
          if (operation === 'state') value = { ...await session.state(), appearance };
          if (operation === 'appearance') {
            appearance = await appearanceStore.save(args[0]);
            nativeTheme.themeSource = appearance;
            value = appearance;
          }
          if (operation === 'chooseFiles' || operation === 'chooseFolder') {
            if (session.isBusy) throw new Error('Wait for the current operation to finish.');
            const owner = BrowserWindow.fromWebContents(event.sender);
            if (!owner) throw new Error('The sender window is unavailable.');
            const result = await dialog.showOpenDialog(owner, operation === 'chooseFiles'
              ? { title: 'Choose Markdown files', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] }
              : { title: 'Choose a Markdown folder', properties: ['openDirectory'] });
            if (!result.canceled && result.filePaths.length) {
              if (operation === 'chooseFiles') session.selectFiles(result.filePaths);
              else await session.selectFolder(result.filePaths[0], args[0] === true);
            }
            value = { ...await session.state(), canceled: result.canceled };
          }
          if (operation === 'selection') { session.selection(args[0]); value = await session.state(); }
          if (operation === 'prepare') value = await session.prepare();
          if (operation === 'preview') value = session.preview(args[0]);
          if (operation === 'send') value = await session.send(args[0], progress => { if (!event.sender.isDestroyed()) event.sender.send('mdk:progress', progress); });
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
    createWindow();
  }).catch(() => { dialog.showErrorBox('md-to-kindle', 'The standalone sender could not start.'); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
