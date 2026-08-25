/**
 * One free window: a tab dragged out of the workbench floating over the
 * conversation area at viewport coordinates (rendered inside the panel host,
 * so desktop-shell transforms can never hijack its fixed containing block).
 *
 * The header drags the window with the panel-resize pattern — pointer
 * capture + per-frame direct DOM writes + a store commit on release — and
 * doubling as the DOCK-BACK gesture: while the pointer is over a workbench
 * pane ([data-dsh-pane], either panel), that pane highlights live and
 * releasing docks the tab into it (center merge); releasing anywhere else
 * just moves the window. The SE corner resizes, any press raises (the
 * floats array's order is the stacking order), the header right-click menu
 * and the X button dock / close. The tab content reuses the regular tab
 * renderer, so every tab type (terminal, editor, plugin tabs) floats
 * unchanged.
 */
import { type ReactNode } from 'react';
import type { FloatWindow, SidebarTab } from './state.ts';
export declare function FreeWindow(props: {
    float: FloatWindow;
    renderTab: (tab: SidebarTab, active: boolean, paneId: string) => ReactNode;
    getTabIcon?: (tab: SidebarTab) => ReactNode;
    onRaise: () => void;
    onMove: (x: number, y: number) => void;
    onResize: (w: number, h: number) => void;
    /** Dock the tab back; the pane id, or null for the active pane. */
    onDock: (paneId: string | null) => void;
    onClose: () => void;
}): import("react").JSX.Element;
