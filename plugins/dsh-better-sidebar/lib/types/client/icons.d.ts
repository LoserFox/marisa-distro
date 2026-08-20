/**
 * Icons the sidebar needs beyond the primitives set: a terminal glyph (the
 * icon library has none), a diff glyph, and the two panel-toggle glyphs for
 * the top-right cluster. Per-tab icons live on the tab descriptors
 * (`descriptor.icon`), not in a type-keyed switch — the icon mapping was
 * registry-ized with the tab types.
 */
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * Right-panel toggle glyph (the "侧拉" button): a frame with a filled strip
 * along its RIGHT edge, in the app's outline style (1.5px stroke,
 * currentColor).
 */
export declare const IconPanelRightOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/**
 * Bottom-panel toggle glyph (the "底栏" button): a frame with a filled strip
 * along its BOTTOM edge, in the app's outline style.
 */
export declare const IconPanelBottomOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/**
 * Terminal glyph in the app's outline style (1.5px stroke, currentColor):
 * a rounded frame with a prompt chevron and underscore cursor.
 */
export declare const IconTerminalOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** Diff glyph in the app's outline style: a file frame with a plus and a minus row. */
export declare const IconDiffOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/**
 * Stop glyph for the background-job kill button: a filled square in the
 * app's outline scale (16), the universal "halt this work" mark.
 */
export declare const IconStopOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** Image viewer glyph: a picture frame with a sun and a mountain. */
export declare const IconImageOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** PDF viewer glyph: a document frame with the "PDF" label. */
export declare const IconPdfOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** Markdown viewer glyph: the classic "M with a down arrow" badge. */
export declare const IconMarkdownOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** HTML viewer glyph: a document frame with a "‹/›" tag pair. */
export declare const IconHtmlOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
/** Browser tab glyph: a globe with meridians. */
export declare const IconGlobeOutline16: ({ size, className }: IconProps) => import("react").JSX.Element;
