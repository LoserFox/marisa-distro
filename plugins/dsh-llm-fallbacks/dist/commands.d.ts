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
 * The bare diagnostic and the config readback are **read-only**: they never
 * mutate fallback state (no cooldown reset, no pending-switch writes). The
 * `config revert-seed <role-id>` subcommand is the one write action (plan
 * fallbacks-tui-settings Task 2, AC-3): it delegates to the controller's
 * `revertSeed` (wired to the seeds service) and prints the outcome — a
 * web-card action capability the settings seam cannot express. zh/en copy
 * lives in this file — the client half's `src/client/locales.ts` is a
 * separate client-side dictionary. The host carries no per-session locale
 * signal (the `locale` service is client-side), so the wiring picks a
 * deterministic default (`zh`, this repo's primary language); both
 * dictionaries are unit-tested.
 *
 * @module dsh-llm-fallbacks/commands
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
import { type FallbacksRole } from './config.ts';
import type { Origin } from './roles.ts';
import type { FallbacksSwitchEventData } from './events.ts';
import type { SeedRevertFailReason } from './seeds.ts';
import { type SlotRowConfig } from './time-slots.ts';
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
    /** Current time-slot winner + display label (P5/P7): the 分时切换 side of
     * the status strip. The switches section below is the 降级切换 side —
     * the copy never mixes. */
    readonly slot: {
        readonly winner: SlotRowConfig | 'all-day';
        readonly label: string;
    };
    /** Recent `fallbacks/switch` events (failure walks — 降级切换), newest
     * first, capped at {@link RECENT_SWITCHES_LIMIT}. */
    readonly switches: readonly FallbacksSwitchEventData[];
    /** Active cooldown entries for the agent. */
    readonly cooldown: readonly FallbacksCooldownEntry[];
}
/**
 * The composed-config surface `/fallbacks config` renders (plan
 * fallbacks-tui-client T2, AC-2): the composed `fallbacks` namespace as the
 * runtime sees it (settings user layer included). Roles are summarized from
 * `roles.list` as `{ id, chainCount }` — the two-block model: `roles.list`
 * entities carry id/persona/chain/fallback (NO per-role `model`;
 * `provider`/`model` live on `roles.rules`), so the readback line is id +
 * chain count, never a rules dump.
 *
 * Enriched readback (plan fallbacks-tui-settings Task 2, AC-4): timeSlots /
 * tz / roles.rules join the summary so TUI operators can verify `/settings`
 * edits. One summarized time-slot row: preset rows carry `{ preset,
 * chainCount }` (windows are frozen code constants in {@link PRESETS} and
 * never stored on the row — the render resolves the window text from
 * PRESETS); custom rows carry `{ start, end, chainCount }`. Rules rows carry
 * `{ provider, model, role }` — an omitted provider/model (wildcard match at
 * runtime) is summarized as `''` and rendered as `*`.
 */
export interface FallbacksConfigSummary {
    readonly enabled: boolean;
    readonly triggerCodes: readonly string[];
    readonly rootChain: readonly string[];
    /** Summarized time-slot rows (preset rows carry `preset`, custom rows carry `start`/`end`; both may carry a day mask). */
    readonly timeSlots: readonly {
        preset?: string;
        start?: string;
        end?: string;
        days?: readonly number[];
        chainCount: number;
    }[];
    /** Config-level timezone for slot matching (default `Asia/Shanghai`). */
    readonly tz: string;
    readonly roles: readonly {
        id: string;
        chainCount: number;
    }[];
    /** Summarized role rules: provider/model patterns → declared role (or the built-in `'inherit'`). */
    readonly rules: readonly {
        provider: string;
        model: string;
        role: string;
    }[];
    readonly cooldownMs: number;
    readonly revertPolicy: string;
    readonly maxSwitchesPerStep: number;
    readonly alwaysModeRetryCap: number;
    readonly presets: 'bundled' | 'none';
    /** Dispatch-time LLM role auto-match switch (default true). */
    readonly roleAutoMatch: boolean;
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
    /**
     * Snapshot the composed fallbacks config (settings readback). Not
     * agent-scoped — the composed config is session-independent; reads the
     * same live config source the runtime reads. Never mutates state.
     */
    getConfig(): FallbacksConfigSummary;
    /**
     * Revert one role's persona to its CURRENT declared seed default (AC-3).
     * Surfaces the outcome as VALUES, not copy (qc1 F-003 / qc2 F-006 / qc3
     * F-003): `ok: true` when reverted; `ok: false` with the
     * {@link SeedRevertFailReason} code explaining why not (not a seeded role
     * / role row absent). The command handler localizes the code per its
     * registration locale — the controller never pre-localizes. A
     * settings-write failure propagates loudly as a rejected promise (the
     * same contract as the seeds service — never swallowed into an
     * `ok: false`); the handler maps it to a structured error. Implemented by
     * the wiring against the per-apply seed manager
     * (`seeds.revert(roleId, seedsIo)`), not the typert gateway.
     */
    revertSeed(roleId: string): Promise<{
        ok: boolean;
        reason?: SeedRevertFailReason;
    }>;
}
/** zh/en dictionaries for the `/fallbacks` output. */
export declare const FALLBACKS_COMMAND_LOCALES: {
    readonly zh: {
        readonly title: "当前会话 fallback 诊断（只读）";
        readonly description: "查看当前会话的降级链、最近降级切换与冷却状态（只读）";
        readonly usageConfig: "查看组合后的 fallbacks 配置（设置回读）";
        readonly usageRevertSeed: "将角色的 persona 还原为已声明的 Seed 默认";
        readonly usage: "  /fallbacks config   查看组合后的 fallbacks 配置（设置回读）\n  /fallbacks config revert-seed <role-id>   将角色的 persona 还原为已声明的 Seed 默认";
        readonly origin: "会话来源";
        readonly role: "角色";
        readonly chain: "链";
        readonly inheritRoot: "（inherit-root）";
        readonly chainNone: "未配置";
        readonly slot: "分时";
        readonly switches: "最近降级切换";
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
        readonly configTitle: "Fallbacks 配置";
        readonly configEnabled: "已启用";
        readonly configDisabled: "未启用";
        readonly configTriggerCodes: "触发码";
        readonly configRootChain: "根链";
        readonly configEmpty: "（空）";
        readonly configTimeSlots: "分时槽";
        readonly configSlotPresetItem: "{preset}（chain: {n}, window {window}）";
        readonly configSlotPresetBare: "{preset}（chain: {n}）";
        readonly configSlotCustomItem: "custom {start}-{end}（chain: {n}）";
        readonly configTz: "时区";
        readonly configRoles: "角色";
        readonly configRoleItem: "{id}（chain: {n}）";
        readonly configRules: "角色规则";
        readonly configCooldown: "冷却";
        readonly configRevert: "回主策略";
        readonly configMaxSwitches: "单步最大切换";
        readonly configAlwaysCap: "always 上限";
        readonly configPresets: "预置";
        readonly configRoleAutoMatch: "角色自动匹配";
        readonly configEdit: "编辑：/settings（TUI 设置界面）或 ~/.dsh/profiles/<profile>/cordis.patch.yml（插件行）/ $DSH_HOME/settings.yaml（fallbacks: 分节）";
        readonly configEditHint: "TUI 通过 /settings 修改配置；文件编辑仍然可用";
        readonly revertSeedOk: "角色 {id} 已还原为 Seed 默认";
        readonly revertSeedFail: "角色 {id} 未还原（{reason}）";
        readonly revertSeedError: "角色 {id} 还原失败（设置写入失败）";
        readonly revertSeedReason: {
            readonly 'not-seeded': "未声明种子";
            readonly 'row-absent': "角色行不存在";
            readonly 'settings-unavailable': "设置通道不可用";
        };
    };
    readonly en: {
        readonly title: "Session fallback diagnostics (read-only)";
        readonly description: "Inspect fallback chain, recent fallback switches, and cooldown for this session (read-only)";
        readonly usageConfig: "show the composed fallbacks config (settings readback)";
        readonly usageRevertSeed: "revert a role's persona to its declared seed default";
        readonly usage: "  /fallbacks config   show the composed fallbacks config (settings readback)\n  /fallbacks config revert-seed <role-id>   revert a role's persona to its declared seed default";
        readonly origin: "Session origin";
        readonly role: "Role";
        readonly chain: "Chain";
        readonly inheritRoot: " (inherit-root)";
        readonly chainNone: "not configured";
        readonly slot: "Time slot";
        readonly switches: "Recent fallback switches";
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
        readonly configTitle: "Fallbacks config";
        readonly configEnabled: "enabled";
        readonly configDisabled: "disabled";
        readonly configTriggerCodes: "Trigger codes";
        readonly configRootChain: "Root chain";
        readonly configEmpty: "(empty)";
        readonly configTimeSlots: "Time slots";
        readonly configSlotPresetItem: "{preset} (chain: {n}, window {window})";
        readonly configSlotPresetBare: "{preset} (chain: {n})";
        readonly configSlotCustomItem: "custom {start}-{end} (chain: {n})";
        readonly configTz: "TZ";
        readonly configRoles: "Roles";
        readonly configRoleItem: "{id} (chain: {n})";
        readonly configRules: "Rules";
        readonly configCooldown: "Cooldown";
        readonly configRevert: "Revert";
        readonly configMaxSwitches: "Max switches/step";
        readonly configAlwaysCap: "Always-mode cap";
        readonly configPresets: "Presets";
        readonly configRoleAutoMatch: "Auto-match";
        readonly configEdit: "Edit: /settings (TUI settings screen) or ~/.dsh/profiles/<profile>/cordis.patch.yml (plugin row) / $DSH_HOME/settings.yaml (fallbacks: section)";
        readonly configEditHint: "TUI edits config via /settings; file editing still works";
        readonly revertSeedOk: "role {id} reverted to its seed default";
        readonly revertSeedFail: "role {id} not reverted ({reason})";
        readonly revertSeedError: "role {id} revert failed (settings write failed)";
        readonly revertSeedReason: {
            readonly 'not-seeded': "not a seeded role";
            readonly 'row-absent': "role row absent";
            readonly 'settings-unavailable': "settings channel unavailable";
        };
    };
};
/** A locale id supported by {@link FALLBACKS_COMMAND_LOCALES}. */
export type FallbacksCommandLocale = keyof typeof FALLBACKS_COMMAND_LOCALES;
/** The `/fallbacks` subcommands: `'config'` (composed-config readback),
 * `'revert-seed'` (persona revert action, requires a role id), or `''` (the
 * bare session snapshot). */
export type FallbacksSubcommand = '' | 'config' | 'revert-seed';
/** One parsed subcommand invocation: the kind plus the optional role id
 * carried by `revert-seed`. */
export interface FallbacksSubcommandParse {
    readonly kind: FallbacksSubcommand;
    /** The role id argument of `revert-seed` (present iff `kind === 'revert-seed'`). */
    readonly arg?: string;
}
/**
 * Map an invocation's rawInput to a subcommand: trimmed `'config'` →
 * `{ kind: 'config' }`; `'config revert-seed <id>'` → `{ kind: 'revert-seed',
 * arg: id }`; everything else (incl. empty, a missing id, or an unknown
 * subcommand under `config`) → `{ kind: '' }` (bare snapshot). Lenient by
 * design — unknown input keeps today's bare behavior, never errors.
 */
export declare function parseFallbacksSubcommand(rawInput: string): FallbacksSubcommandParse;
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
 * Cap for the composed-config readback's LIST lines — Trigger codes, Root
 * chain, Time slots, Roles, and Rules (qc2 Task-2 Minor): beyond this many
 * items a line truncates with `…` while its leading count always stays the
 * FULL count. Same sanity scale as {@link RECENT_SWITCHES_LIMIT}.
 */
export declare const FALLBACKS_CONFIG_LIST_CAP = 5;
/**
 * Render the `/fallbacks config` surface (plan fallbacks-tui-client T2,
 * AC-2 + fallbacks-tui-settings Task 2 AC-4): the composed `fallbacks`
 * namespace as the runtime reads it — enriched with the time-slot rows
 * (preset rows resolve their frozen window from {@link PRESETS}), the
 * config timezone, and the role rules — plus edit hints pointing at the
 * `/settings` TUI edit surface while keeping the file-edit documentation.
 * The FIRST LINE marks the composed-config readback — distinct from the
 * diagnostic title and never merged into {@link fallbacksCommandText} (two
 * operator surfaces, product lock). Locale defaults to `zh` (the command
 * default); en dictionary tested.
 */
export declare function fallbacksConfigText(summary: FallbacksConfigSummary, locale?: FallbacksCommandLocale): string;
/**
 * Render the `/fallbacks` status surface for one snapshot. Kept minimal and
 * truthful: origin → role → chain (+ inherit tail) → current slot (分时) →
 * recent switches (降级切换) → cooldown.
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
