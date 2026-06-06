// TikControl SandBox - Minecraft Plugin Integration via ServerTap

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const GAME_ID = 'tikcontrol-sandbox';
const GAME_NAME = 'TikControl SandBox';
const IPC_PREFIX = 'tikcontrolsandbox';

let effectsData = null;
let effectsLoaded = false;

function _downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const file = fs.createWriteStream(dest);
    const get = (u) => https.get(u, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return get(res.headers.location);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
    get(url);
  });
}

async function loadEffectsFromCloud() {
  if (effectsLoaded && effectsData && effectsData._loadedAt && Date.now() - effectsData._loadedAt < 60000) return effectsData;
  try {
    const gamesCloud = require('../../../modules/auth/gamesCloudService');
    const commands = await gamesCloud.getGameCommands(GAME_ID);
    if (commands) {
      effectsData = commands;
      effectsData._loadedAt = Date.now();
      effectsLoaded = true;
      console.log(`[${GAME_NAME}] Cargados ${effectsData.effects?.length || 0} efectos desde AWS`);
    }
  } catch (error) {
    console.warn(`[${GAME_NAME}] Error cargando desde AWS:`, error.message);
  }
  return effectsData;
}

async function loadEffects() {
  return await loadEffectsFromCloud();
}

async function sendCommand(command, options = {}) {
  console.log(`[${GAME_NAME}] Enviando comando: ${command}`);
  const commands = [{ command, delayMs: options.delay || 0, times: options.times || 1 }];
  try {
    const mainWindow = require('electron').BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`${IPC_PREFIX}-execute-command`, { commands });
    }
    return { success: true, command };
  } catch (e) {
    console.error(`[${GAME_NAME}] Error enviando comando:`, e);
    return { success: false, error: e.message };
  }
}

async function sendEffect(effectId, options = {}) {
  if (!effectsData || !effectsData.effects) {
    return { success: false, error: 'Effects data not loaded' };
  }
  const effect = effectsData.effects.find(e => e.id === effectId);
  if (!effect) {
    return { success: false, error: `Effect not found: ${effectId}` };
  }
  let command = effect.command;
  if (effect.params && typeof effect.params === 'object') {
    Object.keys(effect.params).forEach(paramName => {
      const param = effect.params[paramName];
      let value = options[paramName] !== undefined ? options[paramName] : param.default;
      if (value === '{nickname}' && options.nickname) value = options.nickname;
      command = command.replace(`{${paramName}}`, value);
    });
  }
  return sendCommand(command, options);
}

function getStatus() {
  return { connected: true, method: 'ServerTap', info: 'Usando conexión ServerTap de TikControl' };
}

async function getEffects() {
  if (!effectsData || !effectsLoaded) await loadEffectsFromCloud();
  return {
    success: true,
    effects: effectsData?.effects || [],
    categories: effectsData?.categories || {},
    game: {
      name: effectsData?.game || GAME_NAME,
      gameID: effectsData?.gameID || GAME_ID,
      platform: effectsData?.platform || 'Minecraft Server (ServerTap)',
      method: 'ServerTap'
    }
  };
}

function registerIpcHandlers() {
  ipcMain.handle(`${IPC_PREFIX}:connect`, async () => {
    const mainWindow = require('electron').BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`${IPC_PREFIX}-connection-status`, { connected: true, method: 'ServerTap' });
    }
    return { success: true, message: 'Usando ServerTap' };
  });

  ipcMain.handle(`${IPC_PREFIX}:disconnect`, async () => ({ success: true }));

  ipcMain.handle(`${IPC_PREFIX}:sendEffect`, async (event, { effectId, ...options }) => {
    return sendEffect(effectId, options);
  });

  ipcMain.handle(`${IPC_PREFIX}:sendCommand`, async (event, { command, ...options }) => {
    return sendCommand(command, options);
  });

  ipcMain.handle(`${IPC_PREFIX}:getEffects`, async () => await getEffects());
  ipcMain.handle(`${IPC_PREFIX}:getStatus`, async () => getStatus());

  try {
    ipcMain.handle(`${IPC_PREFIX}:installPlugin`, async (event, serverPath) => {
      try {
        const pluginsPath = path.join(serverPath, 'plugins');
        if (!fs.existsSync(pluginsPath)) fs.mkdirSync(pluginsPath, { recursive: true });

        const gamesCloud = require('../../../modules/auth/gamesCloudService');
        const manifest = await gamesCloud.getManifest();
        const gameInfo = manifest?.games?.find(g => g.id === GAME_ID);
        if (!gameInfo?.mod) return { success: false, error: 'Mod not found in manifest' };

        const modUrl = `${manifest.baseUrl}/${gameInfo.mod}`;
        const jarName = path.basename(gameInfo.mod);
        const destPath = path.join(pluginsPath, jarName);

        console.log(`[${GAME_NAME}] Descargando plugin desde AWS...`);
        await _downloadFile(modUrl, destPath);

        const servertapPath = path.join(pluginsPath, 'ServerTap.jar');
        if (!fs.existsSync(servertapPath)) {
          await _downloadFile('https://github.com/phybros/servertap/releases/download/v0.6.1/ServerTap-0.6.1.jar', servertapPath);
        }

        return { success: true, message: `Plugin ${jarName} y ServerTap instalados` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  } catch (e) { /* already registered */ }

  console.log(`[${GAME_NAME}] IPC handlers registrados`);
}

function initialize(mainWindow) {
  console.log(`[${GAME_NAME}] Inicializando módulo (modo ServerTap)...`);
  loadEffects();
  registerIpcHandlers();
}

module.exports = { initialize, sendCommand, sendEffect, getStatus, getEffects };
