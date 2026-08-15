# dsh-desktop

English | [中文](README.zh.md)

Packages dsh as a desktop **window** that does not depend on an external browser (Wails v3 shell + WebView2). A normal development build starts `dsh web` from the user environment; the `embeddedbundle` release build embeds Node, the harness, and the profile in one EXE and does not require system Node/pnpm/dsh at runtime.

## Architecture

```
dsh-shell.exe        Wails shell (this Go program, the only executable)
  └─ spawns  dsh web --port 0     from user environment (dev) or embedded backend (release)
     └─ parses "dsh web: http://127.0.0.1:<port>" from the backend stdout
        └─ loads it in an embedded WebviewWindow
```

The shell is the single entry point and the daemon for the backend: it starts `dsh web --port 0` (port assigned by the OS to avoid conflicts), parses the actual listening address from the backend stdout, and loads it in an embedded WebviewWindow — never opening the system browser. If the backend exits abnormally (network/load failure etc.) it restarts with backoff (1s initial, 30s cap) and repoints to the new address.

**Tray-resident background**: closing the window hides it to the system tray instead of quitting — the backend keeps running. The tray icon (left-click toggles the window) has a menu: 打开 dsh (show the window), 开机自启 (toggle autostart on login, checkbox reflects the current state), and 退出 — only quitting from the tray terminates the backend (process tree: taskkill /T on Windows, SIGTERM→SIGKILL group on POSIX), so no orphan node is left behind; main waits for the daemon goroutine to settle before actually exiting. A navigation-ready guard delays `SetURL` until the webview exists (the WebView2 controller is created asynchronously; navigating earlier panics in Wails v3 beta).

## Backend requirements

- `dsh` on PATH — installed by `scripts/install-windows.ps1` from the [dsh-win-port](https://github.com/dsh-external/dsh-win-port) repository, or run from a patched checkout.
- The checkout must be built: `pnpm run build` (at least `build:web`).
- `DSH_WEB_CMD` — optional full command line for the backend; `{port}` is replaced with the resolved port. Default: `dsh web --port {port}`.

## Environment variables (read before loading, effective before the window/backend start)

- `DSH_WEB_CMD` — backend command line (`{port}` placeholder), default `dsh web --port {port}`
- `DSH_APP_WORKSPACE` — working directory (defaults to the user home; restricted/test environments can override)
- `DSH_APP_PORT` — backend listen port (default `0`, OS-assigned random port to avoid conflicts; an explicit value pins the port)

Startup page: the window first shows the embedded "starting dsh…" HTML (not Wails' default blank page) and switches to the real address once the backend is ready. If the backend never becomes ready, the window stays on the startup page and the shell keeps retrying with backoff.

## Download (recommended — no Go needed)

Prebuilt binaries are built by GitHub Actions on every push and attached to every `v*` tag:

- [Releases page](https://github.com/dsh-external/dsh-desktop/releases) — download `dsh-desktop-windows-amd64.zip` (contains `dsh-shell.exe`), unzip anywhere, run.

WebView2 is required at runtime (Windows 11 ships it; Windows 10 needs the Evergreen Runtime).

## Install

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-desktop-windows.ps1
```

Copies `dsh-shell.exe` (plus `icon.ico` for the shortcut) to `%LOCALAPPDATA%\dsh-desktop` with Start-menu and Desktop shortcuts. If no local build exists, the installer **downloads the latest prebuilt binary automatically** — no Go toolchain required. This repository is private, so the download needs GitHub authentication: the installer uses the `gh` CLI when available (falls back to a direct download, which works once the repo is public or the URL is authenticated).

## Build from source (optional)

One executable, one command, from this repository root (requires a Go toolchain):

```sh
go build -C . -o build/dsh-shell.exe .
```

Run: `run-windows.cmd` (Windows) or `run.sh` (WSLg), or `build/dsh-shell.exe` directly.

## Place in the ecosystem

- The harness-side Windows changes travel as the patch series in the [dsh-win-port](https://github.com/dsh-external/dsh-win-port) repository (`patches/windows-port`, 9 patches) — this shell does NOT depend on them at runtime.
- The Windows platform plugins (`dsh-pty-windows`, `dsh-shell-windows`) are separate Marisa (dshx) plugin repositories, mounted into a checkout with `dshx install`; the window shell does not mount them.
- All of these repositories are private.

User environment (POSIX): before starting the backend, the shell sources the user's shell configuration per `$SHELL` (bash → `~/.bashrc`, zsh → `~/.zshrc`) so the backend inherits environment variables exported in the user's terminal (e.g. API keys). Source output is redirected to /dev/null so it does not pollute the backend stdout; `exec` keeps the same process (unchanged PID), so the daemon's wait semantics are unaffected. Windows inherits the user/system environment directly.
