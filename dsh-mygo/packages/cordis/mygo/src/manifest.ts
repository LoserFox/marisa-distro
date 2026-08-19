/**
 * Mount-time manifest validation (§16.2 group 1): a strict zod schema over
 * the `PluginDefinition` shape. Violations throw `manifest-invalid` with the
 * failing field path and the expected contract as details.
 * @module @r05en1cu/dsh-mygo/src/manifest
 */

import { PluginError, formatPluginError } from '@r05en1cu/dsh-mygo-api'
import type { PluginCompatibility } from '@r05en1cu/dsh-mygo-api'
import { z } from 'zod'
import { normalizeCompatibility } from './compatibility.ts'

const pluginId = z.string().regex(/^[a-z][a-z0-9-]*$/)
const semverShape = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
const kindName = z.string().min(1).regex(/^[a-z][a-z0-9-]*$/)
const eventName = z.string().min(1).regex(/^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*(\/\*)?$/)

const transformDeclaration = z.object({
  event: z.string(),
  reads: z.array(z.string()).optional(),
  writes: z.array(z.string()).optional(),
  appends: z.array(z.string()).optional(),
})

const interceptDeclaration = z.object({
  event: z.string(),
  returns: z.array(z.string()),
})

const permissionLevel = z.enum(['outermost', 'derived', 'innermost'])
const fileAccessMode = z.enum(['read', 'write'])
const entrypointContribution = z.union([
  z.string().min(1),
  z.object({ value: z.unknown() }).strict(),
])
const compatibilityBlock = z.object({
  requires: z.record(z.string().min(1), z.string().min(1)).optional(),
  depends: z.record(z.string().min(1), z.string().min(1)).optional(),
  breaks: z.record(z.string().min(1), z.string().min(1)).optional(),
  recommends: z.record(z.string().min(1), z.string().min(1)).optional(),
  suggests: z.record(z.string().min(1), z.string().min(1)).optional(),
  conflicts: z.record(z.string().min(1), z.string().min(1)).optional(),
}).strict()

/**
 * Strict manifest schema (§2/§5). Functions (hooks, the schemastery config
 * schema) are accepted structurally through `z.custom`; their behavior is
 * exercised by the lifecycle stages, not this shape gate.
 */
export const MANIFEST_SCHEMA = z.object({
  id: pluginId,
  version: semverShape,
  kinds: z.array(kindName),
  events: z.array(eventName).optional(),
  requires: z.array(z.string()),
  serviceRequires: z.record(z.string().min(1), z.union([z.string().min(1), z.array(z.string().min(1))])).optional(),
  symbolAliases: z.record(z.string().min(1), z.string().min(1)).optional(),
  provides: z.array(z.string()),
  permissions: z.object({
    observe: z.array(z.string()),
    transform: z.array(transformDeclaration),
    intercept: z.array(interceptDeclaration),
    position: permissionLevel,
    claims: z.array(z.string()),
  }),
  fileAccess: z.array(z.tuple([fileAccessMode, z.string()])).optional(),
  networkAccess: z.object({ allow: z.array(z.string()) }).optional(),
  varsAccess: z.array(z.string()).optional(),
  llmAccess: z.object({ models: z.array(z.string()) }).optional(),
  execAccess: z.object({ allow: z.array(z.string()) }).optional(),
  httpAccess: z.object({ routes: z.array(z.string()) }).optional(),
  client: z.object({
    main: z.string().min(1),
    inject: z.array(z.string()).optional(),
  }).optional(),
  entrypoints: z.record(z.string().min(1), z.array(entrypointContribution)).optional(),
  compatibility: compatibilityBlock.optional(),
  sessionWriteAccess: z.boolean().optional(),
  hostPublishAccess: z.boolean().optional(),
  dynamicInstallAccess: z.boolean().optional(),
  stateful: z.boolean(),
  swapPolicy: z.enum(['immediate', 'drain', 'next-idle']),
  config: z.custom(value => typeof value === 'function', 'schemastery schema'),
  hooks: z.object({
    setup: z.custom(value => typeof value === 'function', 'function').optional(),
    activate: z.custom(value => typeof value === 'function', 'function'),
    deactivate: z.custom(value => typeof value === 'function', 'function').optional(),
    captureState: z.custom(value => typeof value === 'function', 'function').optional(),
    restoreState: z.custom(value => typeof value === 'function', 'function').optional(),
    dispose: z.custom(value => typeof value === 'function', 'function').optional(),
  }),
}).strict()

/**
 * Validate one manifest against {@link MANIFEST_SCHEMA}. Any violation throws
 * `manifest-invalid` naming the failing field and the expected contract.
 * @param manifest - the runtime manifest to validate.
 * @param pluginId - owning plugin id for error attribution (the declared id when known).
 */
export function validateManifest(manifest: unknown, pluginId?: string): void {
  const result = MANIFEST_SCHEMA.safeParse(manifest)
  if (result.success) {
    // The v1 `requires` alias must normalize cleanly into `depends`; a key
    // declared in both is ambiguous and rejected as a manifest error.
    const normalized = normalizeCompatibility(result.data.compatibility as PluginCompatibility | undefined)
    if (normalized.issue !== undefined) {
      throw new PluginError(
        'manifest-invalid',
        formatPluginError('manifest-invalid', { field: 'compatibility', expected: normalized.issue }),
        { field: 'compatibility', expected: normalized.issue },
        pluginId,
      )
    }
    return
  }
  // A failed safeParse always carries at least one issue.
  // A failed safeParse always carries at least one issue; the cast keeps the
  // narrow access without a runtime branch.
  const issue = result.error.issues[0] as { readonly path: readonly (string | number)[]; readonly message: string }
  const field = issue.path.join('.') || 'manifest'
  const expected = issue.message
  throw new PluginError(
    'manifest-invalid',
    formatPluginError('manifest-invalid', { field, expected }),
    { field, expected },
    pluginId,
  )
}
