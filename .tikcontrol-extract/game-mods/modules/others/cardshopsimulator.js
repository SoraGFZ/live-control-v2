/**
 * TCG Card Shop Simulator - TikControl Integration Module
 * BepInEx mod runs HTTP server on port 55001.
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
const GAME_ID = 'cardshopsimulator';
const STEAM_APP_ID = 3070070;
const HTTP_PORT = 55001;
const AUTH_TOKEN = 'streamtoearn.io';
const ALLOWED_ORIGIN = 'https://app.streamtoearn.io';

const COMMAND_MAP = {
    // --- Customers ---
    'spawncustomer':        { path: '/spawncustomer' },
    // --- Money ---
    'givemoney':            { path: '/givemoney' },
    'changecostup':         { path: '/changecostup' },
    'changecostdown':       { path: '/changecostdown' },
    // --- Shop ---
    'openclosestore':       { path: '/openclosestore' },
    'onofflightstore':      { path: '/onofflightstore' },
    'uplevelstore':         { path: '/uplevelstore' },
    'downlevelstore':       { path: '/downlevelstore' },
    'upgradestore':         { path: '/upgradestore' },
    'upgradewarehouse':     { path: '/upgradewarehouse' },
    // --- Staff ---
    'hirerandomworker':     { path: '/hirerandomworker' },
    'firerandomworker':     { path: '/firerandomworker' },
    'allsmelly':            { path: '/allsmelly' },
    // --- Boxes ---
    'spawnbox':             { path: '/spawnbox' },
    'spawnfurniturebox':    { path: '/spawnfurniturebox' },
    'randombox':            { path: '/randombox' },
    'randomfurniturebox':   { path: '/randomfurniturebox' },
    'spawnbigbox':          { path: '/spawnbigbox' },
    'dropbox':              { path: '/dropbox' },
    'destroyallbox':        { path: '/destroyallbox' },
    // --- Cards ---
    'openrandompack':       { path: '/openrandompack' },
    'autoopenrandompack':   { path: '/autoopenrandompack' },
    'openpackbyname':       { path: '/openpackbyname' },
    // --- Chaos ---
    'teleportoutside':      { path: '/teleportoutside' },
    'setlanguage':          { path: '/setlanguage' },
};

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    console.log('[cardshopsimulator] Modulo inicializado');
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
    console.log('[cardshopsimulator] Ruta guardada:', gamePath);
}

function isModInstalled(profileId) {
    const gamePath = getGamePath(profileId);
    if (!gamePath) return false;
    return fs.existsSync(path.join(gamePath, 'BepInEx', 'plugins', 'card-shop-simulator.dll'))
        && fs.existsSync(path.join(gamePath, 'winhttp.dll'))
        && fs.existsSync(path.join(gamePath, 'doorstop_config.ini'));
}

// --- COMMAND EXECUTION ---

async function executeCommand(commandId, parameters = {}) {
    const cmd = COMMAND_MAP[commandId];
    if (!cmd) {
        throw new Error(`[cardshopsimulator] Comando desconocido: ${commandId}`);
    }

    const viewerName = parameters.viewerName || parameters.name || 'TikControl';
    const endpoint = cmd.path;

    const payload = { name: viewerName };

    const mainParam = parameters.effect || parameters.item || parameters.Box || parameters.Furniture || parameters.Pack;
    if (mainParam !== undefined && mainParam !== null) {
        payload.effect = String(mainParam);
    }

    // givemoney uses a numeric value
    if (commandId === 'givemoney' && parameters.quantity !== undefined) {
        payload.effect = String(parameters.quantity);
    }

    console.log('[cardshopsimulator] Ejecutando:', endpoint, JSON.stringify(payload), '(id:', commandId + ')');

    const result = await _sendHttpRequest(endpoint, payload);
    return { success: true, message: `Comando '${commandId}' enviado`, command: commandId };
}

function _sendHttpRequest(endpoint, payload) {
    const body = JSON.stringify(payload);
    console.log('[cardshopsimulator] ->', endpoint, body);

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
                console.log('[cardshopsimulator] <-', res.statusCode, data, '(', endpoint, ')');
                if (res.statusCode === 200) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`Mod respondio con HTTP ${res.statusCode} en ${endpoint}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error('[cardshopsimulator] Error HTTP:', err.message);
            reject(new Error(`No se pudo enviar al mod. Juego en ejecucion? (${err.message})`));
        });

        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout al enviar comando')); });
        req.write(body);
        req.end();
    });
}

// --- IPC HANDLERS ---

function registerIpcHandlers() {
    ipcMain.handle('cardshopsimulator:isConnected', async (event, profileId) => {
        try {
            const processWatcher = require('../../../modules/processWatcher');
            const running = processWatcher.getRunning();
            if (!running[GAME_ID]) return false;
            if (!isModInstalled(profileId)) return false;
            return await _checkHttpServer();
        } catch (_) { return false; }
    });

    ipcMain.handle('cardshopsimulator:executeEffect', async (event, command, parameters = {}) => {
        try {
            return await executeCommand(command, parameters);
        } catch (error) {
            throw error;
        }
    });

    ipcMain.handle('cardshopsimulator:setGamePath', async (event, profileId, gamePath) => {
        try {
            if (gamePath === undefined && typeof profileId === 'string' && profileId.includes('\\')) {
                gamePath = profileId;
                profileId = null;
            }
            if (!gamePath) return { success: false, error: 'No path provided' };
            saveGamePath(gamePath, profileId);
            return { success: true, gamePath };
        } catch (error) {
            console.error('[cardshopsimulator] Error configurando ruta:', error);
            throw error;
        }
    });

    ipcMain.handle('cardshopsimulator:getGamePath', async (event, profileId) => {
        const p = getGamePath(profileId);
        return p ? { path: p, success: true } : null;
    });

    ipcMain.handle('cardshopsimulator:checkModStatus', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };
            return { installed: isModInstalled(profileId), gamePath };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('cardshopsimulator:installMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('Primero debes configurar la ruta del juego');

            const MOD_URL = 'https://storage.tikcontrol.live/games/cardshopsimulator/mod.zip';
            const tmpZip = path.join(os.tmpdir(), 'tikcontrol-cardshopsimulator-mod.zip');

            console.log('[cardshopsimulator] Descargando mod desde AWS...');
            await _downloadFile(MOD_URL, tmpZip);

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tmpZip);
            zip.extractAllTo(gamePath, true);
            console.log('[cardshopsimulator] Mod extraido en:', gamePath);
            try { fs.unlinkSync(tmpZip); } catch (_) {}

            return { success: true, message: 'Mod instalado correctamente.', modInstalled: true };
        } catch (error) {
            console.error('[cardshopsimulator] Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('cardshopsimulator:uninstallMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('No hay ruta del juego configurada');

            for (const f of [
                path.join(gamePath, 'winhttp.dll'),
                path.join(gamePath, 'doorstop_config.ini'),
                path.join(gamePath, '.doorstop_version')
            ]) {
                if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('[cardshopsimulator] Eliminado:', f); }
            }
            const bepinex = path.join(gamePath, 'BepInEx');
            if (fs.existsSync(bepinex)) {
                fs.rmSync(bepinex, { recursive: true });
                console.log('[cardshopsimulator] Carpeta eliminada:', bepinex);
            }

            return { success: true, message: 'Mod desinstalado correctamente' };
        } catch (error) {
            console.error('[cardshopsimulator] Error desinstalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('cardshopsimulator:launchGame', async () => {
        try {
            const { shell } = require('electron');
            await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
            return { success: true, method: 'steam' };
        } catch (error) {
            console.error('[cardshopsimulator] Error:', error);
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
            path: '/spawncustomer',
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
