// Servicio para conectar y comunicar con GTA V Chaos Mod
// IMPORTANTE: GTAVWebhook.dll actúa como CLIENTE WebSocket
// Este servicio crea un SERVIDOR WebSocket en puerto 7704 para que el mod se conecte

const { EventEmitter } = require('events');
const WebSocket = require('ws');
const net = require('net');
const crypto = require('crypto');

const BLOCKED_GTAV_COMMANDS = new Map([
  ['speedy_cars', 'Speedy Cars provoca un NullReferenceException en GTAVWebhook y tumba el script dentro de GTA V.'],
  ['invisible_vehicles', 'Invisible Vehicles esta fallando con NullReferenceException en GTAVWebhook.']
]);

const GTAV_HTTP_ENDPOINT_ALIASES = new Map([
  ['replace_stock_vehicle', 'replace_vehicle']
]);

const GTAV_KOTH_DEFAULT_VALUES = new Map([
  ['spawn_vehicle', 'FBI2'],
  ['spawn_ramp', 'single'],
  ['give_weapon', 'AssaultRifle'],
  ['set_time', '2'],
  ['set_weather', 'Smog']
]);

const GTAV_PATCHED_HTTP_AUTH_TOKEN = 'tikcontrol.live';
const GTAV_PATCHED_HTTP_ORIGIN = 'https://app.tikcontrol.live';
const GTAV_HTTP_AUTH_TOKENS = [GTAV_PATCHED_HTTP_AUTH_TOKEN, 'TikControl', 'TIK'];
const GTAV_PATCHED_SIGNING_SECRET = 'TikControl command';

function createGTAVHttpAuthHeaders(token = GTAV_PATCHED_HTTP_AUTH_TOKEN) {
  return {
    'Superdupertoken': token,
    'Origin': GTAV_PATCHED_HTTP_ORIGIN,
    'skipLogout': 'true',
    'skipToken': 'true'
  };
}

function normalizeGTAVCommandInput(command) {
  return String(command || '')
    .replace(/([?&][^=&?#]+)=+/g, '$1=')
    .trim();
}

function normalizeGTAVTextParam(value, fallback = 'TikControl') {
  const normalized = String(value || '').replace(/^=+/, '').trim();
  return normalized || fallback;
}

function buildGTAVKothEffect(command, formData = {}) {
  const parts = [command];
  const extra1 = formData.extra1;
  const extra2 = formData.extra2;

  if (extra1 !== undefined && extra1 !== null && String(extra1) !== '') {
    parts.push(String(extra1));
  }

  if (extra2 !== undefined && extra2 !== null && String(extra2) !== '') {
    if (parts.length === 1) parts.push('');
    parts.push(String(extra2));
  }

  return parts.join(':');
}

function formatGTAVHttpError(err, availabilityKey, port) {
  if (!err || err.code !== 'ECONNREFUSED') return err?.message || 'Error de conexion';

  const labels = {
    chaos: 'Chaos Mod',
    koth: 'webhook directo/KOTH',
    train: 'Train',
    prison: 'Prison',
    race: 'Race'
  };
  const label = labels[availabilityKey] || 'GTA V';

  if (port >= 6720 && port <= 6723) {
    return `El webhook directo de GTA V no esta escuchando en 127.0.0.1:${port} (${label}). Reinstala el mod desde TikControl, inicia GTA V con BattlEye desactivado y espera a estar dentro de la partida antes de probar.`;
  }

  return `El mod de GTA V no esta escuchando en 127.0.0.1:${port} (${label}). Reinstala el mod desde TikControl, inicia GTA V con BattlEye desactivado y espera a estar dentro de la partida antes de probar.`;
}

function formatGTAVHttpStatusError(statusCode, details, availabilityKey, port) {
  if (statusCode === 403 && port >= 6720 && port <= 6723) {
    return `El webhook directo de GTA V esta escuchando en 127.0.0.1:${port}, pero rechazo la autenticacion de TikControl. Reinstala el mod desde TikControl para actualizar GTAVWebhook.dll.`;
  }

  return `HTTP ${statusCode}`;
}

function normalizeCommandNameForBlocklist(command) {
  let normalized = String(command || '').split('?')[0].trim();
  for (const prefix of ['chaos:', 'forward:', 'lua-script:']) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
    }
  }
  normalized = normalized.split(':')[0];
  if (normalized.startsWith('chaos-')) {
    normalized = normalized.slice(6);
  }
  return normalized.toLowerCase();
}

class GTAVChaosService extends EventEmitter {
  constructor() {
    super();
    this.ws = null; // Conexión WebSocket como CLIENTE
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;

    this.config = {
      host: 'localhost',
      port: 8082,
      url: 'ws://localhost:8082'
    };

    console.log('[GTA V Chaos Service] 🔌 MODO CLIENTE - Conectaremos al servidor del mod en:', this.config.port);

    // Scripts disponibles con sus comandos
    this.availableScripts = [];
    this.httpAvailability = { chaos: false, koth: false, train: false, prison: false, race: false };
    this.statusInterval = null;
  }

  getStatus() {
    return {
      connected: this.connected,
      listening: !!this.wss,
      reconnectAttempts: this.reconnectAttempts,
      availableScripts: this.availableScripts.length,
      port: 7704,
      mode: 'server',
      httpChaos: !!this.httpAvailability.chaos,
      httpKoth: !!this.httpAvailability.koth,
      httpTrain: !!this.httpAvailability.train,
      httpPrison: !!this.httpAvailability.prison,
      httpRace: !!this.httpAvailability.race
    };
  }

  _sendGTAVHttpForm({ port, pathCmd, body, availabilityKey, scriptId, logPrefix, extraHeaders = {} }) {
    const http = require('http');

    const attempt = (tokenIndex = 0) => new Promise((resolve) => {
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(body).toString(),
        ...createGTAVHttpAuthHeaders(GTAV_HTTP_AUTH_TOKENS[tokenIndex]),
        ...extraHeaders
      };

      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: `/${pathCmd}`,
        method: 'POST',
        headers
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 204) {
            console.log(`[${logPrefix}] OK: ${pathCmd}`);
            this.emit('scriptExecuted', { scriptId, success: true });
            this._updateHttpAvailability(availabilityKey, true);
            resolve({ success: true, response: data, status: res.statusCode });
            return;
          }

          if ((res.statusCode === 401 || res.statusCode === 403) && tokenIndex < GTAV_HTTP_AUTH_TOKENS.length - 1) {
            resolve(attempt(tokenIndex + 1));
            return;
          }

          console.error(`[${logPrefix}] HTTP ${res.statusCode}: ${data}`);
          this._updateHttpAvailability(availabilityKey, res.statusCode >= 200 && res.statusCode < 500);
          resolve({
            success: false,
            error: formatGTAVHttpStatusError(res.statusCode, data, availabilityKey, port),
            details: data
          });
        });
      });

      req.on('error', (err) => {
        if (err.code !== 'ECONNREFUSED') console.error(`[${logPrefix}] Error: ${err.message}`);
        this._updateHttpAvailability(availabilityKey, false);
        resolve({ success: false, error: formatGTAVHttpError(err, availabilityKey, port), code: err.code });
      });

      req.setTimeout(5000, () => {
        req.destroy();
        this._updateHttpAvailability(availabilityKey, false);
        resolve({ success: false, error: 'Timeout' });
      });

      req.on('abort', () => {
        resolve({ success: false, error: 'Aborted' });
      });

      try {
        req.write(body);
        req.end();
      } catch (err) {
        console.error(`[${logPrefix}] Error enviando request: ${err.message}`);
        resolve({ success: false, error: err.message });
      }
    });

    return attempt();
  }

  _buildGTAVSignedEnvelope(payload, secret = GTAV_PATCHED_SIGNING_SECRET) {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const signingPayload = `${JSON.stringify(payload)}\n${ts}\n${nonce}`;
    const sig = crypto
      .createHmac('sha256', secret)
      .update(signingPayload, 'utf8')
      .digest('base64');

    return JSON.stringify({ payload, ts, nonce, sig });
  }

  _sendGTAVHttpSigned({ port, pathCmd, payload, availabilityKey, scriptId, logPrefix, extraHeaders = {} }) {
    const http = require('http');
    const attempts = [
      { token: GTAV_PATCHED_HTTP_AUTH_TOKEN, origin: GTAV_PATCHED_HTTP_ORIGIN, signed: true, secret: GTAV_PATCHED_SIGNING_SECRET },
      { token: 'TikControl', origin: GTAV_PATCHED_HTTP_ORIGIN, signed: true, secret: GTAV_PATCHED_SIGNING_SECRET },
      { token: 'TIK', origin: GTAV_PATCHED_HTTP_ORIGIN, signed: true, secret: GTAV_PATCHED_SIGNING_SECRET },
      { token: GTAV_PATCHED_HTTP_AUTH_TOKEN, origin: GTAV_PATCHED_HTTP_ORIGIN, signed: false },
      { token: 'TikControl', origin: GTAV_PATCHED_HTTP_ORIGIN, signed: false },
      { token: 'TIK', origin: GTAV_PATCHED_HTTP_ORIGIN, signed: false }
    ];

    const attempt = (attemptIndex = 0) => new Promise((resolve) => {
      const auth = attempts[Math.min(attemptIndex, attempts.length - 1)];
      const body = auth.signed ? this._buildGTAVSignedEnvelope(payload, auth.secret) : JSON.stringify(payload);
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
        ...createGTAVHttpAuthHeaders(auth.token),
        'Origin': auth.origin,
        ...extraHeaders
      };

      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: `/${pathCmd}`,
        method: 'POST',
        headers
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 204) {
            console.log(`[${logPrefix}] OK: ${pathCmd}`);
            this.emit('scriptExecuted', { scriptId, success: true });
            this._updateHttpAvailability(availabilityKey, true);
            resolve({ success: true, response: data, status: res.statusCode });
            return;
          }

          if ([400, 401, 403, 415, 422].includes(res.statusCode) && attemptIndex < attempts.length - 1) {
            resolve(attempt(attemptIndex + 1));
            return;
          }

          console.error(`[${logPrefix}] HTTP ${res.statusCode}: ${data}`);
          this._updateHttpAvailability(availabilityKey, res.statusCode >= 200 && res.statusCode < 500);
          resolve({
            success: false,
            error: formatGTAVHttpStatusError(res.statusCode, data, availabilityKey, port),
            details: data
          });
        });
      });

      req.on('error', (err) => {
        if (err.code !== 'ECONNREFUSED') console.error(`[${logPrefix}] Error: ${err.message}`);
        this._updateHttpAvailability(availabilityKey, false);
        resolve({ success: false, error: formatGTAVHttpError(err, availabilityKey, port), code: err.code });
      });

      req.setTimeout(5000, () => {
        req.destroy();
        this._updateHttpAvailability(availabilityKey, false);
        resolve({ success: false, error: 'Timeout' });
      });

      req.on('abort', () => {
        resolve({ success: false, error: 'Aborted' });
      });

      try {
        req.write(body);
        req.end();
      } catch (err) {
        console.error(`[${logPrefix}] Error enviando request: ${err.message}`);
        resolve({ success: false, error: err.message });
      }
    });

    return attempt();
  }

  // Conectar COMO SERVIDOR WebSocket
  async connect(cfg = {}) {
    if (this.wss) {
      // ✅ Log eliminado para reducir spam: "Servidor ya iniciado"
      return true;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('[GTA V Chaos] 🌐 Iniciando servidor WebSocket en puerto 7704...');

        // Crear servidor WebSocket en puerto 7704
        this.wss = new WebSocket.Server({
          port: 7704,
          host: '127.0.0.1'
        });

        this.wss.on('listening', () => {
          console.log('[GTA V Chaos] ✅ Servidor WebSocket escuchando en ws://127.0.0.1:7704');
          console.log('[GTA V Chaos] 🎮 Esperando que GTA V (GTAVWebhook.dll) se conecte...');
          this.emit('status', { connected: false, listening: true });
          this._scheduleStatusPolling();
          resolve(true);
        });

        this.wss.on('connection', (ws) => {
          console.log('[GTA V Chaos] 🎉 ¡GTA V SE HA CONECTADO AL SERVIDOR!');
          this.ws = ws;
          this.connected = true;
          this.emit('status', this.getStatus());
          this.emit('connected', { source: 'gtav_webhook' });

          ws.on('message', (data) => {
            console.log('[GTA V Chaos] 📨 Mensaje recibido de GTA V:', data.toString());
            this._handleMessage(data);
          });

          ws.on('close', () => {
            console.log('[GTA V Chaos] GTA V se ha desconectado');
            this.ws = null;
            this.connected = false;
            this.emit('status', this.getStatus());
            this.emit('disconnected');
          });

          ws.on('error', (err) => {
            console.error('[GTA V Chaos] Error en conexión con GTA V:', err.message);
          });
        });

        this.wss.on('error', (err) => {
          console.error('[GTA V Chaos] Error en servidor WebSocket:', err.message);
          if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
            console.error('[GTA V Chaos] ⚠️ Puerto 7704 no disponible. ¿Hay otro proceso usando ese puerto?');
            console.log('[GTA V Chaos] ✅ Los comandos HTTP funcionarán igualmente (puerto 8082 y 6720)');
            // No rechazar - el WebSocket es opcional
            this.emit('debug', { phase: 'websocket_unavailable', error: err.message, code: err.code });
            this._scheduleStatusPolling();
            resolve(false); // Continuar sin WebSocket
          } else {
            this.emit('debug', { phase: 'server_error', error: err.message, code: err.code });
            reject(err);
          }
        });

      } catch (err) {
        console.error('[GTA V Chaos] Error al iniciar servidor:', err);
        reject(err);
      }
    });
  }

  // Desconectar
  disconnect() {
    console.log('[GTA V Chaos] Cerrando servidor WebSocket...');

    // Cerrar conexión con GTA V si existe
    if (this.ws) {
      try {
        this.ws.close();
        console.log('[GTA V Chaos] Conexión con GTA V cerrada');
      } catch (e) {
        console.error('[GTA V Chaos] Error al cerrar conexión:', e);
      }
      this.ws = null;
    }

    // Cerrar servidor WebSocket
    if (this.wss) {
      try {
        this.wss.close(() => {
          console.log('[GTA V Chaos] Servidor WebSocket cerrado');
        });
      } catch (e) {
        console.error('[GTA V Chaos] Error al cerrar servidor:', e);
      }
      this.wss = null;
    }

    this.connected = false;
    this.httpAvailability = { chaos: false, koth: false, train: false, prison: false, race: false };
    this._stopStatusPolling();
    this.emit('status', this.getStatus());
    this.emit('disconnected');
  }

  // Manejar mensajes recibidos
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      console.log('[GTA V Chaos] Mensaje recibido:', message);

      if (message.type === 'scripts_list') {
        this.availableScripts = message.scripts || [];
        console.log('[GTA V Chaos] Scripts disponibles:', this.availableScripts.length);
        this.emit('scriptsAvailable', this.availableScripts);
      } else if (message.type === 'script_executed') {
        console.log('[GTA V Chaos] Script ejecutado:', message.scriptId);
        this.emit('scriptExecuted', message);
      } else {
        this.emit('message', message);
      }
    } catch (e) {
      console.error('[GTA V Chaos] Error procesando mensaje:', e, data.toString());
    }
  }

  // Obtener scripts disponibles
  getAvailableScripts() {
    return this.availableScripts || [];
  }

  // Solicitar lista de scripts disponibles
  requestAvailableScripts() {
    if (!this.connected || !this.ws) {
      console.warn('[GTA V Chaos] No se puede solicitar scripts: no hay conexión');
      return false;
    }

    try {
      const message = { type: 'get_scripts' };
      this.ws.send(JSON.stringify(message));
      console.log('[GTA V Chaos] Solicitando lista de scripts...');
      return true;
    } catch (e) {
      console.error('[GTA V Chaos] Error al solicitar scripts:', e);
      return false;
    }
  }

  // Ejecutar un script en el juego
  // Detecta automáticamente si es comando KOTH o Chaos Mod
  async executeScript(scriptId, params = {}) {
    const http = require('http');
    const querystring = require('querystring');
    const originalScriptId = scriptId;
    scriptId = normalizeGTAVCommandInput(scriptId);

    if (originalScriptId !== scriptId) {
      console.log(`[GTA V Chaos] Comando normalizado: ${originalScriptId} -> ${scriptId}`);
    }

    // Parsear CANTIDAD del comando (formato: comando:N o comando:N?params)
    // Ejemplo: ramp_companion:2?username=User -> comando: ramp_companion, CANTIDAD: 2, params: username=User
    // La CANTIDAD va como parámetro del comando (spawn 2 companions)
    // Las REPETICIONES vienen en params.repetitions (ejecutar el comando N veces)
    let quantity = 1;
    let baseCommand = scriptId;

    // Buscar el patrón :número antes del ? (si existe) - esto es la CANTIDAD
    const colonMatch = scriptId.match(/^([^:?]+):(\d+)(\?.*)?$/);
    if (colonMatch) {
      baseCommand = colonMatch[1] + (colonMatch[3] || ''); // comando + parámetros (sin :N)
      quantity = parseInt(colonMatch[2]) || 1;
      console.log(`[GTA V] � Comando con cantidad: ${colonMatch[1]} x${quantity}`);
    }

    // Las REPETICIONES vienen del objeto params (ejecutar comando N veces)
    const repetitions = params.repetitions || 1;
    if (repetitions > 1) {
      console.log(`[GTA V] 🔁 Repeticiones de ejecución: ${repetitions}x`);
    }

    // Determinar el modo de envío
    // TODOS los comandos van al puerto 6720 (API unificada del mod)
    // El mod maneja internamente los comandos con prefijo "chaos-"

    const commandWithoutParams = baseCommand.split('?')[0]; // Quitar query params
    const mainCommandName = commandWithoutParams.split(':')[0]; // Quitar :N y otros parámetros

    // Detectar si es un hash de vehículo (0x...)
    const isVehicleHash = mainCommandName.startsWith('0x') || mainCommandName.startsWith('0X');

    // Detectar comandos del modo Train (puerto 6721)
    const trainCommands = ['spawn_dump', 'spawn_bus', 'spawn_truck', 'spawn_plane', 'spawn_tank',
      'spawn_firetruck', 'spawn_blimp', 'spawn_cargobob', 'turbo_jett',
      'train_damage', 'train_heal', 'train_boost', 'start_qte', 'stop_qte', 'set_bullet_damage',
      'add_time', 'remove_time', 'set_victory_time', 'spawn_mystery_box', 'spawn_shield',
      'spawn_health', 'spawn_time', 'spawn_mine', 'spawn_random_powerup'];
    // NOTA: NO usar mainCommandName.startsWith('spawn_') porque atrapa comandos Chaos (spawn_ramp, spawn_vehicle, etc.)
    // Los comandos Train con spawn_ ya están en la lista explícita
    const isTrainCommand = !baseCommand.startsWith('chaos:') && (trainCommands.includes(mainCommandName) || mainCommandName.startsWith('train_'));

    // Detectar comandos del modo Prison (puerto 6722)
    const isPrisonCommand = baseCommand.startsWith('prison:');

    // Detectar comandos del modo Race (puerto 6723)
    const isRaceCommand = baseCommand.startsWith('race:');

    // Detectar tipo de comando
    // Race va al puerto 6723, Prison al 6722, Train al 6721, KOTH al 6720, Chaos al 6720
    const isForwardCommand = baseCommand.startsWith('forward:');
    const isChaosRouteCommand = baseCommand.startsWith('chaos:');
    const isChaosCommand = mainCommandName.startsWith('chaos-') || isForwardCommand || isChaosRouteCommand;
    const isKothCommand = !isTrainCommand && !isChaosCommand && !isPrisonCommand && !isRaceCommand;

    // Limpiar prefijo de routing de TikControl (chaos:, forward:, lua-script:)
    // NOTA: NO limpiar "chaos-" aquí — es parte del ID del comando del mod
    // y se usa en el bloque else para detectar si va por /forward
    let cleanScriptId = baseCommand;

    // Remover prefijo de routing TikControl
    if (cleanScriptId.startsWith('chaos:')) {
      cleanScriptId = cleanScriptId.slice(6); // Remove "chaos:" (prefijo routing TikControl)
    }
    if (cleanScriptId.startsWith('forward:')) {
      cleanScriptId = cleanScriptId.slice(8); // Remove "forward:"
      if (cleanScriptId && !cleanScriptId.startsWith('chaos-')) {
        cleanScriptId = `chaos-${cleanScriptId}`;
      }
    }
    // NO quitar "chaos-" — es el prefijo real del comando del mod (ej: chaos-player_suicide)
    if (cleanScriptId.startsWith('lua-script:')) {
      cleanScriptId = cleanScriptId.slice(11); // Remove "lua-script:"
    }

    const blockedCommandName = normalizeCommandNameForBlocklist(cleanScriptId);
    const blockedReason = BLOCKED_GTAV_COMMANDS.get(blockedCommandName);
    if (blockedReason) {
      const message = `Comando desactivado temporalmente: ${blockedCommandName}. ${blockedReason}`;
      console.warn(`[GTA V Chaos] ${message}`);
      return {
        success: false,
        blocked: true,
        unsafeCommand: blockedCommandName,
        error: message
      };
    }

    console.log(`[GTA V Chaos] 🔧 Comando limpio: ${scriptId} → ${cleanScriptId}`);

    // Función auxiliar para ejecutar una vez
    const executeSingleCommand = async () => {

      if (isTrainCommand) {
        // ========== MODO TRAIN (Puerto 6721) ==========
        console.log(`[GTA V Train] 🚂 Enviando comando Train al puerto 6721: ${mainCommandName}`);

        // Parsear parámetros de la URL
        const cmdParts = scriptId.split('?');
        const queryParams = cmdParts[1] || '';
        let username = 'TikControl';
        let duration = 10;
        let speed = 50;
        let amount = 10;
        let percent = 100;

        if (queryParams) {
          const urlParams = new URLSearchParams(queryParams);
          username = normalizeGTAVTextParam(urlParams.get('username'));
          if (urlParams.get('duration')) duration = parseInt(urlParams.get('duration')) || 10;
          if (urlParams.get('speed')) speed = parseInt(urlParams.get('speed')) || 50;
          if (urlParams.get('amount')) amount = parseInt(urlParams.get('amount')) || 10;
          if (urlParams.get('percent')) percent = parseFloat(urlParams.get('percent')) || 100;
          // También parsear quantity de la URL si existe
          if (urlParams.get('quantity')) {
            const urlQty = parseInt(urlParams.get('quantity'));
            if (urlQty > 0) quantity = urlQty;
          }
        }

        console.log(`[GTA V Train] 📊 Parámetros: qty=${quantity}, dur=${duration}, spd=${speed}, amt=${amount}, pct=${percent}`);

        // Construir body para el mod Train con todos los parámetros
        const formData = {
          username: username,
          quantity: quantity.toString(),
          duration: duration.toString(),
          speed: speed.toString(),
          amount: amount.toString(),
          percent: percent.toString()
        };

        const bodyParts = [];
        for (const [key, value] of Object.entries(formData)) {
          bodyParts.push(`${key}=${encodeURIComponent(value)}`);
        }
        const body = bodyParts.join('&');

        const headers = {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Content-Length': Buffer.byteLength(body).toString(),
          ...createGTAVHttpAuthHeaders()
        };

        return new Promise((resolve) => {
          const options = {
            hostname: '127.0.0.1',
            port: 6721,
            path: `/${mainCommandName}`,
            method: 'POST',
            headers: headers
          };

          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode === 200 || res.statusCode === 204) {
                this.emit('scriptExecuted', { scriptId, success: true });
                this._updateHttpAvailability('train', true);
                resolve({ success: true, response: data, status: res.statusCode });
              } else {
                console.error(`[GTA V Train] ❌ Error HTTP ${res.statusCode}`);
                this._updateHttpAvailability('train', res.statusCode >= 200 && res.statusCode < 500);
                resolve({ success: false, error: formatGTAVHttpStatusError(res.statusCode, data, 'train', 6721), details: data });
              }
            });
          });

          req.on('error', (err) => {
            if (err.code !== 'ECONNREFUSED') {
              console.error(`[GTA V Train] ❌ Error: ${err.message}`);
            }
            this._updateHttpAvailability('train', false);
            resolve({ success: false, error: formatGTAVHttpError(err, 'train', 6721), code: err.code });
          });

          req.setTimeout(5000, () => {
            req.destroy();
            this._updateHttpAvailability('train', false);
            resolve({ success: false, error: 'Timeout' });
          });

          try {
            req.write(body);
            req.end();
          } catch (err) {
            console.error(`[GTA V Train] ❌ Error enviando request: ${err.message}`);
            resolve({ success: false, error: err.message });
          }
        });

      } else if (isPrisonCommand) {
        // ========== MODO PRISON (Puerto 6722) ==========
        // Formato: prison:spawn_inmate?username=X&quantity=3
        const prisonParts = baseCommand.split(':');
        const prisonAction = prisonParts[1]?.split('?')[0] || prisonParts[1];
        const queryString = baseCommand.includes('?') ? baseCommand.split('?')[1] : '';

        console.log(`[GTA V Prison] 🏛️ Enviando comando Prison al puerto 6722: ${prisonAction}`);

        // Parsear parámetros
        let username = 'TikControl';
        let quantity = 1;
        let duration = 0;

        if (queryString) {
          const urlParams = new URLSearchParams(queryString);
          username = normalizeGTAVTextParam(urlParams.get('username'), username);
          quantity = parseInt(urlParams.get('quantity')) || quantity;
          duration = parseInt(urlParams.get('duration')) || duration;
        }

        console.log(`[GTA V Prison] 📊 Params: qty=${quantity}, dur=${duration}, user=${username}`);

        const bodyParams = new URLSearchParams();
        bodyParams.append('action', prisonAction);
        bodyParams.append('username', username);
        bodyParams.append('quantity', quantity.toString());
        bodyParams.append('duration', duration.toString());

        const body = bodyParams.toString();

        const headers = {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Content-Length': Buffer.byteLength(body).toString(),
          ...createGTAVHttpAuthHeaders()
        };

        return new Promise((resolve) => {
          const options = {
            hostname: '127.0.0.1',
            port: 6722,
            path: `/${prisonAction}`,
            method: 'POST',
            headers: headers
          };

          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode === 200 || res.statusCode === 204) {
                this.emit('scriptExecuted', { scriptId, success: true });
                this._updateHttpAvailability('prison', true);
                resolve({ success: true, response: data, status: res.statusCode });
              } else {
                console.error(`[GTA V Prison] ❌ Error HTTP ${res.statusCode}`);
                this._updateHttpAvailability('prison', res.statusCode >= 200 && res.statusCode < 500);
                resolve({ success: false, error: formatGTAVHttpStatusError(res.statusCode, data, 'prison', 6722), details: data });
              }
            });
          });

          req.on('error', (err) => {
            if (err.code !== 'ECONNREFUSED') {
              console.error(`[GTA V Prison] ❌ Error: ${err.message}`);
            }
            this._updateHttpAvailability('prison', false);
            resolve({ success: false, error: formatGTAVHttpError(err, 'prison', 6722), code: err.code });
          });

          req.setTimeout(5000, () => {
            req.destroy();
            this._updateHttpAvailability('prison', false);
            resolve({ success: false, error: 'Timeout' });
          });

          try {
            req.write(body);
            req.end();
          } catch (err) {
            console.error(`[GTA V Prison] ❌ Error enviando request: ${err.message}`);
            resolve({ success: false, error: err.message });
          }
        });

      } else if (isRaceCommand) {
        // ========== MODO RACE (Puerto 6723) ==========
        // Formato: race:join?username=X o race:turbo?username=X
        const raceParts = baseCommand.split(':');
        const raceAction = raceParts[1]?.split('?')[0] || raceParts[1];
        const queryString = baseCommand.includes('?') ? baseCommand.split('?')[1] : '';

        console.log(`[GTA V Race] 🏎️ Enviando comando Race al puerto 6723: ${raceAction}`);

        // Parsear parámetros
        let username = 'TikControl';
        let quantity = 1;

        if (queryString) {
          const urlParams = new URLSearchParams(queryString);
          username = normalizeGTAVTextParam(urlParams.get('username'), username);
          quantity = parseInt(urlParams.get('quantity')) || quantity;
        }

        console.log(`[GTA V Race] 📊 Params: action=${raceAction}, user=${username}`);

        const bodyParams = new URLSearchParams();
        bodyParams.append('action', raceAction);
        bodyParams.append('username', username);
        bodyParams.append('quantity', quantity.toString());

        const body = bodyParams.toString();

        const headers = {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Content-Length': Buffer.byteLength(body).toString(),
          ...createGTAVHttpAuthHeaders()
        };

        return new Promise((resolve) => {
          const options = {
            hostname: '127.0.0.1',
            port: 6723,
            path: `/${raceAction}`,
            method: 'POST',
            headers: headers
          };

          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode === 200 || res.statusCode === 204) {
                this.emit('scriptExecuted', { scriptId, success: true });
                this._updateHttpAvailability('race', true);
                resolve({ success: true, response: data, status: res.statusCode });
              } else {
                console.error(`[GTA V Race] ❌ Error HTTP ${res.statusCode}`);
                this._updateHttpAvailability('race', res.statusCode >= 200 && res.statusCode < 500);
                resolve({ success: false, error: formatGTAVHttpStatusError(res.statusCode, data, 'race', 6723), details: data });
              }
            });
          });

          req.on('error', (err) => {
            if (err.code !== 'ECONNREFUSED') {
              console.error(`[GTA V Race] ❌ Error: ${err.message}`);
            }
            this._updateHttpAvailability('race', false);
            resolve({ success: false, error: formatGTAVHttpError(err, 'race', 6723), code: err.code });
          });

          req.setTimeout(5000, () => {
            req.destroy();
            this._updateHttpAvailability('race', false);
            resolve({ success: false, error: 'Timeout' });
          });

          try {
            req.write(body);
            req.end();
          } catch (err) {
            console.error(`[GTA V Race] ❌ Error enviando request: ${err.message}`);
            resolve({ success: false, error: err.message });
          }
        });

      } else if (isKothCommand) {
        // ========== MODO KOTH (Puerto 6720) ==========

        // Parsear formato de comando KOTH: comando:param1:param2?username=X
        // Ejemplos:
        // - spawn_on_ramp:0x45D56ADA:5?username=TikControl
        // - ramp_companion:2?username=User
        // - 0x506434F6:5?username=User (hash de vehículo)

        // IMPORTANTE: Usar scriptId original, NO baseCommand (que tiene :N eliminado)
        const cmdParts = scriptId.split('?');
        const cmdWithParams = cmdParts[0]; // spawn_on_ramp:adder:5 o 0x506434F6:5
        const queryParams = cmdParts[1];   // username=TikControl

        // Separar comando y sus parámetros por ":"
        const cmdSegments = cmdWithParams.split(':');
        const mainCommand = cmdSegments[0]; // spawn_on_ramp, ramp_companion, o 0x506434F6
        const param1 = cmdSegments[1] || ''; // adder, 2, o 5 (para vehículos)
        const param2 = cmdSegments[2] || ''; // 5, o vacío

        // Si es un hash de vehículo (0x...), el endpoint es spawn_on_ramp
        // y el hash va como extra1
        let endpoint;
        let formData = {};
        let usesDirectParameterPayload = false;

        // Comandos especiales que usan el endpoint spawn_on_ramp pero con el comando en extra1
        const specialSpawnCommands = ['ramp_meteor', 'super_jump'];

        if (isVehicleHash) {
          // Para vehículos: 0x506434F6:5?username=TikControl
          // -> POST /spawn_on_ramp con extra1=hash, extra2=cantidad
          // Formato tradicional de form data
          endpoint = 'spawn_on_ramp';
          formData = {
            extra1: mainCommand,  // El hash del vehículo (ej: 0x3D961290)
            extra2: param1 || '1' // La cantidad (default: 1)
          };
        } else if (mainCommand === 'ramp_spawn_custom_prop') {
          // Custom prop: 
          // - ramp_spawn_custom_prop:1889091531:5?username=User
          // -> POST /spawn_on_ramp con extra1=hash, extra2=cantidad
          // Formato tradicional de form data (igual que vehículos)
          endpoint = 'spawn_on_ramp';

          if (!param1) {
            console.error('[GTA V KOTH] ❌ ERROR: ramp_spawn_custom_prop requiere un Object Hash como parámetro');
          }

          formData = {
            extra1: param1 || '',  // El Object Hash del prop (ej: 1889091531)
            extra2: param2 || '1'  // La cantidad (default: 1)
          };
        } else if (mainCommand === 'ramp_log') {
          // Comando ramp_log: usa endpoint spawn_on_ramp con extra1
          endpoint = 'spawn_on_ramp';
          formData = {
            extra1: 'ramp_log',
            extra2: ''
          };
        } else if (specialSpawnCommands.includes(mainCommand)) {
          // Comandos especiales como ramp_meteor: usan endpoint spawn_on_ramp
          // Ejemplo: ramp_meteor:1 -> POST /spawn_on_ramp con extra1=ramp_meteor, extra2=1
          endpoint = 'spawn_on_ramp';
          formData = {
            extra1: mainCommand,  // El comando (ramp_meteor)
            extra2: param1 || ''  // El parámetro (si existe)
          };
        } else if (mainCommand === 'spawn_on_ramp') {
          // spawn_on_ramp:0x45D56ADA:5 -> POST /spawn_on_ramp con extra1=hash, extra2=cantidad
          endpoint = 'spawn_on_ramp';
          formData = {
            extra1: param1 || '',   // El hash del vehículo (ej: 0x45D56ADA)
            extra2: param2 || '1'   // La cantidad (default: 1)
          };
        } else if (mainCommand === 'replace_stock_vehicle') {
          // El catalogo historico lo llama replace_stock_vehicle, pero el mod real escucha /replace_vehicle.
          endpoint = 'replace_vehicle';
          formData = {
            extra1: param1 || '',   // El hash del vehículo
            extra2: param2 || ''
          };
        } else {
          // Para comandos normales: SIEMPRE extra1=comando, extra2=parámetro
          // Ejemplos:
          // - ramp_companion:2 -> extra1=ramp_companion, extra2=2
          // - ramp_companion -> extra1=ramp_companion, extra2= (vacío)
          endpoint = mainCommand;
          usesDirectParameterPayload = true;
          formData = {
            extra1: mainCommand,  // El comando completo
            extra2: param1 || ''  // El parámetro (si existe)
          };
        }

        if (usesDirectParameterPayload) {
          formData = {};
          if (param1) formData.extra1 = param1;
          if (param2) formData.extra2 = param2;
        }

        // Agregar parámetros de la query string (username, etc.)
        if (queryParams) {
          const urlParams = new URLSearchParams(queryParams);
          urlParams.forEach((value, key) => {
            formData[key] = key === 'username' ? normalizeGTAVTextParam(value) : value;
          });
        }

        // Agregar parámetros adicionales pasados directamente
        // IMPORTANTE: Excluir 'repetitions' porque es para el loop interno, NO para el servidor
        if (params && typeof params === 'object') {
          Object.keys(params).forEach(key => {
            if (!['extra1', 'extra2', 'vehicle', 'repetitions'].includes(key) && params[key]) {
              formData[key] = key === 'username' ? normalizeGTAVTextParam(params[key]) : params[key];
            }
          });
        }

        return this._sendGTAVHttpSigned({
          port: 6720,
          pathCmd: endpoint,
          payload: {
            ...formData,
            effect: buildGTAVKothEffect(endpoint, formData),
            username: normalizeGTAVTextParam(formData.username)
          },
          availabilityKey: 'koth',
          scriptId,
          logPrefix: 'GTA V KOTH'
        });

      } else {
        // ========== MODO CHAOS / KOTH ==========
        // DOS APIS DISTINTAS según tipo de comando:
        //
        // 1) Comandos KOTH directos (spawn_vehicle, spawn_ramp, max_wanted, etc.)
        //    → Puerto 6720, POST /<command>:<value>
        //    → Body: form-urlencoded  extra1=<value>&username=<user>
        //    → Token header: "Superdupertoken" (requerido por el mod)
        //    → Ejemplo: POST /spawn_vehicle:FBI2  body: extra1=FBI2&username=TikControl
        //
        // 2) Comandos Chaos Mod (chaos-player_suicide, chaos-tp_mountchilliad, etc.)
        //    → Puerto 8082, POST /trigger_effect
        //    → Body: JSON  {"effect":"<efecto_sin_chaos->","username":"<user>"}
        //    → Token: "glory to ukraine"
        //    → Ejemplo: POST /trigger_effect  body: {"effect":"tp_mountchilliad","username":"TikControl"}

        const parts = cleanScriptId.split('?');
        let commandPart = parts[0];
        const queryString = parts[1];

        // Extraer value si viene como "spawn_ramp:single" o "spawn_vehicle:FBI2"
        let paramValue = '';
        if (commandPart.includes(':')) {
          const colonIndex = commandPart.indexOf(':');
          paramValue = commandPart.substring(colonIndex + 1);
          commandPart = commandPart.substring(0, colonIndex);
        }
        commandPart = GTAV_HTTP_ENDPOINT_ALIASES.get(commandPart) || commandPart;
        if (!paramValue && GTAV_KOTH_DEFAULT_VALUES.has(commandPart)) {
          paramValue = GTAV_KOTH_DEFAULT_VALUES.get(commandPart);
        }

        // Parsear username de query string
        let username = 'TikControl';
        if (queryString) {
          const urlParams = new URLSearchParams(queryString);
          username = normalizeGTAVTextParam(urlParams.get('username'));
        }
        if (params && params.username) username = normalizeGTAVTextParam(params.username);

        // Determinar si es un comando chaos- (que debe ir por trigger_effect en puerto 8082)
        const isChaosEffect = commandPart.startsWith('chaos-');

        if (isChaosEffect) {
          // ── CHAOS MOD: Puerto 8082, /trigger_effect, JSON ──
          const effectName = commandPart.slice(6); // Quitar "chaos-" → "tp_mountchilliad"
          const jsonBody = JSON.stringify({ effect_id: effectName, sender: username });

          console.log(`[GTA V Chaos] 🔀 POST http://127.0.0.1:8082/trigger_effect`);
          console.log(`[GTA V Chaos]    Body: ${jsonBody}`);

          const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(jsonBody).toString(),
            'Superdupertoken': 'glory to ukraine'
          };

          return new Promise((resolve) => {
            const req = http.request({
              hostname: '127.0.0.1',
              port: 8082,
              path: '/trigger_effect',
              method: 'POST',
              headers
            }, (res) => {
              let data = '';
              res.on('data', (chunk) => { data += chunk; });
              res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 204) {
                  console.log(`[GTA V Chaos] 🎉 OK: trigger_effect → ${effectName}`);
                  this.emit('scriptExecuted', { scriptId, success: true });
                  this._updateHttpAvailability('chaos', true);
                  resolve({ success: true, response: data, status: res.statusCode });
                } else {
                  console.error(`[GTA V Chaos] ❌ HTTP ${res.statusCode}: ${data}`);
                  this._updateHttpAvailability('chaos', res.statusCode >= 200 && res.statusCode < 500);
                  resolve({ success: false, error: `HTTP ${res.statusCode}`, details: data });
                }
              });
            });
            req.on('error', (err) => {
              if (err.code !== 'ECONNREFUSED') console.error(`[GTA V Chaos] ❌ Error: ${err.message}`);
              this._updateHttpAvailability('chaos', false);
              resolve({ success: false, error: formatGTAVHttpError(err, 'chaos', 8082), code: err.code });
            });
            req.setTimeout(5000, () => { req.destroy(); this._updateHttpAvailability('chaos', false); resolve({ success: false, error: 'Timeout' }); });
            try { req.write(jsonBody); req.end(); } catch (err) { resolve({ success: false, error: err.message }); }
          });

        } else {
          // ── KOTH: Puerto 6720, POST /<command>:<value>, form-urlencoded ──
          // El mod envía el valor como parte del path: /spawn_vehicle:FBI2
          const pathCmd = commandPart;

          const formData = {};
          if (paramValue) {
            const valueParts = paramValue.split(':');
            formData.extra1 = valueParts[0] || paramValue;
            if (valueParts[1]) formData.extra2 = valueParts[1];
          }
          formData.username = username;

          // Agregar otros query params
          if (queryString) {
            const urlParams = new URLSearchParams(queryString);
            urlParams.forEach((value, key) => {
              if (key !== 'username') formData[key] = value;
            });
          }

          const valueLog = paramValue ? ` extra1=${paramValue}` : '';
          console.log(`[GTA V KOTH] 📋 POST http://127.0.0.1:6720/${pathCmd}${valueLog}`);

          return this._sendGTAVHttpSigned({
            port: 6720,
            pathCmd,
            payload: {
              ...formData,
              effect: buildGTAVKothEffect(commandPart, formData),
              username
            },
            availabilityKey: 'koth',
            scriptId,
            logPrefix: 'GTA V KOTH'
          });
        }
      } // Cierre del else (Chaos / KOTH)
    }; // Cierre de executeSingleCommand

    // Ejecutar el comando N veces
    if (repetitions > 1) {
      console.log(`[GTA V] 🔁 Ejecutando comando ${repetitions} veces...`);
      const results = [];
      for (let i = 0; i < repetitions; i++) {
        const result = await executeSingleCommand();
        results.push(result);
        // Pequeño delay entre ejecuciones (100ms)
        if (i < repetitions - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      // Retornar el último resultado
      return results[results.length - 1];
    } else {
      // Ejecutar una sola vez
      return await executeSingleCommand();
    }
  } // Cierre de executeScript

  // Detener todos los scripts activos
  stopAllScripts() {
    if (!this.connected || !this.ws) {
      console.warn('[GTA V Chaos] No se puede detener scripts: no hay conexión');
      return false;
    }

    try {
      const message = { type: 'stop_all' };
      this.ws.send(JSON.stringify(message));
      console.log('[GTA V Chaos] Deteniendo todos los scripts...');
      return true;
    } catch (e) {
      console.error('[GTA V Chaos] Error al detener scripts:', e);
      return false;
    }
  }

  // Limpieza
  cleanup() {
    console.log('[GTA V Chaos] Limpiando servicio...');
    this.disconnect();
    this.availableScripts = [];
    this.removeAllListeners();
  }

  _scheduleStatusPolling() {
    if (this.statusInterval) return;
    this._refreshHttpStatus();
    this.statusInterval = setInterval(() => this._refreshHttpStatus(), 7000);
  }

  _stopStatusPolling() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  async _refreshHttpStatus() {
    try {
      const [chaos, koth, train, prison, race] = await Promise.all([
        this._checkPortAvailability(8082),
        this._checkPortAvailability(6720),
        this._checkPortAvailability(6721), // Puerto del modo Train
        this._checkPortAvailability(6722), // Puerto del modo Prison
        this._checkPortAvailability(6723)  // Puerto del modo Race
      ]);

      const changed = chaos !== this.httpAvailability.chaos ||
        koth !== this.httpAvailability.koth ||
        train !== this.httpAvailability.train ||
        prison !== this.httpAvailability.prison ||
        race !== this.httpAvailability.race;
      this.httpAvailability = { chaos, koth, train, prison, race };
      if (changed) {
        this.emit('status', this.getStatus());
      }
    } catch (error) {
      console.warn('[GTA V Chaos] No se pudo refrescar estado HTTP:', error.message);
    }
  }

  _updateHttpAvailability(channel, value) {
    if (!['chaos', 'koth', 'train', 'prison', 'race'].includes(channel)) return;
    if (this.httpAvailability[channel] === value) return;
    this.httpAvailability[channel] = value;
    this.emit('status', this.getStatus());
  }

  _checkPortAvailability(port) {
    return new Promise((resolve) => {
      const socket = net.createConnection({ port, host: '127.0.0.1' });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 1000);

      socket.once('connect', () => {
        clearTimeout(timer);
        socket.end();
        resolve(true);
      });

      socket.once('error', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(false);
      });
    });
  }
}

module.exports = GTAVChaosService;
