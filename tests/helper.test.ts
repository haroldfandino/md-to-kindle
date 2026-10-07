import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, stat, unlink, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { helperConfig, registeredVaults, syncVaults, vaultKey, type HelperState } from '../src/vault-helper';

const assets = new Map([
  ['main.js', Buffer.from('test plugin code')],
  ['manifest.json', Buffer.from('{"id":"md-to-kindle","isDesktopOnly":true,"version":"0.2.0"}')],
  ['styles.css', Buffer.from('/* scoped CSS */')],
  ['LICENSE', Buffer.from('test license')],
  ['THIRD_PARTY_NOTICES.md', Buffer.from('test dependency notices')],
]);
const config = helperConfig({ enabled: true, excludedVaults: [], configFolders: {} });

async function fixture() {
  await mkdir('artifacts/helper-tests', { recursive: true });
  const root = await mkdtemp(resolve('artifacts/helper-tests/run-'));
  async function vault(name: string, enabled: string[] | null = ['another-plugin'], folder = '.obsidian') {
    const path = join(root, name);
    await mkdir(join(path, folder), { recursive: true });
    if (enabled) await writeFile(join(path, folder, 'community-plugins.json'), JSON.stringify(enabled));
    return path;
  }
  return { root, vault, state: { managed: {} } as HelperState };
}

test('registry discovery requires absolute registered paths and deduplicates them', () => {
  const root = resolve('artifacts/vault');
  assert.deepEqual(registeredVaults({ vaults: { a: { path: root }, b: { path: root }, c: { path: '../unsafe' }, d: {} } }), [root]);
  assert.throws(() => registeredVaults({ vaults: null }));
});

test('all-vault installation preserves unrelated plugins and local settings, with no password copied', async () => {
  const { vault, state } = await fixture();
  const first = await vault('First');
  const second = await vault('Second');
  const plugin = join(first, '.obsidian', 'plugins', 'md-to-kindle');
  await mkdir(plugin, { recursive: true });
  await writeFile(join(plugin, 'data.json'), JSON.stringify({ kindleEmail: 'reader@kindle.com', passwordSecret: 'local-key-reference', custom: 42 }));
  const results = await syncVaults([first, second], config, state, assets);
  assert.equal(results.every(result => result.status === 'installed-and-enabled'), true);
  assert.deepEqual(JSON.parse(await readFile(join(first, '.obsidian', 'community-plugins.json'), 'utf8')), ['another-plugin', 'md-to-kindle']);
  const data = JSON.parse(await readFile(join(plugin, 'data.json'), 'utf8'));
  assert.deepEqual(data, { kindleEmail: 'reader@kindle.com', passwordSecret: 'local-key-reference', custom: 42, profileMode: 'shared' });
  assert.deepEqual(JSON.parse(await readFile(join(second, '.obsidian', 'plugins', 'md-to-kindle', 'data.json'), 'utf8')), { profileMode: 'shared' });
  const before = (await stat(join(plugin, 'main.js'))).mtimeMs;
  await syncVaults([first, second], config, state, assets);
  assert.equal((await stat(join(plugin, 'main.js'))).mtimeMs, before);
});

test('newly registered vaults are enrolled on the next discovery pass', async () => {
  const { vault, state } = await fixture();
  const first = await vault('Existing');
  await syncVaults([first], config, state, assets);
  const added = await vault('AddedLater');
  await syncVaults([first, added], config, state, assets);
  assert.equal(JSON.parse(await readFile(join(added, '.obsidian', 'plugins', 'md-to-kindle', 'manifest.json'), 'utf8')).id, 'md-to-kindle');
});

test('helper startup before sharing preserves working local setup and enables only when a profile exists', async () => {
  const { vault, state } = await fixture();
  const path = await vault('Waiting');
  const plugin = join(path, '.obsidian', 'plugins', 'md-to-kindle');
  await mkdir(plugin, { recursive: true });
  await writeFile(join(plugin, 'data.json'), '{"senderEmail":"existing@example.com","passwordSecret":"original-key"}');
  assert.equal((await syncVaults([path], config, state, assets, false))[0].status, 'installed-awaiting-shared-profile');
  const local = JSON.parse(await readFile(join(plugin, 'data.json'), 'utf8'));
  assert.equal(local.profileMode, undefined);
  assert.equal(local.passwordSecret, 'original-key');
  assert.deepEqual(JSON.parse(await readFile(join(path, '.obsidian', 'community-plugins.json'), 'utf8')), ['another-plugin']);
  await syncVaults([path], config, state, assets, true);
  assert.equal(JSON.parse(await readFile(join(plugin, 'data.json'), 'utf8')).profileMode, 'shared');
});

test('vaults without a community plugin list wait for community plugins without changing security settings', async () => {
  const { vault, state } = await fixture();
  const path = await vault('New', null);
  const result = await syncVaults([path], config, state, assets);
  assert.equal(result[0].status, 'installed-awaiting-community-plugins');
  await assert.rejects(readFile(join(path, '.obsidian', 'community-plugins.json')), /ENOENT/);
  await writeFile(join(path, '.obsidian', 'community-plugins.json'), '[]');
  assert.equal((await syncVaults([path], config, state, assets))[0].status, 'installed-and-enabled');
});

test('paused and excluded vaults are not modified; unavailable or malformed vaults do not block others', async () => {
  const { vault, state, root } = await fixture();
  const excluded = await vault('Excluded');
  const valid = await vault('Valid');
  const broken = await vault('Broken');
  await writeFile(join(broken, '.obsidian', 'community-plugins.json'), '{invalid');
  const result = await syncVaults([excluded, valid, broken, join(root, 'Missing')], { ...config, excludedVaults: [excluded] }, state, assets);
  assert.deepEqual(result.map(item => item.status), ['excluded', 'installed-and-enabled', 'unavailable-or-invalid-config', 'unavailable-or-invalid-config']);
  await assert.rejects(readFile(join(excluded, '.obsidian', 'plugins', 'md-to-kindle', 'manifest.json')), /ENOENT/);
  const paused = await vault('Paused');
  assert.equal((await syncVaults([paused], { ...config, enabled: false }, state, assets))[0].status, 'helper-paused');
  await assert.rejects(readFile(join(paused, '.obsidian', 'plugins', 'md-to-kindle', 'manifest.json')), /ENOENT/);
});

test('disabling or removing an enrolled plugin is respected instead of undone', async () => {
  const { vault, state } = await fixture();
  const disabled = await vault('Disabled');
  const removed = await vault('Removed');
  await syncVaults([disabled, removed], config, state, assets);
  await writeFile(join(disabled, '.obsidian', 'community-plugins.json'), '["another-plugin"]');
  await unlink(join(removed, '.obsidian', 'plugins', 'md-to-kindle', 'manifest.json'));
  assert.deepEqual((await syncVaults([disabled, removed], config, state, assets)).map(item => item.status), ['user-disabled-or-removed', 'user-disabled-or-removed']);
  assert.equal(state.managed[vaultKey(disabled)].optedOut, true);
  await assert.rejects(readFile(join(removed, '.obsidian', 'plugins', 'md-to-kindle', 'manifest.json')), /ENOENT/);
});

test('custom config folders work; linked or escaping plugin directories are rejected', async () => {
  const { vault, state, root } = await fixture();
  const custom = await vault('Custom', ['other'], '.custom');
  assert.equal((await syncVaults([custom], { ...config, configFolders: { [vaultKey(custom)]: '.custom' } }, state, assets))[0].status, 'installed-and-enabled');
  const unsafe = await vault('Unsafe');
  assert.equal((await syncVaults([unsafe], { ...config, configFolders: { [vaultKey(unsafe)]: '../escape' } }, state, assets))[0].status, 'unavailable-or-invalid-config');
  const linked = await vault('Linked');
  const outside = join(root, 'outside');
  await mkdir(outside);
  await symlink(outside, join(linked, '.obsidian', 'plugins'), 'junction');
  assert.equal((await syncVaults([linked], config, state, assets))[0].status, 'unavailable-or-invalid-config');
  await assert.rejects(readFile(join(outside, 'md-to-kindle', 'main.js')), /ENOENT/);
});

test('subsequent bundle updates preserve vault-only opt-out and do not rewrite data', async () => {
  const { vault, state } = await fixture();
  const path = await vault('Configured');
  await syncVaults([path], config, state, assets);
  const dataPath = join(path, '.obsidian', 'plugins', 'md-to-kindle', 'data.json');
  await writeFile(dataPath, '{"profileMode":"vault","custom":true}');
  const updated = new Map(assets);
  updated.set('main.js', Buffer.from('updated code'));
  await syncVaults([path], config, state, updated);
  assert.deepEqual(JSON.parse(await readFile(dataPath, 'utf8')), { profileMode: 'vault', custom: true });
  assert.equal(await readFile(join(path, '.obsidian', 'plugins', 'md-to-kindle', 'main.js'), 'utf8'), 'updated code');
});
