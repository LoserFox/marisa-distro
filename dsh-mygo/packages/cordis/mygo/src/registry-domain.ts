/**
 * Registry domain declaration (#17, §22.1): one `plugin_registry_<profile>`
 * domain per profile with the write-once `gens` table and the small `status`
 * table, both opaque TEXT (`z.string()`) so structure validation is deferred
 * to the boot recovery flow (T4-2/T4-5). Profile names are sanitized to
 * `UNIT_NAME_RE` with the spec's written rules; domain version 1 follows the
 * storage-family `SCHEMA_VERSION` precedent (a bump discards dynamic rows).
 * @module @r05en1cu/dsh-mygo/src/registry-domain
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { DomainSpec } from '@deepseek-ai/dsh-storage-domain'

/**
 * FNV-1a 32-bit hash, used for profile-name collision suffixes.
 * @param input - the profile name (or collision candidate) to hash.
 * @returns the unsigned 32-bit hash value.
 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Map a profile name onto `UNIT_NAME_RE` (spec §22.1 written rules): lower
 * case, illegal characters become `_`, a non-letter first character gains
 * the `p_` prefix, and a collision with a name in `taken` gains the FNV-1a
 * eight-hex-digit suffix.
 * @param profile - profile name from the deployment.
 * @param taken - names already claimed on the medium.
 * @returns the sanitized unit name.
 */
export function sanitizeProfileName(profile: string, taken: ReadonlySet<string> = new Set()): string {
  const lowered = profile.toLowerCase()
  const replaced = lowered.replace(/[^a-z0-9_]/g, '_')
  const prefixed = /^[a-z]/.test(replaced) ? replaced : `p_${replaced}`
  // `prefixed` is `p_` exactly when the profile is empty; the empty profile
  // is already a valid unit name, so no further special case exists.
  const base = prefixed
  if (!taken.has(base)) return base
  return `${base}_${fnv1a(profile).toString(16).padStart(8, '0')}`
}

/**
 * The registry domain spec for one profile: `gens` keyed `<id>/<gen>` and
 * `status` keyed `<id>`, values opaque JSON text carrying `v: 1` record
 * versions. Damage-class open failures propagate loudly (the 0809 storage
 * contract removed declared medium reset).
 * @param profile - profile name; sanitized into the unit name.
 * @param taken - names already claimed on the medium (collision suffix).
 * @returns the domain spec.
 */
export function pluginRegistryDomainSpec(
  profile: string,
  taken: ReadonlySet<string> = new Set(),
): DomainSpec {
  return defineDomain({
    name: `plugin_registry_${sanitizeProfileName(profile, taken)}`,
    version: 1,
    tables: {
      gens: domainTable<string, string>(z.string()),
      status: domainTable<string, string>(z.string()),
    },
  })
}
