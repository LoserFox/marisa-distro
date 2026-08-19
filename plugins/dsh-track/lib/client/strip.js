import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * TrackStrip: the composer-dock strip surfacing capture-wall state. Styles
 * are inline (no CSS modules) so the client bundle needs no CSS pipeline.
 *
 * The count is fetched from the host API and re-polled while the app is
 * open (same cadence as the right panel's auto-refresh), so the badge never
 * lies — the previous version hardcoded `captures: 0` and always showed
 * "暂无捕获 / No captures" (2026-08-13).
 * @module @deepseek-ai/dsh-track/client/strip
 */
import { useEffect, useState } from 'react';
const style = {
    strip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '2px 8px',
        border: '1px solid rgba(128, 128, 128, 0.3)',
        borderRadius: 6,
        background: 'transparent',
        color: 'inherit',
        fontSize: 12,
        cursor: 'pointer',
    },
    label: { fontWeight: 600 },
    badge: {
        padding: '0 6px',
        borderRadius: 999,
        background: '#4c8dff',
        color: '#fff',
        fontSize: 11,
        lineHeight: '16px',
    },
    muted: { opacity: 0.7 },
    empty: { opacity: 0.55, fontStyle: 'italic' },
};
const REFRESH_MS = 20_000;
/** Track strip component: label + live open capture count, click opens the panel. */
export function TrackStrip({ captures: initial, onClick, t }) {
    const [captures, setCaptures] = useState(initial ?? 0);
    useEffect(() => {
        let alive = true;
        const load = () => {
            fetch('/api/track/captures')
                .then((r) => r.json())
                .then((data) => {
                if (!alive)
                    return;
                const open = (data.captures ?? []).filter((c) => c.status === 'open').length;
                setCaptures(open);
            })
                .catch(() => { });
        };
        load();
        const id = window.setInterval(load, REFRESH_MS);
        window.addEventListener('focus', load);
        return () => {
            alive = false;
            window.clearInterval(id);
            window.removeEventListener('focus', load);
        };
    }, []);
    return (_jsxs("button", { type: "button", style: style.strip, "data-testid": "track-strip", onClick: onClick, title: t('strip.title'), children: [_jsx("span", { style: style.label, children: t('strip.label') }), captures > 0 ? (_jsx("span", { style: style.badge, children: t(captures === 1 ? 'strip.captures.one' : 'strip.captures', { n: captures }) })) : (_jsx("span", { style: style.empty, children: t('strip.empty') }))] }));
}
