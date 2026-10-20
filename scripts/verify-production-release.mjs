// Read-only verification: compare the installed release's assets with this checkout.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readReleaseMetadata } from './release-metadata.mjs';

const root = new URL('../', import.meta.url);
const base = new URL(process.argv[2] || 'https://pt-status-pwa.vercel.app/');
const { worker, cacheName: version } = await readReleaseMetadata(root);
const list = worker.match(/const ASSETS_TO_CACHE = \[([\s\S]*?)\];/)?.[1];
if (!version || !list) throw new Error('Release manifest could not be read');
const paths = [...new Set(['sw.js', 'version.json', ...[...list.matchAll(/'\.\/([^']*)'/g)].map(match => match[1] || 'index.html')])];
const digest = data => createHash('sha256').update(data).digest('hex');
const failures = [];
const queue = [...paths];
const marker = `${version}-${Date.now()}`;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const path = queue.shift();
    try {
      const url = new URL(path, base);
      url.searchParams.set('release-check', marker);
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remote = Buffer.from(await response.arrayBuffer());
      const local = await readFile(fileURLToPath(new URL(path, root)));
      if (digest(remote) !== digest(local)) failures.push(`${path}: deployed file differs`);
    } catch (error) { failures.push(`${path}: ${error.message}`); }
  }
}));
console.log(`Expected release: ${version}; checked ${paths.length} assets at ${base.origin}`);
if (failures.length) {
  console.error(failures.sort().join('\n'));
  process.exitCode = 1;
} else console.log('Production release matches this checkout.');
