import { readFile, writeFile } from 'node:fs/promises';
import { readReleaseMetadata } from './release-metadata.mjs';
const version = process.argv[2];
if (!/^v\d+$/.test(version || '')) throw new Error('Usage: node scripts/set-release-version.mjs vNNN');
const root = new URL('../', import.meta.url);
for (const [file, pattern, replacement] of [
  ['app-updates.js', /static VERSION = "v\d+"/, `static VERSION = "${version}"`],
  ['sw.js', /const CACHE_NAME = 'pt-status-pwa-v\d+'/, `const CACHE_NAME = 'pt-status-pwa-${version}'`]
]) {
  const url = new URL(file, root), source = await readFile(url, 'utf8');
  if (!pattern.test(source)) throw new Error(`Version declaration missing: ${file}`);
  await writeFile(url, source.replace(pattern, replacement));
}
await writeFile(new URL('version.json', root), JSON.stringify({ version, buildTime: new Date().toISOString() }, null, 2) + '\n');
await readReleaseMetadata(root);
console.log(`Release versions synchronized: ${version}`);
