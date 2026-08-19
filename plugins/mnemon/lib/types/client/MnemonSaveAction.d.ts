import type { ClientConnectionHandle } from '../shared/contracts.ts';
import type { MnemonKey } from './locales.ts';
export interface MnemonSaveActionProps {
    /** Stable identity of the finalized assistant message this action addresses. */
    messageId: string;
    /** Injected by the slot host: the session this message belongs to. */
    sessionId?: string;
    connection: ClientConnectionHandle;
    t: (key: MnemonKey, params?: Record<string, unknown>) => string;
}
/** Save-to-memory action on finalized assistant messages, routed through the supervised writeback gate. */
export declare const MnemonSaveAction: import("react").NamedExoticComponent<MnemonSaveActionProps>;
