import type { Context } from 'cordis'
import type { ConnectionRpcHandler, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { SONAR_READ_RPC, SONAR_WRITE_RPC } from './types.ts'
import type { ViewConfigurationStatus, ViewUiConfig } from './types.ts'
import type { ProposeInput, ViewService } from './view-service.ts'

type RpcResult = Awaited<ReturnType<ConnectionRpcHandler>>

function ok(value: unknown): RpcResult {
  return { ok: true, value } as RpcResult
}

function fail(code: string, message: string): RpcResult {
  return { ok: false, error: { code, message, details: {} } } as RpcResult
}

export interface ViewSettingsBridge {
  status(): ViewConfigurationStatus
  save(config: ViewUiConfig, expectedRevision?: number): Promise<ViewConfigurationStatus>
  reset(expectedRevision?: number): Promise<ViewConfigurationStatus>
}

export function registerViewRpc(ctx: Context, view: ViewService, settings?: ViewSettingsBridge): void {
  const connection = ctx.connection as HostConnectionHandle
  connection.rpc.handle(SONAR_READ_RPC, async (method, params) => {
    try {
      const input = params as Record<string, unknown>
      if (method === 'status') return ok({
        ...view.status(),
        configuration: settings?.status(),
      })
      if (method === 'query') {
        const result = view.query(input.query as string | undefined, input.type as never, input.readMode as never)
        view.observeRead('query', `Browser query matched ${result.length} View item(s)`, 'user', input.type as never)
        return ok(result)
      }
      if (method === 'read') {
        const entry = view.read(input.id as string)
        if (entry) view.observeRead(entry.readMode, `Browser read ${entry.title}`, 'user', entry.type)
        return ok(entry)
      }
      return fail('bad-request', `unknown read method: ${method}`)
    } catch (error) {
      return fail('internal', error instanceof Error ? error.message : String(error))
    }
  }, { authority: 'trusted-host' })

  connection.rpc.handle(SONAR_WRITE_RPC, async (method, params) => {
    try {
      const input = params as Record<string, unknown>
      if (method === 'propose') return ok(view.propose(input as unknown as ProposeInput))
      if (method === 'decide') return ok(view.decide(input.id as string, input.decision as 'accept' | 'reject'))
      if (method === 'setSourceEnabled') return ok(view.setSourceEnabled(input.id as string, Boolean(input.enabled)))
      if (method === 'organize') return ok(view.organizeEntry(input.id as string, input.targetType as never))
      if (method === 'saveSettings') {
        if (!settings) throw new Error('View settings are unavailable')
        return ok(await settings.save(input.config as ViewUiConfig, input.expectedRevision as number | undefined))
      }
      if (method === 'resetSettings') {
        if (!settings) throw new Error('View settings are unavailable')
        return ok(await settings.reset(input.expectedRevision as number | undefined))
      }
      return fail('bad-request', `unknown write method: ${method}`)
    } catch (error) {
      return fail('internal', error instanceof Error ? error.message : String(error))
    }
  }, { authority: 'trusted-host' })
}
