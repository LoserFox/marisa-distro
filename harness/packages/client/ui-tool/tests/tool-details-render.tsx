/** Test adapter for the production conversation.details.tool registration. */
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionProviderComponent, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DetailsSlotProps, DetailsToolOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/src/client/contract/slots.ts'
import { ToolDetails } from '../src/client/tool/ToolDetails.tsx'

/** Framework session-area seat used by direct DetailsPanel tests. */
export const SessionProviderStub: SessionProviderComponent = ({ children }) => children('s1' as SessionId)

/**
 * Bind ui-tool's details renderer to the conversation slot callback shape.
 * @param t - conversation locale seat used by Tool cards.
 * @returns a direct-test renderSlot implementation.
 */
export function renderToolDetails(t: TranslateNS<'conversation'>): DetailsSlotProps['renderSlot'] {
  return (_key, owner) => {
    // PropsRenderSlots keeps its key generic even for this one-key share;
    // recover the concrete owner selected by the adapter's fixed slot.
    const details = owner as DetailsToolOwnerProps
    return <ToolDetails block={details.block} cwd={details.cwd} t={t} />
  }
}
