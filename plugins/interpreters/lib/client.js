window.__ModuleLoader__.load({ id: "@huanlin/dsh-plugin-interpreters", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_dsh_client_web_react = require("@deepseek-ai/dsh-client-web-react");

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

// src/client/index.ts
var inject = ["slots", "locale", "connection"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-interpreters: dictionaries");
  const controller = new InterpretersCardController();
  const useSnapshot = (0, import_dsh_client_web_react.bindSnapshotSelector)(controller.store);
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
      key: "interpreters",
      // rc7 sync (2026-08-18): plugin-item slot is keyed by settings namespace
            locale: NS,
      inject: () => ({ controller, useSnapshot })
    }, InterpretersCard);
  });
}
return module.exports; } });
