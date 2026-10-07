import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadSettings, validateSmtp, validateRecipient, attachmentLimit, type MdToKindleSettings } from './settings';

export function sharedRoot(): string {
  if (platform() !== 'win32' || !process.env.LOCALAPPDATA) throw new Error('The all-vault shared profile currently requires Windows.');
  return join(process.env.LOCALAPPDATA, 'md-to-kindle');
}

export async function atomicJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temp, path);
  } finally { await unlink(temp).catch(() => {}); }
}

export interface SecretProtector {
  protect(secret: string): Promise<string>;
  unprotect(ciphertext: string): Promise<string>;
}

// Only a fixed script is passed on the command line. Passwords travel through
// redirected stdin/stdout and never through argv, environment, files or logs.
async function dpapi(operation: 'Protect' | 'Unprotect', value: string): Promise<string> {
  if (platform() !== 'win32' || !process.env.SystemRoot) throw new Error('Windows password protection is unavailable.');
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $entropy=[Text.Encoding]::UTF8.GetBytes('md-to-kindle:shared-profile:v1'); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const input = operation === 'Protect' ? Buffer.from(value, 'utf8').toString('base64') : value;
  if (input.length > 32_768) throw new Error('The app password exceeds the supported size.');
  return new Promise((resolve, reject) => {
    const child = spawn(join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Windows password protection timed out.')); }, 15_000);
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('ascii');
      if (output.length > 65_536) { child.kill(); reject(new Error('Windows password protection returned an invalid result.')); }
    });
    child.stdin.on('error', () => { /* Close/error below returns a sanitized message. */ });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Windows password protection could not start.')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || !/^[A-Za-z0-9+/=]+$/.test(output)) return reject(new Error('The shared password could not be protected or unlocked for this Windows account.'));
      resolve(operation === 'Protect' ? output : Buffer.from(output, 'base64').toString('utf8'));
    });
    child.stdin.end(input);
  });
}

export const windowsProtector: SecretProtector = {
  protect: secret => dpapi('Protect', secret),
  unprotect: ciphertext => dpapi('Unprotect', ciphertext),
};

interface StoredProfile {
  version: 1;
  protection: 'windows-dpapi-current-user';
  settings: MdToKindleSettings;
  encryptedPassword: string;
}

export class SharedProfileStore {
  constructor(readonly root = sharedRoot(), private readonly protector: SecretProtector = windowsProtector) {}
  private get path(): string { return join(this.root, 'profile.json'); }

  async settings(): Promise<MdToKindleSettings> {
    const profile = await this.read();
    return { ...loadSettings(profile.settings), profileMode: 'shared', passwordSecret: '' };
  }

  async secret(): Promise<string> {
    return this.protector.unprotect((await this.read()).encryptedPassword);
  }

  async create(settings: MdToKindleSettings, secret: string | null): Promise<void> {
    validateSmtp(settings, secret);
    validateRecipient(settings.kindleEmail);
    attachmentLimit(settings);
    const encryptedPassword = await this.protector.protect(secret!);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await atomicJson(this.path, {
      version: 1, protection: 'windows-dpapi-current-user',
      settings: { ...loadSettings(settings), profileMode: 'shared', passwordSecret: '' }, encryptedPassword,
    } satisfies StoredProfile);
  }

  async updateSettings(settings: MdToKindleSettings): Promise<void> {
    const existing = await this.read();
    await atomicJson(this.path, { ...existing, settings: { ...loadSettings(settings), profileMode: 'shared', passwordSecret: '' } });
  }

  private async read(): Promise<StoredProfile> {
    try {
      if ((await stat(this.path)).size > 65_536) throw new Error('Profile is too large');
      const input: unknown = JSON.parse((await readFile(this.path, 'utf8')).replace(/^\uFEFF/, ''));
      if (!input || typeof input !== 'object') throw new Error('Invalid profile');
      const profile = input as StoredProfile;
      if (profile.version !== 1 || profile.protection !== 'windows-dpapi-current-user' || typeof profile.encryptedPassword !== 'string' || !profile.encryptedPassword) throw new Error('Invalid profile');
      return profile;
    } catch { throw new Error('The shared email profile is unavailable. In your configured vault, use “Share this setup on this computer”, or choose vault-only settings.'); }
  }
}
