import { readFile, writeFile, mkdir, lstat, realpath, stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJson } from './shared-profile';

export const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md'] as const;

export interface HelperConfig {
  enabled: boolean;
  excludedVaults: string[];
  configFolders: Record<string, string>;
}
export interface ManagedVault {
  configPath: string;
  enrolled: boolean;
  everEnabled: boolean;
  optedOut?: boolean;
  assetHash?: string;
  sharedEnrolled?: boolean;
}
export interface VaultResult { path: string; status: string; }
export interface HelperState { managed: Record<string, ManagedVault>; }

export function vaultKey(path: string): string { return resolve(path).toLowerCase(); }

export function helperConfig(input: unknown): HelperConfig {
  if (!input || typeof input !== 'object') throw new Error('The helper configuration is invalid.');
  const raw = input as Record<string, unknown>;
  const excludedVaults = Array.isArray(raw.excludedVaults) ? raw.excludedVaults.filter((value): value is string => typeof value === 'string' && isAbsolute(value)) : [];
  const configFolders: Record<string, string> = {};
  if (raw.configFolders && typeof raw.configFolders === 'object') {
    for (const [key, value] of Object.entries(raw.configFolders)) if (isAbsolute(key) && typeof value === 'string') configFolders[vaultKey(key)] = value;
  }
  return { enabled: raw.enabled === true, excludedVaults, configFolders };
}

export function registeredVaults(input: unknown): string[] {
  if (!input || typeof input !== 'object' || !('vaults' in input) || !input.vaults || typeof input.vaults !== 'object') throw new Error('Obsidian’s vault registry is unavailable or invalid.');
  const paths = Object.values(input.vaults).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('path' in entry) || typeof entry.path !== 'string' || !isAbsolute(entry.path)) return [];
    return [resolve(entry.path)];
  });
  return [...new Map(paths.map(path => [vaultKey(path), path])).values()];
}

async function safeDirectory(root: string, destination: string, create: boolean): Promise<void> {
  const rel = relative(root, destination);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new Error('A plugin path escapes the vault.');
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    let info;
    try { info = await lstat(current); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw error;
      await mkdir(current);
      info = await lstat(current);
    }
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Plugin installation through linked or non-directory paths is not supported.');
  }
}

export async function readJson(path: string): Promise<unknown> {
  if ((await stat(path)).size > 4_000_000) throw new Error('Configuration file is too large.');
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function noLinkedFile(path: string): Promise<void> {
  if (await exists(path)) {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Linked configuration files are not supported.');
  }
}

export async function loadAssets(source: string): Promise<Map<string, Buffer>> {
  const assets = new Map<string, Buffer>();
  for (const file of PLUGIN_FILES) assets.set(file, await readFile(join(source, file)));
  const manifest = JSON.parse(assets.get('manifest.json')!.toString('utf8'));
  if (manifest.id !== 'md-to-kindle' || manifest.isDesktopOnly !== true) throw new Error('The helper’s plugin bundle is invalid.');
  return assets;
}

export async function syncVaults(paths: string[], config: HelperConfig, state: HelperState, assets: Map<string, Buffer>, profileReady = true): Promise<VaultResult[]> {
  const results: VaultResult[] = [];
  if (!config.enabled) return paths.map(path => ({ path, status: 'helper-paused' }));
  const excluded = new Set(config.excludedVaults.map(vaultKey));
  const assetHash = createHash('sha256');
  for (const [name, bytes] of assets) assetHash.update(name).update(bytes);
  const bundleHash = assetHash.digest('hex');
  for (const path of paths) {
    const key = vaultKey(path);
    if (excluded.has(key)) { results.push({ path, status: 'excluded' }); continue; }
    try {
      const root = await realpath(path);
      const folder = config.configFolders[key] || '.obsidian';
      if (!folder.startsWith('.') || isAbsolute(folder) || folder.split(/[\\/]/).includes('..') || folder === '.') throw new Error('Invalid config folder.');
      const configPath = resolve(root, folder);
      // Wait for Obsidian to create the configuration folder; never create a vault.
      await safeDirectory(root, configPath, false);
      const pluginPath = join(configPath, 'plugins', 'md-to-kindle');
      const previous = state.managed[key];
      if (previous?.configPath === configPath && previous.enrolled && !(await exists(join(pluginPath, 'manifest.json')))) {
        previous.optedOut = true;
        results.push({ path, status: 'user-disabled-or-removed' });
        continue;
      }
      const enabledPath = join(configPath, 'community-plugins.json');
      await noLinkedFile(enabledPath);
      const hasPluginList = await exists(enabledPath);
      const enabledInput = hasPluginList ? await readJson(enabledPath) : null;
      if (hasPluginList && (!Array.isArray(enabledInput) || !enabledInput.every(value => typeof value === 'string'))) throw new Error('Invalid enabled-plugin list.');
      let enabled = enabledInput as string[] | null;
      if (previous?.configPath === configPath && previous.optedOut) {
        if (enabled?.includes('md-to-kindle') && await exists(join(pluginPath, 'manifest.json'))) previous.optedOut = false;
        else { results.push({ path, status: 'user-disabled-or-removed' }); continue; }
      }
      if (previous?.configPath === configPath && previous.everEnabled && enabled && !enabled.includes('md-to-kindle')) {
        previous.optedOut = true;
        results.push({ path, status: 'user-disabled-or-removed' });
        continue;
      }
      await safeDirectory(root, pluginPath, true);
      for (const [filename, bytes] of previous?.assetHash === bundleHash ? [] : assets) {
        const target = join(pluginPath, filename);
        await noLinkedFile(target);
        const old = await exists(target) ? await readFile(target) : null;
        if (!old || !createHash('sha256').update(old).digest().equals(createHash('sha256').update(bytes).digest())) await writeFile(target, bytes);
      }
      const dataPath = join(pluginPath, 'data.json');
      await noLinkedFile(dataPath);
      const sharedEnrolled = previous?.configPath === configPath && previous.sharedEnrolled === true;
      if (profileReady && !sharedEnrolled) {
        const input = await exists(dataPath) ? await readJson(dataPath) : {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid plugin settings.');
        await atomicJson(dataPath, { ...input, profileMode: 'shared' });
      }
      if (profileReady && enabled && !enabled.includes('md-to-kindle')) {
        // Re-read immediately before writing so unrelated plugin changes are retained.
        const latest = await readJson(enabledPath);
        if (!Array.isArray(latest) || !latest.every(value => typeof value === 'string')) throw new Error('Invalid enabled-plugin list.');
        enabled = latest.includes('md-to-kindle') ? latest : [...latest, 'md-to-kindle'];
        await atomicJson(enabledPath, enabled);
      }
      state.managed[key] = { configPath, enrolled: true, everEnabled: enabled?.includes('md-to-kindle') === true, assetHash: bundleHash, sharedEnrolled: sharedEnrolled || profileReady };
      results.push({ path, status: !profileReady ? 'installed-awaiting-shared-profile' : enabled ? 'installed-and-enabled' : 'installed-awaiting-community-plugins' });
    } catch { results.push({ path, status: 'unavailable-or-invalid-config' }); }
  }
  return results;
}
