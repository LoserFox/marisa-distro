import { mkdir, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const source = fileURLToPath(new URL('../assets/stickers/', import.meta.url))
const output = fileURLToPath(new URL('../docs/sticker-thumbnails-v2/', import.meta.url))

await mkdir(output, { recursive: true })
const files = (await readdir(source)).filter(file => file.endsWith('.png')).sort()

await Promise.all(files.map(async (file) => {
  await sharp(`${source}${file}`)
    .resize({ width: 240, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 82 })
    .toFile(`${output}${file}`)
}))

console.log(`Generated ${files.length} README thumbnails.`)
