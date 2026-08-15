#!/bin/bash
# dsh 桌面版启动脚本（WSLg 环境）
#
# WSLg 已知 Bug：X11 后端 + DRI3 加速下，Xwayland 内容无法合成到桌面
# （窗口注册但画面空白）。绕过方式：Wayland 原生后端 + 全软件渲染
# （llvmpipe/SHM），窗口由 Weston 直接合成，零 EGL/DRI3 依赖。
#
# 环境变量可覆盖：
#   DSH_GDK_BACKEND  - 强制显示后端（wayland 默认；x11 可作 fallback）
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

# 软件渲染（WSLg 无 DRI3/GPU 加速）
export LIBGL_ALWAYS_SOFTWARE=1
export GALLIUM_DRIVER=llvmpipe
export GSK_RENDERER=cairo
# WebKitGTK：禁用合成器与 DMA-BUF，内容走 SHM
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DMABUF_RENDERER_FORCE_SHM=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_FORCE_SANDBOX=0
export GTK_A11Y=none
export GDK_BACKEND="${DSH_GDK_BACKEND:-wayland}"

# D-Bus session（WebKit 辅助进程需要）
if [ -z "$DBUS_SESSION_BUS_ADDRESS" ] && command -v dbus-launch >/dev/null; then
  export DBUS_SESSION_BUS_ADDRESS="$(dbus-launch --sh-syntax | grep DBUS_SESSION_BUS_ADDRESS | cut -d= -f2- | tr -d "'")"
fi

export DSH_APP_WORKSPACE="${DSH_APP_WORKSPACE:-$HOME}"
# 壳的唯一产物在 build/ 下（go build -C desktop -o build/dsh-shell .）。
exec "$DIR/build/dsh-shell"
