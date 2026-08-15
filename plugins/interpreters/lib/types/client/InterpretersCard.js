import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * InterpretersCard — the `settings.plugin.item` card for the interpreters
 * configuration.
 *
 * Self-drawn chrome replicating the upstream `PluginCard` contract: the
 * upstream client value face exports no reusable card component, so this
 * card draws its own collapsible `<li>` with the same header button (name
 * over description, dirty pill, rotating chevron, aria) and divided body
 * (readOnly notice, form fields, footer with failed/saved message +
 * Discard/Save). Three fields (pythonPath, nodePath, timeoutMs) are staged
 * through the card's controller; save commits them through the
 * `/api/interpreters/set` gateway channel.
 *
 * @module dsh-interpreters/client/InterpretersCard
 */
import { useState } from 'react';
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatFieldNumber, formatFieldText, } from "./store.js";
import styles from './InterpretersCard.module.css';
/**
 * Render the interpreters card inside the plugin-config section, replicating
 * the upstream PluginCard chrome.
 * @param props - slot-delivered injected dependencies and the synthesized t seat.
 * @returns the card.
 */
export function InterpretersCard(props) {
    const { controller, useSnapshot, t } = props;
    const state = useSnapshot(snapshot => snapshot);
    // Load-on-mount: the plugin-config page mounts the card lazily when the
    // user opens the settings panel, so the first mount triggers the first
    // gateway load.
    if (state.status === 'idle')
        void controller.load();
    // Disclosure is card-local USER state (upstream rationale): the healthy
    // card starts collapsed and opens on the header click only. The degraded
    // (unavailable) card renders its notice body ALWAYS visible, so `open` is
    // DERIVED from the current snapshot.
    const [userOpen, setUserOpen] = useState(false);
    const degraded = state.status === 'ready' && !state.available;
    const open = userOpen || degraded;
    const title = t('title');
    const header = (_jsxs("button", { type: "button", className: styles.header, "aria-expanded": open, "aria-label": `${t(open ? 'collapse' : 'expand')}: ${title}`, 
        // While degraded the derived open is forced true, so the click must be
        // a no-op — toggling userOpen would silently latch it and pre-open the
        // recovered form.
        onClick: () => { if (!degraded)
            setUserOpen(!userOpen); }, children: [_jsxs("span", { className: styles.headText, children: [_jsx("span", { className: styles.name, children: title }), _jsx("span", { className: styles.description, children: t('intro') })] }), state.dirty ? _jsx("span", { className: styles.pending, children: t('unsaved') }) : null, _jsx(IconChevronDownOutline14, { className: open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron })] }));
    let body;
    if (degraded) {
        // The gateway channel is down or the namespace is not served to this
        // client — render the explicit notice and never offer Save.
        body = (_jsxs("div", { className: styles.body, children: [_jsx("p", { className: styles.notice, role: "status", children: t('namespaceUnavailable') }), _jsx("div", { className: styles.footer, children: _jsx("button", { type: "button", className: styles.discard, onClick: () => { void controller.load(); }, children: t('retry') }) })] }));
    }
    else if (state.status === 'ready') {
        const { draft, writable, applyState } = state;
        const saving = applyState.kind === 'saving';
        const busy = !writable || saving;
        const saveDisabled = !state.dirty || saving || !writable;
        const discardDisabled = !state.dirty || saving;
        const errorText = applyState.kind === 'error' ? applyState.message : undefined;
        body = (_jsxs("div", { className: styles.body, children: [!writable ? _jsx("p", { className: styles.readOnly, role: "status", children: t('readOnly') }) : null, applyState.kind === 'saved' ? _jsx("p", { className: styles.savedNotice, role: "status", children: t('save') }) : null, _jsxs("div", { className: styles.form, children: [_jsx(Field, { id: "plugin-config-interpreters-python", label: t('pythonPath'), hint: t('pythonHelp'), text: formatFieldText(draft.pythonPath), disabled: busy, onEdit: (text) => { controller.edit('pythonPath', text); } }), _jsx(Field, { id: "plugin-config-interpreters-node", label: t('nodePath'), hint: t('nodeHelp'), text: formatFieldText(draft.nodePath), disabled: busy, onEdit: (text) => { controller.edit('nodePath', text); } }), _jsx(Field, { id: "plugin-config-interpreters-timeout", label: t('timeoutMs'), hint: t('timeoutHelp'), text: formatFieldNumber(draft.timeoutMs), numeric: true, disabled: busy, onEdit: (text) => { controller.edit('timeoutMs', text); } })] }), _jsxs("div", { className: styles.footer, children: [errorText === undefined ? null : _jsx("p", { className: styles.failed, role: "status", children: errorText }), _jsx("button", { type: "button", className: styles.discard, disabled: discardDisabled, onClick: () => { controller.discard(); }, children: t('discard') }), _jsx("button", { type: "button", className: styles.save, disabled: saveDisabled, onClick: () => { controller.save(); }, children: t(saving ? 'saving' : 'save') })] })] }));
    }
    else {
        // Loading (or the idle→loading transition): the header alone — an open
        // card shows an empty body.
        body = _jsx("div", { className: styles.body });
    }
    return (_jsxs("li", { className: open ? `${styles.card} ${styles.cardOpen}` : styles.card, children: [header, open ? body : null] }));
}
/** One staged field control (text or numeric). */
function Field(props) {
    return (_jsxs("div", { className: styles.field, children: [_jsx("label", { className: styles.fieldLabel, htmlFor: props.id, children: props.label }), _jsx("input", { id: props.id, className: styles.input, type: props.numeric ? 'number' : 'text', ...props.numeric ? { inputMode: 'numeric' } : {}, value: props.text, disabled: props.disabled, onChange: (event) => { props.onEdit(event.target.value); } }), _jsx("p", { className: styles.hint, children: props.hint })] }));
}
