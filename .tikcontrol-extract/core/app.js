// Core: Lifecycle de la aplicación
const { app } = require('electron');
const logger = require('../utils/logger');

// Configuración inicial de la app
function setupApp() {
  // Deshabilitar Autofill + features innecesarias de Chromium (una sola llamada para no pisar)
  app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,Autofill,TranslateUI,BlinkGenPropertyTrees');
  // Deshabilitar QUIC (HTTP/3) — evita ERR_QUIC_PROTOCOL_ERROR con Firestore listeners
  app.commandLine.appendSwitch('disable-quic');
  app.commandLine.appendSwitch('log-level', '3');

  // Optimizaciones de rendimiento
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-breakpad');
  app.commandLine.appendSwitch('disable-component-extensions-with-background-pages');
  app.commandLine.appendSwitch('disable-domain-reliability');
  app.commandLine.appendSwitch('disable-sync');
  app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512 --expose-gc');

  // Nombre de la aplicación
  try { app.setName('TikControl'); } catch(_) {}

  // Override userData si está configurado
  if (process.env.TIKCONTROL_DATA_DIR) {
    try {
      const path = require('path');
      app.setPath('userData', path.resolve(process.env.TIKCONTROL_DATA_DIR));
    } catch (_) {}
  }

  // App User Model ID en Windows
  if (process.platform === 'win32') {
    try {
      const AUMID = 'com.tikcontrol.app.TikControl';
      app.setAppUserModelId(AUMID);
      process.title = 'TikControl';
      logger.info('App', 'AppUserModelID configurado:', AUMID);
    } catch(e) { 
      logger.warn('App', 'Error configurando AppUserModelID:', e.message);
    }
  }

  return true;
}

// Filtrar errores ruidosos de stderr
function setupErrorFiltering() {
  const originalStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, encoding, callback) => {
    const output = chunk.toString();
    
    const noisyPatterns = [
      "Request Autofill.enable failed",
      "Request Autofill.setAddresses failed",
      "Could not close stream",
      "'Autofill.enable' wasn't found",
      "'Autofill.setAddresses' wasn't found",
      "ERROR:CONSOLE(1)] \"Request Autofill",
      "ERROR:CONSOLE(1)] \"Could not close stream"
    ];
    
    if (noisyPatterns.some(pattern => output.includes(pattern))) {
      if (typeof callback === 'function') callback();
      return true;
    }
    
    return originalStderr(chunk, encoding, callback);
  };
}

// Suprimir mensajes de Autofill en web-contents
function setupWebContentsFiltering() {
  const SUPPRESSED_AUTOFILL_PATTERNS = [
    "'Autofill.enable' wasn't found",
    "'Autofill.setAddresses' wasn't found"
  ];

  app.on('web-contents-created', (_event, contents) => {
    // Use new Event object API (Electron 35+) to avoid deprecation warning
    contents.on('console-message', (event) => {
      const text = String(event.message || '');
      if(SUPPRESSED_AUTOFILL_PATTERNS.some(pattern => text.includes(pattern))){
        event.preventDefault();
      }
    });
  });
}

// Manejo de excepciones no capturadas
function setupExceptionHandlers() {
  process.on('uncaughtException', (error) => {
    logger.error('App', 'Uncaught Exception:', error.message);
    logger.error('App', 'Stack:', error.stack);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('App', 'Unhandled Rejection:', reason);
    logger.error('App', 'Promise:', promise);
  });
}

// Asegurar instancia única
function ensureSingleInstance() {
  const gotTheLock = app.requestSingleInstanceLock();
  if(!gotTheLock){ 
    logger.warn('App', 'Ya hay una instancia corriendo, cerrando...');
    app.quit();
    return false;
  }
  return true;
}

function init() {
  if (!ensureSingleInstance()) return false;
  
  setupApp();
  setupErrorFiltering();
  setupWebContentsFiltering();
  setupExceptionHandlers();
  
  logger.info('App', 'Aplicación inicializada correctamente');
  return true;
}

module.exports = {
  init,
  setupApp,
  ensureSingleInstance
};


