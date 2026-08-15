import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = 'wechat-submission'
const upload = path.join(root, 'upload')
const stickerOutput = path.join(upload, 'stickers')
const stickerSource = 'assets/stickers'
const coverSource = path.join(root, 'source', 'cover-cutout.png')
const bannerSource = path.join(root, 'source', 'detail-banner-source.png')

await mkdir(stickerOutput, { recursive: true })

const files = (await readdir(stickerSource)).filter(file => file.endsWith('.png')).sort()

const saferSelfDestructLabel = Buffer.from(`
  <svg width="1254" height="1254" xmlns="http://www.w3.org/2000/svg">
    <rect x="154" y="900" width="946" height="255" rx="38" fill="#fff"/>
    <text x="627" y="1005" text-anchor="middle" font-family="PingFang SC, Heiti SC, sans-serif" font-size="72" font-weight="700" fill="#050505">最近自己搓自己时</text>
    <text x="627" y="1100" text-anchor="middle" font-family="PingFang SC, Heiti SC, sans-serif" font-size="72" font-weight="700" fill="#050505">重启频率有点高</text>
  </svg>
`)

for (const file of files) {
  const source = path.join(stickerSource, file)
  const input = file === '11-self-destruct.png'
    ? await sharp(source).composite([{ input: saferSelfDestructLabel }]).png().toBuffer()
    : source
  await sharp(input)
    .resize(240, 240, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, quality: 95, effort: 10 })
    .toFile(path.join(stickerOutput, file))
}

await sharp(coverSource)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .resize(220, 220, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ palette: true, quality: 95, effort: 10 })
  .toFile(path.join(upload, 'cover.png'))

await sharp(coverSource)
  .extract({ left: 310, top: 60, width: 650, height: 650 })
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .resize(50, 50, { fit: 'cover', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ palette: true, quality: 100, effort: 10 })
  .toFile(path.join(upload, 'chat-icon.png'))

const banner = sharp(bannerSource).resize(750, 400, { fit: 'cover', position: 'centre' })
await banner.clone().jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true }).toFile(path.join(upload, 'detail-banner.jpg'))

const avatarBackground = Buffer.from(`
  <svg width="640" height="640" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#70d8ef"/><stop offset="1" stop-color="#274a91"/></linearGradient></defs>
    <rect width="640" height="640" fill="url(#g)"/>
    <circle cx="100" cy="120" r="36" fill="#fff" opacity=".25"/><circle cx="530" cy="90" r="62" fill="#fff" opacity=".16"/><circle cx="560" cy="520" r="44" fill="#fff" opacity=".2"/>
  </svg>
`)
const avatarCharacter = await sharp(coverSource)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .resize(570, 570, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()
await sharp(avatarBackground)
  .composite([{ input: avatarCharacter, gravity: 'south' }])
  .png({ palette: true, quality: 90, effort: 10 })
  .toFile(path.join(upload, 'artist-avatar.png'))

let artistBanner
for (const quality of [72, 64, 56, 48, 40]) {
  const candidate = await banner.clone().jpeg({ quality, chromaSubsampling: '4:2:0', mozjpeg: true }).toBuffer()
  if (candidate.length <= 80 * 1024 || quality === 40) {
    artistBanner = candidate
    break
  }
}
await writeFile(path.join(upload, 'artist-banner.jpg'), artistBanner)

const required = [
  ...files.map(file => path.join(stickerOutput, file)),
  path.join(upload, 'cover.png'),
  path.join(upload, 'chat-icon.png'),
  path.join(upload, 'detail-banner.jpg'),
  path.join(upload, 'artist-avatar.png'),
  path.join(upload, 'artist-banner.jpg'),
]

const checks = []
for (const file of required) {
  const metadata = await sharp(file).metadata()
  const bytes = (await stat(file)).size
  checks.push({ file, width: metadata.width, height: metadata.height, format: metadata.format, bytes })
}

const limits = checks.map(check => {
  if (check.file.includes('/stickers/')) return { ...check, expectedWidth: 240, expectedHeight: 240, maxBytes: 500 * 1024 }
  if (check.file.endsWith('/cover.png')) return { ...check, expectedWidth: 240, expectedHeight: 240, maxBytes: 500 * 1024 }
  if (check.file.endsWith('/chat-icon.png')) return { ...check, expectedWidth: 50, expectedHeight: 50, maxBytes: 100 * 1024 }
  if (check.file.endsWith('/detail-banner.jpg')) return { ...check, expectedWidth: 750, expectedHeight: 400, maxBytes: 500 * 1024 }
  if (check.file.endsWith('/artist-avatar.png')) return { ...check, expectedWidth: 640, expectedHeight: 640, maxBytes: 500 * 1024 }
  return { ...check, expectedWidth: 750, expectedHeight: 400, maxBytes: 80 * 1024 }
})

const failures = limits.filter(check =>
  check.width !== check.expectedWidth ||
  check.height !== check.expectedHeight ||
  check.bytes > check.maxBytes
)

if (failures.length) {
  throw new Error(`WeChat asset validation failed:\n${JSON.stringify(failures, null, 2)}`)
}

await writeFile(path.join(root, 'validation.json'), `${JSON.stringify(limits, null, 2)}\n`)
console.log(`Generated ${files.length} stickers and 5 supporting images in ${upload}`)
