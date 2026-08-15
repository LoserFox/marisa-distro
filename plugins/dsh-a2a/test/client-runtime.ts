/** Minimal production-shaped client runtime used by standalone plugin specs. */
import type { Context } from '@deepseek-ai/cordis'

export interface SnapshotStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
  update(mutator: (state: T) => void): void
}

export function createSnapshotStore<T>(initial: T): SnapshotStore<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    update: (mutator) => {
      const next = { ...state }
      mutator(next)
      state = next
      for (const listener of listeners) listener()
    },
  }
}

export function defineStore<S, A extends Record<string, (state: S, ...args: never[]) => void>>(definition: {
  init(): S
  actions: A
}) {
  return {
    create() {
      const store = createSnapshotStore(definition.init())
      const actions = Object.fromEntries(Object.entries(definition.actions).map(([name, action]) => [
        name,
        (...args: never[]) => { store.update(state => { action(state, ...args) }) },
      ])) as { [K in keyof A]: (...args: Tail<Parameters<A[K]>>) => void }
      return { ...store, actions }
    },
  }
}

type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : never

type SlotOptions = {
  name: string
  children?: Record<string, unknown>
  inject?: unknown
  locale?: string
  [key: string]: unknown
}
type SlotEntry = { options: SlotOptions; inject?: unknown; locale?: string; component: unknown }

export class SlotRegistry {
  private readonly entriesByName = new Map<string, SlotEntry[]>()
  private readonly specs = new Map<string, unknown>()
  private readonly listeners = new Map<string, Set<() => void>>()

  constructor(private readonly ctx: Context) {
    ctx.provide('slots', this as never)
  }

  register(options: SlotOptions, component: unknown): () => void {
    if (options.name !== 'root' && !this.specs.has(options.name)) {
      throw new Error(`slot "${options.name}" is not declared`)
    }
    const entry: SlotEntry = { options, component, ...(options.inject === undefined ? {} : { inject: options.inject }), ...(options.locale === undefined ? {} : { locale: options.locale }) }
    const entries = this.entriesByName.get(options.name) ?? []
    entries.push(entry)
    this.entriesByName.set(options.name, entries)
    for (const [name, spec] of Object.entries(options.children ?? {})) this.specs.set(name, spec)
    this.notify(options.name)
    return () => {
      const current = this.entriesByName.get(options.name)
      if (current !== undefined) this.entriesByName.set(options.name, current.filter(candidate => candidate !== entry))
      for (const name of Object.keys(options.children ?? {})) this.specs.delete(name)
      this.notify(options.name)
    }
  }

  inject(name: string, register: () => () => void): void {
    if (!this.specs.has(name)) throw new Error(`slot "${name}" is not declared`)
    this.ctx.effect(register)
  }

  entries(name: string): SlotEntry[] {
    return [...(this.entriesByName.get(name) ?? [])]
  }

  spec(name: string): unknown {
    return this.specs.get(name)
  }

  subscribe(name: string, listener: () => void): () => void {
    const listeners = this.listeners.get(name) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(name, listeners)
    return () => { listeners.delete(listener) }
  }

  private notify(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener()
  }
}
