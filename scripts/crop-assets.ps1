# One-off asset prep: slices clean, text-free crops out of the design mockup.
Add-Type -AssemblyName System.Drawing

$root = Join-Path $PSScriptRoot "..\public\assets"
$src  = [System.Drawing.Image]::FromFile((Resolve-Path "$root\design-reference.png"))

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  return @($bmp, $g)
}

function Save-Crop([int]$x, [int]$y, [int]$w, [int]$h, [int]$scale, [string]$out) {
  $c = New-Canvas ($w * $scale) ($h * $scale)
  $c[1].DrawImage($src,
    (New-Object System.Drawing.Rectangle 0, 0, ($w * $scale), ($h * $scale)),
    (New-Object System.Drawing.Rectangle $x, $y, $w, $h),
    [System.Drawing.GraphicsUnit]::Pixel)
  $c[1].Dispose()
  $c[0].Save("$root\$out", [System.Drawing.Imaging.ImageFormat]::Png)
  $c[0].Dispose()
  "wrote $out ($($w * $scale)x$($h * $scale))"
}

# Founder portrait, trimmed clear of the floating cards and the green pill.
Save-Crop 232 48 206 226 2 "hero-founder.png"

# Glowing ally swirl, trimmed above the caption text.
Save-Crop 380 378 215 186 2 "ally-mark.png"

# The mockup bakes footer copy over the centre of the mountains, so build a
# seamlessly repeatable mirror tile out of the text-free left strip instead.
$stripW = 176; $stripH = 196; $stripY = 828; $scale = 2
$tw = $stripW * $scale
$th = $stripH * $scale
$c = New-Canvas ($tw * 2) $th
$srcRect = New-Object System.Drawing.Rectangle 0, $stripY, $stripW, $stripH

# That strip is the darkest part of the mockup, so lift it back to a usable level.
$lift = 1.7
$matrix = New-Object System.Drawing.Imaging.ColorMatrix
$matrix.Matrix00 = $lift; $matrix.Matrix11 = $lift; $matrix.Matrix22 = $lift
$attrs = New-Object System.Drawing.Imaging.ImageAttributes
$attrs.SetColorMatrix($matrix)

$c[1].DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $tw, $th), 0, $stripY, $stripW, $stripH, [System.Drawing.GraphicsUnit]::Pixel, $attrs)
$mirror = [System.Drawing.Point[]]@(
  (New-Object System.Drawing.Point ([int]($tw * 2)), 0),
  (New-Object System.Drawing.Point ([int]$tw), 0),
  (New-Object System.Drawing.Point ([int]($tw * 2)), ([int]$th))
)
$c[1].DrawImage($src, $mirror, $srcRect, [System.Drawing.GraphicsUnit]::Pixel, $attrs)
$c[1].Dispose()
$c[0].Save("$root\footer-mountains.png", [System.Drawing.Imaging.ImageFormat]::Png)
$c[0].Dispose()
"wrote footer-mountains.png ($($tw * 2)x$th)"

$src.Dispose()
