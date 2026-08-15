/**
 * Test setup: register the dsh-ui fence renderer exactly like the cordis
 * client entry does, so MarkdownText renders fences in jsdom — but ONLY when
 * the host under test ships the fence-registry extension point (contract
 * line). On pristine hosts the registry does not exist and the MarkdownText
 * fence integration tests skip themselves; the DOM channel has its own spec.
 * Also stubs requestAnimationFrame for the staggered-reveal animation and
 * SVG measure APIs jsdom lacks.
 */
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { renderGenuiFence } from '../src/client/index.tsx'

type HostFenceExt = {
  registerFenceRenderer?: (lang: string, renderer: (raw: string, key: unknown, context?: unknown) => unknown) => () => void
}

export const hasFenceRegistry: boolean = typeof (primitives as unknown as HostFenceExt).registerFenceRenderer === 'function'

if (hasFenceRegistry) {
  ;(primitives as unknown as HostFenceExt).registerFenceRenderer!('dsh-ui', renderGenuiFence as never)
}

// jsdom lacks rAF: the reveal animation uses it per item; manual tick below.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  // @ts-expect-error test-only stub
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number
  // @ts-expect-error test-only stub
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
}

// jsdom lacks PointerEvent: the panel resize drag and pointer interactions
// in general rely on it. A MouseEvent subclass carries pointerId/pointerType
// so fireEvent.pointerDown/pointerMove/pointerUp behave like the browser.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 1
      this.pointerType = params.pointerType ?? 'mouse'
    }
  }
  // @ts-expect-error test-only polyfill
  window.PointerEvent = PointerEventPolyfill
  // @ts-expect-error test-only polyfill
  globalThis.PointerEvent = PointerEventPolyfill
}
