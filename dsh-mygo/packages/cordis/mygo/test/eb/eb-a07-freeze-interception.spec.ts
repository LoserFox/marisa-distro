/**
 * A7：mygo 挂载路径上能否对插件 exports 强制 freeze/Proxy 包装。
 * 源码核验：直连行由原生 loader import（mygo 不在加载路径，无法包装）；
 * 桥接路径 mygo 经 importEntry 加载后包一层（可包装）。
 */

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const PANEL_SRC = new URL('../../../../extensions/mygo-panel/src/index.ts', import.meta.url).pathname
const BUNDLE_RAIL_SRC = new URL('../../src/bundle-rail.ts', import.meta.url).pathname

describe('EB-A7 enforcement point for freeze/proxy on plugin exports', () => {
  it('桥接路径 mygo 加载入口（可包装）；bundle 直连路径交给 dsh plugin（不可包装）', async () => {
    const panelSrc = await readFile(PANEL_SRC, 'utf8')
    const railSrc = await readFile(BUNDLE_RAIL_SRC, 'utf8')
    expect(panelSrc).toMatch(/importEntry/)
    expect(panelSrc).toMatch(/await import\(/)
    expect(railSrc).toMatch(/runDshPlugin/)
    expect(railSrc).toMatch(/dsh plugin/)
  })
})
