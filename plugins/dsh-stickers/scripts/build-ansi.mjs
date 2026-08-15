import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const source = new URL('../assets/stickers/', import.meta.url)
const output = new URL('../assets/ansi/', import.meta.url)
await mkdir(output, { recursive: true })

const { readdir } = await import('node:fs/promises')
for (const input of (await readdir(source)).filter(name => name.endsWith('.png'))) {
  const width = 60
  const { data, info } = await sharp(fileURLToPath(new URL(input, source))).resize({ width, fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const rows = []
  for (let y = 0; y < info.height; y += 2) {
    let row = ''
    for (let x = 0; x < info.width; x += 1) {
      const top = (y * info.width + x) * 4
      const bottom = (Math.min(y + 1, info.height - 1) * info.width + x) * 4
      const ta = data[top + 3] / 255
      const ba = data[bottom + 3] / 255
      const blend = (at, alpha) => Math.round(data[at] * alpha + 8 * (1 - alpha))
      const tr = blend(top, ta), tg = blend(top + 1, ta), tb = blend(top + 2, ta)
      const br = blend(bottom, ba), bg = blend(bottom + 1, ba), bb = blend(bottom + 2, ba)
      row += `\x1b[38;2;${tr};${tg};${tb}m\x1b[48;2;${br};${bg};${bb}m▀`
    }
    rows.push(`${row}\x1b[0m`)
  }
  await writeFile(join(new URL('.', output).pathname, basename(input, '.png') + '.json'), JSON.stringify(rows))
}
