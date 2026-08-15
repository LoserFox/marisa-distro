// @vitest-environment jsdom
// Rendering error boundary: a component crash inside one GenUI block must
// degrade to an inline alert, never take down the whole chat surface.
// The boundary wraps all three render entrances (fence / toolview / panel).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '../src/client/ErrorBoundary.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Boom(): never {
  throw new Error('boom: component exploded')
}

describe('ErrorBoundary', () => {
  it('renders healthy children unchanged', () => {
    render(
      <ErrorBoundary label="该界面">
        <div>健康内容</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('健康内容')).not.toBeNull()
    expect(document.querySelector('[data-genui-error]')).toBeNull()
  })

  it('degrades a crashing subtree to an inline alert with the error message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary label="该界面">
        <Boom />
      </ErrorBoundary>,
    )
    const alert = document.querySelector('[data-genui-error]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('该界面渲染失败')
    expect(alert?.textContent).toContain('boom: component exploded')
    expect(spy).toHaveBeenCalled()
    // The fallback stays a small inline box — no full-tree unmount.
    expect(alert?.getAttribute('role')).toBe('alert')
  })

  it('does not break when the label is omitted', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(document.querySelector('[data-genui-error]')?.textContent).toContain('渲染失败')
  })

  it('siblings outside the boundary still render after a crash inside it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <ErrorBoundary label="坏块">
          <Boom />
        </ErrorBoundary>
        <div>聊天界面其余内容</div>
      </div>,
    )
    // The whole surface survives: content outside the boundary is intact.
    expect(screen.getByText('聊天界面其余内容')).not.toBeNull()
    expect(screen.getByText(/坏块渲染失败/)).not.toBeNull()
  })
})
