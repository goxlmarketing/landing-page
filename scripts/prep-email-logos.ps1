# Email asset prep: the landing-page logos are 2000x2000 PNGs (~875 KB / ~747 KB)
# with most of the canvas empty. Email clients need small, exactly-sized images,
# so trim each one to its alpha bounding box and downscale to its @2x send size.
#
# Source artwork is never modified - output lands in public/assets/email/.
# Alpha is preserved so the marks survive clients that force dark/light inversion.
Add-Type -AssemblyName System.Drawing

$assets = Join-Path $PSScriptRoot "..\public\assets"
$outDir = Join-Path $assets "email"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Tight alpha bounding box, scanned at full resolution via LockBits (GetPixel
# over 4M pixels is far too slow).
function Get-AlphaBounds([System.Drawing.Bitmap]$bmp, [int]$threshold = 12) {
  $rect = New-Object System.Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $stride = $data.Stride
    $bytes = New-Object byte[] ($stride * $bmp.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  } finally {
    $bmp.UnlockBits($data)
  }

  $minX = $bmp.Width; $minY = $bmp.Height; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $bmp.Height; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $bmp.Width; $x++) {
      # BGRA byte order; alpha is the 4th byte of each pixel.
      if ($bytes[$row + ($x * 4) + 3] -gt $threshold) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  return New-Object System.Drawing.Rectangle $minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1)
}

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  return @($bmp, $g)
}

# Renders the trimmed artwork into a $w x $h transparent canvas, scaled to fit
# and centred, so the emitted file has exactly the dimensions the email declares.
function Export-Logo([string]$srcName, [string]$outName, [int]$w, [int]$h) {
  $src = New-Object System.Drawing.Bitmap((Resolve-Path (Join-Path $assets $srcName)).Path)
  try {
    $box = Get-AlphaBounds $src
    $fit = [Math]::Min($w / $box.Width, $h / $box.Height)
    $dw = [int][Math]::Round($box.Width * $fit)
    $dh = [int][Math]::Round($box.Height * $fit)
    $dx = [int][Math]::Round(($w - $dw) / 2)
    $dy = [int][Math]::Round(($h - $dh) / 2)

    $c = New-Canvas $w $h
    try {
      $c[1].DrawImage($src,
        (New-Object System.Drawing.Rectangle $dx, $dy, $dw, $dh),
        $box.X, $box.Y, $box.Width, $box.Height,
        [System.Drawing.GraphicsUnit]::Pixel)
      $c[1].Dispose()
      $dest = Join-Path $outDir $outName
      $c[0].Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
      $kb = [Math]::Round((Get-Item $dest).Length / 1KB, 1)
      Write-Output "wrote email/$outName  ${w}x${h}  ${kb} KB  (trimmed from $($src.Width)x$($src.Height), bbox $($box.Width)x$($box.Height))"
    } finally {
      $c[0].Dispose()
    }
  } finally {
    $src.Dispose()
  }
}

# Ally pinwheel mark - sent at 80px, so 160px for retina.
Export-Logo "logo-123.png" "ally-mark-email.png" 160 160

# GoXL Entrepreneurship lockup - sent at 132px wide, so 264px for retina.
# Source aspect is ~2.335:1, hence the 113px box height.
Export-Logo "goxl-entrepreneurship.png" "goxl-logo-email.png" 264 113
