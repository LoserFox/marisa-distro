/**
 * Serializable configuration and defaults for the sidebar host half. Loader
 * schema validation normally fills defaults; {@link resolveSidebarConfig}
 * applies the same defaults for direct callers that bypass the Loader.
 * @module dsh-better-sidebar/config
 */
import z from 'schemastery';
import { type SidebarPrefs } from './prefs-shared.ts';
export { SIDEBAR_PREFS_DEFAULTS, SIDEBAR_PREFS_NS, TERMINAL_FONT_SIZE_DEFAULT, TERMINAL_FONT_SIZE_MAX, TERMINAL_FONT_SIZE_MIN, TITLE_BAR_STRIP_DEFAULT, TITLE_BAR_STRIP_MAX, TITLE_BAR_STRIP_MIN, WIDTH_PERCENT_DEFAULT, WIDTH_PERCENT_MAX, WIDTH_PERCENT_MIN, type SidebarPrefs, } from './prefs-shared.ts';
/** Tunable sidebar host limits (every field optional; defaults fill in). */
export interface SidebarConfig {
    /** Read cap of one text file (bytes); larger files return truncated. */
    readLimit?: number;
    /** Media route cap (bytes); larger binaries are refused. */
    mediaLimit?: number;
    /** Upload route cap (bytes); larger files are refused without touching disk. */
    uploadLimit?: number;
    /** Explorer row bound of one level. */
    listLimit?: number;
    /** Terminals per session. */
    terminalsPerSession?: number;
    /** How long a disconnected terminal process survives awaiting a reconnect. */
    reconnectGraceMs?: number;
    /**
     * Terminal shell (absolute path or bare executable name) for BOTH the UI
     * terminal tabs and the model-facing `terminal_*` tools. Empty = auto:
     * POSIX follows `$SHELL` then the account login shell; Windows follows
     * `DSH_SIDEBAR_SHELL`, then probes for `pwsh.exe`, then falls back to the
     * inbox `powershell.exe` (5.1). Set it from `cordis.patch.yml` / profile
     * plugin config, e.g. `config: { shell: /bin/zsh }`.
     */
    shell?: string;
    /**
     * Optional arguments passed to the shell executable. When non-empty these
     * REPLACE the automatic platform defaults (POSIX `-l` / Windows none), so
     * the deployment has full control over how the shell starts. When omitted
     * the existing default behavior is kept.
     */
    shellArgs?: string[];
}
/** Schemastery schema for the plugin configuration. */
export declare const Config: z<SidebarConfig>;
/** Fully defaulted sidebar host settings. */
export interface ResolvedSidebarConfig {
    readLimit: number;
    mediaLimit: number;
    uploadLimit: number;
    listLimit: number;
    terminalsPerSession: number;
    reconnectGraceMs: number;
    /** The configured terminal shell; empty means the host auto-resolves it. */
    shell: string;
    /** Explicit shell arguments; empty means use the platform defaults. */
    shellArgs: string[];
}
/**
 * Apply direct-call defaults after Loader schema validation has normally run.
 *
 * @param config - Deployment-provided sidebar host settings.
 * @returns Complete settings consumed by the host half.
 */
export declare function resolveSidebarConfig(config: SidebarConfig | undefined): ResolvedSidebarConfig;
/** Schemastery schema for the user-facing preferences (validated by the settings service). */
export declare const PrefsSchema: z<SidebarPrefs>;
