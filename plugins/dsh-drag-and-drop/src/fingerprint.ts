import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import { SAMPLE_BYTES } from './protocol.ts'

export function sampleRanges(size: number): readonly { start: number; length: number }[] {
  if (!Number.isSafeInteger(size) || size < 0) throw new TypeError('size must be a non-negative safe integer')
  if (size <= SAMPLE_BYTES * 3) return [{ start: 0, length: size }]
  const starts = [0, Math.max(0, Math.floor(size / 2) - Math.floor(SAMPLE_BYTES / 2)), size - SAMPLE_BYTES]
  return starts.map(start => ({ start, length: Math.min(SAMPLE_BYTES, size - start) }))
}

export function hashParts(size: number, parts: readonly Uint8Array[]): string {
  const hash = createHash('sha256')
  const header = Buffer.allocUnsafe(8)
  header.writeBigUInt64BE(BigInt(size))
  hash.update(header)
  for (const part of parts) hash.update(part)
  return hash.digest('hex')
}

export async function sampleFingerprint(path: string, size: number): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const parts: Uint8Array[] = []
    for (const range of sampleRanges(size)) {
      const buffer = Buffer.allocUnsafe(range.length)
      const { bytesRead } = await handle.read(buffer, 0, range.length, range.start)
      parts.push(buffer.subarray(0, bytesRead))
    }
    return hashParts(size, parts)
  } finally {
    await handle.close()
  }
}

export async function fullFingerprint(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(256 * 1024)
    let position = 0
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (bytesRead === 0) break
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}
