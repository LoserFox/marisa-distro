/** Composer A2A status badge backed by the shared session directory. */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { A2aViewInjected } from './A2aView.tsx'
import type { A2aComposerStore } from './stores.ts'
import css from './A2aBadge.module.css'

type BadgeProps = PropsRuntime<'conversation.input.left'> & InjectFace<A2aViewInjected> & PropsStore<A2aComposerStore> & PropsLocale<'a2a'>

export function A2aBadge({ directory, useStore, actions, t }: BadgeProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const panelOpen = useStore(current => current.panelOpen)
  useEffect(() => {
    if (state.status === 'idle') void directory.load()
  }, [directory, state.status])
  const snapshot = state.snapshot
  const label = snapshot?.connected === true ? snapshot.self.name : t('badge.unset')
  const activity = snapshot?.connected === true ? snapshot.self.activity : undefined
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`${css.badge} ${panelOpen ? css.open : ''}`}
      aria-haspopup="dialog"
      aria-expanded={panelOpen}
      aria-controls="a2a-identity-panel"
      title={snapshot?.connected === true ? t('badge.connectedTitle', { project: snapshot.project, name: snapshot.self.name }) : t('badge.title')}
      onClick={() => {
        if (panelOpen) buttonRef.current?.focus()
        actions.togglePanel()
      }}
    >
      <span className={css.dotWrap} data-activity={activity}>
        <StateDot state={state.error !== null ? 'error' : snapshot?.connected === true ? 'done' : 'warning'} />
      </span>
      <span className={css.name}>{label}</span>
    </button>
  )
}
