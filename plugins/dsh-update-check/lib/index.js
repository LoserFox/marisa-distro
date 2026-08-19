import z from "@deepseek-ai/schemastery";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { EnvHttpProxyAgent } from "undici";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
/** changelog 上界：state 路由每次请求都携带 body，避免无界负载。 */
const MAX_BODY_CHARS = 4096;
/** 列表端点取前 5 条即可覆盖最新发布（/releases/latest 会跳过 prerelease，Marisa v0.x 全为预发布）。 */
const RELEASES_PER_PAGE = 5;
const FETCH_TIMEOUT_MS = 15e3;
/** 取第一个非 draft 的 Release（prerelease 保留——Marisa v0.x 全标预发布）。 */
function firstNonDraft(releases) {
	return releases.find((release) => !release.draft);
}
/** 三个候选链接（缺资产为 null）。 */
function assetUrlsOf(release) {
	if (release === void 0) return {
		msi: null,
		standalone: null,
		releasePage: null,
		download: null
	};
	return {
		msi: release.assets.find((asset) => asset.name === "Marisa-DSH-windows-x64.msi")?.browserDownloadUrl ?? null,
		standalone: release.assets.find((asset) => asset.name === "Marisa-DSH-windows-x64-standalone.exe")?.browserDownloadUrl ?? null,
		releasePage: release.htmlUrl,
		download: null
	};
}
/** 按安装形态选主下载链接：msi→MSI 资产、standalone→EXE 资产、dev/未知→Release 页；找不到对应资产时回退 Release 页。 */
function selectDownload(assets, installForm) {
	if (installForm === "msi") return assets.msi ?? assets.releasePage;
	if (installForm === "standalone") return assets.standalone ?? assets.releasePage;
	return assets.releasePage;
}
/** 宽容解析 GitHub /releases 列表响应：跳过垃圾条目，字段缺失取默认值。 */
function parseReleases(payload) {
	if (!Array.isArray(payload)) return [];
	const releases = [];
	for (const item of payload) {
		if (typeof item !== "object" || item === null) continue;
		const record = item;
		if (typeof record.tag_name !== "string") continue;
		releases.push({
			tagName: record.tag_name,
			draft: record.draft === true,
			prerelease: record.prerelease === true,
			body: typeof record.body === "string" ? record.body.slice(0, MAX_BODY_CHARS) : "",
			htmlUrl: typeof record.html_url === "string" ? record.html_url : "",
			assets: Array.isArray(record.assets) ? record.assets.flatMap((asset) => {
				if (typeof asset !== "object" || asset === null) return [];
				const a = asset;
				return typeof a.name === "string" && typeof a.browser_download_url === "string" ? [{
					name: a.name,
					browserDownloadUrl: a.browser_download_url
				}] : [];
			}) : []
		});
	}
	return releases;
}
/** GET {apiBase}/repos/{repo}/releases?per_page=5，非 2xx 抛错。 */
async function fetchReleases(options) {
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const url = `${options.apiBase}/repos/${options.repo}/releases?per_page=${RELEASES_PER_PAGE}`;
	const init = {
		headers: {
			accept: "application/vnd.github+json",
			"user-agent": "marisa-update-check/0.1",
			"x-github-api-version": "2022-11-28"
		},
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	};
	if (options.dispatcher !== void 0) init.dispatcher = options.dispatcher;
	const response = await fetchImpl(url, init);
	if (!response.ok) throw new Error(`GitHub releases API responded ${response.status} for ${options.repo}`);
	return parseReleases(await response.json());
}
//#endregion
//#region src/proxy.ts
/** fetch dispatcher 选择：存在代理环境变量时用 undici EnvHttpProxyAgent。 */
/** 触发代理的键（大小写两套都认）。EnvHttpProxyAgent 自身还会读 NO_PROXY 做直连豁免。 */
const PROXY_ENV_KEYS = [
	"HTTPS_PROXY",
	"HTTP_PROXY",
	"ALL_PROXY",
	"https_proxy",
	"http_proxy",
	"all_proxy"
];
/**
* 任一代理环境变量非空时返回 EnvHttpProxyAgent（它按进程环境解析代理与
* NO_PROXY），否则返回 undefined（走直连）。代理配置只来自继承的环境，
* 与 harness 的代理策略一致。
*/
function proxyAgentForEnv(env = process.env) {
	return PROXY_ENV_KEYS.some((key) => {
		const value = env[key];
		return value !== void 0 && value !== "";
	}) ? new EnvHttpProxyAgent() : void 0;
}
//#endregion
//#region src/semver.ts
/** 版本号语义化比较：Release tag（v0.1.6）与 bundle VERSION（0.1.6）两侧归一化。 */
/** 去掉前导 v/V 与空白，得到纯 semver 串。 */
function normalizeVersion(value) {
	const trimmed = value.trim();
	return trimmed.startsWith("v") || trimmed.startsWith("V") ? trimmed.slice(1) : trimmed;
}
const VERSION_PATTERN = /^[0-9]+(?:\.[0-9]+)*(?:-[0-9A-Za-z.-]+)?$/;
function parseVersion(value) {
	const normalized = normalizeVersion(value);
	if (!VERSION_PATTERN.test(normalized)) return null;
	const [main = "", prePart = ""] = normalized.split("-", 2);
	return {
		parts: main.split(".").map((part) => Number(part)),
		pre: prePart === "" ? [] : prePart.split(".")
	};
}
/**
* 比较两个版本串：a < b 返回负数、相等 0、a > b 正数。
* 主版本逐段数值比较，缺失段按 0；主版本相等时按 semver 规则比较
* prerelease 后缀（无后缀 > 有后缀；数字标识 < 字母标识）。
* 非 semver 输入按归一化后的字符串序降级比较，不抛错。
*/
function compareVersions(a, b) {
	const pa = parseVersion(a);
	const pb = parseVersion(b);
	if (pa === null || pb === null) {
		const na = normalizeVersion(a);
		const nb = normalizeVersion(b);
		return na < nb ? -1 : na > nb ? 1 : 0;
	}
	const len = Math.max(pa.parts.length, pb.parts.length);
	for (let i = 0; i < len; i++) {
		const x = pa.parts[i] ?? 0;
		const y = pb.parts[i] ?? 0;
		if (x !== y) return x < y ? -1 : 1;
	}
	if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
	if (pa.pre.length === 0) return 1;
	if (pb.pre.length === 0) return -1;
	const preLen = Math.max(pa.pre.length, pb.pre.length);
	for (let i = 0; i < preLen; i++) {
		const x = pa.pre[i];
		const y = pb.pre[i];
		if (x === void 0) return -1;
		if (y === void 0) return 1;
		const xNumeric = /^\d+$/.test(x);
		const yNumeric = /^\d+$/.test(y);
		if (xNumeric && yNumeric) {
			const xi = Number(x);
			const yi = Number(y);
			if (xi !== yi) return xi < yi ? -1 : 1;
		} else if (xNumeric) return -1;
		else if (yNumeric) return 1;
		else if (x !== y) return x < y ? -1 : 1;
	}
	return 0;
}
/** latest 比 current 新（v 前缀两侧归一化）。 */
function hasUpdate(current, latest) {
	return compareVersions(latest, current) > 0;
}
//#endregion
//#region src/state.ts
/** $DSH_HOME/update-check/state.json 的读写与缓存窗口判定。 */
const EMPTY_UPDATE_CHECK_STATE = {
	lastCheckAt: null,
	latest: null,
	dismissedVersion: null,
	changelog: "",
	assets: {
		msi: null,
		standalone: null,
		releasePage: null
	}
};
/** 读 state.json；文件缺失或损坏都按空状态处理（检查结果可从 GitHub 重新获得）。 */
async function readState(path) {
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return EMPTY_UPDATE_CHECK_STATE;
		return EMPTY_UPDATE_CHECK_STATE;
	}
	try {
		const parsed = JSON.parse(raw);
		const stringOrNull = (key) => typeof parsed[key] === "string" ? parsed[key] : null;
		const parsedAssets = parsed.assets;
		const assets = typeof parsedAssets === "object" && parsedAssets !== null ? parsedAssets : {};
		const linkOrNull = (key) => typeof assets[key] === "string" ? assets[key] : null;
		return {
			lastCheckAt: stringOrNull("lastCheckAt"),
			latest: stringOrNull("latest"),
			dismissedVersion: stringOrNull("dismissedVersion"),
			changelog: stringOrNull("changelog") ?? "",
			assets: {
				msi: linkOrNull("msi"),
				standalone: linkOrNull("standalone"),
				releasePage: linkOrNull("releasePage")
			}
		};
	} catch {
		return EMPTY_UPDATE_CHECK_STATE;
	}
}
/** 原子写 state.json：先写同目录临时文件再改名，崩溃不会留下半截文件。 */
async function writeState(path, state) {
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
	await rename(tmp, path);
}
/** 上次检查的 epoch 毫秒（无记录或解析失败为 null）。 */
function lastCheckMs(state) {
	if (state.lastCheckAt === null) return null;
	const ms = Date.parse(state.lastCheckAt);
	return Number.isNaN(ms) ? null : ms;
}
/** 距上次检查是否不足 windowMs（手动检查的缓存窗口）。 */
function withinCacheWindow(state, nowMs, windowMs) {
	const last = lastCheckMs(state);
	return last !== null && nowMs - last < windowMs;
}
/** 空负载：dev 形态（currentVersion 为空）时 state/dismiss 不碰磁盘、不发请求。 */
const HIDDEN_PAYLOAD = {
	currentVersion: "",
	latest: null,
	hasUpdate: false,
	changelog: "",
	assets: {
		msi: null,
		standalone: null,
		releasePage: null,
		download: null
	},
	lastCheckAt: null,
	autoCheck: true,
	dismissedVersion: null
};
var UpdateChecker = class {
	deps;
	cached = null;
	constructor(deps) {
		this.deps = deps;
	}
	async ensureLoaded() {
		if (this.cached === null) this.cached = await readState(this.deps.statePath);
		return this.cached;
	}
	/**
	* 执行一次检查：拉取 Releases → 取第一个非 draft → 更新缓存（含 changelog
	* 与资产 URL，重启后横幅/卡片不丢失下载面）。网络失败向上抛给调用方
	* （定时任务记日志、手动路由回 502、横幅静默）。
	*/
	async check() {
		if (this.deps.currentVersion === "") return {
			checked: false,
			state: HIDDEN_PAYLOAD
		};
		const current = await this.ensureLoaded();
		const release = firstNonDraft(await fetchReleases({
			apiBase: this.deps.apiBase,
			repo: this.deps.repo,
			dispatcher: proxyAgentForEnv(this.deps.env),
			...this.deps.fetchImpl === void 0 ? {} : { fetchImpl: this.deps.fetchImpl }
		}));
		const urls = assetUrlsOf(release);
		const next = {
			lastCheckAt: new Date((this.deps.now ?? Date.now)()).toISOString(),
			latest: release === void 0 ? null : normalizeVersion(release.tagName),
			dismissedVersion: current.dismissedVersion,
			changelog: release?.body ?? "",
			assets: {
				msi: urls.msi,
				standalone: urls.standalone,
				releasePage: urls.releasePage
			}
		};
		this.cached = next;
		await writeState(this.deps.statePath, next);
		return {
			checked: true,
			state: this.buildPayload(next)
		};
	}
	/** 只读负载：从缓存构建，不发网络请求。 */
	async payload() {
		if (this.deps.currentVersion === "") return HIDDEN_PAYLOAD;
		return this.buildPayload(await this.ensureLoaded());
	}
	/** 记录已忽略版本（同版本重复忽略幂等）。 */
	async dismiss(version) {
		if (this.deps.currentVersion === "") return;
		const next = {
			...await this.ensureLoaded(),
			dismissedVersion: version
		};
		this.cached = next;
		await writeState(this.deps.statePath, next);
	}
	/** 距上次检查是否不足 windowMs（手动检查缓存窗口判定）。 */
	async lastCheckWithin(nowMs, windowMs) {
		if (this.deps.currentVersion === "") return false;
		return withinCacheWindow(await this.ensureLoaded(), nowMs, windowMs);
	}
	buildPayload(state) {
		const currentVersion = this.deps.currentVersion;
		const latest = state.latest;
		return {
			currentVersion,
			latest,
			hasUpdate: latest !== null && currentVersion !== "" && hasUpdate(currentVersion, latest),
			changelog: state.changelog,
			assets: {
				msi: state.assets.msi,
				standalone: state.assets.standalone,
				releasePage: state.assets.releasePage,
				download: selectDownload(state.assets, this.deps.installForm)
			},
			lastCheckAt: state.lastCheckAt,
			autoCheck: this.deps.readAutoCheck?.() ?? true,
			dismissedVersion: state.dismissedVersion
		};
	}
};
//#endregion
//#region src/env.ts
/** 读取壳注入的环境；缺省时从 process.env 读取。 */
function readBackendEnv(env = process.env) {
	const installForm = env.MARISA_INSTALL_FORM ?? "";
	return {
		installForm: installForm === "msi" || installForm === "standalone" || installForm === "dev" ? installForm : "",
		version: env.MARISA_VERSION ?? ""
	};
}
//#endregion
//#region src/protocol.ts
/** Host 路由与负载类型（host 与 client 共享）。 */
/** 同源路由：host 经 ctx.webServer 注册，client 直接相对路径 fetch。 */
const STATE_ROUTE = "/plugins/dsh-update-check/state";
const CHECK_ROUTE = "/plugins/dsh-update-check/check";
const DISMISS_ROUTE = "/plugins/dsh-update-check/dismiss";
const SETTINGS_ROUTE = "/plugins/dsh-update-check/settings";
//#endregion
//#region src/routes.ts
const MAX_BODY_BYTES = 4096;
function sendJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(body));
}
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > MAX_BODY_BYTES) throw new Error("request body too large");
		chunks.push(buffer);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
/**
* 注册四个同源路由。手动检查与定时检查共用 30s 缓存窗口：GitHub 未认证
* 限流 60 次/时/IP，不能让客户端重试循环烧掉配额。窗口内返回 429（而非
* 静默返回缓存）——客户端能明确提示"检查太频繁"，且 429 语义即"稍后再试"。
*/
function registerRoutes(ctx, services) {
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: STATE_ROUTE,
		handler: async (req, res) => {
			if (req.method !== "GET") {
				sendJson(res, 405, { message: "method not allowed" });
				return;
			}
			sendJson(res, 200, await services.checker.payload());
		}
	}), "update-check: state route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: CHECK_ROUTE,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, { message: "method not allowed" });
				return;
			}
			if (await services.checker.lastCheckWithin(Date.now(), 3e4)) {
				sendJson(res, 429, { message: "check window: retry later" });
				return;
			}
			try {
				const outcome = await services.checker.check();
				sendJson(res, outcome.checked ? 200 : 400, outcome.state);
			} catch (error) {
				sendJson(res, 502, { message: error instanceof Error ? error.message : String(error) });
			}
		}
	}), "update-check: check route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: DISMISS_ROUTE,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, { message: "method not allowed" });
				return;
			}
			let body;
			try {
				body = await readJsonBody(req);
			} catch (error) {
				sendJson(res, 400, { message: error instanceof Error ? error.message : String(error) });
				return;
			}
			const version = typeof body === "object" && body !== null ? body.version : void 0;
			if (typeof version !== "string" || version === "") {
				sendJson(res, 400, { message: "version must be a non-empty string" });
				return;
			}
			await services.checker.dismiss(version);
			sendJson(res, 200, { ok: true });
		}
	}), "update-check: dismiss route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: SETTINGS_ROUTE,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, { message: "method not allowed" });
				return;
			}
			let body;
			try {
				body = await readJsonBody(req);
			} catch (error) {
				sendJson(res, 400, { message: error instanceof Error ? error.message : String(error) });
				return;
			}
			const autoCheck = typeof body === "object" && body !== null ? body.autoCheck : void 0;
			if (typeof autoCheck !== "boolean") {
				sendJson(res, 400, { message: "autoCheck must be a boolean" });
				return;
			}
			try {
				await services.updateAutoCheck(autoCheck);
			} catch (error) {
				sendJson(res, 500, { message: error instanceof Error ? error.message : String(error) });
				return;
			}
			sendJson(res, 200, { autoCheck });
		}
	}), "update-check: settings route");
}
//#endregion
//#region src/index.ts
/** 稳定插件名（与 manifest 行 name 一致，经 profile node_modules 解析）。 */
const name = "@omdsh-dev/dsh-update-check";
const inject = ["webServer"];
const Config = z.object({
	repo: z.string().default("omdsh-dev/marisa-distro").description("GitHub repository to watch (owner/repo)"),
	apiBase: z.string().default("https://api.github.com").description("GitHub API base URL"),
	checkIntervalHours: z.number().min(1).max(720).default(24).description("Periodic check interval in hours"),
	autoCheck: z.boolean().default(true).description("Check for updates automatically")
});
/** 启动后首次检查的延迟：给后端与路由留出就绪时间，避开启动高峰。 */
const FIRST_CHECK_DELAY_MS = 3e4;
/** 本插件拥有的 settings namespace（卡片按此 key 渲染）。 */
const UPDATE_CHECK_NS = settingsNamespace("update-check");
function apply(ctx, config) {
	const entry = {
		repo: "omdsh-dev/marisa-distro",
		apiBase: "https://api.github.com",
		checkIntervalHours: 24,
		autoCheck: true,
		...config
	};
	const env = readBackendEnv();
	const checker = new UpdateChecker({
		repo: entry.repo,
		apiBase: entry.apiBase,
		statePath: dshHomePath("update-check", "state.json"),
		currentVersion: env.version,
		installForm: env.installForm,
		readAutoCheck: () => source().autoCheck
	});
	let source = () => entry;
	let interval;
	const stopInterval = () => {
		if (interval !== void 0) clearInterval(interval);
		interval = void 0;
	};
	const rearm = () => {
		stopInterval();
		if (!source().autoCheck) return;
		interval = setInterval(() => {
			checker.check().catch((error) => {
				ctx.logger.warn(`update-check: periodic check failed: ${error instanceof Error ? error.message : String(error)}`);
			});
		}, source().checkIntervalHours * 36e5);
	};
	installSettingsSection(ctx, UPDATE_CHECK_NS, Config, entry, {
		setSource: (next) => {
			source = next;
		},
		onChange: rearm
	});
	registerRoutes({
		webServer: ctx.webServer,
		effect: (disposer, label) => ctx.effect(disposer, label)
	}, {
		checker,
		updateAutoCheck: async (autoCheck) => {
			const settings = ctx.get("settings");
			if (settings === void 0) throw new Error("settings service is unavailable");
			settings.update(UPDATE_CHECK_NS, { autoCheck });
		}
	});
	let firstCheck;
	if (env.version === "") ctx.logger.warn("update-check: MARISA_VERSION is empty — update checking disabled (dev build)");
	else {
		ctx.logger.info(`update-check: watching ${entry.repo}, current version ${env.version} (install form ${env.installForm || "unknown"})`);
		firstCheck = setTimeout(() => {
			checker.check().catch((error) => {
				ctx.logger.warn(`update-check: first check failed: ${error instanceof Error ? error.message : String(error)}`);
			});
			rearm();
		}, FIRST_CHECK_DELAY_MS);
	}
	ctx.effect(() => () => {
		if (firstCheck !== void 0) clearTimeout(firstCheck);
		stopInterval();
	}, "update-check: check schedule");
}
//#endregion
export { Config, FIRST_CHECK_DELAY_MS, UPDATE_CHECK_NS, apply, inject, name };
