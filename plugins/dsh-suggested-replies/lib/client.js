window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-suggested-replies",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/SuggestedRepliesSection.tsx
		/**
		* Settings section for the suggested-replies master switch.
		*
		* @module @dsh-external/dsh-suggested-replies/client/SuggestedRepliesSection
		*/
		const sectionStyle = {
			display: "flex",
			flexDirection: "column"
		};
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 24,
			padding: "14px 0",
			borderTop: "1px solid rgba(128, 128, 128, 0.22)"
		};
		const noteStyle = {
			marginTop: 14,
			padding: "10px 12px",
			borderRadius: 8,
			background: "rgba(128, 128, 128, 0.12)",
			fontSize: 13,
			lineHeight: 1.6
		};
		const errorStyle = {
			marginBottom: 8,
			padding: "10px 12px",
			borderRadius: 8,
			background: "rgba(192, 64, 64, 0.12)",
			fontSize: 13
		};
		/** Accessible switch with host-theme-neutral styling. */
		function Toggle({ on, label, disabled, onToggle }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "switch",
				"aria-checked": on,
				"aria-label": label,
				disabled,
				onClick: onToggle,
				style: {
					position: "relative",
					flex: "0 0 auto",
					width: 44,
					height: 26,
					padding: 0,
					border: 0,
					borderRadius: 13,
					background: on ? "#2f6fed" : "rgba(128, 128, 128, 0.35)",
					cursor: disabled ? "not-allowed" : "pointer",
					opacity: disabled ? .5 : 1
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					style: {
						position: "absolute",
						top: 3,
						left: on ? 21 : 3,
						width: 20,
						height: 20,
						borderRadius: "50%",
						background: "#fff",
						transition: "left 160ms ease"
					}
				})
			});
		}
		/** Render and persist the master enable switch. */
		function SuggestedRepliesSection({ rpc, t }) {
			const [enabled, setEnabled] = (0, react.useState)();
			const [writing, setWriting] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let mounted = true;
				(async () => {
					try {
						const result = await rpc.call("/suggested-replies", "settings.get", {});
						if (!mounted) return;
						if (result.ok) setEnabled(result.value.enabled);
						else {
							setEnabled(true);
							setError(result.error.message);
						}
					} catch (cause) {
						if (!mounted) return;
						setEnabled(true);
						setError(cause instanceof Error ? cause.message : String(cause));
					}
				})();
				return () => {
					mounted = false;
				};
			}, [rpc]);
			const toggle = async () => {
				if (enabled === void 0 || writing) return;
				setWriting(true);
				setError(void 0);
				try {
					const result = await rpc.call("/suggested-replies", "settings.set", { enabled: !enabled });
					if (result.ok) setEnabled(result.value.enabled);
					else setError(result.error.message);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setWriting(false);
				}
			};
			if (enabled === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				style: sectionStyle,
				children: "..."
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: sectionStyle,
				children: [
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: errorStyle,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: rowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 15,
								lineHeight: 1.4
							},
							children: t("settings.enabled.label")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								marginTop: 2,
								fontSize: 13,
								lineHeight: 1.5,
								opacity: .62
							},
							children: t("settings.enabled.description")
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							on: enabled,
							label: t("settings.enabled.label"),
							disabled: writing,
							onToggle: () => void toggle()
						})]
					}),
					!enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: noteStyle,
						children: t("settings.disabled.note")
					})
				]
			});
		}
		//#endregion
		//#region src/client/SuggestionBubbles.tsx
		/**
		* Input-dock bubbles that copy a suggested reply into the message draft.
		*
		* @module @dsh-external/dsh-suggested-replies/client/SuggestionBubbles
		*/
		const STYLE_TAG_ID = "dsh-suggested-replies-style";
		let styleUsers = 0;
		const CSS_TEXT = `
.dsh-suggested-replies-dock {
  box-sizing: border-box;
  flex: none;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - 4 * var(--dsh-composer-dock-inset));
  max-width: calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));
  margin: 0 auto;
}
.dsh-suggested-replies-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.dsh-suggested-replies-row::-webkit-scrollbar {
  display: none;
}
.dsh-suggested-replies-loading {
  color: var(--dsw-alias-label-tertiary, #68707d);
  font-size: 12px;
  line-height: 20px;
}
.dsh-suggested-replies-label {
  flex: none;
  color: var(--dsw-alias-label-tertiary, #68707d);
  font-size: 12px;
  line-height: 20px;
}
.dsh-suggested-replies-bubble {
  box-sizing: border-box;
  flex: none;
  max-width: min(100%, 320px);
  overflow: hidden;
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l1, #d8dce2);
  border-radius: 999px;
  background: var(--dsw-specific-tip, rgba(127, 136, 153, 0.12));
  color: var(--dsw-alias-label-primary, #23262d);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-suggested-replies-bubble:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-business-primary, #2f6fed);
  background: var(--dsw-alias-interactive-bg-hover, rgba(47, 111, 237, 0.12));
}
.dsh-suggested-replies-bubble:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #2f6fed);
  outline-offset: 2px;
}
.dsh-suggested-replies-bubble:disabled { cursor: default; opacity: .52; }
`;
		const ROOT_STYLE = { display: "contents" };
		/** Render loading text or ready bubbles directly above the composer card. */
		function SuggestionBubbles({ rpc, sessionId, useInput, inputActions, t }) {
			const [observed, setObserved] = (0, react.useState)();
			const phase = useInput((state) => state.phase);
			const state = observed !== void 0 && observed.sessionId === sessionId ? observed.value : void 0;
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				const { signal } = controller;
				const publish = (value) => {
					if (!signal.aborted) setObserved({
						sessionId,
						value
					});
				};
				const clear = () => {
					if (signal.aborted) return;
					setObserved((current) => current?.sessionId === sessionId ? void 0 : current);
				};
				(async () => {
					try {
						const initial = await rpc.call("/suggested-replies", "state.get", { sessionId }, signal);
						if (signal.aborted) return;
						if (!initial.ok) {
							clear();
							return;
						}
						let current = initial.value;
						publish(current);
						while (!signal.aborted) {
							const watched = await rpc.call("/suggested-replies", "state.watch", {
								sessionId,
								lifecycle: current.lifecycle,
								revision: current.revision
							}, signal);
							if (signal.aborted) return;
							if (!watched.ok) {
								clear();
								return;
							}
							current = watched.value;
							publish(current);
						}
					} catch {
						clear();
					}
				})();
				return () => controller.abort();
			}, [rpc, sessionId]);
			(0, react.useEffect)(() => {
				styleUsers += 1;
				if (document.getElementById(STYLE_TAG_ID) === null) {
					const tag = document.createElement("style");
					tag.id = STYLE_TAG_ID;
					tag.textContent = CSS_TEXT;
					document.head.appendChild(tag);
				}
				return () => {
					styleUsers -= 1;
					if (styleUsers !== 0) return;
					document.getElementById(STYLE_TAG_ID)?.remove();
				};
			}, []);
			if (state === void 0 || state.phase === "cleared") return null;
			if (state.phase === "generating") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: ROOT_STYLE,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-suggested-replies-dock",
					"data-suggested-replies-dock": "",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-suggested-replies-row dsh-suggested-replies-loading",
						role: "status",
						children: t("loading")
					})
				})
			});
			if (state.suggestions.length === 0) return null;
			const disabled = phase !== "plain";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: ROOT_STYLE,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-suggested-replies-dock",
					"data-suggested-replies-dock": "",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-suggested-replies-row",
						"aria-label": t("title"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-suggested-replies-label",
							children: t("title")
						}), state.suggestions.map((text, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-suggested-replies-bubble",
							disabled,
							title: t("hint"),
							onClick: () => inputActions.setDraft(text),
							children: text
						}, `${state.turn}-${index}`))]
					})
				})
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Locale namespace registered by the client plugin. */
		const NS = "suggested-replies";
		/** English copy. */
		const en = {
			title: "Suggested next messages",
			hint: "Click to fill the message box",
			loading: "Preparing next-message suggestions...",
			"settings.nav": "Suggested replies",
			"settings.enabled.label": "Enable suggested replies",
			"settings.enabled.description": "Generate candidate next messages after an AI reply. Clicking a candidate only fills the draft; it never sends automatically.",
			"settings.disabled.note": "Disabled. Completed turns do not make auxiliary suggestion calls until you enable it again."
		};
		/** Simplified Chinese copy. */
		const zh = {
			title: "下一步建议",
			hint: "点击填入输入框",
			loading: "正在生成下一步建议...",
			"settings.nav": "下一步建议",
			"settings.enabled.label": "启用下一步建议",
			"settings.enabled.description": "AI 回复结束后生成可直接作为下一条消息发送的候选。点击候选只会填入输入框，绝不会自动发送。",
			"settings.disabled.note": "已关闭。后续完成的对话轮次不会再发起候选生成，重新启用后恢复。"
		};
		//#endregion
		//#region src/client/index.ts
		/** Required client services: slots, locale registration, and settings RPC transport. */
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/**
		* Register the input-dock candidate row and the settings master switch.
		* @param ctx - browser client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-suggested-replies: dictionaries");
			const connection = ctx.connection;
			const bubblesInjected = () => ({ rpc: connection.rpc });
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "suggested-replies",
				order: 15,
				locale: NS,
				inject: bubblesInjected
			}, SuggestionBubbles));
			const settingsInjected = () => ({ rpc: connection.rpc });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "suggested-replies",
				order: 70,
				label: () => ctx.locale.bind(NS)("settings.nav"),
				locale: NS,
				inject: settingsInjected
			}, SuggestedRepliesSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map