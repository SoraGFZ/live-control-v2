/**
 * Waterpark Simulator - TikControl Integration Module
 * MelonLoader mod with HttpListener on port 55001.
 * TikControl sends commands via POST http://127.0.0.1:55001/{endpoint}
 *
 * Mod folder structure in game dir:
 *   MelonLoader/              <- MelonLoader framework
 *   Mods/waterpark-simulator.dll  <- Game mod
 *   version.dll               <- MelonLoader proxy DLL
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

let mainWindow = null;
const GAME_ID = 'waterparksimulator';
const STEAM_APP_ID = 3293260;
const HTTP_PORT = 55001;
const AUTH_TOKEN = 'streamtoearn.io';
const ALLOWED_ORIGIN = 'https://alt.streamtoearn.io';

// Maps command id -> HTTP endpoint
const COMMAND_MAP = {
    // --- Staff ---
    'spawnhire':            { path: '/spawnhire' },
    'firerandomhire':       { path: '/firerandomhire' },
    // --- Maintenance ---
    'cleantrash':           { path: '/cleantrash' },
    'spawntrash':           { path: '/spawntrash' },
    // --- Visitors ---
    'spawnvisitor':         { path: '/spawnvisitor' },
    'launchrandomcustomer': { path: '/launchrandomcustomer' },
    'launchallcustomers':   { path: '/launchallcustomers' },
    // --- Player ---
    'stunplayer':           { path: '/stunplayer' },
    'ragdoll':              { path: '/ragdoll' },
    'launch':               { path: '/launch' },
    'teleportrandom':       { path: '/teleportrandom' },
    'teleportoutside':      { path: '/teleportoutside' },
    'dropallitems':         { path: '/dropallitems' },
    // --- Attractions ---
    'randombroken':         { path: '/randombroken' },
    'allbroken':            { path: '/allbroken' },
    'randomrepaired':       { path: '/randomrepaired' },
    'allrepaired':          { path: '/allrepaired' },
    'destroybuildrandom':   { path: '/destroybuildrandom' },
    'destroybuildall':      { path: '/destroybuildall' },
    // --- Economy ---
    'givemoney':            { path: '/givemoney' },
    'takemoney':            { path: '/takemoney' },
    'addxp':                { path: '/addxp' },
    'removexp':             { path: '/removexp' },
    // --- Management ---
    'addstar':              { path: '/addstar' },
    'removestar':           { path: '/removestar' },
    'parkopen':             { path: '/parkopen' },
    'parkclose':            { path: '/parkclose' },
};

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    console.log('[waterparksimulator] Modulo inicializado');
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
    console.log('[waterparksimulator] Ruta guardada:', gamePath);
}

function isModInstalled(profileId) {
    const gamePath = getGamePath(profileId);
    if (!gamePath) return false;
    return fs.existsSync(path.join(gamePath, 'Mods', 'waterpark-simulator.dll'))
        && fs.existsSync(path.join(gamePath, 'version.dll'))
        && fs.existsSync(path.join(gamePath, 'MelonLoader'));
}

// --- COMMAND EXECUTION ---

async function executeCommand(commandId, parameters = {}) {
    const cmd = COMMAND_MAP[commandId];
    if (!cmd) {
        throw new Error(`[waterparksimulator] Comando desconocido: ${commandId}`);
    }

    const viewerName = parameters.viewerName || parameters.name || 'TikControl';
    const endpoint = cmd.path;

    const payload = { name: viewerName };

    const mainParam = parameters.item || parameters.effect || parameters.slot
        || parameters.charge || parameters.force || parameters.time;
    if (mainParam !== undefined && mainParam !== null) {
        payload.effect = String(mainParam);
    }

    if (parameters.duration !== undefined) payload.duration = String(parameters.duration);
    if (parameters.quantity !== undefined) payload.quantity = String(parameters.quantity);

    console.log('[waterparksimulator] Ejecutando:', endpoint, JSON.stringify(payload), '(id:', commandId + ')');

    await _sendHttpRequest(endpoint, payload);

    return { success: true, message: `Comando '${commandId}' enviado`, command: commandId };
}

function _sendHttpRequest(endpoint, payload) {
    const body = JSON.stringify(payload);
    console.log('[waterparksimulator] ->', endpoint, body);

    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: HTTP_PORT,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'Superdupertoken': AUTH_TOKEN,
                'Origin': ALLOWED_ORIGIN
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[waterparksimulator] <-', res.statusCode, data, '(', endpoint, ')');
                if (res.statusCode === 200) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`Mod respondio con HTTP ${res.statusCode} en ${endpoint}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error('[waterparksimulator] Error HTTP:', err.message);
            reject(new Error(`No se pudo enviar al mod de Waterpark Simulator. Juego en ejecucion? (${err.message})`));
        });

        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout al enviar comando')); });
        req.write(body);
        req.end();
    });
}

// --- IPC HANDLERS ---

function registerIpcHandlers() {
    ipcMain.handle('waterparksimulator:isConnected', async (event, profileId) => {
        try {
            const processWatcher = require('../../../modules/processWatcher');
            const running = processWatcher.getRunning();
            if (!running[GAME_ID]) return false;
            if (!isModInstalled(profileId)) return false;
            return await _checkHttpServer();
        } catch (_) { return false; }
    });

    ipcMain.handle('waterparksimulator:executeEffect', async (event, command, parameters = {}) => {
        try {
            return await executeCommand(command, parameters);
        } catch (error) {
            throw error;
        }
    });

    ipcMain.handle('waterparksimulator:setGamePath', async (event, profileId, gamePath) => {
        try {
            if (gamePath === undefined && typeof profileId === 'string' && profileId.includes('\\')) {
                gamePath = profileId;
                profileId = null;
            }
            if (!gamePath) return { success: false, error: 'No path provided' };
            saveGamePath(gamePath, profileId);
            return { success: true, gamePath };
        } catch (error) {
            console.error('[waterparksimulator] Error configurando ruta:', error);
            throw error;
        }
    });

    ipcMain.handle('waterparksimulator:getGamePath', async (event, profileId) => {
        const p = getGamePath(profileId);
        return p ? { path: p, success: true } : null;
    });

    ipcMain.handle('waterparksimulator:checkModStatus', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };
            return { installed: isModInstalled(profileId), gamePath };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('waterparksimulator:installMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('Primero debes configurar la ruta del juego');

            const MOD_URL = 'https://storage.tikcontrol.live/games/waterpark-simulator/mod.zip';
            const tmpZip = path.join(os.tmpdir(), 'tikcontrol-waterparksimulator-mod.zip');

            console.log('[waterparksimulator] Descargando mod desde AWS...');
            await _downloadFile(MOD_URL, tmpZip);

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tmpZip);
            zip.extractAllTo(gamePath, true);
            console.log('[waterparksimulator] Mod extraido en:', gamePath);
            try { fs.unlinkSync(tmpZip); } catch (_) {}

            return { success: true, message: 'Mod de Waterpark Simulator instalado correctamente.', modInstalled: true };
        } catch (error) {
            console.error('[waterparksimulator] Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('waterparksimulator:uninstallMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('No hay ruta del juego configurada');

            const versionDll = path.join(gamePath, 'version.dll');
            if (fs.existsSync(versionDll)) {
                fs.unlinkSync(versionDll);
                console.log('[waterparksimulator] Eliminado:', versionDll);
            }

            const modDll = path.join(gamePath, 'Mods', 'waterpark-simulator.dll');
            if (fs.existsSync(modDll)) {
                fs.unlinkSync(modDll);
                console.log('[waterparksimulator] Eliminado:', modDll);
            }

            const melonLoader = path.join(gamePath, 'MelonLoader');
            if (fs.existsSync(melonLoader)) {
                fs.rmSync(melonLoader, { recursive: true });
                console.log('[waterparksimulator] Carpeta eliminada:', melonLoader);
            }

            return { success: true, message: 'Mod desinstalado correctamente' };
        } catch (error) {
            console.error('[waterparksimulator] Error desinstalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('waterparksimulator:launchGame', async (_event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            // Si hay ruta configurada, lanzar el .exe directamente (no-Steam / pirata / custom)
            if (gamePath) {
                const exePath = path.join(gamePath, 'WaterparkSimulator.exe');
                if (fs.existsSync(exePath)) {
                    const { exec } = require('child_process');
                    exec(`"${exePath}"`, { cwd: gamePath });
                    console.log('[waterparksimulator] Lanzando desde exe:', exePath);
                    return { success: true, method: 'exe' };
                }
            }
            // Fallback: lanzar via Steam
            const { shell } = require('electron');
            await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
            console.log('[waterparksimulator] Lanzando via Steam');
            return { success: true, method: 'steam' };
        } catch (error) {
            console.error('[waterparksimulator] Error:', error);
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
            path: '/parkopen',
            method: 'GET',
            headers: { 'Origin': ALLOWED_ORIGIN, 'Superdupertoken': AUTH_TOKEN }
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
