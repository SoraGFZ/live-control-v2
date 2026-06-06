/**
 * Roblox Climb - TikControl Integration Module
 *
 * Flow: TikTok Gift → TikControl App → API Relay (POST) → Roblox Game (GET poll)
 * HUD:  Roblox Game → POST /state → HUD Overlay (GET /state poll)
 */

const { ipcMain } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
const GAME_ID = 'roblox-climb';
const API_RELAY_URL = 'http://127.0.0.1:43123/api/roblox';

// Active game keys per profile
const activeGameKeys = new Map();

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();

    // Re-register saved key and push saved config on startup (relay is in-memory, resets on restart)
    setTimeout(async () => {
        const savedKey = getGameKey('default');
        if (savedKey) {
            try {
                await registerGameKey(savedKey);
                console.log('[roblox-climb] Key re-registrada en relay al iniciar:', savedKey.substring(0, 8) + '...');
            } catch (_) {}
        }
        // Push saved display config so Roblox HUD columns populate immediately
        try {
            const climbConfig = readClimbConfig();
            if (climbConfig && climbConfig.gifts && Object.keys(climbConfig.gifts).length > 0) {
                const enrichedGifts = buildEnrichedGifts(climbConfig.gifts);
                const displayCfg = { ...climbConfig, gifts: enrichedGifts || climbConfig.gifts };
                await pushDisplayConfig(displayCfg);
                console.log('[roblox-climb] Display config re-pushed al iniciar');
            }
        } catch (_) {}
    }, 2000);

    console.log('[roblox-climb] Modulo inicializado');
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────

function getConfigPath() {
    return path.join(require('electron').app.getPath('userData'), 'electron-config.json');
}

function getClimbConfigPath() {
    return path.join(require('electron').app.getPath('userData'), 'roblox-climb-config.json');
}

function readConfig() {
    try {
        const p = getConfigPath();
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) {}
    return {};
}

function writeConfig(config) {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

function readClimbConfig() {
    try {
        const p = getClimbConfigPath();
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) {}
    return { sounds: {}, gifts: {} };
}

function writeClimbConfig(config) {
    fs.writeFileSync(getClimbConfigPath(), JSON.stringify(config, null, 2));
}

function getGameKey(profileId) {
    if (profileId && activeGameKeys.has(profileId)) return activeGameKeys.get(profileId);
    if (activeGameKeys.has('default')) return activeGameKeys.get('default');

    const config = readConfig();
    const key = (profileId && config[`${GAME_ID}_gamekey_${profileId}`])
        || config[`${GAME_ID}_gamekey`]
        || null;
    if (key) {
        activeGameKeys.set(profileId || 'default', key);
        activeGameKeys.set('default', key);
    }
    return key;
}

function saveGameKey(gameKey, profileId) {
    const config = readConfig();
    if (profileId) {
        config[`${GAME_ID}_gamekey_${profileId}`] = gameKey;
    }
    config[`${GAME_ID}_gamekey`] = gameKey;
    writeConfig(config);
    if (profileId) activeGameKeys.set(profileId, gameKey);
    activeGameKeys.set('default', gameKey);
    console.log('[roblox-climb] Game key guardada:', gameKey.substring(0, 8) + '...');
}

// ─── API RELAY ───────────────────────────────────────────────────────────────

function postToRelay(endpoint, payload) {
    const body = JSON.stringify(payload);
    const url = new URL(`${API_RELAY_URL}${endpoint}`);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? require('https') : http;

    return new Promise((resolve, reject) => {
        const req = transport.request({
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch (_) { resolve({ success: true }); }
                } else {
                    reject(new Error(`API relay HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error('[roblox-climb] Error API relay:', err.message);
            reject(new Error(`No se pudo enviar al relay API: ${err.message}`));
        });

        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout al enviar al relay')); });
        req.write(body);
        req.end();
    });
}

// ─── CMD_MAP (shared between config push and display config) ────────────────
const CMD_MAP = {
    subida:         { field: 'platforms', sign: 1, side: 'left' },
    bajada:         { field: 'platforms', sign: -1, side: 'right' },
    win_add:        { field: 'wins', sign: 1, side: 'left', respawn: true },
    win_remove:     { field: 'wins', sign: -1, side: 'right', respawn: true },
    subida_top:     { field: 'platforms', sign: 1, side: 'left', isTop: true },
    bajada_top:     { field: 'platforms', sign: -1, side: 'right', isTop: true },
    win_add_top:    { field: 'wins', sign: 1, side: 'left', isTop: true, respawn: true },
    win_remove_top: { field: 'wins', sign: -1, side: 'right', isTop: true, respawn: true },
    muro:           { action: 'wall', side: 'right' },
    carcel:         { action: 'jail', side: 'right' },
    free:           { action: 'free', side: 'left' },
    bailar:         { action: 'dance', side: 'right' },
    stop_bailar:    { action: 'stop_dance', side: 'left' },
};

// Build enriched gift config from raw climb config (adds side, isTop, etc.)
function buildEnrichedGifts(rawGifts) {
    if (!rawGifts) return null;
    const gifts = {};
    for (const [cmdId, cmdCfg] of Object.entries(rawGifts)) {
        const map = CMD_MAP[cmdId];
        if (!map) continue;

        const gift = {
            display: cmdCfg.display || cmdId,
            side: map.side,
        };

        if (map.field === 'platforms' && cmdCfg.value != null) {
            gift.platforms = cmdCfg.value * map.sign;
        }
        if (map.field === 'wins' && cmdCfg.value != null) {
            gift.wins = cmdCfg.value * map.sign;
        }
        if (map.isTop) {
            gift.isTop = true;
            gift.hp = cmdCfg.hp || 100;
        }
        if (map.respawn) gift.respawn = true;
        if (map.action) {
            gift.action = map.action;
            if (map.action === 'wall') gift.wallHP = cmdCfg.value || 100;
            if (map.action === 'jail' || map.action === 'dance') gift.duration = cmdCfg.value || 10;
        }
        // Pass image URL for HUD display
        if (cmdCfg.imageUrl) gift.imageUrl = cmdCfg.imageUrl;
        if (cmdCfg.imageId) gift.imageId = cmdCfg.imageId;

        gifts[cmdId] = gift;
    }
    return gifts;
}

// ─── COMMAND EXECUTION ───────────────────────────────────────────────────────

async function executeCommand(commandId, parameters = {}) {
    const viewerName = parameters.viewerName || parameters.name || parameters.username || 'TikControl';
    const profileId = parameters.profileId || 'default';
    const gameKey = getGameKey(profileId);

    if (!gameKey) {
        throw new Error('No hay game key configurada. Genera o introduce una Game Key en la configuracion.');
    }

    // Build event with command-specific parameters from TikControl config
    const event = {
        type: 'gift',
        giftId: commandId,
        viewer: viewerName,
        quantity: parameters.quantity || 1,
        timestamp: Date.now(),
    };

    // Map generic 'value' field to the correct event parameter using CMD_MAP
    const map = CMD_MAP[commandId];
    if (map && parameters.value != null) {
        const val = parseInt(parameters.value);
        if (map.field === 'platforms') event.platforms = val * map.sign;
        else if (map.field === 'wins') event.wins = val * map.sign;
        else if (map.action === 'wall') event.wallHP = val;
        else if (map.action === 'jail' || map.action === 'dance') event.duration = val;
    }
    // Also accept explicit parameter names (backwards compat)
    if (parameters.platforms != null) event.platforms = parseInt(parameters.platforms);
    if (parameters.wins != null) event.wins = parseInt(parameters.wins);
    if (parameters.hp != null) event.hp = parseInt(parameters.hp);
    if (parameters.wallHP != null) event.wallHP = parseInt(parameters.wallHP);
    if (parameters.duration != null) event.duration = parseInt(parameters.duration);
    if (parameters.display) event.display = parameters.display;
    if (parameters.imageUrl) event.imageUrl = parameters.imageUrl;

    console.log('[roblox-climb] Enviando evento:', commandId, 'viewer:', viewerName, 'key:', gameKey.substring(0, 8) + '...');

    await postToRelay('/events', {
        gameKey: gameKey,
        event: event,
    });

    return { success: true, message: `Evento '${commandId}' enviado a Roblox`, command: commandId };
}

async function sendConfigUpdate(profileId, configData) {
    const gameKey = getGameKey(profileId);
    if (!gameKey) throw new Error('No hay game key configurada');

    await postToRelay('/events', {
        gameKey: gameKey,
        event: { type: 'config', data: configData, timestamp: Date.now() },
    });
    return { success: true };
}

// Register the game key with the relay so Roblox can auto-connect
async function registerGameKey(gameKey) {
    await postToRelay('/register', { gameKey });
    console.log('[roblox-climb] Key registrada en relay para auto-connect');
}

// Push gift display config to the relay (for HUD overlay)
async function pushDisplayConfig(config) {
    await postToRelay('/config', { config });
    console.log('[roblox-climb] Display config pushed to relay');
}

// ─── IPC HANDLERS ────────────────────────────────────────────────────────────

function registerIpcHandlers() {
    ipcMain.handle('roblox-climb:isConnected', async (event, profileId) => {
        const gameKey = getGameKey(profileId);
        if (!gameKey) return false;
        try {
            await postToRelay('/status', { gameKey });
            return true;
        } catch (_) {
            return !!gameKey;
        }
    });

    ipcMain.handle('roblox-climb:executeEffect', async (event, command, parameters = {}) => {
        return await executeCommand(command, parameters);
    });

    ipcMain.handle('roblox-climb:setGameKey', async (event, profileId, gameKey) => {
        if (!gameKey && typeof profileId === 'string' && profileId.length > 10) {
            gameKey = profileId;
            profileId = 'default';
        }
        if (!gameKey) return { success: false, error: 'No game key provided' };
        saveGameKey(gameKey, profileId);
        // Auto-register with relay so Roblox can pick it up without /key command
        try { await registerGameKey(gameKey); } catch (_) {}
        return { success: true, gameKey };
    });

    ipcMain.handle('roblox-climb:getGameKey', async (event, profileId) => {
        const key = getGameKey(profileId);
        return key ? { gameKey: key, success: true } : null;
    });

    ipcMain.handle('roblox-climb:sendConfig', async (event, profileId, configData) => {
        return await sendConfigUpdate(profileId, configData);
    });

    ipcMain.handle('roblox-climb:generateGameKey', async () => {
        const crypto = require('crypto');
        const gameKey = 'tc_' + crypto.randomBytes(16).toString('hex');
        return { gameKey };
    });

    // ─── Config management (sounds, gift display, etc.) ─────────────────────

    ipcMain.handle('roblox-climb:getClimbConfig', async () => {
        return readClimbConfig();
    });

    ipcMain.handle('roblox-climb:saveClimbConfig', async (event, config) => {
        writeClimbConfig(config);

        // Build enriched gift config with side, isTop, etc. for both display and game config
        const enrichedGifts = buildEnrichedGifts(config.gifts);

        // Push display config to relay (for Roblox HUD columns)
        // Must include enriched gifts with 'side' so HudController knows left/right
        try {
            const displayCfg = { ...config, gifts: enrichedGifts || config.gifts };
            await pushDisplayConfig(displayCfg);
        } catch (_) {}

        // Also push game config changes to Roblox via events (for Config.GIFTS override)
        try {
            const gameKey = getGameKey('default');
            if (gameKey) {
                const gameConfig = {};
                if (config.winTarget) gameConfig.winTarget = config.winTarget;
                if (config.totalPlatforms) gameConfig.totalPlatforms = config.totalPlatforms;
                if (config.winCountdown) gameConfig.winCountdown = config.winCountdown;
                if (enrichedGifts) gameConfig.gifts = enrichedGifts;

                await sendConfigUpdate('default', gameConfig);
                console.log('[roblox-climb] Game config pushed to Roblox');
            }
        } catch (e) {
            console.warn('[roblox-climb] Error pushing game config:', e.message);
        }

        return { success: true };
    });

    // ─── HUD Config ─────────────────────────────────────────────────────────
    ipcMain.handle('roblox-climb:getHudConfig', async (event, profileId) => {
        const config = readConfig();
        const key = profileId ? `${GAME_ID}_hud_${profileId}` : `${GAME_ID}_hud`;
        return config[key] || null;
    });

    ipcMain.handle('roblox-climb:saveHudConfig', async (event, profileId, hudConfig) => {
        const config = readConfig();
        const key = profileId ? `${GAME_ID}_hud_${profileId}` : `${GAME_ID}_hud`;
        config[key] = hudConfig;
        config[`${GAME_ID}_hud`] = hudConfig; // Also save as default
        writeConfig(config);

        // Push HUD config to relay - MERGE with existing gifts so we don't lose them
        try {
            const climbConfig = readClimbConfig();
            const enrichedGifts = buildEnrichedGifts(climbConfig.gifts);
            await pushDisplayConfig({
                hud: hudConfig,
                gifts: enrichedGifts || {},
            });
        } catch (_) {}
        return { success: true };
    });

    // ─── Connection status ────────────────────────────────────────────────
    ipcMain.handle('roblox-climb:getConnectionStatus', async (event, profileId) => {
        const gameKey = getGameKey(profileId);
        return !!gameKey;
    });

    // Auto-register on save so Roblox can auto-connect
    ipcMain.handle('roblox-climb:registerKey', async (event, gameKey) => {
        try {
            await registerGameKey(gameKey);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
}

function shutdown() {
    activeGameKeys.clear();
    console.log('[roblox-climb] Modulo cerrado');
}

module.exports = { initialize, shutdown, executeCommand, GAME_ID };
