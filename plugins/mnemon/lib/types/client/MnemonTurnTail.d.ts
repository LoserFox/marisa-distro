import type { ClientConnectionHandle } from '../shared/contracts.ts';
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { type MnemonAnchorPage } from './anchor.ts';
import type { MnemonKey } from './locales.ts';
export interface MnemonTurnTailProps {
    /** Engine-owned closing Turn boundary (TurnLocation on the wire). */
    turn: unknown;
    seq: number;
    openFile: (path: string) => void;
    /** Injected by the slot host: the session this tail belongs to. */
    sessionId?: string;
    connection: ClientConnectionHandle;
    t: (key: MnemonKey, params?: Record<string, unknown>) => string;
}
/** Route a settled tool name to the workbench page that explains its effect. */
export declare function memoryPageForTool(name: string): MnemonAnchorPage;
/** Whether this entry renders for the owner; chain selectors decline quietly. */
export declare function selectMnemonTurnTail(owner: TurnTailOwnerProps): Record<string, never> | null;
/** One-line memory-activity bar under a completed turn; hides when the turn touched no memory. */
export declare const MnemonTurnTail: import("react").NamedExoticComponent<MnemonTurnTailProps>;
