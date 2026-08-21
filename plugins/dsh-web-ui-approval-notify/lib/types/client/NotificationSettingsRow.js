import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** General Settings row for the desktop-notification permission and display style. */
import { useState } from 'react';
import { notificationStyle, STYLE_KEY } from "./notify.js";
import css from './NotificationSettingsRow.module.css';
/** Read the current browser permission state (safe outside browsers). */
export function permissionState() {
    if (typeof Notification === 'undefined')
        return 'unsupported';
    return Notification.permission;
}
/** Locale key for a permission state, for the settings row copy. */
function statusKey(state) {
    switch (state) {
        case 'granted': return 'settings.status.granted';
        case 'denied': return 'settings.status.denied';
        case 'default': return 'settings.status.default';
        case 'unsupported': return 'settings.status.unsupported';
    }
}
/**
 * Render the desktop-notification preference row: current browser state plus
 * a request button (the user-gesture entry point the browser requires before
 * `new Notification` works), and a display-style selector (native Windows
 * toast vs the browser default UI) persisted to localStorage.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function NotificationSettingsRow({ t }) {
    const [state, setState] = useState(permissionState);
    const [style, setStyle] = useState(notificationStyle);
    const request = async () => {
        if (typeof Notification === 'undefined')
            return;
        const next = await Notification.requestPermission();
        setState(next);
    };
    const changeStyle = (next) => {
        setStyle(next);
        try {
            localStorage.setItem(STYLE_KEY, next);
        }
        catch {
            // storage unavailable (private mode / restrictions): keep in-memory only
        }
    };
    return (_jsxs("div", { className: css.row, children: [_jsxs("div", { className: css.rowText, children: [_jsx("div", { className: css.title, children: t('settings.title') }), _jsx("div", { className: css.desc, children: t('settings.description') }), _jsx("div", { className: css.status, children: t(statusKey(state)) }), _jsxs("div", { className: css.styleRow, children: [_jsx("span", { className: css.styleLabel, children: t('settings.style') }), _jsxs("select", { className: css.styleSelect, value: style, "aria-label": t('settings.style'), onChange: (event) => { changeStyle(event.target.value); }, children: [_jsx("option", { value: "native", children: t('settings.style.native') }), _jsx("option", { value: "webview", children: t('settings.style.webview') })] })] }), _jsx("div", { className: css.styleHint, children: t('settings.style.desc') })] }), state === 'granted' || state === 'unsupported' ? null : (_jsx("button", { type: "button", className: css.button, onClick: () => { void request(); }, children: t('settings.request') }))] }));
}
