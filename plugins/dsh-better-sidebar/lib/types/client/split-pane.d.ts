import type { ReactNode } from 'react';
import type { SidebarState, SidebarTab, SplitNode } from './state.ts';
import type { DropZone } from './state.ts';
import { type NewTabOption, type TabDragPayload } from './TabBar.tsx';
/** Actions the workbench needs (bound to the store by the sidebar shell). */
export interface WorkbenchActions {
    closeTab: (paneId: string, tabId: string) => void;
    activateTab: (paneId: string, tabId: string) => void;
    /** Make a pane the target of newly opened tabs (click focus). */
    focusPane: (paneId: string) => void;
    /** VSCode drag gesture: edge → split the target pane, center → merge. */
    moveTabToEdge: (payload: TabDragPayload, toPane: string, zone: DropZone) => void;
    /** Reorder within a pane (drop onto another tab inserts before it). */
    moveTabBefore: (payload: TabDragPayload, toPane: string, beforeTabId: string) => void;
    resizeSplit: (splitId: string, index: number, deltaFrac: number) => void;
}
/** The workbench: the split tree filling the sidebar body. `tree` selects
 *  which tree renders (the right panel's by default; the bottom panel passes
 *  `state.bottomSplits` — the actions route by pane id, so one action set
 *  serves both). */
export declare function Workbench(props: {
    state: SidebarState;
    tree?: SplitNode;
    newTabOptions: NewTabOption[];
    actions: WorkbenchActions;
    onNewTab: (optionId: string) => void;
    renderTab: (tab: SidebarTab, active: boolean, paneId: string) => ReactNode;
    getTabIcon?: (tab: SidebarTab) => ReactNode;
    getTabBadge?: (tab: SidebarTab) => ReactNode;
}): import("react").JSX.Element;
