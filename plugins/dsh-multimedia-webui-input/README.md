# DSH Multimedia WebUI Input

[简体中文](README.zh.md) | English

![DSH Multimedia WebUI Input: file and folder send, model read/edit, and safe cleanup](promo/assets/dsh-multimedia-webui-input-demo.gif)

Independent community plugin for the current DeepSeek Harness Web client. It
adds file/folder selection and composer drag-and-drop without modifying the
official DSH source tree.

**Workspace Attachments** describes the current delivery mechanism, not a
separate product: selected WebUI resources are copied into the active Agent
workspace only at send time, so the Agent can read, edit, and verify them
through ordinary workspace tools.

The plugin deliberately uploads only when the user sends. The Host resolves
the live session workspace, streams files into
`.dsh/tmp/attachments/<session>/<send>/`, and then lets DSH's asynchronous
reference serializer prepend the resulting absolute path to the model message.
If preparation fails, DSH keeps the draft and attachment chip.

The Settings panel includes an on-demand **Multimedia input & file management** section. It
can inspect and clean either the active session or every session in the active
workspace. Both cleanup actions require confirmation and remove only committed
directories carrying this plugin's ownership marker. They never cross into a
different workspace or delete unknown content.

## Private distribution model

This plugin is currently distributed only through authorized private,
fingerprinted repositories. Clone the repository you were assigned and run its
local installer. The installer never fetches a hard-coded public repository;
repository URL/name/commit are audit metadata only and do not decide runtime
compatibility.

After cloning an assigned private repository:

```sh
./install.sh
```

```powershell
.\install.ps1
```

If a shell execution policy or a ZIP download loses the wrapper's executable
bit, the cross-platform fallback is the same installer directly:

```sh
node scripts/install.mjs install
```

The script uses the `dsh` already on `PATH`. Source-based installations that
cannot be inferred can be selected explicitly without editing the plugin:

```sh
DSH_EXECUTABLE=/path/to/dsh DSH_CHECKOUT=/path/to/dsh-source ./install.sh
```

It capability-probes the target and selects the matching official integration:

- current DSH: copies an owned snapshot under `~/.dsh/community-plugins`, then
  uses `dsh plugin --profile web` to register its native profile bundle;
- older DSH: retains the marked personal-config and stable resolver bridge.

Both paths verify the composed result with `dsh --profile web --dump-config`
and roll back on failure. No registry daemon, source patch, DSH rebuild, or
installer beyond the target DSH itself is required. Current DSH already owns
the pnpm runtime used by its native plugin command.

Uninstall uses the same local script with `uninstall`. It removes the config
block and plugin package but preserves attachment data already copied into
workspaces.

```sh
node scripts/install.mjs uninstall
```

The eventual canonical private repository will live as a new repository under
the `dsh-external` GitHub organization. The surrounding DSH research workspace
and official snapshot are not part of this repository.

## Current status

Implemented and regression-tested against official snapshot
`snapshots/20260810T155924Z-8ec407cd64` (`5f8768c5`) with a reversible local
installer, Host upload protocol, composer integration, on-demand cleanup, and
cross-platform Node-only filesystem handling.

This is not an official DSH repository Plugin. It is a dual-face Cordis +
`dsh.client` profile bundle. Current DSH installs it through the native profile
plugin command. The package retains an identical legacy `dshClient` declaration
for the 0806 scanner; a regression test keeps both declarations in lockstep.
The small module-resolution bridge remains only for older DSH checkouts.

It does not hook or patch chat DOM. Integration uses official Cordis/Web
surfaces: `conversation.input.left`, `conversation.input.overlay`,
`conversation.input.dock`, asynchronous reference serialization,
`settings.section`, and a same-origin Host HTTP route.

## Installer ecosystem decision

The private [`deepseek-harness-distro`](https://github.com/dsh-external/deepseek-harness-distro)
zero-dependency SDK is useful for extension development and contract tests; it
is not an end-user installer. The private
[`plugin-registry`](https://github.com/dsh-external/plugin-registry) has since
converged on DSH's official bundle and repository-plugin formats. Its thin
console discovers this package from the root `package.json`: `dsh.bundle`
identifies an installable profile bundle and `dsh.client` identifies its WebUI
half. The former `dsh.plugin.json` registry manifest is historical and is not
added here because current registry code no longer consumes it.

Therefore the clone-local script remains the distribution entry, while current
DSH's own profile manager is the installation backend. The thin console may be
used as an optional second control surface without changing this package or its
runtime protocol; it is not a required dependency.

## Acknowledgements

Thanks to [@vlln](https://github.com/vlln) for reporting
[#1](https://github.com/dsh-external/dsh-multimedia-webui-input/issues/1) and
[#2](https://github.com/dsh-external/dsh-multimedia-webui-input/issues/2). The
reports prompted both the 0810 `dsh.client` compatibility fix and a review of
the registry's current official-bundle path instead of adding its retired
standalone manifest.

## Local promotional assets

- GIF walkthrough is displayed at the top of this README.
- [MP4 walkthrough](promo/assets/dsh-multimedia-webui-input-demo.mp4)

Both were captured from a real isolated DSH send/read/settings flow. The
recording helper is QA-only and does not add a demo mode to the product.
