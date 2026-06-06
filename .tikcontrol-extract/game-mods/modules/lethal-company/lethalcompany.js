/**
 * Módulo de Lethal Company
 * Gestiona la integración con el mod de efectos para Lethal Company
 * Requiere instalación de BepInEx y el mod de efectos
 */

const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const AdmZip = require('adm-zip');
const https = require('https');
const http = require('http');
const { resolveDir } = require('../steamDetect');
const { resolveSetGamePathArgs, getActiveProfileId } = require('../setGamePathArgs');

// ✅ Cargar efectos desde GamesCloud (AWS S3) - eliminada dependencia local
let LETHAL_COMPANY_EFFECTS = [];
let effectsLoaded = false;

// Función para cargar efectos desde GamesCloud
async function loadEffectsFromCloud() {
  if (effectsLoaded) return LETHAL_COMPANY_EFFECTS;

  try {
    const gamesCloud = require('../../../modules/auth/gamesCloudService');
    const commands = await gamesCloud.getGameCommands('lethal-company');

    if (commands?.effects) {
      LETHAL_COMPANY_EFFECTS = Object.entries(commands.effects).map(([id, effect]) => ({
        id,
        name: effect.name?.es || effect.name?.en || effect.name || id,
        description: effect.description || '',
        category: Array.isArray(effect.category) ? effect.category[0] : 'General',
        price: effect.price || 0,
        duration: effect.duration?.value || 0,
        quantity: effect.quantity || null,
        inactive: effect.inactive || false
      }));
      effectsLoaded = true;
      console.log('[Lethal Company] ✅ Efectos cargados desde AWS:', LETHAL_COMPANY_EFFECTS.length);
    }
  } catch (error) {
    console.warn('[Lethal Company] ⚠️ Error cargando desde AWS:', error.message);
  }

  return LETHAL_COMPANY_EFFECTS;
}

// URL del mod (incluye BepInEx + mod de TikControl)
const MOD_DOWNLOAD_URL = 'https://storage.tikcontrol.live/games/lethal-company/mod-1.0.1.zip';
const GAME_ID = 'lethalcompany';
const LETHAL_EXE = 'Lethal Company.exe';
const LETHAL_PLUGIN_REL = path.join('BepInEx', 'plugins', 'TikControlMod_LethalCompany.dll');

function isLethalModInstalled(gamePath) {
  if (!gamePath || !fs.existsSync(gamePath)) return false;
  const gameDir = fs.statSync(gamePath).isDirectory() ? gamePath : path.dirname(gamePath);
  return fs.existsSync(path.join(gameDir, LETHAL_EXE)) &&
    fs.existsSync(path.join(gameDir, 'BepInEx', 'core')) &&
    fs.existsSync(path.join(gameDir, 'doorstop_config.ini')) &&
    fs.existsSync(path.join(gameDir, 'winhttp.dll')) &&
    fs.existsSync(path.join(gameDir, LETHAL_PLUGIN_REL));
}

// Archivos/carpetas a eliminar durante la desinstalación
const MOD_UNINSTALL_FILES = [
  'BepInEx',                 // Carpeta completa de BepInEx
  'doorstop_libs',           // Carpeta de librerías
  'dotnet',                  // Carpeta dotnet (si existe)
  '.doorstop_version',       // Archivo de versión
  'changelog.txt',           // Changelog
  'doorstop_config.ini',     // Configuración de doorstop
  'winhttp.dll'              // DLL de carga de BepInEx
];

// Rutas comunes donde puede estar Lethal Company
const COMMON_PATHS = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Lethal Company',
  'C:\\Program Files\\Steam\\steamapps\\common\\Lethal Company',
  'D:\\SteamLibrary\\steamapps\\common\\Lethal Company',
  'E:\\SteamLibrary\\steamapps\\common\\Lethal Company',
  'F:\\SteamLibrary\\steamapps\\common\\Lethal Company'
];

let mainWindow = null;
let cachedGamePath = null; // Cache de la ruta del juego
let service = null; // Instancia del servicio TCP

function getConfigPath() {
  return path.join(app.getPath('userData'), 'electron-config.json');
}

function readConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.warn('[Lethal Company] Error leyendo electron-config:', error.message);
  }
  return {};
}

function writeConfig(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

function resolveProfileId(profileId) {
  return profileId || global.__ACTIVE_PROFILE_ID__ || getActiveProfileId() || null;
}

function normalizeGameDir(candidatePath) {
  if (!candidatePath || typeof candidatePath !== 'string') return null;

  const rawPath = candidatePath.trim();
  if (!rawPath) return null;

  const gameDir = resolveDir(rawPath);
  if (!gameDir || !fs.existsSync(gameDir)) return null;

  return fs.existsSync(path.join(gameDir, LETHAL_EXE)) ? gameDir : null;
}

function getProfileSavedPath(profileId) {
  const resolvedProfileId = resolveProfileId(profileId);
  if (!resolvedProfileId) return null;

  try {
    const profilesModule = require('../../../modules/profiles');
    const profileData = profilesModule.getProfileData(resolvedProfileId);
    const candidates = [
      profileData?.lethalcompany?.gamePath,
      profileData?.juegos?.lethalcompany?.gamePath
    ];

    for (const candidate of candidates) {
      const normalized = normalizeGameDir(candidate);
      if (normalized) return normalized;
    }
  } catch (error) {
    console.warn('[Lethal Company] Error leyendo ruta del perfil:', error.message);
  }

  return null;
}

function getConfigSavedPath(profileId) {
  const resolvedProfileId = resolveProfileId(profileId);
  const config = readConfig();
  const keys = [];

  if (resolvedProfileId) {
    keys.push(`${GAME_ID}_game_path_${resolvedProfileId}`);
    keys.push('lethal-company_game_path_' + resolvedProfileId);
  }

  keys.push(`${GAME_ID}_game_path`);
  keys.push('lethal-company_game_path');

  for (const key of keys) {
    const normalized = normalizeGameDir(config[key]);
    if (normalized) return normalized;
  }

  return null;
}

function getSavedGamePath(profileId) {
  const candidates = [
    getProfileSavedPath(profileId),
    getConfigSavedPath(profileId),
    cachedGamePath
  ];

  for (const candidate of candidates) {
    const normalized = normalizeGameDir(candidate);
    if (normalized) {
      cachedGamePath = normalized;
      return normalized;
    }
  }

  return null;
}

function saveGamePath(gamePath, profileId) {
  const normalizedPath = normalizeGameDir(gamePath);
  if (!normalizedPath) {
    return {
      success: false,
      error: 'Ruta invalida. Selecciona la carpeta raiz donde esta Lethal Company.exe.'
    };
  }

  const resolvedProfileId = resolveProfileId(profileId);

  if (resolvedProfileId) {
    try {
      const profilesModule = require('../../../modules/profiles');
      const profileData = profilesModule.getProfileData(resolvedProfileId) || {};

      if (!profileData.lethalcompany) profileData.lethalcompany = {};
      profileData.lethalcompany.gamePath = normalizedPath;

      if (!profileData.juegos) profileData.juegos = {};
      if (!profileData.juegos.lethalcompany) profileData.juegos.lethalcompany = {};
      profileData.juegos.lethalcompany.gamePath = normalizedPath;

      profilesModule.setProfileData(resolvedProfileId, profileData);
    } catch (error) {
      console.warn('[Lethal Company] Error guardando ruta en perfil:', error.message);
    }
  }

  const config = readConfig();
  if (resolvedProfileId) {
    config[`${GAME_ID}_game_path_${resolvedProfileId}`] = normalizedPath;
    config[`lethal-company_game_path_${resolvedProfileId}`] = normalizedPath;
  }
  config[`${GAME_ID}_game_path`] = normalizedPath;
  config['lethal-company_game_path'] = normalizedPath;
  writeConfig(config);

  cachedGamePath = normalizedPath;
  return { success: true, gamePath: normalizedPath, path: normalizedPath };
}

/**
 * Función helper para descargar archivos con reintentos
 */
async function downloadFile(url, outputPath, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Lethal Company] 📥 Descargando (intento ${attempt}/${maxRetries})...`);
      await downloadFileOnce(url, outputPath);
      console.log(`[Lethal Company] ✅ Descarga completada exitosamente`);
      return; // Éxito
    } catch (error) {
      lastError = error;
      console.error(`[Lethal Company] ⚠️ Error en intento ${attempt}:`, error.message);

      if (attempt < maxRetries) {
        const waitTime = attempt * 2000; // Espera progresiva: 2s, 4s
        console.log(`[Lethal Company] ⏳ Reintentando en ${waitTime / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error('Download failed after all retries');
}

/**
 * Intento único de descarga
 */
function downloadFileOnce(url, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const options = {
      headers: {
        'User-Agent': 'TikControl/1.0',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      }
    };

    const request = protocol.get(url, options, (response) => {
      // Seguir redirecciones
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        const redirectUrl = response.headers.location;
        console.log(`[Lethal Company] ↪️ Redirigiendo a: ${redirectUrl}`);
        downloadFileOnce(redirectUrl, outputPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      console.log(`[Lethal Company] 📦 Tamaño del archivo: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

      const file = fs.createWriteStream(outputPath);

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize) {
          const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r[Lethal Company] 📥 Descargando... ${progress}%`);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('\n[Lethal Company] ✅ Archivo guardado correctamente');
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(outputPath, () => { }); // Eliminar archivo parcial
        reject(err);
      });

      response.on('error', (err) => {
        fs.unlink(outputPath, () => { }); // Eliminar archivo parcial
        reject(err);
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    // Timeout más largo para archivos grandes (2 minutos)
    request.setTimeout(120000, () => {
      request.destroy();
      reject(new Error('Download timeout (2 minutos)'));
    });

    request.end();
  });
}

/**
 * Busca el ejecutable de Lethal Company
 */
async function findLethalCompanyExecutable() {
  // Si ya tenemos la ruta en cache, verificar que sigue existiendo
  if (cachedGamePath && fs.existsSync(cachedGamePath)) {
    return cachedGamePath;
  }

  console.log('[Lethal Company] 🔍 Buscando ejecutable del juego...');

  // 1. Buscar en rutas comunes
  for (const basePath of COMMON_PATHS) {
    const exePath = path.join(basePath, 'Lethal Company.exe');
    if (fs.existsSync(exePath)) {
      console.log('[Lethal Company] ✅ Juego encontrado en:', exePath);
      cachedGamePath = exePath;
      return exePath;
    }
  }

  // 2. Buscar usando Steam Registry (Windows only)
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await execPromise('reg query "HKEY_CURRENT_USER\\Software\\Valve\\Steam" /v SteamPath');
    const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/);
    if (match) {
      const steamPath = match[1].trim().replace(/\//g, '\\');

      // Buscar en la librería principal de Steam
      const mainLibPath = path.join(steamPath, 'steamapps', 'common', 'Lethal Company', 'Lethal Company.exe');
      if (fs.existsSync(mainLibPath)) {
        console.log('[Lethal Company] ✅ Juego encontrado en Steam:', mainLibPath);
        cachedGamePath = mainLibPath;
        return mainLibPath;
      }

      // Buscar en librerías adicionales
      const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(libraryFoldersPath)) {
        const vdfContent = fs.readFileSync(libraryFoldersPath, 'utf8');
        const pathMatches = vdfContent.match(/"path"\s+"([^"]+)"/g);

        if (pathMatches) {
          for (const pathMatch of pathMatches) {
            const libraryPath = pathMatch.match(/"path"\s+"([^"]+)"/)[1].replace(/\\\\/g, '\\');
            const exePath = path.join(libraryPath, 'steamapps', 'common', 'Lethal Company', 'Lethal Company.exe');

            if (fs.existsSync(exePath)) {
              console.log('[Lethal Company] ✅ Juego encontrado en librería Steam:', exePath);
              cachedGamePath = exePath;
              return exePath;
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('[Lethal Company] ⚠️ No se pudo buscar en Steam Registry:', error.message);
  }

  // No encontrado
  console.log('[Lethal Company] ⚠️ No se encontró en rutas comunes');
  return null;
}

/**
 * Lanza Lethal Company con el servidor ya activo
 */
async function launchGame(profileId) {
  try {
    const gamePath = getSavedGamePath(profileId);

    if (!gamePath || !fs.existsSync(gamePath)) {
      return { success: false, error: 'Game not found' };
    }

    const gameDir = resolveDir(gamePath);
    const { spawn } = require('child_process');

    if (!isLethalModInstalled(gameDir)) {
      console.log('[Lethal Company] ⚠️ Mod TikControl incompleto o no detectado en:', gameDir);
      return {
        success: false,
        error: 'TikControl mod not installed',
        hint: 'Por favor, instala el mod primero usando el botón "Instalar Mod"'
      };
    }

    console.log('[Lethal Company] ✅ Mod TikControl detectado, lanzando juego...');

    // 3. Iniciar servidor TCP si no está activo
    const lethalcompanyServiceModule = require('./lethalcompanyService.js');

    if (!service) {
      service = lethalcompanyServiceModule.getInstance();
    }

    if (!service.isRunning) {
      console.log('[Lethal Company] 🚀 Iniciando servidor TCP en puerto 51338...');
      service.start();
      console.log('[Lethal Company] ✅ Servidor TCP activo');
      // Esperar 2 segundos para que el servidor esté completamente listo
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log('[Lethal Company] ℹ️ Servidor TCP ya está activo');
    }

    // 4. Lanzar el juego via Steam (BepInEx se carga automáticamente)
    const { shell } = require('electron');
    try {
      await shell.openExternal('steam://rungameid/1966720');
      console.log('[Lethal Company] ✅ Juego lanzado via Steam');
    } catch (_) {
      const exePath = fs.statSync(gamePath).isDirectory()
        ? path.join(gameDir, 'Lethal Company.exe')
        : gamePath;
      if (fs.existsSync(exePath)) {
        await shell.openPath(exePath);
        console.log('[Lethal Company] ✅ Juego lanzado directamente');
      } else {
        return { success: false, error: 'No se encontró el ejecutable' };
      }
    }

    return {
      success: true,
      message: '✅ Juego y servidor TCP iniciados\n💡 El mod se conectará automáticamente'
    };

  } catch (error) {
    console.error('[Lethal Company] ❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Inicializa el módulo con la ventana principal
 */
function init(window) {
  mainWindow = window;
  const lethalcompanyServiceModule = require('./lethalcompanyService.js');
  service = lethalcompanyServiceModule.getInstance();
  setupIPCHandlers();

  if (!service.isRunning) {
    service.start();
    console.log('[Lethal Company] ✅ Módulo inicializado (servidor TCP activo en puerto 51338)');
  } else {
    console.log('[Lethal Company] ✅ Módulo inicializado (servidor TCP ya estaba activo)');
  }
}

/**
 * Configura los handlers IPC
 */
function setupIPCHandlers() {
  // Conectar al juego (servidor WebSocket - el mod se conecta a nosotros)
  ipcMain.handle('lethalcompany:connect', async () => {
    try {
      const lethalcompanyServiceModule = require('./lethalcompanyService.js');
      const svc = service || lethalcompanyServiceModule.getInstance();
      if (!svc) {
        return { success: false, error: 'Servicio no disponible', hint: 'Intenta lanzar el juego primero' };
      }

      if (svc.isConnected) {
        return {
          success: true,
          message: `Ya conectado - Mod activo`
        };
      }

      // Si el servidor ya está escuchando pero el mod no se ha conectado
      if (svc.wss) {
        return {
          success: true,
          message: 'Servidor activo - Esperando que el mod se conecte...',
          waiting: true
        };
      }

      await svc.connect();

      return {
        success: true,
        message: `✅ Servidor activo en ws://127.0.0.1:51338\n💡 Inicia Lethal Company para que el mod se conecte`,
        mode: 'server'
      };
    } catch (error) {
      console.error('[Lethal Company] ❌ Error al conectar:', error);
      return {
        success: false,
        error: error.message,
        hint: 'Verifica que el puerto 51338 no esté en uso por otra aplicación'
      };
    }
  });

  // 🎮 NUEVO: Lanzar juego con servidor automático
  ipcMain.handle('lethalcompany:launchGame', async (event, profileId) => {
    return await launchGame(profileId);
  });

  // ⚙️ NUEVO: Configurar ruta del juego
  ipcMain.handle('lethalcompany:setGamePath', async (event, profileIdOrPath, maybePath) => {
    try {
      const { profileId, path: requestedPath } = resolveSetGamePathArgs(profileIdOrPath, maybePath);
      if (!requestedPath) return { success: false, error: 'No path provided' };

      const saved = saveGamePath(requestedPath, profileId);
      if (!saved.success) return saved;

      console.log('[Lethal Company] Ruta del juego guardada:', saved.gamePath, 'en perfil:', resolveProfileId(profileId) || 'global');

      return {
        ...saved,
        message: 'Ruta del juego configurada correctamente'
      };
    } catch (error) {
      console.error('[Lethal Company] Error guardando ruta:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });


  // 📁 NUEVO: Obtener ruta del juego
  ipcMain.handle('lethalcompany:getGamePath', async (event, profileId) => {
    try {
      const gamePath = getSavedGamePath(profileId);
      return {
        success: true,
        gamePath: gamePath || null,
        path: gamePath || null
      };
    } catch (error) {
      console.error('[Lethal Company] Error obteniendo ruta:', error);
      return {
        success: false,
        gamePath: null,
        path: null,
        error: error.message
      };
    }
  });


  // 🔍 NUEVO: Buscar juego automáticamente
  ipcMain.handle('lethalcompany:findGame', async () => {
    try {
      const gamePath = await findLethalCompanyExecutable();

      if (gamePath) {
        return {
          success: true,
          gamePath: gamePath,
          message: 'Juego encontrado automáticamente'
        };
      } else {
        return {
          success: false,
          gamePath: null,
          message: 'No se encontró el juego. Por favor, selecciona la ruta manualmente.'
        };
      }
    } catch (error) {
      console.error('[Lethal Company] ❌ Error buscando juego:', error);
      return {
        success: false,
        gamePath: null,
        error: error.message
      };
    }
  });

  // 📂 NUEVO: Abrir diálogo para seleccionar ejecutable
  ipcMain.handle('lethalcompany:selectGamePath', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecciona el ejecutable de Lethal Company',
        defaultPath: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Lethal Company',
        filters: [
          { name: 'Ejecutables', extensions: ['exe'] },
          { name: 'Todos los archivos', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return {
          success: false,
          canceled: true,
          gamePath: null
        };
      }

      const selectedPath = result.filePaths[0];
      console.log('[Lethal Company] 📁 Usuario seleccionó:', selectedPath);

      return {
        success: true,
        gamePath: selectedPath
      };

    } catch (error) {
      console.error('[Lethal Company] ❌ Error en diálogo:', error);
      return {
        success: false,
        error: error.message,
        gamePath: null
      };
    }
  });

  // Desconectar del juego
  ipcMain.handle('lethalcompany:disconnect', async () => {
    try {
      const lethalcompanyServiceModule = require('./lethalcompanyService.js');
      const svc = service || lethalcompanyServiceModule.getInstance();
      if (svc) svc.disconnect();

      return { success: true, message: 'Desconectado de Lethal Company' };
    } catch (error) {
      console.error('[Lethal Company] ❌ Error al desconectar:', error);
      return { success: false, error: error.message };
    }
  });

  // Obtener estado de la conexión
  ipcMain.handle('lethalcompany:getStatus', async () => {
    try {
      const lethalcompanyServiceModule = require('./lethalcompanyService.js');
      const svc = service || lethalcompanyServiceModule.getInstance();
      const status = svc ? svc.getStatus() : { connected: false, mode: null, port: null, host: null };

      return {
        success: true,
        connected: status.connected,
        mode: status.mode,
        port: status.port,
        host: status.host
      };
    } catch (error) {
      return {
        success: false,
        connected: false,
        error: error.message
      };
    }
  });

  // Ejecutar efecto
  ipcMain.handle('lethalcompany:executeEffect', async (event, params) => {
    try {
      const { effectId, username, duration, quantity } = params;
      console.log('[Lethal Company] 🎮 Ejecutando efecto:', effectId, 'Usuario:', username, 'Duración:', duration);

      // Obtener instancia del servicio
      const lethalcompanyServiceModule = require('./lethalcompanyService.js');
      const svc = lethalcompanyServiceModule.getInstance();

      if (!svc || !svc.isConnected) {
        console.error('[Lethal Company] ❌ No hay conexión con el mod');
        return { success: false, error: 'Not connected to Lethal Company mod' };
      }

      const result = await svc.executeEffect(effectId, { username, duration, quantity });

      return result;
    } catch (error) {
      console.error('[Lethal Company] ❌ Error ejecutando efecto:', error);
      return { success: false, error: error.message };
    }
  });

  // Obtener lista de efectos
  ipcMain.handle('lethalcompany:getEffects', async () => {
    try {
      console.log('[Lethal Company] 📋 Solicitando lista de efectos');

      // ✅ Cargar desde GamesCloud (AWS S3)
      const effects = await loadEffectsFromCloud();

      if (!effects || effects.length === 0) {
        console.warn('[Lethal Company] ⚠️ No hay efectos disponibles');
        return { success: false, error: 'No effects loaded', effects: [] };
      }

      return { success: true, effects };
    } catch (error) {
      console.error('[Lethal Company] ❌ Error obteniendo efectos:', error);
      return { success: false, error: error.message, effects: [] };
    }
  });

  // Verificar estado del juego
  ipcMain.handle('lethalcompany:checkGameStatus', async () => {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec('tasklist /FI "IMAGENAME eq Lethal Company.exe"', (error, stdout) => {
          const isRunning = stdout.toLowerCase().includes('lethal company.exe');
          resolve({
            success: true,
            running: isRunning,
            message: isRunning ? 'Lethal Company está ejecutándose' : 'Lethal Company no está ejecutándose'
          });
        });
      });
    } catch (error) {
      return {
        success: false,
        running: false,
        error: error.message
      };
    }
  });

  // Verificar estado del mod
  ipcMain.handle('lethalcompany:checkModStatus', async (event, profileIdOrPath) => {
    try {
      const { profileId, path: requestedPath } = resolveSetGamePathArgs(profileIdOrPath);
      const gamePath = normalizeGameDir(requestedPath) || getSavedGamePath(profileId);

      if (!gamePath) {
        return {
          success: true,
          installed: false,
          gamePath: null,
          path: null,
          reason: 'No hay ruta configurada'
        };
      }

      const installed = isLethalModInstalled(gamePath);
      return {
        success: true,
        installed,
        gamePath,
        path: gamePath,
        version: installed ? 'instalado' : 'no instalado'
      };
    } catch (error) {
      return {
        success: false,
        installed: false,
        error: error.message
      };
    }
  });


  // INSTALACIÓN DEL MOD (siguiendo patrón de RoR2/Muck)
  ipcMain.handle('lethalcompany:installMod', async (event, profileIdOrPath) => {
    try {
      const { profileId, path: requestedPath } = resolveSetGamePathArgs(profileIdOrPath);
      let gamePath = normalizeGameDir(requestedPath) || getSavedGamePath(profileId);

      if (!gamePath) {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Seleccionar carpeta de Lethal Company',
          properties: ['openDirectory'],
          message: 'Selecciona la carpeta raiz donde esta instalado Lethal Company'
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { success: false, canceled: true };
        }

        gamePath = normalizeGameDir(result.filePaths[0]);
      }

      if (!gamePath) {
        return {
          success: false,
          error: 'Ruta invalida. Selecciona la carpeta raiz donde esta Lethal Company.exe.'
        };
      }

      const gameExe = path.join(gamePath, LETHAL_EXE);
      if (!fs.existsSync(gameExe)) {
        console.log('[Lethal Company] No se encontro Lethal Company.exe en:', gamePath);
        return {
          success: false,
          error: 'No se encontro Lethal Company.exe. Selecciona la carpeta raiz del juego.'
        };
      }

      saveGamePath(gamePath, profileId);

      const bepInExPath = path.join(gamePath, 'BepInEx');
      const doorstopConfig = path.join(gamePath, 'doorstop_config.ini');
      const winhttpDll = path.join(gamePath, 'winhttp.dll');

      const bepInExInstalled = fs.existsSync(bepInExPath) &&
        fs.existsSync(doorstopConfig) &&
        fs.existsSync(winhttpDll);

      const modDllPath = path.join(gamePath, LETHAL_PLUGIN_REL);

      if (fs.existsSync(modDllPath) && bepInExInstalled) {
        console.log('[Lethal Company] Mod ya instalado completamente');
        return {
          success: true,
          alreadyInstalled: true,
          complete: true,
          gamePath,
          path: gamePath,
          modInstalled: true,
          message: 'El mod ya esta completamente instalado.'
        };
      }

      const fileName = path.basename(MOD_DOWNLOAD_URL).split('?')[0] || 'lethalcompany_mod.zip';
      const tempPath = path.join(app.getPath('temp'), fileName);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lethalcompany:install-progress', {
          status: 'downloading',
          message: 'Descargando mod...'
        });
      }

      await downloadFile(MOD_DOWNLOAD_URL, tempPath);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lethalcompany:install-progress', {
          status: 'extracting',
          message: 'Extrayendo archivos...'
        });
      }

      const zip = new AdmZip(tempPath);
      zip.extractAllTo(gamePath, true);

      try {
        fs.unlinkSync(tempPath);
        console.log('[Lethal Company] Archivo temporal eliminado');
      } catch (e) {
        console.log('[Lethal Company] No se pudo eliminar archivo temporal:', e.message);
      }

      if (!isLethalModInstalled(gamePath)) {
        return {
          success: false,
          error: 'La extraccion termino, pero faltan archivos del mod TikControl.'
        };
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lethalcompany:install-progress', {
          status: 'complete',
          message: 'Instalado'
        });
      }

      console.log('[Lethal Company] Mod instalado correctamente en:', gamePath);

      return {
        success: true,
        gamePath,
        path: gamePath,
        modInstalled: true,
        message: 'Mod instalado correctamente. Inicia el juego para activarlo.'
      };
    } catch (error) {
      console.error('[Lethal Company] Error instalando mod:', error);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lethalcompany:install-progress', {
          status: 'error',
          message: 'Error en instalacion'
        });
      }

      return { success: false, error: error.message };
    }
  });


  // DESINSTALACIÓN DEL MOD (siguiendo patrón de RoR2/Muck)
  ipcMain.handle('lethalcompany:uninstallMod', async () => {
    try {
      // 1. Pedir carpeta del juego
      const folderResult = await dialog.showOpenDialog(mainWindow, {
        title: 'Seleccionar carpeta de Lethal Company',
        properties: ['openDirectory'],
        message: 'Selecciona la carpeta donde está instalado Lethal Company'
      });

      if (folderResult.canceled) {
        return { success: false, canceled: true };
      }

      const gameDir = folderResult.filePaths[0];

      console.log('[Lethal Company] 🗑️ Iniciando desinstalación completa del mod...');
      console.log('[Lethal Company] 📋 Se eliminarán:', MOD_UNINSTALL_FILES.join(', '));

      let deletedCount = 0;
      let notFoundCount = 0;

      // 2. Eliminar archivos y carpetas
      for (const item of MOD_UNINSTALL_FILES) {
        const itemPath = path.join(gameDir, item);

        if (fs.existsSync(itemPath)) {
          const stats = fs.statSync(itemPath);

          try {
            if (stats.isDirectory()) {
              fs.rmSync(itemPath, { recursive: true, force: true });
              console.log(`[Lethal Company] ✅ Carpeta eliminada: ${item}`);
            } else {
              fs.unlinkSync(itemPath);
              console.log(`[Lethal Company] ✅ Archivo eliminado: ${item}`);
            }
            deletedCount++;
          } catch (err) {
            console.error(`[Lethal Company] ❌ Error eliminando ${item}:`, err);
          }
        } else {
          notFoundCount++;
        }
      }

      console.log(`[Lethal Company] ✅ Desinstalación completada: ${deletedCount} eliminados, ${notFoundCount} no encontrados`);

      return {
        success: true,
        message: `Mod desinstalado correctamente (${deletedCount} archivos eliminados)`,
        deleted: deletedCount
      };

    } catch (error) {
      console.error('[Lethal Company] ❌ Error en desinstalación:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[Lethal Company] ✅ IPC handlers registrados');
}

/**
 * Limpieza al cerrar la aplicación
 */
function cleanup() {
  console.log('[Lethal Company] 🧹 Limpiando módulo...');
  mainWindow = null;
}

module.exports = {
  init,
  cleanup,
  getEffects: () => LETHAL_COMPANY_EFFECTS,
  getService: () => service
};
