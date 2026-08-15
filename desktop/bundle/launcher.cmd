@echo off
rem marisa-desktop standalone backend launcher (bundled inside the exe).
rem Runs the bundled node.exe + harness tree + marisa profile from the
rem extraction directory (%LOCALAPPDATA%\marisa-distro\backend). The shell
rem sets DSH_WEB_CMD to this file; the web runtime prints the URL line
rem ("dsh web: http://127.0.0.1:<port>") which the shell parses from stdout.
rem The desktop.overlay.yml pins the webserver to an OS-assigned port (0);
rem the {port} placeholder the shell substitutes is intentionally unused.
rem
rem Runs the BUILT CLI (apps/cli/lib/bin.js) - no tsx, no dev toolchain in
rem the bundle (the production install is pruned with pnpm install --prod).
setlocal
set "BUNDLE=%~dp0"
set "DSH_HOME=%BUNDLE%.dsh"
set "DSH_ROOT=%BUNDLE%marisa-distro"
rem Plugins may spawn `node`; make the bundled node the first on PATH.
set "PATH=%BUNDLE%;%PATH%"
cd /d "%DSH_ROOT%\harness"
"%BUNDLE%node.exe" "%DSH_ROOT%\harness\apps\cli\lib\bin.js" --profile marisa --patch "%DSH_HOME%\profiles\marisa\desktop.overlay.yml" --patch "%DSH_HOME%\profiles\marisa\standalone.overlay.yml"
exit /b %ERRORLEVEL%
