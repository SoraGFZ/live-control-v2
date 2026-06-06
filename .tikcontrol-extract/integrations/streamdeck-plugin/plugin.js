/**
 * TikControl StreamDeck Plugin
 * Connects to TikControl via WebSocket
 */

let websocket = null;
let pluginUUID = null;
let inInfo = null;
let actionInfo = {};
let settingsCache = {};

// ✅ Tracking de último context por tipo de acción para feedback visual
let lastActionContext = {};

// WebSocket connection settings
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9091;

/**
 * Connect to Stream Deck
 */
function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
    pluginUUID = inPluginUUID;
    inInfo = JSON.parse(inInfo);
    
    // Connect to Stream Deck
    const streamDeckWebsocket = new WebSocket('ws://127.0.0.1:' + inPort);
    
    streamDeckWebsocket.onopen = function() {
        console.log('[Plugin] Connected to Stream Deck');
        
        // Register plugin
        const json = {
            event: inRegisterEvent,
            uuid: inPluginUUID
        };
        
        streamDeckWebsocket.send(JSON.stringify(json));
        
        // Connect to TikControl
        connectToTikControl();
    };
    
    streamDeckWebsocket.onmessage = function(evt) {
        try {
            const jsonObj = JSON.parse(evt.data);
            const event = jsonObj.event;
            const action = jsonObj.action;
            const context = jsonObj.context;
            const payload = jsonObj.payload || {};
            
            console.log('[Plugin] Event:', event, action);
            
            // Handle events
            switch(event) {
                case 'keyDown':
                    handleKeyDown(context, action, payload);
                    break;
                    
                case 'keyUp':
                    handleKeyUp(context, action, payload);
                    break;
                    
                case 'willAppear':
                    handleWillAppear(context, action, payload);
                    break;
                    
                case 'willDisappear':
                    handleWillDisappear(context, action, payload);
                    break;
                    
                case 'didReceiveSettings':
                    handleDidReceiveSettings(context, action, payload);
                    break;
                    
                case 'propertyInspectorDidAppear':
                    handlePropertyInspectorDidAppear(context, action);
                    break;
                    
                case 'propertyInspectorDidDisappear':
                    handlePropertyInspectorDidDisappear(context, action);
                    break;
                    
                case 'sendToPlugin':
                    handleSendToPlugin(context, action, payload);
                    break;
            }
        } catch(e) {
            console.error('[Plugin] Error handling message:', e);
        }
    };
    
    streamDeckWebsocket.onerror = function(evt) {
        console.error('[Plugin] WebSocket error:', evt);
    };
    
    streamDeckWebsocket.onclose = function() {
        console.log('[Plugin] Disconnected from Stream Deck');
    };
    
    // Store reference
    window.streamDeckWebsocket = streamDeckWebsocket;
}

/**
 * Connect to TikControl WebSocket server
 */
function connectToTikControl() {
    const host = DEFAULT_HOST;
    const port = DEFAULT_PORT;
    const url = `ws://${host}:${port}`;
    
    console.log('[Plugin] Connecting to TikControl:', url);
    
    try {
        websocket = new WebSocket(url);
        
        websocket.onopen = function() {
            console.log('[Plugin] Connected to TikControl');
            
            // Send ping to verify connection
            sendToTikControl({
                type: 'ping'
            });
            
            // Update all buttons to show connected state
            updateAllButtonStates(true);
        };
        
        websocket.onmessage = function(evt) {
            try {
                const data = JSON.parse(evt.data);
                console.log('[Plugin] TikControl response:', data);
                
                // Handle responses
                handleTikControlMessage(data);
            } catch(e) {
                console.error('[Plugin] Error parsing TikControl message:', e);
            }
        };
        
        websocket.onerror = function(error) {
            console.error('[Plugin] TikControl WebSocket error:', error);
            updateAllButtonStates(false);
        };
        
        websocket.onclose = function() {
            console.log('[Plugin] Disconnected from TikControl');
            updateAllButtonStates(false);
            
            // Attempt reconnection after 5 seconds
            setTimeout(connectToTikControl, 5000);
        };
    } catch(e) {
        console.error('[Plugin] Error connecting to TikControl:', e);
        
        // Attempt reconnection after 5 seconds
        setTimeout(connectToTikControl, 5000);
    }
}

/**
 * Send message to TikControl
 */
function sendToTikControl(data) {
    if(websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(data));
        console.log('[Plugin] Sent to TikControl:', data);
    } else {
        console.warn('[Plugin] Not connected to TikControl');
        showAlert('Not connected to TikControl');
    }
}

/**
 * Handle TikControl messages
 */
function handleTikControlMessage(data) {
    const { type } = data;
    
    switch(type) {
        case 'pong':
            console.log('[Plugin] TikControl is alive');
            break;
            
        case 'welcome':
            console.log('[Plugin] Welcome message:', data.message);
            break;
            
        case 'action_executed':
            console.log('[Plugin] Command executed successfully:', data);
            showOk(lastActionContext['com.tikcontrol.streamdeck.executeaction']);
            break;
            
        case 'overlay_element_toggled':
        case 'overlay_element_shown':
        case 'overlay_element_hidden':
            console.log('[Plugin] Command executed successfully:', data);
            showOk(lastActionContext['com.tikcontrol.streamdeck.toggleelement']);
            break;
            
        case 'winlife_updated':
            console.log('[Plugin] Win/Life updated successfully:', data);
            showOk(lastActionContext['com.tikcontrol.streamdeck.winlife']);
            break;
            
        case 'gift_battle_updated':
            console.log('[Plugin] Gift Battle updated successfully:', data);
            showOk(lastActionContext['com.tikcontrol.streamdeck.giftbattle']);
            break;
            
        case 'event_status':
            // Actualizar estado del botón toggle de evento
            console.log('[Plugin] 📥 Recibido event_status:', data);
            if(data.context && data.enabled !== undefined) {
                console.log('[Plugin] ✅ Actualizando estado del evento:', data.enabled ? 'ON' : 'OFF', 'para context:', data.context);
                updateToggleButtonState(data.context, data.enabled);
            } else {
                console.warn('[Plugin] ⚠️ Datos incompletos en event_status:', { hasContext: !!data.context, hasEnabled: data.enabled !== undefined });
            }
            break;
            
        case 'event_toggled':
            // Evento toggleado exitosamente
            console.log('[Plugin] 📥 Recibido event_toggled:', data);
            if(data.context && data.enabled !== undefined) {
                console.log('[Plugin] ✅ Evento toggleado a:', data.enabled ? 'ON' : 'OFF');
                updateToggleButtonState(data.context, data.enabled);
                showOk(data.context);
            } else {
                console.warn('[Plugin] ⚠️ Datos incompletos en event_toggled:', { hasContext: !!data.context, hasEnabled: data.enabled !== undefined });
            }
            break;
            
        case 'profile_changed':
            console.log('[Plugin] ✅ Perfil cambiado exitosamente:', data.profileName || data.profileId);
            showOk();
            break;

        case 'animation_played':
            console.log('[Plugin] Animation played successfully:', data);
            showOk(lastActionContext['com.tikcontrol.streamdeck.animation']);
            break;
            
        case 'gaming_command_executed':
            console.log('[Plugin] Gaming command executed successfully:', data);
            showOk(lastActionContext['com.tikcontrol.streamdeck.gamingcommand']);
            break;
            
        case 'error':
            console.error('[Plugin] TikControl error:', data.message);
            showAlert(data.message);
            break;
    }
}

/**
 * Handle key down event
 */
function handleKeyDown(context, action, payload) {
    console.log('[Plugin] Key down:', action);
}

/**
 * Handle key up event (button pressed)
 */
function handleKeyUp(context, action, payload) {
    console.log('[Plugin] Key up:', action);
    
    // ✅ FIX: Usar settingsCache primero (igual que GTA V funciona)
    const settings = settingsCache[context] || payload.settings || {};
    
    console.log('[Plugin] 🔧 Settings obtenidos:', {
        context: context,
        fromCache: !!settingsCache[context],
        fromPayload: !!payload.settings,
        settings: settings
    });
    
    // ✅ Guardar context para feedback visual (showOk/showAlert)
    lastActionContext[action] = context;
    
    // Execute action based on UUID
    switch(action) {
        case 'com.tikcontrol.streamdeck.executeaction':
            executeAction(settings);
            break;
            
        case 'com.tikcontrol.streamdeck.winlife':
            handleWinLife(settings);
            break;
            
        case 'com.tikcontrol.streamdeck.giftbattle':
            handleGiftBattle(settings);
            break;
            
        case 'com.tikcontrol.streamdeck.toggleelement':
            toggleElement(settings);
            break;
            
        case 'com.tikcontrol.streamdeck.playsound':
            console.log('[Plugin] 🎵 Play Sound presionado - settings:', settings);
            playSound(settings);
            break;
            
        case 'com.tikcontrol.streamdeck.minecraftcommand':
            executeMinecraftCommand(settings);
            break;
            
        case 'com.tikcontrol.streamdeck.gamingcommand':
            executeGamingCommand(settings);
            break;
            
        case 'com.tikcontrol.streamdeck.obsscene':
            switchOBSScene(settings);
            break;
            
        case 'com.tikcontrol.streamdeck.eventtoggle':
            toggleEvent(context, settings);
            break;
            
        case 'com.tikcontrol.streamdeck.switchprofile':
            switchProfile(settings);
            break;

        case 'com.tikcontrol.streamdeck.animation':
            playAnimation(settings);
            break;
    }
}

/**
 * Execute a TikControl action
 */
function executeAction(settings) {
    console.log('[Plugin] Execute Action settings:', settings);
    
    const actionId = settings.actionId || '';
    const actionName = settings.actionName || '';
    
    // Validar que actionId no sea vacío, null, undefined, o el string "undefined"
    if(!actionId || actionId === '' || actionId === 'undefined' || actionId === 'null') {
        console.warn('[Plugin] ⚠️ No action configured or invalid actionId:', actionId);
        return;
    }
    
    console.log('[Plugin] Ejecutando acción:', actionId, '(', actionName, ')');
    
    sendToTikControl({
        type: 'command',
        action: 'execute_action',
        data: {
            actionId: actionId,
            actionName: actionName
        }
    });
}

/**
 * Handle Win/Life actions
 */
function handleWinLife(settings) {
    const action = settings.action || 'add_win';
    const amount = parseInt(settings.amount) || 1;
    
    let command = {};
    
    switch(action) {
        case 'add_win':
            command = { type: 'command', action: 'winlife_add_win', data: { amount } };
            break;
        case 'subtract_win':
            command = { type: 'command', action: 'winlife_subtract_win', data: { amount } };
            break;
        case 'random_win':
            // Random entre -amount y +amount (ej: amount=5 → random entre -5 y +5)
            const range = amount * 2 + 1; // Para amount=5: 11 opciones (-5 a +5)
            const randomWin = Math.floor(Math.random() * range) - amount;
            console.log('[Plugin] 🎲 Random Win: amount=' + amount + ', result=' + randomWin);
            command = { 
                type: 'command', 
                action: randomWin >= 0 ? 'winlife_add_win' : 'winlife_subtract_win', 
                data: { amount: Math.abs(randomWin) } 
            };
            break;
        case 'add_life':
            command = { type: 'command', action: 'winlife_add_life', data: { amount } };
            break;
        case 'subtract_life':
            command = { type: 'command', action: 'winlife_subtract_life', data: { amount } };
            break;
        case 'random_life':
            // Random entre -amount y +amount (ej: amount=5 → random entre -5 y +5)
            const rangeLife = amount * 2 + 1; // Para amount=5: 11 opciones (-5 a +5)
            const randomLife = Math.floor(Math.random() * rangeLife) - amount;
            console.log('[Plugin] 🎲 Random Life: amount=' + amount + ', result=' + randomLife);
            command = { 
                type: 'command', 
                action: randomLife >= 0 ? 'winlife_add_life' : 'winlife_subtract_life', 
                data: { amount: Math.abs(randomLife) } 
            };
            break;
    }
    
    sendToTikControl(command);
}

/**
 * Handle Gift Battle Reset
 */
function handleGiftBattle(settings) {
    console.log('[Plugin] 🥊 Gift Battle Reset');
    const command = { 
        type: 'command', 
        action: 'gift_battle_reset', 
        data: {} 
    };
    sendToTikControl(command);
}

/**
 * Toggle overlay element
 */
function toggleElement(settings) {
    const elementId = settings.elementId || '';
    
    if(!elementId) {
        showAlert('No element ID configured');
        return;
    }
    
    sendToTikControl({
        type: 'command',
        action: 'toggle_overlay_element',
        data: {
            elementId: elementId
        }
    });
}

/**
 * Switch TikControl profile
 */
function switchProfile(settings) {
    console.log('[Plugin] Switch Profile settings:', settings);
    
    const profileId = settings.profileId || '';
    const profileName = settings.profileName || '';
    
    if(!profileId || profileId === '' || profileId === 'undefined' || profileId === 'null') {
        console.warn('[Plugin] ⚠️ No profile configured or invalid profileId:', profileId);
        showAlert('No profile configured');
        return;
    }
    
    console.log('[Plugin] Cambiando a perfil:', profileId, '(', profileName, ')');
    
    sendToTikControl({
        type: 'command',
        action: 'set_active_profile',
        data: {
            profileId: profileId,
            profileName: profileName
        }
    });
}

/**
 * Play a TikControl animation
 */
function playAnimation(settings) {
    const animationType = settings.animationType || 'x2';
    
    console.log('[Plugin] Playing animation:', animationType);
    
    sendToTikControl({
        type: 'command',
        action: 'play_animation',
        data: {
            animationType: animationType,
            type: animationType
        }
    });
}


// Polling intervals para cada botón toggle
const pollingIntervals = {};

/**
 * Handle will appear
 */
function handleWillAppear(context, action, payload) {
    console.log('[Plugin] Will appear:', action);
    
    const settings = payload.settings || {};
    actionInfo[context] = {
        action: action,
        settings: settings
    };
    
    // ✅ FIX: Poblar settingsCache desde willAppear para que estén disponibles en keyUp
    if(settings && Object.keys(settings).length > 0) {
        settingsCache[context] = settings;
    }
    
    // Request settings if not available
    if(!settings || Object.keys(settings).length === 0) {
        requestSettings(context);
    }
    
    // For toggle buttons, get initial state and start polling
    if(action === 'com.tikcontrol.streamdeck.eventtoggle') {
        const eventId = settings.eventId || '';
        
        if(eventId) {
            console.log('[Plugin] 🔍 Solicitando estado inicial para evento:', eventId);
            
            // Función para solicitar estado
            const requestState = () => {
                sendToTikControl({
                    type: 'get_event_status',
                    data: {
                        eventId: eventId,
                        context: context
                    }
                });
            };
            
            // Solicitar estado inicial
            requestState();
            
            // ✅ Polling cada 2 segundos para detectar cambios desde la app
            pollingIntervals[context] = setInterval(requestState, 2000);
            console.log('[Plugin] ✅ Polling activado para context:', context);
        }
    }
}

/**
 * Handle will disappear
 */
function handleWillDisappear(context, action, payload) {
    console.log('[Plugin] Will disappear:', action);
    delete actionInfo[context];
    
    // ✅ Limpiar polling cuando el botón desaparece
    if(pollingIntervals[context]) {
        clearInterval(pollingIntervals[context]);
        delete pollingIntervals[context];
        console.log('[Plugin] ✅ Polling detenido para context:', context);
    }
}

/**
 * Handle did receive settings
 */
function handleDidReceiveSettings(context, action, payload) {
    console.log('[Plugin] Did receive settings:', payload.settings);
    
    const settings = payload.settings || {};
    settingsCache[context] = settings;
    
    if(actionInfo[context]) {
        actionInfo[context].settings = settings;
    }
}

/**
 * Handle property inspector appear
 */
function handlePropertyInspectorDidAppear(context, action) {
    console.log('[Plugin] Property inspector appeared:', action);
}

/**
 * Handle property inspector disappear
 */
function handlePropertyInspectorDidDisappear(context, action) {
    console.log('[Plugin] Property inspector disappeared:', action);
}

/**
 * Handle send to plugin
 */
function handleSendToPlugin(context, action, payload) {
    console.log('[Plugin] Send to plugin:', payload);
}

/**
 * Request settings for a context
 */
function requestSettings(context) {
    if(window.streamDeckWebsocket) {
        window.streamDeckWebsocket.send(JSON.stringify({
            event: 'getSettings',
            context: context
        }));
    }
}

/**
 * Show OK feedback on Stream Deck button
 */
function showOk(context) {
    if(window.streamDeckWebsocket && context) {
        window.streamDeckWebsocket.send(JSON.stringify({
            event: 'showOk',
            context: context
        }));
    }
}

/**
 * Show alert feedback on Stream Deck button
 */
function showAlert(message, context) {
    console.warn('[Plugin] Alert:', message);
    
    if(window.streamDeckWebsocket && context) {
        window.streamDeckWebsocket.send(JSON.stringify({
            event: 'showAlert',
            context: context
        }));
    }
}

/**
 * Update all button states
 */
function updateAllButtonStates(connected) {
    // This would update the visual state of all buttons
    // For now, just log
    console.log('[Plugin] Update all button states:', connected ? 'connected' : 'disconnected');
}

/**
 * Set title of a button
 */
function setTitle(context, title) {
    if(window.streamDeckWebsocket) {
        window.streamDeckWebsocket.send(JSON.stringify({
            event: 'setTitle',
            context: context,
            payload: {
                title: title,
                target: 0
            }
        }));
    }
}

/**
 * Play a sound in TikControl
 */
function playSound(settings) {
    const soundId = settings.soundId || '';
    
    console.log('[Plugin] 🔊 playSound llamado con settings:', settings);
    console.log('[Plugin] 🔊 soundId extraído:', soundId);
    
    if(!soundId || soundId === '' || soundId === 'undefined' || soundId === 'null') {
        console.warn('[Plugin] ⚠️ No sound ID specified - soundId:', soundId);
        // Enviar mensaje de error al backend para que aparezca en logs de TikControl
        sendToTikControl({
            type: 'log',
            level: 'warn',
            message: '[Plugin] No sound ID specified',
            data: { settings, soundId }
        });
        return;
    }
    
    console.log('[Plugin] ✅ Enviando comando play_sound con soundId:', soundId);
    
    sendToTikControl({
        type: 'command',
        action: 'play_sound',
        data: {
            soundId: soundId
        }
    });
    
    console.log('[Plugin] ✅ Comando enviado');
}

/**
 * Execute a Minecraft command
 */
function executeMinecraftCommand(settings) {
    console.log('[Plugin] Minecraft settings:', settings);
    
    const commandId = settings.commandId || '';
    const rawCommand = settings.rawCommand || '';
    
    // Validar que commandId no sea vacío si se está usando
    if(!commandId && !rawCommand) {
        console.warn('[Plugin] ⚠️ No Minecraft command specified - select an action or enter raw command');
        return;
    }
    
    // Si commandId está presente pero es vacío string, usar solo rawCommand
    if(commandId === '' && rawCommand) {
        console.log('[Plugin] Enviando comando raw:', rawCommand);
        sendToTikControl({
            type: 'command',
            action: 'minecraft_command',
            data: {
                commandId: null, // null en lugar de string vacío
                rawCommand: rawCommand
            }
        });
        return;
    }
    
    // Si commandId tiene valor, usarlo
    if(commandId) {
        console.log('[Plugin] Enviando acción guardada:', commandId);
        sendToTikControl({
            type: 'command',
            action: 'minecraft_command',
            data: {
                commandId: commandId,
                rawCommand: rawCommand || ''
            }
        });
        return;
    }
    
    console.warn('[Plugin] ⚠️ Invalid state - no valid command to execute');
}

/**
 * Execute a Gaming command (TikControl games)
 */
function executeGamingCommand(settings) {
    const gameId = settings.gameId || '';
    const commandId = settings.commandId || '';
    
    if (!gameId || !commandId) {
        console.warn('[Plugin] ⚠️ Gaming command: select game and command');
        showAlert('Selecciona juego y comando');
        return;
    }
    
    sendToTikControl({
        type: 'command',
        action: 'gaming_command',
        data: {
            gameId: gameId,
            commandId: commandId,
            options: settings.options || {}
        }
    });
}

/**
 * Switch OBS scene
 */
function switchOBSScene(settings) {
    const sceneName = settings.sceneName || '';
    
    if(!sceneName) {
        console.warn('[Plugin] No OBS scene name specified');
        return;
    }
    
    sendToTikControl({
        type: 'obs_scene',
        scene: sceneName
    });
}

/**
 * Toggle event on/off
 */
function toggleEvent(context, settings) {
    const eventId = settings.eventId || '';
    
    if(!eventId) {
        console.warn('[Plugin] No event ID specified for toggle');
        showAlert('No event configured', context);
        return;
    }
    
    console.log('[Plugin] Toggle Event:', eventId);
    
    sendToTikControl({
        type: 'command',
        action: 'toggle_event',
        data: {
            eventId: eventId,
            context: context // Enviar context para actualizar el estado del botón
        }
    });
}

/**
 * Update toggle button state
 */
function updateToggleButtonState(context, state) {
    console.log('[Plugin] 🔄 updateToggleButtonState llamado:', { context, state, hasWebsocket: !!window.streamDeckWebsocket });
    
    if(!window.streamDeckWebsocket) {
        console.error('[Plugin] ❌ streamDeckWebsocket no disponible');
        return;
    }
    
    if(!context) {
        console.error('[Plugin] ❌ context no proporcionado');
        return;
    }
    
    // Estados en manifest: [0] = ON, [1] = OFF (invertidos para que coincida con el comportamiento de StreamDeck)
    const newState = state ? 0 : 1; // 0 = on (enabled=true), 1 = off (enabled=false)
    console.log('[Plugin] 📤 Enviando setState:', { event: 'setState', context, state: newState, enabled: state });
    
    try {
        window.streamDeckWebsocket.send(JSON.stringify({
            event: 'setState',
            context: context,
            payload: {
                state: newState
            }
        }));
        console.log('[Plugin] ✅ setState enviado exitosamente - Estado:', newState === 1 ? 'ON (verde)' : 'OFF (gris)');
    } catch(e) {
        console.error('[Plugin] ❌ Error enviando setState:', e);
    }
}

// Expose function globally for Stream Deck to call
window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;

