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
rem
rem Two payload shapes share the boot lines below:
rem   runtime mode  - node.exe ships in the payload and is used directly.
rem   electron mode - no node.exe. The desktop shell runs the CLI as Node via
rem                   ELECTRON_RUN_AS_NODE and publishes where it lives in
rem                   MARISA_NODE_EXE, plus the RunAsNode prelude module as a
rem                   file:// URL in MARISA_NODE_PRELOAD_URL (Node's --import
rem                   rejects a bare Windows path). The shell is the only party
rem                   that can know these: in an installed layout it sits in
rem                   <install>\ while this backend is extracted under
rem                   %LOCALAPPDATA%\marisa-distro\backend, so no relative path
rem                   between them is stable. Guessing one here is what kept the
rem                   Electron shell from ever starting a backend.
rem The legacy guess (a Wails-era marisa-dsh.exe two levels up) is kept last so
rem a payload laid out that way still boots.
set "PATH=%BUNDLE%;%PATH%"
set "NODE_EXE="
set "NODE_PRELOAD="
set "RUN_AS_ELECTRON="
if defined MARISA_NODE_EXE set "NODE_EXE=%MARISA_NODE_EXE%"
if defined MARISA_NODE_PRELOAD_URL set NODE_PRELOAD=--import "%MARISA_NODE_PRELOAD_URL%"
if not defined NODE_EXE if exist "%BUNDLE%node.exe" set "NODE_EXE=%BUNDLE%node.exe"
if not defined NODE_EXE for %%I in ("%BUNDLE%..\..\marisa-dsh.exe") do if exist "%%~fI" set "NODE_EXE=%%~fI"
if not defined NODE_EXE (
    echo marisa: no Node runtime available - payload has no node.exe and the desktop shell published no MARISA_NODE_EXE 1>&2
    exit /b 87
)
rem Anything other than the payload's own node.exe is the Electron shell, which
rem only acts as Node when ELECTRON_RUN_AS_NODE is set. Without this the shell
rem boots as a second GUI instance, loses the single-instance race and exits in
rem under 100ms - surfacing upstream as "backend exited without publishing a URL"
rem and then as the rescue page. The prelude above then removes the variable
rem again inside the backend process so its children stay plain processes.
if /I not "%NODE_EXE%"=="%BUNDLE%node.exe" set "RUN_AS_ELECTRON=1"
if defined RUN_AS_ELECTRON set "ELECTRON_RUN_AS_NODE=1"
cd /d "%DSH_ROOT%\harness"
if "%BOOT_PROFILE%"=="web" (
    "%NODE_EXE%" %NODE_PRELOAD% "%DSH_ROOT%\harness\apps\cli\lib\bin.js" --profile web --patch "%BUNDLE%minimal.overlay.yml"
) else (
    "%NODE_EXE%" %NODE_PRELOAD% "%DSH_ROOT%\harness\apps\cli\lib\bin.js" --profile %BOOT_PROFILE% --patch "%DSH_HOME%\profiles\marisa\desktop.overlay.yml" --patch "%DSH_HOME%\profiles\marisa\standalone.overlay.yml"
)
exit /b %ERRORLEVEL%
