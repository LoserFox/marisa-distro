/**
 * `/fallbacks` slash command (plan fallbacks-role-runtime T3, AC-5).
 *
 * Session-scoped, read-only diagnostic: current session origin → resolved
 * role → resolved chain (role chain, else rootChain — an `inherit: true`
 * tail is annotated 「（inherit-root）」) → recent `fallbacks/switch` events
 * (newest first, capped) → cooldown status. Mirrors dsh-advisor's
 * `/advisor` command pattern: a conditional `ctx.inject(['commands'])` child
 * in `src/index.ts` calls {@link registerFallbacksCommands} with a
 * factory-bound handler; `commands` never joins the top-level inject list, so
 * the command is silently absent when no command registry is composed (no
 * top-level inject pollution — advisor T1 fix).
 *
 * The handler is **read-only**: it never mutates fallback state (no cooldown
 * reset, no pending-switch writes). zh/en copy lives in this file — the
 * client half's `src/client/locales.ts` is a separate client-side dictionary.
 * The host carries no per-session locale signal (the `locale` service is
 * client-side), so the wiring picks a deterministic default (`zh`, this
 * repo's primary language); both dictionaries are unit-tested.
 *
 * @module dsh-llm-fallbacks/commands
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
import { type FallbacksRole } from './config.ts';
import type { Origin } from './roles.ts';
import type { FallbacksSwitchEventData } from './events.ts';
/** How many recent `fallbacks/switch` events `/fallbacks` shows (newest first). */
export declare const RECENT_SWITCHES_LIMIT = 5;
/** Minimal command registry surface (satisfied by the dsh `CommandService`). */
export interface FallbacksCommandRegistry {
    register(definition: CommandDefinition): () => void;
}
/** Minimal agent/session surface the command reads (satisfied by the real `Agent`). */
export interface FallbacksCommandAgent {
    readonly id: string;
    readonly options?: {
        readonly provider?: string;
        readonly model?: string;
    };
    readonly session: {
        readonly header?: {
            readonly origin?: Origin;
        };
        readonly events: readonly unknown[];
    };
}
/** One active cooldown entry displayed by `/fallbacks`. */
export interface FallbacksCooldownEntry {
    /** `${provider}/${model}` key. */
    readonly key: string;
    /** Expiry epoch ms; `Infinity` for `revertPolicy: 'never'`. */
    readonly untilEpochMs: number;
}
/** The read-only diagnostic snapshot the `/fallbacks` handler renders. */
export interface FallbacksCommandSnapshot {
    /** Session origin: `'root'` when the agent carries no header origin. */
    readonly origin: Origin;
    /** Resolved role (first matching `roles.rules` entry → built-in `'inherit'`, spec §7.1). */
    readonly role: string;
    /** True when the role's own chain is non-empty and shown; false when rootChain (or none) is shown. */
    readonly chainRole: boolean;
    /** The displayed chain entries: the role's own chain when non-empty, else
     * rootChain — except `fallback: 'none'` with an empty own chain, which
     * yields `[]` even when rootChain is non-empty (nothing appended, mirroring
     * resolveChainViews' `[...[], ...[]]`); empty = not configured. */
    readonly chain: readonly string[];
    /** True when rootChain is appended as the inherit fallback tail (role's
     * `fallback` is `'inherit-root'` — or the role is unknown — and rootChain
     * is non-empty; the diagnostic annotation source, spec §7.4). */
    readonly inherit: boolean;
    /** Recent `fallbacks/switch` events, newest first, capped at {@link RECENT_SWITCHES_LIMIT}. */
    readonly switches: readonly FallbacksSwitchEventData[];
    /** Active cooldown entries for the agent. */
    readonly cooldown: readonly FallbacksCooldownEntry[];
}
/**
 * The session-scoped read-only operations the `/fallbacks` handler drives.
 * Implemented by the wiring (`src/index.ts`) against the live config source
 * (`roles.list` / `rootChain` — no chain map anymore) and the per-agent
 * state store; faked in unit tests.
 */
export interface FallbacksCommandController {
    /** Snapshot the session's fallback diagnostics. Never mutates state. */
    getSnapshot(agent: FallbacksCommandAgent): FallbacksCommandSnapshot;
}
/** zh/en dictionaries for the `/fallbacks` output. */
export declare const FALLBACKS_COMMAND_LOCALES: {
    readonly zh: {
        readonly title: "当前会话 fallback 诊断（只读）";
        readonly description: "查看当前会话的降级链、最近切换与冷却状态（只读）";
        readonly origin: "会话来源";
        readonly role: "角色";
        readonly chain: "链";
        readonly inheritRoot: "（inherit-root）";
        readonly chainNone: "未配置";
        readonly switches: "最近切换";
        readonly switchesNone: "本会话暂无 fallback 切换";
        readonly switchLine: "{from} → {to}（role={role}，reason={reason}）";
        readonly cooldown: "冷却";
        readonly cooldownNone: "无活跃冷却";
        readonly cooldownLine: "{key} 冷却至 {time}";
        readonly cooldownNever: "{key} 会话内不再回主";
        readonly reason: {
            readonly 'trigger-code': "触发码";
            readonly 'always-cap': "always 上限";
        };
    };
    readonly en: {
        readonly title: "Session fallback diagnostics (read-only)";
        readonly description: "Inspect fallback chain, recent switches, and cooldown for this session (read-only)";
        readonly origin: "Session origin";
        readonly role: "Role";
        readonly chain: "Chain";
        readonly inheritRoot: " (inherit-root)";
        readonly chainNone: "not configured";
        readonly switches: "Recent switches";
        readonly switchesNone: "No fallback switches in this session";
        readonly switchLine: "{from} → {to} (role={role}, reason={reason})";
        readonly cooldown: "Cooldown";
        readonly cooldownNone: "none active";
        readonly cooldownLine: "{key} suppressed until {time}";
        readonly cooldownNever: "{key} not reverting this session";
        readonly reason: {
            readonly 'trigger-code': "trigger-code";
            readonly 'always-cap': "always-cap";
        };
    };
};
/** A locale id supported by {@link FALLBACKS_COMMAND_LOCALES}. */
export type FallbacksCommandLocale = keyof typeof FALLBACKS_COMMAND_LOCALES;
/**
 * The newest `limit` `fallbacks/switch` events from a session's raw event
 * log, newest first. Unknown event shapes and malformed `fallbacks/switch`
 * payloads are skipped defensively (a session log may carry any
 * `SessionEventMap` type, and the durable log can outlive schema versions).
 */
export declare function recentFallbacksSwitches(events: readonly unknown[], limit: number): FallbacksSwitchEventData[];
/**
 * The chain entries `/fallbacks` shows for a role (spec §7.4): the declared
 * role's own chain when non-empty (`chainRole: true`); an empty own chain
 * defers to `rootChain` unless `fallback: 'none'` — then nothing is appended
 * and the display chain is empty, mirroring `resolveChainViews`'s
 * `[...[], ...[]]` exactly; undeclared ids and the built-in `'inherit'`
 * role resolve to `rootChain`. `inherit: true` marks the append-not-replace
 * tail — the role's `fallback` is `'inherit-root'` (the default) or the role
 * is unknown/built-in `'inherit'`, and `rootChain` is non-empty. Mirrors
 * `resolveChainViews`'s concatenation (see {@link buildRoleEntries} —
 * `src/chains.ts`; the diagnostic keeps its display semantics: the role's
 * own chain renders in full, `rootChain` only when the role has no own
 * chain, with the inherit tail as an annotation) without a failing model to
 * resolve against (the diagnostic is model-independent).
 *
 * `warn` mirrors {@link resolveChainViews}' defensive unknown-role warn
 * (qc2 F-002 — routed through the injected logger; the `/fallbacks` path
 * never reaches here unsanitized, as {@link resolveRole} resolves to a
 * declared id or `'inherit'` first, so this is direct-caller parity).
 */
export declare function resolveChainForDiagnostic(roles: readonly FallbacksRole[], rootChain: readonly string[], role: string, warn?: (message: string) => void): {
    readonly chainRole: boolean;
    readonly chain: readonly string[];
    readonly inherit: boolean;
};
/**
 * Render the `/fallbacks` status surface for one snapshot. Kept minimal and
 * truthful: origin → role → chain (+ inherit tail) → recent switches →
 * cooldown.
 */
export declare function fallbacksCommandText(snapshot: FallbacksCommandSnapshot, locale?: FallbacksCommandLocale): string;
/**
 * Register the `/fallbacks` command with a command registry (the dsh
 * `CommandService`, or a fake in tests). Called from the plugin's conditional
 * `ctx.inject(['commands'], ...)` child — the command exists only when a
 * registry is composed.
 * @returns the registry disposer (the inject child owns its lifetime).
 */
export declare function registerFallbacksCommands(registry: FallbacksCommandRegistry, controller: FallbacksCommandController, locale?: FallbacksCommandLocale): () => void;
