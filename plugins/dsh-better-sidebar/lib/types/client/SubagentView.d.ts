import type { Context, SidebarSubagentAddress } from '../context-types.ts';
/**
 * The sidebar's Subagent topology page.
 * @param props - current session id, whether the page is actually visible
 *   (active tab + open panel), the client context, and an optional
 *   jump-notify hook fired right before `openSubagent` (lets the sidebar
 *   shell re-open the Subagent page after the conversation switch lands on
 *   the child session).
 * @returns the main agent's topology tree, or the empty/error/loading states.
 */
export declare function SubagentView(props: {
    sessionId: string;
    active: boolean;
    ctx: Context;
    onOpenChild?: (address: SidebarSubagentAddress) => void;
}): import("react").JSX.Element;
