// TikControl Cubo - Minecraft Plugin Integration via ServerTap
// Usa ServerTap existente para enviar comandos al servidor Minecraft

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

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

// ✅ Cargar efectos desde GamesCloud (AWS S3) - eliminada dependencia local
async function loadEffectsFromCloud() {
  if (effectsLoaded && effectsData && effectsData._loadedAt && Date.now() - effectsData._loadedAt < 60000) return effectsData;

  try {
    const gamesCloud = require('../../../modules/auth/gamesCloudService');
    const commands = await gamesCloud.getGameCommands('tikcontrol-cubo');

    if (commands) {
      effectsData = commands;
      effectsData._loadedAt = Date.now();
      effectsLoaded = true;
      // console.log(`[TikControl Cubo] ✅ Cargados ${effectsData.effects?.length || 0} efectos desde AWS`);
    }
  } catch (error) {
    console.warn('[TikControl Cubo] ⚠️ Error cargando desde AWS:', error.message);
  }

  return effectsData;
}

// Cargar efectos (ahora desde cloud)
async function loadEffects() {
  return await loadEffectsFromCloud();
}

// Enviar comando a Minecraft via ServerTap
async function sendCommand(command, options = {}) {
  console.log(`[TikControl Cubo] 📤 Enviando comando: ${command}`);

  // Preparar comando en formato ServerTap
  const commands = [{
    command: command,
    delayMs: options.delay || 0,
    times: options.times || 1
  }];

  try {
    // Ejecutar usando IPC (se manejará en el renderer con servertapExec)
    const mainWindow = require('electron').BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tikcontrolcubo-execute-command', { commands });
    }

    return { success: true, command };
  } catch (e) {
    console.error('[TikControl Cubo] ❌ Error enviando comando:', e);
    return { success: false, error: e.message };
  }
}

// Enviar efecto por ID
async function sendEffect(effectId, options = {}) {
  if (!effectsData || !effectsData.effects) {
    return { success: false, error: 'Effects data not loaded' };
  }

  // Buscar efecto
  const effect = effectsData.effects.find(e => e.id === effectId);
  if (!effect) {
    return { success: false, error: `Effect not found: ${effectId}` };
  }

  // Construir comando con parámetros si es necesario
  let command = effect.command;

  // Reemplazar parámetros si se proporcionan
  // effect.params es un OBJETO (no array), options contiene los valores configurados
  if (effect.params && typeof effect.params === 'object') {
    Object.keys(effect.params).forEach(paramName => {
      const param = effect.params[paramName];
      // Los valores configurados vienen directamente en options, no en options.params
      let value = options[paramName] !== undefined
        ? options[paramName]
        : param.default;

      // Si el valor es "{nickname}" y hay un nickname en options, usarlo
      if (value === '{nickname}' && options.nickname) {
        value = options.nickname;
      }

      command = command.replace(`{${paramName}}`, value);
    });
  }

  console.log(`[TikControl Cubo] 💣 Comando construido: ${command}`);

  // Enviar comando
  return sendCommand(command, options);
}

// Obtener estado de la conexión (siempre usa ServerTap, que se maneja en integraciones)
function getStatus() {
  return {
    connected: true, // Siempre true porque usa ServerTap existente
    method: 'ServerTap',
    info: 'Usando conexión ServerTap de TikControl'
  };
}

// Obtener efectos disponibles (async - debe esperar carga)
async function getEffects() {
  if (!effectsData || !effectsLoaded) {
    await loadEffectsFromCloud();
  }

  return {
    success: true,
    effects: effectsData?.effects || [],
    categories: effectsData?.categories || {},
    game: {
      name: effectsData?.game || 'TikControl Cubo',
      gameID: effectsData?.gameID || 'TikControlCubo',
      platform: effectsData?.platform || 'Minecraft Server (ServerTap)',
      method: 'ServerTap'
    }
  };
}

// Registrar handlers IPC
function registerIpcHandlers() {
  // Dialog utilities for folder selection (may already be registered elsewhere)
  try {
    ipcMain.handle('dialog:selectFolder', async () => {
      const { dialog } = require('electron');
      return await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Seleccionar carpeta'
      });
    });
  } catch (e) {
    // Handler already registered, ignore
    // console.log('[TikControl Cubo] ℹ️ dialog:selectFolder ya registrado');
  }

  // Conectar (no hace nada porque usa ServerTap, pero necesario para compatibilidad de UI)
  ipcMain.handle('tikcontrolcubo:connect', async (event) => {
    // console.log('[TikControl Cubo] ℹ️ Conexión solicitada - usando ServerTap existente');
    const mainWindow = require('electron').BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tikcontrolcubo-connection-status', {
        connected: true,
        method: 'ServerTap'
      });
    }
    return { success: true, message: 'Usando ServerTap' };
  });

  // Desconectar (no hace nada, pero necesario para compatibilidad)
  ipcMain.handle('tikcontrolcubo:disconnect', async () => {
    // console.log('[TikControl Cubo] ℹ️ Desconexión solicitada - ServerTap permanece activo');
    return { success: true };
  });

  // Enviar efecto
  ipcMain.handle('tikcontrolcubo:sendEffect', async (event, { effectId, ...options }) => {
    return sendEffect(effectId, options);
  });

  // Enviar comando directo
  ipcMain.handle('tikcontrolcubo:sendCommand', async (event, { command, ...options }) => {
    return sendCommand(command, options);
  });

  // Obtener efectos
  ipcMain.handle('tikcontrolcubo:getEffects', async () => {
    return await getEffects();
  });

  // Obtener estado
  ipcMain.handle('tikcontrolcubo:getStatus', async () => {
    return getStatus();
  });

  // ✅ NUEVO: Instalar servidor Minecraft Paper 1.21.1
  try {
    ipcMain.handle('tntbox:installServer', async (event, serverPath) => {
      console.log('[TikControl Cubo] 🖥️ Instalando servidor en:', serverPath);

      try {
        const https = require('https');
        const http = require('http');

        // URL de Paper 1.21.1 (última build)
        const paperUrl = 'https://api.papermc.io/v2/projects/paper/versions/1.21.1/builds/132/downloads/paper-1.21.1-132.jar';
        const serverJarPath = path.join(serverPath, 'server.jar');
        const eulaPath = path.join(serverPath, 'eula.txt');
        const startScriptPath = path.join(serverPath, 'START_SERVER.bat');

        // Crear directorio si no existe
        if (!fs.existsSync(serverPath)) {
          fs.mkdirSync(serverPath, { recursive: true });
        }

        // Descargar Paper JAR
        console.log('[TikControl Cubo] 📥 Descargando Paper 1.21.1...');

        await new Promise((resolve, reject) => {
          const file = fs.createWriteStream(serverJarPath);

          const request = https.get(paperUrl, (response) => {
            // Manejar redirecciones
            if (response.statusCode === 302 || response.statusCode === 301) {
              const redirectUrl = response.headers.location;
              https.get(redirectUrl, (redirectResponse) => {
                redirectResponse.pipe(file);
                file.on('finish', () => {
                  file.close();
                  resolve();
                });
              }).on('error', reject);
            } else {
              response.pipe(file);
              file.on('finish', () => {
                file.close();
                resolve();
              });
            }
          });

          request.on('error', reject);
          request.setTimeout(60000, () => {
            request.destroy();
            reject(new Error('Timeout descargando servidor'));
          });
        });

        console.log('[TikControl Cubo] ✅ Paper descargado');

        // Crear eula.txt aceptado
        fs.writeFileSync(eulaPath, 'eula=true\n', 'utf8');
        console.log('[TikControl Cubo] ✅ EULA aceptado');

        // Crear script de inicio
        const startScript = `@echo off
title Minecraft Server - TNTBOX
echo ==========================================
echo    TNTBOX - Minecraft Server 1.21.1
echo ==========================================
echo.
echo Iniciando servidor...
echo.
java -Xmx4G -Xms2G -jar server.jar nogui
pause
`;
        fs.writeFileSync(startScriptPath, startScript, 'utf8');
        console.log('[TikControl Cubo] ✅ Script de inicio creado');

        // Crear carpeta plugins
        const pluginsPath = path.join(serverPath, 'plugins');
        if (!fs.existsSync(pluginsPath)) {
          fs.mkdirSync(pluginsPath, { recursive: true });
        }

        return { success: true, message: 'Servidor instalado correctamente' };

      } catch (error) {
        console.error('[TikControl Cubo] ❌ Error instalando servidor:', error);
        return { success: false, error: error.message };
      }
    });
  } catch (e) {
    // console.log('[TikControl Cubo] ℹ️ tntbox:installServer ya registrado');
  }

  // ✅ NUEVO: Instalar plugin TNTBOX
  try {
    ipcMain.handle('tntbox:installPlugin', async (event, serverPath) => {
      console.log('[TikControl Cubo] Instalando plugin en:', serverPath);

      try {
        const pluginsPath = path.join(serverPath, 'plugins');
        if (!fs.existsSync(pluginsPath)) {
          fs.mkdirSync(pluginsPath, { recursive: true });
        }

        const TNTBOX_URL = 'https://storage.tikcontrol.live/games/tikcontrol-cubo/TNTBOX-3.0.0.jar';
        const destPluginPath = path.join(pluginsPath, 'TNTBOX-3.0.0.jar');

        console.log('[TikControl Cubo] Descargando TNTBOX desde AWS...');
        await _downloadFile(TNTBOX_URL, destPluginPath);
        console.log('[TikControl Cubo] Plugin TNTBOX descargado');

        const servertapPath = path.join(pluginsPath, 'ServerTap.jar');
        if (!fs.existsSync(servertapPath)) {
          console.log('[TikControl Cubo] Descargando ServerTap...');
          const servertapUrl = 'https://github.com/phybros/servertap/releases/download/v0.6.1/ServerTap-0.6.1.jar';
          await _downloadFile(servertapUrl, servertapPath);
          console.log('[TikControl Cubo] ServerTap descargado');
        }

        return { success: true, message: 'Plugin TNTBOX y ServerTap instalados correctamente' };

      } catch (error) {
        console.error('[TikControl Cubo] Error instalando plugin:', error);
        return { success: false, error: error.message };
      }
    });
  } catch (e) {
    // console.log('[TikControl Cubo] ℹ️ tntbox:installPlugin ya registrado');
  }

  // console.log('[TikControl Cubo] ✅ IPC handlers registrados');
}

// Inicializar módulo
function initialize(mainWindow) {
  // console.log('[TikControl Cubo] 🎮 Inicializando módulo (modo ServerTap)...');
  loadEffects();
  registerIpcHandlers();

  if (mainWindow) {
    // console.log('[TikControl Cubo] ✅ Módulo listo - usa ServerTap para ejecutar comandos');
  }
}

module.exports = {
  initialize,
  sendCommand,
  sendEffect,
  getStatus,
  getEffects
};
