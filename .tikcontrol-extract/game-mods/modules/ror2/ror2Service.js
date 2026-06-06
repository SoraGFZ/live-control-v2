// Servicio para conectar y comunicar con Risk of Rain 2 + Mod de efectos
// IMPORTANTE: TikControl actúa como SERVIDOR, el mod se conecta a nosotros

const { EventEmitter } = require('events');
const net = require('net');

class RoR2Service extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.clients = new Map(); // Almacenar conexiones activas
    this.connected = false;
    this.reconnectAttempts = 0;
    
    this.config = {
      host: '127.0.0.1',
      port: 51337 // Puerto preferido (fallback a dinámico si está en uso)
    };
    this._gameKey = 'ror2';

    console.log('[RoR2 Service] 🔌 Servicio inicializado (SERVIDOR TCP)');
    console.log('[RoR2 Service] ⚠️ El mod se conectará a TikControl');
    
    this.availableEffects = [];
    this.statusInterval = null;
    this.currentClient = null;
    this.gameState = 'unknown';
    this._nextEffectId = 1;
  }
  
  getStatus() {
    return {
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
      availableEffects: this.availableEffects.length,
      port: this.config.port,
      mode: 'tcp_server',
      activeClients: this.clients.size,
      gameState: this.gameState
    };
  }
  
  // Iniciar el servidor TCP
  async connect(cfg = {}) {
    if (this.server) {
      console.log('[RoR2 Service] ⚠️ Servidor ya está corriendo');
      return true;
    }
    
    if (cfg.port) {
      this.config.port = cfg.port;
    }
    
    return new Promise((resolve, reject) => {
      console.log(`[RoR2 Service] 🚀 Iniciando servidor en puerto ${this.config.port}...`);
      
      this.server = net.createServer((socket) => {
        const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`[RoR2 Service] 📥 Cliente conectado: ${clientId}`);
        
        this.clients.set(clientId, socket);
        this.currentClient = socket;
        this.connected = true;
        this.gameState = 'unknown';
        this.emit('status', this.getStatus());
        this.emit('clientConnected', { clientId, socket });
        
        // ✅ Enviar mensaje de bienvenida al mod (handshake)
        // El mod espera una respuesta inicial para confirmar la conexión
        const welcomeMessage = {
          id: 0,
          type: 'login',
          success: true
        };
        socket.write(JSON.stringify(welcomeMessage) + '\0');
        console.log('[RoR2 Service] 👋 Mensaje de bienvenida enviado:', JSON.stringify(welcomeMessage));
        
        // Buffer para acumular datos incompletos
        let dataBuffer = '';
        
        // Manejar datos recibidos del mod
        socket.on('data', (data) => {
          dataBuffer += data.toString();
          
          // El mod puede enviar múltiples JSONs concatenados: {"a":1}{"b":2}
          // Necesitamos dividirlos correctamente
          while (dataBuffer.length > 0) {
            // Saltar espacios en blanco, saltos de línea y caracteres de control al inicio
            const trimStart = dataBuffer.search(/[{\n\r\t ]/);
            if (trimStart === -1) {
              dataBuffer = '';
              break;
            }
            if (trimStart > 0) {
              dataBuffer = dataBuffer.substring(trimStart);
            }
            
            // Saltar completamente los espacios y saltos de línea
            dataBuffer = dataBuffer.replace(/^[\s\n\r\t]+/, '');
            
            // Si no queda nada, salir
            if (dataBuffer.length === 0) {
              break;
            }
            
            // Verificar si comienza con '{'
            if (dataBuffer[0] !== '{') {
              // Buscar el siguiente '{' en lugar de descartar todo
              const nextJson = dataBuffer.indexOf('{');
              if (nextJson === -1) {
                // No hay más JSON válido, limpiar buffer
                dataBuffer = '';
                break;
              }
              // Saltar hasta el siguiente JSON válido (sin mostrar error repetitivo)
              dataBuffer = dataBuffer.substring(nextJson);
              continue;
            }
            
            let braceCount = 0;
            let inString = false;
            let escapeNext = false;
            let jsonEnd = -1;
            
            for (let i = 0; i < dataBuffer.length; i++) {
              const char = dataBuffer[i];
              
              if (escapeNext) {
                escapeNext = false;
                continue;
              }
              
              if (char === '\\') {
                escapeNext = true;
                continue;
              }
              
              if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
              }
              
              if (inString) continue;
              
              if (char === '{') {
                braceCount++;
              } else if (char === '}') {
                braceCount--;
                
                // JSON completo encontrado
                if (braceCount === 0) {
                  jsonEnd = i + 1;
                  break;
                }
              }
            }
            
            // Si no encontramos un JSON completo, esperar más datos
            if (jsonEnd === -1) {
              break;
            }
            
            // Extraer y parsear el JSON completo
            const jsonStr = dataBuffer.substring(0, jsonEnd);
            dataBuffer = dataBuffer.substring(jsonEnd);
            
            try {
              const json = JSON.parse(jsonStr);
              
              if (json.type === 'keepAlive') {
                if (!this._keepAliveCount) this._keepAliveCount = 0;
                this._keepAliveCount++;
                if (this._keepAliveCount % 10 === 0) {
                  console.log(`[RoR2 Service] 💓 KeepAlive recibido (${this._keepAliveCount})`);
                }
              } else if (json.type === 'gameUpdate') {
                const prev = this.gameState;
                this.gameState = json.state || 'unknown';
                console.log(`[RoR2 Service] 🎮 GameUpdate: "${prev}" → "${this.gameState}" (message: ${json.message || 'none'})`);
              } else {
                console.log(`[RoR2 Service] 📨 Mensaje: ${json.type || 'unknown'}`);
                console.log(`[RoR2 Service] 📦 Datos:`, json);
              }
              
              this.emit('message', { clientId, data: json });
            } catch (e) {
              console.error('[RoR2 Service] ❌ Error parseando JSON:', e.message);
              console.error('[RoR2 Service] 📄 String problemático:', jsonStr);
            }
          }
        });
        
        socket.on('end', () => {
          console.log(`[RoR2 Service] 📤 Cliente desconectado: ${clientId}`);
          console.log('[RoR2 Service] 💡 El mod se reconectará automáticamente...');
          this.clients.delete(clientId);
          
          if (this.currentClient === socket) {
            this.currentClient = null;
          }
          
          if (this.clients.size === 0) {
            this.connected = false;
            this.emit('status', this.getStatus());
            console.log('[RoR2 Service] ⚠️ Sin clientes activos, esperando reconexión...');
          }
        });
        
        socket.on('error', (err) => {
          console.error(`[RoR2 Service] ❌ Error en cliente ${clientId}:`, err.message);
          this.clients.delete(clientId);
        });
      });
      
      const { listenWithFallback } = require('../../lib/dynamicPort');
      listenWithFallback(this.server, this.config.port, this.config.host, this._gameKey)
        .then((port) => {
          this.config.port = port;
          console.log(`[RoR2 Service] ✅ Servidor escuchando en ${this.config.host}:${port}`);
          console.log('[RoR2 Service] 🎮 Esperando conexión del mod de Risk of Rain 2...');
          resolve(true);
        })
        .catch((err) => {
          console.error('[RoR2 Service] ❌ Error en servidor:', err.message);
          this.server = null;
          reject(err);
        });
    });
  }
  
  // Detener el servidor
  disconnect() {
    console.log('[RoR2 Service] 🔌 Deteniendo servidor...');
    
    // Cerrar todas las conexiones de clientes
    for (const [clientId, socket] of this.clients.entries()) {
      console.log(`[RoR2 Service] Cerrando cliente: ${clientId}`);
      socket.end();
    }
    this.clients.clear();
    
    // Cerrar el servidor
    if (this.server) {
      this.server.close(() => {
        console.log('[RoR2 Service] ✅ Servidor cerrado');
      });
      this.server = null;
    }

    try { require('../../lib/dynamicPort').removePortFile(this._gameKey); } catch (_) {}

    this.connected = false;
    this.currentClient = null;
    this._stopStatusPolling();
    this.emit('status', this.getStatus());
    this.emit('disconnected');
  }
  
  // Obtener efectos disponibles
  getAvailableEffects() {
    return this.availableEffects || [];
  }
  
  // Cargar efectos desde el JSON de efectos del juego
  loadEffectsFromJSON(effectsData) {
    try {
      if (!effectsData || !effectsData.game || !effectsData.game.effects) {
        console.warn('[RoR2] ⚠️ No se pudieron cargar efectos: estructura inválida');
        return false;
      }
      
      const effects = effectsData.game.effects;
      this.availableEffects = [];
      
      // Convertir objeto de efectos a array
      for (const [effectId, effectData] of Object.entries(effects)) {
        this.availableEffects.push({
          id: effectId,
          name: effectData.name?.public || effectId,
          description: effectData.description || '',
          image: effectData.image || 'default',
          category: effectData.category || [],
          price: effectData.price || 0,
          duration: effectData.duration || 0
        });
      }
      
      console.log('[RoR2] ✅ Efectos cargados:', this.availableEffects.length);
      this.emit('effectsAvailable', this.availableEffects);
      
      return true;
    } catch (e) {
      console.error('[RoR2] ❌ Error cargando efectos:', e);
      return false;
    }
  }
  
  _buildMessage(effectId, username, userId, duration, type) {
    const requestUUID = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const id = this._nextEffectId++;
    return {
      code: effectId,
      parameters: [],
      targets: [{ service: 'tiktok', id: userId, name: username, avatar: '' }],
      duration,
      viewer: username,
      viewers: [{ service: 'tiktok', id: userId, name: username, avatar: '' }],
      cost: 0,
      requestID: requestUUID,
      sourceDetails: { type: 'tikcontrol' },
      id,
      type
    };
  }

  _sendAndWait(message, timeoutMs = 5000) {
    return new Promise((resolve) => {
      let responded = false;
      const responseHandler = (msgData) => {
        const msg = msgData.data;
        if (msg.type === 'effectRequest' && msg.id === message.id) {
          responded = true;
          this.removeListener('message', responseHandler);
          clearTimeout(timeout);
          resolve(msg);
        }
      };
      this.on('message', responseHandler);
      this.currentClient.write(JSON.stringify(message) + '\0');
      const timeout = setTimeout(() => {
        if (!responded) {
          this.removeListener('message', responseHandler);
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  async executeEffect(effectId, params = {}) {
    if (!this.currentClient || !this.connected) {
      return { success: false, error: 'No hay cliente conectado' };
    }

    const username = params.username || params.sender || 'TikControl';
    const userId = params.userId || `tiktok_${Date.now()}`;

    if (this.gameState !== 'ready') {
      console.warn(`[RoR2] ⚠️ GameState="${this.gameState}" — el efecto podría no aplicarse`);
    }

    let duration;
    if (params.duration !== undefined && params.duration !== null) {
      duration = params.duration * 1000;
    } else {
      const effect = this.availableEffects.find(e => e.id === effectId);
      duration = effect?.duration ? effect.duration * 1000 : 60000;
    }

    try {
      const message = this._buildMessage(effectId, username, userId, duration, 1);
      console.log(`[RoR2] 🎮 Ejecutando efecto: ${effectId} (id=${message.id}, gameState=${this.gameState})`);
      console.log(`[RoR2] 👤 Viewer: ${username}`);
      console.log('[RoR2] 📤 Enviando:', JSON.stringify(message));

      const resp = await this._sendAndWait(message, 5000);

      if (!resp) {
        console.warn('[RoR2] ⏱️ Timeout — no hubo respuesta del mod');
        return { success: false, error: 'Timeout - no response from mod' };
      }

      const success = resp.status === 'success';
      console.log(`[RoR2] ${success ? '✅' : '⚠️'} Respuesta: status="${resp.status}", timeRemaining=${resp.timeRemaining}, message="${resp.message || ''}"`);

      if (resp.status === 'retry') {
        const attempt = (params._retryAttempt || 0) + 1;
        if (attempt <= 3) {
          console.log(`[RoR2] ⏳ Retry ${attempt}/3 para ${effectId} en 2s...`);
          await new Promise(r => setTimeout(r, 2000));
          return this.executeEffect(effectId, { ...params, _retryAttempt: attempt });
        }
        console.warn(`[RoR2] ❌ ${effectId} falló tras 3 reintentos`);
      }

      return {
        success,
        status: resp.status,
        message: resp.message,
        timeRemaining: resp.timeRemaining,
        response: resp
      };
    } catch (error) {
      console.error('[RoR2] ❌ Error enviando efecto:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Limpieza
  cleanup() {
    console.log('[RoR2] 🧹 Limpiando servicio...');
    this.disconnect();
    this.availableEffects = [];
    this.removeAllListeners();
  }
  
  // Polling de estado (verificar clientes activos)
  _scheduleStatusPolling() {
    if (this.statusInterval) return;
    
    // Verificar cada 10 segundos
    this.statusInterval = setInterval(() => {
      // Limpiar clientes desconectados
      for (const [clientId, socket] of this.clients.entries()) {
        if (socket.destroyed) {
          console.log(`[RoR2] 🧹 Limpiando cliente desconectado: ${clientId}`);
          this.clients.delete(clientId);
        }
      }
      
      // Actualizar estado de conexión
      const wasConnected = this.connected;
      this.connected = this.clients.size > 0;
      
      if (wasConnected !== this.connected) {
        console.log(`[RoR2] 🔄 Estado de conexión cambió: ${this.connected}`);
        this.emit('status', this.getStatus());
      }
    }, 10000);
  }
  
  _stopStatusPolling() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }
}

module.exports = RoR2Service;
