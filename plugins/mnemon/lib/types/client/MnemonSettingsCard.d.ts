import { type JSX } from 'react';
import type { ClientConnectionHandle, ClientSettingsScope, Config, InteractionConfig } from '../shared/contracts.ts';
import { type MnemonTranslate } from './locales.ts';
export interface MnemonSettingsCardProps {
    scope: ClientSettingsScope<Config>;
    /** Separate live namespace; falls back to the core scope for older hosts. */
    interactionScope?: ClientSettingsScope<InteractionConfig>;
    /** Loopback RPC used for whole-directory ZIP backup and restore. */
    connection?: ClientConnectionHandle;
    sessionId?: string;
    workspaceId?: string;
    workspaceLabel?: string;
    t?: MnemonTranslate;
}
/** Dedicated Mnemon page contributed directly to DSH's settings navigation. */
export declare function MnemonSettingsCard({ scope, interactionScope: suppliedInteractionScope, connection, sessionId, workspaceId, workspaceLabel, t }: MnemonSettingsCardProps): JSX.Element | null;
