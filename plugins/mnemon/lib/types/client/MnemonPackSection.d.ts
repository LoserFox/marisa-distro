import { type JSX } from 'react';
import type { ClientConnectionHandle } from '../shared/contracts.ts';
import type { MnemonTranslate } from './locales.ts';
interface MnemonPackSectionProps {
    connection?: ClientConnectionHandle;
    sessionId?: string;
    workspaceId?: string;
    refreshKey: number;
    t: MnemonTranslate;
    embedded?: boolean;
}
export declare function MnemonPackSection({ connection, sessionId, workspaceId, refreshKey, t, embedded }: MnemonPackSectionProps): JSX.Element;
export {};
