/**
 * locales.ts — i18n dictionaries for the interpreters configuration card.
 *
 * Keys cover both the card chrome (replicated from upstream PluginCard:
 * expand/collapse/unsaved/saveFailed/readOnly/save/saving/discard) and the
 * plugin's own copy (title/intro + the three field labels and hints).
 *
 * @module dsh-interpreters/client/locales
 */
export declare const NS: "interpreters";
export type InterpretersKey = 'title' | 'intro' | 'pythonPath' | 'pythonHelp' | 'nodePath' | 'nodeHelp' | 'timeoutMs' | 'timeoutHelp' | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed' | 'readOnly' | 'expand' | 'collapse' | 'namespaceUnavailable' | 'retry';
export declare const zh: Record<InterpretersKey, string>;
export declare const en: Record<InterpretersKey, string>;
