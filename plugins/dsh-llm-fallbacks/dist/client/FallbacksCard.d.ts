/**
 * Fallbacks settings card — the `fallbacks` plugin card on the web settings
 * "插件配置" page (spec §4). Registered into the `settings.plugin.item` keyed
 * slot (key `fallbacks`, the settings namespace the card edits, alongside
 * the upstream bash/agent-loop/web-search cards and the advisor card, in
 * registration order); owner props are empty and all data flows
 * through {@link FallbacksSettingsController}.
 *
 * The card chrome replicates the upstream `PluginCard` contract (self-drawn:
 * the upstream client value face exports no reusable card): a collapsible
 * `<li>` whose header is a button stacking the plugin name over its
 * description, with a dirty "unsaved" pill and a rotating chevron
 * (`IconChevronDownOutline14` from ui-primitives — a CLIENT_EXTERNALS value
 * import), `aria-expanded`/`aria-label` like the upstream header; a divider
 * under the header; then the form content. PR #62 UX round 2: the card
 * footer is gone — each big section (主代理 / 子代理 / 高级选项) carries its
 * own Save/Discard actions beside its heading (高级选项: inside the expanded
 * body) and its own validation / save-error surface. PR #62 UX round 3:
 * each section's Save writes ONLY that section's fields — 主代理 owns
 * rootChain / timeSlots / tz (+ the card-level `enabled`), 子代理 owns
 * roles, 高级选项 owns the advanced scalars; the patch spreads the last
 * ACCEPTED config for every other section, so a 主代理 Save can never
 * ride along an unsaved 子代理 edit (and vice versa) — and validation /
 * the dirty gate apply per section too (a bad role id never blocks 主代理,
 * and only the saved section's Discard reverts that section's edits).
 * Save/discard disabled terms: save = `!sectionDirty || saving ||
 * !writable`, discard = `!sectionDirty || saving` (KD-U1). Disclosure is
 * card-local state:
 * which card a user has open is a reading gesture, and staged edits outlive
 * collapsing — the pill rides the header (upstream rationale).
 *
 * The form body is the two-block editing surface (spec §8): the `enabled`
 * checkbox row, the 6 top-level scalar fields (trigger codes / revert
 * policy / three numeric fields), the `rootChain` block (block 1 — the
 * root agent's single chain, no key input), and the roles block (block 2 —
 * declared role entity cards from `roles.list` plus the rule rows from
 * `roles.rules`, whose role field is a dropdown bound to the declared ids
 * + the built-in `inherit`, same-page live). Saving runs `validateDraft`
 * first — id format/reserved word/duplicates, undeclared rule role
 * references, illegal selectors, and a role with no chain entries (no
 * model config) block the write with a validation banner + inline red
 * borders / hints (never touching the store error path); a
 * non-empty `state.legacyKeys` renders the migration banner at the top of
 * the card body. The row editors keep their filled editorCard surface
 * inside the card, with `--dsw-alias-*` tokens throughout. The reset-
 * to-defaults affordance is GONE from the card (PR #62 UX round 3) — the
 * gateway RPC `fallbacks/reset` and the store `resetToDefaults()` stay as
 * host APIs (store/gateway tests unchanged), only the card UI was removed.
 *
 * The page-only chrome is gone (720px column wrapper, title/intro banners,
 * page-bottom status block): the AC-7 read-only status (derived effective
 * model + recent-switch summary) is folded into the card body, and the
 * plugin-config section owns the column width.
 *
 * Degraded/error/loading states keep the same card chrome (KD-U3): the
 * header always renders title+description+chevron, and the body carries the
 * config-channel notice or the load error. A card that cannot reach the
 * `fallbacks/get` gateway channel (`ready && !present`) keeps the USABLE
 * skeleton — the form stays writable and saves are attempted (KD-G5) — with
 * the `unavailable` notice ALWAYS visible (derived open — the header cannot
 * collapse it away), while a healthy card is collapsed until the user
 * expands it (AC-1, the documented divergence from upstream whose
 * unavailable card renders nothing). A hard load failure (`status ===
 * 'error'`) also forces the body open with an error notice and — when the
 * form is inert (`!writable`, i.e. the load never landed) — a Retry button;
 * a save failure keeps the editable form so the Save action itself is the
 * retry. PR #62 UX round 2: the single `state.error` surface is split by
 * origin — a LOAD failure keeps the card-top notice (with Retry when
 * inert), while a WRITE failure renders under the section whose Save was
 * last clicked (`lastSaveSection`), unlike the advisor's separate
 * apply-failure hints.
 *
 * The degraded derivation is latched in the card (the store stays untouched):
 * `present` only ever changes inside the store's `accept()`, so the settled
 * `ready` read is authoritative, and a card-local latch carries that value
 * through refresh/save windows (`loading`/`saving`) so the notice body can
 * never collapse mid-refresh (the advisor's latched `degraded` field,
 * implemented without a store change); on a first mount the latch is false,
 * so the healthy card starts (and stays) collapsed through its first load.
 */
import type { ReactNode } from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots';
import { FallbacksSettingsController, type FallbacksSettingsState } from './fallbacks-store.ts';
/** Injected dependencies of {@link FallbacksCard} (slot `inject`). */
export interface FallbacksCardInjected {
    /** The card store (loaded on mount, refreshed on pushed invalidations). */
    controller: FallbacksSettingsController;
    /** uSES subscription hook bound to the store (inject face — advisor pattern). */
    useSnapshot: SnapshotSelectorHook<FallbacksSettingsState>;
}
/** Props delivered by the slot outlet: runtime share + locale seat + inject face. */
export type FallbacksCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'fallbacks'> & FallbacksCardInjected;
/**
 * Render the Fallbacks settings card inside the plugin-config section,
 * replicating the upstream PluginCard chrome (KD-U1). The body carries the
 * existing form content unchanged plus the folded-in status block and the
 * footer actions (Discard / Reset / Save).
 * @param props - slot-delivered injected dependencies and the synthesized t seat.
 * @returns the card.
 */
export declare function FallbacksCard({ controller, useSnapshot, t }: FallbacksCardProps): ReactNode;
