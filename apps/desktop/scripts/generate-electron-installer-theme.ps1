param(
  [string]$OutputDir = (Join-Path $PSScriptRoot "..\build\installer"),
  [string]$LogoPath = (Join-Path $PSScriptRoot "..\src\assets\app-logo.png"),
  [string]$ProductName = "Catwa",
  [string]$PrimaryColor = "#07152D",
  [string]$SecondaryColor = "#0E2E56",
  [string]$AccentColor = "#21D4FD"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeMethods {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool DestroyIcon(IntPtr hIcon);
}
"@

function To-Color([string]$hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function New-ScaledBitmap([string]$path, [int]$width, [int]$height) {
  $source = [System.Drawing.Image]::FromFile($path)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.DrawImage($source, 0, 0, $width, $height)
      return $bitmap
    }
    finally {
      $graphics.Dispose()
    }
  }
  finally {
    $source.Dispose()
  }
}

function Save-Icon([string]$pngPath, [string]$iconPath) {
  $bitmap = New-ScaledBitmap -path $pngPath -width 256 -height 256
  try {
    $hIcon = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)
    try {
      $stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
      try {
        $icon.Save($stream)
      }
      finally {
        $stream.Dispose()
      }
    }
    finally {
      $icon.Dispose()
      [NativeMethods]::DestroyIcon($hIcon) | Out-Null
    }
  }
  finally {
    $bitmap.Dispose()
  }
}

function New-HeaderImage([string]$path, [string]$name, [System.Drawing.Image]$logo) {
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

    if ($null -ne $logo) {
      $graphics.DrawImage($logo, 8, 8, 40, 40)
    }

    $accent = New-Object System.Drawing.SolidBrush((To-Color $AccentColor))
    $graphics.FillRectangle($accent, 0, $height - 3, $width, 3)
    $accent.Dispose()

    $titleFont = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
    $subtitleFont = New-Object System.Drawing.Font("Segoe UI", 7.5, [System.Drawing.FontStyle]::Regular)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(214, 233, 244, 255))

    $graphics.DrawString($name, $titleFont, $white, 54, 10)
    $graphics.DrawString("Desktop Setup", $subtitleFont, $muted, 54, 29)

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

function New-SidebarImage([string]$path, [string]$name, [System.Drawing.Image]$logo) {
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

    if ($null -ne $logo) {
      $graphics.DrawImage($logo, 46, 20, 72, 72)
    }

    $titleFont = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
    $subtitleFont = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
    $smallFont = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Regular)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(225, 230, 241, 255))
    $soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 188, 214, 236))

    $graphics.DrawString($name, $titleFont, $white, 16, 102)
    $graphics.DrawString("Real-time chat and voice", $subtitleFont, $muted, 16, 131)
    $graphics.DrawString("Secure desktop install", $smallFont, $soft, 16, 150)

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

if (-not (Test-Path $LogoPath)) {
  throw "Logo bulunamadi: $LogoPath"
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$iconPath = Join-Path $OutputDir "icon.ico"
$headerPath = Join-Path $OutputDir "header.bmp"
$sidebarPath = Join-Path $OutputDir "sidebar.bmp"

$logo = [System.Drawing.Image]::FromFile($LogoPath)
try {
  Save-Icon -pngPath $LogoPath -iconPath $iconPath
  New-HeaderImage -path $headerPath -name $ProductName -logo $logo
  New-SidebarImage -path $sidebarPath -name $ProductName -logo $logo
}
finally {
  $logo.Dispose()
}

Write-Host "Generated Electron installer assets:"
Write-Host " - $iconPath"
Write-Host " - $headerPath"
Write-Host " - $sidebarPath"
