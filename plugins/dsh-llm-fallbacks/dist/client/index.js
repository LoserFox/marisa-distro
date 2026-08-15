window.__ModuleLoader__.load({
	id: "dsh-llm-fallbacks",
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
		let _deepseek_ai_dsh_client_web_react = require("@deepseek-ai/dsh-client-web-react");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region node_modules/cosmokit/lib/index.cjs
		var require_lib$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
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
				return Array.from(/* @__PURE__ */ new Set([...array1, ...array2]));
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
			function clone(source, refs = /* @__PURE__ */ new Map()) {
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
				let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
				function setTimezoneOffset(offset) {
					timezoneOffset = offset;
				}
				Time2.setTimezoneOffset = setTimezoneOffset;
				function getTimezoneOffset() {
					return timezoneOffset;
				}
				Time2.getTimezoneOffset = getTimezoneOffset;
				function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
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
					else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
					else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
					return date ? new Date(date) : /* @__PURE__ */ new Date();
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
				function template(template2, time = /* @__PURE__ */ new Date()) {
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
		//#region src/selectors.ts
		var import_lib = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
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
			var Schema = /* @__PURE__ */ __name(function(options) {
				const schema = /* @__PURE__ */ __name(function(data, options2 = {}) {
					return Schema.resolve(data, schema, options2)[0];
				}, "schema");
				if (options.refs) {
					const refs = (0, import_cosmokit.valueMap)(options.refs, (options2) => new Schema(options2));
					const getRef = /* @__PURE__ */ __name((uid) => refs[uid], "getRef");
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
					validate: /* @__PURE__ */ __name((value) => {
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
			Schema.prototype.toJSON = /* @__PURE__ */ __name(function toJSON() {
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
			Schema.prototype.set = /* @__PURE__ */ __name(function set(key, value) {
				this.dict[key] = value;
				return this;
			}, "set");
			Schema.prototype.push = /* @__PURE__ */ __name(function push(value) {
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
			Schema.prototype.i18n = /* @__PURE__ */ __name(function i18n(messages) {
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
			Schema.prototype.extra = /* @__PURE__ */ __name(function extra(key, value) {
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
			Schema.prototype.deprecated = /* @__PURE__ */ __name(function deprecated() {
				const schema = Schema(this);
				schema.meta.badges ||= [];
				schema.meta.badges.push({
					text: "deprecated",
					type: "danger"
				});
				return schema;
			}, "deprecated");
			Schema.prototype.experimental = /* @__PURE__ */ __name(function experimental() {
				const schema = Schema(this);
				schema.meta.badges ||= [];
				schema.meta.badges.push({
					text: "experimental",
					type: "warning"
				});
				return schema;
			}, "experimental");
			Schema.prototype.pattern = /* @__PURE__ */ __name(function pattern(regexp) {
				const schema = Schema(this);
				const pattern2 = (0, import_cosmokit.pick)(regexp, ["source", "flags"]);
				schema.meta = {
					...schema.meta,
					pattern: pattern2
				};
				return schema;
			}, "pattern");
			Schema.prototype.simplify = /* @__PURE__ */ __name(function simplify(value) {
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
			Schema.prototype.toString = /* @__PURE__ */ __name(function toString(inline) {
				return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
			}, "toString");
			Schema.prototype.role = /* @__PURE__ */ __name(function role(role, extra2) {
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
			Schema.extend = /* @__PURE__ */ __name(function extend(type, resolve2) {
				resolvers[type] = resolve2;
			}, "extend");
			Schema.resolve = /* @__PURE__ */ __name(function resolve(data, schema, options = {}, strict = false) {
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
			Schema.from = /* @__PURE__ */ __name(function from(source) {
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
			Schema.lazy = /* @__PURE__ */ __name(function lazy(builder) {
				const schema = new Schema({
					type: "lazy",
					builder,
					inner: { toJSON: /* @__PURE__ */ __name(() => {
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
			Schema.natural = /* @__PURE__ */ __name(function natural() {
				return Schema.number().step(1).min(0);
			}, "natural");
			Schema.percent = /* @__PURE__ */ __name(function percent() {
				return Schema.number().step(.01).min(0).max(1).role("slider");
			}, "percent");
			Schema.date = /* @__PURE__ */ __name(function date() {
				return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
					const date2 = new Date(value);
					if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
					return date2;
				}, true)]);
			}, "date");
			Schema.regExp = /* @__PURE__ */ __name(function regExp(flag = "") {
				return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
					try {
						return new RegExp(value, flag);
					} catch (e) {
						throw new ValidationError(e.message, options);
					}
				}, true)]);
			}, "regExp");
			Schema.arrayBuffer = /* @__PURE__ */ __name(function arrayBuffer(encoding) {
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
		})))(), 1);
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
		* on anything else (missing separator, empty parts, extra separators).
		*/
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
		//#endregion
		//#region src/config.ts
		/**
		* The `fallbacks` settings namespace: plugin config schema + defaults.
		*
		* Two-block config model (plan fallbacks-role-config-model): block 1
		* `rootChain` — the root agent's single fallback chain (empty = no
		* degradation) — plus block 2 declared role entities: `roles.list`
		* (id/label/description/prompt?/permissions?/chain?/fallback) and
		* `roles.rules` enum references into the declared ids (or the built-in
		* `'inherit'` role). The legacy `chains` / `roles.default` keys are gone
		* from the schema and type (zero residual, migration table excepted); the
		* runtime consumes the new shape directly and flags surviving legacy keys
		* at startup via `detectLegacyKeys` (see `src/index.ts` apply()).
		*
		* Spec §4 is authoritative for field names and default values — notably
		* `triggerCodes` defaults to dsh's stable failure codes `['AUTH', 'QUOTA',
		* 'RATE_LIMIT']` (there is no `QUOTA_EXCEEDED` code in dsh), and an
		* unconfigured install (`enabled: false`, empty `rootChain`, empty roles)
		* is a no-op pass-through exactly like an uninstalled plugin (AC-8).
		*
		* This module is pure logic: it must not import any `@deepseek-ai/*` package
		* (types included) — `FallbacksConfig` is the plugin's own type. Task 3
		* registers this schema with `installSettingsSection` under the `fallbacks`
		* settings namespace.
		*
		* @module dsh-llm-fallbacks/config
		*/
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
			alwaysModeRetryCap: 5
		};
		/**
		* Reserved role id: legal as a rule target (`roles.rules[].role`) and as
		* the no-rule-match fallback, but FORBIDDEN in `roles.list[].id`.
		*/
		const INHERIT_ROLE_ID = "inherit";
		/** Role id format (aligned with yet-another-subagent `isValidProfileId`). */
		const ROLE_ID_PATTERN = /^[a-z0-9-]{1,32}$/;
		import_lib.default.object({
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
		* Read a nested value by path — the `@deepseek-ai/dsh-client-schema-form`
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
				const label = role.label;
				if (label !== void 0 && typeof label !== "string") throw new TypeError(`fallbacks descriptor roles.list[${String(index)}].label must be a string`);
				const description = role.description;
				if (description !== void 0 && typeof description !== "string") throw new TypeError(`fallbacks descriptor roles.list[${String(index)}].description must be a string`);
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
					label: label ?? "",
					description: description ?? "",
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
			const enabled = value.enabled;
			if (enabled !== void 0 && typeof enabled !== "boolean") throw new TypeError("fallbacks descriptor enabled must be a boolean");
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
				alwaysModeRetryCap: alwaysModeRetryCap ?? defaultFallbacksConfig.alwaysModeRetryCap
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
		/** The config's primary target: the rootChain's first entry (D-6 ③). */
		function configPrimaryTarget(config) {
			const firstEntry = config.rootChain[0];
			if (firstEntry === void 0) return null;
			try {
				const selector = parseSelector(firstEntry);
				return {
					provider: selector.provider,
					model: selector.model ?? "*"
				};
			} catch {
				return {
					provider: firstEntry,
					model: "*"
				};
			}
		}
		/**
		* Derive the status block's "current effective model" (spec §2.5 D-6): ①
		* disabled / empty rootChain → unavailable; ② a recent switch exists → the
		* latest one's `to`; ③ otherwise → the config's primary target. A **display
		* value** — never a live route probe (the section appends the non-probing
		* note inline right after the derived value, available case only; the
		* unavailable 空态 renders its own copy without the note).
		*/
		function deriveEffectiveModel(config, switches) {
			if (!config.enabled || config.rootChain.length === 0) return { kind: "unavailable" };
			const latest = switches[0];
			if (latest !== void 0) return {
				kind: "switched",
				provider: latest.to.provider,
				model: latest.to.model
			};
			const target = configPrimaryTarget(config);
			if (target === null) return { kind: "unavailable" };
			return {
				kind: "config",
				...target
			};
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
		/** Project the declared roles into editable rows (chain selectors classified). */
		function rolesToRows(roles, catalog) {
			return roles.map((role) => ({
				id: role.id,
				label: role.label,
				description: role.description,
				selectors: (role.chain ?? []).map((entry) => entryToSelectorRow(entry, catalog)),
				fallback: role.fallback ?? "inherit-root"
			}));
		}
		/** Rebuild the declared roles from edited rows; empty selectors drop out. */
		function rowsToRoles(rows) {
			return rows.map((row) => ({
				id: row.id.trim(),
				label: row.label,
				description: row.description,
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
					label: role.label,
					description: role.description,
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
				origin: rule.origin ?? "",
				provider: classifyProvider(rule.provider ?? "", catalog),
				model: classifyModel(rule.provider ?? "", rule.model ?? "", catalog),
				role: rule.role
			}));
		}
		/** Rebuild the role rules from edited rows; empty origin/provider/model drop out. */
		function rowsToRules(rows) {
			return rows.map((row) => ({
				...row.origin === "" ? {} : { origin: row.origin },
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
			generation = 0;
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
				const generation = ++this.generation;
				this.store.update((state) => {
					state.status = "loading";
					state.error = null;
				});
				try {
					const [describeResult, getResult] = await Promise.all([this.api.settings.describe({}), this.rpc.call("/api", "fallbacks/get", { args: {} }).catch(() => void 0)]);
					if (generation !== this.generation) return;
					if (!describeResult.result.ok) throw describeResult.result.error;
					this.namespaces = new Map(describeResult.result.value.namespaces.map((entry) => [entry.ns, entry]));
					const writable = describeResult.result.value.writable;
					let config;
					let legacyKeys = [];
					if (getResult !== void 0 && getResult.ok && getResult.value !== null && typeof getResult.value === "object") {
						if ("config" in getResult.value) config = getResult.value.config;
						if ("legacyKeys" in getResult.value) {
							const wireLegacyKeys = getResult.value.legacyKeys;
							if (Array.isArray(wireLegacyKeys)) legacyKeys = wireLegacyKeys.filter((key) => typeof key === "string");
						}
					}
					this.accept(config, writable, legacyKeys);
				} catch (error) {
					if (generation !== this.generation) return;
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
				const generation = ++this.generation;
				this.store.update((draft) => {
					draft.status = "saving";
					draft.error = null;
				});
				try {
					const result = await this.rpc.call("/api", "fallbacks/set", { args: { patch: next } });
					if (generation !== this.generation) return;
					if (!result.ok) throw result.error;
					const value = result.value;
					const config = value !== null && typeof value === "object" && "config" in value ? value.config : void 0;
					let legacyKeys = this.store.getSnapshot().legacyKeys;
					if (value !== null && typeof value === "object" && "legacyKeys" in value) {
						const wireLegacyKeys = value.legacyKeys;
						if (Array.isArray(wireLegacyKeys)) legacyKeys = wireLegacyKeys.filter((key) => typeof key === "string");
					}
					this.accept(config, true, legacyKeys);
				} catch (error) {
					if (generation !== this.generation) return;
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
				const generation = ++this.generation;
				this.store.update((draft) => {
					draft.status = "saving";
					draft.error = null;
				});
				try {
					const result = await this.rpc.call("/api", "fallbacks/reset", { args: {} });
					if (generation !== this.generation) return;
					if (!result.ok) throw result.error;
					const value = result.value;
					const config = value !== null && typeof value === "object" && "config" in value ? value.config : void 0;
					let legacyKeys = this.store.getSnapshot().legacyKeys;
					if (value !== null && typeof value === "object" && "legacyKeys" in value) {
						const wireLegacyKeys = value.legacyKeys;
						if (Array.isArray(wireLegacyKeys)) legacyKeys = wireLegacyKeys.filter((key) => typeof key === "string");
					}
					this.accept(config, true, legacyKeys);
				} catch (error) {
					if (generation !== this.generation) return;
					this.fail(error);
				}
			}
			/** Stop in-flight responses from publishing after plugin disposal. */
			dispose() {
				this.generation += 1;
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
			* against server truth; only a real `get` may.
			*/
			accept(config, writable, legacyKeys) {
				const parsed = config === void 0 ? void 0 : parseFallbacksConfig(config);
				this.store.update((state) => {
					state.status = "ready";
					state.error = null;
					state.writable = writable;
					state.present = parsed !== void 0;
					state.legacyKeys = parsed === void 0 ? state.legacyKeys : legacyKeys;
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
			"rootChain.label": "root 主代理降级链",
			"rootChain.hint": "未配置 = root 不降级",
			"rootChain.tooltip": "root 主代理失败时按此有序选择器列表依次降级；未配置时行为与未安装插件一致。",
			"rootChain.selector.add": "添加选择器",
			"chains.selector.remove": "删除该选择器",
			"chains.selector.providerPlaceholder": "选择 provider",
			"chains.selector.modelPlaceholder": "选择 model",
			"chains.selector.wildcard": "通配该 provider（provider/*）",
			"chains.selector.noModels": "该 provider 暂无可用模型（目录查询失败），请使用通配或改选。",
			"roles.list.label": "角色实体",
			"roles.list.hint": "先声明角色，规则才能引用",
			"roles.list.tooltip": "角色 id 须匹配 /^[a-z0-9-]{1,32}$/ 且唯一；\"inherit\" 为保留字，不能用作角色 id。",
			"roles.id": "id",
			"roles.id.hint": "小写字母/数字/连字符，1–32 字符",
			"roles.idPlaceholder": "例如 reviewer",
			"roles.label": "名称",
			"roles.description": "描述",
			"roles.fallback": "链拼接策略",
			"roles.fallback.inherit-root": "继承 root（角色链后追加 rootChain）",
			"roles.fallback.none": "仅角色链（不追加 rootChain）",
			"roles.add": "添加角色",
			"roles.remove": "删除该角色",
			"roles.selector.add": "添加选择器",
			"roles.rules": "角色规则",
			"roles.rules.hint": "顺序匹配 origin/provider/model，未命中 → inherit（root 链）",
			"roles.rules.tooltip": "规则命中后走对应角色的链；未命中走内置 inherit（rootChain）。",
			"roles.rule.origin": "来源",
			"roles.rule.origin.any": "任意",
			"roles.rule.origin.root": "root",
			"roles.rule.origin.subagent": "subagent",
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
			"status.effectiveModel.label": "当前生效模型：",
			"status.effectiveModel.unavailable": "fallbacks 未启用（或 rootChain 未配置）",
			"status.effectiveModel.note": "配置 + 最近切换推导，非实时路由探测",
			"status.switches.label": "最近切换：",
			"status.switches.empty": "本会话暂无 fallback 切换。",
			"status.switches.error": "切换历史读取失败：{message}",
			"status.switches.compact": "最近 {count} 次 · {from} → {to}（{role} · {reason}）",
			"status.switches.reason.trigger-code": "触发失败码",
			"status.switches.reason.always-cap": "always 模式上限",
			"status.selectionNote": "说明：web 前端手动选择的模型可能在切换后重新套用（标记载体已随本地 patch 移除）。",
			"general.title": "模型故障降级",
			"general.enabled": "已启用",
			"general.disabled": "未启用",
			"general.unknown": "未知",
			"general.unavailable": "状态通道暂不可达",
			"general.switch": "最近切换：{from} → {to}（{role} · {reason}）",
			"general.switch.empty": "本会话暂无切换",
			"general.error": "状态读取失败：{message}",
			"chat.switch.title": "模型切换",
			"chat.switch.summary": "{from} → {to}（{role} · {reason}）",
			"defaults.prefix": "默认值",
			"save": "保存",
			"save.saving": "保存中…",
			"save.error": "保存失败：{message}",
			"close": "关闭",
			"reset": "恢复默认",
			"reset.confirmTitle": "恢复默认配置",
			"reset.confirm": "恢复后 fallbacks 配置将回到插件默认值，当前编辑内容会丢失。",
			"reset.confirm.cancel": "取消",
			"reset.confirm.action": "恢复默认",
			"reset.saving": "恢复中…",
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
			"rootChain.label": "Root agent fallback chain",
			"rootChain.hint": "Unset = root does not fall back",
			"rootChain.tooltip": "When the root agent fails it falls back down this ordered selector list; unset behaves like an uninstalled plugin.",
			"rootChain.selector.add": "Add selector",
			"chains.selector.remove": "Remove this selector",
			"chains.selector.providerPlaceholder": "Select provider",
			"chains.selector.modelPlaceholder": "Select model",
			"chains.selector.wildcard": "Wildcard this provider (provider/*)",
			"chains.selector.noModels": "No models available for this provider (catalog lookup failed); use the wildcard or pick another provider.",
			"roles.list.label": "Declared roles",
			"roles.list.hint": "Declare roles before rules can reference them",
			"roles.list.tooltip": "Role ids must match /^[a-z0-9-]{1,32}$/ and be unique; \"inherit\" is reserved and cannot be used as a role id.",
			"roles.id": "ID",
			"roles.id.hint": "lowercase letters, digits, hyphens; 1–32 chars",
			"roles.idPlaceholder": "e.g. reviewer",
			"roles.label": "Label",
			"roles.description": "Description",
			"roles.fallback": "Chain append",
			"roles.fallback.inherit-root": "Inherit root (append rootChain after the role chain)",
			"roles.fallback.none": "Role chain only (no rootChain)",
			"roles.add": "Add role",
			"roles.remove": "Remove this role",
			"roles.selector.add": "Add selector",
			"roles.rules": "Role rules",
			"roles.rules.hint": "Matches origin/provider/model in order; no match → inherit (root chain)",
			"roles.rules.tooltip": "A matched rule uses that role's chain; no match uses the built-in inherit (rootChain).",
			"roles.rule.origin": "Origin",
			"roles.rule.origin.any": "Any",
			"roles.rule.origin.root": "root",
			"roles.rule.origin.subagent": "subagent",
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
			"status.effectiveModel.label": "Current effective model: ",
			"status.effectiveModel.unavailable": "Fallbacks disabled (or rootChain not configured)",
			"status.effectiveModel.note": "Derived from configuration and recent switches; not real-time route probing",
			"status.switches.label": "Recent switches: ",
			"status.switches.empty": "No fallback switches in this session yet.",
			"status.switches.error": "Switch history read failed: {message}",
			"status.switches.compact": "last {count} · {from} → {to} ({role} · {reason})",
			"status.switches.reason.trigger-code": "trigger code",
			"status.switches.reason.always-cap": "always-mode cap",
			"status.selectionNote": "Note: a model manually selected in the web front end may be re-applied after a switch (the marker coordination shipped with the local patch has been removed).",
			"general.title": "Model failover",
			"general.enabled": "Enabled",
			"general.disabled": "Disabled",
			"general.unknown": "Unknown",
			"general.unavailable": "Status channel unavailable",
			"general.switch": "Last switch: {from} → {to} ({role} · {reason})",
			"general.switch.empty": "No switches this session",
			"general.error": "Status read failed: {message}",
			"chat.switch.title": "Model switch",
			"chat.switch.summary": "{from} → {to} ({role} · {reason})",
			"defaults.prefix": "Default",
			"save": "Save",
			"save.saving": "Saving…",
			"save.error": "Save failed: {message}",
			"close": "Close",
			"reset": "Reset to defaults",
			"reset.confirmTitle": "Reset to defaults",
			"reset.confirm": "Resetting restores the fallbacks configuration to plugin defaults; your current edits will be lost.",
			"reset.confirm.cancel": "Cancel",
			"reset.confirm.action": "Reset",
			"reset.saving": "Resetting…",
			"loading": "Loading…",
			"unavailable": "The fallbacks config channel is unreachable: showing the default configuration (or the last read value). You can try to save; failures will be reported here.",
			"error.generic": "Error: {message}"
		};
		/** The settings section's dictionary namespace. */
		const NS = "fallbacks";
		/**
		* Reason → locale key map for switch summaries (S-c; shared by the card's
		* status block and the General page status row). The session log is durable
		* and forward-compatible: a reason value outside the current union (a newer
		* plugin wrote it) renders raw instead of falling into a binary else branch.
		*/
		const SWITCH_REASON_KEYS = {
			"trigger-code": "status.switches.reason.trigger-code",
			"always-cap": "status.switches.reason.always-cap"
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
		//#region \0dsh-css:/Users/bibi/workspace/ai/deepseek/dsh-llm-fallbacks/src/client/FallbacksCard.module.css.mjs
		const css$2 = "\n\n\n._8827595f_card {\n  list-style: none;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 12px;\n  background: var(--dsw-alias-bg-layer-3);\n  transition: border-color .16s, background .16s;\n}\n\n._8827595f_card:hover {\n  border-color: var(--dsw-alias-label-dimmed);\n}\n\n\n._06704203_cardOpen {\n  background: var(--dsw-alias-bg-layer-2);\n  border-color: var(--dsw-alias-label-dimmed);\n}\n\n\n._e488d460_header {\n  width: 100%;\n  appearance: none;\n  border: 0;\n  background: none;\n  font: inherit;\n  color: inherit;\n  text-align: left;\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 14px 16px;\n  border-radius: 12px;\n}\n\n._e488d460_header:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: -2px;\n}\n\n\n._f5dfe084_headText {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n._8d39bde6_name {\n  font-size: 15px;\n  font-weight: 600;\n  line-height: 1.4;\n  color: var(--dsw-alias-label-primary);\n}\n\n._346f3b69_description {\n  font-size: 13px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._631094a0_chevron {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  transition: transform .16s;\n}\n\n._44836ce8_chevronOpen {\n  transform: rotate(180deg);\n}\n\n\n._dbaa7975_body {\n  border-top: 1px solid var(--dsw-alias-border-l2);\n  margin: 0 16px;\n  padding-bottom: 8px;\n}\n\n._4e39cf17_readOnly {\n  margin: 12px 0 0;\n  font-size: 12px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n\n._99bf7f3c_pending {\n  flex: none;\n  border-radius: 999px;\n  padding: 1px 8px;\n  font-size: 11px;\n  line-height: 17px;\n  font-weight: 500;\n  white-space: nowrap;\n  background: var(--dsw-alias-bg-module-platform);\n  color: var(--dsw-alias-label-secondary);\n}\n\n._114985b2_footer {\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 8px;\n  padding: 12px 0 4px;\n  border-top: 1px solid var(--dsw-alias-border-l2);\n}\n\n\n._9860a5b1_notice {\n  margin: 12px 0 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-state-business-primary);\n}\n\n\n._5006d43e_legacyNotice {\n  margin: 12px 0 0;\n  padding: 10px 12px;\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-module-platform);\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-state-business-primary);\n}\n\n._21918751_error {\n  margin: 12px 0 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n\n._7cea4b2f_noticeRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin: 12px 0 0;\n}\n\n._7cea4b2f_noticeRow ._21918751_error {\n  flex: 1;\n  min-width: 0;\n  margin: 0;\n}\n\n\n._4058c747_form {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 12px 0 0;\n}\n\n\n._9998065c_checkboxRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n._02c2f6df_checkLabel {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  font-size: 14px;\n  line-height: 22px;\n  font-weight: 400;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n}\n\n._f2d47237_checkLabelTitle {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  font-weight: 400;\n}\n\n._c1bed8ea_checkLabelDesc {\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 400;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n\n._06389b18_checkbox {\n  flex: none;\n  width: 16px;\n  height: 16px;\n  margin: 0;\n  accent-color: var(--dsw-alias-brand-primary);\n  cursor: pointer;\n}\n\n._06389b18_checkbox:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n\n._94c91bfd_fieldset {\n  margin: 0;\n  padding: 0;\n  border: none;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n\n._67826267_field {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin: 0;\n  padding: 0;\n  border: none;\n  min-width: 0;\n}\n\n._13e68c3f_fieldLabel {\n  \n  display: inline-flex;\n  align-items: center;\n  gap: 10px;\n  padding: 0;\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n}\n\n._4bc809b8_hint {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._579f813a_defaultNote {\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 400;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n\n._a6244318_infoHint {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n  width: 16px;\n  height: 16px;\n  border-radius: 50%;\n  font-size: 14px;\n  line-height: 1;\n  color: var(--dsw-alias-label-tertiary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  cursor: help;\n  user-select: none;\n}\n\n._a6244318_infoHint:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n\n._e655c840_infoHintDisabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n\n._a2521bb0_optionRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 6px 8px;\n  border-radius: 6px;\n  font-size: 14px;\n  line-height: 22px;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n}\n\n._a2521bb0_optionRow:hover:has(input:not(:disabled)) {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n\n._06389b18_checkbox,\n._a2521bb0_optionRow input,\n._929f3ef3_wildcardCell input {\n  flex: none;\n  width: 16px;\n  height: 16px;\n  margin: 0;\n  accent-color: var(--dsw-alias-brand-primary);\n  cursor: pointer;\n}\n\n._06389b18_checkbox:focus-visible,\n._a2521bb0_optionRow input:focus-visible,\n._929f3ef3_wildcardCell input:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n._a2521bb0_optionRow input:disabled,\n._929f3ef3_wildcardCell input:disabled {\n  cursor: default;\n}\n\n\n._f9d86f7b_input {\n  box-sizing: border-box;\n  width: 100%;\n  height: 32px;\n  padding: 0 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  font: inherit;\n  font-size: 14px;\n  line-height: 22px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n}\n\n._f9d86f7b_input:focus {\n  outline: none;\n  border-color: var(--dsw-alias-brand-primary);\n}\n\n._f9d86f7b_input::placeholder {\n  color: var(--dsw-alias-label-dimmed);\n}\n\n._f9d86f7b_input:disabled {\n  opacity: 0.6;\n  cursor: default;\n}\n\n\n._7b60337a_inputInvalid,\n._7b60337a_inputInvalid:focus {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n\n\nselect._f9d86f7b_input {\n  max-width: 240px;\n  cursor: pointer;\n}\n\n\n._16eb7153_selectInput {\n  appearance: none;\n  padding-right: 32px;\n  \n  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");\n  background-repeat: no-repeat;\n  background-position: right 12px center;\n  background-size: 12px 12px;\n}\n\n\n._3e95886d_numberFields {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));\n  gap: 8px;\n}\n\n._0cfb5881_list {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  margin-top: 4px;\n}\n\n\n._f5c620d6_editorCard {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  padding: 14px 16px;\n  border-radius: 12px;\n  background: var(--dsw-alias-bg-module-platform);\n}\n\n._224b1387_cardFoot {\n  display: flex;\n  justify-content: flex-end;\n}\n\n._8e220e07_ruleGrid {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n\n._24a12a2f_ruleCell {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 120px;\n  flex: 1;\n}\n\n._1014c097_ruleCellLabel {\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n\n._15a12620_chainSelectors {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n._240cbbf8_selectorRow {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n\n._929f3ef3_wildcardCell {\n  flex-direction: row;\n  align-items: center;\n  gap: 8px;\n  min-width: 200px;\n  align-self: center;\n  padding: 6px 8px;\n  border-radius: 6px;\n  cursor: pointer;\n}\n\n._929f3ef3_wildcardCell:hover:has(input:not(:disabled)) {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n\n._70effa64_iconButton {\n  position: relative;\n  box-sizing: border-box;\n  appearance: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  padding: 0;\n  border: 0;\n  border-radius: 6px;\n  background: none;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n}\n\n._70effa64_iconButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n._70effa64_iconButton:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n._70effa64_iconButton:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n._70effa64_iconButton::after {\n  content: attr(data-tip);\n  position: absolute;\n  bottom: calc(100% + 6px);\n  left: 50%;\n  transform: translateX(-50%);\n  padding: 3px 8px;\n  border-radius: 6px;\n  background: var(--dsw-alias-label-primary);\n  color: var(--dsw-alias-bg-layer-3);\n  font-size: 11px;\n  line-height: 17px;\n  white-space: nowrap;\n  opacity: 0;\n  pointer-events: none;\n  transition: opacity .12s;\n}\n\n._70effa64_iconButton:hover::after,\n._70effa64_iconButton:focus-visible::after {\n  opacity: 1;\n}\n\n\n._a0968257_iconButtonDanger:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover-danger);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n\n._28202c90_addButton {\n  align-self: flex-start;\n}\n\n\n._747fd56d_primaryButton,\n._7e855445_secondaryButton {\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 4px;\n  height: 36px;\n  padding: 0 14px;\n  border: none;\n  border-radius: 18px;\n  font: inherit;\n  font-size: 14px;\n  line-height: 22px;\n  cursor: pointer;\n}\n\n._747fd56d_primaryButton {\n  background: var(--dsw-alias-button-primary-fill);\n  color: var(--dsw-alias-label-primary-foreground);\n}\n\n._747fd56d_primaryButton:hover:not(:disabled) {\n  background: var(--dsw-alias-button-primary-hover);\n}\n\n._7e855445_secondaryButton {\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n}\n\n._7e855445_secondaryButton:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover-solid);\n}\n\n._747fd56d_primaryButton:disabled,\n._7e855445_secondaryButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n._747fd56d_primaryButton:focus-visible,\n._7e855445_secondaryButton:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n\n._fbd045e0_statusBlock {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 12px 14px;\n  margin-top: 12px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 12px;\n}\n\n._d4f70367_statusTitle {\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n}\n\n\n._8ab300ed_statusLine {\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n._e8cedbf5_statusLineLabel {\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n}\n\n\n._b48dfcba_offNotice {\n  margin: 0;\n  padding: 12px;\n  border: 1px dashed var(--dsw-alias-border-l3);\n  border-radius: 8px;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary);\n  text-align: center;\n}\n\n\n._ec8bd970_resetDialog {\n  width: min(480px, 100%);\n}\n\n._8677165c_confirmDanger:not(:disabled) {\n  border-color: var(--dsw-alias-state-error-primary);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n._8677165c_confirmDanger:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover-danger);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  ._70effa64_iconButton::after {\n    transition: none;\n  }\n}\n";
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
			"footer": "_114985b2_footer",
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
			"hint": "_4bc809b8_hint",
			"defaultNote": "_579f813a_defaultNote",
			"infoHint": "_a6244318_infoHint",
			"infoHintDisabled": "_e655c840_infoHintDisabled",
			"optionRow": "_a2521bb0_optionRow",
			"wildcardCell": "_929f3ef3_wildcardCell",
			"input": "_f9d86f7b_input",
			"inputInvalid": "_7b60337a_inputInvalid",
			"selectInput": "_16eb7153_selectInput",
			"numberFields": "_3e95886d_numberFields",
			"list": "_0cfb5881_list",
			"editorCard": "_f5c620d6_editorCard",
			"cardFoot": "_224b1387_cardFoot",
			"ruleGrid": "_8e220e07_ruleGrid",
			"ruleCell": "_24a12a2f_ruleCell",
			"ruleCellLabel": "_1014c097_ruleCellLabel",
			"chainSelectors": "_15a12620_chainSelectors",
			"selectorRow": "_240cbbf8_selectorRow",
			"iconButton": "_70effa64_iconButton",
			"iconButtonDanger": "_a0968257_iconButtonDanger",
			"addButton": "_28202c90_addButton",
			"primaryButton": "_747fd56d_primaryButton",
			"secondaryButton": "_7e855445_secondaryButton",
			"statusBlock": "_fbd045e0_statusBlock",
			"statusTitle": "_d4f70367_statusTitle",
			"statusLine": "_8ab300ed_statusLine",
			"statusLineLabel": "_e8cedbf5_statusLineLabel",
			"offNotice": "_b48dfcba_offNotice",
			"resetDialog": "_ec8bd970_resetDialog",
			"confirmDanger": "_8677165c_confirmDanger"
		};
		//#endregion
		//#region src/client/FallbacksCard.tsx
		/**
		* Fallbacks settings card — the `fallbacks` plugin card on the web settings
		* "插件配置" page (spec §4). Registered into the `settings.plugin.item` slot
		* (id `fallbacks`, order 30, alongside the upstream bash/agent-loop/web-search
		* cards and the advisor card); owner props are empty and all data flows
		* through {@link FallbacksSettingsController}.
		*
		* The card chrome replicates the upstream `PluginCard` contract (self-drawn:
		* the upstream client value face exports no reusable card): a collapsible
		* `<li>` whose header is a button stacking the plugin name over its
		* description, with a dirty "unsaved" pill and a rotating chevron
		* (`IconChevronDownOutline14` from ui-primitives — a CLIENT_EXTERNALS value
		* import), `aria-expanded`/`aria-label` like the upstream header; a divider
		* under the header; then the form content; then a footer with
		* Discard / Reset / Save carrying the upstream disabled semantics — save =
		* `!dirty || saving || !writable`, discard = `!dirty || saving` (KD-U1).
		* Disclosure is card-local state: which card a user has open is a reading
		* gesture, and staged edits outlive collapsing — the pill rides the header
		* (upstream rationale).
		*
		* The form body is the two-block editing surface (spec §8): the `enabled`
		* checkbox row, the 6 top-level scalar fields (trigger codes / revert
		* policy / three numeric fields), the `rootChain` block (block 1 — the
		* root agent's single chain, no key input), and the roles block (block 2 —
		* declared role entity cards from `roles.list` plus the rule rows from
		* `roles.rules`, whose role field is a dropdown bound to the declared ids
		* + the built-in `inherit`, same-page live). Saving runs `validateDraft`
		* first — id format/reserved word/duplicates, undeclared rule role
		* references, and illegal selectors block the write with a validation
		* banner + inline red borders (never touching the store error path); a
		* non-empty `state.legacyKeys` renders the migration banner at the top of
		* the card body. The row editors keep their filled editorCard surface
		* inside the card, with `--dsw-alias-*` tokens throughout. The reset-
		* to-defaults confirmation stays a `Modal` (the delete-confirm pattern of
		* the Models page) — no `window.confirm`.
		*
		* The page-only chrome is gone (720px column wrapper, title/intro banners,
		* page-bottom status block): the AC-7 read-only status (derived effective
		* model + recent-switch summary) is folded into the card body above the
		* footer, and the plugin-config section owns the column width.
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
		* retry (the single `state.error` surface covers both, unlike the advisor's
		* separate apply-failure hints).
		*
		* The degraded derivation is latched in the card (the store stays untouched):
		* `present` only ever changes inside the store's `accept()`, so the settled
		* `ready` read is authoritative, and a card-local latch carries that value
		* through refresh/save windows (`loading`/`saving`) so the notice body can
		* never collapse mid-refresh (the advisor's latched `degraded` field,
		* implemented without a store change); on a first mount the latch is false,
		* so the healthy card starts (and stays) collapsed through its first load.
		*/
		/** Split scalars from the row editors (rootChain / role entities / role rules). */
		function scalarsOf(config) {
			return {
				enabled: config.enabled,
				triggerCodes: [...config.triggerCodes],
				cooldownMs: config.cooldownMs,
				revertPolicy: config.revertPolicy,
				maxSwitchesPerStep: config.maxSwitchesPerStep,
				alwaysModeRetryCap: config.alwaysModeRetryCap
			};
		}
		/**
		* Assemble the full config the row editors + scalars describe. The rebuilt
		* `roles.list` comes from the rows, with the schema-reserved
		* `prompt`/`permissions` merged back from the last accepted config by role
		* id (see {@link mergeRoleExtras}) so a save never silently drops them
		* (T2 reviewer minor #2).
		*/
		function assembleConfig(scalars, rootChainRows, roleRows, ruleRows, originalRoles) {
			const list = mergeRoleExtras(roleRows, originalRoles);
			return {
				enabled: scalars.enabled,
				triggerCodes: [...scalars.triggerCodes],
				rootChain: rowsToRootChain(rootChainRows),
				roles: {
					list,
					rules: rowsToRules(ruleRows)
				},
				cooldownMs: scalars.cooldownMs,
				revertPolicy: scalars.revertPolicy,
				maxSwitchesPerStep: scalars.maxSwitchesPerStep,
				alwaysModeRetryCap: scalars.alwaysModeRetryCap
			};
		}
		/**
		* Pre-save validation of the assembled draft (spec §8 / plan Task 3):
		* role id format/reserved word/duplicates, undeclared rule role references
		* (only reachable through the synthetic outside option — the dropdown
		* itself constrains normal edits), and illegal selector entries in
		* rootChain and role chains. Returns one localized message per violation;
		* a non-empty result blocks {@link save} — the draft is never written.
		* `label`/`description` are free text and never validated.
		*/
		function validateDraft(draft, t) {
			const errors = [];
			const declaredIds = /* @__PURE__ */ new Set();
			for (const role of draft.roles.list) {
				if (!ROLE_ID_PATTERN.test(role.id)) errors.push(t("validation.roleIdFormat", { id: role.id }));
				if (role.id === "inherit") errors.push(t("validation.roleIdReserved"));
				if (declaredIds.has(role.id)) errors.push(t("validation.roleIdDuplicate", { id: role.id }));
				declaredIds.add(role.id);
				for (const entry of role.chain ?? []) try {
					parseSelector(entry);
				} catch (error) {
					errors.push(t("validation.selector", {
						entry,
						message: error.message
					}));
				}
			}
			for (const entry of draft.rootChain) try {
				parseSelector(entry);
			} catch (error) {
				errors.push(t("validation.selector", {
					entry,
					message: error.message
				}));
			}
			const validTargets = /* @__PURE__ */ new Set([...declaredIds, INHERIT_ROLE_ID]);
			for (const rule of draft.roles.rules) if (!validTargets.has(rule.role)) errors.push(t("validation.ruleRoleUndeclared", { role: rule.role }));
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
		* One chain entry selector row: provider select + model select (cascade) +
		* wildcard checkbox (spec §2.5 D-3). The provider options are the catalog
		* providers **configured on the Models page** (`configuredProviders`, the
		* Models-page `configured` join) — unconfigured directory providers never
		* become offerable. Out-of-catalog values read back from the server render as
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
			const groupMissing = providerRaw !== "" && !providerOutside && !selector.wildcard && group === void 0;
			const modelDisabled = disabled || selector.wildcard || providerRaw === "" || groupMissing || providerOutside && modelRaw === "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: FallbacksCard_module_css_default.selectorRow,
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
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: FallbacksCard_module_css_default.ruleCell,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: FallbacksCard_module_css_default.ruleCellLabel,
										children: t("roles.rule.model")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: `${FallbacksCard_module_css_default.input} ${FallbacksCard_module_css_default.selectInput}`,
										value: selector.wildcard ? "" : modelRaw,
										disabled: modelDisabled,
										onChange: (event) => {
											onChange({ model: classifyModel(providerRaw, event.target.value, catalog) });
										},
										children: [
											modelRaw === "" && !providerOutside && !selector.wildcard && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
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
										children: t("chains.selector.noModels")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: `${FallbacksCard_module_css_default.ruleCell} ${FallbacksCard_module_css_default.wildcardCell}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: selector.wildcard,
									disabled: disabled || providerRaw === "",
									onChange: (event) => {
										onChange({
											wildcard: event.target.checked,
											...event.target.checked ? { model: null } : {}
										});
									}
								}), t("chains.selector.wildcard")]
							})
						]
					}),
					(providerOutside || modelOutside) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: FallbacksCard_module_css_default.hint,
						children: [t("catalog.outside.hint"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoHint, {
							label: t("catalog.outside.tooltip"),
							disabled
						})]
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
			const [rootChainRows, setRootChainRows] = (0, react.useState)(() => rootChainToRows(defaultFallbacksConfig.rootChain));
			const [roleRows, setRoleRows] = (0, react.useState)(() => rolesToRows(defaultFallbacksConfig.roles.list));
			const [ruleRows, setRuleRows] = (0, react.useState)(() => rulesToRows(defaultFallbacksConfig.roles.rules));
			const [validationErrors, setValidationErrors] = (0, react.useState)([]);
			const [validationAttempted, setValidationAttempted] = (0, react.useState)(false);
			const seededConfigKey = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (state.status !== "ready") return;
				const key = JSON.stringify(state.config);
				if (seededConfigKey.current === key) return;
				seededConfigKey.current = key;
				setScalars(scalarsOf(state.config));
				setRootChainRows(rootChainToRows(state.config.rootChain, catalogOf(state)));
				setRoleRows(rolesToRows(state.config.roles.list, catalogOf(state)));
				setRuleRows(rulesToRows(state.config.roles.rules, catalogOf(state)));
			}, [state.status, state.config]);
			const [confirmingReset, setConfirmingReset] = (0, react.useState)(false);
			const [resetting, setResetting] = (0, react.useState)(false);
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
			const updateRootChainSelector = (selectorIndex, patch) => {
				setRootChainRows((rows) => rows.map((row, index) => index === 0 ? {
					...row,
					selectors: row.selectors.map((selector, sIndex) => sIndex === selectorIndex ? {
						...selector,
						...patch
					} : selector)
				} : row));
			};
			const addRootChainSelector = () => {
				setRootChainRows((rows) => rows.map((row, index) => index === 0 ? {
					...row,
					selectors: [...row.selectors, {
						wildcard: false,
						provider: null,
						model: null
					}]
				} : row));
			};
			const removeRootChainSelector = (selectorIndex) => {
				setRootChainRows((rows) => rows.map((row, index) => index === 0 ? {
					...row,
					selectors: row.selectors.filter((_, sIndex) => sIndex !== selectorIndex)
				} : row));
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
					label: "",
					description: "",
					selectors: [],
					fallback: "inherit-root"
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
			const draft = assembleConfig(scalars, rootChainRows, roleRows, ruleRows, state.config.roles.list);
			const hasEmptyRuleRows = ruleRows.some((row) => row.role === "");
			const dirty = JSON.stringify(draft) !== JSON.stringify(state.config) || hasEmptyRuleRows;
			const saving = state.status === "saving";
			const writable = state.writable;
			const unknownCodes = scalars.triggerCodes.filter((code) => !KNOWN_TRIGGER_CODES.includes(code));
			const roleOptions = ruleRoleOptions({ list: roleRows });
			const invalidRoleIds = validationAttempted ? collectInvalidRoleIds(roleRows) : null;
			const effectiveModel = deriveEffectiveModel(state.config, state.switches);
			const effectiveModelLine = effectiveModel.kind === "unavailable" ? t("status.effectiveModel.unavailable") : `${effectiveModel.provider}/${effectiveModel.model} · ${t("status.effectiveModel.note")}`;
			const latestSwitch = state.switches[0];
			let switchesLine;
			if (state.switchesStatus === "error") switchesLine = t("status.switches.error", { message: state.switchesError });
			else if (state.switchesStatus === "loading") switchesLine = t("loading");
			else if (latestSwitch === void 0) switchesLine = t("status.switches.empty");
			else {
				const reasonKey = SWITCH_REASON_KEYS[latestSwitch.reason];
				switchesLine = t("status.switches.compact", {
					count: String(state.switches.length),
					from: `${latestSwitch.from.provider}/${latestSwitch.from.model}`,
					to: `${latestSwitch.to.provider}/${latestSwitch.to.model}`,
					role: latestSwitch.role,
					reason: reasonKey === void 0 ? latestSwitch.reason : t(reasonKey)
				});
			}
			const catalogSeededEpoch = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (state.catalogStatus !== "ready") return;
				if (catalogSeededEpoch.current === state.catalogEpoch) return;
				if (dirty) return;
				catalogSeededEpoch.current = state.catalogEpoch;
				setRootChainRows(rootChainToRows(state.config.rootChain, catalogOf(state)));
				setRoleRows(rolesToRows(state.config.roles.list, catalogOf(state)));
				setRuleRows(rulesToRows(state.config.roles.rules, catalogOf(state)));
			}, [
				state.catalogStatus,
				state.catalogEpoch,
				state.config,
				dirty
			]);
			const save = () => {
				const errors = validateDraft(draft, t);
				if (hasEmptyRuleRows) errors.push(t("validation.ruleRoleRequired"));
				if (errors.length > 0) {
					setValidationErrors(errors);
					setValidationAttempted(true);
					return;
				}
				setValidationErrors([]);
				setValidationAttempted(false);
				controller.save(draft);
			};
			const discard = () => {
				setScalars(scalarsOf(state.config));
				setRootChainRows(rootChainToRows(state.config.rootChain, catalogOf(state)));
				setRoleRows(rolesToRows(state.config.roles.list, catalogOf(state)));
				setRuleRows(rulesToRows(state.config.roles.rules, catalogOf(state)));
				setValidationErrors([]);
				setValidationAttempted(false);
			};
			(0, react.useEffect)(() => {
				if (!validationAttempted) return;
				if (validateDraft(draft, t).length === 0 && !ruleRows.some((row) => row.role === "")) {
					setValidationErrors([]);
					setValidationAttempted(false);
				}
			}, [
				validationAttempted,
				draft,
				ruleRows,
				t
			]);
			const confirmReset = () => {
				setResetting(true);
				controller.resetToDefaults().finally(() => {
					setResetting(false);
					setConfirmingReset(false);
				});
			};
			const [userOpen, setUserOpen] = (0, react.useState)(false);
			const degradedLatch = (0, react.useRef)(false);
			const errorLatch = (0, react.useRef)(false);
			if (state.status === "ready") {
				degradedLatch.current = !state.present;
				errorLatch.current = false;
			} else if (state.status === "error") errorLatch.current = true;
			const degraded = state.status === "ready" ? !state.present : degradedLatch.current;
			const open = userOpen || errorLatch.current || degraded;
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
				children: [
					header,
					open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: FallbacksCard_module_css_default.body,
						children: [
							state.legacyKeys.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: FallbacksCard_module_css_default.legacyNotice,
								role: "status",
								children: t("legacy.banner", { keys: state.legacyKeys.join(", ") })
							}),
							state.status === "error" && state.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
							validationErrors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: FallbacksCard_module_css_default.error,
								role: "alert",
								children: `${t("validation.blocked")}${validationErrors.join("; ")}`
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
									!scalars.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: FallbacksCard_module_css_default.offNotice,
										children: t("enabled.off")
									}),
									scalars.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
										className: FallbacksCard_module_css_default.fieldset,
										disabled: !writable,
										children: [
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
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: FallbacksCard_module_css_default.hint,
														children: t("rootChain.hint")
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
														children: rootChainRows.map((row, rowIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: FallbacksCard_module_css_default.editorCard,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																className: FallbacksCard_module_css_default.chainSelectors,
																children: row.selectors.map((selector, selectorIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChainSelectorEditor, {
																	selector,
																	catalog: catalogOf(state),
																	configuredProviders: state.configuredProviders,
																	disabled: !writable,
																	t,
																	onChange: (patch) => {
																		updateRootChainSelector(selectorIndex, patch);
																	},
																	onRemove: () => {
																		removeRootChainSelector(selectorIndex);
																	}
																}, selectorIndex))
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																variant: "outline",
																size: "sm",
																icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
																className: FallbacksCard_module_css_default.addButton,
																onClick: addRootChainSelector,
																children: t("rootChain.selector.add")
															})]
														}, rowIndex))
													})
												]
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
															return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: FallbacksCard_module_css_default.editorCard,
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: FallbacksCard_module_css_default.ruleGrid,
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
																						disabled: !writable,
																						onChange: (event) => {
																							updateRoleRow(index, { id: event.target.value });
																						}
																					}),
																					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																						className: FallbacksCard_module_css_default.hint,
																						children: t("roles.id.hint")
																					})
																				]
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																				className: FallbacksCard_module_css_default.ruleCell,
																				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																					className: FallbacksCard_module_css_default.ruleCellLabel,
																					children: t("roles.label")
																				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																					className: FallbacksCard_module_css_default.input,
																					value: row.label,
																					"aria-label": t("roles.label"),
																					disabled: !writable,
																					onChange: (event) => {
																						updateRoleRow(index, { label: event.target.value });
																					}
																				})]
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																				className: FallbacksCard_module_css_default.ruleCell,
																				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																					className: FallbacksCard_module_css_default.ruleCellLabel,
																					children: t("roles.description")
																				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																					className: FallbacksCard_module_css_default.input,
																					value: row.description,
																					"aria-label": t("roles.description"),
																					disabled: !writable,
																					onChange: (event) => {
																						updateRoleRow(index, { description: event.target.value });
																					}
																				})]
																			})
																		]
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
																				updateRoleSelector(index, selectorIndex, patch);
																			},
																			onRemove: () => {
																				removeRoleSelector(index, selectorIndex);
																			}
																		}, selectorIndex))
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
																]
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
																					children: t("roles.rule.origin")
																				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
																					className: `${FallbacksCard_module_css_default.input} ${FallbacksCard_module_css_default.selectInput}`,
																					value: row.origin,
																					onChange: (event) => {
																						updateRuleRow(index, { origin: event.target.value });
																					},
																					children: [
																						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																							value: "",
																							children: t("roles.rule.origin.any")
																						}),
																						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																							value: "root",
																							children: t("roles.rule.origin.root")
																						}),
																						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																							value: "subagent",
																							children: t("roles.rule.origin.subagent")
																						})
																					]
																				})]
																			}),
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
																origin: "",
																provider: null,
																model: null,
																role: ""
															}]);
														},
														children: t("roles.addRule")
													})
												]
											})
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: FallbacksCard_module_css_default.statusBlock,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: FallbacksCard_module_css_default.statusTitle,
										children: t("status.title")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: FallbacksCard_module_css_default.statusLine,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: FallbacksCard_module_css_default.statusLineLabel,
											children: t("status.effectiveModel.label")
										}), effectiveModelLine]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: FallbacksCard_module_css_default.statusLine,
										role: state.switchesStatus === "error" ? "alert" : void 0,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: FallbacksCard_module_css_default.statusLineLabel,
											children: t("status.switches.label")
										}), switchesLine]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: FallbacksCard_module_css_default.statusLine,
										children: t("status.selectionNote")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: FallbacksCard_module_css_default.footer,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: FallbacksCard_module_css_default.secondaryButton,
										disabled: !dirty || saving,
										onClick: discard,
										children: t("discard")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: FallbacksCard_module_css_default.secondaryButton,
										disabled: !writable || saving,
										onClick: () => {
											setConfirmingReset(true);
										},
										children: t("reset")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: FallbacksCard_module_css_default.primaryButton,
										disabled: !writable || saving || !dirty,
										onClick: save,
										children: saving ? t("save.saving") : t("save")
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: confirmingReset,
						onClose: () => {
							if (!resetting) setConfirmingReset(false);
						},
						title: t("reset.confirmTitle"),
						closeLabel: t("close"),
						description: t("reset.confirm"),
						className: FallbacksCard_module_css_default.resetDialog,
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							autoFocus: true,
							disabled: resetting,
							onClick: () => {
								setConfirmingReset(false);
							},
							children: t("reset.confirm.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							className: FallbacksCard_module_css_default.confirmDanger,
							disabled: resetting,
							onClick: confirmReset,
							children: resetting ? t("reset.saving") : t("reset.confirm.action")
						})] })
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-css:/Users/bibi/workspace/ai/deepseek/dsh-llm-fallbacks/src/client/GeneralFallbacksRow.module.css.mjs
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
				summary = t("general.switch", {
					from: `${latestSwitch.from.provider}/${latestSwitch.from.model}`,
					to: `${latestSwitch.to.provider}/${latestSwitch.to.model}`,
					role: latestSwitch.role,
					reason: reasonKey === void 0 ? latestSwitch.reason : t(reasonKey)
				});
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
		//#region \0dsh-css:/Users/bibi/workspace/ai/deepseek/dsh-llm-fallbacks/src/client/ConversationFallbackSwitch.module.css.mjs
		const css = "\n\n._ea99bbef_switchRow {\n  display: flex;\n  align-items: center;\n  padding: 2px 0;\n  font-size: 14px;\n  line-height: 24px;\n}\n\n\n._02580bfd_switchTitle {\n  flex: none;\n  color: var(--dsw-alias-label-primary-dimmed);\n}\n\n._88b2d18b_switchSep {\n  flex: none;\n  width: 2px;\n  height: 2px;\n  margin: 0 8px;\n  border-radius: 1px;\n  background: var(--dsw-alias-label-caption);\n}\n\n\n._7c8c1b6f_switchSummary {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-tertiary);\n}\n";
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
			"switchSummary": "_7c8c1b6f_switchSummary"
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
		* notice: dim title + separator + ellipsized summary — `chat/MessageItem
		* .module.css:38-122`); every color resolves through a `--dsw-alias-*`
		* token. A reason outside the current union renders raw (forward-compatible
		* durable log, same rule as the card/general row summaries). A malformed or
		* partial payload (version skew) degrades to the title-only line instead of
		* throwing during interpolation — the transcript slot stays visible with a
		* truthful "a switch happened" notice and no summary details.
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
			const summary = t("chat.switch.summary", {
				from: `${data.from.provider}/${data.from.model}`,
				to: `${data.to.provider}/${data.to.model}`,
				role: data.role,
				reason: reasonKey === void 0 ? data.reason : t(reasonKey)
			});
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ConversationFallbackSwitch_module_css_default.switchSummary,
						children: summary
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
			const useSnapshot = (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(controller.store);
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
					id: "fallbacks",
					order: 30,
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
