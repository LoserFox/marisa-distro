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
import { mountCalendar, type CalData, type CalJump } from './calendar-yarn.tsx'

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
export async function jumpToConversation(opts: { sessionId?: string; messageId?: string }): Promise<void> {
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
  /** GET /issues annotates each issue with its best commit evidence (P0/P4). */
  issues: Array<Issue & { commitEvidence?: { best?: string; confidence?: number; count: number; limitations?: string[] } | null }>
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
    <button class="inv-settings" title="设置">⚙</button>
    <button class="inv-close" title="收起">×</button>
  </div>
  <div class="inv-body">
    <div class="inv-settings-panel" hidden>
      <div class="inv-section-title">自动维护设置</div>
      <label class="inv-set-row">取消确认宽限（天，0=不自动取消）
        <input class="inv-set" data-set="autoCancelPendingDays" type="number" min="0" step="1"/></label>
      <label class="inv-set-row">定时 sync 间隔（天，0=关闭）
        <input class="inv-set" data-set="syncIntervalDays" type="number" min="0" step="1"/></label>
      <label class="inv-set-row">每次 sync 会话上限
        <input class="inv-set" data-set="syncMaxSessions" type="number" min="1" step="1"/></label>
      <label class="inv-set-row">sync 引擎
        <select class="inv-set" data-set="syncEngine"><option value="v1">v1（零 LLM）</option><option value="v2">v2（LLM）</option></select></label>
      <label class="inv-set-row">重复归并相似度阈值（0-1）
        <input class="inv-set" data-set="nearDupThreshold" type="number" min="0" max="1" step="0.05"/></label>
      <div class="inv-actions"><button class="inv-act inv-save-config">保存</button></div>
    </div>
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
      <div class="inv-section-title">任务 <span class="inv-issue-count"></span>
        <button class="inv-act inv-batch-toggle" data-batch-toggle title="批量标记完成/取消">批量</button>
      </div>
      <div class="inv-batch-bar" data-batch-bar hidden>
        <span class="inv-batch-info">已选 <span data-batch-count>0</span></span>
        <button class="inv-act inv-confirm" data-batch-done>完成</button>
        <button class="inv-act" data-batch-cancel>取消</button>
        <button class="inv-act" data-batch-clear>清空</button>
      </div>
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
#${PANEL_ID} .inv-settings {
  width: 24px; height: 24px; border: 0; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary, #555);
  font-size: 14px; cursor: pointer;
}
#${PANEL_ID} .inv-settings-panel {
  display: flex; flex-direction: column; gap: 6px; padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12)); border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.02));
}
#${PANEL_ID} .inv-settings-panel[hidden] { display: none; }
#${PANEL_ID} .inv-set-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: 11.5px; opacity: .85;
}
#${PANEL_ID} .inv-set {
  width: 90px; padding: 3px 6px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.15));
  border-radius: 5px; background: transparent; color: inherit; font-size: 12px;
}
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
#${PANEL_ID} .inv-page-input {
  width: 30px; height: 22px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.15));
  border-radius: 5px; background: transparent; color: inherit; font-size: 12px;
  text-align: center; padding: 0;
}
#${PANEL_ID} .inv-page-input:focus { outline: 1px solid #4c8dff; }
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
#${PANEL_ID} .inv-batch-toggle { margin-left: auto; padding: 1px 7px; font-size: 11px; }
#${PANEL_ID} .inv-batch-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 8px; border: 1px dashed var(--dsw-alias-border-l2, rgba(0,0,0,.2));
  border-radius: 6px; background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.03));
  font-size: 11.5px;
}
#${PANEL_ID} .inv-batch-bar[hidden] { display: none; }
#${PANEL_ID} .inv-batch-info { flex: 1; opacity: .75; }
#${PANEL_ID} .inv-sel {
  flex: none; width: 14px; height: 14px; margin: 0 6px 0 0; accent-color: #4c8dff;
  cursor: pointer; vertical-align: -2px;
}
#${PANEL_ID} .inv-act.inv-done { color: #1a7f37; border-color: rgba(46,160,67,.4); }
#${PANEL_ID} .inv-act.inv-done:hover { background: rgba(46,160,67,.1); }
#${PANEL_ID} .inv-commit-badge { font-size: 10px; padding: 0 5px; border-radius: 8px; border: 1px solid rgba(210,153,34,.5); color: #b8860b; white-space: nowrap; }
#${PANEL_ID} .inv-commit-badge.inv-commit-missing { border-color: rgba(190,60,40,.5); color: #be3c28; }
#${PANEL_ID} .inv-empty { opacity: .5; font-size: 12px; font-style: italic; }
#${PANEL_ID} .inv-lineage { border-top: 1px dashed var(--dsw-alias-border-l1, rgba(0,0,0,.1)); padding: 6px 9px; display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
#${PANEL_ID} .inv-lineage[hidden] { display: none; }
#${PANEL_ID} .inv-lg-title { font-weight: 600; margin-bottom: 2px; }
#${PANEL_ID} .inv-lg-group { font-size: 10.5px; font-weight: 600; text-transform: uppercase; opacity: .55; margin-top: 5px; }
#${PANEL_ID} .inv-lg-row { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${PANEL_ID} .inv-lg-msg { padding-left: 12px; color: var(--dsw-alias-label-secondary, #555); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${PANEL_ID} .inv-lg-ev-strong { font-size: 10px; color: #1a7f37; border: 1px solid rgba(26,127,55,.4); border-radius: 8px; padding: 0 4px; }
#${PANEL_ID} .inv-lg-ev-weak { font-size: 10px; color: #b8860b; border: 1px dashed rgba(210,153,34,.5); border-radius: 8px; padding: 0 4px; }
#${PANEL_ID} .inv-related { border-top: 1px dashed var(--dsw-alias-border-l1, rgba(0,0,0,.1)); padding: 6px 10px; font-size: 12px; }
#${PANEL_ID} .gv-svg { display: block; }
#${PANEL_ID} .gv-edge { stroke: rgba(0,0,0,.15); stroke-width: 1; }
#${PANEL_ID} .gv-executed-in { stroke: rgba(26,127,55,.35); }
#${PANEL_ID} .gv-landed-in { stroke: rgba(138,143,152,.5); stroke-dasharray: 3 2; }
#${PANEL_ID} .gv-implements { stroke: rgba(26,127,55,.6); }
#${PANEL_ID} .gv-forked-from { stroke: rgba(76,141,255,.5); }
#${PANEL_ID} .gv-raised-in { stroke: rgba(232,133,60,.4); }
/* P1 evidence strength on landed-in / implements edges — weak evidence is
   never rendered like strong evidence. Legacy links (no evidenceKind) fall
   back to the candidate style. */
#${PANEL_ID} .gv-ev-declared { stroke: rgba(26,127,55,.95); stroke-width: 1.7; stroke-dasharray: none; }
#${PANEL_ID} .gv-ev-observed { stroke: rgba(46,160,67,.8); stroke-width: 1.4; stroke-dasharray: none; }
#${PANEL_ID} .gv-ev-candidate { stroke: rgba(210,153,34,.85); stroke-width: 1.2; stroke-dasharray: 3 2; }
#${PANEL_ID} .gv-ev-unmapped { stroke: rgba(138,143,152,.7); stroke-width: 1; stroke-dasharray: 1 3; }
#${PANEL_ID} .gv-ev-sample { width: 14px !important; height: 0 !important; border-radius: 0 !important; border-top: 2px solid; }
#${PANEL_ID} .gv-ev-sample.gv-ev-declared { border-color: rgba(26,127,55,.95); }
#${PANEL_ID} .gv-ev-sample.gv-ev-candidate { border-color: rgba(210,153,34,.85); border-top-style: dashed; }
#${PANEL_ID} .gv-node { cursor: default; }
#${PANEL_ID} .gv-node.gv-click { cursor: pointer; }
#${PANEL_ID} .gv-node.gv-click:hover circle { stroke: #333; stroke-width: 2; }
#${PANEL_ID} .gv-label { font-size: 10px; fill: var(--dsw-alias-label-secondary, #555); }
#${PANEL_ID} .gv-legend-bar { display: flex; gap: 12px; flex-wrap: wrap; padding: 6px 10px; font-size: 11px; opacity: .7; }
#${PANEL_ID} .gv-legend { display: inline-flex; align-items: center; gap: 4px; }
#${PANEL_ID} .gv-legend i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
#${PANEL_ID} .gv-hint { position: absolute; top: 40px; right: 14px; font-size: 11px; opacity: .5; }
#${PANEL_ID} .inv-graph { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
#${PANEL_ID} .inv-groot { padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); border-radius: 6px; font-weight: 600; }
#${PANEL_ID} .inv-gmeta { font-size: 10.5px; opacity: .6; font-weight: 400; }
#${PANEL_ID} .inv-gturn { margin: 2px 0 0 6px; padding-left: 8px; border-left: 2px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12)); }
#${PANEL_ID} .inv-gturn summary { cursor: pointer; padding: 2px 0; opacity: .9; }
#${PANEL_ID} .inv-gnode { padding: 1px 0 1px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${PANEL_ID} .inv-gtool { padding: 1px 0 1px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${PANEL_ID} .inv-gtool.inv-gerr { color: #e5484d; }
#${PANEL_ID} .inv-gseq { opacity: .45; font-size: 10.5px; margin-left: 4px; }
#${PANEL_ID} .inv-guser { padding: 1px 0 1px 10px; display: flex; gap: 6px; align-items: baseline; }
#${PANEL_ID} .inv-guser-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
#${PANEL_ID} .inv-gfork { margin-left: 8px; }
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

/**
 * Pager controls: first («) / prev (‹) / direct page-number input / next (›) /
 * last (»). `kind` selects the data-attr family the delegation handlers read.
 */
function renderPager(page: number, totalPages: number, kind: 'capture' | 'issue'): string {
  const d = kind === 'capture' ? 'data-page' : 'data-issue-page'
  const cls = kind === 'capture' ? 'inv-page' : 'inv-page inv-issue-page'
  const input = kind === 'capture' ? 'data-page-input="capture"' : 'data-page-input="issue"'
  if (totalPages <= 1) return ''
  return (
    `<button class="${cls}" ${d}="0" ${page === 0 ? 'disabled' : ''} title="第一页">«</button>` +
    `<button class="${cls}" ${d}="${page - 1}" ${page === 0 ? 'disabled' : ''} title="上一页">‹</button>` +
    `<input class="inv-page-input" ${input} value="${page + 1}" inputmode="numeric" title="跳到第几页（回车）">` +
    `<span class="inv-page-info">/ ${totalPages}</span>` +
    `<button class="${cls}" ${d}="${page + 1}" ${page >= totalPages - 1 ? 'disabled' : ''} title="下一页">›</button>` +
    `<button class="${cls}" ${d}="${totalPages - 1}" ${page >= totalPages - 1 ? 'disabled' : ''} title="最后一页">»</button>`
  )
}

/** The pager currently being paged — its viewport position anchors the scroll
 *  across the re-render so clicking a page button no longer makes the panel
 *  jump (user feedback 2026-08-14: "点翻页之后页面晃，找不到按钮了"). */
let pagerAnchorTarget: 'captures' | 'issues' | null = null

/** Viewport-relative top of one pager inside the panel body scrollport. */
function pagerRelTop(body: HTMLElement, target: 'captures' | 'issues'): number | null {
  const pager = body.querySelector<HTMLElement>(target === 'captures' ? '.inv-pager' : '.inv-issue-pager')
  if (pager === null) return null
  return pager.getBoundingClientRect().top - body.getBoundingClientRect().top
}

function render(snapshot: Snapshot): void {
  if (panel === null) return
  const q = (sel: string): HTMLElement | null => panel!.querySelector(sel)
  // Scroll anchor: record the paged pager's viewport position before the
  // re-render, restore it after (list heights change on page switch).
  const body = q('.inv-body')
  const anchor = body !== null && pagerAnchorTarget !== null
    ? { target: pagerAnchorTarget, relTop: pagerRelTop(body, pagerAnchorTarget) }
    : null
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
      pager.innerHTML = renderPager(capturePage, totalPages, 'capture')
    }
  }
  const issEl = q('.inv-issues')
  const issCount = q('.inv-issue-count')
  if (issEl !== null) {
    if (issCount !== null) issCount.textContent = snapshot.issues.length > 0 ? `(${snapshot.issues.length})` : ''
    // Batch bar: visible only in batch mode; prunes selections that no longer
    // exist or already reached a terminal state.
    const batchBar = q('.inv-batch-bar')
    const batchCount = q('[data-batch-count]')
    if (batchBar !== null) {
      batchBar.hidden = !batchMode
      for (const id of [...batchSelected]) {
        const issue = snapshot.issues.find((x) => x.id === id)
        if (issue === undefined || issue.state === 'done' || issue.state === 'canceled') batchSelected.delete(id)
      }
      if (batchCount !== null) batchCount.textContent = String(batchSelected.size)
      const confirmHint = batchConfirmTo !== null
      batchBar.innerHTML = confirmHint
        ? `<span class="inv-confirm-hint">确认将 ${batchSelected.size} 条标记${batchConfirmTo === 'done' ? '完成' : '取消'}？</span>` +
          `<button class="inv-act ${batchConfirmTo === 'done' ? 'inv-done' : 'inv-danger-ghost'}" data-batch-commit>确认</button>` +
          `<button class="inv-act" data-batch-clear>返回</button>`
        : `<span class="inv-batch-info">已选 <span data-batch-count>${batchSelected.size}</span></span>` +
          `<button class="inv-act inv-done" data-batch-done>完成</button>` +
          `<button class="inv-act inv-danger-ghost" data-batch-cancel>取消</button>` +
          `<button class="inv-act" data-batch-clear>清空</button>`
    }
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
      pager.innerHTML = renderPager(issuePage, totalPages, 'issue')
    }
  }
  // Restore the anchored scroll position (see the anchor capture above).
  if (anchor !== null && anchor.relTop !== null && body !== null) {
    const after = pagerRelTop(body, anchor.target)
    if (after !== null) {
      body.scrollTop = Math.max(0, body.scrollTop + anchor.relTop - after)
    }
  }
  pagerAnchorTarget = null
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
function renderIssueCard(i: Issue & { commitEvidence?: Snapshot['issues'][number]['commitEvidence'] }): string {
  const expanded = expandedIssueId === i.id
  const isConfirmingDelete = confirmIssueDeleteId === i.id
  const sessionId = i.attachSessionId ?? i.linkedSessionIds[0]
  const jump = sessionId
    ? `<button class="inv-act inv-jump" data-jump-session="${escapeHtml(sessionId)}" data-jump-message="${escapeHtml(i.promptMessageId ?? '')}" title="跳回对话中的这条 prompt">↩ 对话</button>`
    : ''
  // P0 (Output-first): done work with no observed commit evidence is flagged,
  // and candidate-only (heuristic) links are labeled instead of passing for
  // real provenance. P4: the tooltip carries strength, confidence, and the
  // limitation copy ("what this does NOT prove").
  const commitEvidence = i.commitEvidence
  const evTip = (ev: Snapshot['issues'][number]['commitEvidence']): string => {
    const conf = typeof ev?.confidence === 'number' ? ' · 置信度 ' + ev.confidence : ''
    const limits = (ev?.limitations ?? []).join(' ')
    return '落地证据：' + (ev?.best ?? 'candidate') + conf + (limits ? ' · ' + limits : '')
  }
  const commitBadge = i.state === 'done' && (commitEvidence === null || commitEvidence === undefined)
    ? '<span class="inv-commit-badge inv-commit-missing" title="已标记完成但没有落地 commit 证据">⚠ 无落地</span>'
    : commitEvidence !== null && commitEvidence !== undefined && commitEvidence.best === 'candidate'
      ? '<span class="inv-commit-badge" title="' + escapeHtml(evTip(commitEvidence)) + '">≈ 弱证据</span>'
      : ''
  const terminal = i.state === 'done' || i.state === 'canceled'
  const sel = batchMode && !terminal
    ? `<input class="inv-sel" type="checkbox" data-issue-sel="${i.id}" ${batchSelected.has(i.id) ? 'checked' : ''} title="选择此任务（批量）">`
    : ''
  // Direct state actions for open work items: mark done / canceled. Two-step
  // confirm on the card, same pattern as delete; the pendingConfirm section
  // (machine proposals) keeps its own confirm/dismiss flow.
  const actionConfirm = confirmIssueAction !== null && confirmIssueAction.id === i.id
  const actionButtons = terminal || batchMode
    ? ''
    : actionConfirm
      ? `<span class="inv-confirm-hint">确认${confirmIssueAction!.to === 'done' ? '完成' : '取消'}？</span>` +
        `<button class="inv-act ${confirmIssueAction!.to === 'done' ? 'inv-done' : 'inv-danger-ghost'}" data-issue-action-yes="${i.id}" data-to="${confirmIssueAction!.to}">确认</button>` +
        `<button class="inv-act" data-issue-cancel="1">返回</button>`
      : `<button class="inv-act inv-done" data-issue-done-ask="${i.id}" title="标记为已完成">完成</button>` +
        `<button class="inv-act inv-danger-ghost" data-issue-cancel-ask="${i.id}" title="标记为已取消">取消</button>`
  const actions = isConfirmingDelete
    ? `<span class="inv-confirm-hint">确认删除任务？</span>` +
      `<button class="inv-act inv-danger" data-issue-del="${i.id}">确认</button>` +
      `<button class="inv-act" data-issue-cancel="1">取消</button>`
    : `${jump}<button class="inv-act inv-jump" data-lineage="${i.id}" title="查看需求谱系：为什么存在 / 来自哪几句原话 / 被谁取代 / 落在哪个 commit">谱系</button>${actionButtons}<button class="inv-act" data-issue-del-ask="${i.id}">删除</button>`
  const detail = expanded
    ? `<div class="inv-issue-detail">${renderIssueDetail(i)}</div>`
    : ''
  const lineageBox = '<div class="inv-lineage" data-lineage-box="' + i.id + '" hidden></div>'
  return (
    `<div class="inv-card inv-issue-card${expanded ? ' inv-expanded' : ''}" data-id="${i.id}">` +
      `<div class="inv-issue-header" data-issue-toggle="${i.id}">` +
        `<span class="inv-issue-id">${sel}${escapeHtml(i.identifier)}</span>` +
        `<span class="inv-state inv-state-${i.state}">${i.state}</span>` +
        `${i.pendingConfirm ? `<span class="inv-state inv-state-pending">待确认</span>` : ''}` +
        `${commitBadge}` +
        `<span class="inv-issue-title">${escapeHtml(i.title)}</span>` +
        `<span class="inv-chevron">${expanded ? '▾' : '▸'}</span>` +
      `</div>` +
      detail +
      lineageBox +
      `<div class="inv-actions">${actions}</div>` +
    `</div>`
  )
}

/** Full detail body for one issue (shown when expanded). */
function renderIssueDetail(i: Issue & { commitEvidence?: Snapshot['issues'][number]['commitEvidence'] }): string {
  const parts: string[] = []
  // P4: output-evidence drawer — the strongest implements link, its strength,
  // confidence, and what it does NOT prove.
  const ev = i.commitEvidence
  if (ev !== null && ev !== undefined) {
    const evLabel: Record<string, string> = { declared: '声明', observed: '观测', candidate: '启发', unmapped: '未归属' }
    const limits = (ev.limitations ?? []).join(' ')
    parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">落地</span><span>${evLabel[ev.best ?? 'candidate'] ?? ev.best ?? 'candidate'}（${ev.count} commit）${typeof ev.confidence === 'number' ? ' · 置信度 ' + ev.confidence : ''}${limits ? ' · ' + escapeHtml(limits) : ''}</span></div>`)
  }
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

/** Render the lineage view HTML (Why/lineage lens). */
interface LineageViewLite {
  target: { id: string; kind: string; title: string; state?: string; origin?: string }
  neighbors: Record<string, { id: string; kind: string; title: string; meta?: Record<string, string | undefined> }>
  evidence: Array<{ sessionId: string; seqStart: number; seqEnd: number; kind: string; promptMessageId?: string; userMessages: Array<{ messageId?: string; title: string; seqStart: number; seqEnd: number }> }>
  commits: Array<{ id: string; sha: string; subject: string; authorAt: number; evidenceKind?: string; confidence?: number; limitations?: string[] }>
  edges: Array<{ kind: string; fromId: string; toId: string; linkMethod?: string; direction: 'out' | 'in' }>
}

function renderLineageHtml(view: LineageViewLite, issueId: string): string {
  const parts: string[] = []
  const originLabel: Record<string, string> = { user_explicit: '用户原话', user_confirmed: '用户确认', agent_proposed: 'agent 提议', system_inferred: '系统推断' }
  const head = view.target.origin ? ' (' + (originLabel[view.target.origin] ?? view.target.origin) + ')' : ''
  parts.push('<div class="inv-lg-title">谱系 · ' + escapeHtml(view.target.title) + head + '</div>')
  // Evidence chain: from which utterances.
  if (view.evidence.length > 0) {
    parts.push('<div class="inv-lg-group">证据链（来自原始会话）</div>')
    for (const ev of view.evidence) {
      const jump = ev.promptMessageId
        ? '<button class="inv-act inv-jump" data-jump-session="' + escapeHtml(ev.sessionId) + '" data-jump-message="' + escapeHtml(ev.promptMessageId) + '" title="跳回引发这条需求的 prompt">↩</button>'
        : ''
      parts.push('<div class="inv-lg-row">会话 ' + escapeHtml(ev.sessionId.slice(0, 18)) + '… seq ' + ev.seqStart + '-' + ev.seqEnd + ' ' + jump + '</div>')
      for (const m of ev.userMessages) {
        const mj = m.messageId
          ? '<button class="inv-act inv-jump" data-jump-session="' + escapeHtml(ev.sessionId) + '" data-jump-message="' + escapeHtml(m.messageId) + '">↩</button>'
          : ''
        parts.push('<div class="inv-lg-msg">💬 ' + escapeHtml(m.title.slice(0, 80)) + ' ' + mj + '</div>')
      }
    }
  }
  // Evolution: supersedes / derives edges.
  const evoEdges = view.edges.filter((e) => e.kind === 'supersedes' || e.kind === 'derives' || e.kind === 'spawned-by')
  if (evoEdges.length > 0) {
    parts.push('<div class="inv-lg-group">演化</div>')
    for (const e of evoEdges) {
      const otherId = e.direction === 'out' ? e.toId : e.fromId
      const n = view.neighbors[otherId]
      const label = e.kind === 'supersedes' ? (e.direction === 'out' ? '取代了' : '被取代') : e.kind === 'derives' ? (e.direction === 'out' ? '派生出' : '派生自') : '由'
      parts.push('<div class="inv-lg-row">' + label + ' ' + (n ? escapeHtml(n.title.slice(0, 60)) : escapeHtml(otherId.slice(0, 24))) + '</div>')
    }
  }
  // Execution: sessions + commits.
  const sessions = view.edges.filter((e) => e.kind === 'executed-in')
  if (sessions.length > 0) {
    parts.push('<div class="inv-lg-group">执行会话（' + sessions.length + '）</div>')
  }
  if (view.commits.length > 0) {
    parts.push('<div class="inv-lg-group">代码落地（commit）</div>')
    const evLabel: Record<string, string> = { declared: '声明', observed: '观测', candidate: '启发', unmapped: '未归属' }
    for (const c of view.commits) {
      const ev = evLabel[c.evidenceKind ?? 'candidate'] ?? '启发'
      const evCls = ['declared', 'observed'].includes(c.evidenceKind ?? '') ? 'inv-lg-ev-strong' : 'inv-lg-ev-weak'
      // P4: the evidence drawer — strength, confidence, and the fixed
      // limitation copy ("what this does NOT prove") on the same row.
      const conf = typeof c.confidence === 'number' ? ' · 置信度 ' + c.confidence : ''
      const limits = (c.limitations ?? []).join(' ')
      const tip = '证据强度：' + ev + '（' + (c.evidenceKind ?? 'candidate') + '）' + conf + (limits ? ' · ' + limits : '')
      parts.push('<div class="inv-lg-row">' + escapeHtml(c.sha.slice(0, 10)) + ' · ' + escapeHtml(c.subject.slice(0, 60)) + ' · ' + new Date(c.authorAt).toLocaleDateString()
        + '<span class="' + evCls + '" title="' + escapeHtml(tip) + '">' + ev + '</span></div>')
    }
  }
  if (parts.length === 1) parts.push('<div class="inv-empty">暂无谱系数据</div>')
  return parts.join('')
}


/** ---- visual project graph (force-directed SVG, no deps) ---- */

interface GVNodeLite { id: string; kind: string; label: string; sessionId?: string; messageId?: string; state?: string }
interface GVEdgeLite { from: string; to: string; kind: string; evidenceKind?: string; confidence?: number }
interface GVDataLite { nodes: GVNodeLite[]; edges: GVEdgeLite[] }

const GV_COLOR: Record<string, string> = { session: '#4c8dff', issue: '#1a7f37', commit: '#8a8f98', decision: '#e8853c' }

/** Simple force layout (repulsion + spring + centering), returns positions. */
function forceLayout(nodes: GVNodeLite[], edges: GVEdgeLite[], w: number, h: number): Map<string, { x: number; y: number }> {
  const ns = nodes.map((n) => ({ id: n.id, x: 40 + Math.random() * (w - 80), y: 40 + Math.random() * (h - 80), vx: 0, vy: 0 }))
  const idx = new Map(ns.map((n, i) => [n.id, i] as const))
  const adj: Array<[number, number]> = []
  for (const e of edges) {
    const a = idx.get(e.from), b = idx.get(e.to)
    if (a !== undefined && b !== undefined) adj.push([a, b])
  }
  for (let iter = 0; iter < 150; iter++) {
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const dx = ns[i].x - ns[j].x, dy = ns[i].y - ns[j].y
      const d2 = dx * dx + dy * dy + 1
      const f = 6000 / d2
      const d = Math.sqrt(d2)
      ns[i].vx += (dx / d) * f; ns[i].vy += (dy / d) * f
      ns[j].vx -= (dx / d) * f; ns[j].vy -= (dy / d) * f
    }
    for (const [a, b] of adj) {
      const dx = ns[b].x - ns[a].x, dy = ns[b].y - ns[a].y
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01
      const f = 0.012 * (d - 110)
      ns[a].vx += (dx / d) * f; ns[a].vy += (dy / d) * f
      ns[b].vx -= (dx / d) * f; ns[b].vy -= (dy / d) * f
    }
    for (const n of ns) {
      n.vx *= 0.85; n.vy *= 0.85
      n.x += n.vx; n.y += n.vy
      n.x = Math.min(w - 14, Math.max(14, n.x)); n.y = Math.min(h - 14, Math.max(14, n.y))
    }
  }
  return new Map(ns.map((n) => [n.id, { x: n.x, y: n.y }] as const))
}

/** Render the project graph as an interactive SVG (click nodes to jump). */
function renderGraphSvg(container: HTMLElement, view: GVDataLite): void {
  const w = container.clientWidth || 900
  const h = container.clientHeight || 600
  const pos = forceLayout(view.nodes, view.edges, w, h)
  const evCls = (e: GVEdgeLite): string => {
    const kind = e.evidenceKind ?? (e.kind === 'landed-in' || e.kind === 'implements' ? 'candidate' : '')
    // Only landed-in/implements edges carry evidence strength; other kinds
    // keep their base style. Sanitize against arbitrary link kinds.
    return (e.kind === 'landed-in' || e.kind === 'implements') && ['declared', 'observed', 'candidate', 'unmapped'].includes(kind)
      ? ' gv-ev-' + kind
      : ''
  }
  const edgeLines = view.edges.map((e) => {
    const a = pos.get(e.from), b = pos.get(e.to)
    if (!a || !b) return ''
    return '<line x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '" class="gv-edge gv-' + e.kind + evCls(e) + '"/>'
  }).join('')
  const circles = view.nodes.map((n) => {
    const p = pos.get(n.id)
    if (!p) return ''
    const color = GV_COLOR[n.kind] ?? '#999'
    const clickable = n.kind === 'session' || n.kind === 'issue'
    const cls = clickable ? 'gv-node gv-click' : 'gv-node'
    return '<g data-gn="' + escapeHtml(n.id) + '" data-kind="' + n.kind + '">'
      + '<circle r="9" fill="' + color + '" class="' + cls + '"/><title>' + escapeHtml(n.label) + '</title>'
      + '<text x="0" y="20" text-anchor="middle" class="gv-label">' + escapeHtml(n.label.slice(0, 18)) + '</text></g>'
  }).join('')
  const legend = ['session 会话', 'issue 需求', 'commit 代码', 'decision 决策'].map((t, i) => {
    const key = ['session', 'issue', 'commit', 'decision'][i]!;
    return '<span class="gv-legend"><i style="background:' + GV_COLOR[key] + '"></i>' + t + '</span>'
  }).join('')
  // P1 evidence legend: landed-in / implements edges carry declared (实线实心)
  // vs candidate (虚线琥珀) — weak evidence is never shown as strong.
  const evLegend = '<span class="gv-legend"><i class="gv-ev-sample gv-ev-declared"></i>声明</span>'
    + '<span class="gv-legend"><i class="gv-ev-sample gv-ev-candidate"></i>启发</span>'
  container.innerHTML = '<svg class="gv-svg" width="100%" height="100%" viewBox="0 0 ' + w + ' ' + h + '">'
    + '<rect width="100%" height="100%" fill="transparent"/>' + edgeLines + circles + '</svg>'
    + '<div class="gv-legend-bar">' + legend + evLegend + '</div>'
    + '<div class="gv-hint">点击 会话/需求 节点跳转到对话 · 实线=声明证据 虚线=启发式关联</div>'
  container.onclick = (ev: MouseEvent): void => {
    const g = (ev.target as Element).closest<HTMLElement>('[data-gn]')
    if (g === null) return
    const id = g.getAttribute('data-gn') ?? ''
    const node = view.nodes.find((n) => n.id === id)
    if (!node) return
    if (node.kind === 'session' && node.sessionId) void jumpToConversation({ sessionId: node.sessionId })
    else if (node.kind === 'issue' && node.sessionId) void jumpToConversation({ sessionId: node.sessionId, messageId: node.messageId })
  };
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
/** Two-step confirm on a regular card: marking this issue done/canceled. */
let confirmIssueAction: { id: string; to: 'done' | 'canceled' } | null = null
/** Batch mode: checkboxes on issue cards + the batch bar. */
let batchMode = false
let batchSelected = new Set<string>()
/** Batch confirm in flight: commit all selected to this state. */
let batchConfirmTo: 'done' | 'canceled' | null = null

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

function refresh(target?: 'captures' | 'issues'): void {
  if (target !== undefined) pagerAnchorTarget = target
  void fetchSnapshot().then(render)
}

// ---- session execution graph (M1) ----

interface GraphNodeLite {
  id: string
  kind: string
  title: string
  citation: { seqStart: number; seqEnd: number }
  turn?: number
  step?: number
  toolName?: string
  callId?: string
  messageId?: string
  toolError?: boolean
  parentSessionId?: string
  origin?: string
  agentLabel?: string
}
interface GraphEdgeLite { id: string; kind: string; fromId: string; toId: string }
interface GraphDocLite {
  sessionId: string
  header: { cwd?: string; parentSession?: string; origin?: string; delegationDepth?: number; createdAt: number }
  nodes: GraphNodeLite[]
  edges: GraphEdgeLite[]
  seqEnd: number
  builtAt: number
  version: number
}

/** Notify the conversation.view graph tab to refresh its data. */
function notifyGraphBuilt(): void {
  window.dispatchEvent(new CustomEvent('track:graph-built'))
}

/** Current session id from the sessions service list snapshot. */
function activeSessionId(): string | undefined {
  if (clientCtx === null) return undefined
  try {
    const sessions = (clientCtx as unknown as { sessions: { list: { getSnapshot(): { current?: string } } } }).sessions
    return sessions.list.getSnapshot().current
  } catch { return undefined }
}

const gSeq = (n: GraphNodeLite): string => (n.citation.seqStart === n.citation.seqEnd
  ? '#' + n.citation.seqStart
  : '#' + n.citation.seqStart + '-' + n.citation.seqEnd)

/** One tool/step/user row of the graph tree. */
function gRow(kind: string, inner: string, extra = '', cls = ''): string {
  const err = kind === 'tool' && extra === 'err' ? ' inv-gerr' : ''
  return '<div class="inv-gnode ' + kind + cls + err + '">' + inner + '</div>'
}

/** Render the stored graph of a session as a nested tree (plain DOM strings). */
function renderGraphHtml(doc: GraphDocLite, sessionId: string): string {
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]))
  const children = new Map<string, string[]>()
  const provoked = new Map<string, string>()
  for (const e of doc.edges) {
    if (e.kind === 'provoked') { provoked.set(e.fromId, e.toId); continue }
    const list = children.get(e.fromId) ?? []
    list.push(e.toId)
    children.set(e.fromId, list)
  }
  const kidsOf = (id: string): string[] => (children.get(id) ?? []).sort((a, b) =>
    (nodeById.get(a)?.citation.seqStart ?? 0) - (nodeById.get(b)?.citation.seqStart ?? 0) || (a < b ? -1 : 1))
  const userJump = (n: GraphNodeLite): string => (n.messageId
    ? '<button class="inv-act inv-jump" data-jump-session="' + escapeHtml(sessionId) + '" data-jump-message="' + escapeHtml(n.messageId) + '" title="跳回这条 prompt">↩</button>'
    : '')
  const parts: string[] = []
  const render = (id: string, depth: number): void => {
    const n = nodeById.get(id)
    if (n === undefined) return
    const pad = '&nbsp;'.repeat(depth * 2)
    if (n.kind === 'session') {
      const facts: string[] = []
      if (doc.header.cwd) facts.push(escapeHtml(doc.header.cwd))
      if (doc.header.parentSession) facts.push('forked from <button class="inv-act inv-jump inv-gfork" data-jump-session="' + escapeHtml(doc.header.parentSession) + '" title="打开父会话">' + escapeHtml(doc.header.parentSession) + '</button>')
      if (doc.header.origin === 'subagent') facts.push('subagent (depth ' + (doc.header.delegationDepth ?? 1) + ')')
      parts.push('<div class="inv-groot">' + escapeHtml(n.title) + ' · ' + escapeHtml(sessionId)
        + '<button class="inv-act inv-jump" data-jump-session="' + escapeHtml(sessionId) + '" title="跳转到这个会话的对话">↩ 对话</button>'
        + '<div class="inv-gmeta">' + facts.join(' · ') + ' · ' + doc.nodes.length + ' nodes · ' + doc.edges.length + ' edges · built ' + new Date(doc.builtAt).toLocaleTimeString() + '</div></div>')
    } else if (n.kind === 'turn') {
      parts.push('<details class="inv-gturn" open><summary>' + pad + escapeHtml(n.title) + '<span class="inv-gseq">' + gSeq(n) + '</span></summary>')
    } else if (n.kind === 'step') {
      parts.push('<details class="inv-gturn"><summary>' + pad + '· step ' + (n.step ?? '') + '<span class="inv-gseq">' + gSeq(n) + '</span></summary>')
    } else if (n.kind === 'tool') {
      const call = n.callId ? ' (' + escapeHtml(n.callId.slice(0, 10)) + '…)' : ''
      parts.push('<div class="inv-gtool' + (n.toolError ? ' inv-gerr' : '') + '">' + pad + '⚙ ' + escapeHtml(n.toolName ?? n.title) + call
        + (n.toolError ? ' ✗' : ' ✓') + '<span class="inv-gseq">' + gSeq(n) + '</span></div>')
    } else if (n.kind === 'user-message') {
      parts.push('<div class="inv-guser">' + pad + '<span class="inv-guser-text">💬 ' + escapeHtml(n.title) + '</span>' + userJump(n) + '<span class="inv-gseq">' + gSeq(n) + '</span></div>')
    } else if (n.kind === 'assistant') {
      parts.push(gRow('assistant', pad + '↩ ' + escapeHtml(n.title) + '<span class="inv-gseq">' + gSeq(n) + '</span>'))
    }
    if (n.kind === 'session') {
      for (const kid of kidsOf(id)) {
        const k = nodeById.get(kid)
        if (k?.kind === 'user-message' && provoked.has(kid)) continue
        render(kid, depth + 1)
      }
    } else if (n.kind === 'turn' || n.kind === 'step') {
      for (const kid of kidsOf(id)) render(kid, depth + 1)
      if (n.kind === 'turn') {
        for (const [uid, tid] of provoked) if (tid === id) render(uid, depth + 1)
      }
      parts.push('</details>')
    } else {
      for (const kid of kidsOf(id)) render(kid, depth + 1)
    }
  }
  const root = doc.nodes.find((n) => n.kind === 'session') ?? doc.nodes[0]
  if (root) render(root.id, 0)
  return parts.join('')
}

/** Build the current session's graph (POST) then re-render. */
async function buildCurrentGraph(): Promise<void> {
  const sessionId = activeSessionId()
  if (sessionId === undefined || sessionId === '') return
  try {
    await fetch('/api/track/graph', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
  } catch { /* ignore */ }
  notifyGraphBuilt()
}

/** Batch build the workspace of the current session (POST build-all). */
async function buildAllGraphs(): Promise<void> {
  const sessionId = activeSessionId()
  if (sessionId === undefined || sessionId === '') return
  // Resolve the workspace cwd from the stored graph header when available.
  let cwd = ''
  try {
    const r = await fetch('/api/track/graph?sessionId=' + encodeURIComponent(sessionId)).then((r) => r.json())
    cwd = r.doc?.header?.cwd ?? ''
  } catch { cwd = '' }
  if (cwd === '') return
  try {
    await fetch('/api/track/graph/build-all', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd, max_sessions: 200 }),
    })
  } catch { /* ignore */ }
  notifyGraphBuilt()
}

function restoreLayout(): void {
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
  syncGrid()
}

let trackTab: HTMLButtonElement | null = null

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
  panel.querySelector('.inv-refresh')?.addEventListener('click', () => refresh())
  // Settings: gear toggles the form; form loads the effective config and
  // POSTs a patch on save (missing fields keep their current value).
  const settingsPanel = panel.querySelector<HTMLElement>('.inv-settings-panel')
  const loadConfig = (cfg: Record<string, unknown>): void => {
    settingsPanel?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.inv-set').forEach((el) => {
      const key = el.dataset.set
      if (key && cfg[key] !== undefined) el.value = String(cfg[key])
    })
  }
  panel.querySelector('.inv-settings')?.addEventListener('click', () => {
    if (settingsPanel === null) return
    settingsPanel.hidden = !settingsPanel.hidden
    if (!settingsPanel.hidden) {
      void fetch('/api/track/config').then((r) => r.json()).then((d) => loadConfig(d.config ?? {}))
    }
  })
  panel.querySelector('.inv-save-config')?.addEventListener('click', () => {
    const patch: Record<string, unknown> = {}
    settingsPanel?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.inv-set').forEach((el) => {
      const key = el.dataset.set
      if (!key) return
      const v = el.type === 'number' ? Number(el.value) : el.value
      if (el.type === 'number' ? Number.isFinite(v as number) : v !== '') patch[key] = v
    })
    void fetch('/api/track/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }).then((r) => r.json()).then((d) => {
      if (d.ok && d.config) loadConfig(d.config)
    })
  })
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
        refresh('issues')
      }
      return
    }
    const pageBtn = target.closest<HTMLElement>('.inv-page')
    if (pageBtn !== null && !(pageBtn as HTMLButtonElement).disabled) {
      const page = Number(pageBtn.dataset.page)
      if (Number.isInteger(page) && page >= 0) {
        capturePage = page
        refresh('captures')
      }
      return
    }
    // Batch-mode checkbox — checked BEFORE the header toggle so selecting a
    // card does not also expand it.
    const selBox = target.closest<HTMLElement>('[data-issue-sel]')
    if (selBox !== null) {
      const id = selBox.getAttribute('data-issue-sel')
      if (id) {
        if (batchSelected.has(id)) batchSelected.delete(id)
        else batchSelected.add(id)
        batchConfirmTo = null
        refresh()
      }
      return
    }
    const batchToggle = target.closest<HTMLElement>('[data-batch-toggle]')
    if (batchToggle !== null) {
      batchMode = !batchMode
      batchSelected.clear()
      batchConfirmTo = null
      confirmIssueAction = null
      refresh()
      return
    }
    const batchDone = target.closest<HTMLElement>('[data-batch-done]')
    if (batchDone !== null) {
      batchConfirmTo = 'done'
      refresh()
      return
    }
    const batchCancel = target.closest<HTMLElement>('[data-batch-cancel]')
    if (batchCancel !== null) {
      batchConfirmTo = 'canceled'
      refresh()
      return
    }
    const batchCommit = target.closest<HTMLElement>('[data-batch-commit]')
    if (batchCommit !== null) {
      const to = batchConfirmTo
      const ids = [...batchSelected]
      batchConfirmTo = null
      batchSelected.clear()
      if (to !== null && ids.length > 0) {
        // One batch request (per-id results) instead of N confirm calls.
        void fetch('/api/track/issues/batch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids, to }),
        }).catch(() => undefined).then(() => refresh())
      } else {
        refresh()
      }
      return
    }
    const batchClear = target.closest<HTMLElement>('[data-batch-clear]')
    if (batchClear !== null) {
      batchSelected.clear()
      batchConfirmTo = null
      refresh()
      return
    }
    const issueDoneAsk = target.closest<HTMLElement>('[data-issue-done-ask]')
    if (issueDoneAsk !== null) {
      const id = issueDoneAsk.getAttribute('data-issue-done-ask')
      if (id) confirmIssueAction = { id, to: 'done' }
      refresh()
      return
    }
    const issueCancelAsk = target.closest<HTMLElement>('[data-issue-cancel-ask]')
    if (issueCancelAsk !== null) {
      const id = issueCancelAsk.getAttribute('data-issue-cancel-ask')
      if (id) confirmIssueAction = { id, to: 'canceled' }
      refresh()
      return
    }
    const issueActionYes = target.closest<HTMLElement>('[data-issue-action-yes]')
    if (issueActionYes !== null) {
      const id = issueActionYes.getAttribute('data-issue-action-yes')
      const to = issueActionYes.getAttribute('data-to')
      const action = confirmIssueAction
      confirmIssueAction = null
      if (id && (to === 'done' || to === 'canceled') && action !== null && action.id === id) {
        void fetch(`/api/track/issues/${encodeURIComponent(id)}/confirm`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ to }),
        }).then(() => refresh())
      } else {
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
          .then(() => refresh())
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
          .then(() => refresh())
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
        }).then(() => refresh())
      }
      return
    }
    const dismissBtn = target.closest<HTMLElement>('[data-dismiss]')
    if (dismissBtn !== null) {
      const id = dismissBtn.getAttribute('data-dismiss')
      if (id) {
        void fetch(`/api/track/issues/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }).then(() => refresh())
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
          .then(() => refresh())
      } else {
        refresh()
      }
      return
    }
    // Graph actions: build current session / batch build the workspace.
    const graphBuild = target.closest<HTMLElement>('.inv-graph-build')
    if (graphBuild !== null) { void buildCurrentGraph(); return }
    const graphBuildAll = target.closest<HTMLElement>('.inv-graph-buildall')
    if (graphBuildAll !== null) { void buildAllGraphs(); return }
    // Lineage view: lazy-load the Why/lineage lens for an issue.
    const lineageBtn = target.closest<HTMLElement>('[data-lineage]')
    if (lineageBtn !== null) {
      const id = lineageBtn.getAttribute('data-lineage')
      if (id) {
        const box = panel?.querySelector<HTMLElement>('[data-lineage-box="' + id + '"]')
        if (box !== null) {
          if (!box.hidden) { box.hidden = true; return }
          box.hidden = false
          box.innerHTML = '<div class="inv-empty">加载中…</div>'
          void fetch('/api/track/lineage?entity=' + encodeURIComponent(id))
            .then((r) => r.json())
            .then((d) => {
              if (d.view) box.innerHTML = renderLineageHtml(d.view, id)
              else box.innerHTML = '<div class="inv-empty">暂无谱系数据</div>'
            })
            .catch(() => { box.innerHTML = '<div class="inv-empty">加载失败</div>' })
        }
      }
      return
    }
    // Cancel: any cancel button clears all confirm states (delete, card
    // done/canceled, batch).
    if (target.closest('[data-capture-cancel], [data-issue-cancel]') !== null) {
      confirmCaptureDeleteId = null
      confirmIssueDeleteId = null
      confirmIssueAction = null
      batchConfirmTo = null
      refresh()
    }
  }
  panel.addEventListener('click', onAction)

  // Page-number input: Enter jumps to the typed page (both pagers).
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('[data-page-input]')
    if (input === null) return
    const kind = input.getAttribute('data-page-input')
    const page = Number(input.value)
    if (!Number.isInteger(page) || page < 1) return
    if (kind === 'capture') {
      capturePage = page - 1
      refresh('captures')
    } else if (kind === 'issue') {
      issuePage = page - 1
      expandedIssueId = null
      refresh('issues')
    }
  })

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
    if (panelOpen && !document.hidden) { refresh() }
  }, 20000)
  const onFocus = (): void => { tryMount(); refresh() }
  // Re-render the graph when the active session changes.
  let unsubSessions: (() => void) | undefined
  try {
    const sessions = (clientCtx as unknown as { sessions: { list: { subscribe(fn: () => void): () => void } } }).sessions
    unsubSessions = sessions.list.subscribe(() => { if (panelOpen) refresh() })
  } catch { unsubSessions = undefined }
  window.addEventListener('focus', onFocus)

  return () => {
    if (unsubSessions !== undefined) unsubSessions()
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
