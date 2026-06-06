/**
 * Subnautica 2 - TikControl integration module.
 *
 * Subnautica 2 is Unreal Engine. The in-game side is a UE4SS Lua mod that
 * reads command files from its mod folder and writes JSON responses back.
 */

const { app, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const AdmZip = require('adm-zip');
const { downloadModZip } = require('../downloadModZip');
const { findGamePath } = require('../steamDetect');

const GAME_ID = 'subnautica2';
const GAME_NAME = 'Subnautica 2';
const ROOT_EXE = 'Subnautica2.exe';
const SHIPPING_EXE_PARTS = ['Subnautica2', 'Binaries', 'Win64', 'Subnautica2-Win64-Shipping.exe'];
const WIN64_PARTS = ['Subnautica2', 'Binaries', 'Win64'];
const STEAM_APP_ID = '1962700';
const STEAM_LAUNCH_URI = `steam://rungameid/${STEAM_APP_ID}`;
const STEAM_STORE_URL = `https://store.steampowered.com/app/${STEAM_APP_ID}/Subnautica_2/`;
const MOD_URL = 'https://storage.tikcontrol.live/games/subnautica2/mod-0.2.8-safe-asset-load.zip';
const UE4SS_URL = 'https://github.com/Subnautica2Modding/Subnautica2-UE4SS/releases/download/1.0.0-pre.1/UE4SS_SN2.zip';
const MOD_DIR_PARTS = [...WIN64_PARTS, 'ue4ss', 'Mods', 'TikControl'];
const MOD_SCRIPT_PARTS = [...MOD_DIR_PARTS, 'Scripts', 'main.lua'];
const STATUS_MAX_AGE_MS = 9000;
const COMMAND_TIMEOUT_MS = 30000;
const MODULE_VERSION = '0.2.8-safe-asset-load';

const ITEM_KEYS = [
  'titanium', 'copper', 'quartz', 'silver', 'gold', 'lead', 'lithium', 'diamond',
  'sulfur', 'salt', 'atacamite', 'celestine', 'plasteel', 'rubber', 'glass',
  'computer_chip', 'wiring_kit', 'advanced_wiring_kit', 'battery', 'advanced_battery',
  'scanner', 'water', 'water_filter_gland', 'isotonic_drink', 'oxygen_bottle', 'food',
  'halfmoon_jerky', 'oily_salad', 'air_bladder', 'flare', 'flashlight', 'power_cell',
  'repair_tool'
];

const SPAWN_ITEM_KEYS = [
  'titanium', 'copper', 'quartz', 'silver', 'gold', 'lead', 'lithium', 'diamond',
  'sulfur', 'salt', 'atacamite', 'celestine', 'slime', 'acid_sac', 'plasteel',
  'rubber', 'glass', 'computer_chip', 'wiring_kit', 'advanced_battery', 'water',
  'food', 'water_filter_gland'
];

const CREATURE_KEYS = [
  'collector_leviathan', 'hammerhead', 'waxmoon', 'cerathecan', 'needler', 'sandspear',
  'nibbler', 'marrowbreach', 'twin_eel', 'jetocaris', 'epicurean', 'coral_crab',
  'surge_jelly', 'jellyfisher', 'scourge_hive', 'jelly_ring', 'four_eye', 'quadrate',
  'geordie', 'electric_geordie', 'houndgar', 'sea_olive', 'bullethead', 'flashfish',
  'epicurean_symbiote', 'blight_parasite', 'anemone_crab', 'halfmoon', 'pneumo',
  'spineytail'
];

const SUPPORTED_COMMANDS = new Set([
  'notify',
  'test_connection',
  'console',
  'recovery',
  'survival_toggle',
  'player_event',
  'inventory_item',
  'drop_item',
  'creature_event',
  'world_event',
  'submarine_event',
  'heal',
  'restore_health',
  'restore_food',
  'restore_water',
  'restore_vitals',
  'survival_pack',
  'builder_pack',
  'tech_pack',
  'emergency_rescue',
  'damage',
  'add_oxygen',
  'drain_oxygen',
  'oxygen_panic',
  'hunger',
  'thirst',
  'god',
  'set_day',
  'set_night',
  'warp_forward',
  'launch_forward',
  'teleport_up',
  'teleport_lifepod',
  'fast_swim',
  'slow_swim',
  'normal_speed',
  'invisible',
  'unlock_all',
  'set_fov',
  'set_time',
  'toggle_hud',
  'kill_player',
  'give_item',
  'random_item',
  'spawn_item',
  'spawn_random_item',
  'resource_pack',
  'rare_pack',
  'spawn_creature',
  'creature_roulette',
  'hostile_roulette',
  'small_swarm',
  'mystery_box',
  'free_build',
  'no_cost',
  'repair_submarine',
  'deflood_submarine',
  'damage_submarine',
  'toggle_fog',
  ...ITEM_KEYS.map((key) => `give_${key}`),
  ...SPAWN_ITEM_KEYS.map((key) => `spawn_${key}`),
  ...CREATURE_KEYS.map((key) => `spawn_${key}`)
]);

const COMMON_INSTALL_PATHS = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Subnautica2',
  'C:\\Program Files\\Steam\\steamapps\\common\\Subnautica2',
  'D:\\SteamLibrary\\steamapps\\common\\Subnautica2',
  'E:\\SteamLibrary\\steamapps\\common\\Subnautica2',
  'F:\\SteamLibrary\\steamapps\\common\\Subnautica2'
];

function compareBridgeVersions(a, b) {
  const parse = (value) => {
    const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)/);
    return match ? match.slice(1).map((part) => Number(part)) : null;
  };

  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;

  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }

  return 0;
}

function addCatalogCommandsFromFile(target, filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return false;
    const catalog = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const commands = Array.isArray(catalog.commands) ? catalog.commands : [];
    for (const command of commands) {
      for (const key of ['id', 'command']) {
        const value = String(command?.[key] || '').trim().toLowerCase();
        if (value) target.add(value);
      }
    }
    return commands.length > 0;
  } catch (error) {
    console.warn('[Subnautica2] No se pudo leer catalogo de comandos:', error.message);
    return false;
  }
}

function loadCatalogCommandIds() {
  const ids = new Set();
  addCatalogCommandsFromFile(ids, path.join(__dirname, '..', '..', 'aws', GAME_ID, 'commands.json'));

  if (process.resourcesPath) {
    addCatalogCommandsFromFile(ids, path.join(process.resourcesPath, 'game-mods', 'aws', GAME_ID, 'commands.json'));
  }

  return ids;
}

class Subnautica2Service {
  constructor() {
    this.mainWindow = null;
    this.gameConfig = {};
    this.handlersRegistered = false;
    this.requestId = 1;
    this.commandQueue = Promise.resolve();
    this.catalogCommandIds = loadCatalogCommandIds();
  }

  initialize(mainWindow) {
    this.mainWindow = mainWindow;
    this.catalogCommandIds = loadCatalogCommandIds();
    this.loadSavedGamePaths();
    this.registerIpcHandlers();
    console.log(
      `[Subnautica2] Modulo ${MODULE_VERSION} inicializado con file bridge UE4SS`,
      { catalogCommands: [...this.catalogCommandIds].sort().join(', ') }
    );
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
      console.warn('[Subnautica2] No se pudieron cargar rutas guardadas:', error.message);
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
    return this.normalizeGameDir(
      this.gameConfig[id] ||
      this.gameConfig.default ||
      this.readConfig()[`${GAME_ID}_game_path`] ||
      null
    );
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

    if (fs.existsSync(path.join(dir, ROOT_EXE)) && fs.existsSync(path.join(dir, ...SHIPPING_EXE_PARTS))) {
      return dir;
    }

    if (path.basename(dir).toLowerCase() === 'win64' && fs.existsSync(path.join(dir, 'Subnautica2-Win64-Shipping.exe'))) {
      const root = path.resolve(dir, '..', '..', '..');
      if (fs.existsSync(path.join(root, ROOT_EXE))) return root;
    }

    const nestedWin64 = path.join(dir, ...WIN64_PARTS);
    if (fs.existsSync(path.join(nestedWin64, 'Subnautica2-Win64-Shipping.exe'))) {
      return dir;
    }

    return null;
  }

  getWin64Dir(gamePath) {
    return gamePath ? path.join(gamePath, ...WIN64_PARTS) : null;
  }

  getBridgeDir(gamePath) {
    return gamePath ? path.join(gamePath, ...MOD_DIR_PARTS) : null;
  }

  getBridgeFile(gamePath, name) {
    const bridgeDir = this.getBridgeDir(gamePath);
    return bridgeDir ? path.join(bridgeDir, name) : null;
  }

  isSteamInstall(gamePath) {
    if (!gamePath) return false;
    const normalized = path.resolve(gamePath).toLowerCase();
    const steamCommon = `${path.sep}steamapps${path.sep}common${path.sep}`.toLowerCase();
    if (normalized.includes(steamCommon)) return true;
    const manifestPath = path.resolve(gamePath, '..', '..', `appmanifest_${STEAM_APP_ID}.acf`);
    return fs.existsSync(manifestPath);
  }

  findGame() {
    const saved = this.getGamePath();
    if (saved) return { success: true, path: saved, gamePath: saved, source: 'saved' };

    const steamPath = findGamePath(GAME_ID, ROOT_EXE) || findGamePath('Subnautica2', ROOT_EXE);
    if (steamPath) return { success: true, path: steamPath, gamePath: steamPath, source: 'steam' };

    for (const candidate of COMMON_INSTALL_PATHS) {
      const normalized = this.normalizeGameDir(candidate);
      if (normalized) return { success: true, path: normalized, gamePath: normalized, source: 'common' };
    }

    return { success: false, error: `${GAME_NAME} no encontrado` };
  }

  isUE4SSInstalled(gamePath) {
    const win64 = this.getWin64Dir(gamePath);
    return !!win64 &&
      fs.existsSync(path.join(win64, 'dwmapi.dll')) &&
      fs.existsSync(path.join(win64, 'ue4ss', 'UE4SS.dll'));
  }

  isModInstalled(profileId) {
    const gamePath = this.getGamePath(profileId);
    return !!gamePath &&
      this.isUE4SSInstalled(gamePath) &&
      fs.existsSync(path.join(gamePath, ...MOD_SCRIPT_PARTS));
  }

  getModScriptPath(profileId) {
    const gamePath = this.getGamePath(profileId);
    return gamePath ? path.join(gamePath, ...MOD_SCRIPT_PARTS) : null;
  }

  getInstalledModVersion(profileId) {
    const scriptPath = this.getModScriptPath(profileId);
    if (!scriptPath || !fs.existsSync(scriptPath)) return null;

    try {
      const content = fs.readFileSync(scriptPath, 'utf8');
      const match = content.match(/BRIDGE_VERSION\s*=\s*["']([^"']+)["']/);
      return match ? match[1] : 'legacy';
    } catch (_) {
      return null;
    }
  }

  getModVersionState(profileId, status = null) {
    const installedVersion = this.getInstalledModVersion(profileId);
    const targetVersion = MODULE_VERSION;
    const installed = this.isModInstalled(profileId);
    const runningVersion = status?.bridgeVersion || (status?.connected ? 'legacy' : null);
    const versionCompare = compareBridgeVersions(installedVersion, targetVersion);
    const needsUpdate = installed && (
      !installedVersion ||
      installedVersion === 'legacy' ||
      (versionCompare === null ? installedVersion !== targetVersion : versionCompare < 0)
    );
    const needsRestart = status?.connected === true &&
      installedVersion === targetVersion &&
      runningVersion !== targetVersion;

    return {
      installedVersion,
      targetVersion,
      runningVersion,
      needsUpdate,
      needsRestart
    };
  }

  readStatus(profileId) {
    const gamePath = this.getGamePath(profileId);
    const statusFile = this.getBridgeFile(gamePath, 'bridge_status.json');
    if (!statusFile || !fs.existsSync(statusFile)) {
      return { connected: false, inGame: false, gamePath, modInstalled: this.isModInstalled(profileId) };
    }

    try {
      const stat = fs.statSync(statusFile);
      const fresh = (Date.now() - stat.mtimeMs) < STATUS_MAX_AGE_MS;
      const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      return {
        connected: fresh && status.connected === true,
        inGame: fresh && status.inGame === true,
        controller: status.controller || '',
        bridgeVersion: status.bridgeVersion || null,
        gamePath,
        modInstalled: this.isModInstalled(profileId),
        lastSeen: stat.mtimeMs
      };
    } catch (error) {
      return {
        connected: false,
        inGame: false,
        gamePath,
        modInstalled: this.isModInstalled(profileId),
        error: error.message
      };
    }
  }

  normalizeCommand(command) {
    return String(command || '').trim().toLowerCase();
  }

  isSupportedCommand(command) {
    if (SUPPORTED_COMMANDS.has(command)) return true;
    if (this.catalogCommandIds.has(command)) return true;

    this.catalogCommandIds = loadCatalogCommandIds();
    return this.catalogCommandIds.has(command);
  }

  buildPayload(command, parameters = {}) {
    const payload = {
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
      'force',
      'console',
      'commandLabel',
      'commandName',
      'mode',
      'action',
      'pack',
      'dryRun',
      'validateOnly'
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
    if (!payload.console && parameters.param_console) payload.console = parameters.param_console;
    if (!payload.value && parameters.param_value) payload.value = parameters.param_value;
    if (!payload.mode && parameters.param_mode) payload.mode = parameters.param_mode;
    if (!payload.action && parameters.param_action) payload.action = parameters.param_action;
    if (!payload.pack && parameters.param_pack) payload.pack = parameters.param_pack;
    return payload;
  }

  async executeCommand(commandId, parameters = {}) {
    const command = this.normalizeCommand(commandId);
    if (!this.isSupportedCommand(command)) {
      return { success: false, error: `Comando no soportado por ${GAME_NAME}: ${commandId}` };
    }

    const gamePath = this.getGamePath(parameters.profileId);
    if (!gamePath) return { success: false, error: `Configura la ruta de ${GAME_NAME} primero.` };
    if (!this.isModInstalled(parameters.profileId)) {
      return { success: false, error: `Instala el mod de ${GAME_NAME} desde TikControl primero.` };
    }

    const installedVersion = this.getInstalledModVersion(parameters.profileId);
    const installedCompare = compareBridgeVersions(installedVersion, MODULE_VERSION);
    const installedIsOutdated = !installedVersion ||
      installedVersion === 'legacy' ||
      (installedCompare === null ? installedVersion !== MODULE_VERSION : installedCompare < 0);

    if (installedIsOutdated) {
      return {
        success: false,
        error: `Actualiza el mod de ${GAME_NAME} desde TikControl y reinicia el juego. (${installedVersion || 'desconocida'} -> ${MODULE_VERSION})`
      };
    }

    const status = this.readStatus(parameters.profileId);
    if (!status.connected) {
      return { success: false, error: `${GAME_NAME} no conectado. Abre el juego o reinicialo despues de instalar el mod.` };
    }
    const runningCompare = compareBridgeVersions(status.bridgeVersion, MODULE_VERSION);
    const runningIsOutdated = !status.bridgeVersion ||
      status.bridgeVersion === 'legacy' ||
      (runningCompare === null ? status.bridgeVersion !== MODULE_VERSION : runningCompare < 0);

    if (runningIsOutdated) {
      return {
        success: false,
        error: `Reinicia ${GAME_NAME} para cargar el mod actualizado. (${status.bridgeVersion || 'version antigua'} -> ${MODULE_VERSION})`
      };
    }

    const payload = this.buildPayload(command, parameters);
    this.commandQueue = this.commandQueue
      .catch(() => {})
      .then(() => this.sendRequest(gamePath, payload));
    return this.commandQueue;
  }

  serializeLuaValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    const text = String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
    return `"${text}"`;
  }

  serializeLuaTable(payload) {
    const entries = Object.entries(payload)
      .filter(([key, value]) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) && value !== undefined && value !== null)
      .map(([key, value]) => `  ${key} = ${this.serializeLuaValue(value)}`);
    return `return {\n${entries.join(',\n')}\n}\n`;
  }

  async sendRequest(gamePath, payload) {
    const requestId = this.requestId++;
    const commandFile = this.getBridgeFile(gamePath, 'bridge_command.lua');
    const responseFile = this.getBridgeFile(gamePath, 'bridge_response.json');
    const tmpFile = `${commandFile}.tmp`;

    try { if (fs.existsSync(responseFile)) fs.unlinkSync(responseFile); } catch (_) {}

    const body = this.serializeLuaTable({ ...payload, requestId });
    fs.writeFileSync(tmpFile, body, 'utf8');
    fs.renameSync(tmpFile, commandFile);
    console.log('[Subnautica2] Comando enviado:', payload.effectId, { ...payload, requestId });

    return this.waitForResponse(responseFile, requestId, COMMAND_TIMEOUT_MS);
  }

  waitForResponse(responseFile, requestId, timeoutMs) {
    const started = Date.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          resolve({ success: false, error: 'Timeout esperando respuesta del mod de Subnautica 2' });
          return;
        }

        if (!fs.existsSync(responseFile)) return;

        try {
          const response = JSON.parse(fs.readFileSync(responseFile, 'utf8'));
          if (Number(response.requestId) !== Number(requestId)) return;
          clearInterval(timer);
          resolve({
            success: response.success === true,
            message: response.message || '',
            error: response.success === true ? null : (response.message || response.error || 'Error en Subnautica 2')
          });
        } catch (_) {
          // The Lua side may still be writing the response; try again.
        }
      }, 100);
    });
  }

  sendRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  sendProgress(message) {
    this.sendRenderer('subnautica2:install-progress', { message });
  }

  async ensureUE4SS(gamePath) {
    if (this.isUE4SSInstalled(gamePath)) return;
    const win64 = this.getWin64Dir(gamePath);
    if (!win64 || !fs.existsSync(win64)) throw new Error('No se encontro la carpeta Win64 de Subnautica 2');

    this.sendProgress('Instalando UE4SS...');
    const tmpZip = path.join(os.tmpdir(), 'tikcontrol-subnautica2-ue4ss.zip');
    await downloadModZip(UE4SS_URL, tmpZip, {
      retries: 1,
      expectedEntries: ['dwmapi.dll', 'ue4ss/UE4SS.dll'],
      onRetry: () => this.sendProgress('Reintentando UE4SS...')
    });

    const zip = new AdmZip(tmpZip);
    zip.extractAllTo(win64, true);
    try { fs.unlinkSync(tmpZip); } catch (_) {}
  }

  updateModsTxt(gamePath, enabled) {
    const modsTxt = path.join(this.getWin64Dir(gamePath), 'ue4ss', 'Mods', 'mods.txt');
    let lines = [];
    if (fs.existsSync(modsTxt)) {
      lines = fs.readFileSync(modsTxt, 'utf8').split(/\r?\n/);
    }

    let found = false;
    lines = lines.map((line) => {
      if (/^\s*TikControl\s*:/.test(line)) {
        found = true;
        return `TikControl : ${enabled ? 1 : 0}`;
      }
      if (/^\s*TikControlProbe\s*:/.test(line)) {
        return 'TikControlProbe : 0';
      }
      return line;
    });

    if (!found && enabled) {
      const insertAt = lines.findIndex((line) => /^; Built-in keybinds/i.test(line));
      if (insertAt >= 0) lines.splice(insertAt, 0, `TikControl : 1`, '');
      else lines.push(`TikControl : 1`);
    }

    fs.writeFileSync(modsTxt, lines.join('\n'), 'utf8');
  }

  copyDirectory(source, target) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const src = path.join(source, entry.name);
      const dst = path.join(target, entry.name);
      if (entry.isDirectory()) this.copyDirectory(src, dst);
      else fs.copyFileSync(src, dst);
    }
  }

  async installMod(profileId) {
    const gamePath = this.getGamePath(profileId);
    if (!gamePath) throw new Error('Primero debes configurar la ruta del juego');

    await this.ensureUE4SS(gamePath);

    const win64 = this.getWin64Dir(gamePath);
    const localSource = path.join(__dirname, 'Subnautica2_TikControl');
    const localZip = path.join(__dirname, '..', '..', 'aws', GAME_ID, 'mod.zip');
    const tmpZip = path.join(os.tmpdir(), 'tikcontrol-subnautica2-mod.zip');

    if (!app.isPackaged && fs.existsSync(localSource)) {
      this.sendProgress('Instalando mod local...');
      this.copyDirectory(localSource, win64);
    } else {
      const sourceZip = (!app.isPackaged && fs.existsSync(localZip)) ? localZip : tmpZip;
      if (sourceZip === tmpZip) {
        this.sendProgress('Descargando mod...');
        await downloadModZip(MOD_URL, tmpZip, {
          retries: 1,
          expectedEntries: ['ue4ss/Mods/TikControl/Scripts/main.lua'],
          onRetry: () => this.sendProgress('Reintentando descarga...')
        });
      }
      this.sendProgress('Instalando mod...');
      const zip = new AdmZip(sourceZip);
      zip.extractAllTo(win64, true);
      try { if (sourceZip === tmpZip) fs.unlinkSync(tmpZip); } catch (_) {}
    }

    this.updateModsTxt(gamePath, true);

    const modInstalled = this.isModInstalled(profileId);
    if (!modInstalled) {
      return {
        success: false,
        error: 'Instalacion incompleta: falta UE4SS o el mod TikControl.',
        modInstalled: false
      };
    }

    return {
      success: true,
      message: `Mod de ${GAME_NAME} instalado correctamente. Reinicia el juego para cargarlo.`,
      modInstalled
    };
  }

  uninstallMod(profileId) {
    const gamePath = this.getGamePath(profileId);
    if (!gamePath) throw new Error('No hay ruta del juego configurada');
    const modDir = path.join(gamePath, ...MOD_DIR_PARTS);
    this.removePathInsideGame(gamePath, modDir);
    this.updateModsTxt(gamePath, false);
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

      const exe = path.join(gamePath, ROOT_EXE);
      if (fs.existsSync(exe)) {
        const { spawn } = require('child_process');
        spawn(`"${exe}"`, [], { detached: true, stdio: 'ignore', cwd: gamePath, shell: true });
        return { success: true, method: 'direct' };
      }
    }

    await shell.openExternal(STEAM_LAUNCH_URI);
    return { success: true, method: 'steam' };
  }

  registerIpcHandlers() {
    if (this.handlersRegistered) return;
    this.handlersRegistered = true;

    ipcMain.handle('subnautica2:isConnected', async (_event, profileId) => this.readStatus(profileId));

    ipcMain.handle('subnautica2:executeEffect', async (_event, command, parameters = {}) => (
      this.executeCommand(command, parameters)
    ));

    ipcMain.handle('subnautica2:setGamePath', async (_event, profileId, gamePath) => {
      if (gamePath === undefined && typeof profileId === 'string') {
        gamePath = profileId;
        profileId = null;
      }
      const savedPath = this.saveGamePath(profileId, gamePath);
      return { success: true, path: savedPath, gamePath: savedPath };
    });

    ipcMain.handle('subnautica2:getGamePath', async (_event, profileId) => {
      const gamePath = this.getGamePath(profileId);
      return gamePath ? { success: true, path: gamePath, gamePath } : null;
    });

    ipcMain.handle('subnautica2:findGame', async () => this.findGame());

    ipcMain.handle('subnautica2:selectGamePath', async () => {
      const result = await dialog.showOpenDialog({
        title: `Selecciona la carpeta de ${GAME_NAME}`,
        properties: ['openDirectory']
      });
      if (result.canceled || !result.filePaths?.length) return { success: false, canceled: true };
      const gamePath = this.normalizeGameDir(result.filePaths[0]);
      return gamePath ? { success: true, path: gamePath, gamePath } : { success: false, error: 'Ruta invalida' };
    });

    ipcMain.handle('subnautica2:checkModStatus', async (_event, profileId) => {
      const gamePath = this.getGamePath(profileId);
      if (!gamePath) return { installed: false, reason: 'No hay ruta configurada' };
      const status = this.readStatus(profileId);
      const versionState = this.getModVersionState(profileId, status);
      return {
        installed: this.isModInstalled(profileId),
        gamePath,
        ue4ssInstalled: this.isUE4SSInstalled(gamePath),
        connected: status.connected,
        inGame: status.inGame,
        ...versionState
      };
    });

    ipcMain.handle('subnautica2:installMod', async (_event, profileId) => this.installMod(profileId));
    ipcMain.handle('subnautica2:uninstallMod', async (_event, profileId) => this.uninstallMod(profileId));
    ipcMain.handle('subnautica2:launchGame', async (_event, profileId) => this.launchGame(profileId));
  }

  stop() {}
}

const service = new Subnautica2Service();

module.exports = {
  initialize: (mainWindow) => service.initialize(mainWindow),
  executeCommand: (command, params) => service.executeCommand(command, params),
  getConnectionStatus: () => service.readStatus(),
  _debugSupportedCommands: () => [...new Set([...SUPPORTED_COMMANDS, ...service.catalogCommandIds])].sort(),
  stop: () => service.stop()
};
