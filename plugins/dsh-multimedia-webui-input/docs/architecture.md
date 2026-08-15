# Architecture and compatibility contract

[简体中文](architecture.zh.md) | English

## Product boundary

This is a small community dual-face plugin, not an official DSH repository
Plugin. Selection stays in browser memory. Sending invokes DSH's async
reference serializer, which creates a Host batch, uploads ordinary files with
two workers, commits the complete staging directory, and returns a model-facing
path block whose first line is the absolute attachment root. The root appears
once; file paths and the ownership manifest are relative to it, while the
manifest retains the complete original-to-actual mapping. This keeps the
literal user bubble bounded without weakening the model handoff.

DSH currently renders sent user text literally and exposes no third-party
message-renderer slot. Its Markdown sanitizer also rejects arbitrary local
absolute/file URLs in assistant prose. The plugin therefore does not install a
DOM observer or rewrite chat bubbles: model-facing text stays compact, complete
mapping stays in the manifest, and DSH's existing filesystem tool rows retain
their own clickable path behavior. Codex-style rich local-file citations can be
added safely only when DSH exposes a message renderer or local-file action
slot.

The Host always resolves `session.header.cwd` from the live session. A browser
cannot supply a destination directory. Final data lives under:

```text
<session cwd>/.dsh/tmp/attachments/<session key>/<send id>/
```

Every committed send owns a `.dsh-workspace-attachments.json` marker. Cleanup
may delete only directories carrying that marker.

## Why the package has no production dependencies

Current official DSH packages are private workspace packages and the public
artifact baseline is only proposed. The Host half therefore uses Node standard
library modules only. The checked-in browser artifact is a DSH client-module
factory and consumes only DSH-provided runtime seeds/services. A tester does
not install pnpm dependencies or rebuild DSH.

## Private repository distribution

Each tester may receive a differently fingerprinted private repository. The
installer copies files from its own checkout and never downloads a hard-coded
canonical URL. Git remote, commit, dirty state, and a digest of the shipped
runtime/installer files are hashed into audit metadata; the raw remote is not
retained because private URLs may contain credentials.

Current DSH owns profiles under `$DSH_HOME/profiles`. The installer publishes
an owned package snapshot at
`$DSH_HOME/community-plugins/multimedia-webui-input/package`, then invokes
`dsh plugin --profile web add link:<snapshot>`. The package's `dsh.bundle`
manifest points at `cordis.patch.yml`, so DSH records it in the profile bundle
stack and both Cordis and the current `dsh.client` scanner resolve the same
package. The identical top-level `dshClient` declaration remains for the 0806
scanner, with a regression test preventing the two declarations from drifting.
Source `staging-*` rotations do not affect that path. Older DSH checkouts keep
the previous stable-`node_modules` bridge. Official tracked source remains
untouched in both modes.

## Compatibility probes

Installation fails unless the target checkout still exposes all required
capabilities:

- `dsh.client` package discovery through `resolvePkgJson`, with the legacy
  `dshClient` declaration retained for the 0806 scanner;
- `conversation.input.left`, `conversation.input.overlay`, and `conversation.input.dock`;
- asynchronous `serializeReference` before the default prompt sink;
- the root-scoped `settings.section` contribution slot;
- longest-prefix Host HTTP routing.
- for current DSH, native profile bundle composition and `slots.inject()`
  declaration-lifetime registration.

After package publication, the installer runs the matching real composition
path and `dsh --profile web --dump-config`. Any failure rolls back the profile
registration and package snapshot. Uninstall first removes the dependency and
bundle layer, verifies the composed config no longer contains the plugin, and
only then removes installer-owned files.

Runtime compatibility is capability-based. The private repository URL, its
fingerprint, and the local checkout path never select behavior.

## Transport and resource rules

- Same Host/Origin and trusted-host checks as DSH's browser API boundary.
- 1 GiB per file, 2 GiB per send, 10,000 files, 64 levels by default.
- Raw request bodies stream to file handles with backpressure; no whole-file
  buffering.
- Browser upload concurrency is 2; Host admission is capped at 4.
- An incomplete batch is never published. Idle batches expire from the
  in-memory table after one hour, checked every ten minutes without scanning
  workspaces.
- Usage scans run only while the Attachments settings page is open or the user
  refreshes it; there is no background workspace index.
- Session cleanup verifies the current session id and ownership marker.
  Workspace cleanup stays under the current workspace attachment root, skips
  `.staging`, and ignores every unmarked directory. Both require an explicit
  second in-page confirmation click and use Node filesystem APIs on Windows,
  macOS, and Linux.

## Current baseline

Implemented against DSH snapshot `snapshots/20260810T155924Z-8ec407cd64`
(`5f8768c5`). This identifier records the verified baseline; it is not a
hard-coded runtime gate.
