param(
  [string]$SourceExe = (Join-Path $PSScriptRoot '..\..\release\marisa-desktop-msi.exe'),
  [string]$BackendZip = (Join-Path $PSScriptRoot '..\bundle\backend.zip'),
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

if (-not (Test-Path -LiteralPath $backendArchive -PathType Leaf)) { throw "backend bundle not found: $backendArchive" }
if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) { throw "installer icon not found: $icon" }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "MSI ProductVersion must be major.minor.patch: $Version" }

$candle = Join-Path $toolRoot 'candle.exe'
$light = Join-Path $toolRoot 'light.exe'
if (-not (Test-Path -LiteralPath $candle) -or -not (Test-Path -LiteralPath $light)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $archive) | Out-Null
  if (-not (Test-Path -LiteralPath $archive)) {
    Write-Host 'Downloading portable WiX Toolset v3.14.1 ...'
    $partialArchive = "$archive.partial"
    Remove-Item -LiteralPath $partialArchive -Force -ErrorAction SilentlyContinue
    & curl.exe --fail --location --retry 3 --output $partialArchive $download
    if ($LASTEXITCODE -ne 0) { throw "WiX download failed with exit code $LASTEXITCODE" }
    Move-Item -LiteralPath $partialArchive -Destination $archive
  }
  if (Test-Path -LiteralPath $toolRoot) { Remove-Item -LiteralPath $toolRoot -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
  Expand-Archive -LiteralPath $archive -DestinationPath $toolRoot
}

$buildDir = Join-Path $repo 'release\.msi-build'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $outputPath) | Out-Null
$wixobj = Join-Path $buildDir 'Product.wixobj'

Write-Host 'Building thin MSI desktop shell ...'
& go build -C (Join-Path $repo 'desktop') -tags installedbundle -o $source .
if ($LASTEXITCODE -ne 0) { throw "Go MSI shell build failed with exit code $LASTEXITCODE" }

Write-Host "Compiling MSI definition for $source ..."
& $candle -nologo -arch x64 "-dSourceExe=$source" "-dBackendZip=$backendArchive" "-dAppIcon=$icon" "-dProductVersion=$Version" -out $wixobj $wxs
if ($LASTEXITCODE -ne 0) { throw "candle.exe failed with exit code $LASTEXITCODE" }

Write-Host "Linking $outputPath ..."
& $light -nologo -sval -out $outputPath $wixobj
if ($LASTEXITCODE -ne 0) { throw "light.exe failed with exit code $LASTEXITCODE" }

$item = Get-Item -LiteralPath $outputPath
Write-Host "MSI written: $($item.FullName) ($($item.Length) bytes)"
