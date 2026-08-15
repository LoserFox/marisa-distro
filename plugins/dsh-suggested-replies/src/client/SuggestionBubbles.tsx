/**
 * Input-dock bubbles that copy a suggested reply into the message draft.
 *
 * @module @dsh-external/dsh-suggested-replies/client/SuggestionBubbles
 */

import { useEffect, useState, type CSSProperties } from 'react'
import type { ClientConnectionRpc, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SuggestedRepliesStateResponse } from '../rpc.ts'

/** Connection capability injected by the browser plugin registration. */
export interface SuggestionBubblesInjected {
  /** RPC transport used to read and watch this Session's sidecar state. */
  readonly rpc: ClientConnectionRpc
}

/** Full prop currency supplied by the `conversation.input.dock` slot. */
export type SuggestionBubblesProps =
  & PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'suggested-replies'>
  & SuggestionBubblesInjected

type StateResult = RpcResult<SuggestedRepliesStateResponse>

interface ObservedState {
  readonly sessionId: SuggestionBubblesProps['sessionId']
  readonly value: SuggestedRepliesStateResponse
}

const STYLE_TAG_ID = 'dsh-suggested-replies-style'
let styleUsers = 0

const CSS_TEXT = `
.dsh-suggested-replies-dock {
  box-sizing: border-box;
  flex: none;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - 4 * var(--dsh-composer-dock-inset));
  max-width: calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));
  margin: 0 auto;
}
.dsh-suggested-replies-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.dsh-suggested-replies-row::-webkit-scrollbar {
  display: none;
}
.dsh-suggested-replies-loading {
  color: var(--dsw-alias-label-tertiary, #68707d);
  font-size: 12px;
  line-height: 20px;
}
.dsh-suggested-replies-label {
  flex: none;
  color: var(--dsw-alias-label-tertiary, #68707d);
  font-size: 12px;
  line-height: 20px;
}
.dsh-suggested-replies-bubble {
  box-sizing: border-box;
  flex: none;
  max-width: min(100%, 320px);
  overflow: hidden;
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l1, #d8dce2);
  border-radius: 999px;
  background: var(--dsw-specific-tip, rgba(127, 136, 153, 0.12));
  color: var(--dsw-alias-label-primary, #23262d);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-suggested-replies-bubble:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-business-primary, #2f6fed);
  background: var(--dsw-alias-interactive-bg-hover, rgba(47, 111, 237, 0.12));
}
.dsh-suggested-replies-bubble:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #2f6fed);
  outline-offset: 2px;
}
.dsh-suggested-replies-bubble:disabled { cursor: default; opacity: .52; }
`

const ROOT_STYLE: CSSProperties = { display: 'contents' }

/** Render loading text or ready bubbles directly above the composer card. */
export function SuggestionBubbles({ rpc, sessionId, useInput, inputActions, t }: SuggestionBubblesProps) {
  const [observed, setObserved] = useState<ObservedState | undefined>()
  const phase = useInput(state => state.phase)
  const state = observed !== undefined && observed.sessionId === sessionId
    ? observed.value
    : undefined

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const publish = (value: SuggestedRepliesStateResponse): void => {
      if (!signal.aborted) setObserved({ sessionId, value })
    }
    const clear = (): void => {
      if (signal.aborted) return
      setObserved(current => current?.sessionId === sessionId ? undefined : current)
    }

    void (async () => {
      try {
        const initial = await rpc.call(
          '/suggested-replies',
          'state.get',
          { sessionId },
          signal,
        ) as StateResult
        if (signal.aborted) return
        if (!initial.ok) {
          clear()
          return
        }

        let current = initial.value
        publish(current)

        while (!signal.aborted) {
          const watched = await rpc.call(
            '/suggested-replies',
            'state.watch',
            { sessionId, lifecycle: current.lifecycle, revision: current.revision },
            signal,
          ) as StateResult
          if (signal.aborted) return
          if (!watched.ok) {
            clear()
            return
          }
          current = watched.value
          publish(current)
        }
      } catch {
        clear()
      }
    })()

    return () => controller.abort()
  }, [rpc, sessionId])

  useEffect(() => {
    styleUsers += 1
    if (document.getElementById(STYLE_TAG_ID) === null) {
      const tag = document.createElement('style')
      tag.id = STYLE_TAG_ID
      tag.textContent = CSS_TEXT
      document.head.appendChild(tag)
    }
    return () => {
      styleUsers -= 1
      if (styleUsers !== 0) return
      document.getElementById(STYLE_TAG_ID)?.remove()
    }
  }, [])

  if (state === undefined || state.phase === 'cleared') return null

  if (state.phase === 'generating') {
    return (
      <div style={ROOT_STYLE}>
        <div className="dsh-suggested-replies-dock" data-suggested-replies-dock="">
          <div className="dsh-suggested-replies-row dsh-suggested-replies-loading" role="status">{t('loading')}</div>
        </div>
      </div>
    )
  }

  if (state.suggestions.length === 0) return null
  const disabled = phase !== 'plain'

  return (
    <div style={ROOT_STYLE}>
      <div className="dsh-suggested-replies-dock" data-suggested-replies-dock="">
        <div className="dsh-suggested-replies-row" aria-label={t('title')}>
          <span className="dsh-suggested-replies-label">{t('title')}</span>
          {state.suggestions.map((text, index) => (
            <button
              key={`${state.turn}-${index}`}
              type="button"
              className="dsh-suggested-replies-bubble"
              disabled={disabled}
              title={t('hint')}
              onClick={() => inputActions.setDraft(text)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
