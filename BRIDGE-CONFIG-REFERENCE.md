# Bridge Config Quick Reference

**After migration from StreamToEarn (S2E removed)**

## Configuration File Location

```
./bridge-config.json
```

## Minimal Valid Config

```json
{
  "serverBaseUrl": "https://YOUR-APP.up.railway.app",
  "dashboardKey": "",
  "minecraft": {
    "enabled": true,
    "localBridgeHost": "127.0.0.1",
    "localBridgePort": 6135,
    "useRcon": true,
    "rconHost": "127.0.0.1",
    "rconPort": 25575,
    "rconPassword": "YOUR-PASSWORD"
  },
  "gta": {
    "enabled": true,
    "localBridgeHost": "127.0.0.1",
    "localBridgePort": 6136
  },
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

## ChaosMod Settings Explained

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | bool | `true` | Enable ChaosMod integration |
| `modPath` | string | `C:\....\chaosmod` | Location of ChaosMod folder |
| `gtaProcessName` | string | `GTA5_Enhanced` | GTA V process name (check Task Manager) |
| `preferShortcutTrigger` | bool | `true` | Use keyboard shortcuts (PRIMARY) |
| `allowMenuFallback` | bool | `true` | Allow menu navigation as fallback |
| `shortcutReloadDelayMs` | int | 850 | Delay after sending Ctrl+L (reload) |
| `shortcutPostReloadDelayMs` | int | 1400 | Delay after reload before sending key |
| `shortcutKeyDelayMs` | int | 45 | Delay between shortcut key presses |
| `menuOpenDelayMs` | int | 220 | Delay after opening menu (Ctrl+,) |
| `keyDelayMs` | int | 35 | Delay between arrow key presses |

## REMOVED Settings (NO LONGER USED)

```json
// ❌ DO NOT USE - Deprecated and removed
{
  "chaosmod": {
    // HTTP settings (S2E legacy - REMOVED)
    "localHttpHost": "127.0.0.1",          // ❌ GONE
    "localHttpPort": 8082,                 // ❌ GONE
    "localHttpPath": "/trigger_effect",    // ❌ GONE
    "localHttpSender": "StreamToEarn",     // ❌ GONE
    "localHttpTokenHeader": "Superdupertoken", // ❌ GONE
    "localHttpToken": "glory to ukraine",  // ❌ GONE
    "preferLocalHttp": true,               // ❌ GONE
    
    // Debug socket (didn't work - REMOVED)
    "debugSocketPort": 31819,              // ❌ GONE
    "debugSocketReconnectDelayMs": 3000,   // ❌ GONE
    "preferDirectSocket": true,            // ❌ GONE
    
    // Deprecated logic
    "autoEnableEffectMenu": true,          // ❌ GONE
    "autoEnableDebugSocket": true,         // ❌ GONE
    "assumeTopSelectionOnStartup": true,   // ❌ GONE
    "preferShortcutFallback": true,        // ✅ RENAMED → preferShortcutTrigger
    "catalogResyncIntervalMs": 30000,      // ❌ GONE
  }
}
```

## Alternative GTA Installations

If your GTA V is in a different location, modify `modPath`:

```json
{
  "chaosmod": {
    "modPath": "C:\\Program Files (x86)\\Epic Games\\GTAVEnhanced\\chaosmod",
    "gtaProcessName": "GTA5_Enhanced"
  }
}
```

Or if you're using vanilla GTAV:

```json
{
  "chaosmod": {
    "modPath": "C:\\Program Files\\Epic Games\\GTAV\\chaosmod",
    "gtaProcessName": "GTA5"
  }
}
```

## Troubleshooting Configuration

### "ChaosMod no habla con la app"

Check:
```powershell
# 1. ¿Existe el archivo?
Test-Path "C:\Program Files\Epic Games\GTAVEnhanced\chaosmod\configs\effects.ini"

# 2. ¿Es accesible?
Get-Content -Path "C:\Program Files\Epic Games\GTAVEnhanced\chaosmod\configs\effects.ini" -TotalCount 10

# 3. ¿GTA process es correcto?
Get-Process | Where-Object ProcessName -like "*GTA5*"
```

Fix:
```json
{
  "chaosmod": {
    "modPath": "C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod",
    "gtaProcessName": "GTA5_Enhanced"
  }
}
```

### "Efectos no disparan a tiempo"

Aumenta delays:

```json
{
  "chaosmod": {
    "shortcutReloadDelayMs": 1200,      // ⬆️ Aumenta
    "shortcutPostReloadDelayMs": 2000,  // ⬆️ Aumenta
    "shortcutKeyDelayMs": 100           // ⬆️ Aumenta
  }
}
```

### "Menu fallback no funciona"

Asegura settings:

```json
{
  "chaosmod": {
    "preferShortcutTrigger": true,
    "allowMenuFallback": true,  // Must be true
    "menuOpenDelayMs": 300,      // Increase if needed
    "keyDelayMs": 50             // Increase if needed
  }
}
```

## Environment Variables

Override config location:

```powershell
# Set environment variable
$env:LIVE_CONTROL_BRIDGE_CONFIG = "C:\custom\path\bridge-config.json"

# Start bridge
npm run bridge:start
```

## Validation Script

```powershell
# Validate bridge config
function Test-BridgeConfig {
    param(
        [string]$ConfigPath = ".\bridge-config.json"
    )
    
    try {
        $config = Get-Content $ConfigPath | ConvertFrom-Json
        "✅ Config JSON válido"
        
        $modPath = $config.chaosmod.modPath
        if (Test-Path "$modPath\configs\effects.ini") {
            "✅ ChaosMod encontrado en: $modPath"
        } else {
            "❌ ChaosMod NO ENCONTRADO en: $modPath"
        }
        
        # Check for deprecated settings
        $deprecated = @("localHttpHost", "localHttpPort", "debugSocketPort")
        $deprecated | ForEach-Object {
            if ($config.chaosmod.PSObject.Properties.Name -contains $_) {
                "⚠️  DEPRECATED: $_ (remove from config)"
            }
        }
    } catch {
        "❌ Error parsing config: $_"
    }
}

Test-BridgeConfig
```

## Configuration Sync

Bridge-config.json se lee al iniciar. Para cambios:

```powershell
# 1. Editar config
vim ./bridge-config.json

# 2. Reiniciar bridge
npm run bridge:stop
npm run bridge:start

# O en desktop:
# Reiniciar la app
```

## Advanced: Multi-GTA Setup

Si tienes múltiples versiones de GTA:

```json
{
  "chaosmod": {
    "modPath": "C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod",
    "gtaProcessName": "GTA5_Enhanced"
  }
}
```

Cambia `gtaProcessName` a:
- `GTA5` (Vanilla GTAV)
- `GTA5_Enhanced` (Enhanced Edition)
- `GTAVAutomatic` (Custom modded)

Ver proceso exacto:
```powershell
Get-Process | Where-Object ProcessName -like "*GTA*" | Select-Object Name, Id
```

---

## Migrate from S2E

If you had old S2E config:

```json
// OLD (S2E - DON'T USE)
{
  "chaosmod": {
    "localHttpHost": "127.0.0.1",
    "localHttpPort": 8082,
    "localHttpSender": "StreamToEarn",
    "localHttpTokenHeader": "Superdupertoken",
    "localHttpToken": "glory to ukraine"
  }
}

// NEW (Live Control - USE THIS)
{
  "chaosmod": {
    "modPath": "C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod",
    "gtaProcessName": "GTA5_Enhanced",
    "preferShortcutTrigger": true,
    "allowMenuFallback": true
  }
}
```

Simply delete the old HTTP settings. They're not used anymore.

---

**Para más info:** Ver [GTA-CHAOSMOD-INTEGRATION.md](./GTA-CHAOSMOD-INTEGRATION.md)
