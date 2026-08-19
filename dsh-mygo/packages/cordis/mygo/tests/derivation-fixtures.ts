/**
 * Shared pure-derivation fixtures for the #13 suites.
 */

import type { PluginDeclarationInput, SlotKind } from '@r05en1cu/dsh-mygo'

/** A derived-position plugin with optional transform declarations. */
export function plugin(
  id: string,
  options: {
    readonly transform?: {
      readonly event: string
      readonly reads?: string[]
      readonly writes?: string[]
      readonly appends?: string[]
    }[]
    readonly intercept?: { readonly event: string; readonly returns: string[] }[]
    readonly claims?: string[]
    readonly position?: 'outermost' | 'derived' | 'innermost'
    readonly scopes?: readonly string[]
    readonly enabled?: boolean
    readonly origin?: 'static' | 'runtime-api'
    readonly requires?: string[]
    readonly provides?: string[]
  } = {},
): PluginDeclarationInput {
  const base: Omit<PluginDeclarationInput, 'scopes' | 'enabled' | 'origin'> = {
    id,
    permissions: {
      observe: [],
      transform: options.transform ?? [],
      intercept: options.intercept ?? [],
      position: options.position ?? 'derived',
      claims: options.claims ?? [],
    },
    requires: options.requires ?? [],
    provides: options.provides ?? [],
  }
  return {
    ...base,
    ...(options.scopes === undefined ? {} : { scopes: options.scopes }),
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
  }
}

/** The two real slot classifications used across the suites. */
export const SLOT_KINDS: ReadonlyMap<string, SlotKind> = new Map([
  ['system-prompt/assemble.sections', 'host-sorted'],
  ['tools/post-execute.additionalContexts', 'chain-ordered'],
])
