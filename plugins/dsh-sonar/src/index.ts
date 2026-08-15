/**
 * Browser-roster face. The compatibility registration covers DSH releases whose
 * first roster scan caches a profile-linked package as unresolved.
 */
import type { Context } from 'cordis'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-sonar'
export const inject = ['clientModuleHost']

interface ClientRosterCompat {
  graph(): { entries: Array<{ id: string }> }
  registerExternal?: (id: string, options: { clientPath: string; inject: string[] }) => string
  table?: Map<string, { entry: Record<string, unknown>; clientPath: string }>
  compose?: () => { entries: Array<{ id: string }> }
  composed?: { entries: Array<{ id: string }> }
  notifyGraphChanged?: () => void
}

export function apply(ctx: Context): void {
  const roster = ctx.get('clientModuleHost') as ClientRosterCompat
  if (roster.graph().entries.some(entry => entry.id === name)) return
  const clientPath = fileURLToPath(new URL('./client.js', import.meta.url))
  const inject = [
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-slots',
  ]
  if (roster.registerExternal) {
    roster.registerExternal(name, { clientPath, inject })
    return
  }

  // Compatibility with the current public DSH release. Newer releases expose
  // registerExternal; the fallback mirrors that method's one-row operation.
  if (!roster.table || !roster.compose || !roster.notifyGraphChanged) return
  const rev = createHash('sha1').update(readFileSync(clientPath, 'utf8')).digest('hex').slice(0, 12)
  roster.table.set(name, {
    clientPath,
    entry: { id: name, url: `/plugins/${name}/client.js?rev=${rev}`, rev, inject },
  })
  roster.composed = roster.compose()
  roster.notifyGraphChanged()
}
