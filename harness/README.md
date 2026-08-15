# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source coding agent built on the DeepSeek Harness SDK.

It uses an architecture where **everything is a plugin**.

## Internal testing notice

DeepSeek Harness is under internal testing. Features and interfaces may change.

The internal build uploads all Session Logs by default to help diagnose reported problems. Set `DSH_TELEMETRY_DISABLED=1` to disable telemetry. Send feedback through the internal WeChat group.

## Install

Clone the repository, then run the installer:

```sh
git clone <repo-url>
cd deepseek-harness
scripts/install.sh
```

The installer requires `git` and Node `^22.19 || >=24`, offers to install `pnpm` when it is missing, prompts for a DeepSeek API key, builds the required repository artifacts, and launches the Web UI.

The default active checkout is `~/.dsh/source/current`, and the launcher is linked into `~/.local/bin`. Re-run the installer to update. [`scripts/install.sh`](scripts/install.sh) owns alternate locations, update mechanics, and recovery options.

## Use DeepSeek Harness

### Web UI

For the recommended local interface, choose Web UI when the installer finishes. To start it later, or after updating the active checkout, build the repository and run:

```sh
(cd ~/.dsh/source/current && pnpm run build)
dsh web
```

The path above is the installer's default. If you set `DSH_SOURCE` or `DSH_CURRENT`, or reused an existing checkout, replace `~/.dsh/source/current` with that checkout path; see [`scripts/install.sh`](scripts/install.sh) for details. The Web UI is served at `http://127.0.0.1:3080` by default.

### Profiles

`dsh` boots profiles — ordered stacks of plugin-bundle patch layers under your own overrides in `$DSH_HOME/profiles/<name>`:

```sh
dsh --profile web                       # the browser UI (same as: dsh web)
dsh plugin --profile tui add <package>  # install a plugin into a custom profile
dsh --profile tui                       # boot it
```

The [CLI contract](apps/cli/README.md#profiles) describes profile layout, layer semantics, and config dump commands.

### Headless

Run one task, print the final answer, and exit:

```sh
dsh run "summarize this workspace"
```

### Automation and SDKs

From a source checkout with `DEEPSEEK_API_KEY` in the environment or its root `.env`, start the ACP automation server:

```sh
pnpm run demo:acp
```

The [Python SDK](python/README.md) drives a bundled JSON-RPC runtime. The [examples](examples/README.md) cover the runnable headless, ACP, JSON-RPC, Code Mode, and self-referential compositions.

## Why DeepSeek Harness

Built-in capabilities cover file reading, editing, and search; shell and persistent PTY execution; reusable skills; task tracking, goals, plans, todos, and background tasks; subagents and workflows; sandboxing and approvals; settings and credentials; persistent, resumable, forkable, and queryable sessions; LSP and web access; context compaction; and telemetry. Each composition selects the subset appropriate to its surface. The Web UI includes Plan Mode.

- **Everything is a plugin.** Models, tools, policies, storage, context management, and interfaces are composable [Cordis plugins](docs/user/develop/basic/index.md), so deployments can extend or replace behavior without forking the agent loop. See the [architecture](docs/architecture.md) for the underlying design.
- **Runs are reconstructable.** Anything visible to the model is logged in the authoritative session stream; persistence, resume/fork/query, replay, telemetry, and UIs derive from the same events. See the [session-log architecture](docs/architecture.md#session-log).
- **Code Mode (opt-in).** It exposes a `run_code` tool and a generated TypeScript SDK; only program output re-enters model context. See [Code Mode](packages/core/tools/README.md#code-mode).
- **Self-referential Cordis tools are opt-in.** They let the agent inspect its live runtime and mount or unmount plugins while it runs. See the [Cordis tools](packages/cordis/tool-cordis/README.md).

## Community

Follow <a href="https://x.com/Deepseekharness">DeepSeek Harness on Twitter</a> for project updates.

## Development

Start with the [development guide](docs/development.md) and read the [architecture](docs/architecture.md) before changing packages.

For agents, follow [AGENTS.md](AGENTS.md).

DeepSeek Harness is currently in internal testing.

## License

[BSD 3-Clause](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
