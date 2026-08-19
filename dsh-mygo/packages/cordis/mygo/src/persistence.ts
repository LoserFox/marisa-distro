/**
 * Registry persistence facade (#17): opens the per-profile
 * `plugin_registry_<profile>` domain over the storage hub, plus the snapshot
 * file store and the audit JSONL for the same profile. The engine receives
 * this facade (or runs in-memory without it); the factory composition wiring
 * lands with #18.
 * @module @r05en1cu/dsh-mygo/src/persistence
 */

import type { Domain, DomainFacility, DomainSpec } from '@deepseek-ai/dsh-storage-domain'
import { AuditLog } from './audit.ts'
import type { AuditInput } from './audit.ts'
import { pluginRegistryDomainSpec } from './registry-domain.ts'
import { SnapshotStore } from './snapshots.ts'
import { SqliteRegistryStore } from './sqlite-store.ts'
import type { RegistryStore } from './store.ts'

/** Options for opening one profile's persistence. */
export interface RegistryPersistenceOptions {
  /** Profile name; sanitized into the domain unit name. */
  readonly profile: string
  /** Base state directory (`stateRoot` from the manager Config). */
  readonly stateRoot: string
  /** Audit rotation threshold per file. */
  readonly auditMaxBytes: number
  /** Audit rotated files retained. */
  readonly auditKeepFiles: number
  /** Names already claimed on the medium (profile sanitization collisions). */
  readonly taken?: ReadonlySet<string>
}

/** Audit sink; the file AuditLog and an rdb-backed store both satisfy it. */
export interface AuditSink {
  append(input: AuditInput): Promise<void>
  since(since: number): Promise<readonly import('./audit.ts').AuditEntry[]>
  byPlugin(id: string): Promise<readonly import('./audit.ts').AuditEntry[]>
  tail(count: number): Promise<readonly import('./audit.ts').AuditEntry[]>
}

/**
 * The sqlite registry domain, snapshot files, and audit log of one profile.
 * The owner closes the facade (which closes the domain handle).
 */
export class RegistryPersistence {
  private constructor(
    readonly store: RegistryStore,
    readonly snapshots: SnapshotStore,
    readonly audit: AuditSink,
    readonly profile: string,
    private readonly domain: Domain<DomainSpec> | undefined,
  ) {}

  /**
   * Open the profile's registry domain, snapshot store, and audit log.
   * On 0809 the storage contract no longer carries declared medium reset
   * (`domain/reset` / `KvFacet.destroy`), so a damage-class open failure
   * propagates loudly instead of discarding the medium (T4-5 adapted).
   * @param facility - the mounted domain facility.
   * @param options - profile and policy knobs.
   * @param externalStore - optional backend-agnostic registry store provided
   * by a host composition row (e.g. mygo-rdb over postgres). When present the
   * manager uses it instead of opening the built-in sqlite registry domain;
   * audit and snapshots stay file-backed.
   * @returns the composed persistence facade.
   */
  static async open(
    facility: DomainFacility,
    options: RegistryPersistenceOptions,
    externalStore?: RegistryStore,
  ): Promise<RegistryPersistence> {
    const spec = pluginRegistryDomainSpec(options.profile, options.taken)
    const snapshots = new SnapshotStore(joinStateRoot(options.stateRoot, options.profile))
    if (externalStore !== undefined) {
      if (externalStore.check !== undefined) {
        try {
          await externalStore.check()
        } catch (error) {
          throw new Error(
            `registry backend self-check failed: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          )
        }
      }
      await migrateExternalRegistry(facility, options.profile, externalStore)
      const externalWithAudit = externalStore as unknown as {
        appendAudit?(input: AuditInput): Promise<void>
        since?(since: number): Promise<readonly import('./audit.ts').AuditEntry[]>
        byPlugin?(id: string): Promise<readonly import('./audit.ts').AuditEntry[]>
        tail?(count: number): Promise<readonly import('./audit.ts').AuditEntry[]>
      }
      const audit = typeof externalWithAudit.appendAudit === 'function'
        ? {
            append: (input: AuditInput) => externalWithAudit.appendAudit!(input),
            since: (since: number) => externalWithAudit.since!(since),
            byPlugin: (id: string) => externalWithAudit.byPlugin!(id),
            tail: (count: number) => externalWithAudit.tail!(count),
          }
        : new AuditLog(
          joinStateRoot(options.stateRoot, options.profile),
          options.profile,
          options.auditMaxBytes,
          options.auditKeepFiles,
        )
      return new RegistryPersistence(externalStore, snapshots, audit, options.profile, undefined)
    }
    const audit = new AuditLog(
      joinStateRoot(options.stateRoot, options.profile),
      options.profile,
      options.auditMaxBytes,
      options.auditKeepFiles,
    )
    const domain = await facility.open(spec)
    const store = new SqliteRegistryStore(domain)
    return new RegistryPersistence(store, snapshots, audit, options.profile, domain)
  }

  /** Close the domain handle (idempotent); the store becomes unusable. */
  async close(): Promise<void> {
    await this.domain?.close()
  }
}

/**
 * One-time sqlite → rdb registry migration when an external store takes over:
 * idempotent (marker in the store meta), never merges into a non-empty rdb
 * store, and copies every raw status/gens KV pair verbatim so damaged rows
 * still quarantine at recovery. Runs during manager init, BEFORE recovery, so
 * the takeover starts on an already-populated store.
 */
async function migrateExternalRegistry(
  facility: DomainFacility,
  profile: string,
  store: RegistryStore & {
    migrationMarked?(): Promise<boolean>
    importRawStatus?(key: string, value: string): Promise<void>
    importRawGeneration?(key: string, value: string): Promise<void>
    markMigrated?(): Promise<void>
  },
): Promise<void> {
  if (store.migrationMarked === undefined
    || store.importRawStatus === undefined
    || store.importRawGeneration === undefined
    || store.markMigrated === undefined) {
    return
  }
  if (await store.migrationMarked()) {
    console.info('[dsh-mygo] 外部存储已有迁移标记，跳过')
    return
  }
  const existing = await store.listIds()
  if (existing.length > 0) {
    console.info(`[dsh-mygo] 外部存储非空（${existing.length} 行），跳过迁移`)
    return
  }
  let domain: Domain<DomainSpec> | undefined
  try {
    domain = await facility.open(pluginRegistryDomainSpec(profile))
  } catch (error) {
    console.warn(`[dsh-mygo] 打开旧 sqlite 注册表域失败，跳过迁移: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  try {
    const gens = domain.table('gens')
    const status = domain.table('status')
    let rows = 0
    for (const [key, value] of gens.entries()) {
      await store.importRawGeneration(String(key), String(value))
      rows += 1
    }
    for (const [key, value] of status.entries()) {
      await store.importRawStatus(String(key), String(value))
      rows += 1
    }
    await store.markMigrated()
    console.info(`[dsh-mygo] 已从 sqlite 注册表迁移 ${rows} 行到外部 rdb 存储`)
  } catch (error) {
    console.warn(`[dsh-mygo] 注册表迁移失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    await domain.close()
  }
}

function joinStateRoot(stateRoot: string, profile: string): string {
  return `${stateRoot.replace(/\/+$/, '')}/${profile}`
}
