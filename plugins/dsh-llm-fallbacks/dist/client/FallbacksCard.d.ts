/**
 * Fallbacks settings card — the `fallbacks` plugin card on the web settings
 * "插件配置" page (spec §4). Registered into the `settings.plugin.item` slot
 * (id `fallbacks`, order 30, alongside the upstream bash/agent-loop/web-search
 * cards and the advisor card); owner props are empty and all data flows
 * through {@link FallbacksSettingsController}.
 *
 * The card chrome replicates the upstream `PluginCard` contract (self-drawn:
 * the upstream client value face exports no reusable card): a collapsible
 * `<li>` whose header is a button stacking the plugin name over its
 * description, with a dirty "unsaved" pill and a rotating chevron
 * (`IconChevronDownOutline14` from ui-primitives — a CLIENT_EXTERNALS value
 * import), `aria-expanded`/`aria-label` like the upstream header; a divider
 * under the header; then the form content; then a footer with
 * Discard / Reset / Save carrying the upstream disabled semantics — save =
 * `!dirty || saving || !writable`, discard = `!dirty || saving` (KD-U1).
 * Disclosure is card-local state: which card a user has open is a reading
 * gesture, and staged edits outlive collapsing — the pill rides the header
 * (upstream rationale).
 *
 * The form body is the two-block editing surface (spec §8): the `enabled`
 * checkbox row, the 6 top-level scalar fields (trigger codes / revert
 * policy / three numeric fields), the `rootChain` block (block 1 — the
 * root agent's single chain, no key input), and the roles block (block 2 —
 * declared role entity cards from `roles.list` plus the rule rows from
 * `roles.rules`, whose role field is a dropdown bound to the declared ids
 * + the built-in `inherit`, same-page live). Saving runs `validateDraft`
 * first — id format/reserved word/duplicates, undeclared rule role
 * references, and illegal selectors block the write with a validation
 * banner + inline red borders (never touching the store error path); a
 * non-empty `state.legacyKeys` renders the migration banner at the top of
 * the card body. The row editors keep their filled editorCard surface
 * inside the card, with `--dsw-alias-*` tokens throughout. The reset-
 * to-defaults confirmation stays a `Modal` (the delete-confirm pattern of
 * the Models page) — no `window.confirm`.
 *
 * The page-only chrome is gone (720px column wrapper, title/intro banners,
 * page-bottom status block): the AC-7 read-only status (derived effective
 * model + recent-switch summary) is folded into the card body above the
 * footer, and the plugin-config section owns the column width.
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
 * retry (the single `state.error` surface covers both, unlike the advisor's
 * separate apply-failure hints).
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
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-web-react';
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
