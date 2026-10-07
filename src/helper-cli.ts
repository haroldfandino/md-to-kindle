import { readFile, writeFile, mkdir, unlink, open, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sharedRoot, atomicJson } from './shared-profile';
import { helperConfig, registeredVaults, readJson, loadAssets, syncVaults, type HelperState } from './vault-helper';

const root = sharedRoot();
const lockPath = join(root, 'helper.lock');
const stopPath = join(root, 'helper.stop');
const registry = join(process.env.APPDATA!, 'obsidian', 'obsidian.json');
const args = new Set(process.argv.slice(2));

async function main(): Promise<void> {
  if (args.has('--status')) {
    const status = await readJson(join(root, 'status.json')).catch(() => ({ running: false, message: 'No helper status yet.' }));
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  if (args.has('--stop')) {
    const lock = await readJson(lockPath).catch(() => null) as { token?: string } | null;
    if (lock?.token) await writeFile(stopPath, lock.token, 'utf8');
    console.log('Stop requested. The helper exits within two seconds; its shared profile is preserved.');
    return;
  }
  if (!args.has('--once') && !args.has('--watch')) throw new Error('Use --once, --watch, --status or --stop.');
  await mkdir(root, { recursive: true });
  const assets = await loadAssets(join(root, 'helper', 'plugin'));
  const token = randomUUID();
  try {
    const lock = await open(lockPath, 'wx');
    await lock.writeFile(JSON.stringify({ pid: process.pid, token }));
    await lock.close();
  } catch {
    const existing = await readJson(lockPath).catch(() => null) as { pid?: number } | null;
    if (existing && Number.isInteger(existing.pid)) {
      try { process.kill(existing.pid!, 0); throw new Error('already-running'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw new Error('The helper is already running.'); }
      await unlink(lockPath);
      return main();
    }
    throw new Error('The helper is already starting or its lock is invalid.');
  }
  let state: HelperState = await readJson(join(root, 'state.json')).catch(() => ({ managed: {} })) as HelperState;
  if (!state.managed || typeof state.managed !== 'object') state = { managed: {} };
  let stopping = false;
  let busy = false;
  let watcher: ReturnType<typeof watch> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const cleanup = async () => {
    if (stopping) return;
    stopping = true;
    watcher?.close();
    if (timer) clearInterval(timer);
    const lock = await readJson(lockPath).catch(() => null) as { token?: string } | null;
    if (lock?.token === token) await unlink(lockPath).catch(() => {});
    await atomicJson(join(root, 'status.json'), { running: false, pid: process.pid, checkedAt: new Date().toISOString(), message: 'Helper stopped.' });
  };
  const tick = async () => {
    if (busy || stopping) return;
    busy = true;
    try {
      const requested = await readFile(stopPath, 'utf8').catch(() => '');
      if (requested === token) { await unlink(stopPath).catch(() => {}); await cleanup(); return; }
      const config = helperConfig(await readJson(join(root, 'helper-config.json')));
      const paths = registeredVaults(await readJson(registry));
      const profileReady = await stat(join(root, 'profile.json')).then(info => info.isFile(), () => false);
      const results = await syncVaults(paths, config, state, assets, profileReady);
      await atomicJson(join(root, 'state.json'), state);
      await atomicJson(join(root, 'status.json'), { running: !args.has('--once'), pid: process.pid, checkedAt: new Date().toISOString(), profileReady, results });
    } catch {
      await atomicJson(join(root, 'status.json'), { running: !args.has('--once'), pid: process.pid, checkedAt: new Date().toISOString(), message: 'Registry or helper configuration is temporarily unavailable; retrying.' });
    } finally { busy = false; }
  };
  try {
    await tick();
    if (stopping) return;
    if (args.has('--once')) { await unlink(lockPath); return; }
    timer = setInterval(() => void tick(), 2000);
    try { watcher = watch(dirname(registry), (_event, name) => { if (name?.toString() === 'obsidian.json') void tick(); }); }
    catch { /* Polling remains active if native watching is unavailable. */ }
    process.on('SIGINT', () => void cleanup());
    process.on('SIGTERM', () => void cleanup());
  } catch { await cleanup(); throw new Error('The helper could not start.'); }
}

void main().catch(() => { console.error('md-to-kindle helper failed to start. Check its local configuration and whether another instance is running.'); process.exitCode = 1; });
