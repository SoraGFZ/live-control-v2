/**
 * Schedule I - TikControl Integration Module
 * Puerto TCP: 9996
 * Usa MelonLoader
 */

const { ipcMain, dialog } = require('electron');
const net = require('net');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { findGamePath, resolveDir } = require('../steamDetect');
const { resolveSetGamePathArgs } = require('../setGamePathArgs');

let mainWindow = null;
let tcpServer = null;
let gameClient = null;
let isConnected = false;
let requestId = 0;
let pendingRequests = new Map();

const PORT = 9996;
const GAME_ID = 'schedule1';
const GAME_NAME = 'Schedule I';

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    startTcpServer();
    loadSavedGamePath();
    console.log('[schedule1] Modulo inicializado');
}

function loadSavedGamePath() {
    try {
        const configPath = path.join(require('electron').app.getPath('userData'), 'electron-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.schedule1_game_path) {
                console.log('[schedule1] Ruta cargada:', config.schedule1_game_path);
            }
        }
    } catch (err) {
        console.error('[schedule1] Error cargando ruta:', err);
    }
}

function saveGamePath(gamePath) {
    try {
        const configPath = path.join(require('electron').app.getPath('userData'), 'electron-config.json');
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        config.schedule1_game_path = gamePath;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('[schedule1] Ruta guardada:', gamePath);
    } catch (err) {
        console.error('[schedule1] Error guardando ruta:', err);
    }
}

function getGamePath() {
    try {
        const configPath = path.join(require('electron').app.getPath('userData'), 'electron-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config.schedule1_game_path || null;
        }
    } catch (err) {
        console.error('[schedule1] Error obteniendo ruta:', err);
    }
    return null;
}

function startTcpServer() {
    if (tcpServer) {
        console.log('[schedule1] Servidor TCP ya iniciado');
        return;
    }

    tcpServer = net.createServer((socket) => {
        console.log('[schedule1] Juego conectado!');
        gameClient = socket;
        isConnected = true;

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('schedule1:connected');
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
                        console.error('[schedule1] Error parseando respuesta:', e);
                    }
                }
            }
        });

        socket.on('close', () => {
            console.log('[schedule1] Juego desconectado');
            gameClient = null;
            isConnected = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('schedule1:disconnected');
            }
        });

        socket.on('error', (err) => {
            console.error('[schedule1] Error de socket:', err.message);
        });
    });

    tcpServer.listen(PORT, '127.0.0.1', () => {
        console.log('[schedule1] Servidor TCP en puerto', PORT);
    });

    tcpServer.on('error', (err) => {
        console.error('[schedule1] Error del servidor TCP:', err.message);
        if (err.code === 'EADDRINUSE') {
            setTimeout(() => {
                tcpServer.close();
                tcpServer = null;
                startTcpServer();
            }, 3000);
        }
    });
}

function handleGameResponse(response) {
    console.log('[schedule1] Respuesta:', response);

    if (response.requestId && pendingRequests.has(response.requestId)) {
        const { resolve } = pendingRequests.get(response.requestId);
        pendingRequests.delete(response.requestId);
        resolve(response);
    }
}

async function executeCommand(command, parameters = {}) {
    return new Promise((resolve, reject) => {
        if (!isConnected || !gameClient) {
            reject(new Error('Juego no conectado. Asegurate de que Schedule I este ejecutandose con el mod de TikControl.'));
            return;
        }

        const currentRequestId = ++requestId;
        const message = JSON.stringify({
            type: 'command',
            requestId: currentRequestId,
            command: command,
            parameters: parameters
        }) + '\n';

        console.log('[schedule1] Enviando comando:', command, parameters);

        const timeout = setTimeout(() => {
            if (pendingRequests.has(currentRequestId)) {
                pendingRequests.delete(currentRequestId);
                resolve({ success: true, message: 'Comando enviado (sin confirmacion)' });
            }
        }, 10000);

        pendingRequests.set(currentRequestId, {
            resolve: (response) => {
                clearTimeout(timeout);
                resolve(response);
            },
            reject: (error) => {
                clearTimeout(timeout);
                reject(error);
            }
        });

        try {
            gameClient.write(message);
        } catch (err) {
            clearTimeout(timeout);
            pendingRequests.delete(currentRequestId);
            reject(new Error('Error enviando comando: ' + err.message));
        }
    });
}

function registerIpcHandlers() {
    ipcMain.handle('schedule1:executeEffect', async (event, command, parameters = {}) => {
        try {
            const result = await executeCommand(command, parameters);
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('schedule1:isConnected', () => {
        return isConnected;
    });

    ipcMain.handle('schedule1:getStatus', () => {
        return {
            connected: isConnected,
            gamePath: getGamePath()
        };
    });

    ipcMain.handle('schedule1:getGamePath', () => getGamePath());

    ipcMain.handle('schedule1:setGamePath', async (event, a, b) => {
        const { path: resolved } = resolveSetGamePathArgs(a, b);
        if (resolved && fs.existsSync(resolved)) {
            saveGamePath(resolved);
            return { success: true, path: resolved };
        }
        return { success: false, error: 'Ruta no valida' };
    });

    ipcMain.handle('schedule1:selectGamePath', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar ejecutable de Schedule I',
            filters: [{ name: 'Ejecutable', extensions: ['exe'] }],
            properties: ['openFile']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const selectedPath = result.filePaths[0];
            saveGamePath(selectedPath);
            return { success: true, path: selectedPath };
        }
        return { success: false, error: 'No se selecciono ningun archivo' };
    });

    ipcMain.handle('schedule1:installMod', async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) {
                throw new Error('Primero debes configurar la ruta del juego');
            }

            const gameDir = resolveDir(gamePath);
            const modUrl = 'https://storage.tikcontrol.live/games/schedule1/mod.zip?v=2';
            const tempDir = path.join(require('electron').app.getPath('temp'), 'tikcontrol_schedule1_mod');
            const zipPath = path.join(tempDir, 'schedule1_mod.zip');

            // Crear directorio temporal
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            sendProgress('📥 Descargando mod de TikControl para Schedule I...');
            console.log('[schedule1] 📥 Descargando mod desde:', modUrl);

            // Descargar el mod completo (incluye MelonLoader + plugin)
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
                            console.log('[schedule1] ↪️ Redirigiendo a:', response.headers.location);
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

            console.log('[schedule1] ✅ Descarga completada');
            sendProgress('📦 Extrayendo mod...');

            // Extraer el mod completo (incluye MelonLoader + plugin)
            const extractZip = require('extract-zip');
            await extractZip(zipPath, { dir: gameDir });

            console.log('[schedule1] ✅ Mod extraído a:', gameDir);

            // Verificar que el mod se instaló correctamente
            const modFile = path.join(gameDir, 'Mods', 'TikControl.dll');
            const melonLoaderDir = path.join(gameDir, 'MelonLoader');
            const loaderDll = path.join(gameDir, 'version.dll');
            const modInstalled = fs.existsSync(modFile) && fs.existsSync(melonLoaderDir) && fs.existsSync(loaderDll);
            const melonInstalled = fs.existsSync(melonLoaderDir) && fs.existsSync(loaderDll);

            // Limpiar archivos temporales
            try {
                fs.unlinkSync(zipPath);
                fs.rmSync(tempDir, { recursive: true });
            } catch (e) {
                console.log('[schedule1] ⚠️ No se pudo limpiar temporales:', e.message);
            }

            sendProgress(modInstalled ? '✅ Mod instalado correctamente!' : '✅ MelonLoader instalado, verificando mod...');

            return {
                success: true,
                message: modInstalled
                    ? '¡Mod de TikControl instalado correctamente! Inicia el juego para conectar.'
                    : melonInstalled
                        ? 'MelonLoader instalado. Inicia el juego una vez y vuelve a instalar.'
                        : 'Archivos extraídos. Verifica la instalación.',
                modInstalled: modInstalled,
                melonInstalled: melonInstalled
            };
        } catch (error) {
            console.error('[schedule1] ❌ Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('schedule1:uninstallMod', async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) {
                throw new Error('No hay ruta del juego configurada');
            }

            const gameDir = resolveDir(gamePath);

            const itemsToDelete = [
                path.join(gameDir, 'MelonLoader'),
                path.join(gameDir, 'Mods'),
                path.join(gameDir, 'UserData'),
                path.join(gameDir, 'UserLibs'),
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
                        console.log('[schedule1] ✅ Eliminado:', item);
                    }
                } catch (e) {
                    console.log('[schedule1] ⚠️ No se pudo eliminar:', item, e.message);
                }
            }

            return { success: true, message: `Mod desinstalado correctamente (${deleted} elementos eliminados)` };
        } catch (error) {
            console.error('[schedule1] Error desinstalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('schedule1:checkModStatus', async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };

            const gameDir = resolveDir(gamePath);
            const modsDir = path.join(gameDir, 'Mods');
            const modFile = path.join(modsDir, 'TikControl.dll');
            const melonLoaderDir = path.join(gameDir, 'MelonLoader');
            const loaderDll = path.join(gameDir, 'version.dll');

            return {
                installed: fs.existsSync(modFile) && fs.existsSync(melonLoaderDir) && fs.existsSync(loaderDll),
                melonLoaderInstalled: fs.existsSync(melonLoaderDir) && fs.existsSync(loaderDll),
                modPath: modFile
            };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('schedule1:findGame', async () => {
        const foundDir = findGamePath('Schedule I', 'Schedule I.exe');
        if (foundDir) {
            saveGamePath(foundDir);
            return { success: true, path: foundDir };
        }

        return { success: false, error: 'Juego no encontrado. Por favor selecciona la ruta manualmente.' };
    });

    ipcMain.handle('schedule1:launchGame', async () => {
        try {
            const { shell } = require('electron');
            try {
                await shell.openExternal('steam://rungameid/3164500');
                return { success: true, method: 'steam' };
            } catch (_) {}

            const gamePath = getGamePath();
            if (gamePath && fs.existsSync(gamePath)) {
                const exePath = path.join(gamePath, 'Schedule I.exe');
                if (fs.existsSync(exePath)) {
                    await shell.openPath(exePath);
                    return { success: true, method: 'direct' };
                }
            }

            return { success: false, error: 'No se pudo lanzar el juego. Ábrelo desde Steam.' };
        } catch (error) {
            console.error('[schedule1] Error lanzando juego:', error);
            throw error;
        }
    });
}

function sendProgress(message) {
    console.log('[schedule1]', message);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('schedule1:install-progress', { message });
    }
}

module.exports = {
    initialize,
    executeCommand,
    isConnected: () => isConnected,
    getGamePath
};

