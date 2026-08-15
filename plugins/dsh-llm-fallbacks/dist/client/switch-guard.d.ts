import type { FallbacksSwitchEventData } from '../events.ts';
/**
 * True when `value` is a well-formed `fallbacks/switch` payload — the ONE
 * client-side shape guard, shared by the conversation node definition's
 * `match`/`start` and the renderer's degrade check (both in
 * `src/client/ConversationFallbackSwitch.tsx`).
 *
 * The durable session log is append-only and survives plugin/host upgrades,
 * so a `fallbacks/switch` event or node payload may carry a stale or
 * corrupted shape — version skew must degrade the transcript line (a
 * title-only notice), never crash the session assembly or the renderer.
 *
 * The HOST-side mirror (`src/commands.ts` `isFallbacksSwitchData`) lives in
 * a DIFFERENT bundle (host vs client) — it intentionally stays separate; do
 * not merge the two guards across the bundle boundary.
 */
export declare function isFallbacksSwitchData(value: unknown): value is FallbacksSwitchEventData;
