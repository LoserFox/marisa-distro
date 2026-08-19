/**
 * Conversation view tab: 会话结构图 (calendar yarn). Registered as a
 * 'conversation.view' slot entry — the host renders the tab, tracks
 * aria-selected / active underline, and mounts only the active view. This
 * follows the ui-trajectory pattern exactly (no DOM tab injection).
 */
import { useEffect, useMemo, useState } from 'react'
import { CalendarYarnRoot, type CalData, type CalJump } from './calendar-yarn.tsx'

export interface GraphViewProps {
  /** Standard kit: the framework-resolved session id. */
  sessionId: string
  /** Jump handler: open a conversation + optional message. */
  onJump: (j: CalJump) => void
}

const calStyles: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  background: 'var(--dsw-alias-bg-base, #10151C)', color: '#D6DEE8',
  fontFamily: "-apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  minWidth: 0, minHeight: 0,
}

/**
 * Fetch the whole-store calendar dataset (all projects). The yarn is global
 * (not per-session); sessionId drives refresh + is available for future
 * per-session drill-down.
 */
async function fetchCalendar(): Promise<CalData | null> {
  try {
    const r = await fetch('/api/track/calendar').then((res) => res.json())
    return r.calendar ?? null
  } catch {
    return null
  }
}

export function GraphView(props: GraphViewProps) {
  const { sessionId, onJump } = props
  const [cal, setCal] = useState<CalData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    const load = (): void => {
      setLoading(true)
      void fetchCalendar().then((d) => { if (alive) { setCal(d); setLoading(false) } })
    }
    load()
    // Refresh when the right-panel build buttons finish (they dispatch this).
    const onBuilt = (): void => { load() }
    window.addEventListener('track:graph-built', onBuilt)
    return () => { alive = false; window.removeEventListener('track:graph-built', onBuilt) }
  }, [sessionId])
  const body = useMemo(() => {
    if (loading) return <div style={{ ...calStyles, alignItems: 'center', justifyContent: 'center', color: '#74839A', fontSize: 12 }}>加载日历纱线…</div>
    if (cal === null || cal.sessions.length === 0) {
      return <div style={{ ...calStyles, alignItems: 'center', justifyContent: 'center', color: '#74839A', fontSize: 12 }}>暂无日历数据 — 先在右侧 Track 面板点「构建」生成会话图</div>
    }
    return <CalendarYarnRoot data={cal} onJump={onJump} />
  }, [loading, cal, onJump])
  return <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>{body}</div>
}
