/**
 * Hub catalog bridge (panel P0 migration from `omdsh-plughub`'s catalog
 * experience): reads the `hub` LoaderAdapter registered by
 * `@r05en1cu/dsh-mygo-loader-hub`, projects its registry into a wire-safe
 * catalog with installed/update facts, and resolves one entry into the pnpm
 * spec handed to the bundle rail.
 *
 * The hub registry is the mygo-side analogue of plughub's `registry` source;
 * unlike plughub the panel does not fetch it here — the loader-hub plugin
 * already owns fetch/verify/fallback, and the panel only projects the bound
 * registry. Source failure is therefore "no hub adapter registered" rather
 * than a network error.
 * @module @r05en1cu/dsh-mygo-ext-panel/hub-catalog
 */

import type { LoaderAdapter } from '@r05en1cu/dsh-mygo-api'
import {
  assessHubEntry,
  pickHubRelease,
  translateHubInstall,
  type HubAssessment,
  type HubEntry,
  type HubRegistry,
  type HubRelease,
} from '@r05en1cu/dsh-mygo-loader-hub'
import { hubUpdateStateOf, type HubUpdateState } from './hub-version.js'

/** The subset of a hub LoaderAdapter this projection reads. */
export interface HubAdapterLike {
  readonly id: 'hub'
  readonly registry: HubRegistry
}

/** Installed fact for one plugin id (bridge, bundle, or live rail). */
export interface HubInstalledFact {
  readonly id: string
  readonly version?: string
  /** Bundle-rail package name; bridge rows leave it absent. */
  readonly packageName?: string
  readonly rail: 'bridge' | 'bundle' | 'live'
}

/** One hub entry as served to the browser. */
export interface HubCatalogRow extends HubEntry {
  /** 获胜目录源（local / hub / github）。 */
  readonly source?: 'local' | 'market' | 'hub' | 'github'
  readonly installed?: {
    readonly id: string
    readonly rail: 'bridge' | 'bundle' | 'live'
    readonly version?: string
    readonly update: HubUpdateState
  }
  readonly assessment: HubAssessment
}

/** Source metadata for the bound hub registry. */
export interface HubCatalogSource {
  readonly adapter: 'hub'
  readonly schema: string
  readonly revision: number
  readonly generatedAt: string
  readonly origins: readonly string[]
  readonly snapshotId: string
  readonly signature: HubRegistry['signature']
}

/** Complete GET /api/mygo/hub document. */
export interface HubCatalogDocument {
  readonly source: HubCatalogSource
  readonly entries: readonly HubCatalogRow[]
}

/** Find the hub adapter, structurally, so a profile without loader-hub degrades. */
export function hubAdapterOf(adapters: readonly LoaderAdapter[]): HubAdapterLike | undefined {
  const candidate = adapters.find(adapter => adapter.id === 'hub')
  if (candidate === undefined) return undefined
  const registry = (candidate as { readonly registry?: unknown }).registry
  if (typeof registry !== 'object' || registry === null) return undefined
  return candidate as unknown as HubAdapterLike
}

/** Match one hub entry against the installed rows. */
export function installedFactOf(
  entry: HubEntry,
  facts: readonly HubInstalledFact[],
): HubInstalledFact | undefined {
  const packageName = entry.install.mode === 'profile-bundle' ? entry.install.packageName : undefined
  return facts.find(fact =>
    fact.id === entry.id
    || (packageName !== undefined && fact.packageName === packageName),
  )
}

/** Project one hub entry plus installed/update facts into a catalog row. */
export function hubEntryRow(
  entry: HubEntry,
  installed: readonly HubInstalledFact[],
): HubCatalogRow {
  const fact = installedFactOf(entry, installed)
  const offered = entry.version ?? undefined
  return {
    ...entry,
    assessment: assessHubEntry(entry),
    ...(fact === undefined
      ? {}
      : {
          installed: {
            id: fact.id,
            rail: fact.rail,
            ...(fact.version === undefined ? {} : { version: fact.version }),
            update: hubUpdateStateOf(offered, fact.version),
          },
        }),
  }
}

/** Project the bound hub registry plus installed/update facts into one document. */
export function hubCatalogDocument(
  adapter: HubAdapterLike | undefined,
  installed: readonly HubInstalledFact[],
): HubCatalogDocument | undefined {
  if (adapter === undefined) return undefined
  const registry = adapter.registry
  const entries = registry.entries.map(entry => hubEntryRow(entry, installed))
  return {
    source: {
      adapter: 'hub',
      schema: registry.schema,
      revision: registry.revision,
      generatedAt: registry.generatedAt,
      origins: registry.origins,
      snapshotId: registry.snapshotId,
      signature: registry.signature,
    },
    entries,
  }
}

/** Resolved install target for one hub entry. */
export type HubInstallTarget =
  | {
    readonly ok: true
    readonly entry: HubEntry
    readonly release: HubRelease
    readonly assessment: HubAssessment
    readonly spec: string
    readonly packageName: string
    readonly experimental: boolean
  }
  | {
    readonly ok: false
    readonly entry: HubEntry | undefined
    readonly release: HubRelease | undefined
    readonly assessment: HubAssessment | undefined
    readonly status: 404 | 409
    readonly error: string
    readonly advisories: readonly string[]
  }

/**
 * Resolve one hub entry to a pnpm spec for the bundle rail.
 *
 * Mirrors plughub's "the catalog is the allowlist" boundary: the request names
 * only an entry id (and optional release id), and the Host resolves the spec
 * from the registry IT bound.
 * @param adapter - the bound hub adapter.
 * @param id - hub entry id.
 * @param releaseId - optional release id, defaults to `latestRelease`.
 * @returns a translated spec, or a refusal with all blocking/advisory facts.
 */
export async function resolveHubInstallTarget(
  adapter: HubAdapterLike,
  id: string,
  releaseId?: string,
): Promise<HubInstallTarget> {
  const entry = adapter.registry.entries.find(candidate => candidate.id === id)
  const assessment = entry === undefined ? undefined : assessHubEntry(entry, releaseId)
  const release = entry === undefined ? undefined : pickHubRelease(entry, releaseId)
  if (entry === undefined || release === undefined || assessment === undefined) {
    return {
      ok: false,
      entry,
      release,
      assessment,
      status: 404,
      error: entry === undefined
        ? `hub registry offers no plugin named ${JSON.stringify(id)}`
        : `hub entry ${JSON.stringify(id)} has no release ${releaseId ?? entry.latestRelease}`,
      advisories: [],
    }
  }
  if (!assessment.installable) {
    return {
      ok: false,
      entry,
      release,
      assessment,
      status: 409,
      error: assessment.blocks.join('；'),
      advisories: assessment.advisories,
    }
  }
  const translated = await translateHubInstall(release.install, { allowFileSpec: false })
  if (translated.kind === 'display') {
    return {
      ok: false,
      entry,
      release,
      assessment,
      status: 409,
      error: translated.reason,
      advisories: assessment.advisories,
    }
  }
  return {
    ok: true,
    entry,
    release,
    assessment,
    spec: translated.spec,
    packageName: translated.packageName,
    experimental: translated.experimental,
  }
}
