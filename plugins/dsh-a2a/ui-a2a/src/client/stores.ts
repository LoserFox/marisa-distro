/** Per-session transient state shared by the A2A badge and panel. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Transient A2A composer state. */
export interface A2aComposerState {
  panelOpen: boolean
}

type A2aComposerActions = {
  togglePanel: (state: A2aComposerState) => void
  setPanelOpen: (state: A2aComposerState, open: boolean) => void
}

/** Public handle type for the shared composer store. */
export type A2aComposerStore = EngineStoreHandle<A2aComposerState, A2aComposerActions>

/**
 * Create the per-session A2A composer state.
 * @returns the uninstantiated store handle used by composer slots.
 */
export function createA2aComposerStore(): A2aComposerStore {
  return defineStore({
    init: () => ({ panelOpen: false }),
    actions: {
      togglePanel: (state) => { state.panelOpen = !state.panelOpen },
      setPanelOpen: (state, open) => { state.panelOpen = open },
    },
  })
}
