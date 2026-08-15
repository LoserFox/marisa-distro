/**
 * Locale dictionaries for the suggested-replies Web surface.
 *
 * @module @dsh-external/dsh-suggested-replies/client/locales
 */
/** Keys used by the input dock and settings section. */
export type SuggestedRepliesKey = 'title' | 'hint' | 'loading' | 'settings.nav' | 'settings.enabled.label' | 'settings.enabled.description' | 'settings.disabled.note';
/** Locale namespace registered by the client plugin. */
export declare const NS = "suggested-replies";
/** English copy. */
export declare const en: Record<SuggestedRepliesKey, string>;
/** Simplified Chinese copy. */
export declare const zh: Record<SuggestedRepliesKey, string>;
