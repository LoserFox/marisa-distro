import { type JSX } from 'react';
import type { ClientConnectionHandle } from '../shared/contracts.ts';
import type { MnemonTranslate } from './locales.ts';
interface ProviderSettingsSectionProps {
    connection?: ClientConnectionHandle;
    sessionId?: string;
    workspaceId?: string;
    workspaceLabel?: string;
    activeScope: 'global' | 'workspace';
    refreshKey: number;
    disabled: boolean;
    scopeChanging: boolean;
    t: MnemonTranslate;
}
export declare function ProviderSettingsSection(props: ProviderSettingsSectionProps): JSX.Element;
export {};
