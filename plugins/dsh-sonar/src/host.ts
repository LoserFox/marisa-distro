import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Context } from 'cordis'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { ViewConfigurationStatus, ViewUiConfig } from './types.ts'
import { registerViewCommand } from './command.ts'
import { registerViewRpc, type ViewSettingsBridge } from './rpc.ts'
import { registerViewTool } from './tool.ts'
import { ViewService } from './view-service.ts'

export const name = 'dsh-sonar-host'
export const inject = ['connection', 'tools', 'systemPrompt', 'commands']

export interface Config {
  workspace?: string
  storagePath?: string
  locale?: ViewUiConfig['locale']
  refreshIntervalMs?: number
  motion?: ViewUiConfig['motion']
  backgroundReviewEnabled?: boolean
  backgroundReviewIntervalMs?: number
}

export const VIEW_SETTINGS_NAMESPACE = settingsNamespace('dsh-sonar')

export const ViewSettingsConfig: z<ViewUiConfig> = z.object({
  locale: z.union(['zh-CN', 'en-US'] as const).default('zh-CN').description('Dashboard language / 看板语言'),
  refreshIntervalMs: z.number().step(100).min(500).max(30_000).default(500).description('Dashboard refresh interval in milliseconds.'),
  motion: z.union(['full', 'reduced'] as const).default('full').description('Dashboard motion level / 动画强度'),
  backgroundReviewEnabled: z.boolean().default(true).description('Derive review candidates from completed collaboration records.'),
  backgroundReviewIntervalMs: z.number().step(1_000).min(2_000).max(3_600_000).default(15_000).description('Background review interval in milliseconds.'),
})

export const Config: z<Config> = z.object({
  workspace: z.string().description('Project workspace used to build the View. Defaults to the current DSH workspace.'),
  storagePath: z.string().description('Optional path for persisted View state.'),
  locale: z.union(['zh-CN', 'en-US'] as const).default('zh-CN').description('Dashboard language / 看板语言'),
  refreshIntervalMs: z.number().step(100).min(500).max(30_000).default(500).description('Dashboard refresh interval in milliseconds.'),
  motion: z.union(['full', 'reduced'] as const).default('full').description('Dashboard motion level / 动画强度'),
  backgroundReviewEnabled: z.boolean().default(true).description('Derive review candidates from completed collaboration records.'),
  backgroundReviewIntervalMs: z.number().step(1_000).min(2_000).max(3_600_000).default(15_000).description('Background review interval in milliseconds.'),
})

declare module 'cordis' {
  interface Context {
    sonarView: ViewService
  }
}

function workspaceFor(config?: Config): string {
  return resolve(config?.workspace ?? process.env.DSH_WORKSPACE_ROOT ?? process.cwd())
}

function statePathFor(workspace: string, config?: Config): string {
  if (config?.storagePath) return resolve(config.storagePath)
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const key = createHash('sha256').update(workspace).digest('hex').slice(0, 16)
  return join(dshHome, 'dsh-sonar', key, 'state.json')
}

export function apply(ctx: Context, config?: Config): void {
  const workspace = workspaceFor(config)
  const ui: ViewUiConfig = {
    locale: config?.locale ?? 'zh-CN',
    refreshIntervalMs: config?.refreshIntervalMs ?? 500,
    motion: config?.motion ?? 'full',
    backgroundReviewEnabled: config?.backgroundReviewEnabled ?? true,
    backgroundReviewIntervalMs: config?.backgroundReviewIntervalMs ?? 15_000,
  }
  const view = new ViewService(workspace, statePathFor(workspace, config), ui)
  const directCount = view.status().active.entries.filter(entry => entry.readMode === 'direct').length
  view.observeRead('direct', `Runtime loaded ${directCount} direct View item(s)`, 'system')
  let uiSource = (): ViewUiConfig => ui
  let reviewTimer: ReturnType<typeof setInterval> | undefined
  const stopReview = (): void => {
    if (reviewTimer !== undefined) clearInterval(reviewTimer)
    reviewTimer = undefined
  }
  const applyUi = (): void => {
    const next = uiSource()
    view.setUiConfig(next)
    stopReview()
    if (!next.backgroundReviewEnabled) return
    const review = (): void => { view.organizeCompletedTeamwork() }
    review()
    reviewTimer = setInterval(review, next.backgroundReviewIntervalMs)
  }
  ctx.effect(() => () => stopReview(), 'dsh-sonar: background View organization')
  applyUi()
  installSettingsSection(ctx, VIEW_SETTINGS_NAMESPACE, ViewSettingsConfig, ui, {
    setSource: (current) => { uiSource = current },
    onChange: applyUi,
  })
  const configurationStatus = (): ViewConfigurationStatus => {
    const service = ctx.get('settings')
    const descriptor = service?.describe().find(item => item.ns === VIEW_SETTINGS_NAMESPACE)
    return {
      available: descriptor !== undefined,
      writable: service?.writable ?? false,
      applies: 'live',
      revision: descriptor?.revision ?? 0,
      user: (descriptor?.user ?? {}) as Partial<ViewUiConfig>,
    }
  }
  const settings: ViewSettingsBridge = {
    status: configurationStatus,
    async save(next, expectedRevision) {
      const service = ctx.get('settings')
      if (!service) throw new Error('settings service is unavailable')
      await service.replace(VIEW_SETTINGS_NAMESPACE, next, expectedRevision)
      applyUi()
      return configurationStatus()
    },
    async reset(expectedRevision) {
      const service = ctx.get('settings')
      if (!service) throw new Error('settings service is unavailable')
      await service.replace(VIEW_SETTINGS_NAMESPACE, {}, expectedRevision)
      applyUi()
      return configurationStatus()
    },
  }
  ctx.provide('sonarView', view)
  registerViewCommand(ctx)
  registerViewRpc(ctx, view, settings)
  registerViewTool(ctx, view)
  ctx.systemPrompt.section({
    name: 'project:view',
    order: 80,
    text: () => view.renderPrompt(),
  })
}

export type { ProposeInput } from './view-service.ts'
export type * from './types.ts'
