@echo off
rem marisa profile launcher — boots the bundled backend in this terminal and
rem opens the web UI in the default browser. No installation required:
rem extract the archive, then double-click this file (or run it from a
rem terminal to keep the logs).
setlocal
set "BUNDLE=%~dp0"
if not exist "%BUNDLE%run-profile.mjs" (
  echo [marisa] backend not extracted into this directory yet.
  echo [marisa] Run the extractor first, e.g.:
  echo [marisa]   Marisa-DSH-windows-x64-extract.exe Marisa-DSH-profile-0.1.7-win-x64.tar.zst "%BUNDLE%"
  exit /b 1
)
"%BUNDLE%node.exe" "%BUNDLE%run-profile.mjs" %*
exit /b %ERRORLEVEL%
