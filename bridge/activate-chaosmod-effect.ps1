param(
  [string]$ProcessName = "GTA5",
  [ValidateSet("up", "down")][string]$Direction = "down",
  [int]$MoveCount = 0,
  [int]$OpenDelayMs = 220,
  [int]$KeyDelayMs = 35
)

$ErrorActionPreference = "Stop"

$wshell = New-Object -ComObject WScript.Shell
$process = Get-Process -Name $ProcessName -ErrorAction Stop | Select-Object -First 1

if (-not $wshell.AppActivate($process.Id)) {
  throw "No pude enfocar el proceso $ProcessName."
}

Start-Sleep -Milliseconds $OpenDelayMs
$wshell.SendKeys('^,')
Start-Sleep -Milliseconds $OpenDelayMs

$moveKey = if ($Direction -eq "up") { "{UP}" } else { "{DOWN}" }

for ($index = 0; $index -lt $MoveCount; $index++) {
  $wshell.SendKeys($moveKey)
  Start-Sleep -Milliseconds $KeyDelayMs
}

$wshell.SendKeys('~')
Start-Sleep -Milliseconds 90
$wshell.SendKeys('{BACKSPACE}')
