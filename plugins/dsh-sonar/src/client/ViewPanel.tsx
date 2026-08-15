import React, { useEffect, useMemo, useState } from 'react'
import type { ViewClientState, ViewController } from './controller.ts'
import { translator } from './i18n.ts'
import type { TranslationKey, Translator } from './i18n.ts'
import type {
  ViewActivity,
  ViewCandidate,
  ViewContentType,
  ViewEntry,
  ViewPrimitive,
  ViewReadMode,
  ViewSource,
  ViewStatus,
  TeamworkState,
} from '../types.ts'

interface InputActions {
  setDraft(text: string): void
  submit(): void
}

export interface ViewPanelProps {
  controller: ViewController
  inputActions?: InputActions
}

type Section = 'home' | 'current' | 'changes' | 'descriptions' | 'configuration'
type Capability = ViewContentType | 'evolution'

const C = {
  bg: 'var(--dsw-alias-bg-base, #080d12)',
  panel: 'var(--dsw-alias-bg-layer-1, #111820)',
  raised: 'var(--dsw-alias-bg-layer-2, #18222c)',
  input: 'var(--dsw-specific-input-major, #0b1117)',
  text: 'var(--dsw-alias-label-primary, #e7edf4)',
  muted: 'var(--dsw-alias-label-secondary, #8d9bab)',
  faint: 'var(--dsw-alias-label-tertiary, #5f6d7b)',
  border: 'var(--dsw-alias-border-l2, rgba(150,180,210,.14))',
  cyan: '#43c6d9',
  green: '#52c77a',
  amber: '#d7a84d',
  red: '#e36b6b',
} as const

const FONT_MONO = 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)'

const S: Record<string, React.CSSProperties> = {
  root: { height: '100%', overflow: 'auto', background: C.bg, color: C.text, fontSize: 12 },
  shell: { maxWidth: 980, margin: '0 auto', padding: '26px 30px 56px' },
  card: { border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel },
  button: { border: `1px solid ${C.border}`, borderRadius: 7, background: C.raised, color: C.muted, padding: '8px 12px', cursor: 'pointer', fontSize: 11 },
  badge: { display: 'inline-flex', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 999, padding: '2px 7px', color: C.muted, fontFamily: FONT_MONO, fontSize: 8 },
  eyebrow: { color: C.faint, fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.09em', textTransform: 'uppercase' },
}

const MOTION_CSS = `
@keyframes sonar-request { 0% { box-shadow: 0 0 0 0 rgba(67,198,217,.28) } 100% { box-shadow: 0 0 0 14px rgba(67,198,217,0) } }
@keyframes sonar-arrive { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
.sonar-requested { animation: sonar-request .8s ease-out }
.sonar-arrive { animation: sonar-arrive .28s ease-out both }
.sonar-reduced-motion *, .sonar-reduced-motion *::before, .sonar-reduced-motion *::after { animation: none !important; transition: none !important }
@media (prefers-reduced-motion: reduce) { .sonar-requested, .sonar-arrive { animation: none !important } }
@media (max-width: 760px) {
  .sonar-shell { padding: 18px 14px 44px !important }
  .sonar-overview-grid, .sonar-capability-grid, .sonar-mode-grid, .sonar-config-grid { grid-template-columns: 1fr !important }
  .sonar-header { align-items: flex-start !important; flex-direction: column !important }
}
`

const SECTION_META: Array<{ id: Section; key: TranslationKey }> = [
  { id: 'home', key: 'navHome' },
  { id: 'current', key: 'navCurrent' },
  { id: 'changes', key: 'navChanges' },
  { id: 'descriptions', key: 'navDescriptions' },
  { id: 'configuration', key: 'navConfiguration' },
]

const TYPE_KEYS: Record<ViewContentType, TranslationKey> = {
  memory: 'memory', skill: 'skill', teamwork: 'teamwork',
}

const READ_KEYS: Record<ViewReadMode, TranslationKey> = {
  direct: 'directVisible', expand: 'expandVisible', query: 'queryVisible',
}

const PRIMITIVE_KEYS: Record<ViewPrimitive, TranslationKey> = {
  direct: 'direct', expand: 'expandMode', query: 'query',
  record: 'record', target: 'target', background: 'organize',
}

const SOURCE_KEYS: Record<string, TranslationKey> = {
  'project-memory': 'sourceProjectMemory',
  'project-skills': 'sourceProjectSkills',
  teamwork: 'sourceTeamworkSignals',
}

const TEAMWORK_STATE_KEYS: Record<TeamworkState, TranslationKey> = {
  queued: 'teamworkQueued',
  active: 'teamworkActive',
  waiting: 'teamworkWaiting',
  blocked: 'teamworkBlocked',
  done: 'teamworkDone',
}

const EXAMPLES: Array<{ key: TranslationKey; capability: Capability }> = [
  { key: 'exampleRemember', capability: 'memory' },
  { key: 'exampleSkill', capability: 'skill' },
  { key: 'exampleTeamwork', capability: 'teamwork' },
  { key: 'exampleEvolve', capability: 'evolution' },
]

function useController(controller: ViewController): ViewClientState {
  const [state, setState] = useState(() => controller.getSnapshot())
  useEffect(() => {
    setState(controller.getSnapshot())
    const unsubscribe = controller.subscribe(() => setState(controller.getSnapshot()))
    void controller.load(true)
    return unsubscribe
  }, [controller])
  useEffect(() => {
    const interval = setInterval(() => void controller.load(true), Math.max(500, controller.getSnapshot().data?.ui.refreshIntervalMs ?? 500))
    return () => clearInterval(interval)
  }, [controller, state.data?.ui.refreshIntervalMs])
  return state
}

function time(value: string, locale: string): string {
  return new Date(value).toLocaleString(locale)
}

function contentBadge(type: ViewContentType, t: Translator): React.ReactElement {
  return <span style={S.badge}>{t(TYPE_KEYS[type])}</span>
}

function pathBadge(primitive: ViewPrimitive, t: Translator): React.ReactElement {
  const read = primitive === 'direct' || primitive === 'expand' || primitive === 'query'
  const color = read ? C.cyan : C.amber
  return <span style={{ ...S.badge, color, borderColor: `${color}44` }}>{t(PRIMITIVE_KEYS[primitive])}</span>
}

function sourceName(source: ViewSource, t: Translator): string {
  return SOURCE_KEYS[source.id] ? t(SOURCE_KEYS[source.id]) : source.label
}

function Header({ state, section, onSection, t }: { state: ViewStatus; section: Section; onSection: (section: Section) => void; t: Translator }): React.ReactElement {
  const pending = state.candidates.filter(candidate => candidate.status === 'pending').length
  return <>
    <header className="sonar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, marginBottom: 19 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ color: C.cyan, fontSize: 21 }}>◇</span><strong style={{ fontSize: 17 }}>View</strong><span style={{ ...S.badge, color: C.green }}>{t('activeNow')}</span></div>
        <div style={{ color: C.faint, fontFamily: FONT_MONO, fontSize: 8, marginTop: 5 }}>GEN {String(state.active.generation).padStart(4, '0')} · {state.active.id}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        {SECTION_META.map(item => <button key={item.id} aria-pressed={section === item.id} onClick={() => onSection(item.id)} style={{ ...S.button, background: section === item.id ? `${C.cyan}12` : 'transparent', borderColor: section === item.id ? `${C.cyan}55` : C.border, color: section === item.id ? C.text : C.muted }}>{t(item.key)}{item.id === 'changes' && pending > 0 ? ` · ${pending}` : ''}</button>)}
      </div>
    </header>
  </>
}

function SectionTitle({ title, detail }: { title: string; detail: string }): React.ReactElement {
  return <div style={{ marginBottom: 14 }}><h1 style={{ margin: 0, fontSize: 20, letterSpacing: '-.02em' }}>{title}</h1><div style={{ color: C.muted, fontSize: 11, marginTop: 5 }}>{detail}</div></div>
}

function Empty({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div style={{ border: `1px dashed ${C.border}`, borderRadius: 8, color: C.faint, padding: 18, textAlign: 'center', fontSize: 10 }}>{children}</div>
}

function Metric({ value, label, accent = C.text }: { value: number; label: string; accent?: string }): React.ReactElement {
  return <div style={{ ...S.card, padding: '13px 14px' }}><div style={{ color: accent, fontFamily: FONT_MONO, fontSize: 20 }}>{value}</div><div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>{label}</div></div>
}

function isEvolution(record: { type: ViewContentType; replaces?: string; derivedFrom?: string; operation?: string }): boolean {
  return (record.type === 'memory' || record.type === 'skill')
    && Boolean(record.replaces || record.derivedFrom || record.operation === 'replace')
}

function capabilityCount(capability: Capability, state: ViewStatus): number {
  const active = state.active.entries
  if (capability !== 'evolution') return active.filter(entry => entry.type === capability).length
  const ids = new Set<string>()
  for (const entry of active) if (isEvolution(entry)) ids.add(entry.id)
  for (const candidate of state.candidates) if (candidate.status === 'pending' && isEvolution(candidate)) ids.add(candidate.id)
  return ids.size
}

function CapabilityCards({ state, t }: { state: ViewStatus; t: Translator }): React.ReactElement {
  const meta: Array<{ id: Capability; label: TranslationKey; detail: TranslationKey; color: string }> = [
    { id: 'memory', label: 'memory', detail: 'memoryResultDetail', color: C.cyan },
    { id: 'skill', label: 'skill', detail: 'skillResultDetail', color: C.green },
    { id: 'teamwork', label: 'teamwork', detail: 'teamworkResultDetail', color: C.amber },
    { id: 'evolution', label: 'evolution', detail: 'evolutionResultDetail', color: '#9b8cff' },
  ]
  return <div className="sonar-capability-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
    {meta.map(item => <div key={item.id} style={{ ...S.card, padding: 13, borderTop: `2px solid ${item.color}66` }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><strong>{t(item.label)}</strong><span style={{ color: item.color, fontFamily: FONT_MONO, fontSize: 16 }}>{capabilityCount(item.id, state)}</span></div><div style={{ color: C.faint, fontSize: 9, lineHeight: 1.5, marginTop: 6 }}>{t(item.detail)}</div></div>)}
  </div>
}

function CandidatePath({ candidate, t }: { candidate: ViewCandidate; t: Translator }): React.ReactElement {
  const evolves = isEvolution(candidate)
  return <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
    {contentBadge(candidate.type, t)}{evolves && <span style={{ ...S.badge, color: '#a99cff' }}>{t('evolution')}</span>}<span style={{ color: C.faint }}>→</span>{pathBadge(candidate.writeMode, t)}<span style={{ color: C.faint }}>→</span>{pathBadge(candidate.readMode, t)}<span style={{ color: C.faint }}>→</span><span style={{ ...S.badge, color: C.amber }}>{t('waitingConfirmation')}</span>
  </div>
}

function CandidateCard({ candidate, controller, t, locale }: { candidate: ViewCandidate; controller: ViewController; t: Translator; locale: string }): React.ReactElement {
  return <article className="sonar-arrive" style={{ ...S.card, padding: 14, borderLeft: `2px solid ${C.amber}` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}><CandidatePath candidate={candidate} t={t} /><h3 style={{ margin: '9px 0 4px', fontSize: 13 }}>{candidate.title}</h3><div style={{ color: C.muted, lineHeight: 1.55, fontSize: 10 }}>{candidate.summary || candidate.content || '—'}</div></div>
      <div style={{ display: 'flex', gap: 6, flex: 'none' }}><button style={{ ...S.button, color: C.red }} onClick={() => void controller.decide(candidate.id, 'reject')}>{t('reject')}</button><button style={{ ...S.button, background: C.green, borderColor: C.green, color: '#07120b' }} onClick={() => void controller.decide(candidate.id, 'accept')}>{t('acceptNext')}</button></div>
    </div>
    <details style={{ marginTop: 9 }}><summary style={{ color: C.faint, cursor: 'pointer', fontSize: 9 }}>{t('showWhy')}</summary><div style={{ marginTop: 8, padding: 9, borderRadius: 7, background: C.bg, color: C.muted, fontSize: 9, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{candidate.content || candidate.summary}<div style={{ color: C.faint, fontFamily: FONT_MONO, marginTop: 7 }}>{candidate.proposedBy} · {time(candidate.proposedAt, locale)}{candidate.writeTarget ? ` · ${candidate.writeTarget}` : ''}</div></div></details>
  </article>
}

function Home({ state, controller, inputActions, t, locale, onOpenChanges }: { state: ViewStatus; controller: ViewController; inputActions?: InputActions; t: Translator; locale: string; onOpenChanges: () => void }): React.ReactElement {
  const [request, setRequest] = useState('')
  const [sent, setSent] = useState(false)
  const pending = state.candidates.filter(candidate => candidate.status === 'pending').sort((a, b) => b.proposedAt.localeCompare(a.proposedAt))
  const activeByMode = (mode: ViewReadMode) => state.active.entries.filter(entry => entry.readMode === mode).length
  const applied = state.active.entries.length
  const submit = (): void => {
    const text = request.trim()
    if (!text || !inputActions) return
    inputActions.setDraft(`/view ${text}`)
    inputActions.submit()
    setRequest('')
    setSent(true)
  }
  return <>
    <section className={sent ? 'sonar-requested' : undefined} style={{ ...S.card, padding: 20, borderColor: `${C.cyan}55`, background: `linear-gradient(135deg, ${C.panel}, rgba(67,198,217,.045))` }}>
      <div style={{ ...S.eyebrow, color: C.cyan }}>/view</div>
      <h1 style={{ margin: '8px 0 5px', fontSize: 22, letterSpacing: '-.025em' }}>{t('homeTitle')}</h1>
      <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.6 }}>{t('homeDetail')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 16 }}><textarea aria-label={t('requestPlaceholder')} value={request} onChange={event => { setRequest(event.target.value); setSent(false) }} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit() }} placeholder={t('requestPlaceholder')} style={{ minHeight: 76, resize: 'vertical', boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 8, outline: 'none', background: C.input, color: C.text, padding: '12px 13px', font: 'inherit', lineHeight: 1.6 }} /><button disabled={!request.trim() || !inputActions} onClick={submit} style={{ ...S.button, minWidth: 108, background: request.trim() && inputActions ? C.cyan : C.raised, borderColor: request.trim() && inputActions ? C.cyan : C.border, color: request.trim() && inputActions ? '#071015' : C.faint }}>{t('sendToLlm')}</button></div>
      <div style={{ color: C.faint, fontSize: 9, marginTop: 7 }}>{t(inputActions ? 'commandLead' : 'submitUnavailable')}</div>
      {sent && <div role="status" style={{ color: C.green, fontSize: 10, marginTop: 10 }}>✓ {t('requestSent')}</div>}
      <div style={{ marginTop: 13 }}><div style={{ ...S.eyebrow, marginBottom: 7 }}>{t('examples')}</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{EXAMPLES.map(item => <button key={item.key} onClick={() => { setRequest(t(item.key)); setSent(false) }} style={{ ...S.button, background: 'transparent' }}>{t(item.key)}</button>)}</div></div>
    </section>

    <div className="sonar-overview-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
      <section style={{ ...S.card, padding: 14 }}><div style={{ ...S.eyebrow, marginBottom: 9 }}>{t('currentAtGlance')}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}><Metric value={activeByMode('direct')} label={t('directVisible')} accent={C.cyan} /><Metric value={activeByMode('expand')} label={t('expandVisible')} accent={C.cyan} /><Metric value={activeByMode('query')} label={t('queryVisible')} accent={C.cyan} /></div></section>
      <section style={{ ...S.card, padding: 14 }}><div style={{ ...S.eyebrow, marginBottom: 9 }}>{t('futureAtGlance')}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}><Metric value={pending.length} label={t('waitingConfirmation')} accent={pending.length ? C.amber : C.text} /><Metric value={applied} label={t('confirmedNext')} accent={applied ? C.green : C.text} /><Metric value={state.sources.filter(source => !source.enabled).length} label={t('sourceChanges')} /></div></section>
    </div>

    <section style={{ marginTop: 15 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}><div style={S.eyebrow}>{t('capabilityResults')}</div><span style={{ color: C.faint, fontSize: 9 }}>{t('capabilityResultsDetail')}</span></div><CapabilityCards state={state} t={t} /></section>

    <section style={{ marginTop: 15 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><div style={S.eyebrow}>{t('waitingChanges')}</div>{pending.length > 3 && <button style={{ ...S.button, background: 'transparent', padding: '5px 8px' }} onClick={onOpenChanges}>{t('viewAll')}</button>}</div><div style={{ display: 'grid', gap: 8 }}>{pending.slice(0, 3).map(candidate => <CandidateCard key={candidate.id} candidate={candidate} controller={controller} t={t} locale={locale} />)}{pending.length === 0 && <Empty>{t('noWaitingChanges')}</Empty>}</div></section>

    <section style={{ ...S.card, padding: '3px 13px', marginTop: 15 }}><div style={{ ...S.eyebrow, padding: '10px 0 5px' }}>{t('recentActivity')}</div>{state.activity.slice(0, 4).map((item, index) => <ActivityLine key={item.id} item={item} t={t} locale={locale} border={index > 0} />)}{state.activity.length === 0 && <Empty>{t('noActivity')}</Empty>}</section>
  </>
}

function entrySentence(entry: ViewEntry, t: Translator): string {
  const key: Record<ViewReadMode, TranslationKey> = { direct: 'directSentence', expand: 'expandSentence', query: 'querySentence' }
  return t(key[entry.readMode], { title: entry.title })
}

function EntryLine({ entry, t, locale, detail }: { entry: ViewEntry; t: Translator; locale: string; detail?: React.ReactNode }): React.ReactElement {
  const evolves = isEvolution(entry)
  return <article style={{ ...S.card, padding: 13 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{contentBadge(entry.type, t)}{evolves && <span style={{ ...S.badge, color: '#a99cff' }}>{t('evolution')}</span>}</div><strong style={{ display: 'block', marginTop: 7 }}>{entry.title}</strong><div style={{ color: C.muted, fontSize: 10, lineHeight: 1.55, marginTop: 4 }}>{entry.summary || entry.content || '—'}</div></div>{detail}</div><div style={{ color: C.faint, fontSize: 9, marginTop: 8 }}>{entrySentence(entry, t)} · {time(entry.acceptedAt, locale)}</div></article>
}

function Current({ state, controller, t, locale }: { state: ViewStatus; controller: ViewController; t: Translator; locale: string }): React.ReactElement {
  const [expanded, setExpanded] = useState<Record<string, ViewEntry>>({})
  const [query, setQuery] = useState('')
  const [queryResults, setQueryResults] = useState<ViewEntry[] | null>(null)
  const loadEntry = async (entry: ViewEntry): Promise<void> => {
    if (expanded[entry.id]) { setExpanded(value => { const next = { ...value }; delete next[entry.id]; return next }); return }
    const result = await controller.readEntry(entry.id)
    if (result) setExpanded(value => ({ ...value, [entry.id]: result }))
  }
  const runQuery = async (): Promise<void> => setQueryResults(await controller.query(query) ?? [])
  const sections: Array<{ mode: ViewReadMode; detail: TranslationKey }> = [
    { mode: 'direct', detail: 'directVisibleDetail' }, { mode: 'expand', detail: 'expandVisibleDetail' }, { mode: 'query', detail: 'queryVisibleDetail' },
  ]
  return <><SectionTitle title={t('currentSimpleTitle')} detail={t('currentSimpleDetail')} /><div className="sonar-mode-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
    {sections.map(section => { const entries = state.active.entries.filter(entry => entry.readMode === section.mode); return <section key={section.mode} style={{ ...S.card, padding: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><strong>{t(READ_KEYS[section.mode])}</strong><span style={{ color: C.cyan, fontFamily: FONT_MONO }}>{entries.length}</span></div><div style={{ color: C.faint, fontSize: 9, lineHeight: 1.5, marginTop: 5 }}>{t(section.detail)}</div>{section.mode === 'query' && <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 5, marginTop: 10 }}><input aria-label={t('searchPlaceholder')} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void runQuery() }} placeholder={t('searchPlaceholder')} style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.input, color: C.text, padding: '8px 9px', fontSize: 10 }} /><button style={S.button} onClick={() => void runQuery()}>{t('search')}</button></div>}<div style={{ display: 'grid', gap: 6, marginTop: 10 }}>{(section.mode === 'query' ? queryResults : entries)?.map(entry => <EntryLine key={entry.id} entry={entry} t={t} locale={locale} detail={section.mode === 'expand' ? <button style={{ ...S.button, padding: '5px 7px' }} onClick={() => void loadEntry(entry)}>{expanded[entry.id] ? t('closeDetail') : t('expand')}</button> : undefined} />)}{section.mode === 'expand' && entries.map(entry => expanded[entry.id] && <div key={`${entry.id}-detail`} style={{ borderLeft: `2px solid ${C.cyan}`, padding: '4px 9px', color: C.muted, fontSize: 10, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{expanded[entry.id]!.content}</div>)}{section.mode === 'query' && queryResults === null && <Empty>{t('queryNotRun')}</Empty>}{section.mode === 'query' && queryResults?.length === 0 && <Empty>{t('noMatches')}</Empty>}{section.mode !== 'query' && entries.length === 0 && <Empty>{t('noCurrent')}</Empty>}</div></section> })}
  </div></>
}

function Changes({ state, controller, t, locale }: { state: ViewStatus; controller: ViewController; t: Translator; locale: string }): React.ReactElement {
  const pending = state.candidates.filter(candidate => candidate.status === 'pending').sort((a, b) => b.proposedAt.localeCompare(a.proposedAt))
  const applied = [...state.active.entries].sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt)).slice(0, 8)
  return <><SectionTitle title={t('changesTitle')} detail={t('changesDetail')} />
    <section><div style={{ ...S.eyebrow, marginBottom: 8 }}>{t('waitingConfirmation')} · {pending.length}</div><div style={{ display: 'grid', gap: 8 }}>{pending.map(candidate => <CandidateCard key={candidate.id} candidate={candidate} controller={controller} t={t} locale={locale} />)}{pending.length === 0 && <Empty>{t('noWaitingChanges')}</Empty>}</div></section>
    <section style={{ marginTop: 18 }}><div style={{ ...S.eyebrow, marginBottom: 8 }}>{t('confirmedNext')} · {applied.length}</div><div style={{ display: 'grid', gap: 7 }}>{applied.map(entry => <EntryLine key={entry.id} entry={entry} t={t} locale={locale} />)}{applied.length === 0 && <Empty>{t('noAppliedChanges')}</Empty>}</div></section>
  </>
}

function SourceRow({ source, state, controller, t }: { source: ViewSource; state: ViewStatus; controller: ViewController; t: Translator }): React.ReactElement {
  const count = state.active.entries.filter(entry => entry.sourceId === source.id).length
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${C.border}` }}><div><strong>{sourceName(source, t)}</strong><div style={{ color: C.faint, fontSize: 9, marginTop: 3 }}>{t(TYPE_KEYS[source.type])} · {t(READ_KEYS[source.readMode])}</div></div><span style={{ color: C.faint, fontFamily: FONT_MONO, fontSize: 9 }}>{count}</span><button style={{ ...S.button, color: source.enabled ? C.green : C.faint, padding: '6px 9px' }} onClick={() => void controller.setSourceEnabled(source.id, !source.enabled)}>{source.enabled ? t('enabled') : t('disabled')}</button></div>
}

function Descriptions({ state, t }: { state: ViewStatus; t: Translator }): React.ReactElement {
  return <><SectionTitle title={t('descriptionsTitle')} detail={t('descriptionsDetail')} />
    <section style={{ ...S.card, padding: 14 }}><div style={{ ...S.eyebrow, marginBottom: 8 }}>{t('viewBehavior')}</div><div style={{ display: 'grid', gap: 7 }}>{state.active.entries.map(entry => <div key={entry.id} style={{ padding: '10px 11px', borderRadius: 8, background: C.bg }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{contentBadge(entry.type, t)}{isEvolution(entry) && <span style={{ ...S.badge, color: '#a99cff' }}>{t('evolution')}</span>}<span style={{ color: C.text }}>{entrySentence(entry, t)}</span></div>{entry.summary && <div style={{ color: C.faint, fontSize: 9, marginTop: 5 }}>{entry.summary}</div>}</div>)}{state.active.entries.length === 0 && <Empty>{t('noDescriptions')}</Empty>}</div></section>
    <details style={{ ...S.card, padding: 14, marginTop: 10 }}><summary style={{ cursor: 'pointer', color: C.text }}><strong>{t('howViewWorks')}</strong><span style={{ color: C.faint, fontSize: 9, marginLeft: 8 }}>{t('howViewWorksDetail')}</span></summary><div className="sonar-overview-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 13 }}><div><div style={{ ...S.eyebrow, color: C.cyan, marginBottom: 7 }}>{t('readBehavior')}</div>{(['direct', 'expand', 'query'] as ViewReadMode[]).map(mode => <div key={mode} style={{ color: C.muted, fontSize: 10, padding: '5px 0' }}>{pathBadge(mode, t)} <span style={{ marginLeft: 5 }}>{t(READ_KEYS[mode])}</span></div>)}</div><div><div style={{ ...S.eyebrow, color: C.amber, marginBottom: 7 }}>{t('writeBehavior')}</div>{(['record', 'target', 'background'] as const).map(mode => <div key={mode} style={{ color: C.muted, fontSize: 10, padding: '5px 0' }}>{pathBadge(mode, t)}</div>)}</div></div><div style={{ color: C.faint, fontSize: 9, lineHeight: 1.6, marginTop: 10 }}>{t('howViewWorksNote')}</div></details>
  </>
}

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 10, alignItems: 'start', padding: '8px 0', borderTop: `1px solid ${C.border}` }}><span style={{ color: C.faint, fontSize: 9 }}>{label}</span><div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', color: C.muted, fontSize: 10 }}>{children}</div></div>
}

function CapabilityConfiguration({ type, state, t }: { type: ViewContentType; state: ViewStatus; t: Translator }): React.ReactElement {
  const sources = state.sources.filter(source => source.type === type)
  const active = state.active.entries.filter(entry => entry.type === type)
  const pending = state.candidates.filter(candidate => candidate.type === type && candidate.status === 'pending')
  const readModes = [...new Set([...sources.map(source => source.readMode), ...active.map(entry => entry.readMode)])]
  const writeModes = [...new Set([...active.map(entry => entry.writeMode), ...pending.map(candidate => candidate.writeMode)])]
  const targets = [...new Set([...active.map(entry => entry.writeTarget), ...pending.map(candidate => candidate.writeTarget)].filter((value): value is string => Boolean(value)))]
  const states = type === 'teamwork' ? [...new Set([...active.map(entry => entry.teamwork?.state), ...pending.map(candidate => candidate.teamwork?.state)].filter((value): value is NonNullable<typeof value> => Boolean(value)))] : []
  const owners = type === 'teamwork' ? [...new Set([...active.map(entry => entry.teamwork?.owner), ...pending.map(candidate => candidate.teamwork?.owner)].filter((value): value is string => Boolean(value)))] : []
  const progress = type === 'teamwork' ? active.filter(entry => typeof entry.teamwork?.progress === 'number') : []
  const color = type === 'memory' ? C.cyan : type === 'skill' ? C.green : C.amber
  return <article style={{ ...S.card, padding: 14, borderTop: `2px solid ${color}66` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}><strong style={{ fontSize: 13 }}>{t(TYPE_KEYS[type])}</strong><span style={{ ...S.badge, color }}>{active.length}</span></div>
    <div style={{ color: C.faint, fontSize: 9, lineHeight: 1.55, minHeight: 28 }}>{t(type === 'memory' ? 'memoryConfigDetail' : type === 'skill' ? 'skillConfigDetail' : 'teamworkConfigDetail')}</div>
    <ConfigRow label={t('configSources')}>{sources.map(source => <span key={source.id} style={{ ...S.badge, color: source.enabled ? C.green : C.faint }}>{sourceName(source, t)} · {t(source.enabled ? 'enabled' : 'disabled')}</span>)}{sources.length === 0 && <span>—</span>}</ConfigRow>
    <ConfigRow label={t('configReadModes')}>{readModes.map(mode => <React.Fragment key={mode}>{pathBadge(mode, t)}</React.Fragment>)}{readModes.length === 0 && <span>—</span>}</ConfigRow>
    <ConfigRow label={t('configWriteModes')}>{writeModes.map(mode => <React.Fragment key={mode}>{pathBadge(mode, t)}</React.Fragment>)}{writeModes.length === 0 && <span>{t('configNoObservedWrites')}</span>}</ConfigRow>
    <ConfigRow label={t('configWriteTargets')}>{targets.map(target => <span key={target} style={S.badge}>{target}</span>)}{targets.length === 0 && <span>{t('configNoWriteTargets')}</span>}</ConfigRow>
    {type === 'teamwork' && <ConfigRow label={t('configTeamworkStates')}>{states.map(value => <span key={value} style={S.badge}>{t(TEAMWORK_STATE_KEYS[value])}</span>)}{states.length === 0 && <span>—</span>}</ConfigRow>}
    {type === 'teamwork' && <ConfigRow label={t('configOwners')}>{owners.map(value => <span key={value} style={S.badge}>{value}</span>)}{owners.length === 0 && <span>{t('unknownOwner')}</span>}</ConfigRow>}
    {type === 'teamwork' && <ConfigRow label={t('configProgress')}>{progress.map(entry => <span key={entry.id} style={S.badge}>{entry.title} · {entry.teamwork!.progress}%</span>)}{progress.length === 0 && <span>—</span>}</ConfigRow>}
    <ConfigRow label={t('configState')}>{t('configStateValue', { active: active.length, pending: pending.length })}</ConfigRow>
  </article>
}

function EvolutionConfiguration({ state, t }: { state: ViewStatus; t: Translator }): React.ReactElement {
  const active = state.active.entries.filter(isEvolution)
  const pending = state.candidates.filter(candidate => candidate.status === 'pending' && isEvolution(candidate))
  return <article style={{ ...S.card, padding: 14, borderTop: '2px solid #9b8cff66' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}><strong style={{ fontSize: 13 }}>{t('evolution')}</strong><span style={{ ...S.badge, color: '#a99cff' }}>{active.length + pending.length}</span></div>
    <div style={{ color: C.faint, fontSize: 9, lineHeight: 1.55, minHeight: 28 }}>{t('evolutionConfigDetail')}</div>
    <ConfigRow label={t('configSources')}><span>{t('configNoIndependentSource')}</span></ConfigRow>
    <ConfigRow label={t('configEvidenceReads')}>{(['direct', 'expand', 'query'] as ViewReadMode[]).map(mode => <React.Fragment key={mode}>{pathBadge(mode, t)}</React.Fragment>)}</ConfigRow>
    <ConfigRow label={t('configEvolutionTargets')}>{contentBadge('memory', t)}{contentBadge('skill', t)}</ConfigRow>
    <ConfigRow label={t('configEvolutionChanges')}><span style={S.badge}>{t('add')}</span><span style={S.badge}>{t('replaceOperation')}</span><span style={{ color: C.faint }}>→</span><span style={{ ...S.badge, color: C.amber }}>{t('waitingConfirmation')}</span></ConfigRow>
    <ConfigRow label={t('configBackgroundReview')}><span style={{ ...S.badge, color: state.ui.backgroundReviewEnabled ? C.green : C.faint }}>{t(state.ui.backgroundReviewEnabled ? 'on' : 'off')}</span><span>{t('reviewInterval', { seconds: Math.round(state.ui.backgroundReviewIntervalMs / 1000) })}</span></ConfigRow>
    <ConfigRow label={t('configState')}>{t('configEvolutionStateValue', { active: active.length, pending: pending.length })}</ConfigRow>
  </article>
}

function Configuration({ state, controller, t }: { state: ViewStatus; controller: ViewController; t: Translator }): React.ReactElement {
  return <><SectionTitle title={t('configurationTitle')} detail={t('configurationDetail')} />
    <div className="sonar-config-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
      {(['memory', 'skill', 'teamwork'] as ViewContentType[]).map(type => <CapabilityConfiguration key={type} type={type} state={state} t={t} />)}
      <EvolutionConfiguration state={state} t={t} />
    </div>
    <section style={{ ...S.card, padding: 14, marginTop: 10 }}><div style={{ marginBottom: 9 }}><strong>{t('sourceSettings')}</strong><span style={{ color: C.faint, fontSize: 9, marginLeft: 8 }}>{t('sourceSettingsDetail')}</span></div>{state.sources.map(source => <SourceRow key={source.id} source={source} state={state} controller={controller} t={t} />)}</section>
  </>
}

function ActivityLine({ item, t, locale, border = false }: { item: ViewActivity; t: Translator; locale: string; border?: boolean }): React.ReactElement {
  const actionKey: Record<ViewActivity['action'], TranslationKey> = { read: 'actionRead', proposed: 'actionProposed', accepted: 'actionAccepted', rejected: 'actionRejected', 'source-enabled': 'actionSourceEnabled', 'source-disabled': 'actionSourceDisabled' }
  return <div style={{ display: 'grid', gridTemplateColumns: '112px auto 1fr', gap: 8, alignItems: 'center', padding: '9px 0', borderTop: border ? `1px solid ${C.border}` : undefined }}><span style={{ color: C.faint, fontFamily: FONT_MONO, fontSize: 8 }}>{time(item.at, locale)}</span><span style={S.badge}>{t(actionKey[item.action])}</span><span style={{ color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span></div>
}

export function ViewPanel({ controller, inputActions }: ViewPanelProps): React.ReactElement {
  const state = useController(controller)
  const [section, setSection] = useState<Section>('home')
  const data = state.data
  const t = useMemo(() => translator(data?.ui.locale ?? 'zh-CN'), [data?.ui.locale])
  const locale = data?.ui.locale ?? 'zh-CN'
  if (state.status === 'loading' || !data) return <div style={{ ...S.root, display: 'grid', placeItems: 'center', color: C.muted, fontFamily: FONT_MONO }}>{t('initializing')}</div>
  return <div className={data.ui.motion === 'reduced' ? 'sonar-reduced-motion' : undefined} style={S.root}><style>{MOTION_CSS}</style><main className="sonar-shell" style={S.shell}><Header state={data} section={section} onSection={setSection} t={t} />{state.error && <div style={{ ...S.card, padding: 10, borderColor: `${C.red}55`, color: C.red, marginBottom: 10 }}>{state.error}</div>}{section === 'home' && <Home state={data} controller={controller} inputActions={inputActions} t={t} locale={locale} onOpenChanges={() => setSection('changes')} />}{section === 'current' && <Current state={data} controller={controller} t={t} locale={locale} />}{section === 'changes' && <Changes state={data} controller={controller} t={t} locale={locale} />}{section === 'descriptions' && <Descriptions state={data} t={t} />}{section === 'configuration' && <Configuration state={data} controller={controller} t={t} />}</main></div>
}
