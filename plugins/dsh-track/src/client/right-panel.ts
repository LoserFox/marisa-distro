/**
 * Track right-side panel mounting — the lazyfish/side-panel pattern:
 * locate the conversation container, take over its grid as
 * `grid-template-columns: minmax(0,2fr) minmax(0,1fr)` (conversation 2/3 +
 * panel 1/3, draggable), and mount the Track panel at grid-column 2.
 * A floating toggle button (FAB) shows when the panel is closed.
 *
 * This is the right-side sidebar the user asked for — not a full-screen
 * overlay (which the previous implementation wrongly did).
 * @module @fakechris/dsh-track/client/right-panel
 */

import { conversationContextKey } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientContext, ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { Capture, Issue } from '../types.ts'

/** Stable ids for the injected panel and toggle. */
export const PANEL_ID = 'dsh-track-panel'
export const FAB_ID = 'dsh-track-fab'

const OPEN_KEY = 'dsh.track.open'
const WIDTH_KEY = 'dsh.track.width'

/**
 * ---- jump back to the source conversation ----
 * Each card's "↩ 对话" link opens the entry's source session in the left
 * conversation and scrolls to the user prompt that motivated it (when the
 * message id is known). Mechanics:
 *  - `ctx.sessions.open(id)` selects the session (public ISessions face).
 *  - `ctx.sessions.binding(id)?.session` is the `SessionFace`: its
 *    `getSnapshot()` exposes `chat.nodes` (node keys) and `hasMore`, and
 *    `loadOlder()` pages the history window backwards — so a jump reaches
 *    messages older than the initially loaded window.
 *  - Chat rows render with `data-chat-flow-key` = `conversationContextKey(
 *    'input-message', messageId)` (the exported runtime key format), which
 *    is how the row is located after the session opens.
 */

let clientCtx: ClientContext | null = null

/** Bounded "deep history" pages to walk before giving up on an old prompt. */
const MAX_PAGES = 40
const POLL_MS = 120
const TIMEOUT_MS = 10_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Poll `fn()` until truthy or the timeout elapses. */
async function pollUntil(fn: () => boolean, timeoutMs = TIMEOUT_MS): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true
    await sleep(POLL_MS)
  }
  return fn()
}

/** Poll `fn()` until it returns a defined value, or the timeout elapses. */
async function pollValue<T>(fn: () => T | undefined, timeoutMs = TIMEOUT_MS): Promise<T | undefined> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = fn()
    if (value !== undefined) return value
    await sleep(POLL_MS)
  }
  return fn()
}

/** Find a chat row by its stable flow key (dataset compare — no selector escaping). */
function findRowByKey(scroll: HTMLElement, key: string): HTMLElement | null {
  for (const el of scroll.querySelectorAll<HTMLElement>('[data-chat-flow-key]')) {
    if (el.dataset.chatFlowKey === key) return el
  }
  return null
}

/** Briefly flash a chat row so the jump target is obvious. */
function flashRow(el: HTMLElement): void {
  el.classList.add('inv-jump-flash')
  window.setTimeout(() => el.classList.remove('inv-jump-flash'), 2600)
}

/**
 * Open `sessionId` in the left conversation and scroll to `messageId`'s user
 * prompt row. Falls back to the first user message in the loaded window,
 * then to the bottom, when the message cannot be located.
 */
async function jumpToConversation(opts: { sessionId?: string; messageId?: string }): Promise<void> {
  const { sessionId, messageId } = opts
  if (!sessionId || clientCtx === null) return
  // Runtime face: the browser's `ctx.sessions` is the client SessionsService
  // (ISessions — the documented outward face). The host @deepseek-ai/dsh-session
  // package augments the same cordis Context with its own `sessions:
  // SessionStore`, which hijacks the property type — cast past that. cordis
  // also throws on undeclared-service property access, so 'sessions' is in
  // the plugin inject list AND the access is guarded here.
  let sessions: ISessions
  try {
    sessions = (clientCtx as unknown as { sessions: ISessions }).sessions
  } catch {
    return // sessions service unavailable — nothing to jump to
  }
  try {
    sessions.open(sessionId as SessionId)
  } catch {
    return // unknown session — nothing to jump to
  }
  // The scope/binding mints asynchronously after open(); poll for the face.
  const session = await pollValue(() => sessions.binding(sessionId as SessionId)?.session)
  if (session === undefined) return
  await pollUntil(() => session.getSnapshot().openState === 'open')
  const key = messageId !== undefined && messageId !== ''
    ? conversationContextKey('input-message', messageId)
    : undefined
  // Walk the history window backwards until the message is loaded.
  if (key !== undefined) {
    for (let i = 0; i < MAX_PAGES; i++) {
      const snap = session.getSnapshot()
      if (snap.chat.nodes.get(key) !== undefined) break
      if (!snap.hasMore) break
      await session.loadOlder().catch(() => { /* paging is best-effort */ })
      await pollUntil(() => !session.getSnapshot().loadingOlder)
    }
  }
  // Wait for React to render the target row, then scroll + flash.
  const scroll = document.querySelector<HTMLElement>('[data-conversation-scroll]')
  let row: HTMLElement | null = null
  if (key !== undefined && scroll !== null) {
    row = findRowByKey(scroll, key)
    if (row === null) {
      const start = Date.now()
      while (Date.now() - start < TIMEOUT_MS) {
        await sleep(POLL_MS)
        row = findRowByKey(scroll, key)
        if (row !== null) break
      }
    }
  }
  if (row !== null) {
    flashRow(row)
    jumpScrollIntoView(row)
    return
  }
  // Fallback: first user prompt row in the loaded window, else the bottom.
  // (Chat rows carry the *view* kind: 'user' | 'steering' | 'context'.)
  const first = scroll?.querySelector<HTMLElement>('[data-chat-flow-kind="user"]')
  if (first !== null && first !== undefined) {
    flashRow(first)
    jumpScrollIntoView(first)
    return
  }
  if (scroll !== null) scroll.scrollTop = scroll.scrollHeight
}

/**
 * Scroll the target row into view, re-applying a few times: a jump into a
 * RUNNING session fights the ChatView's bottom-follow (every streamed flow
 * update re-pins to the bottom while the reader is at the bottom). Re-applying
 * moves the viewport off the bottom, which flips the follow state off, so the
 * jump sticks. Instant (`auto`) scrolling is used — smooth over very long
 * distances stalls in Chrome. Re-applies are no-ops once the row is in view.
 */
function jumpScrollIntoView(row: HTMLElement): void {
  const apply = (): void => {
    row.scrollIntoView({ block: 'center', behavior: 'auto' })
  }
  apply()
  for (let i = 1; i <= 4; i++) {
    window.setTimeout(apply, i * 300)
  }
}

/** ---- data fetching (host HTTP API) ---- */

interface Snapshot {
  captures: Capture[]
  issues: Issue[]
}

const EMPTY: Snapshot = { captures: [], issues: [] }

async function fetchSnapshot(): Promise<Snapshot> {
  const [c, i] = await Promise.all([
    fetch('/api/track/captures').then((r) => r.json()).catch(() => ({ captures: [] })),
    fetch('/api/track/issues').then((r) => r.json()).catch(() => ({ issues: [] })),
  ])
  return {
    captures: c.captures ?? [],
    issues: i.issues ?? [],
  }
}

/** ---- panel HTML (plain DOM — the lazyfish pattern keeps it React-free) ---- */

function buildPanelHtml(): string {
  return `
  <div class="inv-head">
    <span class="inv-title">Track</span>
    <button class="inv-refresh" title="刷新">⟳</button>
    <button class="inv-close" title="收起">×</button>
  </div>
  <div class="inv-body">
    <div class="inv-section">
      <div class="inv-section-title">捕获想法</div>
      <div class="inv-input-row">
        <input class="inv-input" placeholder="记录一个念头…" />
        <button class="inv-capture" type="button">捕获</button>
      </div>
      <div class="inv-captures"></div>
      <div class="inv-pager"></div>
    </div>
    <div class="inv-section">
      <div class="inv-section-title">待确认 <span class="inv-pending-count"></span></div>
      <div class="inv-pending"></div>
    </div>
    <div class="inv-section">
      <div class="inv-section-title">任务 <span class="inv-issue-count"></span></div>
      <div class="inv-issues"></div>
      <div class="inv-issue-pager"></div>
    </div>
  </div>
  <div class="inv-width-resizer" title="拖动调整面板宽度"></div>
  `
}

const PANEL_CSS = `
#${FAB_ID} {
  position: fixed;
  right: 14px;
  bottom: 110px;
  z-index: 10000;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 12px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  background: var(--dsw-alias-bg-layer-2, #f7f7f8);
  color: var(--dsw-alias-label-primary, #171719);
  box-shadow: 0 4px 14px rgba(0,0,0,.2);
}
#${FAB_ID}[hidden] { display: none; }
.inv-host {
  display: grid !important;
  grid-template-rows: auto minmax(0, 1fr) !important;
}
.inv-host-header {
  grid-column: 1 / -1 !important;
  grid-row: 1 !important;
}
.inv-host-scroll {
  grid-column: 1 !important;
  grid-row: 2 !important;
  min-width: 0 !important;
  overflow-y: auto;
}
#${PANEL_ID} {
  position: relative;
  z-index: 1;
  grid-column: 2 !important;
  grid-row: 2 !important;
  min-width: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #171719);
  border-left: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1));
  font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
}
#${PANEL_ID}[hidden] { display: none; }
#${PANEL_ID} .inv-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 36px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.06));
  flex: none;
}
#${PANEL_ID} .inv-title { flex: 1; font-weight: 600; }
#${PANEL_ID} .inv-refresh, #${PANEL_ID} .inv-close {
  width: 24px; height: 24px; border: 0; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary, #555);
  font-size: 14px; cursor: pointer;
}
#${PANEL_ID} .inv-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
#${PANEL_ID} .inv-section { display: flex; flex-direction: column; gap: 6px; }
#${PANEL_ID} .inv-section-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  opacity: .65;
}
#${PANEL_ID} .inv-input-row { display: flex; gap: 6px; }
#${PANEL_ID} .inv-input {
  flex: 1; padding: 5px 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.15));
  border-radius: 6px; background: transparent; color: inherit; font-size: 13px;
}
#${PANEL_ID} .inv-capture {
  padding: 5px 10px; border: 0; border-radius: 6px;
  background: #4c8dff; color: #fff; font-size: 13px; cursor: pointer;
}
#${PANEL_ID} .inv-card {
  padding: 7px 9px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12));
  border-radius: 6px; font-size: 12.5px;
}
#${PANEL_ID} .inv-actions {
  display: flex; align-items: center; gap: 6px; margin-top: 5px; flex-wrap: wrap;
}
#${PANEL_ID} .inv-act {
  padding: 2px 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.15));
  border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary, #555);
  font-size: 11.5px; cursor: pointer;
}
#${PANEL_ID} .inv-act:hover { background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.05)); }
#${PANEL_ID} .inv-act.inv-jump {
  color: #2f6fd0; border-color: rgba(47,111,208,.35);
}
#${PANEL_ID} .inv-act.inv-jump:hover { background: rgba(47,111,208,.08); }
#${PANEL_ID} .inv-jump-flash {
  animation: inv-jump-flash 2.4s ease-out;
  border-radius: 8px;
}
@keyframes inv-jump-flash {
  0% { box-shadow: 0 0 0 3px rgba(76,141,255,.85); background: rgba(76,141,255,.16); }
  100% { box-shadow: 0 0 0 3px rgba(76,141,255,0); background: rgba(76,141,255,0); }
}
#${PANEL_ID} .inv-act.inv-danger {
  border-color: #e5484d; background: #e5484d; color: #fff;
}
#${PANEL_ID} .inv-act.inv-danger-ghost { border-color: rgba(229,72,77,.45); color: #e5484d; }
#${PANEL_ID} .inv-act.inv-danger-ghost:hover { background: rgba(229,72,77,.08); }
#${PANEL_ID} .inv-confirm-hint { font-size: 11.5px; color: #e5484d; }
#${PANEL_ID} .inv-pager {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  margin-top: 6px; min-height: 18px;
}
#${PANEL_ID} .inv-page {
  width: 22px; height: 22px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.15));
  border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary, #555);
  font-size: 13px; line-height: 1; cursor: pointer;
}
#${PANEL_ID} .inv-page:disabled { opacity: .35; cursor: default; }
#${PANEL_ID} .inv-page-info { font-size: 11px; opacity: .7; }
#${PANEL_ID} .inv-meta { font-size: 11px; opacity: .6; margin-top: 3px; }
#${PANEL_ID} .inv-issue-count { font-weight: 400; }
#${PANEL_ID} .inv-state-group {
  font-size: 11px; font-weight: 600; opacity: .55; text-transform: uppercase;
  margin: 8px 0 2px; letter-spacing: .03em;
}
#${PANEL_ID} .inv-state-group:first-child { margin-top: 0; }
#${PANEL_ID} .inv-issue-card { padding: 0; overflow: hidden; }
#${PANEL_ID} .inv-issue-header {
  display: flex; align-items: center; gap: 6px; padding: 7px 9px;
  cursor: pointer; user-select: none;
}
#${PANEL_ID} .inv-issue-header:hover { background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.04)); }
#${PANEL_ID} .inv-issue-id {
  flex: none; font-weight: 600; font-size: 11px; opacity: .7;
}
#${PANEL_ID} .inv-issue-title { flex: 1; min-width: 0; }
#${PANEL_ID} .inv-chevron { flex: none; opacity: .5; font-size: 10px; }
#${PANEL_ID} .inv-state {
  flex: none; padding: 1px 6px; border-radius: 999px; font-size: 10px;
  font-weight: 600; text-transform: uppercase; line-height: 16px;
}
#${PANEL_ID} .inv-state-todo { background: rgba(128,128,128,.18); color: inherit; }
#${PANEL_ID} .inv-state-in_progress { background: rgba(76,141,255,.2); color: #2f6fd0; }
#${PANEL_ID} .inv-state-done { background: rgba(46,160,67,.2); color: #1a7f37; }
#${PANEL_ID} .inv-state-canceled { background: rgba(229,72,77,.15); color: #c33; }
#${PANEL_ID} .inv-state-pending { background: rgba(255,165,0,.22); color: #b26a00; }
#${PANEL_ID} .inv-pending-card { border-color: rgba(255,165,0,.45); }
#${PANEL_ID} .inv-pending-reason {
  font-size: 11.5px; opacity: .75; padding: 0 9px 2px; white-space: pre-wrap; word-break: break-word;
}
#${PANEL_ID} .inv-act.inv-confirm {
  border-color: rgba(46,160,67,.5); background: rgba(46,160,67,.12); color: #1a7f37;
}
#${PANEL_ID} .inv-act.inv-confirm:hover { background: rgba(46,160,67,.2); }
#${PANEL_ID} .inv-issue-detail {
  border-top: 1px dashed var(--dsw-alias-border-l1, rgba(0,0,0,.1));
  padding: 6px 9px 2px; background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.02));
  display: flex; flex-direction: column; gap: 4px;
}
#${PANEL_ID} .inv-detail-row { display: flex; gap: 8px; font-size: 12px; }
#${PANEL_ID} .inv-detail-label {
  flex: none; width: 42px; font-size: 11px; opacity: .55;
  padding-top: 1px; text-transform: uppercase;
}
#${PANEL_ID} .inv-detail-text {
  white-space: pre-wrap; word-break: break-word; min-width: 0;
  max-height: 180px; overflow-y: auto;
}
#${PANEL_ID} .inv-issue-card .inv-actions { padding: 0 9px 7px; margin-top: 0; }
#${PANEL_ID} .inv-empty { opacity: .5; font-size: 12px; font-style: italic; }
#${PANEL_ID} .inv-width-resizer {
  position: absolute; left: -3px; top: 0; bottom: 0; width: 6px;
  cursor: col-resize; z-index: 2;
}
`

/** ---- mounting ---- */

interface HostRefs {
  candidate: HTMLElement
  header: HTMLElement | null
  /** The header's direct parent when the slot renderer wraps it in a div —
   *  must span both grid columns so the title/tabs keep full width. */
  headerWrapper: HTMLElement | null
  scrollBody: HTMLElement | null
  tablist: HTMLElement | null
}

let panel: HTMLElement | null = null
let fab: HTMLButtonElement | null = null
let host: HostRefs | null = null
let prior: {
  display?: string
  gridColumns?: string
  gridRows?: string
  flexDirection?: string
  headerColumn?: string
  headerRow?: string
  scrollColumn?: string
  scrollRow?: string
  scrollFlex?: string
  scrollMinWidth?: string
} = {}
let panelOpen = false
let panelWidthPx: number | null = null

function readStoredNumber(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch { return null }
}

function readOpenState(): boolean {
  try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false }
}

function syncGrid(): void {
  if (host === null || !panelOpen) return
  host.candidate.style.gridTemplateColumns = panelWidthPx !== null
    ? `minmax(0, 1fr) ${panelWidthPx}px`
    : 'minmax(0, 2fr) minmax(0, 1fr)'
}

function render(snapshot: Snapshot): void {
  if (panel === null) return
  const q = (sel: string): HTMLElement | null => panel!.querySelector(sel)
  // Pending confirmations first: issues where the machine proposed done/
  // canceled and the user still has to nod (lifecycle sweep, Part B2).
  const pendingEl = q('.inv-pending')
  if (pendingEl !== null) {
    const pending = snapshot.issues.filter((i) => i.pendingConfirm !== undefined)
    const pendingCount = q('.inv-pending-count')
    if (pendingCount !== null) pendingCount.textContent = pending.length > 0 ? `(${pending.length})` : ''
    pendingEl.innerHTML = pending.length === 0
      ? '<div class="inv-empty">无待确认变更</div>'
      : pending.map((i) => renderPendingCard(i)).join('')
  }
  // Newest first (user feedback 2026-08-12: the capture wall was showing
  // insertion order = oldest on top). createdAt desc, id tiebreak for stability.
  const openCaptures = snapshot.captures
    .filter((c) => c.status === 'open')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || (a.id < b.id ? 1 : -1))

  const capEl = q('.inv-captures')
  if (capEl !== null) {
    const totalPages = Math.max(1, Math.ceil(openCaptures.length / CAPTURES_PER_PAGE))
    if (capturePage >= totalPages) capturePage = totalPages - 1
    const pageCaps = openCaptures.slice(capturePage * CAPTURES_PER_PAGE, (capturePage + 1) * CAPTURES_PER_PAGE)
    capEl.innerHTML = pageCaps.length === 0
      ? '<div class="inv-empty">暂无捕获</div>'
      : pageCaps.map((c) => renderCaptureCard(c)).join('')
    const pager = q('.inv-pager')
    if (pager !== null) {
      pager.innerHTML = totalPages > 1
        ? `<button class="inv-page" data-page="${capturePage - 1}" ${capturePage === 0 ? 'disabled' : ''}>‹</button>` +
          `<span class="inv-page-info">${capturePage + 1}/${totalPages}</span>` +
          `<button class="inv-page" data-page="${capturePage + 1}" ${capturePage >= totalPages - 1 ? 'disabled' : ''}>›</button>`
        : ''
    }
  }
  const issEl = q('.inv-issues')
  const issCount = q('.inv-issue-count')
  if (issEl !== null) {
    if (issCount !== null) issCount.textContent = snapshot.issues.length > 0 ? `(${snapshot.issues.length})` : ''
    // Organize: in_progress first, then todo/done/canceled; newest updatedAt
    // within each group (user feedback 2026-08-11: reverse-chronological).
    // updatedAt ties are common (sync writes batches with same-second
    // timestamps), so break ties by createdAt desc — otherwise the stable sort
    // falls back to KV insertion order = oldest first (2026-08-12 feedback).
    const ordered = [...snapshot.issues].sort((a, b) => {
      const ga = STATE_ORDER[a.state] ?? 9
      const gb = STATE_ORDER[b.state] ?? 9
      if (ga !== gb) return ga - gb
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        || (a.id < b.id ? 1 : -1)
    })
    const totalPages = Math.max(1, Math.ceil(ordered.length / ISSUES_PER_PAGE))
    if (issuePage >= totalPages) issuePage = totalPages - 1
    const pageIssues = ordered.slice(issuePage * ISSUES_PER_PAGE, (issuePage + 1) * ISSUES_PER_PAGE)
    // Group header appears above the first visible card of each state.
    const cards: string[] = []
    let prevState: string | null = null
    for (const issue of pageIssues) {
      if (issue.state !== prevState) {
        cards.push(`<div class="inv-state-group">${STATE_LABEL[issue.state] ?? issue.state} (${snapshot.issues.filter((x) => x.state === issue.state).length})</div>`)
        prevState = issue.state
      }
      cards.push(renderIssueCard(issue))
    }
    issEl.innerHTML = pageIssues.length === 0
      ? '<div class="inv-empty">暂无任务</div>'
      : cards.join('')
    const pager = q('.inv-issue-pager')
    if (pager !== null) {
      pager.innerHTML = totalPages > 1
        ? `<button class="inv-page inv-issue-page" data-issue-page="${issuePage - 1}" ${issuePage === 0 ? 'disabled' : ''}>‹</button>` +
          `<span class="inv-page-info">${issuePage + 1}/${totalPages}</span>` +
          `<button class="inv-page inv-issue-page" data-issue-page="${issuePage + 1}" ${issuePage >= totalPages - 1 ? 'disabled' : ''}>›</button>`
        : ''
    }
  }
}

/** One pending-confirmation card: the machine proposed done/canceled/review; the
 *  user confirms (state commit) or dismisses (marker cleared, may re-propose).
 *  review = machine cannot tell done from abandoned — asks which way to go. */
function renderPendingCard(i: Issue): string {
  const pc = i.pendingConfirm!
  const isReview = pc.to === 'review'
  const toLabel = pc.to === 'done' ? '确认完成' : pc.to === 'canceled' ? '确认取消' : '确认完成'
  const why = pc.to === 'done' ? '证据显示已完成'
    : pc.to === 'canceled' ? '长期无进展'
    : '请人工判定状态'
  const reason = `${why}：${escapeHtml(pc.reason)} · ${new Date(pc.at).toLocaleString()}`
  const actions = isReview
    ? `<button class="inv-act inv-confirm" data-confirm="${i.id}" data-to="done">确认完成</button>` +
      `<button class="inv-act" data-confirm="${i.id}" data-to="canceled">确认取消</button>` +
      `<button class="inv-act" data-dismiss="${i.id}">还在做</button>`
    : `<button class="inv-act inv-confirm" data-confirm="${i.id}" data-to="${pc.to}">${toLabel}</button>` +
      `<button class="inv-act" data-dismiss="${i.id}">驳回</button>`
  return `<div class="inv-card inv-pending-card" data-id="${i.id}">` +
    `<div class="inv-issue-header"><span class="inv-issue-id">${escapeHtml(i.identifier)}</span>` +
    `<span class="inv-issue-title">${escapeHtml(i.title)}</span></div>` +
    `<div class="inv-pending-reason">${reason}</div>` +
    `<div class="inv-actions">${actions}</div></div>`
}

/** One capture card with delete (two-step confirm) + promote actions. */
function renderCaptureCard(c: Capture): string {
  const meta = `${c.tags.map(escapeHtml).join(' · ')}${c.tags.length ? ' · ' : ''}${new Date(c.createdAt).toLocaleString()}`
  const isConfirming = confirmCaptureDeleteId === c.id
  const jump = c.sourceSessionId
    ? `<button class="inv-act inv-jump" data-jump-session="${escapeHtml(c.sourceSessionId)}" data-jump-message="${escapeHtml(c.sourceMessageId ?? '')}" title="跳回对话中的这条 prompt">↩ 对话</button>`
    : ''
  const actions = isConfirming
    ? `<span class="inv-confirm-hint">确认删除？</span>` +
      `<button class="inv-act inv-danger" data-capture-del="${c.id}">确认</button>` +
      `<button class="inv-act" data-capture-cancel="1">取消</button>`
    : `${jump}<button class="inv-act" data-capture-promote="${c.id}" title="转为任务">转任务</button>` +
      `<button class="inv-act inv-danger-ghost" data-capture-del-ask="${c.id}">删除</button>`
  return `<div class="inv-card">${escapeHtml(c.content)}<div class="inv-meta">${meta}</div><div class="inv-actions">${actions}</div></div>`
}

/** One issue card: header row (badge + title + expand) + optional detail body. */
function renderIssueCard(i: Issue): string {
  const expanded = expandedIssueId === i.id
  const isConfirming = confirmIssueDeleteId === i.id
  const sessionId = i.attachSessionId ?? i.linkedSessionIds[0]
  const jump = sessionId
    ? `<button class="inv-act inv-jump" data-jump-session="${escapeHtml(sessionId)}" data-jump-message="${escapeHtml(i.promptMessageId ?? '')}" title="跳回对话中的这条 prompt">↩ 对话</button>`
    : ''
  const actions = isConfirming
    ? `<span class="inv-confirm-hint">确认删除任务？</span>` +
      `<button class="inv-act inv-danger" data-issue-del="${i.id}">确认</button>` +
      `<button class="inv-act" data-issue-cancel="1">取消</button>`
    : `${jump}<button class="inv-act" data-issue-del-ask="${i.id}">删除</button>`
  const detail = expanded
    ? `<div class="inv-issue-detail">${renderIssueDetail(i)}</div>`
    : ''
  return (
    `<div class="inv-card inv-issue-card${expanded ? ' inv-expanded' : ''}" data-id="${i.id}">` +
      `<div class="inv-issue-header" data-issue-toggle="${i.id}">` +
        `<span class="inv-issue-id">${escapeHtml(i.identifier)}</span>` +
        `<span class="inv-state inv-state-${i.state}">${i.state}</span>` +
        `${i.pendingConfirm ? `<span class="inv-state inv-state-pending">待确认</span>` : ''}` +
        `<span class="inv-issue-title">${escapeHtml(i.title)}</span>` +
        `<span class="inv-chevron">${expanded ? '▾' : '▸'}</span>` +
      `</div>` +
      detail +
      `<div class="inv-actions">${actions}</div>` +
    `</div>`
  )
}

/** Full detail body for one issue (shown when expanded). */
function renderIssueDetail(i: Issue): string {
  const parts: string[] = []
  if (i.description) {
    parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">描述</span><div class="inv-detail-text">${escapeHtml(i.description)}</div></div>`)
  }
  if (i.acceptanceCriteria) {
    parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">验收</span><div class="inv-detail-text">${escapeHtml(i.acceptanceCriteria)}</div></div>`)
  }
  parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">优先级</span><span>${PRIORITY_LABEL[i.priority] ?? String(i.priority)}</span></div>`)
  if (i.labels.length > 0) {
    parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">标签</span><span>${i.labels.map(escapeHtml).join(', ')}</span></div>`)
  }
  if (i.assignee) {
    parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">负责人</span><span>${escapeHtml(i.assignee)}</span></div>`)
  }
  if (i.parentId) {
    parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">父任务</span><span>${escapeHtml(i.parentId)}</span></div>`)
  }
  parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">创建</span><span>${new Date(i.createdAt).toLocaleString()}</span></div>`)
  parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">更新</span><span>${new Date(i.updatedAt).toLocaleString()}</span></div>`)
  if (i.linkedSessionIds.length > 0) {
    parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">会话</span><span>${i.linkedSessionIds.map(escapeHtml).join(', ')}</span></div>`)
  }
  return parts.join('')
}

const CAPTURES_PER_PAGE = 8
const ISSUES_PER_PAGE = 8
const PRIORITY_LABEL: Record<number, string> = { 0: 'urgent', 1: 'high', 2: 'medium', 3: 'low', 4: 'none' }
/** Issue group order: active work first, then backlog, then finished. */
const STATE_ORDER: Record<string, number> = { in_progress: 0, todo: 1, done: 2, canceled: 3 }
/** Issue group display labels (zh, matching the panel language). */
const STATE_LABEL: Record<string, string> = { in_progress: '进行中', todo: '待办', done: '已完成', canceled: '已取消' }
let capturePage = 0
let issuePage = 0
let expandedIssueId: string | null = null
let confirmCaptureDeleteId: string | null = null
let confirmIssueDeleteId: string | null = null

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

function refresh(): void {
  void fetchSnapshot().then(render)
}

function restoreLayout(): void {
  trackTab?.remove()
  trackTab = null
  if (host === null) return
  host.candidate.classList.remove('inv-host')
  if (host.header !== null) host.header.classList.remove('inv-host-header')
  if (host.headerWrapper !== null) host.headerWrapper.classList.remove('inv-host-header')
  if (host.scrollBody !== null) host.scrollBody.classList.remove('inv-host-scroll')
  if (prior.display !== undefined) host.candidate.style.display = prior.display
  if (prior.gridColumns !== undefined) host.candidate.style.gridTemplateColumns = prior.gridColumns
  if (prior.gridRows !== undefined) host.candidate.style.gridTemplateRows = prior.gridRows
}

function setPanelOpen(open: boolean): void {
  panelOpen = open
  if (panel !== null) panel.hidden = !open
  if (fab !== null) fab.hidden = open
  if (trackTab !== null) trackTab.setAttribute('aria-selected', String(!open))
  try { localStorage.setItem(OPEN_KEY, open ? '1' : '0') } catch { /* ignore */ }
  if (open) syncGrid()
  else if (host !== null) restoreLayout()
}

/** Programmatic entry for the composer-dock strip: ensure the host is
 *  mounted (fresh pages may not have attached yet) and open the panel. */
export function openTrackPanel(): void {
  if (host === null) tryMount()
  setPanelOpen(true)
}

function attach(candidate: HTMLElement, header: HTMLElement | null, tablist: HTMLElement | null): void {
  if (host?.candidate === candidate) return
  restoreLayout()
  const scrollBody = candidate.querySelector<HTMLElement>('[data-conversation-scroll]')
  const headerWrapper = header !== null && header.parentElement !== candidate
    ? header.parentElement
    : null
  host = { candidate, header, headerWrapper, scrollBody, tablist }
  prior = {
    display: candidate.style.display,
    gridColumns: candidate.style.gridTemplateColumns,
    gridRows: candidate.style.gridTemplateRows,
    flexDirection: candidate.style.flexDirection,
    headerColumn: header?.style.gridColumn,
    headerRow: header?.style.gridRow,
    scrollColumn: scrollBody?.style.gridColumn,
    scrollRow: scrollBody?.style.gridRow,
    scrollFlex: scrollBody?.style.flex,
    scrollMinWidth: scrollBody?.style.minWidth,
  }
  // Grid takeover: mark the conversation root with a class; the injected
  // stylesheet forces the grid with !important so React re-renders cannot
  // reset the inline display (verified: React clears inline display but the
  // columns survive — class-based !important wins over both).
  candidate.classList.add('inv-host')
  candidate.style.gridTemplateColumns = 'minmax(0, 2fr) minmax(0, 1fr)'
  if (header !== null) header.classList.add('inv-host-header')
  // The header may sit inside a slot wrapper div (formal-release layout):
  // the wrapper is the root's grid item, so IT must span both columns —
  // the header's own grid placement only applies inside the wrapper.
  if (headerWrapper !== null) headerWrapper.classList.add('inv-host-header')
  if (scrollBody !== null) scrollBody.classList.add('inv-host-scroll')
  if (panel !== null) {
    if (panel.isConnected) panel.remove()
    candidate.append(panel)
  }
  // side-panel pattern: append an "Track" tab to the session tab strip so
  // the panel has a native tab entry (like Trajectory / goal tabs).
  mountTab()
  syncGrid()
}

let trackTab: HTMLButtonElement | null = null

/** Append an Track tab to the conversation tab strip (side-panel pattern). */
function mountTab(): void {
  if (host === null) return
  // The session tab strip may render after the first attach (blank session →
  // active, or React removed our injected tab on a re-render): resolve the
  // live strip from the candidate instead of trusting the stale ref.
  let tl = host.tablist
  if (tl === null || !tl.isConnected) {
    tl = host.candidate.querySelector<HTMLElement>('[role="tablist"]')
    if (tl !== null) host.tablist = tl
  }
  if (tl === null || tl === undefined) return
  if (tl.querySelector('.inv-tab') !== null) return
  const reference = tl.querySelector<HTMLButtonElement>(':scope > button[role="tab"][aria-selected="false"]')
    ?? tl.querySelector<HTMLButtonElement>(':scope > button[role="tab"]')
  if (reference === null) return
  const tab = document.createElement('button')
  tab.type = 'button'
  tab.role = 'tab'
  tab.className = `${reference.className} inv-tab`
  const label = document.createElement('span')
  label.textContent = 'Track'
  tab.append(label)
  tab.setAttribute('aria-selected', String(!panelOpen))
  tab.addEventListener('click', () => { setPanelOpen(!panelOpen) })
  tl.append(tab)
  trackTab = tab
}

/**
 * Resolve the conversation root hosting the session tab strip.
 *
 * The side-panel pattern: find the tablist that contains the session tabs
 * (Trajectory / 轨迹), climb to its header, then take over the CONVERSATION
 * ROOT — the ancestor that actually contains `[data-conversation-scroll]`.
 * Older DSH: `header.parentElement` IS the root. The formal release wraps
 * the `conversation.session.header` slot in a header-only div, so
 * `header.parentElement` is a 76px wrapper with no scroll body — taking it
 * over put the panel in a 0px grid row (the 2026-08-13 "click Track does
 * nothing" bug). Climbing to the scroll-body ancestor fixes it.
 */
function locateHost(): HostRefs | null {
  const sessionTablist = [...document.querySelectorAll<HTMLElement>('[role="tablist"]')]
    .find((tl) => [...tl.querySelectorAll<HTMLElement>(':scope > button[role="tab"]')]
      .some((tab) => {
        const text = tab.textContent?.trim()
        return text === 'Trajectory' || text === '轨迹'
      }))
  const tablists = document.querySelectorAll<HTMLElement>('[role="tablist"]')
  // Preferred: the session tab strip; fallback: any tablist (multi-tab).
  const tablist = sessionTablist ?? tablists[0] ?? null
  if (tablist !== null) {
    const header = tablist.closest('header')
    if (header instanceof HTMLElement && header.parentElement instanceof HTMLElement) {
      // Climb from the header's parent until the candidate contains the
      // conversation scroll body (bounded — never past the app shell).
      let candidate: HTMLElement | null = header.parentElement
      for (let depth = 0; candidate !== null && depth < 6; depth++) {
        const scrollBody = candidate.querySelector<HTMLElement>('[data-conversation-scroll]')
        if (scrollBody !== null) {
          return { candidate, header, headerWrapper: header.parentElement !== candidate ? header.parentElement : null, scrollBody, tablist }
        }
        candidate = candidate.parentElement
      }
      // Legacy fallback: the header's parent as-is.
      return { candidate: header.parentElement, header, headerWrapper: null, scrollBody: header.parentElement.querySelector<HTMLElement>('[data-conversation-scroll]'), tablist }
    }
  }
  // Fallback: the scroll body's parent (single-tab sessions have no tablist).
  const scroll = document.querySelector<HTMLElement>('[data-conversation-scroll]')
  if (scroll instanceof HTMLElement && scroll.parentElement instanceof HTMLElement) {
    const root = scroll.parentElement
    const header = root.querySelector<HTMLElement>('header')
    return { candidate: root, header, headerWrapper: null, scrollBody: scroll, tablist: root.querySelector<HTMLElement>('[role="tablist"]') }
  }
  return null
}

function tryMount(): void {
  if (host !== null && host.candidate.isConnected) {
    // Self-heal: React re-renders reset inline styles AND remove the
    // imperatively-injected tab from the tablist; re-apply everything on
    // every DOM change (lazyfish attach pattern).
    if (panel !== null && panel.parentElement !== host.candidate) host.candidate.append(panel)
    // The session tab strip may render AFTER the first attach (blank session
    // → active): re-resolve it so mountTab always targets the live strip.
    const liveTablist = host.candidate.querySelector<HTMLElement>('[role="tablist"]')
    if (liveTablist !== null) host.tablist = liveTablist
    host.candidate.classList.add('inv-host')
    if (host.header !== null) host.header.classList.add('inv-host-header')
    if (host.headerWrapper !== null) host.headerWrapper.classList.add('inv-host-header')
    if (host.scrollBody !== null) host.scrollBody.classList.add('inv-host-scroll')
    mountTab()
    syncGrid()
    return
  }
  restoreLayout()
  host = null
  const h = locateHost()
  if (h !== null) {
    attach(h.candidate, h.header, h.tablist)
    setPanelOpen(readOpenState())
  }
}

/** Build the panel DOM, FAB, and wire events. Returns a disposer.
 *  @param ctx - client root context (needed for the jump-back links:
 *  `ctx.sessions.open` / `binding` resolve the source conversation). */
export function mountRightPanel(ctx: ClientContext): () => void {
  clientCtx = ctx
  // ---- style ----
  const style = document.createElement('style')
  style.textContent = PANEL_CSS
  document.head.appendChild(style)

  // ---- panel ----
  panel = document.createElement('aside')
  panel.id = PANEL_ID
  panel.hidden = true
  panel.innerHTML = buildPanelHtml()

  // ---- fab ----
  fab = document.createElement('button')
  fab.id = FAB_ID
  fab.type = 'button'
  fab.title = 'Track'
  fab.textContent = '◆'
  fab.hidden = false
  document.body.appendChild(fab)

  // ---- panel events ----
  panel.querySelector('.inv-close')?.addEventListener('click', () => setPanelOpen(false))
  panel.querySelector('.inv-refresh')?.addEventListener('click', refresh)
  const captureBtn = panel.querySelector<HTMLElement>('.inv-capture')
  const inputEl = panel.querySelector<HTMLInputElement>('.inv-input')
  const doCapture = (): void => {
    const content = inputEl?.value.trim()
    if (!content) return
    void fetch('/api/track/captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, tags: [] }),
    }).then(() => { if (inputEl) inputEl.value = ''; refresh() })
  }
  captureBtn?.addEventListener('click', doCapture)
  inputEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCapture() })

  // ---- capture/issue card actions (event delegation: cards are re-rendered) ----
  const onAction = (e: Event): void => {
    if (panel === null) return
    const target = e.target as HTMLElement
    // Issue pager buttons first — they also carry .inv-page for shared styling,
    // so they must be checked before the capture pager branch.
    const issuePageBtn = target.closest<HTMLElement>('.inv-issue-page')
    if (issuePageBtn !== null && !(issuePageBtn as HTMLButtonElement).disabled) {
      const page = Number(issuePageBtn.dataset.issuePage)
      if (Number.isInteger(page) && page >= 0) {
        issuePage = page
        expandedIssueId = null
        refresh()
      }
      return
    }
    const pageBtn = target.closest<HTMLElement>('.inv-page')
    if (pageBtn !== null && !(pageBtn as HTMLButtonElement).disabled) {
      const page = Number(pageBtn.dataset.page)
      if (Number.isInteger(page) && page >= 0) {
        capturePage = page
        refresh()
      }
      return
    }
    const toggle = target.closest<HTMLElement>('[data-issue-toggle]')
    if (toggle !== null) {
      const id = toggle.getAttribute('data-issue-toggle')
      if (id) {
        expandedIssueId = expandedIssueId === id ? null : id
        refresh()
      }
      return
    }
    // Jump back to the source conversation (left column) at the prompt.
    const jump = target.closest<HTMLElement>('[data-jump-session]')
    if (jump !== null) {
      void jumpToConversation({
        sessionId: jump.getAttribute('data-jump-session') ?? undefined,
        messageId: jump.getAttribute('data-jump-message') || undefined,
      })
      return
    }
    const delAsk = target.closest<HTMLElement>('[data-capture-del-ask]')
    if (delAsk !== null) {
      confirmCaptureDeleteId = delAsk.getAttribute('data-capture-del-ask')
      refresh()
      return
    }
    const delYes = target.closest<HTMLElement>('[data-capture-del]')
    if (delYes !== null) {
      const id = delYes.getAttribute('data-capture-del')
      confirmCaptureDeleteId = null
      if (id) {
        void fetch(`/api/track/captures/${encodeURIComponent(id)}`, { method: 'DELETE' })
          .then(refresh)
      } else {
        refresh()
      }
      return
    }
    const promote = target.closest<HTMLElement>('[data-capture-promote]')
    if (promote !== null) {
      const id = promote.getAttribute('data-capture-promote')
      if (id) {
        void fetch(`/api/track/captures/${encodeURIComponent(id)}/promote`, { method: 'POST' })
          .then(refresh)
      }
      return
    }
    // Pending-confirmation actions: confirm a proposed done/canceled, or
    // dismiss the proposal (marker cleared; the sweep may re-propose).
    const confirmBtn = target.closest<HTMLElement>('[data-confirm]')
    if (confirmBtn !== null) {
      const id = confirmBtn.getAttribute('data-confirm')
      const to = confirmBtn.getAttribute('data-to')
      if (id && (to === 'done' || to === 'canceled')) {
        void fetch(`/api/track/issues/${encodeURIComponent(id)}/confirm`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ to }),
        }).then(refresh)
      }
      return
    }
    const dismissBtn = target.closest<HTMLElement>('[data-dismiss]')
    if (dismissBtn !== null) {
      const id = dismissBtn.getAttribute('data-dismiss')
      if (id) {
        void fetch(`/api/track/issues/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }).then(refresh)
      }
      return
    }
    const issueDelAsk = target.closest<HTMLElement>('[data-issue-del-ask]')
    if (issueDelAsk !== null) {
      confirmIssueDeleteId = issueDelAsk.getAttribute('data-issue-del-ask')
      refresh()
      return
    }
    const issueDelYes = target.closest<HTMLElement>('[data-issue-del]')
    if (issueDelYes !== null) {
      const id = issueDelYes.getAttribute('data-issue-del')
      confirmIssueDeleteId = null
      if (id) {
        void fetch(`/api/track/issues/${encodeURIComponent(id)}`, { method: 'DELETE' })
          .then(refresh)
      } else {
        refresh()
      }
      return
    }
    // Cancel: any cancel button clears both confirm states.
    if (target.closest('[data-capture-cancel], [data-issue-cancel]') !== null) {
      confirmCaptureDeleteId = null
      confirmIssueDeleteId = null
      refresh()
    }
  }
  panel.addEventListener('click', onAction)

  // ---- width resizer ----
  const resizer = panel.querySelector<HTMLElement>('.inv-width-resizer')
  let dragStartX = 0
  let dragStartWidth = 0
  const widthMove = (e: PointerEvent): void => {
    const w = dragStartWidth + dragStartX - e.clientX
    if (w < 220) return
    panelWidthPx = w
    syncGrid()
  }
  const widthUp = (): void => {
    window.removeEventListener('pointermove', widthMove)
    window.removeEventListener('pointerup', widthUp)
    if (panelWidthPx !== null) {
      try { localStorage.setItem(WIDTH_KEY, String(panelWidthPx)) } catch { /* ignore */ }
    }
  }
  resizer?.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault()
    dragStartX = e.clientX
    dragStartWidth = panelWidthPx ?? 360
    window.addEventListener('pointermove', widthMove)
    window.addEventListener('pointerup', widthUp)
  })

  // ---- fab toggle ----
  fab.addEventListener('click', () => { setPanelOpen(!panelOpen) })

  // ---- self-healing mount ----
  panelWidthPx = readStoredNumber(WIDTH_KEY)
  const observer = new MutationObserver(tryMount)
  observer.observe(document.body, { childList: true, subtree: true })
  tryMount()
  refresh()
  // Late-render retries: the session tab strip (and sometimes the whole
  // conversation root) renders after the first attach; re-run the mount so
  // the Track tab appears once the strip exists. (MutationObserver only
  // fires on changes — a settled page never re-triggers it.)
  const mountRetries = [500, 1500, 3000].map((ms) => window.setTimeout(tryMount, ms))

  // ---- light auto-refresh: silently re-poll captures/tasks so new items
  // appear without manual ⟳. Two small GETs every 20s; skipped while the
  // panel is closed. (2026-08-11: user observed the wall never updating.)
  // tryMount() also runs here so a tab React removed on a re-render is
  // re-injected within one tick.
  const autoRefresh = window.setInterval(() => {
    tryMount()
    if (panelOpen && !document.hidden) refresh()
  }, 20000)
  const onFocus = (): void => { tryMount(); refresh() }
  window.addEventListener('focus', onFocus)

  return () => {
    observer.disconnect()
    mountRetries.forEach((id) => window.clearTimeout(id))
    window.clearInterval(autoRefresh)
    window.removeEventListener('focus', onFocus)
    restoreLayout()
    panel?.remove()
    fab?.remove()
    style.remove()
    panel = null
    fab = null
    host = null
    clientCtx = null
  }
}
