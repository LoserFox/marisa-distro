window.__ModuleLoader__.load({
	id: "@huanlin/dsh-plugin-aigc-canvas",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/api.ts
		/**
		* Typed fetch wrapper over the /aigc-canvas JSON API.
		*/
		/** One wire failure. */
		var AigcApiError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
			}
		};
		/** All QualityHint values as a readonly array (for select dropdowns). */
		const RUNTIME_QUALITY_HINTS = [
			"fast",
			"balanced",
			"quality"
		];
		/** All Capability values (for select dropdowns). */
		const RUNTIME_CAPABILITIES = [
			"t2i",
			"i2i",
			"t2v",
			"i2v",
			"fl2v",
			"ref2v",
			"tts",
			"music",
			"transcribe",
			"edit",
			"chat"
		];
		/** All ResponseKind values (for select dropdowns). */
		const RUNTIME_RESPONSE_KINDS = [
			"b64_json_array",
			"b64_json_field",
			"binary",
			"url_field",
			"json_text"
		];
		/** All HTTP methods (for select dropdowns). */
		const RUNTIME_HTTP_METHODS = [
			"GET",
			"POST",
			"PUT",
			"PATCH"
		];
		/** All parameter types (for select dropdowns). */
		const RUNTIME_PARAM_TYPES = [
			"string",
			"number",
			"integer",
			"boolean",
			"array",
			"object",
			"image_ref",
			"video_ref",
			"audio_ref"
		];
		async function call(method, payload, signal) {
			let response;
			try {
				response = await fetch(`/aigc-canvas/api/${method}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload),
					signal
				});
			} catch (error) {
				throw new AigcApiError("network", error instanceof Error ? error.message : String(error));
			}
			const parsed = await response.json().catch(() => null);
			if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === void 0) throw new AigcApiError(parsed?.error?.code ?? "http", parsed?.error?.message ?? `HTTP ${response.status}`);
			return parsed.value;
		}
		/** Fetch the canvas state (elements + edges) for one session. */
		function fetchCanvas(sessionId, signal) {
			return call("canvas.list", { sessionId }, signal);
		}
		/** Persist one element's new canvas position (after a client drag). */
		function moveCanvasElement(sessionId, uuid, x, y, signal) {
			return call("canvas.move", {
				sessionId,
				uuid,
				x,
				y
			}, signal);
		}
		/** Delete one element from the canvas (also removes its edges). */
		function deleteCanvasElement(sessionId, uuid, signal) {
			return call("canvas.delete", {
				sessionId,
				uuid
			}, signal);
		}
		/** Upload a file (drag-dropped onto the canvas) and place it as a new element. */
		function uploadCanvasFile(sessionId, fileName, mediaBase64, opts, signal) {
			return call("canvas.upload", {
				sessionId,
				fileName,
				mediaBase64,
				...opts
			}, signal);
		}
		/**
		* Inject a user-role notice into the agent's next-step context
		* (non-waking). Used by the canvas UI's right-click menu and quick
		* action toolbar to ask the agent to regenerate / edit / run a
		* workflow. Per docs/product/04-ux-reliability.md §1 + §7.
		*
		* The optional `summary` is the short label shown in the agent's
		* inbox (truncated to 120 chars by the host).
		*/
		function notifyAgent(sessionId, message, summary, signal) {
			const payload = {
				sessionId,
				message
			};
			if (summary !== void 0) payload.summary = summary;
			return call("canvas.notify", payload, signal);
		}
		/**
		* Update one element's lifecycle status (draft/ready/rejected/archived)
		* and optional winner flag. Per docs/product/01-agent-autonomy.md §5
		* + docs/product/04-ux-reliability.md §1 (right-click → mark as
		* winner / rejected / archive).
		*/
		function setElementStatus(sessionId, uuid, status, winner, signal) {
			const payload = {
				sessionId,
				uuid,
				status
			};
			if (winner !== void 0) payload.winner = winner;
			return call("canvas.set_status", payload, signal);
		}
		/** Fetch the full runtime config (providers + global settings). */
		function fetchConfig(signal) {
			return call("config.get", {}, signal);
		}
		/** Add a new provider. */
		function addProvider(provider, signal) {
			return call("providers.add", { provider }, signal);
		}
		/** Update an existing provider. */
		function updateProvider(provider, signal) {
			return call("providers.update", { provider }, signal);
		}
		/** Remove a provider by id. */
		function removeProvider(id, signal) {
			return call("providers.remove", { id }, signal);
		}
		/** Build the media URL for one element's media file (by uuid; the host resolves to the file). */
		function mediaUrlOf(sessionId, uuid, download = false) {
			const params = new URLSearchParams({
				sessionId,
				uuid
			});
			if (download) params.set("download", "1");
			return `/aigc-canvas/file?${params.toString()}`;
		}
		/** Build the WebSocket URL for the canvas push endpoint. */
		function canvasWsUrl(sessionId) {
			return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/aigc-canvas/ws/canvas?sessionId=${encodeURIComponent(sessionId)}`;
		}
		/** Fetch the request log for one session (newest last). */
		function fetchRequestLog(sessionId, signal) {
			return call("logs.list", { sessionId }, signal);
		}
		/** Clear the request log for one session. */
		function clearRequestLog(sessionId, signal) {
			return call("logs.clear", { sessionId }, signal);
		}
		/** Fetch the per-session cost summary (for the canvas header). */
		function fetchSessionCost(sessionId, signal) {
			return call("cost.get", { sessionId }, signal);
		}
		/** Promote one canvas element (by uuid) to the asset library. */
		function promoteAsset(sessionId, uuid, opts, signal) {
			return call("library.promote", {
				sessionId,
				uuid,
				...opts
			}, signal);
		}
		//#endregion
		//#region src/client/store.ts
		/**
		* Canvas view store: subscribes to the host push WebSocket for one session
		* and exposes a synchronous snapshot through useSyncExternalStore. Replays
		* the latest snapshot on reconnect; falls back to a one-shot HTTP fetch
		* when the WS is unavailable so a deployment without the upgrade route
		* still renders the canvas (with manual refresh).
		*
		* The store is per-session: the better-sidebar tab instantiates one per
		* scope.sessionId, and disposes it on tab close (the WS closes with it).
		*/
		/** Empty canvas state used as the pre-load placeholder. */
		function emptyState(sessionId) {
			return {
				sessionId,
				elements: [],
				edges: []
			};
		}
		/** One store instance per tab activation. */
		var CanvasStore = class {
			opts;
			/** The session id this store is bound to. */
			sessionId;
			state;
			listeners = /* @__PURE__ */ new Set();
			ws;
			reconnectTimer;
			disposed = false;
			fetchAbort;
			constructor(opts) {
				this.opts = opts;
				this.sessionId = opts.sessionId;
				this.state = emptyState(opts.sessionId);
				this.refresh();
				this.openWs();
			}
			/** Snapshot reader for useSyncExternalStore. */
			getSnapshot = () => this.state;
			/** Subscribe listener; returns disposer. */
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			/** Force a refresh (e.g. user clicked a refresh button). */
			async refresh() {
				if (this.disposed) return;
				this.fetchAbort?.abort();
				const ac = new AbortController();
				this.fetchAbort = ac;
				try {
					const next = await fetchCanvas(this.opts.sessionId, ac.signal);
					if (!this.disposed) this.setState(next);
				} catch {}
			}
			/**
			* Persist a dragged element's new position. The authoritative snapshot
			* arrives over the WS push (the host notifies after persisting), so no
			* local state update is applied here.
			*/
			async move(uuid, x, y) {
				if (this.disposed) return;
				try {
					await moveCanvasElement(this.opts.sessionId, uuid, x, y);
				} catch {}
			}
			/** Delete an element (right-click → Delete). Best-effort; WS push catches up. */
			async deleteElement(uuid) {
				if (this.disposed) return;
				try {
					await deleteCanvasElement(this.opts.sessionId, uuid);
				} catch {}
			}
			/** Upload a drag-dropped file and place it on the canvas. */
			async uploadFile(fileName, mediaBase64, opts) {
				if (this.disposed) return;
				try {
					await uploadCanvasFile(this.opts.sessionId, fileName, mediaBase64, opts);
				} catch {}
			}
			/** Tear down: close WS, abort any in-flight fetch, drop listeners. */
			dispose() {
				this.disposed = true;
				this.fetchAbort?.abort();
				if (this.reconnectTimer !== void 0) {
					window.clearTimeout(this.reconnectTimer);
					this.reconnectTimer = void 0;
				}
				if (this.ws !== void 0) {
					try {
						this.ws.close();
					} catch {}
					this.ws = void 0;
				}
				this.listeners.clear();
			}
			setState(next) {
				this.state = next;
				for (const fn of [...this.listeners]) fn();
			}
			openWs() {
				if (this.disposed) return;
				let ws;
				try {
					ws = new WebSocket(canvasWsUrl(this.opts.sessionId));
				} catch {
					this.scheduleReconnect();
					return;
				}
				this.ws = ws;
				ws.onmessage = (event) => {
					try {
						const parsed = JSON.parse(event.data);
						if (parsed && typeof parsed.sessionId === "string") this.setState(parsed);
					} catch {}
				};
				ws.onclose = () => {
					if (this.disposed) return;
					this.ws = void 0;
					this.scheduleReconnect();
				};
				ws.onerror = () => {
					try {
						ws.close();
					} catch {}
				};
			}
			scheduleReconnect() {
				if (this.disposed) return;
				if (this.reconnectTimer !== void 0) return;
				this.reconnectTimer = window.setTimeout(() => {
					this.reconnectTimer = void 0;
					this.openWs();
				}, 2e3);
			}
		};
		//#endregion
		//#region \0dsh-css:D:\Projects\deepseek-harness\dsh-aigc-canvas\src\client\canvas.module.css.mjs
		const css$1 = "/* dsh-aigc-canvas client styles.\r\n *\r\n * Renders inside a better-sidebar tab panel. Follows the DSH core design\r\n * language: `--dsw-alias-*` semantic tokens, `--dsw-font-*` typography,\r\n * 36px header bar + 24x24 r6 icon buttons (mirror of SubagentView), 8px\r\n * radius cards on `--dsw-alias-bg-layer-2`, no aggressive borders —\r\n * hover/active fills carry the interaction state.\r\n */\r\n\r\n.i0op5y_canvas {\r\n  position: relative;\r\n  display: flex;\r\n  flex-direction: column;\r\n  height: 100%;\r\n  font: var(--dsw-font-s-14);\r\n  color: var(--dsw-alias-label-primary);\r\n  background: transparent;\r\n}\r\n\r\n/* ── Header bar (mirror SubagentView: 36px h, 0 8px 0 12px) ────────────── */\r\n\r\n.i0op5y_header {\r\n  flex: none;\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  height: 36px;\r\n  padding: 0 8px 0 12px;\r\n}\r\n\r\n.i0op5y_title {\r\n  flex: 1;\r\n  min-width: 0;\r\n  font: var(--dsw-font-s-14);\r\n  color: var(--dsw-alias-label-secondary);\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.i0op5y_count {\r\n  flex: none;\r\n  font: var(--dsw-font-xxxs-11);\r\n  color: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n/* Cost display in the header (per docs/product/04-ux-reliability.i0op5y_md §5). */\r\n.i0op5y_costDisplay {\r\n  flex: none;\r\n  font: var(--dsw-font-xxxs-11);\r\n  color: #4caf50;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n\r\n.i0op5y_zoom {\r\n  flex: none;\r\n  min-width: 36px;\r\n  text-align: center;\r\n  font: var(--dsw-font-xxxs-11);\r\n  color: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n.i0op5y_iconButton {\r\n  flex: none;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 24px;\r\n  height: 24px;\r\n  border: none;\r\n  border-radius: 6px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-secondary);\r\n  cursor: pointer;\r\n  font: var(--dsw-font-s-14);\r\n  line-height: 1;\r\n}\r\n\r\n.i0op5y_iconButton:hover {\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.i0op5y_iconButtonActive {\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n/* Zoom slider in the header. */\r\n.i0op5y_zoomSlider {\r\n  flex: none;\r\n  width: 80px;\r\n  height: 4px;\r\n  -webkit-appearance: none;\r\n  appearance: none;\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  border-radius: 2px;\r\n  outline: none;\r\n  cursor: pointer;\r\n}\r\n\r\n.i0op5y_zoomSlider::-webkit-slider-thumb {\r\n  -webkit-appearance: none;\r\n  appearance: none;\r\n  width: 12px;\r\n  height: 12px;\r\n  border-radius: 50%;\r\n  background: var(--dsw-alias-label-secondary);\r\n  cursor: pointer;\r\n}\r\n\r\n.i0op5y_zoomSlider::-moz-range-thumb {\r\n  width: 12px;\r\n  height: 12px;\r\n  border: none;\r\n  border-radius: 50%;\r\n  background: var(--dsw-alias-label-secondary);\r\n  cursor: pointer;\r\n}\r\n\r\n/* ── Infinite canvas surface ───────────────────────────────────────────── */\r\n\r\n.i0op5y_surface {\r\n  flex: 1 1 auto;\r\n  position: relative;\r\n  overflow: hidden;\r\n  touch-action: none;\r\n  cursor: grab;\r\n  background-color: transparent;\r\n  background-image:\r\n    radial-gradient(var(--dsw-alias-border-l2) 1px, transparent 1px);\r\n  background-size: 24px 24px;\r\n}\r\n\r\n.i0op5y_surface:active {\r\n  cursor: grabbing;\r\n}\r\n\r\n.i0op5y_world {\r\n  position: absolute;\r\n  left: 0;\r\n  top: 0;\r\n  transform-origin: 0 0;\r\n}\r\n\r\n.i0op5y_edgeLayer {\r\n  position: absolute;\r\n  left: 0;\r\n  top: 0;\r\n  width: 1px;\r\n  height: 1px;\r\n  overflow: visible;\r\n  pointer-events: none;\r\n}\r\n\r\n.i0op5y_edgeLine {\r\n  stroke: var(--dsw-alias-label-tertiary);\r\n  stroke-width: 2.5;\r\n  stroke-opacity: 0.55;\r\n  fill: none;\r\n  stroke-linecap: round;\r\n  stroke-linejoin: round;\r\n}\r\n\r\n/* Line-style variants per EdgeRelation group (see CanvasView.i0op5y_lineStyleOf).\r\n * Applied as an additional class alongside .i0op5y_edgeLine / .i0op5y_edgeArrow. */\r\n\r\n/* Direct inputs: input / first_frame / last_frame / audio_track (default solid). */\r\n.i0op5y_edgeLineSolid {\r\n  stroke: var(--dsw-alias-label-tertiary);\r\n  stroke-dasharray: none;\r\n  stroke-width: 2.5;\r\n}\r\n\r\n/* References: reference / style / mask (dashed). */\r\n.i0op5y_edgeLineDashed {\r\n  stroke: #5b8def;\r\n  stroke-dasharray: 8 4;\r\n  stroke-width: 2;\r\n  stroke-opacity: 0.7;\r\n}\r\n\r\n/* Variations / candidates: variation_of / remix_of / alternative_of (dotted). */\r\n.i0op5y_edgeLineDotted {\r\n  stroke: #c77dff;\r\n  stroke-dasharray: 2 4;\r\n  stroke-width: 2;\r\n  stroke-opacity: 0.7;\r\n}\r\n\r\n/* Edit chain: edited_from (bold solid). */\r\n.i0op5y_edgeLineBold {\r\n  stroke: var(--dsw-alias-label-secondary);\r\n  stroke-dasharray: none;\r\n  stroke-width: 4;\r\n  stroke-opacity: 0.8;\r\n}\r\n\r\n.i0op5y_edgeArrow {\r\n  fill: var(--dsw-alias-label-tertiary);\r\n  fill-opacity: 0.6;\r\n  stroke: var(--dsw-alias-label-tertiary);\r\n  stroke-width: 1;\r\n  stroke-opacity: 0.6;\r\n}\r\n\r\n/* The line-style class also applies to the arrowhead so the arrow matches\r\n * the line color + opacity of its relation group. */\r\n.i0op5y_edgeArrow.i0op5y_edgeLineDashed {\r\n  fill: #5b8def;\r\n  stroke: #5b8def;\r\n  fill-opacity: 0.7;\r\n  stroke-opacity: 0.7;\r\n}\r\n.i0op5y_edgeArrow.i0op5y_edgeLineDotted {\r\n  fill: #c77dff;\r\n  stroke: #c77dff;\r\n  fill-opacity: 0.7;\r\n  stroke-opacity: 0.7;\r\n}\r\n.i0op5y_edgeArrow.i0op5y_edgeLineBold {\r\n  fill: var(--dsw-alias-label-secondary);\r\n  stroke: var(--dsw-alias-label-secondary);\r\n  fill-opacity: 0.8;\r\n  stroke-opacity: 0.8;\r\n}\r\n\r\n/* Label chip rendered at the curve midpoint (the relation short name). */\r\n.i0op5y_edgeLabelBg {\r\n  fill: var(--dsw-alias-bg-layer-2);\r\n  stroke: var(--dsw-alias-border-l2);\r\n  stroke-width: 1;\r\n}\r\n\r\n.i0op5y_edgeLabel {\r\n  font: var(--dsw-font-xxxs-11);\r\n  fill: var(--dsw-alias-label-secondary);\r\n  text-anchor: middle;\r\n  dominant-baseline: middle;\r\n  user-select: none;\r\n  pointer-events: none;\r\n}\r\n\r\n.i0op5y_edgePort {\r\n  fill: var(--dsw-alias-bg-layer-2);\r\n  stroke: var(--dsw-alias-label-tertiary);\r\n  stroke-width: 2;\r\n  stroke-opacity: 0.7;\r\n}\r\n\r\n.i0op5y_nodeBox {\r\n  position: absolute;\r\n  left: 0;\r\n  top: 0;\r\n  width: 240px;\r\n}\r\n\r\n.i0op5y_nodeBoxDraggable {\r\n  cursor: move;\r\n  touch-action: none;\r\n}\r\n\r\n.i0op5y_empty {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n  padding: 24px 16px;\r\n  font: var(--dsw-font-xxs-12);\r\n  color: var(--dsw-alias-label-tertiary);\r\n  text-align: center;\r\n}\r\n\r\n.i0op5y_emptyHint {\r\n  font: var(--dsw-font-xxxs-11);\r\n  color: var(--dsw-alias-label-dimmed);\r\n}\r\n\r\n/* ── Node card (8px radius, bg-layer-2, no aggressive borders) ─────────── */\r\n\r\n.i0op5y_node {\r\n  border-radius: 8px;\r\n  background: var(--dsw-alias-bg-layer-2);\r\n  overflow: hidden;\r\n}\r\n\r\n/* Lifecycle status visual differences (per docs/product/01-agent-autonomy.i0op5y_md §5).\r\n * draft: semi-transparent + loading animation\r\n * rejected: greyed 50% + strikethrough title\r\n * archived: greyed 30% (default hidden, shown only when filter is on)\r\n */\r\n.i0op5y_nodeStatus_draft {\r\n  opacity: 0.6;\r\n}\r\n\r\n.i0op5y_nodeStatus_rejected {\r\n  opacity: 0.5;\r\n  filter: grayscale(0.7);\r\n}\r\n\r\n.i0op5y_nodeStatus_rejected .i0op5y_nodeTitle {\r\n  text-decoration: line-through;\r\n}\r\n\r\n.i0op5y_nodeStatus_archived {\r\n  opacity: 0.3;\r\n  filter: grayscale(0.8);\r\n}\r\n\r\n/* Winner badge (gold star, shown when element.i0op5y_winner === true). */\r\n.i0op5y_winnerBadge {\r\n  margin-left: 4px;\r\n  color: #ffc107;\r\n  font-size: 14px;\r\n  line-height: 1;\r\n}\r\n\r\n.i0op5y_nodeHeader {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  padding: 6px 10px;\r\n}\r\n\r\n.i0op5y_kindDot {\r\n  flex: none;\r\n  width: 6px;\r\n  height: 6px;\r\n  border-radius: 50%;\r\n  background: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n.i0op5y_kindDot_image { background: #4caf50; }\r\n.i0op5y_kindDot_video { background: #ff9800; }\r\n.i0op5y_kindDot_audio { background: #ab47bc; }\r\n.i0op5y_kindDot_prompt { background: #6b8cff; }\r\n\r\n.i0op5y_kindLabel {\r\n  font: var(--dsw-font-xxxs-11);\r\n  color: var(--dsw-alias-label-tertiary);\r\n  text-transform: lowercase;\r\n}\r\n\r\n.i0op5y_nodeTime {\r\n  margin-left: auto;\r\n  font: var(--dsw-font-xxxs-11);\r\n  color: var(--dsw-alias-label-dimmed);\r\n}\r\n\r\n.i0op5y_nodeTitle {\r\n  padding: 0 10px 4px;\r\n  font: var(--dsw-font-s-14);\r\n  color: var(--dsw-alias-label-primary);\r\n  word-break: break-word;\r\n}\r\n\r\n.i0op5y_nodeDescription {\r\n  padding: 0 10px 4px;\r\n  font: var(--dsw-font-xxs-12);\r\n  color: var(--dsw-alias-label-tertiary);\r\n  font-style: italic;\r\n  word-break: break-word;\r\n}\r\n\r\n.i0op5y_nodeMedia {\r\n  padding: 0 10px 8px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 4px;\r\n  max-width: 100%;\r\n}\r\n\r\n.i0op5y_promptText {\r\n  margin: 0;\r\n  padding: 6px 8px;\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  border-radius: 6px;\r\n  font: var(--dsw-font-xxs-12);\r\n  font-family: var(--ds-font-family-code);\r\n  white-space: pre-wrap;\r\n  word-break: break-word;\r\n  max-height: 200px;\r\n  overflow-y: auto;\r\n  color: var(--dsw-alias-label-secondary);\r\n}\r\n\r\n.i0op5y_mediaImage {\r\n  /* Counter-scale trick: decode at the on-screen pixel size (layout width\r\n   * × zoom) so zooming in stays crisp, then visually shrink back to the\r\n   * layout box. `--canvas-scale` is set on the world layer by CanvasView;\r\n   * `--media-ratio` (h/w) is set on each img by CanvasNode after onLoad.\r\n   *\r\n   * width = 100% × scale        → layout box (e.i0op5y_g. 880px at 4× zoom)\r\n   * transform: scale(1/scale)   → visual 220px (back to layout box size)\r\n   * margin-right: 100% × (1-s)  → cancel horizontal layout inflation\r\n   * margin-bottom: 100% × ratio × (1-s) → cancel vertical layout inflation\r\n   *\r\n   * Percentages on margin resolve against the containing block's WIDTH\r\n   * (the 220px card content area), so `100%` = 220px here — which is\r\n   * exactly the visual width, making the math work out. */\r\n  width: calc(100% * var(--canvas-scale, 1));\r\n  max-width: none;\r\n  height: auto;\r\n  transform: scale(calc(1 / var(--canvas-scale, 1)));\r\n  transform-origin: top left;\r\n  margin-right: calc(100% * (1 - var(--canvas-scale, 1)));\r\n  margin-bottom: calc(100% * var(--media-ratio, 0.75) * (1 - var(--canvas-scale, 1)));\r\n  border-radius: 4px;\r\n  display: block;\r\n}\r\n\r\n.i0op5y_mediaVideo {\r\n  width: calc(100% * var(--canvas-scale, 1));\r\n  max-width: none;\r\n  height: auto;\r\n  transform: scale(calc(1 / var(--canvas-scale, 1)));\r\n  transform-origin: top left;\r\n  margin-right: calc(100% * (1 - var(--canvas-scale, 1)));\r\n  margin-bottom: calc(100% * var(--media-ratio, 0.75) * (1 - var(--canvas-scale, 1)));\r\n  border-radius: 4px;\r\n  display: block;\r\n}\r\n\r\n.i0op5y_mediaAudio {\r\n  width: 100%;\r\n  display: block;\r\n}\r\n\r\n.i0op5y_boundaryError {\r\n  margin: 8px;\r\n  padding: 8px 12px;\r\n  font: var(--dsw-font-xxs-12);\r\n  color: var(--dsw-alias-state-error-primary);\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  border-radius: 6px;\r\n}\r\n\r\n/* ── Detail panel (elevated surface, mirror Modal/Panel aesthetic) ─────── */\r\n\r\n.i0op5y_detailPanel {\r\n  position: absolute;\r\n  right: 8px;\r\n  top: 44px;\r\n  bottom: 8px;\r\n  width: 280px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  background: var(--dsw-alias-bg-layer-2);\r\n  border-radius: 12px;\r\n  box-shadow: var(--dsw-shadow-lv3);\r\n  z-index: 10;\r\n  overflow: hidden;\r\n  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);\r\n  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);\r\n}\r\n\r\n.i0op5y_detailHeader {\r\n  flex: none;\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  padding: 8px 10px;\r\n}\r\n\r\n.i0op5y_detailTitle {\r\n  flex: 1 1 auto;\r\n  min-width: 0;\r\n  font: var(--dsw-font-s-14);\r\n  color: var(--dsw-alias-label-primary);\r\n  word-break: break-word;\r\n}\r\n\r\n.i0op5y_detailClose {\r\n  flex: none;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 24px;\r\n  height: 24px;\r\n  border: none;\r\n  border-radius: 6px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-secondary);\r\n  cursor: pointer;\r\n  font: var(--dsw-font-s-14);\r\n  line-height: 1;\r\n}\r\n\r\n.i0op5y_detailClose:hover {\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.i0op5y_detailBody {\r\n  flex: 1 1 auto;\r\n  min-height: 0;\r\n  overflow-y: auto;\r\n  padding: 0 10px 10px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n}\r\n\r\n.i0op5y_detailBlock {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 4px;\r\n  min-width: 0;\r\n}\r\n\r\n.i0op5y_detailLabel {\r\n  font: var(--dsw-font-xxxs-11);\r\n  color: var(--dsw-alias-label-tertiary);\r\n  text-transform: lowercase;\r\n}\r\n\r\n.i0op5y_detailPrompt {\r\n  margin: 0;\r\n  padding: 6px 8px;\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  border-radius: 6px;\r\n  font: var(--dsw-font-xxs-12);\r\n  font-family: var(--ds-font-family-code);\r\n  white-space: pre-wrap;\r\n  word-break: break-word;\r\n  max-height: 160px;\r\n  overflow-y: auto;\r\n  color: var(--dsw-alias-label-secondary);\r\n}\r\n\r\n.i0op5y_detailValue {\r\n  font: var(--dsw-font-xxs-12);\r\n  color: var(--dsw-alias-label-secondary);\r\n  word-break: break-word;\r\n}\r\n\r\n.i0op5y_metaList {\r\n  margin: 0;\r\n  padding: 0;\r\n  display: grid;\r\n  grid-template-columns: auto 1fr;\r\n  gap: 2px 8px;\r\n  font: var(--dsw-font-xxxs-11);\r\n  color: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n.i0op5y_metaKey {\r\n  font: var(--dsw-font-xxxs-strong-11);\r\n  color: var(--dsw-alias-label-secondary);\r\n  text-transform: lowercase;\r\n}\r\n\r\n.i0op5y_metaValue {\r\n  margin: 0;\r\n  color: var(--dsw-alias-label-secondary);\r\n  word-break: break-all;\r\n  font-family: var(--ds-font-family-code);\r\n}\r\n\r\n.i0op5y_filePath {\r\n  display: block;\r\n  font: var(--dsw-font-xxxs-11);\r\n  font-family: var(--ds-font-family-code);\r\n  color: var(--dsw-alias-label-tertiary);\r\n  word-break: break-all;\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  padding: 4px 6px;\r\n  border-radius: 4px;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n\r\n/* ── Minimap (bottom-right overview) ──────────────────────────────────── */\r\n\r\n.i0op5y_minimap {\r\n  position: absolute;\r\n  right: 8px;\r\n  bottom: 8px;\r\n  z-index: 5;\r\n  background: var(--dsw-alias-bg-layer-2);\r\n  border-radius: 8px;\r\n  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);\r\n  padding: 4px;\r\n  cursor: pointer;\r\n  overflow: hidden;\r\n}\r\n\r\n.i0op5y_minimapSvg {\r\n  display: block;\r\n  pointer-events: none;\r\n}\r\n\r\n/* ── Right-click context menu ─────────────────────────────────────────── */\r\n\r\n.i0op5y_contextMenu {\r\n  position: fixed;\r\n  z-index: 20;\r\n  min-width: 160px;\r\n  background: var(--dsw-alias-bg-layer-2);\r\n  border-radius: 8px;\r\n  box-shadow: var(--dsw-shadow-lv3);\r\n  padding: 4px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n}\r\n\r\n.i0op5y_contextMenuItem {\r\n  display: block;\r\n  width: 100%;\r\n  padding: 6px 10px;\r\n  border: none;\r\n  border-radius: 6px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-primary);\r\n  font: var(--dsw-font-xxs-12);\r\n  text-align: left;\r\n  cursor: pointer;\r\n}\r\n\r\n.i0op5y_contextMenuItem:hover {\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n/* The Delete item keeps the destructive (red) styling from the old\r\n * single-item menu so it's visually distinct from the status / agent\r\n * actions above the separator. */\r\n.i0op5y_contextMenuItemDanger:hover {\r\n  background: var(--dsw-alias-state-error-bg);\r\n  color: var(--dsw-alias-state-error-primary);\r\n}\r\n\r\n/* Disabled state (e.i0op5y_g. \"Mark as winner\" on a prompt element with no media,\r\n * or \"Edit selected\" with no selection). */\r\n.i0op5y_contextMenuItemDisabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n.i0op5y_contextMenuItemDisabled:hover {\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n/* Horizontal rule between action groups (regenerate → download,\r\n * promote → status, status → delete). */\r\n.i0op5y_contextMenuSeparator {\r\n  height: 1px;\r\n  margin: 4px 6px;\r\n  background: var(--dsw-alias-border-l2);\r\n  border: none;\r\n}\r\n\r\n/* ── Quick action toolbar (left side of the canvas, per doc 04 §7) ────── */\r\n\r\n.i0op5y_toolbar {\r\n  position: absolute;\r\n  left: 8px;\r\n  top: 8px;\r\n  z-index: 8;\r\n  display: flex;\r\n  gap: 4px;\r\n  padding: 4px;\r\n  background: var(--dsw-alias-bg-layer-2);\r\n  border-radius: 8px;\r\n  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);\r\n}\r\n\r\n.i0op5y_toolbarButton {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n  padding: 5px 10px;\r\n  border: none;\r\n  border-radius: 6px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-primary);\r\n  font: var(--dsw-font-xxs-12);\r\n  cursor: pointer;\r\n  white-space: nowrap;\r\n}\r\n\r\n.i0op5y_toolbarButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.i0op5y_toolbarButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n/* ── Drag-drop indicator + upload overlay ─────────────────────────────── */\r\n\r\n.i0op5y_dropIndicator {\r\n  position: absolute;\r\n  left: 0;\r\n  top: 0;\r\n  width: 240px;\r\n  height: 110px;\r\n  border: 2px dashed var(--dsw-alias-label-secondary);\r\n  border-radius: 8px;\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  opacity: 0.5;\r\n  pointer-events: none;\r\n  transform-origin: 0 0;\r\n}\r\n\r\n.i0op5y_uploadOverlay {\r\n  position: absolute;\r\n  inset: 0;\r\n  z-index: 15;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  background: var(--dsw-alias-bg-layer-1);\r\n  opacity: 0.6;\r\n  font: var(--dsw-font-s-14);\r\n  color: var(--dsw-alias-label-secondary);\r\n  pointer-events: none;\r\n}\r\n\r\n/* ── Request log panel (per docs/product/04-ux-reliability.i0op5y_md §3) ──────── */\r\n\r\n.i0op5y_logPanel {\r\n  position: absolute;\r\n  right: 8px;\r\n  top: 44px;\r\n  bottom: 8px;\r\n  width: 480px;\r\n  max-width: calc(100% - 16px);\r\n  display: flex;\r\n  flex-direction: column;\r\n  background: var(--dsw-alias-bg-layer-2);\r\n  border-radius: 12px;\r\n  box-shadow: var(--dsw-shadow-lv3);\r\n  z-index: 12;\r\n  overflow: hidden;\r\n  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);\r\n  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);\r\n}\r\n\r\n.i0op5y_logPanelHeader {\r\n  flex: none;\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  padding: 8px 10px;\r\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\r\n}\r\n\r\n.i0op5y_logPanelTitle {\r\n  flex: 1;\r\n  font: var(--dsw-font-s-14);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.i0op5y_logPanelClear {\r\n  flex: none;\r\n  padding: 4px 10px;\r\n  border: none;\r\n  border-radius: 6px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-secondary);\r\n  font: var(--dsw-font-xxs-12);\r\n  cursor: pointer;\r\n}\r\n\r\n.i0op5y_logPanelClear:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.i0op5y_logPanelClear:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n.i0op5y_logList {\r\n  flex: 1 1 auto;\r\n  min-height: 0;\r\n  overflow-y: auto;\r\n  padding: 4px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n}\r\n\r\n.i0op5y_logRow {\r\n  display: flex;\r\n  flex-direction: column;\r\n  border-radius: 6px;\r\n  overflow: hidden;\r\n}\r\n\r\n.i0op5y_logRowHeader {\r\n  display: grid;\r\n  grid-template-columns: 80px 1fr 40px 50px 60px 16px;\r\n  gap: 6px;\r\n  align-items: center;\r\n  padding: 5px 8px;\r\n  border: none;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-secondary);\r\n  font: var(--dsw-font-xxxs-11);\r\n  font-family: var(--ds-font-family-code);\r\n  cursor: pointer;\r\n  text-align: left;\r\n  border-radius: 6px;\r\n}\r\n\r\n.i0op5y_logRowHeader:hover {\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n}\r\n\r\n.i0op5y_logRowFailed {\r\n  color: var(--dsw-alias-state-error-primary);\r\n  background: var(--dsw-alias-state-error-bg);\r\n}\r\n\r\n.i0op5y_logRowFailed:hover {\r\n  background: var(--dsw-alias-state-error-bg);\r\n  filter: brightness(0.95);\r\n}\r\n\r\n.i0op5y_logTime {\r\n  color: var(--dsw-alias-label-dimmed);\r\n  white-space: nowrap;\r\n}\r\n\r\n.i0op5y_logLabel {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.i0op5y_logStatus {\r\n  text-align: right;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n\r\n.i0op5y_logDuration {\r\n  text-align: right;\r\n  font-variant-numeric: tabular-nums;\r\n  color: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n.i0op5y_logSize {\r\n  text-align: right;\r\n  font-variant-numeric: tabular-nums;\r\n  color: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n.i0op5y_logExpand {\r\n  text-align: center;\r\n  color: var(--dsw-alias-label-dimmed);\r\n}\r\n\r\n.i0op5y_logDetail {\r\n  padding: 6px 10px 8px;\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n  border-top: 1px solid var(--dsw-alias-border-l2);\r\n}\r\n\r\n.i0op5y_logError {\r\n  font: var(--dsw-font-xxs-12);\r\n  color: var(--dsw-alias-state-error-primary);\r\n  word-break: break-word;\r\n}\r\n\r\n.i0op5y_logDetailBlock {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n  min-width: 0;\r\n}\r\n\r\n.i0op5y_logDetailLabel {\r\n  font: var(--dsw-font-xxxs-11);\r\n  color: var(--dsw-alias-label-tertiary);\r\n  text-transform: lowercase;\r\n}\r\n\r\n.i0op5y_logDetailPre {\r\n  margin: 0;\r\n  padding: 4px 6px;\r\n  background: var(--dsw-alias-bg-layer-1);\r\n  border-radius: 4px;\r\n  font: var(--dsw-font-xxxs-11);\r\n  font-family: var(--ds-font-family-code);\r\n  white-space: pre-wrap;\r\n  word-break: break-all;\r\n  max-height: 160px;\r\n  overflow-y: auto;\r\n  color: var(--dsw-alias-label-secondary);\r\n}\r\n\r\n.i0op5y_logFilePath {\r\n  display: block;\r\n  font: var(--dsw-font-xxxs-11);\r\n  font-family: var(--ds-font-family-code);\r\n  color: var(--dsw-alias-label-tertiary);\r\n  word-break: break-all;\r\n  background: var(--dsw-alias-bg-layer-1);\r\n  padding: 4px 6px;\r\n  border-radius: 4px;\r\n}\r\n\r\n.i0op5y_logLocateButton {\r\n  align-self: flex-start;\r\n  margin-top: 4px;\r\n  padding: 3px 8px;\r\n  border: none;\r\n  border-radius: 4px;\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  color: var(--dsw-alias-label-secondary);\r\n  font: var(--dsw-font-xxxs-11);\r\n  cursor: pointer;\r\n}\r\n\r\n.i0op5y_logLocateButton:hover {\r\n  background: var(--dsw-alias-interactive-bg-active);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n/* ── Multi-select + Compare view (per docs/product/04-ux-reliability.i0op5y_md §2) */\r\n\r\n/* Outline drawn around nodes that are in the multi-select set. The\r\n * outline uses the brand color so it's clearly distinguishable from the\r\n * regular hover/focus ring. Drawn on the nodeBox wrapper (not the inner\r\n * .i0op5y_node card) so it doesn't fight with the card's own border-radius. */\r\n.i0op5y_nodeBoxMultiSelected {\r\n  outline: 2px solid var(--dsw-alias-brand-primary);\r\n  outline-offset: 2px;\r\n  border-radius: 10px;\r\n}\r\n\r\n/* Floating bar above the canvas (top-center) that appears when 2-4\r\n * elements are in the multi-select set. Shows the count + a \"Compare\"\r\n * button + a \"Clear\" button. */\r\n.i0op5y_multiSelectBar {\r\n  position: absolute;\r\n  top: 8px;\r\n  left: 50%;\r\n  transform: translateX(-50%);\r\n  z-index: 9;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  padding: 4px 6px;\r\n  background: var(--dsw-alias-bg-layer-2);\r\n  border-radius: 8px;\r\n  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);\r\n}\r\n\r\n.i0op5y_multiSelectCount {\r\n  font: var(--dsw-font-xxs-12);\r\n  color: var(--dsw-alias-label-secondary);\r\n  padding: 0 4px;\r\n  white-space: nowrap;\r\n}\r\n\r\n.i0op5y_multiSelectCompareButton {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  padding: 5px 12px;\r\n  border: none;\r\n  border-radius: 6px;\r\n  background: var(--dsw-alias-brand-primary);\r\n  color: var(--dsw-alias-label-primary-foreground);\r\n  font: var(--dsw-font-xxs-12);\r\n  cursor: pointer;\r\n  white-space: nowrap;\r\n}\r\n\r\n.i0op5y_multiSelectCompareButton:hover:not(:disabled) {\r\n  filter: brightness(1.05);\r\n}\r\n\r\n.i0op5y_multiSelectCompareButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n.i0op5y_multiSelectClearButton {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  padding: 5px 10px;\r\n  border: none;\r\n  border-radius: 6px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-secondary);\r\n  font: var(--dsw-font-xxs-12);\r\n  cursor: pointer;\r\n  white-space: nowrap;\r\n}\r\n\r\n.i0op5y_multiSelectClearButton:hover {\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n/* The compare overlay: covers the entire canvas surface with a semi-opaque\r\n * backdrop so the user can focus on comparing the selected elements.\r\n * Stops wheel + pointer events from reaching the canvas surface below. */\r\n.i0op5y_compareOverlay {\r\n  position: absolute;\r\n  inset: 36px 0 0 0;\r\n  z-index: 18;\r\n  display: flex;\r\n  flex-direction: column;\r\n  background: var(--dsw-alias-bg-layer-1);\r\n  /* Slight opacity so the canvas is still hinted behind, but the focus\r\n   * is clearly on the compare cards. */\r\n  backdrop-filter: blur(2px);\r\n}\r\n\r\n.i0op5y_compareHeader {\r\n  flex: none;\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  padding: 8px 12px;\r\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\r\n}\r\n\r\n.i0op5y_compareTitle {\r\n  flex: 1;\r\n  font: var(--dsw-font-s-14);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.i0op5y_compareCloseButton {\r\n  flex: none;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 24px;\r\n  height: 24px;\r\n  border: none;\r\n  border-radius: 6px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-secondary);\r\n  cursor: pointer;\r\n  font: var(--dsw-font-s-14);\r\n  line-height: 1;\r\n}\r\n\r\n.i0op5y_compareCloseButton:hover {\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n/* Grid of compare cards. Up to 4 columns; each card takes an equal\r\n * fraction of the available width. On narrow viewports the cards wrap\r\n * to the next row (rare in practice — the overlay is wide). */\r\n.i0op5y_compareGrid {\r\n  flex: 1 1 auto;\r\n  min-height: 0;\r\n  overflow-y: auto;\r\n  padding: 12px;\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));\r\n  gap: 12px;\r\n  align-content: start;\r\n}\r\n\r\n/* One compare card: media box on top, prompt + meta + winner button below. */\r\n.i0op5y_compareCard {\r\n  display: flex;\r\n  flex-direction: column;\r\n  background: var(--dsw-alias-bg-layer-2);\r\n  border-radius: 12px;\r\n  box-shadow: var(--dsw-shadow-lv3);\r\n  overflow: hidden;\r\n  /* Equal height per row (so the winner buttons line up at the bottom). */\r\n  min-height: 320px;\r\n}\r\n\r\n/* Media box: fixed target height so all cards in one row line up.\r\n * Media is `object-fit: contain` so different aspect ratios still\r\n * render fully without distortion. */\r\n.i0op5y_compareCardMedia {\r\n  flex: 0 0 200px;\r\n  width: 100%;\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  overflow: hidden;\r\n}\r\n\r\n.i0op5y_compareMediaImage,\r\n.i0op5y_compareMediaVideo {\r\n  max-width: 100%;\r\n  max-height: 100%;\r\n  object-fit: contain;\r\n  display: block;\r\n}\r\n\r\n.i0op5y_compareMediaAudioWrap {\r\n  width: 100%;\r\n  padding: 0 12px;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n}\r\n\r\n.i0op5y_compareMediaAudio {\r\n  width: 100%;\r\n}\r\n\r\n.i0op5y_compareMediaEmpty {\r\n  font: var(--dsw-font-xxs-12);\r\n  color: var(--dsw-alias-label-tertiary);\r\n  text-align: center;\r\n  padding: 12px;\r\n  word-break: break-word;\r\n}\r\n\r\n.i0op5y_compareCardBody {\r\n  flex: 1 1 auto;\r\n  min-height: 0;\r\n  overflow-y: auto;\r\n  padding: 10px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n}\r\n\r\n.i0op5y_comparePrompt {\r\n  margin: 0;\r\n  padding: 6px 8px;\r\n  background: var(--dsw-alias-interactive-bg-hover);\r\n  border-radius: 6px;\r\n  font: var(--dsw-font-xxs-12);\r\n  font-family: var(--ds-font-family-code);\r\n  white-space: pre-wrap;\r\n  word-break: break-word;\r\n  max-height: 120px;\r\n  overflow-y: auto;\r\n  color: var(--dsw-alias-label-secondary);\r\n}\r\n\r\n.i0op5y_comparePromptEmpty {\r\n  font: var(--dsw-font-xxs-12);\r\n  color: var(--dsw-alias-label-dimmed);\r\n  font-style: italic;\r\n  padding: 6px 8px;\r\n}\r\n\r\n.i0op5y_compareMetaRow {\r\n  display: flex;\r\n  gap: 6px;\r\n  align-items: baseline;\r\n  font: var(--dsw-font-xxxs-11);\r\n  color: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n.i0op5y_compareMetaLabel {\r\n  flex: none;\r\n  color: var(--dsw-alias-label-secondary);\r\n  text-transform: lowercase;\r\n}\r\n\r\n.i0op5y_compareMetaValue {\r\n  flex: 1 1 auto;\r\n  color: var(--dsw-alias-label-primary);\r\n  font-variant-numeric: tabular-nums;\r\n  word-break: break-all;\r\n}\r\n\r\n.i0op5y_compareCardFooter {\r\n  flex: none;\r\n  padding: 8px 10px;\r\n  border-top: 1px solid var(--dsw-alias-border-l2);\r\n  display: flex;\r\n  justify-content: center;\r\n}\r\n\r\n/* Compare footer (overlay-level): the \"Reject all\" + \"Close\" buttons. */\r\n.i0op5y_compareFooter {\r\n  flex: none;\r\n  display: flex;\r\n  justify-content: flex-end;\r\n  gap: 8px;\r\n  padding: 10px 12px;\r\n  border-top: 1px solid var(--dsw-alias-border-l2);\r\n  background: var(--dsw-alias-bg-layer-2);\r\n}\r\n\r\n/* Button styles for the compare view (primary / secondary / danger).\r\n * These mirror the toolbar button aesthetic but are slightly taller\r\n * (h32 r8 instead of h24 r6) since the compare footer has more room\r\n * and the actions are consequential. */\r\n.i0op5y_compareButtonPrimary {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  padding: 6px 14px;\r\n  border: none;\r\n  border-radius: 6px;\r\n  background: var(--dsw-alias-brand-primary);\r\n  color: var(--dsw-alias-label-primary-foreground);\r\n  font: var(--dsw-font-xxs-12);\r\n  cursor: pointer;\r\n  white-space: nowrap;\r\n}\r\n\r\n.i0op5y_compareButtonPrimary:hover:not(:disabled) {\r\n  filter: brightness(1.05);\r\n}\r\n\r\n.i0op5y_compareButtonPrimary:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n.i0op5y_compareButtonSecondary {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  padding: 6px 14px;\r\n  border: 1px solid var(--dsw-alias-border-l2);\r\n  border-radius: 6px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-primary);\r\n  font: var(--dsw-font-xxs-12);\r\n  cursor: pointer;\r\n  white-space: nowrap;\r\n}\r\n\r\n.i0op5y_compareButtonSecondary:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover-solid);\r\n}\r\n\r\n.i0op5y_compareButtonDanger {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  padding: 6px 14px;\r\n  border: none;\r\n  border-radius: 6px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-state-error-primary);\r\n  font: var(--dsw-font-xxs-12);\r\n  cursor: pointer;\r\n  white-space: nowrap;\r\n}\r\n\r\n.i0op5y_compareButtonDanger:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover-danger);\r\n}\r\n\r\n.i0op5y_compareButtonDanger:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n";
		const tagId$1 = "@huanlin/dsh-plugin-aigc-canvas/canvas.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@huanlin/dsh-plugin-aigc-canvas";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var canvas_module_css_default = {
			"canvas": "i0op5y_canvas",
			"header": "i0op5y_header",
			"title": "i0op5y_title",
			"count": "i0op5y_count",
			"md": "i0op5y_md",
			"costDisplay": "i0op5y_costDisplay",
			"zoom": "i0op5y_zoom",
			"iconButton": "i0op5y_iconButton",
			"iconButtonActive": "i0op5y_iconButtonActive",
			"zoomSlider": "i0op5y_zoomSlider",
			"surface": "i0op5y_surface",
			"world": "i0op5y_world",
			"edgeLayer": "i0op5y_edgeLayer",
			"edgeLine": "i0op5y_edgeLine",
			"lineStyleOf": "i0op5y_lineStyleOf",
			"edgeArrow": "i0op5y_edgeArrow",
			"edgeLineSolid": "i0op5y_edgeLineSolid",
			"edgeLineDashed": "i0op5y_edgeLineDashed",
			"edgeLineDotted": "i0op5y_edgeLineDotted",
			"edgeLineBold": "i0op5y_edgeLineBold",
			"edgeLabelBg": "i0op5y_edgeLabelBg",
			"edgeLabel": "i0op5y_edgeLabel",
			"edgePort": "i0op5y_edgePort",
			"nodeBox": "i0op5y_nodeBox",
			"nodeBoxDraggable": "i0op5y_nodeBoxDraggable",
			"empty": "i0op5y_empty",
			"emptyHint": "i0op5y_emptyHint",
			"node": "i0op5y_node",
			"nodeStatus_draft": "i0op5y_nodeStatus_draft",
			"nodeStatus_rejected": "i0op5y_nodeStatus_rejected",
			"nodeTitle": "i0op5y_nodeTitle",
			"nodeStatus_archived": "i0op5y_nodeStatus_archived",
			"winner": "i0op5y_winner",
			"winnerBadge": "i0op5y_winnerBadge",
			"nodeHeader": "i0op5y_nodeHeader",
			"kindDot": "i0op5y_kindDot",
			"kindDot_image": "i0op5y_kindDot_image",
			"kindDot_video": "i0op5y_kindDot_video",
			"kindDot_audio": "i0op5y_kindDot_audio",
			"kindDot_prompt": "i0op5y_kindDot_prompt",
			"kindLabel": "i0op5y_kindLabel",
			"nodeTime": "i0op5y_nodeTime",
			"nodeDescription": "i0op5y_nodeDescription",
			"nodeMedia": "i0op5y_nodeMedia",
			"promptText": "i0op5y_promptText",
			"mediaImage": "i0op5y_mediaImage",
			"g": "i0op5y_g",
			"mediaVideo": "i0op5y_mediaVideo",
			"mediaAudio": "i0op5y_mediaAudio",
			"boundaryError": "i0op5y_boundaryError",
			"detailPanel": "i0op5y_detailPanel",
			"detailHeader": "i0op5y_detailHeader",
			"detailTitle": "i0op5y_detailTitle",
			"detailClose": "i0op5y_detailClose",
			"detailBody": "i0op5y_detailBody",
			"detailBlock": "i0op5y_detailBlock",
			"detailLabel": "i0op5y_detailLabel",
			"detailPrompt": "i0op5y_detailPrompt",
			"detailValue": "i0op5y_detailValue",
			"metaList": "i0op5y_metaList",
			"metaKey": "i0op5y_metaKey",
			"metaValue": "i0op5y_metaValue",
			"filePath": "i0op5y_filePath",
			"minimap": "i0op5y_minimap",
			"minimapSvg": "i0op5y_minimapSvg",
			"contextMenu": "i0op5y_contextMenu",
			"contextMenuItem": "i0op5y_contextMenuItem",
			"contextMenuItemDanger": "i0op5y_contextMenuItemDanger",
			"contextMenuItemDisabled": "i0op5y_contextMenuItemDisabled",
			"contextMenuSeparator": "i0op5y_contextMenuSeparator",
			"toolbar": "i0op5y_toolbar",
			"toolbarButton": "i0op5y_toolbarButton",
			"dropIndicator": "i0op5y_dropIndicator",
			"uploadOverlay": "i0op5y_uploadOverlay",
			"logPanel": "i0op5y_logPanel",
			"logPanelHeader": "i0op5y_logPanelHeader",
			"logPanelTitle": "i0op5y_logPanelTitle",
			"logPanelClear": "i0op5y_logPanelClear",
			"logList": "i0op5y_logList",
			"logRow": "i0op5y_logRow",
			"logRowHeader": "i0op5y_logRowHeader",
			"logRowFailed": "i0op5y_logRowFailed",
			"logTime": "i0op5y_logTime",
			"logLabel": "i0op5y_logLabel",
			"logStatus": "i0op5y_logStatus",
			"logDuration": "i0op5y_logDuration",
			"logSize": "i0op5y_logSize",
			"logExpand": "i0op5y_logExpand",
			"logDetail": "i0op5y_logDetail",
			"logError": "i0op5y_logError",
			"logDetailBlock": "i0op5y_logDetailBlock",
			"logDetailLabel": "i0op5y_logDetailLabel",
			"logDetailPre": "i0op5y_logDetailPre",
			"logFilePath": "i0op5y_logFilePath",
			"logLocateButton": "i0op5y_logLocateButton",
			"nodeBoxMultiSelected": "i0op5y_nodeBoxMultiSelected",
			"multiSelectBar": "i0op5y_multiSelectBar",
			"multiSelectCount": "i0op5y_multiSelectCount",
			"multiSelectCompareButton": "i0op5y_multiSelectCompareButton",
			"multiSelectClearButton": "i0op5y_multiSelectClearButton",
			"compareOverlay": "i0op5y_compareOverlay",
			"compareHeader": "i0op5y_compareHeader",
			"compareTitle": "i0op5y_compareTitle",
			"compareCloseButton": "i0op5y_compareCloseButton",
			"compareGrid": "i0op5y_compareGrid",
			"compareCard": "i0op5y_compareCard",
			"compareCardMedia": "i0op5y_compareCardMedia",
			"compareMediaImage": "i0op5y_compareMediaImage",
			"compareMediaVideo": "i0op5y_compareMediaVideo",
			"compareMediaAudioWrap": "i0op5y_compareMediaAudioWrap",
			"compareMediaAudio": "i0op5y_compareMediaAudio",
			"compareMediaEmpty": "i0op5y_compareMediaEmpty",
			"compareCardBody": "i0op5y_compareCardBody",
			"comparePrompt": "i0op5y_comparePrompt",
			"comparePromptEmpty": "i0op5y_comparePromptEmpty",
			"compareMetaRow": "i0op5y_compareMetaRow",
			"compareMetaLabel": "i0op5y_compareMetaLabel",
			"compareMetaValue": "i0op5y_compareMetaValue",
			"compareCardFooter": "i0op5y_compareCardFooter",
			"compareFooter": "i0op5y_compareFooter",
			"compareButtonPrimary": "i0op5y_compareButtonPrimary",
			"compareButtonSecondary": "i0op5y_compareButtonSecondary",
			"compareButtonDanger": "i0op5y_compareButtonDanger"
		};
		//#endregion
		//#region src/client/CanvasNode.tsx
		/**
		* One canvas node: renders the element's media (image / video / audio) or
		* its prompt text, plus a small header row with kind dot + label and the
		* creation time. Rendered inside the infinite-canvas world layer at its
		* (x, y) position; dragging is handled by the parent view (the node div
		* carries the drag pointer handlers). Double-click opens the detail panel.
		*
		* ZOOM / BLUR FIX
		* ---------------
		* The world layer is scaled via `transform: scale(s)`. Browsers decode
		* `<img>`/`<video>` at their CSS layout size (the card's 220px content
		* width), NOT the post-transform screen size — so zooming in upscales a
		* small decoded bitmap and the media looks blurry.
		*
		* To get crisp media at every zoom level, each img/video sets its CSS
		* width to `100% * scale` (the on-screen pixel width) and then applies
		* `transform: scale(1/scale)` to visually shrink back to the 220px layout
		* box. The browser then decodes at the larger size and the world
		* transform produces a 1:1 (or downscaled) screen image — sharp.
		*
		* The layout box still grows to `220*scale` wide, which would push
		* siblings and inflate the card. Negative `margin-right` / `margin-bottom`
		* (expressed as `%` of the container width = 220px) cancel the excess so
		* the effective layout footprint is unchanged. The bottom margin needs
		* the media's aspect ratio (h/w), captured from `onLoad`/`onLoadedMetadata`.
		*/
		/** Short label for one element kind. */
		function kindLabel(kind, t) {
			switch (kind) {
				case "prompt": return t("prompt");
				case "image": return t("image");
				case "video": return t("video");
				case "audio": return t("audio");
			}
		}
		/** Format the createdAt timestamp as a short HH:MM:SS. */
		function formatTime$1(ms) {
			const d = new Date(ms);
			const pad = (n) => n < 10 ? `0${n}` : String(n);
			return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
		}
		/** Default aspect ratio (h/w) used before media metadata loads. 4:3 → 0.75. */
		const DEFAULT_RATIO = .75;
		/**
		* One image element. Captures its natural aspect ratio on load so the
		* negative bottom margin (which cancels the layout-box inflation from the
		* counter-scale trick) can be computed from CSS variables alone.
		*/
		function MediaImage({ url, alt }) {
			const [ratio, setRatio] = (0, react.useState)(DEFAULT_RATIO);
			const onLoad = (e) => {
				const img = e.currentTarget;
				if (img.naturalWidth > 0) setRatio(img.naturalHeight / img.naturalWidth);
			};
			return (0, react.createElement)("img", {
				className: canvas_module_css_default.mediaImage,
				src: url,
				alt,
				loading: "lazy",
				draggable: false,
				onLoad,
				style: { ["--media-ratio"]: ratio }
			});
		}
		/**
		* One video element. Same counter-scale trick as MediaImage; the aspect
		* ratio comes from `loadedmetadata` (videoWidth / videoHeight).
		*/
		function MediaVideo({ url }) {
			const [ratio, setRatio] = (0, react.useState)(DEFAULT_RATIO);
			const onLoadedMetadata = (e) => {
				const v = e.currentTarget;
				if (v.videoWidth > 0) setRatio(v.videoHeight / v.videoWidth);
			};
			return (0, react.createElement)("video", {
				className: canvas_module_css_default.mediaVideo,
				src: url,
				controls: true,
				preload: "metadata",
				onLoadedMetadata,
				style: { ["--media-ratio"]: ratio }
			});
		}
		/** Render one element's media (or prompt text) based on its kind. */
		function renderMedia(el) {
			if (el.kind === "prompt") return (0, react.createElement)("pre", { className: canvas_module_css_default.promptText }, el.promptText ?? "");
			if (el.uuid === void 0) return null;
			const url = mediaUrlOf(el.sessionId ?? "", el.uuid);
			if (el.kind === "image") return (0, react.createElement)(MediaImage, {
				url,
				alt: el.title
			});
			if (el.kind === "video") return (0, react.createElement)(MediaVideo, { url });
			return (0, react.createElement)("audio", {
				className: canvas_module_css_default.mediaAudio,
				src: url,
				controls: true,
				preload: "metadata"
			});
		}
		/** One canvas node (fixed-width card; height follows content). */
		function CanvasNode({ element, t }) {
			const kindDotClass = `${canvas_module_css_default.kindDot} ${canvas_module_css_default[`kindDot_${element.kind}`] ?? ""}`;
			const statusClass = element.status !== void 0 && element.status !== "ready" ? ` ${canvas_module_css_default[`nodeStatus_${element.status}`] ?? ""}` : "";
			const winnerBadge = element.winner === true;
			return (0, react.createElement)("div", {
				className: `${canvas_module_css_default.node}${statusClass}`,
				"data-uuid": element.uuid ?? "",
				"data-filepath": element.filePath
			}, (0, react.createElement)("div", { className: canvas_module_css_default.nodeHeader }, (0, react.createElement)("span", {
				className: kindDotClass,
				"aria-hidden": true
			}), (0, react.createElement)("span", { className: canvas_module_css_default.kindLabel }, kindLabel(element.kind, t)), winnerBadge ? (0, react.createElement)("span", {
				className: canvas_module_css_default.winnerBadge,
				title: t("winner")
			}, "★") : null, (0, react.createElement)("span", { className: canvas_module_css_default.nodeTime }, formatTime$1(element.createdAt))), (0, react.createElement)("div", { className: canvas_module_css_default.nodeTitle }, element.title), element.description !== void 0 && element.description !== "" ? (0, react.createElement)("div", { className: canvas_module_css_default.nodeDescription }, element.description) : null, (0, react.createElement)("div", { className: canvas_module_css_default.nodeMedia }, renderMedia(element)));
		}
		//#endregion
		//#region src/client/RequestLogPanel.tsx
		/**
		* Floating request log panel: shows every aigc_http_request + aigc_media_edit
		* call (success or failure) so the user can debug failed generations from the
		* canvas UI. Per docs/product/04-ux-reliability.md §3.
		*
		* Features:
		*  - Toggle button in the canvas header (shows the entry count badge)
		*  - Floating panel (right side, like the detail panel) with the entry list
		*  - Each entry: timestamp + type icon + provider/path + status + duration + size
		*  - Click an entry to expand details (request headers/body + response preview;
		*    apiKey is already redacted on the host side)
		*  - "Clear" button wipes the session log
		*  - Failed entries (status >= 400) are highlighted in red
		*  - "Locate on canvas" button pans to the element produced by the request
		*    (when elementPath is set) — wired through a callback prop
		*
		* The panel polls /aigc-canvas/api/logs.list every 2s when open (lightweight;
		* avoids WS protocol changes). The host caps at 200 entries per session.
		*/
		/** Format a timestamp as HH:MM:SS.mmm. */
		function formatTime(ms) {
			const d = new Date(ms);
			return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
		}
		/** Format a byte size human-readably. */
		function formatSize(bytes) {
			if (bytes === void 0) return "-";
			if (bytes < 1024) return `${bytes}B`;
			if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
			return `${(bytes / 1048576).toFixed(1)}MB`;
		}
		/** Format a duration in ms. */
		function formatDuration(ms) {
			if (ms < 1e3) return `${ms}ms`;
			return `${(ms / 1e3).toFixed(1)}s`;
		}
		/** One collapsible log entry row. */
		var LogEntryRow = class extends react.Component {
			state = { expanded: false };
			render() {
				const { entry, t, locateElement } = this.props;
				const failed = entry.status >= 400 || entry.error !== void 0;
				const label = entry.type === "http" ? `${entry.method ?? "?"} ${entry.path ?? "?"}` : `ffmpeg: ${entry.operation ?? "?"}`;
				const provider = entry.providerId !== void 0 ? `  ${entry.providerId}` : "";
				return (0, react.createElement)("div", { className: canvas_module_css_default.logRow }, (0, react.createElement)("button", {
					type: "button",
					className: `${canvas_module_css_default.logRowHeader} ${failed ? canvas_module_css_default.logRowFailed : ""}`,
					onClick: () => this.setState({ expanded: !this.state.expanded })
				}, (0, react.createElement)("span", { className: canvas_module_css_default.logTime }, formatTime(entry.timestamp)), (0, react.createElement)("span", { className: canvas_module_css_default.logLabel }, `${label}${provider}`), (0, react.createElement)("span", { className: canvas_module_css_default.logStatus }, String(entry.status)), (0, react.createElement)("span", { className: canvas_module_css_default.logDuration }, formatDuration(entry.durationMs)), (0, react.createElement)("span", { className: canvas_module_css_default.logSize }, formatSize(entry.size)), (0, react.createElement)("span", { className: canvas_module_css_default.logExpand }, this.state.expanded ? "▼" : "▶")), this.state.expanded && (0, react.createElement)("div", { className: canvas_module_css_default.logDetail }, entry.error !== void 0 && (0, react.createElement)("div", { className: canvas_module_css_default.logError }, `${t("logError")}: ${entry.error}`), entry.requestBodyPreview !== void 0 && (0, react.createElement)("div", { className: canvas_module_css_default.logDetailBlock }, (0, react.createElement)("span", { className: canvas_module_css_default.logDetailLabel }, t("logRequestBody")), (0, react.createElement)("pre", { className: canvas_module_css_default.logDetailPre }, entry.requestBodyPreview)), entry.requestHeaders !== void 0 && (0, react.createElement)("div", { className: canvas_module_css_default.logDetailBlock }, (0, react.createElement)("span", { className: canvas_module_css_default.logDetailLabel }, t("logRequestHeaders")), (0, react.createElement)("pre", { className: canvas_module_css_default.logDetailPre }, JSON.stringify(entry.requestHeaders, null, 2))), entry.responseBodyPreview !== void 0 && (0, react.createElement)("div", { className: canvas_module_css_default.logDetailBlock }, (0, react.createElement)("span", { className: canvas_module_css_default.logDetailLabel }, t("logResponseBody")), (0, react.createElement)("pre", { className: canvas_module_css_default.logDetailPre }, entry.responseBodyPreview)), entry.elementPath !== void 0 && (0, react.createElement)("div", { className: canvas_module_css_default.logDetailBlock }, (0, react.createElement)("span", { className: canvas_module_css_default.logDetailLabel }, t("logProducedFile")), (0, react.createElement)("code", { className: canvas_module_css_default.logFilePath }, entry.elementPath), (0, react.createElement)("button", {
					type: "button",
					className: canvas_module_css_default.logLocateButton,
					onClick: () => locateElement(entry.elementPath)
				}, t("logLocate")))));
			}
		};
		/** Error boundary so a render failure in the panel doesn't blank the canvas. */
		var LogBoundary = class extends react.Component {
			state = { error: null };
			static getDerivedStateFromError(error) {
				return { error: error instanceof Error ? error.message : String(error) };
			}
			componentDidCatch(error, info) {
				console.error("[dsh-aigc-canvas] log panel error:", error, info.componentStack);
			}
			render() {
				if (this.state.error !== null) return (0, react.createElement)("div", { className: canvas_module_css_default.boundaryError }, `log panel: ${this.state.error}`);
				return this.props.children;
			}
		};
		/**
		* The request log panel. Renders as a floating panel on the right side of
		* the canvas. Polls the host every 2s for new entries while open.
		*/
		function RequestLogPanel({ sessionId, t, locateElement }) {
			const [entries, setEntries] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let cancelled = false;
				const poll = async () => {
					try {
						const result = await fetchRequestLog(sessionId);
						if (!cancelled) {
							setEntries([...result.entries]);
							setError(null);
						}
					} catch (e) {
						if (!cancelled) setError(e instanceof Error ? e.message : String(e));
					} finally {
						if (!cancelled) setLoading(false);
					}
				};
				poll();
				const timer = setInterval(poll, 2e3);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [sessionId]);
			const onClear = async () => {
				try {
					await clearRequestLog(sessionId);
					setEntries([]);
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			return (0, react.createElement)(LogBoundary, null, (0, react.createElement)("div", { className: canvas_module_css_default.logPanel }, (0, react.createElement)("div", { className: canvas_module_css_default.logPanelHeader }, (0, react.createElement)("span", { className: canvas_module_css_default.logPanelTitle }, `${t("logTitle")} (${entries.length})`), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.logPanelClear,
				onClick: () => {
					onClear();
				},
				disabled: entries.length === 0
			}, t("logClear"))), error !== null && (0, react.createElement)("div", { className: canvas_module_css_default.boundaryError }, `${t("logError")}: ${error}`), loading && entries.length === 0 ? (0, react.createElement)("div", { className: canvas_module_css_default.empty }, t("logLoading")) : entries.length === 0 ? (0, react.createElement)("div", { className: canvas_module_css_default.empty }, t("logEmpty")) : (0, react.createElement)("div", { className: canvas_module_css_default.logList }, ...[...entries].reverse().map((entry) => (0, react.createElement)(LogEntryRow, {
				key: entry.id,
				entry,
				t,
				locateElement
			})))));
		}
		//#endregion
		//#region src/client/compare-helpers.ts
		/**
		* Read a numeric field from a free-form meta object, tolerating:
		*  - missing key
		*  - non-numeric value (string-encoded numbers are accepted; everything
		*    else returns undefined)
		*  - `null` / `undefined`
		*
		* Strings are accepted because the agent sometimes writes `"seed": "42"`
		* (JSON-object values sneak through as strings when the model wraps them
		* in quotes).
		*/
		function readNumber(meta, key) {
			if (meta === void 0) return void 0;
			const v = meta[key];
			if (v === null || v === void 0) return void 0;
			if (typeof v === "number" && Number.isFinite(v)) return v;
			if (typeof v === "string") {
				const n = Number(v);
				if (Number.isFinite(n) && v.trim() !== "") return n;
			}
		}
		/**
		* Extract the generation seed from an element's meta.
		*
		* Looks at `seed` (the canonical key) and falls back to `random_seed`
		* (some providers use that name). Returns undefined when neither is a
		* finite number.
		*/
		function getElementSeed(el) {
			const m = el.meta;
			if (m === void 0) return void 0;
			return readNumber(m, "seed") ?? readNumber(m, "random_seed");
		}
		/**
		* Extract the USD cost of producing one element from its meta.
		*
		* Looks at `cost`, then `costUsd`. Returns undefined when neither is a
		* finite number (the agent doesn't always set this — the host's
		* cost-tracker is the source of truth, but it isn't yet written back
		* into meta on placement).
		*/
		function getElementCost(el) {
			const m = el.meta;
			if (m === void 0) return void 0;
			return readNumber(m, "cost") ?? readNumber(m, "costUsd");
		}
		/**
		* Extract the wall-clock duration (in ms) of producing one element.
		*
		* Looks at `durationMs` (host convention) and falls back to
		* `durationSeconds` × 1000 (some agents write the duration in seconds).
		* Returns undefined when neither is set.
		*/
		function getElementDurationMs(el) {
			const m = el.meta;
			if (m === void 0) return void 0;
			const ms = readNumber(m, "durationMs");
			if (ms !== void 0) return ms;
			const seconds = readNumber(m, "durationSeconds");
			if (seconds !== void 0) return seconds * 1e3;
			const raw = readNumber(m, "duration");
			if (raw === void 0) return void 0;
			if (el.kind === "video" || el.kind === "audio") return raw * 1e3;
			return raw;
		}
		/** Format a USD cost as a short `$X.XX` string, or "—" when unknown. */
		function formatCost(usd) {
			if (usd === void 0) return "—";
			if (usd === 0) return "$0.00";
			if (usd > 0 && usd < .01) return `$${usd.toFixed(4)}`;
			return `$${usd.toFixed(2)}`;
		}
		/** Format a duration in ms as `X.Xs` (or `XXXms` when < 1s). Returns "—" when undefined. */
		function formatDurationShort(ms) {
			if (ms === void 0) return "—";
			if (ms < 1e3) return `${Math.round(ms)}ms`;
			return `${(ms / 1e3).toFixed(1)}s`;
		}
		/** Format a seed value (integer) as a string, or "—" when undefined. */
		function formatSeed(seed) {
			if (seed === void 0) return "—";
			return String(seed);
		}
		//#endregion
		//#region src/client/CompareView.tsx
		/**
		* CompareView — floating overlay that lets the user compare 2-4 selected
		* canvas elements side by side and pick a winner.
		*
		* Per docs/product/04-ux-reliability.md §2:
		*  - All selected elements shown at the same scale, side by side
		*  - Each element shows: image/video, prompt, seed, cost, duration (from meta)
		*  - "Select as winner" button under each → calls setElementStatus(uuid,
		*    'ready', true) + archives the others
		*  - "Reject all" button → calls setElementStatus(uuid, 'rejected') for all
		*  - "Close" button → unmounts the overlay (handled by parent)
		*
		* The overlay is rendered as a fixed-position layer above the canvas
		* surface (z-index above the detail panel + log panel + toolbar). It
		* does NOT intercept canvas pointer events outside its own bounds.
		*
		* @module @huanlin/dsh-plugin-aigc-canvas/client/CompareView
		*/
		/**
		* The compare view overlay. Renders as a fixed-position layer above the
		* canvas. Winner/reject actions fire `setElementStatus` calls; the WS
		* push carries the authoritative state back into the canvas snapshot.
		*/
		function CompareView({ sessionId, elements, t, onClose }) {
			return (0, react.createElement)(CompareBoundary, {
				t,
				children: (0, react.createElement)(CompareViewInner, {
					sessionId,
					elements,
					t,
					onClose
				})
			});
		}
		/** Inner component (wrapped by the boundary so a render error doesn't blank the canvas). */
		function CompareViewInner({ sessionId, elements, t, onClose }) {
			const [pendingWinner, setPendingWinner] = (0, react.useState)(void 0);
			const [pendingReject, setPendingReject] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				const onKey = (e) => {
					if (e.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [onClose]);
			/**
			* Pick one element as the winner: keep it as `ready` with the winner
			* flag, archive the others. Per doc 04 §2: "选 winner 后其他自动归档
			* (status = archived)".
			*/
			const onPickWinner = async (winner) => {
				if (winner.uuid === void 0) return;
				const winnerUuid = winner.uuid;
				const losers = elements.filter((e) => e.uuid !== void 0 && e.uuid !== winnerUuid);
				setPendingWinner(winnerUuid);
				setError(null);
				try {
					await setElementStatus(sessionId, winnerUuid, "ready", true);
					await Promise.all(losers.map((e) => setElementStatus(sessionId, e.uuid, "archived")));
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setPendingWinner(void 0);
				}
			};
			/**
			* Reject all: mark every selected element as `rejected`. Per doc 04 §2:
			* "全部否决 → 所有标 rejected".
			*/
			const onRejectAll = async () => {
				setPendingReject(true);
				setError(null);
				try {
					await Promise.all(elements.map((e) => e.uuid !== void 0 ? setElementStatus(sessionId, e.uuid, "rejected") : Promise.resolve()));
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setPendingReject(false);
				}
			};
			const count = elements.length;
			return (0, react.createElement)("div", {
				className: canvas_module_css_default.compareOverlay,
				onWheel: (e) => e.stopPropagation(),
				onPointerDown: (e) => e.stopPropagation()
			}, (0, react.createElement)("div", { className: canvas_module_css_default.compareHeader }, (0, react.createElement)("span", { className: canvas_module_css_default.compareTitle }, `${t("compareTitle")} (${count})`), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.compareCloseButton,
				onClick: onClose,
				"aria-label": t("compareClose")
			}, "×")), error !== null && (0, react.createElement)("div", { className: canvas_module_css_default.boundaryError }, error), (0, react.createElement)("div", { className: canvas_module_css_default.compareGrid }, ...elements.map((el) => (0, react.createElement)(CompareCard, {
				key: el.uuid ?? el.filePath,
				element: el,
				sessionId,
				t,
				pending: pendingWinner === el.uuid || pendingReject,
				onPickWinner: () => {
					onPickWinner(el);
				}
			}))), (0, react.createElement)("div", { className: canvas_module_css_default.compareFooter }, (0, react.createElement)("button", {
				type: "button",
				className: `${canvas_module_css_default.compareButtonDanger}`,
				onClick: () => {
					onRejectAll();
				},
				disabled: pendingReject || pendingWinner !== void 0
			}, t("compareRejectAll")), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.compareButtonSecondary,
				onClick: onClose
			}, t("compareClose"))));
		}
		/** One element card in the compare grid. */
		function CompareCard(props) {
			const { element: el, sessionId, t, pending, onPickWinner } = props;
			const seed = getElementSeed(el);
			const cost = getElementCost(el);
			const durationMs = getElementDurationMs(el);
			return (0, react.createElement)("div", { className: canvas_module_css_default.compareCard }, (0, react.createElement)("div", { className: canvas_module_css_default.compareCardMedia }, (0, react.createElement)(CompareMedia, {
				element: el,
				sessionId,
				t
			})), (0, react.createElement)("div", { className: canvas_module_css_default.compareCardBody }, el.promptText !== void 0 && el.promptText !== "" ? (0, react.createElement)("pre", { className: canvas_module_css_default.comparePrompt }, el.promptText) : (0, react.createElement)("div", { className: canvas_module_css_default.comparePromptEmpty }, t("comparePrompt")), (0, react.createElement)("div", { className: canvas_module_css_default.compareMetaRow }, (0, react.createElement)("span", { className: canvas_module_css_default.compareMetaLabel }, `${t("compareSeed")}:`), (0, react.createElement)("span", { className: canvas_module_css_default.compareMetaValue }, formatSeed(seed))), (0, react.createElement)("div", { className: canvas_module_css_default.compareMetaRow }, (0, react.createElement)("span", { className: canvas_module_css_default.compareMetaLabel }, `${t("compareCost")}:`), (0, react.createElement)("span", { className: canvas_module_css_default.compareMetaValue }, formatCost(cost))), (0, react.createElement)("div", { className: canvas_module_css_default.compareMetaRow }, (0, react.createElement)("span", { className: canvas_module_css_default.compareMetaLabel }, `${t("compareDuration")}:`), (0, react.createElement)("span", { className: canvas_module_css_default.compareMetaValue }, formatDurationShort(durationMs)))), (0, react.createElement)("div", { className: canvas_module_css_default.compareCardFooter }, (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.compareButtonPrimary,
				onClick: onPickWinner,
				disabled: pending || el.uuid === void 0,
				title: el.title
			}, t("compareSelectWinner"))));
		}
		/** Renders the element's media (image / video / audio) at a fixed target size. */
		function CompareMedia(props) {
			const { element: el, sessionId, t } = props;
			if (el.kind === "prompt") return (0, react.createElement)("div", { className: canvas_module_css_default.compareMediaEmpty }, el.title);
			if (el.uuid === void 0) return (0, react.createElement)("div", { className: canvas_module_css_default.compareMediaEmpty }, t("compareNoMedia"));
			const url = mediaUrlOf(sessionId, el.uuid);
			if (el.kind === "image") return (0, react.createElement)("img", {
				className: canvas_module_css_default.compareMediaImage,
				src: url,
				alt: el.title,
				loading: "lazy",
				draggable: false
			});
			if (el.kind === "video") return (0, react.createElement)("video", {
				className: canvas_module_css_default.compareMediaVideo,
				src: url,
				controls: true,
				preload: "metadata"
			});
			return (0, react.createElement)("div", { className: canvas_module_css_default.compareMediaAudioWrap }, (0, react.createElement)("audio", {
				className: canvas_module_css_default.compareMediaAudio,
				src: url,
				controls: true,
				preload: "metadata"
			}));
		}
		/** Error boundary so a render failure shows a strip instead of blanking the overlay. */
		var CompareBoundary = class extends react.Component {
			state = { error: null };
			static getDerivedStateFromError(error) {
				return { error: error instanceof Error ? error.message : String(error) };
			}
			componentDidCatch(error, info) {
				console.error("[dsh-aigc-canvas] compare view error:", error, info.componentStack);
			}
			render() {
				if (this.state.error !== null) return (0, react.createElement)("div", {
					className: canvas_module_css_default.boundaryError,
					style: { margin: "8px" }
				}, `${this.props.t("loadError")}: ${this.state.error}`);
				return this.props.children;
			}
		};
		//#endregion
		//#region src/client/CanvasView.tsx
		/**
		* The infinite canvas view: a free, pannable + zoomable surface where
		* elements live at arbitrary world positions (x, y) and edges render as
		* smooth curves between right/left ports.
		*
		* Interactions:
		*  - drag an element: moves it (persisted via the canvas.move API on release)
		*  - drag the background: pans the viewport
		*  - wheel: zooms around the cursor (clamped 0.2×–4×)
		*  - zoom slider / +/- buttons in the header: zoom from center
		*  - minimap (bottom-right): click/drag to pan; shows element outlines + viewport frame
		*  - double-click an element: opens the detail panel (prompt + params + path)
		*
		* The WS push delivers authoritative snapshots; dragged positions are
		* applied locally as drafts during the gesture and confirmed by the push
		* (the host notifies after persisting the move).
		*/
		/** Error boundary so a render failure shows a strip instead of blanking. */
		var CanvasBoundary = class extends react.Component {
			state = { error: null };
			static getDerivedStateFromError(error) {
				return { error: error instanceof Error ? error.message : String(error) };
			}
			componentDidCatch(error, info) {
				console.error("[dsh-aigc-canvas] render error:", error, info.componentStack);
			}
			render() {
				if (this.state.error !== null) return (0, react.createElement)("div", { className: canvas_module_css_default.boundaryError }, `${this.props.t("loadError")}: ${this.state.error}`);
				return this.props.children;
			}
		};
		const MIN_SCALE = .2;
		const MAX_SCALE = 4;
		/** Fixed node box for edge anchoring (world units). Must match CSS .nodeBox width. */
		const NODE_W = 240;
		const NODE_H = 110;
		/** Zoom at the cursor position, keeping the world point under the cursor fixed. */
		function zoomAt(viewport, cx, cy, factor) {
			const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewport.scale * factor));
			const worldX = (cx - viewport.x) / viewport.scale;
			const worldY = (cy - viewport.y) / viewport.scale;
			return {
				scale,
				x: cx - worldX * scale,
				y: cy - worldY * scale
			};
		}
		/** Build a uuid → element map. */
		function elementMap(elements) {
			const map = /* @__PURE__ */ new Map();
			for (const el of elements) if (el.uuid !== void 0) map.set(el.uuid, el);
			return map;
		}
		/** Port radius (the small circle drawn at each connection point). */
		const PORT_R = 5;
		function lineStyleOf(relation) {
			switch (relation) {
				case "reference":
				case "style":
				case "mask": return "dashed";
				case "variation_of":
				case "remix_of":
				case "alternative_of": return "dotted";
				case "edited_from": return "bold";
				case "input":
				case "first_frame":
				case "last_frame":
				case "audio_track":
				case void 0:
				default: return "solid";
			}
		}
		/** Short human-readable label for one EdgeRelation (rendered at the curve midpoint). */
		const EDGE_RELATION_LABEL = {
			input: "",
			first_frame: "首帧",
			last_frame: "尾帧",
			audio_track: "音轨",
			reference: "参考",
			style: "风格",
			mask: "蒙版",
			variation_of: "变体",
			remix_of: "再创作",
			alternative_of: "候选",
			edited_from: "编辑自"
		};
		/** CSS class suffix for one EdgeLineStyle (appended to `edgeLine` / `edgeArrow`). */
		function edgeLineClass(style) {
			switch (style) {
				case "dashed": return canvas_module_css_default.edgeLineDashed ?? "";
				case "dotted": return canvas_module_css_default.edgeLineDotted ?? "";
				case "bold": return canvas_module_css_default.edgeLineBold ?? "";
				default: return canvas_module_css_default.edgeLineSolid ?? "";
			}
		}
		/**
		* One smooth-curve edge: exits the source's right-center port, curves
		* through two control points, enters the target's left-center port.
		* Drawn as an SVG cubic-bezier path + two port circles + an arrowhead,
		* with line style + label driven by the edge's `relation`.
		*
		* Line styles per relation group:
		*  - solid (default): input / first_frame / last_frame / audio_track
		*  - dashed: reference / style / mask
		*  - dotted: variation_of / remix_of / alternative_of
		*  - bold: edited_from (ffmpeg edit chain)
		*
		* Uses the position resolver so the edge follows live drag positions
		* (drafts) in real time, not just the persisted snapshot.
		*/
		function renderEdge(edge, resolvePos) {
			const srcPos = resolvePos(edge.source);
			const tgtPos = resolvePos(edge.target);
			if (srcPos === void 0 || tgtPos === void 0) return null;
			const sx = srcPos.x + NODE_W;
			const sy = srcPos.y + NODE_H / 2;
			const tx = tgtPos.x;
			const ty = tgtPos.y + NODE_H / 2;
			const dx = Math.abs(tx - sx);
			const offset = Math.max(40, Math.min(dx * .5, 160));
			const c1x = sx + offset;
			const c1y = sy;
			const c2x = tx - offset;
			const c2y = ty;
			const d = `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
			const arrow = 9;
			const wing = arrow * .55;
			const baseX = tx - arrow;
			const arrowPath = `M ${tx} ${ty} L ${baseX} ${ty - wing} L ${baseX} ${ty + wing} Z`;
			const lineClass = edgeLineClass(lineStyleOf(edge.relation));
			const label = edge.relation !== void 0 ? EDGE_RELATION_LABEL[edge.relation] : "";
			const mx = .125 * sx + .375 * c1x + .375 * c2x + .125 * tx;
			const my = .125 * sy + .375 * c1y + .375 * c2y + .125 * ty;
			return (0, react.createElement)("g", { key: `${edge.source}:${edge.target}` }, (0, react.createElement)("path", {
				d,
				className: `${canvas_module_css_default.edgeLine} ${lineClass}`,
				fill: "none"
			}), (0, react.createElement)("path", {
				d: arrowPath,
				className: `${canvas_module_css_default.edgeArrow} ${lineClass}`
			}), (0, react.createElement)("circle", {
				cx: sx,
				cy: sy,
				r: PORT_R,
				className: canvas_module_css_default.edgePort
			}), (0, react.createElement)("circle", {
				cx: tx,
				cy: ty,
				r: PORT_R,
				className: canvas_module_css_default.edgePort
			}), ...label !== "" ? [(0, react.createElement)("rect", {
				key: "label-bg",
				x: mx - 24,
				y: my - 9,
				width: 48,
				height: 18,
				rx: 9,
				className: canvas_module_css_default.edgeLabelBg
			}), (0, react.createElement)("text", {
				key: "label-text",
				x: mx,
				y: my + 4,
				textAnchor: "middle",
				className: canvas_module_css_default.edgeLabel
			}, label)] : []);
		}
		/**
		* The infinite canvas view.
		* @param props - store + locale translate.
		* @returns the canvas element.
		*/
		function CanvasView({ store, t }) {
			const state = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
			const [viewport, setViewport] = (0, react.useState)({
				x: 0,
				y: 0,
				scale: 1
			});
			const [drafts, setDrafts] = (0, react.useState)(/* @__PURE__ */ new Map());
			const [selected, setSelected] = (0, react.useState)(void 0);
			/**
			* Multi-select set for the compare view (per docs/product/04-ux-reliability.md §2).
			*
			* Holds 0-4 element uuids. Shift+click on a node toggles its uuid in
			* this set; click on the empty surface clears it. When the set has
			* 2-4 entries, the canvas header shows a "Compare" button that opens
			* the CompareView overlay.
			*/
			const [multiSelected, setMultiSelected] = (0, react.useState)(/* @__PURE__ */ new Set());
			/** Whether the CompareView overlay is currently mounted. */
			const [showCompare, setShowCompare] = (0, react.useState)(false);
			const [contextMenu, setContextMenu] = (0, react.useState)(void 0);
			const [dropTarget, setDropTarget] = (0, react.useState)(void 0);
			const [uploading, setUploading] = (0, react.useState)(false);
			const [showLog, setShowLog] = (0, react.useState)(false);
			const [statusFilter, setStatusFilter] = (0, react.useState)(/* @__PURE__ */ new Set(["ready"]));
			const [sessionCost, setSessionCost] = (0, react.useState)(null);
			const surfaceRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (state.sessionId === "") return;
				let cancelled = false;
				const poll = async () => {
					try {
						const cost = await fetchSessionCost(state.sessionId);
						if (!cancelled) setSessionCost(cost);
					} catch {}
				};
				poll();
				const timer = setInterval(poll, 3e3);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [state.sessionId]);
			const prevUuidsRef = (0, react.useRef)(/* @__PURE__ */ new Set());
			/** Toggle one status in the filter set (checkbox handler). */
			const toggleStatus = (status) => {
				setStatusFilter((prev) => {
					const next = new Set(prev);
					if (next.has(status)) next.delete(status);
					else next.add(status);
					if (next.size === 0) next.add("ready");
					return next;
				});
			};
			/** Filtered elements based on the status filter checkboxes. */
			const filteredElements = state.elements.filter((el) => {
				const status = el.status ?? "ready";
				return statusFilter.has(status);
			});
			/** Filtered edges: only those whose source AND target are in the filtered set. */
			const filteredElementPaths = new Set(filteredElements.map((e) => e.filePath));
			const filteredEdges = state.edges.filter((e) => filteredElementPaths.has(e.source) && filteredElementPaths.has(e.target));
			const panRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const surface = surfaceRef.current;
				if (surface === null) return;
				const onWheel = (event) => {
					event.preventDefault();
					const rect = surface.getBoundingClientRect();
					const cx = event.clientX - rect.left;
					const cy = event.clientY - rect.top;
					const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
					setViewport((prev) => zoomAt(prev, cx, cy, factor));
				};
				surface.addEventListener("wheel", onWheel, { passive: false });
				return () => surface.removeEventListener("wheel", onWheel);
			}, []);
			(0, react.useEffect)(() => {
				if (drafts.size === 0) return;
				const lookup = elementMap(state.elements);
				const stale = [];
				for (const [uuid, draftPos] of drafts) {
					const el = lookup.get(uuid);
					if (el !== void 0 && el.x === draftPos.x && el.y === draftPos.y) stale.push(uuid);
				}
				if (stale.length > 0) setDrafts((prev) => {
					const next = new Map(prev);
					for (const uuid of stale) next.delete(uuid);
					return next;
				});
			}, [state, drafts]);
			(0, react.useEffect)(() => {
				if (panRef.current !== null || dragRef.current !== null) return;
				const surface = surfaceRef.current;
				if (surface === null) return;
				const prev = prevUuidsRef.current;
				let newest;
				for (const el of state.elements) if (el.uuid !== void 0 && !prev.has(el.uuid)) newest = el;
				const nextUuids = /* @__PURE__ */ new Set();
				for (const el of state.elements) if (el.uuid !== void 0) nextUuids.add(el.uuid);
				prevUuidsRef.current = nextUuids;
				if (newest === void 0) return;
				const rect = surface.getBoundingClientRect();
				const margin = 32;
				const screenX = newest.x * viewport.scale + viewport.x;
				const screenY = newest.y * viewport.scale + viewport.y;
				const elemW = NODE_W * viewport.scale;
				const elemH = NODE_H * viewport.scale;
				let panX = 0;
				let panY = 0;
				if (screenY + elemH > rect.height - margin) panY = screenY + elemH - (rect.height - margin);
				if (screenY < margin) panY = screenY - margin;
				if (screenX + elemW > rect.width - margin) panX = screenX + elemW - (rect.width - margin);
				if (screenX < margin) panX = screenX - margin;
				if (panX !== 0 || panY !== 0) setViewport((prev) => ({
					...prev,
					x: prev.x - panX,
					y: prev.y - panY
				}));
			}, [state, viewport.scale]);
			const [surfaceSize, setSurfaceSize] = (0, react.useState)({
				width: 0,
				height: 0
			});
			(0, react.useEffect)(() => {
				const surface = surfaceRef.current;
				if (surface === null) return;
				const update = () => {
					const rect = surface.getBoundingClientRect();
					setSurfaceSize({
						width: rect.width,
						height: rect.height
					});
				};
				update();
				const observer = new ResizeObserver(update);
				observer.observe(surface);
				return () => observer.disconnect();
			}, []);
			/** Zoom to a target scale, keeping the center of the viewport fixed. */
			const zoomToCenter = (newScale) => {
				const surface = surfaceRef.current;
				if (surface === null) return;
				const rect = surface.getBoundingClientRect();
				const cx = rect.width / 2;
				const cy = rect.height / 2;
				setViewport((prev) => {
					const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
					const worldX = (cx - prev.x) / prev.scale;
					const worldY = (cy - prev.y) / prev.scale;
					return {
						scale: s,
						x: cx - worldX * s,
						y: cy - worldY * s
					};
				});
			};
			const onSurfacePointerDown = (event) => {
				if (dragRef.current !== null) return;
				panRef.current = {
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					orig: viewport
				};
				event.currentTarget.setPointerCapture(event.pointerId);
			};
			const onSurfacePointerMove = (event) => {
				const pan = panRef.current;
				if (pan !== null && pan.pointerId === event.pointerId) {
					setViewport({
						...pan.orig,
						x: pan.orig.x + (event.clientX - pan.startX),
						y: pan.orig.y + (event.clientY - pan.startY)
					});
					return;
				}
				const drag = dragRef.current;
				if (drag !== null && drag.pointerId === event.pointerId) setDrafts((prev) => {
					const next = new Map(prev);
					next.set(drag.uuid, {
						x: drag.origX + (event.clientX - drag.startX) / viewport.scale,
						y: drag.origY + (event.clientY - drag.startY) / viewport.scale
					});
					return next;
				});
			};
			const onSurfacePointerUp = (event) => {
				const pan = panRef.current;
				if (pan !== null && pan.pointerId === event.pointerId) {
					panRef.current = null;
					return;
				}
				const drag = dragRef.current;
				if (drag !== null && drag.pointerId === event.pointerId) {
					dragRef.current = null;
					const pos = drafts.get(drag.uuid);
					if (pos !== void 0 && (pos.x !== drag.origX || pos.y !== drag.origY)) store.move(drag.uuid, pos.x, pos.y);
				}
			};
			const onNodePointerDown = (event, el) => {
				if (el.uuid === void 0) return;
				event.stopPropagation();
				if (event.shiftKey) {
					setMultiSelected((prev) => {
						const next = new Set(prev);
						if (next.has(el.uuid)) next.delete(el.uuid);
						else if (next.size < 4) next.add(el.uuid);
						return next;
					});
					return;
				}
				event.currentTarget.setPointerCapture(event.pointerId);
				dragRef.current = {
					pointerId: event.pointerId,
					uuid: el.uuid,
					startX: event.clientX,
					startY: event.clientY,
					origX: el.x,
					origY: el.y
				};
			};
			const onNodeContextMenu = (event, el) => {
				if (el.uuid === void 0) return;
				event.preventDefault();
				event.stopPropagation();
				setContextMenu({
					x: event.clientX,
					y: event.clientY,
					uuid: el.uuid
				});
			};
			const onSurfaceClick = (event) => {
				if (contextMenu !== void 0) {
					event.stopPropagation();
					setContextMenu(void 0);
				}
				if (multiSelected.size > 0) setMultiSelected(/* @__PURE__ */ new Set());
			};
			const onDeleteElement = (uuid) => {
				setContextMenu(void 0);
				if (selected?.uuid === uuid) setSelected(void 0);
				store.deleteElement(uuid);
			};
			/**
			* Resolve the element for one context-menu uuid. The menu is only
			* shown for elements with a uuid (see onNodeContextMenu), so this
			* always finds a match — but be defensive in case the WS push
			* removed the element between the right-click and the action.
			*/
			const elementForMenu = (uuid) => {
				return state.elements.find((e) => e.uuid === uuid);
			};
			/**
			* Send a user-role notice to the agent (non-waking). The host's
			* `canvas.notify` endpoint wraps `agent.inject` so the client does
			* not need direct access to the agent registry. Best-effort: a
			* network failure is swallowed (the next WS push carries the
			* agent's response, which the user will see in the conversation).
			*/
			const sendNotice = (uuid, message, summary) => {
				setContextMenu(void 0);
				if (state.sessionId === "") return;
				notifyAgent(state.sessionId, message, summary).catch(() => {});
			};
			/** Replace `{filePath}` / `{kind}` / `{title}` placeholders in a notice template. */
			const fillTemplate = (template, el) => {
				return template.replaceAll("{filePath}", el.filePath).replaceAll("{kind}", el.kind).replaceAll("{title}", el.title);
			};
			/** 重新生成... → ask the agent to reroll the element with aigc_reroll. */
			const onRegenerate = (el) => {
				sendNotice(el.uuid ?? "", fillTemplate(t("noticeRegenerate"), el), `regenerate ${el.kind} "${el.title}"`);
			};
			/**
			* 用作参考... → copy the filePath to the clipboard AND send a notice
			* to the agent. The doc also describes a relation-picker dialog
			* (first_frame / last_frame / style / mask / reference); for the
			* initial implementation we send a generic "use as reference"
			* notice and let the agent pick the relation based on context.
			* The clipboard copy is the user-facing half (so the user can also
			* paste the path into a manual prompt).
			*/
			const onUseAsReference = (el) => {
				setContextMenu(void 0);
				navigator.clipboard?.writeText(el.filePath).catch(() => {});
				if (state.sessionId !== "") notifyAgent(state.sessionId, fillTemplate(t("noticeUseAsReference"), el), `use ${el.kind} "${el.title}" as reference`).catch(() => {});
			};
			/** 发到对话 → send the element's filePath + kind + title to the agent. */
			const onSendToChat = (el) => {
				sendNotice(el.uuid ?? "", fillTemplate(t("noticeSendToChat"), el), `use ${el.kind} "${el.title}" as reference`);
			};
			/** 下载 → open the media URL in a new tab with download=1. */
			const onDownload = (el) => {
				setContextMenu(void 0);
				if (el.uuid === void 0 || state.sessionId === "" && el.sessionId === void 0) return;
				const sid = el.sessionId ?? state.sessionId;
				if (sid === "") return;
				const url = mediaUrlOf(sid, el.uuid, true);
				window.open(url, "_blank", "noopener");
			};
			/**
			* 提升到资产库... → call library.promote. The doc describes a
			* category-picker dialog; for the initial implementation we
			* promote with the default `final-product` category and let the
			* user re-tag from the asset library UI later.
			*/
			const onPromoteToLibrary = (el) => {
				setContextMenu(void 0);
				if (el.uuid === void 0 || state.sessionId === "") return;
				promoteAsset(state.sessionId, el.uuid, {
					category: "final-product",
					title: el.title
				}).catch(() => {});
			};
			/**
			* Update an element's lifecycle status via `canvas.set_status`.
			* Best-effort: the WS push carries the authoritative state, so
			* we don't optimistically patch the local snapshot.
			*/
			const onSetStatus = (uuid, status, winner) => {
				setContextMenu(void 0);
				if (state.sessionId === "") return;
				setElementStatus(state.sessionId, uuid, status, winner).catch(() => {});
			};
			/**
			* + 生成 → ask the agent to generate a new asset (provider info →
			* http_request → canvas_place). The doc describes a t2i/t2v/tts
			* picker dialog; for the initial implementation we send a generic
			* "please generate something" notice and let the agent ask the
			* user for the specifics (prompt, kind).
			*/
			const onToolbarGenerate = () => {
				if (state.sessionId === "") return;
				notifyAgent(state.sessionId, t("noticeGenerate"), "user requested generation").catch(() => {});
			};
			/**
			* ✂ 编辑选中 → ask the agent to run aigc_media_edit (ffmpeg) on
			* the currently-selected element. Disabled when nothing is selected.
			*/
			const onToolbarEditSelected = () => {
				if (state.sessionId === "" || selected === void 0) return;
				notifyAgent(state.sessionId, fillTemplate(t("noticeEditSelected"), selected), `edit ${selected.kind} "${selected.title}"`).catch(() => {});
			};
			/**
			* ▶ 运行工作流 → ask the agent to list + run a pipeline template.
			* (Per docs/product/02-pipeline.md; the template picker UI is a
			* future enhancement — for now the agent lists templates in the
			* conversation and the user picks one.)
			*/
			const onToolbarRunWorkflow = () => {
				if (state.sessionId === "") return;
				notifyAgent(state.sessionId, t("noticeRunWorkflow"), "user requested workflow run").catch(() => {});
			};
			/**
			* Build the right-click context menu items for one element uuid.
			* Per docs/product/04-ux-reliability.md §1: 5 action items, a
			* separator, 3 status items, a separator, and Delete (in the
			* destructive style).
			*
			* The element is resolved from the current snapshot. If it was
			* removed between the right-click and the menu render (race with
			* the WS push), every item except Delete is disabled — Delete is
			* kept enabled because store.deleteElement is idempotent.
			*/
			const buildContextMenuItems = (uuid) => {
				const el = elementForMenu(uuid);
				const missing = el === void 0;
				return [
					{
						label: t("menuRegenerate"),
						disabled: missing,
						onClick: el !== void 0 ? () => onRegenerate(el) : void 0
					},
					{
						label: t("menuUseAsReference"),
						disabled: missing,
						onClick: el !== void 0 ? () => onUseAsReference(el) : void 0
					},
					{
						label: t("menuSendToChat"),
						disabled: missing,
						onClick: el !== void 0 ? () => onSendToChat(el) : void 0
					},
					{
						label: t("menuDownload"),
						disabled: missing || el?.uuid === void 0,
						onClick: el !== void 0 ? () => onDownload(el) : void 0
					},
					{
						label: t("menuPromoteToLibrary"),
						disabled: missing || el?.uuid === void 0,
						onClick: el !== void 0 ? () => onPromoteToLibrary(el) : void 0
					},
					{ separator: true },
					{
						label: t("menuMarkWinner"),
						disabled: missing,
						onClick: el !== void 0 ? () => onSetStatus(uuid, "ready", true) : void 0
					},
					{
						label: t("menuMarkRejected"),
						disabled: missing,
						onClick: el !== void 0 ? () => onSetStatus(uuid, "rejected") : void 0
					},
					{
						label: t("menuArchive"),
						disabled: missing,
						onClick: el !== void 0 ? () => onSetStatus(uuid, "archived") : void 0
					},
					{ separator: true },
					{
						label: t("delete"),
						danger: true,
						onClick: () => onDeleteElement(uuid)
					}
				];
			};
			const onSurfaceDragOver = (event) => {
				if (event.dataTransfer.types.includes("Files")) {
					event.preventDefault();
					event.stopPropagation();
					event.dataTransfer.dropEffect = "copy";
					const rect = surfaceRef.current?.getBoundingClientRect();
					if (rect !== void 0) {
						const sx = event.clientX - rect.left;
						const sy = event.clientY - rect.top;
						const wx = (sx - viewport.x) / viewport.scale;
						const wy = (sy - viewport.y) / viewport.scale;
						setDropTarget({
							x: wx,
							y: wy
						});
					}
				}
			};
			const onSurfaceDragLeave = (event) => {
				if (event.currentTarget === event.target) {
					event.stopPropagation();
					setDropTarget(void 0);
				}
			};
			const onSurfaceDrop = async (event) => {
				event.preventDefault();
				event.stopPropagation();
				setDropTarget(void 0);
				const files = event.dataTransfer.files;
				if (files.length === 0) return;
				const rect = surfaceRef.current?.getBoundingClientRect();
				const sx = event.clientX - (rect?.left ?? 0);
				const sy = event.clientY - (rect?.top ?? 0);
				const wx = (sx - viewport.x) / viewport.scale;
				const wy = (sy - viewport.y) / viewport.scale;
				setUploading(true);
				try {
					for (const file of Array.from(files)) {
						const buf = await file.arrayBuffer();
						const bytes = new Uint8Array(buf);
						let binary = "";
						const chunk = 32768;
						for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
						const mediaBase64 = btoa(binary);
						await store.uploadFile(file.name, mediaBase64, {
							x: wx,
							y: wy
						});
					}
				} finally {
					setUploading(false);
				}
			};
			const lookup = elementMap(state.elements);
			const resolvePos = (uuid) => {
				const draft = drafts.get(uuid);
				if (draft !== void 0) return draft;
				const el = lookup.get(uuid);
				if (el !== void 0) return {
					x: el.x,
					y: el.y
				};
			};
			const posOf = (el) => {
				if (el.uuid !== void 0) {
					const draft = drafts.get(el.uuid);
					if (draft !== void 0) return draft;
				}
				return {
					x: el.x,
					y: el.y
				};
			};
			return (0, react.createElement)("div", { className: canvas_module_css_default.canvas }, (0, react.createElement)("div", { className: canvas_module_css_default.header }, (0, react.createElement)("span", { className: canvas_module_css_default.title }, t("title")), (0, react.createElement)("span", { className: canvas_module_css_default.count }, `${state.elements.length} ${t("elementCount")}`), (0, react.createElement)("span", { className: canvas_module_css_default.count }, `${state.edges.length} ${t("edgeCount")}`), sessionCost !== null && sessionCost.total > 0 ? (0, react.createElement)("span", { className: canvas_module_css_default.costDisplay }, `$${sessionCost.total.toFixed(2)}`) : null, (0, react.createElement)("span", { className: canvas_module_css_default.zoom }, `${Math.round(viewport.scale * 100)}%`), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.iconButton,
				onClick: () => zoomToCenter(viewport.scale * .8),
				title: t("zoomOut"),
				"aria-label": t("zoomOut")
			}, "−"), (0, react.createElement)("input", {
				type: "range",
				className: canvas_module_css_default.zoomSlider,
				min: Math.round(MIN_SCALE * 100),
				max: Math.round(400),
				value: Math.round(viewport.scale * 100),
				onChange: (e) => zoomToCenter(Number(e.target.value) / 100),
				"aria-label": t("zoom")
			}), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.iconButton,
				onClick: () => zoomToCenter(viewport.scale * 1.25),
				title: t("zoomIn"),
				"aria-label": t("zoomIn")
			}, "+"), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.iconButton,
				onClick: () => {
					store.refresh();
				},
				title: t("refresh"),
				"aria-label": t("refresh")
			}, "↻"), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.iconButton,
				onClick: () => setViewport({
					x: 0,
					y: 0,
					scale: 1
				}),
				title: t("resetView"),
				"aria-label": t("resetView")
			}, "⤢"), (0, react.createElement)("button", {
				type: "button",
				className: `${canvas_module_css_default.iconButton} ${showLog ? canvas_module_css_default.iconButtonActive : ""}`,
				onClick: () => setShowLog(!showLog),
				title: t("logButton"),
				"aria-label": t("logButton")
			}, "📊"), (0, react.createElement)("span", { className: canvas_module_css_default.statusFilter }, (0, react.createElement)("label", { className: canvas_module_css_default.statusFilterLabel }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: statusFilter.has("ready"),
				onChange: () => toggleStatus("ready")
			}), t("statusReady")), (0, react.createElement)("label", { className: canvas_module_css_default.statusFilterLabel }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: statusFilter.has("draft"),
				onChange: () => toggleStatus("draft")
			}), t("statusDraft")), (0, react.createElement)("label", { className: canvas_module_css_default.statusFilterLabel }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: statusFilter.has("rejected"),
				onChange: () => toggleStatus("rejected")
			}), t("statusRejected")), (0, react.createElement)("label", { className: canvas_module_css_default.statusFilterLabel }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: statusFilter.has("archived"),
				onChange: () => toggleStatus("archived")
			}), t("statusArchived")))), (0, react.createElement)("div", {
				className: canvas_module_css_default.surface,
				ref: surfaceRef,
				onPointerDown: onSurfacePointerDown,
				onPointerMove: onSurfacePointerMove,
				onPointerUp: onSurfacePointerUp,
				onPointerCancel: onSurfacePointerUp,
				onDoubleClick: () => setSelected(void 0),
				onClick: onSurfaceClick,
				onContextMenu: (event) => {
					event.preventDefault();
				},
				onDragOver: onSurfaceDragOver,
				onDragLeave: onSurfaceDragLeave,
				onDrop: (event) => {
					onSurfaceDrop(event);
				}
			}, state.elements.length === 0 ? (0, react.createElement)("div", { className: canvas_module_css_default.empty }, (0, react.createElement)("span", null, t("empty")), (0, react.createElement)("span", { className: canvas_module_css_default.emptyHint }, t("emptyHint"))) : (0, react.createElement)("div", {
				className: canvas_module_css_default.world,
				style: {
					transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
					["--canvas-scale"]: viewport.scale
				}
			}, (0, react.createElement)("svg", {
				className: canvas_module_css_default.edgeLayer,
				"aria-hidden": true
			}, ...filteredEdges.map((edge) => renderEdge(edge, resolvePos))), ...filteredElements.map((el) => {
				const pos = posOf(el);
				const selectedClass = el.uuid !== void 0 && multiSelected.has(el.uuid) ? ` ${canvas_module_css_default.nodeBoxMultiSelected ?? ""}` : "";
				return (0, react.createElement)("div", {
					key: el.uuid ?? el.filePath,
					className: `${canvas_module_css_default.nodeBox} ${el.uuid !== void 0 ? canvas_module_css_default.nodeBoxDraggable : ""}${selectedClass}`,
					style: { transform: `translate(${pos.x}px, ${pos.y}px)` },
					onPointerDown: (event) => onNodePointerDown(event, el),
					onDoubleClick: (event) => {
						event.stopPropagation();
						setSelected(el);
					},
					onContextMenu: (event) => onNodeContextMenu(event, el)
				}, (0, react.createElement)(CanvasNode, {
					element: el,
					t
				}));
			})), dropTarget !== void 0 ? (0, react.createElement)("div", {
				className: canvas_module_css_default.dropIndicator,
				style: { transform: `translate(${dropTarget.x * viewport.scale + viewport.x}px, ${dropTarget.y * viewport.scale + viewport.y}px) scale(${viewport.scale})` }
			}) : null, uploading ? (0, react.createElement)("div", { className: canvas_module_css_default.uploadOverlay }, t("uploading")) : null), selected !== void 0 ? (0, react.createElement)(DetailPanel, {
				element: selected,
				t,
				onClose: () => setSelected(void 0)
			}) : null, showLog && state.sessionId !== "" ? (0, react.createElement)(RequestLogPanel, {
				sessionId: state.sessionId,
				t,
				locateElement: (filePath) => {
					const el = state.elements.find((e) => e.filePath === filePath);
					if (el !== void 0) {
						const cx = el.x + 120;
						const cy = el.y + 55;
						setViewport({
							x: (surfaceRef.current?.clientWidth ?? 800) / 2 - cx * viewport.scale,
							y: (surfaceRef.current?.clientHeight ?? 600) / 2 - cy * viewport.scale,
							scale: viewport.scale
						});
						setSelected(el);
					}
				}
			}) : null, contextMenu !== void 0 ? (0, react.createElement)(ContextMenu, {
				x: contextMenu.x,
				y: contextMenu.y,
				items: buildContextMenuItems(contextMenu.uuid),
				onClose: () => setContextMenu(void 0)
			}) : null, state.sessionId !== "" ? (0, react.createElement)("div", { className: canvas_module_css_default.toolbar }, (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.toolbarButton,
				onClick: onToolbarGenerate,
				title: t("toolbarGenerateTitle")
			}, t("toolbarGenerate")), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.toolbarButton,
				onClick: onToolbarEditSelected,
				disabled: selected === void 0,
				title: selected === void 0 ? t("toolbarNoSelection") : t("toolbarEditSelectedTitle")
			}, t("toolbarEditSelected")), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.toolbarButton,
				onClick: onToolbarRunWorkflow,
				title: t("toolbarRunWorkflowTitle")
			}, t("toolbarRunWorkflow"))) : null, multiSelected.size >= 2 ? (0, react.createElement)("div", { className: canvas_module_css_default.multiSelectBar }, (0, react.createElement)("span", { className: canvas_module_css_default.multiSelectCount }, t("compareNSelected").replace("{n}", String(multiSelected.size))), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.multiSelectCompareButton,
				onClick: () => setShowCompare(true),
				disabled: multiSelected.size < 2 || multiSelected.size > 4,
				title: multiSelected.size > 4 ? t("compareTooMany") : t("compareButton")
			}, t("compareButton")), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.multiSelectClearButton,
				onClick: () => setMultiSelected(/* @__PURE__ */ new Set())
			}, t("compareClearSelection"))) : null, showCompare && state.sessionId !== "" ? (0, react.createElement)(CompareView, {
				sessionId: state.sessionId,
				elements: state.elements.filter((e) => e.uuid !== void 0 && multiSelected.has(e.uuid)),
				t,
				onClose: () => setShowCompare(false)
			}) : null, state.elements.length > 0 ? (0, react.createElement)(Minimap, {
				elements: state.elements,
				viewport,
				surfaceSize,
				setViewport
			}) : null);
		}
		/** A minimal fixed-position context menu (right-click). */
		function ContextMenu(props) {
			(0, react.useEffect)(() => {
				const onDown = () => props.onClose();
				const onKey = (e) => {
					if (e.key === "Escape") props.onClose();
				};
				window.addEventListener("pointerdown", onDown, { once: true });
				window.addEventListener("keydown", onKey, { once: true });
				return () => {
					window.removeEventListener("pointerdown", onDown);
					window.removeEventListener("keydown", onKey);
				};
			}, [props]);
			const style = {
				left: props.x,
				top: props.y
			};
			return (0, react.createElement)("div", {
				className: canvas_module_css_default.contextMenu,
				style,
				onPointerDown: (e) => e.stopPropagation()
			}, ...props.items.map((item, i) => {
				if (item.separator === true) return (0, react.createElement)("hr", {
					key: `sep-${i}`,
					className: canvas_module_css_default.contextMenuSeparator
				});
				const className = [
					canvas_module_css_default.contextMenuItem,
					item.danger === true ? canvas_module_css_default.contextMenuItemDanger ?? "" : "",
					item.disabled === true ? canvas_module_css_default.contextMenuItemDisabled ?? "" : ""
				].filter((s) => s !== "").join(" ");
				return (0, react.createElement)("button", {
					key: i,
					type: "button",
					className,
					disabled: item.disabled === true,
					onClick: () => {
						if (item.disabled !== true) item.onClick?.();
					}
				}, item.label);
			}));
		}
		/** The double-click detail panel: prompt + generation params + path. */
		function DetailPanel({ element, t, onClose }) {
			const meta = element.meta;
			const metaEntries = Array.isArray(meta) || meta === null || typeof meta !== "object" ? [] : Object.entries(meta);
			return (0, react.createElement)("div", { className: canvas_module_css_default.detailPanel }, (0, react.createElement)("div", { className: canvas_module_css_default.detailHeader }, (0, react.createElement)("span", { className: canvas_module_css_default.detailTitle }, element.title), (0, react.createElement)("button", {
				type: "button",
				className: canvas_module_css_default.detailClose,
				onClick: onClose,
				"aria-label": t("detailClose")
			}, "×")), (0, react.createElement)("div", { className: canvas_module_css_default.detailBody }, element.promptText !== void 0 ? (0, react.createElement)("div", { className: canvas_module_css_default.detailBlock }, (0, react.createElement)("span", { className: canvas_module_css_default.detailLabel }, t("detailPrompt")), (0, react.createElement)("pre", { className: canvas_module_css_default.detailPrompt }, element.promptText)) : null, metaEntries.length > 0 ? (0, react.createElement)("div", { className: canvas_module_css_default.detailBlock }, (0, react.createElement)("span", { className: canvas_module_css_default.detailLabel }, t("detailParams")), (0, react.createElement)("dl", { className: canvas_module_css_default.metaList }, ...metaEntries.flatMap(([k, v]) => [(0, react.createElement)("dt", {
				key: `${k}-k`,
				className: canvas_module_css_default.metaKey
			}, k), (0, react.createElement)("dd", {
				key: `${k}-v`,
				className: canvas_module_css_default.metaValue
			}, formatMetaValue(v))]))) : null, (0, react.createElement)("div", { className: canvas_module_css_default.detailBlock }, (0, react.createElement)("span", { className: canvas_module_css_default.detailLabel }, t("generatedBy")), (0, react.createElement)("span", { className: canvas_module_css_default.detailValue }, element.producedBy)), (0, react.createElement)("div", { className: canvas_module_css_default.detailBlock }, (0, react.createElement)("span", { className: canvas_module_css_default.detailLabel }, t("detailPosition")), (0, react.createElement)("span", { className: canvas_module_css_default.detailValue }, `(${Math.round(element.x)}, ${Math.round(element.y)})`)), (0, react.createElement)("div", { className: canvas_module_css_default.detailBlock }, (0, react.createElement)("span", { className: canvas_module_css_default.detailLabel }, t("detailPath")), (0, react.createElement)("code", { className: canvas_module_css_default.filePath }, element.filePath))));
		}
		function formatMetaValue(v) {
			if (typeof v === "string") return v;
			if (typeof v === "number" || typeof v === "boolean") return String(v);
			if (v === null || v === void 0) return "";
			try {
				return JSON.stringify(v);
			} catch {
				return String(v);
			}
		}
		const MINIMAP_W = 168;
		const MINIMAP_H = 120;
		/** Color dot per element kind in the minimap. */
		const KIND_COLOR = {
			image: "#4caf50",
			video: "#ff9800",
			audio: "#ab47bc",
			prompt: "#6b8cff"
		};
		/**
		* Bottom-right minimap: shows all elements as small colored rectangles and
		* the current viewport as a frame. Click/drag to pan the viewport.
		*/
		function Minimap(props) {
			const { elements, viewport, surfaceSize, setViewport } = props;
			const minimapRef = (0, react.useRef)(null);
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const el of elements) {
				minX = Math.min(minX, el.x);
				minY = Math.min(minY, el.y);
				maxX = Math.max(maxX, el.x + NODE_W);
				maxY = Math.max(maxY, el.y + NODE_H);
			}
			if (surfaceSize.width > 0 && surfaceSize.height > 0) {
				const vpMinX = -viewport.x / viewport.scale;
				const vpMinY = -viewport.y / viewport.scale;
				const vpMaxX = vpMinX + surfaceSize.width / viewport.scale;
				const vpMaxY = vpMinY + surfaceSize.height / viewport.scale;
				minX = Math.min(minX, vpMinX);
				minY = Math.min(minY, vpMinY);
				maxX = Math.max(maxX, vpMaxX);
				maxY = Math.max(maxY, vpMaxY);
			}
			if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
			minX -= 40;
			minY -= 40;
			maxX += 40;
			maxY += 40;
			const worldW = maxX - minX;
			const worldH = maxY - minY;
			const miniScale = Math.min(156 / worldW, 108 / worldH);
			const offsetX = (MINIMAP_W - worldW * miniScale) / 2;
			const offsetY = (MINIMAP_H - worldH * miniScale) / 2;
			const toMiniX = (wx) => offsetX + (wx - minX) * miniScale;
			const toMiniY = (wy) => offsetY + (wy - minY) * miniScale;
			const vpX = toMiniX(-viewport.x / viewport.scale);
			const vpY = toMiniY(-viewport.y / viewport.scale);
			const vpW = surfaceSize.width / viewport.scale * miniScale;
			const vpH = surfaceSize.height / viewport.scale * miniScale;
			const onPointerDown = (event) => {
				event.stopPropagation();
				event.currentTarget.setPointerCapture(event.pointerId);
				const pan = (clientX, clientY) => {
					const rect = minimapRef.current?.getBoundingClientRect();
					if (rect === void 0) return;
					const mx = clientX - rect.left;
					const my = clientY - rect.top;
					const worldX = (mx - offsetX) / miniScale + minX;
					const worldY = (my - offsetY) / miniScale + minY;
					setViewport((prev) => ({
						...prev,
						x: surfaceSize.width / 2 - worldX * prev.scale,
						y: surfaceSize.height / 2 - worldY * prev.scale
					}));
				};
				pan(event.clientX, event.clientY);
				const onMove = (e) => pan(e.clientX, e.clientY);
				const onUp = () => {
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
				};
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onUp);
			};
			return (0, react.createElement)("div", {
				className: canvas_module_css_default.minimap,
				ref: minimapRef,
				onPointerDown
			}, (0, react.createElement)("svg", {
				width: MINIMAP_W,
				height: MINIMAP_H,
				className: canvas_module_css_default.minimapSvg
			}, ...elements.map((el) => (0, react.createElement)("rect", {
				key: el.uuid ?? el.filePath,
				x: toMiniX(el.x),
				y: toMiniY(el.y),
				width: Math.max(2, NODE_W * miniScale),
				height: Math.max(2, NODE_H * miniScale),
				rx: 2,
				fill: KIND_COLOR[el.kind],
				fillOpacity: .35,
				stroke: KIND_COLOR[el.kind],
				strokeOpacity: .7,
				strokeWidth: 1
			})), (0, react.createElement)("rect", {
				x: vpX,
				y: vpY,
				width: vpW,
				height: vpH,
				fill: "var(--dsw-alias-label-primary)",
				fillOpacity: .08,
				stroke: "var(--dsw-alias-label-primary)",
				strokeOpacity: .8,
				strokeWidth: 2,
				rx: 2
			})));
		}
		/** Wrapped export so the tab component can mount the boundary once. */
		function CanvasViewWithBoundary(props) {
			return (0, react.createElement)(CanvasBoundary, {
				t: props.t,
				children: (0, react.createElement)(CanvasView, props)
			});
		}
		//#endregion
		//#region \0dsh-css:D:\Projects\deepseek-harness\dsh-aigc-canvas\src\client\SettingsPage.module.css.mjs
		const css = "/* AIGC canvas settings section, in the settings-panel design language shared\r\n * with ModelsSection / GeneralSection / yet-another-subagent: 14/22 body,\r\n * 12/18 caption, 16/24 title, capsule controls (h36 r18 primary, h28 r14\r\n * secondary), 32px fields, border-l2 hairlines, and the editor as a filled\r\n * module on the panel fill.\r\n *\r\n * Every color resolves through a --dsw-alias-* token (no literal colors). */\r\n\r\n.o6nt8s_section {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n  max-width: 720px;\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.o6nt8s_title {\r\n  margin: 0;\r\n  font-size: 16px;\r\n  line-height: 24px;\r\n  font-weight: 500;\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.o6nt8s_intro {\r\n  margin: 0;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  color: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n.o6nt8s_error {\r\n  margin: 0;\r\n  padding: 8px 12px;\r\n  border: 1px solid var(--dsw-alias-state-error-primary);\r\n  border-radius: 8px;\r\n  background: var(--dsw-alias-interactive-bg-hover-danger);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  color: var(--dsw-alias-state-error-primary);\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n}\r\n\r\n.o6nt8s_errorDismiss {\r\n  flex: none;\r\n  border: none;\r\n  background: transparent;\r\n  color: inherit;\r\n  font-size: 16px;\r\n  line-height: 1;\r\n  cursor: pointer;\r\n  padding: 0 4px;\r\n}\r\n\r\n.o6nt8s_rows {\r\n  list-style: none;\r\n  margin: 12px 0 0;\r\n  padding: 0;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n}\r\n\r\n/* A configured provider: outlined on the panel fill, matching the rowCard\r\n * chrome in ModelsSection. */\r\n.o6nt8s_rowCard {\r\n  border: 1px solid var(--dsw-alias-border-l2);\r\n  border-radius: 12px;\r\n  padding: 12px 14px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n}\r\n\r\n.o6nt8s_rowHead {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n}\r\n\r\n/* Chevron toggle: a small square with two borders, rotated to point right\r\n * (collapsed) or down (expanded). Pure CSS, no icon font. */\r\n.o6nt8s_chevronButton {\r\n  flex: none;\r\n  width: 24px;\r\n  height: 24px;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  border: none;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-secondary);\r\n  cursor: pointer;\r\n  padding: 0;\r\n  border-radius: 4px;\r\n}\r\n\r\n.o6nt8s_chevronButton:hover {\r\n  background: var(--dsw-alias-interactive-bg-hover-solid);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n/* Spacer that occupies the chevron slot on cards without a toggle (e.o6nt8s_g. the\r\n * new-draft card, which is always expanded). Keeps row-head alignment. */\r\n.o6nt8s_chevronSpacer {\r\n  flex: none;\r\n  width: 24px;\r\n  height: 24px;\r\n}\r\n\r\n.o6nt8s_chevron {\r\n  width: 7px;\r\n  height: 7px;\r\n  border-right: 1.5px solid currentColor;\r\n  border-bottom: 1.5px solid currentColor;\r\n  transform: rotate(-45deg);\r\n  transition: transform 0.15s ease;\r\n}\r\n\r\n.o6nt8s_chevronExpanded {\r\n  transform: rotate(45deg);\r\n}\r\n\r\n.o6nt8s_rowIdentity {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  min-width: 0;\r\n  flex: 1 1 auto;\r\n  flex-wrap: wrap;\r\n}\r\n\r\n.o6nt8s_rowName {\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  font-weight: 500;\r\n  color: var(--dsw-alias-label-primary);\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.o6nt8s_rowNamePlaceholder {\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  font-weight: 500;\r\n  color: var(--dsw-alias-label-tertiary);\r\n  font-style: italic;\r\n}\r\n\r\n/* Builtin badge: uses DSH <Pill> with a brand-colored override to mark\r\n * seed providers. */\r\n.o6nt8s_builtinBadge {\r\n  height: 18px;\r\n  padding: 0 6px;\r\n  border-radius: 4px;\r\n  font-size: 11px;\r\n  line-height: 16px;\r\n  font-weight: 500;\r\n  background: var(--dsw-alias-brand-primary);\r\n  color: var(--dsw-alias-label-primary-foreground);\r\n  letter-spacing: 0.02em;\r\n}\r\n\r\n/* Default provider badge. */\r\n.o6nt8s_defaultBadge {\r\n  height: 18px;\r\n  padding: 0 6px;\r\n  border-radius: 4px;\r\n  font-size: 11px;\r\n  line-height: 16px;\r\n  font-weight: 500;\r\n  background: var(--dsw-alias-bg-layer-2);\r\n  color: var(--dsw-alias-label-secondary);\r\n}\r\n\r\n/* Stub/real mode badge. */\r\n.o6nt8s_stubBadge {\r\n  height: 18px;\r\n  padding: 0 6px;\r\n  border-radius: 4px;\r\n  font-size: 11px;\r\n  line-height: 16px;\r\n  font-weight: 500;\r\n  background: var(--dsw-alias-bg-layer-2);\r\n  color: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n.o6nt8s_realBadge {\r\n  height: 18px;\r\n  padding: 0 6px;\r\n  border-radius: 4px;\r\n  font-size: 11px;\r\n  line-height: 16px;\r\n  font-weight: 500;\r\n  background: var(--dsw-alias-state-success-primary);\r\n  color: var(--dsw-alias-label-primary-foreground);\r\n}\r\n\r\n.o6nt8s_rowId {\r\n  flex: none;\r\n  padding: 1px 6px;\r\n  border: 1px solid var(--dsw-alias-border-l3);\r\n  border-radius: 4px;\r\n  font-size: 11px;\r\n  line-height: 16px;\r\n  font-family: var(--dsw-font-markdown-code-block-small, monospace);\r\n  color: var(--dsw-alias-label-secondary);\r\n}\r\n\r\n.o6nt8s_rowActions {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n  margin-left: auto;\r\n  flex: none;\r\n}\r\n\r\n/* Editor surface: a filled module on the panel, matching ModelsSection's\r\n * editor chrome (bg-module-platform, r12, p14/16). */\r\n.o6nt8s_editor {\r\n  border-radius: 12px;\r\n  background: var(--dsw-alias-bg-module-platform);\r\n  padding: 14px 16px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 14px;\r\n}\r\n\r\n.o6nt8s_field {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n}\r\n\r\n.o6nt8s_fieldLabel {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  font-weight: 500;\r\n  color: var(--dsw-alias-label-secondary);\r\n}\r\n\r\n/* Input: matching ModelsSection .o6nt8s_input — h32, r8, border-l2, bg-layer-1. */\r\n.o6nt8s_input {\r\n  box-sizing: border-box;\r\n  width: 100%;\r\n  height: 32px;\r\n  padding: 0 10px;\r\n  border: 1px solid var(--dsw-alias-border-l2);\r\n  border-radius: 8px;\r\n  font: inherit;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  background: var(--dsw-alias-bg-layer-1);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.o6nt8s_input:focus {\r\n  outline: none;\r\n  border-color: var(--dsw-alias-brand-primary);\r\n}\r\n\r\n.o6nt8s_input::placeholder {\r\n  color: var(--dsw-alias-label-dimmed);\r\n}\r\n\r\n.o6nt8s_input:disabled {\r\n  opacity: 0.6;\r\n  cursor: default;\r\n}\r\n\r\n.o6nt8s_textarea {\r\n  box-sizing: border-box;\r\n  width: 100%;\r\n  min-height: 64px;\r\n  padding: 6px 10px;\r\n  border: 1px solid var(--dsw-alias-border-l2);\r\n  border-radius: 8px;\r\n  font: inherit;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  background: var(--dsw-alias-bg-layer-1);\r\n  color: var(--dsw-alias-label-primary);\r\n  resize: vertical;\r\n}\r\n\r\n.o6nt8s_textarea:focus {\r\n  outline: none;\r\n  border-color: var(--dsw-alias-brand-primary);\r\n}\r\n\r\n.o6nt8s_textarea::placeholder {\r\n  color: var(--dsw-alias-label-dimmed);\r\n}\r\n\r\n/* Auth scheme row: scheme select + optional name input side by side. */\r\n.o6nt8s_authRow {\r\n  display: flex;\r\n  gap: 8px;\r\n}\r\n\r\n.o6nt8s_authRow .o6nt8s_input {\r\n  flex: 1 1 auto;\r\n}\r\n\r\n/* Select: same chrome as .o6nt8s_input. */\r\n.o6nt8s_select {\r\n  box-sizing: border-box;\r\n  flex: 0 0 auto;\r\n  min-width: 130px;\r\n  height: 32px;\r\n  padding: 0 10px;\r\n  border: 1px solid var(--dsw-alias-border-l2);\r\n  border-radius: 8px;\r\n  font: inherit;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  background: var(--dsw-alias-bg-layer-1);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.o6nt8s_select:focus {\r\n  outline: none;\r\n  border-color: var(--dsw-alias-brand-primary);\r\n}\r\n\r\n/* Caption labels under fields. */\r\n.o6nt8s_desc {\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  color: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n.o6nt8s_hint {\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  color: var(--dsw-alias-label-secondary);\r\n}\r\n\r\n/* Buttons: capsule controls matching ModelsSection (h36 r18 primary,\r\n * h28 r14 secondary in row context). */\r\n.o6nt8s_primaryButton,\r\n.o6nt8s_secondaryButton,\r\n.o6nt8s_dangerButton,\r\n.o6nt8s_addBlockButton {\r\n  box-sizing: border-box;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 4px;\r\n  height: 36px;\r\n  padding: 0 14px;\r\n  border: none;\r\n  border-radius: 18px;\r\n  font: inherit;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  cursor: pointer;\r\n}\r\n\r\n.o6nt8s_primaryButton {\r\n  background: var(--dsw-alias-button-primary-fill);\r\n  color: var(--dsw-alias-label-primary-foreground);\r\n}\r\n\r\n.o6nt8s_primaryButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-button-primary-hover);\r\n}\r\n\r\n.o6nt8s_secondaryButton,\r\n.o6nt8s_addBlockButton {\r\n  border: 1px solid var(--dsw-alias-border-l2);\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n.o6nt8s_secondaryButton:hover:not(:disabled),\r\n.o6nt8s_addBlockButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover-solid);\r\n}\r\n\r\n.o6nt8s_dangerButton {\r\n  background: transparent;\r\n  color: var(--dsw-alias-state-error-primary);\r\n}\r\n\r\n.o6nt8s_dangerButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover-danger);\r\n}\r\n\r\n/* Row-context buttons go dense (h28 r14, 12/18). */\r\n.o6nt8s_rowActions .o6nt8s_secondaryButton,\r\n.o6nt8s_rowActions .o6nt8s_dangerButton {\r\n  height: 28px;\r\n  padding: 0 10px;\r\n  border-radius: 14px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.o6nt8s_rowActions .o6nt8s_primaryButton {\r\n  height: 28px;\r\n  padding: 0 10px;\r\n  border-radius: 14px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.o6nt8s_primaryButton:disabled,\r\n.o6nt8s_secondaryButton:disabled,\r\n.o6nt8s_dangerButton:disabled,\r\n.o6nt8s_addBlockButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n.o6nt8s_primaryButton:focus-visible,\r\n.o6nt8s_secondaryButton:focus-visible,\r\n.o6nt8s_dangerButton:focus-visible,\r\n.o6nt8s_addBlockButton:focus-visible {\r\n  outline: none;\r\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\r\n}\r\n\r\n/* Add-provider action: a full-width dashed-outline place card matching\r\n * ModelsSection's addBlock. */\r\n.o6nt8s_addBlockButton {\r\n  width: 100%;\r\n  margin-top: 12px;\r\n  border-style: dashed;\r\n  border-radius: 12px;\r\n  height: 40px;\r\n  color: var(--dsw-alias-label-secondary);\r\n}\r\n\r\n.o6nt8s_addBlockButton:hover:not(:disabled) {\r\n  color: var(--dsw-alias-label-primary);\r\n  border-color: var(--dsw-alias-brand-primary);\r\n}\r\n\r\n/* Empty state. */\r\n.o6nt8s_empty {\r\n  margin: 0;\r\n  padding: 24px 12px;\r\n  text-align: center;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  color: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n/* Modal confirm body text. */\r\n.o6nt8s_confirmText {\r\n  margin: 0;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  color: var(--dsw-alias-label-secondary);\r\n}\r\n\r\n.o6nt8s_loading {\r\n  padding: 12px;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  color: var(--dsw-alias-label-tertiary);\r\n}\r\n\r\n/* ── Structured endpoint catalog editor (per doc 03-provider-catalog.o6nt8s_md §5) ─ */\r\n\r\n/* A row of fields laid out side-by-side (priority + quality, the three\r\n * cost fields, path + method + capability). Wraps on narrow viewports. */\r\n.o6nt8s_fieldRow {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 12px;\r\n  align-items: flex-start;\r\n}\r\n\r\n.o6nt8s_fieldRow > .o6nt8s_field {\r\n  flex: 1 1 160px;\r\n  min-width: 0;\r\n}\r\n\r\n/* The label row inside .o6nt8s_field that also holds a trailing action button\r\n * (the \"Auto-detect\" button on the Endpoints field). */\r\n.o6nt8s_fieldLabelRow {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n}\r\n\r\n.o6nt8s_endpointsAutoDetectButton {\r\n  flex: none;\r\n  height: 24px;\r\n  padding: 0 10px;\r\n  border: 1px solid var(--dsw-alias-border-l2);\r\n  border-radius: 12px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-secondary);\r\n  font: inherit;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  cursor: pointer;\r\n}\r\n\r\n.o6nt8s_endpointsAutoDetectButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover-solid);\r\n  color: var(--dsw-alias-label-primary);\r\n}\r\n\r\n/* The empty-state hint shown when the endpoints list (or a single\r\n * endpoint's params list) is empty. */\r\n.o6nt8s_endpointsEmpty {\r\n  padding: 12px;\r\n  border: 1px dashed var(--dsw-alias-border-l2);\r\n  border-radius: 8px;\r\n  background: var(--dsw-alias-bg-layer-1);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  color: var(--dsw-alias-label-tertiary);\r\n  text-align: center;\r\n}\r\n\r\n/* Container for the list of endpoint cards. */\r\n.o6nt8s_endpointsList {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n}\r\n\r\n/* One endpoint card: outlined on the editor fill, matching the rowCard\r\n * chrome but tighter (8px padding, smaller radius). */\r\n.o6nt8s_endpointCard {\r\n  border: 1px solid var(--dsw-alias-border-l2);\r\n  border-radius: 8px;\r\n  padding: 10px 12px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  background: var(--dsw-alias-bg-layer-1);\r\n}\r\n\r\n/* Head row of an endpoint card: shows method + path + capability badge\r\n * on the left, remove button on the right. */\r\n.o6nt8s_endpointHead {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n  min-width: 0;\r\n}\r\n\r\n.o6nt8s_endpointHeadLabel {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  min-width: 0;\r\n  font-family: var(--dsw-font-markdown-code-block-small, monospace);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  color: var(--dsw-alias-label-primary);\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n/* Capability badge: a small pill next to the endpoint path (e.o6nt8s_g. \"[t2i]\"). */\r\n.o6nt8s_endpointCapabilityBadge {\r\n  height: 16px;\r\n  padding: 0 5px;\r\n  border-radius: 3px;\r\n  font-size: 10px;\r\n  line-height: 14px;\r\n  font-weight: 500;\r\n  background: var(--dsw-alias-brand-primary);\r\n  color: var(--dsw-alias-label-primary-foreground);\r\n  letter-spacing: 0.02em;\r\n}\r\n\r\n/* Remove button (×) on an endpoint or param row. */\r\n.o6nt8s_endpointRemoveButton,\r\n.o6nt8s_paramRemoveButton {\r\n  flex: none;\r\n  width: 24px;\r\n  height: 24px;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  border: none;\r\n  border-radius: 4px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-tertiary);\r\n  cursor: pointer;\r\n  font-size: 16px;\r\n  line-height: 1;\r\n  padding: 0;\r\n}\r\n\r\n.o6nt8s_endpointRemoveButton:hover,\r\n.o6nt8s_paramRemoveButton:hover {\r\n  background: var(--dsw-alias-interactive-bg-hover-danger);\r\n  color: var(--dsw-alias-state-error-primary);\r\n}\r\n\r\n/* \"+ Add endpoint\" / \"+ Add parameter\" button: a dashed-outline place\r\n * card, matching the .o6nt8s_addBlockButton aesthetic but tighter. */\r\n.o6nt8s_addEndpointButton {\r\n  align-self: flex-start;\r\n  margin-top: 4px;\r\n  padding: 4px 12px;\r\n  border: 1px dashed var(--dsw-alias-border-l2);\r\n  border-radius: 8px;\r\n  background: transparent;\r\n  color: var(--dsw-alias-label-secondary);\r\n  font: inherit;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  cursor: pointer;\r\n}\r\n\r\n.o6nt8s_addEndpointButton:hover:not(:disabled) {\r\n  color: var(--dsw-alias-label-primary);\r\n  border-color: var(--dsw-alias-brand-primary);\r\n}\r\n\r\n/* Parameter table: a grid of name / type / required / default / remove.\r\n * The columns are sized so the name + default fields get the most room\r\n * (they're the most variable in length); the type + required columns\r\n * are fixed-width. */\r\n.o6nt8s_paramsTable {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 4px;\r\n}\r\n\r\n.o6nt8s_paramRow {\r\n  display: grid;\r\n  grid-template-columns: 1fr 110px auto 1fr 24px;\r\n  gap: 6px;\r\n  align-items: center;\r\n}\r\n\r\n/* \"Required\" checkbox cell: a tight label + checkbox. */\r\n.o6nt8s_paramRequired {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n  font-size: 11px;\r\n  line-height: 16px;\r\n  color: var(--dsw-alias-label-tertiary);\r\n  white-space: nowrap;\r\n}\r\n\r\n.o6nt8s_paramRequired input[type=\"checkbox\"] {\r\n  margin: 0;\r\n}\r\n\r\n/* \"Accepts $base64\" checkbox row: full-width label + checkbox. */\r\n.o6nt8s_fieldRow > input[type=\"checkbox\"] {\r\n  margin-top: 4px;\r\n}\r\n";
		const tagId = "@huanlin/dsh-plugin-aigc-canvas/SettingsPage.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@huanlin/dsh-plugin-aigc-canvas";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var SettingsPage_module_css_default = {
			"section": "o6nt8s_section",
			"title": "o6nt8s_title",
			"intro": "o6nt8s_intro",
			"error": "o6nt8s_error",
			"errorDismiss": "o6nt8s_errorDismiss",
			"rows": "o6nt8s_rows",
			"rowCard": "o6nt8s_rowCard",
			"rowHead": "o6nt8s_rowHead",
			"chevronButton": "o6nt8s_chevronButton",
			"g": "o6nt8s_g",
			"chevronSpacer": "o6nt8s_chevronSpacer",
			"chevron": "o6nt8s_chevron",
			"chevronExpanded": "o6nt8s_chevronExpanded",
			"rowIdentity": "o6nt8s_rowIdentity",
			"rowName": "o6nt8s_rowName",
			"rowNamePlaceholder": "o6nt8s_rowNamePlaceholder",
			"builtinBadge": "o6nt8s_builtinBadge",
			"defaultBadge": "o6nt8s_defaultBadge",
			"stubBadge": "o6nt8s_stubBadge",
			"realBadge": "o6nt8s_realBadge",
			"rowId": "o6nt8s_rowId",
			"rowActions": "o6nt8s_rowActions",
			"editor": "o6nt8s_editor",
			"field": "o6nt8s_field",
			"fieldLabel": "o6nt8s_fieldLabel",
			"input": "o6nt8s_input",
			"textarea": "o6nt8s_textarea",
			"authRow": "o6nt8s_authRow",
			"select": "o6nt8s_select",
			"desc": "o6nt8s_desc",
			"hint": "o6nt8s_hint",
			"primaryButton": "o6nt8s_primaryButton",
			"secondaryButton": "o6nt8s_secondaryButton",
			"dangerButton": "o6nt8s_dangerButton",
			"addBlockButton": "o6nt8s_addBlockButton",
			"empty": "o6nt8s_empty",
			"confirmText": "o6nt8s_confirmText",
			"loading": "o6nt8s_loading",
			"md": "o6nt8s_md",
			"fieldRow": "o6nt8s_fieldRow",
			"fieldLabelRow": "o6nt8s_fieldLabelRow",
			"endpointsAutoDetectButton": "o6nt8s_endpointsAutoDetectButton",
			"endpointsEmpty": "o6nt8s_endpointsEmpty",
			"endpointsList": "o6nt8s_endpointsList",
			"endpointCard": "o6nt8s_endpointCard",
			"endpointHead": "o6nt8s_endpointHead",
			"endpointHeadLabel": "o6nt8s_endpointHeadLabel",
			"endpointCapabilityBadge": "o6nt8s_endpointCapabilityBadge",
			"endpointRemoveButton": "o6nt8s_endpointRemoveButton",
			"paramRemoveButton": "o6nt8s_paramRemoveButton",
			"addEndpointButton": "o6nt8s_addEndpointButton",
			"paramsTable": "o6nt8s_paramsTable",
			"paramRow": "o6nt8s_paramRow",
			"paramRequired": "o6nt8s_paramRequired"
		};
		//#endregion
		//#region src/client/SettingsPage.tsx
		/**
		* SettingsPage — the AIGC canvas settings section: provider list CRUD.
		*
		* Visual language: matches ModelsSection / GeneralSection / yet-another-subagent —
		* outlined rowCard per provider (border-l2, r12, p12/14), filled editor surface
		* (bg-module-platform, r12, p14/16), capsule controls (h36 r18 primary,
		* h28 r14 secondary), 32px fields with border-l2 / bg-layer-1, 12/18 caption
		* labels. Every color resolves through --dsw-alias-* tokens.
		*
		* Each provider card is collapsible (chevron in the row head); the editor
		* surface is hidden when collapsed. Builtin providers (cordis.yml seed) carry
		* a `builtin`/`内置` badge next to the title. The "+ Add provider" button at
		* the bottom reveals an inline draft card with all fields editable (including
		* id) and Create / Cancel actions.
		*
		* Real providers carry an "initialize" (初始化) action: it sends a prepared
		* message to the current conversation so the agent probes the API with
		* aigc_http_request and records the usage instructions via
		* aigc_provider_set_instructions. The editor also exposes the auth scheme
		* (bearer / custom header / query param) the aigc_http_request tool uses to
		* attach the apiKey.
		*
		* @module @huanlin/dsh-plugin-aigc-canvas/client/SettingsPage
		*/
		/**
		* Default shape for a brand-new draft (before the user fills in id/name).
		* The structured-catalog fields default to sane values so the endpoints
		* editor starts empty (the agent's "Initialize" / "Auto-detect" buttons
		* populate it after probing the API).
		*/
		function emptyDraft() {
			return {
				id: "",
				name: "",
				endpoint: "stub://aigc-backend",
				apiKey: "",
				instructions: "",
				auth: {
					scheme: "bearer",
					name: ""
				},
				builtin: false,
				endpoints: [],
				priority: 100,
				costPerCall: 0,
				costPerKiloToken: 0,
				costPerSecond: 0,
				avgLatencyMs: 0,
				qualityHint: "balanced"
			};
		}
		/** Build a fresh blank endpoint (for the "+ Add endpoint" button). */
		function emptyEndpoint() {
			return {
				path: "",
				method: "POST",
				capability: "t2i",
				params: [],
				response: {
					kind: "json_text",
					path: ""
				},
				acceptsCanvasRef: false,
				notes: ""
			};
		}
		/** Build a fresh blank parameter (for the "+ Add parameter" button). */
		function emptyParam() {
			return {
				name: "",
				type: "string",
				required: false,
				default: "",
				description: ""
			};
		}
		/** Coerce a possibly-undefined value to a number (default 0 when invalid). */
		function toNumber(v, fallback = 0) {
			if (typeof v === "number" && Number.isFinite(v)) return v;
			if (typeof v === "string") {
				const n = Number(v);
				if (Number.isFinite(n) && v.trim() !== "") return n;
			}
			return fallback;
		}
		/** Coerce a possibly-undefined value to a string (default ''). */
		function toStr(v) {
			if (typeof v === "string") return v;
			if (typeof v === "number" || typeof v === "boolean") return String(v);
			return "";
		}
		/**
		* Render the AIGC provider settings page.
		* @param props - settings.section runtime share + locale + inject.
		* @returns the page element.
		*/
		function SettingsPage({ t, send }) {
			const [providers, setProviders] = (0, react.useState)([]);
			const [drafts, setDrafts] = (0, react.useState)([]);
			const [expanded, setExpanded] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [addingNew, setAddingNew] = (0, react.useState)(false);
			const [newDraft, setNewDraft] = (0, react.useState)(emptyDraft());
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(void 0);
			const [confirmDelete, setConfirmDelete] = (0, react.useState)(void 0);
			const refresh = (0, react.useCallback)(async () => {
				setLoading(true);
				setError(void 0);
				try {
					const result = await fetchConfig();
					setProviders(result.providers);
					setDrafts(result.providers.map((p) => ({
						...p,
						auth: { ...p.auth }
					})));
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setLoading(false);
				}
			}, []);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const add = (0, react.useCallback)(async () => {
				if (newDraft.id === "") return;
				try {
					const result = await addProvider(newDraft);
					setProviders(result.providers);
					setDrafts(result.providers.map((p) => ({
						...p,
						auth: { ...p.auth }
					})));
					setExpanded(/* @__PURE__ */ new Set([...expanded, newDraft.id]));
					setAddingNew(false);
					setNewDraft(emptyDraft());
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
			}, [expanded, newDraft]);
			const update = (0, react.useCallback)(async (draft) => {
				try {
					const result = await updateProvider(draft);
					setProviders(result.providers);
					setDrafts(result.providers.map((p) => ({
						...p,
						auth: { ...p.auth }
					})));
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
			}, []);
			const remove = (0, react.useCallback)(async (id) => {
				try {
					const result = await removeProvider(id);
					setProviders(result.providers);
					setDrafts(result.providers.map((p) => ({
						...p,
						auth: { ...p.auth }
					})));
					const next = new Set(expanded);
					next.delete(id);
					setExpanded(next);
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
			}, [expanded]);
			const init = (0, react.useCallback)(async (provider) => {
				const label = provider.name === "" ? provider.id : provider.name;
				const text = t("row.initPrompt").replace("{name}", label).replace("{id}", provider.id);
				try {
					await send(text);
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
			}, [send, t]);
			/**
			* Auto-detect (per docs/product/03-provider-catalog.md §5): send a
			* prepared message into the current conversation asking the agent to
			* call `aigc_probe_endpoint` for each endpoint whose response.kind is
			* not yet set, then save the detected shapes via
			* `aigc_provider_set_endpoints`. The agent handles the actual probing
			* + persistence; the client just sends the prompt (same pattern as
			* the "Initialize" action).
			*/
			const autoDetect = (0, react.useCallback)(async (provider) => {
				const label = provider.name === "" ? provider.id : provider.name;
				const text = t("row.autoDetectPrompt").replace("{name}", label).replace("{id}", provider.id);
				try {
					await send(text);
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
			}, [send, t]);
			const patchDraft = (id, patch) => {
				setDrafts((prev) => prev.map((d) => d.id === id ? {
					...d,
					...patch
				} : d));
			};
			const toggleExpand = (id) => {
				const next = new Set(expanded);
				if (next.has(id)) next.delete(id);
				else next.add(id);
				setExpanded(next);
			};
			const cancelNew = () => {
				setAddingNew(false);
				setNewDraft(emptyDraft());
			};
			const defaultId = providers.length > 0 ? providers[0]?.id : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: SettingsPage_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: SettingsPage_module_css_default.title,
						children: t("settingsTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: SettingsPage_module_css_default.intro,
						children: t("settingsIntro")
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SettingsPage_module_css_default.error,
						children: [error, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SettingsPage_module_css_default.errorDismiss,
							onClick: () => setError(void 0),
							children: "×"
						})]
					}),
					loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SettingsPage_module_css_default.loading,
						children: t("settingsLoading")
					}) : providers.length === 0 && !addingNew ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: SettingsPage_module_css_default.empty,
						children: t("settingsEmpty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
						className: SettingsPage_module_css_default.rows,
						children: [drafts.map((draft) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderCard, {
							draft,
							expanded: expanded.has(draft.id),
							isDefault: draft.id === defaultId,
							t,
							onToggle: () => toggleExpand(draft.id),
							onPatch: (patch) => patchDraft(draft.id, patch),
							onSave: () => void update(draft),
							onDelete: () => setConfirmDelete(draft.id),
							onInit: () => void init(draft),
							onAutoDetect: () => void autoDetect(draft)
						}, draft.id)), addingNew && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderCard, {
							draft: newDraft,
							expanded: true,
							isNew: true,
							isDefault: false,
							t,
							onPatch: (patch) => setNewDraft((prev) => ({
								...prev,
								...patch
							})),
							onCreate: () => void add(),
							onCancel: cancelNew
						}, "__new__")]
					}),
					!loading && !addingNew && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: SettingsPage_module_css_default.addBlockButton,
						onClick: () => setAddingNew(true),
						children: t("settingsAdd")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: confirmDelete !== void 0,
						onClose: () => {
							setConfirmDelete(void 0);
						},
						title: t("row.deleteConfirm"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SettingsPage_module_css_default.secondaryButton,
							onClick: () => {
								setConfirmDelete(void 0);
							},
							children: t("row.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SettingsPage_module_css_default.dangerButton,
							onClick: () => {
								if (confirmDelete !== void 0) remove(confirmDelete);
								setConfirmDelete(void 0);
							},
							children: t("row.delete")
						})] }),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: SettingsPage_module_css_default.confirmText,
							children: t("row.deleteConfirm")
						})
					})
				]
			});
		}
		function ProviderCard({ draft, expanded, isNew, isDefault, t, onToggle, onPatch, onSave, onDelete, onCreate, onCancel, onInit, onAutoDetect }) {
			const isStub = draft.endpoint === "" || draft.endpoint === "stub://aigc-backend";
			const patchAuth = (patch) => {
				onPatch({ auth: {
					...draft.auth,
					...patch
				} });
			};
			/**
			* Patch one endpoint in the draft's endpoints array (by index).
			* Replaces the whole array so React sees a new reference and re-renders.
			*/
			const patchEndpoint = (index, patch) => {
				const next = [...draft.endpoints ?? []];
				const existing = next[index];
				if (existing === void 0) return;
				next[index] = {
					...existing,
					...patch
				};
				onPatch({ endpoints: next });
			};
			/** Append a fresh blank endpoint to the endpoints array. */
			const addEndpoint = () => {
				onPatch({ endpoints: [...draft.endpoints ?? [], emptyEndpoint()] });
			};
			/** Remove the endpoint at one index. */
			const removeEndpoint = (index) => {
				const next = [...draft.endpoints ?? []];
				next.splice(index, 1);
				onPatch({ endpoints: next });
			};
			/**
			* Patch one parameter on one endpoint (by endpoint index + param index).
			*/
			const patchParam = (epIndex, paramIndex, patch) => {
				const ep = (draft.endpoints ?? [])[epIndex];
				if (ep === void 0) return;
				const params = [...ep.params ?? []];
				const existing = params[paramIndex];
				if (existing === void 0) return;
				params[paramIndex] = {
					...existing,
					...patch
				};
				patchEndpoint(epIndex, { params });
			};
			/** Append a fresh blank parameter to one endpoint. */
			const addParam = (epIndex) => {
				const ep = (draft.endpoints ?? [])[epIndex];
				if (ep === void 0) return;
				const params = [...ep.params ?? [], emptyParam()];
				patchEndpoint(epIndex, { params });
			};
			/** Remove the parameter at one index on one endpoint. */
			const removeParam = (epIndex, paramIndex) => {
				const ep = (draft.endpoints ?? [])[epIndex];
				if (ep === void 0) return;
				const params = [...ep.params ?? []];
				params.splice(paramIndex, 1);
				patchEndpoint(epIndex, { params });
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: SettingsPage_module_css_default.rowCard,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: SettingsPage_module_css_default.rowHead,
					children: [
						!isNew && onToggle !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SettingsPage_module_css_default.chevronButton,
							onClick: onToggle,
							"aria-label": expanded ? t("row.collapse") : t("row.expand"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: expanded ? `${SettingsPage_module_css_default.chevron} ${SettingsPage_module_css_default.chevronExpanded}` : SettingsPage_module_css_default.chevron,
								"aria-hidden": "true"
							})
						}),
						isNew && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SettingsPage_module_css_default.chevronSpacer,
							"aria-hidden": "true"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SettingsPage_module_css_default.rowIdentity,
							children: [
								isNew ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.rowNamePlaceholder,
									children: t("settingsAdd")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.rowName,
									children: draft.name === "" ? draft.id : draft.name
								}),
								draft.builtin && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
									className: SettingsPage_module_css_default.builtinBadge,
									children: t("badge.builtin")
								}),
								isDefault && !isNew && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
									className: SettingsPage_module_css_default.defaultBadge,
									children: t("badge.default")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
									className: isStub ? SettingsPage_module_css_default.stubBadge : SettingsPage_module_css_default.realBadge,
									children: isStub ? t("badge.stub") : t("badge.real")
								}),
								!isNew && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									className: SettingsPage_module_css_default.rowId,
									children: draft.id
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: SettingsPage_module_css_default.rowActions,
							children: isNew ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SettingsPage_module_css_default.primaryButton,
								onClick: onCreate,
								disabled: draft.id === "",
								children: t("row.create")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SettingsPage_module_css_default.secondaryButton,
								onClick: onCancel,
								children: t("row.cancel")
							})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								!isStub && onInit !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: SettingsPage_module_css_default.secondaryButton,
									onClick: onInit,
									children: t("row.init")
								}),
								!isStub && onAutoDetect !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: SettingsPage_module_css_default.secondaryButton,
									onClick: onAutoDetect,
									title: t("row.autoDetectTitle"),
									children: t("row.autoDetect")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: SettingsPage_module_css_default.secondaryButton,
									onClick: onSave,
									children: t("row.save")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: SettingsPage_module_css_default.dangerButton,
									onClick: onDelete,
									children: t("row.delete")
								})
							] })
						})
					]
				}), expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: SettingsPage_module_css_default.editor,
					children: [
						isNew && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: SettingsPage_module_css_default.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.fieldLabel,
									children: t("row.id")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: SettingsPage_module_css_default.input,
									value: draft.id,
									placeholder: t("row.idPlaceholder"),
									onChange: (e) => onPatch({ id: e.target.value })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.hint,
									children: t("row.idHint")
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: SettingsPage_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SettingsPage_module_css_default.fieldLabel,
								children: t("row.name")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: SettingsPage_module_css_default.input,
								value: draft.name,
								placeholder: t("row.namePlaceholder"),
								onChange: (e) => onPatch({ name: e.target.value })
							})]
						})] }),
						!isNew && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: SettingsPage_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SettingsPage_module_css_default.fieldLabel,
								children: t("row.name")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: SettingsPage_module_css_default.input,
								value: draft.name,
								placeholder: t("row.namePlaceholder"),
								onChange: (e) => onPatch({ name: e.target.value })
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: SettingsPage_module_css_default.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.fieldLabel,
									children: t("row.endpoint")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: SettingsPage_module_css_default.input,
									value: draft.endpoint,
									placeholder: t("row.endpointPlaceholder"),
									onChange: (e) => onPatch({ endpoint: e.target.value })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.desc,
									children: t("row.endpointDesc")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: SettingsPage_module_css_default.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.fieldLabel,
									children: t("row.apiKey")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: SettingsPage_module_css_default.input,
									type: "password",
									autoComplete: "off",
									value: draft.apiKey,
									placeholder: t("row.apiKeyPlaceholder"),
									onChange: (e) => onPatch({ apiKey: e.target.value })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.desc,
									children: t("row.apiKeyDesc")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SettingsPage_module_css_default.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.fieldLabel,
									children: t("row.auth")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SettingsPage_module_css_default.authRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: SettingsPage_module_css_default.select,
										value: draft.auth.scheme,
										onChange: (e) => patchAuth({ scheme: e.target.value }),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "bearer",
												children: t("row.authBearer")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "header",
												children: t("row.authHeader")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "query",
												children: t("row.authQuery")
											})
										]
									}), draft.auth.scheme !== "bearer" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: SettingsPage_module_css_default.input,
										value: draft.auth.name,
										placeholder: draft.auth.scheme === "header" ? "x-api-key" : "api_key",
										onChange: (e) => patchAuth({ name: e.target.value })
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.desc,
									children: t("row.authDesc")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SettingsPage_module_css_default.fieldRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: SettingsPage_module_css_default.field,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SettingsPage_module_css_default.fieldLabel,
										children: t("row.priority")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: SettingsPage_module_css_default.input,
										type: "number",
										min: 0,
										step: 1,
										value: toNumber(draft.priority, 100),
										onChange: (e) => onPatch({ priority: toNumber(e.target.value, 100) })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SettingsPage_module_css_default.desc,
										children: t("row.priorityDesc")
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: SettingsPage_module_css_default.field,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SettingsPage_module_css_default.fieldLabel,
										children: t("row.qualityHint")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
										className: SettingsPage_module_css_default.select,
										value: draft.qualityHint ?? "balanced",
										onChange: (e) => onPatch({ qualityHint: e.target.value }),
										children: RUNTIME_QUALITY_HINTS.map((q) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: q,
											children: q
										}, q))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SettingsPage_module_css_default.desc,
										children: t("row.qualityHintDesc")
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SettingsPage_module_css_default.fieldRow,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: SettingsPage_module_css_default.field,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: SettingsPage_module_css_default.fieldLabel,
											children: t("row.costPerCall")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: SettingsPage_module_css_default.input,
											type: "number",
											min: 0,
											step: 1e-4,
											value: toNumber(draft.costPerCall, 0),
											onChange: (e) => onPatch({ costPerCall: toNumber(e.target.value, 0) })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: SettingsPage_module_css_default.desc,
											children: t("row.costPerCallDesc")
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: SettingsPage_module_css_default.field,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: SettingsPage_module_css_default.fieldLabel,
											children: t("row.costPerKiloToken")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: SettingsPage_module_css_default.input,
											type: "number",
											min: 0,
											step: 1e-4,
											value: toNumber(draft.costPerKiloToken, 0),
											onChange: (e) => onPatch({ costPerKiloToken: toNumber(e.target.value, 0) })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: SettingsPage_module_css_default.desc,
											children: t("row.costPerKiloTokenDesc")
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: SettingsPage_module_css_default.field,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: SettingsPage_module_css_default.fieldLabel,
											children: t("row.costPerSecond")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: SettingsPage_module_css_default.input,
											type: "number",
											min: 0,
											step: 1e-4,
											value: toNumber(draft.costPerSecond, 0),
											onChange: (e) => onPatch({ costPerSecond: toNumber(e.target.value, 0) })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: SettingsPage_module_css_default.desc,
											children: t("row.costPerSecondDesc")
										})
									]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SettingsPage_module_css_default.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SettingsPage_module_css_default.fieldLabelRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SettingsPage_module_css_default.fieldLabel,
										children: t("row.endpoints")
									}), !isStub && onAutoDetect !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: SettingsPage_module_css_default.endpointsAutoDetectButton,
										onClick: onAutoDetect,
										title: t("row.autoDetectTitle"),
										children: t("row.autoDetect")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.desc,
									children: t("row.endpointsDesc")
								}),
								(draft.endpoints ?? []).length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: SettingsPage_module_css_default.endpointsEmpty,
									children: t("row.endpointsEmpty")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: SettingsPage_module_css_default.endpointsList,
									children: (draft.endpoints ?? []).map((ep, epIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EndpointCard, {
										endpoint: ep,
										t,
										onPatch: (patch) => patchEndpoint(epIndex, patch),
										onRemove: () => removeEndpoint(epIndex),
										onAddParam: () => addParam(epIndex),
										onPatchParam: (paramIndex, patch) => patchParam(epIndex, paramIndex, patch),
										onRemoveParam: (paramIndex) => removeParam(epIndex, paramIndex)
									}, epIndex))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: SettingsPage_module_css_default.addEndpointButton,
									onClick: addEndpoint,
									children: t("row.addEndpoint")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: SettingsPage_module_css_default.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.fieldLabel,
									children: t("row.instructions")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: SettingsPage_module_css_default.textarea,
									value: draft.instructions,
									placeholder: t("row.instructionsPlaceholder"),
									rows: 8,
									onChange: (e) => onPatch({ instructions: e.target.value })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.desc,
									children: t("row.instructionsDesc")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.hint,
									children: t("row.instructionsHint")
								})
							]
						})
					]
				})]
			});
		}
		/**
		* One endpoint in the catalog editor: path / method / capability /
		* response.kind / response.path + acceptsCanvasRef + notes + parameter
		* list. Per docs/product/03-provider-catalog.md §5.
		*
		* No collapsible state — the card is always expanded so the user can
		* see all fields. The parameter list is a simple grid (name / type /
		* required / default) with add/remove buttons.
		*/
		function EndpointCard({ endpoint, t, onPatch, onRemove, onAddParam, onPatchParam, onRemoveParam }) {
			const response = endpoint.response ?? {
				kind: "json_text",
				path: ""
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SettingsPage_module_css_default.endpointCard,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SettingsPage_module_css_default.endpointHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SettingsPage_module_css_default.endpointHeadLabel,
							children: [
								endpoint.method,
								" ",
								endpoint.path === "" ? "<path>" : endpoint.path,
								endpoint.capability !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
									className: SettingsPage_module_css_default.endpointCapabilityBadge,
									children: endpoint.capability
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SettingsPage_module_css_default.endpointRemoveButton,
							onClick: onRemove,
							"aria-label": t("row.removeEndpoint"),
							children: "×"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SettingsPage_module_css_default.fieldRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: SettingsPage_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.fieldLabel,
									children: t("row.endpointPath")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: SettingsPage_module_css_default.input,
									value: endpoint.path,
									placeholder: "/v1/images/generations",
									onChange: (e) => onPatch({ path: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: SettingsPage_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.fieldLabel,
									children: t("row.endpointMethod")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									className: SettingsPage_module_css_default.select,
									value: endpoint.method,
									onChange: (e) => onPatch({ method: e.target.value }),
									children: RUNTIME_HTTP_METHODS.map((m) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: m,
										children: m
									}, m))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: SettingsPage_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SettingsPage_module_css_default.fieldLabel,
									children: t("row.endpointCapability")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									className: SettingsPage_module_css_default.select,
									value: endpoint.capability,
									onChange: (e) => onPatch({ capability: e.target.value }),
									children: RUNTIME_CAPABILITIES.map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: c,
										children: c
									}, c))
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SettingsPage_module_css_default.fieldRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: SettingsPage_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SettingsPage_module_css_default.fieldLabel,
								children: t("row.endpointResponseKind")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								className: SettingsPage_module_css_default.select,
								value: response.kind,
								onChange: (e) => onPatch({ response: {
									kind: e.target.value,
									path: response.path
								} }),
								children: RUNTIME_RESPONSE_KINDS.map((k) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: k,
									children: k
								}, k))
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: SettingsPage_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SettingsPage_module_css_default.fieldLabel,
								children: t("row.endpointResponsePath")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: SettingsPage_module_css_default.input,
								value: toStr(response.path),
								placeholder: "data[0].b64_json",
								onChange: (e) => onPatch({ response: {
									kind: response.kind,
									path: e.target.value
								} })
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: SettingsPage_module_css_default.fieldRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: endpoint.acceptsCanvasRef === true,
							onChange: (e) => onPatch({ acceptsCanvasRef: e.target.checked })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SettingsPage_module_css_default.desc,
							children: t("row.endpointAcceptsCanvasRef")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: SettingsPage_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SettingsPage_module_css_default.fieldLabel,
							children: t("row.endpointNotes")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: SettingsPage_module_css_default.input,
							value: toStr(endpoint.notes),
							placeholder: "size must be 1024x1024 or 1792x1024",
							onChange: (e) => onPatch({ notes: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SettingsPage_module_css_default.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SettingsPage_module_css_default.fieldLabel,
								children: t("row.endpointParams")
							}),
							(endpoint.params ?? []).length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: SettingsPage_module_css_default.endpointsEmpty,
								children: t("row.endpointParamsEmpty")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: SettingsPage_module_css_default.paramsTable,
								children: (endpoint.params ?? []).map((param, paramIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SettingsPage_module_css_default.paramRow,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: SettingsPage_module_css_default.input,
											value: param.name,
											placeholder: t("row.endpointParamName"),
											onChange: (e) => onPatchParam(paramIndex, { name: e.target.value })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
											className: SettingsPage_module_css_default.select,
											value: param.type,
											onChange: (e) => onPatchParam(paramIndex, { type: e.target.value }),
											children: RUNTIME_PARAM_TYPES.map((tp) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: tp,
												children: tp
											}, tp))
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: SettingsPage_module_css_default.paramRequired,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: param.required,
												onChange: (e) => onPatchParam(paramIndex, { required: e.target.checked })
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("row.endpointParamRequired") })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: SettingsPage_module_css_default.input,
											value: toStr(param.default),
											placeholder: t("row.endpointParamDefault"),
											onChange: (e) => onPatchParam(paramIndex, { default: e.target.value })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: SettingsPage_module_css_default.paramRemoveButton,
											onClick: () => onRemoveParam(paramIndex),
											"aria-label": t("row.endpointRemoveParam"),
											children: "×"
										})
									]
								}, paramIndex))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SettingsPage_module_css_default.addEndpointButton,
								onClick: onAddParam,
								children: t("row.endpointAddParam")
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* i18n dictionaries for the AIGC canvas plugin.
		*
		* @module @huanlin/dsh-plugin-aigc-canvas/client/locales
		*/
		const NS = "dsh-aigc-canvas";
		const zh = {
			tabTitle: "AIGC 画布",
			title: "AIGC 画布",
			empty: "画布是空的。模型通过 aigc_http_request 调用供应商 API 生成素材,再用 aigc_canvas_place 把文件放到画布的任意位置。",
			emptyHint: "可在右侧设置页配置供应商,然后让模型开始生成。",
			prompt: "提示词",
			image: "图片",
			video: "视频",
			audio: "音频",
			meta: "元信息",
			generatedBy: "生成方式",
			edgeCount: "条连线",
			elementCount: "个元素",
			loadError: "加载画布失败",
			disconnected: "已断开,正在重连…",
			reconnecting: "正在重连…",
			refresh: "刷新",
			resetView: "重置视图",
			zoom: "缩放",
			zoomIn: "放大",
			zoomOut: "缩小",
			detailClose: "关闭",
			detailPrompt: "提示词",
			detailParams: "生成参数",
			detailPosition: "位置",
			detailPath: "文件路径",
			delete: "删除",
			deleteElement: "删除元素",
			dropHint: "拖放文件到画布",
			uploading: "上传中…",
			menuRegenerate: "重新生成...",
			menuUseAsReference: "用作参考...",
			menuSendToChat: "发到对话",
			menuDownload: "下载",
			menuPromoteToLibrary: "提升到资产库...",
			menuMarkWinner: "标记为 winner",
			menuMarkRejected: "标记为否决",
			menuArchive: "归档",
			menuSeparator: "─────────────",
			toolbarGenerate: "+ 生成",
			toolbarEditSelected: "✂ 编辑选中",
			toolbarRunWorkflow: "▶ 运行工作流",
			toolbarGenerateTitle: "打开快速生成弹窗（t2i/t2v/tts）",
			toolbarEditSelectedTitle: "对选中元素执行 ffmpeg 操作",
			toolbarRunWorkflowTitle: "打开 pipeline 模板选择器",
			toolbarNoSelection: "请先在画布上选中一个元素",
			noticeRegenerate: "请用 aigc_reroll 重新生成元素 {filePath}",
			noticeUseAsReference: "请把以下元素用作后续生成的参考: {filePath}",
			noticeSendToChat: "请使用这个元素作为参考: [filePath: {filePath}, kind: {kind}, title: {title}]",
			noticeGenerate: "请帮我生成一个新的 AIGC 素材（先调用 aigc_get_provider_info 查看可用供应商，再调用 aigc_http_request 发起生成，最后用 aigc_canvas_place 把产物放到画布上）。",
			noticeEditSelected: "请用 aigc_media_edit（ffmpeg）对选中元素进行编辑: {filePath}（kind: {kind}, title: {title}）",
			noticeRunWorkflow: "请列出可用的 pipeline 模板并运行其中一个（如果只有一个模板就直接运行它）。",
			settingsNav: "AIGC 画布",
			settingsTitle: "AIGC 供应商",
			settingsIntro: "配置一个或多个 AIGC 供应商。每个供应商可独立设置名称、API 地址、密钥、鉴权方式和调用说明。模型通过 aigc_get_provider_info 读取供应商列表,用 aigc_http_request 调用 API(自动携带 endpoint 和 apiKey),生成的文件用 aigc_canvas_place 放到画布上。",
			settingsEmpty: "暂无供应商,请在下方添加。",
			settingsAdd: "+ 添加供应商",
			settingsLoading: "加载中…",
			settingsError: "错误",
			"row.id": "ID",
			"row.name": "名称",
			"row.endpoint": "API 地址",
			"row.apiKey": "API Key",
			"row.instructions": "调用说明",
			"row.idPlaceholder": "volcano / jimeng / minimax",
			"row.namePlaceholder": "显示名(如\"火山引擎\")",
			"row.endpointPlaceholder": "stub://aigc-backend",
			"row.apiKeyPlaceholder": "sk-...",
			"row.instructionsPlaceholder": "调用说明由 Agent 初始化供应商时自动撰写(点击卡片上的\"初始化\"按钮)...",
			"row.idHint": "小写字母、数字、连字符;必须以字母开头。作为 provider_id 传给 aigc_http_request",
			"row.endpointDesc": "供应商 API 地址。填 stub://aigc-backend 使用内置 stub(合成测试媒体,不调真实 API)",
			"row.apiKeyDesc": "供应商 API 密钥。stub 后端不需要。模型看不到密钥,由 aigc_http_request 自动附加",
			"row.instructionsDesc": "Agent 通过 aigc_get_provider_info 工具读取此字段,决定如何调用该供应商的 API",
			"row.instructionsHint": "💡 点击卡片上的\"初始化\"按钮,Agent 会用 aigc_http_request 探测 API 并自动撰写调用说明",
			"row.save": "保存",
			"row.delete": "删除",
			"row.deleteConfirm": "确定删除此供应商?",
			"row.expand": "展开",
			"row.collapse": "收起",
			"row.create": "创建",
			"row.cancel": "取消",
			"row.init": "初始化",
			"row.initPrompt": "请帮我初始化 AIGC 供应商「{name}」(id: {id}):先用 aigc_get_provider_info 查看配置,再用 aigc_http_request 探测它的 API(apiKey 会自动附加,无需手动传入),最后调用 aigc_provider_set_instructions 把调用说明保存下来,方便以后直接使用。",
			"row.auth": "鉴权方式",
			"row.authBearer": "Bearer 头",
			"row.authHeader": "自定义 Header",
			"row.authQuery": "URL 参数",
			"row.authDesc": "aigc_http_request 自动附加 apiKey 的方式。默认 Authorization: Bearer <key>;选择自定义 Header 或 URL 参数时需填写名称",
			"badge.builtin": "内置",
			"badge.stub": "stub 模式",
			"badge.real": "真实 API",
			"badge.default": "默认",
			logButton: "日志",
			logTitle: "请求日志",
			logClear: "清空",
			logEmpty: "暂无请求记录。",
			logLoading: "加载中…",
			logError: "错误",
			logRequestBody: "请求体",
			logRequestHeaders: "请求头",
			logResponseBody: "响应预览",
			logProducedFile: "产物文件",
			logLocate: "在画布上定位",
			winner: "优胜",
			statusFilter: "状态",
			statusReady: "就绪",
			statusDraft: "草稿",
			statusRejected: "否决",
			statusArchived: "归档",
			compareButton: "对比",
			compareTitle: "对比视图",
			compareClose: "关闭",
			compareSelectWinner: "选为 winner",
			compareRejectAll: "全部否决",
			compareCancelSelection: "取消选择",
			compareSeed: "seed",
			compareCost: "成本",
			compareDuration: "耗时",
			comparePrompt: "提示词",
			compareNoMedia: "该元素无可显示的媒体",
			compareNotEnough: "请选择 2-4 个元素进行对比",
			compareTooMany: "最多只能同时对比 4 个元素",
			compareClearSelection: "清除选择",
			compareNSelected: "已选 {n} 个",
			"row.priority": "优先级",
			"row.qualityHint": "质量",
			"row.costPerCall": "单次成本 ($)",
			"row.costPerKiloToken": "千 token 成本 ($)",
			"row.costPerSecond": "每秒成本 ($)",
			"row.priorityDesc": "数字越小优先级越高（默认 100）。多 provider 同 capability 时按此排序",
			"row.qualityHintDesc": "fast / balanced / quality，供 Agent 选择快速或高质量 provider",
			"row.costPerCallDesc": "单次调用成本（美元），用于成本追踪",
			"row.costPerKiloTokenDesc": "按 token 计费时（chat / transcribe）的千 token 成本",
			"row.costPerSecondDesc": "按秒计费时（t2v / tts）的每秒成本",
			"row.endpoints": "Endpoints",
			"row.endpointsDesc": "结构化能力表。Agent 通过 aigc_get_provider_info 读取，无需解析自然语言",
			"row.endpointsEmpty": "暂无 endpoint。点击下方\"自动探测\"或\"+ 添加 endpoint\"",
			"row.addEndpoint": "+ 添加 endpoint",
			"row.editEndpoint": "编辑 endpoint",
			"row.removeEndpoint": "删除",
			"row.endpointPath": "Path",
			"row.endpointMethod": "Method",
			"row.endpointCapability": "Capability",
			"row.endpointResponseKind": "响应类型",
			"row.endpointResponsePath": "响应字段路径",
			"row.endpointAcceptsCanvasRef": "支持 $base64 占位符",
			"row.endpointNotes": "备注",
			"row.endpointParams": "参数",
			"row.endpointParamsEmpty": "暂无参数",
			"row.endpointParamName": "名称",
			"row.endpointParamType": "类型",
			"row.endpointParamRequired": "必填",
			"row.endpointParamDefault": "默认值",
			"row.endpointAddParam": "+ 添加参数",
			"row.endpointRemoveParam": "删除参数",
			"row.endpointCancel": "取消",
			"row.endpointSave": "保存",
			"row.autoDetect": "自动探测",
			"row.autoDetectTitle": "让 Agent 用 aigc_probe_endpoint 自动探测响应格式",
			"row.autoDetectPrompt": "请帮我自动探测 AIGC 供应商「{name}」(id: {id}) 的 endpoint 响应格式：对每个未配置响应类型的 endpoint 调用 aigc_probe_endpoint（会发送一次最小测试请求，apiKey 自动附加），把探测到的 response.kind + response.path 通过 aigc_provider_set_endpoints 保存到 EndpointSpec。如果该 provider 还没有任何 endpoint，请先用 aigc_http_request 探测常见的 endpoint（如 /v1/images/generations、/v1/videos/generations、/v1/audio/speech），再用 aigc_probe_endpoint 探测响应格式。"
		};
		const en = {
			tabTitle: "AIGC Canvas",
			title: "AIGC Canvas",
			empty: "Canvas is empty. The agent calls provider APIs via aigc_http_request and places the generated files anywhere on the canvas with aigc_canvas_place.",
			emptyHint: "Configure a provider in the settings tab on the right, then ask the agent to generate something.",
			prompt: "Prompt",
			image: "Image",
			video: "Video",
			audio: "Audio",
			meta: "Metadata",
			generatedBy: "Generated by",
			edgeCount: "edges",
			elementCount: "elements",
			loadError: "Failed to load canvas",
			disconnected: "Disconnected, reconnecting…",
			reconnecting: "Reconnecting…",
			refresh: "Refresh",
			resetView: "Reset view",
			zoom: "Zoom",
			zoomIn: "Zoom in",
			zoomOut: "Zoom out",
			detailClose: "Close",
			detailPrompt: "Prompt",
			detailParams: "Generation params",
			detailPosition: "Position",
			detailPath: "File path",
			delete: "Delete",
			deleteElement: "Delete element",
			dropHint: "Drop files onto canvas",
			uploading: "Uploading…",
			menuRegenerate: "Regenerate...",
			menuUseAsReference: "Use as reference...",
			menuSendToChat: "Send to chat",
			menuDownload: "Download",
			menuPromoteToLibrary: "Promote to library...",
			menuMarkWinner: "Mark as winner",
			menuMarkRejected: "Mark as rejected",
			menuArchive: "Archive",
			menuSeparator: "─────────────",
			toolbarGenerate: "+ Generate",
			toolbarEditSelected: "✂ Edit selected",
			toolbarRunWorkflow: "▶ Run workflow",
			toolbarGenerateTitle: "Open the quick-generate dialog (t2i/t2v/tts)",
			toolbarEditSelectedTitle: "Run an ffmpeg operation on the selected element",
			toolbarRunWorkflowTitle: "Open the pipeline template picker",
			toolbarNoSelection: "Select an element on the canvas first",
			noticeRegenerate: "Please regenerate the element {filePath} using aigc_reroll",
			noticeUseAsReference: "Please use the following element as a reference for the next generation: {filePath}",
			noticeSendToChat: "Please use this element as a reference: [filePath: {filePath}, kind: {kind}, title: {title}]",
			noticeGenerate: "Please generate a new AIGC asset (call aigc_get_provider_info to list available providers, then aigc_http_request to generate, and finally aigc_canvas_place to put the result on the canvas).",
			noticeEditSelected: "Please edit the selected element with aigc_media_edit (ffmpeg): {filePath} (kind: {kind}, title: {title})",
			noticeRunWorkflow: "Please list the available pipeline templates and run one (if there is only one, run it directly).",
			settingsNav: "AIGC Canvas",
			settingsTitle: "AIGC Providers",
			settingsIntro: "Configure one or more AIGC providers. Each provider has its own name, API endpoint, key, auth scheme, and usage instructions. The agent reads the provider list via aigc_get_provider_info, calls the API via aigc_http_request (endpoint + apiKey attached automatically), and places generated files onto the canvas with aigc_canvas_place.",
			settingsEmpty: "No providers configured. Add one below.",
			settingsAdd: "+ Add provider",
			settingsLoading: "Loading…",
			settingsError: "Error",
			"row.id": "ID",
			"row.name": "Name",
			"row.endpoint": "Endpoint",
			"row.apiKey": "API Key",
			"row.instructions": "Instructions",
			"row.idPlaceholder": "volcano / jimeng / minimax",
			"row.namePlaceholder": "Display name (e.g. \"Volcano Engine\")",
			"row.endpointPlaceholder": "stub://aigc-backend",
			"row.apiKeyPlaceholder": "sk-...",
			"row.instructionsPlaceholder": "The agent writes these when you initialize the provider (click \"Initialize\" on the card)...",
			"row.idHint": "Lowercase letters, digits, hyphens; must start with a letter. Used as the provider_id parameter to aigc_http_request",
			"row.endpointDesc": "Provider API URL. Use stub://aigc-backend for the built-in stub (synthetic test media, no real API calls)",
			"row.apiKeyDesc": "Provider API key. Not needed for the stub backend. The agent never sees it — aigc_http_request attaches it automatically",
			"row.instructionsDesc": "The agent reads this field via the aigc_get_provider_info tool to decide how to call the provider API",
			"row.instructionsHint": "💡 Click \"Initialize\" on the card: the agent probes the API with aigc_http_request and writes the instructions itself",
			"row.save": "Save",
			"row.delete": "Delete",
			"row.deleteConfirm": "Delete this provider?",
			"row.expand": "Expand",
			"row.collapse": "Collapse",
			"row.create": "Create",
			"row.cancel": "Cancel",
			"row.init": "Initialize",
			"row.initPrompt": "Please initialize the AIGC provider \"{name}\" (id: {id}): first call aigc_get_provider_info to see its config, then probe its API with aigc_http_request (the apiKey is attached automatically — do not pass it yourself), and finally call aigc_provider_set_instructions to save the usage instructions so it can be used directly later.",
			"row.auth": "Auth scheme",
			"row.authBearer": "Bearer header",
			"row.authHeader": "Custom header",
			"row.authQuery": "URL query param",
			"row.authDesc": "How aigc_http_request attaches the apiKey. Default: Authorization: Bearer <key>. For custom header or URL query param, fill in the name",
			"badge.builtin": "builtin",
			"badge.stub": "stub mode",
			"badge.real": "real API",
			"badge.default": "default",
			logButton: "Logs",
			logTitle: "Request Log",
			logClear: "Clear",
			logEmpty: "No requests logged yet.",
			logLoading: "Loading…",
			logError: "Error",
			logRequestBody: "Request body",
			logRequestHeaders: "Request headers",
			logResponseBody: "Response preview",
			logProducedFile: "Produced file",
			logLocate: "Locate on canvas",
			winner: "Winner",
			statusFilter: "Status",
			statusReady: "Ready",
			statusDraft: "Draft",
			statusRejected: "Rejected",
			statusArchived: "Archived",
			compareButton: "Compare",
			compareTitle: "Compare view",
			compareClose: "Close",
			compareSelectWinner: "Select as winner",
			compareRejectAll: "Reject all",
			compareCancelSelection: "Cancel selection",
			compareSeed: "seed",
			compareCost: "cost",
			compareDuration: "duration",
			comparePrompt: "Prompt",
			compareNoMedia: "No media to display for this element",
			compareNotEnough: "Select 2-4 elements to compare",
			compareTooMany: "You can compare at most 4 elements at once",
			compareClearSelection: "Clear selection",
			compareNSelected: "{n} selected",
			"row.priority": "Priority",
			"row.qualityHint": "Quality",
			"row.costPerCall": "Cost per call ($)",
			"row.costPerKiloToken": "Cost per 1k tokens ($)",
			"row.costPerSecond": "Cost per second ($)",
			"row.priorityDesc": "Smaller = higher priority (default 100). When multiple providers serve the same capability, they are sorted by this",
			"row.qualityHintDesc": "fast / balanced / quality — lets the agent pick fast vs. quality providers",
			"row.costPerCallDesc": "Cost per call in USD (for cost tracking)",
			"row.costPerKiloTokenDesc": "Per-1k-token cost in USD (for chat / transcribe cost tracking)",
			"row.costPerSecondDesc": "Per-second cost in USD (for t2v / tts cost tracking)",
			"row.endpoints": "Endpoints",
			"row.endpointsDesc": "Structured capability catalog. The agent reads it via aigc_get_provider_info — no natural-language parsing needed",
			"row.endpointsEmpty": "No endpoints yet. Click \"Auto-detect\" or \"+ Add endpoint\" below",
			"row.addEndpoint": "+ Add endpoint",
			"row.editEndpoint": "Edit endpoint",
			"row.removeEndpoint": "Remove",
			"row.endpointPath": "Path",
			"row.endpointMethod": "Method",
			"row.endpointCapability": "Capability",
			"row.endpointResponseKind": "Response kind",
			"row.endpointResponsePath": "Response field path",
			"row.endpointAcceptsCanvasRef": "Accepts $base64 placeholder",
			"row.endpointNotes": "Notes",
			"row.endpointParams": "Parameters",
			"row.endpointParamsEmpty": "No parameters",
			"row.endpointParamName": "Name",
			"row.endpointParamType": "Type",
			"row.endpointParamRequired": "Required",
			"row.endpointParamDefault": "Default",
			"row.endpointAddParam": "+ Add parameter",
			"row.endpointRemoveParam": "Remove parameter",
			"row.endpointCancel": "Cancel",
			"row.endpointSave": "Save",
			"row.autoDetect": "Auto-detect",
			"row.autoDetectTitle": "Ask the agent to auto-detect the response shape via aigc_probe_endpoint",
			"row.autoDetectPrompt": "Please auto-detect the response shape for the AIGC provider \"{name}\" (id: {id}): for every endpoint whose response.kind is not yet set, call aigc_probe_endpoint (it sends ONE minimal test request — apiKey is attached automatically) and save the detected response.kind + response.path into the EndpointSpec via aigc_provider_set_endpoints. If this provider has no endpoints at all yet, first probe common endpoints with aigc_http_request (e.g. /v1/images/generations, /v1/videos/generations, /v1/audio/speech), then probe the response shape with aigc_probe_endpoint."
		};
		//#endregion
		//#region src/client/index.tsx
		/** Services required before mounting. */
		const inject = [
			"betterSidebar",
			"slots",
			"locale",
			"conversation"
		];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-aigc-canvas: dictionaries");
			const t = ctx.locale.bind(NS);
			const betterSidebar = ctx.betterSidebar;
			if (betterSidebar !== void 0) ctx.effect(() => betterSidebar.registerTab({
				id: "aigc-canvas:main",
				title: () => t("tabTitle"),
				order: 50,
				dedupeKey: () => "aigc-canvas:main",
				component: ({ scope }) => {
					const storeRef = (0, react.useRef)(null);
					if (storeRef.current === null || storeRef.current.sessionId !== scope.sessionId) {
						storeRef.current?.dispose();
						storeRef.current = new CanvasStore({ sessionId: scope.sessionId });
					}
					(0, react.useEffect)(() => {
						return () => {
							storeRef.current?.dispose();
							storeRef.current = null;
						};
					}, []);
					return (0, react.createElement)(CanvasViewWithBoundary, {
						store: storeRef.current,
						t
					});
				}
			}));
			const settingsInjected = () => ({
				t,
				send: (text) => ctx.conversation.send(text)
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "aigc-canvas",
				order: 60,
				label: () => t("settingsNav"),
				locale: NS,
				inject: settingsInjected
			}, SettingsPage));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map