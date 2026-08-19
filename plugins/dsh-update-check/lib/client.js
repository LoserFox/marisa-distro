window.__ModuleLoader__.load({
	id: "@omdsh-dev/dsh-update-check",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/protocol.ts
		/** Host 路由与负载类型（host 与 client 共享）。 */
		/** 同源路由：host 经 ctx.webServer 注册，client 直接相对路径 fetch。 */
		const STATE_ROUTE = "/plugins/dsh-update-check/state";
		const CHECK_ROUTE = "/plugins/dsh-update-check/check";
		const DISMISS_ROUTE = "/plugins/dsh-update-check/dismiss";
		const SETTINGS_ROUTE = "/plugins/dsh-update-check/settings";
		//#endregion
		//#region src/client/banner.ts
		const BANNER_ID = "dsh-update-check-banner";
		/** 首次拉取失败后的单次重试延迟（后端可能尚未就绪）。 */
		const RETRY_DELAY_MS = 5e3;
		function mountUpdateBanner(ctx) {
			const t = ctx.locale.bind("update-check");
			let disposed = false;
			let retried = false;
			const root = document.createElement("div");
			root.id = BANNER_ID;
			root.setAttribute("role", "status");
			root.setAttribute("aria-live", "polite");
			Object.assign(root.style, {
				position: "fixed",
				top: "12px",
				left: "50%",
				transform: "translateX(-50%)",
				zIndex: "2147483646",
				display: "none",
				alignItems: "center",
				gap: "12px",
				boxSizing: "border-box",
				maxWidth: "min(640px, calc(100vw - 32px))",
				padding: "10px 14px",
				border: "1px solid var(--dsw-alias-border-l2-darkmode-thin, rgb(15 23 42 / 14%))",
				borderRadius: "8px",
				background: "var(--dsw-alias-bg-layer-1, #ffffff)",
				color: "var(--dsw-alias-label-primary, #1a1f2e)",
				boxShadow: "var(--dsw-shadow-lv3, 0 12px 32px rgb(15 23 42 / 18%))",
				font: "400 13px/1.5 -apple-system, BlinkMacSystemFont, sans-serif",
				letterSpacing: "0"
			});
			const message = document.createElement("div");
			Object.assign(message.style, {
				flex: "1",
				minWidth: "0",
				overflowWrap: "anywhere",
				whiteSpace: "pre-wrap"
			});
			const actions = document.createElement("div");
			Object.assign(actions.style, {
				display: "flex",
				alignItems: "center",
				gap: "6px",
				flex: "0 0 auto"
			});
			root.append(message, actions);
			document.body.append(root);
			const linkStyle = () => ({
				padding: "5px 10px",
				borderRadius: "5px",
				cursor: "pointer",
				textDecoration: "none",
				font: "400 12px/1.4 -apple-system, BlinkMacSystemFont, sans-serif",
				border: "1px solid var(--dsw-alias-border-l2, rgb(15 23 42 / 14%))",
				background: "transparent",
				color: "var(--dsw-alias-label-primary, #1a1f2e)"
			});
			const hide = () => {
				root.style.display = "none";
			};
			const dismiss = async (version) => {
				try {
					await fetch(DISMISS_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ version })
					});
				} catch {}
				hide();
			};
			const show = (payload) => {
				if (disposed) return;
				if (!payload.hasUpdate || payload.latest === null) return;
				if (payload.dismissedVersion === payload.latest) return;
				message.textContent = t("banner.text", {
					latest: payload.latest,
					current: payload.currentVersion || "—"
				});
				actions.replaceChildren();
				const view = document.createElement("a");
				view.textContent = t("banner.view");
				view.href = payload.assets.releasePage ?? payload.assets.download ?? "#";
				view.target = "_blank";
				view.rel = "noreferrer";
				Object.assign(view.style, linkStyle());
				if (payload.assets.download !== null) {
					const download = document.createElement("a");
					download.textContent = t("banner.download");
					download.href = payload.assets.download;
					download.target = "_blank";
					download.rel = "noreferrer";
					Object.assign(download.style, linkStyle(), {
						borderColor: "var(--dsw-alias-state-business-primary, #3964fe)",
						color: "var(--dsw-alias-state-business-primary, #3964fe)"
					});
					actions.append(view, download);
				} else actions.append(view);
				const close = document.createElement("button");
				close.type = "button";
				close.textContent = "×";
				close.setAttribute("aria-label", t("banner.close"));
				Object.assign(close.style, linkStyle(), {
					width: "26px",
					height: "26px",
					padding: "0",
					border: "0",
					borderRadius: "4px",
					font: "400 18px/1 -apple-system, BlinkMacSystemFont, sans-serif"
				});
				close.addEventListener("click", () => {
					dismiss(payload.latest);
				});
				actions.append(close);
				root.style.display = "flex";
			};
			const applyPayload = (payload) => {
				if (payload.lastCheckAt === null && payload.autoCheck) {
					fetch(CHECK_ROUTE, { method: "POST" }).then(async (response) => {
						if (!response.ok) return;
						show(await response.json());
					}).catch(() => {});
					return;
				}
				show(payload);
			};
			const load = async () => {
				try {
					const response = await fetch(STATE_ROUTE);
					if (!response.ok) return;
					applyPayload(await response.json());
				} catch {
					if (!disposed && !retried) {
						retried = true;
						setTimeout(() => {
							load();
						}, RETRY_DELAY_MS);
					}
				}
			};
			load();
			return { dispose() {
				disposed = true;
				root.remove();
			} };
		}
		//#endregion
		//#region src/client/card.tsx
		/** 设置页卡片（settings.plugin.item，key = update-check 命名空间）。 */
		const colors = {
			panel: "var(--dsw-alias-bg-layer-1, #111820)",
			raised: "var(--dsw-alias-bg-layer-2, #18222c)",
			text: "var(--dsw-alias-label-primary, #e7edf4)",
			muted: "var(--dsw-alias-label-secondary, #8d9bab)",
			border: "var(--dsw-alias-border-l2, rgba(150,180,210,.14))",
			cyan: "#43c6d9",
			green: "#52c77a",
			amber: "#d7a84d",
			danger: "#ef6a6a"
		};
		function formatTime(iso) {
			const date = new Date(iso);
			return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
		}
		/**
		* 更新检查卡片：当前/最新版本、changelog、立即检查、自动检查开关与按
		* 安装形态选出的下载按钮。数据全部来自 host 的 state 路由。
		*/
		function UpdateCheckCard({ t }) {
			const [state, setState] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const load = (0, react.useCallback)(async () => {
				try {
					const response = await fetch(STATE_ROUTE);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					setState(await response.json());
					setError(null);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			}, []);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const checkNow = async () => {
				setBusy(true);
				setError(null);
				try {
					const response = await fetch(CHECK_ROUTE, { method: "POST" });
					if (response.status === 429) {
						setError(t("card.checkTooFrequent"));
						await load();
						return;
					}
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					setState(await response.json());
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(false);
				}
			};
			const toggleAutoCheck = async (autoCheck) => {
				try {
					const response = await fetch(SETTINGS_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ autoCheck })
					});
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					setState((current) => current === null ? current : {
						...current,
						autoCheck
					});
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			};
			if (state === null) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: {
					border: `1px solid ${colors.border}`,
					borderRadius: 8,
					background: colors.panel,
					overflow: "hidden"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: { padding: "13px 14px 11px" },
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: {
							color: colors.text,
							fontSize: 13
						},
						children: t("card.title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							display: "block",
							color: colors.muted,
							fontSize: 11,
							marginTop: 4
						},
						children: t("card.description")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						borderTop: `1px solid ${colors.border}`,
						padding: "12px 14px 14px",
						display: "grid",
						gap: 10
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								justifyContent: "space-between",
								gap: 12,
								color: colors.muted,
								fontSize: 11
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									t("card.current"),
									"：",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { color: colors.text },
										children: state.currentVersion || "—"
									})
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									t("card.latest"),
									"：",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { color: colors.text },
										children: state.latest ?? "—"
									})
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: state.hasUpdate ? colors.amber : colors.green,
										fontWeight: 600
									},
									children: state.latest === null ? t("card.noRelease") : state.hasUpdate ? t("card.hasUpdate") : t("card.upToDate")
								})
							]
						}),
						state.lastCheckAt !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								color: colors.muted,
								fontSize: 10
							},
							children: t("card.lastChecked", { time: formatTime(state.lastCheckAt) })
						}),
						state.changelog !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								color: colors.muted,
								fontSize: 10,
								marginBottom: 5
							},
							children: t("card.changelog")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							style: {
								margin: 0,
								whiteSpace: "pre-wrap",
								overflowWrap: "anywhere",
								color: colors.text,
								fontSize: 11,
								lineHeight: 1.6,
								maxHeight: 240,
								overflowY: "auto",
								fontFamily: "inherit"
							},
							children: state.changelog
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								color: colors.muted,
								fontSize: 11
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								"aria-label": t("card.autoCheck"),
								type: "checkbox",
								checked: state.autoCheck,
								onChange: (event) => {
									toggleAutoCheck(event.target.checked);
								}
							}), t("card.autoCheck")]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								justifyContent: "flex-end",
								alignItems: "center",
								gap: 8
							},
							children: [
								error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: colors.danger,
										fontSize: 10,
										flex: "1"
									},
									children: error
								}),
								state.assets.download !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: state.assets.download,
									target: "_blank",
									rel: "noreferrer",
									style: {
										padding: "6px 12px",
										borderRadius: 5,
										textDecoration: "none",
										fontSize: 11,
										border: `1px solid ${colors.cyan}`,
										background: colors.cyan,
										color: "#071015"
									},
									children: t("card.download")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: busy,
									onClick: () => {
										checkNow();
									},
									style: {
										padding: "6px 12px",
										borderRadius: 5,
										fontSize: 11,
										cursor: "pointer",
										border: `1px solid ${colors.border}`,
										background: colors.raised,
										color: colors.text
									},
									children: busy ? t("card.checking") : t("card.checkNow")
								})
							]
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** `update-check` 命名空间字典（zh 为 key 源，en 与其键集逐项对齐）。 */
		const zh = {
			"card.title": "检查更新",
			"card.description": "定期检查 GitHub Releases，发现新版本时在设置页与启动横幅提示（仅检查与通知，不下载不安装）",
			"card.current": "当前版本",
			"card.latest": "最新版本",
			"card.upToDate": "已是最新版本",
			"card.hasUpdate": "有新版本可用",
			"card.noRelease": "暂无发布信息",
			"card.changelog": "更新内容",
			"card.checkNow": "立即检查",
			"card.checking": "检查中…",
			"card.autoCheck": "自动检查更新",
			"card.download": "下载",
			"card.checkFailed": "检查失败：{message}",
			"card.checkTooFrequent": "检查太频繁，请 30 秒后再试",
			"card.lastChecked": "上次检查：{time}",
			"banner.text": "发现新版本 {latest}（当前 {current}）",
			"banner.view": "查看",
			"banner.download": "下载",
			"banner.close": "关闭"
		};
		const en = {
			"card.title": "Check for updates",
			"card.description": "Periodically checks GitHub Releases and notifies in the settings page and at startup (check and notify only — no download, no install)",
			"card.current": "Current version",
			"card.latest": "Latest version",
			"card.upToDate": "Up to date",
			"card.hasUpdate": "Update available",
			"card.noRelease": "No release info yet",
			"card.changelog": "Changelog",
			"card.checkNow": "Check now",
			"card.checking": "Checking…",
			"card.autoCheck": "Check automatically",
			"card.download": "Download",
			"card.checkFailed": "Check failed: {message}",
			"card.checkTooFrequent": "Checked too recently — retry in 30 seconds",
			"card.lastChecked": "Last checked: {time}",
			"banner.text": "New version {latest} available (current {current})",
			"banner.view": "View",
			"banner.download": "Download",
			"banner.close": "Close"
		};
		//#endregion
		//#region src/client/index.ts
		/** 字典命名空间（与 host 的 settings namespace 同名同 key）。 */
		const NS = "update-check";
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "update-check: dictionaries");
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: NS,
				priority: 60,
				locale: NS
			}, UpdateCheckCard));
			ctx.effect(() => mountUpdateBanner(ctx).dispose, "update-check: startup banner");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
