import { type OfficeViewProps } from './office-shared.tsx';
import '@univerjs/preset-sheets-core/lib/index.css';
/**
 * Render a .xlsx file via Univer. The sheets preset creates a canvas-based
 * spreadsheet (formula bar, sheet tabs, formula engine) sized to its
 * container, so the host fills the pane. Unmounting calls `univer.dispose()`
 * — without it the canvas, workers, and DOM listeners leak (mirrors the
 * xterm dispose discipline in TerminalView).
 */
export declare function XlsxView(props: OfficeViewProps): JSX.Element;
