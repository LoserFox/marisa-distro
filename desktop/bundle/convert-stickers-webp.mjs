// convert-stickers-webp.mjs — shrink dsh-stickers runtime assets by converting
// the shipped PNG stickers to WebP and rewriting the vendored plugin's file
// references from .png to .webp.
//
// Usage: node convert-stickers-webp.mjs <dsh-stickers-plugin-dir>
//
// The runtime only reads assets/stickers/ (plus assets/stickers/black/), so
// this script deliberately does not touch assets/source or wechat-submission;
// those are pruned separately by make-bundle.ps1.
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const pluginRoot = process.argv[2];
if (!pluginRoot) {
  console.error('usage: node convert-stickers-webp.mjs <dsh-stickers-plugin-dir>');
  process.exit(2);
}

const stickersDir = path.join(pluginRoot, 'assets', 'stickers');
let converted = 0;
let deletedBytes = 0;

async function convertDir(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await convertDir(full);
      continue;
    }
    if (!entry.name.toLowerCase().endsWith('.png')) continue;
    const input = full;
    const output = full.replace(/\.png$/i, '.webp');
    const before = (await readFile(input)).length;
    await sharp(input).webp({ quality: 82, effort: 4 }).toFile(output);
    const after = (await readFile(output)).length;
    deletedBytes += before;
    await rm(input, { force: true });
    converted++;
    console.log(`  webp ${path.relative(pluginRoot, input)} ${before} -> ${after} bytes`);
  }
}

await convertDir(stickersDir);
console.log(`converted ${converted} PNGs to WebP, removed ${(deletedBytes / 1e6).toFixed(1)} MB of PNG input`);

// Patch vendored runtime/source references from .png to .webp.
const filesToPatch = [
  'lib/index.js',
  'lib/client.js',
  'src/index.ts',
  'src/shared/catalog.ts',
];
for (const rel of filesToPatch) {
  const file = path.join(pluginRoot, rel);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  const patched = text.replace(/\.png/g, '.webp');
  if (patched !== text) {
    await writeFile(file, patched, 'utf8');
    console.log(`  patched ${rel} (.png -> .webp)`);
  }
}

// Bump the client cache-busting revision so browsers fetch the new WebP files.
for (const rel of ['lib/client.js', 'src/shared/catalog.ts']) {
  const file = path.join(pluginRoot, rel);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  const patched = text.replace(/STICKER_ASSET_REVISION\s*=\s*["']2["']/g, 'STICKER_ASSET_REVISION = "3"');
  if (patched !== text) {
    await writeFile(file, patched, 'utf8');
    console.log(`  bumped ${rel} STICKER_ASSET_REVISION -> 3`);
  }
}
