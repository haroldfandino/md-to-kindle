import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { platform } from 'node:os';
import { SharedProfileStore, windowsProtector } from '../src/shared-profile';
import { DEFAULT_SETTINGS } from '../src/settings';

const settings = { ...DEFAULT_SETTINGS, kindleEmail: 'reader@kindle.com', senderEmail: 'sender@example.com', smtpHost: 'smtp.example.com', smtpUsername: 'sender@example.com', passwordSecret: 'vault-secret-reference' };

async function temporaryRoot() {
  await mkdir('artifacts/profile-tests', { recursive: true });
  return mkdtemp(resolve('artifacts/profile-tests/run-'));
}

test('shared settings omit the Keychain reference and retain only protected credentials', async () => {
  const root = await temporaryRoot();
  const store = new SharedProfileStore(root, { protect: async () => 'protected-test-blob', unprotect: async () => 'synthetic-password' });
  await store.create(settings, 'synthetic-password');
  const raw = await readFile(join(root, 'profile.json'), 'utf8');
  assert.doesNotMatch(raw, /synthetic-password|vault-secret-reference/);
  assert.equal((await store.settings()).profileMode, 'shared');
  assert.equal(await store.secret(), 'synthetic-password');
  await store.updateSettings({ ...settings, kindleEmail: 'another@kindle.com' });
  assert.equal((await store.settings()).kindleEmail, 'another@kindle.com');
  assert.equal(await store.secret(), 'synthetic-password');
});

test('failed protection does not create a plaintext fallback; missing profiles fail clearly', async () => {
  const root = await temporaryRoot();
  const store = new SharedProfileStore(root, { protect: async () => { throw new Error('test encryption failure'); }, unprotect: async () => { throw new Error('test'); } });
  await assert.rejects(store.create(settings, 'synthetic-password'), /encryption failure/);
  await assert.rejects(readFile(join(root, 'profile.json')), /ENOENT/);
  await assert.rejects(store.secret(), /shared email profile is unavailable/);
});

test('real Windows DPAPI protects and unlocks a synthetic secret without storing plaintext', { skip: platform() !== 'win32' }, async () => {
  const secret = 'synthetic-test-password-123';
  const encrypted = await windowsProtector.protect(secret);
  assert.notEqual(encrypted, Buffer.from(secret).toString('base64'));
  assert.equal(await windowsProtector.unprotect(encrypted), secret);
  await assert.rejects(windowsProtector.unprotect('invalidciphertext'), /could not be protected or unlocked/);
});
