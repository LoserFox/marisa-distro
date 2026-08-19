/**
 * Sqlite-backed registry store (#17, §22.1): the {@link RegistryStore} seam
 * over the `plugin_registry_<profile>` domain, rows stored as opaque TEXT
 * (`v: 1` record versions, structure validation deferred to recovery).
 * Unparsable rows surface as {@link RegistryRowError} so boot recovery
 * quarantines them with `damaged-record`; damage-class medium failures
 * propagate loudly (the 0809 storage contract removed declared medium reset).
 * @module @r05en1cu/dsh-mygo/src/sqlite-store
 */

import type { Domain, DomainFacility, DomainSpec, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { pluginRegistryDomainSpec } from './registry-domain.ts'
import type { GenerationRecord, RegistryStore, StatusRecord } from './store.ts'

/** One registry row failed to parse; recovery quarantines it as damaged. */
export class RegistryRowError extends Error {
  override name = 'RegistryRowError'

  /**
   * @param id - plugin id of the damaged row.
   * @param gen - generation number when the damaged row is a gens row.
   */
  constructor(
    readonly id: string,
    readonly gen?: number,
  ) {
    super(gen === undefined ? `registry row for plugin '${id}' is damaged` : `registry row for plugin '${id}/${gen}' is damaged`)
  }
}

/**
 * Parse one opaque gens row.
 * @param raw - stored TEXT value.
 * @param id - owning plugin id.
 * @param gen - generation number.
 * @returns the parsed generation record.
 */
export function parseGenerationRecord(raw: string, id: string, gen: number): GenerationRecord {
  const parsed: unknown = parseRow(raw, id, gen)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new RegistryRowError(id, gen)
  }
  return parsed as GenerationRecord
}

/**
 * Parse one opaque status row.
 * @param raw - stored TEXT value.
 * @param id - owning plugin id.
 * @returns the parsed status record.
 */
export function parseStatusRecord(raw: string, id: string): StatusRecord {
  const parsed: unknown = parseRow(raw, id)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new RegistryRowError(id)
  }
  return parsed as StatusRecord
}

function parseRow(raw: string, id: string, gen?: number): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new RegistryRowError(id, gen)
  }
}

/**
 * Open the plugin-registry domain for one profile and wrap it as a
 * {@link RegistryStore}.
 * @param facility - the mounted domain facility (composition wiring, #18).
 * @param profile - profile name; sanitized into the unit name.
 * @param taken - names already claimed on the medium (collision suffix).
 * @returns the sqlite-backed store, which owns the open domain handle.
 */
export async function openSqliteRegistryStore(
  facility: DomainFacility,
  profile: string,
  taken?: ReadonlySet<string>,
): Promise<SqliteRegistryStore> {
  const domain = await facility.open(pluginRegistryDomainSpec(profile, taken))
  return new SqliteRegistryStore(domain)
}

/** {@link RegistryStore} over one open registry domain. */
export class SqliteRegistryStore implements RegistryStore {
  private readonly gens: KvTable<string, string>
  private readonly status: KvTable<string, string>

  /**
   * @param domain - an opened `plugin_registry_<profile>` domain.
   */
  constructor(domain: Domain<DomainSpec>) {
    this.gens = domain.table('gens') as KvTable<string, string>
    this.status = domain.table('status') as KvTable<string, string>
  }

  listIds(): Promise<readonly string[]> {
    const ids = new Set<string>()
    for (const key of this.gens.keys()) {
      const slash = key.lastIndexOf('/')
      if (slash > 0) ids.add(key.slice(0, slash))
    }
    for (const key of this.status.keys()) ids.add(key)
    return Promise.resolve([...ids].sort())
  }

  readGenerations(id: string): Promise<readonly { readonly gen: number; readonly record: GenerationRecord }[]> {
    const entries: { readonly gen: number; readonly record: GenerationRecord }[] = []
    const prefix = `${id}/`
    for (const [key, raw] of this.gens.entries()) {
      if (!key.startsWith(prefix)) continue
      const gen = Number(key.slice(prefix.length))
      if (!Number.isInteger(gen)) continue
      entries.push({ gen, record: parseGenerationRecord(raw, id, gen) })
    }
    return Promise.resolve(entries.sort((left, right) => right.gen - left.gen))
  }

  async writeGeneration(id: string, gen: number, record: GenerationRecord): Promise<void> {
    await this.gens.put(`${id}/${gen}`, JSON.stringify(record))
  }

  async deleteGeneration(id: string, gen: number): Promise<void> {
    await this.gens.delete(`${id}/${gen}`)
  }

  readStatus(id: string): Promise<StatusRecord | undefined> {
    const raw = this.status.get(id)
    return Promise.resolve(raw === undefined ? undefined : parseStatusRecord(raw, id))
  }

  async writeStatus(id: string, record: StatusRecord): Promise<void> {
    await this.status.put(id, JSON.stringify(record))
  }

  async deletePlugin(id: string): Promise<void> {
    await this.status.delete(id)
    const prefix = `${id}/`
    for (const key of [...this.gens.keys()]) {
      if (key.startsWith(prefix)) await this.gens.delete(key)
    }
  }

  usage(): Promise<{ readonly rows: number; readonly bytes: number }> {
    let rows = 0
    let bytes = 0
    const measure = (key: string, value: string): void => {
      rows += 1
      bytes += new TextEncoder().encode(`${key}:${value}`).length
    }
    for (const [key, value] of this.gens.entries()) measure(key, value)
    for (const [key, value] of this.status.entries()) measure(key, value)
    return Promise.resolve({ rows, bytes })
  }
}
