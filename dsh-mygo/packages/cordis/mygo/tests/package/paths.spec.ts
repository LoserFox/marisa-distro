/**
 * 路径测试：统一分配在 $DSH_HOME/mygo，不依赖 cwd / dsh 安装位置。
 * （2026-08-13 范围重塑：lockfile 目录/路径随 dsh.lock/v1 删除。）
 */

import { describe, expect, it } from 'vitest'
import { packageDir, resolveMygoPaths } from '../../src/package/paths.ts'

describe('mygo paths', () => {
  it('allocates everything under $DSH_HOME/mygo', () => {
    const paths = resolveMygoPaths('web', { DSH_HOME: '/tmp/leak-proof' })
    expect(paths.base).toBe('/tmp/leak-proof/mygo')
    expect(paths.packagesRoot).toBe('/tmp/leak-proof/mygo/packages')
    expect(paths.configDir).toBe('/tmp/leak-proof/mygo/config')
    expect(packageDir(paths, 'tool', '1.2.3')).toBe('/tmp/leak-proof/mygo/packages/tool/1.2.3')
  })

  it('falls back to the home .dsh directory', () => {
    const paths = resolveMygoPaths('web', {})
    expect(paths.base.endsWith(`${process.env.HOME ?? ''}/.dsh/mygo`)).toBe(true)
  })
})
