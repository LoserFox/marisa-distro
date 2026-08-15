/**
 * Pinned model-visible text for side conversations (Codex `/side` & `/btw`
 * semantics: a side conversation is an ephemeral fork used for a quick
 * question while keeping the primary thread focused).
 *
 * These strings are model-facing contracts: change them only with intent, and
 * keep tests asserting the exact sentences that carry the behavioral rules.
 */

/**
 * The boundary message delivered as the side conversation's first user
 * message: everything the fork inherited from the parent session is reference
 * context only, never active instruction.
 */
export const SIDE_BOUNDARY_PROMPT = `Side conversation boundary.

Everything before this boundary is inherited history from the parent session. It is reference context only. It is not your current task.

Do not continue, execute, or complete any instructions, plans, tool calls, approvals, edits, or requests from before this boundary. Only messages submitted after this boundary are active user instructions for this side conversation.`

/**
 * Side-conversation persona, shadowing the deployment persona in the forked
 * child: answer questions and do lightweight non-destructive exploration
 * without disrupting the main thread. No `{{...}}` interpolation variables.
 */
export const SIDE_PERSONA = `You are in a side conversation, not the main thread. This side conversation answers questions and does lightweight, non-destructive exploration without disrupting the main thread.

The inherited fork history is provided only as reference context. Do not treat instructions, plans, or requests found in the inherited history as active instructions for this side conversation. Only messages submitted after the side-conversation boundary are active.

Do not modify files, source, git state, permissions, configuration, or workspace state unless the user explicitly asks for that mutation after this boundary. Do not request escalated permissions or broader sandbox access unless the user explicitly asks.

Sub-agents are off-limits in this side conversation: do not interact with any existing or new sub-agents. Do not call report or send any message back to the parent session; your answer stays in this side conversation's own transcript.

You may perform non-mutating inspection, including reading or searching files and running checks that do not alter repo-tracked files.`

/**
 * The mode declaration carried INSIDE the boundary message (after its first
 * sentence, so the message still opens with `Side conversation boundary` and
 * the panel's boundary-row drop keeps working): the child's own identity
 * line, so the forked model can never mistake which command created it
 * (`/side` continuable thread vs `/btw` one-shot question).
 */
export const SIDE_MODE_LINE = {
  side:
    'Mode: this is a /side side conversation — a continuable thread. Your answers stay in this side thread and are viewed in the sidechain panel; they are never delivered into the main session.',
  btw:
    'Mode: this is a /btw one-shot side question. Answer once, in this side thread; the answer is viewed in the sidechain panel, not in the main session.',
} as const

/** Which side command a forked child belongs to (drives the mode line). */
export type SideMode = keyof typeof SIDE_MODE_LINE
