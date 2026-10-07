import { Modal, Notice, PluginSettingTab, SecretComponent, Setting, SuggestModal, TFile, Platform, type App, type ButtonComponent, type TextComponent } from 'obsidian';
import type MdToKindlePlugin from './main';
import { supportedFile, type PreparedDocument } from './files';
import { validateRecipient, type MdToKindleSettings } from './settings';

const AMAZON_SETTINGS = 'https://www.amazon.com/hz/mycd/myx#/home/settings/payment';
const EMAIL_GUIDE = 'https://www.amazon.com/sendtokindle/email';

export class FilePicker extends SuggestModal<TFile> {
  constructor(app: App, private readonly choose: (file: TFile) => void) {
    super(app);
    this.setPlaceholder('Choose a note, EPUB, PDF, or supported document…');
  }

  getSuggestions(query: string): TFile[] {
    const match = query.toLowerCase();
    return this.app.vault.getFiles()
      .filter(file => (file.extension.toLowerCase() === 'md' || supportedFile(file.path)) && file.path.toLowerCase().includes(match))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  renderSuggestion(file: TFile, element: HTMLElement): void {
    element.createDiv({ text: file.name });
    element.createDiv({ text: file.path, cls: 'md-to-kindle-file-path' });
  }

  onChooseSuggestion(file: TFile): void { this.choose(file); }
}

export class SendPreview extends Modal {
  private recipient: string;
  private sendButton!: ButtonComponent;
  private recipientInput!: TextComponent;
  private status!: HTMLElement;
  private sending = false;
  private submitted = false;
  private closed = false;
  private readonly sendSettings: MdToKindleSettings;

  constructor(app: App, private readonly plugin: MdToKindlePlugin, private readonly document: PreparedDocument) {
    super(app);
    this.sendSettings = { ...plugin.settings };
    this.recipient = plugin.settings.kindleEmail;
  }

  onOpen(): void {
    this.closed = false;
    this.modalEl.addClass('md-to-kindle-modal');
    const content = this.contentEl;
    content.empty();
    content.createEl('h2', { text: 'Send to Kindle' });
    content.createEl('p', { text: `${this.document.filename} · ${(this.document.content.length / 1_000_000).toFixed(2)} MB`, cls: 'md-to-kindle-file-meta' });
    new Setting(content).setName('Kindle email').setDesc('This recipient applies to this send. Change the default in md-to-kindle settings.')
      .addText(input => {
        this.recipientInput = input;
        input.setPlaceholder('you@kindle.com').setValue(this.recipient).onChange(value => { this.recipient = value.trim(); });
        input.inputEl.type = 'email';
      });
    content.createEl('p', { text: `Sending from: ${this.sendSettings.senderEmail || 'Set your sender address in md-to-kindle settings'}` });
    if (this.document.warnings.length) {
      const warnings = content.createDiv({ cls: 'md-to-kindle-warnings' });
      warnings.createEl('strong', { text: 'Before you send' });
      const list = warnings.createEl('ul');
      for (const warning of this.document.warnings) list.createEl('li', { text: warning });
    }
    if (this.document.previewHtml) {
      const details = content.createEl('details');
      details.createEl('summary', { text: 'Read the EPUB preview' });
      const preview = details.createDiv({ cls: 'md-to-kindle-book-preview' });
      const parsed = new DOMParser().parseFromString(this.document.previewHtml, 'text/html');
      // Content was sanitized and asset URLs replaced during EPUB preparation.
      // External links are inert in this preview to avoid leaving the dialog.
      for (const link of Array.from(parsed.querySelectorAll('a'))) link.removeAttribute('href');
      for (const node of Array.from(parsed.body.childNodes)) preview.appendChild(content.ownerDocument.importNode(node, true));
    } else {
      content.createEl('p', { text: 'The selected file will be attached unchanged. This dialog does not render existing documents.' });
    }
    content.createEl('p', { text: 'Add your sender email to Amazon’s Approved Personal Document Email List before sending. Amazon may ask you to verify the email.', cls: 'md-to-kindle-help' });
    this.status = content.createDiv({ cls: 'md-to-kindle-status', attr: { role: 'status', 'aria-live': 'polite' } });
    new Setting(content)
      .addButton(button => button.setButtonText('Close').onClick(() => this.close()))
      .addButton(button => {
        this.sendButton = button;
        button.setButtonText('Send').setCta().onClick(() => void this.send());
      });
  }

  async send(): Promise<void> {
    if (this.sending || this.submitted) return;
    this.sending = true;
    this.sendButton.setDisabled(true).setButtonText('Sending…');
    this.recipientInput.setDisabled(true);
    this.status.setText('Submitting your attachment to your email provider…');
    try {
      validateRecipient(this.recipient);
      const secret = await this.plugin.getSecret(this.sendSettings);
      await this.plugin.mailer.send(this.sendSettings, secret, this.recipient, this.document);
      this.submitted = true;
      if (!this.closed) {
        this.status.setText('Submitted to your email provider. Amazon may require email verification before Kindle delivery.');
        this.sendButton.setButtonText('Submitted');
      }
      new Notice('Submitted to your email provider.');
    } catch (error) {
      if (!this.closed) this.status.setText(error instanceof Error ? error.message : 'Submission could not be confirmed.');
      else new Notice(error instanceof Error ? error.message : 'Submission could not be confirmed.');
    } finally {
      this.sending = false;
      if (!this.closed && !this.submitted) {
        this.sendButton.setDisabled(false).setButtonText('Send');
        this.recipientInput.setDisabled(false);
      }
    }
  }

  onClose(): void {
    this.closed = true;
    this.contentEl.empty();
  }
}

export class MdToKindleSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: MdToKindlePlugin) { super(app, plugin); }

  display(): void {
    const { containerEl: content } = this;
    content.empty();
    if (Platform.isWin) {
      new Setting(content).setName('All vaults on this computer').setHeading();
      const shared = this.plugin.settings.profileMode === 'shared';
      new Setting(content).setName(shared ? 'Shared email profile is active' : 'Share your configured email profile')
        .setDesc(shared ? 'Changes here apply to every vault using this Windows account’s shared profile. Your password is protected outside your vaults.' : 'Copies this working setup and app password into a Windows-protected local profile for the automatic all-vault helper. No password is copied into vault settings.')
        .addButton(button => button.setButtonText(shared ? 'Use vault-only settings' : 'Share this setup on this computer').onClick(async () => {
          button.setDisabled(true);
          try {
            if (shared) await this.plugin.useVaultSettings();
            else await this.plugin.shareSetup();
            new Notice(shared ? 'This vault now uses its own settings.' : 'Shared email profile saved for this Windows account.');
            this.display();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : 'The shared profile could not be updated.');
            button.setDisabled(false);
          }
        }));
    }
    new Setting(content).setName('Kindle').setHeading();
    this.textSetting('Kindle email', 'Your editable Send to Kindle recipient.', 'kindleEmail', 'you@kindle.com');
    const guide = content.createEl('p', { cls: 'md-to-kindle-help' });
    guide.appendText('Find your Kindle address and approve your sender in ');
    guide.createEl('a', { text: 'Amazon’s personal document settings', href: AMAZON_SETTINGS, attr: { target: '_blank', rel: 'noopener noreferrer' } });
    guide.appendText('. See the ');
    guide.createEl('a', { text: 'Send to Kindle email guide', href: EMAIL_GUIDE, attr: { target: '_blank', rel: 'noopener noreferrer' } });
    guide.appendText(' for instructions.');
    new Setting(content).setName('Email account').setHeading();
    this.textSetting('Sender email', 'Approve this exact address in your Amazon account.', 'senderEmail', 'you@example.com');
    this.textSetting('SMTP host', 'For Gmail, use smtp.gmail.com. Other providers must support SMTP password authentication.', 'smtpHost', 'smtp.example.com');
    this.numberSetting('SMTP port', 'Use 587 for STARTTLS or 465 for implicit TLS, unless your provider specifies otherwise.', 'smtpPort');
    this.textSetting('SMTP username', 'Usually your complete sender email address.', 'smtpUsername', 'you@example.com');
    new Setting(content).setName('TLS mode').setDesc('Encryption and valid server certificates are required.')
      .addDropdown(dropdown => dropdown.addOption('starttls', 'Required STARTTLS').addOption('tls', 'Implicit TLS')
        .setValue(this.plugin.settings.tlsMode).onChange(async value => {
          this.plugin.settings.tlsMode = value === 'tls' ? 'tls' : 'starttls';
          await this.plugin.saveSettings();
        }));
    if (this.plugin.settings.profileMode === 'shared') {
      content.createEl('p', { text: 'App password: supplied by the Windows-protected shared profile. To replace it, switch this vault to vault-only settings, link the new Keychain secret, then share the setup again.', cls: 'md-to-kindle-help' });
    } else new Setting(content).setName('App password').setDesc('Select or create a secret in Obsidian’s Keychain. Only its name is saved in plugin settings.')
      .addComponent(element => new SecretComponent(this.app, element).setValue(this.plugin.settings.passwordSecret).onChange(value => {
        this.plugin.settings.passwordSecret = value || '';
        void this.plugin.saveSettings();
      }));
    content.createEl('p', { text: 'For Gmail, create an app password with 2-Step Verification enabled. Some accounts or organizations do not allow app passwords. Use another SMTP account if your provider requires OAuth sign-in.', cls: 'md-to-kindle-help' });
    new Setting(content).setName('Test connection').setDesc('Checks encryption and authentication. No email is sent; Kindle approval is not checked.')
      .addButton(button => button.setButtonText('Test connection').onClick(async () => {
        button.setDisabled(true).setButtonText('Testing…');
        try {
          await this.plugin.refreshSharedSettings();
          await this.plugin.mailer.verify({ ...this.plugin.settings }, await this.plugin.getSecret());
          new Notice('SMTP connection and authentication succeeded. No email was sent.');
        } catch (error) {
          new Notice(error instanceof Error ? error.message : 'Connection test failed.');
        } finally {
          button.setDisabled(false).setButtonText('Test connection');
        }
      }));
    new Setting(content).setName('Attachments').setHeading();
    this.numberSetting('Attachment limit (MB)', 'Default: 20 MB. Choose 1–50 MB; email encoding adds size, and your provider may have a lower limit.', 'maxAttachmentMB');
    content.createEl('p', { text: 'Conversion happens locally. Only the selected document and its supported embedded images are sent through your configured email provider to Amazon. No telemetry or hosted relay is used.', cls: 'md-to-kindle-help' });
  }

  private textSetting(name: string, description: string, key: 'kindleEmail' | 'senderEmail' | 'smtpHost' | 'smtpUsername', placeholder: string): void {
    new Setting(this.containerEl).setName(name).setDesc(description).addText(input => input
      .setPlaceholder(placeholder).setValue(this.plugin.settings[key]).onChange(async value => {
        this.plugin.settings[key] = value.trim();
        await this.plugin.saveSettings();
      }));
  }

  private numberSetting(name: string, description: string, key: 'smtpPort' | 'maxAttachmentMB'): void {
    new Setting(this.containerEl).setName(name).setDesc(description).addText(input => {
      input.inputEl.type = 'number';
      input.setValue(String(this.plugin.settings[key])).onChange(async value => {
        this.plugin.settings[key] = value.trim() ? Number(value) : NaN;
        await this.plugin.saveSettings();
      });
    });
  }
}
