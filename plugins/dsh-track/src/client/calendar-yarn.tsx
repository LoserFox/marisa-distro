/**
 * Calendar-yarn view — 3 tabs (日历纱线 / 矩阵 / 会话表), ported from the
 * dsh-track-calendar-yarn design. Yarn nodes = REQUIREMENTS (issues/captures)
 * on a day×project grid; sessions thread their requirements. Key nodes are
 * clickable to jump into the conversation.
 * @module @fakechris/dsh-track/client/calendar-yarn
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const T = {
  bg: '#10151C', panel: '#171E27', panelHi: '#1D2632', line: '#26303C',
  text: '#D6DEE8', muted: '#74839A', faint: '#4A5568',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  sans: "-apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
};
const GOLD = '#E0B34E';
const UNK_HUE = '#5A6674';
const rgba = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
};

export interface CalProject { id: string; name: string; hue: string }
export interface CalTurn { outcome: 'completed' | 'aborted' | 'error' | 'blocked' }
export interface CalDirective { text: string; messageId?: string }
export interface CalSegment {
  day: number; proj: string; req: string; reqMessageId?: string; sessionId: string;
  instr: CalDirective[]; events: number; turns: CalTurn[]; tools: string[];
}
export interface CalRequirement {
  id: string; sessionId: string; proj: string; req: string; day: number; events: number; messageId?: string; origin: CalOrigin;
}
export type CalOrigin = 'user' | 'subagent' | 'auto'
export interface CalPerDay { day: number; dom: string; events: number; multi: boolean }
export interface CalSession {
  id: string; title: string; origin: CalOrigin; userMsgCount: number; startDay: number; activeDays: number[];
  perDay: CalPerDay[]; segments: CalSegment[]; switches: number;
  nReq: number; nInstr: number; projects: string[];
}
export interface CalLink { from: string; to: string; kind: 'forked-from' | 'derives' | 'executed-in'; toSession?: string }
export interface CalData {
  days: number; dayBase: string; projects: CalProject[];
  sessions: CalSession[]; requirements: CalRequirement[];
  links: CalLink[];
}

export interface CalJump { sessionId: string; messageId?: string }
export interface CalProps { data: CalData; onJump: (j: CalJump) => void }

const OUTCOME_GLYPH: Record<string, string> = { completed: '✓', aborted: '⊘', error: '✕', blocked: '✕' };
const dayLabelOf = (base: number, day: number): string => {
  const t = new Date(base + day * 86400000);
  return String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
};

const DAY_W = 60, LANE_H = 86, TOPH = 30;

/** Yarn: x = days, lanes = projects (by event volume); nodes = REQUIREMENTS;
 *  threads = sessions (bezier, gold diamond on lane switch). Layout follows the
 *  track-calendar-fixed reference: lanes sorted by events, zero-activity repos
 *  folded into '其他 ×N', greedy spiral packing per cell, self-adaptive sizing.
 */
function YarnView(props: {
  data: CalData; selId: string | null; setSelId: (id: string | null) => void;
  hover: string | null; setHover: (h: string | null) => void; onJump: (j: CalJump) => void;
}) {
  const { data, selId, setSelId, hover, setHover, onJump } = props;
  const base = Date.parse(data.dayBase);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [, setSize] = useState(0);
  const [tangledOnly, setTangledOnly] = useState(false);
  // ---- lanes: by event volume desc, zero-activity folded, unk last ----
  const lanes = useMemo(() => {
    const evByProj: Record<string, number> = {};
    for (const r of data.requirements) evByProj[r.proj] = (evByProj[r.proj] ?? 0) + (r.events || 0);
    const actives = data.projects.filter((p) => evByProj[p.id]).sort((a, b) => evByProj[b.id]! - evByProj[a.id]!);
    const rest = data.projects.filter((p) => !evByProj[p.id]);
    const lanesOut: Array<{ id: string; name: string; hue: string; ev?: number }> = [
      ...actives.map((p) => ({ id: p.id, name: p.name, hue: p.hue, ev: evByProj[p.id] })),
      ...(rest.length > 0 ? [{ id: '__other', name: '其他仓库 ×' + rest.length, hue: '#3A4656', ev: 0 }] : []),
      ...(evByProj.unk !== undefined ? [{ id: 'unk', name: '未归属', hue: UNK_HUE, ev: evByProj.unk }] : []),
    ];
    return lanesOut;
  }, [data]);
  const laneIdx = useMemo(() => { const m: Record<string, number> = {}; lanes.forEach((l, i) => { m[l.id] = i }); return m }, [lanes]);
  const laneOf = (pid: string): string => (laneIdx[pid] !== undefined ? pid : '__other');
  const hueOf = (pid: string): string => (pid === 'unk' ? UNK_HUE : (data.projects.find((p) => p.id === pid)?.hue ?? (pid === '__other' ? '#3A4656' : '#999')));
  // ---- requirement lookup by (sessionId, day, req) for segments -> req mapping ----
  const reqByKey = useMemo(() => {
    const m = new Map<string, CalRequirement>();
    for (const r of data.requirements) m.set(r.sessionId + '|' + r.day + '|' + r.req, r);
    return m;
  }, [data]);
  // ---- session order: segments are time-ordered -> the requirement sequence ----
  const sessOrder = useMemo(() => {
    const m = new Map<string, CalRequirement[]>();
    for (const s of data.sessions) {
      const seen = new Set<string>();
      const list: CalRequirement[] = [];
      for (const g of s.segments ?? []) {
        const r = reqByKey.get(s.id + '|' + g.day + '|' + g.req);
        if (r !== undefined && !seen.has(r.id)) { seen.add(r.id); list.push(r); }
      }
      if (list.length > 0) m.set(s.id, list);
    }
    return m;
  }, [data, reqByKey]);
  const sessById = useMemo(() => new Map(data.sessions.map((s) => [s.id, s])), [data]);
  // ---- greedy spiral packing: zero-overlap within a (day, lane) cell ----
  const pack = (items: Array<{ r: number; req: CalRequirement; px?: number; py?: number }>, halfW: number, halfH: number): void => {
    const placed: Array<{ px: number; py: number; r: number }> = [];
    for (const it of items) {
      let ok = false;
      for (let t = 0; t < 500 && !ok; t++) {
        const ang = t * 2.399963, rad = t === 0 ? 0 : 2.2 * Math.sqrt(t) + 2;
        let px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
        px = Math.max(-halfW + it.r + 2, Math.min(halfW - it.r - 2, px));
        py = Math.max(-halfH + it.r + 2, Math.min(halfH - it.r - 2, py));
        if (!placed.some((q) => { const dx = q.px - px, dy = q.py - py; return dx * dx + dy * dy < (q.r + it.r + 1.6) ** 2; })) {
          it.px = px; it.py = py; placed.push({ px, py, r: it.r }); ok = true;
        }
      }
      if (!ok) { it.px = 0; it.py = 0; placed.push({ px: 0, py: 0, r: it.r }); }
    }
  };
  // ---- adaptive sizing: fill the viewport ----
  useEffect(() => {
    const el = wrapRef.current;
    if (el === null) return;
    const ro = new ResizeObserver(() => setSize(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const availW = wrapRef.current?.clientWidth ?? 800;
  const availH = wrapRef.current?.clientHeight ?? 500;
  const TOP = 26;
  const dayW = Math.max(96, Math.floor((availW - 8) / Math.max(1, data.days)));
  const laneH = Math.max(96, Math.floor((availH - TOP - 8) / Math.max(1, lanes.length)));
  const W = data.days * dayW + 8;
  const H = TOP + lanes.length * laneH + 6;
  const laneY = (i: number): number => TOP + i * laneH + laneH / 2;
  const focus = hover ?? (selId ? selId : null);
  // data.requirements/sessions are ALREADY filtered by origin+project in the parent.
  const reqs = data.requirements;
  // ---- threads: same session >= 2 visible reqs (segments time order) ----
  const threads = [...sessOrder.entries()]
    .map(([sid, list]) => ({ sid, list: list.filter((r) => reqs.includes(r)) }))
    .filter((t) => t.list.length >= 2);
  const tangledThreads = threads.filter((t) => new Set(t.list.map((r) => laneOf(r.proj))).size > 1);
  const visibleThreads = tangledOnly ? tangledThreads : threads;
  const visibleReqs = tangledOnly
    ? reqs.filter((r) => new Set(tangledThreads.flatMap((t) => t.list.map((x) => x.id))).has(r.id))
    : reqs;
  // ---- pack each (day, lane) cell ----
  const cells = new Map<string, Array<{ r: number; req: CalRequirement; px?: number; py?: number }>>();
  for (const r of visibleReqs) {
    const k = r.day + '|' + laneOf(r.proj);
    const list = cells.get(k) ?? [];
    list.push({ r: 3 + Math.log2((r.events || 1) + 1) * 1.15, req: r });
    cells.set(k, list);
  }
  const pos = new Map<string, { x: number; y: number; r: number }>();
  for (const [k, items] of cells) {
    const [d, lid] = k.split('|');
    const dd = Number(d), li = laneIdx[lid] ?? 0;
    items.sort((a, b) => b.r - a.r);
    pack(items, dayW / 2, laneH / 2);
    for (const it of items) {
      pos.set(it.req.id, { x: dd * dayW + dayW / 2 + (it.px ?? 0), y: laneY(li) + (it.py ?? 0), r: it.r });
    }
  }
  // ---- link lookup for special edges ----
  const linkColor: Record<string, [string, string?]> = { 'forked-from': ['#9C82E0', undefined], derives: [GOLD, '4 4'], 'executed-in': ['#3FA79B', '3 4'] };
  const laneName = (pid: string): string => { const l = lanes.find((x) => x.id === laneOf(pid)); return l ? l.name : pid; };
  // ---- render ----
  let switchCount = 0;
  const gLinks: React.ReactNode[] = [];
  for (const l of data.links ?? []) {
    const ra = data.requirements.find((x) => x.id === l.from);
    const rb = l.toSession !== undefined
      ? data.requirements.find((x) => x.id === l.to && x.sessionId === l.toSession)
      : data.requirements.find((x) => x.id === l.to);
    const a = ra ? pos.get(ra.id) : undefined;
    const b = rb ? pos.get(rb.id) : undefined;
    if (!a || !b || !ra || !rb) continue;
    const [c, da] = linkColor[l.kind] ?? ['#556', undefined];
    const mx = (a.x + b.x) / 2;
    const dim = focus !== null && focus !== ra.sessionId && focus !== rb.sessionId;
    gLinks.push(
      <path key={'l' + l.from + l.to + l.kind} d={'M ' + a.x + ' ' + a.y + ' C ' + mx + ' ' + a.y + ', ' + mx + ' ' + b.y + ', ' + b.x + ' ' + b.y}
        fill='none' stroke={c} strokeOpacity={dim ? 0.12 : 0.55} strokeWidth={1.2}
        strokeDasharray={da} opacity={1} />,
    );
  }
  // ---- session threads (bezier + gold diamond on lane switch) ----
  const gThreads: React.ReactNode[] = [];
  for (const t of visibleThreads) {
    const dimmed = focus !== null && focus !== t.sid;
    const g: React.ReactNode[] = [];
    for (let i = 1; i < t.list.length; i++) {
      const a = pos.get(t.list[i - 1]!.id), b = pos.get(t.list[i]!.id);
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      g.push(
        <path key={'s' + i} d={'M ' + a.x + ' ' + a.y + ' C ' + mx + ' ' + a.y + ', ' + mx + ' ' + b.y + ', ' + b.x + ' ' + b.y}
          fill='none' stroke='#B9C4D2' strokeOpacity={dimmed ? 0.1 : 0.34} strokeWidth={1.3} />,
      );
      if (laneOf(t.list[i - 1]!.proj) !== laneOf(t.list[i]!.proj)) {
        switchCount++;
        const sx = (a.x + b.x) / 2, sy = (a.y + b.y) / 2;
        g.push(
          <path key={'sw' + i} d={'M ' + sx + ' ' + (sy - 3.4) + ' L ' + (sx + 3.4) + ' ' + sy + ' L ' + sx + ' ' + (sy + 3.4) + ' L ' + (sx - 3.4) + ' ' + sy + ' Z'}
            fill='#10151C' stroke={GOLD} strokeWidth={1.2} />,
        );
      }
    }
    gThreads.push(
      <g key={'t' + t.sid} className='thread' data-sid={t.sid} style={{ cursor: 'pointer' }}
        opacity={dimmed ? 0.3 : 1}
        onMouseEnter={() => setHover(t.sid)} onMouseLeave={() => setHover(null)}
        onClick={() => setSelId(selId === t.sid ? null : t.sid)}>
        {g}
      </g>,
    );
  }
  // ---- requirement nodes (no gold ring — tangling is a thread-level concept) ----
  const gNodes: React.ReactNode[] = [];
  for (const r of visibleReqs) {
    const p = pos.get(r.id);
    if (!p) continue;
    const dimmed = focus !== null && focus !== r.sessionId;
    const hue = hueOf(r.proj);
    const pname = r.proj === 'unk' ? '未归属' : laneName(r.proj);
    gNodes.push(
      <g key={r.id} data-sid={r.sessionId} style={{ cursor: 'pointer' }}
        opacity={dimmed ? 0.14 : 1}
        onMouseEnter={() => setHover(r.sessionId)} onMouseLeave={() => setHover(null)}
        onClick={() => setSelId(selId === r.sessionId ? null : r.sessionId)}>
        <circle cx={p.x} cy={p.y} r={p.r} fill={rgba(hue, 0.9)} stroke='#10151C' strokeWidth={1}>
          <title>{r.req + ' · ' + pname + ' · ' + (r.events || 0) + ' events · ' + dayLabelOf(base, r.day) + ' · ' + r.origin}</title>
        </circle>
      </g>,
    );
  }
  // ---- lane bands + labels ----
  const laneBands: React.ReactNode[] = [];
  const laneLabels: React.ReactNode[] = [];
  lanes.forEach((l, i) => {
    laneBands.push(
      <g key={'lb' + l.id}>
        <rect x={0} y={TOP + i * laneH} width={W} height={laneH} fill={l.id === 'unk' ? 'rgba(90,102,116,0.05)' : rgba(l.hue, i % 2 ? 0.05 : 0.03)} />
        <line x1={0} y1={TOP + i * laneH} x2={W} y2={TOP + i * laneH} stroke='#1C242F' strokeWidth={0.7} />
      </g>,
    );
    laneLabels.push(
      <div key={l.id} style={{ position: 'absolute', top: laneY(i) - 14, right: 10, fontFamily: T.mono, fontSize: 10.5, textAlign: 'right', lineHeight: 1.3, color: l.hue }}>
        {l.name.length > 14 ? l.name.slice(0, 14) + '…' : l.name}
        {l.ev !== undefined && <div style={{ fontSize: 8.5, color: T.faint }}>{l.ev.toLocaleString()} ev</div>}
      </div>,
    );
  });
  const dayLines: React.ReactNode[] = [];
  for (let d = 0; d < data.days; d++) {
    dayLines.push(
      <g key={'d' + d}>
        <line x1={d * dayW} y1={TOP} x2={d * dayW} y2={H - 4} stroke='#1C242F' strokeWidth={0.7} />
        <text x={d * dayW + dayW / 2} y={15} textAnchor='middle' fill={T.faint} fontSize={9} fontFamily={T.mono}>{dayLabelOf(base, d)}</text>
      </g>,
    );
  }
  const sel = selId !== null ? sessById.get(selId) : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 12px', borderBottom: '1px solid ' + T.line, flexShrink: 0, fontFamily: T.mono, fontSize: 10, color: T.muted }}>
        <span>{visibleReqs.length} 需求</span>
        <span>{visibleThreads.length} 会话线</span>
        <span style={{ color: GOLD }}>{tangledThreads.length} 缠绕线</span>
        <span>切换点 {switchCount}</span>
        <button onClick={() => setTangledOnly(!tangledOnly)} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: tangledOnly ? rgba(GOLD, 0.14) : 'transparent', border: '1px solid ' + (tangledOnly ? rgba(GOLD, 0.5) : T.line), color: tangledOnly ? T.text : T.faint, borderRadius: 3, padding: '1px 7px', fontFamily: T.mono, fontSize: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: tangledOnly ? GOLD : T.faint }} />只看缠绕线
        </button>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ width: 118, flexShrink: 0, position: 'relative', borderRight: '1px solid ' + T.line, overflow: 'hidden' }}>
        {laneLabels}
      </div>
      <div ref={wrapRef} style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {laneBands}
          {dayLines}
          {gLinks}
          {gThreads}
          {gNodes}
        </svg>
      </div>
    </div>
    </div>
  );
}

/** Drill-down: the session's segment sequence (◆需求 ▷指示 ✓⊘✕结局 ⚙工具). */
function SegmentDrawer(props: { s: CalSession; data: CalData; onJump: (j: CalJump) => void; onClose: () => void }) {
  const { s, data, onJump, onClose } = props;
  const base = Date.parse(data.dayBase);
  const hueOf = (pid: string): string => (pid === 'unk' ? UNK_HUE : (data.projects.find((p) => p.id === pid)?.hue ?? '#999'));
  return (
    <div style={{ borderTop: '1px solid ' + T.line, background: T.panel, flexShrink: 0, maxHeight: '42%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '8px 16px 4px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text }}>{s.id.slice(0, 14)}</span>
        <button onClick={() => onJump({ sessionId: s.id })} style={{ fontFamily: T.mono, fontSize: 10.5, color: '#5B8DE0', background: 'transparent', border: '1px solid ' + T.line, borderRadius: 3, padding: '1px 8px', cursor: 'pointer' }}>↩ 打开对话</button>
        <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.muted }}>跨 {s.activeDays[s.activeDays.length - 1] - s.startDay + 1} 天（活跃 {s.activeDays.length}）</span>
        <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.muted }}>需求 {s.nReq} · 指示 {s.nInstr} · 项目切换 <span style={{ color: s.switches ? GOLD : T.faint }}>{s.switches}</span> 次</span>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {s.projects.map((pid) => (<span key={pid} style={{ width: 9, height: 9, borderRadius: 2, background: hueOf(pid) }} />))}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 9.5, color: T.faint }}>颜色=项目 · ◆需求 ▷指示 · ✓完成 ⊘中止 ✕报错</span>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid ' + T.line, borderRadius: 4, color: T.muted, fontFamily: T.mono, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>收起</button>
      </div>
      <div style={{ display: 'flex', gap: 14, padding: '0 16px 8px', overflowX: 'auto', alignItems: 'flex-end' }}>
        {s.activeDays.map((day) => {
          const segs = s.segments.filter((g) => g.day === day);
          return (
            <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.faint, marginBottom: 2 }}>{dayLabelOf(base, day)}</div>
              {segs.length === 0 && <div style={{ fontFamily: T.mono, fontSize: 9, color: T.faint }}>—</div>}
              {segs.map((g, k) => {
                const w = Math.min(180, Math.max(64, g.events * 1.6));
                const hue = hueOf(g.proj);
                return (
                  <div key={k} style={{ width: w, borderLeft: '3px solid ' + hue, background: rgba(hue, 0.08), borderRadius: 2, padding: '4px 6px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontFamily: T.sans, color: T.text }}>
                      <span style={{ color: hue }}>◆</span>
                      <button onClick={() => onJump({ sessionId: s.id, messageId: g.reqMessageId })} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: T.text, cursor: g.reqMessageId ? 'pointer' : 'default', fontSize: 10.5, padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.req}>
                        {g.req.length > 16 ? g.req.slice(0, 16) + '…' : g.req}
                      </button>
                    </div>
                    {g.instr.slice(0, 3).map((d, di) => (
                      <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: T.muted, marginTop: 1 }}>
                        <span style={{ color: T.faint }}>▷</span>
                        <button onClick={() => onJump({ sessionId: s.id, messageId: d.messageId })} style={{ background: 'none', border: 'none', color: T.muted, cursor: d.messageId ? 'pointer' : 'default', fontSize: 9.5, padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.text}>
                          {d.text.length > 14 ? d.text.slice(0, 14) + '…' : d.text}
                        </button>
                      </div>
                    ))}
                    {g.instr.length > 3 && <div style={{ fontSize: 9, color: T.faint, marginTop: 1 }}>+{g.instr.length - 3} 指示</div>}
                    <div style={{ display: 'flex', gap: 2, marginTop: 3, fontSize: 10, color: T.faint }}>
                      {g.turns.length === 0 ? <span style={{ color: T.faint }}>—</span> : g.turns.slice(0, 8).map((t, ti) => <span key={ti} style={{ color: OUTCOME_GLYPH[t.outcome] === '✕' ? '#E06A6A' : T.muted }}>{OUTCOME_GLYPH[t.outcome]}</span>)}
                    </div>
                    {g.tools.length > 0 && <div style={{ fontSize: 9, color: T.faint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>⚙ {g.tools.join(' · ')}</div>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 矩阵: sessions × project lanes, cell intensity ∝ events, 切换 column. */
function MatrixView(props: { data: CalData; selId: string | null; setSelId: (id: string | null) => void }) {
  const { data, selId, setSelId } = props;
  const base = Date.parse(data.dayBase);
  const lanes = [...data.projects, { id: 'unk', name: '未归属', hue: UNK_HUE }];
  const rows = data.sessions.slice().sort((a, b) => b.switches - a.switches || b.nReq - a.nReq);
  const maxV = Math.max(1, ...rows.map((s) => Math.max(1, ...lanes.map((p) => s.segments.filter((g) => g.proj === p.id).reduce((a, g) => a + g.events, 0)))));
  const hueOf = (pid: string): string => (pid === 'unk' ? UNK_HUE : (data.projects.find((p) => p.id === pid)?.hue ?? '#999'));
  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '14px 18px' }}>
      <table style={{ borderCollapse: 'collapse', fontFamily: T.mono, fontSize: 10.5 }}>
        <thead><tr>
          <th style={{ position: 'sticky', top: 0, background: T.bg, textAlign: 'left', padding: '4px 10px 8px 0', color: T.muted, fontWeight: 400 }}>session</th>
          {lanes.map((p) => (
            <th key={p.id} style={{ position: 'sticky', top: 0, background: T.bg, padding: '4px 4px 8px', fontWeight: 400 }}>
              <div style={{ color: p.hue, writingMode: 'vertical-rl', transform: 'rotate(180deg)', margin: '0 auto', fontSize: 10 }}>{p.name.length > 10 ? p.name.slice(0, 10) + '…' : p.name}</div>
            </th>
          ))}
          <th style={{ position: 'sticky', top: 0, background: T.bg, color: GOLD, padding: '4px 8px 8px', fontWeight: 400 }}>切换</th>
        </tr></thead>
        <tbody>
          {rows.map((s) => {
            const isSel = selId === s.id;
            return (
              <tr key={s.id} onClick={() => setSelId(isSel ? null : s.id)} style={{ cursor: 'pointer', background: isSel ? T.panelHi : 'transparent' }}>
                <td style={{ padding: '1px 10px 1px 0', color: isSel ? T.text : T.muted, whiteSpace: 'nowrap' }}>{s.id.slice(0, 14)} <span style={{ color: T.faint }}>{dayLabelOf(base, s.startDay)}</span></td>
                {lanes.map((p) => {
                  const v = s.segments.filter((g) => g.proj === p.id).reduce((a, g) => a + g.events, 0);
                  return (
                    <td key={p.id} style={{ padding: 1 }}>
                      <div title={v ? p.name + ' · ' + v + ' events' : ''} style={{
                        width: 26, height: 15, borderRadius: 2,
                        background: v ? rgba(hueOf(p.id), 0.15 + 0.85 * Math.sqrt(v / maxV)) : '#161C25',
                        outline: isSel && v ? '1px solid ' + hueOf(p.id) : 'none',
                      }} />
                    </td>
                  );
                })}
                <td style={{ textAlign: 'center', color: s.switches ? GOLD : T.faint }}>{s.switches || '·'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 会话表: ID / 存续 / 首个需求 / 需求 / 指示 / 项目 / 切换. */
function TableView(props: { data: CalData; selId: string | null; setSelId: (id: string | null) => void; onJump: (j: CalJump) => void }) {
  const { data, selId, setSelId, onJump } = props;
  const base = Date.parse(data.dayBase);
  const hueOf = (pid: string): string => (pid === 'unk' ? UNK_HUE : (data.projects.find((p) => p.id === pid)?.hue ?? '#999'));
  const th: React.CSSProperties = { textAlign: 'left' as const, padding: '6px 14px 8px 0', color: T.muted, fontWeight: 400, fontFamily: T.mono, fontSize: 10, letterSpacing: 1.2, borderBottom: '1px solid ' + T.line, position: 'sticky', top: 0, background: T.bg };
  const rows = data.sessions.slice().sort((a, b) => b.switches - a.switches || b.nReq - a.nReq);
  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '6px 18px' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: T.sans, fontSize: 12.5 }}>
        <thead><tr>
          <th style={th}>ID</th><th style={th}>存续</th><th style={th}>首个需求</th>
          <th style={{ ...th, textAlign: 'right' as const }}>需求</th><th style={{ ...th, textAlign: 'right' as const }}>指示</th>
          <th style={th}>项目</th><th style={{ ...th, textAlign: 'right' as const }}>切换</th>
        </tr></thead>
        <tbody>
          {rows.map((s) => {
            const isSel = selId === s.id;
            const span = s.activeDays[s.activeDays.length - 1] - s.startDay + 1;
            const first = s.segments[0];
            return (
              <tr key={s.id} onClick={() => setSelId(isSel ? null : s.id)} style={{ cursor: 'pointer', background: isSel ? T.panelHi : 'transparent', borderBottom: '1px solid #1B222C' }}>
                <td style={{ padding: '7px 14px 7px 0', fontFamily: T.mono, fontSize: 11, color: T.muted }}>{s.id.slice(0, 12)}</td>
                <td style={{ padding: '7px 14px 7px 0', fontFamily: T.mono, fontSize: 11, color: T.muted }}>{dayLabelOf(base, s.startDay)} 起 {span} 天{span > 1 ? ' · 活跃 ' + s.activeDays.length : ''}</td>
                <td style={{ padding: '7px 14px 7px 0', color: T.text, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {first && <button onClick={(ev) => { ev.stopPropagation(); onJump({ sessionId: s.id, messageId: first.reqMessageId }) }} style={{ background: 'none', border: 'none', color: T.text, cursor: first.reqMessageId ? 'pointer' : 'default', padding: 0, fontSize: 12.5, fontFamily: T.sans }}>◆ {first.req.length > 28 ? first.req.slice(0, 28) + '…' : first.req}</button>}
                </td>
                <td style={{ padding: '7px 14px 7px 0', textAlign: 'right', fontFamily: T.mono, color: T.muted }}>{s.nReq}</td>
                <td style={{ padding: '7px 14px 7px 0', textAlign: 'right', fontFamily: T.mono, color: T.muted }}>{s.nInstr}</td>
                <td style={{ padding: '7px 14px 7px 0' }}>{s.projects.map((pid) => (<span key={pid} style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: hueOf(pid), marginRight: 4 }} title={pid} />))}</td>
                <td style={{ padding: '7px 0', textAlign: 'right', fontFamily: T.mono, color: s.switches ? GOLD : T.faint }}>{s.switches || '·'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Root: 3 tabs + header + filters + drill-down. */
export function CalendarYarnRoot(props: CalProps) {
  const { data, onJump } = props;
  const [tab, setTab] = useState<'yarn' | 'matrix' | 'table'>('yarn');
  const [activeP, setActiveP] = useState<Set<string>>(new Set());
  const [originOn, setOriginOn] = useState<Record<CalOrigin, boolean>>({ user: true, subagent: false, auto: false });
  const [onlyTangled, setOnlyTangled] = useState(false);
  const [onlyMultiDay, setOnlyMultiDay] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const toggleP = (id: string): void => setActiveP((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const list = useMemo(() => data.sessions.filter((s) => originOn[s.origin] && (activeP.size === 0 || s.projects.some((p) => activeP.has(p))) && (!onlyTangled || s.projects.length > 1) && (!onlyMultiDay || s.activeDays.length > 1)), [data, activeP, originOn, onlyTangled, onlyMultiDay]);
  const reqList = useMemo(() => data.requirements.filter((r) => list.some((s) => s.id === r.sessionId)), [data, list]);
  const tangled = list.filter((s) => s.projects.length > 1);
  const totReq = list.reduce((a, s) => a + s.nReq, 0);
  const totIns = list.reduce((a, s) => a + s.nInstr, 0);
  const sel = selId !== null ? data.sessions.find((s) => s.id === selId) ?? null : null;
  const tabs: Array<[string, string]> = [['yarn', '日历纱线'], ['matrix', '矩阵'], ['table', '会话表']];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, color: T.text, fontFamily: T.sans, minWidth: 0 }}>
      <div style={{ borderBottom: '1px solid ' + T.line, padding: '10px 18px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: T.mono, fontSize: 14, letterSpacing: 1 }}>dsh-track<span style={{ color: T.faint }}> / </span><span style={{ color: T.muted }}>日历纱线</span></div>
          <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.muted }}>{list.length} sessions · <span style={{ color: GOLD }}>{tangled.length} 缠绕</span> · 需求 {totReq} · 指示 {totIns}</div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.faint }}>用户 {data.sessions.filter((s) => s.origin === 'user').length} · 子代理 {data.sessions.filter((s) => s.origin === 'subagent').length} · 自动 {data.sessions.filter((s) => s.origin === 'auto').length}</div>
          <div style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 9.5, color: T.faint }}>节点=需求(大小=工作量) · 灰线=同会话需求序列 · ◆=线上项目切换 · 紫=子代理继承 · 黄虚线=派生 · 青虚线=跨会话共执行</div>
        </div>
        <div style={{ display: 'flex', gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
          {(['user', 'subagent', 'auto'] as CalOrigin[]).map((o) => {
            const label = o === 'user' ? '用户输入' : o === 'subagent' ? '子代理' : '自动';
            const on = originOn[o];
            const color = o === 'user' ? '#3FA79B' : o === 'subagent' ? '#5B8DE0' : '#8A97A6';
            return (
              <button key={o} onClick={() => setOriginOn((prev) => ({ ...prev, [o]: !prev[o] }))} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                background: on ? rgba(color, 0.14) : 'transparent', border: '1px solid ' + (on ? rgba(color, 0.5) : T.line),
                color: on ? T.text : T.faint, borderRadius: 3, padding: '1px 7px',
                fontFamily: T.mono, fontSize: 10, lineHeight: 1.6,
              }}><span style={{ width: 7, height: 7, borderRadius: 2, background: on ? color : T.faint }} />{label}</button>
            );
          })}
          <span style={{ width: 12 }} />
          {data.projects.map((p) => {
            const on = activeP.size === 0 || activeP.has(p.id);
            return (
              <button key={p.id} onClick={() => toggleP(p.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                background: on ? rgba(p.hue, 0.14) : 'transparent', border: '1px solid ' + (on ? rgba(p.hue, 0.5) : T.line),
                color: on ? T.text : T.faint, borderRadius: 3, padding: '1px 7px',
                fontFamily: T.mono, fontSize: 10, lineHeight: 1.6,
              }}><span style={{ width: 7, height: 7, borderRadius: 2, background: on ? p.hue : T.faint }} />{p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name}</button>
            );
          })}
          <span style={{ width: 12 }} />
          <button onClick={() => setOnlyTangled(!onlyTangled)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: onlyTangled ? rgba(GOLD, 0.14) : 'transparent', border: '1px solid ' + (onlyTangled ? rgba(GOLD, 0.5) : T.line), color: onlyTangled ? T.text : T.faint, borderRadius: 3, padding: '1px 7px', fontFamily: T.mono, fontSize: 10 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: onlyTangled ? GOLD : T.faint }} />只看缠绕</button>
          <button onClick={() => setOnlyMultiDay(!onlyMultiDay)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: onlyMultiDay ? rgba('#8A97A6', 0.14) : 'transparent', border: '1px solid ' + (onlyMultiDay ? rgba('#8A97A6', 0.5) : T.line), color: onlyMultiDay ? T.text : T.faint, borderRadius: 3, padding: '1px 7px', fontFamily: T.mono, fontSize: 10 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: onlyMultiDay ? '#8A97A6' : T.faint }} />只看跨天</button>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as 'yarn' | 'matrix' | 'table')} style={{
              background: 'none', border: 'none', borderBottom: tab === id ? '2px solid #E06A4E' : '2px solid transparent',
              color: tab === id ? T.text : T.muted, fontFamily: T.mono, fontSize: 12, letterSpacing: 1.5,
              padding: '8px 14px', cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'yarn' && <YarnView data={{ ...data, sessions: list, requirements: reqList }} selId={selId} setSelId={setSelId} hover={hover} setHover={setHover} onJump={onJump} />}
        {tab === 'matrix' && <MatrixView data={{ ...data, sessions: list }} selId={selId} setSelId={setSelId} />}
        {tab === 'table' && <TableView data={{ ...data, sessions: list }} selId={selId} setSelId={setSelId} onJump={onJump} />}
      </div>
      {sel !== null && <SegmentDrawer s={sel} data={data} onJump={onJump} onClose={() => setSelId(null)} />}
    </div>
  );
}

let calRoot: Root | null = null

/** Mount (or re-mount) the calendar view into a container. */
export function mountCalendar(container: HTMLElement, data: CalData, onJump: (j: CalJump) => void): void {
  if (calRoot === null) calRoot = createRoot(container)
  calRoot.render(<CalendarYarnRoot data={data} onJump={onJump} />)
}
