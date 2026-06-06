@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] Necesitas Node.js LTS: https://nodejs.org
  pause
  exit /b 1
)

echo.
echo Generando el instalador .exe con todos los cambios recientes...
echo Esto puede tardar varios minutos.
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\build-desktop-exe.ps1"

echo.
pause
endlocal