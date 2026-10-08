import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { prepareMarkdownFile, markdownFile, markdownFolder, type MarkdownSource } from '../src/standalone-file';
import { MdToKindleMailer } from '../src/mail';
import type { SharedProfileStore } from '../src/shared-profile';
import { DEFAULT_SETTINGS, loadSettings, validateSmtp, validateRecipient, attachmentLimit, type MdToKindleSettings } from '../src/settings';
import type { PreparedDocument } from '../src/files';

export type DocumentStatus = 'selected' | 'ready' | 'sending' | 'submitted' | 'failed';
interface Entry extends MarkdownSource { id: string; selected: boolean; status: DocumentStatus; document?: PreparedDocument; error?: string }
export interface PreviewState { id: string; filename: string; size: number; warnings: string[]; previewHtml: string; settings: MdToKindleSettings }
export interface DeliveryProgress { id: string; status: DocumentStatus; completed: number; total: number; error?: string }

export class StandaloneSession {
  private entries: Entry[] = [];
  private reviewedSettings?: MdToKindleSettings;
  private busy = false;
  private source = '';
  private warnings: string[] = [];
  constructor(private readonly profile: SharedProfileStore, private readonly mailer = new MdToKindleMailer(), path?: string) { if (path) this.select(path); }
  get isBusy(): boolean { return this.busy; }
  private available(): void { if (this.busy) throw new Error('Wait for the current operation to finish.'); }
  private clearReview(): void {
    this.reviewedSettings = undefined;
    for (const entry of this.entries) if (entry.status !== 'submitted' && entry.status !== 'failed') { entry.document = undefined; entry.status = 'selected'; }
  }
  private replace(files: MarkdownSource[], label: string, warnings: string[] = []): void {
    this.entries = files.map(file => ({ ...file, id: randomUUID(), selected: false, status: 'selected' }));
    if (this.entries.length === 1) this.entries[0].selected = true;
    this.source = label; this.warnings = warnings; this.reviewedSettings = undefined;
  }
  async state() {
    const settings = await this.profile.settings().catch(() => undefined);
    return {
      configured: !!settings, settings: settings || { ...DEFAULT_SETTINGS, profileMode: 'shared' as const }, source: this.source, warnings: this.warnings,
      filename: this.entries.length === 1 ? basename(this.entries[0].path) : '',
      files: this.entries.map(({ id, label, selected, status, document, error }) => ({ id, label, selected, status, error, size: document?.content.length, warnings: document?.warnings || [] })),
      reviewed: !!this.reviewedSettings && this.entries.some(entry => entry.selected && entry.status === 'ready'),
    };
  }
  select(path: string): void { this.selectFiles([path]); }
  selectFiles(paths: string[]): void {
    this.available();
    if (!paths.length || paths.length > 200 || paths.some(path => !markdownFile(path))) throw new Error('Choose up to 200 Markdown files.');
    const unique = [...new Set(paths.map(path => resolve(path)))];
    this.replace(unique.map(path => ({ path, label: basename(path) })), unique.length === 1 ? basename(unique[0]) : `${unique.length} chosen files`);
    for (const entry of this.entries) entry.selected = true;
  }
  async selectFolder(path: string, recursive: boolean): Promise<void> {
    this.available(); this.busy = true;
    try { const result = await markdownFolder(path, recursive); this.replace(result.files, basename(path), result.warnings); }
    finally { this.busy = false; }
  }
  selection(ids: unknown): void {
    this.available();
    if (!Array.isArray(ids) || ids.length > 200 || ids.some(id => typeof id !== 'string' || !this.entries.some(entry => entry.id === id))) throw new Error('Choose up to 200 files from the document list.');
    const selected = new Set(ids);
    this.clearReview();
    for (const entry of this.entries) entry.selected = selected.has(entry.id) && entry.status !== 'submitted' && entry.status !== 'failed';
  }
  async prepare(): Promise<PreviewState> {
    this.available();
    const selected = this.entries.filter(entry => entry.selected && entry.status !== 'submitted' && entry.status !== 'failed');
    if (!selected.length) throw new Error('Choose at least one Markdown file first.');
    this.busy = true; this.clearReview();
    try {
      const settings = await this.profile.settings();
      let bytes = 0;
      for (const entry of selected) {
        const document = await prepareMarkdownFile(entry.path, settings);
        bytes += document.content.length + Buffer.byteLength(document.previewHtml || '', 'utf8');
        if (bytes > 100_000_000) throw new Error('Selected documents and previews exceed the 100 MB review limit. Select fewer documents.');
        entry.document = document; entry.status = 'ready'; entry.error = undefined;
      }
      this.reviewedSettings = settings;
      return this.preview(selected[0].id);
    } catch (error) { this.clearReview(); throw error; }
    finally { this.busy = false; }
  }
  preview(id: unknown): PreviewState {
    const entry = this.entries.find(entry => entry.id === id);
    if (!entry?.document || !this.reviewedSettings) throw new Error('Review the selected documents first.');
    return { id: entry.id, filename: entry.document.filename, size: entry.document.content.length, warnings: entry.document.warnings, previewHtml: entry.document.previewHtml || '', settings: this.reviewedSettings };
  }
  async send(recipient: unknown, progress: (event: DeliveryProgress) => void = () => {}): Promise<{ submitted: number }> {
    this.available();
    const pending = this.entries.filter(entry => entry.selected && entry.status === 'ready' && entry.document);
    if (!pending.length) throw new Error(this.entries.some(entry => entry.status === 'submitted') ? 'This preview has already been submitted.' : 'Prepare and review the files before sending.');
    if (!this.reviewedSettings) throw new Error('Prepare and review the files before sending.');
    if (typeof recipient !== 'string') throw new Error('Enter your Kindle email address.');
    validateRecipient(recipient);
    this.busy = true;
    let completed = 0;
    try {
      const { settings, password } = await this.profile.credentials();
      if (JSON.stringify(settings) !== JSON.stringify(this.reviewedSettings)) throw new Error('Email settings changed. Refresh the review before sending.');
      for (const entry of pending) {
        entry.status = 'sending'; progress({ id: entry.id, status: 'sending', completed, total: pending.length });
        try { await this.mailer.send(settings, password, recipient, entry.document!); }
        catch (error) {
          entry.status = 'failed'; entry.selected = false; entry.error = error instanceof Error ? error.message : 'Submission failed.';
          progress({ id: entry.id, status: 'failed', completed, total: pending.length, error: entry.error });
          entry.document = undefined;
          throw new Error(`${entry.label}: ${entry.error} Sending stopped. Unattempted documents remain ready. Check your mailbox before adding the failed document again; its delivery may be uncertain.`);
        }
        entry.status = 'submitted'; entry.selected = false; completed++;
        progress({ id: entry.id, status: 'submitted', completed, total: pending.length });
        entry.document = undefined;
      }
      return { submitted: completed };
    } finally { this.busy = false; }
  }
  async saveSetup(input: unknown, password: unknown): Promise<void> {
    this.available();
    if (!input || typeof input !== 'object' || typeof password !== 'string') throw new Error('Enter valid email settings.');
    const settings = { ...loadSettings(input), profileMode: 'shared' as const, passwordSecret: '' };
    validateRecipient(settings.kindleEmail); attachmentLimit(settings); this.busy = true;
    try {
      const secret = password || (await this.profile.credentials().catch(() => { throw new Error('Enter an app password to connect this account.'); })).password;
      validateSmtp(settings, secret);
      if (password) await this.profile.create(settings, settings.smtpHost.toLowerCase() === 'smtp.gmail.com' ? password.replace(/\s+/g, '') : password);
      else await this.profile.updateSettings(settings);
      this.clearReview();
    } finally { this.busy = false; }
  }
  async test(): Promise<void> {
    this.available(); this.busy = true;
    try { const { settings, password } = await this.profile.credentials(); await this.mailer.verify(settings, password); }
    finally { this.busy = false; }
  }
}
