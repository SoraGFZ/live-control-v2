/**
 * StreamDeck Wrapper - Servicio de integración con StreamDeck
 * Permite controlar TikControl desde StreamDeck mediante WebSocket
 */

const { ipcMain } = require('electron');
const WebSocket = require('ws');
const EventEmitter = require('events');

class StreamDeckService extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.client = null;
    this.port = 9091;
    this.isConnected = false;
    this.config = {
      port: 9091,
      host: '127.0.0.1'
    };
  }

  /**
   * Iniciar el servidor WebSocket para StreamDeck
   */
  start(config = {}) {
    if (this.server) {
      return true;
    }

    this.config = { ...this.config, ...config };
    this.port = this.config.port;

    try {
      this.server = new WebSocket.Server({ 
        port: this.port,
        host: '127.0.0.1'
      });

      this.server.on('connection', (ws) => {
        // [log cleaned]
        this.client = ws;
        this.isConnected = true;
        this.emit('connected');

        // Enviar mensaje de bienvenida
        this.send({
          type: 'welcome',
          message: 'Conectado a TikControl',
          version: '1.0.0',
          capabilities: this.getCapabilities()
        });

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (e) {
            console.error('[StreamDeck] Error parseando mensaje:', e);
          }
        });

        ws.on('close', () => {
          // [log cleaned]
          this.client = null;
          this.isConnected = false;
          this.emit('disconnected');
        });

        ws.on('error', (error) => {
          console.error('[StreamDeck] Error en WebSocket:', error);
          this.emit('error', error);
        });
      });

      // [log cleaned]
      this.emit('server_started', { port: this.port });
      return true;
    } catch (error) {
      console.error('[StreamDeck] Error iniciando servidor:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Detener el servidor WebSocket
   */
  stop() {
    // [log cleaned]
    // Cerrar cliente WebSocket primero
    if (this.client) {
      try {
        this.client.removeAllListeners();
        this.client.terminate(); // Forzar cierre inmediato
        this.client = null;
        // [log cleaned]
      } catch(e) {
        console.error('[StreamDeck] Error cerrando cliente:', e.message);
      }
    }

    // Cerrar servidor
    if (this.server) {
      try {
        // Cerrar todas las conexiones activas FORZADAMENTE
        this.server.clients?.forEach(client => {
          try {
            // Forzar cierre sin handshake para evitar que quede colgado
            client.terminate();
            // [log cleaned]
          } catch(e) {
            console.error('[StreamDeck] Error terminando cliente:', e.message);
          }
        });
        
        // Cerrar servidor inmediatamente sin esperar
        this.server.close(() => {
          // console.log('[StreamDeck] Servidor cerrado (callback)');
        });
        
        // Forzar el cierre si no se cierra en 500ms
        setTimeout(() => {
          if (this.server) {
            // [log cleaned]
            this.server.close();
            this.server = null;
          }
        }, 500);
        
        this.server = null;
        // [log cleaned]
      } catch(e) {
        console.error('[StreamDeck] Error cerrando servidor:', e.message);
      }
    }

    this.isConnected = false;
    this.emit('disconnected');
    // [log cleaned]
  }

  /**
   * Obtener capacidades disponibles
   */
  getCapabilities() {
    return {
      actions: [
        'execute_action',
        'toggle_overlay_element',
        'show_overlay_element',
        'hide_overlay_element',
        'winlife_add_win',
        'winlife_subtract_win',
        'winlife_add_life',
        'winlife_subtract_life',
        'winlife_reset',
        'gift_battle_reset',
        'get_overlay_elements',
        'get_actions_list',
        'play_sound',
        'gtav_command',
        'minecraft_command',
        'gaming_command',
        'obs_scene',
        'get_profiles_list',
        'set_active_profile',
        'play_animation'
      ],
      widgets: ['winlife', 'gift-battle', 'overlay'],
      integrations: ['sounds', 'gtav', 'minecraft', 'gaming', 'obs'],
      version: '1.1.0'
    };
  }

  /**
   * Manejar mensajes entrantes desde StreamDeck
   */
  handleMessage(message) {
    // Log de mensaje eliminado para reducir spam

    const { type, action, data } = message;

    switch (type) {
      case 'ping':
        this.send({ type: 'pong', timestamp: Date.now() });
        break;

      case 'command':
        this.handleCommand(action, data);
        break;

      case 'get_capabilities':
        this.send({
          type: 'capabilities',
          data: this.getCapabilities()
        });
        break;
        
      case 'get_overlay_elements':
        this.getOverlayElements();
        break;
        
      case 'get_sounds_list':
        this.getSoundsList();
        break;
        
      case 'get_gtav_commands':
        this.getGTAVCommands(message.mode);
        break;
        
      case 'get_minecraft_commands':
        this.getMinecraftCommands();
        break;
        
      case 'get_gaming_commands':
        this.getGamingCommands();
        break;
        
      case 'get_actions_list':
        this.getActionsList();
        break;
        
      case 'get_events_list':
        this.getEventsList();
        break;
        
      case 'get_profiles_list':
        // Log eliminado para reducir spam
        this.getProfilesList();
        break;
        
      case 'get_event_status':
        this.getEventStatus(data);
        break;
        
      case 'log':
        // Log desde el plugin
        const logLevel = message.level || 'log';
        const logMessage = message.message || 'Sin mensaje';
        const logData = message.data || {};
        console[logLevel](`[StreamDeck Plugin] ${logMessage}`, logData);
        break;

      default:
        console.warn('[StreamDeck] Tipo de mensaje desconocido:', type);
        this.send({
          type: 'error',
          message: 'Tipo de mensaje desconocido',
          originalType: type
        });
    }
  }

  /**
   * Manejar comandos específicos
   */
  handleCommand(action, data) {
    // Log de comando eliminado para reducir spam

    switch (action) {
      // Ejecutar acción configurada
      case 'execute_action':
        this.executeAction(data);
        break;

      // Control de elementos del overlay
      case 'toggle_overlay_element':
        this.toggleOverlayElement(data);
        break;

      case 'show_overlay_element':
        this.showOverlayElement(data);
        break;

      case 'hide_overlay_element':
        this.hideOverlayElement(data);
        break;

      // Control del widget Win/Life
      case 'winlife_add_win':
        this.winlifeAddWin(data);
        break;

      case 'winlife_subtract_win':
        this.winlifeSubtractWin(data);
        break;

      case 'winlife_add_life':
        this.winlifeAddLife(data);
        break;

      case 'winlife_subtract_life':
        this.winlifeSubtractLife(data);
        break;

      case 'winlife_reset':
        this.winlifeReset(data);
        break;

      case 'winlife_set':
        this.winlifeSet(data);
        break;

      // Gift Battle
      case 'gift_battle_reset':
        this.giftBattleReset(data);
        break;

      // Obtener información
      case 'get_overlay_elements':
        this.getOverlayElements();
        break;

      case 'get_actions_list':
        this.getActionsList();
        break;
        
      // Reproducir sonido
      case 'play_sound':
        this.playSound(data);
        break;
        
      // Comando Minecraft
      case 'minecraft_command':
        this.minecraftCommand(data);
        break;
        
      // Comando Gaming (juegos TikControl)
      case 'gaming_command':
        this.gamingCommand(data);
        break;
        
      // Comando GTA V
      case 'gtav_command':
        this.gtavCommand(data);
        break;
        
      // Toggle comando GTA V
      case 'toggle_event':
        this.toggleEvent(data);
        break;
        
      // Escena OBS
      case 'obs_scene':
        this.obsScene(data);
        break;
        
      // Cambiar perfil activo
      case 'set_active_profile':
        this.setActiveProfile(data);
        break;

      case 'play_animation':
        this.playAnimation(data);
        break;
        
      // Obtener lista de perfiles
      case 'get_profiles_list':
        this.getProfilesList();
        break;

      default:
        this.send({
          type: 'error',
          message: `Acción desconocida: ${action}`,
          action
        });
    }
  }

  /**
   * Ejecutar una acción configurada en TikControl
   */
  executeAction(data) {
    const { actionId, actionName } = data;
    
    // Emitir evento para que el main process ejecute la acción
    this.emit('execute_action', { actionId, actionName });

    this.send({
      type: 'action_executed',
      success: true,
      actionId,
      actionName
    });
  }

  /**
   * Toggle de visibilidad de elemento del overlay
   */
  toggleOverlayElement(data) {
    const { elementId } = data;
    this.emit('toggle_overlay_element', { elementId });

    this.send({
      type: 'overlay_element_toggled',
      success: true,
      elementId
    });
  }

  /**
   * Mostrar elemento del overlay
   */
  showOverlayElement(data) {
    const { elementId } = data;
    this.emit('show_overlay_element', { elementId });

    this.send({
      type: 'overlay_element_shown',
      success: true,
      elementId
    });
  }

  /**
   * Ocultar elemento del overlay
   */
  hideOverlayElement(data) {
    const { elementId } = data;
    this.emit('hide_overlay_element', { elementId });

    this.send({
      type: 'overlay_element_hidden',
      success: true,
      elementId
    });
  }

  /**
   * Sumar win al widget Win/Life
   */
  winlifeAddWin(data) {
    const { amount = 1 } = data;
    this.emit('winlife_add_win', { amount });

    this.send({
      type: 'winlife_updated',
      success: true,
      action: 'add_win',
      amount
    });
  }

  /**
   * Restar win al widget Win/Life
   */
  winlifeSubtractWin(data) {
    const { amount = 1 } = data;
    this.emit('winlife_subtract_win', { amount });

    this.send({
      type: 'winlife_updated',
      success: true,
      action: 'subtract_win',
      amount
    });
  }

  /**
   * Sumar life al widget Win/Life
   */
  winlifeAddLife(data) {
    const { amount = 1 } = data;
    this.emit('winlife_add_life', { amount });

    this.send({
      type: 'winlife_updated',
      success: true,
      action: 'add_life',
      amount
    });
  }

  /**
   * Restar life al widget Win/Life
   */
  winlifeSubtractLife(data) {
    const { amount = 1 } = data;
    this.emit('winlife_subtract_life', { amount });

    this.send({
      type: 'winlife_updated',
      success: true,
      action: 'subtract_life',
      amount
    });
  }

  /**
   * Resetear el widget Win/Life
   */
  winlifeReset(data) {
    this.emit('winlife_reset', data);

    this.send({
      type: 'winlife_updated',
      success: true,
      action: 'reset'
    });
  }

  /**
   * Establecer valores específicos de Win/Life
   */
  winlifeSet(data) {
    const { wins, lives } = data;
    this.emit('winlife_set', { wins, lives });

    this.send({
      type: 'winlife_updated',
      success: true,
      action: 'set',
      wins,
      lives
    });
  }

  /**
   * Resetear scores de Gift Battle
   */
  giftBattleReset(data) {
    // Log eliminado para reducir spam
    this.emit('gift_battle_reset', data);

    this.send({
      type: 'gift_battle_updated',
      success: true,
      action: 'reset'
    });
  }

  /**
   * Obtener lista de elementos del overlay
   */
  getOverlayElements() {
    this.emit('request_overlay_elements');
  }

  /**
   * Enviar lista de elementos del overlay
   */
  sendOverlayElements(elements) {
    this.send({
      type: 'overlay_elements',
      data: elements
    });
  }

  /**
   * Obtener lista de acciones configuradas
   */
  getActionsList() {
    this.emit('request_actions_list');
  }

  /**
   * Enviar lista de acciones
   */
  sendActionsList(actions) {
    this.send({
      type: 'actions_list',
      data: actions
    });
  }

  /**
   * Solicitar lista de eventos
   */
  getEventsList() {
    this.emit('request_events_list');
  }

  /**
   * Enviar lista de eventos
   */
  sendEventsList(events) {
    this.send({
      type: 'events_list',
      data: events
    });
  }

  /**
   * Enviar mensaje al cliente StreamDeck
   */
  send(data) {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      try {
        this.client.send(JSON.stringify(data));
      } catch (error) {
        console.error('[StreamDeck] Error enviando mensaje:', error);
      }
    }
  }

  /**
   * Obtener estado de la conexión
   */
  getStatus() {
    return {
      connected: this.isConnected,
      port: this.port,
      hasClient: !!this.client,
      serverRunning: !!this.server
    };
  }
  
  /**
   * Reproducir sonido
   */
  playSound(data) {
    // Log eliminado para reducir spam
    this.emit('play-sound', data); // Cambié play_sound a play-sound para consistencia
    this.send({
      type: 'sound_played',
      success: true,
      sound: data.soundId || data.sound || data.soundName
    });
  }
  
  /**
   * Ejecutar comando GTA V
   */
  gtavCommand(data) {
    // Log eliminado para reducir spam
    this.emit('gtav_command', data);
    this.send({
      type: 'gtav_command_executed',
      success: true,
      commandId: data.commandId
    });
  }
  
  /**
   * Ejecutar comando Minecraft
   */
  minecraftCommand(data) {
    // Log eliminado para reducir spam
    this.emit('minecraft_command', data);
    this.send({
      type: 'minecraft_command_executed',
      success: true,
      command: data.command
    });
  }
  
  /**
   * Cambiar escena OBS
   */
  obsScene(data) {
    // Log eliminado para reducir spam
    this.emit('obs_scene', data);
    this.send({
      type: 'obs_scene_changed',
      success: true,
      scene: data.scene || data.sceneName
    });
  }
  
  /**
   * Obtener elementos del overlay
   */
  getOverlayElements() {
    // Log eliminado para reducir spam
    this.emit('request_overlay_elements');
  }
  
  /**
   * Obtener lista de sonidos
   */
  getSoundsList() {
    // Log eliminado para reducir spam
    this.emit('request_sounds_list');
  }
  
  /**
   * Obtener comandos GTA V
   */
  getGTAVCommands(mode) {
    // Log eliminado para reducir spam
    this.emit('request_gtav_commands', { mode });
  }
  
  /**
   * Obtener comandos Minecraft
   */
  getMinecraftCommands() {
    // Log eliminado para reducir spam
    this.emit('request_minecraft_commands');
  }
  
  /**
   * Obtener catálogo de juegos y comandos Gaming (TikControl)
   */
  getGamingCommands() {
    this.emit('request_gaming_commands');
  }
  
  /**
   * Ejecutar comando de juego (Gaming)
   */
  gamingCommand(data) {
    this.emit('gaming_command', data);
    this.send({
      type: 'gaming_command_executed',
      success: true,
      gameId: data?.gameId,
      commandId: data?.commandId
    });
  }
  
  /**
   * Toggle event on/off
   */
  toggleEvent(data) {
    // Log eliminado para reducir spam
    this.emit('toggle_event', data);
  }
  
  /**
   * Obtener estado de evento
   */
  getEventStatus(data) {
    // Log eliminado para reducir spam
    this.emit('get_event_status', data);
  }
  
  /**
   * Obtener lista de perfiles
   */
  getProfilesList() {
    // Log eliminado para reducir spam
    this.emit('request_profiles_list');
  }
  
  /**
   * Cambiar perfil activo
   */
  setActiveProfile(data) {
    const { profileId, profileName } = data;
    // Log eliminado para reducir spam
    this.emit('set_active_profile', { profileId, profileName });
    this.send({
      type: 'profile_changed',
      success: true,
      profileId,
      profileName
    });
  }

  playAnimation(data) {
    const animationType = data.animationType || data.type || 'x2';
    console.log('[StreamDeck] Playing animation:', animationType);
    this.emit('play_animation', { animationType });

    try {
      const cloudRelay = require('../modules/integrations/cloudRelay');
      if (cloudRelay && cloudRelay.send) {
        console.log('[StreamDeck] Sending animation:play via cloudRelay. Connected:', cloudRelay.isConnected ? cloudRelay.isConnected() : 'unknown');
        cloudRelay.send('animation:play', { type: animationType, animationType });
      } else {
        console.error('[StreamDeck] cloudRelay.send not available');
      }
    } catch (e) {
      console.error('[StreamDeck] Error sending animation to AWS:', e.message);
    }

    this.send({
      type: 'animation_played',
      success: true,
      animationType
    });
  }
  
  /**
   * Enviar lista de perfiles
   */
  sendProfilesList(profiles) {
    this.send({
      type: 'profiles_list',
      data: profiles
    });
  }
  
  /**
   * Enviar elementos del overlay
   */
  sendOverlayElements(elements) {
    this.send({
      type: 'overlay_elements',
      data: elements
    });
  }
  
  /**
   * Enviar lista de sonidos
   */
  sendSoundsList(sounds) {
    this.send({
      type: 'sounds_list',
      data: sounds
    });
  }
  
  /**
   * Enviar comandos GTA V
   */
  sendGTAVCommands(commands) {
    this.send({
      type: 'gtav_commands',
      data: commands
    });
  }
  
  /**
   * Enviar comandos Minecraft
   */
  sendMinecraftCommands(commands) {
    this.send({
      type: 'minecraft_commands',
      data: commands
    });
  }
  
  /**
   * Enviar catálogo de juegos y comandos Gaming
   */
  sendGamingCommands(commands) {
    this.send({
      type: 'gaming_commands',
      data: commands
    });
  }
  
  /**
   * Enviar estado de evento (para toggle buttons)
   */
  sendCommandStatus(statusData) {
    this.send({
      type: 'event_status',
      context: statusData.context,
      eventId: statusData.eventId,
      enabled: statusData.enabled
    });
  }
  
  /**
   * Enviar confirmación de toggle de evento
   */
  sendCommandToggled(toggleData) {
    this.send({
      type: 'event_toggled',
      context: toggleData.context,
      eventId: toggleData.eventId,
      enabled: toggleData.enabled
    });
  }
  
  /**
   * Enviar estado de evento (alias para compatibilidad)
   */
  sendEventStatus(statusData) {
    this.send({
      type: 'event_status',
      context: statusData.context,
      eventId: statusData.eventId,
      enabled: statusData.enabled
    });
  }
}

// Instancia singleton
let streamdeckService = null;

function getStreamDeckService() {
  if (!streamdeckService) {
    streamdeckService = new StreamDeckService();
  }
  return streamdeckService;
}

// Registrar IPC handlers
function registerStreamDeckIPC(mainWindow) {
  const service = getStreamDeckService();

  // Iniciar servidor
  ipcMain.handle('streamdeck:start', async (event, config) => {
    try {
      const result = service.start(config);
      return { success: result };
    } catch (error) {
      console.error('[StreamDeck IPC] Error iniciando:', error);
      return { success: false, error: error.message };
    }
  });

  // Detener servidor
  ipcMain.handle('streamdeck:stop', async () => {
    try {
      service.stop();
      return { success: true };
    } catch (error) {
      console.error('[StreamDeck IPC] Error deteniendo:', error);
      return { success: false, error: error.message };
    }
  });

  // Obtener estado
  ipcMain.handle('streamdeck:status', async () => {
    return service.getStatus();
  });

  // Enviar lista de elementos del overlay
  ipcMain.handle('streamdeck:send-overlay-elements', async (event, elements) => {
    service.sendOverlayElements(elements);
    return { success: true };
  });

  // Enviar lista de acciones
  ipcMain.handle('streamdeck:send-actions-list', async (event, actions) => {
    service.sendActionsList(actions);
    return { success: true };
  });
  
  // Enviar lista de eventos
  ipcMain.handle('streamdeck:send-events-list', async (event, events) => {
    service.sendEventsList(events);
    return { success: true };
  });
  
  // Enviar lista de sonidos
  ipcMain.handle('streamdeck:send-sounds-list', async (event, sounds) => {
    service.sendSoundsList(sounds);
    return { success: true };
  });
  
  // Enviar comandos GTA V
  ipcMain.handle('streamdeck:send-gtav-commands', async (event, commands) => {
    service.sendGTAVCommands(commands);
    return { success: true };
  });
  
  // Enviar comandos Minecraft
  ipcMain.handle('streamdeck:send-minecraft-commands', async (event, commands) => {
    service.sendMinecraftCommands(commands);
    return { success: true };
  });
  
  // Enviar catálogo Gaming
  ipcMain.handle('streamdeck:send-gaming-commands', async (event, commands) => {
    service.sendGamingCommands(commands);
    return { success: true };
  });
  
  // Enviar estado de comando GTA V
  ipcMain.handle('streamdeck:send-command-status', async (event, statusData) => {
    service.sendCommandStatus(statusData);
    return { success: true };
  });
  
  // Enviar toggle de comando GTA V
  ipcMain.handle('streamdeck:send-command-toggled', async (event, toggleData) => {
    service.sendCommandToggled(toggleData);
    return { success: true };
  });
  
  // Enviar lista de perfiles
  ipcMain.handle('streamdeck:send-profiles-list', async (event, profiles) => {
    service.sendProfilesList(profiles);
    return { success: true };
  });

  // Forward eventos al renderer
  function safeSend(channel, ...args) {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, ...args);
      }
    } catch (_) {}
  }

  service.on('connected', () => {
    safeSend('streamdeck:connected');
  });

  service.on('disconnected', () => {
    safeSend('streamdeck:disconnected');
  });

  service.on('error', (error) => {
    safeSend('streamdeck:error', error.message);
  });

  // Forward comandos al renderer para ejecutar
  service.on('execute_action', (data) => {
    safeSend('streamdeck:execute-action', data);
  });

  service.on('toggle_overlay_element', (data) => {
    safeSend('streamdeck:toggle-overlay-element', data);
  });

  service.on('show_overlay_element', (data) => {
    safeSend('streamdeck:show-overlay-element', data);
  });

  service.on('hide_overlay_element', (data) => {
    safeSend('streamdeck:hide-overlay-element', data);
  });

  service.on('winlife_add_win', (data) => {
    safeSend('streamdeck:winlife-add-win', data);
  });

  service.on('winlife_subtract_win', (data) => {
    safeSend('streamdeck:winlife-subtract-win', data);
  });

  service.on('winlife_add_life', (data) => {
    safeSend('streamdeck:winlife-add-life', data);
  });

  service.on('winlife_subtract_life', (data) => {
    safeSend('streamdeck:winlife-subtract-life', data);
  });

  service.on('winlife_reset', (data) => {
    safeSend('streamdeck:winlife-reset', data);
  });

  service.on('winlife_set', (data) => {
    safeSend('streamdeck:winlife-set', data);
  });

  service.on('gift_battle_reset', (data) => {
    safeSend('streamdeck:gift-battle-reset', data);
  });

  service.on('request_overlay_elements', () => {
    safeSend('streamdeck:request-overlay-elements');
  });

  service.on('request_actions_list', () => {
    safeSend('streamdeck:request-actions-list');
  });
  
  service.on('request_events_list', () => {
    safeSend('streamdeck:request-events-list');
  });
  
  service.on('play-sound', (data) => {
    safeSend('streamdeck:play-sound', data);
  });
  
  service.on('gtav_command', (data) => {
    safeSend('streamdeck:gtav-command', data);
  });
  
  service.on('minecraft_command', (data) => {
    safeSend('streamdeck:minecraft-command', data);
  });
  
  service.on('obs_scene', (data) => {
    safeSend('streamdeck:obs-scene', data);
  });
  
  service.on('request_overlay_elements', () => {
    safeSend('streamdeck:request-overlay-elements');
  });
  
  service.on('request_sounds_list', () => {
    safeSend('streamdeck:request-sounds-list');
  });
  
  service.on('request_gtav_commands', (data) => {
    safeSend('streamdeck:request-gtav-commands', data);
  });
  
  service.on('request_minecraft_commands', () => {
    safeSend('streamdeck:request-minecraft-commands');
  });
  
  service.on('request_gaming_commands', () => {
    safeSend('streamdeck:request-gaming-commands');
  });
  
  service.on('gaming_command', (data) => {
    safeSend('streamdeck:gaming-command', data);
  });
  
  service.on('toggle_event', (data) => {
    safeSend('streamdeck:toggle-event', data);
  });
  
  service.on('get_event_status', (data) => {
    safeSend('streamdeck:get-event-status', data);
  });
  
  service.on('request_profiles_list', () => {
    safeSend('streamdeck:request-profiles-list');
  });
  
  service.on('set_active_profile', (data) => {
    safeSend('streamdeck:set-active-profile', data);
  });

  service.on('play_animation', (data) => {
    safeSend('streamdeck:play-animation', data);
  });

  // [log cleaned]
}

module.exports = {
  getStreamDeckService,
  registerStreamDeckIPC
};

