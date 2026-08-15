import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
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
//#region node_modules/cosmokit/lib/index.cjs
var require_lib$1 = __commonJSMin(((exports, module) => {
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var index_exports = {};
	__export(index_exports, {
		Binary: () => Binary,
		Time: () => Time,
		arrayBufferToBase64: () => arrayBufferToBase64,
		arrayBufferToHex: () => arrayBufferToHex,
		base64ToArrayBuffer: () => base64ToArrayBuffer,
		camelCase: () => camelCase,
		camelize: () => camelize,
		capitalize: () => capitalize,
		clone: () => clone,
		contain: () => contain,
		deduplicate: () => deduplicate,
		deepEqual: () => deepEqual,
		defineProperty: () => defineProperty,
		difference: () => difference,
		filterKeys: () => filterKeys,
		formatProperty: () => formatProperty,
		hexToArrayBuffer: () => hexToArrayBuffer,
		hyphenate: () => hyphenate,
		intersection: () => intersection,
		is: () => is,
		isNonNullable: () => isNonNullable,
		isNullable: () => isNullable,
		isPlainObject: () => isPlainObject,
		makeArray: () => makeArray,
		mapValues: () => mapValues,
		noop: () => noop,
		omit: () => omit,
		paramCase: () => paramCase,
		pick: () => pick,
		remove: () => remove,
		sanitize: () => sanitize,
		snakeCase: () => snakeCase,
		trimSlash: () => trimSlash,
		uncapitalize: () => uncapitalize,
		union: () => union,
		valueMap: () => mapValues
	});
	module.exports = __toCommonJS(index_exports);
	function noop() {}
	function isNullable(value) {
		return value === null || value === void 0;
	}
	function isNonNullable(value) {
		return !isNullable(value);
	}
	function isPlainObject(data) {
		return data && typeof data === "object" && !Array.isArray(data);
	}
	function filterKeys(object, filter) {
		return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
	}
	function mapValues(object, transform) {
		return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
	}
	function pick(source, keys, forced) {
		if (!keys) return { ...source };
		const result = {};
		for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
		return result;
	}
	function omit(source, keys) {
		if (!keys) return { ...source };
		const result = { ...source };
		for (const key of keys) Reflect.deleteProperty(result, key);
		return result;
	}
	function defineProperty(object, key, value) {
		return Object.defineProperty(object, key, {
			writable: true,
			value,
			enumerable: false
		});
	}
	function contain(array1, array2) {
		return array2.every((item) => array1.includes(item));
	}
	function intersection(array1, array2) {
		return array1.filter((item) => array2.includes(item));
	}
	function difference(array1, array2) {
		return array1.filter((item) => !array2.includes(item));
	}
	function union(array1, array2) {
		return Array.from(new Set([...array1, ...array2]));
	}
	function deduplicate(array) {
		return [...new Set(array)];
	}
	function remove(list, item) {
		const index = list?.indexOf(item);
		if (index >= 0) {
			list.splice(index, 1);
			return true;
		} else return false;
	}
	function makeArray(source) {
		return Array.isArray(source) ? source : isNullable(source) ? [] : [source];
	}
	function is(type, value) {
		if (arguments.length === 1) return (value2) => is(type, value2);
		return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
	}
	function isArrayBufferLike(value) {
		return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
	}
	function isArrayBufferSource(value) {
		return isArrayBufferLike(value) || ArrayBuffer.isView(value);
	}
	var Binary;
	((Binary2) => {
		Binary2.is = isArrayBufferLike;
		Binary2.isSource = isArrayBufferSource;
		function fromSource(source) {
			if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
			else return source;
		}
		Binary2.fromSource = fromSource;
		function toBase64(source) {
			source = fromSource(source);
			if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
			let binary = "";
			const bytes = new Uint8Array(source);
			for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
			return btoa(binary);
		}
		Binary2.toBase64 = toBase64;
		function fromBase64(source) {
			if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
			return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
		}
		Binary2.fromBase64 = fromBase64;
		function toHex(source) {
			source = fromSource(source);
			if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
			return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
		}
		Binary2.toHex = toHex;
		function fromHex(source) {
			if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
			const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
			const buffer = [];
			for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
			return Uint8Array.from(buffer).buffer;
		}
		Binary2.fromHex = fromHex;
	})(Binary || (Binary = {}));
	var base64ToArrayBuffer = Binary.fromBase64;
	var arrayBufferToBase64 = Binary.toBase64;
	var hexToArrayBuffer = Binary.fromHex;
	var arrayBufferToHex = Binary.toHex;
	function clone(source, refs = new Map()) {
		if (!source || typeof source !== "object") return source;
		if (is("Date", source)) return new Date(source.valueOf());
		if (is("RegExp", source)) return new RegExp(source.source, source.flags);
		if (isArrayBufferLike(source)) return source.slice(0);
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		const cached = refs.get(source);
		if (cached) return cached;
		if (Array.isArray(source)) {
			const result2 = [];
			refs.set(source, result2);
			source.forEach((value, index) => {
				result2[index] = Reflect.apply(clone, null, [value, refs]);
			});
			return result2;
		}
		const result = Object.create(Object.getPrototypeOf(source));
		refs.set(source, result);
		for (const key of Reflect.ownKeys(source)) {
			const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
			if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
			Reflect.defineProperty(result, key, descriptor);
		}
		return result;
	}
	function deepEqual(a, b, strict) {
		if (a === b) return true;
		if (!strict && isNullable(a) && isNullable(b)) return true;
		if (typeof a !== typeof b) return false;
		if (typeof a !== "object") return false;
		if (!a || !b) return false;
		function check(test, then) {
			return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
		}
		return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
			if (a2.byteLength !== b2.byteLength) return false;
			const viewA = new Uint8Array(a2);
			const viewB = new Uint8Array(b2);
			for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
			return true;
		}) ?? Object.keys({
			...a,
			...b
		}).every((key) => deepEqual(a[key], b[key], strict));
	}
	function capitalize(source) {
		return source.charAt(0).toUpperCase() + source.slice(1);
	}
	function uncapitalize(source) {
		return source.charAt(0).toLowerCase() + source.slice(1);
	}
	function camelCase(source) {
		return source.replace(/[_-][a-z]/g, (str) => str.slice(1).toUpperCase());
	}
	function tokenize(source, delimiters, delimiter) {
		const output = [];
		let state = 0;
		for (let i = 0; i < source.length; i++) {
			const code = source.charCodeAt(i);
			if (code >= 65 && code <= 90) {
				if (state === 1) {
					const next = source.charCodeAt(i + 1);
					if (next >= 97 && next <= 122) output.push(delimiter);
					output.push(code + 32);
				} else {
					if (state !== 0) output.push(delimiter);
					output.push(code + 32);
				}
				state = 1;
			} else if (code >= 97 && code <= 122) {
				output.push(code);
				state = 2;
			} else if (delimiters.includes(code)) {
				if (state !== 0) output.push(delimiter);
				state = 0;
			} else output.push(code);
		}
		return String.fromCharCode(...output);
	}
	function paramCase(source) {
		return tokenize(source, [45, 95], 45);
	}
	function snakeCase(source) {
		return tokenize(source, [45, 95], 95);
	}
	var camelize = camelCase;
	var hyphenate = paramCase;
	function formatProperty(key) {
		if (typeof key !== "string") return `[${key.toString()}]`;
		return /^[a-z_$][\w$]*$/i.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
	}
	function trimSlash(source) {
		return source.replace(/\/$/, "");
	}
	function sanitize(source) {
		if (!source.startsWith("/")) source = "/" + source;
		return trimSlash(source);
	}
	var Time;
	((Time2) => {
		Time2.millisecond = 1;
		Time2.second = 1e3;
		Time2.minute = Time2.second * 60;
		Time2.hour = Time2.minute * 60;
		Time2.day = Time2.hour * 24;
		Time2.week = Time2.day * 7;
		let timezoneOffset = new Date().getTimezoneOffset();
		function setTimezoneOffset(offset) {
			timezoneOffset = offset;
		}
		Time2.setTimezoneOffset = setTimezoneOffset;
		function getTimezoneOffset() {
			return timezoneOffset;
		}
		Time2.getTimezoneOffset = getTimezoneOffset;
		function getDateNumber(date = new Date(), offset) {
			if (typeof date === "number") date = new Date(date);
			if (offset === void 0) offset = timezoneOffset;
			return Math.floor((date.valueOf() / Time2.minute - offset) / 1440);
		}
		Time2.getDateNumber = getDateNumber;
		function fromDateNumber(value, offset) {
			const date = new Date(value * Time2.day);
			if (offset === void 0) offset = timezoneOffset;
			return new Date(+date + offset * Time2.minute);
		}
		Time2.fromDateNumber = fromDateNumber;
		const numeric = /\d+(?:\.\d+)?/.source;
		const timeRegExp = new RegExp(`^${[
			"w(?:eek(?:s)?)?",
			"d(?:ay(?:s)?)?",
			"h(?:our(?:s)?)?",
			"m(?:in(?:ute)?(?:s)?)?",
			"s(?:ec(?:ond)?(?:s)?)?"
		].map((unit) => `(${numeric}${unit})?`).join("")}$`);
		function parseTime(source) {
			const capture = timeRegExp.exec(source);
			if (!capture) return 0;
			return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
		}
		Time2.parseTime = parseTime;
		function parseDate(date) {
			const parsed = parseTime(date);
			if (parsed) date = Date.now() + parsed;
			else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${new Date().toLocaleDateString()}-${date}`;
			else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${new Date().getFullYear()}-${date}`;
			return date ? new Date(date) : new Date();
		}
		Time2.parseDate = parseDate;
		function format(ms) {
			const abs = Math.abs(ms);
			if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
			else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
			else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
			else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
			return ms + "ms";
		}
		Time2.format = format;
		function toDigits(source, length = 2) {
			return source.toString().padStart(length, "0");
		}
		Time2.toDigits = toDigits;
		function template(template2, time = new Date()) {
			return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
		}
		Time2.template = template;
	})(Time || (Time = {}));
	0 && (module.exports = {
		Binary,
		Time,
		arrayBufferToBase64,
		arrayBufferToHex,
		base64ToArrayBuffer,
		camelCase,
		camelize,
		capitalize,
		clone,
		contain,
		deduplicate,
		deepEqual,
		defineProperty,
		difference,
		filterKeys,
		formatProperty,
		hexToArrayBuffer,
		hyphenate,
		intersection,
		is,
		isNonNullable,
		isNullable,
		isPlainObject,
		makeArray,
		mapValues,
		noop,
		omit,
		paramCase,
		pick,
		remove,
		sanitize,
		snakeCase,
		trimSlash,
		uncapitalize,
		union,
		valueMap
	});
}));
//#endregion
//#region .build/host/selectors.js
var import_lib = __toESM(__commonJSMin(((exports, module) => {
	var __defProp = Object.defineProperty;
	var __name = (target, value) => __defProp(target, "name", {
		value,
		configurable: true
	});
	var import_cosmokit = require_lib$1();
	var kSchema = Symbol.for("schemastery");
	var kValidationError = Symbol.for("ValidationError");
	globalThis.__schemastery_index__ ??= 0;
	globalThis.__schemastery_refs__ = void 0;
	var ValidationError = class extends TypeError {
		constructor(message, options) {
			let prefix = "$";
			for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
			else if (typeof segment === "number") prefix += "[" + segment + "]";
			else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
			if (prefix.startsWith(".")) prefix = prefix.slice(1);
			super((prefix === "$" ? "" : `${prefix} `) + message);
			this.options = options;
		}
		static {
			__name(this, "ValidationError");
		}
		name = "ValidationError";
		static is(error) {
			return !!error?.[kValidationError];
		}
	};
	Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
	var Schema = __name(function(options) {
		const schema = __name(function(data, options2 = {}) {
			return Schema.resolve(data, schema, options2)[0];
		}, "schema");
		if (options.refs) {
			const refs = (0, import_cosmokit.valueMap)(options.refs, (options2) => new Schema(options2));
			const getRef = __name((uid) => refs[uid], "getRef");
			for (const key in refs) {
				const options2 = refs[key];
				options2.sKey = getRef(options2.sKey);
				options2.inner = getRef(options2.inner);
				options2.list = options2.list && options2.list.map(getRef);
				options2.dict = options2.dict && (0, import_cosmokit.valueMap)(options2.dict, getRef);
			}
			return refs[options.uid];
		}
		Object.assign(schema, options);
		if (typeof schema.callback === "string") try {
			schema.callback = new Function("return " + schema.callback)();
		} catch {}
		Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
		Object.setPrototypeOf(schema, Schema.prototype);
		schema.meta ||= {};
		schema.toString = schema.toString.bind(schema);
		return schema;
	}, "Schema");
	Schema.prototype = Object.create(Function.prototype);
	Schema.prototype[kSchema] = true;
	Object.defineProperty(Schema.prototype, "~standard", { get() {
		return {
			version: 1,
			vendor: "schemastery",
			validate: __name((value) => {
				try {
					return { value: Schema.resolve(value, this, {})[0] };
				} catch (error) {
					if (ValidationError.is(error)) return { issues: [{
						message: error.message,
						path: error.options.path
					}] };
					throw error;
				}
			}, "validate")
		};
	} });
	Schema.ValidationError = ValidationError;
	Schema.prototype.toJSON = __name(function toJSON() {
		if (globalThis.__schemastery_refs__) {
			globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
			return this.uid;
		}
		globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
		globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
		const result = {
			uid: this.uid,
			refs: globalThis.__schemastery_refs__
		};
		globalThis.__schemastery_refs__ = void 0;
		return result;
	}, "toJSON");
	Schema.prototype.set = __name(function set(key, value) {
		this.dict[key] = value;
		return this;
	}, "set");
	Schema.prototype.push = __name(function push(value) {
		this.list.push(value);
		return this;
	}, "push");
	function mergeDesc(original, messages) {
		const result = typeof original === "string" ? { "": original } : { ...original };
		for (const locale in messages) {
			const value = messages[locale];
			if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
			else if (typeof value === "string") result[locale] = value;
		}
		return result;
	}
	__name(mergeDesc, "mergeDesc");
	function getInner(value) {
		return value?.$value ?? value?.$inner;
	}
	__name(getInner, "getInner");
	function extractKeys(data) {
		return (0, import_cosmokit.filterKeys)(data ?? {}, (key) => !key.startsWith("$"));
	}
	__name(extractKeys, "extractKeys");
	Schema.prototype.i18n = __name(function i18n(messages) {
		const schema = Schema(this);
		const desc = mergeDesc(schema.meta.description, messages);
		if (Object.keys(desc).length) schema.meta.description = desc;
		if (schema.dict) schema.dict = (0, import_cosmokit.valueMap)(schema.dict, (inner, key) => {
			return inner.i18n((0, import_cosmokit.valueMap)(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
		});
		if (schema.list) schema.list = schema.list.map((inner, index) => {
			return inner.i18n((0, import_cosmokit.valueMap)(messages, (data = {}) => {
				if (Array.isArray(getInner(data))) return getInner(data)[index];
				if (Array.isArray(data)) return data[index];
				return extractKeys(data);
			}));
		});
		if (schema.inner) schema.inner = schema.inner.i18n((0, import_cosmokit.valueMap)(messages, (data) => {
			if (getInner(data)) return getInner(data);
			return extractKeys(data);
		}));
		if (schema.sKey) schema.sKey = schema.sKey.i18n((0, import_cosmokit.valueMap)(messages, (data) => data?.$key));
		return schema;
	}, "i18n");
	Schema.prototype.extra = __name(function extra(key, value) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			[key]: value
		};
		return schema;
	}, "extra");
	for (const key of [
		"required",
		"disabled",
		"collapse",
		"hidden",
		"loose"
	]) Object.assign(Schema.prototype, { [key](value = true) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			[key]: value
		};
		return schema;
	} });
	Schema.prototype.deprecated = __name(function deprecated() {
		const schema = Schema(this);
		schema.meta.badges ||= [];
		schema.meta.badges.push({
			text: "deprecated",
			type: "danger"
		});
		return schema;
	}, "deprecated");
	Schema.prototype.experimental = __name(function experimental() {
		const schema = Schema(this);
		schema.meta.badges ||= [];
		schema.meta.badges.push({
			text: "experimental",
			type: "warning"
		});
		return schema;
	}, "experimental");
	Schema.prototype.pattern = __name(function pattern(regexp) {
		const schema = Schema(this);
		const pattern2 = (0, import_cosmokit.pick)(regexp, ["source", "flags"]);
		schema.meta = {
			...schema.meta,
			pattern: pattern2
		};
		return schema;
	}, "pattern");
	Schema.prototype.simplify = __name(function simplify(value) {
		if ((0, import_cosmokit.deepEqual)(value, this.meta.default, this.type === "dict")) return null;
		if ((0, import_cosmokit.isNullable)(value)) return value;
		if (this.type === "object" || this.type === "dict") {
			const result = {};
			for (const key in value) {
				const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
				if (this.type === "dict" || !(0, import_cosmokit.isNullable)(item)) result[key] = item;
			}
			if ((0, import_cosmokit.deepEqual)(result, this.meta.default, this.type === "dict")) return null;
			return result;
		} else if (this.type === "array" || this.type === "tuple") {
			const result = [];
			value.forEach((value2, index) => {
				const schema = this.type === "array" ? this.inner : this.list[index];
				const item = schema ? schema.simplify(value2) : value2;
				result.push(item);
			});
			return result;
		} else if (this.type === "intersect") {
			const result = {};
			for (const item of this.list) Object.assign(result, item.simplify(value));
			return result;
		} else if (this.type === "union") for (const schema of this.list) try {
			Schema.resolve(value, schema, {});
			return schema.simplify(value);
		} catch {}
		return value;
	}, "simplify");
	Schema.prototype.toString = __name(function toString(inline) {
		return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
	}, "toString");
	Schema.prototype.role = __name(function role(role, extra2) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			role,
			extra: extra2
		};
		return schema;
	}, "role");
	for (const key of [
		"default",
		"link",
		"comment",
		"description",
		"max",
		"min",
		"step"
	]) Object.assign(Schema.prototype, { [key](value) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			[key]: value
		};
		return schema;
	} });
	var resolvers = {};
	Schema.extend = __name(function extend(type, resolve2) {
		resolvers[type] = resolve2;
	}, "extend");
	Schema.resolve = __name(function resolve(data, schema, options = {}, strict = false) {
		if (!schema) return [data];
		if (options.ignore?.(data, schema)) return [data];
		if ((0, import_cosmokit.isNullable)(data) && schema.type !== "lazy") {
			if (schema.meta.required) throw new ValidationError(`missing required value`, options);
			let current = schema;
			let fallback = schema.meta.default;
			while (current?.type === "intersect" && (0, import_cosmokit.isNullable)(fallback)) {
				current = current.list[0];
				fallback = current?.meta.default;
			}
			if ((0, import_cosmokit.isNullable)(fallback)) return [data];
			data = (0, import_cosmokit.clone)(fallback);
		}
		const callback = resolvers[schema.type];
		if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
		try {
			return callback(data, schema, options, strict);
		} catch (error) {
			if (!schema.meta.loose) throw error;
			return [schema.meta.default];
		}
	}, "resolve");
	Schema.from = __name(function from(source) {
		if ((0, import_cosmokit.isNullable)(source)) return Schema.any();
		else if ([
			"string",
			"number",
			"boolean"
		].includes(typeof source)) return Schema.const(source).required();
		else if (source[kSchema]) return source;
		else if (typeof source === "function") switch (source) {
			case String: return Schema.string().required();
			case Number: return Schema.number().required();
			case Boolean: return Schema.boolean().required();
			case Function: return Schema.function().required();
			default: return Schema.is(source).required();
		}
		else throw new TypeError(`cannot infer schema from ${source}`);
	}, "from");
	Schema.lazy = __name(function lazy(builder) {
		const schema = new Schema({
			type: "lazy",
			builder,
			inner: { toJSON: __name(() => {
				if (!schema.inner[kSchema]) {
					schema.inner = schema.builder();
					schema.inner.meta = {
						...schema.meta,
						...schema.inner.meta
					};
				}
				return schema.inner.toJSON();
			}, "toJSON") }
		});
		return schema;
	}, "lazy");
	Schema.natural = __name(function natural() {
		return Schema.number().step(1).min(0);
	}, "natural");
	Schema.percent = __name(function percent() {
		return Schema.number().step(.01).min(0).max(1).role("slider");
	}, "percent");
	Schema.date = __name(function date() {
		return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
			const date2 = new Date(value);
			if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
			return date2;
		}, true)]);
	}, "date");
	Schema.regExp = __name(function regExp(flag = "") {
		return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
			try {
				return new RegExp(value, flag);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)]);
	}, "regExp");
	Schema.arrayBuffer = __name(function arrayBuffer(encoding) {
		return Schema.union([
			Schema.is(ArrayBuffer),
			Schema.is(SharedArrayBuffer),
			Schema.transform(Schema.any(), (value, options) => {
				if (import_cosmokit.Binary.isSource(value)) return import_cosmokit.Binary.fromSource(value);
				throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
			}, true),
			...encoding ? [Schema.transform(Schema.string(), (value, options) => {
				try {
					return encoding === "base64" ? import_cosmokit.Binary.fromBase64(value) : import_cosmokit.Binary.fromHex(value);
				} catch (e) {
					throw new ValidationError(e.message, options);
				}
			}, true)] : []
		]);
	}, "arrayBuffer");
	Schema.extend("lazy", (data, schema, options, strict) => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return Schema.resolve(data, schema.inner, options, strict);
	});
	Schema.extend("any", (data) => {
		return [data];
	});
	Schema.extend("never", (data, _, options) => {
		throw new ValidationError(`expected nullable but got ${data}`, options);
	});
	Schema.extend("const", (data, { value }, options) => {
		if ((0, import_cosmokit.deepEqual)(data, value)) return [value];
		throw new ValidationError(`expected ${value} but got ${data}`, options);
	});
	function checkWithinRange(data, meta, description, options, skipMin = false) {
		const { max = Infinity, min = -Infinity } = meta;
		if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
		if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
	}
	__name(checkWithinRange, "checkWithinRange");
	Schema.extend("string", (data, { meta }, options) => {
		if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
		if (meta.pattern) {
			const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
			if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
		}
		checkWithinRange(data.length, meta, "string length", options);
		return [data];
	});
	function decimalShift(data, digits) {
		const str = data.toString();
		if (str.includes("e")) return data * Math.pow(10, digits);
		const index = str.indexOf(".");
		if (index === -1) return data * Math.pow(10, digits);
		const frac = str.slice(index + 1);
		const integer = str.slice(0, index);
		if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
		return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
	}
	__name(decimalShift, "decimalShift");
	function isMultipleOf(data, min, step) {
		step = Math.abs(step);
		if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
		const index = step.toString().indexOf(".");
		const digits = step.toString().slice(index + 1).length;
		return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
	}
	__name(isMultipleOf, "isMultipleOf");
	Schema.extend("number", (data, { meta }, options) => {
		if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
		checkWithinRange(data, meta, "number", options);
		const { step } = meta;
		if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
		return [data];
	});
	Schema.extend("boolean", (data, _, options) => {
		if (typeof data === "boolean") return [data];
		throw new ValidationError(`expected boolean but got ${data}`, options);
	});
	Schema.extend("bitset", (data, { bits, meta }, options) => {
		let value = 0, keys = [];
		if (typeof data === "number") {
			value = data;
			for (const key in bits) if (data & bits[key]) keys.push(key);
		} else if (Array.isArray(data)) {
			keys = data;
			for (const key of keys) {
				if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
				if (key in bits) value |= bits[key];
			}
		} else throw new ValidationError(`expected number or array but got ${data}`, options);
		if (value === meta.default) return [value];
		return [value, keys];
	});
	Schema.extend("function", (data, _, options) => {
		if (typeof data === "function") return [data];
		throw new ValidationError(`expected function but got ${data}`, options);
	});
	Schema.extend("is", (data, { constructor }, options) => {
		if (typeof constructor === "function") {
			if (data instanceof constructor) return [data];
			throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
		} else {
			if ((0, import_cosmokit.isNullable)(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
			let prototype = Object.getPrototypeOf(data);
			while (prototype) {
				if (prototype.constructor?.name === constructor) return [data];
				prototype = Object.getPrototypeOf(prototype);
			}
			throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		}
	});
	function property(data, key, schema, options) {
		try {
			const [value, adapted] = Schema.resolve(data[key], schema, {
				...options,
				path: [...options.path || [], key]
			});
			if (adapted !== void 0) data[key] = adapted;
			return value;
		} catch (e) {
			if (!options?.autofix) throw e;
			delete data[key];
			return schema.meta.default;
		}
	}
	__name(property, "property");
	Schema.extend("array", (data, { inner, meta }, options) => {
		if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
		checkWithinRange(data.length, meta, "array length", options, !(0, import_cosmokit.isNullable)(inner.meta.default));
		return [data.map((_, index) => property(data, index, inner, options))];
	});
	Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
		if (!(0, import_cosmokit.isPlainObject)(data)) throw new ValidationError(`expected object but got ${data}`, options);
		const result = {};
		for (const key in data) {
			let rKey;
			try {
				rKey = Schema.resolve(key, sKey, options)[0];
			} catch (error) {
				if (strict) continue;
				throw error;
			}
			result[rKey] = property(data, key, inner, options);
			data[rKey] = data[key];
			if (key !== rKey) delete data[key];
		}
		return [result];
	});
	Schema.extend("tuple", (data, { list }, options, strict) => {
		if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
		const result = list.map((inner, index) => property(data, index, inner, options));
		if (strict) return [result];
		result.push(...data.slice(list.length));
		return [result];
	});
	function merge(result, data) {
		for (const key in data) {
			if (key in result) continue;
			result[key] = data[key];
		}
	}
	__name(merge, "merge");
	Schema.extend("object", (data, { dict }, options, strict) => {
		if (!(0, import_cosmokit.isPlainObject)(data)) throw new ValidationError(`expected object but got ${data}`, options);
		const result = {};
		for (const key in dict) {
			const value = property(data, key, dict[key], options);
			if (!(0, import_cosmokit.isNullable)(value) || key in data) result[key] = value;
		}
		if (!strict) merge(result, data);
		return [result];
	});
	Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
		const messages = [];
		for (const inner of list) try {
			return Schema.resolve(data, inner, options, strict);
		} catch (error) {
			messages.push(error);
		}
		throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
	});
	Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
		if (!list.length) return [data];
		let result;
		for (const inner of list) {
			const value = Schema.resolve(data, inner, options, true)[0];
			if ((0, import_cosmokit.isNullable)(value)) continue;
			if ((0, import_cosmokit.isNullable)(result)) result = value;
			else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
			else if (typeof value === "object") merge(result ??= {}, value);
			else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
		}
		if (!strict && (0, import_cosmokit.isPlainObject)(data)) merge(result, data);
		return [result];
	});
	Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
		const [result, adapted = data] = Schema.resolve(data, inner, options, true);
		if (preserve) return [callback(result)];
		else return [callback(result), callback(adapted)];
	});
	var formatters = {};
	function defineMethod(name, keys, format) {
		formatters[name] = format;
		Object.assign(Schema, { [name](...args) {
			const schema = new Schema({ type: name });
			keys.forEach((key, index) => {
				switch (key) {
					case "sKey":
						schema.sKey = args[index] ?? Schema.string();
						break;
					case "inner":
						schema.inner = Schema.from(args[index]);
						break;
					case "list":
						schema.list = args[index].map(Schema.from);
						break;
					case "dict":
						schema.dict = (0, import_cosmokit.valueMap)(args[index], Schema.from);
						break;
					case "bits":
						schema.bits = {};
						for (const key2 in args[index]) {
							if (typeof args[index][key2] !== "number") continue;
							schema.bits[key2] = args[index][key2];
						}
						break;
					case "callback": {
						const callback = schema.callback = args[index];
						callback["toJSON"] ||= () => callback.toString();
						break;
					}
					case "constructor": {
						const constructor = schema.constructor = args[index];
						if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
						break;
					}
					default: schema[key] = args[index];
				}
			});
			if (name === "object" || name === "dict") schema.meta.default = {};
			else if (name === "array" || name === "tuple") schema.meta.default = [];
			else if (name === "bitset") schema.meta.default = 0;
			return schema;
		} });
	}
	__name(defineMethod, "defineMethod");
	defineMethod("is", ["constructor"], ({ constructor }) => {
		if (typeof constructor === "function") return constructor.name;
		else return constructor;
	});
	defineMethod("any", [], () => "any");
	defineMethod("never", [], () => "never");
	defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
	defineMethod("string", [], () => "string");
	defineMethod("number", [], () => "number");
	defineMethod("boolean", [], () => "boolean");
	defineMethod("bitset", ["bits"], () => "bitset");
	defineMethod("function", [], () => "function");
	defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
	defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
	defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
	defineMethod("object", ["dict"], ({ dict }) => {
		if (Object.keys(dict).length === 0) return "{}";
		return `{ ${Object.entries(dict).map(([key, inner]) => {
			return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
		}).join(", ")} }`;
	});
	defineMethod("union", ["list"], ({ list }, inline) => {
		const result = list.map(({ toString: format }) => format()).join(" | ");
		return inline ? `(${result})` : result;
	});
	defineMethod("intersect", ["list"], ({ list }) => {
		return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
	});
	defineMethod("transform", [
		"inner",
		"callback",
		"preserve"
	], ({ inner }, isInner) => inner.toString(isInner));
	module.exports = Schema;
}))(), 1);
var SelectorError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "SelectorError";
	}
};
function selectorKey(provider, model) {
	return model === void 0 ? `${provider}/*` : `${provider}/${model}`;
}
function parseSelector(input) {
	if (typeof input !== "string") throw new SelectorError(`invalid selector ${String(input)}: expected "provider/model" or "provider/*"`);
	const trimmed = input.trim();
	const slash = trimmed.indexOf("/");
	if (slash <= 0 || slash === trimmed.length - 1) throw new SelectorError(`invalid selector "${input}": expected "provider/model" or "provider/*"`);
	const provider = trimmed.slice(0, slash).trim();
	const modelPart = trimmed.slice(slash + 1).trim();
	if (!provider || !modelPart) throw new SelectorError(`invalid selector "${input}": empty provider or model`);
	if (modelPart.includes("/")) throw new SelectorError(`invalid selector "${input}": unexpected extra separator`);
	return {
		provider,
		model: modelPart === "*" ? void 0 : modelPart,
		raw: trimmed
	};
}
function resolveWildcardEntry(failingModel, provider) {
	return {
		provider,
		model: failingModel,
		raw: `${provider}/${failingModel}`
	};
}
//#endregion
//#region .build/host/config.js
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
	alwaysModeRetryCap: 5
};
const INHERIT_ROLE_ID = "inherit";
const ROLE_ID_PATTERN = /^[a-z0-9-]{1,32}$/;
function validateFallbacksConfig(config, logger) {
	const declaredIds = new Set();
	for (const role of config.roles.list) {
		const id = role.id.trim();
		if (!ROLE_ID_PATTERN.test(id)) logger.warn(`llm-fallbacks: invalid role id "${role.id}" — must match /^[a-z0-9-]{1,32}$/`);
		if (id === "inherit") logger.warn(`llm-fallbacks: role id "${role.id}" is reserved — "inherit" cannot be declared in roles.list`);
		if (declaredIds.has(id)) logger.warn(`llm-fallbacks: duplicate role id "${role.id}" — role ids must be unique`);
		declaredIds.add(id);
		for (const entry of role.chain ?? []) try {
			parseSelector(entry);
		} catch (error) {
			logger.warn(`llm-fallbacks: ignoring invalid chain entry "${entry}" in role "${role.id}": ${error.message}`);
		}
		if (role.fallback !== void 0 && role.fallback !== "inherit-root" && role.fallback !== "none") logger.warn(`llm-fallbacks: role "${role.id}" has invalid fallback "${String(role.fallback)}" — expected "inherit-root" or "none"`);
	}
	for (const entry of config.rootChain) try {
		parseSelector(entry);
	} catch (error) {
		logger.warn(`llm-fallbacks: ignoring invalid rootChain entry "${entry}": ${error.message}`);
	}
	const validTargets = new Set([...declaredIds, INHERIT_ROLE_ID]);
	for (const rule of config.roles.rules) if (!validTargets.has(rule.role.trim())) logger.warn(`llm-fallbacks: rule references undeclared role "${rule.role}" — expected one of roles.list ids or "inherit"`);
}
function detectLegacyKeys(source) {
	const keys = [];
	if (Object.hasOwn(source, "chains")) keys.push("chains");
	const roles = source.roles;
	if (isRecordLike(roles)) {
		if (Object.hasOwn(roles, "default")) keys.push("roles.default");
		const declared = new Set();
		if (Array.isArray(roles.list)) {
			for (const item of roles.list) if (isRecordLike(item) && typeof item.id === "string") declared.add(item.id);
		}
		if (Array.isArray(roles.rules)) {
			for (const rule of roles.rules) if (isRecordLike(rule) && typeof rule.role === "string" && rule.role !== "inherit" && !declared.has(rule.role)) keys.push(`roles.rules[].role: ${rule.role}`);
		}
	}
	return keys;
}
function isRecordLike(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
const Config = import_lib.default.object({
	enabled: import_lib.default.boolean().default(false),
	triggerCodes: import_lib.default.array(import_lib.default.string()).default([
		"AUTH",
		"QUOTA",
		"RATE_LIMIT"
	]),
	rootChain: import_lib.default.array(import_lib.default.string()).default([]),
	roles: import_lib.default.object({
		list: import_lib.default.array(import_lib.default.object({
			id: import_lib.default.string().required(),
			label: import_lib.default.string().default(""),
			description: import_lib.default.string().default(""),
			prompt: import_lib.default.string(),
			permissions: import_lib.default.object({
				allow: import_lib.default.array(import_lib.default.string()),
				deny: import_lib.default.array(import_lib.default.string())
			}),
			chain: import_lib.default.array(import_lib.default.string()),
			fallback: import_lib.default.union([import_lib.default.const("inherit-root"), import_lib.default.const("none")]).default("inherit-root")
		})).default([]),
		rules: import_lib.default.array(import_lib.default.object({
			origin: import_lib.default.union([import_lib.default.const("root"), import_lib.default.const("subagent")]),
			provider: import_lib.default.string(),
			model: import_lib.default.string(),
			role: import_lib.default.string().required()
		})).default([])
	}).default({
		list: [],
		rules: []
	}),
	cooldownMs: import_lib.default.number().default(3e5),
	revertPolicy: import_lib.default.union([import_lib.default.const("cooldown-expiry"), import_lib.default.const("never")]).default("cooldown-expiry"),
	maxSwitchesPerStep: import_lib.default.number().default(8),
	alwaysModeRetryCap: import_lib.default.number().default(5)
});
//#endregion
//#region .build/host/chains.js
function resolveCandidate(entry, failing, modelExists) {
	let selector;
	try {
		selector = parseSelector(entry);
	} catch {
		return null;
	}
	if (selector.model === void 0) {
		const resolved = resolveWildcardEntry(failing.model, selector.provider);
		if (modelExists && !modelExists(resolved.provider, resolved.model)) return null;
		return resolved;
	}
	return selector;
}
function buildRoleEntries(roles, rootChain, role) {
	if (role.trim() === "inherit") return rootChain;
	const roleDef = roles.find((declared) => declared.id.trim() === role.trim());
	if (roleDef === void 0) return rootChain;
	return [...roleDef.chain ?? [], ...roleDef.fallback === "none" ? [] : rootChain];
}
function resolveChainViews(roles, rootChain, role, provider, model, warn = console.warn) {
	const failing = {
		provider,
		model
	};
	const entries = buildRoleEntries(roles, rootChain, role);
	if (role.trim() !== "inherit" && !roles.some((declared) => declared.id.trim() === role.trim())) warn(`llm-fallbacks: unknown role "${role}" — falling back to rootChain`);
	const all = [];
	const wildcard = [];
	for (const entry of entries) {
		let selector;
		try {
			selector = parseSelector(entry);
		} catch {
			continue;
		}
		const candidate = resolveCandidate(entry, failing);
		if (candidate === null) continue;
		all.push(candidate);
		wildcard.push(selector.model === void 0);
	}
	return {
		all,
		wildcard
	};
}
function selectCandidates(all, wildcard, filter, modelExists) {
	const surviving = [];
	for (let index = 0; index < all.length; index += 1) {
		const candidate = all[index];
		if (filter && !filter(candidate)) continue;
		if (modelExists && wildcard[index] && !modelExists(candidate.provider, candidate.model)) continue;
		surviving.push(candidate);
	}
	return surviving;
}
function hasWildcardEntry(roles, rootChain, role) {
	const entries = buildRoleEntries(roles, rootChain, role);
	for (const entry of entries) try {
		if (parseSelector(entry).model === void 0) return true;
	} catch {}
	return false;
}
function createCandidateFilter(options) {
	const { current, cooldown, failed, modelExists } = options;
	return (candidate) => {
		if (candidate.provider === current.provider && candidate.model === current.model) return false;
		if (cooldown.isSuppressed(selectorKey(candidate.provider, candidate.model))) return false;
		if (failed.has(selectorKey(candidate.provider, candidate.model))) return false;
		if (modelExists && candidate.model !== void 0 && !modelExists(candidate.provider, candidate.model)) return false;
		return true;
	};
}
function annotateCandidates(candidates, surviving, options) {
	const { current, cooldown, failed } = options;
	const usable = new Set(surviving.map((candidate) => selectorKey(candidate.provider, candidate.model)));
	return candidates.map((candidate) => {
		if (candidate.provider === current.provider && candidate.model === current.model) return {
			candidate,
			skip: "same-as-current"
		};
		const key = selectorKey(candidate.provider, candidate.model);
		if (usable.has(key)) return { candidate };
		if (cooldown.isSuppressed(key)) return {
			candidate,
			skip: "cooldown"
		};
		if (failed.has(key)) return {
			candidate,
			skip: "step-failed"
		};
		return {
			candidate,
			skip: "missing-id"
		};
	});
}
//#endregion
//#region .build/host/roles.js
function resolveRole(agent, rules, roleIds, warn = console.warn) {
	const origin = agent.session?.header?.origin ?? "root";
	for (const rule of rules) {
		if (rule.origin && rule.origin !== origin) continue;
		if (rule.provider && rule.provider !== agent.options?.provider) continue;
		if (rule.model && rule.model !== agent.options?.model) continue;
		const target = rule.role.trim();
		if (target === "inherit") return INHERIT_ROLE_ID;
		const declared = roleIds.get(target);
		if (declared === void 0) {
			warn(`llm-fallbacks: rule references undeclared role "${rule.role}" — falling back to "inherit"`);
			return INHERIT_ROLE_ID;
		}
		return declared;
	}
	return INHERIT_ROLE_ID;
}
//#endregion
//#region .build/host/cooldown.js
var CooldownStore = class {
	entries = new Map();
	get size() {
		return this.entries.size;
	}
	suppress(key, untilEpochMs) {
		this.entries.set(key, untilEpochMs);
	}
	isSuppressed(key, now = Date.now()) {
		const until = this.entries.get(key);
		if (until === void 0) return false;
		if (until <= now) {
			this.entries.delete(key);
			return false;
		}
		return true;
	}
	snapshot(now = Date.now()) {
		const active = [];
		for (const [key, until] of this.entries) {
			if (until <= now) continue;
			active.push({
				key,
				untilEpochMs: until
			});
		}
		return active;
	}
};
var StepFailureSet = class {
	keys = new Set();
	get size() {
		return this.keys.size;
	}
	add(key) {
		this.keys.add(key);
	}
	has(key) {
		return this.keys.has(key);
	}
	reset() {
		this.keys.clear();
	}
};
//#endregion
//#region .build/host/state.js
var FallbackStateStore = class {
	states = new Map();
	get size() {
		return this.states.size;
	}
	has(agentId) {
		return this.states.has(agentId);
	}
	peek(agentId) {
		return this.states.get(agentId);
	}
	get(agentId) {
		let state = this.states.get(agentId);
		if (state === void 0) {
			state = {
				stepFailures: {
					turn: 0,
					step: 0,
					failed: new StepFailureSet(),
					switchCount: 0
				},
				cooldown: new CooldownStore()
			};
			this.states.set(agentId, state);
		}
		return state;
	}
	delete(agentId) {
		this.states.delete(agentId);
	}
	clear() {
		this.states.clear();
	}
	syncStep(state, turn, step) {
		const { stepFailures } = state;
		if (stepFailures.turn === turn && stepFailures.step === step) return;
		stepFailures.turn = turn;
		stepFailures.step = step;
		stepFailures.failed.reset();
		stepFailures.switchCount = 0;
	}
	recordFailure(state, key) {
		state.stepFailures.failed.add(key);
	}
	recordSwitch(state) {
		state.stepFailures.switchCount += 1;
	}
	writePending(state, pending) {
		state.pendingSwitch = pending;
		state.appliedTurnStep = void 0;
	}
	applyPending(state, turn, step) {
		const pending = state.pendingSwitch;
		if (pending === void 0) return void 0;
		const applied = state.appliedTurnStep;
		if (applied !== void 0 && applied.turn === turn && applied.step === step) return void 0;
		state.appliedTurnStep = {
			turn,
			step
		};
		state.pendingSwitch = void 0;
		return pending;
	}
	clearStepState(state) {
		state.pendingSwitch = void 0;
		state.appliedTurnStep = void 0;
		state.stepFailures.failed.reset();
		state.stepFailures.switchCount = 0;
	}
	suppress(state, key, untilEpochMs) {
		state.cooldown.suppress(key, untilEpochMs);
	}
	isSuppressed(state, key, now = Date.now()) {
		return state.cooldown.isSuppressed(key, now);
	}
};
//#endregion
//#region .build/host/gateway.js
const FALLBACKS_SETTINGS_NAMESPACE = settingsNamespace("fallbacks");
const CONFIG_KEYS = {
	enabled: true,
	triggerCodes: true,
	rootChain: true,
	roles: true,
	cooldownMs: true,
	revertPolicy: true,
	maxSwitchesPerStep: true,
	alwaysModeRetryCap: true
};
const ROLES_KEYS = {
	list: true,
	rules: true
};
var FallbacksConfigGateway = class extends TypertRemoteService {
	bridge;
	settings;
	constructor(ctx, bridge) {
		super(ctx, "fallbacks");
		this.bridge = bridge;
		ctx.inject(["settings"], (sctx) => {
			this.settings = sctx.settings;
			return () => {
				this.settings = void 0;
			};
		});
	}
	get() {
		return this.readResult();
	}
	async set(patch) {
		validateConfigPatch(patch);
		if (Object.keys(patch).length === 0) return this.readResult();
		const settings = this.settings;
		if (settings === void 0) throw new Error("fallbacks: settings service is unavailable — configuration cannot be written");
		const normalized = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== null));
		if (Object.keys(normalized).length === 0) return this.readResult();
		await settings.update(FALLBACKS_SETTINGS_NAMESPACE, normalized);
		return this.readResult();
	}
	async reset() {
		const settings = this.settings;
		if (settings === void 0) throw new Error("fallbacks: settings service is unavailable — configuration cannot be written");
		await settings.replace(FALLBACKS_SETTINGS_NAMESPACE, {});
		return this.readResult();
	}
	readConfig(source = this.bridge.source()) {
		const wire = {};
		for (const key of Object.keys(CONFIG_KEYS)) {
			const value = source[key];
			if (value === void 0) continue;
			wire[key] = key === "roles" ? normalizeRoles(value) : value;
		}
		return wire;
	}
	readResult() {
		const source = this.bridge.source();
		return {
			config: this.readConfig(source),
			legacyKeys: detectLegacyKeys(source)
		};
	}
};
function normalizeRoles(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
	const roles = {};
	for (const field of ["list", "rules"]) {
		const member = value[field];
		if (member !== void 0) roles[field] = member;
	}
	return roles;
}
function validateConfigPatch(patch) {
	if (patch === null || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("dsh-llm-fallbacks: configuration patch must be a plain object");
	for (const key of Object.keys(patch)) {
		if (!Object.hasOwn(CONFIG_KEYS, key)) throw new Error(`dsh-llm-fallbacks: unknown config key "${key}"`);
		if (key === "roles") {
			const roles = patch[key];
			if (roles !== null && typeof roles === "object" && !Array.isArray(roles)) {
				for (const nestedKey of Object.keys(roles)) if (!Object.hasOwn(ROLES_KEYS, nestedKey)) throw new Error(`dsh-llm-fallbacks: unknown config key "roles.${nestedKey}"`);
			}
		}
	}
	Config(patch);
}
function fallbacksTypertContribution() {
	return {
		package: "dsh-llm-fallbacks",
		face: "host",
		schemas: [],
		model: {
			services: [],
			events: [],
			objects: []
		},
		invocations: [
			{
				id: "dsh-llm-fallbacks#fallbacks/get",
				service: "fallbacks",
				namespace: "fallbacks",
				method: "get",
				invocation: { kind: "direct" },
				parameters: [],
				result: { mode: "src-json" }
			},
			{
				id: "dsh-llm-fallbacks#fallbacks/set",
				service: "fallbacks",
				namespace: "fallbacks",
				method: "set",
				invocation: { kind: "direct" },
				parameters: [{
					name: "patch",
					wire: "patch",
					source: "json",
					codec: { mode: "src-json" }
				}],
				result: { mode: "src-json" }
			},
			{
				id: "dsh-llm-fallbacks#fallbacks/reset",
				service: "fallbacks",
				namespace: "fallbacks",
				method: "reset",
				invocation: { kind: "direct" },
				parameters: [],
				result: { mode: "src-json" }
			}
		]
	};
}
//#endregion
//#region .build/host/commands.js
const FALLBACKS_COMMAND_LOCALES = {
	zh: {
		title: "当前会话 fallback 诊断（只读）",
		description: "查看当前会话的降级链、最近切换与冷却状态（只读）",
		origin: "会话来源",
		role: "角色",
		chain: "链",
		inheritRoot: "（inherit-root）",
		chainNone: "未配置",
		switches: "最近切换",
		switchesNone: "本会话暂无 fallback 切换",
		switchLine: "{from} → {to}（role={role}，reason={reason}）",
		cooldown: "冷却",
		cooldownNone: "无活跃冷却",
		cooldownLine: "{key} 冷却至 {time}",
		cooldownNever: "{key} 会话内不再回主",
		reason: {
			"trigger-code": "触发码",
			"always-cap": "always 上限"
		}
	},
	en: {
		title: "Session fallback diagnostics (read-only)",
		description: "Inspect fallback chain, recent switches, and cooldown for this session (read-only)",
		origin: "Session origin",
		role: "Role",
		chain: "Chain",
		inheritRoot: " (inherit-root)",
		chainNone: "not configured",
		switches: "Recent switches",
		switchesNone: "No fallback switches in this session",
		switchLine: "{from} → {to} (role={role}, reason={reason})",
		cooldown: "Cooldown",
		cooldownNone: "none active",
		cooldownLine: "{key} suppressed until {time}",
		cooldownNever: "{key} not reverting this session",
		reason: {
			"trigger-code": "trigger-code",
			"always-cap": "always-cap"
		}
	}
};
function isFallbacksSwitchData(data) {
	if (typeof data !== "object" || data === null) return false;
	const payload = data;
	if (typeof payload.turn !== "number" || typeof payload.step !== "number") return false;
	if (typeof payload.role !== "string" || typeof payload.reason !== "string") return false;
	const from = payload.from;
	const to = payload.to;
	return typeof from?.provider === "string" && typeof from?.model === "string" && typeof to?.provider === "string" && typeof to?.model === "string";
}
function recentFallbacksSwitches(events, limit) {
	const found = [];
	for (let index = events.length - 1; index >= 0 && found.length < limit; index -= 1) {
		const event = events[index];
		if (event?.type !== "fallbacks/switch") continue;
		if (!isFallbacksSwitchData(event.data)) continue;
		found.push(event.data);
	}
	return found;
}
function resolveChainForDiagnostic(roles, rootChain, role, warn = console.warn) {
	if (role.trim() === "inherit") return {
		chainRole: false,
		chain: rootChain,
		inherit: rootChain.length > 0
	};
	const roleDef = roles.find((declared) => declared.id.trim() === role.trim());
	if (roleDef === void 0) warn(`llm-fallbacks: unknown role "${role}" — falling back to rootChain`);
	const roleChain = roleDef?.chain ?? [];
	const chain = roleChain.length > 0 ? roleChain : roleDef?.fallback === "none" ? [] : rootChain;
	const inherit = rootChain.length > 0 && (roleDef === void 0 || roleDef.fallback !== "none");
	return {
		chainRole: roleChain.length > 0,
		chain,
		inherit
	};
}
function formatSwitch(entry, t) {
	const from = `${entry.from.provider}/${entry.from.model}`;
	const to = `${entry.to.provider}/${entry.to.model}`;
	return t.switchLine.replace("{from}", from).replace("{to}", to).replace("{role}", entry.role).replace("{reason}", t.reason[entry.reason] ?? entry.reason);
}
function formatCooldown(entry, t) {
	if (!Number.isFinite(entry.untilEpochMs)) return t.cooldownNever.replace("{key}", entry.key);
	return t.cooldownLine.replace("{key}", entry.key).replace("{time}", new Date(entry.untilEpochMs).toISOString());
}
function fallbacksCommandText(snapshot, locale = "zh") {
	const t = FALLBACKS_COMMAND_LOCALES[locale];
	const lines = [t.title];
	lines.push(`${t.origin}: ${snapshot.origin}`);
	lines.push(`${t.role}: ${snapshot.role}`);
	if (snapshot.chain.length === 0) lines.push(`${t.chain}: ${t.chainNone}`);
	else {
		const suffix = snapshot.inherit ? t.inheritRoot : "";
		lines.push(`${t.chain}: ${snapshot.chain.join(" → ")}${suffix}`);
	}
	if (snapshot.switches.length === 0) lines.push(`${t.switches}: ${t.switchesNone}`);
	else {
		lines.push(`${t.switches} (${snapshot.switches.length}):`);
		for (const entry of snapshot.switches) lines.push(`  · ${formatSwitch(entry, t)}`);
	}
	if (snapshot.cooldown.length === 0) lines.push(`${t.cooldown}: ${t.cooldownNone}`);
	else {
		lines.push(`${t.cooldown} (${snapshot.cooldown.length}):`);
		for (const entry of snapshot.cooldown) lines.push(`  · ${formatCooldown(entry, t)}`);
	}
	return lines.join("\n");
}
function createFallbacksCommandHandler(controller, locale = "zh") {
	return (invocation) => ({
		kind: "success",
		text: fallbacksCommandText(controller.getSnapshot(invocation.agent), locale)
	});
}
function registerFallbacksCommands(registry, controller, locale = "zh") {
	return registry.register({
		name: "fallbacks",
		description: FALLBACKS_COMMAND_LOCALES[locale].description,
		input: { hint: "" },
		handler: createFallbacksCommandHandler(controller, locale)
	});
}
//#endregion
//#region .build/host/index.js
const name = "llm-fallbacks";
const stateStores = new WeakMap();
function stateStore(ctx) {
	return stateStores.get(ctx);
}
async function makeModelExists(ctx, providers) {
	const llm = ctx.get("llm");
	if (llm === void 0 || typeof llm.listModels !== "function") return () => true;
	const catalog = new Map();
	await Promise.all(providers.map(async (provider) => {
		try {
			const models = await llm.listModels(provider);
			catalog.set(provider, new Set(models.map((model) => model.id)));
		} catch {
			catalog.set(provider, new Set());
		}
	}));
	return (provider, model) => catalog.get(provider)?.has(model) ?? false;
}
function countRetryEvents(session, turn, step, provider) {
	let count = 0;
	const events = session.events;
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		const data = event.data;
		if (typeof data.turn === "number" && typeof data.step === "number" && (data.turn < turn || data.turn === turn && data.step < step)) break;
		if (event.type !== "llm/retry") continue;
		if (data.turn === turn && data.step === step && event.data.provider === provider && event.data.mode === "always") count += 1;
	}
	return count;
}
function currentModel(agent, provider) {
	return {
		provider,
		model: agent.session.requestHeader()?.config.model ?? agent.options.model ?? ""
	};
}
function overrideConfig(seed, to) {
	const { reasoningEffort: _inherited, ...withoutInheritedEffort } = seed;
	return {
		...withoutInheritedEffort,
		provider: to.provider,
		model: to.model
	};
}
function apply(ctx, config = defaultFallbacksConfig) {
	const logger = ctx.logger("llm-fallbacks");
	const entry = Config(config);
	let source = () => entry;
	validateFallbacksConfig(entry, logger);
	const legacyKeys = detectLegacyKeys(source());
	if (legacyKeys.length > 0) logger.warn("llm-fallbacks: legacy config keys detected (chains/roles.default/undeclared role refs); see docs/configuration.md migration table — %o", legacyKeys);
	let roleIds = new Map(entry.roles.list.map((role) => [role.id.trim(), role.id]));
	let hasChains = entry.rootChain.length > 0 || entry.roles.list.some((role) => (role.chain?.length ?? 0) > 0);
	installSettingsSection(ctx, FALLBACKS_SETTINGS_NAMESPACE, Config, entry, {
		setSource: (current) => {
			source = current;
		},
		onChange: () => {
			const current = source();
			roleIds = new Map(current.roles.list.map((role) => [role.id.trim(), role.id]));
			hasChains = current.rootChain.length > 0 || current.roles.list.some((role) => (role.chain?.length ?? 0) > 0);
		}
	});
	const bridge = { source: () => source() };
	try {
		new FallbacksConfigGateway(ctx, bridge);
	} catch (error) {
		if (!(error instanceof Error) || !error.message.includes("has been registered")) throw error;
		ctx.logger("llm-fallbacks").debug("fallbacks gateway already registered — no gateway on this fiber (multi-fiber dedupe)");
	}
	ctx.inject(["typert"], (tctx) => {
		try {
			return tctx.typert.register(fallbacksTypertContribution());
		} catch (error) {
			if (!(error instanceof Error) || !error.message.includes("already registered")) throw error;
			tctx.logger("llm-fallbacks").debug("fallbacks typert endpoints already registered — no endpoints on this fiber (multi-fiber dedupe)");
			return () => {};
		}
	});
	const states = new FallbackStateStore();
	stateStores.set(ctx, states);
	async function decide(agent, turn, step, current, reason, state) {
		const config = source();
		if (state !== void 0) {
			states.syncStep(state, turn, step);
			if (state.stepFailures.switchCount >= config.maxSwitchesPerStep) return null;
		}
		const role = resolveRole(agent, config.roles.rules, roleIds, logger.warn);
		const { all, wildcard } = resolveChainViews(config.roles.list, config.rootChain, role, current.provider, current.model, logger.warn);
		if (all.length === 0) return null;
		const modelExists = hasWildcardEntry(config.roles.list, config.rootChain, role) ? await makeModelExists(ctx, [...new Set(all.map((candidate) => candidate.provider))]) : void 0;
		const cooldown = { isSuppressed: (key) => state !== void 0 && states.isSuppressed(state, key) };
		const failed = { has: (key) => state !== void 0 && state.stepFailures.failed.has(key) };
		const surviving = selectCandidates(all, wildcard, createCandidateFilter({
			current,
			cooldown,
			failed
		}), modelExists);
		const target = surviving[0];
		if (target === void 0 || target.model === void 0) return null;
		logger.info("llm-fallbacks: agent \"%s\" switch %s/%s -> %s/%s (role=%s, reason=%s, candidates=%o)", agent.id, current.provider, current.model, target.provider, target.model, role, reason, annotateCandidates(all, surviving, {
			current,
			cooldown,
			failed
		}).map(({ candidate, skip }) => skip === void 0 ? `${candidate.provider}/${candidate.model}` : `${candidate.provider}/${candidate.model} (skipped: ${skip})`));
		return {
			from: {
				provider: current.provider,
				model: current.model
			},
			to: {
				provider: target.provider,
				model: target.model
			},
			role,
			reason
		};
	}
	function commit(agent, state, pending, turn, step) {
		const config = source();
		const fromKey = selectorKey(pending.from.provider, pending.from.model);
		const until = config.revertPolicy === "never" ? Number.POSITIVE_INFINITY : Date.now() + config.cooldownMs;
		states.syncStep(state, turn, step);
		states.writePending(state, pending);
		states.suppress(state, fromKey, until);
		states.recordFailure(state, fromKey);
		states.recordSwitch(state);
		agent.session.append("fallbacks/switch", {
			turn,
			step,
			from: pending.from,
			to: pending.to,
			role: pending.role,
			reason: pending.reason
		});
	}
	ctx.on("agent/request-error", async ({ agent, turn, step, provider, failure }, next) => {
		const config = source();
		if (!config.enabled || !config.triggerCodes.includes(failure.code)) return next();
		const current = currentModel(agent, provider);
		if (!current.model) return next();
		try {
			const pending = await decide(agent, turn, step, current, "trigger-code", states.peek(agent.id));
			if (pending === null) return next();
			commit(agent, states.get(agent.id), pending, turn, step);
			return { kind: "retry" };
		} catch (error) {
			logger.warn("llm-fallbacks: decision path failed, passing the original failure through: %s", error?.message ?? String(error));
			return next();
		}
	});
	ctx.on("agent/request", async ({ agent, turn, step }, next) => {
		const seed = await next();
		const state = states.peek(agent.id);
		const applied = state === void 0 ? void 0 : states.applyPending(state, turn, step);
		if (applied !== void 0) return overrideConfig(seed, applied.to);
		const config = source();
		if (hasChains && config.enabled && config.alwaysModeRetryCap > 0 && countRetryEvents(agent.session, turn, step, seed.provider) >= config.alwaysModeRetryCap) {
			const decisionState = states.peek(agent.id);
			const pending = await decide(agent, turn, step, {
				provider: seed.provider,
				model: seed.model
			}, "always-cap", decisionState);
			if (pending !== null) {
				const commitState = states.get(agent.id);
				commit(agent, commitState, pending, turn, step);
				const appliedCap = states.applyPending(commitState, turn, step);
				if (appliedCap !== void 0) return overrideConfig(seed, appliedCap.to);
			}
		}
		return seed;
	});
	ctx.on("agent/status", ({ agent, status }) => {
		if (status !== "idle") return;
		const state = states.peek(agent.id);
		if (state !== void 0) states.clearStepState(state);
	});
	ctx.on("agent/disposed", ({ agent }) => {
		states.delete(agent.id);
	});
	ctx.effect(() => () => {
		states.clear();
	}, "llm-fallbacks: clear per-agent state");
	const fallbacksCommandController = { getSnapshot(agent) {
		const config = source();
		const role = resolveRole(agent, config.roles.rules, roleIds, logger.warn);
		const state = states.peek(agent.id);
		return {
			origin: agent.session.header?.origin ?? "root",
			role,
			...resolveChainForDiagnostic(config.roles.list, config.rootChain, role, logger.warn),
			switches: recentFallbacksSwitches(agent.session.events, 5),
			cooldown: state === void 0 ? [] : state.cooldown.snapshot()
		};
	} };
	ctx.inject(["commands"], (commandCtx) => {
		return registerFallbacksCommands(commandCtx.commands, fallbacksCommandController);
	});
}
//#endregion
export { Config, apply, countRetryEvents, name, stateStore };
