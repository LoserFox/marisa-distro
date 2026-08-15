import type { Context } from 'cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { TeamworkState, ViewContentType, ViewOperation, ViewReadMode, ViewWriteMode } from './types.ts'
import type { ViewService } from './view-service.ts'

export function registerViewTool(ctx: Context, view: ViewService): void {
  ctx.tools.register(defineTool({
    name: 'view',
    description: 'Read the confirmed project View or propose a user-confirmed change. For /view requests, choose the smallest operation path yourself. Memory, skills, and teamwork are real content projections of the same View. An active skill entry is already effective as a reusable View procedure and needs no external registry; self-evolution is an evidence-driven replace/add path rather than a separate store.',
    parameters: {
      action: { type: 'string', enum: ['status', 'query', 'read', 'propose'], required: true },
      query: { type: 'string', description: 'Search text for action=query. Only readMode=query entries are searched; use status/read for direct or expandable entries.' },
      id: { type: 'string', description: 'View entry id for action=read.' },
      type: { type: 'string', enum: ['memory', 'skill', 'teamwork'], description: 'Optional query filter; required for propose.' },
      sourceId: { type: 'string', description: 'Optional target View source for propose. If omitted, the enabled source matching type is used.' },
      operation: { type: 'string', enum: ['add', 'replace', 'remove'], description: 'Proposed operation. Defaults to add.' },
      readMode: { type: 'string', enum: ['direct', 'expand', 'query'], description: 'How the content is read after user confirmation activates a new View generation.' },
      writeMode: { type: 'string', enum: ['record', 'target'], description: 'How this proposal was produced: explicit record or pre-declared target. Background organization is reserved for the Host process.' },
      writeTarget: { type: 'string', description: 'Named destination provenance required when writeMode=target; it does not make accepted View content a placeholder.' },
      title: { type: 'string', description: 'Short title for a proposal.' },
      summary: { type: 'string', description: 'Compact directory/search summary.' },
      content: { type: 'string', description: 'Full proposed content.' },
      targetId: { type: 'string', description: 'Existing entry id for replace/remove.' },
      owner: { type: 'string', description: 'Natural-language owner name for teamwork.' },
      teamworkState: { type: 'string', enum: ['queued', 'active', 'waiting', 'blocked', 'done'], description: 'Projected teamwork status.' },
      progress: { type: 'number', description: 'Optional teamwork progress from 0 to 100.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: async (args) => {
      const input = args as Record<string, unknown>
      const action = input.action as string
      if (action === 'status') {
        const status = view.status()
        return JSON.stringify({ active: status.active, pendingActivation: status.pendingActivation, sources: status.sources }, null, 2)
      }
      if (action === 'query') {
        const type = input.type as ViewContentType | undefined
        const result = view.query(input.query as string | undefined, type, 'query')
        view.observeRead('query', `Query matched ${result.length} View item(s)`, 'model', type)
        return JSON.stringify(result, null, 2)
      }
      if (action === 'read') {
        if (!input.id) throw new Error('id is required for read')
        const entry = view.read(String(input.id))
        if (entry) view.observeRead(entry.readMode, `Read ${entry.title}`, 'model', entry.type)
        return JSON.stringify(entry ?? null, null, 2)
      }
      if (action === 'propose') {
        if (!input.type) throw new Error('type is required for propose')
        if (input.writeMode === 'background') throw new Error('background organization is owned by the View Host')
        const type = input.type as ViewContentType
        const sourceId = input.sourceId
          ? String(input.sourceId)
          : view.status().sources.find(source => source.type === type && source.enabled)?.id
        if (!sourceId) throw new Error(`no enabled View source accepts ${type}`)
        const candidate = view.propose({
          operation: input.operation as ViewOperation | undefined,
          sourceId,
          type,
          readMode: input.readMode as ViewReadMode | undefined,
          writeMode: input.writeMode as ViewWriteMode | undefined,
          writeTarget: input.writeTarget ? String(input.writeTarget) : undefined,
          title: String(input.title ?? ''),
          summary: String(input.summary ?? ''),
          content: String(input.content ?? ''),
          targetId: input.targetId ? String(input.targetId) : undefined,
          teamwork: type === 'teamwork' ? {
            owner: input.owner ? String(input.owner) : undefined,
            state: (input.teamworkState as TeamworkState | undefined) ?? 'queued',
            progress: typeof input.progress === 'number' ? input.progress : undefined,
          } : undefined,
          proposedBy: 'model',
        })
        return `A ${candidate.type} change is pending user confirmation. The active View is unchanged.`
      }
      throw new Error(`unknown action: ${action}`)
    },
    timeoutMs: 5000,
  }))
}
