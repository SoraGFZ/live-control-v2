/**
 * Resident Evil 4 (2023) - Módulo TikControl
 * Comunicación basada en archivos con el bridge Lua (TikControlRE4.lua)
 * que redirige comandos al motor de efectos (CCRE4.lua)
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { ipcMain, dialog, shell } = require('electron');
const { findGamePath } = require('../steamDetect');
const { resolveSetGamePathArgs } = require('../setGamePathArgs');

const HTTPBRIDGE_PORT = 8082;
const HTTPBRIDGE_ENDPOINT = '/trigger_effect';

function log(msg) { console.log(`[re4] ${msg}`); }
function logError(msg, err) { console.error(`[re4] ${msg}`, err || ''); }

function downloadFile(url, dest) {
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

const STEAM_ID = '2050650';
const CMD_FILENAME = 'tikcontrol_cmd.json';
const RES_FILENAME = 'tikcontrol_res.json';

let mainWindow = null;
let gamePath = '';
let isConnected = false;
let connectionCheckTimer = null;
let requestId = 0;

function getCmdFilePath() {
    return path.join(gamePath, 'reframework', 'data', CMD_FILENAME);
}

function getResFilePath() {
    return path.join(gamePath, 'reframework', 'data', RES_FILENAME);
}

function initialize(window) {
    mainWindow = window;
    loadSavedGamePath();
    registerIpcHandlers();
    startConnectionMonitor();
    log('Módulo RE4 inicializado (file-based bridge)');
}

function loadSavedGamePath() {
    try {
        const configPath = path.join(process.env.APPDATA || '', 'TikControl', 're4-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            gamePath = config.gamePath || '';
        }
    } catch (e) { logError('Error cargando config:', e); }
}

function saveGamePath(newPath) {
    try {
        const configDir = path.join(process.env.APPDATA || '', 'TikControl');
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, 're4-config.json'), JSON.stringify({ gamePath: newPath }));
        gamePath = newPath;
    } catch (e) { logError('Error guardando config:', e); }
}

// ==================== CONNECTION MONITOR ====================

function checkConnection() {
    if (!gamePath) {
        updateConnectionStatus(false);
        return;
    }
    const reframeworkDir = path.join(gamePath, 'reframework');
    const ccre4Path = path.join(reframeworkDir, 'autorun', 'CCRE4.lua');
    const bridgePath = path.join(reframeworkDir, 'autorun', 'TikControlRE4.lua');
    const gameExe = path.join(gamePath, 're4.exe');

    const hasGame = fs.existsSync(gameExe);
    const hasBridge = fs.existsSync(bridgePath);
    const hasEffects = fs.existsSync(ccre4Path);
    const hasReframework = fs.existsSync(path.join(gamePath, 'dinput8.dll'));

    const ready = hasGame && hasBridge && hasEffects && hasReframework;

    if (ready) {
        patchInstalledEffectsScript();
    }

    if (ready && !isConnected) {
        try {
            const cmdDir = path.dirname(getCmdFilePath());
            if (fs.existsSync(cmdDir)) {
                updateConnectionStatus(true);
            }
        } catch (e) {
            updateConnectionStatus(false);
        }
    } else if (!ready && isConnected) {
        updateConnectionStatus(false);
    }
}

function updateConnectionStatus(connected) {
    if (isConnected === connected) return;
    isConnected = connected;
    log(connected ? '✅ Bridge RE4 listo' : 'Bridge RE4 no disponible');
    if (mainWindow) {
        mainWindow.webContents.send('re4:connected', connected);
    }
}

function startConnectionMonitor() {
    checkConnection();
    connectionCheckTimer = setInterval(checkConnection, 5000);
}

// ==================== HTTP BRIDGE (for spawn commands via HttpBridge.dll) ====================

const HTTP_BRIDGE_COMMANDS = new Set([
    'giant_player', 'mini_player', 'heal_player', 'god_mode',
    'superspeed', 'auto_parry', 'sky_drop', 'rewind_time',
    'nuke_enemies', 'invisibility', 'glass_cannon', 'rambo_mode',
    'golden_spiders', 'wide_fov', 'slow_motion'
]);

const FILE_BRIDGE_ALIASES = new Map([
    ['kill_player', 'kill'],
    ['matar_jugador', 'kill'],
    ['heal_player', 'heal'],
    ['giant_player', 'giant'],
    ['mini_player', 'tiny'],
    ['small_player', 'tiny'],
    ['player_giant', 'giant'],
    ['player_tiny', 'tiny'],
    ['player_small', 'tiny'],
    ['player_mutant', 'mutant'],
    ['player_fast', 'fast'],
    ['player_slow', 'slow'],
    ['player_hyper', 'hyper'],
    ['superspeed', 'fast'],
    ['enemy_fast', 'efast'],
    ['enemy_slow', 'eslow'],
    ['enemy_giant', 'egiant'],
    ['enemy_tiny', 'etiny'],
    ['enemy_small', 'etiny'],
    ['companion_heal', 'pheal'],
    ['companion_full', 'pfull'],
    ['companion_onehp', 'ponehp'],
    ['companion_invul', 'pinvul'],
    ['companion_ohko', 'pohko'],
    ['companion_fast', 'pfast'],
    ['companion_slow', 'pslow'],
    ['companion_hyper', 'phyper'],
    ['companion_giant', 'pgiant'],
    ['companion_tiny', 'ptiny'],
    ['companion_small', 'ptiny'],
    ['companion_mutant', 'pmutant'],
    ['camera_wide', 'wide'],
    ['wide_camera', 'wide'],
    ['camera_narrow', 'narrow'],
    ['narrow_camera', 'narrow'],
    ['camera_invert', 'invert'],
    ['invert_camera', 'invert'],
    ['give_random_item', 'give'],
    ['random_item', 'give'],
    ['giveweap_m3', 'giveweap_shotgun'],
    ['giveweap_arrows', 'giveammo_bolts'],
    ['giveammo_arrows', 'giveammo_bolts'],
    ['giveammo_flechas', 'giveammo_bolts'],
    ['giveammo_smg', 'giveammo_submachine'],
    ['giveammo_magnum', 'giveammo_mag'],
    ['giveammo_mines', 'giveammo_mine'],
    ['giveammo_bolt', 'giveammo_bolts']
]);

const HTTP_COMMAND_ALIASES = new Map([
    ['giveweap_heavy', 'give_item:heavy_grenade'],
    ['giveweap_heavygrenade', 'give_item:heavy_grenade'],
    ['giveweap_heavy_grenade', 'give_item:heavy_grenade'],
    ['give_item:heavy', 'give_item:heavy_grenade'],
    ['give_item:pesetas_money', 'give_item:pesetas'],
    ['give_item:smallkey', 'give_item:small_key']
]);

const GIVE_ITEM_FILE_ALIASES = new Map([
    ['green_herb', 'giveheal_herbg'],
    ['herb_green', 'giveheal_herbg'],
    ['herbg', 'giveheal_herbg'],
    ['hierba_verde', 'giveheal_herbg'],
    ['red_herb', 'giveheal_herbr'],
    ['herb_red', 'giveheal_herbr'],
    ['herbr', 'giveheal_herbr'],
    ['hierba_roja', 'giveheal_herbr'],
    ['yellow_herb', 'giveheal_herbb'],
    ['herb_yellow', 'giveheal_herbb'],
    ['herby', 'giveheal_herbb'],
    ['herbb', 'giveheal_herbb'],
    ['hierba_amarilla', 'giveheal_herbb'],
    ['mixed_herb', 'giveheal_herbgrb'],
    ['mixed_herb_g_r_y', 'giveheal_herbgrb'],
    ['mixed_green_red_yellow', 'giveheal_herbgrb'],
    ['herb_mixed', 'giveheal_herbgrb'],
    ['herbgrb', 'giveheal_herbgrb'],
    ['hierba_mixta', 'giveheal_herbgrb'],
    ['first_aid_spray', 'giveheal_spray'],
    ['spray', 'giveheal_spray'],
    ['ammo_handgun', 'giveammo_handgun'],
    ['handgun_ammo', 'giveammo_handgun'],
    ['ammo_pistol', 'giveammo_handgun'],
    ['balas_pistola', 'giveammo_handgun'],
    ['ammo_shotgun', 'giveammo_shotgun'],
    ['shotgun_shells', 'giveammo_shotgun'],
    ['cartuchos_escopeta', 'giveammo_shotgun'],
    ['ammo_rifle', 'giveammo_rifle'],
    ['rifle_ammo', 'giveammo_rifle'],
    ['balas_rifle', 'giveammo_rifle'],
    ['ammo_smg', 'giveammo_submachine'],
    ['ammo_submachine', 'giveammo_submachine'],
    ['submachine_ammo', 'giveammo_submachine'],
    ['balas_smg', 'giveammo_submachine'],
    ['balas_subfusil', 'giveammo_submachine'],
    ['ammo_magnum', 'giveammo_mag'],
    ['magnum_ammo', 'giveammo_mag'],
    ['balas_magnum', 'giveammo_mag'],
    ['bolts', 'giveammo_bolts'],
    ['arrows', 'giveammo_bolts'],
    ['flechas', 'giveammo_bolts'],
    ['mines', 'giveammo_mine'],
    ['minas', 'giveammo_mine'],
    ['grenade', 'giveweap_grenade'],
    ['hand_grenade', 'giveweap_grenade'],
    ['granada', 'giveweap_grenade'],
    ['flash_grenade', 'giveweap_flash'],
    ['granada_flash', 'giveweap_flash']
]);

const TIMED_FILE_COMMANDS = new Set([
    'invul', 'ohko', 'fast', 'slow', 'hyper',
    'giant', 'tiny', 'mutant',
    'pfast', 'pslow', 'phyper', 'pgiant', 'ptiny', 'pmutant', 'pinvul', 'pohko',
    'efast', 'eslow', 'egiant', 'etiny',
    'wide', 'narrow', 'invert'
]);

const DEFAULT_DURATIONS_SECONDS = new Map([
    ['fast', 20],
    ['slow', 20],
    ['hyper', 20],
    ['pfast', 20],
    ['pslow', 20],
    ['phyper', 20],
    ['efast', 20],
    ['eslow', 20],
    ['wide', 20],
    ['narrow', 20],
    ['invert', 20]
]);

function isHttpBridgeCommand(command) {
    const baseName = command.split(':')[0].split('/')[0];
    return baseName.startsWith('spawn_') ||
           baseName.startsWith('freeze_') ||
           baseName.startsWith('give_item') ||
           HTTP_BRIDGE_COMMANDS.has(command.split(':')[0]);
}

function normalizeEffectName(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function normalizeCommand(command) {
    const original = String(command || '').trim();
    if (!original) return { command: original, forceFileBridge: false };

    if (FILE_BRIDGE_ALIASES.has(original)) {
        return { command: FILE_BRIDGE_ALIASES.get(original), forceFileBridge: true };
    }

    if (HTTP_COMMAND_ALIASES.has(original)) {
        return { command: HTTP_COMMAND_ALIASES.get(original), forceFileBridge: false };
    }

    if (original.startsWith('give_item:')) {
        const effect = original.substring(original.indexOf(':') + 1);
        const normalizedEffect = normalizeEffectName(effect);
        const fileCommand = GIVE_ITEM_FILE_ALIASES.get(normalizedEffect);
        if (fileCommand) {
            return { command: fileCommand, forceFileBridge: true };
        }
    }

    return { command: original, forceFileBridge: false };
}

function toPositiveNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getCommandDurationMs(command, parameters) {
    const raw = toPositiveNumber(parameters.duration ?? parameters.time ?? parameters.seconds, 0);
    const duration = raw || (TIMED_FILE_COMMANDS.has(command)
        ? (DEFAULT_DURATIONS_SECONDS.get(command) || 30)
        : 0);

    if (!duration) return 0;
    return duration < 1000 ? Math.round(duration * 1000) : Math.round(duration);
}

function getCommandQuantity(command, parameters) {
    const raw = toPositiveNumber(parameters.quantity ?? parameters.amount ?? parameters.count, 0);
    if (raw) return Math.round(raw);
    return command.startsWith('giveammo_') ? 30 : 0;
}

function buildRequestParameters(parameters, quantity) {
    const reqParams = [];
    const seen = new Set();

    const addParam = (name, value) => {
        if (!name || value === undefined || value === null || value === '') return;
        if (seen.has(name)) return;
        seen.add(name);
        reqParams.push({ name, value });
    };

    if (quantity > 0) addParam('quantity', quantity);

    if (Array.isArray(parameters.parameters)) {
        for (const param of parameters.parameters) {
            if (!param || typeof param !== 'object') continue;
            addParam(param.name || param.id, param.value);
        }
    }

    for (const [name, value] of Object.entries(parameters)) {
        if (['viewer', 'username', 'name', 'duration', 'time', 'seconds', 'parameters'].includes(name)) continue;
        if (typeof value === 'object' || typeof value === 'function') continue;
        addParam(name, value);
    }

    return reqParams;
}

function sendHttpBridgeCommand(command, effect, username) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ command, effect: effect || '', username: username || 'TikControl' });
        log(`HTTP Bridge: ${body}`);

        const req = http.request({
            hostname: 'localhost',
            port: HTTPBRIDGE_PORT,
            path: HTTPBRIDGE_ENDPOINT,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'supertoken': 'glory to Ukraine 2025'
            },
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                log(`HTTP Bridge response: ${res.statusCode} ${data}`);

                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`HTTP Bridge ${res.statusCode}: ${data || 'sin respuesta'}`));
                    return;
                }

                try {
                    const parsed = JSON.parse(data);
                    if (parsed && (parsed.success === false || parsed.status === false || parsed.error)) {
                        reject(new Error(parsed.error || parsed.message || 'HTTP Bridge rechazó el comando'));
                        return;
                    }
                } catch (_) {
                    // Plain text OK responses are valid for older bridge builds.
                }

                resolve(data);
            });
        });

        req.on('error', (e) => {
            logError('HTTP Bridge error:', e.message);
            reject(e);
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('HTTP Bridge timeout'));
        });

        req.write(body);
        req.end();
    });
}

// ==================== COMMAND EXECUTION ====================

async function executeCommand(command, parameters = {}) {
    parameters = parameters || {};

    if (!gamePath) {
        throw new Error('Ruta del juego no configurada');
    }

    const normalized = normalizeCommand(command);
    const normalizedCommand = normalized.command;
    if (!normalizedCommand) {
        throw new Error('Comando RE4 vacío');
    }

    const viewer = parameters.viewer || 'TikControl';

    if (!normalized.forceFileBridge && isHttpBridgeCommand(normalizedCommand)) {
        let cmdName = normalizedCommand;
        let effect = '';
        if (normalizedCommand.includes(':')) {
            const colonIdx = normalizedCommand.indexOf(':');
            cmdName = normalizedCommand.substring(0, colonIdx);
            effect = normalizedCommand.substring(colonIdx + 1);
        }
        try {
            await sendHttpBridgeCommand(cmdName, effect, viewer);
            return '✅ Efecto aplicado (HTTP Bridge)';
        } catch (e) {
            log(`HTTP Bridge failed, falling back to file bridge: ${e.message}`);
        }
    }

    return executeFileCommand(normalizedCommand, parameters);
}

async function executeFileCommand(command, parameters = {}) {
    parameters = parameters || {};

    const cmdPath = getCmdFilePath();
    const resPath = getResFilePath();
    const cmdDir = path.dirname(cmdPath);

    if (!fs.existsSync(cmdDir)) {
        throw new Error('Directorio reframework no encontrado');
    }

    const id = ++requestId;

    const quantity = getCommandQuantity(command, parameters);
    const duration = getCommandDurationMs(command, parameters);
    const reqParams = buildRequestParameters(parameters, quantity);

    const request = {
        id: id,
        code: command,
        viewer: parameters.viewer || 'TikControl',
        type: 1,
        parameters: reqParams,
        quantity,
        duration
    };

    const jsonStr = JSON.stringify(request);
    log(`File Bridge: ${jsonStr}`);

    try {
        fs.appendFileSync(cmdPath, jsonStr + '\n', 'utf8');
    } catch (e) {
        throw new Error('Error escribiendo comando: ' + e.message);
    }

    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 20;
        const pollInterval = 150;

        const poll = setInterval(() => {
            attempts++;
            try {
                if (fs.existsSync(resPath)) {
                    const content = fs.readFileSync(resPath, 'utf8').trim();
                    if (content) {
                        try {
                            const response = JSON.parse(content);
                            fs.writeFileSync(resPath, '', 'utf8');
                            clearInterval(poll);
                            if (response.status === 0) {
                                resolve('✅ Efecto aplicado');
                            } else {
                                resolve('⚠️ ' + (response.message || 'Efecto no disponible'));
                            }
                            return;
                        } catch (e) { /* JSON parse error, keep polling */ }
                    }
                }
            } catch (e) { /* file read error, keep polling */ }

            if (attempts >= maxAttempts) {
                clearInterval(poll);
                resolve('Enviado (sin confirmación)');
            }
        }, pollInterval);
    });
}

// ==================== COPY UTILS ====================

function copyFolderSync(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        entry.isDirectory() ? copyFolderSync(srcPath, destPath) : fs.copyFileSync(srcPath, destPath);
    }
}

function patchInstalledEffectsScript() {
    if (!gamePath) return;

    try {
        const effectsPath = path.join(gamePath, 'reframework', 'autorun', 'CCRE4.lua');
        if (!fs.existsSync(effectsPath)) return;

        const content = fs.readFileSync(effectsPath, 'utf8');
        const patched = content.replace(/CCTPiny\(\)/g, 'CCPTiny()');
        if (patched !== content) {
            fs.writeFileSync(effectsPath, patched, 'utf8');
            log('Parcheado typo ptiny -> CCPTiny en CCRE4.lua');
        }
    } catch (e) {
        logError('Error parcheando CCRE4.lua:', e);
    }
}

// ==================== IPC HANDLERS ====================

function registerIpcHandlers() {
    ipcMain.handle('re4:executeEffect', async (event, command, parameters) => {
        try {
            const result = await executeCommand(command, parameters);
            return { success: true, message: result };
        } catch (e) {
            return { success: false, message: e.message };
        }
    });

    ipcMain.handle('re4:isConnected', () => isConnected);
    ipcMain.handle('re4:getGamePath', () => gamePath);
    ipcMain.handle('re4:setGamePath', (event, a, b) => {
        const { path: resolved } = resolveSetGamePathArgs(a, b);
        if (!resolved || !fs.existsSync(resolved)) {
            return { success: false, error: 'Ruta no válida' };
        }
        saveGamePath(resolved);
        checkConnection();
        return { success: true, path: gamePath };
    });

    ipcMain.handle('re4:selectGamePath', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Seleccionar carpeta de Resident Evil 4'
        });
        if (!result.canceled && result.filePaths.length > 0) {
            saveGamePath(result.filePaths[0]);
            checkConnection();
            return { success: true, path: gamePath };
        }
        return { success: false, canceled: true };
    });

    ipcMain.handle('re4:findGame', async () => {
        const foundDir = findGamePath('RESIDENT EVIL 4  BIOHAZARD RE4', 're4.exe');
        if (foundDir) {
            saveGamePath(foundDir);
            checkConnection();
            return { success: true, path: foundDir };
        }
        return { success: false, error: 'Juego no encontrado' };
    });

    ipcMain.handle('re4:installMod', async () => {
        if (!gamePath) return { success: false, message: 'Configura la ruta primero' };

        try {
            const MOD_URL = 'https://storage.tikcontrol.live/games/re4/mod.zip?v=2';
            const tmpZip = path.join(require('os').tmpdir(), 'tikcontrol-re4-mod.zip');

            log('Descargando mod RE4 desde AWS...');
            await downloadFile(MOD_URL, tmpZip);

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tmpZip);
            zip.extractAllTo(gamePath, true);
            log('Mod extraído en ' + gamePath);

            try { fs.unlinkSync(tmpZip); } catch (_) {}

            installBridgeScript();
            checkConnection();
            return { success: true, message: 'Mod TikControl instalado' };
        } catch (e) {
            logError('Error instalando mod:', e);
            return { success: false, message: e.message };
        }
    });

    ipcMain.handle('re4:uninstallMod', async () => {
        if (!gamePath) return { success: false, message: 'Configura la ruta primero' };
        try {
            const bridgePath = path.join(gamePath, 'reframework', 'autorun', 'TikControlRE4.lua');
            if (fs.existsSync(bridgePath)) fs.unlinkSync(bridgePath);
            checkConnection();
            return { success: true, message: 'Mod TikControl desinstalado' };
        } catch (e) { return { success: false, message: e.message }; }
    });

    ipcMain.handle('re4:checkModStatus', async () => {
        if (!gamePath) return { installed: false, message: 'Ruta no configurada' };

        patchInstalledEffectsScript();

        const hasReframework = fs.existsSync(path.join(gamePath, 'dinput8.dll'));
        const hasBridge = fs.existsSync(path.join(gamePath, 'reframework', 'autorun', 'TikControlRE4.lua'));
        const hasEffects = fs.existsSync(path.join(gamePath, 'reframework', 'autorun', 'CCRE4.lua'));
        const hasCCBase = fs.existsSync(path.join(gamePath, 'reframework', 'autorun', 'CCLuaBase.lua'));

        if (hasReframework && hasBridge && hasEffects && hasCCBase) {
            return { installed: true, message: 'TikControl + Effects Engine instalado' };
        }
        if (hasReframework && hasEffects && hasCCBase && !hasBridge) {
            return { installed: false, message: 'Falta bridge TikControl (instalar mod)' };
        }
        if (hasReframework && !hasEffects) {
            return { installed: false, message: 'Falta motor de efectos (instalar mod de efectos)' };
        }
        if (!hasReframework) {
            return { installed: false, message: 'REFramework no instalado' };
        }
        return { installed: false, message: 'Instalación incompleta' };
    });

    ipcMain.handle('re4:launchGame', async () => {
        try {
            installBridgeScript();
            shell.openExternal('steam://rungameid/' + STEAM_ID);
            return { success: true };
        }
        catch (e) { return { success: false, message: e.message }; }
    });
}

function installBridgeScript() {
    if (!gamePath) return;
    try {
        const autorunDir = path.join(gamePath, 'reframework', 'autorun');
        if (!fs.existsSync(autorunDir)) return;
        const bridgeSrc = path.join(__dirname, 'RE4_TikControl', 'TikControlRE4.lua');
        const bridgeDest = path.join(autorunDir, 'TikControlRE4.lua');
        if (fs.existsSync(bridgeSrc)) {
            fs.copyFileSync(bridgeSrc, bridgeDest);
            log('Bridge script instalado en ' + bridgeDest);
        }
        patchInstalledEffectsScript();
    } catch (e) {
        logError('Error instalando bridge:', e);
    }
}

module.exports = { initialize };
