import type { ReactNode } from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-web-react';
import type { FallbacksSettingsController, FallbacksSettingsState } from './fallbacks-store.ts';
/** Injected dependencies of {@link GeneralFallbacksRow} (slot `inject`). */
export interface GeneralFallbacksRowInjected {
    /** The shared controller (loaded on first mount, refreshed on pushed invalidations). */
    controller: FallbacksSettingsController;
    /** uSES subscription hook bound to the store (inject face — advisor pattern). */
    useSnapshot: SnapshotSelectorHook<FallbacksSettingsState>;
}
/** Props delivered by the slot outlet: runtime share + locale seat + inject face. */
export type GeneralFallbacksRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'fallbacks'> & GeneralFallbacksRowInjected;
/**
 * Render the Fallbacks status row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export declare function GeneralFallbacksRow({ controller, useSnapshot, t }: GeneralFallbacksRowProps): ReactNode;
