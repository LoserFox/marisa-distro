/**
 * Client-side read of the user-facing "Side card" preferences. The host owns
 * the namespace through the settings seam (in-process); the DSH settings RPC
 * domain only serves allowlisted namespaces to configuration clients, so the
 * client reads and writes THIS namespace through the plugin's own fenced
 * /sidebar routes instead (api.settingsGet/settingsUpdate). Any failure
 * (route rejected, namespace absent, a field of the wrong type, a value out
 * of the contract range) falls back to the schema defaults — the side card
 * must keep working exactly as composed when the settings surface is missing.
 */
import type { api } from './api.ts';
import { clampWidthPercent, SIDEBAR_PREFS_DEFAULTS, type SidebarPrefs } from '../prefs-shared.ts';
export { SIDEBAR_PREFS_DEFAULTS, clampWidthPercent };
export type { SidebarPrefs };
/** The settings wire face the preferences need (a subset of the plugin api). */
export type SidebarSettingsClient = Pick<typeof api, 'settingsGet' | 'settingsUpdate'>;
/** Validate one raw resolved value into {@link SidebarPrefs}. Used for the
 * settings.get payload AND the settings.update response (both carry the
 * layered resolved value); any malformed field falls back to its default.
 * @param value - the raw resolved section from the settings wire.
 * @returns validated prefs (always well-formed).
 */
export declare function parsePrefs(value: unknown): SidebarPrefs;
/**
 * Read the resolved side card preferences through the plugin's settings route.
 * @param settings - the settings wire face (the plugin api by default).
 * @returns validated prefs, or the schema defaults when the route rejects,
 * the namespace is absent, or a stored value violates the contract.
 */
export declare function loadPrefs(settings: SidebarSettingsClient): Promise<SidebarPrefs>;
