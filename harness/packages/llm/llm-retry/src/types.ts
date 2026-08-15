import type { LlmFailure } from '@deepseek-ai/dsh-llm/types'

/** Durable payload recorded before one provider-routed model-request retry wait. */
export type LlmRetryEventData =
  | {
    turn: number
    step: number
    provider: string
    mode: 'normal'
    policyKey: string
    retry: number
    maxRetries: number
    delayMs: number
    failure: LlmFailure
  }
  | {
    turn: number
    step: number
    provider: string
    mode: 'always'
    policyKey: string
    retry: number
    delayMs: number
    failure: LlmFailure
  }
