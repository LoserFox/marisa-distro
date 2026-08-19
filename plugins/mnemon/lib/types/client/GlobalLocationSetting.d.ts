import type { JSX, ReactNode } from 'react';
interface GlobalLocationSettingProps {
    name: string;
    ariaLabel: string;
    label: string;
    hint: string;
    defaultLabel: string;
    customLabel: string;
    custom: boolean;
    workspace: boolean;
    disabled: boolean;
    className?: string | undefined;
    children?: ReactNode;
    onChange: (custom: boolean) => void;
    onInteract?: (() => void) | undefined;
}
/** Shared global/default location control for Native and workspace-aware providers. */
export declare function GlobalLocationSetting(props: GlobalLocationSettingProps): JSX.Element;
export {};
