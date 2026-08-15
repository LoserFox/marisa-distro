# @dsh-external/dsh-ui-progress

[简体中文](./README.md) | **English**

DSH Web UI session progress plugin: provides a persistent session progress bar in the input dock area of the DeepSeek Harness Web GUI, with **zero core changes** (a pure client plugin that never touches agent-loop).

## 版本对应 / Version compatibility

Build artifacts track DSH snapshot versions; pick the matching version for your snapshot when installing:

| Plugin version | DSH snapshot | Notes |
| --- | --- | --- |
| `v0.1.0` | `snapshots/20260805T134133Z` (snapshot0805) | Old build; installed via the legacy method (`~/.dsh/config.yaml` + `pnpm add -w link:`) |
| `v0.2.0` | `snapshots/20260806T160212Z` (snapshot0806) | Earlier build for the same snapshot (no elapsed time / ETA / failure state / phase timeline) |
| `v0.3.0` | `snapshots/20260806T160212Z` (snapshot0806) | Previous build for the same snapshot (card elapsed-time / ETA copy interpolation missing) |
| `v0.3.1` | `snapshots/20260806T160212Z` (snapshot0806) | Previous build for the same snapshot (ETA is a linear extrapolation) |
| `v0.4.0` | `snapshots/20260806T160212Z` (snapshot0806) | Previous build for the same snapshot (ETA comes only from model reports) |
| `v0.5.0` | `snapshots/20260807T130646Z` (snapshot0807) | Previous build for the same snapshot: bundled tool + reporting guidance |
| `v0.5.1` | `snapshots/20260807T130646Z` (snapshot0807) | Previous build for the same snapshot: session-complete progress bar in light green |
| `v0.6.0` | `snapshots/20260807T130646Z` (snapshot0807) | New build: elapsed time steps at 0.1s (collapses after a full minute) + amber attention hint for subagent todos |
| `v0.7.0` | `snapshots/20260808T121140Z` (snapshot0808) | New build: adapted to the 0808 slot migration (`conversation.chat.toolview` → `tool.call.toolview`; registration waits for the declaration via `slots.inject`) |
| `v0.8.0` | `snapshots/20260808T121140Z` (snapshot0808) | New build: removed the bundled `report_progress` tool and reporting guidance (host half emptied), removed the tool card; fill changed to the real todos ratio (defaults to 100% without todos); added the interrupted orange-red state (manual stop / API errors and other unexpected stops) |
| `v0.9.0` | `snapshots/20260809T140917Z` (snapshot0809) | New build (native 0809): added **real-time token generation rate** while running (self-calibrating estimate + 1s sliding-window smoothing, counted from first token arrival, close to real provider usage) |
| `v0.9.1` (default) | `snapshots/20260810T155924Z` (snapshot0810) | Compatibility build: client plugin metadata migrated from top-level `dshClient` to nested `dsh.client` (0810's ClientModuleHostService reads only this field; the top-level `dshClient` is silently ignored); inject/platform preserved as-is |

> **Compatibility notes**: the `v0.8.0` build was developed against snapshot0808 and is also compatible with snapshot0809 (`snapshots/20260809T140917Z`), verified on a real instance; `v0.9.0` is a native snapshot0809 build; `v0.9.1` targets snapshot0810 (`snapshots/20260810T155924Z`, the default version) and is also compatible with snapshot0811 (`snapshots/20260811T152241Z`) and the final snapshot snapshot0812 (`snapshots/20260812T172954Z-final`) — 0811 and 0812 passed real-instance boot verification (see below).

> **npm release compatibility**: compatible with the DSH npm release `@deepseek-ai/dsh@0.0.1-rc.5` (dist-tag `next`, i.e. the npm release of the final snapshot snapshot0812; `npm exec -p @deepseek-ai/dsh@0.0.1-rc.5 -- dsh --profile web --port <port>` can access the specified version and start it, lib production mode), while remaining compatible with `@deepseek-ai/dsh@0.0.1-rc.2` (the npm release of snapshot0811). Verified on a real instance (npm rc.5 baseline): after `dsh web` starts, the `window.__DSH_BOOT__` manifest includes `@dsh-external/dsh-ui-progress` (inject: `dsh-client-locale`/`dsh-client-runtime`/`dsh-client-ui-conversation`), and `/plugins/@dsh-external/dsh-ui-progress/client.js` returns 200; the source typechecks fully green against the rc.5 baseline build artifacts (this plugin has migrated its cordis type imports and peer to `@deepseek-ai/cordis`, see below). Note: starting from 0811 the vendored cordis was renamed to `@deepseek-ai/cordis` (the npm release no longer publishes a vendored package under the name `cordis`); this plugin has migrated (peer declares `@deepseek-ai/cordis: ^4.0.1-rc.1`, which is `4.0.1-rc.4` on the npm rc.5 baseline), and a plain `npm install` no longer fails with ERESOLVE.

> Pinned tag via git dependency: `pnpm add '@dsh-external/dsh-ui-progress@github:lhh010/dsh-ui-progress#v0.9.1'` (0809 users use `#v0.9.0`, 0808 users use `#v0.8.0`, 0807 users use `#v0.6.0`, 0805 users use `#v0.1.0`).

## 0809 compatibility notes (snapshot0809, verified on a real instance)

- On a running 0809 `dsh web`, the `window.__DSH_BOOT__` manifest includes `@dsh-external/dsh-ui-progress`, and the `conversation.input.dock` progress bar renders correctly — the spinning loader while running, real-ratio todos fill, light-green completion, orange-red interruption, and amber attention states were all verified on a real instance.
- **Loading mechanism change**: 0809 refactored the client plugin mechanism — the old `dsh.plugin.json` manifest + `resolveClientPath` (`packages/plugin/plugin`) was removed in favor of a **`dshClient` declaration in package.json** (`platform: 'web'`, optional `inject`/`immediately`) + `exports["./client"]` pointing at the build artifact; the host scans loader entries to compose the boot graph, and the Web side pulls from `/plugins/<id>/client.js`. This plugin's package.json already satisfies that declaration — no changes needed.
- The slots this plugin uses — `conversation.input.dock` (list/session) and the keyed `tool.call.toolview` — are still declared by the official client on 0809 (`tool.call.toolview`'s owner type matches 0808); the `useSession` snapshot and todos projection contracts are unchanged.
- **Build requirement**: the 0809 host validates the build artifacts of `dshClient` packages at activation; if missing, it throws `ClientPackageCompositionError` and **refuses to start `dsh web`** — after upgrading the snapshot or changing the source, you must re-run `pnpm run build` before starting, otherwise the browser fetches the stale `lib/client.js`.

## 0810 compatibility notes (snapshot0810, verified on a real instance)

- **Metadata discovery change**: 0810's ClientModuleHostService scans the package.json of loaded plugins at startup, but reads only the **nested `dsh.client`** (`resolveMeta` in `packages/client/modules/src/index.ts`, `pkg.dsh.client`); when the top-level `dshClient` field cannot be read, it is silently dropped from the boot graph — no logs, no errors, "starts fine but no plugins at all". This plugin has migrated from top-level `dshClient` to nested `dsh.client` (inject/platform preserved as-is); on 0810 a real instance confirmed that `window.__DSH_BOOT__` includes this plugin and all progress bar states work.
- **No rebuild needed**: the `lib/client.js` build artifact is unchanged and package.json does not participate in compilation; with a symlink install, edits to the source repo take effect immediately without reinstalling.

## 0811 compatibility notes (snapshot0811, verified on a real instance)

- **cordis rename (the only official change in this snapshot affecting this plugin)**: 0811 renamed the vendored cordis from `cordis@4.0.0-rc.7` to **`@deepseek-ai/cordis@4.0.1-rc.1`** (all official client packages now import from `@deepseek-ai/cordis` accordingly). This plugin has only type-only imports of cordis (`import type { Context } from 'cordis'` in `src/invariant.ts`), and the **build artifacts (lib/*.js) have zero cordis runtime imports** — the rename does not affect runtime loading of the built bundle; however, when the source typechecks against the npm rc.2 baseline, the bare `cordis` import reports TS2307 (this one spot only). After **migrating the type import to `from '@deepseek-ai/cordis'`** everything is green. It is recommended to also migrate `peerDependencies.cordis` to `@deepseek-ai/cordis: ^4.0.1-rc.1`.
- **Real-instance boot verification**: after starting web on snapshot0811 (`snapshots/20260811T152241Z`), the `window.__DSH_BOOT__` manifest includes `@dsh-external/dsh-ui-progress` (inject: `dsh-client-locale`/`dsh-client-runtime`/`dsh-client-ui-conversation`), and `/plugins/@dsh-external/dsh-ui-progress/client.js` returns 200. The slot this plugin uses — `conversation.input.dock` (list/session) — and the `useSession` snapshot and todos projection contracts all remain declared on 0811.
- **Test fixture drift**: the source passes typecheck fully green; `tests/session-progress-bar.spec.tsx` has two fixtures that did not keep up with fields added in 0811 — `ConversationSnapshot.views` (view snapshot storage added in 0811) and `InputState.imageIds` (draft image attachments added in 0811) — source and build artifacts are unaffected (the fixtures were completed in the v0.9.1 final-snapshot adaptation, see below).

### 0812 / final snapshot compatibility notes (snapshots/20260812T172954Z-final, verified on a real instance)

- **cordis rename finalized**: this plugin has migrated its type-only imports (`import type { Context } from '@deepseek-ai/cordis'` in `src/invariant.ts`) and `peerDependencies`/`devDependencies` to `@deepseek-ai/cordis` (`^4.0.1-rc.1`; `@deepseek-ai/cordis@4.0.1-rc.4` on the npm rc.5 baseline) — the build artifacts (lib/*.js) have zero cordis runtime imports, npm rc.5 consumers typecheck fully green, and `npm install` needs no `--legacy-peer-deps`.
- **invariants source package move (affects local typecheck only)**: the final snapshot moved the `@deepseek-ai/dsh-invariants` source package from `packages/support/invariants` to `packages/runtime-diagnostics/invariants`; the devDependencies path has been updated accordingly. The service name `invariants` and the registration protocol are unchanged, so runtime is unaffected.
- **Test fixtures completed**: the fixtures in `tests/session-progress-bar.spec.tsx` now include the fields added since 0811 — `ConversationSnapshot.views` (empty view snapshot `{ get: () => undefined }`) and `InputState.imageIds` (empty array) — typecheck (including tests) and all 27 unit tests pass against the final snapshot baseline.
- **Real-instance boot verification**: after starting web on the final snapshot (`snapshots/20260812T172954Z-final`), the `window.__DSH_BOOT__` manifest includes `@dsh-external/dsh-ui-progress` and `/plugins/@dsh-external/dsh-ui-progress/client.js` returns 200; the boot manifest also includes this plugin after starting `dsh web` as an npm rc.5 consumer. The slot this plugin uses — `conversation.input.dock` (list/session) — and the `useSession` snapshot and todos projection contracts all remain declared on both the final snapshot and rc.5. typecheck, build, and all 27 unit tests pass against the final snapshot baseline.

## Features

- **Persistent session progress bar** (`conversation.input.dock`, the input dock area): reads the framework's `useSession` snapshot to render real execution state — running/idle, the name of the currently in-flight tool, the number of tool results settled in the current window, and the current round. While running, the loader on the left **spins**, the progress bar shows a shimmer sweep plus a brand-color halo pulse, and the fill width animates with easing. **Fill width**: when a `todos` projection exists, it reflects the real completion ratio ((completed + in-progress) / total; in-progress tasks count toward progress); without todos it stays fixed at the default **100%** — there is no dedicated projection for overall session progress, so no fake percentage is shown (since v0.8.0 the old segmented fill of "one step per settled tool result, window cap 10" was removed). While running it additionally shows **real-time elapsed time** (from the start of the current round, ticking in 0.1s steps; once a full minute passes it collapses to `XmYs` and then increments by seconds) and an **ETA estimated remaining time** (only when the model gives an `eta` estimate in a recent `report_progress` report — no linear extrapolation; not shown when the model does not report one); when idle, it shows the previous round's elapsed time. **When a session completes (idle after at least one round), the progress bar switches to light green**; sessions that have never run keep a neutral blue-gray.
- **Interrupted orange-red state** (added in v0.8.0): when the **most recently finished round of this session was interrupted/stopped** — a manual stop, an API failure, or any other unexpected cause — the progress bar switches to **orange-red** (light orange background + orange-red fill/icon/percentage + slow pulse), and the label reads "已中断". It takes precedence over the regular running/completed color schemes. The judgment is based on the **most recent round only**: a new round sent after an interruption that completes normally restores the normal color scheme (the leftover interrupted marker stays in the window but no longer triggers). The attention state (amber, see below) still takes precedence over the interrupted state.
- **Real-time token generation rate** (added in v0.9.0): while running, when **the model is generating** (there is streaming partial content and no pending human interaction), the progress bar shows the live rate next to the elapsed time (e.g. `12.3 tok/s`, italic brand color, with a fixed minimum width to keep the right side of the progress bar stable). Streaming chunks do not carry token counts (the core side only has provider usage after a round ends), so this value is a **self-calibrating estimate**: initially it converts the current partial's token count using a CJK-aware character density (wide CJK characters count as 1 character ≈ 1 token; everything else uses the same 4 characters ≈ 1 token as the core token-meter); once any settled step in the window reports real output tokens, its "real tokens ÷ weighted characters" density is used to scale the current streaming estimate — the number then tracks the real density of the tokenizer of the model in use, rather than a fixed character heuristic. The rate is computed as a **sliding-window average** (1s window by default): refreshed about every ~1s, counting only tokens newly arrived within the latest window, eliminating per-chunk flicker; an empty window keeps the last reading instead of resetting to zero. The rate is divided by the window duration (excluding TTFT) — consistent with the settled tokens/s (`outputTokens/decodeMs`) the core side shows after a round ends, so the running value can be compared directly with the settled value. Each new step restarts the calculation; it is hidden during tool execution, while waiting for human interaction, and after a round ends (the exact post-settlement rate is presented by the core StatsLine, to avoid showing the same fact twice).
- **Attention (pending todos)**: when this session or one of its descendant subagent sessions has **interactions waiting for human handling** (sandbox command approval / option selection / plan review), the progress bar switches to an **amber warning state** (light amber background + amber fill/icon + slow pulse), with text indicating the source and type — `等待审批` / `需要选择` (this session), `子代理等待审批` / `子代理需要选择` (subagent), `等待审批 · 子代理 2 项待处理` (when both coexist). Subagent sessions are hidden by the official sidebar; their pending state is read from the global session list (the `pendingInteraction` of rows with `origin: 'subagent'`) — this is the main outlet through which the main agent perceives waiting subagents. Priority: pending (amber) > running (blue) > interrupted (orange-red) > done (green) > idle (neutral).

## Model Experience

Since v0.8.0 this plugin **no longer injects any model-visible input**: the `report_progress` tool and the reporting guidance paragraph have been removed (the host half is empty); the plugin only does browser-side rendering. If another host plugin registers a `report_progress` tool, the ETA line of the session progress bar will still read the `eta` field it reports (see above).

It injects no user-message content; session text and context injection are unaffected.

## 安装

See [INSTALL.md](INSTALL.md).

## 配置

No configuration keys. After installation, just insert one line into the configuration tree:

```yaml
- insert:
    - id: dsh-ui-progress
      name: '@dsh-external/dsh-ui-progress'
```

## Export shape

Browser half `./client` (an `apply`/`inject` namespace plugin), an empty Node half `./index`, and the standard invariant companion `./invariant`.

## Known Limitations and Deferred Work

- There is no dedicated projection for overall session progress: without todos the fill is fixed at 100% and no fake percentage is shown; the todos ratio only reflects the current todos list, not the session's progress across the whole conversation.
- Interruption detection is judged by the current window plus the most recent round: an interrupted round leaves no trace and cannot be detected when it has **neither partial content nor an in-flight tool call**; after pagination/compaction old markers are truncated and the interrupted state fades accordingly. Rounds on a retry path (model-retry) do not show the interrupted state.
- The ETA depends entirely on the model reporting the `eta` field in `report_progress`: if the model does not report it or reports an invalid value (non-string/non-positive), it is not shown; the progress bar takes the **most recent** reported eta in the window and hides it when the most recent report lacks an eta (even if an earlier report had one).
- The browser half takes effect on page refresh (the host half is empty, so upgrading the install does not require restarting `dsh web`).
- CSS animation constants (duration/easing) are local literals (the current style system has no motion-token family yet); the interrupted orange-red is a `color-mix` of the warn/error tokens (the style system has no dedicated orange token).
- The real-time token rate is an **estimate** (streaming chunks carry no token counts): it starts from a CJK-aware character density and **self-calibrates** by density as soon as a settled step reports real provider usage (the first round before the first calibrating step still uses the character heuristic); reasoning/body/tool arguments are all counted; it is shown as a 1s sliding-window average (local literal `TOKEN_RATE_WINDOW_MS`), not a provider-reported value, and after a round ends the settled tokens/s from the core StatsLine is authoritative.
