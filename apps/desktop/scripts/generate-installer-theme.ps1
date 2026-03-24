param(
  [string]$OutputDir = (Join-Path $PSScriptRoot "..\src-tauri\icons\installer"),
  [string]$ProductName = "CATWA",
  [string]$PrimaryColor = "#07152D",
  [string]$SecondaryColor = "#0E2E56",
  [string]$AccentColor = "#21D4FD"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function To-Color([string]$hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function New-HeaderImage([string]$path, [string]$name) {
  $width = 150
  $height = 57
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    $rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
    $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      $rect,
      (To-Color $PrimaryColor),
      (To-Color $SecondaryColor),
      [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal
    )
    $graphics.FillRectangle($gradient, $rect)
    $gradient.Dispose()

    $accent = New-Object System.Drawing.SolidBrush((To-Color $AccentColor))
    $graphics.FillRectangle($accent, 0, $height - 3, $width, 3)
    $accent.Dispose()

    $titleFont = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $subtitleFont = New-Object System.Drawing.Font("Segoe UI", 7.5, [System.Drawing.FontStyle]::Regular)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 233, 244, 255))

    $graphics.DrawString($name, $titleFont, $white, 10, 8)
    $graphics.DrawString("Desktop Setup", $subtitleFont, $muted, 11, 31)

    $titleFont.Dispose()
    $subtitleFont.Dispose()
    $white.Dispose()
    $muted.Dispose()
  }
  finally {
    $graphics.Dispose()
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $bitmap.Dispose()
  }
}

function New-SidebarImage([string]$path, [string]$name) {
  $width = 164
  $height = 314
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    $rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
    $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      $rect,
      (To-Color $PrimaryColor),
      (To-Color $SecondaryColor),
      [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $graphics.FillRectangle($gradient, $rect)
    $gradient.Dispose()

    $accent = New-Object System.Drawing.SolidBrush((To-Color $AccentColor))
    $graphics.FillRectangle($accent, 0, 0, 6, $height)
    $accent.Dispose()

    $logoPath = Join-Path $PSScriptRoot "..\src\assets\app-logo.png"
    if (Test-Path $logoPath) {
      $logo = [System.Drawing.Image]::FromFile($logoPath)
      try {
        $graphics.DrawImage($logo, 48, 18, 68, 68)
      }
      finally {
        $logo.Dispose()
      }
    }

    $titleFont = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
    $subtitleFont = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
    $smallFont = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Regular)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(225, 230, 241, 255))
    $soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 188, 214, 236))

    $graphics.DrawString($name, $titleFont, $white, 16, 98)
    $graphics.DrawString("Real-time chat and voice", $subtitleFont, $muted, 16, 126)
    $graphics.DrawString("Secure desktop install", $smallFont, $soft, 16, 145)

    $titleFont.Dispose()
    $subtitleFont.Dispose()
    $smallFont.Dispose()
    $white.Dispose()
    $muted.Dispose()
    $soft.Dispose()
  }
  finally {
    $graphics.Dispose()
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $bitmap.Dispose()
  }
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$headerPath = Join-Path $OutputDir "header.bmp"
$sidebarPath = Join-Path $OutputDir "sidebar.bmp"

New-HeaderImage -path $headerPath -name $ProductName
New-SidebarImage -path $sidebarPath -name $ProductName

Write-Host "Generated NSIS theme assets:"
Write-Host " - $headerPath"
Write-Host " - $sidebarPath"
