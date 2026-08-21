# Marisa DSH Desktop

English | [中文](README.zh.md)

The `desktop/` application is the Wails v3 desktop shell for the Marisa DSH
distribution. It owns the native window, system tray, backend supervision, and
Windows installers. The Marisa harness and default plugins live in this same
repository; a Windows Release runs the bundled Marisa runtime rather than a
separately installed DSH checkout.

## Runtime behavior

```
Marisa DSH desktop shell
  -> starts the Marisa web backend
     -> waits for "dsh web: http://127.0.0.1:<port>"
        -> loads that URL in the embedded WebView window
```

The shell is the only graphical entry point. It never opens the system
browser, chooses an OS-assigned port by default, and restarts a failed backend
with bounded backoff. Closing the window hides it in the system tray; choosing
**Quit** from the tray stops the backend process tree and exits the app. The
tray also provides show/hide and login-autostart controls.

Windows requires WebView2. It is included with current Windows 11 systems;
Windows 10 systems may need the [Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).

### IME candidate window placement

With a TSF input method (Microsoft Pinyin etc.), the candidate window can
stick to the top-left corner of the screen instead of following the caret.
This is the TSF fallback position: WebView2 reports the caret's screen
coordinates to the input method, and a stale parent-window position or scale
factor (after tray hide/show, restore, or a DPI change) invalidates the
conversion. The shell re-asserts the WebView2 parent-window position after
window show, restore, un-minimise, and DPI changes, and logs the display
scale factor in `marisa-desktop.log` lines prefixed `webview ime keepalive`.
If the candidate window still lands at the top-left, update the Evergreen
WebView2 Runtime and compare against 100% display scaling to isolate a
host-layer cause.

## Windows releases

Download a tagged build from the [Marisa DSH Releases page](https://github.com/LoserFox/marisa-distro/releases).
Releases are created only when a maintainer manually starts the gated Release
workflow after checking the rendered desktop UI and the MSI install, launch,
and uninstall flow. Pushes, pull requests, and scheduled checks do not publish
user binaries.

Each supported Windows Release has two self-contained choices:

- `Marisa-DSH-windows-x64.msi`: the recommended per-user installer. It
  installs the shell and prepares the packaged backend during installation, so
  the first application launch does not need to unpack it.
- `Marisa-DSH-windows-x64-standalone.exe`: a portable single executable. Its
  first launch materializes the bundled backend under the current user's local
  application-data directory; later launches reuse the matching version.

Both formats contain Node, the Marisa harness, the release profile, and its
default plugins. They do not require system Node, pnpm, or a separately
installed `dsh`. Check the `SHA256SUMS.txt` asset before running a download.
Windows artifacts are currently unsigned, so SmartScreen can show an unknown
publisher warning.

## Experimental platforms

Linux x64 and macOS Apple Silicon artifacts, when attached to a Release, are
explicitly experimental. They are desktop shells, not Windows-equivalent
self-contained distributions: they use a compatible `dsh` from the user's
environment. Linux also needs the system GTK/WebKit runtime; the macOS app is
currently unsigned and not notarized. A failure to build either experimental
asset does not block the verified Windows Release.

## Development backend

A plain development build does not embed a backend. It starts the local command
described by `DSH_WEB_CMD`, or `dsh web --port {port}` when that variable is
unset. Build the Marisa harness and profile first; contributors normally use
the repository-root build pipeline on Windows:

```powershell
pwsh -NoProfile -File build.ps1
```

That pipeline requires Node 22 or newer, pnpm 11 or newer, Go, and `python3`.
It builds the harness and required plugins, materializes the Marisa profile,
performs the backend self-check, and writes a development shell to
`release/dsh-shell.exe`. Use a local built `dsh` command or set
`DSH_WEB_CMD` before starting that development shell.

### Development loop

`pnpm dev:desktop` starts the same HMR watcher and `--dev` backend as `pnpm dev`,
then launches the desktop shell instead of a browser. It rebuilds
`release/dsh-shell.exe` automatically whenever `desktop/` Go sources are newer
than the binary, so a shell change only needs a restart (Ctrl+C and re-run) —
no manual `go build`. The shell's stdout/stderr are relayed to the terminal,
and its persistent logs go to `<repo>/.dev/logs/` (`MARISA_LOG_DIR`) instead of
the default cache directory, one file per launch with `marisa-desktop.log`
pointing at the latest.

WebView2 DevTools are available from the tray menu item 「打开 DevTools」 in
non-production builds; `MARISA_DEVTOOLS=1` opens them automatically once the
window is ready. Client-plugin source changes hot-reload through the same
watcher as the web mode; harness server-side or profile composition changes
still need `pnpm build` and a restart.

The shell reads these variables before it creates the window or starts a
development backend:

- `DSH_WEB_CMD`: complete backend command line. `{port}` is replaced with the
  selected port. The default is `dsh web --port {port}`.
- `DSH_APP_WORKSPACE`: working directory for the backend. It defaults to the
  current user's home directory.
- `DSH_APP_PORT`: requested backend port. It defaults to `0`, allowing the OS
  to select an unused port.
- `MARISA_DEVTOOLS`: set to `1` to open WebView2 DevTools when the window is
  ready (non-production builds only).
- `MARISA_LOG_DIR`: persistent log directory. Defaults to the OS cache
  directory (`%LOCALAPPDATA%\marisa-distro\logs` on Windows).
- `MARISA_LOG_LEVEL`: set to `debug` for per-line backend stdout, window
  visibility, and webview navigation events. Defaults to `info`.
- `MARISA_CONSOLE` (or the `--console` startup argument): attach a terminal
  window and mirror the persistent log to it. Windows packaged builds are GUI
  subsystem binaries with no console; only this opt-in creates one. Useful for
  on-site diagnosis without opening the log file.
- `--minimal` (startup argument): boot directly with the minimal profile
  (harness-shipped base + web-app template, no marisa plugins), skipping the
  full composition. Useful when a plugin or composition breaks startup.
- `--rescue` (startup argument): enter the rescue-mode page directly without
  starting the backend, for manual backup/reset/reinstall actions.

A three-stage boot state machine (see
[docs/RESEARCH-rescue-mode-implementation-20260822.md](../docs/RESEARCH-rescue-mode-implementation-20260822.md))
downgrades automatically: two consecutive full-composition failures (backend
never publishes a URL, fast abnormal exit, or page-level JS errors / white
screen detected by the shell's page-health probe) switch to the minimal
profile; two more failures there open the rescue page. The tray menu's
"Retry Full Mode" pulls back to the full composition at any time.

The shell enforces single-instance: launching the app again does not create a
second window, tray icon, or backend — it notifies the running instance, which
shows and focuses its main window, then the second process exits.

The tray menu also carries diagnostics shortcuts: 「打开日志目录」「打开数据
目录」open the respective folders in the system file manager, 「重启后端」
kills the current backend so the supervisor relaunches it (useful after
harness or profile changes), 「打开 DevTools」 opens the webview inspector
(non-production builds), and 「版本信息」 shows the backend version, install
form, and log location.

Windows packaged builds deliberately replace `DSH_WEB_CMD` with their bundled
launcher. Do not use those variables to substitute an arbitrary backend into a
published Windows package.

## Startup logs

The desktop shell and bundled backend always write a persistent log on
startup, with one file per launch:
`%LOCALAPPDATA%\marisa-distro\logs\marisa-desktop-YYYYMMDD-HHMMSS.log` on
Windows (`MARISA_LOG_DIR` overrides the directory); launches within the same
second get a `-2`, `-3`, … suffix. The stable entry point
`marisa-desktop.log` is a hard link to the newest launch file (a one-line text
pointer when hard links are unavailable), so fixed-path entry points such as
the tray 「版本信息」 dialog keep working. A single launch file rotates to `.1`
in the write path once it reaches 5 MiB, and startup cleanup keeps only the 20
most recent launches. Backend stdout (debug level) and stderr, plus the
shell's startup, readiness, exit, restart, and tray diagnostics, are recorded
in the current launch file. Shell log lines carry `file:line`; backend
passthrough stays verbatim. Review logs for local paths, plugin configuration,
and other sensitive information before sharing them.

## Verification

For the repository-wide validation and packaging rules, see
[the packaging guide](../docs/packaging.md) and
[the contributor guide](../CONTRIBUTING.md). A release requires more than an
HTTP check: maintainers must observe a real rendered window and verify MSI
installation, startup, and removal.
