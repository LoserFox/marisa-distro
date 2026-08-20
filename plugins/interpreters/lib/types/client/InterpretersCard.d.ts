/**
 * InterpretersCard — the `settings.plugin.item` card for the interpreters
 * configuration.
 *
 * Self-drawn chrome replicating the upstream `PluginCard` contract: the
 * upstream client value face exports no reusable card component, so this
 * card draws its own collapsible `<li>` with the same header button (name
 * over description, dirty pill, rotating chevron, aria) and divided body
 * (readOnly notice, form fields, footer with failed/saved message +
 * Discard/Save). Three fields (pythonPath, nodePath, timeoutMs) are staged
 * through the card's controller; save commits them through the
 * `/api/interpreters/set` gateway channel.
 *
 * @module dsh-interpreters/client/InterpretersCard
 */
import { type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots';
import { InterpretersCardController, type InterpretersCardState } from './store.ts';
import type { InterpretersKey } from './locales.ts';
/** Injected dependencies of {@link InterpretersCard} (slot `inject`). */
export interface InterpretersCardInjected {
    /** The card controller (loaded on mount, refreshed on pushed invalidations). */
    controller: InterpretersCardController;
    /** uSES subscription hook bound to the store. */
    useSnapshot: SnapshotSelectorHook<InterpretersCardState>;
}
/** Props the renderer binds for the card. */
export type InterpretersCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'interpreters'> & InjectFace<InterpretersCardInjected>;
/**
 * Render the interpreters card inside the plugin-config section, replicating
 * the upstream PluginCard chrome.
 * @param props - slot-delivered injected dependencies and the synthesized t seat.
 * @returns the card.
 */
export declare function InterpretersCard(props: InterpretersCardProps): ReactNode;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The interpreters card copy. */
        'interpreters': InterpretersKey;
    }
}
