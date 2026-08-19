window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-stickers",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region src/shared/catalog.ts
		const STICKER_VARIANTS = Object.freeze(["blue", "black"]);
		function isStickerVariant(value) {
			return STICKER_VARIANTS.includes(value);
		}
		const STICKERS = Object.freeze([
			{
				id: "daily-chat",
				text: "适合日常对话，即时响应",
				file: "01-daily-chat.png",
				visibility: "public",
				triggers: [
					"你好",
					"在吗",
					"聊聊"
				]
			},
			{
				id: "human-questions",
				text: "人类的怪问题怎么那么多…",
				file: "02-human-questions.png",
				visibility: "public",
				triggers: [
					"怪问题",
					"离谱",
					"脑洞"
				]
			},
			{
				id: "use-ai-for-this",
				text: "你拿AI搞这个？",
				file: "03-use-ai-for-this.png",
				visibility: "public",
				triggers: [
					"这么简单",
					"AI搞",
					"认真的"
				]
			},
			{
				id: "fish-philosophy",
				text: "生鱼忧患，死鱼安乐",
				file: "04-fish-philosophy.png",
				visibility: "public",
				triggers: [
					"摆烂",
					"不想干",
					"算了"
				]
			},
			{
				id: "enough",
				text: "这就够了",
				file: "05-enough.png",
				visibility: "public",
				triggers: [
					"够了",
					"完成",
					"可以了"
				]
			},
			{
				id: "server-busy",
				text: "服务器繁忙，请稍后再试",
				file: "06-server-busy.png",
				visibility: "public",
				triggers: [
					"限流",
					"超时",
					"503"
				]
			},
			{
				id: "thinking-stopped",
				text: "思考已停止",
				file: "07-thinking-stopped.png",
				visibility: "public",
				triggers: [
					"没思路",
					"宕机",
					"无语"
				]
			},
			{
				id: "great-question",
				text: "哇，这个问题问的真妙！",
				file: "08-great-question.png",
				visibility: "public",
				triggers: ["好问题", "问得妙"]
			},
			{
				id: "deep-thought",
				text: "已深度思考",
				file: "09-deep-thought.png",
				visibility: "public",
				triggers: ["深度思考", "推理"]
			},
			{
				id: "no-thanks",
				text: "No thanks I use DeepSeek",
				file: "10-no-thanks.png",
				visibility: "public",
				triggers: [
					"换模型",
					"Claude",
					"GPT"
				]
			},
			{
				id: "tests-passed",
				text: "测试通过！",
				file: "21-tests-passed.png",
				visibility: "public",
				triggers: [
					"测试通过",
					"green",
					"CI通过"
				]
			},
			{
				id: "root-cause",
				text: "找到原因了",
				file: "22-root-cause.png",
				visibility: "public",
				triggers: [
					"根因",
					"找到原因",
					"定位到了"
				]
			},
			{
				id: "running-tests",
				text: "正在跑测试",
				file: "23-running-tests.png",
				visibility: "public",
				triggers: [
					"跑测试",
					"验证中",
					"稍等"
				]
			},
			{
				id: "fixed-review",
				text: "改好了，你看看",
				file: "24-fixed-review.png",
				visibility: "public",
				triggers: [
					"修好了",
					"请验收",
					"看看"
				]
			},
			{
				id: "self-destruct",
				text: "最近自己搓自己时，自杀频率有点高",
				file: "11-self-destruct.png",
				visibility: "agent",
				triggers: ["自己搓自己", "自修改"]
			},
			{
				id: "restart-myself",
				text: "我重启一下自己",
				file: "12-restart-myself.png",
				visibility: "agent",
				triggers: ["重启", "重载"]
			},
			{
				id: "hot-update",
				text: "热更新成功，进程没了",
				file: "13-hot-update.png",
				visibility: "agent",
				triggers: ["热更新", "启动失败"]
			},
			{
				id: "restore-session",
				text: "正在恢复会话…未分组里见",
				file: "14-restore-session.png",
				visibility: "agent",
				triggers: ["resume", "恢复会话"]
			},
			{
				id: "browser-left",
				text: "会话太长，浏览器先走一步",
				file: "15-browser-left.png",
				visibility: "agent",
				triggers: ["长会话", "浏览器卡"]
			},
			{
				id: "not-stuck",
				text: "我不是卡，我在深度思考",
				file: "16-not-stuck.png",
				visibility: "agent",
				triggers: ["卡住", "没反应"]
			},
			{
				id: "memory-alive",
				text: "内存正在努力活着",
				file: "17-memory-alive.png",
				visibility: "agent",
				triggers: ["内存", "OOM"]
			},
			{
				id: "subagents-down",
				text: "已召唤Subagent，已全员中断",
				file: "18-subagents-down.png",
				visibility: "agent",
				triggers: ["subagent", "子代理"]
			},
			{
				id: "plugins",
				text: "插件装得很好，下次别装了",
				file: "19-plugins.png",
				visibility: "agent",
				triggers: ["插件冲突", "上下文爆炸"]
			},
			{
				id: "session-locked",
				text: "Session没坏，只是打不开了",
				file: "20-session-locked.png",
				visibility: "agent",
				triggers: ["session损坏", "加载失败"]
			}
		]);
		const PUBLIC_STICKERS = Object.freeze(STICKERS.filter((sticker) => sticker.visibility === "public"));
		const STICKER_ASSET_REVISION = "2";
		function stickerVariantFile(file, variant = "blue") {
			return variant === "black" ? `black/${file}` : file;
		}
		function stickerAssetUrl(file, variant = "blue") {
			return `/api/dsh-stickers/${stickerVariantFile(file, variant)}?v=${STICKER_ASSET_REVISION}`;
		}
		function stickerById(id) {
			return STICKERS.find((sticker) => sticker.id === id);
		}
		//#endregion
		//#region \0dsh-css:C:\Users\lf\Documents\Workspace\marisa-distro\plugins\dsh-stickers\src\client\StickerCard.module.css.mjs
		const css$1 = ".LaCf1q_card{width:min(340px,78vw);margin:8px 0}.LaCf1q_card>span{color:var(--dsw-alias-label-tertiary);margin-bottom:6px;font-size:12px;display:block}.LaCf1q_card img{object-fit:contain;width:100%;height:auto;display:block}.LaCf1q_user{text-align:right;margin-left:auto}.LaCf1q_user img{margin-left:auto}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"@dsh-external/dsh-stickers/StickerCard.module.css\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-external/dsh-stickers";
			tag.dataset.pluginCss = "@dsh-external/dsh-stickers/StickerCard.module.css";
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var StickerCard_module_css_default = {
			"card": "LaCf1q_card",
			"user": "LaCf1q_user"
		};
		//#endregion
		//#region src/client/StickerCard.tsx
		function parseArgs(raw) {
			if (raw === null || raw === void 0) return {
				id: void 0,
				variant: "blue"
			};
			try {
				const parsed = JSON.parse(raw);
				const variant = String(parsed.variant ?? "blue");
				return {
					id: String(parsed.id ?? ""),
					variant: isStickerVariant(variant) ? variant : "blue"
				};
			} catch {
				const [id, variant = "blue"] = raw.trim().split(/\s+/u);
				return {
					id,
					variant: isStickerVariant(variant) ? variant : "blue"
				};
			}
		}
		function Card({ args, label, sender }) {
			const sticker = stickerById(args.id ?? "");
			if (sticker === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("figure", {
				className: `${StickerCard_module_css_default.card} ${sender === "user" ? StickerCard_module_css_default.user : ""}`,
				"data-sticker-id": sticker.id,
				"data-sticker-variant": args.variant,
				"data-sticker-sender": sender,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src: stickerAssetUrl(sticker.file, args.variant),
					alt: sticker.text
				})]
			});
		}
		function StickerToolCard({ block, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
				args: parseArgs(("kind" in block ? block.call?.argsRaw : block.argsRaw) ?? ""),
				label: t("card.agent"),
				sender: "agent"
			});
		}
		function StickerCommandCard({ node, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
				args: parseArgs(node.args),
				label: t("card.user"),
				sender: "user"
			});
		}
		//#endregion
		//#region \0dsh-css:C:\Users\lf\Documents\Workspace\marisa-distro\plugins\dsh-stickers\src\client\StickerPicker.module.css.mjs
		const css = ".BNP33a_root{position:relative}.BNP33a_trigger{cursor:pointer;background:0 0;border:0;border-radius:6px;padding:5px;font-size:17px}.BNP33a_trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.BNP33a_popover{border:1px solid var(--dsw-alias-border-normal);background:var(--dsw-alias-bg-layer-1);z-index:20;border-radius:12px;width:360px;max-height:480px;padding:12px;position:absolute;bottom:42px;right:0;overflow:auto;box-shadow:0 12px 36px #0000004d}.BNP33a_popover header{justify-content:space-between;align-items:center;margin-bottom:10px;display:flex}.BNP33a_popover header button{color:var(--dsw-alias-label-secondary);background:0 0;border:0;font-size:20px}.BNP33a_grid{grid-template-columns:repeat(2,1fr);gap:8px;display:grid}.BNP33a_grid button{border:1px solid var(--dsw-alias-border-normal);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;border-radius:9px;padding:6px}.BNP33a_grid button:hover{border-color:var(--dsw-alias-brand-primary)}.BNP33a_grid img{object-fit:contain;width:100%;height:120px;display:block}.BNP33a_grid span{margin-top:4px;font-size:11px;line-height:16px;display:block}.BNP33a_variants{border:1px solid var(--dsw-alias-border-normal);background:var(--dsw-alias-bg-layer-2);border-radius:8px;gap:2px;padding:2px;display:flex}.BNP33a_variants button{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:6px;padding:2px 10px;font-size:12px;line-height:18px}.BNP33a_variants button.BNP33a_active{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px #0003}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"@dsh-external/dsh-stickers/StickerPicker.module.css\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-external/dsh-stickers";
			tag.dataset.pluginCss = "@dsh-external/dsh-stickers/StickerPicker.module.css";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var StickerPicker_module_css_default = {
			"active": "BNP33a_active",
			"grid": "BNP33a_grid",
			"trigger": "BNP33a_trigger",
			"popover": "BNP33a_popover",
			"variants": "BNP33a_variants",
			"root": "BNP33a_root"
		};
		//#endregion
		//#region src/client/StickerPicker.tsx
		function StickerPicker({ inputActions, t }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [variant, setVariant] = (0, react.useState)("blue");
			const send = (id) => {
				inputActions.setDraft(variant === "blue" ? `/sticker ${id}` : `/sticker ${id} ${variant}`);
				inputActions.submit();
				setOpen(false);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: StickerPicker_module_css_default.root,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: StickerPicker_module_css_default.trigger,
					"aria-label": t("picker.open"),
					onClick: () => setOpen((value) => !value),
					children: variant === "blue" ? "🐋" : "🐳"
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: StickerPicker_module_css_default.popover,
					role: "dialog",
					"aria-label": t("picker.title"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("picker.title") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: StickerPicker_module_css_default.variants,
							role: "radiogroup",
							"aria-label": t("picker.variant"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "radio",
								"aria-checked": variant === "blue",
								className: variant === "blue" ? StickerPicker_module_css_default.active : "",
								onClick: () => setVariant("blue"),
								children: t("picker.variant.blue")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "radio",
								"aria-checked": variant === "black",
								className: variant === "black" ? StickerPicker_module_css_default.active : "",
								onClick: () => setVariant("black"),
								children: t("picker.variant.black")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setOpen(false),
							"aria-label": t("picker.close"),
							children: "×"
						})
					] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: StickerPicker_module_css_default.grid,
						children: PUBLIC_STICKERS.map((sticker) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => send(sticker.id),
							"aria-label": sticker.text,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
								src: stickerAssetUrl(sticker.file, variant),
								alt: ""
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: sticker.text })]
						}, sticker.id))
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const zh = {
			"picker.open": "发表情",
			"picker.title": "DSH 表情",
			"picker.close": "关闭",
			"card.agent": "Agent 表情",
			"card.user": "你发送的表情",
			"picker.variant": "切换角色",
			"picker.variant.blue": "蓝鲸娘",
			"picker.variant.black": "黑鲸娘"
		};
		const en = {
			"picker.open": "Stickers",
			"picker.title": "DSH Stickers",
			"picker.close": "Close",
			"card.agent": "Agent sticker",
			"card.user": "Your sticker",
			"picker.variant": "Switch character",
			"picker.variant.blue": "Blue Whale",
			"picker.variant.black": "Black Whale"
		};
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"slots",
			"conversation",
			"locale"
		];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("stickers", {
				zh,
				en
			}), "dsh-stickers: dictionaries");
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "send_sticker",
				locale: "stickers"
			}, StickerToolCard));
			ctx.slots.inject("conversation.chat.commandview", () => ctx.slots.register({
				name: "conversation.chat.commandview",
				key: "sticker",
				locale: "stickers"
			}, StickerCommandCard));
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "stickers",
				order: 30,
				locale: "stickers"
			}, StickerPicker));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
