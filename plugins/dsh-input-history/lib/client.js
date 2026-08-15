window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-input-history",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region src/client/history.ts
		/** The resting state: not browsing, nothing saved. */
		const IDLE = {
			index: null,
			savedDraft: ""
		};
		/**
		* Extract the plain-text of one user message: concatenated `text` blocks.
		* The blocks are treated structurally (any array works) so the module never
		* needs the LLM ContentBlock type — a cross-package dependency.
		* @param blocks - the message content blocks.
		* @returns the concatenated text, untrimmed.
		*/
		function textOf(blocks) {
			let text = "";
			for (const block of blocks) {
				if (typeof block !== "object" || block === null) continue;
				const record = block;
				if (record.type !== "text" || typeof record.text !== "string") continue;
				text += record.text;
			}
			return text;
		}
		/**
		* Build the recallable history for one session: every non-blank user
		* message, newest last, with adjacent duplicates collapsed (rapid re-sends
		* of the same text must not produce repeated recall entries).
		* @param nodes - the conversation snapshot nodes.
		* @returns history in chronological order; recall walks it backwards.
		*/
		function extractHistory(nodes) {
			const out = [];
			for (const node of nodes) {
				if (node.kind !== "user") continue;
				const trimmed = textOf(node.content).trim();
				if (trimmed === "") continue;
				const last = out[out.length - 1];
				if (last !== void 0 && last === trimmed) continue;
				out.push(trimmed);
			}
			return out;
		}
		/**
		* Ctrl+Up: enter history recall or move one entry older.
		* First press saves the current draft (the live state) and shows the newest
		* entry; subsequent presses walk older toward index 0.
		* @param history - extracted history (chronological).
		* @param draft - the composer draft at press time.
		* @param browse - current browse state.
		* @returns the next state and the text to fill.
		*/
		function up(history, draft, browse) {
			if (history.length === 0) return {
				browse,
				text: null
			};
			if (browse.index === null) {
				const nextIndex = history.length - 1;
				return {
					browse: {
						index: nextIndex,
						savedDraft: draft
					},
					text: history[nextIndex] ?? null
				};
			}
			if (browse.index === 0) return {
				browse,
				text: null
			};
			const nextIndex = browse.index - 1;
			return {
				browse: {
					...browse,
					index: nextIndex
				},
				text: history[nextIndex] ?? null
			};
		}
		/**
		* Ctrl+Down: move one entry newer, or return to live.
		* At the newest entry another press returns to live, restoring the draft
		* saved on the first Ctrl+Up (the empty draft restores as empty).
		* @param history - extracted history (chronological).
		* @param browse - current browse state.
		* @returns the next state and the text to fill (null while already live).
		*/
		function down(history, browse) {
			if (browse.index === null) return {
				browse,
				text: null
			};
			if (browse.index === history.length - 1) return {
				browse: IDLE,
				text: browse.savedDraft
			};
			const nextIndex = browse.index + 1;
			return {
				browse: {
					...browse,
					index: nextIndex
				},
				text: history[nextIndex] ?? null
			};
		}
		/**
		* Re-sync after the composer changed without our keyboard path (typing,
		* paste, a send clearing the draft, a new message arriving): any draft that
		* no longer equals the shown history entry drops the browse state, so the
		* next Ctrl+Up starts fresh from the newest entry.
		* @param history - extracted history (chronological).
		* @param draft - the current composer draft.
		* @param browse - current browse state.
		* @returns the resynced state.
		*/
		function resync(history, draft, browse) {
			if (browse.index === null) return browse;
			if (history[browse.index] === draft) return browse;
			return IDLE;
		}
		//#endregion
		//#region src/client/index.ts
		/** Stable Cordis plugin name (matches the manifest id). */
		const name = "dsh-input-history";
		/**
		* Required services: the scope-addressed conversation face (input machine
		* writes) and the sessions face (current session + snapshot reads). Both are
		* root-level services provided by the stock web app.
		*/
		const inject = ["conversation", "sessions"];
		/**
		* Whether the keydown/input target is the conversation composer textarea.
		* The composer textarea is the only one inside the `data-input-scroll`
		* frame, so the check stays robust against CSS-module class hashing.
		* @param target - the event target.
		* @returns true when the target is the composer textarea.
		*/
		function isComposerTarget(target) {
			if (!(target instanceof HTMLTextAreaElement)) return false;
			return target.closest("[data-input-scroll]") !== null;
		}
		/**
		* Browser plugin body: capture Ctrl+Up / Ctrl+Down on the composer and drive
		* the input machine's draft through the pure history state machine. A live
		* composer edit or a session switch drops the browse state (the input event
		* re-sync covers both, plus sends clearing the draft).
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.inject(["conversation", "sessions"], (scope) => {
				let browse = IDLE;
				let lastSessionId;
				const sessions = scope.get("sessions");
				const resolve = () => {
					const id = sessions.list.getSnapshot().current;
					if (id === void 0) return null;
					if (id !== lastSessionId) {
						browse = IDLE;
						lastSessionId = id;
					}
					const actx = sessions.scope(id);
					if (actx === void 0) return null;
					const session = sessions.sessionOf(actx);
					if (session === void 0) return null;
					const conversation = actx.get("conversation");
					if (conversation === void 0) return null;
					return {
						input: conversation.input.for(actx),
						nodes: session.getSnapshot().nodes
					};
				};
				const onKeyDown = (e) => {
					if (!e.ctrlKey || e.altKey || e.metaKey) return;
					if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
					if (e.isComposing) return;
					if (!isComposerTarget(e.target)) return;
					const resolved = resolve();
					if (resolved === null) return;
					const history = extractHistory(resolved.nodes);
					const draft = resolved.input.state.getSnapshot().draft;
					const step = e.key === "ArrowUp" ? up(history, draft, browse) : down(history, browse);
					const text = step.text;
					if (text === null) return;
					e.preventDefault();
					e.stopPropagation();
					browse = step.browse;
					resolved.input.setDraft(text);
					const el = e.target;
					requestAnimationFrame(() => {
						el.setSelectionRange(text.length, text.length);
					});
				};
				const onInput = (e) => {
					if (!isComposerTarget(e.target)) return;
					const resolved = resolve();
					if (resolved === null) return;
					const el = e.target;
					browse = resync(extractHistory(resolved.nodes), el.value, browse);
				};
				scope.effect(() => {
					window.addEventListener("keydown", onKeyDown, true);
					window.addEventListener("input", onInput, true);
					return () => {
						window.removeEventListener("keydown", onKeyDown, true);
						window.removeEventListener("input", onInput, true);
					};
				}, "dsh-input-history: composer keyboard capture");
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
