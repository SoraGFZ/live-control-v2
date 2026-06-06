/**
 * Yap Yap - TikControl Integration Module
 * BepInEx mod with HttpListener on port 55001.
 * TikControl sends commands via POST http://127.0.0.1:55001/{commandId}
 *
 * Mod folder structure in game dir:
 *   BepInEx/                        <- BepInEx framework
 *   BepInEx/plugins/YapYapMod.dll   <- Game mod
 *   winhttp.dll                     <- BepInEx proxy DLL
 *   doorstop_config.ini             <- BepInEx doorstop config
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

let mainWindow = null;
const GAME_ID = 'yapyap';
const STEAM_APP_ID = 3834090;
const HTTP_PORT = 55001;
const AUTH_TOKEN = 'streamtoearn.io';
const ALLOWED_ORIGIN = 'https://alt.streamtoearn.io';

// Commands that accept a value parameter (effect)
const COMMANDS_WITH_VALUE = {
    'spawnenemy':    true,   // enemy type (chair, gargoyle, guard, spider, jester, slime, ghost)
    'launch':        true,   // up force
    'spawnworld':    true,   // prop name
    'give':          true,   // item ID
};

// Commands without value
const COMMANDS_NO_VALUE = {
    'ragdoll':          true,
    'throw':            true,
    'drunk':            true,
    'dropall':          true,
    'magnet':           true,
    'teleportrandom':   true,
    'panic':            true,
    'despawnenear':     true,
    'tinyplayer':       true,
    'antimagnet':       true,
    'explode':          true,
    'gravitypulse':     true,
    'spellrandom':      true,
};

// All valid commands
const ALL_COMMANDS = { ...COMMANDS_WITH_VALUE, ...COMMANDS_NO_VALUE };

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    console.log('[yapyap] Modulo inicializado');
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
    console.log('[yapyap] Ruta guardada:', gamePath);
}

function isModInstalled(profileId) {
    const gamePath = getGamePath(profileId);
    if (!gamePath) return false;
    return fs.existsSync(path.join(gamePath, 'BepInEx', 'core'))
        && fs.existsSync(path.join(gamePath, 'BepInEx', 'plugins', 'YapYapMod.dll'))
        && fs.existsSync(path.join(gamePath, 'winhttp.dll'))
        && fs.existsSync(path.join(gamePath, 'doorstop_config.ini'));
}

// --- COMMAND EXECUTION ---

async function executeCommand(commandId, parameters = {}) {
    if (!ALL_COMMANDS[commandId]) {
        throw new Error(`[yapyap] Comando desconocido: ${commandId}`);
    }

    const viewerName = parameters.viewerName || parameters.name || 'TikControl';
    const endpoint = `/${commandId}`;

    const payload = { name: viewerName };

    // Add the main parameter as "effect"
    const mainParam = parameters.item || parameters.effect || parameters.value
        || parameters.duration || parameters.quantity || parameters.force
        || parameters.slot || parameters.charge || parameters.time;
    if (mainParam !== undefined && mainParam !== null) {
        payload.effect = String(mainParam);
    }

    console.log('[yapyap] Ejecutando:', endpoint, JSON.stringify(payload));

    await _sendHttpRequest(endpoint, payload);

    return { success: true, message: `Comando '${commandId}' enviado`, command: commandId };
}

function _sendHttpRequest(endpoint, payload) {
    const body = JSON.stringify(payload);
    console.log('[yapyap] ->', endpoint, body);

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
                console.log('[yapyap] <-', res.statusCode, data, '(', endpoint, ')');
                if (res.statusCode === 200) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`Mod respondio con HTTP ${res.statusCode} en ${endpoint}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error('[yapyap] Error HTTP:', err.message);
            reject(new Error(`No se pudo enviar al mod de Yap Yap. Juego en ejecucion? (${err.message})`));
        });

        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout al enviar comando')); });
        req.write(body);
        req.end();
    });
}

// --- IPC HANDLERS ---

function registerIpcHandlers() {
    ipcMain.handle('yapyap:isConnected', async (event, profileId) => {
        try {
            const processWatcher = require('../../../modules/processWatcher');
            const running = processWatcher.getRunning();
            if (!running[GAME_ID]) return false;
            if (!isModInstalled(profileId)) return false;
            return await _checkHttpServer();
        } catch (_) { return false; }
    });

    ipcMain.handle('yapyap:executeEffect', async (event, command, parameters = {}) => {
        try {
            return await executeCommand(command, parameters);
        } catch (error) {
            throw error;
        }
    });

    ipcMain.handle('yapyap:setGamePath', async (event, profileId, gamePath) => {
        try {
            if (gamePath === undefined && typeof profileId === 'string' && profileId.includes('\\')) {
                gamePath = profileId;
                profileId = null;
            }
            if (!gamePath) return { success: false, error: 'No path provided' };
            saveGamePath(gamePath, profileId);
            return { success: true, gamePath };
        } catch (error) {
            console.error('[yapyap] Error configurando ruta:', error);
            throw error;
        }
    });

    ipcMain.handle('yapyap:getGamePath', async (event, profileId) => {
        const p = getGamePath(profileId);
        return p ? { path: p, success: true } : null;
    });

    ipcMain.handle('yapyap:checkModStatus', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };
            return { installed: isModInstalled(profileId), gamePath };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('yapyap:installMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('Primero debes configurar la ruta del juego');

            const MOD_URL = 'https://storage.tikcontrol.live/games/yapyap/mod.zip';
            const tmpZip = path.join(os.tmpdir(), 'tikcontrol-yapyap-mod.zip');

            console.log('[yapyap] Descargando mod...');
            await _downloadFile(MOD_URL, tmpZip);

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tmpZip);
            zip.extractAllTo(gamePath, true);
            console.log('[yapyap] Mod extraido en:', gamePath);
            try { fs.unlinkSync(tmpZip); } catch (_) {}

            return { success: true, message: 'Mod de Yap Yap instalado correctamente.', modInstalled: true };
        } catch (error) {
            console.error('[yapyap] Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('yapyap:uninstallMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('No hay ruta del juego configurada');

            // Remove winhttp.dll (BepInEx proxy)
            const winhttpDll = path.join(gamePath, 'winhttp.dll');
            if (fs.existsSync(winhttpDll)) {
                fs.unlinkSync(winhttpDll);
                console.log('[yapyap] Eliminado:', winhttpDll);
            }

            // Remove doorstop_config.ini
            const doorstopConfig = path.join(gamePath, 'doorstop_config.ini');
            if (fs.existsSync(doorstopConfig)) {
                fs.unlinkSync(doorstopConfig);
                console.log('[yapyap] Eliminado:', doorstopConfig);
            }

            // Remove .doorstop_version
            const doorstopVersion = path.join(gamePath, '.doorstop_version');
            if (fs.existsSync(doorstopVersion)) {
                fs.unlinkSync(doorstopVersion);
                console.log('[yapyap] Eliminado:', doorstopVersion);
            }

            // Remove BepInEx/ folder
            const bepInExDir = path.join(gamePath, 'BepInEx');
            if (fs.existsSync(bepInExDir)) {
                fs.rmSync(bepInExDir, { recursive: true });
                console.log('[yapyap] Carpeta eliminada:', bepInExDir);
            }

            return { success: true, message: 'Mod desinstalado correctamente' };
        } catch (error) {
            console.error('[yapyap] Error desinstalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('yapyap:launchGame', async (_event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (gamePath) {
                const exePath = path.join(gamePath, 'yapyap.exe');
                if (fs.existsSync(exePath)) {
                    const { exec } = require('child_process');
                    exec(`"${exePath}"`, { cwd: gamePath });
                    console.log('[yapyap] Lanzando desde exe:', exePath);
                    return { success: true, method: 'exe' };
                }
            }
            // Fallback: lanzar via Steam
            const { shell } = require('electron');
            await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
            console.log('[yapyap] Lanzando via Steam');
            return { success: true, method: 'steam' };
        } catch (error) {
            console.error('[yapyap] Error:', error);
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
            path: '/spawnenemy',
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
