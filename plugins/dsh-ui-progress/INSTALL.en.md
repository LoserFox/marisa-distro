# 安装

[简体中文](./INSTALL.md) | **English**

> **Version selection**: `v0.9.1` (default) targets DSH snapshot snapshot0810 (`snapshots/20260810T155924Z`) and is also compatible with snapshot0811 (`snapshots/20260811T152241Z`) and the final snapshot snapshot0812 (`snapshots/20260812T172954Z-final`); `v0.9.0` targets snapshot0809 (`snapshots/20260809T140917Z`); `v0.8.0` targets snapshot0808 (`snapshots/20260808T121140Z`); `v0.6.0` targets snapshot0807 (`snapshots/20260807T130646Z`); `v0.1.0` targets snapshot0805 (`snapshots/20260805T134133Z`) and is installed via the legacy method. See [README.md](README.md#版本对应--version-compatibility) for the version mapping.

> **npm release**: `v0.9.1` is compatible with the DSH npm releases `@deepseek-ai/dsh@0.0.1-rc.5` (dist-tag `next`, i.e. the npm release of the final snapshot snapshot0812) and `@deepseek-ai/dsh@0.0.1-rc.2` (the npm release of snapshot0811); runtime/type/startup manifest verified on a real instance. Starting from 0811 the vendored cordis was renamed to `@deepseek-ai/cordis` — this plugin has migrated its type imports and peer to `@deepseek-ai/cordis` (`^4.0.1-rc.1`, which is `4.0.1-rc.4` on the npm rc.5 baseline), and a plain `npm install` no longer fails with ERESOLVE. Handled automatically by `dsh plugin`/pnpm installation.

Prerequisites: **a built DSH snapshot** (`~/.dsh/source/current` pointing at a snapshot containing `lib/` artifacts — the `link:` dev dependencies of `cordis` and the various `@deepseek-ai/dsh-client-*` packages resolve from that snapshot) + `dsh web` running. This plugin is a **pure browser-half plugin** (the host half is empty; since v0.8.0 it no longer bundles a `report_progress` tool or reporting guidance; browser half: progress presentation). Installing = ① the package is resolvable by the configuration tree + ② one line added to the configuration.

## snapshot0810 (v0.9.1) — profile installation

```sh
# 1. Clone the repo; build artifacts are checked in, no build needed
git clone https://github.com/lhh010/dsh-ui-progress.git
cd dsh-ui-progress && pnpm install

# 2. Install into the web profile (equivalent to running pnpm add under $DSH_HOME/profiles/web)
dsh plugin --profile web add link:/path/to/dsh-ui-progress
#   or as a pinned-tag git dependency:
#   dsh plugin --profile web add '@dsh-external/dsh-ui-progress@github:lhh010/dsh-ui-progress#v0.9.1'
```

> snapshot0809 users pin `#v0.9.0` (0809 build); snapshot0808 users pin `#v0.8.0` (0808 build, also compatible with 0809 hosts); snapshot0807 users pin `#v0.6.0` (old slot contract `conversation.chat.toolview`, not applicable to 0808/0809).

> Since v0.8.0 the host half is empty (no longer registers a `report_progress` tool or reporting guidance): after an upgrade install there is **no need to restart `dsh web`** — the browser half takes effect on page refresh. The 0809 host validates the build artifacts of `dshClient` packages at activation (missing artifacts throw `ClientPackageCompositionError` and refuse to start) — after upgrading the snapshot or changing the source, you must re-run `pnpm run build` before starting.

Configuration line (`$DSH_HOME/profiles/web/cordis.patch.yml`, hot-reloaded, no restart needed):

```yaml
- insert:
    - id: dsh-ui-progress
      name: '@dsh-external/dsh-ui-progress'
```

## snapshot0805 (v0.1.0) — legacy installation

### Option 1: clone + link into the harness (recommended)

```sh
# 1. Clone the repo; build artifacts are checked in, no build needed
git clone https://github.com/lhh010/dsh-ui-progress.git
cd dsh-ui-progress && pnpm install

# 2. Get the package into the harness dependency chain (at the DSH snapshot root, the one ~/.dsh/source/current points to)
pnpm add -w link:/path/to/dsh-ui-progress
```

> If your pnpm refuses `pnpm add -w` due to a store version mismatch, you can symlink manually instead:
> `mkdir -p node_modules/@dsh-external && ln -s /path/to/dsh-ui-progress node_modules/@dsh-external/dsh-ui-progress`

### Option 2: git dependency (pinned commit/tag, no implicit latest)

```sh
# Run at the harness root; <commit> is the release commit (use tag v0.1.0 for 0805)
pnpm add '@dsh-external/dsh-ui-progress@github:lhh010/dsh-ui-progress#v0.1.0'
```

### Configuration line (legacy 0805 mechanism)

`~/.dsh/config.yaml` (create it if it does not exist):

```yaml
- insert:
    - id: dsh-ui-progress
      name: '@dsh-external/dsh-ui-progress'
```

## Restarting `dsh web`

Plugin-set changes follow the "restart to take effect" discipline (applicable under the legacy 0805 mechanism; with the 0806+ profile method the configuration line hot-reloads and no restart is needed). Since v0.8.0 the host half is empty, so browser-half updates only need a page refresh. Stop the current web (Ctrl+C) and start it again.

## Verification

While a session is running: the loader on the left of the persistent progress bar above the input spins; while running it shows the real-time elapsed time, the **real-time token generation rate** (self-calibrating estimate + 1s sliding-window smoothing, shown while the model is generating, e.g. `12.3 tok/s`, refreshed once per second) and the ETA (when reported by the model). Sessions with a todos list show the real completion ratio; sessions without todos keep the fill fixed at 100%. After manually stopping a session or an API-error interruption, the progress bar switches to the **orange-red** "已中断" state; after the interruption, sending again and completing normally restores the green completed state.
