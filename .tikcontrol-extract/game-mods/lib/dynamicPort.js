/**
 * Dynamic port helper for game-mod TCP/WebSocket servers.
 *
 * Instead of hardcoding a fixed port (which may already be in use),
 * each game module now tries its preferred port first and falls back
 * to port 0 (OS-assigned) if the port is busy.
 *
 * The actual port is written to a well-known file so the game-side
 * mod (DLL/plugin) can read it at connect time:
 *
 *   {userData}/ports/{gameKey}.port   →   "49152"
 *
 * Usage (net.Server):
 *   const { listenWithFallback, removePortFile } = require('../../lib/dynamicPort');
 *   const port = await listenWithFallback(server, 51338, '127.0.0.1', 'lethal-company');
 *
 * Usage (ws.Server — WebSocket):
 *   const { listenWsWithFallback, removePortFile } = require('../../lib/dynamicPort');
 *   const port = await listenWsWithFallback(wss, 58431, '127.0.0.1', 'tricky-towers');
 */

const path = require('path');
const fs = require('fs');
const http = require('http');

function getPortDir() {
  try {
    const { app } = require('electron');
    const dir = path.join(app.getPath('userData'), 'ports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (_) {
    // Fallback if electron app not ready
    const dir = path.join(process.cwd(), 'data', 'ports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}

function writePortFile(gameKey, port) {
  try {
    const file = path.join(getPortDir(), `${gameKey}.port`);
    fs.writeFileSync(file, String(port), 'utf8');
  } catch (e) {
    console.warn(`[DynamicPort] Failed to write port file for ${gameKey}:`, e.message);
  }
}

function readPortFile(gameKey) {
  try {
    const file = path.join(getPortDir(), `${gameKey}.port`);
    if (!fs.existsSync(file)) return null;
    const val = parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
    return Number.isFinite(val) && val > 0 ? val : null;
  } catch (_) {
    return null;
  }
}

function removePortFile(gameKey) {
  try {
    fs.unlinkSync(path.join(getPortDir(), `${gameKey}.port`));
  } catch (_) {}
}

/**
 * Listen on `preferredPort`; if EADDRINUSE, retry on port 0 (OS picks
 * a free one). Writes the resolved port to the port file.
 *
 * @param {net.Server} server
 * @param {number} preferredPort
 * @param {string} host
 * @param {string} gameKey
 * @returns {Promise<number>} the actual port
 */
function listenWithFallback(server, preferredPort, host, gameKey) {
  return new Promise((resolve, reject) => {
    function onError(err) {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[DynamicPort] Puerto ${preferredPort} en uso para ${gameKey}, asignando puerto libre...`);
        server.removeListener('error', onError);
        server.listen(0, host, () => {
          const port = server.address().port;
          writePortFile(gameKey, port);
          console.log(`[DynamicPort] ${gameKey} escuchando en puerto dinamico ${port}`);
          resolve(port);
        });
      } else {
        reject(err);
      }
    }

    server.once('error', onError);
    server.listen(preferredPort, host, () => {
      server.removeListener('error', onError);
      const port = server.address().port;
      writePortFile(gameKey, port);
      resolve(port);
    });
  });
}

/**
 * Same as listenWithFallback but for ws.Server (WebSocket).
 * ws.Server doesn't support listen(0) directly, so we create a
 * backing http.Server with the fallback logic and attach the WSS.
 *
 * @param {object} WsServerClass - the `ws` WebSocket.Server constructor
 * @param {number} preferredPort
 * @param {string} host
 * @param {string} gameKey
 * @returns {Promise<{ wss: WebSocket.Server, httpServer: http.Server, port: number }>}
 */
function listenWsWithFallback(WsServerClass, preferredPort, host, gameKey) {
  return new Promise((resolve, reject) => {
    const httpServer = http.createServer();

    function onError(err) {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[DynamicPort] Puerto ${preferredPort} en uso para ${gameKey}, asignando puerto libre...`);
        httpServer.removeListener('error', onError);
        httpServer.listen(0, host, () => {
          const port = httpServer.address().port;
          const wss = new WsServerClass({ server: httpServer });
          writePortFile(gameKey, port);
          console.log(`[DynamicPort] ${gameKey} WebSocket en puerto dinamico ${port}`);
          resolve({ wss, httpServer, port });
        });
      } else {
        reject(err);
      }
    }

    httpServer.once('error', onError);
    httpServer.listen(preferredPort, host, () => {
      httpServer.removeListener('error', onError);
      const port = httpServer.address().port;
      const wss = new WsServerClass({ server: httpServer });
      writePortFile(gameKey, port);
      resolve({ wss, httpServer, port });
    });
  });
}

module.exports = {
  getPortDir,
  writePortFile,
  readPortFile,
  removePortFile,
  listenWithFallback,
  listenWsWithFallback
};
