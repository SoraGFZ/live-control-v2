/**
 * Módulo de Overcooked! 2 para TikControl
 * Maneja la conexión TCP con el mod del juego
 */

const { ipcMain, app, dialog, shell } = require('electron');
const net = require('net');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execFileSync } = require('child_process');
const { findGamePath, resolveDir } = require('../steamDetect');
const { resolveSetGamePathArgs } = require('../setGamePathArgs');

let mainWindow = null;
let tcpServer = null;
let gameClient = null;
let isConnected = false;
let gamePath = null;
let requestId = 0;
const pendingRequests = new Map();
let ipcHandlersRegistered = false;

const CONFIG_FILE = 'overcooked2-config.json';
const TCP_PORT = 9994;
const TARGET_MOD_VERSION = '1.1.1';

function normalizeVersion(value) {
    const match = String(value || '').match(/\d+(?:\.\d+){0,3}/);
    if (!match) return null;
    const parts = match[0].split('.').map(n => parseInt(n, 10));
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3).join('.');
}

function compareVersions(a, b) {
    const av = normalizeVersion(a);
    const bv = normalizeVersion(b);
    if (!av || !bv) return av === bv ? 0 : (!av ? -1 : 1);
    const aa = av.split('.').map(Number);
    const bb = bv.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1;
    }
    return 0;
}

function getDllVersion(dllPath) {
    if (!dllPath || !fs.existsSync(dllPath)) return null;
    try {
        const script = "$p=$args[0]; $v=(Get-Item -LiteralPath $p).VersionInfo; if ($v.ProductVersion) { $v.ProductVersion } else { $v.FileVersion }";
        const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script, dllPath], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 5000
        }).trim();
        return normalizeVersion(raw);
    } catch (e) {
        console.warn('[overcooked2] No se pudo leer versión del DLL:', e.message);
        return null;
    }
}

function initialize(window) {
    mainWindow = window;
    loadSavedGamePath();
    registerIpcHandlers();
    startTcpServer();
    console.log('[overcooked2] Módulo inicializado');
}

function startTcpServer() {
    if (tcpServer) {
        tcpServer.close(() => {
            tcpServer = null;
            createTcpServer();
        });
        return;
    }
    createTcpServer();
}

function createTcpServer() {
    tcpServer = net.createServer((socket) => {
        console.log('[overcooked2] 🎮 Juego conectado!');
        gameClient = socket;
        isConnected = true;

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('overcooked2:connected', true);
        }

        let buffer = '';

        socket.on('data', (data) => {
            buffer += data.toString();

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const message = buffer.substring(0, newlineIndex);
                buffer = buffer.substring(newlineIndex + 1);

                if (message.trim()) {
                    try {
                        const response = JSON.parse(message);
                        handleGameResponse(response);
                    } catch (e) {
                        console.error('[overcooked2] Error parseando respuesta:', e);
                    }
                }
            }
        });

        socket.on('close', () => {
            console.log('[overcooked2] Juego desconectado');
            gameClient = null;
            isConnected = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('overcooked2:connected', false);
            }
        });

        socket.on('error', (err) => {
            console.error('[overcooked2] Error de socket:', err.message);
        });
    });

    const { listenWithFallback } = require('../../lib/dynamicPort');
    listenWithFallback(tcpServer, TCP_PORT, '127.0.0.1', 'overcooked2')
        .then((port) => {
            console.log(`[overcooked2] Servidor TCP escuchando en puerto ${port}`);
        })
        .catch((err) => {
            console.error('[overcooked2] Error del servidor:', err.message);
        });
}

function handleGameResponse(response) {
    console.log('[overcooked2] Respuesta:', response);

    if (response.requestId && pendingRequests.has(response.requestId)) {
        const { resolve } = pendingRequests.get(response.requestId);
        pendingRequests.delete(response.requestId);
        resolve(response);
    }
}

async function executeCommand(command, parameters = {}) {
    return new Promise((resolve, reject) => {
        if (!isConnected || !gameClient) {
            reject(new Error('Juego no conectado. Asegurate de que Overcooked! 2 este ejecutandose con el mod de TikControl.'));
            return;
        }

        const currentRequestId = ++requestId;
        const message = JSON.stringify({
            type: 'command',
            requestId: currentRequestId,
            command: command,
            parameters: parameters
        }) + '\n';

        console.log('[overcooked2] Enviando comando:', command, parameters);

        pendingRequests.set(currentRequestId, { resolve, reject });

        setTimeout(() => {
            if (pendingRequests.has(currentRequestId)) {
                pendingRequests.delete(currentRequestId);
                reject(new Error('Timeout esperando respuesta del juego'));
            }
        }, 10000);

        try {
            gameClient.write(message);
        } catch (error) {
            pendingRequests.delete(currentRequestId);
            reject(error);
        }
    });
}

function sendProgress(message) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('overcooked2:install-progress', { message });
    }
}

function registerIpcHandlers() {
    if (ipcHandlersRegistered) return;
    ipcHandlersRegistered = true;

    ipcMain.handle('overcooked2:executeEffect', async (event, command, parameters = {}) => {
        try {
            const result = await executeCommand(command, parameters);
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('overcooked2:getConnectionStatus', () => {
        return isConnected;
    });

    ipcMain.handle('overcooked2:setGamePath', async (event, a, b) => {
        const { path: resolved } = resolveSetGamePathArgs(a, b);
        if (resolved && fs.existsSync(resolved)) {
            gamePath = resolved;
            saveGamePath(resolved);
            return { success: true, path: resolved };
        }
        return { success: false, error: 'Ruta no válida' };
    });

    ipcMain.handle('overcooked2:selectGamePath', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar Overcooked2.exe',
            filters: [{ name: 'Ejecutable', extensions: ['exe'] }],
            properties: ['openFile']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const selectedPath = result.filePaths[0];
            if (selectedPath.toLowerCase().includes('overcooked2.exe')) {
                gamePath = selectedPath;
                saveGamePath(selectedPath);
                return { success: true, path: selectedPath };
            }
        }
        return { success: false };
    });

    ipcMain.handle('overcooked2:getGamePath', () => {
        return gamePath;
    });

    ipcMain.handle('overcooked2:findGame', async () => {
        const foundDir = findGamePath('Overcooked! 2', 'Overcooked2.exe');
        if (foundDir) {
            gamePath = foundDir;
            saveGamePath(foundDir);
            return { success: true, path: foundDir };
        }

        return { success: false, error: 'No se encontró el juego automáticamente' };
    });

    ipcMain.handle('overcooked2:installMod', async () => {
        try {
            if (!gamePath) {
                throw new Error('Primero debes configurar la ruta del juego');
            }

            const gameDir = resolveDir(gamePath);
            const modUrl = 'https://storage.tikcontrol.live/games/overcooked2/mod.zip?v=5';
            const tempDir = path.join(app.getPath('temp'), 'tikcontrol_overcooked2_mod');
            const zipPath = path.join(tempDir, 'overcooked2_mod.zip');

            // Crear directorio temporal
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            sendProgress('📥 Descargando mod de TikControl para Overcooked! 2...');
            console.log('[overcooked2] 📥 Descargando mod desde:', modUrl);

            // Descargar el mod
            await new Promise((resolve, reject) => {
                const file = fs.createWriteStream(zipPath);

                const downloadWithRedirects = (url, redirectCount = 0) => {
                    if (redirectCount > 5) {
                        reject(new Error('Demasiadas redirecciones'));
                        return;
                    }

                    https.get(url, {
                        headers: { 'User-Agent': 'TikControl/1.0' }
                    }, (response) => {
                        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
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

            console.log('[overcooked2] ✅ Descarga completada');
            sendProgress('📦 Extrayendo mod...');

            // Extraer el mod completo (incluye MelonLoader + plugin).
            // adm-zip falla con algunos ZIP generados con data descriptors ("No descriptor present").
            const extractZip = require('extract-zip');
            await extractZip(zipPath, { dir: gameDir });

            console.log('[overcooked2] ✅ Mod extraído a:', gameDir);

            // Verificar instalación
            const modFile = path.join(gameDir, 'Mods', 'TikControl.dll');
            const melonLoaderDir = path.join(gameDir, 'MelonLoader');
            const loaderDll = path.join(gameDir, 'version.dll');
            const modInstalled = fs.existsSync(modFile) && fs.existsSync(melonLoaderDir) && fs.existsSync(loaderDll);
            const melonInstalled = fs.existsSync(melonLoaderDir) && fs.existsSync(loaderDll);
            const installedVersion = getDllVersion(modFile);

            // Limpiar temporales
            try {
                fs.unlinkSync(zipPath);
                fs.rmSync(tempDir, { recursive: true });
            } catch (e) { }

            sendProgress(modInstalled ? '✅ Mod instalado correctamente!' : '✅ Archivos extraídos');

            return {
                success: true,
                message: modInstalled
                    ? '¡Mod de TikControl instalado correctamente!'
                    : melonInstalled
                        ? 'MelonLoader instalado. Inicia el juego y vuelve a instalar.'
                        : 'Archivos extraídos.',
                modInstalled,
                melonInstalled,
                installedVersion,
                targetVersion: TARGET_MOD_VERSION,
                needsUpdate: false
            };
        } catch (error) {
            console.error('[overcooked2] ❌ Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('overcooked2:uninstallMod', async () => {
        try {
            if (!gamePath) {
                throw new Error('No hay ruta del juego configurada');
            }

            const gameDir = resolveDir(gamePath);

            const itemsToDelete = [
                path.join(gameDir, 'MelonLoader'),
                path.join(gameDir, 'Mods'),
                path.join(gameDir, 'UserData'),
                path.join(gameDir, 'UserLibs'),
                path.join(gameDir, 'Plugins'),
                path.join(gameDir, 'version.dll'),
                path.join(gameDir, 'dobby.dll'),
                path.join(gameDir, 'NOTICE.txt')
            ];

            let deleted = 0;
            for (const item of itemsToDelete) {
                try {
                    if (fs.existsSync(item)) {
                        const stat = fs.statSync(item);
                        if (stat.isDirectory()) {
                            fs.rmSync(item, { recursive: true });
                        } else {
                            fs.unlinkSync(item);
                        }
                        deleted++;
                    }
                } catch (e) { }
            }

            return { success: true, message: `Mod desinstalado (${deleted} elementos eliminados)` };
        } catch (error) {
            throw error;
        }
    });

    ipcMain.handle('overcooked2:checkModStatus', async () => {
        try {
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };

            const gameDir = resolveDir(gamePath);
            const modsDir = path.join(gameDir, 'Mods');
            const modFile = path.join(modsDir, 'TikControl.dll');
            const melonLoaderDir = path.join(gameDir, 'MelonLoader');
            const loaderDll = path.join(gameDir, 'version.dll');

            const melonInstalled = fs.existsSync(melonLoaderDir) && fs.existsSync(loaderDll);
            const modInstalled = fs.existsSync(modFile) && melonInstalled;
            const installedVersion = getDllVersion(modFile);
            const needsUpdate = modInstalled && compareVersions(installedVersion, TARGET_MOD_VERSION) < 0;

            return {
                installed: modInstalled,
                melonLoaderInstalled: melonInstalled,
                installedVersion,
                targetVersion: TARGET_MOD_VERSION,
                needsUpdate,
                reason: !melonInstalled ? 'MelonLoader no instalado' :
                    !modInstalled ? 'Mod TikControl no instalado' :
                        needsUpdate ? `Actualización disponible (${installedVersion || 'desconocida'} -> ${TARGET_MOD_VERSION})` : 'OK'
            };
        } catch (error) {
            return { installed: false, reason: error.message };
        }
    });

    ipcMain.handle('overcooked2:launchGame', async () => {
        try {
            try {
                await shell.openExternal('steam://rungameid/728880');
                return { success: true, method: 'steam' };
            } catch (_) {}

            if (gamePath) {
                const dir = fs.existsSync(gamePath) && fs.statSync(gamePath).isDirectory() ? gamePath : path.dirname(gamePath);
                const exePath = path.join(dir, 'Overcooked2.exe');
                if (fs.existsSync(exePath)) {
                    await shell.openPath(exePath);
                    return { success: true, method: 'direct' };
                }
                if (fs.existsSync(gamePath) && !fs.statSync(gamePath).isDirectory()) {
                    await shell.openPath(gamePath);
                    return { success: true, method: 'direct' };
                }
            }
            return { success: false, error: 'No se pudo lanzar el juego. Ábrelo desde Steam.' };
        } catch (error) {
            throw error;
        }
    });
}

function loadSavedGamePath() {
    try {
        const configPath = path.join(app.getPath('userData'), CONFIG_FILE);
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.gamePath && fs.existsSync(config.gamePath)) {
                gamePath = config.gamePath;
                console.log('[overcooked2] Ruta cargada:', gamePath);
            }
        }
    } catch (e) {
        console.error('[overcooked2] Error cargando config:', e);
    }
}

function saveGamePath(newPath) {
    try {
        const configPath = path.join(app.getPath('userData'), CONFIG_FILE);
        fs.writeFileSync(configPath, JSON.stringify({ gamePath: newPath }, null, 2));
        console.log('[overcooked2] Ruta guardada:', newPath);
    } catch (e) {
        console.error('[overcooked2] Error guardando config:', e);
    }
}

function getGamePath() {
    return gamePath;
}

module.exports = {
    initialize,
    executeCommand,
    isConnected: () => isConnected,
    getGamePath
};


















