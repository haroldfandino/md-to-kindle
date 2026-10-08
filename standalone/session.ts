import { basename } from 'node:path';
import { prepareMarkdownFile } from '../src/standalone-file';
import { MdToKindleMailer } from '../src/mail';
import type { SharedProfileStore } from '../src/shared-profile';
import { DEFAULT_SETTINGS, loadSettings, validateSmtp, validateRecipient, attachmentLimit, type MdToKindleSettings } from '../src/settings';
import type { PreparedDocument } from '../src/files';

export interface PreviewState {
  filename: string;
  size: number;
  warnings: string[];
  previewHtml: string;
  settings: MdToKindleSettings;
}

export class StandaloneSession {
  private prepared?: PreparedDocument;
  private reviewedSettings?: MdToKindleSettings;
  private busy = false;
  private submitted = false;
  constructor(private readonly profile: SharedProfileStore, private readonly mailer = new MdToKindleMailer(), public path?: string) {}
  get isBusy(): boolean { return this.busy; }

  async state() {
    try { return { configured: true, settings: await this.profile.settings(), filename: this.path ? basename(this.path) : '' }; }
    catch { return { configured: false, settings: { ...DEFAULT_SETTINGS, profileMode: 'shared' as const }, filename: this.path ? basename(this.path) : '' }; }
  }

  select(path: string): void {
    if (this.busy) throw new Error('Wait for the current email operation to finish.');
    this.path = path;
    this.prepared = undefined;
    this.reviewedSettings = undefined;
    this.submitted = false;
  }

  async prepare(): Promise<PreviewState> {
    if (this.busy) throw new Error('An operation is already in progress.');
    if (!this.path) throw new Error('Choose a Markdown file first.');
    this.busy = true;
    try {
      const settings = await this.profile.settings();
      const document = await prepareMarkdownFile(this.path, settings);
      this.prepared = document;
      this.reviewedSettings = settings;
      this.submitted = false;
      return { filename: document.filename, size: document.content.length, warnings: document.warnings, previewHtml: document.previewHtml || '', settings };
    } finally { this.busy = false; }
  }

  async send(recipient: unknown): Promise<void> {
    if (this.busy || this.submitted) throw new Error(this.submitted ? 'This preview has already been submitted.' : 'An operation is already in progress.');
    if (!this.prepared || !this.reviewedSettings) throw new Error('Prepare and review the file before sending.');
    if (typeof recipient !== 'string') throw new Error('Enter your Kindle email address.');
    validateRecipient(recipient);
    this.busy = true;
    try {
      const { settings, password } = await this.profile.credentials();
      if (JSON.stringify(settings) !== JSON.stringify(this.reviewedSettings)) throw new Error('Email settings changed. Refresh the preview before sending.');
      await this.mailer.send(settings, password, recipient, this.prepared);
      this.submitted = true;
    } finally { this.busy = false; }
  }

  async saveSetup(input: unknown, password: unknown): Promise<void> {
    if (this.busy) throw new Error('An operation is already in progress.');
    if (!input || typeof input !== 'object' || typeof password !== 'string') throw new Error('Enter valid email settings.');
    const settings = { ...loadSettings(input), profileMode: 'shared' as const, passwordSecret: '' };
    validateRecipient(settings.kindleEmail);
    attachmentLimit(settings);
    this.busy = true;
    try {
      const secret = password || (await this.profile.credentials().catch(() => { throw new Error('Enter an app password to connect this account.'); })).password;
      validateSmtp(settings, secret);
      if (password) await this.profile.create(settings, settings.smtpHost.toLowerCase() === 'smtp.gmail.com' ? password.replace(/\s+/g, '') : password);
      else await this.profile.updateSettings(settings);
      this.prepared = undefined;
      this.reviewedSettings = undefined;
      this.submitted = false;
    } finally { this.busy = false; }
  }

  async test(): Promise<void> {
    if (this.busy) throw new Error('An operation is already in progress.');
    this.busy = true;
    try {
      const { settings, password } = await this.profile.credentials();
      await this.mailer.verify(settings, password);
    } finally { this.busy = false; }
  }
}
