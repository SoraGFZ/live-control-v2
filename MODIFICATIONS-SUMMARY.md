# Bridge Modifications - Line-by-Line Summary

## File: bridge/index.js

### Change #1: Add Socket Configuration (Lines 128-129)

**Location**: Inside `DEFAULT_CONFIG.chaosmod` object

**Before**:
```javascript
  chaosmod: {
    enabled: true,
    modPath: 'C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod',
    gtaProcessName: 'GTA5_Enhanced',
    preferShortcutTrigger: true,
    allowMenuFallback: true,
    shortcutReloadDelayMs: 850,
    // ... rest of config
```

**After**:
```javascript
  chaosmod: {
    enabled: true,
    modPath: 'C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod',
    gtaProcessName: 'GTA5_Enhanced',
    preferShortcutTrigger: true,
    autoEnableDebugSocket: true,              // ← ADDED
    debugSocketPort: 31819,                   // ← ADDED
    allowMenuFallback: true,
    shortcutReloadDelayMs: 850,
    // ... rest of config
```

**Purpose**: Enable socket at startup and specify the port

---

### Change #2: Socket Instantiation + Startup Log (Lines 1242-1246)

**Location**: After bridge configuration is loaded, socket initialization block

**Before**:
```javascript
  const chaosModState = {
    catalog: [],
    sourcePath: '',
    effectsFilePath: '',
    processName: bridgeConfig.chaosmod.gtaProcessName,
    selectedIndex: 0,
  }
  const chaosModDebugSocket = null  // ← WAS ALWAYS NULL
```

**After**:
```javascript
  const chaosModState = {
    catalog: [],
    sourcePath: '',
    effectsFilePath: '',
    processName: bridgeConfig.chaosmod.gtaProcessName,
    selectedIndex: 0,
  }
  const chaosModDebugSocket = bridgeConfig.chaosmod.autoEnableDebugSocket  // ← CONDITIONALLY INSTANTIATE
    ? createChaosModDebugSocketClient(bridgeConfig.chaosmod)
    : null
  if (chaosModDebugSocket) {  // ← LOG STARTUP STATUS
    console.log(`[chaosmod] debug socket habilitado en ws://127.0.0.1:${Number(bridgeConfig.chaosmod.debugSocketPort || 31819)}`)
  }
```

**Purpose**: 
- Actually instantiate the socket if config enabled
- Log successful initialization for debugging

---

### Change #3: Socket Priority Check in executeChaosModEffect (Lines 1443-1451)

**Location**: Inside `executeChaosModEffect()` function, at the START of effect execution logic

**Before**:
```javascript
    console.log(`[bridge:chaosmod] 🚀 EJECUTANDO EFECTO`)
    console.log(`[bridge:chaosmod] Effect ID: ${messagePayload.gtaChaosEffectId}`)
    console.log(`[bridge:chaosmod] Effect Name: ${messagePayload.gtaChaosEffectName}`)
    console.log(`[bridge:chaosmod] GTA Process: ${chaosModState.processName || bridgeConfig.chaosmod.gtaProcessName}`)
    console.log(`${'▓'.repeat(80)}\n`)

    // PRIMARY: Keyboard shortcut trigger (THIS WAS FIRST)
    try {
      console.log(`[bridge:chaosmod] 🔑 PRIMARY: Intentando atajo de teclado...`)
      const shortcutAssignment = ensureChaosModShortcut(messagePayload.gtaChaosEffectId)
      // ... keyboard trigger logic ...
```

**After**:
```javascript
    console.log(`[bridge:chaosmod] 🚀 EJECUTANDO EFECTO`)
    console.log(`[bridge:chaosmod] Effect ID: ${messagePayload.gtaChaosEffectId}`)
    console.log(`[bridge:chaosmod] Effect Name: ${messagePayload.gtaChaosEffectName}`)
    console.log(`[bridge:chaosmod] GTA Process: ${chaosModState.processName || bridgeConfig.chaosmod.gtaProcessName}`)
    console.log(`${'▓'.repeat(80)}\n`)

    // PRIMARY: Debug socket trigger (directo, sin menú) if available  // ← NEW SECTION
    if (chaosModDebugSocket?.isConnected()) {
      console.log(`[bridge:chaosmod] 🔌 DIRECTO: Intentando trigger via debug socket...`)
      const triggered = chaosModDebugSocket.triggerEffect(messagePayload.gtaChaosEffectId)
      
      if (triggered) {
        console.log(`[bridge:chaosmod] ✅ DIRECTO: Efecto disparado sin menú via debug socket`)
        return
      }
      
      console.warn(`[bridge:chaosmod] ⚠️ DIRECTO no disponible, continuando con atajo/menu`)
    }

    // PRIMARY: Keyboard shortcut trigger (NOW SECONDARY - THIS PART UNCHANGED)
    try {
      console.log(`[bridge:chaosmod] 🔑 PRIMARY: Intentando atajo de teclado...`)
      const shortcutAssignment = ensureChaosModShortcut(messagePayload.gtaChaosEffectId)
      // ... keyboard trigger logic ... (unchanged)
```

**Purpose**:
- Try socket FIRST (direct, silent method)
- If socket works, exit early with success
- If socket unavailable, continue to keyboard shortcut (backward compatible)

---

## Summary of Changes

| Line(s) | Change Type | What Changed | Why |
|---------|-------------|--------------|-----|
| 128-129 | Addition | Added `autoEnableDebugSocket: true` and `debugSocketPort: 31819` to DEFAULT_CONFIG | Enable socket config in defaults |
| 1242-1246 | Modification | Changed from `null` to conditional instantiation + log | Actually create the socket when enabled |
| 1443-1451 | Insertion | Added socket priority check BEFORE shortcut logic | Try socket-first for silent execution |

**Total New/Modified Lines**: ~15 lines

**Total Lines Unchanged**: Millions (complete backward compatibility maintained)

---

## Configuration Behavior

### What Happens with These Changes

**Scenario 1: User has NO socket settings in bridge-config.json**
```
bridge-config.json: { "chaosmod": { "enabled": true, "modPath": "..." } }
         ↓
Config Merge (DEFAULT overrides with user):
{ ...DEFAULT_CONFIG.chaosmod, ...(user.chaosmod || {}) }
         ↓
Result: Socket settings from DEFAULT applied automatically
         ↓
Socket ENABLED by default ✅
```

**Scenario 2: User disables socket in bridge-config.json**
```
bridge-config.json: { "chaosmod": { "autoEnableDebugSocket": false } }
         ↓
Config Merge:
{ ...DEFAULT_CONFIG.chaosmod, autoEnableDebugSocket: false }
         ↓
Result: Socket settings from DEFAULT OVERRIDDEN by user
         ↓
Socket DISABLED ✅ (user preference respected)
```

---

## Execution Flow After Changes

```
User clicks "Test"
    ↓
Backend: POST /api/actions/{id}/test
    ↓
Backend broadcasts 'gta-event' to bridge
    ↓
Bridge receives message → handleGtaMessage()
    ↓
Bridge calls: executeChaosModEffect(payload)
    ↓
┌─────────────────────────────────────────┐
│ NEW: Check socket FIRST                 │
│                                         │
│ if (chaosModDebugSocket?.isConnected()) │
│   → Try socket trigger                  │
│   → If success: RETURN (exit here)      │
│   → If fail: continue to shortcut        │
└─────────────────────────────────────────┘
    ↓
OLD: Try keyboard shortcut (if socket unavailable)
    ↓
OLD: Try menu fallback (if shortcut unavailable)
    ↓
Effect executes or error logged
```

---

## Code Quality Assurance

### What Was Preserved ✅
- All existing error handling
- All existing logging
- All existing fallback mechanisms
- All keyboard shortcut logic (unchanged)
- All menu navigation logic (unchanged)
- Full backward compatibility

### What Was Added ✅
- Socket config in DEFAULT_CONFIG
- Socket instantiation logic
- Socket connection startup log
- Socket connection check in execution
- Socket success/failure logs
- Graceful fallback if socket unavailable

### What Was NOT Changed ❌
- Frontend code (unmodified)
- Backend code (unmodified)
- Configuration file format (unmodified)
- Effects.ini handling (unmodified)
- PowerShell scripts (unmodified)
- Error messages (enhanced only)

---

## Testing the Changes

### Verify Changes Exist (Line Check)
```bash
# Line 128: autoEnableDebugSocket in DEFAULT_CONFIG
grep -n "autoEnableDebugSocket: true," bridge/index.js | head -1

# Line 129: debugSocketPort in DEFAULT_CONFIG
grep -n "debugSocketPort: 31819," bridge/index.js | head -1

# Line 1242: Socket instantiation
grep -n "const chaosModDebugSocket = bridgeConfig" bridge/index.js

# Line 1443: Socket priority check
grep -n "🔌 DIRECTO: Intentando trigger" bridge/index.js
```

### Verify Configuration Loads
```bash
# Start bridge and watch for socket init log
node bridge/index.js
# Expected: [chaosmod] debug socket habilitado en ws://127.0.0.1:31819
```

### Verify Execution Priority
```bash
# Click Test on action
# Watch bridge logs for socket attempt
# Expected: [bridge:chaosmod] 🔌 DIRECTO: Intentando trigger...
```

---

## Rollback Instructions (if needed)

To revert these changes:

1. Remove line 128: `autoEnableDebugSocket: true,`
2. Remove line 129: `debugSocketPort: 31819,`
3. Change line 1242 from:
   ```javascript
   const chaosModDebugSocket = bridgeConfig.chaosmod.autoEnableDebugSocket
     ? createChaosModDebugSocketClient(bridgeConfig.chaosmod)
     : null
   ```
   Back to:
   ```javascript
   const chaosModDebugSocket = null
   ```
4. Remove lines 1243-1246 (socket startup log)
5. Remove lines 1443-1451 (socket priority check)

This would revert to keyboard shortcut-first execution (original behavior).

---

## Implementation Complete ✅

All changes have been applied and verified in the bridge/index.js file. Socket-first effect execution is now enabled by default.

**Next**: Run testing as described in SOCKET-TESTING-GUIDE.md
