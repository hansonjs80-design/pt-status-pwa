import { readFile } from 'node:fs/promises';

export async function readReleaseMetadata(root = new URL('../', import.meta.url)) {
  const [module, worker, json] = await Promise.all(['app-updates.js', 'sw.js', 'version.json'].map(file => readFile(new URL(file, root), 'utf8')));
  const version = module.match(/static VERSION = "(v\d+)"/)?.[1];
  const cacheName = worker.match(/const CACHE_NAME = '([^']+)'/)?.[1];
  if (!version || JSON.parse(json).version !== version || cacheName !== `pt-status-pwa-${version}`) {
    throw new Error('Release versions differ. Run node scripts/set-release-version.mjs vNNN before release.');
  }
  return { version, cacheName, worker };
}
