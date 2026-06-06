/**
 * Retro Rewind: Video Store Simulator - TikControl Integration Module
 * Uses UE4SS with file-based communication
 * Command file: %TEMP%\TikControl_RR_Command.txt
 */

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { resolveSetGamePathArgs } = require('../setGamePathArgs');

let mainWindow = null;
const COMMAND_FILE = path.join(os.tmpdir(), 'TikControl_RR_Command.txt');
const GAME_ID = 'retrorewind';
const GAME_NAME = 'Retro Rewind';
const STEAM_APP_ID = '3552140';

const DEFAULT_GAME_PATHS = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\RetroRewind\\RetroRewind\\Binaries\\Win64',
    'C:\\Program Files\\Steam\\steamapps\\common\\RetroRewind\\RetroRewind\\Binaries\\Win64',
    'D:\\Steam\\steamapps\\common\\RetroRewind\\RetroRewind\\Binaries\\Win64',
    'D:\\SteamLibrary\\steamapps\\common\\RetroRewind\\RetroRewind\\Binaries\\Win64'
];

const COMMANDS = {
    'give_money': { name: 'Dar dinero', category: 'Dinero' },
    'take_money': { name: 'Quitar dinero', category: 'Dinero' },
    'double_money': { name: 'Duplicar dinero', category: 'Dinero' },
    'bankrupt': { name: 'Bancarrota', category: 'Dinero' },
    'give_tapes': { name: 'Entregar cintas', category: 'Cintas' },
    'take_tapes': { name: 'Destruir cintas', category: 'Cintas' },
    'spawn_npc': { name: 'Invocar cliente', category: 'Clientes' },
    'rush_hour': { name: 'Hora punta', category: 'Clientes' },
    'banish_npcs': { name: 'Echar NPCs', category: 'Clientes' },
    'lights_off': { name: 'Apagar luces', category: 'Tienda' },
    'lights_on': { name: 'Encender luces', category: 'Tienda' },
    'toggle_sign': { name: 'Cambiar cartel', category: 'Tienda' },
    'restock_vendor': { name: 'Reponer mercado negro', category: 'Tienda' },
    'ring_phone': { name: 'Llamar al teléfono', category: 'Tienda' },
    'set_morning': { name: 'Poner mañana', category: 'Tiempo' },
    'set_night': { name: 'Poner noche', category: 'Tiempo' },
    'advance_time': { name: 'Adelantar horas', category: 'Tiempo' },
    'rewind_time': { name: 'Retroceder horas', category: 'Tiempo' },
    'give_xp': { name: 'Dar experiencia', category: 'XP' },
    'take_xp': { name: 'Quitar experiencia', category: 'XP' },
};

function findWin64Folder(inputPath) {
    if (!inputPath) return null;

    if (inputPath.endsWith('.exe')) {
        inputPath = path.dirname(inputPath);
    }

    if (inputPath.endsWith('Win64')) {
        return inputPath;
    }

    const possiblePaths = [
        path.join(inputPath, 'RetroRewind', 'Binaries', 'Win64'),
        path.join(inputPath, 'Binaries', 'Win64'),
        path.join(inputPath, 'Win64'),
        inputPath
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p) && fs.existsSync(path.join(p, 'RetroRewind-Win64-Shipping.exe'))) {
            return p;
        }
    }

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) return p;
    }

    return inputPath;
}

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    console.log(`[${GAME_ID}] Modulo inicializado`);
}

function getGamePath() {
    try {
        const configPath = path.join(require('electron').app.getPath('userData'), 'electron-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const saved = config[`${GAME_ID}_game_path`];
            if (saved && fs.existsSync(saved)) return saved;
        }
    } catch (err) {
        console.error(`[${GAME_ID}] Error obteniendo ruta:`, err);
    }
    try {
        const { findGamePath } = require('../steamDetect');
        const rootPath = findGamePath('RetroRewind', 'RetroRewind\\Binaries\\Win64\\RetroRewind-Win64-Shipping.exe');
        if (rootPath) {
            const win64Path = findWin64Folder(rootPath);
            if (win64Path) {
                saveGamePath(win64Path);
                return win64Path;
            }
        }
    } catch (_) {}
    for (const p of DEFAULT_GAME_PATHS) {
        if (fs.existsSync(p)) {
            saveGamePath(p);
            return p;
        }
    }
    return null;
}

function saveGamePath(gamePath) {
    try {
        const configPath = path.join(require('electron').app.getPath('userData'), 'electron-config.json');
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        config[`${GAME_ID}_game_path`] = gamePath;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`[${GAME_ID}] Ruta guardada:`, gamePath);
    } catch (err) {
        console.error(`[${GAME_ID}] Error guardando ruta:`, err);
    }
}

async function executeCommand(command, parameters = {}) {
    return new Promise((resolve, reject) => {
        try {
            let fullCommand = command;
            if (parameters.quantity !== undefined && parameters.quantity !== null) {
                fullCommand = `${command}:${parameters.quantity}`;
            }

            const username = parameters.username || '';
            if (username) {
                fullCommand += `|${username}`;
            }

            fs.writeFileSync(COMMAND_FILE, fullCommand, 'utf8');
            console.log(`[${GAME_ID}] Comando enviado:`, fullCommand);

            resolve({
                success: true,
                message: `Comando '${fullCommand}' enviado al juego`,
                command: fullCommand
            });
        } catch (err) {
            console.error(`[${GAME_ID}] Error enviando comando:`, err);
            reject(new Error('Error enviando comando: ' + err.message));
        }
    });
}

function isModInstalled() {
    const gamePath = getGamePath();
    if (!gamePath) return false;

    const newPath = path.join(gamePath, 'ue4ss', 'Mods', 'TikControlRetroRewind', 'Scripts', 'main.lua');
    const legacyPath = path.join(gamePath, 'Mods', 'TikControlRetroRewind', 'Scripts', 'main.lua');
    return fs.existsSync(newPath) || fs.existsSync(legacyPath);
}

function isUE4SSInstalled() {
    const gamePath = getGamePath();
    if (!gamePath) return false;

    const newPath = path.join(gamePath, 'ue4ss', 'UE4SS.dll');
    const legacyPath = path.join(gamePath, 'UE4SS.dll');
    return fs.existsSync(newPath) || fs.existsSync(legacyPath);
}

function registerIpcHandlers() {
    ipcMain.handle(`${GAME_ID}:executeEffect`, async (event, command, parameters = {}) => {
        try {
            return await executeCommand(command, parameters);
        } catch (error) {
            throw error;
        }
    });

    ipcMain.handle(`${GAME_ID}:isConnected`, () => {
        const processWatcher = require('../../../modules/processWatcher');
        const running = processWatcher.getRunning();
        return isModInstalled() && !!running[GAME_ID];
    });

    ipcMain.handle(`${GAME_ID}:getStatus`, () => {
        const processWatcher = require('../../../modules/processWatcher');
        const running = processWatcher.getRunning();
        return {
            connected: isModInstalled() && !!running[GAME_ID],
            gamePath: getGamePath(),
            ue4ssInstalled: isUE4SSInstalled(),
            modInstalled: isModInstalled()
        };
    });

    ipcMain.handle(`${GAME_ID}:getCommands`, () => {
        return COMMANDS;
    });

    ipcMain.handle(`${GAME_ID}:getGamePath`, () => getGamePath());

    ipcMain.handle(`${GAME_ID}:setGamePath`, async (event, a, b) => {
        const { path: raw } = resolveSetGamePathArgs(a, b);
        if (raw && fs.existsSync(raw)) {
            const win64Path = findWin64Folder(raw);
            console.log(`[${GAME_ID}] Path received:`, raw);
            console.log(`[${GAME_ID}] Win64 detected:`, win64Path);
            saveGamePath(win64Path);
            return { success: true, path: win64Path };
        }
        return { success: false, error: 'Ruta no valida' };
    });

    ipcMain.handle(`${GAME_ID}:selectGamePath`, async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar carpeta Win64 de Retro Rewind',
            properties: ['openDirectory']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const selectedPath = result.filePaths[0];
            saveGamePath(selectedPath);
            return { success: true, path: selectedPath };
        }
        return { success: false, error: 'No se selecciono ninguna carpeta' };
    });

    ipcMain.handle(`${GAME_ID}:findGame`, async () => {
        for (const p of DEFAULT_GAME_PATHS) {
            if (fs.existsSync(p)) {
                saveGamePath(p);
                return { success: true, path: p };
            }
        }
        return { success: false, error: 'Juego no encontrado. Por favor selecciona la ruta manualmente.' };
    });

    ipcMain.handle(`${GAME_ID}:checkModStatus`, async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };

            return {
                installed: isModInstalled(),
                ue4ssInstalled: isUE4SSInstalled(),
                gamePath: gamePath
            };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle(`${GAME_ID}:installMod`, async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) {
                throw new Error('Primero debes configurar la ruta del juego');
            }

            const MOD_URL = 'https://storage.tikcontrol.live/games/retrorewind/mod.zip';
            const tmpZip = path.join(os.tmpdir(), 'tikcontrol-retrorewind-mod.zip');

            console.log(`[${GAME_ID}] Descargando mod desde AWS...`);
            await _downloadFile(MOD_URL, tmpZip);

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tmpZip);

            zip.extractAllTo(gamePath, true);
            console.log(`[${GAME_ID}] Mod + UE4SS extraído en ${gamePath}`);

            try { fs.unlinkSync(tmpZip); } catch (_) {}

            return {
                success: true,
                message: 'Mod + UE4SS de TikControl instalado correctamente.',
                modInstalled: true
            };
        } catch (error) {
            console.error(`[${GAME_ID}] Error instalando mod:`, error);
            throw error;
        }
    });

    ipcMain.handle(`${GAME_ID}:uninstallMod`, async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) {
                throw new Error('No hay ruta del juego configurada');
            }

            const ue4ssModDir = path.join(gamePath, 'ue4ss', 'Mods', 'TikControlRetroRewind');
            const legacyModDir = path.join(gamePath, 'Mods', 'TikControlRetroRewind');
            for (const dir of [ue4ssModDir, legacyModDir]) {
                if (fs.existsSync(dir)) {
                    fs.rmSync(dir, { recursive: true });
                    console.log(`[${GAME_ID}] Mod desinstalado de ${dir}`);
                }
            }

            return { success: true, message: 'Mod desinstalado correctamente' };
        } catch (error) {
            console.error(`[${GAME_ID}] Error desinstalando mod:`, error);
            throw error;
        }
    });

    ipcMain.handle(`${GAME_ID}:launchGame`, async () => {
        try {
            const { shell } = require('electron');
            await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
            return { success: true, method: 'steam' };
        } catch (error) {
            console.error(`[${GAME_ID}] Error:`, error);
            throw error;
        }
    });
}

function _downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const https = require('https');
        const file = fs.createWriteStream(dest);
        const get = (u) => https.get(u, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) return get(res.headers.location);
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
        get(url);
    });
}

module.exports = {
    initialize,
    executeCommand,
    isConnected: () => {
        const processWatcher = require('../../../modules/processWatcher');
        return isModInstalled() && !!processWatcher.getRunning()[GAME_ID];
    },
    getGamePath,
    COMMANDS
};
