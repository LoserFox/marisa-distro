/**
 * CLI E2E 公共装置（design-r5 T44/T45/T47/T49）：在进程内以真实 Cordis
 * 组合挂载 mygo 管理器 + CLI 插件，按官方契约提供 cmdlineArgs/appExit，
 * 并把 CLI 输出重定向到收集器。全程离线（registry 走本地桩）。
 * @module @r05en1cu/dsh-mygo-cli/tests/helpers
 */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import * as storageSqlite from '@deepseek-ai/dsh-storage-sqlite'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import PluginManagerService, { PluginPackageManager, resolveMygoPaths } from '@r05en1cu/dsh-mygo'
import * as cliModule from '../src/index.ts'
import type { CliHost } from '../src/index.ts'
import type { PackedPackage } from '../../mygo/tests/e2e/harness.ts'

/** 输出收集器（可注入 CLI internals）。 */
export function collector(): { readonly chunks: string[]; write(chunk: string): void; text(): string } {
  const chunks: string[] = []
  return {
    chunks,
    write(chunk: string) {
      chunks.push(chunk)
    },
    text() {
      return chunks.join('')
    },
  }
}

export interface CliComposition {
  readonly ctx: CliHost
  readonly bootRoot: string
  readonly exitCode: { value?: number }
  readonly stdout: ReturnType<typeof collector>
  readonly stderr: ReturnType<typeof collector>
}

/** 离线种子安装到指定 home 的指定 profile（复用真实 resolveInstall 路径）。 */
export async function seedStore(
  packed: readonly PackedPackage[],
  registryUrl: string,
  profile: string,
  home: string,
): Promise<void> {
  const paths = resolveMygoPaths(profile, { DSH_HOME: home })
  const manager = new PluginPackageManager({
    paths,
    profile,
    registry: registryUrl,
    coreVersion: '0.0.1-rc.1',
    managerVersion: '0.3.0-e2e',
  })
  const seen = new Set<string>()
  for (const item of [...packed].sort((a, b) => a.plugin.id.localeCompare(b.plugin.id))) {
    if (seen.has(item.plugin.name)) continue
    seen.add(item.plugin.name)
    const outcome = await manager.resolveInstall({ package: item.plugin.name })
    if (!outcome.ok) {
      throw new Error(`seed ${item.plugin.name} 失败：${outcome.report.summary}\n${JSON.stringify(outcome.report, null, 2)}`)
    }
  }
}

/**
 * 挂载真实组合（storage 栈 + mygo 管理器 + CLI 插件行）。
 * `args` 作为 cmdlineArgs 提供；挂载本身保持被动（非 mygo 首 token），
 * 命令由测试直接调用 {@link cliModule.invokeCli} 驱动。
 */
export async function mountCliComposition(
  args: readonly string[],
  options: {
    readonly profile: string
    readonly home: string
    readonly registry: string
    readonly extraModules?: ReadonlyMap<string, unknown>
  },
): Promise<CliComposition> {
  const bootRoot = await mkdtemp(join(tmpdir(), 'mygo-cli-mount-'))
  const configPath = join(bootRoot, 'cordis.yml')
  const ctx = new Context()
  const exitCode: { value?: number } = {}
  ctx.provide('cmdlineArgs', { get: () => Object.freeze([...args]) })
  ctx.provide('appExit', (code: number) => {
    exitCode.value = code
  })
  ctx.baseUrl = pathToFileURL(bootRoot).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const allModules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-domain', storageDomain],
    ['@deepseek-ai/dsh-storage-json', storageJson],
    ['@deepseek-ai/dsh-storage-sqlite', storageSqlite],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRegistry],
    ['@r05en1cu/dsh-mygo', PluginManagerService],
    ['@r05en1cu/dsh-mygo-cli', cliModule],
    ...(options.extraModules ?? []),
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!allModules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return allModules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  const rows = [
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-sqlite'",
    '  config:',
    `    path: ${JSON.stringify(join(bootRoot, 'registry.db'))}`,
    '    journalMode: wal',
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    '    backend: sqlite',
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@r05en1cu/dsh-mygo'",
    '  config:',
    `    profile: ${JSON.stringify(options.profile)}`,
    `    registry: ${JSON.stringify(options.registry)}`,
    `    stateRoot: ${JSON.stringify(join(bootRoot, 'state'))}`,
    '    cpuBudgetMs: 1',
    "- name: '@r05en1cu/dsh-mygo-cli'",
    '',
  ]
  await writeFile(configPath, rows.join('\n'))
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  const stdout = collector()
  const stderr = collector()
  cliModule.internals.stdout = stdout
  cliModule.internals.stderr = stderr
  return {
    ctx,
    bootRoot,
    exitCode,
    stdout,
    stderr,
  }
}
