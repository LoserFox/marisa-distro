import { type OfficeViewProps } from './office-shared.tsx';
/**
 * Render a .docx file via docx-preview. The library renders into a container
 * div (no canvas); images and styles are inlined. Unmounting clears the
 * container's innerHTML — docx-preview has no dispose API, but tearing down
 * the DOM is enough.
 */
export declare function DocxView(props: OfficeViewProps): JSX.Element;
