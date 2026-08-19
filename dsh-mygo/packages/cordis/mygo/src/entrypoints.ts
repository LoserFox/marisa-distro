/**
 * The `ctx.entrypoints` aggregation service (Fabric `EntrypointStorage`
 * 对照): many-to-one static contribution channel. Any managed plugin may
 * declare contributions in its manifest; the owner of a key — and only the
 * owner — registers the per-key `adapt` through `define`. Contributions under
 * an undefined key stay inert and inspectable, never adapted. Order is the
 * registration order of the declaring plugins; withdrawal is per-generation
 * and atomic with HMR swaps.
 * @module @r05en1cu/dsh-mygo/src/entrypoints
 */

import type { Context } from '@deepseek-ai/cordis'

/** One aggregated contribution returned by `get(key)`. */
export interface EntrypointContribution<T = unknown> {
  /** Adapted value ready for the key's consumer. */
  readonly value: T
  /** The manifest declaration as written. */
  readonly raw: unknown
  /** Contributing plugin id. */
  readonly provider: string
}

/** The Cordis service surface published as `ctx.entrypoints`. */
export interface EntrypointsService {
  /**
   * Own key `K`: register the adapt function turning raw contributions into
   * typed values. Re-defining a key replaces the adapter and re-adapts every
   * pending contribution; a throwing adapt fails the caller loudly with the
   * contributing provider named.
   * @param key - extension-point key this plugin owns.
   * @param adapt - per-key adaptation (the instantiation logic lives with
   * the owner, never with string notation).
   */
  define<T>(key: string, adapt: (value: unknown, ctx: Context) => T): void
  /**
   * Aggregated contributions for one key in declaring-plugin registration
   * order. Contributions under an undefined key are returned with
   * `value === raw` (inert).
   */
  get<T>(key: string): readonly EntrypointContribution<T>[]
  /** Every defined key plus every key with pending contributions, sorted. */
  keys(): readonly string[]
}

interface EntryRecord {
  readonly token: number
  readonly provider: string
  readonly raw: unknown
  value: unknown
}

/**
 * Backing table for {@link EntrypointsService}. The lifecycle engine holds
 * one instance per manager, registers contributions on generation activation
 * (by token), and withdraws exactly those tokens on generation disposal.
 */
export class EntrypointsTable implements EntrypointsService {
  private readonly adapters = new Map<string, (value: unknown, ctx: Context) => unknown>()
  private readonly contributions = new Map<string, EntryRecord[]>()
  private nextToken = 1

  constructor(private readonly ctx?: Context) {}

  define<T>(key: string, adapt: (value: unknown, ctx: Context) => T): void {
    const previous = this.adapters.get(key)
    this.adapters.set(key, adapt as (value: unknown, ctx: Context) => unknown)
    try {
      for (const record of this.contributions.get(key) ?? []) {
        record.value = this.runAdapt(key, record)
      }
    } catch (error) {
      // Roll the adapter back and re-adapt with it so the table stays
      // consistent: the new owner's define call fails loudly instead.
      if (previous === undefined) this.adapters.delete(key)
      else this.adapters.set(key, previous)
      for (const record of this.contributions.get(key) ?? []) {
        record.value = this.runAdapt(key, record)
      }
      throw error
    }
  }

  get<T>(key: string): readonly EntrypointContribution<T>[] {
    return [...(this.contributions.get(key) ?? [])].map(record => ({
      value: record.value as T,
      raw: record.raw,
      provider: record.provider,
    }))
  }

  keys(): readonly string[] {
    const keys = new Set<string>(this.adapters.keys())
    for (const key of this.contributions.keys()) keys.add(key)
    return [...keys].sort()
  }

  /**
   * Register one contribution; returns an opaque token the owner must pass to
   * {@link removeToken} on generation disposal. A throwing adapt fails the
   * contributing generation's activation (attribution in the error).
   */
  add(provider: string, key: string, raw: unknown): unknown {
    const token = this.nextToken
    this.nextToken += 1
    const record: EntryRecord = {
      token,
      provider,
      raw,
      value: raw,
    }
    const list = this.contributions.get(key) ?? []
    list.push(record)
    this.contributions.set(key, list)
    if (this.adapters.has(key)) {
      try {
        record.value = this.runAdapt(key, record)
      } catch (error) {
        const index = list.indexOf(record)
        if (index >= 0) list.splice(index, 1)
        if (list.length === 0) this.contributions.delete(key)
        throw error
      }
    }
    return token
  }

  /** Withdraw exactly one previously registered contribution. */
  removeToken(token: unknown): void {
    for (const [key, list] of this.contributions) {
      const index = list.findIndex(record => record.token === token)
      if (index < 0) continue
      list.splice(index, 1)
      if (list.length === 0) this.contributions.delete(key)
      return
    }
  }

  private runAdapt(key: string, record: EntryRecord): unknown {
    const adapt = this.adapters.get(key)
    if (adapt === undefined) return record.raw
    try {
      return adapt(record.raw, this.ctx as Context)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `entrypoint "${key}"：插件 ${record.provider} 的贡献无法适配（${message}）`,
      )
    }
  }
}
