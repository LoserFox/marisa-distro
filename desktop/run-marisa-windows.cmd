@echo off
rem Marisa desktop shell launcher (win-port profile).
rem DSH_WEB_CMD is set explicitly here so the shell gets it regardless of how
rem this script is started. Backend: win-port profile + desktop.overlay.yml
rem (webserver port 0 = OS-assigned; the shell parses the URL from stdout).
set "DSH_WEB_CMD=dsh --profile win-port --patch C:\Users\lf\.dsh\profiles\win-port\desktop.overlay.yml"
start "" "%~dp0build\dsh-shell.exe"
