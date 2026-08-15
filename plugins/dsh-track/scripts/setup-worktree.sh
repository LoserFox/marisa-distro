#!/bin/bash
# setup-worktree.sh — 给 dsh-track 的开发 worktree 挂接 DSH 依赖，使该目录可独立
# typecheck / build / 单测 / 起 3081 验证实例。
#
# 背景（2026-08-11 确立的开发工作流）：
#   - 基础能力开发在独立 worktree（git worktree add ../dsh-track-dev feat/xxx）
#   - 主目录 ~/source/dsh-involute 保持 main 干净，仅做"当前 session 验收"
#   - worktree 没有 node_modules/tsconfig 挂接 → 无法 build/test，本脚本补齐
#
# 用法（在 worktree 目录内执行）：
#   bash scripts/setup-worktree.sh                # 默认用 ~/.dsh/source/current
#   DSH_SOURCE=/Users/chris/.dsh/source/slot-b bash scripts/setup-worktree.sh
#
# 幂等：重复执行安全。会创建 node_modules/（relink 到 DSH 槽）+ 生成 tsconfig.worktree.json。
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
DSH="${DSH_SOURCE:-$HOME/.dsh/source/current}"
TSCONFIG_OUT="tsconfig.worktree.json"

[ -d "$DSH/vendor/cordis" ] || { echo "DSH source not found at $DSH (set DSH_SOURCE)"; exit 1; }

echo "=== dsh-track worktree setup ==="
echo "  worktree: $REPO"
echo "  DSH source: $DSH"

# 1. node_modules: 链接工具链 + relink @deepseek-ai/* 到 DSH 槽
mkdir -p "$REPO/node_modules/.bin"
for pkg in vitest vite tsdown lightningcss rolldown vite-tsconfig-paths typescript; do
  src="$DSH/node_modules/$pkg"
  [ -d "$src" ] && ln -sfn "$src" "$REPO/node_modules/$pkg" 2>/dev/null
done
for bin in vitest tsdown tsc; do
  src="$DSH/node_modules/.bin/$bin"
  [ -x "$src" ] && ln -sfn "$src" "$REPO/node_modules/.bin/$bin" 2>/dev/null
done
# @deepseek-ai peer 包 relink（与 ab.sh ext_relink 一致）
for p in session storage storage-json system-prompt tools llm agent; do
  src="$DSH/packages/core/$p" 2>/dev/null
  [ -d "$src" ] || src="$DSH/packages/$p/$p" 2>/dev/null
  [ -d "$src" ] && ln -sfn "$src" "$REPO/node_modules/@deepseek-ai/dsh-$p" 2>/dev/null
done
# cordis relink（20260811 起官方源码与 npm 生态均用 @deepseek-ai/cordis；裸 cordis
# 仅为 0810 及更早快照的历史兼容）：
#   - node_modules/@deepseek-ai/cordis → 源码 import 解析（真名）
#   - node_modules/cordis           → 旧裸名兼容（0810 及更早快照用）
mkdir -p "$REPO/node_modules/@deepseek-ai"
ln -sfn "$DSH/vendor/cordis" "$REPO/node_modules/cordis" 2>/dev/null
ln -sfn "$DSH/vendor/cordis" "$REPO/node_modules/@deepseek-ai/cordis" 2>/dev/null
echo "  node_modules relinked (vitest/tsdown/tsc + @deepseek-ai/* + cordis/@deepseek-ai/cordis)"

# 2. tsconfig.worktree.json: 把 tsconfig.json 的 current 前缀替换为 DSH
python3 - "$REPO/tsconfig.json" "$REPO/$TSCONFIG_OUT" "$DSH" <<'PY'
import json, re, sys
src, out, dsh = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src).read()
# 替换绝对路径前缀：/Users/chris/.dsh/source/current 与 /Users/chris/.dsh/source/slot-[ab]
s = re.sub(r'/Users/chris/\.dsh/source/(?:current|slot-[ab])', dsh, s)
open(out, 'w').write(s)
PY
echo "  tsconfig written: $TSCONFIG_OUT (prefix → $DSH)"

# 3. 验证
echo "=== verify ==="
echo "  tsc (via DSH bin):"
"$DSH/node_modules/typescript/bin/tsc" -p "$REPO/$TSCONFIG_OUT" --noEmit 2>&1 | head -5
echo "  test (vitest, DSH_SOURCE=$DSH):"
DSH_SOURCE="$DSH" "$REPO/node_modules/.bin/vitest" run --config "$REPO/vitest.config.ts" 2>&1 | tail -4
echo "=== done. 用法: node scripts/dsh-env.mjs tsc -p $TSCONFIG_OUT (build/test 同理) ==="
