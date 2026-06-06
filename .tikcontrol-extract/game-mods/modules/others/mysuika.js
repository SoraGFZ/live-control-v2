/**
 * Módulo My Suika para TikControl
 * Comunicación TCP con el mod MelonLoader
 */

const net = require('net');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { ipcMain, dialog, shell, app } = require('electron');
const { findGamePath, isValidGamePath } = require('../steamDetect');
const { resolveSetGamePathArgs } = require('../setGamePathArgs');

const PORT = 9992; // 9993 usado por Roadside Research
const STEAM_APP_ID = '2671970';
const GAME_EXE = 'MySuika.exe';
const GAME_FOLDER = 'MySuika';
const log = (msg, ...args) => console.log(`[mysuika] ${msg}`, ...args);
const logError = (msg, ...args) => console.error(`[mysuika] ${msg}`, ...args);
const CONFIG_KEY = 'mysuika_game_path';
const COMMAND_TIMEOUT_MS = 5000;
const CONNECTION_WAIT_MS = 8000;

let mainWindow = null;
let tcpServer = null;
let gameSocket = null;
let isConnected = false;
let pendingRequests = new Map();
let requestId = 0;
let gamePath = '';

function hasActiveGameConnection() {
    return !!(gameSocket && isConnected && !gameSocket.destroyed && gameSocket.writable);
}

function waitForConnection(timeoutMs = CONNECTION_WAIT_MS) {
    if (hasActiveGameConnection()) return Promise.resolve(true);

    return new Promise((resolve) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            if (hasActiveGameConnection()) {
                clearInterval(timer);
                resolve(true);
                return;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                clearInterval(timer);
                resolve(false);
            }
        }, 100);
    });
}

function rejectPendingRequests(error) {
    for (const pending of pendingRequests.values()) {
        if (pending.timeout) clearTimeout(pending.timeout);
        pending.reject(error);
    }
    pendingRequests.clear();
}

function sendProgress(message) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mysuika:install-progress', { message });
    }
}

function initialize(window) {
    mainWindow = window;
    loadSavedGamePath();
    if (!gamePath || !isValidGamePath(gamePath, GAME_EXE)) {
        if (gamePath) log(`Ruta guardada inválida: ${gamePath}`);
        const detected = autoDetectGamePath();
        if (detected) {
            saveGamePath(detected);
            log(`Ruta auto-detectada: ${detected}`);
        } else if (gamePath) {
            gamePath = '';
        }
    }
    startTcpServer();
    registerIpcHandlers();
    log('Módulo My Suika inicializado');
}

function loadSavedGamePath() {
    try {
        const configPath = path.join(require('electron').app.getPath('userData'), 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config[CONFIG_KEY]) {
                let saved = config[CONFIG_KEY];
                if (saved && saved.toLowerCase().endsWith('.exe')) {
                    saved = path.dirname(saved);
                    config[CONFIG_KEY] = saved;
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                    log(`Ruta normalizada (era exe): ${saved}`);
                }
                gamePath = saved;
                log(`Ruta cargada: ${gamePath}`);
            }
        }
    } catch (e) {
        logError('Error cargando ruta:', e);
    }
}

function saveGamePath(newPath) {
    try {
        const configPath = path.join(require('electron').app.getPath('userData'), 'config.json');
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        config[CONFIG_KEY] = newPath;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        gamePath = newPath;
        log(`Ruta guardada: ${newPath}`);
    } catch (e) {
        logError('Error guardando ruta:', e);
    }
}

function startTcpServer(retryCount = 0) {
    if (tcpServer) {
        try { tcpServer.close(); } catch (_) {}
        tcpServer = null;
    }

    tcpServer = net.createServer((socket) => {
        log('🎮 Juego conectado!');
        if (gameSocket && gameSocket !== socket) {
            try { gameSocket.destroy(); } catch (_) {}
        }
        gameSocket = socket;
        isConnected = true;
        socket.setNoDelay(true);

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('mysuika:connected', true);
        }

        let buffer = '';
        socket.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();
            lines.forEach(line => {
                if (line.trim()) handleGameResponse(line);
            });
        });

        socket.on('close', () => {
            log('🔌 Juego desconectado');
            if (gameSocket === socket) {
                gameSocket = null;
                isConnected = false;
                rejectPendingRequests(new Error('Juego desconectado'));
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('mysuika:connected', false);
                }
            }
        });

        socket.on('error', (err) => {
            logError('Error socket:', err.message);
            if (gameSocket === socket) {
                rejectPendingRequests(new Error(err.message || 'Error de conexión con My Suika'));
            }
        });
    });

    tcpServer.listen(PORT, () => {
        const addr = tcpServer.address();
        log(`Servidor TCP escuchando en ${addr.address}:${addr.port}`);
    });

    tcpServer.on('error', (err) => {
        logError('Error servidor TCP:', err.message);
        if (err.code === 'EADDRINUSE' && retryCount < 3) {
            log(`Puerto ${PORT} en uso, reintentando en 3s... (intento ${retryCount + 1}/3)`);
            tcpServer = null;
            setTimeout(() => startTcpServer(retryCount + 1), 3000);
        }
    });
}

function stopTcpServer() {
    if (gameSocket) {
        try { gameSocket.destroy(); } catch (_) {}
        gameSocket = null;
    }
    if (tcpServer) {
        try { tcpServer.close(); } catch (_) {}
        tcpServer = null;
    }
    isConnected = false;
    rejectPendingRequests(new Error('Servidor My Suika detenido'));
}

function handleGameResponse(data) {
    try {
        const lines = data.split('\n').filter(l => l.trim());
        for (const line of lines) {
            const response = JSON.parse(line);
            log('Respuesta:', response);

            const responseRequestId = response.requestId;
            if (responseRequestId !== undefined && pendingRequests.has(responseRequestId)) {
                const pending = pendingRequests.get(responseRequestId);
                pendingRequests.delete(responseRequestId);
                if (pending.timeout) clearTimeout(pending.timeout);
                pending.resolve({
                    ...response,
                    success: response.success !== false,
                    message: response.message || ''
                });
            }
        }
    } catch (e) {
        logError('Error parseando respuesta:', e);
    }
}

async function executeCommand(command, parameters = {}) {
    if (!hasActiveGameConnection()) {
        const connected = await waitForConnection();
        if (!connected) {
            throw new Error('No conectado. Abre My Suika con el mod instalado y espera a que aparezca "Juego conectado".');
        }
    }

    return new Promise((resolve, reject) => {
        const socket = gameSocket;
        if (!socket || socket.destroyed || !socket.writable) {
            reject(new Error('Juego desconectado'));
            return;
        }

        const id = ++requestId;
        const message = JSON.stringify({
            type: 'command',
            requestId: id,
            command: command,
            parameters: parameters
        }) + '\n';

        log(`Enviando comando: ${command}`, parameters);

        const timeout = setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error('Timeout esperando respuesta del mod'));
            }
        }, COMMAND_TIMEOUT_MS);

        pendingRequests.set(id, { resolve, reject, timeout });

        try {
            socket.write(message, (err) => {
                if (!err) return;
                if (pendingRequests.has(id)) {
                    pendingRequests.delete(id);
                    clearTimeout(timeout);
                }
                reject(err);
            });
        } catch (err) {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                clearTimeout(timeout);
            }
            reject(err);
        }
    });
}

function autoDetectGamePath() {
    log('Buscando juego automáticamente...');
    const found = findGamePath(GAME_FOLDER, GAME_EXE);
    if (found) log(`Encontrado: ${found}`);
    return found;
}

function isGameRunning() {
    try {
        const { execFileSync } = require('child_process');
        const output = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${GAME_EXE}`, '/NH'], {
            encoding: 'utf8',
            windowsHide: true
        });
        return output.toLowerCase().includes(GAME_EXE.toLowerCase());
    } catch (_) {
        return false;
    }
}

function getModInstallState() {
    return {
        melonLoader: fs.existsSync(path.join(gamePath, 'MelonLoader')),
        versionDll: fs.existsSync(path.join(gamePath, 'version.dll')),
        mod: fs.existsSync(path.join(gamePath, 'Mods', 'TikControl.dll'))
    };
}

function findZipEntry(zip, entryPath) {
    const normalizedPath = entryPath.replace(/\\/g, '/').toLowerCase();
    return zip.getEntries().find(entry => entry.entryName.replace(/\\/g, '/').toLowerCase() === normalizedPath);
}

function extractModPackage(zip, destinationPath) {
    const beforeInstall = getModInstallState();
    const hasBaseLoader = beforeInstall.melonLoader && beforeInstall.versionDll;

    if (!hasBaseLoader) {
        sendProgress('📦 Instalando MelonLoader + mod...');
        zip.extractAllTo(destinationPath, true);
        return;
    }

    sendProgress('📦 MelonLoader ya existe, actualizando solo el plugin...');
    const modEntry = findZipEntry(zip, 'Mods/TikControl.dll');
    if (!modEntry) {
        throw new Error('El paquete del mod no contiene Mods/TikControl.dll');
    }

    fs.mkdirSync(path.join(destinationPath, 'Mods'), { recursive: true });
    zip.extractEntryTo(modEntry, destinationPath, true, true);
}

function getFriendlyInstallError(error) {
    const filePath = String(error?.path || '');
    const message = String(error?.message || '');
    const lockedInstallFile = filePath.includes('MelonLoader') || filePath.includes('TikControl.dll');

    if (isGameRunning() || lockedInstallFile || ['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) {
        return 'Cierra My Suika completamente antes de instalar o actualizar el mod. Windows tiene archivos del mod bloqueados y no permite sobrescribirlos.';
    }

    return message || 'Error instalando el mod';
}

function registerIpcHandlers() {
    ipcMain.handle('mysuika:executeEffect', async (event, command, parameters) => {
        try {
            const result = await executeCommand(command, parameters);
            return result;
        } catch (e) {
            logError('Error ejecutando comando:', e);
            return { success: false, message: e.message };
        }
    });

    ipcMain.handle('mysuika:isConnected', () => isConnected);

    ipcMain.handle('mysuika:setGamePath', (event, a, b) => {
        const { path: resolved } = resolveSetGamePathArgs(a, b);
        let normalized = resolved;
        if (normalized && normalized.toLowerCase().endsWith('.exe')) {
            normalized = path.dirname(normalized);
        }
        if (!normalized || !fs.existsSync(normalized)) {
            return { success: false, error: 'Ruta no válida' };
        }
        saveGamePath(normalized);
        return { success: true, path: normalized };
    });

    ipcMain.handle('mysuika:selectGamePath', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar carpeta de My Suika',
            properties: ['openDirectory']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const selectedPath = result.filePaths[0];
            const exePath = path.join(selectedPath, 'MySuika.exe');
            
            if (fs.existsSync(exePath)) {
                saveGamePath(selectedPath);
                return { success: true, path: selectedPath };
            } else {
                return { success: false, message: 'MySuika.exe no encontrado' };
            }
        }
        return { success: false, message: 'Cancelado' };
    });

    ipcMain.handle('mysuika:findGame', async () => {
        if (gamePath && fs.existsSync(path.join(gamePath, GAME_EXE))) {
            return { success: true, path: gamePath };
        }

        const found = autoDetectGamePath();
        if (found) {
            saveGamePath(found);
            return { success: true, path: found };
        }

        return { success: false, message: 'Juego no encontrado' };
    });

    ipcMain.handle('mysuika:installMod', async () => {
        try {
            if (!gamePath) {
                return { success: false, message: 'Configura la ruta primero' };
            }

            if (isGameRunning()) {
                const message = 'Cierra My Suika completamente antes de instalar o actualizar el mod.';
                sendProgress('❌ Error: ' + message);
                return { success: false, message };
            }

            const modUrl = 'https://storage.tikcontrol.live/games/my-suika/mod.zip?v=3';
            const tempDir = path.join(app.getPath('temp'), 'tikcontrol_mysuika_mod');
            const zipPath = path.join(tempDir, 'mysuika_mod.zip');

            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            sendProgress('📥 Descargando mod de TikControl para My Suika...');
            log('📥 Descargando mod desde: ' + modUrl);

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
                            log('↪️ Redirigiendo a: ' + response.headers.location);
                            downloadWithRedirects(response.headers.location, redirectCount + 1);
                            return;
                        }

                        if (response.statusCode !== 200) {
                            reject(new Error('Error descargando: ' + response.statusCode));
                            return;
                        }

                        const totalBytes = parseInt(response.headers['content-length'] || '0');
                        let downloadedBytes = 0;

                        response.on('data', (chunk) => {
                            downloadedBytes += chunk.length;
                            if (totalBytes > 0) {
                                const percent = Math.round((downloadedBytes / totalBytes) * 100);
                                sendProgress(`📥 Descargando... ${percent}%`);
                            }
                        });

                        response.pipe(file);
                        file.on('finish', () => {
                            file.close();
                            resolve();
                        });
                    }).on('error', (err) => {
                        fs.unlink(zipPath, () => {});
                        reject(err);
                    });
                };

                downloadWithRedirects(modUrl);
            });

            log('✅ Descarga completada');
            sendProgress('📦 Extrayendo MelonLoader + mod...');

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(zipPath);
            extractModPackage(zip, gamePath);

            log('✅ Mod extraído a: ' + gamePath);

            const installState = getModInstallState();
            const melonLoaderExists = installState.melonLoader;
            const versionDllExists = installState.versionDll;
            const modExists = installState.mod;

            // Añadir regla de firewall automáticamente para evitar bloqueos
            try {
                const { execSync } = require('child_process');
                execSync(`netsh advfirewall firewall delete rule name="TikControl MySuika TCP"`, { stdio: 'ignore' });
                execSync(`netsh advfirewall firewall add rule name="TikControl MySuika TCP" dir=in action=allow protocol=TCP localport=${PORT} profile=any`, { stdio: 'ignore' });
                log('🔥 Regla de firewall añadida para puerto ' + PORT);
            } catch (_) {
                log('⚠️ No se pudo añadir regla de firewall (requiere admin), conexión localhost debería funcionar igualmente');
            }

            try {
                fs.unlinkSync(zipPath);
                fs.rmSync(tempDir, { recursive: true });
            } catch (e) {
                log('⚠️ No se pudo limpiar temporales: ' + e.message);
            }

            const allGood = melonLoaderExists && versionDllExists && modExists;
            sendProgress(allGood ? '✅ MelonLoader + Mod instalados correctamente!' : '⚠️ Instalación parcial, verifica los archivos.');

            return {
                success: allGood,
                message: allGood
                    ? '¡MelonLoader y mod de TikControl instalados! Inicia My Suika para conectar.'
                    : `Instalación parcial - MelonLoader: ${melonLoaderExists ? '✅' : '❌'}, version.dll: ${versionDllExists ? '✅' : '❌'}, Mod: ${modExists ? '✅' : '❌'}`,
                melonLoader: melonLoaderExists,
                versionDll: versionDllExists,
                mod: modExists
            };
        } catch (e) {
            logError('Error instalando mod:', e);
            const friendlyMessage = getFriendlyInstallError(e);
            sendProgress('❌ Error: ' + friendlyMessage);
            return { success: false, message: friendlyMessage, details: e.message };
        }
    });

    ipcMain.handle('mysuika:uninstallMod', async () => {
        try {
            if (!gamePath) {
                return { success: false, message: 'Configura la ruta primero' };
            }

            const itemsToDelete = [
                path.join(gamePath, 'Mods', 'TikControl.dll'),
                path.join(gamePath, 'MelonLoader'),
                path.join(gamePath, 'version.dll'),
                path.join(gamePath, 'UserData'),
            ];

            for (const item of itemsToDelete) {
                try {
                    if (fs.existsSync(item)) {
                        const stat = fs.statSync(item);
                        if (stat.isDirectory()) {
                            fs.rmSync(item, { recursive: true });
                        } else {
                            fs.unlinkSync(item);
                        }
                        log('🗑️ Eliminado: ' + item);
                    }
                } catch (e) {
                    logError('⚠️ No se pudo eliminar ' + item + ':', e);
                }
            }

            return { success: true, message: 'MelonLoader y mod desinstalados correctamente' };
        } catch (e) {
            return { success: false, message: e.message };
        }
    });

    ipcMain.handle('mysuika:checkModStatus', async () => {
        try {
            if (!gamePath) {
                return { installed: false, message: 'Ruta no configurada' };
            }

            const melonLoaderExists = fs.existsSync(path.join(gamePath, 'MelonLoader'));
            const versionDllExists = fs.existsSync(path.join(gamePath, 'version.dll'));
            const modExists = fs.existsSync(path.join(gamePath, 'Mods', 'TikControl.dll'));

            return {
                installed: melonLoaderExists && versionDllExists && modExists,
                melonLoader: melonLoaderExists,
                versionDll: versionDllExists,
                mod: modExists
            };
        } catch (e) {
            return { installed: false, message: e.message };
        }
    });

    ipcMain.handle('mysuika:launchGame', async () => {
        try {
            if (!gamePath) {
                return { success: false, message: 'Configura la ruta primero' };
            }

            const exePath = path.join(gamePath, GAME_EXE);
            if (!fs.existsSync(exePath)) {
                return { success: false, message: 'Ejecutable no encontrado en: ' + gamePath };
            }

            const { spawn } = require('child_process');
            const child = spawn(`"${exePath}"`, [], {
                detached: true,
                stdio: 'ignore',
                cwd: gamePath,
                shell: true,
                windowsHide: false
            });
            child.unref();

            log('Juego lanzado: ' + exePath);
            return { success: true, message: 'Juego iniciado' };
        } catch (e) {
            try {
                await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
                return { success: true, message: 'Lanzado via Steam' };
            } catch (steamErr) {
                logError('Error lanzando juego:', e);
                return { success: false, message: e.message };
            }
        }
    });

    ipcMain.handle('mysuika:getGamePath', () => gamePath);

    ipcMain.handle('mysuika:getFullStatus', () => {
        const hasPath = !!gamePath;
        const exeExists = hasPath && fs.existsSync(path.join(gamePath, GAME_EXE));
        const melonLoaderInstalled = hasPath && fs.existsSync(path.join(gamePath, 'MelonLoader'));
        const versionDllInstalled = hasPath && fs.existsSync(path.join(gamePath, 'version.dll'));
        const modInstalled = hasPath && fs.existsSync(path.join(gamePath, 'Mods', 'TikControl.dll'));
        return {
            gamePath: gamePath || null,
            gameFound: exeExists,
            modInstalled: melonLoaderInstalled && versionDllInstalled && modInstalled,
            melonLoader: melonLoaderInstalled,
            versionDll: versionDllInstalled,
            tikcontrolDll: modInstalled,
            connected: isConnected
        };
    });
}

module.exports = {
    initialize,
    executeCommand,
    isConnected: () => isConnected,
    cleanup: stopTcpServer,
    stop: stopTcpServer,
};

