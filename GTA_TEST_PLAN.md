# GTA V Integration - End-to-End Test Plan

**Objetivo:** Validar que el sistema funciona SOLO con Live Control app, SIN StreamToEarn.

## Pre-Requisitos

- ✅ App compilada (o en modo dev)
- ✅ GTA V Enhanced Edition instalado
- ✅ ChaosMod mod instalado
- ✅ bridge-config.json completo
- ✅ Admin rights en terminal

## STEP 1: Verificar Setup (5 min)

### 1.1 ChaosMod Instalado

```powershell
$path = "C:\Program Files\Epic Games\GTAVEnhanced\chaosmod\configs\effects.ini"
if (Test-Path $path) {
    Write-Host "✅ ChaosMod encontrado"
    (Get-Item $path).FullName
} else {
    Write-Host "❌ ChaosMod NO ENCONTRADO en $path"
    exit 1
}
```

**Esperado:**
```
✅ ChaosMod encontrado
C:\Program Files\Epic Games\GTAVEnhanced\chaosmod\configs\effects.ini
```

### 1.2 effects.ini Readable

```powershell
$path = "C:\Program Files\Epic Games\GTAVEnhanced\chaosmod\configs\effects.ini"
$content = @(Get-Content $path | Select-Object -First 5)
Write-Host "✅ Primeras 5 líneas de effects.ini:"
$content
```

**Esperado:**
```
[Effect_0]
id=...
name=...
enabled=1
...
```

### 1.3 Bridge Config Válido

```powershell
$configPath = ".\bridge-config.json"
$config = Get-Content $configPath | ConvertFrom-Json
Write-Host "✅ ChaosMod config:"
$config.chaosmod | Format-Table -AutoSize
```

**Esperado:**
```
enabled          : True
modPath          : C:\Program Files\Epic Games\GTAVEnhanced\chaosmod
gtaProcessName   : GTA5_Enhanced
preferShortcutTrigger : True
allowMenuFallback : True
```

## STEP 2: Iniciar Servicios (5 min)

### 2.1 Terminal 1: Backend + Bridge Auto-Launch

```powershell
cd c:\Users\soraf\Desktop\APPTIKTOK\live-control-app

# En modo desktop, esto se auto-inicia. Para dev:
npm run dev
```

Esperar a ver:
```
[bridge] escuchando en ws://127.0.0.1:6136
[bridge] listo para recibir acciones de Minecraft y GTA
```

### 2.2 Terminal 2: Verificar Conexión Local

```powershell
# Test WebSocket local
$ws = New-Object System.Net.WebClient
try {
    $response = $ws.DownloadString("http://127.0.0.1:5123/health")
    if ($response -contains "ok") {
        Write-Host "✅ Backend respondio"
    }
} catch {
    Write-Host "❌ Backend no disponible"
}
```

**Esperado:**
```
✅ Backend respondio
```

## STEP 3: Abrir GTA V (2 min)

### 3.1 Iniciar GTA V

```powershell
# Asegurar que GTA5_Enhanced.exe inicia
Start-Process "C:\Program Files\Epic Games\GTAVEnhanced\GTA5_Enhanced.exe"
```

Esperar a que GTA V cargue completamente.

**En logs/bridge.log debería ver:**
```
[GTA5_Enhanced] procesando en PID: XXXX
```

### 3.2 Esperar en-game

- Esperar a que cargue el juego
- Entrar a cualquier modo (Story, Freeroam)
- Asegurar que estés en la sesión de juego

## STEP 4: Test sin S2E (10 min)

### 4.1 Verificar que S2E NO está corriendo

```powershell
Get-Process | Where-Object { $_.ProcessName -like "*streamtoearn*" -or $_.ProcessName -like "*S2E*" }
# NO debería retornar nada
```

**Esperado:**
```
(Sin resultados - S2E no está corriendo)
```

### 4.2 Abrir Panel Local

En navegador:
```
http://127.0.0.1:5123
```

**Esperado:**
- ✅ Dashboard carga
- ✅ GTA bridge muestra "Connected"
- ✅ Puedes ver acciones disponibles

### 4.3 Test Action: Crear (si no existe)

En el panel, crear una acción GTA rápida:
- **Name:** "Test Effect"
- **Mode:** ChaosMod
- **Effect ID:** `player_plus2stars`  (o verificar en effects.ini)
- **Effect Name:** "+2 Wanted Stars"
- **Output:** GTA

Guardar.

### 4.4 Presionar Test Button

```
[Panel] → Acción "Test Effect" → Presionar "Test" o Preview
```

**OBSERVAR EN SIMULTANEO:**

**En logs/bridge.log:**
```
[bridge] 🎯 Disparando efecto: player_plus2stars | +2 Wanted Stars
[bridge] 🔑 PRIMARY: Usando atajo de teclado...
[chaosmod] Lee effects.ini...
[chaosmod] Asignando shortcut F9...
[bridge] ✅ ÉXITO: Efecto disparado por atajo F9
```

**En GTA V:**
```
[En-game] ← El efecto debería ejecutarse
Ejemplo: +2 que se añaden a wanted level
```

## STEP 5: Validar Múltiples Efectos (10 min)

### 5.1 Test Effect 2 (Diferente)

Crear otra acción con efecto diferente:
- **Effect ID:** `vehicle_motorcycle` (o similar)
- Presionar Test

**Esperado en logs:**
```
[bridge] 🎯 Disparando efecto: vehicle_motorcycle | Spawnear Motorcycle
[bridge] 🔑 PRIMARY: Usando atajo de teclado...
[bridge] ✅ ÉXITO: Efecto disparado por atajo F10
```

**Esperado en GTA V:**
```
Vehículo aparece en pantalla
```

### 5.2 Test Effect 3 (Menu Fallback)

Crear acción con efecto que probablemente fallará shortcut (para probar fallback):
- Presionar Test
- Observar que si shortcut falla, intenta menú

**Esperado en logs:**
```
[bridge] 🔑 PRIMARY: Usando atajo de teclado...
[bridge] ❌ Atajo falló:
[bridge] 📋 FALLBACK: Usando navegación de menú...
[bridge] ✅ FALLBACK: Efecto disparado por menú
```

## STEP 6: Logs Analysis (10 min)

### 6.1 Bridge Log Completo

```powershell
Get-Content ".\storage\runtime-logs\bridge.log" -Tail 50 | Format-List
```

Buscar patrones:
- ✅ `[bridge] 🎯 Disparando efecto`
- ✅ `[bridge] ✅ ÉXITO`
- ❌ `[bridge] ❌ FALLO` (solo si esperado)

### 6.2 ChaosMod Log

```powershell
Get-Content "C:\Program Files\Epic Games\GTAVEnhanced\chaosmod\chaoslog.txt" -Tail 50
```

Buscar referencias a keyboard input.

### 6.3 Server Log

```powershell
Get-Content ".\storage\runtime-logs\server.log" -Tail 50
```

Buscar:
- WebSocket connections
- Action dispatches

## STEP 7: Stress Test (5 min)

### 7.1 Rapid Fire Tests

Presionar Test button 5 veces rápidamente en la misma acción:

```
[Hacer click] Test
[Hacer click] Test
[Hacer click] Test
[Hacer click] Test
[Hacer click] Test
```

**Esperado:**
- ✅ Todos los efectos se ejecutan
- ✅ Logs muestran 5 disparos
- ✅ ChaosMod maneja el rate

### 7.2 Different Effects Rapid

Test rápido entre diferentes acciones:

```
[Hacer click] Effect A
[Hacer click] Effect B
[Hacer click] Effect C
```

**Esperado:**
- ✅ Cada uno dispara correctamente
- ✅ Logs muestran transiciones
- ✅ Effects.ini se actualiza con nuevos shortcuts

## STEP 8: Error Cases (10 min)

### 8.1 GTA V Sin Focus

Minimizar GTA V, presionar Test:

```
[Haz Alt+Tab para minimizar GTA]
[Presiona Test en panel]
```

**Esperado en logs:**
```
[bridge] ❌ Atajo falló: No pude enfocar el proceso GTA5_Enhanced
```

**Esperado en GTA:**
Nada pasa (porque no tiene focus).

**Solución:**
Alt+Tab a GTA y presiona Test nuevamente.

### 8.2 Invalid Effect ID

Crear acción con effect ID que no existe:
```json
{
  "gtaChaosEffectId": "invalid_effect_xyz"
}
```

Presionar Test.

**Esperado en logs:**
```
[bridge] ❌ Efecto invalid_effect_xyz no encontrado en catálogo
```

**Esperado en GTA:**
Nada pasa, pero sin crash.

### 8.3 ChaosMod Deshabilitado

Si deshabilitas ChaosMod en config:
```json
{
  "chaosmod": {
    "enabled": false
  }
}
```

Reinicia bridge, presiona Test.

**Esperado en logs:**
```
[bridge] ChaosMod desactivado en bridge-config.json.
```

## STEP 9: Comparación S2E vs Nueva Integración (5 min)

**ANTERIOR (StreamToEarn):**
- ❌ Requería S2E.exe abierto
- ❌ Usaba HTTP port 8082 (nunca funcionó)
- ❌ Dependía de tokens externos
- ❌ 150+ líneas de código fallido

**NUEVO (Live Control):**
- ✅ SOLO la app + bridge
- ✅ Usa keyboard injection directa
- ✅ Sin tokens externos
- ✅ Código limpio y funcional

## STEP 10: Final Validation

### 10.1 Checklist

- [ ] ChaosMod encontrado ✅
- [ ] Bridge arranca automáticamente ✅
- [ ] Panel local disponible ✅
- [ ] S2E NO está corriendo ✅
- [ ] Test button dispara efecto ✅
- [ ] Logs muestran ejecución exitosa ✅
- [ ] Múltiples efectos funcionan ✅
- [ ] Menu fallback funciona ✅
- [ ] Sin S2E en task manager ✅
- [ ] Sin puertos HTTP extraños (8082 no usado) ✅

### 10.2 Si TODO está verde

```powershell
Write-Host "🎉 MIGRACIÓN EXITOSA - S2E ELIMINADA" -ForegroundColor Green
Write-Host "✅ Integración directa con ChaosMod funcionando"
Write-Host "✅ Sin dependencias externas"
Write-Host "✅ Listo para producción"
```

### 10.3 Si Algo está rojo

Revisar [GTA-CHAOSMOD-INTEGRATION.md](./GTA-CHAOSMOD-INTEGRATION.md) sección "Troubleshooting".

## Evidencia (Guardar para reporte)

```powershell
# Guardar logs
Copy-Item ".\storage\runtime-logs\bridge.log" -Destination "test-results-$(Get-Date -f 'yyyyMMdd-HHmmss').log"
Copy-Item "C:\Program Files\Epic Games\GTAVEnhanced\chaosmod\chaoslog.txt" -Destination "chaosmod-test-$(Get-Date -f 'yyyyMMdd-HHmmss').log"

# Screenshot del panel mostrando acción de TestEffect
# Video del efecto ejecutándose en-game
```

## Tiempo Total Estimado

- Setup: 5 min
- Iniciar servicios: 5 min
- Abrir GTA: 2 min
- Tests básicos: 10 min
- Logs analysis: 10 min
- Stress test: 5 min
- Error cases: 10 min
- Comparación: 5 min
- Validación final: 5 min

**Total: ~60 minutos**

---

## Rock check: No StreamToEarn 🎸

```
[Terminal 1] npm run dev
    ✅ Backend + Bridge auto-spawn

[Terminal 2] GTA V Enhanced Edition
    ✅ ChaosMod cargado

[Browser] http://127.0.0.1:5123
    ✅ Panel accesible

[Task Manager] + looking for StreamToEarn
    ✅ NO ENCONTRADO - EXITOSO

[Test Button Click]
    ✅ Efecto ejecuta en GTA V

🎉 MIGRACIÓN COMPLETADA
```
