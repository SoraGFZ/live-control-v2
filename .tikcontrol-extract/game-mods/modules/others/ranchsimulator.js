/**
 * Ranch Simulator - TikControl integration module.
 * UE4SS reads commands from a local file because the game has no network bridge.
 */

const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { resolveSetGamePathArgs } = require('../setGamePathArgs');

let mainWindow = null;

const GAME_ID = 'ranchsimulator';
const GAME_NAME = 'Ranch Simulator';
const STEAM_APP_ID = '1119730';

const COMMAND_FILES = [
    path.join(os.tmpdir(), 'TikControl_Command.txt')
];
const STATUS_FILES = [
    path.join(os.tmpdir(), 'TikControl_RanchSimulator_Status.json')
];
const RESULT_FILES = [
    path.join(os.tmpdir(), 'TikControl_RanchSimulator_Result.json')
];

const COMMANDS_JSON_PATH = path.resolve(__dirname, '..', '..', 'aws', 'ranchsimulator', 'commands.json');
const MOD_URL = 'https://storage.tikcontrol.live/games/ranchsimulator/mod.zip?v=18';
const UE4SS_URL = 'https://github.com/UE4SS-RE/RE-UE4SS/releases/download/v3.0.1/UE4SS_v3.0.1.zip';

const DEFAULT_GAME_PATHS = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Ranch Simulator\\Ranch_Simulator\\Binaries\\Win64',
    'C:\\Program Files\\Steam\\steamapps\\common\\Ranch Simulator\\Ranch_Simulator\\Binaries\\Win64',
    'D:\\Steam\\steamapps\\common\\Ranch Simulator\\Ranch_Simulator\\Binaries\\Win64',
    'D:\\SteamLibrary\\steamapps\\common\\Ranch Simulator\\Ranch_Simulator\\Binaries\\Win64',
    'E:\\SteamLibrary\\steamapps\\common\\Ranch Simulator\\Ranch_Simulator\\Binaries\\Win64',
    'F:\\SteamLibrary\\steamapps\\common\\Ranch Simulator\\Ranch_Simulator\\Binaries\\Win64'
];

const LEGACY_COMMAND_ALIASES = {
    add_money_100: { command: 'add_money', value: 100 },
    add_money_1000: { command: 'add_money', value: 1000 },
    add_money_10000: { command: 'add_money', value: 10000 },
    remove_money_100: { command: 'remove_money', value: 100 },
    remove_money_1000: { command: 'remove_money', value: 1000 },
    remove_money_half: { command: 'remove_money_half' },
    remove_money_all: { command: 'remove_money_all' }
};

let commandCatalogCache = null;

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    console.log(`[${GAME_ID}] Module initialized`);
}

function getConfigPath() {
    return path.join(app.getPath('userData'), 'electron-config.json');
}

function normalizeSlashes(value) {
    return String(value || '').replace(/[\\/]+$/, '');
}

function findWin64Folder(inputPath) {
    if (!inputPath) return null;

    let normalized = normalizeSlashes(inputPath);
    if (normalized.toLowerCase().endsWith('.exe')) normalized = path.dirname(normalized);
    if (path.basename(normalized).toLowerCase() === 'win64') return normalized;

    const possiblePaths = [
        path.join(normalized, 'Ranch_Simulator', 'Binaries', 'Win64'),
        path.join(normalized, 'Binaries', 'Win64'),
        path.join(normalized, 'Win64'),
        normalized
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(path.join(p, 'Ranch_Simulator-Win64-Shipping.exe'))) return p;
    }

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) return p;
    }

    return normalized;
}

function getGamePath() {
    try {
        const configPath = getConfigPath();
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const saved = config.ranchsimulator_game_path;
            if (saved && fs.existsSync(saved)) return findWin64Folder(saved);
        }
    } catch (err) {
        console.error(`[${GAME_ID}] Error reading path:`, err);
    }

    try {
        const { findGamePath } = require('../steamDetect');
        const rootPath = findGamePath('Ranch Simulator', 'Ranch_Simulator/Binaries/Win64/Ranch_Simulator-Win64-Shipping.exe');
        if (rootPath) {
            const win64Path = findWin64Folder(rootPath);
            saveGamePath(win64Path);
            return win64Path;
        }
    } catch (_) {}

    for (const p of DEFAULT_GAME_PATHS) {
        if (fs.existsSync(path.join(p, 'Ranch_Simulator-Win64-Shipping.exe'))) {
            saveGamePath(p);
            return p;
        }
    }

    return null;
}

function saveGamePath(gamePath) {
    try {
        const configPath = getConfigPath();
        let config = {};
        if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.ranchsimulator_game_path = gamePath;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        console.log(`[${GAME_ID}] Saved path:`, gamePath);
    } catch (err) {
        console.error(`[${GAME_ID}] Error saving path:`, err);
    }
}

function pickLocalizedName(value) {
    if (!value || typeof value !== 'object') return value || '';
    return value.es || value.en || Object.values(value).find(Boolean) || '';
}

function loadCommandsJson() {
    if (commandCatalogCache) return commandCatalogCache;

    try {
        const data = JSON.parse(fs.readFileSync(COMMANDS_JSON_PATH, 'utf8'));
        const categories = data.categories || {};
        const commands = {};
        for (const cmd of data.commands || []) {
            const category = cmd.category || 'misc';
            commands[cmd.id] = {
                id: cmd.id,
                name: pickLocalizedName(cmd.name) || cmd.id,
                description: cmd.description || '',
                category: pickLocalizedName(categories[category]?.name) || category,
                quantity: cmd.quantity || null,
                image: cmd.image || null
            };
        }
        commandCatalogCache = commands;
        return commands;
    } catch (err) {
        console.warn(`[${GAME_ID}] Could not read commands.json:`, err.message);
        commandCatalogCache = {
            add_money: { id: 'add_money', name: 'Add money', category: 'Money', quantity: { value: 1000 } },
            remove_money: { id: 'remove_money', name: 'Remove money', category: 'Money', quantity: { value: 1000 } },
            remove_money_half: { id: 'remove_money_half', name: 'Remove half money', category: 'Money' },
            remove_money_all: { id: 'remove_money_all', name: 'Remove all money', category: 'Money' },
            teleport_random: { id: 'teleport_random', name: 'Random teleport', category: 'Teleport', quantity: { value: 5000 } },
            teleport_sky: { id: 'teleport_sky', name: 'Launch to sky', category: 'Teleport', quantity: { value: 5000 } },
            teleport_up: { id: 'teleport_up', name: 'Go up', category: 'Teleport', quantity: { value: 100 } }
        };
        return commandCatalogCache;
    }
}

function flattenParameters(parameters = {}) {
    if (parameters == null) return {};
    if (typeof parameters !== 'object') return { value: parameters };
    return {
        ...parameters,
        ...(parameters.gameEffectOptions || {}),
        ...(parameters.ranchsimulatorParameters || {}),
        ...(parameters.gameParameters || {})
    };
}

function getParameterValue(parameters = {}) {
    const flat = flattenParameters(parameters);
    const directKeys = [
        'quantity',
        'amount',
        'value',
        'count',
        'parameterValue',
        '_customParam',
        'param_value',
        'height',
        'range',
        'distance'
    ];

    for (const key of directKeys) {
        if (flat[key] !== undefined && flat[key] !== null && flat[key] !== '') return flat[key];
    }

    for (const [key, value] of Object.entries(flat)) {
        if (key.startsWith('param_') && value !== undefined && value !== null && value !== '') return value;
    }

    return null;
}

function cleanCommandPart(value) {
    return String(value ?? '')
        .trim()
        .replace(/[\r\n]/g, '')
        .replace(/[|?].*$/g, '');
}

function commandAcceptsValue(command) {
    const catalog = loadCommandsJson();
    if (catalog[command]) return !!catalog[command].quantity;
    return /^(add_money|remove_money|teleport_)/.test(command);
}

function isSupportedCommand(command) {
    const catalog = loadCommandsJson();
    return !!catalog[command] || command === 'show_money';
}

function buildCommand(command, parameters = {}) {
    const rawCommand = cleanCommandPart(command);
    if (!rawCommand) throw new Error('Comando vacio');
    if (rawCommand.includes(':')) return rawCommand;

    const alias = LEGACY_COMMAND_ALIASES[rawCommand];
    const normalizedCommand = alias?.command || rawCommand;
    if (!isSupportedCommand(normalizedCommand)) {
        throw new Error(`Comando de Ranch Simulator no soportado: ${normalizedCommand}`);
    }

    let value = getParameterValue(parameters);
    if ((value === null || value === undefined || value === '') && alias?.value !== undefined) value = alias.value;

    if (value !== null && value !== undefined && value !== '' && commandAcceptsValue(normalizedCommand)) {
        return `${normalizedCommand}:${cleanCommandPart(value)}`;
    }

    return normalizedCommand;
}

function writeCommandToFile(fullCommand) {
    let lastError = null;

    for (const filePath of COMMAND_FILES) {
        try {
            fs.appendFileSync(filePath, `${fullCommand}\n`, 'utf8');
            console.log(`[${GAME_ID}] Command sent:`, fullCommand, '->', filePath);
            return filePath;
        } catch (err) {
            lastError = err;
            console.warn(`[${GAME_ID}] Could not write command file ${filePath}:`, err.message);
        }
    }

    throw lastError || new Error('No command file could be written');
}

async function executeCommand(command, parameters = {}) {
    try {
        const fullCommand = buildCommand(command, parameters);
        const filePath = writeCommandToFile(fullCommand);
        return {
            success: true,
            message: `Comando '${fullCommand}' enviado al juego`,
            command: fullCommand,
            filePath
        };
    } catch (err) {
        console.error(`[${GAME_ID}] Error sending command:`, err);
        throw new Error('Error enviando comando: ' + err.message);
    }
}

function getInstallPaths(gamePath = getGamePath()) {
    if (!gamePath) return {};
    const legacyModDir = path.join(gamePath, 'Mods', 'TikControlExplorer');
    const ue4ssModDir = path.join(gamePath, 'ue4ss', 'Mods', 'TikControlExplorer');
    return {
        gamePath,
        legacyModDir,
        ue4ssModDir,
        legacyLua: path.join(legacyModDir, 'Scripts', 'main.lua'),
        ue4ssLua: path.join(ue4ssModDir, 'Scripts', 'main.lua'),
        legacyUE4SS: path.join(gamePath, 'UE4SS.dll'),
        ue4ssUE4SS: path.join(gamePath, 'ue4ss', 'UE4SS.dll')
    };
}

function isModInstalled() {
    const p = getInstallPaths();
    return !!(p.legacyLua && (fs.existsSync(p.legacyLua) || fs.existsSync(p.ue4ssLua)));
}

function isUE4SSInstalled() {
    const p = getInstallPaths();
    return !!(p.legacyUE4SS && (fs.existsSync(p.legacyUE4SS) || fs.existsSync(p.ue4ssUE4SS)));
}

function getRuntimeStatus() {
    for (const filePath of STATUS_FILES) {
        try {
            if (!fs.existsSync(filePath)) continue;
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const stat = fs.statSync(filePath);
            return {
                ...data,
                filePath,
                ageMs: Date.now() - stat.mtimeMs,
                fresh: Date.now() - stat.mtimeMs < 15000
            };
        } catch (_) {}
    }
    return null;
}

function canWriteCommandFile() {
    try {
        const fd = fs.openSync(COMMAND_FILES[0], 'a');
        fs.closeSync(fd);
        return true;
    } catch (_) {
        return false;
    }
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyDirectory(src, dest) {
    if (!fs.existsSync(src)) return;
    ensureDir(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDirectory(from, to);
        else fs.copyFileSync(from, to);
    }
}

function mirrorLegacyModToUE4SS(gamePath) {
    const legacy = path.join(gamePath, 'Mods', 'TikControlExplorer');
    const ue4ssRoot = path.join(gamePath, 'ue4ss');
    const ue4ss = path.join(ue4ssRoot, 'Mods', 'TikControlExplorer');
    if (fs.existsSync(legacy) && fs.existsSync(ue4ssRoot)) copyDirectory(legacy, ue4ss);
}

function disableNoisyBuiltInMods(gamePath) {
    const modsRoot = path.join(gamePath, 'Mods');
    for (const modName of ['ActorDumperMod']) {
        const enabledPath = path.join(modsRoot, modName, 'enabled.txt');
        if (!fs.existsSync(enabledPath)) continue;
        try {
            fs.unlinkSync(enabledPath);
        } catch (err) {
            console.warn(`[${GAME_ID}] Could not disable ${modName}:`, err.message);
        }
    }
}

async function ensureUE4SSInstalled(gamePath) {
    if (isUE4SSInstalled()) return { installed: true, downloaded: false };

    const tmpZip = path.join(os.tmpdir(), 'tikcontrol-ue4ss-v3.0.1.zip');
    console.log(`[${GAME_ID}] UE4SS not found. Downloading v3.0.1...`);
    await downloadFile(UE4SS_URL, tmpZip);

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(tmpZip);
    const requiredEntries = ['UE4SS.dll', 'dwmapi.dll', 'UE4SS-settings.ini', 'Mods/mods.txt'];
    const missing = requiredEntries.filter(entry => !zip.getEntry(entry));
    if (missing.length) {
        try { fs.unlinkSync(tmpZip); } catch (_) {}
        throw new Error(`El paquete UE4SS no contiene: ${missing.join(', ')}`);
    }

    zip.extractAllTo(gamePath, true);
    const oldXinputProxy = path.join(gamePath, 'xinput1_3.dll');
    if (fs.existsSync(oldXinputProxy)) {
        const backupPath = path.join(gamePath, 'xinput1_3.dll.tikcontrol.bak');
        try {
            if (!fs.existsSync(backupPath)) fs.renameSync(oldXinputProxy, backupPath);
            else fs.unlinkSync(oldXinputProxy);
        } catch (err) {
            console.warn(`[${GAME_ID}] Could not disable old xinput1_3.dll proxy:`, err.message);
        }
    }
    disableNoisyBuiltInMods(gamePath);
    try { fs.unlinkSync(tmpZip); } catch (_) {}

    return { installed: isUE4SSInstalled(), downloaded: true };
}

function registerIpcHandlers() {
    ipcMain.handle('ranchsimulator:executeEffect', async (event, command, parameters = {}) => executeCommand(command, parameters));

    ipcMain.handle('ranchsimulator:isConnected', () => {
        const processWatcher = require('../../../modules/processWatcher');
        const running = processWatcher.getRunning();
        return isModInstalled() && isUE4SSInstalled() && !!running[GAME_ID];
    });

    ipcMain.handle('ranchsimulator:getStatus', () => {
        const processWatcher = require('../../../modules/processWatcher');
        const running = processWatcher.getRunning();
        const modInstalled = isModInstalled();
        const ue4ssInstalled = isUE4SSInstalled();
        return {
            connected: modInstalled && ue4ssInstalled && !!running[GAME_ID],
            gamePath: getGamePath(),
            ue4ssInstalled,
            modInstalled,
            commandFileWritable: canWriteCommandFile(),
            commandFiles: COMMAND_FILES,
            runtime: getRuntimeStatus()
        };
    });

    ipcMain.handle('ranchsimulator:getCommands', () => loadCommandsJson());
    ipcMain.handle('ranchsimulator:getGamePath', () => getGamePath());

    ipcMain.handle('ranchsimulator:setGamePath', async (event, a, b) => {
        const { path: raw } = resolveSetGamePathArgs(a, b);
        if (raw && fs.existsSync(raw)) {
            const win64Path = findWin64Folder(raw);
            saveGamePath(win64Path);
            return { success: true, path: win64Path };
        }
        return { success: false, error: 'Ruta no valida' };
    });

    ipcMain.handle('ranchsimulator:selectGamePath', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar carpeta de Ranch Simulator',
            properties: ['openDirectory']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const win64Path = findWin64Folder(result.filePaths[0]);
            saveGamePath(win64Path);
            return { success: true, path: win64Path };
        }
        return { success: false, error: 'No se selecciono ninguna carpeta' };
    });

    ipcMain.handle('ranchsimulator:findGame', async () => {
        const gamePath = getGamePath();
        if (gamePath) return { success: true, path: gamePath };
        return { success: false, error: 'Juego no encontrado. Por favor selecciona la ruta manualmente.' };
    });

    ipcMain.handle('ranchsimulator:checkModStatus', async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };
            const modInstalled = isModInstalled();
            const ue4ssInstalled = isUE4SSInstalled();
            return {
                installed: modInstalled && ue4ssInstalled,
                modInstalled,
                ue4ssInstalled,
                gamePath,
                commandFileWritable: canWriteCommandFile(),
                runtime: getRuntimeStatus()
            };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('ranchsimulator:installMod', async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) throw new Error('Primero debes configurar la ruta del juego');

            const ue4ssResult = await ensureUE4SSInstalled(gamePath);
            disableNoisyBuiltInMods(gamePath);

            const tmpZip = path.join(os.tmpdir(), 'tikcontrol-ranchsimulator-mod.zip');
            console.log(`[${GAME_ID}] Downloading mod package...`);
            await downloadFile(MOD_URL, tmpZip);

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tmpZip);
            zip.extractAllTo(gamePath, true);
            try { fs.unlinkSync(tmpZip); } catch (_) {}

            mirrorLegacyModToUE4SS(gamePath);

            const ue4ssInstalled = isUE4SSInstalled();
            const message = ue4ssInstalled
                ? (ue4ssResult.downloaded
                    ? 'Mod de TikControl y UE4SS instalados correctamente. Inicia Ranch Simulator para conectar.'
                    : 'Mod de TikControl instalado correctamente. Inicia Ranch Simulator para conectar.')
                : 'Mod instalado, pero falta UE4SS en la carpeta Win64. Instala UE4SS para que el mod pueda cargarse.';

            return {
                success: true,
                message,
                modInstalled: isModInstalled(),
                ue4ssInstalled,
                requiresUE4SS: !ue4ssInstalled
            };
        } catch (error) {
            console.error(`[${GAME_ID}] Error installing mod:`, error);
            throw error;
        }
    });

    ipcMain.handle('ranchsimulator:uninstallMod', async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) throw new Error('No hay ruta del juego configurada');

            const { ue4ssModDir, legacyModDir } = getInstallPaths(gamePath);
            for (const dir of [ue4ssModDir, legacyModDir]) {
                if (dir && fs.existsSync(dir)) {
                    fs.rmSync(dir, { recursive: true, force: true });
                    console.log(`[${GAME_ID}] Removed mod from`, dir);
                }
            }
            for (const filePath of [...COMMAND_FILES, ...STATUS_FILES, ...RESULT_FILES]) {
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
            }

            return { success: true, message: 'Mod desinstalado correctamente' };
        } catch (error) {
            console.error(`[${GAME_ID}] Error uninstalling mod:`, error);
            throw error;
        }
    });

    ipcMain.handle('ranchsimulator:launchGame', async () => {
        try {
            const { shell } = require('electron');
            await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
            return { success: true, method: 'steam' };
        } catch (error) {
            console.error(`[${GAME_ID}] Error launching game:`, error);
            throw error;
        }
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const get = (u, redirects = 0) => https.get(u, { headers: { 'User-Agent': 'TikControl/1.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
                return get(res.headers.location, redirects + 1);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (e) => {
            fs.unlink(dest, () => {});
            reject(e);
        });
        get(url);
    });
}

module.exports = {
    initialize,
    executeCommand,
    isConnected: () => {
        const processWatcher = require('../../../modules/processWatcher');
        return isModInstalled() && isUE4SSInstalled() && !!processWatcher.getRunning()[GAME_ID];
    },
    getGamePath,
    COMMANDS: loadCommandsJson(),
    GAME_NAME
};
