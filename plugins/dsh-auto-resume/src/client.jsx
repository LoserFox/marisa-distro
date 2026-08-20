/**
 * dsh-auto-resume — resume an interrupted conversation from the composer.
 *
 * When the current session shows evidence of an aborted last turn (user stop,
 * max tokens, or a crash recovered by the backend), the composer's primary
 * send button is hidden and a play button takes its place in the tool row.
 * Clicking it sends "继续" / "Continue" through the normal input actions.
 */

import { isInterrupted } from './interrupted.js'

const NS = 'dsh-auto-resume'

/** The play icon mirrors the send icon's box and stroke weight. */
function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="currentColor" />
    </svg>
  )
}

const CSS = `
.dsh-resume-play{display:inline-flex;align-items:center;justify-content:center;flex:none;width:34px;height:34px;border:none;border-radius:999px;background:var(--dsw-alias-button-info-fill,var(--dsw-alias-brand-primary));color:#fff;cursor:pointer;transition:background-color 100ms ease}
.dsh-resume-play:hover:not(:disabled){background:var(--dsw-alias-button-info-hover,var(--dsw-alias-brand-primary))}
.dsh-resume-play:disabled{opacity:.4;cursor:default}
/* In-place replacement: while the play button is present, hide the stock
   primary send button that follows it in the composer tool row. */
div[data-slot="conversation.input.right"]:has(button.dsh-resume-play) ~ button[aria-label="发送消息"],
div[data-slot="conversation.input.right"]:has(button.dsh-resume-play) ~ button[aria-label="Send message"]{display:none}
`

/** Insert the stylesheet once; returns a disposer. */
function installStyles() {
  const id = `${NS}/styles`
  if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.pluginCss = id
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

function ResumePlayButton(props) {
  if (!isInterrupted(props.session)) return null
  const input = props.input
  const actions = props.inputActions
  if (input === undefined || actions === undefined) return null
  if (typeof input.draft === 'string' && input.draft.trim() !== '') return null
  const label = typeof props.t === 'function' ? props.t('continue') : '继续'
  const onClick = () => {
    actions.setDraft(label)
    actions.submit()
  }
  return (
    <button
      type="button"
      className="dsh-resume-play"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <PlayIcon />
    </button>
  )
}

export function apply(ctx) {
  const locale = ctx.get('locale')
  if (locale !== undefined) {
    ctx.effect(() => locale.register(NS, {
      zh: { continue: '继续' },
      en: { continue: 'Continue' },
    }), `${NS}: dictionaries`)
  }
  ctx.effect(installStyles, `${NS}: styles`)
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
    { name: 'conversation.input.right', id: 'dsh-auto-resume', order: 100, locale: NS },
    ResumePlayButton,
  ))
}
