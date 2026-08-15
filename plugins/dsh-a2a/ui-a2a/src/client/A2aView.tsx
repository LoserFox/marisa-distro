/** A2A collaboration overview and project management page. */
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Input, Pill, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { AGENT_NAME_RE, PROJECT_NAME_RE, type A2aPeerView } from '@dpskh/a2a/view'
import type { A2aApiError } from '../api.ts'
import type { A2aDirectory } from './directory.ts'
import css from './A2aView.module.css'

/** Business face injected into every A2A surface. */
export interface A2aViewInjected {
  readonly directory: A2aDirectory
}

const ORBIT_LIMIT = 6
const CENTER = 50
const ORBIT_X = 39
const ORBIT_Y = 37
/** Sideways push of one conversation edge (viewBox units, away from the center node). */
const CONVERSATION_BULGE = 28

/** Stable per-name accent class. */
function tintClass(name: string): string {
  const palette = ['tintGreen', 'tintBlue', 'tintAmber', 'tintRed', 'tintDeepseek'] as const
  let hash = 7
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return palette[hash % palette.length] ?? palette[0]
}

/** Position one small-roster peer on the auxiliary orbit. */
function nodePosition(index: number, count: number): { x: number; y: number } {
  // A two-peer roster places both nodes side by side above the project so
  // the conversation edge between them arcs over open space instead of
  // running behind the center node.
  const angle = count === 2
    ? (index === 0 ? -Math.PI * 3 / 4 : -Math.PI / 4)
    : (index / count) * Math.PI * 2 - Math.PI / 2
  return { x: CENTER + Math.cos(angle) * ORBIT_X, y: CENTER + Math.sin(angle) * ORBIT_Y }
}

/** Quadratic control point arcing one conversation edge away from the center node. */
function conversationEdge(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  let perpX = -(to.y - from.y)
  let perpY = to.x - from.x
  const length = Math.hypot(perpX, perpY)
  if (length === 0) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  perpX /= length
  perpY /= length
  const away = (midX - CENTER) * perpX + (midY - CENTER) * perpY >= 0 ? 1 : -1
  const bulge = Math.min(CONVERSATION_BULGE, Math.hypot(to.x - from.x, to.y - from.y) / 2)
  const cx = Math.min(97, Math.max(3, midX + perpX * away * bulge))
  const cy = Math.min(97, Math.max(3, midY + perpY * away * bulge))
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`
}

/** Localize stable A2A RPC failures; unknown failures retain Host text. */
function errorText(error: A2aApiError, t: PropsLocale<'a2a'>['t']): string {
  switch (error.code) {
    case 'a2a-name-in-use': return t('error.nameInUse', error.details)
    case 'a2a-project-not-found': return t('error.projectNotFound', error.details)
    case 'a2a-project-conflict': return t('error.projectConflict', error.details)
    case 'a2a-invalid-name': return t(error.details.field === 'project' ? 'error.invalidProject' : 'error.invalidAgent')
    case 'a2a-unavailable': return t('error.unavailable')
    default: return error.message
  }
}

/** Shared connect fields used by the overview and Projects tab. */
function ConnectForm({ directory, t }: A2aViewInjected & PropsLocale<'a2a'>) {
  const [project, setProject] = useState('')
  const [name, setName] = useState('')
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const connect = useCallback(async () => {
    const projectName = project.trim()
    const rosterName = name.trim()
    if (!PROJECT_NAME_RE.test(projectName) || !AGENT_NAME_RE.test(rosterName)) return
    if (await directory.connect(projectName, rosterName)) {
      setProject('')
      setName('')
    }
  }, [directory, name, project])
  return (
    <div className={css.connectForm}>
      <label className={css.field}>
        <span>{t('form.project')}</span>
        <Input value={project} maxLength={64} aria-label={t('form.project')} placeholder={t('view.projectPlaceholder')} onChange={(event) => { setProject(event.target.value) }} />
      </label>
      <label className={css.field}>
        <span>{t('form.name')}</span>
        <Input value={name} maxLength={32} aria-label={t('form.name')} placeholder={t('view.namePlaceholder')} onChange={(event) => { setName(event.target.value) }} />
      </label>
      <Button variant="primary" disabled={state.status === 'mutating' || !PROJECT_NAME_RE.test(project.trim()) || !AGENT_NAME_RE.test(name.trim())} onClick={() => { void connect() }}>
        {state.status === 'mutating' ? t('view.connecting') : t('view.connect')}
      </Button>
    </div>
  )
}

/** Auxiliary topology: orbit for small rosters, collision-free grid otherwise. */
function Topology({ peers, project, t }: {
  peers: readonly A2aPeerView[]
  project: string
} & PropsLocale<'a2a'>) {
  if (peers.length === 0) return <div className={css.topologyEmpty}>{t('view.topologyEmpty')}</div>
  if (peers.length > ORBIT_LIMIT) {
    return (
      <div className={css.peerGrid}>
        {peers.map(peer => <div key={peer.id} className={css.gridPeer} data-activity={peer.activity} title={peer.name}>{peer.name}{peer.id === peers[0]?.id && <span>{t('view.you')}</span>}</div>)}
      </div>
    )
  }
  const self = peers[0]
  const positionOf = (index: number) => nodePosition(index, peers.length)
  const selfPosition = positionOf(0)
  // Every conversation in the local view involves self: draw one animated
  // edge between self and each peer whose conversation is still alive.
  const conversingEdges = peers
    .map((peer, index) => ({ peer, index, position: positionOf(index) }))
    .filter(({ peer }) => peer.id !== self?.id && peer.activity !== 'idle')
  return (
    <div className={css.canvas}>
      <svg className={css.edges} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {peers.map((peer, index) => {
          const { x, y } = positionOf(index)
          return <line key={peer.id} x1={CENTER} y1={CENTER} x2={x} y2={y} />
        })}
        {conversingEdges.map(({ peer, position }) => (
          <path key={peer.id} className={css.conversingEdge} d={conversationEdge(selfPosition, position)} />
        ))}
      </svg>
      <div className={css.center} title={project}>{project}</div>
      {peers.map((peer, index) => {
        const { x, y } = positionOf(index)
        return (
          <div key={peer.id} className={css.orbitPeer} data-activity={peer.activity} style={{ left: `${x}%`, top: `${y}%` }} title={peer.name}>
            <span className={css.peerName}>{peer.name}</span>
            {peer.id === self?.id && <span className={css.peerYou}>{t('view.you')}</span>}
          </div>
        )
      })}
    </div>
  )
}

export function A2aView({ directory, t }: ConvViewProps & InjectFace<A2aViewInjected> & PropsLocale<'a2a'>) {
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const [tab, setTab] = useState<'overview' | 'projects'>('overview')
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDisplay, setNewProjectDisplay] = useState('')
  const overviewTab = useRef<HTMLButtonElement>(null)
  const projectsTab = useRef<HTMLButtonElement>(null)
  const tabId = useId()

  useEffect(() => {
    if (state.status === 'idle') void directory.load()
  }, [directory, state.status])

  const switchTab = useCallback((next: 'overview' | 'projects', focus = false) => {
    setTab(next)
    if (focus) requestAnimationFrame(() => { (next === 'overview' ? overviewTab : projectsTab).current?.focus() })
  }, [])

  const createProject = useCallback(async () => {
    const name = newProjectName.trim()
    const displayName = newProjectDisplay.trim()
    if (!PROJECT_NAME_RE.test(name)) return
    if (await directory.createProject(name, displayName === '' ? undefined : displayName) !== null) {
      setNewProjectName('')
      setNewProjectDisplay('')
    }
  }, [directory, newProjectDisplay, newProjectName])

  const snapshot = state.snapshot
  const connected = snapshot?.connected === true
  const peers = connected ? [snapshot.self, ...snapshot.peers] : []
  const projects = snapshot?.projects ?? []
  const busy = state.status === 'mutating'
  const error = state.error === null ? null : errorText(state.error, t)

  return (
    <div className={css.root}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>{t('view.title')}</h1>
          <p className={css.subtitle}>{connected ? t('view.connectedAs', { project: snapshot.project, name: snapshot.self.name }) : t('view.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" disabled={state.status === 'loading'} onClick={() => { void directory.load() }}>{t('view.refresh')}</Button>
      </header>

      <div className={css.tabs} role="tablist" aria-label={t('view.title')} onKeyDown={(event) => {
        const next = event.key === 'Home'
          ? 'overview'
          : event.key === 'End'
            ? 'projects'
            : event.key === 'ArrowLeft' || event.key === 'ArrowRight'
              ? tab === 'overview' ? 'projects' : 'overview'
              : null
        if (next === null) return
        event.preventDefault()
        switchTab(next, true)
      }}>
        <button ref={overviewTab} tabIndex={tab === 'overview' ? 0 : -1} type="button" role="tab" id={`${tabId}-overview-tab`} aria-controls={`${tabId}-overview-panel`} aria-selected={tab === 'overview'} className={`${css.tab} ${tab === 'overview' ? css.tabActive : ''}`} onClick={() => { switchTab('overview') }}>{t('view.tabOverview')}</button>
        <button ref={projectsTab} tabIndex={tab === 'projects' ? 0 : -1} type="button" role="tab" id={`${tabId}-projects-tab`} aria-controls={`${tabId}-projects-panel`} aria-selected={tab === 'projects'} className={`${css.tab} ${tab === 'projects' ? css.tabActive : ''}`} onClick={() => { switchTab('projects') }}>{t('view.tabProjects')}</button>
      </div>

      <div className={css.live} aria-live="polite">
        {error !== null && <div className={css.error}><span>{error}</span><Button size="sm" onClick={() => { directory.clearError(); void directory.load() }}>{t('view.retry')}</Button></div>}
      </div>

      {snapshot === null && state.status === 'loading'
        ? <div className={css.loading}>{t('view.loading')}</div>
        : tab === 'overview'
          ? (
            <main id={`${tabId}-overview-panel`} role="tabpanel" aria-labelledby={`${tabId}-overview-tab`} className={css.panelBody}>
              {!connected
                ? (
                  <section className={css.onboarding}>
                    <StateDot state="warning" size={12} />
                    <div><h2>{t('view.disconnectedTitle')}</h2><p>{t('view.disconnectedBody')}</p></div>
                    <ConnectForm directory={directory} t={t} />
                  </section>
                )
                : (
                  <>
                    <section className={css.stats}>
                      <div className={css.stat}><span>{t('view.connection')}</span><strong><StateDot state="done" />{t('view.connected')}</strong></div>
                      <div className={css.stat}><span>{t('projects.current')}</span><strong title={snapshot.project}>{snapshot.project}</strong></div>
                      <div className={css.stat}><span>{t('view.listTitle')}</span><strong>{t('view.onlineCount', { online: String(peers.length) })}</strong></div>
                    </section>
                    <div className={css.overviewGrid}>
                      <section className={css.card}>
                        <div className={css.sectionHeader}><h2>{t('view.listTitle')}</h2><span>{t('view.rosterHelp')}</span></div>
                        {peers.length === 0
                          ? <p className={css.empty}>{t('view.emptyPeers')}</p>
                          : <ul className={css.rows}>{peers.map(peer => <li key={peer.id} className={css.row}><span className={`${css.tint} ${css[tintClass(peer.name)] ?? ''}`} /><span className={css.dotWrap} data-activity={peer.activity}><StateDot state="done" /></span><span className={css.rowName} title={peer.name}>{peer.name}</span>{peer.id === snapshot.self.id && <Pill>{t('view.you')}</Pill>}<span>{t('view.online')}</span></li>)}</ul>}
                      </section>
                      <section className={`${css.card} ${css.topology}`}>
                        <div className={css.sectionHeader}><h2>{t('view.graphTitle')}</h2><span>{t('view.graphHelp')}</span></div>
                        <Topology peers={peers} project={snapshot.project} t={t} />
                      </section>
                    </div>
                    <div className={css.disconnectRow}><Button variant="outline" disabled={busy} onClick={() => { void directory.disconnect() }}>{t('view.disconnect')}</Button></div>
                  </>
                )}
            </main>
          )
          : (
            <main id={`${tabId}-projects-panel`} role="tabpanel" aria-labelledby={`${tabId}-projects-tab`} className={css.panelBody}>
              <section className={css.card}>
                <div className={css.sectionHeader}><h2>{t('projects.current')}</h2></div>
                {connected
                  ? <div className={css.currentProject}><div><strong>{snapshot.project}</strong><span>{t('view.connectedAs', { project: snapshot.project, name: snapshot.self.name })}</span></div><Button size="sm" variant="outline" disabled={busy} onClick={() => { void directory.disconnect() }}>{t('view.disconnect')}</Button></div>
                  : <ConnectForm directory={directory} t={t} />}
              </section>
              <section className={css.card}>
                <div className={css.sectionHeader}><h2>{t('projects.listTitle')}</h2><span>{t('projects.count', { count: String(projects.length) })}</span></div>
                {projects.length === 0
                  ? <p className={css.empty}>{t('projects.empty')}</p>
                  : <ul className={css.projectRows}>{projects.map(project => <li key={project.name}><div><strong>{project.displayName ?? project.name}</strong>{project.displayName !== undefined && <span>{project.name}</span>}{project.description !== undefined && <p>{project.description}</p>}</div>{connected && project.name === snapshot.project && <Pill active>{t('projects.active')}</Pill>}</li>)}</ul>}
              </section>
              <section className={css.card}>
                <div className={css.sectionHeader}><h2>{t('projects.createTitle')}</h2><span>{t('projects.createHelp')}</span></div>
                <div className={css.createForm}>
                  <Input value={newProjectName} maxLength={64} aria-label={t('projects.nameLabel')} placeholder={t('projects.namePlaceholder')} onChange={(event) => { setNewProjectName(event.target.value) }} />
                  <Input value={newProjectDisplay} aria-label={t('projects.displayLabel')} placeholder={t('projects.displayPlaceholder')} onChange={(event) => { setNewProjectDisplay(event.target.value) }} />
                  <Button variant="primary" disabled={busy || !PROJECT_NAME_RE.test(newProjectName.trim())} onClick={() => { void createProject() }}>{t('projects.create')}</Button>
                </div>
              </section>
            </main>
          )}
    </div>
  )
}
