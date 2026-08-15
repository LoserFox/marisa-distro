import 'xterm/css/xterm.css';
import type { SessionScope } from './api.ts';
import { type SidebarStore } from './state.ts';
export declare function TerminalView(props: {
    scope: SessionScope;
    tabId: string;
    store: SidebarStore;
}): import("react").JSX.Element;
