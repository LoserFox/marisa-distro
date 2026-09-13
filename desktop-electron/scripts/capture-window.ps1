# capture-window.ps1 — capture a top-level window to PNG as desktop-acceptance
# evidence.
#
# AGENTS.md is explicit that an HTTP 200 from the backend is not desktop
# acceptance: the release gate is real window rendering. This script produces
# the artefact that proves it — a PNG of the actual window, taken from the
# interactive session, which can then be inspected (the repo's previous
# acceptance reports used the same "screenshot + vision analysis" method).
#
#   pwsh -File scripts/capture-window.ps1 -Title 'Marisa' -OutPath shot.png
#   pwsh -File scripts/capture-window.ps1 -FullScreen -OutPath screen.png
#
# Exit codes: 0 captured, 1 no such window / capture failed.
param(
  [string]$Title = 'Marisa',
  [string]$OutPath = 'window.png',
  [switch]$FullScreen,
  # Include the non-client area (title bar / borders). Ignored with -FullScreen.
  [switch]$WholeWindow
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class MarisaWin32 {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  // Own POINT type: System.Drawing.Point is type-forwarded to
  // System.Drawing.Primitives, which Add-Type's default reference set omits.
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X, Y; }

  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@

function Get-CaptureRegion {
  param([IntPtr]$Handle, [bool]$Whole)
  $rect = New-Object MarisaWin32+RECT
  if ($Whole) {
    if (-not [MarisaWin32]::GetWindowRect($Handle, [ref]$rect)) { throw 'GetWindowRect failed' }
  } else {
    if (-not [MarisaWin32]::GetClientRect($Handle, [ref]$rect)) { throw 'GetClientRect failed' }
    $origin = New-Object MarisaWin32+POINT
    if (-not [MarisaWin32]::ClientToScreen($Handle, [ref]$origin)) { throw 'ClientToScreen failed' }
    $rect.Left = $origin.X
    $rect.Top = $origin.Y
    $rect.Right = $origin.X + $rect.Right
    $rect.Bottom = $origin.Y + $rect.Bottom
  }
  return @{
    X = $rect.Left
    Y = $rect.Top
    Width = $rect.Right - $rect.Left
    Height = $rect.Bottom - $rect.Top
  }
}

if ($FullScreen) {
  Add-Type -AssemblyName System.Windows.Forms
  $vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $region = @{ X = $vs.X; Y = $vs.Y; Width = $vs.Width; Height = $vs.Height }
  $label = 'virtual screen'
} else {
  $candidates = Get-Process |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$Title*" }
  if (-not $candidates) {
    Write-Error "no visible top-level window matching '*$Title*'"
    exit 1
  }
  $proc = $candidates | Select-Object -First 1
  $handle = [IntPtr]$proc.MainWindowHandle
  if ([MarisaWin32]::IsIconic($handle)) {
    # A minimised window has no on-screen pixels to capture.
    [void][MarisaWin32]::ShowWindow($handle, 9)  # SW_RESTORE
    Start-Sleep -Milliseconds 800
  }
  [void][MarisaWin32]::SetForegroundWindow($handle)
  Start-Sleep -Milliseconds 400
  $region = Get-CaptureRegion -Handle $handle -Whole:$WholeWindow
  $label = "$($proc.ProcessName) [$($proc.Id)] '$($proc.MainWindowTitle)'"
}

if ($region.Width -le 0 -or $region.Height -le 0) {
  Write-Error "window has no capturable area ($($region.Width)x$($region.Height)) — is it minimised or off-screen?"
  exit 1
}

$bitmap = New-Object System.Drawing.Bitmap $region.Width, $region.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($region.X, $region.Y, 0, 0, $bitmap.Size)
} finally {
  $graphics.Dispose()
}
try {
  # Join-Path concatenates rather than replaces for a rooted second argument, so
  # an absolute -OutPath has to bypass it.
  $full = if ([System.IO.Path]::IsPathRooted($OutPath)) {
    [System.IO.Path]::GetFullPath($OutPath)
  } else {
    [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $OutPath))
  }
  New-Item -ItemType Directory -Force (Split-Path -Parent $full) | Out-Null
  $bitmap.Save($full, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $bitmap.Dispose()
}

Write-Host "captured $label"
Write-Host "  region: $($region.Width)x$($region.Height) at $($region.X),$($region.Y)"
Write-Host "  file:   $full"
