#!/usr/bin/env bash
# build.sh — marisa-distro v2 single build script (Linux port of build.ps1)
#
# Pipeline (all 8 steps, in order):
#   1. Prereq check        node>=22, pnpm>=11, go, python3
#   2. Root install        pnpm install --no-frozen-lockfile (CI=true) at repo root
#   3. Harness build       pnpm run build in harness/ (fallback: build:web)
#   4. Plugin builds       rc6-compatible plugins that need lib built
#   5. Materialize profile node profiles/marisa/generate-profile.mjs
#   6. Profile install     pnpm install --no-frozen-lockfile in ~/.dsh/profiles/marisa
#   7. Self-check          boot backend, verify HTTP 200 + MyGO runtime
#   8. Desktop shell       go build -o release/dsh-shell
#
# Iteration switches (default: everything runs):
#   --skip-root-install --skip-harness-build --skip-plugin-builds
#   --skip-profile-install --skip-self-check --skip-desktop-shell
#   --profile-path DIR    (default ~/.dsh/profiles/marisa)
#   --bundle              additionally pack the self-contained backend
#                         (desktop/bundle/make-bundle.sh) and link the
#                         standalone shell (-tags embeddedbundle)
#
# Linux notes baked in:
#   - plugins have no local node_modules; the root hoisted .bin is prepended
#     to PATH before `npm run build` so tsc/tsdown shims resolve.
#   - the self-check backend runs in its own session (setsid, fallback plain
#     &) so the EXIT trap can clean the whole tree without taskkill.
#
# Run:  ./build.sh
set -euo pipefail

skipRootInstall=0 skipHarnessBuild=0 skipPluginBuilds=0
skipProfileInstall=0 skipSelfCheck=0 skipDesktopShell=0 bundleMode=0
profilePath="${MARISA_PROFILE_DIR:-$HOME/.dsh/profiles/marisa}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-root-install)   skipRootInstall=1 ;;
    --skip-harness-build)  skipHarnessBuild=1 ;;
    --skip-plugin-builds)  skipPluginBuilds=1 ;;
    --skip-profile-install) skipProfileInstall=1 ;;
    --skip-self-check)     skipSelfCheck=1 ;;
    --skip-desktop-shell)  skipDesktopShell=1 ;;
    --bundle)              bundleMode=1 ;;
    --profile-path)        profilePath=$2; shift ;;
    --profile-path=*)      profilePath=${1#*=} ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rootBin="$repo/node_modules/.bin"
releaseDir="$repo/release"
mkdir -p "$releaseDir"

# pnpm resolution of the ~275-project workspace exceeds the default V8 heap
# during --no-frozen-lockfile installs (see build.ps1, measured 2026-08-19).
export NODE_OPTIONS="--max-old-space-size=8192"
export CI=true   # pnpm non-interactive mode; also skips harness postinstall
# Suppress pnpm's deps-status-check before `pnpm run build`: the harness has a
# nested pnpm-workspace.yaml whose postinstall (install-lefthook.mjs) probes a
# translation-pairing merge driver via tsx from the git root, where the script
# path doesn't resolve. verifyDepsBeforeRun=false in the root workspace config
# covers the root, but pnpm's global default still rechecks the nested harness
# workspace. The env var applies everywhere.
export npm_config_verify_deps_before_run=false
# registry.npmjs.org resilience. fetch-retries=2 (not 5) so pnpm exits
# quickly when optional platform packages (claude-agent-sdk darwin/win32,
# codex darwin/win32) 404 — they are non-critical optional deps and don't
# block the build, but high retry counts with exponential backoff hang the
# process for 10+ minutes after the install itself completes.
export npm_config_fetch_retries='2'
export npm_config_fetch_retry_mintimeout='2000'
export npm_config_network_concurrency='8'

declare -a STEP_RESULTS=()
step() { printf '\n## STEP: %s\n' "$*"; }
ok()   { STEP_RESULTS+=("$*"); echo "OK: $*"; }

die() { echo "FATAL: $*" >&2; echo 'BUILD FAILED' >&2; exit 1; }
assert_last_exit0() { [[ $? -eq 0 ]] || die "$1"; }

install_with_retry() { # label, maxAttempts=3 — mirrors Invoke-InstallWithRetry
  local label=$1 attempt
  for ((attempt=1; attempt<=3; attempt++)); do
    if (( attempt > 1 )); then
      echo "WARN: $label failed; retrying (attempt $attempt of 3)..." >&2
      sleep 10
    fi
    # --ignore-scripts: the lockfile is Windows-generated and lacks linux-x64
    # prebuilds for sharp (@img/sharp-linux-x64). allowBuilds: sharp would
    # force a from-source build that needs libvips-dev + node-gyp. The build
    # pipeline (harness compile, plugin lib builds, bundle staging) does not
    # need compiled native modules — only the self-check / runtime does. Users
    # who want self-check should install libvips-dev and run
    # `pnpm install` without --ignore-scripts separately.
    pnpm install --no-frozen-lockfile --ignore-scripts && return 0
  done
  die "$label (exit code nonzero after 3 attempts)"
}

# ─── 1/8 prereq check ──────────────────────────────────────────────────────────
step '1/8 prereq check'
nodeOut=$(node -v) || die "node is not runnable"
nodeMajor=${nodeOut#v}; nodeMajor=${nodeMajor%%.*}
(( nodeMajor >= 22 )) || die "node >= 22 required, found $nodeOut"
echo "node $nodeOut OK"

pnpmOut=$(pnpm -v | tr -d '[:space:]') || die "pnpm is not runnable"
pnpmMajor=${pnpmOut%%.*}
(( pnpmMajor >= 11 )) || die "pnpm >= 11 required, found $pnpmOut"
echo "pnpm $pnpmOut OK"

command -v go >/dev/null || die 'go is not on PATH (required for the desktop shell build)'
echo "$(go version) OK"
command -v python3 >/dev/null || die 'python3 is not on PATH'

# ─── pre-step: materialize runtime profile (must precede root install) ──────
# Root package.json depends on marisa-marisa@workspace:^, which lives in the
# gitignored profiles/marisa/runtime/ workspace member. generate-profile.mjs
# uses only node: built-ins (no node_modules), so it runs cold on a clean tree.
# The Windows release script does the same (build-release-windows.ps1 line 96
# generates runtime profile BEFORE line 101 root install).
runtimeProfile="$repo/profiles/marisa/runtime"
prevProfileDir=${MARISA_PROFILE_DIR:-}
export MARISA_PROFILE_DIR="$runtimeProfile"
(cd "$repo" && node profiles/marisa/generate-profile.mjs) \
  || { export MARISA_PROFILE_DIR=$prevProfileDir; die 'pre-step: generate runtime profile (for root install)'; }
[[ -z $prevProfileDir ]] || export MARISA_PROFILE_DIR=$prevProfileDir
[[ -f "$runtimeProfile/package.json" ]] \
  || die "runtime profile not materialized at $runtimeProfile"

# ─── 2/8 root workspace install ───────────────────────────────────────────────
if (( skipRootInstall )); then
  step '2/8 root workspace install (SKIPPED)'
else
  step '2/8 root workspace install (pnpm install --no-frozen-lockfile)'
  install_with_retry 'root pnpm install'
fi

# ─── 3/8 harness build ────────────────────────────────────────────────────────
if (( skipHarnessBuild )); then
  step '3/8 harness build (SKIPPED)'
else
  step '3/8 harness build (pnpm run build)'
  export PATH="$rootBin:$PATH"
  if (cd "$repo/harness" && pnpm run build); then
    ok 'harness-build'
  else
    echo 'WARN: full harness build failed; falling back to web-target build (build:web)' >&2
    (cd "$repo/harness" && pnpm run build:web) || die 'harness build:web (fallback)'
    ok 'harness-build(web)'
  fi
fi

# ─── 4/8 plugin builds ────────────────────────────────────────────────────────
if (( skipPluginBuilds )); then
  step '4/8 plugin builds (SKIPPED)'
else
  step '4/8 plugin builds (plugins needing lib; others ship lib or compatibility-disabled)'
  export PATH="$rootBin:$PATH"
  for dir in dsh-a2a dsh-code-map dsh-sidechain; do
    echo "--- building plugin: $dir ---"
    (cd "$repo/plugins/$dir" && npm run build) || die "npm run build in plugins/$dir"
    [[ -f "$repo/plugins/$dir/lib/index.js" ]] || die "plugins/$dir build produced no lib/index.js"
    ok "plugin:$dir"
  done

  # MyGO vendored packages: each ships a prepack guard that rejects archives
  # without lib/index.js, but the build (tsc -b + tsdown) is never run by the
  # harness or plugin build steps. Without lib/ the bundled backend crashes
  # with ERR_MODULE_NOT_FOUND for @r05en1cu/dsh-mygo* at runtime.
  for pkg in cordis/mygo core/mygo-api cordis/mygo-cli extensions/mygo-fabric \
             extensions/mygo-panel loaders/mygo-loader-hub \
             loaders/mygo-loader-profile; do
    echo "--- building dsh-mygo: $pkg ---"
    (cd "$repo/dsh-mygo/packages/$pkg" && npm run build) \
      || die "npm run build in dsh-mygo/packages/$pkg"
    [[ -f "$repo/dsh-mygo/packages/$pkg/lib/index.js" ]] \
      || die "dsh-mygo/packages/$pkg build produced no lib/index.js"
    ok "mygo:$pkg"
  done
fi

# ─── 5/8 materialize profile ─────────────────────────────────────────────────
step '5/8 materialize profile (generate-profile.mjs)'
prevProfileDir=${MARISA_PROFILE_DIR:-}
export MARISA_PROFILE_DIR="$profilePath"
(cd "$repo" && node profiles/marisa/generate-profile.mjs) \
  || { export MARISA_PROFILE_DIR=$prevProfileDir; die 'generate-profile.mjs'; }
[[ -z $prevProfileDir ]] || export MARISA_PROFILE_DIR=$prevProfileDir
[[ -f "$profilePath/package.json" ]] || die "profile package.json not materialized at $profilePath"

# ─── 6/8 profile install ──────────────────────────────────────────────────────
if (( skipProfileInstall )); then
  step '6/8 profile install (SKIPPED)'
else
  step '6/8 profile install (pnpm install --no-frozen-lockfile)'
  (cd "$profilePath" && install_with_retry 'profile pnpm install')
fi

# ─── 7/8 self-check ───────────────────────────────────────────────────────────
backendPid=''
cleanup_backend() {
  if [[ -n $backendPid ]] && kill -0 "$backendPid" 2>/dev/null; then
    echo "killing web backend tree (PID $backendPid)"
    kill -TERM -- "-$backendPid" 2>/dev/null || kill -TERM "$backendPid" 2>/dev/null || true
    sleep 2
    kill -KILL -- "-$backendPid" 2>/dev/null || kill -KILL "$backendPid" 2>/dev/null || true
  fi
}
trap cleanup_backend EXIT INT TERM

if (( skipSelfCheck )); then
  step '7/8 self-check (SKIPPED)'
else
  step '7/8 self-check: boot marisa web backend from repo harness'
  stdoutLog="$releaseDir/web-backend.log"
  stderrLog="$releaseDir/web-backend.err.log"
  rm -f "$stdoutLog" "$stderrLog"

  patchPath=$(printf '%s' "$profilePath/desktop.overlay.yml")
  builtCli="$repo/harness/apps/cli/lib/bin.js"
  [[ -f $builtCli ]] || die "built harness CLI missing after step 3: $builtCli"
  # rc7 CLI syntax: --profile is a launcher flag; the `web` subcommand does
  # not accept it (rc7 sync, 2026-08-18) — mirrors build.ps1.
  # setsid detaches into a new session so the trap kills the whole tree.
  if command -v setsid >/dev/null; then
    (cd "$repo/harness" && exec setsid node apps/cli/lib/bin.js --profile marisa \
       --patch "$patchPath") >"$stdoutLog" 2>"$stderrLog" &
  else
    (cd "$repo/harness" && exec node apps/cli/lib/bin.js --profile marisa \
       --patch "$patchPath") >"$stdoutLog" 2>"$stderrLog" &
  fi
  backendPid=$!
  echo "web backend PID $backendPid; polling for 'dsh web:' line (up to 180s)"

  webUrl=''
  deadline=$(( $(date +%s) + 180 ))
  while (( $(date +%s) < deadline )); do
    kill -0 "$backendPid" 2>/dev/null || break
    content=$(cat "$stdoutLog" "$stderrLog" 2>/dev/null || true)
    if [[ $content =~ dsh\ web:\ (http://127\.0\.0\.1:[0-9]+) ]]; then webUrl=${BASH_REMATCH[1]}; break; fi
    sleep 2
  done

  if [[ -z $webUrl ]]; then
    echo '----- stdout tail -----' >&2; tail -80 "$stdoutLog" 2>/dev/null || echo '(no stdout log)' >&2
    echo '----- stderr tail -----' >&2; tail -80 "$stderrLog" 2>/dev/null >&2 || true
    die 'WEB BOOT FAILED'
  fi
  echo "boot line found: $webUrl"

  httpCode=$(python3 -c "
import sys, urllib.request
try:
    with urllib.request.urlopen('$webUrl', timeout=30) as r:
        print(r.status)
except Exception as e:
    print(getattr(getattr(e, 'fp', None), 'status', 0) or 0)
" 2>/dev/null || echo 0)
  cleanup_backend; backendPid=''
  [[ $httpCode == 200 ]] || die "self-check HTTP got $httpCode (expected 200) at $webUrl"

  (cd "$repo" && node profiles/marisa/verify-mygo-runtime.mjs) || die 'MyGO runtime and client-panel verification'
  ok "self-check HTTP $httpCode + MyGO rc6 API/client panel"
fi

# ─── 8/8 desktop shell ────────────────────────────────────────────────────────
if (( skipDesktopShell )); then
  step '8/8 desktop shell (SKIPPED)'
else
  step '8/8 desktop shell (go build dsh-shell)'
  go build -C "$repo/desktop" -o "$releaseDir/dsh-shell" . || die 'go build dsh-shell'
  ok 'desktop-shell'
fi

# ─── optional: self-contained bundle + standalone shell ───────────────────────
if (( bundleMode )); then
  step 'bonus/--bundle: backend bundle + embedded standalone shell'
  # Runtime profile was already materialized in the pre-step before root
  # install (root package.json depends on marisa-marisa@workspace:^). Just
  # regenerate to ensure it reflects the current repo state, then stage.
  runtimeProfile="$repo/profiles/marisa/runtime"
  prevProfileDir=${MARISA_PROFILE_DIR:-}
  export MARISA_PROFILE_DIR="$runtimeProfile"
  (cd "$repo" && node profiles/marisa/generate-profile.mjs) \
    || { export MARISA_PROFILE_DIR=$prevProfileDir; die 'regenerate runtime profile'; }
  [[ -z $prevProfileDir ]] || export MARISA_PROFILE_DIR=$prevProfileDir

  "$repo/desktop/bundle/make-bundle.sh" --profile "$runtimeProfile" \
    || die 'make-bundle.sh'
  mkdir -p "$releaseDir/linux"
  # The embeddedbundle go build embeds the 199 MB backend.tar.zst and needs
  # ~1 GB of $WORK space for compilation. /tmp is often a size-limited tmpfs
  # (e.g. Arch default 7.4G) that fills up. Redirect TMPDIR to the repo's
  # disk-backed release dir to avoid "no space left on device" errors.
  # export TMPDIR="$releaseDir/.tmp-go"
  # mkdir -p "$TMPDIR"
  go build -C "$repo/desktop" -trimpath -ldflags '-s -w' \
    -tags embeddedbundle -o "$releaseDir/linux/marisa-dsh" . \
    || die 'go build marisa-dsh (embeddedbundle)'
  ok 'standalone linux shell (embeddedbundle)'
fi

trap - EXIT INT TERM

# ─── summary ──────────────────────────────────────────────────────────────────
echo ''
echo '================ BUILD SUMMARY ================'
for r in "${STEP_RESULTS[@]}"; do echo "  $r"; done
[[ -f $releaseDir/dsh-shell ]] && echo "  dsh-shell: $releaseDir/dsh-shell ($(wc -c <"$releaseDir/dsh-shell") bytes)"
if (( bundleMode )); then
  [[ -f $releaseDir/linux/marisa-dsh ]] && echo "  standalone: $releaseDir/linux/marisa-dsh ($(wc -c <"$releaseDir/linux/marisa-dsh") bytes)"
  [[ -f $repo/desktop/bundle/backend.tar.zst ]] && echo "  backend.tar.zst: $(wc -c <"$repo/desktop/bundle/backend.tar.zst") bytes"
fi
echo '==============================================='
echo 'BUILD COMPLETE (all steps passed)'
