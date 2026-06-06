# GTA Integration Chain - Complete Audit & Test Plan

## Executive Summary

This document verifies the **COMPLETE END-TO-END CHAIN** from the test button click to GTA effect execution.

**The Chain** (5 stages with visible logs):
```
Frontend Test Button
    ↓
Backend Endpoint Handler (/api/actions/:actionId/test)
    ↓
Backend WebSocket Broadcast (gta-event)
    ↓
Bridge Receives Message & Executes PowerShell
    ↓
PowerShell Keyboard Injection → GTA Process → ChaosMod Effect
```

---

## Stage 1: Frontend Test Button

**Location**: `src/hooks/useDashboardController.js:798`

**Function**: `previewAction(action)`

**What Happens**:
1. User clicks "Test" button in action dashboard
2. Frontend logs: `[frontend] 🎬 ETAPA 1: Click botón Probar | action={...}`
3. POST request to `/api/actions/{actionId}/test` with body:
   ```json
   {
     "userName": "manual-preview",
     "comment": ""
   }
   ```

**Expected Output in Browser Console**:
```
[frontend] 🎬 ETAPA 1: Click botón Probar | action={id:..., name:..., gtaMode:..., gtaChaosEffectId:...}
```

---

## Stage 2: Backend Endpoint Handler

**Location**: `server/index.js:4021`

**Route**: `app.post('/api/actions/:actionId/test', ...)`

**What Happens**:
1. Backend receives POST request
2. Finds action by ID
3. Creates a manual event
4. Calls `dispatchAction(action, manualEvent, 'manual-test')`
5. Returns dispatch record with bridge results

**IMPORTANT LOGS** (watch terminal where backend runs):
```
════════════════════════════════════════════════════════════════════════════════
[backend] 🎯 ETAPA 2: POST /api/actions/{actionId}/test
[backend] Acción: {actionName}
[backend] Outputs: ["gta"]
[backend] GTA Mode: chaosmod
[backend] GTA Effect ID: {effectId}
[backend] Usuario: manual-test
════════════════════════════════════════════════════════════════════════════════
```

This proves the backend received the request.

---

## Stage 3: Backend → Bridge via WebSocket

**Location**: `server/index.js:2698` (inside `dispatchAction()`)

**What Happens**:
1. Backend checks if action outputs include 'gta'
2. Builds GTA payload
3. **Broadcasts via WebSocket**: `broadcast('gta', { type: 'gta-event', payload: gtaPayload })`
4. Checks how many bridge clients connected: `socketHubs.gta.size`

**CRITICAL LOGS** (in backend terminal):
```
[backend] 📤 Enviando evento GTA a {N} clientes conectados
[backend] Payload: action={actionName}, effect={effectId}, mode=chaosmod
[backend] ✅ Evento enviado a {N} bridge(s)
```

**OR if bridge not connected**:
```
[backend] ⚠️  No hay bridge conectado. El evento se emitió pero nadie lo recibió.
```

**This is the FIRST CRITICAL CHECK**: If you see "0 clientes conectados", the bridge is NOT running or NOT connected.

---

## Stage 4: Bridge Receives Event

**Location**: `bridge/index.js:1450` (function `handleGtaMessage()`)

**Prerequisites**:
- Bridge must be running: `node bridge/index.js`
- Bridge config must be valid: `bridge-config.json`
- Bridge must have connected to server (check logs on startup)

**What Happens**:
1. Bridge receives 'gta-event' message
2. Logs details about the event
3. Forwards to any GTA clients connected to local bridge server
4. If `gtaMode === 'chaosmod'`, calls `executeChaosModEffect()`

**CRITICAL LOGS** (in bridge terminal):
```
════════════════════════════════════════════════════════════════════════════════
[bridge:gta] 📥 RECIBIÓ EVENTO GTA
[bridge:gta] Acción: {actionName}
[bridge:gta] Effect ID: {effectId}
[bridge:gta] Effect Name: {effectName}
[bridge:gta] Mode: chaosmod
[bridge:gta] Reenviando a {N} clientes GTA locales conectados
════════════════════════════════════════════════════════════════════════════════
```

This proves the bridge received the message from backend.

---

## Stage 5: Bridge Executes Effect

**Location**: `bridge/index.js:1366` (function `executeChaosModEffect()`)

**Configuration Needed**:
- `bridge-config.json`:
  - `chaosmod.enabled`: true
  - `chaosmod.modPath`: Valid ChaosMod installation path
  - `chaosmod.gtaProcessName`: "GTA5" or "GTA5_Enhanced" (must match running process)
  - `chaosmod.preferShortcutTrigger`: true (use keyboard shortcuts)

**What Happens**:
1. Validates ChaosMod is configured
2. PRIMARY METHOD: Try keyboard shortcut injection
   - Finds or creates shortcut assignment for effect
   - Runs PowerShell to inject key combination into GTA
   - If successful: Logs `[bridge:chaosmod] ✅ ÉXITO`
   - If fails: Tries FALLBACK
3. FALLBACK METHOD: Menu navigation
   - Uses ChaosMod menu to navigate to effect
   - If successful: Logs `[bridge:chaosmod] ✅ FALLBACK`

**CRITICAL LOGS** (in bridge terminal - PRIMARY method):
```
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
[bridge:chaosmod] 🚀 EJECUTANDO EFECTO
[bridge:chaosmod] Effect ID: {effectId}
[bridge:chaosmod] Effect Name: {effectName}
[bridge:chaosmod] GTA Process: GTA5_Enhanced
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

[bridge:chaosmod] 🔑 PRIMARY: Intentando atajo de teclado...
[bridge:chaosmod] ✅ ÉXITO: Efecto disparado por atajo {keyCombo}
```

**OR if PRIMARY fails and uses FALLBACK**:
```
[bridge:chaosmod] ❌ Atajo falló: {error}
[bridge:chaosmod] 📋 FALLBACK: Intentando navegación de menú...
[bridge:chaosmod] ✅ FALLBACK: Efecto disparado por menú: {effectName}
```

**OR if ALL methods fail**:
```
[bridge:chaosmod] ❌ Atajo falló: {error}
[bridge:chaosmod] ❌❌ FALLO TOTAL: No pude disparar efecto {effectId}...
```

---

## Complete Test Procedure

### Prerequisites
- GTA V installed with ChaosMod mod
- Backend running: `npm run dev` (port 5123)
- Bridge NOT running yet

### Step 1: Start Backend
```bash
npm run dev
# Watch for:
# [app] 🚀 Server running...
# [socket] conectado (for overlay client)
```

### Step 2: Open Frontend UI
- Navigate to dashboard
- Find an action configured for GTA with ChaosMod

### Step 3: START BRIDGE IN SEPARATE TERMINAL
```bash
node bridge/index.js
# Watch for:
# [local:gta] escuchando en ws://127.0.0.1:6136
# [remote:gta] conectado (bridge connected to server)
```

### Step 4: Click "Test" Button on Action
- Click the action test button
- **Immediately watch BOTH terminals**

### Step 5: Check Backend Terminal (Stage 2 & 3)
Look for:
```
════════════════════════════════════════════════════════════════════════════════
[backend] 🎯 ETAPA 2: POST /api/actions/{actionId}/test
[backend] Acción: {actionName}
...
[backend] 📤 Enviando evento GTA a 1 clientes conectados
[backend] ✅ Evento enviado a 1 bridge(s)
════════════════════════════════════════════════════════════════════════════════
```

**If you see "0 clientes conectados"**: Bridge is not connected. Check it's running and check bridge-config.json.

### Step 6: Check Bridge Terminal (Stage 4 & 5)
Look for:
```
════════════════════════════════════════════════════════════════════════════════
[bridge:gta] 📥 RECIBIÓ EVENTO GTA
[bridge:gta] Acción: {actionName}
[bridge:gta] Effect ID: {effectId}
...
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
[bridge:chaosmod] 🚀 EJECUTANDO EFECTO
...
[bridge:chaosmod] ✅ ÉXITO: Efecto disparado por atajo {keyCombo}
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
```

### Step 7: Check GTA
- The effect should execute in-game
- You should see the ChaosMod effect trigger

---

## Troubleshooting Guide

### Issue: "0 clientes conectados" in Backend

**Cause**: Bridge is not running or not connected to server

**Solution**:
1. Start bridge: `node bridge/index.js`
2. Watch for: `[remote:gta] conectado` in bridge terminal
3. Retry test button

### Issue: Backend shows "1 clientes" but Bridge doesn't receive anything

**Cause**: Bridge received connection event but message routing failed

**Solution**:
1. Check bridge is in same `serverBaseUrl`: `bridge-config.json`
2. Check `dashboardKey` matches between frontend and bridge (if configured)
3. Restart both backend and bridge

### Issue: Bridge receives event but logs show "❌ Atajo falló"

**Causes**:
1. GTA process not running
2. Process name doesn't match (check `gtaProcessName` in `bridge-config.json`)
3. ChaosMod mod not loaded
4. Keyboard shortcut conflict

**Solutions**:
1. Verify GTA is running: `Get-Process | grep -i gta` (Windows) or `ps aux | grep -i gta` (Unix)
2. Verify process name matches config
3. Check ChaosMod is loaded: `/chaosmod` command in-game should work
4. Check shortcut assignments: Look for `.shortcutPool` in config

### Issue: Bridge shows FALLBACK instead of PRIMARY

**Cause**: Keyboard shortcut method failed, using menu navigation instead

**Status**: This is OK - effect should still execute but may take longer

### Issue: No logs at all

**Causes**:
1. Backend not running
2. Bridge not running
3. Action not configured for GTA

**Solutions**:
1. Start backend: `npm run dev`
2. Start bridge: `node bridge/index.js`
3. Check action has `outputs: ['gta']` and `gtaMode: 'chaosmod'`

---

## Configuration Checklist

### bridge-config.json
- [ ] `serverBaseUrl`: Points to running backend (or Railway URL)
- [ ] `gta.enabled`: true
- [ ] `gta.localBridgePort`: 6136 (or your configured port)
- [ ] `chaosmod.enabled`: true
- [ ] `chaosmod.modPath`: Valid path to ChaosMod
- [ ] `chaosmod.gtaProcessName`: Matches running GTA process (GTA5 or GTA5_Enhanced)
- [ ] `chaosmod.preferShortcutTrigger`: true

### Action Configuration
- [ ] Action has `outputs: ['gta']`
- [ ] Action has `gtaMode: 'chaosmod'`
- [ ] Action has valid `gtaChaosEffectId`
- [ ] `gtaChaosEffectId` exists in ChaosMod catalog

### Running Processes
- [ ] Backend is running on port 5123
- [ ] Bridge is running: `node bridge/index.js`
- [ ] GTA V is running (if testing live execution)
- [ ] ChaosMod is loaded in GTA

---

## Log Locations

**Backend Logs**: Terminal where you ran `npm run dev`

**Bridge Logs**: Terminal where you ran `node bridge/index.js`

**Frontend Logs**: Browser Developer Console (F12 → Console tab)

**Server Logs File**: `storage/dev-runtime.err` (if background process)

---

## Expected Timeline

When you click "Test":

1. **Immediate (0ms)**: Frontend console shows ETAPA 1
2. **Immediate (0-50ms)**: Backend terminal shows ETAPA 2 + endpoint handler logs
3. **Immediate (10-100ms)**: Backend logs broadcast to GTA channel
4. **Immediate (50-150ms)**: Bridge terminal shows received event
5. **50-500ms**: Bridge executes PowerShell command
6. **100-1000ms**: GTA window gets keyboard input → ChaosMod effect triggers
7. **0-5000ms**: In-game animation/effect plays out

If you don't see logs at each stage, that's where the chain breaks.

---

## Next Steps if Chain Broken

If you reach a stage where logs stop appearing:

1. **Logs stop at Stage 2**: Frontend→Backend connection issue
   - Check network tab in browser console
   - Check CORS settings
   - Verify backend is running

2. **Logs stop at Stage 3**: Backend→Bridge connection issue
   - Verify bridge is connected (look for `[remote:gta] conectado`)
   - Check `serverBaseUrl` in `bridge-config.json`
   - Check `dashboardKey` if required

3. **Logs stop at Stage 5**: PowerShell execution issue
   - Verify GTA process name is correct
   - Verify ChaosMod is loaded
   - Try FALLBACK method (menu navigation)

4. **All logs present but effect doesn't execute**: 
   - GTA may be minimized or different window
   - ChaosMod may require manual activation
   - Keyboard injection may be blocked by OS

---

## Current Status

✅ **Complete Chain Implemented**:
- Frontend: Test button with logs
- Backend: Endpoint with broadcast
- Bridge: Receives and executes
- PowerShell: Keyboard injection
- Logs: Visible at each stage

❓ **What Still Needs Verification**:
- Does PowerShell keyboard injection actually reach GTA window?
- Does GTA/ChaosMod pick up the injected keystrokes?
- Are effect IDs correctly mapped in ChaosMod catalog?
- Is the test working end-to-end in your environment?

---

## Questions for User

To help debug further:

1. Is `node bridge/index.js` currently running in terminal?
2. When you click Test, does backend log show "1 clientes conectados"?
3. Does bridge terminal show "[bridge:gta] 📥 RECIBIÓ EVENTO GTA" messages?
4. When bridge executes, does it show ✅ ÉXITO or ❌ error?
5. Is GTA window active when test button is clicked?
6. If effect should execute, does anything change in-game?
