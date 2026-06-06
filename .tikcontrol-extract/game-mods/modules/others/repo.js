// R.E.P.O. - TikControl integration module
// The current BepInEx plugin exposes an HTTP server in the game process.

const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const AdmZip = require('adm-zip');
const EventEmitter = require('events');
const { downloadModZip } = require('../downloadModZip');
const { findGamePath } = require('../steamDetect');

const GAME_ID = 'repo';
const GAME_NAME = 'R.E.P.O.';
const STEAM_APP_ID = 3241660;
const HTTP_PORT = 55001;
const PRIMARY_AUTH_PROFILE = {
    token: 'tikcontrol.live',
    origin: 'https://app.tikcontrol.live'
};
const PLUGIN_FILE = 'TikControl-repo.dll';

const MOD_URL = 'https://storage.tikcontrol.live/games/repo/mod.zip?v=18';
const LEGACY_BRANDED_PLUGIN_FILE = ['s', '2', 'e-repo.dll'].join('');
const COMPAT_HOST = String.fromCharCode(115, 116, 114, 101, 97, 109, 116, 111, 101, 97, 114, 110, 46, 105, 111);
const AUTH_PROFILES = [
    PRIMARY_AUTH_PROFILE,
    {
        token: COMPAT_HOST,
        origin: `https://app.${COMPAT_HOST}`
    }
];

const COMMANDS = new Set([
    'spawnenemy',
    'spawnenemyrandomlocation',
    'spawnitem',
    'spawnvaluableitem',
    'heal',
    'stamina',
    'changecostup',
    'changecostdown',
    'removecost',
    'destroyitem',
    'infinitystamina',
    'bonusspeed',
    'randomupgrade',
    'spawnmine',
    'spawngrenade',
    'knockdown',
    'shakecartitem',
    'stunenemies',
    'kill',
    'pushplayerforward',
    'pushplayerbackward',
    'revive',
    'randomteleport',
    'randomteleportcart',
    'teleporttocart',
    'teleporttotruck',
    'spawnwizarddumgolfsstaff',
    'spawnbottle',
    'spawnrubberduck',
    'spawnchompbook'
]);

const DEFAULT_EFFECTS = new Map([
    ['spawnenemy', 'Duck'],
    ['spawnenemyrandomlocation', 'Duck'],
    ['spawnitem', 'Cart Medium'],
    ['spawnvaluableitem', 'Diamond'],
    ['heal', '100'],
    ['stamina', '100']
]);

const UNSUPPORTED_SPAWN_ITEMS = new Set([
    'Cart Big',
    'Cart Cannon',
    'Cart Laser',
    'Drone Heal',
    'Duck Bucket',
    'Gun Laser',
    'Gun Shockwave',
    'Gun Stun',
    'Hidey Box',
    'Melee Stun Baton',
    'Orb Battery',
    'Orb Feather',
    'Orb Heal',
    'Orb Indestructible',
    'Orb Magnet',
    'Orb Torque',
    'Phase Bridge',
    'Upgrade Death Head Battery',
    'Upgrade Player Crouch Rest',
    'Upgrade Player Tumble Climb',
    'Upgrade Player Tumble Wings',
    'Line Between Two Points'
]);

const LEGACY_COMMAND_MAP = new Map([
    ['player_heal', 'heal'],
    ['player_refill_energy', 'stamina'],
    ['player_drain_energy', 'stamina'],
    ['player_infinitestam', 'infinitystamina'],
    ['player_fast', 'bonusspeed'],
    ['killplayer', 'kill'],
    ['player_revive', 'revive'],
    ['player_teleport', 'randomteleport'],
    ['player_teleport_extraction', 'teleporttotruck'],
    ['destroy_random_item', 'destroyitem'],
    ['removecost', 'removecost'],
    ['spawncollectable_itemrubberduck', 'spawnrubberduck'],
    ['spawncollectable_itemgrenadeexplosive', 'spawngrenade'],
    ['spawncollectable_itemminexplosive', 'spawnmine'],
    ['spawncollectable_itemmineexplosive', 'spawnmine']
]);

const LEGACY_PLUGIN_PATHS = [
    ['BepInEx', 'plugins', LEGACY_BRANDED_PLUGIN_FILE],
    ['BepInEx', 'plugins', 'REPO_TikControl.dll'],
    ['BepInEx', 'plugins', 'TikControl', 'REPO_TikControl.dll'],
    ['BepInEx', 'plugins', 'REPO_TikControl', 'REPO_TikControl.dll']
];

class REPOService extends EventEmitter {
    constructor() {
        super();
        this.PORT = HTTP_PORT;
        this.mainWindow = null;
        this.gameConfig = {};
    }

    initialize(mainWindow) {
        this.mainWindow = mainWindow;
        this.loadSavedGamePaths();
        this.registerIpcHandlers();
        console.log('[REPO] HTTP module initialized on port', this.PORT);
    }

    loadSavedGamePaths() {
        try {
            const configPath = path.join(app.getPath('userData'), 'electron-config.json');
            if (!fs.existsSync(configPath)) return;

            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            Object.keys(config).forEach((key) => {
                if (key.startsWith('repo_game_path_')) {
                    const profileId = key.replace('repo_game_path_', '');
                    this.gameConfig[profileId] = config[key];
                }
            });
        } catch (error) {
            console.error('[REPO] Error loading saved paths:', error);
        }
    }

    saveGamePath(profileId, gamePath) {
        try {
            const configPath = path.join(app.getPath('userData'), 'electron-config.json');
            let config = {};
            if (fs.existsSync(configPath)) {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }

            const id = profileId || 'default';
            config[`repo_game_path_${id}`] = gamePath;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            this.gameConfig[id] = gamePath;
        } catch (error) {
            console.error('[REPO] Error saving path:', error);
        }
    }

    resolveGameDir(profileId) {
        const stored = this.gameConfig[profileId] || this.gameConfig.default || null;
        return this.normalizeGameDir(stored);
    }

    normalizeGameDir(candidatePath) {
        if (!candidatePath || typeof candidatePath !== 'string' || !fs.existsSync(candidatePath)) return null;

        const stat = fs.statSync(candidatePath);
        const dir = stat.isDirectory() ? candidatePath : path.dirname(candidatePath);
        return (fs.existsSync(path.join(dir, 'REPO.exe')) || fs.existsSync(path.join(dir, 'R.E.P.O.exe'))) ? dir : null;
    }

    normalizeCommand(command) {
        const raw = String(command || '').trim();
        const lower = raw.toLowerCase();
        if (COMMANDS.has(lower)) return lower;
        if (LEGACY_COMMAND_MAP.has(lower)) return LEGACY_COMMAND_MAP.get(lower);
        if (lower.startsWith('spawnenemy_') || lower.startsWith('spawnenemy')) return 'spawnenemy';
        if (lower.startsWith('spawncollectable_valuable')) return 'spawnvaluableitem';
        if (lower.startsWith('spawncollectable_')) return 'spawnitem';
        if (lower.startsWith('playerupgrade_')) return 'randomupgrade';
        return lower;
    }

    resolveEffectValue(endpoint, rawCommand, parameters) {
        const directValue = [
            parameters.effect,
            parameters.value,
            parameters.item,
            parameters.enemy,
            parameters.valuableItem,
            parameters.valuable,
            parameters.health,
            parameters.stamina
        ].find((value) => value !== undefined && value !== null && value !== '');
        if (directValue !== undefined) return String(directValue);

        const raw = String(rawCommand || '');
        const separator = raw.indexOf(':') >= 0 ? ':' : '_';
        const parts = raw.split(separator);
        if (parts.length > 1 && (endpoint === 'spawnenemy' || endpoint === 'spawnenemyrandomlocation' || endpoint === 'spawnitem' || endpoint === 'spawnvaluableitem')) {
            const suffix = parts.slice(1).join(separator).trim();
            if (suffix) return suffix.replace(/([a-z])([A-Z])/g, '$1 $2');
        }

        return DEFAULT_EFFECTS.get(endpoint) || null;
    }

    async executeCommand(command, parameters = {}) {
        const endpoint = this.normalizeCommand(command);
        if (!COMMANDS.has(endpoint)) {
            return { success: false, error: `Comando no soportado por el nuevo mod de ${GAME_NAME}: ${command}` };
        }

        const viewerName = parameters.name || parameters.viewerName || parameters.username || 'TikControl';
        const payload = { name: String(viewerName || 'TikControl') };
        const effectValue = this.resolveEffectValue(endpoint, command, parameters);
        if (endpoint === 'spawnitem' && UNSUPPORTED_SPAWN_ITEMS.has(effectValue)) {
            return { success: false, error: `El item '${effectValue}' no esta soportado por el plugin actual de ${GAME_NAME}` };
        }
        if (effectValue !== null) payload.effect = effectValue;

        for (const [key, value] of Object.entries(parameters || {})) {
            if (value === undefined || value === null || value === '') continue;
            if (['name', 'viewerName', 'username', 'profileImageUrl'].includes(key)) continue;
            if (['effect', 'value', 'item', 'enemy', 'valuableItem', 'valuable', 'health', 'stamina'].includes(key)) continue;
            payload[key] = value;
        }

        try {
            await this.sendHttpRequest(`/${endpoint}`, payload);
            return { success: true, message: `Comando '${endpoint}' enviado`, command: endpoint };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async sendHttpRequest(endpoint, payload) {
        const body = JSON.stringify(payload || {});
        let lastError = null;

        for (const authProfile of AUTH_PROFILES) {
            try {
                return await this.sendHttpRequestWithProfile(endpoint, body, authProfile);
            } catch (error) {
                lastError = error;
                if (error.statusCode !== 401 && error.statusCode !== 403) throw error;
            }
        }

        throw lastError || new Error(`No se pudo enviar el comando al mod de ${GAME_NAME}`);
    }

    sendHttpRequestWithProfile(endpoint, body, authProfile) {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: this.PORT,
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

    async checkHttpServer() {
        for (const authProfile of AUTH_PROFILES) {
            if (await this.checkHttpServerWithProfile(authProfile)) return true;
        }
        return false;
    }

    checkHttpServerWithProfile(authProfile) {
        return new Promise((resolve) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: this.PORT,
                path: '/knockdown',
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

    isPluginInstalled(gameDir) {
        return fs.existsSync(path.join(gameDir, 'BepInEx', 'plugins', PLUGIN_FILE));
    }

    hasLegacyPlugin(gameDir) {
        return LEGACY_PLUGIN_PATHS.some((parts) => fs.existsSync(path.join(gameDir, ...parts)));
    }

    cleanupLegacyPlugins(gameDir) {
        const pluginsDir = path.join(gameDir, 'BepInEx', 'plugins');
        for (const parts of LEGACY_PLUGIN_PATHS) {
            const filePath = path.join(gameDir, ...parts);
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (error) {
                console.warn('[REPO] Could not remove legacy plugin:', filePath, error.message);
            }
        }

        for (const dirName of ['REPO_TikControl', 'TikControl']) {
            const dirPath = path.join(pluginsDir, dirName);
            try {
                if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
            } catch (error) {
                console.warn('[REPO] Could not remove legacy folder:', dirPath, error.message);
            }
        }
    }

    removeInstalledPlugin(gameDir) {
        const pluginPath = path.join(gameDir, 'BepInEx', 'plugins', PLUGIN_FILE);
        if (fs.existsSync(pluginPath)) {
            fs.unlinkSync(pluginPath);
            return 1;
        }
        return 0;
    }

    canRemoveBepInEx(gameDir) {
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

    registerIpcHandlers() {
        ipcMain.handle('repo:executeEffect', async (event, command, parameters = {}) => {
            return this.executeCommand(command, parameters);
        });

        ipcMain.handle('repo:getConnectionStatus', async () => {
            return { connected: await this.checkHttpServer(), port: this.PORT };
        });

        ipcMain.handle('repo:setGamePath', async (event, profileIdOrPath, maybePath) => {
            const { resolveSetGamePathArgs } = require('../setGamePathArgs');
            const { profileId, path: newPath } = resolveSetGamePathArgs(profileIdOrPath, maybePath);
            const gameDir = this.normalizeGameDir(newPath);
            if (!gameDir) return { success: false, error: 'Ruta no valida' };

            const id = profileId || 'default';
            this.saveGamePath(id, gameDir);
            if (id !== 'default') this.saveGamePath('default', gameDir);
            return { success: true, path: gameDir, gamePath: gameDir };
        });

        ipcMain.handle('repo:getGamePath', async (event, profileId) => {
            const gameDir = this.resolveGameDir(profileId);
            return { path: gameDir || null, gamePath: gameDir || null };
        });

        ipcMain.handle('repo:findGame', async () => {
            const gameDir = findGamePath(['REPO', 'R.E.P.O.'], ['REPO.exe', 'R.E.P.O.exe']);
            if (!gameDir) return { success: false };

            this.saveGamePath('default', gameDir);
            return { success: true, path: gameDir, gamePath: gameDir };
        });

        ipcMain.handle('repo:installMod', async (event, profileId) => {
            const gameDir = this.resolveGameDir(profileId);
            if (!gameDir) return { success: false, error: 'Ruta del juego no configurada' };

            const tempDir = path.join(app.getPath('temp'), 'tikcontrol_repo_mod');
            const zipPath = path.join(tempDir, 'repo_mod.zip');

            try {
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

                this.sendProgress('Descargando mod de TikControl para R.E.P.O...');
                await downloadModZip(MOD_URL, zipPath, {
                    expectedEntries: [
                        'BepInEx/core/BepInEx.dll',
                        `BepInEx/plugins/${PLUGIN_FILE}`,
                        'doorstop_config.ini',
                        'winhttp.dll'
                    ],
                    minBytes: 128 * 1024,
                    onRetry: (attempt, error) => {
                        this.sendProgress(`Descarga incompleta, reintentando (${attempt + 1}/3)...`);
                        console.warn('[REPO] Retrying mod download:', error.message);
                    }
                });

                this.sendProgress('Limpiando plugins antiguos de R.E.P.O...');
                this.cleanupLegacyPlugins(gameDir);

                this.sendProgress('Extrayendo BepInEx + plugin TikControl...');
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(gameDir, true);
                this.cleanupLegacyPlugins(gameDir);

                const pluginInstalled = this.isPluginInstalled(gameDir);
                try {
                    fs.unlinkSync(zipPath);
                    fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (_) {}

                this.sendProgress(pluginInstalled ? 'Mod instalado correctamente!' : 'BepInEx instalado, pero falta el plugin.');
                return {
                    success: pluginInstalled,
                    message: pluginInstalled
                        ? 'Mod de TikControl instalado correctamente. Inicia el juego para conectar.'
                        : 'BepInEx se instalo, pero no se encontro el plugin de TikControl.',
                    pluginInstalled
                };
            } catch (error) {
                console.error('[REPO] Error installing mod:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('repo:uninstallMod', async (event, profileId) => {
            const gameDir = this.resolveGameDir(profileId);
            if (!gameDir) return { success: false, error: 'Ruta del juego no configurada' };

            try {
                let deleted = 0;
                this.cleanupLegacyPlugins(gameDir);
                deleted += this.removeInstalledPlugin(gameDir);

                if (this.canRemoveBepInEx(gameDir)) {
                    for (const item of [
                        path.join(gameDir, 'BepInEx'),
                        path.join(gameDir, '.doorstop_version'),
                        path.join(gameDir, 'changelog.txt'),
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
                console.error('[REPO] Error uninstalling mod:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('repo:checkModStatus', async (event, profileId) => {
            const gameDir = this.resolveGameDir(profileId);
            if (!gameDir) return { installed: false, reason: 'No game path' };

            const bepInExPath = path.join(gameDir, 'BepInEx', 'core', 'BepInEx.dll');
            return {
                installed: this.isPluginInstalled(gameDir),
                legacyInstalled: this.hasLegacyPlugin(gameDir),
                bepInExInstalled: fs.existsSync(bepInExPath),
                connected: await this.checkHttpServer()
            };
        });

        ipcMain.handle('repo:launchGame', async (event, profileId) => {
            const gameDir = this.resolveGameDir(profileId);
            try {
                if (gameDir) {
                    const exePath = ['REPO.exe', 'R.E.P.O.exe']
                        .map((exe) => path.join(gameDir, exe))
                        .find((candidate) => fs.existsSync(candidate));

                    if (exePath) {
                        const { spawn } = require('child_process');
                        spawn(`"${exePath}"`, [], { detached: true, stdio: 'ignore', cwd: gameDir, shell: true });
                        return { success: true, method: 'direct' };
                    }
                }

                const { shell } = require('electron');
                await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
                return { success: true, method: 'steam' };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
    }

    sendProgress(message) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('repo:install-progress', { message });
        }
    }

    stop() {
        // HTTP mode has no local server to close.
    }
}

const service = new REPOService();

module.exports = {
    initialize: (mainWindow) => service.initialize(mainWindow),
    executeCommand: (command, params) => service.executeCommand(command, params),
    getConnectionStatus: () => service.checkHttpServer().then((connected) => ({ connected })),
    stop: () => service.stop()
};
