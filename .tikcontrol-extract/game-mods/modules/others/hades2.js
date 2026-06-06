/**
 * Hades II - TikControl Integration Module
 * ReturnOfModding (Lua scripts) - File-based communication.
 * TikControl writes commands to %TEMP%\TikControl\commands.txt
 * The mod reads the file every ~1 second, executes commands, and deletes the file.
 *
 * commands.txt format: [{"command":"heal","effect":"5","name":"viewer"}]
 *
 * Mod folder structure in game dir:
 *   Ship/d3d12.dll
 *   Ship/ReturnOfModding/plugins/TikControl-TikControl/
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { downloadModZip } = require('../downloadModZip');

let mainWindow = null;
const GAME_ID = 'hades2';
const STEAM_APP_ID = 1145350;

// Paths where the Lua mod may read commands from. ReturnOfModding resolves TMP
// inside the game process, which can differ from Electron's os.tmpdir().
function getCommandFiles() {
    const roots = [
        os.tmpdir(),
        process.env.TMP,
        process.env.TEMP,
        process.env.USERPROFILE
    ].filter(Boolean);

    const seen = new Set();
    const files = [];
    for (const root of roots) {
        const file = path.join(root, 'TikControl', 'commands.txt');
        const key = file.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        files.push(file);
    }
    return files;
}

// Commands that accept a value parameter
const COMMANDS_WITH_VALUE = {
    'heal':           true,   // HP amount
    'hurt':           true,   // HP amount
    'sheep':          true,   // duration seconds
    'givemoney':      true,   // amount
    'spendmoney':     true,   // amount
    'restore_mana':   true,   // amount
    'drain_mana':     true,   // amount
    'upgrade_boon':   true,   // levels
    'spawn_mob':      true,   // mob type (select)
    'give_item':      true,   // item type (select)
    'spawn_boon':     true,   // boon type (select)
};

// Commands without value
const COMMANDS_NO_VALUE = {
    'kill_player':        true,
    'kill_all_enemies':   true,
    'restore_enemies':    true,
    'boon':               true,
    'remove_boon':        true,
    'mine':               true,
    'explosive_barrels':  true,
};

// All valid commands
const ALL_COMMANDS = { ...COMMANDS_WITH_VALUE, ...COMMANDS_NO_VALUE };

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    console.log('[hades2] Modulo inicializado (file-based)');
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

function normalizeGamePath(gamePath) {
    if (!gamePath || typeof gamePath !== 'string') return gamePath;

    let normalized = gamePath;
    try {
        if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
            normalized = path.dirname(normalized);
        }

        const baseName = path.basename(normalized).toLowerCase();
        if ((baseName === 'ship' || baseName === 'release') && fs.existsSync(path.join(normalized, 'Hades2.exe'))) {
            normalized = path.dirname(normalized);
            console.log('[hades2] Ruta ajustada a raiz del juego:', normalized);
        }
    } catch (_) {}

    return normalized;
}

function isValidGamePath(gamePath) {
    if (!gamePath || typeof gamePath !== 'string' || !fs.existsSync(gamePath)) return false;
    return fs.existsSync(path.join(gamePath, 'Ship', 'Hades2.exe'))
        || fs.existsSync(path.join(gamePath, 'Hades2.exe'));
}

function getGamePath(profileId) {
    const config = readConfig();
    if (profileId) {
        const val = config[`${GAME_ID}_game_path_${profileId}`];
        const normalized = normalizeGamePath(val);
        if (isValidGamePath(normalized)) return normalized;
    }
    const normalized = normalizeGamePath(config[`${GAME_ID}_game_path`]);
    return isValidGamePath(normalized) ? normalized : null;
}

function saveGamePath(gamePath, profileId) {
    gamePath = normalizeGamePath(gamePath);
    const config = readConfig();
    if (profileId) {
        config[`${GAME_ID}_game_path_${profileId}`] = gamePath;
    }
    config[`${GAME_ID}_game_path`] = gamePath;
    writeConfig(config);
    console.log('[hades2] Ruta guardada:', gamePath);
}

function isModInstalled(profileId) {
    const gamePath = getGamePath(profileId);
    if (!gamePath) return false;
    return fs.existsSync(path.join(gamePath, 'Ship', 'ReturnOfModding', 'plugins', 'TikControl-TikControl', 'main.lua'))
        && fs.existsSync(path.join(gamePath, 'Ship', 'ReturnOfModding', 'plugins', 'TikControl-TikControl', 'manifest.json'))
        && fs.existsSync(path.join(gamePath, 'Ship', 'd3d12.dll'));
}

function removeModPath(gamePath, ...parts) {
    const target = path.join(gamePath, ...parts);
    if (!fs.existsSync(target)) return null;

    fs.rmSync(target, { recursive: true, force: true });
    console.log('[hades2] Eliminado:', target);
    return target;
}

function removeLegacyShipContent(gamePath) {
    const shipContent = path.join(gamePath, 'Ship', 'Content');
    if (!fs.existsSync(shipContent)) return null;

    const knownLegacyFiles = [
        path.join(shipContent, 'Scripts', 'RoomLogic.lua'),
        path.join(shipContent, 'Mods', 'TikControl', 'TikControlMod.lua'),
    ];

    if (!knownLegacyFiles.some(file => fs.existsSync(file))) return null;
    fs.rmSync(shipContent, { recursive: true, force: true });
    console.log('[hades2] Eliminado layout legacy:', shipContent);
    return shipContent;
}

function cleanupInstalledMod(gamePath) {
    return [
        removeModPath(gamePath, 'Content', 'Mods', 'TikControl'),
        removeModPath(gamePath, 'Ship', 'Content', 'Mods', 'TikControl'),
        removeLegacyShipContent(gamePath),
        removeModPath(gamePath, 'Ship', 'd3d12.dll'),
        removeModPath(gamePath, 'Ship', 'd3d12_LICENSE.txt'),
        removeModPath(gamePath, 'Ship', 'ReturnOfModding'),
        removeModPath(gamePath, 'Ship', 'ReturnOfModdingFirstEnabledReason.txt'),
    ].filter(Boolean);
}

function getZipEntry(zip, entryName) {
    return zip.getEntry(entryName) || zip.getEntry(entryName.replace(/\//g, '\\'));
}

function checkLoaderCompatibility(gamePath, zip) {
    const legacyShipContentEntry = zip.getEntries().some(entry =>
        entry.entryName.replace(/\\/g, '/').toLowerCase().startsWith('ship/content/')
    );
    if (legacyShipContentEntry) {
        return { outdated: true, legacyShipContent: true };
    }
    const pluginMain = getZipEntry(zip, 'Ship/ReturnOfModding/plugins/TikControl-TikControl/main.lua');
    const pluginManifest = getZipEntry(zip, 'Ship/ReturnOfModding/plugins/TikControl-TikControl/manifest.json');
    const loaderEntry = getZipEntry(zip, 'Ship/d3d12.dll');
    if (!pluginMain || !pluginManifest || !loaderEntry) {
        return { outdated: true, invalidLayout: true };
    }

    return { outdated: false };
}

// --- COMMAND EXECUTION (FILE-BASED) ---

async function executeCommand(commandId, parameters = {}) {
    if (!ALL_COMMANDS[commandId]) {
        throw new Error(`[hades2] Comando desconocido: ${commandId}`);
    }

    const viewerName = parameters.viewerName || parameters.name || 'TikControl';

    const command = {
        command: commandId,
        name: viewerName
    };

    // Add the main parameter as "effect"
    const mainParam = parameters.item || parameters.effect || parameters.value
        || parameters.duration || parameters.quantity || parameters.force
        || parameters.slot || parameters.charge || parameters.time;
    if (mainParam !== undefined && mainParam !== null) {
        command.effect = String(mainParam);
    }

    console.log('[hades2] Escribiendo comando:', JSON.stringify(command));

    _writeCommandToFile(command);

    return { success: true, message: `Comando '${commandId}' enviado`, command: commandId };
}

function _writeCommandToFile(command) {
    const files = getCommandFiles();
    const written = [];

    for (const filePath of files) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Read existing commands if file exists (append mode)
        let commands = [];
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8').trim();
                if (content) {
                    commands = JSON.parse(content);
                    if (!Array.isArray(commands)) commands = [];
                }
            }
        } catch (_) {
            commands = [];
        }

        commands.push(command);

        fs.writeFileSync(filePath, JSON.stringify(commands), 'utf8');
        written.push(filePath);
        console.log('[hades2] Archivo escrito:', filePath, `(${commands.length} comando(s))`);
    }

    if (written.length === 0) {
        throw new Error('No se pudo resolver una carpeta temporal para Hades II');
    }
}

// --- IPC HANDLERS ---

function registerIpcHandlers() {
    ipcMain.handle('hades2:isConnected', async (event, profileId) => {
        try {
            const processWatcher = require('../../../modules/processWatcher');
            const running = processWatcher.getRunning();
            if (!running[GAME_ID]) return false;
            if (!isModInstalled(profileId)) return false;
            // For file-based mods, if the game is running and mod is installed, we're connected
            return true;
        } catch (_) { return false; }
    });

    ipcMain.handle('hades2:executeEffect', async (event, command, parameters = {}) => {
        try {
            return await executeCommand(command, parameters);
        } catch (error) {
            throw error;
        }
    });

    ipcMain.handle('hades2:setGamePath', async (event, profileId, gamePath) => {
        try {
            if (gamePath === undefined && typeof profileId === 'string' && profileId.includes('\\')) {
                gamePath = profileId;
                profileId = null;
            }
            if (!gamePath) return { success: false, error: 'No path provided' };
            gamePath = normalizeGamePath(gamePath);
            if (!isValidGamePath(gamePath)) {
                return { success: false, error: 'Ruta invalida. Selecciona la carpeta raiz de Hades II.' };
            }
            saveGamePath(gamePath, profileId);
            return { success: true, gamePath };
        } catch (error) {
            console.error('[hades2] Error configurando ruta:', error);
            throw error;
        }
    });

    ipcMain.handle('hades2:getGamePath', async (event, profileId) => {
        const p = getGamePath(profileId);
        return p ? { path: p, gamePath: p, success: true } : null;
    });

    ipcMain.handle('hades2:checkModStatus', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };
            return { installed: isModInstalled(profileId), gamePath };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('hades2:installMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('Primero debes configurar la ruta del juego');

            const MOD_URL = 'https://storage.tikcontrol.live/games/hades2/mod.zip';
            const tmpZip = path.join(os.tmpdir(), 'tikcontrol-hades2-mod.zip');

            console.log('[hades2] Descargando mod...');
            await downloadModZip(MOD_URL, tmpZip, {
                expectedEntries: [
                    'Ship/d3d12.dll',
                    'Ship/ReturnOfModding/plugins/TikControl-TikControl/main.lua',
                    'Ship/ReturnOfModding/plugins/TikControl-TikControl/manifest.json'
                ],
                minBytes: 1024 * 100,
                onRetry: (attempt, error) => {
                    console.warn('[hades2] Reintentando descarga:', attempt + 1, error.message);
                }
            });

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tmpZip);
            const loaderStatus = checkLoaderCompatibility(gamePath, zip);
            if (loaderStatus.outdated) {
                try { fs.unlinkSync(tmpZip); } catch (_) {}
                return {
                    success: false,
                    error: loaderStatus.legacyShipContent
                        ? 'El paquete del mod de Hades II tiene un layout antiguo incompatible y necesita actualizarse.'
                        : 'El paquete del mod de Hades II no tiene el layout actualizado.',
                    loaderOutdated: true,
                    legacyShipContent: !!loaderStatus.legacyShipContent,
                    invalidLayout: !!loaderStatus.invalidLayout,
                    gameUpdatedAt: loaderStatus.gameTime,
                    modLoaderBuiltAt: loaderStatus.loaderTime,
                };
            }
            cleanupInstalledMod(gamePath);
            zip.extractAllTo(gamePath, true);
            console.log('[hades2] Mod extraido en:', gamePath);
            try { fs.unlinkSync(tmpZip); } catch (_) {}

            return { success: true, message: 'Mod de Hades II instalado correctamente.', modInstalled: true };
        } catch (error) {
            console.error('[hades2] Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('hades2:uninstallMod', async (event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (!gamePath) throw new Error('No hay ruta del juego configurada');

            const removed = cleanupInstalledMod(gamePath);

            return { success: true, message: 'Mod desinstalado correctamente', removed };
        } catch (error) {
            console.error('[hades2] Error desinstalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('hades2:launchGame', async (_event, profileId) => {
        try {
            const gamePath = getGamePath(profileId);
            if (gamePath) {
                const exePath = path.join(gamePath, 'Ship', 'Hades2.exe');
                if (fs.existsSync(exePath)) {
                    const { exec: execCmd } = require('child_process');
                    execCmd(`"${exePath}"`, { cwd: path.join(gamePath, 'Ship') });
                    console.log('[hades2] Lanzando desde exe:', exePath);
                    return { success: true, method: 'exe' };
                }
            }
            // Fallback: lanzar via Steam
            const { shell } = require('electron');
            await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
            console.log('[hades2] Lanzando via Steam');
            return { success: true, method: 'steam' };
        } catch (error) {
            console.error('[hades2] Error:', error);
            throw error;
        }
    });
}

// --- DOWNLOAD ---

async function _downloadFile(url, dest) {
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
