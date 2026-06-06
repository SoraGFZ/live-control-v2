/**
 * Módulo de Tricky Towers
 * Gestiona la integración con el mod de efectos para Tricky Towers
 * Similar a RoR2 pero con efectos específicos de Tricky Towers
 */

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

/** Debe coincidir con store.steampowered.com/app/437920 (Tricky Towers) */
const STEAM_APP_ID = '437920';

// ✅ Cargar efectos desde GamesCloud (AWS S3) - eliminada dependencia local
let GAME_EFFECTS = [];
let effectsLoaded = false;

// Función para cargar efectos desde GamesCloud
async function loadEffectsFromCloud() {
  if (effectsLoaded) return GAME_EFFECTS;

  try {
    const gamesCloud = require('../../../modules/auth/gamesCloudService');
    const commands = await gamesCloud.getGameCommands('tricky-towers');

    if (commands?.[0]?.result?.data?.[0]?.effects?.game) {
      const gameEffects = commands[0].result.data[0].effects.game;
      GAME_EFFECTS = Object.entries(gameEffects).map(([id, effect]) => ({
        id,
        name: effect.name?.public || effect.name || id,
        description: effect.description || '',
        category: Array.isArray(effect.category) ? effect.category[0] : 'General',
        price: effect.price || 0,
        duration: effect.duration?.value || 0
      }));
      effectsLoaded = true;
      console.log('[Tricky Towers] ✅ Efectos cargados desde AWS:', GAME_EFFECTS.length);
    }
  } catch (error) {
    console.warn('[Tricky Towers] ⚠️ Error cargando desde AWS:', error.message);
  }

  return GAME_EFFECTS;
}

// URLs del mod
const MOD_DOWNLOAD_URL = 'https://storage.tikcontrol.live/games/tricky-towers/mod.zip';
const TRICKY_EXE = 'TrickyTowers.exe';
const TRICKY_REQUIRED_MOD_FILES = [
  'MelonLoader',
  'Mods/ML.CC.dll',
  'UserLibs',
  'version.dll'
];

// Rutas comunes donde puede estar Tricky Towers
const COMMON_PATHS = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\TrickyTowers',
  'C:\\Program Files\\Steam\\steamapps\\common\\TrickyTowers',
  'D:\\SteamLibrary\\steamapps\\common\\TrickyTowers',
  'E:\\SteamLibrary\\steamapps\\common\\TrickyTowers',
  'F:\\SteamLibrary\\steamapps\\common\\TrickyTowers'
];

let mainWindow = null;
let cachedGamePath = null; // Cache de la ruta del juego

function normalizeTrickyGameDir(candidatePath) {
  if (!candidatePath || !fs.existsSync(candidatePath)) return null;
  const stat = fs.statSync(candidatePath);
  const gameDir = stat.isDirectory() ? candidatePath : path.dirname(candidatePath);
  return fs.existsSync(path.join(gameDir, TRICKY_EXE)) ? gameDir : null;
}

function isTrickyModInstalled(gameDir) {
  const normalizedDir = normalizeTrickyGameDir(gameDir);
  return !!normalizedDir && TRICKY_REQUIRED_MOD_FILES.every(file => fs.existsSync(path.join(normalizedDir, file)));
}

/**
 * Busca el ejecutable de Tricky Towers
 */
async function findTrickyTowersExecutable() {
  // Si ya tenemos la ruta en cache, verificar que sigue existiendo
  if (cachedGamePath && fs.existsSync(cachedGamePath)) {
    return cachedGamePath;
  }

  console.log('[Tricky Towers] 🔍 Buscando ejecutable del juego...');

  // 1. Buscar en rutas comunes
  for (const basePath of COMMON_PATHS) {
    const exePath = path.join(basePath, 'TrickyTowers.exe');
    if (fs.existsSync(exePath)) {
      console.log('[Tricky Towers] ✅ Juego encontrado en:', exePath);
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
      const mainLibPath = path.join(steamPath, 'steamapps', 'common', 'TrickyTowers', 'TrickyTowers.exe');
      if (fs.existsSync(mainLibPath)) {
        console.log('[Tricky Towers] ✅ Juego encontrado en Steam:', mainLibPath);
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
            const exePath = path.join(libraryPath, 'steamapps', 'common', 'TrickyTowers', 'TrickyTowers.exe');

            if (fs.existsSync(exePath)) {
              console.log('[Tricky Towers] ✅ Juego encontrado en librería Steam:', exePath);
              cachedGamePath = exePath;
              return exePath;
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('[Tricky Towers] ⚠️ No se pudo buscar en Steam Registry:', error.message);
  }

  // 3. Buscar en todo el disco C: (última opción, puede ser lento)
  console.log('[Tricky Towers] ⚠️ No se encontró en rutas comunes');
  return null;
}

/**
 * Lanza Tricky Towers con el servidor ya activo
 */
async function launchGame(profileId) {
  try {
    console.log('[Tricky Towers] 🚀 Iniciando proceso de lanzamiento...');

    // 1. Obtener la ruta configurada del perfil
    console.log('[Tricky Towers] 📁 Paso 1: Obteniendo ruta configurada...');

    if (!profileId) {
      return {
        success: false,
        error: 'No se proporcionó el ID del perfil',
        hint: 'Por favor, recarga la aplicación'
      };
    }

    const profilesModule = require('../../../modules/profiles');
    const profileData = profilesModule.getProfileData(profileId);
    const configuredPath = normalizeTrickyGameDir(profileData?.trickytowers?.gamePath);

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

    console.log('[Tricky Towers] ✅ Ruta válida:', configuredPath);

    // 2. CERRAR servidor anterior si existe (para evitar EADDRINUSE)
    console.log('[Tricky Towers] 📡 Paso 2: Verificando servidor existente...');
    const trickytowersServiceModule = require('./trickytowersService.js');
    const service = trickytowersServiceModule.getInstance();

    if (service.wss || service.ws) {
      console.log('[Tricky Towers] ⚠️ Servidor anterior detectado, cerrando...');
      try {
        service.disconnect();
        console.log('[Tricky Towers] ✅ Servidor anterior cerrado');
        // Esperar un poco para que el puerto se libere
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.warn('[Tricky Towers] ⚠️ Error cerrando servidor anterior:', e.message);
      }
    }

    // 3. Iniciar servidor WebSocket
    console.log('[Tricky Towers] 📡 Paso 3: Iniciando nuevo servidor WebSocket...');

    await service.connect();
    console.log('[Tricky Towers] ✅ Servidor WebSocket activo en puerto 58431');

    // Esperar 1 segundo para asegurar que el servidor está listo
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 4. Lanzar el juego
    console.log('[Tricky Towers] 🎮 Paso 4: Lanzando juego desde:', configuredPath);

    const { shell } = require('electron');
    try {
      await shell.openExternal(`steam://rungameid/${STEAM_APP_ID}`);
      console.log('[Tricky Towers] ✅ Juego lanzado via Steam');
    } catch (_) {
      const exePath = fs.statSync(configuredPath).isDirectory()
        ? path.join(configuredPath, TRICKY_EXE)
        : configuredPath;
      if (fs.existsSync(exePath)) {
        await shell.openPath(exePath);
        console.log('[Tricky Towers] ✅ Juego lanzado directamente');
      } else {
        console.error('[Tricky Towers] ❌ No se encontró el ejecutable');
      }
    }

    return {
      success: true,
      message: '✅ Servidor activo y juego iniciado\n💡 El mod se conectará automáticamente',
      gamePath: configuredPath
    };

  } catch (error) {
    console.error('[Tricky Towers] ❌ Error en launchGame:', error);

    // Si el error es EADDRINUSE, dar un mensaje específico
    if (error.message && error.message.includes('EADDRINUSE')) {
      return {
        success: false,
        error: 'El puerto 58431 ya está en uso. Cerrando servidor anterior...',
        hint: 'Intenta lanzar el juego nuevamente en unos segundos'
      };
    }

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Inicializa el módulo con la ventana principal
 */
function init(window) {
  mainWindow = window;
  setupIPCHandlers();
  console.log('[Tricky Towers] Módulo inicializado');
}

/**
 * Configura los handlers IPC
 */
function setupIPCHandlers() {
  // Conectar al juego (servidor WebSocket - el mod se conecta a nosotros)
  ipcMain.handle('trickytowers:connect', async () => {
    try {
      const trickytowersServiceModule = require('./trickytowersService.js');
      const service = trickytowersServiceModule.getInstance();

      if (service.isConnected) {
        return {
          success: true,
          message: `Ya conectado - Mod activo`
        };
      }

      // Si el servidor ya está escuchando pero el mod no se ha conectado
      if (service.wss) {
        return {
          success: true,
          message: 'Servidor activo - Esperando que el mod se conecte...',
          waiting: true
        };
      }

      await service.connect();

      return {
        success: true,
        message: `✅ Servidor activo en ws://127.0.0.1:58431\n💡 Inicia Tricky Towers para que el mod se conecte`,
        mode: 'server'
      };
    } catch (error) {
      console.error('[Tricky Towers] ❌ Error al conectar:', error);
      return {
        success: false,
        error: error.message,
        hint: 'Verifica que el puerto 58431 no esté en uso por otra aplicación'
      };
    }
  });

  // 🎮 NUEVO: Lanzar juego con servidor automático
  ipcMain.handle('trickytowers:launchGame', async (event, profileId) => {
    return await launchGame(profileId);
  });

  // ⚙️ NUEVO: Configurar ruta del juego
  ipcMain.handle('trickytowers:setGamePath', async (event, profileId, gamePath) => {
    try {
      if (!profileId) {
        console.error('[Tricky Towers] ❌ profileId no proporcionado');
        return {
          success: false,
          error: 'No se proporcionó el ID del perfil'
        };
      }

      const profilesModule = require('../../../modules/profiles');
      const profileData = profilesModule.getProfileData(profileId);

      if (!profileData.trickytowers) {
        profileData.trickytowers = {};
      }

      const normalizedPath = normalizeTrickyGameDir(gamePath);
      if (!normalizedPath) {
        return { success: false, error: 'Ruta invalida. Selecciona TrickyTowers.exe o la carpeta raiz del juego.' };
      }

      profileData.trickytowers.gamePath = normalizedPath;
      cachedGamePath = path.join(normalizedPath, TRICKY_EXE); // Actualizar cache

      profilesModule.setProfileData(profileId, profileData);

      console.log('[Tricky Towers] ✅ Ruta del juego guardada:', normalizedPath, 'en perfil:', profileId);

      return {
        success: true,
        message: 'Ruta del juego configurada correctamente',
        gamePath: normalizedPath
      };
    } catch (error) {
      console.error('[Tricky Towers] ❌ Error guardando ruta:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // 📁 NUEVO: Obtener ruta del juego
  ipcMain.handle('trickytowers:getGamePath', async (event, profileId) => {
    try {
      if (!profileId) {
        return {
          success: true,
          gamePath: null
        };
      }

      const profilesModule = require('../../../modules/profiles');
      const profileData = profilesModule.getProfileData(profileId);
      const gamePath = profileData?.trickytowers?.gamePath;

      return {
        success: true,
        gamePath: gamePath || null
      };
    } catch (error) {
      console.error('[Tricky Towers] ❌ Error obteniendo ruta:', error);
      return {
        success: false,
        gamePath: null,
        error: error.message
      };
    }
  });

  // 🔍 NUEVO: Buscar juego automáticamente
  ipcMain.handle('trickytowers:findGame', async () => {
    try {
      const gamePath = await findTrickyTowersExecutable();

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
      console.error('[Tricky Towers] ❌ Error buscando juego:', error);
      return {
        success: false,
        gamePath: null,
        error: error.message
      };
    }
  });

  // 📂 NUEVO: Abrir diálogo para seleccionar ejecutable
  ipcMain.handle('trickytowers:selectGamePath', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecciona la carpeta de Tricky Towers',
        defaultPath: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\TrickyTowers',
        properties: ['openDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return {
          success: false,
          canceled: true,
          gamePath: null
        };
      }

      const selectedPath = result.filePaths[0];
      console.log('[Tricky Towers] 📁 Usuario seleccionó:', selectedPath);

      const normalizedPath = normalizeTrickyGameDir(selectedPath);
      if (!normalizedPath) {
        return {
          success: false,
          error: 'Ruta invalida. Selecciona la carpeta raiz donde esta TrickyTowers.exe.',
          gamePath: null
        };
      }

      return {
        success: true,
        gamePath: normalizedPath
      };

    } catch (error) {
      console.error('[Tricky Towers] ❌ Error en diálogo:', error);
      return {
        success: false,
        error: error.message,
        gamePath: null
      };
    }
  });

  // Desconectar del juego
  ipcMain.handle('trickytowers:disconnect', async () => {
    try {
      const trickytowersServiceModule = require('./trickytowersService.js');
      const service = trickytowersServiceModule.getInstance();

      service.disconnect();

      return { success: true, message: 'Desconectado de Tricky Towers' };
    } catch (error) {
      console.error('[Tricky Towers] ❌ Error al desconectar:', error);
      return { success: false, error: error.message };
    }
  });

  // Obtener estado de la conexión
  ipcMain.handle('trickytowers:getStatus', async () => {
    try {
      const trickytowersServiceModule = require('./trickytowersService.js');
      const service = trickytowersServiceModule.getInstance();

      const status = service.getStatus();

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
  ipcMain.handle('trickytowers:executeEffect', async (event, effectId, options = {}) => {
    try {
      console.log('[Tricky Towers] 🎮 Ejecutando efecto:', effectId, 'Opciones:', options);

      const trickytowersServiceModule = require('./trickytowersService.js');
      const service = trickytowersServiceModule.getInstance();

      if (!service.isConnected) {
        console.error('[Tricky Towers] ❌ No hay conexión con el mod');
        return { success: false, error: 'Not connected to Tricky Towers mod' };
      }

      const result = await service.executeEffect(effectId, options);

      return result;
    } catch (error) {
      console.error('[Tricky Towers] ❌ Error ejecutando efecto:', error);
      return { success: false, error: error.message };
    }
  });

  // Obtener lista de efectos
  ipcMain.handle('trickytowers:getEffects', async () => {
    try {
      console.log('[Tricky Towers] 📋 Solicitando lista de efectos');

      // ✅ Cargar desde GamesCloud (AWS S3)
      const effects = await loadEffectsFromCloud();

      if (!effects || effects.length === 0) {
        console.warn('[Tricky Towers] ⚠️ No hay efectos disponibles');
        return { success: false, error: 'No effects loaded', effects: [] };
      }

      console.log('[Tricky Towers] ✅ Efectos enviados al frontend:', effects.length);
      return { success: true, effects };
    } catch (error) {
      console.error('[Tricky Towers] ❌ Error obteniendo efectos:', error);
      return { success: false, error: error.message, effects: [] };
    }
  });

  // Verificar estado del juego
  ipcMain.handle('trickytowers:checkGameStatus', async () => {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec('tasklist /FI "IMAGENAME eq TrickyTowers.exe"', (error, stdout) => {
          const isRunning = stdout.toLowerCase().includes('trickytowers.exe');
          resolve({
            success: true,
            running: isRunning,
            message: isRunning ? 'Tricky Towers está ejecutándose' : 'Tricky Towers no está ejecutándose'
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
  ipcMain.handle('trickytowers:checkModStatus', async () => {
    try {
      const { dialog } = require('electron');
      const fs = require('fs');

      // Solicitar ubicación de Tricky Towers
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecciona la carpeta de Tricky Towers',
        properties: ['openDirectory'],
        message: 'Selecciona la carpeta raíz donde está instalado Tricky Towers (donde se encuentra TrickyTowers.exe)'
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return {
          success: false,
          installed: false,
          message: 'Selección cancelada'
        };
      }

      const gamePath = result.filePaths[0];
      const exePath = path.join(gamePath, 'TrickyTowers.exe');

      if (!fs.existsSync(exePath)) {
        return {
          success: false,
          installed: false,
          error: 'No se encontró TrickyTowers.exe en la carpeta seleccionada'
        };
      }

      const isInstalled = isTrickyModInstalled(gamePath);

      return {
        success: true,
        installed: isInstalled,
        path: gamePath,
        version: isInstalled ? 'instalado' : 'no instalado'
      };
    } catch (error) {
      return {
        success: false,
        installed: false,
        error: error.message
      };
    }
  });

  // ✅ NUEVO: Descargar e instalar mod de Tricky Towers
  const downloadAndInstallMod = async (event, profileId) => {
    try {
      console.log('[Tricky Towers] 📥 Iniciando descarga e instalación del mod...');
      let towerPath = null;
      if (profileId) {
        try {
          const profilesModule = require('../../../modules/profiles');
          const profileData = profilesModule.getProfileData(profileId);
          towerPath = normalizeTrickyGameDir(profileData?.trickytowers?.gamePath);
        } catch (e) {
          console.warn('[Tricky Towers] No se pudo leer la ruta del perfil:', e.message);
        }
      }

      if (!towerPath) {
        const folderResult = await dialog.showOpenDialog(mainWindow, {
          title: 'Seleccionar carpeta de Tricky Towers',
          properties: ['openDirectory'],
          message: 'Selecciona la carpeta donde esta instalado Tricky Towers'
        });

        if (folderResult.canceled || !folderResult.filePaths || folderResult.filePaths.length === 0) {
          return { success: false, canceled: true };
        }

        towerPath = normalizeTrickyGameDir(folderResult.filePaths[0]);
      }

      if (!towerPath) {
        return {
          success: false,
          error: 'Ruta invalida. Selecciona la carpeta raiz donde esta TrickyTowers.exe.'
        };
      }

      const exePath = path.join(towerPath, 'TrickyTowers.exe');

      // Verificar que sea la carpeta correcta
      if (!fs.existsSync(exePath)) {
        return {
          success: false,
          error: 'No se encontró TrickyTowers.exe. Asegúrate de seleccionar la carpeta correcta del juego.'
        };
      }

      // Verificar si ya está instalado completo
      const melonLoaderPath = path.join(towerPath, 'MelonLoader');
      if (isTrickyModInstalled(towerPath)) {
        console.log('[Tricky Towers] ⚠️ Mod ya está instalado completo');
        return {
          success: true,
          alreadyInstalled: true,
          message: 'El mod ya está instalado.'
        };
      }
      if (fs.existsSync(melonLoaderPath)) {
        console.log('[Tricky Towers] ⚠️ Instalación incompleta detectada, reinstalando archivos del mod');
      }

      // Descargar el archivo
      const https = require('https');
      const http = require('http');
      const AdmZip = require('adm-zip');
      const tempPath = path.join(require('os').tmpdir(), 'trickytowers_mod.zip');

      // ⚠️ IMPORTANTE: Eliminar archivo temporal si existe (evitar usar caché vieja)
      if (fs.existsSync(tempPath)) {
        console.log('[Tricky Towers] 🗑️ Eliminando archivo temporal anterior...');
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          console.warn('[Tricky Towers] ⚠️ No se pudo eliminar archivo temporal:', e.message);
        }
      }

      console.log('[Tricky Towers] 🌐 Descargando mod desde:', MOD_DOWNLOAD_URL);

      // ⚡ Función de descarga PARALELA (múltiples conexiones simultáneas)
      const downloadFileParallel = async (url, dest, connections = 8) => {
        console.log(`[Tricky Towers] ⚡ Iniciando descarga con ${connections} conexiones paralelas...`);

        // Obtener tamaño del archivo
        const protocol = url.startsWith('https://') ? https : http;
        const fileSize = await new Promise((resolve, reject) => {
          const req = protocol.request(url, { method: 'HEAD' }, (res) => {
            const size = parseInt(res.headers['content-length'], 10);
            resolve(size);
          });
          req.on('error', reject);
          req.setTimeout(10000);
          req.end();
        });

        console.log(`[Tricky Towers] 📊 Tamaño total: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

        // Enviar progreso inicial
        if (global.mainWindow && global.mainWindow.webContents) {
          global.mainWindow.webContents.send('trickytowers:install-progress', {
            progress: 0,
            message: `📥 0% - Iniciando ${connections} conexiones...`
          });
        }

        const chunkSize = Math.ceil(fileSize / connections);
        const chunks = [];
        const startTime = Date.now();
        let totalDownloaded = 0;
        let lastProgress = 0;

        // Descargar cada chunk en paralelo
        const promises = [];
        for (let i = 0; i < connections; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize - 1, fileSize - 1);

          const promise = new Promise((resolve, reject) => {
            const req = protocol.get(url, {
              headers: {
                'Range': `bytes=${start}-${end}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              timeout: 60000
            }, (res) => {
              const chunkData = [];

              res.on('data', (data) => {
                chunkData.push(data);
                totalDownloaded += data.length;

                // Actualizar progreso cada 5%
                const progress = Math.floor((totalDownloaded / fileSize) * 100);
                if (progress >= lastProgress + 5 || progress === 100) {
                  const elapsed = (Date.now() - startTime) / 1000;
                  const speed = totalDownloaded / elapsed / 1024 / 1024;
                  const remaining = fileSize - totalDownloaded;
                  const eta = remaining / (totalDownloaded / elapsed);

                  console.log(`[Tricky Towers] 📥 Progreso: ${progress}% - ${speed.toFixed(1)} MB/s - ETA: ${Math.ceil(eta)}s`);

                  if (global.mainWindow && global.mainWindow.webContents) {
                    global.mainWindow.webContents.send('trickytowers:install-progress', {
                      progress,
                      message: `📥 ${progress}% - ${speed.toFixed(1)} MB/s - ETA: ${Math.ceil(eta)}s`
                    });
                  }

                  lastProgress = progress;
                }
              });

              res.on('end', () => {
                chunks[i] = Buffer.concat(chunkData);
                resolve();
              });

              res.on('error', reject);
            });

            req.on('error', reject);
            req.on('timeout', () => reject(new Error('Timeout')));
            req.end();
          });

          promises.push(promise);
        }

        // Esperar a que todos terminen
        await Promise.all(promises);

        // Combinar chunks y escribir archivo
        console.log('[Tricky Towers] 🔧 Combinando archivos...');
        const finalBuffer = Buffer.concat(chunks);
        fs.writeFileSync(dest, finalBuffer);

        console.log('[Tricky Towers] ✅ Descarga completada');
      };

      // Función de descarga normal (fallback)
      const downloadFile = (url, dest, retries = 3) => {
        return new Promise((resolve, reject) => {
          const attemptDownload = (attempt) => {
            console.log(`[Tricky Towers] 🌐 Descargando... (intento ${attempt}/${retries})`);

            const file = fs.createWriteStream(dest, {
              highWaterMark: 64 * 1024 * 1024 // ✅ Buffer de 64MB para descarga rápida
            });
            const protocol = url.startsWith('https://') ? https : http;

            const request = protocol.get(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'identity', // ✅ Sin compresión para máxima velocidad
                'Connection': 'keep-alive'
              },
              timeout: 60000, // ✅ 60 segundos timeout (archivos grandes)
              agent: false // ✅ Sin pool de conexiones para máxima velocidad
            }, (response) => {
              // Seguir redirección
              if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close();
                fs.unlinkSync(dest);
                return downloadFile(response.headers.location, dest, retries).then(resolve).catch(reject);
              }

              if (response.statusCode !== 200) {
                file.close();
                try { fs.unlinkSync(dest); } catch (e) { }

                if (attempt < retries) {
                  console.log(`[Tricky Towers] ⚠️ Error HTTP ${response.statusCode}, reintentando...`);
                  setTimeout(() => attemptDownload(attempt + 1), 2000);
                } else {
                  return reject(new Error(`Error HTTP ${response.statusCode}`));
                }
                return;
              }

              // Progreso de descarga
              const totalSize = parseInt(response.headers['content-length'], 10);
              let downloadedSize = 0;
              let lastProgress = 0;
              const startTime = Date.now();

              response.on('data', (chunk) => {
                downloadedSize += chunk.length;

                if (totalSize) {
                  const progress = Math.floor((downloadedSize / totalSize) * 100);

                  // Mostrar cada 5% para feedback más frecuente
                  if (progress >= lastProgress + 5 || progress === 100) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = downloadedSize / elapsed / 1024 / 1024; // MB/s
                    const remaining = totalSize - downloadedSize;
                    const eta = remaining / (downloadedSize / elapsed);

                    const progressMsg = `${progress}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB/${(totalSize / 1024 / 1024).toFixed(1)}MB) - ${speed.toFixed(2)} MB/s - ETA: ${Math.ceil(eta)}s`;
                    console.log(`[Tricky Towers] 📥 Progreso: ${progressMsg}`);

                    // Enviar evento al frontend
                    const message = `📥 ${progress}% - ${speed.toFixed(1)} MB/s - ETA: ${Math.ceil(eta)}s`;
                    console.log(`[Tricky Towers] 📤 Enviando evento al frontend:`, message); // ✅ DEBUG

                    if (global.mainWindow && global.mainWindow.webContents) {
                      global.mainWindow.webContents.send('trickytowers:install-progress', {
                        progress,
                        message
                      });
                      console.log('[Tricky Towers] ✅ Evento enviado'); // ✅ DEBUG
                    } else {
                      console.warn('[Tricky Towers] ⚠️ mainWindow no disponible'); // ✅ DEBUG
                    }

                    lastProgress = progress;
                  }
                }
              });

              response.pipe(file);

              file.on('finish', () => {
                file.close(() => {
                  console.log('[Tricky Towers] ✅ Descarga completada');
                  resolve();
                });
              });

              file.on('error', (err) => {
                console.error('[Tricky Towers] ❌ Error escribiendo archivo:', err.message);
                try { fs.unlinkSync(dest); } catch (e) { }

                if (attempt < retries) {
                  console.log('[Tricky Towers] ⚠️ Reintentando descarga...');
                  setTimeout(() => attemptDownload(attempt + 1), 2000);
                } else {
                  reject(err);
                }
              });
            });

            request.on('error', (err) => {
              console.error('[Tricky Towers] ❌ Error de red:', err.message);
              file.close();
              try { fs.unlinkSync(dest); } catch (e) { }

              if (attempt < retries) {
                console.log('[Tricky Towers] ⚠️ Reintentando descarga...');
                setTimeout(() => attemptDownload(attempt + 1), 2000);
              } else {
                reject(err);
              }
            });

            request.on('timeout', () => {
              console.error('[Tricky Towers] ⏱️ Timeout de descarga');
              request.destroy();
              file.close();
              try { fs.unlinkSync(dest); } catch (e) { }

              if (attempt < retries) {
                console.log('[Tricky Towers] ⚠️ Reintentando descarga...');
                setTimeout(() => attemptDownload(attempt + 1), 2000);
              } else {
                reject(new Error('Timeout de descarga'));
              }
            });
          };

          attemptDownload(1);
        });
      };

      // ⚡ Intentar descarga paralela primero (8 conexiones), fallback a descarga normal
      try {
        await downloadFileParallel(MOD_DOWNLOAD_URL, tempPath, 8);
      } catch (e) {
        console.warn('[Tricky Towers] ⚠️ Descarga paralela falló, intentando descarga normal...');
        await downloadFile(MOD_DOWNLOAD_URL, tempPath);
      }

      // Extraer el archivo ZIP (Windows tiene soporte nativo)
      console.log('[Tricky Towers] 📦 Extrayendo mod...');

      // Enviar evento al frontend
      if (global.mainWindow && global.mainWindow.webContents) {
        global.mainWindow.webContents.send('trickytowers:install-progress', {
          progress: 100,
          message: '📦 Extrayendo archivos...'
        });
      }

      try {
        const zip = new AdmZip(tempPath);
        zip.extractAllTo(towerPath, true); // true = sobrescribir archivos existentes
        console.log('[Tricky Towers] ✅ Mod extraído correctamente');
      } catch (e) {
        console.error('[Tricky Towers] ❌ Error extrayendo ZIP:', e.message);

        // Limpiar archivo temporal
        try { fs.unlinkSync(tempPath); } catch (e) { }

        return {
          success: false,
          error: `Error al extraer el mod: ${e.message}`
        };
      }

      // Verificar que se instaló correctamente
      if (!isTrickyModInstalled(towerPath)) {
        return {
          success: false,
          error: 'La extracción se completó pero faltan archivos del mod. Verifica la instalación manualmente.',
          downloadPath: tempPath
        };
      }

      // Eliminar el archivo temporal
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        console.warn('[Tricky Towers] No se pudo eliminar el archivo temporal:', e);
      }

      return {
        success: true,
        message: 'Mod instalado correctamente. Reinicia Tricky Towers si está abierto.',
        towerPath: towerPath
      };

    } catch (e) {
      console.error('[Tricky Towers] Error descargando mod:', e);
      return {
        success: false,
        error: e.message
      };
    }
  };

  // Registrar handlers de instalación
  ipcMain.handle('trickytowers:downloadMod', downloadAndInstallMod);
  ipcMain.handle('trickytowers:installMod', downloadAndInstallMod);

  // ✅ NUEVO: Desinstalar mod de Tricky Towers
  ipcMain.handle('trickytowers:uninstallMod', async () => {
    try {
      console.log('[Tricky Towers] 🗑️ Iniciando desinstalación del mod...');

      // Solicitar ubicación de Tricky Towers
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecciona la carpeta de Tricky Towers',
        properties: ['openDirectory'],
        message: 'Selecciona la carpeta raíz donde está instalado Tricky Towers'
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return {
          success: false,
          error: 'Selección cancelada'
        };
      }

      const gamePath = result.filePaths[0];
      const exePath = path.join(gamePath, 'TrickyTowers.exe');

      if (!fs.existsSync(exePath)) {
        return {
          success: false,
          error: 'No se encontró TrickyTowers.exe en la carpeta seleccionada'
        };
      }

      console.log('[Tricky Towers] 📁 Ruta del juego:', gamePath);

      // Lista de archivos y carpetas a eliminar (según especificación del usuario)
      const itemsToDelete = [
        { path: path.join(gamePath, 'MelonLoader'), type: 'dir' },
        { path: path.join(gamePath, 'mods'), type: 'dir' },
        { path: path.join(gamePath, 'userData'), type: 'dir' },
        { path: path.join(gamePath, 'UserLibs'), type: 'dir' },
        { path: path.join(gamePath, 'cc-overlay.exe'), type: 'file' },
        { path: path.join(gamePath, 'ccver'), type: 'file' },
        { path: path.join(gamePath, 'version.dll'), type: 'file' }
      ];

      let deletedCount = 0;
      let errors = [];

      for (const item of itemsToDelete) {
        try {
          if (fs.existsSync(item.path)) {
            if (item.type === 'dir') {
              fs.rmSync(item.path, { recursive: true, force: true });
              console.log(`[Tricky Towers] ✅ Eliminada carpeta: ${path.basename(item.path)}`);
            } else {
              fs.unlinkSync(item.path);
              console.log(`[Tricky Towers] ✅ Eliminado archivo: ${path.basename(item.path)}`);
            }
            deletedCount++;
          }
        } catch (err) {
          console.error(`[Tricky Towers] ❌ Error eliminando ${item.path}:`, err.message);
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

      console.log(`[Tricky Towers] ✅ Desinstalación completada: ${deletedCount} elementos eliminados`);

      return {
        success: true,
        message: `Mod desinstalado correctamente (${deletedCount} elementos eliminados)`
      };
    } catch (error) {
      console.error('[Tricky Towers] ❌ Error en desinstalación:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  console.log('[Tricky Towers] ✅ IPC handlers registrados');
}

/**
 * Limpieza al cerrar la aplicación
 */
function cleanup() {
  console.log('[Tricky Towers] 🧹 Limpiando módulo...');
  mainWindow = null;
}

module.exports = {
  init,
  cleanup,
  getEffects: () => GAME_EFFECTS
};

