/**
 * Mount-time validation chain (§16 group 1/2). Every rejection is a
 * `PluginError` whose code, message, and details come from the dsh-mygo-api
 * vocabulary; `pluginId` is always attributed to the source definition.
 * The harness event vocabulary is the generated `EVENT_VOCABULARY` — no
 * handwritten allowlist — and property/branch names resolve against each
 * event's real return type from the same Typert projection.
 * @module @r05en1cu/dsh-mygo/src/mount
 */

import { PluginError, formatPluginError } from '@r05en1cu/dsh-mygo-api'
import type {
  PluginDefinition,
  PluginErrorCode,
} from '@r05en1cu/dsh-mygo-api'
import { EVENT_VOCABULARY } from './event-vocabulary.ts'
import type { PluginEventVocabularyEntry } from './event-vocabulary.ts'
import { validateManifest } from './manifest.ts'
import type {
  MountValidationOptions,
  MountValidationResult,
} from './types.ts'

/** Permission-level ladder used only for mode ceilings (observe < transform < intercept < claims). */
type PermissionLevel = 'observe' | 'transform' | 'intercept' | 'claims'

/** Mode → maximum declared permission level (§7, #7-correction: serial allows intercept, never transform). */
const MODE_CEILING: Readonly<Record<string, PermissionLevel>> = {
  emit: 'observe',
  parallel: 'observe',
  serial: 'intercept',
  waterfall: 'transform',
}

/**
 * Validate one plugin manifest and declaration set at mount time (§16 group
 * 1/2). The first violation throws; a successful pass returns warnings the
 * caller must surface (16.4), currently only the `development-mode`
 * provenance bypass (SEC:158).
 * @param definition - the plugin manifest to mount.
 * @param options - source, channel identity/ceiling, grants, and deployment policy inputs.
 * @returns non-fatal warnings for the caller to log.
 */
export function validateMount(
  definition: PluginDefinition,
  options: MountValidationOptions,
): MountValidationResult {
  validateManifest(definition)
  const id = definition.id
  const vocabulary = options.vocabulary ?? EVENT_VOCABULARY
  const byEvent = new Map(vocabulary.map(entry => [entry.name, entry]))
  const warnings: string[] = []
  const customExact = new Set<string>()
  const customPatterns: string[] = []
  for (const entry of definition.events ?? []) {
    if (entry.endsWith('/*')) {
      const namespace = entry.slice(0, -2)
      if (!/^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*$/.test(namespace)) {
        throw fail('manifest-invalid', {
          plugin: id,
          field: 'events',
          cause: `event pattern "${entry}" must be a valid namespace followed by /*`,
        }, id)
      }
      if (vocabulary.some(entry2 => entry2.name.startsWith(`${namespace}/`))) {
        throw fail('manifest-invalid', {
          plugin: id,
          field: 'events',
          cause: `event namespace "${namespace}/*" overlaps the harness vocabulary`,
        }, id)
      }
      customPatterns.push(namespace)
    } else if (byEvent.has(entry)) {
      throw fail('manifest-invalid', {
        plugin: id,
        field: 'events',
        cause: `event "${entry}" is reserved by the harness vocabulary`,
      }, id)
    } else {
      customExact.add(entry)
    }
  }
  for (const declaration of [...definition.permissions.transform, ...definition.permissions.intercept]) {
    if (customExact.has(declaration.event) || customPatterns.some(namespace => declaration.event.startsWith(`${namespace}/`))) {
      throw fail('manifest-invalid', {
        plugin: id,
        field: 'events',
        cause: `custom event "${declaration.event}" is observe-only (no transform/intercept declarations)`,
      }, id)
    }
  }

  // 组 1：manifest 与声明校验（fiber 建立前）
  for (const event of declaredEvents(definition)) {
    if (customExact.has(event)) continue
    const entry = byEvent.get(event)
    if (entry === undefined) {
      throw fail('event-not-mountable', { event, tier: 'harness' }, id)
    }
  }
  for (const declaration of definition.permissions.transform) {
    // Reachability of every declared event was established above.
    const entry = byEvent.get(declaration.event) as PluginEventVocabularyEntry
    if (entry.mode !== 'waterfall') {
      throw fail('mode-ceiling-exceeded', {
        event: declaration.event,
        mode: 'transform',
        // `entry.mode !== 'waterfall'` narrows to emit/parallel/serial, all
        // present in MODE_CEILING; noUncheckedIndexedAccess keeps the union.
        ceiling: MODE_CEILING[entry.mode],
      }, id)
    }
    validatePropertyNames(declaration.event, declaration.reads ?? [], entry, id)
    validatePropertyNames(declaration.event, declaration.writes ?? [], entry, id)
    validatePropertyNames(declaration.event, declaration.appends ?? [], entry, id)
  }
  for (const declaration of definition.permissions.intercept) {
    const entry = byEvent.get(declaration.event) as PluginEventVocabularyEntry
    if (entry.mode === 'emit' || entry.mode === 'parallel') {
      throw fail('mode-ceiling-exceeded', {
        event: declaration.event,
        mode: 'intercept',
        ceiling: 'observe',
      }, id)
    }
    for (const branch of declaration.returns) {
      if (!(entry.branches ?? []).includes(branch)) {
        throw fail('unknown-property', {
          event: declaration.event,
          name: branch,
          valid: entry.branches ?? [],
        }, id)
      }
    }
  }
  for (const entry of [...definition.requires, ...definition.provides]) {
    if (entry.includes('@')) {
      throw fail('capability-range-reserved', { entry, note: 'v2 name@range' }, id)
    }
  }

  for (const declaration of definition.permissions.transform) {
    for (const name of declaration.writes ?? []) {
      const field = `${declaration.event}.${name}`
      if ((options.protectedFields ?? []).includes(field)) {
        throw fail('protected-field', { field }, id)
      }
    }
  }
  return { warnings }
}

/**
 * Reject direct `EventOptions` on `env.on` (§3/§16.2 `unsupported-event-option`):
 * the manifest `position` is the only listener-option entry. The #12 skeleton
 * owns the guard and its message; the env bridge wires it into `env.on` in the
 * PluginEnv capability stage (#16).
 * @param options - trailing arguments passed to `env.on` beyond `(event, listener)`.
 * @param pluginId - owning plugin id for error attribution, when known.
 */
export function assertEventOptions(options: readonly unknown[], pluginId?: string): void {
  if (options.length === 0) return
  const first = options[0]
  const option = typeof first === 'object' && first !== null
    ? Object.keys(first)[0] ?? ''
    : String(first)
  throw fail('unsupported-event-option', { option }, pluginId)
}

/** Build a `PluginError` from the shared template vocabulary. */
function fail(code: PluginErrorCode, details: Record<string, unknown>, pluginId?: string): PluginError {
  return new PluginError(code, formatPluginError(code, details), details, pluginId)
}

/** Every event named by observe/transform/intercept declarations. */
function declaredEvents(definition: PluginDefinition): string[] {
  return [
    ...definition.permissions.observe,
    ...definition.permissions.transform.map(declaration => declaration.event),
    ...definition.permissions.intercept.map(declaration => declaration.event),
  ]
}

/**
 * Validate transform property names against the event's real return type.
 * Payload-external well-formed names (`service:*`) take the
 * `non-payload-name` message; unknown payload names take `unknown-property`.
 */
function validatePropertyNames(
  event: string,
  names: readonly string[],
  entry: PluginEventVocabularyEntry,
  pluginId: string,
): void {
  for (const name of names) {
    if (name.includes(':')) {
      throw fail('non-payload-name', { name, boundary: 'payload properties only' }, pluginId)
    }
    if (!(entry.properties ?? []).includes(name)) {
      throw fail('unknown-property', { event, name, valid: entry.properties ?? [] }, pluginId)
    }
  }
}
