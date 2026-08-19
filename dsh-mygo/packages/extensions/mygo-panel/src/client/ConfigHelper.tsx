/**
 * 配置助手标签页（r7）：子代理聊天，2s 轮询；从插件卡片进入时带上下文
 * 芯片（可清除）。轮询与会话状态由父级 Panel 持有。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/ConfigHelper
 */
import { useEffect, useRef, useState } from 'react'
import css from './Panel.module.css'
import type { HelperMessage } from './api'

export interface HelperPanelState {
  readonly status?: 'running' | 'done' | 'error' | 'stopped'
  readonly startedAt?: number
  readonly runId?: string
  readonly messages: readonly HelperMessage[]
  readonly error?: string
}

export interface ConfigHelperProps {
  readonly helper: HelperPanelState | undefined
  readonly busy: boolean
  /** 当前聚焦插件（上下文芯片），可清除。 */
  readonly contextId?: string
  readonly onSend: (text: string) => void
  readonly onStop: () => void
  readonly onClearContext: () => void
}

const HELPER_EXAMPLES = [
  '帮我看看 dsh-stickers 有哪些可配置项',
  '安装 https://github.com/dsh-external/dsh-browser-panel.git',
]

export function ConfigHelper(props: ConfigHelperProps): JSX.Element {
  const { helper, busy, contextId, onSend, onStop, onClearContext } = props
  const [input, setInput] = useState('')
  const chatRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = chatRef.current
    if (node !== null) node.scrollTop = node.scrollHeight
  }, [helper?.messages, helper?.status])

  const running = helper?.status === 'running' || busy
  const send = (): void => {
    const text = input.trim()
    if (text === '' || running) return
    setInput('')
    onSend(text)
  }

  return (
    <div className={css.helperPanel}>
      <div className={css.helperHeader}>
        <div className={css.inlineTitle}>配置助手</div>
        <div className={css.rowInline}>
          {contextId !== undefined && (
            <span className={css.helperChip}>
              上下文：{contextId}
              <button
                className={css.helperChipClose}
                title="清除上下文"
                disabled={running}
                onClick={onClearContext}
              >
                ×
              </button>
            </span>
          )}
          <button
            className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
            disabled={running}
            onClick={onStop}
          >
            关闭并清空记录
          </button>
        </div>
      </div>
      <div className={css.helperChat} ref={chatRef}>
        {(helper?.messages ?? []).map((message, index) => (
          <div key={index} className={message.role === 'user' ? css.helperBubbleUser : css.helperBubbleAssistant}>
            {message.role === 'user' ? null : <div className={css.helperBubbleRole}>配置助手</div>}
            <div className={css.helperBubbleText}>{message.content}</div>
          </div>
        ))}
        {running && (
          <div className={css.helperBubbleAssistant + ' ' + css.helperTyping}>
            <span className={css.helperDot} />
            <span className={css.helperDot} />
            <span className={css.helperDot} />
          </div>
        )}
        {(helper?.messages ?? []).length === 0 && helper?.status === undefined && (
          <div className={css.helperEmpty}>
            <div className={css.inlineText}>不用先选插件，直接输入需求，例如：</div>
            {HELPER_EXAMPLES.map((example, index) => (
              <button
                key={index}
                className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
                disabled={running}
                onClick={() => setInput(example)}
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </div>
      {helper?.status === 'error' && <div className={css.fieldError}>助手错误：{helper.error ?? '未知'}</div>}
      <div className={css.helperInputRow}>
        <textarea
          className={css.helperInput}
          rows={2}
          placeholder={contextId === undefined
            ? '输入需求，例如：帮我看看 dsh-stickers 的配置 / 安装 xxx 仓库…'
            : `正在围绕 ${contextId} 提问…`}
          value={input}
          disabled={running}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
        />
        <button className={css.helperSend} disabled={running || input.trim() === ''} onClick={send}>
          发送
        </button>
      </div>
    </div>
  )
}
