/**
 * Lazy chunk loader for the client bundle. The heavy preview/terminal
 * libraries (Univer, docx-preview, pptx-renderer, CodeMirror, xterm — the
 * office/terminal/editor stacks, tens of MB) live in separate build-time
 * bundles (`lib/client-<name>.js`) fetched only on first use of the feature
 * that needs them, so startup downloads/parses only the ~1MB core bundle.
 *
 * How a chunk script works (see tsdown.config.ts chunkBundle):
 *
 *   globalThis.__dshChunks__ = globalThis.__dshChunks__ || {};
 *   globalThis.__dshChunks__["terminal"] = (require) => { ...exports };
 *
 * The script registers its factory on a plugin-owned global registry (NOT
 * through window.__ModuleLoader__.load — the module loader's import() only
 * resolves seed words, shell-own modules, registered factories, and boot
 * graph rows; a chunk id is none of those, so resolution would be version-
 * dependent). Materialization is plugin-owned:
 *
 * 1. inject <script src="/sidebar/bundle/<name>.js"> (classic same-origin
 *    script; the official /plugins/<id>/client.js route cannot serve
 *    arbitrary file names, so the plugin's own host route serves the chunks),
 * 2. read the factory from the global registry,
 * 3. call it with a require that resolves the platform externals through
 *    `__DSH_MODULES__.import(spec)` — the seed-word branch, the one part of
 *    the module system that is stable across versions.
 *
 * Caching contract (three layers, each with a failure path):
 * - In-memory: one in-flight promise per chunk, memoized until
 *   {@link resetChunks}; a failed load removes its entry so the next call
 *   retries from scratch.
 * - Script execution: each re-execution overwrites the global registry slot
 *   (assignment, never registration) — no "duplicate factory registration"
 *   class of errors; a failed materialization clears the cache so the retry
 *   re-injects and re-executes.
 * - HTTP: the bundle route revalidates every request (`cache-control:
 *   no-cache` + ETag, 304 when unchanged), so page refreshes and HMR
 *   re-activations never re-download a multi-MB chunk that did not change.
 *
 * HMR: each plugin activation calls {@link resetChunks}, which drops the
 * in-memory cache (and any test registry), so a hot-reloaded core bundle
 * re-fetches and re-executes the current chunk scripts on the next lazy
 * open. Chunk-only source edits still need a manual page refresh (the HMR
 * poll watches only client.js).
 */
export type ChunkName = 'docx' | 'xlsx' | 'pptx' | 'terminal' | 'editor';
/** The module exports a chunk factory provides (namespace-ish record). */
export type ChunkExports = Record<string, unknown>;
/**
 * The platform externals a chunk bundle may require (mirror of
 * CLIENT_EXTERNALS in tsdown.config.ts — the chunk builds keep these
 * external and the loader resolves them here). A superset is safe: the
 * require only answers what the chunk actually asks for.
 */
export declare const CHUNK_EXTERNALS: readonly string[];
/** Script-load hook; tests replace it with a stub (the default needs a real DOM + network). */
export type ChunkScriptLoader = (src: string) => Promise<void>;
/** Test hook: replace the chunk-script loader (pass null to restore the default). */
export declare function setChunkScriptLoaderForTests(loader: ChunkScriptLoader | null): void;
export declare function registerChunkForTests(name: ChunkName, loader: () => Promise<ChunkExports>): void;
/**
 * Load (once) and materialize a lazy chunk, returning its module exports.
 * Concurrent callers share one in-flight load; a failure clears the cache
 * entry so the next call retries (the script re-executes and overwrites its
 * global registry slot — assignments are idempotent).
 * @param name - the chunk to load.
 */
export declare function loadChunk(name: ChunkName): Promise<ChunkExports>;
/**
 * Drop all chunk state for a fresh plugin activation (HMR-safe): clear the
 * in-memory cache and any test-registry entries, so the next lazy open
 * re-fetches and re-executes the current chunk scripts (the registry slots
 * are overwritten by the re-execution — no cleanup needed).
 */
export declare function resetChunks(): void;
