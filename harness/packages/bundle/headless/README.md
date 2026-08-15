# `@deepseek-ai/dsh-headless`

English | [中文](README.zh.md)

The dsh one-shot bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-base`](../base/README.md) + [`dsh-web-app`](../web-app/README.md): it moves the webserver to an OS-assigned port (parallel runs never collide), silences the URL line, and inserts this package's `headless-runner` plugin (config `{task}`). The runner drives one task turn through the in-process API carrier (`InProcessApiClient` over `toFetchHandler(ctx.apiProxy)`, so the full wire chain — serialization, zod, SSE framing — really runs), waits at idle until that mux has consumed the session's final event sequence, aggregates the turn's final assistant text, writes it to stdout, and requests exit (completed → 0, else 1) through the launcher-provided `ctx.headlessIo` seam. The Web composition stays mounted, so the running session is observable in a browser at the stderr-announced URL. The launcher patches the task text in (`dsh run "task"`), and fails loud when the selected profile lacks this row.

## Model Experience

None, as the runner submits the task as an ordinary user message over the shared composition; prompts and tools belong to the base/web bundles.

#### KV Cache effect

None; the runner adds nothing to the request prefix.

## Known Limitations and Deferred Work

- **One turn only** — the runner anchors on the first message-triggered turn and exits at its end; queued follow-ups and multi-turn tasks are out of scope.
- **`ctx.headlessIo` is launcher-owned** — booting the headless profile outside the `dsh` launcher fails loud at activation until the host provides the seam.
