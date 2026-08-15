/**
 * settings.ts — host-side bridge between the `interpreters` settings namespace
 * and the plugin's other halves (tool registration + RPC gateway).
 *
 * The composition `Config` (cordis.patch.yml) is the first-boot seed; once the
 * `ctx.settings` service mounts, the user-editable layer takes over and live
 * re-registration follows every committed change. Headless assemblies without
 * a settings provider fall back to the composition config (no persistence, no
 * live reload).
 *
 * The bridge pattern mirrors `dsh-advisor/src/settings.ts`: a `source()` thunk
 * the gateway reads in-process, plus an `onChange()` subscription the host
 * entry uses to re-register the tools. This avoids any wire-layer allowlist
 * (the DSH settings RPC domain only serves a fixed namespace set to browser
 * configuration clients; the gateway bypasses it through `/api`).
 *
 * @module dsh-interpreters/settings
 */
import type { Context } from '@deepseek-ai/cordis';
import { type Config as ConfigType } from './config.js';
/** Settings namespace under which interpreter paths persist. */
export declare const SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Read face the gateway and tool re-registration consume. */
export interface InterpretersSettingsBridge {
    /** The current resolved config (composition seed while settings is absent). */
    source(): ConfigType;
    /** Observe committed changes to the resolved config. */
    onChange(callback: () => void): void;
}
/**
 * Install the `interpreters` settings namespace and return the bridge.
 *
 * The settings service is reached through `ctx.inject(['settings'], ...)` so a
 * composition without a settings provider still loads the plugin (entry-source
 * fallback, no persistence). Multi-fiber dedupe is handled by catching the
 * `"already registered"` rejection — host composition may mount several
 * concurrent fibers of this plugin, and only the first registration owns the
 * namespace.
 * @param ctx - host context.
 * @param entry - composition-layer config (cordis.patch.yml seed).
 * @returns the bridge the gateway and tool re-registration consume.
 */
export declare function installInterpretersSettings(ctx: Context, entry: ConfigType): InterpretersSettingsBridge;
