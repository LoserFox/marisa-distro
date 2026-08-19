/**
 * A9：loader entry 暴露 fiber.inertia/state 的可达路径。
 * 源码核验：Loader extends EntryTree（vendor/loader/src/index.ts:61），
 * EntryTree.entries() 可枚举（config/tree.ts:27,37），Entry.fiber 为 public
 * （config/entry.ts:56），fiber.inertia/state 为 public 字段（fiber.ts:200）。
 * 2026-08-12 守则合规裁决（零侵入）：删除 vendor epoch getter 补丁（PATCHES.md #1
 * 已移除），原生 epoch 仅存于私有 _runner（诊断用），无公开入口；mygo 控制面
 * 细 epoch 由 FineEpochRegistry 自有记账维持（EB-D10/D14 落地面）。
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeHarness, provider, settle } from './helpers.ts'
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const pkgRoot = (name: string): string => dirname(require_.resolve(`${name}/package.json`))


const LOADER_SRC = join(pkgRoot('@deepseek-ai/cordis-plugin-loader'), 'src/index.ts')
const TREE_SRC = join(pkgRoot('@deepseek-ai/cordis-plugin-loader'), 'src/config/tree.ts')
const ENTRY_SRC = join(pkgRoot('@deepseek-ai/cordis-plugin-loader'), 'src/config/entry.ts')
const FIBER_SRC = join(pkgRoot('@deepseek-ai/cordis'), 'src/fiber.ts')

describe('EB-A9 mygo can reach fiber.inertia/state via loader entries', () => {
  it('源码路径存在：Loader extends EntryTree；entries() 可枚举；Entry.fiber public；inertia public、epoch 无公开入口', async () => {
    const loaderSrc = await readFile(LOADER_SRC, 'utf8')
    const treeSrc = await readFile(TREE_SRC, 'utf8')
    const entrySrc = await readFile(ENTRY_SRC, 'utf8')
    const fiberSrc = await readFile(FIBER_SRC, 'utf8')
    expect(loaderSrc).toMatch(/export class Loader extends EntryTree/)
    expect(treeSrc).toMatch(/\* entries\(\)/)
    expect(treeSrc).toMatch(/return \[\.\.\.this\.entries\(\)\]/)
    expect(entrySrc).toMatch(/public fiber\?: Fiber/)
    expect(fiberSrc).toMatch(/epoch: T/)
    expect(fiberSrc).toMatch(/public inertia: Promise<void> \| undefined/)
    // 零侵入裁决：Fiber 不再暴露公开 epoch getter（PATCHES.md #1 已移除）。
    expect(fiberSrc).not.toMatch(/get epoch\(\)/)
  })

  it('运行期可达：挂载后 entry.fiber.inertia/state 可读；原生 epoch 无公开入口', async () => {
    const harness = await makeHarness()
    harness.ctx.loader.builtins.a = { name: 'a', inject: ['missing'], apply() {} }
    const id = await harness.ctx.loader.create({ name: 'cordis:a' })
    await settle(() => harness.find(id)?.fiber !== undefined)
    const fiber = harness.find(id)?.fiber
    expect(fiber).toBeDefined()
    // 结论边界：inertia/state 为公开字段；原生 epoch 无公开入口（细 epoch 由
    // mygo FineEpochRegistry 自有记账维持，见 T14/T15）。
    expect('inertia' in (fiber as object)).toBe(true)
    expect((fiber as { inertia?: unknown }).inertia).toBeUndefined()
    expect('epoch' in (fiber as object)).toBe(false)
    expect(fiber?.state).toBe(0 /* PENDING：依赖缺失 */)
  })
})
