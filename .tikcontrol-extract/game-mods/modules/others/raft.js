/**
 * Raft - TikControl Integration Module
 * The game mod DLL (RaftTikTok.dll) runs an HTTP server on port 55001.
 * TikControl sends commands via POST http://127.0.0.1:55001/{endpoint}
 *
 * Mod folder structure in game dir:
 *   TikControl_Raft/   ← DLLs (doorstop target)
 *   TCT_Raft/          ← Assets required by RaftTikTok.dll (legacy: S2E_Raft/)
 *   winhttp.dll        ← Doorstop proxy
 *   doorstop_config.ini
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

let mainWindow = null;
const GAME_ID = 'raft';
const STEAM_APP_ID = 648800;
const HTTP_PORT = 55001;
const SUPER_TOKEN = 'streamtoearn.io';
const ORIGIN = 'https://app.streamtoearn.io';

// Maps command id → { path: HTTP endpoint, effect: body effect value }
// Each command has its own endpoint on the DLL's HTTP server.
// Spawn entities use /spawn with entity name as effect.
const COMMAND_MAP = {
    // ─── Spawn animals (POST /spawn, effect = entity name) ───
    'spawn_shark':          { path: '/spawn', effect: 'shark' },
    'spawn_giant_shark':    { path: '/giantshark' },
    'spawn_megalodon':      { path: '/megalodon' },
    'spawn_goat':           { path: '/spawn', effect: 'Goat' },
    'spawn_chicken':        { path: '/spawn', effect: 'Chicken' },
    'spawn_dolphin':        { path: '/spawn', effect: 'Dolphin' },
    'spawn_whale':          { path: '/spawn', effect: 'Whale' },
    'spawn_polar_bear':     { path: '/spawn', effect: 'PolarBear' },
    'spawn_mama_bear':      { path: '/spawn', effect: 'MamaBear' },
    'spawn_hyena':          { path: '/spawn', effect: 'Hyena' },
    'spawn_hyena_boss':     { path: '/spawn', effect: 'HyenaBoss' },
    'spawn_llama':          { path: '/spawn', effect: 'Llama' },
    'spawn_pig':            { path: '/spawn', effect: 'Pig' },
    'spawn_pufferfish':     { path: '/spawn', effect: 'PufferFish' },
    'spawn_turtle':         { path: '/spawn', effect: 'Turtle' },
    'spawn_stingray':       { path: '/spawn', effect: 'Stingray' },
    'spawn_rat':            { path: '/spawn', effect: 'Rat' },
    'spawn_roach':          { path: '/spawn', effect: 'Roach' },
    'spawn_stone_bird':     { path: '/spawn', effect: 'StoneBird' },
    'spawn_stone_bird_caravan': { path: '/spawn', effect: 'StoneBird_Caravan' },
    'spawn_bird_pack':      { path: '/spawn', effect: 'BirdPack' },
    'spawn_barrel':         { path: '/spawnbarrel' },
    'exploding_pufferfish': { path: '/explodingpufferfish' },
    // ─── Weather (POST /weather, effect = type) ───
    'weather_calm':         { path: '/weather', effect: 'Calm' },
    'weather_rain':         { path: '/weather', effect: 'Rain' },
    'weather_big_waves':    { path: '/weather', effect: 'BigWaves' },
    'weather_default':      { path: '/weather', effect: 'Default' },
    // ─── Time ───
    'time_day':             { path: '/day' },
    'time_night':           { path: '/night' },
    'set_time':             { path: '/Time' },
    // ─── Player stats ───
    'heal':                 { path: '/heal' },
    'thirst':               { path: '/thirst' },
    'hunger':               { path: '/hunger' },
    'oxygen':               { path: '/oxygen' },
    'fullstat':             { path: '/fullstat' },
    // ─── Teleport ───
    'teleport_water':       { path: '/teleport-water' },
    'teleport_raft':        { path: '/teleport-raft' },
    // ─── Items ───
    'drop_item':            { path: '/dropitem' },
    'give_item':            { path: '/giveitem' },
    'give_item_random':     { path: '/giveitem', randomItem: true },
    'item_rain':            { path: '/itemrain' },
    'rain_medium_items':    { path: '/spawnmediumitem' },
    'rain_expensive_items': { path: '/spawnexpensiveitem' },
    'rain_cheap_items':     { path: '/spawncheapitem' },
    'drop_all_items':       { path: '/dropallitems' },
    'inventory_shuffle':    { path: '/inventoryshuffle' },
    // ─── Raft ───
    'push_raft':            { path: '/pushraft' },
    'rotate_raft':          { path: '/rotateraft' },
    'paint_raft':           { path: '/paintraft' },
    'break_block':          { path: '/breakblock' },
    'pickup_trash':         { path: '/pickuptrash' },
    // ─── Combat ───
    'kill_all_mobs':        { path: '/killall' },
    'kill_all_sharks':      { path: '/killsharks' },
    // ─── Physics ───
    'gravity':              { path: '/gravity' },
    'swim_speed':           { path: '/swimspeed' },
    'walk_speed':           { path: '/walkspeed' },
    'jump_speed':           { path: '/jumpspeed' },
    'reset_default':        { path: '/resetdefault' },
    // ─── Godmode ───
    'godmode_on':           { path: '/godmodeon' },
    'godmode_off':          { path: '/godmodeoff' },
};

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    console.log('[raft] Modulo inicializado');
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────

function getConfigPath() {
    return path.join(require('electron').app.getPath('userData'), 'electron-config.json');
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

function getGamePath(profileId) {
    const config = readConfig();
    if (profileId) {
        const val = config[`${GAME_ID}_game_path_${profileId}`];
        if (val) return val;
    }
    return config[`${GAME_ID}_game_path`] || null;
}

function saveGamePath(gamePath, profileId) {
    const config = readConfig();
    if (profileId) {
        config[`${GAME_ID}_game_path_${profileId}`] = gamePath;
    }
    config[`${GAME_ID}_game_path`] = gamePath;
    writeConfig(config);
    console.log('[raft] Ruta guardada:', gamePath);
}

function isModInstalled(profileId) {
    const gamePath = getGamePath(profileId);
    if (!gamePath) return false;
    // Accept either the new TCT_Raft asset folder (clean name, new bundle name)
    // or the legacy S2E_Raft folder so existing installs keep being detected.
    const hasAssets = fs.existsSync(path.join(gamePath, 'TCT_Raft', 'tcraftbundle.assets'))
        || fs.existsSync(path.join(gamePath, 'TCT_Raft', 'streamtoearn.assets'))
        || fs.existsSync(path.join(gamePath, 'S2E_Raft', 'streamtoearn.assets'));
    return fs.existsSync(path.join(gamePath, 'TikControl_Raft', 'RaftTikTok.dll'))
        && fs.existsSync(path.join(gamePath, 'winhttp.dll'))
        && hasAssets;
}

const RANDOM_ITEMS = [
    'Plank', 'Plastic', 'Rope', 'Nail', 'Scrap', 'Stone', 'Clay', 'Sand',
    'MetalOre', 'CopperOre', 'MetalIngot', 'CopperIngot', 'Glass', 'Bolt',
    'Hinge', 'CircuitBoard', 'Battery', 'Leather', 'Wool', 'Feather',
    'Palm_Leaf', 'Sword_Titanium', 'Bow', 'Arrow_Metal', 'Head_Light',
    'Flippers', 'OxygenBottle'
];

// ─── COMMAND EXECUTION ───────────────────────────────────────────────────────

async function executeCommand(commandId, parameters = {}) {
    const cmd = COMMAND_MAP[commandId];
    if (!cmd) {
        throw new Error(`[raft] Comando desconocido: ${commandId}`);
    }

    const viewerName = parameters.viewerName || parameters.name || 'TikControl';
    const endpoint = cmd.path;

    // Determinar el effect y si hay que repetir la petición
    let effect;
    let repeatCount = 1;

    if (cmd.randomItem) {
        // Item random: cada repetición elige un item diferente
        repeatCount = Math.max(1, Math.min(50, parseInt(parameters.quantity) || 1));
    } else if (parameters.item) {
        // Comandos con selector de item (give_item, drop_item)
        effect = String(parameters.item);
        repeatCount = Math.max(1, Math.min(50, parseInt(parameters.quantity) || 1));
    } else if (parameters.quantity !== undefined && parameters.quantity !== null) {
        // Comandos con valor numérico (heal, thirst, pushraft, etc.)
        effect = String(parameters.quantity);
    } else if (cmd.effect) {
        // Comandos con effect fijo (spawn_goat → 'Goat', weather_rain → 'Rain')
        effect = cmd.effect;
    }

    console.log('[raft] Ejecutando:', endpoint, 'effect:', effect || 'random', 'x' + repeatCount, '(id:', commandId + ')');

    // Enviar N peticiones (para items se repite, para otros solo 1)
    const results = [];
    for (let i = 0; i < repeatCount; i++) {
        const itemEffect = cmd.randomItem
            ? RANDOM_ITEMS[Math.floor(Math.random() * RANDOM_ITEMS.length)]
            : effect;

        const payload = { name: viewerName };
        if (itemEffect) payload.effect = itemEffect;

        const result = await _sendHttpRequest(endpoint, payload);
        results.push(result);

        // Pequeño delay entre peticiones múltiples para no saturar el DLL
        if (repeatCount > 1 && i < repeatCount - 1) {
            await new Promise(r => setTimeout(r, 150));
        }
    }

    return { success: true, message: `Comando '${commandId}' enviado x${repeatCount}`, command: commandId };
}

function _sendHttpRequest(endpoint, payload) {
    const body = JSON.stringify(payload);
    console.log('[raft] →', endpoint, body);

    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: HTTP_PORT,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'Superdupertoken': SUPER_TOKEN,
                'Origin': ORIGIN
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[raft] ←', res.statusCode, data, '(', endpoint, ')');
                if (res.statusCode === 200) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`Mod respondió con HTTP ${res.statusCode} en ${endpoint}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error('[raft] Error HTTP:', err.message);
            reject(new Error(`No se pudo enviar al mod de Raft. ¿Juego en ejecución? (${err.message})`));
        });

        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout al enviar comando')); });
        req.write(body);
        req.end();
    });
}

// ─── IPC HANDLERS ────────────────────────────────────────────────────────────

function registerIpcHandlers() {
    ipcMain.handle('raft:isConnected', async (event, profileId) => {
        try {
            const processWatcher = require('../../../modules/processWatcher');
            const running = processWatcher.getRunning();
            if (!running[GAME_ID]) return false;
            if (!isModInstalled(profileId)) return false;
            // Check if DLL's HTTP server is responding
            return await _checkHttpServer();
        } catch (_) { return false; }
    });

    ipcMain.handle('raft:executeEffect', async (event, command, parameters = {}) => {
        try {
            return await executeCommand(command, parameters);
        } catch (error) {
            throw error;
        }
    });

    ipcMain.handle('raft:setGamePath', async (event, profileId, gamePath) => {
        try {
            if (gamePath === undefined && typeof profileId === 'string' && profileId.includes('\\')) {
                gamePath = profileId;
                profileId = null;
            }
            if (!gamePath) return { success: false, error: 'No path provided' };
            saveGamePath(gamePath, profileId);
            return { success: true, gamePath };
        } catch (error) {
            console.error('[raft] Error configurando ruta:', error);
            throw error;
        }
    });

    ipcMain.handle('raft:getGamePath', async (event, profileId) => {
        const p = getGamePath(profileId);
        return p ? { path: p, success: true } : null;
    });

    ipcMain.handle('raft:checkModStatus', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };
            return { installed: isModInstalled(profileId), gamePath };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('raft:installMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('Primero debes configurar la ruta del juego');

            const MOD_URL = 'https://storage.tikcontrol.live/games/raft/mod.zip?v=2';
            const tmpZip = path.join(os.tmpdir(), 'tikcontrol-raft-mod.zip');

            console.log('[raft] Descargando mod desde AWS...');
            await _downloadFile(MOD_URL, tmpZip);

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tmpZip);
            zip.extractAllTo(gamePath, true);
            console.log('[raft] Mod extraído en:', gamePath);
            try { fs.unlinkSync(tmpZip); } catch (_) {}

            return { success: true, message: 'Mod de Raft instalado correctamente.', modInstalled: true };
        } catch (error) {
            console.error('[raft] Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('raft:uninstallMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('No hay ruta del juego configurada');

            for (const f of [
                path.join(gamePath, 'winhttp.dll'),
                path.join(gamePath, 'doorstop_config.ini'),
                path.join(gamePath, '.doorstop_version')
            ]) {
                if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('[raft] Eliminado:', f); }
            }
            for (const dir of [
                path.join(gamePath, 'TikControl_Raft'),
                path.join(gamePath, 'TCT_Raft'),
                // Legacy folder from pre-clean installs
                path.join(gamePath, 'S2E_Raft')
            ]) {
                if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true }); console.log('[raft] Carpeta eliminada:', dir); }
            }

            return { success: true, message: 'Mod desinstalado correctamente' };
        } catch (error) {
            console.error('[raft] Error desinstalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('raft:launchGame', async () => {
        try {
            const { shell } = require('electron');
            await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
            return { success: true, method: 'steam' };
        } catch (error) {
            console.error('[raft] Error:', error);
            throw error;
        }
    });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _checkHttpServer() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: HTTP_PORT,
            path: '/spawn',
            method: 'GET',
            headers: { 'Origin': ORIGIN, 'Superdupertoken': SUPER_TOKEN }
        }, (res) => { res.resume(); resolve(res.statusCode === 200); });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => { req.destroy(); resolve(false); });
        req.end();
    });
}

// ─── DOWNLOAD ────────────────────────────────────────────────────────────────

async function _downloadFile(url, dest) {
    const https = require('https');
    const protocol = url.startsWith('https') ? https : http;

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                return _downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                file.close();
                return reject(new Error(`HTTP ${response.statusCode} al descargar mod`));
            }
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

module.exports = { initialize, executeCommand };
