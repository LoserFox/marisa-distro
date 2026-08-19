export interface MnemonWorkspaceSnapshot {
    open: boolean;
}
/** Small framework-neutral state holder shared by the sidebar row and panel. */
export declare class MnemonWorkspaceController {
    private snapshot;
    private readonly listeners;
    getSnapshot: () => MnemonWorkspaceSnapshot;
    subscribe: (listener: () => void) => (() => void);
    open(): void;
    close(): void;
    toggle(): void;
    private setOpen;
}
