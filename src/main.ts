import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { createEpub } from './epub';
import { imageType, localImageTarget, prepareFile, supportedFile, type PreparedDocument } from './files';
import { CourierMailer } from './mail';
import { attachmentLimit, loadSettings, type CourierSettings } from './settings';
import { CourierSettingTab, FilePicker, SendPreview } from './ui';

export default class KindleCourier extends Plugin {
  settings: CourierSettings = loadSettings(null);
  readonly mailer = new CourierMailer();
  private preparing = false;

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    this.addSettingTab(new CourierSettingTab(this.app, this));
    this.addCommand({
      id: 'send-current-note',
      name: 'Send current note',
      checkCallback: checking => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return false;
        if (!checking) void this.previewFile(view.file, view.editor.getValue());
        return true;
      },
    });
    this.addCommand({
      id: 'choose-file-to-send',
      name: 'Choose file to send',
      callback: () => new FilePicker(this.app, file => void this.previewFile(file)).open(),
    });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && (file.extension.toLowerCase() === 'md' || supportedFile(file.path))) {
        menu.addItem(item => item.setTitle('Send to Kindle').setIcon('send').onClick(() => void this.previewFile(file)));
      }
    }));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(loadSettings(this.settings));
  }

  getSecret(): string | null {
    return this.settings.passwordSecret ? this.app.secretStorage.getSecret(this.settings.passwordSecret) : null;
  }

  async prepareDocument(file: TFile, editorContent?: string): Promise<PreparedDocument> {
    const limit = attachmentLimit(this.settings);
    if (file.stat.size > limit && editorContent === undefined) throw new Error(`The selected file exceeds your ${this.settings.maxAttachmentMB} MB limit.`);
    if (file.extension.toLowerCase() !== 'md') {
      if (!supportedFile(file.path)) throw new Error('This file type is not supported.');
      const document = prepareFile(file.name, await this.app.vault.readBinary(file));
      if (document.content.length > limit) throw new Error(`The selected file exceeds your ${this.settings.maxAttachmentMB} MB limit.`);
      return document;
    }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const markdown = editorContent ?? (view?.file?.path === file.path ? view.editor.getValue() : await this.app.vault.read(file));
    return createEpub({ title: file.basename, markdown, sourcePath: file.path }, async target => {
      const safeTarget = localImageTarget(target);
      if (!safeTarget) return null;
      const image = this.app.metadataCache.getFirstLinkpathDest(safeTarget, file.path);
      if (!(image instanceof TFile) || !/^(png|jpe?g|gif)$/i.test(image.extension)) return null;
      if (image.stat.size > limit) throw new Error(`An embedded image exceeds your ${this.settings.maxAttachmentMB} MB limit.`);
      const bytes = new Uint8Array(await this.app.vault.readBinary(image));
      return imageType(bytes) ? { path: image.path, bytes } : null;
    }, limit);
  }

  async previewFile(file: TFile, editorContent?: string): Promise<void> {
    if (this.preparing) { new Notice('A document preview is already being prepared.'); return; }
    this.preparing = true;
    try {
      const document = await this.prepareDocument(file, editorContent);
      new SendPreview(this.app, this, document).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'The document could not be prepared.');
    } finally {
      this.preparing = false;
    }
  }
}
