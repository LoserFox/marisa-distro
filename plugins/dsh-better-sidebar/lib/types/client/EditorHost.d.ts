import type { Context } from '../context-types.ts';
import { type SessionScope } from './api.ts';
import type { SidebarStore } from './state.ts';
export declare function EditorHost(props: {
    ctx: Context;
    store: SidebarStore;
    scope: SessionScope;
    path: string;
    title: string;
}): import("react").JSX.Element;
