//#region lib/types/index.js
/** Plugin name (= the config entry id). */
const name = "dsh-web-ui-notify";
/** Required services: the host web server (same-origin route). */
const inject = ["webServer"];
/** 同源路由：浏览器半在 Wails 壳内把通知意图 POST 到这里。 */
const TOAST_ROUTE = "/plugins/dsh-web-ui-approval-notify/toast";
const MAX_BODY_BYTES = 4096;
/** 桌面壳回环桥地址（MARISA_TOAST_PORT 由壳注入）；未设置/非法时返回 null。 */
function toastEndpoint(env = process.env) {
	const port = env.MARISA_TOAST_PORT;
	if (port === void 0 || !/^\d{1,5}$/.test(port)) return null;
	return `http://127.0.0.1:${port}/toast`;
}
function sendJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(body));
}
async function readToastIntent(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > MAX_BODY_BYTES) throw new Error("request body too large");
		chunks.push(buffer);
	}
	const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (typeof parsed !== "object" || parsed === null) throw new Error("request body must be a JSON object");
	const title = parsed.title;
	if (typeof title !== "string" || title === "") throw new Error("title must be a non-empty string");
	const body = parsed.body;
	const sessionId = parsed.sessionId;
	return {
		title,
		body: typeof body === "string" ? body : "",
		sessionId: typeof sessionId === "string" && sessionId !== "" ? sessionId : void 0
	};
}
/** 注册 toast 转发路由。env 参数供测试注入（真实运行默认读进程环境）。 */
function registerToastRoute(ctx, env = process.env) {
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: TOAST_ROUTE,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, { message: "method not allowed" });
				return;
			}
			const endpoint = toastEndpoint(env);
			if (endpoint === null) {
				sendJson(res, 503, { message: "desktop toast bridge unavailable (MARISA_TOAST_PORT unset)" });
				return;
			}
			let intent;
			try {
				intent = await readToastIntent(req);
			} catch (error) {
				sendJson(res, 400, { message: error instanceof Error ? error.message : String(error) });
				return;
			}
			try {
				const upstream = await fetch(endpoint, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						title: intent.title,
						body: intent.body,
						sessionId: intent.sessionId
					})
				});
				if (!upstream.ok) {
					sendJson(res, 502, { message: `toast bridge responded ${upstream.status}` });
					return;
				}
				res.writeHead(204);
				res.end();
			} catch (error) {
				sendJson(res, 502, { message: error instanceof Error ? error.message : String(error) });
			}
		}
	}), "web-ui-notify: toast route");
}
/** Host plugin body: mount the toast-forwarding route. */
function apply(ctx) {
	registerToastRoute(ctx);
}
//#endregion
export { TOAST_ROUTE, apply, inject, name, registerToastRoute, toastEndpoint };
