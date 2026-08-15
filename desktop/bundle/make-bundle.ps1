# make-bundle.ps1 — stage the standalone backend bundle and zip it into
# desktop/bundle/backend.zip (consumed by go:embed with -tags embeddedbundle).
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
  [string]$SevenZipPath
)

$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh' }
$profile = if ($ProfilePath) { [System.IO.Path]::GetFullPath($ProfilePath) } else { Join-Path $dshHome 'profiles\marisa' }
$stage = "$repo\release\_stage"
$out = "$repo\desktop\bundle\backend.zip"
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
  "$repo\dsh-skill-manager"         = 'marisa-distro/dsh-skill-manager'
  "$profile"                        = '.dsh/profiles/marisa'
  "$stage\marisa-distro"            = 'marisa-distro'
  "$stage\.dsh"                     = '.dsh'
}
$srcPrefixes = $srcMap.Keys | Sort-Object { -$_.Length }

function Copy-DerefTree([string]$src, [string]$dst, [string]$excludeDir = $null) {
  $args = @($src, $dst, '/E', '/COPY:DAT', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/XJ')
  if ($excludeDir) { $args += @('/XD', $excludeDir) }
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

function Invoke-PnpmProd([string]$cwd, [string]$what) {
  Write-Host "==> pnpm install --prod at $what ..."
  Push-Location $cwd
  try {
    # --ignore-scripts: the staged runtime tree must not run lifecycle scripts
    # (plugins' `prepare` needs the dev toolchain; native packages ship
    # prebuilt binaries for win32 — node-pty/esbuild/sharp/koffi all work
    # without postinstall). lib/ outputs are copied with the source trees.
    # --offline first: everything is in the pnpm store (the live installs
    # fetched it); the registry is flaky from this network (UND_ERR_DESTROYED).
    # Fall back to online only when the store genuinely misses.
    & pnpm install --prod --ignore-scripts --offline --no-frozen-lockfile 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
      Write-Host "offline install failed (exit $LASTEXITCODE) — retrying online ..."
      & pnpm install --prod --ignore-scripts --no-frozen-lockfile 2>&1 | Out-Host
    }
    if ($LASTEXITCODE -ne 0) { throw "pnpm install --prod failed at $what (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}

# --- clean + skeleton -------------------------------------------------------
if (-not $SkipBodies) {
  Remove-Item $stage, $out -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force "$stage\marisa-distro", "$stage\.dsh\profiles" | Out-Null

if (-not $SkipBodies) {
  $sha = & git -C $repo rev-parse --short HEAD 2>$null
  if (-not $sha) { $sha = 'nosha' }
  Set-Content -Path "$stage\VERSION" -Value "marisa-backend-v2-$sha-$(Get-Date -Format yyyyMMddHHmmss)" -NoNewline
  Copy-Item $node "$stage\node.exe"
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
  Copy-Item "$repo\pnpm-workspace.yaml" "$stage\marisa-distro\pnpm-workspace.yaml" -Force
  Write-Host 'copying harness body (node_modules excluded) ...'
  Copy-DerefTree "$repo\harness" "$stage\marisa-distro\harness" 'node_modules'
  Write-Host 'copying plugins body (node_modules excluded) ...'
  Copy-DerefTree "$repo\plugins" "$stage\marisa-distro\plugins" 'node_modules'
  Write-Host 'copying bundles body (node_modules excluded) ...'
  Copy-DerefTree "$repo\bundles" "$stage\marisa-distro\bundles" 'node_modules'
  Write-Host 'copying dsh-skill-manager body ...'
  Copy-DerefTree "$repo\dsh-skill-manager" "$stage\marisa-distro\dsh-skill-manager"
  Write-Host 'copying profile files (node_modules excluded) ...'
  Copy-DerefTree $profile "$stage\.dsh\profiles\marisa" 'node_modules'
  Remove-Item "$stage\.dsh\profiles\marisa\pnpm-lock.yaml" -Force -ErrorAction SilentlyContinue

  # --- single production install (store-cached) ------------------------------
  # The root workspace is the ONE tree: harness + plugins + marisa-bundle +
  # the 8 npm plugins (root package.json deps). The profile in the bundle is
  # files-only; its node_modules is ONE junction to marisa-distro/node_modules
  # (recorded in LINKS.json) — every composition row name resolves through it,
  # and nothing is duplicated.
  Invoke-PnpmProd "$stage\marisa-distro" 'repo root workspace'

  # Registry rc.6 client bundles use the `dsh.client` graph and must stay on
  # the registry client-modules implementation. dsh-sonar still injects the
  # previous service name, so publish the same instance under that alias.
  # The exact signature makes upstream drift fail the build instead of
  # silently shipping a backend that loops after reporting its URL.
  $clientModulesLib = "$stage\marisa-distro\node_modules\@deepseek-ai\dsh-client-modules\lib\index.js"
  $clientModulesText = Read-Utf8Text $clientModulesLib
  $clientModulesNeedle = "`tconstructor(ctx) {`n`t`tsuper(ctx, `"clientModules`");"
  $clientModulesPatched = "$clientModulesNeedle`n`t`tctx.provide(`"clientModuleHost`", this);"
  if ($clientModulesText.Contains($clientModulesNeedle) -and -not $clientModulesText.Contains($clientModulesPatched)) {
    $clientModulesText = $clientModulesText.Replace($clientModulesNeedle, $clientModulesPatched)
  } elseif (-not $clientModulesText.Contains($clientModulesPatched)) {
    throw 'dsh-client-modules rc.6 compatibility signature not found'
  }
  Write-Utf8Text $clientModulesLib $clientModulesText

  # marisa's diff-viewer replaces the stock edit/write rows. Registry rc.6
  # keyed slots are exclusive, so omit the stock registrant in this distro.
  $uiToolLib = "$stage\marisa-distro\node_modules\@deepseek-ai\dsh-client-ui-tool\lib\client.js"
  $uiToolText = Read-Utf8Text $uiToolLib
  $uiToolNeedle = "`t`t`tctx.plugin(fileMutationToolview);"
  $uiToolPatched = "`t`t`t// marisa-distro: dsh-diff-viewer owns edit/write"
  if ($uiToolText.Contains($uiToolNeedle)) {
    $uiToolText = $uiToolText.Replace($uiToolNeedle, $uiToolPatched)
  } elseif (-not $uiToolText.Contains($uiToolPatched)) {
    throw 'dsh-client-ui-tool rc.6 compatibility signature not found'
  }
  Write-Utf8Text $uiToolLib $uiToolText

  foreach ($aliasPatch in @(
    @{ Path = "$stage\marisa-distro\harness\packages\client\ui-slash\lib\client.js"; Needle = 'super(ctx, "slash");'; Alias = 'ctx.provide("inputTriggers", this);' },
    @{ Path = "$stage\marisa-distro\harness\packages\client\ui-command\lib\client.js"; Needle = 'super(ctx, "command");'; Alias = 'ctx.provide("commandUi", this);' }
  )) {
    $aliasText = Read-Utf8Text $aliasPatch.Path
    $aliasPatched = "$($aliasPatch.Needle)`n`t`t`t`t$($aliasPatch.Alias)"
    if ($aliasText.Contains($aliasPatch.Needle) -and -not $aliasText.Contains($aliasPatched)) {
      $aliasText = $aliasText.Replace($aliasPatch.Needle, $aliasPatched)
    } elseif (-not $aliasText.Contains($aliasPatched)) {
      throw "client service compatibility signature not found: $($aliasPatch.Path)"
    }
    Write-Utf8Text $aliasPatch.Path $aliasText
  }

  $aigcClientLib = "$stage\marisa-distro\node_modules\@huanlin\dsh-plugin-aigc-canvas\lib\client.js"
  $aigcClientText = Read-Utf8Text $aigcClientLib
  $aigcOldId = 'id: "@dsh-external/dsh-aigc-canvas"'
  $aigcNewId = 'id: "@huanlin/dsh-plugin-aigc-canvas"'
  if ($aigcClientText.Contains($aigcOldId)) {
    $aigcClientText = $aigcClientText.Replace($aigcOldId, $aigcNewId)
  } elseif (-not $aigcClientText.Contains($aigcNewId)) {
    throw 'dsh-plugin-aigc-canvas compatibility signature not found'
  }
  Write-Utf8Text $aigcClientLib $aigcClientText

  Assert-JavaScriptSyntax @(
    $clientModulesLib,
    $uiToolLib,
    "$stage\marisa-distro\harness\packages\client\ui-slash\lib\client.js",
    "$stage\marisa-distro\harness\packages\client\ui-command\lib\client.js",
    $aigcClientLib
  )

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
  foreach ($scope in '@img', '@esbuild') {
    $sd = Join-Path $stage "marisa-distro\node_modules\$scope"
    if (Test-Path $sd) {
      Get-ChildItem $sd -Directory | Where-Object { $_.Name -notmatch 'win32-x64$' } | ForEach-Object {
        $size = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        Remove-Item $_.FullName -Recurse -Force
        $pruned += [long]$size
        Write-Host ("  pruned {0}\{1}  ({2:N0} bytes)" -f $scope, $_.Name, $size)
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
foreach ($requiredRootPackage in 'schemastery', '@deepseek-ai/dsh-workflow', '@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-host-apiproxy', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-session-persistence', '@deepseek-ai/dsh-credentials') {
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
Get-ChildItem "$repo\harness" -Directory -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq 'node_modules' -and -not $_.LinkType } |
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
# reparse point via `dir /a:l` (never dereferences), record {link,target}
# pairs into LINKS.json (deduped), and reuse the same list for deletion.
Write-Host 'recording ALL staged links (dir /a:l, no deref) ...'
$stagedLinks = @(& cmd /c "dir /a:l /s /b `"$stage`"" 2>$null | Where-Object { $_ })
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
foreach ($requiredRootLink in 'marisa-distro/node_modules/schemastery', 'marisa-distro/node_modules/@deepseek-ai/dsh-workflow', 'marisa-distro/node_modules/@deepseek-ai/dsh-host-webserver', 'marisa-distro/node_modules/@deepseek-ai/dsh-host-apiproxy') {
  if (-not ($links | Where-Object { $_.link -eq $requiredRootLink })) {
    throw "link manifest INCOMPLETE — required root runtime link missing: $requiredRootLink"
  }
}
$links | ConvertTo-Json | Set-Content "$stage\LINKS.json" -Encoding utf8

# --- delete staged junctions (7z must not see reparse points) -----------------
# pwsh 7 Remove-Item NREs on junctions (esp. when the target was pruned);
# cmd rmdir removes the junction link itself and never follows into the
# target. File symlinks (.bin shims) fall back to Remove-Item.
# IMPORTANT: collect links with `dir /a:l` — Get-ChildItem -Recurse follows
# junctions INTO their targets (racing the deletes and touching live trees),
# which corrupted staged source dirs on 2026-08-15. `dir` never dereferences.
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

# --- pre-zip sanity: root workspace links must be covered ----------------------
# (2026-08-15: without them the zip ships without every @deepseek-ai member and
# boot dies importing e.g. @deepseek-ai/dsh-settings from dsh-llm-fallbacks.)
$rootLinkCount = @($links | Where-Object { $_.link.StartsWith('marisa-distro/node_modules/') }).Count
$rootEntityCount = @(Get-ChildItem "$stage\marisa-distro\node_modules\@deepseek-ai" -Directory -Force -ErrorAction SilentlyContinue).Count
if (($rootLinkCount + $rootEntityCount) -lt 10) {
  throw "suspiciously few root node_modules workspace members (links=$rootLinkCount entities=$rootEntityCount) — refusing to zip"
}
Write-Host "  root node_modules workspace coverage: links=$rootLinkCount entities=$rootEntityCount"

# --- zip ----------------------------------------------------------------------
Write-Host 'zipping (mx=9) ...'
Push-Location $stage
& $sevenZip a -tzip -mx=9 -bso0 -bsp0 $out .
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "7z failed: $LASTEXITCODE" }
Pop-Location
Write-Host ('bundle written: {0} bytes ({1:N1} MB)' -f (Get-Item $out).Length, ((Get-Item $out).Length / 1MB))
