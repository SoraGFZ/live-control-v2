// Módulo principal para gestionar Risk of Rain 2 + TikControl Mod
// Maneja la conexión, instalación y configuración del mod

const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const RoR2Service = require('./ror2Service');
const { resolveSetGamePathArgs, getActiveProfileId } = require('../setGamePathArgs');

let ror2Service = null;
let mainWindow = null;

const MOD_DOWNLOAD_URL = 'https://storage.tikcontrol.live/games/ror2/mod.zip';
const MOD_MANUAL_DOWNLOAD_URL = 'https://storage.tikcontrol.live/games/ror2/mod.zip';
const ROR2_EXE = 'Risk of Rain 2.exe';
const TIKCONTROL_PLUGIN_REL = path.join('BepInEx', 'plugins', 'TikControl', 'TikControl.dll');
const TIKCONTROL_MANIFEST = 'TikControl_RoR2Manifest.json';

let TIKCONTROL_EFFECTS = {};
let effectsLoaded = false;

function normalizeRoR2GameDir(candidatePath) {
  if (!candidatePath || !fs.existsSync(candidatePath)) return null;
  const stat = fs.statSync(candidatePath);
  const gameDir = stat.isDirectory() ? candidatePath : path.dirname(candidatePath);
  return fs.existsSync(path.join(gameDir, ROR2_EXE)) ? gameDir : null;
}

function getSavedRoR2GameDir(profileId = getActiveProfileId()) {
  try {
    if (!profileId) return null;
    const profilesModule = require('../../../modules/profiles');
    const profileData = profilesModule.getProfileData(profileId);
    return normalizeRoR2GameDir(profileData?.ror2?.gamePath);
  } catch (_) {
    return null;
  }
}

function findRoR2GameDir() {
  try {
    const { findGamePath } = require('../steamDetect');
    return normalizeRoR2GameDir(findGamePath('Risk of Rain 2', ROR2_EXE));
  } catch (_) {
    return null;
  }
}

function inspectRoR2Install(gameDir) {
  const normalizedDir = normalizeRoR2GameDir(gameDir);
  if (!normalizedDir) {
    return {
      gameFound: false,
      installed: false,
      complete: false,
      version: null,
      gamePath: null
    };
  }

  const bepInExPath = path.join(normalizedDir, 'BepInEx');
  const doorstopConfig = path.join(normalizedDir, 'doorstop_config.ini');
  const winhttpDll = path.join(normalizedDir, 'winhttp.dll');
  const modDllPath = path.join(normalizedDir, TIKCONTROL_PLUGIN_REL);
  const manifestPath = path.join(normalizedDir, TIKCONTROL_MANIFEST);
  const bepinexInstalled = fs.existsSync(bepInExPath) && fs.existsSync(doorstopConfig) && fs.existsSync(winhttpDll);
  const pluginInstalled = fs.existsSync(modDllPath);
  let version = null;

  if (fs.existsSync(manifestPath)) {
    try {
      version = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version || null;
    } catch (_) {}
  }

  return {
    gameFound: true,
    installed: bepinexInstalled && pluginInstalled,
    complete: bepinexInstalled && pluginInstalled,
    bepinexInstalled,
    pluginInstalled,
    version,
    gamePath: normalizedDir,
    path: modDllPath
  };
}

// Función para cargar efectos desde GamesCloud
async function loadEffectsFromCloud() {
  if (effectsLoaded) return TIKCONTROL_EFFECTS;

  try {
    const gamesCloud = require('../../../modules/auth/gamesCloudService');
    const commands = await gamesCloud.getGameCommands('ror2');

    if (commands?.result?.data?.[0]?.effects?.game) {
      TIKCONTROL_EFFECTS = commands.result.data[0].effects.game;
      effectsLoaded = true;
      console.log('[RoR2] ✅ Efectos cargados desde AWS:', Object.keys(TIKCONTROL_EFFECTS).length);
    }
  } catch (error) {
    console.warn('[RoR2] ⚠️ Error cargando desde AWS:', error.message);
  }

  return TIKCONTROL_EFFECTS;
}

function init(mainWin) {
  mainWindow = mainWin;

  // Inicializar servicio
  ror2Service = new RoR2Service();

  // ✅ Cargar efectos desde AWS de forma asíncrona
  loadEffectsFromCloud().then(effects => {
    // El servicio espera { game: { effects: {...} } }
    if (Object.keys(effects).length > 0) {
      ror2Service.loadEffectsFromJSON({ game: { effects } });
    }
  });

  // Reenviar eventos al renderer
  ror2Service.on('status', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ror2:status', status);
    }
  });

  ror2Service.on('connected', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ror2:connected', data);
    }
  });

  ror2Service.on('disconnected', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ror2:disconnected', data);
    }
  });

  ror2Service.on('effectsAvailable', (effects) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ror2:effectsAvailable', effects);
    }
  });

  ror2Service.on('effectExecuted', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ror2:effectExecuted', data);
    }
  });

  // Handlers IPC
  setupIPCHandlers();

  console.log('[RoR2] Módulo inicializado');
}

function setupIPCHandlers() {
  // Conectar al mod
  ipcMain.handle('ror2:connect', async (event, config) => {
    try {
      const result = await ror2Service.connect(config || {});
      return { success: result };
    } catch (e) {
      console.error('[RoR2] Error al conectar:', e);
      return { success: false, error: e.message };
    }
  });

  // Desconectar
  ipcMain.handle('ror2:disconnect', async () => {
    try {
      ror2Service.disconnect();
      return { success: true };
    } catch (e) {
      console.error('[RoR2] Error al desconectar:', e);
      return { success: false, error: e.message };
    }
  });

  // Obtener estado
  ipcMain.handle('ror2:getStatus', async () => {
    return ror2Service.getStatus();
  });

  // Ejecutar efecto
  ipcMain.handle('ror2:executeEffect', async (event, effectId, params) => {
    try {
      const result = await ror2Service.executeEffect(effectId, params);
      return result;
    } catch (e) {
      console.error('[RoR2] Error ejecutando efecto:', e);
      return { success: false, error: e.message };
    }
  });

  // Obtener efectos disponibles
  ipcMain.handle('ror2:getEffects', async () => {
    try {
      // ✅ Cargar desde GamesCloud (AWS S3)
      const effects = await loadEffectsFromCloud();

      // Convertir el objeto de efectos a un array
      const effectsArray = Object.keys(effects).map(effectId => {
        const effect = effects[effectId];
        return {
          id: effectId,
          name: effect.name,
          description: effect.description || '',
          category: effect.category || [],
          price: effect.price || 0,
          image: effect.image || '',
          duration: effect.duration?.value || 0
        };
      });

      console.log('[RoR2] Retornando efectos:', effectsArray.length);
      return { success: true, effects: effectsArray };
    } catch (e) {
      console.error('[RoR2] Error obteniendo efectos:', e);
      return { success: false, error: e.message, effects: [] };
    }
  });

  // Verificar si Risk of Rain 2 está ejecutándose
  ipcMain.handle('ror2:isRunning', async () => {
    return await isRoR2Running();
  });

  // Descargar e instalar mod
  const downloadAndInstallMod = async () => {
    try {
      // Verificar si el juego está corriendo
      const ror2Running = await isRoR2Running();
      if (ror2Running) {
        console.log('[RoR2] ⚠️ Risk of Rain 2 está ejecutándose');
        return {
          success: false,
          error: 'Risk of Rain 2 está ejecutándose. Cierra el juego e intenta de nuevo.',
          ror2Running: true
        };
      }

      let ror2Path = getSavedRoR2GameDir() || findRoR2GameDir();

      if (!ror2Path) {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Seleccionar carpeta de Risk of Rain 2',
          properties: ['openDirectory'],
          message: 'Selecciona la carpeta raiz donde esta instalado Risk of Rain 2'
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { success: false, canceled: true };
        }

        ror2Path = normalizeRoR2GameDir(result.filePaths[0]);
      }

      if (!ror2Path) {
        return {
          success: false,
          error: 'No se encontro Risk of Rain 2.exe en esta carpeta. Selecciona la carpeta raiz del juego.'
        };
      }

      // ✅ Verificar si BepInEx ya está completamente instalado (archivos clave)
      const bepInExPath = path.join(ror2Path, 'BepInEx');
      const doorstopConfig = path.join(ror2Path, 'doorstop_config.ini');
      const winhttpDll = path.join(ror2Path, 'winhttp.dll');

      const bepInExInstalled = fs.existsSync(bepInExPath) &&
        fs.existsSync(doorstopConfig) &&
        fs.existsSync(winhttpDll);

      const bepInExPluginsPath = path.join(ror2Path, 'BepInEx', 'plugins', 'TikControl');
      const modDllPath = path.join(ror2Path, TIKCONTROL_PLUGIN_REL);

      if (fs.existsSync(modDllPath) && bepInExInstalled) {
        // ✅ Mod completamente instalado - No hacer nada
        console.log('[RoR2] ✅ Mod ya instalado completamente');
        return {
          success: true,
          alreadyInstalled: true,
          complete: true,
          message: 'El mod ya está completamente instalado. No es necesario descargar nada.'
        };
      }

      // Si solo está el mod pero no BepInEx completo
      if (fs.existsSync(modDllPath) && !bepInExInstalled) {
        console.log('[RoR2] ⚠️ Instalación incompleta - Reinstalando');
        // Continuar con reinstalación automática
      }

      // Si BepInEx está instalado pero no el mod
      if (!fs.existsSync(modDllPath) && bepInExInstalled) {
        console.log('[RoR2] ℹ️ BepInEx detectado - Solo instalar mod');
        // Continuar solo instalando el mod
      }

      // Si nada está instalado
      if (!bepInExInstalled) {
        console.log('[RoR2] ⚠️ BepInEx no encontrado - Instalación completa');
        // Continuar con instalación completa
      }

      // Descargar el mod
      const fileName = path.basename(MOD_DOWNLOAD_URL).split('?')[0] || 'ror2mod.zip';
      const tempPath = path.join(app.getPath('temp'), fileName);

      // Notificar inicio de descarga
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ror2:downloadProgress', {
          status: 'downloading',
          message: 'Descargando TikControl mod para Risk of Rain 2...'
        });
      }

      await downloadFile(MOD_DOWNLOAD_URL, tempPath);

      // Extraer automáticamente el RAR
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ror2:downloadProgress', {
          status: 'extracting',
          message: 'Extrayendo archivos del mod...'
        });
      }

      // ✅ Extraer directamente en la carpeta raíz del juego
      // El ZIP contiene la estructura BepInEx/plugins/TikControl/...
      const extractResult = await extractRarFile(tempPath, ror2Path);

      if (!extractResult.success) {
        return {
          success: false,
          error: `Descarga completada pero falló la extracción: ${extractResult.error}`,
          downloadPath: tempPath
        };
      }

      // Guardar manifiesto en la raíz del juego
      const manifestPath = path.join(ror2Path, TIKCONTROL_MANIFEST);
      const manifest = {
        installedDate: new Date().toISOString(),
        files: extractResult.extractedFiles || [],
        version: 'v1.0.5',
        source: MOD_DOWNLOAD_URL
      };

      try {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      } catch (e) {
        console.warn('[RoR2] No se pudo guardar el manifiesto:', e);
      }

      // Eliminar el archivo ZIP temporal
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        console.warn('[RoR2] No se pudo eliminar el archivo temporal:', e);
      }

      return {
        success: true,
        downloadPath: tempPath,
        ror2Path: ror2Path,
        bepInExPath: bepInExPath,
        extractedFiles: extractResult.extractedFiles.length,
        message: `Mod TikControl instalado correctamente en BepInEx/plugins/TikControl/.`
      };

    } catch (e) {
      console.error('[RoR2] Error descargando mod:', e);
      return {
        success: false,
        error: e.message,
        manualUrl: MOD_MANUAL_DOWNLOAD_URL
      };
    }
  };

  // Registrar ambos handlers con la misma función
  ipcMain.handle('ror2:downloadMod', downloadAndInstallMod);
  ipcMain.handle('ror2:installMod', downloadAndInstallMod);

  // Desinstalar mod
  ipcMain.handle('ror2:uninstallMod', async () => {
    try {
      // Verificar si el juego está corriendo
      const ror2Running = await isRoR2Running();
      if (ror2Running) {
        console.log('[RoR2] ⚠️ Risk of Rain 2 está ejecutándose');
        return {
          success: false,
          error: 'Risk of Rain 2 está ejecutándose.',
          ror2Running: true
        };
      }

      // Pedir carpeta de RoR2
      const folderResult = await dialog.showOpenDialog(mainWindow, {
        title: 'Seleccionar carpeta de Risk of Rain 2',
        properties: ['openDirectory'],
        message: 'Selecciona la carpeta donde está instalado Risk of Rain 2'
      });

      if (folderResult.canceled) {
        return { success: false, canceled: true };
      }

      const ror2Path = normalizeRoR2GameDir(folderResult.filePaths[0]) || folderResult.filePaths[0];
      const manifestPath = path.join(ror2Path, TIKCONTROL_MANIFEST);

      // Lista de archivos y carpetas a eliminar (según especificación del usuario)
      const itemsToDelete = [
        { path: path.join(ror2Path, 'BepInEx'), type: 'dir' },
        { path: path.join(ror2Path, 'doorstop_config.ini'), type: 'file' },
        { path: path.join(ror2Path, 'winhttp.dll'), type: 'file' },
        { path: manifestPath, type: 'file' }
      ];

      let deletedCount = 0;
      let errors = [];

      for (const item of itemsToDelete) {
        try {
          if (fs.existsSync(item.path)) {
            if (item.type === 'dir') {
              fs.rmSync(item.path, { recursive: true, force: true });
              console.log(`[RoR2] ✅ Eliminada carpeta: ${path.basename(item.path)}`);
            } else {
              fs.unlinkSync(item.path);
              console.log(`[RoR2] ✅ Eliminado archivo: ${path.basename(item.path)}`);
            }
            deletedCount++;
          }
        } catch (err) {
          console.error(`[RoR2] ❌ Error eliminando ${item.path}:`, err.message);
          errors.push(`${path.basename(item.path)}: ${err.message}`);
        }
      }

      if (deletedCount === 0 && errors.length === 0) {
        return {
          success: true,
          message: 'No se encontraron archivos del mod para eliminar'
        };
      }

      if (errors.length > 0) {
        return {
          success: false,
          error: `Errores al eliminar: ${errors.join(', ')}`,
          deletedCount
        };
      }

      console.log(`[RoR2] ✅ Desinstalación completada: ${deletedCount} elementos eliminados`);

      return {
        success: true,
        message: `Mod desinstalado correctamente (${deletedCount} elementos eliminados)`,
        deleted: deletedCount
      };

    } catch (e) {
      console.error('[RoR2] Error en desinstalación:', e);
      return { success: false, error: e.message };
    }
  });

  // ✅ NUEVO: Obtener estado del mod
  ipcMain.handle('ror2:getModStatus', async () => {
    try {
      const gameDir = getSavedRoR2GameDir() || findRoR2GameDir();
      return inspectRoR2Install(gameDir);
    } catch (e) {
      console.error('[RoR2] Error obteniendo estado del mod:', e);
      return { gameFound: false, installed: false, complete: false, version: null };
    }
  });

  // ⚙️ NUEVO: Configurar ruta del juego
  ipcMain.handle('ror2:setGamePath', async (event, a, b) => {
    try {
      let { profileId, path: gamePath } = resolveSetGamePathArgs(a, b);
      const normalizedPath = normalizeRoR2GameDir(gamePath);
      if (!normalizedPath) {
        return { success: false, error: 'Ruta invalida. Selecciona Risk of Rain 2.exe o la carpeta raiz del juego.' };
      }
      if (!profileId) profileId = getActiveProfileId();
      if (!profileId) {
        console.error('[RoR2] ❌ profileId no proporcionado');
        return { success: false, error: 'No se proporcionó el ID del perfil' };
      }

      const profilesModule = require('../../../modules/profiles');
      const profileData = profilesModule.getProfileData(profileId);

      if (!profileData.ror2) {
        profileData.ror2 = {};
      }

      profileData.ror2.gamePath = normalizedPath;

      profilesModule.setProfileData(profileId, profileData);

      console.log('[RoR2] ✅ Ruta del juego guardada:', normalizedPath, 'en perfil:', profileId);

      return {
        success: true,
        message: 'Ruta del juego configurada correctamente',
        gamePath: normalizedPath
      };
    } catch (error) {
      console.error('[RoR2] ❌ Error guardando ruta:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // 📁 NUEVO: Obtener ruta del juego
  ipcMain.handle('ror2:getGamePath', async (event, profileId) => {
    try {
      if (!profileId) {
        return {
          success: true,
          gamePath: null
        };
      }

      const profilesModule = require('../../../modules/profiles');
      const profileData = profilesModule.getProfileData(profileId);
      const gamePath = normalizeRoR2GameDir(profileData?.ror2?.gamePath);

      return {
        success: true,
        gamePath: gamePath || null,
        path: gamePath || null
      };
    } catch (error) {
      console.error('[RoR2] ❌ Error obteniendo ruta:', error);
      return {
        success: false,
        gamePath: null,
        error: error.message
      };
    }
  });

  // 🔍 NUEVO: Buscar juego automáticamente
  ipcMain.handle('ror2:findGame', async () => {
    try {
      const gamePath = findRoR2GameDir();
      if (gamePath) {
        return {
          success: true,
          gamePath,
          message: 'Risk of Rain 2 encontrado automaticamente'
        };
      }
      return {
        success: false,
        gamePath: null,
        message: 'No se encontro Risk of Rain 2 en las bibliotecas de Steam. Selecciona la ruta manualmente.'
      };
    } catch (error) {
      console.error('[RoR2] ❌ Error buscando juego:', error);
      return {
        success: false,
        gamePath: null,
        error: error.message
      };
    }
  });

  // 📂 NUEVO: Abrir diálogo para seleccionar ejecutable
  ipcMain.handle('ror2:selectGamePath', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecciona la carpeta de Risk of Rain 2',
        defaultPath: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Risk of Rain 2',
        properties: ['openDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return {
          success: false,
          canceled: true,
          gamePath: null
        };
      }

      const selectedPath = normalizeRoR2GameDir(result.filePaths[0]);
      if (!selectedPath) {
        return {
          success: false,
          error: 'Ruta invalida. Selecciona la carpeta raiz donde esta Risk of Rain 2.exe.',
          gamePath: null
        };
      }
      console.log('[RoR2] 📁 Usuario seleccionó:', selectedPath);

      return {
        success: true,
        gamePath: selectedPath
      };

    } catch (error) {
      console.error('[RoR2] ❌ Error en diálogo:', error);
      return {
        success: false,
        error: error.message,
        gamePath: null
      };
    }
  });

  // 🎮 NUEVO: Lanzar juego con servidor automático
  ipcMain.handle('ror2:launchGame', async (event, profileId) => {
    try {
      console.log('[RoR2] 🚀 Iniciando proceso de lanzamiento...');

      // 1. Obtener la ruta configurada del perfil
      console.log('[RoR2] 📁 Paso 1: Obteniendo ruta configurada...');

      if (!profileId) {
        return {
          success: false,
          error: 'No se proporcionó el ID del perfil',
          hint: 'Por favor, recarga la aplicación'
        };
      }

      const profilesModule = require('../../../modules/profiles');
      const profileData = profilesModule.getProfileData(profileId);
      const configuredPath = normalizeRoR2GameDir(profileData?.ror2?.gamePath);

      if (!configuredPath) {
        return {
          success: false,
          error: 'No se ha configurado la ruta del juego',
          hint: 'Por favor, configura la ruta del juego en el botón "⚙️ Configurar Ruta"'
        };
      }

      if (!fs.existsSync(configuredPath)) {
        return {
          success: false,
          error: 'El ejecutable no existe en la ruta configurada',
          hint: 'Por favor, verifica la ruta en el botón "⚙️ Configurar Ruta"',
          path: configuredPath
        };
      }

      console.log('[RoR2] ✅ Ruta válida:', configuredPath);

      // 2. CERRAR servidor anterior si existe (para evitar EADDRINUSE)
      console.log('[RoR2] 📡 Paso 2: Verificando servidor existente...');

      if (ror2Service) {
        console.log('[RoR2] ⚠️ Servidor anterior detectado, cerrando...');
        try {
          await ror2Service.disconnect();
          ror2Service = null;
          console.log('[RoR2] ✅ Servidor anterior cerrado');
          // Esperar un poco para que el puerto se libere
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          console.warn('[RoR2] ⚠️ Error cerrando servidor anterior:', e.message);
        }
      }

      // 3. Iniciar servidor TCP
      console.log('[RoR2] 📡 Paso 3: Iniciando nuevo servidor TCP...');

      ror2Service = new RoR2Service();
      await ror2Service.connect();
      console.log('[RoR2] ✅ Servidor TCP activo en puerto 51337');

      // Esperar 1 segundo para asegurar que el servidor está listo
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 4. Lanzar el juego
      console.log('[RoR2] 🎮 Paso 4: Lanzando juego desde:', configuredPath);

      const { shell } = require('electron');
      try {
        await shell.openExternal('steam://rungameid/632360');
        console.log('[RoR2] ✅ Juego lanzado via Steam');
      } catch (_) {
        const exePath = fs.statSync(configuredPath).isDirectory()
          ? path.join(configuredPath, ROR2_EXE)
          : configuredPath;
        if (fs.existsSync(exePath)) {
          await shell.openPath(exePath);
          console.log('[RoR2] ✅ Juego lanzado directamente');
        } else {
          console.error('[RoR2] ❌ No se encontró el ejecutable');
        }
      }

      return {
        success: true,
        message: '✅ Servidor activo y juego iniciado\n💡 El mod se conectará automáticamente',
        gamePath: configuredPath
      };

    } catch (error) {
      console.error('[RoR2] ❌ Error en launchGame:', error);

      // Si el error es EADDRINUSE, dar un mensaje específico
      if (error.message && error.message.includes('EADDRINUSE')) {
        return {
          success: false,
          error: 'El puerto 51337 ya está en uso. Cerrando servidor anterior...',
          hint: 'Intenta lanzar el juego nuevamente en unos segundos'
        };
      }

      return {
        success: false,
        error: error.message
      };
    }
  });
}

// Verificar si Risk of Rain 2 está ejecutándose
async function isRoR2Running() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq Risk of Rain 2.exe"', (error, stdout) => {
      resolve(stdout.toLowerCase().includes('risk of rain 2.exe'));
    });
  });
}

// Descargar archivo con reintentos
function downloadFile(url, dest, retries = 3) {
  return new Promise((resolve, reject) => {
    const attemptDownload = (attempt) => {
      console.log(`[RoR2] 🌐 Descargando... (intento ${attempt}/${retries})`);

      const file = fs.createWriteStream(dest);
      const protocol = url.startsWith('https://') ? https : http;

      const request = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 30000 // 30 segundos timeout
      }, (response) => {
        // Seguir redirección
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          try { fs.unlinkSync(dest); } catch (e) {}
          return downloadFile(response.headers.location, dest, retries).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(dest); } catch (e) { }

          if (attempt < retries) {
            console.log(`[RoR2] ⚠️ Error HTTP ${response.statusCode}, reintentando...`);
            setTimeout(() => attemptDownload(attempt + 1), 2000);
          } else {
            return reject(new Error(`Error HTTP ${response.statusCode}`));
          }
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            console.log('[RoR2] ✅ Descarga completada');
            resolve();
          });
        });

        file.on('error', (err) => {
          console.error('[RoR2] ❌ Error escribiendo archivo:', err.message);
          try { fs.unlinkSync(dest); } catch (e) { }

          if (attempt < retries) {
            console.log('[RoR2] ⚠️ Reintentando descarga...');
            setTimeout(() => attemptDownload(attempt + 1), 2000);
          } else {
            reject(err);
          }
        });
      });

      request.on('error', (err) => {
        console.error('[RoR2] ❌ Error de red:', err.message);
        file.close();
        try { fs.unlinkSync(dest); } catch (e) { }

        if (attempt < retries) {
          console.log('[RoR2] ⚠️ Reintentando descarga...');
          setTimeout(() => attemptDownload(attempt + 1), 2000);
        } else {
          reject(err);
        }
      });

      request.on('timeout', () => {
        console.error('[RoR2] ⏱️ Timeout de descarga');
        request.destroy();
        file.close();
        try { fs.unlinkSync(dest); } catch (e) { }

        if (attempt < retries) {
          console.log('[RoR2] ⚠️ Reintentando descarga...');
          setTimeout(() => attemptDownload(attempt + 1), 2000);
        } else {
          reject(new Error('Timeout de descarga'));
        }
      });
    };

    attemptDownload(1);
  });
}

async function extractRarFile(zipPath, destPath) {
  return new Promise(async (resolve) => {
    console.log(`[RoR2] 📦 Intentando extraer: ${zipPath}`);
    console.log(`[RoR2] 📁 Destino: ${destPath}`);

    try {
      const isZip = zipPath.toLowerCase().endsWith('.zip');

      if (isZip) {
        const AdmZip = require('adm-zip');
        console.log('[RoR2] 🔧 Extrayendo ZIP con adm-zip...');
        const zip = new AdmZip(zipPath);
        const entries = zip.getEntries();
        const extractedFiles = [];

        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const fullPath = path.join(destPath, entry.entryName);
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, entry.getData());
          extractedFiles.push(entry.entryName);
          console.log(`[RoR2] ✅ Extraído: ${entry.entryName}`);
        }

        console.log(`[RoR2] ✅ Extracción ZIP completada: ${extractedFiles.length} archivos`);
        return resolve({ success: true, extractedFiles });
      }

      const unrar = require('node-unrar-js');
      console.log('[RoR2] 🔧 Usando node-unrar-js...');
      const buf = fs.readFileSync(zipPath);
      const extractor = unrar.createExtractorFromData({ data: buf });
      const extracted = extractor.extract();
      const files = [...extracted.files];
      console.log(`[RoR2] 📦 Archivos encontrados: ${files.length}`);

      const extractedFiles = [];
      for (const file of files) {
        if (file.extract && file.extract[1]) {
          const fileName = file.fileHeader.name;
          const fileData = file.extract[1];
          const fullPath = path.join(destPath, fileName);
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, Buffer.from(fileData));
          extractedFiles.push(fileName);
          console.log(`[RoR2] ✅ Extraído: ${fileName}`);
        }
      }

      console.log(`[RoR2] ✅ Extracción completada: ${extractedFiles.length} archivos`);
      return resolve({ success: true, extractedFiles });

    } catch (unrarError) {
      console.warn('[RoR2] ⚠️ Extracción nativa falló, intentando con herramientas del sistema...', unrarError.message);

      // Fallback: intentar con herramientas del sistema
      const extractCommands = [
        // 1. WinRAR (mejor soporte para RAR)
        {
          cmd: `"C:\\Program Files\\WinRAR\\WinRAR.exe" x -o+ -y "${zipPath}" "${destPath}\\"`,
          name: 'WinRAR',
          check: 'C:\\Program Files\\WinRAR\\WinRAR.exe'
        },
        // 2. 7-Zip del sistema (versión completa, soporta RAR)
        {
          cmd: `"C:\\Program Files\\7-Zip\\7z.exe" x "${zipPath}" -o"${destPath}" -y`,
          name: '7-Zip (Program Files)',
          check: 'C:\\Program Files\\7-Zip\\7z.exe'
        },
        // 3. 7-Zip x86
        {
          cmd: `"C:\\Program Files (x86)\\7-Zip\\7z.exe" x "${zipPath}" -o"${destPath}" -y`,
          name: '7-Zip (x86)',
          check: 'C:\\Program Files (x86)\\7-Zip\\7z.exe'
        }
      ];

      // Intentar cada comando
      let lastError = unrarError.message;
      let commandIndex = 0;

      const tryNextCommand = () => {
        if (commandIndex >= extractCommands.length) {
          // No hay más comandos, devolver error
          console.error('[RoR2] ❌ No se pudo extraer con ninguna herramienta');
          return resolve({
            success: false,
            error: `No se pudo extraer el archivo.\n\nErrores:\n- node-unrar-js: ${unrarError.message}\n- Herramientas del sistema: ${lastError}`,
            downloadPath: zipPath
          });
        }

        const current = extractCommands[commandIndex];
        commandIndex++;

        // Verificar si la herramienta existe
        if (!fs.existsSync(current.check)) {
          console.log(`[RoR2] ⚠️ ${current.name} no encontrado, probando siguiente...`);
          return tryNextCommand();
        }

        console.log(`[RoR2] 🔧 Intentando con ${current.name}...`);

        exec(current.cmd, (error, stdout, stderr) => {
          if (error) {
            console.error(`[RoR2] ❌ Error con ${current.name}:`, error.message);
            lastError = error.message;
            return tryNextCommand();
          }

          console.log(`[RoR2] ✅ Extracción completada con ${current.name}`);

          // Escanear archivos extraídos
          const extractedFiles = [];
          try {
            const scanDir = (dir) => {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  scanDir(fullPath);
                } else {
                  extractedFiles.push(path.relative(destPath, fullPath));
                }
              }
            };
            scanDir(destPath);
          } catch (e) {
            console.warn('[RoR2] ⚠️ No se pudo escanear archivos extraídos:', e.message);
          }

          return resolve({
            success: true,
            extractedFiles: extractedFiles
          });
        });
      };

      tryNextCommand();
    }
  });
}

function cleanup() {
  if (ror2Service) {
    ror2Service.cleanup();
    ror2Service = null;
  }
}

module.exports = {
  init,
  cleanup,
  getService: () => ror2Service
};

