#!/usr/bin/env bash
# 魔理沙一键启动：加载 key + 启动 web + 自动开浏览器
# 用法: ./start-marisa.sh [--profile marisa] [--port 3080] [--no-browser]
set -euo pipefail

PROFILE="marisa"
PORT="3080"
OPEN_BROWSER=1
HARNESS="${HARNESS:-/root/research/repos/deepseek-harness}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --no-browser) OPEN_BROWSER=0; shift ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

PROFILE_DIR="$HOME/.dsh/profiles/$PROFILE"

# 1. key 检查（.env 或环境变量）
if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  if [[ -f "$PROFILE_DIR/.env" ]]; then
    export DEEPSEEK_API_KEY="$(grep '^DEEPSEEK_API_KEY=' "$PROFILE_DIR/.env" | cut -d= -f2-)"
  fi
fi
if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "⚠ 未设置 DEEPSEEK_API_KEY（可写入 $PROFILE_DIR/.env 或 export）"
fi

# 2. profile 存在性
if [[ ! -d "$PROFILE_DIR" ]]; then
  echo "✗ profile $PROFILE 不存在（先跑 install.sh）"
  exit 1
fi

# 3. 启动
echo "==> 启动魔理沙（$PROFILE @ :$PORT）"
cd "$HARNESS"
NODE_OPTIONS="--max-old-space-size=8192" pnpm dsh --profile "$PROFILE" --port "$PORT" \
  > "/tmp/marisa-$PROFILE.log" 2>&1 &
WPID=$!

# 4. 等就绪
for i in $(seq 1 60); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
    echo "✅ 魔理沙已就绪: http://127.0.0.1:$PORT/"
    if [[ $OPEN_BROWSER -eq 1 ]]; then
      xdg-open "http://127.0.0.1:$PORT/" >/dev/null 2>&1 || true
    fi
    echo "（日志: /tmp/marisa-$PROFILE.log · 停止: kill $WPID）"
    exit 0
  fi
  sleep 1
done

echo "✗ 启动超时（日志: /tmp/marisa-$PROFILE.log）"
exit 1
