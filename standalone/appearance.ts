import { readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { atomicJson } from '../src/shared-profile';

export type AppearanceMode = 'system' | 'light' | 'dark';
export function appearanceMode(value: unknown): AppearanceMode {
  if (value === 'system' || value === 'light' || value === 'dark') return value;
  throw new Error('Choose System, Light, or Dark appearance.');
}

export class AppearanceStore {
  private pending = Promise.resolve();
  constructor(private readonly path: string) {}
  async load(): Promise<AppearanceMode> {
    try { return appearanceMode(JSON.parse(await readFile(this.path, 'utf8')).mode); }
    catch { return 'system'; }
  }
  save(value: unknown): Promise<AppearanceMode> {
    const mode = appearanceMode(value);
    const write = this.pending.then(async () => {
      try { await mkdir(dirname(this.path), { recursive: true }); await atomicJson(this.path, { mode }); return mode; }
      catch { throw new Error('Your appearance preference could not be saved. Check the app data folder permissions.'); }
    });
    this.pending = write.then(() => {}, () => {});
    return write;
  }
}
