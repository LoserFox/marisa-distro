import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Conversation view tab: 会话结构图 (calendar yarn). Registered as a
 * 'conversation.view' slot entry — the host renders the tab, tracks
 * aria-selected / active underline, and mounts only the active view. This
 * follows the ui-trajectory pattern exactly (no DOM tab injection).
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarYarnRoot } from "./calendar-yarn.js";
const calStyles = {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    background: 'var(--dsw-alias-bg-base, #10151C)', color: '#D6DEE8',
    fontFamily: "-apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    minWidth: 0, minHeight: 0,
};
/**
 * Fetch the whole-store calendar dataset (all projects). The yarn is global
 * (not per-session); sessionId drives refresh + is available for future
 * per-session drill-down.
 */
async function fetchCalendar() {
    try {
        const r = await fetch('/api/track/calendar').then((res) => res.json());
        return r.calendar ?? null;
    }
    catch {
        return null;
    }
}
export function GraphView(props) {
    const { sessionId, onJump } = props;
    const [cal, setCal] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let alive = true;
        const load = () => {
            setLoading(true);
            void fetchCalendar().then((d) => { if (alive) {
                setCal(d);
                setLoading(false);
            } });
        };
        load();
        // Refresh when the right-panel build buttons finish (they dispatch this).
        const onBuilt = () => { load(); };
        window.addEventListener('track:graph-built', onBuilt);
        return () => { alive = false; window.removeEventListener('track:graph-built', onBuilt); };
    }, [sessionId]);
    const body = useMemo(() => {
        if (loading)
            return _jsx("div", { style: { ...calStyles, alignItems: 'center', justifyContent: 'center', color: '#74839A', fontSize: 12 }, children: "\u52A0\u8F7D\u65E5\u5386\u7EB1\u7EBF\u2026" });
        if (cal === null || cal.sessions.length === 0) {
            return _jsx("div", { style: { ...calStyles, alignItems: 'center', justifyContent: 'center', color: '#74839A', fontSize: 12 }, children: "\u6682\u65E0\u65E5\u5386\u6570\u636E \u2014 \u5148\u5728\u53F3\u4FA7 Track \u9762\u677F\u70B9\u300C\u6784\u5EFA\u300D\u751F\u6210\u4F1A\u8BDD\u56FE" });
        }
        return _jsx(CalendarYarnRoot, { data: cal, onJump: onJump });
    }, [loading, cal, onJump]);
    return _jsx("div", { style: { position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }, children: body });
}
