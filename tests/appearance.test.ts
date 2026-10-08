import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { AppearanceStore } from '../standalone/appearance';

test('appearance defaults to System and preserves the latest choice across app restarts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'md-to-kindle-appearance-'));
  t.after(async () => { assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.ok(basename(root).startsWith('md-to-kindle-appearance-')); await rm(root, { recursive: true, force: true }); });
  const path = join(root, 'appearance.json'); const store = new AppearanceStore(path);
  assert.equal(await store.load(), 'system');
  await store.save('dark'); assert.equal(await new AppearanceStore(path).load(), 'dark');
  await Promise.all([store.save('light'), store.save('dark'), store.save('system')]);
  assert.equal(await new AppearanceStore(path).load(), 'system');
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { mode: 'system' });
});

test('invalid appearance files fall back safely and invalid changes preserve the saved mode', async t => {
  const root = await mkdtemp(join(tmpdir(), 'md-to-kindle-appearance-'));
  t.after(async () => { assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.ok(basename(root).startsWith('md-to-kindle-appearance-')); await rm(root, { recursive: true, force: true }); });
  const path = join(root, 'appearance.json'); const store = new AppearanceStore(path);
  await writeFile(path, '{broken'); assert.equal(await store.load(), 'system');
  await writeFile(path, '{"mode":"unsupported"}'); assert.equal(await store.load(), 'system');
  await store.save('dark'); assert.throws(() => store.save('unsupported'), /System, Light, or Dark/);
  assert.equal(await store.load(), 'dark');
});
