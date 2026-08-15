import type { FileViewerProps } from './service.ts';
/**
 * The sandbox tokens of the HTML preview iframe. NO allow-same-origin (the
 * preview must stay in an opaque origin — with the route's own origin it
 * could read session data) and NO allow-top-navigation (a previewed page
 * must not hijack the GUI). The user can disable the sandbox per-feature
 * in the side card settings (warned); the toggle below reflects it.
 */
export declare const HTML_IFRAME_SANDBOX = "allow-scripts allow-popups allow-downloads allow-modals";
export declare function TextEditor(props: FileViewerProps): import("react").JSX.Element;
