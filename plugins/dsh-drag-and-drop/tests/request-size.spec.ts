import { describe, expect, it } from 'vitest'
import { DIRECTORY_MAX_ENTRIES } from '../src/directory.ts'
import { MAX_BODY_BYTES } from '../src/index.ts'

describe('directory request size', () => {
  it('fits a maximum-size representative directory structure under the route limit', () => {
    const entries = Array.from({ length: DIRECTORY_MAX_ENTRIES }, (_, index) => ({
      path: `directory-${String(index).padStart(5, '0')}/file-${String(index).padStart(5, '0')}.txt`,
      kind: 'file' as const,
      size: index,
    }))
    const body = JSON.stringify({ phase: 'metadata', file: { kind: 'directory', name: 'project', structure: { entries, truncated: true } } })
    expect(Buffer.byteLength(body)).toBeLessThan(MAX_BODY_BYTES)
  })
})
