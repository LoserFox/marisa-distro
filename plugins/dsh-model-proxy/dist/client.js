window.__ModuleLoader__.load({
	id: "dsh-model-proxy",
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
		//#region src/client/index.tsx
		const NS = "model-proxy";
		const zh = {
			title: "模型代理",
			description: "通过 HTTP_PROXY 代理模型与网页请求，并让 Agent 启动的 PowerShell 继承同一代理。",
			proxy: "代理地址",
			proxyHint: "留空：HTTP_PROXY → HTTPS_PROXY → ALL_PROXY → http://127.0.0.1:10808；填写 direct 可直连。带账号密码的代理请通过环境变量配置。",
			noProxy: "直连主机",
			noProxyHint: "每行或逗号分隔；会追加到 NO_PROXY。localhost、127.0.0.1、::1 始终直连。",
			endpoint: "DeepSeek API 地址始终保持 https://api.deepseek.com；这里只改变传输路径。",
			save: "保存并立即应用",
			saving: "保存中…",
			discard: "放弃修改",
			failed: "保存失败，请检查配置后重试。",
			unavailable: "当前连接不能修改 Host 设置。"
		};
		const en = {
			title: "Model proxy",
			description: "Routes model and Web requests through HTTP_PROXY and exports the same proxy to PowerShell launched by the agent.",
			proxy: "Proxy URL",
			proxyHint: "Blank: HTTP_PROXY → HTTPS_PROXY → ALL_PROXY → http://127.0.0.1:10808. Enter direct to bypass it; use environment variables for authenticated proxies.",
			noProxy: "Direct hosts",
			noProxyHint: "One per line or comma-separated; appended to NO_PROXY. localhost, 127.0.0.1, and ::1 always connect directly.",
			endpoint: "The DeepSeek API endpoint remains https://api.deepseek.com; this changes only the transport path.",
			save: "Save and apply now",
			saving: "Saving…",
			discard: "Discard changes",
			failed: "Save failed. Check the configuration and try again.",
			unavailable: "This connection cannot modify Host settings."
		};
		const colors = {
			panel: "var(--dsw-alias-bg-layer-1, #111820)",
			raised: "var(--dsw-alias-bg-layer-2, #18222c)",
			text: "var(--dsw-alias-label-primary, #e7edf4)",
			muted: "var(--dsw-alias-label-secondary, #8d9bab)",
			border: "var(--dsw-alias-border-l2, rgba(150,180,210,.14))",
			cyan: "#43c6d9",
			danger: "#ef6a6a"
		};
		function parseNoProxy(text) {
			return [...new Set(text.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean))];
		}
		function createModelProxyCard(scope) {
			return function ModelProxyCard({ t }) {
				const snapshot = (0, react.useSyncExternalStore)((listener) => scope.subscribe(listener), () => scope.getSnapshot(), () => scope.getSnapshot());
				const [proxy, setProxy] = (0, react.useState)("");
				const [noProxy, setNoProxy] = (0, react.useState)("");
				const [dirtyFields, setDirtyFields] = (0, react.useState)({
					proxy: false,
					noProxy: false
				});
				const [saving, setSaving] = (0, react.useState)(false);
				const [failed, setFailed] = (0, react.useState)(false);
				const dirty = dirtyFields.proxy || dirtyFields.noProxy;
				(0, react.useEffect)(() => {
					if (snapshot.status !== "ready" || dirty) return;
					setProxy(snapshot.value?.proxy ?? "");
					setNoProxy((snapshot.value?.noProxy ?? []).join("\n"));
				}, [snapshot, dirty]);
				if (snapshot.status === "unavailable") return null;
				const discard = () => {
					setProxy(snapshot.value?.proxy ?? "");
					setNoProxy((snapshot.value?.noProxy ?? []).join("\n"));
					setDirtyFields({
						proxy: false,
						noProxy: false
					});
					setFailed(false);
				};
				const save = async () => {
					if (!snapshot.writable || saving || !dirty) return;
					setSaving(true);
					setFailed(false);
					try {
						const proxyValue = proxy.trim();
						const directHosts = parseNoProxy(noProxy);
						let landed = true;
						if (dirtyFields.proxy) {
							if (proxyValue === "") await scope.unset("proxy");
							else await scope.set("proxy", proxyValue);
							const user = scope.getSnapshot().user;
							landed = proxyValue === "" ? user === void 0 || !Object.hasOwn(user, "proxy") : user?.proxy === proxyValue;
						}
						if (landed && dirtyFields.noProxy) {
							if (directHosts.length === 0) await scope.unset("noProxy");
							else await scope.set("noProxy", directHosts);
							const user = scope.getSnapshot().user;
							landed = directHosts.length === 0 ? user === void 0 || !Object.hasOwn(user, "noProxy") : Array.isArray(user?.noProxy) && user.noProxy.length === directHosts.length && user.noProxy.every((value, index) => value === directHosts[index]);
						}
						if (landed) setDirtyFields({
							proxy: false,
							noProxy: false
						});
						else setFailed(true);
					} catch {
						setFailed(true);
					} finally {
						setSaving(false);
					}
				};
				const inputStyle = {
					width: "100%",
					boxSizing: "border-box",
					border: `1px solid ${colors.border}`,
					borderRadius: 5,
					background: colors.raised,
					color: colors.text,
					padding: "7px 9px",
					fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
					fontSize: 11
				};
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
							children: t("title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								display: "block",
								color: colors.muted,
								fontSize: 11,
								marginTop: 4
							},
							children: t("description")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							borderTop: `1px solid ${colors.border}`,
							padding: "12px 14px 14px",
							display: "grid",
							gap: 12
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: {
									display: "grid",
									gap: 5,
									color: colors.text,
									fontSize: 11
								},
								children: [
									t("proxy"),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										"aria-label": t("proxy"),
										value: proxy,
										disabled: !snapshot.writable || saving,
										placeholder: "http://127.0.0.1:10808",
										onChange: (event) => {
											setProxy(event.target.value);
											setDirtyFields((current) => ({
												...current,
												proxy: true
											}));
											setFailed(false);
										},
										style: inputStyle
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											color: colors.muted,
											fontSize: 10
										},
										children: t("proxyHint")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: {
									display: "grid",
									gap: 5,
									color: colors.text,
									fontSize: 11
								},
								children: [
									t("noProxy"),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										"aria-label": t("noProxy"),
										value: noProxy,
										rows: 3,
										disabled: !snapshot.writable || saving,
										onChange: (event) => {
											setNoProxy(event.target.value);
											setDirtyFields((current) => ({
												...current,
												noProxy: true
											}));
											setFailed(false);
										},
										style: {
											...inputStyle,
											resize: "vertical"
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											color: colors.muted,
											fontSize: 10
										},
										children: t("noProxyHint")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									color: colors.cyan,
									fontSize: 10
								},
								children: t("endpoint")
							}),
							!snapshot.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									color: colors.danger,
									fontSize: 10
								},
								children: t("unavailable")
							}),
							failed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									color: colors.danger,
									fontSize: 10
								},
								children: t("failed")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									justifyContent: "flex-end",
									gap: 8
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: !dirty || saving,
									onClick: discard,
									style: {
										padding: "6px 10px",
										borderRadius: 5,
										border: `1px solid ${colors.border}`,
										background: colors.raised,
										color: colors.text
									},
									children: t("discard")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: !snapshot.writable || !dirty || saving,
									onClick: () => {
										save();
									},
									style: {
										padding: "6px 10px",
										borderRadius: 5,
										border: `1px solid ${colors.cyan}`,
										background: colors.cyan,
										color: "#071015"
									},
									children: saving ? t("saving") : t("save")
								})]
							})
						]
					})]
				});
			};
		}
		const inject = [
			"slots",
			"locale",
			"settingsScope"
		];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "model-proxy: dictionaries");
			const card = createModelProxyCard(ctx.settingsScope.bind({ namespace: NS }));
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: NS,
				locale: NS
			}, card));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
