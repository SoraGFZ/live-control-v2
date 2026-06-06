/**
 * Escape From Duckov - TikControl Integration Module
 * BepInEx mod with HttpListener on port 55001.
 * TikControl sends commands via POST http://127.0.0.1:55001/api/command
 *
 * Mod folder structure in game dir:
 *   BepInEx/                              <- BepInEx framework
 *   BepInEx/plugins/Escape_From_Duckov.dll <- Game mod
 *   winhttp.dll                           <- BepInEx proxy DLL
 *   doorstop_config.ini                   <- BepInEx doorstop config
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

let mainWindow = null;
const GAME_ID = 'duckov';
const STEAM_APP_ID = 3167020;
const HTTP_PORT = 55001;
const AUTH_TOKEN = 'streamtoearn.io';
const ALLOWED_ORIGIN = 'https://alt.streamtoearn.io';

// Commands that accept a value parameter
const COMMANDS_WITH_VALUE = {
    'explode':      true,   // damage
    'tpforward':    true,   // distance
    'heal':         true,   // HP amount
    'damage':       true,   // HP
    'give':         true,   // item ID (e.g. "id0001")
    'invincible':   true,   // duration seconds
    'yeetDefault':  true,   // strength
    'cheatmode':    true,   // duration
    'barrelcage':   true,   // radius
    'smokenormal':  true,   // duration
    'yeetSoft':     true,   // strength
    'yeetHard':     true,   // strength
    'smoketoxic':   true,   // duration
};

// Commands without value
const COMMANDS_NO_VALUE = {
    'spawnboss':    true,
    'throwbarrel':  true,
    'airdrop':      true,
};

// All valid commands
const ALL_COMMANDS = { ...COMMANDS_WITH_VALUE, ...COMMANDS_NO_VALUE };

const COMMAND_ALIASES = {
    yeetdefault: 'yeetDefault',
    yeetsoft: 'yeetSoft',
    yeethard: 'yeetHard',
};

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    console.log('[duckov] Modulo inicializado');
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
    console.log('[duckov] Ruta guardada:', gamePath);
}

function isModInstalled(profileId) {
    const gamePath = getGamePath(profileId);
    if (!gamePath) return false;
    return fs.existsSync(path.join(gamePath, 'BepInEx', 'core'))
        && fs.existsSync(path.join(gamePath, 'BepInEx', 'plugins', 'Escape_From_Duckov.dll'))
        && fs.existsSync(path.join(gamePath, 'winhttp.dll'))
        && fs.existsSync(path.join(gamePath, 'doorstop_config.ini'));
}

// --- COMMAND EXECUTION ---

async function executeCommand(commandId, parameters = {}) {
    const normalizedCommandId = COMMAND_ALIASES[commandId] || commandId;
    if (!ALL_COMMANDS[normalizedCommandId]) {
        throw new Error(`[duckov] Comando desconocido: ${commandId}`);
    }

    const viewerName = parameters.viewerName || parameters.name || 'TikControl';
    const endpoint = `/${normalizedCommandId}`;

    const payload = { name: viewerName };

    // Add the main parameter as "effect"
    const mainParam = parameters.item || parameters.effect || parameters.value
        || parameters.duration || parameters.quantity || parameters.force
        || parameters.slot || parameters.charge || parameters.time;
    if (mainParam !== undefined && mainParam !== null) {
        payload.effect = String(mainParam);
    }

    console.log('[duckov] Ejecutando:', endpoint, JSON.stringify(payload));

    await _sendHttpRequest(endpoint, payload);

    return {
        success: true,
        message: `Comando '${normalizedCommandId}' enviado`,
        command: normalizedCommandId,
        requestedCommand: commandId
    };
}

function _sendHttpRequest(endpoint, payload) {
    const body = JSON.stringify(payload);
    console.log('[duckov] ->', endpoint, body);

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
                console.log('[duckov] <-', res.statusCode, data, '(', endpoint, ')');
                if (res.statusCode === 200) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`Mod respondio con HTTP ${res.statusCode} en ${endpoint}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error('[duckov] Error HTTP:', err.message);
            reject(new Error(`No se pudo enviar al mod de Escape From Duckov. Juego en ejecucion? (${err.message})`));
        });

        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout al enviar comando')); });
        req.write(body);
        req.end();
    });
}

// --- IPC HANDLERS ---

function registerIpcHandlers() {
    ipcMain.handle('duckov:isConnected', async (event, profileId) => {
        try {
            const processWatcher = require('../../../modules/processWatcher');
            const running = processWatcher.getRunning();
            if (!running[GAME_ID]) return false;
            if (!isModInstalled(profileId)) return false;
            return await _checkHttpServer();
        } catch (_) { return false; }
    });

    ipcMain.handle('duckov:executeEffect', async (event, command, parameters = {}) => {
        try {
            return await executeCommand(command, parameters);
        } catch (error) {
            throw error;
        }
    });

    ipcMain.handle('duckov:setGamePath', async (event, profileId, gamePath) => {
        try {
            if (gamePath === undefined && typeof profileId === 'string' && profileId.includes('\\')) {
                gamePath = profileId;
                profileId = null;
            }
            if (!gamePath) return { success: false, error: 'No path provided' };
            saveGamePath(gamePath, profileId);
            return { success: true, gamePath };
        } catch (error) {
            console.error('[duckov] Error configurando ruta:', error);
            throw error;
        }
    });

    ipcMain.handle('duckov:getGamePath', async (event, profileId) => {
        const p = getGamePath(profileId);
        return p ? { path: p, success: true } : null;
    });

    ipcMain.handle('duckov:checkModStatus', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };
            return { installed: isModInstalled(profileId), gamePath };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('duckov:installMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('Primero debes configurar la ruta del juego');

            const MOD_URL = 'https://storage.tikcontrol.live/games/duckov/mod.zip';
            const tmpZip = path.join(os.tmpdir(), 'tikcontrol-duckov-mod.zip');

            console.log('[duckov] Descargando mod...');
            await _downloadFile(MOD_URL, tmpZip);

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tmpZip);
            zip.extractAllTo(gamePath, true);
            console.log('[duckov] Mod extraido en:', gamePath);
            try { fs.unlinkSync(tmpZip); } catch (_) {}

            return { success: true, message: 'Mod de Escape From Duckov instalado correctamente.', modInstalled: true };
        } catch (error) {
            console.error('[duckov] Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('duckov:uninstallMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('No hay ruta del juego configurada');

            // Remove winhttp.dll (BepInEx proxy)
            const winhttpDll = path.join(gamePath, 'winhttp.dll');
            if (fs.existsSync(winhttpDll)) {
                fs.unlinkSync(winhttpDll);
                console.log('[duckov] Eliminado:', winhttpDll);
            }

            // Remove doorstop_config.ini
            const doorstopConfig = path.join(gamePath, 'doorstop_config.ini');
            if (fs.existsSync(doorstopConfig)) {
                fs.unlinkSync(doorstopConfig);
                console.log('[duckov] Eliminado:', doorstopConfig);
            }

            // Remove .doorstop_version
            const doorstopVersion = path.join(gamePath, '.doorstop_version');
            if (fs.existsSync(doorstopVersion)) {
                fs.unlinkSync(doorstopVersion);
                console.log('[duckov] Eliminado:', doorstopVersion);
            }

            // Remove BepInEx/ folder
            const bepInExDir = path.join(gamePath, 'BepInEx');
            if (fs.existsSync(bepInExDir)) {
                fs.rmSync(bepInExDir, { recursive: true });
                console.log('[duckov] Carpeta eliminada:', bepInExDir);
            }

            return { success: true, message: 'Mod desinstalado correctamente' };
        } catch (error) {
            console.error('[duckov] Error desinstalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('duckov:launchGame', async (_event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (gamePath) {
                const exePath = path.join(gamePath, 'Duckov.exe');
                if (fs.existsSync(exePath)) {
                    const { exec } = require('child_process');
                    exec(`"${exePath}"`, { cwd: gamePath });
                    console.log('[duckov] Lanzando desde exe:', exePath);
                    return { success: true, method: 'exe' };
                }
            }
            // Fallback: lanzar via Steam
            const { shell } = require('electron');
            await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
            console.log('[duckov] Lanzando via Steam');
            return { success: true, method: 'steam' };
        } catch (error) {
            console.error('[duckov] Error:', error);
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
            path: '/api/command',
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
