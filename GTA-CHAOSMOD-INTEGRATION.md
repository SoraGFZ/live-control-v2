# GTA V + ChaosMod Integration Guide

**NEW (v0.1.0+):** Integración directa sin dependencias externas. No requiere StreamToEarn.

## Visión General

La app se comunica con GTA V y ChaosMod directamente mediante:
1. **WebSocket local** (Bridge ↔ Backend)
2. **File-based coordination** (Bridge lee `effects.ini`)
3. **Keyboard injection** (PowerShell → Windows API → GTA V)

## Arquitectura

```
┌──────────────────────────┐
│   Desktop App (React)    │
│   Backend (Express)      │
│   Bridge (Node.js)       │
└──────────┬───────────────┘
           │
      [WebSocket Local]
           │
    ┌──────┴──────┐
    │              │
    ↓              ↓
Minecraft        GTA V
  RCON        Local Bridge
(Port 25575)   (Port 6136)
               
GTA V + ChaosMod (Local Process)
    ↓
    Read effects.ini
    ↓
    Assign keyboard shortcut (F9-F12)
    ↓
    Bridge sends shortcut key
    ↓
    ChaosMod receives key → Executes effect
```

## Setup Requerido

### 1. Windows + Admin

La app necesita **admin rights** para:
- Inyectar teclazos en GTA V
- Leer/escribir en `effects.ini`

### 2. ChaosMod Instalado

```
C:\Program Files\Epic Games\GTAVEnhanced\chaosmod\
    ├── configs/
    │   ├── effects.ini          ← Bridge lee/escribe aquí
    │   └── config.ini
    ├── chaoslog.txt
    └── [other mod files]
```

**Verificar instalación:**
```powershell
Test-Path "C:\Program Files\Epic Games\GTAVEnhanced\chaosmod\configs\effects.ini"
# Debería retornar: True
```

### 3. effects.ini Formato

Ejemplo simplificado:
```ini
[Effect_0]
id=player_plus2stars
name=+2 Wanted Stars
enabled=1
shortcutKeyCode=0     ; 0 = Sin asignar
...

[Effect_1]
id=vehicle_motorcycle
name=Spawnear Motorcycle
enabled=1
shortcutKeyCode=0x78  ; F9
...
```

El Bridge modifica `shortcutKeyCode` dinámicamente.

## Integración: Cómo Funciona

### Flujo: Usuario presiona Test Button

```
1. Frontend sends: POST /api/actions/{id}/test
   
2. Backend receives, broadcasts to Bridge
   Message: {
     type: 'gta-event',
     payload: {
       gtaChaosEffectId: 'player_plus2stars',
       gtaChaosEffectName: '+2 Wanted Stars',
       actionName: 'Test Action'
     }
   }

3. Bridge receives WebSocket message
   → executeChaosModEffect() called

4. Bridge PRIMARY: Keyboard Shortcut
   a) ensureChaosModShortcut('player_plus2stars')
      - Lee effects.ini
      - Busca este effect ID
      - Si no tiene shortcut: asigna F9/F10/F11/F12
      - Escribe cambios en effects.ini
   
   b) Ejecuta PowerShell:
      bridge/trigger-chaosmod-shortcut.ps1
      - Envia Ctrl+L (reload ChaosMod config)
      - Envia F9/F10/F11/F12 (keyboard key)
   
   c) ChaosMod receives key
      - Carga effects.ini actualizado
      - Encuentra effect ID → Ejecuta

5. Si PRIMARY falla →  FALLBACK: Menu Navigation
   - Abre menú con Ctrl+,
   - Navega con flechas
   - Presiona Enter
   - Cierra con Backspace

6. ChaosMod ejecuta efecto en-game
```

## Logs & Debugging

### Bridge Logs

Ubicación: `storage/runtime-logs/bridge.log`

Búscar líneas:
```
[bridge] 🎯 Disparando efecto:           ← Inicio
[bridge] 🔑 PRIMARY: Usando atajo...    ← Mecanismo
[bridge] ✅ ÉXITO: Efecto disparado     ← OK
[bridge] ❌ Atajo falló:                ← Error
```

### ChaosMod Logs

Ubicación: `C:\Program Files\Epic Games\GTAVEnhanced\chaosmod\chaoslog.txt`

Buscar referencias a keyboard input o effect execution.

## Configuración

Archivo: `bridge-config.json`

```json
{
  "chaosmod": {
    "enabled": true,
    "modPath": "C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod",
    "gtaProcessName": "GTA5_Enhanced",
    "preferShortcutTrigger": true,
    "allowMenuFallback": true,
    "shortcutReloadDelayMs": 850,
    "shortcutPostReloadDelayMs": 1400,
    "shortcutKeyDelayMs": 45,
    "menuOpenDelayMs": 220,
    "keyDelayMs": 35
  }
}
```

| Setting | Default | Propósito |
|---------|---------|-----------|
| `modPath` | `C:\Program Files\Epic Games\GTAVEnhanced\chaosmod` | Ubicación de ChaosMod |
| `gtaProcessName` | `GTA5_Enhanced` | Nombre del proceso de GTA |
| `preferShortcutTrigger` | `true` | Usar keyboard shortcuts primario |
| `allowMenuFallback` | `true` | Fallback a menú si shortcut falla |
| `shortcutReloadDelayMs` | 850 | Esperar después de Ctrl+L |
| `shortcutPostReloadDelayMs` | 1400 | Esperar después de reload |
| `shortcutKeyDelayMs` | 45 | Delay entre teclas (F9, etc) |
| `menuOpenDelayMs` | 220 | Delay al abrir menú (Ctrl+,) |
| `keyDelayMs` | 35 | Delay entre navegación |

## Troubleshooting

### "El bridge local no esta conectado"

**Causa:** `node bridge/index.js` no iniciado

**Solución:**
```powershell
# En terminal separada
npm run bridge:start
# O manualmente:
node bridge/index.js
```

### "No pude disparar efecto...Atajos: ✗"

**Causa:** PowerShell keyboard injection falló

**Debug:**
1. ¿GTA V tiene focus en ventana?
2. ¿effects.ini es accesible?
   ```powershell
   Get-Content "C:\Program Files\Epic Games\GTAVEnhanced\chaosmod\configs\effects.ini" -TotalCount 10
   ```
3. ¿El shortcut se escribió en effects.ini?
   ```powershell
   Select-String -Path "effects.ini" -Pattern "shortcutKeyCode=0x78"
   ```

### "Efecto no encontrado en catálogo"

**Causa:** Effect ID en config no existe en effects.ini

**Solución:**
1. Verificar que effect ID es correcto
2. Recargar ChaosMod (Ctrl+L) en-game
3. Reiniciar bridge: `npm run bridge:stop && npm run bridge:start`

### "La seleccion actual del menu de ChaosMod no esta sincronizada"

**Causa:** Menu state se perdió durante sesión

**Solución:**
1. Abrir menú manual en GTA (Ctrl+,)
2. Navegar a efecto deseado
3. Presionar Enter
4. Reintentar desde la app

## PowerShell Scripts

### activate-chaosmod-effect.ps1

```powershell
# Abre ChaosMod menu y navega a efecto
param(
  [string]$ProcessName = "GTA5",           # Proceso GTA
  [ValidateSet("up", "down")][string]$Direction = "down",  # Dirección
  [int]$MoveCount = 0,                     # Cuántas veces
  [int]$OpenDelayMs = 220,                 # Delay al abrir
  [int]$KeyDelayMs = 35                    # Delay entre teclas
)

# 1. Enfocar GTA V window
# 2. Enviar Ctrl+, (abre menú)
# 3. Enviar flecha (UP/DOWN) × MoveCount
# 4. Enviar Enter (selecciona)
# 5. Enviar Backspace (cierra menú)
```

### trigger-chaosmod-shortcut.ps1

```powershell
# Envía keyboard shortcut (F9-F12)
param(
  [string]$ProcessName = "GTA5",           # Proceso GTA
  [int]$KeyCode = 0,                       # Código tecla
  [int]$CtrlPressed = 0,                   # Ctrl modifier
  [int]$ShiftPressed = 0,                  # Shift modifier
  [int]$AltPressed = 0,                    # Alt modifier
  [int]$ReloadConfig = 0,                  # ¿Recargar config?
  [int]$ReloadDelayMs = 850                # Delay post-reload
)

# 1. Enfocar GTA V window
# 2. Si ReloadConfig: Enviar Ctrl+L
# 3. Esperar ReloadDelayMs
# 4. Enviar tecla (F9/F10/F11/F12 con modifiers)
```

## No StreamToEarn

Esta integración **NO** depende de:
- ❌ StreamToEarn.exe
- ❌ HTTP endpoint (puerto 8082)
- ❌ Token headers
- ❌ Debug sockets
- ❌ External services

Solo necesita:
- ✅ Windows 10+
- ✅ GTA V Enhanced Edition
- ✅ ChaosMod instalado
- ✅ Admin rights

## End-to-End Test

Ver [GTA_TEST_PLAN.md](./GTA_TEST_PLAN.md)
