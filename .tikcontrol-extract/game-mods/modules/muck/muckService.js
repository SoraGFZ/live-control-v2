/**
 * Servicio de Muck para TikControl
 * Comunicación TCP directa con el mod de BepInEx
 * Puerto: 37777
 */

const EventEmitter = require('events');
const net = require('net');

class MuckService extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.client = null;
    this.isConnected = false;
    this.requestIdCounter = 1;
    this.pendingRequests = new Map();
    this.PORT = 37777;
    this.HOST = '127.0.0.1';
  }

  /**
   * Inicia el servidor TCP
   */
  start() {
    if (this.server) {
      console.log('[Muck Service] ⚠️ Servidor ya iniciado');
      return;
    }

    this.server = net.createServer((socket) => {
      console.log('[Muck Service] ✅ Mod conectado desde:', socket.remoteAddress);
      
      if (this.client) {
        console.log('[Muck Service] ⚠️ Ya hay un cliente conectado, rechazando nueva conexión');
        socket.end();
        return;
      }

      this.client = socket;
      this.isConnected = true;
      this.emit('connected');

      let buffer = '';

      socket.on('data', (data) => {
        const raw = data.toString();
        console.log('[Muck Service] 📥 Raw data received:', JSON.stringify(raw));
        buffer += raw;
        
        let lines = buffer.split('\0');
        buffer = lines.pop() || '';
        
        if (lines.length === 0 && buffer.includes('\n')) {
          lines = buffer.split('\n');
          buffer = lines.pop() || '';
        }
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              console.log('[Muck Service] 📥 Parsed response:', JSON.stringify(response));
              this.handleModResponse(response);
            } catch (err) {
              console.error('[Muck Service] ❌ Error parsing response:', err.message);
              console.error('[Muck Service] Raw line:', JSON.stringify(line));
            }
          }
        }
      });

      socket.on('close', () => {
        console.log('[Muck Service] 🔌 Mod desconectado');
        this.client = null;
        this.isConnected = false;
        this.emit('disconnected');
      });

      socket.on('error', (err) => {
        console.error('[Muck Service] ❌ Socket error:', err);
        this.client = null;
        this.isConnected = false;
      });
    });

    const { listenWithFallback } = require('../../lib/dynamicPort');
    listenWithFallback(this.server, this.PORT, this.HOST, 'muck')
      .then((port) => {
        this.PORT = port;
        console.log(`[Muck Service] 🎮 Servidor TCP iniciado en ${this.HOST}:${port}`);
        console.log('[Muck Service] 🔌 Esperando conexión del mod...');
      })
      .catch((err) => {
        console.error('[Muck Service] ❌ Error del servidor:', err.message);
        this.emit('error', err);
      });
  }

  /**
   * Maneja las respuestas del mod
   */
  handleModResponse(response) {
    console.log('[Muck Service] 📥 Respuesta del mod:', {
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
      console.log('[Muck Service] ⚠️ Respuesta sin request pendiente - ID:', response.requestId);
    }
  }

  /**
   * Envía un mensaje al mod
   */
  send(message) {
    if (!this.isConnected || !this.client) {
      console.error('[Muck Service] ❌ No conectado al mod');
      return false;
    }

    try {
      const data = JSON.stringify(message) + '\n';
      this.client.write(data);
      console.log('[Muck Service] 📤 Bytes enviados:', Buffer.byteLength(data));
      return true;
    } catch (error) {
      console.error('[Muck Service] ❌ Error enviando mensaje:', error.message);
      return false;
    }
  }

  /**
   * Ejecuta un efecto en el juego
   */
  async executeEffect(effectId, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.client) {
        return reject(new Error('Not connected to Muck mod'));
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

      console.log('[Muck Service] 📤 Mensaje completo:', JSON.stringify(message));

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

      console.log('[Muck Service] 📤 Efecto enviado:', effectId, 'RequestID:', requestId);
    });
  }

  /**
   * Detiene el servidor y desconecta el cliente
   */
  stop() {
    console.log('[Muck Service] 🔌 Deteniendo servicio...');
    
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    try { require('../../lib/dynamicPort').removePortFile('muck'); } catch (_) {}

    this.isConnected = false;
    this.pendingRequests.clear();

    console.log('[Muck Service] ✅ Servicio detenido');
  }

  /**
   * Limpia requests antiguos (más de 30 segundos)
   */
  cleanupOldRequests() {
    const now = Date.now();
    for (const [id, request] of this.pendingRequests.entries()) {
      if (request.timestamp && now - request.timestamp > 30000) {
        console.log(`[Muck Service] ⏰ Request ${id} expirado`);
        this.pendingRequests.delete(id);
      }
    }
  }
}

// Cleanup automático cada 30 segundos
let cleanupInterval = null;

const createService = () => {
  const service = new MuckService();
  
  cleanupInterval = setInterval(() => {
    service.cleanupOldRequests();
  }, 30000);
  
  return service;
};

module.exports = createService;






























