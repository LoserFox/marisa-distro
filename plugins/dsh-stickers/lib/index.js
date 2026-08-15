import { createReadStream } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineTool } from "@deepseek-ai/dsh-tools";
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
function stickerVariantFile(file, variant = "blue") {
	return variant === "black" ? `black/${file}` : file;
}
function stickerById(id) {
	return STICKERS.find((sticker) => sticker.id === id);
}
function publicStickerById(id) {
	const sticker = stickerById(id);
	return sticker?.visibility === "public" ? sticker : void 0;
}
//#endregion
//#region src/index.ts
const name = "@dsh-external/dsh-stickers";
const inject = [
	"tools",
	"systemPrompt",
	"commands"
];
const API_ROOT = "/api/dsh-stickers";
const stickerRoot = fileURLToPath(new URL("../assets/stickers/", import.meta.url));
async function send(id, agent, allowHidden, variant = "blue") {
	const sticker = allowHidden ? stickerById(id) : publicStickerById(id);
	if (sticker === void 0) throw new Error(`表情不存在或不可由用户发送：${id}`);
	return {
		ok: true,
		id: sticker.id,
		text: sticker.text,
		variant,
		image: `${API_ROOT}/${stickerVariantFile(sticker.file, variant)}`,
		sender: agent === void 0 ? "user" : "agent"
	};
}
function apply(ctx) {
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "send_sticker",
		description: "Send one reaction sticker when it naturally adds tone. Some hidden stickers are agent-only easter eggs.",
		parameters: {
			id: {
				type: "string",
				required: true,
				enum: STICKERS.map((sticker) => sticker.id),
				description: "Sticker id."
			},
			variant: {
				type: "string",
				enum: [...STICKER_VARIANTS],
				description: "Character variant: blue (default) or black whale girl."
			}
		},
		output: {
			schema: {
				type: "object",
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					id: {
						type: "string",
						required: true
					},
					text: {
						type: "string",
						required: true
					},
					variant: {
						type: "string",
						required: true
					},
					image: {
						type: "string",
						required: true
					},
					sender: {
						type: "string",
						required: true
					}
				},
				additionalProperties: false
			},
			render: (_args, value) => [{
				type: "text",
				text: `🐋 ${String(value.text ?? "")}`
			}]
		},
		presentCall: (args) => ({
			card: "generic",
			title: `发送表情 · ${stickerById(String(args.id))?.text ?? "DSH 表情"}`
		}),
		presentResult: (_args, result) => ({
			card: "generic",
			content: result.content
		}),
		execute: async ({ id, variant }, exec) => {
			const requested = variant === void 0 ? "blue" : String(variant);
			if (!isStickerVariant(requested)) throw new Error(`未知的表情角色：${requested}`);
			return send(String(id), exec.agent, true, requested);
		}
	})), "dsh-stickers: agent tool");
	ctx.effect(() => ctx.commands.register({
		name: "sticker",
		description: "发送一个 DSH 表情（/sticker <id> [black]）",
		input: { hint: `<${PUBLIC_STICKERS.map((sticker) => sticker.id).join("|")}> [black]` },
		handler: async ({ rawInput }) => {
			const [id = "", requested = "blue"] = rawInput.trim().split(/\s+/u);
			if (!isStickerVariant(requested)) return {
				kind: "error",
				text: `未知的表情角色：${requested}`
			};
			try {
				return {
					kind: "success",
					text: `🐋 ${(await send(id, void 0, false, requested)).text}`
				};
			} catch (error) {
				return {
					kind: "error",
					text: error instanceof Error ? error.message : String(error)
				};
			}
		}
	}), "dsh-stickers: slash command");
	ctx.effect(() => ctx.systemPrompt.section({
		name: "dsh-stickers:guidance",
		order: 175,
		text: `You can send reaction stickers with send_sticker. Use at most one per turn, only when it naturally adds tone, and never instead of a substantive answer. Every sticker has two character variants: blue (default) and black; pass variant: 'black' to match the user's current choice if they switched. Available stickers:\n${STICKERS.map((sticker) => `- ${sticker.id}: ${sticker.text}`).join("\n")}`
	}), "dsh-stickers: guidance");
	ctx.inject(["webServer"], (scope) => {
		scope.effect(() => scope.webServer.register({
			kind: "prefix",
			path: API_ROOT,
			handler: (request, response) => {
				const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
				const relative = decodeURIComponent(pathname.slice(18));
				const variantDirectory = relative.startsWith("black/") ? "black" : void 0;
				const file = basename(variantDirectory === void 0 ? relative : relative.slice(6));
				const path = variantDirectory === void 0 ? join(stickerRoot, file) : join(stickerRoot, variantDirectory, file);
				if (extname(file) !== ".png" || stickerById(file.replace(/^\d+-|\.png$/gu, "")) === void 0) {
					response.writeHead(404);
					response.end("not found");
					return;
				}
				response.writeHead(200, {
					"content-type": "image/png",
					"cache-control": "public, max-age=86400"
				});
				createReadStream(path).pipe(response);
			}
		}), "dsh-stickers: image route");
	});
}
//#endregion
export { apply, inject, name };
