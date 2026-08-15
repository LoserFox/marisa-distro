import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourceDirectory = "assets/source";
const outputDirectory = "assets/stickers";

const files = (await readdir(sourceDirectory))
  .filter((file) => file.endsWith(".png"))
  .sort();

await Promise.all(files.map(async (file) => {
  const inputPath = path.join(sourceDirectory, file);
  const outputPath = path.join(outputDirectory, file);
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixelCount = width * height;
  const background = new Uint8Array(pixelCount);
  const queued = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const isMagenta = (index) => {
    const offset = index * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    return red >= 120 && blue >= 100 && Math.min(red, blue) - green >= 4;
  };

  const isStrongMagenta = (index) => {
    const offset = index * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    return red >= 180 && blue >= 160 && Math.min(red, blue) - green >= 80;
  };

  const enqueue = (index) => {
    if (queued[index] || !isMagenta(index)) return;
    queued[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    background[index] = 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  for (let index = 0; index < pixelCount; index += 1) {
    if (!background[index] && !isStrongMagenta(index)) continue;
    const offset = index * channels;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
  }

  await sharp(data, { raw: info }).png().toFile(outputPath);
  console.log(`${file}: removed ${tail.toLocaleString()} connected background pixels`);
}));
