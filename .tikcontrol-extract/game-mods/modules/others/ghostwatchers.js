/**
 * Servicio de Ghost Watchers para TikControl
 * Comunicación TCP directa con el mod de BepInEx
 * Puerto: 9991
 */

const EventEmitter = require('events');
const net = require('net');
const { ipcMain, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const AdmZip = require('adm-zip');
const { resolveDir } = require('../steamDetect');

class GhostWatchersService extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.client = null;
    this.isConnected = false;
    this.requestIdCounter = 1;
    this.pendingRequests = new Map();
    this.PORT = 9991;
    this.HOST = '127.0.0.1';
    this.gameConfig = {}; // Almacenar rutas de juego por perfil
  }

  /**
   * Inicia el servidor TCP
   */
  start() {
    if (this.server) {
      console.log('[Ghost Watchers] ⚠️ Servidor ya iniciado');
      return;
    }

    this._createServer();
  }

  _createServer() {
    this.server = net.createServer((socket) => {
      console.log('[Ghost Watchers] ✅ Mod conectado desde:', socket.remoteAddress);

      if (this.client) {
        console.log('[Ghost Watchers] ⚠️ Ya hay un cliente conectado, rechazando nueva conexión');
        socket.end();
        return;
      }

      this.client = socket;
      this.isConnected = true;
      this.emit('connected');

      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString();

        let lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.handleModResponse(response);
            } catch (err) {
              console.error('[Ghost Watchers] ❌ Error parsing response:', err);
            }
          }
        }
      });

      socket.on('close', () => {
        console.log('[Ghost Watchers] 🔌 Mod desconectado');
        this.client = null;
        this.isConnected = false;
        this.emit('disconnected');
      });

      socket.on('error', (err) => {
        console.error('[Ghost Watchers] ❌ Socket error:', err.message);
        this.client = null;
        this.isConnected = false;
      });
    });

    this.server.listen(this.PORT, this.HOST, () => {
      console.log(`[Ghost Watchers] 👻 Servidor TCP iniciado en ${this.HOST}:${this.PORT}`);
      console.log('[Ghost Watchers] 🔌 Esperando conexión del mod...');
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Ghost Watchers] ⚠️ Puerto ${this.PORT} ya en uso, liberando...`);
        this.server = null;
        const tempClient = new net.Socket();
        tempClient.on('error', () => {
          setTimeout(() => this._createServer(), 1000);
        });
        tempClient.connect(this.PORT, this.HOST, () => {
          tempClient.end();
          setTimeout(() => this._createServer(), 1000);
        });
      } else {
        console.error('[Ghost Watchers] ❌ Error del servidor:', err.message);
      }
    });
  }

  /**
   * Maneja las respuestas del mod
   */
  handleModResponse(response) {
    console.log('[Ghost Watchers] 📥 Respuesta del mod:', {
      requestId: response.requestId,
      success: response.success,
      message: response.message
    });

    const requestInfo = this.pendingRequests.get(response.requestId);
    if (requestInfo) {
      const { resolve, reject } = requestInfo;

      if (response.success) {
        resolve({
          success: true,
          message: response.message
        });
      } else {
        reject(new Error(response.message || 'Command failed'));
      }

      this.pendingRequests.delete(response.requestId);
    } else {
      console.log('[Ghost Watchers] ⚠️ Respuesta sin request pendiente - ID:', response.requestId);
    }
  }

  /**
   * Envía un mensaje al mod
   */
  send(message) {
    if (!this.isConnected || !this.client) {
      console.error('[Ghost Watchers] ❌ No conectado al mod');
      return false;
    }

    try {
      const data = JSON.stringify(message) + '\n';
      this.client.write(data);
      return true;
    } catch (error) {
      console.error('[Ghost Watchers] ❌ Error enviando mensaje:', error.message);
      return false;
    }
  }

  /**
   * Ejecuta un comando en el juego
   */
  async executeCommand(command, parameters = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.client) {
        return reject(new Error('Not connected to Ghost Watchers mod'));
      }

      const requestId = this.requestIdCounter++;

      // Guardar request para cuando llegue la respuesta
      this.pendingRequests.set(requestId, { resolve, reject });

      // Timeout de 10 segundos
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Command timeout'));
        }
      }, 10000);

      const message = {
        type: 'command',
        requestId: requestId,
        command: command,
        parameters: parameters
      };

      console.log('[Ghost Watchers] 📤 Enviando comando:', message);

      if (!this.send(message)) {
        this.pendingRequests.delete(requestId);
        reject(new Error('Failed to send command'));
      }
    });
  }

  /**
   * Detiene el servidor
   */
  stop() {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.end();
        this.client = null;
      }

      if (this.server) {
        this.server.close(() => {
          console.log('[Ghost Watchers] 🛑 Servidor TCP detenido');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }

      this.isConnected = false;
    });
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      port: this.PORT
    };
  }
}

// Instancia única del servicio
const service = new GhostWatchersService();

let mainWindow = null;

function initialize(mainWin) {
  mainWindow = mainWin;
  console.log('[Ghost Watchers] 👻 Iniciando módulo...');

  // Iniciar el servidor TCP
  service.start();

  // Listeners de eventos
  service.on('connected', () => {
    console.log('[Ghost Watchers] ✅ Plugin conectado!');
    if (mainWindow) {
      mainWindow.webContents.send('ghostwatchers:connected');
    }
  });

  service.on('disconnected', () => {
    console.log('[Ghost Watchers] 🔌 Plugin desconectado');
    if (mainWindow) {
      mainWindow.webContents.send('ghostwatchers:disconnected');
    }
  });

  // ============================================
  // IPC Handlers para comunicación con renderer
  // ============================================

  // Handler genérico para executeEffect (usado por el dispatcher)
  ipcMain.handle('ghostwatchers:executeEffect', async (event, command, parameters = {}) => {
    try {
      console.log('[Ghost Watchers] 📤 Ejecutando efecto:', command, parameters);
      const result = await service.executeCommand(command, parameters);
      return result;
    } catch (error) {
      console.error('[Ghost Watchers] ❌ Error en executeEffect:', error.message);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // Comandos del Fantasma
  // ============================================

  ipcMain.handle('ghostwatchers:ghostHunt', async () => {
    try {
      return await service.executeCommand('GHOST_HUNT');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:ghostAttack', async () => {
    try {
      return await service.executeCommand('GHOST_ATTACK');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:ghostScreamer', async () => {
    try {
      return await service.executeCommand('GHOST_SCREAMER');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:ghostInteract', async () => {
    try {
      return await service.executeCommand('GHOST_INTERACT');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:ghostTeleport', async () => {
    try {
      return await service.executeCommand('GHOST_TELEPORT');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:ghostVisible', async () => {
    try {
      return await service.executeCommand('GHOST_VISIBLE');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:ghostInvisible', async () => {
    try {
      return await service.executeCommand('GHOST_INVISIBLE');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:ghostAngry', async () => {
    try {
      return await service.executeCommand('GHOST_ANGRY');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // Comandos del Jugador
  // ============================================

  ipcMain.handle('ghostwatchers:damagePlayer', async (event, amount) => {
    try {
      return await service.executeCommand('DAMAGE_PLAYER', { amount: amount || 25 });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:healPlayer', async (event, amount) => {
    try {
      return await service.executeCommand('HEAL_PLAYER', { amount: amount || 50 });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:killPlayer', async () => {
    try {
      return await service.executeCommand('KILL_PLAYER');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:revivePlayer', async () => {
    try {
      return await service.executeCommand('REVIVE_PLAYER');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:scarePlayer', async () => {
    try {
      return await service.executeCommand('SCARE_PLAYER');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:dropTools', async () => {
    try {
      return await service.executeCommand('DROP_TOOLS');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:freezePlayer', async () => {
    try {
      return await service.executeCommand('FREEZE_PLAYER');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:unfreezePlayer', async () => {
    try {
      return await service.executeCommand('UNFREEZE_PLAYER');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // Comandos del Entorno
  // ============================================

  ipcMain.handle('ghostwatchers:lightsOff', async () => {
    try {
      return await service.executeCommand('LIGHTS_OFF');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:lightsOn', async () => {
    try {
      return await service.executeCommand('LIGHTS_ON');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:lightsFlicker', async () => {
    try {
      return await service.executeCommand('LIGHTS_FLICKER');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:explodeLights', async () => {
    try {
      return await service.executeCommand('EXPLODE_LIGHTS');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:openDoors', async () => {
    try {
      return await service.executeCommand('OPEN_DOORS');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:closeDoors', async () => {
    try {
      return await service.executeCommand('CLOSE_DOORS');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ghostwatchers:lockDoors', async () => {
    try {
      return await service.executeCommand('LOCK_DOORS');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // Game Path Management
  // ============================================

  ipcMain.handle('ghostwatchers:findGame', async () => {
    const commonPaths = [
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Ghost Watchers\\Ghost Watchers.exe',
      'C:\\Program Files\\Steam\\steamapps\\common\\Ghost Watchers\\Ghost Watchers.exe',
      'D:\\SteamLibrary\\steamapps\\common\\Ghost Watchers\\Ghost Watchers.exe',
      'E:\\SteamLibrary\\steamapps\\common\\Ghost Watchers\\Ghost Watchers.exe',
      'F:\\SteamLibrary\\steamapps\\common\\Ghost Watchers\\Ghost Watchers.exe',
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        return { success: true, gamePath: p };
      }
    }
    return { success: false, error: 'Juego no encontrado automáticamente.' };
  });

  ipcMain.handle('ghostwatchers:setGamePath', async (event, profileId, gamePath) => {
    service.gameConfig[profileId] = gamePath;
    return { success: true };
  });

  ipcMain.handle('ghostwatchers:getGamePath', async (event, profileId) => {
    return { success: true, gamePath: service.gameConfig[profileId] || null };
  });

  ipcMain.handle('ghostwatchers:launchGame', async (event, profileId) => {
    const gamePath = service.gameConfig[profileId];
    if (!gamePath || !fs.existsSync(gamePath)) {
      return { success: false, error: 'Ruta del juego no configurada o inválida.', hint: 'Usa "Configurar Ruta" para seleccionar Ghost Watchers.exe' };
    }
    try {
      shell.openPath(gamePath);
      return { success: true, message: 'Juego iniciado.' };
    } catch (error) {
      return { success: false, error: `Error al iniciar el juego: ${error.message}` };
    }
  });

  // ============================================
  // Instalación del Mod
  // ============================================

  ipcMain.handle('ghostwatchers:installMod', async (event, profileId) => {
    const gamePath = service.gameConfig[profileId];
    if (!gamePath) {
      return { success: false, error: 'Ruta del juego no configurada. Usa "Configurar Ruta" primero.' };
    }

    const gameDir = resolveDir(gamePath);
    // URL del mod completo de TikControl (incluye BepInEx + plugin)
    const modUrl = 'https://storage.tikcontrol.live/games/ghost-watchers/mod.zip?v=3';
    const tempDir = path.join(app.getPath('temp'), 'tikcontrol_gw_mod');
    const zipPath = path.join(tempDir, 'ghostwatchers_tikcontrol.zip');

    try {
      // Crear directorio temporal
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Enviar progreso
      if (mainWindow) {
        mainWindow.webContents.send('ghostwatchers:install-progress', { message: '📥 Descargando mod de TikControl...' });
      }

      console.log('[Ghost Watchers] 📥 Descargando mod completo desde:', modUrl);

      // Descargar el mod completo
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(zipPath);

        const downloadWithRedirects = (url, redirectCount = 0) => {
          if (redirectCount > 5) {
            reject(new Error('Demasiadas redirecciones'));
            return;
          }

          // Determinar si usar http o https
          const httpModule = url.startsWith('https') ? https : require('http');

          httpModule.get(url, {
            headers: {
              'User-Agent': 'TikControl/1.0'
            }
          }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
              console.log('[Ghost Watchers] ↪️ Redirigiendo a:', response.headers.location);
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

      console.log('[Ghost Watchers] ✅ Descarga completada');

      if (mainWindow) {
        mainWindow.webContents.send('ghostwatchers:install-progress', { message: '📦 Extrayendo mod...' });
      }

      // Extraer el mod completo (incluye BepInEx + plugin)
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(gameDir, true);

      console.log('[Ghost Watchers] ✅ Mod extraído a:', gameDir);

      // Verificar que el plugin se instaló correctamente
      const pluginPath = path.join(gameDir, 'BepInEx', 'plugins', 'GhostWatchers_TikControl.dll');
      const pluginInstalled = fs.existsSync(pluginPath);

      // Limpiar archivos temporales
      try {
        fs.unlinkSync(zipPath);
        fs.rmdirSync(tempDir, { recursive: true });
      } catch (e) {
        console.log('[Ghost Watchers] ⚠️ No se pudo limpiar temporales:', e.message);
      }

      if (mainWindow) {
        mainWindow.webContents.send('ghostwatchers:install-progress', {
          message: pluginInstalled ? '✅ Mod instalado correctamente!' : '✅ BepInEx instalado, verificando plugin...'
        });
      }

      return {
        success: true,
        message: pluginInstalled
          ? '¡Mod de TikControl instalado correctamente! Inicia el juego para conectar.'
          : 'BepInEx instalado. Inicia el juego una vez y vuelve a instalar.',
        pluginInstalled: pluginInstalled
      };

    } catch (error) {
      console.error('[Ghost Watchers] ❌ Error instalando mod:', error);
      return { success: false, error: `Error al instalar el mod: ${error.message}` };
    }
  });

  // ✅ Desinstalar mod completo
  ipcMain.handle('ghostwatchers:uninstallMod', async (event, profileId) => {
    const gamePath = service.gameConfig[profileId];
    if (!gamePath) {
      return { success: false, error: 'Ruta del juego no configurada.' };
    }

    const gameDir = resolveDir(gamePath);

    const itemsToDelete = [
      path.join(gameDir, 'BepInEx'),
      path.join(gameDir, '.doorstop_version'),
      path.join(gameDir, 'changelog.txt'),
      path.join(gameDir, 'doorstop_config.ini'),
      path.join(gameDir, 'winhttp.dll')
    ];

    let deletedCount = 0;
    let errors = [];

    for (const itemPath of itemsToDelete) {
      try {
        if (fs.existsSync(itemPath)) {
          const stat = fs.statSync(itemPath);

          if (stat.isDirectory()) {
            fs.rmSync(itemPath, { recursive: true, force: true });
            console.log('[Ghost Watchers] 🗑️ Carpeta eliminada:', itemPath);
          } else {
            fs.unlinkSync(itemPath);
            console.log('[Ghost Watchers] 🗑️ Archivo eliminado:', itemPath);
          }
          deletedCount++;
        }
      } catch (err) {
        console.error('[Ghost Watchers] ❌ Error eliminando:', itemPath, err.message);
        errors.push(`${path.basename(itemPath)}: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: `Se eliminaron ${deletedCount} elementos pero hubo errores: ${errors.join(', ')}`
      };
    }

    if (deletedCount === 0) {
      return { success: true, message: 'El mod no estaba instalado.' };
    }

    return { success: true, message: `Mod desinstalado correctamente. Se eliminaron ${deletedCount} elementos.` };
  });

  ipcMain.handle('ghostwatchers:checkModStatus', async (event, profileId) => {
    const gamePath = service.gameConfig[profileId];
    if (!gamePath) {
      return { success: false, error: 'Ruta del juego no configurada.', isBepInExInstalled: false, isModInstalled: false };
    }
    const gameDir = resolveDir(gamePath);

    const bepInExCorePath = path.join(gameDir, 'BepInEx', 'core', 'BepInEx.dll');
    const pluginPath = path.join(gameDir, 'BepInEx', 'plugins', 'GhostWatchers_TikControl.dll');
    const winhttpPath = path.join(gameDir, 'winhttp.dll');
    const doorstopPath = path.join(gameDir, 'doorstop_config.ini');

    const isBepInExInstalled = fs.existsSync(bepInExCorePath) && fs.existsSync(winhttpPath) && fs.existsSync(doorstopPath);
    const isModInstalled = isBepInExInstalled && fs.existsSync(pluginPath);

    return { success: true, isBepInExInstalled, isModInstalled };
  });

  ipcMain.handle('ghostwatchers:isConnected', () => {
    return { success: true, connected: service.isConnected };
  });

  // Cleanup al cerrar
  app.on('before-quit', async () => {
    console.log('[Ghost Watchers] Deteniendo servidor TCP antes de cerrar...');
    await service.stop();
  });

  console.log('[Ghost Watchers] ✅ Módulo inicializado, servidor TCP en puerto', service.PORT);
}

module.exports = {
  initialize,
  service
};

