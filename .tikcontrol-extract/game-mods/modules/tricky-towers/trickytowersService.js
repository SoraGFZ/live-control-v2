/**
 * Servicio DUAL para Tricky Towers (protocolo de efectos)
 * Puerto: 58431
 * Soporta AMBOS modos:
 *   - Cliente WebSocket (conecta al mod si está escuchando)
 *   - Servidor WebSocket (espera conexión del mod)
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class TrickyTowersService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.wss = null; // WebSocket Server
    this.port = 58431;
    this.host = '127.0.0.1';
    this.isConnected = false;
    this.mode = null; // 'client' o 'server'
    this.requestIdCounter = 1;
    this.pendingRequests = new Map();
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  /**
   * Intenta conectar - solo modo servidor (el mod se conecta a nosotros)
   */
  async connect() {
    if (this.isConnected) {
      console.log('[Tricky Towers Service] ⚠️ Ya conectado');
      return Promise.resolve();
    }

    // Solo modo servidor - el mod se conectará automáticamente
    try {
      await this.startAsServer();
      return;
    } catch (serverError) {
      throw new Error(`No se pudo iniciar servidor: ${serverError.message}`);
    }
  }

  /**
   * Inicia como servidor WebSocket (mod es cliente)
   */
  startAsServer() {
    return new Promise(async (resolve, reject) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[Tricky Towers Service] 🚀 Iniciando servidor WebSocket...');
      console.log('[Tricky Towers Service] 💡 El mod se conectará automáticamente');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      try {
        const { listenWsWithFallback } = require('../../lib/dynamicPort');
        const result = await listenWsWithFallback(WebSocket.Server, this.port, this.host, 'tricky-towers');
        this.wss = result.wss;
        this._httpServer = result.httpServer;
        this.port = result.port;

        this.wss.on('connection', (socket) => {
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('[Tricky Towers Service] ✅ ¡MOD CONECTADO!');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

          this.ws = socket;
          this.mode = 'server';
          this.isConnected = true;

          // Enviar handshake
          const handshake = { id: 0, type: 'login', success: true };
          this.send(handshake);
          console.log('[Tricky Towers Service] 📤 Handshake enviado:', JSON.stringify(handshake));

          socket.on('message', (data) => {
            this.handleMessage(data);
          });

          socket.on('close', () => {
            console.log('[Tricky Towers Service] 🔌 Mod desconectado');
            this.isConnected = false;
            this.ws = null;
          });

          socket.on('error', (err) => {
            console.error('[Tricky Towers Service] ❌ Error en socket:', err.message);
          });
        });

        console.log('[Tricky Towers Service] ✅ SERVIDOR WEBSOCKET ACTIVO');
        console.log(`[Tricky Towers Service] 🌐 ws://127.0.0.1:${this.port}`);
        console.log('[Tricky Towers Service] ⏳ Esperando conexión del mod...');
        resolve();
      } catch (err) {
        console.error('[Tricky Towers Service] ❌ Error en servidor:', err.message);
        reject(err);
      }
    });
  }

  /**
   * Maneja los mensajes recibidos del mod
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      console.log('[Tricky Towers Service] 📥 Mensaje:', JSON.stringify(message).substring(0, 150));
      
      // El protocolo usa códigos numéricos para type:
      // 0 = Effect Response (respuesta a efecto ejecutado)
      // 1 = Effect Request (solicitud de efecto - nosotros lo enviamos)
      // 255 = Keep Alive
      
      if (message.type === 255) {
        console.log('[Tricky Towers Service] 💓 Keep alive');
        return;
      }
      
      if (message.type === 0) {
        // Respuesta de efecto
        console.log('[Tricky Towers Service] ✅ Respuesta de efecto:', message.code, 'Status:', message.status, 'ID:', message.id);
        
        // Buscar el callback por requestID (no por id)
        const callback = this.pendingRequests.get(message.id);
        if (callback) {
          // Convertir status numérico a string para compatibilidad
          const statusMap = {
            0: 'success',
            1: 'failure',
            2: 'unavailable',
            3: 'retry',
            4: 'queue',
            5: 'running'
          };
          
          const statusStr = statusMap[message.status] || 'unknown';
          
          callback({
            ...message,
            status: statusStr,
            type: 'effectRequest' // Mantener compatibilidad con código existente
          });
          
          this.pendingRequests.delete(message.id);
        } else {
          console.warn('[Tricky Towers Service] ⚠️ Respuesta sin callback para ID:', message.id);
        }
        return;
      }
      
      // Otros tipos de mensaje
      console.log('[Tricky Towers Service] 📨 Tipo de mensaje:', message.type);
      
    } catch (error) {
      console.error('[Tricky Towers Service] ❌ Error parseando:', error.message);
      console.error('[Tricky Towers Service] Datos recibidos:', data.toString().substring(0, 200));
    }
  }

  /**
   * Envía un mensaje al mod
   */
  send(data) {
    if (!this.ws || !this.isConnected) {
      console.error('[Tricky Towers Service] ❌ No hay conexión');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('[Tricky Towers Service] ❌ Error enviando:', error.message);
      return false;
    }
  }

  /**
   * Ejecuta un efecto en el juego
   */
  async executeEffect(effectId, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.ws) {
        return reject(new Error('Not connected to Tricky Towers mod'));
      }

      const username = options.username || 'TikControl';
      // ✅ NUEVO: Usar duración personalizada si se proporciona (en segundos, convertir a ms)
      const duration = options.duration !== undefined ? (options.duration * 1000) : 0;
      if (options.duration !== undefined) {
        console.log(`[Tricky Towers Service] ⏱️ Usando duración personalizada: ${options.duration}s`);
      }
      const requestId = this.requestIdCounter++;

      // Formato exacto del protocolo de efectos
      const message = {
        code: effectId,           // ID del efecto (ej: "largebricks")
        id: requestId,            // ✅ Usar requestId como id (el mod responde con este)
        type: 1,                  // Tipo 1 = effect request
        parameters: {},
        targets: [],
        duration: duration,       // ✅ Duración personalizada o 0
        viewer: username,
        viewers: [],
        cost: 0,
        sourceDetails: {}
      };

      console.log('[Tricky Towers Service] 📤 Ejecutando:', effectId, 'para:', username, 'ID:', requestId, duration ? `(${duration}ms)` : '');

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        console.warn('[Tricky Towers Service] ⏱️ Timeout:', effectId);
        resolve({ success: false, error: 'Timeout' });
      }, 5000);

      this.pendingRequests.set(requestId, (response) => {
        clearTimeout(timeout);
        
        if (response.type === 0 || response.type === 'effectRequest') {
          if (response.status === 0 || response.status === 'success' || response.success === true) {
            console.log('[Tricky Towers Service] ✅ Efecto OK:', effectId);
            resolve({ success: true, response });
          } else if (response.status === 'retry') {
            console.log('[Tricky Towers Service] 🔄 Reintentando:', effectId);
            setTimeout(() => {
              this.executeEffect(effectId, options).then(resolve).catch(reject);
            }, 1000);
          } else {
            console.warn('[Tricky Towers Service] ⚠️ Rechazado:', response.status);
            resolve({ success: false, error: response.message || 'Effect rejected' });
          }
        } else {
          resolve({ success: false, error: 'Invalid response type' });
        }
      });

      if (!this.send(message)) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(new Error('Failed to send message'));
      }
    });
  }

  /**
   * Desconecta del mod
   */
  disconnect() {
    console.log('[Tricky Towers Service] 🛑 Desconectando...');
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.reconnectAttempts = this.maxReconnectAttempts;
    
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        console.error('[Tricky Towers Service] ❌ Error cerrando WS:', error.message);
      }
      this.ws = null;
    }

    if (this.wss) {
      try {
        this.wss.close();
      } catch (error) {
        console.error('[Tricky Towers Service] ❌ Error cerrando servidor:', error.message);
      }
      this.wss = null;
    }

    if (this._httpServer) {
      try { this._httpServer.close(); } catch (_) {}
      this._httpServer = null;
    }

    try { require('../../lib/dynamicPort').removePortFile('tricky-towers'); } catch (_) {}

    this.isConnected = false;
    this.mode = null;
    this.pendingRequests.clear();
    console.log('[Tricky Towers Service] ✅ Desconectado');
  }

  /**
   * Obtiene el estado de la conexión
   */
  getStatus() {
    return {
      connected: this.isConnected,
      mode: this.mode,
      port: this.port,
      host: this.host,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Singleton
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new TrickyTowersService();
  }
  return instance;
}

module.exports = {
  getInstance,
  cleanup: () => {
    if (instance) {
      instance.disconnect();
      instance = null;
    }
  }
};
