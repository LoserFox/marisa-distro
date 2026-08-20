window.__ModuleLoader__.load({
	id: "dsh-llm-fallbacks",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
		//#endregion
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.production.js
		/**
		* @license React
		* use-sync-external-store-shim.production.js
		*
		* Copyright (c) Meta Platforms, Inc. and affiliates.
		*
		* This source code is licensed under the MIT license found in the
		* LICENSE file in the root directory of this source tree.
		*/
		var require_use_sync_external_store_shim_production = /* @__PURE__ */ __commonJSMin(((exports) => {
			var React$1 = require("react");
			function is(x, y) {
				return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
			}
			var objectIs = "function" === typeof Object.is ? Object.is : is;
			var useState = React$1.useState;
			var useEffect = React$1.useEffect;
			var useLayoutEffect = React$1.useLayoutEffect;
			var useDebugValue = React$1.useDebugValue;
			function useSyncExternalStore$2(subscribe, getSnapshot) {
				var value = getSnapshot(), _useState = useState({ inst: {
					value,
					getSnapshot
				} }), inst = _useState[0].inst, forceUpdate = _useState[1];
				useLayoutEffect(function() {
					inst.value = value;
					inst.getSnapshot = getSnapshot;
					checkIfSnapshotChanged(inst) && forceUpdate({ inst });
				}, [
					subscribe,
					value,
					getSnapshot
				]);
				useEffect(function() {
					checkIfSnapshotChanged(inst) && forceUpdate({ inst });
					return subscribe(function() {
						checkIfSnapshotChanged(inst) && forceUpdate({ inst });
					});
				}, [subscribe]);
				useDebugValue(value);
				return value;
			}
			function checkIfSnapshotChanged(inst) {
				var latestGetSnapshot = inst.getSnapshot;
				inst = inst.value;
				try {
					var nextValue = latestGetSnapshot();
					return !objectIs(inst, nextValue);
				} catch (error) {
					return !0;
				}
			}
			function useSyncExternalStore$1(subscribe, getSnapshot) {
				return getSnapshot();
			}
			var shim = "undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement ? useSyncExternalStore$1 : useSyncExternalStore$2;
			exports.useSyncExternalStore = void 0 !== React$1.useSyncExternalStore ? React$1.useSyncExternalStore : shim;
		}));
		//#endregion
		//#region node_modules/use-sync-external-store/shim/index.js
		var require_shim = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			module.exports = require_use_sync_external_store_shim_production();
		}));
		//#endregion
		//#region node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js
		/**
		* @license React
		* use-sync-external-store-shim/with-selector.production.js
		*
		* Copyright (c) Meta Platforms, Inc. and affiliates.
		*
		* This source code is licensed under the MIT license found in the
		* LICENSE file in the root directory of this source tree.
		*/
		var require_with_selector_production = /* @__PURE__ */ __commonJSMin(((exports) => {
			var React = require("react");
			var shim = require_shim();
			function is(x, y) {
				return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
			}
			var objectIs = "function" === typeof Object.is ? Object.is : is;
			var useSyncExternalStore = shim.useSyncExternalStore;
			var useRef = React.useRef;
			var useEffect = React.useEffect;
			var useMemo = React.useMemo;
			var useDebugValue = React.useDebugValue;
			exports.useSyncExternalStoreWithSelector = function(subscribe, getSnapshot, getServerSnapshot, selector, isEqual) {
				var instRef = useRef(null);
				if (null === instRef.current) {
					var inst = {
						hasValue: !1,
						value: null
					};
					instRef.current = inst;
				} else inst = instRef.current;
				instRef = useMemo(function() {
					function memoizedSelector(nextSnapshot) {
						if (!hasMemo) {
							hasMemo = !0;
							memoizedSnapshot = nextSnapshot;
							nextSnapshot = selector(nextSnapshot);
							if (void 0 !== isEqual && inst.hasValue) {
								var currentSelection = inst.value;
								if (isEqual(currentSelection, nextSnapshot)) return memoizedSelection = currentSelection;
							}
							return memoizedSelection = nextSnapshot;
						}
						currentSelection = memoizedSelection;
						if (objectIs(memoizedSnapshot, nextSnapshot)) return currentSelection;
						var nextSelection = selector(nextSnapshot);
						if (void 0 !== isEqual && isEqual(currentSelection, nextSelection)) return memoizedSnapshot = nextSnapshot, currentSelection;
						memoizedSnapshot = nextSnapshot;
						return memoizedSelection = nextSelection;
					}
					var hasMemo = !1, memoizedSnapshot, memoizedSelection, maybeGetServerSnapshot = void 0 === getServerSnapshot ? null : getServerSnapshot;
					return [function() {
						return memoizedSelector(getSnapshot());
					}, null === maybeGetServerSnapshot ? void 0 : function() {
						return memoizedSelector(maybeGetServerSnapshot());
					}];
				}, [
					getSnapshot,
					getServerSnapshot,
					selector,
					isEqual
				]);
				var value = useSyncExternalStore(subscribe, instRef[0], instRef[1]);
				useEffect(function() {
					inst.hasValue = !0;
					inst.value = value;
				}, [value]);
				useDebugValue(value);
				return value;
			};
		}));
		//#endregion
		//#region src/client/use-snapshot.ts
		var import_with_selector = (/* @__PURE__ */ __commonJSMin(((exports, module) => {
			module.exports = require_with_selector_production();
		})))();
		/**
		* Bind a bare observable source to a typed uSES selector hook.
		* subscribe/getSnapshot are captured once per source into stable closures
		* (also re-binds `this` for method-based sources), so components never
		* resubscribe across renders. Equality defaults to Object.is.
		* @param w - snapshot source (engine store, Session object, store instance).
		* @returns the selector hook.
		*/
		function bindSnapshotSelector(w) {
			const subscribe = (fn) => w.subscribe(fn);
			const getSnapshot = () => w.getSnapshot();
			return function useSelector(sel, eq) {
				return (0, import_with_selector.useSyncExternalStoreWithSelector)(subscribe, getSnapshot, void 0, sel, eq);
			};
		}
		//#endregion
		//#region src/selectors.ts
		/** Catchable error for illegal/unknown selectors (config-warning path). */
		var SelectorError = class extends Error {
			constructor(message) {
				super(message);
				this.name = "SelectorError";
			}
		};
		/**
		* Parse a chain key or entry selector.
		*
		* Accepts `provider/model` and `provider/*`; throws {@link SelectorError}
		* on anything else (missing separator, empty parts, wildcard inside the
		* model segment).
		*/
		function parseSelector(input) {
			if (typeof input !== "string") throw new SelectorError(`invalid selector ${String(input)}: expected "provider/model" or "provider/*"`);
			const trimmed = input.trim();
			const slash = trimmed.indexOf("/");
			if (slash <= 0 || slash === trimmed.length - 1) throw new SelectorError(`invalid selector "${input}": expected "provider/model" or "provider/*"`);
			const provider = trimmed.slice(0, slash).trim();
			const modelPart = trimmed.slice(slash + 1).trim();
			if (!provider || !modelPart) throw new SelectorError(`invalid selector "${input}": empty provider or model`);
			if (modelPart !== "*" && modelPart.includes("*")) throw new SelectorError(`invalid selector "${input}": unexpected wildcard in model`);
			return {
				provider,
				model: modelPart === "*" ? void 0 : modelPart,
				raw: trimmed
			};
		}
		/**
		* Frozen preset windows (UTC+8). `liang-*` presets have NO day mask (they
		* apply every day, weekends included); `glm-peak` is Monday–Friday only.
		* The two valleys are `complement: true` of their peak.
		*/
		const PRESETS = {
			"liang-peak": {
				windows: [{
					start: "09:00",
					end: "12:00"
				}, {
					start: "14:00",
					end: "18:00"
				}],
				complement: false,
				label: "Liang Peak"
			},
			"liang-valley": {
				windows: [{
					start: "09:00",
					end: "12:00"
				}, {
					start: "14:00",
					end: "18:00"
				}],
				complement: true,
				label: "Liang Valley"
			},
			"glm-peak": {
				windows: [{
					start: "14:00",
					end: "18:00",
					days: [
						1,
						2,
						3,
						4,
						5
					]
				}],
				complement: false,
				label: "GLM Peak"
			},
			"glm-valley": {
				windows: [{
					start: "14:00",
					end: "18:00",
					days: [
						1,
						2,
						3,
						4,
						5
					]
				}],
				complement: true,
				label: "GLM Valley"
			}
		};
		const HHMM_RE$1 = /^([01]\d|2[0-3]):[0-5]\d$/;
		const WEEKDAY_INDEX = {
			Sun: 0,
			Mon: 1,
			Tue: 2,
			Wed: 3,
			Thu: 4,
			Fri: 5,
			Sat: 6
		};
		/** Malformed rows warn once per row INSTANCE (config snapshots are stable
		* across requests — this is what keeps "warn once" from becoming spam). */
		const warnedMalformedRows = /* @__PURE__ */ new WeakSet();
		/** Invalid `tz` values warn once per distinct value. */
		const warnedTimeZones = /* @__PURE__ */ new Set();
		function warnMalformed(row, reason) {
			if (typeof row !== "object" || row === null) {
				console.warn(`llm-fallbacks: skipping malformed time-slot row (${reason})`);
				return;
			}
			if (warnedMalformedRows.has(row)) return;
			warnedMalformedRows.add(row);
			console.warn(`llm-fallbacks: skipping malformed time-slot row (${reason}): ${JSON.stringify(row)}`);
		}
		/** Wall-clock weekday (0=Sunday) + minutes-since-midnight of `now` in `tz`
		* (standard `Intl` timezone rules, DST-safe). */
		function wallClock(now, tz) {
			try {
				const parts = new Intl.DateTimeFormat("en-US", {
					timeZone: tz,
					weekday: "short",
					hour: "2-digit",
					minute: "2-digit",
					hourCycle: "h23"
				}).formatToParts(now);
				let weekday = 0;
				let minutes = 0;
				for (const part of parts) if (part.type === "weekday") weekday = WEEKDAY_INDEX[part.value] ?? 0;
				else if (part.type === "hour") minutes += Number(part.value) * 60;
				else if (part.type === "minute") minutes += Number(part.value);
				return {
					weekday,
					minutes
				};
			} catch (error) {
				if (!warnedTimeZones.has(tz)) {
					warnedTimeZones.add(tz);
					console.warn(`llm-fallbacks: invalid timezone "${tz}" (${error.message}) — slot matching falls back to UTC`);
				}
				return {
					weekday: now.getUTCDay(),
					minutes: now.getUTCHours() * 60 + now.getUTCMinutes()
				};
			}
		}
		/** `HH:mm` → minutes-since-midnight (inputs are regex-validated or frozen
		* constants — this never sees garbage). */
		function minutesOf(hhmm) {
			const [hour, minute] = hhmm.split(":").map(Number);
			return hour * 60 + minute;
		}
		/** P4 containment rule: day mask matches AND the window contains `t`
		* (`end` exclusive; `start > end` wraps midnight — custom rows only). */
		function containsWindow(window, clock) {
			if (!(window.days === void 0 || window.days.length === 0 || window.days.includes(clock.weekday))) return false;
			const start = minutesOf(window.start);
			const end = minutesOf(window.end);
			return start <= end ? start <= clock.minutes && clock.minutes < end : start <= clock.minutes || clock.minutes < end;
		}
		function matchesAnyWindow(windows, clock) {
			return windows.some((window) => containsWindow(window, clock));
		}
		/** Validate one stored row → frozen windows, or `undefined` (warn once +
		* skip). Preset rows reject stored windows/day masks (P4); custom rows
		* require strict `HH:mm` bounds; chains must be non-empty. */
		function describeRow(row) {
			if (!Array.isArray(row.chain) || row.chain.length === 0) {
				warnMalformed(row, "empty chain");
				return;
			}
			if (row.kind === "preset") {
				const preset = row.preset;
				if (typeof preset !== "string" || !Object.hasOwn(PRESETS, preset)) {
					warnMalformed(row, `unknown preset ${JSON.stringify(preset)}`);
					return;
				}
				if (row.start !== void 0 || row.end !== void 0 || row.days !== void 0 && row.days.length > 0) {
					warnMalformed(row, `preset windows are fixed — row "${preset}" cannot carry start/end/days`);
					return;
				}
				return PRESETS[preset];
			}
			if (row.kind === "custom") {
				const { start, end } = row;
				if (typeof start !== "string" || typeof end !== "string" || !HHMM_RE$1.test(start) || !HHMM_RE$1.test(end)) {
					warnMalformed(row, `invalid custom window ${JSON.stringify(start)}-${JSON.stringify(end)} (expected HH:mm)`);
					return;
				}
				return {
					windows: [{
						start,
						end,
						days: row.days
					}],
					complement: false
				};
			}
			warnMalformed(row, `unknown kind ${JSON.stringify(row.kind)}`);
		}
		/** Display label for a winning row (preset rows use the frozen label;
		* custom rows prefer their display name, falling back to the window). */
		function labelOf(row) {
			if (row.kind === "preset" && typeof row.preset === "string" && Object.hasOwn(PRESETS, row.preset)) return PRESETS[row.preset].label;
			return row.name !== void 0 && row.name.trim() !== "" ? row.name : `custom ${row.start}-${row.end}`;
		}
		/**
		* All-day conformance (P6): the all-day chain is conforming when its LAST
		* entry (the tail — the card's 默认模型 panel) is exactly one official V4
		* model — Flash XOR Pro. Leading entries (the card's 默认降级链 block) are
		* the ordered walk before that last-resort fallback. An empty chain or a
		* chain whose tail is not an official V4 model keeps slot rows inert and
		* refuses the virtual-row override/delegate; the v0.2.2 failure walk over
		* the raw chain stays verbatim.
		*/
		function isAllDayConforming(chain) {
			if (chain.length < 1) return false;
			const tail = chain[chain.length - 1];
			return tail === "deepseek-official/deepseek-v4-flash" || tail === "deepseek-official/deepseek-v4-pro";
		}
		/**
		* Slot winner + display label (P5): drives 分时切换 detection (per-root-agent
		* last-winner marker, in-process only) and the card / `/fallbacks` status
		* strip. `winner` is the matching row or `'all-day'`; `label` names the
		* slot (frozen preset label or `custom HH:mm-HH:mm`).
		*
		* P6 gate (qc1 F-001): without a conforming all-day
		* (`isAllDayConforming(config.rootChain)`) the winner is ALWAYS `'all-day'`
		* — a legacy multi-model (or empty) chain earns no slot rows, so every
		* surface fed by this resolver reports the inert state and routing stays on
		* the raw `rootChain` (the v0.2.2 walk verbatim).
		*/
		function resolveSlotState(config, now, tz) {
			if (!isAllDayConforming(config.rootChain)) return {
				winner: "all-day",
				label: "all-day"
			};
			const clock = wallClock(now, tz);
			const seenPresets = /* @__PURE__ */ new Set();
			const rows = Array.isArray(config.timeSlots) ? config.timeSlots : [];
			for (const row of rows) {
				if (typeof row !== "object" || row === null) {
					warnMalformed(row, "row is not an object");
					continue;
				}
				if (row.kind === "preset" && typeof row.preset === "string") {
					if (seenPresets.has(row.preset)) {
						warnMalformed(row, `duplicate preset "${row.preset}" — only the first row takes effect`);
						continue;
					}
					seenPresets.add(row.preset);
				}
				const descriptor = describeRow(row);
				if (descriptor === void 0) continue;
				if (descriptor.complement ? !matchesAnyWindow(descriptor.windows, clock) : matchesAnyWindow(descriptor.windows, clock)) return {
					winner: row,
					label: labelOf(row)
				};
			}
			return {
				winner: "all-day",
				label: "all-day"
			};
		}
		//#endregion
		//#region src/config.ts
		/**
		* Spec §4 defaults — `Config({})` must equal this (no-op install).
		* `enabled` defaults to `false` (readme-settings spec §1.2): the feature
		* switch is off until the user turns it on in the settings page; an
		* unconfigured install (`enabled: false`, empty rootChain, empty roles)
		* behaves exactly like an uninstalled plugin (AC-3 / no-op invariant).
		*/
		const defaultFallbacksConfig = {
			enabled: false,
			triggerCodes: [
				"AUTH",
				"QUOTA",
				"RATE_LIMIT"
			],
			rootChain: [],
			roles: {
				list: [],
				rules: []
			},
			cooldownMs: 3e5,
			revertPolicy: "cooldown-expiry",
			maxSwitchesPerStep: 8,
			alwaysModeRetryCap: 5,
			presets: "bundled",
			roleAutoMatch: true,
			timeSlots: [],
			tz: "Asia/Shanghai"
		};
		/**
		* Reserved role id: legal as a rule target (`roles.rules[].role`) and as
		* the no-rule-match fallback, but FORBIDDEN in `roles.list[].id`.
		*/
		const INHERIT_ROLE_ID = "inherit";
		/** Role id format (aligned with yet-another-subagent `isValidProfileId`). */
		const ROLE_ID_PATTERN = /^[a-z0-9-]{1,32}$/;
		//#endregion
		//#region src/client/fallbacks-store.ts
		/** The plugin's settings namespace on the host wire (settings/document-updated ns filter). */
		const FALLBACKS_SETTINGS_NS = "fallbacks";
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/**
		* Read a nested value by path — the upstream `dsh-client-schema-form`
		* `getPath` semantics, copied locally so the provider-configured join needs no
		* new dependency (array indexes as numeric keys, `undefined` along a missing
		* branch).
		*/
		function getPath(value, path) {
			let current = value;
			for (const key of path) {
				if (Array.isArray(current)) {
					current = current[Number(key)];
					continue;
				}
				if (typeof current !== "object" || current === null) return void 0;
				current = current[key];
			}
			return current;
		}
		/**
		* Shape-guard the wire `seeds` badge field (spec §9.4): only `{ id,
		* overridden }` entries survive — the `legacyKeys` element-filter
		* precedent. A non-array value resolves to `[]`; malformed entries are
		* dropped, so an all-bad array also lands `[]`. The store never trusts a
		* misshapen badge field.
		*/
		function parseSeedsWire(value) {
			if (!Array.isArray(value)) return [];
			return value.filter((entry) => {
				if (!isRecord(entry)) return false;
				return typeof entry.id === "string" && typeof entry.overridden === "boolean";
			});
		}
		/** Seed-default persona from a revert-seed wire body (issue #59). */
		function revertOutcomePersona(value) {
			if (value === null || typeof value !== "object" || !("outcome" in value)) return void 0;
			const outcome = value.outcome;
			if (outcome === null || typeof outcome !== "object") return void 0;
			if (!("reverted" in outcome) || outcome.reverted !== true) return void 0;
			if (!("persona" in outcome) || typeof outcome.persona !== "string") return void 0;
			return outcome.persona;
		}
		/**
		* The provider dropdown's offer set (spec §2.5 D-4): catalog providers whose
		* settings profile resolves in the describe namespaces — the Models page's
		* `configured` predicate (`ui-models` store.ts): a provider is configured
		* when its settings namespace exists AND either it addresses the whole
		* section (`settingsPath` empty) or its profile path resolves in the resolved
		* value. Directory-only (unconfigured) providers never become options; the
		* section still renders existing values for them (read-back + annotation) so
		* nothing is lost on save.
		*/
		function configuredProvidersOf(providers, namespaces) {
			return providers.filter((entry) => {
				const namespace = namespaces.get(entry.settingsNs);
				return namespace !== void 0 && (entry.settingsPath.length === 0 || getPath(namespace.value, entry.settingsPath) !== void 0);
			});
		}
		/**
		* Fold the redacted descriptor value into a complete {@link FallbacksConfig}:
		* missing optional fields take spec §4 defaults; gross type mismatches throw
		* so the UI can surface a broken descriptor instead of mis-rendering.
		*/
		function parseFallbacksConfig(value) {
			if (!isRecord(value)) throw new TypeError(`fallbacks descriptor value is not an object: ${String(value)}`);
			const triggerCodes = value.triggerCodes;
			if (triggerCodes !== void 0 && (!Array.isArray(triggerCodes) || triggerCodes.some((code) => typeof code !== "string"))) throw new TypeError("fallbacks descriptor triggerCodes must be a string array");
			const rootChain = value.rootChain;
			if (rootChain !== void 0 && (!Array.isArray(rootChain) || rootChain.some((entry) => typeof entry !== "string"))) throw new TypeError("fallbacks descriptor rootChain must be a string array");
			const roles = isRecord(value.roles) ? value.roles : {};
			const parsedList = (Array.isArray(roles.list) ? roles.list : []).map((role, index) => {
				if (!isRecord(role) || typeof role.id !== "string") throw new TypeError(`fallbacks descriptor roles.list[${String(index)}] must have a string id`);
				const persona = role.persona;
				if (persona !== void 0 && typeof persona !== "string") throw new TypeError(`fallbacks descriptor roles.list[${String(index)}].persona must be a string`);
				const prompt = role.prompt;
				if (prompt !== void 0 && typeof prompt !== "string") throw new TypeError(`fallbacks descriptor roles.list[${String(index)}].prompt must be a string`);
				const permissions = role.permissions;
				if (permissions !== void 0 && (!isRecord(permissions) || permissions.allow !== void 0 && (!Array.isArray(permissions.allow) || permissions.allow.some((item) => typeof item !== "string")) || permissions.deny !== void 0 && (!Array.isArray(permissions.deny) || permissions.deny.some((item) => typeof item !== "string")))) throw new TypeError(`fallbacks descriptor roles.list[${String(index)}].permissions must be an allow/deny string-array object`);
				const chain = role.chain;
				if (chain !== void 0 && (!Array.isArray(chain) || chain.some((entry) => typeof entry !== "string"))) throw new TypeError(`fallbacks descriptor roles.list[${String(index)}].chain must be a string array`);
				const fallback = role.fallback;
				if (fallback !== void 0 && fallback !== "inherit-root" && fallback !== "none") throw new TypeError(`fallbacks descriptor roles.list[${String(index)}].fallback must be inherit-root|none`);
				return {
					id: role.id,
					persona: persona ?? "",
					...prompt === void 0 ? {} : { prompt },
					...permissions === void 0 ? {} : { permissions },
					chain: chain ?? [],
					fallback: fallback ?? "inherit-root"
				};
			});
			const parsedRules = (Array.isArray(roles.rules) ? roles.rules : []).map((rule, index) => {
				if (!isRecord(rule) || typeof rule.role !== "string") throw new TypeError(`fallbacks descriptor roles.rules[${String(index)}] must have a string role`);
				const origin = rule.origin;
				if (origin !== void 0 && origin !== "root" && origin !== "subagent") throw new TypeError(`fallbacks descriptor roles.rules[${String(index)}].origin must be root|subagent`);
				const provider = rule.provider;
				const model = rule.model;
				if (provider !== void 0 && typeof provider !== "string") throw new TypeError(`fallbacks descriptor roles.rules[${String(index)}].provider must be a string`);
				if (model !== void 0 && typeof model !== "string") throw new TypeError(`fallbacks descriptor roles.rules[${String(index)}].model must be a string`);
				return {
					...origin === void 0 ? {} : { origin },
					...provider === void 0 ? {} : { provider },
					...model === void 0 ? {} : { model },
					role: rule.role
				};
			});
			const cooldownMs = value.cooldownMs;
			const maxSwitchesPerStep = value.maxSwitchesPerStep;
			const alwaysModeRetryCap = value.alwaysModeRetryCap;
			for (const [field, raw] of [
				["cooldownMs", cooldownMs],
				["maxSwitchesPerStep", maxSwitchesPerStep],
				["alwaysModeRetryCap", alwaysModeRetryCap]
			]) if (raw !== void 0 && typeof raw !== "number") throw new TypeError(`fallbacks descriptor ${field} must be a number`);
			const revertPolicy = value.revertPolicy;
			if (revertPolicy !== void 0 && revertPolicy !== "cooldown-expiry" && revertPolicy !== "never") throw new TypeError("fallbacks descriptor revertPolicy must be cooldown-expiry|never");
			const presets = value.presets;
			if (presets !== void 0 && presets !== "bundled" && presets !== "none") throw new TypeError("fallbacks descriptor presets must be bundled|none");
			const enabled = value.enabled;
			if (enabled !== void 0 && typeof enabled !== "boolean") throw new TypeError("fallbacks descriptor enabled must be a boolean");
			const roleAutoMatch = value.roleAutoMatch;
			if (roleAutoMatch !== void 0 && typeof roleAutoMatch !== "boolean") throw new TypeError("fallbacks descriptor roleAutoMatch must be a boolean");
			const timeSlots = value.timeSlots;
			if (timeSlots !== void 0 && (!Array.isArray(timeSlots) || timeSlots.some((row) => {
				if (!isRecord(row)) return true;
				for (const field of [
					"kind",
					"preset",
					"start",
					"end"
				]) if (row[field] !== void 0 && typeof row[field] !== "string") return true;
				const chain = row.chain;
				if (chain !== void 0 && (!Array.isArray(chain) || chain.some((entry) => typeof entry !== "string"))) return true;
				const days = row.days;
				if (days !== void 0 && (!Array.isArray(days) || days.some((day) => typeof day !== "number"))) return true;
				return false;
			}))) throw new TypeError("fallbacks descriptor timeSlots must be an array of slot rows (kind/preset/start/end strings, chain string array, days number array)");
			const tz = value.tz;
			if (tz !== void 0 && typeof tz !== "string") throw new TypeError("fallbacks descriptor tz must be a string");
			return {
				enabled: enabled ?? defaultFallbacksConfig.enabled,
				triggerCodes: triggerCodes ?? [...defaultFallbacksConfig.triggerCodes],
				rootChain: rootChain ?? [...defaultFallbacksConfig.rootChain],
				roles: {
					list: parsedList,
					rules: parsedRules
				},
				cooldownMs: cooldownMs ?? defaultFallbacksConfig.cooldownMs,
				revertPolicy: revertPolicy ?? defaultFallbacksConfig.revertPolicy,
				maxSwitchesPerStep: maxSwitchesPerStep ?? defaultFallbacksConfig.maxSwitchesPerStep,
				alwaysModeRetryCap: alwaysModeRetryCap ?? defaultFallbacksConfig.alwaysModeRetryCap,
				presets: presets ?? defaultFallbacksConfig.presets,
				roleAutoMatch: roleAutoMatch ?? defaultFallbacksConfig.roleAutoMatch,
				timeSlots: timeSlots ?? [...defaultFallbacksConfig.timeSlots ?? []],
				tz: tz ?? defaultFallbacksConfig.tz
			};
		}
		/** The raw selector string a selection serializes to ('' when empty). */
		function selectionToRaw(selection) {
			return selection === null ? "" : selection.kind === "catalog" ? selection.id : selection.raw;
		}
		/**
		* Classify a raw provider value against the catalog: a catalog route id is a
		* catalog selection, anything else is an outside value kept verbatim.
		*/
		function classifyProvider(raw, catalog) {
			if (raw === "") return null;
			if (catalog !== void 0 && catalog.providers.some((entry) => entry.provider === raw)) return {
				kind: "catalog",
				id: raw
			};
			return {
				kind: "outside",
				raw
			};
		}
		/**
		* Classify a raw model value under its provider against the catalog: a model
		* id advertised by that provider is a catalog selection, anything else is an
		* outside value kept verbatim.
		*/
		function classifyModel(provider, raw, catalog) {
			if (raw === "") return null;
			if (catalog !== void 0 && catalog.groups.some((group) => group.id === provider && group.models.some((model) => model.id === raw))) return {
				kind: "catalog",
				id: raw
			};
			return {
				kind: "outside",
				raw
			};
		}
		/**
		* Extract the most recent `fallbacks/switch` events from one history page
		* (spec §2.5 D-5): filter by event type, order by `seq` descending, take at
		* most `limit`. Single-page read — fewer than `limit` events show as-is; no
		* multi-page backfill (Non-Goal).
		*/
		function extractRecentSwitches(entries, limit = 5) {
			const switches = [];
			for (const entry of entries) {
				const event = entry.event;
				if (event.type !== "fallbacks/switch") continue;
				switches.push({
					...event.data,
					seq: event.seq,
					time: event.time
				});
			}
			switches.sort((a, b) => b.seq - a.seq);
			return switches.slice(0, limit);
		}
		/** Serialize one selector row to its wire string (`provider/model` | `provider/*`). */
		function selectorRowToRaw(row) {
			const provider = selectionToRaw(row.provider);
			if (provider === "") return "";
			if (row.wildcard) return `${provider}/*`;
			const model = selectionToRaw(row.model);
			return model === "" ? provider : `${provider}/${model}`;
		}
		/** Parse one entry line into a selector row, classifying against the catalog. */
		function entryToSelectorRow(entry, catalog) {
			try {
				const selector = parseSelector(entry);
				return {
					wildcard: selector.model === void 0,
					provider: classifyProvider(selector.provider, catalog),
					model: selector.model === void 0 ? null : classifyModel(selector.provider, selector.model, catalog)
				};
			} catch {
				return {
					wildcard: false,
					provider: {
						kind: "outside",
						raw: entry.trim()
					},
					model: null
				};
			}
		}
		/** Project the rootChain entries into editable rows (one flat chain row). */
		function rootChainToRows(rootChain, catalog) {
			return [{ selectors: rootChain.map((entry) => entryToSelectorRow(entry, catalog)) }];
		}
		/** Rebuild the rootChain from edited rows; rows with no usable selector drop out. */
		function rowsToRootChain(rows) {
			const entries = [];
			for (const row of rows) {
				if (row.selectors.length === 0) continue;
				for (const selector of row.selectors) {
					const raw = selectorRowToRaw(selector);
					if (raw !== "") entries.push(raw);
				}
			}
			return entries;
		}
		/** Project the time-slot rows into editable rows (chain selectors classified). */
		function timeSlotsToRows(timeSlots, catalog) {
			return timeSlots.map((row) => ({
				kind: row.kind,
				...row.preset === void 0 ? {} : { preset: row.preset },
				start: row.start ?? "",
				end: row.end ?? "",
				days: [...row.days ?? []],
				name: row.name ?? "",
				collapsed: true,
				selectors: (row.chain ?? []).map((entry) => entryToSelectorRow(entry, catalog))
			}));
		}
		/** Rebuild the time-slot rows from edited rows; blank selectors drop out.
		* `kind` rides verbatim (a hand-written unknown kind reads back unchanged;
		* save validation rejects it) — the cast asserts the trusted editor shape.
		* `days` is ALWAYS serialized ([] included): schemastery composes absent
		* array fields as `[]`, so the composed config every card load accepts
		* carries `days` on every row — the draft must too, or a clean card would
		* read back dirty. */
		function rowsToTimeSlots(rows) {
			return rows.map((row) => {
				const chain = row.selectors.map(selectorRowToRaw).filter((entry) => entry !== "");
				if (row.kind === "preset") return {
					kind: "preset",
					preset: row.preset,
					days: row.days,
					chain
				};
				return {
					kind: row.kind,
					...row.preset === void 0 ? {} : { preset: row.preset },
					start: row.start,
					end: row.end,
					days: row.days,
					...row.name === "" ? {} : { name: row.name },
					chain
				};
			});
		}
		/** Project the declared roles into editable rows (chain selectors classified). */
		function rolesToRows(roles, catalog) {
			return roles.map((role) => ({
				id: role.id,
				persona: role.persona,
				selectors: (role.chain ?? []).map((entry) => entryToSelectorRow(entry, catalog)),
				fallback: role.fallback ?? "inherit-root",
				collapsed: true
			}));
		}
		/** Rebuild the declared roles from edited rows; empty selectors drop out. */
		function rowsToRoles(rows) {
			return rows.map((row) => ({
				id: row.id.trim(),
				persona: row.persona,
				chain: row.selectors.map(selectorRowToRaw).filter((entry) => entry !== ""),
				fallback: row.fallback
			}));
		}
		/**
		* Rebuild the declared roles from edited rows, re-attaching the
		* schema-reserved `prompt`/`permissions` fields from the last accepted
		* config by role id — they never round-trip through rows this round, so
		* without the merge a save would silently drop them (T2 reviewer minor
		* #2). The id trim matches {@link rowsToRoles}; a row whose id matches no
		* original role (a freshly added one) keeps no extras. Key order mirrors
		* `parseFallbacksConfig` so a clean draft's JSON dirty comparison never
		* flags it.
		*/
		function mergeRoleExtras(rows, originalRoles) {
			const originalById = new Map(originalRoles.map((role) => [role.id, role]));
			return rowsToRoles(rows).map((role) => {
				const original = originalById.get(role.id);
				if (original === void 0) return role;
				return {
					id: role.id,
					persona: role.persona,
					...original.prompt === void 0 ? {} : { prompt: original.prompt },
					...original.permissions === void 0 ? {} : { permissions: original.permissions },
					chain: role.chain,
					fallback: role.fallback
				};
			});
		}
		/**
		* The `roles.rules` role dropdown's offer set — the ONLY data source for the
		* rule rows' role selector: the built-in `'inherit'` target plus every
		* declared `roles.list` id, in declaration order (a role added/removed on
		* the same page is reflected immediately).
		*/
		function ruleRoleOptions(roles) {
			return [INHERIT_ROLE_ID, ...new Set(roles.list.map((role) => role.id.trim()))];
		}
		/** Project the role rules into editable rows (provider/model classified). */
		function rulesToRows(rules, catalog) {
			return rules.map((rule) => ({
				provider: classifyProvider(rule.provider ?? "", catalog),
				model: classifyModel(rule.provider ?? "", rule.model ?? "", catalog),
				role: rule.role
			}));
		}
		/** Rebuild the role rules from edited rows; empty provider/model drop out. */
		function rowsToRules(rows) {
			return rows.map((row) => ({
				...row.provider === null ? {} : { provider: selectionToRaw(row.provider) },
				...row.model === null ? {} : { model: selectionToRaw(row.model) },
				role: row.role.trim()
			})).filter((rule) => rule.role !== "");
		}
		/** Controller joining Settings reads, writes, and pushed invalidations. */
		var FallbacksSettingsController = class {
			api;
			rpc;
			/** Snapshot consumed by the section through `useSyncExternalStore`. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({
				status: "idle",
				error: null,
				writable: false,
				config: defaultFallbacksConfig,
				present: false,
				legacyKeys: [],
				seeds: [],
				catalogStatus: "idle",
				catalogError: null,
				providers: [],
				configuredProviders: [],
				groups: [],
				catalogEpoch: 0,
				switchesStatus: "idle",
				switchesError: null,
				switches: []
			});
			/** Read guard: a newer load() supersedes an older one's publish. */
			readGeneration = 0;
			/**
			* Write guard: save()/resetToDefaults() completions ALWAYS publish unless
			* dispose() invalidated them — an overlapping read must never discard a
			* successful write's accept() (audit F1).
			*/
			writeGeneration = 0;
			catalogGeneration = 0;
			switchesGeneration = 0;
			/** Every settings namespace from the last describe, keyed by ns — the configured-provider join's other input. */
			namespaces = /* @__PURE__ */ new Map();
			currentSession;
			/**
			* @param api - Settings / Llm / Sessions wire faces (describe `writable` +
			*   namespace directory, provider/model catalog, session history).
			* @param rpc - the connection's generic RPC caller for the host gateway
			*   channel (`/api`), injected from the connection handle.
			*/
			constructor(api, rpc) {
				this.api = api;
				this.rpc = rpc;
			}
			/**
			* Refresh the page snapshot. Latest request wins. `settings.describe`
			* still runs — it supplies the top-level `writable` flag (host read-only
			* mode) and the namespace directory (the configured-provider join's other
			* input) — but the fallbacks config itself rides the gateway channel:
			* `rpc.call('/api', 'fallbacks/get', { args: {} })`. The two reads are
			* independent and run in PARALLEL (Promise.all — one round trip per
			* refresh, not two). The `fallbacks` namespace is NOT expected in describe
			* anymore (it is off the apiproxy boundary post-patch); a describe failure
			* remains a hard `error` (the form cannot render provider/model options
			* without the directory), while a get failure is NOT a page error —
			* `present` goes false and the section keeps the usable skeleton (KD-G5).
			* @returns nothing; {@link store} carries success or failure.
			*/
			async load() {
				const generation = ++this.readGeneration;
				const writeGenerationAtStart = this.writeGeneration;
				this.store.update((state) => {
					state.status = "loading";
					state.error = null;
				});
				try {
					const [describeResult, getResult] = await Promise.all([this.api.settings.describe({}), this.rpc.call("/api", "fallbacks/get", { args: {} }).catch(() => void 0)]);
					if (generation !== this.readGeneration) return;
					if (writeGenerationAtStart !== this.writeGeneration) return;
					if (!describeResult.result.ok) throw describeResult.result.error;
					this.namespaces = new Map(describeResult.result.value.namespaces.map((entry) => [entry.ns, entry]));
					const writable = describeResult.result.value.writable;
					let config;
					let legacyKeys = [];
					let seeds = [];
					if (getResult !== void 0 && getResult.ok && getResult.value !== null && typeof getResult.value === "object") {
						if ("config" in getResult.value) config = getResult.value.config;
						if ("legacyKeys" in getResult.value) {
							const wireLegacyKeys = getResult.value.legacyKeys;
							if (Array.isArray(wireLegacyKeys)) legacyKeys = wireLegacyKeys.filter((key) => typeof key === "string");
						}
						if ("seeds" in getResult.value) seeds = parseSeedsWire(getResult.value.seeds);
					}
					this.accept(config, writable, legacyKeys, seeds);
				} catch (error) {
					if (generation !== this.readGeneration) return;
					if (writeGenerationAtStart !== this.writeGeneration) return;
					this.fail(error);
				}
			}
			/**
			* Refresh the provider/model catalog (`llm.providers` + `llm.models`), an
			* independent read path with its own generation guard so it can run
			* parallel to {@link load} without clobbering it (spec §2.5 D-4).
			* Per-provider lookup failures ride `catalogError` as a diagnostic without
			* failing the sound groups; a whole-load failure lands `catalogStatus:
			* 'error'` and never blocks the rest of the form.
			* @returns nothing; {@link store} carries success or failure.
			*/
			async loadCatalog() {
				const generation = ++this.catalogGeneration;
				this.store.update((state) => {
					state.catalogStatus = "loading";
					state.catalogError = null;
				});
				try {
					const [providersResponse, modelsResponse] = await Promise.all([this.api.llm.providers({}), this.api.llm.models({})]);
					if (generation !== this.catalogGeneration) return;
					if (!providersResponse.result.ok) throw providersResponse.result.error;
					if (!modelsResponse.result.ok) throw modelsResponse.result.error;
					const providers = providersResponse.result.value.providers;
					const groups = modelsResponse.result.value.groups;
					const failures = modelsResponse.result.value.failures;
					this.store.update((state) => {
						state.catalogStatus = "ready";
						state.catalogError = failures.length > 0 ? failures.map((failure) => `${failure.name}: ${failure.message}`).join("; ") : null;
						state.providers = providers;
						state.configuredProviders = configuredProvidersOf(providers, this.namespaces);
						state.groups = groups;
						state.catalogEpoch += 1;
					});
				} catch (error) {
					if (generation !== this.catalogGeneration) return;
					const wire = error;
					this.store.update((state) => {
						state.catalogStatus = "error";
						state.catalogError = typeof wire?.message === "string" ? wire.message : messageOf(error);
					});
				}
			}
			/**
			* Record the current session the status block reads (spec §2.5 D-5). Once
			* the block has been read once, its summary follows session switches
			* immediately; an idle block only records the id — the section's mount
			* effect performs the first read.
			* @param sessionId - the session whose history is summarized; undefined
			*   (no current session) resolves to the empty state.
			*/
			setCurrentSession(sessionId) {
				if (sessionId === this.currentSession) return;
				this.currentSession = sessionId;
				if (this.store.getSnapshot().switchesStatus !== "idle") this.loadSwitches();
			}
			/**
			* Read the recent-switch summary for the current session (spec §2.5 D-5):
			* one `sessions.history` page (`maxMessages` = {@link SWITCHES_HISTORY_PAGE}),
			* `fallbacks/switch` events extracted newest-first capped at
			* {@link RECENT_SWITCH_LIMIT}. No current session → honest empty ready
			* state (no RPC); a read failure lands `switchesStatus: 'error'` and never
			* touches the settings state (the form keeps editing/saving normally).
			* @returns nothing; {@link store} carries success or failure.
			*/
			async loadSwitches() {
				const generation = ++this.switchesGeneration;
				const sessionId = this.currentSession;
				if (sessionId === void 0) {
					this.store.update((state) => {
						state.switchesStatus = "ready";
						state.switchesError = null;
						state.switches = [];
					});
					return;
				}
				this.store.update((state) => {
					state.switchesStatus = "loading";
					state.switchesError = null;
				});
				try {
					const response = await this.api.sessions.history({
						sessionId,
						maxMessages: 50
					});
					if (generation !== this.switchesGeneration) return;
					if (!response.result.ok) throw response.result.error;
					const switches = extractRecentSwitches(response.result.value.events);
					this.store.update((state) => {
						state.switchesStatus = "ready";
						state.switchesError = null;
						state.switches = switches;
					});
				} catch (error) {
					if (generation !== this.switchesGeneration) return;
					const wire = error;
					this.store.update((state) => {
						state.switchesStatus = "error";
						state.switchesError = typeof wire?.message === "string" ? wire.message : messageOf(error);
					});
				}
			}
			/**
			* Persist the full edited configuration through the gateway channel
			* (`/api/fallbacks/set`). The full config is sent as a MERGE patch (guide
			* §9) — keys the new schema cannot express (legacy `chains` /
			* `roles.default` in the user layer) survive the write, which is why the
			* gateway returns POST-WRITE `legacyKeys` and the banner stays honest
			* (W-1/F-1). The merge has no revision guard: any failure (business
			* rejection or transport) surfaces its message in `state.error` for the
			* section's error banner and the form stays editable for retry (KD-G3).
			* @param next - the complete edited configuration.
			*/
			async save(next) {
				const state = this.store.getSnapshot();
				if (!state.writable || state.status === "saving") return;
				const generation = ++this.writeGeneration;
				this.store.update((draft) => {
					draft.status = "saving";
					draft.error = null;
				});
				try {
					const result = await this.rpc.call("/api", "fallbacks/set", { args: { patch: next } });
					if (generation !== this.writeGeneration) return;
					if (!result.ok) throw result.error;
					const value = result.value;
					const config = value !== null && typeof value === "object" && "config" in value ? value.config : void 0;
					let legacyKeys = this.store.getSnapshot().legacyKeys;
					if (value !== null && typeof value === "object" && "legacyKeys" in value) {
						const wireLegacyKeys = value.legacyKeys;
						if (Array.isArray(wireLegacyKeys)) legacyKeys = wireLegacyKeys.filter((key) => typeof key === "string");
					}
					let seeds = this.store.getSnapshot().seeds;
					if (value !== null && typeof value === "object" && "seeds" in value) {
						const wireSeeds = value.seeds;
						if (Array.isArray(wireSeeds)) seeds = parseSeedsWire(wireSeeds);
					}
					this.accept(config, true, legacyKeys, seeds);
				} catch (error) {
					if (generation !== this.writeGeneration) return;
					this.fail(error);
				}
			}
			/**
			* Reset to composition defaults through the gateway channel
			* (`/api/fallbacks/reset` — the fallbacks-specific third method; the host
			* clears the user layer via `settings.replace(ns, {})`, the removal path a
			* merge cannot express). Same error handling as {@link save} (KD-G3).
			*/
			async resetToDefaults() {
				const state = this.store.getSnapshot();
				if (!state.writable || state.status === "saving") return;
				const generation = ++this.writeGeneration;
				this.store.update((draft) => {
					draft.status = "saving";
					draft.error = null;
				});
				try {
					const result = await this.rpc.call("/api", "fallbacks/reset", { args: {} });
					if (generation !== this.writeGeneration) return;
					if (!result.ok) throw result.error;
					const value = result.value;
					const config = value !== null && typeof value === "object" && "config" in value ? value.config : void 0;
					let legacyKeys = this.store.getSnapshot().legacyKeys;
					if (value !== null && typeof value === "object" && "legacyKeys" in value) {
						const wireLegacyKeys = value.legacyKeys;
						if (Array.isArray(wireLegacyKeys)) legacyKeys = wireLegacyKeys.filter((key) => typeof key === "string");
					}
					let seeds = this.store.getSnapshot().seeds;
					if (value !== null && typeof value === "object" && "seeds" in value) {
						const wireSeeds = value.seeds;
						if (Array.isArray(wireSeeds)) seeds = parseSeedsWire(wireSeeds);
					}
					this.accept(config, true, legacyKeys, seeds);
				} catch (error) {
					if (generation !== this.writeGeneration) return;
					this.fail(error);
				}
			}
			/**
			* Revert one seeded role to its CURRENT declared seed default (spec §9.4,
			* AC-3) through the gateway channel (`/api/fallbacks/revert-seed`). Same
			* write guards as {@link save} — writable / saving / write-generation —
			* and the same KD-G3 error handling: any business rejection or transport
			* failure surfaces its message in `state.error` for the error banner and
			* the form stays editable for retry. A business `{ reverted: false,
			* reason }` outcome is still a successful RPC — the post-write read
			* result (config / legacyKeys / seeds) lands either way, and the revert
			* button stays disabled while the write is in flight.
			*
			* Returns the seed-default persona when the outcome is `{ reverted:
			* true, persona }` — including the persist no-op (persisted already
			* equals the seed). The card applies that string to the row's **draft**
			* so an unsaved persona edit still snaps back (issue #59).
			* @param id - the seeded role id; the host matches it by trimmed id
			*   against the seed registry (spec §9.3).
			*/
			async revertSeed(id) {
				const state = this.store.getSnapshot();
				if (!state.writable || state.status === "saving") return void 0;
				const generation = ++this.writeGeneration;
				this.store.update((draft) => {
					draft.status = "saving";
					draft.error = null;
				});
				try {
					const result = await this.rpc.call("/api", "fallbacks/revert-seed", { args: { id } });
					if (generation !== this.writeGeneration) return void 0;
					if (!result.ok) throw result.error;
					const value = result.value;
					const config = value !== null && typeof value === "object" && "config" in value ? value.config : void 0;
					let legacyKeys = this.store.getSnapshot().legacyKeys;
					if (value !== null && typeof value === "object" && "legacyKeys" in value) {
						const wireLegacyKeys = value.legacyKeys;
						if (Array.isArray(wireLegacyKeys)) legacyKeys = wireLegacyKeys.filter((key) => typeof key === "string");
					}
					let seeds = this.store.getSnapshot().seeds;
					if (value !== null && typeof value === "object" && "seeds" in value) {
						const wireSeeds = value.seeds;
						if (Array.isArray(wireSeeds)) seeds = parseSeedsWire(wireSeeds);
					}
					this.accept(config, true, legacyKeys, seeds);
					return revertOutcomePersona(value);
				} catch (error) {
					if (generation !== this.writeGeneration) return void 0;
					this.fail(error);
					return;
				}
			}
			/** Stop in-flight responses from publishing after plugin disposal. */
			dispose() {
				this.readGeneration += 1;
				this.writeGeneration += 1;
				this.catalogGeneration += 1;
				this.switchesGeneration += 1;
				this.namespaces = /* @__PURE__ */ new Map();
			}
			/**
			* Publish a settled load: `status` ready, `writable` from describe, and —
			* only when the gateway returned a REAL config — `present` true and
			* `state.config` replaced with the parsed value. A get that did not
			* resolve (`config === undefined`) lands `present` false and keeps the
			* last accepted config (the defaults skeleton on a first load) — the
			* draft seed invariant (I-1): a transient channel-down must never seed
			* the form with defaults over real server truth. `legacyKeys` rides the
			* same publish: the wire field drives the migration banner. save/reset
			* pass the POST-WRITE value (W-1/F-1) — or the previous value when the
			* response omits the field, so a write can never clear the banner
			* against server truth; only a real `get` may. `seeds` (spec §9.4)
			* follows the same honest rule: the wire badge field is authoritative
			* only when a real config resolved — a transient channel-down keeps the
			* last accepted badge state.
			*/
			accept(config, writable, legacyKeys, seeds) {
				const parsed = config === void 0 ? void 0 : parseFallbacksConfig(config);
				this.store.update((state) => {
					state.status = "ready";
					state.error = null;
					state.writable = writable;
					state.present = parsed !== void 0;
					state.legacyKeys = parsed === void 0 ? state.legacyKeys : legacyKeys;
					state.seeds = parsed === void 0 ? state.seeds : seeds;
					if (parsed !== void 0) state.config = parsed;
					state.configuredProviders = configuredProvidersOf(state.providers, this.namespaces);
				});
			}
			fail(error) {
				const wire = error;
				this.store.update((state) => {
					state.status = "error";
					state.error = typeof wire?.message === "string" ? wire.message : messageOf(error);
				});
			}
		};
		/**
		* Refetch after reconnect / settings change only when the section has already
		* opened once.
		* @param controller - the fallbacks settings controller.
		*/
		function refreshFallbacksIfLoaded(controller) {
			if (controller.store.getSnapshot().status === "idle") return;
			controller.load();
		}
		/**
		* Refetch the catalog after `llm/adapters-updated` only when it has already
		* been opened once (the catalog twin of {@link refreshFallbacksIfLoaded}).
		* @param controller - the fallbacks settings controller.
		*/
		function refreshCatalogIfLoaded(controller) {
			if (controller.store.getSnapshot().catalogStatus === "idle") return;
			controller.loadCatalog();
		}
		/**
		* Refetch the recent-switch summary after `settings/document-updated`
		* (fallbacks ns) / `connection/reset` only when the status block has already
		* been read once
		* (the switches twin of {@link refreshFallbacksIfLoaded}).
		* @param controller - the fallbacks settings controller.
		*/
		function refreshSwitchesIfLoaded(controller) {
			if (controller.store.getSnapshot().switchesStatus === "idle") return;
			controller.loadSwitches();
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Fallbacks settings section dictionaries (zh source of truth) plus the
		* `fallbacks` LocaleNamespaceMap merge — the registration's `locale:` seat
		* (`PropsLocale<'fallbacks'>` puts the typed `t` on the section props).
		*
		* Label conventions follow spec §4 用户直观性: enumerable config values
		* (triggerCodes / revertPolicy) render readable labels, never raw enum
		* strings.
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"title": "Fallbacks",
			"intro": "模型故障自动降级",
			"collapse": "收起设置",
			"expand": "展开设置",
			"unsaved": "未保存",
			"discard": "放弃修改",
			"retry": "重试",
			"readOnly": "当前环境中的设置为只读。",
			"enabled.label": "启用故障降级",
			"enabled.hint": "关闭后插件完全不介入",
			"enabled.tooltip": "关闭后插件完全不介入；开启但未配置 rootChain 时行为与未安装插件一致。",
			"enabled.off": "功能未开启：打开 enabled 开关以显示配置界面。",
			"triggerCodes.label": "触发失败码",
			"triggerCodes.hint": "命中这些失败码时进入降级决策",
			"triggerCodes.tooltip": "命中这些失败码时进入降级链决策；可重试型故障（如 5xx）由 llm-retry 先行退避，预算耗尽后同样进入决策。",
			"triggerCodes.RATE_LIMIT": "限流（429）",
			"triggerCodes.QUOTA": "配额超限",
			"triggerCodes.AUTH": "权限/认证失败",
			"triggerCodes.extra": "此外还保留了 {codes} 等自定义失败码。",
			"revertPolicy.label": "冷却结束后",
			"revertPolicy.cooldown-expiry": "冷却到期后回主模型",
			"revertPolicy.never": "保持备用模型（会话内不回）",
			"revertPolicy.hint": "冷却到期后是否回主模型",
			"revertPolicy.tooltip": "被切换离的模型在冷却期内不再入选；到期后按此策略决定是否回主。",
			"cooldownMs.label": "冷却时长（毫秒）",
			"cooldownMs.hint": "冷却期内模型不再入选",
			"cooldownMs.tooltip": "被切离/失败的模型在冷却期内不再入选。",
			"maxSwitchesPerStep.label": "单步最大切换次数",
			"maxSwitchesPerStep.hint": "超过后停止切换",
			"maxSwitchesPerStep.tooltip": "超过后停止切换，以原始错误语义结束当前步，防止链循环放大延迟。",
			"alwaysModeRetryCap.label": "always 模式重试上限",
			"alwaysModeRetryCap.hint": "达到上限次数后切换；0 表示禁用",
			"alwaysModeRetryCap.tooltip": "retryPolicy 为 always 的模型在同一请求内重试达到该次数后切换；0 表示禁用。",
			"advanced.label": "高级选项",
			"advanced.expand": "展开高级选项",
			"advanced.collapse": "收起高级选项",
			"roleAutoMatch.label": "启用角色自动匹配",
			"roleAutoMatch.hint": "规则未命中时，由模型自选最贴近的已声明角色",
			"roleAutoMatch.tooltip": "规则未命中时，模型会自动从已声明角色（id + persona）中选择最匹配者并注入该角色的链；关闭后未命中规则时按现状回落（inherit / rootChain）。",
			"rootChain.label": "默认降级链",
			"rootChain.tooltip": "未命中任何分时槽时先走这条降级链；全部失败后落到下面的默认模型。",
			"defaultModel.label": "默认模型",
			"chains.selector.remove": "删除该选择器",
			"chains.selector.providerPlaceholder": "选择 provider",
			"chains.selector.modelPlaceholder": "选择 model",
			"chains.selector.wildcardLegacy": "该条目为通配（provider/*）：选择具体模型后将转为精确条目",
			"chains.selector.noModelsStrict": "该 provider 暂无可用模型（目录查询失败），请改选其他 provider。",
			"mainAgent.label": "主代理",
			"subagents.label": "子代理",
			"timeSlots.label": "分时槽设置",
			"timeSlots.hint": "自上而下第一条命中生效；全时段行固定最后",
			"timeSlots.tz.label": "时区（UTC±）",
			"timeSlots.drag": "拖拽排序（或使用上下按钮）",
			"timeSlots.name": "名称",
			"timeSlots.expand": "展开该行",
			"timeSlots.collapse": "收起该行",
			"timeSlots.tooltip": "命中行的模型链成为 root 生效链（取代全时段链）；未命中任何行时使用全时段链。分时切换是路由种子而非失败决策：不消耗冷却、不计入单步切换上限。",
			"timeSlots.addPreset": "添加预设",
			"timeSlots.addCustom": "添加自定义时段",
			"timeSlots.presetPlaceholder": "选择预设",
			"timeSlots.remove": "删除该时段行",
			"timeSlots.moveUp": "上移该时段行",
			"timeSlots.moveDown": "下移该时段行",
			"timeSlots.start": "开始（HH:mm）",
			"timeSlots.end": "结束（HH:mm）",
			"timeSlots.days": "星期",
			"timeSlots.days.hint": "不勾选 = 每天；可跨午夜",
			"timeSlots.preset.name": "预设",
			"timeSlots.preset.windowLabel": "时段（只读）",
			"timeSlots.preset.chainsOnly": "预设窗口已锁定：仅可编辑模型链",
			"timeSlots.preset.liang-peak.label": "梁文峰",
			"timeSlots.preset.liang-peak.window": "09:00–12:00 与 14:00–18:00（每天，UTC+8）",
			"timeSlots.preset.liang-valley.label": "梁文谷",
			"timeSlots.preset.liang-valley.window": "Liang Peak 之外的所有时间（每天，UTC+8）",
			"timeSlots.preset.glm-peak.label": "GLM峰",
			"timeSlots.preset.glm-peak.window": "周一至周五 14:00–18:00（UTC+8）",
			"timeSlots.preset.glm-valley.label": "GLM谷",
			"timeSlots.preset.glm-valley.window": "GLM Peak 之外的所有时间（UTC+8）",
			"timeSlots.preset.glm.note": "仅配置了 zai-coding-cn 时有效",
			"timeSlots.preset.highCost": "高消耗",
			"timeSlots.preset.multiplier": "x{n}",
			"timeSlots.active": "激活",
			"timeSlots.preset.glm.unconfigured": "（需配置 zai-coding-cn）",
			"timeSlots.day.sun": "日",
			"timeSlots.day.mon": "一",
			"timeSlots.day.tue": "二",
			"timeSlots.day.wed": "三",
			"timeSlots.day.thu": "四",
			"timeSlots.day.fri": "五",
			"timeSlots.day.sat": "六",
			"timeSlots.selector.add": "添加选择器",
			"allDay.hint": "全天链的最后一档兜底：官方 V4 Flash 或 V4 Pro 二选一",
			"allDay.flash": "官方 V4 Flash（deepseek-official/deepseek-v4-flash）",
			"allDay.pro": "官方 V4 Pro（deepseek-official/deepseek-v4-pro）",
			"allDay.nonconforming": "当前默认模型不合法：请选择官方 V4 Flash 或 V4 Pro 后保存",
			"roles.list.label": "角色实体",
			"roles.list.hint": "先声明角色，规则才能引用",
			"roles.list.tooltip": "角色 id 须匹配 /^[a-z0-9-]{1,32}$/ 且唯一；\"inherit\" 为保留字，不能用作角色 id。",
			"roles.id": "id",
			"roles.id.hint": "小写字母/数字/连字符，1–32 字符",
			"roles.idPlaceholder": "例如 reviewer",
			"roles.persona": "人格提示",
			"roles.personaPlaceholder": "例如：你是资深代码审查员",
			"roles.seedDefault": "seed 默认",
			"roles.seedOverride": "seed 覆盖",
			"roles.revertPersona": "还原 Seed 默认",
			"roles.seedChainOptional": "角色 \"{id}\" 为 seed 角色：链可留空，保存不会被拦截",
			"roles.fallback": "链拼接策略",
			"roles.fallback.inherit-root": "继承 root（角色链后追加 rootChain）",
			"roles.fallback.none": "仅角色链（不追加 rootChain）",
			"roles.add": "添加角色",
			"roles.remove": "删除该角色",
			"roles.expand": "展开该角色",
			"roles.collapse": "收起该角色",
			"roles.selector.add": "添加选择器",
			"roles.rules": "角色规则",
			"roles.rules.hint": "仅对子代理生效：顺序匹配 provider/model，未命中 → inherit（root 链）",
			"roles.rules.tooltip": "规则仅对子代理生效（root 请求不匹配规则）：命中后走对应角色的链；未命中走内置 inherit（rootChain）。",
			"roles.rule.provider": "provider",
			"roles.rule.provider.any": "任意",
			"roles.rule.model": "model",
			"roles.rule.model.any": "任意",
			"roles.rule.role": "角色",
			"roles.rule.role.inherit": "inherit（内置：root 链）",
			"roles.rule.roleSelectPlaceholder": "选择角色",
			"roles.rule.roleUndeclared.short": "（未声明）",
			"roles.addRule": "添加规则",
			"roles.removeRule": "删除该规则",
			"validation.blocked": "配置校验未通过，保存被拦截：",
			"validation.roleIdFormat": "角色 id \"{id}\" 不符合格式 /^[a-z0-9-]{1,32}$/",
			"validation.roleIdReserved": "\"inherit\" 为保留角色 id，不能用于角色实体",
			"validation.roleIdDuplicate": "角色 id \"{id}\" 重复",
			"validation.ruleRoleUndeclared": "规则引用了未声明的角色 \"{role}\"",
			"validation.ruleRoleRequired": "规则未选择角色：请选择目标角色，或删除该行",
			"validation.roleChainRequired": "角色 \"{id}\" 未配置模型：请至少添加一条链选择器（模型配置）",
			"validation.allDayRequired": "默认模型必须二选一：官方 V4 Flash 或 V4 Pro",
			"validation.slotChainRequired": "分时槽未配置模型：请至少添加一条链选择器",
			"validation.slotWindow": "分时槽开始/结束时间须为 HH:mm 格式",
			"validation.slotDays": "星期取值须为 0–6 的整数",
			"validation.slotKind": "分时槽 kind 须为 \"preset\" 或 \"custom\"",
			"validation.slotPresetUnknown": "未知的分时槽预设 \"{preset}\"",
			"validation.slotPresetDuplicate": "预设 \"{preset}\" 已存在：每个预设只能添加一行",
			"validation.slotPresetFrozen": "预设窗口是冻结代码常量：预设行不能携带 start/end/days",
			"validation.selector": "选择器 \"{entry}\" 非法：{message}",
			"legacy.banner": "检测到旧格式配置字段（{keys}）：已按新模型展示，请按 docs/configuration.md 迁移表手工改写；插件不会自动改写配置。",
			"catalog.empty": "暂无可用模型：请先在模型页添加模型，添加后此处将自动可选。",
			"catalog.error": "模型目录读取失败：{message}",
			"catalog.partial": "部分 provider 模型查询失败：{message}",
			"catalog.outside.hint": "目录外，可保留原值",
			"catalog.outside.tooltip": "不在当前模型目录，可保留原值并保存；新增条目仅可从目录选择。",
			"catalog.outside.short": " （目录外）",
			"catalog.unconfigured.short": " （未配置）",
			"status.title": "运行状态（只读）",
			"status.switches.label": "最近切换：",
			"status.switches.empty": "本会话暂无 fallback 切换。",
			"status.switches.error": "切换历史读取失败：{message}",
			"status.switches.compact": "最近 {count} 次 · {from} → {to}（{role} · {reason}）",
			"status.switches.compact.roleInject": "最近 {count} 次 · {role} → {to}（{reason}）",
			"status.switches.reason.trigger-code": "触发失败码",
			"status.switches.reason.always-cap": "always 模式上限",
			"status.switches.reason.role-inject": "角色注入",
			"general.title": "模型故障降级",
			"general.enabled": "已启用",
			"general.disabled": "未启用",
			"general.unknown": "未知",
			"general.unavailable": "状态通道暂不可达",
			"general.switch": "最近切换：{from} → {to}（{role} · {reason}）",
			"general.switch.roleInject": "最近切换：{role} → {to}（{reason}）",
			"general.switch.empty": "本会话暂无切换",
			"general.error": "状态读取失败：{message}",
			"chat.switch.title": "模型已降级",
			"chat.switch.summary": "{from} → {to}（{reason}）",
			"chat.switch.summary.roleInject": "（{reason}）",
			"chat.switch.roleMap": "{role} → {model}",
			"defaults.prefix": "默认值",
			"save": "保存",
			"save.saving": "保存中…",
			"save.error": "保存失败：{message}",
			"close": "关闭",
			"loading": "加载中…",
			"unavailable": "fallbacks 配置通道暂不可达：以下显示默认配置（或上次读取值），可尝试保存；保存失败会在此处如实提示。",
			"error.generic": "出错：{message}"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"title": "Fallbacks",
			"intro": "Automatic fallback on model failures",
			"collapse": "Hide settings",
			"expand": "Show settings",
			"unsaved": "Unsaved",
			"discard": "Discard",
			"retry": "Retry",
			"readOnly": "Settings are read-only in this environment.",
			"enabled.label": "Enable failure fallback",
			"enabled.hint": "Plugin never intervenes when off",
			"enabled.tooltip": "When off the plugin never intervenes; when on with no rootChain configured behavior is identical to an uninstalled plugin.",
			"enabled.off": "Feature disabled: turn on the enabled switch to show the configuration interface.",
			"triggerCodes.label": "Trigger failure codes",
			"triggerCodes.hint": "Failures with these codes enter fallback decision",
			"triggerCodes.tooltip": "Failures with these codes enter chain decision; retryable failures (e.g. 5xx) back off via llm-retry first and reach the decision only when its budget is exhausted.",
			"triggerCodes.RATE_LIMIT": "Rate limit (429)",
			"triggerCodes.QUOTA": "Quota exceeded",
			"triggerCodes.AUTH": "Auth / permission failure",
			"triggerCodes.extra": "Custom codes are preserved: {codes}.",
			"revertPolicy.label": "After cooldown",
			"revertPolicy.cooldown-expiry": "Return to the primary model",
			"revertPolicy.never": "Keep the fallback model (until session end)",
			"revertPolicy.hint": "Whether to return to the primary model after cooldown",
			"revertPolicy.tooltip": "A model switched away from stays out of candidacy during its cooldown; this policy decides whether it returns afterwards.",
			"cooldownMs.label": "Cooldown (milliseconds)",
			"cooldownMs.hint": "Models stay out of candidacy during cooldown",
			"cooldownMs.tooltip": "Switched-away or failed models stay out of candidacy during the cooldown window.",
			"maxSwitchesPerStep.label": "Max switches per step",
			"maxSwitchesPerStep.hint": "Stops switching beyond the cap",
			"maxSwitchesPerStep.tooltip": "Beyond this the step stops switching and ends with the original error semantics, preventing chain loops from amplifying latency.",
			"alwaysModeRetryCap.label": "Always-mode retry cap",
			"alwaysModeRetryCap.hint": "Switches after the cap; 0 disables",
			"alwaysModeRetryCap.tooltip": "Models whose retryPolicy is always switch after this many retries within one request; 0 disables.",
			"advanced.label": "Advanced options",
			"advanced.expand": "Show advanced options",
			"advanced.collapse": "Hide advanced options",
			"roleAutoMatch.label": "Enable role auto-match",
			"roleAutoMatch.hint": "On rules-miss, the model picks the closest declared role",
			"roleAutoMatch.tooltip": "When no rule matches, the model auto-selects the best-fit declared role (id + persona) and uses its chain; turn off to keep today's fallback (inherit / rootChain) on a rules-miss.",
			"rootChain.label": "Default fallback chain",
			"rootChain.tooltip": "Walked first whenever no time slot matches; if every entry fails, the default model below is the last fallback.",
			"defaultModel.label": "Default model",
			"chains.selector.remove": "Remove this selector",
			"chains.selector.providerPlaceholder": "Select provider",
			"chains.selector.modelPlaceholder": "Select model",
			"chains.selector.wildcardLegacy": "This entry is a wildcard (provider/*): picking a model converts it to an exact entry",
			"chains.selector.noModelsStrict": "No models available for this provider (catalog lookup failed); pick another provider.",
			"mainAgent.label": "Main agent",
			"subagents.label": "Subagents",
			"timeSlots.label": "Time slots",
			"timeSlots.hint": "First match from top to bottom wins; the all-day row is always last",
			"timeSlots.tz.label": "Timezone (UTC±)",
			"timeSlots.drag": "Drag to reorder (or use the up/down buttons)",
			"timeSlots.name": "Name",
			"timeSlots.expand": "Expand this row",
			"timeSlots.collapse": "Collapse this row",
			"timeSlots.tooltip": "A matched row's model chain becomes the effective root chain (replacing the all-day chain); no match uses the all-day chain. A time-slot switch is a routing seed, not a failure decision: it consumes no cooldown and does not count against the per-step switch cap.",
			"timeSlots.addPreset": "Add preset",
			"timeSlots.addCustom": "Add custom time slot",
			"timeSlots.presetPlaceholder": "Select a preset",
			"timeSlots.remove": "Remove this time-slot row",
			"timeSlots.moveUp": "Move this time-slot row up",
			"timeSlots.moveDown": "Move this time-slot row down",
			"timeSlots.start": "Start (HH:mm)",
			"timeSlots.end": "End (HH:mm)",
			"timeSlots.days": "Days",
			"timeSlots.days.hint": "None selected = every day; may wrap midnight",
			"timeSlots.preset.name": "Preset",
			"timeSlots.preset.windowLabel": "Window (read-only)",
			"timeSlots.preset.chainsOnly": "Preset windows are frozen: only the model chain is editable",
			"timeSlots.preset.liang-peak.label": "Liang Peak",
			"timeSlots.preset.liang-peak.window": "09:00–12:00 & 14:00–18:00 (every day, UTC+8)",
			"timeSlots.preset.liang-valley.label": "Liang Valley",
			"timeSlots.preset.liang-valley.window": "All times outside Liang Peak (every day, UTC+8)",
			"timeSlots.preset.glm-peak.label": "GLM Peak",
			"timeSlots.preset.glm-peak.window": "Monday–Friday 14:00–18:00 (UTC+8)",
			"timeSlots.preset.glm-valley.label": "GLM Valley",
			"timeSlots.preset.glm-valley.window": "All times outside GLM Peak (UTC+8)",
			"timeSlots.preset.glm.note": "Only effective when zai-coding-cn is configured",
			"timeSlots.preset.highCost": "High Cost",
			"timeSlots.preset.multiplier": "x{n}",
			"timeSlots.active": "Active",
			"timeSlots.preset.glm.unconfigured": " (requires zai-coding-cn)",
			"timeSlots.day.sun": "Sun",
			"timeSlots.day.mon": "Mon",
			"timeSlots.day.tue": "Tue",
			"timeSlots.day.wed": "Wed",
			"timeSlots.day.thu": "Thu",
			"timeSlots.day.fri": "Fri",
			"timeSlots.day.sat": "Sat",
			"timeSlots.selector.add": "Add selector",
			"allDay.hint": "Last-resort fallback of the all-day chain: official V4 Flash or Pro (pick exactly one)",
			"allDay.flash": "Official V4 Flash (deepseek-official/deepseek-v4-flash)",
			"allDay.pro": "Official V4 Pro (deepseek-official/deepseek-v4-pro)",
			"allDay.nonconforming": "The current default model is not valid: pick official V4 Flash or Pro before saving",
			"roles.list.label": "Declared roles",
			"roles.list.hint": "Declare roles before rules can reference them",
			"roles.list.tooltip": "Role ids must match /^[a-z0-9-]{1,32}$/ and be unique; \"inherit\" is reserved and cannot be used as a role id.",
			"roles.id": "ID",
			"roles.id.hint": "lowercase letters, digits, hyphens; 1–32 chars",
			"roles.idPlaceholder": "e.g. reviewer",
			"roles.persona": "Persona",
			"roles.personaPlaceholder": "e.g. you are a senior code reviewer",
			"roles.seedDefault": "Seed default",
			"roles.seedOverride": "Seed override",
			"roles.revertPersona": "Revert to seed default",
			"roles.seedChainOptional": "Role \"{id}\" is a seed role: the chain may stay empty",
			"roles.fallback": "Chain append",
			"roles.fallback.inherit-root": "Inherit root (append rootChain after the role chain)",
			"roles.fallback.none": "Role chain only (no rootChain)",
			"roles.add": "Add role",
			"roles.remove": "Remove this role",
			"roles.expand": "Expand this role",
			"roles.collapse": "Collapse this role",
			"roles.selector.add": "Add selector",
			"roles.rules": "Role rules",
			"roles.rules.hint": "Subagents only: matches provider/model in order; no match → inherit (root chain)",
			"roles.rules.tooltip": "Rules apply to subagents only (root requests never match): a matched rule uses that role's chain; no match uses the built-in inherit (rootChain).",
			"roles.rule.provider": "provider",
			"roles.rule.provider.any": "Any",
			"roles.rule.model": "model",
			"roles.rule.model.any": "Any",
			"roles.rule.role": "role",
			"roles.rule.role.inherit": "inherit (built-in: root chain)",
			"roles.rule.roleSelectPlaceholder": "Select role",
			"roles.rule.roleUndeclared.short": " (undeclared)",
			"roles.addRule": "Add rule",
			"roles.removeRule": "Remove this rule",
			"validation.blocked": "Configuration validation failed; save was blocked: ",
			"validation.roleIdFormat": "Role id \"{id}\" does not match /^[a-z0-9-]{1,32}$/",
			"validation.roleIdReserved": "\"inherit\" is a reserved role id and cannot be declared",
			"validation.roleIdDuplicate": "Duplicate role id \"{id}\"",
			"validation.ruleRoleUndeclared": "Rule references undeclared role \"{role}\"",
			"validation.ruleRoleRequired": "Rule has no role selected: pick a target role, or remove the row",
			"validation.roleChainRequired": "Role \"{id}\" has no model config: add at least one chain entry",
			"validation.allDayRequired": "The default model must be exactly one official V4 model (V4 Flash or V4 Pro)",
			"validation.slotChainRequired": "Time-slot row has no models: add at least one chain entry",
			"validation.slotWindow": "Time-slot start/end must use HH:mm format",
			"validation.slotDays": "Days must be integers 0–6",
			"validation.slotKind": "Time-slot kind must be \"preset\" or \"custom\"",
			"validation.slotPresetUnknown": "Unknown time-slot preset \"{preset}\"",
			"validation.slotPresetDuplicate": "Preset \"{preset}\" already exists: at most one row per preset",
			"validation.slotPresetFrozen": "Preset windows are frozen code constants: a preset row cannot carry start/end/days",
			"validation.selector": "Invalid selector \"{entry}\": {message}",
			"legacy.banner": "Legacy config fields detected ({keys}): now shown in the new model — rewrite them manually following the migration table in docs/configuration.md (the plugin will not rewrite them automatically).",
			"catalog.empty": "No models yet: add a model on the Models page first; options will appear here automatically.",
			"catalog.error": "Model catalog read failed: {message}",
			"catalog.partial": "Some provider model lookups failed: {message}",
			"catalog.outside.hint": "Outside catalog; the value can be kept",
			"catalog.outside.tooltip": "Not in the current model catalog; you can keep the original value and save it (new entries are restricted to the catalog).",
			"catalog.outside.short": " (outside catalog)",
			"catalog.unconfigured.short": " (not configured)",
			"status.title": "Runtime status (read-only)",
			"status.switches.label": "Recent switches: ",
			"status.switches.empty": "No fallback switches in this session yet.",
			"status.switches.error": "Switch history read failed: {message}",
			"status.switches.compact": "last {count} · {from} → {to} ({role} · {reason})",
			"status.switches.compact.roleInject": "last {count} · {role} → {to} ({reason})",
			"status.switches.reason.trigger-code": "trigger code",
			"status.switches.reason.always-cap": "always-mode cap",
			"status.switches.reason.role-inject": "role inject",
			"general.title": "Model failover",
			"general.enabled": "Enabled",
			"general.disabled": "Disabled",
			"general.unknown": "Unknown",
			"general.unavailable": "Status channel unavailable",
			"general.switch": "Last switch: {from} → {to} ({role} · {reason})",
			"general.switch.roleInject": "Last switch: {role} → {to} ({reason})",
			"general.switch.empty": "No switches this session",
			"general.error": "Status read failed: {message}",
			"chat.switch.title": "Model downgraded",
			"chat.switch.summary": "{from} → {to} ({reason})",
			"chat.switch.summary.roleInject": "({reason})",
			"chat.switch.roleMap": "{role} → {model}",
			"defaults.prefix": "Default",
			"save": "Save",
			"save.saving": "Saving…",
			"save.error": "Save failed: {message}",
			"close": "Close",
			"loading": "Loading…",
			"unavailable": "The fallbacks config channel is unreachable: showing the default configuration (or the last read value). You can try to save; failures will be reported here.",
			"error.generic": "Error: {message}"
		};
		/** The settings section's dictionary namespace. */
		const NS = "fallbacks";
		/**
		* Reason → locale key map for switch summaries (S-c; shared by the card's
		* status block, the General page status row, and the conversation node). All
		* reasons resolve from ONE key family (`status.switches.reason.*`) — the
		* shared reason vocabulary must not mix dictionary families (qc1 F-004). The
		* session log is durable and forward-compatible: a reason value outside the
		* current union (a newer plugin wrote it) renders raw instead of falling
		* into a binary else branch.
		*/
		const SWITCH_REASON_KEYS = {
			"trigger-code": "status.switches.reason.trigger-code",
			"always-cap": "status.switches.reason.always-cap",
			"role-inject": "status.switches.reason.role-inject"
		};
		/** Human-readable trigger-code labels (spec §4 用户直观性). */
		const TRIGGER_CODE_LABELS = {
			RATE_LIMIT: "triggerCodes.RATE_LIMIT",
			QUOTA: "triggerCodes.QUOTA",
			AUTH: "triggerCodes.AUTH"
		};
		/**
		* The known trigger codes the form toggles; unknown codes are preserved.
		* M-04: derived from the host defaults so the toggle set can never drift from
		* the decision set (`defaultFallbacksConfig.triggerCodes` is the single
		* source of truth; the labels mapping above stays keyed by code).
		*/
		const KNOWN_TRIGGER_CODES = [...defaultFallbacksConfig.triggerCodes];
		/** Toggle one known code's membership in `codes` (used by the form; pure). */
		function withTriggerCode(codes, code, present) {
			const next = new Set(codes);
			if (present) next.add(code);
			else next.delete(code);
			return [...next];
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/dsh-llm-fallbacks/dsh-llm-fallbacks/src/client/FallbacksCard.module.css.mjs
		const css$2 = "\n\n\n._8827595f_card {\n  list-style: none;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 12px;\n  background: var(--dsw-alias-bg-layer-3);\n  transition: border-color .16s, background .16s;\n}\n\n._8827595f_card:hover {\n  border-color: var(--dsw-alias-label-dimmed);\n}\n\n\n._06704203_cardOpen {\n  background: var(--dsw-alias-bg-layer-2);\n  border-color: var(--dsw-alias-label-dimmed);\n}\n\n\n._e488d460_header {\n  width: 100%;\n  appearance: none;\n  border: 0;\n  background: none;\n  font: inherit;\n  color: inherit;\n  text-align: left;\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 14px 16px;\n  border-radius: 12px;\n}\n\n._e488d460_header:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: -2px;\n}\n\n\n._f5dfe084_headText {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n._8d39bde6_name {\n  font-size: 15px;\n  font-weight: 600;\n  line-height: 1.4;\n  color: var(--dsw-alias-label-primary);\n}\n\n._346f3b69_description {\n  font-size: 13px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._631094a0_chevron {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  transition: transform .16s;\n}\n\n._44836ce8_chevronOpen {\n  transform: rotate(180deg);\n}\n\n\n._dbaa7975_body {\n  border-top: 1px solid var(--dsw-alias-border-l2);\n  margin: 0 16px;\n  padding-bottom: 8px;\n}\n\n._4e39cf17_readOnly {\n  margin: 12px 0 0;\n  font-size: 12px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n\n._99bf7f3c_pending {\n  flex: none;\n  border-radius: 999px;\n  padding: 1px 8px;\n  font-size: 11px;\n  line-height: 17px;\n  font-weight: 500;\n  white-space: nowrap;\n  background: var(--dsw-alias-bg-module-platform);\n  color: var(--dsw-alias-label-secondary);\n}\n\n\n\n\n._9860a5b1_notice {\n  margin: 12px 0 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-state-business-primary);\n}\n\n\n._5006d43e_legacyNotice {\n  margin: 12px 0 0;\n  padding: 10px 12px;\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-module-platform);\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-state-business-primary);\n}\n\n._21918751_error {\n  margin: 12px 0 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n\n._7cea4b2f_noticeRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin: 12px 0 0;\n}\n\n._7cea4b2f_noticeRow ._21918751_error {\n  flex: 1;\n  min-width: 0;\n  margin: 0;\n}\n\n\n._4058c747_form {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 12px 0 0;\n}\n\n\n._9998065c_checkboxRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n._02c2f6df_checkLabel {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  font-size: 14px;\n  line-height: 22px;\n  font-weight: 400;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n}\n\n._f2d47237_checkLabelTitle {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  font-weight: 400;\n}\n\n._c1bed8ea_checkLabelDesc {\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 400;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n\n._06389b18_checkbox {\n  flex: none;\n  width: 16px;\n  height: 16px;\n  margin: 0;\n  accent-color: var(--dsw-alias-brand-primary);\n  cursor: pointer;\n}\n\n._06389b18_checkbox:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n\n._94c91bfd_fieldset {\n  margin: 0;\n  padding: 0;\n  border: none;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n\n._67826267_field {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin: 0;\n  padding: 0;\n  border: none;\n  min-width: 0;\n}\n\n._13e68c3f_fieldLabel {\n  \n  display: inline-flex;\n  align-items: center;\n  gap: 10px;\n  padding: 0;\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n}\n\n\n._ba240d82_sectionHeading {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 4px 0;\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n\n._ddbc1b49_sectionHeadingText {\n  flex: 1;\n  min-width: 0;\n}\n\n\n._c41f9db7_sectionActions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-left: auto;\n}\n\n\n._b116c758_sectionToggle {\n  width: 100%;\n  appearance: none;\n  border: 0;\n  background: none;\n  font: inherit;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 4px 0;\n  cursor: pointer;\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n}\n\n._b116c758_sectionToggle:hover:not(:disabled) {\n  color: var(--dsw-alias-label-primary);\n}\n\n._b116c758_sectionToggle:disabled {\n  cursor: default;\n}\n\n._b116c758_sectionToggle:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 2px;\n  border-radius: 6px;\n}\n\n._a5313fdf_sectionToggleText {\n  flex: 1;\n  min-width: 0;\n  text-align: left;\n}\n\n._4bc809b8_hint {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._579f813a_defaultNote {\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 400;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n\n._b1962759_slotPresetName {\n  font-size: 14px;\n  line-height: 22px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary);\n}\n\n\n._a6244318_infoHint {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n  width: 16px;\n  height: 16px;\n  border-radius: 50%;\n  font-size: 14px;\n  line-height: 1;\n  color: var(--dsw-alias-label-tertiary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  cursor: help;\n  user-select: none;\n}\n\n._a6244318_infoHint:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n\n._e655c840_infoHintDisabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n\n._a2521bb0_optionRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 6px 8px;\n  border-radius: 6px;\n  font-size: 14px;\n  line-height: 22px;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n}\n\n._a2521bb0_optionRow:hover:has(input:not(:disabled)) {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n\n._06389b18_checkbox,\n._a2521bb0_optionRow input {\n  flex: none;\n  width: 16px;\n  height: 16px;\n  margin: 0;\n  accent-color: var(--dsw-alias-brand-primary);\n  cursor: pointer;\n}\n\n._06389b18_checkbox:focus-visible,\n._a2521bb0_optionRow input:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n._a2521bb0_optionRow input:disabled {\n  cursor: default;\n}\n\n\n._c4ecbdf3_dayRow {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n}\n\n._0330c1ed_dayCell {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  padding: 2px 6px;\n  border-radius: 6px;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n}\n\n._0330c1ed_dayCell:hover:has(input:not(:disabled)) {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n._0330c1ed_dayCell input {\n  flex: none;\n  width: 16px;\n  height: 16px;\n  margin: 0;\n  accent-color: var(--dsw-alias-brand-primary);\n  cursor: pointer;\n}\n\n._0330c1ed_dayCell input:disabled {\n  cursor: default;\n}\n\n._0330c1ed_dayCell input:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n\n._f9d86f7b_input {\n  box-sizing: border-box;\n  width: 100%;\n  height: 32px;\n  padding: 0 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  font: inherit;\n  font-size: 14px;\n  line-height: 22px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n}\n\n._f9d86f7b_input:focus {\n  outline: none;\n  border-color: var(--dsw-alias-brand-primary);\n}\n\n._f9d86f7b_input::placeholder {\n  color: var(--dsw-alias-label-dimmed);\n}\n\n._f9d86f7b_input:disabled {\n  opacity: 0.6;\n  cursor: default;\n}\n\n\n._3a9b42fd_inputTextarea {\n  height: auto;\n  min-height: 72px;\n  padding: 6px 10px;\n  resize: vertical;\n  line-height: 20px;\n}\n\n\n._7b60337a_inputInvalid,\n._7b60337a_inputInvalid:focus {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n\n\nselect._f9d86f7b_input {\n  max-width: 240px;\n  cursor: pointer;\n}\n\n\n._16eb7153_selectInput {\n  appearance: none;\n  padding-right: 32px;\n  \n  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");\n  background-repeat: no-repeat;\n  background-position: right 12px center;\n  background-size: 12px 12px;\n}\n\n\n._3e95886d_numberFields {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));\n  gap: 8px;\n}\n\n._0cfb5881_list {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  margin-top: 4px;\n}\n\n\n._f5c620d6_editorCard {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  padding: 14px 16px;\n  border-radius: 12px;\n  background: var(--dsw-alias-bg-module-platform);\n}\n\n._224b1387_cardFoot {\n  display: flex;\n  justify-content: flex-end;\n}\n\n._8e220e07_ruleGrid {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n\n._24a12a2f_ruleCell {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 120px;\n  flex: 1;\n}\n\n\n._86bc52d2_collapseRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n}\n\n._a73efcc6_collapseToggle {\n  appearance: none;\n  border: 0;\n  background: none;\n  padding: 0;\n  cursor: pointer;\n  color: var(--dsw-alias-label-secondary);\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: 1;\n  min-width: 0;\n  font: inherit;\n  text-align: left;\n}\n\n._a73efcc6_collapseToggle:disabled {\n  cursor: default;\n}\n\n._af017718_collapseTitle {\n  \n  flex: none;\n  max-width: 55%;\n  min-width: 0;\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._2cabe603_collapseMeta {\n  \n  flex: none;\n  margin-left: auto;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n\n._7b04f727_slotTag {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  border-radius: 999px;\n  padding: 0 6px;\n  font-size: 11px;\n  line-height: 17px;\n  font-weight: 500;\n  white-space: nowrap;\n  border: 1px solid;\n}\n\n._c381e792_slotTagHighCost {\n  color: var(--dsw-alias-state-error-primary);\n  border-color: var(--dsw-alias-state-error-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);\n}\n\n._23bdb6fc_slotTagMultiplier {\n  color: var(--dsw-alias-state-warn-primary);\n  border-color: var(--dsw-alias-state-warn-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent);\n}\n\n._f000eed9_slotTagActive {\n  color: var(--dsw-alias-state-success-primary);\n  border-color: var(--dsw-alias-state-success-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);\n}\n\n\n._cd905ce5_dragHandle {\n  appearance: none;\n  border: 0;\n  background: none;\n  padding: 0;\n  cursor: grab;\n  color: var(--dsw-alias-label-tertiary);\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 20px;\n  height: 20px;\n  border-radius: 6px;\n  flex: none;\n}\n\n._cd905ce5_dragHandle:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n._cd905ce5_dragHandle:active {\n  cursor: grabbing;\n}\n\n._cd905ce5_dragHandle:disabled {\n  cursor: default;\n  opacity: 0.4;\n}\n\n._cd905ce5_dragHandle:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n._49f0c4f0_dragHandleIcon {\n  transform: rotate(90deg);\n}\n\n\n._fee63b7e_slotCardDragging {\n  opacity: 0.45;\n}\n\n._6f108491_slotCardOver {\n  outline: 1px dashed var(--dsw-alias-brand-primary);\n  outline-offset: 2px;\n}\n\n._1014c097_ruleCellLabel {\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n\n._15a12620_chainSelectors {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n._240cbbf8_selectorRow {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n\n._70effa64_iconButton {\n  position: relative;\n  box-sizing: border-box;\n  appearance: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  padding: 0;\n  border: 0;\n  border-radius: 6px;\n  background: none;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n}\n\n._70effa64_iconButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n._70effa64_iconButton:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n._70effa64_iconButton:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n._70effa64_iconButton::after {\n  content: attr(data-tip);\n  position: absolute;\n  bottom: calc(100% + 6px);\n  left: 50%;\n  transform: translateX(-50%);\n  padding: 3px 8px;\n  border-radius: 6px;\n  background: var(--dsw-alias-label-primary);\n  color: var(--dsw-alias-bg-layer-3);\n  font-size: 11px;\n  line-height: 17px;\n  white-space: nowrap;\n  opacity: 0;\n  pointer-events: none;\n  transition: opacity .12s;\n}\n\n._70effa64_iconButton:hover::after,\n._70effa64_iconButton:focus-visible::after {\n  opacity: 1;\n}\n\n\n._a0968257_iconButtonDanger:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover-danger);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n\n._28202c90_addButton {\n  align-self: flex-start;\n}\n\n\n._6a2bd54c_slotAddRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-top: 4px;\n  flex-wrap: wrap;\n}\n\n\n._4e77523e_rowActions {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n\n._747fd56d_primaryButton,\n._7e855445_secondaryButton {\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 4px;\n  height: 36px;\n  padding: 0 14px;\n  border: none;\n  border-radius: 18px;\n  font: inherit;\n  font-size: 14px;\n  line-height: 22px;\n  cursor: pointer;\n}\n\n._747fd56d_primaryButton {\n  background: var(--dsw-alias-button-primary-fill);\n  color: var(--dsw-alias-label-primary-foreground);\n}\n\n._747fd56d_primaryButton:hover:not(:disabled) {\n  background: var(--dsw-alias-button-primary-hover);\n}\n\n._7e855445_secondaryButton {\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n}\n\n._7e855445_secondaryButton:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover-solid);\n}\n\n._747fd56d_primaryButton:disabled,\n._7e855445_secondaryButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n._747fd56d_primaryButton:focus-visible,\n._7e855445_secondaryButton:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n\n._238d19be_sectionAction {\n  height: 28px;\n  padding: 0 12px;\n  border-radius: 14px;\n  font-size: 12px;\n  line-height: 18px;\n}\n\n\n._fbd045e0_statusBlock {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 12px 14px;\n  margin-top: 12px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 12px;\n}\n\n._d4f70367_statusTitle {\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n}\n\n\n._8ab300ed_statusLine {\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n._e8cedbf5_statusLineLabel {\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n}\n\n\n._b48dfcba_offNotice {\n  margin: 0;\n  padding: 12px;\n  border: 1px dashed var(--dsw-alias-border-l3);\n  border-radius: 8px;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary);\n  text-align: center;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  ._70effa64_iconButton::after {\n    transition: none;\n  }\n}\n";
		const tagId$2 = "dsh-llm-fallbacks/FallbacksCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-llm-fallbacks";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var FallbacksCard_module_css_default = {
			"card": "_8827595f_card",
			"cardOpen": "_06704203_cardOpen",
			"header": "_e488d460_header",
			"headText": "_f5dfe084_headText",
			"name": "_8d39bde6_name",
			"description": "_346f3b69_description",
			"chevron": "_631094a0_chevron",
			"chevronOpen": "_44836ce8_chevronOpen",
			"body": "_dbaa7975_body",
			"readOnly": "_4e39cf17_readOnly",
			"pending": "_99bf7f3c_pending",
			"notice": "_9860a5b1_notice",
			"legacyNotice": "_5006d43e_legacyNotice",
			"error": "_21918751_error",
			"noticeRow": "_7cea4b2f_noticeRow",
			"form": "_4058c747_form",
			"checkboxRow": "_9998065c_checkboxRow",
			"checkLabel": "_02c2f6df_checkLabel",
			"checkLabelTitle": "_f2d47237_checkLabelTitle",
			"checkLabelDesc": "_c1bed8ea_checkLabelDesc",
			"checkbox": "_06389b18_checkbox",
			"fieldset": "_94c91bfd_fieldset",
			"field": "_67826267_field",
			"fieldLabel": "_13e68c3f_fieldLabel",
			"sectionHeading": "_ba240d82_sectionHeading",
			"sectionHeadingText": "_ddbc1b49_sectionHeadingText",
			"sectionActions": "_c41f9db7_sectionActions",
			"sectionToggle": "_b116c758_sectionToggle",
			"sectionToggleText": "_a5313fdf_sectionToggleText",
			"hint": "_4bc809b8_hint",
			"defaultNote": "_579f813a_defaultNote",
			"slotPresetName": "_b1962759_slotPresetName",
			"infoHint": "_a6244318_infoHint",
			"infoHintDisabled": "_e655c840_infoHintDisabled",
			"optionRow": "_a2521bb0_optionRow",
			"dayRow": "_c4ecbdf3_dayRow",
			"dayCell": "_0330c1ed_dayCell",
			"input": "_f9d86f7b_input",
			"inputTextarea": "_3a9b42fd_inputTextarea",
			"inputInvalid": "_7b60337a_inputInvalid",
			"selectInput": "_16eb7153_selectInput",
			"numberFields": "_3e95886d_numberFields",
			"list": "_0cfb5881_list",
			"editorCard": "_f5c620d6_editorCard",
			"cardFoot": "_224b1387_cardFoot",
			"ruleGrid": "_8e220e07_ruleGrid",
			"ruleCell": "_24a12a2f_ruleCell",
			"collapseRow": "_86bc52d2_collapseRow",
			"collapseToggle": "_a73efcc6_collapseToggle",
			"collapseTitle": "_af017718_collapseTitle",
			"collapseMeta": "_2cabe603_collapseMeta",
			"slotTag": "_7b04f727_slotTag",
			"slotTagHighCost": "_c381e792_slotTagHighCost",
			"slotTagMultiplier": "_23bdb6fc_slotTagMultiplier",
			"slotTagActive": "_f000eed9_slotTagActive",
			"dragHandle": "_cd905ce5_dragHandle",
			"dragHandleIcon": "_49f0c4f0_dragHandleIcon",
			"slotCardDragging": "_fee63b7e_slotCardDragging",
			"slotCardOver": "_6f108491_slotCardOver",
			"ruleCellLabel": "_1014c097_ruleCellLabel",
			"chainSelectors": "_15a12620_chainSelectors",
			"selectorRow": "_240cbbf8_selectorRow",
			"iconButton": "_70effa64_iconButton",
			"iconButtonDanger": "_a0968257_iconButtonDanger",
			"addButton": "_28202c90_addButton",
			"slotAddRow": "_6a2bd54c_slotAddRow",
			"rowActions": "_4e77523e_rowActions",
			"primaryButton": "_747fd56d_primaryButton",
			"secondaryButton": "_7e855445_secondaryButton",
			"sectionAction": "_238d19be_sectionAction",
			"statusBlock": "_fbd045e0_statusBlock",
			"statusTitle": "_d4f70367_statusTitle",
			"statusLine": "_8ab300ed_statusLine",
			"statusLineLabel": "_e8cedbf5_statusLineLabel",
			"offNotice": "_b48dfcba_offNotice"
		};
		//#endregion
		//#region src/client/FallbacksCard.tsx
		/**
		* Fallbacks settings card — the `fallbacks` plugin card on the web settings
		* "插件配置" page (spec §4). Registered into the `settings.plugin.item` keyed
		* slot (key `fallbacks`, the settings namespace the card edits, alongside
		* the upstream bash/agent-loop/web-search cards and the advisor card, in
		* registration order); owner props are empty and all data flows
		* through {@link FallbacksSettingsController}.
		*
		* The card chrome replicates the upstream `PluginCard` contract (self-drawn:
		* the upstream client value face exports no reusable card): a collapsible
		* `<li>` whose header is a button stacking the plugin name over its
		* description, with a dirty "unsaved" pill and a rotating chevron
		* (`IconChevronDownOutline14` from ui-primitives — a CLIENT_EXTERNALS value
		* import), `aria-expanded`/`aria-label` like the upstream header; a divider
		* under the header; then the form content. PR #62 UX round 2: the card
		* footer is gone — each big section (主代理 / 子代理 / 高级选项) carries its
		* own Save/Discard actions beside its heading (高级选项: inside the expanded
		* body) and its own validation / save-error surface. PR #62 UX round 3:
		* each section's Save writes ONLY that section's fields — 主代理 owns
		* rootChain / timeSlots / tz (+ the card-level `enabled`), 子代理 owns
		* roles, 高级选项 owns the advanced scalars; the patch spreads the last
		* ACCEPTED config for every other section, so a 主代理 Save can never
		* ride along an unsaved 子代理 edit (and vice versa) — and validation /
		* the dirty gate apply per section too (a bad role id never blocks 主代理,
		* and only the saved section's Discard reverts that section's edits).
		* Save/discard disabled terms: save = `!sectionDirty || saving ||
		* !writable`, discard = `!sectionDirty || saving` (KD-U1). Disclosure is
		* card-local state:
		* which card a user has open is a reading gesture, and staged edits outlive
		* collapsing — the pill rides the header (upstream rationale).
		*
		* The form body is the two-block editing surface (spec §8): the `enabled`
		* checkbox row, the 6 top-level scalar fields (trigger codes / revert
		* policy / three numeric fields), the `rootChain` block (block 1 — the
		* root agent's single chain, no key input), and the roles block (block 2 —
		* declared role entity cards from `roles.list` plus the rule rows from
		* `roles.rules`, whose role field is a dropdown bound to the declared ids
		* + the built-in `inherit`, same-page live). Saving runs `validateDraft`
		* first — id format/reserved word/duplicates, undeclared rule role
		* references, illegal selectors, and a role with no chain entries (no
		* model config) block the write with a validation banner + inline red
		* borders / hints (never touching the store error path); a
		* non-empty `state.legacyKeys` renders the migration banner at the top of
		* the card body. The row editors keep their filled editorCard surface
		* inside the card, with `--dsw-alias-*` tokens throughout. The reset-
		* to-defaults affordance is GONE from the card (PR #62 UX round 3) — the
		* gateway RPC `fallbacks/reset` and the store `resetToDefaults()` stay as
		* host APIs (store/gateway tests unchanged), only the card UI was removed.
		*
		* The page-only chrome is gone (720px column wrapper, title/intro banners,
		* page-bottom status block): the AC-7 read-only status (derived effective
		* model + recent-switch summary) is folded into the card body, and the
		* plugin-config section owns the column width.
		*
		* Degraded/error/loading states keep the same card chrome (KD-U3): the
		* header always renders title+description+chevron, and the body carries the
		* config-channel notice or the load error. A card that cannot reach the
		* `fallbacks/get` gateway channel (`ready && !present`) keeps the USABLE
		* skeleton — the form stays writable and saves are attempted (KD-G5) — with
		* the `unavailable` notice ALWAYS visible (derived open — the header cannot
		* collapse it away), while a healthy card is collapsed until the user
		* expands it (AC-1, the documented divergence from upstream whose
		* unavailable card renders nothing). A hard load failure (`status ===
		* 'error'`) also forces the body open with an error notice and — when the
		* form is inert (`!writable`, i.e. the load never landed) — a Retry button;
		* a save failure keeps the editable form so the Save action itself is the
		* retry. PR #62 UX round 2: the single `state.error` surface is split by
		* origin — a LOAD failure keeps the card-top notice (with Retry when
		* inert), while a WRITE failure renders under the section whose Save was
		* last clicked (`lastSaveSection`), unlike the advisor's separate
		* apply-failure hints.
		*
		* The degraded derivation is latched in the card (the store stays untouched):
		* `present` only ever changes inside the store's `accept()`, so the settled
		* `ready` read is authoritative, and a card-local latch carries that value
		* through refresh/save windows (`loading`/`saving`) so the notice body can
		* never collapse mid-refresh (the advisor's latched `degraded` field,
		* implemented without a store change); on a first mount the latch is false,
		* so the healthy card starts (and stays) collapsed through its first load.
		*/
		const ALL_DAY_FLASH = "deepseek-official/deepseek-v4-flash";
		const ALL_DAY_PRO = "deepseek-official/deepseek-v4-pro";
		const SLOT_PRESET_IDS = [
			"liang-peak",
			"liang-valley",
			"glm-peak",
			"glm-valley"
		];
		/** Custom-row day toggle order (index = weekday, 0=Sunday); display copy lives in the dictionaries. */
		const SLOT_WEEKDAYS = [
			"sun",
			"mon",
			"tue",
			"wed",
			"thu",
			"fri",
			"sat"
		];
		/** IANA timezone of this renderer (browser / host). */
		function hostTimeZone() {
			try {
				const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
				return typeof tz === "string" && tz !== "" ? tz : "UTC";
			} catch {
				return "UTC";
			}
		}
		/** `UTC+8` / `UTC-4` for an IANA id (current offset, DST-honest). */
		function tzUtcOffset(tz) {
			try {
				const name = new Intl.DateTimeFormat("en-US", {
					timeZone: tz,
					timeZoneName: "shortOffset"
				}).formatToParts(/* @__PURE__ */ new Date()).find((part) => part.type === "timeZoneName")?.value;
				if (name === void 0 || name === "") return "";
				return name.replace(/^GMT/, "UTC");
			} catch {
				return "";
			}
		}
		/** Read-only custom-row copy: `Asia/Shanghai (UTC+8)`. */
		function tzDisplayLabel(tz) {
			const offset = tzUtcOffset(tz);
			return offset === "" ? tz : `${tz} (${offset})`;
		}
		/** Persist tz: presets lock UTC+8; custom-only uses the host zone; else keep the accepted value. */
		function resolvedSlotTz(rows, fallback) {
			if (rows.some((row) => row.kind === "preset")) return "Asia/Shanghai";
			if (rows.some((row) => row.kind === "custom")) return hostTimeZone();
			return fallback === "" ? "Asia/Shanghai" : fallback;
		}
		/** Strict 24h `HH:mm` — the resolver's HHMM_RE twin (drift-guarded by the gateway reject-on-save). */
		const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
		/**
		* The 默认模型 value for a chain: the official V4 id when the chain TAIL
		* is that model (Flash XOR Pro — leading 默认降级链 entries allowed);
		* `''` for an empty chain or a chain whose last entry is not official
		* (the panel reads back unselected and save validation blocks the value).
		*/
		function allDayModelOf(chain) {
			const tail = chain.length >= 1 ? chain[chain.length - 1] : void 0;
			return tail === ALL_DAY_FLASH || tail === ALL_DAY_PRO ? tail : "";
		}
		/**
		* The 默认降级链 editor row: the leading entries BEFORE the official-V4
		* tail, or the whole chain while the tail is not official (the draft
		* rides the accepted value until a 默认模型 pick).
		*/
		function allDayChainRowOf(chain, catalog) {
			return rootChainToRows(allDayModelOf(chain) === "" ? chain : chain.slice(0, -1), catalog)[0];
		}
		/** Split scalars from the row editors (rootChain / role entities / role rules). */
		function scalarsOf(config) {
			return {
				enabled: config.enabled,
				triggerCodes: [...config.triggerCodes],
				cooldownMs: config.cooldownMs,
				revertPolicy: config.revertPolicy,
				maxSwitchesPerStep: config.maxSwitchesPerStep,
				alwaysModeRetryCap: config.alwaysModeRetryCap,
				roleAutoMatch: config.roleAutoMatch,
				tz: config.tz ?? "Asia/Shanghai"
			};
		}
		/**
		* Assemble the full config the row editors + scalars describe. The rebuilt
		* `roles.list` comes from the rows, with the schema-reserved
		* `prompt`/`permissions` merged back from the last accepted config by role
		* id (see {@link mergeRoleExtras}) so a save never silently drops them
		* (T2 reviewer minor #2). `presets` (spec §9.4) follows the same rule at
		* the top level: no presets UI this iteration (R-001 re-defer), so the
		* draft carries the accepted value through untouched — a clean draft stays
		* equal to the accepted config and a save never drops the key.
		* `roleAutoMatch` follows the same rule (config-model mirror of `presets`):
		* the draft carries the scalar's value through untouched. The scalar is
		* ALWAYS defined — the gateway composition resolves the schema default
		* `true` even for a legacy config that never declared the key — so the
		* toggle always renders (default on) and a save persists the resolved value
		* (AC-7 re-scope, PM decision 2026-08-17 Option A).
		*
		* All-day: rootChain is composed from the 默认降级链 editor's leading
		* selectors plus the 默认模型 tail (exactly one official V4 — Flash XOR
		* Pro). While no tail is selected the ACCEPTED chain rides through
		* untouched. `timeSlots` is rebuilt from the slot rows every render. `tz`
		* is a card scalar: preset rows lock it to Asia/Shanghai; custom rows
		* follow the selected timezone.
		*/
		function assembleConfig(scalars, allDayModel, acceptedRootChain, allDayChainRow, roleRows, ruleRows, originalRoles, presets, roleAutoMatch, timeSlotRows) {
			const list = mergeRoleExtras(roleRows, originalRoles);
			const trailingChain = rowsToRootChain([allDayChainRow]);
			const tz = resolvedSlotTz(timeSlotRows, scalars.tz);
			return {
				enabled: scalars.enabled,
				triggerCodes: [...scalars.triggerCodes],
				rootChain: allDayModel === "" ? [...acceptedRootChain] : [...trailingChain, allDayModel],
				roles: {
					list,
					rules: rowsToRules(ruleRows)
				},
				cooldownMs: scalars.cooldownMs,
				revertPolicy: scalars.revertPolicy,
				maxSwitchesPerStep: scalars.maxSwitchesPerStep,
				alwaysModeRetryCap: scalars.alwaysModeRetryCap,
				...presets === void 0 ? {} : { presets },
				roleAutoMatch,
				timeSlots: rowsToTimeSlots(timeSlotRows),
				tz
			};
		}
		/** An empty per-section validation-error record (the clean-draft shape). */
		function emptyValidationErrors() {
			return {
				main: [],
				sub: [],
				advanced: []
			};
		}
		/**
		* Pre-save validation of the assembled draft (spec §8 / plan Task 3):
		* role id format/reserved word/duplicates, undeclared rule role references
		* (only reachable through the synthetic outside option — the dropdown
		* itself constrains normal edits), and illegal selector entries in
		* rootChain and role chains. Returns one localized message per violation,
		* bucketed by the section that owns the offending field (PR #62 UX round
		* 2 — 主代理: allDay / timeSlots / slot* / tz / default model / default
		* chain; 子代理: role* / rule*; 高级选项: trigger / cooldown / revert /
		* always / roleAutoMatch — the scalars are never validated, so the
		* advanced bucket stays empty today). A non-empty result blocks
		* {@link save} — the draft is never written. `persona` is free text and
		* never validated.
		*
		* `seededIds` is the live trimmed-id → overridden map derived from
		* `state.seeds` (spec §9.4): the empty-chain block relaxes for seeded ids
		* only (spec §9.6 / AC-3 — a seeded role's chain is legitimately empty by
		* design, R4, and its persona edits must stay persistable); non-seeded
		* behavior is byte-identical.
		*/
		function validateDraft(draft, t, seededIds) {
			const errors = emptyValidationErrors();
			const declaredIds = /* @__PURE__ */ new Set();
			for (const role of draft.roles.list) {
				if (!ROLE_ID_PATTERN.test(role.id)) errors.sub.push(t("validation.roleIdFormat", { id: role.id }));
				if (role.id === "inherit") errors.sub.push(t("validation.roleIdReserved"));
				if (declaredIds.has(role.id)) errors.sub.push(t("validation.roleIdDuplicate", { id: role.id }));
				declaredIds.add(role.id);
				for (const entry of role.chain ?? []) try {
					parseSelector(entry);
				} catch (error) {
					errors.sub.push(t("validation.selector", {
						entry,
						message: error.message
					}));
				}
				if ((role.chain ?? []).length === 0 && !seededIds.has(role.id.trim())) errors.sub.push(t("validation.roleChainRequired", { id: role.id }));
			}
			const allDayTail = draft.rootChain.length >= 1 ? draft.rootChain[draft.rootChain.length - 1] : void 0;
			if (allDayTail !== ALL_DAY_FLASH && allDayTail !== ALL_DAY_PRO) errors.main.push(t("validation.allDayRequired"));
			for (const entry of draft.rootChain) try {
				parseSelector(entry);
			} catch (error) {
				errors.main.push(t("validation.selector", {
					entry,
					message: error.message
				}));
			}
			const seenSlotPresets = /* @__PURE__ */ new Set();
			for (const row of draft.timeSlots ?? []) {
				if (row.kind !== "preset" && row.kind !== "custom") errors.main.push(t("validation.slotKind"));
				if (row.kind === "preset") {
					if (typeof row.preset !== "string" || !SLOT_PRESET_IDS.includes(row.preset)) errors.main.push(t("validation.slotPresetUnknown", { preset: row.preset }));
					else if (seenSlotPresets.has(row.preset)) errors.main.push(t("validation.slotPresetDuplicate", { preset: row.preset }));
					else seenSlotPresets.add(row.preset);
					if (row.start !== void 0 || row.end !== void 0 || row.days !== void 0 && row.days.length > 0) errors.main.push(t("validation.slotPresetFrozen"));
				} else if (row.kind === "custom") {
					if (typeof row.start !== "string" || typeof row.end !== "string" || !HHMM_RE.test(row.start) || !HHMM_RE.test(row.end)) errors.main.push(t("validation.slotWindow"));
					if (row.days !== void 0 && row.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) errors.main.push(t("validation.slotDays"));
				}
				for (const entry of row.chain) try {
					parseSelector(entry);
				} catch (error) {
					errors.main.push(t("validation.selector", {
						entry,
						message: error.message
					}));
				}
				if (row.chain.length === 0) errors.main.push(t("validation.slotChainRequired"));
			}
			const validTargets = /* @__PURE__ */ new Set([...declaredIds, INHERIT_ROLE_ID]);
			for (const rule of draft.roles.rules) if (!validTargets.has(rule.role)) errors.sub.push(t("validation.ruleRoleUndeclared", { role: rule.role }));
			return errors;
		}
		/**
		* The trimmed role ids that are validation failures (format / reserved word
		* / duplicate) — drives the inline red border after a blocked save attempt.
		* Derived once per render into a Set (qc3 F-3): a duplicate scan inside the
		* render loop would be O(N²) per row; here the whole derivation is O(N) and
		* each row's check is a single Set lookup. Selector errors stay on the
		* banner only (plan Task 3 inline-scope rule).
		*/
		function collectInvalidRoleIds(rows) {
			const counts = /* @__PURE__ */ new Map();
			for (const row of rows) {
				const id = row.id.trim();
				counts.set(id, (counts.get(id) ?? 0) + 1);
			}
			const invalid = /* @__PURE__ */ new Set();
			for (const row of rows) {
				const id = row.id.trim();
				if (!ROLE_ID_PATTERN.test(id) || id === "inherit" || (counts.get(id) ?? 0) > 1) invalid.add(id);
			}
			return invalid;
		}
		/** Parse a number input, clamped to a non-negative integer. */
		function parseCount(raw) {
			const parsed = Number.parseInt(raw, 10);
			return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
		}
		/**
		* Custom time-slot rows whose window is not valid `HH:mm` — drives the
		* inline red border after a blocked save attempt (same derivation pattern
		* as {@link collectInvalidRoleIds}: one pass per render, index lookup per
		* row).
		*/
		function collectInvalidSlotRows(rows) {
			const invalid = /* @__PURE__ */ new Set();
			rows.forEach((row, index) => {
				if (row.kind === "preset") return;
				if (!HHMM_RE.test(row.start) || !HHMM_RE.test(row.end)) invalid.add(index);
			});
			return invalid;
		}
		/** The catalog faces the dropdowns classify against; undefined while unready. */
		function catalogOf(state) {
			return state.catalogStatus === "ready" ? {
				providers: state.providers,
				groups: state.groups
			} : void 0;
		}
		/**
		* Inline "!" info badge (T3): the detailed explanation rides a primitives
		* Tooltip bubble (side "right", ~300ms hover delay, immediate on keyboard
		* focus) while the short inline hint stays on the row. The badge is an
		* exposed, focusable image — the Models page credential-status pattern
		* (role="img" + aria-label) — so the accessible name is always available;
		* the tooltip is a progressive enhancement on top.
		*
		* `disabled` mirrors the read-only/loading suppression of the surrounding
		* controls: the bubble is suppressed, the badge drops out of the tab order
		* (and its `:disabled` style dims it).
		*
		* Placement contract (QC W-2 fix): the badge is always a **sibling** of the
		* label-text element — never nested inside a `<label>` or an
		* `aria-labelledby`-referenced node — so its aria-label can never leak into
		* a control/group accessible name. A click on the badge therefore has no
		* label-activation default action to cancel.
		*/
		function InfoHint({ label, disabled = false }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label,
				side: "right",
				delayMs: 300,
				disabled,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: disabled ? `${FallbacksCard_module_css_default.infoHint} ${FallbacksCard_module_css_default.infoHintDisabled}` : FallbacksCard_module_css_default.infoHint,
					role: "img",
					"aria-label": label,
					tabIndex: disabled ? -1 : 0,
					children: "!"
				})
			});
		}
		/**
		* One chain entry selector row: provider select + model select (cascade).
		* The GUI never offers a `provider/*` wildcard (root agent and role chains
		* alike; provider-any matching lives in the role rules) — but `provider/*`
		* stays a legal YAML entry, so a wildcard row read back from the server
		* renders with the legacy-conversion hint and an enabled model select:
		* picking a model converts the row to an exact entry (the patch carries
		* `wildcard: false`). The provider options are the catalog providers
		* **configured on the Models page** (`configuredProviders`, the Models-page
		* `configured` join) — unconfigured directory providers never become
		* offerable. Out-of-catalog values read back from the server render as
		* a synthetic option with the short "outside catalog" annotation and stay
		* selected — keeping them saves verbatim; picking a catalog option is an
		* intentional change. A directory provider that is not configured is offered
		* the same read-back treatment (short "not configured" annotation) so an
		* existing value is never hidden or dropped. New rows only offer configured
		* options.
		*/
		function ChainSelectorEditor({ selector, catalog, configuredProviders, disabled, t, onChange, onRemove }) {
			const providerRaw = selectionToRaw(selector.provider);
			const providerOutside = selector.provider?.kind === "outside";
			const providerUnconfigured = !providerOutside && providerRaw !== "" && (catalog?.providers.some((entry) => entry.provider === providerRaw) ?? false) && !configuredProviders.some((entry) => entry.provider === providerRaw);
			const modelRaw = selectionToRaw(selector.model);
			const modelOutside = selector.model?.kind === "outside";
			const group = catalog?.groups.find((entry) => entry.id === providerRaw);
			const groupMissing = providerRaw !== "" && !providerOutside && group === void 0;
			const modelDisabled = disabled || providerRaw === "" || groupMissing || providerOutside && modelRaw === "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: FallbacksCard_module_css_default.selectorRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: FallbacksCard_module_css_default.ruleGrid,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: FallbacksCard_module_css_default.ruleCell,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: FallbacksCard_module_css_default.ruleCellLabel,
								children: t("roles.rule.provider")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: `${FallbacksCard_module_css_default.input} ${FallbacksCard_module_css_default.selectInput}`,
								value: providerRaw,
								disabled,
								onChange: (event) => {
									if (event.target.value === providerRaw) return;
									onChange({
										provider: classifyProvider(event.target.value, catalog),
										model: null
									});
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: t("chains.selector.providerPlaceholder")
									}),
									configuredProviders.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: entry.provider,
										children: entry.displayName
									}, entry.provider)),
									providerUnconfigured && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: providerRaw,
										children: `${providerRaw}${t("catalog.unconfigured.short")}`
									}),
									providerOutside && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: providerRaw,
										children: `${providerRaw}${t("catalog.outside.short")}`
									})
								]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: FallbacksCard_module_css_default.ruleCell,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: FallbacksCard_module_css_default.ruleCellLabel,
									children: t("roles.rule.model")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									className: `${FallbacksCard_module_css_default.input} ${FallbacksCard_module_css_default.selectInput}`,
									value: modelRaw,
									disabled: modelDisabled,
									onChange: (event) => {
										onChange({
											model: classifyModel(providerRaw, event.target.value, catalog),
											...selector.wildcard ? { wildcard: false } : {}
										});
									},
									children: [
										modelRaw === "" && !providerOutside && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: t("chains.selector.modelPlaceholder")
										}),
										(group?.models ?? []).map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: model.id,
											children: model.name
										}, model.id)),
										modelOutside && !selector.wildcard && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: modelRaw,
											children: `${modelRaw}${t("catalog.outside.short")}`
										})
									]
								}),
								groupMissing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: FallbacksCard_module_css_default.hint,
									children: t("chains.selector.noModelsStrict")
								})
							]
						})]
					}),
					(providerOutside || modelOutside) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: FallbacksCard_module_css_default.hint,
						children: [t("catalog.outside.hint"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
							label: t("catalog.outside.tooltip"),
							disabled
						})]
					}),
					selector.wildcard && !modelDisabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: FallbacksCard_module_css_default.hint,
						children: t("chains.selector.wildcardLegacy")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: FallbacksCard_module_css_default.cardFoot,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${FallbacksCard_module_css_default.iconButton} ${FallbacksCard_module_css_default.iconButtonDanger}`,
							"data-tip": t("chains.selector.remove"),
							"aria-label": t("chains.selector.remove"),
							onClick: onRemove,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
						})
					})
				]
			});
		}
		/**
		* Render the Fallbacks settings card inside the plugin-config section,
		* replicating the upstream PluginCard chrome (KD-U1). The body carries the
		* existing form content unchanged plus the folded-in status block and the
		* footer actions (Discard / Reset / Save).
		* @param props - slot-delivered injected dependencies and the synthesized t seat.
		* @returns the card.
		*/
		function FallbacksCard({ controller, useSnapshot, t }) {
			const state = useSnapshot((snapshot) => snapshot);
			(0, react.useEffect)(() => {
				const snapshot = controller.store.getSnapshot();
				if (snapshot.status === "idle") controller.load();
				if (snapshot.catalogStatus === "idle") controller.loadCatalog();
				if (snapshot.switchesStatus === "idle") controller.loadSwitches();
			}, [controller]);
			const [scalars, setScalars] = (0, react.useState)(() => scalarsOf(defaultFallbacksConfig));
			const [allDayModel, setAllDayModel] = (0, react.useState)(() => allDayModelOf(defaultFallbacksConfig.rootChain));
			const [allDayChainRow, setAllDayChainRow] = (0, react.useState)(() => allDayChainRowOf(defaultFallbacksConfig.rootChain, void 0));
			const [timeSlotRows, setTimeSlotRows] = (0, react.useState)(() => timeSlotsToRows(defaultFallbacksConfig.timeSlots ?? []));
			const [roleRows, setRoleRows] = (0, react.useState)(() => rolesToRows(defaultFallbacksConfig.roles.list));
			const [ruleRows, setRuleRows] = (0, react.useState)(() => rulesToRows(defaultFallbacksConfig.roles.rules));
			const [presetToAdd, setPresetToAdd] = (0, react.useState)("");
			const [validationErrors, setValidationErrors] = (0, react.useState)(emptyValidationErrors);
			const [validationAttempted, setValidationAttempted] = (0, react.useState)(false);
			const [lastSaveSection, setLastSaveSection] = (0, react.useState)(null);
			const seededConfigKey = (0, react.useRef)(null);
			const draft = assembleConfig(scalars, allDayModel, state.config.rootChain, allDayChainRow, roleRows, ruleRows, state.config.roles.list, state.config.presets, scalars.roleAutoMatch, timeSlotRows);
			const hasEmptyRuleRows = ruleRows.some((row) => row.role === "");
			const enabledDirty = scalars.enabled !== state.config.enabled;
			const mainDirty = enabledDirty || JSON.stringify([...draft.rootChain, draft.timeSlots]) !== JSON.stringify([...state.config.rootChain, state.config.timeSlots ?? []]);
			const subDirty = hasEmptyRuleRows || JSON.stringify(draft.roles) !== JSON.stringify(state.config.roles);
			const advancedDirty = JSON.stringify([
				draft.triggerCodes,
				draft.cooldownMs,
				draft.revertPolicy,
				draft.maxSwitchesPerStep,
				draft.alwaysModeRetryCap,
				draft.roleAutoMatch
			]) !== JSON.stringify([
				state.config.triggerCodes,
				state.config.cooldownMs,
				state.config.revertPolicy,
				state.config.maxSwitchesPerStep,
				state.config.alwaysModeRetryCap,
				state.config.roleAutoMatch
			]);
			const dirty = mainDirty || subDirty || advancedDirty;
			const firstSeedDone = (0, react.useRef)(false);
			const forceReseed = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (state.status !== "ready") return;
				const key = JSON.stringify(state.config);
				if (seededConfigKey.current === key) return;
				seededConfigKey.current = key;
				const firstSeed = !firstSeedDone.current;
				firstSeedDone.current = true;
				const force = forceReseed.current;
				forceReseed.current = false;
				const catalog = catalogOf(state);
				if (firstSeed || force || !mainDirty) {
					setAllDayModel(allDayModelOf(state.config.rootChain));
					setAllDayChainRow(allDayChainRowOf(state.config.rootChain, catalog));
					setTimeSlotRows(timeSlotsToRows(state.config.timeSlots ?? [], catalog));
					setScalars((prev) => ({
						...prev,
						enabled: state.config.enabled,
						tz: state.config.tz ?? "Asia/Shanghai"
					}));
				}
				if (firstSeed || force || !subDirty) {
					setRoleRows(rolesToRows(state.config.roles.list, catalog));
					setRuleRows(rulesToRows(state.config.roles.rules, catalog));
				}
				if (firstSeed || force || !advancedDirty) setScalars((prev) => ({
					...prev,
					triggerCodes: [...state.config.triggerCodes],
					cooldownMs: state.config.cooldownMs,
					revertPolicy: state.config.revertPolicy,
					maxSwitchesPerStep: state.config.maxSwitchesPerStep,
					alwaysModeRetryCap: state.config.alwaysModeRetryCap,
					roleAutoMatch: state.config.roleAutoMatch
				}));
			}, [
				state.status,
				state.config,
				mainDirty,
				subDirty,
				advancedDirty
			]);
			const updateScalars = (mutator) => {
				setScalars((prev) => {
					const next = {
						...prev,
						triggerCodes: [...prev.triggerCodes]
					};
					mutator(next);
					return next;
				});
			};
			const updateTimeSlotRow = (index, patch) => {
				setTimeSlotRows((rows) => {
					const next = rows.map((row) => ({ ...row }));
					next[index] = {
						...next[index],
						...patch
					};
					return next;
				});
			};
			const updateTimeSlotSelector = (rowIndex, selectorIndex, patch) => {
				setTimeSlotRows((rows) => {
					const next = rows.map((row) => ({
						...row,
						selectors: row.selectors.map((selector) => ({ ...selector }))
					}));
					const selectors = next[rowIndex].selectors;
					selectors[selectorIndex] = {
						...selectors[selectorIndex],
						...patch
					};
					return next;
				});
			};
			const addTimeSlotSelector = (rowIndex) => {
				setTimeSlotRows((rows) => rows.map((row, index) => index === rowIndex ? {
					...row,
					selectors: [...row.selectors, {
						wildcard: false,
						provider: null,
						model: null
					}]
				} : row));
			};
			const removeTimeSlotSelector = (rowIndex, selectorIndex) => {
				setTimeSlotRows((rows) => rows.map((row, index) => index === rowIndex ? {
					...row,
					selectors: row.selectors.filter((_, sIndex) => sIndex !== selectorIndex)
				} : row));
			};
			const addPresetSlotRow = () => {
				if (presetToAdd === "") return;
				if ((presetToAdd === "glm-peak" || presetToAdd === "glm-valley") && !glmConfigured) return;
				setTimeSlotRows((rows) => [...rows, {
					kind: "preset",
					preset: presetToAdd,
					start: "",
					end: "",
					days: [],
					name: "",
					collapsed: false,
					selectors: []
				}]);
				setPresetToAdd("");
			};
			const addCustomSlotRow = () => {
				setTimeSlotRows((rows) => [...rows, {
					kind: "custom",
					start: "",
					end: "",
					days: [],
					name: "",
					collapsed: false,
					selectors: []
				}]);
			};
			const removeTimeSlotRow = (index) => {
				setTimeSlotRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
			};
			const moveTimeSlotRow = (index, delta) => {
				setTimeSlotRows((rows) => {
					const target = index + delta;
					if (target < 0 || target >= rows.length) return rows;
					const next = rows.map((row) => ({ ...row }));
					const moved = next[index];
					next[index] = next[target];
					next[target] = moved;
					return next;
				});
			};
			const [draggedSlotIndex, setDraggedSlotIndex] = (0, react.useState)(null);
			const [overSlotIndex, setOverSlotIndex] = (0, react.useState)(null);
			const reorderTimeSlotRow = (from, to) => {
				setTimeSlotRows((rows) => {
					if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
					const next = rows.map((row) => ({ ...row }));
					const [moved] = next.splice(from, 1);
					next.splice(to, 0, moved);
					return next;
				});
			};
			const updateAllDayChainSelector = (selectorIndex, patch) => {
				setAllDayChainRow((row) => ({
					...row,
					selectors: row.selectors.map((selector, index) => index === selectorIndex ? {
						...selector,
						...patch
					} : selector)
				}));
			};
			const addAllDayChainSelector = () => {
				setAllDayChainRow((row) => ({
					...row,
					selectors: [...row.selectors, {
						wildcard: false,
						provider: null,
						model: null
					}]
				}));
			};
			const removeAllDayChainSelector = (selectorIndex) => {
				setAllDayChainRow((row) => ({
					...row,
					selectors: row.selectors.filter((_, index) => index !== selectorIndex)
				}));
			};
			const updateRoleRow = (index, patch) => {
				setRoleRows((rows) => {
					const next = rows.map((row) => ({ ...row }));
					next[index] = {
						...next[index],
						...patch
					};
					return next;
				});
			};
			const updateRoleSelector = (roleIndex, selectorIndex, patch) => {
				setRoleRows((rows) => {
					const next = rows.map((row) => ({
						...row,
						selectors: row.selectors.map((selector) => ({ ...selector }))
					}));
					const selectors = next[roleIndex].selectors;
					selectors[selectorIndex] = {
						...selectors[selectorIndex],
						...patch
					};
					return next;
				});
			};
			const addRoleSelector = (roleIndex) => {
				setRoleRows((rows) => rows.map((row, index) => index === roleIndex ? {
					...row,
					selectors: [...row.selectors, {
						wildcard: false,
						provider: null,
						model: null
					}]
				} : row));
			};
			const removeRoleSelector = (roleIndex, selectorIndex) => {
				setRoleRows((rows) => rows.map((row, index) => index === roleIndex ? {
					...row,
					selectors: row.selectors.filter((_, sIndex) => sIndex !== selectorIndex)
				} : row));
			};
			const addRole = () => {
				setRoleRows((rows) => [...rows, {
					id: "",
					persona: "",
					selectors: [],
					fallback: "inherit-root",
					collapsed: true
				}]);
			};
			const removeRole = (index) => {
				setRoleRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
			};
			const updateRuleRow = (index, patch) => {
				setRuleRows((rows) => {
					const next = rows.map((row) => ({ ...row }));
					next[index] = {
						...next[index],
						...patch
					};
					return next;
				});
			};
			const allValidationErrors = [
				...validationErrors.main,
				...validationErrors.sub,
				...validationErrors.advanced
			];
			const saving = state.status === "saving";
			const writable = state.writable;
			const unknownCodes = scalars.triggerCodes.filter((code) => !KNOWN_TRIGGER_CODES.includes(code));
			const presetsPresent = timeSlotRows.some((row) => row.kind === "preset");
			const glmConfigured = state.configuredProviders.some((entry) => entry.provider === "zai-coding-cn");
			const slotState = resolveSlotState(state.config, /* @__PURE__ */ new Date(), scalars.tz);
			const activeSlotIndex = slotState.winner === "all-day" ? -1 : state.config.timeSlots?.indexOf(slotState.winner) ?? -1;
			const roleOptions = ruleRoleOptions({ list: roleRows });
			const invalidRoleIds = validationAttempted ? collectInvalidRoleIds(roleRows) : null;
			const invalidSlotRows = validationAttempted ? collectInvalidSlotRows(timeSlotRows) : null;
			const seededIds = /* @__PURE__ */ new Map();
			for (const seed of state.seeds) seededIds.set(seed.id.trim(), seed.overridden);
			const latestSwitch = state.switches[0];
			let switchesLine;
			if (state.switchesStatus === "error") switchesLine = t("status.switches.error", { message: state.switchesError });
			else if (state.switchesStatus === "loading") switchesLine = t("loading");
			else if (latestSwitch === void 0) switchesLine = t("status.switches.empty");
			else {
				const reasonKey = SWITCH_REASON_KEYS[latestSwitch.reason];
				const params = {
					count: String(state.switches.length),
					from: `${latestSwitch.from.provider}/${latestSwitch.from.model}`,
					to: `${latestSwitch.to.provider}/${latestSwitch.to.model}`,
					role: latestSwitch.role,
					reason: reasonKey === void 0 ? latestSwitch.reason : t(reasonKey)
				};
				switchesLine = latestSwitch.reason === "role-inject" ? t("status.switches.compact.roleInject", params) : t("status.switches.compact", params);
			}
			const catalogSeededSections = (0, react.useRef)({
				epoch: null,
				main: false,
				sub: false
			});
			(0, react.useEffect)(() => {
				if (state.catalogStatus !== "ready") return;
				const seed = catalogSeededSections.current;
				if (seed.epoch !== state.catalogEpoch) {
					seed.epoch = state.catalogEpoch;
					seed.main = false;
					seed.sub = false;
				}
				const catalog = catalogOf(state);
				if (!mainDirty && !seed.main) {
					seed.main = true;
					setAllDayModel(allDayModelOf(state.config.rootChain));
					setAllDayChainRow(allDayChainRowOf(state.config.rootChain, catalog));
					setTimeSlotRows(timeSlotsToRows(state.config.timeSlots ?? [], catalog));
				}
				if (!subDirty && !seed.sub) {
					seed.sub = true;
					setRoleRows(rolesToRows(state.config.roles.list, catalog));
					setRuleRows(rulesToRows(state.config.roles.rules, catalog));
				}
			}, [
				state.catalogStatus,
				state.catalogEpoch,
				state.config,
				mainDirty,
				subDirty
			]);
			const sectionPatch = (section) => {
				const base = {
					...state.config,
					enabled: scalars.enabled
				};
				switch (section) {
					case "main": return {
						...base,
						rootChain: draft.rootChain,
						timeSlots: draft.timeSlots,
						tz: draft.tz
					};
					case "sub": return {
						...base,
						roles: draft.roles
					};
					case "advanced": return {
						...base,
						triggerCodes: draft.triggerCodes,
						cooldownMs: draft.cooldownMs,
						revertPolicy: draft.revertPolicy,
						maxSwitchesPerStep: draft.maxSwitchesPerStep,
						alwaysModeRetryCap: draft.alwaysModeRetryCap,
						roleAutoMatch: draft.roleAutoMatch
					};
				}
			};
			const save = (section) => {
				setLastSaveSection(section);
				const errors = validateDraft(draft, t, seededIds);
				if (section === "sub" && hasEmptyRuleRows) errors.sub.push(t("validation.ruleRoleRequired"));
				if (errors[section].length > 0) {
					setValidationErrors(errors);
					setValidationAttempted(true);
					return;
				}
				setValidationErrors(emptyValidationErrors());
				setValidationAttempted(false);
				controller.save(sectionPatch(section));
			};
			const saveEnabled = () => {
				setLastSaveSection("main");
				setValidationErrors(emptyValidationErrors());
				setValidationAttempted(false);
				controller.save({
					...state.config,
					enabled: scalars.enabled
				});
			};
			const discardSection = (section) => {
				switch (section) {
					case "main":
						setAllDayModel(allDayModelOf(state.config.rootChain));
						setAllDayChainRow(allDayChainRowOf(state.config.rootChain, catalogOf(state)));
						setTimeSlotRows(timeSlotsToRows(state.config.timeSlots ?? [], catalogOf(state)));
						setScalars((prev) => ({
							...prev,
							enabled: state.config.enabled,
							tz: state.config.tz ?? "Asia/Shanghai"
						}));
						break;
					case "sub":
						setRoleRows(rolesToRows(state.config.roles.list, catalogOf(state)));
						setRuleRows(rulesToRows(state.config.roles.rules, catalogOf(state)));
						break;
					case "advanced": setScalars((prev) => ({
						...prev,
						triggerCodes: [...state.config.triggerCodes],
						cooldownMs: state.config.cooldownMs,
						revertPolicy: state.config.revertPolicy,
						maxSwitchesPerStep: state.config.maxSwitchesPerStep,
						alwaysModeRetryCap: state.config.alwaysModeRetryCap,
						roleAutoMatch: state.config.roleAutoMatch
					}));
				}
				setValidationErrors(emptyValidationErrors());
				setValidationAttempted(false);
			};
			const discardEnabled = () => {
				setScalars((prev) => ({
					...prev,
					enabled: state.config.enabled
				}));
				setValidationErrors(emptyValidationErrors());
				setValidationAttempted(false);
			};
			(0, react.useEffect)(() => {
				if (!validationAttempted) return;
				const errors = validateDraft(draft, t, seededIds);
				if (errors.main.length === 0 && errors.sub.length === 0 && errors.advanced.length === 0 && !ruleRows.some((row) => row.role === "")) {
					setValidationErrors(emptyValidationErrors());
					setValidationAttempted(false);
				}
			}, [
				validationAttempted,
				draft,
				ruleRows,
				t
			]);
			(0, react.useEffect)(() => {
				if (state.status === "ready") setLastSaveSection(null);
				if (state.status === "error") forceReseed.current = false;
			}, [state.status]);
			const [userOpen, setUserOpen] = (0, react.useState)(false);
			const [advancedOpen, setAdvancedOpen] = (0, react.useState)(false);
			const degradedLatch = (0, react.useRef)(false);
			const errorLatch = (0, react.useRef)(false);
			if (state.status === "ready") {
				degradedLatch.current = !state.present;
				errorLatch.current = false;
			} else if (state.status === "error") errorLatch.current = true;
			const degraded = state.status === "ready" ? !state.present : degradedLatch.current;
			const open = userOpen || errorLatch.current || degraded;
			const advancedVisible = advancedOpen || !writable;
			const title = t("title");
			const header = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: FallbacksCard_module_css_default.header,
				"aria-expanded": open,
				"aria-label": `${t(open ? "collapse" : "expand")}: ${title}`,
				onClick: () => {
					if (!degraded && state.status !== "error") setUserOpen(!userOpen);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: FallbacksCard_module_css_default.headText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: FallbacksCard_module_css_default.name,
							children: title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: FallbacksCard_module_css_default.description,
							children: t("intro")
						})]
					}),
					dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: FallbacksCard_module_css_default.pending,
						children: t("unsaved")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? `${FallbacksCard_module_css_default.chevron} ${FallbacksCard_module_css_default.chevronOpen}` : FallbacksCard_module_css_default.chevron })
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: open ? `${FallbacksCard_module_css_default.card} ${FallbacksCard_module_css_default.cardOpen}` : FallbacksCard_module_css_default.card,
				children: [header, open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: FallbacksCard_module_css_default.body,
					children: [
						state.legacyKeys.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: FallbacksCard_module_css_default.legacyNotice,
							role: "status",
							children: t("legacy.banner", { keys: state.legacyKeys.join(", ") })
						}),
						state.status === "error" && state.error !== null && lastSaveSection === null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: FallbacksCard_module_css_default.noticeRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: FallbacksCard_module_css_default.error,
								role: "alert",
								children: t("error.generic", { message: state.error })
							}), !state.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: () => {
									controller.load();
								},
								children: t("retry")
							})]
						}),
						degraded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: FallbacksCard_module_css_default.notice,
							role: "status",
							children: t("unavailable")
						}),
						state.status === "ready" && !state.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: FallbacksCard_module_css_default.readOnly,
							role: "status",
							children: t("readOnly")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: FallbacksCard_module_css_default.form,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: FallbacksCard_module_css_default.checkboxRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: FallbacksCard_module_css_default.checkLabel,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: FallbacksCard_module_css_default.checkLabelTitle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												htmlFor: "fallbacks-enabled",
												children: t("enabled.label")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
												label: t("enabled.tooltip"),
												disabled: !writable
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: FallbacksCard_module_css_default.checkLabelDesc,
											children: t("enabled.hint")
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										id: "fallbacks-enabled",
										type: "checkbox",
										className: FallbacksCard_module_css_default.checkbox,
										checked: scalars.enabled,
										disabled: !writable,
										onChange: (event) => {
											updateScalars((draft) => {
												draft.enabled = event.target.checked;
											});
										}
									})]
								}),
								!scalars.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: FallbacksCard_module_css_default.offNotice,
										children: t("enabled.off")
									}),
									allValidationErrors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: FallbacksCard_module_css_default.error,
										role: "alert",
										children: `${t("validation.blocked")}${allValidationErrors.join("; ")}`
									}),
									lastSaveSection === "main" && state.status === "error" && state.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: FallbacksCard_module_css_default.error,
										role: "alert",
										children: t("error.generic", { message: state.error })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: FallbacksCard_module_css_default.sectionActions,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: `${FallbacksCard_module_css_default.secondaryButton} ${FallbacksCard_module_css_default.sectionAction}`,
											disabled: !enabledDirty || saving,
											onClick: discardEnabled,
											children: t("discard")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: `${FallbacksCard_module_css_default.primaryButton} ${FallbacksCard_module_css_default.sectionAction}`,
											disabled: !writable || saving || !enabledDirty,
											onClick: saveEnabled,
											children: saving ? t("save.saving") : t("save")
										})]
									})
								] }),
								scalars.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
									className: FallbacksCard_module_css_default.fieldset,
									disabled: !writable,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: FallbacksCard_module_css_default.sectionHeading,
											id: "fallbacks-main-agent",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: FallbacksCard_module_css_default.sectionHeadingText,
												children: t("mainAgent.label")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: FallbacksCard_module_css_default.sectionActions,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: `${FallbacksCard_module_css_default.secondaryButton} ${FallbacksCard_module_css_default.sectionAction}`,
													disabled: !mainDirty || saving,
													onClick: () => {
														discardSection("main");
													},
													children: t("discard")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: `${FallbacksCard_module_css_default.primaryButton} ${FallbacksCard_module_css_default.sectionAction}`,
													disabled: !writable || saving || !mainDirty,
													onClick: () => {
														save("main");
													},
													children: saving ? t("save.saving") : t("save")
												})]
											})]
										}),
										validationErrors.main.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: FallbacksCard_module_css_default.error,
											role: "alert",
											children: `${t("validation.blocked")}${validationErrors.main.join("; ")}`
										}),
										lastSaveSection === "main" && state.status === "error" && state.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: FallbacksCard_module_css_default.error,
											role: "alert",
											children: t("error.generic", { message: state.error })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: FallbacksCard_module_css_default.field,
											role: "group",
											"aria-labelledby": "fallbacks-time-slots",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: FallbacksCard_module_css_default.fieldLabel,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														id: "fallbacks-time-slots",
														children: t("timeSlots.label")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
														label: t("timeSlots.tooltip"),
														disabled: !writable
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: FallbacksCard_module_css_default.hint,
													children: t("timeSlots.hint")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: FallbacksCard_module_css_default.list,
													children: timeSlotRows.map((row, index) => {
														const invalidWindow = invalidSlotRows?.has(index) ?? false;
														const chainEmpty = row.selectors.every((selector) => selectorRowToRaw(selector) === "");
														const firstModel = row.selectors.map(selectorRowToRaw).find((entry) => entry !== "");
														const slotExpanded = !row.collapsed || !writable;
														return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: `${FallbacksCard_module_css_default.editorCard} ${draggedSlotIndex === index ? FallbacksCard_module_css_default.slotCardDragging : ""} ${overSlotIndex === index && draggedSlotIndex !== null && draggedSlotIndex !== index ? FallbacksCard_module_css_default.slotCardOver : ""}`,
															onDragOver: (event) => {
																if (draggedSlotIndex === null) return;
																event.preventDefault();
																if (overSlotIndex !== index) setOverSlotIndex(index);
															},
															onDrop: (event) => {
																event.preventDefault();
																const from = draggedSlotIndex;
																setDraggedSlotIndex(null);
																setOverSlotIndex(null);
																if (from !== null && from !== index) reorderTimeSlotRow(from, index);
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: FallbacksCard_module_css_default.collapseRow,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
																	type: "button",
																	className: FallbacksCard_module_css_default.collapseToggle,
																	"aria-expanded": slotExpanded,
																	"aria-label": t(slotExpanded ? "timeSlots.collapse" : "timeSlots.expand"),
																	disabled: !writable,
																	onClick: () => {
																		updateTimeSlotRow(index, { collapsed: !row.collapsed });
																	},
																	children: [
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: slotExpanded ? `${FallbacksCard_module_css_default.chevron} ${FallbacksCard_module_css_default.chevronOpen}` : FallbacksCard_module_css_default.chevron }),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			className: FallbacksCard_module_css_default.collapseTitle,
																			children: row.kind === "preset" ? t(`timeSlots.preset.${row.preset}.label`) : row.name !== "" ? row.name : `custom ${row.start}-${row.end}`
																		}),
																		row.kind === "preset" && (row.preset === "liang-peak" || row.preset === "glm-peak") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			className: `${FallbacksCard_module_css_default.slotTag} ${FallbacksCard_module_css_default.slotTagHighCost}`,
																			children: t("timeSlots.preset.highCost")
																		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			className: `${FallbacksCard_module_css_default.slotTag} ${FallbacksCard_module_css_default.slotTagMultiplier}`,
																			children: t("timeSlots.preset.multiplier", { n: row.preset === "liang-peak" ? "2" : "3" })
																		})] }),
																		activeSlotIndex === index && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			className: `${FallbacksCard_module_css_default.slotTag} ${FallbacksCard_module_css_default.slotTagActive}`,
																			children: t("timeSlots.active")
																		}),
																		firstModel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			className: FallbacksCard_module_css_default.collapseMeta,
																			children: firstModel
																		})
																	]
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																	type: "button",
																	className: FallbacksCard_module_css_default.dragHandle,
																	draggable: writable,
																	"data-tip": t("timeSlots.drag"),
																	"aria-label": t("timeSlots.drag"),
																	disabled: !writable,
																	onDragStart: () => {
																		if (!writable) return;
																		setDraggedSlotIndex(index);
																		setOverSlotIndex(index);
																	},
																	onDragEnd: () => {
																		setDraggedSlotIndex(null);
																		setOverSlotIndex(null);
																	},
																	children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutline16, { className: FallbacksCard_module_css_default.dragHandleIcon })
																})]
															}), slotExpanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
																row.kind === "preset" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: FallbacksCard_module_css_default.ruleGrid,
																		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																			className: FallbacksCard_module_css_default.ruleCell,
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.ruleCellLabel,
																				children: t("timeSlots.preset.name")
																			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.slotPresetName,
																				children: t(`timeSlots.preset.${row.preset}.label`)
																			})]
																		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																			className: FallbacksCard_module_css_default.ruleCell,
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.ruleCellLabel,
																				children: t("timeSlots.preset.windowLabel")
																			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.hint,
																				children: t(`timeSlots.preset.${row.preset}.window`)
																			})]
																		})]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		className: FallbacksCard_module_css_default.hint,
																		children: t("timeSlots.preset.chainsOnly")
																	}),
																	(row.preset === "glm-peak" || row.preset === "glm-valley") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		className: FallbacksCard_module_css_default.hint,
																		children: t("timeSlots.preset.glm.note")
																	})
																] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: FallbacksCard_module_css_default.field,
																		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			className: FallbacksCard_module_css_default.ruleCellLabel,
																			children: t("timeSlots.name")
																		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																			className: FallbacksCard_module_css_default.input,
																			value: row.name,
																			placeholder: t("timeSlots.name"),
																			"aria-label": t("timeSlots.name"),
																			disabled: !writable,
																			onChange: (event) => {
																				updateTimeSlotRow(index, { name: event.target.value });
																			}
																		})]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: FallbacksCard_module_css_default.field,
																		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			className: FallbacksCard_module_css_default.ruleCellLabel,
																			children: t("timeSlots.tz.label")
																		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			className: FallbacksCard_module_css_default.hint,
																			"aria-label": t("timeSlots.tz.label"),
																			children: tzDisplayLabel(presetsPresent ? "Asia/Shanghai" : hostTimeZone())
																		})]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: FallbacksCard_module_css_default.ruleGrid,
																		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																			className: FallbacksCard_module_css_default.ruleCell,
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.ruleCellLabel,
																				children: t("timeSlots.start")
																			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																				className: `${FallbacksCard_module_css_default.input} ${invalidWindow ? FallbacksCard_module_css_default.inputInvalid : ""}`,
																				value: row.start,
																				placeholder: "09:00",
																				"aria-label": t("timeSlots.start"),
																				disabled: !writable,
																				onChange: (event) => {
																					updateTimeSlotRow(index, { start: event.target.value });
																				}
																			})]
																		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																			className: FallbacksCard_module_css_default.ruleCell,
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.ruleCellLabel,
																				children: t("timeSlots.end")
																			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																				className: `${FallbacksCard_module_css_default.input} ${invalidWindow ? FallbacksCard_module_css_default.inputInvalid : ""}`,
																				value: row.end,
																				placeholder: "18:00",
																				"aria-label": t("timeSlots.end"),
																				disabled: !writable,
																				onChange: (event) => {
																					updateTimeSlotRow(index, { end: event.target.value });
																				}
																			})]
																		})]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: FallbacksCard_module_css_default.field,
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.ruleCellLabel,
																				children: t("timeSlots.days")
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																				className: FallbacksCard_module_css_default.dayRow,
																				children: SLOT_WEEKDAYS.map((day, dayIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																					className: FallbacksCard_module_css_default.dayCell,
																					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																						type: "checkbox",
																						checked: row.days.includes(dayIndex),
																						disabled: !writable,
																						onChange: () => {
																							updateTimeSlotRow(index, { days: row.days.includes(dayIndex) ? row.days.filter((existing) => existing !== dayIndex) : [...row.days, dayIndex] });
																						}
																					}), t(`timeSlots.day.${day}`)]
																				}, day))
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.hint,
																				children: t("timeSlots.days.hint")
																			})
																		]
																	}),
																	(row.start !== "" || row.end !== "") && !(HHMM_RE.test(row.start) && HHMM_RE.test(row.end)) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		className: FallbacksCard_module_css_default.hint,
																		children: t("validation.slotWindow")
																	})
																] }),
																chainEmpty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: FallbacksCard_module_css_default.hint,
																	children: t("validation.slotChainRequired")
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																	className: FallbacksCard_module_css_default.chainSelectors,
																	children: row.selectors.map((selector, selectorIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChainSelectorEditor, {
																		selector,
																		catalog: catalogOf(state),
																		configuredProviders: state.configuredProviders,
																		disabled: !writable,
																		t,
																		onChange: (patch) => {
																			updateTimeSlotSelector(index, selectorIndex, patch);
																		},
																		onRemove: () => {
																			removeTimeSlotSelector(index, selectorIndex);
																		}
																	}, selectorIndex))
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																	variant: "outline",
																	size: "sm",
																	icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
																	className: FallbacksCard_module_css_default.addButton,
																	onClick: () => {
																		addTimeSlotSelector(index);
																	},
																	children: t("timeSlots.selector.add")
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																	className: FallbacksCard_module_css_default.cardFoot,
																	children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: FallbacksCard_module_css_default.rowActions,
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																				type: "button",
																				className: FallbacksCard_module_css_default.iconButton,
																				"data-tip": t("timeSlots.moveUp"),
																				"aria-label": t("timeSlots.moveUp"),
																				disabled: !writable || index === 0,
																				onClick: () => {
																					moveTimeSlotRow(index, -1);
																				},
																				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, {})
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																				type: "button",
																				className: FallbacksCard_module_css_default.iconButton,
																				"data-tip": t("timeSlots.moveDown"),
																				"aria-label": t("timeSlots.moveDown"),
																				disabled: !writable || index === timeSlotRows.length - 1,
																				onClick: () => {
																					moveTimeSlotRow(index, 1);
																				},
																				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																				type: "button",
																				className: `${FallbacksCard_module_css_default.iconButton} ${FallbacksCard_module_css_default.iconButtonDanger}`,
																				"data-tip": t("timeSlots.remove"),
																				"aria-label": t("timeSlots.remove"),
																				onClick: () => {
																					removeTimeSlotRow(index);
																				},
																				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
																			})
																		]
																	})
																})
															] })]
														}, index);
													})
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: FallbacksCard_module_css_default.slotAddRow,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
															className: `${FallbacksCard_module_css_default.input} ${FallbacksCard_module_css_default.selectInput}`,
															value: presetToAdd,
															"aria-label": t("timeSlots.presetPlaceholder"),
															disabled: !writable,
															onChange: (event) => {
																setPresetToAdd(event.target.value);
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "",
																children: t("timeSlots.presetPlaceholder")
															}), SLOT_PRESET_IDS.filter((id) => !timeSlotRows.some((row) => row.kind === "preset" && row.preset === id)).map((id) => {
																const glmUnconfigured = !glmConfigured && (id === "glm-peak" || id === "glm-valley");
																return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
																	value: id,
																	disabled: glmUnconfigured,
																	children: [t(`timeSlots.preset.${id}.label`), glmUnconfigured ? t("timeSlots.preset.glm.unconfigured") : null]
																}, id);
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
															variant: "outline",
															size: "sm",
															icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
															disabled: !writable || presetToAdd === "",
															onClick: addPresetSlotRow,
															children: t("timeSlots.addPreset")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
															variant: "outline",
															size: "sm",
															icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
															disabled: !writable,
															onClick: addCustomSlotRow,
															children: t("timeSlots.addCustom")
														})
													]
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: FallbacksCard_module_css_default.field,
											role: "group",
											"aria-labelledby": "fallbacks-root-chain",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: FallbacksCard_module_css_default.fieldLabel,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														id: "fallbacks-root-chain",
														children: t("rootChain.label")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
														label: t("rootChain.tooltip"),
														disabled: !writable
													})]
												}),
												state.catalogStatus === "error" && state.catalogError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: FallbacksCard_module_css_default.hint,
													children: t("catalog.error", { message: state.catalogError })
												}),
												state.catalogStatus === "ready" && state.catalogError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: FallbacksCard_module_css_default.hint,
													children: t("catalog.partial", { message: state.catalogError })
												}),
												state.catalogStatus === "ready" && (state.groups.length === 0 || state.configuredProviders.length === 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: FallbacksCard_module_css_default.hint,
													children: t("catalog.empty")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: FallbacksCard_module_css_default.list,
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: FallbacksCard_module_css_default.editorCard,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
															className: FallbacksCard_module_css_default.chainSelectors,
															children: allDayChainRow.selectors.map((selector, selectorIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChainSelectorEditor, {
																selector,
																catalog: catalogOf(state),
																configuredProviders: state.configuredProviders,
																disabled: !writable,
																t,
																onChange: (patch) => {
																	updateAllDayChainSelector(selectorIndex, patch);
																},
																onRemove: () => {
																	removeAllDayChainSelector(selectorIndex);
																}
															}, selectorIndex))
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
															variant: "outline",
															size: "sm",
															icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
															className: FallbacksCard_module_css_default.addButton,
															onClick: addAllDayChainSelector,
															children: t("timeSlots.selector.add")
														})]
													})
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: FallbacksCard_module_css_default.field,
											role: "group",
											"aria-labelledby": "fallbacks-default-model",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: FallbacksCard_module_css_default.fieldLabel,
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														id: "fallbacks-default-model",
														children: t("defaultModel.label")
													})
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: FallbacksCard_module_css_default.hint,
													children: t("allDay.hint")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: FallbacksCard_module_css_default.list,
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: FallbacksCard_module_css_default.editorCard,
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																className: FallbacksCard_module_css_default.optionRow,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																	type: "radio",
																	name: "fallbacks-all-day",
																	checked: allDayModel === ALL_DAY_FLASH,
																	disabled: !writable,
																	onChange: () => {
																		setAllDayModel(ALL_DAY_FLASH);
																	}
																}), t("allDay.flash")]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																className: FallbacksCard_module_css_default.optionRow,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																	type: "radio",
																	name: "fallbacks-all-day",
																	checked: allDayModel === ALL_DAY_PRO,
																	disabled: !writable,
																	onChange: () => {
																		setAllDayModel(ALL_DAY_PRO);
																	}
																}), t("allDay.pro")]
															}),
															allDayModel === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: FallbacksCard_module_css_default.hint,
																children: t("allDay.nonconforming")
															})
														]
													})
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: FallbacksCard_module_css_default.sectionHeading,
											id: "fallbacks-subagents",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: FallbacksCard_module_css_default.sectionHeadingText,
												children: t("subagents.label")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: FallbacksCard_module_css_default.sectionActions,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: `${FallbacksCard_module_css_default.secondaryButton} ${FallbacksCard_module_css_default.sectionAction}`,
													disabled: !subDirty || saving,
													onClick: () => {
														discardSection("sub");
													},
													children: t("discard")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: `${FallbacksCard_module_css_default.primaryButton} ${FallbacksCard_module_css_default.sectionAction}`,
													disabled: !writable || saving || !subDirty,
													onClick: () => {
														save("sub");
													},
													children: saving ? t("save.saving") : t("save")
												})]
											})]
										}),
										validationErrors.sub.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: FallbacksCard_module_css_default.error,
											role: "alert",
											children: `${t("validation.blocked")}${validationErrors.sub.join("; ")}`
										}),
										lastSaveSection === "sub" && state.status === "error" && state.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: FallbacksCard_module_css_default.error,
											role: "alert",
											children: t("error.generic", { message: state.error })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: FallbacksCard_module_css_default.field,
											role: "group",
											"aria-labelledby": "fallbacks-roles-list",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: FallbacksCard_module_css_default.fieldLabel,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														id: "fallbacks-roles-list",
														children: t("roles.list.label")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
														label: t("roles.list.tooltip"),
														disabled: !writable
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: FallbacksCard_module_css_default.hint,
													children: t("roles.list.hint")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: FallbacksCard_module_css_default.list,
													children: roleRows.map((row, index) => {
														const invalid = invalidRoleIds?.has(row.id.trim()) ?? false;
														const seed = seededIds.get(row.id.trim());
														const roleSummary = row.selectors.map(selectorRowToRaw).find((entry) => entry !== "") ?? row.fallback;
														const roleExpanded = !row.collapsed || !writable;
														return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: FallbacksCard_module_css_default.editorCard,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																className: FallbacksCard_module_css_default.collapseRow,
																children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
																	type: "button",
																	className: FallbacksCard_module_css_default.collapseToggle,
																	"aria-expanded": roleExpanded,
																	"aria-label": t(roleExpanded ? "roles.collapse" : "roles.expand"),
																	disabled: !writable,
																	onClick: () => {
																		updateRoleRow(index, { collapsed: !row.collapsed });
																	},
																	children: [
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: roleExpanded ? `${FallbacksCard_module_css_default.chevron} ${FallbacksCard_module_css_default.chevronOpen}` : FallbacksCard_module_css_default.chevron }),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			className: FallbacksCard_module_css_default.collapseTitle,
																			children: row.id
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			className: FallbacksCard_module_css_default.collapseMeta,
																			children: roleSummary
																		})
																	]
																})
															}), roleExpanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																	className: FallbacksCard_module_css_default.ruleGrid,
																	children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: FallbacksCard_module_css_default.ruleCell,
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.ruleCellLabel,
																				children: t("roles.id")
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																				className: `${FallbacksCard_module_css_default.input} ${invalid ? FallbacksCard_module_css_default.inputInvalid : ""}`,
																				value: row.id,
																				placeholder: t("roles.idPlaceholder"),
																				"aria-label": t("roles.id"),
																				"aria-invalid": invalid ? true : void 0,
																				disabled: !writable || seed !== void 0,
																				onChange: (event) => {
																					updateRoleRow(index, { id: event.target.value });
																				}
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.hint,
																				children: t("roles.id.hint")
																			})
																		]
																	})
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																	className: FallbacksCard_module_css_default.ruleGrid,
																	children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: FallbacksCard_module_css_default.ruleCell,
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.ruleCellLabel,
																				children: t("roles.persona")
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
																				rows: 3,
																				className: `${FallbacksCard_module_css_default.input} ${FallbacksCard_module_css_default.inputTextarea}`,
																				value: row.persona,
																				placeholder: t("roles.personaPlaceholder"),
																				"aria-label": t("roles.persona"),
																				disabled: !writable,
																				onChange: (event) => {
																					updateRoleRow(index, { persona: event.target.value });
																				}
																			}),
																			seed !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																				className: FallbacksCard_module_css_default.hint,
																				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																					className: FallbacksCard_module_css_default.pending,
																					children: t(seed ? "roles.seedOverride" : "roles.seedDefault")
																				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																					variant: "outline",
																					size: "sm",
																					disabled: !writable || saving,
																					onClick: () => {
																						forceReseed.current = true;
																						controller.revertSeed(row.id.trim()).then((persona) => {
																							if (persona === void 0) return;
																							updateRoleRow(index, { persona });
																						});
																					},
																					children: t("roles.revertPersona")
																				})]
																			})
																		]
																	})
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	className: FallbacksCard_module_css_default.chainSelectors,
																	children: [row.selectors.map((selector, selectorIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChainSelectorEditor, {
																		selector,
																		catalog: catalogOf(state),
																		configuredProviders: state.configuredProviders,
																		disabled: !writable,
																		t,
																		onChange: (patch) => {
																			updateRoleSelector(index, selectorIndex, patch);
																		},
																		onRemove: () => {
																			removeRoleSelector(index, selectorIndex);
																		}
																	}, selectorIndex)), row.selectors.every((selector) => selectorRowToRaw(selector) === "") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		className: FallbacksCard_module_css_default.hint,
																		children: seed !== void 0 ? t("roles.seedChainOptional", { id: row.id }) : t("validation.roleChainRequired", { id: row.id })
																	})]
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																	className: FallbacksCard_module_css_default.ruleGrid,
																	children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: FallbacksCard_module_css_default.ruleCell,
																		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			className: FallbacksCard_module_css_default.ruleCellLabel,
																			children: t("roles.fallback")
																		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
																			className: `${FallbacksCard_module_css_default.input} ${FallbacksCard_module_css_default.selectInput}`,
																			value: row.fallback,
																			"aria-label": t("roles.fallback"),
																			disabled: !writable,
																			onChange: (event) => {
																				updateRoleRow(index, { fallback: event.target.value });
																			},
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																				value: "inherit-root",
																				children: t("roles.fallback.inherit-root")
																			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																				value: "none",
																				children: t("roles.fallback.none")
																			})]
																		})]
																	})
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																	variant: "outline",
																	size: "sm",
																	icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
																	className: FallbacksCard_module_css_default.addButton,
																	onClick: () => {
																		addRoleSelector(index);
																	},
																	children: t("roles.selector.add")
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																	className: FallbacksCard_module_css_default.cardFoot,
																	children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																		type: "button",
																		className: `${FallbacksCard_module_css_default.iconButton} ${FallbacksCard_module_css_default.iconButtonDanger}`,
																		"data-tip": t("roles.remove"),
																		"aria-label": t("roles.remove"),
																		onClick: () => {
																			removeRole(index);
																		},
																		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
																	})
																})
															] })]
														}, index);
													})
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: "outline",
													size: "sm",
													icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
													className: FallbacksCard_module_css_default.addButton,
													onClick: addRole,
													children: t("roles.add")
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: FallbacksCard_module_css_default.field,
											role: "group",
											"aria-labelledby": "fallbacks-roles-rules",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: FallbacksCard_module_css_default.fieldLabel,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														id: "fallbacks-roles-rules",
														children: t("roles.rules")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
														label: t("roles.rules.tooltip"),
														disabled: !writable
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: FallbacksCard_module_css_default.hint,
													children: t("roles.rules.hint")
												}),
												state.catalogStatus === "error" && state.catalogError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: FallbacksCard_module_css_default.hint,
													children: t("catalog.error", { message: state.catalogError })
												}),
												state.catalogStatus === "ready" && state.catalogError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: FallbacksCard_module_css_default.hint,
													children: t("catalog.partial", { message: state.catalogError })
												}),
												state.catalogStatus === "ready" && (state.groups.length === 0 || state.configuredProviders.length === 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: FallbacksCard_module_css_default.hint,
													children: t("catalog.empty")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: FallbacksCard_module_css_default.list,
													children: ruleRows.map((row, index) => {
														const catalog = catalogOf(state);
														const providerRaw = selectionToRaw(row.provider);
														const group = catalog?.groups.find((entry) => entry.id === providerRaw);
														const providerOutside = row.provider?.kind === "outside";
														const providerUnconfigured = !providerOutside && providerRaw !== "" && (catalog?.providers.some((entry) => entry.provider === providerRaw) ?? false) && !state.configuredProviders.some((entry) => entry.provider === providerRaw);
														const modelOutside = row.model?.kind === "outside";
														const roleOutside = row.role !== "" && !roleOptions.includes(row.role);
														return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: FallbacksCard_module_css_default.editorCard,
															children: [
																/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	className: FallbacksCard_module_css_default.ruleGrid,
																	children: [
																		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																			className: FallbacksCard_module_css_default.ruleCell,
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.ruleCellLabel,
																				children: t("roles.rule.provider")
																			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
																				className: `${FallbacksCard_module_css_default.input} ${FallbacksCard_module_css_default.selectInput}`,
																				value: providerRaw,
																				onChange: (event) => {
																					if (event.target.value === providerRaw) return;
																					updateRuleRow(index, {
																						provider: classifyProvider(event.target.value, catalog),
																						model: null
																					});
																				},
																				children: [
																					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																						value: "",
																						children: t("roles.rule.provider.any")
																					}),
																					state.configuredProviders.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																						value: entry.provider,
																						children: entry.displayName
																					}, entry.provider)),
																					providerUnconfigured && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																						value: providerRaw,
																						children: `${providerRaw}${t("catalog.unconfigured.short")}`
																					}),
																					providerOutside && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																						value: providerRaw,
																						children: `${providerRaw}${t("catalog.outside.short")}`
																					})
																				]
																			})]
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																			className: FallbacksCard_module_css_default.ruleCell,
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.ruleCellLabel,
																				children: t("roles.rule.model")
																			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
																				className: `${FallbacksCard_module_css_default.input} ${FallbacksCard_module_css_default.selectInput}`,
																				value: selectionToRaw(row.model),
																				onChange: (event) => {
																					updateRuleRow(index, { model: classifyModel(providerRaw, event.target.value, catalog) });
																				},
																				children: [
																					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																						value: "",
																						children: t("roles.rule.model.any")
																					}),
																					(group?.models ?? []).map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																						value: model.id,
																						children: model.name
																					}, model.id)),
																					modelOutside && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																						value: selectionToRaw(row.model),
																						children: `${selectionToRaw(row.model)}${t("catalog.outside.short")}`
																					})
																				]
																			})]
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																			className: FallbacksCard_module_css_default.ruleCell,
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: FallbacksCard_module_css_default.ruleCellLabel,
																				children: t("roles.rule.role")
																			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
																				className: `${FallbacksCard_module_css_default.input} ${FallbacksCard_module_css_default.selectInput}`,
																				value: row.role,
																				disabled: !writable,
																				onChange: (event) => {
																					updateRuleRow(index, { role: event.target.value });
																				},
																				children: [
																					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																						value: "",
																						children: t("roles.rule.roleSelectPlaceholder")
																					}),
																					roleOptions.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																						value: id,
																						children: id === "inherit" ? t("roles.rule.role.inherit") : id
																					}, id)),
																					roleOutside && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																						value: row.role,
																						children: `${row.role}${t("roles.rule.roleUndeclared.short")}`
																					})
																				]
																			})]
																		})
																	]
																}),
																(providerOutside || modelOutside) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																	className: FallbacksCard_module_css_default.hint,
																	children: [t("catalog.outside.hint"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
																		label: t("catalog.outside.tooltip"),
																		disabled: !writable
																	})]
																}),
																row.role === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: FallbacksCard_module_css_default.hint,
																	children: t("validation.ruleRoleRequired")
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																	className: FallbacksCard_module_css_default.cardFoot,
																	children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																		type: "button",
																		className: `${FallbacksCard_module_css_default.iconButton} ${FallbacksCard_module_css_default.iconButtonDanger}`,
																		"data-tip": t("roles.removeRule"),
																		"aria-label": t("roles.removeRule"),
																		onClick: () => {
																			setRuleRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
																		},
																		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
																	})
																})
															]
														}, index);
													})
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: "outline",
													size: "sm",
													icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
													className: FallbacksCard_module_css_default.addButton,
													onClick: () => {
														setRuleRows((rows) => [...rows, {
															provider: null,
															model: null,
															role: ""
														}]);
													},
													children: t("roles.addRule")
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: FallbacksCard_module_css_default.field,
											role: "group",
											"aria-labelledby": "fallbacks-advanced",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: FallbacksCard_module_css_default.sectionToggle,
												disabled: !writable,
												"aria-expanded": advancedVisible,
												"aria-controls": advancedVisible ? "fallbacks-advanced-body" : void 0,
												"aria-label": t(advancedVisible ? "advanced.collapse" : "advanced.expand"),
												onClick: () => {
													if (writable) setAdvancedOpen(!advancedOpen);
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													id: "fallbacks-advanced",
													className: FallbacksCard_module_css_default.sectionToggleText,
													children: t("advanced.label")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: advancedVisible ? `${FallbacksCard_module_css_default.chevron} ${FallbacksCard_module_css_default.chevronOpen}` : FallbacksCard_module_css_default.chevron })]
											}), advancedVisible && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												id: "fallbacks-advanced-body",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: FallbacksCard_module_css_default.checkboxRow,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: FallbacksCard_module_css_default.checkLabel,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																className: FallbacksCard_module_css_default.checkLabelTitle,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																	htmlFor: "fallbacks-role-automatch",
																	children: t("roleAutoMatch.label")
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
																	label: t("roleAutoMatch.tooltip"),
																	disabled: !writable
																})]
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: FallbacksCard_module_css_default.checkLabelDesc,
																children: t("roleAutoMatch.hint")
															})]
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															id: "fallbacks-role-automatch",
															type: "checkbox",
															className: FallbacksCard_module_css_default.checkbox,
															checked: scalars.roleAutoMatch,
															disabled: !writable,
															onChange: (event) => {
																updateScalars((draft) => {
																	draft.roleAutoMatch = event.target.checked;
																});
															}
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: FallbacksCard_module_css_default.field,
														role: "group",
														"aria-labelledby": "fallbacks-trigger-codes",
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																className: FallbacksCard_module_css_default.fieldLabel,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	id: "fallbacks-trigger-codes",
																	children: t("triggerCodes.label")
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
																	label: t("triggerCodes.tooltip"),
																	disabled: !writable
																})]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: FallbacksCard_module_css_default.hint,
																children: t("triggerCodes.hint")
															}),
															KNOWN_TRIGGER_CODES.map((code) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																className: FallbacksCard_module_css_default.optionRow,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																	type: "checkbox",
																	checked: scalars.triggerCodes.includes(code),
																	onChange: (event) => {
																		updateScalars((draft) => {
																			draft.triggerCodes = withTriggerCode(draft.triggerCodes, code, event.target.checked);
																		});
																	}
																}), t(TRIGGER_CODE_LABELS[code])]
															}, code)),
															unknownCodes.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: FallbacksCard_module_css_default.hint,
																children: t("triggerCodes.extra", { codes: unknownCodes.join(", ") })
															})
														]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: FallbacksCard_module_css_default.field,
														role: "group",
														"aria-labelledby": "fallbacks-revert-policy",
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																className: FallbacksCard_module_css_default.fieldLabel,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	id: "fallbacks-revert-policy",
																	children: t("revertPolicy.label")
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
																	label: t("revertPolicy.tooltip"),
																	disabled: !writable
																})]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: FallbacksCard_module_css_default.hint,
																children: t("revertPolicy.hint")
															}),
															["cooldown-expiry", "never"].map((policy) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																className: FallbacksCard_module_css_default.optionRow,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																	type: "radio",
																	name: "fallbacks-revert-policy",
																	checked: scalars.revertPolicy === policy,
																	onChange: () => {
																		updateScalars((draft) => {
																			draft.revertPolicy = policy;
																		});
																	}
																}), t(`revertPolicy.${policy}`)]
															}, policy))
														]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: FallbacksCard_module_css_default.numberFields,
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: FallbacksCard_module_css_default.field,
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		className: FallbacksCard_module_css_default.fieldLabel,
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																				htmlFor: "fallbacks-cooldown-ms",
																				children: t("cooldownMs.label")
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
																				label: t("cooldownMs.tooltip"),
																				disabled: !writable
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																				className: FallbacksCard_module_css_default.defaultNote,
																				children: [
																					t("defaults.prefix"),
																					": ",
																					state.config.cooldownMs
																				]
																			})
																		]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																		id: "fallbacks-cooldown-ms",
																		className: FallbacksCard_module_css_default.input,
																		type: "number",
																		min: 0,
																		value: String(scalars.cooldownMs),
																		disabled: !writable,
																		onChange: (event) => {
																			updateScalars((draft) => {
																				draft.cooldownMs = parseCount(event.target.value);
																			});
																		}
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		className: FallbacksCard_module_css_default.hint,
																		children: t("cooldownMs.hint")
																	})
																]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: FallbacksCard_module_css_default.field,
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		className: FallbacksCard_module_css_default.fieldLabel,
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																				htmlFor: "fallbacks-max-switches",
																				children: t("maxSwitchesPerStep.label")
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
																				label: t("maxSwitchesPerStep.tooltip"),
																				disabled: !writable
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																				className: FallbacksCard_module_css_default.defaultNote,
																				children: [
																					t("defaults.prefix"),
																					": ",
																					state.config.maxSwitchesPerStep
																				]
																			})
																		]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																		id: "fallbacks-max-switches",
																		className: FallbacksCard_module_css_default.input,
																		type: "number",
																		min: 0,
																		value: String(scalars.maxSwitchesPerStep),
																		disabled: !writable,
																		onChange: (event) => {
																			updateScalars((draft) => {
																				draft.maxSwitchesPerStep = parseCount(event.target.value);
																			});
																		}
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		className: FallbacksCard_module_css_default.hint,
																		children: t("maxSwitchesPerStep.hint")
																	})
																]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: FallbacksCard_module_css_default.field,
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		className: FallbacksCard_module_css_default.fieldLabel,
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																				htmlFor: "fallbacks-always-cap",
																				children: t("alwaysModeRetryCap.label")
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
																				label: t("alwaysModeRetryCap.tooltip"),
																				disabled: !writable
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																				className: FallbacksCard_module_css_default.defaultNote,
																				children: [
																					t("defaults.prefix"),
																					": ",
																					state.config.alwaysModeRetryCap
																				]
																			})
																		]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																		id: "fallbacks-always-cap",
																		className: FallbacksCard_module_css_default.input,
																		type: "number",
																		min: 0,
																		value: String(scalars.alwaysModeRetryCap),
																		disabled: !writable,
																		onChange: (event) => {
																			updateScalars((draft) => {
																				draft.alwaysModeRetryCap = parseCount(event.target.value);
																			});
																		}
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		className: FallbacksCard_module_css_default.hint,
																		children: t("alwaysModeRetryCap.hint")
																	})
																]
															})
														]
													}),
													validationErrors.advanced.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: FallbacksCard_module_css_default.error,
														role: "alert",
														children: `${t("validation.blocked")}${validationErrors.advanced.join("; ")}`
													}),
													lastSaveSection === "advanced" && state.status === "error" && state.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: FallbacksCard_module_css_default.error,
														role: "alert",
														children: t("error.generic", { message: state.error })
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: FallbacksCard_module_css_default.sectionActions,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${FallbacksCard_module_css_default.secondaryButton} ${FallbacksCard_module_css_default.sectionAction}`,
															disabled: !advancedDirty || saving,
															onClick: () => {
																discardSection("advanced");
															},
															children: t("discard")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${FallbacksCard_module_css_default.primaryButton} ${FallbacksCard_module_css_default.sectionAction}`,
															disabled: !writable || saving || !advancedDirty,
															onClick: () => {
																save("advanced");
															},
															children: saving ? t("save.saving") : t("save")
														})]
													})
												]
											})]
										})
									]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: FallbacksCard_module_css_default.statusBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: FallbacksCard_module_css_default.statusTitle,
								children: t("status.title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: FallbacksCard_module_css_default.statusLine,
								role: state.switchesStatus === "error" ? "alert" : void 0,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: FallbacksCard_module_css_default.statusLineLabel,
									children: t("status.switches.label")
								}), switchesLine]
							})]
						})
					]
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/dsh-llm-fallbacks/dsh-llm-fallbacks/src/client/GeneralFallbacksRow.module.css.mjs
		const css$1 = "\n\n._440e1d7b_row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 16px 0;\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\n}\n\n._a4f2ceec_rowText {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  padding-right: 48px;\n}\n\n._9865b509_title {\n  font-size: 14px;\n  font-weight: 400;\n  line-height: 22px;\n  color: var(--dsw-alias-label-primary);\n}\n\n\n._10a44713_summary {\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n\n._35648278_badge {\n  flex: none;\n  padding: 2px 10px;\n  border-radius: 9px;\n  font-size: 12px;\n  line-height: 18px;\n  background: var(--dsw-alias-bg-module-platform);\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._3b9e8609_badgeEnabled {\n  color: var(--dsw-alias-state-success-primary);\n}\n";
		const tagId$1 = "dsh-llm-fallbacks/GeneralFallbacksRow.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-llm-fallbacks";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var GeneralFallbacksRow_module_css_default = {
			"row": "_440e1d7b_row",
			"rowText": "_a4f2ceec_rowText",
			"title": "_9865b509_title",
			"summary": "_10a44713_summary",
			"badge": "_35648278_badge",
			"badgeEnabled": "_3b9e8609_badgeEnabled"
		};
		//#endregion
		//#region src/client/GeneralFallbacksRow.tsx
		/**
		* Fallbacks status row — the `fallbacks` read-only row on the dsh General
		* settings page (plan fallbacks-aux-seams, task 1). Registered into the
		* `settings.general.item` slot (id `fallbacks`, order 100 — after every
		* upstream preference row: agent-preset -25 / permission -20 / language 0 /
		* appearance 10 / composer-enter 20, so the informational row renders at the
		* column end). Owner props are intentionally empty (`children?: never`,
		* dsh-private ui-settings slots.ts:81-84 — the section column only stacks),
		* so all data flows through the shared {@link FallbacksSettingsController}
		* (the same instance the plugin-config card consumes): the row triggers the
		* first read on mount when the store is still idle, and the pushed
		* invalidations wired in `apply` (`settings/document-updated` fallbacks-ns +
		* `connection/reset`, which refresh only already-read stores) keep it fresh
		* afterwards — no new data path, no store API change.
		*
		* The row is read-only by design (偏好位语义: a General preference row is not
		* a control surface): an enabled badge + a compact last-switch summary.
		* Honest degraded states: a hard load error or an unreachable gateway
		* channel (`ready && !present`) render the neutral 'unknown' badge — a
		* channel-down read must never masquerade as 'disabled' (KD-G5); the
		* switches face keeps its own error/empty states (D-5 semantics unchanged).
		*
		* Geometry follows the upstream Setting-Cell (figma 501:30011 — gap 8,
		* pad 16/0, hairline separator, title over subtitle in the text column, a
		* small non-interactive pill on the right); every color resolves through a
		* `--dsw-alias-*` token (light/dark adaptive).
		*/
		/**
		* Render the Fallbacks status row.
		* @param props - composed slot props.
		* @returns the row element tree.
		*/
		function GeneralFallbacksRow({ controller, useSnapshot, t }) {
			const state = useSnapshot((snapshot) => snapshot);
			(0, react.useEffect)(() => {
				const snapshot = controller.store.getSnapshot();
				if (snapshot.status === "idle") controller.load();
				if (snapshot.switchesStatus === "idle") controller.loadSwitches();
			}, [controller]);
			const settled = state.status === "ready";
			const badgeKey = settled && state.present ? state.config.enabled ? "general.enabled" : "general.disabled" : "general.unknown";
			const latestSwitch = state.switches[0];
			let summary;
			if (state.status === "error") summary = t("general.error", { message: state.error ?? "" });
			else if (!settled) summary = t("loading");
			else if (!state.present) summary = t("general.unavailable");
			else if (state.switchesStatus === "error") summary = t("status.switches.error", { message: state.switchesError ?? "" });
			else if (state.switchesStatus === "loading") summary = t("loading");
			else if (latestSwitch === void 0) summary = t("general.switch.empty");
			else {
				const reasonKey = SWITCH_REASON_KEYS[latestSwitch.reason];
				const params = {
					from: `${latestSwitch.from.provider}/${latestSwitch.from.model}`,
					to: `${latestSwitch.to.provider}/${latestSwitch.to.model}`,
					role: latestSwitch.role,
					reason: reasonKey === void 0 ? latestSwitch.reason : t(reasonKey)
				};
				summary = latestSwitch.reason === "role-inject" ? t("general.switch.roleInject", params) : t("general.switch", params);
			}
			const alert = state.status === "error" || state.switchesStatus === "error";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: GeneralFallbacksRow_module_css_default.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: GeneralFallbacksRow_module_css_default.rowText,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: GeneralFallbacksRow_module_css_default.title,
						children: t("general.title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: GeneralFallbacksRow_module_css_default.summary,
						role: alert ? "alert" : void 0,
						children: summary
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: `${GeneralFallbacksRow_module_css_default.badge} ${badgeKey === "general.enabled" ? GeneralFallbacksRow_module_css_default.badgeEnabled : ""}`,
					children: t(badgeKey)
				})]
			});
		}
		//#endregion
		//#region src/client/switch-guard.ts
		/**
		* True when `value` is a well-formed `fallbacks/switch` payload — the ONE
		* client-side shape guard, shared by the conversation node definition's
		* `match`/`start` and the renderer's degrade check (both in
		* `src/client/ConversationFallbackSwitch.tsx`).
		*
		* The durable session log is append-only and survives plugin/host upgrades,
		* so a `fallbacks/switch` event or node payload may carry a stale or
		* corrupted shape — version skew must degrade the transcript line (a
		* title-only notice), never crash the session assembly or the renderer.
		*
		* The HOST-side mirror (`src/commands.ts` `isFallbacksSwitchData`) lives in
		* a DIFFERENT bundle (host vs client) — it intentionally stays separate; do
		* not merge the two guards across the bundle boundary.
		*/
		function isFallbacksSwitchData(value) {
			if (typeof value !== "object" || value === null) return false;
			const payload = value;
			if (typeof payload.turn !== "number" || typeof payload.step !== "number") return false;
			if (typeof payload.role !== "string" || typeof payload.reason !== "string") return false;
			const from = payload.from;
			const to = payload.to;
			return typeof from?.provider === "string" && typeof from?.model === "string" && typeof to?.provider === "string" && typeof to?.model === "string";
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/dsh-llm-fallbacks/dsh-llm-fallbacks/src/client/ConversationFallbackSwitch.module.css.mjs
		const css = "\n\n._ea99bbef_switchRow {\n  display: flex;\n  align-items: center;\n  padding: 2px 0;\n  font-size: 14px;\n  line-height: 24px;\n}\n\n\n._02580bfd_switchTitle {\n  flex: none;\n  color: var(--dsw-alias-state-warn-primary);\n}\n\n._88b2d18b_switchSep {\n  flex: none;\n  width: 2px;\n  height: 2px;\n  margin: 0 8px;\n  border-radius: 1px;\n  background: var(--dsw-alias-label-caption);\n}\n\n\n._7c8c1b6f_switchSummary {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n\n._fdc977bc_roleBadge {\n  flex: none;\n  max-width: 96px;\n  padding: 0 8px;\n  border-radius: 999px;\n  font-size: 12px;\n  line-height: 20px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  background: var(--dsw-alias-bg-module-platform);\n  color: var(--dsw-alias-label-primary);\n}\n\n\n._dce8ba28_roleModelMap {\n  flex: 0 1 auto;\n  min-width: 0;\n  margin-left: 8px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-secondary);\n}\n";
		const tagId = "dsh-llm-fallbacks/ConversationFallbackSwitch.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-llm-fallbacks";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ConversationFallbackSwitch_module_css_default = {
			"switchRow": "_ea99bbef_switchRow",
			"switchTitle": "_02580bfd_switchTitle",
			"switchSep": "_88b2d18b_switchSep",
			"switchSummary": "_7c8c1b6f_switchSummary",
			"roleBadge": "_fdc977bc_roleBadge",
			"roleModelMap": "_dce8ba28_roleModelMap"
		};
		//#endregion
		//#region src/client/ConversationFallbackSwitch.tsx
		/**
		* One switch event → one chat node. Each `fallbacks/switch` event is its own
		* Context (id = event seq — the durable unique key), so every match is a
		* `start`; `update` is a passthrough (no aggregation — D3's per-Turn
		* counting is a separate, unselected seam).
		*/
		const fallbackSwitchDefinition = {
			kind: "fallbacks-switch",
			target: "chat",
			match: (event) => event.type === "fallbacks/switch" && Number.isInteger(event.seq) && isFallbacksSwitchData(event.data) ? {
				id: String(event.seq),
				role: "start"
			} : null,
			start: (_context, match) => {
				if (match.event.type !== "fallbacks/switch") throw new Error("fallbacks-switch start requires a fallbacks/switch event");
				const { seq, time } = match.event;
				if (!Number.isInteger(seq) || !isFallbacksSwitchData(match.event.data)) return {
					seq,
					time
				};
				const { turn, step, from, to, role, reason } = match.event.data;
				return {
					seq,
					time,
					turn,
					step,
					from,
					to,
					role,
					reason
				};
			},
			update: (context) => context.state,
			buildViewNode: (context) => {
				if (context.start === void 0 || context.state === void 0) return null;
				return {
					key: context.key,
					kind: "fallbacks-switch",
					id: context.id,
					target: "chat",
					anchorSeq: context.start.event.seq,
					location: context.start.location,
					visibility: "visible",
					data: context.state
				};
			}
		};
		/**
		* Render one fallback switch as a compact system-style transcript line.
		*
		* Geometry follows the upstream chat system rows (the compaction boundary
		* notice: warning-toned title + separator + ellipsized summary —
		* `chat/MessageItem .module.css:38-122`); every color resolves through a
		* `--dsw-alias-*` token. A reason outside the current union renders raw (forward-compatible
		* durable log, same rule as the card/general row summaries). A malformed or
		* partial payload (version skew) degrades to the title-only line instead of
		* throwing during interpolation — the transcript slot stays visible with the
		* warning-toned "model downgraded" title (T1 copy) and no summary details.
		* @param props - composed keyed seat props.
		* @returns the switch line element tree.
		*/
		function ConversationFallbackSwitch({ node, t }) {
			const data = node.data;
			if (!isFallbacksSwitchData(data)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: ConversationFallbackSwitch_module_css_default.switchRow,
				role: "status",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ConversationFallbackSwitch_module_css_default.switchTitle,
					children: t("chat.switch.title")
				})
			});
			const reasonKey = SWITCH_REASON_KEYS[data.reason];
			const reason = reasonKey === void 0 ? data.reason : t(reasonKey);
			const isRoleMapped = data.role !== "inherit";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ConversationFallbackSwitch_module_css_default.switchRow,
				role: "status",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ConversationFallbackSwitch_module_css_default.switchTitle,
						children: t("chat.switch.title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ConversationFallbackSwitch_module_css_default.switchSep,
						"aria-hidden": "true"
					}),
					isRoleMapped ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ConversationFallbackSwitch_module_css_default.roleBadge,
							title: data.role,
							children: data.role
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ConversationFallbackSwitch_module_css_default.roleModelMap,
							children: t("chat.switch.roleMap", {
								role: data.role,
								model: `${data.to.provider}/${data.to.model}`
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ConversationFallbackSwitch_module_css_default.switchSep,
							"aria-hidden": "true"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ConversationFallbackSwitch_module_css_default.switchSummary,
							children: t("chat.switch.summary.roleInject", { reason })
						})
					] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ConversationFallbackSwitch_module_css_default.switchSummary,
						children: t("chat.switch.summary", {
							from: `${data.from.provider}/${data.from.model}`,
							to: `${data.to.provider}/${data.to.model}`,
							reason
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* Required services (cordis fiber inject); registrations wait on the slot
		* declaration. `conversationEvents` is declared because the D1 Definition
		* registration reads the service directly (`ctx.conversationEvents.register`
		* at the bottom of `apply` — explicit fiber-ordering parity with the
		* ui-workflow-run precedent, whose inject list includes it for the same
		* direct read). The runtime would still provide the service synchronously
		* on apply, but the declaration makes the dependency honest. `sessions` is
		* deliberately NOT injected (S-g): a non-web host without the dsh-session
		* client service must not hang the fiber waiting for it — the wiring reads
		* it reflectively and degrades to the switches empty state when absent
		* (`setCurrentSession` never called, `loadSwitches` ready with an empty
		* array, which the store already supports).
		*/
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"conversationEvents"
		];
		/**
		* Register the `fallbacks` dictionaries and the plugin-config card once the
		* `settings.plugin.item` declaration is on the ledger.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "llm-fallbacks: dictionaries");
			const connection = ctx.get("connection");
			const sessions = ctx.get("sessions");
			const controller = new FallbacksSettingsController(connection.api, connection.rpc);
			const useSnapshot = bindSnapshotSelector(controller.store);
			ctx.effect(() => {
				const syncSession = () => {
					controller.setCurrentSession(sessions?.list.getSnapshot().current);
				};
				if (sessions !== void 0) syncSession();
				const refresh = (ns) => {
					if (ns !== void 0 && ns !== "fallbacks") return;
					refreshFallbacksIfLoaded(controller);
					refreshSwitchesIfLoaded(controller);
				};
				const refreshCatalog = () => {
					refreshCatalogIfLoaded(controller);
				};
				let pendingReset = false;
				let disposed = false;
				const refreshAll = () => {
					if (pendingReset) return;
					pendingReset = true;
					queueMicrotask(() => {
						pendingReset = false;
						if (disposed) return;
						refresh();
						refreshCatalog();
					});
				};
				const disposers = [
					ctx.remote.$on("settings/document-updated", refresh),
					ctx.remote.$on("llm/adapters-updated", refreshCatalog),
					ctx.on("connection/reset", refreshAll),
					...sessions === void 0 ? [] : [sessions.list.subscribe(syncSession)]
				];
				return () => {
					disposed = true;
					for (const dispose of disposers) dispose();
					controller.dispose();
				};
			}, "llm-fallbacks: pushed invalidations");
			ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register({
					name: "settings.plugin.item",
					key: "fallbacks",
					locale: NS,
					inject: () => ({
						controller,
						useSnapshot
					})
				}, FallbacksCard);
			});
			ctx.slots.inject("settings.general.item", function* () {
				yield ctx.slots.register({
					name: "settings.general.item",
					id: "fallbacks",
					order: 100,
					locale: NS,
					inject: () => ({
						controller,
						useSnapshot
					})
				}, GeneralFallbacksRow);
			});
			ctx.effect(() => ctx.conversationEvents.register(fallbackSwitchDefinition), "llm-fallbacks: conversation node definition");
			ctx.slots.inject("conversation.chat.node", function* () {
				yield ctx.slots.register({
					name: "conversation.chat.node",
					key: "fallbacks-switch",
					locale: NS
				}, ConversationFallbackSwitch);
			});
		}
		//#endregion
		exports.FALLBACKS_SETTINGS_NS = FALLBACKS_SETTINGS_NS;
		exports.FallbacksSettingsController = FallbacksSettingsController;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
