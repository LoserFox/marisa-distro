import type { MnemonTranslate } from './locales.ts';
export type MnemonViewSurface = 'buildin' | 'sidebar';
type AppearanceSlot = 'shell' | 'masthead' | 'brand' | 'headerActions' | 'workspacePicker' | 'statusCluster' | 'workspaceMismatch' | 'topNavigation' | 'nav' | 'navGroup' | 'memoryWorkspace' | 'memoryNavigation' | 'memoryTabs' | 'memoryWriteButton' | 'bodyCardHeader' | 'bodyDirectoryActions' | 'bodyCardIdentity' | 'bodyCardMeta' | 'bodyCardFooter' | 'bodyCardStats' | 'itemActionButton' | 'itemEditAction' | 'itemDangerAction' | 'modalBackdrop' | 'modal' | 'canvas' | 'pageHeader' | 'inspectorGlyph';
export interface MnemonViewAppearance {
    surface: MnemonViewSurface;
    title: string;
    showLogo: boolean;
    showTelemetry: boolean;
    showNavigationGlyphs: boolean;
    showNavigationDetails: boolean;
    showNavigationDividers: boolean;
    showSpaceSummary: boolean;
    classes: Partial<Record<AppearanceSlot, string | undefined>>;
}
/** Appearance is a surface concern; every data flow and workspace action stays shared. */
export declare function resolveMnemonViewAppearance(surface: MnemonViewSurface, t: MnemonTranslate): MnemonViewAppearance;
export declare const MnemonViewAppearanceProvider: import("react").Provider<MnemonViewAppearance>;
export declare function useMnemonViewAppearance(): MnemonViewAppearance;
export declare function appearanceClass(base: string | undefined, variant: string | undefined): string;
export {};
