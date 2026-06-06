// TikControl Bedrock Box - Minecraft Plugin Integration via ServerTap

const { ipcMain } = require('electron');

const GAME_ID = 'tikcontrol-bedrockbox';
const GAME_NAME = 'TikControl Bedrock Box';
const IPC_PREFIX = 'tikcontrolbedrockbox';

let effectsData = null;
let effectsLoaded = false;

async function loadEffectsFromCloud() {
  if (effectsLoaded && effectsData && effectsData._loadedAt && Date.now() - effectsData._loadedAt < 60000)
    return effectsData;
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
  if (effect.parameters && Array.isArray(effect.parameters)) {
    effect.parameters.forEach(param => {
      let value = options[param.id] !== undefined ? options[param.id] : param.default;
      if (value === '{nickname}' && options.nickname) value = options.nickname;
      command = command.replace(`{${param.id}}`, value);
    });
  }
  if (options.nickname) {
    command = command.replace('{nickname}', options.nickname);
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
  ipcMain.handle(`${IPC_PREFIX}:sendEffect`, async (event, { effectId, ...options }) => sendEffect(effectId, options));
  ipcMain.handle(`${IPC_PREFIX}:sendCommand`, async (event, { command, ...options }) => sendCommand(command, options));
  ipcMain.handle(`${IPC_PREFIX}:getEffects`, async () => await getEffects());
  ipcMain.handle(`${IPC_PREFIX}:getStatus`, async () => getStatus());
}

registerIpcHandlers();

module.exports = {
  init: registerIpcHandlers,
  getEffects,
  sendEffect,
  sendCommand,
  getStatus
};
