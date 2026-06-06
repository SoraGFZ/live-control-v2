// Módulo de integración: conecta eventos de TikTok con Risk of Rain 2
// Lee la configuración del perfil activo y ejecuta efectos según los eventos

const { ipcMain } = require('electron');

let mainWindow = null;
let ror2Module = null;
let activeTik = null;
let currentProfileId = null;
let profileData = null;
let eventCounters = {
  likes: 0
};

async function init(mainWin, ror2, tik) {
  mainWindow = mainWin;
  ror2Module = ror2;
  activeTik = tik;
  
  console.log('[RoR2 Integration] 🚀 Inicializando integración con TikTok');
  console.log('[RoR2 Integration] 🪟 mainWindow:', !!mainWindow);
  console.log('[RoR2 Integration] 🎮 ror2Module:', !!ror2Module);
  console.log('[RoR2 Integration] 📡 activeTik:', !!activeTik);
  
  // Suscribirse a eventos de cambio de perfil
  ipcMain.on('ror2:integration:setProfile', async (event, profileId) => {
    console.log('[RoR2 Integration] 🔄 Cambio de perfil detectado:', profileId);
    currentProfileId = profileId;
    await loadProfileConfiguration();
  });
  
  // Iniciar integración
  setupEventListeners();
  
  // ✅ CARGAR PERFIL ACTIVO AL INICIO
  console.log('[RoR2 Integration] 📂 Intentando cargar perfil activo...');
  try {
    const { listProfiles } = require('../../../modules/profiles');
    const profiles = listProfiles();
    console.log('[RoR2 Integration] 📋 Perfiles disponibles:', profiles?.length || 0);
    
    if (profiles && profiles.length > 0) {
      // Usar el perfil más reciente (mismo criterio que main.js)
      let activeProfile = profiles[0];
      for (const p of profiles) {
        const a = new Date(p.updatedAt || 0).getTime();
        const b = new Date(activeProfile.updatedAt || 0).getTime();
        if (a > b) activeProfile = p;
      }
      
      if (activeProfile && activeProfile.id) {
        console.log('[RoR2 Integration] 🔄 Perfil más reciente encontrado:', activeProfile.id, activeProfile.name);
        currentProfileId = activeProfile.id;
        await loadProfileConfiguration();
        console.log('[RoR2 Integration] ✅ Perfil cargado exitosamente, profileData:', !!profileData);
      }
    } else {
      console.warn('[RoR2 Integration] ⚠️ No hay perfiles disponibles');
    }
  } catch (e) {
    console.error('[RoR2 Integration] ❌ Error cargando perfil inicial:', e);
    console.error('[RoR2 Integration] ❌ Stack:', e.stack);
  }
  
  console.log('[RoR2 Integration] ✅ Integración inicializada correctamente');
}

async function loadProfileConfiguration() {
  if (!currentProfileId) {
    console.log('[RoR2 Integration] ⚠️ No hay perfil activo');
    return;
  }
  
  console.log('[RoR2 Integration] 📂 Cargando configuración para perfil:', currentProfileId);
  
  try {
    const { getProfileData } = require('../../../modules/profiles');
    console.log('[RoR2 Integration] 📂 getProfileData importado correctamente');
    
    const data = getProfileData(currentProfileId); // ✅ Retorna directamente el objeto
    console.log('[RoR2 Integration] 📂 Datos del perfil recibidos:', !!data);
    console.log('[RoR2 Integration] 📂 Estructura del perfil:', Object.keys(data || {}));
    
    if (data) {
      profileData = data;
      console.log('[RoR2 Integration] 📂 Configuración cargada para perfil:', currentProfileId);
      
      // Verificar si Risk of Rain 2 está activo
      const juegos = profileData.juegos || {};
      console.log('[RoR2 Integration] 🎮 juegos existe:', !!juegos);
      console.log('[RoR2 Integration] 🎮 Keys de juegos:', Object.keys(juegos));
      
      const enabled = juegos.enabled || {};
      console.log('[RoR2 Integration] 🎮 enabled:', enabled);
      
      const ror2Commands = juegos.ror2Commands || [];
      console.log('[RoR2 Integration] 🎮 ror2Commands:', ror2Commands.length, 'comandos');
      
      const ror2Enabled = enabled['ror2'];
      
      console.log('[RoR2 Integration] 🎮 Estado RoR2:', {
        enabled: ror2Enabled,
        comandos: ror2Commands.length
      });
      
      if (ror2Enabled) {
        console.log('[RoR2 Integration] ✅ Risk of Rain 2 está activo, comandos disponibles');
      } else {
        console.log('[RoR2 Integration] ⚠️ Risk of Rain 2 NO está activo en este perfil');
      }
    } else {
      console.warn('[RoR2 Integration] ⚠️ No se pudo cargar la configuración del perfil');
    }
  } catch (e) {
    console.error('[RoR2 Integration] ❌ Error cargando configuración:', e);
    console.error('[RoR2 Integration] ❌ Stack:', e.stack);
  }
}

function setupEventListeners() {
  if (!activeTik) {
    console.warn('[RoR2 Integration] No hay conexión de TikTok disponible');
    return;
  }
  
  console.log('[RoR2 Integration] 🎮 Configurando event listeners de TikTok...');
  
  // Escuchar eventos de TikTok
  activeTik.on('gift', handleGiftEvent);
  activeTik.on('gift-solo', handleGiftEvent); // ✅ También escuchar gift-solo
  activeTik.on('like', handleLikeEvent);
  activeTik.on('follow', handleFollowEvent);
  activeTik.on('share', handleShareEvent);
  activeTik.on('member', handleMemberEvent);
  activeTik.on('chat', handleCommentEvent);
  
  console.log('[RoR2 Integration] ✅ Event listeners configurados para: gift, gift-solo, like, follow, share, member, chat');
}

// Tracker para gestionar combos en tiempo real
const comboTracker = new Map();

async function handleGiftEvent(data) {
  console.log('[RoR2 Integration] 🎁 EVENT GIFT RECEIVED!', data);
  
  if (!shouldProcessEvents()) {
    console.log('[RoR2 Integration] ⚠️ shouldProcessEvents() = false, evento ignorado');
    return;
  }
  
  try {
    const giftId = String(data.giftId || data.id || '');
    const uniqueId = data.uniqueId || data.userId || 'unknown';
    
    // Leer repeatCount para combos
    const currentRepeatCount = Math.max(1, Number(data.repeatCount || data.repeat_count || 1));
    const comboKey = `${uniqueId}_${giftId}`;
    
    // Determinar cuántos comandos nuevos ejecutar
    let commandsToExecute = 1;
    
    if (comboTracker.has(comboKey)) {
      const lastData = comboTracker.get(comboKey);
      const lastRepeatCount = lastData.lastRepeatCount || 0;
      commandsToExecute = currentRepeatCount - lastRepeatCount;
      
      console.log(`[RoR2 Integration] 🔥 COMBO: ${uniqueId} | Regalo: ${giftId} | ${lastRepeatCount} → ${currentRepeatCount} | Ejecutar: ${commandsToExecute} comandos`);
    } else {
      console.log(`[RoR2 Integration] 🎁 Regalo inicial de ${uniqueId}: ${giftId} (Combo: ${currentRepeatCount})`);
    }
    
    // Actualizar tracker
    comboTracker.set(comboKey, {
      lastRepeatCount: currentRepeatCount,
      giftId: giftId,
      timestamp: Date.now()
    });
    
    // Limpiar tracker antiguo (más de 30 segundos)
    const now = Date.now();
    for (const [key, value] of comboTracker.entries()) {
      if (now - value.timestamp > 30000) {
        comboTracker.delete(key);
      }
    }
    
    // Buscar comandos que coincidan
    const commands = getActiveCommands();
    
    for (const cmd of commands) {
      if (cmd.enabled === false) continue;
      
      let shouldExecute = false;
      
      if (cmd.event === 'gift' && String(cmd.giftId) === giftId) {
        shouldExecute = true;
      } else if (cmd.event === 'gift_min' && (data.diamonds || data.diamondCount || 0) >= (cmd.minDiamonds || 1)) {
        shouldExecute = true;
      }
      
      if (shouldExecute) {
        // Ejecutar comando N veces (incremento del combo)
        for (let i = 0; i < commandsToExecute; i++) {
          console.log(`[RoR2 Integration] 🚀 Ejecutando comando ${i + 1}/${commandsToExecute}:`, cmd.effectId);
          await executeCommand(cmd, data);
          
          if (i < commandsToExecute - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      }
    }
  } catch (e) {
    console.error('[RoR2 Integration] Error procesando gift:', e);
  }
}

async function handleLikeEvent(data) {
  console.log('[RoR2 Integration] ❤️ EVENT LIKE RECEIVED!', data);
  
  if (!shouldProcessEvents()) return;
  
  try {
    const likeCount = data.likeCount || data.totalLikeCount || 1;
    eventCounters.likes += likeCount;
    
    console.log('[RoR2 Integration] ❤️ Likes recibidos:', likeCount, 'Total:', eventCounters.likes);
    
    const commands = getActiveCommands();
    
    for (const cmd of commands) {
      if (cmd.enabled === false) continue;
      
      if (cmd.event === 'like') {
        const every = cmd.likeEvery || 20;
        if (eventCounters.likes >= every) {
          eventCounters.likes = 0;
          await executeCommand(cmd, data);
        }
      }
    }
  } catch (e) {
    console.error('[RoR2 Integration] Error procesando like:', e);
  }
}

async function handleFollowEvent(data) {
  console.log('[RoR2 Integration] 👤 EVENT FOLLOW RECEIVED!', data);
  
  if (!shouldProcessEvents()) return;
  
  try {
    const commands = getActiveCommands();
    
    for (const cmd of commands) {
      if (cmd.enabled === false) continue;
      
      if (cmd.event === 'follow') {
        await executeCommand(cmd, data);
      }
    }
  } catch (e) {
    console.error('[RoR2 Integration] Error procesando follow:', e);
  }
}

async function handleShareEvent(data) {
  console.log('[RoR2 Integration] 📤 EVENT SHARE RECEIVED!', data);
  
  if (!shouldProcessEvents()) return;
  
  try {
    const commands = getActiveCommands();
    
    for (const cmd of commands) {
      if (cmd.enabled === false) continue;
      
      if (cmd.event === 'share') {
        await executeCommand(cmd, data);
      }
    }
  } catch (e) {
    console.error('[RoR2 Integration] Error procesando share:', e);
  }
}

async function handleMemberEvent(data) {
  if (!shouldProcessEvents()) return;
  
  try {
    const commands = getActiveCommands();
    
    for (const cmd of commands) {
      if (cmd.enabled === false) continue;
      
      if (cmd.event === 'member') {
        await executeCommand(cmd, data);
      }
    }
  } catch (e) {
    console.error('[RoR2 Integration] Error procesando member:', e);
  }
}

async function handleCommentEvent(data) {
  console.log('[RoR2 Integration] 💬 EVENT CHAT RECEIVED!', data);
  
  if (!shouldProcessEvents()) return;
  
  try {
    const comment = (data.comment || '').trim();
    const username = data.uniqueId || data.nickname || 'Usuario';
    
    if (!comment) return;
    
    console.log('[RoR2 Integration] 💬 Comentario recibido:', comment, 'de', username);
    
    const commands = getActiveCommands();
    
    for (const cmd of commands) {
      if (cmd.enabled === false) continue;
      
      if (cmd.event === 'comment' && cmd.commentText && comment === cmd.commentText.trim()) {
        console.log('[RoR2 Integration] ✅ Comentario coincide! Ejecutando comando:', cmd.effectId);
        await executeCommand(cmd, data);
      }
    }
  } catch (e) {
    console.error('[RoR2 Integration] Error procesando comment:', e);
  }
}

function shouldProcessEvents() {
  console.log('[RoR2 Integration] 🔍 shouldProcessEvents() llamado');
  console.log('[RoR2 Integration] 🔍 profileData existe:', !!profileData);
  
  if (!profileData) {
    console.log('[RoR2 Integration] ⚠️ No profileData');
    return false;
  }
  
  const juegos = profileData.juegos || {};
  const enabled = juegos.enabled || {};
  const shouldProcess = enabled['ror2'];
  
  console.log('[RoR2 Integration] 🔍 juegos:', !!juegos);
  console.log('[RoR2 Integration] 🔍 enabled:', enabled);
  console.log('[RoR2 Integration] 🔍 enabled[ror2]:', enabled['ror2']);
  console.log('[RoR2 Integration] shouldProcessEvents:', shouldProcess);
  
  return shouldProcess;
}

function getActiveCommands() {
  if (!profileData) return [];
  
  const juegos = profileData.juegos || {};
  const enabled = juegos.enabled || {};
  const ror2Commands = juegos.ror2Commands || [];
  
  // Solo retornar comandos si RoR2 está activo
  if (!enabled['ror2']) return [];
  
  // Filtrar comandos activos
  return ror2Commands.filter(cmd => cmd.enabled !== false);
}

async function executeCommand(cmd, eventData) {
  if (!cmd.effectId) {
    console.warn('[RoR2 Integration] Comando sin effectId:', cmd);
    return;
  }
  
  if (!ror2Module) {
    console.warn('[RoR2 Integration] Módulo de RoR2 no disponible');
    return;
  }
  
  try {
    const service = ror2Module.getService();
    
    if (!service) {
      console.warn('[RoR2 Integration] Servicio de RoR2 no inicializado');
      return;
    }
    
    const status = service.getStatus();
    if (!status.connected) {
      return;
    }
    
    // Extraer username del evento
    const username = eventData?.uniqueId || eventData?.nickname || eventData?.userId || 'TikControl';
    
    // Ejecutar efecto con repeticiones
    const repetitions = cmd.repetitions || 1;
    console.log('[RoR2 Integration] Ejecutando efecto:', cmd.effectId, 'para usuario:', username, `(${repetitions}x)`);
    
    const result = await service.executeEffect(cmd.effectId, {
      username: username,
      trigger: cmd.event,
      eventData: eventData,
      repetitions: repetitions
    });
    
    if (!result || !result.success) {
      console.warn('[RoR2 Integration] ❌ Error al ejecutar efecto:', result?.error || 'desconocido');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ror2:integration:error', {
          message: result?.error || 'Error ejecutando comando',
          command: cmd,
          event: eventData,
          details: result
        });
      }
      return;
    }
    
    console.log('[RoR2 Integration] ✅ Efecto ejecutado correctamente');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ror2:integration:executed', {
        effectId: cmd.effectId,
        command: cmd,
        event: eventData,
        details: result
      });
    }
  } catch (e) {
    console.error('[RoR2 Integration] Error ejecutando comando:', e);
  }
}

function updateProfile(profileId, data) {
  currentProfileId = profileId;
  profileData = data;
  eventCounters = { likes: 0 };
  comboTracker.clear();
  console.log('[RoR2 Integration] Perfil actualizado:', profileId);
}

function cleanup() {
  if (activeTik) {
    try {
      activeTik.removeListener('gift', handleGiftEvent);
      activeTik.removeListener('gift-solo', handleGiftEvent); // ✅ También remover gift-solo
      activeTik.removeListener('like', handleLikeEvent);
      activeTik.removeListener('follow', handleFollowEvent);
      activeTik.removeListener('share', handleShareEvent);
      activeTik.removeListener('member', handleMemberEvent);
      activeTik.removeListener('chat', handleCommentEvent);
    } catch (e) {
      console.error('[RoR2 Integration] Error limpiando listeners:', e);
    }
  }
  
  mainWindow = null;
  ror2Module = null;
  activeTik = null;
  currentProfileId = null;
  profileData = null;
  eventCounters = { likes: 0 };
  
  console.log('[RoR2 Integration] Limpieza completada');
}

module.exports = {
  init,
  updateProfile,
  cleanup
};

