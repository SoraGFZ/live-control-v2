/**
 * PEAK - TikControl Integration Module
 * The game mod DLL (PeakMod.dll) runs an HTTP server on port 55001 via BepInEx.
 * TikControl sends commands via POST http://127.0.0.1:55001/{endpoint}
 *
 * Mod folder structure in game dir:
 *   BepInEx/           <- BepInEx framework + plugins
 *   winhttp.dll        <- Doorstop proxy
 *   doorstop_config.ini
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

let mainWindow = null;
const GAME_ID = 'peak';
const STEAM_APP_ID = 3527290;
const HTTP_PORT = 55001;
const SAFE_HTTP_PORT = 55002;
// Headers required by the base mod DLL.
const AUTH_TOKEN = ['stream', 'to', 'earn.io'].join('');
const ALLOWED_ORIGIN = ['https://alt.', 'stream', 'to', 'earn.io'].join('');
// Headers used by the TikControl safe teleport helper.
const SAFE_AUTH_TOKEN = 'tikcontrol';
const SAFE_ALLOWED_ORIGIN = 'https://app.tikcontrol.local';

// Maps command id -> HTTP endpoint
// Cada comando del mod tiene su propio endpoint POST
const COMMAND_MAP = {
    // --- Scoutmaster ---
    'callscoutmaster':      { path: '/callscoutmaster' },
    // --- Player / Physics ---
    'launch':               { path: '/launch' },
    'speed':                { path: '/speed' },
    'gravity':              { path: '/gravity' },
    'teleport':             { path: '/teleport' },
    'revive':               { path: '/revive' },
    'applystatus':          { path: '/applystatus' },
    // --- Items ---
    'giveitem':             { path: '/giveitem' },
    'spawnitem':            { path: '/spawnitem' },
    'dropallitems':         { path: '/dropallitems' },
    'dropallnobackpack':    { path: '/dropallnobackpack' },
    'drophanditem':         { path: '/drophanditem' },
    'dropbackpack':         { path: '/dropbackpack' },
    'dropslot':             { path: '/dropslot' },
    'throwitem':            { path: '/throwitem' },
    // --- Spawn / Effects ---
    'spawntornado':         { path: '/spawntornado' },
    'spawnfungus':          { path: '/spawnfungus' },
    'mandrake':             { path: '/mandrake' },
    'dynamite':             { path: '/dynamite' },
    'bananapeel':           { path: '/bananapeel' },
};

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    console.log('[peak] Modulo inicializado');
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
    console.log('[peak] Ruta guardada:', gamePath);
}

function isModInstalled(profileId) {
    const gamePath = getGamePath(profileId);
    if (!gamePath) return false;
    return fs.existsSync(path.join(gamePath, 'BepInEx', 'plugins', 'PeakMod.dll'))
        && fs.existsSync(path.join(gamePath, 'BepInEx', 'plugins', 'TikControlPeak.dll'))
        && fs.existsSync(path.join(gamePath, 'winhttp.dll'))
        && fs.existsSync(path.join(gamePath, 'doorstop_config.ini'));
}

// --- COMMAND EXECUTION ---

async function executeCommand(commandId, parameters = {}) {
    const cmd = COMMAND_MAP[commandId];
    if (!cmd) {
        throw new Error(`[peak] Comando desconocido: ${commandId}`);
    }

    const viewerName = parameters.viewerName || parameters.name || 'TikControl';
    const endpoint = cmd.path;

    // Construir payload - el mod espera {name, effect, ...extras}
    const payload = { name: viewerName };

    // Parametro principal: item, effect, slot, charge, force, time -> todo va como "effect"
    const mainParam = parameters.item || parameters.effect || parameters.slot
        || parameters.charge || parameters.force || parameters.time;
    if (mainParam !== undefined && mainParam !== null) {
        payload.effect = String(mainParam);
    }

    // Parametros adicionales (duration, quantity) van como campos extra
    if (parameters.duration !== undefined) payload.duration = String(parameters.duration);
    if (parameters.quantity !== undefined) payload.quantity = String(parameters.quantity);

    // Repetir para items con cantidad (giveitem, spawnitem)
    let repeatCount = 1;
    if ((commandId === 'giveitem' || commandId === 'spawnitem') && parameters.quantity) {
        repeatCount = Math.max(1, Math.min(10, parseInt(parameters.quantity) || 1));
        delete payload.quantity;
    }

    console.log('[peak] Ejecutando:', endpoint, JSON.stringify(payload), 'x' + repeatCount, '(id:', commandId + ')');

    if (commandId === 'teleport') {
        try {
            await _sendSafeTeleportRequest(payload);
            return { success: true, message: `Comando '${commandId}' enviado`, command: commandId };
        } catch (error) {
            throw new Error(`El teletransporte seguro de PEAK no esta disponible. Reinstala el mod de PEAK desde TikControl. (${error.message})`);
        }
    }

    const results = [];
    for (let i = 0; i < repeatCount; i++) {
        const result = await _sendHttpRequest(endpoint, payload);
        results.push(result);

        if (repeatCount > 1 && i < repeatCount - 1) {
            await new Promise(r => setTimeout(r, 150));
        }
    }

    return { success: true, message: `Comando '${commandId}' enviado x${repeatCount}`, command: commandId };
}

function _sendHttpRequest(endpoint, payload) {
    return _sendHttpRequestToPort(HTTP_PORT, endpoint, payload, {
        authToken: AUTH_TOKEN,
        origin: ALLOWED_ORIGIN
    });
}

function _sendSafeTeleportRequest(payload) {
    return _sendHttpRequestToPort(SAFE_HTTP_PORT, '/teleport', payload, {
        authToken: SAFE_AUTH_TOKEN,
        origin: SAFE_ALLOWED_ORIGIN
    });
}

function _sendHttpRequestToPort(port, endpoint, payload, headersConfig) {
    const body = JSON.stringify(payload);
    console.log('[peak] ->', endpoint, body, `(port ${port})`);

    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'Superdupertoken': headersConfig.authToken,
                'Origin': headersConfig.origin
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[peak] <-', res.statusCode, data, '(', endpoint, ')');
                if (res.statusCode === 200) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`Mod respondio con HTTP ${res.statusCode} en ${endpoint}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error('[peak] Error HTTP:', err.message);
            reject(new Error(`No se pudo enviar al mod de PEAK. Juego en ejecucion? (${err.message})`));
        });

        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout al enviar comando')); });
        req.write(body);
        req.end();
    });
}

// --- IPC HANDLERS ---

function registerIpcHandlers() {
    ipcMain.handle('peak:isConnected', async (event, profileId) => {
        try {
            const processWatcher = require('../../../modules/processWatcher');
            const running = processWatcher.getRunning();
            if (!running[GAME_ID]) return false;
            if (!isModInstalled(profileId)) return false;
            return await _checkHttpServer() && await _checkSafeHttpServer();
        } catch (_) { return false; }
    });

    ipcMain.handle('peak:executeEffect', async (event, command, parameters = {}) => {
        try {
            return await executeCommand(command, parameters);
        } catch (error) {
            throw error;
        }
    });

    ipcMain.handle('peak:setGamePath', async (event, profileId, gamePath) => {
        try {
            if (gamePath === undefined && typeof profileId === 'string' && profileId.includes('\\')) {
                gamePath = profileId;
                profileId = null;
            }
            if (!gamePath) return { success: false, error: 'No path provided' };
            saveGamePath(gamePath, profileId);
            return { success: true, gamePath };
        } catch (error) {
            console.error('[peak] Error configurando ruta:', error);
            throw error;
        }
    });

    ipcMain.handle('peak:getGamePath', async (event, profileId) => {
        const p = getGamePath(profileId);
        return p ? { path: p, success: true } : null;
    });

    ipcMain.handle('peak:checkModStatus', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };
            return { installed: isModInstalled(profileId), gamePath };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('peak:installMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('Primero debes configurar la ruta del juego');

            const MOD_URL = 'https://storage.tikcontrol.live/games/peak/mod.zip?v=10';
            const tmpZip = path.join(os.tmpdir(), 'tikcontrol-peak-mod.zip');

            const localZip = _getLocalModZipPath();
            const sourceZip = (!require('electron').app.isPackaged && fs.existsSync(localZip)) ? localZip : tmpZip;

            if (sourceZip === tmpZip) {
                console.log('[peak] Descargando mod...');
                await _downloadFile(MOD_URL, tmpZip);
            } else {
                console.log('[peak] Usando mod local:', sourceZip);
            }

            const extractZip = require('extract-zip');
            await extractZip(sourceZip, { dir: gamePath });
            _removeDeprecatedInfoFile(gamePath);
            console.log('[peak] Mod extraido en:', gamePath);
            try { fs.unlinkSync(tmpZip); } catch (_) {}

            return { success: true, message: 'Mod de PEAK instalado correctamente.', modInstalled: true };
        } catch (error) {
            console.error('[peak] Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('peak:uninstallMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('No hay ruta del juego configurada');

            for (const f of [
                path.join(gamePath, 'winhttp.dll'),
                path.join(gamePath, 'doorstop_config.ini'),
                path.join(gamePath, '.doorstop_version')
            ]) {
                if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('[peak] Eliminado:', f); }
            }
            const bepinex = path.join(gamePath, 'BepInEx');
            if (fs.existsSync(bepinex)) {
                fs.rmSync(bepinex, { recursive: true });
                console.log('[peak] Carpeta eliminada:', bepinex);
            }

            return { success: true, message: 'Mod desinstalado correctamente' };
        } catch (error) {
            console.error('[peak] Error desinstalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('peak:launchGame', async () => {
        try {
            const { shell } = require('electron');
            await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
            return { success: true, method: 'steam' };
        } catch (error) {
            console.error('[peak] Error:', error);
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
            path: '/revive',
            method: 'GET',
            headers: { 'Origin': ALLOWED_ORIGIN, 'Superdupertoken': AUTH_TOKEN }
        }, (res) => { res.resume(); resolve(res.statusCode === 200); });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => { req.destroy(); resolve(false); });
        req.end();
    });
}

function _checkSafeHttpServer() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: SAFE_HTTP_PORT,
            path: '/status',
            method: 'GET',
            headers: { 'Origin': SAFE_ALLOWED_ORIGIN, 'Superdupertoken': SAFE_AUTH_TOKEN }
        }, (res) => { res.resume(); resolve(res.statusCode === 200); });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => { req.destroy(); resolve(false); });
        req.end();
    });
}

function _getLocalModZipPath() {
    return path.resolve(__dirname, '..', '..', 'aws', 'peak', 'mod.zip');
}

function _removeDeprecatedInfoFile(gamePath) {
    try {
        const legacyName = ['s', '2', 'e_info.json'].join('');
        const legacyPath = path.join(gamePath, legacyName);
        if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
    } catch (_) {}
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
