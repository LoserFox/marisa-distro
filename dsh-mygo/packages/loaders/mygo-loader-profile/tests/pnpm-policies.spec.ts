/**
 * P7-A1 测试：pnpm 构建政策双门槛（allowBuilds / blockExoticSubdeps）的
 * 检测、一键写白名单与重试放行。e2e 用带 postinstall 的本地 tarball +
 * strictDepBuilds profile（离线确定性拦截）。
 * @module @r05en1cu/dsh-mygo-loader-profile/tests/pnpm-policies
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  detectIgnoredBuildKeys,
  ensureProfilePnpmSettings,
  isBuildPolicyBlock,
  isExoticSubdepBlock,
  profileInstall,
} from '../src/index.ts'

const execFileAsync = promisify(execFile)

const BLOCK_OUTPUT = [
  'Progress: resolved 1, reused 0, downloaded 1, added 1, done',
  '',
  '[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @test/scripted@file:test-scripted-1.0.0.tgz, esbuild@0.28.1',
  '',
  'Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.',
].join('\n')

describe('政策拦截检测', () => {
  it('解析 Ignored build scripts 精确键（逗号/换行分隔）', () => {
    expect(detectIgnoredBuildKeys(BLOCK_OUTPUT)).toEqual([
      '@test/scripted@file:test-scripted-1.0.0.tgz',
      'esbuild@0.28.1',
    ])
    expect(isBuildPolicyBlock(BLOCK_OUTPUT)).toBe(true)
    expect(detectIgnoredBuildKeys('一切正常')).toEqual([])
    expect(isBuildPolicyBlock('一切正常')).toBe(false)
  })

  it('git 子依赖拦截检测（blockExoticSubdeps）', () => {
    expect(isExoticSubdepBlock('ERR_PNPM_BLOCKED blockExoticSubdeps is enabled')).toBe(true)
    expect(isExoticSubdepBlock('Exotic subdependency found')).toBe(true)
    expect(isExoticSubdepBlock('ordinary failure')).toBe(false)
  })
})

describe('ensureProfilePnpmSettings（一键写白名单）', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-pnpm-policy-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('建块 / 覆盖 pnpm 占位值 / 幂等 / blockExoticSubdeps 追加', async () => {
    const path = join(root, 'pnpm-workspace.yaml')
    await writeFile(path, 'packages:\n  - .\nstrictDepBuilds: true\n')
    const first = ensureProfilePnpmSettings(root, { allowBuilds: ['@test/scripted@file:x.tgz'] })
    expect(first.changed).toBe(true)
    let text = await readFile(path, 'utf8')
    expect(text).toContain("allowBuilds:\n  '@test/scripted@file:x.tgz': true\n")
    // 幂等
    expect(ensureProfilePnpmSettings(root, { allowBuilds: ['@test/scripted@file:x.tgz'] }).changed).toBe(false)
    // 覆盖 pnpm 自追加占位值
    await writeFile(path, text.replace("'@test/scripted@file:x.tgz': true", "'@test/scripted@file:x.tgz': set this to true or false"))
    expect(ensureProfilePnpmSettings(root, { allowBuilds: ['@test/scripted@file:x.tgz'] }).changed).toBe(true)
    text = await readFile(path, 'utf8')
    expect(text).toContain("'@test/scripted@file:x.tgz': true")
    // blockExoticSubdeps
    expect(ensureProfilePnpmSettings(root, { blockExoticSubdeps: true }).changed).toBe(true)
    text = await readFile(path, 'utf8')
    expect(text).toContain('blockExoticSubdeps: false')
    expect(ensureProfilePnpmSettings(root, { blockExoticSubdeps: true }).changed).toBe(false)
  })
})

describe('一键放行 e2e（strictDepBuilds + tarball postinstall）', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-pnpm-e2e-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('拦截 → 自动写白名单 → 重试 + rebuild → 构建脚本实际执行', async () => {
    // 带 postinstall 的 tarball fixture
    const pkgDir = join(root, 'pkg')
    await mkdir(pkgDir, { recursive: true })
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify({
      name: '@test/scripted',
      version: '1.0.0',
      scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(\'postinstall-ran.txt\',\'ok\')"' },
    }, null, 2))
    await execFileAsync('pnpm', ['pack', '--pack-destination', root], { cwd: pkgDir })
    const tarball = join(root, 'test-scripted-1.0.0.tgz')
    // 预置 strictDepBuilds profile
    const profileDir = join(root, 'home', 'profiles', 'face')
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({ name: 'dsh-profile-face', private: true }, null, 2))
    await writeFile(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\nstrictDepBuilds: true\n')
    const outcome = profileInstall(tarball, { profile: 'face', home: join(root, 'home'), cwd: root })
    expect(outcome.ok).toBe(true)
    expect(outcome.allowedBuilds).toHaveLength(1)
    const key = outcome.allowedBuilds?.[0] ?? ''
    expect(key.startsWith('@test/scripted@file:')).toBe(true)
    const workspace = await readFile(join(profileDir, 'pnpm-workspace.yaml'), 'utf8')
    expect(workspace).toContain(`'${key}': true`)
    // 构建脚本实际执行（rebuild 落地）
    await readFile(join(profileDir, 'node_modules', '@test', 'scripted', 'postinstall-ran.txt'), 'utf8')
  }, 120_000)
})
