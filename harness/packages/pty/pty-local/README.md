# @deepseek-ai/dsh-pty-local

English | [中文](README.zh.md)

Local Linux/macOS `node-pty` backend for `ctx.pty`; loading it on another platform fails as unsupported. It starts an interactive shell under the shared `ctx.sandboxPolicy`, strips credential-shaped ambient environment variables, retains bounded line-oriented output, detects readiness, and tears down the captured process tree rooted at the `node-pty` child.

## Plugin (`pty-local`)

The plugin injects `pty`, `sandbox`, and `sandboxPolicy`, then registers the configured backend type (`shell`). `danger-full-access` starts the shell directly; confined modes wrap the exact shell argv through `ctx.sandbox`. At spawn, one `ctx.sandboxPolicy.resolve({ session })` call supplies both the effective mode and the session workspace root; the same root is the default shell cwd when the caller omits one. A change to a different effective mode is rejected before its `sandbox/mode` event commits while that owner has an open PTY or a spawn in progress; the fence is attached to the exact owner and therefore outlives a local-provider reload that retains existing sessions. Wait for creation to settle and close the sessions before changing modes, so a terminal opened with wider access cannot survive a downgrade.

Linux readiness combines a foreground-verified private bash prompt marker, foreground-process-group syscall inspection, silence fallback, and absolute timeout. macOS uses the verified prompt marker plus silence/timeout because it has no `/proc` syscall surface. A marker is not ready until printable prompt text arrives, including when the OSC marker and `PS1` are split across data callbacks; when bash prints the marker before the kernel publishes its return to the foreground process group, polling retains the candidate for `handoffGraceMs` past the ordinary silence bound so a coincident handoff can win; that grace must cover at least one `pollIntervalMs` and is rejected at load otherwise. An interactive child that inherits `PROMPT_COMMAND` therefore cannot suppress inferred-idle readiness until the absolute timeout. Unrecognized or unreadable process state is never a positive exact-idle signal. A foreground group's stdin wait that already existed before a send is likewise not post-write readiness: the same group must be observed outside that wait before a later wait can settle the send, while a changed foreground group is new evidence. During unpublished startup, a fallback requires observed output; zero-output silence cannot publish an empty session, and timeout rejects the spawn. Cancellation closes the unpublished shell and rejects with the caller's exact abort reason even when its foreground process group is not observable yet; if that close fails, `PtyBackendCleanupError` separately preserves the cleanup failure for registry disposal. Incomplete terminal-control sequences are bounded by `maxReadBytes` and discarded through their terminator after crossing that limit; a trailing carriage return is carried across callbacks so split CRLF becomes one newline.

Send cancellation resolves the current foreground process group and delivers a real `SIGINT`; it never emulates interruption by writing `\x03`, so raw-mode programs remain cancellable. Close sends `SIGTERM` to descendants, waits, then sends `SIGKILL` to the union of captured survivors and newly scanned descendants so reparenting cannot hide a process from teardown. It verifies that every retained identity is gone or, on Linux, a non-executing zombie before stopping the shell; zombie entries are quiescent and are reaped as the shell exits. A survivor failure does not cache a permanently rejected close; a later close retries the teardown.

## Model Experience

### Current file policy and indirect consumer

#### What the model sees

The policy owner contributes capability-neutral `sandbox:policy` context. Through `@deepseek-ai/dsh-tool-pty` or another PTY consumer, the model may also receive bounded MOTD, send deltas, scrollback pages, readiness reasons, and cleanup errors.

#### Token effect

The current-policy clause is present while this backend is mounted. Retained PTY scrollback is not placed in model history until a consumer returns bounded output.

#### KV Cache effect

A standing-policy change appends an owner-rendered superseding runtime-context snapshot after retained history; consumer results remain append-only.

## Known Limitations and Deferred Work

- Line-oriented output is normalized; full-screen alternate-buffer interaction is unsupported.
- Linux exact probes support x64 and arm64 UAPI tables; other architectures use prompt-marker and silence/timeout readiness.
- A descendant that daemonizes and reparents before teardown leaves the captured tree; cleanup never broadens to the launcher PID's POSIX session because that can include unrelated processes.
- Sessions do not survive harness process exit.
