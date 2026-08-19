/**
 * M1 — deterministic event-graph builder: one session's raw log becomes a
 * session->turn->step->tool execution tree with seq citations.
 *
 * Pure function over the raw SessionEvent[] (the same view sync/raw-event.ts
 * reads): identical (session, log) always yields an identical graph — same
 * node/edge ids, same citations — so rebuilds are idempotent. LLM-free:
 * every edge is a structural fact of the log, which is what makes the graph
 * trustworthy as the genealogy layer's floor (docs/genealogy-vision.md §4).
 * @module @fakechris/dsh-track/graph/build
 */

import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { hashCanonical } from '../sync/raw-event.ts'
import type { GraphCitation, GraphEdge, GraphNode, SessionGraph } from '../types.ts'

/** Deterministic node id — stable across rebuilds of the same log. */
export function graphNodeId(sessionId: string, kind: string, key: string, extra = ''): string {
  return 'gn_' + hashCanonical([sessionId, kind, key, extra])
}

/** Deterministic edge id — (kind, from, to) only, so the same logical edge
 *  dedupes across rebuilds regardless of the seq it was first seen at. */
export function graphEdgeId(sessionId: string, kind: string, fromId: string, toId: string): string {
  return 'ge_' + hashCanonical([sessionId, kind, fromId, toId])
}

/** Concatenated text blocks of a message payload, truncated. */
function textOf(content: unknown, max = 120): string | undefined {
  if (!Array.isArray(content)) return undefined
  const text = content
    .filter((b): b is { type: 'text'; text: string } =>
      typeof b === 'object' && b !== null
      && (b as { type?: unknown }).type === 'text'
      && typeof (b as { text?: unknown }).text === 'string')
    .map((b) => b.text)
    .join(' ')
    .trim()
  if (!text) return undefined
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** True when a tool/result payload looks error-ish (mirror of raw-event.ts). */
function resultIsError(data: unknown): boolean {
  const d = data as { error?: unknown; message?: { content?: Array<{ type?: string; isError?: boolean }> } }
  if (d.error !== undefined && d.error !== null && d.error !== false) return true
  const block = d.message?.content?.[0]
  return block?.isError === true
}

const cite = (sessionId: string, a: number, b: number): GraphCitation => ({ sessionId, seqStart: a, seqEnd: b })

/** Builder schema version — bump on shape changes; stored graphs older than
 *  this are stale and get rebuilt (service freshness check). */
export const GRAPH_VERSION = 6

interface BuilderState {
  sessionId: string
  nodes: Map<string, GraphNode>
  edges: Map<string, GraphEdge>
  sessionNodeId: string
  /** Stable turn identity: turn number -> node id (one node per turn). */
  turnById: Map<number, string>
  /** Stable step identity: 'turn:step' -> node id. */
  stepByKey: Map<string, string>
  toolByCall: Map<string, string>
  pendingUser: string[]
  curTurn?: number
  maxSeq: number
  maxTime: number
  agentLabel?: string
  sessionTitle?: string
  addEdge(kind: 'contains' | 'invokes' | 'provoked', fromId: string, toId: string, seq: number): void
  getOrCreateTurn(turn: number, seq: number, time: number): string
  getOrCreateStep(turn: number, step: number, seq: number, time: number): string
}

/**
 * Build the execution graph of one session from its raw log.
 * @param sessionId session id (also the graph record key).
 * @param events raw events (a header line with no seq is skipped here).
 * @param header optional session header — facts on the session root node.
 * @param now build timestamp (injectable so tests are deterministic).
 */
export function buildSessionGraph(
  sessionId: string,
  events: readonly SessionEvent[],
  header?: SessionHeader,
  now = Date.now(),
): SessionGraph {
  const sessionNodeId = graphNodeId(sessionId, 'session', '0')
  const st: BuilderState = {
    sessionId,
    nodes: new Map(),
    edges: new Map(),
    sessionNodeId,
    turnById: new Map(),
    stepByKey: new Map(),
    toolByCall: new Map(),
    pendingUser: [],
    maxSeq: 0,
    maxTime: 0,
    addEdge(kind, fromId, toId, seq) {
      const id = graphEdgeId(this.sessionId, kind, fromId, toId)
      if (this.edges.has(id)) return
      this.edges.set(id, { id, kind, fromId, toId, citation: cite(this.sessionId, seq, seq) })
    },
    getOrCreateTurn(turn, seq, time) {
      const existing = this.turnById.get(turn)
      if (existing !== undefined) return existing
      const id = graphNodeId(this.sessionId, 'turn', String(turn))
      this.nodes.set(id, { id, kind: 'turn', title: 'Turn ' + turn, citation: cite(this.sessionId, seq, seq), turn, createdAt: time })
      this.turnById.set(turn, id)
      this.addEdge('contains', this.sessionNodeId, id, seq)
      return id
    },
    getOrCreateStep(turn, step, seq, time) {
      const key = turn + ':' + step
      const existing = this.stepByKey.get(key)
      if (existing !== undefined) return existing
      const tid = this.getOrCreateTurn(turn, seq, time)
      const id = graphNodeId(this.sessionId, 'step', key)
      this.nodes.set(id, { id, kind: 'step', title: 'Step ' + step, citation: cite(this.sessionId, seq, seq), turn, step, createdAt: time })
      this.stepByKey.set(key, id)
      this.addEdge('contains', tid, id, seq)
      return id
    },
  } as BuilderState

  st.nodes.set(sessionNodeId, {
    id: sessionNodeId,
    kind: 'session',
    title: sessionId,
    citation: cite(sessionId, 0, 0),
    parentSessionId: header?.parentSession,
    origin: header?.origin,
    createdAt: header?.createdAt ?? now,
  } as GraphNode)

  for (const event of events) {
    if (typeof event.seq !== 'number') continue // header line / non-event
    const seq = event.seq
    const time = event.time ?? now
    if (seq > st.maxSeq) st.maxSeq = seq
    if (time > st.maxTime) st.maxTime = time
    const data = event.data as Record<string, unknown>
    // Cast to string: older session-type catalogs may not list every event
    // type (e.g. subagent/descriptor), while the runtime logs still carry them.
    switch (event.type as string) {
      case 'turn/start': {
        const turn = data.turn as number | undefined
        if (typeof turn !== 'number') break
        st.curTurn = turn
        st.getOrCreateTurn(turn, seq, time)
        // User requests that arrived before this turn provoked it.
        const tid = st.turnById.get(turn)
        if (tid !== undefined) {
          for (const uid of st.pendingUser) st.addEdge('provoked', uid, tid, seq)
          st.pendingUser.length = 0
        }
        break
      }
      case 'step/start': {
        const turn = data.turn as number | undefined
        const step = data.step as number | undefined
        if (typeof turn !== 'number' || typeof step !== 'number') break
        st.curTurn = turn
        st.getOrCreateStep(turn, step, seq, time)
        break;
      }
      case 'tool/call': {
        const callId = data.callId as string | undefined
        const name = data.name as string | undefined
        const turn = data.turn as number | undefined
        const step = data.step as number | undefined
        const id = graphNodeId(sessionId, 'tool', String(seq), callId ?? '')
        st.nodes.set(id, {
          id,
          kind: 'tool',
          title: 'tool ' + (name ?? '?'),
          citation: cite(sessionId, seq, seq),
          turn,
          step,
          toolName: name,
          callId,
          createdAt: time,
        } as GraphNode)
        if (callId) st.toolByCall.set(callId, id)
        const parent = (typeof step === 'number' && typeof turn === 'number'
          ? st.getOrCreateStep(turn, step, seq, time)
          : typeof turn === 'number' ? st.getOrCreateTurn(turn, seq, time) : sessionNodeId)
        st.addEdge('invokes', parent, id, seq)
        break;
      }
      case 'tool/result': {
        const msg = data.message as { source?: { callId?: string } } | undefined
        const callId = msg?.source?.callId as string | undefined
        const target = callId !== undefined ? st.toolByCall.get(callId) : undefined
        const err = resultIsError(data)
        if (target !== undefined) {
          const node = st.nodes.get(target)
          if (node !== undefined) {
            node.citation = { ...node.citation, seqEnd: Math.max(node.citation.seqEnd, seq) }
            if (err) node.toolError = true
          }
        } else if (callId !== undefined) {
          // Result without a visible call (resumed/spliced log): materialize a
          // tool node so the failure still shows in the tree.
          const turn = data.turn as number | undefined
          const step = data.step as number | undefined
          const id = graphNodeId(sessionId, 'tool', String(seq), callId)
          st.nodes.set(id, { id, kind: 'tool', title: 'tool/result', citation: cite(sessionId, seq, seq), turn, step, callId, toolError: err, createdAt: time } as GraphNode)
          const parent = (typeof step === 'number' && typeof turn === 'number'
            ? st.getOrCreateStep(turn, step, seq, time)
            : typeof turn === 'number' ? st.getOrCreateTurn(turn, seq, time) : sessionNodeId)
          st.addEdge('invokes', parent, id, seq)
        }
        break;
      }
      case 'user/message': {
        const source = data.source as { kind?: string } | undefined
        if (source?.kind !== 'user') break // tool/system injections are noise
        const id = data.id as string | undefined
        const nodeId = graphNodeId(sessionId, 'user-message', String(seq), id ?? '')
        const title = textOf(data.content) ?? '(user request)'
        st.nodes.set(nodeId, { id: nodeId, kind: 'user-message', title, citation: cite(sessionId, seq, seq), turn: st.curTurn, messageId: id, createdAt: time } as GraphNode)
        st.addEdge('contains', sessionNodeId, nodeId, seq)
        if (st.curTurn !== undefined) {
          const tid = st.turnById.get(st.curTurn)
          if (tid !== undefined) st.addEdge('provoked', nodeId, tid, seq)
          else st.pendingUser.push(nodeId)
        } else {
          st.pendingUser.push(nodeId)
        }
        break;
      }
      case 'assistant/message': {
        const turn = data.turn as number | undefined
        const id = graphNodeId(sessionId, 'assistant', String(seq), '')
        const title = textOf((data.message as { content?: unknown } | undefined)?.content) ?? '(assistant reply)'
        st.nodes.set(id, { id, kind: 'assistant', title, citation: cite(sessionId, seq, seq), turn, createdAt: time } as GraphNode)
        const parent = (typeof turn === 'number' ? st.getOrCreateTurn(turn, seq, time) : sessionNodeId)
        st.addEdge('contains', parent, id, seq)
        break;
      }
      case 'subagent/descriptor': {
        // This session IS a subagent; the descriptor labels it (header carries
        // parentSession + origin). Patch the session root.
        const label = data.label as string | undefined
        if (label) st.agentLabel = label
        break;
      }
      case 'session/title': {
        const title = data.title as string | undefined
        if (typeof title === 'string' && title) st.sessionTitle = title
        break;
      }
      case 'turn/end': {
        st.curTurn = undefined
        // Record the turn outcome (calendar-yarn ✓/⊘/✕) from reason.kind.
        const reason = (data.reason as { kind?: string } | undefined)?.kind
        const outcome = reason === 'completed' ? 'completed'
          : reason === 'aborted' ? 'aborted'
          : reason === 'error' || reason === 'max-tokens' ? 'error'
          : reason === 'blocked' ? 'blocked' : undefined
        const turn = data.turn as number | undefined
        if (typeof turn === 'number') {
          const tid = st.turnById.get(turn)
          const node = tid !== undefined ? st.nodes.get(tid) : undefined
          if (node !== undefined) {
            // The turn node now covers its whole range (turn/start .. turn/end).
            node.citation = { ...node.citation, seqEnd: Math.max(node.citation.seqEnd, seq) }
            if (outcome !== undefined) node.outcome = outcome
          }
        }
        break;
      }
      default:
        break; // chunk/reasoning/step-end/request events add no tree structure
    }
  }

  // Finalize the session root: title, label, full seq coverage.
  const root = st.nodes.get(sessionNodeId)
  if (root !== undefined) {
    root.title = st.sessionTitle ?? (st.agentLabel ? 'subagent: ' + st.agentLabel : sessionId)
    root.agentLabel = st.agentLabel
    root.citation = cite(sessionId, 0, st.maxSeq)
  }

  const nodes = [...st.nodes.values()]
  nodes.sort((a, b) => a.citation.seqStart - b.citation.seqStart || a.citation.seqEnd - b.citation.seqEnd || (a.id < b.id ? -1 : 1))
  const edges = [...st.edges.values()]
  edges.sort((a, b) => a.citation.seqStart - b.citation.seqStart || (a.id < b.id ? -1 : 1))

  return {
    sessionId,
    header: {
      id: sessionId,
      cwd: header?.cwd,
      parentSession: header?.parentSession,
      origin: header?.origin,
      delegationDepth: header?.delegationDepth,
      agentPreset: (header as { agentPreset?: string } | undefined)?.agentPreset,
      createdAt: header?.createdAt ?? now,
    },
    nodes,
    edges,
    seqEnd: st.maxSeq,
    lastActivityAt: st.maxTime > 0 ? st.maxTime : now,
    builtAt: now,
    version: GRAPH_VERSION,
  }
}
