// Supermarket Simulator - TikControl integration module.
// The BepInEx IL2CPP plugin exposes an HTTP server in the game process.

const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const { downloadModZip } = require('../downloadModZip');
const { findGamePath } = require('../steamDetect');

const GAME_ID = 'supermarketsimulator';
const GAME_NAME = 'Supermarket Simulator';
const STEAM_APP_ID = 2670630;
const HTTP_PORT = 55001;
const PLUGIN_FILE = 'TikControl-supermarket-simulator.dll';
const IMAGE_SHARP_FILE = 'SixLabors.ImageSharp.dll';
const MOD_URL = 'https://storage.tikcontrol.live/games/supermarket-simulator/mod.zip?v=24';
const PRIMARY_AUTH_PROFILE = {
    token: 'tikcontrol.live',
    origin: 'https://app.tikcontrol.live'
};

const LEGACY_PLUGIN_FILE = ['s', '2', 'e-supermarket-simulator.dll'].join('');
const LEGACY_INFO_FILE = ['s', '2', 'e_info.json'].join('');
const COMPAT_HOST = String.fromCharCode(115, 116, 114, 101, 97, 109, 116, 111, 101, 97, 114, 110, 46, 105, 111);
const AUTH_PROFILES = [
    PRIMARY_AUTH_PROFILE,
    {
        token: COMPAT_HOST,
        origin: `https://app.${COMPAT_HOST}`
    }
];

const COMMANDS = new Set([
    'spawncustomer',
    'spawnshoplifter',
    'spawnnpc',
    'givemoney',
    'openclosestore',
    'openstore',
    'closestore',
    'lightonoff',
    'lighton',
    'lightoff',
    'uplevelstore',
    'downlevelstore',
    'upgradestore',
    'spawngarbage',
    'dirtystore',
    'clearstore',
    'clearrandomgarbage',
    'clearrandomdirty',
    'clearrandommess',
    'teleported',
    'destroyproduct',
    'randomproduct',
    'randombox',
    'furniture',
    'floor',
    'bucket',
    'bankrupted',
    'openclosecheckout',
    'spawnbox',
    'clearunusedboxes',
    'productdrop',
    'addrandomproduct',
    'addproductbyid',
    'unpackproductbox'
]);

const USER_COMMANDS = new Set(['spawncustomer', 'spawnshoplifter', 'spawnnpc']);
const EFFECT_COMMANDS = new Set(['givemoney', 'spawnbox', 'addproductbyid']);
const DEFAULT_EFFECTS = new Map([
    ['givemoney', '100'],
    ['spawnbox', '1'],
    ['addproductbyid', '1']
]);

const LEGACY_COMMAND_MAP = new Map([
    ['customer', 'spawncustomer'],
    ['shoplifter', 'spawnshoplifter'],
    ['npc', 'spawnnpc'],
    ['citynpc', 'spawnnpc'],
    ['money', 'givemoney'],
    ['addmoney', 'givemoney'],
    ['clearrandommud', 'clearrandomdirty'],
    ['clearrandomdirt', 'clearrandomdirty'],
    ['randomcleanup', 'clearrandommess'],
    ['clearrandomcleanup', 'clearrandommess'],
    ['custombox', 'spawnbox'],
    ['spawnproductbox', 'spawnbox'],
    ['clearboxes', 'clearunusedboxes']
]);

const LEGACY_PLUGIN_PATHS = [
    ['BepInEx', 'plugins', LEGACY_PLUGIN_FILE],
    ['BepInEx', 'plugins', 'supermarket-simulator.dll']
];

let mainWindow = null;

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    console.log('[supermarketsimulator] HTTP module initialized on port', HTTP_PORT);
}

function getConfigPath() {
    return path.join(app.getPath('userData'), 'electron-config.json');
}

function readConfig() {
    try {
        const configPath = getConfigPath();
        if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (_) {}
    return {};
}

function writeConfig(config) {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

function normalizeGameDir(candidatePath) {
    if (!candidatePath || typeof candidatePath !== 'string' || !fs.existsSync(candidatePath)) return null;
    const stat = fs.statSync(candidatePath);
    const dir = stat.isDirectory() ? candidatePath : path.dirname(candidatePath);
    return fs.existsSync(path.join(dir, 'Supermarket Simulator.exe')) ? dir : null;
}

function getGamePath(profileId) {
    const config = readConfig();
    if (profileId) {
        const val = config[`${GAME_ID}_game_path_${profileId}`];
        if (val) return normalizeGameDir(val);
    }
    return normalizeGameDir(config[`${GAME_ID}_game_path`] || config[`${GAME_ID}_game_path_default`] || null);
}

function saveGamePath(gamePath, profileId) {
    const gameDir = normalizeGameDir(gamePath);
    if (!gameDir) return false;

    const config = readConfig();
    if (profileId) config[`${GAME_ID}_game_path_${profileId}`] = gameDir;
    config[`${GAME_ID}_game_path`] = gameDir;
    config[`${GAME_ID}_game_path_default`] = gameDir;
    writeConfig(config);
    return true;
}

function pluginPath(gameDir) {
    return path.join(gameDir, 'BepInEx', 'plugins', PLUGIN_FILE);
}

function imageSharpPath(gameDir) {
    return path.join(gameDir, 'BepInEx', 'plugins', IMAGE_SHARP_FILE);
}

function hasRuntime(gameDir) {
    return fs.existsSync(path.join(gameDir, 'winhttp.dll'))
        && fs.existsSync(path.join(gameDir, 'doorstop_config.ini'))
        && fs.existsSync(path.join(gameDir, 'BepInEx', 'core', 'BepInEx.Core.dll'));
}

function isPluginInstalled(gameDir) {
    return !!gameDir
        && fs.existsSync(pluginPath(gameDir))
        && fs.existsSync(imageSharpPath(gameDir))
        && hasRuntime(gameDir);
}

function hasLegacyPlugin(gameDir) {
    return LEGACY_PLUGIN_PATHS.some((parts) => fs.existsSync(path.join(gameDir, ...parts)));
}

function cleanupLegacyPlugins(gameDir) {
    for (const parts of LEGACY_PLUGIN_PATHS) {
        const filePath = path.join(gameDir, ...parts);
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (error) {
            console.warn('[supermarketsimulator] Could not remove old plugin:', filePath, error.message);
        }
    }

    const infoPath = path.join(gameDir, LEGACY_INFO_FILE);
    try {
        if (fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
    } catch (error) {
        console.warn('[supermarketsimulator] Could not remove old marker:', infoPath, error.message);
    }
}

function removeInstalledFiles(gameDir) {
    let deleted = 0;
    for (const filePath of [pluginPath(gameDir), imageSharpPath(gameDir)]) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                deleted++;
            }
        } catch (error) {
            console.warn('[supermarketsimulator] Could not remove file:', filePath, error.message);
        }
    }
    return deleted;
}

function canRemoveBepInEx(gameDir) {
    const pluginsDir = path.join(gameDir, 'BepInEx', 'plugins');
    if (!fs.existsSync(pluginsDir)) return true;

    const stack = [pluginsDir];
    while (stack.length) {
        const dir = stack.pop();
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(entryPath);
            } else if (entry.name.toLowerCase().endsWith('.dll')) {
                return false;
            }
        }
    }
    return true;
}

function normalizeCommand(command) {
    const raw = String(command || '').trim();
    const lower = raw.toLowerCase();
    if (COMMANDS.has(lower)) return lower;
    if (LEGACY_COMMAND_MAP.has(lower)) return LEGACY_COMMAND_MAP.get(lower);
    return lower;
}

function firstParam(parameters, keys) {
    for (const key of keys) {
        const value = parameters[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
}

function resolveEffectValue(endpoint, parameters) {
    const direct = firstParam(parameters, [
        'effect',
        'value',
        'item',
        'productId',
        'amount',
        'givemoney',
        'spawnbox',
        'addproductbyid'
    ]);
    if (direct !== null) return String(direct);
    return DEFAULT_EFFECTS.get(endpoint) || null;
}

function resolveAvatarUrl(parameters) {
    const avatar = firstParam(parameters, [
        'avatarUrl',
        'profileImageUrl',
        'profilePictureUrl',
        'profilePicture',
        'avatar'
    ]);
    if (!avatar || typeof avatar !== 'string') return null;
    try {
        const url = new URL(avatar);
        return (url.protocol === 'http:' || url.protocol === 'https:') ? avatar : null;
    } catch (_) {
        return null;
    }
}

function clampQuantity(value) {
    const parsed = Number.parseInt(String(value || '5'), 10);
    if (!Number.isFinite(parsed)) return 5;
    return Math.max(1, Math.min(parsed, 25));
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeCommand(commandId, parameters = {}) {
    const endpoint = normalizeCommand(commandId);
    if (!COMMANDS.has(endpoint)) {
        return { success: false, error: `Comando no soportado por el mod de ${GAME_NAME}: ${commandId}` };
    }

    const viewerName = parameters.name || parameters.viewerName || parameters.username || 'TikControl';
    const payload = { name: String(viewerName || 'TikControl') };

    if (USER_COMMANDS.has(endpoint)) {
        const avatarUrl = resolveAvatarUrl(parameters);
        const headAvatarUrl = firstParam(parameters, ['headAvatarUrl', 'headImageUrl']);
        if (avatarUrl) payload.avatarUrl = avatarUrl;
        if (headAvatarUrl) payload.headAvatarUrl = headAvatarUrl;
    }

    if (EFFECT_COMMANDS.has(endpoint)) {
        payload.effect = resolveEffectValue(endpoint, parameters);
    }

    if (endpoint === 'clearrandommess') {
        const quantity = clampQuantity(firstParam(parameters, ['quantity', 'count', 'value', 'effect']));
        try {
            for (let i = 0; i < quantity; i++) {
                await sendHttpRequest('/clearrandomgarbage', payload);
                await sendHttpRequest('/clearrandomdirty', payload);
                if (i < quantity - 1) await delay(60);
            }
            return { success: true, message: `Limpieza aleatoria enviada (${quantity} pasadas)`, command: endpoint, quantity };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    try {
        await sendHttpRequest(`/${endpoint}`, payload);
        return { success: true, message: `Comando '${endpoint}' enviado`, command: endpoint };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function sendHttpRequest(endpoint, payload) {
    const body = JSON.stringify(payload || {});
    let lastError = null;

    for (const authProfile of AUTH_PROFILES) {
        try {
            return await sendHttpRequestWithProfile(endpoint, body, authProfile);
        } catch (error) {
            lastError = error;
            if (error.statusCode !== 401 && error.statusCode !== 403) throw error;
        }
    }

    throw lastError || new Error(`No se pudo enviar el comando al mod de ${GAME_NAME}`);
}

function sendHttpRequestWithProfile(endpoint, body, authProfile) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: HTTP_PORT,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'Superdupertoken': authProfile.token,
                'Origin': authProfile.origin
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true, data });
                    return;
                }

                const error = new Error(`El mod de ${GAME_NAME} respondio HTTP ${res.statusCode} en ${endpoint}`);
                error.statusCode = res.statusCode;
                reject(error);
            });
        });

        req.on('error', (error) => {
            const detail = error && error.code === 'ECONNREFUSED'
                ? `Juego no conectado. Asegurate de que ${GAME_NAME} este ejecutandose con el mod de TikControl.`
                : `No se pudo enviar el comando al mod de ${GAME_NAME}: ${error.message}`;
            reject(new Error(detail));
        });
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error(`Timeout enviando comando al mod de ${GAME_NAME}`));
        });
        req.write(body);
        req.end();
    });
}

async function checkHttpServer() {
    for (const authProfile of AUTH_PROFILES) {
        if (await checkHttpServerWithProfile(authProfile)) return true;
    }
    return false;
}

function checkHttpServerWithProfile(authProfile) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: HTTP_PORT,
            path: '/spawnnpc',
            method: 'OPTIONS',
            headers: {
                'Origin': authProfile.origin,
                'Superdupertoken': authProfile.token,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type,superdupertoken'
            }
        }, (res) => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 300);
        });

        req.on('error', () => resolve(false));
        req.setTimeout(1200, () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}

function sendProgress(message) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('supermarketsimulator:install-progress', { message });
    }
}

function registerIpcHandlers() {
    ipcMain.handle('supermarketsimulator:isConnected', async (event, profileId) => {
        const gameDir = getGamePath(profileId);
        if (!gameDir || !isPluginInstalled(gameDir)) return false;
        return checkHttpServer();
    });

    ipcMain.handle('supermarketsimulator:executeEffect', async (event, command, parameters = {}) => {
        return executeCommand(command, parameters);
    });

    ipcMain.handle('supermarketsimulator:setGamePath', async (event, profileIdOrPath, maybePath) => {
        const { resolveSetGamePathArgs } = require('../setGamePathArgs');
        const { profileId, path: newPath } = resolveSetGamePathArgs(profileIdOrPath, maybePath);
        if (!saveGamePath(newPath, profileId)) return { success: false, error: 'Ruta no valida' };

        const gameDir = getGamePath(profileId);
        return { success: true, path: gameDir, gamePath: gameDir };
    });

    ipcMain.handle('supermarketsimulator:getGamePath', async (event, profileId) => {
        const gameDir = getGamePath(profileId);
        return gameDir ? { path: gameDir, gamePath: gameDir, success: true } : null;
    });

    ipcMain.handle('supermarketsimulator:findGame', async () => {
        const gameDir = findGamePath('Supermarket Simulator', 'Supermarket Simulator.exe');
        if (!gameDir) return { success: false };

        saveGamePath(gameDir, 'default');
        return { success: true, path: gameDir, gamePath: gameDir };
    });

    ipcMain.handle('supermarketsimulator:checkModStatus', async (event, profileId) => {
        const gameDir = getGamePath(profileId);
        if (!gameDir) return { installed: false, reason: 'No hay ruta configurada' };

        return {
            installed: isPluginInstalled(gameDir),
            legacyInstalled: hasLegacyPlugin(gameDir),
            pluginInstalled: fs.existsSync(pluginPath(gameDir)),
            imageSharpInstalled: fs.existsSync(imageSharpPath(gameDir)),
            bepInExInstalled: hasRuntime(gameDir),
            connected: await checkHttpServer(),
            gamePath: gameDir
        };
    });

    ipcMain.handle('supermarketsimulator:installMod', async (event, profileId) => {
        const gameDir = getGamePath(profileId);
        if (!gameDir) return { success: false, error: 'Primero debes configurar la ruta del juego' };

        const tempDir = path.join(app.getPath('temp'), 'tikcontrol_supermarketsimulator_mod');
        const zipPath = path.join(tempDir, 'supermarket_simulator_mod.zip');

        try {
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            sendProgress('Descargando mod de TikControl para Supermarket Simulator...');
            await downloadModZip(MOD_URL, zipPath, {
                expectedEntries: [
                    'BepInEx/core/BepInEx.Core.dll',
                    `BepInEx/plugins/${PLUGIN_FILE}`,
                    `BepInEx/plugins/${IMAGE_SHARP_FILE}`,
                    'dotnet/coreclr.dll',
                    'doorstop_config.ini',
                    'winhttp.dll'
                ],
                minBytes: 10 * 1024 * 1024,
                onRetry: (attempt, error) => {
                    sendProgress(`Descarga incompleta, reintentando (${attempt + 1}/3)...`);
                    console.warn('[supermarketsimulator] Retrying mod download:', error.message);
                }
            });

            sendProgress('Limpiando plugins antiguos...');
            cleanupLegacyPlugins(gameDir);

            sendProgress('Extrayendo BepInEx + plugin TikControl...');
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(gameDir, true);

            const installed = isPluginInstalled(gameDir);
            try {
                fs.unlinkSync(zipPath);
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (_) {}

            sendProgress(installed ? 'Mod instalado correctamente!' : 'BepInEx instalado, pero falta algun archivo del plugin.');
            return {
                success: installed,
                message: installed
                    ? 'Mod de TikControl instalado correctamente. Inicia el juego para conectar.'
                    : 'BepInEx se instalo, pero no se encontro el plugin completo de TikControl.',
                modInstalled: installed,
                pluginInstalled: installed
            };
        } catch (error) {
            console.error('[supermarketsimulator] Error installing mod:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('supermarketsimulator:uninstallMod', async (event, profileId) => {
        const gameDir = getGamePath(profileId);
        if (!gameDir) return { success: false, error: 'No hay ruta del juego configurada' };

        try {
            cleanupLegacyPlugins(gameDir);
            let deleted = removeInstalledFiles(gameDir);

            if (canRemoveBepInEx(gameDir)) {
                for (const item of [
                    path.join(gameDir, 'BepInEx'),
                    path.join(gameDir, 'dotnet'),
                    path.join(gameDir, '.doorstop_version'),
                    path.join(gameDir, 'doorstop_config.ini'),
                    path.join(gameDir, 'winhttp.dll')
                ]) {
                    if (!fs.existsSync(item)) continue;
                    const stat = fs.statSync(item);
                    if (stat.isDirectory()) fs.rmSync(item, { recursive: true, force: true });
                    else fs.unlinkSync(item);
                    deleted++;
                }
            }

            return { success: true, message: `Mod desinstalado (${deleted} elementos eliminados)` };
        } catch (error) {
            console.error('[supermarketsimulator] Error uninstalling mod:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('supermarketsimulator:launchGame', async (event, profileId) => {
        const gameDir = getGamePath(profileId);
        try {
            const exePath = gameDir ? path.join(gameDir, 'Supermarket Simulator.exe') : null;
            if (exePath && fs.existsSync(exePath)) {
                spawn(`"${exePath}"`, [], { detached: true, stdio: 'ignore', cwd: gameDir, shell: true });
                return { success: true, method: 'direct' };
            }

            const { shell } = require('electron');
            await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
            return { success: true, method: 'steam' };
        } catch (error) {
            console.error('[supermarketsimulator] Error launching game:', error);
            return { success: false, error: error.message };
        }
    });
}

function stop() {
    // HTTP mode has no local server to close.
}

module.exports = {
    initialize,
    executeCommand,
    getConnectionStatus: () => checkHttpServer().then((connected) => ({ connected })),
    stop
};
