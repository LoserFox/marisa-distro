# @deepseek-ai/dsh-subprocess-local

English | [中文](README.zh.md)

Local implementation of the [`@deepseek-ai/dsh-subprocess`](../subprocess/README.md) seam: `LocalSubprocessService` spawns each spec's argv as a detached process tree, wires the spec's per-stream stdio dispositions (raw pipes, inherit, bounded tail-keep collection with optional spill files), and signals tree-scoped with SIGTERM→SIGKILL escalation. It has no config: every disposition, limit, and directory arrives on the spawn spec, so the deployment-varying knobs stay with the calling seams' configs ([`dsh-bash-local`](../../bash/bash-local/README.md), [`dsh-lsp-local`](../../lsp/lsp-local/README.md), [`dsh-subagent-acp`](../../subagent/subagent-acp/README.md)).

## Behavior (and where it came from)

- **Detached process trees with platform-correct signalling** — POSIX children are spawned `detached` (own process group) and signalled by negative pgid with a direct-child fallback; Windows terminates the tree via `taskkill /PID <pid> /T /F`. `terminate()` — the handle's only termination verb — sends SIGTERM then SIGKILL after the spec's grace (OpenCode's escalation; pipelines and subshells die with the parent) and is a no-op once the tree is gone; `waitForExit()` polls whole-tree liveness so consumer teardown confirms real quiescence. After the leader exits, still-open pipes receive the same bounded drain grace so a surviving descendant cannot hold the outcome open indefinitely. ESRCH is tolerated; daemons that re-parent away from the group can still survive — the same caveat as the surveyed tools.
- **Per-stream dispositions** — `'pipe'` hands the raw stream to the caller untouched (protocol framing stays consumer-owned); `'inherit'` passes the parent descriptor through; collect mode keeps the in-memory TAIL beyond its cap (errors and results cluster at the end — pi/OpenCode rationale) while the FULL stream is appended to a private temp file when a spill cap is configured — omitting `spill` keeps only the tail, the diagnostic shape. A stream larger than the spill cap discards its now-incomplete spill and returns only the marked truncated tail; spill fds are sealed at settlement, and a failed final close withholds the path rather than advertising an incomplete file. Spill files are `0600` with random names under a lazily-created `0700` per-process directory.
- **Credential scrub + explicit merge** — `process.env` minus credential-shaped vars (`*KEY*`/`*PASSWORD*`/`*SECRET*`/`*TOKEN*`) and all ambient `DSH_*` names; the spec's explicit `env` merges after that scrub with no namespace validation, so a deliberately supplied credential or current `DSH_*` fact wins while stale nested-harness identity cannot leak in ambiently. Supplied stdin is written and closed; otherwise fd 0 is `/dev/null`. See the [stdin/env Agent Note](../../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-surface.md) and [managed environment Agent Note](../../../.agents/notes/implemented/feature/2026-07-10-agent-session-identity-and-log-location.md).
- **Offset-based reads** — collect-mode readers return deltas in whole-stream byte coordinates; the service never holds a cursor, so consumer-owned cursors (the bash background read path) and full-stream re-reads coexist, before and after settlement.
- **Terminate-and-join disposal** — the service retains live handles only so its own disposal can escalate every running tree and await its exit; settled and spawn-failed handles leave the live set on settlement.

## Model Experience

Indirectly, through consumer seams (today the bash executor family behind `dsh-tool-bash`), which own all model-facing rendering of process output and lifecycle.

#### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

## Known Limitations and Deferred Work

- **Windows tree support is best-effort** — termination routes through `taskkill /PID <pid> /T /F` with all outcomes contained (absent tree, races, missing binary), and liveness falls back to the direct-child boundary.
- **The credential scrub is a name heuristic** — `*KEY*`/`*PASSWORD*`/`*SECRET*`/`*TOKEN*` only; differently-named secrets (e.g. `*PASSPHRASE*`) pass through, and a whitelist for over-scrubbed vars is noted future work.
- **Completed spill files are not deleted** — bounded full-output recovery files (and the private per-process spill dir) accumulate under the OS tmpdir until something external cleans them; oversize incomplete spills are discarded and deletion is attempted immediately, but a cleanup failure can leave a bounded file behind.

The raw process handling lives in `src/spawn.ts`; `src/index.ts` is the service wiring.
