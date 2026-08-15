(function() {
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
	const PREVIEW_BRIDGE_PROTOCOL = "dsh-web-review/bridge";
	const PREVIEW_RESERVED_PREFIX = "/.dsh-web-review";
	const PREVIEW_ENTRY_PREFIX = `${PREVIEW_RESERVED_PREFIX}/entry/`;
	const PREVIEW_PROXY_PREFIX = `${PREVIEW_RESERVED_PREFIX}/proxy/`;
	//#endregion
	//#region src/client/live-patch.ts
	function styleOf(element) {
		return element.style;
	}
	/** One safe direct text node; composite elements are deliberately ineligible. */
	function editableTextNode(element) {
		if (element.children.length > 0) return null;
		const nodes = Array.from(element.childNodes).filter((node) => node.nodeType === 3 && node.data.trim() !== "");
		return nodes.length === 1 ? nodes[0] ?? null : null;
	}
	function createLivePatch(element) {
		const node = editableTextNode(element);
		return {
			element,
			originalStyles: /* @__PURE__ */ new Map(),
			computedBaselines: new Map(EDITABLE_STYLE_PROPERTIES.map((property) => [property, computedValue(element, property)])),
			originalText: node === null ? null : {
				node,
				value: node.data
			}
		};
	}
	function baselineValue(patch, property) {
		return patch.computedBaselines.get(property) ?? "";
	}
	/** Current computed baseline for a property before its first preview write. */
	function computedValue(element, property) {
		return element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue(property).trim() ?? "";
	}
	function previewStyle(patch, property, value) {
		const style = styleOf(patch.element);
		if (style === void 0) return;
		if (!patch.originalStyles.has(property)) patch.originalStyles.set(property, {
			value: style.getPropertyValue(property),
			priority: style.getPropertyPriority(property)
		});
		style.setProperty(property, value, "important");
	}
	function restoreStyle(patch, property) {
		const style = styleOf(patch.element);
		const original = patch.originalStyles.get(property);
		if (style === void 0 || original === void 0) return;
		if (original.value === "") style.removeProperty(property);
		else style.setProperty(property, original.value, original.priority);
		patch.originalStyles.delete(property);
	}
	function previewText(patch, value) {
		if (patch.originalText === null) return false;
		patch.originalText.node.data = value;
		return true;
	}
	function restoreText(patch) {
		if (patch.originalText !== null) patch.originalText.node.data = patch.originalText.value;
	}
	function restoreAll(patch) {
		for (const property of [...patch.originalStyles.keys()]) restoreStyle(patch, property);
		restoreText(patch);
	}
	/** Replay committed edits after Cancel or a frame re-anchor. */
	function applyCommitted(patch, changes, textChange) {
		for (const change of changes) previewStyle(patch, change.property, change.after);
		if (textChange !== null && textChange !== void 0) previewText(patch, textChange.after);
	}
	//#endregion
	//#region src/client/element-navigation.ts
	/** Pure DOM navigation used by the host-owned element selector and shortcuts. */
	const NON_REVIEWABLE_TAGS = /* @__PURE__ */ new Set([
		"BASE",
		"HEAD",
		"LINK",
		"META",
		"NOSCRIPT",
		"SCRIPT",
		"STYLE",
		"TEMPLATE",
		"TITLE"
	]);
	/** True when an element belongs in the reviewable page hierarchy. */
	function isReviewableElement(element) {
		if (NON_REVIEWABLE_TAGS.has(element.tagName)) return false;
		return !element.classList.contains("dsh-wv-marker");
	}
	/** Reviewable direct element children in document order. */
	function reviewableChildren(element) {
		return Array.from(element.children).filter(isReviewableElement);
	}
	/** First reviewable child element, or null at a leaf. */
	function firstReviewableChild(element) {
		return reviewableChildren(element)[0] ?? null;
	}
	/** Reviewable parent element, or null above the document element. */
	function reviewableParent(element) {
		const parent = element.parentElement;
		return parent !== null && isReviewableElement(parent) ? parent : null;
	}
	/** Next reviewable sibling element, skipping injected and metadata nodes. */
	function nextReviewableSibling(element) {
		let sibling = element.nextElementSibling;
		while (sibling !== null && !isReviewableElement(sibling)) sibling = sibling.nextElementSibling;
		return sibling;
	}
	/** Previous reviewable sibling element, skipping injected and metadata nodes. */
	function previousReviewableSibling(element) {
		let sibling = element.previousElementSibling;
		while (sibling !== null && !isReviewableElement(sibling)) sibling = sibling.previousElementSibling;
		return sibling;
	}
	/** Resolve one hierarchy movement from an element. */
	function navigateElement(element, action) {
		if (action === "child") return firstReviewableChild(element);
		if (action === "parent") return reviewableParent(element);
		if (action === "previous-sibling") return previousReviewableSibling(element);
		return nextReviewableSibling(element);
	}
	/** The element and all of its reviewable ancestors, including itself. */
	function reviewableAncestors(element) {
		const result = [];
		let current = element;
		while (current !== null && isReviewableElement(current)) {
			result.push(current);
			current = reviewableParent(current);
		}
		return result.reverse();
	}
	/**
	* Serialize a bounded reviewable hierarchy while reserving enough budget for
	* the selected element's ancestor path. Large earlier subtrees can therefore
	* never crowd the current target out of the bridge response.
	*/
	function boundedReviewableTree(current, maxNodes, maxDepth) {
		const nodeLimit = Math.max(1, Math.floor(maxNodes));
		const depthLimit = Math.max(0, Math.floor(maxDepth));
		const path = reviewableAncestors(current).slice(-Math.min(nodeLimit, depthLimit + 1));
		const pathIndex = new Map(path.map((element, index) => [element, index]));
		let remaining = nodeLimit;
		const visitOptional = (element, reserve, depth) => {
			remaining -= 1;
			const children = [];
			if (depth < depthLimit) for (const child of reviewableChildren(element)) {
				if (remaining <= reserve) break;
				children.push(visitOptional(child, reserve, depth + 1));
			}
			return {
				element,
				children
			};
		};
		const visitPath = (element, depth) => {
			remaining -= 1;
			const index = pathIndex.get(element) ?? path.length - 1;
			const pathChild = path[index + 1];
			const mandatoryRemaining = path.length - index - 1;
			const children = [];
			let passedPathChild = false;
			if (depth < depthLimit) for (const child of reviewableChildren(element)) {
				if (child === pathChild) {
					children.push(visitPath(child, depth + 1));
					passedPathChild = true;
					continue;
				}
				const reserve = passedPathChild ? 0 : mandatoryRemaining;
				if (remaining > reserve) children.push(visitOptional(child, reserve, depth + 1));
			}
			return {
				element,
				children
			};
		};
		return visitPath(path[0] ?? current, 0);
	}
	/** Compact tree-row detail data: direct text for leaves, otherwise child count. */
	function elementTreeDetail(element) {
		const children = reviewableChildren(element);
		if (children.length > 0) return {
			kind: "children",
			count: children.length
		};
		const text = (element.textContent ?? "").replace(/\s+/gu, " ").trim();
		if (text === "") return { kind: "empty" };
		return {
			kind: "text",
			text: text.length > 48 ? `${text.slice(0, 47)}…` : text
		};
	}
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
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/utilities-iselement.js
	/**
	* Guard function that checks if provided `input` is an Element.
	*/
	function isElement(input) {
		return typeof input === "object" && input !== null && input.nodeType === Node.ELEMENT_NODE;
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/types.js
	const OPERATOR = {
		NONE: "",
		DESCENDANT: " ",
		CHILD: " > "
	};
	const CSS_SELECTOR_TYPE = {
		id: "id",
		class: "class",
		tag: "tag",
		attribute: "attribute",
		nthchild: "nthchild",
		nthoftype: "nthoftype"
	};
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/utilities-typescript.js
	/**
	* Checks whether value is one of the enum's values.
	*/
	function isEnumValue(haystack, needle) {
		return Object.values(haystack).includes(needle);
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/utilities-messages.js
	const libraryName = "CssSelectorGenerator";
	/**
	* Convenient wrapper for `console.warn` using consistent formatting.
	*/
	function showWarning(id = "unknown problem", ...args) {
		console.warn(`${libraryName}: ${id}`, ...args);
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/utilities-options.js
	const DEFAULT_OPTIONS = {
		selectors: [
			CSS_SELECTOR_TYPE.id,
			CSS_SELECTOR_TYPE.class,
			CSS_SELECTOR_TYPE.tag,
			CSS_SELECTOR_TYPE.attribute
		],
		includeTag: false,
		whitelist: [],
		blacklist: [],
		combineWithinSelector: true,
		combineBetweenSelectors: true,
		root: null,
		maxCombinations: Number.POSITIVE_INFINITY,
		maxCandidates: Number.POSITIVE_INFINITY,
		useScope: false,
		ignoreGeneratedClassNames: false
	};
	/**
	* Makes sure the input is converted to a boolean value.
	*/
	function sanitizeBoolean(input) {
		return !!input;
	}
	/**
	* Makes sure returned value is a list containing only valid selector types.
	* @param input
	*/
	function sanitizeSelectorTypes(input) {
		if (!Array.isArray(input)) return [];
		return input.filter((item) => isEnumValue(CSS_SELECTOR_TYPE, item));
	}
	/**
	* Checks whether provided value is of type RegExp.
	*/
	function isRegExp(input) {
		return input instanceof RegExp;
	}
	/**
	* Checks whether provided value is usable in whitelist or blacklist.
	* @param input
	*/
	function isCssSelectorMatch(input) {
		return ["string", "function"].includes(typeof input) || isRegExp(input);
	}
	/**
	* Converts input to a list of valid values for whitelist or blacklist.
	*/
	function sanitizeCssSelectorMatchList(input) {
		if (!Array.isArray(input)) return [];
		return input.filter(isCssSelectorMatch);
	}
	/**
	* Checks whether provided value is valid Node.
	* Uses nodeType check instead of instanceof to work across iframe boundaries.
	*/
	function isNode(input) {
		return input != null && typeof input === "object" && "nodeType" in input && typeof input.nodeType === "number";
	}
	/**
	* Checks whether provided value is valid ParentNode.
	*/
	function isParentNode(input) {
		const validParentNodeTypes = [
			Node.DOCUMENT_NODE,
			Node.DOCUMENT_FRAGMENT_NODE,
			Node.ELEMENT_NODE
		];
		return isNode(input) && validParentNodeTypes.includes(input.nodeType);
	}
	/**
	* Makes sure that the root node in options is valid.
	*/
	function sanitizeRoot(input, element) {
		if (isParentNode(input)) {
			if (!input.contains(element)) showWarning("element root mismatch", "Provided root does not contain the element. This will most likely result in producing a fallback selector using element's real root node. If you plan to use the selector using provided root (e.g. `root.querySelector`), it will not work as intended.");
			return input;
		}
		const rootNode = element.getRootNode({ composed: false });
		if (isParentNode(rootNode)) {
			if (rootNode !== document) showWarning("shadow root inferred", "You did not provide a root and the element is a child of Shadow DOM. This will produce a selector using ShadowRoot as a root. If you plan to use the selector using document as a root (e.g. `document.querySelector`), it will not work as intended.");
			return rootNode;
		}
		return getRootNode(element);
	}
	/**
	* Makes sure that the output is a number, usable as `maxResults` option in
	* powerset generator.
	*/
	function sanitizeMaxNumber(input) {
		return typeof input === "number" ? input : Number.POSITIVE_INFINITY;
	}
	/**
	* Makes sure the options object contains all required keys.
	*/
	function sanitizeOptions(element, custom_options = {}) {
		const options = Object.assign(Object.assign({}, DEFAULT_OPTIONS), custom_options);
		return {
			selectors: sanitizeSelectorTypes(options.selectors),
			whitelist: sanitizeCssSelectorMatchList(options.whitelist),
			blacklist: sanitizeCssSelectorMatchList(options.blacklist),
			root: sanitizeRoot(options.root, element),
			combineWithinSelector: sanitizeBoolean(options.combineWithinSelector),
			combineBetweenSelectors: sanitizeBoolean(options.combineBetweenSelectors),
			includeTag: sanitizeBoolean(options.includeTag),
			maxCombinations: sanitizeMaxNumber(options.maxCombinations),
			maxCandidates: sanitizeMaxNumber(options.maxCandidates),
			useScope: sanitizeBoolean(options.useScope),
			maxResults: sanitizeMaxNumber(options.maxResults),
			ignoreGeneratedClassNames: sanitizeBoolean(options.ignoreGeneratedClassNames)
		};
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/utilities-data.js
	/**
	* Creates array containing only items included in all input arrays.
	*/
	function getIntersection(items = []) {
		const [firstItem = [], ...otherItems] = items;
		if (otherItems.length === 0) return firstItem;
		return otherItems.reduce((accumulator, currentValue) => {
			return accumulator.filter((item) => currentValue.includes(item));
		}, firstItem);
	}
	/**
	* Converts array of arrays into a flat array.
	*/
	function flattenArray(input) {
		return [].concat(...input);
	}
	/**
	* Convert string that can contain wildcards (asterisks) to RegExp source.
	*/
	function wildcardToRegExp(input) {
		return input.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replace(/\*/g, ".+");
	}
	/**
	* Creates function that will test list of provided matchers against input.
	* Used for white/blacklist functionality.
	*/
	function createPatternMatcher(list) {
		const matchFunctions = list.map((item) => {
			if (isRegExp(item)) return (input) => item.test(input);
			if (typeof item === "function") return (input) => {
				const result = item(input);
				if (typeof result !== "boolean") {
					showWarning("pattern matcher function invalid", "Provided pattern matching function does not return boolean. It's result will be ignored.", item);
					return false;
				}
				return result;
			};
			if (typeof item === "string") {
				const re = new RegExp("^" + wildcardToRegExp(item) + "$");
				return (input) => re.test(input);
			}
			showWarning("pattern matcher invalid", "Pattern matching only accepts strings, regular expressions and/or functions. This item is invalid and will be ignored.", item);
			return () => false;
		});
		return (input) => matchFunctions.some((matchFunction) => matchFunction(input));
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/utilities-dom.js
	/**
	* Check whether element is matched uniquely by selector.
	*/
	function testSelector(elements, selector, root) {
		const result = Array.from(sanitizeRoot(root, elements[0]).querySelectorAll(selector));
		return result.length === elements.length && elements.every((element) => result.includes(element));
	}
	/**
	* Find all parents of a single element.
	*/
	function getElementParents(element, root) {
		root = root !== null && root !== void 0 ? root : getRootNode(element);
		const result = [];
		let parent = element;
		while (parent && parent !== root) {
			if (isElement(parent)) result.push(parent);
			parent = parent.parentNode;
		}
		return result;
	}
	/**
	* Find all common parents of elements.
	*/
	function getParents(elements, root) {
		return getIntersection(elements.map((element) => getElementParents(element, root)));
	}
	/**
	* Returns root node for given element. This needs to be used because of document-less environments, e.g. jsdom.
	*/
	function getRootNode(element) {
		return element.ownerDocument.querySelector(":root");
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/constants.js
	const INVALID_ID_RE = new RegExp(["^$", "\\s"].join("|"));
	const INVALID_CLASS_RE = new RegExp(["^$"].join("|"));
	const SELECTOR_PATTERN = [
		CSS_SELECTOR_TYPE.nthoftype,
		CSS_SELECTOR_TYPE.tag,
		CSS_SELECTOR_TYPE.id,
		CSS_SELECTOR_TYPE.class,
		CSS_SELECTOR_TYPE.attribute,
		CSS_SELECTOR_TYPE.nthchild
	];
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/selector-attribute.js
	const attributeBlacklistMatch = createPatternMatcher([
		"class",
		"id",
		"ng-*"
	]);
	/**
	* Get simplified attribute selector for an element.
	*/
	function attributeNodeToSimplifiedSelector({ name }) {
		return `[${name}]`;
	}
	/**
	* Get attribute selector for an element.
	*/
	function attributeNodeToSelector({ name, value }) {
		return `[${name}='${value}']`;
	}
	/**
	* Checks whether an attribute should be used as a selector.
	*/
	function isValidAttributeNode({ nodeName, nodeValue }, element) {
		const tagName = element.tagName.toLowerCase();
		if (["input", "option"].includes(tagName) && nodeName === "value") return false;
		if (nodeName === "src" && (nodeValue === null || nodeValue === void 0 ? void 0 : nodeValue.startsWith("data:"))) return false;
		return !attributeBlacklistMatch(nodeName);
	}
	/**
	* Sanitize all attribute data. We want to do it once, before we start to generate simplified/full selectors from the same data.
	*/
	function sanitizeAttributeData({ nodeName, nodeValue }) {
		return {
			name: sanitizeSelectorItem(nodeName),
			value: sanitizeSelectorItem(nodeValue !== null && nodeValue !== void 0 ? nodeValue : void 0)
		};
	}
	/**
	* Get attribute selectors for an element.
	*/
	function getElementAttributeSelectors(element, _options) {
		const validAttributes = Array.from(element.attributes).filter((attributeNode) => isValidAttributeNode(attributeNode, element)).map(sanitizeAttributeData);
		return [...validAttributes.map(attributeNodeToSimplifiedSelector), ...validAttributes.map(attributeNodeToSelector)];
	}
	/**
	* Get attribute selectors matching all elements.
	*/
	function getAttributeSelectors(elements, options) {
		return getIntersection(elements.map((el) => getElementAttributeSelectors(el, options)));
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/selector-class.js
	const WORD_LIKE_PATTERN = /^[a-z_-]{3,}$/i;
	const CONSONANT_PATTERN = /[bcdfghjklmnpqrstvwxyz]{4,}/i;
	/**
	* Checks if a class name appears to be human-readable (word-like)
	* rather than a generated hash from CSS-in-JS libraries.
	*
	* Heuristics:
	* 1. Must match basic pattern: letters, hyphens, and underscores, at least 3 chars
	* 2. Split on hyphens, underscores (one or more), or camelCase boundaries
	* 3. Each word segment must be > 2 characters
	* 4. No word can have 4+ consecutive consonants
	*
	* Examples:
	* - Word-like: "button", "nav", "nav-container", "userProfile", "block__element--modifier"
	* - Generated: "css-abc123", "sc-xyz", "abc", "xyz", "button_primary" (single underscore)
	*/
	function isWordLikeClassName(className) {
		if (!WORD_LIKE_PATTERN.test(className)) return false;
		if (className.includes("_") && !className.includes("__")) return false;
		if (/^(css|sc|jsx|emotion|makeStyles|MuiButton|MuiBox)-/i.test(className)) return false;
		const words = className.split(/--|__|[-]|(?<=[a-z])(?=[A-Z])/).filter((word) => word.length > 0);
		if (words.length === 0) return false;
		if (words.length === 1 && words[0].length < 4) return false;
		for (const word of words) {
			if (word.length <= 2) return false;
			if (CONSONANT_PATTERN.test(word)) return false;
		}
		return true;
	}
	/**
	* Get class selectors for an element.
	*/
	function getElementClassSelectors(element, options) {
		var _a;
		const classNames = ((_a = element.getAttribute("class")) !== null && _a !== void 0 ? _a : "").trim().split(/\s+/).filter((item) => !INVALID_CLASS_RE.test(item));
		let filteredClassNames = classNames;
		if (options === null || options === void 0 ? void 0 : options.ignoreGeneratedClassNames) {
			const matchWhitelist = createPatternMatcher(options.whitelist);
			filteredClassNames = classNames.filter((className) => {
				const selector = `.${sanitizeSelectorItem(className)}`;
				if (matchWhitelist(selector)) return true;
				return isWordLikeClassName(className);
			});
		}
		return filteredClassNames.map((item) => `.${sanitizeSelectorItem(item)}`);
	}
	/**
	* Get class selectors matching all elements.
	*/
	function getClassSelectors(elements, options) {
		return getIntersection(elements.map((el) => getElementClassSelectors(el, options)));
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/selector-id.js
	/**
	* Get ID selector for an element.
	* */
	function getElementIdSelectors(element, _options) {
		var _a;
		const id = (_a = element.getAttribute("id")) !== null && _a !== void 0 ? _a : "";
		const selector = `#${sanitizeSelectorItem(id)}`;
		const rootNode = element.getRootNode({ composed: false });
		return !INVALID_ID_RE.test(id) && testSelector([element], selector, rootNode) ? [selector] : [];
	}
	/**
	* Get ID selector for an element.
	*/
	function getIdSelector(elements, options) {
		return elements.length === 0 || elements.length > 1 ? [] : getElementIdSelectors(elements[0], options);
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/selector-nth-child.js
	/**
	* Get nth-child selector for an element.
	*/
	function getElementNthChildSelector(element, _options) {
		const parent = element.parentNode;
		const siblings = parent && "children" in parent ? parent.children : null;
		if (siblings) {
			for (let i = 0; i < siblings.length; i++) if (siblings[i] === element) return [`:nth-child(${String(i + 1)})`];
		}
		return [];
	}
	/**
	* Get nth-child selector matching all elements.
	*/
	function getNthChildSelector(elements, options) {
		return getIntersection(elements.map((el) => getElementNthChildSelector(el, options)));
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/selector-tag.js
	/**
	* Get tag selector for an element.
	*/
	function getElementTagSelectors(element, _options) {
		return [sanitizeSelectorItem(element.tagName.toLowerCase())];
	}
	/**
	* Get tag selector for list of elements.
	*/
	function getTagSelector(elements, options) {
		const selectors = [...new Set(flattenArray(elements.map((el) => getElementTagSelectors(el, options))))];
		return selectors.length === 0 || selectors.length > 1 ? [] : [selectors[0]];
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/selector-nth-of-type.js
	/**
	* Get nth-of-type selector for an element.
	*/
	function getElementNthOfTypeSelector(element, _options) {
		const tag = getTagSelector([element])[0];
		const parent = element.parentNode;
		const parentElement = parent && "children" in parent ? parent : null;
		if (parentElement) {
			const elementIndex = Array.from(parentElement.children).filter((element) => element.tagName.toLowerCase() === tag).indexOf(element);
			if (elementIndex > -1) return [`${tag}:nth-of-type(${String(elementIndex + 1)})`];
		}
		return [];
	}
	/**
	* Get Nth-of-type selector matching all elements.
	*/
	function getNthOfTypeSelector(elements, options) {
		return getIntersection(elements.map((el) => getElementNthOfTypeSelector(el, options)));
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/utilities-powerset.js
	function* powerSetGenerator(input = [], { maxResults = Number.POSITIVE_INFINITY } = {}) {
		let resultCounter = 0;
		let offsets = generateOffsets(1);
		while (offsets.length <= input.length && resultCounter < maxResults) {
			resultCounter += 1;
			yield offsets.map((offset) => input[offset]);
			offsets = bumpOffsets(offsets, input.length - 1);
		}
	}
	/**
	* Generates power set of input items.
	*/
	function getPowerSet(input = [], { maxResults = Number.POSITIVE_INFINITY } = {}) {
		return Array.from(powerSetGenerator(input, { maxResults }));
	}
	/**
	* Helper function used by `getPowerSet`. Updates internal pointers.
	*/
	function bumpOffsets(offsets = [], maxValue = 0) {
		const size = offsets.length;
		if (size === 0) return [];
		const result = [...offsets];
		result[size - 1] += 1;
		for (let index = size - 1; index >= 0; index--) if (result[index] > maxValue) if (index === 0) return generateOffsets(size + 1);
		else {
			result[index - 1]++;
			result[index] = result[index - 1] + 1;
		}
		if (result[size - 1] > maxValue) return generateOffsets(size + 1);
		return result;
	}
	/**
	* Generates array of size N, filled with numbers sequence starting from 0.
	*/
	function generateOffsets(size = 1) {
		return Array.from(Array(size).keys());
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/utilities-cartesian.js
	/**
	* Generates cartesian product out of input object.
	*/
	function* cartesianProductGenerator(input = {}) {
		const entries = Object.entries(input);
		if (entries.length === 0) return;
		const stack = [{
			index: entries.length - 1,
			partial: {}
		}];
		while (stack.length > 0) {
			const item = stack.pop();
			if (!item) break;
			const { index, partial } = item;
			if (index < 0) {
				yield partial;
				continue;
			}
			const [key, values] = entries[index];
			for (let i = values.length - 1; i >= 0; i--) stack.push({
				index: index - 1,
				partial: Object.assign(Object.assign({}, partial), { [key]: values[i] })
			});
		}
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/utilities-selectors.js
	const ESCAPED_COLON = ":".charCodeAt(0).toString(16).toUpperCase();
	const SPECIAL_CHARACTERS_RE = /[ !"#$%&'()\[\]{|}<>*+,./;=?@^`~\\]/;
	/**
	* Escapes special characters used by CSS selector items.
	*/
	function sanitizeSelectorItem(input = "") {
		return CSS ? CSS.escape(input) : legacySanitizeSelectorItem(input);
	}
	/**
	* Legacy version of escaping utility, originally used for IE11-. Should
	* probably be replaced by a polyfill:
	* https://github.com/mathiasbynens/CSS.escape
	*/
	function legacySanitizeSelectorItem(input = "") {
		return input.split("").map((character) => {
			if (character === ":") return `\\${ESCAPED_COLON} `;
			if (SPECIAL_CHARACTERS_RE.test(character)) return `\\${character}`;
			return escape(character).replace(/%/g, "\\");
		}).join("");
	}
	const SELECTOR_TYPE_GETTERS = {
		tag: getTagSelector,
		id: getIdSelector,
		class: getClassSelectors,
		attribute: getAttributeSelectors,
		nthchild: getNthChildSelector,
		nthoftype: getNthOfTypeSelector
	};
	const ELEMENT_SELECTOR_TYPE_GETTERS = {
		tag: getElementTagSelectors,
		id: getElementIdSelectors,
		class: getElementClassSelectors,
		attribute: getElementAttributeSelectors,
		nthchild: getElementNthChildSelector,
		nthoftype: getElementNthOfTypeSelector
	};
	/**
	* Creates selector of given type for single element.
	*/
	function getElementSelectorsByType(element, selectorType, options) {
		return ELEMENT_SELECTOR_TYPE_GETTERS[selectorType](element, options);
	}
	/**
	* Returns list of selectors of given type for the element.
	*/
	function getSelectorsByType(elements, selector_type, options) {
		const getter = SELECTOR_TYPE_GETTERS[selector_type];
		return getter(elements, options);
	}
	/**
	* Remove blacklisted selectors from list.
	*/
	function filterSelectors(list = [], matchBlacklist, matchWhitelist) {
		return list.filter((item) => matchWhitelist(item) || !matchBlacklist(item));
	}
	/**
	* Prioritise whitelisted selectors in list.
	*/
	function orderSelectors(list = [], matchWhitelist) {
		return list.sort((a, b) => {
			const a_is_whitelisted = matchWhitelist(a);
			const b_is_whitelisted = matchWhitelist(b);
			if (a_is_whitelisted && !b_is_whitelisted) return -1;
			if (!a_is_whitelisted && b_is_whitelisted) return 1;
			return 0;
		});
	}
	/**
	* Yields list of unique selectors applicable to given element.
	*/
	function* allSelectorsGenerator(elements, options) {
		const yieldedSelectors = /* @__PURE__ */ new Set();
		const selectors_list = getSelectorsList(elements, options);
		for (const selector of selectorTypeCombinationsGenerator(selectors_list, options)) if (!yieldedSelectors.has(selector)) {
			yieldedSelectors.add(selector);
			yield selector;
		}
	}
	/**
	* Creates object containing all selector types and their potential values.
	*/
	function getSelectorsList(elements, options) {
		const { blacklist, whitelist, combineWithinSelector, maxCombinations } = options;
		const matchBlacklist = createPatternMatcher(blacklist);
		const matchWhitelist = createPatternMatcher(whitelist);
		const reducer = (data, selector_type) => {
			const found_selectors = orderSelectors(filterSelectors(getSelectorsByType(elements, selector_type, options), matchBlacklist, matchWhitelist), matchWhitelist);
			data[selector_type] = combineWithinSelector ? Array.from(powerSetGenerator(found_selectors, { maxResults: maxCombinations })) : found_selectors.map((item) => [item]);
			return data;
		};
		return getSelectorsToGet(options).reduce(reducer, {});
	}
	/**
	* Creates list of selector types that we will need to generate the selector.
	*/
	function getSelectorsToGet(options) {
		const { selectors, includeTag } = options;
		const selectors_to_get = [...selectors];
		if (includeTag && !selectors_to_get.includes("tag")) selectors_to_get.push("tag");
		return selectors_to_get;
	}
	/**
	* Adds "tag" to a list, if it does not contain it. Used to modify selectors
	* list when includeTag option is enabled to make sure all results contain the
	* TAG part.
	*/
	function addTagTypeIfNeeded(list) {
		return list.includes(CSS_SELECTOR_TYPE.tag) || list.includes(CSS_SELECTOR_TYPE.nthoftype) ? [...list] : [...list, CSS_SELECTOR_TYPE.tag];
	}
	/**
	* Generates list of possible selector type combinations.
	*/
	function combineSelectorTypes(options) {
		const { selectors, combineBetweenSelectors, includeTag, maxCandidates } = options;
		const combinations = combineBetweenSelectors ? getPowerSet(selectors, { maxResults: maxCandidates }) : selectors.map((item) => [item]);
		return includeTag ? combinations.map(addTagTypeIfNeeded) : combinations;
	}
	/**
	* Generates list of combined CSS selectors.
	*/
	function* selectorTypeCombinationsGenerator(selectors_list, options) {
		for (const item of combineSelectorTypes(options)) yield* constructedSelectorsGenerator(item, selectors_list);
	}
	/**
	* Generates all variations of possible selectors from provided data.
	*/
	function* constructedSelectorsGenerator(selector_types, selectors_by_type) {
		const data = {};
		for (const selector_type of selector_types) {
			const selector_variants = selectors_by_type[selector_type];
			if (selector_variants && selector_variants.length > 0) data[selector_type] = selector_variants;
		}
		for (const combination of cartesianProductGenerator(data)) yield constructSelector(combination);
	}
	/**
	* Creates selector for given selector type. Combines several parts if needed.
	*/
	function constructSelectorType(selector_type, selectors_data) {
		return selectors_data[selector_type] ? selectors_data[selector_type].join("") : "";
	}
	/**
	* Converts selector data object to a selector.
	*/
	function constructSelector(selectorData = {}) {
		const pattern = [...SELECTOR_PATTERN];
		if (selectorData[CSS_SELECTOR_TYPE.tag] && selectorData[CSS_SELECTOR_TYPE.nthoftype]) pattern.splice(pattern.indexOf(CSS_SELECTOR_TYPE.tag), 1);
		return pattern.map((type) => constructSelectorType(type, selectorData)).join("");
	}
	/**
	* Generates combinations of child and descendant selectors within root
	* selector.
	*/
	function generateCandidateCombinations(selectors, rootSelector) {
		return [...selectors.map((selector) => rootSelector + OPERATOR.DESCENDANT + selector), ...selectors.map((selector) => rootSelector + OPERATOR.CHILD + selector)];
	}
	/**
	* Generates a list of selector candidates that can potentially match target
	* element.
	*/
	function* candidatesGenerator(selectors, rootSelector) {
		if (rootSelector === "") yield* selectors;
		else for (const selector of selectors) yield* generateCandidateCombinations([selector], rootSelector);
	}
	/**
	* Tries to find unique CSS selectors for element within given parent.
	*/
	function* selectorWithinRootGenerator(elements, root, rootSelector = "", options) {
		const elementSelectorsIterator = allSelectorsGenerator(elements, options);
		for (const candidateSelector of candidatesGenerator(elementSelectorsIterator, rootSelector)) if (testSelector(elements, candidateSelector, root)) yield candidateSelector;
	}
	/**
	* Climbs through parents of the element and finds the ones that are identifiable by unique CSS selector.
	*/
	function* closestIdentifiableParentGenerator(elements, root, rootSelector = "", options) {
		if (elements.length === 0) return null;
		const candidatesList = [elements.length > 1 ? elements : [], ...getParents(elements, root).map((element) => [element])];
		for (const currentElements of candidatesList) for (const selectorWithinRoot of selectorWithinRootGenerator(currentElements, root, rootSelector, options)) yield {
			foundElements: currentElements,
			selector: selectorWithinRoot
		};
	}
	/**
	* Recursively travels through parents, finds the ones that are identifiable and then tries to find a unique selector within that context.
	*/
	function* selectorGenerator({ elements, root, rootSelector = "", options }) {
		let currentRoot = root;
		let partialSelector = rootSelector;
		let shouldContinue = true;
		while (shouldContinue) {
			let foundAny = false;
			for (const item of closestIdentifiableParentGenerator(elements, currentRoot, partialSelector, options)) {
				const { foundElements, selector } = item;
				foundAny = true;
				if (testSelector(elements, selector, root)) yield selector;
				else {
					currentRoot = foundElements[0];
					partialSelector = selector;
					break;
				}
			}
			if (!foundAny) shouldContinue = false;
		}
	}
	/**
	* Converts input into list of elements, removing duplicates and non-elements.
	*/
	function sanitizeSelectorNeedle(needle) {
		if (needle instanceof NodeList || needle instanceof HTMLCollection) needle = Array.from(needle);
		const elements = (Array.isArray(needle) ? needle : [needle]).filter(isElement);
		return [...new Set(elements)];
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/utilities-element-data.js
	/**
	* Creates data describing a specific selector.
	*/
	function createElementSelectorData(selector) {
		return {
			value: selector,
			include: false
		};
	}
	/**
	* Creates data describing an element within CssSelector chain.
	*/
	function createElementData(element, selectorTypes, operator = OPERATOR.NONE) {
		const selectors = {};
		selectorTypes.forEach((selectorType) => {
			Reflect.set(selectors, selectorType, getElementSelectorsByType(element, selectorType).map(createElementSelectorData));
		});
		return {
			element,
			operator,
			selectors
		};
	}
	/**
	* Constructs selector from element data.
	*/
	function constructElementSelector({ selectors, operator }) {
		let pattern = [...SELECTOR_PATTERN];
		if (selectors[CSS_SELECTOR_TYPE.tag] && selectors[CSS_SELECTOR_TYPE.nthoftype]) pattern = pattern.filter((item) => item !== CSS_SELECTOR_TYPE.tag);
		let selector = "";
		pattern.forEach((selectorType) => {
			var _a;
			((_a = selectors[selectorType]) !== null && _a !== void 0 ? _a : []).forEach(({ value, include }) => {
				if (include) selector += value;
			});
		});
		return operator + selector;
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/selector-fallback.js
	/**
	* Creates fallback selector for single element.
	*/
	function getElementFallbackSelector(element, root) {
		const parentElements = getElementParents(element, root).reverse();
		const isShadowRoot = root instanceof ShadowRoot;
		const elementsData = parentElements.map((element, index) => {
			var _a;
			const elementData = createElementData(element, [CSS_SELECTOR_TYPE.nthchild], isShadowRoot && index === 0 ? OPERATOR.NONE : OPERATOR.CHILD);
			((_a = elementData.selectors.nthchild) !== null && _a !== void 0 ? _a : []).forEach((selectorData) => {
				selectorData.include = true;
			});
			return elementData;
		});
		return [isShadowRoot ? "" : root ? ":scope" : ":root", ...elementsData.map(constructElementSelector)].join("");
	}
	/**
	* Creates chain of :nth-child selectors from root to the elements.
	*/
	function getFallbackSelector(elements, root) {
		return elements.map((element) => getElementFallbackSelector(element, root)).join(", ");
	}
	//#endregion
	//#region ../../node_modules/.pnpm/css-selector-generator@3.9.2/node_modules/css-selector-generator/esm/index.js
	var __rest = function(s, e) {
		var t = {};
		for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
		if (s != null && typeof Object.getOwnPropertySymbols === "function") {
			for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i])) t[p[i]] = s[p[i]];
		}
		return t;
	};
	/**
	* Generates unique CSS selector for an element.
	*/
	function getCssSelector(needle, custom_options = {}) {
		return cssSelectorGenerator(needle, Object.assign(Object.assign({}, custom_options), { maxResults: 1 })).next().value;
	}
	/**
	* Generates unique CSS selector for an element.
	*/
	function* cssSelectorGenerator(needle, custom_options = {}) {
		var _a;
		const elements = sanitizeSelectorNeedle(needle);
		const options = sanitizeOptions(elements[0], custom_options);
		const root = (_a = options.root) !== null && _a !== void 0 ? _a : getRootNode(elements[0]);
		let foundResults = 0;
		for (const selector of selectorGenerator({
			elements,
			options,
			root,
			rootSelector: ""
		})) {
			yield selector;
			foundResults++;
			if (foundResults >= options.maxResults) return;
		}
		if (elements.length > 1) {
			const { maxResults: _ignored } = custom_options, elementOptions = __rest(custom_options, ["maxResults"]);
			yield elements.map((element) => getCssSelector(element, elementOptions)).join(", ");
			foundResults++;
			if (foundResults >= options.maxResults) return;
		}
		const rootWasProvided = custom_options.root !== void 0;
		yield getFallbackSelector(elements, options.useScope || rootWasProvided ? root : void 0);
	}
	//#endregion
	//#region src/client/source-anchor.ts
	/**
	* Framework-agnostic source-anchor extraction: given a live DOM element,
	* probe the framework metadata every major UI framework leaves on it and
	* resolve the SOURCE location (file + line + component) that produced it.
	*
	* The probe order is by framework: React (dev-mode fiber `_debugSource`),
	* Vue 3 (`__vueParentComponent.type.__file`), Vue 2 (`__vue__.$options.__file`),
	* Svelte 5 (`__svelte_meta.loc`), then null. Everything here is defensive:
	* the metadata shapes are framework internals, so every read is
	* try/catch-guarded and the function never throws — unknown frameworks and
	* production builds simply resolve to null (the caller falls back to
	* text/class/path identity).
	*
	* The page DOM is untrusted data, read-only — this module never writes into
	* the page.
	*/
	/** Framework-internal fiber names React attaches to DOM elements. */
	const REACT_FIBER_KEYS = ["__reactFiber$", "__reactInternalInstance$"];
	/** Framework-internal components that are not user code (noise in the chain). */
	const SKIP_COMPONENTS = /* @__PURE__ */ new Set([
		"ClientPageRoot",
		"LinkComponent",
		"ServerComponent",
		"AppRouter",
		"Router",
		"HotReload",
		"ReactDevOverlay",
		"InnerLayoutRouter",
		"OuterLayoutRouter",
		"RedirectBoundary",
		"NotFoundBoundary",
		"ErrorBoundary",
		"LoadingBoundary",
		"TemplateContext",
		"ScrollAndFocusHandler",
		"RenderFromTemplateContext",
		"PathnameContextProviderAdapter",
		"Hot",
		"Inner",
		"Forward",
		"Root"
	]);
	/** Framework chains are untrusted and may be cyclic or maliciously deep. */
	const MAX_METADATA_DEPTH = 100;
	function isUserComponent(name) {
		return name !== void 0 && name.length >= 2 && /^[A-Z]/.test(name) && !name.startsWith("_") && !SKIP_COMPONENTS.has(name);
	}
	/** Relativize an absolute source path to the project (src/...). */
	function relativizeFile(fileName) {
		const normalized = fileName.replace(/\\/g, "/");
		return normalized.match(/(?:^|\/)(src\/.*)/u)?.[1] ?? normalized;
	}
	function truncate$1(value, cap) {
		if (value.length <= cap) return value;
		return `${value.slice(0, cap - 1)}…`;
	}
	/** Read a framework-internal property defensively (never throws). */
	function readMeta(get) {
		try {
			return get();
		} catch {
			return;
		}
	}
	function isObjectLike(value) {
		return typeof value === "object" && value !== null || typeof value === "function";
	}
	function propertyOf(value, key) {
		if (!isObjectLike(value)) return void 0;
		return readMeta(() => Reflect.get(value, key));
	}
	function stringOf(value, allowEmpty = false) {
		if (typeof value !== "string" || !allowEmpty && value.length === 0) return void 0;
		return value;
	}
	function lineOf(value) {
		return Number.isSafeInteger(value) && value > 0 ? value : void 0;
	}
	/** Walk a React-style return chain once, bounded and cycle-safe. */
	function walkFiber(start, visit) {
		const seen = /* @__PURE__ */ new WeakSet();
		let current = start;
		for (let depth = 0; depth < MAX_METADATA_DEPTH && isObjectLike(current); depth += 1) {
			if (seen.has(current)) return;
			seen.add(current);
			if (!visit(current)) return;
			current = propertyOf(current, "return");
		}
	}
	/** React (dev mode): walk the fiber chain for `_debugSource` and user components. */
	function reactAnchor(el) {
		const fiberKey = (readMeta(() => Object.keys(el)) ?? []).find((key) => REACT_FIBER_KEYS.some((prefix) => key.startsWith(prefix)));
		if (fiberKey === void 0) return null;
		const fiber = propertyOf(el, fiberKey);
		if (!isObjectLike(fiber)) return null;
		let source;
		walkFiber(fiber, (node) => {
			const candidate = propertyOf(node, "_debugSource");
			if (candidate === void 0 || candidate === null) return true;
			source = candidate;
			return false;
		});
		const fileName = stringOf(propertyOf(source, "fileName"));
		if (fileName === void 0) return null;
		const components = [];
		walkFiber(fiber, (node) => {
			const type = propertyOf(node, "type");
			const name = stringOf(propertyOf(type, "displayName")) ?? stringOf(propertyOf(type, "name"));
			if (isUserComponent(name) && !components.includes(name)) components.push(name);
			return components.length < 3;
		});
		const line = lineOf(propertyOf(source, "lineNumber"));
		return {
			framework: "react",
			component: truncate$1(components.reverse().join(" › ") || "Unknown", PREVIEW_ELEMENT_LIMITS.anchorComponent),
			file: truncate$1(relativizeFile(fileName), PREVIEW_ELEMENT_LIMITS.anchorFile),
			...line !== void 0 ? { line } : {}
		};
	}
	/** Vue 3 (`__vueParentComponent`): component `type.__file` carries the SFC path. */
	function vue3Anchor(el) {
		const type = propertyOf(propertyOf(el, "__vueParentComponent"), "type");
		const file = stringOf(propertyOf(type, "__file"));
		if (file === void 0) return null;
		return {
			framework: "vue",
			component: truncate$1(stringOf(propertyOf(type, "name")) ?? stringOf(propertyOf(type, "__name")) ?? "Unknown", PREVIEW_ELEMENT_LIMITS.anchorComponent),
			file: truncate$1(relativizeFile(file), PREVIEW_ELEMENT_LIMITS.anchorFile)
		};
	}
	/** Vue 2 (`__vue__`): `$options.__file` carries the SFC path. */
	function vue2Anchor(el) {
		const options = propertyOf(propertyOf(el, "__vue__"), "$options");
		const file = stringOf(propertyOf(options, "__file"));
		if (file === void 0) return null;
		return {
			framework: "vue",
			component: truncate$1(stringOf(propertyOf(options, "name")) ?? "Unknown", PREVIEW_ELEMENT_LIMITS.anchorComponent),
			file: truncate$1(relativizeFile(file), PREVIEW_ELEMENT_LIMITS.anchorFile)
		};
	}
	/** Svelte 5 (dev mode): `__svelte_meta.loc` carries the source location. */
	function svelteAnchor(el) {
		const loc = propertyOf(propertyOf(el, "__svelte_meta"), "loc");
		const file = stringOf(propertyOf(loc, "file"));
		if (file === void 0) return null;
		const base = file.replace(/\\/g, "/").split("/").pop() ?? file;
		const line = lineOf(propertyOf(loc, "line"));
		return {
			framework: "svelte",
			component: truncate$1(base.replace(/\.svelte$/i, ""), PREVIEW_ELEMENT_LIMITS.anchorComponent),
			file: truncate$1(relativizeFile(file), PREVIEW_ELEMENT_LIMITS.anchorFile),
			...line !== void 0 ? { line } : {}
		};
	}
	/**
	* Resolve the source anchor for a live element, framework-agnostically.
	* Returns null for unknown frameworks, production builds, and non-component
	* elements — the caller then falls back to text/class/path identity.
	* @param el - the element (untrusted page DOM, read-only).
	*/
	function sourceAnchorOf(el) {
		return readMeta(() => reactAnchor(el)) ?? readMeta(() => vue3Anchor(el)) ?? readMeta(() => vue2Anchor(el)) ?? readMeta(() => svelteAnchor(el)) ?? null;
	}
	//#endregion
	//#region src/client/picker-core.ts
	/**
	* Picker core: snapshot capture helpers for picked elements (browser half).
	*
	* The CSS-selector path is delegated to `css-selector-generator` (id →
	* class → tag → nth-of-type priority, shortest unique selector); everything
	* else here is a thin wrapper over native DOM APIs. These helpers are bundled
	* into the isolated-frame bridge and unit-tested directly.
	*
	* The page DOM is untrusted data, read-only — these helpers never write
	* into the page.
	*
	* Unit tests import this module directly (jsdom).
	*/
	/** Cap for the outerHTML snapshot (exact limit — truncation lands at cap). */
	const OUTER_HTML_CAP = PREVIEW_ELEMENT_LIMITS.outerHTML;
	/** Cap for the textContent snapshot. */
	const TEXT_CAP = PREVIEW_ELEMENT_LIMITS.textContent;
	/** Truncate to `cap` characters (ellipsis included in the cap). */
	function truncate(value, cap) {
		if (value.length <= cap) return value;
		const head = Math.max(0, cap - 1);
		return `${value.slice(0, head)}…`;
	}
	/**
	* Accessible label of an element: aria-label/title/placeholder/alt first,
	* else the visible text — the human-readable identity that also exists as a
	* string literal in source code (and is therefore searchable by the AI).
	*/
	function accessibleLabel(el) {
		const direct = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? el.getAttribute("placeholder") ?? el.getAttribute("alt");
		if (direct !== null && direct.trim() !== "") return truncate(direct.trim(), 48);
		return truncate((el.textContent ?? "").replace(/\s+/g, " ").trim(), 48);
	}
	/** Explicit or implicit ARIA role of an element ('' when none applies). */
	function roleOf(el) {
		const explicit = el.getAttribute("role");
		if (explicit !== null) return truncate(explicit.split(/\s+/)[0] ?? "", PREVIEW_ELEMENT_LIMITS.role);
		const tag = el.tagName.toLowerCase();
		if (tag === "button") return "button";
		if (tag === "a" && el.getAttribute("href") !== null) return "link";
		if (tag === "input") return "textbox";
		if (tag === "select") return "combobox";
		if (tag === "textarea") return "textbox";
		if (/^h[1-6]$/.test(tag)) return "heading";
		if (tag === "img") return "img";
		return "";
	}
	/**
	* Semantic class names: filter out utility classes (layout/spacing/type
	* tokens that are assembled at build time and don't exist verbatim in
	* source), state variants (`hover:`/`focus:`), and fully opaque tokens
	* (css-*, whole-class hex hashes, UUIDs) that are meaningless to search.
	* `<hash>_<name>` CSS-module classes (e.g. `FmkDaG_composeRow`) are kept
	* deliberately: the hash prefix alone would be dropped, but the semantic
	* suffix is a verbatim source class name and a searchable anchor.
	*/
	function stableClassesOf(el) {
		return Array.from(el.classList).filter((cls) => cls.length <= PREVIEW_ELEMENT_LIMITS.stableClass && isStableClass(cls)).slice(0, PREVIEW_ELEMENT_LIMITS.stableClasses);
	}
	const UTILITY_CLASS = /^(?:m[trblxy]?|p[trblxy]?|w|h|min-w|max-w|min-h|max-h|inset|top|right|bottom|left|translate|scale|rotate|text|bg|border|rounded|shadow|ring|opacity|z|flex|grid|gap|space|items|justify|content|self|place|font|leading|tracking)-(?:.+)$/;
	/** Bare utility tokens that never exist verbatim in source (assembled at build time). */
	const BARE_UTILITY = /* @__PURE__ */ new Set([
		"flex",
		"grid",
		"block",
		"inline",
		"inline-flex",
		"inline-block",
		"hidden",
		"relative",
		"absolute",
		"fixed",
		"sticky",
		"static",
		"container"
	]);
	function isStableClass(cls) {
		if (cls.includes(":")) return false;
		if (/^(sm|md|lg|xl|2xl|hover|focus|active|disabled)$/.test(cls)) return false;
		if (cls.startsWith("css-") || /^_?[a-f0-9]{6,}$/i.test(cls)) return false;
		if (/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}/i.test(cls)) return false;
		if (/^dsh-wv-/.test(cls)) return false;
		if (UTILITY_CLASS.test(cls) || BARE_UTILITY.has(cls)) return false;
		return true;
	}
	const SELECTOR_OPTIONS = { selectors: [
		"id",
		"class",
		"tag",
		"nthoftype"
	] };
	/**
	* Build a stable, re-runnable CSS selector for an element: shortest unique
	* selector under the id → class → tag → nth-of-type priority; falls back to
	* the bare tag when the library yields nothing.
	*/
	function cssPath(el) {
		const fallback = truncate(el.tagName.toLowerCase(), PREVIEW_ELEMENT_LIMITS.tagName);
		try {
			const selector = getCssSelector(el, SELECTOR_OPTIONS);
			return selector !== null && selector.length <= PREVIEW_ELEMENT_LIMITS.cssPath ? selector : fallback;
		} catch {
			return fallback;
		}
	}
	/**
	* Full DOM path for an element: the complete ancestor chain as
	* `tag#id.class1.class2:nth-of-type(n)` segments joined by ` > `, with
	* nth-of-type indices only where same-tag siblings compete (ids are unique
	* and never indexed). The plugin's own chrome classes (`dsh-wv-*`, e.g. the
	* pick-mode crosshair marker on `<html>`) are excluded — they are tool
	* state, not page structure. This is the unambiguous page-hierarchy
	* location handed to the AI — the shortest cssPath is optimized for
	* re-querying, not for describing where an element sits.
	*/
	function fullPathOf(el) {
		const parts = [];
		let node = el;
		while (node !== null && node.nodeType === 1) {
			const tag = node.tagName.toLowerCase();
			const id = node.id !== "" ? `#${node.id}` : "";
			const classes = id === "" ? Array.from(node.classList).filter((name) => !name.startsWith("dsh-wv-")).join(".") : "";
			let segment = `${tag}${id}${classes !== "" ? `.${classes}` : ""}`;
			if (node.id === "") {
				const parent = node.parentElement;
				if (parent !== null) {
					let nth = 0;
					const siblings = Array.from(parent.children);
					for (const sibling of siblings) {
						if (sibling.tagName === node.tagName) nth += 1;
						if (sibling === node) break;
					}
					if (nth > 1) segment += `:nth-of-type(${nth})`;
				}
			}
			parts.unshift(segment);
			node = node.parentElement;
		}
		return truncate(parts.join(" > "), PREVIEW_ELEMENT_LIMITS.fullPath);
	}
	/**
	* Snapshot a picked element: exact keys mapped by annotation-snapshot.ts; caps enforced
	* here (OUTER_HTML_CAP / TEXT_CAP).
	* @param el - the picked element (untrusted page DOM, read-only).
	* @returns the snapshot.
	*/
	function snapshotOf(el) {
		const style = window.getComputedStyle(el);
		const rect = el.getBoundingClientRect();
		return {
			tagName: truncate(el.tagName.toLowerCase(), PREVIEW_ELEMENT_LIMITS.tagName),
			id: truncate(el.id, PREVIEW_ELEMENT_LIMITS.id),
			className: truncate(typeof el.className === "string" ? el.className : "", PREVIEW_ELEMENT_LIMITS.className),
			cssPath: cssPath(el),
			fullPath: fullPathOf(el),
			label: accessibleLabel(el),
			role: roleOf(el),
			stableClasses: stableClassesOf(el),
			anchor: sourceAnchorOf(el),
			inToolChrome: el.closest("[data-webview-ui]") !== null,
			outerHTML: truncate(el.outerHTML, OUTER_HTML_CAP),
			textContent: truncate(el.textContent ?? "", TEXT_CAP),
			rect: {
				x: Math.round(rect.x),
				y: Math.round(rect.y),
				width: Math.round(rect.width),
				height: Math.round(rect.height)
			},
			computed: {
				display: truncate(style.display, PREVIEW_ELEMENT_LIMITS.computedValue),
				position: truncate(style.position, PREVIEW_ELEMENT_LIMITS.computedValue),
				fontSize: truncate(style.fontSize, PREVIEW_ELEMENT_LIMITS.computedValue),
				color: truncate(style.color, PREVIEW_ELEMENT_LIMITS.computedValue),
				backgroundColor: truncate(style.backgroundColor, PREVIEW_ELEMENT_LIMITS.computedValue),
				margin: truncate(style.margin, PREVIEW_ELEMENT_LIMITS.computedValue),
				padding: truncate(style.padding, PREVIEW_ELEMENT_LIMITS.computedValue),
				width: truncate(style.width, PREVIEW_ELEMENT_LIMITS.computedValue),
				height: truncate(style.height, PREVIEW_ELEMENT_LIMITS.computedValue)
			}
		};
	}
	//#endregion
	//#region src/bridge/picker-style.ts
	/** Picker chrome injected by the isolated-frame bridge. */
	const PICKER_STYLE = `
[data-dsh-wv-hover] {
  outline: 2px solid #4176e6 !important;
  outline-offset: -2px !important;
  background-color: rgba(65, 118, 230, 0.10) !important;
}
[data-dsh-wv-selected] {
  background-color: rgba(65, 118, 230, 0.10) !important;
}
.dsh-wv-selection-box {
  position: fixed !important;
  z-index: 2147482999 !important;
  box-sizing: border-box !important;
  pointer-events: none !important;
  border: 2px solid #679efe !important;
  border-radius: 6px !important;
  background: transparent !important;
  opacity: 0;
  transition:
    left 180ms cubic-bezier(0.2, 0, 0, 1),
    top 180ms cubic-bezier(0.2, 0, 0, 1),
    width 180ms cubic-bezier(0.2, 0, 0, 1),
    height 180ms cubic-bezier(0.2, 0, 0, 1),
    opacity 100ms ease;
}
.dsh-wv-selection-box[data-visible] { opacity: 1; }
.dsh-wv-selection-box[data-static] { transition: none !important; }
.dsh-wv-picking, .dsh-wv-picking * { cursor: crosshair !important; }
.dsh-wv-marker {
  position: fixed !important;
  z-index: 2147483000 !important;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #4176e6 !important;
  color: #ffffff !important;
  font: 600 11px/18px system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif !important;
  text-align: center;
  cursor: pointer !important;
  user-select: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35) !important;
  transform: translate(-50%, -50%);
}
.dsh-wv-marker:hover { background: #679efe !important; }
@media (prefers-reduced-motion: reduce) {
  .dsh-wv-selection-box {
    transition: opacity 100ms ease !important;
  }
}
`;
	//#endregion
	//#region src/bridge/index.ts
	/** Isolated-frame picker and controlled postMessage bridge. */
	const configOf = (value) => {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
		const record = value;
		if (record.protocol !== "dsh-web-review/bridge" || record.version !== 1 || typeof record.channel !== "string" || !/^[a-f\d]{32}$/u.test(record.channel) || typeof record.parentOrigin !== "string" || typeof record.pageUrl !== "string" || typeof record.targetOrigin !== "string") return void 0;
		try {
			const parent = new URL(record.parentOrigin);
			const page = new URL(record.pageUrl);
			if (parent.origin !== record.parentOrigin || page.origin !== record.targetOrigin) return void 0;
		} catch {
			return;
		}
		return record;
	};
	const parsedConfig = configOf(window.__DSH_WEB_REVIEW_BRIDGE_CONFIG__);
	if (parsedConfig === void 0) throw new Error("dsh-web-review: invalid bridge configuration");
	const config = parsedConfig;
	delete window.__DSH_WEB_REVIEW_BRIDGE_CONFIG__;
	const nativePostMessage = window.postMessage;
	const handles = /* @__PURE__ */ new Map();
	const handlesByElement = /* @__PURE__ */ new WeakMap();
	const patchesByElement = /* @__PURE__ */ new WeakMap();
	const committed = /* @__PURE__ */ new Map();
	const markerChrome = /* @__PURE__ */ new Map();
	let active = null;
	let picking = false;
	let hovered = null;
	let selected = null;
	let selectionBox = null;
	let selectionObserver = null;
	let repositionQueued = false;
	function randomHandle() {
		const values = /* @__PURE__ */ new Uint8Array(12);
		crypto.getRandomValues(values);
		return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
	}
	function handleOf(element) {
		const existing = handlesByElement.get(element);
		if (existing !== void 0) return existing;
		const handle = randomHandle();
		handles.set(handle, element);
		handlesByElement.set(element, handle);
		return handle;
	}
	function patchOf(element) {
		const existing = patchesByElement.get(element);
		if (existing !== void 0) return existing;
		const patch = createLivePatch(element);
		patchesByElement.set(element, patch);
		return patch;
	}
	function rectOf(element) {
		const rect = element.getBoundingClientRect();
		return {
			x: rect.x,
			y: rect.y,
			width: rect.width,
			height: rect.height
		};
	}
	function navigationOf(element) {
		return {
			child: firstReviewableChild(element) !== null,
			parent: reviewableParent(element) !== null,
			"previous-sibling": previousReviewableSibling(element) !== null,
			"next-sibling": nextReviewableSibling(element) !== null
		};
	}
	function targetOf(element) {
		const patch = patchOf(element);
		const baselines = Object.fromEntries(EDITABLE_STYLE_PROPERTIES.map((property) => [property, truncate(baselineValue(patch, property), PREVIEW_ELEMENT_LIMITS.styleValue)]));
		const style = element.style;
		const inlineStyles = {};
		for (const property of EDITABLE_STYLE_PROPERTIES) {
			const value = style?.getPropertyValue(property) ?? "";
			if (value !== "") inlineStyles[property] = {
				value: truncate(value, PREVIEW_ELEMENT_LIMITS.styleValue),
				priority: truncate(style.getPropertyPriority(property), PREVIEW_ELEMENT_LIMITS.stylePriority)
			};
		}
		return {
			handle: handleOf(element),
			snapshot: snapshotOf(element),
			rect: rectOf(element),
			viewport: {
				width: innerWidth,
				height: innerHeight
			},
			baselines,
			inlineStyles,
			originalText: patch.originalText === null ? null : truncate(patch.originalText.value, PREVIEW_ELEMENT_LIMITS.textValue),
			detail: elementTreeDetail(element),
			navigation: navigationOf(element)
		};
	}
	function postEvent(event) {
		const message = {
			protocol: PREVIEW_BRIDGE_PROTOCOL,
			version: 1,
			channel: config.channel,
			direction: "frame-to-host",
			event
		};
		Reflect.apply(nativePostMessage, parent, [message, config.parentOrigin]);
	}
	function postResponse(requestId, response) {
		const message = {
			protocol: PREVIEW_BRIDGE_PROTOCOL,
			version: 1,
			channel: config.channel,
			direction: "frame-to-host",
			requestId,
			response
		};
		Reflect.apply(nativePostMessage, parent, [message, config.parentOrigin]);
	}
	function pageUrl() {
		try {
			if (!location.pathname.startsWith(PREVIEW_ENTRY_PREFIX) && !location.pathname.startsWith(PREVIEW_PROXY_PREFIX)) return new URL(`${location.pathname}${location.search}${location.hash}`, `${config.targetOrigin}/`).href;
			const target = new URL(config.pageUrl);
			if (location.search !== "") target.search = location.search;
			if (location.hash !== "") target.hash = location.hash;
			return target.href;
		} catch {
			return config.pageUrl;
		}
	}
	function historyState() {
		const navigation = window.navigation;
		return {
			canGoBack: navigation?.canGoBack ?? history.length > 1,
			canGoForward: navigation?.canGoForward ?? false
		};
	}
	function postReady() {
		const state = historyState();
		postEvent({
			name: "ready",
			payload: {
				pageUrl: pageUrl(),
				title: document.title.slice(0, 500),
				viewport: {
					width: innerWidth,
					height: innerHeight
				},
				...state
			}
		});
	}
	function isChrome(element) {
		return element?.closest(".dsh-wv-marker,.dsh-wv-selection-box") !== null;
	}
	function clearHover() {
		hovered?.removeAttribute("data-dsh-wv-hover");
		hovered = null;
	}
	function releasePageFocus() {
		const focused = document.activeElement;
		if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
	}
	function ensureSelectionBox() {
		if (selectionBox?.isConnected === true) return selectionBox;
		selectionBox = document.createElement("div");
		selectionBox.className = "dsh-wv-selection-box";
		selectionBox.setAttribute("aria-hidden", "true");
		document.documentElement.appendChild(selectionBox);
		return selectionBox;
	}
	function positionSelection(animate) {
		if (selected === null || !selected.isConnected) {
			selectionBox?.removeAttribute("data-visible");
			return;
		}
		const rect = selected.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) {
			selectionBox?.removeAttribute("data-visible");
			return;
		}
		const box = ensureSelectionBox();
		if (animate) {
			box.removeAttribute("data-static");
			box.getBoundingClientRect();
		} else box.setAttribute("data-static", "");
		box.style.left = `${String(rect.left - 2)}px`;
		box.style.top = `${String(rect.top - 2)}px`;
		box.style.width = `${String(rect.width + 4)}px`;
		box.style.height = `${String(rect.height + 4)}px`;
		box.setAttribute("data-visible", "");
		if (!animate) requestAnimationFrame(() => {
			box.removeAttribute("data-static");
		});
	}
	function setSelected(element) {
		releasePageFocus();
		if (selected === element) return;
		const animate = selected !== null && selectionBox?.hasAttribute("data-visible") === true;
		selected?.removeAttribute("data-dsh-wv-selected");
		selected = element;
		selected.setAttribute("data-dsh-wv-selected", "");
		selectionObserver?.disconnect();
		if (typeof ResizeObserver !== "undefined") {
			selectionObserver = new ResizeObserver(() => {
				queueReposition();
			});
			selectionObserver.observe(element);
		}
		positionSelection(animate);
	}
	function clearSelection() {
		selected?.removeAttribute("data-dsh-wv-selected");
		selected = null;
		selectionObserver?.disconnect();
		selectionObserver = null;
		selectionBox?.removeAttribute("data-visible");
	}
	function repositionMarkers() {
		for (const marker of markerChrome.values()) {
			const rect = marker.element.getBoundingClientRect();
			marker.circle.style.display = rect.width === 0 && rect.height === 0 ? "none" : "";
			marker.circle.style.left = `${String(rect.left + rect.width / 2)}px`;
			marker.circle.style.top = `${String(rect.top)}px`;
		}
	}
	function postGeometry() {
		if (active === null) return;
		const element = handles.get(active.handle);
		if (element === void 0 || !element.isConnected) return;
		postEvent({
			name: "target-geometry",
			payload: {
				handle: active.handle,
				rect: rectOf(element),
				viewport: {
					width: innerWidth,
					height: innerHeight
				}
			}
		});
	}
	function queueReposition() {
		if (repositionQueued) return;
		repositionQueued = true;
		requestAnimationFrame(() => {
			repositionQueued = false;
			repositionMarkers();
			positionSelection(false);
			postGeometry();
		});
	}
	function rollbackActive() {
		if (active === null) return;
		const currentElement = handles.get(active.handle);
		if (currentElement !== void 0) restoreAll(patchOf(currentElement));
		if (active.originalPickId !== null) {
			const original = committed.get(active.originalPickId);
			if (original !== void 0) applyCommitted(original.patch, original.changes, original.textChange);
		}
	}
	function begin(element, originalPickId) {
		rollbackActive();
		active = {
			handle: handleOf(element),
			originalPickId
		};
		setSelected(element);
		return targetOf(element);
	}
	function selectWithinTransaction(element) {
		return begin(element, active?.originalPickId ?? null);
	}
	function syncMarkers(markers) {
		const seen = /* @__PURE__ */ new Set();
		for (const marker of markers) {
			seen.add(marker.id);
			let record = committed.get(marker.id);
			let element = record?.element;
			if (element === void 0 || !element.isConnected || record?.cssPath !== marker.cssPath) try {
				element = document.querySelector(marker.cssPath) ?? void 0;
			} catch {
				element = void 0;
			}
			if (element === void 0 || !isReviewableElement(element)) continue;
			if (record !== void 0 && record.element !== element) restoreAll(record.patch);
			const patch = patchOf(element);
			restoreAll(patch);
			applyCommitted(patch, marker.changes, marker.textChange);
			record = {
				id: marker.id,
				cssPath: marker.cssPath,
				element,
				patch,
				changes: [...marker.changes],
				textChange: marker.textChange
			};
			committed.set(marker.id, record);
			const chrome = markerChrome.get(marker.id);
			if (chrome === void 0) {
				const circle = document.createElement("div");
				circle.className = "dsh-wv-marker";
				circle.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					postEvent({
						name: "mark-click",
						payload: { pickId: marker.id }
					});
				});
				document.documentElement.appendChild(circle);
				markerChrome.set(marker.id, {
					element,
					circle
				});
			} else chrome.element = element;
			markerChrome.get(marker.id).circle.textContent = String(marker.index);
		}
		for (const [id, record] of committed) {
			if (seen.has(id)) continue;
			restoreAll(record.patch);
			committed.delete(id);
		}
		for (const [id, chrome] of markerChrome) {
			if (seen.has(id)) continue;
			chrome.circle.remove();
			markerChrome.delete(id);
		}
		repositionMarkers();
	}
	function treeOf(current) {
		const serialize = (node) => {
			const { element } = node;
			const handle = handleOf(element);
			return {
				handle,
				key: handle,
				tagName: truncate(element.tagName.toLowerCase(), PREVIEW_ELEMENT_LIMITS.tagName),
				detail: elementTreeDetail(element),
				current: element === current,
				children: node.children.map(serialize)
			};
		};
		return serialize(boundedReviewableTree(current, PREVIEW_TREE_LIMITS.nodes, PREVIEW_TREE_LIMITS.depth));
	}
	function commandOf(value) {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
		const record = value;
		return typeof record.name === "string" && Object.hasOwn(record, "payload") ? value : void 0;
	}
	function elementFor(handle) {
		return typeof handle === "string" ? handles.get(handle) : void 0;
	}
	function stylePayload(payload) {
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return void 0;
		const record = payload;
		const element = elementFor(record.handle);
		if (element === void 0 || typeof record.property !== "string" || !isEditableStyleProperty(record.property)) return void 0;
		return {
			element,
			property: record.property,
			...typeof record.value === "string" ? { value: record.value } : {}
		};
	}
	function execute(command) {
		const payload = command.payload;
		if (command.name === "request-ready") {
			postReady();
			return null;
		}
		if (command.name === "activate") {
			picking = true;
			document.documentElement.classList.add("dsh-wv-picking");
			return null;
		}
		if (command.name === "deactivate") {
			picking = false;
			clearHover();
			clearSelection();
			document.documentElement.classList.remove("dsh-wv-picking");
			return null;
		}
		if (command.name === "clear-selection") {
			clearSelection();
			return null;
		}
		if (command.name === "sync-markers") {
			const markers = payload.markers;
			if (!Array.isArray(markers) || markers.length > 20) throw new Error("invalid markers");
			syncMarkers(markers);
			return null;
		}
		if (command.name === "open-pick") {
			const data = payload;
			if (typeof data.pickId !== "string" || typeof data.cssPath !== "string") throw new Error("invalid pick");
			let element = committed.get(data.pickId)?.element;
			if (element === void 0 || !element.isConnected) element = document.querySelector(data.cssPath) ?? void 0;
			if (element === void 0) return null;
			return begin(element, data.pickId);
		}
		if (command.name === "navigate-element") {
			const data = payload;
			const element = elementFor(data.handle);
			const action = data.action;
			if (element === void 0 || action !== "child" && action !== "parent" && action !== "previous-sibling" && action !== "next-sibling") throw new Error("invalid navigation");
			const target = navigateElement(element, action);
			return target === null ? null : selectWithinTransaction(target);
		}
		if (command.name === "select-element") {
			const element = elementFor(payload.handle);
			if (element === void 0) throw new Error("element unavailable");
			return selectWithinTransaction(element);
		}
		if (command.name === "read-tree") {
			const element = elementFor(payload.handle);
			if (element === void 0) throw new Error("element unavailable");
			return treeOf(element);
		}
		if (command.name === "preview-style") {
			const data = stylePayload(payload);
			if (data === void 0 || data.value === void 0 || data.value.length > 500 || !isSafeAnnotationStyleValue(data.value)) throw new Error("invalid style preview");
			previewStyle(patchOf(data.element), data.property, data.value);
			queueReposition();
			return null;
		}
		if (command.name === "restore-style") {
			const data = stylePayload(payload);
			if (data === void 0) throw new Error("invalid style restore");
			restoreStyle(patchOf(data.element), data.property);
			queueReposition();
			return null;
		}
		if (command.name === "preview-text") {
			const data = payload;
			const element = elementFor(data.handle);
			if (element === void 0 || typeof data.value !== "string" || data.value.length > 2e3) throw new Error("invalid text preview");
			previewText(patchOf(element), data.value);
			queueReposition();
			return null;
		}
		if (command.name === "restore-text") {
			const element = elementFor(payload.handle);
			if (element === void 0) throw new Error("element unavailable");
			restoreText(patchOf(element));
			queueReposition();
			return null;
		}
		if (command.name === "cancel-edit") {
			rollbackActive();
			active = null;
			clearSelection();
			return null;
		}
		if (command.name === "commit-edit") {
			const data = payload;
			const element = elementFor(data.handle);
			if (typeof data.pickId !== "string" || element === void 0 || !Array.isArray(data.changes)) throw new Error("invalid commit");
			const originalId = active?.originalPickId;
			if (originalId !== null && originalId !== void 0) {
				const original = committed.get(originalId);
				if (original !== void 0 && original.element !== element) restoreAll(original.patch);
				if (originalId !== data.pickId) committed.delete(originalId);
			}
			const patch = patchOf(element);
			restoreAll(patch);
			applyCommitted(patch, data.changes, data.textChange);
			const snapshot = snapshotOf(element);
			committed.set(data.pickId, {
				id: data.pickId,
				cssPath: snapshot.cssPath,
				element,
				patch,
				changes: [...data.changes],
				textChange: data.textChange
			});
			active = null;
			clearSelection();
			return null;
		}
		if (command.name === "history-back") {
			history.back();
			return null;
		}
		if (command.name === "history-forward") {
			history.forward();
			return null;
		}
		if (command.name === "reload") {
			location.reload();
			return null;
		}
		throw new Error("unsupported command");
	}
	window.addEventListener("message", (event) => {
		if (event.source !== parent || event.origin !== config.parentOrigin) return;
		const value = event.data;
		if (typeof value !== "object" || value === null || Array.isArray(value)) return;
		const record = value;
		if (record.protocol !== "dsh-web-review/bridge" || record.version !== 1 || record.direction !== "host-to-frame" || record.channel !== config.channel || typeof record.requestId !== "string" || record.requestId.length > 64) return;
		const command = commandOf(record.command);
		if (command === void 0) return;
		try {
			postResponse(record.requestId, {
				ok: true,
				value: execute(command)
			});
		} catch (error) {
			postResponse(record.requestId, {
				ok: false,
				error: error instanceof Error ? error.message.slice(0, 500) : "bridge command failed"
			});
		}
	});
	function installPicker() {
		const style = document.createElement("style");
		style.dataset.dshWebReview = "picker";
		style.textContent = PICKER_STYLE;
		document.head.appendChild(style);
		document.addEventListener("mouseover", (event) => {
			if (!picking || !(event.target instanceof Element) || event.target === document.documentElement || event.target === document.body || isChrome(event.target) || event.target === selected) return;
			if (hovered === event.target) return;
			clearHover();
			hovered = event.target;
			hovered.setAttribute("data-dsh-wv-hover", "");
		}, true);
		document.addEventListener("mouseout", (event) => {
			if (picking && event.target === hovered) clearHover();
		}, true);
		document.addEventListener("pointerdown", (event) => {
			if (!picking || !(event.target instanceof Element) || isChrome(event.target)) return;
			event.preventDefault();
			releasePageFocus();
		}, true);
		document.addEventListener("click", (event) => {
			if (!picking || !(event.target instanceof Element) || isChrome(event.target)) return;
			event.preventDefault();
			event.stopPropagation();
			const element = hovered;
			clearHover();
			if (element === null) return;
			const existing = [...committed.values()].find((record) => record.element === element);
			if (existing !== void 0) {
				postEvent({
					name: "mark-click",
					payload: { pickId: existing.id }
				});
				return;
			}
			postEvent({
				name: "pick",
				payload: { target: begin(element, null) }
			});
		}, true);
		document.addEventListener("keydown", (event) => {
			if (picking && event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				postEvent({
					name: "cancel-pick",
					payload: null
				});
				return;
			}
			if (active === null) return;
			const action = elementNavigationAction(event, { capturePageActions: true });
			if (action === null) return;
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			postEvent({
				name: "shortcut",
				payload: { action }
			});
		}, true);
		document.addEventListener("scroll", queueReposition, true);
		window.addEventListener("resize", queueReposition);
	}
	installPicker();
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", postReady, { once: true });
	else queueMicrotask(postReady);
	window.addEventListener("popstate", postReady);
	window.addEventListener("hashchange", postReady);
	window.navigation?.addEventListener("currententrychange", postReady);
	//#endregion
})();

//# sourceMappingURL=bridge.js.map