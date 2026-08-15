window.__ModuleLoader__.load({
	id: "@canglongcl/dsh-web-review",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/annotation-contract.ts
		const ANNOTATION_LIMITS = {
			sessionId: 512,
			pageUrl: 4096,
			pageTitle: 500,
			id: 128,
			comment: 4e3,
			tagName: 64,
			role: 100,
			label: 500,
			cssPath: 2e3,
			fullPath: 4e3,
			stableClass: 100,
			stableClasses: 20,
			textContent: 300,
			anchorFile: 1e3,
			anchorComponent: 500,
			styleValue: 500,
			textValue: 2e3,
			viewportDimension: 1e5,
			snapshotId: 64
		};
		/** Narrow a node-generated value to the cross-face snapshot identity. */
		function AnnotationSnapshotId(value) {
			return value;
		}
		/** Strictly decode the node acknowledgement at the browser trust boundary. */
		function annotationSyncReceiptOf(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			const record = value;
			const keys = Object.keys(record);
			if (record.kind === "empty") return keys.length === 1 && keys[0] === "kind" ? { kind: "empty" } : void 0;
			if (record.kind !== "ready" || keys.length !== 2 || !keys.includes("kind") || !keys.includes("snapshotId") || typeof record.snapshotId !== "string" || record.snapshotId.length < 1 || record.snapshotId.length > ANNOTATION_LIMITS.snapshotId) return void 0;
			return {
				kind: "ready",
				snapshotId: AnnotationSnapshotId(record.snapshotId)
			};
		}
		/** Read this plugin's durable snapshot identity from an opaque message source. */
		function annotationSnapshotIdOfSource(source) {
			if (typeof source !== "object" || source === null || Array.isArray(source)) return void 0;
			const record = source;
			const snapshotId = record.snapshotId;
			if (record.kind !== "plugin" || record.plugin !== "dsh-web-review" || typeof snapshotId !== "string" || snapshotId.length < 1 || snapshotId.length > ANNOTATION_LIMITS.snapshotId) return void 0;
			return AnnotationSnapshotId(snapshotId);
		}
		//#endregion
		//#region src/annotation-properties.ts
		/**
		* Browser-annotation CSS property allowlist shared by both package faces.
		* Values remain user input and are validated separately; URL-bearing and
		* generated-content properties are intentionally absent.
		*/
		const EDITABLE_STYLE_PROPERTIES = [
			"color",
			"background-color",
			"opacity",
			"font-family",
			"font-size",
			"font-weight",
			"font-style",
			"line-height",
			"letter-spacing",
			"text-align",
			"text-decoration",
			"text-transform",
			"width",
			"height",
			"min-width",
			"max-width",
			"min-height",
			"max-height",
			"display",
			"position",
			"top",
			"right",
			"bottom",
			"left",
			"z-index",
			"flex-direction",
			"flex-wrap",
			"justify-content",
			"align-items",
			"align-content",
			"gap",
			"row-gap",
			"column-gap",
			"overflow",
			"margin-top",
			"margin-right",
			"margin-bottom",
			"margin-left",
			"padding-top",
			"padding-right",
			"padding-bottom",
			"padding-left",
			"border-width",
			"border-style",
			"border-color",
			"border-radius",
			"box-shadow",
			"transform"
		];
		const EDITABLE_STYLE_PROPERTY_SET = new Set(EDITABLE_STYLE_PROPERTIES);
		/** Strict wire-boundary predicate for one supported CSS property name. */
		function isEditableStyleProperty(value) {
			return EDITABLE_STYLE_PROPERTY_SET.has(value);
		}
		/** Reject values that can fetch/execute or break the one-value wire shape. */
		function isSafeAnnotationStyleValue(value) {
			const normalized = value.trim();
			return normalized !== "" && !/[\u0000-\u001f\u007f]/u.test(normalized) && !/(?:url|expression)\s*\(/iu.test(normalized) && !/@import/iu.test(normalized);
		}
		//#endregion
		//#region src/proxy-url.ts
		/** Reverse of {@link encodeTarget}. Throws on malformed percent sequences. */
		function decodeTarget(encoded) {
			return decodeURIComponent(encoded);
		}
		/** Absolute HTTP(S) page URL accepted by the isolated preview transport. */
		function isPreviewableUrl(value) {
			try {
				const url = new URL(value);
				return (url.protocol === "http:" || url.protocol === "https:") && url.username === "" && url.password === "";
			} catch {
				return false;
			}
		}
		//#endregion
		//#region src/preview-contract.ts
		/** Bounds for untrusted page evidence crossing the isolated-frame bridge. */
		const PREVIEW_ELEMENT_LIMITS = {
			tagName: 64,
			id: 512,
			className: 2e3,
			cssPath: 2e3,
			fullPath: 4e3,
			label: 500,
			role: 100,
			stableClass: 100,
			stableClasses: 20,
			anchorFile: 1e3,
			anchorComponent: 500,
			outerHTML: 1500,
			textContent: 300,
			computedValue: 500,
			styleValue: 500,
			stylePriority: 32,
			textValue: 2e3
		};
		/** Bounds for one serialized hierarchy response from the isolated frame. */
		const PREVIEW_TREE_LIMITS = {
			nodes: 2e3,
			depth: 100,
			key: 2e3
		};
		const PREVIEW_SESSIONS_PATH = "/webview-preview-sessions";
		const PREVIEW_CLIENT_HEADER = "x-dsh-web-review-client";
		const PREVIEW_BRIDGE_PROTOCOL = "dsh-web-review/bridge";
		const PREVIEW_ENTRY_PREFIX = `/.dsh-web-review/entry/`;
		function recordOf$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function exactKeys$1(record, keys) {
			return Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
		}
		function boundedString(value, cap, allowEmpty = true) {
			return typeof value === "string" && value.length <= cap && (allowEmpty || value.length > 0) ? value : void 0;
		}
		function finiteDimension(value, cap = 1e5) {
			return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= cap ? value : void 0;
		}
		function viewportOf$1(value) {
			const record = recordOf$1(value);
			if (record === void 0 || !exactKeys$1(record, ["width", "height"])) return void 0;
			const width = finiteDimension(record.width);
			const height = finiteDimension(record.height);
			return width === void 0 || height === void 0 || width < 0 || height < 0 ? void 0 : {
				width: Math.round(width),
				height: Math.round(height)
			};
		}
		function rectOf$1(value) {
			const record = recordOf$1(value);
			if (record === void 0 || !exactKeys$1(record, [
				"x",
				"y",
				"width",
				"height"
			])) return void 0;
			const x = finiteDimension(record.x);
			const y = finiteDimension(record.y);
			const width = finiteDimension(record.width);
			const height = finiteDimension(record.height);
			return x === void 0 || y === void 0 || width === void 0 || height === void 0 || width < 0 || height < 0 ? void 0 : {
				x,
				y,
				width,
				height
			};
		}
		function sessionIdOf(value) {
			return typeof value === "string" && /^[a-f\d]{32}$/u.test(value) ? value : void 0;
		}
		function channelOf(value) {
			return typeof value === "string" && /^[a-f\d]{32}$/u.test(value) ? value : void 0;
		}
		function elementHandleOf(value) {
			return typeof value === "string" && /^[a-f\d]{16,32}$/u.test(value) ? value : void 0;
		}
		/** Strictly decode the main-host or handoff session descriptor. */
		function previewSessionDescriptorOf(value) {
			const record = recordOf$1(value);
			if (record === void 0 || !exactKeys$1(record, [
				"sessionId",
				"frameUrl",
				"frameOrigin",
				"targetOrigin",
				"channel"
			])) return void 0;
			const sessionId = sessionIdOf(record.sessionId);
			const channel = channelOf(record.channel);
			const frameUrl = boundedString(record.frameUrl, 32768, false);
			const frameOrigin = boundedString(record.frameOrigin, 2048, false);
			const targetOrigin = boundedString(record.targetOrigin, 2048, false);
			if (sessionId === void 0 || channel === void 0 || frameUrl === void 0 || frameOrigin === void 0 || targetOrigin === void 0) return void 0;
			try {
				const url = new URL(frameUrl);
				const target = new URL(decodeTarget(url.pathname.slice(PREVIEW_ENTRY_PREFIX.length)));
				if (url.protocol !== "http:" || url.origin !== frameOrigin || url.hostname !== `${sessionId}.localhost` || !url.pathname.startsWith(PREVIEW_ENTRY_PREFIX) || url.username !== "" || url.password !== "" || !isPreviewableUrl(target.href) || target.origin !== targetOrigin || new URL(targetOrigin).origin !== targetOrigin) return void 0;
			} catch {
				return;
			}
			return {
				sessionId,
				frameUrl,
				frameOrigin,
				targetOrigin,
				channel
			};
		}
		function treeDetailOf(value) {
			const record = recordOf$1(value);
			if (record === void 0 || typeof record.kind !== "string") return void 0;
			if (record.kind === "empty" && exactKeys$1(record, ["kind"])) return { kind: "empty" };
			if (record.kind === "children" && exactKeys$1(record, ["kind", "count"]) && Number.isSafeInteger(record.count) && record.count >= 0 && record.count <= 1e5) return {
				kind: "children",
				count: record.count
			};
			const text = boundedString(record.text, 48);
			return record.kind === "text" && exactKeys$1(record, ["kind", "text"]) && text !== void 0 ? {
				kind: "text",
				text
			} : void 0;
		}
		function snapshotOf(value) {
			const record = recordOf$1(value);
			if (record === void 0 || !exactKeys$1(record, [
				"tagName",
				"id",
				"className",
				"cssPath",
				"fullPath",
				"label",
				"role",
				"stableClasses",
				"anchor",
				"inToolChrome",
				"outerHTML",
				"textContent",
				"rect",
				"computed"
			])) return void 0;
			if (typeof record.inToolChrome !== "boolean") return void 0;
			const stringCaps = {
				tagName: PREVIEW_ELEMENT_LIMITS.tagName,
				id: PREVIEW_ELEMENT_LIMITS.id,
				className: PREVIEW_ELEMENT_LIMITS.className,
				cssPath: PREVIEW_ELEMENT_LIMITS.cssPath,
				fullPath: PREVIEW_ELEMENT_LIMITS.fullPath,
				label: PREVIEW_ELEMENT_LIMITS.label,
				role: PREVIEW_ELEMENT_LIMITS.role,
				outerHTML: PREVIEW_ELEMENT_LIMITS.outerHTML,
				textContent: PREVIEW_ELEMENT_LIMITS.textContent
			};
			for (const [key, cap] of Object.entries(stringCaps)) if (boundedString(record[key], cap) === void 0) return void 0;
			if (!Array.isArray(record.stableClasses) || record.stableClasses.length > PREVIEW_ELEMENT_LIMITS.stableClasses || record.stableClasses.some((value) => boundedString(value, PREVIEW_ELEMENT_LIMITS.stableClass, false) === void 0)) return void 0;
			const rect = rectOf$1(record.rect);
			const computed = recordOf$1(record.computed);
			if (rect === void 0 || computed === void 0 || !exactKeys$1(computed, [
				"display",
				"position",
				"fontSize",
				"color",
				"backgroundColor",
				"margin",
				"padding",
				"width",
				"height"
			]) || Object.values(computed).some((item) => boundedString(item, PREVIEW_ELEMENT_LIMITS.computedValue) === void 0)) return void 0;
			const anchor = record.anchor;
			if (anchor !== null) {
				const anchorRecord = recordOf$1(anchor);
				const anchorKeys = anchorRecord === void 0 ? [] : Object.keys(anchorRecord);
				if (anchorRecord === void 0 || ![
					"react",
					"vue",
					"svelte"
				].includes(String(anchorRecord.framework)) || boundedString(anchorRecord.component, PREVIEW_ELEMENT_LIMITS.anchorComponent) === void 0 || boundedString(anchorRecord.file, PREVIEW_ELEMENT_LIMITS.anchorFile, false) === void 0 || ![
					"framework",
					"component",
					"file"
				].every((key) => anchorKeys.includes(key)) || anchorKeys.some((key) => ![
					"framework",
					"component",
					"file",
					"line"
				].includes(key)) || anchorRecord.line !== void 0 && (!Number.isSafeInteger(anchorRecord.line) || anchorRecord.line < 1)) return void 0;
			}
			return {
				...record,
				rect
			};
		}
		/** Strictly decode one serializable element target from an untrusted frame. */
		function previewElementTargetOf(value) {
			const record = recordOf$1(value);
			if (record === void 0 || !exactKeys$1(record, [
				"handle",
				"snapshot",
				"rect",
				"viewport",
				"baselines",
				"inlineStyles",
				"originalText",
				"detail",
				"navigation"
			])) return void 0;
			const handle = elementHandleOf(record.handle);
			const snapshot = snapshotOf(record.snapshot);
			const rect = rectOf$1(record.rect);
			const viewport = viewportOf$1(record.viewport);
			const detail = treeDetailOf(record.detail);
			const baselines = recordOf$1(record.baselines);
			const inlineStyles = recordOf$1(record.inlineStyles);
			const navigation = recordOf$1(record.navigation);
			if (handle === void 0 || snapshot === void 0 || rect === void 0 || viewport === void 0 || detail === void 0 || baselines === void 0 || inlineStyles === void 0 || navigation === void 0 || !exactKeys$1(baselines, EDITABLE_STYLE_PROPERTIES) || EDITABLE_STYLE_PROPERTIES.some((property) => boundedString(baselines[property], PREVIEW_ELEMENT_LIMITS.styleValue) === void 0) || Object.keys(inlineStyles).some((property) => !isEditableStyleProperty(property)) || !exactKeys$1(navigation, [
				"child",
				"parent",
				"previous-sibling",
				"next-sibling"
			]) || Object.values(navigation).some((item) => typeof item !== "boolean")) return void 0;
			const parsedInline = {};
			for (const property of EDITABLE_STYLE_PROPERTIES) {
				const raw = inlineStyles[property];
				if (raw === void 0) continue;
				const declaration = recordOf$1(raw);
				if (declaration === void 0 || !exactKeys$1(declaration, ["value", "priority"])) return void 0;
				const inlineValue = boundedString(declaration.value, PREVIEW_ELEMENT_LIMITS.styleValue);
				const priority = boundedString(declaration.priority, PREVIEW_ELEMENT_LIMITS.stylePriority);
				if (inlineValue === void 0 || priority === void 0) return void 0;
				parsedInline[property] = {
					value: inlineValue,
					priority
				};
			}
			const originalText = record.originalText;
			if (originalText !== null && boundedString(originalText, PREVIEW_ELEMENT_LIMITS.textValue) === void 0) return void 0;
			return {
				handle,
				snapshot,
				rect,
				viewport,
				baselines,
				inlineStyles: parsedInline,
				originalText,
				detail,
				navigation
			};
		}
		/** Decode only the bridge envelope; event payloads are decoded by the consumer. */
		function previewFrameMessageOf(value) {
			const record = recordOf$1(value);
			if (record === void 0 || record.protocol !== "dsh-web-review/bridge" || record.version !== 1 || record.direction !== "frame-to-host") return void 0;
			const channel = channelOf(record.channel);
			if (channel === void 0) return void 0;
			if (Object.hasOwn(record, "event")) {
				if (!exactKeys$1(record, [
					"protocol",
					"version",
					"channel",
					"direction",
					"event"
				])) return void 0;
				const event = recordOf$1(record.event);
				if (event === void 0 || typeof event.name !== "string" || !exactKeys$1(event, ["name", "payload"])) return void 0;
				return {
					protocol: PREVIEW_BRIDGE_PROTOCOL,
					version: 1,
					channel,
					direction: "frame-to-host",
					event
				};
			}
			if (!exactKeys$1(record, [
				"protocol",
				"version",
				"channel",
				"direction",
				"requestId",
				"response"
			])) return void 0;
			const requestId = boundedString(record.requestId, 64, false);
			const response = recordOf$1(record.response);
			if (requestId === void 0 || response === void 0 || typeof response.ok !== "boolean") return void 0;
			if (response.ok && exactKeys$1(response, ["ok", "value"])) return {
				protocol: PREVIEW_BRIDGE_PROTOCOL,
				version: 1,
				channel,
				direction: "frame-to-host",
				requestId,
				response: {
					ok: true,
					value: response.value
				}
			};
			const error = boundedString(response.error, 500, false);
			return !response.ok && exactKeys$1(response, ["ok", "error"]) && error !== void 0 ? {
				protocol: PREVIEW_BRIDGE_PROTOCOL,
				version: 1,
				channel,
				direction: "frame-to-host",
				requestId,
				response: {
					ok: false,
					error
				}
			} : void 0;
		}
		/** Strictly decode one bounded serialized hierarchy. */
		function previewTreeOf(value, budget = PREVIEW_TREE_LIMITS.nodes) {
			let remaining = budget;
			const visit = (raw, depth) => {
				if (remaining <= 0 || depth > PREVIEW_TREE_LIMITS.depth) return void 0;
				remaining -= 1;
				const record = recordOf$1(raw);
				if (record === void 0 || !exactKeys$1(record, [
					"handle",
					"key",
					"tagName",
					"detail",
					"current",
					"children"
				])) return void 0;
				const handle = elementHandleOf(record.handle);
				const key = boundedString(record.key, PREVIEW_TREE_LIMITS.key, false);
				const tagName = boundedString(record.tagName, 64, false);
				const detail = treeDetailOf(record.detail);
				if (handle === void 0 || key === void 0 || tagName === void 0 || detail === void 0 || typeof record.current !== "boolean" || !Array.isArray(record.children) || record.children.length > PREVIEW_TREE_LIMITS.nodes) return void 0;
				const children = [];
				for (const child of record.children) {
					const parsed = visit(child, depth + 1);
					if (parsed === void 0) return void 0;
					children.push(parsed);
				}
				return {
					handle,
					key,
					tagName,
					detail,
					current: record.current,
					children
				};
			};
			return visit(value, 0);
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* `webview` namespace dictionaries. These strings are UI-only; the stable
		* English model-facing context is node-owned in annotation-context.ts.
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"view.tab": "缃戦〉棰勮",
			"command.skills.description": "閫夋嫨涓€涓?UI 浼樺寲 Skill",
			"dock.count": "{count} 鏉℃敞閲?,
			"dock.details": "娉ㄩ噴涓婁笅鏂?,
			"dock.focus": "瀹氫綅绗?{index} 鏉℃敞閲婏細{target}",
			"dock.clear": "娓呴櫎鎵€鏈夋敞閲?,
			"dock.noComment": "鏈～鍐欐敞閲?,
			"dock.syncing": "姝ｅ湪鍑嗗",
			"dock.synced": "鍙戦€佹椂娉ㄥ叆",
			"dock.sync.failed": "鍚屾澶辫触",
			"dock.sync.error": "娉ㄩ噴涓婁笅鏂囧悓姝ュけ璐ワ紝璇烽噸璇?,
			"dock.sync.retry": "鍚屾澶辫触锛岀偣鍑婚噸璇?,
			"dock.clearing": "姝ｅ湪娓呴櫎娉ㄩ噴",
			"panel.urlPlaceholder": "杈撳叆缃戝潃锛屽洖杞︽墦寮€锛堝 https://example.com锛?,
			"panel.urlInvalid": "璇疯緭鍏ユ湁鏁堢殑 HTTP(S) 缃戝潃",
			"panel.previewUnavailable": "椤甸潰鏃犳硶閫氳繃闅旂棰勮鍔犺浇锛岃妫€鏌ョ綉鍧€鎴栫洰鏍囩珯鐐?,
			"panel.back": "鍚庨€€",
			"panel.forward": "鍓嶈繘",
			"panel.refresh": "鍒锋柊",
			"panel.external": "鍦ㄦ柊鏍囩椤垫墦寮€",
			"panel.pick": "娣诲姞椤甸潰娉ㄩ噴",
			"panel.pick.off": "閫€鍑烘敞閲婃ā寮?,
			"panel.pick.clear": "娓呯┖娉ㄩ噴",
			"panel.pick.active": "姝ｅ湪鎵规敞 路 {url}",
			"panel.pick.send": "鍙戦€?,
			"panel.pick.sending": "鍙戦€佷腑",
			"panel.pick.sendError": "鍙戦€侀〉闈㈡敞閲婂け璐ワ紝璇烽噸璇?,
			"panel.pick.slashDraft": "椤甸潰鎵规敞涓嶈兘闅忔枩鏉犲懡浠ゅ彂閫侊紝璇锋敼鐢ㄦ櫘閫氭秷鎭?,
			"panel.pick.defaultPrompt": "璇锋牴鎹〉闈㈡壒娉ㄤ慨鏀瑰墠绔疄鐜般€?,
			"panel.pick.hint": "鍦ㄩ〉闈腑鐐瑰嚮瑕佷慨鏀圭殑鍏冪礌锛岃緭鍏ユ敞閲婂悗鍥炶溅鍔犲叆鍒楄〃锛汦sc 閫€鍑恒€?,
			"panel.pick.remove": "绉婚櫎璇ュ厓绱?,
			"panel.pick.limit": "姣忎釜椤甸潰鏈€澶氫繚鐣?{count} 鏉℃敞閲?,
			"panel.comment.float": "娉ㄩ噴锛屽洖杞︾‘璁も€?,
			"panel.noUrl": "璇疯緭鍏ョ綉鍧€",
			"panel.loading": "姝ｅ湪寤虹珛闅旂棰勮鈥?,
			"panel.frame": "缃戦〉棰勮",
			"editor.adjust": "璋冩暣",
			"editor.skills.title": "鍐呯疆 Skill",
			"editor.skills.count": "{count} 涓?,
			"editor.skills.command": "涔熷彲鍦ㄨ緭鍏ユ杈撳叆 /{Skill 鍚嶇О}锛岀洿鎺ヨ皟鐢ㄥ崟涓?Skill銆?,
			"editor.skills.field": "閫夋嫨鏈浣跨敤鐨?Skill",
			"editor.skills.betterUi": "浜や簰銆佸姩鏁堜笌鐣岄潰缁嗚妭",
			"editor.skills.betterTypography": "瀛椾綋銆佸眰绾т笌鏂囨湰鎺掔増",
			"editor.skills.betterLayout": "缁撴瀯銆佸榻愪笌鍝嶅簲寮忓竷灞€",
			"editor.skills.betterWriting": "鐣岄潰鏂囨涓庢彁绀?,
			"editor.skills.betterAccessibility": "閿洏銆佺劍鐐逛笌杈呭姪鎶€鏈綋楠?,
			"editor.skills.betterColors": "閰嶈壊銆佸姣斿害涓庝富棰?,
			"editor.skills.betterInterface": "缁熺鐣岄潰璁捐涓庡疄鐜?,
			"editor.skills.interfaceReview": "妫€鏌ユ湰娆℃敼鍔ㄥ奖鍝嶇殑鐣岄潰",
			"editor.select": "閫夋嫨",
			"editor.select.child": "杩涘叆涓嬩竴绾?,
			"editor.select.child.short": "瀛愮骇",
			"editor.select.parent": "鍥炲埌鐖跺厓绱?,
			"editor.select.parent.short": "鐖剁骇",
			"editor.select.previousSibling": "涓婁竴鍏勫紵",
			"editor.select.previousSibling.short": "涓婁竴涓?,
			"editor.select.sibling": "涓嬩竴鍏勫紵",
			"editor.select.sibling.short": "涓嬩竴涓?,
			"editor.select.current": "宸查€夋嫨 {target}",
			"editor.select.tree": "鍏冪礌鏍?,
			"editor.select.children": "{count} 涓瓙鍏冪礌",
			"editor.select.empty": "绌哄厓绱?,
			"editor.select.expand": "灞曞紑 {tag}",
			"editor.select.collapse": "鏀惰捣 {tag}",
			"editor.comment": "鎻忚堪杩欎簺鏇存敼鈥?,
			"editor.cancel": "鍙栨秷",
			"editor.confirm": "纭娉ㄩ噴",
			"editor.hide": "鏆傛椂闅愯棌缂栬緫鍣?,
			"editor.show": "鏄剧ず缂栬緫鍣?,
			"editor.move": "绉诲姩缂栬緫鍣?,
			"editor.reset": "鎭㈠鍘熷€?,
			"editor.invalid": "璇疯緭鍏ユ湁鏁堢殑 CSS 鍊?,
			"editor.text": "鏂囨湰鍐呭",
			"editor.group.fill": "濉厖涓庨€忔槑搴?,
			"editor.group.typography": "瀛椾綋",
			"editor.group.size": "灏哄",
			"editor.group.layout": "甯冨眬涓庡榻?,
			"editor.group.spacing": "杈硅窛涓庡唴杈硅窛",
			"editor.group.margin": "澶栬竟璺濓紙Margin锛?,
			"editor.group.padding": "鍐呰竟璺濓紙Padding锛?,
			"editor.group.border": "杈规",
			"editor.group.effects": "鏁堟灉",
			"editor.property.color": "鏂囨湰棰滆壊",
			"editor.property.background": "鑳屾櫙",
			"editor.property.opacity": "閫忔槑搴?,
			"editor.property.fontFamily": "瀛椾綋",
			"editor.property.fontSize": "瀛楀彿",
			"editor.property.fontWeight": "瀛楅噸",
			"editor.property.fontStyle": "瀛楀舰",
			"editor.property.lineHeight": "琛岄珮",
			"editor.property.letterSpacing": "瀛楅棿璺?,
			"editor.property.textAlign": "瀵归綈鏂瑰紡",
			"editor.property.textDecoration": "鏂囨湰瑁呴グ",
			"editor.property.textTransform": "澶у皬鍐?,
			"editor.property.width": "瀹藉害",
			"editor.property.height": "楂樺害",
			"editor.property.minWidth": "鏈€灏忓搴?,
			"editor.property.maxWidth": "鏈€澶у搴?,
			"editor.property.minHeight": "鏈€灏忛珮搴?,
			"editor.property.maxHeight": "鏈€澶ч珮搴?,
			"editor.property.display": "鏄剧ず鏂瑰紡",
			"editor.property.position": "瀹氫綅鏂瑰紡",
			"editor.property.top": "涓婂亸绉?,
			"editor.property.right": "鍙冲亸绉?,
			"editor.property.bottom": "涓嬪亸绉?,
			"editor.property.left": "宸﹀亸绉?,
			"editor.property.zIndex": "灞傜骇",
			"editor.property.flexDirection": "鎺掑垪鏂瑰悜",
			"editor.property.flexWrap": "鎹㈣",
			"editor.property.justifyContent": "涓昏酱瀵归綈",
			"editor.property.alignItems": "浜ゅ弶杞村榻?,
			"editor.property.alignContent": "澶氳瀵归綈",
			"editor.property.gap": "闂磋窛",
			"editor.property.rowGap": "琛岄棿璺?,
			"editor.property.columnGap": "鍒楅棿璺?,
			"editor.property.overflow": "婧㈠嚭",
			"editor.property.marginTop": "涓婂杈硅窛",
			"editor.property.marginRight": "鍙冲杈硅窛",
			"editor.property.marginBottom": "涓嬪杈硅窛",
			"editor.property.marginLeft": "宸﹀杈硅窛",
			"editor.property.paddingTop": "涓婂唴杈硅窛",
			"editor.property.paddingRight": "鍙冲唴杈硅窛",
			"editor.property.paddingBottom": "涓嬪唴杈硅窛",
			"editor.property.paddingLeft": "宸﹀唴杈硅窛",
			"editor.property.borderRadius": "鍦嗚",
			"editor.property.borderWidth": "杈规瀹藉害",
			"editor.property.borderStyle": "杈规鏍峰紡",
			"editor.property.borderColor": "杈规棰滆壊",
			"editor.property.boxShadow": "闃村奖",
			"editor.property.transform": "鍙樻崲",
			"editor.action.bold": "鍔犵矖",
			"editor.action.italic": "鏂滀綋",
			"editor.action.underline": "涓嬪垝绾?,
			"editor.action.alignLeft": "宸﹀榻?,
			"editor.action.alignCenter": "灞呬腑瀵归綈",
			"editor.action.alignRight": "鍙冲榻?,
			"editor.action.justify": "涓ょ瀵归綈",
			"editor.action.linkValues": "鑱斿姩鏁板€?,
			"editor.action.unlinkValues": "鍙栨秷鑱斿姩",
			"editor.action.linkAllValues": "鑱斿姩鍥涜竟",
			"editor.action.unlinkAllValues": "鍙栨秷鍥涜竟鑱斿姩",
			"editor.action.choosePreset": "閫夋嫨棰勮鍊?,
			"editor.property.cornerTopLeft": "宸︿笂鍦嗚",
			"editor.property.cornerTopRight": "鍙充笂鍦嗚",
			"editor.property.cornerBottomRight": "鍙充笅鍦嗚",
			"editor.property.cornerBottomLeft": "宸︿笅鍦嗚",
			"editor.property.shadowX": "闃村奖姘村钩鍋忕Щ",
			"editor.property.shadowY": "闃村奖鍨傜洿鍋忕Щ",
			"editor.property.shadowBlur": "闃村奖妯＄硦",
			"editor.property.shadowSpread": "闃村奖鎵╂暎",
			"editor.property.shadowColor": "闃村奖棰滆壊",
			"editor.property.shadowInset": "鍐呴槾褰?,
			"editor.property.translateX": "姘村钩浣嶇Щ",
			"editor.property.translateY": "鍨傜洿浣嶇Щ",
			"editor.property.scaleX": "姘村钩缂╂斁",
			"editor.property.scaleY": "鍨傜洿缂╂斁",
			"editor.property.rotate": "鏃嬭浆",
			"editor.rawHint": "楂樼骇 CSS 鍊?,
			"editor.group.constraints": "绾︽潫涓庡畾浣?
		};
		/** English dictionary (same keys as {@link zh}). */
		const en = {
			"view.tab": "Web Preview",
			"command.skills.description": "Choose one UI optimization Skill",
			"dock.count": "{count} comments",
			"dock.details": "Comment context",
			"dock.focus": "Locate comment {index}: {target}",
			"dock.clear": "Clear all comments",
			"dock.noComment": "No comment supplied",
			"dock.syncing": "Preparing",
			"dock.synced": "Inject on send",
			"dock.sync.failed": "Sync failed",
			"dock.sync.error": "Could not sync browser comments. Try again.",
			"dock.sync.retry": "Sync failed; click to retry",
			"dock.clearing": "Clearing comments",
			"panel.urlPlaceholder": "Enter a URL and press Enter (e.g. https://example.com)",
			"panel.urlInvalid": "Enter a valid HTTP(S) URL",
			"panel.previewUnavailable": "The page could not load through isolated Preview. Check the URL or target site.",
			"panel.back": "Back",
			"panel.forward": "Forward",
			"panel.refresh": "Refresh",
			"panel.external": "Open in new tab",
			"panel.pick": "Add page comments",
			"panel.pick.off": "Exit annotation mode",
			"panel.pick.clear": "Clear comments",
			"panel.pick.active": "Annotating 路 {url}",
			"panel.pick.send": "Send",
			"panel.pick.sending": "Sending",
			"panel.pick.sendError": "Could not send page comments. Try again.",
			"panel.pick.slashDraft": "Page comments cannot be sent with a slash command. Use a normal message.",
			"panel.pick.defaultPrompt": "Please apply the page comments to the frontend implementation.",
			"panel.pick.hint": "Click an element in the page, type a comment and press Enter; Esc exits.",
			"panel.pick.remove": "Remove element",
			"panel.pick.limit": "Keep at most {count} comments per page",
			"panel.comment.float": "Comment, Enter to confirm鈥?,
			"panel.noUrl": "Enter a URL first",
			"panel.loading": "Starting isolated preview鈥?,
			"panel.frame": "Web preview",
			"editor.adjust": "Adjust",
			"editor.skills.title": "Built-in Skills",
			"editor.skills.count": "{count}",
			"editor.skills.command": "You can also enter /{Skill name} in the composer to invoke one Skill directly.",
			"editor.skills.field": "Choose Skills for this adjustment",
			"editor.skills.betterUi": "Interaction, motion, and interface details",
			"editor.skills.betterTypography": "Type, hierarchy, and text layout",
			"editor.skills.betterLayout": "Structure, alignment, and responsive layout",
			"editor.skills.betterWriting": "Interface copy and guidance",
			"editor.skills.betterAccessibility": "Keyboard, focus, and assistive technology",
			"editor.skills.betterColors": "Color, contrast, and appearance",
			"editor.skills.betterInterface": "Coordinate interface design and implementation",
			"editor.skills.interfaceReview": "Review interfaces affected by this change",
			"editor.select": "Select",
			"editor.select.child": "Enter child",
			"editor.select.child.short": "Child",
			"editor.select.parent": "Select parent",
			"editor.select.parent.short": "Parent",
			"editor.select.previousSibling": "Previous sibling",
			"editor.select.previousSibling.short": "Previous",
			"editor.select.sibling": "Next sibling",
			"editor.select.sibling.short": "Next",
			"editor.select.current": "Selected {target}",
			"editor.select.tree": "Element tree",
			"editor.select.children": "{count} children",
			"editor.select.empty": "Empty element",
			"editor.select.expand": "Expand {tag}",
			"editor.select.collapse": "Collapse {tag}",
			"editor.comment": "Describe these changes鈥?,
			"editor.cancel": "Cancel",
			"editor.confirm": "Confirm annotation",
			"editor.hide": "Temporarily hide editor",
			"editor.show": "Show editor",
			"editor.move": "Move editor",
			"editor.reset": "Restore original value",
			"editor.invalid": "Enter a valid CSS value",
			"editor.text": "Text content",
			"editor.group.fill": "Fill and opacity",
			"editor.group.typography": "Typography",
			"editor.group.size": "Dimensions",
			"editor.group.layout": "Layout and alignment",
			"editor.group.spacing": "Margin and padding",
			"editor.group.margin": "Margin",
			"editor.group.padding": "Padding",
			"editor.group.border": "Border",
			"editor.group.effects": "Effects",
			"editor.property.color": "Text color",
			"editor.property.background": "Background",
			"editor.property.opacity": "Opacity",
			"editor.property.fontFamily": "Font",
			"editor.property.fontSize": "Font size",
			"editor.property.fontWeight": "Font weight",
			"editor.property.fontStyle": "Font style",
			"editor.property.lineHeight": "Line height",
			"editor.property.letterSpacing": "Letter spacing",
			"editor.property.textAlign": "Alignment",
			"editor.property.textDecoration": "Decoration",
			"editor.property.textTransform": "Letter case",
			"editor.property.width": "Width",
			"editor.property.height": "Height",
			"editor.property.minWidth": "Min width",
			"editor.property.maxWidth": "Max width",
			"editor.property.minHeight": "Min height",
			"editor.property.maxHeight": "Max height",
			"editor.property.display": "Display",
			"editor.property.position": "Position",
			"editor.property.top": "Top",
			"editor.property.right": "Right",
			"editor.property.bottom": "Bottom",
			"editor.property.left": "Left",
			"editor.property.zIndex": "Layer",
			"editor.property.flexDirection": "Direction",
			"editor.property.flexWrap": "Wrap",
			"editor.property.justifyContent": "Justify",
			"editor.property.alignItems": "Align items",
			"editor.property.alignContent": "Align content",
			"editor.property.gap": "Gap",
			"editor.property.rowGap": "Row gap",
			"editor.property.columnGap": "Column gap",
			"editor.property.overflow": "Overflow",
			"editor.property.marginTop": "Margin top",
			"editor.property.marginRight": "Margin right",
			"editor.property.marginBottom": "Margin bottom",
			"editor.property.marginLeft": "Margin left",
			"editor.property.paddingTop": "Padding top",
			"editor.property.paddingRight": "Padding right",
			"editor.property.paddingBottom": "Padding bottom",
			"editor.property.paddingLeft": "Padding left",
			"editor.property.borderRadius": "Corner radius",
			"editor.property.borderWidth": "Border width",
			"editor.property.borderStyle": "Border style",
			"editor.property.borderColor": "Border color",
			"editor.property.boxShadow": "Shadow",
			"editor.property.transform": "Transform",
			"editor.action.bold": "Bold",
			"editor.action.italic": "Italic",
			"editor.action.underline": "Underline",
			"editor.action.alignLeft": "Align left",
			"editor.action.alignCenter": "Align center",
			"editor.action.alignRight": "Align right",
			"editor.action.justify": "Justify",
			"editor.action.linkValues": "Link values",
			"editor.action.unlinkValues": "Unlink values",
			"editor.action.linkAllValues": "Link all sides",
			"editor.action.unlinkAllValues": "Unlink all sides",
			"editor.action.choosePreset": "Choose preset",
			"editor.property.cornerTopLeft": "Top-left radius",
			"editor.property.cornerTopRight": "Top-right radius",
			"editor.property.cornerBottomRight": "Bottom-right radius",
			"editor.property.cornerBottomLeft": "Bottom-left radius",
			"editor.property.shadowX": "Shadow X offset",
			"editor.property.shadowY": "Shadow Y offset",
			"editor.property.shadowBlur": "Shadow blur",
			"editor.property.shadowSpread": "Shadow spread",
			"editor.property.shadowColor": "Shadow color",
			"editor.property.shadowInset": "Inset shadow",
			"editor.property.translateX": "Translate X",
			"editor.property.translateY": "Translate Y",
			"editor.property.scaleX": "Scale X",
			"editor.property.scaleY": "Scale Y",
			"editor.property.rotate": "Rotate",
			"editor.rawHint": "Advanced CSS value",
			"editor.group.constraints": "Constraints and position"
		};
		//#endregion
		//#region src/client/stores.ts
		/**
		* Webview store: the shared viewing/interaction state for the preview tab and
		* the annotation dock. Business data (sessions, the conversation) lives in the
		* object layer; this store carries the navigation draft, pick mode, the
		* annotation picks shared by both registrations, and the focus signal the dock
		* sends to the preview tab (detail-row click 鈫?locate the element in the iframe).
		*/
		/**
		* Store factory: state + the complete write set. Components write only
		* through the baked actions; production code never calls create() outside
		* apply (the framework owns instance lifecycle).
		*/
		function createWebviewStore() {
			return (0, _deepseek_ai_dsh_client_runtime_client.defineStore)({
				init: () => ({
					url: "",
					urlDraft: "",
					title: "",
					pickMode: false,
					picks: [],
					selectedSkills: [],
					pickResetRevision: 0,
					error: null,
					focusPickId: null,
					annotationSync: { status: "idle" }
				}),
				actions: {
					setUrl: (d, url) => {
						d.url = url;
						d.urlDraft = url;
					},
					setUrlDraft: (d, url) => {
						d.urlDraft = url;
					},
					setTitle: (d, title) => {
						d.title = title;
					},
					togglePickMode: (d) => {
						d.pickMode = !d.pickMode;
					},
					addPick: (d, pick) => {
						d.picks = [...d.picks, pick];
					},
					updateComment: (d, id, comment) => {
						d.picks = d.picks.map((p) => p.id === id ? {
							...p,
							comment
						} : p);
					},
					updatePick: (d, id, pick) => {
						d.picks = d.picks.map((current) => current.id === id ? pick : current);
					},
					removePick: (d, id) => {
						d.picks = d.picks.filter((p) => p.id !== id);
						if (d.picks.length === 0) d.selectedSkills = [];
					},
					clearPicks: (d) => {
						d.picks = [];
						d.selectedSkills = [];
						d.pickResetRevision += 1;
					},
					toggleSelectedSkill: (d, name) => {
						d.selectedSkills = d.selectedSkills.includes(name) ? d.selectedSkills.filter((current) => current !== name) : [...d.selectedSkills, name];
					},
					setError: (d, error) => {
						d.error = error;
					},
					setFocusPickId: (d, id) => {
						d.focusPickId = id;
					},
					setAnnotationSync: (d, state) => {
						d.annotationSync = state;
					}
				}
			});
		}
		//#endregion
		//#region ../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region src/client/inspector-values.ts
		/** Pure parsing/serialization helpers shared by inspector components. */
		const NUMBER = /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*([a-z%]*)\s*$/iu;
		function parseNumeric(value) {
			const match = NUMBER.exec(value);
			if (match?.[1] === void 0) return null;
			const number = Number(match[1]);
			return Number.isFinite(number) ? {
				number,
				unit: match[2] ?? ""
			} : null;
		}
		function formatNumeric(number, unit) {
			const rounded = Math.round(number * 1e3) / 1e3;
			return `${String(Object.is(rounded, -0) ? 0 : rounded)}${unit}`;
		}
		function parseColor(value) {
			const hex = /^#([\da-f]{6})([\da-f]{2})?$/iu.exec(value.trim());
			if (hex?.[1] !== void 0) return {
				r: Number.parseInt(hex[1].slice(0, 2), 16),
				g: Number.parseInt(hex[1].slice(2, 4), 16),
				b: Number.parseInt(hex[1].slice(4, 6), 16),
				a: hex[2] === void 0 ? 1 : Number.parseInt(hex[2], 16) / 255
			};
			const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*[,/]\s*(\d*\.?\d+)(%)?)?\s*\)$/iu.exec(value.trim());
			if (rgb === null) return null;
			const [r, g, b] = [
				Number(rgb[1]),
				Number(rgb[2]),
				Number(rgb[3])
			];
			const a = rgb[4] === void 0 ? 1 : Number(rgb[4]) / (rgb[5] === "%" ? 100 : 1);
			if ([
				r,
				g,
				b,
				a
			].some((part) => !Number.isFinite(part)) || r > 255 || g > 255 || b > 255 || a > 1) return null;
			return {
				r,
				g,
				b,
				a
			};
		}
		function hexOf(color) {
			return `#${[
				color.r,
				color.g,
				color.b
			].map((part) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, "0")).join("")}`;
		}
		function cssColor(color) {
			return color.a >= .999 ? hexOf(color) : `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.round(color.a * 1e3) / 1e3})`;
		}
		//#endregion
		//#region \0dsh-web-review-css:src/client/InspectorControls.module.css.mjs
		const css$6 = ".TMoB-q_section{border-bottom:1px solid var(--dsw-alias-border-l1,#00000014)}.TMoB-q_sectionHeader{width:100%;min-height:36px;color:var(--dsw-alias-label-primary,#17191c);cursor:pointer;text-align:left;background:0 0;border:0;justify-content:space-between;align-items:center;padding:8px 12px;font:600 12px/18px system-ui,sans-serif;display:flex}.TMoB-q_sectionHeader:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.TMoB-q_sectionChevron{color:var(--dsw-alias-label-tertiary,#747a82);transition:transform .12s}.TMoB-q_sectionChevronOpen{transform:rotate(180deg)}.TMoB-q_sectionBody{gap:4px;padding:2px 12px 10px;display:grid}.TMoB-q_row{grid-template-columns:minmax(72px,1fr) minmax(154px,auto);align-items:center;gap:8px;min-height:34px;display:grid}.TMoB-q_rowWide{grid-template-columns:1fr;gap:4px;padding:3px 0}.TMoB-q_rowWide .TMoB-q_rowControl{grid-template-columns:minmax(0,1fr) 24px;justify-self:stretch;width:100%;min-width:0}.TMoB-q_rowLabel{color:var(--dsw-alias-label-secondary,#555a62);cursor:ew-resize;text-overflow:ellipsis;white-space:nowrap;font:12px/18px system-ui,sans-serif;overflow:hidden}.TMoB-q_rowLabelStatic{cursor:default}.TMoB-q_rowControl{grid-template-columns:minmax(126px,auto) 24px;justify-self:end;align-items:center;gap:4px;min-width:154px;display:grid}.TMoB-q_rowControl>:first-child{justify-self:end}.TMoB-q_resetPlaceholder{width:24px;height:24px;display:block}.TMoB-q_reset{width:24px;height:24px;color:var(--dsw-alias-label-tertiary,#747a82);cursor:pointer;background:0 0;border:0;border-radius:6px;flex:none;place-items:center;padding:0;display:grid}.TMoB-q_reset:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.TMoB-q_field,.TMoB-q_menuTrigger,.TMoB-q_colorTrigger{background:var(--dsw-alias-bg-module-platform,#f5f6f7);height:28px;color:var(--dsw-alias-label-primary,#17191c);font:12px/18px var(--ds-font-family-code,ui-monospace, monospace);border:1px solid #0000;border-radius:7px;outline:0}.TMoB-q_field{text-align:right;flex:0 0 126px;width:126px;min-width:0;padding:0 8px}.TMoB-q_textArea{resize:vertical;background:var(--dsw-alias-bg-module-platform,#f5f6f7);width:100%;min-width:0;min-height:36px;max-height:132px;color:var(--dsw-alias-label-primary,#17191c);font:12px/18px var(--ds-font-family-code,ui-monospace, monospace);border:1px solid #0000;border-radius:7px;outline:0;padding:8px}.TMoB-q_textArea:hover{background:var(--dsw-alias-interactive-bg-hover,#26314814)}.TMoB-q_textArea:focus{border-color:var(--dsw-alias-brand-primary,#4176e6);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary,#4176e6)}.TMoB-q_field:hover,.TMoB-q_menuTrigger:hover,.TMoB-q_colorTrigger:hover{background:var(--dsw-alias-interactive-bg-hover,#26314814)}.TMoB-q_field:focus,.TMoB-q_menuTrigger:focus-visible,.TMoB-q_colorTrigger:focus-visible,.TMoB-q_toggle:focus-visible,.TMoB-q_sectionHeader:focus-visible,.TMoB-q_reset:focus-visible{border-color:var(--dsw-alias-brand-primary,#4176e6);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary,#4176e6)}.TMoB-q_invalid{border-color:var(--dsw-alias-state-error-primary,#ec1313)}.TMoB-q_numberWrap{flex:0 0 126px;align-items:center;width:126px;min-width:0;display:inline-flex;position:relative}.TMoB-q_numberHandle{z-index:2;width:30px;height:28px;color:var(--dsw-alias-label-tertiary,#747a82);cursor:ew-resize;user-select:none;touch-action:none;background:0 0;border:0;place-items:center;font:500 10px/1 system-ui,sans-serif;display:grid;position:absolute;inset:0 auto 0 0}.TMoB-q_numberHandle:disabled{opacity:.45;cursor:default}.TMoB-q_numberWrap .TMoB-q_field{box-sizing:border-box;flex-basis:100%;width:100%;min-width:0;padding-left:32px}.TMoB-q_numberWrapWithOptions .TMoB-q_field{padding-right:26px}.TMoB-q_numberPreset{z-index:3;width:24px;height:28px;display:inline-flex;position:absolute;top:0;right:0}.TMoB-q_numberPresetTrigger{border:0;border-left:1px solid var(--dsw-alias-border-l1,#00000014);width:24px;height:28px;color:var(--dsw-alias-label-tertiary,#747a82);cursor:pointer;background:0 0;border-radius:0 7px 7px 0;place-items:center;padding:0;display:grid}.TMoB-q_numberPresetTrigger:hover{background:var(--dsw-alias-interactive-bg-hover,#26314814)}.TMoB-q_numberPresetTrigger:focus-visible{border-color:var(--dsw-alias-brand-primary,#4176e6);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary,#4176e6);outline:0}.TMoB-q_numberPresetChevron{transition:transform .12s}.TMoB-q_numberPresetChevronOpen{transform:rotate(180deg)}.TMoB-q_menuRoot{display:inline-flex}.TMoB-q_menuTrigger{cursor:pointer;flex:0 0 126px;justify-content:flex-end;align-items:center;gap:4px;width:126px;padding:0 6px 0 8px;display:inline-flex}.TMoB-q_menuValue{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.TMoB-q_menuChevron{color:var(--dsw-alias-label-tertiary,#747a82);flex:none}.TMoB-q_segments{background:var(--dsw-alias-bg-module-platform,#f5f6f7);border-radius:8px;padding:2px;display:inline-flex;overflow:hidden}.TMoB-q_toggleGroup{align-items:center;gap:2px;display:inline-flex}.TMoB-q_toggle{min-width:28px;height:24px;color:var(--dsw-alias-label-secondary,#555a62);cursor:pointer;background:0 0;border:0;border-radius:6px;place-items:center;padding:0 6px;font:600 12px/1 system-ui,sans-serif;display:grid}.TMoB-q_toggle:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.TMoB-q_toggleActive{background:var(--dsw-alias-interactive-bg-active,#2631481f);color:var(--dsw-alias-label-primary,#17191c)}.TMoB-q_italicGlyph{font-family:Georgia,serif;font-style:italic}.TMoB-q_underlineGlyph{text-decoration:underline}.TMoB-q_colorTrigger{cursor:pointer;flex:0 0 126px;justify-content:flex-end;align-items:center;gap:7px;width:126px;padding:0 7px;display:inline-flex}.TMoB-q_swatch{background-image:linear-gradient(45deg,#ddd 25%,#0000 25%),linear-gradient(-45deg,#ddd 25%,#0000 25%),linear-gradient(45deg,#0000 75%,#ddd 75%),linear-gradient(-45deg,#0000 75%,#ddd 75%);background-position:0 0,0 4px,4px -4px,-4px 0;background-size:8px 8px;border:1px solid #00000029;border-radius:5px;flex:none;width:18px;height:18px}.TMoB-q_swatchFill{border-radius:4px;width:100%;height:100%;display:block}.TMoB-q_colorValue{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.TMoB-q_popover{z-index:1200;box-sizing:border-box;border:1px solid var(--dsw-alias-border-inverted,#00000014);background:var(--dsw-specific-menu,#fff);width:min(236px,100vw - 16px);box-shadow:var(--dsw-shadow-lv3,0 12px 32px #0000002e);border-radius:12px;padding:10px;position:fixed}.TMoB-q_spectrum{cursor:pointer;background:0 0;border:0;border-radius:8px;width:100%;height:42px;padding:0}.TMoB-q_popoverRow{grid-template-columns:minmax(0,1fr) minmax(0,72px);gap:7px;margin-top:8px;display:grid}.TMoB-q_popoverRow label{min-width:0;display:block}.TMoB-q_popoverLabel{color:var(--dsw-alias-label-tertiary,#747a82);margin-bottom:3px;font:11px/16px system-ui,sans-serif;display:block}.TMoB-q_popover .TMoB-q_numberWrap,.TMoB-q_popover .TMoB-q_field{box-sizing:border-box;flex-basis:100%;width:100%;min-width:0}.TMoB-q_boxModelWrap{gap:4px;width:100%;min-width:0;display:grid;position:relative}.TMoB-q_boxModelMergeReady{gap:20px}.TMoB-q_boxModelAllLinked{gap:8px}.TMoB-q_rowControl>.TMoB-q_boxModelWrap{justify-self:stretch}.TMoB-q_boxAxis{grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);align-items:center;gap:5px;min-width:0;display:grid}.TMoB-q_boxAxis .TMoB-q_numberWrap,.TMoB-q_boxAxis .TMoB-q_field{flex-basis:auto;width:100%;min-width:0}.TMoB-q_boxAxis .TMoB-q_numberHandle{width:26px}.TMoB-q_boxAxis .TMoB-q_numberWrap .TMoB-q_field{padding-left:27px;padding-right:7px}.TMoB-q_boxAxis .TMoB-q_numberWrapWithOptions .TMoB-q_field{padding-right:25px}.TMoB-q_boxAxis>.TMoB-q_toggle{width:32px;min-width:32px;height:28px;padding:0}.TMoB-q_boxAllLink{z-index:3;background:var(--dsw-specific-menu,#fff);place-items:center;padding:2px 0;display:grid;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}.TMoB-q_boxAllLink .TMoB-q_toggle{width:32px;min-width:32px;height:28px;padding:0}.TMoB-q_rawHint{color:var(--dsw-alias-label-tertiary,#747a82);font:10px/14px system-ui,sans-serif}@container (width<=350px){.TMoB-q_row{grid-template-columns:1fr;gap:3px;padding:3px 0}.TMoB-q_rowControl{grid-template-columns:minmax(0,1fr) 24px;justify-self:stretch;width:100%;min-width:0}.TMoB-q_rowControl>.TMoB-q_field,.TMoB-q_rowControl>.TMoB-q_numberWrap,.TMoB-q_rowControl>.TMoB-q_menuTrigger,.TMoB-q_rowControl>.TMoB-q_colorTrigger{flex-basis:min(100%,180px);width:min(100%,180px)}.TMoB-q_boxModelWrap{width:100%}}@media (prefers-reduced-motion:reduce){.TMoB-q_numberPresetChevron{transition:none}}";
		const tagId$6 = "@canglongcl/dsh-web-review/InspectorControls.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$6) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@canglongcl/dsh-web-review";
			tag.dataset.pluginCss = tagId$6;
			tag.textContent = css$6;
			document.head.appendChild(tag);
		}
		var InspectorControls_module_css_default = {
			"rowWide": "TMoB-q_rowWide",
			"swatch": "TMoB-q_swatch",
			"spectrum": "TMoB-q_spectrum",
			"section": "TMoB-q_section",
			"sectionChevron": "TMoB-q_sectionChevron",
			"rowControl": "TMoB-q_rowControl",
			"numberWrap": "TMoB-q_numberWrap",
			"menuChevron": "TMoB-q_menuChevron",
			"rawHint": "TMoB-q_rawHint",
			"sectionHeader": "TMoB-q_sectionHeader",
			"sectionBody": "TMoB-q_sectionBody",
			"underlineGlyph": "TMoB-q_underlineGlyph",
			"invalid": "TMoB-q_invalid",
			"toggleActive": "TMoB-q_toggleActive",
			"menuValue": "TMoB-q_menuValue",
			"reset": "TMoB-q_reset",
			"boxModelAllLinked": "TMoB-q_boxModelAllLinked",
			"swatchFill": "TMoB-q_swatchFill",
			"menuTrigger": "TMoB-q_menuTrigger",
			"popoverLabel": "TMoB-q_popoverLabel",
			"numberHandle": "TMoB-q_numberHandle",
			"sectionChevronOpen": "TMoB-q_sectionChevronOpen",
			"rowLabelStatic": "TMoB-q_rowLabelStatic",
			"field": "TMoB-q_field",
			"numberPresetTrigger": "TMoB-q_numberPresetTrigger",
			"numberPresetChevron": "TMoB-q_numberPresetChevron",
			"segments": "TMoB-q_segments",
			"boxAxis": "TMoB-q_boxAxis",
			"boxModelMergeReady": "TMoB-q_boxModelMergeReady",
			"rowLabel": "TMoB-q_rowLabel",
			"italicGlyph": "TMoB-q_italicGlyph",
			"popover": "TMoB-q_popover",
			"boxAllLink": "TMoB-q_boxAllLink",
			"menuRoot": "TMoB-q_menuRoot",
			"popoverRow": "TMoB-q_popoverRow",
			"row": "TMoB-q_row",
			"resetPlaceholder": "TMoB-q_resetPlaceholder",
			"toggle": "TMoB-q_toggle",
			"textArea": "TMoB-q_textArea",
			"colorValue": "TMoB-q_colorValue",
			"toggleGroup": "TMoB-q_toggleGroup",
			"colorTrigger": "TMoB-q_colorTrigger",
			"boxModelWrap": "TMoB-q_boxModelWrap",
			"numberPresetChevronOpen": "TMoB-q_numberPresetChevronOpen",
			"numberWrapWithOptions": "TMoB-q_numberWrapWithOptions",
			"numberPreset": "TMoB-q_numberPreset"
		};
		//#endregion
		//#region src/client/InspectorControls.tsx
		function InspectorSection({ label, children, defaultOpen = true, onOpenChange }) {
			const [open, setOpen] = (0, react.useState)(defaultOpen);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: InspectorControls_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: InspectorControls_module_css_default.sectionHeader,
					"aria-expanded": open,
					onClick: () => {
						setOpen((value) => {
							onOpenChange?.(!value);
							return !value;
						});
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: clsx(InspectorControls_module_css_default.sectionChevron, open && InspectorControls_module_css_default.sectionChevronOpen) })]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: InspectorControls_module_css_default.sectionBody,
					children
				})]
			});
		}
		function InspectorRow({ label, children, changed = false, onReset, resetLabel, staticLabel = false, wide = false, active = false }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(InspectorControls_module_css_default.row, wide && InspectorControls_module_css_default.rowWide),
				"data-inspector-row": "",
				...active ? { "data-scrub-active": "" } : {},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: clsx(InspectorControls_module_css_default.rowLabel, staticLabel && InspectorControls_module_css_default.rowLabelStatic),
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: InspectorControls_module_css_default.rowControl,
					children: [
						children,
						changed && onReset !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: InspectorControls_module_css_default.reset,
							"aria-label": resetLabel,
							title: resetLabel,
							onClick: onReset,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline14, {})
						}),
						(!changed || onReset === void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: InspectorControls_module_css_default.resetPlaceholder,
							"aria-hidden": true
						})
					]
				})]
			});
		}
		function OptionMenu({ label, value, options, onChange }) {
			const [open, setOpen] = (0, react.useState)(false);
			const triggerRef = (0, react.useRef)(null);
			const items = (options.includes(value) ? options : [value, ...options]).map((option) => ({
				id: option,
				label: option
			}));
			const close = () => {
				setOpen(false);
				queueMicrotask(() => {
					triggerRef.current?.focus();
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open,
				compact: true,
				portal: true,
				align: "end",
				items,
				selectedId: value,
				onSelect: (next) => {
					onChange(next);
					close();
				},
				onClose: close,
				anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: triggerRef,
					type: "button",
					className: InspectorControls_module_css_default.menuTrigger,
					"aria-label": label,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					onClick: () => {
						setOpen((next) => !next);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: InspectorControls_module_css_default.menuValue,
						children: value
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: InspectorControls_module_css_default.menuChevron })]
				})
			});
		}
		function SegmentedControl({ label, value, options, onChange }) {
			const refs = (0, react.useRef)([]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: InspectorControls_module_css_default.segments,
				role: "group",
				"aria-label": label,
				children: options.map((option, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					ref: (node) => {
						refs.current[index] = node;
					},
					type: "button",
					className: clsx(InspectorControls_module_css_default.toggle, value === option.value && InspectorControls_module_css_default.toggleActive),
					"aria-label": option.label,
					"aria-pressed": value === option.value,
					title: option.label,
					onClick: () => {
						onChange(option.value);
					},
					onKeyDown: (event) => {
						if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
						event.preventDefault();
						const next = (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
						const optionAt = options[next];
						if (optionAt !== void 0) onChange(optionAt.value);
						refs.current[next]?.focus();
					},
					children: option.content
				}, option.value))
			});
		}
		function ToggleButton({ label, pressed, onToggle, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: clsx(InspectorControls_module_css_default.toggle, pressed && InspectorControls_module_css_default.toggleActive),
				"aria-label": label,
				title: label,
				"aria-pressed": pressed,
				onClick: onToggle,
				children
			});
		}
		function ToggleGroup({ children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: InspectorControls_module_css_default.toggleGroup,
				children
			});
		}
		function TextField({ label, value, onChange, invalid = false }) {
			const focusValue = (0, react.useRef)(value);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				className: clsx(InspectorControls_module_css_default.field, invalid && InspectorControls_module_css_default.invalid),
				"aria-label": label,
				value,
				onFocus: () => {
					focusValue.current = value;
				},
				onChange: (event) => {
					onChange(event.target.value);
				},
				onKeyDown: (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					event.stopPropagation();
					onChange(focusValue.current);
					event.currentTarget.blur();
				}
			});
		}
		function TextAreaField({ label, value, maxLength, onChange }) {
			const focusValue = (0, react.useRef)(value);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
				className: InspectorControls_module_css_default.textArea,
				"data-webview-text-content": "",
				"aria-label": label,
				value,
				rows: 2,
				...maxLength === void 0 ? {} : { maxLength },
				onFocus: () => {
					focusValue.current = value;
				},
				onChange: (event) => {
					onChange(event.target.value);
				},
				onKeyDown: (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					event.stopPropagation();
					onChange(focusValue.current);
					event.currentTarget.blur();
				}
			});
		}
		function StyleGlyph({ kind }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: kind === "italic" ? InspectorControls_module_css_default.italicGlyph : kind === "underline" ? InspectorControls_module_css_default.underlineGlyph : void 0,
				children: kind === "bold" ? "B" : kind === "italic" ? "I" : "U"
			});
		}
		function ScrubNumber({ label, value, onChange, onScrubChange, step = 1, min, max, glyph = "鈫?, fallbackValue, invalid = false, options = [], presetLabel }) {
			const drag = (0, react.useRef)(null);
			const scrubChangeRef = (0, react.useRef)(onScrubChange);
			scrubChangeRef.current = onScrubChange;
			const lastNumericValue = (0, react.useRef)(parseNumeric(value) ?? (fallbackValue === void 0 ? null : parseNumeric(fallbackValue)));
			const parsedValue = parseNumeric(value);
			if (parsedValue !== null) lastNumericValue.current = parsedValue;
			const focusValue = (0, react.useRef)(value);
			const presetRef = (0, react.useRef)(null);
			const [presetOpen, setPresetOpen] = (0, react.useState)(false);
			const hasOptions = options.length > 0;
			const presetItems = options.map((option) => ({
				id: option,
				label: option
			}));
			const closePresets = () => {
				setPresetOpen(false);
				queueMicrotask(() => {
					presetRef.current?.focus();
				});
			};
			const clamp = (number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, number));
			const numericValue = () => parseNumeric(value) ?? lastNumericValue.current ?? (fallbackValue === void 0 ? null : parseNumeric(fallbackValue));
			const canScrub = numericValue() !== null;
			const increment = (delta) => {
				const parsed = numericValue();
				if (parsed === null) return;
				onChange(formatNumeric(clamp(parsed.number + delta), parsed.unit));
			};
			const finishDrag = (restore) => {
				const current = drag.current;
				if (current === null) return;
				if (restore && current.started) onChange(formatNumeric(current.value, current.unit));
				if (current.started) scrubChangeRef.current?.(false);
				drag.current = null;
			};
			(0, react.useEffect)(() => () => {
				if (drag.current?.started === true) scrubChangeRef.current?.(false);
			}, []);
			(0, react.useEffect)(() => {
				if (!presetOpen) return;
				const closeOnEscape = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					event.stopImmediatePropagation();
					closePresets();
				};
				document.addEventListener("keydown", closeOnEscape, true);
				return () => {
					document.removeEventListener("keydown", closeOnEscape, true);
				};
			}, [presetOpen]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: clsx(InspectorControls_module_css_default.numberWrap, hasOptions && InspectorControls_module_css_default.numberWrapWithOptions),
				"data-webview-scrub-control": "",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: InspectorControls_module_css_default.numberHandle,
						"data-webview-scrub-handle": "",
						"aria-label": `${label} 路 鎷栧姩璋冩暣`,
						title: canScrub ? `${label} 路 鎷栧姩璋冩暣` : `${label} 路 褰撳墠鍊间粎鏀寔鏂囨湰缂栬緫`,
						disabled: !canScrub,
						onPointerDown: (event) => {
							const parsed = numericValue();
							if (parsed === null) return;
							drag.current = {
								x: event.clientX,
								value: parsed.number,
								unit: parsed.unit,
								started: false
							};
							event.currentTarget.setPointerCapture?.(event.pointerId);
						},
						onPointerMove: (event) => {
							const current = drag.current;
							if (current === null) return;
							const delta = event.clientX - current.x;
							if (!current.started && Math.abs(delta) < 3) return;
							if (!current.started) {
								current.started = true;
								scrubChangeRef.current?.(true);
							}
							onChange(formatNumeric(clamp(current.value + delta * step), current.unit));
						},
						onPointerUp: () => {
							finishDrag(false);
						},
						onPointerCancel: () => {
							finishDrag(true);
						},
						onLostPointerCapture: () => {
							finishDrag(false);
						},
						children: glyph
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: clsx(InspectorControls_module_css_default.field, invalid && InspectorControls_module_css_default.invalid),
						"aria-label": label,
						role: "spinbutton",
						value,
						inputMode: "decimal",
						...parseNumeric(value) === null ? {} : { "aria-valuenow": parseNumeric(value).number },
						...min === void 0 ? {} : { "aria-valuemin": min },
						...max === void 0 ? {} : { "aria-valuemax": max },
						"aria-valuetext": value,
						onFocus: () => {
							focusValue.current = value;
						},
						onChange: (event) => {
							onChange(event.target.value);
						},
						onKeyDown: (event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								event.stopPropagation();
								onChange(focusValue.current);
								event.currentTarget.blur();
								return;
							}
							if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
							event.preventDefault();
							const factor = event.shiftKey ? 10 : event.altKey ? .1 : 1;
							increment((event.key === "ArrowUp" ? step : -step) * factor);
						}
					}),
					hasOptions && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: InspectorControls_module_css_default.numberPreset,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: presetOpen,
							compact: true,
							portal: true,
							align: "end",
							items: presetItems,
							selectedId: options.includes(value) ? value : void 0,
							onSelect: (next) => {
								onChange(next);
								closePresets();
							},
							onClose: closePresets,
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								ref: presetRef,
								type: "button",
								className: InspectorControls_module_css_default.numberPresetTrigger,
								"aria-label": `${label} 路 ${presetLabel ?? ""}`.trim(),
								"aria-haspopup": "menu",
								"aria-expanded": presetOpen,
								onClick: () => {
									setPresetOpen((open) => !open);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: clsx(InspectorControls_module_css_default.numberPresetChevron, presetOpen && InspectorControls_module_css_default.numberPresetChevronOpen) })
							})
						})
					})
				]
			});
		}
		function ColorControl({ label, value, onChange, onScrubChange }) {
			const parsed = parseColor(value);
			const [open, setOpen] = (0, react.useState)(false);
			const triggerRef = (0, react.useRef)(null);
			const popoverRef = (0, react.useRef)(null);
			const [position, setPosition] = (0, react.useState)({
				left: 0,
				top: 0
			});
			const color = parsed ?? {
				r: 0,
				g: 0,
				b: 0,
				a: 1
			};
			(0, react.useLayoutEffect)(() => {
				if (!open || triggerRef.current === null) return;
				const rect = triggerRef.current.getBoundingClientRect();
				const popoverWidth = popoverRef.current?.offsetWidth ?? Math.min(236, window.innerWidth - 16);
				const popoverHeight = popoverRef.current?.offsetHeight ?? 170;
				setPosition({
					left: Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, rect.right - popoverWidth)),
					top: Math.max(8, Math.min(window.innerHeight - popoverHeight - 8, rect.bottom + 4))
				});
				queueMicrotask(() => {
					popoverRef.current?.querySelector("input, button")?.focus();
				});
			}, [open]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const down = (event) => {
					if (!(event.target instanceof Node)) return;
					if (popoverRef.current?.contains(event.target) === true || triggerRef.current?.contains(event.target) === true) return;
					setOpen(false);
				};
				const key = (event) => {
					if (event.key === "Escape") {
						setOpen(false);
						triggerRef.current?.focus();
					}
				};
				document.addEventListener("pointerdown", down);
				document.addEventListener("keydown", key);
				return () => {
					document.removeEventListener("pointerdown", down);
					document.removeEventListener("keydown", key);
				};
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: triggerRef,
				type: "button",
				className: InspectorControls_module_css_default.colorTrigger,
				"aria-label": label,
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				onClick: () => {
					setOpen((next) => !next);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: InspectorControls_module_css_default.swatch,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: InspectorControls_module_css_default.swatchFill,
						style: { background: value }
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: InspectorControls_module_css_default.colorValue,
					children: parsed === null ? value : hexOf(color)
				})]
			}), open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: popoverRef,
				className: InspectorControls_module_css_default.popover,
				style: position,
				role: "dialog",
				"aria-modal": "true",
				"aria-label": `${label} 路 棰滆壊閫夋嫨鍣╜,
				onKeyDown: (event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						setOpen(false);
						queueMicrotask(() => {
							triggerRef.current?.focus();
						});
						return;
					}
					if (event.key !== "Tab" || popoverRef.current === null) return;
					const focusable = [...popoverRef.current.querySelectorAll("input:not(:disabled), button:not(:disabled)")];
					if (focusable.length === 0) return;
					const current = focusable.indexOf(document.activeElement);
					const next = event.shiftKey ? current <= 0 ? focusable.length - 1 : current - 1 : current >= focusable.length - 1 ? 0 : current + 1;
					event.preventDefault();
					focusable[next]?.focus();
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					className: InspectorControls_module_css_default.spectrum,
					type: "color",
					"aria-label": `${label} 路 鑹茶氨`,
					value: hexOf(color),
					onChange: (event) => {
						const next = parseColor(event.target.value);
						if (next !== null) onChange(cssColor({
							...next,
							a: color.a
						}));
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: InspectorControls_module_css_default.popoverRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: InspectorControls_module_css_default.popoverLabel,
						children: "Hex"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: InspectorControls_module_css_default.field,
						"aria-label": `${label} 路 Hex`,
						value: parsed === null ? value : hexOf(color),
						onChange: (event) => {
							const next = parseColor(event.target.value);
							if (next !== null) onChange(cssColor({
								...next,
								a: color.a
							}));
							else onChange(event.target.value);
						}
					})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: InspectorControls_module_css_default.popoverLabel,
						children: "Alpha"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScrubNumber, {
						label: `${label} 路 閫忔槑搴,
						value: `${String(Math.round(color.a * 100))}%`,
						min: 0,
						max: 100,
						onScrubChange,
						onChange: (next) => {
							const numeric = parseNumeric(next);
							if (numeric !== null) onChange(cssColor({
								...color,
								a: numeric.number / 100
							}));
						}
					})] })]
				})]
			}), document.body)] });
		}
		function updateBoxModelLinks(links, axis, linked) {
			if (axis === "all") return linked ? {
				vertical: true,
				horizontal: true,
				all: true
			} : {
				vertical: true,
				horizontal: true,
				all: false
			};
			return {
				...links,
				[axis]: linked,
				all: false
			};
		}
		function BoxModelControl({ label, sideLabels, values, links, min, options = [], presetLabel, linkLabel, unlinkLabel, linkAllLabel, unlinkAllLabel, onLinkChange, onChange, onScrubChange }) {
			const glyphs = [
				"鈫?,
				"鈫?,
				"鈫?,
				"鈫?
			];
			const update = (index, next) => {
				onChange(index, next);
				if (links.all) {
					values.forEach((_, otherIndex) => {
						if (otherIndex !== index) onChange(otherIndex, next);
					});
					return;
				}
				if (links.vertical && index === 0) onChange(2, next);
				if (links.vertical && index === 2) onChange(0, next);
				if (links.horizontal && index === 1) onChange(3, next);
				if (links.horizontal && index === 3) onChange(1, next);
			};
			const field = (index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScrubNumber, {
				label: sideLabels[index] ?? label,
				value: values[index] ?? "",
				glyph: glyphs[index] ?? "鈫?,
				...min === void 0 ? {} : { min },
				options,
				...presetLabel === void 0 ? {} : { presetLabel },
				onScrubChange,
				onChange: (next) => {
					update(index, next);
				}
			});
			const axis = (first, second, key) => {
				const linked = links[key];
				const sides = `${sideLabels[first] ?? label} / ${sideLabels[second] ?? label}`;
				const buttonLabel = `${linked ? unlinkLabel : linkLabel} 路 ${sides}`;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: InspectorControls_module_css_default.boxAxis,
					children: [
						field(first),
						!links.all && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleButton, {
							label: buttonLabel,
							pressed: linked,
							onToggle: () => {
								onLinkChange(key, !linked);
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLinkOutline14, {})
						}),
						links.all && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { "aria-hidden": true }),
						field(second)
					]
				});
			};
			const canMerge = links.vertical && links.horizontal && !links.all;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: clsx(InspectorControls_module_css_default.boxModelWrap, canMerge && InspectorControls_module_css_default.boxModelMergeReady, links.all && InspectorControls_module_css_default.boxModelAllLinked),
				role: "group",
				"aria-label": label,
				children: [
					axis(0, 2, "vertical"),
					axis(3, 1, "horizontal"),
					canMerge && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: InspectorControls_module_css_default.boxAllLink,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleButton, {
							label: linkAllLabel,
							pressed: false,
							onToggle: () => {
								onLinkChange("all", true);
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLinkOutline14, {})
						})
					}),
					links.all && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: InspectorControls_module_css_default.boxAllLink,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleButton, {
							label: unlinkAllLabel,
							pressed: true,
							onToggle: () => {
								onLinkChange("all", false);
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLinkOutline14, {})
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/property-editor-config.ts
		const raw = (property, labelKey) => ({
			property,
			labelKey,
			kind: "raw"
		});
		const color = (property, labelKey) => ({
			property,
			labelKey,
			kind: "color"
		});
		const number = (property, labelKey, options = {}) => ({
			property,
			labelKey,
			kind: "number",
			...options
		});
		const menu = (property, labelKey, options) => ({
			property,
			labelKey,
			kind: "menu",
			options
		});
		const FONT_FAMILIES = [
			"Inter, sans-serif",
			"system-ui, sans-serif",
			"Arial, sans-serif",
			"Helvetica, sans-serif",
			"Roboto, sans-serif",
			"PingFang SC, sans-serif",
			"Microsoft YaHei, sans-serif",
			"Noto Sans CJK SC, sans-serif",
			"Georgia, serif",
			"Times New Roman, serif",
			"ui-monospace, monospace"
		];
		const CONTENT_SIZING_KEYWORDS = [
			"auto",
			"min-content",
			"max-content",
			"fit-content"
		];
		const MAX_CONTENT_SIZING_KEYWORDS = [
			"none",
			"min-content",
			"max-content",
			"fit-content"
		];
		/** Typed property metadata. Composite controls consume the same entries. */
		const PROPERTY_GROUPS = [
			{
				labelKey: "editor.group.fill",
				controls: [
					color("color", "editor.property.color"),
					color("background-color", "editor.property.background"),
					number("opacity", "editor.property.opacity", {
						step: .01,
						min: 0,
						max: 1,
						glyph: "%"
					})
				]
			},
			{
				labelKey: "editor.group.typography",
				controls: [
					menu("font-family", "editor.property.fontFamily", FONT_FAMILIES),
					menu("font-weight", "editor.property.fontWeight", [
						"100",
						"200",
						"300",
						"400",
						"500",
						"600",
						"700",
						"800",
						"900"
					]),
					menu("font-style", "editor.property.fontStyle", [
						"normal",
						"italic",
						"oblique"
					]),
					number("font-size", "editor.property.fontSize", {
						step: 1,
						min: 0,
						glyph: "S",
						options: [
							"xx-small",
							"x-small",
							"small",
							"medium",
							"large",
							"x-large",
							"xx-large",
							"xxx-large",
							"smaller",
							"larger"
						]
					}),
					number("line-height", "editor.property.lineHeight", {
						step: 1,
						min: 0,
						glyph: "鈫?,
						options: ["normal"]
					}),
					number("letter-spacing", "editor.property.letterSpacing", {
						step: .1,
						glyph: "鈫?,
						options: ["normal"]
					}),
					menu("text-align", "editor.property.textAlign", [
						"left",
						"center",
						"right",
						"justify",
						"start",
						"end"
					]),
					menu("text-decoration", "editor.property.textDecoration", [
						"none",
						"underline",
						"line-through",
						"overline"
					]),
					menu("text-transform", "editor.property.textTransform", [
						"none",
						"uppercase",
						"lowercase",
						"capitalize"
					])
				]
			},
			{
				labelKey: "editor.group.size",
				controls: [
					number("width", "editor.property.width", {
						step: 1,
						min: 0,
						glyph: "W",
						options: CONTENT_SIZING_KEYWORDS
					}),
					number("height", "editor.property.height", {
						step: 1,
						min: 0,
						glyph: "H",
						options: CONTENT_SIZING_KEYWORDS
					}),
					number("min-width", "editor.property.minWidth", {
						step: 1,
						min: 0,
						glyph: "W",
						options: CONTENT_SIZING_KEYWORDS
					}),
					number("max-width", "editor.property.maxWidth", {
						step: 1,
						min: 0,
						glyph: "W",
						options: MAX_CONTENT_SIZING_KEYWORDS
					}),
					number("min-height", "editor.property.minHeight", {
						step: 1,
						min: 0,
						glyph: "H",
						options: CONTENT_SIZING_KEYWORDS
					}),
					number("max-height", "editor.property.maxHeight", {
						step: 1,
						min: 0,
						glyph: "H",
						options: MAX_CONTENT_SIZING_KEYWORDS
					})
				]
			},
			{
				labelKey: "editor.group.layout",
				controls: [
					menu("display", "editor.property.display", [
						"block",
						"inline",
						"inline-block",
						"flex",
						"inline-flex",
						"grid",
						"none"
					]),
					menu("position", "editor.property.position", [
						"static",
						"relative",
						"absolute",
						"fixed",
						"sticky"
					]),
					number("top", "editor.property.top", { options: ["auto"] }),
					number("right", "editor.property.right", { options: ["auto"] }),
					number("bottom", "editor.property.bottom", { options: ["auto"] }),
					number("left", "editor.property.left", { options: ["auto"] }),
					number("z-index", "editor.property.zIndex", {
						step: 1,
						glyph: "Z",
						options: ["auto"]
					}),
					menu("flex-direction", "editor.property.flexDirection", [
						"row",
						"row-reverse",
						"column",
						"column-reverse"
					]),
					menu("flex-wrap", "editor.property.flexWrap", [
						"nowrap",
						"wrap",
						"wrap-reverse"
					]),
					menu("justify-content", "editor.property.justifyContent", [
						"normal",
						"flex-start",
						"center",
						"flex-end",
						"space-between",
						"space-around",
						"space-evenly"
					]),
					menu("align-items", "editor.property.alignItems", [
						"normal",
						"stretch",
						"flex-start",
						"center",
						"flex-end",
						"baseline"
					]),
					menu("align-content", "editor.property.alignContent", [
						"normal",
						"stretch",
						"flex-start",
						"center",
						"flex-end",
						"space-between",
						"space-around"
					]),
					number("gap", "editor.property.gap", {
						step: 1,
						min: 0,
						options: ["normal"]
					}),
					number("row-gap", "editor.property.rowGap", {
						step: 1,
						min: 0,
						options: ["normal"]
					}),
					number("column-gap", "editor.property.columnGap", {
						step: 1,
						min: 0,
						options: ["normal"]
					}),
					menu("overflow", "editor.property.overflow", [
						"visible",
						"hidden",
						"clip",
						"scroll",
						"auto"
					])
				]
			},
			{
				labelKey: "editor.group.spacing",
				controls: [
					number("margin-top", "editor.property.marginTop", { options: ["auto"] }),
					number("margin-right", "editor.property.marginRight", { options: ["auto"] }),
					number("margin-bottom", "editor.property.marginBottom", { options: ["auto"] }),
					number("margin-left", "editor.property.marginLeft", { options: ["auto"] }),
					number("padding-top", "editor.property.paddingTop", { min: 0 }),
					number("padding-right", "editor.property.paddingRight", { min: 0 }),
					number("padding-bottom", "editor.property.paddingBottom", { min: 0 }),
					number("padding-left", "editor.property.paddingLeft", { min: 0 })
				]
			},
			{
				labelKey: "editor.group.border",
				controls: [
					number("border-radius", "editor.property.borderRadius", { min: 0 }),
					number("border-width", "editor.property.borderWidth", {
						min: 0,
						options: [
							"thin",
							"medium",
							"thick"
						]
					}),
					menu("border-style", "editor.property.borderStyle", [
						"none",
						"solid",
						"dashed",
						"dotted",
						"double"
					]),
					color("border-color", "editor.property.borderColor")
				]
			},
			{
				labelKey: "editor.group.effects",
				controls: [raw("box-shadow", "editor.property.boxShadow"), raw("transform", "editor.property.transform")]
			}
		];
		const PROPERTY_BY_NAME = new Map(PROPERTY_GROUPS.flatMap((group) => group.controls).map((control) => [control.property, control]));
		//#endregion
		//#region src/ui-skills.ts
		/** Fixed UI optimization Skill catalog bundled by this plugin. */
		const UI_SKILLS = [
			{
				name: "better-ui",
				description: "Design engineering principles for polished interfaces, including components, motion, hover states, shadows, borders, icons, and micro-interactions."
			},
			{
				name: "better-typography",
				description: "Web typography guidance for fonts, type scales, hierarchy, wrapping, spacing, OpenType features, and accessible text rendering."
			},
			{
				name: "better-layout",
				description: "Layout structure for web interfaces, including grouping, alignment, reading order, progressive disclosure, responsive behavior, and RTL."
			},
			{
				name: "better-writing",
				description: "UX writing guidance for interface copy, button labels, errors, empty states, placeholders, notifications, voice, and tone."
			},
			{
				name: "better-accessibility",
				description: "Accessibility engineering for focus, keyboard support, semantics, ARIA, forms, screen readers, hit areas, motion, and zoom."
			},
			{
				name: "better-colors",
				description: "Color-system guidance for OKLCH, palettes, contrast, gamut boundaries, semantic tokens, and light and dark appearances."
			},
			{
				name: "better-interface",
				description: "Cross-discipline interface review coordinating accessibility, layout, writing, typography, color, and visual-polish guidance."
			},
			{
				name: "interface-review",
				description: "Change-scoped interface review for uncommitted work, branches, and pull requests, with affected-surface and regression classification."
			}
		];
		/** Stable ordered name list used by config defaults and validation. */
		const UI_SKILL_NAMES = UI_SKILLS.map((skill) => skill.name);
		const UI_SKILL_NAME_SET = new Set(UI_SKILL_NAMES);
		/** Return whether an untrusted value names one bundled UI optimization Skill. */
		function isUiSkillName(value) {
			return typeof value === "string" && UI_SKILL_NAME_SET.has(value);
		}
		//#endregion
		//#region \0dsh-web-review-css:src/client/UiSkillSelector.module.css.mjs
		const css$5 = ".WI9gSG_root{border-bottom:1px solid var(--dsw-alias-border-l1,#00000014);position:relative}.WI9gSG_trigger{width:100%;min-height:36px;color:var(--dsw-alias-label-primary,#17191c);cursor:pointer;text-align:left;background:0 0;border:0;outline:0;align-items:center;gap:6px;padding:8px 12px;font:600 12px/18px system-ui,sans-serif;display:flex}.WI9gSG_trigger:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.WI9gSG_trigger:focus-visible{box-shadow:0 0 0 1px var(--dsw-alias-brand-primary,#4176e6)}.WI9gSG_title{flex:1;min-width:0}.WI9gSG_count{color:var(--dsw-alias-label-tertiary,#747a82);flex:none;font-weight:500}.WI9gSG_chevron,.WI9gSG_chevronOpen{color:var(--dsw-alias-label-tertiary,#747a82);flex:none;transition:transform .12s}.WI9gSG_chevronOpen{transform:rotate(180deg)}.WI9gSG_sectionBody{gap:4px;padding:2px 12px 10px;display:grid}.WI9gSG_command{color:var(--dsw-alias-label-tertiary,#747a82);margin:0;padding:2px 0 0;font:11px/16px system-ui,sans-serif}.WI9gSG_field{background:var(--dsw-alias-bg-module-platform,#f5f6f7);width:100%;min-width:0;height:32px;color:var(--dsw-alias-label-primary,#17191c);cursor:pointer;text-align:left;border:1px solid #0000;border-radius:7px;outline:0;align-items:center;gap:6px;padding:0 8px;font:12px/18px system-ui,sans-serif;display:flex}.WI9gSG_field:hover{background:var(--dsw-alias-interactive-bg-hover,#26314814)}.WI9gSG_field:focus-visible{border-color:var(--dsw-alias-brand-primary,#4176e6);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary,#4176e6)}.WI9gSG_fieldValue{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.WI9gSG_fieldChevron,.WI9gSG_fieldChevronOpen{color:var(--dsw-alias-label-tertiary,#747a82);flex:none;transition:transform .12s}.WI9gSG_fieldChevronOpen{transform:rotate(180deg)}.WI9gSG_panel{z-index:1100;box-sizing:border-box;border:1px solid var(--dsw-alias-border-inverted,#00000014);background:var(--dsw-specific-menu,#fff);box-shadow:var(--dsw-shadow-lv3,0 8px 24px #00000024);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:12px;padding:4px;position:fixed;overflow:hidden}.WI9gSG_list{flex-direction:column;max-height:330px;display:flex;overflow:auto}.WI9gSG_option{cursor:pointer;border:0;border-radius:10px;grid-template-columns:18px minmax(0,1fr);align-items:center;gap:8px;min-height:40px;padding:6px 10px;display:grid}.WI9gSG_option:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.WI9gSG_option:focus-within{box-shadow:0 0 0 1px var(--dsw-alias-brand-primary,#4176e6)}.WI9gSG_option input{width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary,#4176e6);margin:0}.WI9gSG_optionText{min-width:0;display:block}.WI9gSG_optionName{color:var(--dsw-alias-label-primary,#17191c);font:600 12px/17px var(--ds-font-family-code,ui-monospace, monospace);text-overflow:ellipsis;white-space:nowrap;display:block;overflow:hidden}.WI9gSG_optionDescription{color:var(--dsw-alias-label-secondary,#555a62);text-overflow:ellipsis;white-space:nowrap;font:11px/16px system-ui,sans-serif;display:block;overflow:hidden}@media (prefers-reduced-motion:reduce){.WI9gSG_chevron,.WI9gSG_chevronOpen,.WI9gSG_fieldChevron,.WI9gSG_fieldChevronOpen{transition:none}}";
		const tagId$5 = "@canglongcl/dsh-web-review/UiSkillSelector.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$5) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@canglongcl/dsh-web-review";
			tag.dataset.pluginCss = tagId$5;
			tag.textContent = css$5;
			document.head.appendChild(tag);
		}
		var UiSkillSelector_module_css_default = {
			"panel": "WI9gSG_panel",
			"field": "WI9gSG_field",
			"chevronOpen": "WI9gSG_chevronOpen",
			"fieldChevron": "WI9gSG_fieldChevron",
			"count": "WI9gSG_count",
			"trigger": "WI9gSG_trigger",
			"command": "WI9gSG_command",
			"optionText": "WI9gSG_optionText",
			"fieldChevronOpen": "WI9gSG_fieldChevronOpen",
			"sectionBody": "WI9gSG_sectionBody",
			"fieldValue": "WI9gSG_fieldValue",
			"title": "WI9gSG_title",
			"optionName": "WI9gSG_optionName",
			"optionDescription": "WI9gSG_optionDescription",
			"root": "WI9gSG_root",
			"chevron": "WI9gSG_chevron",
			"option": "WI9gSG_option",
			"list": "WI9gSG_list"
		};
		//#endregion
		//#region src/client/UiSkillSelector.tsx
		const DESCRIPTION_KEYS = {
			"better-ui": "editor.skills.betterUi",
			"better-typography": "editor.skills.betterTypography",
			"better-layout": "editor.skills.betterLayout",
			"better-writing": "editor.skills.betterWriting",
			"better-accessibility": "editor.skills.betterAccessibility",
			"better-colors": "editor.skills.betterColors",
			"better-interface": "editor.skills.betterInterface",
			"interface-review": "editor.skills.interfaceReview"
		};
		/** Compact, annotation-batch Skill disclosure rendered first in Adjust mode. */
		function UiSkillSelector({ selected, t, onToggle }) {
			const [sectionOpen, setSectionOpen] = (0, react.useState)(false);
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const [placement, setPlacement] = (0, react.useState)(null);
			const bodyId = (0, react.useId)();
			const listId = (0, react.useId)();
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			const selectedSet = new Set(selected);
			(0, react.useEffect)(() => {
				if (!menuOpen) return;
				const closeOutside = (event) => {
					const target = event.target;
					if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setMenuOpen(false);
				};
				const closeOnEscape = (event) => {
					if (event.key === "Escape") setMenuOpen(false);
				};
				document.addEventListener("pointerdown", closeOutside);
				document.addEventListener("keydown", closeOnEscape);
				return () => {
					document.removeEventListener("pointerdown", closeOutside);
					document.removeEventListener("keydown", closeOnEscape);
				};
			}, [menuOpen]);
			(0, react.useLayoutEffect)(() => {
				if (!menuOpen) {
					setPlacement(null);
					return;
				}
				const place = () => {
					const trigger = triggerRef.current;
					const panel = panelRef.current;
					if (trigger === null || panel === null) return;
					const anchor = trigger.getBoundingClientRect();
					const margin = 12;
					const gap = 4;
					const width = Math.min(anchor.width, 360);
					panel.style.width = `${width}px`;
					const height = panel.offsetHeight;
					const left = Math.min(Math.max(anchor.left, margin), window.innerWidth - width - margin);
					const below = anchor.bottom + gap;
					const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, anchor.top - height - gap);
					setPlacement({
						left,
						top,
						width
					});
				};
				place();
				window.addEventListener("scroll", place, true);
				window.addEventListener("resize", place);
				return () => {
					window.removeEventListener("scroll", place, true);
					window.removeEventListener("resize", place);
				};
			}, [menuOpen]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				ref: rootRef,
				className: UiSkillSelector_module_css_default.root,
				"data-webview-ui-skills": "",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: UiSkillSelector_module_css_default.trigger,
						"aria-expanded": sectionOpen,
						"aria-controls": bodyId,
						onClick: () => {
							setSectionOpen((value) => {
								if (value) setMenuOpen(false);
								return !value;
							});
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: UiSkillSelector_module_css_default.title,
							children: t("editor.skills.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: sectionOpen ? UiSkillSelector_module_css_default.chevronOpen : UiSkillSelector_module_css_default.chevron })]
					}),
					sectionOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						id: bodyId,
						className: UiSkillSelector_module_css_default.sectionBody,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							ref: triggerRef,
							type: "button",
							className: UiSkillSelector_module_css_default.field,
							"aria-label": t("editor.skills.field"),
							"aria-haspopup": "dialog",
							"aria-expanded": menuOpen,
							"aria-controls": listId,
							onClick: () => {
								setMenuOpen((value) => !value);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: UiSkillSelector_module_css_default.fieldValue,
									children: selected.length === 0 ? t("editor.skills.field") : selected.join(", ")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: UiSkillSelector_module_css_default.count,
									children: t("editor.skills.count", { count: String(selected.length) })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: menuOpen ? UiSkillSelector_module_css_default.fieldChevronOpen : UiSkillSelector_module_css_default.fieldChevron })
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: UiSkillSelector_module_css_default.command,
							children: t("editor.skills.command")
						})]
					}),
					menuOpen && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: panelRef,
						id: listId,
						className: UiSkillSelector_module_css_default.panel,
						role: "dialog",
						"aria-label": t("editor.skills.title"),
						"data-webview-ui-skill-popover": "",
						style: placement ?? {
							visibility: "hidden",
							left: 0,
							top: 0
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: UiSkillSelector_module_css_default.list,
							children: UI_SKILLS.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: UiSkillSelector_module_css_default.option,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: selectedSet.has(skill.name),
									onChange: () => {
										onToggle(skill.name);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: UiSkillSelector_module_css_default.optionText,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: UiSkillSelector_module_css_default.optionName,
										children: skill.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: UiSkillSelector_module_css_default.optionDescription,
										children: t(DESCRIPTION_KEYS[skill.name])
									})]
								})]
							}, skill.name))
						})
					}), document.body)
				]
			});
		}
		//#endregion
		//#region src/client/composite-properties.ts
		/** Expand the CSS 1鈥? value shorthand in top/right/bottom/left order. */
		function expandQuad(value) {
			if (value.includes("/")) return null;
			const parts = value.trim().split(/\s+/u).filter(Boolean);
			if (parts.length < 1 || parts.length > 4 || parts.some((part) => parseNumeric(part) === null)) return null;
			if (parts.length === 1) return [
				parts[0],
				parts[0],
				parts[0],
				parts[0]
			];
			if (parts.length === 2) return [
				parts[0],
				parts[1],
				parts[0],
				parts[1]
			];
			if (parts.length === 3) return [
				parts[0],
				parts[1],
				parts[2],
				parts[1]
			];
			return [
				parts[0],
				parts[1],
				parts[2],
				parts[3]
			];
		}
		function serializeQuad(values, linked) {
			return linked ? values[0] : values.join(" ");
		}
		function hasTopLevelComma(value) {
			let depth = 0;
			for (const character of value) if (character === "(") depth += 1;
			else if (character === ")") depth -= 1;
			else if (character === "," && depth === 0) return true;
			return false;
		}
		/** Parse one editable shadow; lists and uncommon color syntaxes stay raw. */
		function parseSimpleShadow(value) {
			const raw = value.trim();
			if (raw === "none") return {
				inset: false,
				color: "rgba(0, 0, 0, 0.2)",
				colorFirst: false,
				lengths: [
					"0px",
					"4px",
					"12px",
					"0px"
				],
				arity: 4
			};
			if (hasTopLevelComma(raw)) return null;
			const colorMatch = /#[\da-f]{6}(?:[\da-f]{2})?|rgba?\([^)]*\)/iu.exec(raw);
			if (colorMatch === null || parseColor(colorMatch[0]) === null) return null;
			const colorFirst = raw.slice(0, colorMatch.index).trim() === "";
			const tokens = `${raw.slice(0, colorMatch.index)} ${raw.slice(colorMatch.index + colorMatch[0].length)}`.trim().split(/\s+/u).filter(Boolean);
			const insetIndex = tokens.indexOf("inset");
			const inset = insetIndex >= 0;
			if (inset) tokens.splice(insetIndex, 1);
			if (tokens.length < 2 || tokens.length > 4 || tokens.some((token) => parseNumeric(token) === null)) return null;
			const unit = parseNumeric(tokens[0])?.unit ?? "px";
			const zero = unit === "" ? "0" : `0${unit}`;
			return {
				inset,
				color: colorMatch[0],
				colorFirst,
				lengths: [
					tokens[0],
					tokens[1],
					tokens[2] ?? zero,
					tokens[3] ?? zero
				],
				arity: tokens.length
			};
		}
		function serializeSimpleShadow(shadow) {
			const lengths = shadow.lengths.slice(0, Math.max(2, shadow.arity)).join(" ");
			const inset = shadow.inset ? " inset" : "";
			return shadow.colorFirst ? `${shadow.color} ${lengths}${inset}` : `${lengths} ${shadow.color}${inset}`;
		}
		const TRANSFORM_DEFAULTS = {
			translateX: "0px",
			translateY: "0px",
			scaleX: "1",
			scaleY: "1",
			rotate: "0deg"
		};
		const TRANSFORM_ORDER = Object.keys(TRANSFORM_DEFAULTS);
		/** Parse a lossless subset while leaving matrices/unknown operations raw. */
		function parseSimpleTransform(value) {
			const raw = value.trim();
			if (raw === "none") return {
				order: [],
				values: { ...TRANSFORM_DEFAULTS }
			};
			const values = { ...TRANSFORM_DEFAULTS };
			const order = [];
			const expression = /([a-zA-Z]+)\(([^()]*)\)/gu;
			let cursor = 0;
			for (const match of raw.matchAll(expression)) {
				if (match.index === void 0 || raw.slice(cursor, match.index).trim() !== "") return null;
				const kind = match[1];
				const argument = match[2]?.trim() ?? "";
				if (!TRANSFORM_ORDER.includes(kind) || order.includes(kind) || parseNumeric(argument) === null) return null;
				if (kind.startsWith("scale") && parseNumeric(argument)?.unit !== "" || kind === "rotate" && ![
					"deg",
					"rad",
					"turn"
				].includes(parseNumeric(argument)?.unit ?? "")) return null;
				values[kind] = argument;
				order.push(kind);
				cursor = match.index + match[0].length;
			}
			if (order.length === 0 || raw.slice(cursor).trim() !== "") return null;
			return {
				order,
				values
			};
		}
		function serializeSimpleTransform(transform) {
			const order = [...transform.order];
			for (const kind of TRANSFORM_ORDER) if (!order.includes(kind) && transform.values[kind] !== TRANSFORM_DEFAULTS[kind]) order.push(kind);
			return order.length === 0 ? "none" : order.map((kind) => `${kind}(${transform.values[kind]})`).join(" ");
		}
		//#endregion
		//#region \0dsh-web-review-css:src/client/CompositeControls.module.css.mjs
		const css$4 = ".pEL6Qq_pair,.pEL6Qq_quad,.pEL6Qq_effectGrid{gap:4px;width:100%;display:grid}.pEL6Qq_pair,.pEL6Qq_quad{grid-template-columns:repeat(2,minmax(0,1fr)) 28px}.pEL6Qq_effectGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.pEL6Qq_fieldCell{min-width:0}.pEL6Qq_fieldCell>span{width:100%}.pEL6Qq_fieldCell input{flex-basis:100%;width:100%}.pEL6Qq_linkCell{grid-area:1/3/span 2;place-items:center;display:grid}.pEL6Qq_effectRow{justify-content:space-between;align-items:center;gap:8px;margin-top:6px;display:flex}.pEL6Qq_effectLabel{color:var(--dsw-alias-label-secondary,#555a62);font:11px/16px system-ui,sans-serif}.pEL6Qq_raw{gap:4px;display:grid}.pEL6Qq_rawHint{color:var(--dsw-alias-label-tertiary,#747a82);font:10px/14px system-ui,sans-serif}";
		const tagId$4 = "@canglongcl/dsh-web-review/CompositeControls.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$4) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@canglongcl/dsh-web-review";
			tag.dataset.pluginCss = tagId$4;
			tag.textContent = css$4;
			document.head.appendChild(tag);
		}
		var CompositeControls_module_css_default = {
			"quad": "pEL6Qq_quad",
			"fieldCell": "pEL6Qq_fieldCell",
			"rawHint": "pEL6Qq_rawHint",
			"linkCell": "pEL6Qq_linkCell",
			"effectRow": "pEL6Qq_effectRow",
			"effectLabel": "pEL6Qq_effectLabel",
			"pair": "pEL6Qq_pair",
			"raw": "pEL6Qq_raw",
			"effectGrid": "pEL6Qq_effectGrid"
		};
		//#endregion
		//#region src/client/CompositeControls.tsx
		function Cell({ badge, label, value, fallbackValue = "0px", options = [], presetLabel, onChange, onScrubChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: CompositeControls_module_css_default.fieldCell,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScrubNumber, {
					label,
					value,
					glyph: badge,
					fallbackValue,
					options,
					...presetLabel === void 0 ? {} : { presetLabel },
					onChange,
					onScrubChange
				})
			});
		}
		function CornerRadiusGlyph({ corner }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				"data-corner-radius-glyph": corner,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M13 3H9a6 6 0 0 0-6 6v4",
					transform: `rotate(${String({
						"top-left": 0,
						"top-right": 90,
						"bottom-right": 180,
						"bottom-left": 270
					}[corner])} 8 8)`,
					stroke: "currentColor",
					strokeWidth: "1.6",
					strokeLinecap: "round"
				})
			});
		}
		function LinkToggle({ linked, linkLabel, unlinkLabel, onChange }) {
			const icon = linked ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLinkOutline14, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 14 14",
				fill: "none",
				"aria-hidden": true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M5.25 4.1 6.4 2.95a2.4 2.4 0 0 1 3.4 3.4L8.65 7.5M8.75 9.9 7.6 11.05a2.4 2.4 0 0 1-3.4-3.4L5.35 6.5M2 2l10 10",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinecap: "round"
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: CompositeControls_module_css_default.linkCell,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleButton, {
					label: linked ? unlinkLabel : linkLabel,
					pressed: linked,
					onToggle: () => {
						onChange(!linked);
					},
					children: icon
				})
			});
		}
		function SizeControl({ width, height, labels, options = [], presetLabel, onWidthChange, onHeightChange, onScrubChange }) {
			const [linked, setLinked] = (0, react.useState)(false);
			const ratio = (0, react.useRef)(null);
			const toggle = (next) => {
				if (next) {
					const w = parseNumeric(width);
					const h = parseNumeric(height);
					ratio.current = w !== null && h !== null && h.number !== 0 ? w.number / h.number : null;
				}
				setLinked(next);
			};
			const coupled = (next, fromWidth) => {
				const nextNumeric = parseNumeric(next);
				const other = parseNumeric(fromWidth ? height : width);
				const currentRatio = ratio.current;
				if (linked && nextNumeric !== null && other !== null && currentRatio !== null && currentRatio !== 0) {
					const value = fromWidth ? nextNumeric.number / currentRatio : nextNumeric.number * currentRatio;
					const rounded = Math.round(value * 1e3) / 1e3;
					if (fromWidth) onHeightChange(`${rounded}${other.unit}`);
					else onWidthChange(`${rounded}${other.unit}`);
				}
				if (fromWidth) onWidthChange(next);
				else onHeightChange(next);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: CompositeControls_module_css_default.pair,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Cell, {
						badge: "W",
						label: labels.width,
						value: width,
						options,
						...presetLabel === void 0 ? {} : { presetLabel },
						onChange: (next) => {
							coupled(next, true);
						},
						onScrubChange
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Cell, {
						badge: "H",
						label: labels.height,
						value: height,
						options,
						...presetLabel === void 0 ? {} : { presetLabel },
						onChange: (next) => {
							coupled(next, false);
						},
						onScrubChange
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LinkToggle, {
						linked,
						linkLabel: labels.link,
						unlinkLabel: labels.unlink,
						onChange: toggle
					})
				]
			});
		}
		function RadiusControl({ label, value, cornerLabels, linkLabel, unlinkLabel, rawHint, onChange, onScrubChange }) {
			const parsed = expandQuad(value);
			const [linked, setLinked] = (0, react.useState)(() => parsed !== null && parsed.every((part) => part === parsed[0]));
			if (parsed === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: CompositeControls_module_css_default.raw,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
					label,
					value,
					onChange
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CompositeControls_module_css_default.rawHint,
					children: rawHint
				})]
			});
			const update = (index, next) => {
				const values = [...parsed];
				if (linked) values.fill(next);
				else values[index] = next;
				onChange(serializeQuad(values, linked));
			};
			const visualOrder = [
				0,
				1,
				3,
				2
			];
			const corners = [
				"top-left",
				"top-right",
				"bottom-left",
				"bottom-right"
			];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: CompositeControls_module_css_default.quad,
				children: [visualOrder.map((valueIndex, visualIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Cell, {
					badge: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CornerRadiusGlyph, { corner: corners[visualIndex] }),
					label: cornerLabels[valueIndex],
					value: parsed[valueIndex],
					onScrubChange,
					onChange: (next) => {
						update(valueIndex, next);
					}
				}, valueIndex)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LinkToggle, {
					linked,
					linkLabel,
					unlinkLabel,
					onChange: setLinked
				})]
			});
		}
		function ShadowControl({ label, value, labels, rawHint, onChange, onScrubChange }) {
			const parsed = parseSimpleShadow(value);
			if (parsed === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: CompositeControls_module_css_default.raw,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
					label,
					value,
					onChange
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CompositeControls_module_css_default.rawHint,
					children: rawHint
				})]
			});
			const updateLength = (index, next) => {
				const shadow = {
					...parsed,
					lengths: [...parsed.lengths],
					arity: Math.max(parsed.arity, index + 1)
				};
				shadow.lengths[index] = next;
				onChange(serializeSimpleShadow(shadow));
			};
			const fieldLabels = [
				labels.x,
				labels.y,
				labels.blur,
				labels.spread
			];
			const badges = [
				"X",
				"Y",
				"B",
				"S"
			];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CompositeControls_module_css_default.effectGrid,
					children: parsed.lengths.map((part, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Cell, {
						badge: badges[index],
						label: fieldLabels[index],
						value: part,
						onScrubChange,
						onChange: (next) => {
							updateLength(index, next);
						}
					}, badges[index]))
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: CompositeControls_module_css_default.effectRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CompositeControls_module_css_default.effectLabel,
						children: labels.color
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ColorControl, {
						label: labels.color,
						value: parsed.color,
						onScrubChange,
						onChange: (color) => {
							onChange(serializeSimpleShadow({
								...parsed,
								color
							}));
						}
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: CompositeControls_module_css_default.effectRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CompositeControls_module_css_default.effectLabel,
						children: labels.inset
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleButton, {
						label: labels.inset,
						pressed: parsed.inset,
						onToggle: () => {
							onChange(serializeSimpleShadow({
								...parsed,
								inset: !parsed.inset
							}));
						},
						children: "I"
					})]
				})
			] });
		}
		function TransformControl({ label, value, labels, rawHint, onChange, onScrubChange }) {
			const parsed = parseSimpleTransform(value);
			if (parsed === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: CompositeControls_module_css_default.raw,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
					label,
					value,
					onChange
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CompositeControls_module_css_default.rawHint,
					children: rawHint
				})]
			});
			const update = (kind, next) => {
				onChange(serializeSimpleTransform({
					...parsed,
					values: {
						...parsed.values,
						[kind]: next
					}
				}));
			};
			const badges = {
				translateX: "X",
				translateY: "Y",
				scaleX: "SX",
				scaleY: "SY",
				rotate: "掳"
			};
			const kinds = Object.keys(badges);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: CompositeControls_module_css_default.effectGrid,
				children: kinds.map((kind) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Cell, {
					badge: badges[kind],
					label: labels[kind],
					value: parsed.values[kind],
					fallbackValue: kind === "scaleX" || kind === "scaleY" ? "1" : kind === "rotate" ? "0deg" : "0px",
					onScrubChange,
					onChange: (next) => {
						update(kind, next);
					}
				}, kind))
			});
		}
		//#endregion
		//#region \0dsh-web-review-css:src/client/ElementSelector.module.css.mjs
		const css$3 = ".h4MIqG_selector,.h4MIqG_selector *{box-sizing:border-box}.h4MIqG_selector{border-top:1px solid var(--dsw-alias-border-l1,#00000014);background:#fff;flex-direction:column;flex:auto;min-height:0;display:flex}.h4MIqG_actions{flex:none;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:8px 12px;display:grid}.h4MIqG_actions button{border:1px solid var(--dsw-alias-border-l1,#00000014);background:var(--dsw-alias-bg-module-platform,#f4f5f6);min-width:0;height:32px;color:var(--dsw-alias-label-secondary,#4b4f57);cursor:pointer;text-align:left;border-radius:8px;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px;padding:0 10px;font:600 11px/16px system-ui,sans-serif;display:grid;position:relative}.h4MIqG_actions button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#26314814)}.h4MIqG_actions button:disabled{cursor:default;opacity:.42}.h4MIqG_shortcut{border:1px solid var(--dsw-alias-border-l2,#0000001f);min-width:17px;height:16px;color:var(--dsw-alias-label-tertiary,#727780);text-align:center;background:#ffffffb8;border-radius:4px;padding:0 3px;font:500 9px/14px ui-monospace,SFMono-Regular,Menlo,monospace}.h4MIqG_treeHeader{border-bottom:1px solid var(--dsw-alias-border-l1,#00000014);color:var(--dsw-alias-label-tertiary,#727780);flex:none;justify-content:space-between;padding:0 14px 8px;font:600 11px/16px system-ui,sans-serif;display:flex}.h4MIqG_treeViewportShell{flex:auto;min-height:180px;max-height:min(360px,100vh - 290px);display:flex;position:relative;overflow:hidden}.h4MIqG_treeViewport{flex:auto;min-height:0;padding:6px 8px;overflow:auto}.h4MIqG_treeFade{z-index:1;opacity:0;pointer-events:none;background:linear-gradient(#fff0,#fff 82%);height:44px;transition:opacity .18s ease-out;position:absolute;bottom:0;left:0;right:0}.h4MIqG_treeViewportShell[data-can-scroll-down] .h4MIqG_treeFade{opacity:1}.h4MIqG_tree,.h4MIqG_tree ul{margin:0;padding:0;list-style:none}.h4MIqG_treeRow{border:1px solid #0000;border-radius:9px;align-items:center;min-width:max-content;height:34px;display:flex}.h4MIqG_treeRow:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.h4MIqG_treeRowCurrent{background:#e8eefc;border-color:#b9ccf7;box-shadow:inset 3px 0 #4176e6}.h4MIqG_treeRowCurrent:hover{background:#e8eefc}.h4MIqG_disclosure,.h4MIqG_elementButton{color:inherit;cursor:pointer;background:0 0;border:0}.h4MIqG_disclosure{width:20px;height:20px;color:var(--dsw-alias-label-tertiary,#727780);border-radius:6px;flex:none;place-items:center;margin:4px 1px;padding:0;transition:color .12s,background .12s;display:grid}.h4MIqG_disclosure:hover{background:var(--dsw-alias-interactive-bg-hover,#26314814);color:var(--dsw-alias-label-primary,#17191c)}.h4MIqG_disclosureExpanded{color:var(--dsw-alias-label-secondary,#4b4f57);background:0 0}.h4MIqG_disclosureExpanded:hover{background:var(--dsw-alias-interactive-bg-hover,#26314814);color:var(--dsw-alias-label-primary,#17191c)}.h4MIqG_treeRowCurrent .h4MIqG_disclosureExpanded{color:#315fca}.h4MIqG_disclosure svg{width:12px;height:12px}.h4MIqG_disclosureSpacer{flex:none;width:22px}.h4MIqG_elementButton{align-items:center;min-width:0;height:32px;padding:0 8px 0 0;font:13px/18px system-ui,sans-serif;display:flex}.h4MIqG_glyph{width:20px;height:20px;color:var(--dsw-alias-label-tertiary,#727780);background:#f0f1f3;border-radius:5px;flex:none;place-items:center;margin-right:7px;font:10px/20px ui-monospace,SFMono-Regular,Menlo,monospace;display:inline-grid}.h4MIqG_treeRowCurrent .h4MIqG_glyph{color:#315fca;background:#d9e5ff}.h4MIqG_tag{color:var(--dsw-alias-label-primary,#17191c);flex:none;font:600 13px/18px ui-monospace,SFMono-Regular,Menlo,monospace}.h4MIqG_detail{max-width:180px;color:var(--dsw-alias-label-tertiary,#727780);text-overflow:ellipsis;white-space:nowrap;margin-left:5px;overflow:hidden}@media (prefers-reduced-motion:reduce){.h4MIqG_treeFade{transition-duration:0s}}";
		const tagId$3 = "@canglongcl/dsh-web-review/ElementSelector.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@canglongcl/dsh-web-review";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var ElementSelector_module_css_default = {
			"disclosureExpanded": "h4MIqG_disclosureExpanded",
			"disclosureSpacer": "h4MIqG_disclosureSpacer",
			"treeHeader": "h4MIqG_treeHeader",
			"tree": "h4MIqG_tree",
			"tag": "h4MIqG_tag",
			"treeFade": "h4MIqG_treeFade",
			"detail": "h4MIqG_detail",
			"treeViewportShell": "h4MIqG_treeViewportShell",
			"actions": "h4MIqG_actions",
			"treeViewport": "h4MIqG_treeViewport",
			"treeRow": "h4MIqG_treeRow",
			"elementButton": "h4MIqG_elementButton",
			"glyph": "h4MIqG_glyph",
			"shortcut": "h4MIqG_shortcut",
			"selector": "h4MIqG_selector",
			"disclosure": "h4MIqG_disclosure",
			"treeRowCurrent": "h4MIqG_treeRowCurrent"
		};
		//#endregion
		//#region src/client/PreviewElementSelector.tsx
		function ShortcutKey({ children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("kbd", {
				className: ElementSelector_module_css_default.shortcut,
				"aria-hidden": true,
				children
			});
		}
		function ElementGlyph({ text }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: ElementSelector_module_css_default.glyph,
				"aria-hidden": true,
				children: text ? "T" : "<>"
			});
		}
		function detailText(node, t) {
			if (node.detail.kind === "children") return t("editor.select.children", { count: String(node.detail.count) });
			if (node.detail.kind === "empty") return t("editor.select.empty");
			return `鈥?{node.detail.text}鈥漙;
		}
		function currentPath(node) {
			if (node.current) return [node.key];
			for (const child of node.children) {
				const path = currentPath(child);
				if (path !== void 0) return [node.key, ...path];
			}
		}
		function TreeNode({ node, depth, expanded, t, onToggle, onSelect }) {
			const hasChildren = node.children.length > 0;
			const isExpanded = expanded.has(node.key);
			const rowRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (node.current) rowRef.current?.scrollIntoView?.({ block: "nearest" });
			}, [node.current]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				role: "treeitem",
				"aria-level": depth + 1,
				"aria-selected": node.current,
				"aria-expanded": hasChildren ? isExpanded : void 0,
				tabIndex: -1,
				"data-tree-key": node.key,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: rowRef,
					className: node.current ? `${ElementSelector_module_css_default.treeRow} ${ElementSelector_module_css_default.treeRowCurrent}` : ElementSelector_module_css_default.treeRow,
					style: { paddingInlineStart: 6 + depth * 20 },
					"data-webview-element-row": "",
					children: [hasChildren ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: isExpanded ? `${ElementSelector_module_css_default.disclosure} ${ElementSelector_module_css_default.disclosureExpanded}` : ElementSelector_module_css_default.disclosure,
						"aria-label": t(isExpanded ? "editor.select.collapse" : "editor.select.expand", { tag: node.tagName }),
						"aria-expanded": isExpanded,
						tabIndex: -1,
						"data-state": isExpanded ? "expanded" : "collapsed",
						onClick: () => {
							onToggle(node.key);
						},
						children: isExpanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { size: 12 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 12 })
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: ElementSelector_module_css_default.disclosureSpacer }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: ElementSelector_module_css_default.elementButton,
						"aria-label": `${node.tagName} ${detailText(node, t)}`,
						tabIndex: -1,
						onClick: () => {
							onSelect(node.handle);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ElementGlyph, { text: !hasChildren }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: ElementSelector_module_css_default.tag,
								children: node.tagName
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: ElementSelector_module_css_default.detail,
								children: detailText(node, t)
							})
						]
					})]
				}), hasChildren && isExpanded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					role: "group",
					children: node.children.map((child) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TreeNode, {
						node: child,
						depth: depth + 1,
						expanded,
						t,
						onToggle,
						onSelect
					}, child.key))
				})]
			});
		}
		/** Host renderer for the bounded hierarchy serialized by the frame bridge. */
		function PreviewElementSelector({ target, tree, t, onNavigate, onSelect }) {
			const initialExpanded = (0, react.useMemo)(() => new Set(tree === null ? [] : currentPath(tree) ?? []), [tree]);
			const [expanded, setExpanded] = (0, react.useState)(initialExpanded);
			const [canScrollDown, setCanScrollDown] = (0, react.useState)(false);
			const viewportRef = (0, react.useRef)(null);
			const syncScrollAffordance = (0, react.useCallback)(() => {
				const viewport = viewportRef.current;
				if (viewport === null) return;
				const next = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 2;
				setCanScrollDown((current) => current === next ? current : next);
			}, []);
			(0, react.useEffect)(() => {
				setExpanded(initialExpanded);
			}, [initialExpanded]);
			(0, react.useEffect)(() => {
				const viewport = viewportRef.current;
				if (viewport === null) return;
				syncScrollAffordance();
				if (typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(syncScrollAffordance);
				observer.observe(viewport);
				return () => {
					observer.disconnect();
				};
			}, [expanded, syncScrollAffordance]);
			const action = (name) => {
				if (target.navigation[name]) onNavigate(name);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ElementSelector_module_css_default.selector,
				"data-webview-element-selector": "",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ElementSelector_module_css_default.actions,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								tabIndex: -1,
								"aria-label": t("editor.select.child"),
								disabled: !target.navigation.child,
								onClick: () => {
									action("child");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("editor.select.child.short") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShortcutKey, { children: "鈫? })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								tabIndex: -1,
								"aria-label": t("editor.select.parent"),
								disabled: !target.navigation.parent,
								onClick: () => {
									action("parent");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("editor.select.parent.short") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShortcutKey, { children: "\\" })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								tabIndex: -1,
								"aria-label": t("editor.select.previousSibling"),
								disabled: !target.navigation["previous-sibling"],
								onClick: () => {
									action("previous-sibling");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("editor.select.previousSibling.short") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShortcutKey, { children: "鈬р嚗" })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								tabIndex: -1,
								"aria-label": t("editor.select.sibling"),
								disabled: !target.navigation["next-sibling"],
								onClick: () => {
									action("next-sibling");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("editor.select.sibling.short") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShortcutKey, { children: "鈬? })]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: ElementSelector_module_css_default.treeHeader,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("editor.select.tree") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ElementSelector_module_css_default.treeViewportShell,
						...canScrollDown ? { "data-can-scroll-down": "" } : {},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							ref: viewportRef,
							className: ElementSelector_module_css_default.treeViewport,
							"data-webview-element-tree": "",
							onScroll: syncScrollAffordance,
							children: tree !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: ElementSelector_module_css_default.tree,
								role: "tree",
								"aria-label": t("editor.select.tree"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TreeNode, {
									node: tree,
									depth: 0,
									expanded,
									t,
									onToggle: (key) => {
										setExpanded((current) => {
											const next = new Set(current);
											if (next.has(key)) next.delete(key);
											else next.add(key);
											return next;
										});
									},
									onSelect
								})
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: ElementSelector_module_css_default.treeFade,
							"data-webview-element-tree-fade": "",
							"aria-hidden": "true"
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/element-navigation.ts
		/** True when hierarchy shortcuts must defer to an editable/interactive UI. */
		function isElementNavigationInput(target, capturePageActions = false) {
			if (target === null || typeof target !== "object") return false;
			const element = target.nodeType === 1 ? target : target.parentElement;
			if (element === null || element === void 0) return false;
			const editable = [
				"input",
				"textarea",
				"select",
				"[contenteditable]:not([contenteditable=\"false\"])"
			];
			if (capturePageActions) return element.closest(editable.join(",")) !== null;
			return element.closest([
				...editable,
				"button",
				"a[href]",
				"[role=\"menu\"]",
				"[role=\"dialog\"]",
				"[aria-haspopup=\"menu\"]"
			].join(",")) !== null;
		}
		/** Map an unmodified keyboard event to a hierarchy movement. */
		function elementNavigationAction(event, options = {}) {
			if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return null;
			if (isElementNavigationInput(event.target, options.capturePageActions ?? false)) return null;
			if (event.key === "Enter") return "child";
			if (event.code === "Backslash" || event.key === "\\") return "parent";
			if (event.key === "Tab") return event.shiftKey ? "previous-sibling" : "next-sibling";
			return null;
		}
		//#endregion
		//#region src/client/floating-position.ts
		const MARGIN = 8;
		const GAP = 8;
		function clamp(value, min, max) {
			return Math.min(Math.max(value, min), Math.max(min, max));
		}
		/** Keep a manually positioned editor fully inside the preview surface. */
		function clampFloatingEditorPosition({ position, surfaceWidth, surfaceHeight, editorWidth, editorHeight }) {
			return {
				left: clamp(position.left, MARGIN, surfaceWidth - editorWidth - MARGIN),
				top: clamp(position.top, MARGIN, surfaceHeight - editorHeight - MARGIN)
			};
		}
		/** Resize from any edge while keeping the opposite edge fixed and in bounds. */
		function resizeFloatingEditor({ edge, position, size, deltaX, deltaY, surfaceWidth, surfaceHeight, minWidth, minHeight }) {
			const maxSurfaceWidth = Math.max(0, surfaceWidth - 16);
			const maxSurfaceHeight = Math.max(0, surfaceHeight - 16);
			const boundedMinWidth = Math.min(minWidth, maxSurfaceWidth);
			const boundedMinHeight = Math.min(minHeight, maxSurfaceHeight);
			const right = position.left + size.width;
			const bottom = position.top + size.height;
			let left = position.left;
			let top = position.top;
			let width = size.width;
			let height = size.height;
			if (edge.includes("w")) {
				left = clamp(position.left + deltaX, MARGIN, right - boundedMinWidth);
				width = right - left;
			} else if (edge.includes("e")) width = clamp(size.width + deltaX, boundedMinWidth, surfaceWidth - MARGIN - position.left);
			if (edge.includes("n")) {
				top = clamp(position.top + deltaY, MARGIN, bottom - boundedMinHeight);
				height = bottom - top;
			} else if (edge.includes("s")) height = clamp(size.height + deltaY, boundedMinHeight, surfaceHeight - MARGIN - position.top);
			return {
				position: {
					left,
					top
				},
				size: {
					width,
					height
				}
			};
		}
		/** Place a host editor beside its iframe-local target, shrinking before overlap. */
		function placeFloatingEditor({ target, surfaceWidth, surfaceHeight, editorWidth, editorHeight, minHeight }) {
			const boundedHeight = Math.min(editorHeight, Math.max(minHeight, surfaceHeight - 16));
			const leftAligned = clamp(target.left, MARGIN, surfaceWidth - editorWidth - MARGIN);
			const aboveSpace = target.top - GAP - MARGIN;
			const belowSpace = surfaceHeight - target.bottom - GAP - MARGIN;
			const vertical = belowSpace > aboveSpace ? [{
				side: "below",
				space: belowSpace
			}, {
				side: "above",
				space: aboveSpace
			}] : [{
				side: "above",
				space: aboveSpace
			}, {
				side: "below",
				space: belowSpace
			}];
			for (const candidate of vertical) {
				if (candidate.space < minHeight) continue;
				const maxHeight = Math.min(boundedHeight, candidate.space);
				return {
					left: leftAligned,
					top: candidate.side === "above" ? target.top - GAP - maxHeight : target.bottom + GAP,
					maxHeight,
					side: candidate.side
				};
			}
			const rightSpace = surfaceWidth - target.right - GAP - MARGIN;
			const leftSpace = target.left - GAP - MARGIN;
			if (rightSpace >= editorWidth || leftSpace >= editorWidth) {
				const side = rightSpace >= leftSpace ? "right" : "left";
				return {
					left: side === "right" ? target.right + GAP : target.left - GAP - editorWidth,
					top: clamp(target.top + (target.height - boundedHeight) / 2, MARGIN, surfaceHeight - boundedHeight - MARGIN),
					maxHeight: boundedHeight,
					side
				};
			}
			return {
				left: leftAligned,
				top: belowSpace >= aboveSpace ? clamp(target.bottom + GAP, MARGIN, surfaceHeight - boundedHeight - MARGIN) : clamp(target.top - GAP - boundedHeight, MARGIN, surfaceHeight - boundedHeight - MARGIN),
				maxHeight: boundedHeight,
				side: "overlap"
			};
		}
		//#endregion
		//#region \0dsh-web-review-css:src/client/AnnotationEditor.module.css.mjs
		const css$2 = ".nwQxDW_editor,.nwQxDW_editor *{box-sizing:border-box}.nwQxDW_editor{z-index:20;border:1px solid var(--dsw-alias-border-l1,#00000014);max-height:calc(100% - 16px);color:var(--dsw-alias-label-primary,#17191c);font-family:Inter, var(--dsw-font-family,system-ui, sans-serif);background:#fff;border-radius:18px;outline:none;flex-direction:column;display:flex;position:absolute;overflow:hidden;box-shadow:0 22px 56px #0f172a3d,0 8px 20px #0f172a29,0 2px 5px #0f172a1f;container-type:inline-size}.nwQxDW_editorHidden{visibility:hidden;opacity:0;pointer-events:none}.nwQxDW_editor[data-scrubbing]{box-shadow:none;background-color:#0000;border-color:#0000}.nwQxDW_editor[data-scrubbing] *{visibility:hidden;pointer-events:none;transition:none!important}.nwQxDW_editor[data-scrubbing] [data-scrub-active],.nwQxDW_editor[data-scrubbing] [data-scrub-active] *{visibility:visible;pointer-events:auto}.nwQxDW_composeRow{background:#fff;flex:none;grid-template-columns:34px 34px minmax(0,1fr) 34px 34px;align-items:center;gap:6px;min-height:52px;padding:6px 9px;display:grid}.nwQxDW_composeRowExpanded{grid-template-columns:34px 34px minmax(0,1fr) 34px 34px}.nwQxDW_adjust,.nwQxDW_dragHandle,.nwQxDW_visibilityToggle,.nwQxDW_quickConfirm,.nwQxDW_reset,.nwQxDW_confirm,.nwQxDW_cancel{cursor:pointer;border:0;place-items:center;display:inline-grid}.nwQxDW_adjust,.nwQxDW_dragHandle,.nwQxDW_visibilityToggle,.nwQxDW_quickConfirm{background:var(--dsw-alias-bg-module-platform,#f4f5f6);width:34px;height:34px;color:var(--dsw-alias-label-secondary,#4b4f57);border-radius:999px;padding:0}.nwQxDW_visibilityToggle:hover{background:var(--dsw-alias-interactive-bg-hover,#26314814);color:var(--dsw-alias-label-primary,#17191c)}.nwQxDW_dragHandle{touch-action:none;cursor:grab;user-select:none}.nwQxDW_dragHandle:hover,.nwQxDW_editor[data-editor-dragging] .nwQxDW_dragHandle{background:color-mix(in srgb, var(--dsw-alias-state-business-primary,#4176e6) 13%, #fff);color:var(--dsw-alias-state-business-primary,#4176e6)}.nwQxDW_editor[data-editor-dragging] .nwQxDW_dragHandle{cursor:grabbing}.nwQxDW_resizeHandle{z-index:5;touch-action:none;user-select:none;position:absolute}.nwQxDW_resizeHandle[data-resize-edge=n],.nwQxDW_resizeHandle[data-resize-edge=s]{cursor:ns-resize;width:calc(100% - 48px);height:12px;left:24px}.nwQxDW_resizeHandle[data-resize-edge=n]{top:0}.nwQxDW_resizeHandle[data-resize-edge=s]{bottom:0}.nwQxDW_resizeHandle[data-resize-edge=e],.nwQxDW_resizeHandle[data-resize-edge=w]{cursor:ew-resize;width:12px;height:calc(100% - 48px);top:24px}.nwQxDW_resizeHandle[data-resize-edge=e]{right:0}.nwQxDW_resizeHandle[data-resize-edge=w]{left:0}.nwQxDW_resizeHandle[data-resize-edge=ne],.nwQxDW_resizeHandle[data-resize-edge=se],.nwQxDW_resizeHandle[data-resize-edge=sw],.nwQxDW_resizeHandle[data-resize-edge=nw]{width:24px;height:24px}.nwQxDW_resizeHandle[data-resize-edge=ne]{cursor:nesw-resize;top:0;right:0}.nwQxDW_resizeHandle[data-resize-edge=se]{cursor:nwse-resize;bottom:0;right:0}.nwQxDW_resizeHandle[data-resize-edge=sw]{cursor:nesw-resize;bottom:0;left:0}.nwQxDW_resizeHandle[data-resize-edge=nw]{cursor:nwse-resize;top:0;left:0}@media (pointer:coarse){.nwQxDW_resizeHandle[data-resize-edge=n],.nwQxDW_resizeHandle[data-resize-edge=s]{height:20px}.nwQxDW_resizeHandle[data-resize-edge=e],.nwQxDW_resizeHandle[data-resize-edge=w]{width:20px}}.nwQxDW_visibilityFab{z-index:21;border:1px solid var(--dsw-alias-border-l1,#00000014);width:36px;height:36px;color:var(--dsw-alias-label-secondary,#4b4f57);cursor:pointer;background:#fff;border-radius:999px;place-items:center;padding:0;display:inline-grid;position:absolute;box-shadow:0 6px 18px #00000029,0 1px 4px #00000014}.nwQxDW_visibilityFab:hover{background:var(--dsw-alias-interactive-bg-hover,#f4f5f6);color:var(--dsw-alias-label-primary,#17191c)}.nwQxDW_visibilityFabHidden{visibility:hidden;opacity:0;pointer-events:none}.nwQxDW_adjust:hover,.nwQxDW_adjustActive{background:var(--dsw-alias-interactive-bg-hover,#26314814);color:var(--dsw-alias-label-primary,#17191c)}.nwQxDW_quickConfirm,.nwQxDW_confirm{background:var(--dsw-alias-state-business-primary,#4176e6);color:#fff}.nwQxDW_commentInput{width:100%;height:36px;color:var(--dsw-alias-label-primary,#17191c);font:var(--dsw-font-s-14,14px/22px system-ui, sans-serif);background:#fff;border:0;outline:0;padding:0 2px}.nwQxDW_commentInput::placeholder{color:var(--dsw-alias-label-dimmed,#a9adb4)}.nwQxDW_navigationFeedbackSlot{--navigation-x:0;--navigation-y:-4px;flex:none;height:28px;overflow:hidden}.nwQxDW_navigationFeedback{height:28px;color:var(--dsw-alias-label-secondary,#4b4f57);white-space:nowrap;background:#f2f6ff;border-top:1px solid #4176e61a;align-items:center;gap:7px;padding:0 12px;font:500 11px/16px system-ui,sans-serif;display:flex;overflow:hidden}[data-action=parent].nwQxDW_navigationFeedbackSlot{--navigation-y:4px}[data-action=previous-sibling].nwQxDW_navigationFeedbackSlot{--navigation-x:6px;--navigation-y:0}[data-action=next-sibling].nwQxDW_navigationFeedbackSlot{--navigation-x:-6px;--navigation-y:0}.nwQxDW_navigationTarget{text-overflow:ellipsis;overflow:hidden}[data-action] .nwQxDW_navigationTarget{animation:.22s cubic-bezier(.2,0,0,1) both nwQxDW_navigation-target-in}.nwQxDW_navigationGlyph{color:#4176e6;flex:none;font:600 10px/16px ui-monospace,SFMono-Regular,Menlo,monospace}@keyframes nwQxDW_navigation-target-in{0%{opacity:.25;transform:translate(var(--navigation-x), var(--navigation-y))}to{opacity:1;transform:translate(0)}}.nwQxDW_inspector{border-top:1px solid var(--dsw-alias-border-l1,#00000014);background:#fff;flex:auto;min-height:0;max-height:min(470px,100vh - 220px);padding-bottom:8px;overflow:auto}.nwQxDW_footer{z-index:2;border-top:1px solid var(--dsw-alias-border-l1,#00000014);background:#fff;flex:none;justify-content:space-between;align-items:center;padding:8px 12px;display:flex;position:relative;box-shadow:0 -6px 14px #0000000a}.nwQxDW_cancel{border:1px solid var(--dsw-alias-border-l2,#0000001f);min-width:58px;height:32px;color:var(--dsw-alias-label-primary,#17191c);background:#fff;border-radius:999px;padding:0 12px;font:500 13px/20px system-ui,sans-serif}.nwQxDW_confirm{border-radius:999px;width:34px;height:34px;padding:0}.nwQxDW_confirm:disabled,.nwQxDW_quickConfirm:disabled{opacity:.4;cursor:default}@media (prefers-reduced-motion:reduce){.nwQxDW_editor,.nwQxDW_editor *,.nwQxDW_visibilityFab{scroll-behavior:auto;transition-duration:0s}[data-action] .nwQxDW_navigationTarget{animation-name:nwQxDW_navigation-target-fade}}@keyframes nwQxDW_navigation-target-fade{0%{opacity:.4}to{opacity:1}}";
		const tagId$2 = "@canglongcl/dsh-web-review/AnnotationEditor.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@canglongcl/dsh-web-review";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var AnnotationEditor_module_css_default = {
			"dragHandle": "nwQxDW_dragHandle",
			"editor": "nwQxDW_editor",
			"navigation-target-fade": "nwQxDW_navigation-target-fade",
			"commentInput": "nwQxDW_commentInput",
			"footer": "nwQxDW_footer",
			"adjust": "nwQxDW_adjust",
			"navigation-target-in": "nwQxDW_navigation-target-in",
			"visibilityToggle": "nwQxDW_visibilityToggle",
			"visibilityFabHidden": "nwQxDW_visibilityFabHidden",
			"adjustActive": "nwQxDW_adjustActive",
			"visibilityFab": "nwQxDW_visibilityFab",
			"navigationFeedback": "nwQxDW_navigationFeedback",
			"composeRow": "nwQxDW_composeRow",
			"composeRowExpanded": "nwQxDW_composeRowExpanded",
			"confirm": "nwQxDW_confirm",
			"cancel": "nwQxDW_cancel",
			"navigationFeedbackSlot": "nwQxDW_navigationFeedbackSlot",
			"editorHidden": "nwQxDW_editorHidden",
			"navigationTarget": "nwQxDW_navigationTarget",
			"inspector": "nwQxDW_inspector",
			"navigationGlyph": "nwQxDW_navigationGlyph",
			"quickConfirm": "nwQxDW_quickConfirm",
			"resizeHandle": "nwQxDW_resizeHandle",
			"reset": "nwQxDW_reset"
		};
		//#endregion
		//#region src/client/AnnotationEditor.tsx
		const ignorePositionChange = () => {};
		const ignoreSizeChange = () => {};
		const ignoreSizeCommit = () => {};
		const RESIZE_EDGES = [
			"n",
			"ne",
			"e",
			"se",
			"s",
			"sw",
			"w",
			"nw"
		];
		function previewNavigationTargetLabel(target, t) {
			const tag = target.snapshot.tagName;
			if (target.detail.kind === "children") return `${tag} 路 ${t("editor.select.children", { count: String(target.detail.count) })}`;
			if (target.detail.kind === "empty") return tag;
			return `${tag} 路 鈥?{target.detail.text}鈥漙;
		}
		function validCssValue(property, value) {
			if (!isSafeAnnotationStyleValue(value)) return false;
			const probe = document.createElement("div").style;
			probe.setProperty(property, value);
			return probe.getPropertyValue(property) !== "";
		}
		function AdjustIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2 4h4m3 0h5M2 12h5m3 0h4M6 2v4m4 4v4",
						stroke: "currentColor",
						strokeWidth: "1.35",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "7.5",
						cy: "4",
						r: "1.5",
						fill: "white",
						stroke: "currentColor",
						strokeWidth: "1.2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "8.5",
						cy: "12",
						r: "1.5",
						fill: "white",
						stroke: "currentColor",
						strokeWidth: "1.2"
					})
				]
			});
		}
		function SelectIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M1.5 2.5h13v11h-13zM5 2.5v11M1.5 6h3.5M1.5 10h3.5",
					stroke: "currentColor",
					strokeWidth: "1.25",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		function EyeIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M2.2 8s2.15-3.7 5.8-3.7S13.8 8 13.8 8 11.65 11.7 8 11.7 2.2 8 2.2 8Z",
					stroke: "currentColor",
					strokeWidth: "1.45",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "8",
					cy: "8",
					r: "1.7",
					stroke: "currentColor",
					strokeWidth: "1.45"
				})]
			});
		}
		function DragHandleIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "currentColor",
				"aria-hidden": true,
				children: [
					3,
					8,
					13
				].flatMap((y) => [5, 11].map((x) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: x,
					cy: y,
					r: "1.25"
				}, `${x}:${y}`)))
			});
		}
		function AlignIcon({ kind }) {
			const widths = kind === "justify" ? [
				12,
				12,
				12
			] : [
				12,
				8,
				11
			];
			const x = (width) => kind === "center" ? (14 - width) / 2 : kind === "right" ? 14 - width : 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 14 14",
				"aria-hidden": true,
				children: widths.map((width, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: x(width),
					y: 2 + index * 4,
					width,
					height: "1.4",
					rx: ".7",
					fill: "currentColor"
				}, index))
			});
		}
		function propertyLabel(control, t) {
			return t(control.labelKey);
		}
		const four = (values) => [
			values[0],
			values[1],
			values[2],
			values[3]
		];
		/** Host-owned, DSH-styled property inspector with reversible iframe preview. */
		function AnnotationEditor(props) {
			const { frame, comment: initialComment, changes: initialChanges, textChange: initialTextChange, initialMode = "collapsed", navigationFeedback = null, position = null, size = null, t, onCancel, onConfirm, selectedSkills = [], onToggleSkill = () => {}, onPositionChange = ignorePositionChange, onSizeChange = ignoreSizeChange, onSizeCommit = ignoreSizeCommit } = props;
			const { target } = props;
			const initialMap = (0, react.useMemo)(() => new Map(initialChanges.map((change) => [change.property, change])), [initialChanges]);
			const originals = (0, react.useMemo)(() => new Map(PROPERTY_GROUPS.flatMap((group) => group.controls).map(({ property }) => [property, initialMap.get(property)?.before ?? target.baselines[property]])), [initialMap, target]);
			const [comment, setComment] = (0, react.useState)(initialComment);
			const [mode, setMode] = (0, react.useState)(initialMode);
			const [hidden, setHidden] = (0, react.useState)(false);
			const [activeScrub, setActiveScrub] = (0, react.useState)(null);
			const [values, setValues] = (0, react.useState)(() => new Map([...originals].map(([property, before]) => [property, initialMap.get(property)?.after ?? before])));
			const [invalid, setInvalid] = (0, react.useState)(/* @__PURE__ */ new Set());
			const originalText = target.originalText ?? void 0;
			const [text, setText] = (0, react.useState)(initialTextChange?.after ?? originalText ?? "");
			const [marginLinks, setMarginLinks] = (0, react.useState)({
				vertical: false,
				horizontal: false,
				all: false
			});
			const [paddingLinks, setPaddingLinks] = (0, react.useState)({
				vertical: false,
				horizontal: false,
				all: false
			});
			const [flexControlsSeen, setFlexControlsSeen] = (0, react.useState)(() => {
				const display = initialMap.get("display")?.after ?? originals.get("display");
				return display === "flex" || display === "inline-flex";
			});
			const [layoutControlsSeen, setLayoutControlsSeen] = (0, react.useState)(() => {
				const display = initialMap.get("display")?.after ?? originals.get("display");
				return display === "flex" || display === "inline-flex" || display === "grid";
			});
			const [positionControlsSeen, setPositionControlsSeen] = (0, react.useState)(() => {
				return (initialMap.get("position")?.after ?? originals.get("position")) !== "static";
			});
			const normalWeightRef = (0, react.useRef)("400");
			const normalStyleRef = (0, react.useRef)("normal");
			const [, forcePosition] = (0, react.useState)(0);
			const editorRef = (0, react.useRef)(null);
			const visibleToggleRef = (0, react.useRef)(null);
			const hiddenToggleRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)(null);
			const [dragging, setDragging] = (0, react.useState)(false);
			const resizeRef = (0, react.useRef)(null);
			const [resizing, setResizing] = (0, react.useState)(false);
			const valueOf = (property) => values.get(property) ?? originals.get(property) ?? "";
			const changed = (property) => valueOf(property) !== (originals.get(property) ?? "");
			const currentChanges = () => [...originals].flatMap(([property, before]) => {
				const after = valueOf(property);
				return after === before ? [] : [{
					property,
					before,
					after
				}];
			});
			(0, react.useEffect)(() => {
				forcePosition((value) => value + 1);
			}, [mode]);
			(0, react.useEffect)(() => {
				editorRef.current?.focus({ preventScroll: true });
			}, [mode, target]);
			const cancel = () => {
				onCancel();
			};
			const textChanged = originalText !== void 0 && text !== originalText;
			const canConfirmComment = (candidate) => invalid.size === 0 && candidate.length <= ANNOTATION_LIMITS.comment && text.length <= ANNOTATION_LIMITS.textValue && (candidate.trim() !== "" || currentChanges().length > 0 || textChanged);
			const canConfirm = canConfirmComment(comment);
			const confirm = (candidate = comment) => {
				if (!canConfirmComment(candidate)) return;
				const viewport = {
					width: Math.round(target.viewport.width),
					height: Math.round(target.viewport.height)
				};
				onConfirm({
					comment: candidate,
					changes: currentChanges(),
					textChange: textChanged ? {
						before: initialTextChange?.before ?? originalText,
						after: text
					} : null,
					viewport
				});
			};
			const moveSelection = (event, capturePageActions = false) => {
				const action = elementNavigationAction(event, { capturePageActions });
				if (action === null) return;
				const available = target.navigation[action] === true;
				if (!available && !capturePageActions) return;
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
				if (!available) return;
				props.onNavigateTarget(action, comment, mode);
			};
			const updateProperty = (property, next) => {
				if (next === (originals.get(property) ?? "")) {
					props.onRestoreStyle(property);
					setInvalid((current) => {
						const copy = new Set(current);
						copy.delete(property);
						return copy;
					});
					setValues((current) => new Map(current).set(property, next));
					return;
				}
				if (next.length > ANNOTATION_LIMITS.styleValue || next.trim() === "" || !validCssValue(property, next)) {
					setInvalid((current) => new Set(current).add(property));
					setValues((current) => new Map(current).set(property, next));
					return;
				}
				props.onPreviewStyle(property, next);
				setInvalid((current) => {
					const copy = new Set(current);
					copy.delete(property);
					return copy;
				});
				setValues((current) => new Map(current).set(property, next));
			};
			const updateText = (next) => {
				setText(next);
				if (originalText === void 0) return;
				if (next === originalText) props.onRestoreText();
				else props.onPreviewText(next);
			};
			const reset = (property) => {
				updateProperty(property, originals.get(property) ?? "");
			};
			const scrubChange = (target) => (active) => {
				setActiveScrub((current) => active ? target : current === target ? null : current);
			};
			const numericFallback = (property) => {
				const originalInline = target.inlineStyles[property]?.value;
				if (originalInline !== void 0 && parseNumeric(originalInline) !== null) return originalInline;
				const baseline = originals.get(property);
				if (baseline !== void 0 && parseNumeric(baseline) !== null) return baseline;
				if (property === "line-height") {
					const fontSize = parseNumeric(valueOf("font-size"));
					return fontSize === null ? "16px" : `${String(Math.round(fontSize.number * 1.2 * 1e3) / 1e3)}${fontSize.unit || "px"}`;
				}
				if (property === "letter-spacing" || property === "gap" || property === "row-gap" || property === "column-gap") return "0px";
				if (property === "z-index") return "0";
				if (property === "opacity") return "100%";
				return "0px";
			};
			const renderControl = (property) => {
				const control = PROPERTY_BY_NAME.get(property);
				if (control === void 0) return null;
				const label = propertyLabel(control, t);
				const value = valueOf(property);
				if (control.kind === "color") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ColorControl, {
					label,
					value,
					onScrubChange: scrubChange(property),
					onChange: (next) => {
						updateProperty(property, next);
					}
				});
				if (control.kind === "menu") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OptionMenu, {
					label,
					value,
					options: control.options ?? [],
					onChange: (next) => {
						updateProperty(property, next);
					}
				});
				if (property === "opacity") {
					const normalized = value.trim() === "" ? "1" : value;
					const parsed = /^\s*(\d*\.?\d+)\s*$/u.exec(normalized);
					const displayValue = parsed?.[1] === void 0 ? normalized : `${String(Math.round(Number(parsed[1]) * 1e4) / 100)}%`;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScrubNumber, {
						label,
						value: displayValue,
						min: 0,
						max: 100,
						invalid: invalid.has(property),
						onScrubChange: scrubChange(property),
						onChange: (next) => {
							const percent = /^\s*(\d*\.?\d+)\s*%?\s*$/u.exec(next);
							updateProperty(property, percent?.[1] === void 0 ? next : String(Number(percent[1]) / 100));
						}
					});
				}
				if (control.kind === "number") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScrubNumber, {
					label,
					value,
					fallbackValue: numericFallback(property),
					invalid: invalid.has(property),
					options: control.options ?? [],
					presetLabel: t("editor.action.choosePreset"),
					onScrubChange: scrubChange(property),
					onChange: (next) => {
						updateProperty(property, next);
					},
					...control.step === void 0 ? {} : { step: control.step },
					...control.min === void 0 ? {} : { min: control.min },
					...control.max === void 0 ? {} : { max: control.max },
					...control.glyph === void 0 ? {} : { glyph: control.glyph }
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
					label,
					value,
					invalid: invalid.has(property),
					onChange: (next) => {
						updateProperty(property, next);
					}
				});
			};
			const row = (property) => {
				const control = PROPERTY_BY_NAME.get(property);
				if (control === void 0) return null;
				const label = propertyLabel(control, t);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InspectorRow, {
					label,
					active: activeScrub === property,
					changed: changed(property),
					resetLabel: `${t("editor.reset")} 路 ${label}`,
					onReset: () => {
						reset(property);
					},
					children: renderControl(property)
				}, property);
			};
			const weight = Number(valueOf("font-weight"));
			const bold = Number.isFinite(weight) && weight >= 600;
			const style = valueOf("font-style");
			const decorationTokens = valueOf("text-decoration").split(/\s+/u).filter((token) => token !== "" && token !== "none");
			const underlined = decorationTokens.includes("underline");
			const align = valueOf("text-align");
			const display = valueOf("display");
			const flex = display === "flex" || display === "inline-flex";
			const layout = flex || display === "grid";
			const positioned = valueOf("position") !== "static" || [
				"top",
				"right",
				"bottom",
				"left",
				"z-index"
			].some((property) => valueOf(property) !== "auto");
			(0, react.useEffect)(() => {
				if (flex) setFlexControlsSeen(true);
			}, [flex]);
			(0, react.useEffect)(() => {
				if (layout) setLayoutControlsSeen(true);
			}, [layout]);
			(0, react.useEffect)(() => {
				if (positioned) setPositionControlsSeen(true);
			}, [positioned]);
			const showFlexControls = flex || flexControlsSeen;
			const showLayoutControls = layout || layoutControlsSeen;
			const showPositionControls = positioned || positionControlsSeen;
			const spacing = (prefix, links, setLinks) => {
				const properties = four([
					"top",
					"right",
					"bottom",
					"left"
				].map((side) => `${prefix}-${side}`));
				const controls = four(properties.map((property) => PROPERTY_BY_NAME.get(property)));
				const groupLabel = t(prefix === "margin" ? "editor.group.margin" : "editor.group.padding");
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InspectorRow, {
					wide: true,
					label: groupLabel,
					active: activeScrub === prefix,
					staticLabel: true,
					changed: properties.some(changed),
					resetLabel: `${t("editor.reset")} 路 ${groupLabel}`,
					onReset: () => {
						properties.forEach(reset);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BoxModelControl, {
						label: groupLabel,
						sideLabels: four(controls.map((control) => propertyLabel(control, t))),
						values: four(properties.map(valueOf)),
						options: controls[0]?.options ?? [],
						presetLabel: t("editor.action.choosePreset"),
						onScrubChange: scrubChange(prefix),
						links,
						...prefix === "padding" ? { min: 0 } : {},
						linkLabel: t("editor.action.linkValues"),
						unlinkLabel: t("editor.action.unlinkValues"),
						linkAllLabel: t("editor.action.linkAllValues"),
						unlinkAllLabel: t("editor.action.unlinkAllValues"),
						onLinkChange: (axis, linked) => {
							setLinks(updateBoxModelLinks(links, axis, linked));
						},
						onChange: (index, next) => {
							const property = properties[index];
							if (property !== void 0) updateProperty(property, next);
						}
					})
				});
			};
			const rect = {
				x: target.rect.x,
				y: target.rect.y,
				width: target.rect.width,
				height: target.rect.height,
				top: target.rect.y,
				right: target.rect.x + target.rect.width,
				bottom: target.rect.y + target.rect.height,
				left: target.rect.x
			};
			const preferredWidth = mode === "select" ? 414 : mode === "adjust" ? 400 : 374;
			const availableWidth = Math.max(0, frame.clientWidth - 16);
			const availableHeight = Math.max(0, frame.clientHeight - 16);
			const minimumWidth = Math.min(320, availableWidth);
			const minimumHeight = Math.min(mode === "select" ? 260 : 300, availableHeight);
			const width = mode !== "collapsed" && size !== null ? Math.min(Math.max(size.width, minimumWidth), availableWidth) : Math.min(preferredWidth, Math.max(280, availableWidth));
			const preferredHeight = mode === "select" ? 430 : mode === "adjust" ? 560 : 82;
			const measuredHeight = Math.max(editorRef.current?.scrollHeight ?? 0, preferredHeight);
			const placement = placeFloatingEditor({
				target: rect,
				surfaceWidth: frame.clientWidth,
				surfaceHeight: frame.clientHeight,
				editorWidth: width,
				editorHeight: measuredHeight,
				minHeight: mode === "select" ? 260 : mode === "adjust" ? 300 : 54
			});
			const manualHeight = mode !== "collapsed" && size !== null ? Math.min(Math.max(size.height, minimumHeight), availableHeight) : Math.min(measuredHeight, availableHeight);
			const renderedPosition = position === null ? {
				left: placement.left,
				top: placement.top
			} : clampFloatingEditorPosition({
				position,
				surfaceWidth: frame.clientWidth,
				surfaceHeight: frame.clientHeight,
				editorWidth: width,
				editorHeight: manualHeight
			});
			const maxHeight = position === null ? placement.maxHeight : manualHeight;
			const hiddenLeft = Math.min(Math.max(8, renderedPosition.left + width - 36), Math.max(8, frame.clientWidth - 44));
			(0, react.useEffect)(() => {
				if (position === null) return;
				if (position.left === renderedPosition.left && position.top === renderedPosition.top) return;
				onPositionChange(renderedPosition);
			}, [
				onPositionChange,
				position,
				renderedPosition.left,
				renderedPosition.top
			]);
			const finishDrag = (cancelled) => {
				const drag = dragRef.current;
				if (drag === null) return;
				if (cancelled && drag.started) onPositionChange(drag.origin);
				dragRef.current = null;
				setDragging(false);
			};
			const finishResize = (cancelled) => {
				const resize = resizeRef.current;
				if (resize === null) return;
				if (cancelled && resize.started) {
					onPositionChange(resize.originPosition);
					onSizeChange(resize.originSize);
				} else if (resize.started) onSizeCommit(resize.latestSize);
				resizeRef.current = null;
				setResizing(false);
			};
			const hideEditor = () => {
				setActiveScrub(null);
				setHidden(true);
				queueMicrotask(() => {
					hiddenToggleRef.current?.focus();
				});
			};
			const showEditor = () => {
				setHidden(false);
				queueMicrotask(() => {
					visibleToggleRef.current?.focus();
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: editorRef,
				className: `${AnnotationEditor_module_css_default.editor} ${hidden ? AnnotationEditor_module_css_default.editorHidden : ""}`,
				style: {
					left: renderedPosition.left,
					top: renderedPosition.top,
					width,
					maxHeight,
					...mode !== "collapsed" && size !== null ? { height: manualHeight } : {}
				},
				"data-webview-annotation-editor": "",
				"data-placement": placement.side,
				...activeScrub === null ? {} : { "data-scrubbing": activeScrub },
				...hidden ? { "data-editor-hidden": "" } : {},
				...dragging ? { "data-editor-dragging": "" } : {},
				...resizing ? { "data-editor-resizing": "" } : {},
				"aria-hidden": hidden,
				tabIndex: -1,
				onKeyDown: (event) => {
					if (event.key !== "Escape" || event.defaultPrevented) return;
					event.preventDefault();
					if (mode === "select") setMode("collapsed");
					else cancel();
				},
				onKeyDownCapture: (event) => {
					moveSelection(event.nativeEvent, true);
				},
				children: [
					mode !== "collapsed" && RESIZE_EDGES.map((edge) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: AnnotationEditor_module_css_default.resizeHandle,
						"data-resize-edge": edge,
						"aria-hidden": "true",
						onPointerDown: (event) => {
							if (event.button !== 0) return;
							resizeRef.current = {
								pointerId: event.pointerId,
								edge,
								startX: event.clientX,
								startY: event.clientY,
								originPosition: position,
								originSize: size,
								renderedPosition,
								renderedSize: {
									width,
									height: manualHeight
								},
								latestSize: {
									width,
									height: manualHeight
								},
								started: false
							};
							event.currentTarget.setPointerCapture?.(event.pointerId);
							event.preventDefault();
						},
						onPointerMove: (event) => {
							const resize = resizeRef.current;
							if (resize === null || resize.pointerId !== event.pointerId) return;
							const deltaX = event.clientX - resize.startX;
							const deltaY = event.clientY - resize.startY;
							if (!resize.started && Math.hypot(deltaX, deltaY) <= 3) return;
							if (!resize.started) {
								resize.started = true;
								setResizing(true);
							}
							const next = resizeFloatingEditor({
								edge: resize.edge,
								position: resize.renderedPosition,
								size: resize.renderedSize,
								deltaX,
								deltaY,
								surfaceWidth: frame.clientWidth,
								surfaceHeight: frame.clientHeight,
								minWidth: minimumWidth,
								minHeight: minimumHeight
							});
							onPositionChange(next.position);
							onSizeChange(next.size);
							resize.latestSize = next.size;
						},
						onPointerUp: (event) => {
							const resize = resizeRef.current;
							if (resize === null || resize.pointerId !== event.pointerId) return;
							finishResize(false);
							if (event.currentTarget.hasPointerCapture?.(event.pointerId) === true) event.currentTarget.releasePointerCapture?.(event.pointerId);
						},
						onPointerCancel: () => {
							finishResize(true);
						},
						onLostPointerCapture: () => {
							finishResize(false);
						}
					}, edge)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `${AnnotationEditor_module_css_default.composeRow} ${mode !== "collapsed" ? AnnotationEditor_module_css_default.composeRowExpanded : ""}`,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: mode === "select" ? `${AnnotationEditor_module_css_default.adjust} ${AnnotationEditor_module_css_default.adjustActive}` : AnnotationEditor_module_css_default.adjust,
								"aria-label": t("editor.select"),
								title: t("editor.select"),
								"aria-expanded": mode === "select",
								onClick: () => {
									setMode((value) => value === "select" ? "collapsed" : "select");
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectIcon, {})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: mode === "adjust" ? `${AnnotationEditor_module_css_default.adjust} ${AnnotationEditor_module_css_default.adjustActive}` : AnnotationEditor_module_css_default.adjust,
								"aria-label": t("editor.adjust"),
								title: t("editor.adjust"),
								"aria-expanded": mode === "adjust",
								onClick: () => {
									setMode((value) => value === "adjust" ? "collapsed" : "adjust");
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AdjustIcon, {})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: `${AnnotationEditor_module_css_default.commentInput} dsh-wv-comment-input`,
								value: comment,
								maxLength: ANNOTATION_LIMITS.comment,
								placeholder: t("editor.comment"),
								onChange: (event) => {
									const next = event.target.value;
									setComment(next);
									props.onCommentChange?.(next);
								},
								onKeyDown: (event) => {
									if (event.key === "Escape") {
										event.preventDefault();
										if (mode === "select") setMode("collapsed");
										else cancel();
									}
									if (event.key === "Enter") {
										event.preventDefault();
										confirm(event.currentTarget.value);
									}
								}
							}),
							mode !== "collapsed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: AnnotationEditor_module_css_default.dragHandle,
								"aria-label": t("editor.move"),
								title: t("editor.move"),
								onPointerDown: (event) => {
									if (event.button !== 0) return;
									dragRef.current = {
										pointerId: event.pointerId,
										startX: event.clientX,
										startY: event.clientY,
										origin: position,
										originRendered: renderedPosition,
										latest: renderedPosition,
										started: false
									};
									event.currentTarget.setPointerCapture?.(event.pointerId);
								},
								onPointerMove: (event) => {
									const drag = dragRef.current;
									if (drag === null || drag.pointerId !== event.pointerId) return;
									const dx = event.clientX - drag.startX;
									const dy = event.clientY - drag.startY;
									if (!drag.started && Math.hypot(dx, dy) <= 3) return;
									if (!drag.started) {
										drag.started = true;
										setDragging(true);
									}
									drag.latest = clampFloatingEditorPosition({
										position: {
											left: drag.originRendered.left + dx,
											top: drag.originRendered.top + dy
										},
										surfaceWidth: frame.clientWidth,
										surfaceHeight: frame.clientHeight,
										editorWidth: width,
										editorHeight: manualHeight
									});
									onPositionChange(drag.latest);
								},
								onPointerUp: (event) => {
									const drag = dragRef.current;
									if (drag === null || drag.pointerId !== event.pointerId) return;
									finishDrag(false);
									event.currentTarget.releasePointerCapture?.(event.pointerId);
								},
								onPointerCancel: () => {
									finishDrag(true);
								},
								onLostPointerCapture: () => {
									finishDrag(true);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DragHandleIcon, {})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								ref: visibleToggleRef,
								type: "button",
								className: AnnotationEditor_module_css_default.visibilityToggle,
								"aria-label": t("editor.hide"),
								title: t("editor.hide"),
								"aria-pressed": false,
								onClick: hideEditor,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EyeIcon, {})
							}),
							mode === "collapsed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: AnnotationEditor_module_css_default.quickConfirm,
								"aria-label": t("editor.confirm"),
								disabled: !canConfirm,
								onClick: () => {
									confirm();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, { size: 16 })
							})
						]
					}),
					mode !== "select" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: AnnotationEditor_module_css_default.navigationFeedbackSlot,
						"data-webview-navigation-feedback": "",
						"data-action": navigationFeedback?.action,
						role: "status",
						"aria-live": "polite",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: AnnotationEditor_module_css_default.navigationFeedback,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: AnnotationEditor_module_css_default.navigationGlyph,
								"aria-hidden": true,
								children: "<>"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: AnnotationEditor_module_css_default.navigationTarget,
								children: t("editor.select.current", { target: previewNavigationTargetLabel(target, t) })
							}, navigationFeedback?.sequence ?? "current")]
						})
					}),
					mode === "select" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewElementSelector, {
						target,
						tree: props.tree,
						t,
						onNavigate: (action) => {
							props.onNavigateTarget(action, comment, mode);
						},
						onSelect: (handle) => {
							props.onSelectTarget(handle, comment, mode);
						}
					}),
					mode === "adjust" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AnnotationEditor_module_css_default.inspector,
						"data-webview-property-inspector": "",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UiSkillSelector, {
								selected: selectedSkills,
								t,
								onToggle: onToggleSkill
							}),
							originalText !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InspectorSection, {
								label: t("editor.text"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InspectorRow, {
									wide: true,
									label: t("editor.text"),
									changed: textChanged,
									resetLabel: t("editor.reset"),
									onReset: () => {
										updateText(originalText);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextAreaField, {
										label: t("editor.text"),
										value: text,
										maxLength: ANNOTATION_LIMITS.textValue,
										onChange: updateText
									})
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(InspectorSection, {
								label: t("editor.group.fill"),
								children: [
									row("color"),
									row("background-color"),
									row("opacity")
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(InspectorSection, {
								label: t("editor.group.typography"),
								children: [
									row("font-family"),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InspectorRow, {
										label: t("editor.property.fontStyle"),
										changed: changed("font-weight") || changed("font-style") || changed("text-decoration"),
										resetLabel: `${t("editor.reset")} 路 ${t("editor.property.fontStyle")}`,
										onReset: () => {
											reset("font-weight");
											reset("font-style");
											reset("text-decoration");
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(ToggleGroup, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleButton, {
												label: t("editor.action.bold"),
												pressed: bold,
												onToggle: () => {
													if (bold) updateProperty("font-weight", normalWeightRef.current);
													else {
														normalWeightRef.current = valueOf("font-weight");
														updateProperty("font-weight", "700");
													}
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StyleGlyph, { kind: "bold" })
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleButton, {
												label: t("editor.action.italic"),
												pressed: style === "italic" || style === "oblique",
												onToggle: () => {
													if (style === "italic" || style === "oblique") updateProperty("font-style", normalStyleRef.current);
													else {
														normalStyleRef.current = style;
														updateProperty("font-style", "italic");
													}
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StyleGlyph, { kind: "italic" })
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleButton, {
												label: t("editor.action.underline"),
												pressed: underlined,
												onToggle: () => {
													const next = underlined ? decorationTokens.filter((token) => token !== "underline") : [...decorationTokens, "underline"];
													updateProperty("text-decoration", next.length === 0 ? "none" : next.join(" "));
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StyleGlyph, { kind: "underline" })
											})
										] })
									}),
									row("font-weight"),
									row("font-size"),
									row("line-height"),
									row("letter-spacing"),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InspectorRow, {
										label: t("editor.property.textAlign"),
										changed: changed("text-align"),
										resetLabel: `${t("editor.reset")} 路 ${t("editor.property.textAlign")}`,
										onReset: () => {
											reset("text-align");
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SegmentedControl, {
											label: t("editor.property.textAlign"),
											value: [
												"left",
												"center",
												"right",
												"justify"
											].includes(align) ? align : "left",
											options: [
												{
													value: "left",
													label: t("editor.action.alignLeft"),
													content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AlignIcon, { kind: "left" })
												},
												{
													value: "center",
													label: t("editor.action.alignCenter"),
													content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AlignIcon, { kind: "center" })
												},
												{
													value: "right",
													label: t("editor.action.alignRight"),
													content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AlignIcon, { kind: "right" })
												},
												{
													value: "justify",
													label: t("editor.action.justify"),
													content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AlignIcon, { kind: "justify" })
												}
											],
											onChange: (next) => {
												updateProperty("text-align", next);
											}
										})
									}),
									row("text-decoration"),
									row("text-transform")
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(InspectorSection, {
								label: t("editor.group.size"),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InspectorRow, {
										wide: true,
										label: `${t("editor.property.width")} 脳 ${t("editor.property.height")}`,
										active: activeScrub === "size",
										changed: changed("width") || changed("height"),
										resetLabel: `${t("editor.reset")} 路 ${t("editor.group.size")}`,
										onReset: () => {
											reset("width");
											reset("height");
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SizeControl, {
											width: valueOf("width"),
											height: valueOf("height"),
											labels: {
												width: t("editor.property.width"),
												height: t("editor.property.height"),
												link: t("editor.action.linkValues"),
												unlink: t("editor.action.unlinkValues")
											},
											options: PROPERTY_BY_NAME.get("width")?.options ?? [],
											presetLabel: t("editor.action.choosePreset"),
											onWidthChange: (next) => {
												updateProperty("width", next);
											},
											onHeightChange: (next) => {
												updateProperty("height", next);
											},
											onScrubChange: scrubChange("size")
										})
									}),
									row("display"),
									row("position"),
									showFlexControls && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [row("flex-direction"), row("flex-wrap")] }),
									showLayoutControls && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										row("justify-content"),
										row("align-items"),
										row("align-content"),
										row("gap"),
										row("row-gap"),
										row("column-gap")
									] }),
									row("overflow")
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(InspectorSection, {
								label: t("editor.group.spacing"),
								children: [spacing("margin", marginLinks, setMarginLinks), spacing("padding", paddingLinks, setPaddingLinks)]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(InspectorSection, {
								label: t("editor.group.border"),
								children: [
									row("border-width"),
									row("border-style"),
									row("border-color"),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InspectorRow, {
										wide: true,
										label: t("editor.property.borderRadius"),
										active: activeScrub === "border-radius",
										changed: changed("border-radius"),
										resetLabel: `${t("editor.reset")} 路 ${t("editor.property.borderRadius")}`,
										onReset: () => {
											reset("border-radius");
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RadiusControl, {
											label: t("editor.property.borderRadius"),
											value: valueOf("border-radius"),
											cornerLabels: [
												t("editor.property.cornerTopLeft"),
												t("editor.property.cornerTopRight"),
												t("editor.property.cornerBottomRight"),
												t("editor.property.cornerBottomLeft")
											],
											linkLabel: t("editor.action.linkValues"),
											unlinkLabel: t("editor.action.unlinkValues"),
											rawHint: t("editor.rawHint"),
											onScrubChange: scrubChange("border-radius"),
											onChange: (next) => {
												updateProperty("border-radius", next);
											}
										})
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(InspectorSection, {
								label: t("editor.group.constraints"),
								defaultOpen: showPositionControls,
								children: [
									row("min-width"),
									row("max-width"),
									row("min-height"),
									row("max-height"),
									showPositionControls && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										row("top"),
										row("right"),
										row("bottom"),
										row("left"),
										row("z-index")
									] })
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(InspectorSection, {
								label: t("editor.group.effects"),
								defaultOpen: false,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InspectorRow, {
									wide: true,
									label: t("editor.property.boxShadow"),
									active: activeScrub === "box-shadow",
									changed: changed("box-shadow"),
									resetLabel: `${t("editor.reset")} 路 ${t("editor.property.boxShadow")}`,
									onReset: () => {
										reset("box-shadow");
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShadowControl, {
										label: t("editor.property.boxShadow"),
										value: valueOf("box-shadow"),
										rawHint: t("editor.rawHint"),
										labels: {
											x: t("editor.property.shadowX"),
											y: t("editor.property.shadowY"),
											blur: t("editor.property.shadowBlur"),
											spread: t("editor.property.shadowSpread"),
											color: t("editor.property.shadowColor"),
											inset: t("editor.property.shadowInset")
										},
										onScrubChange: scrubChange("box-shadow"),
										onChange: (next) => {
											updateProperty("box-shadow", next);
										}
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InspectorRow, {
									wide: true,
									label: t("editor.property.transform"),
									active: activeScrub === "transform",
									changed: changed("transform"),
									resetLabel: `${t("editor.reset")} 路 ${t("editor.property.transform")}`,
									onReset: () => {
										reset("transform");
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TransformControl, {
										label: t("editor.property.transform"),
										value: valueOf("transform"),
										rawHint: t("editor.rawHint"),
										labels: {
											translateX: t("editor.property.translateX"),
											translateY: t("editor.property.translateY"),
											scaleX: t("editor.property.scaleX"),
											scaleY: t("editor.property.scaleY"),
											rotate: t("editor.property.rotate")
										},
										onScrubChange: scrubChange("transform"),
										onChange: (next) => {
											updateProperty("transform", next);
										}
									})
								})]
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AnnotationEditor_module_css_default.footer,
						"data-webview-editor-footer": "",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: AnnotationEditor_module_css_default.cancel,
							onClick: cancel,
							children: t("editor.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: AnnotationEditor_module_css_default.confirm,
							"aria-label": t("editor.confirm"),
							disabled: !canConfirm,
							onClick: () => {
								confirm();
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, { size: 16 })
						})]
					})] })
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				ref: hiddenToggleRef,
				type: "button",
				className: `${AnnotationEditor_module_css_default.visibilityFab} ${hidden ? "" : AnnotationEditor_module_css_default.visibilityFabHidden}`,
				style: {
					left: hiddenLeft,
					top: renderedPosition.top
				},
				"aria-label": t("editor.show"),
				title: t("editor.show"),
				"aria-pressed": hidden,
				onClick: showEditor,
				onKeyDown: (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					cancel();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EyeIcon, {})
			})] });
		}
		//#endregion
		//#region src/client/navigation-url.ts
		/** Normalize an address-bar value into an absolute HTTP(S) preview URL. */
		function normalizePreviewUrl(value) {
			const input = value.trim();
			if (input === "") return void 0;
			let candidate;
			if (/^https?:\/\//i.test(input)) candidate = input;
			else if (/^\/\//.test(input)) candidate = `http:${input}`;
			else {
				if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^[^/:]+:\d+(?:[/?#]|$)/.test(input)) return;
				candidate = `http://${input}`;
			}
			try {
				const url = new URL(candidate);
				return isPreviewableUrl(url.href) ? url.href : void 0;
			} catch {
				return;
			}
		}
		//#endregion
		//#region src/client/editor-size-memory.ts
		const EDITOR_SIZE_STORAGE_KEY = "dsh-web-review.editor-size.v1";
		function validDimension(value) {
			return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1e4;
		}
		/** Read a user preference defensively; corrupt or unavailable storage is ignored. */
		function readEditorSize(storage) {
			try {
				const raw = storage.getItem(EDITOR_SIZE_STORAGE_KEY);
				if (raw === null) return null;
				const value = JSON.parse(raw);
				if (!validDimension(value.width) || !validDimension(value.height)) return null;
				return {
					width: value.width,
					height: value.height
				};
			} catch {
				return null;
			}
		}
		/** Persist only committed geometry; transient pointer moves never write here. */
		function writeEditorSize(storage, size) {
			try {
				storage.setItem(EDITOR_SIZE_STORAGE_KEY, JSON.stringify(size));
			} catch {}
		}
		//#endregion
		//#region src/client/preview-bridge.ts
		const MAX_BRIDGE_SESSIONS = 64;
		function recordOf(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function exactKeys(record, keys) {
			return Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
		}
		function viewportOf(value) {
			const record = recordOf(value);
			if (record === void 0 || !exactKeys(record, ["width", "height"]) || typeof record.width !== "number" || typeof record.height !== "number" || !Number.isFinite(record.width) || !Number.isFinite(record.height) || record.width < 0 || record.height < 0 || record.width > 1e5 || record.height > 1e5) return void 0;
			return {
				width: Math.round(record.width),
				height: Math.round(record.height)
			};
		}
		function rectOf(value) {
			const record = recordOf(value);
			if (record === void 0 || !exactKeys(record, [
				"x",
				"y",
				"width",
				"height"
			])) return void 0;
			if ([
				"x",
				"y",
				"width",
				"height"
			].map((key) => record[key]).some((item) => typeof item !== "number" || !Number.isFinite(item) || Math.abs(item) > 1e5) || record.width < 0 || record.height < 0) return void 0;
			return record;
		}
		function readyOf(value) {
			const record = recordOf(value);
			if (record === void 0 || !exactKeys(record, [
				"pageUrl",
				"title",
				"viewport",
				"canGoBack",
				"canGoForward"
			]) || typeof record.pageUrl !== "string" || record.pageUrl.length > 4096 || !isPreviewableUrl(record.pageUrl) || typeof record.title !== "string" || record.title.length > 500 || typeof record.canGoBack !== "boolean" || typeof record.canGoForward !== "boolean") return void 0;
			const viewport = viewportOf(record.viewport);
			return viewport === void 0 ? void 0 : {
				pageUrl: record.pageUrl,
				title: record.title,
				viewport,
				canGoBack: record.canGoBack,
				canGoForward: record.canGoForward
			};
		}
		function navigationActionOf(value) {
			return value === "child" || value === "parent" || value === "previous-sibling" || value === "next-sibling" ? value : void 0;
		}
		/** One exact-source/exact-Origin bridge instance. */
		var PreviewBridgeClient = class {
			frame;
			callbacks;
			sessionIds = /* @__PURE__ */ new Set();
			descriptors = /* @__PURE__ */ new Map();
			descriptor;
			pending = /* @__PURE__ */ new Map();
			requestSequence = 0;
			readyTimer;
			disposed = false;
			constructor(frame, descriptor, callbacks) {
				this.frame = frame;
				this.callbacks = callbacks;
				this.descriptor = descriptor;
				this.sessionIds.add(descriptor.sessionId);
				this.descriptors.set(descriptor.sessionId, descriptor);
				window.addEventListener("message", this.onMessage);
				this.armReadyTimeout();
			}
			get frameUrl() {
				return this.descriptor.frameUrl;
			}
			onMessage = (event) => {
				if (this.disposed || event.source !== this.frame.contentWindow) return;
				const message = previewFrameMessageOf(event.data);
				if (message === void 0) return;
				const matched = [...this.descriptors.values()].find((descriptor) => event.origin === descriptor.frameOrigin && message.channel === descriptor.channel);
				if (matched === void 0) return;
				if (matched.sessionId !== this.descriptor.sessionId) {
					if (!("event" in message) || message.event.name !== "ready") return;
					this.rejectPending("preview history changed Origin");
					this.descriptor = matched;
					this.armReadyTimeout();
					this.callbacks.onHandoff(matched);
				}
				if ("response" in message) {
					const pending = this.pending.get(message.requestId);
					if (pending === void 0) return;
					this.pending.delete(message.requestId);
					clearTimeout(pending.timer);
					if (message.response.ok) pending.resolve(message.response.value);
					else pending.reject(new Error(message.response.error));
					return;
				}
				const { event: frameEvent } = message;
				const payload = frameEvent.payload;
				if (frameEvent.name === "ready") {
					const ready = readyOf(payload);
					if (ready === void 0 || new URL(ready.pageUrl).origin !== matched.targetOrigin) return;
					if (this.readyTimer !== void 0) clearTimeout(this.readyTimer);
					this.readyTimer = void 0;
					this.callbacks.onReady(ready);
					return;
				}
				if (frameEvent.name === "pick") {
					const record = recordOf(payload);
					const target = record === void 0 || !exactKeys(record, ["target"]) ? void 0 : previewElementTargetOf(record.target);
					if (target !== void 0) this.callbacks.onPick(target);
					return;
				}
				if (frameEvent.name === "cancel-pick") {
					if (payload === null) this.callbacks.onCancelPick();
					return;
				}
				if (frameEvent.name === "mark-click") {
					const record = recordOf(payload);
					if (record !== void 0 && exactKeys(record, ["pickId"]) && typeof record.pickId === "string" && record.pickId.length <= 128) this.callbacks.onMarkClick(record.pickId);
					return;
				}
				if (frameEvent.name === "target-geometry") {
					const record = recordOf(payload);
					if (record === void 0 || !exactKeys(record, [
						"handle",
						"rect",
						"viewport"
					]) || typeof record.handle !== "string" || !/^[a-f\d]{16,32}$/u.test(record.handle)) return;
					const rect = rectOf(record.rect);
					const viewport = viewportOf(record.viewport);
					if (rect !== void 0 && viewport !== void 0) this.callbacks.onTargetGeometry(record.handle, rect, viewport);
					return;
				}
				if (frameEvent.name === "shortcut") {
					const record = recordOf(payload);
					const action = navigationActionOf(record?.action);
					if (record !== void 0 && exactKeys(record, ["action"]) && action !== void 0) this.callbacks.onShortcut(action);
					return;
				}
				if (frameEvent.name === "handoff") {
					const descriptor = previewSessionDescriptorOf(payload);
					if (descriptor === void 0 || this.descriptors.has(descriptor.sessionId) || this.descriptors.size >= MAX_BRIDGE_SESSIONS) return;
					this.rejectPending("preview navigated");
					this.descriptor = descriptor;
					this.sessionIds.add(descriptor.sessionId);
					this.descriptors.set(descriptor.sessionId, descriptor);
					this.armReadyTimeout();
					this.callbacks.onHandoff(descriptor);
				}
			};
			rejectPending(message) {
				for (const pending of this.pending.values()) {
					clearTimeout(pending.timer);
					pending.reject(new Error(message));
				}
				this.pending.clear();
			}
			armReadyTimeout() {
				if (this.readyTimer !== void 0) clearTimeout(this.readyTimer);
				this.readyTimer = setTimeout(() => {
					this.readyTimer = void 0;
					if (!this.disposed) this.callbacks.onUnavailable();
				}, 15e3);
			}
			frameLoaded() {
				if (this.disposed) return;
				this.armReadyTimeout();
				const target = this.frame.contentWindow;
				if (target === null) return;
				for (const descriptor of this.descriptors.values()) {
					this.requestSequence += 1;
					target.postMessage({
						protocol: PREVIEW_BRIDGE_PROTOCOL,
						version: 1,
						channel: descriptor.channel,
						direction: "host-to-frame",
						requestId: `probe-${String(this.requestSequence)}`,
						command: {
							name: "request-ready",
							payload: null
						}
					}, descriptor.frameOrigin);
				}
			}
			command(command) {
				if (this.disposed) return Promise.reject(/* @__PURE__ */ new Error("preview bridge disposed"));
				const target = this.frame.contentWindow;
				if (target === null) return Promise.reject(/* @__PURE__ */ new Error("preview frame unavailable"));
				this.requestSequence += 1;
				const requestId = `${String(this.requestSequence)}-${Date.now().toString(36)}`;
				const message = {
					protocol: PREVIEW_BRIDGE_PROTOCOL,
					version: 1,
					channel: this.descriptor.channel,
					direction: "host-to-frame",
					requestId,
					command
				};
				return new Promise((resolve, reject) => {
					const timer = setTimeout(() => {
						this.pending.delete(requestId);
						reject(/* @__PURE__ */ new Error("preview bridge command timed out"));
					}, 5e3);
					this.pending.set(requestId, {
						resolve,
						reject,
						timer
					});
					target.postMessage(message, this.descriptor.frameOrigin);
				});
			}
			activate() {
				this.command({
					name: "activate",
					payload: null
				}).catch(() => void 0);
			}
			deactivate() {
				this.command({
					name: "deactivate",
					payload: null
				}).catch(() => void 0);
			}
			clearSelection() {
				this.command({
					name: "clear-selection",
					payload: null
				}).catch(() => void 0);
			}
			syncMarkers(picks) {
				const markers = picks.map((pick, index) => ({
					id: pick.id,
					index: index + 1,
					cssPath: pick.snapshot.cssPath,
					changes: pick.changes,
					textChange: pick.textChange
				}));
				this.command({
					name: "sync-markers",
					payload: { markers }
				}).catch(() => void 0);
			}
			async openPick(pickId, cssPath) {
				const value = await this.command({
					name: "open-pick",
					payload: {
						pickId,
						cssPath
					}
				});
				return value === null ? null : previewElementTargetOf(value) ?? null;
			}
			async navigateElement(handle, action) {
				const value = await this.command({
					name: "navigate-element",
					payload: {
						handle,
						action
					}
				});
				return value === null ? null : previewElementTargetOf(value) ?? null;
			}
			async selectElement(handle) {
				const value = await this.command({
					name: "select-element",
					payload: { handle }
				});
				return value === null ? null : previewElementTargetOf(value) ?? null;
			}
			async readTree(handle) {
				return previewTreeOf(await this.command({
					name: "read-tree",
					payload: { handle }
				})) ?? null;
			}
			previewStyle(handle, property, value) {
				this.command({
					name: "preview-style",
					payload: {
						handle,
						property,
						value
					}
				}).catch(() => void 0);
			}
			restoreStyle(handle, property) {
				this.command({
					name: "restore-style",
					payload: {
						handle,
						property
					}
				}).catch(() => void 0);
			}
			previewText(handle, value) {
				this.command({
					name: "preview-text",
					payload: {
						handle,
						value
					}
				}).catch(() => void 0);
			}
			restoreText(handle) {
				this.command({
					name: "restore-text",
					payload: { handle }
				}).catch(() => void 0);
			}
			cancelEdit() {
				this.command({
					name: "cancel-edit",
					payload: null
				}).catch(() => void 0);
			}
			commitEdit(pickId, handle, changes, textChange) {
				this.command({
					name: "commit-edit",
					payload: {
						pickId,
						handle,
						changes,
						textChange
					}
				}).catch(() => void 0);
			}
			historyBack() {
				this.command({
					name: "history-back",
					payload: null
				}).catch(() => void 0);
			}
			historyForward() {
				this.command({
					name: "history-forward",
					payload: null
				}).catch(() => void 0);
			}
			reload() {
				this.command({
					name: "reload",
					payload: null
				}).catch(() => void 0);
			}
			dispose() {
				if (this.disposed) return [];
				this.disposed = true;
				window.removeEventListener("message", this.onMessage);
				if (this.readyTimer !== void 0) clearTimeout(this.readyTimer);
				this.rejectPending("preview bridge disposed");
				return [...this.sessionIds];
			}
		};
		//#endregion
		//#region \0dsh-web-review-css:src/client/WebviewView.module.css.mjs
		const css$1 = ".uQwHMW_panel,.uQwHMW_panel *,.uQwHMW_panel :before,.uQwHMW_panel :after{box-sizing:border-box}.uQwHMW_panel{background:var(--dsw-alias-bg-base,#fff);height:100%;min-height:0;color:var(--dsw-alias-label-primary,#0f1115);font:var(--dsw-font-xs-13,13px/20px system-ui, sans-serif);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,#0003);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2,#0000004d);flex-direction:column;display:flex;position:static}.uQwHMW_urlRow{border-bottom:1px solid var(--dsw-alias-border-l2,#0000001a);background:var(--dsw-alias-bg-base,#fff);flex:none;align-items:center;gap:4px;height:49px;padding:8px 10px;display:flex}.uQwHMW_urlField{flex:auto;min-width:0;position:relative}.uQwHMW_url{width:100%;min-width:0;transition:background-color .12s var(--ds-ease-in-out,ease);background:0 0;border-color:#0000}.uQwHMW_urlField:hover .uQwHMW_url,.uQwHMW_urlField:focus-within .uQwHMW_url{background:var(--dsw-alias-interactive-bg-hover,#2631480f);border-color:#0000}.uQwHMW_url input{padding-right:36px}.uQwHMW_inlineAction{width:28px;height:28px;color:var(--dsw-alias-label-tertiary,#61666b);opacity:0;pointer-events:none;transition:background-color .12s var(--ds-ease-in-out,ease), color .12s var(--ds-ease-in-out,ease), opacity .12s var(--ds-ease-in-out,ease);border-radius:6px;place-items:center;display:inline-grid;position:absolute;top:50%;right:4px;transform:translateY(-50%)}.uQwHMW_urlField:hover .uQwHMW_inlineAction,.uQwHMW_urlField:focus-within .uQwHMW_inlineAction{opacity:1;pointer-events:auto}.uQwHMW_inlineAction:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}.uQwHMW_inlineAction:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:-2px}.uQwHMW_error{color:var(--dsw-alias-state-error-primary,#ec1313);font:var(--dsw-font-xxs-12,12px/18px system-ui, sans-serif);flex:none;align-items:center;gap:5px;padding:0 10px 6px;display:flex;overflow:hidden}.uQwHMW_errorIcon{color:inherit;flex:none}.uQwHMW_error span{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.uQwHMW_icon{width:28px;height:28px;color:var(--dsw-alias-label-tertiary,#61666b);cursor:pointer;transition:background-color .12s var(--ds-ease-in-out,ease), color .12s var(--ds-ease-in-out,ease);background:0 0;border:0;border-radius:6px;flex:none;place-items:center;padding:0;display:inline-grid}.uQwHMW_icon:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}.uQwHMW_icon:disabled{color:var(--dsw-alias-label-dimmed,#a9adb4);cursor:default}.uQwHMW_icon:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary,#61666b);outline-offset:-2px}.uQwHMW_iconAccent,.uQwHMW_iconAccent:hover:not(:disabled){background:var(--dsw-alias-state-business-tertiary,#e4edfd);color:var(--dsw-alias-state-business-primary,#4176e6)}.uQwHMW_commentIcon{color:var(--dsw-alias-label-secondary,#41464d)}.uQwHMW_annotationBar{background:var(--dsw-alias-state-business-tertiary,#dceeff);border-bottom:1px solid #4176e61f;flex:none;grid-template-columns:28px 28px minmax(0,1fr) auto;align-items:center;gap:4px;height:49px;padding:6px 10px;display:grid}.uQwHMW_annotationIcon{width:28px;height:28px;color:var(--dsw-alias-label-secondary,#41464d);cursor:pointer;background:0 0;border:0;border-radius:6px;place-items:center;padding:0;display:inline-grid}.uQwHMW_annotationIcon:hover:not(:disabled){color:var(--dsw-alias-label-primary,#0f1115);background:#4176e61a}.uQwHMW_annotationIcon:disabled{color:var(--dsw-alias-label-dimmed,#a9adb4);cursor:default}.uQwHMW_annotationIcon:focus-visible,.uQwHMW_annotationSend:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:2px}.uQwHMW_annotationTitle{min-width:0;color:var(--dsw-alias-label-primary,#0f1115);font:var(--dsw-font-s-14,500 14px/20px system-ui, sans-serif);text-align:center;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.uQwHMW_annotationSend{background:var(--dsw-alias-state-business-primary,#38f);color:#fff;min-width:72px;height:28px;font:var(--dsw-font-xs-13,600 13px/18px system-ui, sans-serif);cursor:pointer;border:0;border-radius:8px;align-items:center;gap:4px;padding:0 8px;display:inline-flex}.uQwHMW_annotationSend:hover:not(:disabled){background:var(--dsw-alias-state-business-hover,#2678e8)}.uQwHMW_annotationSend:disabled{background:var(--dsw-alias-state-business-disabled,#a9c9f7);cursor:default}.uQwHMW_annotationCount{color:#ffffffd1;font:var(--dsw-font-xxs-12,500 12px/16px system-ui, sans-serif);margin-left:-2px}.uQwHMW_hint{color:var(--dsw-alias-label-caption,#a0a4ab);font:var(--dsw-font-xxxs-11,11px/14px system-ui, sans-serif);flex:none;padding:0 10px 6px}.uQwHMW_body{flex-direction:column;flex:auto;min-height:0;padding-bottom:12px;display:flex}.uQwHMW_frameWrap{border-bottom:1px solid var(--dsw-alias-border-l1,#00000014);background:var(--dsw-alias-bg-base,#fff);flex:auto;min-height:140px;position:relative;overflow:hidden}.uQwHMW_frame{border:0;width:100%;height:100%;display:block}.uQwHMW_frameOverlay{background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-caption,#a0a4ab);font:var(--dsw-font-xxs-12,12px/18px system-ui, sans-serif);text-align:center;justify-content:center;align-items:center;padding:16px;display:flex;position:absolute;inset:0}@media (prefers-reduced-motion:reduce){.uQwHMW_icon,.uQwHMW_inlineAction{transition:none}}";
		const tagId$1 = "@canglongcl/dsh-web-review/WebviewView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@canglongcl/dsh-web-review";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var WebviewView_module_css_default = {
			"annotationSend": "uQwHMW_annotationSend",
			"frameWrap": "uQwHMW_frameWrap",
			"error": "uQwHMW_error",
			"icon": "uQwHMW_icon",
			"body": "uQwHMW_body",
			"annotationBar": "uQwHMW_annotationBar",
			"commentIcon": "uQwHMW_commentIcon",
			"urlField": "uQwHMW_urlField",
			"inlineAction": "uQwHMW_inlineAction",
			"errorIcon": "uQwHMW_errorIcon",
			"annotationCount": "uQwHMW_annotationCount",
			"panel": "uQwHMW_panel",
			"annotationTitle": "uQwHMW_annotationTitle",
			"hint": "uQwHMW_hint",
			"urlRow": "uQwHMW_urlRow",
			"iconAccent": "uQwHMW_iconAccent",
			"frame": "uQwHMW_frame",
			"annotationIcon": "uQwHMW_annotationIcon",
			"frameOverlay": "uQwHMW_frameOverlay",
			"url": "uQwHMW_url"
		};
		//#endregion
		//#region src/client/WebviewView.tsx
		/**
		* WebviewView: the "缃戦〉棰勮" conversation view tab. Renders browse chrome or
		* the annotation toolbar above a
		* full-height isolated iframe with the bridge-owned picker and annotation
		* echo layer (hover outline and numbered marker circles).
		*
		* Interaction model: the pick button (icon-only, far right of the URL row)
		* arms pick mode; clicking an element opens the host-owned white comment and
		* visual-property editor. Confirm commits its bounded diffs into the shared
		* store; Cancel restores the exact transaction baseline. Each annotation echoes
		* as a numbered circle 鈥?clicking it (or a dock detail row) re-opens the editor.
		*
		* The shared dock observes picks/url/title and commits the separate annotation
		* context; this view never touches the user's composer message. Assistant-link
		* delegation lives in the always-mounted annotation dock so it can activate
		* this view while Chat is visible.
		*
		* Presentation follows the dsh web design system: shared atoms (Input) and
		* the ic_ds_* icon set from @deepseek-ai/dsh-client-ui-primitives, plus the
		* --dsw-alias-* token vocabulary for everything custom. State arrives via
		* useStore/actions; no ctx, no contexts.
		*/
		function loadPreferredEditorSize() {
			try {
				return typeof window === "undefined" ? null : readEditorSize(window.localStorage);
			} catch {
				return null;
			}
		}
		function persistPreferredEditorSize(size) {
			try {
				writeEditorSize(window.localStorage, size);
			} catch {}
		}
		/** Stable pick id without depending on crypto.randomUUID availability. */
		function pickId() {
			if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
			return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
		}
		/** The preview tab view (see module doc). */
		function WebviewView({ useStore, useSession, useInput, inputActions, actions, sendAnnotationsWithoutDraft, createPreviewSession, releasePreviewSessions, t }) {
			const state = useStore((s) => s);
			const input = useInput((s) => s);
			const promptError = useSession((session) => session.promptError);
			const stateRef = (0, react.useRef)(state);
			stateRef.current = state;
			const actionsRef = (0, react.useRef)(actions);
			actionsRef.current = actions;
			const frameRef = (0, react.useRef)(null);
			const bridgeRef = (0, react.useRef)(null);
			const [descriptor, setDescriptor] = (0, react.useState)(null);
			const [previewRequestRevision, setPreviewRequestRevision] = (0, react.useState)(0);
			const sessionRequest = (0, react.useRef)(0);
			const loadedPageUrl = (0, react.useRef)(null);
			const mounted = (0, react.useRef)(true);
			/** Host-owned annotation editor transaction. */
			const [editor, setEditor] = (0, react.useState)(null);
			const editorRef = (0, react.useRef)(editor);
			editorRef.current = editor;
			const navigationSequence = (0, react.useRef)(0);
			const preferredEditorSize = (0, react.useRef)(loadPreferredEditorSize());
			const handledPickResetRevision = (0, react.useRef)(state.pickResetRevision);
			/** The isolated bridge has completed its exact-Origin handshake. */
			const [pickerReady, setPickerReady] = (0, react.useState)(false);
			const [historyState, setHistoryState] = (0, react.useState)({
				canGoBack: false,
				canGoForward: false
			});
			/** Dedicated annotation submission state; the stock composer stays untouched. */
			const [sendingAnnotations, setSendingAnnotations] = (0, react.useState)(false);
			const promptErrorAtSend = (0, react.useRef)(promptError);
			const onPickRef = (0, react.useRef)(() => void 0);
			const onMarkClickRef = (0, react.useRef)(() => void 0);
			const onShortcutRef = (0, react.useRef)(() => void 0);
			const release = (ids) => {
				if (ids.length === 0) return;
				releasePreviewSessions(ids).catch(() => void 0);
			};
			const closeEditor = (restore) => {
				if (editorRef.current !== null && restore) bridgeRef.current?.cancelEdit();
				else bridgeRef.current?.clearSelection();
				setEditor(null);
			};
			const loadTree = (id, handle) => {
				const bridge = bridgeRef.current;
				if (bridge === null) return;
				bridge.readTree(handle).then((tree) => {
					setEditor((current) => current === null || current.id !== id || current.target.handle !== handle ? current : {
						...current,
						tree
					});
				}).catch(() => void 0);
			};
			const openEditor = (id, target, existing) => {
				const current = editorRef.current;
				if (current !== null && current.id !== id) bridgeRef.current?.cancelEdit();
				setEditor({
					id,
					target,
					existing,
					originalHandle: existing === null ? null : target.handle,
					tree: null,
					comment: existing?.comment ?? "",
					mode: "collapsed",
					navigationFeedback: null,
					position: null,
					size: preferredEditorSize.current
				});
				loadTree(id, target.handle);
			};
			const selectEditorTarget = (target, comment, mode, action) => {
				const current = editorRef.current;
				if (current === null || current.target.handle === target.handle) return;
				if (action !== void 0) navigationSequence.current += 1;
				setEditor({
					...current,
					target,
					tree: null,
					comment,
					mode,
					navigationFeedback: mode !== "select" && action !== void 0 ? {
						action,
						sequence: navigationSequence.current
					} : null
				});
				loadTree(current.id, target.handle);
			};
			const navigateEditorTarget = (action, comment, mode) => {
				const current = editorRef.current;
				const bridge = bridgeRef.current;
				if (current === null || bridge === null) return;
				const sequence = ++navigationSequence.current;
				bridge.navigateElement(current.target.handle, action).then((target) => {
					if (target === null || sequence !== navigationSequence.current) return;
					selectEditorTarget(target, comment, mode, action);
				}).catch(() => void 0);
			};
			const selectTreeTarget = (handle, comment, mode) => {
				const current = editorRef.current;
				const bridge = bridgeRef.current;
				if (current === null || bridge === null) return;
				const sequence = ++navigationSequence.current;
				bridge.selectElement(handle).then((target) => {
					if (target === null || sequence !== navigationSequence.current) return;
					selectEditorTarget(target, comment, mode);
				}).catch(() => void 0);
			};
			const onMarkClick = (id) => {
				const pick = stateRef.current.picks.find((p) => p.id === id);
				const bridge = bridgeRef.current;
				if (pick === void 0 || bridge === null) return;
				bridge.openPick(id, pick.snapshot.cssPath).then((target) => {
					if (target !== null) openEditor(id, target, pick);
				}).catch(() => void 0);
			};
			onPickRef.current = (target) => {
				if (stateRef.current.picks.length >= 20) {
					actionsRef.current.setError(t("panel.pick.limit", { count: String(20) }));
					bridgeRef.current?.cancelEdit();
					return;
				}
				openEditor(pickId(), target, null);
			};
			onMarkClickRef.current = onMarkClick;
			onShortcutRef.current = (action) => {
				const current = editorRef.current;
				if (current !== null) navigateEditorTarget(action, current.comment, current.mode);
			};
			(0, react.useEffect)(() => {
				if (state.url === loadedPageUrl.current) return;
				sessionRequest.current += 1;
				const request = sessionRequest.current;
				setPickerReady(false);
				setHistoryState({
					canGoBack: false,
					canGoForward: false
				});
				setDescriptor(null);
				if (state.url === "") {
					loadedPageUrl.current = null;
					setDescriptor(null);
					return;
				}
				loadedPageUrl.current = state.url;
				createPreviewSession(state.url).then((next) => {
					if (!mounted.current || request !== sessionRequest.current) {
						release([next.sessionId]);
						return;
					}
					setDescriptor(next);
				}).catch(() => {
					if (mounted.current && request === sessionRequest.current) {
						loadedPageUrl.current = null;
						actionsRef.current.setError(t("panel.previewUnavailable"));
					}
				});
			}, [
				state.url,
				previewRequestRevision,
				createPreviewSession,
				t
			]);
			(0, react.useEffect)(() => {
				const frame = frameRef.current;
				if (descriptor === null || frame === null) return;
				const bridge = new PreviewBridgeClient(frame, descriptor, {
					onReady: (ready) => {
						setPickerReady(true);
						setHistoryState({
							canGoBack: ready.canGoBack,
							canGoForward: ready.canGoForward
						});
						actionsRef.current.setError(null);
						actionsRef.current.setTitle(ready.title);
						loadedPageUrl.current = ready.pageUrl;
						if (stateRef.current.url !== ready.pageUrl) actionsRef.current.setUrl(ready.pageUrl);
						if (editorRef.current !== null) setEditor(null);
						bridge.syncMarkers(stateRef.current.picks);
						if (stateRef.current.pickMode) bridge.activate();
					},
					onPick: (target) => {
						onPickRef.current(target);
					},
					onCancelPick: () => {
						if (stateRef.current.pickMode) actionsRef.current.togglePickMode();
					},
					onMarkClick: (id) => {
						onMarkClickRef.current(id);
					},
					onTargetGeometry: (handle, rect, viewport) => {
						setEditor((current) => current === null || current.target.handle !== handle ? current : {
							...current,
							target: {
								...current.target,
								rect,
								viewport
							}
						});
					},
					onShortcut: (action) => {
						onShortcutRef.current(action);
					},
					onHandoff: () => {
						setPickerReady(false);
						setHistoryState({
							canGoBack: false,
							canGoForward: false
						});
						actionsRef.current.setTitle("");
						actionsRef.current.clearPicks();
						setEditor(null);
					},
					onUnavailable: () => {
						setPickerReady(false);
						actionsRef.current.setError(t("panel.previewUnavailable"));
					}
				});
				bridgeRef.current = bridge;
				frame.src = descriptor.frameUrl;
				return () => {
					if (bridgeRef.current === bridge) bridgeRef.current = null;
					release(bridge.dispose());
				};
			}, [
				descriptor,
				releasePreviewSessions,
				t
			]);
			(0, react.useEffect)(() => () => {
				mounted.current = false;
				sessionRequest.current += 1;
			}, []);
			const onFrameLoad = () => {
				bridgeRef.current?.frameLoaded();
			};
			(0, react.useEffect)(() => {
				const bridge = bridgeRef.current;
				if (bridge === null) return;
				if (state.pickMode) bridge.activate();
				if (!state.pickMode) {
					bridge.deactivate();
					if (editorRef.current !== null) closeEditor(true);
				}
			}, [state.pickMode]);
			(0, react.useEffect)(() => {
				const ids = new Set(state.picks.map((pick) => pick.id));
				const reset = handledPickResetRevision.current !== state.pickResetRevision;
				handledPickResetRevision.current = state.pickResetRevision;
				const current = editorRef.current;
				if (current !== null && (reset || current.existing !== null && !ids.has(current.id))) {
					bridgeRef.current?.cancelEdit();
					setEditor(null);
				}
				bridgeRef.current?.syncMarkers(state.picks);
			}, [state.pickResetRevision, state.picks]);
			(0, react.useEffect)(() => {
				const id = state.focusPickId;
				if (id === null) return;
				onMarkClick(id);
				actionsRef.current.setFocusPickId(null);
			}, [state.focusPickId]);
			(0, react.useEffect)(() => {
				if (!sendingAnnotations || state.picks.length !== 0) return;
				setSendingAnnotations(false);
				if (stateRef.current.pickMode) actionsRef.current.togglePickMode();
			}, [sendingAnnotations, state.picks.length]);
			(0, react.useEffect)(() => {
				if (!sendingAnnotations || promptError === null || promptError === promptErrorAtSend.current) return;
				setSendingAnnotations(false);
				actionsRef.current.setError(t("panel.pick.sendError"));
			}, [
				promptError,
				sendingAnnotations,
				t
			]);
			/** Navigate the iframe to `url`; a new page invalidates the previous picks. */
			const navigate = (url) => {
				const normalized = normalizePreviewUrl(url);
				if (normalized === void 0 || normalized.length > ANNOTATION_LIMITS.pageUrl) {
					actions.setError(t("panel.urlInvalid"));
					return;
				}
				actions.setError(null);
				loadedPageUrl.current = null;
				setPreviewRequestRevision((value) => value + 1);
				setHistoryState({
					canGoBack: false,
					canGoForward: false
				});
				actions.setUrl(normalized);
				actions.setTitle("");
				actions.clearPicks();
			};
			const frameSrc = descriptor?.frameUrl;
			const pickDisabled = !pickerReady || state.url === "";
			const visibleError = state.annotationSync.status === "error" ? state.annotationSync.message : state.error;
			const inputBusy = input.phase === "adjudicating" || input.phase === "submitting";
			const canSendAnnotations = state.picks.length > 0 && state.annotationSync.status === "ready" && !sendingAnnotations && !inputBusy;
			const submitAnnotations = async () => {
				if (!canSendAnnotations) return;
				if (input.draft.trim().startsWith("/")) {
					actions.setError(t("panel.pick.slashDraft"));
					return;
				}
				setSendingAnnotations(true);
				actions.setError(null);
				if (input.draft.trim() !== "") {
					promptErrorAtSend.current = promptError;
					inputActions.submit();
					return;
				}
				try {
					await sendAnnotationsWithoutDraft();
					if (stateRef.current.pickMode) actionsRef.current.togglePickMode();
				} catch {
					actions.setError(t("panel.pick.sendError"));
				} finally {
					setSendingAnnotations(false);
				}
			};
			const confirmEditor = (value) => {
				const current = editorRef.current;
				if (current === null) return;
				if (current.existing !== null && !stateRef.current.picks.some((pick) => pick.id === current.id)) {
					bridgeRef.current?.cancelEdit();
					setEditor(null);
					return;
				}
				const pick = {
					id: current.id,
					snapshot: current.originalHandle === current.target.handle && current.existing !== null ? current.existing.snapshot : current.target.snapshot,
					comment: value.comment,
					changes: value.changes,
					textChange: value.textChange,
					viewport: value.viewport
				};
				bridgeRef.current?.commitEdit(current.id, current.target.handle, value.changes, value.textChange);
				if (current.existing === null) actions.addPick(pick);
				else actions.updatePick(current.id, pick);
				setEditor(null);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: WebviewView_module_css_default.panel,
				"data-webview-ui": true,
				"data-webview-panel": "",
				children: [
					state.pickMode ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: WebviewView_module_css_default.annotationBar,
						"data-webview-annotation-toolbar": "",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: WebviewView_module_css_default.annotationIcon,
								"aria-label": t("panel.pick.off"),
								title: t("panel.pick.off"),
								onClick: () => {
									actions.togglePickMode();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 16 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: WebviewView_module_css_default.annotationIcon,
								"aria-label": t("panel.pick.clear"),
								title: t("panel.pick.clear"),
								disabled: state.picks.length === 0 || sendingAnnotations,
								onClick: () => {
									actions.clearPicks();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 16 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: WebviewView_module_css_default.annotationTitle,
								title: state.url,
								children: t("panel.pick.active", { url: state.url })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: WebviewView_module_css_default.annotationSend,
								disabled: !canSendAnnotations,
								"aria-label": `${t("panel.pick.send")} ${String(state.picks.length)}`,
								onClick: () => {
									submitAnnotations();
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSendOutline16, { size: 14 }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: sendingAnnotations ? t("panel.pick.sending") : t("panel.pick.send") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: WebviewView_module_css_default.annotationCount,
										"aria-hidden": true,
										children: [
											"(",
											state.picks.length,
											")"
										]
									})
								]
							})
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: WebviewView_module_css_default.urlRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: WebviewView_module_css_default.icon,
								"aria-label": t("panel.back"),
								title: t("panel.back"),
								disabled: !historyState.canGoBack,
								onClick: () => {
									bridgeRef.current?.historyBack();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { size: 16 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: WebviewView_module_css_default.icon,
								"aria-label": t("panel.forward"),
								title: t("panel.forward"),
								disabled: !historyState.canGoForward,
								onClick: () => {
									bridgeRef.current?.historyForward();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 16 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: WebviewView_module_css_default.icon,
								"aria-label": t("panel.refresh"),
								title: t("panel.refresh"),
								disabled: state.url === "",
								onClick: () => {
									bridgeRef.current?.reload();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 16 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: WebviewView_module_css_default.urlField,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									className: WebviewView_module_css_default.url ?? "",
									value: state.urlDraft,
									maxLength: ANNOTATION_LIMITS.pageUrl,
									placeholder: t("panel.urlPlaceholder"),
									onChange: (e) => {
										actions.setUrlDraft(e.target.value);
									},
									onKeyDown: (e) => {
										if (e.key === "Enter") navigate(state.urlDraft);
									},
									spellCheck: false
								}), state.url !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									className: WebviewView_module_css_default.inlineAction,
									href: state.url,
									target: "_blank",
									rel: "noopener noreferrer",
									"aria-label": t("panel.external"),
									title: t("panel.external"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline16, { size: 12 })
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: clsx(WebviewView_module_css_default.icon, WebviewView_module_css_default.commentIcon),
								"aria-label": t("panel.pick"),
								title: t("panel.pick"),
								disabled: pickDisabled,
								onClick: () => {
									actions.togglePickMode();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconNewChatOutline16, { size: 16 })
							})
						]
					}),
					visibleError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: WebviewView_module_css_default.error,
						role: "alert",
						title: visibleError,
						"data-webview-error": "",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, {
							size: 14,
							className: WebviewView_module_css_default.errorIcon
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: visibleError })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: WebviewView_module_css_default.body,
						"data-webview-preview-body": "",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: WebviewView_module_css_default.frameWrap,
							children: [frameSrc !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
								ref: frameRef,
								className: WebviewView_module_css_default.frame,
								src: "about:blank",
								title: t("panel.frame"),
								sandbox: "allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-pointer-lock allow-presentation",
								referrerPolicy: "no-referrer",
								onLoad: onFrameLoad
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: WebviewView_module_css_default.frameOverlay,
								children: state.url === "" ? t("panel.noUrl") : t("panel.loading")
							}), editor !== null && frameRef.current !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AnnotationEditor, {
								id: editor.id,
								target: editor.target,
								tree: editor.tree,
								frame: frameRef.current,
								comment: editor.comment,
								changes: editor.originalHandle === editor.target.handle ? editor.existing?.changes ?? [] : [],
								textChange: editor.originalHandle === editor.target.handle ? editor.existing?.textChange ?? null : null,
								initialMode: editor.mode,
								navigationFeedback: editor.navigationFeedback,
								selectedSkills: state.selectedSkills,
								position: editor.position,
								size: editor.size,
								t,
								onCommentChange: (comment) => {
									setEditor((current) => current === null ? null : {
										...current,
										comment
									});
								},
								onCancel: () => {
									closeEditor(true);
								},
								onConfirm: confirmEditor,
								onToggleSkill: actions.toggleSelectedSkill,
								onNavigateTarget: navigateEditorTarget,
								onSelectTarget: selectTreeTarget,
								onPreviewStyle: (property, value) => {
									bridgeRef.current?.previewStyle(editor.target.handle, property, value);
								},
								onRestoreStyle: (property) => {
									bridgeRef.current?.restoreStyle(editor.target.handle, property);
								},
								onPreviewText: (value) => {
									bridgeRef.current?.previewText(editor.target.handle, value);
								},
								onRestoreText: () => {
									bridgeRef.current?.restoreText(editor.target.handle);
								},
								onPositionChange: (position) => {
									setEditor((current) => current === null ? null : {
										...current,
										position
									});
								},
								onSizeChange: (size) => {
									setEditor((current) => current === null ? null : {
										...current,
										size
									});
								},
								onSizeCommit: (size) => {
									preferredEditorSize.current = size;
									persistPreferredEditorSize(size);
								}
							}, `${editor.id}:${editor.target.handle}`)]
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/annotation-snapshot.ts
		/** Map the rich picker store into the bounded browser-to-host wire shape. */
		function bounded(value, cap) {
			if (value.length <= cap) return value;
			return `${value.slice(0, Math.max(0, cap - 1))}鈥;
		}
		/** User-authored intent must fail visibly instead of being silently rewritten. */
		function exactIntent(value, cap, field) {
			if (value.length > cap) throw new RangeError(`${field} exceeds ${String(cap)} characters`);
			return value;
		}
		function annotationDraft(url, title, picks, selectedSkills = []) {
			if (picks.length > 20) throw new RangeError(`annotations exceed ${String(20)}`);
			return {
				selectedSkills: [...selectedSkills],
				page: {
					url: bounded(url, ANNOTATION_LIMITS.pageUrl),
					title: bounded(title, ANNOTATION_LIMITS.pageTitle)
				},
				comments: picks.map(({ id, comment, snapshot, changes, textChange, viewport }) => ({
					id: bounded(id, ANNOTATION_LIMITS.id),
					comment: exactIntent(comment, ANNOTATION_LIMITS.comment, "comment"),
					tagName: bounded(snapshot.tagName, ANNOTATION_LIMITS.tagName),
					role: bounded(snapshot.role, ANNOTATION_LIMITS.role),
					label: bounded(snapshot.label, ANNOTATION_LIMITS.label),
					cssPath: bounded(snapshot.cssPath, ANNOTATION_LIMITS.cssPath),
					fullPath: bounded(snapshot.fullPath, ANNOTATION_LIMITS.fullPath),
					stableClasses: snapshot.stableClasses.slice(0, ANNOTATION_LIMITS.stableClasses).map((value) => bounded(value, ANNOTATION_LIMITS.stableClass)),
					textContent: bounded(snapshot.textContent, ANNOTATION_LIMITS.textContent),
					inToolChrome: snapshot.inToolChrome,
					anchor: snapshot.anchor === null ? null : {
						...snapshot.anchor,
						file: bounded(snapshot.anchor.file, ANNOTATION_LIMITS.anchorFile),
						component: bounded(snapshot.anchor.component, ANNOTATION_LIMITS.anchorComponent)
					},
					changes: (() => {
						if (changes.length > 48) throw new RangeError(`changes exceed ${String(48)}`);
						return changes.map((change) => ({
							property: change.property,
							before: bounded(change.before, ANNOTATION_LIMITS.styleValue),
							after: exactIntent(change.after, ANNOTATION_LIMITS.styleValue, `change.${change.property}`)
						}));
					})(),
					textChange: textChange === null ? null : {
						before: bounded(textChange.before, ANNOTATION_LIMITS.textValue),
						after: exactIntent(textChange.after, ANNOTATION_LIMITS.textValue, "textChange.after")
					},
					viewport
				}))
			};
		}
		//#endregion
		//#region src/client/element-label.ts
		/** Compact fallback identity for an element without an accessible label. */
		function elementLabel(snapshot) {
			const id = snapshot.id === "" ? "" : `#${snapshot.id}`;
			const classes = snapshot.className === "" ? "" : `.${snapshot.className.trim().split(/\s+/u).filter(Boolean).join(".")}`;
			return `${snapshot.tagName}${id}${classes}`;
		}
		//#endregion
		//#region src/client/preview-link.ts
		/** Assistant message rows expose this semantic marker in Harness 0812. */
		const ASSISTANT_ROW = "[data-chat-flow-kind=\"assistant-step\"]";
		/**
		* Resolve an assistant-authored absolute HTTP(S) link from an ordinary left click.
		* Modifier clicks keep the browser's external-link behavior.
		*/
		function previewHrefFromClick(event) {
			if (event.defaultPrevented || event.button !== 0) return void 0;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return void 0;
			const target = event.target;
			if (!(target instanceof Element)) return void 0;
			if (target.closest("[data-webview-ui]") !== null) return void 0;
			const anchor = target.closest("a[href]");
			if (anchor === null || anchor.closest(ASSISTANT_ROW) === null) return void 0;
			const href = anchor.getAttribute("href") ?? "";
			if (!/^https?:\/\//i.test(href)) return void 0;
			try {
				const normalized = new URL(href).href;
				return isPreviewableUrl(normalized) ? normalized : void 0;
			} catch {
				return;
			}
		}
		/** Activate the plugin's registered conversation tab through its accessible UI. */
		function activatePreviewTab(root, label) {
			const tab = [...root.querySelectorAll("[role=\"tab\"]")].find((candidate) => candidate.textContent?.trim() === label);
			if (tab === void 0) return false;
			tab.click();
			return true;
		}
		//#endregion
		//#region \0dsh-web-review-css:src/client/DraftOverlayBar.module.css.mjs
		const css = ".yeDpAG_dock,.yeDpAG_dock *,.yeDpAG_dock :before,.yeDpAG_dock :after{box-sizing:border-box}.yeDpAG_dock{z-index:4;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));font-family:Inter, var(--dsw-font-family,system-ui, sans-serif);flex:none;margin:0 auto;position:relative}.yeDpAG_anchor{width:fit-content;max-width:100%;position:relative}.yeDpAG_capsule{border:1px solid var(--dsw-alias-border-l1,#00000014);background:var(--dsw-specific-tip,#f7f8fa);max-width:100%;height:36px;color:var(--dsw-alias-label-primary,#17191c);border-radius:12px;align-items:center;display:inline-flex;overflow:hidden;box-shadow:0 1px 2px #00000008}.yeDpAG_summary{min-width:0;height:100%;color:inherit;cursor:pointer;background:0 0;border:0;align-items:center;gap:8px;padding:4px 8px 4px 12px;display:flex}.yeDpAG_summary:hover,.yeDpAG_clear:hover,.yeDpAG_remove:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.yeDpAG_summary:focus-visible,.yeDpAG_clear:focus-visible,.yeDpAG_rowMain:focus-visible,.yeDpAG_remove:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary,#61666b);outline-offset:-2px}.yeDpAG_lead{color:var(--dsw-alias-label-tertiary,#61666b);flex:none;place-items:center;display:grid}.yeDpAG_count{text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:24px;overflow:hidden}.yeDpAG_status{color:var(--dsw-alias-label-tertiary,#61666b);flex:none;align-items:center;gap:4px;font-size:11px;line-height:16px;display:inline-flex}.yeDpAG_capsule[data-sync-status=error] .yeDpAG_status{color:var(--dsw-alias-state-error-primary,#ec1313)}.yeDpAG_spinner{animation:.9s linear infinite yeDpAG_spin}.yeDpAG_clear,.yeDpAG_remove{color:var(--dsw-alias-label-tertiary,#61666b);cursor:pointer;background:0 0;border:0;flex:none;place-items:center;padding:0;display:grid}.yeDpAG_clear{border-left:1px solid var(--dsw-alias-border-l1,#00000014);width:32px;height:100%}.yeDpAG_details{z-index:20;border:1px solid var(--dsw-alias-border-l1,#00000014);background:var(--dsw-alias-bg-base,#fff);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,#0003);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2,#0000004d);border-radius:14px;width:min(420px,100vw - 32px);max-height:min(360px,52vh);position:absolute;bottom:calc(100% + 8px);left:0;overflow:auto;box-shadow:0 12px 32px #0000001f,0 2px 8px #0000000f}.yeDpAG_list{margin:0;padding:6px;list-style:none}.yeDpAG_row{border-radius:10px;min-width:0;display:flex;position:relative}.yeDpAG_row+.yeDpAG_row{border-top:1px solid var(--dsw-alias-border-l1,#00000014);border-top-left-radius:0;border-top-right-radius:0}.yeDpAG_row:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.yeDpAG_rowMain{min-width:0;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:10px;flex-direction:column;flex:auto;gap:7px;padding:10px 38px 10px 10px;display:flex}.yeDpAG_targetLine{align-items:center;gap:7px;min-width:0;display:flex}.yeDpAG_index{background:var(--dsw-alias-state-business-primary,#4176e6);width:18px;height:18px;color:var(--dsw-alias-label-primary-foreground,#fff);border-radius:999px;flex:none;place-items:center;font-size:11px;font-weight:600;line-height:18px;display:grid}.yeDpAG_badge{border:1px solid var(--dsw-alias-border-l1,#00000014);background:var(--dsw-alias-bg-module-platform,#f4f5f6);max-width:96px;color:var(--dsw-alias-label-tertiary,#61666b);font:12px/18px var(--ds-font-family-code,ui-monospace, monospace);text-overflow:ellipsis;white-space:nowrap;border-radius:999px;flex:none;padding:1px 7px;overflow:hidden}.yeDpAG_target{min-width:0;color:var(--dsw-alias-label-secondary,#4b4f57);text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;overflow:hidden}.yeDpAG_comment,.yeDpAG_emptyComment{color:var(--dsw-alias-label-primary,#17191c);white-space:pre-wrap;-webkit-line-clamp:4;-webkit-box-orient:vertical;font-size:14px;font-weight:500;line-height:21px;display:-webkit-box;overflow:hidden}.yeDpAG_emptyComment{color:var(--dsw-alias-label-caption,#a0a4ab);font-weight:400}.yeDpAG_source{color:var(--dsw-alias-label-caption,#a0a4ab);font:11px/16px var(--ds-font-family-code,ui-monospace, monospace);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.yeDpAG_remove{opacity:0;border-radius:999px;width:28px;height:28px;position:absolute;top:7px;right:7px}.yeDpAG_row:hover .yeDpAG_remove,.yeDpAG_remove:focus-visible{opacity:1}@keyframes yeDpAG_spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.yeDpAG_spinner{animation:none}}";
		const tagId = "@canglongcl/dsh-web-review/DraftOverlayBar.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@canglongcl/dsh-web-review";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var DraftOverlayBar_module_css_default = {
			"anchor": "yeDpAG_anchor",
			"index": "yeDpAG_index",
			"count": "yeDpAG_count",
			"target": "yeDpAG_target",
			"emptyComment": "yeDpAG_emptyComment",
			"spinner": "yeDpAG_spinner",
			"badge": "yeDpAG_badge",
			"remove": "yeDpAG_remove",
			"row": "yeDpAG_row",
			"list": "yeDpAG_list",
			"clear": "yeDpAG_clear",
			"status": "yeDpAG_status",
			"source": "yeDpAG_source",
			"summary": "yeDpAG_summary",
			"lead": "yeDpAG_lead",
			"comment": "yeDpAG_comment",
			"rowMain": "yeDpAG_rowMain",
			"capsule": "yeDpAG_capsule",
			"targetLine": "yeDpAG_targetLine",
			"spin": "yeDpAG_spin",
			"dock": "yeDpAG_dock",
			"details": "yeDpAG_details"
		};
		//#endregion
		//#region src/client/DraftOverlayBar.tsx
		/**
		* Compact annotation capsule above the stock composer. The capsule owns the
		* browser-to-host commit effect and exposes acknowledgement state; its detail
		* card opens on hover/focus and keeps every comment's target context visible.
		*/
		function kindOf(snapshot) {
			return snapshot.role.trim() || snapshot.tagName.trim() || "element";
		}
		function targetOf(snapshot) {
			return snapshot.label.trim() || elementLabel(snapshot);
		}
		function sourceOf(pick) {
			const anchor = pick.snapshot.anchor;
			if (anchor === null) return pick.snapshot.cssPath;
			const source = anchor.line === void 0 ? anchor.file : `${anchor.file}:${anchor.line}`;
			return anchor.component.trim() === "" ? source : `${source} 路 ${anchor.component}`;
		}
		function annotationContextId(node) {
			return node.kind === "context" ? annotationSnapshotIdOfSource(node.source) : void 0;
		}
		/** Annotation composer capsule and hover/focus detail card. */
		function DraftOverlayBar({ useStore, useSession, actions, syncAnnotations, openPreview, t }) {
			const state = useStore((s) => s);
			const latestAnnotationContextId = useSession((session) => {
				const node = session.nodes.findLast((candidate) => annotationContextId(candidate) !== void 0);
				return node === void 0 ? void 0 : annotationContextId(node);
			});
			const [open, setOpen] = (0, react.useState)(false);
			const [retry, setRetry] = (0, react.useState)(0);
			const detailsId = (0, react.useId)();
			const revision = (0, react.useRef)(0);
			const hadAnnotations = (0, react.useRef)(false);
			const initialized = (0, react.useRef)(false);
			const tRef = (0, react.useRef)(t);
			tRef.current = t;
			const openPreviewRef = (0, react.useRef)(openPreview);
			openPreviewRef.current = openPreview;
			(0, react.useEffect)(() => {
				const handler = (event) => {
					const href = previewHrefFromClick(event);
					if (href === void 0) return;
					event.preventDefault();
					openPreviewRef.current(href);
				};
				document.addEventListener("click", handler, true);
				return () => {
					document.removeEventListener("click", handler, true);
				};
			}, []);
			(0, react.useEffect)(() => {
				const clearing = state.picks.length === 0;
				const initialEmpty = clearing && !initialized.current;
				initialized.current = true;
				if (clearing && !hadAnnotations.current && !initialEmpty && state.annotationSync.status !== "error") {
					actions.setAnnotationSync({ status: "idle" });
					return;
				}
				if (!clearing) hadAnnotations.current = true;
				const currentRevision = ++revision.current;
				if (!initialEmpty) actions.setAnnotationSync({ status: "syncing" });
				syncAnnotations(annotationDraft(state.url, state.title, state.picks, state.selectedSkills)).then((receipt) => {
					if (revision.current !== currentRevision) return;
					if (clearing) hadAnnotations.current = false;
					actions.setAnnotationSync(receipt.kind === "ready" ? {
						status: "ready",
						snapshotId: receipt.snapshotId
					} : { status: "idle" });
				}, () => {
					if (revision.current !== currentRevision) return;
					actions.setAnnotationSync({
						status: "error",
						message: tRef.current("dock.sync.error")
					});
				});
				return () => {
					revision.current += 1;
				};
			}, [
				actions,
				retry,
				state.picks,
				state.selectedSkills,
				state.title,
				state.url,
				syncAnnotations
			]);
			(0, react.useEffect)(() => {
				if (state.picks.length === 0) setOpen(false);
			}, [state.picks.length]);
			(0, react.useEffect)(() => {
				if (state.picks.length > 0 && state.annotationSync.status === "ready" && latestAnnotationContextId === state.annotationSync.snapshotId) actions.clearPicks();
			}, [
				actions,
				latestAnnotationContextId,
				state.annotationSync,
				state.picks.length
			]);
			const clearing = state.picks.length === 0;
			const syncStatus = state.annotationSync.status === "ready" || state.annotationSync.status === "idle" ? "synced" : state.annotationSync.status;
			if (clearing && syncStatus !== "syncing" && syncStatus !== "error") return null;
			const count = state.picks.length;
			const countLabel = clearing ? t("dock.clearing") : t("dock.count", { count: String(count) });
			const statusLabel = syncStatus === "syncing" ? t("dock.syncing") : syncStatus === "error" ? t("dock.sync.retry") : t("dock.synced");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: DraftOverlayBar_module_css_default.dock,
				"data-webview-ui": true,
				"data-webview-annotations": "",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: DraftOverlayBar_module_css_default.anchor,
					onMouseEnter: () => {
						if (!clearing) setOpen(true);
					},
					onMouseLeave: (event) => {
						if (!event.currentTarget.contains(document.activeElement)) setOpen(false);
					},
					onFocusCapture: () => {
						if (!clearing) setOpen(true);
					},
					onBlurCapture: (event) => {
						const next = event.relatedTarget;
						if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
					},
					onKeyDown: (event) => {
						if (event.key === "Escape") {
							event.stopPropagation();
							setOpen(false);
						}
					},
					children: [open && !clearing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						id: detailsId,
						className: DraftOverlayBar_module_css_default.details,
						role: "region",
						"aria-label": t("dock.details"),
						"data-webview-annotation-details": "",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: DraftOverlayBar_module_css_default.list,
							children: state.picks.map((pick, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
								className: DraftOverlayBar_module_css_default.row,
								"data-webview-annotation-row": "",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: DraftOverlayBar_module_css_default.rowMain,
									"aria-label": t("dock.focus", {
										index: String(index + 1),
										target: targetOf(pick.snapshot)
									}),
									onClick: () => {
										actions.setFocusPickId(pick.id);
										setOpen(false);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: DraftOverlayBar_module_css_default.targetLine,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: DraftOverlayBar_module_css_default.index,
													children: index + 1
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: DraftOverlayBar_module_css_default.badge,
													children: kindOf(pick.snapshot)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: DraftOverlayBar_module_css_default.target,
													children: targetOf(pick.snapshot)
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: pick.comment.trim() === "" ? DraftOverlayBar_module_css_default.emptyComment : DraftOverlayBar_module_css_default.comment,
											children: pick.comment.trim() || t("dock.noComment")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: DraftOverlayBar_module_css_default.source,
											children: sourceOf(pick)
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: DraftOverlayBar_module_css_default.remove,
									"aria-label": t("panel.pick.remove"),
									title: t("panel.pick.remove"),
									"data-webview-annotation-remove": "",
									onClick: () => {
										actions.removePick(pick.id);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 14 })
								})]
							}, pick.id))
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: DraftOverlayBar_module_css_default.capsule,
						"data-webview-annotation-capsule": "",
						"data-sync-status": syncStatus,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: DraftOverlayBar_module_css_default.summary,
							"aria-expanded": open,
							"aria-controls": !clearing ? detailsId : void 0,
							"aria-label": `${countLabel} 路 ${statusLabel}`,
							title: syncStatus === "error" ? statusLabel : void 0,
							onClick: () => {
								if (syncStatus === "error") setRetry((value) => value + 1);
								if (!clearing) setOpen(true);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: DraftOverlayBar_module_css_default.lead,
									"aria-hidden": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconQueueOutline14, {})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: DraftOverlayBar_module_css_default.count,
									children: countLabel
								}),
								syncStatus !== "synced" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: DraftOverlayBar_module_css_default.status,
									title: statusLabel,
									"aria-hidden": true,
									children: [
										syncStatus === "syncing" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {
											size: 14,
											className: DraftOverlayBar_module_css_default.spinner
										}),
										syncStatus === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, { size: 14 }),
										syncStatus === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("dock.sync.failed") })
									]
								})
							]
						}), !clearing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: DraftOverlayBar_module_css_default.clear,
							"aria-label": t("dock.clear"),
							title: t("dock.clear"),
							onClick: () => {
								actions.clearPicks();
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 16 })
						})]
					})]
				})
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "webview";
		/** Required services (cordis fiber inject 鈥?activation waits on them). */
		const inject = [
			"slots",
			"conversation",
			"layout",
			"locale",
			"sessions",
			"command"
		];
		const SKILL_DESCRIPTION_KEYS = {
			"better-ui": "editor.skills.betterUi",
			"better-typography": "editor.skills.betterTypography",
			"better-layout": "editor.skills.betterLayout",
			"better-writing": "editor.skills.betterWriting",
			"better-accessibility": "editor.skills.betterAccessibility",
			"better-colors": "editor.skills.betterColors",
			"better-interface": "editor.skills.betterInterface",
			"interface-review": "editor.skills.interfaceReview"
		};
		function isClientSessions(value) {
			if (typeof value !== "object" || value === null) return false;
			try {
				return typeof Reflect.get(value, "scope") === "function";
			} catch {
				return false;
			}
		}
		/** Resolve the public conversation face through one session scope. */
		function scopedConversation(ctx, sessionId) {
			const sessions = ctx.sessions;
			if (!isClientSessions(sessions)) throw new Error("dsh-web-review: client sessions service unavailable");
			const scope = sessions.scope(sessionId);
			if (scope === void 0) throw new Error(`dsh-web-review: session "${sessionId}" resolved no scope`);
			const conversation = scope.get("conversation");
			if (conversation === void 0) throw new Error("dsh-web-review: conversation service unavailable through session scope");
			return conversation;
		}
		/** Replace the active composer draft with one explicit Skill invocation. */
		function setUiSkillDraft(ctx, sessionId, name) {
			if (!isUiSkillName(name)) throw new Error(`unknown UI optimization Skill "${name}"`);
			const sessionScope = ctx.sessions.scope(sessionId);
			if (sessionScope === void 0) throw new Error(`dsh-web-review: session "${sessionId}" resolved no scope`);
			const conversation = sessionScope.get("conversation");
			if (conversation === void 0) throw new Error("dsh-web-review: conversation service unavailable through session scope");
			conversation.input.for(sessionScope).setDraft(`/${name}`);
		}
		/**
		* Build one per-session annotation sync. Requests are queued in change order,
		* identical queued/acknowledged snapshots are deduplicated, and the returned
		* promise settles after the host has stored the pending snapshot.
		*/
		function makeSyncAnnotations(sessionId) {
			let tail = Promise.resolve();
			let lastAcknowledged;
			let lastScheduledBody;
			let lastScheduledTask;
			return (draft) => {
				const body = JSON.stringify({
					sessionId,
					...draft
				});
				const clearing = draft.comments.length === 0;
				if (lastScheduledTask === void 0 && body === lastAcknowledged?.body) return Promise.resolve(lastAcknowledged.receipt);
				if (body === lastScheduledBody && lastScheduledTask !== void 0) return lastScheduledTask;
				const task = tail.catch(() => void 0).then(async () => {
					if (body === lastAcknowledged?.body) return lastAcknowledged.receipt;
					const response = await fetch("/webview-annotations", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body
					});
					if (!response.ok) {
						if (!(clearing && response.status === 404)) throw new Error(`annotation context sync failed (${response.status})`);
						const receipt = { kind: "empty" };
						lastAcknowledged = {
							body,
							receipt
						};
						return receipt;
					}
					const receipt = annotationSyncReceiptOf(await response.json());
					if (receipt === void 0) throw new Error("annotation context sync returned an invalid receipt");
					lastAcknowledged = {
						body,
						receipt
					};
					return receipt;
				});
				tail = task.then(() => void 0, () => void 0);
				lastScheduledBody = body;
				lastScheduledTask = task;
				task.then(() => {
					if (lastScheduledTask === task) {
						lastScheduledBody = void 0;
						lastScheduledTask = void 0;
					}
				}, () => {
					if (lastScheduledTask === task) {
						lastScheduledBody = void 0;
						lastScheduledTask = void 0;
					}
				});
				return task;
			};
		}
		/** Create one node-owned isolated Origin for a requested page. */
		async function createPreviewSession(target) {
			const response = await fetch(PREVIEW_SESSIONS_PATH, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					[PREVIEW_CLIENT_HEADER]: "1"
				},
				body: JSON.stringify({ target })
			});
			if (!response.ok) throw new Error(`preview session creation failed (${String(response.status)})`);
			const descriptor = previewSessionDescriptorOf(await response.json());
			if (descriptor === void 0) throw new Error("preview session creation returned an invalid descriptor");
			return descriptor;
		}
		/** Release every Origin minted during one iframe's navigation chain. */
		async function releasePreviewSessions(sessionIds) {
			if (sessionIds.length === 0) return;
			const response = await fetch(PREVIEW_SESSIONS_PATH, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					[PREVIEW_CLIENT_HEADER]: "1"
				},
				body: JSON.stringify({ sessionIds }),
				keepalive: true
			});
			if (!response.ok) throw new Error(`preview session release failed (${String(response.status)})`);
		}
		/** The plugin body: dictionaries and the two shared-store registrations. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-web-review: dictionaries");
			const t = ctx.locale.bind(NS);
			const webviewStore = createWebviewStore();
			ctx.inject(["command"], (scope) => {
				scope.effect(() => scope.command.register({
					name: "skills",
					description: t("command.skills.description"),
					available: () => true,
					ui: {
						kind: "popupSelect",
						options: () => Promise.resolve(UI_SKILLS.map((skill) => ({
							id: skill.name,
							label: skill.name,
							detail: t(SKILL_DESCRIPTION_KEYS[skill.name])
						}))),
						onSelect: (option, session) => {
							setUiSkillDraft(scope, session.sessionId, option.id);
						}
					}
				}), "dsh-web-review: /skills contribution");
			});
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "webview",
				order: 20,
				label: () => t("view.tab"),
				locale: NS,
				store: webviewStore,
				inject: (sessionId) => ({
					sendAnnotationsWithoutDraft: () => scopedConversation(ctx, sessionId).send(t("panel.pick.defaultPrompt")),
					createPreviewSession,
					releasePreviewSessions
				})
			}, WebviewView));
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "webview-annotations",
				order: 15,
				locale: NS,
				store: webviewStore,
				inject: (sessionId, actions) => ({
					syncAnnotations: makeSyncAnnotations(sessionId),
					openPreview: (url) => {
						const normalized = normalizePreviewUrl(url);
						if (normalized === void 0) return;
						actions.setError(null);
						actions.setUrl(normalized);
						actions.setTitle("");
						actions.clearPicks();
						ctx.layout.closeDetails();
						activatePreviewTab(document, t("view.tab"));
					}
				})
			}, DraftOverlayBar));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.createPreviewSession = createPreviewSession;
		exports.inject = inject;
		exports.makeSyncAnnotations = makeSyncAnnotations;
		exports.releasePreviewSessions = releasePreviewSessions;
		exports.setUiSkillDraft = setUiSkillDraft;
		return module.exports;
	}
});

//# sourceMappingURL=client-official.js.map