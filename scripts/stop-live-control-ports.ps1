$ErrorActionPreference = 'SilentlyContinue'

function Stop-PortListeners([int[]]$Ports) {
  foreach ($port in $Ports) {
    $lines = netstat -ano | Select-String ":$port\s"
    foreach ($line in $lines) {
      if ($line -notmatch '\sLISTENING\s+(\d+)\s*$') { continue }
      $processId = [int]$Matches[1]
      if ($processId -le 4) { continue }
      try {
        $proc = Get-Process -Id $processId -ErrorAction Stop
        Write-Host "Deteniendo $($proc.ProcessName) (PID $processId) en puerto $port" -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction Stop
      } catch {
        Write-Host "No se pudo detener PID $processId en puerto ${port} - $($_.Exception.Message)" -ForegroundColor DarkYellow
      }
    }
  }
}

Stop-PortListeners @(5123, 6135, 6136)
Start-Sleep -Milliseconds 400