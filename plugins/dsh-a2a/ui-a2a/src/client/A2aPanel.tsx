/** Composer-adjacent A2A quick connection panel. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Input, StateDot, useAnchoredMaxHeight } from '@deepseek-ai/dsh-client-ui-primitives'
import { AGENT_NAME_RE, PROJECT_NAME_RE } from '@dpskh/a2a/view'
import type { A2aViewInjected } from './A2aView.tsx'
import type { A2aComposerStore } from './stores.ts'
import css from './A2aPanel.module.css'

type PanelProps = PropsRuntime<'conversation.input.overlay'> & InjectFace<A2aViewInjected> & PropsStore<A2aComposerStore> & PropsLocale<'a2a'>

export function A2aPanel({ directory, useStore, actions, t }: PanelProps) {
  const panelOpen = useStore(state => state.panelOpen)
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const [project, setProject] = useState('')
  const [name, setName] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const firstInput = useRef<HTMLInputElement>(null)
  const maxHeight = useAnchoredMaxHeight(panelRef, 420, state)
  const snapshot = state.snapshot
  const connected = snapshot?.connected === true
  const close = useCallback((restoreFocus = false) => {
    actions.setPanelOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>('[aria-controls="a2a-identity-panel"]')?.focus()
      })
    }
  }, [actions])

  useEffect(() => {
    if (!panelOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (panelRef.current !== null && event.target instanceof Node && panelRef.current.contains(event.target)) return
      close(true)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close(true)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [close, panelOpen])

  useEffect(() => {
    if (panelOpen) (connected ? panelRef.current?.querySelector<HTMLButtonElement>('button') : firstInput.current)?.focus()
  }, [connected, panelOpen])

  const connect = useCallback(async () => {
    const projectName = project.trim()
    const rosterName = name.trim()
    if (!PROJECT_NAME_RE.test(projectName) || !AGENT_NAME_RE.test(rosterName)) return
    if (await directory.connect(projectName, rosterName)) {
      setProject('')
      setName('')
    }
  }, [directory, name, project])

  if (!panelOpen) return null

  const busy = state.status === 'mutating'
  return (
    <div id="a2a-identity-panel" ref={panelRef} className={css.panel} style={{ maxHeight }} role="dialog" aria-modal="false" aria-label={t('panel.title')}>
      <div className={css.heading}>
        <StateDot state={state.error !== null ? 'error' : connected ? 'done' : 'warning'} />
        <div>
          <strong>{snapshot?.connected === true ? snapshot.self.name : t('panel.unset')}</strong>
          <span>{snapshot?.connected === true ? snapshot.project : t('panel.hint')}</span>
        </div>
      </div>
      {connected
        ? <Button variant="outline" disabled={busy} onClick={() => { void directory.disconnect() }}>{t('panel.disconnect')}</Button>
        : (
          <div className={css.form} onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); void connect() }
          }}>
            <input ref={firstInput} className={css.input} value={project} maxLength={64} aria-label={t('form.project')} placeholder={t('panel.project')} onChange={(event) => { setProject(event.target.value) }} />
            <Input value={name} maxLength={32} aria-label={t('form.name')} placeholder={t('panel.placeholder')} onChange={(event) => { setName(event.target.value) }} />
            <Button variant="primary" disabled={busy || !PROJECT_NAME_RE.test(project.trim()) || !AGENT_NAME_RE.test(name.trim())} onClick={() => { void connect() }}>{t('panel.connect')}</Button>
          </div>
        )}
      {state.error !== null && <div className={css.error} role="alert">{state.error.message}</div>}
    </div>
  )
}
