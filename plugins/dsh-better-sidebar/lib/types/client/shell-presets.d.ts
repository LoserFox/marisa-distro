/**
 * Built-in desktop-shell presets for the "位置兼容模式" secondary setting
 * (scheme `preset`). DATA-DRIVEN by design: each shell's adaptation lives
 * in one entry (strip values / optional CSS), the core applies it through
 * the SAME generic strip variable and CSS-injection mechanism — adding a
 * shell is adding data, never a code path.
 *
 * Inclusion rule (maintained in AGENTS.md §8): only shells that (a) appear
 * in this repo's issues/PRs (a user actually hit a problem) and (b) have
 * 100+ GitHub stars (a real user base). The mechanism is opt-in: auto
 * detection never applies a preset — the settings badge only SUGGESTS it.
 */
import type { DesktopEnv } from './desktop-env.ts';
export interface ShellPreset {
    /** Stable preset id (persisted in `titleBarPresetId`). */
    readonly id: string;
    /** User-facing name of the shell. */
    readonly title: string;
    /** One-line description shown in the settings popup. */
    readonly desc: string;
    /**
     * The top strip (px) this shell reserves over web content, per
     * environment — the fallback used when neither the standard WCO API nor
     * the `dsh-desktop-titlebar-inset` contract parameter is available.
     * Return undefined when the shell needs no strip in that environment.
     * MUST be pure (called during render).
     */
    readonly stripFor?: (env: DesktopEnv) => number | undefined;
    /**
     * Extra CSS applied while the preset is enabled (injected last, after the
     * plugin's own styles). Targets the plugin's stable data attributes and
     * shell-declared body/URL markers only — never other shells' class names.
     * Empty for presets fully covered by the strip variable.
     */
    readonly css?: string;
    /**
     * Whether this shell's marker is currently visible (URL stamps / preload
     * markers — see desktop-env.ts). Used ONLY for the settings "已检测"
     * badge; never auto-applies anything. MUST be pure.
     */
    readonly detect?: (env: DesktopEnv) => boolean;
}
/** All built-in shell presets (registration order = settings list order). */
export declare function getShellPresets(): readonly ShellPreset[];
/** One preset by id, or undefined for an unknown/empty id. */
export declare function getShellPreset(id: string): ShellPreset | undefined;
/** The strip the active preset contributes for the given environment. */
export declare function presetStripFor(preset: ShellPreset | undefined, env: DesktopEnv): number | undefined;
