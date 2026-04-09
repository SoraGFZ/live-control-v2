param(
  [string]$ProcessName = "GTA5",
  [int]$ShortcutKeycode = 0,
  [int]$ReloadConfig = 0,
  [int]$ReloadDelayMs = 850,
  [int]$PostReloadDelayMs = 1400,
  [int]$KeyDelayMs = 45
)

$ErrorActionPreference = "Stop"

if ($ShortcutKeycode -le 0) {
  throw "ShortcutKeycode invalido."
}

$wshell = New-Object -ComObject WScript.Shell
$process = Get-Process -Name $ProcessName -ErrorAction Stop | Select-Object -First 1

if (-not $wshell.AppActivate($process.Id)) {
  throw "No pude enfocar el proceso $ProcessName."
}

function Decode-Shortcut([int]$Keycode) {
  return @{
    KeyCode = ($Keycode -band 0xFF)
    Ctrl = [bool]($Keycode -band (1 -shl 10))
    Shift = [bool]($Keycode -band (1 -shl 9))
    Alt = [bool]($Keycode -band (1 -shl 8))
  }
}

$decodedShortcut = Decode-Shortcut $ShortcutKeycode
function Get-SendKeysShortcut([hashtable]$Shortcut) {
  $modifierPrefix = ''

  if ($Shortcut.Ctrl) {
    $modifierPrefix += '^'
  }

  if ($Shortcut.Shift) {
    $modifierPrefix += '+'
  }

  if ($Shortcut.Alt) {
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

  if (-not $functionKeys.ContainsKey($Shortcut.KeyCode)) {
    throw "El atajo $($Shortcut.KeyCode) no tiene representacion SendKeys soportada."
  }

  return "$modifierPrefix$($functionKeys[$Shortcut.KeyCode])"
}

Start-Sleep -Milliseconds 200

if ($ReloadConfig -ne 0) {
  $wshell.SendKeys('^l')
  Start-Sleep -Milliseconds $ReloadDelayMs
  $wshell.SendKeys('^l')
  Start-Sleep -Milliseconds $PostReloadDelayMs
}

$wshell.SendKeys((Get-SendKeysShortcut $decodedShortcut))
Start-Sleep -Milliseconds $KeyDelayMs
