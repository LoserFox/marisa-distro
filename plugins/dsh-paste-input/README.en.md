# dsh-paste-input

[简体中文](./README.md) | **English**

A file-input enhancement plugin for the DSH WebUI: **Ctrl+V paste** + **whole-page drag & drop** + **select files/folders**. On send, files are copied into the session workspace's temporary attachments directory, and the attachment text blocks in conversation bubbles are **collapsed into file chips**.

Derived from [dsh-external/dsh-multimedia-webui-input](https://github.com/dsh-external/dsh-multimedia-webui-input) (MIT), adding clipboard paste input, a first-use notice dialog, and bubble attachment collapsing on top of it.

## 版本兼容 / Version compatibility

Compatible with DSH snapshot0808 (`snapshots/20260808T121140Z`), snapshot0809 (`snapshots/20260809T140917Z`), snapshot0810 (`snapshots/20260810T155924Z`), snapshot0811 (`snapshots/20260811T152241Z`) and the final snapshot snapshot0812 (`snapshots/20260812T172954Z-final`): the registered slots (`conversation.input.left` / `conversation.input.dock` / `settings.section`) remain declared on 0808~0812; on 0812 the dependent services went through official renames — `slash` → `inputTriggers` (client side, migrated together with the package rename `@deepseek-ai/dsh-client-ui-slash` → `@deepseek-ai/dsh-client-ui-input-trigger`) and host-side `httpServer` → `webServer`; this plugin's v0.1.3 has been migrated in sync (both halves of lib + the `dsh.client` metadata, see below). Verified in practice on 0809 — the full chain of paste → copy into the workspace attachments directory → bubble chip collapsing works; 0811 and the 0812 final snapshot passed real boot verification (see below).

**npm release compatibility**: compatible with the DSH npm release `@deepseek-ai/dsh@0.0.1-rc.5` (dist-tag `next`, i.e. the npm release of the final snapshot snapshot0812; `npm exec -p @deepseek-ai/dsh@0.0.1-rc.5 -- dsh --profile web --port <port>` accesses the specified version and starts it in lib production mode), while remaining compatible with `@deepseek-ai/dsh@0.0.1-rc.2` (the npm release of snapshot0811). Tested in practice (npm rc.5 baseline): after `dsh web` starts, the `window.__DSH_BOOT__` manifest includes `@dsh-community/dsh-paste-input` (inject: `dsh-client-runtime`/`dsh-client-ui-input-trigger`/`dsh-client-ui-conversation`/`dsh-client-ui-settings`), and `/plugins/@dsh-community/dsh-paste-input/client.js` returns 200; the client half registers correctly through `window.__ModuleLoader__.load`, and the host half's `webServer` upload route loads successfully in the rc.5 consumer. This plugin has **no cordis dependency at all** (no peerDependencies; the lib build output has no cordis imports) — the 0811 cordis rename (`cordis` → `@deepseek-ai/cordis`) has zero impact on this plugin, and `npm install` needs no extra flags.

### 0809 compatibility notes (verified in practice)

- **Loading mechanism change**: 0809 refactored the client plugin mechanism — the old `dsh.plugin.json` manifest + `resolveClientPath` (`packages/plugin/plugin`) were removed in favor of a **`dshClient` declaration in package.json** (`platform: 'web'`, optional `inject`/`immediately`) + `exports["./client"]` pointing at the build output; the host scans loader entries to compose the boot graph, and the Web side fetches from `/plugins/<id>/client.js`. This plugin's package.json already satisfies that declaration, no change needed.
- The attachment message protocol (the `==== DSH_PASTE_INPUT_V1 ====` marker) and the `.dsh/tmp/attachments/<session>/<send>/` directory logic do not depend on snapshot-internal implementation details; the full chain was verified successfully in practice on 0809.
- **Build requirement**: the 0809 host validates the build output of `dshClient` packages at activation; if missing, it throws `ClientPackageCompositionError` and **refuses to start `dsh web`** — after upgrading the snapshot or changing source code, you must re-run `pnpm run build` before starting, otherwise the browser fetches the stale `lib/client.js`.

### 0810 compatibility notes (snapshot0810)

- **Metadata discovery change**: 0810's ClientModuleHostService scans the package.json of loaded plugins at startup, but only reads the **nested `dsh.client`** (`resolveMeta` in `packages/client/modules/src/index.ts`, `pkg.dsh.client`); an unread top-level `dshClient` field silently drops the plugin from the boot graph — no logs, no errors, "starts fine but no plugins". This plugin has migrated from the top-level `dshClient` to the nested `dsh.client` (inject preserved as-is); the `lib/client.js` build output is unchanged (package.json does not participate in compilation), and with a symlink install, editing the source repo takes effect immediately — no reinstall needed.

### 0811 compatibility notes (snapshot0811, verified in practice)

- **The cordis rename has zero impact on this plugin**: 0811 renamed the vendored cordis from `cordis@4.0.0-rc.7` to `@deepseek-ai/cordis@4.0.1-rc.1` (all official client packages accordingly switched to importing from `@deepseek-ai/cordis`). This plugin does not import cordis (no peerDependencies, no cordis references in the lib build output), so no migration is needed.
- **Real boot verification**: after snapshot0811 (`snapshots/20260811T152241Z`) web starts, the `window.__DSH_BOOT__` manifest includes `@dsh-community/dsh-paste-input` (inject: `dsh-client-runtime`/`dsh-client-ui-slash`/`dsh-client-ui-conversation`/`dsh-client-ui-settings`), and `/plugins/@dsh-community/dsh-paste-input/client.js` returns 200. The slots this plugin uses — `conversation.input.left`/`conversation.input.dock` (declared by `ui-conversation`) and `settings.section` (declared by `ui-settings`) — remain declared on 0811; the `slash` service and the `window.__ModuleLoader__` loading protocol are unchanged.

### 0812/final snapshot compatibility notes (snapshots/20260812T172954Z-final, verified in practice)

- **Client service rename: `slash` → `inputTriggers`**: the final snapshot renamed the input-trigger service from `slash` to `inputTriggers` (renamed together with the official package `@deepseek-ai/dsh-client-ui-slash` → `@deepseek-ai/dsh-client-ui-input-trigger`; the service itself and the `registerSource` API are unchanged). This plugin's `lib/client.js` has been migrated in 4 places (two inject arrays + the `ctx.get` + the `registerSource` call), and the inject list in the `dsh.client` metadata has likewise migrated from `dsh-client-ui-slash` to `dsh-client-ui-input-trigger`.
- **Host service rename: `httpServer` → `webServer`**: the final snapshot renamed the host-side HTTP route registration service from `httpServer` to `webServer` (provided by `packages/host/webserver`; the `register({ kind: 'prefix', path, handler })` API is unchanged). This plugin's `lib/index.js` has been migrated in 2 places (the inject array + the `ctx.webServer.register` call), and the upload route is registered as usual.
- **The cordis rename has zero impact on this plugin**: as with 0811, this plugin does not import cordis (no peerDependencies, no cordis references in the lib build output); the `cordis` → `@deepseek-ai/cordis` rename (`4.0.1-rc.4` on the npm rc.5 baseline) has zero impact, and `npm install` needs no extra flags.
- **Real boot verification**: after the final snapshot (`snapshots/20260812T172954Z-final`) web starts, the `window.__DSH_BOOT__` manifest includes `@dsh-community/dsh-paste-input`; after the npm rc.5 consumer's `dsh web` starts, the boot manifest likewise includes this plugin (inject now shows `dsh-client-ui-input-trigger`), `/plugins/@dsh-community/dsh-paste-input/client.js` returns 200, and the host half's `webServer` upload route loads successfully. The slots this plugin uses — `conversation.input.left`/`conversation.input.dock` (declared by `ui-conversation`) and `settings.section` (declared by `ui-settings`) — remain declared on the final snapshot and rc.5; the `inputTriggers` service and the `window.__ModuleLoader__` loading protocol are unchanged.

## 更新记录 / Changelog

### 2026-08-13 · v0.1.3 — final snapshot service rename migration (snapshot0812 + npm rc.5)

- **Migration (client)**: `slash` → `inputTriggers` (4 places in lib/client.js: inject arrays ×2 + the `ctx.get` + the `registerSource` call); the `dsh.client` metadata inject migrated from `@deepseek-ai/dsh-client-ui-slash` to `@deepseek-ai/dsh-client-ui-input-trigger` — the final snapshot renamed the input-trigger service together with the official package; the service and the `registerSource` API are unchanged
- **Migration (host)**: `httpServer` → `webServer` (2 places in lib/index.js: the inject array + the `ctx.webServer.register` call) — the final snapshot renamed the host-side HTTP route service; the `register({ kind: 'prefix', path, handler })` API is unchanged
- **Verification**: real boot verification passed on the DSH final snapshot (`snapshots/20260812T172954Z-final`) and the npm rc.5 (`@deepseek-ai/dsh@0.0.1-rc.5`) consumer (boot manifest includes this plugin, client.js returns 200, webServer upload route loads successfully)

### 2026-08-11 · v0.1.2 — client plugin metadata migration (snapshot0810)

- **Migration**: package.json migrated from the top-level `dshClient` declaration to the nested `dsh.client` (inject preserved as-is) — 0810's ClientModuleHostService only reads `pkg.dsh.client`; the old field is silently ignored and the plugin does not enter the boot graph
- **Verification**: real verification passed on DSH snapshot0810 (full chain: paste → copy into the attachments directory → bubble chip collapsing)

### 2026-08-10 · v0.1.1 — fix misplacement of bubble-collapsed chips

- **Fix**: when text is typed both before and after chips on send (especially multi-file sends), the collapsed file chips were mispositioned — previously all user text was merged into a single text block piled at the top, the first chip floated to the right of the first line of text due to the flex layout, and the remaining chips scattered below the text block; now they render interleaved in source order (text → chip → text → chip…), each text segment occupies its own line, and chips of adjacent attachment blocks line up side by side automatically
- **Fix**: the collapsed-area text and chips now align with the bubble's internal 16px text indent (removing the previous extra horizontal inset and bottom gap)
- **Verification**: real verification passed on DSH snapshot0809

## Features

- **Ctrl+V paste**: paste a screenshot / copied image / file → added to the input box as an attachment (a notice dialog pops up on first paste; you can check "Don't show again", and the choice persists in browser localStorage)
- **Whole-page drag & drop**: drag files/folders to anywhere on the page (chat area, blank space, input box) to add them as attachments; dragging text/links keeps the browser's default behavior
- **Select**: the paperclip button on the left of the input box → select files / select folders
- **Bubble collapsing**: after sending, the verbose attachment-path text block in the message bubble (carrying the `==== DSH_PASTE_INPUT_V1 ====` marker protocol) is automatically collapsed into a 📎 file chip; text you typed before and after the chip is preserved interleaved in original order (on multi-file sends, text and each file's chip alternate segment by segment, with each chip on its own line); hovering the chip shows the complete original attachment block (paths/manifest/file list), and clicking the chip copies the full path
- On send, files are copied to `<session workspace>/.dsh/tmp/attachments/<session>/<send>/`, and the absolute paths are prefixed to the message for the model — no permission issues
- Settings panel: attachment usage statistics and cleanup per session/workspace (protected by ownership markers, with double confirmation)

## Working with dsh-vision: screenshot recognition

Together with the [dsh-external/dsh-vision](https://github.com/dsh-external/dsh-vision) plugin (which registers the `view_image` tool and bridges any OpenAI-compatible VLM, defaulting to Zhipu's free `glm-4.6v-flash`), screenshots pasted or dragged into this plugin can be **recognized directly**:

1. Take a screenshot (Win+Shift+S) → paste it or drag it into DSH
2. After sending, the screenshot is copied into the workspace attachments directory
3. The model sees the attachment path → calls `view_image` → the VLM returns the image content (OCR text extraction, reading charts, recognizing UI layouts, etc.)

The two plugins are zero-coupled: this plugin handles "getting files into the conversation", dsh-vision handles "looking at images", and they connect through the workspace attachment paths.

## Attachment message protocol

Attachment blocks are delimited by an explicit marker (model-visible text, used by bubble collapsing for recognition):

```
==== DSH_PASTE_INPUT_V1 ====
<absolute path of the attachments root directory>

Files: N
Manifest: .dsh-paste-input.json
Attached files (paths are relative to the root above):
- "file.txt" (2.0 KiB)
==== END DSH_PASTE_INPUT ====
```

Only the marked format is supported (historical unmarked messages are not collapsed). A blank line is placed before and after the marker so that user-typed text and the marker never share a line.

## Limitations

- Support for pasted files varies by browser: **Chrome/Edge** only expose media such as images (screenshots, copied images) and text/HTML in the paste event — pasting after "copying files" from the file manager produces no file entries; **Firefox** supports pasting files, but likewise **does not provide absolute paths**. Browsers never expose local file paths to web pages for security reasons, so pasted content is always stored with the `filename` as a relative path — for scenarios that need the original path, use **drag & drop** or the **select files/folders** button
- Single file ≤ 1 GiB, per batch ≤ 2 GiB, ≤ 10000 files, ≤ 64 levels

## Installation (profile mode)

```sh
dsh plugin --profile web add link:E:\deepseek-harness\dsh-paste-input
# and append to ~/.dsh/profiles/web/cordis.patch.yml:
# - insert:
#     - id: dsh-paste-input
#       name: '@dsh-community/dsh-paste-input'
```

Restart `dsh web` for it to take effect.

## License

MIT (includes the derivation notice for dsh-multimedia-webui-input)
