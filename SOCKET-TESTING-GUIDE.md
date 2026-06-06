# Quick Reference - Socket Integration Testing

## TL;DR

Your bridge now tries to trigger ChaosMod effects silently using a direct WebSocket connection (port 31819) instead of keyboard shortcuts. If the socket isn't available, it falls back to keyboard shortcuts.

---

## Start Testing

### 1. Verify Socket Configuration
```bash
# Check that socket settings are in DEFAULT_CONFIG
grep -n "autoEnableDebugSocket\|debugSocketPort" bridge/index.js
```

Expected output:
```
128:    autoEnableDebugSocket: true,
129:    debugSocketPort: 31819,
1242:  const chaosModDebugSocket = bridgeConfig.chaosmod.autoEnableDebugSocket
```

### 2. Start Bridge and Watch Logs
```bash
cd c:\Users\soraf\Desktop\APPTIKTOK\live-control-app
node bridge/index.js
```

Watch for:
```
[chaosmod] debug socket habilitado en ws://127.0.0.1:31819
```

### 3. Trigger an Effect
- Start backend: `node server/index.js`
- Launch GTA with ChaosMod
- Go to dashboard → Click "Test" on a ChaosMod action

### 4. Check Bridge Logs

**Socket Worked** ✅
```
[bridge:chaosmod] 🔌 DIRECTO: Intentando trigger via debug socket...
[bridge:chaosmod] ✅ DIRECTO: Efecto disparado sin menú via debug socket
```
→ Effect triggers silently (no menu visible)

**Socket Unavailable** ⚠️
```
[bridge:chaosmod] 🔌 DIRECTO: Intentando trigger via debug socket...
[bridge:chaosmod] ⚠️ DIRECTO no disponible, continuando con atajo/menu
[bridge:chaosmod] 🔑 PRIMARY: Intentando atajo de teclado...
```
→ Effect triggers via shortcut (menu may appear briefly)

---

## Key Logs to Watch

| Log | Meaning | Action |
|-----|---------|--------|
| `debug socket habilitado` | Socket initialized at startup | ✅ Good |
| `🔌 DIRECTO: Intentando` | Trying socket method | ✅ Normal |
| `✅ DIRECTO: Efecto disparado` | Socket worked, effect triggered silently | ✅ Best case |
| `⚠️ DIRECTO no disponible` | Socket not connected, using fallback | ⚠️ OK (fallback works) |
| `[chaosmod] debug socket no disponible` | Socket can't connect on startup | ⚠️ Check ChaosMod running |

---

## Visual Behavior

### Socket Method (Success) - BEST
- Effect triggers
- **NO menu opens on screen**
- No keyboard/arrow key navigation visible
- Takes ~1ms from trigger to execution
- **This is what you want to see**

### Keyboard Shortcut (Fallback) - ACCEPTABLE  
- Effect triggers
- Menu may briefly flash on screen
- Key combination briefly visible
- Takes ~2-3 seconds
- Still works but not silent

### Menu Navigation (Final Fallback) - WORST
- Effect triggers
- Menu clearly opens and stays open
- Arrow keys and "Enter" visible
- Takes 5+ seconds
- Only if shortcuts fail

---

## Quick Troubleshooting

### Problem: Socket not initializing
```
Where to look: Bridge logs at startup
Solution: Check if ChaosMod is running with .enabledebugsocket file
```

### Problem: Socket message but effect uses menu
```
Where to look: Bridge logs - socket success but no silent trigger
Solution: GTA/ChaosMod restart may be needed
```

### Problem: No logs at all
```
Where to look: Is bridge running?
Solution: Check terminal for any startup errors
```

---

## Expected Log Timeline

### At Bridge Startup
```
✓ [chaosmod] debug socket habilitado en ws://127.0.0.1:31819
```

### When You Click Test
```
✓ [backend] 🎯 POST /api/actions/:actionId/test INGRESÓ AL ENDPOINT
✓ [backend] 📊 Estado GTA actual: 1 bridge(s) conectado(s)
✓ [backend] 📤 Enviando evento GTA...
✓ [bridge:gta] 📥 RECIBIÓ EVENTO GTA
✓ [bridge:chaosmod] 🚀 EJECUTANDO EFECTO
✓ [bridge:chaosmod] 🔌 DIRECTO: Intentando trigger...
✓ [bridge:chaosmod] ✅ DIRECTO: Efecto disparado sin menú
```

---

## Success Checklist

- [ ] Bridge starts and shows socket init log
- [ ] Bridge shows "debug socket habilitado" message  
- [ ] Click Test on a ChaosMod action
- [ ] Bridge shows socket attempt log (🔌 DIRECTO)
- [ ] In-game: Effect triggers WITHOUT opening menu
- [ ] Bridge shows success log (✅ DIRECTO)

**If all checked**: Implementation working perfectly ✅

---

## Commands Reference

```bash
# Start backend
node server/index.js

# Start bridge in new terminal
node bridge/index.js

# Verify socket code (3 locations)
grep -n "autoEnableDebugSocket\|debugSocketPort" bridge/index.js

# Check socket priority logic
grep -n "🔌 DIRECTO" bridge/index.js

# Clear logs and restart (Windows)
cls && node bridge/index.js
```

---

## Configuration Override (if needed)

To disable socket and use shortcuts only:

Edit `bridge-config.json`:
```json
{
  "chaosmod": {
    "autoEnableDebugSocket": false
  }
}
```

Then restart bridge.

---

## Still Stuck?

1. Check SOCKET-INTEGRATION-COMPLETE.md for detailed explanation
2. Check SOCKET-VERIFICATION.md for code locations  
3. Check IMPLEMENTATION-STATUS.md for full technical details
4. Check bridge/index.js lines 128-129, 1242-1246, 1443-1450 for code

---

## Key Insight

The bridge now has **3 execution methods in priority order:**

1. **🔌 Socket (NEW)** - Direct, silent, fast
2. **🔑 Shortcut (OLD)** - Keyboard-based, visual, medium speed  
3. **📋 Menu (OLD)** - Manual navigation, very visual, slow

Everything works if any method succeeds. Socket is just the new preferred method.

---

**Next Step**: Run the tests above and report which logs you see.
