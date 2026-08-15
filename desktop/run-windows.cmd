@echo off
rem dsh 桌面版 Windows 启动器：启动 desktop\build\dsh-shell.exe（Wails 壳）。
rem 壳会自动启动你环境里的 dsh web（默认 PATH 上的 dsh；DSH_WEB_CMD 可覆盖
rem 整条命令行）并内嵌加载其 Web GUI；关闭窗口时壳按进程树清理后端，不留
rem 孤儿 node。
rem 环境变量（启动前设置）：DSH_WEB_CMD（后端命令行，{port} 占位符会被替换）、
rem DSH_APP_WORKSPACE（工作目录，默认用户主目录）、DSH_APP_PORT（后端端口，
rem 默认 0 由 OS 分配）。
setlocal
set "APP=%~dp0build\dsh-shell.exe"
if exist "%APP%" (
  start "" "%APP%"
) else (
  echo error: %APP% not found - run: go build -C desktop -o build\dsh-shell.exe .
  exit /b 1
)
