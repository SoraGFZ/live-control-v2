/**
 * Left 4 Dead 2 - TikControl Integration Module
 * Uses SourceMod + MetaMod:Source. The TikControl plugin runs an
 * HTTP server on port 55001 inside the game process.
 * TikControl sends commands via POST http://127.0.0.1:55001/{endpoint}
 *
 * IMPORTANT: The game MUST be launched with "-insecure" in Steam launch options.
 * Without this, SourceMod/MetaMod cannot load.
 *
 * Mod folder structure (inside game dir):
 *   left4dead2/addons/metamod/        <- MetaMod:Source
 *   left4dead2/addons/sourcemod/      <- SourceMod framework
 *   left4dead2/addons/sourcemod/plugins/tikcontrol_l4d2.smx  <- TikControl plugin
 *   left4dead2/addons/metamod.vdf     <- MetaMod loader
 *   left4dead2/cfg/sourcemod/         <- SourceMod configs
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

let mainWindow = null;
const GAME_ID = 'left4dead2';
const STEAM_APP_ID = 550;
const HTTP_PORT = 55001;
const SUPER_TOKEN = 'streamtoearn.io';
const HMAC_KEY = 'PraseTheSun';
const ORIGIN = 'https://app.streamtoearn.io';
const PLUGIN_DIR = path.join('left4dead2', 'addons', 'sourcemod', 'plugins');
const PRIMARY_PLUGIN_FILE = 'tikcontrol_l4d2.smx';
const LEGACY_PLUGIN_FILE = 's2e_l4d2.smx';
const PLUGIN_FILES = [PRIMARY_PLUGIN_FILE, LEGACY_PLUGIN_FILE];

// Maps command id -> { path: HTTP endpoint, effect?: fixed effect value }
// The plugin exposes each command as its own HTTP endpoint.
// Commands with selectable values send the selected value as "effect" in the body.
// Commands with numeric values send the number as "effect".
const COMMAND_MAP = {
    // --- Spawn Enemies (POST /spawn, effect = enemy type) ---
    'spawn_tank':       { path: '/spawn', effect: 'tank' },
    'spawn_witch':      { path: '/spawn', effect: 'witch' },
    'spawn_horde':      { path: '/spawn', effect: 'horde' },
    'spawn_common':     { path: '/spawn', effect: 'common' },
    'spawn_smoker':     { path: '/spawn', effect: 'smoker' },
    'spawn_boomer':     { path: '/spawn', effect: 'boomer' },
    'spawn_hunter':     { path: '/spawn', effect: 'hunter' },
    'spawn_spitter':    { path: '/spawn', effect: 'spitter' },
    'spawn_jockey':     { path: '/spawn', effect: 'jockey' },
    'spawn_charger':    { path: '/spawn', effect: 'charger' },
    // --- Weapons (POST /giveweapon, effect = weapon name) ---
    'giveweapon':       { path: '/giveweapon' },   // effect from parameters.item
    'randomweapon':     { path: '/randomweapon' },
    'strip':            { path: '/strip' },
    // --- Ammo Upgrades (POST /upgradeammo, effect = type) ---
    'upgradeammo_fire':      { path: '/upgradeammo', effect: 'fire' },
    'upgradeammo_explosive': { path: '/upgradeammo', effect: 'explosive' },
    // --- Player Stats ---
    'health':           { path: '/health' },        // effect = numeric value (+/-)
    'ammo':             { path: '/ammo' },           // effect = numeric value
    'healthall':        { path: '/healthall' },      // effect = numeric value (+/-)
    // --- Kill / Incapacitate ---
    'killall':          { path: '/killall' },        // effect = radius (optional)
    'killfriends':      { path: '/killfriends' },
    'incapfriends':     { path: '/incapfriends' },
    // --- Status Effects ---
    'stun':             { path: '/stun' },           // effect = seconds
    'expert':           { path: '/expert' },         // effect = seconds
    // --- Special ---
    'airstrike':        { path: '/airstrike' },      // effect = radius, extra.count = explosions
    'resetmap':         { path: '/resetmap' },
};

// All weapons for random selection
const RANDOM_WEAPONS = [
    'weapon_rifle', 'weapon_rifle_ak47', 'weapon_rifle_desert', 'weapon_rifle_sg552',
    'weapon_hunting_rifle', 'weapon_sniper_military', 'weapon_sniper_scout', 'weapon_sniper_awp',
    'weapon_smg', 'weapon_smg_silenced', 'weapon_smg_mp5',
    'weapon_pumpshotgun', 'weapon_shotgun_chrome', 'weapon_autoshotgun', 'weapon_shotgun_spas',
    'weapon_chainsaw', 'weapon_molotov', 'weapon_pipe_bomb', 'weapon_vomitjar',
    'weapon_first_aid_kit', 'weapon_defibrillator', 'weapon_pain_pills', 'weapon_adrenaline'
];

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    console.log('[left4dead2] Modulo inicializado');
}

// --- CONFIG ---

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
    console.log('[left4dead2] Ruta guardada:', gamePath);
}

function isModInstalled(profileId) {
    const gamePath = getGamePath(profileId);
    if (!gamePath) return false;
    return PLUGIN_FILES.some(file => fs.existsSync(path.join(gamePath, PLUGIN_DIR, file)))
        && fs.existsSync(path.join(gamePath, 'left4dead2', 'addons', 'metamod.vdf'));
}

function normalizePluginFilename(gamePath) {
    const pluginsDir = path.join(gamePath, PLUGIN_DIR);
    const primaryPath = path.join(pluginsDir, PRIMARY_PLUGIN_FILE);
    const legacyPath = path.join(pluginsDir, LEGACY_PLUGIN_FILE);

    if (fs.existsSync(primaryPath) || !fs.existsSync(legacyPath)) return;
    fs.copyFileSync(legacyPath, primaryPath);
    try { fs.unlinkSync(legacyPath); } catch (_) {}
    console.log('[left4dead2] Plugin normalizado:', PRIMARY_PLUGIN_FILE);
}

// --- COMMAND EXECUTION ---

async function executeCommand(commandId, parameters = {}) {
    const cmd = COMMAND_MAP[commandId];
    if (!cmd) {
        throw new Error(`[left4dead2] Comando desconocido: ${commandId}`);
    }

    const viewerName = parameters.viewerName || parameters.name || 'TikControl';
    const endpoint = cmd.path;

    let effect;

    if (commandId === 'randomweapon') {
        effect = RANDOM_WEAPONS[Math.floor(Math.random() * RANDOM_WEAPONS.length)];
    } else if (parameters.item) {
        // Commands with item selector (giveweapon)
        effect = String(parameters.item);
    } else if (parameters.quantity !== undefined && parameters.quantity !== null) {
        // Commands with numeric values (health, ammo, stun, expert, killall radius, etc.)
        effect = String(parameters.quantity);
    } else if (cmd.effect) {
        // Commands with fixed effect (spawn_tank -> 'tank', upgradeammo_fire -> 'fire')
        effect = cmd.effect;
    }

    const payload = { name: viewerName };
    if (effect) payload.effect = effect;

    // Repeat count: mod ignores "count" field, so we send the request N times
    const repeatCount = parseInt(parameters.count, 10) || 1;

    console.log('[left4dead2] Ejecutando:', endpoint, 'effect:', effect || '(none)', '(id:', commandId + ')', 'x' + repeatCount);

    for (let i = 0; i < repeatCount; i++) {
        await _sendHttpRequest(endpoint, payload);
        if (i < repeatCount - 1) await new Promise(r => setTimeout(r, 200));
    }
    return { success: true, message: `Comando '${commandId}' enviado x${repeatCount}`, command: commandId };
}

function _buildSignedBody(payload) {
    const crypto = require('crypto');
    const ts = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomUUID();
    const message = `${JSON.stringify(payload)}\n${ts}\n${nonce}`;
    const sig = crypto.createHmac('sha256', HMAC_KEY).update(message).digest('base64');
    return { payload, ts, nonce, sig };
}

function _sendHttpRequest(endpoint, payload) {
    const signedBody = _buildSignedBody(payload);
    const body = JSON.stringify(signedBody);
    console.log('[left4dead2] ->', endpoint, body);

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
                console.log('[left4dead2] <-', res.statusCode, data, '(', endpoint, ')');
                if (res.statusCode === 200) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`Mod respondio con HTTP ${res.statusCode} en ${endpoint}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error('[left4dead2] Error HTTP:', err.message);
            reject(new Error(`L4D2 no responde en el puerto ${HTTP_PORT}. Abre el juego desde TikControl o añade -insecure en Steam para que SourceMod cargue. (${err.message})`));
        });

        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout al enviar comando')); });
        req.write(body);
        req.end();
    });
}

// --- IPC HANDLERS ---

function registerIpcHandlers() {
    ipcMain.handle('left4dead2:isConnected', async (event, profileId) => {
        try {
            const processWatcher = require('../../../modules/processWatcher');
            const running = processWatcher.getRunning();
            if (!running[GAME_ID]) return false;
            if (!isModInstalled(profileId)) return false;
            return await _checkHttpServer();
        } catch (_) { return false; }
    });

    ipcMain.handle('left4dead2:executeEffect', async (event, command, parameters = {}) => {
        try {
            return await executeCommand(command, parameters);
        } catch (error) {
            throw error;
        }
    });

    ipcMain.handle('left4dead2:setGamePath', async (event, profileId, gamePath) => {
        try {
            if (gamePath === undefined && typeof profileId === 'string' && profileId.includes('\\')) {
                gamePath = profileId;
                profileId = null;
            }
            if (!gamePath) return { success: false, error: 'No path provided' };
            saveGamePath(gamePath, profileId);
            return { success: true, gamePath };
        } catch (error) {
            console.error('[left4dead2] Error configurando ruta:', error);
            throw error;
        }
    });

    ipcMain.handle('left4dead2:getGamePath', async (event, profileId) => {
        const p = getGamePath(profileId);
        return p ? { path: p, success: true } : null;
    });

    ipcMain.handle('left4dead2:checkModStatus', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };
            return { installed: isModInstalled(profileId), gamePath };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('left4dead2:installMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('Primero debes configurar la ruta del juego');

            const MOD_URL = 'https://storage.tikcontrol.live/games/left4dead2/mod.zip';
            const tmpZip = path.join(os.tmpdir(), 'tikcontrol-left4dead2-mod.zip');

            console.log('[left4dead2] Descargando mod desde AWS...');
            await _downloadFile(MOD_URL, tmpZip);

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tmpZip);
            zip.extractAllTo(gamePath, true);
            normalizePluginFilename(gamePath);
            console.log('[left4dead2] Mod extraido en:', gamePath);
            try { fs.unlinkSync(tmpZip); } catch (_) {}

            return { success: true, message: 'Mod de Left 4 Dead 2 instalado correctamente.', modInstalled: true };
        } catch (error) {
            console.error('[left4dead2] Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('left4dead2:uninstallMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('No hay ruta del juego configurada');

            // Remove TikControl SourceMod plugin
            for (const pluginFile of PLUGIN_FILES) {
                const pluginPath = path.join(gamePath, PLUGIN_DIR, pluginFile);
                if (fs.existsSync(pluginPath)) {
                    fs.unlinkSync(pluginPath);
                    console.log('[left4dead2] Eliminado:', pluginPath);
                }
            }

            // Remove MetaMod and SourceMod directories
            const addonsDir = path.join(gamePath, 'left4dead2', 'addons');
            for (const dir of ['metamod', 'sourcemod']) {
                const dirPath = path.join(addonsDir, dir);
                if (fs.existsSync(dirPath)) {
                    fs.rmSync(dirPath, { recursive: true });
                    console.log('[left4dead2] Carpeta eliminada:', dirPath);
                }
            }

            // Remove metamod.vdf files
            for (const f of ['metamod.vdf', 'metamod_x64.vdf']) {
                const fPath = path.join(addonsDir, f);
                if (fs.existsSync(fPath)) {
                    fs.unlinkSync(fPath);
                    console.log('[left4dead2] Eliminado:', fPath);
                }
            }

            // Remove cfg/sourcemod
            const cfgDir = path.join(gamePath, 'left4dead2', 'cfg', 'sourcemod');
            if (fs.existsSync(cfgDir)) {
                fs.rmSync(cfgDir, { recursive: true });
                console.log('[left4dead2] Carpeta eliminada:', cfgDir);
            }

            return { success: true, message: 'Mod desinstalado correctamente' };
        } catch (error) {
            console.error('[left4dead2] Error desinstalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('left4dead2:launchGame', async () => {
        try {
            const { shell } = require('electron');
            await shell.openExternal(`steam://run/${STEAM_APP_ID}//-insecure`);
            return { success: true, method: 'steam' };
        } catch (error) {
            console.error('[left4dead2] Error:', error);
            throw error;
        }
    });
}

// --- HELPERS ---

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

// --- DOWNLOAD ---

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
