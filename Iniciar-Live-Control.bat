@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] No encontre npm. Instala Node.js LTS desde https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo.
echo Live Control - iniciando backend, bridge y panel en una sola ventana...
echo (Cierra esta ventana solo si quieres detener la app en modo desarrollo.)
echo.

call npm run desktop:start

if errorlevel 1 (
  echo.
  echo [ERROR] No pude arrancar la app. Revisa que Node.js este instalado.
  pause
  exit /b 1
)

endlocal