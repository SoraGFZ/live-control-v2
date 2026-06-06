# Development Guide - Self-Contained Desktop Architecture

This guide explains how the refactored app components work together for developers.

## Quick Reference

### When User Launches App

```
double-click .exe
    ↓
Windows: Run installer
    ↓
electron/main.cjs starts
    ↓
✅ spawn process: node server/index.js (Express backend)
✅ spawn process: node bridge/index.js (WebSocket client)
✅ show loading window
✅ load React app from dist/
    ↓
React frontend boots
    ↓
useServiceHealth hook starts polling /api/health/*
    ↓
ServiceStatusIndicator component renders status
    ↓
Test buttons enabled (if healthy) or disabled (if not)
```

## Key Files & Their Roles

### src/hooks/useServiceHealth.js
**What it does**: Continuously monitors backend, bridge, and GTA status

**Key exports**:
```javascript
export function useServiceHealth(dashboardAccessKey, options) {
  // Returns object with:
  return {
    health: {
      server: { online, uptime, lastCheck, lastError },
      bridge: { online, minecraftClientsConnected, gtaClientsConnected, ... },
      gta: { detected, chaosmod: { enabled, reachable, ... }, ... },
      isHealthy: true/false,  // true if server AND (bridge OR gta)
      lastStatusChange: timestamp
    },
    isServerReady: () => boolean,
    isBridgeReady: () => boolean,
    isGtaReady: () => boolean,
    canTestActions: () => boolean,
    getTestButtonDisabledReason: () => string
  }
}
```

**Usage in component**:
```javascript
const { health, canTestActions } = useServiceHealth(dashboardAccessKey)

// Disable test button if not healthy
<button disabled={!canTestActions()}>Test</button>

// Show status
<ServiceStatusIndicator health={health} compact={false} />
```

### src/components/ServiceStatusIndicator.jsx
**What it does**: Renders visual indicators for service health

**Modes**:
```javascript
// Compact mode (for header)
<ServiceStatusIndicator health={health} compact={true} />

// Expanded mode (for dashboard)
<ServiceStatusIndicator health={health} compact={false} showDetails={true} />
```

**Visual elements**:
- Green circle + icon: Service online/detected
- Red circle + icon: Service offline/not detected
- Badge with number: Number of connected clients
- Warning message: When services initializing
- Tooltip on hover: Full status message

### server/index.js - Health Endpoints
**Added lines**: ~110 (around line 4342)

**Three new endpoints**:

```javascript
// GET /api/health
// Returns: { ok, timestamp, uptime, server: { port, isRunning } }

// GET /api/health/bridge
// Returns: { ok, bridge: { online, minecraftClientsConnected, gtaClientsConnected, totalClients, warning } }

// GET /api/health/gta
// Returns: { ok, gta: { detected, chaosmod: { enabled, reachable, httpEndpoint, testError }, bridgeConnected, warning } }
```

**Behind the scenes**:
- `/api/health`: Simply returns that server is running
- `/api/health/bridge`: Checks `socketHubs.minecraft.size` and `socketHubs.gta.size`
- `/api/health/gta`: Reads `bridge-config.json`, probes ChaosMod HTTP endpoint with test request

### electron/main.cjs - Process Management
**Already implemented**: Process spawning is already done (no changes needed)

**Functions that handle it**:
- `startNodeService(serviceName, relativeScriptPath, extraEnv)` - Spawns child process
- `waitForBackendReady(timeoutMs)` - Polls `/api/status` until backend responds
- `bootDesktopApp()` - Main sequence: starts backend, waits, starts bridge
- `createMainWindow()` - Loads loading window, then frontend

## Integration Points

### In useDashboardController.js

```javascript
// Hook added at line ~203
const { health: serviceHealth, canTestActions } = useServiceHealth(dashboardAccessKey, {
  pollingIntervalMs: 3000,
})

// Exposed in return object at line ~1252
return {
  // ... other properties
  serviceHealth,      // Full health state object
  canTestActions,     // Function to check if testing allowed
  // ... rest of properties
}
```

### In components using the controller

```javascript
function MyComponent() {
  const controller = useDashboardController()
  
  // Check if test actions are allowed
  if (!controller.canTestActions()) {
    return <p>Initializing services...</p>
  }
  
  // Show status indicators
  return (
    <>
      <ServiceStatusIndicator health={controller.serviceHealth} />
      <button onClick={() => controller.previewAction(action)}>
        Test Action
      </button>
    </>
  )
}
```

## Environment Variables

### For Backend (set by electron/main.cjs)
```javascript
PORT=5123                              // Server port
LIVE_CONTROL_DESKTOP_MODE=1           // Indicates running as desktop app
LIVE_CONTROL_STORAGE_DIR=...          // Path to userData/storage
LIVE_CONTROL_DASHBOARD_URL=http://... // Frontend URL
LIVE_CONTROL_DESKTOP_TOKEN=...        // Secret token for auth
```

### For Bridge (set by electron/main.cjs)
```javascript
LIVE_CONTROL_BRIDGE_CONFIG=           // Path to bridge-config.json
```

## Configuration Files

### bridge-config.json
Located in userData directory (not shipped in git, created on first run)

```json
{
  "serverBaseUrl": "http://127.0.0.1:5123",
  "chaosmod": {
    "enabled": true,
    "modPath": "C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod",
    "localHttpHost": "127.0.0.1",
    "localHttpPort": 8082,
    "localHttpPath": "/trigger_effect",
    "localHttpTokenHeader": "Superdupertoken",
    "localHttpToken": "glory to ukraine"
  }
}
```

### bridge-config.example.json
Shipped in repo as template. Used to create user's bridge-config.json on first run.

## Testing the Health System

### Test health endpoints manually
```bash
# In terminal while app is running
curl http://127.0.0.1:5123/api/health
curl http://127.0.0.1:5123/api/health/bridge
curl http://127.0.0.1:5123/api/health/gta
```

### Simulate service failure
```bash
# While app is open, kill bridge process
taskkill /PID <bridge_pid> /F

# Wait 3 seconds
# Frontend should detect failure
# UI should show "Bridge: offline"
# Test buttons should disable
```

### Debug health polling
Open browser DevTools (F12) while app is running:

```javascript
// In console, can inspect service health state directly
// The fetch calls are logged in Network tab
// Look for /api/health* requests every 3 seconds
```

## Common Issues & Solutions

### Health endpoints returning 401
- **Cause**: Dashboard access key not provided
- **Solution**: Frontend includes header `x-live-control-key: {key}`

### Bridge always offline
- **Cause**: No WebSocket clients connected
- **Solution**: Ensure bridge process started and can connect to backend

### GTA not detected
- **Cause**: ChaosMod HTTP endpoint not responding
- **Solution**: 
  - Open GTA V with ChaosMod running
  - Verify endpoint settings in bridge-config.json
  - Check firewall allows localhost:8082

### High memory usage
- **Cause**: Polling every 3 seconds might be too frequent
- **Solution**: Adjust `pollingIntervalMs` in useServiceHealth call (increase to 5000)

## Adding Features to This Architecture

### New health check (e.g., Minecraft RCON)
1. Add new endpoint in server/index.js:
   ```javascript
   app.get('/api/health/minecraft', (_request, response) => {
     response.json({
       ok: true,
       minecraft: {
         rconConnected: minecraftRconStatus.connected,
         lastError: minecraftRconStatus.lastError
       }
     })
   })
   ```

2. Extend useServiceHealth to check it:
   ```javascript
   // In performHealthCheck()
   const minecraftCheck = await checkHealthEndpoint('/api/health/minecraft')
   updates.minecraft = minecraftCheck.data?.minecraft || {}
   ```

3. Render in UI:
   ```javascript
   <ServiceStatusIndicator health={{...health, minecraft}} />
   ```

### New auto-recovery feature
1. In electron/main.cjs, add restart logic:
   ```javascript
   if (bridgeService && bridgeService.child.exitCode !== null) {
     console.log('Bridge crashed, restarting...')
     bridgeService = startNodeService('bridge', path.join('bridge', 'index.js'), envVars)
   }
   ```

2. Run check periodically:
   ```javascript
   setInterval(checkAndRestartServices, 10000)
   ```

## Performance Tuning

| Issue | Setting | Value | Impact |
|-------|---------|-------|--------|
| High CPU | pollingIntervalMs | 5000 | Less frequent checks |
| High memory | - | Reduce number of status properties | Less data stored |
| Network heavy | - | Batch health checks | Fewer HTTP requests |
| Sluggish UI | health update frequency | Throttle setHealth | Smoother rendering |

## Debugging with Logs

### Location
```
Windows: C:\Users\{user}\AppData\Roaming\Live Control Beta\runtime-logs\
```

### Files
- backend.log - All console.log from Express
- backend.err.log - All stderr from Express
- bridge.log - All console.log from bridge
- bridge.err.log - All stderr from bridge

### Tail logs in real-time
```bash
# Windows PowerShell
Get-Content "path\to\backend.log" -Wait -Tail 20

# Or just open in text editor and refresh
```

## Relationship to Original Code

The refactoring adds:
- ✅ Automatic process management (already in main.cjs)
- ✅ Health monitoring (NEW: useServiceHealth hook, backend endpoints)
- ✅ Visual status feedback (NEW: ServiceStatusIndicator component)
- ✅ Test button validation (NEW: canTestActions helper)

It does NOT change:
- ✅ How actions/triggers work
- ✅ How TikTok integration works
- ✅ How Minecraft RCON commands execute
- ✅ How ChaosMod effects are triggered
- ✅ Data persistence (localStorage, state store)
- ✅ WebSocket broadcasts to overlays

## Summary

This architecture allows users to:
1. **Install app** - One-click Windows installer
2. **Run app** - All services start automatically
3. **See status** - Visual indicators show health
4. **Test features** - Test button disabled until ready
5. **Get help** - Error messages guide troubleshooting

For developers, it provides:
1. **Clear monitoring** - Health endpoints expose service state
2. **Easy testing** - Simple HTTP requests confirm functionality
3. **Scalable design** - New health checks added without touching UI
4. **Professional feedback** - Users informed of exact status

Everything works "out of the box" - no manual command execution required.
