export interface LayoutPushInput {
    narrow: boolean;
    panelOpen: boolean;
    bottomOpen: boolean;
    width: number;
    bottomHeight: number;
    viewportWidth: number;
    viewportHeight: number;
}
export interface LayoutPushSize {
    width: number;
    height: number;
}
/** Compute the live layout-push size. Narrow drawers float and push 0. */
export declare function layoutPushSize(input: LayoutPushInput): LayoutPushSize;
