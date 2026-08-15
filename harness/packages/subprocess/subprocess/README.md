# @deepseek-ai/dsh-subprocess

English | [中文](README.zh.md)

The subprocess seam (`ctx.subprocess`). The abstract `SubprocessService` exposes one method — `spawn(spec): SubprocessHandle` — plus the vocabulary shared by every consumer: the fully-explicit `SubprocessSpawnSpec`, `SubprocessHandle` with its non-consuming offset-based output readers, `SubprocessOutcome`, `CollectedOutput`, and the managed `DSH_*` environment namespace (`DSH_ENV_PREFIX`, `DshEnvironment`). The local implementation lives in [`dsh-subprocess-local`](../subprocess-local/README.md).

## Contract

- `spawn(spec)` returns immediately with a live handle; `done` resolves at process close with exit facts (`SubprocessOutcome` carries no output and no cause classification) and rejects only for spawn-level failures.
- The spec is fully explicit — argv, cwd, per-stream stdio dispositions, grace — because deployment-varying defaults belong to the calling seam's config, not to a hidden subprocess-service default (the `dsh-bash` request/spec split is the owning template). Grace must be positive, finite, and no greater than [`MAX_TIMER_DELAY_MS`](../../util/timeout/README.md), so the implementation can represent it with one Node timer instead of accepting a value that Node collapses to one millisecond. `argv` is never shell-interpreted; a consumer that wants a shell passes `['bash', '-c', command]` itself.
- Stdio is Node-shaped per stream: `'pipe'` hands the caller the raw stream for its own protocol framing (LSP JSON-RPC, ACP ndjson), `'inherit'` passes the parent descriptor through for diagnostics, and collect mode (`{ maxBytes, spill? }`) buffers a bounded tail with an optional full-stream spill file. Collect readers take whole-stream byte offsets and never consume, so independent readers cannot steal one another's deltas; a read whose offset slid out of the in-memory tail is `lossy` and points at the spill file when one exists. Collected output stays readable after settlement.
- Termination is tree-scoped on every platform (POSIX detached groups with direct-child fallback; Windows `taskkill /T`): `terminate()` — the only termination verb — escalates SIGTERM→grace→SIGKILL (idempotent, driven by the spec's abort signal too, a no-op once the tree is gone), and `waitForExit(signal?)` observes whole-tree liveness so a consumer-owned teardown ladder holds each tier on real quiescence — the manager reacts but never classifies why (callers own deadlines, teardown ladders, and cause classification).
- `scrubbedParentEnv()` / `SENSITIVE_ENV_PATTERN` are the one shared scrub definition: ambient credential-shaped and `DSH_*` names are dropped, and the spec's explicit `env` merges after the scrub with no namespace validation — a string deliberately forwards or overrides a value, while an `undefined` tombstone removes an ordinary ambient entry. Spawners that cannot route through the service (node-pty backends, SDK-managed transports) import the scrub.
- Disposal of the service terminates all still-running managed processes and awaits their exit.

See the [subprocess data-structure catalog](../../../docs/core-data-structures/subprocess.md) and the [seam Agent Note](../../../.agents/notes/implemented/architecture/2026-07-26-subprocess-seam.md).

## Model Experience

Indirectly, through consumer seams (today the bash executor family behind `dsh-tool-bash`), which own all model-facing rendering of process output and lifecycle.

#### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

## Known Limitations and Deferred Work

- **node-pty and SDK-managed spawns share only the scrub** — the PTY backend's terminal fork and the MCP SDK's own stdio transport cannot route their spawns through this seam (the library owns the fork/spawn call); they import `scrubbedParentEnv` so the environment policy stays single-sourced.
- **Teardown ladders are consumer-owned** — the seam ships signalling verbs and the tree-liveness wait, not a canned quiesce sequence; each out-of-process consumer encodes its child's cooperation shape itself (the ACP backend's stdin-EOF-first ladder is the in-repo template).
