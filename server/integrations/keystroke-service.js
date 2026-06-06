import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function escapePsString(value) {
  return String(value || '').replace(/'/g, "''")
}

export async function executeKeystroke(keys) {
  const combo = String(keys || '').trim()

  if (!combo) {
    throw new Error('Falta combo de teclas')
  }

  if (process.platform !== 'win32') {
    throw new Error('Simulacion de teclado solo disponible en Windows por ahora')
  }

  const script = `
Add-Type -AssemblyName System.Windows.Forms
$combo = '${escapePsString(combo)}'
$parts = $combo -split '\\+'
$keys = @()
foreach ($part in $parts) {
  $key = $part.Trim().ToUpper()
  switch ($key) {
    'CTRL' { $keys += [System.Windows.Forms.Keys]::Control }
    'CONTROL' { $keys += [System.Windows.Forms.Keys]::Control }
    'ALT' { $keys += [System.Windows.Forms.Keys]::Alt }
    'SHIFT' { $keys += [System.Windows.Forms.Keys]::Shift }
    'WIN' { $keys += [System.Windows.Forms.Keys]::LWin }
    'ENTER' { $keys += [System.Windows.Forms.Keys]::Enter }
    'ESC' { $keys += [System.Windows.Forms.Keys]::Escape }
    'TAB' { $keys += [System.Windows.Forms.Keys]::Tab }
    'SPACE' { $keys += [System.Windows.Forms.Keys]::Space }
    default {
      if ($key.Length -eq 1) {
        $keys += [enum]::Parse([System.Windows.Forms.Keys], $key)
      } else {
        $keys += [enum]::Parse([System.Windows.Forms.Keys], $key, $true)
      }
    }
  }
}
[System.Windows.Forms.SendKeys]::Flush()
foreach ($key in $keys) {
  [System.Windows.Forms.SendKeys]::SendWait('{' + $key + '}')
}
`

  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout: 8000 },
  )

  return { ok: true, keys: combo }
}