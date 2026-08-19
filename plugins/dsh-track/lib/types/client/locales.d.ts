/**
 * Track strip copy — locale keys and zh/en dictionaries.
 * @module @fakechris/dsh-track/client/locales
 */
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    'strip.label': string;
    'strip.captures': string;
    'strip.captures.one': string;
    'strip.empty': string;
    'strip.title': string;
    'view.graph': string;
};
/** The track namespace key union. */
export type TrackKey = keyof typeof zh;
/** English dictionary, checked complete against the zh key set. */
export declare const en: {
    'strip.label': string;
    'strip.captures': string;
    'strip.captures.one': string;
    'strip.empty': string;
    'strip.title': string;
    'view.graph': string;
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Track strip copy. */
        track: TrackKey;
    }
}
/** Locale namespace registered on the client locale service. */
export declare const NS = "track";
