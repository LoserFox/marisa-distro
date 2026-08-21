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
set "PATH=%BUNDLE%;%PATH%"
cd /d "%DSH_ROOT%\harness"
if "%BOOT_PROFILE%"=="web" (
    "%BUNDLE%node.exe" "%DSH_ROOT%\harness\apps\cli\lib\bin.js" --profile web --patch "%BUNDLE%minimal.overlay.yml"
) else (
    "%BUNDLE%node.exe" "%DSH_ROOT%\harness\apps\cli\lib\bin.js" --profile %BOOT_PROFILE% --patch "%DSH_HOME%\profiles\marisa\desktop.overlay.yml" --patch "%DSH_HOME%\profiles\marisa\standalone.overlay.yml"
)
exit /b %ERRORLEVEL%
