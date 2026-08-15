/**
 * Browser conversation plugin. `contract/` is the shared type boundary
 * between the independently implemented skeleton and chat domains; `apply.ts`
 * owns their slot assembly.
 */
export { apply, inject } from './apply.ts'
export { ConversationService } from './service.ts'
export type { IConversation } from './service.ts'

export type {
  CallId, ChatStoreState, SelectionTarget, ViewTab,
} from './contract/views.ts'
export type { ConversationKey } from './locales.ts'
export type {
  ChatStore, ChatViewInjected, ChatViewSlotProps, CommandRowOwnerProps, CommandRowProps, ComposerBarInjected,
  ComposerChainProps, ConversationInjected,
  ConversationSessionHeaderInjected, ConversationSessionInjected, ConversationSlotProps, ConvViewOwnerProps,
  ConvViewProps, DetailsInjected, DetailsSlotProps, DetailsToolOwnerProps, EmptyWorkspaceOwnerProps,
  ToolTreeOwnerProps, TurnTailOwnerProps,
} from './contract/slots.ts'
// Export discipline: packages/client/AGENTS.md.

declare module 'cordis' {
  interface Context {
    /** The outward face only; the concrete service stays inside this plugin. */
    conversation: import('./service.ts').IConversation
  }
}
