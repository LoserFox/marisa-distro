/**
 * Track strip copy — locale keys and zh/en dictionaries.
 * @module @fakechris/dsh-track/client/locales
 */
/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
    'strip.label': 'Track',
    'strip.captures': '{n} 条捕获',
    'strip.captures.one': '{n} 条捕获',
    'strip.empty': '暂无捕获',
    'strip.title': '打开 Track 面板',
    'view.graph': '会话结构图',
};
/** English dictionary, checked complete against the zh key set. */
export const en = {
    'strip.label': 'Track',
    // No {plural} token — this DSH locale version only interpolates {name}
    // params (verified 2026-08-13), so singular/plural are explicit keys.
    'strip.captures': '{n} captures',
    'strip.captures.one': '{n} capture',
    'strip.empty': 'No captures',
    'strip.title': 'Open the Track panel',
    'view.graph': 'Session graph',
};
/** Locale namespace registered on the client locale service. */
export const NS = 'track';
