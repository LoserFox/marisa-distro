/**
 * dsh-llm-fallbacks client half: registers the Fallbacks card into the
 * plugin-config page's `settings.plugin.item` keyed slot (the official
 * "插件配置" settings page — key `fallbacks`, the settings namespace the card
 * edits, appearing after the upstream bash / agent-loop / web-search cards
 * and the advisor card in registration order).
 *
 * Wiring (mirrors dsh-advisor):
 * - Registers the `fallbacks` locale dictionaries (zh/en).
 * - Constructs the card's own store over the connection: the fallbacks
 *   config rides the plugin's gateway channel (`connection.rpc` →
 *   `/api/fallbacks/get|set|reset`), while `settings.describe` (writable +
 *   namespace directory) and the provider/model catalog stay on
 *   `connection.api` (see `fallbacks-store.ts`).
 * - Registers the `settings.plugin.item` card `key: 'fallbacks'` (the rc.7
 *   keyed slot — no `id`/`order`) with a business-only inject face
 *   ({@link FallbacksSettingsController} + the snapshot-selector hook); the
 *   old Settings-nav section registration is removed — deleting the section
 *   registration deletes the nav entry.
 * - Refreshes the store on pushed invalidations — the forwarded remote
 *   events `settings/document-updated` (ns-filtered to the fallbacks
 *   namespace; refetches the descriptor + recent-switch summary) and
 *   `llm/adapters-updated` (refetches only the provider/model catalog), plus
 *   the client `connection/reset` (refetches all three) — and follows the
 *   current session (`sessions.list`) so the status block's recent-switch
 *   summary tracks the session being viewed (spec §2.5 D-5). `sessions` is
 *   an optional reflection read (S-g): a host without the session service
 *   leaves the switches face in its empty ready state.
 *
 * @module dsh-llm-fallbacks/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export type { FallbacksCardInjected, FallbacksCardProps } from './FallbacksCard.tsx';
export type { GeneralFallbacksRowInjected, GeneralFallbacksRowProps } from './GeneralFallbacksRow.tsx';
export type { ConversationFallbackSwitchProps, FallbacksSwitchChatData, } from './ConversationFallbackSwitch.tsx';
export type { FallbacksSettingsState } from './fallbacks-store.ts';
export { FallbacksSettingsController, FALLBACKS_SETTINGS_NS } from './fallbacks-store.ts';
/**
 * Required services (cordis fiber inject); registrations wait on the slot
 * declaration. `conversationEvents` is declared because the D1 Definition
 * registration reads the service directly (`ctx.conversationEvents.register`
 * at the bottom of `apply` — explicit fiber-ordering parity with the
 * ui-workflow-run precedent, whose inject list includes it for the same
 * direct read). The runtime would still provide the service synchronously
 * on apply, but the declaration makes the dependency honest. `sessions` is
 * deliberately NOT injected (S-g): a non-web host without the dsh-session
 * client service must not hang the fiber waiting for it — the wiring reads
 * it reflectively and degrades to the switches empty state when absent
 * (`setCurrentSession` never called, `loadSwitches` ready with an empty
 * array, which the store already supports).
 */
export declare const inject: string[];
/**
 * Register the `fallbacks` dictionaries and the plugin-config card once the
 * `settings.plugin.item` declaration is on the ledger.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
