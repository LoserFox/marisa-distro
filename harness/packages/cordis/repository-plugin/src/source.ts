/**
 * GitHub repository source validation and prepared-wrapper loading.
 * @module
 */

import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context, Fiber, FiberState, Plugin } from 'cordis'
import type { RepositoryCache } from '@cordisjs/plugin-loader/repository'
import { resolveDshHome } from '@deepseek-ai/dsh-paths'
import { PREPARED_ENTRY_FILENAME } from './format.ts'

// Value mirror: Cordis's const enum has no runtime object to import. Keep
// aligned with `packages/cordis/tool-cordis/src/fiber-state.ts`.
const FIBER_ACTIVE = 2 as FiberState.ACTIVE

/** Directory under the Harness home containing immutable repository generations. */
export const DEFAULT_REPOSITORY_CACHE_DIRECTORY = 'repository-plugins'

// The ref segment excludes `#` so `github:o/r#a#b` fails here — at the config
// parser, with the syntax the error message promises — instead of inside the
// cache's pnpm install ('misconfiguration fails loud at the earliest
// resolvable point').
const GITHUB_SOURCE_PATTERN = /^github:([^/\s#&]+)\/([^/\s#&]+)#([^\s#&]+)(?:&path:(\/[^\s&]+))?$/

function validPluginPath(path: string): boolean {
  const segments = path.split('/').slice(1)
  return segments.length > 0
    && segments.at(-1) === '.dsh-plugin'
    && segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..')
}

/**
 * Normalize one user-facing GitHub source to the exact pnpm dependency specifier.
 * @param configured - `github:owner/repo#ref` with an optional `&path:/.../.dsh-plugin`.
 * @returns the exact specifier, with the root `.dsh-plugin` subpath added when omitted.
 * @throws when the GitHub owner, repository, explicit ref, or plugin subpath is invalid.
 */
export function resolveRepositorySpecifier(configured: string): string {
  const match = GITHUB_SOURCE_PATTERN.exec(configured)
  if (match === null) {
    throw new Error(`repository source must use github:owner/repo#<ref> with an optional &path:/.../.dsh-plugin: ${JSON.stringify(configured)}`)
  }
  const path = match[4]
  if (path !== undefined && !validPluginPath(path)) {
    throw new Error(`repository source path must be an absolute repository subpath ending in .dsh-plugin without empty, . or .. segments: ${JSON.stringify(path)}`)
  }
  return path !== undefined ? configured : `${configured}&path:/.dsh-plugin`
}

/**
 * Resolve the persistent repository cache root.
 * @param configured - explicit cache directory, or undefined for `$DSH_HOME/cache/repository-plugins`.
 * @returns an absolute cache directory.
 */
export function resolveRepositoryCacheDirectory(configured: string | undefined): string {
  return resolve(configured ?? join(resolveDshHome(), 'cache', DEFAULT_REPOSITORY_CACHE_DIRECTORY))
}

/**
 * Load one exact repository generation's generated wrapper as a child Cordis fiber.
 * @param ctx - repository runtime context that owns the child.
 * @param cache - package-manager-native immutable repository cache.
 * @param specifier - normalized exact pnpm dependency specifier.
 * @returns the settled prepared-wrapper fiber.
 * @throws when installation, wrapper import, manifest validation, or child registration fails.
 */
export async function loadPreparedRepository(
  ctx: Context,
  cache: Pick<RepositoryCache, 'resolve'>,
  specifier: string,
): Promise<Fiber> {
  const directory = await cache.resolve(specifier)
  const filename = join(directory, PREPARED_ENTRY_FILENAME)
  try {
    const plugin = await import(/* @vite-ignore */pathToFileURL(filename).href) as Plugin
    const fiber = ctx.plugin(plugin)
    await fiber
    // Awaiting a service-gated fiber returns while it is still PENDING (the
    // generated wrapper injects `skills`/`tools` per its manifest). This
    // runtime commits the repository configuration transactionally, so a
    // composition that never provides a required service must reject the
    // transaction here — not settle ACTIVE with a silently pending child.
    if (fiber.state !== FIBER_ACTIVE) {
      const missing = Object.keys(fiber.inject).filter(service => fiber.ctx.get(service) === undefined)
      /* v8 ignore next 2 -- the 'unknown' arm needs a service to appear after the state read; not deterministically stageable. */
      const detail = missing.join(', ') || 'unknown'
      throw new Error(`prepared wrapper did not activate (waiting for services: ${detail})`)
    }
    return await fiber
  } catch (cause) {
    throw new Error(`failed to load prepared repository Plugin ${JSON.stringify(specifier)} from ${filename}`, { cause })
  }
}
