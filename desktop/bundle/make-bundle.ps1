# make-bundle.ps1 — stage the standalone backend bundle and tar.zst it into
# desktop/bundle/backend.tar.zst (consumed by go:embed with -tags embeddedbundle).
#
# Bundle layout (zip root = extraction dir):
#   VERSION                       version marker (version-gates re-extraction)
#   node.exe                      bundled Node runtime (copied from system)
#   launcher.cmd                  backend launcher the shell spawns
#   LINKS.json                    symlink manifest (see below)
#   marisa-distro/node_modules    hoisted runtime store (real files)
#   marisa-distro/harness         harness source tree + built libs/dist
#   .dsh/profiles/marisa          marisa profile + node_modules
#
# v2 slimming (2026-08-15): the bodies are NOT copied from the dev trees.
# The staged source trees get fresh `pnpm install --prod` runs (store-cached,
# no devDeps), then known dead weight is pruned (agent-SDK native binaries
# that are not in the marisa composition, non-win32 native prebuilds). The
# launcher runs the BUILT CLI (apps/cli/lib/bin.js) so no tsx is needed.
#
# Symlink strategy: fresh installs create workspace links as junctions; they
# cannot travel through a zip (7z would follow or mis-store them), so all
# junctions under the staged node_modules trees are deleted after a walker
# records the equivalent links from the LIVE trees into LINKS.json ({link,
# target} pairs, stage-relative, forward slashes). The Go extractor recreates
# them as directory junctions (cmd mklink /J — no admin needed).
param(
  [switch]$SkipBodies,  # keep the existing staged bodies, only re-walk links and re-zip
  [string]$ProfilePath,
  [string]$NodePath,
  [string]$SevenZipPath,
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh' }
$profile = if ($ProfilePath) { [System.IO.Path]::GetFullPath($ProfilePath) } else { Join-Path $dshHome 'profiles\marisa' }
$stage = "$repo\release\_stage"
$out = "$repo\desktop\bundle\backend.tar.zst"
$node = if ($NodePath) { $NodePath } else { (Get-Command node.exe -ErrorAction Stop).Source }
if ($SevenZipPath) {
  $sevenZip = $SevenZipPath
} else {
  $sevenZipCommand = Get-Command 7z.exe -ErrorAction SilentlyContinue
  $sevenZip = if ($sevenZipCommand) { $sevenZipCommand.Source } else { Join-Path $env:ProgramFiles '7-Zip\7z.exe' }
}
foreach ($requiredTool in $node, $sevenZip) {
  if (-not (Test-Path -LiteralPath $requiredTool -PathType Leaf)) { throw "required build tool not found: $requiredTool" }
}
if (-not (Test-Path -LiteralPath $profile -PathType Container)) { throw "marisa profile not found: $profile" }

# registry.npmjs.org is flaky from this network (UND_ERR_DESTROYED / truncated
# packuments); give pnpm more retries, faster cadence, lower concurrency.
$env:npm_config_fetch_retries = '8'
$env:npm_config_fetch_retry_mintimeout = '2000'
$env:npm_config_fetch_retry_maxtimeout = '120000'
$env:npm_config_network_concurrency = '4'

# source prefix -> stage-relative prefix
# Stage paths must also map (the ALL-links recorder walks the STAGE tree):
#   $stage\marisa-distro\...  -> marisa-distro/...
#   $stage\.dsh\...           -> .dsh/...
# Longest-prefix sorting handles the overlap with the $repo\... entries.
$srcMap = @{
  "$repo\node_modules"              = 'marisa-distro/node_modules'
  "$repo\harness"                   = 'marisa-distro/harness'
  "$repo\plugins"                   = 'marisa-distro/plugins'
  "$repo\bundles"                   = 'marisa-distro/bundles'
  "$repo\dsh-mygo"                  = 'marisa-distro/dsh-mygo'
  "$repo\dsh-skill-manager"         = 'marisa-distro/dsh-skill-manager'
  "$profile"                        = '.dsh/profiles/marisa'
  "$stage\marisa-distro"            = 'marisa-distro'
  "$stage\.dsh"                     = '.dsh'
}
$srcPrefixes = $srcMap.Keys | Sort-Object { -$_.Length }

function Copy-DerefTree([string]$src, [string]$dst, [string[]]$excludeDir = @(), [string[]]$excludeFile = @()) {
  $args = @($src, $dst, '/E', '/COPY:DAT', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/XJ')
  if ($excludeDir) { $args += '/XD'; $args += $excludeDir }
  if ($excludeFile) { $args += '/XF'; $args += $excludeFile }
  robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $src -> $dst (code $LASTEXITCODE)" }
}

function Read-Utf8Text([string]$path) {
  return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8Text([string]$path, [string]$text) {
  # Keep patched JavaScript byte-stable across Windows PowerShell 5.1 and
  # PowerShell 7. Set-Content/Get-Content defaults otherwise transcode
  # non-ASCII bundle literals and can turn a valid prebuilt client into a
  # syntax error.
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  # pnpm may hard-link registry files into the virtual store. Replace the
  # staged directory entry instead of writing through that hard link, or a
  # distro-only compatibility patch can mutate pnpm's shared store.
  $temporaryPath = Join-Path ([System.IO.Path]::GetDirectoryName($path)) ([System.IO.Path]::GetRandomFileName())
  try {
    [System.IO.File]::WriteAllText($temporaryPath, $text, $utf8NoBom)
    Remove-Item -LiteralPath $path -Force
    Move-Item -LiteralPath $temporaryPath -Destination $path
  } finally {
    Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
  }
}

function Assert-JavaScriptSyntax([string[]]$paths) {
  foreach ($path in $paths) {
    & $node --check $path
    if ($LASTEXITCODE -ne 0) { throw "patched JavaScript failed syntax check: $path" }
  }
}

function StageRel([string]$path) {
  foreach ($p in $srcPrefixes) {
    if ($path -eq $p) { return $srcMap[$p] }
    if ($path.StartsWith($p + '\')) {
      return $srcMap[$p] + '/' + $path.Substring($p.Length + 1).Replace('\', '/')
    }
  }
  return $null
}

function Resolve-LinkTarget([System.IO.FileSystemInfo]$item) {
  try {
    $target = [string]$item.Target
    if (-not $target) { return $null }
    if ([System.IO.Path]::IsPathRooted($target)) {
      return [System.IO.Path]::GetFullPath($target)
    }
    return [System.IO.Path]::GetFullPath((Join-Path (Split-Path $item.FullName) $target))
  } catch { return $null }
}

function Get-ReparsePointsNoFollow([string]$root) {
  $pending = New-Object System.Collections.Generic.Stack[string]
  $pending.Push([System.IO.Path]::GetFullPath($root))
  while ($pending.Count -gt 0) {
    $directory = $pending.Pop()
    try {
      $entries = [System.IO.Directory]::EnumerateFileSystemEntries($directory)
      foreach ($entry in $entries) {
        try {
          $attributes = [System.IO.File]::GetAttributes($entry)
          if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            Write-Output $entry
          } elseif (($attributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
            $pending.Push($entry)
          }
        } catch {
          Write-Warning "cannot inspect staged entry: $entry ($($_.Exception.Message))"
        }
      }
    } catch {
      Write-Warning "cannot enumerate staged directory: $directory ($($_.Exception.Message))"
    }
  }
}

function Invoke-PnpmProd([string]$cwd, [string]$what) {
  Write-Host "==> pnpm install --prod --frozen-lockfile at $what ..."
  Push-Location $cwd
  try {
    # --ignore-scripts: the staged runtime tree must not run lifecycle scripts
    # (plugins' `prepare` needs the dev toolchain; native packages ship
    # prebuilt binaries for win32 — node-pty/esbuild/sharp/koffi all work
    # without postinstall). lib/ outputs are copied with the source trees.
    # --offline first: everything is in the pnpm store (the live installs
    # fetched it); the registry is flaky from this network (UND_ERR_DESTROYED).
    # Fall back to online only when the store genuinely misses.
    & pnpm install --prod --ignore-scripts --offline --frozen-lockfile 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
      Write-Host "offline install failed (exit $LASTEXITCODE) — retrying online ..."
      & pnpm install --prod --ignore-scripts --frozen-lockfile 2>&1 | Out-Host
    }
    if ($LASTEXITCODE -ne 0) { throw "pnpm install --prod failed at $what (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}

# --- runtime layer cache ------------------------------------------------------
# The backend tree (lockfile-driven install + harness/plugins/bundles bodies)
# changes only when those inputs change. Cache the finished backend.zip keyed
# on their content hashes: a rebuild with unchanged inputs reuses the archive
# in ~0s. VERSION carries NO git sha (only the bundle version, plus a -dirty
# suffix when the workspace is uncommitted) so the extractor's version gate
# stays consistent across cached rebuilds of the same content.
$cacheDir = Join-Path $repo 'release\.cache'
$bundleVersion = if ($Version) { $Version } else { (Get-Content "$repo\package.json" -Raw | ConvertFrom-Json).version }
if ($bundleVersion -notmatch '^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$') { throw "invalid bundle version: $bundleVersion" }

$lockHash = (Get-FileHash "$repo\pnpm-lock.yaml" -Algorithm SHA256).Hash.Substring(0, 16)
# Content hash of the whole workspace (tracked + untracked), uncommitted
# changes included. `git stash create -u` snapshots it as a throwaway commit;
# the COMMIT hash embeds a timestamp (always changes), but the TREE hash
# (`^{tree}`) is content-only and stable while the tree is stable — so a
# dirty tree cache-hits between builds, and a changed tree always misses.
$stashCommit = & git -C $repo stash create -u 2>$null
if (-not $stashCommit) { $stashCommit = & git -C $repo rev-parse HEAD 2>$null }
$headHash = & git -C $repo rev-parse HEAD 2>$null
$workspaceDirty = $stashCommit -ne $headHash
$dirtySuffix = if ($workspaceDirty) { '-dirty' } else { '' }
$treeHash = & git -C $repo rev-parse "$stashCommit^{tree}" 2>$null
if (-not $treeHash) { throw "cannot resolve content tree hash from $stashCommit" }
$runtimeKey = "$lockHash-$($treeHash.Substring(0, 12))"
$cachedZip = Join-Path $cacheDir "backend-$runtimeKey.zip"

if (-not $SkipBodies -and (Test-Path -LiteralPath $cachedZip)) {
  Write-Host "runtime cache HIT: $cachedZip"
  Copy-Item -LiteralPath $cachedZip -Destination $out -Force
  Write-Host ('bundle written from cache: {0} bytes ({1:N1} MB)' -f (Get-Item $out).Length, ((Get-Item $out).Length / 1MB))
  exit 0
}

# --- clean + skeleton -------------------------------------------------------
if (-not $SkipBodies) {
  Remove-Item $stage, $out -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force "$stage\marisa-distro", "$stage\.dsh\profiles" | Out-Null

if (-not $SkipBodies) {
  Set-Content -Path "$stage\VERSION" -Value "marisa-backend-$bundleVersion$dirtySuffix" -NoNewline
  Copy-Item $node "$stage\node.exe"
  # mnemon memory engine: the plugin spawns `mnemon` (PATH lookup) and the
  # launcher prepends the bundle root, so the exe rides next to node.exe.
  Copy-Item "$repo\desktop\bundle\mnemon.exe" "$stage\mnemon.exe" -Force
  # launcher.cmd must be CRLF: cmd.exe mis-parses LF-only batch files
  # (each line loses its first two chars — `rem x` executes as `m x`).
  $launcherText = Get-Content "$repo\desktop\bundle\launcher.cmd" -Raw
  $launcherText = $launcherText -replace "`r?`n", "`r`n"
  Set-Content -Path "$stage\launcher.cmd" -Value $launcherText -NoNewline -Encoding ascii
}

# --- stage source trees (no node_modules anywhere) ---------------------------
if (-not $SkipBodies) {
  Write-Host 'staging workspace files ...'
  Copy-Item "$repo\package.json" "$stage\marisa-distro\package.json" -Force
  Copy-Item "$repo\pnpm-lock.yaml" "$stage\marisa-distro\pnpm-lock.yaml" -Force
  Copy-Item "$repo\pnpm-workspace.yaml" "$stage\marisa-distro\pnpm-workspace.yaml" -Force
  Write-Host 'copying harness body (node_modules + nested workspace/lock files excluded) ...'
  # rc7 sync (2026-08-18): pnpm 11 treats EITHER a member-owned pnpm-workspace.yaml
  # OR a member-owned pnpm-lock.yaml as a nested project and installs it
  # independently (devDeps included), doubling the staged tree
  # (harness/node_modules/.pnpm ~1.2 GB). The staged install must resolve the
  # WHOLE tree as ONE root workspace, so both nested files are not staged.
  Copy-DerefTree "$repo\harness" "$stage\marisa-distro\harness" 'node_modules' @('pnpm-workspace.yaml', 'pnpm-lock.yaml')
  Write-Host 'copying plugins body (node_modules excluded) ...'
  Copy-DerefTree "$repo\plugins" "$stage\marisa-distro\plugins" 'node_modules'
  Write-Host 'copying bundles body (node_modules excluded) ...'
  Copy-DerefTree "$repo\bundles" "$stage\marisa-distro\bundles" 'node_modules'
  Write-Host 'copying release profile workspace member (node_modules excluded) ...'
  Copy-DerefTree "$repo\profiles\marisa\runtime" "$stage\marisa-distro\profiles\marisa\runtime" 'node_modules'
  Write-Host 'copying pnpm compatibility patches ...'
  Copy-DerefTree "$repo\patches" "$stage\marisa-distro\patches"
  Write-Host 'copying dsh-skill-manager body ...'
  Copy-DerefTree "$repo\dsh-skill-manager" "$stage\marisa-distro\dsh-skill-manager"
  Write-Host 'copying vendored dsh-mygo body ...'
  Copy-DerefTree "$repo\dsh-mygo" "$stage\marisa-distro\dsh-mygo" 'node_modules'
  Write-Host 'copying profile files (node_modules excluded) ...'
  Copy-DerefTree $profile "$stage\.dsh\profiles\marisa" 'node_modules'

  # Marisa is a packaged distribution, not an upstream internal-test build.
  # A bundled DSH home is recreated for each backend version, so seed the
  # upstream acknowledgement with the version that ships in this bundle.
  # rc7 sync (2026-08-18): onboarding-copy.ts moved from ui-settings-general
  # to ui-settings-models.
  $onboardingCopy = "$stage\marisa-distro\harness\packages\client\ui-settings-models\src\onboarding-copy.ts"
  $onboardingMatch = [regex]::Match((Read-Utf8Text $onboardingCopy), "(?m)^export const WELCOME_NOTICE_VERSION = '([^']+)'$")
  if (-not $onboardingMatch.Success) {
    throw "cannot determine the bundled Harness welcome-notice version: $onboardingCopy"
  }
  @"
# Marisa acknowledges the upstream internal-test notice for its bundled home.
ui-onboarding:
  welcomeNoticeVersion: '$($onboardingMatch.Groups[1].Value)'
"@ | Set-Content -Path "$stage\.dsh\settings.yaml" -NoNewline -Encoding utf8

  # --- single production install (store-cached) ------------------------------
  # The root workspace is the ONE tree: harness + plugins + marisa-bundle +
  # the 8 npm plugins (root package.json deps). The profile in the bundle is
  # files-only; its node_modules is ONE junction to marisa-distro/node_modules
  # (recorded in LINKS.json) — every composition row name resolves through it,
  # and nothing is duplicated.
  Invoke-PnpmProd "$stage\marisa-distro" 'repo root workspace'

  # rc7 sync (2026-08-18): the vendored input stack provides `ctx.inputTriggers`
  # (ui-input-trigger) and `ctx.commandUi` (ui-commands) natively, so the legacy
  # 0808-snapshot service-alias patches are gone with the old ui-slash/ui-command
  # packages. The aigc-canvas client module-id rewrite left with the plugin's
  # removal (2026-08-19).

  # --- prune dead weight ------------------------------------------------------
  # Round 1 (2026-08-15): agent-SDK binaries not in the marisa composition
  # (dump-config proves only subagent/subagent-spawn/subagent-fork are
  # mounted), non-deepseek provider SDKs, and client-only browser libraries
  # (the web UI serves the prebuilt vite dist + the 9-module static table;
  # mermaid/echarts/univer etc. are inlined into plugin client bundles at
  # plugin build time — dead at runtime).
  Write-Host 'pruning dead weight ...'
  $pruned = 0
  $prunePaths = @(
    # agent-SDK native binaries (subagent-codex / subagent-claude-code not mounted)
    'marisa-distro\node_modules\@openai',
    'marisa-distro\node_modules\@anthropic-ai\claude-agent-sdk',
    'marisa-distro\node_modules\@anthropic-ai\claude-agent-sdk-win32-x64',
    'marisa-distro\node_modules\@anthropic-ai\sdk',
    # provider SDKs not in the marisa composition (llm = deepseek-official)
    'marisa-distro\node_modules\@mistralai',
    # client-only browser libraries (inlined into dist / plugin client bundles)
    'marisa-distro\node_modules\mermaid',
    'marisa-distro\node_modules\three',
    'marisa-distro\node_modules\echarts',
    'marisa-distro\node_modules\@univerjs',
    'marisa-distro\node_modules\@univerjs-pro',
    'marisa-distro\node_modules\@codemirror',
    'marisa-distro\node_modules\@aiden0z',
    'marisa-distro\node_modules\xterm',
    'marisa-distro\node_modules\@xterm'
  )
  foreach ($rel in $prunePaths) {
    $p = Join-Path $stage $rel
    if (Test-Path $p) {
      $size = (Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
      Remove-Item $p -Recurse -Force
      $pruned += [long]$size
      Write-Host ("  pruned {0}  ({1:N0} bytes)" -f $rel, $size)
    }
  }
  # non-win32 native prebuilds: node-pty / sharp(@img) / esbuild(@esbuild)
  $pb = Join-Path $stage 'marisa-distro\node_modules\node-pty\prebuilds'
  if (Test-Path $pb) {
    Get-ChildItem $pb -Directory | Where-Object { $_.Name -ne 'win32-x64' } | ForEach-Object {
      $size = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
      Remove-Item $_.FullName -Recurse -Force
      $pruned += [long]$size
      Write-Host ("  pruned node-pty\prebuilds\{0}  ({1:N0} bytes)" -f $_.Name, $size)
    }
  }
  # 2026-08-18: only prune PLATFORM binary packages (sharp-libvips-*/esbuild-*).
  # The previous "everything not win32-x64" rule deleted @img/colour, a pure-JS
  # dependency of sharp, and the packaged backend failed to boot
  # (ERR_MODULE_NOT_FOUND '@img/colour' from sharp/dist/colour.mjs).
  foreach ($scope in '@img', '@esbuild') {
    $sd = Join-Path $stage "marisa-distro\node_modules\$scope"
    if (Test-Path $sd) {
      Get-ChildItem $sd -Directory | Where-Object {
        $_.Name -match '^(sharp-libvips|sharp-win32|esbuild)-' -and $_.Name -notmatch 'win32-x64$'
      } | ForEach-Object {
        $size = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        Remove-Item $_.FullName -Recurse -Force
        $pruned += [long]$size
        Write-Host ("  pruned {0}\{1}  ({2:N0} bytes)" -f $scope, $_.Name, $size)
      }
    }
  }
  # --- dev-only packages in the pnpm virtual store -----------------------------
  # `pnpm install --prod` at the workspace root prunes only the ROOT project's
  # devDependencies; every member's devDeps (typescript, rolldown, oxlint,
  # esbuild, codex, claude-agent-sdk, playwright, vitest, ...) still land in the
  # virtual store (~1.2 GB staged) and ship in the bundle. Hoisted top-level
  # entries are links INTO this store, so the prune above drops links but the
  # real bytes stay. Delete the store bodies of packages that are dev-only for
  # the marisa runtime composition (codex/claude subagents are not mounted by
  # the marisa cordis composition; the rest are build/test tooling or
  # client-only libraries already inlined into prebuilt plugin bundles).
  Write-Host 'pruning dev-only packages from the pnpm virtual store ...'
  $storeKillExact = @(
    '@openai+codex',
    '@anthropic-ai+claude-agent-sdk',
    '@anthropic-ai+claude-agent-sdk-win32-x64',
    '@anthropic-ai+sdk',
    '@mistralai+mistralai',
    'typescript',
    'rolldown', '@rolldown+binding-win32-x64-msvc',
    'tsdown',
    'oxlint', 'oxlint-tsgolint',
    '@oxlint+binding-win32-x64-msvc', '@oxlint-tsgolint+win32-x64',
    'esbuild', '@esbuild+win32-x64',
    'rollup',
    'playwright', 'playwright-core',
    'mermaid',
    'lefthook', 'lefthook-windows-x64',
    'lightningcss', 'lightningcss-win32-x64-msvc',
    'shiki', '@shikijs+core', '@shikijs+langs',
    'eslint', 'eslint-plugin-sonarjs',
    'vitest',
    'tsx',
    'knip', 'publint',
    'vite', 'vitepress',
    'jsdom',
    'prettier'
  )
  $storeKillPrefix = @('@types+', '@vitest+', '@eslint+', '@algolia+', '@openai+', '@anthropic-ai+')
  foreach ($storeRoot in @("$stage\marisa-distro\harness\node_modules\.pnpm", "$stage\marisa-distro\node_modules\.pnpm", "$stage\.dsh\profiles\marisa\node_modules\.pnpm")) {
    if (-not (Test-Path $storeRoot)) { continue }
    foreach ($entry in Get-ChildItem $storeRoot -Directory) {
      $m = [regex]::Match($entry.Name, '^(@[^@]+?\+[^@]+?|[^@]+?)@')
      if (-not $m.Success) { continue }
      $pkgKey = $m.Groups[1].Value
      $kill = $storeKillExact -contains $pkgKey
      if (-not $kill) {
        foreach ($pre in $storeKillPrefix) { if ($pkgKey.StartsWith($pre)) { $kill = $true; break } }
      }
      if ($kill) {
        $size = (Get-ChildItem $entry.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        Remove-Item $entry.FullName -Recurse -Force
        $pruned += [long]$size
        Write-Host ("  pruned store {0}  ({1:N0} bytes)" -f $entry.Name, $size)
      }
    }
  }
  Write-Host ("total pruned: {0:N1} MB" -f ($pruned / 1MB))
}

# --- staged tree integrity check ----------------------------------------------
# 2026-08-15 regression: a stage install can silently produce an EMPTY root
# node_modules (pnpm "added 0" when live member node_modules leaked into the
# stage via the plugins/bundles body copy) — every hoisted package ended up a
# bare directory and the zip shipped without js-yaml etc. Fail loudly instead.
# Also catches the junction-walk corruption of staged workspace member dirs.
Write-Host 'verifying staged tree integrity ...'
$bad = @()
Get-ChildItem "$stage\marisa-distro\node_modules" -Directory -Force -ErrorAction SilentlyContinue |
  Where-Object { -not $_.Name.StartsWith('.') } | ForEach-Object {
    if (-not (Test-Path -LiteralPath (Join-Path $_.FullName 'package.json'))) {
      if ($_.Name.StartsWith('@')) {
        Get-ChildItem $_.FullName -Directory -Force | ForEach-Object {
          if (-not (Test-Path -LiteralPath (Join-Path $_.FullName 'package.json'))) {
            $script:bad += "@$($_.Parent.Name)/$($_.Name)"
          }
        }
      } else { $script:bad += $_.Name }
    }
  }
foreach ($memberGlob in 'plugins/*', 'bundles/*', 'harness/packages/*/*', 'harness/vendor/*', 'harness/apps/*') {
  Get-ChildItem (Join-Path "$stage\marisa-distro" $memberGlob) -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    if (-not (Test-Path -LiteralPath (Join-Path $_.FullName 'package.json'))) {
      $script:bad += $_.FullName.Substring($stage.Length + 1).Replace('\', '/')
    }
  }
}
if ($bad.Count -gt 0) {
  throw ("staged tree INCOMPLETE — {0} entries missing package.json: {1}" -f $bad.Count, (($bad | Select-Object -First 20) -join ', '))
}
# External plugins resolve these names from the root production tree. They are
# workspace packages (and therefore become junctions), so checking only the
# general package count below can miss either one while still producing a zip.
foreach ($requiredRootPackage in '@deepseek-ai/schemastery', '@deepseek-ai/dsh-workflow', '@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-host-apiproxy', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-session-persistence', '@deepseek-ai/dsh-credentials', '@r05en1cu/dsh-mygo', '@r05en1cu/dsh-mygo-loader-hub', '@r05en1cu/dsh-mygo-cli', '@r05en1cu/dsh-mygo-ext-panel') {
  $requiredPath = Join-Path "$stage\marisa-distro\node_modules" $requiredRootPackage
  if (-not (Test-Path -LiteralPath (Join-Path $requiredPath 'package.json'))) {
    throw "staged tree INCOMPLETE — required root runtime package missing: $requiredRootPackage"
  }
}
Write-Host '  staged tree integrity OK'

# --- symlink walker -----------------------------------------------------------
# Every reparse point under the LIVE source roots becomes a LINKS.json entry
# (mapped to stage-relative paths). Real files/dirs inside internal
# node_modules dirs get robocopied into the stage (the body copy above
# excluded them wholesale).
$links = New-Object System.Collections.Generic.List[object]
$copied = 0
function Handle-NodeModulesDir([string]$srcDir) {
  Get-ChildItem $srcDir -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.LinkType } | ForEach-Object {
      $item = Get-Item -LiteralPath $_.FullName -Force
      $resolved = Resolve-LinkTarget $item
      if (-not $resolved -or -not (Test-Path -LiteralPath $resolved)) { return }
      if (-not (Test-Path -LiteralPath $resolved -PathType Container)) { return }
      # Links into the live harness top-level store are dev-layout artifacts:
      # the store is not shipped, and the staged install creates the same member
      # junctions against the hoisted root (recorded by the ALL-staged pass —
      # which only sees them if no walker entry claims the link path first).
      if ($resolved.StartsWith("$harnessTopNm\")) { return }
      $targetRel = StageRel $resolved
      if (-not $targetRel) { return }
      $linkRel = StageRel $_.FullName
      if ($linkRel -and $targetRel) { $script:links.Add(@{ link = $linkRel; target = $targetRel }) }
    }
  Get-ChildItem $srcDir -Force -ErrorAction SilentlyContinue |
    Where-Object { -not $_.LinkType } | ForEach-Object {
      $entryRel = StageRel $_.FullName
      if (-not $entryRel) { return }
      $targetStage = Join-Path $stage $entryRel.Replace('/', '\')
      New-Item -ItemType Directory -Force (Split-Path $targetStage) | Out-Null
      if ($_.PSIsContainer) {
        Copy-DerefTree $_.FullName $targetStage
      } else {
        Copy-Item $_.FullName $targetStage -Force
      }
      $script:copied++
    }
}

Write-Host 'walking live harness internal node_modules for links ...'
$harnessTopNm = Join-Path $repo 'harness\node_modules'
Get-ChildItem "$repo\harness" -Directory -Recurse -Force -ErrorAction SilentlyContinue |
  # rc7 sync (2026-08-18): skip the harness TOP-LEVEL node_modules SUBTREE — in
  # the live tree it is a nested-workspace store (harness/pnpm-workspace.yaml)
  # whose 1.3 GB of real files must not enter the staged tree. The exclusion
  # must cover the whole subtree, not just the directory itself: the recursive
  # enumeration descends into it and would otherwise find the ~924 virtual-store
  # slot dirs (.pnpm/<pkg>@<ver>/node_modules) and copy the live DEV install
  # (devDeps included) into the stage. The staged install resolves the whole
  # tree as ONE root workspace and creates member links itself, so member deps
  # resolve through the root node_modules and harness/node_modules is absent
  # there. Member-internal node_modules dirs (packages/*/*/node_modules etc.)
  # are still walked for their links and small real files.
  Where-Object { $_.Name -eq 'node_modules' -and -not $_.LinkType -and $_.FullName -ne $harnessTopNm -and -not $_.FullName.StartsWith("$harnessTopNm\") } |
  ForEach-Object { Handle-NodeModulesDir $_.FullName }

# The profile's node_modules is ONE junction to the single root tree — every
# composition row name resolves through it (the bundle's deps are hoisted at
# the root, and the npm plugins are root deps). No live-profile walk needed.
$links.Add(@{
  link   = '.dsh/profiles/marisa/node_modules'
  target = 'marisa-distro/node_modules'
})

# ALL staged reparse points (2026-08-15 regression): pnpm links workspace
# members and member deps into node_modules trees across root/plugins/bundles/
# harness as junctions. The live-tree walker above only covered harness-
# internal nm dirs, so ~1000 links (root workspace:^ packages like dsh-bash,
# plugin-internal deps like @deepseek-ai/dsh-workflow, member deps like
# schemastery) were wiped by the junction-delete phase without being recorded
# — boot then died with ERR_MODULE_NOT_FOUND for each. Collect EVERY staged
# reparse point with an explicit non-following directory walk, record {link,target}
# pairs into LINKS.json (deduped), and reuse the same list for deletion.
Write-Host 'recording ALL staged links (explicit no-follow walk) ...'
$stagedLinks = @(Get-ReparsePointsNoFollow $stage)
$seenLinks = New-Object System.Collections.Generic.HashSet[string]
foreach ($existingLink in $links) { [void]$seenLinks.Add([string]$existingLink.link) }
$recordedExtra = 0
foreach ($lp in $stagedLinks) {
  $item = Get-Item -LiteralPath $lp -Force -ErrorAction SilentlyContinue
  if (-not $item) { continue }
  $resolved = Resolve-LinkTarget $item
  if (-not $resolved -or -not (Test-Path -LiteralPath $resolved)) { continue }
  if (-not (Test-Path -LiteralPath $resolved -PathType Container)) { continue }
  $targetRel = StageRel $resolved
  $linkRel = StageRel $lp
  if ($linkRel -and $targetRel -and $seenLinks.Add($linkRel)) {
    $script:links.Add(@{ link = $linkRel; target = $targetRel })
    $recordedExtra++
  }
}
Write-Host "links recorded: $($links.Count) ($recordedExtra extra beyond walker); extra entries copied: $copied"
foreach ($requiredRootLink in 'marisa-distro/node_modules/@deepseek-ai/schemastery', 'marisa-distro/node_modules/@deepseek-ai/dsh-workflow', 'marisa-distro/node_modules/@deepseek-ai/dsh-host-webserver', 'marisa-distro/node_modules/@deepseek-ai/dsh-host-apiproxy') {
  if (-not ($links | Where-Object { $_.link -eq $requiredRootLink })) {
    throw "link manifest INCOMPLETE — required root runtime link missing: $requiredRootLink"
  }
}
$links | ConvertTo-Json | Set-Content "$stage\LINKS.json" -Encoding utf8

# --- delete staged junctions (7z must not see reparse points) -----------------
# pwsh 7 Remove-Item NREs on junctions (esp. when the target was pruned);
# cmd rmdir removes the junction link itself and never follows into the
# target. File symlinks (.bin shims) fall back to Remove-Item.
# IMPORTANT: the explicit walker records reparse points but never descends into
# them. Recursive filesystem commands can follow junctions into live trees,
# racing deletion and corrupting staged source dirs.
Write-Host 'deleting staged junctions (links live in LINKS.json only) ...'
$junctions = @($stagedLinks)
$junctions | ForEach-Object {
  if (Test-Path -LiteralPath $_ -PathType Container) {
    & cmd /c "rmdir `"$_`"" 2>$null
  } else {
    Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue
  }
}
Write-Host "  junctions deleted: $($junctions.Count)"

# --- runtime dead-weight prune ------------------------------------------------
# Sourcemaps and test suites are the bulk of the FILE COUNT (not bytes), and
# file count dominates extraction time (56k opens/writes). They are never
# read at runtime (verified by boot self-check). Run AFTER junction deletion:
# the tree is then pure real files, so a recursive walk cannot escape into a
# live store. 2026-08-18, per the node_modules distribution review.
Write-Host 'pruning runtime dead weight (*.map, test suites) ...'
$prunedCount = 0
$pending = New-Object System.Collections.Generic.Stack[string]
$pending.Push($stage)
while ($pending.Count -gt 0) {
  $d = $pending.Pop()
  try {
    foreach ($e in [System.IO.Directory]::EnumerateFileSystemEntries($d)) {
      $attr = [System.IO.File]::GetAttributes($e)
      if (($attr -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
      if (($attr -band [System.IO.FileAttributes]::Directory) -ne 0) {
        $name = [System.IO.Path]::GetFileName($e)
        if ($name -eq 'test' -or $name -eq 'tests' -or $name -eq '__tests__') {
          [System.IO.Directory]::Delete($e, $true)
          $prunedCount++
        } else {
          $pending.Push($e)
        }
      } elseif ($e.EndsWith('.map')) {
        [System.IO.File]::Delete($e)
        $prunedCount++
      }
    }
  } catch { }
}
Write-Host "  pruned $prunedCount entries (test dirs + *.map)"

# --- prune redundant member-internal node_modules ------------------------------
# (2026-08-18, backend size review) The pnpm install puts two classes of dead
# weight inside member-internal node_modules dirs (packages/*/*/node_modules,
# apps/*/node_modules, native/*/node_modules, vendor/*/node_modules etc.):
#
#   1. `.ignored_*` dirs — pnpm vendored DEV toolchains (typescript, sharp,
#      diff, chokidar, node-pty). They are dot-prefixed, so Node's resolution
#      NEVER finds them (dot-dirs are skipped), and they are only there for the
#      dev build toolchain. ~150 MB across the tree. 100% dead at runtime.
#
#   2. Real duplicates of runtime deps (node-pty, diff, fflate, chokidar,
#      readdirp) that the single-root install also hoists to
#      marisa-distro/node_modules. Node resolves the nearest copy first, but
#      walking UP reaches the identical hoisted root copy, so the internal
#      copies are byte-for-byte redundant.
#
# The @deepseek-ai/* workspace junctions inside these dirs are ALREADY recorded
# in LINKS.json (recreated at extraction by createJunction, which does
# os.MkdirAll on the parent), so deleting the internal real files / empty
# junction-slot dirs loses nothing. Run AFTER junction deletion (pure real
# files) — a recursive walk cannot escape into a live store.
Write-Host 'pruning redundant member-internal node_modules (.ignored_*, hoisted dupes) ...'
$internalPrunedBytes = 0L
$internalPrunedCount = 0
$dupeNames = @('node-pty', 'diff', 'fflate', 'chokidar', 'readdirp')
# The root store (marisa-distro/node_modules) is the single source of truth for
# these deps and MUST never be touched here: its package dirs legitimately
# contain subdirs that collide with $dupeNames (e.g. diff/libcjs/diff), and its
# top-level dupes are the hoisted runtime copies we RESOLVE to. Skip the whole
# subtree. Only member-internal node_modules (harness/plugins/bundles bodies)
# carry the redundant copies.
$rootStore = (Join-Path "$stage\marisa-distro" 'node_modules')
$pending2 = New-Object System.Collections.Generic.Stack[string]
$pending2.Push($stage)
while ($pending2.Count -gt 0) {
  $d = $pending2.Pop()
  try {
    foreach ($e in [System.IO.Directory]::EnumerateFileSystemEntries($d)) {
      $attr = [System.IO.File]::GetAttributes($e)
      if (($attr -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
      if (($attr -band [System.IO.FileAttributes]::Directory) -eq 0) { continue }
      if ($e -eq $rootStore) { continue }  # never walk the root store
      $name = [System.IO.Path]::GetFileName($e)
      $delete = $false
      if ($name.StartsWith('.ignored_')) {
        $delete = $true
      } elseif ($dupeNames -contains $name) {
        # only prune real duplicates inside INTERNAL member node_modules; the
        # parent dir must BE a member-internal node_modules (not a subdir of a
        # root package). Member-internal node_modules always sit directly under
        # a member dir (harness/packages/*/*/node_modules etc.), so the parent's
        # basename is 'node_modules' and it is not the root store.
        $parent = [System.IO.Path]::GetDirectoryName($e)
        $parentName = [System.IO.Path]::GetFileName($parent)
        if ($parentName -eq 'node_modules' -and $parent -ne $rootStore) {
          $delete = $true
        }
      }
      if ($delete) {
        $size = (Get-ChildItem $e -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        [System.IO.Directory]::Delete($e, $true)
        $internalPrunedBytes += [long]$size
        $internalPrunedCount++
      } else {
        $pending2.Push($e)
      }
    }
  } catch { }
}
Write-Host ("  pruned {0} entries from member-internal node_modules ({1:N1} MB)" -f $internalPrunedCount, ($internalPrunedBytes / 1MB))

# --- pre-zip sanity: root workspace links must be covered ----------------------
# (2026-08-15: without them the zip ships without every @deepseek-ai member and
# boot dies importing e.g. @deepseek-ai/dsh-settings from dsh-llm-fallbacks.)
$rootLinkCount = @($links | Where-Object { $_.link.StartsWith('marisa-distro/node_modules/') }).Count
$rootEntityCount = @(Get-ChildItem "$stage\marisa-distro\node_modules\@deepseek-ai" -Directory -Force -ErrorAction SilentlyContinue).Count
if (($rootLinkCount + $rootEntityCount) -lt 10) {
  throw "suspiciously few root node_modules workspace members (links=$rootLinkCount entities=$rootEntityCount) — refusing to zip"
}
Write-Host "  root node_modules workspace coverage: links=$rootLinkCount entities=$rootEntityCount"

# --- tar.zst ------------------------------------------------------------------
# Single-stream tar.zst via desktop/bundle/tarszst (sorted entries, 16MB
# window, one zstd stream): better ratio and faster build than per-file zip,
# and the desktop extractor decodes one sequential stream at ~1GB/s.
Write-Host 'tarring + zstd ...'
# go -C: the tarszst tool lives in the desktop module (go.mod there).
& go -C "$repo\desktop" run ./bundle/tarszst $stage $out
if ($LASTEXITCODE -ne 0) { throw "tarszst failed: $LASTEXITCODE" }
Write-Host ('bundle written: {0} bytes ({1:N1} MB)' -f (Get-Item $out).Length, ((Get-Item $out).Length / 1MB))

# --- runtime cache write ------------------------------------------------------
# keyed on content (incl. uncommitted changes), so any stable tree caches.
if (-not $SkipBodies) {
  New-Item -ItemType Directory -Force $cacheDir | Out-Null
  Copy-Item -LiteralPath $out -Destination $cachedZip -Force
  Write-Host "runtime cache written: $cachedZip"
}
