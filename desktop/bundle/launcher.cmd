@echo off
rem marisa-desktop standalone backend launcher (bundled inside the exe).
rem Runs the bundled node.exe + harness tree + marisa profile from the
rem extraction directory (%LOCALAPPDATA%\marisa-distro\backend). The shell
rem sets DSH_WEB_CMD to this file; the web runtime prints the URL line
rem ("dsh web: http://127.0.0.1:<port>") which the shell parses from stdout.
rem
rem Runs the BUILT CLI (apps/cli/lib/bin.js) - no tsx, no dev toolchain in
rem the bundle (the production install is pruned with pnpm install --prod).
rem
rem MARISA_BOOT_PROFILE (set by the shell in minimal/rescue fallback): which
rem profile to boot. Default marisa (full composition); "web" boots the
rem harness-shipped template (base + web-app, no marisa plugins) with the
rem bundled minimal.overlay.yml - the minimal fallback never touches the
rem marisa profile's configuration surface.
setlocal
set "BUNDLE=%~dp0"
set "DSH_HOME=%BUNDLE%.dsh"
set "DSH_ROOT=%BUNDLE%marisa-distro"
set "BOOT_PROFILE=%MARISA_BOOT_PROFILE%"
if "%BOOT_PROFILE%"=="" set "BOOT_PROFILE=marisa"
rem Plugins may spawn `node`; make the bundled node the first on PATH.
rem Runtime mode: with node.exe present (Wails-era payload) it runs the CLI;
rem without node.exe (Electron payload) the shell has installed
rem private\clear-env.mjs + shims next to this launcher and the desktop exe
rem itself serves as Node (ELECTRON_RUN_AS_NODE=1) — same mechanism as the
rem anywhere dsh-plugin-desktop runtime shims. NODE_EXE/NODE_PRELOAD are
rem resolved so both modes share the boot lines below.
set "PATH=%BUNDLE%;%PATH%"
set "NODE_EXE=%BUNDLE%node.exe"
set "NODE_PRELOAD="
if not exist "%NODE_EXE%" (
    rem Electron payload: the desktop exe lives two levels up from the
    rem backend extraction dir (%LOCALAPPDATA%\marisa-distro\backend).
    for %%I in ("%BUNDLE%..\..\marisa-dsh.exe") do set "NODE_EXE=%%~fI"
    for %%I in ("%BUNDLE%private\clear-env.mjs") do set "NODE_PRELOAD=--import %%~fI"
)
if not exist "%NODE_EXE%" (
    echo marisa: no node.exe and no desktop exe found next to the backend 1>&2
    exit /b 87
)
cd /d "%DSH_ROOT%\harness"
if "%BOOT_PROFILE%"=="web" (
    "%NODE_EXE%" %NODE_PRELOAD% "%DSH_ROOT%\harness\apps\cli\lib\bin.js" --profile web --patch "%BUNDLE%minimal.overlay.yml"
) else (
    "%NODE_EXE%" %NODE_PRELOAD% "%DSH_ROOT%\harness\apps\cli\lib\bin.js" --profile %BOOT_PROFILE% --patch "%DSH_HOME%\profiles\marisa\desktop.overlay.yml" --patch "%DSH_HOME%\profiles\marisa\standalone.overlay.yml"
)
exit /b %ERRORLEVEL%
