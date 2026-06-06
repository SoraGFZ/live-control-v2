# Socket Integration - Code Verification

## Location 1: DEFAULT_CONFIG.chaosmod (lines 127-138)

### What to Check
Search for this in `bridge/index.js`:

```javascript
chaosmod: {
  enabled: true,
  modPath: 'C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod',
  gtaProcessName: 'GTA5_Enhanced',
  preferShortcutTrigger: true,
  autoEnableDebugSocket: true,              // ← This line added
  debugSocketPort: 31819,                   // ← This line added
  allowMenuFallback: true,
```

**Expected**: You should see both `autoEnableDebugSocket: true` and `debugSocketPort: 31819` in DEFAULT_CONFIG

---

## Location 2: Socket Instantiation (lines 1240-1245)

### What to Check
Search for this pattern:

```javascript
const chaosModDebugSocket = bridgeConfig.chaosmod.autoEnableDebugSocket
  ? createChaosModDebugSocketClient(bridgeConfig.chaosmod)
  : null
if (chaosModDebugSocket) {
  console.log(`[chaosmod] debug socket habilitado en ws://127.0.0.1:${Number(bridgeConfig.chaosmod.debugSocketPort || 31819)}`)
}
```

**Expected**: Socket should be instantiated (not `null`) when `autoEnableDebugSocket` is true

**Verify by**: Starting bridge and checking terminal for:
```
[chaosmod] debug socket habilitado en ws://127.0.0.1:31819
```

---

## Location 3: Socket Priority Check (lines 1438-1460)

### What to Check  
Inside the `executeChaosModEffect` function, at the START of the effect execution logic:

```javascript
// PRIMARY: Debug socket trigger (directo, sin menú) if available
if (chaosModDebugSocket?.isConnected()) {
  console.log(`[bridge:chaosmod] 🔌 DIRECTO: Intentando trigger via debug socket...`)
  const triggered = chaosModDebugSocket.triggerEffect(messagePayload.gtaChaosEffectId)
  
  if (triggered) {
    console.log(`[bridge:chaosmod] ✅ DIRECTO: Efecto disparado sin menú via debug socket`)
    return
  }
  
  console.warn(`[bridge:chaosmod] ⚠️ DIRECTO no disponible, continuando con atajo/menu`)
}

// FALLBACK: Keyboard shortcut trigger (this was the ORIGINAL logic)
try {
  console.log(`[bridge:chaosmod] 🔑 PRIMARY: Intentando atajo de teclado...`)
  // ... shortcut logic ... (UNCHANGED)
```

**Expected**: 
- Socket check BEFORE shortcut attempt
- Both 🔌 and 🔑 emojis in logs indicate correct order
- Socket method takes priority

**Verify by**: 
1. Clicking Test on a ChaosMod action
2. Watching for either:
   - ✅ DIRECTO: Efecto disparado (socket worked)
   - ⚠️ DIRECTO no disponible (socket unavailable, using shortcut)

---

## Quick Verification Commands

### Verify Socket Initialization Block Exists
```bash
cd c:\Users\soraf\Desktop\APPTIKTOK\live-control-app
grep -n "autoEnableDebugSocket" bridge/index.js
```

Expected output: Multiple matches including:
- Line ~132: In DEFAULT_CONFIG definition
- Line ~1241: In socket instantiation condition
- Line ~1244: In console.log message

### Verify Socket Priority Logic Exists
```bash
grep -n "🔌 DIRECTO" bridge/index.js
```

Expected output: Multiple matches in `executeChaosModEffect` function

### Verify All Three Changes
```bash
grep -c "autoEnableDebugSocket\|🔌 DIRECTO\|debug socket habilitado" bridge/index.js
```

Expected: Should show 3 or more total occurrences (all three changes present)

---

## Before/After Comparison

### Before Changes
```javascript
// OLD: Socket was never created
const chaosModDebugSocket = null

// OLD: Effect execution started with shortcut
try {
  console.log(`[bridge:chaosmod] 🔑 PRIMARY: Intentando atajo de teclado...`)
  // keyboard shortcut logic first (visual)
```

### After Changes
```javascript
// NEW: Socket created when enabled in config
const chaosModDebugSocket = bridgeConfig.chaosmod.autoEnableDebugSocket
  ? createChaosModDebugSocketClient(bridgeConfig.chaosmod)
  : null

// NEW: Effect execution tries socket FIRST
if (chaosModDebugSocket?.isConnected()) {
  console.log(`[bridge:chaosmod] 🔌 DIRECTO: Intentando trigger via debug socket...`)
  const triggered = chaosModDebugSocket.triggerEffect(messagePayload.gtaChaosEffectId)
  if (triggered) {
    console.log(`[bridge:chaosmod] ✅ DIRECTO: Efecto disparado sin menú`)
    return  // Exit here - no fallback needed
  }
}
// Falls back to shortcut/menu if socket unavailable
```

---

## Configuration Merge Verification

### How Config Works

User's `bridge-config.json` (without socket settings):
```json
{
  "chaosmod": {
    "enabled": true,
    "modPath": "...",
    "allowMenuFallback": true
  }
}
```

DEFAULT_CONFIG in `bridge/index.js` (WITH socket settings):
```javascript
{
  chaosmod: {
    enabled: true,
    modPath: '...',
    preferShortcutTrigger: true,
    autoEnableDebugSocket: true,        // ← From DEFAULT
    debugSocketPort: 31819,             // ← From DEFAULT
    allowMenuFallback: true,
  }
}
```

Config merge result (AFTER merge):
```javascript
{
  // User's settings override defaults
  enabled: true,                        // From user
  modPath: "...",                       // From user
  allowMenuFallback: true,              // From user
  
  // Defaults fill in the rest if not provided
  preferShortcutTrigger: true,          // From DEFAULT
  autoEnableDebugSocket: true,          // ← From DEFAULT - ENABLED
  debugSocketPort: 31819,               // ← From DEFAULT - ENABLED
  shortcutReloadDelayMs: 850,           // From DEFAULT
  // ... etc
}
```

**Result**: Socket settings are AUTOMATICALLY ENABLED even if user's bridge-config.json doesn't have them ✅

---

## Testing the Integration

### Test 1: Verify Socket Initialization
```
Expected Log Output:
[chaosmod] debug socket habilitado en ws://127.0.0.1:31819
```

**To See This**: Start bridge server and watch terminal

### Test 2: Verify Socket Works When Effect Triggered
```
Expected Log Output:
[bridge:chaosmod] 🔌 DIRECTO: Intentando trigger via debug socket...
[bridge:chaosmod] ✅ DIRECTO: Efecto disparado sin menú via debug socket
```

**To See This**: Click Test on a ChaosMod action in dashboard

### Test 3: Verify Socket Fallback Works
```
Expected Log Output:
[bridge:chaosmod] 🔌 DIRECTO: Intentando trigger via debug socket...
[bridge:chaosmod] ⚠️ DIRECTO no disponible, continuando con atajo/menu
[bridge:chaosmod] 🔑 PRIMARY: Intentando atajo de teclado...
```

**When You See This**: Socket connection failed, using shortcut method (probably GTA not running)

---

## Verification Checklist

- [ ] Read bridge/index.js DEFAULT_CONFIG and confirm socket settings present
- [ ] Search for "autoEnableDebugSocket" and found at least 2 matches
- [ ] Search for "🔌 DIRECTO" and found socket check before shortcut logic
- [ ] Start bridge and see "[chaosmod] debug socket habilitado" message
- [ ] Click Test on a ChaosMod action
- [ ] See either socket success or fallback messages in bridge terminal
- [ ] Verify effect triggers and menu behavior matches expectation

---

## Questions?

If any of these code sections don't match what you see in bridge/index.js, let me know and we can troubleshoot.

The three changes are:
1. ✅ Socket enabled in DEFAULT_CONFIG
2. ✅ Socket instantiated at startup (not null)
3. ✅ Socket checked FIRST in executeChaosModEffect (before shortcuts)

All three must be present for socket-first execution to work.
