import nodemailer from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { PreparedDocument } from './files';
import { attachmentLimit, validateRecipient, validateSmtp, type CourierSettings } from './settings';

export interface MailTransport {
  verify(): Promise<unknown>;
  sendMail(message: SendMailOptions): Promise<{ accepted?: (string | { address: string })[]; rejected?: unknown[] }>;
  close(): void;
}

export type TransportFactory = (options: SMTPTransport.Options) => MailTransport;

export function smtpOptions(settings: CourierSettings, secret: string): SMTPTransport.Options {
  validateSmtp(settings, secret);
  return {
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.tlsMode === 'tls',
    requireTLS: settings.tlsMode === 'starttls',
    tls: { rejectUnauthorized: true, servername: settings.smtpHost },
    auth: { user: settings.smtpUsername, pass: secret },
    name: 'kindle-courier',
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
    dnsTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  };
}

export function mailMessage(settings: CourierSettings, recipient: string, document: PreparedDocument): SendMailOptions {
  validateRecipient(recipient);
  if (document.content.length === 0) throw new Error('The attachment is empty.');
  if (document.content.length > attachmentLimit(settings)) throw new Error(`The attachment exceeds your ${settings.maxAttachmentMB} MB limit.`);
  return {
    from: { address: settings.senderEmail, name: 'Kindle Courier' },
    to: { address: recipient, name: '' },
    envelope: { from: settings.senderEmail, to: [recipient] },
    subject: document.title.replace(/[\r\n]/g, ' ').slice(0, 200),
    text: 'Sent from Kindle Courier. Your document is attached.',
    attachments: [{ filename: document.filename.replace(/[\r\n]/g, '-'), content: document.content, contentType: document.contentType }],
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export function explainMailError(error: unknown): string {
  const detail = error as { code?: string; responseCode?: number; command?: string; message?: string; cause?: { code?: string } } | null;
  if (detail?.code === 'EAUTH' || detail?.responseCode === 535) return 'Authentication failed. Check your SMTP username and Keychain app password.';
  if (detail?.code === 'EMESSAGE' || detail?.responseCode === 552) return 'Your email provider rejected the attachment or its size. Try a smaller document or lower the attachment limit.';
  if (detail?.code === 'EENVELOPE' || detail?.command === 'RCPT TO') return 'Your email provider rejected the sender or Kindle recipient address. Check both addresses and your provider’s sending rules.';
  const tlsCodes = ['ETLS', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN'];
  if (tlsCodes.includes(detail?.code || '') || tlsCodes.includes(detail?.cause?.code || '') || (detail?.code === 'ESOCKET' && /certificate|\bTLS\b|\bSSL\b/i.test(detail.message || ''))) return 'A secure SMTP connection could not be established. Check the hostname, port, and TLS mode.';
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNREFUSED', 'ENOTFOUND', 'EDNS', 'ECONNRESET'].includes(detail?.code || '')) return 'The SMTP connection failed or timed out. Check your network and server settings. If this happened while sending, delivery may be uncertain; check before sending again.';
  // Never expose SMTP response text: providers can echo credentials or message content.
  return 'The email provider did not confirm submission. Check its sending rules and your mailbox before trying again.';
}

export class CourierMailer {
  private busy = false;
  constructor(private readonly factory: TransportFactory = options => nodemailer.createTransport(options)) {}

  get isBusy(): boolean { return this.busy; }

  async verify(settings: CourierSettings, secret: string | null): Promise<void> {
    validateSmtp(settings, secret);
    await this.withTransport(settings, secret!, transport => transport.verify());
  }

  async send(settings: CourierSettings, secret: string | null, recipient: string, document: PreparedDocument): Promise<void> {
    validateSmtp(settings, secret);
    const message = mailMessage(settings, recipient, document);
    await this.withTransport(settings, secret!, async transport => {
      const response = await transport.sendMail(message);
      const accepted = response.accepted?.some(address => (typeof address === 'string' ? address : address.address).toLowerCase() === recipient.toLowerCase());
      if (!accepted || response.rejected?.length) throw Object.assign(new Error('Recipient not accepted'), { code: 'EENVELOPE' });
    });
  }

  private async withTransport(settings: CourierSettings, secret: string, action: (transport: MailTransport) => Promise<unknown>): Promise<void> {
    if (this.busy) throw new Error('An email operation is already in progress.');
    this.busy = true;
    let transport: MailTransport | undefined;
    try {
      transport = this.factory(smtpOptions(settings, secret));
      await action(transport);
    } catch (error) {
      throw new Error(explainMailError(error));
    } finally {
      transport?.close();
      this.busy = false;
    }
  }
}
