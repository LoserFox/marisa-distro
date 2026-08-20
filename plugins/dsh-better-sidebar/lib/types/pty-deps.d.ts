import type * as nodePtyNs from 'node-pty';
/** The node-pty module surface the registries consume (spawn/kill/resize/…). */
export type NodePtyModule = typeof nodePtyNs;
/**
 * The node-pty version range this plugin ships. MUST stay identical to the
 * range DSH core declares (`@deepseek-ai/dsh-subprocess-local`): the same
 * range keeps pnpm resolving both to one physical package.
 */
export declare const DSH_NODE_PTY_RANGE = "^1.1.0";
/**
 * The WebSocket close-code-1011 reason the host sends when node-pty is
 * unavailable. The client recognizes this exact marker and fetches the full
 * repair details from `/sidebar/api/terminal.deps` (a WS close reason is
 * capped at 123 bytes, so the command itself cannot ride the close frame).
 */
export declare const PTY_DEPS_MISSING = "pty-deps-missing";
/** A require-compatible loader, injectable for tests. */
export type NodePtyRequire = (id: string) => unknown;
/**
 * Load node-pty once (synchronously) and cache the outcome. Returns null
 * when the package or its native binding cannot be loaded; the cause stays
 * queryable through {@link nodePtyLoadCause}. Never throws.
 */
export declare function loadNodePty(requireImpl?: NodePtyRequire): NodePtyModule | null;
/** The recorded load failure (undefined when the load succeeded or never ran). */
export declare function nodePtyLoadCause(): unknown;
/** Forget the cached outcome (tests only — a real reload is otherwise one-shot). */
export declare function resetNodePtyCache(): void;
/** Load node-pty or throw the canonical degraded-mode error (class-constructor default). */
export declare function loadRequiredNodePty(): NodePtyModule;
/**
 * Detect the DSH profile directory this plugin is installed into: the
 * nearest ancestor of the plugin module that carries both `package.json`
 * and `pnpm-workspace.yaml` (the profile root; the plugin resolves from the
 * profile's node_modules). Falls back to `$DSH_HOME/profiles/web` (the
 * standard web profile), then null.
 */
export declare function findProfileDir(fromFile?: string): string | null;
/** The plugin package root (walk-up from the module; works for lib/ and src/ layouts). */
export declare function findPluginRoot(fromFile?: string): string | null;
/** Options for {@link buildRepairCommand}. */
export interface RepairCommandOptions {
    /** The plugin package root (where scripts/install.sh / install.ps1 live). */
    pluginRoot: string | null;
    /** The detected profile directory (null → the standard `web` profile). */
    profileDir: string | null;
    /** Platform override for tests; defaults to the live process. */
    platform?: NodeJS.Platform;
}
/**
 * The pasteable repair command for a broken node-pty install: rerun the
 * plugin's own installer in `--repair` mode (idempotent: it re-writes the
 * profile's `allowBuilds: node-pty: true` and re-installs/rebuilds the
 * dependency). Falls back to DSH's plugin command when the scripts are not
 * shipped (exotic layouts).
 */
export declare function buildRepairCommand(options: RepairCommandOptions): {
    command: string;
    note?: string;
};
/** Structured status served by the `/sidebar/api/terminal.deps` endpoint. */
export type NodePtyDepsStatus = {
    ok: true;
} | {
    ok: false;
    /** The require-time error message (module missing, native binding broken…). */
    cause: string;
    /** The pasteable repair command (terminal/cmd). */
    command: string;
    /** The detected profile name (null when undetected → the command defaults to web). */
    profile: string | null;
    /** Optional supplementary hint (fallback command only). */
    note?: string;
};
/** Current node-pty dependency status (loaded vs degraded + repair info). */
export declare function depsStatus(options?: {
    fromFile?: string;
}): NodePtyDepsStatus;
