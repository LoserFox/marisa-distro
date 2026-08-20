import type { Context } from '../context-types.ts';
import { type SessionScope } from './api.ts';
import { type SidebarStore, type SidebarTab } from './state.ts';
export declare function EditorHost(props: {
    ctx: Context;
    store: SidebarStore;
    scope: SessionScope;
    tab: SidebarTab;
    expanded: string[];
    onToggleDir: (path: string) => void;
    onReferenceFile: (path: string) => void;
}): import("react").JSX.Element;
