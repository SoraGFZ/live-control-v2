/**
 * Servicio de Lethal Company para TikControl
 * Comunicación TCP directa con el mod de BepInEx
 * Puerto: 51338
 */

const EventEmitter = require('events');
const net = require('net');

const EFFECT_ID_ALIASES = {
  'spawn_crawl': 'spawn_thumper',
  'spawn_pede': 'spawn_centipede',
  'spawn_flower': 'spawn_bracken',
  'spawn_spring': 'spawn_coilhead',
  'speed_boost': 'fast',
  'give_walkie': 'give_walkietalkie',
  'give_stun': 'give_stungrenade',
};

class LethalCompanyService extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.client = null;
    this.isConnected = false;
    this.requestIdCounter = 1;
    this.pendingRequests = new Map();
    this.PORT = 51338;
    this.HOST = '127.0.0.1';
  }

  /**
   * Inicia el servidor TCP
   */
  start() {
    if (this.server) {
      console.log('[LethalCompanyService] ⚠️ Servidor ya iniciado');
      return;
    }

    console.log('[LethalCompanyService] 🔧 Creando servidor TCP...');
    this.server = net.createServer((socket) => {
      console.log('[LethalCompanyService] 🎯 CALLBACK EJECUTADO - Nueva conexión!');
      console.log('[LethalCompanyService] ✅ Mod conectado desde:', socket.remoteAddress);
      
      if (this.client) {
        console.log('[LethalCompanyService] ⚠️ Ya hay un cliente conectado, rechazando nueva conexión');
        socket.end();
        return;
      }

      this.client = socket;
      this.isConnected = true;
      this.emit('connected');

      // CRÍTICO: Activar keep-alive para mantener la conexión viva
      socket.setKeepAlive(true, 60000); // Keep-alive cada 60 segundos

      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString();
        
        let lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.handleModResponse(response);
            } catch (err) {
              console.error('[LethalCompanyService] ❌ Error parsing response:', err);
              console.error('[LethalCompanyService] Raw message:', line);
            }
          }
        }
      });

      socket.on('close', () => {
        console.log('[LethalCompanyService] 🔌 Mod desconectado');
        this.client = null;
        this.isConnected = false;
        this.emit('disconnected');
      });

      socket.on('error', (err) => {
        console.error('[LethalCompanyService] ❌ Socket error:', err);
        this.client = null;
        this.isConnected = false;
      });
    });

    console.log(`[LethalCompanyService] 🎧 Iniciando servidor TCP...`);
    const { listenWithFallback } = require('../../lib/dynamicPort');
    listenWithFallback(this.server, this.PORT, this.HOST, 'lethal-company')
      .then((port) => {
        this.PORT = port;
        console.log(`[LethalCompanyService] 🎮 Servidor TCP escuchando en ${this.HOST}:${port}`);
        console.log('[LethalCompanyService] 🔌 Esperando conexión del mod...');
        this.isRunning = true;
      })
      .catch((err) => {
        console.error('[LethalCompanyService] ❌ Error del servidor:', err);
        this.emit('error', err);
      });
    
    this.server.on('connection', (socket) => {
      console.log('[LethalCompanyService] 🔔 EVENTO CONNECTION - Nueva conexión detectada!');
    });
    
    this.server.on('close', () => {
      console.log('[LethalCompanyService] 🚪 Servidor cerrado');
    });
  }

  /**
   * Maneja las respuestas del mod
   */
  handleModResponse(response) {
    console.log('[LethalCompanyService] 📥 Respuesta del mod:', {
      requestId: response.requestId,
      success: response.success,
      message: response.message
    });

    const requestInfo = this.pendingRequests.get(response.requestId);
    if (requestInfo) {
      const { resolve } = requestInfo;
      
      resolve({
        success: !!response.success,
        message: response.message || (response.success ? 'Effect executed' : 'Effect failed')
      });
      
      this.pendingRequests.delete(response.requestId);
    } else {
      console.log('[LethalCompanyService] ⚠️ Respuesta sin request pendiente - ID:', response.requestId);
    }
  }

  /**
   * Envía un mensaje al mod
   */
  send(message) {
    if (!this.isConnected || !this.client) {
      console.error('[LethalCompanyService] ❌ No conectado al mod');
      return false;
    }

    try {
      const data = JSON.stringify(message) + '\n';
      this.client.write(data);
      return true;
    } catch (error) {
      console.error('[LethalCompanyService] ❌ Error enviando mensaje:', error.message);
      return false;
    }
  }

  /**
   * Ejecuta un efecto en el juego
   */
  async executeEffect(effectId, options = {}) {
    if (!this.isConnected || !this.client) {
      throw new Error('Not connected to Lethal Company mod');
    }

    const resolvedId = EFFECT_ID_ALIASES[effectId] || effectId;
    if (resolvedId !== effectId) {
      console.log(`[LethalCompanyService] 🔄 Alias: ${effectId} → ${resolvedId}`);
    }

    const username = options.username || 'TikControl';
    const duration = options.duration !== undefined ? options.duration : 0;
    const quantity = options.quantity !== undefined ? options.quantity : 0;
    const requestId = this.requestIdCounter++;

    const message = {
      type: 'effect',
      effectId: resolvedId,
      requestId: requestId,
      username: username,
      duration: duration,
      quantity: quantity
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        console.warn(`[LethalCompanyService] ⏰ Timeout efecto ${effectId} (10s) — resolviendo como OK`);
        resolve({ success: true, message: `Effect ${effectId} sent (no ACK)` });
      }, 10000);

      this.pendingRequests.set(requestId, {
        resolve: (result) => { clearTimeout(timeout); resolve(result); },
        reject: (err) => { clearTimeout(timeout); reject(err); },
        timestamp: Date.now()
      });

      if (!this.send(message)) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(new Error('Failed to send effect message'));
        return;
      }

      console.log('[LethalCompanyService] 📤 Efecto enviado:', effectId);
    });
  }

  /**
   * Obtiene el estado actual del servicio
   */
  getStatus() {
    return {
      connected: this.isConnected,
      running: this.isRunning,
      pendingRequests: this.pendingRequests.size
    };
  }

  /**
   * Detiene el servidor y desconecta el cliente
   */
  stop() {
    console.log('[LethalCompanyService] 🔌 Deteniendo servicio...');
    
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    try { require('../../lib/dynamicPort').removePortFile('lethal-company'); } catch (_) {}

    this.isConnected = false;
    this.isRunning = false;
    this.pendingRequests.clear();
    
    console.log('[LethalCompanyService] ✅ Servicio detenido');
  }

  /**
   * Limpia requests antiguos (más de 30 segundos)
   */
  cleanupOldRequests() {
    const now = Date.now();
    for (const [id, request] of this.pendingRequests.entries()) {
      if (request.timestamp && now - request.timestamp > 30000) {
        console.log(`[LethalCompanyService] ⏰ Request ${id} expirado`);
        this.pendingRequests.delete(id);
      }
    }
  }
}

// Singleton instance
let serviceInstance = null;
let cleanupInterval = null;

const getInstance = () => {
  if (!serviceInstance) {
    serviceInstance = new LethalCompanyService();
    
    // Cleanup automático cada 30 segundos
    cleanupInterval = setInterval(() => {
      serviceInstance.cleanupOldRequests();
    }, 30000);
  }
  
  return serviceInstance;
};

module.exports = {
  getInstance,
  LethalCompanyService
};
