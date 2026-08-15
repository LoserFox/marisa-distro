/**
 * DOM render channel: pure-plugin fence rendering for pristine hosts.
 *
 * Stock DSH renders every fenced code block through the shared CodeBlock
 * surface (stable class `md-code-block`, language label rendered as the
 * banner's childless label div). This channel observes the conversation DOM,
 * finds blocks labelled `dsh-ui`, parses the raw fence body and mounts the
 * plugin's own React tree next to the (hidden) stock block:
 *
 * - **Streaming takeover**: the channel takes over a dsh-ui block as soon as
 *   ONE finished component parses (the partial parser), and re-renders the
 *   root as the body grows — the UI assembles top-down while the reply
 *   streams, no settled marker required. A body with no finished component
 *   yet stays a stock code block (partial JSON must never look broken).
 * - **Pre-paint surgery repair**: the host's React re-renders during
 *   streaming can wipe our foreign container or reset the hide. A repair
 *   pass in the MutationObserver microtask re-applies the surgery before
 *   paint (same pattern the annotation plugin proved on this host), and the
 *   1s sweep is the backstop.
 * - **Settled transition**: when `[data-streaming]` leaves the row, the
 *   mount re-renders with the stable source identity — the moment panels
 *   publish and durable state keys in (mirrors the registry channel's
 *   settled-source semantics; streaming renders are identity-less).
 * - Stable identity: the owning row's `data-chat-anchor-key` (session-stable,
 *   seq-derived) + the fence's ordinal among settled dsh-ui blocks in that
 *   row. `sourceId = dom:<anchor>:<ordinal>` feeds panel dedup and durable
 *   state.
 * - Actions ride the plugin-owned GenuiActionContext provider: every tree
 *   this channel mounts is wrapped with a handler that relays
 *   `[genui-action]` through the scoped conversation send — no host plumbing.
 * - Removal (branch switch, unload): each mount is unmounted with its root,
 *   and the stock block is restored.
 *
 * Security posture matches the registry channel: only code shipped in this
 * plugin's browser bundle mounts React roots, the model can only author
 * fence text, and unrepairable bodies stay stock code blocks.
 */
import type { Key, ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { GenuiActionContext, type GenuiActionHandler } from './action-context.ts'
import { renderResolvedFenceNode, type GenuiFenceContext } from './fence-render.tsx'

/** The stock code-block surface every markdown fence renders through. */
const CODE_BLOCK = '.md-code-block'
/** Marker attribute set on blocks this channel has taken over. */
const PROCESSED = 'data-genui-rendered'
/** The settled marker on AssistantMarkdown (absent = settled). */
const STREAMING = '[data-streaming]'
/** Container class for the plugin-owned root. */
const CONTAINER_CLASS = 'genui-dom-fence'
/** Slow sweep interval: the observer catches everything, this is the 1s
 * belt-and-braces pass (history loads, missed attribute batches). */
const SWEEP_MS = 1000

interface Mount {
  root: Root
  container: HTMLElement
  block: HTMLElement
  lastRaw: string
  lastSettled: boolean
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE
}

/** The banner's language label: a childless div whose text is exactly the lang. */
function infostringOf(block: Element): string | null {
  // The label div holds nothing but text; the banner wrapper concatenates
  // label + copy-button text, so only the leaf div matches exactly.
  for (const div of block.querySelectorAll('div')) {
    if (div.childElementCount === 0 && div.textContent === 'dsh-ui') return 'dsh-ui'
  }
  return null
}

/** The banner label's raw text (empty while streaming — the host renders the
 * language label only once the reply settles). */
function labelTextOf(block: Element): string {
  for (const div of block.querySelectorAll('div')) {
    if (div.childElementCount === 0) return div.textContent ?? ''
  }
  return ''
}

/** Raw fence body from the stock block's code surface. */
function rawOf(block: Element): string {
  const pre = block.querySelector('pre')
  if (pre === null) return ''
  let text = ''
  for (const node of pre.childNodes) {
    if (isTextNode(node)) text += node.textContent ?? ''
    else text += node.textContent ?? ''
  }
  return text
}

/** Settled gate: no streaming marker on any ancestor. */
function isSettled(block: Element): boolean {
  return block.closest(STREAMING) === null
}

/** The owning conversation row (stable per-message identity). */
function rowOf(block: Element): Element | null {
  return block.closest('[data-chat-anchor-key]')
}

/** 1-based ordinal of this block among the row's settled dsh-ui blocks
 * (document order). Streaming candidates are skipped, so the ordinal stays
 * stable while the block itself is still streaming. */
function fenceIndexOf(row: Element, block: Element): number {
  let index = 0
  for (const candidate of row.querySelectorAll(CODE_BLOCK)) {
    if (candidate.closest(STREAMING) !== null) continue
    if (infostringOf(candidate) === null) continue
    index += 1
    if (candidate === block) return index
  }
  return index + 1
}

/** messageSeq estimate: the numeric part of the anchor key when present,
 * else the row's document-order index among chat rows (monotonic in seq). */
function anchorSeqOf(row: Element): number {
  const key = row.getAttribute('data-chat-anchor-key') ?? ''
  const match = /(\d+)/.exec(key)
  if (match !== null) {
    const value = Number(match[1])
    if (Number.isFinite(value)) return value
  }
  const rows = document.querySelectorAll('[data-chat-anchor-key]')
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i] === row) return i
  }
  return 0
}

/**
 * Install the DOM render channel. Returns a disposer that restores every
 * taken-over block and disconnects the observers.
 *
 * @param ctx - the client context (sessions service for the current session).
 * @param sendAction - plugin-owned relay: (sessionId, action, payload) → the
 *   scoped conversation send carrying the `[genui-action]` prompt.
 */
export function installDomFenceRenderer(
  ctx: Context,
  sendAction: (sessionId: SessionId, action: string, payload: Record<string, unknown>) => void,
): () => void {
  if (typeof document === 'undefined') return () => {}
  const mounts = new Map<HTMLElement, Mount>()

  const sessionIdOf = (): SessionId | undefined => {
    try {
      return ctx.sessions.list.getSnapshot().current
    } catch {
      return undefined
    }
  }

  /** Render context for a block: session always; the stable source identity
   * only once settled — streaming renders are identity-less (no panel
   * publish, no durable state), mirroring the registry channel. */
  function contextOf(row: Element, block: Element, settled: boolean): { key: Key; context: GenuiFenceContext } {
    const fenceIndex = fenceIndexOf(row, block)
    const anchorKey = row.getAttribute('data-chat-anchor-key') ?? 'unknown'
    const key = `dom:${anchorKey}:${fenceIndex}` as Key
    const sessionId = sessionIdOf()
    const context: GenuiFenceContext = {
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(settled ? { source: { id: key as string, order: [anchorSeqOf(row), 0, fenceIndex] as const } } : {}),
    }
    return { key, context }
  }

  function unmountBlock(block: HTMLElement): void {
    const mount = mounts.get(block)
    if (mount === undefined) return
    mounts.delete(block)
    mount.root.unmount()
    mount.container.remove()
    block.style.display = ''
    block.removeAttribute(PROCESSED)
  }

  function renderBlock(block: HTMLElement): void {
    if (block.hasAttribute(PROCESSED)) return
    const row = rowOf(block)
    if (row === null) return
    const settled = isSettled(block)
    // Settled blocks must carry the dsh-ui label. Streaming blocks cannot:
    // the host renders the language label only once the reply settles
    // (MarkdownText passes `lang={streaming ? undefined : lang}`), so during
    // streaming the fence is identified by CONTENT — a partial parse that
    // yields a GenUI node. A misidentified fence (e.g. a ```json block that
    // happens to parse) is reverted at the settle transition below.
    if (settled && infostringOf(block) === null) return
    const raw = rawOf(block)
    if (raw.trim() === '') return
    const { key, context } = contextOf(row, block, settled)
    const node: ReactNode | null = renderResolvedFenceNode(raw, key, context)
    // Null = no finished component yet (streaming half) or unrepairable:
    // the stock code block stays visible until something renders.
    if (node === null) return
    const container = document.createElement('div')
    container.className = CONTAINER_CLASS
    block.style.display = 'none'
    block.after(container)
    block.setAttribute(PROCESSED, '')
    const root = createRoot(container)
    const handler: GenuiActionHandler = (action, payload) => {
      const sid = sessionIdOf()
      if (sid === undefined) return
      sendAction(sid, action, payload)
    }
    root.render(<GenuiActionContext.Provider value={handler}>{node}</GenuiActionContext.Provider>)
    mounts.set(block, { root, container, block, lastRaw: raw, lastSettled: settled })
  }

  /** Pre-paint repair: the host's React re-renders during streaming can wipe
   * our foreign container or reset the hide. Re-apply the surgery in the
   * observer microtask (before paint) so raw JSON never flashes between
   * chunks; the rAF sweep re-renders React state at its own pace. */
  function repairSurgery(): void {
    for (const mount of mounts.values()) {
      const block = mount.block
      if (!block.isConnected) continue
      if (block.style.display !== 'none') block.style.display = 'none'
      if (!block.hasAttribute(PROCESSED)) block.setAttribute(PROCESSED, '')
      if (mount.container.parentElement !== block.parentElement
          || mount.container.previousElementSibling !== block) {
        block.after(mount.container)
      }
    }
  }

  /** Sweep: drop dead mounts, re-render changed bodies (streaming growth and
   * the streaming→settled transition), repair surgery, then take over every
   * new dsh-ui block — settled or still streaming. */
  function sweep(): void {
    for (const [block, mount] of mounts) {
      if (!block.isConnected) {
        unmountBlock(block)
        continue
      }
      const raw = rawOf(block)
      const settled = isSettled(block)
      // Settle transition label re-verification: a streaming block was taken
      // over by content, not by label. If the now-visible label exists and is
      // NOT dsh-ui (a ```json fence that happened to parse), restore the
      // stock block and drop the mount.
      if (settled && !mount.lastSettled) {
        const labelText = labelTextOf(block)
        if (labelText !== '' && labelText !== 'dsh-ui') {
          // A content-identified fence settled as another language (e.g. a
          // ```json block that happened to parse): restore the stock block.
          unmountBlock(block)
          continue
        }
      }
      if (mount.lastRaw !== raw || mount.lastSettled !== settled) {
        const row = rowOf(block)
        const anchor = row ?? block.parentElement ?? block
        const { key, context } = contextOf(anchor, block, settled)
        const node = renderResolvedFenceNode(raw, key, context)
        if (node === null) {
          unmountBlock(block)
          continue
        }
        mount.lastRaw = raw
        mount.lastSettled = settled
        mount.root.render(<GenuiActionContext.Provider value={(action, payload) => {
          const sid = sessionIdOf()
          if (sid !== undefined) sendAction(sid, action, payload)
        }}>{node}</GenuiActionContext.Provider>)
      }
    }
    repairSurgery()
    for (const block of Array.from(document.querySelectorAll<HTMLElement>(CODE_BLOCK))) {
      renderBlock(block)
    }
  }

  let scheduled = false
  const schedule = (): void => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      sweep()
    })
  }

  const observer = new MutationObserver(() => {
    // Pre-paint pass: surgery repair only (cheap DOM ops); the React
    // re-render goes through the rAF-scheduled sweep.
    repairSurgery()
    schedule()
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-streaming'],
    // React streams tokens as text-node updates: without characterData the
    // observer would only fire on structural changes and miss body growth.
    characterData: true,
  })
  const interval = window.setInterval(sweep, SWEEP_MS)
  sweep()

  return () => {
    observer.disconnect()
    window.clearInterval(interval)
    for (const block of Array.from(mounts.keys())) unmountBlock(block)
  }
}
