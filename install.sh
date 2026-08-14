#!/usr/bin/env bash
# =============================================================================
# 魔理沙（Marisa）— DSH 整合包一键安装脚本
#
# 用法:
#   ./install.sh --harness <DSH源码checkout> [--profile marisa] [--plugins-dir <dir>] [--skip-verify]
#
# 前置:
#   - Node >= 22, pnpm >= 11（全局），git
#   - deepseek-harness 源码 checkout（插件 peer 依赖从它的 workspace 解析）
#   - 网络（clone 21 个插件仓库 + npm registry）
#
# 流程:
#   1. 校验环境与 harness checkout
#   2. clone 21 个源码态插件到 plugins-dir
#   3. 生成 profile（~/.dsh/profiles/<name>/）：dependencies 展开 29 个插件
#      （21 file: 绝对路径 + 8 npm 版），bundles = base + web-app + dsh-allinone
#   4. 写 pnpm-workspace.yaml（linkWorkspacePackages / minimumReleaseAge / onlyBuiltDependencies）
#   5. pnpm install（删 lockfile 防 registry 回退）
#   6. 启动验证（可跳过）
# =============================================================================
set -euo pipefail

# ---- 参数解析 ---------------------------------------------------------------
PROFILE="marisa"
PLUGINS_DIR="${HOME}/.marisa/plugins"
HARNESS=""
SKIP_VERIFY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --plugins-dir) PLUGINS_DIR="$2"; shift 2 ;;
    --harness) HARNESS="$2"; shift 2 ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    *) echo "✗ 未知参数: $1"; exit 1 ;;
  esac
done

# 本脚本所在目录（魔理沙仓库根）
MARISA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_DIR="${HOME}/.dsh/profiles/${PROFILE}"

echo "==> 魔理沙（Marisa）DSH 整合包安装"
echo "    profile:     ${PROFILE}  →  ${PROFILE_DIR}"
echo "    plugins-dir: ${PLUGINS_DIR}"
echo "    marisa repo: ${MARISA_DIR}"

# ---- 1. 环境校验 -------------------------------------------------------------
command -v node >/dev/null || { echo "✗ 需要 Node >= 22"; exit 1; }
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[[ "$NODE_MAJOR" -ge 22 ]] || { echo "✗ Node 版本过低: $(node -v)（需要 >= 22）"; exit 1; }
command -v pnpm >/dev/null || { echo "✗ 需要 pnpm >= 11（npm i -g pnpm）"; exit 1; }
command -v git >/dev/null || { echo "✗ 需要 git"; exit 1; }

if [[ -z "$HARNESS" ]]; then
  echo "✗ 必须指定 --harness <DSH源码checkout>（如 /path/to/deepseek-harness）"
  exit 1
fi
HARNESS="$(cd "$HARNESS" && pwd)"
[[ -d "$HARNESS/vendor/cordis" ]] || { echo "✗ harness 无效: $HARNESS/vendor/cordis 不存在（需要 DSH 源码 checkout）"; exit 1; }
[[ -d "$HARNESS/apps/cli/src" ]] || { echo "✗ harness 无效: $HARNESS/apps/cli/src 不存在"; exit 1; }
echo "    harness:     $HARNESS ✓"

# ---- 2. clone 源码态插件 ------------------------------------------------------
echo ""
echo "==> 克隆源码态插件 → ${PLUGINS_DIR}"
mkdir -p "$PLUGINS_DIR"

clone_or_update() {
  local dir="$1" url="$2"
  if [[ -d "$PLUGINS_DIR/$dir/.git" ]]; then
    echo "    - $dir 已存在（跳过）"
    return 0
  fi
  echo "    - clone $dir"
  git clone --depth 1 "$url" "$PLUGINS_DIR/$dir" >/dev/null 2>&1 || {
    echo "    ⚠ clone 失败: $dir（继续）"
    return 1
  }
}

# 从 plugins.json 读取 git 插件清单（python3 生成）
if ! command -v python3 >/dev/null; then
  echo "✗ 需要 python3"; exit 1
fi
while IFS=$'\t' read -r dir url; do
  [[ -z "$dir" ]] && continue
  clone_or_update "$dir" "$url" || true
done < <(python3 - "$MARISA_DIR/plugins.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
for p in data['plugins']:
    if p['source'] == 'git':
        print(f"{p['dir']}\t{p['repo']}")
PY
)

# ---- 3. 生成 profile ----------------------------------------------------------
echo ""
echo "==> 生成 profile: ${PROFILE_DIR}"
mkdir -p "$PROFILE_DIR"

# 3a. package.json（dependencies 由 plugins.json 动态生成）
python3 - "$PROFILE_DIR" "$PLUGINS_DIR" "$MARISA_DIR/plugins.json" "$PROFILE" <<'PY'
import json, sys, os
profile_dir, plugins_dir, manifest_path, profile = sys.argv[1:5]
data = json.load(open(manifest_path))

deps = {}
for p in data['plugins']:
    if p['source'] == 'git':
        deps[p['name']] = f"file:{plugins_dir}/{p['dir']}"
    else:
        deps[p['name']] = p['version']
# 聚合包本体（bundles 按包名从 node_modules 解析；dependencies 指向安装副本）
deps['@dsh-external/dsh-allinone'] = f"file:{profile_dir}/allinone-install"
# mygo 管理内核四件套（profile patch 引用了它们，必须可解析）
harness = os.environ.get('HARNESS', '')
deps['@deepseek-ai/dsh-mygo'] = f"file:{harness}/packages/cordis/mygo"
deps['@deepseek-ai/dsh-mygo-api'] = f"file:{harness}/packages/core/mygo-api"
deps['@dsh-external/dsh-mygo-cli'] = f"file:{harness}/packages/cordis/mygo-cli"
deps['@dsh-external/dsh-mygo-panel'] = f"file:{harness}/vendor/dsh-mygo-panel"

pkg = {
    "name": f"marisa-{profile}",
    "private": True,
    "version": data.get('version', '0.1.1'),
    "dependencies": deps,
    "dsh": {
        "profile": {
            "name": profile,
            "bundles": [
                "@deepseek-ai/dsh-base",
                "@deepseek-ai/dsh-web-app",
                "@dsh-external/dsh-allinone"
            ] + [p['name'] for p in data.get('plugins', []) if p.get('bundle')]
        }
    }
}
with open(os.path.join(profile_dir, 'package.json'), 'w') as f:
    json.dump(pkg, f, indent=2, ensure_ascii=False)
print(f"    依赖展开 {len(deps)} 个插件")
PY

# 3b. cordis.patch.yml（mygo 管理器 + CLI）
cat > "$PROFILE_DIR/cordis.patch.yml" <<'YAML'
# 魔理沙 profile patch layer（应用在 bundle 层之后）
# mygo 管理内核：管理器 + CLI（pack 打包模式需临时禁用 web-startup）
- insert:
    - id: mygo
      name: '@deepseek-ai/dsh-mygo'
      config:
        profile: web

    - id: dsh-mygo-cli
      name: '@dsh-external/dsh-mygo-cli'
YAML

# 3c. pnpm-workspace.yaml（含 harness workspace globs：插件 workspace:^ 依赖从此解析）
#     install-links: false → file: 依赖用 symlink 而非拷贝（拷贝会冻结旧 lib）
cat > "$PROFILE_DIR/pnpm-workspace.yaml" <<YAML
packages:
  - .
  - $HARNESS/packages/*
  - $HARNESS/packages/*/*
  - $HARNESS/vendor/*
  - $HARNESS/apps/*
  - $HARNESS/native/landlock-run/packages/*
nodeLinker: hoisted
linkWorkspacePackages: true
install-links: false
autoInstallPeers: false
minimumReleaseAge: 0
onlyBuiltDependencies:
  - node-pty
  - esbuild
  - koffi
  - sharp
  - protobufjs
  - '@google/genai'
YAML

# 3d. 聚合包安装副本（dependencies 重写为绝对路径）
rm -rf "$PROFILE_DIR/allinone-install"
cp -r "$MARISA_DIR/dsh-allinone" "$PROFILE_DIR/allinone-install"
rm -rf "$PROFILE_DIR/allinone-install/node_modules"
python3 - "$PROFILE_DIR/allinone-install/package.json" "$PLUGINS_DIR" <<'PY'
import json, sys, os
pkg_path, plugins_dir = sys.argv[1:3]
d = json.load(open(pkg_path))
for k, v in list(d.get('dependencies', {}).items()):
    if isinstance(v, str) and v.startswith('file:../'):
        d['dependencies'][k] = f"file:{plugins_dir}/{v[8:]}"
    elif isinstance(v, str) and v.startswith('file:'):
        d['dependencies'][k] = f"file:{plugins_dir}/{v[5:]}"
json.dump(d, open(pkg_path, 'w'), indent=2, ensure_ascii=False)
print(f"    allinone 副本依赖重写: {len(d.get('dependencies', {}))} 个")
PY

# ---- 4. 依赖安装 --------------------------------------------------------------
echo ""
echo "==> pnpm install（${PROFILE_DIR}）"
cd "$PROFILE_DIR"
rm -f pnpm-lock.yaml
# pnpm 11 对 ignored builds 报错退出（ERR_PNPM_IGNORED_BUILDS），但包已装完；
# 以产物验证为准（见下）。
CI=true timeout 550 pnpm install --no-frozen-lockfile > /tmp/marisa-install.log 2>&1 || true
if [[ ! -d node_modules/@dsh-external/dsh-allinone ]]; then
  echo "✗ pnpm install 失败（node_modules/@dsh-external/dsh-allinone 缺失）"
  tail -15 /tmp/marisa-install.log
  exit 1
fi
echo "    node_modules: $(ls node_modules | wc -l) 个包 ✓"

# 4b. 插件仓库链接修复（悬空链接指向旧环境路径 → 重定向；file: 拷贝 → symlink）
echo "==> 修复插件链接"
python3 - "$PLUGINS_DIR" <<'PY'
import os, sys, shutil
plugins_dir = sys.argv[1]
# 1) 插件仓库内悬空链接重定向
for name in os.listdir(plugins_dir):
    nm = os.path.join(plugins_dir, name, 'node_modules')
    if not os.path.isdir(nm):
        continue
    for item in os.listdir(nm):
        p = os.path.join(nm, item)
        if os.path.islink(p) and not os.path.exists(p):
            target = os.readlink(p)
            if 'source/current' in target or 'dsh2026' in target:
                if item == 'schemastery':
                    os.unlink(p)
                    os.symlink(f'{os.environ["HOME"]}/.dsh/profiles/{os.environ.get("MARISA_PROFILE", "marisa")}/node_modules/schemastery', p)
                    print(f"    ✓ {name}/node_modules/{item} → profile schemastery")
                elif item == 'cordis':
                    os.unlink(p)
                    os.symlink(f'{os.environ["HARNESS"]}/vendor/cordis', p)
                    print(f"    ✓ {name}/node_modules/{item} → harness/vendor/cordis")
PY

# 2) profile node_modules：file: 依赖的拷贝 → symlink（pnpm 11 默认拷贝，会冻结旧 lib）
python3 - "$PROFILE_DIR" "$PLUGINS_DIR" <<'PY'
import os, sys, shutil, json
profile_dir, plugins_dir = sys.argv[1:3]
pkg = json.load(open(os.path.join(profile_dir, 'package.json')))
for dep, spec in pkg.get('dependencies', {}).items():
    if not (isinstance(spec, str) and spec.startswith('file:')):
        continue
    target = spec[5:]
    if not os.path.isdir(target):
        continue
    node_path = os.path.join(profile_dir, 'node_modules', dep)
    if os.path.islink(node_path):
        continue
    if os.path.isdir(node_path):
        shutil.rmtree(node_path)
        os.makedirs(os.path.dirname(node_path), exist_ok=True)
        os.symlink(target, node_path)
        print(f"    ✓ {dep} 拷贝 → symlink")
PY

# 3) 插件源码目录运行时依赖补链（symlink 后 Node 从源码目录解析，缺包补 profile 链接）
python3 - "$PROFILE_DIR" "$PLUGINS_DIR" <<'PY'
import os, sys, json
profile_dir, plugins_dir = sys.argv[1:3]
profile_nm = os.path.join(profile_dir, 'node_modules')
# 已知缺包的插件 → 依赖（随报错扩充）
known = {
    'dsh_workflow': ['quickjs-emscripten'],
    'dsh-vision-toolkit': ['saxes'],
    'dsh-suggested-replies': ['zod'],
}
for dirname, pkgs in known.items():
    nm = os.path.join(plugins_dir, dirname, 'node_modules')
    os.makedirs(nm, exist_ok=True)
    for pkg in pkgs:
        link = os.path.join(nm, pkg)
        target = os.path.join(profile_nm, pkg)
        if os.path.islink(link) or os.path.exists(link):
            continue
        if os.path.exists(target):
            os.symlink(target, link)
            print(f"    ✓ {dirname}/node_modules/{pkg} → profile")
PY

# 4c. node-pty 原生编译（Linux 下 npm 包不带 linux-x64 预编译）
NODE_PTY="$(find node_modules -maxdepth 4 -type d -name node-pty | head -1)"
if [[ -n "$NODE_PTY" ]] && [[ ! -f "$NODE_PTY/prebuilds/linux-x64/pty.node" ]]; then
  echo "==> 编译 node-pty（Linux 原生模块）"
  (cd "$NODE_PTY" && node-gyp rebuild > /tmp/marisa-node-pty.log 2>&1) \
    && mkdir -p "$NODE_PTY/prebuilds/linux-x64" \
    && cp "$NODE_PTY/build/Release/pty.node" "$NODE_PTY/prebuilds/linux-x64/" \
    && echo "    node-pty 编译完成 ✓" \
    || echo "    ⚠ node-pty 编译失败（终端功能不可用，可稍后手动处理）"
fi

# ---- 5. 启动验证 ---------------------------------------------------------------
if [[ "$SKIP_VERIFY" == "1" ]]; then
  echo ""
  echo "==> 安装完成（跳过验证）。启动:"
  echo "    cd $HARNESS && pnpm dsh --profile $PROFILE --port 3080"
  exit 0
fi

echo ""
echo "==> 启动验证（首次启动会触发 harness deps-status-check + install，需 2-3 分钟）"
cd "$HARNESS"
# 预稳定 harness 依赖状态（deps-status-check 会触发 pnpm install + prepare 构建）
CI=true timeout 400 pnpm install --no-frozen-lockfile > /tmp/marisa-preinstall.log 2>&1 || true
NODE_OPTIONS="--max-old-space-size=8192" timeout 240 pnpm dsh --profile "$PROFILE" --port 3081 \
  > /tmp/marisa-install-verify.log 2>&1 &
VPID=$!

for i in $(seq 1 220); do
  if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3081/ 2>/dev/null | grep -q 200; then
    echo "✅ 验证通过：HTTP 200 @ http://127.0.0.1:3081"
    kill $VPID 2>/dev/null || true
    exit 0
  fi
  sleep 1
done
kill $VPID 2>/dev/null || true
echo "✗ 验证失败（220s 内未返回 200）。日志: /tmp/marisa-install-verify.log"
tail -20 /tmp/marisa-install-verify.log
exit 1
