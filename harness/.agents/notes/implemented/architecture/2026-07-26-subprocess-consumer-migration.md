# Agent Note: The subprocess seam goes Node-shaped and every eligible spawner rides it

Status: implemented

English | [中文](2026-07-26-subprocess-consumer-migration.zh.md)

## Problem

The [subprocess seam](2026-07-26-subprocess-seam.md) shipped shaped for exactly one consumer family: batch-collected stdout/stderr, batch stdin, a single escalating `kill()`. That was deliberate scope control, and its own note records "migrate the other spawn sites" as rejected-for-now. Review on the introducing PR reversed that deferral: the stacked follow-up should reshape the interface toward Node's API and move the remaining process-running places onto the service. The remaining spawners each carried a private copy of some slice of the same mechanics — lsp-local had its own detached-tree signalling (POSIX group + Windows taskkill + liveness polling), subagent-subprocess had the dispose ladder and its own scrub, and mcp-client, pty-local, the SDK helper, and the TUI Git probe each carried another credential scrub — and none of it was swappable or centrally testable.

## Decision

The seam's vocabulary is now Node-shaped, and every spawner that can ride the service does:

- **Per-stream stdio dispositions** on `SubprocessSpawnSpec`: `'pipe'` (the raw `Readable`/`Writable`, for consumer-owned protocol framing), `'inherit'` (diagnostics to the parent's stream), and collect mode `{ maxBytes, spill? }` — the original bounded tail-keep shape, with the spill file now optional so a diagnostic tail (a language server's stderr) buffers without touching disk. stdin is `'ignore'`, `'pipe'`, or `{ data }` (write-and-close batch).
- **`SubprocessOutcome` carries exit facts only** (Node's close-event vocabulary); collected output stays readable through `handle.collected` after settlement (spill fds seal at the settle boundary), so batch and streaming callers share one access path and nothing is copied into the outcome.
- **Tree-scoped termination behind one verb**: `terminate()` owns the SIGTERM→grace→SIGKILL escalation (serves the spec's abort signal too, and is a no-op once the tree is gone) — the handle exposes no single-signal `kill(signal?)`, so a consumer cannot skip the grace window; `waitForExit()` polls tree liveness (POSIX group probe; direct-child boundary on Windows); Windows tree termination (`taskkill /T`, injectable) moved in from lsp-local, so tree semantics are platform-correct for every consumer. (The stdin-EOF-first dispose ladder initially absorbed from `subagent-subprocess` later moved back out to its one consumer — see the [ladder-ownership Agent Note](2026-07-27-dispose-ladder-to-consumer.md).)
- **One scrub definition**: `scrubbedParentEnv()`/`SENSITIVE_ENV_PATTERN` live on the seam, and credential-shaped names contain `KEY`, `PASSWORD`, `SECRET`, or `TOKEN`, case-insensitively. Spawners that cannot route the spawn itself through the service — pty-local (node-pty owns the fork), mcp-client (the MCP SDK owns the transport spawn), and the TUI's synchronous Git branch probe — import the function, so environment policy is single-sourced even where process ownership is not. The SDK helper's `scrubEnvironment()` defaults through the function and applies the exported pattern when its caller supplies an explicit environment; the pattern remains public for this production consumer.

Migrations landed with the reshape: **bash-local/bash-sandbox** (collect modes + batch stdin; the bash `kill()` maps to `terminate()` so `task_kill` keeps escalation semantics), **lsp-local** (piped protocol streams + a no-spill collected stderr tail; `LspConnection` takes the seam's spawn function; its private tree-op helpers deleted), **subagent-acp** (piped ndjson streams + inherited stderr; spawn failure surfaces through `done` rejection into the same startup race; disposal is the backend-owned `disposeAcpChild` ladder over the seam's verbs, with the plugin's configured graces). **`dsh-subagent-subprocess` is deleted** — the dispose ladder and scrub are the seam's; the unused isolated-config-dir helper died with it (no consumer existed).

Compositions mounting lsp-local or subagent-acp now load `dsh-subprocess-local` (the plugins inject `'subprocess'`); the acp/lsp test fixtures gained the row.

## Alternatives considered

**Keep the batch-only seam and let stream consumers stay bespoke.** The introducing note's position, rejected by review: it leaves three private copies of tree signalling and six of the scrub, and any future runner (containerized executor, remote process host) would have to pick which private copy to fork. The Node-shaped dispositions cover all three observed stream shapes without widening the outcome type or buffering piped streams.

**A single `stdio: 'pipe' | 'inherit' | 'collect'` mode for all three streams at once.** Rejected: real consumers mix modes per stream (lsp: pipe/pipe/collect; acp: pipe/pipe/inherit; bash: data/collect/collect). Per-stream dispositions are exactly Node's shape and avoid a second spawn call for the mixed cases.

**Migrate pty-local and mcp-client spawns too.** Rejected on ownership grounds, not scope: node-pty's `fork()` allocates the terminal itself, and the MCP SDK's `StdioClientTransport` spawns internally — neither call site is ours to route. They adopt the shared scrub (the part that is policy), and their READMEs say why the spawn stays put.

**Migrate the test-support launchers (acp-snapshot, loader-smoke), the SDK package-manager runner, and the TUI Git probe.** Rejected: the support packages are deliberately dependency-light test infrastructure that must not depend on product seams; the SDK wizard's `stdio: 'inherit'`-with-redirect semantics plus its out-of-composition lifecycle (no cordis context at all) make the service a poor fit; and the TUI probe is synchronous. The production callers share the scrub instead.

## Consequences

Bought: one implementation of tree signalling, escalation, bounded collection, and the scrub, tested once in `dsh-subprocess-local`'s suites (including injected-platform Windows coverage that lsp-local's private copy never had); lsp-local and subagent-acp shed their process plumbing and their children now survive plugin reloads and die with composition teardown like bash's; a whole package (`dsh-subagent-subprocess`) is gone. The seam README's "one consumer family" limitation is retired.

Cost: the seam is wider — three stdio modes and the terminate/waitForExit/dispose lifecycle surface instead of one mode and one verb — so a future backend implements more surface; the compositions for lsp-local/subagent-acp each carry the subprocess row now; and `SubprocessOutcome` no longer carries output, a breaking shape change inside the still-unreleased stack (the PR2 layer was updated in place rather than shimmed, per the pre-release stance). pty-local/mcp-client/SDK/TUI/test-support spawns remain outside the service by ownership or execution shape, with the scrub as the shared floor and its pattern intentionally exported for explicit-environment consumers.
