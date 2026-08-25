import type { OpenWithTarget } from './open-with.ts';
import { type UploadItem } from './upload.ts';
/** Root label: the last path segment (mirror of the host rootLabel). */
export declare function baseName(path: string): string;
export declare function FileTree(props: {
    sessionId: string;
    cwd: string | undefined;
    expanded: string[];
    /** Files highlighted by a "Show in folder" reveal (absolute paths). */
    revealed: string[];
    onToggle: (path: string) => void;
    onOpenFile: (path: string) => void;
    /** Context-menu "open in a new tab" (file rows; absent → no entry). */
    onOpenFileNewTab?: (path: string) => void;
    /** Context-menu "open to the side" (file rows; absent → no entry). */
    onOpenFileSide?: (path: string) => void;
    /**
     * The "open with" menu: resolved external targets (already SSH-filtered
     * and in menu order). Absent → the whole section is hidden.
     */
    openWithTargets?: OpenWithTarget[];
    /** Ids of targets pinned to the menu's top level (subset of the ids). */
    openWithPinned?: string[];
    /** Whether the workspace is remote (appends the SSH hint to target labels). */
    openWithSsh?: boolean;
    /** Open one target externally (reveal or URL — the caller decides). */
    onOpenWith?: (targetId: string, path: string) => void;
    /** Toggle one target's pinned state (the submenu row's pushpin). */
    onToggleOpenWithPin?: (targetId: string) => void;
    /** Insert `@<relative path>` into the composer draft. */
    onReferenceFile: (path: string) => void;
    /** Bump to wipe the level cache and reload the visible set. */
    refreshTick: number;
    /** Upload into `dir` (absolute, inside the workspace); runs in the caller. */
    onUploadRequest: (dir: string, items: UploadItem[]) => void;
    /** True while an upload is in flight (drops are ignored). */
    busy: boolean;
}): import("react").JSX.Element;
