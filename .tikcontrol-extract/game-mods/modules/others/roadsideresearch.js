/**
 * Roadside Research - TikControl Integration Module
 * Puerto TCP: 9993
 * Usa MelonLoader (IL2CPP)
 */

const { ipcMain, dialog } = require('electron');
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
let requestId = 0;
let pendingRequests = new Map();

const PORT = 9993;
const GAME_ID = 'roadsideresearch';
const GAME_NAME = 'Roadside Research';
const MOD_DOWNLOAD_URL = 'https://storage.tikcontrol.live/games/roadside-research/mod.zip?v=5';
const MELONLOADER_VERSION = '0.7.3';
const MELONLOADER_DOWNLOAD_URL = `https://github.com/LavaGang/MelonLoader/releases/download/v${MELONLOADER_VERSION}/MelonLoader.x64.zip`;
const TARGET_MOD_VERSION = '1.2.2';
const MOD_VERSION_FILENAME = 'TikControl_RoadsideResearch.version';

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
        console.warn('[roadsideresearch] No se pudo leer version del DLL:', e.message);
        return null;
    }
}

function getInstalledModVersion(gameDir, modFile) {
    try {
        const versionFile = path.join(gameDir, 'Mods', MOD_VERSION_FILENAME);
        if (fs.existsSync(versionFile)) {
            const raw = fs.readFileSync(versionFile, 'utf8').trim();
            const parsed = normalizeVersion(raw);
            if (parsed) return parsed;
        }
    } catch (_) {}
    return getDllVersion(modFile);
}

function writeInstalledModVersion(gameDir) {
    const modsDir = path.join(gameDir, 'Mods');
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
    fs.writeFileSync(path.join(modsDir, MOD_VERSION_FILENAME), TARGET_MOD_VERSION, 'utf8');
}

function initialize(window) {
    mainWindow = window;
    registerIpcHandlers();
    startTcpServer();
    console.log('[roadsideresearch] Modulo inicializado');
}

function getGamePath() {
    try {
        const configPath = path.join(require('electron').app.getPath('userData'), 'electron-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config.roadsideresearch_game_path || null;
        }
    } catch (err) {
        console.error('[roadsideresearch] Error obteniendo ruta:', err);
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
        config.roadsideresearch_game_path = gamePath;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('[roadsideresearch] Ruta guardada:', gamePath);
    } catch (err) {
        console.error('[roadsideresearch] Error guardando ruta:', err);
    }
}

function moveDependencyToUserLibs(gameDir, fileName) {
    const modsPath = path.join(gameDir, 'Mods', fileName);
    if (!fs.existsSync(modsPath)) return false;

    const userLibsDir = path.join(gameDir, 'UserLibs');
    const userLibsPath = path.join(userLibsDir, fileName);
    if (!fs.existsSync(userLibsDir)) fs.mkdirSync(userLibsDir, { recursive: true });
    if (fs.existsSync(userLibsPath)) fs.unlinkSync(userLibsPath);
    fs.renameSync(modsPath, userLibsPath);
    return true;
}

function removeIfExists(targetPath) {
    try {
        if (!fs.existsSync(targetPath)) return;
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(targetPath);
        }
    } catch (error) {
        console.warn('[roadsideresearch] No se pudo limpiar:', targetPath, error.message);
    }
}

function downloadFileWithRedirects(url, targetPath, options = {}) {
    const { expectedEntries = [], minBytes = 0 } = options;
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(path.dirname(targetPath))) {
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        }

        const followRedirects = (nextUrl, redirectCount = 0) => {
            if (redirectCount > 10) {
                reject(new Error('Demasiadas redirecciones'));
                return;
            }

            const request = https.get(nextUrl, { headers: { 'User-Agent': 'TikControl/1.0' } }, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    const redirectUrl = new URL(response.headers.location, nextUrl).toString();
                    response.resume();
                    removeIfExists(targetPath);
                    followRedirects(redirectUrl, redirectCount + 1);
                    return;
                }

                if (response.statusCode !== 200) {
                    response.resume();
                    removeIfExists(targetPath);
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                const file = fs.createWriteStream(targetPath);
                response.pipe(file);
                file.on('finish', () => {
                    file.close(() => {
                        try {
                            const size = fs.statSync(targetPath).size;
                            if (minBytes && size < minBytes) {
                                reject(new Error(`Descarga incompleta (${size} bytes)`));
                                return;
                            }

                            if (expectedEntries.length) {
                                const AdmZip = require('adm-zip');
                                const zip = new AdmZip(targetPath);
                                const entries = zip.getEntries().map(entry => entry.entryName.replace(/\\/g, '/'));
                                const missing = expectedEntries.filter(expected =>
                                    expected.endsWith('/')
                                        ? !entries.some(entry => entry.startsWith(expected))
                                        : !entries.includes(expected)
                                );
                                if (missing.length) {
                                    reject(new Error(`ZIP invalido: faltan ${missing.join(', ')}`));
                                    return;
                                }
                            }

                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });
                });
            });

            request.on('error', (error) => {
                removeIfExists(targetPath);
                reject(error);
            });
        };

        followRedirects(url);
    });
}

function cleanupIl2CppGeneratedCache(gameDir) {
    const generatedPaths = [
        path.join(gameDir, 'MelonLoader', 'Il2CppAssemblies'),
        path.join(gameDir, 'MelonLoader', 'Dependencies', 'Il2CppAssemblyGenerator', 'Cpp2IL'),
        path.join(gameDir, 'MelonLoader', 'Dependencies', 'Il2CppAssemblyGenerator', 'UnityDependencies')
    ];

    for (const generatedPath of generatedPaths) {
        removeIfExists(generatedPath);
    }
}

async function updateMelonLoader(gameDir, tempDir) {
    const zipPath = path.join(tempDir, 'melonloader_latest_x64.zip');
    sendProgress(`Actualizando MelonLoader ${MELONLOADER_VERSION}...`);
    console.log('[roadsideresearch] Descargando MelonLoader desde:', MELONLOADER_DOWNLOAD_URL);

    await downloadFileWithRedirects(MELONLOADER_DOWNLOAD_URL, zipPath, {
        expectedEntries: ['version.dll', 'MelonLoader/net6/MelonLoader.dll'],
        minBytes: 5 * 1024 * 1024
    });

    cleanupIl2CppGeneratedCache(gameDir);
    removeIfExists(path.join(gameDir, 'MelonLoader'));
    removeIfExists(path.join(gameDir, 'version.dll'));
    removeIfExists(path.join(gameDir, 'dobby.dll'));

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(gameDir, true);
    console.log('[roadsideresearch] MelonLoader actualizado a', MELONLOADER_VERSION);

    return {
        version: MELONLOADER_VERSION,
        zipSize: fs.statSync(zipPath).size
    };
}

function startTcpServer() {
    if (tcpServer) {
        console.log('[roadsideresearch] Servidor TCP ya iniciado');
        return;
    }

    tcpServer = net.createServer((socket) => {
        console.log('[roadsideresearch] Juego conectado!');
        gameClient = socket;
        isConnected = true;

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('roadsideresearch:connected');
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
                        console.error('[roadsideresearch] Error parseando respuesta:', e);
                    }
                }
            }
        });

        socket.on('close', () => {
            console.log('[roadsideresearch] Juego desconectado');
            gameClient = null;
            isConnected = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('roadsideresearch:disconnected');
            }
        });

        socket.on('error', (err) => {
            console.error('[roadsideresearch] Error de socket:', err.message);
        });
    });

    tcpServer.listen(PORT, '127.0.0.1', () => {
        console.log('[roadsideresearch] Servidor TCP en puerto', PORT);
    });

    tcpServer.on('error', (err) => {
        console.error('[roadsideresearch] Error del servidor TCP:', err.message);
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
    console.log('[roadsideresearch] Respuesta:', response);

    if (response.requestId && pendingRequests.has(response.requestId)) {
        const { resolve } = pendingRequests.get(response.requestId);
        pendingRequests.delete(response.requestId);
        resolve(response);
    }
}

async function executeCommand(command, parameters = {}) {
    return new Promise((resolve, reject) => {
        if (!isConnected || !gameClient) {
            reject(new Error('Juego no conectado. Asegurate de que Roadside Research este ejecutandose con el mod de TikControl.'));
            return;
        }

        const currentRequestId = ++requestId;
        const message = JSON.stringify({
            type: 'command',
            requestId: currentRequestId,
            command: command,
            parameters: parameters
        }) + '\n';

        console.log('[roadsideresearch] Enviando comando:', command, parameters);

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
    ipcMain.handle('roadsideresearch:executeEffect', async (event, command, parameters = {}) => {
        try {
            return await executeCommand(command, parameters);
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('roadsideresearch:isConnected', () => {
        return isConnected;
    });

    ipcMain.handle('roadsideresearch:getStatus', () => {
        return {
            connected: isConnected,
            gamePath: getGamePath()
        };
    });

    ipcMain.handle('roadsideresearch:getGamePath', () => getGamePath());

    ipcMain.handle('roadsideresearch:setGamePath', async (event, a, b) => {
        const { path: resolved } = resolveSetGamePathArgs(a, b);
        if (resolved && fs.existsSync(resolved)) {
            saveGamePath(resolved);
            return { success: true, path: resolved };
        }
        return { success: false, error: 'Ruta no valida' };
    });

    ipcMain.handle('roadsideresearch:selectGamePath', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar ejecutable de Roadside Research',
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

    ipcMain.handle('roadsideresearch:findGame', async () => {
        const foundDir = findGamePath('Roadside Research', 'Roadside Research.exe');
        if (foundDir) {
            saveGamePath(foundDir);
            return { success: true, path: foundDir };
        }

        return { success: false, error: 'Juego no encontrado. Selecciona la ruta manualmente.' };
    });

    ipcMain.handle('roadsideresearch:checkModStatus', async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };

            const gameDir = resolveDir(gamePath);
            const modFile = path.join(gameDir, 'Mods', 'TikControl_RoadsideResearch.dll');
            const melonLoaderDir = path.join(gameDir, 'MelonLoader');
            const loaderDll = path.join(gameDir, 'version.dll');
            const newtonsoftFile = path.join(gameDir, 'UserLibs', 'Newtonsoft.Json.dll');
            const imageSharpFile = path.join(gameDir, 'UserLibs', 'SixLabors.ImageSharp.dll');
            const melonLoaderInstalled = fs.existsSync(melonLoaderDir) && fs.existsSync(loaderDll);
            const modInstalled = fs.existsSync(modFile) && melonLoaderInstalled;
            const installedVersion = getInstalledModVersion(gameDir, modFile);
            const needsUpdate = modInstalled && compareVersions(installedVersion, TARGET_MOD_VERSION) < 0;

            return {
                installed: modInstalled,
                melonLoaderInstalled,
                modPath: modFile,
                loaderDll: fs.existsSync(loaderDll),
                dependenciesInstalled: fs.existsSync(newtonsoftFile) && fs.existsSync(imageSharpFile),
                installedVersion,
                targetVersion: TARGET_MOD_VERSION,
                needsUpdate,
                reason: !melonLoaderInstalled ? 'MelonLoader no instalado' :
                    !modInstalled ? 'Mod TikControl no instalado' :
                        needsUpdate ? `Actualizacion disponible (${installedVersion || 'desconocida'} -> ${TARGET_MOD_VERSION})` : 'OK'
            };
        } catch (error) {
            return { installed: false, error: error.message };
        }
    });

    ipcMain.handle('roadsideresearch:launchGame', async () => {
        try {
            const { shell } = require('electron');
            try {
                await shell.openExternal('steam://rungameid/3643170');
                return { success: true, method: 'steam' };
            } catch (_) {}

            const gamePath = getGamePath();
            if (gamePath && fs.existsSync(gamePath)) {
                const exePath = path.join(gamePath, 'Roadside Research.exe');
                if (fs.existsSync(exePath)) {
                    await shell.openPath(exePath);
                    return { success: true, method: 'direct' };
                }
            }

            return { success: false, error: 'No se pudo lanzar el juego. Ábrelo desde Steam.' };
        } catch (error) {
            throw error;
        }
    });

    ipcMain.handle('roadsideresearch:installMod', async () => {
        try {
            const gamePath = getGamePath();
            if (!gamePath) {
                throw new Error('Primero debes configurar la ruta del juego');
            }

            const gameDir = resolveDir(gamePath);
            const tempDir = path.join(require('electron').app.getPath('temp'), 'tikcontrol_roadsideresearch_mod');
            const zipPath = path.join(tempDir, 'roadsideresearch_mod.zip');

            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            sendProgress('Descargando MelonLoader + Mod TikControl...');
            console.log('[roadsideresearch] Descargando mod desde:', MOD_DOWNLOAD_URL);

            await downloadFileWithRedirects(MOD_DOWNLOAD_URL, zipPath, {
                expectedEntries: ['version.dll', 'MelonLoader/net6/MelonLoader.dll', 'Mods/TikControl_RoadsideResearch.dll'],
                minBytes: 1024 * 1024
            });

            console.log('[roadsideresearch] Descarga completada');
            sendProgress('Extrayendo MelonLoader + Mod...');

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(gameDir, true);
            console.log('[roadsideresearch] Extraido a:', gameDir);

            let melonLoaderUpdate = null;
            let melonLoaderUpdateWarning = null;
            if (process.env.TIKCONTROL_SKIP_MELONLOADER_UPDATE !== '1') {
                try {
                    melonLoaderUpdate = await updateMelonLoader(gameDir, tempDir);
                } catch (error) {
                    melonLoaderUpdateWarning = error.message || String(error);
                    console.warn('[roadsideresearch] No se pudo actualizar MelonLoader:', melonLoaderUpdateWarning);
                }
            }

            const movedNewtonsoft = moveDependencyToUserLibs(gameDir, 'Newtonsoft.Json.dll');
            if (movedNewtonsoft) {
                console.log('[roadsideresearch] Newtonsoft.Json movido a UserLibs');
            }

            const modFile = path.join(gameDir, 'Mods', 'TikControl_RoadsideResearch.dll');
            const melonLoaderDir = path.join(gameDir, 'MelonLoader');
            const loaderDll = path.join(gameDir, 'version.dll');
            const newtonsoftFile = path.join(gameDir, 'UserLibs', 'Newtonsoft.Json.dll');
            const imageSharpFile = path.join(gameDir, 'UserLibs', 'SixLabors.ImageSharp.dll');
            const modInstalled = fs.existsSync(modFile);
            const melonInstalled = fs.existsSync(melonLoaderDir) && fs.existsSync(loaderDll);
            const dependenciesInstalled = fs.existsSync(newtonsoftFile) && fs.existsSync(imageSharpFile);
            if (modInstalled) writeInstalledModVersion(gameDir);
            const installedVersion = getInstalledModVersion(gameDir, modFile);

            try {
                fs.unlinkSync(zipPath);
                fs.rmSync(tempDir, { recursive: true });
            } catch (e) {
                console.log('[roadsideresearch] No se pudo limpiar temporales:', e.message);
            }

            sendProgress(modInstalled ? 'Mod instalado correctamente!' : 'Verificando instalacion...');

            const message = modInstalled && melonInstalled
                ? melonLoaderUpdate
                    ? `MelonLoader ${melonLoaderUpdate.version} + Mod de TikControl instalado correctamente! Inicia el juego para conectar.`
                    : melonLoaderUpdateWarning
                        ? `Mod instalado, pero no se pudo actualizar MelonLoader automaticamente: ${melonLoaderUpdateWarning}. Si el juego se cierra al cargar, reinstala el mod cuando GitHub este disponible.`
                        : 'MelonLoader incluido + Mod de TikControl instalado correctamente! Inicia el juego para conectar.'
                : 'Archivos extraidos. Verifica la instalacion.';

            return {
                success: true,
                message,
                modInstalled,
                melonInstalled,
                dependenciesInstalled,
                installedVersion,
                targetVersion: TARGET_MOD_VERSION,
                needsUpdate: false,
                melonLoaderVersion: melonLoaderUpdate?.version || null,
                melonLoaderUpdateWarning
            };
        } catch (error) {
            console.error('[roadsideresearch] Error instalando mod:', error);
            throw error;
        }
    });

    ipcMain.handle('roadsideresearch:uninstallMod', async () => {
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
            ];

            let deletedCount = 0;
            for (const item of itemsToDelete) {
                try {
                    if (fs.existsSync(item)) {
                        const stat = fs.statSync(item);
                        if (stat.isDirectory()) {
                            fs.rmSync(item, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(item);
                        }
                        deletedCount++;
                        console.log('[roadsideresearch] Eliminado:', item);
                    }
                } catch (e) {
                    console.error('[roadsideresearch] Error eliminando', item, ':', e.message);
                }
            }

            return {
                success: true,
                message: deletedCount > 0
                    ? `Mod desinstalado correctamente. Se eliminaron ${deletedCount} elementos.`
                    : 'No se encontraron archivos del mod para eliminar.'
            };
        } catch (error) {
            console.error('[roadsideresearch] Error desinstalando mod:', error);
            throw error;
        }
    });
}

function sendProgress(message) {
    console.log('[roadsideresearch]', message);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('roadsideresearch:install-progress', { message });
    }
}

module.exports = {
    initialize,
    executeCommand,
    isConnected: () => isConnected,
    getGamePath
};
