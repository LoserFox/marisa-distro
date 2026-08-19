/**
 * A8：P1-local 已按矛盾 1 裁决删除 → OBSOLETE。
 * 断言基线文档已标记 EB-D3 作废与裁决选 (a)。
 */

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const BASELINE = '/home/rosen/workspace/dsh_dev/dsh-mygo/docs/expected-behavior.md'

describe('EB-A8 obsolete (P1-local removed)', () => {
  it('基线文档已裁决删除 P1-local，本假设不再需要实验', async () => {
    const doc = await readFile(BASELINE, 'utf8')
    expect(doc).toMatch(/EB-D3.*作废/)
    expect(doc).toMatch(/裁决（已定）.*选 \(a\)/)
  })
})
