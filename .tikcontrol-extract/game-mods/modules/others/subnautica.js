/**
 * Subnautica - TikControl integration module.
 *
 * Subnautica is Unity Mono, so the in-game side is a BepInEx plugin.
 * The plugin connects back to this TCP server and receives JSON-line commands.
 */

const { app, ipcMain, dialog, shell } = require('electron');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const AdmZip = require('adm-zip');
const { downloadModZip } = require('../downloadModZip');
const { findGamePath } = require('../steamDetect');

const GAME_ID = 'subnautica';
const GAME_NAME = 'Subnautica';
const EXE_NAME = 'Subnautica.exe';
const STEAM_APP_ID = '264710';
const STEAM_LAUNCH_URI = `steam://rungameid/${STEAM_APP_ID}`;
const EPIC_LAUNCH_URI = 'com.epicgames.launcher://apps/Jaguar?action=launch&silent=true';
const TCP_PORT = 9990;
const MOD_URL = 'https://storage.tikcontrol.live/games/subnautica/mod.zip';
const PLUGIN_DIR_PARTS = ['BepInEx', 'plugins', 'TikControl'];
const PLUGIN_DLL_PARTS = [...PLUGIN_DIR_PARTS, 'TikControl.Subnautica.dll'];
const BepInEx_REQUIRED_FILES = [
  ['BepInEx', 'core'],
  ['doorstop_config.ini'],
  ['winhttp.dll']
];

const SUPPORTED_COMMANDS = new Set([
  'notify',
  'heal',
  'damage',
  'add_oxygen',
  'drain_oxygen',
  'oxygen_panic',
  'fill_needs',
  'drain_needs',
  'give_item',
  'survival_kit',
  'resource_pack',
  'rare_pack',
  'teleport_up',
  'launch_forward',
  'speed_boost',
  'slow_swim',
  'set_day',
  'set_night',
  'spawn_creature',
  'spawn_peeper',
  'spawn_stalker',
  'spawn_sandshark',
  'spawn_boneshark',
  'spawn_reaper',
  'creature_roulette',
  'mystery_box'
]);

const COMMON_INSTALL_PATHS = [
  'C:\\Program Files\\Epic Games\\Subnautica',
  'D:\\Epic Games\\Subnautica',
  'E:\\Epic Games\\Subnautica',
  'F:\\Epic Games\\Subnautica',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Subnautica',
  'C:\\Program Files\\Steam\\steamapps\\common\\Subnautica',
  'D:\\SteamLibrary\\steamapps\\common\\Subnautica',
  'E:\\SteamLibrary\\steamapps\\common\\Subnautica'
];

class SubnauticaService {
  constructor() {
    this.mainWindow = null;
    this.server = null;
    this.socket = null;
    this.buffer = '';
    this.pending = new Map();
    this.requestId = 1;
    this.gameConfig = {};
    this.handlersRegistered = false;
  }

  initialize(mainWindow) {
    this.mainWindow = mainWindow;
    this.loadSavedGamePaths();
    this.startServer();
    this.registerIpcHandlers();
    console.log(`[Subnautica] Modulo inicializado en TCP ${TCP_PORT}`);
  }

  loadSavedGamePaths() {
    try {
      const config = this.readConfig();
      for (const [key, value] of Object.entries(config)) {
        if (key.startsWith(`${GAME_ID}_game_path_`)) {
          const profileId = key.replace(`${GAME_ID}_game_path_`, '');
          this.gameConfig[profileId] = value;
        }
      }
      if (config[`${GAME_ID}_game_path`]) this.gameConfig.default = config[`${GAME_ID}_game_path`];
    } catch (error) {
      console.warn('[Subnautica] No se pudieron cargar rutas guardadas:', error.message);
    }
  }

  readConfig() {
    const configPath = path.join(app.getPath('userData'), 'electron-config.json');
    try {
      if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (_) {}
    return {};
  }

  writeConfig(config) {
    const configPath = path.join(app.getPath('userData'), 'electron-config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  getGamePath(profileId) {
    const id = profileId || 'default';
    return this.normalizeGameDir(this.gameConfig[id] || this.gameConfig.default || this.readConfig()[`${GAME_ID}_game_path`] || null);
  }

  saveGamePath(profileId, gamePath) {
    const normalized = this.normalizeGameDir(gamePath);
    if (!normalized) {
      throw new Error(`La ruta no parece ser una instalacion valida de ${GAME_NAME}`);
    }

    const config = this.readConfig();
    const id = profileId || 'default';
    config[`${GAME_ID}_game_path_${id}`] = normalized;
    config[`${GAME_ID}_game_path`] = normalized;
    this.writeConfig(config);
    this.gameConfig[id] = normalized;
    this.gameConfig.default = normalized;
    return normalized;
  }

  normalizeGameDir(candidatePath) {
    if (!candidatePath || typeof candidatePath !== 'string') return null;
    const clean = candidatePath.replace(/^"|"$/g, '');
    if (!fs.existsSync(clean)) return null;
    const stat = fs.statSync(clean);
    const dir = stat.isDirectory() ? clean : path.dirname(clean);
    return fs.existsSync(path.join(dir, EXE_NAME)) ? dir : null;
  }

  isSteamInstall(gamePath) {
    if (!gamePath) return false;
    const normalized = path.resolve(gamePath).toLowerCase();
    const steamCommon = `${path.sep}steamapps${path.sep}common${path.sep}`.toLowerCase();
    if (normalized.includes(steamCommon)) return true;
    const manifestPath = path.resolve(gamePath, '..', '..', `appmanifest_${STEAM_APP_ID}.acf`);
    return fs.existsSync(manifestPath);
  }

  isEpicInstall(gamePath) {
    return !!gamePath && fs.existsSync(path.join(gamePath, '.egstore'));
  }

  findGame() {
    const saved = this.getGamePath();
    if (saved) return { success: true, path: saved, gamePath: saved, source: 'saved' };

    const steamPath = findGamePath('Subnautica', EXE_NAME);
    if (steamPath) return { success: true, path: steamPath, gamePath: steamPath, source: 'steam' };

    for (const candidate of COMMON_INSTALL_PATHS) {
      const normalized = this.normalizeGameDir(candidate);
      if (normalized) return { success: true, path: normalized, gamePath: normalized, source: 'common' };
    }

    return { success: false, error: `${GAME_NAME} no encontrado` };
  }

  isBepInExInstalled(gamePath) {
    return BepInEx_REQUIRED_FILES.every((parts) => fs.existsSync(path.join(gamePath, ...parts)));
  }

  isModInstalled(profileId) {
    const gamePath = this.getGamePath(profileId);
    if (!gamePath) return false;
    return this.isBepInExInstalled(gamePath) && fs.existsSync(path.join(gamePath, ...PLUGIN_DLL_PARTS));
  }

  startServer() {
    if (this.server) return;

    this.server = net.createServer((socket) => {
      if (this.socket && !this.socket.destroyed) this.socket.destroy();
      this.socket = socket;
      this.buffer = '';
      socket.setEncoding('utf8');
      socket.setKeepAlive(true);
      console.log('[Subnautica] Juego conectado');
      this.sendRenderer('subnautica:connected', true);

      socket.on('data', (chunk) => this.handleData(chunk));
      socket.on('close', () => {
        if (this.socket === socket) this.socket = null;
        console.log('[Subnautica] Juego desconectado');
        this.rejectPending('Subnautica se desconecto');
        this.sendRenderer('subnautica:connected', false);
      });
      socket.on('error', (error) => {
        console.warn('[Subnautica] Socket error:', error.message);
      });
    });

    this.server.on('error', (error) => {
      console.error('[Subnautica] Error TCP:', error.message);
    });

    this.server.listen(TCP_PORT, '127.0.0.1', () => {
      console.log(`[Subnautica] Servidor TCP escuchando en 127.0.0.1:${TCP_PORT}`);
    });
  }

  handleData(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) this.handleMessage(line);
    }
  }

  handleMessage(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      console.warn('[Subnautica] Mensaje JSON invalido:', line);
      return;
    }

    if (message.type === 'response' && message.requestId) {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.requestId);
      pending.resolve({
        success: !!message.success,
        message: message.message || '',
        error: message.error || (message.success ? null : message.message)
      });
      return;
    }

    if (message.type === 'event') {
      console.log('[Subnautica] Evento:', message.event, message.data || '');
    }
  }

  normalizeCommand(command) {
    return String(command || '').trim().toLowerCase();
  }

  buildPayload(command, parameters = {}) {
    const payload = {
      type: 'effect',
      effectId: command,
      username: parameters.username || parameters.viewerName || parameters.name || 'TikControl',
      profileImageUrl: parameters.profileImageUrl || ''
    };

    const passthroughKeys = [
      'amount',
      'duration',
      'quantity',
      'item',
      'creature',
      'value',
      'message',
      'force'
    ];
    for (const key of passthroughKeys) {
      if (parameters[key] !== undefined && parameters[key] !== null && parameters[key] !== '') {
        payload[key] = parameters[key];
      }
    }

    if (!payload.amount && parameters.param_amount) payload.amount = parameters.param_amount;
    if (!payload.quantity && parameters.param_quantity) payload.quantity = parameters.param_quantity;
    if (!payload.item && parameters.param_item) payload.item = parameters.param_item;
    if (!payload.creature && parameters.param_creature) payload.creature = parameters.param_creature;
    if (!payload.value && parameters.param_value) payload.value = parameters.param_value;
    return payload;
  }

  async executeCommand(commandId, parameters = {}) {
    const command = this.normalizeCommand(commandId);
    if (!SUPPORTED_COMMANDS.has(command)) {
      return { success: false, error: `Comando no soportado por ${GAME_NAME}: ${commandId}` };
    }
    if (!this.socket || this.socket.destroyed) {
      return { success: false, error: `${GAME_NAME} no conectado. Abre el juego con el mod instalado.` };
    }

    const payload = this.buildPayload(command, parameters);
    return this.sendRequest(payload);
  }

  sendRequest(payload) {
    const requestId = this.requestId++;
    const body = { ...payload, requestId };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ success: false, error: 'Timeout esperando respuesta del mod de Subnautica' });
      }, 10000);

      this.pending.set(requestId, { resolve, timeout });
      try {
        this.socket.write(JSON.stringify(body) + '\n');
        console.log('[Subnautica] Comando enviado:', body.effectId, body);
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(requestId);
        resolve({ success: false, error: error.message });
      }
    });
  }

  rejectPending(reason) {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.resolve({ success: false, error: reason });
      this.pending.delete(requestId);
    }
  }

  sendRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  sendProgress(message) {
    this.sendRenderer('subnautica:install-progress', { message });
  }

  async installMod(profileId) {
    const gamePath = this.getGamePath(profileId);
    if (!gamePath) throw new Error('Primero debes configurar la ruta del juego');

    const localZip = path.join(__dirname, '..', '..', 'aws', GAME_ID, 'mod.zip');
    const tmpZip = path.join(os.tmpdir(), 'tikcontrol-subnautica-mod.zip');
    const sourceZip = (!app.isPackaged && fs.existsSync(localZip)) ? localZip : tmpZip;

    if (sourceZip === tmpZip) {
      this.sendProgress('Descargando mod...');
      await downloadModZip(MOD_URL, tmpZip, {
        retries: 1,
        expectedEntries: ['BepInEx/plugins/TikControl/TikControl.Subnautica.dll'],
        onRetry: () => this.sendProgress('Reintentando descarga...')
      });
    } else {
      this.sendProgress('Usando mod local...');
    }

    this.sendProgress('Instalando mod...');
    const zip = new AdmZip(sourceZip);
    zip.extractAllTo(gamePath, true);
    try { if (sourceZip === tmpZip) fs.unlinkSync(tmpZip); } catch (_) {}

    const modInstalled = this.isModInstalled(profileId);
    if (!modInstalled) {
      return {
        success: false,
        error: 'Instalacion incompleta: falta BepInEx para Subnautica o el DLL de TikControl.',
        modInstalled: false
      };
    }

    return {
      success: true,
      message: `Mod de ${GAME_NAME} instalado correctamente.`,
      modInstalled
    };
  }

  uninstallMod(profileId) {
    const gamePath = this.getGamePath(profileId);
    if (!gamePath) throw new Error('No hay ruta del juego configurada');

    const pluginDir = path.join(gamePath, ...PLUGIN_DIR_PARTS);
    this.removePathInsideGame(gamePath, pluginDir);
    return { success: true, message: `Mod de ${GAME_NAME} desinstalado correctamente.` };
  }

  removePathInsideGame(gamePath, targetPath) {
    const root = path.resolve(gamePath);
    const target = path.resolve(targetPath);
    if (!target.startsWith(root + path.sep)) {
      throw new Error('Ruta de desinstalacion no valida');
    }
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  }

  async launchGame(profileId) {
    const gamePath = this.getGamePath(profileId) || this.findGame().gamePath;
    if (gamePath) {
      if (this.isSteamInstall(gamePath)) {
        await shell.openExternal(STEAM_LAUNCH_URI);
        return { success: true, method: 'steam' };
      }

      if (this.isEpicInstall(gamePath)) {
        await shell.openExternal(EPIC_LAUNCH_URI);
        return { success: true, method: 'epic' };
      }

      const exe = path.join(gamePath, EXE_NAME);
      if (fs.existsSync(exe)) {
        const { spawn } = require('child_process');
        spawn(`"${exe}"`, [], { detached: true, stdio: 'ignore', cwd: gamePath, shell: true });
        return { success: true, method: 'direct' };
      }
    }

    const steamPath = findGamePath('Subnautica', EXE_NAME);
    if (steamPath) {
      await shell.openExternal(STEAM_LAUNCH_URI);
      return { success: true, method: 'steam' };
    }

    await shell.openExternal(EPIC_LAUNCH_URI);
    return { success: true, method: 'epic' };
  }

  registerIpcHandlers() {
    if (this.handlersRegistered) return;
    this.handlersRegistered = true;

    ipcMain.handle('subnautica:isConnected', async (_event, profileId) => ({
      connected: !!(this.socket && !this.socket.destroyed),
      gamePath: this.getGamePath(profileId),
      modInstalled: this.isModInstalled(profileId)
    }));

    ipcMain.handle('subnautica:executeEffect', async (_event, command, parameters = {}) => (
      this.executeCommand(command, parameters)
    ));

    ipcMain.handle('subnautica:setGamePath', async (_event, profileId, gamePath) => {
      if (gamePath === undefined && typeof profileId === 'string') {
        gamePath = profileId;
        profileId = null;
      }
      const savedPath = this.saveGamePath(profileId, gamePath);
      return { success: true, path: savedPath, gamePath: savedPath };
    });

    ipcMain.handle('subnautica:getGamePath', async (_event, profileId) => {
      const gamePath = this.getGamePath(profileId);
      return gamePath ? { success: true, path: gamePath, gamePath } : null;
    });

    ipcMain.handle('subnautica:findGame', async () => this.findGame());

    ipcMain.handle('subnautica:selectGamePath', async () => {
      const result = await dialog.showOpenDialog({
        title: `Selecciona la carpeta de ${GAME_NAME}`,
        properties: ['openDirectory']
      });
      if (result.canceled || !result.filePaths?.length) return { success: false, canceled: true };
      const gamePath = this.normalizeGameDir(result.filePaths[0]);
      return gamePath ? { success: true, path: gamePath, gamePath } : { success: false, error: 'Ruta invalida' };
    });

    ipcMain.handle('subnautica:checkModStatus', async (_event, profileId) => {
      const gamePath = this.getGamePath(profileId);
      if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };
      return {
        installed: this.isModInstalled(profileId),
        gamePath,
        bepinexInstalled: this.isBepInExInstalled(gamePath)
      };
    });

    ipcMain.handle('subnautica:installMod', async (_event, profileId) => this.installMod(profileId));
    ipcMain.handle('subnautica:uninstallMod', async (_event, profileId) => this.uninstallMod(profileId));
    ipcMain.handle('subnautica:launchGame', async (_event, profileId) => this.launchGame(profileId));
  }

  stop() {
    this.rejectPending('Modulo Subnautica cerrado');
    if (this.socket && !this.socket.destroyed) this.socket.destroy();
    this.socket = null;
    if (this.server) this.server.close();
    this.server = null;
  }
}

const service = new SubnauticaService();

module.exports = {
  initialize: (mainWindow) => service.initialize(mainWindow),
  executeCommand: (command, params) => service.executeCommand(command, params),
  getConnectionStatus: () => ({ connected: !!(service.socket && !service.socket.destroyed) }),
  stop: () => service.stop()
};
