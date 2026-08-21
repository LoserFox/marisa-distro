window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-auto-resume",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// .claude/worktrees/rc8-test/plugins/dsh-auto-resume/src/client.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);

// .claude/worktrees/rc8-test/plugins/dsh-auto-resume/src/interrupted.js
function isInterrupted(session) {
  if (session === void 0 || session === null) return false;
  if (session.running || session.removed) return false;
  if (session.openState !== "open") return false;
  if (session.partial !== null && session.partial !== void 0) return true;
  const nodes = session.nodes;
  if (Array.isArray(nodes) && nodes.length > 0) {
    const last = nodes[nodes.length - 1];
    if (last !== void 0 && last !== null) {
      if (last.kind === "assistant" && last.interrupted === true) return true;
      if (last.kind === "turn-max-tokens") return true;
    }
  }
  const timings = session.turnTimings;
  if (timings !== void 0 && timings !== null && typeof timings.keys === "function" && timings.size > 0) {
    let lastTurn = -1;
    for (const turn of timings.keys()) if (turn > lastTurn) lastTurn = turn;
    const t = timings.get(lastTurn);
    if (t !== void 0 && t.endTime === void 0) return true;
  }
  return false;
}

// .claude/worktrees/rc8-test/plugins/dsh-auto-resume/src/client.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var NS = "dsh-auto-resume";
var inject = ["slots"];
function PlayIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 2.5L13 8L4 13.5V2.5Z", fill: "currentColor" }) });
}
var CSS = `
.dsh-resume-play{display:inline-flex;align-items:center;justify-content:center;flex:none;width:34px;height:34px;border:none;border-radius:999px;background:var(--dsw-alias-button-info-fill,var(--dsw-alias-brand-primary));color:#fff;cursor:pointer;transition:background-color 100ms ease}
.dsh-resume-play:hover:not(:disabled){background:var(--dsw-alias-button-info-hover,var(--dsw-alias-brand-primary))}
.dsh-resume-play:disabled{opacity:.4;cursor:default}
/* In-place replacement: while the play button is present, hide the stock
   primary send button that follows it in the composer tool row. */
div[data-slot="conversation.input.right"]:has(button.dsh-resume-play) ~ button[aria-label="\u53D1\u9001\u6D88\u606F"],
div[data-slot="conversation.input.right"]:has(button.dsh-resume-play) ~ button[aria-label="Send message"]{display:none}
`;
function installStyles() {
  const id = `${NS}/styles`;
  if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return () => {
  };
  const style = document.createElement("style");
  style.dataset.pluginCss = id;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
function ResumePlayButton(props) {
  if (!isInterrupted(props.session)) return null;
  const input = props.input;
  const actions = props.inputActions;
  if (input === void 0 || actions === void 0) return null;
  if (typeof input.draft === "string" && input.draft.trim() !== "") return null;
  const label = typeof props.t === "function" ? props.t("continue") : "\u7EE7\u7EED";
  const onClick = () => {
    actions.setDraft(label);
    actions.submit();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className: "dsh-resume-play",
      "aria-label": label,
      title: label,
      onClick,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlayIcon, {})
    }
  );
}
function apply(ctx) {
  const locale = ctx.get("locale");
  if (locale !== void 0) {
    ctx.effect(() => locale.register(NS, {
      zh: { continue: "\u7EE7\u7EED" },
      en: { continue: "Continue" }
    }), `${NS}: dictionaries`);
  }
  ctx.effect(installStyles, `${NS}: styles`);
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register(
    { name: "conversation.input.right", id: "dsh-auto-resume", order: 100, locale: NS },
    ResumePlayButton
  ));
}

		return module.exports;
	}
});
