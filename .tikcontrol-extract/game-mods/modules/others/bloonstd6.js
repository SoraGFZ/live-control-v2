/**
 * Bloons TD6 - TikControl Integration Module
 * Puerto TCP: 9995
 * Usa MelonLoader
 */

const { ipcMain, dialog, app } = require('electron');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { findGamePath, resolveDir } = require('../steamDetect');
const { resolveSetGamePathArgs } = require('../setGamePathArgs');
const { downloadModZip } = require('../downloadModZip');

let mainWindow = null;
let tcpServer = null;
let gameClient = null;
let isConnected = false;
let requestId = 0;
let pendingRequests = new Map();

const PORT = 9995;
const GAME_ID = 'bloonstd6';
const GAME_NAME = 'Bloons TD6';

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    startTcpServer();
    loadSavedGamePath();
    console.log('[bloonstd6] Modulo inicializado');
}

function loadSavedGamePath() {
    try {
        const configPath = path.join(app.getPath('userData'), 'electron-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.bloonstd6_game_path) {
                console.log('[bloonstd6] Ruta cargada:', config.bloonstd6_game_path);
            }
        }
    } catch (err) {
        console.error('[bloonstd6] Error cargando ruta:', err);
    }
}

function saveGamePath(gamePath) {
    try {
        const configPath = path.join(app.getPath('userData'), 'electron-config.json');
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        config.bloonstd6_game_path = gamePath;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('[bloonstd6] Ruta guardada:', gamePath);
    } catch (err) {
        console.error('[bloonstd6] Error guardando ruta:', err);
    }
}

function getGamePath() {
    try {
        const configPath = path.join(app.getPath('userData'), 'electron-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return normalizeGameDir(config.bloonstd6_game_path);
        }
    } catch (err) {
        console.error('[bloonstd6] Error obteniendo ruta:', err);
    }
    return null;
}

function normalizeGameDir(candidatePath) {
    if (!candidatePath || typeof candidatePath !== 'string' || !fs.existsSync(candidatePath)) return null;
    const dir = resolveDir(candidatePath);
    return fs.existsSync(path.join(dir, 'BloonsTD6.exe')) ? dir : null;
}

function startTcpServer() {
    if (tcpServer) {
        console.log('[bloonstd6] Servidor TCP ya iniciado');
        return;
    }

    tcpServer = net.createServer((socket) => {
        console.log('[bloonstd6] ✅ Juego conectado!');
        gameClient = socket;
        isConnected = true;

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('bloonstd6:connected');
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
                        console.error('[bloonstd6] Error parseando respuesta:', e);
                    }
                }
            }
        });

        socket.on('close', () => {
            console.log('[bloonstd6] ❌ Juego desconectado');
            gameClient = null;
            isConnected = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('bloonstd6:disconnected');
            }
        });

        socket.on('error', (err) => {
            console.error('[bloonstd6] Error de socket:', err.message);
        });
    });

    tcpServer.listen(PORT, '127.0.0.1', () => {
        console.log(`[bloonstd6] 🎈 Servidor TCP en puerto ${PORT}`);
    });

    tcpServer.on('error', (err) => {
        console.error('[bloonstd6] Error del servidor TCP:', err.message);
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
    console.log('[bloonstd6] Respuesta:', response);

    if (response.requestId && pendingRequests.has(response.requestId)) {
        const { resolve } = pendingRequests.get(response.requestId);
        pendingRequests.delete(response.requestId);
        resolve(response);
    }
}

async function executeCommand(command, parameters = {}) {
    return new Promise((resolve, reject) => {
        if (!isConnected || !gameClient) {
            reject(new Error('Juego no conectado. Asegurate de que Bloons TD6 este ejecutandose con el mod de TikControl.'));
            return;
        }

        const currentRequestId = ++requestId;
        const message = JSON.stringify({
            type: 'command',
            requestId: currentRequestId,
            command: command,
            parameters: parameters
        }) + '\n';

        console.log('[bloonstd6] Enviando comando:', command, parameters);

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

function sendProgress(message) {
    console.log('[bloonstd6]', message);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bloonstd6:install-progress', { message });
    }
}

function registerIpcHandlers() {
    ipcMain.handle('bloonstd6:executeEffect', async (event, command, parameters = {}) => {
        try {
            const result = await executeCommand(command, parameters);
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('bloonstd6:isConnected', () => {
        return isConnected;
    });

    ipcMain.handle('bloonstd6:getStatus', () => {
        return {
            connected: isConnected,
            gamePath: getGamePath()
        };
    });

    ipcMain.handle('bloonstd6:getGamePath', () => getGamePath());

    ipcMain.handle('bloonstd6:setGamePath', async (event, a, b) => {
        const { path: resolved } = resolveSetGamePathArgs(a, b);
        const gameDir = normalizeGameDir(resolved);
        if (gameDir) {
            saveGamePath(gameDir);
            return { success: true, path: gameDir, gamePath: gameDir };
        }
        return { success: false, error: 'Ruta no valida. Selecciona la carpeta raiz donde esta BloonsTD6.exe.' };
    });

    ipcMain.handle('bloonstd6:selectGamePath', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar carpeta de Bloons TD6',
            properties: ['openDirectory']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const gameDir = normalizeGameDir(result.filePaths[0]);
            if (!gameDir) return { success: false, error: 'No se encontro BloonsTD6.exe en esa carpeta' };
            saveGamePath(gameDir);
            return { success: true, path: gameDir, gamePath: gameDir };
        }
        return { success: false, error: 'No se selecciono ningun archivo' };
    });

    ipcMain.handle('bloonstd6:installMod', async () => {
        try {
            let gamePath = getGamePath();
            if (!gamePath) {
                // Auto-detect game path via Steam before asking user to configure manually
                const foundDir = findGamePath('BloonsTD6', 'BloonsTD6.exe');
                if (foundDir) {
                    saveGamePath(foundDir);
                    gamePath = foundDir;
                    console.log('[bloonstd6] Ruta auto-detectada:', foundDir);
                } else {
                    throw new Error('No se encontró Bloons TD6. Por favor selecciona la ruta del juego manualmente.');
                }
            }

            const gameDir = resolveDir(gamePath);
            const modUrl = 'https://storage.tikcontrol.live/games/bloons-td6/mod.zip';
            const tempDir = path.join(app.getPath('temp'), 'tikcontrol_bloonstd6_mod');
            const zipPath = path.join(tempDir, 'bloonstd6_mod.zip');

            // Crear directorio temporal
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            sendProgress('📥 Descargando mod de TikControl para Bloons TD6...');
            console.log('[bloonstd6] 📥 Descargando mod desde:', modUrl);

            // Descargar el mod completo (incluye MelonLoader + plugin)
            await downloadModZip(modUrl, zipPath, {
                expectedEntries: ['version.dll', 'MelonLoader/', 'Mods/TikControl.dll'],
                minBytes: 1024 * 1024,
                onRetry: (attempt, error) => {
                    sendProgress(`Descarga incompleta, reintentando (${attempt + 1}/3)...`);
                    console.warn('[bloonstd6] Reintentando descarga:', error.message);
                }
            });
            console.log('[bloonstd6] ✅ Descarga completada');
            sendProgress('📦 Extrayendo mod...');

            // Extraer el mod completo (incluye MelonLoader + plugin)
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(gameDir, true);

            console.log('[bloonstd6] ✅ Mod extraído a:', gameDir);

            // Verificar que el mod se instaló correctamente
            const modFile = path.join(gameDir, 'Mods', 'TikControl.dll');
            const melonLoaderDir = path.join(gameDir, 'MelonLoader');
            const modInstalled = fs.existsSync(modFile);
            const melonInstalled = fs.existsSync(melonLoaderDir);

            // Limpiar archivos temporales
            try {
                fs.unlinkSync(zipPath);
                fs.rmSync(tempDir, { recursive: true });
            } catch (e) {
                console.log('[bloonstd6] ⚠️ No se pudo limpiar temporales:', e.message);
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
            console.error('[bloonstd6] ❌ Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('bloonstd6:uninstallMod', async () => {
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
                        console.log('[bloonstd6] ✅ Eliminado:', item);
                    }
                } catch (e) {
                    console.log('[bloonstd6] ⚠️ No se pudo eliminar:', item, e.message);
                }
            }

            return { success: true, message: `Mod desinstalado correctamente (${deleted} elementos eliminados)` };
        } catch (error) {
            console.error('[bloonstd6] Error desinstalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('bloonstd6:checkModStatus', async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };

            const gameDir = resolveDir(gamePath);
            const modsDir = path.join(gameDir, 'Mods');
            const modFile = path.join(modsDir, 'TikControl.dll');
            const melonLoaderDir = path.join(gameDir, 'MelonLoader');

            return {
                installed: fs.existsSync(modFile),
                melonLoaderInstalled: fs.existsSync(melonLoaderDir),
                modPath: modFile
            };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('bloonstd6:findGame', async () => {
        const foundDir = findGamePath('BloonsTD6', 'BloonsTD6.exe');
        if (foundDir) {
            saveGamePath(foundDir);
            return { success: true, path: foundDir };
        }

        return { success: false, error: 'Juego no encontrado. Por favor selecciona la ruta manualmente.' };
    });

    ipcMain.handle('bloonstd6:launchGame', async () => {
        try {
            const { shell } = require('electron');
            try {
                await shell.openExternal('steam://rungameid/960090');
                return { success: true, method: 'steam' };
            } catch (_) {}

            const gamePath = getGamePath();
            if (gamePath && fs.existsSync(gamePath)) {
                const exePath = path.join(gamePath, 'BloonsTD6.exe');
                if (fs.existsSync(exePath)) {
                    await shell.openPath(exePath);
                    return { success: true, method: 'direct' };
                }
            }

            return { success: false, error: 'No se pudo lanzar el juego. Ábrelo desde Steam.' };
        } catch (error) {
            console.error('[bloonstd6] Error lanzando juego:', error);
            throw error;
        }
    });
}

module.exports = {
    initialize,
    executeCommand,
    isConnected: () => isConnected,
    getGamePath
};

