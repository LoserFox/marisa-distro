/**
 * Friendly message references: `<project>:<sequence>` points at one
 * immutable message in a project's history without exposing raw msgIds.
 * Project-scoped (protocol version 3), unlike the v2 per-recipient streams.
 * @module @dpskh/a2a/hub/message-ref
 */

/** Project name rule, shared with the server boundary. */
export const PROJECT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/

/** Roster name rule, shared with the server boundary. */
export const AGENT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/

/**
 * Format the friendly reference of one message.
 * @param project - the project name.
 * @param sequence - the message's project sequence.
 * @returns the reference, e.g. `demo:42`.
 * @throws when the components cannot form a valid reference.
 */
export function formatMessageRef(project: string, sequence: number): string {
  if (!PROJECT_NAME_RE.test(project) || !Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error('invalid message reference components')
  }
  return `${project}:${sequence}`
}

/**
 * Parse a friendly reference.
 * @param ref - the reference to parse.
 * @returns the project and sequence, or `null` when malformed.
 */
export function parseMessageRef(ref: string): { project: string; sequence: number } | null {
  const colon = ref.lastIndexOf(':')
  if (colon <= 0 || colon === ref.length - 1) return null
  const project = ref.slice(0, colon)
  const sequenceText = ref.slice(colon + 1)
  if (!PROJECT_NAME_RE.test(project) || !/^[1-9]\d*$/.test(sequenceText)) return null
  const sequence = Number(sequenceText)
  if (!Number.isSafeInteger(sequence)) return null
  return { project, sequence }
}
