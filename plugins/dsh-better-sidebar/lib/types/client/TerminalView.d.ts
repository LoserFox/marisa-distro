import '@xterm/xterm/css/xterm.css';
import { type SessionScope, type TerminalDepsStatus } from './api.ts';
import { type SidebarStore } from './state.ts';
/** The degraded-mode payload rendered by {@link TerminalDepsBanner}. */
type TerminalDepsInfo = Extract<TerminalDepsStatus, {
    ok: false;
}>;
export declare function TerminalView(props: {
    scope: SessionScope;
    tabId: string;
    store: SidebarStore;
}): import("react").JSX.Element;
/**
 * The node-pty dependency failure banner (issue #140): explains that the
 * terminal's native dependency failed to load and shows the PASTEABLE repair
 * command (bash / cmd / PowerShell) with a copy button — the user pastes it
 * into a terminal where their DSH profile lives and runs it, then retries.
 * Extracted as a standalone component for direct testing.
 */
export declare function TerminalDepsBanner(props: {
    deps: TerminalDepsInfo;
    onRetry: () => void;
}): import("react").JSX.Element;
export {};
