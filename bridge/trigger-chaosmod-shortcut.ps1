param(
  [string]$ProcessName = "GTA5",
  [int]$KeyCode = 0,
  [int]$CtrlPressed = 0,
  [int]$ShiftPressed = 0,
  [int]$AltPressed = 0,
  [int]$ReloadConfig = 0,
  [int]$ReloadDelayMs = 850,
  [int]$PostReloadDelayMs = 1400,
  [int]$KeyDelayMs = 45
)

$ErrorActionPreference = "Stop"

if ($KeyCode -le 0) {
  throw "KeyCode invalido."
}

$wshell = New-Object -ComObject WScript.Shell
$process = Get-Process -Name $ProcessName -ErrorAction Stop | Select-Object -First 1

if (-not $wshell.AppActivate($process.Id)) {
  throw "No pude enfocar el proceso $ProcessName."
}

function Get-SendKeysShortcut([int]$ResolvedKeyCode, [int]$UseCtrl, [int]$UseShift, [int]$UseAlt) {
  $modifierPrefix = ''

  if ($UseCtrl -ne 0) {
    $modifierPrefix += '^'
  }

  if ($UseShift -ne 0) {
    $modifierPrefix += '+'
  }

  if ($UseAlt -ne 0) {
    $modifierPrefix += '%'
  }

  $functionKeys = @{
    0x70 = '{F1}'
    0x71 = '{F2}'
    0x72 = '{F3}'
    0x73 = '{F4}'
    0x74 = '{F5}'
    0x75 = '{F6}'
    0x76 = '{F7}'
    0x77 = '{F8}'
    0x78 = '{F9}'
    0x79 = '{F10}'
    0x7A = '{F11}'
    0x7B = '{F12}'
  }

  if (-not $functionKeys.ContainsKey($ResolvedKeyCode)) {
    throw "El atajo $ResolvedKeyCode no tiene representacion SendKeys soportada."
  }

  return "$modifierPrefix$($functionKeys[$ResolvedKeyCode])"
}

Start-Sleep -Milliseconds 200

if ($ReloadConfig -ne 0) {
  $wshell.SendKeys('^l')
  Start-Sleep -Milliseconds $ReloadDelayMs
  $wshell.SendKeys('^l')
  Start-Sleep -Milliseconds $PostReloadDelayMs
}

$wshell.SendKeys((Get-SendKeysShortcut $KeyCode $CtrlPressed $ShiftPressed $AltPressed))
Start-Sleep -Milliseconds $KeyDelayMs
