/**
 * spawn env 注入测试（rc8 P1 降级 e2e 口径）：fake pnpm shim 打点——
 * profileInstall 的 env 选项（registry-auth 解析的 ${REF} 增量）必须到达
 * 子进程环境；缺省不带 env 时透传 process.env。
 * @module @r05en1cu/dsh-mygo-loader-profile/tests/spawn-env
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { profileInstall } from '../src/face.ts'

let home: string
let binDir: string
let recordFile: string
const ORIGINAL_PATH = process.env.PATH

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'mygo-spawn-env-'))
  binDir = join(home, 'bin')
  recordFile = join(home, 'spawn-env.record')
  await mkdir(binDir, { recursive: true })
  // fake pnpm：把相关 env 打点落盘后按 pnpm add 的最小行为收尾（写回
  // package.json 不需要——profileInstall 只要求退出码 0；对账对无变化
  // 的 manifest no-op）。
  await writeFile(join(binDir, 'pnpm'), [
    '#!/bin/sh',
    `env | grep '^E2E_' > "${recordFile}" || true`,
    'exit 0',
    '',
  ].join('\n'))
  chmodSync(join(binDir, 'pnpm'), 0o755)
  process.env.PATH = `${binDir}:${ORIGINAL_PATH ?? ''}`
})

afterEach(async () => {
  if (ORIGINAL_PATH === undefined) delete process.env.PATH
  else process.env.PATH = ORIGINAL_PATH
  await rm(home, { recursive: true, force: true })
})

describe('runPnpm 的 env 注入（spawn 打点）', () => {
  it('options.env 的增量到达子进程环境', async () => {
    const outcome = profileInstall('lodash@^4.0.0', {
      profile: 'web',
      home,
      env: { E2E_REGISTRY_TOKEN: 'resolved-secret' },
    })
    expect(outcome.ok).toBe(true)
    expect(existsSync(recordFile)).toBe(true)
    const record = await readFile(recordFile, 'utf8')
    expect(record).toContain('E2E_REGISTRY_TOKEN=resolved-secret')
  }, 60_000)

  it('缺省不带 env：子进程看不到增量键（透传语义不变）', async () => {
    const outcome = profileInstall('lodash@^4.0.0', { profile: 'web', home })
    expect(outcome.ok).toBe(true)
    const record = await readFile(recordFile, 'utf8')
    expect(record).not.toContain('E2E_REGISTRY_TOKEN')
  }, 60_000)
})
