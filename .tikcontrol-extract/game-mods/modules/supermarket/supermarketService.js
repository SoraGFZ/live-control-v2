/**
 * TikControl - Supermarket Together Service
 * Servicio de comunicación con el mod de Supermarket Together
 * Puerto: 55001
 */

const http = require('http');
const { ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { resolveSetGamePathArgs } = require('../setGamePathArgs');

const SUPERMARKET_PORT = 55001;
const SUPERMARKET_HOST = '127.0.0.1';
const GAME_EXE = 'Supermarket Together.exe';

// Store para configuración (lazy initialization)
let store = null;
function getStore() {
  if (!store) {
    try {
      const Store = require('electron-store');
      store = new Store({
        name: 'tikcontrol-supermarket',
        defaults: {
          gamePath: ''
        }
      });
    } catch (e) {
      // console.warn('[Supermarket] electron-store no disponible, usando fallback en memoria');
      // Fallback: usar objeto simple
      store = {
        _data: { gamePath: '' },
        get: function(key) { return this._data[key]; },
        set: function(key, value) { this._data[key] = value; }
      };
    }
  }
  return store;
}

class SupermarketService {
  constructor() {
    this.isInitialized = false;
    this.lastCommandTime = 0;
    this.commandQueue = [];
    this.isProcessingQueue = false;
    this.gamePath = '';
  }

  /**
   * Inicializa el servicio y registra los handlers IPC
   */
  init() {
    // [log cleaned]
    if (this.isInitialized) {
      // [log cleaned]
      return;
    }

    try {
      // Cargar gamePath del store
      // [log cleaned]
      this.gamePath = getStore().get('gamePath') || '';
      // console.log('[Supermarket] 📂 gamePath:', this.gamePath || '(no configurado)');
      
      // [log cleaned]
      this.registerIPCHandlers();
      
      this.isInitialized = true;
      // [log cleaned]
    } catch (e) {
      console.error('[Supermarket] ❌ Error en init():', e.message);
      console.error('[Supermarket] Stack:', e.stack);
    }
  }

  /**
   * Registra los handlers IPC para comunicación con el renderer
   */
  registerIPCHandlers() {
    // [log cleaned]
    // Ejecutar comando
    ipcMain.handle('supermarket:execute', async (event, command, options = {}) => {
      // [log cleaned]
      return this.executeCommand(command, options);
    });

    // Verificar conexión con el juego
    ipcMain.handle('supermarket:checkConnection', async () => {
      return this.checkConnection();
    });

    // Obtener lista de comandos
    ipcMain.handle('supermarket:getCommands', async () => {
      return this.getCommands();
    });

    // Instalar mod
    ipcMain.handle('supermarket:installMod', async () => {
      const gamePath = this.gamePath || getStore().get('gamePath');
      if (!gamePath) {
        return { success: false, error: 'No se ha configurado la ruta del juego' };
      }
      return this.installMod(gamePath);
    });

    // Desinstalar mod
    ipcMain.handle('supermarket:uninstallMod', async () => {
      const gamePath = this.gamePath || getStore().get('gamePath');
      if (!gamePath) {
        return { success: false, error: 'No se ha configurado la ruta del juego' };
      }
      return this.uninstallMod(gamePath);
    });

    // Verificar si el mod está instalado
    ipcMain.handle('supermarket:checkModInstalled', async (event, gamePath) => {
      const pathToCheck = gamePath || this.gamePath || getStore().get('gamePath');
      return this.checkModInstalled(pathToCheck);
    });

    // Obtener ruta del juego
    ipcMain.handle('supermarket:getGamePath', async () => {
      return { success: true, path: this.gamePath || getStore().get('gamePath') || '' };
    });

    // Establecer ruta del juego (Gaming: profileId + path)
    ipcMain.handle('supermarket:setGamePath', async (event, a, b) => {
      const { path: resolved } = resolveSetGamePathArgs(a, b);
      if (!resolved || !fs.existsSync(resolved)) {
        return { success: false, error: 'Ruta no válida' };
      }
      this.gamePath = resolved;
      getStore().set('gamePath', resolved);
      return { success: true, path: resolved };
    });

    // Seleccionar ruta del juego
    ipcMain.handle('supermarket:selectGamePath', async () => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Seleccionar carpeta de Supermarket Together',
          properties: ['openDirectory'],
          defaultPath: this.gamePath || undefined
        });

        if (result.canceled || !result.filePaths[0]) {
          return { success: false, canceled: true };
        }

        const selectedPath = result.filePaths[0];
        
        // Verificar que el ejecutable existe
        const exePath = path.join(selectedPath, GAME_EXE);
        if (!fs.existsSync(exePath)) {
          return { 
            success: false, 
            error: `No se encontró "${GAME_EXE}" en la carpeta seleccionada` 
          };
        }

        this.gamePath = selectedPath;
        getStore().set('gamePath', selectedPath);
        
        // [log cleaned]
        return { success: true, path: selectedPath };
      } catch (error) {
        console.error('[Supermarket] ❌ Error seleccionando ruta:', error);
        return { success: false, error: error.message };
      }
    });

    // Buscar juego automáticamente
    ipcMain.handle('supermarket:findGame', async () => {
      return this.findGame();
    });

    // Lanzar juego
    ipcMain.handle('supermarket:launchGame', async () => {
      return this.launchGame();
    });

    // [log cleaned]
  }

  /**
   * Busca el juego en ubicaciones comunes
   */
  async findGame() {
    const commonPaths = [
      // Steam
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Supermarket Together',
      'C:\\Program Files\\Steam\\steamapps\\common\\Supermarket Together',
      'D:\\Steam\\steamapps\\common\\Supermarket Together',
      'D:\\SteamLibrary\\steamapps\\common\\Supermarket Together',
      'E:\\Steam\\steamapps\\common\\Supermarket Together',
      'E:\\SteamLibrary\\steamapps\\common\\Supermarket Together',
      // GOG
      'C:\\GOG Games\\Supermarket Together',
      'D:\\GOG Games\\Supermarket Together',
      // Epic Games
      'C:\\Program Files\\Epic Games\\SupermarketTogether',
      'D:\\Epic Games\\SupermarketTogether',
    ];

    for (const gamePath of commonPaths) {
      const exePath = path.join(gamePath, GAME_EXE);
      if (fs.existsSync(exePath)) {
        this.gamePath = gamePath;
        getStore().set('gamePath', gamePath);
        // [log cleaned]
        return { success: true, path: gamePath };
      }
    }

    // Si ya hay una ruta guardada, verificar que sigue siendo válida
    const savedPath = getStore().get('gamePath');
    if (savedPath && fs.existsSync(path.join(savedPath, GAME_EXE))) {
      this.gamePath = savedPath;
      return { success: true, path: savedPath };
    }

    return { success: false, error: 'No se encontró el juego automáticamente' };
  }

  /**
   * Lanza el juego
   */
  async launchGame() {
    try {
      const steamUrl = 'steam://rungameid/2709570';
      try {
        await shell.openExternal(steamUrl);
        return { success: true, method: 'steam' };
      } catch (_) {}

      const gamePath = this.gamePath || getStore().get('gamePath');
      if (gamePath) {
        const exePath = path.join(gamePath, GAME_EXE);
        if (fs.existsSync(exePath)) {
          await shell.openPath(exePath);
          return { success: true, method: 'direct' };
        }
      }
      return { success: false, error: 'No se pudo lanzar el juego. Configura la ruta o ábrelo desde Steam.' };
    } catch (error) {
      console.error('[Supermarket] ❌ Error lanzando juego:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Ejecuta un comando en Supermarket Together
   * @param {string} command - El comando a ejecutar (ej: 'spawnnpc', 'givemoney:100')
   * @param {object} options - Opciones adicionales
   */
  async executeCommand(command, options = {}) {
    try {
      const { username = '', repetitions = 1, effect = null } = options;

      // Parsear comando y parámetro (formato: comando:valor)
      let endpoint = command;
      let effectValue = effect; // Usar effect de options si existe

      if (command.includes(':')) {
        const parts = command.split(':');
        endpoint = parts[0];
        effectValue = parts[1];
      }

      // [log cleaned]
      // console.log(`[Supermarket] 📋 Options recibidas:`, JSON.stringify(options));

      // Construir body de la petición según el tipo de comando
      const body = {};
      
      // Comandos que requieren "effect" (valores numéricos/texto)
      const effectCommands = ['givemoney', 'jailplayer', 'franchisepoint', 'storename'];
      
      // Comandos que requieren "name" (nombre del NPC/Cliente)
      const nameCommands = ['spawnnpc', 'spawncustomer'];
      
      // Comandos que NO requieren parámetros (se ejecutan directamente)
      const noParamCommands = ['randombox', 'spawntrash', 'clearalltrash', 'clearrandomtrash', 'uplevelstore'];
      
      if (effectCommands.includes(endpoint.toLowerCase())) {
        // Estos comandos usan "effect" para el valor
        body.effect = effectValue || '100'; // Valor por defecto
        // [log cleaned]
      } else if (nameCommands.includes(endpoint.toLowerCase())) {
        // Estos comandos usan "name" para el nombre del NPC/Cliente
        // IMPORTANTE: El mod requiere "name" para que funcione
        body.name = username || 'TikControl';
        // [log cleaned]
      } else if (noParamCommands.includes(endpoint.toLowerCase())) {
        // Estos comandos no necesitan parámetros
        // [log cleaned]
      }
      
      // Si hay efectValue para otros comandos, añadirlo
      if (effectValue && !effectCommands.includes(endpoint.toLowerCase())) {
        body.effect = effectValue;
      }
      
      // Si hay username y no es un comando de name, añadirlo de todas formas
      if (username && !nameCommands.includes(endpoint.toLowerCase())) {
        body.name = username;
      }
      
      // console.log(`[Supermarket] 📦 Body final:`, JSON.stringify(body));

      // Ejecutar las repeticiones
      const results = [];
      for (let i = 0; i < repetitions; i++) {
        const result = await this.sendRequest(endpoint, body);
        results.push(result);
        
        // Pequeño delay entre repeticiones
        if (i < repetitions - 1) {
          await this.delay(100);
        }
      }

      return {
        success: true,
        command: endpoint,
        effectValue,
        repetitions,
        results
      };

    } catch (error) {
      console.error('[Supermarket] ❌ Error ejecutando comando:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Envía una petición HTTP al mod
   * @param {string} endpoint - El endpoint (comando)
   * @param {object} body - El body de la petición
   */
  sendRequest(endpoint, body = {}) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);

      const options = {
        hostname: SUPERMARKET_HOST,
        port: SUPERMARKET_PORT,
        path: `/${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 5000
      };

      // [log cleaned]
      // [log cleaned]
      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          // [log cleaned]
          resolve({
            statusCode: res.statusCode,
            data: data
          });
        });
      });

      req.on('error', (error) => {
        console.error(`[Supermarket] ❌ Error de conexión:`, error.message);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout: El juego no respondió'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Verifica la conexión con el juego
   */
  async checkConnection() {
    try {
      // Intentamos enviar un comando OPTIONS para verificar
      return new Promise((resolve) => {
        const options = {
          hostname: SUPERMARKET_HOST,
          port: SUPERMARKET_PORT,
          path: '/',
          method: 'OPTIONS',
          timeout: 2000
        };

        const req = http.request(options, (res) => {
          resolve({
            connected: true,
            statusCode: res.statusCode
          });
        });

        req.on('error', () => {
          resolve({
            connected: false,
            error: 'No se pudo conectar al juego'
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            connected: false,
            error: 'Timeout'
          });
        });

        req.end();
      });
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Obtiene la lista de comandos disponibles
   */
  getCommands() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const commandsPath = path.join(__dirname, '..', 'renderer', 'data', 'tikcontrol-supermarket-commands.json');
      const data = fs.readFileSync(commandsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('[Supermarket] ❌ Error cargando comandos:', error);
      return null;
    }
  }

  /**
   * Instala el mod de Supermarket Together
   * @param {string} gamePath - Ruta del juego
   */
  async installMod(gamePath) {
    const fs = require('fs');
    const path = require('path');
    const https = require('https');
    const AdmZip = require('adm-zip');

    const MOD_URL = 'https://storage.tikcontrol.live/games/supermarket/SupermarketMod.zip';

    try {
      // [log cleaned]
      // Crear directorio temporal
      const tempDir = path.join(require('os').tmpdir(), 'tikcontrol-supermarket');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const zipPath = path.join(tempDir, 'SupermarketMod.zip');

      // Descargar el archivo
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(zipPath);
        
        const request = (url) => {
          https.get(url, (response) => {
            // Manejar redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
              request(response.headers.location);
              return;
            }

            if (response.statusCode !== 200) {
              reject(new Error(`Error descargando: ${response.statusCode}`));
              return;
            }

            response.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          }).on('error', reject);
        };

        request(MOD_URL);
      });

      // [log cleaned]
      // Extraer el ZIP
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(gamePath, true);

      // Guardar manifest de archivos instalados
      const manifestPath = path.join(gamePath, 'tikcontrol_supermarket_manifest.json');
      const manifest = {
        installedAt: new Date().toISOString(),
        version: '1.0.0',
        files: zip.getEntries().map(e => e.entryName)
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // Limpiar temporal
      fs.unlinkSync(zipPath);

      // [log cleaned]
      return {
        success: true,
        message: 'Mod instalado correctamente',
        filesInstalled: manifest.files.length
      };

    } catch (error) {
      console.error('[Supermarket] ❌ Error instalando mod:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Desinstala el mod de Supermarket Together
   * @param {string} gamePath - Ruta del juego
   */
  async uninstallMod(gamePath) {
    const fs = require('fs');
    const path = require('path');

    try {
      // [log cleaned]
      const filesToDelete = [
        'TikControl_SupermarketTogether',
        'S2E_SupermarketTogether', // Eliminar versión legacy
        'doorstop_config.ini',
        'winhttp.dll',
        'tikcontrol_info.json',
        's2e_info.json', // Eliminar versión legacy
        'tikcontrol_supermarket_manifest.json'
      ];

      let deletedCount = 0;

      for (const file of filesToDelete) {
        const filePath = path.join(gamePath, file);
        
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          
          if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
          
          deletedCount++;
          // [log cleaned]
        }
      }

      // [log cleaned]
      return {
        success: true,
        message: 'Mod desinstalado correctamente',
        filesDeleted: deletedCount
      };

    } catch (error) {
      console.error('[Supermarket] ❌ Error desinstalando mod:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verifica si el mod está instalado
   * @param {string} gamePath - Ruta del juego
   */
  checkModInstalled(gamePath) {
    const fs = require('fs');
    const path = require('path');

    try {
      // Buscar versión TikControl
      const tikcontrolDllPath = path.join(gamePath, 'TikControl_SupermarketTogether', 'tikcontrol-supermarket-together.dll');
      // Buscar versión legacy
      const s2eDllPath = path.join(gamePath, 'S2E_SupermarketTogether', 's2e-supermarket-together.dll');
      const configPath = path.join(gamePath, 'doorstop_config.ini');

      const tikcontrolExists = fs.existsSync(tikcontrolDllPath);
      const s2eExists = fs.existsSync(s2eDllPath);
      const configExists = fs.existsSync(configPath);

      const dllExists = tikcontrolExists || s2eExists;

      return {
        installed: dllExists && configExists,
        dllExists,
        tikcontrolVersion: tikcontrolExists,
        legacyVersion: s2eExists && !tikcontrolExists,
        configExists,
        gamePath
      };

    } catch (error) {
      return {
        installed: false,
        error: error.message
      };
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton
const supermarketService = new SupermarketService();

module.exports = supermarketService;

