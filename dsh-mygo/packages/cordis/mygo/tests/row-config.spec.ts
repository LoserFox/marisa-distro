/**
 * row-config 核心面测试（r6 收敛）：整行读写、upsert 追加 id 定向覆盖行、
 * 行 id 枚举。全部临时目录。
 * @module @r05en1cu/dsh-mygo/tests/row-config
 */

import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  listPatchRowIds,
  readProfilePatchText,
  readRowConfig,
  readRowConfigRevision,
  removePatchRows,
  upsertRowConfig,
  writeRowConfig,
} from '../src/row-config.ts'

const PATCH = [
  '# 用户层注释',
  '- insert:',
  '    - id: alpha',
  "      name: '@test/alpha'",
  '      config:',
  '        step: 1',
  '- id: beta',
  '  disabled: true',
  '',
].join('\n')

describe('row-config（整行读写 + upsert）', () => {
  let home: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'mygo-row-config-'))
    await mkdir(join(home, 'profiles', 'web'), { recursive: true })
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  async function seed(text = PATCH): Promise<void> {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), text)
  }

  it('listPatchRowIds 出现序去重（insert 内与顶层行）', async () => {
    await seed()
    expect(listPatchRowIds(readProfilePatchText(home, 'web'))).toEqual(['alpha', 'beta'])
  })

  it('read/write 整行 config（浅合并，注释与邻行不动）', async () => {
    await seed()
    expect(readRowConfig(home, 'web', 'alpha')).toMatchObject({ ok: true, config: { step: 1 } })
    const written = writeRowConfig(home, 'web', 'alpha', { step: 2, extra: true })
    expect(written.ok).toBe(true)
    const text = await readFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(text).toContain('# 用户层注释')
    expect(text).toContain('step: 2')
    expect(text).toContain('extra: true')
    expect(text).toContain('- id: beta')
  })

  it('upsert：行不存在追加 id 定向覆盖行；空文件落合法 YAML', async () => {
    await seed('[]\n')
    const result = upsertRowConfig(home, 'web', 'advisor', { model: 'x', budget: 5 })
    expect(result.ok).toBe(true)
    const text = await readFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(text).toContain('- id: advisor')
    expect(text).toContain('config:')
    expect(text).toContain('model: x')
    expect(text).not.toContain('[]')
    // 二次 upsert 走浅合并路径（幂等）
    expect(upsertRowConfig(home, 'web', 'advisor', { budget: 6 }).ok).toBe(true)
    expect(readRowConfig(home, 'web', 'advisor').config).toEqual({ model: 'x', budget: 6 })
  })

  it('upsert：注释头 + 独立 [] 占位行 → 替换占位（合法 YAML，不产生 [] 后追加形态）', async () => {
    await seed('# user layer comment\n# second line\n[]\n')
    expect(upsertRowConfig(home, 'web', 'advisor', { model: 'x' }).ok).toBe(true)
    const text = await readFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(text).toContain('# user layer comment')
    expect(text).not.toMatch(/\[\]/)
    expect(text).toContain('- id: advisor')
    // YAML 可解析且为数组
    const yaml = await import('js-yaml')
    const parsed = yaml.load(text) as unknown
    expect(Array.isArray(parsed)).toBe(true)
    expect((parsed as { id: string }[])[0]?.id).toBe('advisor')
  })

  it('upsert：既有行走 writeRowConfig 同语义', async () => {
    await seed()
    expect(upsertRowConfig(home, 'web', 'alpha', { step: 9 }).ok).toBe(true)
    expect(readRowConfig(home, 'web', 'alpha').config).toEqual({ step: 9 })
  })
})

describe('row config revision（mygo native 乐观并发）', () => {
  let home: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'mygo-row-rev-'))
    await mkdir(join(home, 'profiles', 'web'), { recursive: true })
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  async function seed(text = PATCH): Promise<void> {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), text)
  }

  it('首次读为 0；实际变化 +1；相同写入不推进', async () => {
    await seed()
    expect(readRowConfigRevision(home, 'web', 'alpha')).toMatchObject({ ok: true, revision: 0 })
    expect(writeRowConfig(home, 'web', 'alpha', { step: 2 }).revision).toBe(1)
    expect(writeRowConfig(home, 'web', 'alpha', { step: 2 }).revision).toBe(1)
    expect(readRowConfigRevision(home, 'web', 'alpha').revision).toBe(1)
  })

  it('expectedRevision 过期拒绝写入并携带 expected/actual', async () => {
    await seed()
    const first = writeRowConfig(home, 'web', 'alpha', { step: 2 })
    expect(first.revision).toBe(1)
    const stale = writeRowConfig(home, 'web', 'alpha', { step: 3 }, 0)
    expect(stale.ok).toBe(false)
    expect(stale.revisionConflict).toEqual({ expected: 0, actual: 1 })
    expect(readRowConfig(home, 'web', 'alpha').config).toEqual({ step: 2 })
    const fresh = writeRowConfig(home, 'web', 'alpha', { step: 3 }, 1)
    expect(fresh.ok).toBe(true)
    expect(fresh.revision).toBe(2)
  })

  it('外部编辑 patch 文件后下次读推进 revision', async () => {
    await seed()
    expect(readRowConfigRevision(home, 'web', 'alpha').revision).toBe(0)
    await seed(PATCH.replace('step: 1', 'step: 7'))
    expect(readRowConfigRevision(home, 'web', 'alpha')).toMatchObject({ revision: 1 })
  })

  it('upsert 新建行：创建推进 revision；stale expected 拒绝', async () => {
    await seed('[]\n')
    expect(readRowConfigRevision(home, 'web', 'advisor')).toMatchObject({ ok: true, config: undefined, revision: 0 })
    const created = upsertRowConfig(home, 'web', 'advisor', { model: 'x' })
    expect(created.ok).toBe(true)
    expect(created.revision).toBe(1)
    expect(upsertRowConfig(home, 'web', 'advisor', { model: 'y' }, 0).revisionConflict).toEqual({ expected: 0, actual: 1 })
  })
})

describe('removePatchRows（卸载清理，rc.6）', () => {
  let home: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'mygo-row-remove-'))
    await mkdir(join(home, 'profiles', 'web'), { recursive: true })
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  async function seed(text: string): Promise<void> {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), text)
  }

  async function text(): Promise<string> {
    return readFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
  }

  it('移除目标 config 行，其余行与注释逐字保留', async () => {
    await seed([
      '# 用户层注释',
      '- id: beta',
      '  config:',
      '    keep: true',
      '',
      '- id: advisor',
      '  config:',
      "    model: ''",
      '    immuneTurns: 3',
      '',
    ].join('\n'))
    const result = removePatchRows(home, 'web', ['advisor'])
    expect(result).toEqual({ ok: true, removed: ['advisor'] })
    const next = await text()
    expect(next).not.toContain('advisor')
    expect(next).toContain('# 用户层注释')
    expect(next).toContain('- id: beta')
    expect(next).toContain('keep: true')
    const yaml = await import('js-yaml')
    const parsed = yaml.load(next) as unknown
    expect(Array.isArray(parsed)).toBe(true)
    expect((parsed as { id: string }[])[0]?.id).toBe('beta')
  })

  it('受管 disable 块整块剥除（不留不成对标记）', async () => {
    await seed([
      '- id: beta',
      '  config:',
      '    keep: 1',
      '',
      '# --- mygo managed disable (id:advisor) ---',
      '- id: advisor',
      '  disabled: true',
      '# --- end mygo managed disable ---',
      '',
    ].join('\n'))
    const result = removePatchRows(home, 'web', ['advisor'])
    expect(result.ok).toBe(true)
    expect(result.removed).toEqual(['advisor'])
    const next = await text()
    expect(next).not.toContain('advisor')
    expect(next).not.toContain('mygo managed disable')
    expect(next).toContain('- id: beta')
  })

  it('最后一行移除后回落 []（仅注释也落顶层数组，合法 YAML）', async () => {
    await seed('# 头部注释\n- id: advisor\n  config:\n    model: x\n')
    expect(removePatchRows(home, 'web', ['advisor']).ok).toBe(true)
    const next = await text()
    expect(next).toContain('# 头部注释')
    const yaml = await import('js-yaml')
    expect(yaml.load(next)).toEqual([])
    // 无注释时同样落 []
    await seed('- id: advisor\n  config:\n    model: x\n')
    expect(removePatchRows(home, 'web', ['advisor']).ok).toBe(true)
    expect(await text()).toBe('[]\n')
  })

  it('文件缺失与幂等：无行可移除时不改写文件', async () => {
    expect(removePatchRows(home, 'web', ['advisor'])).toEqual({ ok: true, removed: [] })
    await seed('- id: advisor\n  config:\n    model: x\n')
    expect(removePatchRows(home, 'web', ['advisor']).removed).toEqual(['advisor'])
    const before = await text()
    expect(removePatchRows(home, 'web', ['advisor'])).toEqual({ ok: true, removed: [] })
    expect(await text()).toBe(before)
  })

  it('多 id 一次清理（rowId 与成员 id 双候选）', async () => {
    await seed('- id: advisor\n  config:\n    model: x\n- id: dsh-advisor\n  disabled: true\n- id: beta\n  config:\n    keep: 1\n')
    const result = removePatchRows(home, 'web', ['advisor', 'dsh-advisor'])
    expect(result.removed).toEqual(['advisor', 'dsh-advisor'])
    const next = await text()
    expect(listPatchRowIds(next)).toEqual(['beta'])
  })

  it('bundle-rail companion 块整块剥除（成员 id 定向，块内多 rowId 不留孤儿）', async () => {
    await seed([
      '- id: beta',
      '  config:',
      '    keep: 1',
      '',
      '# >>> mygo bundle disable block: community-nine',
      '- id: row-one',
      '  disabled: true',
      '- id: row-two',
      '  disabled: true',
      '# <<< mygo bundle disable block: community-nine',
      '',
    ].join('\n'))
    const result = removePatchRows(home, 'web', ['community-nine'])
    expect(result).toEqual({ ok: true, removed: ['community-nine'] })
    const next = await text()
    expect(next).not.toContain('community-nine')
    expect(next).not.toContain('row-one')
    expect(next).not.toContain('row-two')
    expect(listPatchRowIds(next)).toEqual(['beta'])
    const yaml = await import('js-yaml')
    expect(Array.isArray(yaml.load(next))).toBe(true)
  })
})
