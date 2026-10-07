import { build, context } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const options = {
  entryPoints: ['src/main.ts'],
  outfile: 'main.js',
  bundle: true,
  external: ['obsidian', 'electron'],
  platform: 'node',
  format: 'cjs',
  target: 'es2022',
  minify: true,
  metafile: true,
  logLevel: 'info',
  banner: { js: '/* md-to-kindle | MIT License | See LICENSE */' },
};

if (process.argv.includes('--watch')) {
  const watcher = await context(options);
  await watcher.watch();
} else {
  const result = await build(options);
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/bundle-meta.json', JSON.stringify(result.metafile, null, 2));
}
