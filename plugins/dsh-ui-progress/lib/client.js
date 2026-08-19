window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-ui-progress",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region ../../node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region \0dsh-css:C:\Users\lf\Documents\Workspace\marisa-distro\plugins\dsh-ui-progress\src\client\SessionProgressBar.module.css.mjs
		const css = "._0328Na_dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto}._0328Na_bar{box-sizing:border-box;width:100%;max-width:calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-tip);border-radius:12px;align-items:center;gap:10px;height:36px;margin:0 auto;padding:4px 5px 4px 12px;display:flex}._0328Na_bar[data-state=running]{border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, transparent);animation:2s ease-in-out infinite _0328Na_dsh-session-progress-glow}._0328Na_bar[data-state=done]{border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent);background:var(--dsw-alias-state-success-tertiary)}._0328Na_bar[data-state=done] ._0328Na_glyph{color:var(--dsw-alias-state-success-primary)}._0328Na_bar[data-state=done] ._0328Na_fill{background:var(--dsw-alias-state-success-primary)}._0328Na_bar[data-state=pending]{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);background:var(--dsw-alias-state-warn-tertiary);animation:1.6s ease-in-out infinite _0328Na_dsh-session-progress-warn-glow}._0328Na_bar[data-state=pending] ._0328Na_glyph{color:var(--dsw-alias-state-warn-primary)}._0328Na_bar[data-state=pending] ._0328Na_fill{background:var(--dsw-alias-state-warn-primary)}._0328Na_bar[data-state=interrupted]{--ui-progress-interrupted:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, var(--dsw-alias-state-error-primary));border-color:color-mix(in srgb, var(--ui-progress-interrupted) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-warn-tertiary) 85%, var(--dsw-alias-state-error-secondary));animation:1.6s ease-in-out infinite _0328Na_dsh-session-progress-interrupted-glow}._0328Na_bar[data-state=interrupted] ._0328Na_glyph{color:var(--ui-progress-interrupted)}._0328Na_bar[data-state=interrupted] ._0328Na_fill{background:var(--ui-progress-interrupted)}._0328Na_bar[data-state=interrupted] ._0328Na_percent{color:var(--ui-progress-interrupted)}@keyframes _0328Na_dsh-session-progress-interrupted-glow{0%,to{box-shadow:0 0 0 0 color-mix(in srgb, var(--ui-progress-interrupted) 0%, transparent)}50%{box-shadow:0 0 10px 1px color-mix(in srgb, var(--ui-progress-interrupted) 30%, transparent)}}@keyframes _0328Na_dsh-session-progress-warn-glow{0%,to{box-shadow:0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-warn-primary) 0%, transparent)}50%{box-shadow:0 0 10px 1px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 30%, transparent)}}@keyframes _0328Na_dsh-session-progress-glow{0%,to{box-shadow:0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-business-primary) 0%, transparent)}50%{box-shadow:0 0 10px 1px color-mix(in srgb, var(--dsw-alias-state-business-primary) 28%, transparent)}}._0328Na_glyph{color:var(--dsw-alias-state-business-primary);flex:none;display:inline-flex}._0328Na_glyphRunning{animation:1s linear infinite _0328Na_dsh-session-progress-spin}@keyframes _0328Na_dsh-session-progress-spin{to{transform:rotate(360deg)}}._0328Na_label{color:var(--dsw-alias-label-primary);flex:none;font-size:13px;font-weight:500;line-height:24px}._0328Na_track{background:var(--dsw-alias-bg-layer-2);border-radius:999px;flex:1;min-width:60px;height:6px;position:relative;overflow:hidden}._0328Na_fill{background:var(--dsw-alias-state-business-primary);border-radius:999px;transition:width .5s cubic-bezier(.4,0,.2,1);position:absolute;top:0;bottom:0;left:0}._0328Na_fillRunning{background:linear-gradient(90deg, var(--dsw-alias-state-business-primary), var(--dsw-alias-brand-primary))}._0328Na_shimmer{background:linear-gradient(90deg, transparent, color-mix(in srgb, var(--dsw-alias-bg-base) 55%, transparent), transparent);pointer-events:none;border-radius:999px;width:40%;animation:1.4s ease-in-out infinite _0328Na_dsh-session-progress-shimmer;position:absolute;top:0;bottom:0;left:0}@keyframes _0328Na_dsh-session-progress-shimmer{0%{transform:translate(-120%)}to{transform:translate(320%)}}._0328Na_counter{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;font-size:12px;line-height:18px}._0328Na_eta{font-variant-numeric:tabular-nums;color:var(--dsw-alias-state-business-primary);white-space:nowrap;flex:none;font-size:12px;font-weight:500;line-height:18px}._0328Na_rate{text-align:right;font-variant-numeric:tabular-nums;min-width:60px;color:var(--dsw-alias-state-business-primary);white-space:nowrap;flex:none;font-size:12px;font-style:italic;font-weight:500;line-height:18px}._0328Na_percent{text-align:right;font-variant-numeric:tabular-nums;min-width:34px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none;font-size:12px;line-height:18px}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"@dsh-external/dsh-ui-progress/SessionProgressBar.module.css\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-external/dsh-ui-progress";
			tag.dataset.pluginCss = "@dsh-external/dsh-ui-progress/SessionProgressBar.module.css";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var SessionProgressBar_module_css_default = {
			"fill": "_0328Na_fill",
			"bar": "_0328Na_bar",
			"dsh-session-progress-interrupted-glow": "_0328Na_dsh-session-progress-interrupted-glow",
			"track": "_0328Na_track",
			"dsh-session-progress-glow": "_0328Na_dsh-session-progress-glow",
			"glyphRunning": "_0328Na_glyphRunning",
			"dsh-session-progress-warn-glow": "_0328Na_dsh-session-progress-warn-glow",
			"label": "_0328Na_label",
			"eta": "_0328Na_eta",
			"dock": "_0328Na_dock",
			"glyph": "_0328Na_glyph",
			"fillRunning": "_0328Na_fillRunning",
			"percent": "_0328Na_percent",
			"dsh-session-progress-spin": "_0328Na_dsh-session-progress-spin",
			"dsh-session-progress-shimmer": "_0328Na_dsh-session-progress-shimmer",
			"shimmer": "_0328Na_shimmer",
			"counter": "_0328Na_counter",
			"rate": "_0328Na_rate"
		};
		//#endregion
		//#region src/client/token-rate.ts
		/**
		* Wide CJK characters priced at one token each: CJK punctuation/forms,
		* kana, CJK ideographs (incl. extension A and compatibility), and hangul.
		* A single regex alternation so a per-character test is stateless.
		*/
		const CJK_CHAR = /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;
		/**
		* Non-CJK density: every 4 chars ≈ 1 token (the core token-meter's fixed
		* CHARS_PER_TOKEN). The CJK half diverges on purpose — the meter's flat
		* density is a conservative context-budget heuristic, while a live
		* throughput readout should track real generation, where one CJK char is
		* typically one token. Calibration replaces this static weighting once real
		* provider usage is available.
		*/
		const NARROW_TOKEN_WEIGHT = .25;
		/** Read the provider-reported completion-token count from an assistant node. */
		function usageOutputTokens(usage) {
			if (typeof usage !== "object" || usage === null) return null;
			const value = usage.outputTokens;
			return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
		}
		/**
		* Weighted char measure of assistant content: wide CJK chars count 1.0,
		* remaining chars 0.25 (the fixed non-CJK density). Fractional on purpose —
		* a live estimate must not jump on per-block ceilings, and calibration
		* multiplies this measure by a real tokens-per-weighted-char density.
		* @param blocks - assistant content blocks (text/reasoning bodies, tool-call name + arguments).
		* @returns weighted chars; 0 when nothing is readable.
		*/
		function weightedChars(blocks) {
			let wide = 0;
			let narrow = 0;
			for (const block of blocks) {
				const text = block.kind === "tool-call" ? block.name + block.argsRaw : block.kind === "text" || block.kind === "reasoning" ? block.text : "";
				for (const char of text) if (CJK_CHAR.test(char)) wide += 1;
				else narrow += 1;
			}
			return wide + narrow * NARROW_TOKEN_WEIGHT;
		}
		/**
		* Weighted chars of the in-flight partial, or 0 when the model is not
		* emitting.
		* @param partial - the live streaming partial.
		* @returns the weighted-char measure {@link weightedChars} applies.
		*/
		function weightedPartialChars(partial) {
			return partial === null ? 0 : weightedChars(partial.blocks);
		}
		/**
		* Real tokens-per-weighted-char density of the latest settled assistant step
		* that carries both provider usage and readable content. The density is a
		* property of the model's tokenizer, so any recent completed step in the
		* window calibrates the live estimate (skipping steps without usage or with
		* no measurable content). Nodes are window-scoped and seq-ordered; scanning
		* backwards picks the newest usable sample.
		* @param nodes - settled nodes of the loaded window.
		* @returns tokens per weighted char, or null before any usable step settled.
		*/
		function latestTokenDensity(nodes) {
			for (let i = nodes.length - 1; i >= 0; i -= 1) {
				const node = nodes[i];
				if (node === void 0 || node.kind !== "assistant") continue;
				const output = usageOutputTokens(node.usage);
				if (output === null || output <= 0) continue;
				const weighted = weightedChars(node.blocks);
				if (weighted <= 0) continue;
				return output / weighted;
			}
			return null;
		}
		/**
		* Estimated tokens streamed so far: weighted chars of the partial scaled by
		* the calibrated density when one is available, else the bare weighted-char
		* heuristic (CJK 1 token, others 1/4). Units are consistent either way, so
		* the displayed rate converges smoothly onto the provider's real usage once
		* a step settles.
		* @param partial - the live streaming partial.
		* @param density - calibration from {@link latestTokenDensity}, or null.
		* @returns estimated streamed tokens; 0 while nothing is emitting.
		*/
		function streamedTokenEstimate(partial, density) {
			const weighted = weightedPartialChars(partial);
			if (weighted <= 0) return 0;
			return density === null ? weighted : weighted * density;
		}
		/**
		* Live tokens per second over the decode window (first visible token → now).
		* Mirrors the core's settled reading — output tokens over decode wall time —
		* so the running figure is directly comparable to the post-turn value shown
		* by the conversation StatsLine.
		* @param tokens - estimated streamed tokens ({@link streamedTokenEstimate}).
		* @param firstTokenAt - epoch ms when the first visible token was observed.
		* @param now - epoch ms clock reading.
		* @returns tokens/sec, or null while the window is empty or not yet open.
		*/
		function liveTokenRate(tokens, firstTokenAt, now) {
			const decodeMs = now - firstTokenAt;
			if (tokens <= 0 || decodeMs <= 0) return null;
			return tokens / (decodeMs / 1e3);
		}
		/**
		* Compact rate figure: whole tokens from ten up, one decimal below (same
		* shape as the core's formatTokensPerSecond, which the settled footer uses).
		* @param tps - tokens per second (negatives clamp to zero).
		* @returns display number without unit.
		*/
		function formatTokenRate(tps) {
			const clamped = Math.max(0, tps);
			return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10);
		}
		//#endregion
		//#region src/client/timing.ts
		/**
		* Shared timing helpers for the progress surfaces: compact duration
		* formatting and a ticking clock for the live elapsed/ETA readouts. The
		* clock is a component-internal behavioral hook — it subscribes to nothing
		* external (no session or framework state), so it stays inside presentation
		* components. The first-token anchor hook stamps the live token-rate window
		* the same way: from the snapshot's partial alone.
		*/
		/**
		* Compact duration: one decimal always under a minute (17.0s, 3.4s), folded
		* whole-second steps from the minute mark on (1m0s, 2m42s). The fold check
		* uses the rounded tenth so 59.96s reads 1m0s instead of 60.0s.
		* @param ms - duration in milliseconds.
		* @returns display string.
		*/
		function formatElapsed(ms) {
			const tenths = Math.round(ms / 100) / 10;
			if (tenths < 60) return `${tenths.toFixed(1)}s`;
			const whole = Math.round(tenths);
			return `${Math.floor(whole / 60)}m${whole % 60}s`;
		}
		/**
		* Whole-second ETA: 45s / 2m42s / 5h / 5h20m. An estimate, so no sub-second
		* precision; hours kick in at the hour mark.
		* @param ms - remaining-time estimate in milliseconds.
		* @returns display string.
		*/
		function formatEta(ms) {
			const s = Math.max(0, Math.round(ms / 1e3));
			if (s < 60) return `${s}s`;
			if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
			const hours = Math.floor(s / 3600);
			const minutes = Math.floor(s % 3600 / 60);
			return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
		}
		/**
		* Ticking clock: Date.now() refreshed at the rate the elapsed display
		* needs — every 100ms while the elapsed since `start` is under a minute
		* (0.1s steps), once per second from the minute mark on (folded 1s steps).
		* Frozen when disabled or anchorless; callers gate reads on the same flags.
		* The effect ticks once immediately on enable so a resumed readout is not
		* stale for up to one interval.
		* @param enabled - whether the clock should tick.
		* @param start - epoch-ms anchor the elapsed is measured from (turn start,
		*   call time); null disables the clock.
		* @returns the latest epoch-ms timestamp.
		*/
		function useNow(enabled, start) {
			const [now, setNow] = (0, react.useState)(() => Date.now());
			(0, react.useEffect)(() => {
				if (!enabled || start === null) return;
				let alive = true;
				let timer;
				const tick = () => {
					if (!alive) return;
					setNow(Date.now());
					const delay = Date.now() - start < 6e4 ? 100 : 1e3;
					timer = setTimeout(tick, delay);
				};
				tick();
				return () => {
					alive = false;
					if (timer !== void 0) clearTimeout(timer);
				};
			}, [enabled, start]);
			return now;
		}
		/**
		* First-visible-token anchor for the live token-rate window: the epoch-ms
		* instant the current streaming partial first carried estimated tokens
		* (one render behind the real chunk event at most — a live readout does not
		* need event-exact boundaries). Stamped once per (turn, step): a new step's
		* partial re-opens the decode window, a null partial or a stopped turn
		* closes it.
		* @param running - whether the session turn is running.
		* @param partial - the live streaming partial (snapshot-derived).
		* @returns the anchor, or null while no token stream is live.
		*/
		function useFirstTokenAt(running, partial) {
			const [anchor, setAnchor] = (0, react.useState)(null);
			const key = partial === null ? null : `${partial.turn}\u0000${partial.step}`;
			const hasTokens = partial !== null && weightedPartialChars(partial) > 0;
			const lastKey = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (!running || key === null || !hasTokens) {
					lastKey.current = null;
					setAnchor(null);
					return;
				}
				if (lastKey.current !== key) {
					lastKey.current = key;
					setAnchor(Date.now());
				}
			}, [
				running,
				key,
				hasTokens
			]);
			return anchor;
		}
		/**
		* Sliding-window cadence of the live token-rate readout: the displayed tok/s
		* is the average over the most recent window of this length, refreshed once
		* per window — chunk-level arrivals are smoothed into a stable figure that
		* changes at most every window instead of on every stream chunk.
		*/
		const TOKEN_RATE_WINDOW_MS = 1e3;
		/**
		* Sliding-window token rate for the live chip: the average estimated tokens
		* gained per second over the most recent window, recomputed once per window
		* and only when tokens actually arrived (a fully empty window keeps the
		* previous reading so a paused stream does not flicker to zero). A fresh
		* anchor re-opens the window; disabling clears the reading.
		* @param enabled - whether the stream is live (running, no pending wait, anchor set).
		* @param anchor - first-visible-token epoch ms (window origin for the first sample).
		* @param tokens - current estimated streamed tokens (latest per-render value).
		* @param windowMs - smoothing window; defaults to {@link TOKEN_RATE_WINDOW_MS}.
		* @returns the windowed tokens/sec, or null before the first full window or while disabled.
		*/
		function useWindowedTokenRate(enabled, anchor, tokens, windowMs = TOKEN_RATE_WINDOW_MS) {
			const [rate, setRate] = (0, react.useState)(null);
			const windowStartRef = (0, react.useRef)(null);
			const tokensRef = (0, react.useRef)(tokens);
			tokensRef.current = tokens;
			(0, react.useEffect)(() => {
				if (!enabled || anchor === null) {
					windowStartRef.current = null;
					setRate(null);
					return;
				}
				if (windowStartRef.current === null) windowStartRef.current = {
					time: Date.now(),
					tokens: tokensRef.current
				};
				const timer = setInterval(() => {
					const start = windowStartRef.current;
					if (start === null) return;
					const now = Date.now();
					const gained = tokensRef.current - start.tokens;
					if (gained > 0) setRate(liveTokenRate(gained, start.time, now));
					windowStartRef.current = {
						time: now,
						tokens: tokensRef.current
					};
				}, windowMs);
				return () => {
					clearInterval(timer);
				};
			}, [
				enabled,
				anchor,
				windowMs
			]);
			return rate;
		}
		//#endregion
		//#region src/client/args.ts
		/**
		* Parsing helpers for the `report_progress` tool args (model JSON: any field
		* may be missing or mistyped, so every read is shape-checked here once and
		* consumed through these narrow accessors). The browser half reads only the
		* `eta` estimate (the session strip's ETA row); the rest of the contract is
		* the tool's own business.
		*/
		/**
		* Parse the call head's args JSON into a record; malformed or non-object
		* input reads as null.
		* @param argsRaw - the raw JSON string from the call block.
		* @returns the parsed record, or null when it is not a JSON object.
		*/
		function parseArgs(argsRaw) {
			try {
				const parsed = JSON.parse(argsRaw);
				if (typeof parsed !== "object" || parsed === null) return null;
				return parsed;
			} catch {
				return null;
			}
		}
		/**
		* The model-reported ETA as a display string: a number (or numeric string)
		* is seconds formatted compactly ("5h", "2m42s"); any other string is shown
		* verbatim ("约5小时", "~5h"). Null when absent, empty, non-positive, or
		* unparseable — the surface then shows no ETA (unknown stays unknown).
		* @param args - the parsed args record.
		* @returns the display string, or null.
		*/
		function etaOf(args) {
			const eta = args?.eta;
			if (typeof eta === "number" && Number.isFinite(eta) && eta > 0) return formatEta(eta * 1e3);
			if (typeof eta === "string" && eta.trim() !== "") {
				const numeric = eta.trim();
				if (/^\d+(\.\d+)?$/.test(numeric)) {
					const seconds = Number(numeric);
					return Number.isFinite(seconds) && seconds > 0 ? formatEta(seconds * 1e3) : null;
				}
				return eta;
			}
			return null;
		}
		//#endregion
		//#region src/client/session-state.ts
		/**
		* Count settled tool results in the current snapshot window. The node stream
		* is the presentation-truth source: a result node exists exactly when a tool
		* call completed (and re-renders live as the window advances).
		*/
		function settledToolCount(snapshot) {
			let count = 0;
			for (const node of snapshot.nodes) if (node.kind === "tool-result") count += 1;
			return count;
		}
		/**
		* True while the model is emitting reasoning: the in-flight partial carries a
		* reasoning block and no tool call is in flight (a running tool is the more
		* specific state and wins the label).
		*/
		function isReasoning(snapshot) {
			return snapshot.partial?.blocks.some((block) => block.kind === "reasoning") ?? false;
		}
		/** The in-flight tool name when running; undefined when nothing is executing. */
		function runningTool(snapshot) {
			return snapshot.runningCalls[0]?.name;
		}
		/**
		* Start time of the running turn — the in-window turn entry with no end yet.
		* Null when running but no in-window turn start exists.
		*/
		function runningTurnStart(snapshot) {
			let start = null;
			for (const timing of snapshot.turnTimings.values()) if (timing.endTime === void 0) start = timing.startTime;
			return start;
		}
		/**
		* Wall duration of the last settled in-window turn; null when no turn has
		* finished yet. Only read while idle (the running turn has no end entry).
		*/
		function lastTurnDuration(snapshot) {
			let duration = null;
			for (const timing of snapshot.turnTimings.values()) if (timing.endTime !== void 0) duration = Math.max(0, timing.endTime - timing.startTime);
			return duration;
		}
		/**
		* The model-reported ETA display string from the LATEST in-window
		* `report_progress` call (running or settled, by report time). The latest
		* report is the model's last word: if it carries no eta, the strip shows no
		* ETA even when an older report did.
		*/
		function latestReportEta(snapshot) {
			let latestTime = -1;
			let latestEta = null;
			for (const node of snapshot.nodes) {
				if (node.kind !== "tool-result" || node.call?.name !== "report_progress") continue;
				const time = node.callTime ?? node.time;
				if (time >= latestTime) {
					latestTime = time;
					latestEta = etaOf(parseArgs(node.call.argsRaw));
				}
			}
			for (const call of snapshot.runningCalls) {
				if (call.name !== "report_progress") continue;
				if (call.time >= latestTime) {
					latestTime = call.time;
					latestEta = etaOf(parseArgs(call.argsRaw));
				}
			}
			return latestEta;
		}
		/** Completed/active/total from a live todos projection; null when unavailable or empty. */
		function todoCounts(todos) {
			if (todos === void 0 || todos === null || todos.length === 0) return null;
			let done = 0;
			let active = 0;
			for (const item of todos) if (item.status === "completed") done += 1;
			else if (item.status === "in_progress") active += 1;
			return {
				done,
				active,
				total: todos.length
			};
		}
		/**
		* The bar's progress value in 0..100. A live `todos` projection wins: the
		* (completed + in-progress)/total ratio is the real task completion — the
		* in-flight task counts toward progress, so five tasks with two done and one
		* in progress reads 60%. Without one the fill rests at its 100% default:
		* session-overall progress has no dedicated projection, and a fake percentage
		* (the removed per-tool-result window segments) is worse than none.
		*/
		function progressPercent(snapshot, todos) {
			const counts = todoCounts(todos);
			if (counts !== null) return Math.round((counts.done + counts.active) / counts.total * 100);
			return 100;
		}
		/**
		* Whether the session's LATEST completed turn was stopped mid-flight — a
		* manual stop, an API failure, or another unexpected break. The runtime
		* leaves three in-window traces: an interrupted assistant node (frozen
		* partial), tool-result nodes with error.code 'interrupted' (in-flight calls
		* cut off), and turn-error nodes (terminal failure); live agent failures
		* with no turn position arrive through lastAgentError. Only the latest
		* completed turn is judged (its turn/end seq is the boundary — derived
		* interruption nodes ride fractional seqs just below it), so an interruption
		* followed by a clean turn does not keep the bar orange. Window-scoped by
		* design — paging or compaction drops old markers; a stop that left neither
		* a partial nor an in-flight call leaves no trace and cannot be detected.
		*/
		function latestTurnInterrupted(snapshot) {
			if (snapshot.lastAgentError !== null) return true;
			const ends = [...snapshot.turnEnds.entries()].sort((a, b) => a[0] - b[0]);
			const latest = ends.at(-1);
			if (latest === void 0) return false;
			const latestEndSeq = latest[1];
			const prevEndSeq = ends.at(-2)?.[1] ?? 0;
			for (const node of snapshot.nodes) {
				if (node.seq <= prevEndSeq || node.seq > latestEndSeq) continue;
				if (node.kind === "assistant" && node.interrupted === true) return true;
				if (node.kind === "turn-error") return true;
				if (node.kind === "tool-result" && node.error?.code === "interrupted") return true;
			}
			return false;
		}
		//#endregion
		//#region src/client/SessionProgressBar.tsx
		/**
		* SessionProgressBar: a resident session-progress strip in the composer
		* input dock, derived entirely from the live {@link ConversationSnapshot}
		* plus the `todos` session projection.
		*
		* The bar needs no model-facing tool: it reads the framework's `useSession`
		* hook and the `todos` projection (session-scope standard kit) and renders
		* the real execution state — whether the turn is running, which tool call is
		* in flight, whether the model is emitting reasoning, and the task
		* completion ratio. Progress follows the truth order: a live todos list wins
		* (completed/total is the real task completion — five tasks with two done
		* reads 40%); without one the fill rests at its 100% default, because
		* session-overall progress has no dedicated projection and a fake percentage
		* is worse than none. Animation follows the state: a spinning glyph and
		* shimmer glide while running, a static filled bar when idle.
		*
		* While running, the strip also shows a live elapsed readout (since the
		* current turn started). The ETA is never extrapolated: it rides the model's
		* own knowledge — the latest in-window `report_progress` call's `eta`
		* argument (a rough remaining-time estimate). When the model has not
		* reported one, no ETA shows (unknown stays unknown).
		*
		* Attention state: when this session or any descendant subagent session
		* waits on a human interaction (approval / question / plan review), the bar
		* switches to the amber warning palette and the label names the wait —
		* subagent waits surface through the global session list (`origin:
		* 'subagent'` rows carry `pendingInteraction`; the sidebar hides them, so
		* this strip is where the main agent surfaces them).
		*
		* Interrupted state: when the session's latest completed turn was stopped —
		* a manual stop, an API failure, or another unexpected break — the bar
		* switches to the orange-red palette with a slow pulse and the label reads
		* 已中断. Only the latest completed turn is judged (by its turn/end seq), so
		* an interruption followed by a clean turn does not keep the bar orange.
		*
		* Live token rate (v0.9.0): while the model is emitting (running with a
		* non-empty partial and no pending human interaction), the strip shows a
		* live generation-rate readout — estimated tokens over the decode window
		* since the first visible token. Streaming chunks carry no token counts, so
		* the figure is an estimate that self-calibrates to the model's real
		* tokenizer density from the latest settled step's provider usage (CJK-aware
		* char heuristic before the first calibrated step; see token-rate.ts), and
		* is smoothed through a sliding window so the readout changes at most once
		* per second instead of on every chunk. Measured from the same first-token
		* anchor the core uses for its settled tokens/s, the live number is directly
		* comparable to the post-turn value on the conversation StatsLine.
		*/
		/**
		* Walk the session list from the given root down its `parentId` chain and
		* count pending human interactions on subagent sessions. The sidebar hides
		* subagent rows; the global list still carries them, so the main strip can
		* surface their waits.
		* @param byId - the global session-list index.
		* @param rootId - the strip's owning session id.
		* @returns pending counts per kind across the whole subtree.
		*/
		function subagentPendingState(byId, rootId) {
			const children = /* @__PURE__ */ new Map();
			for (const [sid, row] of Object.entries(byId)) {
				if (row.parentId === void 0 || row.origin !== "subagent") continue;
				const list = children.get(row.parentId) ?? [];
				list.push(sid);
				children.set(row.parentId, list);
			}
			const seen = /* @__PURE__ */ new Set([rootId]);
			const queue = [rootId];
			let approvals = 0;
			let questions = 0;
			let plans = 0;
			while (queue.length > 0) {
				const id = queue.shift();
				for (const childId of children.get(id) ?? []) {
					if (seen.has(childId)) continue;
					seen.add(childId);
					queue.push(childId);
					const status = byId[childId]?.pendingInteraction;
					if (status === "approval") approvals += 1;
					else if (status === "question") questions += 1;
					else if (status === "plan-review") plans += 1;
				}
			}
			return {
				approvals,
				questions,
				plans
			};
		}
		/**
		* The attention label: this session's own wait (approval/question) plus the
		* subagent subtree's waits, combined with a separator when both exist.
		*/
		function pendingLabel(ownKind, sub, t) {
			const ownText = ownKind === "approval" ? t("bar.pendingApproval") : ownKind === "question" ? t("bar.pendingQuestion") : null;
			const total = sub.approvals + sub.questions + sub.plans;
			let subText = null;
			if (total > 0) {
				if (total === 1 && sub.approvals === 1) subText = t("bar.pendingSubagentApproval");
				else if (total === 1 && sub.questions === 1) subText = t("bar.pendingSubagentQuestion");
				else if (total === 1 && sub.plans === 1) subText = t("bar.pendingSubagentPlan");
				else subText = t("bar.pendingSubagentCount", { count: total });
			}
			if (ownText !== null && subText !== null) return `${ownText} · ${subText}`;
			return ownText ?? subText ?? "";
		}
		/** Human label for the current state; null means the dock row renders no text. */
		function stateLabel(running, runningToolName, thinking, counts, t) {
			if (running) {
				if (runningToolName !== void 0) return t("bar.tool", { name: runningToolName });
				if (thinking) return t("bar.thinking");
				return t("bar.running");
			}
			if (counts !== null) return t("bar.todos", {
				done: counts.done,
				active: counts.active,
				total: counts.total
			});
			return t("bar.idle");
		}
		/**
		* Resident progress strip. Renders nothing until a session snapshot exists
		* (the no-session hero has no dock content), then shows the state text, the
		* animated fill bar with a live percent readout, the turn/tool counters, and
		* — while running — the live elapsed plus the model-reported ETA (or the
		* last settled turn's duration when idle). Pending human interactions (this
		* session or its subagent subtree) and interrupted stops (manual or
		* unexpected) each override the plain states with their attention palette.
		*/
		function SessionProgressBar({ session, t, useProjection, useSessions }) {
			if (session === void 0 || session === null) return null;
			const todos = useProjection("todos");
			const toolName = runningTool(session);
			const running = session.running;
			const thinking = running && toolName === void 0 && isReasoning(session);
			const counts = todoCounts(todos);
			const percent = progressPercent(session, todos);
			const turn = session.turnTimings.size;
			const settled = settledToolCount(session);
			const turnStart = runningTurnStart(session);
			const now = useNow(running, turnStart);
			const elapsed = turnStart !== null ? Math.max(0, now - turnStart) : null;
			const partial = session.partial;
			const firstTokenAt = useFirstTokenAt(running, partial);
			useNow(running && firstTokenAt !== null, firstTokenAt);
			const modelEta = running ? latestReportEta(session) : null;
			const lastTurn = running ? null : lastTurnDuration(session);
			const completed = !running && turn > 0;
			const ownPending = session.pending[0]?.kind ?? null;
			const subPending = subagentPendingState(useSessions((s) => s.byId), session.sessionId);
			const pending = ownPending !== null || subPending.approvals + subPending.questions + subPending.plans > 0;
			const interrupted = !running && latestTurnInterrupted(session);
			const density = latestTokenDensity(session.nodes);
			const tokenRate = useWindowedTokenRate(running && !pending && firstTokenAt !== null, firstTokenAt, streamedTokenEstimate(partial, density), TOKEN_RATE_WINDOW_MS);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: SessionProgressBar_module_css_default.dock,
				"data-progress-bar": true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: SessionProgressBar_module_css_default.bar,
					"data-state": pending ? "pending" : running ? "running" : interrupted ? "interrupted" : completed ? "done" : "idle",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: clsx(SessionProgressBar_module_css_default.glyph, running && SessionProgressBar_module_css_default.glyphRunning),
							children: running ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, { size: 14 }) : interrupted ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkle16, { size: 14 })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionProgressBar_module_css_default.label,
							children: pending ? pendingLabel(ownPending, subPending, t) : interrupted ? t("bar.interrupted") : stateLabel(running, toolName, thinking, counts, t)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SessionProgressBar_module_css_default.track,
							role: "progressbar",
							"aria-valuenow": percent,
							"aria-valuemin": 0,
							"aria-valuemax": 100,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: clsx(SessionProgressBar_module_css_default.fill, running && SessionProgressBar_module_css_default.fillRunning),
								style: { width: `${percent}%` }
							}), running && !pending && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: SessionProgressBar_module_css_default.shimmer })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SessionProgressBar_module_css_default.percent,
							children: [percent, "%"]
						}),
						running && modelEta !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionProgressBar_module_css_default.eta,
							children: t("bar.eta", { duration: modelEta })
						}),
						running && elapsed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionProgressBar_module_css_default.counter,
							children: t("bar.elapsed", { duration: formatElapsed(elapsed) })
						}),
						running && tokenRate !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionProgressBar_module_css_default.rate,
							children: t("bar.tokenRate", { rate: formatTokenRate(tokenRate) })
						}),
						!running && lastTurn !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionProgressBar_module_css_default.counter,
							children: t("bar.lastTurn", { duration: formatElapsed(lastTurn) })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionProgressBar_module_css_default.counter,
							children: t("bar.turn", { turn })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionProgressBar_module_css_default.counter,
							children: t("bar.tools", { count: settled })
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** `progress` namespace dictionaries. */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"bar.idle": "会话就绪",
			"bar.running": "正在执行",
			"bar.thinking": "正在思考",
			"bar.todos": "已完成 {done}/{total}",
			"bar.turn": "第 {turn} 轮",
			"bar.tools": "{count} 个工具调用",
			"bar.tool": "工具 {name}",
			"bar.waiting": "等待输入",
			"bar.elapsed": "已耗时 {duration}",
			"bar.eta": "预计剩余 {duration}",
			"bar.tokenRate": "{rate} tok/s",
			"bar.lastTurn": "上回合 {duration}",
			"bar.interrupted": "已中断",
			"bar.pendingApproval": "等待审批",
			"bar.pendingQuestion": "需要选择",
			"bar.pendingPlan": "等待计划审阅",
			"bar.pendingSubagentApproval": "子代理等待审批",
			"bar.pendingSubagentQuestion": "子代理需要选择",
			"bar.pendingSubagentPlan": "子代理等待计划审阅",
			"bar.pendingSubagentCount": "子代理 {count} 项待处理"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"bar.idle": "Session idle",
			"bar.running": "Executing",
			"bar.thinking": "Thinking",
			"bar.todos": "Done {done}/{total}",
			"bar.turn": "Turn {turn}",
			"bar.tools": "{count} tool calls",
			"bar.tool": "Tool {name}",
			"bar.waiting": "Waiting for input",
			"bar.elapsed": "Elapsed {duration}",
			"bar.eta": "ETA {duration}",
			"bar.tokenRate": "{rate} tok/s",
			"bar.lastTurn": "Last turn {duration}",
			"bar.interrupted": "Interrupted",
			"bar.pendingApproval": "Awaiting approval",
			"bar.pendingQuestion": "Needs selection",
			"bar.pendingPlan": "Awaiting plan review",
			"bar.pendingSubagentApproval": "Subagent awaiting approval",
			"bar.pendingSubagentQuestion": "Subagent needs selection",
			"bar.pendingSubagentPlan": "Subagent awaiting plan review",
			"bar.pendingSubagentCount": "Subagent {count} pending"
		};
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "progress";
		/**
		* Required services (cordis fiber inject). 'conversation' is an ordering
		* edge for the input-dock registration, not a call dependency: the dock slot
		* is declared by ui-conversation's apply.
		*/
		const inject = [
			"slots",
			"conversation",
			"locale"
		];
		/**
		* Client plugin body: register the `progress` dictionaries and the resident
		* session-progress strip into the input dock.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-progress: dictionaries");
			ctx.inject([
				"slots",
				"conversation",
				"sessions"
			], (scope) => {
				scope.effect(() => scope.slots.register({
					name: "conversation.input.dock",
					id: "progress",
					order: 20,
					locale: NS
				}, SessionProgressBar), "ui-progress: session progress strip");
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
