/**
 * Módulo de Megabonk
 * Gestiona la integración con el mod de BepInEx para Megabonk
 * Puerto TCP: 62626
 */

const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const net = require('net');
const AdmZip = require('adm-zip');
const https = require('https');
const http = require('http');
const createMegabonkService = require('./megabonkService');
const { resolveDir } = require('../steamDetect');

/** Debe coincidir con store.steampowered.com/app/3405340 (Megabonk) */
const STEAM_APP_ID = '3405340';

// ✅ Cargar efectos desde GamesCloud (AWS S3) - eliminada dependencia local
let MEGABONK_EFFECTS = [];
let effectsLoaded = false;

const LEGACY_EFFECT_ALIASES = {
  add_level: 'addLevel',
  add_xp: 'addXP',
  heal_player: 'healPlayer',
  spawn_chest: 'spawnChest',
  spawn_free_chest: 'spawnChest',
  freeze_player: 'playerStatus_FreezePlayer',
  random_teleport: 'teleportPlayer',
  kill_enemies: 'nukeEnemies'
};

let effectAliasMap = null;

function getLocalCommandsPath() {
  return path.join(__dirname, '..', '..', 'aws', 'megabonk', 'commands.json');
}

function toSnakeCaseEffectId(id) {
  return String(id || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[_\s-]+/g, '_')
    .toLowerCase();
}

function mapCommandsToEffects(commands) {
  if (!commands?.effects || typeof commands.effects !== 'object' || Array.isArray(commands.effects)) {
    return [];
  }

  return Object.entries(commands.effects).map(([id, effect]) => ({
    id,
    name: effect.name?.public || effect.name || id,
    description: effect.description || '',
    category: Array.isArray(effect.category) ? effect.category[0] : (effect.category || 'General'),
    image: effect.image || '',
    price: effect.price || 0,
    duration: effect.duration?.value || effect.duration || 0,
    quantity: effect.quantity || null,
    inactive: effect.inactive || false
  }));
}

function loadEffectsFromLocalCatalog() {
  const localPath = getLocalCommandsPath();
  if (!fs.existsSync(localPath)) return [];

  try {
    const commands = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    return mapCommandsToEffects(commands);
  } catch (error) {
    console.warn('[Megabonk] ⚠️ Error leyendo catálogo local:', error.message);
    return [];
  }
}

function getEffectAliasMap() {
  if (effectAliasMap) return effectAliasMap;

  effectAliasMap = new Map();
  for (const [legacyId, realId] of Object.entries(LEGACY_EFFECT_ALIASES)) {
    effectAliasMap.set(legacyId, realId);
  }

  const localPath = getLocalCommandsPath();
  if (fs.existsSync(localPath)) {
    try {
      const commands = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      for (const id of Object.keys(commands.effects || {})) {
        effectAliasMap.set(id, id);
        effectAliasMap.set(String(id).toLowerCase(), id);
        effectAliasMap.set(toSnakeCaseEffectId(id), id);
      }
    } catch (error) {
      console.warn('[Megabonk] ⚠️ Error creando alias de efectos:', error.message);
    }
  }

  return effectAliasMap;
}

function normalizeEffectId(effectId) {
  const rawId = String(effectId || '').trim();
  const aliases = getEffectAliasMap();
  return aliases.get(rawId) || aliases.get(rawId.toLowerCase()) || rawId;
}

function normalizeGameDir(candidatePath) {
  if (!candidatePath || typeof candidatePath !== 'string' || !fs.existsSync(candidatePath)) return null;
  const gameDir = resolveDir(candidatePath);
  return fs.existsSync(path.join(gameDir, 'Megabonk.exe')) ? gameDir : null;
}

// Función para cargar efectos desde GamesCloud
async function loadEffectsFromCloud() {
  if (effectsLoaded) return MEGABONK_EFFECTS;

  try {
    const gamesCloud = require('../../../modules/auth/gamesCloudService');
    const commands = await gamesCloud.getGameCommands('megabonk');

    const cloudEffects = mapCommandsToEffects(commands);
    if (cloudEffects.length) {
      MEGABONK_EFFECTS = cloudEffects;
      effectsLoaded = true;
      console.log('[Megabonk] ✅ Efectos cargados desde AWS:', MEGABONK_EFFECTS.length);
    }
  } catch (error) {
    console.warn('[Megabonk] ⚠️ Error cargando desde AWS:', error.message);
  }

  if (!MEGABONK_EFFECTS.length) {
    const localEffects = loadEffectsFromLocalCatalog();
    if (localEffects.length) {
      MEGABONK_EFFECTS = localEffects;
      effectsLoaded = true;
      console.log('[Megabonk] ✅ Efectos cargados desde catálogo local:', MEGABONK_EFFECTS.length);
    }
  }

  return MEGABONK_EFFECTS;
}

// URL del mod oficial de Megabonk
// Incluye BepInEx + el framework completo del mod
const MOD_DOWNLOAD_URL = 'https://storage.tikcontrol.live/games/megabonk/mod.zip';

// Archivos/carpetas a eliminar durante la desinstalación del mod de TikControl
const MOD_FILES_TO_DELETE = [
  'BepInEx/plugins/TikControl',           // Mod de TikControl

];

// Archivos/carpetas a eliminar durante la desinstalación completa de BepInEx
const MOD_UNINSTALL_FILES = [
  'BepInEx',                 // Carpeta completa de BepInEx
  'dotnet',                  // Carpeta dotnet
  '.doorstop_version',       // Archivo de versión
  'changelog.txt',           // Changelog del mod
  'doorstop_config.ini',     // Configuración de doorstop
  'winhttp.dll'              // DLL de carga de BepInEx
];

// Rutas comunes donde puede estar Megabonk
const COMMON_PATHS = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Megabonk',
  'C:\\Program Files\\Steam\\steamapps\\common\\Megabonk',
  'D:\\SteamLibrary\\steamapps\\common\\Megabonk',
  'E:\\SteamLibrary\\steamapps\\common\\Megabonk',
  'F:\\SteamLibrary\\steamapps\\common\\Megabonk'
];

let mainWindow = null;
let cachedGamePath = null;
let megabonkService = null;
let isConnected = false;

/**
 * Busca el ejecutable de Megabonk
 * @param {string} profileId - ID del perfil (opcional)
 */
async function findMegabonkExecutable(profileId = null) {
  // 1. Verificar caché en memoria
  if (cachedGamePath && fs.existsSync(cachedGamePath)) {
    return cachedGamePath;
  }

  // 2. Buscar en la configuración del perfil si se proporciona
  if (profileId) {
    const profilePath = path.join(app.getPath('userData'), 'profiles', `${profileId}.json`);
    if (fs.existsSync(profilePath)) {
      try {
        const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        const savedPath = profileData?.juegos?.megabonk?.gamePath;

        if (savedPath && fs.existsSync(savedPath)) {
          cachedGamePath = savedPath;
          console.log('[Megabonk] ✅ Ejecutable encontrado en perfil:', savedPath);
          return savedPath;
        }
      } catch (e) {
        console.error('[Megabonk] Error leyendo perfil:', e.message);
      }
    }
  }

  // 3. Buscar en rutas comunes predeterminadas
  for (const basePath of COMMON_PATHS) {
    const exePath = path.join(basePath, 'Megabonk.exe');
    if (fs.existsSync(exePath)) {
      cachedGamePath = exePath;
      console.log('[Megabonk] ✅ Ejecutable encontrado en ruta predeterminada:', exePath);
      return exePath;
    }
  }

  console.log('[Megabonk] ⚠️ Ejecutable no encontrado. Usa "Configurar Ruta" para especificar la ubicación.');
  return null;
}

/**
 * Iniciar servicio TCP (escucha en puerto 62626 para TikControl)
 */
function startTCPServer() {
  if (megabonkService) {
    console.log('[Megabonk] ⚠️ Servicio ya está activo');
    return;
  }

  megabonkService = createMegabonkService();
  megabonkService.start();

  // Eventos del servicio
  megabonkService.on('connected', () => {
    isConnected = true;
    if (mainWindow) {
      mainWindow.webContents.send('megabonk:status', { connected: true });
    }
    console.log('[Megabonk] ✅ Conectado al mod');
  });

  megabonkService.on('disconnected', () => {
    isConnected = false;
    if (mainWindow) {
      mainWindow.webContents.send('megabonk:status', { connected: false });
    }
    console.log('[Megabonk] 🔌 Desconectado del mod');
  });

  console.log('[Megabonk] ✅ Servicio TikControl iniciado (puerto 62626)');
}

/**
 * Detener servidor y desconectar
 */
function disconnectFromMod() {
  if (megabonkService) {
    megabonkService.stop();
    megabonkService = null;
  }

  isConnected = false;
  console.log('[Megabonk] 🔌 Servicio detenido');
}

/**
 * Ejecutar un efecto
 */
async function executeEffect(effectId, username = 'TikControl', duration = 0, quantity = 0) {
  if (!isConnected || !megabonkService) {
    console.log('[Megabonk] ❌ No hay conexión con el mod');
    return { success: false, error: 'Not connected' };
  }

  try {
    const normalizedEffectId = normalizeEffectId(effectId);
    if (normalizedEffectId !== effectId) {
      console.log('[Megabonk] 🔁 Alias de efecto:', effectId, '→', normalizedEffectId);
    }

    console.log('[Megabonk] 📤 Enviando efecto:', { effectId: normalizedEffectId, username, duration, quantity });
    const result = await megabonkService.executeEffect(normalizedEffectId, {
      username,
      duration,
      quantity
    });

    return { success: true, message: result.message };
  } catch (error) {
    console.error('[Megabonk] ❌ Error ejecutando efecto:', error.message);
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

  console.log('[Megabonk] ✅ Módulo inicializado');
  console.log('[Megabonk] 💡 Escuchando en puerto 62626');
}

/**
 * Configurar handlers IPC
 */
function setupIPCHandlers() {
  // Conectar al juego
  ipcMain.handle('megabonk:connect', async () => {
    try {
      // El servidor ya está activo, solo verificamos el estado
      return {
        success: true,
        connected: isConnected,
        message: isConnected ? 'Mod ya conectado' : 'Servidor activo, esperando al mod...'
      };
    } catch (error) {
      console.error('[Megabonk] ❌ Error al verificar conexión:', error);
      return { success: false, error: error.message };
    }
  });

  // Desconectar
  ipcMain.handle('megabonk:disconnect', async () => {
    try {
      disconnectFromMod();
      return { success: true };
    } catch (error) {
      console.error('[Megabonk] ❌ Error al desconectar:', error);
      return { success: false, error: error.message };
    }
  });

  // Lanzar juego
  ipcMain.handle('megabonk:launchGame', async (event, profileId) => {
    try {
      // Obtener ruta del juego del perfil
      const profilePath = path.join(require('electron').app.getPath('userData'), 'profiles', `${profileId}.json`);
      let gamePath = null;

      if (fs.existsSync(profilePath)) {
        const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        gamePath = profileData?.juegos?.megabonk?.gamePath;
      }

      if (!gamePath) {
        gamePath = await findMegabonkExecutable(profileId);
      }

      if (!gamePath || !fs.existsSync(gamePath)) {
        return { success: false, error: 'Game not found' };
      }

      const gameDir = normalizeGameDir(gamePath);
      if (!gameDir) {
        return { success: false, error: 'Ruta invalida. Selecciona la carpeta raiz donde esta Megabonk.exe.' };
      }
      const { spawn } = require('child_process');

      // Verificar si BepInEx está instalado
      const bepinexInstalled = fs.existsSync(path.join(gameDir, 'BepInEx')) &&
        (fs.existsSync(path.join(gameDir, 'winhttp.dll')) ||
          fs.existsSync(path.join(gameDir, 'doorstop_config.ini')));

      if (!bepinexInstalled) {
        console.log('[Megabonk] ⚠️ BepInEx no detectado en:', gameDir);
        return {
          success: false,
          error: 'BepInEx not installed',
          hint: 'Por favor, instala el mod primero usando el botón "Instalar Mod"'
        };
      }

      console.log('[Megabonk] ✅ BepInEx detectado, lanzando juego...');

      try {
        const { shell } = require('electron');
        try {
          await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
          console.log('[Megabonk] ✅ Juego lanzado via Steam');
        } catch (_) {
          const exePath = fs.statSync(gamePath).isDirectory()
            ? path.join(gameDir, 'Megabonk.exe')
            : gamePath;
          if (fs.existsSync(exePath)) {
            await shell.openPath(exePath);
            console.log('[Megabonk] ✅ Juego lanzado directamente');
          } else {
            return { success: false, error: 'No se encontró el ejecutable' };
          }
        }
      } catch (error) {
        console.error('[Megabonk] ❌ Error al lanzar:', error);
        return {
          success: false,
          error: `Error al lanzar: ${error.message}`,
          hint: 'Intenta lanzar el juego manualmente para verificar que funciona'
        };
      }

      // El mod se conectará automáticamente al servidor TCP
      console.log('[Megabonk] ⏳ Esperando a que el mod se conecte automáticamente...');

      return { success: true, gamePath };
    } catch (error) {
      console.error('[Megabonk] ❌ Error al lanzar juego:', error);
      return { success: false, error: error.message };
    }
  });

  // Configurar ruta del juego
  ipcMain.handle('megabonk:setGamePath', async (event, profileId, gamePath) => {
    try {
      const profilePath = path.join(require('electron').app.getPath('userData'), 'profiles', `${profileId}.json`);

      let profileData = {};
      if (fs.existsSync(profilePath)) {
        profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      }

      const normalizedPath = normalizeGameDir(gamePath);
      if (!normalizedPath) {
        return { success: false, error: 'Ruta invalida. Selecciona la carpeta raiz donde esta Megabonk.exe.' };
      }

      if (!profileData.juegos) profileData.juegos = {};
      if (!profileData.juegos.megabonk) profileData.juegos.megabonk = {};
      profileData.juegos.megabonk.gamePath = normalizedPath;

      fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
      cachedGamePath = normalizedPath;

      return { success: true, gamePath: normalizedPath };
    } catch (error) {
      console.error('[Megabonk] ❌ Error al guardar ruta:', error);
      return { success: false, error: error.message };
    }
  });

  // Obtener ruta del juego
  ipcMain.handle('megabonk:getGamePath', async (event, profileId) => {
    try {
      const profilePath = path.join(require('electron').app.getPath('userData'), 'profiles', `${profileId}.json`);

      if (fs.existsSync(profilePath)) {
        const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        const gamePath = profileData?.juegos?.megabonk?.gamePath;

        const normalizedPath = normalizeGameDir(gamePath);
        if (normalizedPath) {
          return { success: true, gamePath: normalizedPath };
        }
      }

      // Intentar encontrar automáticamente
      const foundPath = await findMegabonkExecutable(profileId);
      return foundPath ? { success: true, gamePath: foundPath } : { success: false };
    } catch (error) {
      console.error('[Megabonk] ❌ Error al obtener ruta:', error);
      return { success: false, error: error.message };
    }
  });

  // Buscar juego
  ipcMain.handle('megabonk:findGame', async (event, profileId) => {
    try {
      const foundPath = await findMegabonkExecutable(profileId);
      return foundPath ? { success: true, gamePath: foundPath } : { success: false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Seleccionar ruta manualmente
  ipcMain.handle('megabonk:selectGamePath', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecciona la carpeta de Megabonk',
        properties: ['openDirectory']
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true, gamePath: null };
      }

      const normalizedPath = normalizeGameDir(result.filePaths[0]);
      if (!normalizedPath) {
        return { success: false, error: 'Ruta invalida. Selecciona la carpeta raiz donde esta Megabonk.exe.', gamePath: null };
      }

      return { success: true, gamePath: normalizedPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Obtener estado
  ipcMain.handle('megabonk:getStatus', async () => {
    return {
      success: true,
      connected: isConnected
    };
  });

  // Ejecutar efecto
  ipcMain.handle('megabonk:executeEffect', async (event, params) => {
    try {
      const effectId = params?.effectId || params;
      const username = params?.username || 'TikControl';
      const duration = params?.duration || 0;
      const quantity = params?.quantity || 0;

      return executeEffect(effectId, username, duration, quantity);
    } catch (error) {
      console.error('[Megabonk] ❌ Error ejecutando efecto:', error);
      return { success: false, error: error.message };
    }
  });

  // Obtener lista de efectos
  ipcMain.handle('megabonk:getEffects', async () => {
    try {
      console.log('[Megabonk] 📋 Solicitando lista de efectos');

      // ✅ Cargar desde GamesCloud (AWS S3)
      const effects = await loadEffectsFromCloud();

      if (!effects || effects.length === 0) {
        console.warn('[Megabonk] ⚠️ No hay efectos disponibles');
        return { success: false, error: 'No effects loaded', effects: [] };
      }

      return { success: true, effects };
    } catch (error) {
      console.error('[Megabonk] ❌ Error obteniendo efectos:', error);
      return { success: false, error: error.message, effects: [] };
    }
  });

  // Instalar mod
  ipcMain.handle('megabonk:installMod', async (event, profileId) => {
    try {
      // Verificar que la URL del mod esté configurada
      if (!MOD_DOWNLOAD_URL) {
        return {
          success: false,
          error: 'Mod URL not configured',
          hint: 'El mod debe estar disponible en storage.tikcontrol.live/games/megabonk/mod.zip'
        };
      }

      // Obtener ruta del juego del perfil
      const profilePath = path.join(require('electron').app.getPath('userData'), 'profiles', `${profileId}.json`);
      let gamePath = null;

      if (fs.existsSync(profilePath)) {
        const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        gamePath = profileData?.juegos?.megabonk?.gamePath;
      }

      if (!gamePath) {
        gamePath = await findMegabonkExecutable(profileId);
      }

      if (!gamePath || !fs.existsSync(gamePath)) {
        return { success: false, error: 'Game path not found' };
      }

      const gameDir = normalizeGameDir(gamePath);
      if (!gameDir) {
        return { success: false, error: 'Ruta invalida. Selecciona la carpeta raiz donde esta Megabonk.exe.' };
      }
      const tempZip = path.join(app.getPath('temp'), 'megabonk_mod_full.zip');

      console.log('[Megabonk] 📥 Descargando mod completo desde:', MOD_DOWNLOAD_URL);
      console.log('[Megabonk] 📦 Incluye: BepInEx 6 + Mod base de Megabonk');

      // Descargar ZIP con sistema robusto (reintentos + redirecciones)
      await downloadFile(MOD_DOWNLOAD_URL, tempZip);

      console.log('[Megabonk] 📦 Extrayendo mod completo al directorio del juego...');

      // Extraer ZIP
      const zip = new AdmZip(tempZip);
      zip.extractAllTo(gameDir, true);

      // Eliminar ZIP temporal
      try {
        fs.unlinkSync(tempZip);
        console.log('[Megabonk] 🗑️ Archivo temporal eliminado');
      } catch (e) {
        console.log('[Megabonk] ⚠️ No se pudo eliminar archivo temporal:', e.message);
      }

      console.log('[Megabonk] ✅ Mod instalado correctamente');
      console.log('[Megabonk] 📂 Carpetas instaladas: BepInEx/, dotnet/');
      console.log('[Megabonk] 📄 Archivos instalados: winhttp.dll, doorstop_config.ini, etc.');
      console.log('[Megabonk] 💡 El juego cargará BepInEx automáticamente al iniciarse');

      return { success: true };
    } catch (error) {
      console.error('[Megabonk] ❌ Error instalando mod:', error);
      return { success: false, error: error.message };
    }
  });

  // Desinstalar mod
  ipcMain.handle('megabonk:uninstallMod', async (event, profileId) => {
    try {
      // Obtener ruta del juego del perfil
      const profilePath = path.join(require('electron').app.getPath('userData'), 'profiles', `${profileId}.json`);
      let gamePath = null;

      if (fs.existsSync(profilePath)) {
        const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        gamePath = profileData?.juegos?.megabonk?.gamePath;
      }

      if (!gamePath) {
        gamePath = await findMegabonkExecutable(profileId);
      }

      if (!gamePath || !fs.existsSync(gamePath)) {
        return { success: false, error: 'Game path not found' };
      }

      const gameDir = normalizeGameDir(gamePath);
      if (!gameDir) {
        return { success: false, error: 'Ruta invalida. Selecciona la carpeta raiz donde esta Megabonk.exe.' };
      }

      console.log('[Megabonk] 🗑️ Iniciando desinstalación completa del mod...');
      console.log('[Megabonk] 📋 Se eliminarán:', MOD_UNINSTALL_FILES.join(', '));

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
            console.log('[Megabonk] 🗑️ Carpeta eliminada:', item);
            deletedCount++;
          } else {
            // Eliminar archivo
            fs.unlinkSync(itemPath);
            console.log('[Megabonk] 🗑️ Archivo eliminado:', item);
            deletedCount++;
          }
        } else {
          console.log('[Megabonk] ⚠️ No encontrado (ya eliminado):', item);
          notFoundCount++;
        }
      }

      console.log('[Megabonk] ✅ Desinstalación completada');
      console.log(`[Megabonk] 📊 Eliminados: ${deletedCount}, No encontrados: ${notFoundCount}`);
      console.log('[Megabonk] 🎮 El juego volverá a su estado original');

      return { success: true };
    } catch (error) {
      console.error('[Megabonk] ❌ Error desinstalando mod:', error);
      return { success: false, error: error.message };
    }
  });

  // Verificar si el juego está ejecutándose
  ipcMain.handle('megabonk:checkGameStatus', async () => {
    try {
      return new Promise((resolve) => {
        exec('tasklist /FI "IMAGENAME eq Megabonk.exe"', (error, stdout) => {
          const isRunning = stdout.toLowerCase().includes('megabonk.exe');
          resolve({
            success: true,
            running: isRunning,
            message: isRunning ? 'Megabonk está ejecutándose' : 'Megabonk no está ejecutándose'
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
  ipcMain.handle('megabonk:checkModStatus', async (event, profileId) => {
    try {
      // Obtener ruta del juego del perfil
      const profilePath = path.join(require('electron').app.getPath('userData'), 'profiles', `${profileId}.json`);
      let gamePath = null;

      if (fs.existsSync(profilePath)) {
        const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        gamePath = profileData?.juegos?.megabonk?.gamePath;
      }

      if (!gamePath) {
        gamePath = await findMegabonkExecutable(profileId);
      }

      if (!gamePath || !fs.existsSync(gamePath)) {
        return { success: false, installed: false };
      }

      const gameDir = normalizeGameDir(gamePath);
      if (!gameDir) {
        return { success: false, installed: false };
      }
      const bepinexPath = path.join(gameDir, 'BepInEx');
      const winHttpPath = path.join(gameDir, 'winhttp.dll');
      const tikcontrolModCandidates = [
        path.join(gameDir, 'BepInEx', 'plugins', 'TikControlMod_Megabonk.dll'),
        path.join(gameDir, 'BepInEx', 'plugins', 'TikControl', 'TikControlMod_Megabonk.dll')
      ];

      const bepinexInstalled = fs.existsSync(bepinexPath) && fs.existsSync(winHttpPath);
      const tikcontrolModInstalled = tikcontrolModCandidates.some((file) => fs.existsSync(file));

      return {
        success: true,
        installed: tikcontrolModInstalled,
        bepinexInstalled: bepinexInstalled,
        needsBepInEx: !bepinexInstalled,
        needsTikControlMod: !tikcontrolModInstalled
      };
    } catch (error) {
      return { success: false, installed: false, error: error.message };
    }
  });
}

/**
 * Función robusta de descarga con reintentos y seguimiento de redirecciones
 * (Basada en el sistema de ROR2)
 */
function downloadFile(url, dest, retries = 3) {
  return new Promise((resolve, reject) => {
    const attemptDownload = (attempt) => {
      console.log(`[Megabonk] 🌐 Descargando... (intento ${attempt}/${retries})`);

      const file = fs.createWriteStream(dest);
      const protocol = url.startsWith('https://') ? https : http;

      const request = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 60000 // 60 segundos timeout (archivo más grande que ROR2)
      }, (response) => {
        // Seguir redirección
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          try { fs.unlinkSync(dest); } catch (e) { }
          console.log(`[Megabonk] 🔀 Siguiendo redirección a: ${response.headers.location}`);
          return downloadFile(response.headers.location, dest, retries).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(dest); } catch (e) { }

          if (attempt < retries) {
            console.log(`[Megabonk] ⚠️ Error HTTP ${response.statusCode}, reintentando...`);
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
          console.log(`[Megabonk] 📦 Tamaño total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
        }

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes && downloadedBytes % (1024 * 1024 * 5) < chunk.length) { // Log cada 5MB
            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            console.log(`[Megabonk] 📥 Descargado: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            console.log('[Megabonk] ✅ Descarga completada');
            resolve();
          });
        });

        file.on('error', (err) => {
          console.error('[Megabonk] ❌ Error escribiendo archivo:', err.message);
          try { fs.unlinkSync(dest); } catch (e) { }

          if (attempt < retries) {
            console.log('[Megabonk] ⚠️ Reintentando descarga...');
            setTimeout(() => attemptDownload(attempt + 1), 3000);
          } else {
            reject(err);
          }
        });
      });

      request.on('error', (err) => {
        console.error('[Megabonk] ❌ Error de red:', err.message);
        file.close();
        try { fs.unlinkSync(dest); } catch (e) { }

        if (attempt < retries) {
          console.log('[Megabonk] ⚠️ Reintentando descarga...');
          setTimeout(() => attemptDownload(attempt + 1), 3000);
        } else {
          reject(err);
        }
      });

      request.on('timeout', () => {
        console.error('[Megabonk] ⏱️ Timeout de descarga');
        request.destroy();
        file.close();
        try { fs.unlinkSync(dest); } catch (e) { }

        if (attempt < retries) {
          console.log('[Megabonk] ⚠️ Reintentando descarga...');
          setTimeout(() => attemptDownload(attempt + 1), 3000);
        } else {
          reject(new Error('Download timeout'));
        }
      });
    };

    attemptDownload(1);
  });
}

// ❌ NO inicializar automáticamente - esperar a que main.js llame .init()
// setupIPCHandlers(); <- Removido, ahora se llama desde init()

module.exports = {
  init,
  startTCPServer,
  disconnectFromMod,
  executeEffect
};

