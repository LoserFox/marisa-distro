/**
 * Suppress the DSH composer's built-in "unsupported image format" toast when
 * a file/folder drop (or paste) is not a supported image — that toast is
 * misleading for the drag-and-drop path plugin, which handles the same drop
 * by inserting the original filesystem path.
 *
 * Zero source intrusion: this module only observes the DOM at runtime. The
 * composer's Toast component (ui-primitives) portals a `[role="alert"]`
 * element into document.body; the same Toast component also reports prompt
 * send failures, so we must match by message text, not by element.
 *
 * Matching texts (localized by the composer):
 *   zh: 不支持的图片格式：{type}
 *   en: Unsupported image format: {type}
 *
 * When matched, a clarifying suffix is appended via CSS ::after — the
 * official message (including the MIME type) stays fully visible, with the
 * extra hint noting that the drag-and-drop plugin handled the drop.
 *
 * The observer and injected style are owned by the caller's effect lifetime:
 * dispose() disconnects and removes both.
 */
export interface ToastSuppressor {
    dispose(): void;
}
export declare function suppressImageFormatToast(): ToastSuppressor;
