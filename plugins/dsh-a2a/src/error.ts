/**
 * Domain errors for the a2a seam. Wire and registry failures carry a stable
 * machine-routable code; route on `code`, never by parsing `message`.
 * @module @dpskh/a2a/error
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/** Stable machine-routable failure codes for the a2a seam. */
export type A2aErrorCode =
  | 'A2A_DUPLICATE_PEER'
  | 'A2A_DUPLICATE_PROVIDER'
  | 'A2A_CLIENT_CONFIGURED_MISSING'
  | 'A2A_CLIENT_CONFIGURED_UNAVAILABLE'
  | 'A2A_CLIENT_AMBIGUOUS'
  | 'A2A_CLIENT_UNAVAILABLE'
  | 'A2A_CLIENT_TRANSPORT'
  | 'A2A_CLIENT_CONNECT'
  | 'A2A_HTTP_INTERFACE'
  | 'A2A_HTTP_STATUS'
  | 'A2A_HTTP_TRANSPORT'
  | 'A2A_INVALID_AGENT_CARD'
  | 'A2A_INVALID_TASK'
  | 'A2A_INVALID_MESSAGE'
  | 'A2A_INVALID_PAYLOAD'
  | 'A2A_INVALID_JSONRPC'
  | 'A2A_BAD_REQUEST'
  | 'A2A_REGISTRY'
  | 'A2A_PROJECT_CONFLICT'
  | 'A2A_UNKNOWN_PROJECT'
  | 'A2A_NAME_IN_USE'
  | 'A2A_MESSAGE_ID_CONFLICT'
  | 'A2A_UNKNOWN_REPLY'
  | 'A2A_PAYLOAD_TOO_LARGE'
  | 'A2A_MESSAGE_REJECTED'
  | 'A2A_PROTOCOL_MISMATCH'
  | 'A2A_CLAIM_REJECTED'
  | 'A2A_INVALID_FRAME'
  | 'A2A_RECIPIENT_NOT_PRESENT'

/**
 * A wire-format or registry failure in the a2a seam.
 * @param message - human-readable failure description.
 * @param code - stable failure class for programmatic routing.
 * @param options - standard `Error` options (`cause` chaining).
 */
export class A2aError extends HarnessError {
  override readonly code: A2aErrorCode

  constructor(message: string, code: A2aErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.code = code
  }
}
