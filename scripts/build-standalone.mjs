import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';

const info = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('standalone-dist', { recursive: true });
const result = await build({ entryPoints: ['standalone/main.ts'], outfile: 'standalone-dist/main.cjs', bundle: true, external: ['electron'], platform: 'node', format: 'cjs', target: 'node22', minify: true, metafile: true, logLevel: 'info' });
await build({ entryPoints: ['standalone/preload.ts'], outfile: 'standalone-dist/preload.cjs', bundle: true, external: ['electron'], platform: 'node', format: 'cjs', target: 'node22', logLevel: 'info' });
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/standalone-bundle-meta.json', JSON.stringify(result.metafile, null, 2));
for (const file of ['index.html', 'app.css', 'renderer.js']) await copyFile(`standalone/${file}`, `standalone-dist/${file}`);
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(file, `standalone-dist/${file}`);
await writeFile('standalone-dist/package.json', JSON.stringify({ name: 'md-to-kindle', version: info.version, main: 'main.cjs', description: info.description, author: 'Harold Fandino', license: 'MIT' }, null, 2));
