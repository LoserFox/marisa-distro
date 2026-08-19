import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const clientBundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

describe('browser client bundle', () => {
  it('does not read the Node process environment when materialized', () => {
    expect(clientBundle.match(/\bprocess\.env\b/g) ?? []).toEqual([])
  })
})
