@echo off
rem Bundled pnpm shim: runs the JS pnpm distribution from the hoisted tree on
rem the bundled node.exe. Serves runtime plugin installs — mygo's `pnpm add`
rem (spawnSync via cmd) and the official `dsh plugin` both resolve `pnpm` from
rem PATH, and the launcher puts the bundle root first. node_modules/.bin
rem shims cannot serve here: the bundle walker records directory junctions
rem only, so file symlinks are stripped at build time.
"%~dp0node.exe" "%~dp0marisa-distro\node_modules\pnpm\bin\pnpm.mjs" %*
