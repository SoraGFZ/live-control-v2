/**
 * RV There Yet? - TikControl Integration
 * Comunicación con el mod UE4SS via TCP
 */

const path = require('path');
const fs = require('fs');
const { ipcMain, app } = require('electron');
const EventEmitter = require('events');
const AdmZip = require('adm-zip');
const https = require('https');
const { resolveDir } = require('../steamDetect');
const { resolveSetGamePathArgs } = require('../setGamePathArgs');

/** Steam App ID oficial de "RV There Yet?" (no confundir con otros juegos) */
const STEAM_APP_ID = '3949040';

/**
 * RV There Yet (Steam carpeta "Ride"): el ejecutable está en .../Ride/Ride.exe
 * y UE4/UE4SS en .../Ride/Ride/Binaries/Win64 (no en la raíz de steamapps/common/Ride).
 */
function resolveRideWin64Dir(gamePath) {
    if (!gamePath) return null;
    const dir = resolveDir(gamePath);
    const candidates = [
        path.join(dir, 'Ride', 'Binaries', 'Win64'),
        path.join(dir, 'Binaries', 'Win64'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return candidates[0];
}

class RVThereYetService extends EventEmitter {
    constructor() {
        super();
        this.mainWindow = null;
        this.requestId = 0;
        this.gamePath = null;
        this.commandsFile = null;
        this.responseFile = null;
        this.responseWatcher = null;
        this.pendingRequests = new Map();
        this.lastResponseLine = 0;
    }

    initialize(mainWindow) {
        this.mainWindow = mainWindow;
        this.registerIPCHandlers();

        // Cargar ruta guardada automáticamente
        this.loadSavedGamePath();

        console.log('[RVThereYet] Módulo inicializado (sistema de archivos)');
    }

    async loadSavedGamePath() {
        try {
            const configPath = path.join(app.getPath('userData'), 'electron-config.json');

            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

                if (config['rvtheryet_game_path'] && fs.existsSync(config['rvtheryet_game_path'])) {
                    console.log('[RVThereYet] 📁 Ruta cargada automáticamente:', config['rvtheryet_game_path']);
                    this.setGamePath(config['rvtheryet_game_path']);
                    return;
                }
                for (const key of Object.keys(config)) {
                    if (key.startsWith('rvtheryet_game_path')) {
                        const savedPath = config[key];
                        if (savedPath && fs.existsSync(savedPath)) {
                            console.log('[RVThereYet] 📁 Ruta cargada automáticamente:', savedPath);
                            this.setGamePath(savedPath);
                            return;
                        }
                    }
                }
            }

            try {
                const { findGamePath } = require('../steamDetect');
                const found = findGamePath('Ride', 'Ride.exe');
                if (found) {
                    console.log('[RVThereYet] 📁 Ruta auto-detectada via Steam:', found);
                    this.setGamePath(found);
                    this._saveGamePathToConfig(found);
                    return;
                }
            } catch (_) {}

            console.log('[RVThereYet] ℹ️ No hay ruta guardada - esperando configuración manual');
        } catch (e) {
            console.error('[RVThereYet] Error cargando ruta guardada:', e.message);
        }
    }

    setGamePath(gamePath) {
        this.gamePath = gamePath;
        if (gamePath) {
            // Los archivos van en la carpeta de datos de la aplicación (accesible globalmente)
            const { app } = require('electron');
            const appDataPath = app.getPath('userData');
            const rvDataPath = path.join(appDataPath, 'rvtheryet');

            // Crear directorio si no existe
            if (!fs.existsSync(rvDataPath)) {
                fs.mkdirSync(rvDataPath, { recursive: true });
            }

            this.commandsFile = path.join(rvDataPath, 'tikcontrol_commands.txt');
            this.responseFile = path.join(rvDataPath, 'tikcontrol_response.txt');

            // Guardar la ruta para que el script Lua la use
            this.commandsFilePath = this.commandsFile.replace(/\\/g, '/'); // Normalizar para Lua
            this.responseFilePath = this.responseFile.replace(/\\/g, '/');

            console.log('[RVThereYet] 📁 Archivos de comunicación:');
            console.log('[RVThereYet]   Comandos:', this.commandsFile);
            console.log('[RVThereYet]   Respuestas:', this.responseFile);

            // Inicializar archivos
            this.initializeFiles();

            // Iniciar watcher de respuestas
            this.startResponseWatcher();
        }
    }

    initializeFiles() {
        try {
            // Crear archivo de comandos vacío si no existe
            if (!fs.existsSync(this.commandsFile)) {
                fs.writeFileSync(this.commandsFile, '');
            }
            // Crear archivo de respuestas vacío
            fs.writeFileSync(this.responseFile, '');
            this.lastResponseLine = 0;
        } catch (e) {
            console.error('[RVThereYet] Error inicializando archivos:', e.message);
        }
    }

    startResponseWatcher() {
        if (this.responseWatcher) {
            this.responseWatcher.close();
        }

        if (!this.responseFile) return;

        try {
            this.responseWatcher = fs.watch(this.responseFile, (eventType) => {
                if (eventType === 'change') {
                    this.checkResponses();
                }
            });
        } catch (e) {
            console.error('[RVThereYet] Error iniciando watcher:', e.message);
        }
    }

    checkResponses() {
        if (!this.responseFile || !fs.existsSync(this.responseFile)) return;

        try {
            const content = fs.readFileSync(this.responseFile, 'utf8');
            const lines = content.split('\n').filter(l => l.trim());

            for (let i = this.lastResponseLine; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                try {
                    const response = JSON.parse(line);
                    console.log('[RVThereYet] 📥 Respuesta:', response);

                    if (response.requestId && this.pendingRequests.has(response.requestId)) {
                        const { resolve } = this.pendingRequests.get(response.requestId);
                        this.pendingRequests.delete(response.requestId);
                        resolve(response);
                    }

                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.webContents.send('rvtheryet:response', response);
                    }
                } catch (e) {
                    console.error('[RVThereYet] Error parseando respuesta:', e.message);
                }
            }

            this.lastResponseLine = lines.length;
        } catch (e) {
            console.error('[RVThereYet] Error leyendo respuestas:', e.message);
        }
    }

    /**
     * Los commandId del JSON (p. ej. giveitem_Beer, damage_TireFL) no son funciones Lua globales.
     * El dispatcher de acciones ya mapea algunos; Gaming/overlay envían el ID directo → normalizar aquí.
     */
    normalizeRvCommand(command, parameters = {}) {
        const params = parameters && typeof parameters === 'object' ? { ...parameters } : {};
        const original = String(command || '').trim();
        let cmd = original;

        const give = cmd.match(/^giveitem_(.+)$/i);
        if (give) {
            let msg = give[1];
            if (msg.length) msg = msg.charAt(0).toUpperCase() + msg.slice(1);
            return {
                command: 'GiveItemByName',
                parameters: { ...params, cur: params.cur ?? 0, val: params.val ?? 0, msg }
            };
        }

        const spawn = cmd.match(/^spawn_(.+)$/i);
        if (spawn) {
            const raw = spawn[1];
            const spawnMap = {
                snake: 'Snake',
                bear: 'Bear',
                moose: 'Moose',
                aligator: 'Aligator',
                alligator: 'Aligator',
                eagle: 'Eagle',
                Snake: 'Snake',
                Bear: 'Bear',
                Moose: 'Moose',
                Aligator: 'Aligator',
                Eagle: 'Eagle'
            };
            const msg = spawnMap[raw] || spawnMap[raw.toLowerCase()] ||
                (raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase());
            return {
                command: 'SpawnByName',
                parameters: { ...params, cur: params.cur ?? 0, val: params.val ?? 0, msg }
            };
        }

        const dmg = cmd.match(/^damage_(.+)$/i);
        if (dmg) {
            const msg = dmg[1];
            return {
                command: 'DamageByName',
                parameters: { ...params, cur: params.cur ?? 0, val: params.val ?? 0, msg }
            };
        }

        const rep = cmd.match(/^repair_(.+)$/i);
        if (rep) {
            const msg = rep[1];
            return {
                command: 'RepairByName',
                parameters: { ...params, cur: params.cur ?? 0, val: params.val ?? 0, msg }
            };
        }

        const gear = cmd.match(/^gear_(.+)$/i);
        if (gear) {
            const g = gear[1].toUpperCase();
            let val = 0;
            if (g === 'N') val = 0;
            else if (g === 'R') val = -1;
            else if (/^[1-5]$/.test(g)) val = parseInt(g, 10);
            return { command: 'SetGear', parameters: { ...params, val } };
        }

        const low = cmd.toLowerCase();
        const aliases = {
            forcegas: { command: 'SetConstant', extra: { msg: 'Throttle', cur: 100 } },
            turnleft: { command: 'SetConstant', extra: { msg: 'Steering', cur: -100 } },
            turnright: { command: 'SetConstant', extra: { msg: 'Steering', cur: 100 } }
        };
        if (aliases[low]) {
            const a = aliases[low];
            return {
                command: a.command,
                parameters: { ...params, ...a.extra, val: params.val ?? 0 }
            };
        }

        return { command: cmd, parameters: params };
    }

    async executeCommand(command, parameters = {}) {
        return new Promise((resolve, reject) => {
            if (!this.commandsFile) {
                // Si no hay ruta configurada, intentar cargarla de nuevo
                this.loadSavedGamePath();

                if (!this.commandsFile) {
                    console.warn('[RVThereYet] ⚠️ Ruta del juego no configurada');
                    console.warn('[RVThereYet] 💡 Ve a Acciones → Juegos → RV There Yet? → "⚙️ Configurar Ruta"');
                    resolve({ success: false, error: 'Ruta del juego no configurada. Ve a Juegos → RV There Yet? y haz clic en "⚙️ Configurar Ruta"' });
                    return;
                }
            }

            const rawCmd = command;
            const norm = this.normalizeRvCommand(command, parameters);
            command = norm.command;
            parameters = norm.parameters;
            if (String(rawCmd) !== String(command)) {
                console.log('[RVThereYet] 🔄 Comando normalizado:', rawCmd, '→', command, parameters);
            }

            this.requestId++;
            const currentRequestId = this.requestId; // Guardar el ID actual
            const request = {
                type: 'command',
                requestId: currentRequestId,
                command: command,
                parameters: parameters
            };

            this.pendingRequests.set(currentRequestId, { resolve, reject });

            const requestStr = JSON.stringify(request) + '\n';
            console.log('[RVThereYet] 📤 Enviando comando:', request);

            try {
                // Escribir comando al archivo
                fs.appendFileSync(this.commandsFile, requestStr);
                console.log('[RVThereYet] ✅ Comando escrito al archivo');

                // Timeout de 5 segundos - usar el ID guardado
                setTimeout(() => {
                    if (this.pendingRequests.has(currentRequestId)) {
                        this.pendingRequests.delete(currentRequestId);
                        // Siempre resolvemos (fire and forget)
                        resolve({ success: true, message: 'Comando enviado (sin confirmación)' });
                    }
                }, 5000);
            } catch (e) {
                console.error('[RVThereYet] Error escribiendo comando:', e.message);
                this.pendingRequests.delete(currentRequestId);
                // Siempre resolver, nunca reject (para evitar "reply never sent")
                resolve({ success: false, error: e.message });
            }
        });
    }

    registerIPCHandlers() {
        ipcMain.handle('rvtheryet:executeEffect', async (event, command, parameters) => {
            try {
                const result = await this.executeCommand(command, parameters);
                return result;
            } catch (error) {
                console.error('[RVThereYet] Error ejecutando efecto:', error.message);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('rvtheryet:isConnected', () => {
            const processWatcher = require('../../../modules/processWatcher');
            const running = processWatcher.getRunning();
            return !!this.commandsFile && fs.existsSync(this.commandsFile) && !!running['rvtheryet'];
        });

        ipcMain.handle('rvtheryet:getStatus', () => {
            const processWatcher = require('../../../modules/processWatcher');
            const running = processWatcher.getRunning();
            return {
                connected: !!this.commandsFile && fs.existsSync(this.commandsFile) && !!running['rvtheryet'],
                gamePath: this.gamePath,
                commandsFile: this.commandsFile
            };
        });

        ipcMain.handle('rvtheryet:getGamePath', () => {
            return { path: this.gamePath };
        });

        ipcMain.handle('rvtheryet:findGame', async () => {
            try {
                const { findGamePath } = require('../steamDetect');
                const found = findGamePath('Ride', 'Ride.exe');
                if (found) {
                    this.setGamePath(found);
                    this._saveGamePathToConfig(found);
                    return { success: true, path: found };
                }
            } catch (_) {}
            return { success: false, error: 'Juego no encontrado' };
        });

        ipcMain.handle('rvtheryet:setGamePath', async (event, a, b) => {
            const { path: resolved } = resolveSetGamePathArgs(a, b);
            if (!resolved || typeof resolved !== 'string') return { success: false, error: 'Ruta inválida' };
            if (!path.isAbsolute(resolved)) return { success: false, error: 'Ruta no es absoluta' };
            if (!fs.existsSync(resolved)) return { success: false, error: 'Ruta no existe' };
            this.setGamePath(resolved);
            this._saveGamePathToConfig(resolved);
            return { success: true, path: resolved };
        });

        ipcMain.handle('rvtheryet:installMod', async (event, profileIdOrPath) => {
            let gamePath = null;
            if (profileIdOrPath && fs.existsSync(profileIdOrPath)) {
                gamePath = profileIdOrPath;
            }
            if (!gamePath) gamePath = this.gamePath;
            if (!gamePath) {
                try {
                    const { findGamePath } = require('../steamDetect');
                    gamePath = findGamePath('Ride', 'Ride.exe');
                } catch (_) {}
            }
            if (!gamePath) return { success: false, error: 'Ruta del juego no configurada. Usa "Configurar Ruta" primero.' };
            return await this.installMod(gamePath);
        });

        ipcMain.handle('rvtheryet:uninstallMod', async (event, profileIdOrPath) => {
            let gamePath = null;
            if (profileIdOrPath && fs.existsSync(profileIdOrPath)) {
                gamePath = profileIdOrPath;
            }
            if (!gamePath) gamePath = this.gamePath;
            if (!gamePath) {
                try {
                    const { findGamePath } = require('../steamDetect');
                    gamePath = findGamePath('Ride', 'Ride.exe');
                } catch (_) {}
            }
            if (!gamePath) return { success: false, error: 'Ruta del juego no configurada' };
            return await this.uninstallMod(gamePath);
        });

        ipcMain.handle('rvtheryet:checkModStatus', async (event, gamePath) => {
            const gp = (gamePath && fs.existsSync(gamePath)) ? gamePath : this.gamePath;
            return this.checkModStatus(gp);
        });

        ipcMain.handle('rvtheryet:selectGamePath', async () => {
            const { dialog } = require('electron');
            const result = await dialog.showOpenDialog({
                title: 'Seleccionar ejecutable de RV There Yet?',
                filters: [{ name: 'Ejecutable', extensions: ['exe'] }],
                properties: ['openFile']
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const gamePath = result.filePaths[0];
                this.setGamePath(gamePath);
                this._saveGamePathToConfig(gamePath);
                return { success: true, gamePath };
            }
            return { success: false };
        });

        ipcMain.handle('rvtheryet:launchGame', async () => {
            try {
                const { shell } = require('electron');
                await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
                return { success: true, method: 'steam' };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });
    }

    checkModStatus(gamePath) {
        if (!gamePath) return { installed: false, hasUE4SS: false };

        const win64 = resolveRideWin64Dir(gamePath);
        if (!win64 || !fs.existsSync(win64)) return { installed: false, hasUE4SS: false };

        const tikControlModPath = path.join(win64, 'ue4ss', 'Mods', 'TikControl');
        const ue4ssPath = path.join(win64, 'ue4ss');

        return {
            installed: fs.existsSync(path.join(tikControlModPath, 'Scripts', 'main.lua')),
            hasUE4SS: fs.existsSync(path.join(ue4ssPath, 'UE4SS.dll'))
        };
    }

    async installMod(gamePath) {
        try {
            if (!gamePath || !path.isAbsolute(gamePath) || !fs.existsSync(gamePath)) {
                gamePath = this.gamePath;
            }
            if (!gamePath) {
                throw new Error('Ruta del juego no especificada');
            }

            this.setGamePath(gamePath);

            // URL del mod completo de TikControl (incluye UE4SS + script Lua)
            const modUrl = 'https://storage.tikcontrol.live/games/rv-there-yet/mod.zip';
            const tempDir = path.join(app.getPath('temp'), 'tikcontrol_rv_mod');
            const zipPath = path.join(tempDir, 'rvtheryet_tikcontrol.zip');

            const targetDir = resolveRideWin64Dir(gamePath);
            if (!targetDir) {
                throw new Error('No se encontró Ride\\Binaries\\Win64. ¿Está el juego instalado?');
            }
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            console.log('[RVThereYet] 📁 Rutas detectadas:');
            console.log('[RVThereYet]   gamePath:', gamePath);
            console.log('[RVThereYet]   targetDir:', targetDir);

            // Crear directorio temporal
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            this.sendProgress('📥 Descargando mod de TikControl...');
            console.log('[RVThereYet] 📥 Descargando mod desde:', modUrl);

            // Descargar el mod completo
            await new Promise((resolve, reject) => {
                const file = fs.createWriteStream(zipPath);

                const downloadWithRedirects = (url, redirectCount = 0) => {
                    if (redirectCount > 5) {
                        reject(new Error('Demasiadas redirecciones'));
                        return;
                    }

                    https.get(url, {
                        headers: {
                            'User-Agent': 'TikControl/1.0'
                        }
                    }, (response) => {
                        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                            console.log('[RVThereYet] ↪️ Redirigiendo a:', response.headers.location);
                            downloadWithRedirects(response.headers.location, redirectCount + 1);
                            return;
                        }

                        if (response.statusCode !== 200) {
                            reject(new Error(`Error HTTP: ${response.statusCode}`));
                            return;
                        }

                        response.pipe(file);
                        file.on('finish', () => {
                            file.close();
                            resolve();
                        });
                    }).on('error', (err) => {
                        fs.unlink(zipPath, () => { });
                        reject(err);
                    });
                };

                downloadWithRedirects(modUrl);
            });

            console.log('[RVThereYet] ✅ Descarga completada');
            this.sendProgress('📦 Extrayendo mod...');

            // Extraer el mod completo al directorio raíz del juego
            // (el ZIP ya contiene la estructura Ride/Binaries/Win64/...)
            const zip = new AdmZip(zipPath);
            const extractBase = resolveDir(gamePath);
            zip.extractAllTo(extractBase, true);

            console.log('[RVThereYet] ✅ Mod extraído a:', extractBase);

            // Siempre generar main.lua (ruta de comunicación inyectada; el ZIP puede traer un Lua antiguo)
            const modsPath = path.join(targetDir, 'ue4ss', 'Mods');
            const tikControlPath = path.join(modsPath, 'TikControl');
            const scriptsPath = path.join(tikControlPath, 'Scripts');
            if (!fs.existsSync(tikControlPath)) {
                fs.mkdirSync(tikControlPath, { recursive: true });
            }
            if (!fs.existsSync(scriptsPath)) {
                fs.mkdirSync(scriptsPath, { recursive: true });
            }
            console.log('[RVThereYet] 📝 Escribiendo main.lua (ruta TikControl ↔ UE4SS)...');
            const luaScript = this.generateTikControlLuaScript();
            fs.writeFileSync(path.join(scriptsPath, 'main.lua'), luaScript, 'utf8');
            const enabledPath = path.join(tikControlPath, 'enabled.txt');
            if (!fs.existsSync(enabledPath)) {
                fs.writeFileSync(enabledPath, '');
            }

            // Limpiar archivos temporales
            try {
                fs.unlinkSync(zipPath);
                fs.rmdirSync(tempDir, { recursive: true });
            } catch (e) {
                console.log('[RVThereYet] ⚠️ No se pudo limpiar temporales:', e.message);
            }

            this.sendProgress('✅ Mod instalado correctamente!');

            console.log('[RVThereYet] ✅ Mod instalado en:', targetDir);
            console.log('[RVThereYet] 📄 Archivo de comandos:', this.commandsFile);

            return {
                success: true,
                message: '¡Mod de TikControl instalado correctamente! Inicia el juego para conectar.'
            };
        } catch (error) {
            console.error('[RVThereYet] Error instalando mod:', error);
            return { success: false, error: error.message };
        }
    }

    async uninstallMod(gamePath) {
        try {
            if (!gamePath || !path.isAbsolute(gamePath)) gamePath = this.gamePath;
            if (!gamePath) throw new Error('Ruta del juego no configurada');
            const win64 = resolveRideWin64Dir(gamePath);
            if (!win64) throw new Error('No se encontró la carpeta Win64 del juego');
            const tikControlPath = path.join(win64, 'ue4ss', 'Mods', 'TikControl');

            if (fs.existsSync(tikControlPath)) {
                fs.rmSync(tikControlPath, { recursive: true, force: true });
            }

            return { success: true, message: 'Mod desinstalado correctamente' };
        } catch (error) {
            console.error('[RVThereYet] Error desinstalando mod:', error);
            return { success: false, error: error.message };
        }
    }

    sendProgress(message) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('rvtheryet:install-progress', { message });
        }
    }

    generateTikControlLuaScript() {
        // Usar siempre las funciones integradas (más estable)
        console.log('[RVThereYet] 📝 Generando script con funciones integradas');
        return this.generateBuiltInScript();
    }

    /**
     * Debe coincidir con setGamePath(): userData de Electron + /rvtheryet/
     * (NO usar APPDATA/tikcontrol a mano: en instalación el nombre es TikControl y la ruta falla.)
     */
    getLuaDataPathForScript() {
        const { app } = require('electron');
        let dir = path.join(app.getPath('userData'), 'rvtheryet');
        dir = dir.replace(/\\/g, '/');
        if (!dir.endsWith('/')) dir += '/';
        return dir;
    }

    escapeLuaDoubleQuotedString(s) {
        return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    generateScriptFromOriginal(originalScript) {
        // Cabecera de TikControl con sistema de archivos
        const header = `-- TikControl Mod for RV There Yet?
-- Mod de efectos adaptado para TikControl
-- Comunicación via archivos con TikControl

-- Obtener la ruta de AppData para los archivos de comunicación
local function getAppDataPath()
    local appdata = os.getenv("APPDATA")
    if appdata then
        return appdata:gsub("\\\\", "/") .. "/tikcontrol/rvtheryet/"
    end
    return "C:/Users/" .. (os.getenv("USERNAME") or "User") .. "/AppData/Roaming/tikcontrol/rvtheryet/"
end

local DATA_PATH = getAppDataPath()
local COMMANDS_FILE = DATA_PATH .. "tikcontrol_commands.txt"
local RESPONSE_FILE = DATA_PATH .. "tikcontrol_response.txt"
local lastProcessedLine = 0
local checkTimer = 0

print("[TikControl] 🎮 Mod TikControl para RV There Yet? iniciando...")
print("[TikControl] 📁 Ruta de datos: " .. DATA_PATH)
print("[TikControl] 📄 Archivo de comandos: " .. COMMANDS_FILE)

-- Sistema de comunicación por archivos
function ReadCommandsFile()
    local file = io.open(COMMANDS_FILE, "r")
    if not file then return nil end
    local content = file:read("*all")
    file:close()
    return content
end

function WriteResponse(requestId, success, message)
    local file = io.open(RESPONSE_FILE, "a")
    if not file then
        print("[TikControl] ❌ No se pudo escribir respuesta")
        return
    end
    local response = string.format('{"requestId":%d,"success":%s,"message":"%s"}\\n',
        requestId, success and "true" or "false", message or "")
    file:write(response)
    file:close()
end

function ProcessCommand(line)
    local requestId = tonumber(line:match('"requestId":(%d+)'))
    local command = line:match('"command":"([^"]+)"')
    
    if not command then
        print("[TikControl] ❌ Comando inválido: " .. line)
        return
    end
    
    print("[TikControl] 🎮 Ejecutando: " .. command)
    
    -- Extraer parámetros
    local params = {}
    local paramsStr = line:match('"parameters":{([^}]*)}')
    if paramsStr then
        for key, val in paramsStr:gmatch('"([^"]+)":"?([^",}]+)"?') do
            params[key] = val
            print("[TikControl] 📦 Param: " .. key .. " = " .. tostring(val))
        end
    end
    
    ExecuteInGameThread(function()
        local result = 0
        local message = "OK"
        
        local succ, ret = pcall(function()
            -- Comandos con parámetros especiales
            if command == "DamageByName" or command == "RepairByName" or 
               command == "SpawnByName" or command == "GiveItemByName" then
                return _G[command](tonumber(params.cur) or 0, tonumber(params.val) or 0, params.msg or "")
            end
            
            if command == "SetGear" then
                return SetGear(tonumber(params.val) or 0)
            end
            
            if command == "SetConstant" then
                return SetConstant(tonumber(params.cur) or 0, tonumber(params.val) or 0, params.msg or "")
            end
            
            -- Comandos simples
            if _G[command] and type(_G[command]) == "function" then
                return _G[command]()
            end
            
            print("[TikControl] ⚠️ Comando desconocido: " .. command)
            return 0
        end)
        
        if succ then
            result = ret or 0
            message = result == 1 and "Comando ejecutado" or "Comando no aplicable"
            print("[TikControl] " .. (result == 1 and "✅" or "⚠️") .. " " .. command .. ": " .. message)
        else
            message = tostring(ret)
            print("[TikControl] ❌ Error: " .. message)
        end
        
        WriteResponse(requestId or 0, result == 1, message)
    end)
end

function CheckForCommands()
    local content = ReadCommandsFile()
    if not content or content == "" then return end
    local lines = {}
    for line in content:gmatch("[^\\n]+") do
        table.insert(lines, line)
    end
    local n = #lines
    -- Si el archivo se vació o truncó (p.ej. reinicio), el contador debe volver a 0
    if lastProcessedLine > n then
        lastProcessedLine = 0
    end
    local lineNum = 0
    for _, line in ipairs(lines) do
        lineNum = lineNum + 1
        if lineNum > lastProcessedLine and line ~= "" then
            ProcessCommand(line)
            lastProcessedLine = lineNum
        end
    end
end

-- Hook para verificar comandos cada ~1 segundo
RegisterHook("/Game/Ride/Character/Blueprints/BP_FirstPersonPlayerController.BP_FirstPersonPlayerController_C:ReceiveTick", function(self, deltaSeconds)
    checkTimer = checkTimer + 1
    if checkTimer >= 60 then
        checkTimer = 0
        CheckForCommands()
        CheckConstants()
    end
end)

-- Inicializar archivos (resetear índice al truncar, si no TikControl nunca procesa líneas nuevas)
ExecuteWithDelay(2000, function()
    lastProcessedLine = 0
    local file = io.open(COMMANDS_FILE, "w")
    if file then
        file:close()
        print("[TikControl] 📁 Archivo de comandos inicializado")
    else
        print("[TikControl] ⚠️ No se pudo crear archivo de comandos en: " .. COMMANDS_FILE)
    end
    
    file = io.open(RESPONSE_FILE, "w")
    if file then
        file:close()
        print("[TikControl] 📁 Archivo de respuestas inicializado")
    end
    
    print("[TikControl] ✅ Mod TikControl para RV There Yet? cargado!")
    print("[TikControl] 📂 Monitoreando: " .. COMMANDS_FILE)
end)

-- ============================================
-- FUNCIONES DEL JUEGO (efectos)
-- ============================================

`;

        // Filtrar las partes que no necesitamos del script original
        // (funciones específicas del mod original como testing, getfunc, etc.)
        let gameCode = originalScript;

        // Remover funciones específicas del mod original (DLL)
        gameCode = gameCode.replace(/function testing\(\)[\s\S]*?return 1\nend/g, '');
        gameCode = gameCode.replace(/function teststr\(\)[\s\S]*?return 1\nend/g, '');
        gameCode = gameCode.replace(/function showmsg\(val\)[\s\S]*?return [01]\nend/g, '');
        gameCode = gameCode.replace(/function getState\(\)[\s\S]*?return bad\nend/g, '');
        gameCode = gameCode.replace(/function getEngine\(\)[\s\S]*?return a1, a2\nend/g, '');
        gameCode = gameCode.replace(/function isMulti\(\)[\s\S]*?end/g, '');
        gameCode = gameCode.replace(/function isReady\(\)[\s\S]*?end/g, '');
        gameCode = gameCode.replace(/function isBoss\(\)[\s\S]*?end/g, '');

        // Remover el hook del mod original (usamos el nuestro)
        gameCode = gameCode.replace(/ExecuteWithDelay\(5000, function\(\)[\s\S]*?end\)/g, '');

        // Remover variables del mod original
        gameCode = gameCode.replace(/timed = \{\}/g, '');
        gameCode = gameCode.replace(/hidden = false/g, '');

        return header + gameCode;
    }

    generateBuiltInScript() {
        const luaDataPath = this.getLuaDataPathForScript();
        const luaDataPathQuoted = '"' + this.escapeLuaDoubleQuotedString(luaDataPath) + '"';
        console.log('[RVThereYet] 📝 Lua DATA_PATH inyectado (debe ser el mismo que TikControl use para comandos):', luaDataPath);

        return `-- TikControl Mod for RV There Yet?
-- Comunicación via archivos con TikControl
-- Compatible con UE4SS sin dependencias externas
-- DATA_PATH inyectado desde TikControl (mismo que Electron userData/rvtheryet)

local DATA_PATH = ${luaDataPathQuoted}
local COMMANDS_FILE = DATA_PATH .. "tikcontrol_commands.txt"
local RESPONSE_FILE = DATA_PATH .. "tikcontrol_response.txt"
local lastProcessedLine = 0
local commandQueueInitialized = false

print("[TikControl] 📁 Ruta de datos: " .. DATA_PATH)
print("[TikControl] 📄 Archivo de comandos: " .. COMMANDS_FILE)

-- Funciones del juego original (reutilizadas)
${this.extractLuaFunctions()}

-- Leer comandos del archivo
function ReadCommandsFile()
    local file = io.open(COMMANDS_FILE, "r")
    if not file then
        return nil
    end
    
    local content = file:read("*all")
    file:close()
    return content
end

-- Escribir respuesta
function WriteResponse(requestId, success, message)
    local file = io.open(RESPONSE_FILE, "a")
    if not file then
        print("[TikControl] No se pudo escribir respuesta")
        return
    end
    
    local response = string.format('{"requestId":%d,"success":%s,"message":"%s"}\\n',
        requestId, success and "true" or "false", message or "")
    
    file:write(response)
    file:close()
end

-- Procesar un comando
function ProcessCommand(line)
    -- Parsear JSON manualmente (simple)
    local requestId = tonumber(line:match('"requestId":(%d+)'))
    local command = line:match('"command":"([^"]+)"')
    
    if not command then
        print("[TikControl] Comando inválido: " .. line)
        return
    end
    
    print("[TikControl] 🎮 Ejecutando: " .. command)
    
    -- Extraer parámetros
    local params = {}
    local paramsStr = line:match('"parameters":{([^}]*)}')
    if paramsStr then
        for key, val in paramsStr:gmatch('"([^"]+)":"?([^",}]+)"?') do
            params[key] = val
        end
    end
    
    -- Ejecutar comando
    ExecuteInGameThread(function()
        local result = 0
        local message = "OK"
        
        local succ, ret = pcall(function()
            -- PRIMERO: Comandos que requieren parámetros específicos
            if command == "DamageByName" or command == "RepairByName" or 
               command == "SpawnByName" or command == "GiveItemByName" then
                print("[TikControl] 📦 Params: cur=" .. tostring(params.cur) .. ", val=" .. tostring(params.val) .. ", msg=" .. tostring(params.msg))
                return _G[command](tonumber(params.cur) or 0, tonumber(params.val) or 0, params.msg or "")
            end
            
            if command == "SetGear" then
                return SetGear(tonumber(params.val) or 0)
            end
            
            if command == "SetConstant" then
                return SetConstant(tonumber(params.cur) or 0, tonumber(params.val) or 0, params.msg or "")
            end
            
            -- DESPUÉS: Comandos simples (sin parámetros)
            if _G[command] and type(_G[command]) == "function" then
                return _G[command]()
            end
            
            print("[TikControl] ⚠️ Comando desconocido: " .. command)
            return 0
        end)
        
        if succ then
            result = ret or 0
            if result == 1 then
                message = "Comando ejecutado"
                print("[TikControl] ✅ Éxito: " .. command)
            else
                message = "Comando no aplicable"
                print("[TikControl] ⚠️ No aplicable: " .. command)
            end
        else
            message = tostring(ret)
            print("[TikControl] ❌ Error: " .. message)
        end
        
        WriteResponse(requestId or 0, result == 1, message)
    end)
end

-- Verificar nuevos comandos
function CheckForCommands()
    if not commandQueueInitialized then
        commandQueueInitialized = true
        local content = ReadCommandsFile()
        if content and content ~= "" then
            local n = 0
            for _ in content:gmatch("[^\\n]+") do
                n = n + 1
            end
            lastProcessedLine = n
            print("[TikControl] Cola existente al cargar: " .. n .. " líneas (no se ejecutan; solo comandos nuevos)")
            return
        end
    end
    local content = ReadCommandsFile()
    if not content or content == "" then
        return
    end
    local lines = {}
    for line in content:gmatch("[^\\n]+") do
        table.insert(lines, line)
    end
    local n = #lines
    if lastProcessedLine > n then
        lastProcessedLine = 0
    end
    local lineNum = 0
    for _, line in ipairs(lines) do
        lineNum = lineNum + 1
        if lineNum > lastProcessedLine and line ~= "" then
            ProcessCommand(line)
            lastProcessedLine = lineNum
        end
    end
end

-- Polling cada 500ms: no depende del hook del personaje (menú / partida / blueprint cambiado)
LoopAsync(500, function()
    pcall(function()
        CheckForCommands()
    end)
    pcall(function()
        CheckConstants()
    end)
end)

-- Opcional: hook del personaje si existe (refuerzo; no bloquea si el path cambió)
RegisterHook("/Game/Ride/Character/Blueprints/BP_FirstPersonPlayerController.BP_FirstPersonPlayerController_C:ReceiveTick", function(self, deltaSeconds)
    pcall(function()
        CheckConstants()
    end)
end)

-- Solo vaciar respuestas; NO vaciar comandos (TikControl escribe en el mismo archivo que este script)
ExecuteWithDelay(500, function()
    local file = io.open(RESPONSE_FILE, "w")
    if file then
        file:close()
        print("[TikControl] 📁 Archivo de respuestas reiniciado")
    end
    print("[TikControl] 🎮 Mod TikControl para RV There Yet? cargado!")
    print("[TikControl] 📂 Monitoreando comandos: " .. COMMANDS_FILE)
end)
`;
    }

    extractLuaFunctions() {
        // Extraemos las funciones esenciales del script original
        return `
-- Funciones utilitarias
function split(inputstr, sep)
    if sep == nil then sep = "%s" end
    local t = {}
    for str in string.gmatch(inputstr, "([^"..sep.."]+)") do
        table.insert(t, str)
    end
    return t
end

function dump(o)
    for k,v in pairs(o) do print(k) end
end

-- Variables globales
local running = false
local lastspeed = 0.0
local lastmax = 0.0
local driving = false
local lastdriving = false
local friend = false
local curvehicle = nil

local Constants = {
    Throttle = 0.0,
    Steering = 0.0,
    Speed = 0.0
}

-- Funciones del juego
function GetPlayerController()
    if friend then
        friend = false
        return GetFriendController()
    end
    return GetMainController()
end

function GetMainController()
    local list = FindAllOf("PlayerController")
    if not list or #list < 1 then return nil end
    for i, controller in ipairs(list) do
        if controller.bIsLocalPlayerController then
            return controller
        end
    end
    return nil
end

function GetFriendController()
    local list = FindAllOf("PlayerController")
    if not list or #list < 2 then return nil end
    local item = nil
    while item == nil or item.bIsLocalPlayerController do
        local index = math.random(#list)
        item = list[index]
    end
    return item
end

function GetPlayerPawn()
    local playerController = GetPlayerController()
    if not playerController then 
        print("[TikControl] ⚠️ GetPlayerPawn: No hay controlador")
        return nil 
    end
    local pawn = playerController.Pawn
    if not pawn or not pawn:IsValid() then 
        print("[TikControl] ⚠️ GetPlayerPawn: Pawn inválido")
        return nil 
    end
    return pawn
end

function GetPlayerLocation()
    local pawn = GetPlayerPawn()
    if not pawn then return nil end
    return pawn:K2_GetActorLocation()
end

function FindVehicle()
    local vehicle = FindFirstOf("BP_Vehicle_Winnebago_01_C")
    if not vehicle or not vehicle:IsValid() then
        vehicle = FindFirstOf("BP_RV_Vehicle_C")
    end
    if not vehicle or not vehicle:IsValid() then
        vehicle = FindFirstOf("RV_Vehicle")
    end
    if not vehicle or not vehicle:IsValid() then
        vehicle = FindFirstOf("BP_VehicleBase_C")
    end
    if not vehicle or not vehicle:IsValid() then
        vehicle = FindFirstOf("Vehicle")
    end
    curvehicle = vehicle
    return vehicle
end

function FindVehiclePart(vehicle, partName)
    if not vehicle or not vehicle:IsValid() then return nil end
    local candidate = vehicle[partName]
    if candidate and type(candidate) ~= "function" and candidate:IsValid() then
        return candidate
    end
    return nil
end

-- Funciones de salud
function HealPlayer()
    local controller = GetPlayerController()
    if not controller then return 0 end
    local player = controller.ControllersFirstPersonCharacter
    if not player then return 0 end
    local ret = {}
    player:GetTotalDamageTaken(ret)
    if ret.TotalDamageTaken == 0 then return 0 end
    local list = player.CurrentDamage
    if list == nil then return 0 end
    for i = 1, #list do
        local entry = list[i]
        if entry.Value > 10 then
            entry.Value = entry.Value - 10
        else
            entry.Value = 0
        end
        player:DMG__UpdateFunc()
        player:DMG__FinishedFunc()
        player:UpdateDmgPP()
        player:OnRep_CurrentDamage()
        return 1
    end
    return 0
end

function HealFriend()
    friend = true
    return HealPlayer()
end

function DamagePlayer()
    local controller = GetPlayerController()
    if not controller then return 0 end
    local player = controller.ControllersFirstPersonCharacter
    if not player then return 0 end
    local ret = {}
    player:GetTotalDamageTaken(ret)
    if ret.TotalDamageTaken >= 90 then return 0 end
    local list = player.CurrentDamage
    if list == nil then return 0 end
    for i = 1, #list do
        local entry = list[i]
        local tag = entry.Tag
        if tag then
            local name = tag.TagName
            if name then
                name = name:ToString()
                if name == "DamageType.Player.Physical" then
                    entry.Value = entry.Value + 10
                    player:DMG__UpdateFunc()
                    player:DMG__FinishedFunc()
                    player:UpdateDmgPP()
                    player:OnRep_CurrentDamage()
                    return 1
                end
            end
        end
    end
    local insert = {}
    local item = {}
    item.TagName = FName("DamageType.Player.Physical")
    insert.Tag = item
    insert.Value = 10
    list[#list + 1] = insert
    player:DMG__UpdateFunc()
    player:DMG__FinishedFunc()
    player:UpdateDmgPP()
    player:OnRep_CurrentDamage()
    return 1
end

function DamageFriend()
    friend = true
    return DamagePlayer()
end

function KillPlayer()
    local controller = GetPlayerController()
    if not controller then return 0 end
    local player = controller.ControllersFirstPersonCharacter
    if not player then return 0 end
    local list = player.CurrentDamage
    if list == nil then return 0 end
    for i = 1, #list do
        local entry = list[i]
        local tag = entry.Tag
        if tag then
            local name = tag.TagName
            if name then
                name = name:ToString()
                if name == "DamageType.Player.Physical" then
                    entry.Value = 100
                    player:DMG__UpdateFunc()
                    player:DMG__FinishedFunc()
                    player:UpdateDmgPP()
                    player:OnRep_CurrentDamage()
                    player:KnockedOut()
                    return 1
                end
            end
        end
    end
    local insert = {}
    local item = {}
    item.TagName = FName("DamageType.Player.Physical")
    insert.Tag = item
    insert.Value = 100
    list[#list + 1] = insert
    player:DMG__UpdateFunc()
    player:DMG__FinishedFunc()
    player:UpdateDmgPP()
    player:OnRep_CurrentDamage()
    player:KnockedOut()
    return 1
end

function KillFriend()
    friend = true
    return KillPlayer()
end

function RevivePlayer()
    local controller = GetPlayerController()
    if not controller then return 0 end
    local player = controller.ControllersFirstPersonCharacter
    if not player then return 0 end
    local ret = {}
    player:IsPlayerDead(ret)
    for k, v in pairs(ret) do
        if not v then return 0 end
    end
    local pawn = controller.Pawn
    if not pawn then return 0 end
    local loc = pawn:K2_GetActorLocation()
    player:Server_RevivePlayerAtLocation(player, loc)
    return 1
end

function ReviveFriend()
    friend = true
    return RevivePlayer()
end

-- Funciones de movimiento
function LaunchPlayer()
    local controller = GetPlayerController()
    if not controller then return 0 end
    local player = controller.ControllersFirstPersonCharacter
    if not player then return 0 end
    local force = { X = 0, Y = 0, Z = 1000.0 }
    local ret = {}
    player:AddImpulse(force, ret)
    return 1
end

function LaunchFriend()
    friend = true
    return LaunchPlayer()
end

function LaunchRV()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local force = { X = 0, Y = 0, Z = 10000.0 }
    local ret = {}
    vehicle:AddImpulse(force, ret)
    return 1
end

function ShoveLeft()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local force = vehicle:GetActorRightVector()
    force.X = force.X * -3500.0
    force.Y = force.Y * -3500.0
    force.Z = force.Z * -3500.0
    local ret = {}
    vehicle:AddImpulse(force, ret)
    return 1
end

function ShoveRight()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local force = vehicle:GetActorRightVector()
    force.X = force.X * 3500.0
    force.Y = force.Y * 3500.0
    force.Z = force.Z * 3500.0
    local ret = {}
    vehicle:AddImpulse(force, ret)
    return 1
end

function ShoveForward()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local force = vehicle:GetActorForwardVector()
    force.X = force.X * 3500.0
    force.Y = force.Y * 3500.0
    force.Z = force.Z * 3500.0
    local ret = {}
    vehicle:AddImpulse(force, ret)
    return 1
end

function ShoveBack()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local force = vehicle:GetActorForwardVector()
    force.X = force.X * -3500.0
    force.Y = force.Y * -3500.0
    force.Z = force.Z * -3500.0
    local ret = {}
    vehicle:AddImpulse(force, ret)
    return 1
end

function TeleFriend()
    local controller = GetPlayerController()
    if not controller then return 0 end
    local pawn = controller.Pawn
    if not pawn then return 0 end
    friend = true
    local fcontroller = GetPlayerController()
    if not fcontroller then return 0 end
    local fpawn = fcontroller.Pawn
    if not fpawn then return 0 end
    local loc = pawn:K2_GetActorLocation()
    local rot = pawn:K2_GetActorRotation()
    loc.X = loc.X + 5.0
    loc.Y = loc.Y + 5.0
    loc.Z = loc.Z + 10.0
    fpawn.K2_TeleportTo(loc, rot)
    return 1
end

function TeleToFriend()
    local controller = GetPlayerController()
    if not controller then return 0 end
    local pawn = controller.Pawn
    if not pawn then return 0 end
    friend = true
    local fcontroller = GetPlayerController()
    if not fcontroller then return 0 end
    local fpawn = fcontroller.Pawn
    if not fpawn then return 0 end
    local loc = fpawn:K2_GetActorLocation()
    local rot = fpawn:K2_GetActorRotation()
    loc.X = loc.X + 5.0
    loc.Y = loc.Y + 5.0
    loc.Z = loc.Z + 10.0
    pawn.K2_TeleportTo(loc, rot)
    return 1
end

-- Funciones de ruedas
function RepairWheel(part)
    if not part or not part:IsValid() then return false end
    if part.isAttached ~= nil and part.isAttached then return false end
    if part.AddNewWheel ~= nil then
        part:Attach(true, true)
        part:UpdateWheel()
        ScrewInWheel(part, true)
        part:CheckScrews()
        part:HealWheelDamage(1000)
        part:SetIsDrivingWheel(true)
    end
    return true
end

function BreakWheel(part, force)
    if not part or not part:IsValid() then return false end
    if not force and part.isAttached ~= nil and not part.isAttached then return false end
    local ret = { Value = false }
    if part.TryPopOffWheel ~= nil then part:TryPopOffWheel(ret) end
    if part.TakeWheelDamage ~= nil then
        part:TakeWheelDamage(1000)
        part:TakeWheelDamage(1000)
    end
    return true
end

function ScrewInWheel(part, force)
    if not part or not part:IsValid() then return false end
    if not force and part.isAttached ~= nil and not part.isAttached then return false end
    local screws = part.ScrewHoles
    if not screws then return false end
    local screwed = 0
    for i = 1, #screws do
        local screw = screws[i]
        if screw.ScrewAmount < 1.0 then
            screwed = screwed + 1
            screw:UpdateScrewAmountFromDamage(1.0)
            screw:ScrewIn()
        end
    end
    return screwed > 0
end

function UnScrewWheel(part, force)
    if not part or not part:IsValid() then return false end
    if not force and part.isAttached ~= nil and not part.isAttached then return false end
    local screws = part.ScrewHoles
    if not screws then return false end
    local screwed = 0
    for i = 1, #screws do
        local screw = screws[i]
        if screw.ScrewAmount > 0.0 then
            screwed = screwed + 1
            screw:UpdateScrewAmountFromDamage(0.0)
            screw:ScrewIn()
        end
    end
    return screwed > 0
end

function BreakWheelByName(name, force)
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local part = FindVehiclePart(vehicle, name)
    if part and BreakWheel(part, force) then return 1 end
    return 0
end

function RepairWheelByName(name)
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local part = FindVehiclePart(vehicle, name)
    if part and RepairWheel(part) then return 1 end
    return 0
end

function ScrewInWheelByName(name)
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local part = FindVehiclePart(vehicle, name)
    if part and ScrewInWheel(part, false) then return 1 end
    return 0
end

function UnScrewWheelByName(name)
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local part = FindVehiclePart(vehicle, name)
    if part and UnScrewWheel(part, false) then return 1 end
    return 0
end

function BreakWheelFL() return BreakWheelByName("Wheel_FL", false) end
function BreakWheelFR() return BreakWheelByName("Wheel_FR", false) end
function BreakWheelRL() return BreakWheelByName("Wheel_RL", false) end
function BreakWheelRR() return BreakWheelByName("Wheel_RR", false) end
function BreakAllWheels()
    local count = BreakWheelFL() + BreakWheelFR() + BreakWheelRL() + BreakWheelRR()
    return count > 0 and 1 or 0
end
function RepairWheelFL() return RepairWheelByName("Wheel_FL") end
function RepairWheelFR() return RepairWheelByName("Wheel_FR") end
function RepairWheelRL() return RepairWheelByName("Wheel_RL") end
function RepairWheelRR() return RepairWheelByName("Wheel_RR") end
function RepairAllWheels()
    local count = RepairWheelFL() + RepairWheelFR() + RepairWheelRL() + RepairWheelRR()
    return count > 0 and 1 or 0
end
function ScrewInWheelFL() return ScrewInWheelByName("Wheel_FL") end
function ScrewInWheelFR() return ScrewInWheelByName("Wheel_FR") end
function ScrewInWheelRL() return ScrewInWheelByName("Wheel_RL") end
function ScrewInWheelRR() return ScrewInWheelByName("Wheel_RR") end
function UnScrewWheelFL() return UnScrewWheelByName("Wheel_FL") end
function UnScrewWheelFR() return UnScrewWheelByName("Wheel_FR") end
function UnScrewWheelRL() return UnScrewWheelByName("Wheel_RL") end
function UnScrewWheelRR() return UnScrewWheelByName("Wheel_RR") end

-- Funciones de daño/reparación RV
function BreakRV()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local parts = vehicle.RepairableSocketTruckParts
    if not parts then return 0 end
    local opts = {}
    for i = 1, #parts do
        local part = parts[i]
        if part and part:IsValid() then opts[#opts + 1] = i end
    end
    if #opts == 0 then return 0 end
    local item = opts[math.random(#opts)]
    local chosen = parts[item]
    chosen:CrashDestroy()
    chosen.ShieldHealth = 0
    vehicle:RecalculateShieldHealth()
    vehicle:UpdateShieldBarWidget(false)
    return 1
end

function RepairRV()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local parts = vehicle.RepairableSocketTruckParts
    if not parts then return 0 end
    local opts = {}
    for i = 1, #parts do
        local part = parts[i]
        if not part or not part:IsValid() then opts[#opts + 1] = i end
    end
    if #opts == 0 then return 0 end
    local item = opts[math.random(#opts)]
    local slots = vehicle.RepairableSocketNames
    if not slots then return 0 end
    local chosen = slots[item]
    local ret = {}
    vehicle:RepairShield(chosen, ret)
    vehicle:RecalculateShieldHealth()
    vehicle:UpdateShieldBarWidget(false)
    return 1
end

-- Daño por tipo
local DamageClasses = {
    Engine = "DamageType.Engine",
    Frame = "DamageType.Frame",
    TireFL = "DamageType.Tire.FL",
    TireFR = "DamageType.Tire.FR",
    TireRL = "DamageType.Tire.RL",
    TireRR = "DamageType.Tire.RR"
}

function DamageByName(cur, val, msg)
    local name = DamageClasses[msg]
    if not name then return 0 end
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local list = vehicle.CurrentDamage
    if list == nil then return 0 end
    for i = 1, #list do
        local entry = list[i]
        local tag = entry.Tag
        if tag and tag.TagName then
            local tagName = tag.TagName:ToString()
            if tagName == name then
                entry.Value = entry.Value + 10
                vehicle:RecalculateShieldHealth()
                vehicle:UpdateShieldBarWidget(false)
                return 1
            end
        end
    end
    local insert = {}
    local item = {}
    item.TagName = FName(name)
    insert.Tag = item
    insert.Value = 10
    list[#list + 1] = insert
    vehicle:RecalculateShieldHealth()
    vehicle:UpdateShieldBarWidget(false)
    return 1
end

function RepairByName(cur, val, msg)
    local name = DamageClasses[msg]
    if not name then return 0 end
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local list = vehicle.CurrentDamage
    if list == nil then return 0 end
    for i = 1, #list do
        local entry = list[i]
        local tag = entry.Tag
        if tag and tag.TagName then
            local tagName = tag.TagName:ToString()
            if tagName == name then
                if entry.Value > 10 then
                    entry.Value = entry.Value - 10
                else
                    entry.Value = 0
                end
                vehicle:RecalculateShieldHealth()
                vehicle:UpdateShieldBarWidget(true)
                return 1
            end
        end
    end
    return 0
end

-- Motor y marchas
function SetGear(val)
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local ret = {}
    vehicle:GetShifterPosition(ret)
    local state = nil
    for k, v in pairs(ret) do
        state = v
        if state ~= 3 then return 0 end
    end
    if state == nil then return 0 end
    local gearbox = vehicle.GearBox
    if gearbox.CurrentGear == val then return 0 end
    gearbox:Server_SetCurrentGear(val)
    return 1
end

function ParkOn()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local ret = {}
    vehicle:GetShifterPosition(ret)
    for k, v in pairs(ret) do
        if v == 0 then return 0 end
    end
    vehicle:SetShifterPosition(0)
    return 1
end

function ParkOff()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local ret = {}
    vehicle:GetShifterPosition(ret)
    for k, v in pairs(ret) do
        if v ~= 0 then return 0 end
    end
    vehicle:SetShifterPosition(3)
    return 1
end

function EngineOn()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local ret = {}
    vehicle:GetEngineRunning(ret)
    for k, v in pairs(ret) do
        if v then return 0 end
    end
    vehicle:SetEngineRunning(true)
    return 1
end

function EngineOff()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    local ret = {}
    vehicle:GetEngineRunning(ret)
    for k, v in pairs(ret) do
        if not v then return 0 end
    end
    vehicle:SetEngineRunning(false)
    return 1
end

function Honk()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    vehicle:PlayHonkSound(true)
    vehicle:Server_Honk(true)
    vehicle:Multicast_Honk(true)
    ExecuteWithDelay(500, function()
        vehicle:Server_Honk(false)
        vehicle:Multicast_Honk(false)
        vehicle:PlayHonkSound(false)
    end)
    return 1
end

function Unhitch()
    local vehicle = FindVehicle()
    if not vehicle or not vehicle:IsValid() then return 0 end
    vehicle:UnhitchAll()
    return 1
end

-- Items y spawns
local ItemClasses = {
    Drill = "/Game/Ride/Interactables/BP_Interactable_PowerDrill.BP_Interactable_PowerDrill_C",
    Beer = "/Game/Ride/Interactables/Misc/Food/Beer/BP_Interactable_Beer.BP_Interactable_Beer_C",
    Burger = "/Game/Ride/Interactables/Misc/Food/Burger/BP_Interactable_Burger.BP_Interactable_Burger_C",
    Crank = "/Game/Ride/Interactables/BP_Interactable_Crank.BP_Interactable_Crank_C",
    Flare = "/Game/Ride/Interactables/Flare/BP_Interactable_Flare.BP_Interactable_Flare_C",
    Repair = "/Game/Ride/Interactables/BP_Interactable_RepairTool_01.BP_Interactable_RepairTool_01_C",
    TruckFlipper = "/Game/Ride/Interactables/TruckFlipper/BP_Interactable_TruckFlipper.BP_Interactable_TruckFlipper_C",
    Wheel = "/Game/Ride/Interactables/BP_Interactable_Wheel.BP_Interactable_Wheel_C",
    WinchController = "/Game/Ride/Interactables/Winch/BP_Interactable_WinchController.BP_Interactable_WinchController_C"
}

local AnimalClasses = {
    Snake = "/Game/Ride/Environment/Wildlife/Snake/BP_Interactable_Snake.BP_Interactable_Snake_C",
    Bear = "/Game/Ride/Environment/Wildlife/Bear/BP_Bear.BP_Bear_C",
    Moose = "/Game/Ride/Events/Wildlife/BP_Interactable_Moose_01.BP_Interactable_Moose_01_C",
    Aligator = "/Game/Ride/Environment/Wildlife/Alligator/BP_Interactable_Alligator.BP_Interactable_Alligator_C",
    Eagle = "/Game/Ride/Environment/Wildlife/Eagle/BP_BaldEagle.BP_BaldEagle_C"
}

function CalculateSpawnLocation(distance, offset)
    print("[TikControl] 📍 CalculateSpawnLocation: distance=" .. tostring(distance))
    local pawn = GetPlayerPawn()
    if not pawn then 
        print("[TikControl] ❌ CalculateSpawnLocation: No se encontró pawn del jugador")
        return nil 
    end
    local playerLoc = pawn:K2_GetActorLocation()
    local forwardVec = pawn:GetActorForwardVector()
    local spawnLoc = {
        X = playerLoc.X + (forwardVec.X * distance) + (offset.X or 0),
        Y = playerLoc.Y + (forwardVec.Y * distance) + (offset.Y or 0),
        Z = playerLoc.Z + (offset.Z or 100)
    }
    print("[TikControl] ✅ CalculateSpawnLocation: X=" .. tostring(spawnLoc.X) .. " Y=" .. tostring(spawnLoc.Y) .. " Z=" .. tostring(spawnLoc.Z))
    return spawnLoc
end

function SpawnActor(className, location)
    print("[TikControl] 🎭 SpawnActor: " .. tostring(className))
    
    local pawn = GetPlayerPawn()
    if not pawn then 
        print("[TikControl] ❌ SpawnActor: No se encontró pawn")
        return nil 
    end
    
    local world = pawn:GetWorld()
    if not world or not world:IsValid() then 
        print("[TikControl] ❌ SpawnActor: Mundo inválido")
        return nil 
    end
    
    -- Intentar encontrar la clase
    local actorClass = nil
    
    if className:find("/") then
        actorClass = StaticFindObject(className)
        print("[TikControl] 🔍 StaticFindObject: " .. (actorClass and "encontrado" or "no encontrado"))
        
        if not actorClass then
            local classType = StaticFindObject("Class /Script/CoreUObject.Object")
            if classType then 
                actorClass = StaticLoadObject(classType, className)
                print("[TikControl] 🔍 StaticLoadObject: " .. (actorClass and "cargado" or "no cargado"))
            end
        end
    else
        actorClass = StaticFindObject(className)
    end
    
    if not actorClass then 
        print("[TikControl] ❌ SpawnActor: Clase no encontrada: " .. className)
        return nil 
    end
    
    local rotation = { Pitch = 0, Yaw = 0, Roll = 0 }
    
    print("[TikControl] 🎯 Intentando SpawnActor en X=" .. tostring(location.X))
    local actor = world:SpawnActor(actorClass, location, rotation)
    
    if actor and actor:IsValid() then 
        print("[TikControl] ✅ SpawnActor: Actor creado exitosamente")
        return actor 
    end
    
    print("[TikControl] ❌ SpawnActor: Falló la creación del actor")
    return nil
end

function GiveItemByName(cur, val, msg)
    print("[TikControl] 🎁 GiveItemByName: " .. tostring(msg))
    local name = ItemClasses[msg]
    if not name then 
        print("[TikControl] ❌ GiveItemByName: Item no encontrado en lista: " .. tostring(msg))
        print("[TikControl] 📋 Items disponibles: Drill, Beer, Burger, Crank, Flare, Repair, TruckFlipper, Wheel, WinchController")
        return 0 
    end
    local offset = { X = 0, Y = 0, Z = 60.0 }
    local location = CalculateSpawnLocation(300.0, offset)
    if not location then 
        print("[TikControl] ❌ GiveItemByName: No se pudo calcular ubicación")
        return 0 
    end
    local item = SpawnActor(name, location)
    if item then
        print("[TikControl] ✅ GiveItemByName: Item creado: " .. tostring(msg))
        return 1
    end
    print("[TikControl] ❌ GiveItemByName: Falló crear item")
    return 0
end

function SpawnByName(cur, val, msg)
    print("[TikControl] 🐻 SpawnByName: " .. tostring(msg))
    local name = AnimalClasses[msg]
    if not name then 
        print("[TikControl] ❌ SpawnByName: Animal no encontrado en lista: " .. tostring(msg))
        print("[TikControl] 📋 Animales disponibles: Snake, Bear, Moose, Aligator, Eagle")
        return 0 
    end
    print("[TikControl] 🔍 Clase del animal: " .. name)
    local offset = { X = 0, Y = 0, Z = 60.0 }
    local location = CalculateSpawnLocation(1000.0, offset)
    if not location then 
        print("[TikControl] ❌ SpawnByName: No se pudo calcular ubicación")
        return 0 
    end
    local item = SpawnActor(name, location)
    if item then
        print("[TikControl] ✅ SpawnByName: Animal spawneado: " .. tostring(msg))
        return 1
    end
    print("[TikControl] ❌ SpawnByName: Falló spawn del animal")
    return 0
end

function DropItem()
    local controller = GetPlayerController()
    if not controller then return 0 end
    local player = controller.ControllersFirstPersonCharacter
    if not player then return 0 end
    local ret = {}
    player:GetPickUpActor(ret)
    local item = nil
    for k, v in pairs(ret) do
        item = v
        if not v:IsValid() then return 0 end
    end
    if not item then return 0 end
    ret = {}
    player:CanDropCurrentHeldActorSafely(ret)
    for k, v in pairs(ret) do
        if not v then return 0 end
    end
    player:StartDrop(0)
    return 1
end

-- Controles forzados
function CheckDriving(vehicle)
    if not vehicle then
        driving = false
        return
    end
    local ret = {}
    vehicle:GetShifterPosition(ret)
    for k, v in pairs(ret) do
        if v == 0 then
            driving = false
            return
        end
    end
    ret = {}
    vehicle:GetEngineRunning(ret)
    for k, v in pairs(ret) do
        driving = v
    end
end

function CheckConstants()
    local vehicle = nil
    lastdriving = driving
    if Constants.Throttle > 0 or Constants.Steering ~= 0 then
        vehicle = FindVehicle()
        CheckDriving(vehicle)
    else
        driving = false
    end
    if Constants.Throttle > 0 and driving then
        if not vehicle then vehicle = FindVehicle() end
        if vehicle then
            vehicle.Throttle = Constants.Throttle
            vehicle.ThrottleInput = 1.0
        end
    end
    if Constants.Steering ~= 0 and driving then
        if not vehicle then vehicle = FindVehicle() end
        if vehicle then
            vehicle.Steering = Constants.Steering
        end
    end
    if Constants.Speed ~= 0 and driving then
        if not vehicle then vehicle = FindVehicle() end
        if vehicle then
            if vehicle.TargetSpeed ~= lastspeed then
                vehicle.TargetSpeed = Constants.Speed * vehicle.TargetSpeed
                lastspeed = vehicle.TargetSpeed
            end
            local gear = vehicle.Gear
            if gear and gear.EndSpeed ~= lastmax then
                gear.EndSpeed = Constants.Speed * gear.EndSpeed
                lastmax = gear.EndSpeed
            end
        end
    end
end

function SetConstant(cur, val, msg)
    cur = cur / 100.0
    Constants[msg] = cur
    return 1
end
`;
    }

    _saveGamePathToConfig(gamePath) {
        try {
            const configPath = path.join(app.getPath('userData'), 'electron-config.json');
            let config = {};
            if (fs.existsSync(configPath)) {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
            config['rvtheryet_game_path'] = gamePath;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        } catch (_) {}
    }

    stop() {
        if (this.responseWatcher) {
            this.responseWatcher.close();
            this.responseWatcher = null;
        }
        this.pendingRequests.clear();
    }
}

const rvThereYetService = new RVThereYetService();

module.exports = {
    initialize: (mainWindow) => rvThereYetService.initialize(mainWindow),
    service: rvThereYetService
};

