/**
 * dsh-tui client surface (plan fallbacks-tui-client Task 1, AC-1 +
 * fallbacks-tui-settings Task 2): registers a `tuiCommandTrees` provider
 * for the `/fallbacks` command so the dsh-tui profile's `/` menu shows the
 * command with localized descriptions and `config` → `revert-seed`
 * subcommand completion — with ZERO dsh-TUI changes.
 *
 * The service and its shapes are consumed structurally (read-only reference:
 * dsh-TUI @ 557a27a, `src/dsh-adapter/command-trees.ts` +
 * `src/commands.ts`): the three types below are minimal local copies of the
 * host's `TuiCommandTreeProvider` / `LocalizedDescriptions` /
 * `CommandCompletionNode`, so no `@deepseek-harness-tui/dsh-tui` peer is
 * needed (plan constraint: zero new peer/dependency).
 *
 * Copy comes from the single command copy source: root descriptions reuse
 * `FALLBACKS_COMMAND_LOCALES.*.description`; the `config` completion node
 * reuses the `usageConfig` key (the same key Task 2's USAGE line consumes).
 */
import type { Context } from '@deepseek-ai/cordis';
/** Localized copy map for a tree row (host `LocalizedDescriptions` shape). */
export type TuiLocalizedDescriptions = Readonly<Partial<Record<'zh' | 'en', string>>>;
/** One child in a slash-command tree (host `CommandCompletionNode` shape). */
export interface TuiCommandCompletionNode {
    name: string;
    aliases?: readonly string[];
    description: string;
    descriptions?: TuiLocalizedDescriptions;
    tag?: string;
    /** Optional i18n key; plugin nodes normally rely on fallback text. */
    descriptionKey?: string;
}
/** A `tuiCommandTrees` provider (host `TuiCommandTreeProvider` shape). */
export interface TuiCommandTreeProvider {
    /** Root command name without `/`. Must match the command registry entry. */
    root: string;
    /** Provider-owned translations for the root command row. */
    descriptions?: TuiLocalizedDescriptions;
    /** Children for the full canonical path, including `root` at index zero. */
    children(canonicalPath: readonly string[]): readonly TuiCommandCompletionNode[];
}
/** The provider's root — matches the command registry entry name `fallbacks`. */
export declare const FALLBACKS_TUI_ROOT = "fallbacks";
/**
 * Register the `/fallbacks` provider on the optional `tuiCommandTrees`
 * service. First-fiber-only (`serviceOwned === true` — mirrors the
 * gateway/typert multi-fiber dedupe; the host registry throws on duplicate
 * roots, so a deduped later fiber must never register). The service is
 * optional: a composition without `dsh-tui-command-trees` keeps the plugin
 * working and simply omits the TUI surface.
 *
 * The inject child returns the registry disposer so cordis withdraws the
 * registration when this fiber (or the service) goes away.
 */
export declare function installTuiClient(ctx: Context, opts: {
    serviceOwned: boolean;
}): void;
