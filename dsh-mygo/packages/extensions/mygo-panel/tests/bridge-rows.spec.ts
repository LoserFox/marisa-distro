/**
 * rc.3 桥接行同步加固测试：失效桥接跳过（boot 安全）、块落点保留用户
 * 内容、空文件合法 YAML、幂等重跑、陈旧 scope 错位识别、跳过回调告警。
 * @module @r05en1cu/dsh-mygo-ext-panel/tests/bridge-rows
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildProfilePatchText,
  filterResolvableRows,
  isBridgeRowResolvable,
  ROW_MARKER_END,
  ROW_MARKER_START,
} from '../src/bridge-rows.ts'

const USER_LAYER = [
  '# 用户层注释',
  '- id: dsh-mygo-cli',
  '  disabled: true',
  '',
].join('\n')

function row(id: string): { readonly id: string; readonly name: string; readonly config: unknown } {
  return { id: `${id}-mygo`, name: `@r05en1cu/${id}-mygo`, config: {} }
}

describe('buildProfilePatchText（受管块落点）', () => {
  it('空文件 + 有行：只含受管块，YAML 合法', () => {
    const next = buildProfilePatchText('', [row('alpha')])
    expect(next).toContain(ROW_MARKER_START)
    expect(next).toContain('- id: alpha-mygo')
    expect(next).not.toContain('[]')
  })

  it('空文件 + 无行：落 []（合法 YAML 空文档），无标记块', () => {
    expect(buildProfilePatchText('', [])).toBe('[]\n')
    expect(buildProfilePatchText('[]\n', [])).toBe('[]\n')
  })

  it('仅注释文件 + 无行：保留注释且落顶层 []（rc.3 事故形态）', () => {
    const commentsOnly = '# 用户补丁层\n# 第二行注释\n'
    const next = buildProfilePatchText(commentsOnly, [])
    expect(next.startsWith('# 用户补丁层')).toBe(true)
    expect(next.trimEnd().endsWith('[]')).toBe(true)
  })

  it('用户内容逐字节保留（块前），重跑幂等', () => {
    const once = buildProfilePatchText(USER_LAYER, [row('alpha')])
    expect(once.startsWith(USER_LAYER.trimEnd())).toBe(true)
    expect(once).toContain('# 用户层注释')
    const twice = buildProfilePatchText(once, [row('alpha')])
    expect(twice).toBe(once)
    // 行变化时只动块内：用户层不变
    const changed = buildProfilePatchText(once, [row('beta')])
    expect(changed.startsWith(USER_LAYER.trimEnd())).toBe(true)
    expect(changed).toContain('- id: beta-mygo')
    expect(changed).not.toContain('- id: alpha-mygo')
  })

  it('独立 [] 占位在加行时被替换；行清空后回到用户内容本身', () => {
    const withRow = buildProfilePatchText('[]\n', [row('alpha')])
    expect(withRow).not.toContain('[]')
    expect(withRow).toContain('- id: alpha-mygo')
    // 清空：从含行文本回到零行 → 用户内容（空）→ []
    expect(buildProfilePatchText(withRow, [])).toBe('[]\n')
    // 有用户内容时清空行：只剩用户内容（标记块整体摘除）
    const userOnly = buildProfilePatchText(buildProfilePatchText(USER_LAYER, [row('alpha')]), [])
    expect(userOnly).toBe(USER_LAYER.trimEnd() + '\n')
    expect(userOnly).not.toContain(ROW_MARKER_START)
  })

  it('绝不出事故形态：[] 不会出现在标记块中间', () => {
    const legacy = `${ROW_MARKER_START}\n[]\n${ROW_MARKER_END}\n`
    const repaired = buildProfilePatchText(legacy, [row('alpha')])
    expect(repaired).not.toContain('[]')
    const empty = buildProfilePatchText(legacy, [])
    expect(empty).toBe('[]\n')
  })
})

describe('filterResolvableRows + isBridgeRowResolvable（失效桥接跳过）', () => {
  let root: string
  let home: string
  let profileDir: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-panel-rows-'))
    home = join(root, 'home')
    profileDir = join(home, 'profiles', 'web')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function plantBridge(name: string, entry: string | undefined): Promise<void> {
    const dir = join(profileDir, 'node_modules', name)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name, main: entry ?? 'src/index.ts' }))
    if (entry !== undefined) {
      await mkdir(join(dir, 'src'), { recursive: true })
      await writeFile(join(dir, entry), 'export {}\n')
    }
  }

  it('可解析行保留；不可解析行跳过且 onSkip 收到告警面', async () => {
    await plantBridge('@r05en1cu/alpha-mygo', 'src/index.ts')
    const skipped: string[] = []
    const kept = filterResolvableRows(
      [row('alpha'), row('ghost')],
      name => isBridgeRowResolvable(profileDir, home, name),
      skippedRow => skipped.push(skippedRow.id),
    )
    expect(kept.map(item => item.id)).toEqual(['alpha-mygo'])
    expect(skipped).toEqual(['ghost-mygo'])
  })

  it('陈旧 scope 错位（包名与目录名不符）判不可解析', async () => {
    // 目录名是新 scope，package.json 里还是旧 scope 名 → 行名与包名不符
    const dir = join(profileDir, 'node_modules', '@r05en1cu', 'alpha-mygo')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@dsh-external/alpha-mygo', main: 'src/index.ts' }))
    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(join(dir, 'src', 'index.ts'), 'export {}\n')
    expect(isBridgeRowResolvable(profileDir, home, '@r05en1cu/alpha-mygo')).toBe(false)
  })

  it('profiles/node_modules 兜底链同样认可', async () => {
    const dir = join(home, 'profiles', 'node_modules', '@r05en1cu', 'alpha-mygo')
    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@r05en1cu/alpha-mygo' }))
    await writeFile(join(dir, 'src', 'index.ts'), 'export {}\n')
    expect(isBridgeRowResolvable(profileDir, home, '@r05en1cu/alpha-mygo')).toBe(true)
  })

  it('端到端：失效条目不进入落盘文本（boot 安全）', async () => {
    await plantBridge('@r05en1cu/alpha-mygo', 'src/index.ts')
    const rows = [row('alpha'), row('ghost')]
    const kept = filterResolvableRows(rows, name => isBridgeRowResolvable(profileDir, home, name), () => {})
    const text = buildProfilePatchText(USER_LAYER, kept)
    expect(text).toContain('- id: alpha-mygo')
    expect(text).not.toContain('ghost')
  })
})
