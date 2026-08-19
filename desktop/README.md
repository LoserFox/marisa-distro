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

The shell reads these variables before it creates the window or starts a
development backend:

- `DSH_WEB_CMD`: complete backend command line. `{port}` is replaced with the
  selected port. The default is `dsh web --port {port}`.
- `DSH_APP_WORKSPACE`: working directory for the backend. It defaults to the
  current user's home directory.
- `DSH_APP_PORT`: requested backend port. It defaults to `0`, allowing the OS
  to select an unused port.

Windows packaged builds deliberately replace `DSH_WEB_CMD` with their bundled
launcher. Do not use those variables to substitute an arbitrary backend into a
published Windows package.

## Startup logs

On Windows, the desktop shell and bundled backend share
`%LOCALAPPDATA%\marisa-distro\logs\marisa-desktop.log`. Backend stdout and
stderr, plus the shell's startup, readiness, exit, and retry diagnostics, are
written there. The file rotates on startup after reaching 5 MiB, retaining the
previous file as `marisa-desktop.log.1`. Review logs for local paths, plugin
configuration, and other sensitive information before sharing them.

## Verification

For the repository-wide validation and packaging rules, see
[the packaging guide](../docs/packaging.md) and
[the contributor guide](../CONTRIBUTING.md). A release requires more than an
HTTP check: maintainers must observe a real rendered window and verify MSI
installation, startup, and removal.
