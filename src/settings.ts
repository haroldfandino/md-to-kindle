export type TlsMode = 'starttls' | 'tls';

export interface CourierSettings {
  kindleEmail: string;
  senderEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  tlsMode: TlsMode;
  passwordSecret: string;
  maxAttachmentMB: number;
}

export const DEFAULT_SETTINGS: Readonly<CourierSettings> = Object.freeze({
  kindleEmail: '',
  senderEmail: '',
  smtpHost: '',
  smtpPort: 587,
  smtpUsername: '',
  tlsMode: 'starttls',
  passwordSecret: '',
  maxAttachmentMB: 20,
});

// Whitelist persisted fields: never carry a password or unknown keys into data.json.
export function loadSettings(data: unknown): CourierSettings {
  const result = { ...DEFAULT_SETTINGS };
  if (!data || typeof data !== 'object') return result;
  const input = data as Record<string, unknown>;
  for (const key of ['kindleEmail', 'senderEmail', 'smtpHost', 'smtpUsername', 'passwordSecret'] as const) {
    if (typeof input[key] === 'string') result[key] = input[key].trim();
  }
  if (typeof input.smtpPort === 'number') result.smtpPort = input.smtpPort;
  if (typeof input.maxAttachmentMB === 'number') result.maxAttachmentMB = input.maxAttachmentMB;
  if (input.tlsMode === 'starttls' || input.tlsMode === 'tls') result.tlsMode = input.tlsMode;
  return result;
}

export function isEmail(value: string): boolean {
  if (value.length > 254) return false;
  const local = value.split('@')[0];
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  // Accept ordinary mailbox addresses, excluding RFC comments, display names,
  // quoted local parts and multiple-recipient syntax before SMTP parsing.
  return /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+$/i.test(value);
}

export function validateSmtp(settings: CourierSettings, secret: string | null): void {
  if (!isEmail(settings.senderEmail)) throw new Error('Enter a valid sender email address in Kindle Courier settings.');
  if (!settings.smtpHost || /[\s/\\:@\r\n]/.test(settings.smtpHost)) {
    throw new Error('Enter an SMTP hostname, without a URL prefix or port.');
  }
  if (!Number.isInteger(settings.smtpPort) || settings.smtpPort < 1 || settings.smtpPort > 65535) {
    throw new Error('The SMTP port must be a whole number from 1 to 65535.');
  }
  if (!settings.smtpUsername || /[\r\n]/.test(settings.smtpUsername)) throw new Error('Enter your SMTP username.');
  if (!settings.passwordSecret || !secret) throw new Error('Select an app password in the Obsidian Keychain.');
  if (settings.tlsMode !== 'tls' && settings.tlsMode !== 'starttls') throw new Error('Choose a supported TLS mode.');
}

export function validateRecipient(recipient: string): void {
  if (!isEmail(recipient) || !/@(?:free\.)?kindle\.com$/i.test(recipient)) {
    throw new Error('Enter your complete @kindle.com email address.');
  }
}

export function attachmentLimit(settings: CourierSettings): number {
  const limit = settings.maxAttachmentMB;
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    throw new Error('The attachment limit must be between 1 and 50 MB.');
  }
  return Math.floor(limit * 1_000_000);
}
