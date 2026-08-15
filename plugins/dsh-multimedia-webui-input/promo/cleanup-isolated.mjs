import { readFile, realpath, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const requested = process.argv[2];
if (!requested) throw new Error('usage: node promo/cleanup-isolated.mjs <isolated-root>');

const root = await realpath(resolve(requested));
const temporaryRoot = await realpath(tmpdir());
if (!root.startsWith(`${temporaryRoot}/dshca-promo-v2-`)) {
  throw new Error(`refusing non-promo temporary root: ${root}`);
}
const marker = JSON.parse(await readFile(join(root, '.dshca-promo-environment.json'), 'utf8'));
if (marker.schemaVersion !== 1 || marker.purpose !== 'dsh-multimedia-webui-input-promo' || marker.root !== root) {
  throw new Error(`refusing unowned temporary root: ${root}`);
}

await rm(root, { recursive: true });
process.stdout.write(`removed isolated promo environment: ${root}\n`);
