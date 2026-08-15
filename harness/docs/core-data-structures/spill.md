# Spill Storage

English | [中文](spill.zh.md)

The spill storage seam — a [capability seam](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md) that persists a tool's oversized text and returns a model-facing locator plus retrieval guidance, split across packages: interface ([dsh-spill](../../packages/spill/spill), `ctx.spillStore`), implementation ([dsh-spill-local](../../packages/spill/spill-local), private session-scoped files on the host filesystem), and consumer ([dsh-spill-policy](../../packages/spill/spill-policy), the `tools/post-execute` policy). Spill is **one optional capability**, not part of the agent-loop spine — so its vocabulary lives here, not in [core.md](core.md). Preview mechanics stay in [dsh-retention](../../packages/util/retention); this seam only saves the final text the policy hands it.

Source: [`packages/spill/spill/src/types.ts`](../../packages/spill/spill/src/types.ts)

## The save request

`saveText` is the whole seam: persist `content` verbatim, return an opaque locator, a backend-supplied retrieval hint, and the exact byte count. The request carries the save-time storage namespace (`owner`), WHERE it came from (`source`, descriptive provenance for naming and inspection — not access control), and a `suggestedName` the backend may use as a naming hint (it is not a path).

```ts type-equiv
/** One request to persist text to a spill artifact. */
interface SaveTextSpill {
  owner: SpillOwner
  source: SpillSource
  /**
   * A caller-suggested base name (e.g. `web_fetch.txt`). The backend sanitizes
   * it to a single safe path segment before use — it is a hint, never a path.
   */
  suggestedName: string
  /** The full text to persist (UTF-8). */
  content: string
}
```

```ts type-equiv
/**
 * Save-time storage namespace for a spilled artifact. The session id lets a
 * backend group storage under the producing session, but the returned
 * {@link SpillLocator} is the model-facing handle. Forked sessions inherit
 * locators already present in the seeded log; those artifacts are not copied or
 * re-owned, and spills produced after the fork use the child session id.
 */
interface SpillOwner {
  sessionId: SessionId
}
```

`SpillOwner.sessionId` is the save-time storage namespace. Forked sessions inherit existing spill locators from the seeded log; those artifacts are not copied or re-owned, and spills produced after the fork use the child session id. A retention-period cleanup may expire old locators with other old session artifacts; the spill seam does not define a per-session cleanup policy.

```ts type-equiv
/**
 * Provenance of one spilled artifact — recorded by the backend for a readable
 * filename and inspection. Not interpreted for access control; purely
 * descriptive.
 */
interface SpillSource {
  /** The tool whose result was spilled (e.g. `web_fetch`). */
  toolName: string
  /** The model-issued call id the result belongs to. */
  callId: CallId
  /** A short human label for the artifact (e.g. `result`). */
  label: string
}
```

## The result

```ts type-equiv
/** A saved spill artifact: its locator, byte length, and backend-specific retrieval guidance. */
interface SpillRef {
  locator: SpillLocator
  bytes: number
  retrievalHint: string
}
```

`SpillLocator` is a [branded](core.md#branded-ids) model-facing handle returned by the backend. The local backend renders it as a filesystem path; a remote or database backend can render a URI, key, or command token. Consumers treat it as opaque and render it with `retrievalHint` instead of assuming `read` is always the right retrieval mechanism.

```ts type-equiv
/**
 * Opaque model-facing handle for one spilled artifact. A local backend may use a
 * filesystem path; a remote or database backend may use a URI or key. Consumers
 * render it with {@link SpillRef.retrievalHint}, but do not parse it.
 */
type SpillLocator = Branded<'SpillLocator'>
```

## The service

`SpillStore` (`ctx.spillStore`, defined in [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)) is a one-method abstract service: `saveText(input) → Promise<SpillRef>`. It persists the FULL `content` and REJECTS on a real storage failure (permissions, ENOSPC, backend unavailable). The seam owns storage only: no retention policy, no tool-result replacement, no retrieval/search API.

The local backend ([dsh-spill-local](../../packages/spill/spill-local)) writes under `<root>/session-<hash>/<random>-<safeName>` — a configured or lazily-created private (0700) root, a `sha256(sessionId)` session subdir, and an exclusive owner-only (`open(path, 'wx', 0o600)`) write so a planted symlink cannot redirect it. Its `locator` is the local path and its `retrievalHint` tells the model to use `read` or `grep` on that path. The policy consumer ([dsh-spill-policy](../../packages/spill/spill-policy)) replaces an over-`maxInlineBytes` plain-text final result with a retention-library head/tail preview plus the spill reference, best-effort: a save failure keeps the original inline result rather than turning a successful call into an `isError`.
