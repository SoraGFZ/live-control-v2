/**
 * Módulo de Muck
 * Gestiona la integración con el mod de BepInEx para Muck
 * Puerto TCP: 37777
 */

const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const AdmZip = require('adm-zip');
const https = require('https');
const http = require('http');
const createMuckService = require('./muckService');
const { findGamePath } = require('../steamDetect');

// ✅ Cargar efectos desde GamesCloud (AWS S3) - eliminada dependencia local
let MUCK_EFFECTS = [];
let effectsLoaded = false;

// Función para cargar efectos desde GamesCloud
async function loadEffectsFromCloud() {
  if (effectsLoaded) return MUCK_EFFECTS;

  try {
    const gamesCloud = require('../../../modules/auth/gamesCloudService');
    const commands = await gamesCloud.getGameCommands('muck');

    if (commands?.effects) {
      MUCK_EFFECTS = Object.entries(commands.effects).map(([id, effect]) => ({
        id,
        name: effect.name?.public || effect.name || id,
        description: effect.description || '',
        category: Array.isArray(effect.category) ? effect.category[0] : 'General',
        price: effect.price || 0,
        duration: effect.duration?.value || 0,
        quantity: effect.quantity || null,
        inactive: effect.inactive || false
      }));
      effectsLoaded = true;
      console.log('[Muck] ✅ Efectos cargados desde AWS:', MUCK_EFFECTS.length);
    }
  } catch (error) {
    console.warn('[Muck] ⚠️ Error cargando desde AWS:', error.message);
  }

  return MUCK_EFFECTS;
}

// URL del mod oficial de Muck
// Incluye BepInEx + el framework completo del mod
const MOD_DOWNLOAD_URL = 'https://storage.tikcontrol.live/games/muck/mod.zip';
const MUCK_EXE = 'Muck.exe';
const MUCK_PLUGIN_REL = path.join('BepInEx', 'plugins', 'TikControlMod_Muck.dll');
const MUCK_REQUIRED_MOD_FILES = [
  path.join('BepInEx', 'core'),
  'doorstop_config.ini',
  'winhttp.dll',
  MUCK_PLUGIN_REL
];

// Archivos/carpetas a eliminar durante la desinstalación del mod de TikControl
const MOD_FILES_TO_DELETE = [
  MUCK_PLUGIN_REL,
  'BepInEx/plugins/TikControl'
];

// Archivos/carpetas a eliminar durante la desinstalación completa de BepInEx
const MOD_UNINSTALL_FILES = [
  'BepInEx',                 // Carpeta completa de BepInEx
  'doorstop_libs',           // Carpeta de librerías de doorstop
  'dotnet',                  // Carpeta dotnet
  '.doorstop_version',       // Archivo de versión
  'changelog.txt',           // Changelog del mod
  'doorstop_config.ini',     // Configuración de doorstop
  'icon.png',                // Icono del mod
  'manifest.json',           // Manifiesto
  'readme.md',               // README
  'start_game_bepinex.sh',   // Script de inicio (Linux/Mac)
  'winhttp.dll'              // DLL de carga de BepInEx
];

// Rutas comunes donde puede estar Muck
const COMMON_PATHS = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Muck',
  'C:\\Program Files\\Steam\\steamapps\\common\\Muck',
  'D:\\SteamLibrary\\steamapps\\common\\Muck',
  'E:\\SteamLibrary\\steamapps\\common\\Muck',
  'F:\\SteamLibrary\\steamapps\\common\\Muck'
];

let mainWindow = null;
let cachedGamePath = null;
let muckService = null;
let isConnected = false;

function normalizeMuckGameDir(gamePath) {
  if (!gamePath) return null;
  try {
    const stat = fs.existsSync(gamePath) ? fs.statSync(gamePath) : null;
    if (stat?.isFile()) return path.dirname(gamePath);
    if (stat?.isDirectory()) return gamePath;
  } catch (_) {}
  return gamePath;
}

function getMuckExePath(gamePath) {
  const gameDir = normalizeMuckGameDir(gamePath);
  return gameDir ? path.join(gameDir, MUCK_EXE) : null;
}

function isMuckModInstalled(gamePath) {
  const gameDir = normalizeMuckGameDir(gamePath);
  if (!gameDir || !fs.existsSync(path.join(gameDir, MUCK_EXE))) {
    return {
      installed: false,
      bepinexInstalled: false,
      missing: [MUCK_EXE, ...MUCK_REQUIRED_MOD_FILES]
    };
  }

  const missing = MUCK_REQUIRED_MOD_FILES.filter((rel) => !fs.existsSync(path.join(gameDir, rel)));
  const bepinexInstalled = fs.existsSync(path.join(gameDir, 'BepInEx', 'core')) &&
    fs.existsSync(path.join(gameDir, 'doorstop_config.ini')) &&
    fs.existsSync(path.join(gameDir, 'winhttp.dll'));

  return {
    installed: missing.length === 0,
    bepinexInstalled,
    missing
  };
}

/**
 * Busca el ejecutable de Muck
 */
async function findMuckExecutable() {
  if (cachedGamePath && fs.existsSync(cachedGamePath)) {
    return getMuckExePath(cachedGamePath) || cachedGamePath;
  }

  const steamPath = findGamePath('muck');
  const steamExe = getMuckExePath(steamPath);
  if (steamExe && fs.existsSync(steamExe)) {
    cachedGamePath = steamExe;
    console.log('[Muck] ✅ Ejecutable encontrado por Steam:', steamExe);
    return steamExe;
  }

  for (const basePath of COMMON_PATHS) {
    const exePath = path.join(basePath, MUCK_EXE);
    if (fs.existsSync(exePath)) {
      cachedGamePath = exePath;
      console.log('[Muck] ✅ Ejecutable encontrado:', exePath);
      return exePath;
    }
  }

  console.log('[Muck] ⚠️ Ejecutable no encontrado automáticamente');
  return null;
}

/**
 * Iniciar servicio TCP (escucha en puerto 37777 para TikControl)
 */
function startTCPServer() {
  if (muckService) {
    console.log('[Muck] ⚠️ Servicio ya está activo');
    return;
  }

  muckService = createMuckService();
  muckService.start();

  // Eventos del servicio
  muckService.on('connected', () => {
    isConnected = true;
    if (mainWindow) {
      mainWindow.webContents.send('muck:status', { connected: true });
    }
    console.log('[Muck] ✅ Conectado al mod');
  });

  muckService.on('disconnected', () => {
    isConnected = false;
    if (mainWindow) {
      mainWindow.webContents.send('muck:status', { connected: false });
    }
    console.log('[Muck] 🔌 Desconectado del mod');
  });

  console.log('[Muck] ✅ Servicio TikControl iniciado (puerto 37777)');
}

/**
 * Detener servidor y desconectar
 */
function disconnectFromMod() {
  if (muckService) {
    muckService.stop();
    muckService = null;
  }

  isConnected = false;
  console.log('[Muck] 🔌 Servicio detenido');
}

/**
 * Ejecutar un efecto
 */
async function executeEffect(options = {}) {
  // Soporte para formato { effectId, username, duration, quantity } o parámetros individuales
  const effectId = typeof options === 'string' ? options : options.effectId;
  const username = options.username || 'TikControl';
  const duration = options.duration || 0;
  const quantity = options.quantity || 0;

  if (!isConnected || !muckService) {
    console.log('[Muck] ❌ No hay conexión con el mod');
    return { success: false, error: 'Not connected' };
  }

  try {
    console.log('[Muck] 📤 Enviando efecto:', { effectId, username, duration, quantity });
    const result = await muckService.executeEffect(effectId, {
      username,
      duration,
      quantity
    });

    return { success: true, message: result.message };
  } catch (error) {
    console.error('[Muck] ❌ Error ejecutando efecto:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Inicializar el módulo
 */
function init(window) {
  mainWindow = window;
  setupIPCHandlers();

  // Iniciar servidor TCP al cargar el módulo
  startTCPServer();

  console.log('[Muck] ✅ Módulo inicializado');
  console.log('[Muck] 💡 Escuchando en puerto 37777');
}

/**
 * Configurar handlers IPC
 */
function setupIPCHandlers() {
  // Conectar al juego
  ipcMain.handle('muck:connect', async () => {
    try {
      // El servidor ya está activo, solo verificamos el estado
      return {
        success: true,
        connected: isConnected,
        message: isConnected ? 'Mod ya conectado' : 'Servidor activo, esperando al mod...'
      };
    } catch (error) {
      console.error('[Muck] ❌ Error al verificar conexión:', error);
      return { success: false, error: error.message };
    }
  });

  // Desconectar
  ipcMain.handle('muck:disconnect', async () => {
    try {
      disconnectFromMod();
      return { success: true };
    } catch (error) {
      console.error('[Muck] ❌ Error al desconectar:', error);
      return { success: false, error: error.message };
    }
  });

  // Lanzar juego
  ipcMain.handle('muck:launchGame', async (event, profileId) => {
    try {
      // Obtener ruta del juego del perfil
      const profilePath = path.join(require('electron').app.getPath('userData'), 'profiles', `${profileId}.json`);
      let gamePath = null;

      if (fs.existsSync(profilePath)) {
        const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        gamePath = profileData?.juegos?.muck?.gamePath;
      }

      if (!gamePath) {
        gamePath = await findMuckExecutable();
      }

      if (!gamePath || !fs.existsSync(gamePath)) {
        return { success: false, error: 'Game not found' };
      }

      const gameDir = normalizeMuckGameDir(gamePath);
      const modStatus = isMuckModInstalled(gameDir);

      if (!modStatus.installed) {
        console.log('[Muck] ⚠️ Mod de TikControl no detectado en:', gameDir, modStatus.missing);
        return {
          success: false,
          error: 'TikControl mod not installed',
          missing: modStatus.missing,
          hint: 'Por favor, instala el mod primero usando el botón "Instalar Mod"'
        };
      }

      console.log('[Muck] ✅ Mod de TikControl detectado, lanzando juego...');

      try {
        const { shell } = require('electron');
        try {
          await shell.openExternal('steam://rungameid/1625450');
          console.log('[Muck] ✅ Juego lanzado via Steam');
        } catch (_) {
          const exePath = getMuckExePath(gameDir);
          if (fs.existsSync(exePath)) {
            await shell.openPath(exePath);
            console.log('[Muck] ✅ Juego lanzado directamente');
          } else {
            return { success: false, error: 'No se encontró el ejecutable' };
          }
        }
      } catch (error) {
        console.error('[Muck] ❌ Error al lanzar:', error);
        return {
          success: false,
          error: `Error al lanzar: ${error.message}`,
          hint: 'Intenta lanzar el juego manualmente para verificar que funciona'
        };
      }

      // El mod se conectará automáticamente al servidor TCP
      console.log('[Muck] ⏳ Esperando a que el mod se conecte automáticamente...');

      return { success: true, gamePath };
    } catch (error) {
      console.error('[Muck] ❌ Error al lanzar juego:', error);
      return { success: false, error: error.message };
    }
  });

  // Configurar ruta del juego
  ipcMain.handle('muck:setGamePath', async (event, profileId, gamePath) => {
    try {
      const profilePath = path.join(require('electron').app.getPath('userData'), 'profiles', `${profileId}.json`);

      let profileData = {};
      if (fs.existsSync(profilePath)) {
        profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      }

      if (!profileData.juegos) profileData.juegos = {};
      if (!profileData.juegos.muck) profileData.juegos.muck = {};
      const gameDir = normalizeMuckGameDir(gamePath);
      const exePath = getMuckExePath(gameDir);

      if (!exePath || !fs.existsSync(exePath)) {
        return { success: false, error: 'No se encontró Muck.exe en esta ruta.' };
      }

      profileData.juegos.muck.gamePath = exePath;

      fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
      cachedGamePath = exePath;

      return { success: true };
    } catch (error) {
      console.error('[Muck] ❌ Error al guardar ruta:', error);
      return { success: false, error: error.message };
    }
  });

  // Obtener ruta del juego
  ipcMain.handle('muck:getGamePath', async (event, profileId) => {
    try {
      const profilePath = path.join(require('electron').app.getPath('userData'), 'profiles', `${profileId}.json`);

      if (fs.existsSync(profilePath)) {
        const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        const gamePath = profileData?.juegos?.muck?.gamePath;

        if (gamePath && fs.existsSync(gamePath)) {
          return { success: true, gamePath };
        }
      }

      // Intentar encontrar automáticamente
      const foundPath = await findMuckExecutable();
      return foundPath ? { success: true, gamePath: foundPath } : { success: false };
    } catch (error) {
      console.error('[Muck] ❌ Error al obtener ruta:', error);
      return { success: false, error: error.message };
    }
  });

  // Buscar juego
  ipcMain.handle('muck:findGame', async () => {
    try {
      const foundPath = await findMuckExecutable();
      return foundPath ? { success: true, gamePath: foundPath } : { success: false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Seleccionar ruta manualmente
  ipcMain.handle('muck:selectGamePath', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecciona el ejecutable de Muck',
        filters: [{ name: 'Executable', extensions: ['exe'] }],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, gamePath: result.filePaths[0] };
      }

      return { success: false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Obtener estado
  ipcMain.handle('muck:getStatus', async () => {
    return {
      success: true,
      connected: isConnected
    };
  });

  // Ejecutar efecto
  ipcMain.handle('muck:executeEffect', async (event, params) => {
    try {
      return executeEffect(params);
    } catch (error) {
      console.error('[Muck] ❌ Error ejecutando efecto:', error);
      return { success: false, error: error.message };
    }
  });

  // Obtener lista de efectos
  ipcMain.handle('muck:getEffects', async () => {
    try {
      console.log('[Muck] 📋 Solicitando lista de efectos');

      // ✅ Cargar desde GamesCloud (AWS S3)
      const effects = await loadEffectsFromCloud();

      if (!effects || effects.length === 0) {
        console.warn('[Muck] ⚠️ No hay efectos disponibles');
        return { success: false, error: 'No effects loaded', effects: [] };
      }

      return { success: true, effects };
    } catch (error) {
      console.error('[Muck] ❌ Error obteniendo efectos:', error);
      return { success: false, error: error.message, effects: [] };
    }
  });

  // Instalar mod (siguiendo el patrón de RoR2)
  ipcMain.handle('muck:installMod', async () => {
    try {
      // Pedir carpeta de instalación de Muck
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Seleccionar carpeta de Muck',
        properties: ['openDirectory'],
        message: 'Selecciona la carpeta raíz donde está instalado Muck'
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const muckPath = result.filePaths[0];

      // Verificar que sea una carpeta válida de Muck (buscar Muck.exe)
      const muckExe = path.join(muckPath, MUCK_EXE);
      if (!fs.existsSync(muckExe)) {
        console.log('[Muck] ❌ No se encontró Muck.exe en:', muckPath);
        return {
          success: false,
          error: 'No se encontró Muck.exe en esta carpeta. Selecciona la carpeta raíz del juego.'
        };
      }

      // ✅ Verificar si BepInEx ya está instalado
      const currentInstall = isMuckModInstalled(muckPath);
      if (currentInstall.installed) {
        console.log('[Muck] ✅ Mod ya instalado completamente');
        return {
          success: true,
          alreadyInstalled: true,
          complete: true,
          message: 'El mod ya está completamente instalado. No es necesario descargar nada.'
        };
      }

      // Descargar el mod
      const fileName = path.basename(MOD_DOWNLOAD_URL).split('?')[0] || 'muck_mod.zip';
      const tempPath = path.join(app.getPath('temp'), fileName);

      // Notificar inicio de descarga
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('muck:install-progress', {
          status: 'downloading',
          message: '📥 Descargando mod...'
        });
      }

      await downloadFile(MOD_DOWNLOAD_URL, tempPath);

      // Extraer automáticamente
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('muck:install-progress', {
          status: 'extracting',
          message: '📦 Extrayendo archivos...'
        });
      }

      // Extraer ZIP directamente en la carpeta del juego
      const zip = new AdmZip(tempPath);
      zip.extractAllTo(muckPath, true);

      const installed = isMuckModInstalled(muckPath);
      if (!installed.installed) {
        return {
          success: false,
          error: 'El ZIP se extrajo, pero faltan archivos del mod de TikControl.',
          missing: installed.missing
        };
      }

      // Limpiar archivo temporal
      try {
        fs.unlinkSync(tempPath);
        console.log('[Muck] 🗑️ Archivo temporal eliminado');
      } catch (e) {
        console.log('[Muck] ⚠️ No se pudo eliminar archivo temporal:', e.message);
      }

      // Notificar éxito
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('muck:install-progress', {
          status: 'complete',
          message: '✅ Instalado'
        });
      }

      console.log('[Muck] ✅ Mod instalado correctamente en:', muckPath);

      return {
        success: true,
        message: 'Mod instalado correctamente. Inicia el juego para activarlo.'
      };

    } catch (error) {
      console.error('[Muck] ❌ Error instalando mod:', error);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('muck:install-progress', {
          status: 'error',
          message: '❌ Error en instalación'
        });
      }

      return { success: false, error: error.message };
    }
  });

  // Desinstalar mod (siguiendo el patrón de RoR2)
  ipcMain.handle('muck:uninstallMod', async () => {
    try {
      // Pedir carpeta de Muck
      const folderResult = await dialog.showOpenDialog(mainWindow, {
        title: 'Seleccionar carpeta de Muck',
        properties: ['openDirectory'],
        message: 'Selecciona la carpeta donde está instalado Muck'
      });

      if (folderResult.canceled) {
        return { success: false, canceled: true };
      }

      const gameDir = folderResult.filePaths[0];

      console.log('[Muck] 🗑️ Iniciando desinstalación completa del mod...');
      console.log('[Muck] 📋 Se eliminarán:', MOD_UNINSTALL_FILES.join(', '));

      let deletedCount = 0;
      let notFoundCount = 0;

      // Eliminar archivos y carpetas
      for (const item of MOD_UNINSTALL_FILES) {
        const itemPath = path.join(gameDir, item);

        if (fs.existsSync(itemPath)) {
          const stats = fs.statSync(itemPath);

          if (stats.isDirectory()) {
            // Eliminar carpeta recursivamente
            fs.rmSync(itemPath, { recursive: true, force: true });
            console.log('[Muck] 🗑️ Carpeta eliminada:', item);
            deletedCount++;
          } else {
            // Eliminar archivo
            fs.unlinkSync(itemPath);
            console.log('[Muck] 🗑️ Archivo eliminado:', item);
            deletedCount++;
          }
        } else {
          console.log('[Muck] ⚠️ No encontrado (ya eliminado):', item);
          notFoundCount++;
        }
      }

      console.log('[Muck] ✅ Desinstalación completada');
      console.log(`[Muck] 📊 Eliminados: ${deletedCount}, No encontrados: ${notFoundCount}`);
      console.log('[Muck] 🎮 El juego volverá a su estado original');

      return { success: true };
    } catch (error) {
      console.error('[Muck] ❌ Error desinstalando mod:', error);
      return { success: false, error: error.message };
    }
  });

  // Verificar si el juego está ejecutándose
  ipcMain.handle('muck:checkGameStatus', async () => {
    try {
      return new Promise((resolve) => {
        exec('tasklist /FI "IMAGENAME eq Muck.exe"', (error, stdout) => {
          const isRunning = stdout.toLowerCase().includes('muck.exe');
          resolve({
            success: true,
            running: isRunning,
            message: isRunning ? 'Muck está ejecutándose' : 'Muck no está ejecutándose'
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

  // Verificar si el mod está instalado
  ipcMain.handle('muck:checkModStatus', async (event, profileId) => {
    try {
      // Obtener ruta del juego del perfil
      const profilePath = path.join(require('electron').app.getPath('userData'), 'profiles', `${profileId}.json`);
      let gamePath = null;

      if (fs.existsSync(profilePath)) {
        const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        gamePath = profileData?.juegos?.muck?.gamePath;
      }

      if (!gamePath) {
        gamePath = await findMuckExecutable();
      }

      if (!gamePath || !fs.existsSync(gamePath)) {
        return { success: false, installed: false };
      }

      const modStatus = isMuckModInstalled(gamePath);

      return {
        success: true,
        installed: modStatus.installed,
        bepinexInstalled: modStatus.bepinexInstalled,
        needsBepInEx: !modStatus.bepinexInstalled,
        needsTikControlMod: !modStatus.installed,
        missing: modStatus.missing
      };
    } catch (error) {
      return { success: false, installed: false, error: error.message };
    }
  });
}

/**
 * Función robusta de descarga con reintentos y seguimiento de redirecciones
 */
function downloadFile(url, dest, retries = 3) {
  return new Promise((resolve, reject) => {
    const attemptDownload = (attempt) => {
      console.log(`[Muck] 🌐 Descargando... (intento ${attempt}/${retries})`);

      const file = fs.createWriteStream(dest);
      const protocol = url.startsWith('https://') ? https : http;

      const request = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 60000 // 60 segundos timeout
      }, (response) => {
        // Seguir redirección
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          try { fs.unlinkSync(dest); } catch (e) { }
          console.log(`[Muck] 🔀 Siguiendo redirección a: ${response.headers.location}`);
          return downloadFile(response.headers.location, dest, retries).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(dest); } catch (e) { }

          if (attempt < retries) {
            console.log(`[Muck] ⚠️ Error HTTP ${response.statusCode}, reintentando...`);
            setTimeout(() => attemptDownload(attempt + 1), 3000);
          } else {
            return reject(new Error(`Error HTTP ${response.statusCode}`));
          }
          return;
        }

        // Mostrar progreso si hay Content-Length
        const totalBytes = parseInt(response.headers['content-length'], 10);
        let downloadedBytes = 0;

        if (totalBytes) {
          console.log(`[Muck] 📦 Tamaño total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
        }

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes && downloadedBytes % (1024 * 1024 * 5) < chunk.length) { // Log cada 5MB
            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            console.log(`[Muck] 📥 Descargado: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            console.log('[Muck] ✅ Descarga completada');
            resolve();
          });
        });

        file.on('error', (err) => {
          console.error('[Muck] ❌ Error escribiendo archivo:', err.message);
          try { fs.unlinkSync(dest); } catch (e) { }

          if (attempt < retries) {
            console.log('[Muck] ⚠️ Reintentando descarga...');
            setTimeout(() => attemptDownload(attempt + 1), 3000);
          } else {
            reject(err);
          }
        });
      });

      request.on('error', (err) => {
        console.error('[Muck] ❌ Error de red:', err.message);
        file.close();
        try { fs.unlinkSync(dest); } catch (e) { }

        if (attempt < retries) {
          console.log('[Muck] ⚠️ Reintentando descarga...');
          setTimeout(() => attemptDownload(attempt + 1), 3000);
        } else {
          reject(err);
        }
      });

      request.on('timeout', () => {
        console.error('[Muck] ⏱️ Timeout de descarga');
        request.destroy();
        file.close();
        try { fs.unlinkSync(dest); } catch (e) { }

        if (attempt < retries) {
          console.log('[Muck] ⚠️ Reintentando descarga...');
          setTimeout(() => attemptDownload(attempt + 1), 3000);
        } else {
          reject(new Error('Download timeout'));
        }
      });
    };

    attemptDownload(1);
  });
}

module.exports = {
  init,
  startTCPServer,
  disconnectFromMod,
  executeEffect
};

