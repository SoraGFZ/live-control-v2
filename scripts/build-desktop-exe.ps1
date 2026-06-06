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

# === ROBUST PRE-CLEAN (fixes exit 1 from locked files in previous builds) ===
# electron-builder / NSIS often fails on Windows when win-unpacked/ or old exes are locked
# (ffmpeg.exe from prior portable is a common culprit, also AV or running instances).
Write-Host "Limpiando artefactos previos de release/ para evitar archivos bloqueados..." -ForegroundColor Yellow
$releaseDir = Join-Path $projectRoot 'release'
$winUnpacked = Join-Path $releaseDir 'win-unpacked'

# Kill any running instance of the app (best effort)
Get-Process -Name 'Live Control Studio' -ErrorAction SilentlyContinue |
  ForEach-Object { Write-Host "  Matando proceso: $($_.Name) (pid $($_.Id))"; Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

# Remove old installers (keep only the target name later)
if (Test-Path $releaseDir) {
  Get-ChildItem -Path $releaseDir -Filter "$productName-Setup-*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "$productName-Setup-$appVersion.exe" } |
    ForEach-Object {
      Write-Host "  Eliminando instalador antiguo: $($_.Name)" -ForegroundColor DarkYellow
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }
}

# Nuke the entire win-unpacked portable dir (source of most lock errors with ffmpeg)
if (Test-Path $winUnpacked) {
  Write-Host "  Eliminando win-unpacked (puede tardar si hay locks)..." -ForegroundColor DarkYellow
  # Try multiple times in case of transient locks
  for ($i=0; $i -lt 3; $i++) {
    try {
      Remove-Item -Recurse -Force -LiteralPath $winUnpacked -ErrorAction Stop
      break
    } catch {
      Write-Host "    Intento $($i+1) de limpieza fallido, reintentando..." -ForegroundColor DarkYellow
      Start-Sleep -Milliseconds 800
      Get-Process -Name 'Live Control Studio' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
  }
  if (Test-Path $winUnpacked) {
    Write-Host "  ADVERTENCIA: win-unpacked aun existe despues de limpieza (puede causar fallo en builder)." -ForegroundColor Red
  }
}

# Also remove any lingering builder debug yamls that can confuse cache
Get-ChildItem -Path $releaseDir -Filter 'builder-*.yml' -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }

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