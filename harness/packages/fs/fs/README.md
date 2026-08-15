# @deepseek-ai/dsh-fs

English | [中文](README.zh.md)

The **filesystem provider seam**: an abstract `FileSystem` service (`ctx.fs`) defining the storage primitives a backend provides — resolve a path, stat metadata, no-follow path metadata, read/stream text, list directories, write atomically, and apply a literal edit — without saying HOW. Both mutations take their version guard **optionally**, so `ctx.fs` on its own is a complete, unconstrained text-storage seam. This package also owns the `fs/*` policy event vocabulary the tool dispatches and the policy plugin listens for.

This package is the provider-seam layer of the [filesystem family](../README.md). The [tool](../tool-fs/README.md), [policy](../fs-policy/README.md), and [local](../fs-local/README.md) and [sandboxed](../fs-sandbox/README.md) backends remain separate consumers and implementations; the capability-seam decisions own the split ([foundation](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md), [filesystem seam](../../../.agents/notes/implemented/architecture/2026-06-17-filesystem-capability-seam.md), [provider split](../../../.agents/notes/implemented/simplification/2026-06-26-fsspec-style-fs-seam.md), [event gate](../../../.agents/notes/implemented/architecture/2026-06-26-file-context-as-event-gate.md)).

## Service API (`ctx.fs`)

A backend subclasses `FileSystem` and implements eight primitives.

| Member | Semantics |
|---|---|
| `resolve(path, opts?)` | Resolve a path into a stable `FsTarget` (opaque `targetKey`, `displayPath`). `opts.cwd` is the base a relative `path` resolves against (a caller supplies its session workspace; absolute paths ignore it; omitted ⇒ the backend default), while `opts.signal` aborts a backend round-trip. Async — a remote backend may need I/O. The same file via different paths must yield the same `targetKey`. |
| `stat(target, signal?)` | Return `FsInfo` metadata (`version`, `type`, optional `size`), or `undefined` when the target is absent. Never content. |
| `lstat(path, opts?, signal?)` | Return `FsPathInfo` metadata without following the final path component when it is a symlink. This is path-shaped so consumers can reject repository-owned symlinks before `resolve` follows them into a target. |
| `readText(target, signal?)` | Read the whole regular text file as one decoded string. Owns regular-file checks, UTF-8 decoding, binary/NUL rejection (`FS_NOT_TEXT`). |
| `streamText(target, signal?)` | Stream the same text as decoded chunks for large files (cross-chunk UTF-8 decoding stays here). |
| `listDir(target, signal?)` | List direct directory children in stable name order. Returns entry names, entry types, resolved child targets, and cheap metadata (`version`/file `size` when available); never reads file contents. Missing targets throw `FS_NOT_FOUND`, non-directories throw `FS_NOT_DIRECTORY`, permission failures throw `FS_PERMISSION_DENIED`, and other backend I/O failures throw `FS_IO_ERROR`. Broken/disappeared children may be returned as `other` without metadata; child permission/IO failures fail the whole listing with the same structured codes. |
| `writeText(target, content, expected?, signal?)` | Atomic create/replace. `expected` is OPTIONAL: omit ⇒ unconditional create-or-overwrite; supply an `FsWriteIntent` (`createIfAbsent`/`replaceIfVersion`) to guard. |
| `editText(target, edit, expected?, signal?)` | Literal edit. `expected` is OPTIONAL: omit ⇒ unconditional edit of the current content; supply `{ version }` to guard (verified BEFORE matching). A missing target reports `FS_STALE_VERSION` either way. Applies and writes atomically — one mutation critical section. |

The mutation runs inside the backend's per-target lock either way, so an unconditional write/edit is still atomic — "unconditional" drops the *version* precondition, not the atomicity.

## The `fs/*` policy events

This package declares three events (see the generated [events catalog](../../../docs/cordis-catalog/events.md)) so the emitter (`@deepseek-ai/dsh-tool-fs`) and the policy listener (`@deepseek-ai/dsh-fs-policy`) share a vocabulary without the emitter depending on the policy plugin. `fs/write-intent` and `fs/edit-intent` are single-slot decision waterfalls (the listener fully decides, never calling `next()`); `fs/observed` is a fire-and-forget recording event. They carry only `dsh-fs` vocabulary plus an opaque `object` actor — no model-facing concepts and no agent/session owner structure.

## A provider seam, not the policy layer

`ctx.fs` is deliberately close to fsspec-style storage primitives — half a level above byte-level `cat`/`open`, because it decodes text and rejects binaries so the policy layer never touches raw bytes. It owns UTF-8 decoding, binary rejection, atomic writes, and the literal-edit critical section. It does **not** own line windows, numbered lines, rendered footers, or observed-state. Observed-state, read-before-edit, and version-guarded write/edit are policy a plugin (`@deepseek-ai/dsh-fs-policy`) ADDS by supplying the optional guard — not provider behavior — so a sandboxed/remote backend inherits no model-facing observation policy.

`editText` stays on this seam (not composed in the policy layer from a read plus a write) because version guard + literal match + atomic rewrite must stay inside one critical section for correct error attribution and one-wins/one-stale concurrency, and a remote backend may implement it as a native compare-and-edit.

## Vocabulary

`FsTargetKey` / `FsVersion` are branded opaque ids ([the branded-ids Agent Note](../../../.agents/notes/implemented/architecture/2026-06-20-branded-ids.md)) — consumers must not parse `targetKey` or interpret `version`; only `displayPath` is for model/UI output. `FsWriteIntent` is the explicit GUARDED write intent (`createIfAbsent` creates a missing target and rejects an existing one with `FS_NOT_OBSERVED`; `replaceIfVersion` replaces only at the observed version, else `FS_STALE_VERSION`); omitting it from `writeText` is the third, unconditional state. `FsPathInfo` is the no-follow metadata shape that can report `symlink`, unlike target-level `FsInfo`. Failures throw `FsError` (extends `HarnessError`, [the structured error taxonomy Agent Note](../../../.agents/notes/implemented/architecture/2026-06-11-structured-error-taxonomy.md)) carrying a stable `FsErrorCode` (`FS_NOT_FOUND`, `FS_NOT_DIRECTORY`, `FS_NOT_TEXT`, `FS_NOT_REGULAR_FILE`, `FS_PERMISSION_DENIED`, `FS_IO_ERROR`, `FS_STALE_VERSION`, `FS_NOT_OBSERVED`, `FS_AMBIGUOUS_EDIT`, `FS_EDIT_NOT_FOUND`, `FS_ABORTED`); the tool registry surfaces `{ name, code }` on `isError` results. See `src/types.ts` for the full contracts.

## No IO deadline

Filesystem primitives accept an optional `AbortSignal` but arm no deadline. Local IO is only best-effort abortable: a timeout cannot force an in-progress `fsync` or `rename` to stop, so a fixed deadline would promise control the backend cannot provide. Process-backed discovery owns its separate timeout contract.

## Model Experience

Indirectly, through `dsh-tool-fs`, which renders provider text and errors as bounded, retained filesystem tool results.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Text-only by contract** — backends reject binary/non-UTF-8 content with `FS_NOT_TEXT`; binary-safe operations are a deliberate deferral of [the tool-schemas Agent Note](../../../.agents/notes/implemented/feature/2026-06-17-filesystem-tool-schemas.md).
- **Eight primitives only** — no delete, rename/move, copy, or watch; `listDir` is single-level, with recursion, globbing, pagination, and search out of scope per [the directory-listing Agent Note](../../../.agents/notes/archived/architecture/2026-07-03-filesystem-directory-listing-seam.md).
- **No IO deadline** — cancellation is best-effort at primitive boundaries.
- **Resolve-then-operate costs a remote backend two round-trips per tool call** — folding or caching resolution is left to such a backend.
