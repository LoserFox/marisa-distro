window.__ModuleLoader__.load({ id: "@huanlin/dsh-plugin-interpreters", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// ../dsh/node_modules/.pnpm/use-sync-external-store@1.2.0_react@18.3.1/node_modules/use-sync-external-store/cjs/use-sync-external-store-with-selector.production.min.js
var require_use_sync_external_store_with_selector_production_min = __commonJS({
  "../dsh/node_modules/.pnpm/use-sync-external-store@1.2.0_react@18.3.1/node_modules/use-sync-external-store/cjs/use-sync-external-store-with-selector.production.min.js"(exports) {
    "use strict";
    var g = require("react");
    function n(a, b) {
      return a === b && (0 !== a || 1 / a === 1 / b) || a !== a && b !== b;
    }
    var p = "function" === typeof Object.is ? Object.is : n;
    var q = g.useSyncExternalStore;
    var r = g.useRef;
    var t = g.useEffect;
    var u = g.useMemo;
    var v = g.useDebugValue;
    exports.useSyncExternalStoreWithSelector = function(a, b, e, l, h) {
      var c = r(null);
      if (null === c.current) {
        var f = { hasValue: false, value: null };
        c.current = f;
      } else f = c.current;
      c = u(function() {
        function a2(a3) {
          if (!c2) {
            c2 = true;
            d2 = a3;
            a3 = l(a3);
            if (void 0 !== h && f.hasValue) {
              var b2 = f.value;
              if (h(b2, a3)) return k = b2;
            }
            return k = a3;
          }
          b2 = k;
          if (p(d2, a3)) return b2;
          var e2 = l(a3);
          if (void 0 !== h && h(b2, e2)) return b2;
          d2 = a3;
          return k = e2;
        }
        var c2 = false, d2, k, m = void 0 === e ? null : e;
        return [function() {
          return a2(b());
        }, null === m ? void 0 : function() {
          return a2(m());
        }];
      }, [b, e, l, h]);
      var d = q(a, c[0], c[1]);
      t(function() {
        f.hasValue = true;
        f.value = d;
      }, [d]);
      v(d);
      return d;
    };
  }
});

// ../dsh/node_modules/.pnpm/use-sync-external-store@1.2.0_react@18.3.1/node_modules/use-sync-external-store/with-selector.js
var require_with_selector = __commonJS({
  "../dsh/node_modules/.pnpm/use-sync-external-store@1.2.0_react@18.3.1/node_modules/use-sync-external-store/with-selector.js"(exports, module2) {
    "use strict";
    if (true) {
      module2.exports = require_use_sync_external_store_with_selector_production_min();
    } else {
      module2.exports = null;
    }
  }
});

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/bindSnapshotSelector.ts
var import_with_selector = __toESM(require_with_selector(), 1);
function bindSnapshotSelector(w) {
  const subscribe = (fn) => w.subscribe(fn);
  const getSnapshot = () => w.getSnapshot();
  return function useSelector(sel, eq) {
    return (0, import_with_selector.useSyncExternalStoreWithSelector)(subscribe, getSnapshot, void 0, sel, eq);
  };
}

// src/client/InterpretersCard.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/store.ts
var import_client = require("@deepseek-ai/dsh-client-runtime/client");
function initialState() {
  return {
    status: "idle",
    loaded: false,
    available: false,
    writable: false,
    draft: {},
    dirty: false,
    applyState: { kind: "idle" }
  };
}
function formatNumber(value) {
  return typeof value === "number" ? String(value) : "";
}
function formatText(value) {
  return typeof value === "string" ? value : "";
}
var InterpretersCardController = class {
  constructor() {
    __publicField(this, "store");
    /** True after the first successful load; gates `connection/reset` refreshes. */
    __publicField(this, "loaded", false);
    __publicField(this, "generation", 0);
    __publicField(this, "staged", /* @__PURE__ */ new Map());
    this.store = (0, import_client.createSnapshotStore)(initialState());
    void this.load();
  }
  /**
   * Read the resolved config from the Host HTTP route and publish it.
   * @returns settlement after the read.
   */
  async load() {
    const gen = ++this.generation;
    this.store.update((s) => {
      s.status = "loading";
    });
    let config;
    try {
      const response = await fetch("/interpreters/api/get", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      if (response.ok) {
        const parsed = await response.json().catch(() => null);
        if (parsed?.ok === true && parsed.value !== void 0) {
          config = parsed.value.config;
        }
      }
    } catch {
    }
    if (gen !== this.generation) return;
    if (config === void 0) {
      this.store.update((s) => {
        s.status = "ready";
        s.available = false;
        s.writable = false;
      });
      return;
    }
    this.loaded = true;
    this.staged.clear();
    this.store.update((s) => {
      s.status = "ready";
      s.available = true;
      s.writable = true;
      s.draft = { ...config };
      s.dirty = false;
      s.applyState = { kind: "idle" };
    });
  }
  /** Stage draft text for one field. */
  edit(field, text) {
    this.staged.set(field, text);
    this.store.update((s) => {
      s.draft = { ...s.draft, [field]: text };
      s.dirty = true;
      s.applyState = { kind: "idle" };
    });
  }
  /** Drop every staged edit. */
  discard() {
    if (this.staged.size === 0) {
      this.store.update((s) => {
        s.applyState = { kind: "idle" };
      });
      return;
    }
    this.staged.clear();
    void this.load();
  }
  /** Write every staged edit, then re-seed from what the Host accepted. */
  save() {
    void this.doSave();
  }
  async doSave() {
    const gen = ++this.generation;
    const patch = this.patchOf();
    if (Object.keys(patch).length === 0) {
      this.staged.clear();
      this.store.update((s) => {
        s.dirty = false;
        s.applyState = { kind: "idle" };
      });
      return;
    }
    this.store.update((s) => {
      s.applyState = { kind: "saving" };
    });
    try {
      const response = await fetch("/interpreters/api/set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patch })
      });
      if (gen !== this.generation) return;
      if (!response.ok) {
        const parsed2 = await response.json().catch(() => null);
        const message = parsed2?.error?.message ?? `HTTP ${response.status}`;
        this.store.update((s) => {
          s.applyState = { kind: "error", message };
        });
        return;
      }
      const parsed = await response.json().catch(() => null);
      if (parsed?.ok !== true || parsed.value === void 0) {
        const message = parsed?.error?.message ?? "unknown error";
        this.store.update((s) => {
          s.applyState = { kind: "error", message };
        });
        return;
      }
      const next = parsed.value.config;
      this.staged.clear();
      this.store.update((s) => {
        s.draft = { ...next };
        s.dirty = false;
        s.applyState = { kind: "saved" };
      });
    } catch (error) {
      if (gen !== this.generation) return;
      this.store.update((s) => {
        s.applyState = { kind: "error", message: error instanceof Error ? error.message : String(error) };
      });
    }
  }
  /** The staged edits as one patch (only changed fields). */
  patchOf() {
    const patch = {};
    for (const [field, text] of this.staged) {
      const value = parseField(field, text);
      if (value === void 0) continue;
      patch[field] = value;
    }
    return patch;
  }
};
function parseField(field, text) {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  if (field === "timeoutMs") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  return trimmed;
}
function refreshIfLoaded(controller) {
  if (controller.loaded) void controller.load();
}
var formatFieldText = formatText;
var formatFieldNumber = formatNumber;

var css = "._3Vx1tq_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}._3Vx1tq_card:hover{border-color:var(--dsw-alias-label-dimmed)}._3Vx1tq_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}._3Vx1tq_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}._3Vx1tq_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}._3Vx1tq_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}._3Vx1tq_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}._3Vx1tq_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}._3Vx1tq_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}._3Vx1tq_chevronOpen{transform:rotate(180deg)}._3Vx1tq_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}._3Vx1tq_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}._3Vx1tq_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}._3Vx1tq_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}._3Vx1tq_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}._3Vx1tq_savedNotice{min-width:0;color:var(--dsw-alias-state-success-primary);flex:1;margin:0;font-size:12px;line-height:1.5}._3Vx1tq_discard,._3Vx1tq_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}._3Vx1tq_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}._3Vx1tq_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}._3Vx1tq_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}._3Vx1tq_discard:disabled,._3Vx1tq_save:disabled{opacity:.4;cursor:default}._3Vx1tq_discard:focus-visible,._3Vx1tq_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}._3Vx1tq_notice{color:var(--dsw-alias-state-warn-label);margin:12px 0 0;font-size:12px;line-height:18px}._3Vx1tq_form{flex-direction:column;gap:12px;padding:12px 0 0;display:flex}._3Vx1tq_field{flex-direction:column;gap:6px;display:flex}._3Vx1tq_fieldLabel{color:var(--dsw-alias-label-secondary);align-items:center;gap:10px;font-size:12px;font-weight:500;line-height:18px;display:inline-flex}._3Vx1tq_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:100%;height:32px;font:inherit;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 10px;font-size:14px;line-height:22px}._3Vx1tq_input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}._3Vx1tq_input::placeholder{color:var(--dsw-alias-label-dimmed)}._3Vx1tq_input:disabled{opacity:.6;cursor:default}._3Vx1tq_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}";
var tagId = "@huanlin/dsh-plugin-interpreters/InterpretersCard.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "@huanlin/dsh-plugin-interpreters";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
var InterpretersCard_module_css_default = { "body": "_3Vx1tq_body", "card": "_3Vx1tq_card", "cardOpen": "_3Vx1tq_cardOpen", "chevron": "_3Vx1tq_chevron", "chevronOpen": "_3Vx1tq_chevronOpen", "description": "_3Vx1tq_description", "discard": "_3Vx1tq_discard", "failed": "_3Vx1tq_failed", "field": "_3Vx1tq_field", "fieldLabel": "_3Vx1tq_fieldLabel", "footer": "_3Vx1tq_footer", "form": "_3Vx1tq_form", "headText": "_3Vx1tq_headText", "header": "_3Vx1tq_header", "hint": "_3Vx1tq_hint", "input": "_3Vx1tq_input", "name": "_3Vx1tq_name", "notice": "_3Vx1tq_notice", "pending": "_3Vx1tq_pending", "readOnly": "_3Vx1tq_readOnly", "save": "_3Vx1tq_save", "savedNotice": "_3Vx1tq_savedNotice" };

// src/client/InterpretersCard.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function InterpretersCard(props) {
  const { controller, useSnapshot, t } = props;
  const state = useSnapshot((snapshot) => snapshot);
  if (state.status === "idle") void controller.load();
  const [userOpen, setUserOpen] = (0, import_react.useState)(false);
  const degraded = state.status === "ready" && !state.available;
  const open = userOpen || degraded;
  const title = t("title");
  const header = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "button",
    {
      type: "button",
      className: InterpretersCard_module_css_default.header,
      "aria-expanded": open,
      "aria-label": `${t(open ? "collapse" : "expand")}: ${title}`,
      onClick: () => {
        if (!degraded) setUserOpen(!userOpen);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: InterpretersCard_module_css_default.headText, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: InterpretersCard_module_css_default.name, children: title }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: InterpretersCard_module_css_default.description, children: t("intro") })
        ] }),
        state.dirty ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: InterpretersCard_module_css_default.pending, children: t("unsaved") }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.IconChevronDownOutline14,
          {
            className: open ? `${InterpretersCard_module_css_default.chevron} ${InterpretersCard_module_css_default.chevronOpen}` : InterpretersCard_module_css_default.chevron
          }
        )
      ]
    }
  );
  let body;
  if (degraded) {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: InterpretersCard_module_css_default.body, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: InterpretersCard_module_css_default.notice, role: "status", children: t("namespaceUnavailable") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: InterpretersCard_module_css_default.footer, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: InterpretersCard_module_css_default.discard,
          onClick: () => {
            void controller.load();
          },
          children: t("retry")
        }
      ) })
    ] });
  } else if (state.status === "ready") {
    const { draft, writable, applyState } = state;
    const saving = applyState.kind === "saving";
    const busy = !writable || saving;
    const saveDisabled = !state.dirty || saving || !writable;
    const discardDisabled = !state.dirty || saving;
    const errorText = applyState.kind === "error" ? applyState.message : void 0;
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: InterpretersCard_module_css_default.body, children: [
      !writable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: InterpretersCard_module_css_default.readOnly, role: "status", children: t("readOnly") }) : null,
      applyState.kind === "saved" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: InterpretersCard_module_css_default.savedNotice, role: "status", children: t("save") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: InterpretersCard_module_css_default.form, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Field,
          {
            id: "plugin-config-interpreters-python",
            label: t("pythonPath"),
            hint: t("pythonHelp"),
            text: formatFieldText(draft.pythonPath),
            disabled: busy,
            onEdit: (text) => {
              controller.edit("pythonPath", text);
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Field,
          {
            id: "plugin-config-interpreters-node",
            label: t("nodePath"),
            hint: t("nodeHelp"),
            text: formatFieldText(draft.nodePath),
            disabled: busy,
            onEdit: (text) => {
              controller.edit("nodePath", text);
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Field,
          {
            id: "plugin-config-interpreters-timeout",
            label: t("timeoutMs"),
            hint: t("timeoutHelp"),
            text: formatFieldNumber(draft.timeoutMs),
            numeric: true,
            disabled: busy,
            onEdit: (text) => {
              controller.edit("timeoutMs", text);
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: InterpretersCard_module_css_default.footer, children: [
        errorText === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: InterpretersCard_module_css_default.failed, role: "status", children: errorText }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: InterpretersCard_module_css_default.discard,
            disabled: discardDisabled,
            onClick: () => {
              controller.discard();
            },
            children: t("discard")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: InterpretersCard_module_css_default.save,
            disabled: saveDisabled,
            onClick: () => {
              controller.save();
            },
            children: t(saving ? "saving" : "save")
          }
        )
      ] })
    ] });
  } else {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: InterpretersCard_module_css_default.body });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: open ? `${InterpretersCard_module_css_default.card} ${InterpretersCard_module_css_default.cardOpen}` : InterpretersCard_module_css_default.card, children: [
    header,
    open ? body : null
  ] });
}
function Field(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: InterpretersCard_module_css_default.field, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: InterpretersCard_module_css_default.fieldLabel, htmlFor: props.id, children: props.label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        id: props.id,
        className: InterpretersCard_module_css_default.input,
        type: props.numeric ? "number" : "text",
        ...props.numeric ? { inputMode: "numeric" } : {},
        value: props.text,
        disabled: props.disabled,
        onChange: (event) => {
          props.onEdit(event.target.value);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: InterpretersCard_module_css_default.hint, children: props.hint })
  ] });
}

// src/client/locales.ts
var NS = "interpreters";
var zh = {
  title: "\u89E3\u91CA\u5668\u8DEF\u5F84",
  intro: "\u914D\u7F6E run_python / run_node \u5DE5\u5177\u4F7F\u7528\u7684\u89E3\u91CA\u5668\u8DEF\u5F84\u3002",
  pythonPath: "Python \u53EF\u6267\u884C\u6587\u4EF6\u8DEF\u5F84",
  pythonHelp: "\u6A21\u578B\u901A\u8FC7 run_python \u5DE5\u5177\u8C03\u7528\u8BE5\u8DEF\u5F84\u6267\u884C Python \u4EE3\u7801\u3002\u7559\u7A7A\u4F7F\u7528\u7CFB\u7EDF\u9ED8\u8BA4 python\u3002",
  nodePath: "Node.js \u53EF\u6267\u884C\u6587\u4EF6\u8DEF\u5F84",
  nodeHelp: "\u6A21\u578B\u901A\u8FC7 run_node \u5DE5\u5177\u8C03\u7528\u8BE5\u8DEF\u5F84\u6267\u884C Node.js \u4EE3\u7801\u3002\u7559\u7A7A\u4F7F\u7528\u7CFB\u7EDF\u9ED8\u8BA4 node\u3002",
  timeoutMs: "\u6267\u884C\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
  timeoutHelp: "\u8D85\u8FC7\u8BE5\u65F6\u957F\u8FDB\u7A0B\u5C06\u88AB\u5F3A\u5236\u7EC8\u6B62\u3002",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  discard: "\u653E\u5F03\u4FEE\u6539",
  unsaved: "\u672A\u4FDD\u5B58",
  saveFailed: "\u672C\u90E8\u7F72\u6CA1\u6709\u63A5\u53D7\u8FD9\u4E9B\u503C\uFF0C\u5DF2\u4FDD\u7559\u4F9B\u4F60\u4FEE\u6539\u3002",
  readOnly: "\u672C\u90E8\u7F72\u7684\u8BBE\u7F6E\u4E3A\u53EA\u8BFB\u3002",
  expand: "\u5C55\u5F00\u8BBE\u7F6E",
  collapse: "\u6536\u8D77\u8BBE\u7F6E",
  namespaceUnavailable: "\u89E3\u91CA\u5668\u914D\u7F6E\u901A\u9053\u5F53\u524D\u4E0D\u53EF\u7528\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  retry: "\u91CD\u8BD5"
};
var en = {
  title: "Interpreter paths",
  intro: "Configure the interpreter executables used by the run_python / run_node tools.",
  pythonPath: "Python executable path",
  pythonHelp: "The model uses this path to execute Python code via the run_python tool. Leave empty to use the system default python.",
  nodePath: "Node.js executable path",
  nodeHelp: "The model uses this path to execute Node.js code via the run_node tool. Leave empty to use the system default node.",
  timeoutMs: "Execution timeout (ms)",
  timeoutHelp: "The process is killed after this duration.",
  save: "Save",
  saving: "Saving\u2026",
  discard: "Discard",
  unsaved: "Unsaved",
  saveFailed: "The deployment did not accept these values; they were left for you to correct.",
  readOnly: "This deployment stores settings read-only.",
  expand: "Show settings",
  collapse: "Hide settings",
  namespaceUnavailable: "The interpreter configuration channel is unavailable. Please retry later.",
  retry: "Retry"
};

// src/client/dictionaries.ts
var dicts = {
  ja: {
    title: "\u30A4\u30F3\u30BF\u30FC\u30D7\u30EA\u30BF\u30FC\u306E\u30D1\u30B9",
    intro: "run_python / run_node \u30C4\u30FC\u30EB\u304C\u4F7F\u7528\u3059\u308B\u30A4\u30F3\u30BF\u30FC\u30D7\u30EA\u30BF\u30FC\u306E\u5B9F\u884C\u30D5\u30A1\u30A4\u30EB\u30D1\u30B9\u3092\u8A2D\u5B9A\u3057\u307E\u3059\u3002",
    pythonPath: "Python \u5B9F\u884C\u30D5\u30A1\u30A4\u30EB\u306E\u30D1\u30B9",
    pythonHelp: "\u30E2\u30C7\u30EB\u306F run_python \u30C4\u30FC\u30EB\u3067\u3053\u306E\u30D1\u30B9\u3092\u4F7F\u3063\u3066 Python \u30B3\u30FC\u30C9\u3092\u5B9F\u884C\u3057\u307E\u3059\u3002\u7A7A\u306E\u307E\u307E\u306B\u3059\u308B\u3068\u30B7\u30B9\u30C6\u30E0\u65E2\u5B9A\u306E python \u304C\u4F7F\u308F\u308C\u307E\u3059\u3002",
    nodePath: "Node.js \u5B9F\u884C\u30D5\u30A1\u30A4\u30EB\u306E\u30D1\u30B9",
    nodeHelp: "\u30E2\u30C7\u30EB\u306F run_node \u30C4\u30FC\u30EB\u3067\u3053\u306E\u30D1\u30B9\u3092\u4F7F\u3063\u3066 Node.js \u30B3\u30FC\u30C9\u3092\u5B9F\u884C\u3057\u307E\u3059\u3002\u7A7A\u306E\u307E\u307E\u306B\u3059\u308B\u3068\u30B7\u30B9\u30C6\u30E0\u65E2\u5B9A\u306E node \u304C\u4F7F\u308F\u308C\u307E\u3059\u3002",
    timeoutMs: "\u5B9F\u884C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\uFF08ms\uFF09",
    timeoutHelp: "\u3053\u306E\u6642\u9593\u3092\u8D85\u3048\u308B\u3068\u30D7\u30ED\u30BB\u30B9\u306F\u5F37\u5236\u7D42\u4E86\u3055\u308C\u307E\u3059\u3002",
    save: "\u4FDD\u5B58",
    saving: "\u4FDD\u5B58\u4E2D\u2026",
    discard: "\u5909\u66F4\u3092\u7834\u68C4",
    unsaved: "\u672A\u4FDD\u5B58",
    saveFailed: "\u3053\u306E\u30C7\u30D7\u30ED\u30A4\u30E1\u30F3\u30C8\u306F\u3053\u308C\u3089\u306E\u5024\u3092\u53D7\u3051\u4ED8\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u4FEE\u6B63\u306E\u305F\u3081\u6B8B\u3055\u308C\u3066\u3044\u307E\u3059\u3002",
    readOnly: "\u3053\u306E\u30C7\u30D7\u30ED\u30A4\u30E1\u30F3\u30C8\u3067\u306F\u8A2D\u5B9A\u306F\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u3067\u3059\u3002",
    expand: "\u8A2D\u5B9A\u3092\u8868\u793A",
    collapse: "\u8A2D\u5B9A\u3092\u96A0\u3059",
    namespaceUnavailable: "\u30A4\u30F3\u30BF\u30FC\u30D7\u30EA\u30BF\u30FC\u8A2D\u5B9A\u30C1\u30E3\u30F3\u30CD\u30EB\u306F\u73FE\u5728\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002\u5F8C\u3067\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    retry: "\u518D\u8A66\u884C"
  },
  de: {
    title: "Interpreter-Pfade",
    intro: "Konfigurieren Sie die Interpreter, die von den Werkzeugen run_python / run_node verwendet werden.",
    pythonPath: "Pfad zur Python-Datei",
    pythonHelp: "Das Modell f\xFChrt Python-Code \xFCber das run_python-Werkzeug mit diesem Pfad aus. Leer lassen, um das systemweite Standard-python zu verwenden.",
    nodePath: "Pfad zur Node.js-Datei",
    nodeHelp: "Das Modell f\xFChrt Node.js-Code \xFCber das run_node-Werkzeug mit diesem Pfad aus. Leer lassen, um das systemweite Standard-node zu verwenden.",
    timeoutMs: "Ausf\xFChrungszeitlimit (ms)",
    timeoutHelp: "Der Prozess wird nach Ablauf dieser Zeit beendet.",
    save: "Speichern",
    saving: "Wird gespeichert\u2026",
    discard: "\xC4nderungen verwerfen",
    unsaved: "Nicht gespeichert",
    saveFailed: "Die Bereitstellung hat diese Werte nicht akzeptiert; sie wurden zur Korrektur f\xFCr Sie belassen.",
    readOnly: "Diese Bereitstellung speichert Einstellungen schreibgesch\xFCtzt.",
    expand: "Einstellungen anzeigen",
    collapse: "Einstellungen ausblenden",
    namespaceUnavailable: "Der Interpreter-Konfigurationskanal ist derzeit nicht verf\xFCgbar. Bitte versuchen Sie es sp\xE4ter erneut.",
    retry: "Erneut versuchen"
  },
  fr: {
    title: "Chemins des interpr\xE9teurs",
    intro: "Configurez les ex\xE9cutables des interpr\xE9teurs utilis\xE9s par les outils run_python / run_node.",
    pythonPath: "Chemin de l\u2019ex\xE9cutable Python",
    pythonHelp: "Le mod\xE8le utilise ce chemin pour ex\xE9cuter du code Python via l\u2019outil run_python. Laisser vide pour utiliser le python par d\xE9faut du syst\xE8me.",
    nodePath: "Chemin de l\u2019ex\xE9cutable Node.js",
    nodeHelp: "Le mod\xE8le utilise ce chemin pour ex\xE9cuter du code Node.js via l\u2019outil run_node. Laisser vide pour utiliser le node par d\xE9faut du syst\xE8me.",
    timeoutMs: "D\xE9lai d\u2019ex\xE9cution (ms)",
    timeoutHelp: "Le processus est arr\xEAt\xE9 apr\xE8s cette dur\xE9e.",
    save: "Enregistrer",
    saving: "Enregistrement\u2026",
    discard: "Abandonner les modifications",
    unsaved: "Non enregistr\xE9",
    saveFailed: "Le d\xE9ploiement n\u2019a pas accept\xE9 ces valeurs ; elles vous sont laiss\xE9es pour les corriger.",
    readOnly: "Ce d\xE9ploiement stocke les param\xE8tres en lecture seule.",
    expand: "Afficher les param\xE8tres",
    collapse: "Masquer les param\xE8tres",
    namespaceUnavailable: "Le canal de configuration des interpr\xE9teurs est indisponible. Veuillez r\xE9essayer plus tard.",
    retry: "R\xE9essayer"
  },
  pt: {
    title: "Caminhos do interpretador",
    intro: "Configure os execut\xE1veis do interpretador usados pelas ferramentas run_python / run_node.",
    pythonPath: "Caminho do execut\xE1vel Python",
    pythonHelp: "O modelo usa este caminho para executar c\xF3digo Python via a ferramenta run_python. Deixe vazio para usar o python padr\xE3o do sistema.",
    nodePath: "Caminho do execut\xE1vel Node.js",
    nodeHelp: "O modelo usa este caminho para executar c\xF3digo Node.js via a ferramenta run_node. Deixe vazio para usar o node padr\xE3o do sistema.",
    timeoutMs: "Tempo limite de execu\xE7\xE3o (ms)",
    timeoutHelp: "O processo \xE9 encerrado ap\xF3s essa dura\xE7\xE3o.",
    save: "Salvar",
    saving: "Salvando\u2026",
    discard: "Descartar altera\xE7\xF5es",
    unsaved: "N\xE3o salvo",
    saveFailed: "O deploy n\xE3o aceitou esses valores; eles foram mantidos para voc\xEA corrigir.",
    readOnly: "Este deploy armazena as configura\xE7\xF5es somente leitura.",
    expand: "Mostrar configura\xE7\xF5es",
    collapse: "Ocultar configura\xE7\xF5es",
    namespaceUnavailable: "O canal de configura\xE7\xE3o do interpretador est\xE1 indispon\xEDvel. Tente novamente mais tarde.",
    retry: "Tentar novamente"
  },
  ko: {
    title: "\uC778\uD130\uD504\uB9AC\uD130 \uACBD\uB85C",
    intro: "run_python / run_node \uB3C4\uAD6C\uC5D0\uC11C \uC0AC\uC6A9\uD558\uB294 \uC778\uD130\uD504\uB9AC\uD130 \uC2E4\uD589 \uD30C\uC77C \uACBD\uB85C\uB97C \uAD6C\uC131\uD569\uB2C8\uB2E4.",
    pythonPath: "Python \uC2E4\uD589 \uD30C\uC77C \uACBD\uB85C",
    pythonHelp: "\uBAA8\uB378\uC740 run_python \uB3C4\uAD6C\uB97C \uD1B5\uD574 \uC774 \uACBD\uB85C\uC758 Python \uCF54\uB4DC\uB97C \uC2E4\uD589\uD569\uB2C8\uB2E4. \uBE44\uC6CC \uB450\uBA74 \uC2DC\uC2A4\uD15C \uAE30\uBCF8 python\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
    nodePath: "Node.js \uC2E4\uD589 \uD30C\uC77C \uACBD\uB85C",
    nodeHelp: "\uBAA8\uB378\uC740 run_node \uB3C4\uAD6C\uB97C \uD1B5\uD574 \uC774 \uACBD\uB85C\uC758 Node.js \uCF54\uB4DC\uB97C \uC2E4\uD589\uD569\uB2C8\uB2E4. \uBE44\uC6CC \uB450\uBA74 \uC2DC\uC2A4\uD15C \uAE30\uBCF8 node\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
    timeoutMs: "\uC2E4\uD589 \uC81C\uD55C \uC2DC\uAC04 (ms)",
    timeoutHelp: "\uC774 \uC2DC\uAC04\uC774 \uC9C0\uB098\uBA74 \uD504\uB85C\uC138\uC2A4\uAC00 \uAC15\uC81C \uC885\uB8CC\uB429\uB2C8\uB2E4.",
    save: "\uC800\uC7A5",
    saving: "\uC800\uC7A5 \uC911\u2026",
    discard: "\uBCC0\uACBD \uC0AC\uD56D \uBC84\uB9AC\uAE30",
    unsaved: "\uC800\uC7A5\uB418\uC9C0 \uC54A\uC74C",
    saveFailed: "\uC774 \uBC30\uD3EC \uD658\uACBD\uC740 \uD574\uB2F9 \uAC12\uC744 \uC218\uB77D\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC218\uC815\uD560 \uC218 \uC788\uB3C4\uB85D \uB0A8\uACA8 \uB450\uC5C8\uC2B5\uB2C8\uB2E4.",
    readOnly: "\uC774 \uBC30\uD3EC \uD658\uACBD\uC740 \uC124\uC815\uC744 \uC77D\uAE30 \uC804\uC6A9\uC73C\uB85C \uC800\uC7A5\uD569\uB2C8\uB2E4.",
    expand: "\uC124\uC815 \uBCF4\uAE30",
    collapse: "\uC124\uC815 \uC228\uAE30\uAE30",
    namespaceUnavailable: "\uC778\uD130\uD504\uB9AC\uD130 \uAD6C\uC131 \uCC44\uB110\uC744 \uD604\uC7AC \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB098\uC911\uC5D0 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.",
    retry: "\uB2E4\uC2DC \uC2DC\uB3C4"
  },
  ar: {
    title: "\u0645\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0641\u0633\u0650\u0651\u0631",
    intro: "\u0627\u0636\u0628\u0637 \u0645\u0648\u0627\u0636\u0639 \u0627\u0644\u062A\u0646\u0641\u064A\u0630 \u0644\u0644\u0645\u0641\u0633\u0650\u0651\u0631\u064A\u0646 \u0627\u0644\u0630\u064A\u0646 \u062A\u0633\u062A\u062E\u062F\u0645\u0647\u0645\u0627 \u0623\u062F\u0627\u062A\u0627 run_python / run_node.",
    pythonPath: "\u0645\u0633\u0627\u0631 \u0627\u0644\u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062E\u0627\u0635 \u0628\u0640 Python",
    pythonHelp: "\u064A\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u0627\u0631 \u0644\u062A\u0646\u0641\u064A\u0630 \u0643\u0648\u062F Python \u0639\u0628\u0631 \u0623\u062F\u0627\u0629 run_python. \u0627\u062A\u0631\u0643\u0647 \u0641\u0627\u0631\u063A\u064B\u0627 \u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 python \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0646\u0638\u0627\u0645.",
    nodePath: "\u0645\u0633\u0627\u0631 \u0627\u0644\u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062E\u0627\u0635 \u0628\u0640 Node.js",
    nodeHelp: "\u064A\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u0627\u0631 \u0644\u062A\u0646\u0641\u064A\u0630 \u0643\u0648\u062F Node.js \u0639\u0628\u0631 \u0623\u062F\u0627\u0629 run_node. \u0627\u062A\u0631\u0643\u0647 \u0641\u0627\u0631\u063A\u064B\u0627 \u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 node \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0646\u0638\u0627\u0645.",
    timeoutMs: "\u0645\u0647\u0644\u0629 \u0627\u0644\u062A\u0646\u0641\u064A\u0630 (\u0628\u0627\u0644\u0645\u0644\u0644\u064A \u062B\u0627\u0646\u064A\u0629)",
    timeoutHelp: "\u064A\u062A\u0645 \u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0628\u0627\u0644\u0642\u0648\u0629 \u0628\u0639\u062F \u0647\u0630\u0647 \u0627\u0644\u0645\u062F\u0629.",
    save: "\u062D\u0641\u0638",
    saving: "\u062C\u0627\u0631\u064D \u0627\u0644\u062D\u0641\u0638\u2026",
    discard: "\u062A\u062C\u0627\u0647\u0644 \u0627\u0644\u062A\u063A\u064A\u064A\u0631\u0627\u062A",
    unsaved: "\u063A\u064A\u0631 \u0645\u062D\u0641\u0648\u0638",
    saveFailed: "\u0644\u0645 \u064A\u0642\u0628\u0644 \u0647\u0630\u0627 \u0627\u0644\u0646\u0634\u0631 \u0647\u0630\u0647 \u0627\u0644\u0642\u064A\u0645\u061B \u062A\u064F\u0631\u0643\u064E\u062A \u0644\u0643 \u0644\u062A\u0635\u062D\u064A\u062D\u0647\u0627.",
    readOnly: "\u064A\u062E\u0632\u0646 \u0647\u0630\u0627 \u0627\u0644\u0646\u0634\u0631 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0644\u0644\u0642\u0631\u0627\u0621\u0629 \u0641\u0642\u0637.",
    expand: "\u0625\u0638\u0647\u0627\u0631 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A",
    collapse: "\u0625\u062E\u0641\u0627\u0621 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A",
    namespaceUnavailable: "\u0642\u0646\u0627\u0629 \u0636\u0628\u0637 \u0627\u0644\u0645\u0641\u0633\u0650\u0651\u0631 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u062D\u0627\u0644\u064A\u064B\u0627. \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0644\u0627\u062D\u0642\u064B\u0627.",
    retry: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629"
  },
  hi: {
    title: "\u0907\u0902\u091F\u0930\u092A\u094D\u0930\u0947\u091F\u0930 \u092A\u0925",
    intro: "run_python / run_node \u091F\u0942\u0932 \u0926\u094D\u0935\u093E\u0930\u093E \u0909\u092A\u092F\u094B\u0917 \u0915\u093F\u090F \u091C\u093E\u0928\u0947 \u0935\u093E\u0932\u0947 \u0907\u0902\u091F\u0930\u092A\u094D\u0930\u0947\u091F\u0930 \u0928\u093F\u0937\u094D\u092A\u093E\u0926\u0928 \u092F\u094B\u0917\u094D\u092F \u0915\u0947 \u092A\u0925 \u0915\u0949\u0928\u094D\u092B\u093C\u093F\u0917\u0930 \u0915\u0930\u0947\u0902\u0964",
    pythonPath: "Python \u0928\u093F\u0937\u094D\u092A\u093E\u0926\u0928 \u092F\u094B\u0917\u094D\u092F \u092A\u0925",
    pythonHelp: "\u092E\u0949\u0921\u0932 run_python \u091F\u0942\u0932 \u0915\u0947 \u092E\u093E\u0927\u094D\u092F\u092E \u0938\u0947 Python \u0915\u094B\u0921 \u091A\u0932\u093E\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0907\u0938 \u092A\u0925 \u0915\u093E \u0909\u092A\u092F\u094B\u0917 \u0915\u0930\u0924\u093E \u0939\u0948\u0964 \u0938\u093F\u0938\u094D\u091F\u092E \u0915\u0940 \u0921\u093F\u092B\u093C\u0949\u0932\u094D\u091F python \u0915\u093E \u0909\u092A\u092F\u094B\u0917 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0916\u093E\u0932\u0940 \u091B\u094B\u0921\u093C\u0947\u0902\u0964",
    nodePath: "Node.js \u0928\u093F\u0937\u094D\u092A\u093E\u0926\u0928 \u092F\u094B\u0917\u094D\u092F \u092A\u0925",
    nodeHelp: "\u092E\u0949\u0921\u0932 run_node \u091F\u0942\u0932 \u0915\u0947 \u092E\u093E\u0927\u094D\u092F\u092E \u0938\u0947 Node.js \u0915\u094B\u0921 \u091A\u0932\u093E\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0907\u0938 \u092A\u0925 \u0915\u093E \u0909\u092A\u092F\u094B\u0917 \u0915\u0930\u0924\u093E \u0939\u0948\u0964 \u0938\u093F\u0938\u094D\u091F\u092E \u0915\u0940 \u0921\u093F\u092B\u093C\u0949\u0932\u094D\u091F node \u0915\u093E \u0909\u092A\u092F\u094B\u0917 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0916\u093E\u0932\u0940 \u091B\u094B\u0921\u093C\u0947\u0902\u0964",
    timeoutMs: "\u0928\u093F\u0937\u094D\u092A\u093E\u0926\u0928 \u0938\u092E\u092F-\u0938\u0940\u092E\u093E (ms)",
    timeoutHelp: "\u0907\u0938 \u0905\u0935\u0927\u093F \u0915\u0947 \u092C\u093E\u0926 \u092A\u094D\u0930\u0915\u094D\u0930\u093F\u092F\u093E \u0915\u094B \u0915\u0921\u093C\u0940 \u0938\u0947 \u0938\u092E\u093E\u092A\u094D\u0924 \u0915\u0930 \u0926\u093F\u092F\u093E \u091C\u093E\u0924\u093E \u0939\u0948\u0964",
    save: "\u0938\u0939\u0947\u091C\u0947\u0902",
    saving: "\u0938\u0939\u0947\u091C\u093E \u091C\u093E \u0930\u0939\u093E \u0939\u0948\u2026",
    discard: "\u092A\u0930\u093F\u0935\u0930\u094D\u0924\u0928 \u091B\u094B\u0921\u093C\u0947\u0902",
    unsaved: "\u0905\u0938\u0939\u0947\u091C\u093E \u0917\u092F\u093E",
    saveFailed: "\u0907\u0938 \u0924\u0948\u0928\u093E\u0924\u0940 \u0928\u0947 \u0907\u0928 \u092E\u093E\u0928\u094B\u0902 \u0915\u094B \u0938\u094D\u0935\u0940\u0915\u093E\u0930 \u0928\u0939\u0940\u0902 \u0915\u093F\u092F\u093E; \u0907\u0928\u094D\u0939\u0947\u0902 \u0938\u0941\u0927\u093E\u0930\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0906\u092A\u0915\u0947 \u0932\u093F\u090F \u091B\u094B\u0921\u093C \u0926\u093F\u092F\u093E \u0917\u092F\u093E \u0939\u0948\u0964",
    readOnly: "\u092F\u0939 \u0924\u0948\u0928\u093E\u0924\u0940 \u0938\u0947\u091F\u093F\u0902\u0917\u094D\u0938 \u0915\u094B \u0915\u0947\u0935\u0932-\u092A\u0922\u093C\u0928\u0947 \u0915\u0947 \u0930\u0942\u092A \u092E\u0947\u0902 \u0938\u0902\u0917\u094D\u0930\u0939\u0940\u0924 \u0915\u0930\u0924\u0940 \u0939\u0948\u0964",
    expand: "\u0938\u0947\u091F\u093F\u0902\u0917\u094D\u0938 \u0926\u093F\u0916\u093E\u090F\u0901",
    collapse: "\u0938\u0947\u091F\u093F\u0902\u0917\u094D\u0938 \u091B\u093F\u092A\u093E\u090F\u0901",
    namespaceUnavailable: "\u0907\u0902\u091F\u0930\u092A\u094D\u0930\u0947\u091F\u0930 \u0915\u0949\u0928\u094D\u092B\u093C\u093F\u0917\u0930\u0947\u0936\u0928 \u091A\u0948\u0928\u0932 \u092B\u093C\u093F\u0932\u0939\u093E\u0932 \u0905\u0928\u0941\u092A\u0932\u092C\u094D\u0927 \u0939\u0948\u0964 \u0915\u0943\u092A\u092F\u093E \u092C\u093E\u0926 \u092E\u0947\u0902 \u092A\u0941\u0928\u0903 \u092A\u094D\u0930\u092F\u093E\u0938 \u0915\u0930\u0947\u0902\u0964",
    retry: "\u092A\u0941\u0928\u0903 \u092A\u094D\u0930\u092F\u093E\u0938 \u0915\u0930\u0947\u0902"
  },
  id: {
    title: "Jalur interpreter",
    intro: "Konfigurasikan jalur executable interpreter yang digunakan oleh alat run_python / run_node.",
    pythonPath: "Jalur executable Python",
    pythonHelp: "Model menggunakan jalur ini untuk mengeksekusi kode Python melalui alat run_python. Biarkan kosong untuk menggunakan python bawaan sistem.",
    nodePath: "Jalur executable Node.js",
    nodeHelp: "Model menggunakan jalur ini untuk mengeksekusi kode Node.js melalui alat run_node. Biarkan kosong untuk menggunakan node bawaan sistem.",
    timeoutMs: "Waktu habis eksekusi (ms)",
    timeoutHelp: "Proses dihentikan paksa setelah durasi ini.",
    save: "Simpan",
    saving: "Menyimpan\u2026",
    discard: "Buang perubahan",
    unsaved: "Belum disimpan",
    saveFailed: "Deployment ini tidak menerima nilai tersebut; nilai disisakan untuk Anda perbaiki.",
    readOnly: "Deployment ini menyimpan pengaturan sebagai baca-saja.",
    expand: "Tampilkan pengaturan",
    collapse: "Sembunyikan pengaturan",
    namespaceUnavailable: "Saluran konfigurasi interpreter sedang tidak tersedia. Coba lagi nanti.",
    retry: "Coba lagi"
  },
  tr: {
    title: "Yorumlay\u0131c\u0131 yollar\u0131",
    intro: "run_python / run_node ara\xE7lar\u0131n\u0131n kulland\u0131\u011F\u0131 yorumlay\u0131c\u0131 y\xFCr\xFCt\xFClebilir dosyalar\u0131n\u0131 yap\u0131land\u0131r\u0131n.",
    pythonPath: "Python y\xFCr\xFCt\xFClebilir dosya yolu",
    pythonHelp: "Model, run_python arac\u0131 arac\u0131l\u0131\u011F\u0131yla Python kodunu bu yolu kullanarak \xE7al\u0131\u015Ft\u0131r\u0131r. Sistem varsay\u0131lan\u0131 python kullanmak i\xE7in bo\u015F b\u0131rak\u0131n.",
    nodePath: "Node.js y\xFCr\xFCt\xFClebilir dosya yolu",
    nodeHelp: "Model, run_node arac\u0131 arac\u0131l\u0131\u011F\u0131yla Node.js kodunu bu yolu kullanarak \xE7al\u0131\u015Ft\u0131r\u0131r. Sistem varsay\u0131lan\u0131 node kullanmak i\xE7in bo\u015F b\u0131rak\u0131n.",
    timeoutMs: "Y\xFCr\xFCtme zaman a\u015F\u0131m\u0131 (ms)",
    timeoutHelp: "Bu s\xFCreden sonra i\u015Flem zorla sonland\u0131r\u0131l\u0131r.",
    save: "Kaydet",
    saving: "Kaydediliyor\u2026",
    discard: "De\u011Fi\u015Fiklikleri at",
    unsaved: "Kaydedilmedi",
    saveFailed: "Bu da\u011F\u0131t\u0131m bu de\u011Ferleri kabul etmedi; d\xFCzeltmeniz i\xE7in size b\u0131rak\u0131ld\u0131.",
    readOnly: "Bu da\u011F\u0131t\u0131m ayarlar\u0131 salt okunur olarak saklar.",
    expand: "Ayarlar\u0131 g\xF6ster",
    collapse: "Ayarlar\u0131 gizle",
    namespaceUnavailable: "Yorumlay\u0131c\u0131 yap\u0131land\u0131rma kanal\u0131 \u015Fu anda kullan\u0131lam\u0131yor. L\xFCtfen daha sonra tekrar deneyin.",
    retry: "Yeniden dene"
  },
  vi: {
    title: "\u0110\u01B0\u1EDDng d\u1EABn tr\xECnh th\xF4ng d\u1ECBch",
    intro: "C\u1EA5u h\xECnh \u0111\u01B0\u1EDDng d\u1EABn t\u1EC7p th\u1EF1c thi c\u1EE7a tr\xECnh th\xF4ng d\u1ECBch \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng b\u1EDFi c\xF4ng c\u1EE5 run_python / run_node.",
    pythonPath: "\u0110\u01B0\u1EDDng d\u1EABn t\u1EC7p th\u1EF1c thi Python",
    pythonHelp: "M\xF4 h\xECnh d\xF9ng \u0111\u01B0\u1EDDng d\u1EABn n\xE0y \u0111\u1EC3 ch\u1EA1y m\xE3 Python qua c\xF4ng c\u1EE5 run_python. \u0110\u1EC3 tr\u1ED1ng \u0111\u1EC3 d\xF9ng python m\u1EB7c \u0111\u1ECBnh c\u1EE7a h\u1EC7 th\u1ED1ng.",
    nodePath: "\u0110\u01B0\u1EDDng d\u1EABn t\u1EC7p th\u1EF1c thi Node.js",
    nodeHelp: "M\xF4 h\xECnh d\xF9ng \u0111\u01B0\u1EDDng d\u1EABn n\xE0y \u0111\u1EC3 ch\u1EA1y m\xE3 Node.js qua c\xF4ng c\u1EE5 run_node. \u0110\u1EC3 tr\u1ED1ng \u0111\u1EC3 d\xF9ng node m\u1EB7c \u0111\u1ECBnh c\u1EE7a h\u1EC7 th\u1ED1ng.",
    timeoutMs: "Th\u1EDDi gian ch\u1EDD th\u1EF1c thi (ms)",
    timeoutHelp: "Ti\u1EBFn tr\xECnh b\u1ECB bu\u1ED9c k\u1EBFt th\xFAc sau kho\u1EA3ng th\u1EDDi gian n\xE0y.",
    save: "L\u01B0u",
    saving: "\u0110ang l\u01B0u\u2026",
    discard: "B\u1ECF thay \u0111\u1ED5i",
    unsaved: "Ch\u01B0a l\u01B0u",
    saveFailed: "B\u1EA3n tri\u1EC3n khai n\xE0y kh\xF4ng ch\u1EA5p nh\u1EADn c\xE1c gi\xE1 tr\u1ECB \u0111\xF3; ch\xFAng \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i \u0111\u1EC3 b\u1EA1n ch\u1EC9nh s\u1EEDa.",
    readOnly: "B\u1EA3n tri\u1EC3n khai n\xE0y l\u01B0u c\xE0i \u0111\u1EB7t \u1EDF ch\u1EBF \u0111\u1ED9 ch\u1EC9 \u0111\u1ECDc.",
    expand: "Hi\u1EC3n th\u1ECB c\xE0i \u0111\u1EB7t",
    collapse: "\u1EA8n c\xE0i \u0111\u1EB7t",
    namespaceUnavailable: "K\xEAnh c\u1EA5u h\xECnh tr\xECnh th\xF4ng d\u1ECBch hi\u1EC7n kh\xF4ng kh\u1EA3 d\u1EE5ng. Vui l\xF2ng th\u1EED l\u1EA1i sau.",
    retry: "Th\u1EED l\u1EA1i"
  },
  th: {
    title: "\u0E40\u0E2A\u0E49\u0E19\u0E17\u0E32\u0E07\u0E15\u0E31\u0E27\u0E41\u0E1B\u0E25\u0E20\u0E32\u0E29\u0E32",
    intro: "\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E04\u0E48\u0E32\u0E40\u0E2A\u0E49\u0E19\u0E17\u0E32\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E02\u0E2D\u0E07\u0E15\u0E31\u0E27\u0E41\u0E1B\u0E25\u0E20\u0E32\u0E29\u0E32\u0E17\u0E35\u0E48\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E21\u0E37\u0E2D run_python / run_node \u0E43\u0E0A\u0E49",
    pythonPath: "\u0E40\u0E2A\u0E49\u0E19\u0E17\u0E32\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23 Python",
    pythonHelp: "\u0E42\u0E21\u0E40\u0E14\u0E25\u0E43\u0E0A\u0E49\u0E40\u0E2A\u0E49\u0E19\u0E17\u0E32\u0E07\u0E19\u0E35\u0E49\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E23\u0E31\u0E19\u0E42\u0E04\u0E49\u0E14 Python \u0E1C\u0E48\u0E32\u0E19\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E21\u0E37\u0E2D run_python \u0E40\u0E27\u0E49\u0E19\u0E27\u0E48\u0E32\u0E07\u0E44\u0E27\u0E49\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E0A\u0E49 python \u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19\u0E02\u0E2D\u0E07\u0E23\u0E30\u0E1A\u0E1A",
    nodePath: "\u0E40\u0E2A\u0E49\u0E19\u0E17\u0E32\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23 Node.js",
    nodeHelp: "\u0E42\u0E21\u0E40\u0E14\u0E25\u0E43\u0E0A\u0E49\u0E40\u0E2A\u0E49\u0E19\u0E17\u0E32\u0E07\u0E19\u0E35\u0E49\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E23\u0E31\u0E19\u0E42\u0E04\u0E49\u0E14 Node.js \u0E1C\u0E48\u0E32\u0E19\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E21\u0E37\u0E2D run_node \u0E40\u0E27\u0E49\u0E19\u0E27\u0E48\u0E32\u0E07\u0E44\u0E27\u0E49\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E0A\u0E49 node \u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19\u0E02\u0E2D\u0E07\u0E23\u0E30\u0E1A\u0E1A",
    timeoutMs: "\u0E2B\u0E21\u0E14\u0E40\u0E27\u0E25\u0E32\u0E01\u0E32\u0E23\u0E17\u0E33\u0E07\u0E32\u0E19 (ms)",
    timeoutHelp: "\u0E01\u0E23\u0E30\u0E1A\u0E27\u0E19\u0E01\u0E32\u0E23\u0E08\u0E30\u0E16\u0E39\u0E01\u0E1A\u0E31\u0E07\u0E04\u0E31\u0E1A\u0E43\u0E2B\u0E49\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14\u0E2B\u0E25\u0E31\u0E07\u0E08\u0E32\u0E01\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32\u0E19\u0E35\u0E49",
    save: "\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01",
    saving: "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u2026",
    discard: "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E01\u0E32\u0E23\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E41\u0E1B\u0E25\u0E07",
    unsaved: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01",
    saveFailed: "\u0E01\u0E32\u0E23\u0E15\u0E34\u0E14\u0E15\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E22\u0E2D\u0E21\u0E23\u0E31\u0E1A\u0E04\u0E48\u0E32\u0E40\u0E2B\u0E25\u0E48\u0E32\u0E19\u0E35\u0E49 \u0E08\u0E36\u0E07\u0E44\u0E14\u0E49\u0E40\u0E01\u0E47\u0E1A\u0E44\u0E27\u0E49\u0E43\u0E2B\u0E49\u0E04\u0E38\u0E13\u0E41\u0E01\u0E49\u0E44\u0E02",
    readOnly: "\u0E01\u0E32\u0E23\u0E15\u0E34\u0E14\u0E15\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49\u0E08\u0E31\u0E14\u0E40\u0E01\u0E47\u0E1A\u0E01\u0E32\u0E23\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E40\u0E1B\u0E47\u0E19\u0E41\u0E1A\u0E1A\u0E2D\u0E48\u0E32\u0E19\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E40\u0E14\u0E35\u0E22\u0E27",
    expand: "\u0E41\u0E2A\u0E14\u0E07\u0E01\u0E32\u0E23\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32",
    collapse: "\u0E0B\u0E48\u0E2D\u0E19\u0E01\u0E32\u0E23\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32",
    namespaceUnavailable: "\u0E0A\u0E48\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E04\u0E48\u0E32\u0E15\u0E31\u0E27\u0E41\u0E1B\u0E25\u0E20\u0E32\u0E29\u0E32\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E43\u0E19\u0E02\u0E13\u0E30\u0E19\u0E35\u0E49 \u0E42\u0E1B\u0E23\u0E14\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E43\u0E19\u0E20\u0E32\u0E22\u0E2B\u0E25\u0E31\u0E07",
    retry: "\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07"
  },
  ru: {
    title: "\u041F\u0443\u0442\u0438 \u0438\u043D\u0442\u0435\u0440\u043F\u0440\u0435\u0442\u0430\u0442\u043E\u0440\u043E\u0432",
    intro: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u0442\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u044F\u0435\u043C\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0438\u043D\u0442\u0435\u0440\u043F\u0440\u0435\u0442\u0430\u0442\u043E\u0440\u043E\u0432, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u043C\u044B\u0445 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u0430\u043C\u0438 run_python / run_node.",
    pythonPath: "\u041F\u0443\u0442\u044C \u043A \u0438\u0441\u043F\u043E\u043B\u043D\u044F\u0435\u043C\u043E\u043C\u0443 \u0444\u0430\u0439\u043B\u0443 Python",
    pythonHelp: "\u041C\u043E\u0434\u0435\u043B\u044C \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u044D\u0442\u043E\u0442 \u043F\u0443\u0442\u044C \u0434\u043B\u044F \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u043A\u043E\u0434\u0430 Python \u0447\u0435\u0440\u0435\u0437 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442 run_python. \u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0441\u0438\u0441\u0442\u0435\u043C\u043D\u044B\u0439 python \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E.",
    nodePath: "\u041F\u0443\u0442\u044C \u043A \u0438\u0441\u043F\u043E\u043B\u043D\u044F\u0435\u043C\u043E\u043C\u0443 \u0444\u0430\u0439\u043B\u0443 Node.js",
    nodeHelp: "\u041C\u043E\u0434\u0435\u043B\u044C \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u044D\u0442\u043E\u0442 \u043F\u0443\u0442\u044C \u0434\u043B\u044F \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u043A\u043E\u0434\u0430 Node.js \u0447\u0435\u0440\u0435\u0437 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442 run_node. \u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0441\u0438\u0441\u0442\u0435\u043C\u043D\u044B\u0439 node \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E.",
    timeoutMs: "\u0422\u0430\u0439\u043C\u0430\u0443\u0442 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F (\u043C\u0441)",
    timeoutHelp: "\u041F\u0440\u043E\u0446\u0435\u0441\u0441 \u043F\u0440\u0438\u043D\u0443\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0437\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u0442\u0441\u044F \u043F\u043E \u0438\u0441\u0442\u0435\u0447\u0435\u043D\u0438\u0438 \u044D\u0442\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438.",
    save: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C",
    saving: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u2026",
    discard: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
    unsaved: "\u041D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E",
    saveFailed: "\u0414\u0435\u043F\u043B\u043E\u0439\u043C\u0435\u043D\u0442 \u043D\u0435 \u043F\u0440\u0438\u043D\u044F\u043B \u044D\u0442\u0438 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F; \u043E\u043D\u0438 \u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u044B \u0432\u0430\u043C \u0434\u043B\u044F \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F.",
    readOnly: "\u042D\u0442\u043E\u0442 \u0434\u0435\u043F\u043B\u043E\u0439\u043C\u0435\u043D\u0442 \u0445\u0440\u0430\u043D\u0438\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0432 \u0440\u0435\u0436\u0438\u043C\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0447\u0442\u0435\u043D\u0438\u044F.",
    expand: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
    collapse: "\u0421\u043A\u0440\u044B\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
    namespaceUnavailable: "\u041A\u0430\u043D\u0430\u043B \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0438\u043D\u0442\u0435\u0440\u043F\u0440\u0435\u0442\u0430\u0442\u043E\u0440\u043E\u0432 \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443 \u043F\u043E\u0437\u0436\u0435.",
    retry: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C"
  },
  it: {
    title: "Percorsi degli interpreti",
    intro: "Configura gli eseguibili degli interpreti usati dagli strumenti run_python / run_node.",
    pythonPath: "Percorso dell\u2019eseguibile Python",
    pythonHelp: "Il modello usa questo percorso per eseguire codice Python tramite lo strumento run_python. Lascia vuoto per usare il python predefinito di sistema.",
    nodePath: "Percorso dell\u2019eseguibile Node.js",
    nodeHelp: "Il modello usa questo percorso per eseguire codice Node.js tramite lo strumento run_node. Lascia vuoto per usare il node predefinito di sistema.",
    timeoutMs: "Timeout di esecuzione (ms)",
    timeoutHelp: "Il processo viene terminato forzatamente dopo questa durata.",
    save: "Salva",
    saving: "Salvataggio\u2026",
    discard: "Scarta le modifiche",
    unsaved: "Non salvato",
    saveFailed: "La distribuzione non ha accettato questi valori; sono stati lasciati a te per la correzione.",
    readOnly: "Questa distribuzione archivia le impostazioni in sola lettura.",
    expand: "Mostra impostazioni",
    collapse: "Nascondi impostazioni",
    namespaceUnavailable: "Il canale di configurazione degli interpreti non \xE8 disponibile. Riprova pi\xF9 tardi.",
    retry: "Riprova"
  },
  nl: {
    title: "Interpreter-paden",
    intro: "Configureer de interpreter-uitvoerbare bestanden die door de tools run_python / run_node worden gebruikt.",
    pythonPath: "Pad naar Python-uitvoerbaar bestand",
    pythonHelp: "Het model gebruikt dit pad om Python-code uit te voeren via de tool run_python. Laat leeg om de systeemstandaard python te gebruiken.",
    nodePath: "Pad naar Node.js-uitvoerbaar bestand",
    nodeHelp: "Het model gebruikt dit pad om Node.js-code uit te voeren via de tool run_node. Laat leeg om de systeemstandaard node te gebruiken.",
    timeoutMs: "Uitvoeringstime-out (ms)",
    timeoutHelp: "Het proces wordt na deze duur geforceerd be\xEBindigd.",
    save: "Opslaan",
    saving: "Opslaan\u2026",
    discard: "Wijzigingen negeren",
    unsaved: "Niet opgeslagen",
    saveFailed: "De deployment heeft deze waarden niet geaccepteerd; ze zijn voor u achtergelaten om te corrigeren.",
    readOnly: "Deze deployment slaat instellingen alleen-lezen op.",
    expand: "Instellingen tonen",
    collapse: "Instellingen verbergen",
    namespaceUnavailable: "Het interpreterconfiguratiekanaal is momenteel niet beschikbaar. Probeer het later opnieuw.",
    retry: "Opnieuw proberen"
  },
  sv: {
    title: "Tolkens\xF6kv\xE4gar",
    intro: "Konfigurera tolkarnas exekverbara filer som anv\xE4nds av verktygen run_python / run_node.",
    pythonPath: "S\xF6kv\xE4g till Python-exekverbar fil",
    pythonHelp: "Modellen anv\xE4nder den h\xE4r s\xF6kv\xE4gen f\xF6r att k\xF6ra Python-kod via verktyget run_python. L\xE4mna tomt f\xF6r att anv\xE4nda systemets standard-python.",
    nodePath: "S\xF6kv\xE4g till Node.js-exekverbar fil",
    nodeHelp: "Modellen anv\xE4nder den h\xE4r s\xF6kv\xE4gen f\xF6r att k\xF6ra Node.js-kod via verktyget run_node. L\xE4mna tomt f\xF6r att anv\xE4nda systemets standard-node.",
    timeoutMs: "K\xF6rningstimeout (ms)",
    timeoutHelp: "Processen avslutas tv\xE5ngsm\xE4ssigt efter denna tid.",
    save: "Spara",
    saving: "Sparar\u2026",
    discard: "Ignorera \xE4ndringar",
    unsaved: "Ej sparat",
    saveFailed: "Distributionen accepterade inte dessa v\xE4rden; de l\xE4mnades \xE5t dig att korrigera.",
    readOnly: "Den h\xE4r distributionen lagrar inst\xE4llningar skrivskyddat.",
    expand: "Visa inst\xE4llningar",
    collapse: "D\xF6lj inst\xE4llningar",
    namespaceUnavailable: "Konfigurationskanalen f\xF6r tolk \xE4r f\xF6r n\xE4rvarande inte tillg\xE4nglig. F\xF6rs\xF6k igen senare.",
    retry: "F\xF6rs\xF6k igen"
  },
  pl: {
    title: "\u015Acie\u017Cki interpreter\xF3w",
    intro: "Skonfiguruj pliki wykonywalne interpreter\xF3w u\u017Cywane przez narz\u0119dzia run_python / run_node.",
    pythonPath: "\u015Acie\u017Cka pliku wykonywalnego Python",
    pythonHelp: "Model u\u017Cywa tej \u015Bcie\u017Cki do wykonywania kodu Python przez narz\u0119dzie run_python. Pozostaw puste, aby u\u017Cy\u0107 domy\u015Blnego python systemu.",
    nodePath: "\u015Acie\u017Cka pliku wykonywalnego Node.js",
    nodeHelp: "Model u\u017Cywa tej \u015Bcie\u017Cki do wykonywania kodu Node.js przez narz\u0119dzie run_node. Pozostaw puste, aby u\u017Cy\u0107 domy\u015Blnego node systemu.",
    timeoutMs: "Limit czasu wykonania (ms)",
    timeoutHelp: "Proces jest wymuszenie ko\u0144czony po tym czasie.",
    save: "Zapisz",
    saving: "Zapisywanie\u2026",
    discard: "Odrzu\u0107 zmiany",
    unsaved: "Niezapisano",
    saveFailed: "Wdro\u017Cenie nie przyj\u0119\u0142o tych warto\u015Bci; pozostawiono je Tobie do poprawienia.",
    readOnly: "To wdro\u017Cenie przechowuje ustawienia tylko do odczytu.",
    expand: "Poka\u017C ustawienia",
    collapse: "Ukryj ustawienia",
    namespaceUnavailable: "Kana\u0142 konfiguracji interpreter\xF3w jest obecnie niedost\u0119pny. Spr\xF3buj ponownie p\xF3\u017Aniej.",
    retry: "Spr\xF3buj ponownie"
  },
  "zh-HK": {
    title: "\u89E3\u91CB\u5668\u8DEF\u5F91",
    intro: "\u8A2D\u5B9A run_python / run_node \u5DE5\u5177\u6240\u4F7F\u7528\u7684\u89E3\u91CB\u5668\u8DEF\u5F91\u3002",
    pythonPath: "Python \u53EF\u57F7\u884C\u6A94\u6848\u8DEF\u5F91",
    pythonHelp: "\u6A21\u578B\u6703\u900F\u904E run_python \u5DE5\u5177\u4F7F\u7528\u6B64\u8DEF\u5F91\u57F7\u884C Python \u7A0B\u5F0F\u78BC\u3002\u7559\u7A7A\u6703\u4F7F\u7528\u7CFB\u7D71\u9810\u8A2D\u7684 python\u3002",
    nodePath: "Node.js \u53EF\u57F7\u884C\u6A94\u6848\u8DEF\u5F91",
    nodeHelp: "\u6A21\u578B\u6703\u900F\u904E run_node \u5DE5\u5177\u4F7F\u7528\u6B64\u8DEF\u5F91\u57F7\u884C Node.js \u7A0B\u5F0F\u78BC\u3002\u7559\u7A7A\u6703\u4F7F\u7528\u7CFB\u7D71\u9810\u8A2D\u7684 node\u3002",
    timeoutMs: "\u57F7\u884C\u903E\u6642\uFF08\u6BEB\u79D2\uFF09",
    timeoutHelp: "\u8D85\u904E\u8A72\u6642\u9577\uFF0C\u9032\u7A0B\u6703\u88AB\u5F37\u5236\u7D42\u6B62\u3002",
    save: "\u5132\u5B58",
    saving: "\u5132\u5B58\u4E2D\u2026",
    discard: "\u653E\u68C4\u4FEE\u6539",
    unsaved: "\u672A\u5132\u5B58",
    saveFailed: "\u6B64\u90E8\u7F72\u672A\u6709\u63A5\u53D7\u9019\u4E9B\u6578\u503C\uFF0C\u5DF2\u4FDD\u7559\u4F9B\u4F60\u4FEE\u6539\u3002",
    readOnly: "\u6B64\u90E8\u7F72\u7684\u8A2D\u5B9A\u70BA\u552F\u8B80\u3002",
    expand: "\u5C55\u958B\u8A2D\u5B9A",
    collapse: "\u6536\u8D77\u8A2D\u5B9A",
    namespaceUnavailable: "\u89E3\u91CB\u5668\u8A2D\u5B9A\u901A\u9053\u76EE\u524D\u7121\u6CD5\u4F7F\u7528\u3002\u8ACB\u7A0D\u5F8C\u518D\u8A66\u3002",
    retry: "\u91CD\u8A66"
  },
  "zh-TW": {
    title: "\u89E3\u8B6F\u5668\u8DEF\u5F91",
    intro: "\u8A2D\u5B9A run_python / run_node \u5DE5\u5177\u4F7F\u7528\u7684\u89E3\u8B6F\u5668\u8DEF\u5F91\u3002",
    pythonPath: "Python \u57F7\u884C\u6A94\u8DEF\u5F91",
    pythonHelp: "\u6A21\u578B\u6703\u900F\u904E run_python \u5DE5\u5177\u4F7F\u7528\u6B64\u8DEF\u5F91\u57F7\u884C Python \u7A0B\u5F0F\u78BC\u3002\u7559\u7A7A\u5247\u4F7F\u7528\u7CFB\u7D71\u9810\u8A2D\u7684 python\u3002",
    nodePath: "Node.js \u57F7\u884C\u6A94\u8DEF\u5F91",
    nodeHelp: "\u6A21\u578B\u6703\u900F\u904E run_node \u5DE5\u5177\u4F7F\u7528\u6B64\u8DEF\u5F91\u57F7\u884C Node.js \u7A0B\u5F0F\u78BC\u3002\u7559\u7A7A\u5247\u4F7F\u7528\u7CFB\u7D71\u9810\u8A2D\u7684 node\u3002",
    timeoutMs: "\u57F7\u884C\u903E\u6642\uFF08\u6BEB\u79D2\uFF09",
    timeoutHelp: "\u8D85\u904E\u8A72\u6642\u9577\uFF0C\u7A0B\u5F0F\u5C07\u88AB\u5F37\u5236\u7D42\u6B62\u3002",
    save: "\u5132\u5B58",
    saving: "\u5132\u5B58\u4E2D\u2026",
    discard: "\u653E\u68C4\u8B8A\u66F4",
    unsaved: "\u5C1A\u672A\u5132\u5B58",
    saveFailed: "\u672C\u90E8\u7F72\u672A\u63A5\u53D7\u9019\u4E9B\u6578\u503C\uFF0C\u5DF2\u4FDD\u7559\u4F9B\u60A8\u4FEE\u6B63\u3002",
    readOnly: "\u672C\u90E8\u7F72\u7684\u8A2D\u5B9A\u70BA\u552F\u8B80\u3002",
    expand: "\u5C55\u958B\u8A2D\u5B9A",
    collapse: "\u6536\u5408\u8A2D\u5B9A",
    namespaceUnavailable: "\u89E3\u8B6F\u5668\u8A2D\u5B9A\u901A\u9053\u76EE\u524D\u7121\u6CD5\u4F7F\u7528\u3002\u8ACB\u7A0D\u5F8C\u91CD\u8A66\u3002",
    retry: "\u91CD\u8A66"
  },
  "zh-MO": {
    title: "\u89E3\u91CB\u5668\u8DEF\u5F91",
    intro: "\u8A2D\u5B9A run_python / run_node \u5DE5\u5177\u6240\u4F7F\u7528\u7684\u89E3\u91CB\u5668\u8DEF\u5F91\u3002",
    pythonPath: "Python \u53EF\u57F7\u884C\u6A94\u6848\u8DEF\u5F91",
    pythonHelp: "\u6A21\u578B\u6703\u900F\u904E run_python \u5DE5\u5177\u4F7F\u7528\u6B64\u8DEF\u5F91\u57F7\u884C Python \u7A0B\u5F0F\u78BC\u3002\u7559\u7A7A\u6703\u4F7F\u7528\u7CFB\u7D71\u9810\u8A2D\u7684 python\u3002",
    nodePath: "Node.js \u53EF\u57F7\u884C\u6A94\u6848\u8DEF\u5F91",
    nodeHelp: "\u6A21\u578B\u6703\u900F\u904E run_node \u5DE5\u5177\u4F7F\u7528\u6B64\u8DEF\u5F91\u57F7\u884C Node.js \u7A0B\u5F0F\u78BC\u3002\u7559\u7A7A\u6703\u4F7F\u7528\u7CFB\u7D71\u9810\u8A2D\u7684 node\u3002",
    timeoutMs: "\u57F7\u884C\u8D85\u6642\uFF08\u6BEB\u79D2\uFF09",
    timeoutHelp: "\u8D85\u904E\u8A72\u6642\u9577\uFF0C\u7A0B\u5E8F\u6703\u88AB\u5F37\u5236\u7D42\u6B62\u3002",
    save: "\u5132\u5B58",
    saving: "\u5132\u5B58\u4E2D\u2026",
    discard: "\u653E\u68C4\u4FEE\u6539",
    unsaved: "\u672A\u5132\u5B58",
    saveFailed: "\u8A72\u90E8\u7F72\u672A\u6709\u63A5\u53D7\u9019\u4E9B\u6578\u503C\uFF0C\u5DF2\u4FDD\u7559\u4F9B\u4F60\u4FEE\u6539\u3002",
    readOnly: "\u8A72\u90E8\u7F72\u7684\u8A2D\u5B9A\u70BA\u552F\u8B80\u3002",
    expand: "\u5C55\u958B\u8A2D\u5B9A",
    collapse: "\u6536\u8D77\u8A2D\u5B9A",
    namespaceUnavailable: "\u89E3\u91CB\u5668\u8A2D\u5B9A\u901A\u9053\u66AB\u6642\u7121\u6CD5\u4F7F\u7528\u3002\u8ACB\u7A0D\u5F8C\u518D\u8A66\u3002",
    retry: "\u91CD\u8A66"
  }
};

// src/client/index.ts
var inject = ["slots", "locale", "connection"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-interpreters: dictionaries");
  ctx.effect(() => {
    let dispose;
    const sync = () => {
      dispose?.();
      dispose = void 0;
      const store = ctx.get("betterLocale");
      if (store !== void 0) {
        dispose = store.register(NS, dicts);
      }
    };
    sync();
    const unsubscribe = ctx.locale.subscribe(sync);
    return () => {
      unsubscribe();
      dispose?.();
    };
  }, "interpreters: better-locale override dicts");
  const controller = new InterpretersCardController();
  const useSnapshot = bindSnapshotSelector(controller.store);
  ctx.effect(() => {
    let pending = false;
    const refresh = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        refreshIfLoaded(controller);
      });
    };
    const disposers = [ctx.on("connection/reset", refresh)];
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, "dsh-interpreters: pushed invalidations");
  ctx.slots.inject("settings.plugin.item", function* () {
    yield ctx.slots.register({
      name: "settings.plugin.item",
      key: NS,
      locale: NS,
      inject: () => ({ controller, useSnapshot })
    }, InterpretersCard);
  });
}
/*! Bundled license information:

use-sync-external-store/cjs/use-sync-external-store-with-selector.production.min.js:
  (**
   * @license React
   * use-sync-external-store-with-selector.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
return module.exports; } });
