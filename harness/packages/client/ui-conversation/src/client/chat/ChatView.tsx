// ChatView: the default conversation view — message flow with user bubbles,
// assistant narration, tool summary rows grouped into step runs, pending
// cards, paging, and bottom-follow. Session stats live on
// 'conversation.composer.dock' (sticky with the composer). Pure component
// registered directly; its registration declares the whole-Tool
// 'conversation.chat.tool' seat. ui-tool owns root/subcall composition and
// keyed per-tool dispatch behind that boundary.
//
// Scroll: when nested under `[data-conversation-scroll]` (active conversation
// column), that host is the scrollport and this view is flow content; when
// mounted alone (unit tests), `.scroll` owns overflow. Bottom-follow and
// prepend anchoring always target the resolved scrollport.
//
// Render economics (architecture RFC performance model): the list parent
// subscribes to snapshot segments that do NOT change per streaming chunk
// (nodes/runningCalls/pending keep their references across chunk batches), so
// during a token storm only StreamingTail re-renders; history rows hold via
// memo on cache-stable node slices. Selection changes re-render the parent
// map but only rows whose own selected bit flipped. renderSlot is
// entry-identity-stable (framework binding cache), so passing it through
// memoized rows never churns them.

import {
  memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type {
  CommandNode, ConversationNode, ConversationSnapshot, RunningToolCall, ToolCallBlock, ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { assistantActionsSeqs, assistantBranchSeqs, deriveChatFlow, runningTurnStartTime, type ChatFlowItem } from './chat-flow.ts'
import { AssistantMarkdown } from './AssistantMarkdown.tsx'
import { CompactionCommandCard } from './CompactionCommandCard.tsx'
import { GenericCommandCard } from './GenericCommandCard.tsx'
import { MessageItem, PendingSteeringBubble } from './MessageItem.tsx'
import { formatRunDuration } from './message-chrome.ts'
import { deriveTurnMetrics } from './turn-metrics.ts'
import css from './ChatView.module.css'

const FOLLOW_THRESHOLD = 24

/** Active column host when present; otherwise the view-local scroller. */
function scrollerOf(from: HTMLElement): HTMLElement {
  return (from.closest('[data-conversation-scroll]')) ?? from
}

interface PagingAnchor {
  /** Stable node/call identity, independent of boundary-spanning group keys. */
  key: string
  /** Row top relative to the scrollport after the latest user scroll. */
  top: number
}

/** Find an already-rendered settled row without interpolating a selector. */
function anchorElement(list: HTMLElement, key: string): HTMLElement | null {
  for (const row of list.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
    if (row.dataset.chatAnchorKey === key) return row
  }
  return null
}

/** Row position in scrollport coordinates (viewport-independent). */
function flowTop(row: HTMLElement, scrollport: HTMLElement): number {
  return row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top
}

/** Select a visible stable node/call identity, falling back only when layout
 * has not exposed a visible box yet. */
function pagingAnchor(list: HTMLElement, scrollport: HTMLElement): HTMLElement | null {
  const viewport = scrollport.getBoundingClientRect()
  const composer = scrollport.querySelector<HTMLElement>('[data-composer-seat]')
  const visibleBottom = composer?.getBoundingClientRect().top ?? viewport.bottom
  // Scroll events are hot: hit-test a few points through the stretched flow
  // rows before considering the full mounted set. The fallback keeps jsdom
  // and pre-layout states deterministic; a virtualizer naturally bounds it.
  if (typeof document.elementsFromPoint === 'function' && visibleBottom > viewport.top) {
    const content = list.getBoundingClientRect()
    const left = Math.max(viewport.left, content.left)
    const right = Math.min(viewport.right, content.right)
    const x = left + Math.max(0, right - left) / 2
    const height = visibleBottom - viewport.top
    const points = [1, Math.min(32, height / 3), height / 2, Math.max(1, height - 1)]
    for (const offset of points) {
      for (const element of document.elementsFromPoint(x, viewport.top + offset)) {
        const row = element instanceof HTMLElement
          ? element.closest<HTMLElement>('[data-chat-anchor-key]')
          : null
        if (row !== null && list.contains(row)) return row
      }
    }
  }
  const rows = [...list.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')]
  const visibleRows = rows.filter((row) => {
    const rect = row.getBoundingClientRect()
    return rect.bottom > viewport.top && rect.top < visibleBottom
  })
  return visibleRows[0] ?? rows[0] ?? null
}

type OpenFile = (path: string) => void

type InspectCall = (callId: string) => void

/** Declared child-slot render share (stable framework binding). */
type RenderChatSlot = ChatViewSlotProps['renderSlot']

type ChatScrollPosition = NonNullable<ReturnType<ChatViewSlotProps['chatScroll']['read']>>

/** ui-slots' UseSession is deliberately wide (dependency direction); the
 *  chat view narrows once to the runtime snapshot the binding actually feeds. */
type UseConversation = SnapshotSelectorHook<ConversationSnapshot>

function treeContainsCall(block: ToolCallBlock, callId: string | undefined): boolean {
  return callId !== undefined
    && (block.callId === callId || block.subCalls.some(child => treeContainsCall(child, callId)))
}

function activeRetrySeq(nodes: readonly ConversationNode[], running: boolean): number | null {
  if (!running) return null
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (node === undefined) continue
    if (node.kind === 'model-retry') return node.retryState === 'cancelled' ? null : node.seq
    if (node.kind === 'assistant' || node.kind === 'user') return null
  }
  return null
}

/** Capture a reflow-resistant reader position from the current rendered window. */
function scrollPosition(list: HTMLElement, scrollport: HTMLElement): ChatScrollPosition | null {
  const row = pagingAnchor(list, scrollport)
  const anchorKey = row?.dataset.chatAnchorKey
  if (row === null || anchorKey === undefined) return null
  return {
    anchorKey,
    anchorTop: flowTop(row, scrollport),
    scrollTop: scrollport.scrollTop,
  }
}

/** One ordered root Tool call handed intact to the Tool presentation plugin. */
const ToolSeat = memo(function ToolSeat({
  renderSlot, callId, toolName, block, openFile, selectedCallId, cwd, inspectCall,
}: {
  renderSlot: RenderChatSlot
  callId: string
  toolName: string
  block: ToolResultNode | RunningToolCall
  openFile: OpenFile
  selectedCallId?: string | undefined
  cwd: string | undefined
  inspectCall: InspectCall
}) {
  const owner = useMemo(() => ({
    callId, toolName, block, selectedCallId, cwd, openFile, inspectCall,
  }), [callId, toolName, block, selectedCallId, cwd, openFile, inspectCall])
  return renderSlot('conversation.chat.tool', owner)
})

/** Consecutive tool results as one step-run group (uniform 16px rhythm). */
const ToolGroup = memo(function ToolGroup({ renderSlot, results, openFile, selectedCallId, cwd, inspectCall }: {
  renderSlot: RenderChatSlot
  results: readonly ToolResultNode[]
  openFile: OpenFile
  /** Tool ownership resolves whether the selection is this root or one of its children. */
  selectedCallId: string | undefined
  /** Session workspace root for path-relative summaries. */
  cwd: string | undefined
  inspectCall: InspectCall
}) {
  return (
    <div className={css.toolGroup}>
      {results.map(node => (
        <ToolSeat
          key={node.callId}
          renderSlot={renderSlot}
          callId={node.callId}
          toolName={node.call?.name ?? ''}
          block={node}
          openFile={openFile}
          selectedCallId={treeContainsCall(node, selectedCallId) ? selectedCallId : undefined}
          cwd={cwd}
          inspectCall={inspectCall}
        />
      ))}
    </div>
  )
})

/** One command lifecycle row: keyed dispatch on the command name with the
 *  generic card as the render-site fallback (zero registration required). A
 *  run-less cross-window node has no name and always lands on the fallback. */
const CommandRow = memo(function CommandRow({ renderSlot, node, compaction, t }: {
  renderSlot: RenderChatSlot
  node: CommandNode
  compaction?: Extract<ConversationNode, { kind: 'compaction' }>
  t: ChatViewSlotProps['t']
}) {
  const owner = useMemo(() => ({ node, ...compaction === undefined ? {} : { compaction } }), [compaction, node])
  const fallback = node.name === 'compact'
    ? <CompactionCommandCard {...owner} t={t} />
    : <GenericCommandCard {...owner} t={t} />
  return (
    <div className={css.callRow}>
      {renderSlot('conversation.chat.commandview', owner, {
        entryKey: node.name ?? '',
        fallback,
      })}
    </div>
  )
})

/** Turn-level model activity label retained across first-token, tool, and streaming phases. */
function TurnStatus({ startTime, t }: {
  /** The running turn's logged `turn/start` time; null falls back to mount
   *  time when that boundary is outside the window. */
  startTime: number | null
  /** The owning view's locale seat. */
  t: ChatViewSlotProps['t']
}) {
  const [mountedAt] = useState(() => Date.now())
  // Anchored to turn/start so a mid-turn reload keeps the real
  // elapsed time and the final footer's Ran-for label matches this clock.
  const anchor = startTime ?? mountedAt
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - anchor))
  useEffect(() => {
    const tick = (): void => {
      setElapsedMs(Math.max(0, Date.now() - anchor))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => { clearInterval(id) }
  }, [anchor])
  // Short turns keep the plain label; the clock only appears once the turn
  // has clearly been running for a while.
  const showClock = elapsedMs >= 15_000
  return (
    <div className={css.turnStatus} role="status" aria-live="polite">
      Deep diving...
      {showClock && (
        <span className={css.turnStatusClock} aria-hidden>
          {formatRunDuration(elapsedMs, t)}
        </span>
      )}
    </div>
  )
}

/** The streaming partial, isolated so chunk batches re-render only this tail;
 *  the column ResizeObserver owns bottom-follow when its box grows. */
function StreamingTail({ useSession, t }: {
  useSession: UseConversation
  t: ChatViewSlotProps['t']
}) {
  const partial = useSession(s => s.partial)
  if (partial === null) return null
  return <AssistantMarkdown blocks={partial.blocks} streaming t={t} />
}

/**
 * The chat view slot entry: pure component over the composed props; each
 * ordered root Tool call crosses the declared whole-Tool render seat.
 */
export function ChatView({
  useSession, useSessions, useStore, renderSlot, renderSlotChain, sessionId, openFile, loadOlder, inspectCall, chatScroll, forkAt, t,
}: ChatViewSlotProps) {
  const nodes = useSession(s => s.nodes)
  const turnTimings = useSession(s => s.turnTimings)
  const turnEnds = useSession(s => s.turnEnds)
  const inbox = useSession(s => s.queue)
  // Workspace root off the session list row: path summaries display relative to it.
  const cwd = useSessions(s => s.byId[sessionId]?.cwd)
  const running = useSession(s => s.running)
  const runningCalls = useSession(s => s.runningCalls)
  const openState = useSession(s => s.openState)
  const openError = useSession(s => s.openError)
  const hasMore = useSession(s => s.hasMore)
  const loadingOlder = useSession(s => s.loadingOlder)
  const selectedCallId = useStore(s => s.selection?.callId)

  const items = useMemo(() => deriveChatFlow(nodes), [nodes])
  const pendingSteering = useMemo(
    () => inbox.filter(item => item.placement === 'steering'),
    [inbox],
  )
  const activeRetry = useMemo(() => activeRetrySeq(nodes, running), [nodes, running])
  // Only the last content assistant of each completed turn owns IconActions;
  // mid-turn text and every node of a running turn omit `time`, so
  // AssistantMarkdown stays chrome-free until the answer settles.
  const actionSeqs = useMemo(() => assistantActionsSeqs(nodes, turnEnds), [nodes, turnEnds])
  const branchSeqs = useMemo(() => assistantBranchSeqs(nodes, turnEnds), [nodes, turnEnds])
  const runningTurnStart = useMemo(() => runningTurnStartTime(turnTimings), [turnTimings])
  const turnMetrics = useMemo(() => deriveTurnMetrics(nodes), [nodes])

  const listRef = useRef<HTMLDivElement | null>(null)
  const columnRef = useRef<HTMLDivElement | null>(null)
  const atBottomRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  /** Last position delivered or written on the main thread. */
  const observedTopRef = useRef(0)
  /** Paging anchor: semantic row/position at click, updated by reader scrolls
   * while the request is pending and restored after the prepend lands. */
  const anchorRef = useRef<PagingAnchor | null>(null)
  const firstSeqRef = useRef<number | null>(null)
  const openedRef = useRef(false)
  const lastKeyRef = useRef<string | null>(null)
  const lastSteeringIdRef = useRef<string | null>(null)
  /** Flow tip signature — follow-scroll only when this moves, never on a
   *  scroll-driven at-bottom chrome re-render (that was snapping inertial
   *  scrolls the rest of the way to the floor). */
  const followSigRef = useRef<string | null>(null)

  const firstSeq = nodes[0]?.seq ?? null
  const lastItem = items[items.length - 1]
  const lastKey = lastItem?.key ?? null
  const lastSteeringId = pendingSteering[pendingSteering.length - 1]?.id ?? null
  const followSig = `${openState}:${firstSeq}:${lastKey}:${nodes.length}:${running ? 1 : 0}:${runningCalls.length}:${lastSteeringId ?? ''}`

  const toBottom = (el: HTMLElement): void => {
    anchorRef.current = null
    el.scrollTop = el.scrollHeight
    observedTopRef.current = el.scrollTop
    atBottomRef.current = true
    setAtBottom(true)
    chatScroll.save(null)
  }

  useLayoutEffect(() => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: React attaches the ref before layout effects run. */
    if (local === null) return
    const el = scrollerOf(local)
    // Open completed: jump to the bottom once — unless a scroll position
    // survives from a previous mount (view-tab switch away and back), which
    // is restored instead of snapping the reader back to the floor.
    if (openState === 'open' && !openedRef.current) {
      openedRef.current = true
      const saved = chatScroll.read()
      if (saved === null) {
        toBottom(el)
      } else {
        el.scrollTop = saved.scrollTop
        const row = anchorElement(local, saved.anchorKey)
        if (row !== null) el.scrollTop += flowTop(row, el) - saved.anchorTop
        observedTopRef.current = el.scrollTop
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD + 1
        atBottomRef.current = isAtBottom
        setAtBottom(isAtBottom)
        const normalized = isAtBottom ? null : scrollPosition(local, el)
        if (isAtBottom) chatScroll.save(null)
        else if (normalized !== null) chatScroll.save(normalized)
      }
      firstSeqRef.current = firstSeq
      lastKeyRef.current = lastKey
      lastSteeringIdRef.current = lastSteeringId
      followSigRef.current = followSig
      return
    }
    // Prepend (head seq decreased): preserve the same settled row at the
    // position established by the reader's latest scroll. This excludes
    // unrelated tail/composer growth while the request was in flight.
    if (anchorRef.current !== null && firstSeq !== null && firstSeqRef.current !== null && firstSeq < firstSeqRef.current) {
      const anchor = anchorRef.current
      anchorRef.current = null
      const row = anchorElement(local, anchor.key)
      if (row !== null) el.scrollTop += flowTop(row, el) - anchor.top
      observedTopRef.current = el.scrollTop
      firstSeqRef.current = firstSeq
      /* v8 ignore next -- ?? arm: a prepend adds nodes, so the flow list here is never empty. */
      lastKeyRef.current = lastKey
      lastSteeringIdRef.current = lastSteeringId
      followSigRef.current = followSig
      return
    }
    firstSeqRef.current = firstSeq
    // Own words must be visible: a new trailing user node force-scrolls
    // (send lives in the composer, so arrival is detected here, not armed there).
    const appendedUser = lastKey !== lastKeyRef.current
      && lastItem !== undefined && lastItem.kind === 'node' && lastItem.node.kind === 'user'
    const appendedSteering = lastSteeringId !== null && lastSteeringId !== lastSteeringIdRef.current
    const tipMoved = followSigRef.current !== followSig
    lastKeyRef.current = lastKey
    lastSteeringIdRef.current = lastSteeringId
    followSigRef.current = followSig
    // Follow new flow content while pinned; do NOT re-pin on every render
    // merely because atBottomRef is true (scroll threshold → setState → snap).
    if (appendedUser || appendedSteering || (tipMoved && atBottomRef.current)) toBottom(el)
  })

  const onScrollRef = useRef(() => {})
  onScrollRef.current = () => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: the handler only fires while mounted. */
    if (local === null) return
    const el = scrollerOf(local)
    // Only reader input may make raw scroll geometry change follow ownership:
    // a delivered position that deviates from the observed-top ledger (every
    // programmatic write records itself there synchronously). This covers
    // wheel, touch, scrollbar, and keyboard alike without naming devices.
    // Browser shrink-clamps land exactly on the floor min and delayed
    // programmatic deliveries land on the ledger itself, so both preserve
    // the current ownership state.
    const floor = Math.max(0, el.scrollHeight - el.clientHeight)
    const movedByReader = Math.abs(el.scrollTop - Math.min(observedTopRef.current, floor)) > 0.5
    const isAtBottom = movedByReader
      ? floor - el.scrollTop <= FOLLOW_THRESHOLD + 1
      : atBottomRef.current
    if (!movedByReader && isAtBottom) {
      toBottom(el)
      return
    }
    atBottomRef.current = isAtBottom
    setAtBottom(isAtBottom)
    const position = isAtBottom ? null : scrollPosition(local, el)
    if (isAtBottom) {
      anchorRef.current = null
    } else if (anchorRef.current !== null && position !== null) {
      anchorRef.current = { key: position.anchorKey, top: position.anchorTop }
    }
    // Continuous save (unmount happens after ref detach, so saving there is
    // too late); pinned-to-bottom clears so a remount keeps following.
    if (isAtBottom) chatScroll.save(null)
    else if (position !== null) chatScroll.save(position)
    observedTopRef.current = el.scrollTop
  }

  // Bind the scroll listener on the resolved scrollport once per mount;
  // reader-input attribution rides the observed-top ledger, not per-device
  // input listeners.
  useEffect(() => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: effect runs after the list node commits. */
    if (local === null) return
    const el = scrollerOf(local)
    const onScroll = (): void => { onScrollRef.current() }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  // The ref starts null and is assigned every render, so the placeholder
  // initializer a function initial value would need never exists.
  const followRef = useRef<(() => void) | null>(null)
  followRef.current = () => {
    const local = listRef.current
    if (local !== null && atBottomRef.current) {
      const el = scrollerOf(local)
      el.scrollTop = el.scrollHeight
      observedTopRef.current = el.scrollTop
      chatScroll.save(null)
    }
  }
  // Streaming, tool disclosures, and other flow changes resize the column;
  // the sticky composer resizes outside it. This observer owns ChatView's
  // dynamic-height follow decisions and writes only while the reader is pinned.
  useEffect(() => {
    const column = columnRef.current
    const local = listRef.current
    if (column === null || local === null || typeof ResizeObserver === 'undefined') return
    const scrollport = scrollerOf(local)
    const composer = scrollport.querySelector<HTMLElement>('[data-composer-seat]')
    const observer = new ResizeObserver(() => { followRef.current?.() })
    observer.observe(column)
    if (composer !== null) observer.observe(composer)
    return () => { observer.disconnect() }
  }, [])

  // A failed/empty page leaves the head unchanged. Once the request leaves
  // its busy state there is no future prepend for the saved anchor to own.
  useEffect(() => {
    if (!loadingOlder) anchorRef.current = null
  }, [loadingOlder])

  const loadOlderAnchored = (): void => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: the paging button renders inside the list tree. */
    if (local !== null) {
      const el = scrollerOf(local)
      const row = pagingAnchor(local, el)
      if (row !== null && row.dataset.chatAnchorKey !== undefined) {
        anchorRef.current = {
          key: row.dataset.chatAnchorKey,
          top: flowTop(row, el),
        }
      }
    }
    loadOlder()
  }

  const renderItem = (item: ChatFlowItem): ReactNode => {
    if (item.kind === 'tool-group') {
      return (
        <ToolGroup
          renderSlot={renderSlot}
          results={item.results}
          openFile={openFile}
          selectedCallId={selectedCallId}
          cwd={cwd}
          inspectCall={inspectCall}
        />
      )
    }
    if (item.kind === 'command-compaction') {
      return (
        <CommandRow
          renderSlot={renderSlot}
          node={item.command}
          compaction={item.compaction}
          t={t}
        />
      )
    }
    const node: ConversationNode = item.node
    if (node.kind === 'assistant') {
      const timing = actionSeqs.has(node.seq) ? turnTimings.get(node.turn) : undefined
      // Metrics gate on the settled in-window timing: turn/start loaded means
      // every step of the turn is loaded, so first-step TTFT is genuine.
      const metrics = timing?.endTime === undefined ? undefined : turnMetrics.get(node.turn)
      return (
        <AssistantMarkdown
          blocks={node.blocks}
          streaming={false}
          interrupted={node.interrupted}
          time={actionSeqs.has(node.seq) ? node.time : undefined}
          runMs={timing?.endTime === undefined
            ? undefined
            : Math.max(0, timing.endTime - timing.startTime)}
          ttftMs={metrics?.ttftMs}
          tokensPerSecond={metrics?.tokensPerSecond}
          seq={node.seq}
          onFork={forkAt}
          forkUnavailable={!branchSeqs.has(node.seq)}
          turnTail={actionSeqs.has(node.seq)
            ? { renderSlotChain, owner: { nodes, seq: node.seq, openFile } }
            : undefined}
          t={t}
        />
      )
    }
    if (node.kind === 'command') {
      return <CommandRow renderSlot={renderSlot} node={node} t={t} />
    }
    /* v8 ignore next -- tool-result never reaches here: deriveChatFlow folds them into groups. */
    if (node.kind === 'tool-result') return null
    return (
      <MessageItem
        node={node}
        retryActive={node.kind === 'model-retry' && node.seq === activeRetry}
        t={t}
      />
    )
  }

  return (
    <div className={css.root}>
      <div ref={listRef} className={css.scroll}>
        <div ref={columnRef} className={css.column} data-chat-flow="">
          {openState === 'loading' && <div className={css.hint}>{t('chat.loadingHistory')}</div>}
          {openState === 'error' && openError !== null && (
            <div className={css.openError}>
              {t('chat.loadError', { message: openError.message, code: openError.code })}
            </div>
          )}
          {hasMore && (
            <div className={css.older}>
              <button type="button" disabled={loadingOlder} onClick={loadOlderAnchored}>
                {loadingOlder ? t('loading') : t('chat.loadOlder')}
              </button>
            </div>
          )}
          {items.map(item => (
            <div
              key={item.key}
              className={css.flowItem}
              data-chat-anchor-key={item.kind === 'node'
                ? `node:${String(item.node.seq)}`
                : item.kind === 'command-compaction'
                  ? `node:${String(item.compaction.seq)}`
                  : undefined}
              data-chat-flow-key={item.key}
              data-chat-flow-kind={item.kind === 'node'
                ? item.node.kind
                : item.kind === 'command-compaction'
                  ? item.kind
                  : 'tool-group'}
            >
              {renderItem(item)}
            </div>
          ))}
          <StreamingTail useSession={useSession} t={t} />
          {runningCalls.length > 0 && (
            <div className={css.toolGroup}>
              {runningCalls.map(call => (
                <ToolSeat
                  key={call.callId}
                  renderSlot={renderSlot}
                  callId={call.callId}
                  toolName={call.name}
                  block={call}
                  openFile={openFile}
                  selectedCallId={treeContainsCall(call, selectedCallId) ? selectedCallId : undefined}
                  cwd={cwd}
                  inspectCall={inspectCall}
                />
              ))}
            </div>
          )}
          {/* No pending placeholders: questions (ui-question) and approvals
              (ApprovalPanel) both take over the composer, so a flow card would
              double-render the same wait. */}
          {/* Turn-level loading signal: rides the whole running turn (first-token
              wait, tool execution, streaming) so it never flickers per step. */}
          {running && <TurnStatus startTime={runningTurnStart} t={t} />}
          {pendingSteering.map(item => (
            <PendingSteeringBubble key={item.id} content={item.content} t={t} />
          ))}
        </div>
        {!atBottom && (
          <div className={css.toBottomSlot}>
            <button
              type="button"
              className={css.toBottom}
              aria-label={t('chat.toBottom')}
              onClick={() => {
                const local = listRef.current
                /* v8 ignore next -- ref-null guard: the button only renders alongside the mounted list. */
                if (local !== null) toBottom(scrollerOf(local))
              }}
            >
              <IconChevronDownOutline14 />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
