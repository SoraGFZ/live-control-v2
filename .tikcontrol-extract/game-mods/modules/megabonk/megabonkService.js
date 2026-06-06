/**
 * Servicio de Megabonk para TikControl
 * Comunicación TCP directa con el mod de BepInEx
 * Puerto: 62626
 */

const EventEmitter = require('events');
const net = require('net');

class MegabonkService extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.client = null;
    this.isConnected = false;
    this.requestIdCounter = 1;
    this.pendingRequests = new Map();
    this.PORT = 62626;
    this.HOST = '127.0.0.1';
  }

  /**
   * Inicia el servidor TCP
   */
  start() {
    if (this.server) {
      console.log('[Megabonk Service] ⚠️ Servidor ya iniciado');
      return;
    }

    this.server = net.createServer((socket) => {
      console.log('[Megabonk Service] ✅ Mod conectado desde:', socket.remoteAddress);
      
      if (this.client) {
        console.log('[Megabonk Service] ⚠️ Ya hay un cliente conectado, rechazando nueva conexión');
        socket.end();
        return;
      }

      this.client = socket;
      this.isConnected = true;
      this.emit('connected');

      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString();
        
        let lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line.trim());
              this.handleModResponse(response);
            } catch (err) {
              console.error('[Megabonk Service] ❌ Error parsing response:', err);
              console.error('[Megabonk Service] Raw message:', line);
            }
          }
        }
      });

      socket.on('close', () => {
        console.log('[Megabonk Service] 🔌 Mod desconectado');
        this.client = null;
        this.isConnected = false;
        this.emit('disconnected');
      });

      socket.on('error', (err) => {
        console.error('[Megabonk Service] ❌ Socket error:', err);
        this.client = null;
        this.isConnected = false;
      });
    });

    const { listenWithFallback } = require('../../lib/dynamicPort');
    listenWithFallback(this.server, this.PORT, this.HOST, 'megabonk')
      .then((port) => {
        this.PORT = port;
        console.log(`[Megabonk Service] 🎮 Servidor TCP iniciado en ${this.HOST}:${port}`);
        console.log('[Megabonk Service] 🔌 Esperando conexión del mod...');
      })
      .catch((err) => {
        console.error('[Megabonk Service] ❌ Error del servidor:', err.message);
      });
  }

  /**
   * Maneja las respuestas del mod
   */
  handleModResponse(response) {
    console.log('[Megabonk Service] 📥 Respuesta del mod:', {
      requestId: response.requestId,
      success: response.success,
      message: response.message
    });

    const requestInfo = this.pendingRequests.get(response.requestId);
    if (requestInfo) {
      const { resolve, reject } = requestInfo;
      
      if (response.success) {
        resolve({
          success: true,
          message: response.message
        });
      } else {
        reject(new Error(response.message || 'Effect failed'));
      }
      
      this.pendingRequests.delete(response.requestId);
    } else {
      console.log('[Megabonk Service] ⚠️ Respuesta sin request pendiente - ID:', response.requestId);
    }
  }

  /**
   * Envía un mensaje al mod
   */
  send(message) {
    if (!this.isConnected || !this.client) {
      console.error('[Megabonk Service] ❌ No conectado al mod');
      return false;
    }

    try {
      const data = JSON.stringify(message) + '\n';
      this.client.write(data);
      return true;
    } catch (error) {
      console.error('[Megabonk Service] ❌ Error enviando mensaje:', error.message);
      return false;
    }
  }

  /**
   * Ejecuta un efecto en el juego
   */
  async executeEffect(effectId, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.client) {
        return reject(new Error('Not connected to Megabonk mod'));
      }

      const username = options.username || 'TikControl';
      const duration = options.duration !== undefined ? options.duration : 0;
      const quantity = options.quantity !== undefined ? options.quantity : 0;
      const requestId = this.requestIdCounter++;

      const message = {
        type: 'effect',
        effectId: effectId,
        requestId: requestId,
        username: username,
        duration: duration,
        quantity: quantity
      };

      console.log('[Megabonk Service] 📤 Mensaje completo:', JSON.stringify(message));

      // Guardar callback para cuando llegue la respuesta
      this.pendingRequests.set(requestId, { resolve, reject });

      // Timeout de 10 segundos
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Timeout waiting for effect response'));
      }, 10000);

      // Limpiar timeout cuando se resuelva
      const originalResolve = resolve;
      const originalReject = reject;
      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          originalResolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          originalReject(error);
        }
      });

      // Enviar mensaje
      if (!this.send(message)) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        return reject(new Error('Failed to send effect message'));
      }

      console.log('[Megabonk Service] 📤 Efecto enviado:', effectId, 'RequestID:', requestId);
    });
  }

  /**
   * Detiene el servidor y desconecta el cliente
   */
  stop() {
    console.log('[Megabonk Service] 🔌 Deteniendo servicio...');
    
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    try { require('../../lib/dynamicPort').removePortFile('megabonk'); } catch (_) {}

    this.isConnected = false;
    this.pendingRequests.clear();

    console.log('[Megabonk Service] ✅ Servicio detenido');
  }

  /**
   * Limpia requests antiguos (más de 30 segundos)
   */
  cleanupOldRequests() {
    const now = Date.now();
    for (const [id, request] of this.pendingRequests.entries()) {
      if (request.timestamp && now - request.timestamp > 30000) {
        console.log(`[Megabonk Service] ⏰ Request ${id} expirado`);
        this.pendingRequests.delete(id);
      }
    }
  }
}

// Cleanup automático cada 30 segundos
let cleanupInterval = null;

const createService = () => {
  const service = new MegabonkService();
  
  cleanupInterval = setInterval(() => {
    service.cleanupOldRequests();
  }, 30000);
  
  return service;
};

module.exports = createService;

