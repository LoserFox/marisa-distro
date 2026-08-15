// @vitest-environment jsdom
// DOM render channel: pure-plugin fence rendering on pristine hosts.
// Builds the stock CodeBlock surface (`.md-code-block` + banner label div +
// `<pre>`) inside a conversation row and drives the observer pipeline.
import { cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { installDomFenceRenderer } from '../src/client/dom-fence.tsx'
import { inject } from '../src/client/index.tsx'
import { getPanelSpec } from '../src/client/panel-store.ts'

const VALID_SPEC = '{"title":"卡片","items":[{"type":"text","content":"你好，世界"}]}'
const BUTTON_SPEC = '{"items":[{"type":"button","label":"刷新","action":"refresh"}]}'
const PANEL_SPEC = '{"panel":true,"title":"面板A","items":[{"type":"text","content":"A"}]}'
const BROKEN_SPEC = '{"items":[{"type":"text","content":'

function makeCtx(sessionId: string | undefined, send: ReturnType<typeof vi.fn>): Context {
  return {
    sessions: { list: { getSnapshot: () => ({ current: sessionId }) } },
  } as unknown as Context
}

/** Stock CodeBlock surface: wrapper.md-code-block > banner > label div + pre. */
function stockCodeBlock(raw: string, lang: string): HTMLElement {
  const block = document.createElement('div')
  block.className = 'md-code-block'
  const banner = document.createElement('div')
  const label = document.createElement('div')
  label.textContent = lang
  banner.appendChild(label)
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = raw
  pre.appendChild(code)
  block.appendChild(banner)
  block.appendChild(pre)
  return block
}

function assistantRow(anchorKey: string, streaming = false): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-chat-anchor-key', anchorKey)
  row.setAttribute('data-chat-flow-kind', 'assistant-step')
  if (streaming) row.setAttribute('data-streaming', '')
  return row
}

async function tick(ms = 40): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('installDomFenceRenderer', () => {
  it('declares its cordis service injects (boot sweep depends on it)', () => {
    // 回归钉：曾丢失 inject 导出 → 宿主 fiber inject waiting 失效 →
    // apply 早于 slots 服务运行 → 整页 "Failed to load plugins"。
    expect([...inject].sort()).toEqual(['inputTriggers', 'sessions', 'slots'])
  })

  it('renders a settled dsh-ui fence into its own root and hides the stock block', async () => {
    const row = assistantRow('s7')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      const container = row.querySelector('.genui-dom-fence')
      expect(container).not.toBeNull()
      expect(container!.textContent).toContain('你好，世界')
    } finally {
      dispose()
    }
  })

  it('ignores non-dsh-ui code blocks', async () => {
    const row = assistantRow('s8')
    const ts = stockCodeBlock('const x = 1', 'ts')
    const plain = stockCodeBlock('hello', '')
    row.appendChild(ts)
    row.appendChild(plain)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(ts.hasAttribute('data-genui-rendered')).toBe(false)
      expect(plain.hasAttribute('data-genui-rendered')).toBe(false)
      expect(ts.style.display).toBe('')
    } finally {
      dispose()
    }
  })

  it('mounts while streaming once a component parses, and re-renders as the body grows', async () => {
    const row = assistantRow('s9', true)
    // Real host behaviour: the language label is EMPTY while streaming
    // (MarkdownText passes lang={streaming ? undefined : lang}) — the fence
    // is identified by content, not by label.
    const block = stockCodeBlock('{"items":[{"type":"text","content":"你好，世界"},{"type":"te', '')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      // Taken over during streaming: the first finished component renders.
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      const container = row.querySelector('.genui-dom-fence')
      expect(container).not.toBeNull()
      expect(container!.textContent).toContain('你好，世界')
      // The body grows: the second finished component appears without settle.
      block.querySelector('code')!.textContent = '{"items":[{"type":"text","content":"你好，世界"},{"type":"text","content":"第二块"}]}'
      await tick()
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('第二块')
    } finally {
      dispose()
    }
  })

  it('keeps the stock block visible while no component has finished (streaming half)', async () => {
    const row = assistantRow('s9b', true)
    const block = stockCodeBlock('{"items":[{"type":"text","content":', 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
      // The component closes: takeover happens while still streaming.
      block.querySelector('code')!.textContent = '{"items":[{"type":"text","content":"你好，世界"}]}'
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('你好，世界')
    } finally {
      dispose()
    }
  })

  it('publishes a streaming panel:true fence only after the reply settles', async () => {
    const row = assistantRow('s9c', true)
    const block = stockCodeBlock('{"panel":true,"title":"面板A","items":[{"type":"text","content":"A"}]', '')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      // Streaming: the block is taken over (hidden, empty root) but the
      // panel store stays untouched — identity-less renders never publish.
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      expect(row.querySelector('.genui-dom-fence')?.textContent).toBe('')
      expect(getPanelSpec('sess-1')).toBeNull()
      // Settle: the label materialises (host behaviour) and the mount
      // re-renders with the stable source → publish once.
      const label = block.querySelector('div')
      label!.textContent = 'dsh-ui'
      row.removeAttribute('data-streaming')
      await tick()
      expect(getPanelSpec('sess-1')?.title).toBe('面板A')
    } finally {
      dispose()
    }
  })

  it('restores the stock block when a content-identified fence settles as another language', async () => {
    const row = assistantRow('s9e', true)
    // A ```json fence whose streaming body happens to parse as a GenUI spec:
    // taken over by content while streaming, reverted once the label arrives.
    const block = stockCodeBlock('{"items":[{"type":"text","content":"你好，世界"}]', '')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(row.querySelector('.genui-dom-fence')).not.toBeNull()
      // Settle as ```json: the label says json → restore the stock block.
      const label = block.querySelector('div')
      label!.textContent = 'json'
      row.removeAttribute('data-streaming')
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
    } finally {
      dispose()
    }
  })

  it('re-applies the surgery when a host re-render wipes the container', async () => {
    const row = assistantRow('s9d', true)
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      const container = row.querySelector<HTMLElement>('.genui-dom-fence')
      expect(container).not.toBeNull()
      // Simulate a host React re-render dropping the foreign node and
      // resetting the hide during streaming.
      container!.remove()
      block.style.display = ''
      await tick()
      expect(container!.isConnected).toBe(true)
      expect(container!.previousElementSibling).toBe(block)
      expect(block.style.display).toBe('none')
    } finally {
      dispose()
    }
  })

  it('keeps the stock block visible for an unrepairable body', async () => {
    const row = assistantRow('s10')
    const block = stockCodeBlock(BROKEN_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
    } finally {
      dispose()
    }
  })

  it('relays component actions through the injected sender', async () => {
    const row = assistantRow('s11')
    const block = stockCodeBlock(BUTTON_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      const button = row.querySelector('.genui-dom-fence button')
      expect(button).not.toBeNull()
      fireEvent.click(button!)
      // The action rides the per-action trailing debounce (300ms).
      await tick(400)
      expect(send).toHaveBeenCalledTimes(1)
      const [sessionId, action] = send.mock.calls[0] as [string, string, unknown]
      expect(sessionId).toBe('sess-1')
      expect(action).toBe('refresh')
    } finally {
      dispose()
    }
  })

  it('publishes a panel:true fence to the panel store without mounting UI', async () => {
    const row = assistantRow('s12')
    const block = stockCodeBlock(PANEL_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      // The publisher renders nothing: the mounted root is an empty container.
      const container = row.querySelector('.genui-dom-fence')
      expect(container).not.toBeNull()
      expect(container!.textContent).toBe('')
      expect(getPanelSpec('sess-1')?.title).toBe('面板A')
    } finally {
      dispose()
    }
  })

  it('unmounts and restores the stock block when the row leaves the DOM', async () => {
    const row = assistantRow('s13')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      row.remove()
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(block.isConnected).toBe(false)
    } finally {
      dispose()
    }
  })

  it('skips fences without a current session (renders with no persistence)', async () => {
    const row = assistantRow('s14')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx(undefined, send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('你好，世界')
    } finally {
      dispose()
    }
  })
})
