import type { MnemonTranslate } from './locales.ts';
import type { MnemonWorkspaceController } from './workspace-controller.ts';
export declare const MNEMON_ENTRY_SELECTOR = "[data-dsh-mnemon-entry]";
/** Mount a self-healing official-style entry under the New Session row. */
export declare function mountMnemonSidebarEntry(controller: MnemonWorkspaceController, t: MnemonTranslate, subscribeLocale?: (listener: () => void) => () => void): () => void;
