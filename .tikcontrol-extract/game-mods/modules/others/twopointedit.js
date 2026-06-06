/**
 * Servicio de Two Point Hospital para TikControl
 * Comunicación TCP directa con el mod de BepInEx
 * Puerto: 9999
 */

const EventEmitter = require('events');
const net = require('net');
const { ipcMain, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const AdmZip = require('adm-zip');
const { resolveDir } = require('../steamDetect');

class TwoPointHospitalService extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.client = null;
    this.isConnected = false;
    this.requestIdCounter = 1;
    this.pendingRequests = new Map();
    this.PORT = 9999;
    this.HOST = '127.0.0.1';
    this.gameConfig = {}; // Almacenar rutas de juego por perfil
  }

  /**
   * Inicia el servidor TCP
   */
  start() {
    if (this.server) {
      console.log('[Two Point Hospital] ⚠️ Servidor ya iniciado');
      return;
    }

    this.server = net.createServer((socket) => {
      console.log('[Two Point Hospital] ✅ Mod conectado desde:', socket.remoteAddress);

      if (this.client) {
        console.log('[Two Point Hospital] ⚠️ Ya hay un cliente conectado, rechazando nueva conexión');
        socket.end();
        return;
      }

      this.client = socket;
      this.isConnected = true;
      this.emit('connected');

      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString();

        // Procesar mensajes completos (separados por \n)
        let lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.handleModResponse(response);
            } catch (err) {
              console.error('[Two Point Hospital] ❌ Error parsing response:', err);
              console.error('[Two Point Hospital] Raw message:', line);
            }
          }
        }
      });

      socket.on('close', () => {
        console.log('[Two Point Hospital] 🔌 Mod desconectado');
        this.client = null;
        this.isConnected = false;
        this.emit('disconnected');
      });

      socket.on('error', (err) => {
        console.error('[Two Point Hospital] ❌ Socket error:', err);
        this.client = null;
        this.isConnected = false;
      });
    });

    this.server.listen(this.PORT, this.HOST, () => {
      console.log(`[Two Point Hospital] 🎮 Servidor TCP iniciado en ${this.HOST}:${this.PORT}`);
      console.log('[Two Point Hospital] 🔌 Esperando conexión del mod...');
    });

    this.server.on('error', (err) => {
      console.error('[Two Point Hospital] ❌ Error del servidor:', err);
      if (err.code === 'EADDRINUSE') {
        console.log(`[Two Point Hospital] ⚠️ Puerto ${this.PORT} ya en uso`);
      }
      this.emit('error', err);
    });
  }

  /**
   * Maneja las respuestas del mod
   */
  handleModResponse(response) {
    console.log('[Two Point Hospital] 📥 Respuesta del mod:', {
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
      console.log('[Two Point Hospital] ⚠️ Respuesta sin request pendiente - ID:', response.requestId);
    }
  }

  /**
   * Envía un mensaje al mod
   */
  send(message) {
    if (!this.isConnected || !this.client) {
      console.error('[Two Point Hospital] ❌ No conectado al mod');
      return false;
    }

    try {
      const data = JSON.stringify(message) + '\n';
      this.client.write(data);
      return true;
    } catch (error) {
      console.error('[Two Point Hospital] ❌ Error enviando mensaje:', error.message);
      return false;
    }
  }

  /**
   * Ejecuta un comando en el juego
   */
  async executeCommand(command, parameters = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.client) {
        return reject(new Error('Not connected to Two Point Hospital mod'));
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

      console.log('[Two Point Hospital] 📤 Enviando comando:', message);

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
          console.log('[Two Point Hospital] 🛑 Servidor TCP detenido');
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
const service = new TwoPointHospitalService();

let mainWindow = null;

function initialize(mainWin) {
  mainWindow = mainWin;
  console.log('[Two Point Hospital] 🏥 Iniciando módulo...');

  // Iniciar el servidor TCP
  service.start();

  // Listeners de eventos
  service.on('connected', () => {
    console.log('[Two Point Hospital] ✅ Plugin conectado!');
    if (mainWindow) {
      mainWindow.webContents.send('twoPointEdit:connected');
    }
  });

  service.on('disconnected', () => {
    console.log('[Two Point Hospital] 🔌 Plugin desconectado');
    if (mainWindow) {
      mainWindow.webContents.send('twoPointEdit:disconnected');
    }
  });

  // IPC Handlers para la comunicación con el renderer
  ipcMain.handle('twopointedit:sendCommand', async (event, command, parameters) => {
    try {
      const result = await service.executeCommand(command, parameters);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Handler genérico para executeEffect (usado por el dispatcher)
  ipcMain.handle('twopointedit:executeEffect', async (event, command, parameters = {}) => {
    try {
      console.log('[Two Point Hospital] 📤 Ejecutando efecto:', command, parameters);
      const result = await service.executeCommand(command, parameters);
      return result;
    } catch (error) {
      console.error('[Two Point Hospital] ❌ Error en executeEffect:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:addMoney', async (event, amount) => {
    try {
      return await service.executeCommand('MONEY_ADD', { amount: amount });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:removeMoney', async (event, amount) => {
    try {
      return await service.executeCommand('MONEY_REMOVE', { amount: amount });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:spawnPatient', async (event, illness) => {
    try {
      return await service.executeCommand('SPAWN_PATIENT', { illness: illness });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:cureAll', async () => {
    try {
      return await service.executeCommand('CURE_ALL_PATIENTS');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:killPatient', async () => {
    try {
      return await service.executeCommand('KILL_RANDOM_PATIENT');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:hireStaff', async (event, staffType) => {
    try {
      return await service.executeCommand('HIRE_STAFF', { staffType: staffType });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:fireStaff', async () => {
    try {
      return await service.executeCommand('FIRE_RANDOM_STAFF');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:setReputation', async (event, value) => {
    try {
      return await service.executeCommand('SET_REPUTATION', { value: value });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:triggerEmergency', async () => {
    try {
      return await service.executeCommand('TRIGGER_EMERGENCY');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:pauseGame', async () => {
    try {
      return await service.executeCommand('PAUSE_GAME');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:resumeGame', async () => {
    try {
      return await service.executeCommand('RESUME_GAME');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('twopointedit:getStats', async () => {
    try {
      return await service.executeCommand('GET_STATS');
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Game Path Management
  ipcMain.handle('twopointedit:findGame', async () => {
    const commonPaths = [
      'C:\\Program Files\\Epic Games\\twopointhospital\\TPH.exe',
      'C:\\Program Files (x86)\\Epic Games\\twopointhospital\\TPH.exe',
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        return { success: true, gamePath: p };
      }
    }
    return { success: false, error: 'Juego no encontrado automáticamente.' };
  });

  ipcMain.handle('twopointedit:setGamePath', async (event, profileId, gamePath) => {
    service.gameConfig[profileId] = gamePath;
    return { success: true };
  });

  ipcMain.handle('twopointedit:getGamePath', async (event, profileId) => {
    return { success: true, gamePath: service.gameConfig[profileId] || null };
  });

  ipcMain.handle('twopointedit:launchGame', async (event, profileId) => {
    const gamePath = service.gameConfig[profileId];
    if (!gamePath || !fs.existsSync(gamePath)) {
      return { success: false, error: 'Ruta del juego no configurada o inválida.', hint: 'Usa "Configurar Ruta" para seleccionar TPH.exe' };
    }
    try {
      shell.openPath(gamePath);
      return { success: true, message: 'Juego iniciado.' };
    } catch (error) {
      return { success: false, error: `Error al iniciar el juego: ${error.message}` };
    }
  });

  // ✅ Instalar mod completo (BepInEx + Plugin TikControl)
  ipcMain.handle('twopointedit:installMod', async (event, profileId) => {
    const gamePath = service.gameConfig[profileId];
    if (!gamePath) {
      return { success: false, error: 'Ruta del juego no configurada. Usa "Configurar Ruta" primero.' };
    }

    const gameDir = resolveDir(gamePath);
    const modUrl = 'https://storage.tikcontrol.live/games/two-point-hospital/mod.zip';
    const tempDir = path.join(app.getPath('temp'), 'tikcontrol_tph_mod');
    const zipPath = path.join(tempDir, 'tph_mod.zip');

    try {
      // Crear directorio temporal
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Enviar progreso
      if (mainWindow) {
        mainWindow.webContents.send('twopointedit:install-progress', { message: '📥 Descargando mod...' });
      }

      console.log('[Two Point Hospital] 📥 Descargando mod desde:', modUrl);

      // Descargar el archivo ZIP
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
            // Manejar redirecciones
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
              console.log('[Two Point Hospital] ↪️ Redirigiendo a:', response.headers.location);
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

      console.log('[Two Point Hospital] ✅ Descarga completada');

      if (mainWindow) {
        mainWindow.webContents.send('twopointedit:install-progress', { message: '📦 Extrayendo archivos...' });
      }

      // Extraer el ZIP
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(gameDir, true);

      console.log('[Two Point Hospital] ✅ Mod extraído a:', gameDir);

      // Limpiar archivos temporales
      try {
        fs.unlinkSync(zipPath);
        fs.rmdirSync(tempDir, { recursive: true });
      } catch (e) {
        console.log('[Two Point Hospital] ⚠️ No se pudo limpiar temporales:', e.message);
      }

      if (mainWindow) {
        mainWindow.webContents.send('twopointedit:install-progress', { message: '✅ Mod instalado correctamente!' });
      }

      return { success: true, message: 'Mod instalado correctamente. ¡Inicia el juego!' };

    } catch (error) {
      console.error('[Two Point Hospital] ❌ Error instalando mod:', error);
      return { success: false, error: `Error al instalar el mod: ${error.message}` };
    }
  });

  // ✅ Desinstalar mod completo (BepInEx + archivos relacionados)
  ipcMain.handle('twopointedit:uninstallMod', async (event, profileId) => {
    const gamePath = service.gameConfig[profileId];
    if (!gamePath) {
      return { success: false, error: 'Ruta del juego no configurada.' };
    }

    const gameDir = resolveDir(gamePath);

    // Archivos y carpetas a eliminar
    const itemsToDelete = [
      path.join(gameDir, 'BepInEx'),           // Carpeta BepInEx
      path.join(gameDir, '.doorstop_version'), // Archivo doorstop
      path.join(gameDir, 'changelog.txt'),     // Changelog
      path.join(gameDir, 'doorstop_config.ini'), // Config doorstop
      path.join(gameDir, 'winhttp.dll')        // DLL del loader
    ];

    let deletedCount = 0;
    let errors = [];

    for (const itemPath of itemsToDelete) {
      try {
        if (fs.existsSync(itemPath)) {
          const stat = fs.statSync(itemPath);

          if (stat.isDirectory()) {
            // Eliminar carpeta recursivamente
            fs.rmSync(itemPath, { recursive: true, force: true });
            console.log('[Two Point Hospital] 🗑️ Carpeta eliminada:', itemPath);
          } else {
            // Eliminar archivo
            fs.unlinkSync(itemPath);
            console.log('[Two Point Hospital] 🗑️ Archivo eliminado:', itemPath);
          }
          deletedCount++;
        }
      } catch (err) {
        console.error('[Two Point Hospital] ❌ Error eliminando:', itemPath, err.message);
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

  ipcMain.handle('twopointedit:checkModStatus', async (event, profileId) => {
    const gamePath = service.gameConfig[profileId];
    if (!gamePath) {
      return { success: false, error: 'Ruta del juego no configurada.', isBepInExInstalled: false, isModInstalled: false };
    }
    const gameDir = resolveDir(gamePath);

    // Verificar componentes del mod
    const bepInExCorePath = path.join(gameDir, 'BepInEx', 'core', 'BepInEx.dll');
    const pluginPath = path.join(gameDir, 'BepInEx', 'plugins', 'TwoPointHospital_TikControl.dll');
    const winhttpPath = path.join(gameDir, 'winhttp.dll');
    const doorstopPath = path.join(gameDir, 'doorstop_config.ini');

    const isBepInExInstalled = fs.existsSync(bepInExCorePath) && fs.existsSync(winhttpPath) && fs.existsSync(doorstopPath);
    const isModInstalled = isBepInExInstalled && fs.existsSync(pluginPath);

    return { success: true, isBepInExInstalled, isModInstalled };
  });

  ipcMain.handle('twopointedit:isConnected', () => {
    return { success: true, connected: service.isConnected };
  });

  // Asegurarse de que el servidor se detenga al cerrar la aplicación
  app.on('before-quit', async (event) => {
    console.log('[Two Point Hospital] Deteniendo servidor TCP antes de cerrar la aplicación...');
    await service.stop();
  });

  console.log('[Two Point Hospital] ✅ Módulo inicializado, servidor TCP iniciado');
}

module.exports = {
  initialize,
  service
};
