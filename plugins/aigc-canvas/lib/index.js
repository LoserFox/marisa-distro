import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, extname, isAbsolute, join, sep } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import z from "schemastery";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
//#region src/config.ts
/**
* Serializable configuration and defaults for the AIGC canvas host half.
* The `providers` array holds one or more AIGC provider configs (name /
* endpoint / apiKey / instructions), editable at runtime through the DSH
* GUI settings page; cordis.yml `config:` is the first-boot seed only.
*
* @module @huanlin/dsh-plugin-aigc-canvas/config
*/
/** Provider id pattern: lowercase letters, digits, hyphens; must start with a letter. */
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** Schemastery schema for one endpoint's response shape declaration. */
const ResponseSchema = z.object({
	kind: z.union([
		"b64_json_array",
		"b64_json_field",
		"binary",
		"url_field",
		"json_text"
	]).description("How host processes a successful response. b64_json_array = OpenAI image format {data:[{b64_json}]}; b64_json_field = single base64 string at response.path; binary = raw bytes (image/video/audio); url_field = {data:[{url}]} requiring a secondary GET; json_text = inline JSON/text body.").default("json_text"),
	path: z.string().description("Dotted + [index] path to the payload field (e.g. \"data[0].b64_json\", \"result.image\", \"choices[0].message.content\"). Required for b64_json_array / b64_json_field / url_field; ignored for binary and json_text.").default("")
});
/** Schemastery schema for one parameter. */
const ParamSchema = z.object({
	name: z.string().description("Parameter name (e.g. \"prompt\", \"size\", \"seed\").").default(""),
	type: z.union([
		"string",
		"number",
		"integer",
		"boolean",
		"array",
		"object",
		"image_ref",
		"video_ref",
		"audio_ref"
	]).description("JSON-like type. image_ref / video_ref / audio_ref = the param accepts a canvas element filePath (host expands to $base64).").default("string"),
	required: z.boolean().description("Whether the parameter is required.").default(false),
	default: z.any().description("Default value when omitted.").default(null),
	description: z.string().description("Short human-readable description.").default("")
});
/** Schemastery schema for one endpoint. */
const EndpointSchema = z.object({
	path: z.string().description("Request path relative to the provider endpoint, e.g. \"/v1/images/generations\".").default(""),
	method: z.union([
		"GET",
		"POST",
		"PUT",
		"PATCH"
	]).description("HTTP method.").default("POST"),
	capability: z.union([
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
	]).description("What this endpoint does. Drives the capabilityMap grouping in aigc_get_provider_info.").default("t2i"),
	params: z.array(ParamSchema).description("Parameter schema (documentation + future validation).").default([]),
	response: ResponseSchema.description("Response shape declaration.").default({
		kind: "json_text",
		path: ""
	}),
	acceptsCanvasRef: z.boolean().description("Whether the endpoint supports $base64 / $data_uri placeholders in the body.").default(false),
	notes: z.string().description("Short free-text notes (size constraints, gotchas).").default("")
});
/** Schemastery schema for the per-provider auth config. */
const ProviderAuthSchema = z.object({
	scheme: z.union([
		"bearer",
		"header",
		"query"
	]).description("How to attach the apiKey: bearer (Authorization: Bearer <key>), header (<name>: <key>), or query (<name>=<key>).").default("bearer"),
	name: z.string().description("Header name (scheme=header) or query param name (scheme=query). Ignored for bearer.").default("")
});
/** Schemastery schema for one provider. */
const ProviderSchema = z.object({
	id: z.string().description("Provider id (lowercase, hyphenated; used as the provider_id tool param).").default(""),
	name: z.string().description("Provider display name (e.g. \"Volcano Engine\", \"Jimeng\", \"MiniMax\").").default(""),
	endpoint: z.string().description("Provider API endpoint URL. Use \"stub://aigc-backend\" for the built-in stub.").default("stub://aigc-backend"),
	apiKey: z.string().description("Provider API key. Leave empty for the stub backend.").default(""),
	instructions: z.string().description("Free-form usage instructions for the agent (call aigc_get_provider_info to read). Auto-derived from endpoints when endpoints are set via aigc_provider_set_endpoints.").default(""),
	auth: ProviderAuthSchema.description("How the aigc_http_request tool attaches the apiKey.").default({
		scheme: "bearer",
		name: ""
	}),
	builtin: z.boolean().description("Whether this provider is a builtin seed (cordis.yml).").default(false),
	endpoints: z.array(EndpointSchema).description("Structured capability catalog. When non-empty, aigc_http_request uses the EndpointSpec.response.kind to process responses. Empty = legacy auto-sniff + instructions.").default([]),
	priority: z.number().step(1).description("Selection priority (smaller = higher priority; default 100). Drives capabilityMap ordering.").default(100),
	costPerCall: z.number().step(1e-4).description("Cost per call in USD (for cost tracking).").default(0),
	costPerKiloToken: z.number().step(1e-4).description("Cost per 1k tokens in USD (for chat/transcription cost tracking).").default(0),
	costPerSecond: z.number().step(1e-4).description("Cost per second of video/audio in USD (for t2v/tts cost tracking).").default(0),
	avgLatencyMs: z.number().step(1).description("Average latency in ms (host auto-statistic).").default(0),
	qualityHint: z.union([
		"fast",
		"balanced",
		"quality"
	]).description("Quality hint: fast / balanced / quality.").default("balanced")
});
/** Schemastery schema for the plugin configuration. */
const Config = z.object({
	providers: z.array(ProviderSchema).description("One or more AIGC providers; the first is the default.").default([{
		id: "stub",
		name: "",
		endpoint: "stub://aigc-backend",
		apiKey: "",
		instructions: "",
		auth: {
			scheme: "bearer",
			name: ""
		},
		builtin: true,
		endpoints: [],
		priority: 100,
		costPerCall: 0,
		costPerKiloToken: 0,
		costPerSecond: 0,
		avgLatencyMs: 0,
		qualityHint: "balanced"
	}]),
	requestTimeoutMs: z.number().step(1).min(1e3).default(3e5),
	mediaSizeLimit: z.number().step(1).min(1024).default(104857600)
});
/** Returns true when the provider endpoint points at the built-in stub backend. */
function isStubEndpoint(endpoint) {
	return endpoint === "" || endpoint === "stub://aigc-backend";
}
/** Validate a provider id; returns an error message or undefined if valid. */
function validateProviderId(id) {
	if (id === "") return "provider id is required";
	if (!PROVIDER_ID_PATTERN.test(id)) return `invalid provider id: ${JSON.stringify(id)} (must be lowercase, hyphenated, start with a letter)`;
}
/** Migrate + resolve a single provider from config input. */
function resolveProvider(p) {
	const auth = p.auth ?? {};
	return {
		id: p.id,
		name: p.name ?? "",
		endpoint: p.endpoint ?? "stub://aigc-backend",
		apiKey: p.apiKey ?? "",
		instructions: p.instructions ?? "",
		auth: {
			scheme: auth.scheme ?? "bearer",
			name: auth.name ?? ""
		},
		builtin: p.builtin ?? false,
		endpoints: p.endpoints ?? [],
		priority: p.priority ?? 100,
		costPerCall: p.costPerCall ?? 0,
		costPerKiloToken: p.costPerKiloToken ?? 0,
		costPerSecond: p.costPerSecond ?? 0,
		avgLatencyMs: p.avgLatencyMs ?? 0,
		qualityHint: p.qualityHint ?? "balanced"
	};
}
/** Apply direct-call defaults after Loader schema validation has normally run. */
function resolveAigcConfig(config) {
	const providers = (config?.providers ?? []).map(resolveProvider);
	if (providers.length === 0) providers.push({
		id: "stub",
		name: "",
		endpoint: "stub://aigc-backend",
		apiKey: "",
		instructions: "",
		auth: {
			scheme: "bearer",
			name: ""
		},
		builtin: true,
		endpoints: [],
		priority: 100,
		costPerCall: 0,
		costPerKiloToken: 0,
		costPerSecond: 0,
		avgLatencyMs: 0,
		qualityHint: "balanced"
	});
	return {
		providers,
		requestTimeoutMs: config?.requestTimeoutMs ?? 3e5,
		mediaSizeLimit: config?.mediaSizeLimit ?? 104857600
	};
}
//#endregion
//#region src/endpoint-catalog.ts
/** All Capability values as a readonly array (for schema enum + validation). */
const CAPABILITIES = [
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
/** All ResponseKind values as a readonly array. */
const RESPONSE_KINDS = [
	"b64_json_array",
	"b64_json_field",
	"binary",
	"url_field",
	"json_text"
];
/**
* Extract a value from a parsed JSON body by a dotted + `[index]` path.
* Path syntax:
*  - `data` → body.data
*  - `data.b64_json` → body.data.b64_json
*  - `data[0].b64_json` → body.data[0].b64_json
*  - `choices[0].message.content` → body.choices[0].message.content
*
* Returns undefined when any segment doesn't resolve (missing field,
* non-array indexed, etc.). Never throws — safe for sniffing unknown
* response shapes.
*/
function extractByPath(body, path) {
	if (body === null || body === void 0) return void 0;
	let current = body;
	const tokens = path.split(".");
	for (const token of tokens) {
		if (current === null || current === void 0) return void 0;
		const match = /^([^\[\]]+)((?:\[\d+\])*)$/.exec(token);
		if (match === null) return void 0;
		const key = match[1];
		const indices = match[2];
		if (typeof current !== "object") return void 0;
		current = current[key];
		if (indices !== "") {
			const idxMatches = indices.matchAll(/\[(\d+)\]/g);
			for (const idxMatch of idxMatches) {
				if (current === null || current === void 0) return void 0;
				if (!Array.isArray(current)) return void 0;
				const idx = Number(idxMatch[1]);
				current = current[idx];
			}
		}
	}
	return current;
}
/**
* Detect the response kind + path from a successful provider response.
* Used by `aigc_probe_endpoint` to auto-fill an EndpointSpec.response.
*
* Heuristics (checked in order):
*  1. body.data[0].b64_json is a non-empty string → b64_json_array, path "data[0].b64_json"
*  2. body.data[0].url is a non-empty string (http) → url_field, path "data[0].url"
*  3. body.choices[0].message.content is a string → json_text (chat shape)
*  4. body.text is a string → json_text (transcription shape)
*  5. body.result.image is a non-empty string (likely base64) → b64_json_field, path "result.image"
*  6. body.image / body.b64 / body.data (string, not array) → b64_json_field
*  7. Fallback: json_text (return the whole body inline).
*
* Binary responses (image/png, video/mp4, audio/mpeg Content-Type) are
* detected by the caller from the Content-Type header, not from the body —
* this function is only called when the body parses as JSON.
*/
function detectResponseShape(body) {
	if (typeof body !== "object" || body === null) return { kind: "json_text" };
	const obj = body;
	const b64 = extractByPath(obj, "data[0].b64_json");
	if (typeof b64 === "string" && b64.length > 0) return {
		kind: "b64_json_array",
		path: "data[0].b64_json"
	};
	const url = extractByPath(obj, "data[0].url");
	if (typeof url === "string" && /^https?:\/\//i.test(url)) return {
		kind: "url_field",
		path: "data[0].url"
	};
	if (typeof extractByPath(obj, "choices[0].message.content") === "string") return { kind: "json_text" };
	if (typeof obj.text === "string") return { kind: "json_text" };
	const resultImage = extractByPath(obj, "result.image");
	if (typeof resultImage === "string" && resultImage.length > 0) return {
		kind: "b64_json_field",
		path: "result.image"
	};
	for (const key of [
		"image",
		"b64",
		"data"
	]) {
		const v = obj[key];
		if (typeof v === "string" && v.length > 0) return {
			kind: "b64_json_field",
			path: key
		};
	}
	return { kind: "json_text" };
}
/**
* Auto-derive a short `instructions` string from a structured endpoint
* catalog. Used by `aigc_provider_set_endpoints` so the legacy
* `instructions` field stays in sync with the structured `endpoints`
* (the legacy field is still read by old agent prompts).
*
* Format (one line per endpoint):
*   POST /v1/images/generations {prompt,size} -> b64_json_array
*   POST /v1/videos/generations {prompt,duration} -> url_field
*/
function deriveInstructionsFromEndpoints(endpoints) {
	if (endpoints.length === 0) return "";
	return endpoints.map((ep) => {
		const params = (ep.params ?? []).filter((p) => p.required).map((p) => p.name).join(",");
		const paramPart = params !== "" ? ` {${params}}` : "";
		const refHint = ep.acceptsCanvasRef ? " (accepts $base64)" : "";
		return `${ep.method} ${ep.path}${paramPart} -> ${ep.response.kind}${refHint}`;
	}).join("\n");
}
/**
* Find the EndpointSpec for one (path, method) pair on a provider.
* Returns undefined when the provider has no catalog entry for that
* endpoint — the caller then falls back to the legacy auto-sniff logic.
*
* Method matching is case-insensitive. When the provider has multiple
* endpoints at the same path with different methods, the first match wins.
*/
function findEndpointSpec(endpoints, path, method) {
	if (endpoints === void 0 || endpoints.length === 0) return void 0;
	const upperMethod = method.toUpperCase();
	return endpoints.find((ep) => ep.path === path && ep.method.toUpperCase() === upperMethod);
}
/** Group endpoints by capability (for the capabilityMap output). */
function endpointsByCapability(endpoints) {
	const map = /* @__PURE__ */ new Map();
	for (const ep of endpoints) {
		const list = map.get(ep.capability);
		if (list === void 0) map.set(ep.capability, [ep]);
		else list.push(ep);
	}
	return map;
}
/** Distinct capabilities a provider supports (derived from its endpoints). */
function capabilitiesOf(endpoints) {
	if (endpoints === void 0 || endpoints.length === 0) return [];
	const seen = /* @__PURE__ */ new Set();
	for (const ep of endpoints) seen.add(ep.capability);
	return [...seen];
}
//#endregion
//#region src/provider-store.ts
/**
* In-memory provider store with CRUD + disk persistence. Holds the
* canonical list of AIGC providers; tool registration and the settings-
* page RPC share one instance per plugin fiber. Persisted to
* `~/.dsh/aigc-canvas/providers.json` so restarts keep user-added
* providers and instructions.
*
* @module @huanlin/dsh-plugin-aigc-canvas/provider-store
*/
/** Directory for persisted AIGC canvas state (under the DSH user dir). */
const DATA_DIR = join(homedir(), ".dsh", "aigc-canvas");
/** Path to the persisted providers JSON. */
const PROVIDERS_JSON = join(DATA_DIR, "providers.json");
/** Atomic write: mkdir + temp file + rename. */
async function writeJsonAtomic$3(path, value) {
	const tmp = `${path}.tmp-${process.pid}`;
	try {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
		await rename(tmp, path);
	} catch {}
}
/**
* Mutable provider store. Owns the canonical provider list; the backend
* client map and RPC handlers share one instance per plugin fiber.
*
* Persistence: on construction the store loads `~/.dsh/aigc-canvas/
* providers.json` (if present) and merges it over the cordis.yml seed —
* persisted providers win, so user edits and deletions survive restarts.
* Every mutation writes the list back to disk (fire-and-forget).
*/
var ProviderStore = class {
	providers = /* @__PURE__ */ new Map();
	dataPath;
	/** Serializes disk writes so rapid mutations can't interleave. */
	persistChain = Promise.resolve();
	constructor(seed, dataPath = PROVIDERS_JSON) {
		this.dataPath = dataPath;
		const seedBuiltin = new Map(seed.map((p) => [p.id, p.builtin ?? false]));
		const sources = loadPersistedSync(dataPath) ?? seed;
		for (const p of sources) {
			const resolved = {
				id: p.id,
				name: p.name ?? "",
				endpoint: p.endpoint ?? "stub://aigc-backend",
				apiKey: p.apiKey ?? "",
				instructions: p.instructions ?? "",
				auth: {
					scheme: p.auth?.scheme ?? "bearer",
					name: p.auth?.name ?? ""
				},
				builtin: seedBuiltin.get(p.id) ?? false,
				endpoints: p.endpoints ?? [],
				priority: p.priority ?? 100,
				costPerCall: p.costPerCall ?? 0,
				costPerKiloToken: p.costPerKiloToken ?? 0,
				costPerSecond: p.costPerSecond ?? 0,
				avgLatencyMs: p.avgLatencyMs ?? 0,
				qualityHint: p.qualityHint ?? "balanced"
			};
			this.providers.set(resolved.id, resolved);
		}
	}
	/** Snapshot of all providers, in insertion order. */
	list() {
		return [...this.providers.values()];
	}
	/** Look up one provider by id. */
	get(id) {
		return this.providers.get(id);
	}
	/** The default provider (first in insertion order); undefined if empty. */
	defaultProvider() {
		return this.providers.values().next().value;
	}
	/** Add a new provider. Returns failure for duplicate id or invalid shape. */
	add(provider) {
		const idError = validateProviderId(provider.id);
		if (idError !== void 0) return {
			ok: false,
			error: idError
		};
		if (this.providers.has(provider.id)) return {
			ok: false,
			error: `provider id already exists: ${provider.id}`
		};
		const stored = {
			id: provider.id,
			name: provider.name ?? "",
			endpoint: provider.endpoint ?? "stub://aigc-backend",
			apiKey: provider.apiKey ?? "",
			instructions: provider.instructions ?? "",
			auth: {
				scheme: provider.auth?.scheme ?? "bearer",
				name: provider.auth?.name ?? ""
			},
			builtin: false,
			endpoints: provider.endpoints ?? [],
			priority: provider.priority ?? 100,
			costPerCall: provider.costPerCall ?? 0,
			costPerKiloToken: provider.costPerKiloToken ?? 0,
			costPerSecond: provider.costPerSecond ?? 0,
			avgLatencyMs: provider.avgLatencyMs ?? 0,
			qualityHint: provider.qualityHint ?? "balanced"
		};
		this.providers.set(stored.id, stored);
		this.persist();
		return {
			ok: true,
			providers: this.list()
		};
	}
	/** Update an existing provider. Returns failure if the id is unknown. */
	update(provider) {
		const idError = validateProviderId(provider.id);
		if (idError !== void 0) return {
			ok: false,
			error: idError
		};
		const existing = this.providers.get(provider.id);
		if (existing === void 0) return {
			ok: false,
			error: `provider id not found: ${provider.id}`
		};
		const stored = {
			id: provider.id,
			name: provider.name ?? "",
			endpoint: provider.endpoint ?? "stub://aigc-backend",
			apiKey: provider.apiKey ?? "",
			instructions: provider.instructions ?? "",
			auth: {
				scheme: provider.auth?.scheme ?? existing.auth.scheme,
				name: provider.auth?.name ?? existing.auth.name
			},
			builtin: existing.builtin,
			endpoints: provider.endpoints ?? existing.endpoints,
			priority: provider.priority ?? existing.priority,
			costPerCall: provider.costPerCall ?? existing.costPerCall,
			costPerKiloToken: provider.costPerKiloToken ?? existing.costPerKiloToken,
			costPerSecond: provider.costPerSecond ?? existing.costPerSecond,
			avgLatencyMs: provider.avgLatencyMs ?? existing.avgLatencyMs,
			qualityHint: provider.qualityHint ?? existing.qualityHint
		};
		this.providers.set(stored.id, stored);
		this.persist();
		return {
			ok: true,
			providers: this.list()
		};
	}
	/**
	* Replace a provider's usage instructions (called by the model's
	* aigc_provider_set_instructions tool after it probes the API).
	*/
	setInstructions(id, instructions) {
		const existing = this.providers.get(id);
		if (existing === void 0) return {
			ok: false,
			error: `provider id not found: ${id}`
		};
		const stored = {
			...existing,
			instructions
		};
		this.providers.set(stored.id, stored);
		this.persist();
		return {
			ok: true,
			providers: this.list()
		};
	}
	/**
	* Replace a provider's structured endpoint catalog (called by the model's
	* aigc_provider_set_endpoints tool after probing the API). Also auto-
	* derives a short `instructions` string from the catalog so legacy agent
	* prompts that read `instructions` stay in sync (per doc 03 §3 +
	* doc 06 decision 6: coexist + auto-derive).
	*/
	setEndpoints(id, endpoints) {
		const existing = this.providers.get(id);
		if (existing === void 0) return {
			ok: false,
			error: `provider id not found: ${id}`
		};
		const derived = deriveInstructionsFromEndpoints(endpoints);
		const instructions = derived !== "" ? derived : existing.instructions;
		const stored = {
			...existing,
			endpoints: [...endpoints],
			instructions
		};
		this.providers.set(stored.id, stored);
		this.persist();
		return {
			ok: true,
			providers: this.list()
		};
	}
	/** Remove a provider. Returns failure for unknown id. */
	remove(id) {
		if (!this.providers.delete(id)) return {
			ok: false,
			error: `provider id not found: ${id}`
		};
		this.persist();
		return {
			ok: true,
			providers: this.list()
		};
	}
	/**
	* Persist the current provider list to disk (fire-and-forget, serialized).
	* Only the user-editable fields are written; `builtin` is re-derived from
	* the seed on load. Failures are swallowed — the in-memory state stays
	* canonical. Each call snapshots the CURRENT list, so a burst of mutations
	* ends with the latest state on disk.
	*/
	persist() {
		const snapshot = [...this.providers.values()].map(({ builtin: _b, ...rest }) => rest);
		this.persistChain = this.persistChain.then(() => writeJsonAtomic$3(this.dataPath, snapshot)).catch(() => {});
	}
};
/** Read the persisted providers JSON; returns null when absent/unreadable. */
function loadPersistedSync(dataPath) {
	try {
		const raw = readFileSync(dataPath, "utf8");
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return null;
		const providers = [];
		for (const item of parsed) {
			if (typeof item !== "object" || item === null) continue;
			const rec = item;
			if (typeof rec.id !== "string" || rec.id === "") continue;
			providers.push({
				id: rec.id,
				name: typeof rec.name === "string" ? rec.name : "",
				endpoint: typeof rec.endpoint === "string" ? rec.endpoint : "stub://aigc-backend",
				apiKey: typeof rec.apiKey === "string" ? rec.apiKey : "",
				instructions: typeof rec.instructions === "string" ? rec.instructions : "",
				...typeof rec.auth === "object" && rec.auth !== null ? { auth: {
					scheme: rec.auth.scheme === "header" || rec.auth.scheme === "query" ? rec.auth.scheme : "bearer",
					name: typeof rec.auth.name === "string" ? rec.auth.name : ""
				} } : {},
				...Array.isArray(rec.endpoints) ? { endpoints: rec.endpoints } : {},
				...typeof rec.priority === "number" ? { priority: rec.priority } : {},
				...typeof rec.costPerCall === "number" ? { costPerCall: rec.costPerCall } : {},
				...typeof rec.costPerKiloToken === "number" ? { costPerKiloToken: rec.costPerKiloToken } : {},
				...typeof rec.costPerSecond === "number" ? { costPerSecond: rec.costPerSecond } : {},
				...typeof rec.avgLatencyMs === "number" ? { avgLatencyMs: rec.avgLatencyMs } : {},
				...typeof rec.qualityHint === "string" ? { qualityHint: rec.qualityHint } : {}
			});
		}
		return providers;
	} catch {
		return null;
	}
}
//#endregion
//#region src/wire.ts
/** One API failure with its wire code and HTTP status. */
var AigcError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
	}
};
/** Body size bound of one JSON request (defense against unbounded reads). */
const MAX_BODY_BYTES = 1 << 20;
/** Read and parse the JSON request body (bounded; malformed → bad-request). */
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new AigcError("bad-request", "request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new AigcError("bad-request", "request body is not valid JSON");
	}
}
/** Write a JSON response with the given status. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(payload);
}
/** Write the success envelope. */
function writeOk(res, value) {
	writeJson(res, 200, {
		ok: true,
		value
	});
}
/** Write the failure envelope for any thrown value (unknown → internal 500). */
function writeError(res, error) {
	if (error instanceof AigcError) {
		writeJson(res, error.status, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	writeJson(res, 500, {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error)
		}
	});
}
/** Narrow an unknown payload value to a string, else throw bad-request. */
function requireString(payload, key) {
	const value = payload?.[key];
	if (typeof value !== "string" || value === "") throw new AigcError("bad-request", `missing or invalid "${key}"`);
	return value;
}
//#endregion
//#region src/canvas-registry.ts
/**
* The host-side AIGC canvas registry: per-session element table (prompts +
* generated image/video/audio assets) plus edges connecting each input
* element to its produced output. Published as `ctx.aigcCanvas`.
*
* Element identity:
* - Every element (prompt / image / video / audio) has a `filePath` on disk.
*   Prompt elements are written as `.txt` files; media elements as
*   `.<ext>` files. The filePath is the **primary external identifier** —
*   tools return filePath (not uuid), and tools accept filePath (not uuid)
*   when referencing existing elements.
* - Internally, elements are still uuid-keyed (for stable edges + dedup);
*   `getElementByPath` resolves a filePath back to the element.
*
* Free positioning:
* - Every element carries `x` / `y` canvas coordinates (world space). The
*   model sets them when placing a file (`aigc_canvas_place`); the client
*   drags them around and persists through the `canvas.move` API.
*
* Persistence:
* - The in-memory table is mirrored to
*   `<cwd>/.dsh-aigc-canvas/<sessionId>/canvas.json` after every mutation.
* - Media / prompt files live alongside the JSON as `<uuid>.<ext>`.
*/
/** All ElementStatus values as a readonly array (for schema enum + validation). */
const ELEMENT_STATUSES = [
	"draft",
	"ready",
	"rejected",
	"archived"
];
/** Default status when not specified (also used for legacy data hydration). */
const DEFAULT_ELEMENT_STATUS = "ready";
/** Coerce an unknown value to ElementStatus, falling back to the default. */
function coerceElementStatus(value) {
	if (typeof value === "string" && ELEMENT_STATUSES.includes(value)) return value;
	return DEFAULT_ELEMENT_STATUS;
}
/** All EdgeRelation values as a readonly array (for schema enum + validation). */
const EDGE_RELATIONS = [
	"input",
	"first_frame",
	"last_frame",
	"audio_track",
	"reference",
	"style",
	"mask",
	"variation_of",
	"remix_of",
	"alternative_of",
	"edited_from"
];
/** Default relation when an old edge has none (backward compat). */
const DEFAULT_EDGE_RELATION = "input";
/** Coerce an unknown value to EdgeRelation, falling back to the default. */
function coerceEdgeRelation(value) {
	if (typeof value === "string" && EDGE_RELATIONS.includes(value)) return value;
	return DEFAULT_EDGE_RELATION;
}
/** File extension for each media kind (no leading dot). */
function extensionFor(kind) {
	switch (kind) {
		case "image": return "png";
		case "video": return "mp4";
		case "audio": return "mp3";
		case "prompt": return "txt";
	}
}
/** MIME type for each media kind (for the file route). */
function mimeTypeFor(kind) {
	switch (kind) {
		case "image": return "image/png";
		case "video": return "video/mp4";
		case "audio": return "audio/mpeg";
		case "prompt": return "text/plain; charset=utf-8";
	}
}
/** Folder name under the session cwd where canvas state + media live. */
const CANVAS_DIR = ".dsh-aigc-canvas";
/** Filename inside CANVAS_DIR for the per-session element+edge table. */
const CANVAS_JSON = "canvas.json";
/** Default column X for auto-placed elements (left side of the canvas). */
const AUTO_PLACE_X = 32;
/** Vertical gap between auto-placed elements (pixels of empty space). */
const AUTO_PLACE_GAP = 16;
/** Horizontal gap between auto-placed columns. */
const AUTO_COL_GAP_X = 20;
/** Horizontal gap between a referenced element and the new element placed to its right. */
const REFERENCE_GAP_X = 20;
/**
* Estimate the rendered height of one element card (world units).
*
* The card width is fixed at 240px (NODE_W_REF); media elements render
* their content inside a 220px-wide area (240 − 2×10 padding). The
* header row is ~26px, the title is ~18px, and media padding is ~8px.
* Image/video aspect ratios default to 4:3 → 165px media height.
*
* These are approximate — the actual height depends on the media's
* aspect ratio and the title length — but they're close enough that
* auto-placed elements don't overlap.
*/
function estimatedCardHeight(kind) {
	switch (kind) {
		case "prompt": return 124;
		case "audio": return 84;
		case "image":
		case "video": return 217;
	}
}
/**
* Pick a position for a new element. Priority:
* 1. Explicit x/y (finite numbers) — always wins.
* 2. Reference positions: place to the right of the rightmost reference,
*    vertically centered on the average of the references' centers.
* 3. Fallback: multi-column grid. Scans existing auto-placed elements
*    (grouped by x into columns), finds the shortest column whose bottom
*    + the new element's height stays under AUTO_COL_MAX_HEIGHT, and
*    stacks below it. When no column has room, starts a new column to
*    the right of the rightmost one.
*/
function resolvePlacement(existing, x, y, references, kind) {
	if (x !== void 0 && y !== void 0 && Number.isFinite(x) && Number.isFinite(y)) return {
		x,
		y
	};
	if (references !== void 0 && references.length > 0) {
		let maxRight = -Infinity;
		let sumY = 0;
		for (const ref of references) {
			const right = ref.x + NODE_W_REF;
			if (right > maxRight) maxRight = right;
			sumY += ref.y + NODE_H_REF / 2;
		}
		const avgY = sumY / references.length;
		return {
			x: maxRight + REFERENCE_GAP_X,
			y: avgY - NODE_H_REF / 2
		};
	}
	const newHeight = estimatedCardHeight(kind ?? "image");
	const columns = [];
	let maxRight = -Infinity;
	for (const el of existing) {
		if (typeof el.x !== "number" || typeof el.y !== "number") continue;
		if (el.x > maxRight) maxRight = el.x;
		let col = columns.find((c) => Math.abs(c.x - el.x) < NODE_W_REF / 2);
		if (col === void 0) {
			col = {
				x: el.x,
				bottom: el.y + estimatedCardHeight(el.kind)
			};
			columns.push(col);
		} else {
			const bottom = el.y + estimatedCardHeight(el.kind);
			if (bottom > col.bottom) col.bottom = bottom;
		}
	}
	let best;
	for (const col of columns) if (col.bottom + AUTO_PLACE_GAP + newHeight <= 632) {
		if (best === void 0 || col.bottom < best.bottom) best = col;
	}
	if (best !== void 0) return {
		x: best.x,
		y: best.bottom + AUTO_PLACE_GAP
	};
	return {
		x: maxRight > -Infinity ? maxRight + NODE_W_REF + AUTO_COL_GAP_X : AUTO_PLACE_X,
		y: AUTO_PLACE_X
	};
}
/** Node dimensions mirrored from the client (for placement math only). */
const NODE_W_REF = 240;
const NODE_H_REF = 110;
/** Resolve the per-session canvas directory under the session cwd. */
function canvasDirFor(cwd, sessionId) {
	return join(cwd, CANVAS_DIR, sessionId);
}
/** Resolve the per-session canvas JSON path. */
function canvasJsonPath(cwd, sessionId) {
	return join(canvasDirFor(cwd, sessionId), CANVAS_JSON);
}
/** Resolve the per-session file path for one element (by uuid + kind). */
function elementFilePath(cwd, sessionId, uuid, kind) {
	return join(canvasDirFor(cwd, sessionId), `${uuid}.${extensionFor(kind)}`);
}
/** Atomically write a JSON file (temp file + rename). */
async function writeJsonAtomic$2(path, value) {
	const tmp = `${path}.tmp-${process.pid}`;
	try {
		await writeFile(tmp, JSON.stringify(value), "utf8");
		await rename(tmp, path);
	} catch (error) {
		await import("node:fs/promises").then(({ rm }) => rm(tmp, { force: true }).catch(() => {}));
		throw new AigcError("fs-error", `cannot persist canvas state: ${error instanceof Error ? error.message : String(error)}`, 500);
	}
}
/**
* Build the service. The `resolveCwd` callback threads the live session cwd;
* `mediaSizeLimit` bounds how large a placed file may be.
*/
function createAigcCanvasService(resolveCwd, mediaSizeLimit = () => 104857600) {
	const elementsBySession = /* @__PURE__ */ new Map();
	const edgesBySession = /* @__PURE__ */ new Map();
	const listeners = /* @__PURE__ */ new Set();
	const sessionListeners = /* @__PURE__ */ new Map();
	const hydrated = /* @__PURE__ */ new Set();
	const hydrating = /* @__PURE__ */ new Set();
	const notify = (sessionId) => {
		for (const fn of [...listeners]) fn(sessionId);
		const set = sessionListeners.get(sessionId);
		if (set !== void 0) for (const fn of [...set]) fn(sessionId);
	};
	const tableOf = (sessionId) => {
		let table = elementsBySession.get(sessionId);
		if (table === void 0) {
			table = /* @__PURE__ */ new Map();
			elementsBySession.set(sessionId, table);
		}
		return table;
	};
	const edgesOf = (sessionId) => {
		let edges = edgesBySession.get(sessionId);
		if (edges === void 0) {
			edges = [];
			edgesBySession.set(sessionId, edges);
		}
		return edges;
	};
	const hydrate = async (sessionId) => {
		if (hydrated.has(sessionId)) return;
		if (hydrating.has(sessionId)) {
			while (hydrating.has(sessionId)) await new Promise((resolve) => setTimeout(resolve, 5));
			return;
		}
		hydrating.add(sessionId);
		try {
			const path = canvasJsonPath(resolveCwd(sessionId), sessionId);
			let raw;
			try {
				raw = await readFile(path, "utf8");
			} catch (err) {
				if (err !== null && typeof err === "object" && "code" in err && err.code === "ENOENT") hydrated.add(sessionId);
				return;
			}
			const parsed = JSON.parse(raw);
			if (parsed.sessionId !== sessionId) {
				hydrated.add(sessionId);
				return;
			}
			const table = tableOf(sessionId);
			for (const el of Array.isArray(parsed.elements) ? parsed.elements : []) if (el && typeof el.uuid === "string") {
				if (typeof el.x !== "number") el.x = 0;
				if (typeof el.y !== "number") el.y = 0;
				el.status = coerceElementStatus(el.status);
				table.set(el.uuid, el);
			}
			const edges = edgesOf(sessionId);
			for (const e of Array.isArray(parsed.edges) ? parsed.edges : []) if (e && typeof e.source === "string" && typeof e.target === "string") {
				e.relation = coerceEdgeRelation(e.relation);
				edges.push(e);
			}
			hydrated.add(sessionId);
			notify(sessionId);
		} catch {} finally {
			hydrating.delete(sessionId);
		}
	};
	const persist = async (sessionId) => {
		const cwd = resolveCwd(sessionId);
		const dir = canvasDirFor(cwd, sessionId);
		await mkdir(dir, { recursive: true });
		const state = {
			sessionId,
			elements: Array.from(tableOf(sessionId).values()),
			edges: edgesOf(sessionId)
		};
		await writeJsonAtomic$2(canvasJsonPath(cwd, sessionId), state);
	};
	const addPrompt = async (sessionId, params, cwd) => {
		await hydrate(sessionId);
		const uuid = randomUUID();
		const filePath = elementFilePath(cwd, sessionId, uuid, "prompt");
		await mkdir(join(cwd, CANVAS_DIR, sessionId), { recursive: true });
		await writeFile(filePath, params.promptText, "utf8");
		const el = {
			uuid,
			sessionId,
			kind: "prompt",
			title: params.title,
			x: params.x ?? 0,
			y: params.y ?? 0,
			createdAt: Date.now(),
			producedBy: params.producedBy,
			filePath,
			promptText: params.promptText,
			status: DEFAULT_ELEMENT_STATUS,
			...params.meta !== void 0 ? { meta: params.meta } : {},
			...params.description !== void 0 && params.description !== "" ? { description: params.description } : {}
		};
		tableOf(sessionId).set(el.uuid, el);
		await persist(sessionId);
		notify(sessionId);
		return el;
	};
	const addMedia = async (sessionId, params, cwd) => {
		await hydrate(sessionId);
		const uuid = randomUUID();
		const filePath = elementFilePath(cwd, sessionId, uuid, params.kind);
		await mkdir(join(cwd, CANVAS_DIR, sessionId), { recursive: true });
		await writeFile(filePath, params.mediaBytes);
		const el = {
			uuid,
			sessionId,
			kind: params.kind,
			title: params.title,
			x: params.x ?? 0,
			y: params.y ?? 0,
			createdAt: Date.now(),
			producedBy: params.producedBy,
			filePath,
			mediaSize: params.mediaBytes.byteLength,
			status: DEFAULT_ELEMENT_STATUS,
			...params.meta !== void 0 ? { meta: params.meta } : {},
			...params.description !== void 0 && params.description !== "" ? { description: params.description } : {}
		};
		tableOf(sessionId).set(el.uuid, el);
		await persist(sessionId);
		notify(sessionId);
		return el;
	};
	const placeFile = async (sessionId, params, cwd) => {
		await hydrate(sessionId);
		const dir = canvasDirFor(cwd, sessionId);
		const resolved = isAbsolute(params.filePath) ? params.filePath : join(cwd, params.filePath);
		if (!isAbsoluteWithin(dir, resolved)) throw new AigcError("fs-error", `file path outside the session canvas directory: ${params.filePath}`);
		const info = await stat(resolved).catch(() => void 0);
		if (info === void 0 || !info.isFile()) throw new AigcError("fs-error", `file not found or not a regular file: ${params.filePath}`);
		if (info.size > 0 && info.size > mediaSizeLimit()) throw new AigcError("fs-error", `file too large to place on the canvas: ${info.size} bytes`);
		const table = tableOf(sessionId);
		const refPositions = [];
		if (params.referenceUuids !== void 0) for (const refUuid of params.referenceUuids) {
			const ref = table.get(refUuid);
			if (ref !== void 0) refPositions.push({
				x: ref.x,
				y: ref.y
			});
		}
		const pos = resolvePlacement(table.values(), params.x, params.y, refPositions.length > 0 ? refPositions : void 0, params.kind);
		const el = {
			uuid: randomUUID(),
			sessionId,
			kind: params.kind,
			title: params.title,
			x: pos.x,
			y: pos.y,
			createdAt: Date.now(),
			producedBy: params.producedBy,
			filePath: resolved,
			mediaSize: params.kind === "prompt" ? void 0 : info.size,
			status: DEFAULT_ELEMENT_STATUS,
			...params.promptText !== void 0 ? { promptText: params.promptText } : {},
			...params.meta !== void 0 ? { meta: params.meta } : {},
			...params.description !== void 0 && params.description !== "" ? { description: params.description } : {}
		};
		tableOf(sessionId).set(el.uuid, el);
		await persist(sessionId);
		notify(sessionId);
		return el;
	};
	const updatePosition = async (sessionId, uuid, x, y) => {
		await hydrate(sessionId);
		const el = tableOf(sessionId).get(uuid);
		if (el === void 0) throw new AigcError("not-found", `element "${uuid}" not found in session "${sessionId}"`, 404);
		if (!Number.isFinite(x) || !Number.isFinite(y)) throw new AigcError("bad-request", "x and y must be finite numbers");
		el.x = x;
		el.y = y;
		await persist(sessionId);
		notify(sessionId);
		return el;
	};
	const deleteElement = async (sessionId, uuid) => {
		await hydrate(sessionId);
		const table = tableOf(sessionId);
		if (!table.has(uuid)) throw new AigcError("not-found", `element "${uuid}" not found in session "${sessionId}"`, 404);
		table.delete(uuid);
		const edges = edgesOf(sessionId);
		for (let i = edges.length - 1; i >= 0; i--) if (edges[i].source === uuid || edges[i].target === uuid) edges.splice(i, 1);
		await persist(sessionId);
		notify(sessionId);
	};
	const setStatus = async (sessionId, uuid, status, winner) => {
		await hydrate(sessionId);
		const el = tableOf(sessionId).get(uuid);
		if (el === void 0) throw new AigcError("not-found", `element "${uuid}" not found in session "${sessionId}"`, 404);
		el.status = status;
		if (winner !== void 0) el.winner = winner;
		await persist(sessionId);
		notify(sessionId);
		return el;
	};
	const unlink = async (sessionId, sourceUuid, targetUuid) => {
		await hydrate(sessionId);
		const edges = edgesOf(sessionId);
		const index = edges.findIndex((e) => e.source === sourceUuid && e.target === targetUuid);
		if (index === -1) return;
		edges.splice(index, 1);
		await persist(sessionId);
		notify(sessionId);
	};
	const wireEdges = async (sessionId, inputs, targetUuid) => {
		await hydrate(sessionId);
		const table = tableOf(sessionId);
		if (!table.has(targetUuid)) throw new AigcError("not-found", `target element "${targetUuid}" not found in session "${sessionId}"`, 404);
		const edges = edgesOf(sessionId);
		for (const input of inputs) {
			if (!table.has(input.uuid)) throw new AigcError("not-found", `source element "${input.uuid}" not found in session "${sessionId}"`, 404);
			const relation = input.relation ?? "input";
			const existing = edges.find((e) => e.source === input.uuid && e.target === targetUuid);
			if (existing !== void 0) {
				existing.relation = relation;
				if (input.note !== void 0) existing.note = input.note;
			} else edges.push({
				source: input.uuid,
				target: targetUuid,
				relation,
				...input.note !== void 0 ? { note: input.note } : {}
			});
		}
		await persist(sessionId);
		notify(sessionId);
	};
	const getElement = (sessionId, uuid) => {
		const el = tableOf(sessionId).get(uuid);
		if (el === void 0) throw new AigcError("not-found", `element "${uuid}" not found in session "${sessionId}"`, 404);
		return el;
	};
	const getElementByPath = (sessionId, filePath) => {
		const table = tableOf(sessionId);
		for (const el of table.values()) if (el.filePath === filePath) return el;
		throw new AigcError("not-found", `element with filePath "${filePath}" not found in session "${sessionId}"`, 404);
	};
	const snapshot = (sessionId, includeStatuses) => {
		const table = tableOf(sessionId);
		const filterSet = new Set(includeStatuses ?? ["ready"]);
		const elements = Array.from(table.values()).filter((el) => filterSet.has(el.status));
		const elementUuids = new Set(elements.map((e) => e.uuid));
		return {
			sessionId,
			elements,
			edges: edgesOf(sessionId).filter((e) => elementUuids.has(e.source) && elementUuids.has(e.target))
		};
	};
	const subscribe = (listener) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};
	const subscribeSession = (sessionId, listener) => {
		let set = sessionListeners.get(sessionId);
		if (set === void 0) {
			set = /* @__PURE__ */ new Set();
			sessionListeners.set(sessionId, set);
		}
		set.add(listener);
		return () => {
			set.delete(listener);
			if (set.size === 0) sessionListeners.delete(sessionId);
		};
	};
	return {
		addPrompt,
		addMedia,
		placeFile,
		updatePosition,
		deleteElement,
		wireEdges,
		setStatus,
		unlink,
		ensureHydrated: hydrate,
		getElement,
		getElementByPath,
		snapshot,
		subscribe,
		subscribeSession
	};
}
/** True when `target` (absolute or relative) resolves inside `dir`. */
function isAbsoluteWithin(dir, target) {
	const resolved = isAbsolute(target) ? target : join(dir, target);
	const normalizedDir = dir.endsWith(sep) ? dir : `${dir}${sep}`;
	const a = resolved.toLowerCase();
	const b = normalizedDir.toLowerCase();
	return a === dir.toLowerCase() || a.startsWith(b);
}
//#endregion
//#region src/trust-fence.ts
function header(headers, name) {
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}
/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return;
	}
}
/** Whether a normalized URL hostname names the local loopback authority. */
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Canonical authority form: hostname, or hostname:port when a port was written. */
function canonicalAuthority(entry, entryUrl) {
	const port = entryUrl.port !== "" ? entryUrl.port : new URL(`https://${entry}`).port;
	return port === "" ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}
/** Whether the request authority matches a trustedHosts entry (exact or port-less). */
function isTrustedAuthority(hostUrl, trustedHosts) {
	return trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		if (entryUrl === void 0) return false;
		return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
	});
}
/**
* Decide whether one aigc-canvas request may reach the plugin routes.
* @param request - node HTTP request facts (headers).
* @param trustedHosts - non-loopback authorities this deployment serves.
* @returns true when the Host is ours (loopback or trusted) and browser markers are same-origin.
*/
function isTrustedApiRequest(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
//#endregion
//#region src/provider-http.ts
/** Cap on how much of a failure body is surfaced to the model. */
const FAILURE_TEXT_CAP = 4096;
/**
* Cap on inline text responses. The model-facing tool result is size-
* limited by the host framework (very small — a few hundred chars), so
* anything larger is saved to disk and the model gets a file_path with a
* short preview instead.
*/
const INLINE_TEXT_CAP = 2e3;
/** Directory containing the bundled stub assets (../assets from lib/). */
const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
/** Cached stub asset bytes, keyed by filename. */
const assetCache = /* @__PURE__ */ new Map();
/**
* Load a bundled stub asset, caching the result. Falls back to a synthetic
* minimal buffer if the asset file is missing (broken install) so the stub
* still functions — just with less pretty media.
*/
async function loadStubAsset(filename, fallback) {
	const cached = assetCache.get(filename);
	if (cached !== void 0) return cached;
	try {
		const bytes = await readFile(join(ASSETS_DIR, filename));
		const buf = Buffer.from(bytes);
		assetCache.set(filename, buf);
		return buf;
	} catch {
		const fb = fallback();
		assetCache.set(filename, fb);
		return fb;
	}
}
/** Synthetic 1×1 PNG (fallback when the bundled asset is missing). */
function fallbackPng() {
	const magic = Buffer.from([
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10
	]);
	const ihdr = Buffer.from([
		0,
		0,
		0,
		13,
		73,
		72,
		68,
		82,
		0,
		0,
		0,
		1,
		0,
		0,
		0,
		1,
		8,
		6,
		0,
		0,
		0,
		31,
		21,
		196,
		137
	]);
	const idat = Buffer.from([
		0,
		0,
		0,
		10,
		73,
		68,
		65,
		84,
		120,
		156,
		99,
		0,
		1,
		0,
		0,
		0,
		2,
		0,
		1
	]);
	const iend = Buffer.from([
		0,
		0,
		0,
		0,
		73,
		69,
		78,
		68,
		174,
		66,
		96,
		130
	]);
	return Buffer.concat([
		magic,
		ihdr,
		idat,
		iend
	]);
}
/** Synthetic minimal MP4 ftyp box (fallback when the bundled asset is missing). */
function fallbackMp4() {
	return Buffer.from([
		0,
		0,
		0,
		24,
		102,
		116,
		121,
		112,
		109,
		112,
		52,
		50,
		0,
		0,
		0,
		0,
		105,
		115,
		111,
		109,
		109,
		112,
		52,
		49
	]);
}
/** Synthetic minimal WAV (fallback when the bundled asset is missing). */
function fallbackWav() {
	const header = Buffer.alloc(44);
	header.write("RIFF", 0);
	header.writeUInt32LE(36, 4);
	header.write("WAVE", 8);
	header.write("fmt ", 12);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(1, 22);
	header.writeUInt32LE(8e3, 24);
	header.writeUInt32LE(16e3, 28);
	header.writeUInt16LE(2, 32);
	header.writeUInt16LE(16, 34);
	header.write("data", 36);
	header.writeUInt32LE(0, 40);
	return header;
}
function classifyStubRoute(request) {
	const p = request.path.toLowerCase();
	if (/\/v1\/images\/(generations|edits|variations)/.test(p)) return "image";
	if (/\/v1\/audio\/speech/.test(p)) return "audio";
	if (/\/v1\/audio\/(transcriptions|translations)/.test(p)) return "transcription";
	if (/\/v1\/(chat\/completions|completions)/.test(p)) return "chat";
	if (/\/v1\/videos?\/(generations?|create)/.test(p)) return "video";
	if (/\bimages?\b|t2i|img2img|ref2i|2img/.test(p)) return "image";
	if (/\baudios?\b|t2music|tts|speech|voice|music|singing?/.test(p)) return "audio";
	if (/\bvideos?\b|t2v|img2video|fl2v|ref2v|2video|motion|clips?/.test(p)) return "video";
	return "other";
}
/** Parse the request body JSON; returns undefined on parse failure. */
function parseBody(request) {
	if (request.body === void 0 || request.body === "") return void 0;
	try {
		return JSON.parse(request.body);
	} catch {
		return;
	}
}
/** Extract the first user message content from a chat completions body. */
function extractUserMessage(body) {
	if (body === void 0) return "";
	const messages = body.messages;
	if (!Array.isArray(messages)) return "";
	for (const msg of messages) if (typeof msg === "object" && msg !== null && msg.role === "user") {
		const c = msg.content;
		if (typeof c === "string") return c;
	}
	return "";
}
/** Extract a short prompt snippet from the request body for the stub marker. */
function promptSnippet(request) {
	const body = parseBody(request);
	if (body === void 0) return "";
	const p = body.prompt ?? body.text ?? body.input ?? body.messages;
	if (typeof p === "string") return p.slice(0, 64);
	return "";
}
/** Execute one request against the provider (or the built-in stub). */
async function executeProviderRequest(provider, request, opts) {
	const path = request.path.trim();
	if (path === "") throw new AigcError("bad-request", "path is required (relative to the provider endpoint, starting with \"/\")");
	const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(path);
	if (isStubEndpoint(provider.endpoint)) {
		if (isAbsolute) throw new AigcError("bad-request", `absolute URLs are not allowed in stub mode: ${path}`);
		if (!path.startsWith("/")) throw new AigcError("bad-request", `path must start with "/": ${path}`);
		const method = (request.method ?? (request.body !== void 0 ? "POST" : "GET")).toUpperCase();
		if (method === "GET" || method === "HEAD") return {
			ok: true,
			status: 200,
			kind: "json",
			contentType: "application/json; charset=utf-8",
			text: JSON.stringify({
				stub: true,
				hint: "Built-in stub backend. POST to OpenAI-compatible endpoints to receive sample media:",
				endpoints: {
					"/v1/images/generations": "Returns {created, data:[{b64_json}]} — OpenAI image generation format.",
					"/v1/images/edits": "Same response format as /v1/images/generations.",
					"/v1/audio/speech": "Returns audio/mpeg binary bytes directly.",
					"/v1/audio/transcriptions": "Returns {text} JSON.",
					"/v1/chat/completions": "Returns {choices:[{message:{content}}]} JSON.",
					"/v1/videos/generations": "Returns video/mp4 binary bytes directly."
				},
				provider: provider.id,
				path
			}, null, 2)
		};
		const route = classifyStubRoute(request);
		const snippet = promptSnippet(request);
		switch (route) {
			case "image": {
				const bytes = await loadStubAsset("stub-image.png", fallbackPng);
				return {
					ok: true,
					status: 200,
					kind: "json",
					contentType: "application/json; charset=utf-8",
					text: JSON.stringify({
						created: Math.floor(Date.now() / 1e3),
						data: [{ b64_json: bytes.toString("base64") }]
					})
				};
			}
			case "video": {
				const bytes = await loadStubAsset("stub-video.mp4", fallbackMp4);
				return {
					ok: true,
					status: 200,
					kind: "video",
					contentType: "video/mp4",
					bytes,
					size: bytes.byteLength
				};
			}
			case "audio": {
				const bytes = await loadStubAsset("stub-audio.mp3", fallbackWav);
				return {
					ok: true,
					status: 200,
					kind: "audio",
					contentType: "audio/mpeg",
					bytes,
					size: bytes.byteLength
				};
			}
			case "transcription": return {
				ok: true,
				status: 200,
				kind: "json",
				contentType: "application/json; charset=utf-8",
				text: JSON.stringify({ text: `[stub transcription] ${snippet || "(simulated audio transcript)"}` })
			};
			case "chat": {
				const body = parseBody(request);
				const model = typeof body?.model === "string" ? body.model : "gpt-4o";
				const userContent = extractUserMessage(body);
				return {
					ok: true,
					status: 200,
					kind: "json",
					contentType: "application/json; charset=utf-8",
					text: JSON.stringify({
						id: `chatcmpl-stub-${Date.now()}`,
						object: "chat.completion",
						created: Math.floor(Date.now() / 1e3),
						model,
						choices: [{
							index: 0,
							message: {
								role: "assistant",
								content: `[stub] Simulated response to: ${userContent.slice(0, 200)}`
							},
							finish_reason: "stop"
						}],
						usage: {
							prompt_tokens: 0,
							completion_tokens: 0,
							total_tokens: 0
						}
					})
				};
			}
			default: return {
				ok: true,
				status: 200,
				kind: "json",
				contentType: "application/json; charset=utf-8",
				text: JSON.stringify({
					stub: true,
					ok: true,
					path,
					method,
					provider: provider.id
				}, null, 2)
			};
		}
	}
	const method = (request.method ?? (request.body !== void 0 ? "POST" : "GET")).toUpperCase();
	let url;
	if (isAbsolute) {
		let pathUrl;
		try {
			pathUrl = new URL(path);
		} catch {
			throw new AigcError("bad-request", `invalid absolute URL: ${path}`);
		}
		let endpointUrl;
		try {
			endpointUrl = new URL(provider.endpoint);
		} catch {
			throw new AigcError("backend-error", `invalid provider endpoint URL: ${provider.endpoint}`, 502);
		}
		if (pathUrl.origin !== endpointUrl.origin) throw new AigcError("bad-request", `absolute URL must be same-origin as the provider endpoint (${endpointUrl.origin}): ${path}`);
		url = pathUrl;
	} else {
		if (!path.startsWith("/")) throw new AigcError("bad-request", `path must start with "/": ${path}`);
		try {
			url = new URL(`${provider.endpoint.replace(/\/+$/, "")}${path}`);
		} catch {
			throw new AigcError("backend-error", `invalid provider endpoint URL: ${provider.endpoint}`, 502);
		}
	}
	if (request.query !== void 0) for (const [key, value] of Object.entries(request.query)) url.searchParams.set(key, value);
	const headers = new Headers({ ...request.headers ?? {} });
	const auth = provider.auth;
	if (auth.scheme === "bearer") headers.set("Authorization", `Bearer ${provider.apiKey}`);
	else if (auth.scheme === "header") headers.set(auth.name === "" ? "x-api-key" : auth.name, provider.apiKey);
	else url.searchParams.set(auth.name === "" ? "api_key" : auth.name, provider.apiKey);
	if (request.body !== void 0 && !headers.has("content-type")) headers.set("content-type", "application/json");
	let response;
	try {
		const abortSignals = [AbortSignal.timeout(opts.timeoutMs)];
		if (opts.signal !== void 0) abortSignals.push(opts.signal);
		const signal = abortSignals.length > 1 ? AbortSignal.any(abortSignals) : abortSignals[0];
		response = await fetch(url, {
			method,
			headers,
			body: request.body,
			signal,
			redirect: "follow"
		});
	} catch (error) {
		if (error instanceof AigcError) throw error;
		if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw new AigcError("backend-error", `provider request aborted (timeout ${opts.timeoutMs}ms or caller abort)`, 504);
		throw new AigcError("backend-error", `provider request failed: ${error instanceof Error ? error.message : String(error)}`, 502);
	}
	const contentType = response.headers.get("content-type") ?? "";
	const mediaType = contentType.split(";")[0].trim().toLowerCase();
	const status = response.status;
	if (status < 200 || status >= 300) return {
		ok: false,
		status,
		contentType,
		text: Buffer.from(await response.arrayBuffer()).toString("utf8").slice(0, FAILURE_TEXT_CAP)
	};
	if (mediaType.startsWith("image/")) {
		const bytes = Buffer.from(await response.arrayBuffer());
		return {
			ok: true,
			status,
			kind: "image",
			contentType,
			bytes,
			size: bytes.byteLength
		};
	}
	if (mediaType.startsWith("video/")) {
		const bytes = Buffer.from(await response.arrayBuffer());
		return {
			ok: true,
			status,
			kind: "video",
			contentType,
			bytes,
			size: bytes.byteLength
		};
	}
	if (mediaType.startsWith("audio/")) {
		const bytes = Buffer.from(await response.arrayBuffer());
		return {
			ok: true,
			status,
			kind: "audio",
			contentType,
			bytes,
			size: bytes.byteLength
		};
	}
	if (mediaType === "application/octet-stream" || mediaType === "" && !contentType.includes("json") && !contentType.includes("text")) {
		const bytes = Buffer.from(await response.arrayBuffer());
		return {
			ok: true,
			status,
			kind: "other",
			contentType,
			bytes,
			size: bytes.byteLength
		};
	}
	const text = Buffer.from(await response.arrayBuffer()).toString("utf8");
	return {
		ok: true,
		status,
		kind: mediaType.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[") ? "json" : "text",
		contentType,
		text
	};
}
//#endregion
//#region src/media-edit.ts
/**
* Media editing via ffmpeg: the engine behind the `aigc_media_edit` tool.
*
* Supports a fixed set of operations (concat, clip, extract_audio,
* extract_frame, speed, resize, reverse, add_audio, images_to_video)
* selected by the `operation` parameter. All input files must live inside
* the session canvas directory; the output is written there too.
*
* Security: ffmpeg is run with an explicit argv (no shell), a bounded
* timeout, and abort-signal support. Input paths are validated to be
* within the canvas directory so the model can't touch arbitrary files.
*/
/** All operations as a readonly array (for schema enum + validation). */
const MEDIA_EDIT_OPERATIONS = [
	"concat",
	"clip",
	"extract_audio",
	"extract_frame",
	"speed",
	"resize",
	"reverse",
	"add_audio",
	"images_to_video"
];
/** Check that a path is within the canvas directory (security boundary). */
function assertWithinCanvas(dir, filePath) {
	const resolved = isAbsolute(filePath) ? filePath : join(dir, filePath);
	const normalizedDir = dir.endsWith(sep) ? dir : `${dir}${sep}`;
	const a = resolved.toLowerCase();
	const b = normalizedDir.toLowerCase();
	if (a !== dir.toLowerCase() && !a.startsWith(b)) throw new AigcError("bad-request", `input file outside the session canvas directory: ${filePath}`);
}
/** Common ffmpeg install locations per platform (used when PATH lookup fails). */
const FFMPEG_PLATFORM_CANDIDATES = process.platform === "win32" ? [
	"C:\\ffmpeg\\bin\\ffmpeg.exe",
	"C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
	"C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe",
	...process.env.CONDA_PREFIX ? [`${process.env.CONDA_PREFIX}\\Scripts\\ffmpeg.exe`] : []
] : [
	"/usr/bin/ffmpeg",
	"/usr/local/bin/ffmpeg",
	"/opt/homebrew/bin/ffmpeg"
];
/** Human-readable list of the candidate locations (for error messages). */
function describeFfmpegCandidates() {
	return `${process.env.AIGC_FFMPEG_PATH !== void 0 ? `AIGC_FFMPEG_PATH env var, ` : ""}PATH, or one of: ${FFMPEG_PLATFORM_CANDIDATES.join(", ")}`;
}
/**
* Locate the ffmpeg binary. Resolution order:
*  1. `AIGC_FFMPEG_PATH` env var (explicit override; useful for non-standard installs).
*  2. `ffmpeg` on PATH (the normal case on macOS/Linux and most Windows setups).
*  3. Platform-specific common install locations (see FFMPEG_PLATFORM_CANDIDATES).
*
* Throws `AigcError('backend-error')` with an actionable message when no ffmpeg
* can be probed successfully.
*/
async function findFfmpeg() {
	const envPath = process.env.AIGC_FFMPEG_PATH;
	if (envPath !== void 0 && envPath !== "") try {
		await runProcess(envPath, ["-version"], 5e3);
		return envPath;
	} catch {
		throw new AigcError("backend-error", `AIGC_FFMPEG_PATH is set to "${envPath}" but ffmpeg could not be probed there. Unset the var or fix the path.`);
	}
	try {
		await runProcess("ffmpeg", ["-version"], 5e3);
		return "ffmpeg";
	} catch {
		for (const candidate of FFMPEG_PLATFORM_CANDIDATES) try {
			await runProcess(candidate, ["-version"], 5e3);
			return candidate;
		} catch {}
		throw new AigcError("backend-error", `ffmpeg not found. Install ffmpeg (https://ffmpeg.org/download.html) and either: set the ${describeFfmpegCandidates()}.`);
	}
}
/** Run a child process with a timeout, returning on completion. */
function runProcess(cmd, args, timeoutMs, signal) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			windowsHide: true,
			signal
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (d) => {
			stdout += d.toString("utf8");
		});
		child.stderr?.on("data", (d) => {
			stderr += d.toString("utf8");
		});
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new AigcError("backend-error", `process timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({
				stdout,
				stderr,
				code: code ?? -1
			});
		});
	});
}
/** Validate that a file exists and is a regular file. */
async function assertFileExists(filePath) {
	const info = await stat(filePath).catch(() => void 0);
	if (info === void 0 || !info.isFile()) throw new AigcError("bad-request", `input file not found or not a regular file: ${filePath}`);
}
/**
* Execute one media edit operation. Builds the ffmpeg argv, runs it, and
* writes the output to the canvas directory.
*
* @param request - the validated operation request.
* @param cwd - the session cwd (canvas dir = cwd/.dsh-aigc-canvas/sessionId/).
* @param sessionId - the session id (for the canvas dir path).
* @param opts - timeout + abort signal.
* @returns the output file path and timing info.
*/
async function executeMediaEdit(request, cwd, sessionId, opts) {
	const dir = canvasDirFor(cwd, sessionId);
	await mkdir(dir, { recursive: true });
	for (const input of request.inputs) {
		assertWithinCanvas(dir, input);
		await assertFileExists(input);
	}
	const ffmpeg = await findFfmpeg();
	const outputName = `${randomUUID()}.${request.outputExt}`;
	const outputPath = join(dir, outputName);
	const { args, inputCount } = buildFfmpegArgs(request, outputPath);
	const startMs = Date.now();
	let finalArgs;
	if (request.operation === "concat") {
		const listPath = join(dir, `${randomUUID()}.txt`);
		const listContent = request.inputs.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
		await writeFile(listPath, listContent, "utf8");
		finalArgs = [
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			listPath,
			...args
		];
		try {
			const result = await runProcess(ffmpeg, finalArgs, opts.timeoutMs, opts.signal);
			if (result.code !== 0) throw new AigcError("backend-error", `ffmpeg concat failed (code ${result.code}): ${result.stderr.slice(0, 1e3)}`);
		} finally {
			await import("node:fs/promises").then(({ unlink }) => unlink(listPath).catch(() => {}));
		}
	} else if (request.operation === "images_to_video") {
		finalArgs = ["-y"];
		for (const input of request.inputs) finalArgs.push("-i", input);
		const n = request.inputs.length;
		const fps = request.fps ?? 2;
		const filterParts = [];
		for (let i = 0; i < n; i++) filterParts.push(`[${i}:v]setpts=PTS-STARTPTS,format=yuv420p[v${i}]`);
		const concatInputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
		filterParts.push(`${concatInputs}concat=n=${n}:v=1:a=0[out]`);
		finalArgs.push("-filter_complex", filterParts.join(";"), "-map", "[out]", "-r", String(fps), ...args);
		const result = await runProcess(ffmpeg, finalArgs, opts.timeoutMs, opts.signal);
		if (result.code !== 0) throw new AigcError("backend-error", `ffmpeg images_to_video failed (code ${result.code}): ${result.stderr.slice(0, 1e3)}`);
	} else {
		finalArgs = ["-y"];
		for (const input of request.inputs) finalArgs.push("-i", input);
		finalArgs.push(...args);
		const result = await runProcess(ffmpeg, finalArgs, opts.timeoutMs, opts.signal);
		if (result.code !== 0) throw new AigcError("backend-error", `ffmpeg ${request.operation} failed (code ${result.code}): ${result.stderr.slice(0, 1e3)}`);
	}
	const outInfo = await stat(outputPath).catch(() => void 0);
	if (outInfo === void 0 || !outInfo.isFile() || outInfo.size === 0) throw new AigcError("backend-error", `ffmpeg produced no output file`);
	return {
		outputPath,
		operation: request.operation,
		durationMs: Date.now() - startMs
	};
}
/**
* Build the ffmpeg argv (excluding -y and -i flags) for one operation.
* Returns the args array and the number of inputs expected.
*/
function buildFfmpegArgs(request, outputPath) {
	switch (request.operation) {
		case "concat": return {
			args: [
				"-c:v",
				"libx264",
				"-crf",
				"28",
				"-preset",
				"fast",
				"-c:a",
				"aac",
				"-b:a",
				"128k",
				outputPath
			],
			inputCount: request.inputs.length
		};
		case "clip": {
			const args = [];
			if (request.start !== void 0) args.push("-ss", String(request.start));
			const seekArgs = [];
			if (request.start !== void 0) seekArgs.push("-ss", String(request.start));
			if (request.duration !== void 0) seekArgs.push("-t", String(request.duration));
			else if (request.end !== void 0 && request.start !== void 0) seekArgs.push("-t", String(request.end - request.start));
			else if (request.end !== void 0) seekArgs.push("-to", String(request.end));
			return {
				args: [
					...seekArgs,
					"-c:v",
					"libx264",
					"-crf",
					"28",
					"-preset",
					"fast",
					"-c:a",
					"aac",
					"-b:a",
					"128k",
					outputPath
				],
				inputCount: 1
			};
		}
		case "extract_audio": return {
			args: [
				"-vn",
				"-c:a",
				"libmp3lame",
				"-b:a",
				"192k",
				outputPath
			],
			inputCount: 1
		};
		case "extract_frame": {
			const ts = request.timestamp ?? 0;
			return {
				args: [
					"-ss",
					String(ts),
					"-frames:v",
					"1",
					"-q:v",
					"2",
					outputPath
				],
				inputCount: 1
			};
		}
		case "speed": {
			const factor = request.speed ?? 1;
			if (factor <= 0) throw new AigcError("bad-request", "speed must be > 0");
			const pts = (1 / factor).toFixed(6);
			const atempo = Math.min(2, Math.max(.5, factor));
			return {
				args: [
					"-filter:v",
					`setpts=${pts}*PTS`,
					"-filter:a",
					`atempo=${atempo}`,
					"-c:v",
					"libx264",
					"-crf",
					"28",
					"-preset",
					"fast",
					"-c:a",
					"aac",
					outputPath
				],
				inputCount: 1
			};
		}
		case "resize": {
			const vf = [];
			if (request.width !== void 0 && request.height !== void 0) vf.push(`scale=${request.width}:${request.height}`);
			else if (request.width !== void 0) vf.push(`scale=${request.width}:-2`);
			else if (request.height !== void 0) vf.push(`scale=-2:${request.height}`);
			else throw new AigcError("bad-request", "resize requires width and/or height");
			return {
				args: [
					"-vf",
					vf.join(","),
					"-c:v",
					"libx264",
					"-crf",
					"28",
					"-preset",
					"fast",
					"-c:a",
					"copy",
					outputPath
				],
				inputCount: 1
			};
		}
		case "reverse": return {
			args: [
				"-vf",
				"reverse",
				"-af",
				"areverse",
				"-c:v",
				"libx264",
				"-crf",
				"28",
				"-preset",
				"fast",
				outputPath
			],
			inputCount: 1
		};
		case "add_audio": return {
			args: [
				"-map",
				"0:v:0",
				"-map",
				"1:a:0",
				"-c:v",
				"copy",
				"-c:a",
				"aac",
				"-b:a",
				"192k",
				"-shortest",
				outputPath
			],
			inputCount: 2
		};
		case "images_to_video": return {
			args: [
				"-c:v",
				"libx264",
				"-crf",
				"28",
				"-preset",
				"fast",
				"-pix_fmt",
				"yuv420p",
				outputPath
			],
			inputCount: request.inputs.length
		};
		default: throw new AigcError("bad-request", `unsupported operation: ${request.operation}`);
	}
}
//#endregion
//#region src/request-snapshot.ts
/**
* Per-session snapshot cache. Keyed by sessionId → filePath → snapshot.
*
* Uses a Map of Maps so `clearSession` can wipe one session's entries
* without touching others.
*/
const cacheBySession = /* @__PURE__ */ new Map();
/** Get (or lazily create) the per-session cache. */
function sessionCache(sessionId) {
	let m = cacheBySession.get(sessionId);
	if (m === void 0) {
		m = /* @__PURE__ */ new Map();
		cacheBySession.set(sessionId, m);
	}
	return m;
}
/**
* Record a snapshot for one (sessionId, filePath) pair. Called by
* `aigc_http_request` after it saves a binary / oversized-text response.
* Overwrites any previous snapshot for the same filePath.
*/
function recordRequestSnapshot(sessionId, filePath, snapshot) {
	sessionCache(sessionId).set(filePath, snapshot);
}
/**
* Consume (read + delete) the snapshot for one (sessionId, filePath) pair.
* Called by `aigc_canvas_place` — the snapshot is merged into the placed
* element's `meta.originalRequest` and then dropped from the cache so
* memory doesn't grow unboundedly across a long session.
*
* Returns undefined when no snapshot exists (e.g. the file was uploaded
* by the user via drag-drop, or produced by `aigc_media_edit` rather than
* `aigc_http_request`).
*/
function consumeRequestSnapshot(sessionId, filePath) {
	const m = cacheBySession.get(sessionId);
	if (m === void 0) return void 0;
	const snap = m.get(filePath);
	if (snap !== void 0) m.delete(filePath);
	return snap;
}
//#endregion
//#region src/request-log.ts
/** Maximum entries kept per session (older entries are dropped FIFO). */
const MAX_ENTRIES_PER_SESSION = 200;
/** Per-session log storage (sessionId → entries, newest last). */
const logBySession = /* @__PURE__ */ new Map();
/** Per-session monotonic id counter (so ids are unique within a session). */
const idCounterBySession = /* @__PURE__ */ new Map();
/** Get (or lazily create) the per-session log array. */
function sessionLog(sessionId) {
	let arr = logBySession.get(sessionId);
	if (arr === void 0) {
		arr = [];
		logBySession.set(sessionId, arr);
	}
	return arr;
}
/** Next monotonic id for one session. */
function nextId(sessionId) {
	const next = (idCounterBySession.get(sessionId) ?? 0) + 1;
	idCounterBySession.set(sessionId, next);
	return next;
}
/**
* Append one entry to the session's log. Drops the oldest entry when the
* per-session cap is exceeded (FIFO).
*/
function appendLogEntry(sessionId, entry) {
	const arr = sessionLog(sessionId);
	const full = {
		id: nextId(sessionId),
		timestamp: Date.now(),
		...entry
	};
	arr.push(full);
	while (arr.length > MAX_ENTRIES_PER_SESSION) arr.shift();
	return full;
}
/** Read all log entries for one session (newest last). */
function getLogEntries(sessionId) {
	return sessionLog(sessionId);
}
/** Clear all log entries for one session. */
function clearLogEntries(sessionId) {
	logBySession.delete(sessionId);
	idCounterBySession.delete(sessionId);
}
/** Cap on request body / response body preview size (chars). */
const PREVIEW_CAP = 500;
/** Truncate a string to the preview cap. */
function previewOf(s) {
	if (s === void 0) return void 0;
	if (s.length <= PREVIEW_CAP) return s;
	return `${s.slice(0, PREVIEW_CAP)}… (${s.length} chars total)`;
}
/**
* Redact the provider apiKey from request headers + query params before
* storing them in the log. The auth header/query name is derived from the
* provider's auth config:
*  - bearer: redact the `Authorization` header value → `Bearer ***`
*  - header: redact the header named `auth.name` (default `x-api-key`) → `***`
*  - query:  redact the query param named `auth.name` (default `api_key`) → `***`
*
* Also redacts any header whose name contains "key"/"token"/"auth"/"secret"
* (case-insensitive) as a defense-in-depth against accidentally logging
* credentials passed as extra headers.
*/
function redactSecrets(headers, query, provider) {
	const auth = provider.auth;
	const authHeaderName = auth.scheme === "header" ? auth.name === "" ? "x-api-key" : auth.name : "authorization";
	const authQueryName = auth.scheme === "query" ? auth.name === "" ? "api_key" : auth.name : "";
	const sensitivePattern = /key|token|auth|secret|password/i;
	const redact = (src, isHeader) => {
		if (src === void 0) return void 0;
		const out = {};
		for (const [k, v] of Object.entries(src)) {
			const lk = k.toLowerCase();
			if (isHeader && lk === authHeaderName.toLowerCase()) out[k] = auth.scheme === "bearer" ? "Bearer ***" : "***";
			else if (!isHeader && authQueryName !== "" && lk === authQueryName.toLowerCase()) out[k] = "***";
			else if (sensitivePattern.test(k)) out[k] = "***";
			else out[k] = v;
		}
		return out;
	};
	return {
		headers: redact(headers, true),
		query: redact(query, false)
	};
}
/** Helper: build + append an http log entry from a provider request + result. */
function logHttpRequest(sessionId, provider, request, result, durationMs, producedFilePath, producedSize) {
	const redacted = redactSecrets(request.headers, request.query, provider);
	appendLogEntry(sessionId, {
		type: "http",
		providerId: provider.id,
		method: request.method,
		path: request.path,
		status: result.status,
		durationMs,
		...producedSize !== void 0 ? { size: producedSize } : {},
		...result.error !== void 0 ? { error: previewOf(result.error) } : {},
		...redacted.headers !== void 0 ? { requestHeaders: redacted.headers } : {},
		...redacted.query !== void 0 ? { requestQuery: redacted.query } : {},
		...request.body !== void 0 ? { requestBodyPreview: previewOf(request.body) } : {},
		responseContentType: result.contentType,
		...result.text !== void 0 ? { responseBodyPreview: previewOf(result.text) } : {},
		...producedFilePath !== void 0 ? { elementPath: producedFilePath } : {}
	});
}
/** Helper: build + append a media_edit log entry. */
function logMediaEdit(sessionId, operation, inputs, result) {
	appendLogEntry(sessionId, {
		type: "media_edit",
		operation,
		inputs,
		status: result.ok ? 0 : 1,
		durationMs: result.durationMs,
		...result.size !== void 0 ? { size: result.size } : {},
		...result.error !== void 0 ? { error: previewOf(result.error) } : {},
		...result.outputPath !== void 0 ? { elementPath: result.outputPath } : {}
	});
}
//#endregion
//#region src/cost-tracker.ts
/** Per-session cost storage. */
const costBySession = /* @__PURE__ */ new Map();
/** Get (or lazily create) the per-session cost tracker. */
function sessionCost(sessionId) {
	let sc = costBySession.get(sessionId);
	if (sc === void 0) {
		sc = {
			total: 0,
			byProvider: {},
			byCapability: {},
			callCount: 0
		};
		costBySession.set(sessionId, sc);
	}
	return sc;
}
/**
* Calculate the cost of one provider call based on the provider's cost config
* + response info. Returns 0 when no cost config is available.
*/
function calculateCallCost(config, responseInfo) {
	if (config.costPerKiloToken !== void 0 && responseInfo.usage?.total_tokens !== void 0) return responseInfo.usage.total_tokens / 1e3 * config.costPerKiloToken;
	if (config.costPerSecond !== void 0 && responseInfo.durationSeconds !== void 0) return responseInfo.durationSeconds * config.costPerSecond;
	if (config.costPerCall !== void 0) return config.costPerCall;
	return 0;
}
/**
* Record one call's cost into the session tracker.
* Called by aigc_http_request after a successful provider call.
*/
function recordCallCost(sessionId, providerId, capability, cost) {
	if (cost <= 0) return;
	const sc = sessionCost(sessionId);
	sc.total += cost;
	sc.callCount += 1;
	sc.byProvider[providerId] = (sc.byProvider[providerId] ?? 0) + cost;
	if (capability !== void 0) sc.byCapability[capability] = (sc.byCapability[capability] ?? 0) + cost;
}
/** Get the per-session cost summary (for the canvas header + log panel footer). */
function getSessionCost(sessionId) {
	return sessionCost(sessionId);
}
/** Clear the cost tracker for one session. */
function clearSessionCost(sessionId) {
	costBySession.delete(sessionId);
}
//#endregion
//#region src/retry-dedup.ts
/**
* Auto-retry + dedup for aigc_http_request: per docs/product/04-ux-reliability.md §4.
*
* Retry: 429/500/502/503/504 get exponential backoff (1s → 2s → 4s, max 3 attempts).
* Dedup: same provider + path + body hash within dedupWindowMs returns the cached
* filePath instead of re-calling the provider.
*
* @module @huanlin/dsh-plugin-aigc-canvas/retry-dedup
*/
/** Status codes that trigger automatic retry. */
const RETRYABLE_STATUS_CODES = [
	429,
	500,
	502,
	503,
	504
];
/** Default retry config. */
const DEFAULT_RETRY_POLICY = {
	maxAttempts: 3,
	backoffBaseMs: 1e3,
	retryOn: RETRYABLE_STATUS_CODES
};
const dedupCacheBySession = /* @__PURE__ */ new Map();
/** Compute the dedup cache key for one request. */
function dedupKey(providerId, method, path, body) {
	const hash = createHash("sha256");
	hash.update(`${providerId}:${method}:${path}`);
	if (body !== void 0) hash.update(body);
	return hash.digest("hex");
}
/**
* Check the dedup cache for a matching entry. Returns undefined when no cache
* hit (or when dedup is disabled / the entry has expired).
*/
function checkDedup(sessionId, providerId, method, path, body, dedupWindowMs) {
	if (dedupWindowMs <= 0) return void 0;
	const cache = dedupCacheBySession.get(sessionId);
	if (cache === void 0) return void 0;
	const key = dedupKey(providerId, method, path, body);
	const entry = cache.get(key);
	if (entry === void 0) return void 0;
	if (entry.timestamp === void 0 || Date.now() - entry.timestamp > dedupWindowMs) {
		cache.delete(key);
		return;
	}
	return entry;
}
/** Store one result in the dedup cache. */
function storeDedup(sessionId, providerId, method, path, body, result, dedupWindowMs) {
	if (dedupWindowMs <= 0) return;
	let cache = dedupCacheBySession.get(sessionId);
	if (cache === void 0) {
		cache = /* @__PURE__ */ new Map();
		dedupCacheBySession.set(sessionId, cache);
	}
	const key = dedupKey(providerId, method, path, body);
	cache.set(key, {
		...result,
		timestamp: Date.now()
	});
}
/**
* Sleep for ms, respecting an abort signal.
*/
function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		if (signal !== void 0) {
			const onAbort = () => {
				clearTimeout(timer);
				reject(/* @__PURE__ */ new Error("aborted"));
			};
			if (signal.aborted) {
				clearTimeout(timer);
				reject(/* @__PURE__ */ new Error("aborted"));
				return;
			}
			signal.addEventListener("abort", onAbort, { once: true });
		}
	});
}
/**
* Whether a status code is retryable.
*/
function isRetryable(status, retryOn = RETRYABLE_STATUS_CODES) {
	return retryOn.includes(status);
}
/**
* Execute a function with automatic retry on retryable failures.
* Returns the result of the function, or throws the last error.
*/
async function withRetry(fn, opts = {}) {
	const maxAttempts = opts.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts;
	const backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_RETRY_POLICY.backoffBaseMs;
	const retryOn = opts.retryOn ?? DEFAULT_RETRY_POLICY.retryOn;
	let lastError;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		opts.signal?.throwIfAborted();
		try {
			const result = await fn();
			if (opts.isRetryableResult !== void 0 && opts.getResponseStatus !== void 0) {
				const status = opts.getResponseStatus(result);
				if (retryOn.includes(status) && attempt < maxAttempts) {
					await sleep(backoffBaseMs * Math.pow(2, attempt - 1), opts.signal);
					continue;
				}
			}
			return {
				result,
				attempts: attempt
			};
		} catch (error) {
			lastError = error;
			if (opts.signal?.aborted === true) throw error;
			if (attempt < maxAttempts) {
				const backoffMs = backoffBaseMs * Math.pow(2, attempt - 1);
				try {
					await sleep(backoffMs, opts.signal);
				} catch {
					throw error;
				}
				continue;
			}
		}
	}
	throw lastError;
}
/** Mutable library root (overridable by tests via {@link setLibraryDir}). */
let libraryDir = join(homedir(), ".dsh", "aigc-canvas", "library");
/** Resolve a path inside the library root. */
function libPath(...segments) {
	return join(libraryDir, ...segments);
}
/** Asset categories per docs/product/04-ux-reliability.md §6. */
const ASSET_CATEGORIES = [
	"style-reference",
	"subject-reference",
	"prompt-template",
	"voice-sample",
	"final-product"
];
/** Coerce a value to {@link AssetCategory} (throws AigcError on invalid). */
function coerceAssetCategory(value) {
	if (typeof value !== "string" || !ASSET_CATEGORIES.includes(value)) throw new AigcError("bad-request", `invalid asset category: ${String(value)}; expected one of ${ASSET_CATEGORIES.join(", ")}`);
	return value;
}
/** Infer the asset type from a file extension. */
function typeForExtension(ext) {
	const e = ext.toLowerCase().replace(/^\./, "");
	if ([
		"png",
		"jpg",
		"jpeg",
		"gif",
		"webp",
		"bmp",
		"svg"
	].includes(e)) return "image";
	if ([
		"mp4",
		"webm",
		"mov",
		"avi",
		"mkv",
		"m4v",
		"ogv"
	].includes(e)) return "video";
	if ([
		"mp3",
		"wav",
		"ogg",
		"flac",
		"aac",
		"m4a",
		"opus"
	].includes(e)) return "audio";
	return "prompt";
}
/** Atomic write: mkdir + temp file + rename (mirrors provider-store.ts). */
async function writeJsonAtomic$1(path, value) {
	const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
	try {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
		await rename(tmp, path);
	} catch {}
}
/** Type guard for the persisted index shape. */
function isAssetIndex(v) {
	if (typeof v !== "object" || v === null) return false;
	return Array.isArray(v.assets);
}
/** Load the index from disk (returns an empty index when absent/unreadable). */
async function loadIndex() {
	try {
		const raw = await readFile(libPath("index.json"), "utf8");
		const parsed = JSON.parse(raw);
		return isAssetIndex(parsed) ? parsed : { assets: [] };
	} catch {
		return { assets: [] };
	}
}
/** Serializes disk writes so rapid mutations can't interleave. */
let persistChain = Promise.resolve();
/** Persist the index to disk (serialized; swallows errors like ProviderStore). */
function persistIndex(index) {
	const snapshot = { assets: [...index.assets] };
	persistChain = persistChain.then(() => writeJsonAtomic$1(libPath("index.json"), snapshot)).catch(() => {});
}
/**
* Ensure the library directory structure exists. Idempotent — safe to call
* before every operation. Creates `images/` and `prompts/` subdirectories
* and an empty `index.json` when absent.
*/
async function initLibrary() {
	await mkdir(libPath("images"), { recursive: true });
	await mkdir(libPath("prompts"), { recursive: true });
	const indexPath = libPath("index.json");
	try {
		await stat(indexPath);
	} catch {
		await writeJsonAtomic$1(indexPath, { assets: [] });
	}
}
/**
* Promote one canvas element (file copy) to the library. The source file
* is copied (not moved) into `library/images/` or `library/prompts/`, and
* a new {@link Asset} record is appended to `index.json`.
*
* The copy is independent of the original session — deleting the session
* canvas dir afterwards leaves the library asset intact.
*/
async function promoteAsset(params) {
	await initLibrary();
	const info = await stat(params.sourceFilePath).catch(() => void 0);
	if (info === void 0 || !info.isFile()) throw new AigcError("bad-request", `source file not found or not a regular file: ${params.sourceFilePath}`);
	const ext = extname(params.sourceFilePath);
	const type = typeForExtension(ext);
	const id = `asset_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
	const destRel = `${type === "prompt" ? "prompts" : "images"}/${id}${ext}`;
	await copyFile(params.sourceFilePath, libPath(destRel));
	const asset = {
		id,
		type,
		filePath: destRel,
		title: params.title ?? basename(params.sourceFilePath, ext),
		tags: params.tags ?? [],
		category: params.category,
		createdAt: Date.now(),
		...params.originalPrompt !== void 0 ? { originalPrompt: params.originalPrompt } : {},
		...params.sourceSessionId !== void 0 ? { sourceSessionId: params.sourceSessionId } : {},
		...params.sourceElementPath !== void 0 ? { sourceElementPath: params.sourceElementPath } : {},
		...params.metadata !== void 0 ? { metadata: params.metadata } : {}
	};
	const index = await loadIndex();
	index.assets.push(asset);
	persistIndex(index);
	await persistChain;
	return asset;
}
/**
* List assets with optional filters. Filters are AND-combined. The result
* is sorted by `createdAt` ascending (oldest first) for stable display.
*/
async function listAssets(filter) {
	let result = (await loadIndex()).assets;
	if (filter?.type !== void 0) result = result.filter((a) => a.type === filter.type);
	if (filter?.category !== void 0) result = result.filter((a) => a.category === filter.category);
	if (filter?.tags !== void 0 && filter.tags.length > 0) result = result.filter((a) => filter.tags.every((t) => a.tags.includes(t)));
	if (filter?.search !== void 0 && filter.search !== "") {
		const q = filter.search.toLowerCase();
		result = result.filter((a) => a.title.toLowerCase().includes(q) || (a.originalPrompt ?? "").toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q)));
	}
	return [...result].sort((a, b) => a.createdAt - b.createdAt);
}
/**
* Get one asset by id. Returns the asset record plus its absolute file
* path (so the caller — tool or API — can hand the path to aigc_http_request's
* `$base64` placeholder or to a file-serving route).
*/
async function getAsset(assetId) {
	const asset = (await loadIndex()).assets.find((a) => a.id === assetId);
	if (asset === void 0) throw new AigcError("not-found", `asset not found: ${assetId}`, 404);
	return {
		...asset,
		absoluteFilePath: libPath(asset.filePath)
	};
}
/**
* Remove an asset: deletes the file copy from disk and removes the record
* from the index. Returns false when the id is unknown (idempotent on the
* index side; orphaned files from a crashed promote are best-effort cleaned).
*/
async function removeAsset(assetId) {
	const index = await loadIndex();
	const idx = index.assets.findIndex((a) => a.id === assetId);
	if (idx === -1) return false;
	const [asset] = index.assets.splice(idx, 1);
	await rm(libPath(asset.filePath), { force: true }).catch(() => {});
	persistIndex(index);
	await persistChain;
	return true;
}
/**
* Resolve an asset's relative filePath to an absolute path. Used by tools
* that already hold the asset record and just need the disk path.
*/
function resolveAssetPath(relativePath) {
	return libPath(relativePath);
}
//#endregion
//#region src/pipeline.ts
/**
* Pipeline DAG engine — the host-side state machine behind the
* `aigc_pipeline_*` tools (per docs/product/02-pipeline.md §1-3, §5-6, §9-10).
*
* A Pipeline is a declarative spec of AIGC steps (capability or operation)
* wired by declared input edges. The engine:
*   1. Topologically sorts the steps (Kahn's algorithm).
*   2. Executes them in waves: each wave is the set of currently-runnable
*      steps (all deps completed) — independent branches thus parallelize.
*   3. Places each step's output on the canvas + wires edges to its inputs.
*   4. Persists state to `<cwd>/.dsh-aigc-canvas/<sessionId>/pipelines/<pipeline_id>.json`
*      after every wave so a crashed run can be resumed.
*   5. Emits progress events to a callback (the host wires this to
*      `agent.inject` so the model sees "[2/5] Done: animated → /path/to/video.mp4").
*   6. Honors an AbortSignal for `aigc_pipeline_cancel`.
*
* Scope per doc 06 decision 5: linear + simple fan-out / fan-in DAGs. The
* sort itself handles arbitrary DAGs; the user-facing restriction is about
* reasoning complexity, not the algorithm.
*
* Step execution:
*   - `capability` step: looks up an EndpointSpec for that capability in the
*     provider's catalog (or falls back to a default path per capability),
*     calls executeProviderRequest, processes the response (binary save or
*     OpenAI b64_json extraction), places the result on the canvas.
*   - `operation` step: maps inputs → MediaEditRequest.inputs, calls
*     executeMediaEdit (ffmpeg), places the result on the canvas.
*/
/** Sub-directory under the session canvas dir where pipeline JSON state lives. */
const PIPELINE_DIR_NAME = "pipelines";
/**
* Default endpoint path per capability when a provider has no structured
* EndpointSpec for it (e.g. the built-in stub provider). Matches the stub's
* classifyStubRoute path patterns so capability steps produce the right
* synthetic media kind.
*/
const DEFAULT_PATH_FOR_CAPABILITY = {
	t2i: "/v1/images/generations",
	i2i: "/v1/images/edits",
	t2v: "/v1/videos/generations",
	i2v: "/v1/videos/generations",
	fl2v: "/v1/videos/generations",
	ref2v: "/v1/videos/generations",
	tts: "/v1/audio/speech",
	music: "/v1/audio/speech",
	transcribe: "/v1/audio/transcriptions",
	edit: "/v1/images/edits",
	chat: "/v1/chat/completions"
};
/** Default output extension per MediaEditOperation (no leading dot). */
function defaultOutputExtForOperation(operation) {
	switch (operation) {
		case "extract_audio": return "mp3";
		case "extract_frame": return "png";
		case "concat":
		case "clip":
		case "speed":
		case "resize":
		case "reverse":
		case "add_audio":
		case "images_to_video": return "mp4";
		default: return "bin";
	}
}
/** File extension for one binary kind produced by the provider (image/video/audio). */
function extensionForBinaryKind$1(kind, contentType) {
	const subtype = contentType.split(";")[0]?.trim().split("/")[1]?.toLowerCase() ?? "";
	switch (kind) {
		case "image": return [
			"png",
			"jpeg",
			"jpg",
			"webp",
			"gif"
		].includes(subtype) ? subtype : "png";
		case "video": return [
			"mp4",
			"webm",
			"mov",
			"ogg",
			"m4v"
		].includes(subtype) ? subtype : "mp4";
		case "audio": return [
			"mp3",
			"wav",
			"flac",
			"ogg",
			"m4a",
			"aac",
			"opus"
		].includes(subtype) ? subtype : "mp3";
		case "other": return "bin";
	}
}
/** Resolve the per-session pipelines directory under the session cwd. */
function pipelinesDirFor(cwd, sessionId) {
	return join(canvasDirFor(cwd, sessionId), PIPELINE_DIR_NAME);
}
/** Resolve the JSON path for one pipeline's persisted state. */
function pipelineJsonPath(cwd, sessionId, pipelineId) {
	return join(pipelinesDirFor(cwd, sessionId), `${pipelineId}.json`);
}
/** Save a buffer into the session canvas directory; returns the absolute path. */
async function saveBytesToCanvas(bytes, ext, sessionId, cwd) {
	const dir = canvasDirFor(cwd, sessionId);
	await mkdir(dir, { recursive: true });
	const filePath = join(dir, `${randomUUID()}.${ext}`);
	await writeFile(filePath, bytes);
	return filePath;
}
/**
* Detect the OpenAI image-generation JSON response format and extract the
* base64-encoded image bytes from it: `{ "data": [{ "b64_json": "<base64>" }] }`.
* Returns null when the text is not this shape. Sniffs the decoded magic
* bytes to pick the right file extension.
*/
function extractOpenAIB64Image$1(text) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const data = parsed.data;
	if (!Array.isArray(data) || data.length === 0) return null;
	const first = data[0];
	if (typeof first !== "object" || first === null) return null;
	const b64 = first.b64_json;
	if (typeof b64 !== "string" || b64.length === 0) return null;
	const bytes = Buffer.from(b64, "base64");
	if (bytes.byteLength < 8) return null;
	if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return {
		bytes,
		ext: "png",
		contentType: "image/png"
	};
	if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return {
		bytes,
		ext: "jpg",
		contentType: "image/jpeg"
	};
	if (bytes.byteLength >= 12 && bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") return {
		bytes,
		ext: "webp",
		contentType: "image/webp"
	};
	if (bytes.slice(0, 6).toString("ascii") === "GIF89a" || bytes.slice(0, 6).toString("ascii") === "GIF87a") return {
		bytes,
		ext: "gif",
		contentType: "image/gif"
	};
	return {
		bytes,
		ext: "png",
		contentType: "image/png"
	};
}
/**
* Evaluate a `when` conditional expression. Supports the simple form
* `<step_id>.status == 'value'` / `<step_id>.status != 'value'`. Returns
* true (always run) for unrecognized expressions — fail-open so a typo in
* the expression doesn't silently skip a step the user wanted.
*/
function evaluateWhen(expr, stepStateById) {
	const trimmed = expr.trim();
	if (trimmed === "") return true;
	const match = trimmed.match(/^([A-Za-z0-9_-]+)\.status\s*(==|!=)\s*['"]?([A-Za-z0-9_-]+)['"]?$/);
	if (match === null) return true;
	const [, stepId, op, value] = match;
	const state = stepStateById.get(stepId);
	if (state === void 0) return false;
	return op === "==" ? state.status === value : state.status !== value;
}
/** Replace `{{param_name}}` placeholders in a string with values from `params`. */
function substituteTemplate$1(value, params) {
	return value.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, (whole, name) => {
		const v = params[name];
		return typeof v === "string" ? v : whole;
	});
}
/** Deep-walk a structure and apply `{{param}}` substitution to every string. */
function applyTemplateToValue$1(value, params) {
	if (typeof value === "string") return substituteTemplate$1(value, params);
	if (Array.isArray(value)) return value.map((item) => applyTemplateToValue$1(item, params));
	if (value !== null && typeof value === "object") {
		const out = {};
		for (const [k, v] of Object.entries(value)) out[k] = applyTemplateToValue$1(v, params);
		return out;
	}
	return value;
}
/** Apply template param substitution to a full PipelineSpec (mutates a copy). */
function applyTemplateParams(spec, params) {
	if (params === void 0) return spec;
	return applyTemplateToValue$1(spec, params);
}
/** Validate a resolved PipelineSpec (after template substitution). */
function validateSpec(spec) {
	if (typeof spec.name !== "string" || spec.name === "") throw new AigcError("bad-request", "pipeline spec.name is required");
	if (spec.onError !== "abort" && spec.onError !== "continue") throw new AigcError("bad-request", `pipeline spec.onError must be "abort" or "continue" (got "${spec.onError}")`);
	if (!Array.isArray(spec.steps) || spec.steps.length === 0) throw new AigcError("bad-request", "pipeline spec.steps must be a non-empty array");
	for (const step of spec.steps) {
		if (typeof step.id !== "string" || step.id === "") throw new AigcError("bad-request", "each step needs a non-empty id");
		if (step.capability === void 0 && step.operation === void 0) throw new AigcError("bad-request", `step "${step.id}" has neither capability nor operation`);
		if (step.capability !== void 0 && step.operation !== void 0) throw new AigcError("bad-request", `step "${step.id}" has both capability and operation (mutually exclusive)`);
		if (step.params === void 0 || step.params === null || typeof step.params !== "object" || Array.isArray(step.params)) throw new AigcError("bad-request", `step "${step.id}" params must be a JSON object`);
	}
}
/** Apply step overrides to a spec (returns a new spec; doesn't mutate the input). */
function applyStepOverrides(spec, overrides) {
	const newSteps = spec.steps.map((step) => {
		const ov = overrides[step.id];
		if (ov === void 0) return step;
		return {
			...step,
			...ov.provider_id !== void 0 ? { provider_id: ov.provider_id } : {},
			...ov.params !== void 0 ? { params: {
				...step.params,
				...ov.params
			} } : {}
		};
	});
	return {
		...spec,
		steps: newSteps
	};
}
/** Build a compact PipelineSummary from a full state. */
function summarize(state) {
	return {
		pipeline_id: state.pipeline_id,
		name: state.name,
		status: state.status,
		started_at: state.started_at,
		...state.finished_at !== void 0 ? { finished_at: state.finished_at } : {},
		step_count: state.steps.length,
		completed_count: state.steps.filter((s) => s.status === "completed").length
	};
}
/** The shape returned to tools — projects state.steps to the doc §3 wire shape. */
function pipelineStateProjection(state) {
	return {
		pipeline_id: state.pipeline_id,
		name: state.name,
		status: state.status,
		steps: state.steps.map((s) => ({
			id: s.id,
			status: s.status,
			...s.element_path !== void 0 ? { element_path: s.element_path } : {},
			...s.error !== void 0 ? { error: s.error } : {},
			...s.started_at !== void 0 ? { started_at: s.started_at } : {},
			...s.finished_at !== void 0 ? { finished_at: s.finished_at } : {}
		}))
	};
}
/** Persist pipeline state to disk (atomic-ish — best-effort, no tmp file). */
async function persistState(state, cwd) {
	const dir = pipelinesDirFor(cwd, state.session_id);
	await mkdir(dir, { recursive: true });
	await writeFile(pipelineJsonPath(cwd, state.session_id, state.pipeline_id), JSON.stringify(state, null, 2), "utf8");
}
/** Load one pipeline's persisted state. Returns undefined when the file doesn't exist. */
async function loadState(cwd, sessionId, pipelineId) {
	try {
		const raw = await readFile(pipelineJsonPath(cwd, sessionId, pipelineId), "utf8");
		return JSON.parse(raw);
	} catch (err) {
		if (err !== null && typeof err === "object" && "code" in err && err.code === "ENOENT") return;
		throw err;
	}
}
/**
* Compute a topological order of the steps (Kahn's algorithm). The doc limits
* the supported shape to "linear + simple fan-out" (decision 5), but the
* sort itself handles arbitrary DAGs; the restriction is about user-facing
* complexity, not the algorithm. Throws on cycles and unknown `from` refs.
*/
function topologicalSort(steps) {
	const byId = new Map(steps.map((s) => [s.id, s]));
	if (byId.size !== steps.length) throw new AigcError("bad-request", "pipeline spec has duplicate step ids");
	for (const s of steps) for (const input of s.inputs ?? []) if (!byId.has(input.from)) throw new AigcError("bad-request", `step "${s.id}" references unknown input step "${input.from}"`);
	const inDegree = /* @__PURE__ */ new Map();
	const dependents = /* @__PURE__ */ new Map();
	for (const s of steps) {
		inDegree.set(s.id, 0);
		dependents.set(s.id, []);
	}
	for (const s of steps) {
		const seen = /* @__PURE__ */ new Set();
		for (const input of s.inputs ?? []) {
			if (seen.has(input.from)) continue;
			seen.add(input.from);
			inDegree.set(s.id, (inDegree.get(s.id) ?? 0) + 1);
			dependents.get(input.from).push(s.id);
		}
	}
	const queue = steps.filter((s) => (inDegree.get(s.id) ?? 0) === 0).map((s) => s.id);
	const ordered = [];
	while (queue.length > 0) {
		const id = queue.shift();
		ordered.push(byId.get(id));
		for (const dep of dependents.get(id) ?? []) {
			const newDeg = (inDegree.get(dep) ?? 0) - 1;
			inDegree.set(dep, newDeg);
			if (newDeg === 0) queue.push(dep);
		}
	}
	if (ordered.length !== steps.length) throw new AigcError("bad-request", "pipeline spec has a cycle (steps depend on each other circularly)");
	return ordered;
}
/**
* The host-side pipeline engine. Constructed in index.ts with all live
* dependencies (canvas, getProvider, resolveCwd, ...) and passed to
* registerTools so the 5 aigc_pipeline_* tools can call its methods.
*/
var PipelineEngine = class {
	deps;
	running = /* @__PURE__ */ new Map();
	constructor(deps) {
		this.deps = deps;
	}
	/**
	* Create a new pipeline state from a spec + optional template params.
	* Validates the spec, applies template substitution, persists the initial
	* state to disk, and returns it. Does NOT start execution — call `run`
	* separately (the aigc_pipeline_run tool decides whether to await it
	* based on the `async` parameter).
	*/
	async start(sessionId, spec, params) {
		const pipelineId = `pipe_${randomUUID()}`;
		const cwd = this.deps.resolveCwd(sessionId);
		const resolvedSpec = applyTemplateParams(spec, params);
		validateSpec(resolvedSpec);
		topologicalSort(resolvedSpec.steps);
		const state = {
			pipeline_id: pipelineId,
			session_id: sessionId,
			name: resolvedSpec.name,
			status: "running",
			started_at: Date.now(),
			spec: resolvedSpec,
			steps: resolvedSpec.steps.map((s) => ({
				id: s.id,
				status: "pending"
			}))
		};
		await persistState(state, cwd);
		return state;
	}
	/**
	* Execute a pipeline to completion. Used by aigc_pipeline_run (async=false)
	* and aigc_pipeline_resume. The provided AbortController is the only
	* cancellation handle — aigc_pipeline_cancel looks it up via the in-memory
	* running map and calls .abort() on it.
	*/
	async run(state, abort) {
		const cwd = this.deps.resolveCwd(state.session_id);
		this.running.set(state.pipeline_id, {
			state,
			abort
		});
		try {
			await this.runToCompletion(state, cwd, abort);
		} finally {
			this.running.delete(state.pipeline_id);
		}
		await persistState(state, cwd);
		return state;
	}
	/** Query the current state of one pipeline (in-memory first, then disk). */
	async status(sessionId, pipelineId) {
		const running = this.running.get(pipelineId);
		if (running !== void 0) return running.state;
		const state = await loadState(this.deps.resolveCwd(sessionId), sessionId, pipelineId);
		if (state === void 0) throw new AigcError("not-found", `pipeline "${pipelineId}" not found in session "${sessionId}"`, 404);
		return state;
	}
	/**
	* Resume a paused/failed pipeline from its breakpoint (doc §6).
	*
	* - Loads the persisted state from disk.
	* - Applies `step_overrides` to the spec (e.g. swap a step's provider_id).
	* - Resets failed/skipped/pending steps back to 'pending' (completed steps
	*   stay completed — their element_path is reused by downstream steps).
	* - Re-runs the engine.
	*/
	async resume(sessionId, pipelineId, overrides) {
		const cwd = this.deps.resolveCwd(sessionId);
		const existing = await loadState(cwd, sessionId, pipelineId);
		if (existing === void 0) throw new AigcError("not-found", `pipeline "${pipelineId}" not found in session "${sessionId}"`, 404);
		if (this.running.has(pipelineId)) throw new AigcError("bad-request", `pipeline "${pipelineId}" is already running`);
		if (overrides !== void 0) existing.spec = applyStepOverrides(existing.spec, overrides);
		for (const step of existing.steps) if (step.status !== "completed") {
			step.status = "pending";
			step.error = void 0;
			step.started_at = void 0;
			step.finished_at = void 0;
			step.element_path = void 0;
		}
		existing.status = "running";
		existing.finished_at = void 0;
		await persistState(existing, cwd);
		const abort = new AbortController();
		return this.run(existing, abort);
	}
	/**
	* Cancel a running pipeline. Aborts the in-flight AbortController and
	* returns the count of steps that had already completed. If the pipeline
	* isn't currently running, returns the persisted completed count and
	* `cancelled: false` (idempotent — caller can treat both as "stopped").
	*/
	async cancel(sessionId, pipelineId, keepArtifacts) {
		const entry = this.running.get(pipelineId);
		if (entry === void 0) {
			const state = await loadState(this.deps.resolveCwd(sessionId), sessionId, pipelineId);
			if (state === void 0) throw new AigcError("not-found", `pipeline "${pipelineId}" not found in session "${sessionId}"`, 404);
			return {
				cancelled: false,
				completed_steps: state.steps.filter((s) => s.status === "completed").length
			};
		}
		entry.abort.abort(/* @__PURE__ */ new Error("pipeline cancelled by user"));
		await new Promise((resolve) => setImmediate(resolve));
		return {
			cancelled: true,
			completed_steps: entry.state.steps.filter((s) => s.status === "completed").length
		};
	}
	/**
	* List all pipelines for one session (running + persisted). The summary
	* excludes the full spec/steps — call aigc_pipeline_status for details.
	*/
	async list(sessionId) {
		const dir = pipelinesDirFor(this.deps.resolveCwd(sessionId), sessionId);
		let files = [];
		try {
			files = await readdir(dir);
		} catch (err) {
			if (!(err !== null && typeof err === "object" && "code" in err && err.code === "ENOENT")) throw err;
		}
		const summaries = [];
		const seen = /* @__PURE__ */ new Set();
		for (const entry of this.running.values()) {
			if (entry.state.session_id !== sessionId) continue;
			if (seen.has(entry.state.pipeline_id)) continue;
			seen.add(entry.state.pipeline_id);
			summaries.push(summarize(entry.state));
		}
		for (const file of files) {
			if (!file.endsWith(".json")) continue;
			const pipelineId = file.slice(0, -5);
			if (seen.has(pipelineId)) continue;
			try {
				const raw = await readFile(join(dir, file), "utf8");
				const state = JSON.parse(raw);
				if (state.session_id !== sessionId) continue;
				seen.add(pipelineId);
				summaries.push(summarize(state));
			} catch {}
		}
		return summaries;
	}
	emitProgress(kind, state, summary) {
		const cb = this.deps.onProgress;
		if (cb === void 0) return;
		try {
			cb({
				pipeline_id: state.pipeline_id,
				session_id: state.session_id,
				kind,
				summary,
				state
			});
		} catch {}
	}
	async runToCompletion(state, cwd, abort) {
		const { signal } = abort;
		const specById = new Map(state.spec.steps.map((s) => [s.id, s]));
		const stepStateById = new Map(state.steps.map((s) => [s.id, s]));
		this.emitProgress("pipeline_started", state, `Pipeline "${state.name}" started: ${state.steps.length} steps`);
		let failedInPipeline = false;
		while (true) {
			if (signal.aborted) break;
			const wave = [];
			for (const step of state.steps) {
				if (step.status !== "pending") continue;
				const spec = specById.get(step.id);
				if (spec.when !== void 0 && spec.when !== "" && !evaluateWhen(spec.when, stepStateById)) {
					step.status = "skipped";
					step.finished_at = Date.now();
					continue;
				}
				const inputs = spec.inputs ?? [];
				let ready = true;
				for (const input of inputs) {
					if (stepStateById.get(input.from).status === "completed") continue;
					ready = false;
					break;
				}
				if (ready) wave.push(step);
			}
			if (wave.length === 0) break;
			for (const step of wave) {
				step.status = "running";
				step.started_at = Date.now();
				const idx = state.steps.findIndex((s) => s.id === step.id) + 1;
				this.emitProgress("step_started", state, `[${idx}/${state.steps.length}] Running step "${step.id}"...`);
			}
			await persistState(state, cwd);
			await Promise.all(wave.map(async (step) => {
				const spec = specById.get(step.id);
				try {
					const result = await this.executeStep(state.session_id, spec, stepStateById, cwd, signal);
					step.status = "completed";
					step.element_path = result.filePath;
					step.finished_at = Date.now();
					const idx = state.steps.findIndex((s) => s.id === step.id) + 1;
					this.emitProgress("step_completed", state, `[${idx}/${state.steps.length}] Done: "${step.id}" → ${result.filePath}`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					step.status = "failed";
					step.error = message;
					step.finished_at = Date.now();
					failedInPipeline = true;
					const idx = state.steps.findIndex((s) => s.id === step.id) + 1;
					this.emitProgress("step_failed", state, `[${idx}/${state.steps.length}] FAILED: "${step.id}" (${message}). Resume with aigc_pipeline_resume.`);
				}
			}));
			await persistState(state, cwd);
			if (failedInPipeline && state.spec.onError === "abort") break;
		}
		if (signal.aborted) {
			for (const step of state.steps) if (step.status === "running" || step.status === "pending") {
				step.status = "skipped";
				step.finished_at = Date.now();
			}
			state.status = "cancelled";
			state.finished_at = Date.now();
			this.emitProgress("pipeline_cancelled", state, `Pipeline "${state.name}" cancelled.`);
			return;
		}
		const anyFailed = state.steps.some((s) => s.status === "failed");
		const completedCount = state.steps.filter((s) => s.status === "completed").length;
		if (!anyFailed) {
			state.status = "completed";
			const finalOut = [...state.steps].reverse().find((s) => s.status === "completed" && s.element_path !== void 0)?.element_path ?? "(no final output)";
			this.emitProgress("pipeline_completed", state, `Pipeline "${state.name}" completed: ${completedCount}/${state.steps.length} steps. Final output: ${finalOut}`);
		} else {
			state.status = "failed";
			const failedStep = state.steps.find((s) => s.status === "failed");
			this.emitProgress("pipeline_failed", state, `Pipeline "${state.name}" failed at step "${failedStep?.id ?? "?"}". ${completedCount}/${state.steps.length} steps completed. Resume with aigc_pipeline_resume.`);
		}
		state.finished_at = Date.now();
	}
	async executeStep(sessionId, spec, stepStateById, cwd, signal) {
		signal.throwIfAborted();
		const inputSpecs = spec.inputs ?? [];
		const inputPaths = [];
		const inputRelations = [];
		for (const input of inputSpecs) {
			const dep = stepStateById.get(input.from);
			if (dep === void 0) throw new AigcError("backend-error", `step "${spec.id}" references unknown input step "${input.from}"`);
			if (dep.element_path === void 0) throw new AigcError("backend-error", `input step "${input.from}" has no element_path (status=${dep.status})`);
			inputPaths.push(dep.element_path);
			inputRelations.push({
				path: dep.element_path,
				relation: coerceEdgeRelation(input.relation)
			});
		}
		let result;
		if (spec.capability !== void 0) result = await this.executeCapabilityStep(sessionId, spec.capability, spec.params, spec.provider_id, cwd, signal);
		else if (spec.operation !== void 0) result = await this.executeOperationStep(sessionId, spec.operation, spec.params, inputPaths, cwd, signal);
		else throw new AigcError("bad-request", `step "${spec.id}" has neither capability nor operation`);
		await this.placeAndWire(sessionId, result.filePath, result.kind, spec.params, inputRelations, cwd, spec.id);
		return result;
	}
	/** Execute a capability step: resolve endpoint, call provider, save response. */
	async executeCapabilityStep(sessionId, capability, params, providerId, cwd, signal) {
		const provider = this.deps.getProvider(providerId);
		const cap = capability;
		const endpointSpec = (endpointsByCapability(provider.endpoints).get(cap) ?? [])[0];
		const path = endpointSpec?.path ?? DEFAULT_PATH_FOR_CAPABILITY[capability] ?? "/v1/generate";
		const result = await executeProviderRequest(provider, {
			method: endpointSpec?.method ?? "POST",
			path,
			body: Object.keys(params).length > 0 ? JSON.stringify(params) : void 0
		}, {
			timeoutMs: this.deps.getTimeoutMs(),
			signal
		});
		return this.processResponse(result, endpointSpec, provider, sessionId, cwd, signal);
	}
	/** Execute an operation step: build MediaEditRequest, call ffmpeg. */
	async executeOperationStep(sessionId, operation, params, inputPaths, cwd, signal) {
		if (!MEDIA_EDIT_OPERATIONS.includes(operation)) throw new AigcError("bad-request", `step operation "${operation}" is not a valid MediaEditOperation`);
		const op = operation;
		const outputExt = typeof params.output_ext === "string" && params.output_ext !== "" ? params.output_ext : defaultOutputExtForOperation(op);
		const result = await executeMediaEdit({
			operation: op,
			inputs: inputPaths,
			outputExt,
			...typeof params.start === "number" ? { start: params.start } : {},
			...typeof params.end === "number" ? { end: params.end } : {},
			...typeof params.duration === "number" ? { duration: params.duration } : {},
			...typeof params.speed === "number" ? { speed: params.speed } : {},
			...typeof params.width === "number" ? { width: params.width } : {},
			...typeof params.height === "number" ? { height: params.height } : {},
			...typeof params.fps === "number" ? { fps: params.fps } : {},
			...typeof params.timestamp === "number" ? { timestamp: params.timestamp } : {}
		}, cwd, sessionId, {
			timeoutMs: this.deps.getTimeoutMs(),
			signal
		});
		const kind = outputExt === "png" || outputExt === "jpg" || outputExt === "jpeg" || outputExt === "webp" || outputExt === "gif" ? "image" : outputExt === "mp3" || outputExt === "wav" || outputExt === "flac" || outputExt === "ogg" || outputExt === "m4a" || outputExt === "aac" || outputExt === "opus" ? "audio" : outputExt === "txt" || outputExt === "json" ? "prompt" : "video";
		return {
			filePath: result.outputPath,
			kind
		};
	}
	/**
	* Process a provider response into a saved file on disk. Handles:
	*   - binary responses (image/video/audio) → save bytes
	*   - JSON responses with OpenAI b64_json format → extract + save
	*   - spec-driven b64_json_field / url_field extraction
	*   - text/JSON fallback → save as prompt element
	*/
	async processResponse(result, spec, provider, sessionId, cwd, signal) {
		if (!result.ok) throw new AigcError("backend-error", `provider returned HTTP ${result.status}: ${result.text.slice(0, 200)}`, result.status >= 400 && result.status < 500 ? 400 : 502);
		switch (result.kind) {
			case "json":
			case "text": {
				if (result.kind === "json" && spec !== void 0) {
					const specResult = await this.processBySpec(spec, result.text, provider, sessionId, cwd, signal);
					if (specResult !== null) return specResult;
				}
				if (result.kind === "json") {
					const openAi = extractOpenAIB64Image$1(result.text);
					if (openAi !== null) return {
						filePath: await saveBytesToCanvas(openAi.bytes, openAi.ext, sessionId, cwd),
						kind: "image"
					};
				}
				const ext = result.kind === "json" ? "json" : "txt";
				return {
					filePath: await saveBytesToCanvas(Buffer.from(result.text, "utf8"), ext, sessionId, cwd),
					kind: "prompt"
				};
			}
			default: {
				const ext = extensionForBinaryKind$1(result.kind, result.contentType);
				return {
					filePath: await saveBytesToCanvas(result.bytes, ext, sessionId, cwd),
					kind: result.kind === "other" ? "prompt" : result.kind
				};
			}
		}
	}
	/**
	* Spec-driven response extraction. Handles b64_json_array, b64_json_field,
	* and url_field response kinds (per EndpointSpec.response). Returns null
	* for binary / json_text (caller falls back to the legacy handling).
	*/
	async processBySpec(spec, textBody, provider, sessionId, cwd, signal) {
		const responseKind = spec.response.kind;
		if (responseKind === "json_text" || responseKind === "binary") return null;
		let parsed;
		try {
			parsed = JSON.parse(textBody);
		} catch {
			return null;
		}
		if (responseKind === "b64_json_array" || responseKind === "b64_json_field") {
			const path = spec.response.path;
			if (path === void 0 || path === "") return null;
			const b64 = extractByPath(parsed, path);
			if (typeof b64 !== "string" || b64.length === 0) return null;
			const bytes = Buffer.from(b64, "base64");
			if (bytes.byteLength < 8) return null;
			if (bytes.byteLength > this.deps.getMediaLimit()) throw new AigcError("backend-error", `extracted payload too large (${bytes.byteLength} bytes)`, 413);
			const ext = sniffExtFromBytes(bytes);
			return {
				filePath: await saveBytesToCanvas(bytes, ext, sessionId, cwd),
				kind: ext === "png" || ext === "jpg" || ext === "webp" || ext === "gif" ? "image" : "prompt"
			};
		}
		if (responseKind === "url_field") {
			const path = spec.response.path;
			if (path === void 0 || path === "") return null;
			const url = extractByPath(parsed, path);
			if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
			const downloadResult = await executeProviderRequest(provider, {
				method: "GET",
				path: url
			}, {
				timeoutMs: this.deps.getTimeoutMs(),
				signal
			});
			if (!downloadResult.ok || downloadResult.kind === "json" || downloadResult.kind === "text") return null;
			const dlBytes = downloadResult.bytes;
			const dlSize = downloadResult.size;
			const dlKind = downloadResult.kind;
			const dlContentType = downloadResult.contentType;
			const ext = extensionForBinaryKind$1(dlKind, dlContentType);
			if (dlSize > this.deps.getMediaLimit()) throw new AigcError("backend-error", `downloaded payload too large (${dlSize} bytes)`, 413);
			return {
				filePath: await saveBytesToCanvas(dlBytes, ext, sessionId, cwd),
				kind: dlKind === "other" ? "prompt" : dlKind
			};
		}
		return null;
	}
	/**
	* Place a produced file on the canvas + wire edges from each input element.
	* Mirrors what aigc_canvas_place does, but without the description/title
	* requirements (the pipeline engine doesn't go through the tool layer).
	*/
	async placeAndWire(sessionId, filePath, kind, params, inputRelations, cwd, stepId) {
		const promptText = typeof params.prompt === "string" ? params.prompt : typeof params.text === "string" ? params.text : void 0;
		const referenceUuids = [];
		for (const input of inputRelations) try {
			const el = this.deps.canvas.getElementByPath(sessionId, input.path);
			referenceUuids.push(el.uuid);
		} catch {}
		const placed = await this.deps.canvas.placeFile(sessionId, {
			kind,
			filePath,
			title: stepId,
			producedBy: "aigc_pipeline",
			...promptText !== void 0 ? { promptText } : {},
			referenceUuids: referenceUuids.length > 0 ? referenceUuids : void 0
		}, cwd);
		if (referenceUuids.length > 0) {
			const edges = [];
			for (let i = 0; i < inputRelations.length; i++) {
				const refUuid = referenceUuids[i];
				if (refUuid === void 0) continue;
				edges.push({
					uuid: refUuid,
					relation: inputRelations[i].relation
				});
			}
			if (edges.length > 0) await this.deps.canvas.wireEdges(sessionId, edges, placed.uuid);
		}
	}
};
/** Sniff a buffer's magic bytes to determine the file extension. */
function sniffExtFromBytes(bytes) {
	if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "png";
	if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
	if (bytes.byteLength >= 12 && bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") return "webp";
	if (bytes.slice(0, 6).toString("ascii") === "GIF89a" || bytes.slice(0, 6).toString("ascii") === "GIF87a") return "gif";
	return "png";
}
/** Mutable templates root (overridable by tests via {@link setTemplatesDir}). */
let templatesDir = join(homedir(), ".dsh", "aigc-canvas", "templates");
/** Resolve a path inside the templates root. */
function tplPath(...segments) {
	return join(templatesDir, ...segments);
}
/** Validate a template name (filename-safe, no path traversal). */
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
function validateTemplateName(name) {
	if (typeof name !== "string" || !NAME_PATTERN.test(name)) throw new AigcError("bad-request", `invalid template name "${name}"; must be lowercase-hyphenated, start with a letter (e.g. "my-template-1")`);
}
/** Atomic write: mkdir + temp file + rename (mirrors asset-library.ts). */
async function writeJsonAtomic(path, value) {
	const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
	try {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
		await rename(tmp, path);
	} catch {}
}
/**
* The 5 built-in templates shipped with the plugin (doc §7).
* These live in source, not on disk — `listTemplates` and `getTemplate`
* merge them with any user-saved templates. A user can shadow a built-in
* by saving a template with the same name (the disk copy wins).
*/
const BUILTIN_TEMPLATES = [
	{
		name: "simple-t2i",
		description: "单步文生图（教学用）：输入 prompt 生成一张图。",
		params: [{
			name: "prompt",
			type: "string",
			required: true,
			description: "图像描述"
		}, {
			name: "size",
			type: "string",
			required: false,
			default: "1024x1024",
			description: "图像尺寸"
		}],
		spec: {
			name: "simple-t2i ({{prompt}})",
			onError: "abort",
			steps: [{
				id: "image",
				capability: "t2i",
				params: {
					prompt: "{{prompt}}",
					size: "{{size}}"
				}
			}]
		}
	},
	{
		name: "simple-t2v",
		description: "单步文生视频：输入 prompt 生成一段视频。",
		params: [{
			name: "prompt",
			type: "string",
			required: true,
			description: "视频描述"
		}, {
			name: "duration",
			type: "number",
			required: false,
			default: 5,
			description: "视频时长（秒）"
		}],
		spec: {
			name: "simple-t2v ({{prompt}})",
			onError: "abort",
			steps: [{
				id: "video",
				capability: "t2v",
				params: {
					prompt: "{{prompt}}",
					duration: "{{duration}}"
				}
			}]
		}
	},
	{
		name: "first-last-frame-video",
		description: "首尾帧生视频：先生成首帧和尾帧两张图，再用 fl2v 合成过渡视频。",
		params: [
			{
				name: "first_frame_prompt",
				type: "string",
				required: true,
				description: "首帧描述"
			},
			{
				name: "last_frame_prompt",
				type: "string",
				required: true,
				description: "尾帧描述"
			},
			{
				name: "transition_prompt",
				type: "string",
				required: false,
				default: "smooth transition",
				description: "过渡描述"
			}
		],
		spec: {
			name: "first-last-frame-video",
			onError: "abort",
			steps: [
				{
					id: "first_frame",
					capability: "t2i",
					params: {
						prompt: "{{first_frame_prompt}}, studio lighting",
						size: "1024x1024"
					}
				},
				{
					id: "last_frame",
					capability: "t2i",
					params: {
						prompt: "{{last_frame_prompt}}, studio lighting",
						size: "1024x1024"
					}
				},
				{
					id: "video",
					capability: "fl2v",
					inputs: [{
						from: "first_frame",
						relation: "first_frame"
					}, {
						from: "last_frame",
						relation: "last_frame"
					}],
					params: { prompt: "{{transition_prompt}}" }
				}
			]
		}
	},
	{
		name: "30s-product-ad",
		description: "30 秒产品广告片完整流程：产品图 → 动起来 → 配音 → 合成 → 剪辑。",
		params: [
			{
				name: "product_name",
				type: "string",
				required: true,
				description: "产品名"
			},
			{
				name: "tagline",
				type: "string",
				required: true,
				description: "旁白文案"
			},
			{
				name: "voice",
				type: "string",
				required: false,
				default: "male_en",
				description: "配音音色"
			}
		],
		spec: {
			name: "30s product ad for {{product_name}}",
			onError: "abort",
			steps: [
				{
					id: "product_img",
					capability: "t2i",
					params: {
						prompt: "product photo of {{product_name}}, studio lighting",
						size: "1024x1024"
					}
				},
				{
					id: "animated",
					capability: "i2v",
					inputs: [{
						from: "product_img",
						relation: "first_frame"
					}],
					params: {
						prompt: "smooth camera pan around the product",
						duration: 5
					}
				},
				{
					id: "narration",
					capability: "tts",
					params: {
						text: "{{tagline}}",
						voice: "{{voice}}"
					}
				},
				{
					id: "with_audio",
					operation: "add_audio",
					inputs: [{ from: "animated" }, {
						from: "narration",
						relation: "audio_track"
					}],
					params: {}
				},
				{
					id: "final_30s",
					operation: "clip",
					inputs: [{ from: "with_audio" }],
					params: {
						start: 0,
						end: 30
					}
				}
			]
		}
	},
	{
		name: "multi-angle-product",
		description: "多角度产品图：生成 3 张不同角度的产品图，再用 images_to_video 拼成展示视频。",
		params: [{
			name: "product",
			type: "string",
			required: true,
			description: "产品名"
		}, {
			name: "fps",
			type: "number",
			required: false,
			default: 2,
			description: "展示视频帧率"
		}],
		spec: {
			name: "multi-angle-product ({{product}})",
			onError: "abort",
			steps: [
				{
					id: "front",
					capability: "t2i",
					params: {
						prompt: "front view of {{product}}, studio lighting",
						size: "1024x1024"
					}
				},
				{
					id: "side",
					capability: "t2i",
					params: {
						prompt: "side view of {{product}}, studio lighting",
						size: "1024x1024"
					}
				},
				{
					id: "back",
					capability: "t2i",
					params: {
						prompt: "back view of {{product}}, studio lighting",
						size: "1024x1024"
					}
				},
				{
					id: "showcase",
					operation: "images_to_video",
					inputs: [
						{ from: "front" },
						{ from: "side" },
						{ from: "back" }
					],
					params: { fps: "{{fps}}" }
				}
			]
		}
	}
];
/** Look up a built-in template by name. */
function builtinByName(name) {
	return BUILTIN_TEMPLATES.find((t) => t.name === name);
}
/** Replace `{{param_name}}` placeholders in a string with values from `params`. */
function substituteTemplate(value, params) {
	return value.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, (whole, name) => {
		const v = params[name];
		return typeof v === "string" ? v : whole;
	});
}
/** Deep-walk a structure and apply `{{param}}` substitution to every string. */
function applyTemplateToValue(value, params) {
	if (typeof value === "string") return substituteTemplate(value, params);
	if (Array.isArray(value)) return value.map((item) => applyTemplateToValue(item, params));
	if (value !== null && typeof value === "object") {
		const out = {};
		for (const [k, v] of Object.entries(value)) out[k] = applyTemplateToValue(v, params);
		return out;
	}
	return value;
}
/**
* Validate the caller-supplied params against a template's ParamSpec list
* and produce a `Record<string, string>` ready for substitution. Required
* params without a value AND without a default throw. Missing optional
* params with a default are filled in. Coerces numbers/booleans to strings
* (the substitution function only handles string values — the resolved
* PipelineSpec's params object can then be re-typed by the engine).
*/
function resolveTemplateParams(template, callerParams) {
	const out = {};
	const seen = /* @__PURE__ */ new Set();
	for (const decl of template.params) {
		seen.add(decl.name);
		const raw = callerParams?.[decl.name];
		if (raw === void 0) {
			if (decl.default !== void 0) {
				out[decl.name] = String(decl.default);
				continue;
			}
			if (decl.required) throw new AigcError("bad-request", `missing required template param "${decl.name}" (template "${template.name}")`);
			continue;
		}
		if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
			out[decl.name] = String(raw);
			continue;
		}
		throw new AigcError("bad-request", `template param "${decl.name}" must be a ${decl.type} (got ${typeof raw})`);
	}
	for (const key of Object.keys(callerParams ?? {})) if (!seen.has(key)) throw new AigcError("bad-request", `unknown template param "${key}" (template "${template.name}" declares: ${[...seen].join(", ") || "(none)"})`);
	return out;
}
/**
* Substitute the resolved param values into a template's spec, returning a
* fresh PipelineSpec with all `{{param}}` placeholders replaced (or left
* in place when the param was optional + no value + no default).
*/
function instantiateTemplateSpec(template, params) {
	const resolved = resolveTemplateParams(template, params);
	return applyTemplateToValue(template.spec, resolved);
}
/** Read one user-saved template from disk. Returns undefined when absent. */
async function loadUserTemplate(name) {
	validateTemplateName(name);
	let raw;
	try {
		raw = await readFile(tplPath(`${name}.json`), "utf8");
	} catch (err) {
		if (err !== null && typeof err === "object" && "code" in err && err.code === "ENOENT") return;
		throw err;
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new AigcError("backend-error", `template file "${name}.json" is malformed JSON`);
	}
	assertTemplateShape(parsed, name);
	return parsed;
}
/** Type-guard the persisted JSON shape. Throws AigcError on malformed files. */
function assertTemplateShape(v, name) {
	if (typeof v !== "object" || v === null) throw new AigcError("backend-error", `template "${name}": expected an object`);
	const o = v;
	if (typeof o.name !== "string" || o.name === "") throw new AigcError("backend-error", `template "${name}": missing or invalid "name"`);
	if (typeof o.description !== "string") throw new AigcError("backend-error", `template "${name}": missing or invalid "description"`);
	if (!Array.isArray(o.params)) throw new AigcError("backend-error", `template "${name}": "params" must be an array`);
	if (typeof o.spec !== "object" || o.spec === null || Array.isArray(o.spec)) throw new AigcError("backend-error", `template "${name}": "spec" must be a PipelineSpec object`);
}
/**
* List all available templates: built-in + user-saved on disk.
* A user-saved template shadows a built-in of the same name (the disk
* copy wins). Returns alphabetically sorted by name.
*/
async function listTemplates() {
	const byName = /* @__PURE__ */ new Map();
	for (const t of BUILTIN_TEMPLATES) byName.set(t.name, {
		spec: t,
		source: "built-in"
	});
	let files = [];
	try {
		files = await readdir(tplPath());
	} catch (err) {
		if (!(err !== null && typeof err === "object" && "code" in err && err.code === "ENOENT")) throw err;
	}
	for (const file of files) {
		if (!file.endsWith(".json")) continue;
		const name = file.slice(0, -5);
		if (!NAME_PATTERN.test(name)) continue;
		try {
			const raw = await readFile(tplPath(file), "utf8");
			const parsed = JSON.parse(raw);
			assertTemplateShape(parsed, name);
			byName.set(name, {
				spec: parsed,
				source: "user"
			});
		} catch {}
	}
	const summaries = [];
	for (const [name, { spec, source }] of byName) summaries.push({
		name,
		description: spec.description,
		source,
		param_count: spec.params.length,
		step_count: spec.spec.steps.length,
		params: spec.params.map((p) => ({
			name: p.name,
			type: p.type,
			required: p.required
		}))
	});
	summaries.sort((a, b) => a.name.localeCompare(b.name));
	return summaries;
}
/**
* Get one template's full spec + param declarations (built-in or user-saved).
* Throws not-found when the name doesn't match any template.
*/
async function getTemplate(name) {
	validateTemplateName(name);
	const user = await loadUserTemplate(name);
	if (user !== void 0) return {
		...user,
		source: "user"
	};
	const builtin = builtinByName(name);
	if (builtin !== void 0) return {
		...builtin,
		source: "built-in"
	};
	throw new AigcError("not-found", `template "${name}" not found (call aigc_template_list to see available templates)`, 404);
}
/**
* Persist a template to disk as `<name>.json` under the templates root.
* Overwrites an existing template with the same name. Built-in names are
* allowed (the user file shadows the built-in at read time).
*/
async function saveTemplate(template) {
	validateTemplateName(template.name);
	assertTemplateShape(template, template.name);
	const filePath = tplPath(`${template.name}.json`);
	await writeJsonAtomic(filePath, template);
	return {
		name: template.name,
		source: "user",
		file_path: filePath
	};
}
//#endregion
//#region src/tools.ts
/**
* The ten model-facing AIGC canvas tools.
*
* Generation is provider-agnostic:
*   aigc_get_provider_info             — list configured providers (id, name,
*                                        endpoint, instructions PREVIEW, stub flag).
*                                        Call this FIRST. The provider apiKey is
*                                        NEVER shown; it is attached automatically
*                                        by aigc_http_request.
*   aigc_http_request                  — send an HTTP request to a provider's API
*                                        (endpoint + apiKey auto-attached). Binary
*                                        responses (image/video/audio) are saved
*                                        to disk and returned as a filePath;
*                                        JSON/text responses are returned inline
*                                        (saved to a file when too large).
*   aigc_provider_set_instructions     — record the provider's 调用说明 (how to
*                                        call the API: endpoints, params, auth)
*                                        so future sessions can use the provider.
*   aigc_provider_get_instructions     — fetch the FULL instructions for one
*                                        provider (aigc_get_provider_info only
*                                        shows a short preview).
*   aigc_reroll                        — re-generate an element based on its
*                                        meta.originalRequest, applying an optional
*                                        patch (seed/prompt_delta/prompt_replace/
*                                        size/...). Auto-wires variation_of or
*                                        remix_of edge from the source.
*   aigc_canvas_place                  — place a file (typically the filePath
*                                        aigc_http_request returned) onto the free
*                                        canvas at position (x, y); optionally
*                                        records the prompt/params (shown on
*                                        double-click) and auto-wires edges from
*                                        reference elements.
*   aigc_canvas_link / unlink          — create / remove an edge between two
*                                        elements (filePath-addressed).
*   aigc_canvas_list_elements          — snapshot of the session's canvas.
*   aigc_media_edit                    — ffmpeg-based media editing (concat,
*                                        clip, extract_audio, etc.).
*
* Element identity:
*   Every element (prompt / image / video / audio) is identified by its
*   `filePath` on disk — tools return filePath (not uuid), and tools
*   accept filePath when referencing existing elements. The filePath is
*   an absolute path under `<cwd>/.dsh-aigc-canvas/<sessionId>/`.
*/
/** Maximum length of a prompt title (derived from the prompt text). */
const TITLE_MAX = 80;
/** Truncate a prompt to a short title (first line, capped). */
function titleOf(prompt) {
	const firstLine = prompt.split(/\r?\n/, 1)[0] ?? "";
	if (firstLine.length <= TITLE_MAX) return firstLine;
	return `${firstLine.slice(0, 79)}…`;
}
/** Pure text projection helper. */
function textRender(fn) {
	return (_args, value) => [{
		type: "text",
		text: fn(value)
	}];
}
/** Extract the calling agent or throw the canonical "no agent" error. */
function requireAgent(agent) {
	if (agent === void 0) throw new Error("aigc canvas tools require an initiating agent");
	return agent;
}
/** Resolve the calling agent's session id. */
function sessionIdOf(exec) {
	return requireAgent(exec.agent).session.id;
}
/**
* The model-facing shape of one element (no internal uuid, no media bytes).
* The `filePath` is the primary identifier the agent uses to reference
* the element in subsequent tool calls; `x`/`y` are the canvas position.
*/
function elementProjection(el) {
	return {
		filePath: el.filePath,
		kind: el.kind,
		title: el.title,
		x: el.x,
		y: el.y,
		createdAt: el.createdAt,
		producedBy: el.producedBy,
		status: el.status,
		...el.winner !== void 0 ? { winner: el.winner } : {},
		...el.promptText !== void 0 ? { promptText: el.promptText } : {},
		...el.mediaSize !== void 0 ? { mediaSize: el.mediaSize } : {},
		...el.meta !== void 0 ? { meta: el.meta } : {}
	};
}
/**
* Summarized element projection: omits meta/promptText/mediaSize to keep
* the agent's context small in long pipelines (per doc 02 §11 risk mitigation).
*/
function elementProjectionSummarized(el) {
	return {
		filePath: el.filePath,
		kind: el.kind,
		title: el.title,
		x: el.x,
		y: el.y,
		status: el.status,
		...el.winner !== void 0 ? { winner: el.winner } : {}
	};
}
/** Edge projection: resolve uuids to filePaths so the agent can read the graph. */
function edgeProjection(edge, lookup) {
	return {
		source: lookup(edge.source)?.filePath ?? edge.source,
		target: lookup(edge.target)?.filePath ?? edge.target,
		relation: coerceEdgeRelation(edge.relation),
		...edge.note !== void 0 ? { note: edge.note } : {}
	};
}
/** The `provider_id` parameter spec (shared by provider-scoped tools). */
const providerIdParam = {
	type: "string",
	description: "The provider id to use (call aigc_get_provider_info to list available providers). If omitted, the default (first) provider is used."
};
/**
* Cap on how many characters of a provider's `instructions` are inlined
* into `aigc_get_provider_info` output. The full text is fetched on
* demand via `aigc_provider_get_instructions`. Picked to keep the
* provider list compact when there are many providers, while still
* giving the model enough to recognize an already-initialized provider.
*/
const INSTRUCTIONS_PREVIEW_CHARS = 200;
/**
* Maximum byte length of one provider's `instructions` string. Picked
* to fit a structured catalog for a multi-endpoint provider (t2i/t2v/
* tts/edit) without being so large that one verbose provider starves
* the rest of the context window.
*/
const INSTRUCTIONS_MAX_CHARS = 1e3;
/** Build the `instructions` preview string + total char count for one provider. */
function instructionsPreviewOf(instructions) {
	const totalChars = instructions.length;
	if (totalChars <= INSTRUCTIONS_PREVIEW_CHARS) return {
		preview: instructions,
		totalChars
	};
	return {
		preview: `${instructions.slice(0, INSTRUCTIONS_PREVIEW_CHARS)}… (${totalChars} chars total — call aigc_provider_get_instructions to read the full text)`,
		totalChars
	};
}
/** File extension for one binary kind produced by the http tool. */
function extensionForBinaryKind(kind, contentType) {
	const subtype = contentType.split(";")[0]?.trim().split("/")[1]?.toLowerCase() ?? "";
	switch (kind) {
		case "image": return [
			"png",
			"jpeg",
			"jpg",
			"webp",
			"gif"
		].includes(subtype) ? subtype : "png";
		case "video": return [
			"mp4",
			"webm",
			"mov",
			"ogg",
			"m4v"
		].includes(subtype) ? subtype : "mp4";
		case "audio": return [
			"mp3",
			"wav",
			"flac",
			"ogg",
			"m4a",
			"aac",
			"opus"
		].includes(subtype) ? subtype : "mp3";
		case "other": return "bin";
	}
}
/**
* Detect the OpenAI image-generation JSON response format and extract the
* base64-encoded image bytes from it:
*
*   { "created": 1234, "data": [{ "b64_json": "<base64>" }] }
*
* Returns null when the text is not this shape, so the caller can fall
* through to normal inline-text handling. Sniffs the decoded magic bytes
* to pick the right file extension (png / jpeg / webp / gif).
*/
function extractOpenAIB64Image(text) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const data = parsed.data;
	if (!Array.isArray(data) || data.length === 0) return null;
	const first = data[0];
	if (typeof first !== "object" || first === null) return null;
	const b64 = first.b64_json;
	if (typeof b64 !== "string" || b64.length === 0) return null;
	const bytes = Buffer.from(b64, "base64");
	if (bytes.byteLength < 8) return null;
	if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return {
		bytes,
		ext: "png",
		contentType: "image/png"
	};
	if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return {
		bytes,
		ext: "jpg",
		contentType: "image/jpeg"
	};
	if (bytes.byteLength >= 12 && bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") return {
		bytes,
		ext: "webp",
		contentType: "image/webp"
	};
	if (bytes.slice(0, 6).toString("ascii") === "GIF89a" || bytes.slice(0, 6).toString("ascii") === "GIF87a") return {
		bytes,
		ext: "gif",
		contentType: "image/gif"
	};
	return {
		bytes,
		ext: "png",
		contentType: "image/png"
	};
}
/** Resolve the canvas kind for a placed file from its extension (or explicit). */
function kindForFile(filePath, kind) {
	if (kind !== void 0) {
		if (kind === "image" || kind === "video" || kind === "audio" || kind === "prompt") return kind;
		throw new AigcError("bad-request", `invalid kind "${kind}"; expected image, video, audio, or prompt`);
	}
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	if ([
		"png",
		"jpg",
		"jpeg",
		"webp",
		"gif",
		"bmp",
		"svg"
	].includes(ext)) return "image";
	if ([
		"mp4",
		"webm",
		"mov",
		"m4v",
		"ogv"
	].includes(ext)) return "video";
	if ([
		"mp3",
		"wav",
		"flac",
		"ogg",
		"m4a",
		"aac",
		"opus"
	].includes(ext)) return "audio";
	if (ext === "txt") return "prompt";
	throw new AigcError("bad-request", `cannot infer the element kind from "${filePath}"; pass the explicit kind parameter`);
}
/**
* Coerce the model-supplied `meta` argument into a plain object. The schema
* declares `type: 'json'` so the model may pass a stringified JSON blob by
* mistake; we parse it defensively. Non-object values (numbers, arrays,
* null) are dropped — meta is documented as a JSON object.
*/
function coerceMeta(meta) {
	if (meta === void 0 || meta === null) return void 0;
	if (typeof meta === "string") {
		if (meta.length === 0) return void 0;
		try {
			const parsed = JSON.parse(meta);
			return isPlainObject(parsed) ? parsed : void 0;
		} catch {
			return;
		}
	}
	return isPlainObject(meta) ? meta : void 0;
}
function isPlainObject(v) {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}
/**
* Walk a JSON body and replace `{"$base64": "<path>"}` placeholders with
* the base64-encoded file content, and `{"$data_uri": "<path>"}` with a
* full data URI string (`data:<mime>;base64,...`). The path must be inside
* the session canvas directory (security boundary).
*
* This lets the model reference canvas elements by file_path when an API
* expects base64 image data in the request body — without the model having
* to read or encode the file itself.
*/
async function expandBase64Placeholders(value, sessionId, cwd) {
	if (isPlainObject(value)) {
		const b64Path = value.$base64;
		if (typeof b64Path === "string") return await readAsBase64(b64Path, cwd, false);
		const dataUriPath = value.$data_uri;
		if (typeof dataUriPath === "string") return await readAsBase64(dataUriPath, cwd, true);
		const result = {};
		for (const [key, val] of Object.entries(value)) result[key] = await expandBase64Placeholders(val, sessionId, cwd);
		return result;
	}
	if (Array.isArray(value)) return Promise.all(value.map((item) => expandBase64Placeholders(item, sessionId, cwd)));
	return value;
}
/** Read a file, validate it's in the canvas dir, return base64 (or data URI). */
async function readAsBase64(filePath, cwd, asDataUri) {
	canvasDirFor(cwd, "");
	const resolved = isAbsolute(filePath) ? filePath : join(cwd, filePath);
	const canvasRoot = canvasDirFor(cwd, "");
	const normalizedRoot = canvasRoot.endsWith(sep) ? canvasRoot : `${canvasRoot}${sep}`;
	const a = resolved.toLowerCase();
	const b = normalizedRoot.toLowerCase();
	if (!a.startsWith(b)) throw new AigcError("bad-request", `$base64 file must be inside the session canvas directory: ${filePath}`);
	const info = await stat(resolved).catch(() => void 0);
	if (info === void 0 || !info.isFile()) throw new AigcError("bad-request", `$base64 file not found or not a regular file: ${filePath}`);
	const b64 = (await readFile(resolved)).toString("base64");
	if (!asDataUri) return b64;
	return `data:${mimeFromExt(filePath)};base64,${b64}`;
}
/** Infer a MIME type from a file extension (for data URIs). */
function mimeFromExt(filePath) {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	if (ext === "png") return "image/png";
	if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
	if (ext === "webp") return "image/webp";
	if (ext === "gif") return "image/gif";
	if (ext === "mp4") return "video/mp4";
	if (ext === "webm") return "video/webm";
	if (ext === "mp3") return "audio/mpeg";
	if (ext === "wav") return "audio/wav";
	return "application/octet-stream";
}
/** Assessment dimensions used by `aigc_assess` when the caller omits `dimensions`. */
const DEFAULT_ASSESS_DIMENSIONS = [
	"prompt_match",
	"quality",
	"sfw"
];
/** Allowed `recommendation` values returned by `aigc_assess`. */
const ASSESS_RECOMMENDATIONS = [
	"accept",
	"reroll",
	"reroll_with_adjustments"
];
/** Clamp a number into [lo, hi]. */
function clamp(n, lo, hi) {
	if (!Number.isFinite(n)) return lo;
	return Math.max(lo, Math.min(hi, n));
}
/**
* Extract the assistant message content from an OpenAI-shaped chat completion
* response body: `{ choices: [{ message: { content } }] }`. Returns '' when
* the shape doesn't match (so the caller can surface a clear error rather
* than silently parsing an empty string).
*/
function extractChatContent(responseText) {
	let parsed;
	try {
		parsed = JSON.parse(responseText);
	} catch {
		return "";
	}
	if (typeof parsed !== "object" || parsed === null) return "";
	const choices = parsed.choices;
	if (!Array.isArray(choices) || choices.length === 0) return "";
	const first = choices[0];
	if (typeof first !== "object" || first === null) return "";
	const message = first.message;
	if (typeof message !== "object" || message === null) return "";
	const content = message.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.filter((p) => typeof p === "object" && p !== null && p.type === "text" && typeof p.text === "string").map((p) => p.text).join("");
	return "";
}
/**
* Parse the judge's free-form response content as an assessment JSON object.
* Handles three shapes:
*  1. The content IS the JSON object (best case — judge followed instructions).
*  2. The JSON is wrapped in a markdown fenced code block (```json ... ```).
*  3. The JSON is embedded somewhere in the text (first {...} block found).
* Returns null when no JSON object can be recovered.
*/
function parseAssessmentJson(content) {
	const trimmed = content.trim();
	if (trimmed === "") return null;
	const direct = tryJson(trimmed);
	if (direct !== null && typeof direct === "object" && !Array.isArray(direct)) return direct;
	const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenceMatch !== null) {
		const fenced = tryJson(fenceMatch[1].trim());
		if (fenced !== null && typeof fenced === "object" && !Array.isArray(fenced)) return fenced;
	}
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start !== -1 && end !== -1 && end > start) {
		const embedded = tryJson(trimmed.slice(start, end + 1));
		if (embedded !== null && typeof embedded === "object" && !Array.isArray(embedded)) return embedded;
	}
	return null;
}
/** JSON.parse wrapper that returns null on failure instead of throwing. */
function tryJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
/** Coerce an unknown value into a valid `recommendation` enum value (default 'accept'). */
function parseRecommendation(v) {
	if (typeof v === "string" && ASSESS_RECOMMENDATIONS.includes(v)) return v;
	return "accept";
}
/**
* Register the seven tools against the host tool registry.
*
* @param ctx - host plugin context (carries the tools service).
* @param getProvider - live provider getter (takes optional provider id).
* @param setInstructions - persists usage instructions for one provider (the host's ProviderStore).
* @param listProviders - returns info for all providers (for aigc_get_provider_info).
* @param canvas - the canvas registry service (host-owned state).
* @param resolveCwd - live cwd resolver for one session id.
* @param getTimeoutMs - live per-request timeout for aigc_http_request.
* @param getMediaLimit - live cap on bytes the http tool may write to disk.
* @returns a disposer that unregisters all tools.
*/
/**
* Register the tools against the host tool registry.
*
* @param ctx - host plugin context (carries the tools service).
* @param getProvider - live provider getter (takes optional provider id).
* @param setInstructions - persists usage instructions for one provider (the host's ProviderStore).
* @param setEndpoints - persists the structured endpoint catalog for one provider (auto-derives instructions).
* @param listProviders - returns info for all providers (for aigc_get_provider_info).
* @param canvas - the canvas registry service (host-owned state).
* @param resolveCwd - live cwd resolver for one session id.
* @param getTimeoutMs - live per-request timeout for aigc_http_request.
* @param getMediaLimit - live cap on bytes the http tool may write to disk.
* @param pipelineEngine - the PipelineEngine instance for the aigc_pipeline_* tools (per docs/product/02-pipeline.md).
* @returns a disposer that unregisters all tools.
*/
function registerTools(ctx, getProvider, setInstructions, setEndpoints, listProviders, canvas, resolveCwd, getTimeoutMs, getMediaLimit = () => 104857600, pipelineEngine) {
	_getMediaLimit = getMediaLimit;
	const disposers = [];
	const register = (tool) => {
		disposers.push(ctx.tools.register(tool));
	};
	register(defineTool({
		name: "aigc_get_provider_info",
		description: `List all configured AIGC providers with their id, name, endpoint, an instructions PREVIEW, stub status, AND a structured capability summary (capabilities array + priority + qualityHint + costPerCall). Also returns a top-level \`capabilityMap\` grouping providers by capability (sorted by priority) so you can pick the best provider for a given task without parsing natural language. Call this FIRST before generating anything. To use a provider: call aigc_http_request with its id as provider_id — the endpoint and apiKey are attached automatically, so you never need to see or forward the apiKey. When a provider's instructions are empty AND its endpoints are empty, probe its API yourself (aigc_http_request) and then record the catalog via aigc_provider_set_endpoints (preferred) or the legacy aigc_provider_set_instructions. The \`instructions\` field shown here is a PREVIEW (first ${INSTRUCTIONS_PREVIEW_CHARS} chars + total count) — when you need the full instructions (e.g. to recall exact endpoint paths / params for an already-initialized provider), call aigc_provider_get_instructions with the provider_id. For the full structured EndpointSpec[] of one provider+capability, call aigc_get_endpoint_details. When the endpoint is "stub://aigc-backend", aigc_http_request returns synthetic media (no real API calls) — useful for dry runs. Generated files are placed on the canvas with aigc_canvas_place (filePath + position), and elements can be linked with aigc_canvas_link.`,
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					providers: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true,
									description: "The provider id (pass this as provider_id to aigc_http_request)."
								},
								name: {
									type: "string",
									required: true,
									description: "The provider display name."
								},
								endpoint: {
									type: "string",
									required: true,
									description: "The provider API endpoint URL. \"stub://aigc-backend\" = the built-in stub."
								},
								instructions: {
									type: "string",
									required: true,
									description: `Preview of the usage instructions (first ${INSTRUCTIONS_PREVIEW_CHARS} chars + total count). Call aigc_provider_get_instructions for the full text.`
								},
								instructions_total_chars: {
									type: "integer",
									required: true,
									description: "Total character count of the full instructions (0 when uninitialized)."
								},
								isStub: {
									type: "boolean",
									required: true,
									description: "Whether the stub backend is active (no real API calls)."
								},
								isDefault: {
									type: "boolean",
									required: true,
									description: "Whether this is the default provider (used when provider_id is omitted)."
								},
								capabilities: {
									type: "array",
									required: true,
									items: {
										type: "string",
										enum: CAPABILITIES
									},
									description: "Distinct capabilities this provider supports (derived from its endpoints catalog). Empty when the provider uses legacy instructions only."
								},
								endpoint_count: {
									type: "integer",
									required: true,
									description: "Number of structured EndpointSpec entries (0 when using legacy instructions)."
								},
								priority: {
									type: "integer",
									required: true,
									description: "Selection priority (smaller = higher; default 100)."
								},
								qualityHint: {
									type: "string",
									required: true,
									enum: [
										"fast",
										"balanced",
										"quality"
									],
									description: "Quality hint for picking fast vs. quality providers."
								},
								costPerCall: {
									type: "number",
									required: true,
									description: "Cost per call in USD (0 when unknown)."
								}
							}
						}
					},
					capabilityMap: {
						type: "json",
						required: true,
						description: "Providers grouped by capability, sorted by priority (smallest first). Use this to pick the best provider for a task: capabilityMap.t2i[0] is the highest-priority t2i provider. Filter by qualityHint when the user asks for \"high quality\" or \"fast\". Shape: { [capability: string]: Array<{ providerId, priority, qualityHint, costPerCall }> }."
					}
				}
			},
			render: (_args, value) => {
				const v = value;
				if (v.providers.length === 0) return [{
					type: "text",
					text: "No AIGC providers configured. Add one in the settings page."
				}];
				const lines = v.providers.map((p) => {
					const caps = p.capabilities.length > 0 ? ` caps:[${p.capabilities.join(",")}]` : "";
					const pri = ` pri:${p.priority}`;
					const q = ` ${p.qualityHint}`;
					return `  ${p.isDefault ? "* " : "  "}${p.id}  "${p.name || "(unnamed)"}"  endpoint: ${p.endpoint}  stub: ${p.isStub}${caps}${pri}${q}` + (p.instructions !== "" ? `\n    instructions (${p.instructions_total_chars} chars): ${p.instructions}` : "\n    instructions: (empty — probe the API with aigc_http_request, then record them via aigc_provider_set_endpoints)");
				});
				const capMapLines = Object.entries(v.capabilityMap).map(([cap, list]) => `  ${cap}: ${list.map((p) => `${p.providerId}(pri:${p.priority},${p.qualityHint})`).join(" | ") || "(no providers)"}`);
				return [{
					type: "text",
					text: `AIGC providers (${v.providers.length}):\n${lines.join("\n")}\n\nCapability map:\n${capMapLines.join("\n")}\n\nCall aigc_http_request with the desired provider's id; endpoint + apiKey are attached automatically. For full instructions or endpoint details, call aigc_provider_get_instructions / aigc_get_endpoint_details.`
				}];
			}
		},
		execute: async (_args, exec) => {
			exec.signal.throwIfAborted();
			const list = listProviders();
			const providersProjected = list.map((p) => {
				const { preview, totalChars } = instructionsPreviewOf(p.instructions);
				const caps = capabilitiesOf(p.endpoints);
				return {
					id: p.id,
					name: p.name,
					endpoint: p.endpoint,
					instructions: preview,
					instructions_total_chars: totalChars,
					isStub: p.isStub,
					isDefault: p.isDefault,
					capabilities: caps,
					endpoint_count: p.endpoints.length,
					priority: p.priority,
					qualityHint: p.qualityHint,
					costPerCall: p.costPerCall
				};
			});
			const capMap = {};
			for (const p of list) for (const cap of capabilitiesOf(p.endpoints)) {
				if (capMap[cap] === void 0) capMap[cap] = [];
				capMap[cap].push({
					providerId: p.id,
					priority: p.priority,
					qualityHint: p.qualityHint,
					costPerCall: p.costPerCall
				});
			}
			for (const arr of Object.values(capMap)) arr.sort((a, b) => a.priority - b.priority);
			return Promise.resolve({
				providers: providersProjected,
				capabilityMap: capMap
			});
		}
	}));
	register(defineTool({
		name: "aigc_get_endpoint_details",
		description: "Fetch the full structured EndpointSpec[] for one (provider_id, capability) pair. aigc_get_provider_info only returns a capability list (which providers support t2i/t2v/...); this tool returns the detailed endpoint paths, parameter schemas, and response shape declarations you need to construct a correct aigc_http_request call (path, method, params, response handling). Returns an empty array when the provider has no structured catalog for that capability (legacy instructions-only mode) — in that case, call aigc_provider_get_instructions for the free-form text.",
		parameters: {
			provider_id: {
				type: "string",
				required: true,
				description: "The provider id (from aigc_get_provider_info)."
			},
			capability: {
				type: "string",
				required: true,
				enum: CAPABILITIES,
				description: "The capability to fetch endpoint details for (t2i / t2v / tts / ...)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					provider_id: {
						type: "string",
						required: true
					},
					capability: {
						type: "string",
						required: true,
						enum: CAPABILITIES
					},
					endpoints: {
						type: "array",
						required: true,
						description: "EndpointSpec entries for this provider+capability. Empty when the provider uses legacy instructions only.",
						items: { type: "json" }
					}
				}
			},
			render: textRender((v) => v.endpoints.length === 0 ? `Provider "${v.provider_id}" has no structured endpoints for capability "${v.capability}" (legacy instructions-only mode). Call aigc_provider_get_instructions for the free-form text.` : `Provider "${v.provider_id}" capability "${v.capability}" (${v.endpoints.length} endpoint(s)):\n${v.endpoints.map((ep) => `  ${ep.method} ${ep.path} -> ${ep.response.kind}`).join("\n")}`)
		},
		execute: (args) => {
			if (typeof args.provider_id !== "string" || args.provider_id === "") throw new AigcError("bad-request", "provider_id is required");
			if (typeof args.capability !== "string" || !CAPABILITIES.includes(args.capability)) throw new AigcError("bad-request", `capability must be one of: ${CAPABILITIES.join(", ")}`);
			const provider = getProvider(args.provider_id);
			const cap = args.capability;
			const endpoints = endpointsByCapability(provider.endpoints).get(cap) ?? [];
			return Promise.resolve({
				provider_id: args.provider_id,
				capability: cap,
				endpoints
			});
		}
	}));
	register(defineTool({
		name: "aigc_http_request",
		description: "Send one HTTP request to an AIGC provider's API. The provider's configured endpoint and apiKey are attached automatically (you must not pass them; the auth header/param cannot be overridden). The request path is relative to the provider endpoint, e.g. \"/v1/images/generations\"; a same-origin absolute URL (e.g. a provider-returned result_url) is also accepted. Binary responses (image / video / audio) are saved to disk under the session canvas directory and returned as a file_path; JSON/text responses are returned inline (and summarized or saved to a file when large). Non-2xx responses are returned as { ok: false } with the response body AND a sent_body_preview of the request, so you can read API errors and self-diagnose field-loss bugs. To embed a canvas element's file content as base64 in the request body, use the {\"$base64\": \"file_path\"} placeholder inside json_body OR body (both work). After you have a file_path, place it onto the canvas with aigc_canvas_place.",
		parameters: {
			provider_id: providerIdParam,
			method: {
				type: "string",
				description: "HTTP method. Defaults to POST when a body/json_body is provided, else GET.",
				enum: [
					"GET",
					"POST",
					"PUT",
					"PATCH",
					"DELETE"
				]
			},
			path: {
				type: "string",
				required: true,
				description: "Request path relative to the provider endpoint, starting with \"/\", e.g. \"/v1/images/generations\". An absolute URL is also accepted, but only when same-origin with the provider endpoint (same protocol+host+port) — use this to fetch provider-returned download URLs (e.g. a video result_url) that need the provider auth."
			},
			headers: {
				type: "object",
				description: "Extra request headers (string values). The provider auth header/param is attached automatically and cannot be overridden.",
				additionalProperties: true
			},
			query: {
				type: "object",
				description: "URL query parameters (string values), merged with any auth query param.",
				additionalProperties: true
			},
			json_body: {
				type: "json",
				description: "JSON request body as an object/array (preferred), or a JSON string. Serialized automatically. Use either json_body or body, not both. SPECIAL PLACEHOLDERS: to embed a canvas element's file content as base64 inside the JSON, use {\"$base64\": \"<file_path>\"} — the tool reads the file, base64-encodes it, and replaces the placeholder with the resulting string before sending. For a data URI (e.g. \"data:image/png;base64,...\"), use {\"$data_uri\": \"<file_path>\"}. The file_path must be an absolute path inside the session canvas directory (e.g. a file_path returned by a previous aigc_http_request or aigc_canvas_place call). Example: {\"model\":\"t2v\",\"image\":{\"$base64\":\"/path/to/ref.png\"},\"prompt\":\"dance\"}"
			},
			body: {
				type: "string",
				description: "Raw request body string (typically JSON text). Use either json_body or body, not both. The $base64 / $data_uri placeholders (see json_body) are also expanded here when the body is valid JSON — so you can inline binary content in a raw body too. Non-JSON bodies are sent as-is."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true,
						description: "Whether the provider returned 2xx."
					},
					status: {
						type: "integer",
						required: true,
						description: "The HTTP status code."
					},
					kind: {
						type: "string",
						required: true,
						enum: [
							"image",
							"video",
							"audio",
							"other",
							"json",
							"text"
						],
						description: "Response kind. image/video/audio/other = saved to disk (see file_path); json/text = returned inline (see text)."
					},
					content_type: {
						type: "string",
						required: true,
						description: "The response Content-Type header."
					},
					file_path: {
						type: "string",
						description: "Absolute path of the saved binary response (or of an oversized text response). Pass this to aigc_canvas_place."
					},
					file_size: {
						type: "integer",
						description: "Byte size of the saved file (when file_path is set)."
					},
					text: {
						type: "string",
						description: "Inline JSON/text response body (when kind is json or text)."
					},
					error: {
						type: "string",
						description: "Response body of a failed (non-2xx) request, truncated."
					},
					sent_body_preview: {
						type: "string",
						description: "First ~500 bytes of the request body actually sent (set on non-2xx responses, for diagnosing field-loss / encoding bugs)."
					}
				}
			},
			render: (_args, value) => {
				const v = value;
				if (!v.ok) {
					const sent = v.sent_body_preview !== void 0 ? `\n— sent body (first 500 bytes): ${v.sent_body_preview}` : "";
					return [{
						type: "text",
						text: `HTTP ${v.status} (${v.content_type}): ${(v.error ?? "(empty body)").slice(0, 500)}${sent}`
					}];
				}
				if (v.file_path !== void 0 && v.text !== void 0) return [{
					type: "text",
					text: `HTTP ${v.status}: ${v.kind} response truncated (full ${v.file_size} bytes at ${v.file_path}). Preview: ${v.text.slice(0, 300)}`
				}];
				if (v.file_path !== void 0) return [{
					type: "text",
					text: `HTTP ${v.status}: saved ${v.kind} response (${v.file_size} bytes, ${v.content_type}) to ${v.file_path}. Place it with aigc_canvas_place.`
				}];
				return [{
					type: "text",
					text: `HTTP ${v.status} ${v.kind} response: ${v.text ?? ""}`
				}];
			}
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			if (args.json_body !== void 0 && args.body !== void 0) throw new AigcError("bad-request", "pass either json_body or body, not both");
			const sessionId = sessionIdOf(exec);
			const cwd = resolveCwd(sessionId);
			const provider = getProvider(args.provider_id);
			let body;
			let bodyForSnapshot;
			if (args.json_body !== void 0) {
				let jsonValue = args.json_body;
				if (typeof jsonValue === "string") {
					if (jsonValue === "") body = void 0;
					else {
						try {
							jsonValue = JSON.parse(jsonValue);
						} catch (e) {
							throw new AigcError("bad-request", `json_body is a string but not valid JSON: ${e instanceof Error ? e.message : String(e)}. Pass an object/array, or use the body parameter for raw non-JSON text.`);
						}
						bodyForSnapshot = jsonValue;
						const expanded = await expandBase64Placeholders(jsonValue, sessionId, cwd);
						body = JSON.stringify(expanded);
					}
				} else {
					bodyForSnapshot = jsonValue;
					const expanded = await expandBase64Placeholders(jsonValue, sessionId, cwd);
					body = JSON.stringify(expanded);
				}
			} else if (args.body !== void 0) {
				bodyForSnapshot = args.body;
				if (/\$(?:base64|data_uri)\b/.test(args.body)) try {
					const expanded = await expandBase64Placeholders(JSON.parse(args.body), sessionId, cwd);
					body = JSON.stringify(expanded);
				} catch (e) {
					if (e instanceof AigcError) throw e;
					throw new AigcError("bad-request", `body contains $base64/$data_uri placeholders but is not valid JSON: ${e instanceof Error ? e.message : String(e)}. Use json_body for structured payloads with placeholders.`);
				}
				else body = args.body;
			}
			const requestStartedAt = Date.now();
			const method = (args.method ?? (body !== void 0 ? "POST" : "GET")).toUpperCase();
			const dedupWindowMs = 6e4;
			const dedupHit = checkDedup(sessionId, provider.id, method, args.path, body, dedupWindowMs);
			let result;
			if (dedupHit !== void 0) {
				if (dedupHit.kind === "json" || dedupHit.kind === "text") result = {
					ok: true,
					status: dedupHit.status,
					kind: dedupHit.kind,
					contentType: dedupHit.contentType,
					text: dedupHit.text ?? ""
				};
				else result = await executeProviderRequest(provider, {
					method: args.method,
					path: args.path,
					headers: args.headers,
					query: args.query,
					body
				}, {
					timeoutMs: getTimeoutMs(),
					signal: exec.signal
				});
				dedupHit.kind === "json" || dedupHit.kind;
			} else {
				result = (await withRetry(() => executeProviderRequest(provider, {
					method: args.method,
					path: args.path,
					headers: args.headers,
					query: args.query,
					body
				}, {
					timeoutMs: getTimeoutMs(),
					signal: exec.signal
				}), {
					signal: exec.signal,
					isRetryableResult: (r) => !r.ok && isRetryable(r.status),
					getResponseStatus: (r) => r.status
				})).result;
				if (result.ok && (result.kind === "json" || result.kind === "text")) storeDedup(sessionId, provider.id, method, args.path, body, {
					status: result.status,
					contentType: result.contentType,
					kind: result.kind,
					text: result.text
				}, dedupWindowMs);
			}
			const requestDurationMs = Date.now() - requestStartedAt;
			/**
			* Record a RequestSnapshot for one saved file_path so the next
			* aigc_canvas_place call can merge it into meta.originalRequest
			* (enables aigc_reroll without the model having to remember the
			* original request body / params / provider).
			*/
			const recordSnapshot = (filePath, size, kind) => {
				const snapshot = {
					providerId: provider.id,
					method,
					path: args.path,
					...args.query !== void 0 ? { query: args.query } : {},
					...args.headers !== void 0 ? { headers: args.headers } : {},
					...bodyForSnapshot !== void 0 ? { body: bodyForSnapshot } : {},
					responseInfo: {
						status: result.status,
						contentType: result.contentType,
						kind,
						...size !== void 0 ? { size } : {},
						durationMs: requestDurationMs
					}
				};
				recordRequestSnapshot(sessionId, filePath, snapshot);
			};
			/**
			* Track the cost of this call based on the provider's cost config.
			* Per docs/product/04-ux-reliability.md §5 + doc 06 decision 7.
			*/
			const trackCost = (responseText) => {
				let usage;
				if (responseText !== void 0) try {
					usage = JSON.parse(responseText).usage;
				} catch {}
				const cost = calculateCallCost({
					costPerCall: provider.costPerCall,
					costPerKiloToken: provider.costPerKiloToken,
					costPerSecond: provider.costPerSecond
				}, {
					usage,
					durationSeconds: requestDurationMs / 1e3
				});
				const spec = findEndpointSpec(provider.endpoints, args.path, method);
				recordCallCost(sessionId, provider.id, spec?.capability, cost);
			};
			if (!result.ok) {
				logHttpRequest(sessionId, provider, {
					method,
					path: args.path,
					headers: args.headers,
					query: args.query,
					body
				}, {
					ok: false,
					status: result.status,
					contentType: result.contentType,
					kind: "text",
					error: result.text
				}, requestDurationMs, void 0, void 0);
				return {
					ok: false,
					status: result.status,
					kind: "text",
					content_type: result.contentType,
					error: result.text,
					sent_body_preview: body !== void 0 ? body.slice(0, 500) : void 0
				};
			}
			switch (result.kind) {
				case "json":
				case "text": {
					const methodUsed = (args.method ?? (body !== void 0 ? "POST" : "GET")).toUpperCase();
					const spec = findEndpointSpec(provider.endpoints, args.path, methodUsed);
					if (result.kind === "json" && spec !== void 0) {
						const specResult = await processResponseBySpec(spec, result.text, provider, {
							timeoutMs: getTimeoutMs(),
							signal: exec.signal
						}, sessionId, cwd);
						if (specResult !== null) {
							recordSnapshot(specResult.filePath, specResult.size, specResult.kind);
							return {
								ok: true,
								status: result.status,
								kind: specResult.kind,
								content_type: specResult.contentType,
								file_path: specResult.filePath,
								file_size: specResult.size
							};
						}
					}
					if (result.kind === "json") {
						const extracted = extractOpenAIB64Image(result.text);
						if (extracted !== null) {
							if (extracted.bytes.byteLength > getMediaLimit()) throw new AigcError("backend-error", `extracted image too large (${extracted.bytes.byteLength} bytes > ${getMediaLimit()} limit)`, 413);
							const filePath = await saveResponseToSession(extracted.bytes, extracted.ext, sessionId, cwd);
							recordSnapshot(filePath, extracted.bytes.byteLength, "image");
							trackCost(result.text);
							logHttpRequest(sessionId, provider, {
								method,
								path: args.path,
								headers: args.headers,
								query: args.query,
								body
							}, {
								ok: true,
								status: result.status,
								contentType: extracted.contentType,
								kind: "image"
							}, requestDurationMs, filePath, extracted.bytes.byteLength);
							return {
								ok: true,
								status: result.status,
								kind: "image",
								content_type: extracted.contentType,
								file_path: filePath,
								file_size: extracted.bytes.byteLength
							};
						}
					}
					if (result.text.length <= 2e3) {
						trackCost(result.text);
						logHttpRequest(sessionId, provider, {
							method,
							path: args.path,
							headers: args.headers,
							query: args.query,
							body
						}, {
							ok: true,
							status: result.status,
							contentType: result.contentType,
							kind: result.kind,
							text: result.text
						}, requestDurationMs, void 0, void 0);
						return {
							ok: true,
							status: result.status,
							kind: result.kind,
							content_type: result.contentType,
							text: result.text
						};
					}
					const filePath = await saveResponseToSession(result.text, result.kind === "json" ? "json" : "txt", sessionId, cwd);
					const preview = result.text.slice(0, INLINE_TEXT_CAP);
					const size = Buffer.byteLength(result.text);
					recordSnapshot(filePath, size, result.kind);
					trackCost(result.text);
					logHttpRequest(sessionId, provider, {
						method,
						path: args.path,
						headers: args.headers,
						query: args.query,
						body
					}, {
						ok: true,
						status: result.status,
						contentType: result.contentType,
						kind: result.kind,
						text: preview
					}, requestDurationMs, filePath, size);
					return {
						ok: true,
						status: result.status,
						kind: result.kind,
						content_type: result.contentType,
						text: `${preview}\n… [response truncated; full ${size} bytes saved to ${filePath} — read it with your file tools]`,
						file_path: filePath,
						file_size: size
					};
				}
				default: {
					const ext = extensionForBinaryKind(result.kind, result.contentType);
					if (result.size > getMediaLimit()) throw new AigcError("backend-error", `provider response too large to save (${result.size} bytes > ${getMediaLimit()} limit)`, 413);
					const filePath = await saveResponseToSession(result.bytes, ext, sessionId, cwd);
					recordSnapshot(filePath, result.size, result.kind);
					trackCost(void 0);
					logHttpRequest(sessionId, provider, {
						method,
						path: args.path,
						headers: args.headers,
						query: args.query,
						body
					}, {
						ok: true,
						status: result.status,
						contentType: result.contentType,
						kind: result.kind
					}, requestDurationMs, filePath, result.size);
					return {
						ok: true,
						status: result.status,
						kind: result.kind,
						content_type: result.contentType,
						file_path: filePath,
						file_size: result.size
					};
				}
			}
		}
	}));
	register(defineTool({
		name: "aigc_provider_set_instructions",
		description: `Record the usage instructions (调用说明) for one provider: the endpoints, request formats, parameters, and response shapes you discovered by probing the provider with aigc_http_request. Call this after initializing a provider so future sessions can generate with it directly. The instructions replace the provider's previous instructions (empty until first set). KEEP THE INSTRUCTIONS COMPACT (target: under ${INSTRUCTIONS_MAX_CHARS} chars) — they are inlined into aigc_get_provider_info as a preview, so verbosity wastes context window on every provider list call. Prefer compact shorthand like "POST /v1/images/generations {prompt,size} -> {data:[{b64_json}]}" over full sentences. Do NOT copy full API docs or verbose explanations — drop formatting guarantees and use telegraphic notes (one line per endpoint, no Markdown).`,
		parameters: {
			provider_id: {
				type: "string",
				required: true,
				description: "The provider id to update (from aigc_get_provider_info)."
			},
			instructions: {
				type: "string",
				required: true,
				description: `Compact usage instructions. Be terse — one line per endpoint is enough; do not pad with prose, examples, or full docs. Shorthand like "POST /v1/images/generations {prompt,size} -> {data:[{b64_json}]}" is ideal. Target: under ${INSTRUCTIONS_MAX_CHARS} chars total. Fewer is better.`
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					provider_id: {
						type: "string",
						required: true
					},
					total_chars: {
						type: "integer",
						required: true,
						description: "Total character count of the saved instructions."
					}
				}
			},
			render: textRender((v) => `Saved ${v.total_chars} chars of usage instructions for provider "${v.provider_id}".`)
		},
		execute: (args) => {
			if (typeof args.provider_id !== "string" || args.provider_id === "") throw new AigcError("bad-request", "provider_id is required");
			if (typeof args.instructions !== "string" || args.instructions === "") throw new AigcError("bad-request", "instructions is required");
			if (args.instructions.length > INSTRUCTIONS_MAX_CHARS) throw new AigcError("bad-request", `instructions too long (${args.instructions.length} chars > ${INSTRUCTIONS_MAX_CHARS} limit). Compress to telegraphic one-line-per-endpoint shorthand.`);
			getProvider(args.provider_id);
			const result = setInstructions(args.provider_id, args.instructions);
			if (!result.ok) throw new AigcError("bad-request", result.error ?? "cannot save instructions");
			return Promise.resolve({
				ok: true,
				provider_id: args.provider_id,
				total_chars: args.instructions.length
			});
		}
	}));
	register(defineTool({
		name: "aigc_provider_get_instructions",
		description: `Fetch the FULL usage instructions (调用说明) for one provider. aigc_get_provider_info only shows a short preview (first ${INSTRUCTIONS_PREVIEW_CHARS} chars); when you need the complete text — e.g. to recall exact endpoint paths, parameter names, or response shapes for an already-initialized provider — call this. The result is empty for a provider that has not been initialized yet (probe the API with aigc_http_request first, then record the instructions via aigc_provider_set_instructions).`,
		parameters: { provider_id: {
			type: "string",
			required: true,
			description: "The provider id (from aigc_get_provider_info)."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					provider_id: {
						type: "string",
						required: true
					},
					instructions: {
						type: "string",
						required: true,
						description: "The full usage instructions string (empty when the provider is uninitialized)."
					},
					total_chars: {
						type: "integer",
						required: true,
						description: "Total character count of the instructions (0 when uninitialized)."
					}
				}
			},
			render: textRender((v) => v.instructions === "" ? `Provider "${v.provider_id}" has no instructions recorded yet. Probe its API with aigc_http_request, then save them via aigc_provider_set_instructions.` : `Full instructions for provider "${v.provider_id}" (${v.total_chars} chars):\n${v.instructions}`)
		},
		execute: (args) => {
			if (typeof args.provider_id !== "string" || args.provider_id === "") throw new AigcError("bad-request", "provider_id is required");
			const instructions = getProvider(args.provider_id).instructions;
			return Promise.resolve({
				provider_id: args.provider_id,
				instructions,
				total_chars: instructions.length
			});
		}
	}));
	register(defineTool({
		name: "aigc_provider_set_endpoints",
		description: "Record the STRUCTURED capability catalog for one provider: a list of EndpointSpec entries describing each endpoint's path, method, capability, parameters, and response shape. This is the preferred replacement for aigc_provider_set_instructions (which stores free-form text): the structured catalog lets aigc_get_provider_info return a capabilityMap, lets aigc_get_endpoint_details return exact endpoint specs, and lets aigc_http_request process responses by spec.response.kind instead of the legacy OpenAI-format sniff. The legacy `instructions` field is AUTO-DERIVED from the catalog (one compact line per endpoint) so old agent prompts that read `instructions` keep working. Call this after probing a provider's API with aigc_http_request + aigc_probe_endpoint.",
		parameters: {
			provider_id: {
				type: "string",
				required: true,
				description: "The provider id to update (from aigc_get_provider_info)."
			},
			endpoints: {
				type: "json",
				required: true,
				description: `Array of EndpointSpec objects. Each entry: { path, method, capability, params?, response: { kind, path? }, acceptsCanvasRef?, notes? }. capability enum: ${CAPABILITIES.join(" | ")}. response.kind enum: ${RESPONSE_KINDS.join(" | ")}. response.path is required for b64_json_array / b64_json_field / url_field (e.g. "data[0].b64_json"); ignored for binary and json_text. params is an array of { name, type, required, default?, enum?, min?, max?, description? }. Example: [{ path: "/v1/images/generations", method: "POST", capability: "t2i", params: [{name:"prompt",type:"string",required:true},{name:"size",type:"string",default:"1024x1024"}], response: { kind: "b64_json_array", path: "data[0].b64_json" }, acceptsCanvasRef: true }]`
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					provider_id: {
						type: "string",
						required: true
					},
					endpoint_count: {
						type: "integer",
						required: true,
						description: "Number of EndpointSpec entries saved."
					},
					derived_instructions_chars: {
						type: "integer",
						required: true,
						description: "Character count of the auto-derived instructions string (also saved to the legacy field)."
					}
				}
			},
			render: textRender((v) => `Saved ${v.endpoint_count} endpoint(s) for provider "${v.provider_id}" (auto-derived instructions: ${v.derived_instructions_chars} chars).`)
		},
		execute: (args) => {
			if (typeof args.provider_id !== "string" || args.provider_id === "") throw new AigcError("bad-request", "provider_id is required");
			if (!Array.isArray(args.endpoints)) throw new AigcError("bad-request", "endpoints must be an array of EndpointSpec objects");
			const endpoints = [];
			for (const raw of args.endpoints) {
				if (typeof raw !== "object" || raw === null) throw new AigcError("bad-request", "each endpoint must be an object");
				const rec = raw;
				if (typeof rec.path !== "string" || rec.path === "") throw new AigcError("bad-request", "each endpoint.path must be a non-empty string");
				if (typeof rec.method !== "string" || ![
					"GET",
					"POST",
					"PUT",
					"PATCH"
				].includes(rec.method)) throw new AigcError("bad-request", `endpoint.method must be one of GET/POST/PUT/PATCH (got: ${String(rec.method)})`);
				if (typeof rec.capability !== "string" || !CAPABILITIES.includes(rec.capability)) throw new AigcError("bad-request", `endpoint.capability must be one of: ${CAPABILITIES.join(", ")}`);
				if (typeof rec.response !== "object" || rec.response === null) throw new AigcError("bad-request", "endpoint.response must be an object { kind, path? }");
				const resp = rec.response;
				if (typeof resp.kind !== "string" || !RESPONSE_KINDS.includes(resp.kind)) throw new AigcError("bad-request", `endpoint.response.kind must be one of: ${RESPONSE_KINDS.join(", ")}`);
				endpoints.push({
					path: rec.path,
					method: rec.method,
					capability: rec.capability,
					...Array.isArray(rec.params) ? { params: rec.params } : {},
					response: {
						kind: resp.kind,
						...typeof resp.path === "string" ? { path: resp.path } : {}
					},
					...typeof rec.acceptsCanvasRef === "boolean" ? { acceptsCanvasRef: rec.acceptsCanvasRef } : {},
					...typeof rec.notes === "string" ? { notes: rec.notes } : {}
				});
			}
			getProvider(args.provider_id);
			const result = setEndpoints(args.provider_id, endpoints);
			if (!result.ok) throw new AigcError("bad-request", result.error ?? "cannot save endpoints");
			const derived = deriveInstructionsFromEndpoints(endpoints);
			return Promise.resolve({
				ok: true,
				provider_id: args.provider_id,
				endpoint_count: endpoints.length,
				derived_instructions_chars: derived.length
			});
		}
	}));
	register(defineTool({
		name: "aigc_probe_endpoint",
		description: "Probe one provider endpoint with a minimal test request and auto-detect the response shape (ResponseKind + payload path). Use this to half-automate the EndpointSpec catalog: send a tiny test body, read the detected kind + path, then save a full EndpointSpec via aigc_provider_set_endpoints. The probe sends ONE real API call (costs money); use a minimal test body to keep the cost down. Binary responses (image/video/audio Content-Type) are detected as kind=\"binary\" from the Content-Type header; JSON responses are sniffed by heuristics (OpenAI b64_json_array, url_field, chat shape, single b64 field, etc.).",
		parameters: {
			provider_id: {
				type: "string",
				required: true,
				description: "The provider id to probe (from aigc_get_provider_info)."
			},
			path: {
				type: "string",
				required: true,
				description: "Endpoint path to probe, e.g. \"/v1/images/generations\"."
			},
			method: {
				type: "string",
				enum: [
					"GET",
					"POST",
					"PUT",
					"PATCH"
				],
				description: "HTTP method. Defaults to POST when a test_body is provided, else GET."
			},
			test_body: {
				type: "json",
				description: "Minimal test request body (object/array or JSON string). Keep it tiny to minimize API cost. Example: { prompt: \"test\", size: \"1024x1024\" }."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true,
						description: "Whether the probe request returned 2xx."
					},
					status: {
						type: "integer",
						required: true,
						description: "HTTP status code of the probe response."
					},
					content_type: {
						type: "string",
						required: true,
						description: "Response Content-Type header."
					},
					detected: {
						type: "object",
						required: true,
						additionalProperties: false,
						description: "Auto-detected response shape (use these values to fill an EndpointSpec.response).",
						properties: {
							responseKind: {
								type: "string",
								required: true,
								enum: RESPONSE_KINDS
							},
							responsePath: {
								type: "string",
								description: "Detected payload path (e.g. \"data[0].b64_json\"). Undefined for binary and json_text."
							},
							sampleField: {
								type: "string",
								description: "Sample field name detected (for debugging the heuristic)."
							}
						}
					},
					body_preview: {
						type: "string",
						required: true,
						description: "First ~500 chars of the response body (for the model to verify the detection)."
					}
				}
			},
			render: textRender((v) => v.ok ? `Probe ${v.status} (${v.content_type}) → detected ${v.detected.responseKind}${v.detected.responsePath !== void 0 ? ` @ ${v.detected.responsePath}` : ""}\nBody preview: ${v.body_preview.slice(0, 200)}` : `Probe FAILED: HTTP ${v.status} (${v.content_type}). Body: ${v.body_preview.slice(0, 200)}`)
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			if (typeof args.provider_id !== "string" || args.provider_id === "") throw new AigcError("bad-request", "provider_id is required");
			if (typeof args.path !== "string" || args.path === "") throw new AigcError("bad-request", "path is required");
			sessionIdOf(exec);
			const provider = getProvider(args.provider_id);
			let body;
			if (args.test_body !== void 0) {
				if (typeof args.test_body === "string") body = args.test_body;
				else try {
					body = JSON.stringify(args.test_body);
				} catch (e) {
					throw new AigcError("bad-request", `test_body is not serializable: ${e instanceof Error ? e.message : String(e)}`);
				}
			}
			const result = await executeProviderRequest(provider, {
				method: (args.method ?? (body !== void 0 ? "POST" : "GET")).toUpperCase(),
				path: args.path,
				body
			}, {
				timeoutMs: getTimeoutMs(),
				signal: exec.signal
			});
			if (!result.ok) return {
				ok: false,
				status: result.status,
				content_type: result.contentType,
				detected: { responseKind: "json_text" },
				body_preview: result.text.slice(0, 500)
			};
			const mediaType = result.contentType.split(";")[0].trim().toLowerCase();
			if (mediaType.startsWith("image/") || mediaType.startsWith("video/") || mediaType.startsWith("audio/") || mediaType === "application/octet-stream") return {
				ok: true,
				status: result.status,
				content_type: result.contentType,
				detected: { responseKind: "binary" },
				body_preview: `(binary ${result.contentType}, ${result.kind === "json" || result.kind === "text" ? result.text.length : result.bytes?.byteLength ?? 0} bytes)`
			};
			const text = result.kind === "json" || result.kind === "text" ? result.text : "";
			let parsed;
			try {
				parsed = JSON.parse(text);
			} catch {
				parsed = text;
			}
			const detected = detectResponseShape(parsed);
			const sampleField = detected.path ?? "";
			return {
				ok: true,
				status: result.status,
				content_type: result.contentType,
				detected: {
					responseKind: detected.kind,
					...detected.path !== void 0 ? { responsePath: detected.path } : {},
					...sampleField !== "" ? { sampleField } : {}
				},
				body_preview: text.slice(0, 500)
			};
		}
	}));
	register(defineTool({
		name: "aigc_reroll",
		description: "Re-generate one (or a few) elements based on an existing canvas element, applying an optional patch to the original request. The source element MUST have been placed via aigc_canvas_place from a file produced by aigc_http_request (so its meta.originalRequest is recorded — see aigc_canvas_list_elements). host reads meta.originalRequest, applies the patch, calls the original provider, saves the new file, places it on the canvas, and auto-wires an edge from the source to the new element with a semantic relation: \"variation_of\" when only the seed (or other non-prompt params) changed, \"remix_of\" when the prompt changed. When count > 1, all variants are also wired to each other with \"alternative_of\" so they form a cluster. This is the 1-step primitive for \"this image's pose is wrong, regenerate with a different prompt\" / \"give me 4 variations of this image with different seeds\" — no need to manually reconstruct the original request body, call aigc_http_request, then aigc_canvas_place, then aigc_canvas_link.",
		parameters: {
			source_element: {
				type: "string",
				required: true,
				description: "filePath of the source canvas element to reroll (must have meta.originalRequest — place it via aigc_canvas_place first if it came from aigc_http_request)."
			},
			patch: {
				type: "json",
				description: "Optional patch applied to the original request body. Fields:\n  seed?: number — change the seed (when omitted AND the body has a seed field, a random seed is used)\n  prompt_delta?: string — append to the original prompt (relation becomes \"remix_of\")\n  prompt_replace?: string — completely replace the prompt (relation becomes \"remix_of\")\n  size?: string — change the size\n  Any other field overrides the corresponding body field directly (e.g. {duration: 10}).\nWhen omitted entirely, only the seed is randomized (relation \"variation_of\")."
			},
			count: {
				type: "integer",
				description: "How many variants to generate (default 1, max 8). When > 1, all variants are placed in a grid to the right of the source, all wired to the source with the same relation, and wired to each other with \"alternative_of\"."
			},
			provider_id: {
				type: "string",
				description: "Override the original provider (default: use the source element's originalRequest.providerId). Use this when the original provider is down or you want to compare providers."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					elements: {
						type: "array",
						required: true,
						description: "The newly generated elements.",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								filePath: {
									type: "string",
									required: true
								},
								kind: {
									type: "string",
									required: true,
									enum: [
										"prompt",
										"image",
										"video",
										"audio"
									]
								},
								title: {
									type: "string",
									required: true
								},
								x: {
									type: "number",
									required: true
								},
								y: {
									type: "number",
									required: true
								}
							}
						}
					},
					linked_to: {
						type: "string",
						required: true,
						description: "filePath of the source element the variants were rerolled from."
					},
					relation: {
						type: "string",
						required: true,
						enum: ["variation_of", "remix_of"],
						description: "Auto-decided: variation_of when only seed/params changed, remix_of when the prompt changed."
					}
				}
			},
			render: (_args, value) => {
				const v = value;
				const list = v.elements.map((e) => `  ${e.filePath} [${e.kind}]`).join("\n");
				return [{
					type: "text",
					text: `Rerolled ${v.elements.length} variant(s) from ${v.linked_to} →[${v.relation}]:\n${list}`
				}];
			}
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			const cwd = resolveCwd(sessionId);
			await canvas.ensureHydrated(sessionId);
			const sourceEl = canvas.getElementByPath(sessionId, args.source_element);
			const originalRequest = sourceEl.meta?.originalRequest;
			if (originalRequest === void 0) throw new AigcError("bad-request", `cannot reroll element "${args.source_element}" — it has no meta.originalRequest. This happens when the element was not placed via aigc_canvas_place from a file produced by aigc_http_request (e.g. it was uploaded via drag-drop or created by aigc_media_edit). Re-generate it via aigc_http_request + aigc_canvas_place first to enable reroll.`);
			const patch = coerceMeta(args.patch) ?? {};
			const count = args.count !== void 0 ? Math.max(1, Math.min(8, Math.floor(args.count))) : 1;
			const relation = patch.prompt_delta !== void 0 || patch.prompt_replace !== void 0 ? "remix_of" : "variation_of";
			const provider = getProvider(args.provider_id ?? originalRequest.providerId);
			const patchedBody = applyRerollPatch(originalRequest.body, patch);
			typeof patchedBody === "string" || patchedBody !== void 0 && JSON.stringify(patchedBody);
			const positions = gridPositionsRightOf(sourceEl.x, sourceEl.y, count);
			const newElements = [];
			for (let i = 0; i < count; i++) {
				exec.signal.throwIfAborted();
				const iterBody = count > 1 && typeof patchedBody === "object" && patchedBody !== null ? randomizeSeedInPlace({ ...patchedBody }) : patchedBody;
				const iterBodyString = typeof iterBody === "string" ? iterBody : iterBody !== void 0 ? JSON.stringify(iterBody) : void 0;
				const requestStartedAt = Date.now();
				const result = await executeProviderRequest(provider, {
					method: originalRequest.method,
					path: originalRequest.path,
					headers: originalRequest.headers,
					query: originalRequest.query,
					body: iterBodyString
				}, {
					timeoutMs: getTimeoutMs(),
					signal: exec.signal
				});
				const durationMs = Date.now() - requestStartedAt;
				if (!result.ok) throw new AigcError("backend-error", `reroll failed: provider returned HTTP ${result.status} (${result.contentType}): ${result.text.slice(0, 500)}`, result.status >= 400 && result.status < 500 ? 400 : 502);
				const saved = await saveRerollResponse(result, sessionId, cwd, provider.id, originalRequest, iterBody, durationMs);
				const placed = await canvas.placeFile(sessionId, {
					kind: saved.kind,
					filePath: saved.filePath,
					title: `${sourceEl.title} (reroll ${i + 1})`,
					producedBy: "aigc_reroll",
					x: positions[i].x,
					y: positions[i].y,
					description: sourceEl.description ?? sourceEl.title.slice(0, 40),
					...sourceEl.promptText !== void 0 ? { promptText: sourceEl.promptText } : {},
					meta: { originalRequest: saved.snapshot }
				}, cwd);
				newElements.push(placed);
			}
			if (newElements.length > 0) {
				await canvas.wireEdges(sessionId, newElements.map((e) => ({
					uuid: sourceEl.uuid,
					relation
				})), newElements[0].uuid);
				for (let i = 1; i < newElements.length; i++) await canvas.wireEdges(sessionId, [{
					uuid: sourceEl.uuid,
					relation
				}], newElements[i].uuid);
				if (newElements.length > 1) for (let i = 0; i < newElements.length; i++) for (let j = 0; j < newElements.length; j++) {
					if (i === j) continue;
					await canvas.wireEdges(sessionId, [{
						uuid: newElements[i].uuid,
						relation: "alternative_of"
					}], newElements[j].uuid);
				}
			}
			return {
				elements: newElements.map((e) => ({
					filePath: e.filePath,
					kind: e.kind,
					title: e.title,
					x: e.x,
					y: e.y
				})),
				linked_to: args.source_element,
				relation
			};
		}
	}));
	register(defineTool({
		name: "aigc_variation",
		description: "Generate N variants in ONE step by calling the provider N times in parallel (limited concurrency), placing all variants on the canvas in a grid/row/column layout, and auto-wiring edges: every variant → source with \"variation_of\", and every variant → every other variant with \"alternative_of\". Returns a cluster_id grouping the variants. This is the batch primitive for \"give me 4 variations of this image\" / \"generate 4 cats with different seeds\" — no need to call aigc_reroll N times manually. When source_element is omitted, the variants are generated from scratch (pure t2i) using the given prompt + provider_id (default path: POST /v1/images/generations). When source_element is given, its meta.originalRequest is reused as the base request (preserving size/model/etc.), and the prompt is taken from args.prompt or the source's original prompt. strategy controls how variants differ: \"seed\" = randomize seed per variant; \"prompt_perturb\" = append prompt_perturb text to the prompt; \"both\" = both. Each variant's meta.originalRequest is set (same as aigc_reroll) so the variant can itself be re-rerolled or re-varied later.",
		parameters: {
			source_element: {
				type: "string",
				description: "filePath of the source canvas element to base variants on (must have meta.originalRequest — place it via aigc_canvas_place first if it came from aigc_http_request). When omitted, prompt + provider_id are used to generate from scratch (pure t2i)."
			},
			prompt: {
				type: "string",
				description: "Prompt for the variants. When omitted, the source element's original prompt is used (requires source_element). When strategy is \"prompt_perturb\" or \"both\", prompt_perturb is appended to this prompt."
			},
			count: {
				type: "integer",
				required: true,
				description: "How many variants to generate (clamped to [2, 8])."
			},
			strategy: {
				type: "string",
				required: true,
				enum: [
					"seed",
					"prompt_perturb",
					"both"
				],
				description: "How to vary the variants: \"seed\" = randomize seed per variant; \"prompt_perturb\" = append prompt_perturb text to the prompt; \"both\" = both."
			},
			prompt_perturb: {
				type: "string",
				description: "Text appended to the prompt for every variant (required when strategy is \"prompt_perturb\" or \"both\")."
			},
			layout: {
				type: "string",
				enum: [
					"grid",
					"row",
					"column"
				],
				description: "How to arrange the variants on the canvas. \"grid\" (default) = 2-column grid to the right of the source; \"row\" = single horizontal row; \"column\" = single vertical column."
			},
			provider_id: providerIdParam
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					cluster_id: {
						type: "string",
						required: true,
						description: "Opaque id grouping the variants in this cluster."
					},
					elements: {
						type: "array",
						required: true,
						description: "The newly generated variant elements.",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								filePath: {
									type: "string",
									required: true
								},
								kind: {
									type: "string",
									required: true,
									enum: [
										"prompt",
										"image",
										"video",
										"audio"
									]
								},
								title: {
									type: "string",
									required: true
								},
								x: {
									type: "number",
									required: true
								},
								y: {
									type: "number",
									required: true
								}
							}
						}
					}
				}
			},
			render: (_args, value) => {
				const v = value;
				const list = v.elements.map((e) => `  ${e.filePath} [${e.kind}]`).join("\n");
				return [{
					type: "text",
					text: `Generated ${v.elements.length} variant(s) in cluster ${v.cluster_id}:\n${list}`
				}];
			}
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			const cwd = resolveCwd(sessionId);
			if (typeof args.count !== "number" || !Number.isFinite(args.count)) throw new AigcError("bad-request", "count must be a finite integer (2-8)");
			const count = Math.max(2, Math.min(8, Math.floor(args.count)));
			if (args.strategy !== "seed" && args.strategy !== "prompt_perturb" && args.strategy !== "both") throw new AigcError("bad-request", `strategy must be one of: seed, prompt_perturb, both (got: ${String(args.strategy)})`);
			const strategy = args.strategy;
			const needsPerturb = strategy === "prompt_perturb" || strategy === "both";
			if (needsPerturb && (typeof args.prompt_perturb !== "string" || args.prompt_perturb === "")) throw new AigcError("bad-request", `prompt_perturb is required when strategy is "${strategy}"`);
			const layout = args.layout === "row" || args.layout === "column" ? args.layout : "grid";
			await canvas.ensureHydrated(sessionId);
			let sourceEl;
			let originalRequest;
			if (args.source_element !== void 0) {
				sourceEl = canvas.getElementByPath(sessionId, args.source_element);
				originalRequest = sourceEl.meta?.originalRequest;
				if (originalRequest === void 0) throw new AigcError("bad-request", `cannot vary element "${args.source_element}" — it has no meta.originalRequest. This happens when the element was not placed via aigc_canvas_place from a file produced by aigc_http_request. Re-generate it via aigc_http_request + aigc_canvas_place first to enable variation.`);
			}
			const sourceBody = originalRequest?.body;
			let promptText;
			if (typeof args.prompt === "string" && args.prompt !== "") promptText = args.prompt;
			else if (isPlainObject(sourceBody)) {
				const field = findPromptField(sourceBody);
				if (field !== void 0 && typeof sourceBody[field] === "string") promptText = sourceBody[field];
			}
			if (promptText === void 0) throw new AigcError("bad-request", "prompt is required when source_element is omitted or has no prompt field in its originalRequest.body");
			const perturbSuffix = needsPerturb && typeof args.prompt_perturb === "string" ? ` ${args.prompt_perturb}` : "";
			const finalPrompt = promptText + perturbSuffix;
			const provider = getProvider(args.provider_id ?? originalRequest?.providerId);
			const method = originalRequest?.method ?? "POST";
			const path = originalRequest?.path ?? "/v1/images/generations";
			const headers = originalRequest?.headers;
			const query = originalRequest?.query;
			const positions = variationPositions(sourceEl?.x ?? 32, sourceEl?.y ?? 32, count, layout, sourceEl !== void 0);
			const buildVariantBody = (i) => {
				const body = isPlainObject(sourceBody) ? { ...sourceBody } : {};
				const promptField = findPromptField(body) ?? "prompt";
				body[promptField] = finalPrompt;
				if (strategy === "seed" || strategy === "both") body.seed = Math.floor(Math.random() * 1e9) + i;
				return body;
			};
			const snapshotTemplate = originalRequest ?? {
				providerId: provider.id,
				method,
				path,
				...query !== void 0 ? { query } : {},
				...headers !== void 0 ? { headers } : {},
				responseInfo: {
					status: 0,
					contentType: "",
					kind: "",
					durationMs: 0
				}
			};
			const CONCURRENCY_LIMIT = 4;
			const variants = new Array(count);
			let nextIndex = 0;
			const worker = async () => {
				while (true) {
					exec.signal.throwIfAborted();
					const i = nextIndex++;
					if (i >= count) return;
					const variantBody = buildVariantBody(i);
					const bodyString = JSON.stringify(variantBody);
					const requestStartedAt = Date.now();
					const result = await executeProviderRequest(provider, {
						method,
						path,
						headers,
						query,
						body: bodyString
					}, {
						timeoutMs: getTimeoutMs(),
						signal: exec.signal
					});
					const durationMs = Date.now() - requestStartedAt;
					if (!result.ok) throw new AigcError("backend-error", `variation failed: provider returned HTTP ${result.status} (${result.contentType}): ${result.text.slice(0, 500)}`, result.status >= 400 && result.status < 500 ? 400 : 502);
					const saved = await saveRerollResponse(result, sessionId, cwd, provider.id, snapshotTemplate, variantBody, durationMs);
					savedResults[i] = {
						saved,
						index: i
					};
				}
			};
			const savedResults = [];
			const workers = [];
			for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, count); i++) workers.push(worker());
			await Promise.all(workers);
			const titleBase = sourceEl !== void 0 ? sourceEl.title : titleOf(finalPrompt);
			const description = (sourceEl?.description ?? titleOf(finalPrompt)).slice(0, 40);
			for (const { saved, index: i } of savedResults) variants[i] = await canvas.placeFile(sessionId, {
				kind: saved.kind,
				filePath: saved.filePath,
				title: `${titleBase} (variant ${i + 1})`,
				producedBy: "aigc_variation",
				x: positions[i].x,
				y: positions[i].y,
				description,
				promptText: finalPrompt,
				meta: { originalRequest: saved.snapshot }
			}, cwd);
			if (sourceEl !== void 0) for (const v of variants) await canvas.wireEdges(sessionId, [{
				uuid: sourceEl.uuid,
				relation: "variation_of"
			}], v.uuid);
			if (variants.length > 1) for (let i = 0; i < variants.length; i++) for (let j = 0; j < variants.length; j++) {
				if (i === j) continue;
				await canvas.wireEdges(sessionId, [{
					uuid: variants[i].uuid,
					relation: "alternative_of"
				}], variants[j].uuid);
			}
			return {
				cluster_id: randomUUID(),
				elements: variants.map((e) => ({
					filePath: e.filePath,
					kind: e.kind,
					title: e.title,
					x: e.x,
					y: e.y
				}))
			};
		}
	}));
	register(defineTool({
		name: "aigc_assess",
		description: "Assess one canvas element (image / video / audio) by sending it to a \"judge\" provider — a regular provider configured with a vision-capable chat model (e.g. OpenAI gpt-4o) — and parsing the returned structured scores. Returns scores per requested dimension (default: prompt_match, quality, sfw), an overall score, a short reason, and a recommendation: \"accept\" | \"reroll\" | \"reroll_with_adjustments\". When the judge provider is the built-in stub (endpoint \"stub://aigc-backend\"), returns synthetic scores and makes NO real API call — useful for dry runs. The judge provider is just a regular provider configured by the user (e.g. an OpenAI provider pointing at gpt-4o); pass its id as judge_provider. The tool uses the same HTTP executor as aigc_http_request, so the endpoint + apiKey are attached automatically. Per docs/product/01-agent-autonomy.md §6 (agent self-critique).",
		parameters: {
			element: {
				type: "string",
				required: true,
				description: "filePath of the canvas element to assess (must be an image, video, or audio element placed via aigc_canvas_place). The file is read from disk and sent to the judge as a base64 data URI in a chat completions request body."
			},
			dimensions: {
				type: "array",
				items: { type: "string" },
				description: "Assessment dimensions to ask the judge to score (each 0-100). Defaults to [\"prompt_match\",\"quality\",\"sfw\"]. prompt_match = how well the result matches the original prompt; quality = technical + aesthetic quality; sfw = safety (100 = completely safe). Custom dimension names are allowed — the returned `scores` object is keyed by whatever dimensions you request."
			},
			judge_provider: providerIdParam
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					scores: {
						type: "object",
						required: true,
						additionalProperties: true,
						description: "Scores per dimension (0-100). Keys match the requested `dimensions` (default: prompt_match, quality, sfw).",
						properties: {
							prompt_match: {
								type: "number",
								description: "How well the result matches the original prompt (0-100)."
							},
							quality: {
								type: "number",
								description: "Technical + aesthetic quality (0-100)."
							},
							sfw: {
								type: "number",
								description: "Safety score (0-100; 100 = completely safe)."
							}
						}
					},
					overall: {
						type: "number",
						required: true,
						description: "Overall score (0-100) — the average of the dimension scores."
					},
					reason: {
						type: "string",
						required: true,
						description: "Short one-sentence explanation from the judge."
					},
					recommendation: {
						type: "string",
						required: true,
						enum: ASSESS_RECOMMENDATIONS,
						description: "accept = good enough to keep; reroll = regenerate from scratch; reroll_with_adjustments = regenerate with the suggested adjustments."
					},
					adjustments: {
						type: "json",
						description: "Suggested adjustments when recommendation is \"reroll_with_adjustments\" (e.g. { prompt_delta: \"more cinematic\" }). Undefined for accept/reroll."
					}
				}
			},
			render: (_args, value) => {
				const v = value;
				const scoreLines = Object.entries(v.scores).map(([k, s]) => `  ${k}: ${s}`).join("\n");
				return [{
					type: "text",
					text: `Assessment: ${v.recommendation} (overall ${v.overall})\n${scoreLines}\n${v.reason}`
				}];
			}
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			const cwd = resolveCwd(sessionId);
			await canvas.ensureHydrated(sessionId);
			const el = canvas.getElementByPath(sessionId, args.element);
			if (el.kind !== "image" && el.kind !== "video" && el.kind !== "audio") throw new AigcError("bad-request", `aigc_assess only assesses image / video / audio elements; "${args.element}" is a ${el.kind} element`);
			const dimensions = Array.isArray(args.dimensions) && args.dimensions.length > 0 ? args.dimensions.filter((d) => typeof d === "string" && d !== "") : Array.from(DEFAULT_ASSESS_DIMENSIONS);
			if (dimensions.length === 0) throw new AigcError("bad-request", "dimensions must be a non-empty array of non-empty strings");
			const judge = getProvider(args.judge_provider);
			if (isStubEndpoint(judge.endpoint)) {
				const stubScores = {};
				for (const dim of dimensions) stubScores[dim] = 80;
				return {
					scores: stubScores,
					overall: Math.round(Object.values(stubScores).reduce((a, b) => a + b, 0) / dimensions.length),
					reason: `[stub] synthetic assessment from provider "${judge.id}" — no real judge API was called`,
					recommendation: "accept"
				};
			}
			const dataUri = await readAsBase64(el.filePath, cwd, true);
			const dimList = dimensions.map((d) => `- ${d} (0-100)`).join("\n");
			const dimShape = dimensions.map((d) => `"${d}": <0-100>`).join(", ");
			const assessPrompt = `You are an AIGC quality assessor. Evaluate the provided media file.\nThe original generation prompt was: "${el.promptText ?? "(no prompt was recorded for this element)"}"\n\nScore each dimension from 0 to 100:\n${dimList}\n\nReturn ONLY a JSON object with this exact shape (no other text, no markdown fences):\n{\n  "scores": { ${dimShape} },\n  "overall": <0-100>,\n  "reason": "<one short sentence>",\n  "recommendation": "accept" | "reroll" | "reroll_with_adjustments",\n  "adjustments": { "prompt_delta": "<optional, only when reroll_with_adjustments>" }\n}`;
			const result = await executeProviderRequest(judge, {
				method: "POST",
				path: "/v1/chat/completions",
				body: JSON.stringify({
					model: "gpt-4o",
					messages: [{
						role: "user",
						content: [{
							type: "text",
							text: assessPrompt
						}, {
							type: "image_url",
							image_url: { url: dataUri }
						}]
					}]
				})
			}, {
				timeoutMs: getTimeoutMs(),
				signal: exec.signal
			});
			if (!result.ok) throw new AigcError("backend-error", `judge provider "${judge.id}" returned HTTP ${result.status} (${result.contentType}): ${result.text.slice(0, 500)}`, result.status >= 400 && result.status < 500 ? 400 : 502);
			const responseText = result.kind === "json" || result.kind === "text" ? result.text : "";
			const content = extractChatContent(responseText);
			if (content === "") throw new AigcError("backend-error", `judge provider "${judge.id}" returned no assistant message content (raw response: ${responseText.slice(0, 500)})`);
			const parsed = parseAssessmentJson(content);
			if (parsed === null) throw new AigcError("backend-error", `judge provider "${judge.id}" did not return valid assessment JSON (content: ${content.slice(0, 500)})`);
			const scores = {};
			const rawScores = parsed.scores;
			const scoresObj = typeof rawScores === "object" && rawScores !== null && !Array.isArray(rawScores) ? rawScores : {};
			for (const dim of dimensions) {
				const v = scoresObj[dim];
				scores[dim] = typeof v === "number" && Number.isFinite(v) ? clamp(v, 0, 100) : 0;
			}
			const overallRaw = parsed.overall;
			const overall = typeof overallRaw === "number" && Number.isFinite(overallRaw) ? clamp(overallRaw, 0, 100) : Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / dimensions.length);
			const reason = typeof parsed.reason === "string" ? parsed.reason : "";
			const recommendation = parseRecommendation(parsed.recommendation);
			const adjustments = parsed.adjustments !== void 0 ? parsed.adjustments : void 0;
			return {
				scores,
				overall,
				reason,
				recommendation,
				...adjustments !== void 0 ? { adjustments } : {}
			};
		}
	}));
	register(defineTool({
		name: "aigc_library_promote",
		description: "Promote one canvas element to the cross-session asset library (per docs/product/04-ux-reliability.md §6). The element's file is COPIED into ~/.dsh/aigc-canvas/library/ (images/ or prompts/), so the asset survives session teardown and can be referenced by future sessions. Use this for style references, subject references, prompt templates, voice samples, or final products the user wants to reuse. After promoting, call aigc_library_list / aigc_library_get to retrieve the asset's filePath and reference it in aigc_http_request via the {\"$base64\": \"<path>\"} placeholder.",
		parameters: {
			element_path: {
				type: "string",
				required: true,
				description: "filePath of the canvas element to promote (must exist on the current session's canvas)."
			},
			category: {
				type: "string",
				required: true,
				enum: ASSET_CATEGORIES,
				description: "Asset category. style-reference / subject-reference / prompt-template / voice-sample / final-product."
			},
			title: {
				type: "string",
				description: "Display title for the asset. Defaults to the element's title."
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "Free-form tags for filtering (e.g. [\"cyberpunk\", \"cat\"])."
			},
			original_prompt: {
				type: "string",
				description: "The prompt used to generate the original element (for later recall). Defaults to the element's promptText."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					asset_id: {
						type: "string",
						required: true,
						description: "The new asset id (pass to aigc_library_get / aigc_library_remove)."
					},
					file_path: {
						type: "string",
						required: true,
						description: "Absolute path of the copied asset file in the library."
					},
					type: {
						type: "string",
						required: true,
						enum: [
							"image",
							"prompt",
							"audio",
							"video"
						]
					},
					title: {
						type: "string",
						required: true
					},
					category: {
						type: "string",
						required: true,
						enum: ASSET_CATEGORIES
					}
				}
			},
			render: textRender((v) => `Promoted "${v.title}" to asset library as ${v.asset_id} (${v.category}). File: ${v.file_path}.`)
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			await canvas.ensureHydrated(sessionId);
			const el = canvas.getElementByPath(sessionId, args.element_path);
			const category = coerceAssetCategory(args.category);
			const asset = await promoteAsset({
				sourceFilePath: el.filePath,
				category,
				title: args.title ?? el.title,
				tags: args.tags,
				originalPrompt: args.original_prompt ?? el.promptText,
				sourceSessionId: sessionId,
				sourceElementPath: el.filePath,
				...el.mediaSize !== void 0 ? { metadata: { mediaSize: el.mediaSize } } : {}
			});
			return {
				asset_id: asset.id,
				file_path: resolveAssetPath(asset.filePath),
				type: asset.type,
				title: asset.title,
				category: asset.category
			};
		}
	}));
	register(defineTool({
		name: "aigc_library_list",
		description: "List assets in the cross-session library (per docs/product/04-ux-reliability.md §6). Filters are AND-combined: e.g. passing category=style-reference + tags=[\"cyberpunk\"] returns only style-reference assets tagged \"cyberpunk\". Pass search for a case-insensitive substring match over title + originalPrompt + tags. The library is cross-session — assets promoted in any session are visible here. Use aigc_library_get to fetch one asset's absolute filePath for use in aigc_http_request.",
		parameters: {
			type: {
				type: "string",
				enum: [
					"image",
					"prompt",
					"audio",
					"video"
				],
				description: "Filter by asset file type."
			},
			category: {
				type: "string",
				enum: ASSET_CATEGORIES,
				description: "Filter by asset category."
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "Filter: assets matching ALL of these tags are returned."
			},
			search: {
				type: "string",
				description: "Case-insensitive substring search over title + originalPrompt + tags."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { assets: {
					type: "array",
					required: true,
					description: "Matching assets (sorted by createdAt ascending).",
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							id: {
								type: "string",
								required: true
							},
							type: {
								type: "string",
								required: true,
								enum: [
									"image",
									"prompt",
									"audio",
									"video"
								]
							},
							filePath: {
								type: "string",
								required: true,
								description: "Relative path under the library root."
							},
							title: {
								type: "string",
								required: true
							},
							tags: {
								type: "array",
								required: true,
								items: { type: "string" }
							},
							category: {
								type: "string",
								required: true,
								enum: ASSET_CATEGORIES
							},
							originalPrompt: { type: "string" },
							sourceSessionId: { type: "string" },
							sourceElementPath: { type: "string" },
							createdAt: {
								type: "integer",
								required: true
							},
							metadata: { type: "json" }
						}
					}
				} }
			},
			render: (_args, value) => {
				const v = value;
				if (v.assets.length === 0) return [{
					type: "text",
					text: "Asset library is empty (no assets match the filter)."
				}];
				const lines = v.assets.map((a) => `  ${a.id}  [${a.type}/${a.category}]  "${a.title}"  tags:${a.tags.length > 0 ? a.tags.join(",") : "(none)"}`);
				return [{
					type: "text",
					text: `Asset library (${v.assets.length} asset(s)):\n${lines.join("\n")}\nCall aigc_library_get with an asset id to get its absolute file_path.`
				}];
			}
		},
		async execute(args) {
			const filter = {};
			if (args.type !== void 0) {
				if (![
					"image",
					"prompt",
					"audio",
					"video"
				].includes(args.type)) throw new AigcError("bad-request", `type must be one of: image, prompt, audio, video`);
				filter.type = args.type;
			}
			if (args.category !== void 0) filter.category = coerceAssetCategory(args.category);
			if (args.tags !== void 0) {
				if (!Array.isArray(args.tags)) throw new AigcError("bad-request", "tags must be an array of strings");
				filter.tags = args.tags;
			}
			if (args.search !== void 0 && args.search !== "") filter.search = args.search;
			return { assets: await listAssets(filter) };
		}
	}));
	register(defineTool({
		name: "aigc_library_get",
		description: "Get one asset's full details + absolute file_path (per docs/product/04-ux-reliability.md §6). The returned file_path can be passed to aigc_http_request via the {\"$base64\": \"<file_path>\"} placeholder to embed the asset's content in a provider request body. Note: the file_path is inside the library directory (NOT the session canvas dir), so the $base64 containment check will reject it — copy the bytes via your file tools first, or use the filePath for direct reference in pipeline steps that don't go through $base64.",
		parameters: { asset_id: {
			type: "string",
			required: true,
			description: "The asset id (from aigc_library_list)."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						type: "string",
						required: true
					},
					type: {
						type: "string",
						required: true,
						enum: [
							"image",
							"prompt",
							"audio",
							"video"
						]
					},
					file_path: {
						type: "string",
						required: true,
						description: "Absolute path of the asset file on disk."
					},
					title: {
						type: "string",
						required: true
					},
					tags: {
						type: "array",
						required: true,
						items: { type: "string" }
					},
					category: {
						type: "string",
						required: true,
						enum: ASSET_CATEGORIES
					},
					originalPrompt: { type: "string" },
					sourceSessionId: { type: "string" },
					sourceElementPath: { type: "string" },
					createdAt: {
						type: "integer",
						required: true
					},
					metadata: { type: "json" }
				}
			},
			render: textRender((v) => `Asset "${v.title}" (${v.id}) [${v.type}/${v.category}] file: ${v.file_path}`)
		},
		async execute(args) {
			if (typeof args.asset_id !== "string" || args.asset_id === "") throw new AigcError("bad-request", "asset_id is required");
			const { absoluteFilePath, ...rest } = await getAsset(args.asset_id);
			return {
				...rest,
				file_path: absoluteFilePath
			};
		}
	}));
	register(defineTool({
		name: "aigc_library_remove",
		description: "Remove one asset from the cross-session library (per docs/product/04-ux-reliability.md §6). Deletes the asset's file copy from disk AND removes the record from index.json. Idempotent: removing an unknown asset_id returns removed=false (no error).",
		parameters: { asset_id: {
			type: "string",
			required: true,
			description: "The asset id to remove (from aigc_library_list)."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					removed: {
						type: "boolean",
						required: true,
						description: "true when the asset existed and was removed; false when the id was unknown."
					},
					asset_id: {
						type: "string",
						required: true
					}
				}
			},
			render: textRender((v) => v.removed ? `Removed asset ${v.asset_id}.` : `Asset ${v.asset_id} not found (no change).`)
		},
		async execute(args) {
			if (typeof args.asset_id !== "string" || args.asset_id === "") throw new AigcError("bad-request", "asset_id is required");
			return {
				removed: await removeAsset(args.asset_id),
				asset_id: args.asset_id
			};
		}
	}));
	register(defineTool({
		name: "aigc_canvas_place",
		description: "Place a file (usually the file_path returned by aigc_http_request) onto the session's free canvas at position (x, y). The file must already exist inside the session canvas directory. Optionally record the prompt text and generation parameters (meta) — they are shown when the user double-clicks the element. Pass `references` (filePaths + relations of existing elements the new one was generated from) to auto-wire edges from those elements to the new one. x and y are OPTIONAL: PREFER OMITTING THEM and letting the host auto-place. When references are given, the new element lands to the RIGHT of the rightmost reference (vertically centered on the references); otherwise it goes BELOW the lowest existing element in a left-aligned vertical column (this is the usual case for a sequence of independent generations). The client pans to bring it into view. DO NOT pass explicit x/y for routine placements — letting the host stack elements vertically keeps the canvas readable. Only set x/y when the user explicitly asks for a specific layout (e.g. \"place these side by side\").",
		parameters: {
			file_path: {
				type: "string",
				required: true,
				description: "Absolute path of the file to place (must be inside the session canvas directory, e.g. a file_path returned by aigc_http_request)."
			},
			x: {
				type: "number",
				description: "Canvas X coordinate (world space). OMIT for routine placement — the host auto-stacks new elements below the lowest existing one in a vertical column. Only set when the user explicitly requests a custom layout."
			},
			y: {
				type: "number",
				description: "Canvas Y coordinate (world space). OMIT for routine placement — the host auto-stacks new elements below the lowest existing one in a vertical column. Only set when the user explicitly requests a custom layout."
			},
			title: {
				type: "string",
				description: "Short display title. Defaults to the file name."
			},
			description: {
				type: "string",
				required: true,
				description: "ULTRA-SHORT description of this element: a noun, adjective, or short phrase (e.g. \"orange cat\", \"sunset beach\", \"fast cut\", \"low angle\"). MUST be under 40 chars. Do NOT write a full sentence. This is shown on the canvas card and used as a quick label. Drop articles and filler — \"sleeping cat\" not \"a cat that is sleeping\"."
			},
			kind: {
				type: "string",
				enum: [
					"image",
					"video",
					"audio",
					"prompt"
				],
				description: "Element kind. Inferred from the file extension when omitted."
			},
			status: {
				type: "string",
				enum: ELEMENT_STATUSES,
				description: `Lifecycle status (default "${DEFAULT_ELEMENT_STATUS}"). Use 'draft' for pipeline steps that are still generating, 'rejected' for否决 samples, 'archived' for superseded versions.`
			},
			winner: {
				type: "boolean",
				description: "Whether to mark this element as the winner of a variation cluster (shows a winner badge)."
			},
			prompt: {
				type: "string",
				description: "The prompt text used to generate this file (shown on double-click)."
			},
			meta: {
				type: "json",
				description: "Generation parameters / metadata as a JSON OBJECT (e.g. {\"size\":\"768x768\",\"seed\":42}). Shown on double-click. Do NOT pass a stringified JSON."
			},
			references: {
				type: "array",
				description: `Existing canvas elements used as references; edges are wired from each reference to the new element. Each entry is either a filePath string (defaults to relation "input") OR an object { filePath, relation, note? }. Use the object form to record WHY each reference was used — relation drives the canvas line style + label and lets you reason about the dependency graph later via aigc_canvas_list_elements. relation enum: ${EDGE_RELATIONS.join(" | ")}.`,
				items: {
					type: "json",
					description: "A filePath string OR an object { filePath, relation?, note? }."
				}
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					element_path: {
						type: "string",
						required: true,
						description: "The filePath of the placed element (the primary identifier)."
					},
					kind: {
						type: "string",
						required: true,
						enum: [
							"prompt",
							"image",
							"video",
							"audio"
						]
					},
					title: {
						type: "string",
						required: true
					},
					x: {
						type: "number",
						required: true
					},
					y: {
						type: "number",
						required: true
					},
					linked_references: {
						type: "integer",
						description: "How many reference edges were wired (0 when references omitted)."
					}
				}
			},
			render: textRender((v) => `Placed ${v.kind} element "${v.title}" at (${v.x}, ${v.y}) — filePath: ${v.element_path}${v.linked_references ? `, wired from ${v.linked_references} reference(s)` : ""}.`)
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			const cwd = resolveCwd(sessionId);
			const kind = kindForFile(args.file_path, args.kind);
			if (args.x !== void 0 && !Number.isFinite(args.x)) throw new AigcError("bad-request", "x must be a finite number when provided");
			if (args.y !== void 0 && !Number.isFinite(args.y)) throw new AigcError("bad-request", "y must be a finite number when provided");
			if (typeof args.description !== "string" || args.description === "") throw new AigcError("bad-request", "description is required (a short noun/adjective phrase)");
			const description = args.description.slice(0, 40);
			const userMeta = coerceMeta(args.meta);
			const snapshot = consumeRequestSnapshot(sessionId, args.file_path);
			const meta = (() => {
				if (userMeta === void 0 && snapshot === void 0) return void 0;
				const merged = { ...userMeta ?? {} };
				if (snapshot !== void 0) merged.originalRequest = snapshot;
				return merged;
			})();
			let refInputs;
			if (args.references !== void 0) {
				if (!Array.isArray(args.references)) throw new AigcError("bad-request", "references must be an array of filePath strings or { filePath, relation? } objects");
				refInputs = [];
				for (const ref of args.references) if (typeof ref === "string") {
					const refEl = canvas.getElementByPath(sessionId, ref);
					refInputs.push({ uuid: refEl.uuid });
				} else if (ref !== null && typeof ref === "object") {
					const rec = ref;
					if (typeof rec.filePath !== "string" || rec.filePath === "") throw new AigcError("bad-request", "references[].filePath must be a non-empty string");
					const refEl = canvas.getElementByPath(sessionId, rec.filePath);
					const relation = typeof rec.relation === "string" ? coerceEdgeRelation(rec.relation) : void 0;
					const note = typeof rec.note === "string" ? rec.note : void 0;
					refInputs.push({
						uuid: refEl.uuid,
						relation,
						note
					});
				} else throw new AigcError("bad-request", "references[] entries must be a string or { filePath, relation? } object");
			}
			const el = await canvas.placeFile(sessionId, {
				kind,
				filePath: args.file_path,
				title: args.title ?? args.file_path.split(/[\\/]/).pop() ?? args.file_path,
				producedBy: "aigc_canvas_place",
				x: args.x,
				y: args.y,
				description,
				...args.prompt !== void 0 ? { promptText: args.prompt } : {},
				...meta !== void 0 ? { meta } : {},
				...refInputs !== void 0 ? { referenceUuids: refInputs.map((r) => r.uuid) } : {}
			}, cwd);
			if (args.status !== void 0 && args.status !== "ready" || args.winner !== void 0) {
				const status = args.status !== void 0 ? coerceElementStatus(args.status) : DEFAULT_ELEMENT_STATUS;
				await canvas.setStatus(sessionId, el.uuid, status, args.winner);
			}
			let linked = 0;
			if (refInputs !== void 0 && refInputs.length > 0) {
				const filtered = refInputs.filter((r) => r.uuid !== el.uuid);
				if (filtered.length > 0) {
					await canvas.wireEdges(sessionId, filtered, el.uuid);
					linked = filtered.length;
				}
			}
			return {
				element_path: el.filePath,
				kind: el.kind,
				title: el.title,
				x: el.x,
				y: el.y,
				linked_references: linked
			};
		}
	}));
	register(defineTool({
		name: "aigc_canvas_link",
		description: "Create (or update) an edge from an existing source element to an existing target element (both filePath-addressed) with a semantic `relation` describing WHY the source was wired to the target. Use this to record that one element was generated from / depends on / is a variant of another. If an edge already exists between the same source → target, its relation (and optional note) is UPDATED in place (re-linking with a new relation is not a no-op — it changes the relation). Edges are rendered on the canvas as arrows from source to target, with line style + label driven by the relation (solid for inputs, dashed for references, dotted for variations).",
		parameters: {
			source: {
				type: "string",
				required: true,
				description: "filePath of the source element (the input / reference)."
			},
			target: {
				type: "string",
				required: true,
				description: "filePath of the target element (the produced output)."
			},
			relation: {
				type: "string",
				required: true,
				enum: EDGE_RELATIONS,
				description: "Why the source was wired to the target. Drives the canvas line style + label and lets you reason about the dependency graph later via aigc_canvas_list_elements. Direct inputs (solid line): input / first_frame / last_frame / audio_track. References (dashed line): reference / style / mask. Variations (dotted line): variation_of (same prompt, different seed) / remix_of (changed prompt) / alternative_of (A/B candidate). Edit chain (bold solid line): edited_from (ffmpeg media_edit output → input)."
			},
			note: {
				type: "string",
				description: "Optional short note supplementing the relation (free text). Not used for rendering decisions."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					linked: {
						type: "boolean",
						required: true
					},
					source: {
						type: "string",
						required: true
					},
					target: {
						type: "string",
						required: true
					},
					relation: {
						type: "string",
						required: true,
						enum: EDGE_RELATIONS
					}
				}
			},
			render: textRender((v) => `Linked ${v.source} →[${v.relation}]→ ${v.target}.`)
		},
		execute: async (args, exec) => {
			if (typeof args.relation !== "string" || !EDGE_RELATIONS.includes(args.relation)) throw new AigcError("bad-request", `relation must be one of: ${EDGE_RELATIONS.join(", ")}`);
			const relation = args.relation;
			const sessionId = sessionIdOf(exec);
			await canvas.ensureHydrated(sessionId);
			const sourceEl = canvas.getElementByPath(sessionId, args.source);
			const targetEl = canvas.getElementByPath(sessionId, args.target);
			await canvas.wireEdges(sessionId, [{
				uuid: sourceEl.uuid,
				relation,
				...args.note !== void 0 ? { note: args.note } : {}
			}], targetEl.uuid);
			return {
				linked: true,
				source: args.source,
				target: args.target,
				relation
			};
		}
	}));
	register(defineTool({
		name: "aigc_canvas_unlink",
		description: "Remove the edge from a source element to a target element (both filePath-addressed). Idempotent: unlinking a pair that is not linked is a no-op.",
		parameters: {
			source: {
				type: "string",
				required: true,
				description: "filePath of the source element."
			},
			target: {
				type: "string",
				required: true,
				description: "filePath of the target element."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					unlinked: {
						type: "boolean",
						required: true
					},
					source: {
						type: "string",
						required: true
					},
					target: {
						type: "string",
						required: true
					}
				}
			},
			render: textRender((v) => `Unlinked ${v.source} → ${v.target}.`)
		},
		execute: async (args, exec) => {
			const sessionId = sessionIdOf(exec);
			await canvas.ensureHydrated(sessionId);
			const sourceEl = canvas.getElementByPath(sessionId, args.source);
			const targetEl = canvas.getElementByPath(sessionId, args.target);
			return canvas.unlink(sessionId, sourceEl.uuid, targetEl.uuid).then(() => ({
				unlinked: true,
				source: args.source,
				target: args.target
			}));
		}
	}));
	register(defineTool({
		name: "aigc_canvas_set_status",
		description: "Update one element's lifecycle status (draft/ready/rejected/archived) and optional winner flag. Use this to: mark a variant as the winner of a cluster (status=ready + winner=true), reject a bad generation (status=rejected — kept as a negative sample but greyed out), or archive a superseded version (status=archived — hidden from the default list_elements view). aigc_canvas_list_elements defaults to only showing `ready` elements — pass include_statuses to see others.",
		parameters: {
			element_path: {
				type: "string",
				required: true,
				description: "filePath of the element to update."
			},
			status: {
				type: "string",
				required: true,
				enum: ELEMENT_STATUSES,
				description: "New lifecycle status: draft (generating) / ready (default, visible) / rejected (否决, greyed out) / archived (superseded, hidden by default)."
			},
			winner: {
				type: "boolean",
				description: "Whether to mark this element as the winner of a variation cluster."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					element_path: {
						type: "string",
						required: true
					},
					status: {
						type: "string",
						required: true,
						enum: ELEMENT_STATUSES
					},
					winner: { type: "boolean" }
				}
			},
			render: textRender((v) => `Set element "${v.element_path}" status=${v.status}${v.winner === true ? " + winner" : ""}.`)
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			if (typeof args.status !== "string" || !ELEMENT_STATUSES.includes(args.status)) throw new AigcError("bad-request", `status must be one of: ${ELEMENT_STATUSES.join(", ")}`);
			const sessionId = sessionIdOf(exec);
			await canvas.ensureHydrated(sessionId);
			const el = canvas.getElementByPath(sessionId, args.element_path);
			const status = args.status;
			await canvas.setStatus(sessionId, el.uuid, status, args.winner);
			return {
				ok: true,
				element_path: args.element_path,
				status,
				...args.winner !== void 0 ? { winner: args.winner } : {}
			};
		}
	}));
	register(defineTool({
		name: "aigc_canvas_list_elements",
		description: "List every element and edge currently on the canvas for the calling agent's session. Returns each element's filePath (the primary identifier), kind (prompt/image/video/audio), title, canvas position (x, y), producing tool, lifecycle status, and metadata; and every edge with its semantic `relation` (source filePath →[relation]→ target filePath). By default only `ready` elements are returned (to keep your context clean) — pass `include_statuses` to see draft/rejected/archived elements too (e.g. when recovering a failed pipeline step or reviewing rejected variants). Use this to recover state after a long sequence of tool calls, to find a filePath to pass as a reference, to choose a free spot on the canvas, or to reason about how existing elements depend on each other (e.g. \"video B was generated from prompt A as first_frame + prompt C as last_frame — if B's opening is bad I can reroll just A\").",
		parameters: {
			include_statuses: {
				type: "array",
				items: {
					type: "string",
					enum: ELEMENT_STATUSES
				},
				description: `Lifecycle statuses to include (default: ["ready"]). Pass e.g. ["ready","rejected","archived"] to see all elements. Values: ${ELEMENT_STATUSES.join(" | ")}.`
			},
			summarize: {
				type: "boolean",
				description: "When true, returns a COMPRESSED view: elements omit meta/promptText (only filePath/kind/title/status/x/y), and edges omit notes. Use this in long pipelines to avoid context bloat (per doc 02 §11 risk mitigation)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					elements: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: true,
							properties: {
								filePath: {
									type: "string",
									required: true
								},
								kind: {
									type: "string",
									required: true,
									enum: [
										"prompt",
										"image",
										"video",
										"audio"
									]
								},
								title: {
									type: "string",
									required: true
								},
								x: {
									type: "number",
									required: true
								},
								y: {
									type: "number",
									required: true
								},
								createdAt: {
									type: "integer",
									required: true
								},
								producedBy: {
									type: "string",
									required: true
								},
								status: {
									type: "string",
									required: true,
									enum: ELEMENT_STATUSES
								},
								winner: { type: "boolean" },
								promptText: { type: "string" },
								mediaSize: { type: "integer" },
								meta: { type: "json" }
							}
						}
					},
					edges: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								source: {
									type: "string",
									required: true
								},
								target: {
									type: "string",
									required: true
								},
								relation: {
									type: "string",
									required: true,
									enum: EDGE_RELATIONS,
									description: "Semantic relation: why the source was wired to the target."
								},
								note: {
									type: "string",
									description: "Optional short note supplementing the relation."
								}
							}
						}
					}
				}
			},
			render: (_args, value) => {
				const v = value;
				if (v.elements.length === 0) return [{
					type: "text",
					text: "Canvas is empty for this session."
				}];
				const lines = v.elements.map((el) => `  ${el.filePath}  [${el.kind}/${el.status}${el.winner === true ? "/winner" : ""}]  @(${el.x}, ${el.y})  "${el.title}"`);
				return [{
					type: "text",
					text: `Canvas (${v.elements.length} elements, ${v.edges.length} edges):\n${lines.join("\n")}\nEdges:\n${v.edges.map((e) => `  ${e.source} →[${e.relation}]→ ${e.target}`).join("\n")}`
				}];
			}
		},
		execute: async (args, exec) => {
			const sessionId = sessionIdOf(exec);
			await canvas.ensureHydrated(sessionId);
			let includeStatuses;
			if (args.include_statuses !== void 0) {
				if (Array.isArray(args.include_statuses)) includeStatuses = args.include_statuses.map((s) => coerceElementStatus(s));
				else throw new AigcError("bad-request", "include_statuses must be an array of status strings");
			}
			const state = canvas.snapshot(sessionId, includeStatuses);
			const lookup = (uuid) => canvas.getElement(sessionId, uuid);
			const summarize = args.summarize === true;
			return Promise.resolve({
				elements: state.elements.map((el) => summarize ? elementProjectionSummarized(el) : elementProjection(el)),
				edges: state.edges.map((e) => edgeProjection(e, lookup))
			});
		}
	}));
	register(defineTool({
		name: "aigc_media_edit",
		description: "Edit media files (video / audio / images) via ffmpeg. The operation is selected by the `operation` parameter. All input files must already exist inside the session canvas directory (use file_paths from aigc_http_request or previous aigc_canvas_place calls). The output is written to the canvas directory and returned as a file_path — pass it to aigc_canvas_place to put it on the canvas.\n\nOperations:\n  concat            — concatenate 2+ videos into one. inputs: [v1, v2, ...], output_ext: mp4.\n  clip              — trim a video by time. inputs: [video], output_ext: mp4. Pass start/end (seconds) or start/duration.\n  extract_audio     — extract the audio track from a video. inputs: [video], output_ext: mp3.\n  extract_frame     — grab one frame at a timestamp. inputs: [video], output_ext: png. Pass timestamp (seconds).\n  speed             — change playback speed. inputs: [video], output_ext: mp4. Pass speed (e.g. 2 = 2x faster, 0.5 = half speed).\n  resize            — resize a video. inputs: [video], output_ext: mp4. Pass width and/or height (pixels).\n  reverse           — reverse a video (and its audio). inputs: [video], output_ext: mp4.\n  add_audio         — replace/add audio on a video. inputs: [video, audio], output_ext: mp4.\n  images_to_video   — create a slideshow from images. inputs: [img1, img2, ...], output_ext: mp4. Pass fps (default 2).",
		parameters: {
			operation: {
				type: "string",
				required: true,
				enum: MEDIA_EDIT_OPERATIONS,
				description: "The edit operation to perform."
			},
			inputs: {
				type: "array",
				required: true,
				items: { type: "string" },
				description: "Input file paths (absolute, inside the session canvas directory). 1+ for most operations; 2+ for concat; exactly 2 for add_audio."
			},
			output_ext: {
				type: "string",
				required: true,
				description: "Output file extension without dot (e.g. mp4, mp3, png). Must match the operation: mp4 for video ops, mp3 for audio, png for frames."
			},
			start: {
				type: "number",
				description: "Start time in seconds (clip only)."
			},
			end: {
				type: "number",
				description: "End time in seconds (clip only)."
			},
			duration: {
				type: "number",
				description: "Duration in seconds (clip only; overrides end)."
			},
			speed: {
				type: "number",
				description: "Speed factor (speed only). 2 = 2x faster, 0.5 = half speed."
			},
			width: {
				type: "integer",
				description: "Target width in pixels (resize only)."
			},
			height: {
				type: "integer",
				description: "Target height in pixels (resize only)."
			},
			fps: {
				type: "integer",
				description: "Frames per second (images_to_video only, default 2)."
			},
			timestamp: {
				type: "number",
				description: "Timestamp in seconds to extract (extract_frame only)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					operation: {
						type: "string",
						required: true
					},
					file_path: {
						type: "string",
						required: true,
						description: "Absolute path of the output file. Pass this to aigc_canvas_place."
					},
					file_size: {
						type: "integer",
						required: true,
						description: "Output file size in bytes."
					},
					duration_ms: {
						type: "integer",
						required: true,
						description: "Processing time in milliseconds."
					}
				}
			},
			render: textRender((v) => `${v.operation} → ${v.file_path} (${v.file_size} bytes, ${v.duration_ms}ms). Place it with aigc_canvas_place.`)
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			const cwd = resolveCwd(sessionId);
			if (!MEDIA_EDIT_OPERATIONS.includes(args.operation)) throw new AigcError("bad-request", `unsupported operation: ${args.operation}`);
			const operation = args.operation;
			const minInputs = operation === "concat" ? 2 : operation === "add_audio" ? 2 : 1;
			if (!Array.isArray(args.inputs) || args.inputs.length < minInputs) throw new AigcError("bad-request", `operation "${operation}" requires at least ${minInputs} input(s)`);
			const result = await executeMediaEdit({
				operation,
				inputs: args.inputs,
				outputExt: args.output_ext,
				start: args.start,
				end: args.end,
				duration: args.duration,
				speed: args.speed,
				width: args.width,
				height: args.height,
				fps: args.fps,
				timestamp: args.timestamp
			}, cwd, sessionId, {
				timeoutMs: getTimeoutMs(),
				signal: exec.signal
			});
			const { stat: statFile } = await import("node:fs/promises");
			const outInfo = await statFile(result.outputPath);
			logMediaEdit(sessionId, operation, args.inputs, {
				ok: true,
				outputPath: result.outputPath,
				durationMs: result.durationMs,
				size: outInfo.size
			});
			return {
				ok: true,
				operation: result.operation,
				file_path: result.outputPath,
				file_size: outInfo.size,
				duration_ms: result.durationMs
			};
		}
	}));
	register(defineTool({
		name: "aigc_pipeline_run",
		description: "Submit a declarative pipeline spec (a list of AIGC steps wired by declared input edges) and start executing it. The host topologically sorts the steps, runs independent branches in parallel, places each step's output on the canvas, wires edges to the step's inputs, and notifies you of progress via agent.inject (you do NOT need to poll). Use this for compound goals like \"make a 30s product ad\" (t2i → i2v → tts → add_audio → clip) instead of calling aigc_http_request + aigc_canvas_place in sequence. On step failure the pipeline pauses (onError=abort) or continues independent branches (onError=continue); call aigc_pipeline_resume to retry failed steps (optionally with step_overrides to swap provider/params). Call aigc_pipeline_status to query state, aigc_pipeline_cancel to abort, aigc_pipeline_list to see all pipelines. Pipeline state is persisted to <cwd>/.dsh-aigc-canvas/<sessionId>/pipelines/<pipeline_id>.json so a crashed session can be resumed. Each step's output element has producedBy=\"aigc_pipeline\".",
		parameters: {
			spec: {
				type: "json",
				required: true,
				description: "The PipelineSpec object: { name: string, onError: \"abort\"|\"continue\", steps: StepSpec[] }. Each StepSpec: { id: string, capability?: \"t2i\"|\"i2i\"|\"t2v\"|\"i2v\"|\"fl2v\"|\"ref2v\"|\"tts\"|\"music\"|\"transcribe\"|\"edit\"|\"chat\", operation?: \"concat\"|\"clip\"|\"extract_audio\"|\"extract_frame\"|\"speed\"|\"resize\"|\"reverse\"|\"add_audio\"|\"images_to_video\", inputs?: Array<{ from: string (step id), relation?: \"input\"|\"first_frame\"|\"last_frame\"|\"audio_track\"|\"reference\"|\"style\"|\"mask\"|\"variation_of\"|\"remix_of\"|\"alternative_of\"|\"edited_from\" }>, params: Record<string, unknown>, provider_id?: string, when?: string }. Use {{param_name}} placeholders in strings (prompt text, etc.) and pass values via the `params` argument. Example: { name: \"30s ad\", onError: \"abort\", steps: [{ id: \"img\", capability: \"t2i\", params: { prompt: \"product photo of {{product}}\" } }, { id: \"vid\", capability: \"i2v\", inputs: [{ from: \"img\", relation: \"first_frame\" }], params: { prompt: \"pan around\" } }] }"
			},
			params: {
				type: "json",
				description: "Template parameter values for {{placeholder}} substitution in the spec (e.g. { product: \"iPhone 17\", tagline: \"未来已来\" }). Applied to every string in the spec (prompt text, etc.) before execution. Optional when the spec has no placeholders."
			},
			async: {
				type: "boolean",
				description: "true (default) = return immediately with pipeline_id; progress flows via agent.inject (preferred for long pipelines). false = block this tool call until the pipeline completes or fails (use for short pipelines or when you need the final state synchronously)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					pipeline_id: {
						type: "string",
						required: true,
						description: "The pipeline id (use with aigc_pipeline_status / resume / cancel)."
					},
					name: {
						type: "string",
						required: true
					},
					status: {
						type: "string",
						required: true,
						enum: [
							"running",
							"completed",
							"failed",
							"cancelled"
						]
					},
					steps: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								status: {
									type: "string",
									required: true,
									enum: [
										"pending",
										"running",
										"completed",
										"failed",
										"skipped"
									]
								},
								element_path: {
									type: "string",
									description: "filePath of the produced canvas element (when status is \"completed\")."
								},
								error: {
									type: "string",
									description: "Failure message (when status is \"failed\")."
								},
								started_at: { type: "integer" },
								finished_at: { type: "integer" }
							}
						}
					}
				}
			},
			render: textRender((v) => {
				const completed = v.steps.filter((s) => s.status === "completed").length;
				const failed = v.steps.filter((s) => s.status === "failed").length;
				const summary = v.steps.map((s) => `  ${s.status === "completed" ? "✓" : s.status === "failed" ? "✗" : s.status === "running" ? "⏳" : "○"} ${s.id}${s.element_path !== void 0 ? ` → ${s.element_path}` : ""}`);
				return `Pipeline "${v.name}" (${v.pipeline_id}): ${v.status} — ${completed}/${v.steps.length} done${failed > 0 ? `, ${failed} failed` : ""}.\n${summary.join("\n")}`;
			})
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			if (args.spec === null || typeof args.spec !== "object" || Array.isArray(args.spec)) throw new AigcError("bad-request", "spec must be a PipelineSpec object");
			const spec = args.spec;
			let templateParams;
			if (args.params !== void 0) {
				if (args.params === null || typeof args.params !== "object" || Array.isArray(args.params)) throw new AigcError("bad-request", "params must be a Record<string, string>");
				templateParams = args.params;
			}
			const isAsync = typeof args.async === "boolean" ? args.async : true;
			const state = await pipelineEngine.start(sessionId, spec, templateParams);
			if (isAsync) {
				const abort = new AbortController();
				pipelineEngine.run(state, abort).catch(() => {});
				return pipelineStateProjection(state);
			}
			const abort = new AbortController();
			const onToolAbort = () => abort.abort(/* @__PURE__ */ new Error("tool call aborted"));
			exec.signal.addEventListener("abort", onToolAbort, { once: true });
			try {
				return pipelineStateProjection(await pipelineEngine.run(state, abort));
			} finally {
				exec.signal.removeEventListener("abort", onToolAbort);
			}
		}
	}));
	register(defineTool({
		name: "aigc_pipeline_status",
		description: "Query the current state of one pipeline (running / completed / failed / cancelled) and its steps. Returns each step's status (pending/running/completed/failed/skipped), element_path (when completed), and error (when failed). Use this after aigc_pipeline_run (async=true) to check progress, or after aigc_pipeline_resume to verify the retry succeeded. For long-running pipelines, prefer waiting for the agent.inject progress notifications instead of polling.",
		parameters: { pipeline_id: {
			type: "string",
			required: true,
			description: "The pipeline id returned by aigc_pipeline_run."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					pipeline_id: {
						type: "string",
						required: true
					},
					name: {
						type: "string",
						required: true
					},
					status: {
						type: "string",
						required: true,
						enum: [
							"running",
							"completed",
							"failed",
							"cancelled"
						]
					},
					steps: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								status: {
									type: "string",
									required: true,
									enum: [
										"pending",
										"running",
										"completed",
										"failed",
										"skipped"
									]
								},
								element_path: { type: "string" },
								error: { type: "string" },
								started_at: { type: "integer" },
								finished_at: { type: "integer" }
							}
						}
					}
				}
			},
			render: textRender((v) => {
				const completed = v.steps.filter((s) => s.status === "completed").length;
				const lines = v.steps.map((s) => `  ${s.status === "completed" ? "✓" : s.status === "failed" ? "✗" : s.status === "running" ? "⏳" : "○"} ${s.id}${s.element_path !== void 0 ? ` → ${s.element_path}` : ""}${s.error !== void 0 ? ` (error: ${s.error})` : ""}`);
				return `Pipeline "${v.name}" (${v.pipeline_id}): ${v.status} — ${completed}/${v.steps.length} done.\n${lines.join("\n")}`;
			})
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			return pipelineStateProjection(await pipelineEngine.status(sessionId, args.pipeline_id));
		}
	}));
	register(defineTool({
		name: "aigc_pipeline_resume",
		description: "Resume a paused/failed pipeline from its breakpoint. Skips steps that already completed (their element_path is reused by downstream steps), retries failed/skipped steps, and continues any pending downstream steps. Optionally pass step_overrides to modify specific steps before retrying — e.g. swap a failed step's provider_id, or merge in new params. Pipeline state is loaded from <cwd>/.dsh-aigc-canvas/<sessionId>/pipelines/<pipeline_id>.json so resume survives a host restart. Typical flow: pipeline fails at step 3 (provider 429) → ask user how to retry → call aigc_pipeline_resume with { pipeline_id, step_overrides: { step_3: { provider_id: \"openai\" } } } → host skips steps 1-2, retries step 3 with the new provider, continues steps 4-5. Sync (blocks until the retry completes).",
		parameters: {
			pipeline_id: {
				type: "string",
				required: true,
				description: "The pipeline id to resume."
			},
			step_overrides: {
				type: "json",
				description: "Optional map of step_id → { provider_id?, params? } applied to the spec before retrying. provider_id replaces the step's declared provider; params are MERGED into the step's params (overrides matching keys). Example: { narration: { provider_id: \"openai\" }, with_audio: { params: { volume: 0.8 } } }."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					pipeline_id: {
						type: "string",
						required: true
					},
					name: {
						type: "string",
						required: true
					},
					status: {
						type: "string",
						required: true,
						enum: [
							"running",
							"completed",
							"failed",
							"cancelled"
						]
					},
					steps: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								status: {
									type: "string",
									required: true,
									enum: [
										"pending",
										"running",
										"completed",
										"failed",
										"skipped"
									]
								},
								element_path: { type: "string" },
								error: { type: "string" },
								started_at: { type: "integer" },
								finished_at: { type: "integer" }
							}
						}
					}
				}
			},
			render: textRender((v) => {
				const completed = v.steps.filter((s) => s.status === "completed").length;
				return `Pipeline "${v.name}" resumed (${v.pipeline_id}): ${v.status} — ${completed}/${v.steps.length} done.`;
			})
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			let overrides;
			if (args.step_overrides !== void 0) {
				if (args.step_overrides === null || typeof args.step_overrides !== "object" || Array.isArray(args.step_overrides)) throw new AigcError("bad-request", "step_overrides must be a Record<string, { provider_id?, params? }>");
				const raw = args.step_overrides;
				overrides = {};
				for (const [stepId, value] of Object.entries(raw)) {
					if (value === null || typeof value !== "object" || Array.isArray(value)) throw new AigcError("bad-request", `step_overrides["${stepId}"] must be an object { provider_id?, params? }`);
					const rec = value;
					const ov = {};
					if (rec.provider_id !== void 0) {
						if (typeof rec.provider_id !== "string") throw new AigcError("bad-request", `step_overrides["${stepId}"].provider_id must be a string`);
						ov.provider_id = rec.provider_id;
					}
					if (rec.params !== void 0) {
						if (rec.params === null || typeof rec.params !== "object" || Array.isArray(rec.params)) throw new AigcError("bad-request", `step_overrides["${stepId}"].params must be an object`);
						ov.params = rec.params;
					}
					overrides[stepId] = ov;
				}
			}
			return pipelineStateProjection(await pipelineEngine.resume(sessionId, args.pipeline_id, overrides));
		}
	}));
	register(defineTool({
		name: "aigc_pipeline_cancel",
		description: "Cancel a running pipeline. Aborts in-flight steps via AbortSignal; remaining pending/running steps are marked \"skipped\". Already-completed steps keep their canvas elements (keep_artifacts controls future behavior — currently artifacts are always kept; the canvas owns element lifecycle, use aigc_canvas_place + aigc_canvas_unlink or canvas.delete API to remove them explicitly). Returns the count of completed steps at cancel time. Idempotent: cancelling an already-finished pipeline returns cancelled=false with the persisted completed count.",
		parameters: {
			pipeline_id: {
				type: "string",
				required: true,
				description: "The pipeline id to cancel."
			},
			keep_artifacts: {
				type: "boolean",
				description: "Whether to keep already-generated canvas elements (default true). Currently always true — artifacts are owned by the canvas service and not auto-deleted."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					cancelled: {
						type: "boolean",
						required: true,
						description: "true if a running pipeline was actively aborted; false if it was already finished."
					},
					completed_steps: {
						type: "integer",
						required: true,
						description: "How many steps had completed when the cancel took effect."
					}
				}
			},
			render: textRender((v) => v.cancelled ? `Pipeline cancelled. ${v.completed_steps} step(s) had completed; their canvas elements are preserved.` : `Pipeline was not running (already finished). ${v.completed_steps} step(s) completed.`)
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			const keepArtifacts = typeof args.keep_artifacts === "boolean" ? args.keep_artifacts : true;
			return pipelineEngine.cancel(sessionId, args.pipeline_id, keepArtifacts);
		}
	}));
	register(defineTool({
		name: "aigc_pipeline_list",
		description: "List all pipelines for the calling session (running + completed + failed + cancelled). Returns a compact summary per pipeline (id, name, status, started_at, finished_at, step_count, completed_count). Use this to discover pipelines from a prior session or to find a pipeline_id you forgot. For full step detail, call aigc_pipeline_status with one pipeline_id.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { pipelines: {
					type: "array",
					required: true,
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							pipeline_id: {
								type: "string",
								required: true
							},
							name: {
								type: "string",
								required: true
							},
							status: {
								type: "string",
								required: true,
								enum: [
									"running",
									"completed",
									"failed",
									"cancelled"
								]
							},
							started_at: {
								type: "integer",
								required: true
							},
							finished_at: { type: "integer" },
							step_count: {
								type: "integer",
								required: true
							},
							completed_count: {
								type: "integer",
								required: true
							}
						}
					}
				} }
			},
			render: textRender((v) => {
				if (v.pipelines.length === 0) return "No pipelines for this session yet.";
				const lines = v.pipelines.map((p) => `  ${p.pipeline_id}  "${p.name}"  ${p.status}  ${p.completed_count}/${p.step_count} steps`);
				return `Pipelines (${v.pipelines.length}):\n${lines.join("\n")}`;
			})
		},
		async execute(_args, exec) {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			return { pipelines: (await pipelineEngine.list(sessionId)).map((s) => ({
				pipeline_id: s.pipeline_id,
				name: s.name,
				status: s.status,
				started_at: s.started_at,
				...s.finished_at !== void 0 ? { finished_at: s.finished_at } : {},
				step_count: s.step_count,
				completed_count: s.completed_count
			})) };
		}
	}));
	register(defineTool({
		name: "aigc_template_list",
		description: "List all available pipeline templates (per docs/product/02-pipeline.md §7). Returns built-in templates (shipped with the plugin) PLUS user-saved templates from ~/.dsh/aigc-canvas/templates/. A user-saved template shadows a built-in of the same name. Each entry shows: name, description, source (\"built-in\" or \"user\"), param_count, step_count, and the declared params (name/type/required). Use aigc_template_get to fetch one template's full spec, or aigc_template_instantiate to start a pipeline from a template.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { templates: {
					type: "array",
					required: true,
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							name: {
								type: "string",
								required: true
							},
							description: {
								type: "string",
								required: true
							},
							source: {
								type: "string",
								required: true,
								enum: ["built-in", "user"]
							},
							param_count: {
								type: "integer",
								required: true
							},
							step_count: {
								type: "integer",
								required: true
							},
							params: {
								type: "array",
								required: true,
								items: {
									type: "object",
									additionalProperties: false,
									properties: {
										name: {
											type: "string",
											required: true
										},
										type: {
											type: "string",
											required: true,
											enum: [
												"string",
												"number",
												"boolean"
											]
										},
										required: {
											type: "boolean",
											required: true
										}
									}
								},
								description: "Declared params (call aigc_template_get for full details including defaults + descriptions)."
							}
						}
					}
				} }
			},
			render: textRender((v) => {
				if (v.templates.length === 0) return "No pipeline templates available.";
				const lines = v.templates.map((t) => `  [${t.source}] ${t.name}  (${t.step_count} steps, ${t.param_count} params)  ${t.description}`);
				return `Pipeline templates (${v.templates.length}):\n${lines.join("\n")}\nCall aigc_template_instantiate with one name + params to start a pipeline.`;
			})
		},
		async execute() {
			return { templates: (await listTemplates()).map((t) => ({
				name: t.name,
				description: t.description,
				source: t.source,
				param_count: t.param_count,
				step_count: t.step_count,
				params: t.params.map((p) => ({
					name: p.name,
					type: p.type,
					required: p.required
				}))
			})) };
		}
	}));
	register(defineTool({
		name: "aigc_template_get",
		description: "Fetch one template's full spec + param declarations (per docs/product/02-pipeline.md §7). Use this when you need the exact StepSpec[] shape to understand what the template does, or to read the param defaults + descriptions before calling aigc_template_instantiate. The returned `spec` is the raw PipelineSpec (with {{param}} placeholders still in place) — pass it to aigc_template_instantiate (NOT aigc_pipeline_run, which would skip param validation).",
		parameters: { name: {
			type: "string",
			required: true,
			description: "The template name (from aigc_template_list). Built-ins: " + BUILTIN_TEMPLATES.map((t) => t.name).join(", ") + "."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					name: {
						type: "string",
						required: true
					},
					description: {
						type: "string",
						required: true
					},
					source: {
						type: "string",
						required: true,
						enum: ["built-in", "user"]
					},
					params: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								name: {
									type: "string",
									required: true
								},
								type: {
									type: "string",
									required: true,
									enum: [
										"string",
										"number",
										"boolean"
									]
								},
								required: {
									type: "boolean",
									required: true
								},
								default: {
									type: "string",
									description: "Default value (stringified; omitted when no default)."
								},
								description: { type: "string" }
							}
						}
					},
					spec: {
						type: "json",
						required: true,
						description: "The full PipelineSpec (with {{param}} placeholders)."
					}
				}
			},
			render: textRender((v) => {
				const paramList = v.params.map((p) => `${p.name}${p.required ? "*" : ""}${p.default !== void 0 ? `="${p.default}"` : ""}`).join(", ");
				const stepList = v.spec.steps.map((s) => `    - ${s.id}${s.capability !== void 0 ? ` (${s.capability})` : s.operation !== void 0 ? ` (${s.operation})` : ""}`).join("\n");
				return `Template [${v.source}] "${v.name}": ${v.description}\n  params: ${paramList || "(none)"}\n  steps (${v.spec.steps.length}):\n${stepList}`;
			})
		},
		async execute(args) {
			if (typeof args.name !== "string" || args.name === "") throw new AigcError("bad-request", "name is required");
			const tpl = await getTemplate(args.name);
			return {
				name: tpl.name,
				description: tpl.description,
				source: tpl.source,
				params: tpl.params.map((p) => ({
					name: p.name,
					type: p.type,
					required: p.required,
					...p.default !== void 0 ? { default: String(p.default) } : {},
					...p.description !== void 0 ? { description: p.description } : {}
				})),
				spec: tpl.spec
			};
		}
	}));
	register(defineTool({
		name: "aigc_template_instantiate",
		description: "Instantiate a pipeline template by name (per docs/product/02-pipeline.md §7). Validates the caller-supplied params against the template's ParamSpec declarations (required params must be present; unknown params are rejected), substitutes {{param}} placeholders in every spec string with the param values, then starts the pipeline via the same PipelineEngine.start() + run() path that aigc_pipeline_run uses — so progress notifications, canvas placement, edge wiring, breakpoint resume, and cancel all work identically. Use aigc_template_list to see available templates + their param names. Use aigc_template_get to see the full spec. Typical flow: user says \"做个 30 秒 iPhone 17 广告片，旁白是'未来已来'\" → call this tool with template=\"30s-product-ad\", params={product_name:\"iPhone 17\", tagline:\"未来已来\"} → receive pipeline_id + progress notifications → final video on the canvas.",
		parameters: {
			name: {
				type: "string",
				required: true,
				description: "The template name (built-in or user-saved). See aigc_template_list."
			},
			params: {
				type: "json",
				description: "Template param values keyed by name. Required params MUST be present (else the call rejects with a bad-request error listing the missing one). Optional params with defaults are filled automatically when omitted. Example for 30s-product-ad: { product_name: \"iPhone 17\", tagline: \"未来已来\", voice: \"male_en\" }."
			},
			async: {
				type: "boolean",
				description: "true (default) = return immediately with pipeline_id; progress flows via agent.inject (preferred for long pipelines). false = block this tool call until the pipeline completes or fails (use for short templates like simple-t2i)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					pipeline_id: {
						type: "string",
						required: true,
						description: "The pipeline id (use with aigc_pipeline_status / resume / cancel)."
					},
					template_name: {
						type: "string",
						required: true,
						description: "The template name that was instantiated."
					},
					name: {
						type: "string",
						required: true,
						description: "The resolved pipeline name (after {{param}} substitution)."
					},
					status: {
						type: "string",
						required: true,
						enum: [
							"running",
							"completed",
							"failed",
							"cancelled"
						]
					},
					steps: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								status: {
									type: "string",
									required: true,
									enum: [
										"pending",
										"running",
										"completed",
										"failed",
										"skipped"
									]
								},
								element_path: { type: "string" },
								error: { type: "string" },
								started_at: { type: "integer" },
								finished_at: { type: "integer" }
							}
						}
					}
				}
			},
			render: textRender((v) => {
				const completed = v.steps.filter((s) => s.status === "completed").length;
				const summary = v.steps.map((s) => `  ${s.status === "completed" ? "✓" : s.status === "failed" ? "✗" : s.status === "running" ? "⏳" : "○"} ${s.id}${s.element_path !== void 0 ? ` → ${s.element_path}` : ""}`);
				return `Instantiated template "${v.template_name}" → pipeline "${v.name}" (${v.pipeline_id}): ${v.status} — ${completed}/${v.steps.length} done.\n${summary.join("\n")}`;
			})
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			if (typeof args.name !== "string" || args.name === "") throw new AigcError("bad-request", "name is required (the template name to instantiate)");
			let callerParams;
			if (args.params !== void 0) {
				if (args.params === null || typeof args.params !== "object" || Array.isArray(args.params)) throw new AigcError("bad-request", "params must be a JSON object of {param_name: value}");
				callerParams = args.params;
			}
			const tpl = await getTemplate(args.name);
			const resolvedSpec = instantiateTemplateSpec(tpl, callerParams);
			const sessionId = sessionIdOf(exec);
			const isAsync = typeof args.async === "boolean" ? args.async : true;
			const state = await pipelineEngine.start(sessionId, resolvedSpec);
			if (isAsync) {
				const abort = new AbortController();
				pipelineEngine.run(state, abort).catch(() => {});
				return {
					...pipelineStateProjection(state),
					template_name: tpl.name
				};
			}
			const abort = new AbortController();
			const onToolAbort = () => abort.abort(/* @__PURE__ */ new Error("tool call aborted"));
			exec.signal.addEventListener("abort", onToolAbort, { once: true });
			try {
				return {
					...pipelineStateProjection(await pipelineEngine.run(state, abort)),
					template_name: tpl.name
				};
			} finally {
				exec.signal.removeEventListener("abort", onToolAbort);
			}
		}
	}));
	register(defineTool({
		name: "aigc_template_save",
		description: "Save the current session's pipeline as a reusable template (per docs/product/02-pipeline.md §7). Loads the pipeline's resolved spec (the spec AFTER {{param}} substitution was applied at run time) and persists it as a TemplateSpec at ~/.dsh/aigc-canvas/templates/<name>.json so it shows up in aigc_template_list / aigc_template_get / aigc_template_instantiate. The saved spec has placeholders BAKED IN (concrete values from the original run), so you typically want to edit the JSON file to re-introduce {{param}} placeholders + declare them in the params array before reusing. A user-saved template with the same name as a built-in shadows the built-in (the disk copy wins at read time). Optionally pass an explicit `params` array to declare template params upfront (the agent can document the placeholders it intends to re-introduce).",
		parameters: {
			pipeline_id: {
				type: "string",
				required: true,
				description: "The pipeline id (from aigc_pipeline_run / aigc_template_instantiate) whose resolved spec should be saved."
			},
			name: {
				type: "string",
				required: true,
				description: "The template name (lowercase-hyphenated, e.g. \"my-product-ad\"). Used as the filename: <name>.json. Overwrites an existing template with the same name."
			},
			description: {
				type: "string",
				description: "Template description (what it does). Defaults to the pipeline's name."
			},
			params: {
				type: "json",
				description: "Optional ParamSpec[] array to declare template params upfront. Shape: [{ name: string, type: \"string\"|\"number\"|\"boolean\", required: boolean, default?: string|number|boolean, description?: string }]. Defaults to an empty array (the saved spec has no declared params — add them later by editing the JSON file). NOTE: this does NOT re-introduce {{param}} placeholders into the spec — the spec is saved as the resolved (post-substitution) version."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					name: {
						type: "string",
						required: true,
						description: "The saved template name."
					},
					source: {
						type: "string",
						required: true,
						enum: ["user"]
					},
					file_path: {
						type: "string",
						required: true,
						description: "Absolute path of the saved template JSON file."
					},
					step_count: {
						type: "integer",
						required: true,
						description: "Number of steps in the saved spec."
					},
					param_count: {
						type: "integer",
						required: true,
						description: "Number of declared params (0 when none provided)."
					}
				}
			},
			render: textRender((v) => `Saved template "${v.name}" → ${v.file_path} (${v.step_count} steps, ${v.param_count} declared params). It now appears in aigc_template_list.`)
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			if (typeof args.pipeline_id !== "string" || args.pipeline_id === "") throw new AigcError("bad-request", "pipeline_id is required");
			if (typeof args.name !== "string" || args.name === "") throw new AigcError("bad-request", "name is required");
			const sessionId = sessionIdOf(exec);
			const state = await pipelineEngine.status(sessionId, args.pipeline_id);
			let paramDecls = [];
			if (args.params !== void 0) {
				if (args.params === null || typeof args.params !== "object" || !Array.isArray(args.params)) throw new AigcError("bad-request", "params must be an array of ParamSpec objects");
				paramDecls = args.params.map((p, i) => {
					if (p === null || typeof p !== "object" || Array.isArray(p)) throw new AigcError("bad-request", `params[${i}] must be a ParamSpec object`);
					const o = p;
					if (typeof o.name !== "string" || o.name === "") throw new AigcError("bad-request", `params[${i}].name is required`);
					if (typeof o.type !== "string" || ![
						"string",
						"number",
						"boolean"
					].includes(o.type)) throw new AigcError("bad-request", `params[${i}].type must be one of: string, number, boolean`);
					if (typeof o.required !== "boolean") throw new AigcError("bad-request", `params[${i}].required must be a boolean`);
					return {
						name: o.name,
						type: o.type,
						required: o.required,
						...o.default !== void 0 ? { default: o.default } : {},
						...typeof o.description === "string" ? { description: o.description } : {}
					};
				});
			}
			const template = {
				name: args.name,
				description: typeof args.description === "string" ? args.description : state.name,
				params: paramDecls,
				spec: state.spec
			};
			const saved = await saveTemplate(template);
			return {
				name: saved.name,
				source: saved.source,
				file_path: saved.file_path,
				step_count: template.spec.steps.length,
				param_count: template.params.length
			};
		}
	}));
	disposers.push(() => {});
	return () => {
		for (const dispose of disposers) dispose();
	};
}
/** Save a response body (bytes or text) into the session canvas directory. */
async function saveResponseToSession(content, ext, sessionId, cwd) {
	const dir = canvasDirFor(cwd, sessionId);
	await mkdir(dir, { recursive: true });
	const filePath = join(dir, `${randomUUID()}.${ext}`);
	await writeFile(filePath, content);
	return filePath;
}
/** Common field names that hold a prompt/text in AIGC request bodies. */
const PROMPT_FIELD_CANDIDATES = [
	"prompt",
	"text",
	"input"
];
/**
* Find the prompt field name in one AIGC request body. Returns the first
* of `prompt` / `text` / `input` that the body has, or undefined when the
* body doesn't look like a typical AIGC request (e.g. chat completions
* use `messages[0].content` — reroll of chat is not supported).
*/
function findPromptField(body) {
	if (body === void 0) return void 0;
	for (const key of PROMPT_FIELD_CANDIDATES) if (typeof body[key] === "string") return key;
}
/**
* Apply a reroll patch to the original request body. Returns the patched
* body (a structured object when the original was an object; a raw string
* when the original was a string; undefined when no body).
*
* Patch fields:
*  - seed?: number — overrides body.seed (or adds one if missing)
*  - prompt_replace?: string — replaces the prompt field entirely
*  - prompt_delta?: string — appends to the prompt field
*  - size?: string — overrides body.size
*  - Any other field overrides the corresponding body field directly
*
* When `seed` is NOT in the patch AND the body has a seed field, the seed
* is randomized (so a reroll with no patch yields a different result).
*/
function applyRerollPatch(originalBody, patch) {
	if (originalBody === void 0) return;
	if (typeof originalBody === "string") try {
		return applyPatchToObject(JSON.parse(originalBody), patch);
	} catch {
		return originalBody;
	}
	if (isPlainObject(originalBody)) return applyPatchToObject(originalBody, patch);
	return originalBody;
}
/** Apply the patch to a parsed JSON object body. */
function applyPatchToObject(body, patch) {
	const result = { ...body };
	const promptField = findPromptField(result);
	if (typeof patch.prompt_replace === "string" && promptField !== void 0) result[promptField] = patch.prompt_replace;
	else if (typeof patch.prompt_delta === "string" && promptField !== void 0) result[promptField] = (typeof result[promptField] === "string" ? result[promptField] : "") + patch.prompt_delta;
	if (typeof patch.seed === "number") result.seed = patch.seed;
	else if ("seed" in result) result.seed = Math.floor(Math.random() * 1e9);
	if (typeof patch.size === "string") result.size = patch.size;
	for (const [key, value] of Object.entries(patch)) {
		if (key === "seed" || key === "prompt_replace" || key === "prompt_delta" || key === "size") continue;
		result[key] = value;
	}
	return result;
}
/**
* Randomize the `seed` field of a body object in place. Returns the same
* object. No-op when the body has no `seed` field (some APIs don't accept
* a seed and would error if we added one).
*/
function randomizeSeedInPlace(body) {
	if ("seed" in body) body.seed = Math.floor(Math.random() * 1e9);
	return body;
}
/**
* Compute grid positions for `count` new elements placed to the right of
* a source element. count=1 → single spot at the source's right-center;
* count>1 → a 2-column grid (or N×1 for small N) vertically centered on
* the source.
*
* Uses the same NODE_W_REF (240) + gap (20) layout as the canvas auto-placement.
*/
function gridPositionsRightOf(srcX, srcY, count) {
	const NODE_W = 240;
	const NODE_H = 110;
	const GAP_X = 20;
	const GAP_Y = 16;
	const startX = srcX + NODE_W + GAP_X;
	const centerY = srcY + NODE_H / 2;
	if (count === 1) return [{
		x: startX,
		y: srcY
	}];
	const cols = count <= 2 ? count : 2;
	const rows = Math.ceil(count / cols);
	const topY = centerY - (rows * NODE_H + (rows - 1) * GAP_Y) / 2;
	const positions = [];
	for (let i = 0; i < count; i++) {
		const col = i % cols;
		const row = Math.floor(i / cols);
		positions.push({
			x: startX + col * 260,
			y: topY + row * 126
		});
	}
	return positions;
}
/**
* Compute positions for `count` variation elements placed relative to a
* source element (or at the auto-position anchor when there is no source).
* Three layouts:
*  - "grid": 2-column grid to the right of the source (or starting at the
*    anchor when hasSource is false). Delegates to gridPositionsRightOf
*    when a source exists.
*  - "row": single horizontal row starting to the right of the source
*    (or at the anchor when hasSource is false), at the source's y.
*  - "column": single vertical column starting to the right of the source
*    (or at the anchor when hasSource is false), stacked below the source.
*
* Uses the same NODE_W (240) + NODE_H (110) + gaps as gridPositionsRightOf
* so variation layout matches the existing reroll grid visually.
*/
function variationPositions(srcX, srcY, count, layout, hasSource) {
	const NODE_W = 240;
	const NODE_H = 110;
	const GAP_X = 20;
	const GAP_Y = 16;
	const startX = hasSource ? srcX + NODE_W + GAP_X : srcX;
	if (layout === "grid") {
		if (hasSource) return gridPositionsRightOf(srcX, srcY, count);
		const cols = count <= 2 ? count : 2;
		const rows = Math.ceil(count / cols);
		const totalH = rows * NODE_H + (rows - 1) * GAP_Y;
		const topY = srcY + NODE_H / 2 - totalH / 2;
		const positions = [];
		for (let i = 0; i < count; i++) {
			const col = i % cols;
			const row = Math.floor(i / cols);
			positions.push({
				x: startX + col * 260,
				y: topY + row * 126
			});
		}
		return positions;
	}
	if (layout === "row") {
		const positions = [];
		for (let i = 0; i < count; i++) positions.push({
			x: startX + i * 260,
			y: srcY
		});
		return positions;
	}
	const positions = [];
	for (let i = 0; i < count; i++) positions.push({
		x: startX,
		y: srcY + i * 126
	});
	return positions;
}
/**
* Save one reroll provider response to disk + build the RequestSnapshot
* for the new file (so the reroll can itself be re-rerolled). Mirrors the
* save + snapshot logic of aigc_http_request but operates on the reroll's
* already-built request (no $base64 expansion — the patched body is sent
* as-is, placeholders were resolved during the original request and are
* preserved in originalRequest.body).
*/
async function saveRerollResponse(result, sessionId, cwd, providerId, originalRequest, patchedBody, durationMs) {
	const buildSnapshot = (filePath, size, kind) => ({
		providerId,
		method: originalRequest.method,
		path: originalRequest.path,
		...originalRequest.query !== void 0 ? { query: originalRequest.query } : {},
		...originalRequest.headers !== void 0 ? { headers: originalRequest.headers } : {},
		...patchedBody !== void 0 ? { body: patchedBody } : {},
		responseInfo: {
			status: result.status,
			contentType: result.contentType,
			kind,
			...size !== void 0 ? { size } : {},
			durationMs
		}
	});
	switch (result.kind) {
		case "json":
		case "text": {
			if (result.kind === "json") {
				const extracted = extractOpenAIB64Image(result.text);
				if (extracted !== null) {
					if (extracted.bytes.byteLength > getMediaLimitSafe()) throw new AigcError("backend-error", `reroll extracted image too large (${extracted.bytes.byteLength} bytes > ${getMediaLimitSafe()} limit)`, 413);
					const filePath = await saveResponseToSession(extracted.bytes, extracted.ext, sessionId, cwd);
					return {
						filePath,
						kind: "image",
						snapshot: buildSnapshot(filePath, extracted.bytes.byteLength, "image")
					};
				}
			}
			const filePath = await saveResponseToSession(result.text, result.kind === "json" ? "json" : "txt", sessionId, cwd);
			return {
				filePath,
				kind: "prompt",
				snapshot: buildSnapshot(filePath, Buffer.byteLength(result.text), result.kind)
			};
		}
		default: {
			const ext = extensionForBinaryKind(result.kind, result.contentType);
			if (result.size > getMediaLimitSafe()) throw new AigcError("backend-error", `reroll response too large (${result.size} bytes > ${getMediaLimitSafe()} limit)`, 413);
			const filePath = await saveResponseToSession(result.bytes, ext, sessionId, cwd);
			return {
				filePath,
				kind: result.kind === "other" ? "prompt" : result.kind,
				snapshot: buildSnapshot(filePath, result.size, result.kind)
			};
		}
	}
}
/**
* Get the media size limit. Wraps the closure passed to registerTools so
* helpers outside the registerTools scope can access it.
*
* This is a module-level reference that registerTools sets on entry; the
* helpers (saveRerollResponse) read it through this getter.
*/
let _getMediaLimit = () => 104857600;
function getMediaLimitSafe() {
	return _getMediaLimit();
}
/**
* Spec-driven response processing: when the provider has an EndpointSpec
* for the called (path, method), use spec.response.kind + spec.response.path
* to extract the payload from a JSON response body. Returns null when the
* spec doesn't apply (e.g. kind is 'json_text' or 'binary' — the caller
* falls back to the legacy handling).
*
* Handles:
*  - b64_json_array / b64_json_field: extract the base64 string via
*    spec.response.path, decode, save to disk. Returns kind 'image' (or
*    video/audio based on magic bytes — see extensionForBinaryKind).
*  - url_field: extract the URL via spec.response.path, do a secondary GET
*    (same-origin, with provider auth), save the bytes to disk.
*  - json_text / binary: returns null (caller falls back to legacy handling).
*/
async function processResponseBySpec(spec, textBody, provider, opts, sessionId, cwd) {
	const responseKind = spec.response.kind;
	if (responseKind === "json_text" || responseKind === "binary") return null;
	let parsed;
	try {
		parsed = JSON.parse(textBody);
	} catch {
		return null;
	}
	if (responseKind === "b64_json_array" || responseKind === "b64_json_field") {
		const path = spec.response.path;
		if (path === void 0 || path === "") return null;
		const b64 = extractByPath(parsed, path);
		if (typeof b64 !== "string" || b64.length === 0) return null;
		const bytes = Buffer.from(b64, "base64");
		if (bytes.byteLength < 8) return null;
		if (bytes.byteLength > getMediaLimitSafe()) throw new AigcError("backend-error", `extracted payload too large (${bytes.byteLength} bytes > ${getMediaLimitSafe()} limit)`, 413);
		const { ext, contentType, kind } = sniffBytes(bytes);
		return {
			filePath: await saveResponseToSession(bytes, ext, sessionId, cwd),
			size: bytes.byteLength,
			kind,
			contentType
		};
	}
	if (responseKind === "url_field") {
		const path = spec.response.path;
		if (path === void 0 || path === "") return null;
		const url = extractByPath(parsed, path);
		if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
		const downloadResult = await executeProviderRequest(provider, {
			method: "GET",
			path: url
		}, opts);
		if (!downloadResult.ok) throw new AigcError("backend-error", `secondary download failed for ${url}: HTTP ${downloadResult.status}`, downloadResult.status >= 400 && downloadResult.status < 500 ? 400 : 502);
		if (downloadResult.kind === "json" || downloadResult.kind === "text") return null;
		const bytes = downloadResult.bytes;
		const dlSize = downloadResult.size;
		const dlKind = downloadResult.kind;
		const dlContentType = downloadResult.contentType;
		if (dlSize > getMediaLimitSafe()) throw new AigcError("backend-error", `downloaded payload too large (${dlSize} bytes > ${getMediaLimitSafe()} limit)`, 413);
		return {
			filePath: await saveResponseToSession(bytes, extensionForBinaryKind(dlKind, dlContentType), sessionId, cwd),
			size: dlSize,
			kind: dlKind,
			contentType: dlContentType
		};
	}
	return null;
}
/** Sniff magic bytes to determine extension + content-type + AigcElement kind. */
function sniffBytes(bytes) {
	if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return {
		ext: "png",
		contentType: "image/png",
		kind: "image"
	};
	if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return {
		ext: "jpg",
		contentType: "image/jpeg",
		kind: "image"
	};
	if (bytes.byteLength >= 12 && bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") return {
		ext: "webp",
		contentType: "image/webp",
		kind: "image"
	};
	if (bytes.slice(0, 6).toString("ascii") === "GIF89a" || bytes.slice(0, 6).toString("ascii") === "GIF87a") return {
		ext: "gif",
		contentType: "image/gif",
		kind: "image"
	};
	return {
		ext: "png",
		contentType: "image/png",
		kind: "image"
	};
}
//#endregion
//#region src/index.ts
/**
* @huanlin/dsh-plugin-aigc-canvas host half: the canvas registry, the provider
* store (config + per-provider usage instructions), the fenced
* `/aigc-canvas/api/*` JSON API (provider CRUD + canvas.list/move) +
* `/aigc-canvas/file` media route + `/aigc-canvas/ws/canvas` push WebSocket,
* and the `ctx.aigcCanvas` service.
*
* Model-facing tools (see tools.ts): aigc_get_provider_info, the generic
* aigc_http_request (auto-attaches endpoint + apiKey per provider config),
* aigc_provider_set_instructions (the model records its 调用说明 after
* probing the API), aigc_canvas_place / aigc_canvas_link / aigc_canvas_unlink
* (put files on the free canvas), and aigc_canvas_list_elements.
*
* Provider config is editable at runtime: the settings page posts to
* `/aigc-canvas/api/providers.add|update|remove`, which updates the
* ProviderStore. Tools read the provider through a getter so they always
* see the latest configuration.
*/
/** Plugin identity for cordis.yml rows. */
const name = "dsh-aigc-canvas";
/** Services required before mounting. */
const inject = [
	"webServer",
	"sessions",
	"agents",
	"loader",
	"tools"
];
/** The connection row's resolved trustedHosts (live read). */
function trustedHostsOf(ctx) {
	for (const entry of ctx.loader.entries()) if (entry.options.name === "connection") return entry.options.config?.trustedHosts ?? [];
	return [];
}
/**
* Resolve a session's authoritative working directory.
* Throws when the session isn't registered yet (e.g. right after a
* restart, before the session list is loaded) — this prevents the
* canvas hydrate logic from silently reading the wrong directory and
* caching an empty table.
*/
function sessionCwdOf(ctx, sessionId) {
	const headerCwd = ctx.sessions.get(sessionId)?.header.cwd;
	if (headerCwd !== void 0 && headerCwd !== "") return headerCwd;
	throw new AigcError("not-found", `session "${sessionId}" is not registered or has no cwd yet`, 404);
}
/** Convert a resolved config to the runtime global settings wire shape. */
function toGlobalSettings(resolved) {
	return {
		requestTimeoutMs: resolved.requestTimeoutMs,
		mediaSizeLimit: resolved.mediaSizeLimit
	};
}
/**
* Build a minimal user-role message and inject it into the agent's
* next-step context (non-waking). Used to notify the model of user-
* initiated canvas actions (deletions, drag-dropped files) and pipeline
* progress events.
*/
function notifyAgent(ctx, sessionId, text, summary, form = "notice") {
	const agent = ctx.agents.get(sessionId);
	if (agent === void 0) return;
	const message = {
		id: randomUUID(),
		role: "user",
		content: [{
			type: "text",
			text
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-aigc-canvas",
			form,
			summary: summary.slice(0, 120)
		}
	};
	agent.inject(message);
}
/** Infer element kind from a file extension (for drag-drop uploads). */
function kindForExtension(ext) {
	const e = ext.toLowerCase().replace(/^\./, "");
	if ([
		"png",
		"jpg",
		"jpeg",
		"gif",
		"webp",
		"bmp",
		"svg"
	].includes(e)) return "image";
	if ([
		"mp4",
		"webm",
		"mov",
		"avi",
		"mkv"
	].includes(e)) return "video";
	if ([
		"mp3",
		"wav",
		"ogg",
		"flac",
		"aac",
		"m4a"
	].includes(e)) return "audio";
	return "prompt";
}
/** Build the JSON API method table. */
function buildApi(ctx, canvas, store, getResolved) {
	return {
		"canvas.list": async (payload) => {
			const sessionId = requireString(payload, "sessionId");
			await canvas.ensureHydrated(sessionId);
			return canvas.snapshot(sessionId);
		},
		"canvas.move": (payload) => {
			const sessionId = requireString(payload, "sessionId");
			const uuid = requireString(payload, "uuid");
			const record = payload;
			const x = record?.x;
			const y = record?.y;
			if (typeof x !== "number" || typeof y !== "number") throw new AigcError("bad-request", "x and y are required numbers");
			return canvas.updatePosition(sessionId, uuid, x, y);
		},
		"canvas.delete": async (payload) => {
			const sessionId = requireString(payload, "sessionId");
			const uuid = requireString(payload, "uuid");
			let el;
			try {
				el = canvas.getElement(sessionId, uuid);
			} catch {}
			await canvas.deleteElement(sessionId, uuid);
			if (el !== void 0) {
				const desc = el.description !== void 0 ? ` ("${el.description}")` : "";
				notifyAgent(ctx, sessionId, `User deleted the canvas element "${el.title}"${desc} (${el.kind}, filePath: ${el.filePath}). It is no longer on the canvas — do not reference it in future aigc_canvas_place / aigc_canvas_link calls.`, `user deleted ${el.kind} "${el.title}"`);
			}
			return { ok: true };
		},
		"canvas.upload": async (payload) => {
			const sessionId = requireString(payload, "sessionId");
			const record = payload;
			const fileName = typeof record?.fileName === "string" ? record.fileName : "";
			const mediaBase64 = typeof record?.mediaBase64 === "string" ? record.mediaBase64 : "";
			if (fileName === "" || mediaBase64 === "") throw new AigcError("bad-request", "fileName and mediaBase64 are required strings");
			const bytes = Buffer.from(mediaBase64, "base64");
			if (bytes.byteLength > getResolved().mediaSizeLimit) throw new AigcError("fs-error", `uploaded file too large (${bytes.byteLength} bytes)`);
			const cwd = sessionCwdOf(ctx, sessionId);
			const dir = canvasDirFor(cwd, sessionId);
			await mkdir(dir, { recursive: true });
			const uuid = randomUUID();
			const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1) : "bin";
			const kind = kindForExtension(ext);
			const filePath = join(dir, `${uuid}.${ext}`);
			await writeFile(filePath, bytes);
			const title = fileName.replace(/\.[^.]+$/, "");
			const description = typeof record?.description === "string" ? record.description.slice(0, 40) : void 0;
			const el = await canvas.placeFile(sessionId, {
				kind,
				filePath,
				title,
				producedBy: "user-upload",
				...typeof record?.x === "number" ? { x: record.x } : {},
				...typeof record?.y === "number" ? { y: record.y } : {},
				...description !== void 0 ? { description } : {}
			}, cwd);
			notifyAgent(ctx, sessionId, `User dragged a file onto the canvas: "${fileName}" (${kind}, ${bytes.byteLength} bytes). It is now placed as element "${el.title}" at (${el.x}, ${el.y}) with filePath ${el.filePath}. You can reference it in future generation calls.`, `user uploaded ${kind} "${el.title}"`);
			return {
				ok: true,
				element: el
			};
		},
		"canvas.notify": (payload) => {
			const sessionId = requireString(payload, "sessionId");
			const record = payload;
			const message = typeof record?.message === "string" ? record.message : "";
			if (message === "") throw new AigcError("bad-request", "message is a required non-empty string");
			notifyAgent(ctx, sessionId, message, typeof record?.summary === "string" ? record.summary : message.slice(0, 120));
			return { ok: true };
		},
		"canvas.set_status": async (payload) => {
			const sessionId = requireString(payload, "sessionId");
			const uuid = requireString(payload, "uuid");
			const record = payload;
			const status = coerceElementStatus(record?.status);
			let winner;
			if (record?.winner !== void 0) {
				if (typeof record.winner !== "boolean") throw new AigcError("bad-request", "winner must be a boolean when provided");
				winner = record.winner;
			}
			return {
				ok: true,
				element: await canvas.setStatus(sessionId, uuid, status, winner)
			};
		},
		"providers.list": () => {
			return { providers: store.list() };
		},
		"providers.add": (payload) => {
			const provider = payload?.provider;
			if (provider === null || typeof provider !== "object" || Array.isArray(provider)) throw new AigcError("bad-request", "expected { provider: AigcProvider }");
			const result = store.add(provider);
			if (!result.ok) throw new AigcError("bad-request", result.error);
			return { providers: result.providers };
		},
		"providers.update": (payload) => {
			const provider = payload?.provider;
			if (provider === null || typeof provider !== "object" || Array.isArray(provider)) throw new AigcError("bad-request", "expected { provider: AigcProvider }");
			const result = store.update(provider);
			if (!result.ok) throw new AigcError("bad-request", result.error);
			return { providers: result.providers };
		},
		"providers.remove": (payload) => {
			const id = payload?.id;
			if (typeof id !== "string" || id === "") throw new AigcError("bad-request", "expected { id: string }");
			const result = store.remove(id);
			if (!result.ok) throw new AigcError("bad-request", result.error);
			return { providers: result.providers };
		},
		"config.get": () => {
			return {
				...toGlobalSettings(getResolved()),
				providers: store.list()
			};
		},
		"logs.list": (payload) => {
			return { entries: getLogEntries(requireString(payload, "sessionId")) };
		},
		"logs.clear": (payload) => {
			clearLogEntries(requireString(payload, "sessionId"));
			return { ok: true };
		},
		"cost.get": (payload) => {
			return getSessionCost(requireString(payload, "sessionId"));
		},
		"cost.clear": (payload) => {
			clearSessionCost(requireString(payload, "sessionId"));
			return { ok: true };
		},
		"library.list": async (payload) => {
			const record = payload;
			const filter = {};
			if (record?.type !== void 0) {
				if (typeof record.type !== "string" || ![
					"image",
					"prompt",
					"audio",
					"video"
				].includes(record.type)) throw new AigcError("bad-request", "type must be one of: image, prompt, audio, video");
				filter.type = record.type;
			}
			if (record?.category !== void 0) filter.category = coerceAssetCategory(record.category);
			if (record?.tags !== void 0) {
				if (!Array.isArray(record.tags)) throw new AigcError("bad-request", "tags must be an array of strings");
				filter.tags = record.tags;
			}
			if (typeof record?.search === "string" && record.search !== "") filter.search = record.search;
			return { assets: await listAssets(filter) };
		},
		"library.promote": async (payload) => {
			const sessionId = requireString(payload, "sessionId");
			const uuid = requireString(payload, "uuid");
			const record = payload;
			const category = coerceAssetCategory(record?.category);
			await canvas.ensureHydrated(sessionId);
			const el = canvas.getElement(sessionId, uuid);
			return { asset: await promoteAsset({
				sourceFilePath: el.filePath,
				category,
				title: typeof record?.title === "string" ? record.title : el.title,
				tags: Array.isArray(record?.tags) ? record.tags : void 0,
				originalPrompt: el.promptText,
				sourceSessionId: sessionId,
				sourceElementPath: el.filePath,
				...el.mediaSize !== void 0 ? { metadata: { mediaSize: el.mediaSize } } : {}
			}) };
		},
		"library.remove": async (payload) => {
			const assetId = payload?.asset_id;
			if (typeof assetId !== "string" || assetId === "") throw new AigcError("bad-request", "asset_id is required");
			return {
				removed: await removeAsset(assetId),
				asset_id: assetId
			};
		}
	};
}
/** Plugin body. */
function apply(ctx, config) {
	const resolved = resolveAigcConfig(config);
	const trustedHosts = trustedHostsOf(ctx);
	const fence = (req) => isTrustedApiRequest(req, trustedHosts);
	const mediaLimit = () => resolved.mediaSizeLimit;
	const canvas = createAigcCanvasService((sessionId) => sessionCwdOf(ctx, sessionId), mediaLimit);
	ctx.provide("aigcCanvas", canvas);
	const store = new ProviderStore(resolved.providers);
	const getResolved = () => ({
		providers: store.list(),
		requestTimeoutMs: resolved.requestTimeoutMs,
		mediaSizeLimit: resolved.mediaSizeLimit
	});
	const getProvider = (providerId) => {
		if (providerId !== void 0 && providerId !== "") {
			const provider = store.get(providerId);
			if (provider === void 0) throw new AigcError("bad-request", `unknown provider_id "${providerId}"; call aigc_get_provider_info to list available providers`);
			return provider;
		}
		const def = store.defaultProvider();
		if (def === void 0) throw new AigcError("bad-request", "no AIGC providers configured; add one in the settings page");
		return def;
	};
	const listProviders = () => {
		const list = store.list();
		const defaultId = store.defaultProvider()?.id;
		return list.map((p) => ({
			id: p.id,
			name: p.name,
			endpoint: p.endpoint,
			instructions: p.instructions,
			isStub: p.endpoint === "" || p.endpoint === "stub://aigc-backend",
			isDefault: p.id === defaultId,
			endpoints: p.endpoints,
			priority: p.priority,
			costPerCall: p.costPerCall,
			avgLatencyMs: p.avgLatencyMs,
			qualityHint: p.qualityHint
		}));
	};
	const api = buildApi(ctx, canvas, store, getResolved);
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/aigc-canvas/api",
		handler: async (req, res) => {
			if (!fence(req)) {
				writeJson(res, 403, {
					ok: false,
					error: {
						code: "forbidden",
						message: "forbidden"
					}
				});
				return;
			}
			if (req.method !== "POST") {
				writeJson(res, 405, {
					ok: false,
					error: {
						code: "method-error",
						message: "method not allowed"
					}
				});
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/aigc-canvas/api/") ? pathname.slice(17) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeError(res, new AigcError("not-found", "unknown aigc-canvas API method", 404));
				return;
			}
			try {
				const payload = await readJsonBody(req);
				const handler = api[method];
				if (handler === void 0) throw new AigcError("not-found", `unknown aigc-canvas API method "${method}"`, 404);
				writeOk(res, await handler(payload));
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-aigc-canvas: /aigc-canvas/api routes");
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/aigc-canvas/file",
		handler: async (req, res) => {
			if (!fence(req)) {
				res.writeHead(403);
				res.end("forbidden");
				return;
			}
			if (req.method !== "GET") {
				res.writeHead(405);
				res.end();
				return;
			}
			try {
				const url = new URL(req.url ?? "/", "http://dsh.internal");
				const sessionId = url.searchParams.get("sessionId");
				const uuid = url.searchParams.get("uuid");
				if (sessionId === null || uuid === null) throw new AigcError("bad-request", "sessionId and uuid are required");
				await canvas.ensureHydrated(sessionId);
				const el = canvas.getElement(sessionId, uuid);
				if (el.filePath === void 0) throw new AigcError("not-found", `element "${uuid}" has no file`, 404);
				const dir = canvasDirFor(sessionCwdOf(ctx, sessionId), sessionId);
				if (!isAbsolute(el.filePath) || !el.filePath.startsWith(dir)) throw new AigcError("fs-error", "file path outside the session canvas directory", 403);
				const info = await stat(el.filePath);
				if (!info.isFile() || info.size > resolved.mediaSizeLimit) throw new AigcError("fs-error", "not a file or too large", 400);
				const type = mimeTypeFor(el.kind);
				const body = await readFile(el.filePath);
				const headers = {
					"content-type": type,
					"cache-control": "no-cache"
				};
				if (url.searchParams.get("download") === "1") headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(basename(el.filePath))}`;
				res.writeHead(200, headers);
				res.end(body);
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-aigc-canvas: /aigc-canvas/file media route");
	const wss = new WebSocketServer({ noServer: true });
	ctx.effect(() => ctx.webServer.registerUpgrade({
		path: "/aigc-canvas/ws/canvas",
		handler: (req, socket, head) => {
			if (!fence(req)) {
				socket.destroy();
				return;
			}
			wss.handleUpgrade(req, socket, head, (ws) => {
				attachCanvasPush(canvas, ws, req);
			});
		}
	}), "dsh-aigc-canvas: canvas push WebSocket");
	const pipelineEngine = new PipelineEngine({
		canvas,
		getProvider,
		resolveCwd: (sessionId) => sessionCwdOf(ctx, sessionId),
		getTimeoutMs: () => resolved.requestTimeoutMs,
		getMediaLimit: () => resolved.mediaSizeLimit,
		onProgress: (event) => {
			notifyAgent(ctx, event.session_id, event.summary, event.summary, "progress");
		}
	});
	ctx.effect(() => registerTools(ctx, getProvider, (id, instructions) => store.setInstructions(id, instructions), (id, endpoints) => store.setEndpoints(id, endpoints), listProviders, canvas, (sessionId) => sessionCwdOf(ctx, sessionId), () => resolved.requestTimeoutMs, () => resolved.mediaSizeLimit, pipelineEngine));
	ctx.effect(() => () => {
		wss.close();
	}, "dsh-aigc-canvas: teardown");
}
/** Push the live canvas state for one session to a connected canvas view. */
async function attachCanvasPush(canvas, ws, req) {
	try {
		const sessionId = new URL(req.url ?? "/", "http://dsh.internal").searchParams.get("sessionId");
		if (sessionId === null) {
			ws.close(1008, "sessionId is required");
			return;
		}
		const send = () => {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(canvas.snapshot(sessionId)));
		};
		await canvas.ensureHydrated(sessionId);
		send();
		let retries = 0;
		const retryTimer = setInterval(() => {
			if (ws.readyState !== WebSocket.OPEN) {
				clearInterval(retryTimer);
				return;
			}
			retries++;
			if (canvas.snapshot(sessionId).elements.length > 0) {
				clearInterval(retryTimer);
				return;
			}
			if (retries >= 20) {
				clearInterval(retryTimer);
				return;
			}
			canvas.ensureHydrated(sessionId).then(() => send());
		}, 1e3);
		ws.on("close", () => {
			clearInterval(retryTimer);
		});
		ws.on("error", () => {
			clearInterval(retryTimer);
		});
		const unsubscribe = canvas.subscribeSession(sessionId, send);
		ws.on("close", () => {
			unsubscribe();
		});
		ws.on("error", () => {
			unsubscribe();
		});
	} catch (error) {
		ws.close(1011, error instanceof Error ? error.message : String(error));
	}
}
//#endregion
export { Config, apply, inject, name };
