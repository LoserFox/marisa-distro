/**
 * `mygo config` 命令面测试（P7-A2）：patch 层行 config 的整行读取与浅
 * 合并写回（含 insert 列表内缩进行、无 config 行追加、注释/行序保留、
 * 非法 id/非法 JSON/行缺失报错）。
 * @module @r05en1cu/dsh-mygo-cli/tests/config-face
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseCliArgs } from '../src/args.ts'
import { invokeCli, internals, type CliHost } from '../src/index.ts'
import { collector } from './helpers.ts'

const ORIGINAL_DSH_HOME = process.env.DSH_HOME

const PATCH = [
  '# 用户层注释保留',
  '- insert:',
  "    - id: dsh-mygo",
  "      name: '@r05en1cu/dsh-mygo'",
  '      config:',
  '        profile: web',
  '        cpuBudgetMs: 100',
  "    - id: dsh-mygo-cli",
  "      name: '@r05en1cu/dsh-mygo-cli'",
  '',
].join('\n')

function capture(): { stdout: ReturnType<typeof collector>; stderr: ReturnType<typeof collector> } {
  const stdout = collector()
  const stderr = collector()
  internals.stdout = stdout
  internals.stderr = stderr
  return { stdout, stderr }
}

function ctxWithProfile(profile: string): CliHost {
  return { get: (key: string) => (key === 'pluginManager' ? { profile } : undefined) }
}

describe('mygo config（整行 config 读写）', () => {
  let root: string
  let home: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-config-face-'))
    home = join(root, 'home')
    await mkdir(join(home, 'profiles', 'web'), { recursive: true })
    await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), PATCH)
    process.env.DSH_HOME = home
  })

  afterEach(async () => {
    internals.stdout = process.stdout
    internals.stderr = process.stderr
    if (ORIGINAL_DSH_HOME === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = ORIGINAL_DSH_HOME
    await rm(root, { recursive: true, force: true })
  })

  it('args 解析：config <id> / --set / 非法 JSON 与非法 id 拒绝', () => {
    expect(parseCliArgs(['config', 'dsh-mygo'])).toMatchObject({ kind: 'command', command: { kind: 'config', id: 'dsh-mygo' } })
    expect(parseCliArgs(['config', 'dsh-mygo', '--set', '{"a":1}'])).toMatchObject({ kind: 'command', command: { kind: 'config', set: '{"a":1}' } })
    expect(parseCliArgs(['config', 'dsh-mygo', '--set', '[1]']).kind).toBe('usage-error')
    expect(parseCliArgs(['config', 'dsh-mygo', '--set', '{bad']).kind).toBe('usage-error')
    expect(parseCliArgs(['config', 'Bad_Id']).kind).toBe('usage-error')
    expect(parseCliArgs(['config']).kind).toBe('usage-error')
  })

  it('读取：整行 config 原样给出（--json 信封）', async () => {
    const out = capture()
    const code = await invokeCli(ctxWithProfile('web'), ['config', 'dsh-mygo', '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(out.stdout.text()) as { ok: boolean; config: Record<string, unknown> }
    expect(parsed.ok).toBe(true)
    expect(parsed.config).toEqual({ profile: 'web', cpuBudgetMs: 100 })
  })

  it('--set 浅合并写回整行：新键追加、旧键覆盖、未提键保留、注释与邻行不动', async () => {
    const out = capture()
    const code = await invokeCli(ctxWithProfile('web'), ['config', 'dsh-mygo', '--set', '{"cpuBudgetMs":250,"registry":"https://r.example"}'])
    expect(code).toBe(0)
    const text = await readFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(text).toContain('# 用户层注释保留')
    expect(text).toContain('cpuBudgetMs: 250')
    expect(text).toContain('registry: https://r.example')
    expect(text).toContain('profile: web')
    expect(text).toContain("- id: dsh-mygo-cli")
    // 回读验证整行最新值
    const reread = capture()
    expect(await invokeCli(ctxWithProfile('web'), ['config', 'dsh-mygo', '--json'])).toBe(0)
    const parsed = JSON.parse(reread.stdout.text()) as { config: Record<string, unknown> }
    expect(parsed.config).toEqual({ profile: 'web', cpuBudgetMs: 250, registry: 'https://r.example' })
  })

  it('无 config 行：--set 追加子块', async () => {
    const out = capture()
    const code = await invokeCli(ctxWithProfile('web'), ['config', 'dsh-mygo-cli', '--set', '{"verbose":true}', '--json'])
    expect(code).toBe(0)
    const text = await readFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(text).toContain("- id: dsh-mygo-cli\n      name: '@r05en1cu/dsh-mygo-cli'\n      config:\n        verbose: true")
    // 邻行 config 不受影响
    expect(text).toContain('cpuBudgetMs: 100')
  })

  it('行不存在 / profile 名逃逸 → 明确报错', async () => {
    let out = capture()
    expect(await invokeCli(ctxWithProfile('web'), ['config', 'ghost'])).toBe(1)
    expect(out.stderr.text()).toContain('patch 层没有 ghost 行')
    out = capture()
    expect(await invokeCli(ctxWithProfile('../x'), ['config', 'dsh-mygo'])).toBe(1)
    expect(out.stderr.text()).toContain('逃出实例 HOME')
  })
})
