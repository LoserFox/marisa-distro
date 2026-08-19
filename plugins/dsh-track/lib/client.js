window.__ModuleLoader__.load({ id: "@fakechris/dsh-track", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react_jsx_runtime = require("react/jsx-runtime");
let react = require("react");
let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
require("react-dom/client");
//#region lib/client/strip.js
/**
* TrackStrip: the composer-dock strip surfacing capture-wall state. Styles
* are inline (no CSS modules) so the client bundle needs no CSS pipeline.
*
* The count is fetched from the host API and re-polled while the app is
* open (same cadence as the right panel's auto-refresh), so the badge never
* lies — the previous version hardcoded `captures: 0` and always showed
* "暂无捕获 / No captures" (2026-08-13).
* @module @deepseek-ai/dsh-track/client/strip
*/
const style = {
	strip: {
		display: "inline-flex",
		alignItems: "center",
		gap: 8,
		padding: "2px 8px",
		border: "1px solid rgba(128, 128, 128, 0.3)",
		borderRadius: 6,
		background: "transparent",
		color: "inherit",
		fontSize: 12,
		cursor: "pointer"
	},
	label: { fontWeight: 600 },
	badge: {
		padding: "0 6px",
		borderRadius: 999,
		background: "#4c8dff",
		color: "#fff",
		fontSize: 11,
		lineHeight: "16px"
	},
	muted: { opacity: .7 },
	empty: {
		opacity: .55,
		fontStyle: "italic"
	}
};
const REFRESH_MS = 2e4;
/** Track strip component: label + live open capture count, click opens the panel. */
function TrackStrip({ captures: initial, onClick, t }) {
	const [captures, setCaptures] = (0, react.useState)(initial ?? 0);
	(0, react.useEffect)(() => {
		let alive = true;
		const load = () => {
			fetch("/api/track/captures").then((r) => r.json()).then((data) => {
				if (!alive) return;
				const open = (data.captures ?? []).filter((c) => c.status === "open").length;
				setCaptures(open);
			}).catch(() => {});
		};
		load();
		const id = window.setInterval(load, REFRESH_MS);
		window.addEventListener("focus", load);
		return () => {
			alive = false;
			window.clearInterval(id);
			window.removeEventListener("focus", load);
		};
	}, []);
	return (0, react_jsx_runtime.jsxs)("button", {
		type: "button",
		style: style.strip,
		"data-testid": "track-strip",
		onClick,
		title: t("strip.title"),
		children: [(0, react_jsx_runtime.jsx)("span", {
			style: style.label,
			children: t("strip.label")
		}), captures > 0 ? (0, react_jsx_runtime.jsx)("span", {
			style: style.badge,
			children: t(captures === 1 ? "strip.captures.one" : "strip.captures", { n: captures })
		}) : (0, react_jsx_runtime.jsx)("span", {
			style: style.empty,
			children: t("strip.empty")
		})]
	});
}
//#endregion
//#region lib/client/locales.js
/**
* Track strip copy — locale keys and zh/en dictionaries.
* @module @fakechris/dsh-track/client/locales
*/
/** Simplified Chinese dictionary (the key-set source of truth). */
const zh = {
	"strip.label": "Track",
	"strip.captures": "{n} 条捕获",
	"strip.captures.one": "{n} 条捕获",
	"strip.empty": "暂无捕获",
	"strip.title": "打开 Track 面板",
	"view.graph": "会话结构图"
};
/** English dictionary, checked complete against the zh key set. */
const en = {
	"strip.label": "Track",
	"strip.captures": "{n} captures",
	"strip.captures.one": "{n} capture",
	"strip.empty": "No captures",
	"strip.title": "Open the Track panel",
	"view.graph": "Session graph"
};
/** Locale namespace registered on the client locale service. */
const NS = "track";
//#endregion
//#region lib/client/right-panel.js
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
/** Stable ids for the injected panel and toggle. */
const PANEL_ID = "dsh-track-panel";
const FAB_ID = "dsh-track-fab";
const OPEN_KEY = "dsh.track.open";
const WIDTH_KEY = "dsh.track.width";
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
let clientCtx = null;
/** Bounded "deep history" pages to walk before giving up on an old prompt. */
const MAX_PAGES = 40;
const POLL_MS = 120;
const TIMEOUT_MS = 1e4;
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
/** Poll `fn()` until truthy or the timeout elapses. */
async function pollUntil(fn, timeoutMs = TIMEOUT_MS) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (fn()) return true;
		await sleep(POLL_MS);
	}
	return fn();
}
/** Poll `fn()` until it returns a defined value, or the timeout elapses. */
async function pollValue(fn, timeoutMs = TIMEOUT_MS) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const value = fn();
		if (value !== void 0) return value;
		await sleep(POLL_MS);
	}
	return fn();
}
/** Find a chat row by its stable flow key (dataset compare — no selector escaping). */
function findRowByKey(scroll, key) {
	for (const el of scroll.querySelectorAll("[data-chat-flow-key]")) if (el.dataset.chatFlowKey === key) return el;
	return null;
}
/** Briefly flash a chat row so the jump target is obvious. */
function flashRow(el) {
	el.classList.add("inv-jump-flash");
	window.setTimeout(() => el.classList.remove("inv-jump-flash"), 2600);
}
/**
* Open `sessionId` in the left conversation and scroll to `messageId`'s user
* prompt row. Falls back to the first user message in the loaded window,
* then to the bottom, when the message cannot be located.
*/
async function jumpToConversation(opts) {
	const { sessionId, messageId } = opts;
	if (!sessionId || clientCtx === null) return;
	let sessions;
	try {
		sessions = clientCtx.sessions;
	} catch {
		return;
	}
	try {
		sessions.open(sessionId);
	} catch {
		return;
	}
	const session = await pollValue(() => sessions.binding(sessionId)?.session);
	if (session === void 0) return;
	await pollUntil(() => session.getSnapshot().openState === "open");
	const key = messageId !== void 0 && messageId !== "" ? (0, _deepseek_ai_dsh_client_runtime_client.conversationContextKey)("input-message", messageId) : void 0;
	if (key !== void 0) for (let i = 0; i < MAX_PAGES; i++) {
		const snap = session.getSnapshot();
		if (snap.chat.nodes.get(key) !== void 0) break;
		if (!snap.hasMore) break;
		await session.loadOlder().catch(() => {});
		await pollUntil(() => !session.getSnapshot().loadingOlder);
	}
	const scroll = document.querySelector("[data-conversation-scroll]");
	let row = null;
	if (key !== void 0 && scroll !== null) {
		row = findRowByKey(scroll, key);
		if (row === null) {
			const start = Date.now();
			while (Date.now() - start < TIMEOUT_MS) {
				await sleep(POLL_MS);
				row = findRowByKey(scroll, key);
				if (row !== null) break;
			}
		}
	}
	if (row !== null) {
		flashRow(row);
		jumpScrollIntoView(row);
		return;
	}
	const first = scroll?.querySelector("[data-chat-flow-kind=\"user\"]");
	if (first !== null && first !== void 0) {
		flashRow(first);
		jumpScrollIntoView(first);
		return;
	}
	if (scroll !== null) scroll.scrollTop = scroll.scrollHeight;
}
/**
* Scroll the target row into view, re-applying a few times: a jump into a
* RUNNING session fights the ChatView's bottom-follow (every streamed flow
* update re-pins to the bottom while the reader is at the bottom). Re-applying
* moves the viewport off the bottom, which flips the follow state off, so the
* jump sticks. Instant (`auto`) scrolling is used — smooth over very long
* distances stalls in Chrome. Re-applies are no-ops once the row is in view.
*/
function jumpScrollIntoView(row) {
	const apply = () => {
		row.scrollIntoView({
			block: "center",
			behavior: "auto"
		});
	};
	apply();
	for (let i = 1; i <= 4; i++) window.setTimeout(apply, i * 300);
}
async function fetchSnapshot() {
	const [c, i] = await Promise.all([fetch("/api/track/captures").then((r) => r.json()).catch(() => ({ captures: [] })), fetch("/api/track/issues").then((r) => r.json()).catch(() => ({ issues: [] }))]);
	return {
		captures: c.captures ?? [],
		issues: i.issues ?? []
	};
}
/** ---- panel HTML (plain DOM — the lazyfish pattern keeps it React-free) ---- */
function buildPanelHtml() {
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
  `;
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

`;
let panel = null;
let fab = null;
let host = null;
let prior = {};
let panelOpen = false;
let panelWidthPx = null;
function readStoredNumber(key) {
	try {
		const v = Number(localStorage.getItem(key));
		return Number.isFinite(v) && v > 0 ? v : null;
	} catch {
		return null;
	}
}
function readOpenState() {
	try {
		return localStorage.getItem(OPEN_KEY) === "1";
	} catch {
		return false;
	}
}
function syncGrid() {
	if (host === null || !panelOpen) return;
	host.candidate.style.gridTemplateColumns = panelWidthPx !== null ? `minmax(0, 1fr) ${panelWidthPx}px` : "minmax(0, 2fr) minmax(0, 1fr)";
}
/**
* Pager controls: first («) / prev (‹) / direct page-number input / next (›) /
* last (»). `kind` selects the data-attr family the delegation handlers read.
*/
function renderPager(page, totalPages, kind) {
	const d = kind === "capture" ? "data-page" : "data-issue-page";
	const cls = kind === "capture" ? "inv-page" : "inv-page inv-issue-page";
	const input = kind === "capture" ? "data-page-input=\"capture\"" : "data-page-input=\"issue\"";
	if (totalPages <= 1) return "";
	return `<button class="${cls}" ${d}="0" ${page === 0 ? "disabled" : ""} title="第一页">«</button><button class="${cls}" ${d}="${page - 1}" ${page === 0 ? "disabled" : ""} title="上一页">‹</button><input class="inv-page-input" ${input} value="${page + 1}" inputmode="numeric" title="跳到第几页（回车）"><span class="inv-page-info">/ ${totalPages}</span><button class="${cls}" ${d}="${page + 1}" ${page >= totalPages - 1 ? "disabled" : ""} title="下一页">›</button><button class="${cls}" ${d}="${totalPages - 1}" ${page >= totalPages - 1 ? "disabled" : ""} title="最后一页">»</button>`;
}
/** The pager currently being paged — its viewport position anchors the scroll
*  across the re-render so clicking a page button no longer makes the panel
*  jump (user feedback 2026-08-14: "点翻页之后页面晃，找不到按钮了"). */
let pagerAnchorTarget = null;
/** Viewport-relative top of one pager inside the panel body scrollport. */
function pagerRelTop(body, target) {
	const pager = body.querySelector(target === "captures" ? ".inv-pager" : ".inv-issue-pager");
	if (pager === null) return null;
	return pager.getBoundingClientRect().top - body.getBoundingClientRect().top;
}
function render(snapshot) {
	if (panel === null) return;
	const q = (sel) => panel.querySelector(sel);
	const body = q(".inv-body");
	const anchor = body !== null && pagerAnchorTarget !== null ? {
		target: pagerAnchorTarget,
		relTop: pagerRelTop(body, pagerAnchorTarget)
	} : null;
	const pendingEl = q(".inv-pending");
	if (pendingEl !== null) {
		const pending = snapshot.issues.filter((i) => i.pendingConfirm !== void 0);
		const pendingCount = q(".inv-pending-count");
		if (pendingCount !== null) pendingCount.textContent = pending.length > 0 ? `(${pending.length})` : "";
		pendingEl.innerHTML = pending.length === 0 ? "<div class=\"inv-empty\">无待确认变更</div>" : pending.map((i) => renderPendingCard(i)).join("");
	}
	const openCaptures = snapshot.captures.filter((c) => c.status === "open").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || (a.id < b.id ? 1 : -1));
	const capEl = q(".inv-captures");
	if (capEl !== null) {
		const totalPages = Math.max(1, Math.ceil(openCaptures.length / CAPTURES_PER_PAGE));
		if (capturePage >= totalPages) capturePage = totalPages - 1;
		const pageCaps = openCaptures.slice(capturePage * CAPTURES_PER_PAGE, (capturePage + 1) * CAPTURES_PER_PAGE);
		capEl.innerHTML = pageCaps.length === 0 ? "<div class=\"inv-empty\">暂无捕获</div>" : pageCaps.map((c) => renderCaptureCard(c)).join("");
		const pager = q(".inv-pager");
		if (pager !== null) pager.innerHTML = renderPager(capturePage, totalPages, "capture");
	}
	const issEl = q(".inv-issues");
	const issCount = q(".inv-issue-count");
	if (issEl !== null) {
		if (issCount !== null) issCount.textContent = snapshot.issues.length > 0 ? `(${snapshot.issues.length})` : "";
		const batchBar = q(".inv-batch-bar");
		const batchCount = q("[data-batch-count]");
		if (batchBar !== null) {
			batchBar.hidden = !batchMode;
			for (const id of [...batchSelected]) {
				const issue = snapshot.issues.find((x) => x.id === id);
				if (issue === void 0 || issue.state === "done" || issue.state === "canceled") batchSelected.delete(id);
			}
			if (batchCount !== null) batchCount.textContent = String(batchSelected.size);
			batchBar.innerHTML = batchConfirmTo !== null ? `<span class="inv-confirm-hint">确认将 ${batchSelected.size} 条标记${batchConfirmTo === "done" ? "完成" : "取消"}？</span><button class="inv-act ${batchConfirmTo === "done" ? "inv-done" : "inv-danger-ghost"}" data-batch-commit>确认</button><button class="inv-act" data-batch-clear>返回</button>` : `<span class="inv-batch-info">已选 <span data-batch-count>${batchSelected.size}</span></span><button class="inv-act inv-done" data-batch-done>完成</button><button class="inv-act inv-danger-ghost" data-batch-cancel>取消</button><button class="inv-act" data-batch-clear>清空</button>`;
		}
		const ordered = [...snapshot.issues].sort((a, b) => {
			const ga = STATE_ORDER[a.state] ?? 9;
			const gb = STATE_ORDER[b.state] ?? 9;
			if (ga !== gb) return ga - gb;
			return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || (a.id < b.id ? 1 : -1);
		});
		const totalPages = Math.max(1, Math.ceil(ordered.length / ISSUES_PER_PAGE));
		if (issuePage >= totalPages) issuePage = totalPages - 1;
		const pageIssues = ordered.slice(issuePage * ISSUES_PER_PAGE, (issuePage + 1) * ISSUES_PER_PAGE);
		const cards = [];
		let prevState = null;
		for (const issue of pageIssues) {
			if (issue.state !== prevState) {
				cards.push(`<div class="inv-state-group">${STATE_LABEL[issue.state] ?? issue.state} (${snapshot.issues.filter((x) => x.state === issue.state).length})</div>`);
				prevState = issue.state;
			}
			cards.push(renderIssueCard(issue));
		}
		issEl.innerHTML = pageIssues.length === 0 ? "<div class=\"inv-empty\">暂无任务</div>" : cards.join("");
		const pager = q(".inv-issue-pager");
		if (pager !== null) pager.innerHTML = renderPager(issuePage, totalPages, "issue");
	}
	if (anchor !== null && anchor.relTop !== null && body !== null) {
		const after = pagerRelTop(body, anchor.target);
		if (after !== null) body.scrollTop = Math.max(0, body.scrollTop + anchor.relTop - after);
	}
	pagerAnchorTarget = null;
}
/** One pending-confirmation card: the machine proposed done/canceled/review; the
*  user confirms (state commit) or dismisses (marker cleared, may re-propose).
*  review = machine cannot tell done from abandoned — asks which way to go. */
function renderPendingCard(i) {
	const pc = i.pendingConfirm;
	const isReview = pc.to === "review";
	const toLabel = pc.to === "done" ? "确认完成" : pc.to === "canceled" ? "确认取消" : "确认完成";
	const reason = `${pc.to === "done" ? "证据显示已完成" : pc.to === "canceled" ? "长期无进展" : "请人工判定状态"}：${escapeHtml(pc.reason)} · ${new Date(pc.at).toLocaleString()}`;
	const actions = isReview ? `<button class="inv-act inv-confirm" data-confirm="${i.id}" data-to="done">确认完成</button><button class="inv-act" data-confirm="${i.id}" data-to="canceled">确认取消</button><button class="inv-act" data-dismiss="${i.id}">还在做</button>` : `<button class="inv-act inv-confirm" data-confirm="${i.id}" data-to="${pc.to}">${toLabel}</button><button class="inv-act" data-dismiss="${i.id}">驳回</button>`;
	return `<div class="inv-card inv-pending-card" data-id="${i.id}"><div class="inv-issue-header"><span class="inv-issue-id">${escapeHtml(i.identifier)}</span><span class="inv-issue-title">${escapeHtml(i.title)}</span></div><div class="inv-pending-reason">${reason}</div><div class="inv-actions">${actions}</div></div>`;
}
/** One capture card with delete (two-step confirm) + promote actions. */
function renderCaptureCard(c) {
	const meta = `${c.tags.map(escapeHtml).join(" · ")}${c.tags.length ? " · " : ""}${new Date(c.createdAt).toLocaleString()}`;
	const isConfirming = confirmCaptureDeleteId === c.id;
	const jump = c.sourceSessionId ? `<button class="inv-act inv-jump" data-jump-session="${escapeHtml(c.sourceSessionId)}" data-jump-message="${escapeHtml(c.sourceMessageId ?? "")}" title="跳回对话中的这条 prompt">↩ 对话</button>` : "";
	const actions = isConfirming ? `<span class="inv-confirm-hint">确认删除？</span><button class="inv-act inv-danger" data-capture-del="${c.id}">确认</button><button class="inv-act" data-capture-cancel="1">取消</button>` : `${jump}<button class="inv-act" data-capture-promote="${c.id}" title="转为任务">转任务</button><button class="inv-act inv-danger-ghost" data-capture-del-ask="${c.id}">删除</button>`;
	return `<div class="inv-card">${escapeHtml(c.content)}<div class="inv-meta">${meta}</div><div class="inv-actions">${actions}</div></div>`;
}
/** One issue card: header row (badge + title + expand) + optional detail body. */
function renderIssueCard(i) {
	const expanded = expandedIssueId === i.id;
	const isConfirmingDelete = confirmIssueDeleteId === i.id;
	const sessionId = i.attachSessionId ?? i.linkedSessionIds[0];
	const jump = sessionId ? `<button class="inv-act inv-jump" data-jump-session="${escapeHtml(sessionId)}" data-jump-message="${escapeHtml(i.promptMessageId ?? "")}" title="跳回对话中的这条 prompt">↩ 对话</button>` : "";
	const commitEvidence = i.commitEvidence;
	const evTip = (ev) => {
		const conf = typeof ev?.confidence === "number" ? " · 置信度 " + ev.confidence : "";
		const limits = (ev?.limitations ?? []).join(" ");
		return "落地证据：" + (ev?.best ?? "candidate") + conf + (limits ? " · " + limits : "");
	};
	const commitBadge = i.state === "done" && (commitEvidence === null || commitEvidence === void 0) ? "<span class=\"inv-commit-badge inv-commit-missing\" title=\"已标记完成但没有落地 commit 证据\">⚠ 无落地</span>" : commitEvidence !== null && commitEvidence !== void 0 && commitEvidence.best === "candidate" ? "<span class=\"inv-commit-badge\" title=\"" + escapeHtml(evTip(commitEvidence)) + "\">≈ 弱证据</span>" : "";
	const terminal = i.state === "done" || i.state === "canceled";
	const sel = batchMode && !terminal ? `<input class="inv-sel" type="checkbox" data-issue-sel="${i.id}" ${batchSelected.has(i.id) ? "checked" : ""} title="选择此任务（批量）">` : "";
	const actionConfirm = confirmIssueAction !== null && confirmIssueAction.id === i.id;
	const actionButtons = terminal || batchMode ? "" : actionConfirm ? `<span class="inv-confirm-hint">确认${confirmIssueAction.to === "done" ? "完成" : "取消"}？</span><button class="inv-act ${confirmIssueAction.to === "done" ? "inv-done" : "inv-danger-ghost"}" data-issue-action-yes="${i.id}" data-to="${confirmIssueAction.to}">确认</button><button class="inv-act" data-issue-cancel="1">返回</button>` : `<button class="inv-act inv-done" data-issue-done-ask="${i.id}" title="标记为已完成">完成</button><button class="inv-act inv-danger-ghost" data-issue-cancel-ask="${i.id}" title="标记为已取消">取消</button>`;
	const actions = isConfirmingDelete ? `<span class="inv-confirm-hint">确认删除任务？</span><button class="inv-act inv-danger" data-issue-del="${i.id}">确认</button><button class="inv-act" data-issue-cancel="1">取消</button>` : `${jump}<button class="inv-act inv-jump" data-lineage="${i.id}" title="查看需求谱系：为什么存在 / 来自哪几句原话 / 被谁取代 / 落在哪个 commit">谱系</button>${actionButtons}<button class="inv-act" data-issue-del-ask="${i.id}">删除</button>`;
	const detail = expanded ? `<div class="inv-issue-detail">${renderIssueDetail(i)}</div>` : "";
	const lineageBox = "<div class=\"inv-lineage\" data-lineage-box=\"" + i.id + "\" hidden></div>";
	return `<div class="inv-card inv-issue-card${expanded ? " inv-expanded" : ""}" data-id="${i.id}"><div class="inv-issue-header" data-issue-toggle="${i.id}"><span class="inv-issue-id">${sel}${escapeHtml(i.identifier)}</span><span class="inv-state inv-state-${i.state}">${i.state}</span>${i.pendingConfirm ? `<span class="inv-state inv-state-pending">待确认</span>` : ""}${commitBadge}<span class="inv-issue-title">${escapeHtml(i.title)}</span><span class="inv-chevron">${expanded ? "▾" : "▸"}</span></div>` + detail + lineageBox + `<div class="inv-actions">${actions}</div></div>`;
}
/** Full detail body for one issue (shown when expanded). */
function renderIssueDetail(i) {
	const parts = [];
	const ev = i.commitEvidence;
	if (ev !== null && ev !== void 0) {
		const evLabel = {
			declared: "声明",
			observed: "观测",
			candidate: "启发",
			unmapped: "未归属"
		};
		const limits = (ev.limitations ?? []).join(" ");
		parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">落地</span><span>${evLabel[ev.best ?? "candidate"] ?? ev.best ?? "candidate"}（${ev.count} commit）${typeof ev.confidence === "number" ? " · 置信度 " + ev.confidence : ""}${limits ? " · " + escapeHtml(limits) : ""}</span></div>`);
	}
	if (i.description) parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">描述</span><div class="inv-detail-text">${escapeHtml(i.description)}</div></div>`);
	if (i.acceptanceCriteria) parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">验收</span><div class="inv-detail-text">${escapeHtml(i.acceptanceCriteria)}</div></div>`);
	parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">优先级</span><span>${PRIORITY_LABEL[i.priority] ?? String(i.priority)}</span></div>`);
	if (i.labels.length > 0) parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">标签</span><span>${i.labels.map(escapeHtml).join(", ")}</span></div>`);
	if (i.assignee) parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">负责人</span><span>${escapeHtml(i.assignee)}</span></div>`);
	if (i.parentId) parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">父任务</span><span>${escapeHtml(i.parentId)}</span></div>`);
	parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">创建</span><span>${new Date(i.createdAt).toLocaleString()}</span></div>`);
	parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">更新</span><span>${new Date(i.updatedAt).toLocaleString()}</span></div>`);
	if (i.linkedSessionIds.length > 0) parts.push(`<div class="inv-detail-row"><span class="inv-detail-label">会话</span><span>${i.linkedSessionIds.map(escapeHtml).join(", ")}</span></div>`);
	return parts.join("");
}
function renderLineageHtml(view, issueId) {
	const parts = [];
	const head = view.target.origin ? " (" + ({
		user_explicit: "用户原话",
		user_confirmed: "用户确认",
		agent_proposed: "agent 提议",
		system_inferred: "系统推断"
	}[view.target.origin] ?? view.target.origin) + ")" : "";
	parts.push("<div class=\"inv-lg-title\">谱系 · " + escapeHtml(view.target.title) + head + "</div>");
	if (view.evidence.length > 0) {
		parts.push("<div class=\"inv-lg-group\">证据链（来自原始会话）</div>");
		for (const ev of view.evidence) {
			const jump = ev.promptMessageId ? "<button class=\"inv-act inv-jump\" data-jump-session=\"" + escapeHtml(ev.sessionId) + "\" data-jump-message=\"" + escapeHtml(ev.promptMessageId) + "\" title=\"跳回引发这条需求的 prompt\">↩</button>" : "";
			parts.push("<div class=\"inv-lg-row\">会话 " + escapeHtml(ev.sessionId.slice(0, 18)) + "… seq " + ev.seqStart + "-" + ev.seqEnd + " " + jump + "</div>");
			for (const m of ev.userMessages) {
				const mj = m.messageId ? "<button class=\"inv-act inv-jump\" data-jump-session=\"" + escapeHtml(ev.sessionId) + "\" data-jump-message=\"" + escapeHtml(m.messageId) + "\">↩</button>" : "";
				parts.push("<div class=\"inv-lg-msg\">💬 " + escapeHtml(m.title.slice(0, 80)) + " " + mj + "</div>");
			}
		}
	}
	const evoEdges = view.edges.filter((e) => e.kind === "supersedes" || e.kind === "derives" || e.kind === "spawned-by");
	if (evoEdges.length > 0) {
		parts.push("<div class=\"inv-lg-group\">演化</div>");
		for (const e of evoEdges) {
			const otherId = e.direction === "out" ? e.toId : e.fromId;
			const n = view.neighbors[otherId];
			const label = e.kind === "supersedes" ? e.direction === "out" ? "取代了" : "被取代" : e.kind === "derives" ? e.direction === "out" ? "派生出" : "派生自" : "由";
			parts.push("<div class=\"inv-lg-row\">" + label + " " + (n ? escapeHtml(n.title.slice(0, 60)) : escapeHtml(otherId.slice(0, 24))) + "</div>");
		}
	}
	const sessions = view.edges.filter((e) => e.kind === "executed-in");
	if (sessions.length > 0) parts.push("<div class=\"inv-lg-group\">执行会话（" + sessions.length + "）</div>");
	if (view.commits.length > 0) {
		parts.push("<div class=\"inv-lg-group\">代码落地（commit）</div>");
		const evLabel = {
			declared: "声明",
			observed: "观测",
			candidate: "启发",
			unmapped: "未归属"
		};
		for (const c of view.commits) {
			const ev = evLabel[c.evidenceKind ?? "candidate"] ?? "启发";
			const evCls = ["declared", "observed"].includes(c.evidenceKind ?? "") ? "inv-lg-ev-strong" : "inv-lg-ev-weak";
			const conf = typeof c.confidence === "number" ? " · 置信度 " + c.confidence : "";
			const limits = (c.limitations ?? []).join(" ");
			const tip = "证据强度：" + ev + "（" + (c.evidenceKind ?? "candidate") + "）" + conf + (limits ? " · " + limits : "");
			parts.push("<div class=\"inv-lg-row\">" + escapeHtml(c.sha.slice(0, 10)) + " · " + escapeHtml(c.subject.slice(0, 60)) + " · " + new Date(c.authorAt).toLocaleDateString() + "<span class=\"" + evCls + "\" title=\"" + escapeHtml(tip) + "\">" + ev + "</span></div>");
		}
	}
	if (parts.length === 1) parts.push("<div class=\"inv-empty\">暂无谱系数据</div>");
	return parts.join("");
}
const CAPTURES_PER_PAGE = 8;
const ISSUES_PER_PAGE = 8;
const PRIORITY_LABEL = {
	0: "urgent",
	1: "high",
	2: "medium",
	3: "low",
	4: "none"
};
/** Issue group order: active work first, then backlog, then finished. */
const STATE_ORDER = {
	in_progress: 0,
	todo: 1,
	done: 2,
	canceled: 3
};
/** Issue group display labels (zh, matching the panel language). */
const STATE_LABEL = {
	in_progress: "进行中",
	todo: "待办",
	done: "已完成",
	canceled: "已取消"
};
let capturePage = 0;
let issuePage = 0;
let expandedIssueId = null;
let confirmCaptureDeleteId = null;
let confirmIssueDeleteId = null;
/** Two-step confirm on a regular card: marking this issue done/canceled. */
let confirmIssueAction = null;
/** Batch mode: checkboxes on issue cards + the batch bar. */
let batchMode = false;
let batchSelected = /* @__PURE__ */ new Set();
/** Batch confirm in flight: commit all selected to this state. */
let batchConfirmTo = null;
function escapeHtml(s) {
	return s.replace(/[&<>"']/g, (ch) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;"
	})[ch]);
}
function refresh(target) {
	if (target !== void 0) pagerAnchorTarget = target;
	fetchSnapshot().then(render);
}
/** Notify the conversation.view graph tab to refresh its data. */
function notifyGraphBuilt() {
	window.dispatchEvent(new CustomEvent("track:graph-built"));
}
/** Current session id from the sessions service list snapshot. */
function activeSessionId() {
	if (clientCtx === null) return void 0;
	try {
		return clientCtx.sessions.list.getSnapshot().current;
	} catch {
		return;
	}
}
/** Build the current session's graph (POST) then re-render. */
async function buildCurrentGraph() {
	const sessionId = activeSessionId();
	if (sessionId === void 0 || sessionId === "") return;
	try {
		await fetch("/api/track/graph", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ sessionId })
		});
	} catch {}
	notifyGraphBuilt();
}
/** Batch build the workspace of the current session (POST build-all). */
async function buildAllGraphs() {
	const sessionId = activeSessionId();
	if (sessionId === void 0 || sessionId === "") return;
	let cwd = "";
	try {
		cwd = (await fetch("/api/track/graph?sessionId=" + encodeURIComponent(sessionId)).then((r) => r.json())).doc?.header?.cwd ?? "";
	} catch {
		cwd = "";
	}
	if (cwd === "") return;
	try {
		await fetch("/api/track/graph/build-all", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				cwd,
				max_sessions: 200
			})
		});
	} catch {}
	notifyGraphBuilt();
}
function restoreLayout() {
	if (host === null) return;
	host.candidate.classList.remove("inv-host");
	if (host.header !== null) host.header.classList.remove("inv-host-header");
	if (host.headerWrapper !== null) host.headerWrapper.classList.remove("inv-host-header");
	if (host.scrollBody !== null) host.scrollBody.classList.remove("inv-host-scroll");
	if (prior.display !== void 0) host.candidate.style.display = prior.display;
	if (prior.gridColumns !== void 0) host.candidate.style.gridTemplateColumns = prior.gridColumns;
	if (prior.gridRows !== void 0) host.candidate.style.gridTemplateRows = prior.gridRows;
}
function setPanelOpen(open) {
	panelOpen = open;
	if (panel !== null) panel.hidden = !open;
	if (fab !== null) fab.hidden = open;
	try {
		localStorage.setItem(OPEN_KEY, open ? "1" : "0");
	} catch {}
	if (open) syncGrid();
	else if (host !== null) restoreLayout();
}
/** Programmatic entry for the composer-dock strip: ensure the host is
*  mounted (fresh pages may not have attached yet) and open the panel. */
function openTrackPanel() {
	if (host === null) tryMount();
	setPanelOpen(true);
}
function attach(candidate, header, tablist) {
	if (host?.candidate === candidate) return;
	restoreLayout();
	const scrollBody = candidate.querySelector("[data-conversation-scroll]");
	const headerWrapper = header !== null && header.parentElement !== candidate ? header.parentElement : null;
	host = {
		candidate,
		header,
		headerWrapper,
		scrollBody,
		tablist
	};
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
		scrollMinWidth: scrollBody?.style.minWidth
	};
	candidate.classList.add("inv-host");
	candidate.style.gridTemplateColumns = "minmax(0, 2fr) minmax(0, 1fr)";
	if (header !== null) header.classList.add("inv-host-header");
	if (headerWrapper !== null) headerWrapper.classList.add("inv-host-header");
	if (scrollBody !== null) scrollBody.classList.add("inv-host-scroll");
	if (panel !== null) {
		if (panel.isConnected) panel.remove();
		candidate.append(panel);
	}
	syncGrid();
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
function locateHost() {
	const sessionTablist = [...document.querySelectorAll("[role=\"tablist\"]")].find((tl) => [...tl.querySelectorAll(":scope > button[role=\"tab\"]")].some((tab) => {
		const text = tab.textContent?.trim();
		return text === "Trajectory" || text === "轨迹";
	}));
	const tablists = document.querySelectorAll("[role=\"tablist\"]");
	const tablist = sessionTablist ?? tablists[0] ?? null;
	if (tablist !== null) {
		const header = tablist.closest("header");
		if (header instanceof HTMLElement && header.parentElement instanceof HTMLElement) {
			let candidate = header.parentElement;
			for (let depth = 0; candidate !== null && depth < 6; depth++) {
				const scrollBody = candidate.querySelector("[data-conversation-scroll]");
				if (scrollBody !== null) return {
					candidate,
					header,
					headerWrapper: header.parentElement !== candidate ? header.parentElement : null,
					scrollBody,
					tablist
				};
				candidate = candidate.parentElement;
			}
			return {
				candidate: header.parentElement,
				header,
				headerWrapper: null,
				scrollBody: header.parentElement.querySelector("[data-conversation-scroll]"),
				tablist
			};
		}
	}
	const scroll = document.querySelector("[data-conversation-scroll]");
	if (scroll instanceof HTMLElement && scroll.parentElement instanceof HTMLElement) {
		const root = scroll.parentElement;
		return {
			candidate: root,
			header: root.querySelector("header"),
			headerWrapper: null,
			scrollBody: scroll,
			tablist: root.querySelector("[role=\"tablist\"]")
		};
	}
	return null;
}
function tryMount() {
	if (host !== null && host.candidate.isConnected) {
		if (panel !== null && panel.parentElement !== host.candidate) host.candidate.append(panel);
		const liveTablist = host.candidate.querySelector("[role=\"tablist\"]");
		if (liveTablist !== null) host.tablist = liveTablist;
		host.candidate.classList.add("inv-host");
		if (host.header !== null) host.header.classList.add("inv-host-header");
		if (host.headerWrapper !== null) host.headerWrapper.classList.add("inv-host-header");
		if (host.scrollBody !== null) host.scrollBody.classList.add("inv-host-scroll");
		syncGrid();
		return;
	}
	restoreLayout();
	host = null;
	const h = locateHost();
	if (h !== null) {
		attach(h.candidate, h.header, h.tablist);
		setPanelOpen(readOpenState());
	}
}
/** Build the panel DOM, FAB, and wire events. Returns a disposer.
*  @param ctx - client root context (needed for the jump-back links:
*  `ctx.sessions.open` / `binding` resolve the source conversation). */
function mountRightPanel(ctx) {
	clientCtx = ctx;
	const style = document.createElement("style");
	style.textContent = PANEL_CSS;
	document.head.appendChild(style);
	panel = document.createElement("aside");
	panel.id = PANEL_ID;
	panel.hidden = true;
	panel.innerHTML = buildPanelHtml();
	fab = document.createElement("button");
	fab.id = FAB_ID;
	fab.type = "button";
	fab.title = "Track";
	fab.textContent = "◆";
	fab.hidden = false;
	document.body.appendChild(fab);
	panel.querySelector(".inv-close")?.addEventListener("click", () => setPanelOpen(false));
	panel.querySelector(".inv-refresh")?.addEventListener("click", () => refresh());
	const settingsPanel = panel.querySelector(".inv-settings-panel");
	const loadConfig = (cfg) => {
		settingsPanel?.querySelectorAll(".inv-set").forEach((el) => {
			const key = el.dataset.set;
			if (key && cfg[key] !== void 0) el.value = String(cfg[key]);
		});
	};
	panel.querySelector(".inv-settings")?.addEventListener("click", () => {
		if (settingsPanel === null) return;
		settingsPanel.hidden = !settingsPanel.hidden;
		if (!settingsPanel.hidden) fetch("/api/track/config").then((r) => r.json()).then((d) => loadConfig(d.config ?? {}));
	});
	panel.querySelector(".inv-save-config")?.addEventListener("click", () => {
		const patch = {};
		settingsPanel?.querySelectorAll(".inv-set").forEach((el) => {
			const key = el.dataset.set;
			if (!key) return;
			const v = el.type === "number" ? Number(el.value) : el.value;
			if (el.type === "number" ? Number.isFinite(v) : v !== "") patch[key] = v;
		});
		fetch("/api/track/config", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(patch)
		}).then((r) => r.json()).then((d) => {
			if (d.ok && d.config) loadConfig(d.config);
		});
	});
	const captureBtn = panel.querySelector(".inv-capture");
	const inputEl = panel.querySelector(".inv-input");
	const doCapture = () => {
		const content = inputEl?.value.trim();
		if (!content) return;
		fetch("/api/track/captures", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				content,
				tags: []
			})
		}).then(() => {
			if (inputEl) inputEl.value = "";
			refresh();
		});
	};
	captureBtn?.addEventListener("click", doCapture);
	inputEl?.addEventListener("keydown", (e) => {
		if (e.key === "Enter") doCapture();
	});
	const onAction = (e) => {
		if (panel === null) return;
		const target = e.target;
		const issuePageBtn = target.closest(".inv-issue-page");
		if (issuePageBtn !== null && !issuePageBtn.disabled) {
			const page = Number(issuePageBtn.dataset.issuePage);
			if (Number.isInteger(page) && page >= 0) {
				issuePage = page;
				expandedIssueId = null;
				refresh("issues");
			}
			return;
		}
		const pageBtn = target.closest(".inv-page");
		if (pageBtn !== null && !pageBtn.disabled) {
			const page = Number(pageBtn.dataset.page);
			if (Number.isInteger(page) && page >= 0) {
				capturePage = page;
				refresh("captures");
			}
			return;
		}
		const selBox = target.closest("[data-issue-sel]");
		if (selBox !== null) {
			const id = selBox.getAttribute("data-issue-sel");
			if (id) {
				if (batchSelected.has(id)) batchSelected.delete(id);
				else batchSelected.add(id);
				batchConfirmTo = null;
				refresh();
			}
			return;
		}
		if (target.closest("[data-batch-toggle]") !== null) {
			batchMode = !batchMode;
			batchSelected.clear();
			batchConfirmTo = null;
			confirmIssueAction = null;
			refresh();
			return;
		}
		if (target.closest("[data-batch-done]") !== null) {
			batchConfirmTo = "done";
			refresh();
			return;
		}
		if (target.closest("[data-batch-cancel]") !== null) {
			batchConfirmTo = "canceled";
			refresh();
			return;
		}
		if (target.closest("[data-batch-commit]") !== null) {
			const to = batchConfirmTo;
			const ids = [...batchSelected];
			batchConfirmTo = null;
			batchSelected.clear();
			if (to !== null && ids.length > 0) fetch("/api/track/issues/batch", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					ids,
					to
				})
			}).catch(() => void 0).then(() => refresh());
			else refresh();
			return;
		}
		if (target.closest("[data-batch-clear]") !== null) {
			batchSelected.clear();
			batchConfirmTo = null;
			refresh();
			return;
		}
		const issueDoneAsk = target.closest("[data-issue-done-ask]");
		if (issueDoneAsk !== null) {
			const id = issueDoneAsk.getAttribute("data-issue-done-ask");
			if (id) confirmIssueAction = {
				id,
				to: "done"
			};
			refresh();
			return;
		}
		const issueCancelAsk = target.closest("[data-issue-cancel-ask]");
		if (issueCancelAsk !== null) {
			const id = issueCancelAsk.getAttribute("data-issue-cancel-ask");
			if (id) confirmIssueAction = {
				id,
				to: "canceled"
			};
			refresh();
			return;
		}
		const issueActionYes = target.closest("[data-issue-action-yes]");
		if (issueActionYes !== null) {
			const id = issueActionYes.getAttribute("data-issue-action-yes");
			const to = issueActionYes.getAttribute("data-to");
			const action = confirmIssueAction;
			confirmIssueAction = null;
			if (id && (to === "done" || to === "canceled") && action !== null && action.id === id) fetch(`/api/track/issues/${encodeURIComponent(id)}/confirm`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ to })
			}).then(() => refresh());
			else refresh();
			return;
		}
		const toggle = target.closest("[data-issue-toggle]");
		if (toggle !== null) {
			const id = toggle.getAttribute("data-issue-toggle");
			if (id) {
				expandedIssueId = expandedIssueId === id ? null : id;
				refresh();
			}
			return;
		}
		const jump = target.closest("[data-jump-session]");
		if (jump !== null) {
			jumpToConversation({
				sessionId: jump.getAttribute("data-jump-session") ?? void 0,
				messageId: jump.getAttribute("data-jump-message") || void 0
			});
			return;
		}
		const delAsk = target.closest("[data-capture-del-ask]");
		if (delAsk !== null) {
			confirmCaptureDeleteId = delAsk.getAttribute("data-capture-del-ask");
			refresh();
			return;
		}
		const delYes = target.closest("[data-capture-del]");
		if (delYes !== null) {
			const id = delYes.getAttribute("data-capture-del");
			confirmCaptureDeleteId = null;
			if (id) fetch(`/api/track/captures/${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => refresh());
			else refresh();
			return;
		}
		const promote = target.closest("[data-capture-promote]");
		if (promote !== null) {
			const id = promote.getAttribute("data-capture-promote");
			if (id) fetch(`/api/track/captures/${encodeURIComponent(id)}/promote`, { method: "POST" }).then(() => refresh());
			return;
		}
		const confirmBtn = target.closest("[data-confirm]");
		if (confirmBtn !== null) {
			const id = confirmBtn.getAttribute("data-confirm");
			const to = confirmBtn.getAttribute("data-to");
			if (id && (to === "done" || to === "canceled")) fetch(`/api/track/issues/${encodeURIComponent(id)}/confirm`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ to })
			}).then(() => refresh());
			return;
		}
		const dismissBtn = target.closest("[data-dismiss]");
		if (dismissBtn !== null) {
			const id = dismissBtn.getAttribute("data-dismiss");
			if (id) fetch(`/api/track/issues/${encodeURIComponent(id)}/dismiss`, { method: "POST" }).then(() => refresh());
			return;
		}
		const issueDelAsk = target.closest("[data-issue-del-ask]");
		if (issueDelAsk !== null) {
			confirmIssueDeleteId = issueDelAsk.getAttribute("data-issue-del-ask");
			refresh();
			return;
		}
		const issueDelYes = target.closest("[data-issue-del]");
		if (issueDelYes !== null) {
			const id = issueDelYes.getAttribute("data-issue-del");
			confirmIssueDeleteId = null;
			if (id) fetch(`/api/track/issues/${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => refresh());
			else refresh();
			return;
		}
		if (target.closest(".inv-graph-build") !== null) {
			buildCurrentGraph();
			return;
		}
		if (target.closest(".inv-graph-buildall") !== null) {
			buildAllGraphs();
			return;
		}
		const lineageBtn = target.closest("[data-lineage]");
		if (lineageBtn !== null) {
			const id = lineageBtn.getAttribute("data-lineage");
			if (id) {
				const box = panel?.querySelector("[data-lineage-box=\"" + id + "\"]");
				if (box !== null) {
					if (!box.hidden) {
						box.hidden = true;
						return;
					}
					box.hidden = false;
					box.innerHTML = "<div class=\"inv-empty\">加载中…</div>";
					fetch("/api/track/lineage?entity=" + encodeURIComponent(id)).then((r) => r.json()).then((d) => {
						if (d.view) box.innerHTML = renderLineageHtml(d.view, id);
						else box.innerHTML = "<div class=\"inv-empty\">暂无谱系数据</div>";
					}).catch(() => {
						box.innerHTML = "<div class=\"inv-empty\">加载失败</div>";
					});
				}
			}
			return;
		}
		if (target.closest("[data-capture-cancel], [data-issue-cancel]") !== null) {
			confirmCaptureDeleteId = null;
			confirmIssueDeleteId = null;
			confirmIssueAction = null;
			batchConfirmTo = null;
			refresh();
		}
	};
	panel.addEventListener("click", onAction);
	panel.addEventListener("keydown", (e) => {
		if (e.key !== "Enter") return;
		const input = e.target.closest("[data-page-input]");
		if (input === null) return;
		const kind = input.getAttribute("data-page-input");
		const page = Number(input.value);
		if (!Number.isInteger(page) || page < 1) return;
		if (kind === "capture") {
			capturePage = page - 1;
			refresh("captures");
		} else if (kind === "issue") {
			issuePage = page - 1;
			expandedIssueId = null;
			refresh("issues");
		}
	});
	const resizer = panel.querySelector(".inv-width-resizer");
	let dragStartX = 0;
	let dragStartWidth = 0;
	const widthMove = (e) => {
		const w = dragStartWidth + dragStartX - e.clientX;
		if (w < 220) return;
		panelWidthPx = w;
		syncGrid();
	};
	const widthUp = () => {
		window.removeEventListener("pointermove", widthMove);
		window.removeEventListener("pointerup", widthUp);
		if (panelWidthPx !== null) try {
			localStorage.setItem(WIDTH_KEY, String(panelWidthPx));
		} catch {}
	};
	resizer?.addEventListener("pointerdown", (e) => {
		e.preventDefault();
		dragStartX = e.clientX;
		dragStartWidth = panelWidthPx ?? 360;
		window.addEventListener("pointermove", widthMove);
		window.addEventListener("pointerup", widthUp);
	});
	fab.addEventListener("click", () => {
		setPanelOpen(!panelOpen);
	});
	panelWidthPx = readStoredNumber(WIDTH_KEY);
	const observer = new MutationObserver(tryMount);
	observer.observe(document.body, {
		childList: true,
		subtree: true
	});
	tryMount();
	refresh();
	const mountRetries = [
		500,
		1500,
		3e3
	].map((ms) => window.setTimeout(tryMount, ms));
	const autoRefresh = window.setInterval(() => {
		tryMount();
		if (panelOpen && !document.hidden) refresh();
	}, 2e4);
	const onFocus = () => {
		tryMount();
		refresh();
	};
	let unsubSessions;
	try {
		unsubSessions = clientCtx.sessions.list.subscribe(() => {
			if (panelOpen) refresh();
		});
	} catch {
		unsubSessions = void 0;
	}
	window.addEventListener("focus", onFocus);
	return () => {
		if (unsubSessions !== void 0) unsubSessions();
		observer.disconnect();
		mountRetries.forEach((id) => window.clearTimeout(id));
		window.clearInterval(autoRefresh);
		window.removeEventListener("focus", onFocus);
		restoreLayout();
		panel?.remove();
		fab?.remove();
		style.remove();
		panel = null;
		fab = null;
		host = null;
		clientCtx = null;
	};
}
//#endregion
//#region lib/client/calendar-yarn.js
/**
* Calendar-yarn view — 3 tabs (日历纱线 / 矩阵 / 会话表), ported from the
* dsh-track-calendar-yarn design. Yarn nodes = REQUIREMENTS (issues/captures)
* on a day×project grid; sessions thread their requirements. Key nodes are
* clickable to jump into the conversation.
* @module @fakechris/dsh-track/client/calendar-yarn
*/
const T = {
	bg: "#10151C",
	panel: "#171E27",
	panelHi: "#1D2632",
	line: "#26303C",
	text: "#D6DEE8",
	muted: "#74839A",
	faint: "#4A5568",
	mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
	sans: "-apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif"
};
const GOLD = "#E0B34E";
const UNK_HUE = "#5A6674";
const rgba = (hex, a) => {
	const n = parseInt(hex.slice(1), 16);
	return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
};
const OUTCOME_GLYPH = {
	completed: "✓",
	aborted: "⊘",
	error: "✕",
	blocked: "✕"
};
const dayLabelOf = (base, day) => {
	const t = new Date(base + day * 864e5);
	return String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
};
/** Yarn: x = days, lanes = projects (by event volume); nodes = REQUIREMENTS;
*  threads = sessions (bezier, gold diamond on lane switch). Layout follows the
*  track-calendar-fixed reference: lanes sorted by events, zero-activity repos
*  folded into '其他 ×N', greedy spiral packing per cell, self-adaptive sizing.
*/
function YarnView(props) {
	const { data, selId, setSelId, hover, setHover, onJump } = props;
	const base = Date.parse(data.dayBase);
	const wrapRef = (0, react.useRef)(null);
	const [, setSize] = (0, react.useState)(0);
	const [tangledOnly, setTangledOnly] = (0, react.useState)(false);
	const lanes = (0, react.useMemo)(() => {
		const evByProj = {};
		for (const r of data.requirements) evByProj[r.proj] = (evByProj[r.proj] ?? 0) + (r.events || 0);
		const actives = data.projects.filter((p) => evByProj[p.id]).sort((a, b) => evByProj[b.id] - evByProj[a.id]);
		const rest = data.projects.filter((p) => !evByProj[p.id]);
		return [
			...actives.map((p) => ({
				id: p.id,
				name: p.name,
				hue: p.hue,
				ev: evByProj[p.id]
			})),
			...rest.length > 0 ? [{
				id: "__other",
				name: "其他仓库 ×" + rest.length,
				hue: "#3A4656",
				ev: 0
			}] : [],
			...evByProj.unk !== void 0 ? [{
				id: "unk",
				name: "未归属",
				hue: UNK_HUE,
				ev: evByProj.unk
			}] : []
		];
	}, [data]);
	const laneIdx = (0, react.useMemo)(() => {
		const m = {};
		lanes.forEach((l, i) => {
			m[l.id] = i;
		});
		return m;
	}, [lanes]);
	const laneOf = (pid) => laneIdx[pid] !== void 0 ? pid : "__other";
	const hueOf = (pid) => pid === "unk" ? UNK_HUE : data.projects.find((p) => p.id === pid)?.hue ?? (pid === "__other" ? "#3A4656" : "#999");
	const reqByKey = (0, react.useMemo)(() => {
		const m = /* @__PURE__ */ new Map();
		for (const r of data.requirements) m.set(r.sessionId + "|" + r.day + "|" + r.req, r);
		return m;
	}, [data]);
	const sessOrder = (0, react.useMemo)(() => {
		const m = /* @__PURE__ */ new Map();
		for (const s of data.sessions) {
			const seen = /* @__PURE__ */ new Set();
			const list = [];
			for (const g of s.segments ?? []) {
				const r = reqByKey.get(s.id + "|" + g.day + "|" + g.req);
				if (r !== void 0 && !seen.has(r.id)) {
					seen.add(r.id);
					list.push(r);
				}
			}
			if (list.length > 0) m.set(s.id, list);
		}
		return m;
	}, [data, reqByKey]);
	const sessById = (0, react.useMemo)(() => new Map(data.sessions.map((s) => [s.id, s])), [data]);
	const pack = (items, halfW, halfH) => {
		const placed = [];
		for (const it of items) {
			let ok = false;
			for (let t = 0; t < 500 && !ok; t++) {
				const ang = t * 2.399963, rad = t === 0 ? 0 : 2.2 * Math.sqrt(t) + 2;
				let px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
				px = Math.max(-halfW + it.r + 2, Math.min(halfW - it.r - 2, px));
				py = Math.max(-halfH + it.r + 2, Math.min(halfH - it.r - 2, py));
				if (!placed.some((q) => {
					const dx = q.px - px, dy = q.py - py;
					return dx * dx + dy * dy < (q.r + it.r + 1.6) ** 2;
				})) {
					it.px = px;
					it.py = py;
					placed.push({
						px,
						py,
						r: it.r
					});
					ok = true;
				}
			}
			if (!ok) {
				it.px = 0;
				it.py = 0;
				placed.push({
					px: 0,
					py: 0,
					r: it.r
				});
			}
		}
	};
	(0, react.useEffect)(() => {
		const el = wrapRef.current;
		if (el === null) return;
		const ro = new ResizeObserver(() => setSize(el.clientWidth));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const availW = wrapRef.current?.clientWidth ?? 800;
	const availH = wrapRef.current?.clientHeight ?? 500;
	const TOP = 26;
	const dayW = Math.max(96, Math.floor((availW - 8) / Math.max(1, data.days)));
	const laneH = Math.max(96, Math.floor((availH - TOP - 8) / Math.max(1, lanes.length)));
	const W = data.days * dayW + 8;
	const H = TOP + lanes.length * laneH + 6;
	const laneY = (i) => TOP + i * laneH + laneH / 2;
	const focus = hover ?? (selId ? selId : null);
	const reqs = data.requirements;
	const threads = [...sessOrder.entries()].map(([sid, list]) => ({
		sid,
		list: list.filter((r) => reqs.includes(r))
	})).filter((t) => t.list.length >= 2);
	const tangledThreads = threads.filter((t) => new Set(t.list.map((r) => laneOf(r.proj))).size > 1);
	const visibleThreads = tangledOnly ? tangledThreads : threads;
	const visibleReqs = tangledOnly ? reqs.filter((r) => new Set(tangledThreads.flatMap((t) => t.list.map((x) => x.id))).has(r.id)) : reqs;
	const cells = /* @__PURE__ */ new Map();
	for (const r of visibleReqs) {
		const k = r.day + "|" + laneOf(r.proj);
		const list = cells.get(k) ?? [];
		list.push({
			r: 3 + Math.log2((r.events || 1) + 1) * 1.15,
			req: r
		});
		cells.set(k, list);
	}
	const pos = /* @__PURE__ */ new Map();
	for (const [k, items] of cells) {
		const [d, lid] = k.split("|");
		const dd = Number(d), li = laneIdx[lid] ?? 0;
		items.sort((a, b) => b.r - a.r);
		pack(items, dayW / 2, laneH / 2);
		for (const it of items) pos.set(it.req.id, {
			x: dd * dayW + dayW / 2 + (it.px ?? 0),
			y: laneY(li) + (it.py ?? 0),
			r: it.r
		});
	}
	const linkColor = {
		"forked-from": ["#9C82E0", void 0],
		derives: [GOLD, "4 4"],
		"executed-in": ["#3FA79B", "3 4"]
	};
	const laneName = (pid) => {
		const l = lanes.find((x) => x.id === laneOf(pid));
		return l ? l.name : pid;
	};
	let switchCount = 0;
	const gLinks = [];
	for (const l of data.links ?? []) {
		const ra = data.requirements.find((x) => x.id === l.from);
		const rb = l.toSession !== void 0 ? data.requirements.find((x) => x.id === l.to && x.sessionId === l.toSession) : data.requirements.find((x) => x.id === l.to);
		const a = ra ? pos.get(ra.id) : void 0;
		const b = rb ? pos.get(rb.id) : void 0;
		if (!a || !b || !ra || !rb) continue;
		const [c, da] = linkColor[l.kind] ?? ["#556", void 0];
		const mx = (a.x + b.x) / 2;
		const dim = focus !== null && focus !== ra.sessionId && focus !== rb.sessionId;
		gLinks.push((0, react_jsx_runtime.jsx)("path", {
			d: "M " + a.x + " " + a.y + " C " + mx + " " + a.y + ", " + mx + " " + b.y + ", " + b.x + " " + b.y,
			fill: "none",
			stroke: c,
			strokeOpacity: dim ? .12 : .55,
			strokeWidth: 1.2,
			strokeDasharray: da,
			opacity: 1
		}, "l" + l.from + l.to + l.kind));
	}
	const gThreads = [];
	for (const t of visibleThreads) {
		const dimmed = focus !== null && focus !== t.sid;
		const g = [];
		for (let i = 1; i < t.list.length; i++) {
			const a = pos.get(t.list[i - 1].id), b = pos.get(t.list[i].id);
			if (!a || !b) continue;
			const mx = (a.x + b.x) / 2;
			g.push((0, react_jsx_runtime.jsx)("path", {
				d: "M " + a.x + " " + a.y + " C " + mx + " " + a.y + ", " + mx + " " + b.y + ", " + b.x + " " + b.y,
				fill: "none",
				stroke: "#B9C4D2",
				strokeOpacity: dimmed ? .1 : .34,
				strokeWidth: 1.3
			}, "s" + i));
			if (laneOf(t.list[i - 1].proj) !== laneOf(t.list[i].proj)) {
				switchCount++;
				const sx = (a.x + b.x) / 2, sy = (a.y + b.y) / 2;
				g.push((0, react_jsx_runtime.jsx)("path", {
					d: "M " + sx + " " + (sy - 3.4) + " L " + (sx + 3.4) + " " + sy + " L " + sx + " " + (sy + 3.4) + " L " + (sx - 3.4) + " " + sy + " Z",
					fill: "#10151C",
					stroke: GOLD,
					strokeWidth: 1.2
				}, "sw" + i));
			}
		}
		gThreads.push((0, react_jsx_runtime.jsx)("g", {
			className: "thread",
			"data-sid": t.sid,
			style: { cursor: "pointer" },
			opacity: dimmed ? .3 : 1,
			onMouseEnter: () => setHover(t.sid),
			onMouseLeave: () => setHover(null),
			onClick: () => setSelId(selId === t.sid ? null : t.sid),
			children: g
		}, "t" + t.sid));
	}
	const gNodes = [];
	for (const r of visibleReqs) {
		const p = pos.get(r.id);
		if (!p) continue;
		const dimmed = focus !== null && focus !== r.sessionId;
		const hue = hueOf(r.proj);
		const pname = r.proj === "unk" ? "未归属" : laneName(r.proj);
		gNodes.push((0, react_jsx_runtime.jsx)("g", {
			"data-sid": r.sessionId,
			style: { cursor: "pointer" },
			opacity: dimmed ? .14 : 1,
			onMouseEnter: () => setHover(r.sessionId),
			onMouseLeave: () => setHover(null),
			onClick: () => setSelId(selId === r.sessionId ? null : r.sessionId),
			children: (0, react_jsx_runtime.jsx)("circle", {
				cx: p.x,
				cy: p.y,
				r: p.r,
				fill: rgba(hue, .9),
				stroke: "#10151C",
				strokeWidth: 1,
				children: (0, react_jsx_runtime.jsx)("title", { children: r.req + " · " + pname + " · " + (r.events || 0) + " events · " + dayLabelOf(base, r.day) + " · " + r.origin })
			})
		}, r.id));
	}
	const laneBands = [];
	const laneLabels = [];
	lanes.forEach((l, i) => {
		laneBands.push((0, react_jsx_runtime.jsxs)("g", { children: [(0, react_jsx_runtime.jsx)("rect", {
			x: 0,
			y: TOP + i * laneH,
			width: W,
			height: laneH,
			fill: l.id === "unk" ? "rgba(90,102,116,0.05)" : rgba(l.hue, i % 2 ? .05 : .03)
		}), (0, react_jsx_runtime.jsx)("line", {
			x1: 0,
			y1: TOP + i * laneH,
			x2: W,
			y2: TOP + i * laneH,
			stroke: "#1C242F",
			strokeWidth: .7
		})] }, "lb" + l.id));
		laneLabels.push((0, react_jsx_runtime.jsxs)("div", {
			style: {
				position: "absolute",
				top: laneY(i) - 14,
				right: 10,
				fontFamily: T.mono,
				fontSize: 10.5,
				textAlign: "right",
				lineHeight: 1.3,
				color: l.hue
			},
			children: [l.name.length > 14 ? l.name.slice(0, 14) + "…" : l.name, l.ev !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
				style: {
					fontSize: 8.5,
					color: T.faint
				},
				children: [l.ev.toLocaleString(), " ev"]
			})]
		}, l.id));
	});
	const dayLines = [];
	for (let d = 0; d < data.days; d++) dayLines.push((0, react_jsx_runtime.jsxs)("g", { children: [(0, react_jsx_runtime.jsx)("line", {
		x1: d * dayW,
		y1: TOP,
		x2: d * dayW,
		y2: H - 4,
		stroke: "#1C242F",
		strokeWidth: .7
	}), (0, react_jsx_runtime.jsx)("text", {
		x: d * dayW + dayW / 2,
		y: 15,
		textAnchor: "middle",
		fill: T.faint,
		fontSize: 9,
		fontFamily: T.mono,
		children: dayLabelOf(base, d)
	})] }, "d" + d));
	selId !== null && sessById.get(selId);
	return (0, react_jsx_runtime.jsxs)("div", {
		style: {
			display: "flex",
			flexDirection: "column",
			height: "100%",
			minHeight: 0
		},
		children: [(0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: "4px 12px",
				borderBottom: "1px solid " + T.line,
				flexShrink: 0,
				fontFamily: T.mono,
				fontSize: 10,
				color: T.muted
			},
			children: [
				(0, react_jsx_runtime.jsxs)("span", { children: [visibleReqs.length, " 需求"] }),
				(0, react_jsx_runtime.jsxs)("span", { children: [visibleThreads.length, " 会话线"] }),
				(0, react_jsx_runtime.jsxs)("span", {
					style: { color: GOLD },
					children: [tangledThreads.length, " 缠绕线"]
				}),
				(0, react_jsx_runtime.jsxs)("span", { children: ["切换点 ", switchCount] }),
				(0, react_jsx_runtime.jsxs)("button", {
					onClick: () => setTangledOnly(!tangledOnly),
					style: {
						marginLeft: "auto",
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						cursor: "pointer",
						background: tangledOnly ? rgba(GOLD, .14) : "transparent",
						border: "1px solid " + (tangledOnly ? rgba(GOLD, .5) : T.line),
						color: tangledOnly ? T.text : T.faint,
						borderRadius: 3,
						padding: "1px 7px",
						fontFamily: T.mono,
						fontSize: 10
					},
					children: [(0, react_jsx_runtime.jsx)("span", { style: {
						width: 7,
						height: 7,
						borderRadius: 2,
						background: tangledOnly ? GOLD : T.faint
					} }), "只看缠绕线"]
				})
			]
		}), (0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "flex",
				flex: 1,
				minHeight: 0
			},
			children: [(0, react_jsx_runtime.jsx)("div", {
				style: {
					width: 118,
					flexShrink: 0,
					position: "relative",
					borderRight: "1px solid " + T.line,
					overflow: "hidden"
				},
				children: laneLabels
			}), (0, react_jsx_runtime.jsx)("div", {
				ref: wrapRef,
				style: {
					flex: 1,
					overflow: "auto",
					minWidth: 0
				},
				children: (0, react_jsx_runtime.jsxs)("svg", {
					width: W,
					height: H,
					style: { display: "block" },
					children: [
						laneBands,
						dayLines,
						gLinks,
						gThreads,
						gNodes
					]
				})
			})]
		})]
	});
}
/** Drill-down: the session's segment sequence (◆需求 ▷指示 ✓⊘✕结局 ⚙工具). */
function SegmentDrawer(props) {
	const { s, data, onJump, onClose } = props;
	const base = Date.parse(data.dayBase);
	const hueOf = (pid) => pid === "unk" ? UNK_HUE : data.projects.find((p) => p.id === pid)?.hue ?? "#999";
	return (0, react_jsx_runtime.jsxs)("div", {
		style: {
			borderTop: "1px solid " + T.line,
			background: T.panel,
			flexShrink: 0,
			maxHeight: "42%",
			overflowY: "auto"
		},
		children: [(0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "flex",
				alignItems: "baseline",
				gap: 14,
				padding: "8px 16px 4px",
				flexWrap: "wrap"
			},
			children: [
				(0, react_jsx_runtime.jsx)("span", {
					style: {
						fontFamily: T.mono,
						fontSize: 12,
						color: T.text
					},
					children: s.id.slice(0, 14)
				}),
				(0, react_jsx_runtime.jsx)("button", {
					onClick: () => onJump({ sessionId: s.id }),
					style: {
						fontFamily: T.mono,
						fontSize: 10.5,
						color: "#5B8DE0",
						background: "transparent",
						border: "1px solid " + T.line,
						borderRadius: 3,
						padding: "1px 8px",
						cursor: "pointer"
					},
					children: "↩ 打开对话"
				}),
				(0, react_jsx_runtime.jsxs)("span", {
					style: {
						fontFamily: T.mono,
						fontSize: 10.5,
						color: T.muted
					},
					children: [
						"跨 ",
						s.activeDays[s.activeDays.length - 1] - s.startDay + 1,
						" 天（活跃 ",
						s.activeDays.length,
						"）"
					]
				}),
				(0, react_jsx_runtime.jsxs)("span", {
					style: {
						fontFamily: T.mono,
						fontSize: 10.5,
						color: T.muted
					},
					children: [
						"需求 ",
						s.nReq,
						" · 指示 ",
						s.nInstr,
						" · 项目切换 ",
						(0, react_jsx_runtime.jsx)("span", {
							style: { color: s.switches ? GOLD : T.faint },
							children: s.switches
						}),
						" 次"
					]
				}),
				(0, react_jsx_runtime.jsx)("span", {
					style: {
						display: "inline-flex",
						gap: 4
					},
					children: s.projects.map((pid) => (0, react_jsx_runtime.jsx)("span", { style: {
						width: 9,
						height: 9,
						borderRadius: 2,
						background: hueOf(pid)
					} }, pid))
				}),
				(0, react_jsx_runtime.jsx)("span", {
					style: {
						marginLeft: "auto",
						fontFamily: T.mono,
						fontSize: 9.5,
						color: T.faint
					},
					children: "颜色=项目 · ◆需求 ▷指示 · ✓完成 ⊘中止 ✕报错"
				}),
				(0, react_jsx_runtime.jsx)("button", {
					onClick: onClose,
					style: {
						background: "none",
						border: "1px solid " + T.line,
						borderRadius: 4,
						color: T.muted,
						fontFamily: T.mono,
						fontSize: 10,
						padding: "2px 8px",
						cursor: "pointer"
					},
					children: "收起"
				})
			]
		}), (0, react_jsx_runtime.jsx)("div", {
			style: {
				display: "flex",
				gap: 14,
				padding: "0 16px 8px",
				overflowX: "auto",
				alignItems: "flex-end"
			},
			children: s.activeDays.map((day) => {
				const segs = s.segments.filter((g) => g.day === day);
				return (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 4,
						minWidth: 0
					},
					children: [
						(0, react_jsx_runtime.jsx)("div", {
							style: {
								fontFamily: T.mono,
								fontSize: 9,
								color: T.faint,
								marginBottom: 2
							},
							children: dayLabelOf(base, day)
						}),
						segs.length === 0 && (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontFamily: T.mono,
								fontSize: 9,
								color: T.faint
							},
							children: "—"
						}),
						segs.map((g, k) => {
							const w = Math.min(180, Math.max(64, g.events * 1.6));
							const hue = hueOf(g.proj);
							return (0, react_jsx_runtime.jsxs)("div", {
								style: {
									width: w,
									borderLeft: "3px solid " + hue,
									background: rgba(hue, .08),
									borderRadius: 2,
									padding: "4px 6px",
									flexShrink: 0
								},
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											alignItems: "center",
											gap: 4,
											fontSize: 10.5,
											fontFamily: T.sans,
											color: T.text
										},
										children: [(0, react_jsx_runtime.jsx)("span", {
											style: { color: hue },
											children: "◆"
										}), (0, react_jsx_runtime.jsx)("button", {
											onClick: () => onJump({
												sessionId: s.id,
												messageId: g.reqMessageId
											}),
											style: {
												flex: 1,
												textAlign: "left",
												background: "none",
												border: "none",
												color: T.text,
												cursor: g.reqMessageId ? "pointer" : "default",
												fontSize: 10.5,
												padding: 0,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap"
											},
											title: g.req,
											children: g.req.length > 16 ? g.req.slice(0, 16) + "…" : g.req
										})]
									}),
									g.instr.slice(0, 3).map((d, di) => (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											alignItems: "center",
											gap: 4,
											fontSize: 9.5,
											color: T.muted,
											marginTop: 1
										},
										children: [(0, react_jsx_runtime.jsx)("span", {
											style: { color: T.faint },
											children: "▷"
										}), (0, react_jsx_runtime.jsx)("button", {
											onClick: () => onJump({
												sessionId: s.id,
												messageId: d.messageId
											}),
											style: {
												background: "none",
												border: "none",
												color: T.muted,
												cursor: d.messageId ? "pointer" : "default",
												fontSize: 9.5,
												padding: 0,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap"
											},
											title: d.text,
											children: d.text.length > 14 ? d.text.slice(0, 14) + "…" : d.text
										})]
									}, di)),
									g.instr.length > 3 && (0, react_jsx_runtime.jsxs)("div", {
										style: {
											fontSize: 9,
											color: T.faint,
											marginTop: 1
										},
										children: [
											"+",
											g.instr.length - 3,
											" 指示"
										]
									}),
									(0, react_jsx_runtime.jsx)("div", {
										style: {
											display: "flex",
											gap: 2,
											marginTop: 3,
											fontSize: 10,
											color: T.faint
										},
										children: g.turns.length === 0 ? (0, react_jsx_runtime.jsx)("span", {
											style: { color: T.faint },
											children: "—"
										}) : g.turns.slice(0, 8).map((t, ti) => (0, react_jsx_runtime.jsx)("span", {
											style: { color: OUTCOME_GLYPH[t.outcome] === "✕" ? "#E06A6A" : T.muted },
											children: OUTCOME_GLYPH[t.outcome]
										}, ti))
									}),
									g.tools.length > 0 && (0, react_jsx_runtime.jsxs)("div", {
										style: {
											fontSize: 9,
											color: T.faint,
											marginTop: 2,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap"
										},
										children: ["⚙ ", g.tools.join(" · ")]
									})
								]
							}, k);
						})
					]
				}, day);
			})
		})]
	});
}
/** 矩阵: sessions × project lanes, cell intensity ∝ events, 切换 column. */
function MatrixView(props) {
	const { data, selId, setSelId } = props;
	const base = Date.parse(data.dayBase);
	const lanes = [...data.projects, {
		id: "unk",
		name: "未归属",
		hue: UNK_HUE
	}];
	const rows = data.sessions.slice().sort((a, b) => b.switches - a.switches || b.nReq - a.nReq);
	const maxV = Math.max(1, ...rows.map((s) => Math.max(1, ...lanes.map((p) => s.segments.filter((g) => g.proj === p.id).reduce((a, g) => a + g.events, 0)))));
	const hueOf = (pid) => pid === "unk" ? UNK_HUE : data.projects.find((p) => p.id === pid)?.hue ?? "#999";
	return (0, react_jsx_runtime.jsx)("div", {
		style: {
			overflow: "auto",
			height: "100%",
			padding: "14px 18px"
		},
		children: (0, react_jsx_runtime.jsxs)("table", {
			style: {
				borderCollapse: "collapse",
				fontFamily: T.mono,
				fontSize: 10.5
			},
			children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
				(0, react_jsx_runtime.jsx)("th", {
					style: {
						position: "sticky",
						top: 0,
						background: T.bg,
						textAlign: "left",
						padding: "4px 10px 8px 0",
						color: T.muted,
						fontWeight: 400
					},
					children: "session"
				}),
				lanes.map((p) => (0, react_jsx_runtime.jsx)("th", {
					style: {
						position: "sticky",
						top: 0,
						background: T.bg,
						padding: "4px 4px 8px",
						fontWeight: 400
					},
					children: (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: p.hue,
							writingMode: "vertical-rl",
							transform: "rotate(180deg)",
							margin: "0 auto",
							fontSize: 10
						},
						children: p.name.length > 10 ? p.name.slice(0, 10) + "…" : p.name
					})
				}, p.id)),
				(0, react_jsx_runtime.jsx)("th", {
					style: {
						position: "sticky",
						top: 0,
						background: T.bg,
						color: GOLD,
						padding: "4px 8px 8px",
						fontWeight: 400
					},
					children: "切换"
				})
			] }) }), (0, react_jsx_runtime.jsx)("tbody", { children: rows.map((s) => {
				const isSel = selId === s.id;
				return (0, react_jsx_runtime.jsxs)("tr", {
					onClick: () => setSelId(isSel ? null : s.id),
					style: {
						cursor: "pointer",
						background: isSel ? T.panelHi : "transparent"
					},
					children: [
						(0, react_jsx_runtime.jsxs)("td", {
							style: {
								padding: "1px 10px 1px 0",
								color: isSel ? T.text : T.muted,
								whiteSpace: "nowrap"
							},
							children: [
								s.id.slice(0, 14),
								" ",
								(0, react_jsx_runtime.jsx)("span", {
									style: { color: T.faint },
									children: dayLabelOf(base, s.startDay)
								})
							]
						}),
						lanes.map((p) => {
							const v = s.segments.filter((g) => g.proj === p.id).reduce((a, g) => a + g.events, 0);
							return (0, react_jsx_runtime.jsx)("td", {
								style: { padding: 1 },
								children: (0, react_jsx_runtime.jsx)("div", {
									title: v ? p.name + " · " + v + " events" : "",
									style: {
										width: 26,
										height: 15,
										borderRadius: 2,
										background: v ? rgba(hueOf(p.id), .15 + .85 * Math.sqrt(v / maxV)) : "#161C25",
										outline: isSel && v ? "1px solid " + hueOf(p.id) : "none"
									}
								})
							}, p.id);
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: {
								textAlign: "center",
								color: s.switches ? GOLD : T.faint
							},
							children: s.switches || "·"
						})
					]
				}, s.id);
			}) })]
		})
	});
}
/** 会话表: ID / 存续 / 首个需求 / 需求 / 指示 / 项目 / 切换. */
function TableView(props) {
	const { data, selId, setSelId, onJump } = props;
	const base = Date.parse(data.dayBase);
	const hueOf = (pid) => pid === "unk" ? UNK_HUE : data.projects.find((p) => p.id === pid)?.hue ?? "#999";
	const th = {
		textAlign: "left",
		padding: "6px 14px 8px 0",
		color: T.muted,
		fontWeight: 400,
		fontFamily: T.mono,
		fontSize: 10,
		letterSpacing: 1.2,
		borderBottom: "1px solid " + T.line,
		position: "sticky",
		top: 0,
		background: T.bg
	};
	const rows = data.sessions.slice().sort((a, b) => b.switches - a.switches || b.nReq - a.nReq);
	return (0, react_jsx_runtime.jsx)("div", {
		style: {
			overflow: "auto",
			height: "100%",
			padding: "6px 18px"
		},
		children: (0, react_jsx_runtime.jsxs)("table", {
			style: {
				borderCollapse: "collapse",
				width: "100%",
				fontFamily: T.sans,
				fontSize: 12.5
			},
			children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
				(0, react_jsx_runtime.jsx)("th", {
					style: th,
					children: "ID"
				}),
				(0, react_jsx_runtime.jsx)("th", {
					style: th,
					children: "存续"
				}),
				(0, react_jsx_runtime.jsx)("th", {
					style: th,
					children: "首个需求"
				}),
				(0, react_jsx_runtime.jsx)("th", {
					style: {
						...th,
						textAlign: "right"
					},
					children: "需求"
				}),
				(0, react_jsx_runtime.jsx)("th", {
					style: {
						...th,
						textAlign: "right"
					},
					children: "指示"
				}),
				(0, react_jsx_runtime.jsx)("th", {
					style: th,
					children: "项目"
				}),
				(0, react_jsx_runtime.jsx)("th", {
					style: {
						...th,
						textAlign: "right"
					},
					children: "切换"
				})
			] }) }), (0, react_jsx_runtime.jsx)("tbody", { children: rows.map((s) => {
				const isSel = selId === s.id;
				const span = s.activeDays[s.activeDays.length - 1] - s.startDay + 1;
				const first = s.segments[0];
				return (0, react_jsx_runtime.jsxs)("tr", {
					onClick: () => setSelId(isSel ? null : s.id),
					style: {
						cursor: "pointer",
						background: isSel ? T.panelHi : "transparent",
						borderBottom: "1px solid #1B222C"
					},
					children: [
						(0, react_jsx_runtime.jsx)("td", {
							style: {
								padding: "7px 14px 7px 0",
								fontFamily: T.mono,
								fontSize: 11,
								color: T.muted
							},
							children: s.id.slice(0, 12)
						}),
						(0, react_jsx_runtime.jsxs)("td", {
							style: {
								padding: "7px 14px 7px 0",
								fontFamily: T.mono,
								fontSize: 11,
								color: T.muted
							},
							children: [
								dayLabelOf(base, s.startDay),
								" 起 ",
								span,
								" 天",
								span > 1 ? " · 活跃 " + s.activeDays.length : ""
							]
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: {
								padding: "7px 14px 7px 0",
								color: T.text,
								maxWidth: 260,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: first && (0, react_jsx_runtime.jsxs)("button", {
								onClick: (ev) => {
									ev.stopPropagation();
									onJump({
										sessionId: s.id,
										messageId: first.reqMessageId
									});
								},
								style: {
									background: "none",
									border: "none",
									color: T.text,
									cursor: first.reqMessageId ? "pointer" : "default",
									padding: 0,
									fontSize: 12.5,
									fontFamily: T.sans
								},
								children: ["◆ ", first.req.length > 28 ? first.req.slice(0, 28) + "…" : first.req]
							})
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: {
								padding: "7px 14px 7px 0",
								textAlign: "right",
								fontFamily: T.mono,
								color: T.muted
							},
							children: s.nReq
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: {
								padding: "7px 14px 7px 0",
								textAlign: "right",
								fontFamily: T.mono,
								color: T.muted
							},
							children: s.nInstr
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: { padding: "7px 14px 7px 0" },
							children: s.projects.map((pid) => (0, react_jsx_runtime.jsx)("span", {
								style: {
									display: "inline-block",
									width: 9,
									height: 9,
									borderRadius: 2,
									background: hueOf(pid),
									marginRight: 4
								},
								title: pid
							}, pid))
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: {
								padding: "7px 0",
								textAlign: "right",
								fontFamily: T.mono,
								color: s.switches ? GOLD : T.faint
							},
							children: s.switches || "·"
						})
					]
				}, s.id);
			}) })]
		})
	});
}
/** Root: 3 tabs + header + filters + drill-down. */
function CalendarYarnRoot(props) {
	const { data, onJump } = props;
	const [tab, setTab] = (0, react.useState)("yarn");
	const [activeP, setActiveP] = (0, react.useState)(/* @__PURE__ */ new Set());
	const [originOn, setOriginOn] = (0, react.useState)({
		user: true,
		subagent: false,
		auto: false
	});
	const [onlyTangled, setOnlyTangled] = (0, react.useState)(false);
	const [onlyMultiDay, setOnlyMultiDay] = (0, react.useState)(false);
	const [selId, setSelId] = (0, react.useState)(null);
	const [hover, setHover] = (0, react.useState)(null);
	const toggleP = (id) => setActiveP((prev) => {
		const n = new Set(prev);
		n.has(id) ? n.delete(id) : n.add(id);
		return n;
	});
	const list = (0, react.useMemo)(() => data.sessions.filter((s) => originOn[s.origin] && (activeP.size === 0 || s.projects.some((p) => activeP.has(p))) && (!onlyTangled || s.projects.length > 1) && (!onlyMultiDay || s.activeDays.length > 1)), [
		data,
		activeP,
		originOn,
		onlyTangled,
		onlyMultiDay
	]);
	const reqList = (0, react.useMemo)(() => data.requirements.filter((r) => list.some((s) => s.id === r.sessionId)), [data, list]);
	const tangled = list.filter((s) => s.projects.length > 1);
	const totReq = list.reduce((a, s) => a + s.nReq, 0);
	const totIns = list.reduce((a, s) => a + s.nInstr, 0);
	const sel = selId !== null ? data.sessions.find((s) => s.id === selId) ?? null : null;
	return (0, react_jsx_runtime.jsxs)("div", {
		style: {
			height: "100%",
			display: "flex",
			flexDirection: "column",
			background: T.bg,
			color: T.text,
			fontFamily: T.sans,
			minWidth: 0
		},
		children: [
			(0, react_jsx_runtime.jsxs)("div", {
				style: {
					borderBottom: "1px solid " + T.line,
					padding: "10px 18px 0",
					flexShrink: 0
				},
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "baseline",
							gap: 14,
							flexWrap: "wrap"
						},
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								style: {
									fontFamily: T.mono,
									fontSize: 14,
									letterSpacing: 1
								},
								children: [
									"dsh-track",
									(0, react_jsx_runtime.jsx)("span", {
										style: { color: T.faint },
										children: " / "
									}),
									(0, react_jsx_runtime.jsx)("span", {
										style: { color: T.muted },
										children: "日历纱线"
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								style: {
									fontFamily: T.mono,
									fontSize: 10.5,
									color: T.muted
								},
								children: [
									list.length,
									" sessions · ",
									(0, react_jsx_runtime.jsxs)("span", {
										style: { color: GOLD },
										children: [tangled.length, " 缠绕"]
									}),
									" · 需求 ",
									totReq,
									" · 指示 ",
									totIns
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								style: {
									fontFamily: T.mono,
									fontSize: 10,
									color: T.faint
								},
								children: [
									"用户 ",
									data.sessions.filter((s) => s.origin === "user").length,
									" · 子代理 ",
									data.sessions.filter((s) => s.origin === "subagent").length,
									" · 自动 ",
									data.sessions.filter((s) => s.origin === "auto").length
								]
							}),
							(0, react_jsx_runtime.jsx)("div", {
								style: {
									marginLeft: "auto",
									fontFamily: T.mono,
									fontSize: 9.5,
									color: T.faint
								},
								children: "节点=需求(大小=工作量) · 灰线=同会话需求序列 · ◆=线上项目切换 · 紫=子代理继承 · 黄虚线=派生 · 青虚线=跨会话共执行"
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 6,
							margin: "10px 0",
							flexWrap: "wrap"
						},
						children: [
							[
								"user",
								"subagent",
								"auto"
							].map((o) => {
								const label = o === "user" ? "用户输入" : o === "subagent" ? "子代理" : "自动";
								const on = originOn[o];
								const color = o === "user" ? "#3FA79B" : o === "subagent" ? "#5B8DE0" : "#8A97A6";
								return (0, react_jsx_runtime.jsxs)("button", {
									onClick: () => setOriginOn((prev) => ({
										...prev,
										[o]: !prev[o]
									})),
									style: {
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
										cursor: "pointer",
										background: on ? rgba(color, .14) : "transparent",
										border: "1px solid " + (on ? rgba(color, .5) : T.line),
										color: on ? T.text : T.faint,
										borderRadius: 3,
										padding: "1px 7px",
										fontFamily: T.mono,
										fontSize: 10,
										lineHeight: 1.6
									},
									children: [(0, react_jsx_runtime.jsx)("span", { style: {
										width: 7,
										height: 7,
										borderRadius: 2,
										background: on ? color : T.faint
									} }), label]
								}, o);
							}),
							(0, react_jsx_runtime.jsx)("span", { style: { width: 12 } }),
							data.projects.map((p) => {
								const on = activeP.size === 0 || activeP.has(p.id);
								return (0, react_jsx_runtime.jsxs)("button", {
									onClick: () => toggleP(p.id),
									style: {
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
										cursor: "pointer",
										background: on ? rgba(p.hue, .14) : "transparent",
										border: "1px solid " + (on ? rgba(p.hue, .5) : T.line),
										color: on ? T.text : T.faint,
										borderRadius: 3,
										padding: "1px 7px",
										fontFamily: T.mono,
										fontSize: 10,
										lineHeight: 1.6
									},
									children: [(0, react_jsx_runtime.jsx)("span", { style: {
										width: 7,
										height: 7,
										borderRadius: 2,
										background: on ? p.hue : T.faint
									} }), p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name]
								}, p.id);
							}),
							(0, react_jsx_runtime.jsx)("span", { style: { width: 12 } }),
							(0, react_jsx_runtime.jsxs)("button", {
								onClick: () => setOnlyTangled(!onlyTangled),
								style: {
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									cursor: "pointer",
									background: onlyTangled ? rgba(GOLD, .14) : "transparent",
									border: "1px solid " + (onlyTangled ? rgba(GOLD, .5) : T.line),
									color: onlyTangled ? T.text : T.faint,
									borderRadius: 3,
									padding: "1px 7px",
									fontFamily: T.mono,
									fontSize: 10
								},
								children: [(0, react_jsx_runtime.jsx)("span", { style: {
									width: 7,
									height: 7,
									borderRadius: 2,
									background: onlyTangled ? GOLD : T.faint
								} }), "只看缠绕"]
							}),
							(0, react_jsx_runtime.jsxs)("button", {
								onClick: () => setOnlyMultiDay(!onlyMultiDay),
								style: {
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									cursor: "pointer",
									background: onlyMultiDay ? rgba("#8A97A6", .14) : "transparent",
									border: "1px solid " + (onlyMultiDay ? rgba("#8A97A6", .5) : T.line),
									color: onlyMultiDay ? T.text : T.faint,
									borderRadius: 3,
									padding: "1px 7px",
									fontFamily: T.mono,
									fontSize: 10
								},
								children: [(0, react_jsx_runtime.jsx)("span", { style: {
									width: 7,
									height: 7,
									borderRadius: 2,
									background: onlyMultiDay ? "#8A97A6" : T.faint
								} }), "只看跨天"]
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							gap: 2
						},
						children: [
							["yarn", "日历纱线"],
							["matrix", "矩阵"],
							["table", "会话表"]
						].map(([id, label]) => (0, react_jsx_runtime.jsx)("button", {
							onClick: () => setTab(id),
							style: {
								background: "none",
								border: "none",
								borderBottom: tab === id ? "2px solid #E06A4E" : "2px solid transparent",
								color: tab === id ? T.text : T.muted,
								fontFamily: T.mono,
								fontSize: 12,
								letterSpacing: 1.5,
								padding: "8px 14px",
								cursor: "pointer"
							},
							children: label
						}, id))
					})
				]
			}),
			(0, react_jsx_runtime.jsxs)("div", {
				style: {
					flex: 1,
					minHeight: 0
				},
				children: [
					tab === "yarn" && (0, react_jsx_runtime.jsx)(YarnView, {
						data: {
							...data,
							sessions: list,
							requirements: reqList
						},
						selId,
						setSelId,
						hover,
						setHover,
						onJump
					}),
					tab === "matrix" && (0, react_jsx_runtime.jsx)(MatrixView, {
						data: {
							...data,
							sessions: list
						},
						selId,
						setSelId
					}),
					tab === "table" && (0, react_jsx_runtime.jsx)(TableView, {
						data: {
							...data,
							sessions: list
						},
						selId,
						setSelId,
						onJump
					})
				]
			}),
			sel !== null && (0, react_jsx_runtime.jsx)(SegmentDrawer, {
				s: sel,
				data,
				onJump,
				onClose: () => setSelId(null)
			})
		]
	});
}
//#endregion
//#region lib/client/graph-view.js
/**
* Conversation view tab: 会话结构图 (calendar yarn). Registered as a
* 'conversation.view' slot entry — the host renders the tab, tracks
* aria-selected / active underline, and mounts only the active view. This
* follows the ui-trajectory pattern exactly (no DOM tab injection).
*/
const calStyles = {
	position: "absolute",
	inset: 0,
	display: "flex",
	flexDirection: "column",
	background: "var(--dsw-alias-bg-base, #10151C)",
	color: "#D6DEE8",
	fontFamily: "-apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
	minWidth: 0,
	minHeight: 0
};
/**
* Fetch the whole-store calendar dataset (all projects). The yarn is global
* (not per-session); sessionId drives refresh + is available for future
* per-session drill-down.
*/
async function fetchCalendar() {
	try {
		return (await fetch("/api/track/calendar").then((res) => res.json())).calendar ?? null;
	} catch {
		return null;
	}
}
function GraphView(props) {
	const { sessionId, onJump } = props;
	const [cal, setCal] = (0, react.useState)(null);
	const [loading, setLoading] = (0, react.useState)(true);
	(0, react.useEffect)(() => {
		let alive = true;
		const load = () => {
			setLoading(true);
			fetchCalendar().then((d) => {
				if (alive) {
					setCal(d);
					setLoading(false);
				}
			});
		};
		load();
		const onBuilt = () => {
			load();
		};
		window.addEventListener("track:graph-built", onBuilt);
		return () => {
			alive = false;
			window.removeEventListener("track:graph-built", onBuilt);
		};
	}, [sessionId]);
	return (0, react_jsx_runtime.jsx)("div", {
		style: {
			position: "relative",
			flex: 1,
			minHeight: 0,
			overflow: "hidden"
		},
		children: (0, react.useMemo)(() => {
			if (loading) return (0, react_jsx_runtime.jsx)("div", {
				style: {
					...calStyles,
					alignItems: "center",
					justifyContent: "center",
					color: "#74839A",
					fontSize: 12
				},
				children: "加载日历纱线…"
			});
			if (cal === null || cal.sessions.length === 0) return (0, react_jsx_runtime.jsx)("div", {
				style: {
					...calStyles,
					alignItems: "center",
					justifyContent: "center",
					color: "#74839A",
					fontSize: 12
				},
				children: "暂无日历数据 — 先在右侧 Track 面板点「构建」生成会话图"
			});
			return (0, react_jsx_runtime.jsx)(CalendarYarnRoot, {
				data: cal,
				onJump
			});
		}, [
			loading,
			cal,
			onJump
		])
	});
}
//#endregion
//#region lib/client/index.js
/**
* Track Bridge client plugin — browser half.
*
* Visible surfaces:
* 1. A sidebar entry row ("Track") injected below New Session — the
*    primary entry point (sidebar slots are single-occupant; DOM injection
*    is the task-board precedent).
* 2. A center-column panel (capture wall + pending decisions + issues)
*    toggled by the entry, fed by the host HTTP API (/api/track/*).
* 3. A composer-dock strip showing pending counts.
* @module @fakechris/dsh-track/client
*/
/** Required services: slot registration, locale dictionaries, and the
*  sessions face (the right-panel jump-back links call ctx.sessions.open /
*  binding — cordis property access requires the service declared). */
const inject = [
	"slots",
	"locale",
	"sessions"
];
/**
* Client plugin body: sidebar entry + center panel + composer strip.
* @param ctx - client root context.
*/
function apply(ctx) {
	console.log("[dsh-track] client apply called");
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "dsh-track: dictionaries");
	const panelDisposer = mountRightPanel(ctx);
	ctx.effect(() => panelDisposer, "dsh-track: right panel");
	const injectActions = () => ({
		captures: 0,
		onClick: openTrackPanel
	});
	ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
		name: "conversation.composer.dock",
		id: "track",
		order: 20,
		locale: NS,
		inject: injectActions
	}, TrackStrip));
	const t = ctx.locale.bind(NS);
	ctx.slots.inject("conversation.view", () => ctx.slots.register({
		name: "conversation.view",
		id: "track-graph",
		order: 20,
		locale: NS,
		label: () => t("view.graph"),
		inject: (sessionId) => ({
			sessionId,
			onJump: (j) => {
				jumpToConversation({
					sessionId: j.sessionId,
					messageId: j.messageId
				});
			}
		})
	}, GraphView));
}
//#endregion
exports.apply = apply;
exports.inject = inject;

return module.exports; } });