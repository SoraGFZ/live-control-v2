Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2

  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  return $path
}

function New-LinearGradientBrush {
  param(
    [System.Drawing.RectangleF]$Rectangle,
    [string]$StartColor,
    [string]$EndColor,
    [float]$Angle
  )

  return New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $Rectangle,
    [System.Drawing.ColorTranslator]::FromHtml($StartColor),
    [System.Drawing.ColorTranslator]::FromHtml($EndColor),
    $Angle
  )
}

function Draw-GlowCircle {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$CenterX,
    [float]$CenterY,
    [float]$Diameter,
    [System.Drawing.Color]$Color
  )

  $x = $CenterX - ($Diameter / 2)
  $y = $CenterY - ($Diameter / 2)
  $brush = New-Object System.Drawing.SolidBrush($Color)
  $Graphics.FillEllipse($brush, $x, $y, $Diameter, $Diameter)
  $brush.Dispose()
}

function Save-IcoFromPng {
  param(
    [string]$PngPath,
    [string]$IcoPath
  )

  [byte[]]$pngBytes = [System.IO.File]::ReadAllBytes($PngPath)
  $writer = New-Object System.IO.BinaryWriter([System.IO.File]::Open($IcoPath, [System.IO.FileMode]::Create))

  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]1)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$pngBytes.Length)
  $writer.Write([UInt32]22)
  $writer.Write($pngBytes)
  $writer.Flush()
  $writer.Dispose()
}

$root = Split-Path -Parent $PSScriptRoot
$buildDirectory = Join-Path $root 'build'
$publicDirectory = Join-Path $root 'public'
$iconPngPath = Join-Path $buildDirectory 'icon.png'
$iconIcoPath = Join-Path $buildDirectory 'icon.ico'
$faviconPngPath = Join-Path $publicDirectory 'favicon.png'

New-Item -ItemType Directory -Force -Path $buildDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $publicDirectory | Out-Null

$size = 1024
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

$backgroundRect = [System.Drawing.RectangleF]::new(36, 36, 952, 952)
$backgroundPath = New-RoundedRectanglePath -X 36 -Y 36 -Width 952 -Height 952 -Radius 240
$backgroundBrush = New-LinearGradientBrush -Rectangle $backgroundRect -StartColor '#071018' -EndColor '#0F2438' -Angle 135
$graphics.FillPath($backgroundBrush, $backgroundPath)

Draw-GlowCircle -Graphics $graphics -CenterX 280 -CenterY 220 -Diameter 340 -Color ([System.Drawing.Color]::FromArgb(105, 110, 244, 213))
Draw-GlowCircle -Graphics $graphics -CenterX 760 -CenterY 740 -Diameter 360 -Color ([System.Drawing.Color]::FromArgb(90, 255, 140, 92))
Draw-GlowCircle -Graphics $graphics -CenterX 720 -CenterY 220 -Diameter 240 -Color ([System.Drawing.Color]::FromArgb(64, 91, 166, 255))

$highlightPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(62, 162, 255, 227), 10)
$graphics.DrawPath($highlightPen, $backgroundPath)

$innerPath = New-RoundedRectanglePath -X 80 -Y 80 -Width 864 -Height 864 -Radius 198
$innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(24, 255, 255, 255), 2)
$graphics.DrawPath($innerPen, $innerPath)

$fontFamily = New-Object System.Drawing.FontFamily('Segoe UI Black')
$sPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$sFormat = New-Object System.Drawing.StringFormat
$sFormat.Alignment = [System.Drawing.StringAlignment]::Center
$sFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
$sRect = [System.Drawing.RectangleF]::new(90, 110, 520, 560)
$sPath.AddString('S', $fontFamily, [int][System.Drawing.FontStyle]::Regular, 470, $sRect, $sFormat)

for ($i = 22; $i -ge 8; $i -= 7) {
  $glowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(22, 109, 237, 221), $i)
  $graphics.DrawPath($glowPen, $sPath)
  $glowPen.Dispose()
}

$sShadowMatrix = New-Object System.Drawing.Drawing2D.Matrix
$sShadowMatrix.Translate(18, 20)
$sShadowPath = $sPath.Clone()
$sShadowPath.Transform($sShadowMatrix)
$sShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(72, 0, 0, 0))
$graphics.FillPath($sShadowBrush, $sShadowPath)

$sBrush = New-LinearGradientBrush -Rectangle $sRect -StartColor '#B9FFE8' -EndColor '#6FB4FF' -Angle 105
$graphics.FillPath($sBrush, $sPath)
$sStroke = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 6, 24, 39), 12)
$graphics.DrawPath($sStroke, $sPath)

$controllerBody = New-RoundedRectanglePath -X 458 -Y 550 -Width 410 -Height 250 -Radius 112
$controllerBrush = New-LinearGradientBrush -Rectangle ([System.Drawing.RectangleF]::new(458, 550, 410, 250)) -StartColor '#0E1723' -EndColor '#18314D' -Angle 90
$graphics.FillPath($controllerBrush, $controllerBody)

for ($i = 18; $i -ge 10; $i -= 4) {
  $controllerGlowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(28, 255, 149, 94), $i)
  $graphics.DrawPath($controllerGlowPen, $controllerBody)
  $controllerGlowPen.Dispose()
}

$controllerOutline = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(166, 255, 255, 255), 4)
$graphics.DrawPath($controllerOutline, $controllerBody)

$leftGrip = New-RoundedRectanglePath -X 440 -Y 618 -Width 118 -Height 170 -Radius 58
$rightGrip = New-RoundedRectanglePath -X 770 -Y 618 -Width 118 -Height 170 -Radius 58
$gripBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(52, 255, 255, 255))
$graphics.FillPath($gripBrush, $leftGrip)
$graphics.FillPath($gripBrush, $rightGrip)

$dPadPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#8CFFF0'), 22)
$graphics.DrawLine($dPadPen, 578, 660, 578, 742)
$graphics.DrawLine($dPadPen, 538, 701, 618, 701)

$buttonAccent = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#FF8A55'))
$buttonAccentSecondary = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#7AE6C7'))
$graphics.FillEllipse($buttonAccent, 733, 650, 54, 54)
$graphics.FillEllipse($buttonAccent, 790, 698, 50, 50)
$graphics.FillEllipse($buttonAccentSecondary, 684, 704, 42, 42)
$graphics.FillEllipse($buttonAccentSecondary, 758, 755, 32, 32)

$statusBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 255, 255, 255))
$graphics.FillEllipse($statusBrush, 652, 664, 16, 16)
$graphics.FillEllipse($statusBrush, 677, 664, 16, 16)

$cablePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 255, 144, 92), 12)
$graphics.DrawBezier($cablePen, 618, 515, 660, 470, 738, 470, 792, 522)

$flareBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(72, 255, 138, 85))
$graphics.FillEllipse($flareBrush, 694, 644, 160, 160)

$bitmap.Save($iconPngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Save($faviconPngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$iconBitmap = New-Object System.Drawing.Bitmap 256, 256
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
$iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$iconGraphics.DrawImage($bitmap, 0, 0, 256, 256)
$tempIconPngPath = Join-Path $buildDirectory 'icon-256.png'
$iconBitmap.Save($tempIconPngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Save-IcoFromPng -PngPath $tempIconPngPath -IcoPath $iconIcoPath
Remove-Item $tempIconPngPath -ErrorAction SilentlyContinue

$flareBrush.Dispose()
$cablePen.Dispose()
$statusBrush.Dispose()
$buttonAccent.Dispose()
$buttonAccentSecondary.Dispose()
$dPadPen.Dispose()
$gripBrush.Dispose()
$rightGrip.Dispose()
$leftGrip.Dispose()
$controllerOutline.Dispose()
$controllerBrush.Dispose()
$controllerBody.Dispose()
$sStroke.Dispose()
$sBrush.Dispose()
$sShadowBrush.Dispose()
$sShadowPath.Dispose()
$sShadowMatrix.Dispose()
$sFormat.Dispose()
$sPath.Dispose()
$fontFamily.Dispose()
$innerPen.Dispose()
$innerPath.Dispose()
$highlightPen.Dispose()
$backgroundBrush.Dispose()
$backgroundPath.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$iconGraphics.Dispose()
$iconBitmap.Dispose()
