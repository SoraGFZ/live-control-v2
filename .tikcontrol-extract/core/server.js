// Core: Servidor HTTP y Socket.IO
const logger = require('../utils/logger');

let httpUiServer = null;
let overlayServer = null;
let overlayPort = null;
let overlayIO = null;
let overlayApp = null;

function trackServerSockets(server) {
  if (!server || server.__tcSocketTracking) return;

  const sockets = new Set();
  server.__tcSocketTracking = sockets;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
}

function closeSocketIo(io, timeoutMs = 2500) {
  if (!io || typeof io.close !== 'function') return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      logger.warn('Server', 'Timeout cerrando Socket.IO; forzando desconexion de clientes');
      try { io.disconnectSockets(true); } catch (_) {}
      finish();
    }, timeoutMs);

    try { io.disconnectSockets(true); } catch (_) {}
    try {
      io.close(finish);
    } catch (e) {
      logger.warn('Server', 'Socket.IO ya estaba cerrado:', e.message);
      finish();
    }
  });
}

function closeHttpServer(server, label, timeoutMs = 3000) {
  if (!server || typeof server.close !== 'function') return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const sockets = server.__tcSocketTracking;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(forceTimer);
      clearTimeout(timeoutTimer);
      resolve();
    };

    const forceTimer = setTimeout(() => {
      if (sockets && sockets.size > 0) {
        logger.warn('Server', `${label}: destruyendo ${sockets.size} sockets activos`);
        for (const socket of sockets) {
          try { socket.destroy(); } catch (_) {}
        }
      }
    }, Math.min(1000, timeoutMs));

    const timeoutTimer = setTimeout(() => {
      logger.warn('Server', `${label}: timeout esperando server.close()`);
      finish();
    }, timeoutMs);

    try {
      server.close((err) => {
        if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') {
          logger.warn('Server', `${label}: error al cerrar:`, err.message);
        }
        finish();
      });
    } catch (e) {
      if (e.code !== 'ERR_SERVER_NOT_RUNNING') {
        logger.warn('Server', `${label}: cierre ignorado:`, e.message);
      }
      finish();
    }
  });
}

async function startHttpServer() {
  const app = require('electron').app;
  
  // ✅ SIEMPRE iniciar servidor HTTP (necesario para portadas de juegos y assets)
  logger.info('Server', 'Iniciando servidor HTTP (requerido para assets)...');

  try {
    logger.info('Server', 'Iniciando servidor HTTP unificado (UI + Overlays) en puerto 43123...');
    const { startHttpUiServer } = require('../server/core/httpStatic');
    const { server, app: expressApp, port, io, authToken, authHeaderToken } = await startHttpUiServer();
    
    httpUiServer = server;
    trackServerSockets(server);
    global.__TC_AUTH_TOKEN__ = authToken;
    global.__TC_AUTH_HEADER_TOKEN__ = authHeaderToken;
    const httpUiUrl = 'http://localhost:' + port + '/';
    logger.info('Server', 'UI HTTP local habilitada:', httpUiUrl);
    
    // Montar rutas de overlay en el mismo servidor
    try {
      logger.debug('Server', 'Montando rutas de overlay...');
      const { mountOverlayRoutes, goalsLiveAccumulator } = require('../server/core/overlay');
      await mountOverlayRoutes({ app: expressApp, io, server });
      
      global.goalsLiveAccumulator = goalsLiveAccumulator;
      global.io = io;
      overlayServer = server;
      overlayIO = io;
      overlayPort = port;
      overlayApp = expressApp;
      
      logger.info('Server', 'Overlays montados en puerto', port);
      logger.info('Server', 'Widgets disponibles en http://localhost:' + port + '/widgets/*');

      // 🛡️ MCP Admin: sólo si DEV_MCP=1 (la función ya valida el flag).
      try {
        const { mountMcpAdmin } = require('../server/mcp-admin/server');
        const res = mountMcpAdmin({ app: expressApp, logger });
        if (res.mounted) {
          logger.info('Server', 'MCP admin activo en POST http://localhost:' + port + '/mcp');
        }
      } catch (e) {
        logger.warn('Server', 'MCP admin no disponible:', e.message);
      }
    } catch(e) {
      logger.error('Server', 'Error montando overlays:', e.message);
      logger.error('Server', 'Stack:', e.stack);
    }
    
    return httpUiUrl;
  } catch(e) { 
    logger.error('Server', 'No se pudo iniciar HTTP UI:', e.message); 
    logger.error('Server', 'Stack:', e.stack);
    return null;
  }
}

function getServerInfo() {
  return {
    httpUiServer,
    overlayServer,
    overlayPort,
    overlayIO,
    overlayApp
  };
}

async function shutdownServer() {
  logger.info('Server', 'Cerrando servidores...');

  const ioToClose = overlayIO || global.io || null;
  const serversToClose = [...new Set([overlayServer, httpUiServer].filter(Boolean))];

  overlayIO = null;
  overlayServer = null;
  httpUiServer = null;
  overlayPort = null;
  overlayApp = null;
  global.io = null;

  await closeSocketIo(ioToClose);
  await Promise.all(serversToClose.map((server, index) => (
    closeHttpServer(server, index === 0 ? 'HTTP/Overlay' : `HTTP/${index + 1}`)
  )));

  logger.info('Server', 'Servidores cerrados');
}

module.exports = {
  startHttpServer,
  getServerInfo,
  shutdownServer
};

