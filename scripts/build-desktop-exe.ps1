$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$packageJsonPath = Join-Path $projectRoot 'package.json'
$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$appVersion = [string]$packageJson.version
$productName = [string]$packageJson.build.productName
if (-not $productName) {
  $productName = 'Live Control Studio'
}

& (Join-Path $PSScriptRoot 'stop-live-control-ports.ps1')

Write-Host "Generando $productName v$appVersion (icono + vite + electron-builder)..." -ForegroundColor Cyan
$started = Get-Date
npm run desktop:dist
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$installerPattern = "$productName-Setup-$appVersion.exe"
$installerPath = Join-Path $projectRoot "release\$installerPattern"
$portableExePath = Join-Path $projectRoot "release\win-unpacked\$productName.exe"

Get-ChildItem -Path (Join-Path $projectRoot 'release') -Filter "$productName-Setup-*.exe" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -ne $installerPattern } |
  ForEach-Object {
    Write-Host "Eliminando instalador antiguo: $($_.Name)" -ForegroundColor DarkYellow
    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
  }

$setupFile = Get-Item -LiteralPath $installerPath -ErrorAction SilentlyContinue
$portableFile = Get-Item -LiteralPath $portableExePath -ErrorAction SilentlyContinue

$stampPath = Join-Path $projectRoot 'release\BUILD_STAMP.txt'
$stamp = @(
  "product=$productName"
  "version=$appVersion"
  "built_at=$($started.ToString('o'))"
  "finished_at=$((Get-Date).ToString('o'))"
  if ($setupFile) { "installer=$($setupFile.Name)" }
  if ($portableFile) { "portable=$($portableFile.FullName)" }
) -join "`n"
Set-Content -Path $stampPath -Value $stamp -Encoding UTF8

if ($setupFile -and $portableFile) {
  Write-Host ''
  Write-Host 'Listo. Instalador actualizado:' -ForegroundColor Green
  Write-Host $setupFile.FullName
  Write-Host "Tamano: $([math]::Round($setupFile.Length / 1MB, 1)) MB | $($setupFile.LastWriteTime)"
  Write-Host ''
  Write-Host 'Ejecutable portable (sin instalar):' -ForegroundColor Green
  Write-Host $portableFile.FullName
  Write-Host "Tamano: $([math]::Round($portableFile.Length / 1MB, 1)) MB | $($portableFile.LastWriteTime)"
} else {
  Write-Host 'Build termino pero no encontre instalador o portable en release/. Revisa electron-builder.' -ForegroundColor Yellow
  if (-not $setupFile) { Write-Host "Falta: $installerPath" -ForegroundColor Yellow }
  if (-not $portableFile) { Write-Host "Falta: $portableExePath" -ForegroundColor Yellow }
  exit 1
}