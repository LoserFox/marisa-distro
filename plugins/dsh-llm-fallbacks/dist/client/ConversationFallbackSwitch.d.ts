/**
 * Conversation-level fallback-switch visibility (plan fallbacks-aux-seams,
 * task 2, D1+D2 seam).
 *
 * Every `fallbacks/switch` session event becomes its own chat-transcript
 * node (`fallbacks-switch`), rendered as a compact system-style line at the
 * switch's event seq — the user sees the recovery happen in place
 * (provider/model A → B, role · reason), instead of the event existing only
 * in the raw `sessions.history` event feed (it is NOT a SurfaceEventType,
 * so the `unknown-surface` fallback never picked it up and the transcript
 * showed nothing).
 *
 * Contract notes (dsh-private, verified 2026-08-12):
 * - D1 registry: `ConversationEventRegistry.register(definition)` — service
 *   on the client Context (`runtime/src/client/index.ts:171,189-192`);
 *   external registration precedent `ui-workflow-run/src/client/index.ts:18-28`.
 *   The engine feeds EVERY session event to each definition's `match`
 *   (`runtime/src/client/sessions/conversation-assembler.ts:370-382`) —
 *   non-surface plugin events included — and the client session appends live
 *   events into the engine (`sessions/session.ts:673` `conversation.append`).
 * - D2 seat: `conversation.chat.node` is a keyed seat dispatched by
 *   `ChatConversationViewNode.kind` (`ui-conversation contract/slots.ts:56-63`;
 *   `chat/ChatNodeSeat.tsx:48-51`), externally registrable as
 *   `{ name, key, locale }` (precedents: ui-tool `tool-call`, ui-goal
 *   `command-input`, ui-workflow-run `workflow-run`).
 * - Purity: this file only type-imports `@deepseek-ai/dsh-client-runtime/client`
 *   and `@deepseek-ai/dsh-client-ui-conversation/client` (both erased at
 *   build); the renderer self-draws on `--dsw-alias-*` tokens. Render-only:
 *   the Definition is a pure view contribution — no message construction,
 *   no model-context injection (C4 excluded by scope).
 */
import type { ReactNode } from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client';
import type { FallbackSwitchReason } from '../events.ts';
/** Final chat payload of one decided fallback switch (snapshot of the event). */
export interface FallbacksSwitchChatData {
    readonly seq: number;
    readonly time: number;
    readonly turn: number;
    readonly step: number;
    /** The model the request was using when the switch was decided. */
    readonly from: {
        readonly provider: string;
        readonly model: string;
    };
    /** The chain candidate the switch moves to. */
    readonly to: {
        readonly provider: string;
        readonly model: string;
    };
    /** The fallback-chain role the decision resolved for the agent. */
    readonly role: string;
    readonly reason: FallbackSwitchReason;
}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
    interface ChatNodeDataMap {
        /** One decided fallback provider/model switch, rendered at its event seq. */
        'fallbacks-switch': FallbacksSwitchChatData;
    }
}
/**
 * One switch event → one chat node. Each `fallbacks/switch` event is its own
 * Context (id = event seq — the durable unique key), so every match is a
 * `start`; `update` is a passthrough (no aggregation — D3's per-Turn
 * counting is a separate, unselected seam).
 */
export declare const fallbackSwitchDefinition: ConversationNodeDefinition<FallbacksSwitchChatData>;
/**
 * Props delivered by the keyed chat-node seat: runtime share + the `fallbacks` locale seat.
 */
export type ConversationFallbackSwitchProps = PropsRuntime<'conversation.chat.node', 'fallbacks-switch'> & PropsLocale<'fallbacks'>;
/**
 * Render one fallback switch as a compact system-style transcript line.
 *
 * Geometry follows the upstream chat system rows (the compaction boundary
 * notice: warning-toned title + separator + ellipsized summary —
 * `chat/MessageItem .module.css:38-122`); every color resolves through a
 * `--dsw-alias-*` token. A reason outside the current union renders raw (forward-compatible
 * durable log, same rule as the card/general row summaries). A malformed or
 * partial payload (version skew) degrades to the title-only line instead of
 * throwing during interpolation — the transcript slot stays visible with the
 * warning-toned "model downgraded" title (T1 copy) and no summary details.
 * @param props - composed keyed seat props.
 * @returns the switch line element tree.
 */
export declare function ConversationFallbackSwitch({ node, t }: ConversationFallbackSwitchProps): ReactNode;
