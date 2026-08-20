param(
  [string]$SourceExe = (Join-Path $PSScriptRoot '..\..\release\marisa-desktop-msi.exe'),
  [string]$BackendZip = (Join-Path $PSScriptRoot '..\bundle\backend.tar.zst'),
  [string]$Output = (Join-Path $PSScriptRoot '..\..\release\Marisa-DSH-0.1.0-x64.msi'),
  [string]$Version = '0.1.0'
)

$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$source = [System.IO.Path]::GetFullPath($SourceExe)
$backendArchive = [System.IO.Path]::GetFullPath($BackendZip)
$outputPath = [System.IO.Path]::GetFullPath($Output)
$icon = Join-Path $repo 'desktop\assets\icon.ico'
$wxs = Join-Path $repo 'desktop\installer\Product.wxs'
$toolRoot = Join-Path $repo 'release\.tools\wix3141'
$archive = Join-Path $repo 'release\.tools\wix314-binaries.zip'
$download = 'https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip'
# SHA-256 of the wix314-binaries.zip asset from the pinned wix3141rtm release.
$archiveSha256 = '6AC824E1642D6F7277D0ED7EA09411A508F6116BA6FAE0AA5F2C7DAA2FF43D31'

function Assert-ExpectedSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Expected,
    [Parameter(Mandatory = $true)][string]$Description
  )

  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if (-not [string]::Equals($actual, $Expected, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Description SHA-256 mismatch. Expected $Expected, got $actual. Delete the cached archive and retry."
  }
}

if (-not (Test-Path -LiteralPath $backendArchive -PathType Leaf)) { throw "backend bundle not found: $backendArchive" }
if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) { throw "installer icon not found: $icon" }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "MSI ProductVersion must be major.minor.patch: $Version" }

$candle = Join-Path $toolRoot 'candle.exe'
$light = Join-Path $toolRoot 'light.exe'
New-Item -ItemType Directory -Force -Path (Split-Path $archive) | Out-Null
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
  Write-Host 'Downloading portable WiX Toolset v3.14.1 ...'
  $partialArchive = "$archive.partial"
  Remove-Item -LiteralPath $partialArchive -Force -ErrorAction SilentlyContinue
  & curl.exe --fail --location --retry 3 --output $partialArchive $download
  if ($LASTEXITCODE -ne 0) { throw "WiX download failed with exit code $LASTEXITCODE" }
  Assert-ExpectedSha256 -Path $partialArchive -Expected $archiveSha256 -Description 'Downloaded WiX archive'
  Move-Item -LiteralPath $partialArchive -Destination $archive
}
Assert-ExpectedSha256 -Path $archive -Expected $archiveSha256 -Description 'Cached WiX archive'

# Re-extract for every build so candle.exe and light.exe always originate from the checked archive.
if (Test-Path -LiteralPath $toolRoot) { Remove-Item -LiteralPath $toolRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $toolRoot
if (-not (Test-Path -LiteralPath $candle -PathType Leaf) -or -not (Test-Path -LiteralPath $light -PathType Leaf)) {
  throw 'Verified WiX archive did not contain candle.exe and light.exe.'
}

$buildDir = Join-Path $repo 'release\.msi-build'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $outputPath) | Out-Null
$wixobj = Join-Path $buildDir 'Product.wixobj'

Write-Host 'Building thin MSI desktop shell ...'
# -H=windowsgui：GUI 子系统，双击启动不弹终端窗口（日志只写持久文件；
# 需要终端日志时以 --console / MARISA_CONSOLE=1 启动，见 console_windows.go）。
& go build -C (Join-Path $repo 'desktop') -tags installedbundle -ldflags '-H=windowsgui' -o $source .
if ($LASTEXITCODE -ne 0) { throw "Go MSI shell build failed with exit code $LASTEXITCODE" }

Write-Host "Compiling MSI definition for $source ..."
& $candle -nologo -arch x64 "-dSourceExe=$source" "-dBackendZip=$backendArchive" "-dAppIcon=$icon" "-dProductVersion=$Version" -out $wixobj $wxs
if ($LASTEXITCODE -ne 0) { throw "candle.exe failed with exit code $LASTEXITCODE" }

Write-Host "Linking $outputPath ..."
& $light -nologo -sval -out $outputPath $wixobj
if ($LASTEXITCODE -ne 0) { throw "light.exe failed with exit code $LASTEXITCODE" }

$item = Get-Item -LiteralPath $outputPath
Write-Host "MSI written: $($item.FullName) ($($item.Length) bytes)"
