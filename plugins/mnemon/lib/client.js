window.__ModuleLoader__.load({
	id: "dsh-mnemon",
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
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_dom = require("react-dom");
		let react_dom_client = require("react-dom/client");
		//#region src/shared/contracts.ts
		const MNEMON_READ_CHANNEL = "/dsh-mnemon-read";
		const MNEMON_ACTIVATION_CHANNEL = "/dsh-mnemon-activation";
		const MNEMON_WRITE_CHANNEL = "/dsh-mnemon-write";
		const MNEMON_PACK_CHANNEL = "/dsh-mnemon-pack";
		const MNEMON_SETTINGS_CHANNEL = "/dsh-mnemon-settings";
		const MNEMON_SETTINGS_NAMESPACE = "mnemon";
		const MNEMON_UI_SETTINGS_NAMESPACE = "mnemon-ui";
		const CATEGORIES = [
			"preference",
			"decision",
			"fact",
			"insight",
			"context",
			"general"
		];
		//#endregion
		//#region src/client/api.ts
		const turnActivityCache = /* @__PURE__ */ new WeakMap();
		function isActivationOnly(request) {
			return typeof request.active === "boolean" && Object.entries(request).every(([field, value]) => field === "active" || value === void 0);
		}
		function isMissingActivationChannel(reason) {
			return reason instanceof Error && reason.message === `transport failure for /dsh-mnemon-activation/body: HTTP 404`;
		}
		function isMissingPrivateProviderServices(reason) {
			return reason instanceof Error && reason.message === "unknown write endpoint: provider-services";
		}
		async function loadTurnActivities(connection, sessionId, requiredCursor) {
			let sessions = turnActivityCache.get(connection);
			if (sessions === void 0) {
				sessions = /* @__PURE__ */ new Map();
				turnActivityCache.set(connection, sessions);
			}
			const key = sessionId ?? "";
			let entry = sessions.get(key);
			if (entry === void 0) {
				entry = {
					cursor: -1,
					activities: /* @__PURE__ */ new Map()
				};
				sessions.set(key, entry);
			}
			if (entry.cursor >= requiredCursor) return {
				cursor: entry.cursor,
				activities: [...entry.activities.values()]
			};
			if (entry.inFlight !== void 0) {
				const snapshot = await entry.inFlight;
				return snapshot.cursor >= requiredCursor ? snapshot : loadTurnActivities(connection, sessionId, requiredCursor);
			}
			const request = connection.rpc.call(MNEMON_READ_CHANNEL, "turn-activities", sessionId === void 0 ? {} : { sessionId }).then((response) => {
				if (!response.ok) throw new Error(response.error.message);
				const snapshot = response.value;
				entry.cursor = snapshot.cursor;
				entry.activities = new Map(snapshot.activities.map((activity) => [activity.turn, activity]));
				return snapshot;
			}).finally(() => {
				delete entry.inFlight;
			});
			entry.inFlight = request;
			return request;
		}
		var MnemonClient = class {
			connection;
			sessionId;
			workspaceId;
			constructor(connection, sessionId, workspaceId) {
				this.connection = connection;
				this.sessionId = sessionId;
				this.workspaceId = workspaceId;
			}
			async call(channel, endpoint, payload) {
				const response = await this.connection.rpc.call(channel, endpoint, payload);
				if (!response.ok) throw new Error(response.error.message);
				return response.value;
			}
			scoped(payload = {}) {
				return {
					...payload,
					...this.sessionId === void 0 ? {} : { sessionId: this.sessionId },
					...this.workspaceId === void 0 ? {} : { workspaceId: this.workspaceId }
				};
			}
			status() {
				return this.call(MNEMON_READ_CHANNEL, "status", this.scoped());
			}
			statusSummary() {
				return this.call(MNEMON_READ_CHANNEL, "status-summary", this.scoped()).catch(() => this.status());
			}
			taskAgentModels(includeCatalog) {
				return this.call(MNEMON_READ_CHANNEL, "task-agent-models", includeCatalog === void 0 ? {} : { includeCatalog });
			}
			versions() {
				return this.call(MNEMON_READ_CHANNEL, "versions", {});
			}
			updateVersion(component) {
				return this.call(MNEMON_WRITE_CHANNEL, "version-update", { component });
			}
			runtimeMemory() {
				return this.call(MNEMON_READ_CHANNEL, "runtime-memory", this.scoped());
			}
			mutateRuntimeMemory(request) {
				return this.call(MNEMON_WRITE_CHANNEL, "runtime-memory", this.scoped(request));
			}
			documents() {
				return this.call(MNEMON_READ_CHANNEL, "documents", this.scoped());
			}
			document(id) {
				return this.call(MNEMON_READ_CHANNEL, "document", this.scoped({ id }));
			}
			searchDocuments(query, includeArchived = false, limit = 50) {
				return this.call(MNEMON_READ_CHANNEL, "document-search", this.scoped({
					query,
					includeArchived,
					limit
				}));
			}
			mutateDocument(request) {
				return this.call(MNEMON_WRITE_CHANNEL, "document", this.scoped(request));
			}
			archiveDocument(id) {
				return this.call(MNEMON_WRITE_CHANNEL, "document", this.scoped({
					action: "archive",
					id
				}));
			}
			bodies() {
				return this.call(MNEMON_READ_CHANNEL, "bodies", this.scoped());
			}
			bodyDirectory() {
				return this.call(MNEMON_READ_CHANNEL, "body-directory", this.scoped()).catch(() => this.bodies());
			}
			providerServices() {
				const payload = this.scoped();
				return this.call(MNEMON_WRITE_CHANNEL, "provider-services", payload).catch((reason) => {
					if (!isMissingPrivateProviderServices(reason)) throw reason;
					return this.call(MNEMON_READ_CHANNEL, "provider-services", payload);
				});
			}
			updateProviderService(request) {
				return this.call(MNEMON_WRITE_CHANNEL, "provider-service-update", this.scoped(request));
			}
			graph(memoryBodyIds) {
				return this.call(MNEMON_READ_CHANNEL, "graph", this.scoped(memoryBodyIds === void 0 ? {} : { memoryBodyIds }));
			}
			list(request = {}) {
				return this.call(MNEMON_READ_CHANNEL, "list", this.scoped(request));
			}
			entities(entity, limit) {
				return this.call(MNEMON_READ_CHANNEL, "entities", this.scoped({
					...entity === void 0 ? {} : { entity },
					...limit === void 0 ? {} : { limit }
				}));
			}
			search(request) {
				return this.call(MNEMON_READ_CHANNEL, "search", this.scoped(request));
			}
			agentSearch(request) {
				return this.call(MNEMON_READ_CHANNEL, "agent-search", this.scoped(request));
			}
			related(id, memoryBodyId) {
				return this.call(MNEMON_READ_CHANNEL, "related", this.scoped({
					id,
					depth: 2,
					...memoryBodyId === void 0 ? {} : { memoryBodyId }
				}));
			}
			/** Settled memory-tool activity of one turn, shared across all mounted tails. */
			async turnActivity(turn, cursor = 0) {
				return (await loadTurnActivities(this.connection, this.sessionId, cursor)).activities.find((activity) => activity.turn === turn) ?? null;
			}
			/** Plain text of one finalized assistant message; null when absent or empty. */
			assistantMessageText(messageId) {
				return this.call(MNEMON_READ_CHANNEL, "assistant-message", {
					sessionId: this.sessionId,
					messageId
				});
			}
			remember(request) {
				return this.call(MNEMON_WRITE_CHANNEL, "remember", this.scoped(request));
			}
			supervise(content, idempotencyKey) {
				return this.call(MNEMON_WRITE_CHANNEL, "supervise", this.scoped({
					content,
					...idempotencyKey === void 0 ? {} : { idempotencyKey }
				}));
			}
			forget(id, memoryBodyId) {
				return this.call(MNEMON_WRITE_CHANNEL, "forget", this.scoped({
					id,
					...memoryBodyId === void 0 ? {} : { memoryBodyId }
				}));
			}
			createBody(request) {
				return this.call(MNEMON_WRITE_CHANNEL, "body-create", this.scoped(request));
			}
			updateBody(memoryBodyId, request) {
				if (!isActivationOnly(request)) return this.call(MNEMON_WRITE_CHANNEL, "body-update", this.scoped({
					memoryBodyId,
					...request
				}));
				const payload = this.scoped({
					memoryBodyId,
					active: request.active
				});
				return this.call(MNEMON_ACTIVATION_CHANNEL, "body", payload).catch((reason) => {
					if (!isMissingActivationChannel(reason)) throw reason;
					return this.call(MNEMON_WRITE_CHANNEL, "body-update", payload);
				});
			}
			reconnectBody(memoryBodyId) {
				return this.call(MNEMON_READ_CHANNEL, "body-reconnect", this.scoped({ memoryBodyId }));
			}
			maintainBodyMetadata(memoryBodyIds) {
				return this.call(MNEMON_WRITE_CHANNEL, "body-metadata-maintain", this.scoped({ memoryBodyIds }));
			}
			deleteBody(memoryBodyId) {
				return this.call(MNEMON_WRITE_CHANNEL, "body-delete", this.scoped({ memoryBodyId }));
			}
			packTarget() {
				return this.call(MNEMON_PACK_CHANNEL, "target", this.scoped());
			}
			exportPack() {
				return this.call(MNEMON_PACK_CHANNEL, "export", this.scoped());
			}
			inspectPack(base64, fileName) {
				return this.call(MNEMON_PACK_CHANNEL, "inspect", this.scoped({
					base64,
					...fileName === void 0 ? {} : { fileName }
				}));
			}
			importPack(base64) {
				return this.call(MNEMON_PACK_CHANNEL, "import", this.scoped({ base64 }));
			}
		};
		//#endregion
		//#region \0dsh-mnemon-css:/home/runner/work/dsh-mnemon/dsh-mnemon/src/client/MnemonSettingsCard.module.css.mjs
		const css$5 = "._v_wrq_page{box-sizing:border-box;width:100%;min-width:0;max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:28px;padding-bottom:28px;font-family:inherit;display:flex}._v_wrq_page *,._v_wrq_page :before,._v_wrq_page :after{box-sizing:border-box}._v_wrq_page button,._v_wrq_page input{color:inherit;font:inherit}._v_wrq_loading{min-height:140px;color:var(--dsw-alias-label-tertiary);text-align:center;margin:0;font-size:13px;line-height:140px}._v_wrq_pageHeader h1{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}._v_wrq_pageHeader p{max-width:64ch;color:var(--dsw-alias-label-tertiary);margin:8px 0 0;font-size:14px;line-height:22px}._v_wrq_section{flex-direction:column;gap:12px;min-width:0;display:flex}._v_wrq_sectionHeading{justify-content:space-between;align-items:flex-start;gap:18px;min-width:0;display:flex}._v_wrq_sectionHeading>div{flex:1;min-width:0}._v_wrq_sectionHeading h2{color:var(--dsw-alias-label-primary);margin:0;font-size:14px;font-weight:500;line-height:22px}._v_wrq_sectionHeading p{max-width:66ch;color:var(--dsw-alias-label-tertiary);margin:1px 0 0;font-size:12px;line-height:18px}._v_wrq_choiceGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;display:grid}._v_wrq_displayGrid{grid-template-columns:repeat(2,minmax(0,1fr))}._v_wrq_miniSpinner{border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-label-secondary);border-radius:50%;flex:none;width:16px;height:16px;margin-top:3px;animation:.7s linear infinite _v_wrq_task-agent-spin}._v_wrq_taskAgentPanel{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:12px;min-width:0;padding:12px 13px;display:flex}._v_wrq_taskAgentPanel[data-mode=fixed]{background:color-mix(in srgb, var(--dsw-alias-interactive-bg-hover) 54%, var(--dsw-alias-bg-layer-3))}._v_wrq_taskAgentFields{gap:12px;min-width:0;display:grid}._v_wrq_taskAgentFields>label{gap:6px;min-width:0;display:grid}._v_wrq_taskAgentFields>label>span{flex-direction:column;min-width:0;display:flex}._v_wrq_taskAgentFields strong{font-size:12px;font-weight:500;line-height:18px}._v_wrq_taskAgentFields small{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px}._v_wrq_taskAgentFields select{border:1px solid var(--dsw-alias-border-l2);width:100%;min-width:0;height:38px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);font:inherit;border-radius:10px;outline:none;padding:0 10px;font-size:12px}._v_wrq_taskAgentFields select:disabled{cursor:default;opacity:.46}._v_wrq_taskAgentFields select:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}._v_wrq_taskAgentEffective{justify-content:space-between;align-items:center;gap:12px;min-width:0;display:flex}._v_wrq_taskAgentEffective>span{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px}._v_wrq_taskAgentEffective code{min-width:0;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);font-family:var(--ds-font-family-code,ui-monospace, monospace);text-overflow:ellipsis;white-space:nowrap;border-radius:999px;padding:3px 8px;font-size:10px;line-height:16px;overflow:hidden}._v_wrq_taskAgentEffective small{min-width:0;color:var(--dsw-alias-label-tertiary);text-align:right;text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:16px;overflow:hidden}._v_wrq_taskAgentWarning{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary));overflow-wrap:anywhere;margin:0;font-size:10px;line-height:16px}@keyframes _v_wrq_task-agent-spin{to{transform:rotate(360deg)}}._v_wrq_providerPanel{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:14px;overflow:hidden}._v_wrq_providerPanel>summary{cursor:pointer;justify-content:space-between;align-items:center;gap:16px;min-height:70px;padding:12px 14px;list-style:none;display:flex}._v_wrq_providerPanel>summary::-webkit-details-marker{display:none}._v_wrq_providerPanel>summary:after{content:\"›\";color:var(--dsw-alias-label-tertiary);font-size:20px;transition:transform .14s;transform:rotate(90deg)}._v_wrq_providerPanel[open]>summary:after{transform:rotate(-90deg)}._v_wrq_providerPanel[open]>summary{border-bottom:1px solid var(--dsw-alias-border-l2)}._v_wrq_providerIdentity{flex:1;align-items:center;gap:11px;min-width:0;display:flex}._v_wrq_providerIdentity>span{flex-direction:column;min-width:0;display:flex}._v_wrq_providerIdentity strong{font-size:14px;font-weight:500;line-height:21px}._v_wrq_providerIdentity small{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}._v_wrq_nativeMark{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:10px;flex:none;place-items:center;width:34px;height:34px;padding:4px;display:grid;overflow:hidden}._v_wrq_nativeMark>svg{border-radius:6px;width:100%;height:100%;display:block}._v_wrq_providerMark{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:10px;flex:none;place-items:center;width:34px;height:34px;padding:4px;display:grid;overflow:hidden}._v_wrq_providerMark>img,._v_wrq_providerMark>svg{object-fit:contain;border-radius:6px;width:100%;height:100%;display:block}._v_wrq_providerHeaderMeta{flex:none;align-items:center;gap:7px;display:flex}._v_wrq_providerScopeTag{border-radius:999px;flex:none;padding:3px 8px;font-size:10px;font-weight:500;line-height:16px}._v_wrq_providerScopeTag[data-scope=global]{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary));background:color-mix(in srgb, var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary)) 11%, transparent)}._v_wrq_providerScopeTag[data-scope=workspace]{color:var(--dsw-alias-state-business-primary,var(--dsw-alias-label-secondary));background:color-mix(in srgb, var(--dsw-alias-state-business-primary,var(--dsw-alias-label-secondary)) 11%, transparent)}._v_wrq_providerState{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:999px;flex:none;padding:3px 8px;font-size:10px;line-height:16px}._v_wrq_providerPanelBody{flex-direction:column;gap:12px;padding:0 14px 14px;display:flex}._v_wrq_providerList{flex-direction:column;gap:10px;min-width:0;display:flex}._v_wrq_providerRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:14px;overflow:hidden}._v_wrq_providerRowHeader{align-items:center;gap:16px;min-width:0;min-height:70px;padding:12px 14px;display:flex}._v_wrq_providerRow[data-expanded] ._v_wrq_providerRowHeader{border-bottom:1px solid var(--dsw-alias-border-l2)}._v_wrq_providerDisclosure{appearance:none;min-width:0;color:inherit;cursor:pointer;text-align:left;background:0 0;border:0;outline:none;flex:1;align-items:center;gap:8px;padding:0;display:flex}._v_wrq_providerDisclosure:disabled{cursor:default}._v_wrq_providerDisclosure:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3);border-radius:8px}._v_wrq_providerChevron{color:var(--dsw-alias-label-tertiary);flex:none;font-size:18px;font-style:normal;transition:transform .14s;display:inline-block;transform:rotate(90deg)}._v_wrq_providerDisclosure[aria-expanded=true] ._v_wrq_providerChevron{transform:rotate(-90deg)}._v_wrq_providerEnableControl{flex:none;align-items:center;gap:10px;display:flex}._v_wrq_providerState[data-enabled]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent)}._v_wrq_providerToggle{cursor:pointer;display:inline-flex;position:relative}._v_wrq_providerToggle>input{clip:rect(0 0 0 0);clip-path:inset(50%);width:1px;height:1px;position:absolute;overflow:hidden}._v_wrq_providerToggle>span{background:var(--dsw-alias-bg-layer-2);width:38px;height:22px;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);border-radius:999px;transition:background-color .14s;display:block;position:relative}._v_wrq_providerToggle>span>i{background:var(--dsw-alias-bg-layer-3);width:16px;height:16px;box-shadow:0 1px 3px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);border-radius:50%;transition:transform .14s;position:absolute;top:3px;left:3px}._v_wrq_providerToggle>input:checked+span{background:var(--dsw-alias-label-primary);box-shadow:none}._v_wrq_providerToggle>input:checked+span>i{transform:translate(16px)}._v_wrq_providerToggle>input:focus-visible+span{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}._v_wrq_providerToggle:has(input:disabled){cursor:default;opacity:.42}._v_wrq_providerInlineBody{padding:0 14px 14px}._v_wrq_providerToggleError{color:var(--dsw-alias-state-error-primary);margin:0;padding:0 14px 12px;font-size:10px;line-height:16px}._v_wrq_providerServiceForm{flex-direction:column;gap:12px;min-width:0;padding-top:13px;display:flex}._v_wrq_providerServicePrompt{color:var(--dsw-alias-label-tertiary);margin:0;font-size:11px;line-height:17px}._v_wrq_globalLocationSetting{flex-direction:column;min-width:0;display:flex}._v_wrq_providerServiceLocation{border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:12px}._v_wrq_providerServiceLocation>._v_wrq_nativeLocation{min-height:0;padding:0 0 12px}._v_wrq_providerLocationField{border-top:1px solid var(--dsw-alias-border-l2);padding-top:11px}._v_wrq_nativeLocation{justify-content:space-between;align-items:center;gap:18px;min-height:68px;padding:12px 0;display:flex}._v_wrq_inlineChoices{flex:none;align-items:center;gap:6px;display:flex}._v_wrq_inlineChoices label{cursor:pointer;position:relative}._v_wrq_inlineChoices input{z-index:1;opacity:0;width:100%;height:100%;cursor:inherit;margin:0;position:absolute;inset:0}._v_wrq_inlineChoices span{border:1px solid var(--dsw-alias-border-l2);height:32px;color:var(--dsw-alias-label-secondary);border-radius:16px;align-items:center;padding:0 11px;font-size:12px;display:inline-flex}._v_wrq_inlineChoices input:checked+span{border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}._v_wrq_inlineChoices input:focus-visible+span{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}._v_wrq_inlineChoices input:disabled+span{cursor:default;opacity:.42}._v_wrq_embeddedSection{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:10px;min-width:0;padding-top:13px;display:flex}._v_wrq_memoryConfig{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:12px;flex-direction:column;gap:12px;min-width:0;padding:12px;display:flex}._v_wrq_memoryConfig:first-child{margin-top:12px}._v_wrq_memoryConfigHeader{justify-content:space-between;align-items:center;gap:12px;min-width:0;display:flex}._v_wrq_memoryConfigHeader>div{flex-direction:column;min-width:0;display:flex}._v_wrq_memoryConfigHeader strong{text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:20px;overflow:hidden}._v_wrq_memoryConfigHeader small{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px}._v_wrq_configActive{color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;align-items:center;gap:6px;font-size:11px;display:inline-flex}._v_wrq_configActive input{accent-color:var(--dsw-alias-label-primary)}._v_wrq_providerIdentityFields{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0;display:grid}._v_wrq_providerSettingsGrid{grid-template-columns:minmax(0,1fr);gap:12px;min-width:0;display:grid}._v_wrq_providerIdentityFields>label,._v_wrq_providerFieldControl>label:not(._v_wrq_providerBoolean){min-width:0;color:var(--dsw-alias-label-secondary);flex-direction:column;gap:4px;font-size:10px;line-height:16px;display:flex}._v_wrq_providerIdentityFields input,._v_wrq_providerFieldControl input:not([type=checkbox]),._v_wrq_providerFieldControl select{border:1px solid var(--dsw-alias-border-l2);width:100%;min-width:0;height:36px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);font:inherit;border-radius:9px;outline:none;padding:0 10px;font-size:12px}._v_wrq_providerIdentityFields input:focus-visible,._v_wrq_providerFieldControl input:focus-visible,._v_wrq_providerFieldControl select:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}._v_wrq_providerIdentityFields input:disabled,._v_wrq_providerFieldControl input:disabled,._v_wrq_providerFieldControl select:disabled{opacity:.5}._v_wrq_providerFieldControl{flex-direction:column;justify-content:flex-end;gap:3px;min-width:0;display:flex}._v_wrq_providerBoolean{min-height:36px;color:var(--dsw-alias-label-secondary);align-items:center;gap:7px;font-size:11px;display:flex}._v_wrq_providerBoolean input{accent-color:var(--dsw-alias-label-primary)}._v_wrq_providerSecretInput{min-width:0;position:relative}._v_wrq_providerSecretInput>input{padding-right:39px}._v_wrq_providerSecretVisibility{appearance:none;width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:7px;place-items:center;padding:0;display:grid;position:absolute;top:4px;right:4px}._v_wrq_providerSecretVisibility:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}._v_wrq_providerSecretVisibility:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3);outline:none}._v_wrq_providerSecretVisibility:disabled{cursor:default;opacity:.35}._v_wrq_providerSecretVisibility svg{width:17px;height:17px}._v_wrq_memoryConfigFooter{border-top:1px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:center;gap:10px;min-height:36px;padding-top:10px;display:flex}._v_wrq_memoryConfigFooter>div{align-items:center;gap:6px;display:flex}._v_wrq_providerServiceFooter{flex-direction:column;align-items:stretch;min-height:0}._v_wrq_providerServiceFooter>button{align-self:flex-end}._v_wrq_configFeedback{flex:1;min-width:0;font-size:10px;line-height:15px}._v_wrq_addConfigButton{appearance:none;border:1px dashed var(--dsw-alias-border-l2);min-height:36px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:10px;font-size:11px}._v_wrq_addConfigButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}._v_wrq_addConfigButton:disabled{cursor:default;opacity:.4}._v_wrq_scopeChanging,._v_wrq_providerTarget{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border-radius:10px;margin:0;padding:8px 10px;font-size:10px;line-height:16px}._v_wrq_scopeChanging{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary))}._v_wrq_providerTarget{background:0 0;margin-top:-4px;padding:0}._v_wrq_providerLoadError{justify-content:space-between;align-items:center;gap:10px;font-size:11px;display:flex}._v_wrq_choiceCard{cursor:pointer;min-width:0;display:block;position:relative}._v_wrq_choiceCard>input,._v_wrq_toggleRow>input,._v_wrq_visuallyHidden{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}._v_wrq_choiceFace{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;justify-content:center;gap:1px;min-width:0;min-height:66px;padding:10px 34px 10px 13px;transition:border-color .14s,background-color .14s;display:flex;position:relative}._v_wrq_choiceFace:hover{background:var(--dsw-alias-interactive-bg-hover)}._v_wrq_choiceFace strong{text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;line-height:21px;overflow:hidden}._v_wrq_choiceFace small{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:17px;overflow:hidden}._v_wrq_check{font-size:14px;line-height:18px;display:none;position:absolute;top:11px;right:12px}._v_wrq_choiceCard>input:checked+._v_wrq_choiceFace{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-interactive-bg-hover)}._v_wrq_choiceCard>input:checked+._v_wrq_choiceFace ._v_wrq_check{display:block}._v_wrq_choiceCard>input:disabled+._v_wrq_choiceFace{cursor:default;opacity:.42}._v_wrq_choiceCard:has(input:disabled){cursor:default}._v_wrq_settingRow,._v_wrq_toggleRow{border-top:1px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:center;gap:18px;min-width:0;min-height:62px;padding:11px 0;display:flex;position:relative}._v_wrq_settingCopy{flex-direction:column;flex:1;min-width:0;display:flex}._v_wrq_settingCopy strong{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:21px}._v_wrq_settingCopy small{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}._v_wrq_settingCopy code{font-family:var(--ds-font-family-code,ui-monospace, monospace)}._v_wrq_directoryControl{flex:0 420px;align-items:center;gap:8px;min-width:0;max-width:60%;display:flex}._v_wrq_directoryInput{border:1px solid var(--dsw-alias-border-l2);width:100%;min-width:0;height:38px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);font-family:var(--ds-font-family-code,ui-monospace, monospace);border-radius:10px;outline:none;padding:0 11px;font-size:12px;line-height:20px}._v_wrq_directoryInput::placeholder{color:var(--dsw-alias-label-caption)}._v_wrq_directoryInput:disabled{cursor:default;opacity:.46}._v_wrq_rowGroup{border-bottom:1px solid var(--dsw-alias-border-l2)}._v_wrq_toggleRow{cursor:pointer}._v_wrq_toggleRow:first-child{border-top:1px solid var(--dsw-alias-border-l2)}._v_wrq_toggleRow:has(input:disabled){cursor:default;opacity:.46}._v_wrq_switch{background:var(--dsw-alias-bg-layer-2);width:40px;height:24px;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);border-radius:999px;flex:none;transition:background-color .14s;display:block;position:relative}._v_wrq_switch i{background:var(--dsw-alias-bg-layer-3);width:18px;height:18px;box-shadow:0 1px 3px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);border-radius:50%;transition:transform .14s;position:absolute;top:3px;left:3px}._v_wrq_toggleRow>input:checked+._v_wrq_switch{background:var(--dsw-alias-label-primary);box-shadow:none}._v_wrq_toggleRow>input:checked+._v_wrq_switch i{transform:translate(16px)}._v_wrq_pillButton,._v_wrq_primaryPill,._v_wrq_actions button{appearance:none;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);height:36px;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap;background:0 0;border-radius:18px;justify-content:center;align-items:center;gap:4px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}._v_wrq_pillButton:hover:not(:disabled),._v_wrq_actions button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}._v_wrq_pillButton:disabled,._v_wrq_primaryPill:disabled,._v_wrq_actions button:disabled,._v_wrq_textButton:disabled{cursor:default;opacity:.4}._v_wrq_primaryPill,._v_wrq_save{color:var(--dsw-alias-label-primary-foreground)!important;background:var(--dsw-alias-button-primary-fill)!important;border-color:#0000!important}._v_wrq_primaryPill:hover:not(:disabled),._v_wrq_save:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)!important}._v_wrq_textButton{appearance:none;box-sizing:border-box;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;background:0 0;border:0;border-radius:14px;flex:none;justify-content:center;align-items:center;padding:0 10px;font-size:12px;line-height:18px;display:inline-flex}._v_wrq_textButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}._v_wrq_activePath{width:fit-content;max-width:100%;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;margin-top:4px;font-size:11px;line-height:17px;overflow:hidden}._v_wrq_scopeMeta{color:var(--dsw-alias-label-tertiary);margin-top:1px;font-size:10px;font-style:normal;line-height:15px}._v_wrq_rowActions{flex:none;align-items:center;gap:8px;display:flex}._v_wrq_importBar{background:var(--dsw-alias-bg-layer-2);border-radius:12px;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;min-width:0;padding:10px 12px;display:grid}._v_wrq_importBar>div{min-width:0;display:grid}._v_wrq_importBar strong{text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:500;line-height:18px;overflow:hidden}._v_wrq_importBar small{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px}._v_wrq_importBar ._v_wrq_textButton{padding:0 10px}._v_wrq_feedback,._v_wrq_packFeedback{gap:4px;display:grid}._v_wrq_feedback:empty,._v_wrq_packFeedback:empty{display:none}._v_wrq_feedback p,._v_wrq_packFeedback p{overflow-wrap:anywhere;margin:0;font-size:12px;line-height:18px}._v_wrq_error{color:var(--dsw-alias-state-error-primary)}._v_wrq_success{color:var(--dsw-alias-state-success-primary)}._v_wrq_readOnly{color:var(--dsw-alias-label-tertiary)}._v_wrq_packSuccess{color:var(--dsw-alias-state-success-primary)}._v_wrq_actions{display:none}._v_wrq_actionsVisible{border-top:1px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:center;gap:16px;padding-top:14px;display:flex}._v_wrq_actions>span{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}._v_wrq_actions>div{gap:8px;display:flex}._v_wrq_discard{color:var(--dsw-alias-label-primary);background:0 0;border-color:var(--dsw-alias-border-l2)!important}._v_wrq_settingsNote{color:var(--dsw-alias-label-tertiary);margin:-14px 0 0;font-size:10px;line-height:16px}._v_wrq_settingsNote code{color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code,ui-monospace, monospace)}._v_wrq_choiceCard>input:focus-visible+._v_wrq_choiceFace,._v_wrq_toggleRow>input:focus-visible+._v_wrq_switch,._v_wrq_directoryInput:focus-visible,._v_wrq_pillButton:focus-visible,._v_wrq_primaryPill:focus-visible,._v_wrq_textButton:focus-visible,._v_wrq_actions button:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3);outline:none}@media (width<=620px){._v_wrq_page{gap:24px}._v_wrq_choiceGrid{grid-template-columns:minmax(0,1fr)}._v_wrq_settingRow{flex-direction:column;align-items:stretch;gap:9px}._v_wrq_directoryControl{justify-content:space-between;max-width:none}._v_wrq_rowActions{width:100%}._v_wrq_rowActions button{flex:1}._v_wrq_importBar{grid-template-columns:minmax(0,1fr) auto}._v_wrq_importBar ._v_wrq_primaryPill{grid-column:1/-1}._v_wrq_actionsVisible{flex-direction:column;align-items:stretch}._v_wrq_actions>div,._v_wrq_actions button{flex:1}._v_wrq_nativeLocation{flex-direction:column;align-items:stretch;gap:9px}._v_wrq_inlineChoices{width:100%}._v_wrq_inlineChoices label{flex:1}._v_wrq_inlineChoices span{justify-content:center;width:100%}._v_wrq_providerIdentityFields{grid-template-columns:minmax(0,1fr)}._v_wrq_providerRowHeader{align-items:flex-start;gap:8px}._v_wrq_providerEnableControl{flex-direction:column-reverse;align-items:flex-end;gap:5px;max-width:116px}._v_wrq_providerState{text-overflow:ellipsis;white-space:nowrap;max-width:108px;overflow:hidden}._v_wrq_memoryConfigFooter{flex-direction:column;align-items:stretch}._v_wrq_memoryConfigFooter>div:last-child{width:100%}._v_wrq_memoryConfigFooter button{flex:1}}@media (prefers-reduced-motion:reduce){._v_wrq_choiceFace,._v_wrq_switch,._v_wrq_switch i,._v_wrq_providerChevron,._v_wrq_providerToggle>span,._v_wrq_providerToggle>span>i{transition:none}._v_wrq_miniSpinner{animation:none}}";
		const tagId$5 = "dsh-mnemon/src/client/MnemonSettingsCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$5) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-mnemon";
			tag.dataset.pluginCss = tagId$5;
			tag.textContent = css$5;
			document.head.appendChild(tag);
		}
		var MnemonSettingsCard_module_css_default = {
			"actions": "_v_wrq_actions",
			"actionsVisible": "_v_wrq_actionsVisible",
			"activePath": "_v_wrq_activePath",
			"addConfigButton": "_v_wrq_addConfigButton",
			"check": "_v_wrq_check",
			"choiceCard": "_v_wrq_choiceCard",
			"choiceFace": "_v_wrq_choiceFace",
			"choiceGrid": "_v_wrq_choiceGrid",
			"configActive": "_v_wrq_configActive",
			"configFeedback": "_v_wrq_configFeedback",
			"directoryControl": "_v_wrq_directoryControl",
			"directoryInput": "_v_wrq_directoryInput",
			"discard": "_v_wrq_discard",
			"displayGrid": "_v_wrq_displayGrid",
			"embeddedSection": "_v_wrq_embeddedSection",
			"error": "_v_wrq_error",
			"feedback": "_v_wrq_feedback",
			"globalLocationSetting": "_v_wrq_globalLocationSetting",
			"importBar": "_v_wrq_importBar",
			"inlineChoices": "_v_wrq_inlineChoices",
			"loading": "_v_wrq_loading",
			"memoryConfig": "_v_wrq_memoryConfig",
			"memoryConfigFooter": "_v_wrq_memoryConfigFooter",
			"memoryConfigHeader": "_v_wrq_memoryConfigHeader",
			"miniSpinner": "_v_wrq_miniSpinner",
			"nativeLocation": "_v_wrq_nativeLocation",
			"nativeMark": "_v_wrq_nativeMark",
			"packFeedback": "_v_wrq_packFeedback",
			"packSuccess": "_v_wrq_packSuccess",
			"page": "_v_wrq_page",
			"pageHeader": "_v_wrq_pageHeader",
			"pillButton": "_v_wrq_pillButton",
			"primaryPill": "_v_wrq_primaryPill",
			"providerBoolean": "_v_wrq_providerBoolean",
			"providerChevron": "_v_wrq_providerChevron",
			"providerDisclosure": "_v_wrq_providerDisclosure",
			"providerEnableControl": "_v_wrq_providerEnableControl",
			"providerFieldControl": "_v_wrq_providerFieldControl",
			"providerHeaderMeta": "_v_wrq_providerHeaderMeta",
			"providerIdentity": "_v_wrq_providerIdentity",
			"providerIdentityFields": "_v_wrq_providerIdentityFields",
			"providerInlineBody": "_v_wrq_providerInlineBody",
			"providerList": "_v_wrq_providerList",
			"providerLoadError": "_v_wrq_providerLoadError",
			"providerLocationField": "_v_wrq_providerLocationField",
			"providerMark": "_v_wrq_providerMark",
			"providerPanel": "_v_wrq_providerPanel",
			"providerPanelBody": "_v_wrq_providerPanelBody",
			"providerRow": "_v_wrq_providerRow",
			"providerRowHeader": "_v_wrq_providerRowHeader",
			"providerScopeTag": "_v_wrq_providerScopeTag",
			"providerSecretInput": "_v_wrq_providerSecretInput",
			"providerSecretVisibility": "_v_wrq_providerSecretVisibility",
			"providerServiceFooter": "_v_wrq_providerServiceFooter",
			"providerServiceForm": "_v_wrq_providerServiceForm",
			"providerServiceLocation": "_v_wrq_providerServiceLocation",
			"providerServicePrompt": "_v_wrq_providerServicePrompt",
			"providerSettingsGrid": "_v_wrq_providerSettingsGrid",
			"providerState": "_v_wrq_providerState",
			"providerTarget": "_v_wrq_providerTarget",
			"providerToggle": "_v_wrq_providerToggle",
			"providerToggleError": "_v_wrq_providerToggleError",
			"readOnly": "_v_wrq_readOnly",
			"rowActions": "_v_wrq_rowActions",
			"rowGroup": "_v_wrq_rowGroup",
			"save": "_v_wrq_save",
			"scopeChanging": "_v_wrq_scopeChanging",
			"scopeMeta": "_v_wrq_scopeMeta",
			"section": "_v_wrq_section",
			"sectionHeading": "_v_wrq_sectionHeading",
			"settingCopy": "_v_wrq_settingCopy",
			"settingRow": "_v_wrq_settingRow",
			"settingsNote": "_v_wrq_settingsNote",
			"success": "_v_wrq_success",
			"switch": "_v_wrq_switch",
			"task-agent-spin": "_v_wrq_task-agent-spin",
			"taskAgentEffective": "_v_wrq_taskAgentEffective",
			"taskAgentFields": "_v_wrq_taskAgentFields",
			"taskAgentPanel": "_v_wrq_taskAgentPanel",
			"taskAgentWarning": "_v_wrq_taskAgentWarning",
			"textButton": "_v_wrq_textButton",
			"toggleRow": "_v_wrq_toggleRow",
			"visuallyHidden": "_v_wrq_visuallyHidden"
		};
		//#endregion
		//#region src/client/GlobalLocationSetting.tsx
		/** Shared global/default location control for Native and workspace-aware providers. */
		function GlobalLocationSetting(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${MnemonSettingsCard_module_css_default.globalLocationSetting}${props.className === void 0 ? "" : ` ${props.className}`}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonSettingsCard_module_css_default.nativeLocation,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonSettingsCard_module_css_default.settingCopy,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: props.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: props.hint })]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonSettingsCard_module_css_default.inlineChoices,
						role: "radiogroup",
						"aria-label": props.ariaLabel,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "radio",
							name: props.name,
							checked: props.workspace || !props.custom,
							disabled: props.disabled || props.workspace,
							onClick: props.onInteract,
							onChange: () => props.onChange(false)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: props.defaultLabel })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "radio",
							name: props.name,
							checked: !props.workspace && props.custom,
							disabled: props.disabled || props.workspace,
							onClick: props.onInteract,
							onChange: () => props.onChange(true)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: props.customLabel })] })]
					})]
				}), !props.workspace && props.custom ? props.children : null]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Mnemon workspace copy, synchronized with DSH's global locale service. */
		const zh = {
			"tab.label": "记忆系统",
			"term.space": "记忆体",
			"term.spaces": "记忆体",
			"category.decision": "决策",
			"category.preference": "偏好",
			"category.fact": "事实",
			"category.insight": "洞察",
			"category.context": "上下文",
			"category.general": "通用",
			"nav.aria": "Mnemon 页面",
			"nav.group.system": "系统",
			"nav.group.storage": "三层记忆",
			"nav.group.tools": "读写工具",
			"nav.memory.aria": "记忆体页面",
			"nav.overview": "概览",
			"nav.bodies": "记忆体",
			"nav.bodies.detail": "记忆体目录与实时图谱",
			"nav.runtime": "运行时",
			"nav.runtime.detail": "热记忆与上下文",
			"nav.documents": "档案",
			"nav.documents.detail": "项目知识与归档",
			"nav.search": "检索",
			"nav.search.detail": "意图增强召回",
			"nav.entities": "实体",
			"nav.entities.detail": "关系与上下文",
			"nav.remember": "沉淀",
			"nav.rememberAction": "沉淀记忆",
			"nav.remember.detail": "LLM 监督写回",
			"nav.content": "内容",
			"nav.content.detail": "浏览与维护",
			"nav.status": "状态",
			"nav.status.detail": "运行与诊断",
			"common.refresh": "刷新状态",
			"common.loading": "载入中…",
			"common.cancel": "取消",
			"common.copyId": "复制 ID",
			"common.readOnly": "只读模式",
			"common.activationOnly": "仅可切换激活状态",
			"common.agentSupervised": "独立任务 Agent",
			"common.active": "已激活",
			"common.inactive": "未激活",
			"common.category": "分类",
			"common.importanceLabel": "重要性",
			"common.importance": "重要性 {value}",
			"common.hops": "{count} 跳",
			"common.allCategories": "全部分类",
			"common.memories": "{count} 条记忆",
			"common.edges": "{count} 条连接",
			"common.count": "{count} 个",
			"common.showing": "当前显示 {visible} / {total}",
			"common.showMore": "再显示 {count} 条",
			"header.backToConversation": "返回会话",
			"header.checking": "检查中",
			"header.connected": "已连接",
			"header.connectedWithCount": "已连接 · {count} 个已激活",
			"header.directoryPending": "已连接 · 目录待同步",
			"header.unavailable": "不可用",
			"header.notReady": "Mnemon 尚未就绪",
			"workspace.viewing": "查看工作区",
			"workspace.selectorAria": "选择要查看的记忆工作区",
			"workspace.storageMode": "存储位置",
			"workspace.storageModeAria": "存储位置模式：{mode}",
			"workspace.mismatchTitle": "查看目录与当前会话未对齐",
			"workspace.mismatchShort": "非对话工作区",
			"workspace.mismatchDescription": "工作台操作面向当前查看目录；Agent、工具和生命周期仍使用当前会话目录。",
			"workspace.selectedRoot": "查看：{root}",
			"workspace.effectiveRoot": "生效：{root}",
			"workspace.align": "对齐对话",
			"telemetry.aria": "记忆统计",
			"telemetry.title": "记忆统计",
			"telemetry.memories": "激活记忆",
			"telemetry.graph": "激活图谱",
			"telemetry.entities": "激活实体",
			"telemetry.spaces": "记忆体",
			"sidebar.activeSpaces": "已激活记忆体",
			"overview.title": "记忆体",
			"overview.description": "统一管理 Mnemon 记忆体与第三方 Provider 接入的记忆空间；激活后的记忆体共同参与读取、路由与实时快照。",
			"overview.pageDescription": "创建和启停记忆体，查看每个 Provider 的存储状态与实时关联快照。",
			"overview.interval": "进入时全量同步 · 点击卡片按需同步",
			"overview.fullSyncPending": "等待首次全量同步",
			"overview.fullSyncJustNow": "上次全量同步：刚刚",
			"overview.fullSyncSeconds": "上次全量同步：{count} 秒前",
			"overview.fullSyncMinutes": "上次全量同步：{count} 分钟前",
			"overview.fullSyncHours": "上次全量同步：{count} 小时前",
			"overview.fullSyncDays": "上次全量同步：{count} 天前",
			"overview.syncing": "同步中…",
			"overview.syncNow": "立即同步",
			"overview.directory": "记忆体目录",
			"overview.directory.description": "每张卡片对应一个真实记忆空间。第三方 Provider 首次接入时建立映射，之后点击卡片只检测当前记忆体；本地维护的标题与说明不会被重连覆盖。",
			"overview.directory.waiting": "等待目录",
			"overview.directory.unsynced": "目录尚未同步",
			"overview.directory.unsyncedBadge": "目录待同步",
			"overview.directoryLoading": "正在加载记忆体目录",
			"overview.healthLoading": "正在检测各记忆体状态",
			"overview.storageHealthy": "存储正常",
			"overview.storageUnhealthy": "存储异常",
			"overview.storageChecking": "检测中",
			"overview.reconnecting": "重连中",
			"overview.reconnectHint": "点击卡片重新检测并同步这个记忆体",
			"overview.reconnectAria": "重新连接{name}",
			"overview.snapshotLoading": "正在加载多记忆体实时快照",
			"overview.metadataAction": "AI 维护元信息",
			"overview.metadataTitle": "AI 维护记忆体元信息",
			"overview.metadataDescription": "选择一个或多个已激活记忆体。系统会分别通过各 Provider 最快的原生查询路径读取少量样本，再由独立任务 Agent 生成标题与说明。",
			"overview.metadataUnavailable": "暂时无法运行：未找到与当前记忆范围匹配的活跃 Agent",
			"overview.metadataLoading": "正在载入可维护的记忆体…",
			"overview.metadataEmpty": "当前没有可由 AI 维护元信息的已激活记忆体。",
			"overview.metadataSelected": "已选择 {count} 个记忆体",
			"overview.metadataSelectAll": "全选",
			"overview.metadataClear": "清空",
			"overview.metadataSafety": "仅更新本地标题与说明，不会修改、移动或删除记忆内容。Provider 关闭后，这些本地元数据会随映射一起清理。",
			"overview.metadataGenerate": "AI 生成（{count}）",
			"overview.metadataGenerating": "AI 正在生成…",
			"overview.metadataRunningCount": "{count} 个生成中",
			"overview.metadataTaskRunning": "生成中…",
			"overview.metadataTaskSuccess": "已更新",
			"overview.metadataTaskError": "失败：{error}",
			"overview.metadataTaskUnknown": "未知错误",
			"overview.metadataCompleted": "已更新 {count} 个记忆体的元信息。",
			"overview.mnemonDefault": "Mnemon 默认",
			"overview.toggleAria": "{name}读取开关",
			"overview.toggling": "切换中",
			"overview.noDescription": "尚未提供路由说明。",
			"overview.unsyncedTitle": "记忆体目录尚未同步",
			"overview.unsyncedShort": "当前 Web 客户端与 DSH Host 状态不一致；重启 Host 后会重新登记既有 Store。",
			"overview.unsyncedLong": "当前 Host 仍在使用旧插件契约；重启 DSH 后会重新发现既有 Store，期间不会删除任何 .db。",
			"overview.emptyTitle": "还没有记忆体",
			"overview.emptyShort": "创建第一个记忆体并写入稳定上下文后，它会出现在这里。",
			"overview.emptyLong": "创建一个 Mnemon 记忆体，或在“设置 → 记忆系统”启用第三方 Provider 以同步其已有记忆空间。",
			"overview.noActiveTitle": "没有激活的记忆体",
			"overview.noActiveText": "开启至少一个记忆体的读取开关，即可在这里聚合它的实时图谱。",
			"overview.noContentTitle": "已激活记忆体尚无内容",
			"overview.noContentText": "向任意记忆体沉淀稳定上下文后，这里会聚合呈现节点与关系。",
			"overview.create": "＋ 创建空白记忆体",
			"overview.createTitle": "创建记忆体",
			"overview.createDialogHint": "这里定义记忆体用途并选择底层 Provider；服务、凭据和全局数据位置沿用“设置 → 记忆系统”的配置。",
			"overview.createIdentityTitle": "记忆体信息",
			"overview.createIdentityHint": "名称用于识别；描述会帮助 Agent 判断什么内容应写入和召回。",
			"overview.createPlacementTitle": "记忆体 Provider",
			"overview.createPlacementHint": "这是一次明确的手动创建；选择一个已启用 Provider。自动选择由“沉淀策略”统一管理。",
			"overview.createName": "新记忆体名称",
			"overview.createNamePlaceholder": "名称",
			"overview.createDescription": "新记忆体描述",
			"overview.createDescriptionPlaceholder": "说明哪些内容属于它，以及何时应被召回",
			"overview.placementMode": "底层选择方式",
			"overview.placementManual": "手动指定",
			"overview.placementManualHint": "直接选择一个已启用 Provider",
			"overview.placementAutomatic": "智能选择",
			"overview.placementAutomaticHint": "先应用数据边界与能力规则，再由 Agent 在合格候选中选择",
			"overview.placementUnavailable": "需要一个已连接且与当前工作区对齐的对话",
			"overview.recommended": "推荐",
			"overview.placementPolicy": "选择策略",
			"overview.placementPolicyHint": "规则由系统强制执行，Prompt 只影响合格候选之间的判断。",
			"overview.agentDecision": "Agent 决策",
			"overview.placementPrompt": "策略 Prompt（可选）",
			"overview.placementPromptPlaceholder": "例如：这是团队协作知识；在满足精确写入要求时优先本地，否则优先共享。",
			"overview.dataBoundary": "数据边界",
			"overview.dataBoundaryRemote": "允许远程服务",
			"overview.dataBoundaryLocal": "仅限本地",
			"overview.preference": "软偏好",
			"overview.preferenceBalanced": "综合平衡",
			"overview.preferenceLocal": "本地优先",
			"overview.preferenceShared": "共享优先",
			"overview.requiredCapabilities": "必须具备（可多选）",
			"overview.capability.graph": "关系图谱",
			"overview.capability.exact-write": "精确写入",
			"overview.capability.forget": "安全遗忘",
			"overview.candidateNativeReady": "官方原生 · 跟随当前记忆范围",
			"overview.providerServiceRequired": "尚未启用；请先前往“设置 → 记忆系统”完成服务配置",
			"overview.workspaceBinding.automatic": "跟随当前记忆范围",
			"overview.workspaceBinding.optional-override": "跟随当前范围；全局可自定义位置",
			"overview.workspaceBinding.provider-global": "始终使用全局范围",
			"overview.candidateOpenViking": "纳入远程候选并提供连接",
			"overview.candidateLocal": "本地 Provider · 跟随当前记忆范围",
			"overview.candidateRemote": "远程 Provider · 使用全局服务配置",
			"overview.placementByLlm": "Agent 智能选择",
			"overview.placementByRules": "规则自动确定",
			"overview.placementConfidence": "置信度：{confidence}",
			"overview.confidence.high": "高",
			"overview.confidence.medium": "中",
			"overview.confidence.low": "低",
			"overview.providerLabel": "记忆引擎",
			"overview.nativeOfficial": "官方原生",
			"overview.providerNativeHint": "官方原生、本地优先，保留完整图谱与软删除能力",
			"strategy.action": "沉淀策略",
			"strategy.title": "沉淀策略",
			"strategy.description": "定义 Agent 在沉淀过程中需要新建记忆体时，如何选择底层 Provider。已有记忆体仍会优先按名称、描述与能力路由。",
			"strategy.loading": "正在读取 Provider 目录…",
			"strategy.modeTitle": "Provider 选择方式",
			"strategy.modeHint": "该策略只影响 Agent 沉淀时的新记忆体创建；手动点击“创建记忆体”始终由你指定。",
			"strategy.manualHint": "固定使用一个 Provider，Agent 无法改选",
			"strategy.automaticHint": "先执行硬规则，再由任务 Agent 选择合格 Provider",
			"strategy.manualTitle": "固定 Provider",
			"strategy.manualDescription": "当现有记忆体都不适合时，新记忆体固定创建在这个 Provider 中。",
			"strategy.automaticTitle": "智能选择规则",
			"strategy.automaticDescription": "数据边界与能力要求由主机强制执行，Prompt 只影响合格候选之间的判断。",
			"strategy.taskAgentReady": "任务 Agent 就绪",
			"strategy.taskAgentUnavailable": "等待任务 Agent",
			"strategy.save": "保存策略",
			"strategy.saving": "保存中…",
			"overview.providerOpenVikingHint": "连接已有 OpenViking 服务，由记忆体工作流统一调度",
			"overview.providerSummary.mnemon-native": "官方原生、本地优先，保留完整图谱与软删除能力",
			"overview.providerSummary.openviking": "文件系统形态的共享记忆，支持分层读取与自动语义提炼",
			"overview.providerSummary.honcho": "跨会话用户建模、Peer 档案、辩证推理与持久结论",
			"overview.providerSummary.mem0": "自动事实提取、语义召回、重排与去重",
			"overview.providerSummary.hindsight": "知识图谱记忆，具备实体解析、多策略召回与反思",
			"overview.providerSummary.holographic": "本地结构化事实记忆，支持可信度、实体解析与组合召回",
			"overview.providerSummary.retaindb": "云端混合向量/BM25 召回、用户画像与类型化事实",
			"overview.providerSummary.byterover": "通过 brv CLI 使用的本地优先分层知识树",
			"overview.providerSummary.supermemory": "语义记忆、持久画像、会话摄取与多容器召回",
			"overview.providerEndpoint": "服务地址",
			"overview.providerEndpointPlaceholder": "例如：http://127.0.0.1:1933",
			"overview.providerTargetUri": "记忆范围 URI",
			"overview.providerTargetPlaceholder": "例如：viking://user/memories",
			"overview.providerAdvanced": "身份与凭据（可选）",
			"overview.providerApiKey": "API Key",
			"overview.providerApiKeyOptional": "未启用鉴权时可留空",
			"overview.providerApiKeyKeep": "已保存；留空表示保持不变",
			"config.providerSecretShow": "显示凭证",
			"config.providerSecretHide": "隐藏凭证",
			"config.providerSecretStoredValue": "已保存凭证",
			"overview.providerAccount": "Account",
			"overview.providerUser": "User",
			"overview.providerActorPeer": "Actor Peer",
			"overview.providerField.workspace": "工作区",
			"overview.providerField.userId": "用户 ID",
			"overview.providerField.agentId": "Agent ID",
			"overview.providerField.mode": "接入模式",
			"overview.providerField.rerank": "重排检索结果",
			"overview.providerField.bankId": "记忆库",
			"overview.providerField.budget": "召回预算",
			"overview.providerField.dataPath": "事实存储路径",
			"overview.providerField.defaultDirectory": "默认知识目录",
			"overview.providerField.defaultTrust": "默认可信度",
			"overview.providerField.minTrust": "最低召回可信度",
			"overview.providerField.project": "项目标识",
			"overview.providerField.cliPath": "brv 可执行文件",
			"overview.providerField.workingDirectory": "知识目录",
			"overview.providerField.containerTag": "容器标签",
			"overview.providerField.searchMode": "检索模式",
			"overview.providerOption.platform": "Mem0 Platform",
			"overview.providerOption.self-hosted": "自托管服务",
			"overview.providerOption.low": "低",
			"overview.providerOption.mid": "中",
			"overview.providerOption.high": "高",
			"overview.providerOption.hybrid": "混合检索",
			"overview.providerOption.memories": "仅记忆",
			"overview.providerOption.documents": "仅文档",
			"overview.providerKindLocal": "本地引擎",
			"overview.providerKindRemote": "远程服务",
			"overview.providerSecretClear": "清除已保存的凭据",
			"overview.providerWriteExact": "精确写入",
			"overview.providerWriteAsync": "异步语义提炼",
			"overview.providerGraphReady": "支持关系图谱",
			"overview.providerSearchReady": "支持统一检索",
			"overview.providerRemote": "三方远程记忆",
			"overview.providerLocal": "三方本地记忆",
			"overview.creating": "创建中…",
			"overview.createAction": "创建",
			"overview.editBody": "编辑",
			"overview.editBodyAria": "编辑{name}",
			"overview.editName": "名称",
			"overview.editDescription": "路由说明",
			"overview.saveBody": "保存",
			"overview.savingBody": "保存中…",
			"overview.deleteBody": "删除",
			"overview.deleteBodyAria": "删除{name}",
			"overview.deleteTitle": "删除“{name}”？",
			"overview.deleteWarning": "该操作会永久删除这个记忆体及其中的全部记忆与关系，无法撤销。",
			"overview.lastStoreDeleteHint": "Mnemon 需要保留至少一个原生 Store；可将最后一个记忆体设为未激活，但不能删除。",
			"overview.deleteAction": "确认删除",
			"overview.disconnectBody": "断开",
			"overview.disconnectBodyAria": "断开{name}",
			"overview.disconnectTitle": "断开“{name}”？",
			"overview.disconnectWarning": "这里只会从 DSH 记忆体目录移除 {provider} 连接；底层引擎中的记忆不会被删除。",
			"overview.disconnectAction": "确认断开",
			"overview.deletingBody": "删除中…",
			"overview.snapshot": "多记忆体实时快照",
			"overview.snapshotSources": "快照可观察范围",
			"overview.snapshotSourcesHint": "真实关系图、无边内容投影和查询型记忆体分别呈现，不伪造 Provider 不具备的关系。",
			"overview.noVisualTitle": "当前记忆体只支持按需查询",
			"overview.noVisualText": "这些 Provider 不提供可枚举内容或图谱；请前往“检索”输入明确问题。",
			"overview.waitingSnapshot": "等待首个快照",
			"overview.updatedAt": "更新于 {time}",
			"overview.edgeScope": "空间归属",
			"overview.edgeTemporal": "时间",
			"overview.edgeSemantic": "语义",
			"overview.edgeCausal": "因果",
			"overview.edgeEntity": "实体关联",
			"overview.graphComposition": "{spaces} 个空间 · {memories} 条记忆 · {entities} 个实体",
			"overview.graphCount": "展示 {visible} / {total} 个元素",
			"overview.graphEdges": "{count} 条图谱连接",
			"overview.inspector": "记忆详情",
			"overview.inspectorSpace": "记忆体详情",
			"overview.inspectorEntity": "实体详情",
			"overview.selectNode": "选择一个图谱元素",
			"overview.selectNodeText": "查看记忆体、实体或记忆的精确上下文。",
			"overview.closeInspector": "关闭节点详情",
			"overview.memoryId": "记忆 ID",
			"overview.spaceId": "记忆体 ID",
			"overview.containedMemories": "包含记忆",
			"overview.entityMentions": "索引次数",
			"overview.exploreNode": "围绕它检索",
			"overview.previewAria": "查看全文",
			"overview.previewTitle": "内容全文",
			"overview.loading": "正在同步多记忆体实时快照…",
			"runtime.title": "运行时记忆",
			"runtime.description": "管理每轮随上下文加载的紧凑热记忆。结构化数据由统一控制层维护，并自动投影为 USER.md 与 MEMORY.md。",
			"runtime.total": "{count} 条热记忆",
			"runtime.entriesAria": "运行时记忆列表",
			"runtime.scopeAria": "运行时记忆范围",
			"runtime.scopeAll": "全部",
			"runtime.filterAria": "筛选运行时记忆",
			"runtime.filterPlaceholder": "按内容筛选…",
			"runtime.noMatch": "没有符合当前范围与查询条件的热记忆。",
			"runtime.refresh": "刷新",
			"runtime.hotContext": "每轮上下文",
			"runtime.addTitle": "添加热记忆",
			"runtime.addDescription": "稳定但仍需频繁使用的信息优先留在这里，长期归档由 Mnemon 记忆体承接。",
			"runtime.content": "运行时记忆内容",
			"runtime.placeholder": "输入一条简洁、独立、未来仍然有用的信息…",
			"runtime.target": "分类",
			"runtime.importance": "重要性",
			"runtime.saving": "处理中…",
			"runtime.addButton": "添加记忆",
			"runtime.addAction": "添加",
			"runtime.target.user": "用户画像",
			"runtime.target.user.description": "身份、角色、习惯、表达偏好与明确的协作要求；容量整理始终留在本地，不进入记忆体。",
			"runtime.target.memory": "工作记忆",
			"runtime.target.memory.description": "项目、环境、决策、约定、工具特性与可复用经验；容量达到上限时按主题归档到一个或多个记忆体。",
			"runtime.importance.critical": "关键",
			"runtime.importance.normal": "普通",
			"runtime.importance.low": "低",
			"runtime.empty": "这个分类还没有热记忆。",
			"runtime.editContent": "编辑运行时记忆",
			"runtime.editAction": "编辑",
			"runtime.saveEdit": "保存修改",
			"runtime.removeAction": "移除",
			"runtime.removeConfirm": "确认移除这条热记忆？",
			"runtime.removeTitle": "移除运行时记忆？",
			"runtime.removeWarning": "移除后，这条内容将不再随每轮上下文加载。该操作无法撤销。",
			"runtime.result.add": "已添加到{target} · 当前 {count} 条",
			"runtime.result.replace": "已更新{target} · 当前 {count} 条",
			"runtime.result.remove": "已从{target}移除 · 当前 {count} 条",
			"runtime.result.maintenance": "容量整理完成：已先归档到记忆体 {spaces}，再更新{target} · 当前 {count} 条",
			"runtime.result.localCompaction": "本地画像整理完成：未写入记忆体，已更新{target} · 当前 {count} 条",
			"runtime.readOnly": "当前部署为只读模式；热记忆仍会进入上下文，但不能在此修改。",
			"runtime.footnote": "memories.json 是唯一事实源；两个 Markdown 文件由控制层生成，不应直接编辑。",
			"documents.title": "项目档案",
			"documents.description": "在当前工作区维护结构化的项目文档。活跃档案参与近场检索；达到 10 MB 上限前，最久未使用的档案会先在 Mnemon 中建立索引，再迁入归档。",
			"documents.capacity": "{used} / {limit}",
			"documents.refresh": "刷新",
			"documents.summary": "档案存储摘要",
			"documents.active": "活跃档案",
			"documents.activeHint": "近场检索范围",
			"documents.archivedCount": "归档",
			"documents.archivedHint": "不占活跃容量",
			"documents.activeCapacity": "活跃容量",
			"documents.capacityHint": "按实际 UTF-8 文件大小计算",
			"documents.searchAria": "检索项目档案",
			"documents.searchPlaceholder": "搜索设计、调查、流程或交接记录…",
			"documents.search": "检索",
			"documents.scope": "档案范围",
			"documents.new": "新建档案",
			"documents.newTitle": "创建托管档案",
			"documents.editTitle": "编辑活跃档案",
			"documents.editorHint": "控制层会生成 frontmatter、哈希与修订号；原项目文件始终只读。",
			"documents.managedCopy": "托管副本",
			"documents.name": "标题",
			"documents.routing": "检索说明",
			"documents.sources": "来源路径",
			"documents.sourcesPlaceholder": "src/index.ts, docs/architecture.md",
			"documents.markdown": "Markdown 内容",
			"documents.saving": "保存中…",
			"documents.create": "创建档案",
			"documents.save": "保存修订",
			"documents.created": "已创建活跃档案。",
			"documents.createdAfterArchive": "已先迁移 {count} 份旧档案，再创建活跃档案。",
			"documents.updated": "已保存新的档案修订。",
			"documents.updatedAfterArchive": "已先迁移 {count} 份旧档案，再保存修订。",
			"documents.archived": "已建立 Mnemon 冷索引并归档；关联记忆体：{spaces}",
			"documents.list": "项目档案列表",
			"documents.activeList": "活跃目录",
			"documents.archiveList": "归档目录",
			"documents.noDescription": "暂无检索说明。",
			"documents.missing": "文件缺失",
			"documents.emptyActive": "还没有活跃档案",
			"documents.emptyActiveText": "复杂对话达到活动评分门槛后会自动审阅并整理档案，也可以在上方手动创建。",
			"documents.emptyArchived": "还没有归档",
			"documents.emptyArchivedText": "只有完成 Mnemon 索引的档案才会迁移到这里。",
			"documents.reader": "档案阅读器",
			"documents.selectTitle": "选择一份档案",
			"documents.selectText": "在左侧查看活跃项目知识或沿 Mnemon 引用打开归档原文。",
			"documents.coldArchive": "归档原文",
			"documents.edit": "编辑",
			"documents.path": "托管路径",
			"documents.revision": "修订",
			"documents.hash": "内容哈希",
			"documents.size": "文件大小",
			"documents.archiveReceipt": "Mnemon 冷索引回执",
			"documents.archiveTitle": "迁入归档",
			"documents.archiveDescription": "先由受限的独立任务 Agent 写入可检索的 Mnemon 摘要和精确路径，成功后才移动原文。",
			"documents.archive": "归档",
			"documents.archiveConfirm": "确认建立 Mnemon 索引并迁移这份档案？",
			"documents.archiving": "索引并迁移中…",
			"documents.archiveNow": "确认归档",
			"documents.footnote": "`.mnemon/documents/index.json` 是控制面事实源；active 总量固定不超过 10 MB，archived 不计入上限，项目源文件不会被修改。",
			"graph.layoutAria": "图谱布局",
			"graph.layoutNatural": "自然布局",
			"graph.layoutUniform": "均匀布局",
			"graph.layoutCustom": "自定义布局",
			"graph.layoutStatus": "布局状态：{layout}",
			"graph.draggable": "{layout} · 可拖拽",
			"graph.naturalAction": "自然铺开",
			"graph.uniformAction": "均匀重置",
			"graph.aria": "Mnemon 实时记忆图谱，{nodes} 个元素，{edges} 条连接",
			"graph.kindSpace": "记忆体",
			"graph.kindEntity": "实体",
			"card.confirmAria": "确认忘记记忆",
			"card.confirmText": "软删除这条记忆？",
			"card.processing": "处理中…",
			"card.confirmForget": "确认忘记",
			"card.related": "查看关联",
			"card.clone": "基于此新建",
			"card.forget": "忘记",
			"turnTail.label": "本回合记忆",
			"turnTail.recall": "召回 {count}",
			"turnTail.write": "沉淀 {count}",
			"turnTail.documents": "档案检索 {count}",
			"turnTail.inspect": "检查 {count}",
			"turnTail.failed": "失败 {count}",
			"turnTail.toolList": "本回合记忆工具",
			"turnTail.openTool": "打开 {tool} 对应的记忆页面",
			"saveAction.button": "存入记忆",
			"saveAction.tooltip": "将这条回复存入记忆",
			"saveAction.title": "确认存入记忆",
			"saveAction.hint": "独立任务 Agent 会判断是否值得沉淀，并查重、提炼、选择记忆体后写入；不会读取或挤占主对话上下文。",
			"saveAction.fetching": "提取消息文本…",
			"saveAction.missing": "无法从会话记录提取这条消息的文本。",
			"saveAction.candidate": "候选内容（可编辑）",
			"saveAction.truncated": "原回复较长，这里仅载入前 {limit} 个字符。",
			"saveAction.submit": "确认并交给独立任务 Agent",
			"saveAction.submitting": "调度中…",
			"saveAction.result": "独立任务 Agent：{summary}",
			"saveAction.failed": "调度失败：{error}",
			"saveAction.readOnly": "当前部署为只读模式，无法写入记忆。",
			"saveAction.close": "关闭",
			"search.title": "检索记忆",
			"search.description": "跨已激活记忆体检索原始证据；每个 Provider 使用自己的原生召回方式并保留来源。",
			"search.maxResults": "最多 {count} 条",
			"search.placeholder": "为什么选用 SQLite？这个项目有哪些发布约定？",
			"search.queryAria": "记忆查询",
			"search.categoryAria": "记忆分类",
			"search.strategy": "策略",
			"search.modeAria": "检索模式",
			"search.modeSmart": "智能召回",
			"search.modeKeyword": "关键词检索",
			"search.modeBasic": "基础匹配",
			"search.searching": "检索中…",
			"search.action": "直接检索",
			"search.agentAction": "Agent 查询",
			"search.agentSearching": "Agent 分析中…",
			"search.agentAnswer": "Agent 查询结果",
			"search.agentAnswerHint": "基于下方召回证据",
			"search.startTitle": "从一个明确问题开始",
			"search.startText": "聚焦实体、决策或时间线，比批量加载整库更可靠。",
			"search.emptyTitle": "没有命中",
			"search.emptyText": "换一个更具体的实体、决策或时间线关键词试试。",
			"search.results": "原始召回内容",
			"search.related": "关联记忆",
			"search.closeRelated": "关闭关联记忆",
			"search.traversing": "正在遍历图谱…",
			"search.noRelated": "没有找到两跳内的关联节点。",
			"search.sourcesTitle": "本次检索范围",
			"entities.title": "实体查阅",
			"entities.description": "只在真正提供实体索引的记忆体中，查阅实体跨越事实、决策与上下文的关系。",
			"entities.sourcesTitle": "实体能力范围",
			"entities.unsupportedTitle": "没有支持实体索引的记忆体",
			"entities.unsupportedText": "当前激活 Provider 仍可通过“检索”召回，但不会在这里伪装成实体图谱。",
			"entities.count": "{count} 个活跃实体",
			"entities.nameAria": "实体名称",
			"entities.placeholder": "输入任意实体…",
			"entities.action": "查阅",
			"entities.top": "高频实体",
			"entities.frequency": "按出现频率",
			"entities.emptyRail": "写入带实体的记忆后，这里会形成入口。",
			"entities.loading": "正在沿实体关系召回…",
			"entities.selectTitle": "选择或输入一个实体",
			"entities.selectText": "实体视图会聚合与它相关的记忆，而不是只做字面匹配。",
			"entities.emptyTitle": "没有关联记忆",
			"entities.emptyText": "尝试更完整的名称或另一个实体别名。",
			"remember.title": "沉淀记忆",
			"remember.description": "候选内容会进入无会话历史的独立任务 Agent，由它选择记忆体、查重、提炼并执行写入，不占用主对话上下文。",
			"remember.worker": "独立任务 Agent",
			"remember.readOnlyTitle": "当前为只读模式",
			"remember.readOnlyText": "当前部署禁止记忆写入；如需调整，请修改 DSH 的 Mnemon 配置并保存。",
			"remember.flowTitle": "独立任务 Agent 会完成什么",
			"remember.routeTitle": "判断归属",
			"remember.routeText": "选择既有记忆体，必要时判断是否形成新范围",
			"remember.dedupeTitle": "检索查重",
			"remember.dedupeText": "识别重复、补充或冲突的旧记忆",
			"remember.writeTitle": "结构化写入",
			"remember.writeText": "提炼内容、元数据与必要关系并返回回执",
			"remember.flowText": "独立任务 Agent 只拥有完成任务所需的 Mnemon 工具，原始目录和检索过程不会进入主对话上下文。",
			"remember.delegateTitle": "交给独立任务 Agent",
			"remember.noSession": "无可用会话",
			"remember.ready": "独立任务 Agent 就绪",
			"remember.noTaskAgent": "任务 Agent 不可用",
			"remember.taskAgentReady": "任务 Agent 就绪",
			"remember.candidate": "候选内容",
			"remember.candidateAria": "待沉淀内容",
			"remember.placeholder": "输入希望跨任务保留的背景、偏好、决策或洞察。模型会先判断它是否真的值得沉淀。",
			"remember.sessionHint": "当前视图没有可用的模型路由，无法创建独立任务 Agent。",
			"remember.taskAgentHint": "当前 Host 暂时无法创建独立任务 Agent，请刷新状态后重试。",
			"remember.processing": "独立任务 Agent 处理中…",
			"remember.action": "调度独立任务 Agent 判断并沉淀",
			"remember.advanced": "人工高级选项",
			"remember.advancedHint": "为独立任务 Agent 指定目标记忆体与元数据约束",
			"remember.expand": "展开",
			"remember.target": "目标记忆体",
			"remember.asyncProviderHint": "该记忆体会等待远程提炼任务完成后再返回真实写入回执。",
			"remember.entities": "实体（逗号分隔）",
			"remember.tags": "标签（逗号分隔）",
			"remember.advancedText": "高级选项是约束而不是绕过监督；独立任务 Agent 仍会查重并返回结构化回执。",
			"remember.saving": "独立任务 Agent 写入中…",
			"remember.advancedAction": "按高级约束沉淀",
			"remember.skipped": "独立任务 Agent 判断无需写入",
			"remember.completed": "独立任务 Agent 已完成处理",
			"remember.processed": "独立任务 Agent 已处理：{action}",
			"remember.dispatchFailed": "调度失败：{error}",
			"remember.saveFailed": "保存失败：{error}",
			"content.title": "记忆内容",
			"content.description": "按 Provider 的真实浏览契约检查可观察内容；列表型、查询型与不可浏览引擎会明确区分。",
			"content.sourcesTitle": "Provider 内容模型",
			"content.count": "{count} 条记忆",
			"content.filterAria": "筛选记忆内容",
			"content.filterPlaceholder": "按内容或精确 ID 筛选…",
			"content.categoryAria": "记忆分类",
			"content.apply": "应用筛选",
			"content.notice": "内容页直接调用 Provider 的只读浏览契约；查询型引擎仅在输入查询后执行检索。",
			"content.queryRequiredTitle": "查询型记忆体等待问题",
			"content.queryRequiredText": "输入一个明确查询即可读取 ByteRover 等不提供全量列表的 Provider。",
			"content.showing": "当前显示 {visible} / {total}",
			"content.showMore": "再显示 {count} 条",
			"content.emptyTitle": "没有符合条件的记忆",
			"content.emptyText": "清空筛选，或前往“沉淀”写入第一条稳定上下文。",
			"readSources.all": "全部 Provider",
			"readSources.mode.search": "原生检索",
			"readSources.mode.graph": "真实关系图",
			"readSources.mode.projection": "内容投影",
			"readSources.mode.enumerable": "可枚举内容",
			"readSources.mode.query-only": "仅查询",
			"readSources.mode.entities": "实体索引",
			"readSources.mode.unsupported": "不支持",
			"readSources.status.ready": "{count} 条可观察",
			"readSources.status.empty": "已连接 · 暂无内容",
			"readSources.status.query-required": "输入查询后读取",
			"readSources.status.unsupported": "当前表面不可用",
			"readSources.status.unavailable": "连接不可用",
			"readSources.edges": "{count} 条真实关系",
			"readSources.model.mnemon-native": "事实、实体与类型关系",
			"readSources.model.openviking": "目录与分层内容",
			"readSources.model.honcho": "Peer 结论与画像",
			"readSources.model.mem0": "提炼后的语义记忆",
			"readSources.model.hindsight": "记忆单元与知识图",
			"readSources.model.holographic": "可信事实与实体",
			"readSources.model.retaindb": "画像与类型化事实",
			"readSources.model.byterover": "知识树查询",
			"readSources.model.supermemory": "记忆与摄取文档",
			"status.title": "系统状态",
			"status.description": "聚焦 dsh-mnemon、各记忆 Provider、三层存储和当前读写目录；连接配置由 DSH 部署统一管理。",
			"status.nominal": "系统正常",
			"status.checkRequired": "需要检查",
			"status.rechecking": "检查中…",
			"status.recheck": "重新检查",
			"status.aria": "Mnemon 运行状态",
			"status.engine": "记忆引擎",
			"status.engineConnected": "Mnemon 已连接",
			"status.engineUnavailable": "Mnemon 不可用",
			"status.engineChecking": "正在检查本地引擎",
			"status.versionWaiting": "等待版本信息",
			"status.pluginChecking": "正在检查插件状态",
			"status.pluginReady": "插件运行正常",
			"status.nativeAria": "mnemon Provider 状态",
			"status.nativeLabel": "Native Provider",
			"status.nativeCliMissing": "未找到 Mnemon CLI",
			"status.providersTitle": "三方 Provider",
			"status.providersDescription": "持续汇总已启用 Provider 及其记忆体连接状态；关闭的 Provider 不进行探测或参与路由。",
			"status.providersAria": "三方 Provider 状态",
			"status.providersEnabled": "{enabled} / {total} 已启用",
			"status.providerState.disabled": "已关闭",
			"status.providerState.idle": "服务就绪 · 尚无已激活记忆体",
			"status.providerState.healthy": "连接正常",
			"status.providerState.unhealthy": "连接需要检查",
			"status.providerSpaces": "{active} / {total} 个记忆体参与运行",
			"versions.checkAction": "检查版本",
			"versions.title": "检查与更新版本",
			"versions.description": "检查 Mnemon CLI 与 dsh-mnemon；只有识别到受支持的安装方式时才会提供更新操作。",
			"versions.checking": "正在检查远程仓库中的新版本…",
			"versions.checkingShort": "检查中…",
			"versions.recheck": "重新检查",
			"versions.failed": "版本操作失败",
			"versions.timeout": "版本检查超时，请检查网络后重试。",
			"versions.current": "已是最新",
			"versions.available": "可更新",
			"versions.unknown": "无法确认",
			"versions.installed": "当前版本",
			"versions.latest": "最新版本",
			"versions.executable": "可执行文件",
			"versions.profileLocation": "Profile · {name}",
			"versions.sourceLocation": "源码",
			"versions.linkSourceLocation": "源码 · Profile {name}",
			"versions.packageLocation": "包目录",
			"versions.update": "更新",
			"versions.updating": "更新中…",
			"versions.updated": "{name} 已更新",
			"versions.alreadyCurrent": "当前已经是最新版本",
			"versions.restartRequired": "请重启 dsh web，以加载新的 dsh-mnemon 插件代码。",
			"versions.checkedAt": "检查于 {time}",
			"versions.latestUnavailable": "暂时无法读取远程最新版本；请检查网络后重试。",
			"versions.modeHomebrew": "Homebrew",
			"versions.modeGo": "Go 安装",
			"versions.modeNpm": "DSH Profile",
			"versions.modeLink": "本地 Link",
			"versions.modeManual": "手工安装",
			"versions.modeMissing": "未安装",
			"versions.hintHomebrew": "由 Homebrew 管理；发现新版本时可在此安全更新。",
			"versions.hintBrewMissing": "检测到 Homebrew 安装，但当前找不到 brew 命令。",
			"versions.hintGo": "由 go install 管理；发现新版本时可在此安全更新。",
			"versions.hintPnpm": "由当前 DSH Profile 管理；更新后需要重启 dsh web。",
			"versions.hintPnpmMissing": "检测到 DSH Profile 安装，但当前找不到 pnpm 命令。",
			"versions.hintLink": "当前为本地 Link 开发版本；请在源码目录拉取并构建，避免覆盖本地修改。",
			"versions.hintInstall": "未找到 Mnemon CLI；请先安装并确保 mnemon 位于 PATH，或设置 MNEMON_CLI_PATH / mnemon.cliPath。",
			"versions.hintManual": "无法安全识别安装来源；请沿用原安装方式手工更新。",
			"status.spaces": "记忆体",
			"status.activeRatio": "{active} / {total} 已激活",
			"status.runtime": "运行时",
			"status.runtimeRatio": "{user} 用户 · {memory} 项目",
			"status.runtimeBytes": "{bytes} 已使用",
			"status.runtimeWaiting": "等待同步",
			"status.runtimeWaitingDetail": "宿主存储清单待返回",
			"status.directoryUnsynced": "目录尚未同步",
			"status.activeMemories": "{count} 条激活记忆",
			"status.documents": "项目档案",
			"status.documentsWaiting": "等待工作区",
			"status.documentsSession": "绑定活动会话后可用",
			"status.documentRatio": "{active} 份活跃 · {archived} 份归档",
			"status.documentUsage": "{used} / {limit} 活跃容量",
			"status.storageDomains": "存储域",
			"status.storageDomainsText": "当前选择决定热记忆、记忆体和项目档案共同使用的目录边界。",
			"status.storageBrowseOnly": "查看不会切换写入",
			"status.storageScopeAria": "选择要查看的存储域",
			"status.storageGlobal": "全局",
			"status.storageWorkspace": "工作区",
			"status.storageCustom": "自定义",
			"status.storageCurrent": "当前读写",
			"status.storageWaiting": "正在读取存储域目录…",
			"status.storageCustomUnset": "尚未配置自定义目录。当前只展示已经由 DSH 配置并启用的自定义根。",
			"status.storageWorkspaceUnavailable": "当前会话没有可用的工作区目录。",
			"status.storageActiveRoot": "当前读写根",
			"status.storageViewedRoot": "查看根",
			"status.storageAvailable": "目录可用",
			"status.storageNotCreated": "目录尚未创建",
			"status.storageRuntime": "运行时记忆",
			"status.storageBodies": "记忆体",
			"status.storageDocuments": "项目档案",
			"status.storageState": "后台状态",
			"status.storageReady": "正常",
			"status.storageEmpty": "空",
			"status.storageMissing": "未创建",
			"status.storageInvalid": "需修复",
			"status.storageItems": "项",
			"status.storageRuntimeDetail": "USER {user} · MEMORY {memory}",
			"status.storageBodiesDetail": "{active} 个激活 · {databases} 个数据库",
			"status.storageDocumentsDetail": "{active} 份活跃 · {archived} 份归档",
			"status.storageStateReady": "审阅水位已经持久化",
			"status.storageStateVolatile": "当前审阅状态仍由 Host 进程维护",
			"status.storageFootnote": "当前实际读写根：{root}。存储范围只在 DSH「设置 → 记忆系统」中修改，保存后实时生效；插件不会自动迁移、合并或删除旧内容。",
			"config.aria": "记忆系统配置",
			"config.tab": "Mnemon",
			"config.title": "记忆系统设置",
			"config.description": "统一配置运行时记忆、项目档案、记忆体和 DSH 界面；点击保存后立即生效。",
			"config.unsaved": "有未保存修改",
			"config.ready": "已保存并实时生效",
			"config.noticeBefore": "配置写入",
			"config.noticeAfter": "；所有设置点击保存后实时生效。切换范围不会自动迁移旧内容。",
			"config.displayTitle": "展示形态",
			"config.displayDescription": "选择记忆系统在 DSH Web 中的入口位置；切换后立即生效。",
			"config.displayAria": "记忆系统展示形态",
			"config.displaySidebar": "Sidebar",
			"config.displaySidebarHint": "侧边栏中的独立工作台",
			"config.displayBuildin": "Buildin",
			"config.displayBuildinHint": "对话区域的内置标签页",
			"config.storageTitle": "记忆范围",
			"config.storageDescription": "决定 Runtime、Documents、mnemon 及支持工作区绑定的 Provider 是否随当前工作区隔离；其余 Provider 保持自身全局作用域。",
			"config.scope": "存储范围",
			"config.scopeHint": "全局供所有工作区共享；工作区按当前 DSH 会话隔离；自定义使用指定目录。",
			"config.scopeAria": "记忆系统范围",
			"config.global": "全局",
			"config.workspace": "工作区",
			"config.custom": "自定义",
			"config.customHintShort": "填写一个目录",
			"config.customSelected": "已填写目录",
			"config.globalScopeHint": "跨工作区共享",
			"config.providersTitle": "记忆体 Provider",
			"config.providersDescription": "在这里启用并配置 Provider 服务。启用或保存会同步服务中已有的记忆空间；关闭会移除本地映射，但不会删除第三方数据。范围标签显示当前生效边界。",
			"config.nativeSummary": "官方原生长期记忆与完整关系图",
			"config.officialNative": "官方原生",
			"config.nativeGlobalLocation": "全局数据位置",
			"config.nativeGlobalLocationHint": "mnemon 的全局范围可以使用默认目录或指定一个目录。",
			"config.nativeGlobalLocationWorkspaceHint": "当前使用工作区范围；切换到全局后可选择默认或自定义目录。",
			"config.nativeDefaultLocation": "默认 ~/.mnemon",
			"config.providerGlobalLocation": "全局数据位置",
			"config.providerGlobalLocationHint": "{provider} 默认使用全局范围目录，也可以指定一个自定义位置。",
			"config.providerGlobalLocationWorkspaceHint": "当前使用工作区默认位置；切换到全局范围后可指定自定义位置。",
			"config.providerDefaultLocation": "默认（跟随范围）",
			"config.providerDefaultName": "{provider} 记忆体",
			"config.providerDefaultDescription": "由 dsh-mnemon 使用的 {provider} 长期记忆。",
			"config.newProviderConfig": "新记忆体配置",
			"config.newProviderConfigHint": "保存后立即创建并启用，不需要再到概览重复连接。",
			"config.providerHealthy": "连接正常，可直接参与记忆工作流",
			"config.providerNeedsAttention": "连接需要检查，仍可修改并重新保存",
			"config.providerActive": "参与读取与路由",
			"config.providerMemoryName": "记忆体名称",
			"config.providerMemoryDescription": "用途说明",
			"config.providerSaveFailed": "配置保存失败：{error}",
			"config.providerSaved": "配置已保存",
			"config.createAndEnable": "保存并启用",
			"config.saveProviderConfig": "保存配置",
			"config.addProviderConfig": "添加一份记忆体配置",
			"config.providerNotConfigured": "未配置",
			"config.providerConfiguredCount": "{count} 份配置",
			"config.providerServiceTitle": "服务配置",
			"config.providerServiceHint": "供该 Provider 的所有记忆体复用；启用或保存时会刷新记忆体目录中的映射与元信息。",
			"config.providerEnableHint": "填写服务配置并保存后，Provider 会启用并同步所有可见记忆空间。",
			"config.providerServiceConfigured": "服务已配置",
			"config.providerServiceNotConfigured": "服务未配置",
			"config.providerEnabled": "已启用",
			"config.providerDisabled": "未启用",
			"config.providerDisabledConfigured": "已关闭 · 配置已保留",
			"config.providerNeedsConfiguration": "需要完成配置",
			"config.providerToggleAria": "启用 {provider}",
			"config.providerToggleFailed": "切换失败：{error}",
			"config.enableProvider": "保存并启用",
			"config.providerServiceSaved": "服务配置已保存，记忆体目录已同步",
			"config.saveProviderService": "保存服务配置",
			"config.providerUnavailable": "当前 DSH 主机不支持 Provider 服务配置。",
			"config.saveScopeBeforeProviders": "存储范围有未保存修改。请先保存范围，再配置对应目录中的 Provider。",
			"config.providerTargetWorkspace": "当前工作区：{workspace}；标记“工作区”的 Provider 配置与记忆体使用此范围。",
			"config.loadingProviders": "正在读取 Provider 配置…",
			"config.providerLoadFailed": "读取 Provider 配置失败：{error}",
			"config.retryProviders": "重试",
			"config.taskAgentTitle": "后台任务 Agent",
			"config.taskAgentDescription": "AI 元信息、Agent 查询、记忆沉淀和档案归档使用无会话历史的独立任务 Agent；这里只调整这些后台任务的模型路由。",
			"config.taskAgentModeAria": "后台任务 Agent 模型路由",
			"config.taskAgentInherit": "跟随主链路",
			"config.taskAgentInheritHint": "使用 DSH 新会话默认模型",
			"config.taskAgentFixed": "指定模型 Provider",
			"config.taskAgentFixedHint": "为 Mnemon 后台任务固定路由",
			"config.taskAgentProvider": "模型 Provider",
			"config.taskAgentProviderHint": "选择 DSH 已配置的模型服务",
			"config.taskAgentModel": "模型",
			"config.taskAgentModelHint": "选择该 Provider 下的完整模型路由",
			"config.taskAgentChooseProvider": "选择 Provider",
			"config.taskAgentChooseModel": "选择模型",
			"config.taskAgentEffective": "当前将使用",
			"config.taskAgentLoading": "正在读取模型目录",
			"config.taskAgentUnavailable": "尚无可用的 Provider / Model 路由",
			"config.taskAgentLoadFailed": "模型目录读取失败：{error}",
			"config.taskAgentPartial": "有 {count} 个 Provider 暂时无法读取，其他选项仍可使用。",
			"config.taskAgentRouteRequired": "指定后台任务模型时，必须同时选择 Provider 和模型。",
			"config.customPack": "自定义 Pack",
			"config.customPackAria": "选择自定义 Mnemon Pack",
			"config.customPackRequired": "请选择或添加一个自定义 Pack。",
			"config.customDefaultName": "自定义 Pack",
			"config.noCustomPacks": "尚未配置 Pack",
			"config.addPack": "添加 Pack",
			"config.cancelAddPack": "取消添加",
			"config.removePack": "移除",
			"config.customPackNameAria": "新 Pack 名称",
			"config.customPackNamePlaceholder": "例如：项目记忆",
			"config.newPackDirectoryAria": "新 Pack 数据目录",
			"config.confirmAddPack": "加入列表",
			"config.customDirectory": "自定义目录",
			"config.customHint": "整个 Mnemon 数据域都位于此处。",
			"config.customAria": "Mnemon 自定义数据目录",
			"config.customDirectoryHint": "填写 DSH Host 上的目录路径，只保存这一个目录。",
			"config.customPlaceholder": "例如：/data/mnemon 或 ~/mnemon",
			"config.invalidScope": "存储范围无效。",
			"config.customRequired": "选择自定义存储时必须填写数据目录。",
			"config.customAbsolute": "自定义目录必须是绝对路径或以 ~/ 开头；Windows 可填写盘符或 UNC 路径。",
			"config.saveFailed": "保存失败：{error}",
			"config.readOnly": "当前部署的插件设置为只读。",
			"config.unavailable": "无法加载记忆系统设置。请检查 Host 是否已为当前 Web 部署授权设置 RPC。",
			"config.discard": "放弃修改",
			"config.saving": "保存中…",
			"config.save": "保存",
			"config.overridden": "已覆盖",
			"config.interactionTitle": "对话界面",
			"config.interactionLive": "实时生效",
			"config.interactionHint": "保存后实时生效；关闭某项后恢复 DSH 原生呈现。",
			"config.interactionTurnBar": "回合记忆条",
			"config.interactionTurnBarHint": "在回合尾部展示召回、沉淀与检索活动",
			"config.interactionSaveAction": "存入记忆按钮",
			"config.interactionSaveActionHint": "在已定稿回复旁提供受监督的记忆沉淀入口",
			"config.interactionOn": "开启",
			"config.packTitle": "备份与迁移",
			"config.packDescription": "整体导出与导入当前生效目录；导入始终落到下方显示的位置。",
			"config.packActiveTarget": "当前生效目录",
			"config.packTargetLoading": "正在读取运行目标…",
			"config.packUnavailable": "当前 DSH 主机不支持 Mnemon ZIP 备份通道。",
			"config.packFull": "整体 Pack",
			"config.packFullHint": "Runtime、Documents 与记忆体",
			"config.packRuntime": "Runtime",
			"config.packRuntimeHint": "热记忆与 USER / MEMORY 投影",
			"config.packDocuments": "Documents",
			"config.packDocumentsHint": "项目文档、归档与索引",
			"config.packMemorySpaces": "记忆体",
			"config.packMemorySpacesHint": "目录清单与 mnemon.db",
			"config.packExport": "导出",
			"config.packImport": "导入",
			"config.packExporting": "导出中…",
			"config.packInspecting": "检查中…",
			"config.packImporting": "导入中…",
			"config.packChooseFile": "选择{component}文件",
			"config.packFormatHint": "统一使用 .mnemonpack（ZIP + manifest + SHA-256）；记忆体仍以独立 mnemon.db 保存在包内。",
			"config.packPreviewEyebrow": "导入预览",
			"config.packUnnamed": "未命名 Mnemon Pack",
			"config.packSource": "来源",
			"config.packDestination": "导入到",
			"config.packArchiveSize": "压缩 / 展开",
			"config.packComponents": "选择要导入的组件",
			"config.packComponentSummary": "{items} 项 · {files} 个文件 · {size}",
			"config.packHasData": "目标已有数据",
			"config.packMerge": "安全合并（推荐）",
			"config.packMergeHint": "保留现有内容；冲突项自动去重或生成新 ID。",
			"config.packMergeAction": "合并导入",
			"config.packReplace": "覆盖当前组件？",
			"config.packReplaceHint": "所选组件会被 Pack 内容原子替换；其他组件不受影响。",
			"config.packReplaceAction": "覆盖导入…",
			"config.packConfirmReplace": "确认覆盖",
			"config.packComponentMissing": "这个 Pack 不包含所选组件。",
			"config.packExported": "已导出 {file}（{size}）。",
			"config.packImported": "已将 {components} 导入 {root}。",
			"config.packFailed": "ZIP 操作失败：{error}",
			"config.packSimpleDescription": "备份或恢复当前 Mnemon 数据；第三方 Provider 数据仍由对应服务管理。",
			"config.packWholeZip": "当前目录 ZIP",
			"config.packWholeZipHint": "包含 Runtime、Documents 和 mnemon 记忆体；不包含第三方数据或密钥。",
			"config.packImportZip": "导入 ZIP",
			"config.packExportZip": "导出 ZIP",
			"config.packChooseZip": "选择 Mnemon 备份 ZIP",
			"config.packUnnamedZip": "Mnemon 备份.zip",
			"config.packZipReady": "校验通过 · {components} 个组件 · {items} 项 · {size}",
			"config.packImportZipAction": "安全导入",
			"config.packImportedWhole": "已将 ZIP 安全合并到 {root}。"
		};
		const en = {
			"tab.label": "Memory System",
			"term.space": "Memory Space",
			"term.spaces": "Memory Spaces",
			"category.decision": "Decision",
			"category.preference": "Preference",
			"category.fact": "Fact",
			"category.insight": "Insight",
			"category.context": "Context",
			"category.general": "General",
			"nav.aria": "Mnemon pages",
			"nav.group.system": "System",
			"nav.group.storage": "Memory tiers",
			"nav.group.tools": "Read and write",
			"nav.memory.aria": "Memory Space pages",
			"nav.overview": "Overview",
			"nav.bodies": "Memory Spaces",
			"nav.bodies.detail": "Directory and live graph",
			"nav.runtime": "Runtime",
			"nav.runtime.detail": "Hot memory and context",
			"nav.documents": "Documents",
			"nav.documents.detail": "Project knowledge and archive",
			"nav.search": "Recall",
			"nav.search.detail": "Intent-aware retrieval",
			"nav.entities": "Entities",
			"nav.entities.detail": "Relations and context",
			"nav.remember": "Distill",
			"nav.rememberAction": "Remember",
			"nav.remember.detail": "LLM-supervised writeback",
			"nav.content": "Content",
			"nav.content.detail": "Browse and maintain",
			"nav.status": "Status",
			"nav.status.detail": "Runtime and diagnostics",
			"common.refresh": "Refresh status",
			"common.loading": "Loading…",
			"common.cancel": "Cancel",
			"common.copyId": "Copy ID",
			"common.readOnly": "Read only",
			"common.activationOnly": "Activation control only",
			"common.agentSupervised": "Subagent supervised",
			"common.active": "Active",
			"common.inactive": "Inactive",
			"common.category": "Category",
			"common.importanceLabel": "Importance",
			"common.importance": "Importance {value}",
			"common.hops": "{count} hops",
			"common.allCategories": "All categories",
			"common.memories": "{count} memories",
			"common.edges": "{count} edges",
			"common.count": "{count}",
			"common.showing": "Showing {visible} / {total}",
			"common.showMore": "Show {count} more",
			"header.backToConversation": "Back to chat",
			"header.checking": "Checking",
			"header.connected": "Connected",
			"header.connectedWithCount": "Connected · {count} active",
			"header.directoryPending": "Connected · directory pending",
			"header.unavailable": "Unavailable",
			"header.notReady": "Mnemon is not ready",
			"workspace.viewing": "Viewing workspace",
			"workspace.selectorAria": "Select a memory workspace to inspect",
			"workspace.storageMode": "Storage",
			"workspace.storageModeAria": "Storage location mode: {mode}",
			"workspace.mismatchTitle": "The inspected directory is not aligned with this session",
			"workspace.mismatchShort": "Not conversation workspace",
			"workspace.mismatchDescription": "Workbench actions target the inspected directory; agents, tools, and lifecycle hooks continue to use the current session directory.",
			"workspace.selectedRoot": "Viewing: {root}",
			"workspace.effectiveRoot": "Effective: {root}",
			"workspace.align": "Align to conversation",
			"telemetry.aria": "Memory statistics",
			"telemetry.title": "Memory statistics",
			"telemetry.memories": "Active memories",
			"telemetry.graph": "Active graph",
			"telemetry.entities": "Active entities",
			"telemetry.spaces": "Spaces",
			"sidebar.activeSpaces": "Active Memory Spaces",
			"overview.title": "Memory Spaces",
			"overview.description": "Manage Mnemon Memory Spaces and third-party provider namespaces together. Active spaces participate in unified reads, routing, and live snapshots.",
			"overview.pageDescription": "Create and activate Memory Spaces, then inspect storage health and live relation snapshots across providers.",
			"overview.interval": "Full sync on entry · Click a card to sync on demand",
			"overview.fullSyncPending": "Waiting for the first full sync",
			"overview.fullSyncJustNow": "Last full sync: just now",
			"overview.fullSyncSeconds": "Last full sync: {count}s ago",
			"overview.fullSyncMinutes": "Last full sync: {count}m ago",
			"overview.fullSyncHours": "Last full sync: {count}h ago",
			"overview.fullSyncDays": "Last full sync: {count}d ago",
			"overview.syncing": "Syncing…",
			"overview.syncNow": "Sync now",
			"overview.directory": "Memory Space Directory",
			"overview.directory.description": "Each card represents a real memory namespace. A third-party Provider creates its projection on first connection; later card clicks check only that space, without overwriting locally maintained titles or descriptions.",
			"overview.directory.waiting": "Waiting for directory",
			"overview.directory.unsynced": "Directory not synchronized",
			"overview.directory.unsyncedBadge": "Directory pending",
			"overview.directoryLoading": "Loading the Memory Space directory",
			"overview.healthLoading": "Checking Memory Space health",
			"overview.storageHealthy": "Storage healthy",
			"overview.storageUnhealthy": "Storage unavailable",
			"overview.storageChecking": "Checking",
			"overview.reconnecting": "Reconnecting",
			"overview.reconnectHint": "Click the card to reconnect and synchronize this Memory Space",
			"overview.reconnectAria": "Reconnect {name}",
			"overview.snapshotLoading": "Loading the multi-space live snapshot",
			"overview.metadataAction": "AI metadata",
			"overview.metadataTitle": "Maintain Memory Space metadata with AI",
			"overview.metadataDescription": "Select one or more active Memory Spaces. The system reads a small sample through each Provider’s fastest native path, then gives each space to an independent task Agent for its title and description.",
			"overview.metadataUnavailable": "Temporarily unavailable: no active Agent matches the current memory scope",
			"overview.metadataLoading": "Loading maintainable Memory Spaces…",
			"overview.metadataEmpty": "There are no active Memory Spaces whose metadata can be maintained by AI.",
			"overview.metadataSelected": "{count} Memory Spaces selected",
			"overview.metadataSelectAll": "Select all",
			"overview.metadataClear": "Clear",
			"overview.metadataSafety": "Only local titles and descriptions are updated. Memory content is never changed, moved, or deleted. Disabling a Provider removes this local metadata with its projection.",
			"overview.metadataGenerate": "Generate with AI ({count})",
			"overview.metadataGenerating": "AI is generating…",
			"overview.metadataRunningCount": "{count} running",
			"overview.metadataTaskRunning": "Generating…",
			"overview.metadataTaskSuccess": "Updated",
			"overview.metadataTaskError": "Failed: {error}",
			"overview.metadataTaskUnknown": "Unknown error",
			"overview.metadataCompleted": "Updated metadata for {count} Memory Spaces.",
			"overview.mnemonDefault": "Mnemon default",
			"overview.toggleAria": "{name} read toggle",
			"overview.toggling": "Switching",
			"overview.noDescription": "No routing description yet.",
			"overview.unsyncedTitle": "Memory Space directory is not synchronized",
			"overview.unsyncedShort": "The Web client and DSH Host are using different contracts. Restart the Host to register existing Stores.",
			"overview.unsyncedLong": "The Host is still using the previous plugin contract. Restart DSH to rediscover existing Stores; no .db file will be deleted.",
			"overview.emptyTitle": "No Memory Spaces yet",
			"overview.emptyShort": "Create the first space and distill durable context into it.",
			"overview.emptyLong": "Create a Mnemon Memory Space, or enable a third-party provider in Settings → Memory System to synchronize its existing namespaces.",
			"overview.noActiveTitle": "No active Memory Spaces",
			"overview.noActiveText": "Enable read access for at least one space to aggregate its live graph here.",
			"overview.noContentTitle": "Active spaces have no content yet",
			"overview.noContentText": "Distill durable context into a space to populate nodes and relations.",
			"overview.create": "+ Create empty Memory Space",
			"overview.createTitle": "Create Memory Space",
			"overview.createDialogHint": "Define this Memory Space and choose its provider here. It reuses services, credentials, and global data locations from Settings → Memory System.",
			"overview.createIdentityTitle": "Memory Space details",
			"overview.createIdentityHint": "The name identifies the space; the description guides when the agent writes and recalls it.",
			"overview.createPlacementTitle": "Memory Space provider",
			"overview.createPlacementHint": "This is an explicit manual creation. Choose one enabled Provider; automatic selection is managed by Distillation Strategy.",
			"overview.createName": "New Memory Space name",
			"overview.createNamePlaceholder": "Name",
			"overview.createDescription": "New Memory Space description",
			"overview.createDescriptionPlaceholder": "Describe what belongs here and when it should be recalled",
			"overview.placementMode": "Engine selection",
			"overview.placementManual": "Choose manually",
			"overview.placementManualHint": "Choose one enabled provider directly",
			"overview.placementAutomatic": "Smart selection",
			"overview.placementAutomaticHint": "Apply data-boundary and capability rules first, then let the agent choose among eligible providers",
			"overview.placementUnavailable": "Requires a connected conversation aligned with this workspace",
			"overview.recommended": "Recommended",
			"overview.placementPolicy": "Selection policy",
			"overview.placementPolicyHint": "The host enforces rules. The prompt only guides judgment among eligible candidates.",
			"overview.agentDecision": "Agent decision",
			"overview.placementPrompt": "Strategy prompt (optional)",
			"overview.placementPromptPlaceholder": "For example: This is collaborative knowledge. Prefer local storage when exact writes are required; otherwise prefer sharing.",
			"overview.dataBoundary": "Data boundary",
			"overview.dataBoundaryRemote": "Remote services allowed",
			"overview.dataBoundaryLocal": "Local only",
			"overview.preference": "Soft preference",
			"overview.preferenceBalanced": "Balanced",
			"overview.preferenceLocal": "Local first",
			"overview.preferenceShared": "Shared first",
			"overview.requiredCapabilities": "Required capabilities (select any)",
			"overview.capability.graph": "Relation graph",
			"overview.capability.exact-write": "Exact writes",
			"overview.capability.forget": "Safe forget",
			"overview.candidateNativeReady": "Official native · follows the active memory scope",
			"overview.providerServiceRequired": "Not enabled; configure the service in Settings → Memory System first",
			"overview.workspaceBinding.automatic": "Follows the active memory scope",
			"overview.workspaceBinding.optional-override": "Follows the active scope; global location can be customized",
			"overview.workspaceBinding.provider-global": "Always uses the global scope",
			"overview.candidateOpenViking": "Include the remote candidate and provide its connection",
			"overview.candidateLocal": "Local provider · follows the active memory scope",
			"overview.candidateRemote": "Remote provider · uses the global service configuration",
			"overview.placementByLlm": "Agent selected",
			"overview.placementByRules": "Rule selected",
			"overview.placementConfidence": "Confidence: {confidence}",
			"overview.confidence.high": "High",
			"overview.confidence.medium": "Medium",
			"overview.confidence.low": "Low",
			"overview.providerLabel": "Memory engine",
			"overview.nativeOfficial": "Official native",
			"overview.providerNativeHint": "Official native, local-first storage with the full graph and soft-delete semantics",
			"strategy.action": "Distillation strategy",
			"strategy.title": "Distillation strategy",
			"strategy.description": "Choose how the Agent selects a Provider when it must create a new Memory Space during distillation. Existing spaces are still routed by name, description, and capabilities first.",
			"strategy.loading": "Loading Provider directory…",
			"strategy.modeTitle": "Provider selection",
			"strategy.modeHint": "This policy applies only to Agent-created spaces during distillation. Manual Create Memory Space always asks you to choose.",
			"strategy.manualHint": "Fix one Provider; the Agent cannot override it",
			"strategy.automaticHint": "Apply hard rules first, then let the task Agent choose an eligible Provider",
			"strategy.manualTitle": "Fixed Provider",
			"strategy.manualDescription": "When no existing space fits, create the new space on this Provider.",
			"strategy.automaticTitle": "Smart selection rules",
			"strategy.automaticDescription": "The host enforces data and capability rules. The prompt only guides judgment among eligible candidates.",
			"strategy.taskAgentReady": "Task Agent ready",
			"strategy.taskAgentUnavailable": "Waiting for task Agent",
			"strategy.save": "Save strategy",
			"strategy.saving": "Saving…",
			"overview.providerOpenVikingHint": "Connect an existing OpenViking service under the same Memory Space workflow",
			"overview.providerSummary.mnemon-native": "Official native, local-first storage with the full graph and soft-delete semantics",
			"overview.providerSummary.openviking": "Filesystem-shaped shared memory with tiered reads and automatic semantic extraction",
			"overview.providerSummary.honcho": "Cross-session user modelling, peer profiles, dialectic reasoning, and persistent conclusions",
			"overview.providerSummary.mem0": "Automatic fact extraction, semantic retrieval, reranking, and deduplication",
			"overview.providerSummary.hindsight": "Knowledge-graph memory with entity resolution, multi-strategy recall, and reflection",
			"overview.providerSummary.holographic": "Local structured fact memory with trust scoring, entity resolution, and compositional retrieval",
			"overview.providerSummary.retaindb": "Cloud hybrid vector/BM25 retrieval, user profiles, and typed durable facts",
			"overview.providerSummary.byterover": "Local-first hierarchical knowledge tree accessed through the brv CLI",
			"overview.providerSummary.supermemory": "Semantic memory, persistent profiles, conversation ingest, and multi-container recall",
			"overview.providerEndpoint": "Service endpoint",
			"overview.providerEndpointPlaceholder": "For example: http://127.0.0.1:1933",
			"overview.providerTargetUri": "Memory scope URI",
			"overview.providerTargetPlaceholder": "For example: viking://user/memories",
			"overview.providerAdvanced": "Identity and credentials (optional)",
			"overview.providerApiKey": "API Key",
			"overview.providerApiKeyOptional": "Leave blank when authentication is disabled",
			"overview.providerApiKeyKeep": "Saved; leave blank to keep unchanged",
			"config.providerSecretShow": "Show credential",
			"config.providerSecretHide": "Hide credential",
			"config.providerSecretStoredValue": "Saved credential",
			"overview.providerAccount": "Account",
			"overview.providerUser": "User",
			"overview.providerActorPeer": "Actor Peer",
			"overview.providerField.workspace": "Workspace",
			"overview.providerField.userId": "User ID",
			"overview.providerField.agentId": "Agent ID",
			"overview.providerField.mode": "Mode",
			"overview.providerField.rerank": "Rerank search results",
			"overview.providerField.bankId": "Memory bank",
			"overview.providerField.budget": "Recall budget",
			"overview.providerField.dataPath": "Fact store path",
			"overview.providerField.defaultDirectory": "Default knowledge directory",
			"overview.providerField.defaultTrust": "Default trust",
			"overview.providerField.minTrust": "Minimum recall trust",
			"overview.providerField.project": "Project",
			"overview.providerField.cliPath": "brv executable",
			"overview.providerField.workingDirectory": "Knowledge directory",
			"overview.providerField.containerTag": "Container tag",
			"overview.providerField.searchMode": "Search mode",
			"overview.providerOption.platform": "Mem0 Platform",
			"overview.providerOption.self-hosted": "Self-hosted server",
			"overview.providerOption.low": "Low",
			"overview.providerOption.mid": "Medium",
			"overview.providerOption.high": "High",
			"overview.providerOption.hybrid": "Hybrid",
			"overview.providerOption.memories": "Memories",
			"overview.providerOption.documents": "Documents",
			"overview.providerKindLocal": "Local engine",
			"overview.providerKindRemote": "Remote service",
			"overview.providerSecretClear": "Clear the saved credential",
			"overview.providerWriteExact": "Exact writes",
			"overview.providerWriteAsync": "Asynchronous semantic extraction",
			"overview.providerGraphReady": "Relation graph available",
			"overview.providerSearchReady": "Unified search available",
			"overview.providerRemote": "Third-party remote memory",
			"overview.providerLocal": "Third-party local memory",
			"overview.creating": "Creating…",
			"overview.createAction": "Create",
			"overview.editBody": "Edit",
			"overview.editBodyAria": "Edit {name}",
			"overview.editName": "Name",
			"overview.editDescription": "Routing description",
			"overview.saveBody": "Save",
			"overview.savingBody": "Saving…",
			"overview.deleteBody": "Delete",
			"overview.deleteBodyAria": "Delete {name}",
			"overview.deleteTitle": "Delete “{name}”?",
			"overview.deleteWarning": "This permanently deletes the Memory Space and every memory and relation it contains. This cannot be undone.",
			"overview.lastStoreDeleteHint": "Mnemon must retain at least one native Store. The last Memory Space may be inactive, but it cannot be deleted.",
			"overview.deleteAction": "Delete permanently",
			"overview.disconnectBody": "Disconnect",
			"overview.disconnectBodyAria": "Disconnect {name}",
			"overview.disconnectTitle": "Disconnect “{name}”?",
			"overview.disconnectWarning": "This only removes the {provider} connection from the DSH Memory Space directory. Memories in the underlying engine remain untouched.",
			"overview.disconnectAction": "Disconnect",
			"overview.deletingBody": "Deleting…",
			"overview.snapshot": "Live multi-space snapshot",
			"overview.snapshotSources": "Snapshot observability",
			"overview.snapshotSourcesHint": "True relation graphs, edge-free content projections, and query-only spaces remain distinct; missing provider relations are never invented.",
			"overview.noVisualTitle": "Active spaces are query-only",
			"overview.noVisualText": "These providers expose neither enumerable content nor a graph. Open Recall and ask a focused question.",
			"overview.waitingSnapshot": "Waiting for the first snapshot",
			"overview.updatedAt": "Updated at {time}",
			"overview.edgeScope": "Space scope",
			"overview.edgeTemporal": "Temporal",
			"overview.edgeSemantic": "Semantic",
			"overview.edgeCausal": "Causal",
			"overview.edgeEntity": "Entity relation",
			"overview.graphComposition": "{spaces} spaces · {memories} memories · {entities} entities",
			"overview.graphCount": "Showing {visible} / {total} elements",
			"overview.graphEdges": "{count} graph edges",
			"overview.inspector": "Memory details",
			"overview.inspectorSpace": "Memory Space details",
			"overview.inspectorEntity": "Entity details",
			"overview.selectNode": "Select a graph element",
			"overview.selectNodeText": "Inspect the exact context for a Memory Space, entity, or memory.",
			"overview.closeInspector": "Close node details",
			"overview.memoryId": "Memory ID",
			"overview.spaceId": "Memory Space ID",
			"overview.containedMemories": "Contained memories",
			"overview.entityMentions": "Indexed mentions",
			"overview.exploreNode": "Recall around this",
			"overview.previewAria": "View full content",
			"overview.previewTitle": "Full content",
			"overview.loading": "Synchronizing the multi-space live snapshot…",
			"runtime.title": "Runtime Memory",
			"runtime.description": "Manage compact hot memory loaded into every turn. A single control plane owns structured data and projects USER.md and MEMORY.md.",
			"runtime.total": "{count} hot memories",
			"runtime.entriesAria": "Runtime memory list",
			"runtime.scopeAria": "Runtime memory scope",
			"runtime.scopeAll": "All",
			"runtime.filterAria": "Filter runtime memory",
			"runtime.filterPlaceholder": "Filter by content…",
			"runtime.noMatch": "No hot memory matches the current scope and query.",
			"runtime.refresh": "Refresh",
			"runtime.hotContext": "Every-turn context",
			"runtime.addTitle": "Add hot memory",
			"runtime.addDescription": "Keep stable, frequently useful information here; Mnemon Memory Spaces remain the durable archive.",
			"runtime.content": "Runtime memory content",
			"runtime.placeholder": "Enter one compact, self-contained fact that will remain useful…",
			"runtime.target": "Target",
			"runtime.importance": "Importance",
			"runtime.saving": "Working…",
			"runtime.addButton": "Add memory",
			"runtime.addAction": "Add",
			"runtime.target.user": "User Profile",
			"runtime.target.user.description": "Identity, role, habits, communication preferences, and explicit collaboration requirements. Capacity maintenance stays local and never enters a Memory Space.",
			"runtime.target.memory": "Working Memory",
			"runtime.target.memory.description": "Projects, environment, decisions, conventions, tool behavior, and reusable lessons. At capacity, entries are routed into one or more topic-specific Memory Spaces.",
			"runtime.importance.critical": "Critical",
			"runtime.importance.normal": "Normal",
			"runtime.importance.low": "Low",
			"runtime.empty": "No hot memory in this target yet.",
			"runtime.editContent": "Edit runtime memory",
			"runtime.editAction": "Edit",
			"runtime.saveEdit": "Save change",
			"runtime.removeAction": "Remove",
			"runtime.removeConfirm": "Remove this hot-memory entry?",
			"runtime.removeTitle": "Remove runtime memory?",
			"runtime.removeWarning": "After removal, this content will no longer load with every turn. This action cannot be undone.",
			"runtime.result.add": "Added to {target} · {count} entries",
			"runtime.result.replace": "Updated {target} · {count} entries",
			"runtime.result.remove": "Removed from {target} · {count} entries",
			"runtime.result.maintenance": "Capacity maintenance complete: archived to {spaces}, then updated {target} · {count} entries",
			"runtime.result.localCompaction": "Local profile compaction complete: no Memory Space write; updated {target} · {count} entries",
			"runtime.readOnly": "This deployment is read only. Hot memory still enters context but cannot be changed here.",
			"runtime.footnote": "memories.json is the only source of truth. The control plane generates both Markdown files; do not edit them directly.",
			"documents.title": "Project Documents",
			"documents.description": "Maintain structured project documents in the current workspace. Active documents support near-field search; before the 10 MB limit is exceeded, the least-recently-used document is indexed in Mnemon and moved to the archive.",
			"documents.capacity": "{used} / {limit}",
			"documents.refresh": "Refresh",
			"documents.summary": "Document storage summary",
			"documents.active": "Active",
			"documents.activeHint": "Near-field search scope",
			"documents.archivedCount": "Archive",
			"documents.archivedHint": "Excluded from active capacity",
			"documents.activeCapacity": "Active capacity",
			"documents.capacityHint": "Measured from actual UTF-8 files",
			"documents.searchAria": "Search project documents",
			"documents.searchPlaceholder": "Search designs, investigations, procedures, or handoffs…",
			"documents.search": "Search",
			"documents.scope": "Document scope",
			"documents.new": "New document",
			"documents.newTitle": "Create managed document",
			"documents.editTitle": "Edit active document",
			"documents.editorHint": "The control plane generates frontmatter, hashes, and revisions. Project source files stay read only.",
			"documents.managedCopy": "Managed copy",
			"documents.name": "Title",
			"documents.routing": "Retrieval description",
			"documents.sources": "Source paths",
			"documents.sourcesPlaceholder": "src/index.ts, docs/architecture.md",
			"documents.markdown": "Markdown content",
			"documents.saving": "Saving…",
			"documents.create": "Create document",
			"documents.save": "Save revision",
			"documents.created": "Active document created.",
			"documents.createdAfterArchive": "Archived {count} older document(s), then created the active document.",
			"documents.updated": "New document revision saved.",
			"documents.updatedAfterArchive": "Archived {count} older document(s), then saved the revision.",
			"documents.archived": "Mnemon cold index created and document archived; Memory Spaces: {spaces}",
			"documents.list": "Project document list",
			"documents.activeList": "Active directory",
			"documents.archiveList": "Archive directory",
			"documents.noDescription": "No retrieval description.",
			"documents.missing": "File missing",
			"documents.emptyActive": "No active documents yet",
			"documents.emptyActiveText": "Complex work is reviewed after it reaches the activity-score gate, or you can create a Document above.",
			"documents.emptyArchived": "No archives yet",
			"documents.emptyArchivedText": "Only documents with a completed Mnemon index are moved here.",
			"documents.reader": "Document reader",
			"documents.selectTitle": "Select a document",
			"documents.selectText": "Read active project knowledge or follow a Mnemon reference to an archived original.",
			"documents.coldArchive": "Archived original",
			"documents.edit": "Edit",
			"documents.path": "Managed path",
			"documents.revision": "Revision",
			"documents.hash": "Content hash",
			"documents.size": "File size",
			"documents.archiveReceipt": "Mnemon cold-index receipt",
			"documents.archiveTitle": "Move to archive",
			"documents.archiveDescription": "A restricted independent task Agent first stores a searchable Mnemon summary and exact path. The original moves only after that succeeds.",
			"documents.archive": "Archive",
			"documents.archiveConfirm": "Create the Mnemon index and archive this document?",
			"documents.archiving": "Indexing and moving…",
			"documents.archiveNow": "Confirm archive",
			"documents.footnote": "`.mnemon/documents/index.json` is the control-plane source of truth. active stays at or below 10 MB, archived is excluded, and project source files are never modified.",
			"graph.layoutAria": "Graph layout",
			"graph.layoutNatural": "Natural layout",
			"graph.layoutUniform": "Uniform layout",
			"graph.layoutCustom": "Custom layout",
			"graph.layoutStatus": "Layout: {layout}",
			"graph.draggable": "{layout} · draggable",
			"graph.naturalAction": "Natural spread",
			"graph.uniformAction": "Uniform reset",
			"graph.aria": "Mnemon live memory graph with {nodes} elements and {edges} edges",
			"graph.kindSpace": "Memory Space",
			"graph.kindEntity": "Entity",
			"card.confirmAria": "Confirm forgetting memory",
			"card.confirmText": "Soft-delete this memory?",
			"card.processing": "Processing…",
			"card.confirmForget": "Confirm forget",
			"card.related": "View related",
			"card.clone": "Create from this",
			"card.forget": "Forget",
			"turnTail.label": "Turn memory",
			"turnTail.recall": "recalled {count}",
			"turnTail.write": "wrote {count}",
			"turnTail.documents": "document search {count}",
			"turnTail.inspect": "inspected {count}",
			"turnTail.failed": "failed {count}",
			"turnTail.toolList": "Memory tools this turn",
			"turnTail.openTool": "Open the Memory page for {tool}",
			"saveAction.button": "Save to memory",
			"saveAction.tooltip": "Save this reply to memory",
			"saveAction.title": "Confirm save to memory",
			"saveAction.hint": "An independent task Agent qualifies, deduplicates, distills, chooses a Memory Space, and writes without reading or filling the main conversation context.",
			"saveAction.fetching": "Extracting message text…",
			"saveAction.missing": "Could not extract this message text from the session log.",
			"saveAction.candidate": "Candidate (editable)",
			"saveAction.truncated": "This reply is long; only the first {limit} characters are loaded here.",
			"saveAction.submit": "Confirm and send to task Agent",
			"saveAction.submitting": "Dispatching…",
			"saveAction.result": "Independent task Agent: {summary}",
			"saveAction.failed": "Dispatch failed: {error}",
			"saveAction.readOnly": "This deployment is read only; memory writes are disabled.",
			"saveAction.close": "Close",
			"search.title": "Recall Memory",
			"search.description": "Retrieve raw evidence across active Memory Spaces; every provider uses its native recall method and keeps provenance.",
			"search.maxResults": "Up to {count} results",
			"search.placeholder": "Why did we choose SQLite? What release conventions apply?",
			"search.queryAria": "Memory query",
			"search.categoryAria": "Memory category",
			"search.strategy": "Strategy",
			"search.modeAria": "Recall mode",
			"search.modeSmart": "Smart recall",
			"search.modeKeyword": "Keyword search",
			"search.modeBasic": "Basic match",
			"search.searching": "Recalling…",
			"search.action": "Direct search",
			"search.agentAction": "Ask Agent",
			"search.agentSearching": "Agent analyzing…",
			"search.agentAnswer": "Agent answer",
			"search.agentAnswerHint": "Grounded in the recalled evidence below",
			"search.startTitle": "Start with a focused question",
			"search.startText": "A focused entity, decision, or timeline is more reliable than loading the whole database.",
			"search.emptyTitle": "No matches",
			"search.emptyText": "Try a more specific entity, decision, or timeline keyword.",
			"search.results": "Raw recalled evidence",
			"search.related": "Related memories",
			"search.closeRelated": "Close related memories",
			"search.traversing": "Traversing the graph…",
			"search.noRelated": "No related nodes found within two hops.",
			"search.sourcesTitle": "Search coverage",
			"entities.title": "Entity Explorer",
			"entities.description": "Inspect entity connections only in Memory Spaces that expose a real entity index.",
			"entities.sourcesTitle": "Entity capability coverage",
			"entities.unsupportedTitle": "No active space exposes an entity index",
			"entities.unsupportedText": "The active providers remain searchable through Recall, but are not presented here as a fabricated entity graph.",
			"entities.count": "{count} active entities",
			"entities.nameAria": "Entity name",
			"entities.placeholder": "Enter any entity…",
			"entities.action": "Explore",
			"entities.top": "Top entities",
			"entities.frequency": "By frequency",
			"entities.emptyRail": "Entities appear here after memories with entity metadata are stored.",
			"entities.loading": "Recalling entity relations…",
			"entities.selectTitle": "Select or enter an entity",
			"entities.selectText": "The entity view aggregates related memories instead of relying on literal matching.",
			"entities.emptyTitle": "No related memories",
			"entities.emptyText": "Try the full name or another entity alias.",
			"remember.title": "Distill Memory",
			"remember.description": "An independent task Agent with no conversation history selects a Memory Space, checks duplicates, distills the candidate, and completes the write without filling the main conversation context.",
			"remember.worker": "Independent task Agent",
			"remember.readOnlyTitle": "Read-only mode",
			"remember.readOnlyText": "This deployment disables memory writes. Change and save the DSH Mnemon configuration to enable them.",
			"remember.flowTitle": "What the independent task Agent does",
			"remember.routeTitle": "Choose ownership",
			"remember.routeText": "Select an existing Memory Space or recognize a durable new scope",
			"remember.dedupeTitle": "Search and deduplicate",
			"remember.dedupeText": "Identify duplicates, additions, or conflicts with existing memories",
			"remember.writeTitle": "Write structured memory",
			"remember.writeText": "Distill content and metadata, create useful relations, and return a receipt",
			"remember.flowText": "The independent task Agent receives only the Mnemon tools it needs, keeping the raw directory and retrieval process out of the main context.",
			"remember.delegateTitle": "Send to independent task Agent",
			"remember.noSession": "No live session",
			"remember.ready": "Independent task Agent ready",
			"remember.noTaskAgent": "Task Agent unavailable",
			"remember.taskAgentReady": "Task Agent ready",
			"remember.candidate": "Candidate",
			"remember.candidateAria": "Memory candidate",
			"remember.placeholder": "Enter background, preferences, decisions, or insights worth retaining across tasks. The model decides whether they qualify.",
			"remember.sessionHint": "No usable model route is available for an independent task Agent.",
			"remember.taskAgentHint": "The Host cannot currently create an isolated task Agent. Refresh status and try again.",
			"remember.processing": "Independent task Agent is working…",
			"remember.action": "Evaluate and distill",
			"remember.advanced": "Advanced human constraints",
			"remember.advancedHint": "Constrain the target Memory Space and metadata",
			"remember.expand": "Expand",
			"remember.target": "Target Memory Space",
			"remember.asyncProviderHint": "This Memory Space waits for remote extraction to settle before returning a truthful write receipt.",
			"remember.entities": "Entities (comma-separated)",
			"remember.tags": "Tags (comma-separated)",
			"remember.advancedText": "Advanced options constrain the independent task Agent; they do not bypass supervision or duplicate checks.",
			"remember.saving": "Independent task Agent is writing…",
			"remember.advancedAction": "Distill with constraints",
			"remember.skipped": "The independent task Agent decided not to write",
			"remember.completed": "The independent task Agent completed processing",
			"remember.processed": "Independent task Agent processed: {action}",
			"remember.dispatchFailed": "Dispatch failed: {error}",
			"remember.saveFailed": "Save failed: {error}",
			"content.title": "Memory Content",
			"content.description": "Inspect observable content through each provider’s real browse contract, with enumerable, query-only, and unavailable engines kept distinct.",
			"content.sourcesTitle": "Provider content models",
			"content.count": "{count} memories",
			"content.filterAria": "Filter memory content",
			"content.filterPlaceholder": "Filter by content or exact ID…",
			"content.categoryAria": "Memory category",
			"content.apply": "Apply filters",
			"content.notice": "Content calls each provider’s read-only browse contract directly; query-only engines run only after you enter a query.",
			"content.queryRequiredTitle": "Query-only spaces are waiting",
			"content.queryRequiredText": "Enter a focused query to inspect providers such as ByteRover that do not expose a complete list.",
			"content.showing": "Showing {visible} / {total}",
			"content.showMore": "Show {count} more",
			"content.emptyTitle": "No matching memories",
			"content.emptyText": "Clear the filters or distill the first durable memory.",
			"readSources.all": "All providers",
			"readSources.mode.search": "Native search",
			"readSources.mode.graph": "True relation graph",
			"readSources.mode.projection": "Content projection",
			"readSources.mode.enumerable": "Enumerable content",
			"readSources.mode.query-only": "Query only",
			"readSources.mode.entities": "Entity index",
			"readSources.mode.unsupported": "Unsupported",
			"readSources.status.ready": "{count} observable",
			"readSources.status.empty": "Connected · no content",
			"readSources.status.query-required": "Read after a query",
			"readSources.status.unsupported": "Unavailable on this surface",
			"readSources.status.unavailable": "Connection unavailable",
			"readSources.edges": "{count} true relations",
			"readSources.model.mnemon-native": "Facts, entities, and typed relations",
			"readSources.model.openviking": "Hierarchy and tiered content",
			"readSources.model.honcho": "Peer conclusions and profiles",
			"readSources.model.mem0": "Extracted semantic memories",
			"readSources.model.hindsight": "Memory units and knowledge graph",
			"readSources.model.holographic": "Trusted facts and entities",
			"readSources.model.retaindb": "Profiles and typed facts",
			"readSources.model.byterover": "Knowledge-tree queries",
			"readSources.model.supermemory": "Memories and ingested documents",
			"status.title": "System Status",
			"status.description": "dsh-mnemon, memory providers, three-tier storage, and the current read/write root. DSH deployment owns connection configuration.",
			"status.nominal": "System nominal",
			"status.checkRequired": "Check required",
			"status.rechecking": "Checking…",
			"status.recheck": "Check again",
			"status.aria": "Mnemon runtime status",
			"status.engine": "Memory engine",
			"status.engineConnected": "Mnemon connected",
			"status.engineUnavailable": "Mnemon unavailable",
			"status.engineChecking": "Checking the local engine",
			"status.versionWaiting": "Waiting for version",
			"status.pluginChecking": "Checking plugin status",
			"status.pluginReady": "Plugin running normally",
			"status.nativeAria": "mnemon provider status",
			"status.nativeLabel": "Native provider",
			"status.nativeCliMissing": "Mnemon CLI not found",
			"status.providersTitle": "Third-party providers",
			"status.providersDescription": "Live status for enabled providers and their Memory Spaces. Disabled providers are neither probed nor routed.",
			"status.providersAria": "Third-party provider status",
			"status.providersEnabled": "{enabled} / {total} enabled",
			"status.providerState.disabled": "Off",
			"status.providerState.idle": "Service ready · no active Memory Space",
			"status.providerState.healthy": "Connection healthy",
			"status.providerState.unhealthy": "Connection needs attention",
			"status.providerSpaces": "{active} / {total} Memory Spaces running",
			"versions.checkAction": "Check versions",
			"versions.title": "Check and update versions",
			"versions.description": "Check Mnemon CLI and dsh-mnemon. Updates are offered only for a recognized, supported installation.",
			"versions.checking": "Checking remote repositories for new versions…",
			"versions.checkingShort": "Checking…",
			"versions.recheck": "Check again",
			"versions.failed": "Version operation failed",
			"versions.timeout": "The version check timed out. Check the network and try again.",
			"versions.current": "Up to date",
			"versions.available": "Update available",
			"versions.unknown": "Cannot verify",
			"versions.installed": "Installed",
			"versions.latest": "Latest",
			"versions.executable": "Executable",
			"versions.profileLocation": "Profile · {name}",
			"versions.sourceLocation": "Source",
			"versions.linkSourceLocation": "Source · Profile {name}",
			"versions.packageLocation": "Package directory",
			"versions.update": "Update",
			"versions.updating": "Updating…",
			"versions.updated": "{name} updated",
			"versions.alreadyCurrent": "Already on the latest version",
			"versions.restartRequired": "Restart dsh web to load the new dsh-mnemon plugin code.",
			"versions.checkedAt": "Checked at {time}",
			"versions.latestUnavailable": "The remote latest version is unavailable. Check the network and try again.",
			"versions.modeHomebrew": "Homebrew",
			"versions.modeGo": "Go install",
			"versions.modeNpm": "DSH Profile",
			"versions.modeLink": "Local link",
			"versions.modeManual": "Manual",
			"versions.modeMissing": "Missing",
			"versions.hintHomebrew": "Managed by Homebrew; an available release can be safely updated here.",
			"versions.hintBrewMissing": "A Homebrew installation was detected, but the brew command is unavailable.",
			"versions.hintGo": "Managed by go install; an available release can be safely updated here.",
			"versions.hintPnpm": "Managed by the current DSH Profile; restart dsh web after updating.",
			"versions.hintPnpmMissing": "A DSH Profile installation was detected, but the pnpm command is unavailable.",
			"versions.hintLink": "This is a local linked development build. Pull and build in the source directory to preserve local changes.",
			"versions.hintInstall": "Mnemon CLI was not found. Install it and place mnemon on PATH, or set MNEMON_CLI_PATH / mnemon.cliPath.",
			"versions.hintManual": "The installation source cannot be identified safely. Update it using the original installation method.",
			"status.spaces": "Memory Spaces",
			"status.activeRatio": "{active} / {total} active",
			"status.runtime": "Runtime",
			"status.runtimeRatio": "{user} user · {memory} project",
			"status.runtimeBytes": "{bytes} used",
			"status.runtimeWaiting": "Waiting",
			"status.runtimeWaitingDetail": "Awaiting the Host storage inventory",
			"status.directoryUnsynced": "Directory not synchronized",
			"status.activeMemories": "{count} active memories",
			"status.documents": "Project Documents",
			"status.documentsWaiting": "Waiting for workspace",
			"status.documentsSession": "Available after binding a live session",
			"status.documentRatio": "{active} active · {archived} archived",
			"status.documentUsage": "{used} / {limit} active capacity",
			"status.storageDomains": "Storage Domains",
			"status.storageDomainsText": "The current selection is the shared directory boundary for runtime memory, Memory Spaces, and project Documents.",
			"status.storageBrowseOnly": "Browsing does not switch writes",
			"status.storageScopeAria": "Select a storage domain to inspect",
			"status.storageGlobal": "Global",
			"status.storageWorkspace": "Workspace",
			"status.storageCustom": "Custom",
			"status.storageCurrent": "Current read/write",
			"status.storageWaiting": "Reading storage-domain directories…",
			"status.storageCustomUnset": "No custom directory is configured. This view exposes only a custom root already configured and active in DSH.",
			"status.storageWorkspaceUnavailable": "The current session has no available workspace directory.",
			"status.storageActiveRoot": "Current read/write root",
			"status.storageViewedRoot": "Viewed root",
			"status.storageAvailable": "Directory available",
			"status.storageNotCreated": "Directory not created",
			"status.storageRuntime": "Runtime Memory",
			"status.storageBodies": "Memory Spaces",
			"status.storageDocuments": "Project Documents",
			"status.storageState": "Background State",
			"status.storageReady": "Ready",
			"status.storageEmpty": "Empty",
			"status.storageMissing": "Not created",
			"status.storageInvalid": "Repair needed",
			"status.storageItems": "items",
			"status.storageRuntimeDetail": "USER {user} · MEMORY {memory}",
			"status.storageBodiesDetail": "{active} active · {databases} databases",
			"status.storageDocumentsDetail": "{active} active · {archived} archived",
			"status.storageStateReady": "Review watermarks are persisted",
			"status.storageStateVolatile": "Review state is currently owned by the Host process",
			"status.storageFootnote": "Current read/write root: {root}. Change the scope only in DSH Settings → Memory System; it applies live after Save and never auto-migrates, merges, or deletes old content.",
			"config.aria": "Memory system configuration",
			"config.tab": "Mnemon",
			"config.title": "Memory system settings",
			"config.description": "Configure runtime memory, project Documents, Memory Spaces, and the DSH interface together. Changes apply immediately after Save.",
			"config.unsaved": "Unsaved changes",
			"config.ready": "Saved and applied live",
			"config.noticeBefore": "Configuration is written to",
			"config.noticeAfter": ". All settings apply live after Save. Switching scopes never migrates existing content automatically.",
			"config.displayTitle": "Display mode",
			"config.displayDescription": "Choose where the memory system appears in DSH Web. Switching modes applies immediately.",
			"config.displayAria": "Memory system display mode",
			"config.displaySidebar": "Sidebar",
			"config.displaySidebarHint": "Dedicated workspace in the sidebar",
			"config.displayBuildin": "Buildin",
			"config.displayBuildinHint": "Built-in tab in the conversation area",
			"config.storageTitle": "Memory scope",
			"config.storageDescription": "Choose whether Runtime, Documents, mnemon, and workspace-aware providers follow the current workspace. Other providers keep their own global scope.",
			"config.scope": "Storage scope",
			"config.scopeHint": "Global is shared across workspaces; Workspace is isolated by the current DSH session; Custom uses the directory below.",
			"config.scopeAria": "Memory system scope",
			"config.global": "Global",
			"config.workspace": "Workspace",
			"config.custom": "Custom",
			"config.customHintShort": "Enter one directory",
			"config.customSelected": "Directory entered",
			"config.globalScopeHint": "Shared across workspaces",
			"config.providersTitle": "Memory providers",
			"config.providersDescription": "Enable and configure provider services here. Enabling or saving synchronizes existing provider namespaces; disabling removes local mappings without deleting third-party data. Scope tags show the active boundary.",
			"config.nativeSummary": "Official native long-term memory with a complete relation graph",
			"config.officialNative": "Official native",
			"config.nativeGlobalLocation": "Global data location",
			"config.nativeGlobalLocationHint": "mnemon can use its default global directory or a directory you choose.",
			"config.nativeGlobalLocationWorkspaceHint": "Workspace scope is active; switch to Global to choose the default or a custom directory.",
			"config.nativeDefaultLocation": "Default ~/.mnemon",
			"config.providerGlobalLocation": "Global data location",
			"config.providerGlobalLocationHint": "{provider} uses the global scope directory by default, or you can choose a custom location.",
			"config.providerGlobalLocationWorkspaceHint": "The workspace default is active. Switch to Global to choose a custom location.",
			"config.providerDefaultLocation": "Default (follows scope)",
			"config.providerDefaultName": "{provider} Memory Space",
			"config.providerDefaultDescription": "{provider} long-term memory used by dsh-mnemon.",
			"config.newProviderConfig": "New Memory Space configuration",
			"config.newProviderConfigHint": "Saving creates and enables it immediately; there is no second connection step in Overview.",
			"config.providerHealthy": "Connection is healthy and ready for memory workflows",
			"config.providerNeedsAttention": "Connection needs attention; update and save it again",
			"config.providerActive": "Use for reads and routing",
			"config.providerMemoryName": "Memory Space name",
			"config.providerMemoryDescription": "Purpose",
			"config.providerSaveFailed": "Could not save configuration: {error}",
			"config.providerSaved": "Configuration saved",
			"config.createAndEnable": "Save and enable",
			"config.saveProviderConfig": "Save configuration",
			"config.addProviderConfig": "Add a Memory Space configuration",
			"config.providerNotConfigured": "Not configured",
			"config.providerConfiguredCount": "{count} configurations",
			"config.providerServiceTitle": "Service configuration",
			"config.providerServiceHint": "Shared by this provider’s Memory Spaces; enabling or saving refreshes their directory mappings and metadata.",
			"config.providerEnableHint": "Complete and save the service configuration to enable the provider and synchronize every visible namespace.",
			"config.providerServiceConfigured": "Service configured",
			"config.providerServiceNotConfigured": "Service not configured",
			"config.providerEnabled": "Enabled",
			"config.providerDisabled": "Not enabled",
			"config.providerDisabledConfigured": "Off · configuration kept",
			"config.providerNeedsConfiguration": "Configuration required",
			"config.providerToggleAria": "Enable {provider}",
			"config.providerToggleFailed": "Could not change provider state: {error}",
			"config.enableProvider": "Save and enable",
			"config.providerServiceSaved": "Service configuration saved and Memory Spaces synchronized",
			"config.saveProviderService": "Save service configuration",
			"config.providerUnavailable": "This DSH host does not support provider service configuration.",
			"config.saveScopeBeforeProviders": "The storage scope has unsaved changes. Save the scope before configuring providers in that directory.",
			"config.providerTargetWorkspace": "Current workspace: {workspace}. Providers tagged Workspace use this scope for configuration and Memory Spaces.",
			"config.loadingProviders": "Loading provider configurations…",
			"config.providerLoadFailed": "Could not load provider configurations: {error}",
			"config.retryProviders": "Retry",
			"config.taskAgentTitle": "Background task Agent",
			"config.taskAgentDescription": "AI metadata, Agent Query, memory distillation, and document archiving use clean independent task Agents. This setting changes only their model route.",
			"config.taskAgentModeAria": "Background task Agent model route",
			"config.taskAgentInherit": "Follow the main route",
			"config.taskAgentInheritHint": "Use the DSH new-session default model",
			"config.taskAgentFixed": "Choose model provider",
			"config.taskAgentFixedHint": "Pin Mnemon background tasks to one route",
			"config.taskAgentProvider": "Model provider",
			"config.taskAgentProviderHint": "Choose a model service configured in DSH",
			"config.taskAgentModel": "Model",
			"config.taskAgentModelHint": "Choose a complete model route from that provider",
			"config.taskAgentChooseProvider": "Choose provider",
			"config.taskAgentChooseModel": "Choose model",
			"config.taskAgentEffective": "Will currently use",
			"config.taskAgentLoading": "Loading model directory",
			"config.taskAgentUnavailable": "No Provider / Model route is currently available",
			"config.taskAgentLoadFailed": "Could not load the model directory: {error}",
			"config.taskAgentPartial": "{count} providers could not be read; the remaining options are still available.",
			"config.taskAgentRouteRequired": "Choose both a Provider and model for a fixed background-task route.",
			"config.customPack": "Custom Pack",
			"config.customPackAria": "Select a custom Mnemon Pack",
			"config.customPackRequired": "Select or add a custom Pack.",
			"config.customDefaultName": "Custom Pack",
			"config.noCustomPacks": "No Packs configured",
			"config.addPack": "Add Pack",
			"config.cancelAddPack": "Cancel adding",
			"config.removePack": "Remove",
			"config.customPackNameAria": "New Pack name",
			"config.customPackNamePlaceholder": "For example: Project memory",
			"config.newPackDirectoryAria": "New Pack data directory",
			"config.confirmAddPack": "Add to list",
			"config.customDirectory": "Custom directory",
			"config.customHint": "The complete Mnemon data domain lives here.",
			"config.customAria": "Mnemon custom data directory",
			"config.customDirectoryHint": "Enter a directory path on the DSH Host; only this one directory is stored.",
			"config.customPlaceholder": "For example: /data/mnemon or ~/mnemon",
			"config.invalidScope": "The storage scope is invalid.",
			"config.customRequired": "A data directory is required for custom storage.",
			"config.customAbsolute": "The custom directory must be absolute or start with ~/. Windows drive and UNC paths are supported.",
			"config.saveFailed": "Save failed: {error}",
			"config.readOnly": "Plugin settings are read-only in this deployment.",
			"config.unavailable": "Memory System settings could not be loaded. Check whether the Host grants the settings RPC to this Web deployment.",
			"config.discard": "Discard changes",
			"config.saving": "Saving…",
			"config.save": "Save",
			"config.overridden": "Overridden",
			"config.interactionTitle": "Conversation interface",
			"config.interactionLive": "Live",
			"config.interactionHint": "Changes apply live after saving. Disabling an item restores DSH's native presentation.",
			"config.interactionTurnBar": "Turn memory bar",
			"config.interactionTurnBarHint": "Show recall, write, and search activity below each turn",
			"config.interactionSaveAction": "Save to memory action",
			"config.interactionSaveActionHint": "Add supervised memory distillation beside finalized replies",
			"config.interactionOn": "Enabled",
			"config.packTitle": "Backup and migration",
			"config.packDescription": "Export or import the complete effective directory. Imports always target the location shown below.",
			"config.packActiveTarget": "Active directory",
			"config.packTargetLoading": "Loading the running target…",
			"config.packUnavailable": "This DSH host does not provide the Mnemon ZIP backup channel.",
			"config.packFull": "Complete Pack",
			"config.packFullHint": "Runtime, Documents, and Memory Spaces",
			"config.packRuntime": "Runtime",
			"config.packRuntimeHint": "Hot memory and USER / MEMORY projections",
			"config.packDocuments": "Documents",
			"config.packDocumentsHint": "Project documents, archive, and index",
			"config.packMemorySpaces": "Memory Spaces",
			"config.packMemorySpacesHint": "Catalog and mnemon.db databases",
			"config.packExport": "Export",
			"config.packImport": "Import",
			"config.packExporting": "Exporting…",
			"config.packInspecting": "Inspecting…",
			"config.packImporting": "Importing…",
			"config.packChooseFile": "Choose a {component} file",
			"config.packFormatHint": "Uses .mnemonpack throughout (ZIP + manifest + SHA-256). Each Memory Space remains a separate mnemon.db inside the Pack.",
			"config.packPreviewEyebrow": "Import preview",
			"config.packUnnamed": "Unnamed Mnemon Pack",
			"config.packSource": "Source",
			"config.packDestination": "Import into",
			"config.packArchiveSize": "Archive / expanded",
			"config.packComponents": "Components to import",
			"config.packComponentSummary": "{items} items · {files} files · {size}",
			"config.packHasData": "Target has data",
			"config.packMerge": "Safe merge (recommended)",
			"config.packMergeHint": "Keeps existing data; conflicting items are deduplicated or assigned new IDs.",
			"config.packMergeAction": "Merge import",
			"config.packReplace": "Replace current components?",
			"config.packReplaceHint": "Selected components are atomically replaced by the Pack; other components are unchanged.",
			"config.packReplaceAction": "Replace import…",
			"config.packConfirmReplace": "Confirm replace",
			"config.packComponentMissing": "This Pack does not contain the selected component.",
			"config.packExported": "Exported {file} ({size}).",
			"config.packImported": "Imported {components} into {root}.",
			"config.packFailed": "ZIP operation failed: {error}",
			"config.packSimpleDescription": "Back up or restore the current Mnemon data. External provider data remains managed by its service.",
			"config.packWholeZip": "Current directory ZIP",
			"config.packWholeZipHint": "Includes Runtime, Documents, and mnemon Memory Spaces; excludes external data and credentials.",
			"config.packImportZip": "Import ZIP",
			"config.packExportZip": "Export ZIP",
			"config.packChooseZip": "Choose a Mnemon backup ZIP",
			"config.packUnnamedZip": "Mnemon backup.zip",
			"config.packZipReady": "Verified · {components} components · {items} items · {size}",
			"config.packImportZipAction": "Safe import",
			"config.packImportedWhole": "Safely merged the ZIP into {root}."
		};
		function interpolate(dictionary, key, params) {
			const template = dictionary[key];
			if (params === void 0) return template;
			return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
		}
		function translateZh(key, params) {
			return interpolate(zh, key, params);
		}
		//#endregion
		//#region src/client/MnemonPackSection.tsx
		const ZIP_ACCEPT = ".zip,application/zip";
		function fileBase64(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onerror = () => reject(reader.error ?? /* @__PURE__ */ new Error("Could not read ZIP file"));
				reader.onload = () => {
					const value = reader.result;
					if (typeof value !== "string") return reject(/* @__PURE__ */ new Error("Could not read ZIP file"));
					const separator = value.indexOf(",");
					if (separator < 0) return reject(/* @__PURE__ */ new Error("ZIP file encoding is invalid"));
					resolve(value.slice(separator + 1));
				};
				reader.readAsDataURL(file);
			});
		}
		function bytesFromBase64(base64) {
			const binary = atob(base64);
			const buffer = new ArrayBuffer(binary.length);
			const bytes = new Uint8Array(buffer);
			for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
			return buffer;
		}
		function download(result) {
			const blob = new Blob([bytesFromBase64(result.base64)], { type: result.mimeType });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = result.fileName;
			anchor.hidden = true;
			document.body.append(anchor);
			anchor.click();
			anchor.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 0);
		}
		function formatBytes(bytes) {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / 1048576).toFixed(1)} MB`;
		}
		function MnemonPackSection({ connection, sessionId, workspaceId, refreshKey, t, embedded = false }) {
			const client = (0, react.useMemo)(() => connection === void 0 ? null : new MnemonClient(connection, sessionId, workspaceId), [
				connection,
				sessionId,
				workspaceId
			]);
			const input = (0, react.useRef)(null);
			const [target, setTarget] = (0, react.useState)(null);
			const [pending, setPending] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(client === null ? null : "target");
			const [failed, setFailed] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let active = true;
				if (client === null) return;
				setBusy("target");
				setFailed(null);
				client.packTarget().then((value) => {
					if (active) setTarget(value);
				}).catch((reason) => {
					if (active) setFailed(reason instanceof Error ? reason.message : String(reason));
				}).finally(() => {
					if (active) setBusy(null);
				});
				return () => {
					active = false;
				};
			}, [client, refreshKey]);
			const scopeLabel = (scope) => scope === "global" ? t("config.global") : scope === "workspace" ? t("config.workspace") : t("config.custom");
			const exportZip = async () => {
				if (client === null || busy !== null) return;
				setBusy("export");
				setFailed(null);
				setNotice(null);
				try {
					const result = await client.exportPack();
					download(result);
					setNotice(t("config.packExported", {
						file: result.fileName,
						size: formatBytes(result.bytes)
					}));
				} catch (reason) {
					setFailed(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setBusy(null);
				}
			};
			const inspectZip = async (file) => {
				if (client === null || busy !== null) return;
				setBusy("inspect");
				setFailed(null);
				setNotice(null);
				setPending(null);
				try {
					const base64 = await fileBase64(file);
					const preview = await client.inspectPack(base64, file.name);
					setPending({
						base64,
						preview
					});
				} catch (reason) {
					setFailed(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setBusy(null);
				}
			};
			const chooseFile = (event) => {
				const file = event.currentTarget.files?.[0];
				event.currentTarget.value = "";
				if (file !== void 0) inspectZip(file);
			};
			const importZip = async () => {
				if (client === null || pending === null || busy !== null) return;
				setBusy("import");
				setFailed(null);
				setNotice(null);
				try {
					const result = await client.importPack(pending.base64);
					setNotice(t("config.packImportedWhole", { root: result.targetRoot }));
					setPending(null);
				} catch (reason) {
					setFailed(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setBusy(null);
				}
			};
			const items = pending?.preview.manifest.summary.reduce((sum, component) => sum + component.items, 0) ?? 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: embedded ? MnemonSettingsCard_module_css_default.embeddedSection : MnemonSettingsCard_module_css_default.section,
				"aria-labelledby": "mnemon-pack-heading",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonSettingsCard_module_css_default.sectionHeading,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							id: "mnemon-pack-heading",
							children: t("config.packTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("config.packSimpleDescription") })] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonSettingsCard_module_css_default.settingRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonSettingsCard_module_css_default.settingCopy,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("config.packWholeZip") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("config.packWholeZipHint") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
										className: MnemonSettingsCard_module_css_default.activePath,
										title: target?.root,
										children: target?.root ?? t("config.packTargetLoading")
									}),
									target !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", {
										className: MnemonSettingsCard_module_css_default.scopeMeta,
										children: scopeLabel(target.scope)
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonSettingsCard_module_css_default.rowActions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: MnemonSettingsCard_module_css_default.pillButton,
									disabled: client === null || busy !== null,
									onClick: () => input.current?.click(),
									children: busy === "inspect" ? t("config.packInspecting") : t("config.packImportZip")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: MnemonSettingsCard_module_css_default.pillButton,
									disabled: client === null || busy !== null || target === null,
									onClick: () => void exportZip(),
									children: busy === "export" ? t("config.packExporting") : t("config.packExportZip")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: input,
								className: MnemonSettingsCard_module_css_default.visuallyHidden,
								type: "file",
								accept: ZIP_ACCEPT,
								"aria-label": t("config.packChooseZip"),
								onChange: chooseFile
							})
						]
					}),
					pending !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonSettingsCard_module_css_default.importBar,
						role: "status",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: pending.preview.fileName ?? t("config.packUnnamedZip") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("config.packZipReady", {
								components: pending.preview.manifest.components.length,
								items,
								size: formatBytes(pending.preview.archiveBytes)
							}) })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MnemonSettingsCard_module_css_default.textButton,
								disabled: busy !== null,
								onClick: () => setPending(null),
								children: t("common.cancel")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MnemonSettingsCard_module_css_default.primaryPill,
								disabled: busy !== null,
								onClick: () => void importZip(),
								children: busy === "import" ? t("config.packImporting") : t("config.packImportZipAction")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonSettingsCard_module_css_default.packFeedback,
						"aria-live": "polite",
						children: [
							failed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: MnemonSettingsCard_module_css_default.error,
								role: "alert",
								children: t("config.packFailed", { error: failed })
							}),
							notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: MnemonSettingsCard_module_css_default.packSuccess,
								children: notice
							}),
							client === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: MnemonSettingsCard_module_css_default.readOnly,
								children: t("config.packUnavailable")
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/MnemonLogo.tsx
		/** Official Mnemon mark from mnemon-dev/mnemon (Apache-2.0). */
		function MnemonLogo({ className, title = "Mnemon" }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				className,
				xmlns: "http://www.w3.org/2000/svg",
				viewBox: "0 0 400 400",
				role: "img",
				"aria-label": title,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						width: "400",
						height: "400",
						fill: "#1A1A1A"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M 91.5,153.5 L 98.5,146.5 L 98.5,98.5 L 146.5,98.5 L 153.5,91.5 L 91.5,91.5 Z",
						fill: "#D4D4D8"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M 246.5,91.5 L 253.5,98.5 L 301.5,98.5 L 301.5,146.5 L 308.5,153.5 L 308.5,91.5 Z",
						fill: "#D4D4D8"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M 91.5,246.5 L 98.5,253.5 L 98.5,301.5 L 146.5,301.5 L 153.5,308.5 L 91.5,308.5 Z",
						fill: "#D4D4D8"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M 308.5,246.5 L 301.5,253.5 L 301.5,301.5 L 253.5,301.5 L 246.5,308.5 L 308.5,308.5 Z",
						fill: "#D4D4D8"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", {
						points: "265,187 278,200 265,213",
						fill: "none",
						stroke: "#D4D4D8",
						strokeWidth: "2",
						strokeLinecap: "square"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", {
						points: "135,187 122,200 135,213",
						fill: "none",
						stroke: "#D4D4D8",
						strokeWidth: "2",
						strokeLinecap: "square"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("polygon", {
						points: "200,155 245,200 200,245 155,200",
						fill: "none",
						stroke: "#D4D4D8",
						strokeWidth: "7"
					})
				]
			});
		}
		//#endregion
		//#region src/client/ProviderIcon.tsx
		const PROVIDER_ICON_SOURCES = {
			openviking: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAASKADAAQAAAABAAAASAAAAACQMUbvAAAVNUlEQVR4Ae2bCZRUxbmA/7pLb7d7erpnumdlmAWQYUAMsiggkBhjjCImUZK8qE89CDEeTWKi5GXxzXkxmrgmGlBUIiQRI8YsgLhBQEVwYRWGgRlmX3q6p3t6X+5a76/ByRtx2GSgOS8Up0/drrm3btXHX3/9SzXAuXKOwDkC5wj8GxJYuHC7+G847ROf8tptkVt/+Xz0xhN/Ijt3ctl5LQBHoHVEkXXlzQ/1LZ27cLstW+M4a997/o9el/a0yPXPbab0nt+nX1vweKj0rB1stgb2br3ycChF6VNvUFr7vLxv0eP+idkay9Hem7UlxgaEErQWK336WEq9eaYaj9PxylWLm88qSFkFtK8lvaM7ZLRUFhFSWWBQr8daAkT/be0zjaXLlp0du1xWAS293ZvoS2hbNRSjz1US8DgM6pQsl+xuydxw8RXjfrX6rZ4JTNKyWbIKiE08kjT+GUsB5OUQqB5BoLgoh2vvVmb3RuiGiaNd/1i/JXDFvzWg3ri2IxIzZFkFMroYoLrMRHNzrJfeeG+dry9GfzNhnOtv698NXJstSFmXoM7WYKeigc8gAAJPYEaNCC5XrjCq1HLLxWMtjzd2GZsnT3Cv+tsW3/xsQMo6oNqby6NpWe8CBKTqQMsLeaguNwMYcNUND/VIr26N3L6/A6LTJ3ie+8eWnqvPNKSsAwIgFIuPTVwzAHiOks9fYKVmq1SeCodnPrSooGlvc+LnHX28bfK4vJVr3ur8wpmEdBYA6gcT0ynWOiWyRuiUsRYYPdJJZMW4lMFYsfbQ8r3NmY29CSH3wvEFq17eHJxypiCdFYBUWU1oOgDqIoQEIFkIuexCK2iUzKB0Nb/j6clqIJz48YE2LRVOCQVTxuW8uOSvrdVnAtJZAYiCoVGUoH5AuMwU1EWXTDBDscc89pZHq3FvA1h8rWd7KJpe1tYLIBtixRUXFa6qXVJXeLohnRWArGYTDwgIlXT/B7d8cDt4mDLO6YrHhX9JSmtb6EF/UOnsCKCuMpsvuP5rVX+67YE21+mEdFYAIoRKDA6TItRDKEF4gWV8lYM4beL5AwAeur2iJxRPPZKUAToDQCWb+dI7b/D8Yc536+wD9wx3fVYAstt4O1teBnLRcYlpOsFlBFDs5sFlF8YOnnT9If9yf5+8D+8lrT1AC/OsVz16V8XKL/2oRxp833BdnxWAqKF70sr/AWKg2HeHleCHLx882d8vHhsPhdOPRpK0X+JafUDz3dav/edV4sLB9w3XdfYBXbhMNIB3ZxgglBoD6bB/GRWozUwApavoB6s7rIMnvK+jfXUwqu5HjgT1Fe0KGODOMX3njsffyxl833BcZx3Qj++62K4b1N0Pp1/1oEmNZjXuZMDzAHYz8Qq9Mefgyf7x7onJaFJekUZljvqLRBIaFUVpzPQJlV8bfN9wXGcdUGWu5MmkwaMjEAaJIB+mrCmTJsqWGLFrBuc5crIdvYnVvWGtj+MISaQppNIAJrOEUrQe/ZThK1kH5LRaKwwiWClTPFgYIHbJNjL2sdsEs9VkzT9yyo8sKG5LpvVNzD1RVQKZtE4NwzQ1P3f8nCPvPZXvWQdkkywTDcxxEA7XCsLBbMdhXYRwmMHolEzE0PQhDcJoSlnXFzv8jKIaaIELxGF33nYqQI58NuuAEM5FzL1gYPiPR8MkiC23lAykuMAGhYW2fmv6yMGHE/K2QEjB/YwQFfWRphq0KM96+R2Pd0w98t7P+j2rgJau+8ilG+bJTP9wOBIGiOkd9O779RCTIFTAaBtx6GB8uuz44MPWWEpv1HQBMjLufApu+S7RMqrUceun7/5sLVkFlGsvmaxoYqnwMRwGiBmKDBKTIhQqUt8STTS397031PRefeIraFPTPaioQVEoyAxSisKIQtPVV9+zc0ipG6qfY7VlFVA0ZlyhUw5dBtyBRCSCRUfNzJYXg5XKUOgNyQ2qPdlytElomtbEdFcqpUMiqSMkg+bnWr2XTy+65mjPnEx71gA9s8FfgD5XmUU0tBwb7ddBbEdimBgclCriC2kQT6vvPb1oMmqYoQvhSScDmkbfJBTWcEfDPnDJji2XWBz7lOd3yh0MPezjtxIFLuZ4c7owjxctJqZ2UAyQDlPWuKFBbxgzHtE0Lh393WP1hkG1LmYiiBjP7osqEMdMrYzLzZUjVn/1R+9+yjw4Vl9D/S0rgB5dvdWqqLTabhWtXjfgDs90DnMwmPQQaPPhNYIKR5IpqpHdQw18oE3VDLzbkK0WkWQyer8UMdIWkXfPmuo5ZT2UFUA2c/nsvjgJjygQRlvxlBBTyIyIgK5Fd9CAWJIAShWToBZfn9A8AGOoOpNWA/h42GIR0DXhUA8pkEgRynGiqdhjLx/qmZNpO+OAVq+mfEbjv4jh1FaPixutfhzmMAmoaNFl6OihIKFrqmF7NGHsWlFbkTnWhO6/dUckI8thEzoYKEUQickQjVPKfLk8p1h5rGdP5G84rDNbwqLv0r4YH5823lboyuGtCm7NTH9gmgdautBtQDBMkmQZdyXZGHJ7ZyNe/15oXL7bfJk3l7/GbRcrdjaotL2LQLtPJb0hhcYSFuB48ROxpM8y0zMKqLa2lkvq4g0tLdFfz7sk957+3YonVFYpHOqkwJxOHXURWtZEkVN6SjHtGDypJ9ZEKkrzTVeWeriv5zvFqQVuzmZFmC0odSnVRCVHAlNHBm3rTsDoSgvkO3kM19biKqlF/J8ubGfAwhb4UcsZBZQ3fuFlfSkqB99vaBRuLpth4DJg23MH2sk8ShHTOwZKFKZ+gGhGx7OLV+684aE9UnVx2eU5dvP1LrtptjePdzswwGoWEKRC6fttlO5vM0gGIXvzrVDgTUGPPwm+QC54csUR339sds5vfgCRIwn8eVPP+JfeaEtie8uRfxv8/YwB2rRpk7Czl1/UHUj/7Ie/+vxUySqUhyIGDSUAnHYOt3NkgqFW0cShgWhAKslt/uHT37/FJZnvsFrFcSaM61tRz6DAUElEUwelbPNuCm1+HXNpTAgMUA0Oxo114XbfAw2tURg1wuEdPbKkCP/4CUBzaqkAQuzmcCL6wGAYQ12fMUC7gmOujSbh0OwLLCFMYizvjRIuw+wVB9efUe2L6RDsUw+GI8oGfyi1PqWbv5Pncj6JBgA6oZhRtFDIsXFQ4iYQQ6gfHDAgnMAAP67HgSikisvTyvFkQo2bfrQvQn0hu8WVZ2OA6gdP/qZZmf9wWISR35x7XnBw+1DXZwTQs691uINh4ZulheIbXo/jHcoJo9kuk84Y1BdQ9gejysaW9sTaP764/f3gu/PiCx4J3G63WuYqmSQIFpGarDwt8RAyAsNmDR0UGpi+QpsHbSAEZFCN6qhKULmj4ayjHjPjWq2skOihTpUrdhnlgyf+X7/3eco84v29sfSDg9uPdn1GAJkF671jRtpmSjbLvHga/aWYvCccybza7U+ue+71tp2dL03HeODh8o3axklKxrg/ZaRBsJuoIBCowBNoXieBvS24pHpw+aGSymCeCEO1/c6ExURw+XEgiBxGBTi23qC02AHhsAE9Ua7q4677q1kTXf9tEknxh3simwe3H+369ALCXeKFtyM3u3NsC2NJo66lK/5klz+27hf3790Nh5gn/slSftMmi6byj6Ew5Ii8QW0WDiZWCWBD3bO70YBARIMUi4GgZ8LxQCwWHmz4sVpQdwkcZVEBBvSwuwJQ6BbhUJOIO9nh8vSbmcuLC0yLdtSndz28ZNuBgfZj1acV0MKnd1gTFSOUpA9mLPjKwo8AXsKFdfRS7vTe7nQ4ZqVSGfC4Jbioxtrvehxo19A3U0HFQLUJAQhoKFkw48FgmHEGIk+BJwY4bQSNQx73foSEsDKyntSKTWhdAfx0ZbCkpkxYEs8Q4RAuZ6ibj3mU4xf8zzo7ypX3tFYrqrKlpsLtZm4Z2jgELWTaHZAhEldBZplFjBCxVaXhFqZi4IhFIjEthLuVjVx0vhtqKu0IVEuG4+quQCi9vq7Zv+bem2r2w4XbhTefm/CSx2Wa9/auTHrb3raLXvjpWPwPO345rRJ0/NcfvqMWTYCOD8wPRxImd4HbTA+0RmDr7iDNyBgiRKlBG4lFVfFmDkSRB6/bAheMc3GTa9wwqtQKZlFNoML/sKkzvHZnfei1+24dw5ZPvy5ib1j7ZPXP852meS0+gKbO+EaEs5e1n0g5KwCdb7no25Yy+pUUWnvBmALBiAKuXBtKiwV9MqN/SXnzzeS8CjuZOMYFI7x41kHXYygpO/Y0BtfvqI+sf+LO0fuHmvC6D6LXe/MsP4lhMG1vY8Y42BT4Hd73L3hDPTO4bVgAjfp2Y87dNxWNXHSZ/YT/ZwYGsXZ3sMTBi/c5JL3/+EsSA8t5edZ+nwx3a1JVZofxoxzEg2c4MrIWCsfk9z/YJ6/Ze7Bv49K7Rh0a6Geo+k/vRr7kyrUvxR2O33FQhfqmwDuvPfL4P4e692htnxnQtx7uzi9x22eUecUrL6jk56DhN+K3a9LPd4b0nz10s73naC8c3I66hvxjm+n+t1uUUgyMUZtVAE+elVjMOVCYL0KBU9HNJmgKhuNb325IbPhwf8+Wv/5yUtvgPo52vXJjcGpZnv2P7hzO0dgu020f9Rn+gP/XAE8fNTo5VF8noaSv4xc9taSyINc2M8/BfTnPzk2vKjKXjirBoyjoS618Iw5jRthBMuOEoqnaH37V/jy+8JiivGpD8PpGn/UPGYUjpUXofeNOJHKZPqvZ2G4V1X82dcXefnDpB3t7N89H2/nEywtbw5+rKJT+5rKLIxMJgz6zNky6e4J/WfPAWHZS9phjOvItxwVUu6zbVlzp+C+Dmi6z27hxFQWCw5uLziJuoyaBUtxJ6IqNMmnuStNciZIvTHITzGdh0Et5BU+E1S6+Nnf7kS9l3x97uXcSJ0hvJzOClGNVuniibdOpvCYYSbxVe2NV+1DPnEjbX7ZHp1V4pdWSmS9Du5GuWBcguw4l+iRLauaLP5/wCZfjRPo77hKr27BF1ubNylRXmKdNqkDDzARGArMN6CVArp2QTXUYLEcFaEK7xB/VIJrMGAW5Fs5pN12ZIwlzlr+RWt7SE/vNfTcWtgwMqHZVdz6q3p9oqrJK4qN/jwV9H/7klklD5r4GnjmR+p3G5Fy7xbTcJPAeNBpxWYVhf6cGI0usv1jy3aqThsPeeVwJGhjYNf/T+JjDIn7/q7Pz6IwaOzjQut3fBfT1PSqE4wqeSNVpOqORQidP58/KYZ45RVOFwygEOqF6b29UfaahKbzs14uK22ufa7FEwynbY3fV9A30fyr16q2pkopC/rs5kngXqjULWtK0oydJV7yZ4ty55LVxE/OvXjSZnJTuGRjPCQPavn27uPhFbqkB1gVV+QatGeOhI0ocxOW00I5ejTT5FBqKKoQdIrh8sgRjSy2EBcSsGOPBmmDqHPxB3d8W0P7c6tdW/HS+/ZjB+IEBDlVfiL8EmptXXuW050yRBHr5qGL+i1UlfAGzIvG0Pu30peiT6yNccaGtu8Slzr79y95j7nZDvWOg7YQBsQdW19WZ/vyatKRhf+8CLRU3CC9CeYkTxo/JJZVlueggmYg/jJk/tHQvGW9DKeJQTwFblmBHf8lhQ3MPAzptPiPT2qNv740aa9q6Uq//dndzPeBR34FBDa7xp3bcis3fy0krpEqWhQmE56eZRG6KyHPnOSXBXonBjAJ2eghzPzpwNBiW4YXNUa6s2C5LJvnrC77gfmVwfyd7fVKAWOfLtlNx6x7/w50toTvbmgMQjcoGL6JDiSTKimxkbFU+LSx0wZRqB8m38ySaoGyp9R+GYs4kixqaBeSE4NgxO5/fkANRoy4Q0TeomrYXMxNuycaV4umygmTSyE+m1FxM6xThcyUOu9nkcop4ZgjPL+YTKHSh547/MK5EMAzUn5bdUpfiPC6BJqOJ7103y/vEyQI58v6TBsQ6YPbLHav77u4NJe9r2Nkq9gQSVMyxUxE9STT6qQVPskyodMH18yrBky9BHA8gqBj1Y4EtFpRnwNiLsRtcfhxRVA78mCgMoQXNMhMOyYTuA/O5KHrrBKXQgFwHBZOFNwSBEslMqMNKCXodzHmlKJlcIq4aazf7uLpDMVzKsZ+9/OCMXx452c/y/TMBGnjR3a/Gr8Oc+O98zb3epoYeg3flEjvmkeV4mvR29mFwWSWzphXBzGllGIwXEYAGaQTFols8fvBQEE6QY8fI8aOyFoqR1X4vPQedUFeOQNFLJ8VoRUtoV7DIKkofhjaYbiMsPURUzMWv29QOT73YQJo78XcxqrI4svX6U5acgTmeEiDWya/eSkyIKNzSdEqfqcYTIJjNRgLjy8mESkOBKPG1hsAl8XDZnDKYNM6DsWeOsuxFRjHYAUyUJhwCTpyFJ9BuAYcFwIM/rmMHOP1BGaq8+BuykSZ2IqZf4rAiCJFgPp6+ucUHS1btRzsnjkvXaEbJu23fX+a+MTC54ahPGRAbxPItvQ4/SPcSg78j3yaa7aJOw2lKu8M6wXAqdPfEIOCLQ1mBGebO8ML4cjsqcuDSMlAZlxyuPEDB6A+MYYQV/BEKvj4dplUQKCkQMD9GaQoD+gwOhoLIwaa48ewLB8iWXQE8u6BRp1NYZZPkH7//7Nc7hwPK4D6GBdBAh09+GJ8DxHxfoVOcUY7WNgYEwR8zaCOmk+u7FejqTeFZQgVGF1np9PNsZFShCSSREBtmKVgKqAvBHPKjgkLdM/M8HmM9BFAtYbYCAKUSWjqTsHZDO3lvZxBUJY27ItnqkrgHNj31xVcOy+HASIavHlZAbFh3rG80Tyoq+pbbbr5zpFv4XJUbG3GCIcxAtWOa54Bfh/Y+DQIYIXRJBGpKzFiLkMQEcyqN553xrNAFZRzwJkLCSUo78QhMfWuSfNQQh1ZfCjQ5qVnN/Dsmoj9107cn/X1+DZ4TOY1l2AENjPU6PPx9zVj3l9yS8A2vxE93S1yZU2JnNQ//qieMwNrQjm5F6epP+uGPV4rRnqnIQ5DY3tSjwUGUuu5AEuKxVAZ3tQOSTdiIeurl393y7PuEDJ0tHXj/cNWnDdDgAd72fJtrWrV3AiqbqZiHr8EsRAkKSD6mnN2qTsxJ2RBYjszMU6UvrqTaA3pfJKH4MLZ8kNOVvdTQ9pjlgw1P3PnpQP/g95yO6zMCaOiB1wqVi2+QRpVLZrugmdD2g/betNxQ35yaNTeaeWn+/GMG+Ifu81zrOQLnCJwj8P+LwP8CaTGCYxH2NZgAAAAASUVORK5CYII=",
			honcho: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjUwIiBoZWlnaHQ9IjY1MCIgdmlld0JveD0iMCAwIDY1MCA2NTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI2NTAiIGhlaWdodD0iNjUwIiBmaWxsPSIjMTAxNDQ3Ii8+CjxnIGZpbHRlcj0idXJsKCNmaWx0ZXIwX2RkXzExXzgpIj4KPHBhdGggZD0iTTMyNS41NiA4MEMyMzguNTkgODAgMTU3LjU0IDEyNi41OSAxMTMuNjIgMjAxLjY5Qzk0LjE4MDEgMjEzLjUxIDgxLjAwMDEgMjIxLjc4IDgwLjczMDEgMjIxLjkyQzQyLjgyMDEgMjQyLjU4IDIzLjkwMDEgMjYyLjI5IDE0LjYyMDEgMjc3LjlDNy40MTAxMSAyNzguMDMgMS4xNzAxIDI4My4zNyAwLjE1MDEwMSAyOTAuNzNDLTEuMDA5OSAyOTguODggNC42ODAxIDMwNi40NCAxMi44NDAxIDMwNy41OEMyMS4wMTAxIDMwOC43NCAyOC41NTAxIDMwMy4wNSAyOS43MTAxIDI5NC44OEMzMC4zMTAxIDI5MC42OCAyOS4wNzAxIDI4Ni42MyAyNi42MzAxIDI4My41NUM0MC4zNjAxIDI2MS40IDY5LjMyMDEgMjQzLjE4IDg3LjA2MDEgMjMzLjUyQzkwLjExMDEgMjMxLjg2IDI2MS44OSAxMjcuODEgMjc0Ljc0IDEzMC4zOEMyNzYuODkgMTMwLjgxIDI4MC4wMyAxMzEuOTcgMjgyLjUgMTM3LjA4QzI4OS4zIDE1MS4xOCAyMjYuNzggMTkyLjk1IDIxNC4wMyAyMDAuNTlDMjAxLjgyIDIwNy45IDE5MS4wNiAyMTUuNzEgMTgxLjc1IDIyNC4wMUMxNjIuMDIgMjQxLjU5IDE0OC44NSAyNjEuMzIgMTQyLjQ1IDI4Mi45N0MxMzguNiAyOTYuMDIgMTI3LjYzIDMzMy42IDEwMS4wMiAzNDIuOTRDOTkuMTMwMSAzMzguNzQgOTUuMzMwMSAzMzUuNDYgOTAuNDcwMSAzMzQuNDZDODIuNDAwMSAzMzIuNzcgNzQuNDkwMSAzMzcuOTUgNzIuODIwMSAzNDYuMDJDNzEuMjIwMSAzNTMuNjYgNzUuNzgwMSAzNjEuMTQgODMuMTIwMSAzNjMuMzRDMTAxLjQ5IDQ4Mi40NyAyMDMuNTEgNTcwLjc3IDMyNS41NiA1NzAuNzdDNDYwLjg2IDU3MC43NyA1NzAuOTUgNDYwLjY5IDU3MC45NSAzMjUuMzhDNTcwLjk1IDE5MC4wNyA0NjAuODcgODAgMzI1LjU2IDgwWk0xODcuNyAyMzYuNTFDMTg3LjEyIDI0NC4xNSAxODUuMzcgMjUyLjkgMTgxLjA3IDI1OC42MUMxNzYuNTQgMjY0LjYxIDE2Ny45NSAyNjkuNzEgMTYwLjIzIDI3My4zMUMxNjYuMzMgMjYwLjIxIDE3NS41MSAyNDcuOTIgMTg3LjcgMjM2LjUxWk0zMjUuNTYgNTU3LjU0QzIxMC4wMiA1NTcuNTQgMTEzLjQ2IDQ3My45MSA5Ni4xNjAxIDM2MS4xMkM5Ny45MjAxIDM1OS44NCA5OS40MjAxIDM1OC4yIDEwMC40OCAzNTYuMjVDMTIyLjUzIDM0OC4zOCAxMzkuMTkgMzM3LjQ5IDE1NC4wOCAyOTAuMDhDMTYyLjA3IDI4Ny4yOCAxODIuMDEgMjc5LjM1IDE5MS42NCAyNjYuNTZDMjAxLjMyIDI1My42OSAyMDEuNDYgMjMzLjYxIDIwMS4wNSAyMjUuMjhDMjA3LjEgMjIwLjY3IDIxMy43IDIxNi4yMiAyMjAuODMgMjExLjk1QzI2MS41OSAxODcuNTUgMzA1LjU1IDE1NC4zNSAyOTQuNDEgMTMxLjMyQzI5MC43NCAxMjMuNzMgMjg0LjgzIDExOC45MiAyNzcuMzQgMTE3LjQzQzI2My4yMyAxMTQuNjMgMTkyLjcyIDE1NC40NCAxNDAuMTUgMTg1LjczQzE4My43IDEyOC4wOCAyNTIuNDEgOTMuMjQgMzI1LjU2IDkzLjI0QzQ1My41NyA5My4yNCA1NTcuNzEgMTk3LjM5IDU1Ny43MSAzMjUuMzlDNTU3LjcxIDQ1My4zOSA0NTMuNTcgNTU3LjU1IDMyNS41NiA1NTcuNTVWNTU3LjU0WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTI0Ny4zNCAzMjUuMzhDMjYxLjI5NiAzMjUuMzggMjcyLjYxIDMwNy44NDMgMjcyLjYxIDI4Ni4yMUMyNzIuNjEgMjY0LjU3NyAyNjEuMjk2IDI0Ny4wNCAyNDcuMzQgMjQ3LjA0QzIzMy4zODQgMjQ3LjA0IDIyMi4wNyAyNjQuNTc3IDIyMi4wNyAyODYuMjFDMjIyLjA3IDMwNy44NDMgMjMzLjM4NCAzMjUuMzggMjQ3LjM0IDMyNS4zOFoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik00MDMuNzggMzI1LjM4QzQxNy43MzYgMzI1LjM4IDQyOS4wNSAzMDcuODQzIDQyOS4wNSAyODYuMjFDNDI5LjA1IDI2NC41NzcgNDE3LjczNiAyNDcuMDQgNDAzLjc4IDI0Ny4wNEMzODkuODI0IDI0Ny4wNCAzNzguNTEgMjY0LjU3NyAzNzguNTEgMjg2LjIxQzM3OC41MSAzMDcuODQzIDM4OS44MjQgMzI1LjM4IDQwMy43OCAzMjUuMzhaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMzg2LjE4IDQwNi45MUgyNjQuOTRDMjU4LjQ4IDQwNi45MSAyNTMuMjUgNDEyLjE0IDI1My4yNSA0MTguNkMyNTMuMjUgNDI1LjA2IDI1OC40OCA0MzAuMjkgMjY0Ljk0IDQzMC4yOUgzODYuMThDMzkyLjY0IDQzMC4yOSAzOTcuODcgNDI1LjA2IDM5Ny44NyA0MTguNkMzOTcuODcgNDEyLjE0IDM5Mi42NCA0MDYuOTEgMzg2LjE4IDQwNi45MVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik05My45NDAxIDMzMy42MUw5My45NzAxIDMzMy41OEw5My45NDAxIDMzMy42VjMzMy42MlYzMzMuNjFaIiBmaWxsPSJ3aGl0ZSIvPgo8L2c+CjxkZWZzPgo8ZmlsdGVyIGlkPSJmaWx0ZXIwX2RkXzExXzgiIHg9IjAiIHk9IjgwIiB3aWR0aD0iNTk0Ljk1IiBoZWlnaHQ9IjUxNC43NyIgZmlsdGVyVW5pdHM9InVzZXJTcGFjZU9uVXNlIiBjb2xvci1pbnRlcnBvbGF0aW9uLWZpbHRlcnM9InNSR0IiPgo8ZmVGbG9vZCBmbG9vZC1vcGFjaXR5PSIwIiByZXN1bHQ9IkJhY2tncm91bmRJbWFnZUZpeCIvPgo8ZmVDb2xvck1hdHJpeCBpbj0iU291cmNlQWxwaGEiIHR5cGU9Im1hdHJpeCIgdmFsdWVzPSIwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAxMjcgMCIgcmVzdWx0PSJoYXJkQWxwaGEiLz4KPGZlT2Zmc2V0IGR4PSIyMCIgZHk9IjIwIi8+CjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjIiLz4KPGZlQ29tcG9zaXRlIGluMj0iaGFyZEFscGhhIiBvcGVyYXRvcj0ib3V0Ii8+CjxmZUNvbG9yTWF0cml4IHR5cGU9Im1hdHJpeCIgdmFsdWVzPSIwIDAgMCAwIDEgMCAwIDAgMCAwLjM1Mjk0MSAwIDAgMCAwIDAuNDk0MTE4IDAgMCAwIDEgMCIvPgo8ZmVCbGVuZCBtb2RlPSJub3JtYWwiIGluMj0iQmFja2dyb3VuZEltYWdlRml4IiByZXN1bHQ9ImVmZmVjdDFfZHJvcFNoYWRvd18xMV84Ii8+CjxmZUNvbG9yTWF0cml4IGluPSJTb3VyY2VBbHBoYSIgdHlwZT0ibWF0cml4IiB2YWx1ZXM9IjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDEyNyAwIiByZXN1bHQ9ImhhcmRBbHBoYSIvPgo8ZmVPZmZzZXQgZHg9IjEwIiBkeT0iMTAiLz4KPGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMiIvPgo8ZmVDb21wb3NpdGUgaW4yPSJoYXJkQWxwaGEiIG9wZXJhdG9yPSJvdXQiLz4KPGZlQ29sb3JNYXRyaXggdHlwZT0ibWF0cml4IiB2YWx1ZXM9IjAgMCAwIDAgMC4wMzUyOTQxIDAgMCAwIDAgMC45OTYwNzggMCAwIDAgMCAwLjk3MjU0OSAwIDAgMCAxIDAiLz4KPGZlQmxlbmQgbW9kZT0ibm9ybWFsIiBpbjI9ImVmZmVjdDFfZHJvcFNoYWRvd18xMV84IiByZXN1bHQ9ImVmZmVjdDJfZHJvcFNoYWRvd18xMV84Ii8+CjxmZUJsZW5kIG1vZGU9Im5vcm1hbCIgaW49IlNvdXJjZUdyYXBoaWMiIGluMj0iZWZmZWN0Ml9kcm9wU2hhZG93XzExXzgiIHJlc3VsdD0ic2hhcGUiLz4KPC9maWx0ZXI+CjwvZGVmcz4KPC9zdmc+Cg==",
			mem0: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSJub25lIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI0NCQjJGRiIgcng9IjEyIi8+PGcgZmlsbD0iIzA5MDkwQiIgY2xpcC1wYXRoPSJ1cmwoI2EpIj48cGF0aCBkPSJNNTAuMDA0IDQxLjU0N2E4LjQ0NiA4LjQ0NiAwIDAgMC04LjQ1IDguNDQ5IDguNDQ2IDguNDQ2IDAgMCAwIDguNDUgOC40NDkgOC40NDcgOC40NDcgMCAwIDAgOC40NDktOC40NSA4LjQ0NiA4LjQ0NiAwIDAgMC04LjQ1LTguNDQ4bS4wNDItMTYuNTMxYTIuNTEzIDIuNTEzIDAgMCAwIDIuNDYzLTIuNTUzQTIuNDg2IDIuNDg2IDAgMCAwIDQ5Ljk1NSAyMGEyLjQ4NiAyLjQ4NiAwIDAgMC0yLjQ2MiAyLjU1MyAyLjQ4NiAyLjQ4NiAwIDAgMCAyLjU1MiAyLjQ2M20tLjA4OSA0OS45NjNhMi40ODYgMi40ODYgMCAwIDAtMi40NjMgMi41NTIgMi40ODYgMi40ODYgMCAwIDAgMi41NTIgMi40NjMgMi41MTMgMi41MTMgMCAwIDAgMi40NjMtMi41NTIgMi40ODYgMi40ODYgMCAwIDAtMi41NTMtMi40NjNNMzIuMzcyIDMyLjNhMi41MTMgMi41MTMgMCAwIDAtLjA2NS0zLjU0NyAyLjQ4NyAyLjQ4NyAwIDAgMC0zLjU0OC4wNjUgMi40ODcgMi40ODcgMCAwIDAgLjA2NSAzLjU0OCAyLjQ4NyAyLjQ4NyAwIDAgMCAzLjU0OC0uMDY1bTM1LjI2MiAzNS4zOTRhMi40ODcgMi40ODcgMCAwIDAgLjA2NSAzLjU0OCAyLjQ4NyAyLjQ4NyAwIDAgMCAzLjU0OC0uMDY1IDIuNTEzIDIuNTEzIDAgMCAwLS4wNjUtMy41NDggMi40ODcgMi40ODcgMCAwIDAtMy41NDguMDY1bS4wNjUtMzUuMzI5Yy45OC45NDQgMi41NzIuOTQ2IDMuNTQ4LS4wNjVhMi40ODcgMi40ODcgMCAwIDAtLjA2NS0zLjU0OCAyLjQ4NyAyLjQ4NyAwIDAgMC0zLjU0OC4wNjUgMi40ODcgMi40ODcgMCAwIDAgLjA2NSAzLjU0OE0zMi4zMDcgNjcuNjNhMi40ODcgMi40ODcgMCAwIDAtMy41NDguMDY1IDIuNDg3IDIuNDg3IDAgMCAwIC4wNjUgMy41NDhjLjk4Ljk0NCAyLjU3Mi45NDYgMy41NDgtLjA2NWEyLjQ4NyAyLjQ4NyAwIDAgMC0uMDY1LTMuNTQ4bTQ1LjA0Ni0yMC4xMzZhMi40ODcgMi40ODcgMCAwIDAtMi4zNjQgMi42NDcgMi41MTQgMi41MTQgMCAwIDAgMi42NDYgMi4zNjQgMi40ODcgMi40ODcgMCAwIDAgMi4zNjQtMi42NDYgMi40ODQgMi40ODQgMCAwIDAtMi42NDYtMi4zNjJ6TTIyLjY1IDUyLjUwMWEyLjQ4NyAyLjQ4NyAwIDAgMCAyLjM2NS0yLjY0NiAyLjQ4NSAyLjQ4NSAwIDAgMC0yLjY0Ni0yLjM2MiAyLjQ4NyAyLjQ4NyAwIDAgMC0yLjM2NSAyLjY0NiAyLjUxNSAyLjUxNSAwIDAgMCAyLjY0NiAyLjM2NHptMjMuNDYzLTE2LjkxNWE0LjM3IDQuMzcgMCAwIDAgNi4wNTMgMS4xNTJjMS4xMjUtLjc2NSAxLjgxOS0yLjAwNSAxLjkwNC0zLjQwMy4wNjItLjkwOC4yNjEtMi4xOTYgMS4yNjgtMi44OSAxLjAzLS42NTUgMi4yOTMtLjMzNSAzLjE1NC0uMDQgMS4zMi40NjcgMi43MzIuMzEzIDMuODc1LS40MjVhNC4zMiA0LjMyIDAgMCAwIDEuODk0LTIuNzQzIDQuMzIgNC4zMiAwIDAgMC0uNTk3LTMuMjhsLS4xNzQtLjI2YTQuMzcgNC4zNyAwIDAgMC02LjA1My0xLjE1MmMtMS4xMjYuNzY0LTEuODIgMi4wMDMtMS45MDQgMy40MDItLjA2My45MDgtLjI2MiAyLjE5Ni0xLjI2OSAyLjg5LTEuMDI5LjY1NS0yLjI5My4zMzUtMy4xNTQuMDQtMS4zMTctLjQ2Ny0yLjczMS0uMzEzLTMuODc0LjQyNWE0LjM2IDQuMzYgMCAwIDAtMS4zIDYuMDIybC4xNzUuMjYyem0tOS42MDIgNDAuNzA5YTQuMzcgNC4zNyAwIDAgMCA2LjA1MyAxLjE1MmMxLjEyNi0uNzY1IDEuODItMi4wMDUgMS45MDQtMy40MDMuMDYzLS45MDguMjYyLTIuMTk3IDEuMjY5LTIuODkgMS4wMjktLjY1NSAyLjI5Mi0uMzM1IDMuMTU0LS4wNCAxLjMyLjQ2NyAyLjczMS4zMTMgMy44NzQtLjQyNWE0LjMyIDQuMzIgMCAwIDAgMS44OTUtMi43NDMgNC4zMiA0LjMyIDAgMCAwLS41OTctMy4yOGwtLjE3NS0uMjZhNC4zNyA0LjM3IDAgMCAwLTYuMDUzLTEuMTUyYy0xLjEyNS43NjQtMS44MTkgMi4wMDMtMS45MDQgMy40MDEtLjA2Mi45MDktLjI2MSAyLjE5Ny0xLjI2OCAyLjg5LTEuMDMuNjU2LTIuMjkzLjMzNi0zLjE1NC4wNDEtMS4zMTgtLjQ2OC0yLjczMi0uMzEzLTMuODc1LjQyNWE0LjM2IDQuMzYgMCAwIDAtMS4zIDYuMDIybC4xNzUuMjYyek01Ny40MiAzNy4wNDhxLS4wOC40MzQtLjA3Ni44NzJhNC4zNyA0LjM3IDAgMCAwIDMuNTQ4IDQuMjE3YzEuMzM4LjI1MiAyLjcwNS0uMTM3IDMuNzUtMS4wNjcuNjg2LS42IDEuNzM1LTEuMzcyIDIuOTM5LTEuMTUgMS4xOS4yNjEgMS44NiAxLjM4IDIuMjYxIDIuMTk5LjYwNCAxLjI2MSAxLjcxNCAyLjE1IDMuMDQ1IDIuNDM0YTQuMzMgNC4zMyAwIDAgMCAzLjI4LS42MDQgNC4zMiA0LjMyIDAgMCAwIDEuODkyLTIuNzQ1bC4wNjItLjMwOXEuMDgyLS40MzUuMDc2LS44NzJhNC4zNyA0LjM3IDAgMCAwLTMuNTQ4LTQuMjE3Yy0xLjMzNy0uMjUzLTIuNzAyLjEzNy0zLjc0OSAxLjA2Ny0uNjg3LjYtMS43MzggMS4zNzEtMi45NCAxLjE1LTEuMTktLjI2Mi0xLjg2LTEuMzgtMi4yNi0yLjItLjYwNS0xLjI2LTEuNzE0LTIuMTQ5LTMuMDQzLTIuNDMzYTQuMzYgNC4zNiAwIDAgMC01LjE3MiAzLjM0OWwtLjA2Mi4zMDl6bS0zNS41MzkgMjIuMDVxLS4wOC40MzUtLjA3Ni44NzNhNC4zNyA0LjM3IDAgMCAwIDMuNTQ4IDQuMjE2YzEuMzM4LjI1MyAyLjcwNC0uMTM2IDMuNzUtMS4wNjcuNjg2LS42IDEuNzM1LTEuMzcgMi45MzgtMS4xNSAxLjE5LjI2MiAxLjg2MiAxLjM4IDIuMjYyIDIuMi42MDQgMS4yNjEgMS43MTQgMi4xNSAzLjA0NSAyLjQzM0E0LjMzIDQuMzMgMCAwIDAgNDAuNjI3IDY2YTQuMzIgNC4zMiAwIDAgMCAxLjg5Mi0yLjc0NGwuMDYzLS4zMXEuMDgxLS40MzMuMDc2LS44NzFhNC4zNyA0LjM3IDAgMCAwLTMuNTQ4LTQuMjE3Yy0xLjMzNy0uMjUzLTIuNzAyLjEzNi0zLjc0OSAxLjA2Ny0uNjg2LjYtMS43MzggMS4zNzEtMi45NCAxLjE1LTEuMTktLjI2Mi0xLjg2LTEuMzgtMi4yNi0yLjItLjYwNS0xLjI2MS0xLjcxNC0yLjE0OS0zLjA0My0yLjQzM2E0LjM2IDQuMzYgMCAwIDAtNS4xNzIgMy4zNDlsLS4wNjIuMzA4em00Mi41MjUtMTMuMDFhNC41IDQuNSAwIDAgMC0uNjcxLjU2MyA0LjM3IDQuMzcgMCAwIDAtLjQ3MiA1LjQ5Yy43NjcgMS4xMjUgMi4wMDkgMS44MTYgMy40MDQgMS44OTcuOTA5LjA2IDIuMTk3LjI2IDIuODkzIDEuMjY0LjY1NyAxLjAyNy4zNCAyLjI5LjA0NSAzLjE1NC0uNDY2IDEuMzItLjMxIDIuNzMxLjQzMSAzLjg3NGE0LjMzIDQuMzMgMCAwIDAgMi43NDUgMS44OSA0LjMzIDQuMzMgMCAwIDAgMy4yOC0uNjAxbC4yNjEtLjE3NXEuMzY1LS4yNS42NzEtLjU2M2E0LjM3IDQuMzcgMCAwIDAgLjQ3Mi01LjQ5Yy0uNzY3LTEuMTIzLTIuMDA2LTEuODE2LTMuNDA0LTEuODk3LS45MDktLjA2LTIuMi0uMjYtMi44OTMtMS4yNjQtLjY1Ny0xLjAyNi0uMzQtMi4yOS0uMDQ0LTMuMTU0LjQ2NS0xLjMyLjMwOC0yLjczMS0uNDMyLTMuODcyYTQuMzYgNC4zNiAwIDAgMC02LjAyNC0xLjI4OGwtLjI2Mi4xNzR6TTIzLjY4NyAzNi41NWE0LjUgNC41IDAgMCAwLS42NzEuNTY0IDQuMzcgNC4zNyAwIDAgMC0uNDcyIDUuNDljLjc2NyAxLjEyNSAyLjAwOSAxLjgxNiAzLjQwNSAxLjg5Ny45MDguMDYgMi4xOTYuMjYgMi44OTIgMS4yNjQuNjU4IDEuMDI2LjM0IDIuMjkuMDQ1IDMuMTU0LS40NjUgMS4zMi0uMzA5IDIuNzMxLjQzMiAzLjg3NGE0LjMyIDQuMzIgMCAwIDAgMi43NDQgMS44OSA0LjMzIDQuMzMgMCAwIDAgMy4yOC0uNjAxbC4yNjEtLjE3NXEuMzY1LS4yNS42NzItLjU2M2E0LjM3IDQuMzcgMCAwIDAgLjQ3Mi01LjQ5Yy0uNzY4LTEuMTIzLTIuMDA3LTEuODE2LTMuNDA1LTEuODk3LS45MDgtLjA2LTIuMi0uMjYtMi44OTItMS4yNjQtLjY1OC0xLjAyNy0uMzQtMi4yOS0uMDQ1LTMuMTU0LjQ2NS0xLjMyLjMwOC0yLjczMS0uNDMyLTMuODcyYTQuMzYgNC4zNiAwIDAgMC02LjAyNC0xLjI4OWwtLjI2Mi4xNzV6bTM5LjI2OCAyMC44NjhhNC40IDQuNCAwIDAgMC0uODczLS4wNzYgNC4zNyA0LjM3IDAgMCAwLTQuMjE3IDMuNTQ4Yy0uMjUyIDEuMzM4LjEzNyAyLjcwNSAxLjA2NyAzLjc1LjYuNjg2IDEuMzcyIDEuNzM1IDEuMTUgMi45MzktLjI2MSAxLjE5LTEuMzggMS44Ni0yLjE5OSAyLjI2MS0xLjI2MS42MDQtMi4xNSAxLjcxNC0yLjQzMyAzLjA0NWE0LjMzIDQuMzMgMCAwIDAgLjYwMyAzLjI4IDQuMzIgNC4zMiAwIDAgMCAyLjc0NSAxLjg5MmwuMzA5LjA2MnEuNDM1LjA4Mi44NzIuMDc2YTQuMzcgNC4zNyAwIDAgMCA0LjIxNy0zLjU0N2MuMjUzLTEuMzM4LS4xMzYtMi43MDMtMS4wNjctMy43NS0uNi0uNjg2LTEuMzcxLTEuNzM4LTEuMTUtMi45NC4yNjItMS4xOSAxLjM4LTEuODYgMi4yLTIuMjYgMS4yNi0uNjA1IDIuMTQ5LTEuNzE0IDIuNDMzLTMuMDQzYTQuMzYgNC4zNiAwIDAgMC0zLjM0OS01LjE3MmwtLjMwOC0uMDYyek00MC45IDIxLjg4YTQuNCA0LjQgMCAwIDAtLjg3Mi0uMDc3IDQuMzcgNC4zNyAwIDAgMC00LjIxNyAzLjU0OGMtLjI1MyAxLjMzOC4xMzYgMi43MDQgMS4wNjcgMy43NS42LjY4NiAxLjM3MSAxLjczNSAxLjE1IDIuOTM5LS4yNjIgMS4xOS0xLjM4IDEuODYtMi4yIDIuMjYxLTEuMjYuNjA0LTIuMTQ5IDEuNzE0LTIuNDMzIDMuMDQ1YTQuMzMgNC4zMyAwIDAgMCAuNjA0IDMuMjggNC4zMiA0LjMyIDAgMCAwIDIuNzQ1IDEuODkybC4zMDguMDYycS40MzUuMDgxLjg3My4wNzZhNC4zNyA0LjM3IDAgMCAwIDQuMjE2LTMuNTQ4Yy4yNTMtMS4zMzctLjEzNi0yLjcwMi0xLjA2Ny0zLjc0OS0uNi0uNjg3LTEuMzctMS43MzgtMS4xNS0yLjk0LjI2Mi0xLjE5IDEuMzgtMS44NiAyLjItMi4yNiAxLjI2MS0uNjA1IDIuMTUtMS43MTQgMi40MzMtMy4wNDNhNC4zNiA0LjM2IDAgMCAwLTMuMzQ4LTUuMTcybC0uMzEtLjA2MnoiLz48L2c+PGRlZnM+PGNsaXBQYXRoIGlkPSJhIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMjAgMjBoNjB2NTkuOTk4SDIweiIvPjwvY2xpcFBhdGg+PC9kZWZzPjwvc3ZnPgo=",
			hindsight: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAAA2CAYAAABkxd/2AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAARGVYSWZNTQAqAAAACAABh2kABAAAAAEAAAAaAAAAAAADoAEAAwAAAAEAAQAAoAIABAAAAAEAAABIoAMABAAAAAEAAAA2AAAAANbTGEEAABzqSURBVGgF7Xt3nJXFuf/MvO20bWd3YZcqoiIgGEVjjOWCGhRiRVljLL9YIuQXo0YFRYpHESwQNeovVzSoAe/VgPViibGBNRKJF0URIx027LK7Z8spb5253+c9nKW4yuLllj9+w+fs22aeeeY7zzxtBsb+f/lWBPi3fu3io2JMDLzz+aEOEz/MiaBMV9a6hN/6zvqpP23oovr/yCvicfjcR47IsMgRSrkJoWf/PtjOvv/SlCnpfWVonwAannqiTwOPpDp49FxPj1iMKx4oKU3f3dTbb77v4tXrH0stTrn7ysT+rH/Y3fcP3KYnbssofYynGxElXF7quYEh/XU57szNXn/tgn3pr9sADU0tPGgzL3+qwywbrgQ3DLdDcckDzzB1xT2V4Mouy2y/54fDI7csrqsL9oWJ/VW38t4Fgx0V/GvWjBzGpNKZ9BiXSmnc4L6lS+7lnBKn7d7WyddOw8AhaHsvYu9VCjW2iOSvO6yKIww34HE786Slt53kcv+oEpW/OhL4rZkgEm2IVd/wxlrj5O7S3J/1UqmU0D1nek5PDNc9pidz9utxl9dJxx8RYe6lMSezSudGNGuWXtfj7t+O6W7f3QLosGnPDXSVfgFXTBgqv/CAhnVXfs8prT/GyOtH/v2jR8r97ERDer6vRS3lOBdiarotmd1ldG/15kcra3LKOFkpKUq87PIau/X8Mbl1r5wWsSPnrlz2VB/ecTFX7hZpxCIZy7qyuzx2CyBm6MN9Ta/QZFaVsvTjvHefA9dwbcmnsvzNT/oNuXBAad8lhvK2iYAzqQeHPDzvSn1vA9rf37lfMTinJap1jFxJ55kHWXv7Mr3XEyt4+avLDv+nuWtaW1dZjnqdY8Q+YwNPnTMn1h0eugWQY+YEkxrT3Igq9azcNs9MtnJ2gB2IGLON8qP0Vim5FJIJpikjYv6jl9adzvdnHcXzrlA2kxBzziynpLaeZy3Rry0SKWnzcnGWSklTKV8xl5mBlYjpBxnd6b9bAPmOvZmpXOALS9TrVT/vX//ce7313OikahvdkrcefLRDjnRErJoZPgsC7aNLUym7O53vzzp9Ivwzg3mbpdCYw8WYG/7RS/lG5gI913SFw7JTRsxbVNZmiVGYSab7rLW8bWW3eOwWQGqD/CQunQ/8iM1yQl7yVc3pkztcu6FJ1z+P9sqNs1nkEdPTDM13mc8jb+7PgXeX1gfXXdESlWyZ4Vssb0ZP/jCenHOsE8/WffKXfykVSWtNe9vDvtIPFMxgOleLHu/mJHYLoA2PX2pXcHa95XjbAz0WyRqVt6d55ceGXbrakSX/GmhuX8eE6Qjs/EGW9kl3B7W/60nDeN8VAZOB0pWoufavuvW3RUN+9F4Tsz7OGvE6ZWo8mmtb3ctveKi7fXcLICK2PnXO8lovP96Suc8EzzFlJCJMZxUMM6bZZsGrUEJvC/LdWtvdZXBf6pme6XFyb7jLlC9YjlnVrqYd6UX0CkMGrNTOvVOTbar7dB886m4DRIxumHnmspKO9cdWuulxUbdliY/FLEEB1h+mQTBXjxqNKtp/Xwa1P+s6un2YDhdVCwzmGDYcfcUivsOq8i0v9fbS43+yRp68NjV11b70+Z39lZ+lHossFjXLbc0cFpDfrEDK4qwin3mq5dYzftpdT3VfmP22upV3PHx02oz9SUkzyZQDlBTTRJTFnfQjrTddORH8yG9r/03f9kmCdiXyeOpSO8r9Z0zID80UE/h5kmV144za2544ate6/9X3fVK/T2a1xAOKR5OKlpcWMFOazPBcLy7UQ98VHOL7OwNEjXvy/BsqYIHicHt4gLiHMdcw4mmemD3iynn/LbqINE6HEXnA1xLHMBdPtOahHH2NYmn/o9PLVnxKvH7X8jWPl2RhcOqtfusMM1Hh5XPbUqes/6blMiS2ZcWG9vhaJkoPYdIPoz/uSuZpJaesrs3PAFPTvytj3WlH4FTPfuyajGX8RAYOVvkOTgOdcUOxEuU8+fCEh71vojUylYqsK+vRS+PMEB5Pr530i8Y964JioVBntTMWn+byHjfkAvMIV3gl+JiJquDTsqDxwS2zz1/cFVA1t/7x+mbed66ncoVlpgzGSZq452uBO9G75cz5xT72vA6/YUG8MVnaHzmBQz0hqmzJIIuSxbls11mwudzf+uXK1KQm9Nul/kje+tDluUj1PJcrDYkF6EH8SIxZhEWD7Kb+suPIL26+qnnPfo+7a3LJGnPQz9uE9n/g2aJ/3ZQGb46o3Hs1HY0zv5ox47Nim06AklP+NCNnWTNss4dmeLAAXo55JjSMsOAgp1mZn568/fZxc/cEaWhqUXKDLH0vZ8QPZXJHKghMKiGYLqSXzKdvH5jZMueDe6/LU6dj7r/fWtVUeVpGN+rywjzC49oAJvQI0zRIAKYJRUDrq8CVUZZN65yv1IT2Vpnv/GnttEtWFPuPz3z0FM+yXvCVFlMqAr0DQVEeVCEMvWWyhJ2e1HHTFXNDgrv8OWL2o9Ub9eDJ9mjpyb7UmYXIDAEAs01MiZ5hJR35ht5u9uzV067/CzULAep304unbNN7vIbcDuKU9i1J2fIQ4pXVaRYZlTO0nwfCsCJBLqgOmsdsml332i79hbe1M184rUmVvOhhlJx5AIdmE7pA6PBaGYt56RWuCp4N9GitYPykgGtDAgODwrLgALUAS5Hqjie044julAaJBNiml0Mk6C61lP8s+rCa9cQUxswaHmRZwKJQppIFBDDAiTstKw+vlie8d/nlHUWqdB2/aLz25/Ujn7bNnmd7yBUZPL+mR5BdGHVl64Zo7FRf005TWtSI5dtWDmzoOO6TuZOyFPzyMs28wbWirCSfXl/pNI5d/5vzvlw8nvHxi9lzPaY++1FaVD7i6NVGmvGr0M/r+O02pvrpZ71addtLqbReNlMGmA4EtoIsG5yzAOFzu1kxAiHSCOVjDUnJJH7MgUCRzmCk4GlZ7Eay8IjsANFQAAohJqKZ6GhbBaMF6ktMAFlPX4+GbSkMVbrBNJlvqHSDS9+7/IrdwEEltuKrfxqYN2KjqS28/k8HceeUTyb9qhE9k2b/XcU9j07Ncj4zbyQO39TTH413z4nDJr3UM89KRpAfo/zsH9aXnPdlcvqfnrts8Oura25aUtc4a9yCmJSfYczwTM0hQ1NvxamzXQuGoZqmj51V4rb/xuCk943CcAUtOegmLFnpQFICSBeGSp4u4wASsx46maEgE1goIU6F+8I3vMNsh74NpMVDxG6HIJNRCLAcORN4Rv6QmdxWyVzrlI0zrvg4pLXHH4NZx3E9EYNLy8qUc++g/pXNfWb/7sGa38z/S+K2+cOHeuq3wunYqIwYYsr4KGouuMWhE3VDYP0Ghvb5D9vuKc855qlZq/fBvlJnog7nQmvmnILfAALf+jXLR4Q456qVLZ9cnmtbZCpIBERGcugwHsHg8Aui8AToSs/kAWDSSHJIuYaFQKF3O4Ai0DolC/oJbSQ0hlRWCAwBLIUPiUEMCNMeh+jWZNtubpw+8fECvS7+alaZD7K6tFmt1Dau+XxbbbNmTdge63F0Wdz80bs3Xp5FHrlV5x6LeKycKIi8bndw7tjQUCzw9KPfv/e6tLDMS8pyTdP7iaZr+05dUhv43uFkvgXnie3MSnTRdfiKI+fyA/Mfl8ZU7lMYFowd+iMg6SXAMOMaTDEp01AZg1PyWcLVtevyKgJU7AXPoCXoh1RF6JSGnyz85fB3ID0wJlWe/9jGGRPuotrFlntefS5N8mddI8q+0rTjV6au3sqD3LmJjq23tTVvWnjwzKcGmKq0lw+XxWNyG7UXF99yTpOheZ9IzFxgJCbGb3z19Pv6LHguPeuE2VusXmWNWuK3Lo9WQZrRs4hGfUzjt5S/srLzsppxsITJVbSEAAyjpYZZoYF2/mRxHKRLACYBVZQYwog+k6IPlT1wBBAyBBf06B3pJx/0sPY99NWki5FHzn606ltYY62BGhDAcPjQhY4wflV75+/HZm/+1ZL2yRNv6V3VR99sOvdkDbPasgNl8dwbRItYYf2nvXxSg6x42dYNS/j5AAtjDQbXLIU+zDNj5dzNopYOGyVYT7fhkq13nLmQ2u1Z+sxccvB2FX3L4WZvchzDUYY9UEcYMZYehWyFXmlp4YFyoOQ3QeGSmdehTwLEUZQXJLwUTTkmDwnL0FJhGwfLrJMIvoVIMmFarMxNP9gy5eKr8ZVe7launDfPeLw99oGrxUawAAZCh4X1WV4PnL94htfOlTgm0KI1NIcRu+21H+SeGrs0tRQhOMrG28e+GeFsQsR3bW7GNdsoGeIYlSfAapQzoF1gAZBBE3YI89oRqXld5nNbA2Omp1k7wCHKO1mlAYdgkJ4hjRrqIRoogKJqAnpJi0IoYgCKLBMUPcCh8SO0whVCD8Qk6bTQEBD9nUX6HstqsQkHzPrDaTvf7rx7ptU/I9CNIxlZWQIcVk8LzKhvlI9ievlZgR6pYQac1Hz2Y8vRJhA41Bp4FYr9zvyVVSee/ZpCZKX7rhcU5gCaFdqWZix8htnWzVrHjfa7/IiKl5cvX05iEJYeM174UUYrTSnpGdiJCgdd+EIgoISSQvPhAyJYH8ygBnE3kGSr8NsaSln+q6jMr40oe5OmvCyWKDo2Ywymm7zk0IkEDY0MwG4F9KkL8AfnVMvq/veT553wdO7FVzPFamV3Lzwyo0fnB9KoEFjaBDywgNuO5JoJ6yq9jCm1zaWOfKIs3/HLxlt+sbnYdgf3xcfCNZV6S0/ljGjSyI7NiOgCT8XMUORZO6giQSZMFvXTb/X2W6etvmv8hz1nvV7VZsvXHKt0GBY4iITg4wquiwoZV3L8dIGcsOd0YBfkbcjL8+WGvvz76S/XLpg7CTmKgrDWpVL6cqO20pDJYZD9U1uFOdbXzUNVAEMBV0HCcQznK2SX7gpPMKQwmBqLOs7S3n52SoWfsz83y0YjBXsNdGwvjpQwsUMuS8gLtzNlvpxRokpfdvLpzVtTE/IAZCdpUO4SoLDfQre859RXFm43ai5EzIKmecwkFCotE91kEbc9G+FyZV7oPV2NDeQQX4nvxZAhpBMChD4RXRvShjfe8lhEqvvXzazbLcruP3PRgCDwB0GJbu+bb9yw/I6dMdSgyfNLtpWVnu8wM+UY0d4KSbCC+aMedkoUDQaWFhKCCZTtEFUP+c0yiyPKDzjakKHAoiH+dcQX1W77FfU3TpxPVL6pdOnTFCsTmn24f6sZ5E5xRKQnkzBg1AmJqedAw5nxPLd+GDp9sCTYFUPTIsNF7LHedY3FvfSmmG9fU3/7+OeL9Ol60OQn+jSWRO5oYLGzfT2eiPpNLUoGZ+DT+8V6a+4OQ4bfD5700LIt5RV3Zc3ycySBRN46CvVLkXwoHVg+CilhB5t5vqlh+7kdih/RPWIGsqqkv8gtsPIdz1xpJxemQgrf/KdTB31Tlfa3n2ypOeasjdD+ZwaaphdiJ9IlBACBQeYbjJKeCqWFKJGugBKE5VGmQeB8clB26+lr77ykc9BUa9C0BQMaIqXPZ8yqU30F44nxRGTm1nW3X/YUfd+zNL3/Ysv5Y455cXPOqvZ1awSyFOGgeeiVY65pRqkR5afQt05rCeCErBG7ymQ8EsGuWcvf4vntl7ycmtC6Zx97PtNI91q2zjlrcY1Tf4MVBB0Ce4VaaMJJ+JCsD/U8sUVggRwslIbUOXEVmILF/MzKXnbTOf8+Z+LfUaGzoAVvNkpmZSLVR0gXihIBro55rwjUhs5KXdwsnDQp+9Cqp3+RsDPzsBGOLgkkOKTwjQoSggUEXQVLQXKF91jy+M5UnCWQBinNt79dmWs/pyl1Y30X5L/2qlsAUauNd5/zYB9v+ygjcJYxeKLITgAoOIC0tOC7CASVYaG0hQ5zDGXMWS5r8vzFX9552brCx51/j0w9WZtTsZOkS0sTUT2cPg8JjmbN/PXht9/TmwAcPmvBYUelHhm5s1Xhrm7x4uBA1nZd3E+/RoIRSgykiMCg5U9T5cIgkCMlYa50pDIs1tGoROO0E/NfjalPXbOpQGnvf0P6e6+2s8b48Yu09weXj3QDcVGripzhGdHK8GuAHBLMt4KTFy41HoPj1vpk26zRP93ZeufdAamnz95qVjznhQYPAEPiJMw4x9GMuN+2Os70D9r0kjGlbvt7Dalz60gmd7Yu3FXMfvy4Nl71jmJeuLhxHAeCS8BAugEQdlqzlgpWRHmwuKfX+sKqab/cvCeNvT1/q5LuqvHixeHZnzfw7Y2BU5/v2xxEZ7fr5RfRrIXRNwkSySX2XwIhasYvWqR1dV4oB89XkpccKg4T4FA4ApDhu2a0qsFZoQ+G3kXCW8Az7LooPaYrDxmnsC2BQ/MNKcI1ppzcgSo/bsbfXnqDJG571yT2+rbbS6wrSuXbG5qxyg+XIVNgjAZL653mU2VZTo+N/PPnPS/vqq0vzRXM9dqQSUB9HHQifQFkQ5ApfYEUicKywXGWhq6kZ/z48Vre4VcXdBDNM7XfIb24uroV3S79kQROV/13991/CqAtlX3v6tB7DGNQikgmhTNH655EHXle6AKN5xX/zSE3PvW1A0vNU0/dUh3kXtBgcgnY0EUgNwJKHud4IAiwQk7giMD92jbxIoDz9rCz7wus+DiF/BDFcRyhS8GDR//gxfcFb9Hj1xw86/99r7tgdFXvOwOUnLRkdItWeTllB8MB0eyRPaV5JGcRVwbmPcES243SJ/vMeP6cXRnAKlD9zZbJEa/hY13HFg0sDHauw5+OeCuCN/EgN2f7rAtW7NpuJLz8nx05/r5mq/wqnP+j+YD+okmhgJeyApSDwrBg5n29JNYko/dd+Z/YgqJ1sc/lkOvfqmq0yp7w9HgfjuRTWDgtLZIk+tEbABQuNclsPR7Ji+i5lSfUVfU77ty/Nr37xzCBv/XNJdkDjz3+acWtDiyyAxIqgyNq+Va0+zzut0+5ho+7f9TSAjWieGDq2UO+EOoR20xcIoE8MiDAAVlKiv4xKaHfhXsOPgT5YJgwhCgHbCjJN+XeXPIh0djXQlP+rYVWNclCsRI9J25edm/OSF7DPMRmKNhYKIAh8xgbmSVIEKQhBCzcjilQ0eGzIJbaaGjpf447mccbZv+0sUh7RCoVi4heAywRtL457RdbQ8JEG1T6zP7DwVlp1tmy5NeOGU8qpF7J7yHfS9FmPIrwyReCUocVpFiQnEQkTygPiOR8pq00yJ3XPOWy18PK+IOqYmlqpBi1I2ovvt/z2iVAI1OLEp87VaOzKnIm0uLl8DM2RbTgU1/l7A4jdpaSsXOZj4gcuV34ywWAQo+aLBENGVMbXjGIsAfIR6iIoWngLXOEvprrbCmR/rsmd9/wA7HycMtrtPx8OtHYJtM9qpOrGHIzhn9s1tNOtDUxUppGUnoYVghZ6BuANp4BFE4j01Z8mEMrmPkgfCZzGlDKBIZDMNuNCvvfokx95HNRJTx1CBZ0D0c4q6LMfqh+yv/9W3GydgXpawANvX7RkM16n0ezZo9jAjKfIB3qFnIKSQHDAWQegCEA4PfQX1rzJuKfAP5HgAMDpHuQpcc3iDkCx3AglPcJC/auyP3H4kZ6GRKFWn4ejpyXhgXLILcNjy8odblR6SPVEU41aFH6hXLaGjYByAmlfDTeAAjQwj8JySFVbwSB5+m6gePbBX7D9AgUHgkcWDGRlOZQBw7tR8GpRMIdNFrzVXbm8UM97bqlOHNQ4LPwdzcddMT1z/TfJGr/3G4mDwN5FnFas6afbwlkEMORcfLkgBFJDr4iW1NoDHAwfcmg+W4wscLXzGMUxWZk7sE4h6dNAwl/dME9faXlQdZPkecLJj1hRPEr87hR4XE9FmYNqS1+BEChPSXMCkYgDJppwkg6KKxAQJyQ7le9hTve5n4i0OJDcCQxBMCgPkjEIPVSwtppLku4Tkepl23xmFeCfX3D1RJHNwlZe+zxw17esHQpDT8shGtY0Jx/YdZc3xHpOQCMB6bXPDdmuIMHeFuGlpn2SEM6n7EwD0PzBJahBAMNBtayW4TM/Oofd5xx0wnV7uSIzD/PhQEfEIMjjxZFkNkmQDoHWoAolEwCkx7pR7NOcR4GtPMlbkmKqdCSCkEm4CAOeJSI4XwExAnfaa/089d+dXPdsh/bQy6Ms+zDwtKwKOETYTsTEwwyaCyEF5G5mw9KtB86yms4LM5aTzJk9i0f6iKnaZd/Gh9AmYTO0gnQqPGL4jhbMxZksBvqvndwdMvURJAfZJf3Ojz9Rf37iUh8IrQNEkIwnwhYsd2vkHOpTwatl+VnjXoQXatXrh7rRPz81XE3/e8WxKyQZ8aMkYULpaqz33BwhadwxIXn0E2gtxh5532xzY569AhJpr0wLaATHIizArsNPtVVG2654GX6vDg11D0+svnquOM8JjQjIGc0XJEwElHpvJK58aI7xZZc5ToWP7F1LXu3r/CugURlaLe3Q0TOJhrF0gnQ6j7JHq7UayglWeGlX2pqq8X/y0g+2+CaL/TurX+/JfW9D8pkZh15riQRyCjW9wvSlzTf9uMXisTo2jLr1M1ldtMFyvNWKCMOGaeFCMVMUlAUoqJEFEEjgSmWXYEhxbHb845KGqQMy1IaJuJit7WXnb5q/S0XLKRJKpJ55eqrncMag2sN117G8L8lJKSZdF+5z0J+N5RU/mFtac0zgwaZZ6+97qLPka5dQydkccqjJ4h0zkYnQFUmTs2GPr/HLOmXJbTtGSjPtdiP21wRk9mjrlxiuQz70yhmYHulSk5cc+e4N4sM7Xrdes9PvoyLhnPi0n1W001H4MQXBbI7+yUWiIciH7sOje53sBUCSHU62Sx8Azgqwj1L5b5Mso6L18+86Ild+y/ef3BvXT4h5C8NP1+PUwdYYbC7htebKOpCf9WT/io/MOov/VnKwCHrOE2gTg5WKkVVwtLZ85Ce8e2GxjbSbmiLVnIGzvkZ/XMbThmWbT12VX3ll59VJC/MavEDaB0Dy9carGWhOBcJ7XltnlW39bjE55dVuE13wtY0wBkkhFAIAOqffui+c847ecJ7vKQ69K2oo4pg6iKISDNXYdv/coBoPK1h+k9eRK1vLM03n/dFqfRS5FiTVc5x/fy+dz1Z2+BWT5+UeWDE2s0tH/35wP7jkKE5yMDElAvtXdoALRLclStWe8OHExqN5AOS+0aF2/JXbsgHfM634f/JnNwhzQmuHi/XlWuXq/SYpjvh43az9Jn+2rB2yeZ0GKXHQ8WbUvo6qSiyQeG4w4zgDmKhb1O4p9AV9qcgUJrmm8p2LR58OMDL/m5lqg6nPMJFu1cucETHrBfO063xih9zdF3qZ97Wzdy8wElsypvOSCy9GwIeKRMs29TfyZ/0xYxLO/PluwE0HoTecA/557QouRDBJ5xaWB/MojTAqoThFZZT6Wy6f/ucU25Cw8653yuHqEBH8jZWHDyaaf7pWaWf7ljxJCkFpHBhhxCZkrcXckOuAYIEAaRE6Ib7RpBPR5VcXsmcPx7Zuu7fFu84a9Sdfot1Bkz9ff/GaI9nc7GSYUK20UZ/qOyxOYpJ0pTQ8naZ33Zty+SfPVxsQ9fdAKIXY+5/2XqnvmqqqyKX4qhCUmkRoQUdEpaiSeP2gwe1rL5vxcMTyJ//TgWo8t6p1/qmfXZUUgQner43IK0negEfnGiDTFHgKTh2e2RLQrNXwU/5qJqp5WtS524As52i/106pxz4hvKSm4QvzsYMlCAM4dD3OFYkt5YG7XO2Tb14/p4T/zWAih33+/WLB8po8gfYeu6X8DLr40798k/m1q0vft+fV0ToiZa4G0sw2uJmLNEQz74699Tcnszurz6Hpp4Y4pnB0diqqon6YhVc3o9W/S/6L6X7a5z/LXT+AwIMQBEymimcAAAAAElFTkSuQmCC",
			retaindb: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHJ4PSIxMSIgZmlsbD0iI0Y4RjVFRiIvPgogIDxyZWN0IHg9IjExIiB5PSI3IiAgd2lkdGg9IjI2IiBoZWlnaHQ9IjUuNSIgcng9IjIuNzUiIGZpbGw9IiMwRDBCMDkiLz4KICA8cmVjdCB4PSIxMSIgeT0iMTYiIHdpZHRoPSIyNiIgaGVpZ2h0PSI1LjUiIHJ4PSIyLjc1IiBmaWxsPSIjMEQwQjA5Ii8+CiAgPHJlY3QgeD0iMTEiIHk9IjI1IiB3aWR0aD0iMTYiIGhlaWdodD0iNS41IiByeD0iMi43NSIgZmlsbD0iIzBEMEIwOSIvPgogIDxyZWN0IHg9IjExIiB5PSIzNCIgd2lkdGg9IjI2IiBoZWlnaHQ9IjUuNSIgcng9IjIuNzUiIGZpbGw9IiMwRDBCMDkiLz4KPC9zdmc+Cg==",
			byterover: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzYiIGhlaWdodD0iMzYiIHZpZXdCb3g9IjAgMCAzNiAzNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTE4IDM2QzI3Ljk0MTEgMzYgMzYgMjcuOTQxMSAzNiAxOEMzNiA4LjA1ODg3IDI3Ljk0MTEgMCAxOCAwQzguMDU4ODggMCAwIDguMDU4ODcgMCAxOEMwIDI3Ljk0MTEgOC4wNTg4OCAzNiAxOCAzNloiIGZpbGw9ImJsYWNrIi8+CjxwYXRoIGQ9Ik0xOCAxLjgwNjY0QzI2Ljk0NjkgMS44MDY2NCAzNC4yMDAxIDkuMDU5OTEgMzQuMjAwMiAxOC4wMDY4QzM0LjIwMDIgMjYuOTUzOCAyNi45NDcgMzQuMjA3IDE4IDM0LjIwN0M5LjA1MzIyIDM0LjIwNjggMS43OTk4IDI2Ljk1MzcgMS43OTk4IDE4LjAwNjhDMS43OTk5MSA5LjA2MDA4IDkuMDUzMjkgMS44MDY5MiAxOCAxLjgwNjY0Wk0xOCAzLjYwNjQ1QzEwLjA0NzQgMy42MDY3MiAzLjYwMDY5IDEwLjA1NDIgMy42MDA1OSAxOC4wMDY4QzMuNjAwNTkgMjUuOTU5NiAxMC4wNDczIDMyLjQwNyAxOCAzMi40MDcyQzIwLjE1NjIgMzIuNDA3MiAyMi4yMDE3IDMxLjkzMjQgMjQuMDM4MSAzMS4wODNDMjMuMzgzMSAyOS4zNTM3IDIwLjUwNzIgMjYuNzU1OSA5LjgyNTIgMjUuMTgyNkM5Ljg2Njg0IDI1LjE4MzIgMjMuOTY4NiAyNS4zNzggMjUuMDc4MSAzMC41NDg4QzI2LjQ1MzEgMjkuNzcxMiAyNy42ODcyIDI4Ljc3NDUgMjguNzMzNCAyNy42MDU1QzI5LjExNTUgMjUuNjEzOSAyOC4zNTA0IDE5LjQ5OTYgNS45NzE2OCAxNi43MjY2QzUuOTcxNjggMTYuNzI2NiAyOS4zNjE4IDE3LjQyMTggMzAuMTI3OSAyNS43NzM0QzMxLjIxMTUgMjQuMDg0OSAzMS45NTA3IDIyLjE1NTQgMzIuMjUgMjAuMDgzQzMxLjczODggMTcuNDQyNyAyOC4wMjg2IDEyLjg1NDEgOS40OTYwOSAxMC41NTc2QzkuNTY5NTggMTAuNTU5OCAyNy4zMDQ2IDExLjEwMDcgMzIuMzQ2NyAxNi43Njg2QzMyLjIwOTMgMTUuMTU2NiAzMS44MDcxIDEzLjYyMDcgMzEuMTgyNiAxMi4yMDQxQzMwLjE2NSAxMC4zNTQyIDI2LjY2NiA3LjgzOTUzIDE1LjY5ODIgNi40ODA0N0MxNS42OTgyIDYuNDgwNDcgMjQuNTUwOSA2Ljc0NDgyIDI5LjQwNTMgOS4yMTU4MkMyNi43NzE4IDUuODA0NTMgMjIuNjQyNyAzLjYwNjQ1IDE4IDMuNjA2NDVaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K",
			supermemory: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMCAyNCIgZmlsbD0ibm9uZSI+CiAgPHBhdGggZD0iTTI5LjMzODggOS40Njc2N0gxOC40NDhWMC4wMDE0NjQ4NEgxNC45MjkzVjEwLjI3MjVDMTQuOTI5MyAxMS4zNjM0IDE1LjM2IDEyLjQxMSAxNi4xMjU0IDEzLjE4M0wyNS4wMTggMjIuMTUxTDI3LjUwNiAxOS42NDE5TDIwLjkzOCAxMy4wMTgzSDI5LjM0MDhWOS40Njk3NUwyOS4zMzg4IDkuNDY3NjdaIiBmaWxsPSIjMEIxMDE1Ii8+CiAgPHBhdGggZD0iTTEuODI4MzkgNC4zNjA1Nkw4LjM5NjMzIDEwLjk4NDJILTAuMDA2NDY5NzNWMTQuNTMyOEgxMC44ODQzVjIzLjk5OUgxNC40MDNWMTMuNzI4QzE0LjQwMyAxMi42MzcgMTMuOTcyMyAxMS41ODk0IDEzLjIwNjkgMTAuODE3NUw0LjMxNjM1IDEuODUxNDdMMS44MjgzOSA0LjM2MDU2WiIgZmlsbD0iIzBCMTAxNSIvPgo8L3N2Zz4K"
		};
		function HolographicMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				viewBox: "0 0 36 36",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						width: "36",
						height: "36",
						rx: "9",
						fill: "#151729"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M18 7.5 28.5 18 18 28.5 7.5 18 18 7.5Z",
						stroke: "#AEB7FF",
						strokeWidth: "1.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M18 11.5 24.5 18 18 24.5 11.5 18 18 11.5Z",
						stroke: "#7F8CF4",
						strokeWidth: "1.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "18",
						cy: "18",
						r: "2.75",
						fill: "#DCE0FF"
					})
				]
			});
		}
		/** Provider brand mark. Official assets are bundled locally; Holographic uses its canonical mirror motif. */
		function ProviderIcon({ providerId, className, title }) {
			const accessibility = title === void 0 ? { "aria-hidden": true } : {
				role: "img",
				"aria-label": title
			};
			if (providerId === "mnemon-native") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className,
				"data-provider-icon": providerId,
				...accessibility,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MnemonLogo, {})
			});
			if (providerId === "holographic") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className,
				"data-provider-icon": providerId,
				...accessibility,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HolographicMark, {})
			});
			const source = PROVIDER_ICON_SOURCES[providerId];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className,
				"data-provider-icon": providerId,
				...accessibility,
				children: source === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HolographicMark, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src: source,
					alt: ""
				})
			});
		}
		//#endregion
		//#region src/client/use-request-version.ts
		/**
		* Guards UI state against responses from an older request or an unmounted
		* component. Starting a request invalidates every earlier version.
		*/
		function useRequestVersion() {
			const current = (0, react.useRef)(0);
			(0, react.useEffect)(() => () => {
				current.current += 1;
			}, []);
			return (0, react.useMemo)(() => ({
				begin: () => {
					current.current += 1;
					return current.current;
				},
				isCurrent: (version) => current.current === version
			}), []);
		}
		//#endregion
		//#region src/client/ProviderSettingsSection.tsx
		const SAVED_SECRET_MASK = "••••••••••••";
		const PREVIEW_CAPABILITIES = {
			search: false,
			browse: false,
			graph: false,
			entities: false,
			related: false,
			remember: false,
			link: false,
			forget: false,
			writeMode: "exact",
			deletionMode: "unsupported"
		};
		function providerPreview(provider) {
			return {
				...provider,
				origin: "third-party",
				summary: "",
				capabilities: PREVIEW_CAPABILITIES,
				fields: []
			};
		}
		const PROVIDER_PREVIEWS = [
			providerPreview({
				id: "openviking",
				label: "OpenViking",
				kind: "remote",
				workspaceBinding: "provider-global"
			}),
			providerPreview({
				id: "honcho",
				label: "Honcho",
				kind: "remote",
				workspaceBinding: "provider-global"
			}),
			providerPreview({
				id: "mem0",
				label: "Mem0",
				kind: "remote",
				workspaceBinding: "provider-global"
			}),
			providerPreview({
				id: "hindsight",
				label: "Hindsight",
				kind: "remote",
				workspaceBinding: "provider-global"
			}),
			providerPreview({
				id: "holographic",
				label: "Holographic",
				kind: "local",
				workspaceBinding: "optional-override"
			}),
			providerPreview({
				id: "retaindb",
				label: "RetainDB",
				kind: "remote",
				workspaceBinding: "provider-global"
			}),
			providerPreview({
				id: "byterover",
				label: "ByteRover",
				kind: "local",
				workspaceBinding: "optional-override"
			}),
			providerPreview({
				id: "supermemory",
				label: "Supermemory",
				kind: "remote",
				workspaceBinding: "provider-global"
			})
		];
		const EMPTY_PROVIDER_CATALOG = {
			providers: PROVIDER_PREVIEWS,
			items: PROVIDER_PREVIEWS.map((provider) => ({
				providerId: provider.id,
				enabled: false,
				configured: false,
				settings: {},
				configuredSecrets: []
			})),
			generatedAt: ""
		};
		const providerCatalogCache = /* @__PURE__ */ new WeakMap();
		function catalogRouteKey(sessionId, workspaceId) {
			return `${sessionId ?? ""}\u0000${workspaceId ?? ""}`;
		}
		function cachedCatalog(connection, key) {
			return connection === void 0 ? void 0 : providerCatalogCache.get(connection)?.get(key);
		}
		function cacheCatalog(connection, key, catalog) {
			if (connection === void 0) return;
			let routes = providerCatalogCache.get(connection);
			if (routes === void 0) {
				routes = /* @__PURE__ */ new Map();
				providerCatalogCache.set(connection, routes);
			}
			routes.set(key, catalog);
		}
		function message$1(reason) {
			return reason instanceof Error ? reason.message : String(reason);
		}
		function stabilizeProviderCard(element) {
			const view = element.ownerDocument.defaultView;
			let scrollContainer;
			for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
				const overflowY = view?.getComputedStyle(ancestor).overflowY ?? ancestor.style.overflowY;
				if (scrollContainer !== void 0 && overflowY === "hidden" && ancestor.scrollTop !== 0) ancestor.scrollTop = 0;
				if (scrollContainer === void 0 && (overflowY === "auto" || overflowY === "scroll") && ancestor.scrollHeight > ancestor.clientHeight) scrollContainer = ancestor;
				if (ancestor.getAttribute("role") === "dialog") break;
			}
			if (scrollContainer === void 0) return;
			const headerRect = (element.firstElementChild instanceof HTMLElement ? element.firstElementChild : element).getBoundingClientRect();
			const containerRect = scrollContainer.getBoundingClientRect();
			if (headerRect.top < containerRect.top) scrollContainer.scrollTop -= containerRect.top - headerRect.top;
			else if (headerRect.bottom > containerRect.bottom) scrollContainer.scrollTop += headerRect.bottom - containerRect.bottom;
		}
		function serviceFields(provider) {
			return provider.fields.filter((field) => field.scope === "service");
		}
		function globalLocationFields(provider) {
			return serviceFields(provider).filter((field) => field.role === "global-location");
		}
		function serviceDefaults(provider) {
			return Object.fromEntries(serviceFields(provider).flatMap((field) => field.defaultValue === void 0 ? [] : [[field.key, field.defaultValue]]));
		}
		function draftFor(provider, service) {
			return { settings: {
				...serviceDefaults(provider),
				...service.settings,
				...service.secretValues
			} };
		}
		function configurationComplete(provider, draft, service) {
			return serviceFields(provider).every((field) => {
				if (!field.required) return true;
				if (field.input === "secret" && service.configuredSecrets.includes(field.key)) return true;
				const value = draft.settings[field.key];
				return field.input === "boolean" ? typeof value === "boolean" : String(value ?? "").trim() !== "";
			});
		}
		function fieldLabel(t, field) {
			const labels = {
				endpoint: "overview.providerEndpoint",
				apiKey: "overview.providerApiKey",
				account: "overview.providerAccount",
				mode: "overview.providerField.mode",
				dataPath: "overview.providerField.dataPath",
				defaultDirectory: "overview.providerField.defaultDirectory",
				cliPath: "overview.providerField.cliPath"
			};
			return labels[field.key] === void 0 ? field.label : t(labels[field.key]);
		}
		function SecretVisibilityIcon({ visible }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				viewBox: "0 0 20 20",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2.3 10s2.8-4.5 7.7-4.5 7.7 4.5 7.7 4.5-2.8 4.5-7.7 4.5S2.3 10 2.3 10Z",
						stroke: "currentColor",
						strokeWidth: "1.4",
						strokeLinecap: "round",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "10",
						cy: "10",
						r: "2.1",
						stroke: "currentColor",
						strokeWidth: "1.4"
					}),
					visible && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "m3.5 3.5 13 13",
						stroke: "currentColor",
						strokeWidth: "1.4",
						strokeLinecap: "round"
					})
				]
			});
		}
		function ServiceField(props) {
			const [secretVisible, setSecretVisible] = (0, react.useState)(false);
			const label = fieldLabel(props.t, props.field);
			const savedSecret = props.configuredSecrets.includes(props.field.key);
			const required = props.field.required && !savedSecret;
			const secret = props.field.input === "secret";
			const fieldValue = String(props.value ?? "");
			const showingSavedMask = secret && savedSecret && fieldValue === "";
			const displayValue = showingSavedMask ? secretVisible ? props.t("config.providerSecretStoredValue") : SAVED_SECRET_MASK : fieldValue;
			const input = props.field.input === "boolean" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: MnemonSettingsCard_module_css_default.providerBoolean,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					"aria-label": label,
					type: "checkbox",
					checked: Boolean(props.value),
					disabled: props.disabled,
					onChange: (event) => props.onChange(event.target.checked)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
			}) : props.field.input === "select" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [label, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
				"aria-label": label,
				value: String(props.value ?? ""),
				required,
				disabled: props.disabled,
				onChange: (event) => props.onChange(event.target.value),
				children: props.field.options?.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
					value: option.value,
					children: props.t(`overview.providerOption.${option.value}`)
				}, option.value))
			})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [label, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: secret ? MnemonSettingsCard_module_css_default.providerSecretInput : void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					"aria-label": label,
					type: secret ? secretVisible ? "text" : "password" : props.field.input === "number" ? "number" : props.field.input === "url" ? "url" : "text",
					value: displayValue,
					required,
					disabled: props.disabled,
					autoComplete: secret ? "new-password" : void 0,
					placeholder: props.field.placeholder ?? (secret ? props.t("overview.providerApiKeyOptional") : void 0),
					maxLength: secret ? 8e3 : 2e3,
					step: props.field.input === "number" ? "any" : void 0,
					onFocus: (event) => {
						if (showingSavedMask) event.currentTarget.select();
					},
					onClick: (event) => {
						if (showingSavedMask) event.currentTarget.select();
					},
					onChange: (event) => {
						const value = showingSavedMask ? event.target.value.replace(SAVED_SECRET_MASK, "").replace(props.t("config.providerSecretStoredValue"), "") : event.target.value;
						props.onChange(value);
					}
				}), secret && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: MnemonSettingsCard_module_css_default.providerSecretVisibility,
					"aria-label": props.t(secretVisible ? "config.providerSecretHide" : "config.providerSecretShow"),
					title: props.t(secretVisible ? "config.providerSecretHide" : "config.providerSecretShow"),
					"aria-pressed": secretVisible,
					disabled: props.disabled,
					onClick: () => setSecretVisible((value) => !value),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SecretVisibilityIcon, { visible: secretVisible })
				})]
			})] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: MnemonSettingsCard_module_css_default.providerFieldControl,
				"data-input": props.field.input,
				children: input
			});
		}
		function ProviderServiceForm(props) {
			const [draft, setDraft] = (0, react.useState)(() => draftFor(props.provider, props.service));
			const [customLocations, setCustomLocations] = (0, react.useState)(() => new Set(globalLocationFields(props.provider).filter((field) => String(props.service.settings[field.key] ?? "").trim() !== "").map((field) => field.key)));
			const [saving, setSaving] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(null);
			const [saved, setSaved] = (0, react.useState)(false);
			const formRef = (0, react.useRef)(null);
			const stabilizeAfterLocationLayout = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				setDraft(draftFor(props.provider, props.service));
				setCustomLocations(new Set(globalLocationFields(props.provider).filter((field) => String(props.service.settings[field.key] ?? "").trim() !== "").map((field) => field.key)));
			}, [props.provider, props.service]);
			(0, react.useLayoutEffect)(() => {
				if (!stabilizeAfterLocationLayout.current || formRef.current === null) return;
				stabilizeAfterLocationLayout.current = false;
				stabilizeProviderCard(formRef.current.closest("[data-provider]") ?? formRef.current);
			}, [customLocations]);
			const submit = async (event) => {
				event.preventDefault();
				const locationsComplete = props.activeScope === "workspace" || globalLocationFields(props.provider).every((field) => !customLocations.has(field.key) || String(draft.settings[field.key] ?? "").trim() !== "");
				if (!configurationComplete(props.provider, draft, props.service) || !locationsComplete || saving || props.disabled) return;
				setSaving(true);
				setFailed(null);
				setSaved(false);
				const settings = { ...draft.settings };
				for (const field of globalLocationFields(props.provider)) if (props.activeScope === "workspace" || !customLocations.has(field.key)) settings[field.key] = "";
				try {
					await props.onSave(props.provider, { settings });
					setSaved(true);
				} catch (reason) {
					setFailed(message$1(reason));
				} finally {
					setSaving(false);
				}
			};
			const update = (key, value) => {
				setDraft((current) => ({
					...current,
					settings: {
						...current.settings,
						[key]: value
					}
				}));
				setFailed(null);
				setSaved(false);
			};
			const useCustomLocation = (field, custom) => {
				stabilizeAfterLocationLayout.current = true;
				setCustomLocations((current) => {
					const next = new Set(current);
					if (custom) next.add(field.key);
					else next.delete(field.key);
					return next;
				});
				setFailed(null);
				setSaved(false);
			};
			const stabilizeLocationCard = () => {
				if (formRef.current === null) return;
				stabilizeProviderCard(formRef.current.closest("[data-provider]") ?? formRef.current);
			};
			const locations = globalLocationFields(props.provider);
			const regularFields = serviceFields(props.provider).filter((field) => field.role !== "global-location");
			const locationsComplete = props.activeScope === "workspace" || locations.every((field) => !customLocations.has(field.key) || String(draft.settings[field.key] ?? "").trim() !== "");
			const formComplete = configurationComplete(props.provider, draft, props.service) && locationsComplete;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				ref: formRef,
				className: MnemonSettingsCard_module_css_default.providerServiceForm,
				onSubmit: (event) => void submit(event),
				"data-provider": props.provider.id,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: MnemonSettingsCard_module_css_default.providerServicePrompt,
						children: props.t(props.service.configured ? "config.providerServiceHint" : "config.providerEnableHint")
					}),
					locations.map((field) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GlobalLocationSetting, {
						className: MnemonSettingsCard_module_css_default.providerServiceLocation,
						name: `${props.provider.id}-${field.key}-location`,
						ariaLabel: `${props.provider.label} ${props.t("config.providerGlobalLocation")}`,
						label: props.t("config.providerGlobalLocation"),
						hint: props.t(props.activeScope === "workspace" ? "config.providerGlobalLocationWorkspaceHint" : "config.providerGlobalLocationHint", { provider: props.provider.label }),
						defaultLabel: props.t("config.providerDefaultLocation"),
						customLabel: props.t("config.custom"),
						custom: customLocations.has(field.key),
						workspace: props.activeScope === "workspace",
						disabled: props.disabled || saving,
						onInteract: stabilizeLocationCard,
						onChange: (custom) => useCustomLocation(field, custom),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonSettingsCard_module_css_default.providerLocationField,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ServiceField, {
								field,
								value: draft.settings[field.key],
								configuredSecrets: props.service.configuredSecrets,
								disabled: props.disabled || saving,
								t: props.t,
								onChange: (value) => update(field.key, value)
							})
						})
					}, field.key)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonSettingsCard_module_css_default.providerSettingsGrid,
						children: regularFields.map((field) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ServiceField, {
							field,
							value: draft.settings[field.key],
							configuredSecrets: props.service.configuredSecrets,
							disabled: props.disabled || saving,
							t: props.t,
							onChange: (value) => update(field.key, value)
						}, field.key))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `${MnemonSettingsCard_module_css_default.memoryConfigFooter} ${MnemonSettingsCard_module_css_default.providerServiceFooter}`,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonSettingsCard_module_css_default.configFeedback,
							"aria-live": "polite",
							children: [failed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: MnemonSettingsCard_module_css_default.error,
								children: props.t("config.providerSaveFailed", { error: failed })
							}), saved && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: MnemonSettingsCard_module_css_default.packSuccess,
								children: props.t("config.providerServiceSaved")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							className: MnemonSettingsCard_module_css_default.primaryPill,
							disabled: props.disabled || saving || !formComplete,
							children: saving ? props.t("config.saving") : props.t(props.service.configured ? "config.saveProviderService" : "config.enableProvider")
						})]
					})
				]
			});
		}
		function ProviderPanel(props) {
			const [enabled, setEnabled] = (0, react.useState)(props.service.enabled);
			const [expanded, setExpanded] = (0, react.useState)(props.service.enabled && !props.service.configured);
			const [toggling, setToggling] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(null);
			const rowRef = (0, react.useRef)(null);
			const stabilizeAfterLayout = (0, react.useRef)(false);
			(0, react.useLayoutEffect)(() => {
				if (!stabilizeAfterLayout.current || rowRef.current === null) return;
				stabilizeAfterLayout.current = false;
				stabilizeProviderCard(rowRef.current);
			}, [enabled, expanded]);
			(0, react.useEffect)(() => {
				if (toggling) return;
				setEnabled(props.service.enabled);
				if (!props.service.enabled) setExpanded(false);
			}, [props.service.enabled, toggling]);
			const toggle = async (next) => {
				setFailed(null);
				stabilizeAfterLayout.current = true;
				if (next && !props.service.configured) {
					setEnabled(true);
					setExpanded(true);
					return;
				}
				if (!next && !props.service.enabled) {
					setEnabled(false);
					setExpanded(false);
					return;
				}
				const restoreEnabled = enabled;
				const restoreExpanded = expanded;
				setEnabled(next);
				if (!next && expanded) setExpanded(false);
				setToggling(true);
				try {
					const updated = await props.onToggle(props.provider, next);
					setEnabled(updated.enabled);
					if (!next) setExpanded(false);
				} catch (reason) {
					setEnabled(restoreEnabled);
					if (restoreExpanded) setExpanded(true);
					setFailed(message$1(reason));
				} finally {
					setToggling(false);
				}
			};
			const stateKey = enabled ? props.service.configured ? "config.providerEnabled" : "config.providerNeedsConfiguration" : props.service.configured ? "config.providerDisabledConfigured" : "config.providerDisabled";
			const providerScope = props.provider.workspaceBinding === "provider-global" ? "global" : props.activeScope;
			const controlDisabled = props.disabled || toggling;
			const toggleExpanded = () => {
				stabilizeAfterLayout.current = true;
				setExpanded((value) => !value);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rowRef,
				className: MnemonSettingsCard_module_css_default.providerRow,
				"data-provider": props.provider.id,
				"data-enabled": enabled || void 0,
				"data-expanded": expanded || void 0,
				role: "group",
				"aria-label": `${props.provider.label} ${props.t("config.providerServiceTitle")}`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonSettingsCard_module_css_default.providerRowHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: MnemonSettingsCard_module_css_default.providerDisclosure,
							"aria-expanded": expanded,
							disabled: !enabled || controlDisabled,
							onClick: toggleExpanded,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: MnemonSettingsCard_module_css_default.providerIdentity,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderIcon, {
									providerId: props.provider.id,
									className: MnemonSettingsCard_module_css_default.providerMark
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: props.provider.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: props.t(`overview.providerSummary.${props.provider.id}`) })] })]
							}), enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
								className: MnemonSettingsCard_module_css_default.providerChevron,
								"aria-hidden": "true",
								children: "›"
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonSettingsCard_module_css_default.providerEnableControl,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: MnemonSettingsCard_module_css_default.providerScopeTag,
									"data-scope": providerScope,
									children: props.t(`config.${providerScope}`)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: MnemonSettingsCard_module_css_default.providerState,
									"data-enabled": enabled || void 0,
									children: props.t(stateKey)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: MnemonSettingsCard_module_css_default.providerToggle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										"aria-label": props.t("config.providerToggleAria", { provider: props.provider.label }),
										checked: enabled,
										disabled: controlDisabled,
										onChange: (event) => void toggle(event.target.checked)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})
									})]
								})
							]
						})]
					}),
					failed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: MnemonSettingsCard_module_css_default.providerToggleError,
						role: "alert",
						children: props.t("config.providerToggleFailed", { error: failed })
					}),
					enabled && expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonSettingsCard_module_css_default.providerInlineBody,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderServiceForm, {
							provider: props.provider,
							service: props.service,
							activeScope: props.activeScope,
							disabled: controlDisabled,
							t: props.t,
							onSave: props.onSave
						})
					})
				]
			});
		}
		function ProviderSettingsSection(props) {
			const client = (0, react.useMemo)(() => props.connection === void 0 ? null : new MnemonClient(props.connection, props.sessionId, props.workspaceId), [
				props.connection,
				props.sessionId,
				props.workspaceId
			]);
			const routeKey = catalogRouteKey(props.sessionId, props.workspaceId);
			const initialCatalog = cachedCatalog(props.connection, routeKey);
			const [catalog, setCatalog] = (0, react.useState)(() => initialCatalog ?? EMPTY_PROVIDER_CATALOG);
			const [loading, setLoading] = (0, react.useState)(client !== null && initialCatalog === void 0);
			const [failed, setFailed] = (0, react.useState)(null);
			const loadRequests = useRequestVersion();
			const load = (0, react.useCallback)(async (quiet = false) => {
				if (client === null) return;
				const request = loadRequests.begin();
				if (!quiet) setLoading(true);
				setFailed(null);
				try {
					const next = await client.providerServices();
					if (!loadRequests.isCurrent(request)) return;
					cacheCatalog(props.connection, routeKey, next);
					setCatalog(next);
				} catch (reason) {
					if (!loadRequests.isCurrent(request)) return;
					setFailed(message$1(reason));
				} finally {
					if (!quiet && loadRequests.isCurrent(request)) setLoading(false);
				}
			}, [
				client,
				loadRequests,
				props.connection,
				routeKey
			]);
			(0, react.useEffect)(() => {
				const cached = cachedCatalog(props.connection, routeKey);
				setCatalog(cached ?? EMPTY_PROVIDER_CATALOG);
				setLoading(client !== null && cached === void 0);
				load(cached !== void 0);
			}, [
				client,
				load,
				props.connection,
				props.refreshKey,
				routeKey
			]);
			const acceptService = (0, react.useCallback)((service) => {
				setCatalog((current) => {
					const items = current.items.some((item) => item.providerId === service.providerId) ? current.items.map((item) => item.providerId === service.providerId ? service : item) : [...current.items, service];
					const next = {
						...current,
						items,
						generatedAt: (/* @__PURE__ */ new Date()).toISOString()
					};
					cacheCatalog(props.connection, routeKey, next);
					return next;
				});
			}, [props.connection, routeKey]);
			const save = async (provider, draft) => {
				if (client === null) throw new Error(props.t("config.providerUnavailable"));
				const settings = Object.fromEntries(Object.entries(draft.settings).filter(([key, value]) => serviceFields(provider).find((field) => field.key === key)?.input !== "secret" || String(value).trim() !== ""));
				acceptService(await client.updateProviderService({
					providerId: provider.id,
					settings,
					enabled: true
				}));
			};
			const toggle = async (provider, enabled) => {
				if (client === null) throw new Error(props.t("config.providerUnavailable"));
				const updated = await client.updateProviderService({
					providerId: provider.id,
					settings: {},
					enabled
				});
				acceptService(updated);
				return updated;
			};
			const disabled = props.disabled || props.scopeChanging || client === null || loading || catalog.generatedAt === "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				props.scopeChanging && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: MnemonSettingsCard_module_css_default.scopeChanging,
					role: "status",
					children: props.t("config.saveScopeBeforeProviders")
				}),
				props.workspaceLabel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: MnemonSettingsCard_module_css_default.providerTarget,
					children: props.t("config.providerTargetWorkspace", { workspace: props.workspaceLabel })
				}),
				loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: MnemonSettingsCard_module_css_default.visuallyHidden,
					role: "status",
					children: props.t("config.loadingProviders")
				}),
				failed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonSettingsCard_module_css_default.providerLoadError,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: MnemonSettingsCard_module_css_default.error,
						children: props.t("config.providerLoadFailed", { error: failed })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: MnemonSettingsCard_module_css_default.textButton,
						onClick: () => void load(),
						children: props.t("config.retryProviders")
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: MnemonSettingsCard_module_css_default.providerList,
					"aria-busy": loading,
					children: catalog.providers.map((provider) => {
						const service = catalog.items.find((item) => item.providerId === provider.id) ?? {
							providerId: provider.id,
							enabled: false,
							configured: false,
							settings: {},
							configuredSecrets: []
						};
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderPanel, {
							provider,
							service,
							disabled,
							activeScope: props.activeScope,
							t: props.t,
							onSave: save,
							onToggle: toggle
						}, provider.id);
					})
				})
			] });
		}
		//#endregion
		//#region src/client/MnemonSettingsCard.tsx
		const CORE_FIELDS = [
			"displayMode",
			"storageScope",
			"dataDir"
		];
		const INTERACTION_FIELDS = ["turnBar", "saveAction"];
		const TASK_AGENT_FIELDS = [
			"taskAgentModelMode",
			"taskAgentProvider",
			"taskAgentModel"
		];
		function record(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
		}
		function legacyPackDirectory(value) {
			const packs = value.customPacks ?? [];
			return packs.find((pack) => pack.id === value.customPackId)?.dataDir?.trim() ?? (packs.length === 1 ? packs[0]?.dataDir?.trim() : void 0) ?? "";
		}
		function coreDraft(value) {
			const resolved = value ?? {};
			const dataDir = resolved.dataDir?.trim() || legacyPackDirectory(resolved);
			return {
				displayMode: resolved.displayMode ?? "sidebar",
				storageScope: resolved.storageScope ?? (dataDir === "" ? "global" : "custom"),
				dataDir,
				taskAgentModelMode: resolved.taskAgentModel?.mode === "fixed" ? "fixed" : "inherit",
				taskAgentProvider: resolved.taskAgentModel?.provider?.trim() ?? "",
				taskAgentModel: resolved.taskAgentModel?.model?.trim() ?? ""
			};
		}
		function interactionDraft(value) {
			return {
				turnBar: value?.turnBar !== false,
				saveAction: value?.saveAction !== false
			};
		}
		function draftOf(core, interaction) {
			return {
				...coreDraft(core),
				...interactionDraft(interaction)
			};
		}
		function validation(t, draft) {
			if (![
				"global",
				"workspace",
				"custom"
			].includes(draft.storageScope)) return t("config.invalidScope");
			if (draft.storageScope === "custom") {
				const directory = draft.dataDir.trim();
				if (directory === "") return t("config.customRequired");
				const posixAbsolute = directory.startsWith("/");
				const homeRelative = directory === "~" || directory.startsWith("~/");
				const windowsDriveAbsolute = /^[a-zA-Z]:[\\/]/.test(directory);
				const windowsUncAbsolute = /^\\\\[^\\/]+[\\/][^\\/]+/.test(directory);
				if (!posixAbsolute && !homeRelative && !windowsDriveAbsolute && !windowsUncAbsolute) return t("config.customAbsolute");
			}
			if (draft.taskAgentModelMode === "fixed" && (draft.taskAgentProvider.trim() === "" || draft.taskAgentModel.trim() === "")) return t("config.taskAgentRouteRequired");
			return null;
		}
		function useScope(scope) {
			const subscribe = (0, react.useMemo)(() => scope.subscribe.bind(scope), [scope]);
			const getSnapshot = (0, react.useMemo)(() => scope.getSnapshot.bind(scope), [scope]);
			return (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
		}
		function operations(fields, dirty, draft) {
			return fields.flatMap((field) => {
				if (!dirty.has(field)) return [];
				if (field === "dataDir" && draft.dataDir.trim() === "") return [{
					op: "unset",
					path: [field]
				}];
				const value = draft[field];
				return [{
					op: "set",
					path: [field],
					value: typeof value === "string" ? value.trim() : value
				}];
			});
		}
		async function commit(scope, edits) {
			if (scope.mutate !== void 0) return scope.mutate(edits);
			for (const edit of edits) if (edit.path.length === 1) {
				if (edit.op === "set") await scope.set(edit.path[0], edit.value);
				else await scope.unset(edit.path[0]);
			} else if (edit.op === "set") await scope.setPath(edit.path, edit.value);
			else await scope.unsetPath(edit.path);
		}
		/** Dedicated Mnemon page contributed directly to DSH's settings navigation. */
		function MnemonSettingsCard({ scope, interactionScope: suppliedInteractionScope, connection, sessionId, workspaceId, workspaceLabel, t = translateZh }) {
			const interactionScope = suppliedInteractionScope ?? scope;
			const coreSnapshot = useScope(scope);
			const interactionSnapshot = useScope(interactionScope);
			const [draft, setDraft] = (0, react.useState)(() => draftOf(coreSnapshot.value, interactionSnapshot.value));
			const [dirty, setDirty] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const [saving, setSaving] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(null);
			const [applied, setApplied] = (0, react.useState)(false);
			const [targetRevision, setTargetRevision] = (0, react.useState)(0);
			const [modelCatalog, setModelCatalog] = (0, react.useState)(null);
			const [modelCatalogState, setModelCatalogState] = (0, react.useState)(connection === void 0 ? "unavailable" : "loading");
			const [modelCatalogError, setModelCatalogError] = (0, react.useState)(null);
			const [fullModelCatalogLoaded, setFullModelCatalogLoaded] = (0, react.useState)(false);
			const modelCatalogRequest = (0, react.useRef)(0);
			const configuredTaskAgentMode = coreSnapshot.value?.taskAgentModel?.mode === "fixed" ? "fixed" : "inherit";
			(0, react.useEffect)(() => {
				if (dirty.size === 0) setDraft(draftOf(coreSnapshot.value, interactionSnapshot.value));
			}, [
				dirty.size,
				coreSnapshot.value,
				interactionSnapshot.value
			]);
			const loadModelCatalog = (0, react.useCallback)((includeCatalog) => {
				if (connection === void 0) {
					modelCatalogRequest.current += 1;
					setModelCatalog(null);
					setModelCatalogState("unavailable");
					setModelCatalogError(null);
					setFullModelCatalogLoaded(false);
					return;
				}
				const request = modelCatalogRequest.current + 1;
				modelCatalogRequest.current = request;
				setModelCatalogState("loading");
				setModelCatalogError(null);
				new MnemonClient(connection).taskAgentModels(includeCatalog).then((catalog) => {
					if (modelCatalogRequest.current !== request) return;
					setModelCatalog(catalog);
					setModelCatalogState("ready");
					setFullModelCatalogLoaded(includeCatalog);
					if (includeCatalog) setDraft((current) => {
						if (current.taskAgentModelMode !== "fixed") return current;
						const provider = current.taskAgentProvider || catalog.defaultSelection?.provider || catalog.groups[0]?.id || "";
						const group = catalog.groups.find((candidate) => candidate.id === provider);
						const model = current.taskAgentModel || (catalog.defaultSelection?.provider === provider ? catalog.defaultSelection.model : void 0) || group?.models[0]?.id || "";
						return provider === current.taskAgentProvider && model === current.taskAgentModel ? current : {
							...current,
							taskAgentProvider: provider,
							taskAgentModel: model
						};
					});
				}, (reason) => {
					if (modelCatalogRequest.current !== request) return;
					setModelCatalogState("error");
					setModelCatalogError(reason instanceof Error ? reason.message : String(reason));
				});
			}, [connection]);
			(0, react.useEffect)(() => {
				loadModelCatalog(configuredTaskAgentMode === "fixed");
				return () => {
					modelCatalogRequest.current += 1;
				};
			}, [configuredTaskAgentMode, loadModelCatalog]);
			const coreUser = (0, react.useMemo)(() => record(coreSnapshot.user), [coreSnapshot.user]);
			const activeScope = coreDraft(coreSnapshot.value).storageScope === "workspace" ? "workspace" : "global";
			const error = validation(t, draft);
			const loading = coreSnapshot.status === "loading" || interactionSnapshot.status === "loading";
			const writable = coreSnapshot.writable && interactionSnapshot.writable;
			if (coreSnapshot.status === "unavailable" && interactionSnapshot.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				className: MnemonSettingsCard_module_css_default.page,
				"aria-label": t("config.aria"),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: MnemonSettingsCard_module_css_default.error,
					role: "alert",
					children: t("config.unavailable")
				})
			});
			const edit = (field, value) => {
				setDraft((current) => ({
					...current,
					[field]: value
				}));
				setDirty((current) => new Set(current).add(field));
				setFailed(null);
				setApplied(false);
			};
			const editMany = (values) => {
				setDraft((current) => ({
					...current,
					...values
				}));
				setDirty((current) => /* @__PURE__ */ new Set([...current, ...Object.keys(values)]));
				setFailed(null);
				setApplied(false);
			};
			const discard = () => {
				setDraft(draftOf(coreSnapshot.value, interactionSnapshot.value));
				setDirty(/* @__PURE__ */ new Set());
				setFailed(null);
				setApplied(false);
			};
			const save = async () => {
				if (error !== null || dirty.size === 0 || saving || !writable) return;
				setSaving(true);
				setFailed(null);
				try {
					const coreOps = operations(CORE_FIELDS, dirty, draft);
					const regularCoreChanged = coreOps.length > 0;
					const taskAgentChanged = TASK_AGENT_FIELDS.some((field) => dirty.has(field));
					if (regularCoreChanged) {
						if (Object.hasOwn(coreUser, "customPackId")) coreOps.push({
							op: "unset",
							path: ["customPackId"]
						});
						if (Object.hasOwn(coreUser, "customPacks")) coreOps.push({
							op: "unset",
							path: ["customPacks"]
						});
					}
					if (taskAgentChanged) coreOps.push({
						op: "set",
						path: ["taskAgentModel"],
						value: draft.taskAgentModelMode === "inherit" ? { mode: "inherit" } : {
							mode: "fixed",
							provider: draft.taskAgentProvider.trim(),
							model: draft.taskAgentModel.trim()
						}
					});
					const interactionOps = operations(INTERACTION_FIELDS, dirty, draft);
					await Promise.all([...coreOps.length === 0 ? [] : [commit(scope, coreOps)], ...interactionOps.length === 0 ? [] : [commit(interactionScope, interactionOps)]]);
					setDirty(/* @__PURE__ */ new Set());
					setApplied(true);
					if (regularCoreChanged) setTargetRevision((revision) => revision + 1);
				} catch (reason) {
					setFailed(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setSaving(false);
				}
			};
			const coreDisabled = loading || saving || !coreSnapshot.writable;
			const interactionDisabled = loading || saving || !interactionSnapshot.writable;
			const scopeChanging = dirty.has("storageScope") || dirty.has("dataDir");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				className: MnemonSettingsCard_module_css_default.page,
				"aria-label": t("config.aria"),
				"aria-busy": saving || loading,
				children: loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: MnemonSettingsCard_module_css_default.loading,
					role: "status",
					children: t("common.loading")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: MnemonSettingsCard_module_css_default.pageHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: t("config.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("config.description") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: MnemonSettingsCard_module_css_default.section,
						"aria-labelledby": "mnemon-display-heading",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonSettingsCard_module_css_default.sectionHeading,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								id: "mnemon-display-heading",
								children: t("config.displayTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("config.displayDescription") })] })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: `${MnemonSettingsCard_module_css_default.choiceGrid} ${MnemonSettingsCard_module_css_default.displayGrid}`,
							role: "radiogroup",
							"aria-label": t("config.displayAria"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
								id: "mnemon-display-sidebar",
								name: "mnemon-display",
								label: t("config.displaySidebar"),
								detail: t("config.displaySidebarHint"),
								checked: draft.displayMode === "sidebar",
								disabled: coreDisabled,
								onChange: () => edit("displayMode", "sidebar")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
								id: "mnemon-display-buildin",
								name: "mnemon-display",
								label: t("config.displayBuildin"),
								detail: t("config.displayBuildinHint"),
								checked: draft.displayMode === "buildin",
								disabled: coreDisabled,
								onChange: () => edit("displayMode", "buildin")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: MnemonSettingsCard_module_css_default.section,
						"aria-labelledby": "mnemon-storage-heading",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonSettingsCard_module_css_default.sectionHeading,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								id: "mnemon-storage-heading",
								children: t("config.storageTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("config.storageDescription") })] })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonSettingsCard_module_css_default.choiceGrid,
							role: "radiogroup",
							"aria-label": t("config.scopeAria"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
								id: "mnemon-storage-global",
								name: "mnemon-storage",
								label: t("config.global"),
								detail: t("config.globalScopeHint"),
								checked: draft.storageScope !== "workspace",
								disabled: coreDisabled,
								onChange: () => edit("storageScope", draft.dataDir.trim() === "" ? "global" : "custom")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
								id: "mnemon-storage-workspace",
								name: "mnemon-storage",
								label: t("config.workspace"),
								detail: "<workspace>/.mnemon",
								checked: draft.storageScope === "workspace",
								disabled: coreDisabled,
								onChange: () => edit("storageScope", "workspace")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: MnemonSettingsCard_module_css_default.section,
						"aria-labelledby": "mnemon-providers-heading",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: MnemonSettingsCard_module_css_default.sectionHeading,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									id: "mnemon-providers-heading",
									children: t("config.providersTitle")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("config.providersDescription") })] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
								className: MnemonSettingsCard_module_css_default.providerPanel,
								open: true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: MnemonSettingsCard_module_css_default.providerIdentity,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderIcon, {
										providerId: "mnemon-native",
										className: MnemonSettingsCard_module_css_default.nativeMark
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "mnemon" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("config.nativeSummary") })] })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: MnemonSettingsCard_module_css_default.providerHeaderMeta,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: MnemonSettingsCard_module_css_default.providerScopeTag,
										"data-scope": activeScope,
										children: t(`config.${activeScope}`)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: MnemonSettingsCard_module_css_default.providerState,
										children: t("config.officialNative")
									})]
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonSettingsCard_module_css_default.providerPanelBody,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GlobalLocationSetting, {
										name: "mnemon-native-location",
										ariaLabel: t("config.nativeGlobalLocation"),
										label: t("config.nativeGlobalLocation"),
										hint: draft.storageScope === "workspace" ? t("config.nativeGlobalLocationWorkspaceHint") : t("config.nativeGlobalLocationHint"),
										defaultLabel: t("config.nativeDefaultLocation"),
										customLabel: t("config.custom"),
										custom: draft.storageScope === "custom",
										workspace: draft.storageScope === "workspace",
										disabled: coreDisabled,
										onChange: (custom) => custom ? edit("storageScope", "custom") : editMany({
											storageScope: "global",
											dataDir: ""
										}),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: MnemonSettingsCard_module_css_default.settingRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: MnemonSettingsCard_module_css_default.settingCopy,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("config.customDirectory") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("config.customDirectoryHint") })]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: MnemonSettingsCard_module_css_default.directoryControl,
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													id: "mnemon-custom-directory",
													name: "mnemon-custom-directory",
													type: "text",
													className: MnemonSettingsCard_module_css_default.directoryInput,
													"aria-label": t("config.customAria"),
													"aria-invalid": error !== null,
													placeholder: t("config.customPlaceholder"),
													value: draft.dataDir,
													disabled: coreDisabled,
													autoComplete: "off",
													spellCheck: false,
													autoCapitalize: "none",
													autoCorrect: "off",
													onChange: (event) => edit("dataDir", event.target.value)
												})
											})]
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MnemonPackSection, {
										...connection === void 0 ? {} : { connection },
										...sessionId === void 0 ? {} : { sessionId },
										...workspaceId === void 0 ? {} : { workspaceId },
										refreshKey: targetRevision,
										t,
										embedded: true
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderSettingsSection, {
								...connection === void 0 ? {} : { connection },
								...sessionId === void 0 ? {} : { sessionId },
								...workspaceId === void 0 ? {} : { workspaceId },
								...activeScope !== "workspace" || workspaceLabel === void 0 ? {} : { workspaceLabel },
								activeScope,
								refreshKey: targetRevision,
								disabled: coreDisabled,
								scopeChanging,
								t
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TaskAgentModelSection, {
						draft,
						catalog: modelCatalog,
						state: modelCatalogState,
						error: modelCatalogError,
						disabled: coreDisabled,
						fullCatalogLoaded: fullModelCatalogLoaded,
						onLoadCatalog: () => loadModelCatalog(true),
						onEdit: edit,
						onEditMany: editMany,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: MnemonSettingsCard_module_css_default.section,
						"aria-labelledby": "mnemon-interaction-heading",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonSettingsCard_module_css_default.sectionHeading,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								id: "mnemon-interaction-heading",
								children: t("config.interactionTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("config.interactionHint") })] })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonSettingsCard_module_css_default.rowGroup,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								id: "mnemon-interaction-turn-bar",
								label: t("config.interactionTurnBar"),
								hint: t("config.interactionTurnBarHint"),
								checked: draft.turnBar,
								disabled: interactionDisabled,
								onChange: (value) => edit("turnBar", value)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								id: "mnemon-interaction-save-action",
								label: t("config.interactionSaveAction"),
								hint: t("config.interactionSaveActionHint"),
								checked: draft.saveAction,
								disabled: interactionDisabled,
								onChange: (value) => edit("saveAction", value)
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonSettingsCard_module_css_default.feedback,
						"aria-live": "polite",
						children: [
							error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: MnemonSettingsCard_module_css_default.error,
								role: "alert",
								children: error
							}),
							failed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: MnemonSettingsCard_module_css_default.error,
								role: "alert",
								children: t("config.saveFailed", { error: failed })
							}),
							applied && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: MnemonSettingsCard_module_css_default.success,
								role: "status",
								children: t("config.ready")
							}),
							!writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: MnemonSettingsCard_module_css_default.readOnly,
								children: t("config.readOnly")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: `${MnemonSettingsCard_module_css_default.actions} ${dirty.size > 0 ? MnemonSettingsCard_module_css_default.actionsVisible : ""}`,
						"aria-live": "polite",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("config.unsaved") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonSettingsCard_module_css_default.discard,
							disabled: saving,
							onClick: discard,
							children: t("config.discard")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonSettingsCard_module_css_default.save,
							disabled: saving || error !== null || !writable,
							onClick: () => void save(),
							children: saving ? t("config.saving") : t("config.save")
						})] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: MnemonSettingsCard_module_css_default.settingsNote,
						children: [
							t("config.noticeBefore"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: ".dsh/settings.yaml" }),
							t("config.noticeAfter")
						]
					})
				] })
			});
		}
		function TaskAgentModelSection(props) {
			const groups = props.catalog?.groups ?? [];
			const group = groups.find((candidate) => candidate.id === props.draft.taskAgentProvider);
			const inherited = props.catalog?.defaultSelection ?? (props.catalog?.effective?.source === "fixed" ? void 0 : props.catalog?.effective);
			const effective = props.draft.taskAgentModelMode === "fixed" ? props.draft.taskAgentProvider.trim() === "" || props.draft.taskAgentModel.trim() === "" ? void 0 : {
				provider: props.draft.taskAgentProvider,
				model: props.draft.taskAgentModel
			} : inherited;
			const chooseFixed = () => {
				const preferredProvider = props.draft.taskAgentProvider || inherited?.provider || groups[0]?.id || "";
				const models = groups.find((candidate) => candidate.id === preferredProvider)?.models ?? [];
				const preferredModel = props.draft.taskAgentModel || (inherited?.provider === preferredProvider ? inherited.model : void 0) || models[0]?.id || "";
				props.onEditMany({
					taskAgentModelMode: "fixed",
					taskAgentProvider: preferredProvider,
					taskAgentModel: preferredModel
				});
				if (!props.fullCatalogLoaded) props.onLoadCatalog();
			};
			const chooseProvider = (provider) => {
				const models = groups.find((candidate) => candidate.id === provider)?.models ?? [];
				props.onEditMany({
					taskAgentProvider: provider,
					taskAgentModel: models[0]?.id ?? ""
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: MnemonSettingsCard_module_css_default.section,
				"aria-labelledby": "mnemon-task-agent-heading",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonSettingsCard_module_css_default.sectionHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							id: "mnemon-task-agent-heading",
							children: props.t("config.taskAgentTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: props.t("config.taskAgentDescription") })] }), props.state === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: MnemonSettingsCard_module_css_default.miniSpinner,
							"aria-hidden": "true"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonSettingsCard_module_css_default.choiceGrid,
						role: "radiogroup",
						"aria-label": props.t("config.taskAgentModeAria"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
							id: "mnemon-task-agent-inherit",
							name: "mnemon-task-agent",
							label: props.t("config.taskAgentInherit"),
							detail: props.t("config.taskAgentInheritHint"),
							checked: props.draft.taskAgentModelMode === "inherit",
							disabled: props.disabled,
							onChange: () => props.onEditMany({ taskAgentModelMode: "inherit" })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
							id: "mnemon-task-agent-fixed",
							name: "mnemon-task-agent",
							label: props.t("config.taskAgentFixed"),
							detail: props.t("config.taskAgentFixedHint"),
							checked: props.draft.taskAgentModelMode === "fixed",
							disabled: props.disabled || props.state === "unavailable",
							onChange: chooseFixed
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonSettingsCard_module_css_default.taskAgentPanel,
						"data-mode": props.draft.taskAgentModelMode,
						children: [
							props.draft.taskAgentModelMode === "fixed" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonSettingsCard_module_css_default.taskAgentFields,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: props.t("config.taskAgentProvider") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: props.t("config.taskAgentProviderHint") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": props.t("config.taskAgentProvider"),
									value: props.draft.taskAgentProvider,
									disabled: props.disabled || props.state !== "ready",
									onChange: (event) => chooseProvider(event.target.value),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: props.t("config.taskAgentChooseProvider")
										}),
										props.draft.taskAgentProvider !== "" && !groups.some((candidate) => candidate.id === props.draft.taskAgentProvider) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: props.draft.taskAgentProvider,
											children: props.draft.taskAgentProvider
										}),
										groups.map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: candidate.id,
											children: candidate.name
										}, candidate.id))
									]
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: props.t("config.taskAgentModel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: props.t("config.taskAgentModelHint") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": props.t("config.taskAgentModel"),
									value: props.draft.taskAgentModel,
									disabled: props.disabled || props.state !== "ready" || group === void 0,
									onChange: (event) => props.onEdit("taskAgentModel", event.target.value),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: props.t("config.taskAgentChooseModel")
										}),
										props.draft.taskAgentModel !== "" && !group?.models.some((model) => model.id === props.draft.taskAgentModel) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: props.draft.taskAgentModel,
											children: props.draft.taskAgentModel
										}),
										(group?.models ?? []).map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: model.id,
											children: model.name
										}, model.id))
									]
								})] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonSettingsCard_module_css_default.taskAgentEffective,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: props.t("config.taskAgentEffective") }), effective === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: props.state === "loading" ? props.t("config.taskAgentLoading") : props.t("config.taskAgentUnavailable") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("code", { children: [
									effective.provider,
									" / ",
									effective.model
								] })]
							}),
							props.state === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: MnemonSettingsCard_module_css_default.taskAgentWarning,
								children: props.t("config.taskAgentLoadFailed", { error: props.error ?? "" })
							}),
							(props.catalog?.failures.length ?? 0) > 0 && groups.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: MnemonSettingsCard_module_css_default.taskAgentWarning,
								children: props.t("config.taskAgentPartial", { count: props.catalog.failures.length })
							})
						]
					})
				]
			});
		}
		function ChoiceCard(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: MnemonSettingsCard_module_css_default.choiceCard,
				htmlFor: props.id,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					id: props.id,
					name: props.name,
					type: "radio",
					"aria-label": props.label,
					checked: props.checked,
					disabled: props.disabled,
					onChange: props.onChange
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: MnemonSettingsCard_module_css_default.choiceFace,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: props.label }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: props.detail }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: MnemonSettingsCard_module_css_default.check,
							"aria-hidden": "true",
							children: "✓"
						})
					]
				})]
			});
		}
		function ToggleRow(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: MnemonSettingsCard_module_css_default.toggleRow,
				htmlFor: props.id,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: MnemonSettingsCard_module_css_default.settingCopy,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: props.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: props.hint })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						type: "checkbox",
						"aria-label": props.label,
						checked: props.checked,
						disabled: props.disabled,
						onChange: (event) => props.onChange(event.target.checked)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: MnemonSettingsCard_module_css_default.switch,
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})
					})
				]
			});
		}
		//#endregion
		//#region src/client/anchor.ts
		const MNEMON_ANCHOR_EVENT = "mnemon:anchor";
		const pendingBySession = /* @__PURE__ */ new Map();
		function keyOf(sessionId) {
			return sessionId === void 0 || sessionId === "" ? "*" : sessionId;
		}
		/** Ask the Mnemon view to open a page; held until a matching view consumes it. */
		function dispatchMnemonAnchor(anchor) {
			pendingBySession.set(keyOf(anchor.sessionId), anchor);
			window.dispatchEvent(new CustomEvent(MNEMON_ANCHOR_EVENT, { detail: anchor }));
		}
		/** Take the anchor held for this session (usually at mount time), or null. */
		function consumeMnemonAnchor(sessionId) {
			const key = keyOf(sessionId);
			const anchor = pendingBySession.get(key);
			if (anchor === void 0) return null;
			pendingBySession.delete(key);
			return anchor;
		}
		/** Subscribe to anchors addressed to this session; returns an unsubscribe. */
		function subscribeMnemonAnchor(sessionId, onAnchor) {
			const key = keyOf(sessionId);
			const handler = (event) => {
				const anchor = event.detail;
				if (anchor !== void 0 && keyOf(anchor.sessionId) === key) {
					if (pendingBySession.get(key) === anchor) pendingBySession.delete(key);
					onAnchor(anchor);
				}
			};
			window.addEventListener(MNEMON_ANCHOR_EVENT, handler);
			return () => window.removeEventListener(MNEMON_ANCHOR_EVENT, handler);
		}
		//#endregion
		//#region node_modules/.pnpm/markdown-to-jsx@7.7.17_react@18.3.1/node_modules/markdown-to-jsx/dist/index.module.js
		function n() {
			return n = Object.assign ? Object.assign.bind() : function(r) {
				for (var n = 1; n < arguments.length; n++) {
					var e = arguments[n];
					for (var t in e) Object.prototype.hasOwnProperty.call(e, t) && (r[t] = e[t]);
				}
				return r;
			}, n.apply(this, arguments);
		}
		var e = ["children", "options"];
		var u = [
			"allowFullScreen",
			"allowTransparency",
			"autoComplete",
			"autoFocus",
			"autoPlay",
			"cellPadding",
			"cellSpacing",
			"charSet",
			"classId",
			"colSpan",
			"contentEditable",
			"contextMenu",
			"crossOrigin",
			"encType",
			"formAction",
			"formEncType",
			"formMethod",
			"formNoValidate",
			"formTarget",
			"frameBorder",
			"hrefLang",
			"inputMode",
			"keyParams",
			"keyType",
			"marginHeight",
			"marginWidth",
			"maxLength",
			"mediaGroup",
			"minLength",
			"noValidate",
			"radioGroup",
			"readOnly",
			"rowSpan",
			"spellCheck",
			"srcDoc",
			"srcLang",
			"srcSet",
			"tabIndex",
			"useMap"
		].reduce(function(r, n) {
			return r[n.toLowerCase()] = n, r;
		}, {
			class: "className",
			for: "htmlFor"
		});
		var a = {
			amp: "&",
			apos: "'",
			gt: ">",
			lt: "<",
			nbsp: "\xA0",
			quot: "“"
		};
		var i = [
			"style",
			"script",
			"pre"
		];
		var o = [
			"src",
			"href",
			"data",
			"formAction",
			"srcDoc",
			"action"
		];
		var c = /([-A-Z0-9_:]+)(?:\s*=\s*(?:(?:"((?:\\.|[^"])*)")|(?:'((?:\\.|[^'])*)')|(?:\{((?:\\.|{[^}]*?}|[^}])*)\})))?/gi;
		var f = /\n{2,}$/;
		var l = /^(\s*>[\s\S]*?)(?=\n\n|$)/;
		var _ = /^ *> ?/gm;
		var d = /^(?:\[!([^\]]*)\]\n)?([\s\S]*)/;
		var s = /^ {2,}\n/;
		var v = /^(?:([-*_])( *\1){2,}) *(?:\n *)+\n/;
		var p = /^(?: {1,3})?(`{3,}|~{3,}) *(\S+)? *([^\n]*?)?\n([\s\S]*?)(?:\1\n?|$)/;
		var y = /^(?: {4}[^\n]+\n*)+(?:\n *)+\n?/;
		var h = /^(`+)((?:\\`|(?!\1)`|[^`])+)\1/;
		var g = /^(?:\n *)*\n/;
		var m = /\r\n?/g;
		var k = /^\[\^([^\]]+)](:(.*)((\n+ {4,}.*)|(\n(?!\[\^).+))*)/;
		var x = /^\[\^([^\]]+)]/;
		var q = /\f/g;
		var b = /^---[ \t]*\n(.|\n)*\n---[ \t]*\n/;
		var S = /^\s*?\[(x|\s)\]/;
		var z = /^ *(#{1,6}) *([^\n]+?)(?: +#*)?(?:\n *)*(?:\n|$)/;
		var $ = /^ *(#{1,6}) +([^\n]+?)(?: +#*)?(?:\n *)*(?:\n|$)/;
		var E = /^([^\n]+)\n *(=|-)\2{2,} *\n/;
		var A = /^ *(?!<[a-z][^ >/]* ?\/>)<([a-z][^ >/]*) ?((?:[^>]*[^/])?)>\n?(\s*(?:<\1[^>]*?>[\s\S]*?<\/\1>|(?!<\1\b)[\s\S])*?)<\/\1>(?!<\/\1>)\n*/i;
		var R = /&([a-z0-9]+|#[0-9]{1,6}|#x[0-9a-fA-F]{1,6});/gi;
		var B = /^<!--[\s\S]*?(?:-->)/;
		var L = /^(data|aria|x)-[a-z_][a-z\d_.-]*$/;
		var O = /^ *<([a-z][a-z0-9:]*)(?:\s+((?:<.*?>|[^>])*))?\/?>(?!<\/\1>)(\s*\n)?/i;
		var j = /^\{.*\}$/;
		var C = /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/;
		var I = /^<([^ >]+[:@\/][^ >]+)>/;
		var T = /-([a-z])?/gi;
		var M = /^(\|.*)\n(?: *(\|? *[-:]+ *\|[-| :]*)\n((?:.*\|.*\n)*))?\n?/;
		var w = /^[^\n]+(?:  \n|\n{2,})/;
		var D = /^\[([^\]]*)\]:\s+<?([^\s>]+)>?\s*("([^"]*)")?/;
		var F = /^!\[([^\]]*)\] ?\[([^\]]*)\]/;
		var P = /^\[([^\]]*)\] ?\[([^\]]*)\]/;
		var Z = /(\n|^[-*]\s|^#|^ {2,}|^-{2,}|^>\s)/;
		var N = /\t/g;
		var G = /(^ *\||\| *$)/g;
		var U = /^ *:-+: *$/;
		var V = /^ *:-+ *$/;
		var H = /^ *-+: *$/;
		var Q = function(r) {
			return "(?=[\\s\\S]+?\\1" + (r ? "\\1" : "") + ")";
		};
		var W = "((?:\\[.*?\\][([].*?[)\\]]|<.*?>(?:.*?<.*?>)?|`.*?`|\\\\\\1|[\\s\\S])+?)";
		var J = RegExp("^([*_])\\1" + Q(1) + W + "\\1\\1(?!\\1)");
		var K = RegExp("^([*_])" + Q(0) + W + "\\1(?!\\1)");
		var X = RegExp("^(==)" + Q(0) + W + "\\1");
		var Y = RegExp("^(~~)" + Q(0) + W + "\\1");
		var rr = /^(:[a-zA-Z0-9-_]+:)/;
		var nr = /^\\([^0-9A-Za-z\s])/;
		var er = /\\([^0-9A-Za-z\s])/g;
		var tr = /^[\s\S](?:(?!  \n|[0-9]\.|http)[^=*_~\-\n:<`\\\[!])*/;
		var ur = /^\n+/;
		var ar = /^([ \t]*)/;
		var ir = /(?:^|\n)( *)$/;
		var or = "(?:\\d+\\.)";
		var cr = "(?:[*+-])";
		function fr(r) {
			return "( *)(" + (1 === r ? or : cr) + ") +";
		}
		var lr = fr(1);
		var _r = fr(2);
		function dr(r) {
			return RegExp("^" + (1 === r ? lr : _r));
		}
		var sr = dr(1);
		var vr = dr(2);
		function pr(r) {
			return RegExp("^" + (1 === r ? lr : _r) + "[^\\n]*(?:\\n(?!\\1" + (1 === r ? or : cr) + " )[^\\n]*)*(\\n|$)", "gm");
		}
		var yr = pr(1);
		var hr = pr(2);
		function gr(r) {
			var n = 1 === r ? or : cr;
			return RegExp("^( *)(" + n + ") [\\s\\S]+?(?:\\n{2,}(?! )(?!\\1" + n + " (?!" + n + " ))\\n*|\\s*\\n*$)");
		}
		var mr = gr(1);
		var kr = gr(2);
		function xr(r, n) {
			var e = 1 === n, t = e ? mr : kr, u = e ? yr : hr, a = e ? sr : vr;
			return {
				t: function(r) {
					return a.test(r);
				},
				u: jr(function(r, n) {
					var e = ir.exec(n.prevCapture);
					return e && (n.list || !n.inline && !n.simple) ? t.exec(r = e[1] + r) : null;
				}),
				i: 1,
				o: function(r, n, t) {
					var i = e ? +r[2] : void 0, o = r[0].replace(f, "\n").match(u), c = !1;
					return {
						items: o.map(function(r, e) {
							var u = a.exec(r)[0].length, i = RegExp("^ {1," + u + "}", "gm"), f = r.replace(i, "").replace(a, ""), l = e === o.length - 1, _ = -1 !== f.indexOf("\n\n") || l && c;
							c = _;
							var d, s = t.inline, v = t.list;
							t.list = !0, _ ? (t.inline = !1, d = zr(f) + "\n\n") : (t.inline = !0, d = zr(f));
							var p = n(d, t);
							return t.inline = s, t.list = v, p;
						}),
						ordered: e,
						start: i
					};
				},
				l: function(n, e, t) {
					return r(n.ordered ? "ol" : "ul", {
						key: t.key,
						start: "20" === n.type ? n.start : void 0
					}, n.items.map(function(n, u) {
						return r("li", { key: u }, e(n, t));
					}));
				}
			};
		}
		var qr = RegExp("^\\[((?:\\[[^\\[\\]]*(?:\\[[^\\[\\]]*\\][^\\[\\]]*)*\\]|[^\\[\\]])*)\\]\\(\\s*<?((?:\\([^)]*\\)|[^\\s\\\\]|\\\\.)*?)>?(?:\\s+['\"]([\\s\\S]*?)['\"])?\\s*\\)");
		var br = /^!\[(.*?)\]\( *((?:\([^)]*\)|[^() ])*) *"?([^)"]*)?"?\)/;
		function Sr(r) {
			return "string" == typeof r;
		}
		function zr(r) {
			for (var n = r.length; n > 0 && r[n - 1] <= " ";) n--;
			return r.slice(0, n);
		}
		function $r(r, n) {
			return r.startsWith(n);
		}
		function Er(r, n, e) {
			if (Array.isArray(e)) {
				for (var t = 0; t < e.length; t++) if ($r(r, e[t])) return !0;
				return !1;
			}
			return e(r, n);
		}
		function Ar(r) {
			return r.replace(/[ÀÁÂÃÄÅàáâãäåæÆ]/g, "a").replace(/[çÇ]/g, "c").replace(/[ðÐ]/g, "d").replace(/[ÈÉÊËéèêë]/g, "e").replace(/[ÏïÎîÍíÌì]/g, "i").replace(/[Ññ]/g, "n").replace(/[øØœŒÕõÔôÓóÒò]/g, "o").replace(/[ÜüÛûÚúÙù]/g, "u").replace(/[ŸÿÝý]/g, "y").replace(/[^a-z0-9- ]/gi, "").replace(/ /gi, "-").toLowerCase();
		}
		function Rr(r) {
			return H.test(r) ? "right" : U.test(r) ? "center" : V.test(r) ? "left" : null;
		}
		function Br(r, n, e, t) {
			var u = e.inTable;
			e.inTable = !0;
			var a = [[]], i = "";
			function o() {
				if (i) {
					var r = a[a.length - 1];
					r.push.apply(r, n(i, e)), i = "";
				}
			}
			return r.trim().split(/(`[^`]*`|\\\||\|)/).filter(Boolean).forEach(function(r, n, e) {
				"|" === r.trim() && (o(), t) ? 0 !== n && n !== e.length - 1 && a.push([]) : i += r;
			}), o(), e.inTable = u, a;
		}
		function Lr(r, n, e) {
			e.inline = !0;
			var t = r[2] ? r[2].replace(G, "").split("|").map(Rr) : [], u = r[3] ? function(r, n, e) {
				return r.trim().split("\n").map(function(r) {
					return Br(r, n, e, !0);
				});
			}(r[3], n, e) : [], a = Br(r[1], n, e, !!u.length);
			return e.inline = !1, u.length ? {
				align: t,
				cells: u,
				header: a,
				type: "25"
			} : {
				children: a,
				type: "21"
			};
		}
		function Or(r, n) {
			return null == r.align[n] ? {} : { textAlign: r.align[n] };
		}
		function jr(r) {
			return r.inline = 1, r;
		}
		function Cr(r) {
			return jr(function(n, e) {
				return e.inline ? r.exec(n) : null;
			});
		}
		function Ir(r) {
			return jr(function(n, e) {
				return e.inline || e.simple ? r.exec(n) : null;
			});
		}
		function Tr(r) {
			return function(n, e) {
				return e.inline || e.simple ? null : r.exec(n);
			};
		}
		function Mr(r) {
			return jr(function(n) {
				return r.exec(n);
			});
		}
		var wr = /(javascript|vbscript|data(?!:image)):/i;
		function Dr(r) {
			try {
				var n = decodeURIComponent(r).replace(/[^A-Za-z0-9/:]/g, "");
				if (wr.test(n)) return null;
			} catch (r) {
				return null;
			}
			return r;
		}
		function Fr(r) {
			return r ? r.replace(er, "$1") : r;
		}
		function Pr(r, n, e) {
			var t = e.inline || !1, u = e.simple || !1;
			e.inline = !0, e.simple = !0;
			var a = r(n, e);
			return e.inline = t, e.simple = u, a;
		}
		function Zr(r, n, e) {
			var t = e.inline || !1, u = e.simple || !1;
			e.inline = !1, e.simple = !0;
			var a = r(n, e);
			return e.inline = t, e.simple = u, a;
		}
		function Nr(r, n, e) {
			var t = e.inline || !1;
			e.inline = !1;
			var u = r(n, e);
			return e.inline = t, u;
		}
		var Gr = function(r, n, e) {
			return { children: Pr(n, r[2], e) };
		};
		function Ur() {
			return {};
		}
		function Vr() {
			return null;
		}
		function Hr() {
			return [].slice.call(arguments).filter(Boolean).join(" ");
		}
		function Qr(r, n, e) {
			for (var t = r, u = n.split("."); u.length && void 0 !== (t = t[u[0]]);) u.shift();
			return t || e;
		}
		function Wr(r, n) {
			var e = Qr(n, r);
			return e ? "function" == typeof e || "object" == typeof e && "render" in e ? e : Qr(n, r + ".component", r) : r;
		}
		function Jr(e, t) {
			var f;
			void 0 === e && (e = ""), void 0 === t && (t = {}), t.overrides = t.overrides || {}, t.namedCodesToUnicode = t.namedCodesToUnicode ? n({}, a, t.namedCodesToUnicode) : a;
			var G = t.slugify || Ar, U = t.sanitizer || Dr, V = t.createElement || react.createElement, H = [
				l,
				p,
				y,
				t.enforceAtxHeadings ? $ : z,
				E,
				M,
				mr,
				kr
			], Q = [].concat(H, [
				w,
				A,
				B,
				O
			]);
			function W(r, n) {
				for (var e = 0; e < r.length; e++) if (r[e].test(n)) return !0;
				return !1;
			}
			function er(r, e) {
				var u = Qr(t.overrides, r + ".props", {});
				return V.apply(void 0, [Wr(r, t.overrides), n({}, e, u, { className: Hr(null == e ? void 0 : e.className, u.className) || void 0 })].concat([].slice.call(arguments, 2)));
			}
			function ir(r) {
				r = r.replace(b, "");
				var n = !1;
				t.forceInline ? n = !0 : t.forceBlock || (n = !1 === Z.test(r));
				for (var e = dr(_r(n ? r : zr(r).replace(ur, "") + "\n\n", { inline: n })); Sr(e[e.length - 1]) && !e[e.length - 1].trim();) e.pop();
				if (null === t.wrapper) return e;
				var u, a = t.wrapper || (n ? "span" : "div");
				if (e.length > 1 || t.forceWrapper) u = e;
				else {
					if (1 === e.length) return "string" == typeof (u = e[0]) ? er("span", { key: "outer" }, u) : u;
					u = null;
				}
				return V(a, { key: "outer" }, u);
			}
			function or(r, n) {
				if (!n || !n.trim()) return null;
				var e = n.match(c);
				return e ? e.reduce(function(n, e) {
					var t = e.indexOf("=");
					if (-1 !== t) {
						var a = function(r) {
							return -1 !== r.indexOf("-") && null === r.match(L) && (r = r.replace(T, function(r, n) {
								return n.toUpperCase();
							})), r;
						}(e.slice(0, t)).trim(), i = function(r) {
							var n = r[0];
							return ("\"" === n || "'" === n) && r.length >= 2 && r[r.length - 1] === n ? r.slice(1, -1) : r;
						}(e.slice(t + 1).trim()), c = u[a] || a;
						if ("ref" === c) return n;
						var f = n[c] = function(r, n, e, t) {
							return "style" === n ? function(r) {
								var n = [], e = "", t = !1, u = !1, a = "";
								if (!r) return n;
								for (var i = 0; i < r.length; i++) {
									var o = r[i];
									if ("\"" !== o && "'" !== o || t || (u ? o === a && (u = !1, a = "") : (u = !0, a = o)), "(" === o && e.endsWith("url") ? t = !0 : ")" === o && t && (t = !1), ";" !== o || u || t) e += o;
									else {
										var c = e.trim();
										if (c) {
											var f = c.indexOf(":");
											if (f > 0) {
												var l = c.slice(0, f).trim(), _ = c.slice(f + 1).trim();
												n.push([l, _]);
											}
										}
										e = "";
									}
								}
								var d = e.trim();
								if (d) {
									var s = d.indexOf(":");
									if (s > 0) {
										var v = d.slice(0, s).trim(), p = d.slice(s + 1).trim();
										n.push([v, p]);
									}
								}
								return n;
							}(e).reduce(function(n, e) {
								var u = e[0], a = e[1];
								return n[u.replace(/(-[a-z])/g, function(r) {
									return r[1].toUpperCase();
								})] = t(a, r, u), n;
							}, {}) : -1 !== o.indexOf(n) ? t(Fr(e), r, n) : (e.match(j) && (e = Fr(e.slice(1, e.length - 1))), "true" === e || "false" !== e && e);
						}(r, a, i, U);
						"string" == typeof f && (A.test(f) || O.test(f)) && (n[c] = ir(f.trim()));
					} else "style" !== e && (n[u[e] || e] = !0);
					return n;
				}, {}) : null;
			}
			var cr = [], fr = {}, lr = ((f = {})[0] = {
				t: [">"],
				u: Tr(l),
				i: 1,
				o: function(r, n, e) {
					var t = r[0].replace(_, "").match(d);
					return {
						alert: t[1],
						children: n(t[2], e)
					};
				},
				l: function(r, n, e) {
					var t = { key: e.key };
					return r.alert && (t.className = "markdown-alert-" + G(r.alert.toLowerCase(), Ar), r.children.unshift({
						attrs: {},
						children: [{
							type: "27",
							text: r.alert
						}],
						noInnerParse: !0,
						type: "11",
						tag: "header"
					})), er("blockquote", t, n(r.children, e));
				}
			}, f[1] = {
				t: ["  "],
				u: Mr(s),
				i: 1,
				o: Ur,
				l: function(r, n, e) {
					return er("br", { key: e.key });
				}
			}, f[2] = {
				t: [
					"--",
					"__",
					"**",
					"- ",
					"* ",
					"_ "
				],
				u: Tr(v),
				i: 1,
				o: Ur,
				l: function(r, n, e) {
					return er("hr", { key: e.key });
				}
			}, f[3] = {
				t: ["    "],
				u: Tr(y),
				i: 0,
				o: function(r) {
					return {
						lang: void 0,
						text: Fr(zr(r[0].replace(/^ {4}/gm, "")))
					};
				},
				l: function(r, e, t) {
					return er("pre", { key: t.key }, er("code", n({}, r.attrs, { className: r.lang ? "lang-" + r.lang : "" }), r.text));
				}
			}, f[4] = {
				t: ["```", "~~~"],
				u: Tr(p),
				i: 0,
				o: function(r) {
					return {
						attrs: or("code", r[3] || ""),
						lang: r[2] || void 0,
						text: r[4],
						type: "3"
					};
				}
			}, f[5] = {
				t: ["`"],
				u: Ir(h),
				i: 3,
				o: function(r) {
					return { text: Fr(r[2]) };
				},
				l: function(r, n, e) {
					return er("code", { key: e.key }, r.text);
				}
			}, f[6] = {
				t: ["[^"],
				u: Tr(k),
				i: 0,
				o: function(r) {
					return cr.push({
						footnote: r[2],
						identifier: r[1]
					}), {};
				},
				l: Vr
			}, f[7] = {
				t: ["[^"],
				u: Cr(x),
				i: 1,
				o: function(r) {
					return {
						target: "#" + G(r[1], Ar),
						text: r[1]
					};
				},
				l: function(r, n, e) {
					return er("a", {
						key: e.key,
						href: U(r.target, "a", "href")
					}, er("sup", { key: e.key }, r.text));
				}
			}, f[8] = {
				t: ["[ ]", "[x]"],
				u: Cr(S),
				i: 1,
				o: function(r) {
					return { completed: "x" === r[1].toLowerCase() };
				},
				l: function(r, n, e) {
					return er("input", {
						checked: r.completed,
						key: e.key,
						readOnly: !0,
						type: "checkbox"
					});
				}
			}, f[9] = {
				t: ["#"],
				u: Tr(t.enforceAtxHeadings ? $ : z),
				i: 1,
				o: function(r, n, e) {
					return {
						children: Pr(n, r[2], e),
						id: G(r[2], Ar),
						level: r[1].length
					};
				},
				l: function(r, n, e) {
					return er("h" + r.level, {
						id: r.id,
						key: e.key
					}, n(r.children, e));
				}
			}, f[10] = {
				t: function(r) {
					var n = r.indexOf("\n");
					return n > 0 && n < r.length - 1 && ("=" === r[n + 1] || "-" === r[n + 1]);
				},
				u: Tr(E),
				i: 1,
				o: function(r, n, e) {
					return {
						children: Pr(n, r[1], e),
						level: "=" === r[2] ? 1 : 2,
						type: "9"
					};
				}
			}, f[11] = {
				t: ["<"],
				u: Mr(A),
				i: 1,
				o: function(r, n, e) {
					var t = r[3].match(ar), u = RegExp("^" + t[1], "gm"), a = r[3].replace(u, ""), o = W(Q, a) ? Nr : Pr, c = r[1].toLowerCase(), f = -1 !== i.indexOf(c), l = (f ? c : r[1]).trim(), _ = {
						attrs: or(l, r[2]),
						noInnerParse: f,
						tag: l
					};
					if (e.inAnchor = e.inAnchor || "a" === c, f) _.text = r[3];
					else {
						var d = e.inHTML;
						e.inHTML = !0, _.children = o(n, a, e), e.inHTML = d;
					}
					return e.inAnchor = !1, _;
				},
				l: function(r, e, t) {
					return er(r.tag, n({ key: t.key }, r.attrs), r.text || (r.children ? e(r.children, t) : ""));
				}
			}, f[13] = {
				t: ["<"],
				u: Mr(O),
				i: 1,
				o: function(r) {
					var n = r[1].trim();
					return {
						attrs: or(n, r[2] || ""),
						tag: n
					};
				},
				l: function(r, e, t) {
					return er(r.tag, n({}, r.attrs, { key: t.key }));
				}
			}, f[12] = {
				t: ["<!--"],
				u: Mr(B),
				i: 1,
				o: function() {
					return {};
				},
				l: Vr
			}, f[14] = {
				t: ["!["],
				u: Ir(br),
				i: 1,
				o: function(r) {
					return {
						alt: Fr(r[1]),
						target: Fr(r[2]),
						title: Fr(r[3])
					};
				},
				l: function(r, n, e) {
					return er("img", {
						key: e.key,
						alt: r.alt || void 0,
						title: r.title || void 0,
						src: U(r.target, "img", "src")
					});
				}
			}, f[15] = {
				t: ["["],
				u: Cr(qr),
				i: 3,
				o: function(r, n, e) {
					return {
						children: Zr(n, r[1], e),
						target: Fr(r[2]),
						title: Fr(r[3])
					};
				},
				l: function(r, n, e) {
					return er("a", {
						key: e.key,
						href: U(r.target, "a", "href"),
						title: r.title
					}, n(r.children, e));
				}
			}, f[16] = {
				t: ["<"],
				u: Cr(I),
				i: 0,
				o: function(r) {
					var n = r[1], e = !1;
					return -1 !== n.indexOf("@") && -1 === n.indexOf("//") && (e = !0, n = n.replace("mailto:", "")), {
						children: [{
							text: n,
							type: "27"
						}],
						target: e ? "mailto:" + n : n,
						type: "15"
					};
				}
			}, f[17] = {
				t: function(r, n) {
					return !n.inAnchor && !t.disableAutoLink && ($r(r, "http://") || $r(r, "https://"));
				},
				u: Cr(C),
				i: 0,
				o: function(r) {
					return {
						children: [{
							text: r[1],
							type: "27"
						}],
						target: r[1],
						title: void 0,
						type: "15"
					};
				}
			}, f[20] = xr(er, 1), f[33] = xr(er, 2), f[19] = {
				t: ["\n"],
				u: Tr(g),
				i: 3,
				o: Ur,
				l: function() {
					return "\n";
				}
			}, f[21] = {
				u: jr(function(r, n) {
					if (n.inline || n.simple || n.inHTML && -1 === r.indexOf("\n\n") && -1 === n.prevCapture.indexOf("\n\n")) return null;
					for (var e = "", t = 0;;) {
						var u = r.indexOf("\n", t), a = r.slice(t, -1 === u ? void 0 : u + 1);
						if (W(H, a)) break;
						if (e += a, -1 === u || !a.trim()) break;
						t = u + 1;
					}
					var i = zr(e);
					return "" === i ? null : [
						e,
						,
						i
					];
				}),
				i: 3,
				o: Gr,
				l: function(r, n, e) {
					return er("p", { key: e.key }, n(r.children, e));
				}
			}, f[22] = {
				t: ["["],
				u: Cr(D),
				i: 0,
				o: function(r) {
					return fr[r[1]] = {
						target: r[2],
						title: r[4]
					}, {};
				},
				l: Vr
			}, f[23] = {
				t: ["!["],
				u: Ir(F),
				i: 0,
				o: function(r) {
					return {
						alt: r[1] ? Fr(r[1]) : void 0,
						ref: r[2]
					};
				},
				l: function(r, n, e) {
					return fr[r.ref] ? er("img", {
						key: e.key,
						alt: r.alt,
						src: U(fr[r.ref].target, "img", "src"),
						title: fr[r.ref].title
					}) : null;
				}
			}, f[24] = {
				t: function(r) {
					return "[" === r[0] && -1 === r.indexOf("](");
				},
				u: Cr(P),
				i: 0,
				o: function(r, n, e) {
					return {
						children: n(r[1], e),
						fallbackChildren: r[0],
						ref: r[2]
					};
				},
				l: function(r, n, e) {
					return fr[r.ref] ? er("a", {
						key: e.key,
						href: U(fr[r.ref].target, "a", "href"),
						title: fr[r.ref].title
					}, n(r.children, e)) : er("span", { key: e.key }, r.fallbackChildren);
				}
			}, f[25] = {
				t: ["|"],
				u: Tr(M),
				i: 1,
				o: Lr,
				l: function(r, n, e) {
					var t = r;
					return er("table", { key: e.key }, er("thead", null, er("tr", null, t.header.map(function(r, u) {
						return er("th", {
							key: u,
							style: Or(t, u)
						}, n(r, e));
					}))), er("tbody", null, t.cells.map(function(r, u) {
						return er("tr", { key: u }, r.map(function(r, u) {
							return er("td", {
								key: u,
								style: Or(t, u)
							}, n(r, e));
						}));
					})));
				}
			}, f[27] = {
				u: jr(function(r, n) {
					var e;
					return $r(r, ":") && (e = rr.exec(r)), e || tr.exec(r);
				}),
				i: 4,
				o: function(r) {
					var n = r[0];
					return { text: -1 === n.indexOf("&") ? n : n.replace(R, function(r, n) {
						return t.namedCodesToUnicode[n] || r;
					}) };
				},
				l: function(r) {
					return r.text;
				}
			}, f[28] = {
				t: ["**", "__"],
				u: Ir(J),
				i: 2,
				o: function(r, n, e) {
					return { children: n(r[2], e) };
				},
				l: function(r, n, e) {
					return er("strong", { key: e.key }, n(r.children, e));
				}
			}, f[29] = {
				t: function(r) {
					var n = r[0];
					return ("*" === n || "_" === n) && r[1] !== n;
				},
				u: Ir(K),
				i: 3,
				o: function(r, n, e) {
					return { children: n(r[2], e) };
				},
				l: function(r, n, e) {
					return er("em", { key: e.key }, n(r.children, e));
				}
			}, f[30] = {
				t: ["\\"],
				u: Ir(nr),
				i: 1,
				o: function(r) {
					return {
						text: r[1],
						type: "27"
					};
				}
			}, f[31] = {
				t: ["=="],
				u: Ir(X),
				i: 3,
				o: Gr,
				l: function(r, n, e) {
					return er("mark", { key: e.key }, n(r.children, e));
				}
			}, f[32] = {
				t: ["~~"],
				u: Ir(Y),
				i: 3,
				o: Gr,
				l: function(r, n, e) {
					return er("del", { key: e.key }, n(r.children, e));
				}
			}, f);
			!0 === t.disableParsingRawHTML && (delete lr[11], delete lr[13]);
			var _r = function(r) {
				var n = Object.keys(r);
				function e(t, u) {
					var a = [];
					if (u.prevCapture = u.prevCapture || "", t.trim()) for (; t;) for (var i = 0; i < n.length;) {
						var o = n[i], c = r[o];
						if (!c.t || Er(t, u, c.t)) {
							var f = c.u(t, u);
							if (f && f[0]) {
								t = t.substring(f[0].length);
								var l = c.o(f, e, u);
								u.prevCapture += f[0], l.type || (l.type = o), a.push(l);
								break;
							}
							i++;
						} else i++;
					}
					return u.prevCapture = "", a;
				}
				return n.sort(function(n, e) {
					return r[n].i - r[e].i || (n < e ? -1 : 1);
				}), function(r, n) {
					return e(function(r) {
						return r.replace(m, "\n").replace(q, "").replace(N, "    ");
					}(r), n);
				};
			}(lr), dr = function(r, n) {
				return function e(t, u) {
					if (void 0 === u && (u = {}), Array.isArray(t)) {
						for (var a = u.key, i = [], o = !1, c = 0; c < t.length; c++) {
							u.key = c;
							var f = e(t[c], u), l = Sr(f);
							l && o ? i[i.length - 1] += f : null !== f && i.push(f), o = l;
						}
						return u.key = a, i;
					}
					return function(e, t, u) {
						var a = r[e.type].l;
						return n ? n(function() {
							return a(e, t, u);
						}, e, t, u) : a(e, t, u);
					}(t, e, u);
				};
			}(lr, t.renderRule), sr = ir(e);
			return cr.length ? er("div", null, sr, er("footer", { key: "footer" }, cr.map(function(r) {
				return er("div", {
					id: G(r.identifier, Ar),
					key: r.identifier
				}, r.identifier, dr(_r(r.footnote, { inline: !0 })));
			}))) : sr;
		}
		function index_module_default(n) {
			var t = n.children, u = n.options, a = function(r, n) {
				if (null == r) return {};
				var e, t, u = {}, a = Object.keys(r);
				for (t = 0; t < a.length; t++) n.indexOf(e = a[t]) >= 0 || (u[e] = r[e]);
				return u;
			}(n, e);
			return react.cloneElement(Jr(null == t ? "" : t, u), a);
		}
		//#endregion
		//#region \0dsh-mnemon-css:/home/runner/work/dsh-mnemon/dsh-mnemon/src/client/MnemonSidebarView.module.css.mjs
		const css$4 = "._Bh55G_shell._Bh55G_shell{background:var(--dsw-alias-bg-base);font-family:var(--dsw-font-family)}._Bh55G_shell ._Bh55G_masthead{background:var(--dsw-alias-bg-base);border-bottom:0;align-items:center;gap:12px;min-height:50px;padding:10px 16px 6px;display:flex}._Bh55G_shell ._Bh55G_brand{flex:auto;gap:8px;overflow:hidden}._Bh55G_shell ._Bh55G_brand h1{letter-spacing:0;flex:none;margin:0;font-size:16px;font-weight:700;line-height:24px}._Bh55G_shell [class*=storageMode]{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);gap:5px;min-width:96px;min-height:32px;padding:0 9px}._Bh55G_shell [class*=storageMode]>span{color:var(--dsw-alias-label-tertiary);font-size:11px}._Bh55G_shell [class*=storageMode]>strong{color:var(--dsw-alias-label-primary);font-size:12px}._Bh55G_shell ._Bh55G_headerActions{flex:0 auto;gap:6px}._Bh55G_shell ._Bh55G_workspacePicker{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:8px;flex:0 auto;gap:7px;min-height:32px;padding-left:9px}._Bh55G_shell ._Bh55G_workspacePicker>span{color:var(--dsw-alias-label-tertiary);font-size:11px;display:block}._Bh55G_shell ._Bh55G_workspacePicker select{border:0;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-input-major);border-radius:0 7px 7px 0;width:min(190px,20vw);height:30px;padding:0 28px 0 10px;font-size:13px}._Bh55G_shell ._Bh55G_statusCluster{background:0 0;border:0;border-radius:8px;gap:7px;min-height:30px;padding:0 2px 0 8px;font-size:12px}._Bh55G_shell ._Bh55G_statusCluster>span:not([class*=statusDot]){min-width:56px}._Bh55G_shell ._Bh55G_workspaceMismatch{border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 34%, var(--dsw-alias-border-l1));background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, var(--dsw-alias-bg-layer-1));white-space:nowrap;border-radius:8px;flex:none;justify-content:flex-start;gap:6px;min-height:32px;margin:0;padding:0 3px 0 9px}._Bh55G_shell ._Bh55G_workspaceMismatch>span{color:var(--dsw-alias-label-secondary);font-size:11px}._Bh55G_shell ._Bh55G_workspaceMismatch>button{border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 55%, var(--dsw-alias-border-l2));min-height:26px;color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-base);cursor:pointer;border-radius:6px;padding:0 8px;font-size:11px}._Bh55G_shell ._Bh55G_workspaceMismatch>button:hover{background:var(--dsw-alias-interactive-bg-hover)}._Bh55G_shell ._Bh55G_topNavigation{background:var(--dsw-alias-bg-base);border-bottom:0;gap:0;min-height:0;padding:0 16px}._Bh55G_shell ._Bh55G_topNavigation:after{display:none}._Bh55G_shell ._Bh55G_nav{border-bottom:1px solid var(--dsw-alias-border-l1);flex:1;gap:2px;padding-right:0}._Bh55G_shell ._Bh55G_nav button{border-bottom:2px solid #0000;border-radius:6px 6px 0 0;gap:0;min-height:0;padding:7px 14px;font-size:13px;font-weight:400}._Bh55G_shell ._Bh55G_nav button:hover{background:var(--dsw-alias-interactive-bg-hover)}._Bh55G_shell ._Bh55G_nav button[data-active]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-state-business-primary);font-weight:600}._Bh55G_shell ._Bh55G_memoryWorkspace{border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);flex:none;padding:12px 16px 0}._Bh55G_shell ._Bh55G_memoryWorkspace>[class*=pageHeader]{margin-bottom:8px}._Bh55G_shell ._Bh55G_memoryNavigation{flex:none;align-items:flex-end;gap:12px;min-width:0;padding:0;display:flex}._Bh55G_shell ._Bh55G_memoryTabs{scrollbar-width:none;flex:1;gap:2px;min-width:0;display:flex;overflow-x:auto}._Bh55G_shell ._Bh55G_memoryTabs::-webkit-scrollbar{display:none}._Bh55G_shell ._Bh55G_memoryTabs button{min-width:max-content;min-height:0;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-bottom:2px solid #0000;border-radius:6px 6px 0 0;padding:6px 12px;font-size:13px}._Bh55G_shell ._Bh55G_memoryTabs button:hover{background:var(--dsw-alias-interactive-bg-hover)}._Bh55G_shell ._Bh55G_memoryTabs button[data-active]{border-bottom-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary);font-weight:600}._Bh55G_shell ._Bh55G_memoryWriteButton{flex:none}._Bh55G_shell ._Bh55G_modalBackdrop{z-index:1300;overscroll-behavior:contain;background:var(--dsw-alias-bg-mask-1);justify-content:center;align-items:center;padding:24px;display:flex;position:fixed;inset:0}._Bh55G_shell ._Bh55G_modal{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);width:min(680px,100vw - 48px);min-height:0;max-height:calc(100vh - 48px);box-shadow:var(--dsw-shadow-lv3);border-radius:14px;flex-direction:column;display:flex;overflow:hidden}._Bh55G_shell ._Bh55G_modal._Bh55G_modalWide{width:min(780px,100vw - 48px)}._Bh55G_shell ._Bh55G_modal>header{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;justify-content:space-between;align-items:flex-start;gap:18px;padding:15px 18px;display:flex}._Bh55G_shell ._Bh55G_modal>header h2{margin:0;font-size:15px;line-height:22px}._Bh55G_shell ._Bh55G_modal>header p{max-width:64ch;color:var(--dsw-alias-label-secondary);margin:3px 0 0;font-size:12px;line-height:1.5}._Bh55G_shell ._Bh55G_modal>[class*=modalBody]{overscroll-behavior:contain;scrollbar-gutter:stable;touch-action:pan-y;-webkit-overflow-scrolling:touch;min-height:0;padding:18px;overflow:hidden auto}._Bh55G_shell ._Bh55G_modal>[class*=modalFooter]{border-top-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}@supports (height:100dvh){._Bh55G_shell ._Bh55G_modal{max-height:calc(100dvh - 48px)}}._Bh55G_shell ._Bh55G_modal form[class*=runtimeComposer],._Bh55G_shell ._Bh55G_modal form[class*=documentEditor]{background:0 0;border:0;border-radius:0;margin:0;padding:0}._Bh55G_shell ._Bh55G_modal form[class*=runtimeComposer]>[class*=runtimeComposerHeading],._Bh55G_shell ._Bh55G_modal form[class*=documentEditor]>header{display:none}._Bh55G_shell ._Bh55G_modal section[class*=supervisedComposer]{overflow:visible}._Bh55G_shell ._Bh55G_modal form[class*=supervisedForm]{padding:0}._Bh55G_shell ._Bh55G_modal [class*=supervisedHeading]{margin-bottom:10px}._Bh55G_shell ._Bh55G_modal [class*=supervisedHeading] h3{display:none}._Bh55G_shell ._Bh55G_modal [class*=formActions]{justify-content:flex-end}._Bh55G_shell ._Bh55G_modal details[class*=advancedWrite]{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;margin-top:14px;overflow:hidden}._Bh55G_shell [class*=primaryButton]{min-height:32px;color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);white-space:nowrap;border:0;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600}._Bh55G_shell [class*=primaryButton]:hover:not(:disabled){filter:none;background:var(--dsw-alias-button-info-hover)}._Bh55G_shell [class*=secondaryButton],._Bh55G_shell [class*=ghostButton]{border:1px solid var(--dsw-alias-border-l2);min-height:32px;color:var(--dsw-alias-label-primary);white-space:nowrap;background:0 0;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:400}._Bh55G_shell [class*=secondaryButton]:hover:not(:disabled),._Bh55G_shell [class*=ghostButton]:hover:not(:disabled){filter:none;background:var(--dsw-alias-interactive-bg-hover)}._Bh55G_shell [class*=dangerButton]{min-height:0;color:var(--dsw-alias-state-error-primary);white-space:nowrap;background:0 0;border:0;border-radius:0;padding:0;font-size:12px;font-weight:400}._Bh55G_shell [class*=dangerButton]:hover:not(:disabled){filter:none;background:0 0;text-decoration:underline}._Bh55G_shell [class*=dangerSolidButton]{color:#fff;background:var(--dsw-alias-state-error-primary);white-space:nowrap;border:0;border-radius:8px;min-height:32px;padding:6px 14px;font-size:13px;font-weight:600}._Bh55G_shell [class*=dangerSolidButton]:hover:not(:disabled){filter:brightness(1.08)}._Bh55G_shell [class*=iconButton],._Bh55G_shell [class*=bodyEditButton],._Bh55G_shell [class*=inspectorEye],._Bh55G_shell [class*=inspectorHeading] button,._Bh55G_shell [class*=sectionHeading] button{width:26px;height:26px;min-height:0;color:var(--dsw-alias-label-secondary);background:0 0;border:0;border-radius:6px;justify-content:center;align-items:center;padding:0;font-size:13px;display:inline-flex}._Bh55G_shell [class*=iconButton]:hover:not(:disabled),._Bh55G_shell [class*=bodyEditButton]:hover:not(:disabled),._Bh55G_shell [class*=inspectorEye]:hover:not(:disabled),._Bh55G_shell [class*=inspectorHeading] button:hover:not(:disabled),._Bh55G_shell [class*=sectionHeading] button:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:0}._Bh55G_shell [class*=primaryButton],._Bh55G_shell [class*=secondaryButton],._Bh55G_shell [class*=ghostButton],._Bh55G_shell [class*=dangerButton],._Bh55G_shell [class*=dangerSolidButton],._Bh55G_shell [class*=iconButton],._Bh55G_shell [class*=bodyEditButton],._Bh55G_shell [class*=inspectorEye],._Bh55G_shell [class*=inspectorHeading] button,._Bh55G_shell [class*=sectionHeading] button{cursor:pointer;transition:background-color .12s,color .12s,border-color .12s,outline-color .12s,box-shadow .12s,transform .12s}._Bh55G_shell [class*=primaryButton]:active:not(:disabled),._Bh55G_shell [class*=secondaryButton]:active:not(:disabled),._Bh55G_shell [class*=ghostButton]:active:not(:disabled),._Bh55G_shell [class*=dangerButton]:active:not(:disabled),._Bh55G_shell [class*=dangerSolidButton]:active:not(:disabled),._Bh55G_shell [class*=iconButton]:active:not(:disabled),._Bh55G_shell [class*=bodyEditButton]:active:not(:disabled),._Bh55G_shell [class*=inspectorEye]:active:not(:disabled),._Bh55G_shell [class*=inspectorHeading] button:active:not(:disabled),._Bh55G_shell [class*=sectionHeading] button:active:not(:disabled){transform:translateY(1px)}._Bh55G_shell [class*=primaryButton]:disabled,._Bh55G_shell [class*=secondaryButton]:disabled,._Bh55G_shell [class*=ghostButton]:disabled,._Bh55G_shell [class*=dangerButton]:disabled,._Bh55G_shell [class*=dangerSolidButton]:disabled,._Bh55G_shell [class*=iconButton]:disabled,._Bh55G_shell [class*=bodyEditButton]:disabled,._Bh55G_shell [class*=inspectorEye]:disabled{cursor:default;opacity:.45}._Bh55G_shell ._Bh55G_canvas{background:var(--dsw-alias-bg-base)}._Bh55G_shell button,._Bh55G_shell input,._Bh55G_shell select,._Bh55G_shell textarea{font-family:var(--dsw-font-family)}._Bh55G_shell button:focus-visible,._Bh55G_shell input:focus-visible,._Bh55G_shell select:focus-visible,._Bh55G_shell textarea:focus-visible,._Bh55G_shell summary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}._Bh55G_shell ._Bh55G_canvas>div{width:100%;padding:14px 16px clamp(96px,14vh,150px)}._Bh55G_shell ._Bh55G_pageHeader{margin-bottom:12px}._Bh55G_shell ._Bh55G_pageHeader h2{letter-spacing:0;margin-top:0;font-size:16px;line-height:1.35}._Bh55G_shell ._Bh55G_pageHeader p{font-size:13px;line-height:1.55}._Bh55G_shell ._Bh55G_canvas[data-lock-page-header] [class*=pageHeader]{z-index:12;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);margin:-14px -16px 12px;padding:14px 16px 10px;position:sticky;top:0}._Bh55G_shell input,._Bh55G_shell select,._Bh55G_shell textarea{font-family:var(--dsw-font-family);font-size:13px;font-weight:400}._Bh55G_shell [class*=bodyEdit] label,._Bh55G_shell [class*=runtimeComposerActions] label,._Bh55G_shell [class*=documentEditor] label,._Bh55G_shell [class*=searchControls] label,._Bh55G_shell [class*=formGrid] label,._Bh55G_shell [class*=fieldWide]{color:var(--dsw-alias-label-secondary);gap:5px;font-size:12px;font-weight:500}._Bh55G_shell [class*=bodyEdit] input,._Bh55G_shell [class*=bodyEdit] select,._Bh55G_shell [class*=bodyEdit] textarea,._Bh55G_shell [class*=runtimeComposer]>textarea,._Bh55G_shell [class*=runtimeComposerActions] select,._Bh55G_shell [class*=runtimeEntry] select,._Bh55G_shell [class*=documentEditor] input,._Bh55G_shell [class*=documentEditor] textarea,._Bh55G_shell [class*=searchControls] select,._Bh55G_shell [class*=formGrid] select,._Bh55G_shell [class*=formGrid] input,._Bh55G_shell [class*=listToolbar] input,._Bh55G_shell [class*=listToolbar] select,._Bh55G_shell [class*=entitySearch] input,._Bh55G_shell [class*=bodyCreate] input{border:1px solid var(--dsw-alias-border-l2);min-height:34px;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border-radius:8px;padding:7px 10px;font-size:13px;font-weight:400}._Bh55G_shell select{cursor:pointer;font-weight:400}._Bh55G_shell textarea{font-weight:400;line-height:1.55}._Bh55G_shell [class*=cardKicker],._Bh55G_shell [class*=sectionHeading]>div>span,._Bh55G_shell [class*=entityHeading]>span,._Bh55G_shell [class*=inspectorHeading]>span{letter-spacing:.06em;font-size:11px}._Bh55G_shell [class*=bodyDirectoryHeader] p,._Bh55G_shell [class*=bodyCard]>p,._Bh55G_shell [class*=graphToolbar],._Bh55G_shell [class*=graphFooter],._Bh55G_shell [class*=runtimeTargetDescription],._Bh55G_shell [class*=documentList]>button p,._Bh55G_shell [class*=documentDetail]>header p,._Bh55G_shell [class*=documentArchiveReceipt] p,._Bh55G_shell [class*=healthStrip] p,._Bh55G_shell [class*=storageAreaGrid] article>p,._Bh55G_shell [class*=statusSectionHeader] p,._Bh55G_shell [class*=writeGuide] li span,._Bh55G_shell [class*=writeGuide]>p,._Bh55G_shell [class*=manualActions] p{font-size:12px}._Bh55G_shell [class*=bodyDirectoryPath],._Bh55G_shell [class*=bodyCard] footer,._Bh55G_shell [class*=bodyHealth],._Bh55G_shell [class*=badge],._Bh55G_shell [class*=entities] span,._Bh55G_shell [class*=runtimeEntryMeta]>span,._Bh55G_shell [class*=runtimeEntryBadges]>span,._Bh55G_shell [class*=runtimeEntryMeta] time,._Bh55G_shell [class*=runtimeFootnote],._Bh55G_shell [class*=documentSummary] article>span,._Bh55G_shell [class*=documentSummary] article>small,._Bh55G_shell [class*=documentList]>header,._Bh55G_shell [class*=documentList]>button time,._Bh55G_shell [class*=documentList]>button footer,._Bh55G_shell [class*=documentDetail] dt,._Bh55G_shell [class*=documentSources]>span,._Bh55G_shell [class*=storageRoot] span,._Bh55G_shell [class*=storageRoot] small,._Bh55G_shell [class*=storageAreaMetric] span,._Bh55G_shell [class*=storageAreaMetric] code,._Bh55G_shell [class*=storagePath],._Bh55G_shell [class*=storageAreaGrid] article>small,._Bh55G_shell [class*=storageFootnote]{font-size:11px}._Bh55G_shell [class*=bodySwitch],._Bh55G_shell [class*=graphCanvasControls] button,._Bh55G_shell [class*=documentToolbar]>div button,._Bh55G_shell [class*=documentDetail] dd,._Bh55G_shell [class*=documentDanger] p,._Bh55G_shell [class*=advancedWrite] summary small{font-size:12px}._Bh55G_shell [class*=documentList]>button strong,._Bh55G_shell [class*=runtimeEntry]>p,._Bh55G_shell [class*=inspectorMeta] dd{font-size:13px}._Bh55G_shell [class*=runtimeEntryBadges]>span{border:1px solid var(--dsw-alias-border-l1);min-height:22px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border-radius:999px;align-items:center;padding:0 8px;font-size:11px;font-weight:400;line-height:20px;display:inline-flex}._Bh55G_shell [class*=runtimeEntryBadges]>[class*=runtimeEntryTarget]{border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, var(--dsw-alias-border-l1));color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-layer-1));font-family:var(--dsw-font-family);font-weight:500}._Bh55G_shell [class*=runtimeEntry][data-importance=critical] [class*=runtimeEntryBadges]>span:last-child{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 24%, var(--dsw-alias-border-l1));color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 6%, var(--dsw-alias-bg-layer-1))}._Bh55G_shell [class*=listProgress],._Bh55G_shell [class*=compactListProgress]{color:var(--dsw-alias-label-tertiary);font-size:12px}._Bh55G_shell [class*=documentWorkspace]{align-items:stretch;height:clamp(520px,100dvh - 220px,760px);min-height:520px}._Bh55G_shell [class*=documentList],._Bh55G_shell [class*=documentReader]{overscroll-behavior:contain;scrollbar-gutter:stable;min-height:0;overflow-y:auto}._Bh55G_shell [class*=bodyGrid]{grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))}._Bh55G_shell article[class*=bodyCard]{border-color:var(--mn-line);background:linear-gradient(90deg, color-mix(in srgb, var(--mn-provider-color) 5%, var(--mn-layer-1)), var(--mn-layer-1) 34%);height:100%;box-shadow:inset 3px 0 0 color-mix(in srgb, var(--mn-provider-color) 68%, transparent);border-radius:8px;flex-direction:column;padding:11px 11px 11px 14px;display:flex}._Bh55G_shell article[class*=bodyCard][data-active]{border-color:var(--mn-line);box-shadow:inset 3px 0 0 color-mix(in srgb, var(--mn-provider-color) 78%, transparent)}._Bh55G_shell ._Bh55G_bodyCardHeader{justify-content:space-between;align-items:flex-start;gap:12px;min-width:0;display:flex}._Bh55G_shell ._Bh55G_bodyDirectoryActions{flex:none;align-items:center;gap:8px;display:flex}._Bh55G_shell ._Bh55G_bodyDirectoryActions>strong{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);white-space:nowrap;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:600}._Bh55G_shell ._Bh55G_bodyCardIdentity{flex:1;align-items:flex-start;gap:8px;min-width:0;display:flex}._Bh55G_shell ._Bh55G_bodyCardIdentity>[class*=bodySignal]{flex:none;width:6px;height:6px;margin-top:7px}._Bh55G_shell article[class*=bodyCard][data-reconnecting] ._Bh55G_bodyCardIdentity>[class*=bodySignal]{width:6px;height:6px}._Bh55G_shell ._Bh55G_bodyCardIdentity>div{flex:1;gap:2px;min-width:0;display:grid}._Bh55G_shell ._Bh55G_bodyCardIdentity strong{text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;overflow:hidden}._Bh55G_shell ._Bh55G_bodyCardMeta{align-items:center;gap:8px;min-width:0;display:flex}._Bh55G_shell ._Bh55G_bodyCardMeta code{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;overflow:hidden}._Bh55G_shell ._Bh55G_bodyCardMeta [class*=bodyHealth]{letter-spacing:0;flex:none;font-size:11px}._Bh55G_shell ._Bh55G_bodyCardHeader>[class*=bodySwitch]{flex:none;min-height:24px}._Bh55G_shell article[class*=bodyCard]>p{-webkit-line-clamp:4;-webkit-box-orient:vertical;min-height:6.2em;max-height:6.2em;margin:12px 0;line-height:1.55;display:-webkit-box;overflow:hidden}._Bh55G_shell ._Bh55G_bodyCardFooter{white-space:nowrap;grid-template-columns:minmax(0,1fr) max-content;align-items:center;gap:10px;min-width:0;margin-top:auto;padding-top:9px;display:grid}._Bh55G_shell ._Bh55G_bodyCardStats{flex-wrap:nowrap;align-items:center;gap:10px;min-width:0;display:flex;overflow:hidden}._Bh55G_shell ._Bh55G_bodyCardFooter [class*=bodyCardActions]{flex-wrap:nowrap;flex:none;align-items:center;gap:6px;display:flex}._Bh55G_shell ._Bh55G_itemActionButton{border:1px solid;border-radius:7px;min-height:28px;padding:4px 9px;font-size:12px;line-height:18px}._Bh55G_shell [class*=runtimeEntry] footer,._Bh55G_shell [class*=cardActions]{gap:6px}._Bh55G_shell ._Bh55G_itemEditAction{color:var(--dsw-alias-state-business-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 38%, var(--dsw-alias-border-l2));background:0 0}._Bh55G_shell ._Bh55G_itemEditAction:hover:not(:disabled){color:var(--dsw-alias-state-business-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 58%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent)}._Bh55G_shell ._Bh55G_itemDangerAction{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 34%, var(--dsw-alias-border-l2));background:0 0;padding:4px 9px}._Bh55G_shell ._Bh55G_itemDangerAction:hover:not(:disabled){border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 54%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);text-decoration:none}._Bh55G_shell [class*=bodyDeleteConfirm]>p{font-size:13px}._Bh55G_shell [class*=pageHeaderMeta]>code{text-align:center;font-variant-numeric:tabular-nums;min-width:72px;font-size:11px}._Bh55G_shell ._Bh55G_inspectorGlyph{border:1px solid var(--dsw-alias-border-l1);width:44px;height:44px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-1);font:20px/1 var(--mn-code);opacity:1;border-radius:10px;place-items:center;margin-bottom:10px;display:grid}@media (width<=760px){._Bh55G_shell ._Bh55G_masthead{min-height:48px;padding:8px 12px 4px}._Bh55G_shell ._Bh55G_headerActions{max-width:none}._Bh55G_shell ._Bh55G_statusCluster>span:not([class*=statusDot]){display:inline}._Bh55G_shell [class*=storageMode]{min-width:0}._Bh55G_shell [class*=storageMode]>span,._Bh55G_shell ._Bh55G_workspacePicker>span,._Bh55G_shell ._Bh55G_workspaceMismatch>span{display:none}._Bh55G_shell ._Bh55G_workspacePicker{gap:0;padding-left:0}._Bh55G_shell ._Bh55G_workspacePicker select{border-left:0;width:min(160px,31vw)}._Bh55G_shell ._Bh55G_topNavigation{padding:0 12px}._Bh55G_shell ._Bh55G_memoryNavigation{padding-inline:12px}._Bh55G_shell ._Bh55G_memoryTabs button{padding-inline:10px}._Bh55G_shell ._Bh55G_nav button{text-align:left;flex-direction:row;min-width:max-content;padding:7px 12px}._Bh55G_shell ._Bh55G_canvas>div{padding:14px 12px calc(170px + env(safe-area-inset-bottom,0px))}._Bh55G_shell ._Bh55G_canvas[data-lock-page-header] [class*=pageHeader]{margin-inline:-12px;padding-inline:12px}._Bh55G_shell ._Bh55G_modalBackdrop{padding:max(10px, env(safe-area-inset-top,0px)) 0 0;align-items:flex-end}._Bh55G_shell ._Bh55G_modal,._Bh55G_shell ._Bh55G_modal._Bh55G_modalWide{width:100vw;max-height:calc(100vh - max(10px, env(safe-area-inset-top,0px)));border-bottom:0;border-radius:18px 18px 0 0}._Bh55G_shell ._Bh55G_modalDragHandle span{background:var(--dsw-alias-border-l2)}._Bh55G_shell ._Bh55G_modal>header{padding:10px max(14px, env(safe-area-inset-right,0px)) 12px max(14px, env(safe-area-inset-left,0px));gap:12px}._Bh55G_shell ._Bh55G_modal>header p{-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}._Bh55G_shell ._Bh55G_modal>header [class*=iconButton]{width:44px;min-width:44px;height:44px;min-height:44px}._Bh55G_shell ._Bh55G_modal>[class*=modalBody]{padding:14px max(14px, env(safe-area-inset-right,0px)) 18px max(14px, env(safe-area-inset-left,0px));scrollbar-gutter:auto}._Bh55G_shell ._Bh55G_modal>[class*=modalBody] button{min-height:44px}._Bh55G_shell ._Bh55G_modal>[class*=modalFooter]{padding:10px max(14px, env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(14px, env(safe-area-inset-left,0px))}._Bh55G_shell ._Bh55G_modal>[class*=modalFooter] [class*=modalFooterActions] button{min-height:44px;padding-block:8px}._Bh55G_shell [class*=documentWorkspace]{height:auto;min-height:0}._Bh55G_shell [class*=documentList]{scrollbar-gutter:auto;overflow-y:auto}._Bh55G_shell [class*=documentReader]{scrollbar-gutter:auto;overflow:visible}}@media (width>=761px) and (height<=560px){._Bh55G_shell ._Bh55G_modalBackdrop{padding:8px}._Bh55G_shell ._Bh55G_modal{max-height:calc(100vh - 16px)}}@supports (height:100dvh){@media (width<=760px){._Bh55G_shell ._Bh55G_modal,._Bh55G_shell ._Bh55G_modal._Bh55G_modalWide{max-height:calc(100dvh - max(10px, env(safe-area-inset-top,0px)))}}@media (width>=761px) and (height<=560px){._Bh55G_shell ._Bh55G_modal{max-height:calc(100dvh - 16px)}}}@media (width<=520px){._Bh55G_shell ._Bh55G_masthead{min-height:46px}._Bh55G_shell ._Bh55G_brand h1{font-size:16px}._Bh55G_shell ._Bh55G_headerActions{max-width:62vw}._Bh55G_shell [class*=storageMode]{padding-inline:7px}._Bh55G_shell ._Bh55G_workspacePicker select{width:min(118px,30vw);padding-left:8px}._Bh55G_shell ._Bh55G_workspaceMismatch>button{padding-inline:6px}._Bh55G_shell ._Bh55G_statusCluster [class*=iconButton]{display:none}}@media (height<=420px){._Bh55G_shell ._Bh55G_modal>header p{white-space:nowrap;text-overflow:ellipsis;display:block;overflow:hidden}}@media (pointer:coarse){._Bh55G_shell ._Bh55G_modal>header [class*=iconButton]{width:44px;min-width:44px;height:44px;min-height:44px}._Bh55G_shell ._Bh55G_modal>[class*=modalBody] button,._Bh55G_shell ._Bh55G_modal>[class*=modalFooter] button{min-height:44px}}@media (prefers-reduced-motion:reduce){._Bh55G_shell [class*=primaryButton],._Bh55G_shell [class*=secondaryButton],._Bh55G_shell [class*=ghostButton],._Bh55G_shell [class*=dangerButton],._Bh55G_shell [class*=dangerSolidButton],._Bh55G_shell [class*=iconButton],._Bh55G_shell [class*=bodyEditButton],._Bh55G_shell [class*=inspectorEye],._Bh55G_shell [class*=inspectorHeading] button,._Bh55G_shell [class*=sectionHeading] button{transition:none}}";
		const tagId$4 = "dsh-mnemon/src/client/MnemonSidebarView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$4) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-mnemon";
			tag.dataset.pluginCss = tagId$4;
			tag.textContent = css$4;
			document.head.appendChild(tag);
		}
		var MnemonSidebarView_module_css_default = {
			"bodyCardFooter": "_Bh55G_bodyCardFooter",
			"bodyCardHeader": "_Bh55G_bodyCardHeader",
			"bodyCardIdentity": "_Bh55G_bodyCardIdentity",
			"bodyCardMeta": "_Bh55G_bodyCardMeta",
			"bodyCardStats": "_Bh55G_bodyCardStats",
			"bodyDirectoryActions": "_Bh55G_bodyDirectoryActions",
			"brand": "_Bh55G_brand",
			"canvas": "_Bh55G_canvas",
			"headerActions": "_Bh55G_headerActions",
			"inspectorGlyph": "_Bh55G_inspectorGlyph",
			"itemActionButton": "_Bh55G_itemActionButton",
			"itemDangerAction": "_Bh55G_itemDangerAction",
			"itemEditAction": "_Bh55G_itemEditAction",
			"masthead": "_Bh55G_masthead",
			"memoryNavigation": "_Bh55G_memoryNavigation",
			"memoryTabs": "_Bh55G_memoryTabs",
			"memoryWorkspace": "_Bh55G_memoryWorkspace",
			"memoryWriteButton": "_Bh55G_memoryWriteButton",
			"modal": "_Bh55G_modal",
			"modalBackdrop": "_Bh55G_modalBackdrop",
			"modalDragHandle": "_Bh55G_modalDragHandle",
			"modalWide": "_Bh55G_modalWide",
			"nav": "_Bh55G_nav",
			"pageHeader": "_Bh55G_pageHeader",
			"shell": "_Bh55G_shell",
			"statusCluster": "_Bh55G_statusCluster",
			"topNavigation": "_Bh55G_topNavigation",
			"workspaceMismatch": "_Bh55G_workspaceMismatch",
			"workspacePicker": "_Bh55G_workspacePicker"
		};
		//#endregion
		//#region src/client/MnemonViewAppearance.tsx
		const buildinAppearance = {
			surface: "buildin",
			title: "Mnemon",
			showLogo: true,
			showTelemetry: true,
			showNavigationGlyphs: true,
			showNavigationDetails: true,
			showNavigationDividers: true,
			showSpaceSummary: true,
			classes: {}
		};
		/** Appearance is a surface concern; every data flow and workspace action stays shared. */
		function resolveMnemonViewAppearance(surface, t) {
			if (surface === "buildin") return buildinAppearance;
			return {
				surface: "sidebar",
				title: t("tab.label"),
				showLogo: false,
				showTelemetry: false,
				showNavigationGlyphs: false,
				showNavigationDetails: false,
				showNavigationDividers: false,
				showSpaceSummary: false,
				classes: {
					shell: MnemonSidebarView_module_css_default.shell,
					masthead: MnemonSidebarView_module_css_default.masthead,
					brand: MnemonSidebarView_module_css_default.brand,
					headerActions: MnemonSidebarView_module_css_default.headerActions,
					workspacePicker: MnemonSidebarView_module_css_default.workspacePicker,
					statusCluster: MnemonSidebarView_module_css_default.statusCluster,
					workspaceMismatch: MnemonSidebarView_module_css_default.workspaceMismatch,
					topNavigation: MnemonSidebarView_module_css_default.topNavigation,
					nav: MnemonSidebarView_module_css_default.nav,
					navGroup: MnemonSidebarView_module_css_default.navGroup,
					memoryWorkspace: MnemonSidebarView_module_css_default.memoryWorkspace,
					memoryNavigation: MnemonSidebarView_module_css_default.memoryNavigation,
					memoryTabs: MnemonSidebarView_module_css_default.memoryTabs,
					memoryWriteButton: MnemonSidebarView_module_css_default.memoryWriteButton,
					bodyCardHeader: MnemonSidebarView_module_css_default.bodyCardHeader,
					bodyDirectoryActions: MnemonSidebarView_module_css_default.bodyDirectoryActions,
					bodyCardIdentity: MnemonSidebarView_module_css_default.bodyCardIdentity,
					bodyCardMeta: MnemonSidebarView_module_css_default.bodyCardMeta,
					bodyCardFooter: MnemonSidebarView_module_css_default.bodyCardFooter,
					bodyCardStats: MnemonSidebarView_module_css_default.bodyCardStats,
					itemActionButton: MnemonSidebarView_module_css_default.itemActionButton,
					itemEditAction: MnemonSidebarView_module_css_default.itemEditAction,
					itemDangerAction: MnemonSidebarView_module_css_default.itemDangerAction,
					modalBackdrop: MnemonSidebarView_module_css_default.modalBackdrop,
					modal: MnemonSidebarView_module_css_default.modal,
					canvas: MnemonSidebarView_module_css_default.canvas,
					pageHeader: MnemonSidebarView_module_css_default.pageHeader,
					inspectorGlyph: MnemonSidebarView_module_css_default.inspectorGlyph
				}
			};
		}
		const AppearanceContext = (0, react.createContext)(buildinAppearance);
		const MnemonViewAppearanceProvider = AppearanceContext.Provider;
		function useMnemonViewAppearance() {
			return (0, react.useContext)(AppearanceContext);
		}
		function appearanceClass(base, variant) {
			return [base, variant].filter((value) => value !== void 0 && value !== "").join(" ");
		}
		//#endregion
		//#region \0dsh-mnemon-css:/home/runner/work/dsh-mnemon/dsh-mnemon/src/client/MnemonView.module.css.mjs
		const css$3 = ".IIa07q_shell{--mn-bg:var(--dsw-alias-bg-base);--mn-layer-1:var(--dsw-alias-bg-layer-1);--mn-layer-2:var(--dsw-alias-bg-layer-2);--mn-input:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-2));--mn-text:var(--dsw-alias-label-primary);--mn-muted:var(--dsw-alias-label-secondary);--mn-faint:var(--dsw-alias-label-tertiary);--mn-line:var(--dsw-alias-border-l1);--mn-line-strong:var(--dsw-alias-border-l2);--mn-accent:var(--dsw-alias-state-business-primary);--mn-hover:var(--dsw-alias-interactive-bg-hover);--mn-danger:var(--dsw-alias-state-error-primary);--mn-success:var(--dsw-alias-state-success-primary);--mn-priority:#9a6a18;--mn-code:var(--ds-font-family-code,\"SFMono-Regular\", Consolas, monospace);--mn-sans:var(--dsw-font-family,-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif);box-sizing:border-box;min-width:0;height:100%;min-height:0;color:var(--mn-text);background:var(--mn-bg);font:13px/1.55 var(--mn-sans);-webkit-tap-highlight-color:transparent;flex-direction:column;display:flex;overflow:hidden}.IIa07q_shell *,.IIa07q_shell :before,.IIa07q_shell :after{box-sizing:border-box}.IIa07q_shell button,.IIa07q_shell input,.IIa07q_shell select,.IIa07q_shell textarea{color:inherit;font:inherit}.IIa07q_shell button,.IIa07q_shell select{touch-action:manipulation}.IIa07q_shell button:focus-visible,.IIa07q_shell input:focus-visible,.IIa07q_shell select:focus-visible,.IIa07q_shell textarea:focus-visible,.IIa07q_shell summary:focus-visible,.IIa07q_shell [role=button]:focus-visible{outline:2px solid var(--mn-accent);outline-offset:2px}.IIa07q_masthead{border-bottom:1px solid var(--mn-line);background:var(--mn-bg);flex:none;grid-template-columns:minmax(220px,1fr) auto auto;align-items:center;gap:clamp(12px,2vw,24px);min-height:56px;padding:8px 16px;display:grid}.IIa07q_backButton{flex:none;align-items:center;gap:4px;min-width:max-content;display:inline-flex}.IIa07q_backButton>svg{flex:none}.IIa07q_brand{align-items:center;gap:11px;min-width:0;display:flex}.IIa07q_brandLogo{width:32px;height:32px;box-shadow:0 0 0 1px var(--mn-line);border-radius:8px;flex:none;overflow:hidden}.IIa07q_brand h1{letter-spacing:-.02em;margin:1px 0 0;font-size:16px;line-height:1.15}.IIa07q_storageMode{border:1px solid var(--mn-line-strong);min-height:32px;color:var(--mn-muted);background:var(--mn-layer-1);white-space:nowrap;border-radius:8px;flex:none;align-items:center;gap:6px;padding:0 9px;display:flex}.IIa07q_storageMode>span{font-size:10px}.IIa07q_storageMode>strong{color:var(--mn-text);font-size:11px;font-weight:600}.IIa07q_cardKicker,.IIa07q_sectionHeading>div>span,.IIa07q_entityHeading>span,.IIa07q_inspectorHeading>span{color:var(--mn-faint);font:650 9px/1.2 var(--mn-code);letter-spacing:.12em;text-transform:uppercase}.IIa07q_statusCluster{border:1px solid var(--mn-line-strong);min-height:34px;color:var(--mn-muted);background:var(--mn-layer-1);border-radius:9px;flex:none;align-items:center;gap:8px;padding:0 4px 0 11px;font-size:11px;display:flex}.IIa07q_statusDot{border-radius:50%;width:6px;height:6px}.IIa07q_online{background:var(--mn-success);box-shadow:0 0 0 3px color-mix(in srgb, var(--mn-success) 15%, transparent)}.IIa07q_offline{background:var(--mn-danger);box-shadow:0 0 0 3px color-mix(in srgb, var(--mn-danger) 14%, transparent)}.IIa07q_checking{background:var(--mn-faint);box-shadow:0 0 0 3px color-mix(in srgb, var(--mn-faint) 12%, transparent)}.IIa07q_iconButton{width:32px;height:32px;color:inherit;cursor:pointer;background:0 0;border:0;border-radius:7px;place-items:center;display:grid}.IIa07q_iconButton:hover{color:var(--mn-accent);background:var(--mn-hover)}.IIa07q_headerActions{justify-content:flex-end;align-items:center;gap:8px;min-width:0;display:flex}.IIa07q_workspacePicker{min-width:0;color:var(--mn-faint);align-items:center;gap:7px;font-size:10px;display:flex}.IIa07q_workspacePicker>span{white-space:nowrap}.IIa07q_workspacePicker select{border:1px solid var(--mn-line-strong);width:min(190px,22vw);min-width:112px;height:34px;color:var(--mn-text);background:var(--mn-input);cursor:pointer;border-radius:9px;outline:0;padding:0 28px 0 9px;font-size:11px}.IIa07q_workspacePicker select:hover{border-color:color-mix(in srgb, var(--mn-accent) 50%, var(--mn-line-strong))}.IIa07q_alert,.IIa07q_inlineError{border:1px solid color-mix(in srgb, var(--mn-danger) 32%, transparent);color:var(--mn-danger);background:color-mix(in srgb, var(--mn-danger) 7%, var(--mn-layer-1));border-radius:9px;padding:10px 13px;font-size:12px}.IIa07q_alert{flex-direction:column;flex:none;margin:10px clamp(18px,2.5vw,32px) 0;display:flex}.IIa07q_workspaceMismatch{border:1px solid color-mix(in srgb, var(--mn-accent) 36%, var(--mn-line));background:color-mix(in srgb, var(--mn-accent) 7%, var(--mn-layer-1));border-radius:10px;flex:none;justify-content:space-between;align-items:center;gap:18px;min-width:0;margin:10px clamp(18px,2.5vw,32px) 0;padding:11px 12px 11px 14px;display:flex}.IIa07q_workspaceMismatch>div{gap:2px;min-width:0;display:grid}.IIa07q_workspaceMismatch strong{font-size:12px}.IIa07q_workspaceMismatch span{color:var(--mn-muted);font-size:10px}.IIa07q_workspaceMismatch>div>div{flex-wrap:wrap;gap:5px 12px;min-width:0;margin-top:4px;display:flex}.IIa07q_workspaceMismatch code{color:var(--mn-faint);font:9px/1.4 var(--mn-code);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.IIa07q_workspaceMismatch>button{white-space:nowrap;flex:none;min-height:32px}.IIa07q_telemetry{align-items:center;min-width:0;display:flex}.IIa07q_telemetryMetric{border-left:1px solid var(--mn-line);gap:2px;min-width:72px;padding:1px 14px;display:grid}.IIa07q_telemetryMetric span{color:var(--mn-faint);text-overflow:ellipsis;white-space:nowrap;font-size:9px;overflow:hidden}.IIa07q_telemetryMetric strong{font:650 13px/1 var(--mn-code);font-variant-numeric:tabular-nums}.IIa07q_workspace{flex-direction:column;flex:1;min-height:0;display:flex}.IIa07q_topNavigation{border-bottom:1px solid var(--mn-line);background:var(--mn-layer-1);flex:none;justify-content:space-between;align-items:stretch;gap:14px;min-width:0;min-height:46px;padding:0 16px;display:flex}.IIa07q_nav{overscroll-behavior-inline:contain;scrollbar-width:none;align-items:stretch;gap:10px;min-width:0;display:flex;overflow-x:auto}.IIa07q_nav::-webkit-scrollbar{display:none}.IIa07q_navGroup{align-items:stretch;gap:14px;min-width:0;display:flex}.IIa07q_navGroupDivider{background:var(--mn-line);flex:none;align-self:center;width:1px;height:22px}.IIa07q_nav button{min-width:max-content;min-height:44px;color:var(--mn-muted);text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:7px;padding:0 3px;display:flex;position:relative}.IIa07q_nav button:hover,.IIa07q_nav button[aria-current=page]{color:var(--mn-text)}.IIa07q_nav button[aria-current=page]:after{content:\"\";background:var(--mn-accent);border-radius:2px 2px 0 0;height:2px;position:absolute;bottom:-1px;left:0;right:0}.IIa07q_nav button[aria-current=page] .IIa07q_navGlyph{color:var(--mn-accent)}.IIa07q_nav button>span:last-child{min-width:0;display:block}.IIa07q_nav button strong{font-size:12px;font-weight:600}.IIa07q_nav button small{display:none}.IIa07q_navGlyph{color:var(--mn-faint);font:600 13px/1 var(--mn-code)}@media (width>=1000px){.IIa07q_nav button{min-height:50px}.IIa07q_nav button small{color:var(--mn-faint);margin-top:1px;font-size:9px;line-height:1.3;display:block}}.IIa07q_spaceSummary{border-left:1px solid var(--mn-line);flex:none;grid-template-columns:minmax(0,1fr) auto;align-content:center;gap:1px 9px;min-width:142px;padding:0 0 0 14px;display:grid}.IIa07q_spaceSummary>span{color:var(--mn-faint);text-overflow:ellipsis;white-space:nowrap;font-size:9px;overflow:hidden}.IIa07q_spaceSummary code{color:var(--mn-accent);font:650 12px/1 var(--mn-code);grid-row:span 2;align-self:center}.IIa07q_spaceSummary small{color:var(--mn-faint);font-size:9px}.IIa07q_canvas{overscroll-behavior-x:contain;overscroll-behavior-y:auto;scroll-behavior:auto;-webkit-overflow-scrolling:touch;background:var(--mn-bg);flex:1;min-width:0;overflow:auto}.IIa07q_page{width:min(1320px,100%);min-height:100%;margin:0 auto;padding:clamp(16px,2vw,24px) clamp(16px,2.4vw,28px) clamp(96px,14vh,150px)}.IIa07q_pageHeader{justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:16px;display:flex}.IIa07q_pageHeader h2{letter-spacing:-.025em;margin:2px 0;font-size:20px;line-height:1.2}.IIa07q_pageHeader p{max-width:72ch;color:var(--mn-muted);margin:0;font-size:12px;line-height:1.65}.IIa07q_pageHeaderMeta{flex:none;align-items:center;gap:9px;display:flex}.IIa07q_pageHeaderMeta>code{border:1px solid var(--mn-line);color:var(--mn-faint);background:var(--mn-layer-1);font:600 9px/1 var(--mn-code);letter-spacing:.06em;border-radius:7px;padding:6px 8px}.IIa07q_memoryHeaderActions{align-items:center;gap:7px;display:flex}.IIa07q_memoryHeaderActions>button{white-space:nowrap}.IIa07q_pageSpinner{border:1px solid color-mix(in srgb, var(--mn-accent) 18%, var(--mn-line));width:24px;height:24px;color:var(--mn-accent);background:var(--mn-layer-1);border-radius:7px;flex:none;place-items:center;display:grid}.IIa07q_pageSpinner>i{border:1.5px solid color-mix(in srgb, currentColor 24%, transparent);border-top-color:currentColor;border-radius:50%;width:11px;height:11px;animation:.72s linear infinite IIa07q_mnemon-spin}.IIa07q_primaryButton,.IIa07q_secondaryButton,.IIa07q_ghostButton,.IIa07q_dangerButton,.IIa07q_dangerSolidButton{cursor:pointer;border-radius:8px;min-height:36px;padding:0 13px;font-size:12px;transition:border-color .14s,background-color .14s,color .14s,transform .14s}.IIa07q_primaryButton{border:1px solid var(--mn-accent);color:#fff;background:var(--mn-accent)}.IIa07q_secondaryButton{border:1px solid var(--mn-line-strong);color:var(--mn-text);background:var(--mn-layer-1)}.IIa07q_ghostButton,.IIa07q_dangerButton{background:0 0;border:1px solid #0000;min-height:32px;padding:0 9px}.IIa07q_ghostButton{color:var(--mn-muted)}.IIa07q_dangerButton{color:var(--mn-danger)}.IIa07q_dangerSolidButton{border:1px solid var(--mn-danger);color:#fff;background:var(--mn-danger);min-height:29px}.IIa07q_primaryButton:hover,.IIa07q_secondaryButton:hover,.IIa07q_ghostButton:hover,.IIa07q_dangerButton:hover{filter:brightness(.98);background-color:var(--mn-hover)}.IIa07q_primaryButton:hover{background-color:var(--mn-accent)}.IIa07q_shell button:disabled{cursor:not-allowed;opacity:.48}.IIa07q_emptyState{border:1px dashed var(--mn-line-strong);background:color-mix(in srgb, var(--mn-layer-1) 50%, transparent);border-radius:13px;justify-content:center;align-items:center;gap:22px;min-height:220px;padding:30px;display:flex}.IIa07q_emptyGlyph{border:1px solid color-mix(in srgb, var(--mn-accent) 35%, var(--mn-line));width:76px;height:76px;color:var(--mn-accent);background:radial-gradient(circle, color-mix(in srgb, var(--mn-accent) 12%, transparent), transparent 65%);font:500 26px/1 var(--mn-code);border-radius:50%;flex:none;place-items:center;display:grid}.IIa07q_emptyState h3{margin:0 0 5px;font-size:16px}.IIa07q_emptyState p{max-width:500px;color:var(--mn-muted);margin:0}.IIa07q_loadingPanel{border:1px solid var(--mn-line);min-height:220px;color:var(--mn-muted);background:var(--mn-layer-1);border-radius:13px;place-items:center;display:grid}.IIa07q_asyncRegion{min-width:0;position:relative}.IIa07q_asyncResults{min-width:0;min-height:120px;position:relative}.IIa07q_asyncPlaceholder{border:1px solid var(--mn-line);min-height:220px;color:var(--mn-muted);background:var(--mn-layer-1);border-radius:13px;place-items:center;display:grid;position:relative}.IIa07q_sectionSpinner{z-index:6;border:1px solid color-mix(in srgb, var(--mn-accent) 18%, var(--mn-line));width:24px;height:24px;color:var(--mn-accent);background:color-mix(in srgb, var(--mn-layer-1) 90%, transparent);box-shadow:0 4px 12px color-mix(in srgb, var(--mn-text) 6%, transparent);backdrop-filter:blur(7px);border-radius:7px;place-items:center;display:grid;position:absolute;top:9px;right:9px}.IIa07q_sectionSpinner>i{border:1.5px solid color-mix(in srgb, currentColor 24%, transparent);border-top-color:currentColor;border-radius:50%;width:11px;height:11px;animation:.72s linear infinite IIa07q_mnemon-spin}@keyframes IIa07q_mnemon-spin{to{transform:rotate(360deg)}}.IIa07q_inlineError{margin:0 0 14px}.IIa07q_muted,.IIa07q_loading{color:var(--mn-faint);padding:16px 0;font-size:12px}.IIa07q_readSources{border:1px solid var(--mn-line);background:color-mix(in srgb, var(--mn-layer-1) 72%, transparent);border-radius:11px;gap:8px;margin:0 0 14px;padding:11px 12px;display:grid}.IIa07q_readSources>header{justify-content:space-between;align-items:flex-start;gap:14px;display:flex}.IIa07q_readSources>header>div{gap:2px;display:grid}.IIa07q_readSources>header strong{font-size:11px}.IIa07q_readSources>header p{max-width:92ch;color:var(--mn-muted);margin:0;font-size:9.5px;line-height:1.45}.IIa07q_readSources>header>button{border:1px solid var(--mn-line);min-height:26px;color:var(--mn-muted);background:var(--mn-layer-2);cursor:pointer;border-radius:7px;flex:none;padding:0 8px;font-size:9px}.IIa07q_readSources>header>button[data-selected]{border-color:color-mix(in srgb, var(--mn-accent) 42%, var(--mn-line));color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 7%, var(--mn-layer-2))}.IIa07q_readSources>div{grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:6px;display:grid}.IIa07q_readSourceCard,.IIa07q_bodyCard,.IIa07q_metadataList>label{border:1px solid var(--mn-line);color:var(--mn-text);background:linear-gradient(90deg, color-mix(in srgb, var(--mn-provider-color) 5%, var(--mn-layer-1)), var(--mn-layer-1) 34%);box-shadow:inset 3px 0 0 color-mix(in srgb, var(--mn-provider-color) 68%, transparent);border-radius:8px}.IIa07q_readSourceCard{text-align:left;grid-template-columns:7px minmax(0,1fr) auto;align-items:center;gap:8px;min-width:0;min-height:58px;padding:7px 8px 7px 11px;display:grid}button.IIa07q_readSourceCard{cursor:pointer}button.IIa07q_readSourceCard:hover{border-color:color-mix(in srgb, var(--mn-provider-color) 32%, var(--mn-line-strong));background:linear-gradient(90deg, color-mix(in srgb, var(--mn-provider-color) 8%, var(--mn-hover)), var(--mn-hover) 40%)}.IIa07q_readSourceCard[data-selected]{border-color:color-mix(in srgb, var(--mn-accent) 48%, var(--mn-line));box-shadow:inset 3px 0 0 var(--mn-provider-color), inset 0 0 0 1px color-mix(in srgb, var(--mn-accent) 10%, transparent)}.IIa07q_readSourceSignal{background:var(--mn-success);width:7px;height:7px;box-shadow:0 0 0 3px color-mix(in srgb, var(--mn-success) 12%, transparent);border-radius:50%}.IIa07q_readSourceCard[data-mode=projection] .IIa07q_readSourceSignal,.IIa07q_readSourceCard[data-mode=enumerable] .IIa07q_readSourceSignal{background:#6574d9;box-shadow:0 0 0 3px #6574d924}.IIa07q_readSourceCard[data-mode=query-only] .IIa07q_readSourceSignal{background:#c38a32;box-shadow:0 0 0 3px #c38a3224}.IIa07q_readSourceCard[data-status=unavailable] .IIa07q_readSourceSignal,.IIa07q_readSourceCard[data-status=unsupported] .IIa07q_readSourceSignal{background:var(--mn-danger);box-shadow:0 0 0 3px color-mix(in srgb, var(--mn-danger) 12%, transparent)}.IIa07q_readSourceCard[data-status=empty] .IIa07q_readSourceSignal{background:var(--mn-faint);box-shadow:0 0 0 3px color-mix(in srgb, var(--mn-faint) 12%, transparent)}.IIa07q_readSourceIdentity,.IIa07q_readSourceState{gap:1px;min-width:0;display:grid}.IIa07q_readSourceIdentity strong{text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;overflow:hidden}.IIa07q_readSourceMeta{align-items:center;gap:5px;min-width:0;margin-top:3px;display:flex}.IIa07q_readSourceMeta>small{color:var(--mn-faint);text-overflow:ellipsis;white-space:nowrap;font-size:8px;overflow:hidden}.IIa07q_readSourceState{text-align:right;justify-items:end}.IIa07q_readSourceState em{width:fit-content;color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 9%, transparent);font:650 8px var(--mn-code);white-space:nowrap;border-radius:999px;padding:2px 5px;font-style:normal}.IIa07q_readSourceState small{color:var(--mn-faint);white-space:nowrap;font-size:8px}.IIa07q_bodyDirectory{border:1px solid var(--mn-line);background:color-mix(in srgb, var(--mn-layer-1) 72%, var(--mn-bg));border-radius:11px;margin-bottom:12px;padding:12px 14px;position:relative}.IIa07q_bodyDirectoryHeader{justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:10px;display:flex}.IIa07q_bodyDirectoryHeader h3{margin:1px 0;font-size:13px}.IIa07q_bodyDirectoryHeader p{color:var(--mn-muted);margin:0;font-size:10px}.IIa07q_bodyDirectoryPath{max-width:min(62vw,720px);color:var(--mn-faint);text-overflow:ellipsis;white-space:nowrap;margin-top:4px;font-size:9px;display:block;overflow:hidden}.IIa07q_bodyDirectoryControls{flex:none;justify-content:flex-end;align-items:center;gap:6px;padding-right:28px;display:flex}.IIa07q_bodyDirectoryControls>strong{color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 9%, transparent);font:650 9px var(--mn-code);border-radius:999px;flex:none;padding:5px 8px}.IIa07q_bodyGrid{grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:7px;display:grid}.IIa07q_bodyDirectoryEmpty{border:1px dashed color-mix(in srgb, var(--mn-line) 84%, transparent);min-height:92px;color:var(--mn-muted);border-radius:12px;grid-column:1/-1;justify-content:center;align-items:center;gap:14px;display:flex}.IIa07q_bodyDirectoryEmpty>span{opacity:.6;font-size:28px}.IIa07q_bodyDirectoryEmpty strong{color:var(--mn-text);display:block}.IIa07q_bodyDirectoryEmpty p{margin:3px 0 0;font-size:10px}.IIa07q_bodyCard{--mn-body-accent:var(--mn-success);opacity:.72;min-width:0;padding:9px 10px 9px 13px;transition:opacity .18s,border-color .18s,background-color .18s}.IIa07q_bodyCard[data-active]{opacity:1;box-shadow:inset 3px 0 0 color-mix(in srgb, var(--mn-provider-color) 78%, transparent)}.IIa07q_bodyCard[data-reconnectable]{cursor:pointer}.IIa07q_bodyCard[data-reconnectable]:hover{border-color:color-mix(in srgb, var(--mn-provider-color) 46%, var(--mn-line))}.IIa07q_bodyCard[data-reconnectable]:focus-visible{outline:2px solid color-mix(in srgb, var(--mn-accent) 58%, transparent);outline-offset:2px}.IIa07q_bodyCardTop{grid-template-columns:7px minmax(0,1fr) auto;align-items:center;gap:8px;display:grid}.IIa07q_bodySignal{background:var(--mn-faint);border-radius:50%;width:7px;height:7px}.IIa07q_bodyCard[data-active] .IIa07q_bodySignal{background:var(--mn-body-accent);box-shadow:0 0 0 4px color-mix(in srgb, var(--mn-body-accent) 14%, transparent)}.IIa07q_bodyCard:not([data-healthy]) .IIa07q_bodySignal{background:var(--mn-danger);box-shadow:0 0 0 4px color-mix(in srgb, var(--mn-danger) 12%, transparent)}.IIa07q_bodyCard[data-status-loading] .IIa07q_bodySignal{background:var(--mn-faint);box-shadow:0 0 0 4px color-mix(in srgb, var(--mn-faint) 12%, transparent)}.IIa07q_bodyCard[data-reconnecting] .IIa07q_bodySignal{box-sizing:border-box;border:1.5px solid color-mix(in srgb, var(--mn-provider-color) 24%, transparent);border-top-color:var(--mn-provider-color);width:7px;height:7px;box-shadow:none;background:0 0;animation:.72s linear infinite IIa07q_mnemon-spin}.IIa07q_bodyCardTop>div{min-width:0;display:grid}.IIa07q_bodyCardTop strong{text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}.IIa07q_bodyCardTop code{color:var(--mn-faint);font:9px var(--mn-code);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.IIa07q_bodyHealth{color:var(--mn-success);font:650 8px var(--mn-code);letter-spacing:.07em;text-transform:uppercase}.IIa07q_bodyCard:not([data-healthy]) .IIa07q_bodyHealth{color:var(--mn-danger)}.IIa07q_bodyCard[data-status-loading] .IIa07q_bodyHealth{color:var(--mn-faint)}.IIa07q_mnemonDefaultBadge{border:1px solid color-mix(in srgb, var(--mn-accent) 24%, var(--mn-line));width:fit-content;color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 7%, transparent);font:650 8px var(--mn-code);white-space:nowrap;border-radius:999px;padding:2px 5px}.IIa07q_bodyProviderRow{flex-wrap:wrap;align-items:center;gap:4px;margin-top:2px;display:flex}.IIa07q_providerBadge{border:1px solid color-mix(in srgb, var(--mn-provider-color) 34%, var(--mn-line));width:fit-content;max-width:100%;min-height:17px;color:color-mix(in srgb, var(--mn-provider-color) 78%, var(--mn-text));background:color-mix(in srgb, var(--mn-provider-color) 10%, var(--mn-layer-1));font:650 8px/11px var(--mn-code);text-align:center;text-overflow:ellipsis;vertical-align:middle;white-space:nowrap;border-radius:999px;flex:none;justify-content:center;align-items:center;padding:2px 6px;display:inline-flex;overflow:hidden}.IIa07q_providerBadge,.IIa07q_readSourceCard,.IIa07q_bodyCard,.IIa07q_metadataList>label,.IIa07q_graphNode,.IIa07q_providerBadge[data-provider=mnemon-native],.IIa07q_readSourceCard[data-provider=mnemon-native],.IIa07q_bodyCard[data-provider=mnemon-native],.IIa07q_metadataList>label[data-provider=mnemon-native],.IIa07q_graphNode[data-provider=mnemon-native]{--mn-provider-color:#64748b}.IIa07q_providerBadge[data-provider=openviking],.IIa07q_readSourceCard[data-provider=openviking],.IIa07q_bodyCard[data-provider=openviking],.IIa07q_metadataList>label[data-provider=openviking],.IIa07q_graphNode[data-provider=openviking]{--mn-provider-color:#3b82d0}.IIa07q_providerBadge[data-provider=honcho],.IIa07q_readSourceCard[data-provider=honcho],.IIa07q_bodyCard[data-provider=honcho],.IIa07q_metadataList>label[data-provider=honcho],.IIa07q_graphNode[data-provider=honcho]{--mn-provider-color:#c44fcf}.IIa07q_providerBadge[data-provider=mem0],.IIa07q_readSourceCard[data-provider=mem0],.IIa07q_bodyCard[data-provider=mem0],.IIa07q_metadataList>label[data-provider=mem0],.IIa07q_graphNode[data-provider=mem0]{--mn-provider-color:#8b5cf6}.IIa07q_providerBadge[data-provider=hindsight],.IIa07q_readSourceCard[data-provider=hindsight],.IIa07q_bodyCard[data-provider=hindsight],.IIa07q_metadataList>label[data-provider=hindsight],.IIa07q_graphNode[data-provider=hindsight]{--mn-provider-color:#0891b2}.IIa07q_providerBadge[data-provider=holographic],.IIa07q_readSourceCard[data-provider=holographic],.IIa07q_bodyCard[data-provider=holographic],.IIa07q_metadataList>label[data-provider=holographic],.IIa07q_graphNode[data-provider=holographic]{--mn-provider-color:#6366d9}.IIa07q_providerBadge[data-provider=retaindb],.IIa07q_readSourceCard[data-provider=retaindb],.IIa07q_bodyCard[data-provider=retaindb],.IIa07q_metadataList>label[data-provider=retaindb],.IIa07q_graphNode[data-provider=retaindb]{--mn-provider-color:#d08a28}.IIa07q_providerBadge[data-provider=byterover],.IIa07q_readSourceCard[data-provider=byterover],.IIa07q_bodyCard[data-provider=byterover],.IIa07q_metadataList>label[data-provider=byterover],.IIa07q_graphNode[data-provider=byterover]{--mn-provider-color:#0f9a83}.IIa07q_providerBadge[data-provider=supermemory],.IIa07q_readSourceCard[data-provider=supermemory],.IIa07q_bodyCard[data-provider=supermemory],.IIa07q_metadataList>label[data-provider=supermemory],.IIa07q_graphNode[data-provider=supermemory]{--mn-provider-color:#df4d72}.IIa07q_bodySwitch{min-height:32px;color:var(--mn-faint);cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:0 1px;font-size:9.5px;display:flex}.IIa07q_bodySwitchTrack{border:1px solid var(--mn-line-strong);background:var(--mn-layer-2);border-radius:999px;flex:none;width:29px;height:17px;transition:border-color .18s,background-color .18s;position:relative}.IIa07q_bodySwitchTrack i{background:var(--mn-faint);border-radius:50%;width:11px;height:11px;transition:transform .2s cubic-bezier(.2,.8,.2,1),background-color .18s;position:absolute;top:2px;left:2px}.IIa07q_bodySwitch:hover{color:var(--mn-text)}.IIa07q_bodySwitch:hover .IIa07q_bodySwitchTrack{border-color:var(--mn-body-accent)}.IIa07q_bodySwitch[aria-checked=true]{color:var(--mn-text)}.IIa07q_bodySwitch[aria-checked=true] .IIa07q_bodySwitchTrack{border-color:color-mix(in srgb, var(--mn-body-accent) 65%, var(--mn-line));background:color-mix(in srgb, var(--mn-body-accent) 25%, var(--mn-layer-2))}.IIa07q_bodySwitch[aria-checked=true] .IIa07q_bodySwitchTrack i{background:var(--mn-body-accent);transform:translate(12px)}.IIa07q_bodyCardActions{align-items:center;gap:6px;display:flex}.IIa07q_bodyEditButton{width:28px;height:28px;color:var(--mn-muted);cursor:pointer;background:0 0;border:1px solid #0000;border-radius:7px;place-items:center;font-size:12px;display:grid}.IIa07q_bodyEditButton:hover{color:var(--mn-text);border-color:var(--mn-line);background:var(--mn-hover)}.IIa07q_bodyEdit{gap:9px;padding-top:2px;display:grid}.IIa07q_bodyEdit label{color:var(--mn-faint);gap:4px;font-size:9px;display:grid}.IIa07q_bodyEdit input,.IIa07q_bodyEdit select,.IIa07q_bodyEdit textarea{border:1px solid var(--mn-line);width:100%;color:var(--mn-text);background:var(--mn-input);border-radius:8px;outline:0;padding:7px 9px;font-size:12px;line-height:1.5}.IIa07q_bodyEdit textarea{resize:vertical}.IIa07q_bodyEdit input:focus,.IIa07q_bodyEdit select:focus,.IIa07q_bodyEdit textarea:focus{border-color:var(--mn-accent)}.IIa07q_bodyEditActions{justify-content:flex-end;gap:7px;display:flex}.IIa07q_bodyCreateForm{gap:14px;padding-top:0}.IIa07q_createSection{border:1px solid var(--mn-line);background:color-mix(in srgb, var(--mn-layer-2) 42%, var(--mn-layer-1));border-radius:11px;gap:11px;padding:13px;display:grid}.IIa07q_createSectionHeading{align-items:flex-start;gap:9px;display:flex}.IIa07q_createSectionHeading>span{width:25px;height:19px;color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 9%, transparent);font:650 8px var(--mn-code);border-radius:6px;flex:none;place-items:center;display:grid}.IIa07q_createSectionHeading>div{gap:2px;min-width:0;display:grid}.IIa07q_createSectionHeading strong{color:var(--mn-text);font-size:11.5px;line-height:17px}.IIa07q_createSectionHeading small{color:var(--mn-muted);font-size:9px;line-height:1.45}.IIa07q_createIdentityGrid{grid-template-columns:minmax(0,1fr);align-items:stretch;gap:10px;display:grid}.IIa07q_createIdentityGrid>label{align-content:start}.IIa07q_createIdentityGrid textarea{min-height:70px}.IIa07q_bodyCreateActions{border-top:1px solid var(--mn-line);align-items:center;padding-top:12px}.IIa07q_strategyForm{gap:14px;padding-top:0}.IIa07q_strategyLoading{border:1px dashed var(--mn-line);min-height:88px;color:var(--mn-muted);border-radius:10px;justify-content:center;align-items:center;font-size:10px;display:flex;position:relative}.IIa07q_strategyLoading .IIa07q_sectionSpinner{top:9px;right:9px}.IIa07q_placementMode{border:0;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:0;padding:0;display:grid}.IIa07q_placementMode legend{color:var(--mn-muted);margin-bottom:5px;font-size:10px}.IIa07q_placementMode label{border:1px solid var(--mn-line);cursor:pointer;background:color-mix(in srgb, var(--mn-layer-2) 62%, transparent);border-radius:9px;grid-template-columns:16px minmax(0,1fr);align-items:center;gap:8px;min-width:0;padding:10px;display:grid;position:relative}.IIa07q_placementMode label[data-selected]{border-color:color-mix(in srgb, var(--mn-accent) 52%, var(--mn-line));background:color-mix(in srgb, var(--mn-accent) 5%, var(--mn-layer-2));box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--mn-accent) 12%, transparent)}.IIa07q_placementMode label[data-disabled]{cursor:not-allowed;opacity:.58}.IIa07q_placementMode input{opacity:0;pointer-events:none;width:1px;height:1px;position:absolute}.IIa07q_placementMode span{gap:3px;display:grid}.IIa07q_placementMode strong{color:var(--mn-text);font-size:11px}.IIa07q_placementMode strong em{color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 10%, transparent);font:650 8px var(--mn-code);border-radius:999px;margin-left:4px;padding:2px 5px;font-style:normal}.IIa07q_placementMode small{color:var(--mn-muted);font-size:9px;line-height:1.45}.IIa07q_placementPolicy{border:1px solid color-mix(in srgb, var(--mn-accent) 26%, var(--mn-line));background:color-mix(in srgb, var(--mn-accent) 4%, var(--mn-layer-1));border-radius:10px;gap:9px;margin:0;padding:11px;display:grid}.IIa07q_placementPolicyHeading{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.IIa07q_placementPolicyHeading>div{gap:2px;display:grid}.IIa07q_placementPolicyHeading strong{font-size:11px}.IIa07q_placementPolicyHeading small{color:var(--mn-muted);font-size:9px;line-height:1.45}.IIa07q_placementPolicyHeading>span{border:1px solid color-mix(in srgb, var(--mn-accent) 22%, var(--mn-line));color:var(--mn-accent);font:650 8px var(--mn-code);border-radius:999px;flex:none;padding:3px 6px}.IIa07q_placementRuleGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;display:grid}.IIa07q_capabilityRules{border:0;flex-wrap:wrap;gap:6px;margin:0;padding:0;display:flex}.IIa07q_capabilityRules legend{width:100%;color:var(--mn-faint);margin-bottom:1px;font-size:9px}.IIa07q_capabilityRules label{border:1px solid var(--mn-line);width:fit-content;color:var(--mn-muted);background:var(--mn-input);cursor:pointer;border-radius:8px;align-items:center;gap:6px;padding:6px 8px;display:flex;position:relative}.IIa07q_capabilityRules label[data-selected]{border-color:color-mix(in srgb, var(--mn-accent) 42%, var(--mn-line));color:var(--mn-text);background:color-mix(in srgb, var(--mn-accent) 7%, var(--mn-input))}.IIa07q_capabilityRules input{opacity:0;pointer-events:none;width:1px;height:1px;position:absolute}.IIa07q_placementCandidates{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;display:grid}.IIa07q_placementCandidates>span,.IIa07q_placementCandidates>label{border:1px solid var(--mn-line);background:color-mix(in srgb, var(--mn-layer-2) 70%, transparent);border-radius:8px;grid-template-columns:28px minmax(0,1fr) 16px;align-items:center;gap:8px;min-width:0;padding:8px 9px;display:grid;position:relative}.IIa07q_placementCandidates>label{cursor:pointer}.IIa07q_placementCandidates>[data-selected]{border-color:color-mix(in srgb, var(--mn-accent) 38%, var(--mn-line));background:color-mix(in srgb, var(--mn-accent) 7%, transparent)}.IIa07q_placementCandidates>label[data-disabled]{cursor:not-allowed;opacity:.48}.IIa07q_placementCandidates input{opacity:0;pointer-events:none;width:1px;height:1px;position:absolute}.IIa07q_placementCandidates>span>span:not(.IIa07q_candidateIcon),.IIa07q_placementCandidates>label>span:not(.IIa07q_candidateIcon){gap:2px;min-width:0;display:grid}.IIa07q_placementCandidates strong{color:var(--mn-text);font-size:10px}.IIa07q_placementCandidates small{color:var(--mn-muted);font-size:8.5px;line-height:1.4}.IIa07q_providerChoice{border:0;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0;padding:0;display:grid}.IIa07q_providerChoice legend{color:var(--mn-muted);margin-bottom:5px;font-size:10px}.IIa07q_providerChoice label{border:1px solid var(--mn-line);cursor:pointer;background:color-mix(in srgb, var(--mn-layer-2) 72%, transparent);border-radius:9px;grid-template-columns:32px minmax(0,1fr) 16px;align-items:center;gap:9px;min-width:0;padding:10px;display:grid;position:relative}.IIa07q_providerChoice label[data-native]{border-color:color-mix(in srgb, var(--mn-accent) 20%, var(--mn-line));grid-column:1/-1}.IIa07q_providerChoice label[data-selected]{border-color:color-mix(in srgb, var(--mn-accent) 48%, var(--mn-line));background:color-mix(in srgb, var(--mn-accent) 5%, var(--mn-layer-2));box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--mn-accent) 12%, transparent)}.IIa07q_providerChoice label[data-disabled]{cursor:not-allowed;opacity:.5}.IIa07q_providerChoice input{opacity:0;pointer-events:none;width:1px;height:1px;position:absolute}.IIa07q_providerChoice span{gap:3px;display:grid}.IIa07q_providerChoice strong{color:var(--mn-text);font-size:11px}.IIa07q_providerChoice strong em{color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 10%, transparent);font:650 8px var(--mn-code);border-radius:999px;margin-left:5px;padding:2px 5px;font-style:normal}.IIa07q_providerChoice small{color:var(--mn-muted);-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:9px;line-height:1.45;display:-webkit-box;overflow:hidden}.IIa07q_providerChoiceIcon,.IIa07q_candidateIcon,.IIa07q_providerFieldIcon{box-sizing:border-box;border:1px solid var(--mn-line);background:var(--mn-layer-1);place-items:center;display:grid;overflow:hidden}.IIa07q_providerChoiceIcon{border-radius:8px;width:32px;height:32px;padding:3px}.IIa07q_candidateIcon{border-radius:7px;width:28px;height:28px;padding:3px}.IIa07q_providerFieldIcon{border-radius:8px;flex:none;width:30px;height:30px;padding:3px}.IIa07q_providerChoiceIcon>img,.IIa07q_providerChoiceIcon>svg,.IIa07q_candidateIcon>img,.IIa07q_candidateIcon>svg,.IIa07q_providerFieldIcon>img,.IIa07q_providerFieldIcon>svg{object-fit:contain;border-radius:5px;width:100%;height:100%;display:block}.IIa07q_choiceControl{box-sizing:border-box;border:1px solid color-mix(in srgb, var(--mn-muted) 52%, var(--mn-line));background:var(--mn-layer-1);border-radius:5px;flex:none;place-items:center;width:16px;height:16px;display:grid;position:relative}.IIa07q_choiceControl[data-kind=radio]{border-radius:50%}[data-selected]>.IIa07q_choiceControl{border-color:var(--mn-accent);background:var(--mn-accent)}[data-selected]>.IIa07q_choiceControl[data-kind=check]:after{content:\"\";border-bottom:1.5px solid #fff;border-left:1.5px solid #fff;width:7px;height:4px;transform:translateY(-1px)rotate(-45deg)}[data-selected]>.IIa07q_choiceControl[data-kind=radio]:after{content:\"\";background:#fff;border-radius:50%;width:6px;height:6px}.IIa07q_placementMode label:focus-within,.IIa07q_providerChoice label:focus-within,.IIa07q_capabilityRules label:focus-within,.IIa07q_placementCandidates label:focus-within{outline:2px solid color-mix(in srgb, var(--mn-accent) 28%, transparent);outline-offset:1px}.IIa07q_providerFields{border:1px solid color-mix(in srgb, #6574d9 25%, var(--mn-line));background:#6574d90d;border-radius:9px;gap:8px;padding:10px;display:grid}.IIa07q_providerFieldHeading{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.IIa07q_providerFieldIdentity{align-items:center;gap:8px;min-width:0;display:flex}.IIa07q_providerFieldIdentity>div{gap:2px;min-width:0;display:grid}.IIa07q_providerFieldHeading strong{color:var(--mn-text);font-size:11px}.IIa07q_providerFieldHeading small{color:var(--mn-muted);font-size:9px;line-height:1.45}.IIa07q_providerFieldHeading>span{border:1px solid color-mix(in srgb, #6574d9 24%, var(--mn-line));color:color-mix(in srgb, #8793ef 80%, var(--mn-text));font:650 8px var(--mn-code);border-radius:999px;flex:none;padding:3px 6px}.IIa07q_providerFields details{min-width:0}.IIa07q_providerFields summary{width:fit-content;color:var(--mn-accent);cursor:pointer;font-size:9px}.IIa07q_providerAdvancedGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px;display:grid}.IIa07q_providerFieldControl{gap:4px;min-width:0;display:grid}.IIa07q_providerFieldControl input[type=checkbox]{width:14px;height:14px;accent-color:var(--mn-accent);margin:2px 0;padding:0}.IIa07q_providerFieldControl .IIa07q_providerSecretClear{color:var(--mn-muted);cursor:pointer;align-items:center;gap:5px;font-size:8.5px;display:flex}.IIa07q_providerWriteHint{color:color-mix(in srgb, #8793ef 72%, var(--mn-muted));margin-top:4px;font-size:9px;line-height:1.45;display:block}.IIa07q_placementReceipt{border:1px solid color-mix(in srgb, var(--mn-accent) 20%, var(--mn-line));min-width:0;color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 4%, transparent);border-radius:8px;align-items:flex-start;gap:7px;margin:7px 0;padding:7px 8px;display:flex}.IIa07q_placementReceipt>span{flex:none;font-size:10px}.IIa07q_placementReceipt>div{grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;min-width:0;display:grid}.IIa07q_placementReceipt strong,.IIa07q_placementReceipt small{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.IIa07q_placementReceipt strong{font-size:9px}.IIa07q_placementReceipt small{color:var(--mn-muted);font-size:8px}.IIa07q_placementReceipt p{color:var(--mn-muted);text-overflow:ellipsis;white-space:nowrap;grid-column:1/-1;margin:0;font-size:8.5px;line-height:1.4;overflow:hidden}.IIa07q_bodyDeleteConfirm{gap:16px;display:grid}.IIa07q_bodyDeleteConfirm>p{color:var(--mn-muted);margin:0;font-size:12px;line-height:1.6}.IIa07q_bodyDeleteSummary{border:1px solid color-mix(in srgb, var(--mn-danger) 22%, var(--mn-line));background:color-mix(in srgb, var(--mn-danger) 5%, var(--mn-layer-1));border-radius:8px;gap:3px;padding:12px;display:grid}.IIa07q_bodyDeleteSummary strong{font-size:13px}.IIa07q_bodyDeleteContent{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font-size:13px;font-weight:400;line-height:1.55}.IIa07q_bodyDeleteSummary span{color:var(--mn-muted);font-size:11px}.IIa07q_bodyCard>p{min-height:15px;color:var(--mn-muted);margin:7px 0;font-size:10px;line-height:1.45}.IIa07q_bodyCard footer{border-top:1px solid var(--mn-line);min-width:0;color:var(--mn-faint);flex-wrap:nowrap;gap:5px 11px;padding-top:6px;font-size:9px;display:flex;overflow:hidden}.IIa07q_bodyFooterBlock{text-overflow:ellipsis;white-space:nowrap;flex:0 auto;min-width:0;display:block;overflow:hidden}.IIa07q_bodyFooterGrow{flex:auto}.IIa07q_bodyCreate{border-top:1px solid var(--mn-line);margin-top:10px;padding-top:8px}.IIa07q_bodyCreate summary{cursor:pointer;width:max-content;color:var(--mn-accent);font-size:10px;list-style:none}.IIa07q_bodyCreate summary::-webkit-details-marker{display:none}.IIa07q_bodyCreate form{grid-template-columns:minmax(0,1fr);gap:8px;margin-top:9px;display:grid}.IIa07q_bodyCreate input{border:1px solid var(--mn-line);background:var(--mn-input);border-radius:8px;outline:0;min-width:0;height:34px;padding:0 9px}.IIa07q_bodyCreate input:focus{border-color:var(--mn-accent)}.IIa07q_graphLayout{grid-template-columns:minmax(0,1fr) minmax(240px,270px);gap:10px;display:grid}.IIa07q_graphPanel,.IIa07q_graphInspector{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:11px}.IIa07q_graphPanel{min-width:0;position:relative;overflow:hidden}.IIa07q_graphToolbar,.IIa07q_graphFooter{min-height:43px;color:var(--mn-muted);justify-content:space-between;align-items:center;gap:14px;padding:0 13px;font-size:10px;display:flex}.IIa07q_graphToolbar{border-bottom:1px solid var(--mn-line)}.IIa07q_graphToolbar>div:first-child{align-items:center;gap:7px;display:flex}.IIa07q_graphToolbar small{color:var(--mn-faint)}.IIa07q_liveDot{background:var(--mn-success);width:6px;height:6px;box-shadow:0 0 0 3px color-mix(in srgb, var(--mn-success) 15%, transparent);border-radius:50%}.IIa07q_graphLegend{flex-wrap:wrap;justify-content:flex-end;gap:5px 10px;display:flex}.IIa07q_graphLegend span{align-items:center;gap:4px;display:flex}.IIa07q_graphLegend span:before{content:\"\";background:var(--edge-color);border-radius:2px;width:13px;height:2px}.IIa07q_graphLegend [data-edge=temporal]{--edge-color:#87909f}.IIa07q_graphLegend [data-edge=scope]{--edge-color:#708199}.IIa07q_graphLegend [data-edge=scope]:before{background:repeating-linear-gradient(90deg, var(--edge-color) 0 4px, transparent 4px 7px)}.IIa07q_graphLegend [data-edge=semantic]{--edge-color:#4d7cfe}.IIa07q_graphLegend [data-edge=causal]{--edge-color:#ef6b5b}.IIa07q_graphLegend [data-edge=entity]{--edge-color:#22a879}.IIa07q_graphViewport{background:radial-gradient(circle at 50% 48%, color-mix(in srgb, var(--mn-accent) 6%, transparent), transparent 47%);min-height:clamp(390px,42vw,560px);position:relative;overflow:hidden}.IIa07q_graphCanvasControls{z-index:2;border:1px solid var(--mn-line);background:color-mix(in srgb, var(--mn-layer-1) 88%, transparent);box-shadow:0 6px 18px color-mix(in srgb, var(--mn-text) 7%, transparent);backdrop-filter:blur(10px);border-radius:9px;align-items:center;gap:5px;padding:4px;display:flex;position:absolute;top:10px;right:10px}.IIa07q_graphCanvasControls span{color:var(--mn-faint);font:9px var(--mn-code);align-items:center;gap:5px;padding:0 6px;display:flex}.IIa07q_graphCanvasControls span i{background:var(--mn-accent);width:5px;height:5px;box-shadow:0 0 0 3px color-mix(in srgb, var(--mn-accent) 12%, transparent);border-radius:50%}.IIa07q_graphCanvasControls button{min-height:30px;color:var(--mn-muted);cursor:pointer;background:0 0;border:1px solid #0000;border-radius:6px;padding:0 9px;font-size:9.5px}.IIa07q_graphCanvasControls button:hover,.IIa07q_graphCanvasControls button[data-active]{border-color:var(--mn-line);color:var(--mn-text);background:var(--mn-hover)}.IIa07q_graphCanvasControls button[data-active]{color:var(--mn-accent)}.IIa07q_graphSvg{touch-action:pan-y pinch-zoom;user-select:none;width:100%;height:clamp(390px,42vw,560px);display:block}.IIa07q_graphBackdrop{fill:var(--mn-layer-1)}.IIa07q_graphGridLine{stroke:var(--mn-line);stroke-width:.6px;opacity:.5}.IIa07q_graphEdge{fill:none;stroke:#87909f;stroke-width:1px;opacity:.32;vector-effect:non-scaling-stroke}.IIa07q_graphEdge[data-edge=scope]{stroke:#708199;stroke-dasharray:4 5;opacity:.28}.IIa07q_graphEdge[data-edge=semantic]{stroke:#4d7cfe;opacity:.48}.IIa07q_graphEdge[data-edge=causal]{stroke:#ef6b5b;opacity:.52}.IIa07q_graphEdge[data-edge=entity]{stroke:#22a879;stroke-width:1.45px;opacity:.78}.IIa07q_graphNode{--node:#8290a8;cursor:grab;touch-action:none;outline:none}.IIa07q_graphNode[data-dragging]{cursor:grabbing}.IIa07q_graphNode[data-category=decision]{--node:#ef8354}.IIa07q_graphNode[data-category=preference]{--node:#a879e1}.IIa07q_graphNode[data-category=fact]{--node:#4d7cfe}.IIa07q_graphNode[data-category=insight]{--node:#19a77d}.IIa07q_graphNode[data-category=context]{--node:#d8a624}.IIa07q_graphNode[data-kind=space]{--node:var(--mn-provider-color)}.IIa07q_graphNode[data-kind=entity]{--node:#2b9db9}.IIa07q_nodeHalo{fill:color-mix(in srgb, var(--node) 18%, var(--mn-layer-1));stroke:color-mix(in srgb, var(--node) 60%, var(--mn-layer-1));stroke-width:1.5px;transition:r .16s}.IIa07q_nodeCore{fill:var(--node)}.IIa07q_nodeLabel{fill:var(--mn-muted);font:10px var(--mn-code);pointer-events:auto}.IIa07q_nodeBodyLabel{fill:var(--mn-faint);font:650 8px var(--mn-code);letter-spacing:.04em;pointer-events:auto}.IIa07q_graphSvg[data-density=sparse] .IIa07q_nodeLabel{font-size:12px}.IIa07q_graphNode:hover .IIa07q_nodeHalo,.IIa07q_graphNode:focus .IIa07q_nodeHalo,.IIa07q_graphNode[data-selected] .IIa07q_nodeHalo{fill:color-mix(in srgb, var(--node) 28%, var(--mn-layer-1));stroke:var(--node)}.IIa07q_graphNode[data-selected] .IIa07q_nodeLabel{fill:var(--mn-text);font-weight:650}.IIa07q_graphFooter{border-top:1px solid var(--mn-line);min-height:38px;color:var(--mn-faint)}.IIa07q_graphInspector{min-width:0;min-height:calc(clamp(390px,42vw,560px) + 83px);padding:15px;overflow:hidden}.IIa07q_inspectorEmpty{text-align:center;flex-direction:column;justify-content:center;align-items:center;height:100%;display:flex}.IIa07q_inspectorLogo{opacity:.72;border-radius:11px;width:54px;height:54px;margin-bottom:15px}.IIa07q_inspectorEmpty h3{margin:7px 0 3px;font-size:14px}.IIa07q_inspectorEmpty p{color:var(--mn-faint);margin:0;font-size:11px}.IIa07q_inspectorHeading{justify-content:space-between;align-items:center;display:flex}.IIa07q_inspectorHeading button,.IIa07q_sectionHeading button{width:32px;height:32px;color:var(--mn-muted);cursor:pointer;background:0 0;border:0;border-radius:7px;place-items:center;display:grid}.IIa07q_inspectorHeading button:hover,.IIa07q_sectionHeading button:hover{background:var(--mn-hover)}.IIa07q_inspectorChips{flex-wrap:wrap;align-items:center;gap:6px;margin-top:24px;display:flex}.IIa07q_categoryChip{color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 10%, transparent);border-radius:999px;padding:3px 8px;font-size:10px;display:inline-flex}.IIa07q_inspectorTitleRow{align-items:flex-start;gap:8px;min-width:0;margin:12px 0 20px;display:flex}.IIa07q_inspectorTitle{overflow-wrap:anywhere;white-space:pre-wrap;-webkit-line-clamp:6;-webkit-box-orient:vertical;flex:1;min-width:0;margin:0;font-size:14px;line-height:1.6;display:-webkit-box;overflow:hidden}.IIa07q_inspectorEye{border:1px solid var(--mn-line);width:27px;height:27px;color:var(--mn-muted);background:var(--mn-layer-1);cursor:pointer;border-radius:7px;flex:none;place-items:center;transition:color .15s,border-color .15s,background-color .15s;display:grid}.IIa07q_inspectorEye:hover{color:var(--mn-accent);border-color:var(--mn-line-strong);background:var(--mn-hover)}.IIa07q_inspectorMeta{margin:0}.IIa07q_inspectorMeta>div{border-top:1px solid var(--mn-line);gap:3px;padding:11px 0;display:grid}.IIa07q_inspectorMeta dt{color:var(--mn-faint);font:9px var(--mn-code);text-transform:uppercase}.IIa07q_inspectorMeta dd{overflow-wrap:anywhere;color:var(--mn-muted);margin:0;font-size:11px}.IIa07q_inspectorActions{gap:8px;margin-top:20px;display:grid}.IIa07q_previewContent{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--mn-text);margin:0;font-size:13px;line-height:1.7}.IIa07q_searchBar{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:13px;margin-bottom:18px;padding:13px}.IIa07q_queryField{border:1px solid var(--mn-line-strong);background:var(--mn-input);border-radius:9px;grid-template-columns:24px minmax(0,1fr) 24px;align-items:center;gap:5px;padding:0 10px;display:grid}.IIa07q_queryField>span{color:var(--mn-accent);font:18px var(--mn-code)}.IIa07q_queryField input{background:0 0;border:0;outline:0;width:100%;height:42px}.IIa07q_queryField kbd{color:var(--mn-faint);font:11px var(--mn-code)}.IIa07q_searchControls{justify-content:flex-end;align-items:flex-end;gap:10px;padding-top:10px;display:flex}.IIa07q_searchActions{align-items:center;gap:7px;display:flex}.IIa07q_agentAnswer{border:1px solid color-mix(in srgb, var(--mn-accent) 30%, var(--mn-line));background:linear-gradient(135deg, color-mix(in srgb, var(--mn-accent) 7%, var(--mn-layer-1)), var(--mn-layer-1) 60%);border-radius:11px;margin-bottom:16px;padding:16px 18px}.IIa07q_agentAnswerHeading{justify-content:space-between;align-items:flex-start;gap:16px;display:flex}.IIa07q_agentAnswerHeading span{color:var(--mn-accent);font:650 9px/1.2 var(--mn-code);letter-spacing:.08em}.IIa07q_agentAnswerHeading h3{margin:4px 0 0;font-size:15px}.IIa07q_agentAnswerHeading>code{color:var(--mn-faint);font-size:9px}.IIa07q_agentAnswer>p{white-space:pre-wrap;color:var(--mn-text);margin:12px 0;font-size:13px;line-height:1.7}.IIa07q_agentCitations{border-top:1px solid var(--mn-line);flex-wrap:wrap;gap:5px;padding-top:10px;display:flex}.IIa07q_agentCitations code{color:var(--mn-muted);background:var(--mn-layer-2);border-radius:5px;padding:3px 6px;font-size:9px}.IIa07q_searchControls label,.IIa07q_formGrid label,.IIa07q_fieldWide{color:var(--mn-muted);gap:5px;font-size:11px;display:grid}.IIa07q_searchControls select,.IIa07q_formGrid select,.IIa07q_formGrid input,.IIa07q_listToolbar input,.IIa07q_listToolbar select,.IIa07q_entitySearch input{border:1px solid var(--mn-line);background:var(--mn-input);border-radius:8px;outline:0;min-width:140px;height:34px;padding:0 9px}.IIa07q_searchControls select:focus,.IIa07q_formGrid select:focus,.IIa07q_formGrid input:focus,.IIa07q_listToolbar input:focus,.IIa07q_listToolbar select:focus,.IIa07q_entitySearch input:focus,.IIa07q_supervisedForm textarea:focus{border-color:var(--mn-accent)}.IIa07q_singleColumn{max-width:830px}.IIa07q_resultLayout{grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);align-items:start;gap:14px;display:grid}.IIa07q_results,.IIa07q_relatedPane,.IIa07q_entityResults{min-width:0}.IIa07q_sectionHeading{justify-content:space-between;align-items:center;gap:16px;min-height:39px;margin-bottom:8px;display:flex}.IIa07q_sectionHeading h3{margin:2px 0 0;font-size:15px}.IIa07q_sectionHeading>strong{min-width:27px;height:27px;color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 9%, transparent);font:650 11px var(--mn-code);border-radius:7px;place-items:center;display:grid}.IIa07q_relatedPane{border:1px solid var(--mn-line);background:var(--mn-layer-1);-webkit-overflow-scrolling:touch;border-radius:12px;max-height:calc(100dvh - 230px);padding:13px;scroll-margin-top:14px;position:sticky;top:12px;overflow:auto}.IIa07q_relatedSource{color:var(--mn-muted);background:var(--mn-layer-2);border-radius:8px;margin:0 0 13px;padding:10px;font-size:11px}.IIa07q_insightCard{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:11px;min-width:0;margin-bottom:9px;padding:14px;transition:border-color .15s,transform .15s,box-shadow .15s}.IIa07q_insightCard:hover{border-color:var(--mn-line-strong);transform:translateY(-1px)}.IIa07q_cardTop{justify-content:space-between;align-items:center;gap:10px;display:flex}.IIa07q_badges,.IIa07q_tags,.IIa07q_entities{flex-wrap:wrap;gap:5px;display:flex}.IIa07q_badge{color:var(--mn-muted);background:var(--mn-layer-2);border-radius:999px;padding:2px 6px;font-size:9px}.IIa07q_id{color:var(--mn-faint);font:9px var(--mn-code)}.IIa07q_content{white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0;line-height:1.65}.IIa07q_tags{color:var(--mn-accent);font-size:10px}.IIa07q_entities{margin-top:7px}.IIa07q_entities span{border:1px solid var(--mn-line);color:var(--mn-muted);border-radius:5px;padding:2px 6px;font-size:9px}.IIa07q_cardActions{border-top:1px solid var(--mn-line);justify-content:flex-end;align-items:center;gap:3px;min-height:30px;margin-top:10px;padding-top:8px;display:flex}.IIa07q_confirmBar{width:100%;color:var(--mn-danger);justify-content:flex-end;align-items:center;gap:5px;font-size:11px;display:flex}.IIa07q_confirmBar>span{margin-right:auto}.IIa07q_entityLayout{grid-template-columns:265px minmax(0,1fr);align-items:start;gap:16px;display:grid}.IIa07q_entityRail{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:12px;padding:13px;position:sticky;top:0}.IIa07q_entitySearch{grid-template-columns:minmax(0,1fr) auto;gap:7px;display:grid}.IIa07q_entitySearch input{min-width:0}.IIa07q_entityHeading{justify-content:space-between;align-items:center;margin:18px 2px 7px;display:flex}.IIa07q_entityHeading small{color:var(--mn-faint);font-size:9px}.IIa07q_entityList{gap:3px;display:grid}.IIa07q_entityList button{min-height:34px;color:var(--mn-muted);cursor:pointer;text-align:left;background:0 0;border:0;border-radius:7px;justify-content:space-between;align-items:center;gap:10px;padding:0 9px;display:flex}.IIa07q_entityList button:hover,.IIa07q_entityList button[aria-pressed=true]{color:var(--mn-text);background:var(--mn-hover)}.IIa07q_entityList strong{color:var(--mn-faint);font:10px var(--mn-code)}.IIa07q_entityResults>.IIa07q_emptyState{min-height:360px}.IIa07q_runtimeComposer,.IIa07q_runtimeTarget{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:12px}.IIa07q_runtimeComposer{background:linear-gradient(135deg, color-mix(in srgb, var(--mn-accent) 5%, var(--mn-layer-1)), var(--mn-layer-1) 55%);margin-bottom:13px;padding:15px}.IIa07q_runtimeComposerHeading{justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:11px;display:flex}.IIa07q_runtimeComposerHeading h3{margin:0 0 2px;font-size:14px}.IIa07q_runtimeComposerHeading p{color:var(--mn-muted);margin:0;font-size:10px}.IIa07q_runtimeComposerHeading>span{color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 9%, transparent);font:650 9px var(--mn-code);border-radius:999px;flex:none;padding:4px 8px}.IIa07q_runtimeComposer>textarea,.IIa07q_runtimeEntry textarea{resize:vertical;border:1px solid var(--mn-line);width:100%;color:var(--mn-text);background:var(--mn-input);border-radius:9px;outline:0;padding:10px 11px;line-height:1.6}.IIa07q_runtimeComposer>textarea:focus,.IIa07q_runtimeEntry textarea:focus{border-color:var(--mn-accent)}.IIa07q_runtimeComposerActions{justify-content:flex-end;align-items:flex-end;gap:9px;margin-top:10px;display:flex}.IIa07q_runtimeComposerActions label{color:var(--mn-faint);gap:4px;font-size:9px;display:grid}.IIa07q_runtimeComposerActions select,.IIa07q_runtimeEntry select{border:1px solid var(--mn-line);background:var(--mn-input);border-radius:8px;outline:0;min-width:135px;height:34px;padding:0 8px}.IIa07q_runtimeNotice,.IIa07q_runtimeReadOnly{border:1px solid color-mix(in srgb, var(--mn-success) 28%, var(--mn-line));color:var(--mn-success);background:color-mix(in srgb, var(--mn-success) 6%, var(--mn-layer-1));border-radius:9px;margin-bottom:13px;padding:9px 12px;font-size:11px}.IIa07q_runtimeReadOnly{color:var(--mn-muted);border-color:var(--mn-line);background:var(--mn-layer-1)}.IIa07q_runtimeGrid{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:12px;display:grid}.IIa07q_runtimeSummaryGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px;display:grid}.IIa07q_runtimeSummaryCard{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:11px;min-width:0}.IIa07q_runtimeBrowser{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:11px;overflow:hidden}.IIa07q_runtimeBrowserToolbar{border-bottom:1px solid var(--mn-line);justify-content:space-between;align-items:center;gap:12px;padding:10px;display:flex}.IIa07q_runtimeScopeFilter{flex-wrap:wrap;align-items:center;gap:3px;display:flex}.IIa07q_runtimeScopeFilter button{min-height:32px;color:var(--mn-muted);cursor:pointer;background:0 0;border:1px solid #0000;border-radius:7px;padding:0 10px}.IIa07q_runtimeScopeFilter button:hover{background:var(--mn-hover)}.IIa07q_runtimeScopeFilter button[data-active]{border-color:var(--mn-line);color:var(--mn-text);background:var(--mn-layer-2)}.IIa07q_runtimeScopeFilter b{color:var(--mn-faint);font:600 10px var(--mn-code);margin-left:4px}.IIa07q_runtimeFilterQuery{border:1px solid var(--mn-line);background:var(--mn-input);border-radius:8px;align-items:center;gap:7px;width:min(320px,42%);min-width:210px;padding:0 9px;display:flex}.IIa07q_runtimeFilterQuery>span{color:var(--mn-faint)}.IIa07q_runtimeFilterQuery input{width:100%;min-width:0;height:32px;color:var(--mn-text);background:0 0;border:0;outline:0}.IIa07q_runtimeUnifiedList{background:color-mix(in srgb, var(--mn-layer-2) 30%, var(--mn-layer-1));grid-template-columns:1fr;gap:8px;padding:10px;display:grid}.IIa07q_runtimeEntryBadges{flex-wrap:wrap;align-items:center;gap:5px;display:flex}.IIa07q_runtimeEntryMeta .IIa07q_runtimeEntryTarget{color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 8%, var(--mn-layer-2));font-family:var(--mn-code)}.IIa07q_runtimeTarget{min-width:0;overflow:hidden}.IIa07q_runtimeTargetHeader{justify-content:space-between;align-items:center;gap:14px;padding:14px 15px 9px;display:flex}.IIa07q_runtimeTargetHeader>div{gap:1px;display:grid}.IIa07q_runtimeTargetHeader span{color:var(--mn-faint);font:650 9px var(--mn-code);letter-spacing:.08em}.IIa07q_runtimeTargetHeader h3{margin:0;font-size:15px}.IIa07q_runtimeTargetHeader>strong{min-width:28px;height:28px;color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 9%, transparent);font:650 11px var(--mn-code);border-radius:8px;place-items:center;display:grid}.IIa07q_capacityLine{align-items:center;gap:9px;padding:0 15px;display:flex}.IIa07q_capacityLine>div{background:var(--mn-layer-2);border-radius:999px;flex:1;height:4px;overflow:hidden}.IIa07q_capacityLine i{border-radius:inherit;background:var(--mn-success);height:100%;transition:width .25s;display:block}.IIa07q_capacityLine>span{min-width:88px;color:var(--mn-faint);font:9px var(--mn-code);text-align:right}.IIa07q_runtimeTargetDescription{min-height:31px;color:var(--mn-muted);margin:8px 15px 12px;font-size:10px}.IIa07q_runtimeEntries{border-top:1px solid var(--mn-line);background:color-mix(in srgb, var(--mn-layer-2) 36%, var(--mn-layer-1));gap:7px;padding:10px;display:grid}.IIa07q_runtimeEntry{--mn-provider-color:var(--mn-accent);border:1px solid var(--mn-line);background:linear-gradient(90deg, color-mix(in srgb, var(--mn-provider-color) 5%, var(--mn-layer-1)), var(--mn-layer-1) 34%);box-shadow:inset 3px 0 0 color-mix(in srgb, var(--mn-provider-color) 68%, transparent);border-radius:8px;padding:11px 12px 10px;position:relative}.IIa07q_runtimeEntry[data-importance=critical]{--mn-provider-color:var(--mn-priority)}.IIa07q_runtimeEntry[data-importance=low]{--mn-provider-color:var(--mn-faint)}.IIa07q_runtimeEntryMeta{justify-content:space-between;align-items:center;gap:12px;display:flex}.IIa07q_runtimeEntryMeta>span,.IIa07q_runtimeEntryBadges>span{color:var(--mn-muted);background:var(--mn-layer-2);border-radius:999px;padding:2px 6px;font-size:9px}.IIa07q_runtimeEntry[data-importance=critical] .IIa07q_runtimeEntryMeta>span,.IIa07q_runtimeEntry[data-importance=critical] .IIa07q_runtimeEntryBadges>span:not(.IIa07q_runtimeEntryTarget){color:var(--mn-priority);background:color-mix(in srgb, var(--mn-priority) 9%, transparent)}.IIa07q_runtimeEntryMeta time{color:var(--mn-faint);font:8px var(--mn-code);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.IIa07q_runtimeEntry>p{white-space:pre-wrap;overflow-wrap:anywhere;min-height:42px;margin:9px 0;font-size:12px;line-height:1.6}.IIa07q_runtimeEntry>select{margin-top:7px}.IIa07q_runtimeEntry footer{border-top:1px solid var(--mn-line);justify-content:flex-end;align-items:center;gap:4px;min-height:30px;margin-top:7px;padding-top:7px;display:flex}.IIa07q_runtimeEntry footer>span{color:var(--mn-danger);margin-right:auto;font-size:10px}.IIa07q_runtimeEmpty{min-height:126px;color:var(--mn-faint);text-align:center;align-content:center;place-items:center;gap:5px;display:grid}.IIa07q_runtimeEmpty>span{font:24px var(--mn-code);opacity:.65}.IIa07q_runtimeEmpty p{margin:0;font-size:10px}.IIa07q_runtimeFootnote{color:var(--mn-faint);margin:10px 2px 0;font-size:9px}.IIa07q_documentSummary{grid-template-columns:.7fr .7fr 1.6fr;gap:9px;margin-bottom:12px;display:grid}.IIa07q_documentSummary article{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:11px;min-width:0;min-height:91px;padding:13px 14px}.IIa07q_documentSummary article>span{color:var(--mn-faint);font-size:9px;display:block}.IIa07q_documentSummary article>strong{font:650 21px/1 var(--mn-code);margin:7px 0 4px;display:block}.IIa07q_documentSummary article>small{color:var(--mn-muted);font-size:9px}.IIa07q_documentCapacity>div{background:var(--mn-layer-2);border-radius:999px;height:4px;margin:7px 0 6px;overflow:hidden}.IIa07q_documentCapacity>div i{border-radius:inherit;background:var(--mn-accent);height:100%;transition:width .3s;display:block}.IIa07q_documentToolbar{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:11px;align-items:center;gap:9px;margin-bottom:12px;padding:9px;display:flex}.IIa07q_documentToolbar form{flex:1;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:5px;min-width:260px;padding-left:8px;display:grid}.IIa07q_documentToolbar form>span{color:var(--mn-faint);font:15px var(--mn-code)}.IIa07q_documentToolbar input,.IIa07q_documentEditor input,.IIa07q_documentEditor textarea{border:1px solid var(--mn-line);background:var(--mn-input);border-radius:8px;outline:0;width:100%;padding:8px 10px}.IIa07q_documentToolbar input{background:0 0;border-color:#0000;height:34px}.IIa07q_documentToolbar input:focus,.IIa07q_documentEditor input:focus,.IIa07q_documentEditor textarea:focus{border-color:var(--mn-accent)}.IIa07q_documentToolbar>div{border:1px solid var(--mn-line);background:var(--mn-layer-2);border-radius:8px;align-items:center;gap:3px;padding:3px;display:flex}.IIa07q_documentToolbar>div button{min-height:32px;color:var(--mn-muted);cursor:pointer;background:0 0;border:0;border-radius:6px;padding:0 10px;font-size:10.5px}.IIa07q_documentToolbar>div button[data-active]{color:var(--mn-text);background:var(--mn-layer-1);box-shadow:0 1px 3px color-mix(in srgb, var(--mn-text) 8%, transparent)}.IIa07q_documentToolbar>div b{color:var(--mn-faint);font:600 9px var(--mn-code);margin-left:4px}.IIa07q_documentWorkspace{grid-template-columns:minmax(250px,310px) minmax(0,1fr);gap:10px;min-height:590px;display:grid}.IIa07q_documentList,.IIa07q_documentReader{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:11px;min-width:0;overflow:hidden}.IIa07q_documentList{align-self:stretch}.IIa07q_documentList>header{border-bottom:1px solid var(--mn-line);min-height:42px;color:var(--mn-faint);justify-content:space-between;align-items:center;padding:0 12px;font-size:9px;display:flex}.IIa07q_documentList>header code{color:var(--mn-accent)}.IIa07q_documentList>button{--mn-provider-color:var(--mn-faint);border:1px solid var(--mn-line);width:calc(100% - 16px);color:var(--mn-text);background:linear-gradient(90deg, color-mix(in srgb, var(--mn-provider-color) 5%, var(--mn-layer-1)), var(--mn-layer-1) 34%);box-shadow:inset 3px 0 0 color-mix(in srgb, var(--mn-provider-color) 55%, transparent);text-align:left;cursor:pointer;border-radius:8px;margin:8px 8px 0;padding:11px 11px 10px 14px;transition:border-color .15s,background-color .15s,box-shadow .15s;display:block}.IIa07q_documentList>button:hover{--mn-provider-color:var(--mn-accent);border-color:color-mix(in srgb, var(--mn-accent) 28%, var(--mn-line))}.IIa07q_documentList>button[data-selected]{--mn-provider-color:var(--mn-accent);border-color:color-mix(in srgb, var(--mn-accent) 38%, var(--mn-line));background:linear-gradient(90deg, color-mix(in srgb, var(--mn-accent) 7%, var(--mn-layer-1)), var(--mn-layer-1) 38%);box-shadow:inset 3px 0 0 color-mix(in srgb, var(--mn-accent) 78%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--mn-accent) 8%, transparent)}.IIa07q_documentList>button>div{justify-content:space-between;align-items:baseline;gap:12px;display:flex}.IIa07q_documentList>button strong{text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}.IIa07q_documentList>button time{color:var(--mn-faint);font:8px var(--mn-code);flex:none}.IIa07q_documentList>button p{min-height:30px;color:var(--mn-muted);-webkit-line-clamp:2;-webkit-box-orient:vertical;margin:6px 0 9px;font-size:10px;line-height:1.5;display:-webkit-box;overflow:hidden}.IIa07q_documentList>button footer{color:var(--mn-faint);align-items:center;gap:8px;font-size:9px;display:flex}.IIa07q_documentList>button footer code{margin-left:auto}.IIa07q_documentList>button footer em{color:var(--mn-danger);font-style:normal}.IIa07q_documentListEmpty{min-height:230px;color:var(--mn-muted);text-align:center;align-content:center;place-items:center;gap:4px;padding:22px;display:grid}.IIa07q_documentListEmpty>span{color:var(--mn-accent);font:28px var(--mn-code);opacity:.6;margin-bottom:6px}.IIa07q_documentListEmpty p{color:var(--mn-faint);margin:0;font-size:10px}.IIa07q_documentReader{padding:clamp(16px,2vw,22px)}.IIa07q_documentReader>.IIa07q_emptyState{background:0 0;border:0;height:100%}.IIa07q_documentDetail>header{border-bottom:1px solid var(--mn-line);justify-content:space-between;align-items:flex-start;gap:18px;padding-bottom:15px;display:flex}.IIa07q_documentDetail>header span{color:var(--mn-accent);font:650 9px var(--mn-code);letter-spacing:.08em;text-transform:uppercase}.IIa07q_documentDetail>header h3{margin:5px 0 3px;font-size:18px}.IIa07q_documentDetail>header p{color:var(--mn-muted);margin:0;font-size:11px}.IIa07q_documentDetail>dl{border-top:1px solid var(--mn-line);border-left:1px solid var(--mn-line);grid-template-columns:2fr .45fr .8fr .55fr;margin:13px 0;display:grid}.IIa07q_documentDetail>dl>div{border-right:1px solid var(--mn-line);border-bottom:1px solid var(--mn-line);min-width:0;padding:8px 9px}.IIa07q_documentDetail dt{color:var(--mn-faint);margin-bottom:3px;font-size:8px}.IIa07q_documentDetail dd{text-overflow:ellipsis;white-space:nowrap;margin:0;font-size:9px;overflow:hidden}.IIa07q_documentSources{flex-wrap:wrap;align-items:center;gap:5px;margin:11px 0;display:flex}.IIa07q_documentSources>span{color:var(--mn-faint);margin-right:4px;font-size:9px}.IIa07q_documentSources code,.IIa07q_documentArchiveReceipt code{color:var(--mn-muted);background:var(--mn-layer-2);border-radius:5px;padding:3px 6px;font-size:8px}.IIa07q_markdownBody{overflow-wrap:anywhere;border:1px solid var(--mn-line);min-height:310px;color:var(--mn-text);background:color-mix(in srgb, var(--mn-layer-2) 30%, var(--mn-layer-1));border-radius:10px;margin:16px 0 0;padding:clamp(18px,2.5vw,28px);font-size:13px;line-height:1.78}.IIa07q_markdownBody>:first-child{margin-top:0}.IIa07q_markdownBody>:last-child{margin-bottom:0}.IIa07q_markdownBody h1,.IIa07q_markdownBody h2,.IIa07q_markdownBody h3,.IIa07q_markdownBody h4{color:var(--mn-text);letter-spacing:-.015em;margin:1.55em 0 .65em;line-height:1.3}.IIa07q_markdownBody h1{border-bottom:1px solid var(--mn-line);padding-bottom:.35em;font-size:1.75em}.IIa07q_markdownBody h2{border-bottom:1px solid var(--mn-line);padding-bottom:.3em;font-size:1.42em}.IIa07q_markdownBody h3{font-size:1.18em}.IIa07q_markdownBody p,.IIa07q_markdownBody ul,.IIa07q_markdownBody ol,.IIa07q_markdownBody blockquote,.IIa07q_markdownBody table,.IIa07q_markdownBody pre{margin:.85em 0}.IIa07q_markdownBody ul,.IIa07q_markdownBody ol{padding-left:1.6em}.IIa07q_markdownBody li+li{margin-top:.3em}.IIa07q_markdownBody blockquote{border-left:3px solid var(--mn-accent);color:var(--mn-muted);background:color-mix(in srgb, var(--mn-accent) 4%, transparent);margin-inline:0;padding:.15em 1em}.IIa07q_markdownBody code{color:var(--mn-text);background:var(--mn-layer-2);font:.88em/1.55 var(--mn-code);border-radius:5px;padding:.15em .38em}.IIa07q_markdownBody pre{border:1px solid var(--mn-line);background:var(--mn-layer-2);border-radius:9px;max-width:100%;padding:14px 16px;overflow:auto}.IIa07q_markdownBody pre code{background:0 0;padding:0;font-size:11px}.IIa07q_markdownBody a{color:var(--mn-accent);text-underline-offset:3px;text-decoration-thickness:1px}.IIa07q_markdownBody hr{border:0;border-top:1px solid var(--mn-line);margin:1.8em 0}.IIa07q_markdownBody table{border-collapse:collapse;max-width:100%;display:block;overflow-x:auto}.IIa07q_markdownBody th,.IIa07q_markdownBody td{border:1px solid var(--mn-line);text-align:left;vertical-align:top;padding:8px 10px}.IIa07q_markdownBody th{background:var(--mn-layer-2);font-weight:600}.IIa07q_markdownBody img{border-radius:8px;max-width:100%;height:auto}.IIa07q_documentArchiveReceipt{border:1px solid color-mix(in srgb, var(--mn-success) 28%, var(--mn-line));background:color-mix(in srgb, var(--mn-success) 5%, transparent);border-radius:9px;margin:12px 0;padding:11px 12px}.IIa07q_documentArchiveReceipt p{color:var(--mn-muted);margin:4px 0 8px;font-size:10px}.IIa07q_documentArchiveReceipt div{flex-wrap:wrap;gap:5px;display:flex}.IIa07q_documentDanger{border-top:1px solid var(--mn-line);justify-content:flex-end;align-items:center;gap:7px;min-height:57px;margin-top:13px;padding-top:12px;display:flex}.IIa07q_documentDanger>div{margin-right:auto}.IIa07q_documentDanger strong{font-size:11px;display:block}.IIa07q_documentDanger p{color:var(--mn-faint);margin:2px 0 0;font-size:9px}.IIa07q_documentDanger>span{color:var(--mn-danger);margin-right:auto;font-size:10px}.IIa07q_documentEditor{border:1px solid var(--mn-line);background:linear-gradient(135deg, color-mix(in srgb, var(--mn-accent) 5%, var(--mn-layer-1)), var(--mn-layer-1) 55%);border-radius:11px;margin-bottom:12px;padding:15px}.IIa07q_documentReader>.IIa07q_documentEditor{background:0 0;border:0;margin:0;padding:0}.IIa07q_documentEditor>header{justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:12px;display:flex}.IIa07q_documentEditor h3{margin:0;font-size:14px}.IIa07q_documentEditor header p{color:var(--mn-muted);margin:2px 0 0;font-size:10px}.IIa07q_documentEditor header>span,.IIa07q_documentEditor header>code{color:var(--mn-accent);font:650 9px var(--mn-code)}.IIa07q_documentEditor label{color:var(--mn-faint);gap:4px;margin-top:9px;font-size:9px;display:grid}.IIa07q_documentEditor textarea{resize:vertical;line-height:1.65}.IIa07q_documentEditorMeta{grid-template-columns:.8fr 1.2fr;gap:9px;display:grid}.IIa07q_documentEditorMeta label{margin:0}.IIa07q_documentEditor footer{justify-content:flex-end;gap:7px;margin-top:11px;display:flex}.IIa07q_writebackLayout{grid-template-columns:minmax(220px,280px) minmax(0,1fr);align-items:start;gap:15px;display:grid}.IIa07q_writeGuide,.IIa07q_supervisedComposer{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:12px}.IIa07q_writeGuide{padding:17px}.IIa07q_writeGuide h3{margin:5px 0 15px;font-size:15px}.IIa07q_writeGuide ol{counter-reset:gate;gap:13px;margin:0;padding:0;list-style:none;display:grid}.IIa07q_writeGuide li{counter-increment:gate;grid-template-columns:22px minmax(0,1fr);column-gap:7px;display:grid}.IIa07q_writeGuide li:before{content:\"0\" counter(gate);color:var(--mn-accent);font:10px var(--mn-code);grid-row:span 2}.IIa07q_writeGuide li strong{font-size:12px}.IIa07q_writeGuide li span,.IIa07q_writeGuide p{color:var(--mn-faint);font-size:10px}.IIa07q_writeGuide p{border-top:1px solid var(--mn-line);margin:17px 0 0;padding-top:13px}.IIa07q_supervisedComposer{overflow:hidden}.IIa07q_supervisedForm{padding:18px}.IIa07q_supervisedHeading{justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px;display:flex}.IIa07q_supervisedHeading h3{margin:4px 0 0;font-size:17px}.IIa07q_sessionReady,.IIa07q_sessionMissing{font:650 9px var(--mn-code);border-radius:999px;padding:4px 8px}.IIa07q_sessionReady{color:var(--mn-success);background:color-mix(in srgb, var(--mn-success) 10%, transparent)}.IIa07q_sessionMissing{color:var(--mn-danger);background:color-mix(in srgb, var(--mn-danger) 10%, transparent)}.IIa07q_supervisedForm textarea{resize:vertical;border:1px solid var(--mn-line);width:100%;color:var(--mn-text);background:var(--mn-input);border-radius:9px;outline:0;padding:12px;line-height:1.65}.IIa07q_sessionHint{color:var(--mn-danger);margin:9px 0 0;font-size:11px}.IIa07q_formGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:13px;display:grid}.IIa07q_fieldWide{grid-column:1/-1}.IIa07q_formGrid select,.IIa07q_formGrid input{width:100%;min-width:0}.IIa07q_formActions{align-items:center;gap:12px;margin-top:15px;display:flex}.IIa07q_formActions span{color:var(--mn-muted);font-size:11px}.IIa07q_advancedWrite{border-top:1px solid var(--mn-line);background:color-mix(in srgb, var(--mn-layer-2) 45%, var(--mn-layer-1))}.IIa07q_advancedWrite summary{cursor:pointer;justify-content:space-between;align-items:center;gap:16px;min-height:58px;padding:10px 18px;list-style:none;display:flex}.IIa07q_advancedWrite summary::-webkit-details-marker{display:none}.IIa07q_advancedWrite summary>span:first-child{gap:2px;display:grid}.IIa07q_advancedWrite summary strong{font-size:12px}.IIa07q_advancedWrite summary small{color:var(--mn-faint);font-size:10px}.IIa07q_advancedWrite summary>span:last-child{color:var(--mn-accent);font:10px var(--mn-code)}.IIa07q_advancedWrite[open] summary{border-bottom:1px solid var(--mn-line)}.IIa07q_advancedWrite[open] summary>span:last-child{font-size:0}.IIa07q_advancedWrite[open] summary>span:last-child:after{content:\"−\";font-size:13px}.IIa07q_manualForm{padding:3px 18px 18px}.IIa07q_manualActions{justify-content:space-between;align-items:center;gap:14px;margin-top:15px;display:flex}.IIa07q_manualActions p{max-width:520px;color:var(--mn-faint);margin:0;font-size:10px}.IIa07q_listToolbar{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:11px;grid-template-columns:minmax(0,1fr) 170px auto;gap:9px;padding:12px;display:grid}.IIa07q_listToolbar input,.IIa07q_listToolbar select{width:100%;min-width:0}.IIa07q_listNotice{color:var(--mn-faint);margin:10px 0 16px;font-size:10px}.IIa07q_listNotice span{color:var(--mn-success);font:650 9px var(--mn-code);letter-spacing:.08em;margin-right:7px}.IIa07q_memoryList{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:9px;display:grid}.IIa07q_memoryList .IIa07q_insightCard{height:100%;margin:0}.IIa07q_listProgress{border-top:1px solid var(--mn-line);min-height:58px;color:var(--mn-faint);justify-content:center;align-items:center;gap:13px;margin-top:12px;padding:10px;font-size:10px;display:flex}.IIa07q_compactListProgress{border-top:1px solid var(--mn-line);color:var(--mn-faint);text-align:center;justify-items:stretch;gap:7px;margin-top:8px;padding:10px 2px 2px;font-size:10px;display:grid}.IIa07q_compactListProgress button{width:100%}.IIa07q_modalPortal{z-index:2147483647;isolation:isolate;pointer-events:none;position:fixed;inset:0}.IIa07q_modalTheme.IIa07q_modalTheme.IIa07q_modalTheme{width:auto;min-width:0;height:auto;min-height:0;color:var(--mn-text);pointer-events:none;background:0 0;display:block;position:absolute;inset:0;overflow:visible}.IIa07q_modalBackdrop{z-index:0;overscroll-behavior:contain;touch-action:none;pointer-events:auto;background:#0206178a;justify-content:center;align-items:center;padding:24px;animation:.18s ease-out both IIa07q_mnemon-dialog-backdrop-enter;display:flex;position:fixed;inset:0;overflow:hidden}.IIa07q_modal{box-sizing:border-box;border:1px solid var(--mn-line);background:var(--mn-layer-1);touch-action:auto;transform-origin:50% 100%;backface-visibility:hidden;will-change:transform, opacity;border-radius:14px;flex-direction:column;width:min(680px,100vw - 48px);min-height:0;max-height:calc(100vh - 48px);animation:.22s cubic-bezier(.2,.75,.2,1) both IIa07q_mnemon-dialog-enter;display:flex;overflow:hidden;box-shadow:0 22px 60px #02061738}.IIa07q_modalBackdrop[data-closing],.IIa07q_modal[data-closing]{pointer-events:none}.IIa07q_modalDragHandle{display:none}.IIa07q_modalWide{width:min(780px,100vw - 48px)}.IIa07q_modal>header{border-bottom:1px solid var(--mn-line);flex:none;justify-content:space-between;align-items:flex-start;gap:18px;padding:15px 18px;display:flex}.IIa07q_modal>header>div{min-width:0}.IIa07q_modal>header h2{margin:0;font-size:15px;line-height:22px}.IIa07q_modal>header p{overflow-wrap:anywhere;max-width:64ch;color:var(--mn-muted);margin:3px 0 0;font-size:12px;line-height:1.5}.IIa07q_modal>header .IIa07q_iconButton{flex:none}.IIa07q_modalBody{overscroll-behavior:contain;scrollbar-gutter:stable;touch-action:pan-y;-webkit-overflow-scrolling:touch;min-height:0;padding:18px;overflow:hidden auto}.IIa07q_modalFooter{border-top:1px solid var(--mn-line);background:color-mix(in srgb, var(--mn-layer-1) 94%, var(--mn-layer-2));flex:none;justify-content:flex-end;align-items:center;gap:14px;padding:12px 18px;display:flex}.IIa07q_modalFooterNote{max-width:54ch;color:var(--mn-muted);margin:0 auto 0 0;font-size:9px;line-height:1.5}.IIa07q_modalFooterMeta{color:var(--mn-faint);margin-right:auto;font-size:9px}.IIa07q_modalFooterActions{justify-content:flex-end;align-items:center;gap:8px;min-width:0;margin-left:auto;display:flex}.IIa07q_modalInlineStatus{color:var(--mn-muted);overflow-wrap:anywhere;margin:12px 0 0;font-size:11px;line-height:1.5}@supports (height:100dvh){.IIa07q_modal{max-height:calc(100dvh - 48px)}}@keyframes IIa07q_mnemon-dialog-backdrop-enter{0%{opacity:0}}@keyframes IIa07q_mnemon-dialog-enter{0%{opacity:0;transform:translateY(10px)scale(.985)}}@keyframes IIa07q_mnemon-sheet-enter{0%{transform:translateY(calc(100% + 32px))}to{transform:translate3d(0, var(--mn-modal-drag-y,0px), 0)}}.IIa07q_metadataDialog{gap:12px;display:grid}.IIa07q_metadataToolbar{color:var(--mn-muted);justify-content:space-between;align-items:center;gap:12px;font-size:10px;display:flex}.IIa07q_metadataToolbar>span{align-items:center;gap:7px;min-width:0;display:flex}.IIa07q_metadataToolbar em{color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 9%, transparent);font:650 8px var(--mn-code);border-radius:999px;padding:2px 5px;font-style:normal}.IIa07q_metadataList{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;display:grid}.IIa07q_metadataEmpty{border:1px dashed var(--mn-line);color:var(--mn-muted);background:color-mix(in srgb, var(--mn-layer-2) 76%, transparent);text-align:center;border-radius:8px;grid-column:1/-1;padding:18px;font-size:10px}.IIa07q_metadataList>label{cursor:pointer;grid-template-columns:16px minmax(0,1fr);align-items:start;gap:9px;min-width:0;min-height:76px;padding:10px 10px 10px 13px;display:grid;position:relative}.IIa07q_metadataList>label[data-selected]{border-color:color-mix(in srgb, var(--mn-accent) 48%, var(--mn-line));box-shadow:inset 3px 0 0 var(--mn-provider-color), inset 0 0 0 1px color-mix(in srgb, var(--mn-accent) 10%, transparent)}.IIa07q_metadataList>label[data-refreshing]{overflow:hidden}.IIa07q_metadataList>label[data-refreshing]:after{content:\"\";background:linear-gradient(105deg, transparent 20%, color-mix(in srgb, var(--mn-provider-color) 16%, transparent) 45%, transparent 70%);pointer-events:none;animation:.9s ease-in-out infinite IIa07q_mnemon-metadata-sweep;position:absolute;inset:0;transform:translate(-120%)}.IIa07q_metadataList>label[data-refreshed]{animation:.9s ease-out IIa07q_mnemon-metadata-refreshed}.IIa07q_metadataList>label[data-failed]{border-color:color-mix(in srgb, var(--mn-danger) 42%, var(--mn-line))}.IIa07q_metadataList>label>input{opacity:0;pointer-events:none;width:1px;height:1px;position:absolute}.IIa07q_metadataList>label>span{gap:4px;min-width:0;display:grid}.IIa07q_metadataList strong{text-overflow:ellipsis;white-space:nowrap;font-size:11px;overflow:hidden}.IIa07q_metadataList small{color:var(--mn-muted);-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:9px;line-height:1.45;display:-webkit-box;overflow:hidden}.IIa07q_metadataList>label>span>span{align-items:center;gap:6px;min-width:0;display:flex}.IIa07q_metadataList code{color:var(--mn-faint);font:8px var(--mn-code);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.IIa07q_metadataTaskStatus{min-width:0;font:650 8px var(--mn-code);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.IIa07q_metadataTaskStatus[data-status=running]{color:var(--mn-provider-color)}.IIa07q_metadataTaskStatus[data-status=success]{color:var(--mn-success)}.IIa07q_metadataTaskStatus[data-status=error]{color:var(--mn-danger)}@keyframes IIa07q_mnemon-metadata-sweep{to{transform:translate(120%)}}@keyframes IIa07q_mnemon-metadata-refreshed{0%{border-color:color-mix(in srgb, var(--mn-provider-color) 72%, var(--mn-line));box-shadow:inset 3px 0 0 var(--mn-provider-color), 0 0 0 3px color-mix(in srgb, var(--mn-provider-color) 14%, transparent)}to{border-color:var(--mn-line);box-shadow:inset 3px 0 0 color-mix(in srgb, var(--mn-provider-color) 68%, transparent)}}@media (prefers-reduced-motion:reduce){.IIa07q_metadataList>label[data-refreshing]:after,.IIa07q_metadataList>label[data-refreshed]{animation:none}}.IIa07q_healthStrip{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:12px;grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:13px;display:grid;position:relative;overflow:hidden}.IIa07q_asyncStatusBlock{min-width:0;min-height:36px;position:relative}.IIa07q_healthStrip article{box-sizing:border-box;border-right:1px solid var(--mn-line);align-items:flex-start;gap:10px;min-width:0;min-height:78px;padding:14px 15px;display:flex}.IIa07q_healthStrip article>div{min-width:0}.IIa07q_healthStrip article:last-child{border-right:0}.IIa07q_healthStrip small{color:var(--mn-faint);font:650 10px var(--mn-code);letter-spacing:.06em;margin-bottom:4px;display:block}.IIa07q_healthStrip strong{text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;display:block;overflow:hidden}.IIa07q_healthStrip p{color:var(--mn-muted);text-overflow:ellipsis;white-space:nowrap;margin:3px 0 0;font-size:10.5px;overflow:hidden}.IIa07q_healthIndicator{width:7px;height:7px;box-shadow:0 0 0 4px color-mix(in srgb, currentColor 9%, transparent);border-radius:50%;flex:none;margin-top:3px}.IIa07q_healthGood{color:var(--mn-success);background:currentColor}.IIa07q_healthBad{color:var(--mn-danger);background:currentColor}.IIa07q_healthMuted{color:var(--mn-faint);background:currentColor}.IIa07q_nativeProviderHealth{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:11px;align-items:center;gap:10px;min-width:0;min-height:62px;margin-bottom:9px;padding:10px 12px;display:flex}.IIa07q_nativeProviderHealth[data-status=healthy]{border-color:color-mix(in srgb, var(--mn-success) 22%, var(--mn-line))}.IIa07q_nativeProviderHealth[data-status=unhealthy]{border-color:color-mix(in srgb, var(--mn-danger) 30%, var(--mn-line));background:color-mix(in srgb, var(--mn-danger) 3%, var(--mn-layer-1))}.IIa07q_nativeProviderCopy{flex:1;gap:1px;min-width:0;display:grid}.IIa07q_nativeProviderCopy>small{color:var(--mn-faint);font:650 8px var(--mn-code);letter-spacing:.06em;text-transform:uppercase}.IIa07q_nativeProviderCopy>strong{font-size:11.5px}.IIa07q_nativeProviderCopy>p{color:var(--mn-danger);text-overflow:ellipsis;white-space:nowrap;margin:2px 0 0;font-size:8.5px;overflow:hidden}.IIa07q_nativeProviderMeta{text-align:right;flex:none;justify-items:end;gap:3px;display:grid}.IIa07q_nativeProviderMeta>span{color:var(--mn-muted);align-items:center;gap:6px;font-size:9px;display:flex}.IIa07q_nativeProviderMeta>span i{width:6px;height:6px;color:var(--mn-faint);box-shadow:0 0 0 3px color-mix(in srgb, currentColor 8%, transparent);background:currentColor;border-radius:50%}.IIa07q_nativeProviderHealth[data-status=healthy] .IIa07q_nativeProviderMeta>span i{color:var(--mn-success)}.IIa07q_nativeProviderHealth[data-status=idle] .IIa07q_nativeProviderMeta>span i{color:var(--mn-accent)}.IIa07q_nativeProviderHealth[data-status=unhealthy] .IIa07q_nativeProviderMeta>span,.IIa07q_nativeProviderHealth[data-status=unhealthy] .IIa07q_nativeProviderMeta>span i{color:var(--mn-danger)}.IIa07q_nativeProviderMeta>small{color:var(--mn-faint);font:9px var(--mn-code)}.IIa07q_providerHealth{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:12px;margin-bottom:13px;padding:16px}.IIa07q_providerHealthList{border-top:1px solid var(--mn-line);border-bottom:1px solid var(--mn-line);margin-top:12px}.IIa07q_providerHealthList article{align-items:center;gap:10px;min-width:0;min-height:58px;padding:9px 2px;display:flex}.IIa07q_providerHealthList article+article{border-top:1px solid var(--mn-line)}.IIa07q_providerHealthMark{box-sizing:border-box;border:1px solid var(--mn-line);background:var(--mn-layer-2);border-radius:8px;flex:none;place-items:center;width:30px;height:30px;padding:3px;display:grid;overflow:hidden}.IIa07q_providerHealthMark>img,.IIa07q_providerHealthMark>svg{object-fit:contain;border-radius:5px;width:100%;height:100%;display:block}.IIa07q_providerHealthCopy{flex:1;gap:1px;min-width:0;display:grid}.IIa07q_providerHealthCopy strong{text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;overflow:hidden}.IIa07q_providerHealthCopy small{color:var(--mn-faint);font-size:9px}.IIa07q_providerHealthCopy p{color:var(--mn-danger);text-overflow:ellipsis;white-space:nowrap;margin:2px 0 0;font-size:8.5px;overflow:hidden}.IIa07q_providerHealthMeta{flex:none;align-items:center;gap:7px;display:flex}.IIa07q_providerHealthMeta small{color:var(--mn-faint);font:9px var(--mn-code)}.IIa07q_providerHealthSignal{width:6px;height:6px;color:var(--mn-faint);box-shadow:0 0 0 3px color-mix(in srgb, currentColor 8%, transparent);background:currentColor;border-radius:50%}.IIa07q_providerHealthList article[data-status=healthy] .IIa07q_providerHealthSignal{color:var(--mn-success)}.IIa07q_providerHealthList article[data-status=unhealthy] .IIa07q_providerHealthSignal{color:var(--mn-danger)}.IIa07q_providerHealthList article[data-status=idle] .IIa07q_providerHealthSignal{color:var(--mn-accent)}.IIa07q_storageDomains{border:1px solid var(--mn-line);background:var(--mn-layer-1);border-radius:12px;margin-bottom:13px;padding:16px}.IIa07q_storageRoot{border:1px solid var(--mn-line);background:color-mix(in srgb, var(--mn-layer-2) 45%, transparent);border-radius:9px;justify-content:space-between;align-items:center;gap:18px;min-width:0;margin-top:12px;padding:11px 12px;display:flex}.IIa07q_storageRoot>div:first-child{gap:4px;min-width:0;display:grid}.IIa07q_storageRoot span,.IIa07q_storageRoot small{color:var(--mn-faint);font-size:9px}.IIa07q_storageRoot code{color:var(--mn-muted);text-overflow:ellipsis;white-space:nowrap;font-size:10px;overflow:hidden}.IIa07q_storageRoot>div:last-child{flex:none;justify-items:end;gap:3px;display:grid}.IIa07q_storageRoot strong{font:650 11px var(--mn-code)}.IIa07q_storageAreaGrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px;display:grid}.IIa07q_storageAreaGrid article{box-sizing:border-box;border:1px solid var(--mn-line);background:color-mix(in srgb, var(--mn-layer-2) 30%, var(--mn-layer-1));border-radius:9px;flex-direction:column;min-width:0;min-height:150px;padding:12px;display:flex}.IIa07q_storageAreaGrid article>header{justify-content:space-between;align-items:center;gap:8px;display:flex}.IIa07q_storageAreaGrid article>header>div{align-items:center;gap:7px;min-width:0;display:flex}.IIa07q_storageAreaGrid article>header span{background:var(--mn-faint);border-radius:50%;flex:none;width:6px;height:6px}.IIa07q_storageAreaGrid article[data-status=ready]>header span{background:var(--mn-success);box-shadow:0 0 0 3px color-mix(in srgb, var(--mn-success) 9%, transparent)}.IIa07q_storageAreaGrid article[data-status=invalid]>header span{background:var(--mn-danger);box-shadow:0 0 0 3px color-mix(in srgb, var(--mn-danger) 9%, transparent)}.IIa07q_storageAreaGrid article>header strong{text-overflow:ellipsis;white-space:nowrap;font-size:10px;overflow:hidden}.IIa07q_storageAreaGrid article>header em{color:var(--mn-faint);font:normal 8px var(--mn-code);white-space:nowrap}.IIa07q_storageAreaMetric{align-items:baseline;gap:5px;margin-top:14px;display:flex}.IIa07q_storageAreaMetric strong{font:650 20px var(--mn-code)}.IIa07q_storageAreaMetric span{color:var(--mn-faint);font-size:9px}.IIa07q_storageAreaMetric code{color:var(--mn-muted);margin-left:auto;font-size:9px}.IIa07q_storageAreaGrid article>p{min-height:28px;color:var(--mn-muted);margin:8px 0;font-size:9px;line-height:1.5}.IIa07q_storagePath{border-top:1px solid var(--mn-line);color:var(--mn-faint);text-overflow:ellipsis;white-space:nowrap;margin-top:auto;padding-top:8px;font-size:8px;display:block;overflow:hidden}.IIa07q_storageAreaGrid article>small{color:var(--mn-danger);margin-top:6px;font-size:8px;line-height:1.4;display:block}.IIa07q_storageUnavailable{border:1px dashed var(--mn-line);min-height:126px;color:var(--mn-muted);text-align:center;border-radius:9px;place-content:center;gap:5px;margin-top:12px;display:grid}.IIa07q_storageUnavailable strong{font-size:12px}.IIa07q_storageUnavailable p{max-width:520px;color:var(--mn-faint);margin:0;font-size:10px}.IIa07q_storageFootnote{color:var(--mn-faint);margin:11px 0 0;font-size:9px;line-height:1.5}.IIa07q_statusSectionHeader{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.IIa07q_statusSectionHeader h3{margin:4px 0 0;font-size:15px}.IIa07q_statusSectionHeader p{max-width:590px;color:var(--mn-muted);margin:5px 0 0;font-size:10px}.IIa07q_phaseBadge{border:1px solid color-mix(in srgb, var(--mn-accent) 25%, var(--mn-line));color:var(--mn-accent);background:color-mix(in srgb, var(--mn-accent) 7%, transparent);font:650 9px var(--mn-code);border-radius:999px;padding:4px 8px}.IIa07q_statusHeaderActions{align-items:center;gap:8px;display:flex}.IIa07q_versionDialogBody{gap:12px;display:grid}.IIa07q_versionChecking{min-height:112px;color:var(--mn-muted);justify-content:center;align-items:center;gap:10px;font-size:12px;display:flex}.IIa07q_versionChecking span{border:2px solid var(--mn-line);border-top-color:var(--mn-accent);border-radius:50%;width:14px;height:14px;animation:.8s linear infinite IIa07q_mnemon-spin}.IIa07q_versionError,.IIa07q_versionResult{border:1px solid color-mix(in srgb, var(--mn-danger) 28%, var(--mn-line));color:var(--mn-danger);background:color-mix(in srgb, var(--mn-danger) 6%, transparent);border-radius:9px;padding:11px 12px}.IIa07q_versionResult{border-color:color-mix(in srgb, var(--mn-success) 28%, var(--mn-line));color:var(--mn-success);background:color-mix(in srgb, var(--mn-success) 6%, transparent)}.IIa07q_versionError strong,.IIa07q_versionResult strong{font-size:12px}.IIa07q_versionError p,.IIa07q_versionResult p{color:var(--mn-muted);margin:3px 0 0;font-size:11px;line-height:1.5}.IIa07q_versionList{gap:9px;display:grid}.IIa07q_versionList article{border:1px solid var(--mn-line);background:color-mix(in srgb, var(--mn-layer-2) 34%, var(--mn-layer-1));border-radius:10px;padding:13px}.IIa07q_versionList article[data-outdated]{border-color:color-mix(in srgb, var(--mn-accent) 30%, var(--mn-line))}.IIa07q_versionList article>header{justify-content:space-between;align-items:center;gap:12px;display:flex}.IIa07q_versionList article>header>div{align-items:center;gap:8px;min-width:0;display:flex}.IIa07q_versionList article>header strong{font-size:13px}.IIa07q_versionList article>header span{border:1px solid var(--mn-line);color:var(--mn-muted);font:500 9px var(--mn-code);border-radius:999px;padding:3px 7px}.IIa07q_versionList article>header em{color:var(--mn-success);font:normal 10px var(--mn-code);white-space:nowrap}.IIa07q_versionList article[data-outdated]>header em{color:var(--mn-accent)}.IIa07q_versionNumbers{grid-template-columns:1fr auto 1fr;align-items:end;gap:10px;margin-top:13px;display:grid}.IIa07q_versionNumbers>div{gap:3px;display:grid}.IIa07q_versionNumbers small{color:var(--mn-faint);font-size:9px}.IIa07q_versionNumbers code{font-size:12px}.IIa07q_versionNumbers>span{color:var(--mn-faint);padding-bottom:1px}.IIa07q_versionLocation{min-width:0;color:var(--mn-faint);gap:6px;margin-top:9px;font-size:9px;display:flex}.IIa07q_versionLocation>span{flex:none}.IIa07q_versionLocation>code{min-width:0;color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:inherit;overflow:hidden}.IIa07q_versionList article>footer{border-top:1px solid var(--mn-line);justify-content:space-between;align-items:flex-end;gap:16px;margin-top:10px;padding-top:10px;display:flex}.IIa07q_versionList article>footer p{max-width:470px;color:var(--mn-muted);margin:0;font-size:10.5px;line-height:1.5}.IIa07q_versionList article>footer button{flex:none}@media (width<=1000px){.IIa07q_graphLayout{display:block;position:relative}.IIa07q_graphInspector{width:auto;min-height:0;box-shadow:none;margin-top:10px;position:static;overflow:visible}.IIa07q_graphInspector[data-empty]{display:none}.IIa07q_resultLayout{grid-template-columns:1fr}.IIa07q_relatedPane{grid-row:1;max-height:none;position:static}.IIa07q_memoryList{grid-template-columns:1fr}.IIa07q_storageAreaGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.IIa07q_runtimeGrid,.IIa07q_runtimeSummaryGrid{grid-template-columns:1fr}.IIa07q_documentWorkspace{grid-template-columns:minmax(220px,270px) minmax(0,1fr)}.IIa07q_documentDetail>dl{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (width<=760px){.IIa07q_metadataList{grid-template-columns:1fr}.IIa07q_shell{min-height:0;overflow:hidden}.IIa07q_masthead{grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;min-height:76px;padding:10px 14px}.IIa07q_brandLogo{width:36px;height:36px}.IIa07q_headerActions{max-width:52vw}.IIa07q_workspacePicker>span{display:none}.IIa07q_workspacePicker select{width:min(170px,32vw)}.IIa07q_statusCluster>span:not(.IIa07q_statusDot){display:none}.IIa07q_modalBackdrop{padding:max(10px, env(safe-area-inset-top,0px)) 0 0;align-items:flex-end}.IIa07q_modal,.IIa07q_modalWide{width:100vw;max-height:calc(100vh - max(10px, env(safe-area-inset-top,0px)));transform:translate3d(0, var(--mn-modal-drag-y,0px), 0);border-bottom:0;border-radius:18px 18px 0 0;animation-name:IIa07q_mnemon-sheet-enter;animation-duration:.34s;animation-timing-function:cubic-bezier(.2,.82,.2,1)}.IIa07q_modalDragHandle{cursor:grab;touch-action:none;user-select:none;flex:none;place-items:center;width:100%;height:28px;display:grid}.IIa07q_modalDragHandle span{background:var(--mn-line-strong);border-radius:999px;width:36px;height:4px;transition:width .14s,background-color .14s}.IIa07q_modal[data-dragging] .IIa07q_modalDragHandle{cursor:grabbing}.IIa07q_modal[data-dragging] .IIa07q_modalDragHandle span{background:color-mix(in srgb, var(--mn-accent) 52%, var(--mn-line-strong));width:44px}.IIa07q_modal>header{padding:10px max(14px, env(safe-area-inset-right,0px)) 12px max(14px, env(safe-area-inset-left,0px));gap:12px}.IIa07q_modal>header p{-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.IIa07q_modal>header .IIa07q_iconButton{width:44px;height:44px;margin:-4px -5px -4px 0}.IIa07q_modalBody{padding:14px max(14px, env(safe-area-inset-right,0px)) 18px max(14px, env(safe-area-inset-left,0px));scrollbar-gutter:auto;scroll-padding-bottom:12px}.IIa07q_modalBody button{min-height:44px}.IIa07q_modalFooter{padding:10px max(14px, env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(14px, env(safe-area-inset-left,0px));flex-direction:column;align-items:stretch;gap:8px}.IIa07q_modalFooterNote,.IIa07q_modalFooterMeta{max-width:none;margin:0;font-size:10px}.IIa07q_modalFooterActions{grid-template-columns:minmax(82px,.55fr) minmax(0,1.45fr);gap:8px;width:100%;margin:0;display:grid}.IIa07q_modalFooterActions button{white-space:normal;min-width:0;min-height:44px;padding-block:8px}.IIa07q_modal .IIa07q_supervisedForm textarea{min-height:clamp(130px,30vh,210px)}.IIa07q_versionList article>footer{flex-direction:column;align-items:stretch}.IIa07q_telemetry{border-top:1px solid var(--mn-line);grid-column:1/-1;justify-content:space-between;padding-top:8px}.IIa07q_telemetryMetric{text-align:center;flex:1;justify-items:center;gap:3px;min-width:0;padding:0 5px}.IIa07q_telemetryMetric:first-child{border-left:0}.IIa07q_topNavigation{padding:0 10px;position:relative}.IIa07q_topNavigation:after{z-index:2;pointer-events:none;content:\"›\";width:34px;color:var(--mn-faint);background:linear-gradient(90deg, transparent, var(--mn-layer-1) 72%);font:16px var(--mn-code);place-items:center end;padding-right:5px;display:grid;position:absolute;top:0;bottom:0;right:0}.IIa07q_nav{flex:1;padding-right:26px;scroll-padding-inline:10px 34px}.IIa07q_navGroup{gap:3px}.IIa07q_navGroupDivider{height:18px}.IIa07q_nav button{text-align:center;flex-direction:column;justify-content:center;gap:3px;min-width:60px;padding:4px 3px}.IIa07q_spaceSummary{display:none}.IIa07q_navGlyph{line-height:1}.IIa07q_page{padding:18px 13px calc(170px + env(safe-area-inset-bottom,0px))}.IIa07q_pageHeader{gap:10px;display:grid}.IIa07q_pageHeaderMeta{justify-content:space-between}.IIa07q_entityLayout,.IIa07q_writebackLayout{grid-template-columns:1fr}.IIa07q_runtimeComposerHeading,.IIa07q_runtimeComposerActions{flex-direction:column;align-items:stretch}.IIa07q_runtimeComposerActions select,.IIa07q_runtimeComposerActions button{width:100%}.IIa07q_runtimeBrowserToolbar{flex-direction:column;align-items:stretch}.IIa07q_runtimeFilterQuery{width:100%;min-width:0}.IIa07q_documentSummary{grid-template-columns:repeat(2,minmax(0,1fr))}.IIa07q_documentCapacity{grid-column:1/-1}.IIa07q_documentToolbar{flex-direction:column;align-items:stretch}.IIa07q_documentToolbar form{min-width:0}.IIa07q_documentToolbar>div,.IIa07q_documentToolbar>button{width:100%}.IIa07q_documentToolbar>div button{flex:1}.IIa07q_documentWorkspace{grid-template-columns:1fr;min-height:0}.IIa07q_documentList{-webkit-overflow-scrolling:touch;max-height:330px;overflow:auto}.IIa07q_documentReader{min-height:430px}.IIa07q_documentEditorMeta{grid-template-columns:1fr}.IIa07q_manualActions{flex-direction:column;align-items:stretch}.IIa07q_entityRail{position:static}.IIa07q_searchControls{grid-template-columns:repeat(2,minmax(0,1fr));display:grid}.IIa07q_searchActions{grid-column:1/-1}.IIa07q_searchActions>button{flex:1}.IIa07q_searchControls select{width:100%;min-width:0}.IIa07q_listToolbar{grid-template-columns:1fr}.IIa07q_bodyDirectoryHeader{display:grid}.IIa07q_bodyCreate form,.IIa07q_createIdentityGrid,.IIa07q_placementMode,.IIa07q_placementRuleGrid,.IIa07q_placementCandidates,.IIa07q_providerChoice,.IIa07q_providerAdvancedGrid{grid-template-columns:1fr}.IIa07q_graphViewport{min-height:360px}.IIa07q_graphSvg{height:390px}.IIa07q_graphCanvasControls{top:7px;right:7px}.IIa07q_graphCanvasControls span{display:none}.IIa07q_healthStrip{grid-template-columns:1fr}.IIa07q_nativeProviderHealth{align-items:flex-start}.IIa07q_nativeProviderMeta{justify-items:end}.IIa07q_providerHealthMeta{flex-direction:column;align-items:flex-end;gap:4px}.IIa07q_storageRoot{flex-direction:column;align-items:flex-start}.IIa07q_storageRoot>div:last-child{justify-items:start}.IIa07q_storageAreaGrid{grid-template-columns:1fr}.IIa07q_flowLegend span:last-child{width:100%;margin-left:0}.IIa07q_healthStrip article{border-right:0;border-bottom:1px solid var(--mn-line)}.IIa07q_healthStrip article:last-child{border-bottom:0}.IIa07q_workspaceMismatch{flex-direction:column;align-items:stretch;margin-inline:13px}.IIa07q_workspaceMismatch>button{align-self:flex-start}}@media (width<=520px){.IIa07q_masthead{min-height:68px}.IIa07q_brand h1{font-size:16px}.IIa07q_headerActions{max-width:58vw}.IIa07q_workspacePicker select{width:min(150px,39vw)}.IIa07q_telemetryMetric span{font-size:10px}.IIa07q_nav{scroll-snap-type:x proximity}.IIa07q_nav button{scroll-snap-align:start;min-width:68px}.IIa07q_pageHeader h2{font-size:19px}.IIa07q_pageHeaderMeta{flex-wrap:wrap;align-items:stretch}.IIa07q_pageHeaderMeta>code{align-items:center;min-height:34px;display:flex}.IIa07q_pageHeaderMeta>button{flex:1}.IIa07q_memoryHeaderActions{width:100%}.IIa07q_memoryHeaderActions>button{flex:1}.IIa07q_emptyState{text-align:center;flex-direction:column;gap:14px;min-height:190px;padding:24px 18px}.IIa07q_emptyGlyph{width:62px;height:62px}.IIa07q_documentDetail>header,.IIa07q_documentDanger,.IIa07q_supervisedHeading,.IIa07q_cardTop{flex-direction:column;align-items:flex-start}.IIa07q_documentDetail>header>div:last-child,.IIa07q_documentDetail>header button{width:100%}.IIa07q_documentDanger>div,.IIa07q_documentDanger>span{margin-right:0}.IIa07q_documentDanger>button{width:100%}.IIa07q_documentDetail>dl{grid-template-columns:1fr}.IIa07q_markdownBody{padding:16px;font-size:12.5px}.IIa07q_cardActions,.IIa07q_confirmBar{flex-wrap:wrap;align-items:stretch}.IIa07q_cardActions button{flex:1}.IIa07q_confirmBar>span{width:100%;margin:0 0 4px}.IIa07q_formActions{flex-direction:column;align-items:stretch}.IIa07q_formActions button{width:100%}.IIa07q_formGrid,.IIa07q_searchControls{grid-template-columns:1fr}.IIa07q_bodyCreateActions{flex-direction:column-reverse;align-items:stretch}.IIa07q_bodyCreateActions button{width:100%}}@media (width<=360px){.IIa07q_modalFooterActions{grid-template-columns:1fr}}@media (height<=420px){.IIa07q_modal>header p{white-space:nowrap;text-overflow:ellipsis;display:block;overflow:hidden}}@media (width>=761px) and (height<=560px){.IIa07q_modalBackdrop{padding:8px}.IIa07q_modal{max-height:calc(100vh - 16px)}}@supports (height:100dvh){@media (width<=760px){.IIa07q_modal,.IIa07q_modalWide{max-height:calc(100dvh - max(10px, env(safe-area-inset-top,0px)))}.IIa07q_modal .IIa07q_supervisedForm textarea{min-height:clamp(130px,30dvh,210px)}}@media (width>=761px) and (height<=560px){.IIa07q_modal{max-height:calc(100dvh - 16px)}}}@media (width<=1000px) and (height<=760px){.IIa07q_shell{min-height:0}.IIa07q_masthead{min-height:58px}.IIa07q_telemetryMetric{min-width:0;padding:1px 9px}.IIa07q_topNavigation{min-height:44px}.IIa07q_nav button{min-height:42px}.IIa07q_graphViewport{min-height:300px}.IIa07q_graphSvg{height:300px}}@media (width<=760px) and (pointer:coarse){.IIa07q_shell input,.IIa07q_shell select,.IIa07q_shell textarea{font-size:16px!important}}@media (pointer:coarse){.IIa07q_modal>header .IIa07q_iconButton{width:44px;min-width:44px;height:44px;min-height:44px}.IIa07q_modalBody button,.IIa07q_modalFooter button{min-height:44px}}@media (prefers-reduced-motion:reduce){.IIa07q_shell *,.IIa07q_shell :before,.IIa07q_shell :after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}.IIa07q_modalBackdrop,.IIa07q_modal{animation:none!important}.IIa07q_insightCard:hover{transform:none}.IIa07q_flowConnector[data-active] i:before{display:none}}";
		const tagId$3 = "dsh-mnemon/src/client/MnemonView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-mnemon";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var MnemonView_module_css_default = {
			"advancedWrite": "IIa07q_advancedWrite",
			"agentAnswer": "IIa07q_agentAnswer",
			"agentAnswerHeading": "IIa07q_agentAnswerHeading",
			"agentCitations": "IIa07q_agentCitations",
			"alert": "IIa07q_alert",
			"asyncPlaceholder": "IIa07q_asyncPlaceholder",
			"asyncRegion": "IIa07q_asyncRegion",
			"asyncResults": "IIa07q_asyncResults",
			"asyncStatusBlock": "IIa07q_asyncStatusBlock",
			"backButton": "IIa07q_backButton",
			"badge": "IIa07q_badge",
			"badges": "IIa07q_badges",
			"bodyCard": "IIa07q_bodyCard",
			"bodyCardActions": "IIa07q_bodyCardActions",
			"bodyCardTop": "IIa07q_bodyCardTop",
			"bodyCreate": "IIa07q_bodyCreate",
			"bodyCreateActions": "IIa07q_bodyCreateActions",
			"bodyCreateForm": "IIa07q_bodyCreateForm",
			"bodyDeleteConfirm": "IIa07q_bodyDeleteConfirm",
			"bodyDeleteContent": "IIa07q_bodyDeleteContent",
			"bodyDeleteSummary": "IIa07q_bodyDeleteSummary",
			"bodyDirectory": "IIa07q_bodyDirectory",
			"bodyDirectoryControls": "IIa07q_bodyDirectoryControls",
			"bodyDirectoryEmpty": "IIa07q_bodyDirectoryEmpty",
			"bodyDirectoryHeader": "IIa07q_bodyDirectoryHeader",
			"bodyDirectoryPath": "IIa07q_bodyDirectoryPath",
			"bodyEdit": "IIa07q_bodyEdit",
			"bodyEditActions": "IIa07q_bodyEditActions",
			"bodyEditButton": "IIa07q_bodyEditButton",
			"bodyFooterBlock": "IIa07q_bodyFooterBlock",
			"bodyFooterGrow": "IIa07q_bodyFooterGrow",
			"bodyGrid": "IIa07q_bodyGrid",
			"bodyHealth": "IIa07q_bodyHealth",
			"bodyProviderRow": "IIa07q_bodyProviderRow",
			"bodySignal": "IIa07q_bodySignal",
			"bodySwitch": "IIa07q_bodySwitch",
			"bodySwitchTrack": "IIa07q_bodySwitchTrack",
			"brand": "IIa07q_brand",
			"brandLogo": "IIa07q_brandLogo",
			"candidateIcon": "IIa07q_candidateIcon",
			"canvas": "IIa07q_canvas",
			"capabilityRules": "IIa07q_capabilityRules",
			"capacityLine": "IIa07q_capacityLine",
			"cardActions": "IIa07q_cardActions",
			"cardKicker": "IIa07q_cardKicker",
			"cardTop": "IIa07q_cardTop",
			"categoryChip": "IIa07q_categoryChip",
			"checking": "IIa07q_checking",
			"choiceControl": "IIa07q_choiceControl",
			"compactListProgress": "IIa07q_compactListProgress",
			"confirmBar": "IIa07q_confirmBar",
			"content": "IIa07q_content",
			"createIdentityGrid": "IIa07q_createIdentityGrid",
			"createSection": "IIa07q_createSection",
			"createSectionHeading": "IIa07q_createSectionHeading",
			"dangerButton": "IIa07q_dangerButton",
			"dangerSolidButton": "IIa07q_dangerSolidButton",
			"documentArchiveReceipt": "IIa07q_documentArchiveReceipt",
			"documentCapacity": "IIa07q_documentCapacity",
			"documentDanger": "IIa07q_documentDanger",
			"documentDetail": "IIa07q_documentDetail",
			"documentEditor": "IIa07q_documentEditor",
			"documentEditorMeta": "IIa07q_documentEditorMeta",
			"documentList": "IIa07q_documentList",
			"documentListEmpty": "IIa07q_documentListEmpty",
			"documentReader": "IIa07q_documentReader",
			"documentSources": "IIa07q_documentSources",
			"documentSummary": "IIa07q_documentSummary",
			"documentToolbar": "IIa07q_documentToolbar",
			"documentWorkspace": "IIa07q_documentWorkspace",
			"emptyGlyph": "IIa07q_emptyGlyph",
			"emptyState": "IIa07q_emptyState",
			"entities": "IIa07q_entities",
			"entityHeading": "IIa07q_entityHeading",
			"entityLayout": "IIa07q_entityLayout",
			"entityList": "IIa07q_entityList",
			"entityRail": "IIa07q_entityRail",
			"entityResults": "IIa07q_entityResults",
			"entitySearch": "IIa07q_entitySearch",
			"fieldWide": "IIa07q_fieldWide",
			"flowConnector": "IIa07q_flowConnector",
			"flowLegend": "IIa07q_flowLegend",
			"formActions": "IIa07q_formActions",
			"formGrid": "IIa07q_formGrid",
			"ghostButton": "IIa07q_ghostButton",
			"graphBackdrop": "IIa07q_graphBackdrop",
			"graphCanvasControls": "IIa07q_graphCanvasControls",
			"graphEdge": "IIa07q_graphEdge",
			"graphFooter": "IIa07q_graphFooter",
			"graphGridLine": "IIa07q_graphGridLine",
			"graphInspector": "IIa07q_graphInspector",
			"graphLayout": "IIa07q_graphLayout",
			"graphLegend": "IIa07q_graphLegend",
			"graphNode": "IIa07q_graphNode",
			"graphPanel": "IIa07q_graphPanel",
			"graphSvg": "IIa07q_graphSvg",
			"graphToolbar": "IIa07q_graphToolbar",
			"graphViewport": "IIa07q_graphViewport",
			"headerActions": "IIa07q_headerActions",
			"healthBad": "IIa07q_healthBad",
			"healthGood": "IIa07q_healthGood",
			"healthIndicator": "IIa07q_healthIndicator",
			"healthMuted": "IIa07q_healthMuted",
			"healthStrip": "IIa07q_healthStrip",
			"iconButton": "IIa07q_iconButton",
			"id": "IIa07q_id",
			"inlineError": "IIa07q_inlineError",
			"insightCard": "IIa07q_insightCard",
			"inspectorActions": "IIa07q_inspectorActions",
			"inspectorChips": "IIa07q_inspectorChips",
			"inspectorEmpty": "IIa07q_inspectorEmpty",
			"inspectorEye": "IIa07q_inspectorEye",
			"inspectorHeading": "IIa07q_inspectorHeading",
			"inspectorLogo": "IIa07q_inspectorLogo",
			"inspectorMeta": "IIa07q_inspectorMeta",
			"inspectorTitle": "IIa07q_inspectorTitle",
			"inspectorTitleRow": "IIa07q_inspectorTitleRow",
			"listNotice": "IIa07q_listNotice",
			"listProgress": "IIa07q_listProgress",
			"listToolbar": "IIa07q_listToolbar",
			"liveDot": "IIa07q_liveDot",
			"loading": "IIa07q_loading",
			"loadingPanel": "IIa07q_loadingPanel",
			"manualActions": "IIa07q_manualActions",
			"manualForm": "IIa07q_manualForm",
			"markdownBody": "IIa07q_markdownBody",
			"masthead": "IIa07q_masthead",
			"memoryHeaderActions": "IIa07q_memoryHeaderActions",
			"memoryList": "IIa07q_memoryList",
			"metadataDialog": "IIa07q_metadataDialog",
			"metadataEmpty": "IIa07q_metadataEmpty",
			"metadataList": "IIa07q_metadataList",
			"metadataTaskStatus": "IIa07q_metadataTaskStatus",
			"metadataToolbar": "IIa07q_metadataToolbar",
			"mnemon-dialog-backdrop-enter": "IIa07q_mnemon-dialog-backdrop-enter",
			"mnemon-dialog-enter": "IIa07q_mnemon-dialog-enter",
			"mnemon-metadata-refreshed": "IIa07q_mnemon-metadata-refreshed",
			"mnemon-metadata-sweep": "IIa07q_mnemon-metadata-sweep",
			"mnemon-sheet-enter": "IIa07q_mnemon-sheet-enter",
			"mnemon-spin": "IIa07q_mnemon-spin",
			"mnemonDefaultBadge": "IIa07q_mnemonDefaultBadge",
			"modal": "IIa07q_modal",
			"modalBackdrop": "IIa07q_modalBackdrop",
			"modalBody": "IIa07q_modalBody",
			"modalDragHandle": "IIa07q_modalDragHandle",
			"modalFooter": "IIa07q_modalFooter",
			"modalFooterActions": "IIa07q_modalFooterActions",
			"modalFooterMeta": "IIa07q_modalFooterMeta",
			"modalFooterNote": "IIa07q_modalFooterNote",
			"modalInlineStatus": "IIa07q_modalInlineStatus",
			"modalPortal": "IIa07q_modalPortal",
			"modalTheme": "IIa07q_modalTheme",
			"modalWide": "IIa07q_modalWide",
			"muted": "IIa07q_muted",
			"nativeProviderCopy": "IIa07q_nativeProviderCopy",
			"nativeProviderHealth": "IIa07q_nativeProviderHealth",
			"nativeProviderMeta": "IIa07q_nativeProviderMeta",
			"nav": "IIa07q_nav",
			"navGlyph": "IIa07q_navGlyph",
			"navGroup": "IIa07q_navGroup",
			"navGroupDivider": "IIa07q_navGroupDivider",
			"nodeBodyLabel": "IIa07q_nodeBodyLabel",
			"nodeCore": "IIa07q_nodeCore",
			"nodeHalo": "IIa07q_nodeHalo",
			"nodeLabel": "IIa07q_nodeLabel",
			"offline": "IIa07q_offline",
			"online": "IIa07q_online",
			"page": "IIa07q_page",
			"pageHeader": "IIa07q_pageHeader",
			"pageHeaderMeta": "IIa07q_pageHeaderMeta",
			"pageSpinner": "IIa07q_pageSpinner",
			"phaseBadge": "IIa07q_phaseBadge",
			"placementCandidates": "IIa07q_placementCandidates",
			"placementMode": "IIa07q_placementMode",
			"placementPolicy": "IIa07q_placementPolicy",
			"placementPolicyHeading": "IIa07q_placementPolicyHeading",
			"placementReceipt": "IIa07q_placementReceipt",
			"placementRuleGrid": "IIa07q_placementRuleGrid",
			"previewContent": "IIa07q_previewContent",
			"primaryButton": "IIa07q_primaryButton",
			"providerAdvancedGrid": "IIa07q_providerAdvancedGrid",
			"providerBadge": "IIa07q_providerBadge",
			"providerChoice": "IIa07q_providerChoice",
			"providerChoiceIcon": "IIa07q_providerChoiceIcon",
			"providerFieldControl": "IIa07q_providerFieldControl",
			"providerFieldHeading": "IIa07q_providerFieldHeading",
			"providerFieldIcon": "IIa07q_providerFieldIcon",
			"providerFieldIdentity": "IIa07q_providerFieldIdentity",
			"providerFields": "IIa07q_providerFields",
			"providerHealth": "IIa07q_providerHealth",
			"providerHealthCopy": "IIa07q_providerHealthCopy",
			"providerHealthList": "IIa07q_providerHealthList",
			"providerHealthMark": "IIa07q_providerHealthMark",
			"providerHealthMeta": "IIa07q_providerHealthMeta",
			"providerHealthSignal": "IIa07q_providerHealthSignal",
			"providerSecretClear": "IIa07q_providerSecretClear",
			"providerWriteHint": "IIa07q_providerWriteHint",
			"queryField": "IIa07q_queryField",
			"readSourceCard": "IIa07q_readSourceCard",
			"readSourceIdentity": "IIa07q_readSourceIdentity",
			"readSourceMeta": "IIa07q_readSourceMeta",
			"readSourceSignal": "IIa07q_readSourceSignal",
			"readSourceState": "IIa07q_readSourceState",
			"readSources": "IIa07q_readSources",
			"relatedPane": "IIa07q_relatedPane",
			"relatedSource": "IIa07q_relatedSource",
			"resultLayout": "IIa07q_resultLayout",
			"results": "IIa07q_results",
			"runtimeBrowser": "IIa07q_runtimeBrowser",
			"runtimeBrowserToolbar": "IIa07q_runtimeBrowserToolbar",
			"runtimeComposer": "IIa07q_runtimeComposer",
			"runtimeComposerActions": "IIa07q_runtimeComposerActions",
			"runtimeComposerHeading": "IIa07q_runtimeComposerHeading",
			"runtimeEmpty": "IIa07q_runtimeEmpty",
			"runtimeEntries": "IIa07q_runtimeEntries",
			"runtimeEntry": "IIa07q_runtimeEntry",
			"runtimeEntryBadges": "IIa07q_runtimeEntryBadges",
			"runtimeEntryMeta": "IIa07q_runtimeEntryMeta",
			"runtimeEntryTarget": "IIa07q_runtimeEntryTarget",
			"runtimeFilterQuery": "IIa07q_runtimeFilterQuery",
			"runtimeFootnote": "IIa07q_runtimeFootnote",
			"runtimeGrid": "IIa07q_runtimeGrid",
			"runtimeNotice": "IIa07q_runtimeNotice",
			"runtimeReadOnly": "IIa07q_runtimeReadOnly",
			"runtimeScopeFilter": "IIa07q_runtimeScopeFilter",
			"runtimeSummaryCard": "IIa07q_runtimeSummaryCard",
			"runtimeSummaryGrid": "IIa07q_runtimeSummaryGrid",
			"runtimeTarget": "IIa07q_runtimeTarget",
			"runtimeTargetDescription": "IIa07q_runtimeTargetDescription",
			"runtimeTargetHeader": "IIa07q_runtimeTargetHeader",
			"runtimeUnifiedList": "IIa07q_runtimeUnifiedList",
			"searchActions": "IIa07q_searchActions",
			"searchBar": "IIa07q_searchBar",
			"searchControls": "IIa07q_searchControls",
			"secondaryButton": "IIa07q_secondaryButton",
			"sectionHeading": "IIa07q_sectionHeading",
			"sectionSpinner": "IIa07q_sectionSpinner",
			"sessionHint": "IIa07q_sessionHint",
			"sessionMissing": "IIa07q_sessionMissing",
			"sessionReady": "IIa07q_sessionReady",
			"shell": "IIa07q_shell",
			"singleColumn": "IIa07q_singleColumn",
			"spaceSummary": "IIa07q_spaceSummary",
			"statusCluster": "IIa07q_statusCluster",
			"statusDot": "IIa07q_statusDot",
			"statusHeaderActions": "IIa07q_statusHeaderActions",
			"statusSectionHeader": "IIa07q_statusSectionHeader",
			"storageAreaGrid": "IIa07q_storageAreaGrid",
			"storageAreaMetric": "IIa07q_storageAreaMetric",
			"storageDomains": "IIa07q_storageDomains",
			"storageFootnote": "IIa07q_storageFootnote",
			"storageMode": "IIa07q_storageMode",
			"storagePath": "IIa07q_storagePath",
			"storageRoot": "IIa07q_storageRoot",
			"storageUnavailable": "IIa07q_storageUnavailable",
			"strategyForm": "IIa07q_strategyForm",
			"strategyLoading": "IIa07q_strategyLoading",
			"supervisedComposer": "IIa07q_supervisedComposer",
			"supervisedForm": "IIa07q_supervisedForm",
			"supervisedHeading": "IIa07q_supervisedHeading",
			"tags": "IIa07q_tags",
			"telemetry": "IIa07q_telemetry",
			"telemetryMetric": "IIa07q_telemetryMetric",
			"topNavigation": "IIa07q_topNavigation",
			"versionChecking": "IIa07q_versionChecking",
			"versionDialogBody": "IIa07q_versionDialogBody",
			"versionError": "IIa07q_versionError",
			"versionList": "IIa07q_versionList",
			"versionLocation": "IIa07q_versionLocation",
			"versionNumbers": "IIa07q_versionNumbers",
			"versionResult": "IIa07q_versionResult",
			"workspace": "IIa07q_workspace",
			"workspaceMismatch": "IIa07q_workspaceMismatch",
			"workspacePicker": "IIa07q_workspacePicker",
			"writeGuide": "IIa07q_writeGuide",
			"writebackLayout": "IIa07q_writebackLayout"
		};
		//#endregion
		//#region src/client/MnemonDialog.tsx
		const SHEET_MEDIA = "(max-width: 760px)";
		const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";
		const CLOSE_DURATION_MS = 240;
		const SNAP_DURATION_MS = 280;
		function matches(query) {
			return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
		}
		function currentTransform(element) {
			const value = window.getComputedStyle(element).transform;
			return value === "" || value === "none" ? "translate3d(0, 0, 0)" : value;
		}
		function currentTranslateY(element) {
			const transform = currentTransform(element);
			if (transform === "translate3d(0, 0, 0)") return 0;
			try {
				return Math.max(new DOMMatrixReadOnly(transform).m42, 0);
			} catch {
				const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
				if (matrix3d !== null) return Math.max(Number(matrix3d[1]?.split(",")[13]) || 0, 0);
				const matrix = transform.match(/^matrix\((.+)\)$/);
				return matrix === null ? 0 : Math.max(Number(matrix[1]?.split(",")[5]) || 0, 0);
			}
		}
		function cancelAnimations(element) {
			if (element === null || typeof element.getAnimations !== "function") return;
			element.getAnimations().forEach((animation) => animation.cancel());
		}
		function releaseDragCapture(drag) {
			try {
				if (typeof drag.captureTarget.hasPointerCapture !== "function" || drag.captureTarget.hasPointerCapture(drag.pointerId)) drag.captureTarget.releasePointerCapture?.(drag.pointerId);
			} catch {}
		}
		function waitForAnimations(animations, duration) {
			return new Promise((resolve) => {
				let settled = false;
				const finish = () => {
					if (settled) return;
					settled = true;
					window.clearTimeout(timeout);
					resolve();
				};
				const timeout = window.setTimeout(finish, duration + 100);
				Promise.allSettled(animations.map((animation) => animation.finished)).then(finish);
			});
		}
		/** Shared top-layer dialog behavior for every Mnemon workspace action surface. */
		function MnemonDialog(props) {
			const appearance = useMnemonViewAppearance();
			const titleId = (0, react.useId)();
			const descriptionId = (0, react.useId)();
			const backdropRef = (0, react.useRef)(null);
			const dialogRef = (0, react.useRef)(null);
			const closeButtonRef = (0, react.useRef)(null);
			const returnFocusRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)(null);
			const snapGenerationRef = (0, react.useRef)(0);
			const closingRef = (0, react.useRef)(false);
			const mountedRef = (0, react.useRef)(true);
			const busyRef = (0, react.useRef)(props.busy === true);
			const onCloseRef = (0, react.useRef)(props.onClose);
			busyRef.current = props.busy === true;
			onCloseRef.current = props.onClose;
			const focusPreferredControl = (0, react.useCallback)(() => {
				(dialogRef.current?.querySelector("[data-autofocus]:not(:disabled)") ?? dialogRef.current?.querySelector("input:not(:disabled), textarea:not(:disabled), select:not(:disabled)"))?.focus({ preventScroll: true });
			}, []);
			const finishClose = (0, react.useCallback)(() => {
				if (mountedRef.current) onCloseRef.current();
			}, []);
			const requestClose = (0, react.useCallback)(() => {
				if (busyRef.current || closingRef.current) return;
				const dialog = dialogRef.current;
				const backdrop = backdropRef.current;
				if (dialog === null || backdrop === null || matches(REDUCED_MOTION_MEDIA) || typeof dialog.animate !== "function" || typeof backdrop.animate !== "function") {
					finishClose();
					return;
				}
				closingRef.current = true;
				snapGenerationRef.current += 1;
				dialog.dataset.closing = "true";
				backdrop.dataset.closing = "true";
				const sheet = matches(SHEET_MEDIA);
				const fromTransform = currentTransform(dialog);
				const fromBackdropOpacity = window.getComputedStyle(backdrop).opacity;
				cancelAnimations(dialog);
				cancelAnimations(backdrop);
				const easing = sheet ? "cubic-bezier(.4, 0, 1, 1)" : "cubic-bezier(.4, 0, .2, 1)";
				waitForAnimations([dialog.animate(sheet ? [{
					opacity: 1,
					transform: fromTransform
				}, {
					opacity: 1,
					transform: "translate3d(0, calc(100% + 32px), 0)"
				}] : [{
					opacity: 1,
					transform: fromTransform
				}, {
					opacity: 0,
					transform: "translate3d(0, 8px, 0) scale(.985)"
				}], {
					duration: CLOSE_DURATION_MS,
					easing,
					fill: "forwards"
				}), backdrop.animate([{ opacity: fromBackdropOpacity }, { opacity: 0 }], {
					duration: CLOSE_DURATION_MS,
					easing: "ease-out",
					fill: "forwards"
				})], CLOSE_DURATION_MS).then(finishClose);
			}, [finishClose]);
			const resetDrag = (0, react.useCallback)(() => {
				const dialog = dialogRef.current;
				const backdrop = backdropRef.current;
				if (dialog === null || backdrop === null) return;
				const drag = dragRef.current;
				const offset = drag?.offset ?? 0;
				const snapGeneration = ++snapGenerationRef.current;
				dragRef.current = null;
				if (drag !== null) releaseDragCapture(drag);
				delete dialog.dataset.dragging;
				if (offset <= 0 || matches(REDUCED_MOTION_MEDIA) || typeof dialog.animate !== "function" || typeof backdrop.animate !== "function") {
					dialog.style.removeProperty("--mn-modal-drag-y");
					backdrop.style.removeProperty("opacity");
					return;
				}
				const dialogAnimation = dialog.animate([{ transform: currentTransform(dialog) }, { transform: "translate3d(0, 0, 0)" }], {
					duration: SNAP_DURATION_MS,
					easing: "cubic-bezier(.2, .8, .2, 1)",
					fill: "forwards"
				});
				const backdropAnimation = backdrop.animate([{ opacity: window.getComputedStyle(backdrop).opacity }, { opacity: 1 }], {
					duration: SNAP_DURATION_MS,
					easing: "ease-out",
					fill: "forwards"
				});
				waitForAnimations([dialogAnimation, backdropAnimation], SNAP_DURATION_MS).then(() => {
					if (!mountedRef.current || snapGenerationRef.current !== snapGeneration) return;
					dialog.style.removeProperty("--mn-modal-drag-y");
					backdrop.style.removeProperty("opacity");
					dialogAnimation.cancel();
					backdropAnimation.cancel();
				});
			}, []);
			const beginDrag = (event) => {
				if (busyRef.current || closingRef.current || !event.isPrimary || !matches(SHEET_MEDIA)) return;
				if (event.pointerType === "mouse" && event.button !== 0) return;
				const dialog = dialogRef.current;
				if (dialog === null) return;
				snapGenerationRef.current += 1;
				const initialOffset = currentTranslateY(dialog);
				const backdrop = backdropRef.current;
				const initialBackdropOpacity = backdrop === null ? "" : window.getComputedStyle(backdrop).opacity;
				cancelAnimations(dialog);
				cancelAnimations(backdrop);
				const time = event.timeStamp;
				dragRef.current = {
					pointerId: event.pointerId,
					captureTarget: event.currentTarget,
					startY: event.clientY,
					initialOffset,
					lastY: event.clientY,
					lastTime: time,
					velocity: 0,
					offset: initialOffset,
					height: Math.max(dialog.getBoundingClientRect().height, 1)
				};
				dialog.dataset.dragging = "true";
				dialog.style.setProperty("--mn-modal-drag-y", `${initialOffset}px`);
				if (backdrop !== null) backdrop.style.opacity = initialBackdropOpacity;
				try {
					event.currentTarget.setPointerCapture?.(event.pointerId);
				} catch {}
			};
			const moveDrag = (0, react.useCallback)((event) => {
				const drag = dragRef.current;
				const dialog = dialogRef.current;
				const backdrop = backdropRef.current;
				if (drag === null || dialog === null || backdrop === null || drag.pointerId !== event.pointerId) return;
				event.preventDefault();
				const rawOffset = Math.max(0, drag.initialOffset + event.clientY - drag.startY);
				const offset = rawOffset <= drag.height ? rawOffset : drag.height + (rawOffset - drag.height) * .16;
				const elapsed = Math.max(event.timeStamp - drag.lastTime, 1);
				const sampleVelocity = (event.clientY - drag.lastY) / elapsed;
				drag.velocity = drag.velocity * .35 + sampleVelocity * .65;
				drag.lastY = event.clientY;
				drag.lastTime = event.timeStamp;
				drag.offset = offset;
				dialog.style.setProperty("--mn-modal-drag-y", `${offset}px`);
				backdrop.style.opacity = String(1 - Math.min(offset / drag.height * .58, .52));
			}, []);
			const endDrag = (0, react.useCallback)((event) => {
				const drag = dragRef.current;
				if (drag === null || drag.pointerId !== event.pointerId) return;
				const threshold = Math.min(Math.max(drag.height * .22, 96), 180);
				if (drag.offset >= threshold || drag.offset >= 28 && drag.velocity >= .55) {
					dragRef.current = null;
					releaseDragCapture(drag);
					if (dialogRef.current !== null) delete dialogRef.current.dataset.dragging;
					requestClose();
				} else resetDrag();
			}, [requestClose, resetDrag]);
			const cancelDrag = (0, react.useCallback)((event) => {
				if (dragRef.current?.pointerId === event.pointerId) resetDrag();
			}, [resetDrag]);
			(0, react.useLayoutEffect)(() => {
				returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
				(dialogRef.current?.querySelector("[data-autofocus]:not(:disabled)") ?? dialogRef.current?.querySelector("input:not(:disabled), textarea:not(:disabled), select:not(:disabled)") ?? dialogRef.current?.querySelector("button:not(:disabled)"))?.focus({ preventScroll: true });
				return () => {
					if (returnFocusRef.current?.isConnected === true) returnFocusRef.current.focus({ preventScroll: true });
				};
			}, []);
			(0, react.useLayoutEffect)(() => {
				if (props.contentReady !== true) return;
				const active = document.activeElement;
				if (active !== closeButtonRef.current && active !== dialogRef.current) return;
				focusPreferredControl();
			}, [focusPreferredControl, props.contentReady]);
			(0, react.useEffect)(() => {
				mountedRef.current = true;
				const previousOverflow = document.body.style.overflow;
				document.body.style.overflow = "hidden";
				return () => {
					mountedRef.current = false;
					document.body.style.overflow = previousOverflow;
				};
			}, []);
			(0, react.useEffect)(() => {
				const onKey = (event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						requestClose();
						return;
					}
					if (event.key !== "Tab" || closingRef.current) return;
					const controls = Array.from(dialogRef.current?.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex=\"-1\"])") ?? []).filter((control) => control.getAttribute("aria-hidden") !== "true");
					const first = controls[0];
					const last = controls.at(-1);
					if (first === void 0 || last === void 0) {
						event.preventDefault();
						return;
					}
					const active = document.activeElement;
					if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
						event.preventDefault();
						last.focus();
					} else if (!event.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
						event.preventDefault();
						first.focus();
					}
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [requestClose]);
			(0, react.useEffect)(() => {
				const cancelOnBlur = () => {
					if (dragRef.current !== null) resetDrag();
				};
				const cancelWhenHidden = () => {
					if (document.visibilityState === "hidden") cancelOnBlur();
				};
				window.addEventListener("pointermove", moveDrag, { passive: false });
				window.addEventListener("pointerup", endDrag);
				window.addEventListener("pointercancel", cancelDrag);
				window.addEventListener("blur", cancelOnBlur);
				document.addEventListener("visibilitychange", cancelWhenHidden);
				return () => {
					window.removeEventListener("pointermove", moveDrag);
					window.removeEventListener("pointerup", endDrag);
					window.removeEventListener("pointercancel", cancelDrag);
					window.removeEventListener("blur", cancelOnBlur);
					document.removeEventListener("visibilitychange", cancelWhenHidden);
				};
			}, [
				cancelDrag,
				endDrag,
				moveDrag,
				resetDrag
			]);
			const interceptCloseControl = (event) => {
				const target = event.target instanceof Element ? event.target.closest("[data-dialog-close]") : null;
				if (target === null || !dialogRef.current?.contains(target)) return;
				event.preventDefault();
				event.stopPropagation();
				requestClose();
			};
			if (typeof document === "undefined") return null;
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: MnemonView_module_css_default.modalPortal,
				"data-mnemon-dialog-portal": "",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: appearanceClass(appearanceClass(MnemonView_module_css_default.modalTheme, MnemonView_module_css_default.shell), appearance.classes.shell),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: backdropRef,
						className: appearanceClass(MnemonView_module_css_default.modalBackdrop, appearance.classes.modalBackdrop),
						onPointerDown: (event) => {
							if (event.target === event.currentTarget) requestClose();
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							ref: dialogRef,
							className: appearanceClass(appearanceClass(MnemonView_module_css_default.modal, appearance.classes.modal), props.wide === true ? MnemonView_module_css_default.modalWide : void 0),
							role: "dialog",
							"aria-modal": "true",
							"aria-busy": props.contentReady === false || props.busy === true ? true : void 0,
							"aria-labelledby": titleId,
							"aria-describedby": props.description === void 0 ? void 0 : descriptionId,
							onClickCapture: interceptCloseControl,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: MnemonView_module_css_default.modalDragHandle,
									"data-dialog-drag-handle": "",
									"aria-hidden": "true",
									onPointerDown: beginDrag,
									onLostPointerCapture: (event) => {
										if (dragRef.current?.pointerId === event.pointerId) resetDrag();
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									id: titleId,
									children: props.title
								}), props.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									id: descriptionId,
									children: props.description
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									ref: closeButtonRef,
									type: "button",
									className: MnemonView_module_css_default.iconButton,
									disabled: props.busy,
									onClick: requestClose,
									"aria-label": props.closeLabel,
									children: "×"
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: MnemonView_module_css_default.modalBody,
									children: props.children
								}),
								props.footer !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("footer", {
									className: MnemonView_module_css_default.modalFooter,
									children: props.footer
								})
							]
						})
					})
				})
			}), document.body);
		}
		//#endregion
		//#region src/client/MnemonView.tsx
		const LEGACY_NATIVE_CAPABILITIES = {
			search: true,
			browse: true,
			graph: true,
			entities: true,
			related: true,
			remember: true,
			link: true,
			forget: true,
			writeMode: "exact",
			deletionMode: "soft"
		};
		const MEMORY_PROVIDER_LABELS = {
			"mnemon-native": "mnemon",
			openviking: "OpenViking",
			honcho: "Honcho",
			mem0: "Mem0",
			hindsight: "Hindsight",
			holographic: "Holographic",
			retaindb: "RetainDB",
			byterover: "ByteRover",
			supermemory: "Supermemory"
		};
		const LEGACY_PROVIDER_CATALOG = [{
			id: "mnemon-native",
			label: "mnemon",
			kind: "local",
			origin: "native",
			workspaceBinding: "automatic",
			summary: "Official local-first memory.",
			capabilities: LEGACY_NATIVE_CAPABILITIES,
			fields: []
		}, {
			id: "openviking",
			label: "OpenViking",
			kind: "remote",
			origin: "third-party",
			workspaceBinding: "provider-global",
			serviceConfigured: true,
			summary: "Filesystem-shaped shared memory.",
			capabilities: {
				...LEGACY_NATIVE_CAPABILITIES,
				graph: false,
				entities: false,
				related: false,
				link: false,
				writeMode: "async-extracting",
				deletionMode: "hard"
			},
			fields: [
				{
					key: "endpoint",
					label: "Endpoint",
					scope: "service",
					input: "url",
					required: true,
					defaultValue: "http://127.0.0.1:1933",
					placeholder: "http://127.0.0.1:1933"
				},
				{
					key: "targetUri",
					label: "Memory URI",
					scope: "memory",
					input: "text",
					required: true,
					defaultValue: "viking://user/memories",
					placeholder: "viking://user/memories"
				},
				{
					key: "apiKey",
					label: "API key",
					scope: "service",
					input: "secret",
					required: false
				},
				{
					key: "account",
					label: "Account",
					scope: "service",
					input: "text",
					required: false
				},
				{
					key: "user",
					label: "User",
					scope: "memory",
					input: "text",
					required: false
				},
				{
					key: "actorPeerId",
					label: "Agent peer",
					scope: "memory",
					input: "text",
					required: false,
					defaultValue: "dsh"
				}
			]
		}];
		/** Preserve the pre-provider Host contract during a rolling Web/Host restart. */
		function normalizeMemoryBody(body) {
			if (body.provider !== void 0) return body;
			return {
				...body,
				provider: {
					id: "mnemon-native",
					label: "mnemon",
					kind: "local",
					location: body.dbPath,
					apiKeyConfigured: false,
					settings: {},
					configuredSecrets: [],
					capabilities: LEGACY_NATIVE_CAPABILITIES
				}
			};
		}
		function memoryProviderFields(provider) {
			return provider.fields.filter((field) => field.scope !== "service");
		}
		function providerDefaults(provider) {
			return Object.fromEntries(memoryProviderFields(provider).flatMap((field) => field.defaultValue === void 0 ? [] : [[field.key, field.defaultValue]]));
		}
		function mergeProviderDefaults(providers, current) {
			return Object.fromEntries(providers.map((provider) => [provider.id, {
				...providerDefaults(provider),
				...current[provider.id] ?? {}
			}]));
		}
		function providerDraftComplete(provider, connection) {
			if (provider === void 0 || provider.id === "mnemon-native") return true;
			return provider.serviceConfigured !== false && memoryProviderFields(provider).every((field) => !field.required || String(connection?.[field.key] ?? "").trim() !== "");
		}
		function providerSummary(t, provider) {
			return t(`overview.providerSummary.${provider.id}`);
		}
		function providerFieldLabel(t, provider, field) {
			const labels = {
				endpoint: "overview.providerEndpoint",
				apiKey: "overview.providerApiKey",
				targetUri: "overview.providerTargetUri",
				account: "overview.providerAccount",
				user: "overview.providerUser",
				actorPeerId: "overview.providerActorPeer",
				workspace: "overview.providerField.workspace",
				userId: "overview.providerField.userId",
				agentId: "overview.providerField.agentId",
				mode: "overview.providerField.mode",
				rerank: "overview.providerField.rerank",
				bankId: "overview.providerField.bankId",
				budget: "overview.providerField.budget",
				dataPath: "overview.providerField.dataPath",
				defaultTrust: "overview.providerField.defaultTrust",
				minTrust: "overview.providerField.minTrust",
				project: "overview.providerField.project",
				cliPath: "overview.providerField.cliPath",
				workingDirectory: "overview.providerField.workingDirectory",
				containerTag: "overview.providerField.containerTag",
				searchMode: "overview.providerField.searchMode"
			};
			return labels[field.key] === void 0 ? field.label : t(labels[field.key]);
		}
		/** Shared memory-level Provider form used by manual creation, editing, and distillation policy. */
		function ProviderMemoryFields(props) {
			const t = useT();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.providerFields,
				"data-provider": props.provider.id,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.providerFieldHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.providerFieldIdentity,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderIcon, {
								providerId: props.provider.id,
								className: MnemonView_module_css_default.providerFieldIcon
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: props.provider.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: providerSummary(t, props.provider) })] })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							props.provider.kind === "local" ? t("overview.providerKindLocal") : t("overview.providerKindRemote"),
							" · ",
							t(`overview.workspaceBinding.${props.provider.workspaceBinding}`)
						] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.providerAdvancedGrid,
						children: memoryProviderFields(props.provider).map((field) => {
							const label = providerFieldLabel(t, props.provider, field);
							const value = props.connection[field.key] ?? "";
							const savedSecret = props.body?.provider.configuredSecrets.includes(field.key) === true;
							const clearingSecret = props.clearSecrets?.includes(field.key) === true;
							const required = field.required && (!savedSecret || clearingSecret);
							const input = field.input === "boolean" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								"aria-label": label,
								type: "checkbox",
								checked: Boolean(value),
								onChange: (event) => props.onChange(field.key, event.target.checked)
							}) : field.input === "select" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								"aria-label": label,
								value: String(value),
								required,
								onChange: (event) => props.onChange(field.key, event.target.value),
								children: field.options?.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: option.value,
									children: t(`overview.providerOption.${option.value}`)
								}, option.value))
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								"aria-label": label,
								type: field.input === "secret" ? "password" : field.input === "number" ? "number" : field.input === "url" ? "url" : "text",
								value: String(value),
								required,
								autoComplete: field.input === "secret" ? "new-password" : void 0,
								placeholder: savedSecret ? t("overview.providerApiKeyKeep") : field.placeholder ?? (field.input === "secret" ? t("overview.providerApiKeyOptional") : void 0),
								maxLength: field.input === "secret" ? 8e3 : 2e3,
								step: field.input === "number" ? "any" : void 0,
								onChange: (event) => props.onChange(field.key, event.target.value)
							});
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.providerFieldControl,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [label, input] }), props.body !== void 0 && field.input === "secret" && savedSecret && props.onClearSecretsChange !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: MnemonView_module_css_default.providerSecretClear,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: clearingSecret,
										onChange: (event) => props.onClearSecretsChange(event.target.checked ? [.../* @__PURE__ */ new Set([...props.clearSecrets ?? [], field.key])] : (props.clearSecrets ?? []).filter((key) => key !== field.key))
									}), t("overview.providerSecretClear")]
								})]
							}, field.key);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", {
						className: MnemonView_module_css_default.providerWriteHint,
						children: [
							props.provider.capabilities.writeMode === "exact" ? t("overview.providerWriteExact") : t("overview.providerWriteAsync"),
							" · ",
							props.provider.capabilities.graph ? t("overview.providerGraphReady") : t("overview.providerSearchReady")
						]
					})
				]
			});
		}
		/** 系统 → 三层存储 → 读写工具；组间以分隔线呈现。 */
		const PAGE_NAV = [
			{
				aria: "nav.group.system",
				entries: [{
					id: "status",
					label: "nav.status",
					detail: "nav.status.detail",
					glyph: "⌘"
				}]
			},
			{
				aria: "nav.group.storage",
				entries: [
					{
						id: "runtime",
						label: "nav.runtime",
						detail: "nav.runtime.detail",
						glyph: "◫"
					},
					{
						id: "documents",
						label: "nav.documents",
						detail: "nav.documents.detail",
						glyph: "▤"
					},
					{
						id: "overview",
						label: "nav.bodies",
						detail: "nav.bodies.detail",
						glyph: "◇"
					}
				]
			},
			{
				aria: "nav.group.tools",
				entries: [
					{
						id: "remember",
						label: "nav.remember",
						detail: "nav.remember.detail",
						glyph: "+"
					},
					{
						id: "explore",
						label: "nav.search",
						detail: "nav.search.detail",
						glyph: "⌕"
					},
					{
						id: "entities",
						label: "nav.entities",
						detail: "nav.entities.detail",
						glyph: "◎"
					},
					{
						id: "list",
						label: "nav.content",
						detail: "nav.content.detail",
						glyph: "≡"
					}
				]
			}
		];
		const SIDEBAR_PAGE_TABS = [
			{
				id: "status",
				label: "nav.status",
				detail: "nav.status.detail",
				glyph: "⌘"
			},
			{
				id: "runtime",
				label: "nav.runtime",
				detail: "nav.runtime.detail",
				glyph: "◫"
			},
			{
				id: "documents",
				label: "nav.documents",
				detail: "nav.documents.detail",
				glyph: "▤"
			},
			{
				id: "overview",
				label: "nav.bodies",
				detail: "nav.bodies.detail",
				glyph: "◇"
			}
		];
		const MEMORY_PAGE_TABS = [
			{
				id: "overview",
				label: "nav.overview"
			},
			{
				id: "explore",
				label: "nav.search"
			},
			{
				id: "list",
				label: "nav.content"
			},
			{
				id: "entities",
				label: "nav.entities"
			}
		];
		const MEMORY_PAGES = new Set(MEMORY_PAGE_TABS.map((item) => item.id));
		function isMemoryPage(page) {
			return MEMORY_PAGES.has(page);
		}
		const CATEGORY_KEYS = {
			decision: "category.decision",
			preference: "category.preference",
			fact: "category.fact",
			insight: "category.insight",
			context: "category.context",
			general: "category.general"
		};
		const I18nContext = (0, react.createContext)(translateZh);
		const LocaleContext = (0, react.createContext)("zh");
		function useT() {
			return (0, react.useContext)(I18nContext);
		}
		function useLocale() {
			return (0, react.useContext)(LocaleContext) === "en" ? "en-US" : "zh-CN";
		}
		function categoryLabel(t, category) {
			return CATEGORY_KEYS[category] === void 0 ? category : t(CATEGORY_KEYS[category]);
		}
		function humanBytes(bytes) {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		}
		function message(error) {
			return error instanceof Error ? error.message : String(error);
		}
		function short(value, max) {
			return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
		}
		function insightKey(insight) {
			return `${insight.memoryBodyId ?? "memory"}:${insight.id}`;
		}
		function PageHeader(props) {
			const appearance = useMnemonViewAppearance();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: appearanceClass(MnemonView_module_css_default.pageHeader, appearance.classes.pageHeader),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: props.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: props.description })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonView_module_css_default.pageHeaderMeta,
					children: [
						props.loadingLabel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageSpinner, { label: props.loadingLabel }),
						props.meta !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: props.meta }),
						props.action
					]
				})]
			});
		}
		function PageSpinner({ label }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: MnemonView_module_css_default.pageSpinner,
				role: "status",
				"aria-label": label,
				title: label,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { "aria-hidden": "true" })
			});
		}
		function SectionSpinner({ label }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: MnemonView_module_css_default.sectionSpinner,
				role: "status",
				"aria-label": label,
				title: label,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { "aria-hidden": "true" })
			});
		}
		function ProgressiveFooter(props) {
			const t = useT();
			if (props.total === 0) return null;
			const remaining = Math.max(0, props.total - props.visible);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: props.compact === true ? MnemonView_module_css_default.compactListProgress : MnemonView_module_css_default.listProgress,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("common.showing", {
					visible: props.visible,
					total: props.total
				}) }), remaining > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: MnemonView_module_css_default.secondaryButton,
					onClick: props.onMore,
					children: t("common.showMore", { count: Math.min(props.pageSize, remaining) })
				})]
			});
		}
		/** DSH-style action dialog shared by Sidebar add/write flows. */
		function SidebarModal(props) {
			const t = useT();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MnemonDialog, {
				...props,
				closeLabel: t("common.cancel")
			});
		}
		function EmptyState(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.emptyState,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: MnemonView_module_css_default.emptyGlyph,
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: props.glyph })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: props.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: props.children })] })]
			});
		}
		function MemoryProviderBadge(props) {
			const compactLabel = props.providerId === "mnemon-native" ? "mnemon" : props.label;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: MnemonView_module_css_default.providerBadge,
				"data-provider": props.providerId,
				title: compactLabel,
				children: compactLabel
			});
		}
		function ReadSourcePanel(props) {
			const t = useT();
			if (props.sources.length === 0) return null;
			const content = (source) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: MnemonView_module_css_default.readSourceSignal,
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: MnemonView_module_css_default.readSourceIdentity,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: source.memoryBodyName }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: MnemonView_module_css_default.readSourceMeta,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryProviderBadge, {
							providerId: source.providerId,
							label: source.providerLabel
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t(`readSources.model.${source.providerId}`) })]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: MnemonView_module_css_default.readSourceState,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: t(`readSources.mode.${source.mode}`) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [t(`readSources.status.${source.status}`, { count: source.itemCount }), source.edgeCount === void 0 || source.edgeCount === 0 ? "" : ` · ${t("readSources.edges", { count: source.edgeCount })}`] })]
				})
			] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: MnemonView_module_css_default.readSources,
				"aria-label": props.title,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: props.title }), props.hint !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: props.hint })] }), props.onSelect !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-pressed": props.selectedBodyId === void 0,
					"data-selected": props.selectedBodyId === void 0 ? "" : void 0,
					onClick: () => props.onSelect?.(void 0),
					children: t("readSources.all")
				})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: props.sources.map((source) => props.onSelect === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("article", {
					className: MnemonView_module_css_default.readSourceCard,
					"data-provider": source.providerId,
					"data-mode": source.mode,
					"data-status": source.status,
					title: source.hint,
					children: content(source)
				}, source.memoryBodyId) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: MnemonView_module_css_default.readSourceCard,
					"data-provider": source.providerId,
					"data-mode": source.mode,
					"data-status": source.status,
					"aria-pressed": props.selectedBodyId === source.memoryBodyId,
					"data-selected": props.selectedBodyId === source.memoryBodyId || void 0,
					title: source.hint,
					onClick: () => props.onSelect?.(props.selectedBodyId === source.memoryBodyId ? void 0 : source.memoryBodyId),
					children: content(source)
				}, source.memoryBodyId)) })]
			});
		}
		/** Sidebar mirrors the SSH panel's flat tab model; Buildin keeps the grouped navigation unchanged. */
		function WorkspaceNavigation(props) {
			const t = useT();
			const appearance = useMnemonViewAppearance();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: appearanceClass(MnemonView_module_css_default.topNavigation, appearance.classes.topNavigation),
				children: [appearance.surface === "sidebar" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: appearanceClass(MnemonView_module_css_default.nav, appearance.classes.nav),
					role: "tablist",
					"aria-label": t("nav.aria"),
					children: SIDEBAR_PAGE_TABS.map((item) => {
						const active = item.id === "overview" ? isMemoryPage(props.page) : props.page === item.id;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": active,
							"data-active": active ? "" : void 0,
							onClick: () => props.onSelect(item.id),
							children: t(item.label)
						}, item.id);
					})
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
					className: appearanceClass(MnemonView_module_css_default.nav, appearance.classes.nav),
					"aria-label": t("nav.aria"),
					children: PAGE_NAV.map((group, groupIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: appearanceClass(MnemonView_module_css_default.navGroup, appearance.classes.navGroup),
						role: "group",
						"aria-label": t(group.aria),
						children: group.entries.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							"aria-current": props.page === item.id ? "page" : void 0,
							onClick: () => props.onSelect(item.id),
							children: [appearance.showNavigationGlyphs && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: MnemonView_module_css_default.navGlyph,
								"aria-hidden": "true",
								children: item.glyph
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(item.label) }), appearance.showNavigationDetails && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t(item.detail) })] })]
						}, item.id))
					}), appearance.showNavigationDividers && groupIndex < PAGE_NAV.length - 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: MnemonView_module_css_default.navGroupDivider,
						"aria-hidden": "true"
					})] }, group.aria))
				}), appearance.showSpaceSummary && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonView_module_css_default.spaceSummary,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sidebar.activeSpaces") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: props.catalogKnown ? `${props.activeBodies} / ${props.bodyCount}` : "— / —" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: props.writeEnabled ? t("common.agentSupervised") : props.activationEnabled ? t("common.activationOnly") : t("common.readOnly") })
					]
				})]
			});
		}
		/** Memory tools become a focused second-level tab set on the Sidebar surface. */
		function MemoryNavigation(props) {
			const t = useT();
			const appearance = useMnemonViewAppearance();
			if (appearance.surface !== "sidebar" || !isMemoryPage(props.page)) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: appearance.classes.memoryWorkspace,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageHeader, {
					title: t("nav.bodies"),
					description: t("overview.description"),
					meta: props.writeEnabled ? t("common.agentSupervised") : props.activationEnabled ? t("common.activationOnly") : t("common.readOnly"),
					action: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.memoryHeaderActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: appearanceClass(MnemonView_module_css_default.primaryButton, appearance.classes.memoryWriteButton),
							disabled: !props.writeEnabled,
							onClick: props.onRemember,
							children: t("nav.rememberAction")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.secondaryButton,
							onClick: props.onStrategy,
							children: t("strategy.action")
						})]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: appearance.classes.memoryNavigation,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: appearance.classes.memoryTabs,
						role: "tablist",
						"aria-label": t("nav.memory.aria"),
						children: MEMORY_PAGE_TABS.map((item) => {
							const active = props.page === item.id;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "tab",
								"aria-selected": active,
								"data-active": active ? "" : void 0,
								onClick: () => props.onSelect(item.id),
								children: t(item.label)
							}, item.id);
						})
					})
				})]
			});
		}
		/** Full-text popup for a selected graph node whose inspector preview is clamped. */
		function ContentPreview(props) {
			const t = useT();
			const meta = [
				props.kind,
				props.node.id,
				props.node.memoryBodyName
			].filter((entry) => entry !== void 0).join(" · ");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
				title: t("overview.previewTitle"),
				description: meta,
				onClose: props.onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: MnemonView_module_css_default.previewContent,
					children: props.node.content
				})
			});
		}
		const SAFE_LINK_PATTERN = /^(?:https?:|mailto:|#|\/)/iu;
		function safeLink(href) {
			if (href == null) return void 0;
			const value = href.trim();
			return SAFE_LINK_PATTERN.test(value) ? value : void 0;
		}
		/** Render managed Markdown without raw HTML and with a deliberately small link surface. */
		function DocumentMarkdown(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: MnemonView_module_css_default.markdownBody,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(index_module_default, {
					options: {
						disableParsingRawHTML: true,
						forceBlock: true,
						overrides: { a: { component: ({ href, children, ...rest }) => {
							const target = safeLink(href);
							return target === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								...rest,
								href: target,
								target: target.startsWith("http") ? "_blank" : void 0,
								rel: target.startsWith("http") ? "noreferrer noopener" : void 0,
								children
							});
						} } }
					},
					children: props.content
				})
			});
		}
		function InsightCard(props) {
			const t = useT();
			const appearance = useMnemonViewAppearance();
			const [confirming, setConfirming] = (0, react.useState)(false);
			const [forgetting, setForgetting] = (0, react.useState)(false);
			const { insight } = props;
			const neutralActionClass = appearance.surface === "sidebar" ? appearanceClass(MnemonView_module_css_default.ghostButton, appearance.classes.itemActionButton) : MnemonView_module_css_default.ghostButton;
			const forgetActionClass = appearance.surface === "sidebar" ? appearanceClass(MnemonView_module_css_default.dangerButton, appearanceClass(appearance.classes.itemActionButton, appearance.classes.itemDangerAction)) : MnemonView_module_css_default.dangerButton;
			const inlineConfirming = appearance.surface === "buildin" && confirming;
			const providerLabel = insight.memoryProviderId === void 0 ? void 0 : MEMORY_PROVIDER_LABELS[insight.memoryProviderId];
			const supportsRelated = insight.memoryCapabilities?.related ?? (insight.memoryProviderId === void 0 || insight.memoryProviderId === "mnemon-native");
			const supportsForget = insight.memoryCapabilities?.forget ?? (insight.memoryProviderId === void 0 || insight.memoryProviderId === "mnemon-native");
			const meta = [
				insight.memoryBodyName,
				providerLabel,
				insight.category !== void 0 ? categoryLabel(t, insight.category) : void 0,
				insight.importance !== void 0 ? t("common.importance", { value: insight.importance }) : void 0,
				insight.score !== void 0 ? `score ${insight.score.toFixed(3)}` : void 0,
				insight.depth !== void 0 ? t("common.hops", { count: insight.depth }) : void 0
			].filter((entry) => entry !== void 0);
			const forget = async () => {
				setForgetting(true);
				try {
					await props.onForget(insight);
				} finally {
					setForgetting(false);
					setConfirming(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
				className: MnemonView_module_css_default.insightCard,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.cardTop,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonView_module_css_default.badges,
							children: meta.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: MnemonView_module_css_default.badge,
								children: entry
							}, entry))
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
							className: MnemonView_module_css_default.id,
							title: insight.id,
							children: insight.id.slice(0, 8)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: MnemonView_module_css_default.content,
						children: insight.content
					}),
					(insight.tags?.length ?? 0) > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.tags,
						children: insight.tags.map((tag) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["#", tag] }, tag))
					}),
					(insight.entities?.length ?? 0) > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.entities,
						children: insight.entities.map((entity) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: entity }, entity))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.cardActions,
						children: inlineConfirming ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.confirmBar,
							role: "group",
							"aria-label": t("card.confirmAria"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("card.confirmText") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: MnemonView_module_css_default.dangerSolidButton,
									disabled: forgetting,
									onClick: () => void forget(),
									children: forgetting ? t("card.processing") : t("card.confirmForget")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: MnemonView_module_css_default.ghostButton,
									disabled: forgetting,
									onClick: () => setConfirming(false),
									children: t("common.cancel")
								})
							]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							props.onRelated !== void 0 && supportsRelated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: neutralActionClass,
								onClick: () => props.onRelated?.(insight),
								children: t("card.related")
							}),
							props.onClone !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: neutralActionClass,
								onClick: () => props.onClone?.(insight),
								children: t("card.clone")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: neutralActionClass,
								onClick: () => void navigator.clipboard?.writeText(insight.id),
								children: t("common.copyId")
							}),
							props.writeEnabled && supportsForget && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: forgetActionClass,
								onClick: () => setConfirming(true),
								children: t("card.forget")
							})
						] })
					})
				]
			}), appearance.surface === "sidebar" && confirming && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
				title: t("card.confirmText"),
				description: `${insight.memoryBodyName ?? insight.memoryBodyId ?? ""}${insight.memoryBodyName === void 0 && insight.memoryBodyId === void 0 ? "" : " · "}${insight.id}`,
				busy: forgetting,
				onClose: () => setConfirming(false),
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonView_module_css_default.modalFooterActions,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-dialog-close": true,
						"data-autofocus": true,
						className: MnemonView_module_css_default.ghostButton,
						disabled: forgetting,
						onClick: () => setConfirming(false),
						children: t("common.cancel")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: MnemonView_module_css_default.dangerSolidButton,
						disabled: forgetting,
						onClick: () => void forget(),
						children: forgetting ? t("card.processing") : t("card.confirmForget")
					})]
				}),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: MnemonView_module_css_default.bodyDeleteConfirm,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.bodyDeleteSummary,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: MnemonView_module_css_default.bodyDeleteContent,
							children: insight.content
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: meta.join(" · ") })]
					})
				})
			})] });
		}
		const GRAPH_WIDTH = 930;
		const GRAPH_HEIGHT = 520;
		const GRAPH_MARGIN_X = 58;
		const GRAPH_MARGIN_Y = 58;
		const CATEGORY_ORDER = [
			"space",
			"entity",
			"preference",
			"decision",
			"fact",
			"insight",
			"context",
			"general"
		];
		function hash(value) {
			let result = 2166136261;
			for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
			return result >>> 0;
		}
		function graphNodeKey(node) {
			return node.graphId ?? node.id;
		}
		function graphNodeKind(node) {
			return node.kind ?? "memory";
		}
		function spaceGraphId(id) {
			return `space:${id}`;
		}
		function entityGraphId(entity) {
			return `entity:${encodeURIComponent(normalizeEntity(entity))}`;
		}
		function normalizeEntity(entity) {
			return entity.normalize("NFKC").trim().toLocaleLowerCase();
		}
		/** Add routing scopes and entity indexes without issuing another recall. */
		function enrichMultiSpaceGraph(graph, bodies) {
			if (graph.nodes.length === 0) return graph;
			const memories = graph.nodes.map((node) => ({
				...node,
				kind: "memory"
			}));
			const memoriesByBody = /* @__PURE__ */ new Map();
			for (const node of memories) {
				if (node.memoryBodyId === void 0) continue;
				memoriesByBody.set(node.memoryBodyId, [...memoriesByBody.get(node.memoryBodyId) ?? [], node]);
			}
			const activeBodies = bodies.filter((body) => body.active && ((memoriesByBody.get(body.id)?.length ?? 0) > 0 || (body.stats?.topEntities.length ?? 0) > 0));
			const spaceNodes = activeBodies.map((body) => ({
				id: body.id,
				graphId: spaceGraphId(body.id),
				kind: "space",
				category: "space",
				content: body.name,
				color: "#22a879",
				memoryBodyId: body.id,
				memoryBodyName: body.name,
				memoryProviderId: body.provider.id,
				occurrenceCount: body.stats?.totalInsights ?? memoriesByBody.get(body.id)?.length ?? 0
			}));
			const edges = graph.edges.filter((edge) => edge.type !== "entity");
			for (const body of activeBodies) for (const memory of memoriesByBody.get(body.id) ?? []) edges.push({
				sourceId: spaceGraphId(body.id),
				targetId: graphNodeKey(memory),
				label: "scope",
				color: "#708199",
				type: "scope"
			});
			const bodiesById = new Map(activeBodies.map((body) => [body.id, body]));
			const indexedEntities = /* @__PURE__ */ new Map();
			for (const memory of memories) {
				const body = memory.memoryBodyId === void 0 ? void 0 : bodiesById.get(memory.memoryBodyId);
				if (body === void 0) continue;
				const seen = /* @__PURE__ */ new Set();
				for (const rawEntity of memory.entities ?? []) {
					const entity = rawEntity.trim();
					const key = normalizeEntity(entity);
					if (key === "" || seen.has(key)) continue;
					seen.add(key);
					const current = indexedEntities.get(key);
					if (current === void 0) indexedEntities.set(key, {
						entity,
						memories: [memory],
						bodies: [body]
					});
					else {
						current.memories.push(memory);
						if (!current.bodies.some((candidate) => candidate.id === body.id)) current.bodies.push(body);
					}
				}
			}
			const entities = [...indexedEntities.values()].sort((left, right) => right.memories.length - left.memories.length || left.entity.localeCompare(right.entity)).slice(0, 24);
			const entityNodes = entities.map((item) => ({
				id: item.entity,
				graphId: entityGraphId(item.entity),
				kind: "entity",
				category: "entity",
				content: item.entity,
				color: "#2b9db9",
				occurrenceCount: item.memories.length,
				memoryBodyIds: item.bodies.map((body) => body.id),
				memoryBodyNames: item.bodies.map((body) => body.name)
			}));
			for (const item of entities) {
				const key = entityGraphId(item.entity);
				for (const memory of item.memories) edges.push({
					sourceId: key,
					targetId: graphNodeKey(memory),
					label: item.entity,
					color: "#22a879",
					type: "entity"
				});
			}
			return {
				...graph,
				nodes: [
					...spaceNodes,
					...entityNodes,
					...memories
				],
				edges
			};
		}
		function graphKindLabel(t, node) {
			const kind = graphNodeKind(node);
			return kind === "space" ? t("graph.kindSpace") : kind === "entity" ? t("graph.kindEntity") : categoryLabel(t, node.category ?? "general");
		}
		function activeCategoryAnchors(grouped) {
			const categories = [...grouped.keys()].sort((left, right) => {
				const leftIndex = CATEGORY_ORDER.indexOf(left);
				const rightIndex = CATEGORY_ORDER.indexOf(right);
				return (leftIndex < 0 ? CATEGORY_ORDER.length : leftIndex) - (rightIndex < 0 ? CATEGORY_ORDER.length : rightIndex);
			});
			const anchors = /* @__PURE__ */ new Map();
			if (categories.length === 1) {
				anchors.set(categories[0], {
					x: GRAPH_WIDTH / 2,
					y: GRAPH_HEIGHT / 2
				});
				return anchors;
			}
			categories.forEach((category, index) => {
				const angle = -Math.PI / 2 + index / categories.length * Math.PI * 2;
				anchors.set(category, {
					x: GRAPH_WIDTH / 2 + Math.cos(angle) * Math.min(250, 115 + categories.length * 23),
					y: GRAPH_HEIGHT / 2 + Math.sin(angle) * Math.min(165, 78 + categories.length * 15)
				});
			});
			return anchors;
		}
		function clampGraphPosition(position) {
			return {
				x: Math.min(872, Math.max(GRAPH_MARGIN_X, position.x)),
				y: Math.min(462, Math.max(GRAPH_MARGIN_Y, position.y))
			};
		}
		function naturalGraphPositions(nodes, edges) {
			const positions = /* @__PURE__ */ new Map();
			const grouped = /* @__PURE__ */ new Map();
			for (const node of nodes) {
				const category = node.category ?? "general";
				grouped.set(category, [...grouped.get(category) ?? [], node]);
			}
			const anchors = activeCategoryAnchors(grouped);
			for (const [category, items] of grouped) {
				const anchor = anchors.get(category) ?? {
					x: GRAPH_WIDTH / 2,
					y: GRAPH_HEIGHT / 2
				};
				items.forEach((node, index) => {
					const seed = hash(graphNodeKey(node));
					const angle = index * 2.399963 + seed % 37 / 37 * .4;
					const radius = items.length === 1 ? 0 : 24 + Math.sqrt(index + 1) * 35;
					positions.set(graphNodeKey(node), clampGraphPosition({
						x: anchor.x + Math.cos(angle) * radius,
						y: anchor.y + Math.sin(angle) * radius
					}));
				});
			}
			const velocities = new Map(nodes.map((node) => [graphNodeKey(node), {
				x: 0,
				y: 0
			}]));
			const visibleIds = new Set(nodes.map(graphNodeKey));
			const visibleEdges = edges.filter((edge) => visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId));
			for (let iteration = 0; iteration < 150; iteration += 1) {
				const cooling = 1 - iteration / 180;
				for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
					const left = nodes[leftIndex];
					const leftPosition = positions.get(graphNodeKey(left));
					const leftVelocity = velocities.get(graphNodeKey(left));
					for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
						const right = nodes[rightIndex];
						const rightPosition = positions.get(graphNodeKey(right));
						const rightVelocity = velocities.get(graphNodeKey(right));
						let dx = leftPosition.x - rightPosition.x;
						let dy = leftPosition.y - rightPosition.y;
						if (dx === 0 && dy === 0) {
							dx = hash(graphNodeKey(left)) % 13 - 6 || 1;
							dy = hash(graphNodeKey(right)) % 11 - 5 || -1;
						}
						const distanceSquared = Math.max(100, dx * dx + dy * dy);
						const distance = Math.sqrt(distanceSquared);
						const force = Math.min(9, 18e3 / distanceSquared) * cooling + (distance < 66 ? (66 - distance) * .08 : 0);
						const forceX = dx / distance * force;
						const forceY = dy / distance * force;
						leftVelocity.x += forceX;
						leftVelocity.y += forceY;
						rightVelocity.x -= forceX;
						rightVelocity.y -= forceY;
					}
				}
				for (const edge of visibleEdges) {
					const source = positions.get(edge.sourceId);
					const target = positions.get(edge.targetId);
					const sourceVelocity = velocities.get(edge.sourceId);
					const targetVelocity = velocities.get(edge.targetId);
					const dx = target.x - source.x;
					const dy = target.y - source.y;
					const distance = Math.max(1, Math.hypot(dx, dy));
					const sparseScale = nodes.length <= 3 ? 2 : nodes.length <= 8 ? 1.45 : 1;
					const spring = (distance - (edge.type === "scope" ? 138 : edge.type === "entity" ? 94 : edge.type === "semantic" ? 118 : 106) * sparseScale) * .018 * cooling;
					const forceX = dx / distance * spring;
					const forceY = dy / distance * spring;
					sourceVelocity.x += forceX;
					sourceVelocity.y += forceY;
					targetVelocity.x -= forceX;
					targetVelocity.y -= forceY;
				}
				for (const node of nodes) {
					const key = graphNodeKey(node);
					const position = positions.get(key);
					const velocity = velocities.get(key);
					const anchor = anchors.get(node.category ?? "general") ?? {
						x: GRAPH_WIDTH / 2,
						y: GRAPH_HEIGHT / 2
					};
					velocity.x += (anchor.x - position.x) * .0035 * cooling + (GRAPH_WIDTH / 2 - position.x) * 8e-4;
					velocity.y += (anchor.y - position.y) * .0035 * cooling + (GRAPH_HEIGHT / 2 - position.y) * 8e-4;
					velocity.x = Math.max(-12, Math.min(12, velocity.x * .76));
					velocity.y = Math.max(-12, Math.min(12, velocity.y * .76));
					positions.set(key, clampGraphPosition({
						x: position.x + velocity.x,
						y: position.y + velocity.y
					}));
				}
			}
			return positions;
		}
		function uniformGraphPositions(nodes) {
			const positions = /* @__PURE__ */ new Map();
			const ordered = [...nodes].sort((left, right) => {
				const categoryDifference = CATEGORY_ORDER.indexOf(left.category ?? "general") - CATEGORY_ORDER.indexOf(right.category ?? "general");
				return categoryDifference === 0 ? left.id.localeCompare(right.id) : categoryDifference;
			});
			const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length * 1.65)));
			const rows = Math.max(1, Math.ceil(ordered.length / columns));
			const cellWidth = 814 / columns;
			const cellHeight = 404 / rows;
			ordered.forEach((node, index) => {
				const row = Math.floor(index / columns);
				const column = index % columns;
				const rowLength = Math.min(columns, ordered.length - row * columns);
				const rowOffset = (columns - rowLength) * cellWidth / 2;
				positions.set(graphNodeKey(node), {
					x: GRAPH_MARGIN_X + rowOffset + cellWidth * (column + .5),
					y: GRAPH_MARGIN_Y + cellHeight * (row + .5)
				});
			});
			return positions;
		}
		function graphPoint(svg, clientX, clientY) {
			const matrix = svg.getScreenCTM?.();
			if (matrix !== null && matrix !== void 0 && typeof svg.createSVGPoint === "function") {
				const point = svg.createSVGPoint();
				point.x = clientX;
				point.y = clientY;
				return clampGraphPosition(point.matrixTransform(matrix.inverse()));
			}
			const bounds = svg.getBoundingClientRect();
			const width = bounds.width || GRAPH_WIDTH;
			const height = bounds.height || GRAPH_HEIGHT;
			return clampGraphPosition({
				x: (clientX - bounds.left) * GRAPH_WIDTH / width,
				y: (clientY - bounds.top) * GRAPH_HEIGHT / height
			});
		}
		function MemoryGraph(props) {
			const t = useT();
			const visibleNodes = (0, react.useMemo)(() => {
				const spaces = props.graph.nodes.filter((node) => graphNodeKind(node) === "space");
				const entities = props.graph.nodes.filter((node) => graphNodeKind(node) === "entity").slice(0, 20);
				const memories = props.graph.nodes.filter((node) => graphNodeKind(node) === "memory").slice(0, Math.max(0, 60 - spaces.length - entities.length));
				return [
					...spaces,
					...entities,
					...memories
				].slice(0, 60);
			}, [props.graph.nodes]);
			const visibleIds = (0, react.useMemo)(() => new Set(visibleNodes.map(graphNodeKey)), [visibleNodes]);
			const visibleKinds = (0, react.useMemo)(() => new Map(visibleNodes.map((node) => [graphNodeKey(node), graphNodeKind(node)])), [visibleNodes]);
			const edges = (0, react.useMemo)(() => {
				const priority = /* @__PURE__ */ new Map([
					["entity", 0],
					["scope", 1],
					["causal", 2],
					["semantic", 3],
					["temporal", 4]
				]);
				return props.graph.edges.filter((edge) => visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId)).map((edge, index) => ({
					edge,
					index
				})).sort((left, right) => (priority.get(left.edge.type ?? "temporal") ?? 5) - (priority.get(right.edge.type ?? "temporal") ?? 5) || left.index - right.index).slice(0, 180).map(({ edge }) => edge);
			}, [props.graph.edges, visibleIds]);
			const curvedEdges = (0, react.useMemo)(() => {
				const groups = /* @__PURE__ */ new Map();
				edges.forEach((edge, index) => {
					const key = [edge.sourceId, edge.targetId].sort().join("::");
					groups.set(key, [...groups.get(key) ?? [], index]);
				});
				return edges.map((edge, index) => {
					const key = [edge.sourceId, edge.targetId].sort().join("::");
					const group = groups.get(key) ?? [index];
					return {
						edge,
						offset: (group.indexOf(index) - (group.length - 1) / 2) * 12
					};
				});
			}, [edges]);
			const layoutKey = `${visibleNodes.map((node) => `${graphNodeKey(node)}:${graphNodeKind(node)}:${node.category ?? "general"}`).join("|")}::${edges.map((edge) => `${edge.sourceId}>${edge.targetId}:${edge.type ?? "temporal"}`).join("|")}`;
			const naturalLayout = (0, react.useMemo)(() => naturalGraphPositions(visibleNodes, edges), [layoutKey]);
			const [positions, setPositions] = (0, react.useState)(() => naturalLayout);
			const [layoutMode, setLayoutMode] = (0, react.useState)("natural");
			const positionsRef = (0, react.useRef)(positions);
			const animationRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)(null);
			const commitPositions = (0, react.useCallback)((next) => {
				positionsRef.current = next;
				setPositions(next);
			}, []);
			const cancelAnimation = (0, react.useCallback)(() => {
				if (animationRef.current !== null && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(animationRef.current);
				animationRef.current = null;
			}, []);
			const animateTo = (0, react.useCallback)((target, mode) => {
				cancelAnimation();
				setLayoutMode(mode);
				if (typeof window.requestAnimationFrame !== "function") {
					commitPositions(target);
					return;
				}
				const start = new Map(positionsRef.current);
				const startedAt = performance.now();
				const tick = (time) => {
					const progress = Math.min(1, (time - startedAt) / 620);
					const eased = 1 - Math.pow(1 - progress, 3);
					const next = /* @__PURE__ */ new Map();
					for (const [id, destination] of target) {
						const origin = start.get(id) ?? {
							x: GRAPH_WIDTH / 2,
							y: GRAPH_HEIGHT / 2
						};
						next.set(id, {
							x: origin.x + (destination.x - origin.x) * eased,
							y: origin.y + (destination.y - origin.y) * eased
						});
					}
					commitPositions(next);
					if (progress < 1) animationRef.current = window.requestAnimationFrame(tick);
					else animationRef.current = null;
				};
				animationRef.current = window.requestAnimationFrame(tick);
			}, [cancelAnimation, commitPositions]);
			(0, react.useEffect)(() => {
				animateTo(naturalLayout, "natural");
			}, [layoutKey]);
			(0, react.useEffect)(() => () => cancelAnimation(), [cancelAnimation]);
			const beginDrag = (event, nodeId) => {
				cancelAnimation();
				dragRef.current = {
					nodeId,
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					moved: false
				};
				event.currentTarget.setPointerCapture?.(event.pointerId);
			};
			const moveDrag = (event) => {
				const drag = dragRef.current;
				const svg = event.currentTarget.ownerSVGElement;
				if (drag === null || svg === null || drag.pointerId !== event.pointerId) return;
				if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
				drag.moved = true;
				const point = graphPoint(svg, event.clientX, event.clientY);
				const next = new Map(positionsRef.current);
				next.set(drag.nodeId, point);
				commitPositions(next);
				setLayoutMode("custom");
			};
			const endDrag = (event) => {
				const drag = dragRef.current;
				if (drag === null || drag.pointerId !== event.pointerId) return;
				const svg = event.currentTarget.ownerSVGElement;
				if (drag.moved && svg !== null) {
					const next = new Map(positionsRef.current);
					next.set(drag.nodeId, graphPoint(svg, event.clientX, event.clientY));
					commitPositions(next);
				}
				dragRef.current = null;
				event.currentTarget.releasePointerCapture?.(event.pointerId);
				if (!drag.moved) {
					const node = visibleNodes.find((candidate) => graphNodeKey(candidate) === drag.nodeId);
					if (node !== void 0) props.onSelect(node);
				}
			};
			const cancelDrag = (event) => {
				if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
			};
			const nudge = (nodeId, dx, dy) => {
				cancelAnimation();
				const current = positionsRef.current.get(nodeId);
				if (current === void 0) return;
				const next = new Map(positionsRef.current);
				next.set(nodeId, clampGraphPosition({
					x: current.x + dx,
					y: current.y + dy
				}));
				commitPositions(next);
				setLayoutMode("custom");
			};
			const layoutLabel = t(layoutMode === "natural" ? "graph.layoutNatural" : layoutMode === "uniform" ? "graph.layoutUniform" : "graph.layoutCustom");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.graphCanvasControls,
				role: "toolbar",
				"aria-label": t("graph.layoutAria"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						role: "status",
						"aria-label": t("graph.layoutStatus", { layout: layoutLabel }),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}), t("graph.draggable", { layout: layoutLabel })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-active": layoutMode === "natural" || void 0,
						onClick: () => animateTo(naturalGraphPositions(visibleNodes, edges), "natural"),
						children: t("graph.naturalAction")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-active": layoutMode === "uniform" || void 0,
						onClick: () => animateTo(uniformGraphPositions(visibleNodes), "uniform"),
						children: t("graph.uniformAction")
					})
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				className: MnemonView_module_css_default.graphSvg,
				viewBox: `0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`,
				role: "img",
				"data-layout": layoutMode,
				"data-density": visibleNodes.length <= 12 ? "sparse" : "dense",
				"aria-label": t("graph.aria", {
					nodes: props.graph.nodes.length,
					edges: props.graph.edges.length
				}),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("defs", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pattern", {
						id: "mnemon-grid",
						width: "26",
						height: "26",
						patternUnits: "userSpaceOnUse",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M 26 0 L 0 0 0 26",
							className: MnemonView_module_css_default.graphGridLine,
							fill: "none"
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("filter", {
						id: "mnemon-glow",
						x: "-100%",
						y: "-100%",
						width: "300%",
						height: "300%",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("feGaussianBlur", {
							stdDeviation: "4",
							result: "blur"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("feMerge", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("feMergeNode", { in: "blur" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("feMergeNode", { in: "SourceGraphic" })] })]
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						width: GRAPH_WIDTH,
						height: GRAPH_HEIGHT,
						className: MnemonView_module_css_default.graphBackdrop
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						width: GRAPH_WIDTH,
						height: GRAPH_HEIGHT,
						fill: "url(#mnemon-grid)"
					}),
					curvedEdges.map(({ edge, offset }, index) => {
						const source = positions.get(edge.sourceId) ?? naturalLayout.get(edge.sourceId) ?? {
							x: GRAPH_WIDTH / 2,
							y: GRAPH_HEIGHT / 2
						};
						const target = positions.get(edge.targetId) ?? naturalLayout.get(edge.targetId) ?? {
							x: GRAPH_WIDTH / 2,
							y: GRAPH_HEIGHT / 2
						};
						const dx = target.x - source.x;
						const dy = target.y - source.y;
						const distance = Math.max(1, Math.hypot(dx, dy));
						const direction = edge.sourceId.localeCompare(edge.targetId) <= 0 ? 1 : -1;
						const controlX = (source.x + target.x) / 2 - dy / distance * offset * direction;
						const controlY = (source.y + target.y) / 2 + dx / distance * offset * direction;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`,
							className: MnemonView_module_css_default.graphEdge,
							"data-edge": edge.type ?? "temporal",
							"data-source-id": edge.sourceId,
							"data-target-id": edge.targetId,
							"data-source-kind": visibleKinds.get(edge.sourceId),
							"data-target-kind": visibleKinds.get(edge.targetId)
						}, `${edge.sourceId}-${edge.targetId}-${index}`);
					}),
					visibleNodes.map((node, index) => {
						const nodeKey = graphNodeKey(node);
						const position = positions.get(nodeKey) ?? naturalLayout.get(nodeKey) ?? {
							x: GRAPH_WIDTH / 2,
							y: GRAPH_HEIGHT / 2
						};
						const selected = props.selectedId === nodeKey;
						const showLabel = selected || visibleNodes.length < 22 || index % 3 === 0;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
							className: MnemonView_module_css_default.graphNode,
							"data-node-id": nodeKey,
							"data-provider": node.memoryProviderId,
							"data-category": node.category ?? "general",
							"data-kind": graphNodeKind(node),
							"data-selected": selected || void 0,
							transform: `translate(${position.x} ${position.y})`,
							role: "button",
							tabIndex: 0,
							"aria-label": `${graphKindLabel(t, node)}: ${short(node.content, 80)}`,
							"data-dragging": dragRef.current?.nodeId === nodeKey || void 0,
							onPointerDown: (event) => beginDrag(event, nodeKey),
							onPointerMove: moveDrag,
							onPointerUp: endDrag,
							onPointerCancel: cancelDrag,
							onLostPointerCapture: cancelDrag,
							onClick: () => props.onSelect(node),
							onKeyDown: (event) => {
								if (event.key === "Enter" || event.key === " ") props.onSelect(node);
								else if (event.key === "ArrowLeft") {
									event.preventDefault();
									nudge(nodeKey, -12, 0);
								} else if (event.key === "ArrowRight") {
									event.preventDefault();
									nudge(nodeKey, 12, 0);
								} else if (event.key === "ArrowUp") {
									event.preventDefault();
									nudge(nodeKey, 0, -12);
								} else if (event.key === "ArrowDown") {
									event.preventDefault();
									nudge(nodeKey, 0, 12);
								}
							},
							children: [
								graphNodeKind(node) === "space" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
									x: selected ? -20 : -17,
									y: selected ? -15 : -13,
									width: selected ? 40 : 34,
									height: selected ? 30 : 26,
									rx: "9",
									className: MnemonView_module_css_default.nodeHalo,
									filter: selected ? "url(#mnemon-glow)" : void 0
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
									r: selected ? 6 : 5,
									className: MnemonView_module_css_default.nodeCore
								})] }) : graphNodeKind(node) === "entity" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
									d: selected ? "M 0 -18 L 18 0 L 0 18 L -18 0 Z" : "M 0 -14 L 14 0 L 0 14 L -14 0 Z",
									className: MnemonView_module_css_default.nodeHalo,
									filter: selected ? "url(#mnemon-glow)" : void 0
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
									r: selected ? 5 : 4,
									className: MnemonView_module_css_default.nodeCore
								})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
									r: selected ? 17 : visibleNodes.length <= 12 ? 14 : 11,
									className: MnemonView_module_css_default.nodeHalo,
									filter: selected ? "url(#mnemon-glow)" : void 0
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
									r: selected ? 7 : visibleNodes.length <= 12 ? 6 : 4.5,
									className: MnemonView_module_css_default.nodeCore
								})] }),
								(selected || visibleNodes.length <= 12) && graphNodeKind(node) === "memory" && node.memoryBodyName !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
									x: "0",
									y: "-18",
									textAnchor: "middle",
									className: MnemonView_module_css_default.nodeBodyLabel,
									children: short(node.memoryBodyName, 12)
								}),
								showLabel && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
									x: visibleNodes.length <= 12 ? 19 : 15,
									y: "4",
									className: MnemonView_module_css_default.nodeLabel,
									children: short(node.content.replace(/\s+/gu, " "), selected ? 34 : visibleNodes.length <= 12 ? 26 : 19)
								})
							]
						}, nodeKey);
					})
				]
			})] });
		}
		function OverviewPage(props) {
			const t = useT();
			const locale = useLocale();
			const appearance = useMnemonViewAppearance();
			const bodyCreateFormId = (0, react.useId)();
			const bodyEditFormId = (0, react.useId)();
			const [graph, setGraph] = (0, react.useState)(null);
			const [catalog, setCatalog] = (0, react.useState)(null);
			const [selected, setSelected] = (0, react.useState)(null);
			const [catalogLoading, setCatalogLoading] = (0, react.useState)(true);
			const [healthLoading, setHealthLoading] = (0, react.useState)(true);
			const [graphLoading, setGraphLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(null);
			const [changing, setChanging] = (0, react.useState)(null);
			const [reconnectingBody, setReconnectingBody] = (0, react.useState)(null);
			const [creating, setCreating] = (0, react.useState)(false);
			const [creatingBodyOpen, setCreatingBodyOpen] = (0, react.useState)(false);
			const [bodyName, setBodyName] = (0, react.useState)("");
			const [bodyDescription, setBodyDescription] = (0, react.useState)("");
			const [bodyProviderId, setBodyProviderId] = (0, react.useState)("mnemon-native");
			const [providerDrafts, setProviderDrafts] = (0, react.useState)({});
			const [catalogUnavailable, setCatalogUnavailable] = (0, react.useState)(false);
			const [editingBody, setEditingBody] = (0, react.useState)(null);
			const [editName, setEditName] = (0, react.useState)("");
			const [editDescription, setEditDescription] = (0, react.useState)("");
			const [editConnection, setEditConnection] = (0, react.useState)({});
			const [editClearSecrets, setEditClearSecrets] = (0, react.useState)([]);
			const [savingBody, setSavingBody] = (0, react.useState)(null);
			const [confirmingDeleteBody, setConfirmingDeleteBody] = (0, react.useState)(null);
			const [deletingBody, setDeletingBody] = (0, react.useState)(null);
			const [preview, setPreview] = (0, react.useState)(null);
			const [metadataOpen, setMetadataOpen] = (0, react.useState)(false);
			const [metadataSelection, setMetadataSelection] = (0, react.useState)([]);
			const [metadataTasks, setMetadataTasks] = (0, react.useState)({});
			const [lastFullSyncAt, setLastFullSyncAt] = (0, react.useState)(null);
			const [syncClock, setSyncClock] = (0, react.useState)(() => Date.now());
			const loadRequest = (0, react.useRef)(0);
			const initialSyncStarted = (0, react.useRef)(false);
			const compatibilityRetryStarted = (0, react.useRef)(false);
			const fullSyncObserved = (0, react.useRef)(true);
			const load = (0, react.useCallback)(async (quiet = false) => {
				const request = ++loadRequest.current;
				setCatalogLoading(true);
				setHealthLoading(true);
				setGraphLoading(true);
				setError(null);
				let directoryUnavailable = false;
				try {
					const nextCatalog = await props.client.bodyDirectory().then((next) => {
						setCatalogUnavailable(false);
						return next;
					}).catch(() => {
						directoryUnavailable = true;
						setCatalogUnavailable(!props.catalogKnown);
						return {
							items: props.fallbackBodies,
							providers: [],
							total: props.fallbackBodies.length,
							activeCount: props.fallbackBodies.filter((body) => body.active).length,
							directory: props.fallbackDirectory ?? "",
							generatedAt: (/* @__PURE__ */ new Date()).toISOString()
						};
					});
					const normalizedProviders = Array.isArray(nextCatalog.providers) && nextCatalog.providers.length > 0 ? nextCatalog.providers : LEGACY_PROVIDER_CATALOG;
					const normalizedCatalog = {
						...nextCatalog,
						providers: normalizedProviders,
						items: nextCatalog.items.map(normalizeMemoryBody)
					};
					if (request !== loadRequest.current) return;
					setProviderDrafts((current) => mergeProviderDefaults(normalizedCatalog.providers, current));
					setCatalog(normalizedCatalog);
					setCatalogLoading(false);
					props.client.bodies().then((next) => {
						if (request !== loadRequest.current) return;
						const full = {
							...next,
							providers: Array.isArray(next.providers) && next.providers.length > 0 ? next.providers : normalizedProviders,
							items: next.items.map(normalizeMemoryBody)
						};
						setCatalog(full);
					}).catch((reason) => {
						if (request === loadRequest.current && !quiet && !directoryUnavailable) setError(message(reason));
					}).finally(() => {
						if (request === loadRequest.current) setHealthLoading(false);
					});
					props.client.graph().then((next) => {
						if (request !== loadRequest.current) return;
						const enriched = enrichMultiSpaceGraph(next, normalizedCatalog.items);
						setGraph(enriched);
						setSelected((current) => current === null ? null : enriched.nodes.find((node) => graphNodeKey(node) === graphNodeKey(current)) ?? null);
					}).catch((reason) => {
						if (request === loadRequest.current && !directoryUnavailable) setError(message(reason));
					}).finally(() => {
						if (request === loadRequest.current) setGraphLoading(false);
					});
				} catch (reason) {
					if (request === loadRequest.current) {
						setError(message(reason));
						setCatalogLoading(false);
						setHealthLoading(false);
						setGraphLoading(false);
					}
				}
			}, [
				props.catalogKnown,
				props.client,
				props.fallbackBodies,
				props.fallbackDirectory
			]);
			(0, react.useEffect)(() => {
				if (initialSyncStarted.current) return;
				initialSyncStarted.current = true;
				load();
			}, [load]);
			(0, react.useEffect)(() => {
				if (!catalogUnavailable || !props.catalogKnown || compatibilityRetryStarted.current) return;
				compatibilityRetryStarted.current = true;
				load(true);
			}, [
				catalogUnavailable,
				load,
				props.catalogKnown
			]);
			(0, react.useEffect)(() => {
				const timer = window.setInterval(() => setSyncClock(Date.now()), 1e3);
				return () => window.clearInterval(timer);
			}, []);
			const toggle = async (body) => {
				setChanging(body.id);
				setError(null);
				try {
					await props.client.updateBody(body.id, { active: !body.active });
					await load(true);
					props.onMutate();
				} catch (reason) {
					setError(message(reason));
				} finally {
					setChanging(null);
				}
			};
			const reconnect = async (body) => {
				if (reconnectingBody !== null || editingBody !== null || deletingBody !== null) return;
				setReconnectingBody(body.id);
				setError(null);
				setCatalog((current) => current === null ? current : {
					...current,
					items: current.items.map((item) => item.id === body.id ? {
						...item,
						statusLoading: true
					} : item)
				});
				try {
					const next = normalizeMemoryBody(await props.client.reconnectBody(body.id));
					setCatalog((current) => current === null ? current : {
						...current,
						items: current.items.map((item) => item.id === next.id ? next : item)
					});
					props.onBodyReconnect(next);
				} catch (reason) {
					const failure = message(reason);
					setCatalog((current) => current === null ? current : {
						...current,
						items: current.items.map((item) => item.id === body.id ? {
							...item,
							healthy: false,
							statusLoading: false,
							error: failure
						} : item)
					});
					setError(failure);
				} finally {
					setReconnectingBody(null);
				}
			};
			const beginEdit = (body) => {
				setEditingBody(body.id);
				setEditName(body.name);
				setEditDescription(body.description ?? "");
				setError(null);
				setEditConnection(body.provider.id === "mnemon-native" ? {} : { ...body.provider.settings });
				setEditClearSecrets([]);
			};
			const saveEdit = async (event, body) => {
				event.preventDefault();
				if (editName.trim() === "") return;
				setSavingBody(body.id);
				setError(null);
				try {
					const descriptor = catalog?.providers.find((provider) => provider.id === body.provider.id);
					const connection = descriptor === void 0 ? {} : Object.fromEntries(Object.entries(editConnection).filter(([key, value]) => {
						return descriptor.fields.find((candidate) => candidate.key === key)?.input !== "secret" || String(value) !== "";
					}));
					await props.client.updateBody(body.id, {
						name: editName,
						description: editDescription,
						...body.provider.id === "mnemon-native" ? {} : {
							connection,
							...editClearSecrets.length === 0 ? {} : { clearSecrets: editClearSecrets }
						}
					});
					setEditingBody(null);
					await load(true);
					props.onMutate();
				} catch (reason) {
					setError(message(reason));
				} finally {
					setSavingBody(null);
				}
			};
			const create = async (event) => {
				event.preventDefault();
				const providers = catalog?.providers ?? [];
				const manualProvider = providers.find((provider) => provider.id === bodyProviderId);
				if (bodyName.trim() === "" || bodyDescription.trim() === "" || !providerDraftComplete(manualProvider, providerDrafts[bodyProviderId])) return;
				setCreating(true);
				setError(null);
				try {
					await props.client.createBody({
						name: bodyName,
						description: bodyDescription,
						providerId: bodyProviderId,
						...bodyProviderId === "mnemon-native" ? {} : { connection: providerDrafts[bodyProviderId] ?? {} }
					});
					setBodyName("");
					setBodyDescription("");
					setBodyProviderId("mnemon-native");
					setProviderDrafts((current) => Object.fromEntries(providers.map((provider) => [provider.id, Object.fromEntries(Object.entries(current[provider.id] ?? {}).map(([key, value]) => [key, provider.fields.some((field) => field.key === key && field.input === "secret") ? "" : value]))])));
					if (appearance.surface === "sidebar") setCreatingBodyOpen(false);
					await load(true);
					props.onMutate();
				} catch (reason) {
					setError(message(reason));
				} finally {
					setCreating(false);
				}
			};
			const deleteBody = async (body) => {
				setDeletingBody(body.id);
				setError(null);
				try {
					await props.client.deleteBody(body.id);
					setConfirmingDeleteBody(null);
					await load(true);
					props.onMutate();
				} catch (reason) {
					setError(message(reason));
				} finally {
					setDeletingBody(null);
				}
			};
			const maintainMetadata = () => {
				if (metadataSelection.length === 0) return;
				const selectedIds = metadataSelection.filter((id) => metadataTasks[id]?.status !== "running");
				if (selectedIds.length === 0) return;
				setError(null);
				setMetadataSelection([]);
				setMetadataTasks((current) => ({
					...current,
					...Object.fromEntries(selectedIds.map((id) => [id, { status: "running" }]))
				}));
				for (const id of selectedIds) props.metadataClient.maintainBodyMetadata([id]).then((result) => {
					const update = result.updates.find((candidate) => candidate.memoryBodyId === id);
					if (update === void 0) throw new Error(`metadata task Agent omitted Memory Space ${id}`);
					setCatalog((current) => current === null ? current : {
						...current,
						items: current.items.map((body) => body.id === id ? {
							...body,
							name: update.title,
							description: update.description
						} : body)
					});
					props.onBodyMetadata([update]);
					setMetadataTasks((current) => ({
						...current,
						[id]: { status: "success" }
					}));
				}).catch((reason) => {
					setMetadataTasks((current) => ({
						...current,
						[id]: {
							status: "error",
							error: message(reason)
						}
					}));
				});
			};
			const generated = graph === null ? t("overview.waitingSnapshot") : t("overview.updatedAt", { time: new Date(graph.generatedAt).toLocaleTimeString(locale, {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit"
			}) });
			const graphSpaces = graph?.nodes.filter((node) => graphNodeKind(node) === "space").length ?? 0;
			const graphEntities = graph?.nodes.filter((node) => graphNodeKind(node) === "entity").length ?? 0;
			const graphMemories = graph?.nodes.filter((node) => graphNodeKind(node) === "memory").length ?? 0;
			const graphSources = graph?.sources ?? [];
			const onlyQueryOrUnsupported = graphSources.length > 0 && graphSources.every((source) => source.mode === "query-only" || source.mode === "unsupported" || source.status === "unavailable");
			const selectedKind = selected === null ? null : graphNodeKind(selected);
			const editingBodyView = editingBody === null ? void 0 : catalog?.items.find((body) => body.id === editingBody);
			const deletingBodyView = confirmingDeleteBody === null ? void 0 : catalog?.items.find((body) => body.id === confirmingDeleteBody);
			const providers = catalog?.providers ?? [];
			const metadataCandidates = (catalog?.items ?? props.fallbackBodies).filter((body) => body.active && body.providerEnabled !== false);
			const metadataRunningCount = Object.values(metadataTasks).filter((task) => task.status === "running").length;
			const metadataBusy = metadataRunningCount > 0;
			const metadataSelectable = metadataCandidates.filter((body) => metadataTasks[body.id]?.status !== "running");
			const metadataAllSelected = metadataSelectable.length > 0 && metadataSelectable.every((body) => metadataSelection.includes(body.id));
			const loading = catalogLoading || healthLoading || graphLoading;
			(0, react.useEffect)(() => {
				if (loading) {
					fullSyncObserved.current = true;
					return;
				}
				if (!fullSyncObserved.current) return;
				fullSyncObserved.current = false;
				if (error !== null) return;
				const completedAt = Date.now();
				setLastFullSyncAt(completedAt);
				setSyncClock(completedAt);
			}, [error, loading]);
			const fullSyncAge = lastFullSyncAt === null ? t("overview.fullSyncPending") : (() => {
				const seconds = Math.max(0, Math.floor((syncClock - lastFullSyncAt) / 1e3));
				if (seconds < 5) return t("overview.fullSyncJustNow");
				if (seconds < 60) return t("overview.fullSyncSeconds", { count: seconds });
				const minutes = Math.floor(seconds / 60);
				if (minutes < 60) return t("overview.fullSyncMinutes", { count: minutes });
				const hours = Math.floor(minutes / 60);
				if (hours < 24) return t("overview.fullSyncHours", { count: hours });
				return t("overview.fullSyncDays", { count: Math.floor(hours / 24) });
			})();
			const selectedProvider = providers.find((provider) => provider.id === bodyProviderId);
			const nativeBodyCount = catalog?.items.filter((body) => body.provider.id === "mnemon-native").length ?? 0;
			const canDeleteBody = (body) => body.provider.id !== "mnemon-native" || nativeBodyCount > 1;
			const updateProviderDraft = (providerId, key, value) => setProviderDrafts((current) => ({
				...current,
				[providerId]: {
					...current[providerId] ?? {},
					[key]: value
				}
			}));
			const placementReceipt = (body) => body.placement === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.placementReceipt,
				title: body.placement.reason,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					children: "✦"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(body.placement.decidedBy === "llm" ? "overview.placementByLlm" : "overview.placementByRules") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("overview.placementConfidence", { confidence: t(`overview.confidence.${body.placement.confidence}`) }) }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: body.placement.reason })
				] })]
			});
			const bodyEditForm = (body) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				id: bodyEditFormId,
				className: MnemonView_module_css_default.bodyEdit,
				onSubmit: (event) => void saveEdit(event, body),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("overview.editName"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						"aria-label": t("overview.editName"),
						value: editName,
						onChange: (event) => setEditName(event.target.value),
						maxLength: 100,
						required: true
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("overview.editDescription"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						"aria-label": t("overview.editDescription"),
						value: editDescription,
						onChange: (event) => setEditDescription(event.target.value),
						rows: 4,
						maxLength: 1e3
					})] }),
					body.provider.id !== "mnemon-native" && (() => {
						const descriptor = providers.find((provider) => provider.id === body.provider.id);
						return descriptor === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderMemoryFields, {
							provider: descriptor,
							connection: editConnection,
							onChange: (key, value) => setEditConnection((current) => ({
								...current,
								[key]: value
							})),
							body,
							clearSecrets: editClearSecrets,
							onClearSecretsChange: setEditClearSecrets
						});
					})(),
					appearance.surface === "buildin" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.bodyEditActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							className: MnemonView_module_css_default.primaryButton,
							disabled: savingBody === body.id || editName.trim() === "",
							children: savingBody === body.id ? t("overview.savingBody") : t("overview.saveBody")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.ghostButton,
							onClick: () => setEditingBody(null),
							children: t("common.cancel")
						})]
					})
				]
			});
			const bodyCreateForm = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				id: bodyCreateFormId,
				className: appearanceClass(MnemonView_module_css_default.bodyEdit, MnemonView_module_css_default.bodyCreateForm),
				onSubmit: (event) => void create(event),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: MnemonView_module_css_default.createSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.createSectionHeading,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "01" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("overview.createIdentityTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("overview.createIdentityHint") })] })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.createIdentityGrid,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("overview.createName"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								"data-autofocus": true,
								"aria-label": t("overview.createName"),
								value: bodyName,
								onChange: (event) => setBodyName(event.target.value),
								placeholder: t("overview.createNamePlaceholder"),
								maxLength: 100,
								required: true
							})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("overview.createDescription"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								"aria-label": t("overview.createDescription"),
								value: bodyDescription,
								onChange: (event) => setBodyDescription(event.target.value),
								placeholder: t("overview.createDescriptionPlaceholder"),
								rows: 3,
								maxLength: 1e3,
								required: true
							})] })]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: MnemonView_module_css_default.createSection,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.createSectionHeading,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "02" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("overview.createPlacementTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("overview.createPlacementHint") })] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
								className: MnemonView_module_css_default.providerChoice,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", { children: t("overview.providerLabel") }), providers.map((provider) => {
									const serviceMissing = provider.id !== "mnemon-native" && provider.serviceConfigured === false;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										"data-selected": bodyProviderId === provider.id || void 0,
										"data-native": provider.id === "mnemon-native" || void 0,
										"data-disabled": serviceMissing || void 0,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "radio",
												name: "memory-provider",
												value: provider.id,
												checked: bodyProviderId === provider.id,
												disabled: serviceMissing,
												onChange: () => setBodyProviderId(provider.id)
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderIcon, {
												providerId: provider.id,
												className: MnemonView_module_css_default.providerChoiceIcon
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [provider.label, provider.id === "mnemon-native" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: t("overview.nativeOfficial") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: serviceMissing ? t("overview.providerServiceRequired") : `${t(`overview.workspaceBinding.${provider.workspaceBinding}`)} · ${providerSummary(t, provider)}` })] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
												className: MnemonView_module_css_default.choiceControl,
												"data-kind": "radio",
												"aria-hidden": "true"
											})
										]
									}, provider.id);
								})]
							}),
							selectedProvider !== void 0 && selectedProvider.id !== "mnemon-native" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderMemoryFields, {
								provider: selectedProvider,
								connection: providerDrafts[selectedProvider.id] ?? {},
								onChange: (key, value) => updateProviderDraft(selectedProvider.id, key, value)
							})
						]
					}),
					appearance.surface === "buildin" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: appearanceClass(MnemonView_module_css_default.bodyEditActions, MnemonView_module_css_default.bodyCreateActions),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.ghostButton,
							disabled: creating,
							onClick: () => setCreatingBodyOpen(false),
							children: t("common.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							className: MnemonView_module_css_default.primaryButton,
							disabled: creating || bodyName.trim() === "" || bodyDescription.trim() === "" || !providerDraftComplete(selectedProvider, providerDrafts[bodyProviderId]),
							children: creating ? t("overview.creating") : t("overview.createAction")
						})]
					})
				]
			});
			const bodyToggle = (body) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: MnemonView_module_css_default.bodySwitch,
				role: "switch",
				"aria-checked": body.active,
				"aria-label": t("overview.toggleAria", { name: body.name }),
				disabled: !props.activationEnabled || changing === body.id || deletingBody === body.id,
				onClick: () => void toggle(body),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: MnemonView_module_css_default.bodySwitchTrack,
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: changing === body.id ? t("overview.toggling") : body.active ? t("common.active") : t("common.inactive") })]
			});
			const bodyEditActionClass = appearanceClass(MnemonView_module_css_default.ghostButton, appearanceClass(appearance.classes.itemActionButton, appearance.classes.itemEditAction));
			const bodyDeleteActionClass = appearanceClass(MnemonView_module_css_default.dangerButton, appearanceClass(appearance.classes.itemActionButton, appearance.classes.itemDangerAction));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageHeader, {
						title: appearance.surface === "sidebar" ? t("nav.overview") : t("overview.title"),
						description: t(appearance.surface === "sidebar" ? "overview.pageDescription" : "overview.description"),
						meta: fullSyncAge,
						...loading ? { loadingLabel: catalogLoading ? t("overview.directoryLoading") : graphLoading ? t("overview.snapshotLoading") : t("overview.healthLoading") } : {},
						action: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.secondaryButton,
							disabled: loading,
							onClick: () => void load(),
							children: loading ? t("overview.syncing") : t("overview.syncNow")
						})
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.inlineError,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: MnemonView_module_css_default.bodyDirectory,
						"aria-label": t("overview.directory"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.bodyDirectoryHeader,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("overview.directory") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("overview.directory.description") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
										className: MnemonView_module_css_default.bodyDirectoryPath,
										children: catalogUnavailable ? t("overview.directory.unsynced") : catalog?.directory || props.fallbackDirectory || t("overview.directory.waiting")
									})
								] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: appearance.surface === "sidebar" ? appearanceClass(MnemonView_module_css_default.bodyDirectoryControls, appearance.classes.bodyDirectoryActions) : MnemonView_module_css_default.bodyDirectoryControls,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: catalogUnavailable ? t("overview.directory.unsyncedBadge") : `${catalog?.activeCount ?? "—"} / ${catalog?.total ?? "—"} ${t("common.active")}` }),
										props.writeEnabled && !catalogUnavailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: bodyEditActionClass,
											title: !props.agentAvailable ? t("overview.metadataUnavailable") : void 0,
											onClick: () => {
												setMetadataSelection([]);
												setMetadataTasks({});
												setMetadataOpen(true);
												if (!props.agentAvailable) props.onAgentRefresh();
											},
											children: t("overview.metadataAction")
										}),
										appearance.surface === "sidebar" && props.writeEnabled && !catalogUnavailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: bodyEditActionClass,
											onClick: () => setCreatingBodyOpen(true),
											children: t("overview.createTitle")
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.bodyGrid,
								children: [catalog?.items.map((body) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("article", {
									className: MnemonView_module_css_default.bodyCard,
									"data-provider": body.provider.id,
									"data-active": body.active || void 0,
									"data-healthy": !body.statusLoading && body.healthy || void 0,
									"data-status-loading": body.statusLoading || void 0,
									"data-reconnectable": "",
									"data-reconnecting": reconnectingBody === body.id || void 0,
									"data-mnemon-default": body.mnemonDefault || void 0,
									"data-editing": appearance.surface === "buildin" && editingBody === body.id || void 0,
									tabIndex: 0,
									"aria-label": t("overview.reconnectAria", { name: body.name }),
									title: reconnectingBody === body.id ? t("overview.reconnecting") : body.error ?? t("overview.reconnectHint"),
									onClick: (event) => {
										if (event.target instanceof Element && event.target.closest("button, input, textarea, select, label, a, [role=\"switch\"]") !== null) return;
										reconnect(body);
									},
									onKeyDown: (event) => {
										if (event.target !== event.currentTarget || event.key !== "Enter" && event.key !== " ") return;
										event.preventDefault();
										reconnect(body);
									},
									children: appearance.surface === "buildin" ? editingBody === body.id ? bodyEditForm(body) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: MnemonView_module_css_default.bodyCardTop,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: MnemonView_module_css_default.bodySignal }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: body.name }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: body.id }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: MnemonView_module_css_default.bodyProviderRow,
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryProviderBadge, {
																providerId: body.provider.id,
																label: body.provider.label
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
																className: MnemonView_module_css_default.bodyHealth,
																children: reconnectingBody === body.id ? t("overview.reconnecting") : body.statusLoading ? t("overview.storageChecking") : body.healthy ? t("overview.storageHealthy") : t("overview.storageUnhealthy")
															}),
															body.mnemonDefault && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
																className: MnemonView_module_css_default.mnemonDefaultBadge,
																children: t("overview.mnemonDefault")
															})
														]
													})
												] }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: MnemonView_module_css_default.bodyCardActions,
													children: [bodyToggle(body), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: MnemonView_module_css_default.bodyEditButton,
														"aria-label": t("overview.editBodyAria", { name: body.name }),
														title: t("overview.editBody"),
														disabled: !props.writeEnabled,
														onClick: () => beginEdit(body),
														children: "✎"
													})]
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: body.description || t("overview.noDescription") }),
										placementReceipt(body),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("footer", { children: body.provider.id !== "mnemon-native" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: MnemonView_module_css_default.bodyFooterBlock,
											title: t(body.provider.kind === "remote" ? "overview.providerRemote" : "overview.providerLocal"),
											children: t(body.provider.kind === "remote" ? "overview.providerRemote" : "overview.providerLocal")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: `${MnemonView_module_css_default.bodyFooterBlock} ${MnemonView_module_css_default.bodyFooterGrow}`,
											title: body.provider.location || body.provider.label,
											children: body.provider.location || body.provider.label
										})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: MnemonView_module_css_default.bodyFooterBlock,
												title: t("common.memories", { count: body.stats?.totalInsights ?? 0 }),
												children: t("common.memories", { count: body.stats?.totalInsights ?? 0 })
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: MnemonView_module_css_default.bodyFooterBlock,
												title: t("common.edges", { count: body.stats?.edgeCount ?? 0 }),
												children: t("common.edges", { count: body.stats?.edgeCount ?? 0 })
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: MnemonView_module_css_default.bodyFooterBlock,
												title: humanBytes(body.stats?.dbSizeBytes ?? 0),
												children: humanBytes(body.stats?.dbSizeBytes ?? 0)
											})
										] }) })
									] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: appearance.classes.bodyCardHeader,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: appearance.classes.bodyCardIdentity,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: MnemonView_module_css_default.bodySignal }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: body.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: appearance.classes.bodyCardMeta,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: body.id }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryProviderBadge, {
															providerId: body.provider.id,
															label: body.provider.label
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
															className: MnemonView_module_css_default.bodyHealth,
															children: reconnectingBody === body.id ? t("overview.reconnecting") : body.statusLoading ? t("overview.storageChecking") : body.healthy ? t("overview.storageHealthy") : t("overview.storageUnhealthy")
														}),
														body.mnemonDefault && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
															className: MnemonView_module_css_default.mnemonDefaultBadge,
															children: t("overview.mnemonDefault")
														})
													]
												})] })]
											}), bodyToggle(body)]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											title: body.description || t("overview.noDescription"),
											children: body.description || t("overview.noDescription")
										}),
										placementReceipt(body),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
											className: appearance.classes.bodyCardFooter,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: appearance.classes.bodyCardStats,
												children: body.provider.id !== "mnemon-native" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: MnemonView_module_css_default.bodyFooterBlock,
													title: t(body.provider.kind === "remote" ? "overview.providerRemote" : "overview.providerLocal"),
													children: t(body.provider.kind === "remote" ? "overview.providerRemote" : "overview.providerLocal")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: `${MnemonView_module_css_default.bodyFooterBlock} ${MnemonView_module_css_default.bodyFooterGrow}`,
													title: body.provider.location || body.provider.label,
													children: body.provider.location || body.provider.label
												})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: MnemonView_module_css_default.bodyFooterBlock,
														title: t("common.memories", { count: body.stats?.totalInsights ?? 0 }),
														children: t("common.memories", { count: body.stats?.totalInsights ?? 0 })
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: MnemonView_module_css_default.bodyFooterBlock,
														title: t("common.edges", { count: body.stats?.edgeCount ?? 0 }),
														children: t("common.edges", { count: body.stats?.edgeCount ?? 0 })
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: MnemonView_module_css_default.bodyFooterBlock,
														title: humanBytes(body.stats?.dbSizeBytes ?? 0),
														children: humanBytes(body.stats?.dbSizeBytes ?? 0)
													})
												] })
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: MnemonView_module_css_default.bodyCardActions,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: bodyEditActionClass,
													"aria-label": t("overview.editBodyAria", { name: body.name }),
													disabled: !props.writeEnabled || deletingBody === body.id,
													onClick: () => beginEdit(body),
													children: t("overview.editBody")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: bodyDeleteActionClass,
													"aria-label": t(body.provider.id !== "mnemon-native" ? "overview.disconnectBodyAria" : "overview.deleteBodyAria", { name: body.name }),
													title: canDeleteBody(body) ? void 0 : t("overview.lastStoreDeleteHint"),
													disabled: !props.writeEnabled || deletingBody === body.id || !canDeleteBody(body),
													onClick: () => setConfirmingDeleteBody(body.id),
													children: body.provider.id !== "mnemon-native" ? t("overview.disconnectBody") : t("overview.deleteBody")
												})]
											})]
										})
									] })
								}, body.id)), catalog?.total === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.bodyDirectoryEmpty,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "◇" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: catalogUnavailable ? t("overview.unsyncedTitle") : t("overview.emptyTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: catalogUnavailable ? t("overview.unsyncedShort") : t("overview.emptyShort") })] })]
								})]
							}),
							appearance.surface === "buildin" && props.writeEnabled && !catalogUnavailable && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
								className: MnemonView_module_css_default.bodyCreate,
								open: catalog?.total === 0 ? true : void 0,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("overview.create") }), bodyCreateForm]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.asyncRegion,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReadSourcePanel, {
							title: t("overview.snapshotSources"),
							hint: t("overview.snapshotSourcesHint"),
							sources: graphSources
						})
					}),
					appearance.surface === "sidebar" && creatingBodyOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
						title: t("overview.createTitle"),
						description: t("overview.createDialogHint"),
						busy: creating,
						wide: true,
						onClose: () => setCreatingBodyOpen(false),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.modalFooterActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-dialog-close": true,
								className: MnemonView_module_css_default.ghostButton,
								disabled: creating,
								onClick: () => setCreatingBodyOpen(false),
								children: t("common.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								form: bodyCreateFormId,
								className: MnemonView_module_css_default.primaryButton,
								disabled: creating || bodyName.trim() === "" || bodyDescription.trim() === "" || !providerDraftComplete(selectedProvider, providerDrafts[bodyProviderId]),
								children: creating ? t("overview.creating") : t("overview.createAction")
							})]
						}),
						children: bodyCreateForm
					}),
					metadataOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
						title: t("overview.metadataTitle"),
						description: t("overview.metadataDescription"),
						busy: metadataBusy,
						wide: true,
						onClose: () => setMetadataOpen(false),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: MnemonView_module_css_default.modalFooterNote,
							children: t("overview.metadataSafety")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.modalFooterActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-dialog-close": true,
								className: MnemonView_module_css_default.ghostButton,
								disabled: metadataBusy,
								onClick: () => setMetadataOpen(false),
								children: t("common.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MnemonView_module_css_default.primaryButton,
								disabled: !props.agentAvailable || metadataSelection.length === 0,
								title: !props.agentAvailable ? t("overview.metadataUnavailable") : void 0,
								onClick: maintainMetadata,
								children: t("overview.metadataGenerate", { count: metadataSelection.length })
							})]
						})] }),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.metadataDialog,
							children: [
								!props.agentAvailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: MnemonView_module_css_default.inlineError,
									role: "status",
									children: t("overview.metadataUnavailable")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.metadataToolbar,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [t("overview.metadataSelected", { count: metadataSelection.length }), metadataRunningCount > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: t("overview.metadataRunningCount", { count: metadataRunningCount }) })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: MnemonView_module_css_default.ghostButton,
										disabled: metadataSelectable.length === 0,
										onClick: () => setMetadataSelection(metadataAllSelected ? [] : metadataSelectable.map((body) => body.id)),
										children: metadataAllSelected ? t("overview.metadataClear") : t("overview.metadataSelectAll")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.metadataList,
									"aria-live": "polite",
									children: [metadataCandidates.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: MnemonView_module_css_default.metadataEmpty,
										children: catalogLoading ? t("overview.metadataLoading") : t("overview.metadataEmpty")
									}), metadataCandidates.map((body) => {
										const selected = metadataSelection.includes(body.id);
										const task = metadataTasks[body.id];
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											"data-provider": body.provider.id,
											"data-selected": selected || void 0,
											"data-refreshing": task?.status === "running" || void 0,
											"data-refreshed": task?.status === "success" || void 0,
											"data-failed": task?.status === "error" || void 0,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "checkbox",
													checked: selected,
													disabled: task?.status === "running",
													onChange: (event) => setMetadataSelection((current) => event.target.checked ? [.../* @__PURE__ */ new Set([...current, body.id])] : current.filter((id) => id !== body.id))
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
													className: MnemonView_module_css_default.choiceControl,
													"data-kind": "check",
													"aria-hidden": "true"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: body.name }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: body.description || t("overview.noDescription") }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryProviderBadge, {
														providerId: body.provider.id,
														label: body.provider.label
													}), task === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: body.id }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
														className: MnemonView_module_css_default.metadataTaskStatus,
														"data-status": task.status,
														title: task.error,
														children: task.status === "running" ? t("overview.metadataTaskRunning") : task.status === "success" ? t("overview.metadataTaskSuccess") : t("overview.metadataTaskError", { error: task.error ?? t("overview.metadataTaskUnknown") })
													})] })
												] })
											]
										}, body.id);
									})]
								})
							]
						})
					}),
					appearance.surface === "sidebar" && editingBodyView !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
						title: t("overview.editBodyAria", { name: editingBodyView.name }),
						description: editingBodyView.id,
						busy: savingBody === editingBodyView.id,
						onClose: () => setEditingBody(null),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.modalFooterActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-dialog-close": true,
								className: MnemonView_module_css_default.ghostButton,
								disabled: savingBody === editingBodyView.id,
								onClick: () => setEditingBody(null),
								children: t("common.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								form: bodyEditFormId,
								className: MnemonView_module_css_default.primaryButton,
								disabled: savingBody === editingBodyView.id || editName.trim() === "",
								children: savingBody === editingBodyView.id ? t("overview.savingBody") : t("overview.saveBody")
							})]
						}),
						children: bodyEditForm(editingBodyView)
					}),
					appearance.surface === "sidebar" && deletingBodyView !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
						title: t(deletingBodyView.provider.id !== "mnemon-native" ? "overview.disconnectTitle" : "overview.deleteTitle", { name: deletingBodyView.name }),
						description: deletingBodyView.id,
						busy: deletingBody === deletingBodyView.id,
						onClose: () => setConfirmingDeleteBody(null),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.modalFooterActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-dialog-close": true,
								"data-autofocus": true,
								className: MnemonView_module_css_default.ghostButton,
								disabled: deletingBody === deletingBodyView.id,
								onClick: () => setConfirmingDeleteBody(null),
								children: t("common.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MnemonView_module_css_default.dangerSolidButton,
								title: canDeleteBody(deletingBodyView) ? void 0 : t("overview.lastStoreDeleteHint"),
								disabled: deletingBody === deletingBodyView.id || !canDeleteBody(deletingBodyView),
								onClick: () => void deleteBody(deletingBodyView),
								children: deletingBody === deletingBodyView.id ? t("overview.deletingBody") : t(deletingBodyView.provider.id !== "mnemon-native" ? "overview.disconnectAction" : "overview.deleteAction")
							})]
						}),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.bodyDeleteConfirm,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(deletingBodyView.provider.id !== "mnemon-native" ? "overview.disconnectWarning" : "overview.deleteWarning", { provider: deletingBodyView.provider.label }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.bodyDeleteSummary,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: deletingBodyView.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									deletingBodyView.provider.label,
									" · ",
									deletingBodyView.provider.location || t("common.memories", { count: deletingBodyView.stats?.totalInsights ?? 0 })
								] })]
							})]
						})
					}),
					!catalogUnavailable && graph !== null && graph.nodes.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.graphLayout,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: MnemonView_module_css_default.graphPanel,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.graphToolbar,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: MnemonView_module_css_default.liveDot }),
										t("overview.snapshot"),
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: generated })
									] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: MnemonView_module_css_default.graphLegend,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												"data-edge": "scope",
												children: t("overview.edgeScope")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												"data-edge": "temporal",
												children: t("overview.edgeTemporal")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												"data-edge": "semantic",
												children: t("overview.edgeSemantic")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												"data-edge": "causal",
												children: t("overview.edgeCausal")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												"data-edge": "entity",
												children: t("overview.edgeEntity")
											})
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: MnemonView_module_css_default.graphViewport,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryGraph, {
										graph,
										selectedId: selected === null ? void 0 : graphNodeKey(selected),
										onSelect: setSelected
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.graphFooter,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("overview.graphComposition", {
										spaces: graphSpaces,
										memories: graphMemories,
										entities: graphEntities
									}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("overview.graphCount", {
											visible: Math.min(graph.nodes.length, 60),
											total: graph.nodes.length
										}),
										" · ",
										t("overview.graphEdges", { count: graph.edges.length })
									] })]
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("aside", {
							className: MnemonView_module_css_default.graphInspector,
							"data-empty": selected === null || void 0,
							children: selected === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.inspectorEmpty,
								children: [
									appearance.showLogo ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MnemonLogo, {
										className: MnemonView_module_css_default.inspectorLogo,
										title: t("overview.inspector")
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: appearanceClass(MnemonView_module_css_default.inspectorLogo, appearance.classes.inspectorGlyph),
										"aria-hidden": "true",
										children: "◇"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("overview.selectNode") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("overview.selectNodeText") })
								]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.inspectorHeading,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(selectedKind === "space" ? "overview.inspectorSpace" : selectedKind === "entity" ? "overview.inspectorEntity" : "overview.inspector") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => setSelected(null),
										"aria-label": t("overview.closeInspector"),
										children: "×"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.inspectorChips,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: MnemonView_module_css_default.categoryChip,
										children: graphKindLabel(t, selected)
									}), selected.memoryProviderId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryProviderBadge, {
										providerId: selected.memoryProviderId,
										label: MEMORY_PROVIDER_LABELS[selected.memoryProviderId]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.inspectorTitleRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										className: MnemonView_module_css_default.inspectorTitle,
										children: selected.content
									}), selectedKind === "memory" && selected.content.length > 140 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: MnemonView_module_css_default.inspectorEye,
										onClick: () => setPreview(selected),
										"aria-label": t("overview.previewAria"),
										title: t("overview.previewAria"),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
											viewBox: "0 0 16 16",
											width: "13",
											height: "13",
											"aria-hidden": "true",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
												d: "M1 8s2.6-4.4 7-4.4S15 8 15 8s-2.6 4.4-7 4.4S1 8 1 8z",
												fill: "none",
												stroke: "currentColor",
												strokeWidth: "1.5"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
												cx: "8",
												cy: "8",
												r: "2.1",
												fill: "currentColor"
											})]
										})
									})]
								}),
								selectedKind === "space" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
									className: MnemonView_module_css_default.inspectorMeta,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("overview.spaceId") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: selected.memoryBodyId ?? selected.id }) })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("overview.containedMemories") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selected.occurrenceCount ?? 0 })] })]
								}) : selectedKind === "entity" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
									className: MnemonView_module_css_default.inspectorMeta,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("overview.entityMentions") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selected.occurrenceCount ?? 0 })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("term.spaces") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selected.memoryBodyNames?.join(" · ") || "—" })] })]
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
									className: MnemonView_module_css_default.inspectorMeta,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("term.space") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: [
											selected.memoryBodyName ?? "—",
											" ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: selected.memoryBodyId ?? "" })
										] })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("overview.memoryId") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: selected.id }) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("common.category") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: categoryLabel(t, selected.category ?? "general") })] })
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.inspectorActions,
									children: [selectedKind !== "space" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: MnemonView_module_css_default.primaryButton,
										onClick: () => props.onExplore(selected.content),
										children: t("overview.exploreNode")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: MnemonView_module_css_default.secondaryButton,
										onClick: () => void navigator.clipboard?.writeText(selected.id),
										children: t("common.copyId")
									})]
								})
							] })
						})]
					}) : !graphLoading && error === null ? catalogUnavailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
						glyph: "◇",
						title: t("overview.unsyncedTitle"),
						children: t("overview.unsyncedLong")
					}) : catalog?.total === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
						glyph: "◇",
						title: t("overview.emptyTitle"),
						children: t("overview.emptyLong")
					}) : catalog?.activeCount === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
						glyph: "◇",
						title: t("overview.noActiveTitle"),
						children: t("overview.noActiveText")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
						glyph: "◇",
						title: t(onlyQueryOrUnsupported ? "overview.noVisualTitle" : "overview.noContentTitle"),
						children: t(onlyQueryOrUnsupported ? "overview.noVisualText" : "overview.noContentText")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.asyncPlaceholder,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("overview.loading") })
					}),
					preview !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ContentPreview, {
						node: preview,
						kind: graphKindLabel(t, preview),
						onClose: () => setPreview(null)
					})
				]
			});
		}
		function ExplorePage(props) {
			const t = useT();
			const appearance = useMnemonViewAppearance();
			const pageSize = appearance.surface === "sidebar" ? 6 : Number.MAX_SAFE_INTEGER;
			const [query, setQuery] = (0, react.useState)(props.seed);
			const [mode, setMode] = (0, react.useState)("smart");
			const [category, setCategory] = (0, react.useState)("");
			const [results, setResults] = (0, react.useState)([]);
			const [sources, setSources] = (0, react.useState)([]);
			const [searchKind, setSearchKind] = (0, react.useState)(null);
			const [agentAnswer, setAgentAnswer] = (0, react.useState)(null);
			const [searched, setSearched] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [relatedTo, setRelatedTo] = (0, react.useState)(null);
			const [related, setRelated] = (0, react.useState)([]);
			const [relatedLoading, setRelatedLoading] = (0, react.useState)(false);
			const [visibleResultLimit, setVisibleResultLimit] = (0, react.useState)(pageSize);
			const [visibleRelatedLimit, setVisibleRelatedLimit] = (0, react.useState)(pageSize);
			const relatedRequests = useRequestVersion();
			(0, react.useEffect)(() => {
				if (props.seed !== "") setQuery(props.seed);
			}, [props.seed]);
			const runSearch = async (withAgent) => {
				if (query.trim() === "") return;
				relatedRequests.begin();
				setSearchKind(withAgent ? "agent" : "direct");
				setSearched(true);
				setError(null);
				setRelatedTo(null);
				setAgentAnswer(null);
				setVisibleResultLimit(pageSize);
				setVisibleRelatedLimit(pageSize);
				try {
					const request = {
						query,
						mode,
						...category === "" ? {} : { category },
						limit: props.status?.defaultRecallLimit ?? 10
					};
					if (withAgent) {
						const response = await props.agentClient.agentSearch(request);
						setResults(response.results);
						setSources(response.sources ?? []);
						setAgentAnswer({
							answer: response.answer,
							citations: response.citations,
							runId: response.delegation.runId
						});
					} else {
						const response = await props.client.search(request);
						setResults(response.results);
						setSources(response.sources ?? []);
					}
				} catch (reason) {
					setError(message(reason));
					setResults([]);
					setSources([]);
					setAgentAnswer(null);
				} finally {
					setSearchKind(null);
				}
			};
			const search = (event) => {
				event.preventDefault();
				runSearch(false);
			};
			const searching = searchKind !== null;
			const showRelated = async (insight) => {
				const request = relatedRequests.begin();
				setRelatedTo(insight);
				setRelated([]);
				setRelatedLoading(true);
				setError(null);
				setVisibleRelatedLimit(pageSize);
				if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => document.getElementById("mnemon-related-pane")?.scrollIntoView?.({
					block: "nearest",
					behavior: "smooth"
				}));
				try {
					const response = await props.client.related(insight.id, insight.memoryBodyId);
					if (relatedRequests.isCurrent(request)) setRelated(response);
				} catch (reason) {
					if (relatedRequests.isCurrent(request)) setError(message(reason));
				} finally {
					if (relatedRequests.isCurrent(request)) setRelatedLoading(false);
				}
			};
			const forget = async (insight) => {
				await props.onForget(insight);
				setResults((items) => items.filter((item) => insightKey(item) !== insightKey(insight)));
				setRelated((items) => items.filter((item) => insightKey(item) !== insightKey(insight)));
				if (relatedTo !== null && insightKey(relatedTo) === insightKey(insight)) setRelatedTo(null);
			};
			const visibleResults = results.slice(0, visibleResultLimit);
			const visibleRelated = related.slice(0, visibleRelatedLimit);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageHeader, {
						title: t("search.title"),
						description: t("search.description"),
						meta: t("search.maxResults", { count: props.status?.defaultRecallLimit ?? "—" })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: MnemonView_module_css_default.searchBar,
						onSubmit: (event) => void search(event),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.queryField,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									children: "⌕"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									value: query,
									onChange: (event) => setQuery(event.target.value),
									placeholder: t("search.placeholder"),
									"aria-label": t("search.queryAria")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("kbd", { children: "↵" })
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.searchControls,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("common.category"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: category,
									onChange: (event) => setCategory(event.target.value),
									"aria-label": t("search.categoryAria"),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: t("common.allCategories")
									}), CATEGORIES.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value,
										children: categoryLabel(t, value)
									}, value))]
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("search.strategy"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: mode,
									onChange: (event) => setMode(event.target.value),
									"aria-label": t("search.modeAria"),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "smart",
											children: t("search.modeSmart")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "keyword",
											children: t("search.modeKeyword")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "basic",
											children: t("search.modeBasic")
										})
									]
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.searchActions,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "submit",
										className: MnemonView_module_css_default.secondaryButton,
										disabled: searching || query.trim() === "",
										children: searchKind === "direct" ? t("search.searching") : t("search.action")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: MnemonView_module_css_default.primaryButton,
										disabled: searching || query.trim() === "" || !props.agentAvailable,
										onClick: () => void runSearch(true),
										children: searchKind === "agent" ? t("search.agentSearching") : t("search.agentAction")
									})]
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReadSourcePanel, {
						title: t("search.sourcesTitle"),
						sources
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.asyncResults,
						children: [
							searching && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionSpinner, { label: searchKind === "agent" ? t("search.agentSearching") : t("search.searching") }),
							agentAnswer !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: MnemonView_module_css_default.agentAnswer,
								"aria-label": t("search.agentAnswer"),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: MnemonView_module_css_default.agentAnswerHeading,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("search.agentAnswerHint") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("search.agentAnswer") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: agentAnswer.runId.slice(0, 8) })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: agentAnswer.answer }),
									agentAnswer.citations.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: MnemonView_module_css_default.agentCitations,
										children: agentAnswer.citations.map((citation) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: citation }, citation))
									})
								]
							}),
							error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: MnemonView_module_css_default.inlineError,
								role: "alert",
								children: error
							}),
							!searched && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
								glyph: "⌕",
								title: t("search.startTitle"),
								children: t("search.startText")
							}),
							searched && !searching && results.length === 0 && error === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
								glyph: "0",
								title: t("search.emptyTitle"),
								children: t("search.emptyText")
							}),
							results.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: relatedTo === null ? MnemonView_module_css_default.singleColumn : MnemonView_module_css_default.resultLayout,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									className: MnemonView_module_css_default.results,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: MnemonView_module_css_default.sectionHeading,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("search.results") }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: results.length })]
										}),
										visibleResults.map((insight) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InsightCard, {
											insight,
											writeEnabled: props.writeEnabled,
											onForget: forget,
											onRelated: (item) => void showRelated(item)
										}, insightKey(insight))),
										appearance.surface === "sidebar" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProgressiveFooter, {
											visible: visibleResults.length,
											total: results.length,
											pageSize,
											onMore: () => setVisibleResultLimit((value) => value + pageSize)
										})
									]
								}), relatedTo !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
									id: "mnemon-related-pane",
									className: MnemonView_module_css_default.relatedPane,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: MnemonView_module_css_default.sectionHeading,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("search.related") }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => {
													relatedRequests.begin();
													setRelatedTo(null);
													setRelatedLoading(false);
												},
												"aria-label": t("search.closeRelated"),
												children: "×"
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: MnemonView_module_css_default.relatedSource,
											children: relatedTo.content
										}),
										relatedLoading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: MnemonView_module_css_default.loading,
											children: t("search.traversing")
										}),
										!relatedLoading && related.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: MnemonView_module_css_default.muted,
											children: t("search.noRelated")
										}),
										visibleRelated.map((insight) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InsightCard, {
											insight,
											writeEnabled: props.writeEnabled,
											onForget: forget,
											onRelated: (item) => void showRelated(item)
										}, insightKey(insight))),
										appearance.surface === "sidebar" && !relatedLoading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProgressiveFooter, {
											visible: visibleRelated.length,
											total: related.length,
											pageSize,
											onMore: () => setVisibleRelatedLimit((value) => value + pageSize)
										})
									]
								})]
							})
						]
					})
				]
			});
		}
		function EntitiesPage(props) {
			const t = useT();
			const appearance = useMnemonViewAppearance();
			const entityPageSize = appearance.surface === "sidebar" ? 10 : Number.MAX_SAFE_INTEGER;
			const insightPageSize = appearance.surface === "sidebar" ? 6 : Number.MAX_SAFE_INTEGER;
			const [view, setView] = (0, react.useState)({
				items: [],
				insights: []
			});
			const [entity, setEntity] = (0, react.useState)("");
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(null);
			const [visibleEntityLimit, setVisibleEntityLimit] = (0, react.useState)(entityPageSize);
			const [visibleInsightLimit, setVisibleInsightLimit] = (0, react.useState)(insightPageSize);
			const entityRequests = useRequestVersion();
			const load = (0, react.useCallback)(async (selected) => {
				const request = entityRequests.begin();
				setLoading(true);
				setError(null);
				setVisibleInsightLimit(insightPageSize);
				if (selected === void 0) setVisibleEntityLimit(entityPageSize);
				try {
					const response = await props.client.entities(selected, 20);
					if (entityRequests.isCurrent(request)) setView(response);
				} catch (reason) {
					if (entityRequests.isCurrent(request)) setError(message(reason));
				} finally {
					if (entityRequests.isCurrent(request)) setLoading(false);
				}
			}, [
				entityPageSize,
				entityRequests,
				insightPageSize,
				props.client
			]);
			(0, react.useEffect)(() => {
				load();
			}, [load, props.revision]);
			const submit = (event) => {
				event.preventDefault();
				if (entity.trim() !== "") load(entity);
			};
			const visibleEntities = view.items.slice(0, visibleEntityLimit);
			const visibleInsights = view.insights.slice(0, visibleInsightLimit);
			const sources = view.sources ?? [];
			const hasEntityProvider = sources.length === 0 || sources.some((source) => source.mode === "entities" && source.status !== "unavailable");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageHeader, {
						title: t("entities.title"),
						description: t("entities.description"),
						meta: t("entities.count", { count: view.items.length })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReadSourcePanel, {
						title: t("entities.sourcesTitle"),
						sources
					}),
					!loading && !hasEntityProvider ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
						glyph: "◎",
						title: t("entities.unsupportedTitle"),
						children: t("entities.unsupportedText")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.entityLayout,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
							className: MnemonView_module_css_default.entityRail,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
									className: MnemonView_module_css_default.entitySearch,
									onSubmit: submit,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										"aria-label": t("entities.nameAria"),
										value: entity,
										onChange: (event) => setEntity(event.target.value),
										placeholder: t("entities.placeholder")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "submit",
										className: MnemonView_module_css_default.primaryButton,
										disabled: loading || entity.trim() === "",
										children: t("entities.action")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.entityHeading,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entities.top") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("entities.frequency") })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: MnemonView_module_css_default.entityList,
									children: visibleEntities.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										"aria-pressed": view.selected === item.entity,
										onClick: () => {
											setEntity(item.entity);
											load(item.entity);
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.entity }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.count })]
									}, item.entity))
								}),
								appearance.surface === "sidebar" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProgressiveFooter, {
									compact: true,
									visible: visibleEntities.length,
									total: view.items.length,
									pageSize: entityPageSize,
									onMore: () => setVisibleEntityLimit((value) => value + entityPageSize)
								}),
								!loading && view.items.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: MnemonView_module_css_default.muted,
									children: t("entities.emptyRail")
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: appearanceClass(MnemonView_module_css_default.entityResults, MnemonView_module_css_default.asyncResults),
							children: [
								loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionSpinner, { label: t("entities.loading") }),
								error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: MnemonView_module_css_default.inlineError,
									role: "alert",
									children: error
								}),
								!loading && view.selected === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
									glyph: "◎",
									title: t("entities.selectTitle"),
									children: t("entities.selectText")
								}),
								view.selected !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.sectionHeading,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: view.selected }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: view.insights.length })]
								}), !loading && view.insights.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
									glyph: "0",
									title: t("entities.emptyTitle"),
									children: t("entities.emptyText")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [visibleInsights.map((insight) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InsightCard, {
									insight,
									writeEnabled: props.writeEnabled,
									onForget: props.onForget,
									onRelated: () => props.onExplore(insight.content)
								}, insightKey(insight))), appearance.surface === "sidebar" && !loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProgressiveFooter, {
									visible: visibleInsights.length,
									total: view.insights.length,
									pageSize: insightPageSize,
									onMore: () => setVisibleInsightLimit((value) => value + insightPageSize)
								})] })] })
							]
						})]
					})
				]
			});
		}
		function RuntimePage(props) {
			const t = useT();
			const locale = useLocale();
			const appearance = useMnemonViewAppearance();
			const runtimeAddFormId = (0, react.useId)();
			const runtimeEditFormId = (0, react.useId)();
			const pageSize = 10;
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [target, setTarget] = (0, react.useState)("memory");
			const [importance, setImportance] = (0, react.useState)("normal");
			const [content, setContent] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const [editing, setEditing] = (0, react.useState)(null);
			const [editContent, setEditContent] = (0, react.useState)("");
			const [editImportance, setEditImportance] = (0, react.useState)("normal");
			const [removing, setRemoving] = (0, react.useState)(null);
			const [adding, setAdding] = (0, react.useState)(false);
			const [filterTarget, setFilterTarget] = (0, react.useState)("all");
			const [filterQuery, setFilterQuery] = (0, react.useState)("");
			const [visibleLimit, setVisibleLimit] = (0, react.useState)(pageSize);
			const load = (0, react.useCallback)(async () => {
				setLoading(true);
				setError(null);
				try {
					setSnapshot(await props.client.runtimeMemory());
				} catch (reason) {
					setError(message(reason));
				} finally {
					setLoading(false);
				}
			}, [props.client]);
			(0, react.useEffect)(() => {
				load();
			}, [load, props.revision]);
			(0, react.useEffect)(() => {
				setVisibleLimit(pageSize);
			}, [filterQuery, filterTarget]);
			const entryKey = (entry) => `${entry.target}:${entry.created_at}:${entry.content}`;
			const mutate = async (request) => {
				setNotice(null);
				setError(null);
				const result = await props.client.mutateRuntimeMemory(request);
				setNotice(result.maintenance === void 0 ? t(`runtime.result.${request.action}`, {
					target: t(`runtime.target.${request.target}`),
					count: result.entryCount
				}) : result.maintenance.kind === "local-compaction" ? t("runtime.result.localCompaction", {
					target: t(`runtime.target.${request.target}`),
					count: result.entryCount
				}) : t("runtime.result.maintenance", {
					target: t(`runtime.target.${request.target}`),
					count: result.entryCount,
					spaces: result.maintenance.memoryBodyIds.join(", ") || "—"
				}));
				await load();
				props.onMutate();
			};
			const add = async (event) => {
				event.preventDefault();
				if (content.trim() === "") return;
				setSaving(true);
				try {
					await mutate({
						action: "add",
						target,
						content,
						importance
					});
					setContent("");
					if (appearance.surface === "sidebar") setAdding(false);
				} catch (reason) {
					setError(message(reason));
				} finally {
					setSaving(false);
				}
			};
			const beginEdit = (entry) => {
				setEditing(entryKey(entry));
				setEditContent(entry.content);
				setEditImportance(entry.importance);
				setRemoving(null);
			};
			const replace = async (entry) => {
				if (editContent.trim() === "") return;
				setSaving(true);
				try {
					await mutate({
						action: "replace",
						target: entry.target,
						old_text: entry.content,
						content: editContent,
						importance: editImportance
					});
					setEditing(null);
				} catch (reason) {
					setError(message(reason));
				} finally {
					setSaving(false);
				}
			};
			const remove = async (entry) => {
				setSaving(true);
				try {
					await mutate({
						action: "remove",
						target: entry.target,
						old_text: entry.content
					});
					setRemoving(null);
				} catch (reason) {
					setError(message(reason));
				} finally {
					setSaving(false);
				}
			};
			const runtimeEditActionClass = appearance.surface === "sidebar" ? appearanceClass(MnemonView_module_css_default.ghostButton, appearanceClass(appearance.classes.itemActionButton, appearance.classes.itemEditAction)) : MnemonView_module_css_default.ghostButton;
			const runtimeRemoveActionClass = appearance.surface === "sidebar" ? appearanceClass(MnemonView_module_css_default.dangerButton, appearanceClass(appearance.classes.itemActionButton, appearance.classes.itemDangerAction)) : MnemonView_module_css_default.dangerButton;
			const runtimeEntry = (entry, showTarget = false) => {
				const key = entryKey(entry);
				const isEditing = editing === key;
				const isInlineEditing = appearance.surface === "buildin" && isEditing;
				const isRemoving = removing === key;
				const isInlineRemoving = appearance.surface === "buildin" && isRemoving;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
					className: MnemonView_module_css_default.runtimeEntry,
					"data-importance": entry.importance,
					"data-target": entry.target,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.runtimeEntryMeta,
							children: [showTarget ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.runtimeEntryBadges,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: MnemonView_module_css_default.runtimeEntryTarget,
									children: entry.target === "user" ? "USER.md" : "MEMORY.md"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`runtime.importance.${entry.importance}`) })]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`runtime.importance.${entry.importance}`) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
								dateTime: entry.updated_at,
								children: new Date(entry.updated_at).toLocaleString(locale)
							})]
						}),
						isInlineEditing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							"aria-label": t("runtime.editContent"),
							value: editContent,
							onChange: (event) => setEditContent(event.target.value),
							rows: 4
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: entry.content }),
						isInlineEditing && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": t("runtime.importance"),
							value: editImportance,
							onChange: (event) => setEditImportance(event.target.value),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "critical",
									children: t("runtime.importance.critical")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "normal",
									children: t("runtime.importance.normal")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "low",
									children: t("runtime.importance.low")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("footer", { children: isInlineRemoving ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("runtime.removeConfirm") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MnemonView_module_css_default.dangerSolidButton,
								disabled: saving,
								onClick: () => void remove(entry),
								children: t("runtime.removeAction")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MnemonView_module_css_default.ghostButton,
								onClick: () => setRemoving(null),
								children: t("common.cancel")
							})
						] }) : isInlineEditing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.primaryButton,
							disabled: saving || editContent.trim() === "",
							onClick: () => void replace(entry),
							children: t("runtime.saveEdit")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.ghostButton,
							onClick: () => setEditing(null),
							children: t("common.cancel")
						})] }) : props.writeEnabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: runtimeEditActionClass,
							disabled: saving && isRemoving,
							onClick: () => beginEdit(entry),
							children: t("runtime.editAction")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: runtimeRemoveActionClass,
							disabled: saving && isRemoving,
							onClick: () => {
								setRemoving(key);
								setEditing(null);
							},
							children: t("runtime.removeAction")
						})] }) : null })
					]
				}, key);
			};
			const targetPanel = (value) => {
				const view = snapshot?.targets[value];
				const entries = snapshot?.entries.filter((entry) => entry.target === value) ?? [];
				const percentage = view === void 0 || view.limit === 0 ? 0 : Math.min(100, Math.round(view.used / view.limit * 100));
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: MnemonView_module_css_default.runtimeTarget,
					"aria-label": t(`runtime.target.${value}`),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							className: MnemonView_module_css_default.runtimeTargetHeader,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: value === "user" ? "USER.md" : "MEMORY.md" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t(`runtime.target.${value}`) })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: view?.entryCount ?? 0 })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.capacityLine,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { width: `${percentage}%` } }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: view === void 0 ? "—" : `${humanBytes(view.used)} / ${humanBytes(view.limit)}` })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: MnemonView_module_css_default.runtimeTargetDescription,
							children: t(`runtime.target.${value}.description`)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.runtimeEntries,
							children: [entries.map((entry) => runtimeEntry(entry)), !loading && entries.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.runtimeEmpty,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "○" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("runtime.empty") })]
							})]
						})
					]
				});
			};
			const targetSummary = (value) => {
				const view = snapshot?.targets[value];
				const percentage = view === void 0 || view.limit === 0 ? 0 : Math.min(100, Math.round(view.used / view.limit * 100));
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: MnemonView_module_css_default.runtimeSummaryCard,
					"aria-label": t(`runtime.target.${value}`),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							className: MnemonView_module_css_default.runtimeTargetHeader,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: value === "user" ? "USER.md" : "MEMORY.md" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t(`runtime.target.${value}`) })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: view?.entryCount ?? 0 })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.capacityLine,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { width: `${percentage}%` } }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: view === void 0 ? "—" : `${humanBytes(view.used)} / ${humanBytes(view.limit)}` })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: MnemonView_module_css_default.runtimeTargetDescription,
							children: t(`runtime.target.${value}.description`)
						})
					]
				});
			};
			const normalizedQuery = filterQuery.trim().toLocaleLowerCase();
			const filteredEntries = (snapshot?.entries ?? []).filter((entry) => (filterTarget === "all" || entry.target === filterTarget) && (normalizedQuery === "" || entry.content.toLocaleLowerCase().includes(normalizedQuery)));
			const visibleEntries = filteredEntries.slice(0, visibleLimit);
			const closeComposer = () => {
				setContent("");
				setAdding(false);
			};
			const composer = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				id: runtimeAddFormId,
				className: MnemonView_module_css_default.runtimeComposer,
				onSubmit: (event) => void add(event),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.runtimeComposerHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("runtime.addTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("runtime.addDescription") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("runtime.hotContext") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						"aria-label": t("runtime.content"),
						value: content,
						onChange: (event) => setContent(event.target.value),
						rows: 3,
						placeholder: t("runtime.placeholder")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.runtimeComposerActions,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("runtime.target"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: target,
								onChange: (event) => setTarget(event.target.value),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "memory",
									children: t("runtime.target.memory")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "user",
									children: t("runtime.target.user")
								})]
							})] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("runtime.importance"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: importance,
								onChange: (event) => setImportance(event.target.value),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "critical",
										children: t("runtime.importance.critical")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "normal",
										children: t("runtime.importance.normal")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "low",
										children: t("runtime.importance.low")
									})
								]
							})] }),
							appearance.surface === "buildin" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								className: MnemonView_module_css_default.primaryButton,
								disabled: saving || content.trim() === "",
								children: saving ? t("runtime.saving") : t("runtime.addAction")
							})
						]
					})
				]
			});
			const editingEntry = editing === null ? void 0 : snapshot?.entries.find((entry) => entryKey(entry) === editing);
			const removingEntry = removing === null ? void 0 : snapshot?.entries.find((entry) => entryKey(entry) === removing);
			const editForm = editingEntry === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				id: runtimeEditFormId,
				className: MnemonView_module_css_default.bodyEdit,
				onSubmit: (event) => {
					event.preventDefault();
					replace(editingEntry);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("runtime.editContent"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						"aria-label": t("runtime.editContent"),
						value: editContent,
						onChange: (event) => setEditContent(event.target.value),
						rows: 7
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("runtime.importance"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						"aria-label": t("runtime.importance"),
						value: editImportance,
						onChange: (event) => setEditImportance(event.target.value),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "critical",
								children: t("runtime.importance.critical")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "normal",
								children: t("runtime.importance.normal")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "low",
								children: t("runtime.importance.low")
							})
						]
					})] }),
					appearance.surface === "buildin" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.bodyEditActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.ghostButton,
							disabled: saving,
							onClick: () => setEditing(null),
							children: t("common.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							className: MnemonView_module_css_default.primaryButton,
							disabled: saving || editContent.trim() === "",
							children: t("runtime.saveEdit")
						})]
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageHeader, {
						title: t("runtime.title"),
						description: t("runtime.description"),
						meta: snapshot === null ? t("common.loading") : t("runtime.total", { count: snapshot.entries.length }),
						action: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.secondaryButton,
							disabled: loading,
							onClick: () => void load(),
							children: t("runtime.refresh")
						}), appearance.surface === "sidebar" && props.writeEnabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.primaryButton,
							onClick: () => setAdding(true),
							children: t("runtime.addButton")
						})] })
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.inlineError,
						role: "alert",
						children: error
					}),
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.runtimeNotice,
						role: "status",
						children: notice
					}),
					props.writeEnabled && appearance.surface === "buildin" && composer,
					!props.writeEnabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.runtimeReadOnly,
						children: t("runtime.readOnly")
					}),
					appearance.surface === "buildin" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.runtimeGrid,
						children: [targetPanel("user"), targetPanel("memory")]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.runtimeSummaryGrid,
						children: [targetSummary("user"), targetSummary("memory")]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: MnemonView_module_css_default.runtimeBrowser,
						"aria-label": t("runtime.entriesAria"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.runtimeBrowserToolbar,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.runtimeScopeFilter,
									role: "group",
									"aria-label": t("runtime.scopeAria"),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											"data-active": filterTarget === "all" || void 0,
											onClick: () => setFilterTarget("all"),
											children: [
												t("runtime.scopeAll"),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: snapshot?.entries.length ?? 0 })
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											"data-active": filterTarget === "user" || void 0,
											onClick: () => setFilterTarget("user"),
											children: [
												t("runtime.target.user"),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: snapshot?.targets.user.entryCount ?? 0 })
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											"data-active": filterTarget === "memory" || void 0,
											onClick: () => setFilterTarget("memory"),
											children: [
												t("runtime.target.memory"),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: snapshot?.targets.memory.entryCount ?? 0 })
											]
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.runtimeFilterQuery,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										children: "⌕"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										"aria-label": t("runtime.filterAria"),
										value: filterQuery,
										onChange: (event) => setFilterQuery(event.target.value),
										placeholder: t("runtime.filterPlaceholder")
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.runtimeUnifiedList,
								children: [visibleEntries.map((entry) => runtimeEntry(entry, true)), !loading && filteredEntries.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.runtimeEmpty,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "○" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("runtime.noMatch") })]
								})]
							}),
							!loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProgressiveFooter, {
								visible: visibleEntries.length,
								total: filteredEntries.length,
								pageSize,
								onMore: () => setVisibleLimit((value) => value + pageSize)
							})
						]
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: MnemonView_module_css_default.runtimeFootnote,
						children: t("runtime.footnote")
					}),
					appearance.surface === "sidebar" && adding && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
						title: t("runtime.addTitle"),
						description: t("runtime.addDescription"),
						busy: saving,
						onClose: closeComposer,
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.modalFooterActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-dialog-close": true,
								className: MnemonView_module_css_default.ghostButton,
								disabled: saving,
								onClick: closeComposer,
								children: t("common.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								form: runtimeAddFormId,
								className: MnemonView_module_css_default.primaryButton,
								disabled: saving || content.trim() === "",
								children: saving ? t("runtime.saving") : t("runtime.addAction")
							})]
						}),
						children: composer
					}),
					appearance.surface === "sidebar" && editingEntry !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
						title: t("runtime.editContent"),
						description: t(`runtime.target.${editingEntry.target}`),
						busy: saving,
						onClose: () => setEditing(null),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.modalFooterActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-dialog-close": true,
								className: MnemonView_module_css_default.ghostButton,
								disabled: saving,
								onClick: () => setEditing(null),
								children: t("common.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								form: runtimeEditFormId,
								className: MnemonView_module_css_default.primaryButton,
								disabled: saving || editContent.trim() === "",
								children: t("runtime.saveEdit")
							})]
						}),
						children: editForm
					}),
					appearance.surface === "sidebar" && removingEntry !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
						title: t("runtime.removeTitle"),
						description: t(`runtime.target.${removingEntry.target}`),
						busy: saving,
						onClose: () => setRemoving(null),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.modalFooterActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-dialog-close": true,
								"data-autofocus": true,
								className: MnemonView_module_css_default.ghostButton,
								disabled: saving,
								onClick: () => setRemoving(null),
								children: t("common.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MnemonView_module_css_default.dangerSolidButton,
								disabled: saving,
								onClick: () => void remove(removingEntry),
								children: t("runtime.removeAction")
							})]
						}),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.bodyDeleteConfirm,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("runtime.removeWarning") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.bodyDeleteSummary,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: MnemonView_module_css_default.bodyDeleteContent,
									children: removingEntry.content
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`runtime.importance.${removingEntry.importance}`) })]
							})]
						})
					})
				]
			});
		}
		function PersistenceStrategyDialog(props) {
			const t = useT();
			const strategyFormId = (0, react.useId)();
			const configured = props.config?.persistenceStrategy;
			const [mode, setMode] = (0, react.useState)(configured?.mode ?? "manual");
			const [providerId, setProviderId] = (0, react.useState)(configured?.providerId ?? "mnemon-native");
			const [prompt, setPrompt] = (0, react.useState)(configured?.prompt ?? "");
			const [dataBoundary, setDataBoundary] = (0, react.useState)(configured?.rules?.dataBoundary ?? "allow-remote");
			const [preference, setPreference] = (0, react.useState)(configured?.rules?.preference ?? "balanced");
			const [requiredCapabilities, setRequiredCapabilities] = (0, react.useState)(configured?.rules?.requiredCapabilities ?? []);
			const [automaticProviderIds, setAutomaticProviderIds] = (0, react.useState)(configured?.rules?.allowedProviderIds ?? ["mnemon-native"]);
			const [providerDrafts, setProviderDrafts] = (0, react.useState)(configured?.providerConnections ?? {});
			const [providers, setProviders] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(true);
			const [saving, setSaving] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let current = true;
				props.client.bodyDirectory().then((catalog) => {
					if (!current) return;
					const next = Array.isArray(catalog.providers) && catalog.providers.length > 0 ? catalog.providers : LEGACY_PROVIDER_CATALOG;
					setProviders(next);
					setProviderDrafts((previous) => mergeProviderDefaults(next, previous));
					setProviderId((currentProviderId) => next.some((provider) => provider.id === currentProviderId && (provider.id === "mnemon-native" || provider.serviceConfigured !== false)) ? currentProviderId : "mnemon-native");
				}).catch((reason) => {
					if (current) setError(message(reason));
				}).finally(() => {
					if (current) setLoading(false);
				});
				return () => {
					current = false;
				};
			}, [props.client]);
			const selectedProvider = providers.find((provider) => provider.id === providerId);
			const selectedAutomaticProviders = automaticProviderIds.map((id) => providers.find((provider) => provider.id === id)).filter((provider) => provider !== void 0);
			const selectedProvidersValid = mode === "manual" ? providerDraftComplete(selectedProvider, providerDrafts[providerId]) : automaticProviderIds.length > 0 && selectedAutomaticProviders.length === automaticProviderIds.length && selectedAutomaticProviders.every((provider) => providerDraftComplete(provider, providerDrafts[provider.id]));
			const updateDraft = (id, key, value) => setProviderDrafts((current) => ({
				...current,
				[id]: {
					...current[id] ?? {},
					[key]: value
				}
			}));
			const toggleCapability = (capability) => setRequiredCapabilities((current) => current.includes(capability) ? current.filter((value) => value !== capability) : [...current, capability]);
			const toggleProvider = (id, selected) => setAutomaticProviderIds((current) => selected ? [.../* @__PURE__ */ new Set([...current, id])] : current.filter((value) => value !== id));
			const save = async (event) => {
				event.preventDefault();
				if (loading || saving || !props.writable || !selectedProvidersValid) return;
				const connections = Object.fromEntries((mode === "manual" ? [providerId] : automaticProviderIds).filter((id) => id !== "mnemon-native").map((id) => [id, providerDrafts[id] ?? {}]));
				setSaving(true);
				setError(null);
				try {
					await props.settingsScope.setPath(["persistenceStrategy"], {
						mode,
						providerId,
						prompt,
						rules: {
							allowedProviderIds: automaticProviderIds,
							dataBoundary,
							requiredCapabilities,
							preference
						},
						providerConnections: connections
					});
					props.onClose();
				} catch (reason) {
					setError(message(reason));
				} finally {
					setSaving(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
				title: t("strategy.title"),
				description: t("strategy.description"),
				busy: saving,
				contentReady: !loading,
				wide: true,
				onClose: props.onClose,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonView_module_css_default.modalFooterActions,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-dialog-close": true,
						className: MnemonView_module_css_default.ghostButton,
						disabled: saving,
						onClick: props.onClose,
						children: t("common.cancel")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						form: strategyFormId,
						className: MnemonView_module_css_default.primaryButton,
						disabled: loading || saving || !props.writable || !selectedProvidersValid,
						children: saving ? t("strategy.saving") : t("strategy.save")
					})]
				}),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					id: strategyFormId,
					className: appearanceClass(MnemonView_module_css_default.bodyEdit, MnemonView_module_css_default.strategyForm),
					onSubmit: (event) => void save(event),
					children: [
						loading && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.strategyLoading,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionSpinner, { label: t("strategy.loading") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("strategy.loading") })]
						}),
						error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonView_module_css_default.inlineError,
							role: "alert",
							children: error
						}),
						!loading && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: MnemonView_module_css_default.createSection,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.createSectionHeading,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "01" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("strategy.modeTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("strategy.modeHint") })] })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
								className: MnemonView_module_css_default.placementMode,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", { children: t("overview.placementMode") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										"data-selected": mode === "manual" || void 0,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "radio",
												name: "persistence-mode",
												value: "manual",
												checked: mode === "manual",
												"data-autofocus": mode === "manual" || void 0,
												onChange: () => setMode("manual")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
												className: MnemonView_module_css_default.choiceControl,
												"data-kind": "radio",
												"aria-hidden": "true"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("overview.placementManual") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("strategy.manualHint") })] })
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										"data-selected": mode === "automatic" || void 0,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "radio",
												name: "persistence-mode",
												value: "automatic",
												checked: mode === "automatic",
												"data-autofocus": mode === "automatic" || void 0,
												onChange: () => setMode("automatic")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
												className: MnemonView_module_css_default.choiceControl,
												"data-kind": "radio",
												"aria-hidden": "true"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
												t("overview.placementAutomatic"),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: t("overview.recommended") })
											] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("strategy.automaticHint") })] })
										]
									})
								]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: MnemonView_module_css_default.createSection,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.createSectionHeading,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "02" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(mode === "manual" ? "strategy.manualTitle" : "strategy.automaticTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t(mode === "manual" ? "strategy.manualDescription" : "strategy.automaticDescription") })] })]
							}), mode === "manual" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
								className: MnemonView_module_css_default.providerChoice,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", { children: t("overview.providerLabel") }), providers.map((provider) => {
									const disabled = provider.id !== "mnemon-native" && provider.serviceConfigured === false;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										"data-selected": providerId === provider.id || void 0,
										"data-native": provider.id === "mnemon-native" || void 0,
										"data-disabled": disabled || void 0,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "radio",
												name: "strategy-provider",
												value: provider.id,
												checked: providerId === provider.id,
												disabled,
												onChange: () => setProviderId(provider.id)
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderIcon, {
												providerId: provider.id,
												className: MnemonView_module_css_default.providerChoiceIcon
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [provider.label, provider.id === "mnemon-native" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: t("overview.nativeOfficial") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: disabled ? t("overview.providerServiceRequired") : `${t(`overview.workspaceBinding.${provider.workspaceBinding}`)} · ${providerSummary(t, provider)}` })] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
												className: MnemonView_module_css_default.choiceControl,
												"data-kind": "radio",
												"aria-hidden": "true"
											})
										]
									}, provider.id);
								})]
							}), selectedProvider !== void 0 && selectedProvider.id !== "mnemon-native" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderMemoryFields, {
								provider: selectedProvider,
								connection: providerDrafts[selectedProvider.id] ?? {},
								onChange: (key, value) => updateDraft(selectedProvider.id, key, value)
							})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: MnemonView_module_css_default.placementPolicy,
								"aria-label": t("overview.placementPolicy"),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: MnemonView_module_css_default.placementPolicyHeading,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("overview.placementPolicy") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("overview.placementPolicyHint") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: props.agentAvailable ? t("strategy.taskAgentReady") : t("strategy.taskAgentUnavailable") })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("overview.placementPrompt"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										"aria-label": t("overview.placementPrompt"),
										value: prompt,
										onChange: (event) => setPrompt(event.target.value),
										placeholder: t("overview.placementPromptPlaceholder"),
										rows: 3,
										maxLength: 4e3
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: MnemonView_module_css_default.placementRuleGrid,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("overview.dataBoundary"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											"aria-label": t("overview.dataBoundary"),
											value: dataBoundary,
											onChange: (event) => {
												const value = event.target.value;
												setDataBoundary(value);
												if (value === "local-only") setAutomaticProviderIds((current) => current.filter((id) => providers.find((provider) => provider.id === id)?.kind === "local"));
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "allow-remote",
												children: t("overview.dataBoundaryRemote")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "local-only",
												children: t("overview.dataBoundaryLocal")
											})]
										})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("overview.preference"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											"aria-label": t("overview.preference"),
											value: preference,
											onChange: (event) => setPreference(event.target.value),
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "balanced",
													children: t("overview.preferenceBalanced")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "local-first",
													children: t("overview.preferenceLocal")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "shared-first",
													children: t("overview.preferenceShared")
												})
											]
										})] })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
										className: MnemonView_module_css_default.capabilityRules,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", { children: t("overview.requiredCapabilities") }), [
											"graph",
											"exact-write",
											"forget"
										].map((capability) => {
											const selected = requiredCapabilities.includes(capability);
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												"data-selected": selected || void 0,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														type: "checkbox",
														checked: selected,
														onChange: () => toggleCapability(capability)
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
														className: MnemonView_module_css_default.choiceControl,
														"data-kind": "check",
														"aria-hidden": "true"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`overview.capability.${capability}`) })
												]
											}, capability);
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: MnemonView_module_css_default.placementCandidates,
										children: providers.map((provider) => {
											const disabled = provider.serviceConfigured === false || dataBoundary === "local-only" && provider.kind === "remote";
											const selected = automaticProviderIds.includes(provider.id);
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												"data-selected": selected || void 0,
												"data-disabled": disabled || void 0,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														type: "checkbox",
														checked: selected,
														disabled,
														onChange: (event) => toggleProvider(provider.id, event.target.checked)
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderIcon, {
														providerId: provider.id,
														className: MnemonView_module_css_default.candidateIcon
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: provider.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: provider.serviceConfigured === false ? t("overview.providerServiceRequired") : provider.id === "mnemon-native" ? t("overview.candidateNativeReady") : provider.kind === "local" ? t("overview.candidateLocal") : t("overview.candidateRemote") })] }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
														className: MnemonView_module_css_default.choiceControl,
														"data-kind": "check",
														"aria-hidden": "true"
													})
												]
											}, provider.id);
										})
									}),
									automaticProviderIds.map((id) => {
										const provider = providers.find((candidate) => candidate.id === id);
										return provider === void 0 || provider.id === "mnemon-native" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderMemoryFields, {
											provider,
											connection: providerDrafts[id] ?? {},
											onChange: (key, value) => updateDraft(id, key, value)
										}, id);
									})
								]
							})]
						})] })
					]
				})
			});
		}
		function RememberPage(props) {
			const t = useT();
			const rememberFormId = (0, react.useId)();
			const [content, setContent] = (0, react.useState)(props.seed);
			const [category, setCategory] = (0, react.useState)("general");
			const [importance, setImportance] = (0, react.useState)(3);
			const [tags, setTags] = (0, react.useState)("");
			const [entities, setEntities] = (0, react.useState)("");
			const [memoryBodyId, setMemoryBodyId] = (0, react.useState)("");
			const [supervising, setSupervising] = (0, react.useState)(false);
			const [saving, setSaving] = (0, react.useState)(false);
			const [result, setResult] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (props.seed !== "") setContent(props.seed);
			}, [props.seed]);
			(0, react.useEffect)(() => {
				if (memoryBodyId === "" && props.memoryBodies.length > 0) setMemoryBodyId((props.memoryBodies.find((body) => body.active) ?? props.memoryBodies[0]).id);
			}, [memoryBodyId, props.memoryBodies]);
			const selectedMemoryBody = props.memoryBodies.find((body) => body.id === memoryBodyId);
			const supervise = async (event) => {
				event.preventDefault();
				if (content.trim() === "" || !props.agentAvailable) return;
				setSupervising(true);
				setResult(null);
				try {
					const response = await props.client.supervise(content);
					setResult(`${t(response.action === "skipped" ? "remember.skipped" : "remember.completed")}${response.memoryBodyIds.length === 0 ? "" : ` · ${response.memoryBodyIds.join(", ")}`}${response.summary === "" ? "" : ` · ${response.summary}`}`);
					props.onMutate();
					if (response.action !== "skipped") {
						setContent("");
						props.onComplete?.();
					}
				} catch (reason) {
					setResult(t("remember.dispatchFailed", { error: message(reason) }));
				} finally {
					setSupervising(false);
				}
			};
			const manualSave = async (event) => {
				event.preventDefault();
				if (content.trim() === "") return;
				setSaving(true);
				setResult(null);
				try {
					const response = await props.client.remember({
						content,
						category,
						importance,
						tags: tags.split(",").map((value) => value.trim()).filter(Boolean),
						entities: entities.split(",").map((value) => value.trim()).filter(Boolean),
						source: "user",
						...memoryBodyId === "" ? {} : { memoryBodyId }
					});
					const action = typeof response.action === "string" ? response.action : "saved";
					const summary = typeof response.summary === "string" ? response.summary : "";
					setResult(action === "skipped" ? `${t("remember.skipped")}${summary === "" ? "" : ` · ${summary}`}` : `${t("remember.processed", { action })}${summary === "" ? "" : ` · ${summary}`}`);
					if (action !== "skipped") {
						setContent("");
						setTags("");
						setEntities("");
						props.onMutate();
						props.onComplete?.();
					}
				} catch (reason) {
					setResult(t("remember.saveFailed", { error: message(reason) }));
				} finally {
					setSaving(false);
				}
			};
			const composer = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: MnemonView_module_css_default.supervisedComposer,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					id: rememberFormId,
					className: MnemonView_module_css_default.supervisedForm,
					onSubmit: (event) => void supervise(event),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.supervisedHeading,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("remember.delegateTitle") }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: !props.agentAvailable ? MnemonView_module_css_default.sessionMissing : MnemonView_module_css_default.sessionReady,
								children: !props.agentAvailable ? t("remember.noTaskAgent") : t("remember.taskAgentReady")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: MnemonView_module_css_default.fieldWide,
							children: [t("remember.candidate"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								"aria-label": t("remember.candidateAria"),
								value: content,
								onChange: (event) => setContent(event.target.value),
								maxLength: 8e3,
								rows: 8,
								placeholder: t("remember.placeholder")
							})]
						}),
						!props.agentAvailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: MnemonView_module_css_default.sessionHint,
							children: t("remember.taskAgentHint")
						}),
						props.onClose === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.formActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								className: MnemonView_module_css_default.primaryButton,
								disabled: supervising || content.trim() === "" || !props.agentAvailable,
								children: supervising ? t("remember.processing") : t("remember.action")
							}), result !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								role: "status",
								children: result
							})]
						}) : result !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: MnemonView_module_css_default.modalInlineStatus,
							role: "status",
							children: result
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
					className: MnemonView_module_css_default.advancedWrite,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("remember.advanced") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("remember.advancedHint") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("remember.expand") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: MnemonView_module_css_default.manualForm,
						onSubmit: (event) => void manualSave(event),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.formGrid,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: MnemonView_module_css_default.fieldWide,
									children: [
										t("remember.target"),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
											"aria-label": t("remember.target"),
											value: memoryBodyId,
											onChange: (event) => setMemoryBodyId(event.target.value),
											children: props.memoryBodies.map((body) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
												value: body.id,
												children: [
													body.name,
													" · ",
													body.provider.label,
													body.active ? ` · ${t("common.active")}` : ""
												]
											}, body.id))
										}),
										selectedMemoryBody?.provider.capabilities.writeMode === "async-extracting" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
											className: MnemonView_module_css_default.providerWriteHint,
											children: t("remember.asyncProviderHint")
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("common.category"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									value: category,
									onChange: (event) => setCategory(event.target.value),
									children: CATEGORIES.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value,
										children: categoryLabel(t, value)
									}, value))
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("common.importanceLabel"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									value: importance,
									onChange: (event) => setImportance(Number(event.target.value)),
									children: [
										1,
										2,
										3,
										4,
										5
									].map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value,
										children: [value, " / 5"]
									}, value))
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: MnemonView_module_css_default.fieldWide,
									children: [t("remember.entities"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										value: entities,
										onChange: (event) => setEntities(event.target.value),
										placeholder: "SQLite, DSH"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: MnemonView_module_css_default.fieldWide,
									children: [t("remember.tags"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										value: tags,
										onChange: (event) => setTags(event.target.value),
										placeholder: "architecture, local-first"
									})]
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.manualActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("remember.advancedText") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								className: MnemonView_module_css_default.secondaryButton,
								disabled: saving || content.trim() === "" || memoryBodyId === "",
								children: saving ? t("remember.saving") : t("remember.advancedAction")
							})]
						})]
					})]
				})]
			});
			if (props.onClose !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
				title: t("remember.title"),
				description: t("remember.description"),
				busy: supervising || saving,
				onClose: props.onClose,
				footer: props.writeEnabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonView_module_css_default.modalFooterActions,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-dialog-close": true,
						className: MnemonView_module_css_default.ghostButton,
						disabled: supervising || saving,
						onClick: props.onClose,
						children: t("common.cancel")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						form: rememberFormId,
						className: MnemonView_module_css_default.primaryButton,
						disabled: supervising || content.trim() === "" || !props.agentAvailable,
						children: supervising ? t("remember.processing") : t("remember.action")
					})]
				}) : void 0,
				children: props.writeEnabled ? composer : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
					glyph: "⊘",
					title: t("remember.readOnlyTitle"),
					children: t("remember.readOnlyText")
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.page,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageHeader, {
					title: t("remember.title"),
					description: t("remember.description"),
					meta: props.writeEnabled ? t("remember.worker") : t("common.readOnly")
				}), !props.writeEnabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
					glyph: "⊘",
					title: t("remember.readOnlyTitle"),
					children: t("remember.readOnlyText")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonView_module_css_default.writebackLayout,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
						className: MnemonView_module_css_default.writeGuide,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("remember.flowTitle") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ol", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("remember.routeTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("remember.routeText") })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("remember.dedupeTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("remember.dedupeText") })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("remember.writeTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("remember.writeText") })] })
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("remember.flowText") })
						]
					}), composer]
				})]
			});
		}
		function ListPage(props) {
			const t = useT();
			const pageSize = useMnemonViewAppearance().surface === "sidebar" ? 12 : 48;
			const [query, setQuery] = (0, react.useState)("");
			const [category, setCategory] = (0, react.useState)("");
			const [view, setView] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(null);
			const [visibleLimit, setVisibleLimit] = (0, react.useState)(pageSize);
			const [selectedBodyId, setSelectedBodyId] = (0, react.useState)();
			const load = (0, react.useCallback)(async () => {
				setLoading(true);
				setError(null);
				try {
					setView(await props.client.list({
						...query.trim() === "" ? {} : { query },
						...category === "" ? {} : { category },
						limit: 1e3
					}));
				} catch (reason) {
					setError(message(reason));
				} finally {
					setLoading(false);
				}
			}, [
				category,
				props.client,
				query
			]);
			(0, react.useEffect)(() => {
				setVisibleLimit(pageSize);
				load();
			}, [pageSize, props.revision]);
			const submit = (event) => {
				event.preventDefault();
				setVisibleLimit(pageSize);
				load();
			};
			const forget = async (insight) => {
				await props.onForget(insight);
				setView((current) => current === null ? current : {
					...current,
					total: Math.max(0, current.total - 1),
					items: current.items.filter((item) => insightKey(item) !== insightKey(insight))
				});
			};
			const filteredItems = view?.items.filter((item) => selectedBodyId === void 0 || item.memoryBodyId === selectedBodyId) ?? [];
			const visibleItems = filteredItems.slice(0, visibleLimit);
			const sources = view?.sources ?? [];
			const waitingForQuery = query.trim() === "" && sources.some((source) => source.status === "query-required" && (selectedBodyId === void 0 || source.memoryBodyId === selectedBodyId));
			const selectBody = (memoryBodyId) => {
				setSelectedBodyId(memoryBodyId);
				setVisibleLimit(pageSize);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageHeader, {
						title: t("content.title"),
						description: t("content.description"),
						meta: t("content.count", { count: view === null ? "—" : selectedBodyId === void 0 ? view.total : filteredItems.length })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: MnemonView_module_css_default.listToolbar,
						onSubmit: submit,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								"aria-label": t("content.filterAria"),
								value: query,
								onChange: (event) => setQuery(event.target.value),
								placeholder: t("content.filterPlaceholder")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								"aria-label": t("content.categoryAria"),
								value: category,
								onChange: (event) => setCategory(event.target.value),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("common.allCategories")
								}), CATEGORIES.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value,
									children: categoryLabel(t, value)
								}, value))]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								className: MnemonView_module_css_default.primaryButton,
								disabled: loading,
								children: loading ? t("common.loading") : t("content.apply")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.listNotice,
						children: t("content.notice")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReadSourcePanel, {
						title: t("content.sourcesTitle"),
						sources,
						selectedBodyId,
						onSelect: selectBody
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.inlineError,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.asyncResults,
						children: [
							loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionSpinner, { label: t("common.loading") }),
							!loading && filteredItems.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
								glyph: "≡",
								title: t(waitingForQuery ? "content.queryRequiredTitle" : "content.emptyTitle"),
								children: t(waitingForQuery ? "content.queryRequiredText" : "content.emptyText")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: MnemonView_module_css_default.memoryList,
								children: visibleItems.map((insight) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InsightCard, {
									insight,
									writeEnabled: props.writeEnabled,
									onForget: forget,
									onClone: props.onClone,
									onRelated: () => props.onExplore(insight.content)
								}, insightKey(insight)))
							}),
							view !== null && !loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProgressiveFooter, {
								visible: visibleItems.length,
								total: filteredItems.length,
								pageSize,
								onMore: () => setVisibleLimit((value) => value + pageSize)
							})
						]
					})
				]
			});
		}
		function DocumentsPage(props) {
			const t = useT();
			const locale = useLocale();
			const appearance = useMnemonViewAppearance();
			const documentCreateFormId = (0, react.useId)();
			const documentEditFormId = (0, react.useId)();
			const pageSize = appearance.surface === "sidebar" ? 8 : Number.MAX_SAFE_INTEGER;
			const readerRef = (0, react.useRef)(null);
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [items, setItems] = (0, react.useState)([]);
			const [visibleLimit, setVisibleLimit] = (0, react.useState)(pageSize);
			const [selectedId, setSelectedId] = (0, react.useState)(null);
			const [selected, setSelected] = (0, react.useState)(null);
			const [status, setStatus] = (0, react.useState)("active");
			const [query, setQuery] = (0, react.useState)("");
			const [loading, setLoading] = (0, react.useState)(true);
			const [saving, setSaving] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [composing, setComposing] = (0, react.useState)(false);
			const [editing, setEditing] = (0, react.useState)(false);
			const [confirmArchive, setConfirmArchive] = (0, react.useState)(false);
			const [title, setTitle] = (0, react.useState)("");
			const [description, setDescription] = (0, react.useState)("");
			const [content, setContent] = (0, react.useState)("");
			const [sources, setSources] = (0, react.useState)("");
			const displayRequests = useRequestVersion();
			const display = (0, react.useCallback)(async (nextQuery, nextStatus) => {
				const request = displayRequests.begin();
				setLoading(true);
				setError(null);
				setVisibleLimit(pageSize);
				try {
					const current = await props.client.documents();
					const filtered = (nextQuery.trim() === "" ? current.documents : (await props.client.searchDocuments(nextQuery, nextStatus === "archived")).results).filter((record) => record.status === nextStatus);
					if (!displayRequests.isCurrent(request)) return;
					setSnapshot(current);
					setItems(filtered);
					setSelectedId((previous) => previous !== null && filtered.some((record) => record.id === previous) ? previous : filtered[0]?.id ?? null);
				} catch (reason) {
					if (!displayRequests.isCurrent(request)) return;
					setError(message(reason));
					setSnapshot(null);
					setItems([]);
					setSelectedId(null);
				} finally {
					if (displayRequests.isCurrent(request)) setLoading(false);
				}
			}, [
				displayRequests,
				pageSize,
				props.client
			]);
			(0, react.useEffect)(() => {
				display(query, status);
			}, [
				display,
				props.revision,
				status
			]);
			(0, react.useEffect)(() => {
				setSelected(null);
				if (selectedId === null) return;
				let active = true;
				props.client.document(selectedId).then((value) => {
					if (active) setSelected(value);
				}).catch((reason) => {
					if (active) setError(message(reason));
				});
				return () => {
					active = false;
				};
			}, [
				props.client,
				selectedId,
				props.revision
			]);
			(0, react.useLayoutEffect)(() => {
				if (appearance.surface === "sidebar" && readerRef.current !== null) readerRef.current.scrollTop = 0;
			}, [appearance.surface, selectedId]);
			(0, react.useEffect)(() => {
				if (appearance.surface !== "sidebar" || selectedId === null) return;
				const index = items.findIndex((item) => item.id === selectedId);
				if (index >= visibleLimit) setVisibleLimit(Math.ceil((index + 1) / pageSize) * pageSize);
			}, [
				appearance.surface,
				items,
				pageSize,
				selectedId,
				visibleLimit
			]);
			const resetComposer = () => {
				setTitle("");
				setDescription("");
				setContent("");
				setSources("");
				setComposing(false);
			};
			const startComposer = () => {
				setTitle("");
				setDescription("");
				setContent("");
				setSources("");
				setEditing(false);
				setComposing(true);
			};
			const sourcePaths = (value) => value.split(/\r?\n|,/gu).map((path) => path.trim()).filter(Boolean);
			const create = async (event) => {
				event.preventDefault();
				setSaving(true);
				setError(null);
				setNotice(null);
				try {
					const result = await props.client.mutateDocument({
						action: "create",
						title,
						description,
						content,
						sourcePaths: sourcePaths(sources)
					});
					setNotice(result.maintenance === void 0 ? t("documents.created") : t("documents.createdAfterArchive", { count: result.maintenance.archivedDocumentIds.length }));
					setStatus("active");
					setQuery("");
					resetComposer();
					props.onMutate();
					await display("", "active");
					setSelectedId(result.document.id);
				} catch (reason) {
					setError(message(reason));
				} finally {
					setSaving(false);
				}
			};
			const beginEdit = () => {
				if (selected === null) return;
				setTitle(selected.title);
				setDescription(selected.description);
				setContent(selected.content);
				setSources(selected.sourcePaths.join("\n"));
				setEditing(true);
				setComposing(false);
				setConfirmArchive(false);
			};
			const update = async (event) => {
				event.preventDefault();
				if (selected === null) return;
				setSaving(true);
				setError(null);
				setNotice(null);
				try {
					const result = await props.client.mutateDocument({
						action: "update",
						id: selected.id,
						title,
						description,
						content,
						sourcePaths: sourcePaths(sources)
					});
					setNotice(result.maintenance === void 0 ? t("documents.updated") : t("documents.updatedAfterArchive", { count: result.maintenance.archivedDocumentIds.length }));
					setEditing(false);
					props.onMutate();
					await display(query, status);
					setSelectedId(result.document.id);
				} catch (reason) {
					setError(message(reason));
				} finally {
					setSaving(false);
				}
			};
			const archive = async () => {
				if (selected === null) return;
				setSaving(true);
				setError(null);
				setNotice(null);
				try {
					const result = await props.client.archiveDocument(selected.id);
					setNotice(t("documents.archived", { spaces: result.maintenance?.memoryBodyIds.join(", ") || "—" }));
					setConfirmArchive(false);
					setStatus("archived");
					setQuery("");
					props.onMutate();
					await display("", "archived");
					setSelectedId(result.document.id);
				} catch (reason) {
					setError(message(reason));
				} finally {
					setSaving(false);
				}
			};
			const usage = snapshot === null ? 0 : Math.min(100, snapshot.activeBytes / snapshot.limitBytes * 100);
			const activeCount = snapshot?.activeCount ?? 0;
			const archivedCount = snapshot?.archivedCount ?? 0;
			const composer = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				id: documentCreateFormId,
				className: MnemonView_module_css_default.documentEditor,
				onSubmit: (event) => void create(event),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("documents.newTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("documents.editorHint") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("documents.managedCopy") })] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.documentEditorMeta,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("documents.name"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: title,
							onChange: (event) => setTitle(event.target.value),
							required: true
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("documents.routing"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: description,
							onChange: (event) => setDescription(event.target.value)
						})] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("documents.sources"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: sources,
						onChange: (event) => setSources(event.target.value),
						placeholder: t("documents.sourcesPlaceholder")
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("documents.markdown"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						value: content,
						onChange: (event) => setContent(event.target.value),
						rows: 10,
						required: true
					})] }),
					appearance.surface === "buildin" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: MnemonView_module_css_default.ghostButton,
						disabled: saving,
						onClick: resetComposer,
						children: t("common.cancel")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						className: MnemonView_module_css_default.primaryButton,
						disabled: saving || title.trim() === "" || content.trim() === "",
						children: saving ? t("documents.saving") : t("documents.create")
					})] })
				]
			});
			const editComposer = selected === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				id: documentEditFormId,
				className: MnemonView_module_css_default.documentEditor,
				onSubmit: (event) => void update(event),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("documents.editTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("documents.editorHint") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: selected.id })] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.documentEditorMeta,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("documents.name"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: title,
							onChange: (event) => setTitle(event.target.value),
							required: true
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("documents.routing"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: description,
							onChange: (event) => setDescription(event.target.value)
						})] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("documents.sources"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: sources,
						onChange: (event) => setSources(event.target.value)
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("documents.markdown"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						value: content,
						onChange: (event) => setContent(event.target.value),
						rows: 18,
						required: true
					})] }),
					appearance.surface === "buildin" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: MnemonView_module_css_default.ghostButton,
						disabled: saving,
						onClick: () => setEditing(false),
						children: t("common.cancel")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						className: MnemonView_module_css_default.primaryButton,
						disabled: saving,
						children: saving ? t("documents.saving") : t("documents.save")
					})] })
				]
			});
			const documentEditActionClass = appearance.surface === "sidebar" ? appearanceClass(MnemonView_module_css_default.ghostButton, appearanceClass(appearance.classes.itemActionButton, appearance.classes.itemEditAction)) : MnemonView_module_css_default.secondaryButton;
			const documentArchiveActionClass = appearance.surface === "sidebar" ? appearanceClass(MnemonView_module_css_default.dangerButton, appearanceClass(appearance.classes.itemActionButton, appearance.classes.itemDangerAction)) : MnemonView_module_css_default.dangerButton;
			const visibleItems = items.slice(0, visibleLimit);
			const selectDocument = (documentId) => {
				if (selectedId === documentId) return;
				setSelected(null);
				setSelectedId(documentId);
				setEditing(false);
				setConfirmArchive(false);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageHeader, {
						title: t("documents.title"),
						description: t("documents.description"),
						meta: snapshot === null ? t("common.loading") : t("documents.capacity", {
							used: humanBytes(snapshot.activeBytes),
							limit: humanBytes(snapshot.limitBytes)
						}),
						action: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.secondaryButton,
							disabled: loading,
							onClick: () => void display(query, status),
							children: t("documents.refresh")
						}), appearance.surface === "sidebar" && props.writeEnabled && props.sessionId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.primaryButton,
							onClick: startComposer,
							children: t("documents.new")
						})] })
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.inlineError,
						role: "alert",
						children: error
					}),
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.runtimeNotice,
						role: "status",
						children: notice
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: MnemonView_module_css_default.documentSummary,
						"aria-label": t("documents.summary"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("documents.active") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: activeCount }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("documents.activeHint") })
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("documents.archivedCount") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: archivedCount }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("documents.archivedHint") })
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: MnemonView_module_css_default.documentCapacity,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("documents.activeCapacity") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: snapshot === null ? "—" : `${usage.toFixed(1)}%` }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { width: `${usage}%` } }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("documents.capacityHint") })
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: MnemonView_module_css_default.documentToolbar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
								onSubmit: (event) => {
									event.preventDefault();
									display(query, status);
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										children: "⌕"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										"aria-label": t("documents.searchAria"),
										value: query,
										onChange: (event) => setQuery(event.target.value),
										placeholder: t("documents.searchPlaceholder")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "submit",
										className: MnemonView_module_css_default.secondaryButton,
										children: t("documents.search")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								role: "group",
								"aria-label": t("documents.scope"),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									"data-active": status === "active" || void 0,
									onClick: () => setStatus("active"),
									children: [
										t("documents.active"),
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: activeCount })
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									"data-active": status === "archived" || void 0,
									onClick: () => setStatus("archived"),
									children: [
										t("documents.archivedCount"),
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: archivedCount })
									]
								})]
							}),
							appearance.surface === "buildin" && props.writeEnabled && props.sessionId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MnemonView_module_css_default.primaryButton,
								onClick: () => {
									if (composing) resetComposer();
									else startComposer();
								},
								children: composing ? t("common.cancel") : t("documents.new")
							})
						]
					}),
					composing && appearance.surface === "buildin" && composer,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.documentWorkspace,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
							className: MnemonView_module_css_default.documentList,
							"aria-label": t("documents.list"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: status === "active" ? t("documents.activeList") : t("documents.archiveList") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: items.length })] }),
								visibleItems.map((document) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									"aria-pressed": selectedId === document.id,
									"data-selected": selectedId === document.id || void 0,
									onClick: () => selectDocument(document.id),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: document.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
											dateTime: document.updatedAt,
											children: new Date(document.updatedAt).toLocaleDateString(locale)
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: document.description || document.excerpt || t("documents.noDescription") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: humanBytes(document.sizeBytes) }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: document.id.slice(0, 8) }),
											document.healthy === false && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: t("documents.missing") })
										] })
									]
								}, document.id)),
								appearance.surface === "sidebar" && !loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProgressiveFooter, {
									compact: true,
									visible: visibleItems.length,
									total: items.length,
									pageSize,
									onMore: () => setVisibleLimit((value) => value + pageSize)
								}),
								!loading && items.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.documentListEmpty,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "▤" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: status === "active" ? t("documents.emptyActive") : t("documents.emptyArchived") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: status === "active" ? t("documents.emptyActiveText") : t("documents.emptyArchivedText") })
									]
								}),
								loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: MnemonView_module_css_default.loading,
									children: t("common.loading")
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
							ref: readerRef,
							className: MnemonView_module_css_default.documentReader,
							"aria-label": t("documents.reader"),
							"data-scroll-region": appearance.surface === "sidebar" ? "" : void 0,
							children: selected === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyState, {
								glyph: "▤",
								title: t("documents.selectTitle"),
								children: t("documents.selectText")
							}) : editing && appearance.surface === "buildin" ? editComposer : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: MnemonView_module_css_default.documentDetail,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: selected.status === "active" ? t("documents.active") : t("documents.coldArchive") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: selected.title }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: selected.description || t("documents.noDescription") })
									] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: props.writeEnabled && selected.status === "active" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: documentEditActionClass,
										onClick: beginEdit,
										children: t("documents.edit")
									}) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("documents.path") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: selected.relativePath }) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("documents.revision") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selected.revision })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("documents.hash") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: selected.contentHash.slice(0, 16) }) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("documents.size") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: humanBytes(selected.sizeBytes) })] })
									] }),
									selected.sourcePaths.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: MnemonView_module_css_default.documentSources,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("documents.sources") }), selected.sourcePaths.map((path) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: path }, path))]
									}),
									selected.status === "archived" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: MnemonView_module_css_default.documentArchiveReceipt,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("documents.archiveReceipt") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: selected.archiveSummary }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: selected.memoryBodyIds.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: id }, id)) })
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DocumentMarkdown, { content: selected.content }),
									props.writeEnabled && selected.status === "active" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("footer", {
										className: MnemonView_module_css_default.documentDanger,
										children: appearance.surface === "buildin" && confirmArchive ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("documents.archiveConfirm") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: MnemonView_module_css_default.dangerSolidButton,
												disabled: saving,
												onClick: () => void archive(),
												children: saving ? t("documents.archiving") : t("documents.archiveNow")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: MnemonView_module_css_default.ghostButton,
												onClick: () => setConfirmArchive(false),
												children: t("common.cancel")
											})
										] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("documents.archiveTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("documents.archiveDescription") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: documentArchiveActionClass,
											onClick: () => setConfirmArchive(true),
											children: t("documents.archive")
										})] })
									})
								]
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: MnemonView_module_css_default.runtimeFootnote,
						children: t("documents.footnote")
					}),
					composing && appearance.surface === "sidebar" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
						title: t("documents.newTitle"),
						description: t("documents.editorHint"),
						busy: saving,
						onClose: resetComposer,
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.modalFooterActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-dialog-close": true,
								className: MnemonView_module_css_default.ghostButton,
								disabled: saving,
								onClick: resetComposer,
								children: t("common.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								form: documentCreateFormId,
								className: MnemonView_module_css_default.primaryButton,
								disabled: saving || title.trim() === "" || content.trim() === "",
								children: saving ? t("documents.saving") : t("documents.create")
							})]
						}),
						children: composer
					}),
					editing && appearance.surface === "sidebar" && selected !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
						title: t("documents.editTitle"),
						description: selected.title,
						busy: saving,
						onClose: () => setEditing(false),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.modalFooterActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-dialog-close": true,
								className: MnemonView_module_css_default.ghostButton,
								disabled: saving,
								onClick: () => setEditing(false),
								children: t("common.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								form: documentEditFormId,
								className: MnemonView_module_css_default.primaryButton,
								disabled: saving,
								children: saving ? t("documents.saving") : t("documents.save")
							})]
						}),
						children: editComposer
					}),
					confirmArchive && appearance.surface === "sidebar" && selected !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
						title: t("documents.archiveConfirm"),
						description: selected.title,
						busy: saving,
						onClose: () => setConfirmArchive(false),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.modalFooterActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-dialog-close": true,
								"data-autofocus": true,
								className: MnemonView_module_css_default.ghostButton,
								disabled: saving,
								onClick: () => setConfirmArchive(false),
								children: t("common.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MnemonView_module_css_default.dangerSolidButton,
								disabled: saving,
								onClick: () => void archive(),
								children: saving ? t("documents.archiving") : t("documents.archiveNow")
							})]
						}),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.bodyDeleteConfirm,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("documents.archiveDescription") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.bodyDeleteSummary,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: selected.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									selected.relativePath,
									" · ",
									humanBytes(selected.sizeBytes)
								] })]
							})]
						})
					})
				]
			});
		}
		function versionModeLabel(t, mode) {
			if (mode === "homebrew") return t("versions.modeHomebrew");
			if (mode === "go") return t("versions.modeGo");
			if (mode === "npm") return t("versions.modeNpm");
			if (mode === "link") return t("versions.modeLink");
			if (mode === "missing") return t("versions.modeMissing");
			return t("versions.modeManual");
		}
		function versionHint(t, component) {
			if (component.checkError !== void 0) return t("versions.latestUnavailable");
			if (component.updateHint === "brew") return t("versions.hintHomebrew");
			if (component.updateHint === "brew-missing") return t("versions.hintBrewMissing");
			if (component.updateHint === "go") return t("versions.hintGo");
			if (component.updateHint === "pnpm") return t("versions.hintPnpm");
			if (component.updateHint === "pnpm-missing") return t("versions.hintPnpmMissing");
			if (component.updateHint === "link") return t("versions.hintLink");
			if (component.updateHint === "install") return t("versions.hintInstall");
			return t("versions.hintManual");
		}
		function dshInstallLabel(t, component) {
			if (component.installMode === "npm") return t("versions.profileLocation", { name: component.installProfile ?? "—" });
			if (component.installMode === "link") return component.installProfile === void 0 ? t("versions.sourceLocation") : t("versions.linkSourceLocation", { name: component.installProfile });
			return t("versions.packageLocation");
		}
		function VersionDialog(props) {
			const t = useT();
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [checking, setChecking] = (0, react.useState)(true);
			const [updating, setUpdating] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [result, setResult] = (0, react.useState)(null);
			const checkRequestRef = (0, react.useRef)(0);
			const checkTimeoutRef = (0, react.useRef)(null);
			const check = (0, react.useCallback)(async () => {
				const requestVersion = ++checkRequestRef.current;
				setChecking(true);
				setError(null);
				let timeout;
				try {
					const deadline = new Promise((_resolve, reject) => {
						timeout = setTimeout(() => reject(new Error(t("versions.timeout"))), 15e3);
						checkTimeoutRef.current = timeout;
					});
					const next = await Promise.race([props.client.versions(), deadline]);
					if (checkRequestRef.current === requestVersion) setSnapshot(next);
				} catch (reason) {
					if (checkRequestRef.current === requestVersion) setError(message(reason));
				} finally {
					if (timeout !== void 0) clearTimeout(timeout);
					if (checkTimeoutRef.current === timeout) checkTimeoutRef.current = null;
					if (checkRequestRef.current === requestVersion) setChecking(false);
				}
			}, [props.client, t]);
			(0, react.useEffect)(() => {
				check();
				return () => {
					checkRequestRef.current += 1;
					if (checkTimeoutRef.current !== null) clearTimeout(checkTimeoutRef.current);
					checkTimeoutRef.current = null;
				};
			}, [check]);
			const update = async (component) => {
				setUpdating(component.id);
				setError(null);
				setResult(null);
				try {
					const next = await props.client.updateVersion(component.id);
					setResult(next);
					await check();
					props.onRefreshStatus();
				} catch (reason) {
					setError(message(reason));
				} finally {
					setUpdating(null);
				}
			};
			const updatingBusy = updating !== null;
			const controlsBusy = checking || updatingBusy;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarModal, {
				title: t("versions.title"),
				description: t("versions.description"),
				busy: updatingBusy,
				contentReady: !checking,
				onClose: props.onClose,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: MnemonView_module_css_default.modalFooterMeta,
					children: snapshot === null ? "" : t("versions.checkedAt", { time: new Date(snapshot.checkedAt).toLocaleTimeString() })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonView_module_css_default.modalFooterActions,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-dialog-close": true,
						className: MnemonView_module_css_default.ghostButton,
						disabled: updatingBusy,
						onClick: props.onClose,
						children: t("common.cancel")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-autofocus": true,
						className: MnemonView_module_css_default.secondaryButton,
						disabled: controlsBusy,
						onClick: () => void check(),
						children: checking ? t("versions.checkingShort") : t("versions.recheck")
					})]
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonView_module_css_default.versionDialogBody,
					children: [
						checking && snapshot === null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.versionChecking,
							role: "status",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), t("versions.checking")]
						}),
						error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.versionError,
							role: "alert",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("versions.failed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: error })]
						}),
						result !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.versionResult,
							role: "status",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: result.updated ? t("versions.updated", { name: result.component === "mnemon" ? "Mnemon CLI" : "dsh-mnemon" }) : t("versions.alreadyCurrent") }), result.restartRequired && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("versions.restartRequired") })]
						}),
						snapshot !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonView_module_css_default.versionList,
							children: snapshot.components.map((component) => {
								const canUpdate = props.writeEnabled && component.outdated && component.updateSupported && component.checkError === void 0;
								const state = component.checkError !== void 0 ? t("versions.unknown") : component.outdated ? t("versions.available") : t("versions.current");
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
									"data-outdated": component.outdated || void 0,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: component.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: versionModeLabel(t, component.installMode) })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: state })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: MnemonView_module_css_default.versionNumbers,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("versions.installed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: component.current ?? "—" })] }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "→" }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("versions.latest") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: component.latest ?? "—" })] })
											]
										}),
										component.id === "mnemon" && component.executablePath !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", {
											className: MnemonView_module_css_default.versionLocation,
											title: component.executablePath,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("versions.executable") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: component.executablePath })]
										}),
										component.id === "dsh-mnemon" && component.installPath !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", {
											className: MnemonView_module_css_default.versionLocation,
											title: component.installPath,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: dshInstallLabel(t, component) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: component.installPath })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: versionHint(t, component) }), canUpdate && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: MnemonView_module_css_default.primaryButton,
											disabled: controlsBusy,
											onClick: () => void update(component),
											children: updating === component.id ? t("versions.updating") : t("versions.update")
										})] })
									]
								}, component.id);
							})
						})
					]
				})
			});
		}
		function StatusPage(props) {
			const t = useT();
			const [versionsOpen, setVersionsOpen] = (0, react.useState)(false);
			const status = props.status;
			const documents = status?.documents;
			const catalogKnown = status?.memoryBodies !== void 0;
			const memoryBodies = (0, react.useMemo)(() => (status?.memoryBodies ?? []).map(normalizeMemoryBody), [status]);
			const activeBodies = memoryBodies.filter((body) => body.active).length;
			const storage = status?.storage;
			const selectedScopeKind = storage?.activeKind ?? "global";
			const selectedScope = storage?.scopes.find((scope) => scope.kind === selectedScopeKind);
			const runtimeArea = selectedScope?.areas.find((area) => area.kind === "runtime");
			const runtimeUserEntries = runtimeArea === void 0 ? 0 : Number(runtimeArea.details.userEntries ?? 0);
			const runtimeMemoryEntries = runtimeArea === void 0 ? 0 : Number(runtimeArea.details.memoryEntries ?? 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonView_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageHeader, {
						title: t("status.title"),
						description: t("status.description"),
						meta: status === null && props.loading ? t("common.loading") : status === null ? t("status.checkRequired") : t("status.nominal"),
						...props.loading ? { loadingLabel: t("status.rechecking") } : {},
						action: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: MnemonView_module_css_default.statusHeaderActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MnemonView_module_css_default.ghostButton,
								disabled: props.loading,
								onClick: props.onRefresh,
								children: props.loading ? t("status.rechecking") : t("status.recheck")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MnemonView_module_css_default.secondaryButton,
								onClick: () => setVersionsOpen(true),
								children: t("versions.checkAction")
							})]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: MnemonView_module_css_default.healthStrip,
						"aria-label": t("status.aria"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `${MnemonView_module_css_default.healthIndicator} ${status === null ? MnemonView_module_css_default.healthMuted : MnemonView_module_css_default.healthGood}` }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("status.engine") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: status?.dshMnemonVersion === void 0 ? "dsh-mnemon" : `dsh-mnemon ${status.dshMnemonVersion}` }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: status === null ? t("status.pluginChecking") : t("status.pluginReady") })
							] })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `${MnemonView_module_css_default.healthIndicator} ${runtimeArea === void 0 ? MnemonView_module_css_default.healthMuted : runtimeArea.status === "invalid" ? MnemonView_module_css_default.healthBad : MnemonView_module_css_default.healthGood}` }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("status.runtime") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: runtimeArea === void 0 ? t("status.runtimeWaiting") : t("status.runtimeRatio", {
									user: runtimeUserEntries,
									memory: runtimeMemoryEntries
								}) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: runtimeArea === void 0 ? t("status.runtimeWaitingDetail") : t("status.runtimeBytes", { bytes: humanBytes(runtimeArea.bytes) }) })
							] })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `${MnemonView_module_css_default.healthIndicator} ${activeBodies > 0 ? MnemonView_module_css_default.healthGood : MnemonView_module_css_default.healthMuted}` }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("status.spaces") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: catalogKnown ? t("status.activeRatio", {
									active: activeBodies,
									total: memoryBodies.length
								}) : t("status.directoryUnsynced") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("status.activeMemories", { count: status?.stats?.totalInsights ?? 0 }) })
							] })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `${MnemonView_module_css_default.healthIndicator} ${documents === void 0 ? MnemonView_module_css_default.healthMuted : MnemonView_module_css_default.healthGood}` }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("status.documents") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: documents === void 0 ? t("status.documentsWaiting") : t("status.documentRatio", {
									active: documents.activeCount,
									archived: documents.archivedCount
								}) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: documents === void 0 ? t("status.documentsSession") : t("status.documentUsage", {
									used: humanBytes(documents.activeBytes),
									limit: humanBytes(documents.limitBytes)
								}) })
							] })] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.asyncStatusBlock,
						children: status !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NativeProviderHealth, { status })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.asyncStatusBlock,
						children: status?.providerServices !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderHealth, { services: status.providerServices.filter((service) => service.providerId !== "mnemon-native") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.asyncStatusBlock,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StorageDomains, {
							catalog: storage,
							selected: selectedScope,
							selectedKind: selectedScopeKind
						})
					}),
					versionsOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VersionDialog, {
						client: props.client,
						writeEnabled: props.writeEnabled,
						onClose: () => setVersionsOpen(false),
						onRefreshStatus: props.onRefresh
					})
				]
			});
		}
		function NativeProviderHealth({ status }) {
			const t = useT();
			const bodies = (status.memoryBodies ?? []).filter((body) => body.provider?.id === void 0 || body.provider.id === "mnemon-native");
			const active = bodies.filter((body) => body.active);
			const pending = active.filter((body) => body.statusLoading === true);
			const failed = active.filter((body) => body.statusLoading !== true && !body.healthy);
			const state = !status.commandFound || failed.length > 0 ? "unhealthy" : active.length === 0 || pending.length > 0 ? "idle" : "healthy";
			const error = !status.commandFound ? t("status.nativeCliMissing") : failed.map((body) => `${body.name}: ${body.error ?? t("status.engineUnavailable")}`).join("; ");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: MnemonView_module_css_default.nativeProviderHealth,
				"aria-label": t("status.nativeAria"),
				"data-status": state,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderIcon, {
						providerId: "mnemon-native",
						className: MnemonView_module_css_default.providerHealthMark
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.nativeProviderCopy,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("status.nativeLabel") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "mnemon" }),
							error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								title: error,
								children: error
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.nativeProviderMeta,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { "aria-hidden": "true" }), t(`status.providerState.${state}`)] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: status.version === void 0 ? t("status.versionWaiting") : `Mnemon ${status.version}` }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [" · ", t("status.providerSpaces", {
							active: active.length,
							total: bodies.length
						})] })] })]
					})
				]
			});
		}
		function ProviderHealth({ services }) {
			const t = useT();
			const enabled = services.filter((service) => service.enabled).length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: MnemonView_module_css_default.providerHealth,
				"aria-label": t("status.providersAria"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonView_module_css_default.statusSectionHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("status.providersTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("status.providersDescription") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: MnemonView_module_css_default.phaseBadge,
						children: t("status.providersEnabled", {
							enabled,
							total: services.length
						})
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: MnemonView_module_css_default.providerHealthList,
					children: services.map((service) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
						"data-status": service.status,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderIcon, {
								providerId: service.providerId,
								className: MnemonView_module_css_default.providerHealthMark
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.providerHealthCopy,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: service.label }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t(`status.providerState.${service.status}`) }),
									service.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										title: service.error,
										children: service.error
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MnemonView_module_css_default.providerHealthMeta,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: MnemonView_module_css_default.providerHealthSignal,
									"aria-hidden": "true"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("status.providerSpaces", {
									active: service.activeMemoryBodyCount,
									total: service.memoryBodyCount
								}) })]
							})
						]
					}, service.providerId))
				})]
			});
		}
		function storageScopeLabel(t, kind) {
			return t(kind === "global" ? "status.storageGlobal" : kind === "workspace" ? "status.storageWorkspace" : "status.storageCustom");
		}
		/** Resolve the configured scope before the first status round-trip to keep the Sidebar header stable. */
		function configuredStorageScope(config) {
			return config?.storageScope ?? (config?.dataDir?.trim() ? "custom" : "global");
		}
		function storageAreaLabel(t, kind) {
			return t(kind === "runtime" ? "status.storageRuntime" : kind === "memory-bodies" ? "status.storageBodies" : kind === "documents" ? "status.storageDocuments" : "status.storageState");
		}
		function storageAreaDetails(t, area) {
			if (area.kind === "runtime") return t("status.storageRuntimeDetail", {
				user: area.details.userEntries ?? 0,
				memory: area.details.memoryEntries ?? 0
			});
			if (area.kind === "memory-bodies") return t("status.storageBodiesDetail", {
				active: area.details.activeBodies ?? 0,
				databases: area.details.databases ?? 0
			});
			if (area.kind === "documents") return t("status.storageDocumentsDetail", {
				active: area.details.activeDocuments ?? 0,
				archived: area.details.archivedDocuments ?? 0
			});
			return area.details.reviewLedger === true ? t("status.storageStateReady") : t("status.storageStateVolatile");
		}
		function StorageDomains(props) {
			const t = useT();
			const areaStatus = (status) => t(status === "ready" ? "status.storageReady" : status === "empty" ? "status.storageEmpty" : status === "missing" ? "status.storageMissing" : "status.storageInvalid");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: MnemonView_module_css_default.storageDomains,
				"aria-label": t("status.storageDomains"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.statusSectionHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("status.storageDomains") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("status.storageDomainsText") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: MnemonView_module_css_default.phaseBadge,
							children: storageScopeLabel(t, props.selectedKind)
						})]
					}),
					props.catalog === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.storageUnavailable,
						children: t("status.storageWaiting")
					}) : props.selected?.root === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.storageUnavailable,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: storageScopeLabel(t, props.selectedKind) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: props.selectedKind === "custom" ? t("status.storageCustomUnset") : t("status.storageWorkspaceUnavailable") })]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.storageRoot,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							storageScopeLabel(t, props.selectedKind),
							" · ",
							t("status.storageActiveRoot")
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: props.selected.root })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: humanBytes(props.selected.totalBytes) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: props.selected.available ? t("status.storageAvailable") : t("status.storageNotCreated") })] })]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonView_module_css_default.storageAreaGrid,
						children: props.selected.areas.filter((area) => area.kind !== "state").map((area) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
							"data-status": area.status,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}),
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: storageAreaLabel(t, area.kind) })
								] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: areaStatus(area.status) })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: MnemonView_module_css_default.storageAreaMetric,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: area.itemCount }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("status.storageItems") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: humanBytes(area.bytes) })
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: storageAreaDetails(t, area) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									className: MnemonView_module_css_default.storagePath,
									children: area.path
								}),
								area.issue !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: area.issue })
							]
						}, area.kind))
					})] }),
					props.catalog !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: MnemonView_module_css_default.storageFootnote,
						children: t("status.storageFootnote", { root: props.catalog.activeRoot })
					})
				]
			});
		}
		function MnemonView(props) {
			const t = props.t ?? translateZh;
			const appearance = resolveMnemonViewAppearance(props.surface ?? "buildin", t);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(I18nContext.Provider, {
				value: t,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LocaleContext.Provider, {
					value: props.locale ?? "zh",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MnemonViewAppearanceProvider, {
						value: appearance,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MnemonWorkspace, { ...props })
					})
				})
			});
		}
		function MnemonWorkspace({ connection, settingsScope, sessionId, workspaceId, workspaceSelection, onClose }) {
			const t = useT();
			const appearance = useMnemonViewAppearance();
			const settingsSnapshot = (0, react.useSyncExternalStore)(settingsScope.subscribe, settingsScope.getSnapshot, settingsScope.getSnapshot);
			const client = (0, react.useMemo)(() => new MnemonClient(connection, sessionId, workspaceId), [
				connection,
				sessionId,
				workspaceId
			]);
			const viewContextKey = `${`${sessionId ?? ""}\u0000${workspaceId ?? ""}`}\u0000${settingsSnapshot.revision ?? "loading"}`;
			const [page, setPage] = (0, react.useState)("status");
			const lastMemoryPage = (0, react.useRef)("overview");
			const canvasRef = (0, react.useRef)(null);
			const selectPage = (0, react.useCallback)((next) => {
				if (isMemoryPage(next)) lastMemoryPage.current = next;
				setPage(next);
			}, []);
			const selectPrimaryPage = (0, react.useCallback)((next) => {
				selectPage(appearance.surface === "sidebar" && next === "overview" ? lastMemoryPage.current : next);
			}, [appearance.surface, selectPage]);
			/** Pages share one plugin-owned scroll container; never mutate DSH ancestor scrollports. */
			const resetViewportScroll = (0, react.useCallback)(() => {
				const canvas = canvasRef.current;
				if (canvas !== null) canvas.scrollTop = 0;
			}, []);
			(0, react.useLayoutEffect)(() => {
				resetViewportScroll();
			}, [
				viewContextKey,
				page,
				resetViewportScroll
			]);
			const [statusState, setStatusState] = (0, react.useState)(() => ({
				contextKey: viewContextKey,
				value: null,
				loading: true,
				error: null
			}));
			const currentStatusState = statusState.contextKey === viewContextKey ? statusState : {
				contextKey: viewContextKey,
				value: null,
				loading: true,
				error: null
			};
			const status = currentStatusState.value;
			const statusLoading = currentStatusState.loading;
			const statusError = currentStatusState.error;
			const metadataSessionId = status?.lifecycle?.current?.sessionId;
			const taskClient = (0, react.useMemo)(() => new MnemonClient(connection, void 0, workspaceId), [connection, workspaceId]);
			const statusRequest = (0, react.useRef)(0);
			const [revision, setRevision] = (0, react.useState)(0);
			const [searchSeed, setSearchSeed] = (0, react.useState)("");
			const [rememberSeed, setRememberSeed] = (0, react.useState)("");
			const [rememberOpen, setRememberOpen] = (0, react.useState)(false);
			const [strategyOpen, setStrategyOpen] = (0, react.useState)(false);
			(0, react.useLayoutEffect)(() => {
				setRememberOpen(false);
				setStrategyOpen(false);
				setRememberSeed("");
				setSearchSeed("");
			}, [viewContextKey]);
			const openRemember = (0, react.useCallback)((seed = "") => {
				setRememberSeed(seed);
				setRememberOpen(true);
			}, []);
			/** Conversation surfaces ask this view to open a page (optionally with a seed). */
			const applyAnchor = (0, react.useCallback)((anchor) => {
				if (anchor.page === "remember" && appearance.surface === "sidebar") {
					openRemember(anchor.seed ?? "");
					selectPage(lastMemoryPage.current);
					return;
				}
				if (anchor.seed !== void 0 && anchor.seed !== "") {
					if (anchor.page === "explore") setSearchSeed(anchor.seed);
					if (anchor.page === "remember") setRememberSeed(anchor.seed);
				}
				selectPage(anchor.page);
			}, [
				appearance.surface,
				openRemember,
				selectPage
			]);
			(0, react.useEffect)(() => {
				const held = consumeMnemonAnchor(sessionId);
				if (held !== null) applyAnchor(held);
				return subscribeMnemonAnchor(sessionId, applyAnchor);
			}, [sessionId, applyAnchor]);
			const loadStatus = (0, react.useCallback)(async () => {
				const request = ++statusRequest.current;
				setStatusState((current) => ({
					contextKey: viewContextKey,
					value: current.contextKey === viewContextKey ? current.value : null,
					loading: true,
					error: null
				}));
				try {
					const summary = await client.statusSummary();
					if (request !== statusRequest.current) return;
					const needsDeepStatus = summary.memoryBodies?.some((body) => body.statusLoading === true) === true;
					setStatusState({
						contextKey: viewContextKey,
						value: summary,
						loading: needsDeepStatus,
						error: null
					});
					if (!needsDeepStatus) return;
					try {
						const next = await client.status();
						if (request === statusRequest.current) setStatusState({
							contextKey: viewContextKey,
							value: next,
							loading: false,
							error: null
						});
					} catch (reason) {
						if (request === statusRequest.current) setStatusState({
							contextKey: viewContextKey,
							value: summary,
							loading: false,
							error: message(reason)
						});
					}
				} catch (reason) {
					if (request === statusRequest.current) setStatusState({
						contextKey: viewContextKey,
						value: null,
						loading: false,
						error: message(reason)
					});
				}
			}, [client, viewContextKey]);
			(0, react.useEffect)(() => {
				loadStatus();
			}, [loadStatus]);
			const mutate = (0, react.useCallback)(() => {
				setRevision((value) => value + 1);
				loadStatus();
			}, [loadStatus]);
			const bodyReconnected = (0, react.useCallback)((next) => {
				setStatusState((current) => {
					if (current.contextKey !== viewContextKey || current.value === null) return current;
					const providerServices = current.value.providerServices?.map((service) => {
						if (service.providerId !== next.provider.id) return service;
						const { error: _error, ...withoutError } = service;
						return {
							...withoutError,
							status: next.healthy ? "healthy" : "unhealthy",
							...next.error === void 0 ? {} : { error: next.error }
						};
					});
					return {
						...current,
						value: {
							...current.value,
							memoryBodies: current.value.memoryBodies.map((body) => body.id === next.id ? next : body),
							...providerServices === void 0 ? {} : { providerServices }
						}
					};
				});
			}, [viewContextKey]);
			const bodyMetadataUpdated = (0, react.useCallback)((updates) => {
				const byId = new Map(updates.map((update) => [update.memoryBodyId, update]));
				setStatusState((current) => {
					if (current.contextKey !== viewContextKey || current.value === null) return current;
					return {
						...current,
						value: {
							...current.value,
							memoryBodies: current.value.memoryBodies.map((body) => {
								const update = byId.get(body.id);
								return update === void 0 ? body : {
									...body,
									name: update.title,
									description: update.description
								};
							})
						}
					};
				});
			}, [viewContextKey]);
			const forget = (0, react.useCallback)(async (insight) => {
				await client.forget(insight.id, insight.memoryBodyId);
				mutate();
			}, [client, mutate]);
			const explore = (0, react.useCallback)((query) => {
				setSearchSeed(query);
				selectPage("explore");
			}, [selectPage]);
			const clone = (0, react.useCallback)((insight) => {
				if (appearance.surface === "sidebar") openRemember(insight.content);
				else {
					setRememberSeed(insight.content);
					selectPage("remember");
				}
			}, [
				appearance.surface,
				openRemember,
				selectPage
			]);
			const refreshAll = () => {
				setRevision((value) => value + 1);
				loadStatus();
			};
			const activationEnabled = status?.writeEnabled === true;
			const writeEnabled = activationEnabled && settingsSnapshot.status === "ready" && settingsSnapshot.writable;
			const stats = status?.stats;
			const catalogKnown = status?.memoryBodies !== void 0;
			const memoryBodies = (0, react.useMemo)(() => (status?.memoryBodies ?? []).map(normalizeMemoryBody), [status]);
			const activeBodies = memoryBodies.filter((body) => body.active).length;
			const workspaceContext = status?.workspaceContext;
			const storageMode = workspaceContext?.mode ?? status?.storage?.activeKind ?? configuredStorageScope(settingsSnapshot.value);
			const storageModeText = storageScopeLabel(t, storageMode);
			const showWorkspacePicker = storageMode === "workspace" && workspaceSelection !== void 0 && workspaceSelection.options.length > 0;
			const workspaceDiverged = workspaceContext?.mode === "workspace" && !workspaceContext.aligned;
			const taskAgentAvailable = status?.lifecycle?.taskAgentAvailable === true || status?.lifecycle?.taskAgentAvailable === void 0 && metadataSessionId !== void 0 && status?.lifecycle?.sessionAvailable === true && !workspaceDiverged;
			const canAlignWorkspace = workspaceDiverged && workspaceSelection?.effectiveWorkspaceId !== void 0;
			const workspaceDifference = workspaceContext === void 0 ? "" : `${t("workspace.selectedRoot", { root: workspaceContext.selectedRoot })}; ${t("workspace.effectiveRoot", { root: workspaceContext.effectiveRoot })}`;
			const workspacePicker = showWorkspacePicker && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: appearanceClass(MnemonView_module_css_default.workspacePicker, appearance.classes.workspacePicker),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("workspace.viewing") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
					"aria-label": t("workspace.selectorAria"),
					value: workspaceSelection.selectedWorkspaceId ?? "",
					onChange: (event) => workspaceSelection.onSelect(event.target.value),
					children: workspaceSelection.options.map((workspace) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: workspace.id,
						children: workspace.title
					}, workspace.id))
				})]
			});
			const connectionLabel = status === null && statusLoading ? t("header.checking") : status?.healthy !== true ? t("header.unavailable") : appearance.surface === "sidebar" ? t("header.connected") : catalogKnown ? t("header.connectedWithCount", { count: activeBodies }) : t("header.directoryPending");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: appearanceClass(MnemonView_module_css_default.shell, appearance.classes.shell),
				"data-mnemon-surface": appearance.surface,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: appearanceClass(MnemonView_module_css_default.masthead, appearance.classes.masthead),
						children: [
							appearance.surface === "sidebar" && onClose !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: appearanceClass(MnemonView_module_css_default.ghostButton, MnemonView_module_css_default.backButton),
								onClick: onClose,
								"aria-label": t("header.backToConversation"),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { size: 14 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("header.backToConversation") })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: appearanceClass(MnemonView_module_css_default.brand, appearance.classes.brand),
								children: [
									appearance.showLogo && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MnemonLogo, { className: MnemonView_module_css_default.brandLogo }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: appearance.title }),
									appearance.surface === "sidebar" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: MnemonView_module_css_default.storageMode,
										"aria-label": t("workspace.storageModeAria", { mode: storageModeText }),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("workspace.storageMode") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: storageModeText })]
									}),
									appearance.surface === "sidebar" && workspacePicker,
									appearance.surface === "sidebar" && canAlignWorkspace && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: appearanceClass(MnemonView_module_css_default.workspaceMismatch, appearance.classes.workspaceMismatch),
										role: "status",
										"aria-label": `${t("workspace.mismatchTitle")}. ${workspaceDifference}`,
										title: workspaceDifference,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("workspace.mismatchShort") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											onClick: workspaceSelection.onAlign,
											children: t("workspace.align")
										})]
									})
								]
							}),
							appearance.showTelemetry && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: MnemonView_module_css_default.telemetry,
								"aria-label": t("telemetry.aria"),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: MnemonView_module_css_default.telemetryMetric,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("telemetry.memories") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: stats?.totalInsights ?? "—" })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: MnemonView_module_css_default.telemetryMetric,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("telemetry.graph") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: stats?.edgeCount ?? "—" })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: MnemonView_module_css_default.telemetryMetric,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("telemetry.entities") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: stats?.topEntities.length ?? "—" })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: MnemonView_module_css_default.telemetryMetric,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("telemetry.spaces") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: status === null || !catalogKnown ? "—" : activeBodies })]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: appearanceClass(MnemonView_module_css_default.headerActions, appearance.classes.headerActions),
								children: [appearance.surface === "buildin" && workspacePicker, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: appearanceClass(MnemonView_module_css_default.statusCluster, appearance.classes.statusCluster),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `${MnemonView_module_css_default.statusDot} ${statusLoading && status === null ? MnemonView_module_css_default.checking : status?.healthy === true ? MnemonView_module_css_default.online : MnemonView_module_css_default.offline}` }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: connectionLabel }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: MnemonView_module_css_default.iconButton,
											disabled: statusLoading,
											onClick: refreshAll,
											"aria-label": t("common.refresh"),
											children: "↻"
										})
									]
								})]
							})
						]
					}),
					(statusError !== null || status?.healthy === false) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.alert,
						role: "alert",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("header.notReady") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: statusError ?? status?.error })]
					}),
					appearance.surface === "buildin" && workspaceDiverged && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.workspaceMismatch,
						role: "status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("workspace.mismatchTitle") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("workspace.mismatchDescription") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: t("workspace.selectedRoot", { root: workspaceContext.selectedRoot }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: t("workspace.effectiveRoot", { root: workspaceContext.effectiveRoot }) })] })
						] }), canAlignWorkspace && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonView_module_css_default.secondaryButton,
							onClick: workspaceSelection.onAlign,
							children: t("workspace.align")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MnemonView_module_css_default.workspace,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceNavigation, {
								page,
								onSelect: selectPrimaryPage,
								activeBodies,
								bodyCount: memoryBodies.length,
								catalogKnown,
								activationEnabled,
								writeEnabled
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryNavigation, {
								page,
								activationEnabled,
								writeEnabled,
								onSelect: selectPage,
								onRemember: () => openRemember(),
								onStrategy: () => setStrategyOpen(true)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: appearanceClass(MnemonView_module_css_default.canvas, appearance.classes.canvas),
								ref: canvasRef,
								"data-testid": "mnemon-canvas",
								"data-lock-page-header": !isMemoryPage(page) ? "" : void 0,
								children: [
									page === "overview" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OverviewPage, {
										client,
										metadataClient: taskClient,
										revision,
										activationEnabled,
										writeEnabled,
										agentAvailable: taskAgentAvailable,
										fallbackBodies: memoryBodies,
										fallbackDirectory: status?.memoryBodyDirectory,
										catalogKnown,
										onMutate: mutate,
										onAgentRefresh: () => void loadStatus(),
										onBodyReconnect: bodyReconnected,
										onBodyMetadata: bodyMetadataUpdated,
										onExplore: explore
									}),
									page === "runtime" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RuntimePage, {
										client,
										revision,
										writeEnabled,
										onMutate: mutate
									}),
									page === "documents" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DocumentsPage, {
										client,
										revision,
										writeEnabled,
										...sessionId === void 0 ? {} : { sessionId },
										onMutate: mutate
									}),
									page === "explore" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExplorePage, {
										client,
										agentClient: taskClient,
										agentAvailable: taskAgentAvailable,
										status,
										seed: searchSeed,
										writeEnabled,
										onForget: forget
									}),
									page === "entities" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EntitiesPage, {
										client,
										revision,
										writeEnabled,
										onForget: forget,
										onExplore: explore
									}),
									page === "remember" && appearance.surface === "buildin" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RememberPage, {
										client: taskClient,
										agentAvailable: taskAgentAvailable,
										memoryBodies,
										writeEnabled,
										seed: rememberSeed,
										onMutate: mutate
									}),
									page === "list" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ListPage, {
										client,
										revision,
										writeEnabled,
										onForget: forget,
										onClone: clone,
										onExplore: explore
									}),
									page === "status" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusPage, {
										client,
										status,
										loading: statusLoading,
										writeEnabled,
										onRefresh: () => void loadStatus()
									})
								]
							}, viewContextKey),
							appearance.surface === "sidebar" && rememberOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RememberPage, {
								client: taskClient,
								agentAvailable: taskAgentAvailable,
								memoryBodies,
								writeEnabled,
								seed: rememberSeed,
								onMutate: mutate,
								onClose: () => setRememberOpen(false),
								onComplete: () => setRememberOpen(false)
							}),
							appearance.surface === "sidebar" && strategyOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PersistenceStrategyDialog, {
								client: taskClient,
								settingsScope,
								config: settingsSnapshot.value,
								writable: settingsSnapshot.writable,
								agentAvailable: taskAgentAvailable,
								onClose: () => setStrategyOpen(false)
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-mnemon-css:/home/runner/work/dsh-mnemon/dsh-mnemon/src/client/MnemonTurnTail.module.css.mjs
		const css$2 = "._3g7pq_root{min-width:0;margin:2px 0}._3g7pq_bar{cursor:pointer;min-width:0;max-width:100%;height:22px;color:var(--dsw-alias-label-tertiary);background:0 0;border:1px solid #0000;border-radius:6px;align-items:center;gap:6px;padding:0 8px 0 6px;font-size:11px;line-height:22px;display:flex}._3g7pq_bar:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}._3g7pq_bar:focus-visible{outline:1.5px solid var(--dsw-alias-state-business-primary);outline-offset:2px}._3g7pq_mark{opacity:.8;flex:none;font-size:10px}._3g7pq_label{flex:none;font-weight:600}._3g7pq_metrics{align-items:center;gap:6px;min-width:0;display:inline-flex;overflow:hidden}._3g7pq_metrics span{white-space:nowrap}._3g7pq_failureMetric{color:var(--dsw-alias-state-error-primary,#d44)}._3g7pq_chevron{opacity:.7;flex:none;width:8px;height:8px;margin-left:auto}._3g7pq_chevron:before{content:\"\";border-bottom:1.5px solid;border-right:1.5px solid;width:5px;height:5px;transition:transform .12s;display:block;transform:rotate(45deg)translate(-1px,-1px)}._3g7pq_chevronOpen:before{transform:rotate(-135deg)translate(0)}._3g7pq_details{border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-markdown-code-block);border-radius:0 8px 8px 0;align-items:center;gap:10px;min-width:0;margin:2px 0 4px;padding:6px 8px;display:flex}._3g7pq_detailLabel{color:var(--dsw-alias-label-caption);letter-spacing:.08em;text-transform:uppercase;flex:none;font-size:10px;font-weight:650}._3g7pq_tools{flex-wrap:wrap;flex:auto;gap:4px;min-width:0;display:flex}._3g7pq_toolChip{cursor:pointer;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code,Consolas, monospace);white-space:nowrap;border:none;border-radius:4px;padding:0 6px;font-size:10px;line-height:18px}._3g7pq_toolChip:hover{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-state-business-primary)}._3g7pq_toolChip:focus-visible{outline:1.5px solid var(--dsw-alias-state-business-primary);outline-offset:1px}";
		const tagId$2 = "dsh-mnemon/src/client/MnemonTurnTail.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-mnemon";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var MnemonTurnTail_module_css_default = {
			"bar": "_3g7pq_bar",
			"chevron": "_3g7pq_chevron",
			"chevronOpen": "_3g7pq_chevronOpen",
			"detailLabel": "_3g7pq_detailLabel",
			"details": "_3g7pq_details",
			"failureMetric": "_3g7pq_failureMetric",
			"label": "_3g7pq_label",
			"mark": "_3g7pq_mark",
			"metrics": "_3g7pq_metrics",
			"root": "_3g7pq_root",
			"toolChip": "_3g7pq_toolChip",
			"tools": "_3g7pq_tools"
		};
		//#endregion
		//#region src/client/MnemonTurnTail.tsx
		function turnNumber(turn) {
			const value = turn?.turn;
			return typeof value === "number" ? value : void 0;
		}
		/** Route a settled tool name to the workbench page that explains its effect. */
		function memoryPageForTool(name) {
			if (name === "mnemon_document_search" || name === "mnemon_document_manage") return "documents";
			if (name === "mnemon_runtime_memory") return "runtime";
			if (name === "mnemon_recall" || name === "mnemon_related") return "explore";
			if (name === "mnemon_status") return "status";
			return "overview";
		}
		/** Whether this entry renders for the owner; chain selectors decline quietly. */
		function selectMnemonTurnTail(owner) {
			return owner.turn.status === "closed" ? {} : null;
		}
		/** One-line memory-activity bar under a completed turn; hides when the turn touched no memory. */
		const MnemonTurnTail = (0, react.memo)(function MnemonTurnTail({ turn, seq, sessionId, connection, t }) {
			const [activity, setActivity] = (0, react.useState)(void 0);
			const [open, setOpen] = (0, react.useState)(false);
			const number = turnNumber(turn);
			(0, react.useEffect)(() => {
				if (number === void 0) {
					setActivity(null);
					return;
				}
				let alive = true;
				new MnemonClient(connection, sessionId).turnActivity(number, seq).then((result) => {
					if (alive) setActivity(result);
				}).catch(() => {
					if (alive) setActivity(null);
				});
				return () => {
					alive = false;
				};
			}, [
				connection,
				sessionId,
				number,
				seq
			]);
			if (activity === void 0 || activity === null) return null;
			if (number === void 0) return null;
			const openTool = (name, event) => {
				event.stopPropagation();
				dispatchMnemonAnchor({
					page: memoryPageForTool(name),
					...sessionId === void 0 ? {} : { sessionId }
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonTurnTail_module_css_default.root,
				"data-open": open || void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: MnemonTurnTail_module_css_default.bar,
					"aria-expanded": open,
					onClick: () => setOpen((value) => !value),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: MnemonTurnTail_module_css_default.mark,
							"aria-hidden": "true",
							children: "◈"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: MnemonTurnTail_module_css_default.label,
							children: t("turnTail.label")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: MnemonTurnTail_module_css_default.metrics,
							children: [
								activity.recalls > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("turnTail.recall", { count: activity.recalls }) }),
								activity.writes > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("turnTail.write", { count: activity.writes }) }),
								activity.documentSearches > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("turnTail.documents", { count: activity.documentSearches }) }),
								activity.inspections > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("turnTail.inspect", { count: activity.inspections }) }),
								activity.failures > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: MnemonTurnTail_module_css_default.failureMetric,
									children: t("turnTail.failed", { count: activity.failures })
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `${MnemonTurnTail_module_css_default.chevron} ${open ? MnemonTurnTail_module_css_default.chevronOpen : ""}`,
							"aria-hidden": "true"
						})
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: MnemonTurnTail_module_css_default.details,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: MnemonTurnTail_module_css_default.detailLabel,
						children: t("turnTail.toolList")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: MnemonTurnTail_module_css_default.tools,
						children: activity.names.map((name, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MnemonTurnTail_module_css_default.toolChip,
							"aria-label": t("turnTail.openTool", { tool: name }),
							onClick: (event) => openTool(name, event),
							children: name
						}, `${name}-${index}`))
					})]
				})]
			});
		});
		//#endregion
		//#region \0dsh-mnemon-css:/home/runner/work/dsh-mnemon/dsh-mnemon/src/client/MnemonSaveAction.module.css.mjs
		const css$1 = ".ypSjoa_wrap{display:inline-flex;position:relative}.ypSjoa_button{cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.ypSjoa_button:hover,.ypSjoa_button[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.ypSjoa_button:focus-visible{outline:1.5px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.ypSjoa_icon{flex:none;width:16px;height:16px}.ypSjoa_modal{width:min(640px, calc(100vw - max(12px, env(safe-area-inset-left,0px)) - max(12px, env(safe-area-inset-right,0px))));max-height:calc(100vh - 24px)}.ypSjoa_modalContent{overscroll-behavior:contain;-webkit-overflow-scrolling:touch;min-height:0;overflow-y:auto}.ypSjoa_modalAction{min-width:96px}.ypSjoa_status{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:20px}.ypSjoa_readOnly{background:var(--dsw-alias-state-warn-bg,transparent);color:var(--dsw-alias-state-warn-primary);border-radius:6px;margin-top:8px;padding:6px 8px;font-size:11px}.ypSjoa_candidate{display:block}.ypSjoa_candidate>span{color:var(--dsw-alias-label-caption);margin-bottom:8px;font-size:12px;font-weight:650;line-height:18px;display:block}.ypSjoa_candidate textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);resize:vertical;background:var(--dsw-specific-input-major,var(--dsw-alias-bg-base));width:100%;min-height:260px;max-height:50vh;color:var(--dsw-alias-label-primary);font:13px/20px var(--ds-font-family-code,Consolas, monospace);border-radius:8px;padding:8px 10px;display:block}.ypSjoa_candidate textarea:focus-visible{outline:1.5px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.ypSjoa_truncated{color:var(--dsw-alias-label-tertiary);margin-top:4px;font-size:10px;line-height:14px;display:block}.ypSjoa_outcome{background:var(--dsw-alias-state-success-bg,transparent);color:var(--dsw-alias-state-success-primary);border-radius:6px;margin-top:8px;padding:6px 8px;font-size:11px}.ypSjoa_failure{background:var(--dsw-alias-state-error-bg,transparent);color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;border-radius:6px;margin-top:8px;padding:6px 8px;font-size:11px}@media (width<=640px),(height<=560px){.ypSjoa_modal{width:min(100%, calc(100vw - max(8px, env(safe-area-inset-left,0px)) - max(8px, env(safe-area-inset-right,0px))));max-height:calc(100vh - 16px)}.ypSjoa_modal .ypSjoa_modalAction{min-width:0;min-height:44px}.ypSjoa_candidate textarea{min-height:clamp(140px,32vh,220px);max-height:42vh}}@media (pointer:coarse) and (width<=640px),(pointer:coarse) and (height<=560px){.ypSjoa_candidate textarea{font-size:16px}}@supports (height:100dvh){.ypSjoa_modal{max-height:calc(100dvh - 24px)}@media (width<=640px),(height<=560px){.ypSjoa_modal{max-height:calc(100dvh - 16px)}.ypSjoa_candidate textarea{min-height:clamp(140px,32dvh,220px);max-height:42dvh}}}";
		const tagId$1 = "dsh-mnemon/src/client/MnemonSaveAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-mnemon";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var MnemonSaveAction_module_css_default = {
			"button": "ypSjoa_button",
			"candidate": "ypSjoa_candidate",
			"failure": "ypSjoa_failure",
			"icon": "ypSjoa_icon",
			"modal": "ypSjoa_modal",
			"modalAction": "ypSjoa_modalAction",
			"modalContent": "ypSjoa_modalContent",
			"outcome": "ypSjoa_outcome",
			"readOnly": "ypSjoa_readOnly",
			"status": "ypSjoa_status",
			"truncated": "ypSjoa_truncated",
			"wrap": "ypSjoa_wrap"
		};
		//#endregion
		//#region src/client/MnemonSaveAction.tsx
		const PREVIEW_LIMIT = 8e3;
		/** Save-to-memory action on finalized assistant messages, routed through the supervised writeback gate. */
		const MnemonSaveAction = (0, react.memo)(function MnemonSaveAction({ messageId, sessionId, connection, settingsScope, t }) {
			const settingsSnapshot = (0, react.useSyncExternalStore)(settingsScope.subscribe, settingsScope.getSnapshot, settingsScope.getSnapshot);
			const managementWritable = settingsSnapshot.status === "ready" && settingsSnapshot.writable;
			const [open, setOpen] = (0, react.useState)(false);
			const [writeEnabled, setWriteEnabled] = (0, react.useState)(void 0);
			const [candidate, setCandidate] = (0, react.useState)(void 0);
			const [truncated, setTruncated] = (0, react.useState)(false);
			const [missing, setMissing] = (0, react.useState)(false);
			const [submitting, setSubmitting] = (0, react.useState)(false);
			const [outcome, setOutcome] = (0, react.useState)(null);
			const [failure, setFailure] = (0, react.useState)(null);
			const textareaRef = (0, react.useRef)(null);
			const openRef = (0, react.useRef)(false);
			const requestVersionRef = (0, react.useRef)(0);
			const submitActiveRef = (0, react.useRef)(false);
			const setPanelOpen = (next) => {
				requestVersionRef.current += 1;
				openRef.current = next;
				setOpen(next);
			};
			(0, react.useEffect)(() => {
				if (!open) {
					setWriteEnabled(void 0);
					setCandidate(void 0);
					setTruncated(false);
					setMissing(false);
					setSubmitting(submitActiveRef.current);
					setOutcome(null);
					setFailure(null);
					return;
				}
				const requestVersion = ++requestVersionRef.current;
				let alive = true;
				setSubmitting(submitActiveRef.current);
				const client = new MnemonClient(connection, sessionId);
				client.status().then((status) => {
					if (alive && requestVersionRef.current === requestVersion) setWriteEnabled(status.writeEnabled && managementWritable);
				}).catch(() => {
					if (alive && requestVersionRef.current === requestVersion) setWriteEnabled(false);
				});
				client.assistantMessageText(messageId).then((result) => {
					if (!alive || requestVersionRef.current !== requestVersion) return;
					if (result === null || result.text === "") setMissing(true);
					else {
						setTruncated(result.text.length > PREVIEW_LIMIT);
						setCandidate(result.text.slice(0, PREVIEW_LIMIT));
					}
				}).catch(() => {
					if (alive && requestVersionRef.current === requestVersion) setMissing(true);
				});
				return () => {
					alive = false;
				};
			}, [
				open,
				connection,
				sessionId,
				messageId,
				managementWritable
			]);
			const submit = () => {
				const content = textareaRef.current?.value.trim() ?? "";
				if (content === "" || writeEnabled !== true || submitActiveRef.current) return;
				const requestVersion = requestVersionRef.current;
				submitActiveRef.current = true;
				setSubmitting(true);
				setFailure(null);
				setOutcome(null);
				new MnemonClient(connection, sessionId).supervise(content, messageId).then((result) => {
					if (!openRef.current || requestVersionRef.current !== requestVersion) return;
					setOutcome({
						summary: result.summary,
						action: result.action
					});
					setCandidate(content);
				}).catch((reason) => {
					if (openRef.current && requestVersionRef.current === requestVersion) setFailure(reason instanceof Error ? reason.message : String(reason));
				}).finally(() => {
					submitActiveRef.current = false;
					if (openRef.current) setSubmitting(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: MnemonSaveAction_module_css_default.wrap,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: t("saveAction.tooltip"),
					side: "bottom",
					disabled: open,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: MnemonSaveAction_module_css_default.button,
						"aria-label": t("saveAction.button"),
						"aria-haspopup": "dialog",
						"aria-expanded": open,
						onClick: () => setPanelOpen(!openRef.current),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutline16, {
							size: 16,
							className: MnemonSaveAction_module_css_default.icon
						})
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
					open,
					onClose: () => setPanelOpen(false),
					title: t("saveAction.title"),
					closeLabel: t("saveAction.close"),
					description: t("saveAction.hint"),
					className: MnemonSaveAction_module_css_default.modal,
					contentClassName: MnemonSaveAction_module_css_default.modalContent,
					footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						className: MnemonSaveAction_module_css_default.modalAction,
						disabled: submitting,
						onClick: () => setPanelOpen(false),
						children: t("common.cancel")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						className: MnemonSaveAction_module_css_default.modalAction,
						disabled: candidate === void 0 || submitting || writeEnabled !== true,
						onClick: submit,
						children: submitting ? t("saveAction.submitting") : t("saveAction.submit")
					})] }),
					children: [
						writeEnabled === false && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonSaveAction_module_css_default.readOnly,
							role: "status",
							children: t("saveAction.readOnly")
						}),
						candidate === void 0 && !missing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonSaveAction_module_css_default.status,
							children: t("saveAction.fetching")
						}),
						missing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonSaveAction_module_css_default.status,
							role: "status",
							children: t("saveAction.missing")
						}),
						candidate !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: MnemonSaveAction_module_css_default.candidate,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("saveAction.candidate") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									ref: textareaRef,
									rows: 12,
									defaultValue: candidate,
									autoFocus: true
								}),
								truncated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
									className: MnemonSaveAction_module_css_default.truncated,
									children: t("saveAction.truncated", { limit: PREVIEW_LIMIT })
								})
							]
						}),
						outcome !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonSaveAction_module_css_default.outcome,
							role: "status",
							children: t("saveAction.result", { summary: outcome.summary })
						}),
						failure !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MnemonSaveAction_module_css_default.failure,
							role: "alert",
							children: t("saveAction.failed", { error: failure })
						})
					]
				})]
			});
		});
		//#endregion
		//#region src/client/settings.ts
		var MnemonSettingsScope = class {
			connection;
			namespace;
			requestTimeoutMs;
			snapshot = {
				status: "loading",
				writable: false,
				mode: "host"
			};
			listeners = /* @__PURE__ */ new Set();
			tail = Promise.resolve();
			constructor(connection, namespace = MNEMON_SETTINGS_NAMESPACE, requestTimeoutMs = 12e3) {
				this.connection = connection;
				this.namespace = namespace;
				this.requestTimeoutMs = requestTimeoutMs;
				this.load();
			}
			getSnapshot = () => this.snapshot;
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			};
			set(field, value) {
				return this.mutate([{
					op: "set",
					path: [field],
					value
				}]);
			}
			unset(field) {
				return this.mutate([{
					op: "unset",
					path: [field]
				}]);
			}
			/** Set a nested field. */
			setPath(path, value) {
				return this.mutate([{
					op: "set",
					path,
					value
				}]);
			}
			/** Unset a nested field, falling back to its schema default. */
			unsetPath(path) {
				return this.mutate([{
					op: "unset",
					path
				}]);
			}
			mutate(ops) {
				return this.write(ops);
			}
			async load() {
				try {
					const response = await this.call("get", { namespace: this.namespace });
					if (!response.ok) {
						this.publish({
							status: "unavailable",
							writable: false,
							mode: "host"
						});
						return;
					}
					this.publish(response.value);
				} catch {
					this.publish({
						status: "unavailable",
						writable: false,
						mode: "host"
					});
				}
			}
			write(ops) {
				const task = this.tail.then(async () => {
					const response = await this.call("mutate", {
						namespace: this.namespace,
						ops,
						...this.snapshot.revision === void 0 ? {} : { expectedRevision: this.snapshot.revision }
					});
					if (!response.ok) {
						await this.load();
						throw new Error(response.error.message);
					}
					this.publish(response.value);
				});
				this.tail = task.catch(() => {});
				return task;
			}
			async call(endpoint, payload) {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), Math.max(1, this.requestTimeoutMs));
				try {
					return await this.connection.rpc.call(MNEMON_SETTINGS_CHANNEL, endpoint, payload, controller.signal);
				} catch (error) {
					if (controller.signal.aborted) throw new Error("Mnemon settings request timed out");
					throw error;
				} finally {
					clearTimeout(timeout);
				}
			}
			publish(snapshot) {
				this.snapshot = snapshot;
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region \0dsh-mnemon-css:/home/runner/work/dsh-mnemon/dsh-mnemon/src/client/MnemonWorkspace.module.css.mjs
		const css = "[data-pane=conversation]{position:relative}[data-dsh-mnemon-view]{z-index:60;background:var(--dsw-alias-bg-base);min-width:0;min-height:0;display:none;position:absolute;inset:0;overflow:hidden}.NS3bAW_panelView{isolation:isolate}html[data-dsh-mnemon-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-dsh-mnemon-view]{display:block}html[data-dsh-mnemon-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-pane=conversation]>:not([data-dsh-mnemon-view]),html[data-dsh-mnemon-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [class*=centerCol]>:not([data-dsh-mnemon-view]){display:none!important}.NS3bAW_entry{width:100%;height:32px;color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:pointer;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex}.NS3bAW_entry:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-sidebar-nav-item-hover)}.NS3bAW_entry[data-active]{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-sidebar-nav-item-active);font-weight:600}.NS3bAW_entryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}.NS3bAW_entryLabel{text-overflow:ellipsis;overflow:hidden}[data-dsh-frame][data-sidebar-collapsed] .NS3bAW_entry{justify-content:center;width:100%;padding:0}[data-dsh-frame][data-sidebar-collapsed] .NS3bAW_entryLabel{display:none}";
		const tagId = "dsh-mnemon/src/client/MnemonWorkspace.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-mnemon";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var MnemonWorkspace_module_css_default = {
			"entry": "NS3bAW_entry",
			"entryIcon": "NS3bAW_entryIcon",
			"entryLabel": "NS3bAW_entryLabel",
			"panelView": "NS3bAW_panelView"
		};
		//#endregion
		//#region src/client/sidebar-entry.ts
		const FAMILY_SELECTOR = "[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-mnemon-entry]";
		function sidebarRoot() {
			const column = document.querySelector("[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]");
			if (column === null) return void 0;
			return column.querySelector("[class*=\"logoRow\"]")?.parentElement ?? column.firstElementChild;
		}
		function newSessionButton(root) {
			const nested = root.querySelector("button[class*=\"newSession\"]");
			if (nested !== null) return nested;
			for (const child of root.children) if (child.tagName === "BUTTON") return child;
		}
		function createIcon() {
			const namespace = "http://www.w3.org/2000/svg";
			const icon = document.createElementNS(namespace, "svg");
			icon.setAttribute("viewBox", "0 0 16 16");
			icon.setAttribute("width", "14");
			icon.setAttribute("height", "14");
			icon.setAttribute("fill", "none");
			icon.setAttribute("stroke", "currentColor");
			icon.setAttribute("stroke-width", "1.3");
			icon.setAttribute("stroke-linecap", "round");
			icon.setAttribute("stroke-linejoin", "round");
			icon.setAttribute("aria-hidden", "true");
			const ellipse = document.createElementNS(namespace, "ellipse");
			ellipse.setAttribute("cx", "8");
			ellipse.setAttribute("cy", "3.5");
			ellipse.setAttribute("rx", "5");
			ellipse.setAttribute("ry", "2");
			const path = document.createElementNS(namespace, "path");
			path.setAttribute("d", "M3 3.5v4c0 1.1 2.2 2 5 2s5-.9 5-2v-4M3 7.5v4c0 1.1 2.2 2 5 2s5-.9 5-2v-4");
			icon.append(ellipse, path);
			return icon;
		}
		function createEntry(controller) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshMnemonEntry = "";
			entry.className = MnemonWorkspace_module_css_default.entry ?? "";
			const icon = document.createElement("span");
			icon.className = MnemonWorkspace_module_css_default.entryIcon ?? "";
			icon.append(createIcon());
			const label = document.createElement("span");
			label.className = MnemonWorkspace_module_css_default.entryLabel ?? "";
			entry.append(icon, label);
			entry.addEventListener("click", () => {
				controller.toggle();
			});
			return {
				entry,
				label
			};
		}
		function placeEntry(root, entry) {
			const button = newSessionButton(root);
			if (button === void 0) return false;
			if (entry.parentElement === root) return true;
			const row = button.closest("[class*=\"logoRow\"]");
			const base = row !== null && row.parentElement === root ? row : button;
			const anchor = Array.from(root.children).filter((element) => element instanceof HTMLElement && element.matches(FAMILY_SELECTOR)).at(-1)?.nextElementSibling ?? base.nextElementSibling;
			root.insertBefore(entry, anchor);
			return true;
		}
		/** Mount a self-healing official-style entry under the New Session row. */
		function mountMnemonSidebarEntry(controller, t, subscribeLocale) {
			const { entry, label } = createEntry(controller);
			let root;
			let placed = false;
			const syncLabel = () => {
				const text = t("tab.label");
				if (entry.getAttribute("aria-label") !== text) entry.setAttribute("aria-label", text);
				if (entry.title !== text) entry.title = text;
				if (label.textContent !== text) label.textContent = text;
			};
			const rootObserver = new MutationObserver(() => {
				if (root === void 0 || !root.isConnected) {
					placed = false;
					tryPlace();
					return;
				}
				if (!root.contains(entry)) placed = placeEntry(root, entry);
			});
			const tryPlace = () => {
				syncLabel();
				if (root !== void 0 && !root.isConnected) {
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				if (placed && document.body.contains(entry)) return;
				if (placed) {
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				root ??= sidebarRoot();
				if (root === void 0) return;
				placed = placeEntry(root, entry);
				if (placed) rootObserver.observe(root, {
					childList: true,
					subtree: true
				});
			};
			const waitObserver = new MutationObserver(tryPlace);
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const syncActive = () => {
				if (controller.getSnapshot().open) entry.dataset.active = "true";
				else delete entry.dataset.active;
			};
			const unsubscribe = controller.subscribe(syncActive);
			const unsubscribeLocale = subscribeLocale?.(syncLabel) ?? (() => {});
			syncActive();
			tryPlace();
			return () => {
				waitObserver.disconnect();
				rootObserver.disconnect();
				unsubscribe();
				unsubscribeLocale();
				entry.remove();
			};
		}
		//#endregion
		//#region src/client/workspace-controller.ts
		/** Small framework-neutral state holder shared by the sidebar row and panel. */
		var MnemonWorkspaceController = class {
			snapshot = { open: false };
			listeners = /* @__PURE__ */ new Set();
			getSnapshot = () => this.snapshot;
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			open() {
				this.setOpen(true);
			}
			close() {
				this.setOpen(false);
			}
			toggle() {
				this.setOpen(!this.snapshot.open);
			}
			setOpen(open) {
				if (this.snapshot.open === open) return;
				this.snapshot = { open };
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/client/workspace-mount.tsx
		const CONVERSATION_COLUMN_SELECTOR = "[data-pane=\"conversation\"], [class*=\"centerCol\"]";
		const ACTIVE_ATTR = "data-dsh-mnemon-active";
		const TASKBOARD_ACTIVE_ATTR = "data-dsh-taskboard-active";
		const SSH_ACTIVE_ATTR = "data-dsh-ssh-active";
		const ACTIVATE_EVENT = "dsh-panel-activate";
		const SIDEBAR_CONTEXT_SELECTOR = "[class*=\"sessionRow\"], [class*=\"projectRow\"], [class*=\"searchResultRow\"], [class*=\"searchResultWorkspace\"], [class*=\"newSession\"]";
		function MnemonPanel({ ctx, settings, t, onClose }) {
			const subscribeLocale = (0, react.useCallback)((listener) => ctx.locale.subscribe(listener), [ctx.locale]);
			const getLocaleSnapshot = (0, react.useCallback)(() => ctx.locale.getSnapshot(), [ctx.locale]);
			const locale = (0, react.useSyncExternalStore)(subscribeLocale, getLocaleSnapshot, getLocaleSnapshot);
			const sessions = (0, react.useSyncExternalStore)(ctx.sessions.list.subscribe, ctx.sessions.list.getSnapshot, ctx.sessions.list.getSnapshot);
			const workspaces = (0, react.useSyncExternalStore)(ctx.workspaces.list.subscribe, ctx.workspaces.list.getSnapshot, ctx.workspaces.list.getSnapshot);
			const [selectedWorkspaceId, setSelectedWorkspaceId] = (0, react.useState)();
			const currentCwd = sessions.current === void 0 ? void 0 : sessions.byId[sessions.current]?.cwd;
			const normalizePath = (value) => value.replace(/[\\/]+$/u, "");
			const effectiveWorkspace = currentCwd === void 0 ? void 0 : workspaces.items.find((workspace) => normalizePath(workspace.path) === normalizePath(currentCwd));
			const fallbackWorkspace = effectiveWorkspace ?? workspaces.items.find((workspace) => String(workspace.workspaceId) === String(workspaces.recentWorkspaceId)) ?? workspaces.items[0];
			const resolvedSelectedId = selectedWorkspaceId !== void 0 && workspaces.items.some((workspace) => String(workspace.workspaceId) === selectedWorkspaceId) ? selectedWorkspaceId : fallbackWorkspace === void 0 ? void 0 : String(fallbackWorkspace.workspaceId);
			(0, react.useEffect)(() => {
				if (resolvedSelectedId !== selectedWorkspaceId) setSelectedWorkspaceId(resolvedSelectedId);
			}, [resolvedSelectedId, selectedWorkspaceId]);
			const selection = (0, react.useMemo)(() => ({
				options: workspaces.items.map((workspace) => ({
					id: String(workspace.workspaceId),
					title: workspace.title,
					path: workspace.path
				})),
				...resolvedSelectedId === void 0 ? {} : { selectedWorkspaceId: resolvedSelectedId },
				...effectiveWorkspace === void 0 ? {} : { effectiveWorkspaceId: String(effectiveWorkspace.workspaceId) },
				onSelect: setSelectedWorkspaceId,
				onAlign: () => {
					if (effectiveWorkspace !== void 0) setSelectedWorkspaceId(String(effectiveWorkspace.workspaceId));
				}
			}), [
				effectiveWorkspace,
				resolvedSelectedId,
				workspaces.items
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MnemonView, {
				connection: ctx.connection,
				settingsScope: settings,
				...sessions.current === void 0 ? {} : { sessionId: sessions.current },
				...resolvedSelectedId === void 0 ? {} : { workspaceId: resolvedSelectedId },
				workspaceSelection: selection,
				surface: "sidebar",
				t,
				locale: locale.active,
				onClose
			});
		}
		function conversationColumn() {
			return document.querySelector(CONVERSATION_COLUMN_SELECTOR) ?? void 0;
		}
		function mountPanel(controller, ctx, settings, t) {
			let root;
			let container;
			const ensure = () => {
				if (container !== void 0 && container.isConnected) return;
				if (container !== void 0) {
					root?.unmount();
					root = void 0;
					container = void 0;
				}
				const column = conversationColumn();
				if (column === void 0) return;
				container = document.createElement("div");
				container.dataset.dshMnemonView = "";
				container.className = MnemonWorkspace_module_css_default.panelView ?? "";
				column.append(container);
				root = (0, react_dom_client.createRoot)(container);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MnemonPanel, {
					ctx,
					settings,
					t,
					onClose: () => {
						controller.close();
					}
				}));
			};
			const waitObserver = new MutationObserver(ensure);
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			let suppressCompatibilityClose = false;
			const applyActive = () => {
				if (!controller.getSnapshot().open) {
					document.documentElement.removeAttribute(ACTIVE_ATTR);
					return;
				}
				suppressCompatibilityClose = true;
				document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: "ssh" }));
				document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: "taskboard" }));
				suppressCompatibilityClose = false;
				document.documentElement.removeAttribute(TASKBOARD_ACTIVE_ATTR);
				document.documentElement.removeAttribute(SSH_ACTIVE_ATTR);
				document.documentElement.setAttribute(ACTIVE_ATTR, "");
				document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: "mnemon" }));
			};
			const onOtherPanelActivate = (event) => {
				if (suppressCompatibilityClose || !controller.getSnapshot().open) return;
				const detail = event.detail;
				if (detail === "taskboard" || detail === "ssh") controller.close();
			};
			const onSidebarContextClick = (event) => {
				if (!controller.getSnapshot().open) return;
				const target = event.target;
				if (target instanceof Element && target.closest(SIDEBAR_CONTEXT_SELECTOR) !== null) controller.close();
			};
			const onAnchor = () => {
				controller.open();
			};
			document.addEventListener("click", onSidebarContextClick, true);
			document.addEventListener(ACTIVATE_EVENT, onOtherPanelActivate);
			window.addEventListener(MNEMON_ANCHOR_EVENT, onAnchor);
			const unsubscribe = controller.subscribe(applyActive);
			applyActive();
			ensure();
			return () => {
				document.removeEventListener("click", onSidebarContextClick, true);
				document.removeEventListener(ACTIVATE_EVENT, onOtherPanelActivate);
				window.removeEventListener(MNEMON_ANCHOR_EVENT, onAnchor);
				waitObserver.disconnect();
				unsubscribe();
				document.documentElement.removeAttribute(ACTIVE_ATTR);
				root?.unmount();
				root = void 0;
				container?.remove();
				container = void 0;
			};
		}
		/** Mount the sidebar row and its stateful center-column workspace as one unit. */
		function mountMnemonWorkspace(ctx, settings, t) {
			if (typeof document === "undefined" || typeof window === "undefined") return () => {};
			const controller = new MnemonWorkspaceController();
			const disposeEntry = mountMnemonSidebarEntry(controller, t, (listener) => ctx.locale.subscribe(listener));
			const disposePanel = mountPanel(controller, ctx, settings, t);
			return () => {
				disposePanel();
				disposeEntry();
			};
		}
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"slots",
			"sessions",
			"workspaces",
			"connection",
			"locale"
		];
		const INTERACTION_UNITS = {
			turnBar: {
				slot: "conversation.chat.turnTail",
				enabled: (value) => enabledOf(value, "turnBar"),
				register(ctx, namespace, translate) {
					return ctx.slots.register({
						name: "conversation.chat.turnTail",
						locale: namespace,
						select: selectMnemonTurnTail,
						inject: (sessionId) => ({
							...typeof sessionId === "string" && sessionId !== "" ? { sessionId } : {},
							connection: ctx.connection,
							t: translate
						})
					}, MnemonTurnTail);
				}
			},
			saveAction: {
				slot: "conversation.chat.assistant-actions",
				enabled: (value) => enabledOf(value, "saveAction"),
				register(ctx, namespace, translate, settings) {
					return ctx.slots.register({
						name: "conversation.chat.assistant-actions",
						id: "mnemon-save",
						order: 90,
						locale: namespace,
						inject: (sessionId) => ({
							...typeof sessionId === "string" && sessionId !== "" ? { sessionId } : {},
							connection: ctx.connection,
							settingsScope: settings,
							t: translate
						})
					}, MnemonSaveAction);
				}
			}
		};
		/** Ready snapshots default each interaction on; loading has no value and mounts nothing. */
		function enabledOf(value, key) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
			return value[key] !== false;
		}
		function mountBuildinMemoryView(ctx, settings, namespace, translate) {
			const disposeView = ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "mnemon",
				order: 30,
				label: () => translate("tab.label"),
				locale: namespace,
				inject: () => ({
					connection: ctx.connection,
					settingsScope: settings,
					surface: "buildin",
					t: translate,
					locale: ctx.locale.getSnapshot().active
				})
			}, MnemonView));
			if (typeof window === "undefined" || typeof document === "undefined") return disposeView;
			const openBuildinView = () => {
				const label = translate("tab.label").trim();
				[...document.querySelectorAll("[role=\"tab\"]")].find((candidate) => candidate.textContent?.trim() === label)?.click();
			};
			window.addEventListener(MNEMON_ANCHOR_EVENT, openBuildinView);
			return () => {
				window.removeEventListener(MNEMON_ANCHOR_EVENT, openBuildinView);
				disposeView();
			};
		}
		/** Mount the memory workspace plus the optional in-conversation interaction surfaces. */
		function apply(rawContext) {
			const ctx = rawContext;
			const settings = new MnemonSettingsScope(ctx.connection, MNEMON_SETTINGS_NAMESPACE);
			const interactionSettings = new MnemonSettingsScope(ctx.connection, MNEMON_UI_SETTINGS_NAMESPACE);
			const namespace = "mnemon";
			ctx.effect(() => ctx.locale.register(namespace, {
				zh,
				en
			}), "dsh-mnemon: locale dictionaries");
			const translate = ctx.locale.bind(namespace);
			let activeMemoryWorkspace;
			const reconcileMemoryWorkspace = () => {
				const snapshot = settings.getSnapshot();
				const value = snapshot.value;
				const mode = snapshot.status === "loading" ? void 0 : value?.tabEnabled === false ? void 0 : value?.displayMode ?? "sidebar";
				if (activeMemoryWorkspace?.mode === mode) return;
				activeMemoryWorkspace?.dispose();
				activeMemoryWorkspace = mode === void 0 ? void 0 : {
					mode,
					dispose: mode === "buildin" ? mountBuildinMemoryView(ctx, settings, namespace, translate) : mountMnemonWorkspace(ctx, settings, translate)
				};
			};
			ctx.effect(() => {
				const unsubscribe = settings.subscribe(reconcileMemoryWorkspace);
				reconcileMemoryWorkspace();
				return () => {
					unsubscribe();
					activeMemoryWorkspace?.dispose();
					activeMemoryWorkspace = void 0;
				};
			}, "dsh-mnemon: configurable memory workspace");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "mnemon",
				order: 20,
				label: () => translate("tab.label"),
				locale: namespace,
				inject: () => {
					const sessions = ctx.sessions?.list?.getSnapshot?.() ?? {
						current: void 0,
						byId: {}
					};
					const workspaces = ctx.workspaces?.list?.getSnapshot?.() ?? {
						items: [],
						recentWorkspaceId: void 0
					};
					const sessionId = sessions.current;
					const cwd = sessionId === void 0 ? void 0 : sessions.byId[sessionId]?.cwd;
					const normalizePath = (value) => value.replace(/[\\/]+$/u, "");
					const workspace = cwd === void 0 ? workspaces.items.find((candidate) => String(candidate.workspaceId) === String(workspaces.recentWorkspaceId)) ?? workspaces.items[0] : workspaces.items.find((candidate) => normalizePath(candidate.path) === normalizePath(cwd));
					return {
						scope: settings,
						interactionScope: interactionSettings,
						connection: ctx.connection,
						...sessionId === void 0 ? {} : { sessionId },
						...workspace === void 0 ? {} : {
							workspaceId: String(workspace.workspaceId),
							workspaceLabel: workspace.title
						},
						t: translate
					};
				}
			}, MnemonSettingsCard));
			const active = /* @__PURE__ */ new Map();
			const reconcile = () => {
				const value = interactionSettings.getSnapshot().value;
				for (const key of Object.keys(INTERACTION_UNITS)) {
					const unit = INTERACTION_UNITS[key];
					const enabled = unit.enabled(value);
					if (enabled && !active.has(key)) active.set(key, ctx.slots.inject(unit.slot, () => unit.register(ctx, namespace, translate, settings)));
					else if (!enabled && active.has(key)) {
						active.get(key)();
						active.delete(key);
					}
				}
			};
			ctx.effect(() => {
				const unsubscribe = interactionSettings.subscribe(reconcile);
				reconcile();
				return () => {
					unsubscribe();
					for (const dispose of [...active.values()].reverse()) dispose();
					active.clear();
				};
			}, "dsh-mnemon: interaction surfaces");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
