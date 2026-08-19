/**
 * dsh-update-check host half：定期检查 GitHub Releases，发现新版后在设置页
 * 卡片与启动横幅提示（client 半）。只做检查+通知：不下载、不校验、不安装，
 * 下载按钮深链到 Release 资产（按 MARISA_INSTALL_FORM 选择）。
 *
 * 产品边界（2026-08-19 用户拍板）：下载/校验/替换/安装属于未来桌面宿主
 * 窄接口阶段，本插件不建。
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the webserver package's Context merge (ctx.webServer).
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { UpdateChecker } from './checker.ts'
import { readBackendEnv } from './env.ts'
import { registerRoutes } from './routes.ts'

/** 稳定插件名（与 manifest 行 name 一致，经 profile node_modules 解析）。 */
export const name = '@omdsh-dev/dsh-update-check'

export const inject = ['webServer']

export interface Config {
  /** 检查的 GitHub 仓库（owner/repo）。 */
  repo: string
  /** GitHub API 基址（测试/镜像可覆盖）。 */
  apiBase: string
  /** 定时检查间隔（小时）。 */
  checkIntervalHours: number
  /** 自动检查开关（设置页可改，存 settings namespace）。 */
  autoCheck: boolean
}

export const Config: z<Config> = z.object({
  repo: z.string().default('omdsh-dev/marisa-distro').description('GitHub repository to watch (owner/repo)'),
  apiBase: z.string().default('https://api.github.com').description('GitHub API base URL'),
  checkIntervalHours: z.number().min(1).max(24 * 30).default(24).description('Periodic check interval in hours'),
  autoCheck: z.boolean().default(true).description('Check for updates automatically'),
})

/** 启动后首次检查的延迟：给后端与路由留出就绪时间，避开启动高峰。 */
export const FIRST_CHECK_DELAY_MS = 30_000

/** 本插件拥有的 settings namespace（卡片按此 key 渲染）。 */
export const UPDATE_CHECK_NS = settingsNamespace('update-check')

export function apply(ctx: Context, config?: Partial<Config>): void {
  const entry: Config = {
    repo: 'omdsh-dev/marisa-distro',
    apiBase: 'https://api.github.com',
    checkIntervalHours: 24,
    autoCheck: true,
    ...config,
  }
  const env = readBackendEnv()
  const checker = new UpdateChecker({
    repo: entry.repo,
    apiBase: entry.apiBase,
    statePath: dshHomePath('update-check', 'state.json'),
    currentVersion: env.version,
    installForm: env.installForm,
    readAutoCheck: () => source().autoCheck,
  })

  // settings 接入：composition entry 作为 base 层，用户覆盖存 settings
  // 文档；服务缺失时回落 entry，插件保持组合配置行为。
  let source = (): Config => entry
  let interval: ReturnType<typeof setInterval> | undefined
  const stopInterval = (): void => {
    if (interval !== undefined) clearInterval(interval)
    interval = undefined
  }
  const rearm = (): void => {
    stopInterval()
    if (!source().autoCheck) return
    interval = setInterval(() => {
      checker.check().catch(error => {
        ctx.logger.warn(`update-check: periodic check failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }, source().checkIntervalHours * 3_600_000)
  }
  installSettingsSection(ctx, UPDATE_CHECK_NS, Config, entry, {
    setSource: next => { source = next },
    onChange: rearm,
  })

  // RouteContext 的 effect 参数面比 cordis 的 SyncEffect 窄，包一层适配：
  // 我们的 disposer 返回注销函数，正是 cordis 期望的 effect 体。
  registerRoutes({
    webServer: ctx.webServer,
    effect: (disposer, label) => ctx.effect(disposer as Parameters<typeof ctx.effect>[0], label),
  }, {
    checker,
    updateAutoCheck: async autoCheck => {
      const settings = ctx.get('settings')
      if (settings === undefined) throw new Error('settings service is unavailable')
      settings.update(UPDATE_CHECK_NS, { autoCheck })
    },
  })

  // 隐身模式：MARISA_VERSION 为空（dev 构建或版本读取失败）→ 只注册路由，
  // 不启动定时检查、不发网络请求、不写缓存。client 侧拿到空负载自然不弹。
  let firstCheck: ReturnType<typeof setTimeout> | undefined
  if (env.version === '') {
    ctx.logger.warn('update-check: MARISA_VERSION is empty — update checking disabled (dev build)')
  } else {
    ctx.logger.info(
      `update-check: watching ${entry.repo}, current version ${env.version} (install form ${env.installForm || 'unknown'})`,
    )
    firstCheck = setTimeout(() => {
      checker.check().catch(error => {
        ctx.logger.warn(`update-check: first check failed: ${error instanceof Error ? error.message : String(error)}`)
      })
      rearm()
    }, FIRST_CHECK_DELAY_MS)
  }
  ctx.effect(() => () => {
    if (firstCheck !== undefined) clearTimeout(firstCheck)
    stopInterval()
  }, 'update-check: check schedule')
}
