// Módulo de integración: conecta eventos de TikTok con GTA V Chaos Mod
// Lee la configuración del perfil activo y ejecuta scripts según los eventos

const { ipcMain } = require('electron');

let mainWindow = null;
let gtavChaosModule = null;
let activeTik = null;
let currentProfileId = null;
let profileData = null;
let eventCounters = {
  likes: 0
};

const GTAV_DIRECT_HTTP_COMMANDS = new Set([
  'spawn_on_ramp',
  'spawn_ramp',
  'spawn_vehicle',
  'spawn_attackers',
  'spawn_attackers_and_shoot',
  'remove_spawned_vehicles',
  'replace_stock_vehicle',
  'repair_current_vehicle',
  'explode_vehicles',
  'give_weapon',
  'set_max_weapon_ammo',
  'set_time',
  'set_weather',
  'increase_wanted',
  'decrease_wanted',
  'max_wanted',
  'add_money',
  'set_money',
  'attackers_start_shooting',
  'remove_attackers',
  'leave_car',
  'skydive',
  'increase_health',
  'poodle',
  'pigeon',
  'random_animal',
  'give_rpg',
  'give_sniper_rifle',
  'give_random_weapon',
  'spawn_random_vehicle',
  'delete_player_vehicle',
  'spawn_random_vehicle_and_drive',
  'teleport_up',
  'kickflip',
  'monkey_killers',
  'earthquake',
  'drunk',
  'moto_cops',
  'moto_bandits',
  'disasamble_vehicle',
  'brake_wheels',
  'spawn_random_bike',
  'random_teleport',
  'kill',
  'invisible_vehicles',
  'speedy_cars',
  'tp',
  'random_clothing',
  'single_random_tuning',
  'full_random_tuning',
  'black_hole',
  'forward',
  'invincible',
  'nitro',
  'chiliad_disable_gps',
  'chiliad_change_timer',
  'track_accident',
  'subtract_health',
  'heal_player',
  'npc_to_pig',
  'heal_attackers',
  'spawn_attackers_rpg',
  'spawn_attackers_mg',
  'spawn_attackers_melee',
  'spawn_alien',
  'spawn_car',
  'spawn_boat',
  'spawn_plane',
  'player_nightvision',
  'meteor_shower',
  'orange_ball',
  'low_gravity',
  'give_weapons',
  'remove_weapons',
  'immortality',
  'angry_animal',
  'super_jump',
  'fan_rabbits',
  'speed_up',
  'tpforward_checkpoint',
  'tpback_checkpoint',
  'hiking_companion',
  'funny_angry_npc',
  'spawn_arena_fighter',
  'arena_spleef',
  'arena_explode_tile',
  'arena_tremors',
  'arena_moving_cover',
  'parkour_checkpoint',
  'parkour_addlife',
  'parkour_addtime',
  'parkour_superjump',
  'parkour_drunk',
  'start_vehicles_rain',
  'clean_ramp',
  'ramp_jump',
  'ramp_tp_start',
  'ramp_tp_finish',
  'ramp_spawn_companion',
  'ramp_companion',
  'ramp_spawn_custom_prop',
  'ramp_meteor',
  'ramp_log'
]);

// Comandos específicos del modo Train (Who Can Stop My Train)
const TRAIN_COMMANDS = [
  'spawn_dump',
  'spawn_bus',
  'spawn_truck',
  'spawn_plane',
  'turbo_jett',
  'train_speed_boost',
  'train_damage'
];

function normalizeGTAVCommandId(scriptId) {
  let normalized = String(scriptId || '').split('?')[0].trim();
  for (const prefix of ['chaos:', 'forward:', 'lua-script:']) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  return normalized.split(':')[0];
}

function isChaosCommand(scriptId) {
  if (!scriptId) return false;
  const normalized = normalizeGTAVCommandId(scriptId);
  return scriptId.startsWith('forward:') || scriptId.startsWith('lua-script:') || normalized.startsWith('chaos-');
}

function isKothCommand(scriptId) {
  if (!scriptId) return false;
  const normalized = normalizeGTAVCommandId(scriptId);

  // Si es un hash de vehículo (0x...), es KOTH
  if (normalized.startsWith('0x') || normalized.startsWith('0X')) {
    return true;
  }

  // Si está en la lista de comandos KOTH
  return !isChaosCommand(scriptId) && GTAV_DIRECT_HTTP_COMMANDS.has(normalized);
}

// Detectar si es un comando del modo Train
function isTrainCommand(scriptId) {
  if (!scriptId) return false;
  return TRAIN_COMMANDS.includes(scriptId) || scriptId.startsWith('train_');
}

async function init(mainWin, chaos, tik) {
  mainWindow = mainWin;
  gtavChaosModule = chaos;
  activeTik = tik;

  console.log('[GTA V Integration] 🚀 Inicializando integración con TikTok');
  console.log('[GTA V Integration] 🪟 mainWindow:', !!mainWindow);
  console.log('[GTA V Integration] 🎮 gtavChaosModule:', !!gtavChaosModule);
  console.log('[GTA V Integration] 📡 activeTik:', !!activeTik);

  // Suscribirse a eventos de cambio de perfil
  ipcMain.on('gtav:integration:setProfile', async (event, profileId) => {
    console.log('[GTA V Integration] 🔄 Cambio de perfil detectado:', profileId);
    currentProfileId = profileId;
    await loadProfileConfiguration();
  });

  // Iniciar integración
  setupEventListeners();

  // ✅ CARGAR PERFIL ACTIVO AL INICIO
  try {
    const { listProfiles } = require('../../../modules/profiles');
    const profiles = listProfiles();

    if (profiles && profiles.length > 0) {
      // Usar el perfil más reciente (mismo criterio que main.js)
      let activeProfile = profiles[0];
      for (const p of profiles) {
        const a = new Date(p.updatedAt || 0).getTime();
        const b = new Date(activeProfile.updatedAt || 0).getTime();
        if (a > b) activeProfile = p;
      }

      if (activeProfile && activeProfile.id) {
        console.log('[GTA V Integration] 🔄 Cargando perfil activo al inicio:', activeProfile.id);
        currentProfileId = activeProfile.id;
        await loadProfileConfiguration();
      }
    } else {
      console.warn('[GTA V Integration] ⚠️ No hay perfiles disponibles');
    }
  } catch (e) {
    console.error('[GTA V Integration] ❌ Error cargando perfil inicial:', e);
  }

  console.log('[GTA V Integration] ✅ Integración inicializada correctamente');
}

async function loadProfileConfiguration() {
  if (!currentProfileId) {
    console.log('[GTA V Integration] ⚠️ No hay perfil activo');
    return;
  }

  try {
    // Cargar configuración del perfil desde el main process
    const { getProfileData } = require('../../../modules/profiles');
    const data = getProfileData(currentProfileId); // ✅ Retorna directamente el objeto

    if (data) {
      profileData = data;
      console.log('[GTA V Integration] 📂 Configuración cargada para perfil:', currentProfileId);

      // Verificar si hay juegos de GTA V activos
      const juegos = profileData.juegos || {};
      const enabled = juegos.enabled || {};
      const gtavCommands = juegos.gtavCommands || {};
      const gtavEnabled = enabled['gtav-koth'] || enabled['gtav-kaos'] || enabled['gtav-train'];

      console.log('[GTA V Integration] 🎮 Estado GTAV:', {
        kothEnabled: enabled['gtav-koth'],
        kaosEnabled: enabled['gtav-kaos'],
        trainEnabled: enabled['gtav-train'],
        comandosKoth: gtavCommands.koth?.length || 0,
        comandosKaos: gtavCommands.kaos?.length || 0,
        comandosTrain: gtavCommands.train?.length || 0
      });

      if (gtavEnabled) {
        console.log('[GTA V Integration] ✅ GTA V está activo, comandos disponibles');
      } else {
        console.log('[GTA V Integration] ⚠️ GTA V NO está activo en este perfil');
      }
    } else {
      console.warn('[GTA V Integration] ⚠️ No se pudo cargar la configuración del perfil');
    }
  } catch (e) {
    console.error('[GTA V Integration] ❌ Error cargando configuración:', e);
  }
}

function setupEventListeners() {
  if (!activeTik) {
    console.warn('[GTA V Integration] No hay conexión de TikTok disponible');
    return;
  }

  console.log('[GTA V Integration] 🎮 Configurando event listeners de TikTok...');
  console.log('[GTA V Integration] 📡 activeTik:', typeof activeTik, activeTik.constructor?.name);

  // Escuchar eventos de TikTok
  activeTik.on('gift', handleGiftEvent);
  activeTik.on('like', handleLikeEvent);
  activeTik.on('follow', handleFollowEvent);
  activeTik.on('share', handleShareEvent);
  activeTik.on('member', handleMemberEvent);
  activeTik.on('chat', handleCommentEvent);

  console.log('[GTA V Integration] ✅ Event listeners configurados para: gift, like, follow, share, member, chat');
}

// Tracker para gestionar combos en tiempo real
const comboTracker = new Map(); // { uniqueKey: { lastRepeatCount, giftId, timestamp } }

async function handleGiftEvent(data) {
  console.log('[GTA V Integration] 🎁 EVENT GIFT RECEIVED!', data);

  if (!shouldProcessEvents()) {
    console.log('[GTA V Integration] ⚠️ shouldProcessEvents() = false, evento ignorado');
    return;
  }

  try {
    const giftId = String(data.giftId || data.id || '');
    const diamonds = data.diamonds || data.diamondCount || 0;
    const uniqueId = data.uniqueId || data.userId || 'unknown';

    // 🔥 LEER REPEATCOUNT PARA COMBOS
    const currentRepeatCount = Math.max(1, Number(data.repeatCount || data.repeat_count || 1));

    // 🔥 CREAR CLAVE ÚNICA PARA ESTE COMBO (usuario + regalo)
    const comboKey = `${uniqueId}_${giftId}`;

    // 🔥 DETERMINAR CUÁNTOS COMANDOS NUEVOS EJECUTAR
    let commandsToExecute = 1; // Por defecto, 1 comando (regalo individual)

    if (comboTracker.has(comboKey)) {
      // Este es un combo en progreso
      const lastData = comboTracker.get(comboKey);
      const lastRepeatCount = lastData.lastRepeatCount || 0;

      // Calcular cuántos regalos nuevos llegaron desde el último evento
      commandsToExecute = currentRepeatCount - lastRepeatCount;

      console.log(`[GTA V Integration] 🔥 COMBO EN PROGRESO: ${uniqueId} | Regalo: ${giftId} | Anterior: ${lastRepeatCount} → Actual: ${currentRepeatCount} | Ejecutar: ${commandsToExecute} comandos`);
    } else {
      console.log(`[GTA V Integration] 🎁 Regalo inicial de ${uniqueId}: ${giftId} (Combo: ${currentRepeatCount})`);
    }

    // 🔥 ACTUALIZAR TRACKER
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

    // Buscar comandos que coincidan con este evento
    const commands = getActiveCommands();

    for (const cmd of commands) {
      // ✅ Verificar que el comando esté habilitado
      if (cmd.enabled === false) {
        console.log('[GTA V Integration] ⚠️ Comando desactivado, ignorando:', cmd.scriptId);
        continue;
      }

      // ✅ Verificar que el comando pertenezca al juego activo
      if (!isCommandFromActiveGame(cmd)) {
        console.log('[GTA V Integration] ⚠️ Comando no pertenece al juego activo, ignorando:', cmd.scriptId);
        continue;
      }

      let shouldExecute = false;

      if (cmd.event === 'gift' && String(cmd.giftId) === giftId) {
        // Regalo específico
        shouldExecute = true;
      } else if (cmd.event === 'gift_min' && diamonds >= (cmd.minDiamonds || 1)) {
        // Regalo mínimo por diamantes
        shouldExecute = true;
      }

      if (shouldExecute) {
        // 🔥 EJECUTAR SOLO LOS COMANDOS NUEVOS (INCREMENTALES)
        for (let i = 0; i < commandsToExecute; i++) {
          console.log(`[GTA V Integration] 🚀 Ejecutando comando ${i + 1}/${commandsToExecute} del incremento:`, cmd.scriptId);
          await executeCommand(cmd, data);

          // Pequeño delay entre comandos para evitar saturación
          if (i < commandsToExecute - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      }
    }
  } catch (e) {
    console.error('[GTA V Integration] Error procesando gift:', e);
  }
}

async function handleLikeEvent(data) {
  console.log('[GTA V Integration] ❤️ EVENT LIKE RECEIVED!', data);

  if (!shouldProcessEvents()) {
    console.log('[GTA V Integration] ⚠️ shouldProcessEvents() = false, evento ignorado');
    return;
  }

  try {
    const likeCount = data.likeCount || data.totalLikeCount || 1;
    eventCounters.likes += likeCount;

    console.log('[GTA V Integration] ❤️ Likes recibidos:', likeCount, 'Total:', eventCounters.likes);

    const commands = getActiveCommands();

    for (const cmd of commands) {
      // ✅ Verificar que el comando esté habilitado
      if (cmd.enabled === false) {
        continue;
      }

      // ✅ Verificar que el comando pertenezca al juego activo
      if (!isCommandFromActiveGame(cmd)) {
        continue;
      }

      if (cmd.event === 'like') {
        const every = cmd.likeEvery || 20;
        if (eventCounters.likes >= every) {
          eventCounters.likes = 0; // Reset contador
          await executeCommand(cmd, data);
        }
      }
    }
  } catch (e) {
    console.error('[GTA V Integration] Error procesando like:', e);
  }
}

async function handleFollowEvent(data) {
  console.log('[GTA V Integration] 👤 EVENT FOLLOW RECEIVED!', data);

  if (!shouldProcessEvents()) {
    console.log('[GTA V Integration] ⚠️ shouldProcessEvents() = false, evento ignorado');
    return;
  }

  try {
    console.log('[GTA V Integration] 👤 Follow recibido');

    const commands = getActiveCommands();

    for (const cmd of commands) {
      // ✅ Verificar que el comando esté habilitado
      if (cmd.enabled === false) continue;

      // ✅ Verificar que el comando pertenezca al juego activo
      if (!isCommandFromActiveGame(cmd)) continue;

      if (cmd.event === 'follow') {
        await executeCommand(cmd, data);
      }
    }
  } catch (e) {
    console.error('[GTA V Integration] Error procesando follow:', e);
  }
}

async function handleShareEvent(data) {
  console.log('[GTA V Integration] 📤 EVENT SHARE RECEIVED!', data);

  if (!shouldProcessEvents()) {
    console.log('[GTA V Integration] ⚠️ shouldProcessEvents() = false, evento ignorado');
    return;
  }

  try {
    console.log('[GTA V Integration] 📤 Share recibido');

    const commands = getActiveCommands();

    for (const cmd of commands) {
      // ✅ Verificar que el comando esté habilitado
      if (cmd.enabled === false) continue;

      // ✅ Verificar que el comando pertenezca al juego activo
      if (!isCommandFromActiveGame(cmd)) continue;

      if (cmd.event === 'share') {
        await executeCommand(cmd, data);
      }
    }
  } catch (e) {
    console.error('[GTA V Integration] Error procesando share:', e);
  }
}

async function handleMemberEvent(data) {
  if (!shouldProcessEvents()) return;

  try {
    console.log('[GTA V Integration] Nuevo miembro');

    const commands = getActiveCommands();

    for (const cmd of commands) {
      // ✅ Verificar que el comando esté habilitado
      if (cmd.enabled === false) continue;

      // ✅ Verificar que el comando pertenezca al juego activo
      if (!isCommandFromActiveGame(cmd)) continue;

      if (cmd.event === 'member') {
        await executeCommand(cmd, data);
      }
    }
  } catch (e) {
    console.error('[GTA V Integration] Error procesando member:', e);
  }
}

async function handleCommentEvent(data) {
  console.log('[GTA V Integration] 💬 EVENT CHAT RECEIVED!', data);

  if (!shouldProcessEvents()) {
    console.log('[GTA V Integration] ⚠️ shouldProcessEvents() = false, evento ignorado');
    return;
  }

  try {
    const comment = (data.comment || '').trim();
    const username = data.uniqueId || data.nickname || 'Usuario';

    if (!comment) {
      console.log('[GTA V Integration] ⚠️ Comentario vacío, ignorando');
      return;
    }

    console.log('[GTA V Integration] 💬 Comentario recibido:', comment, 'de', username);

    const commands = getActiveCommands();

    for (const cmd of commands) {
      // ✅ Verificar que el comando esté habilitado
      if (cmd.enabled === false) continue;

      // ✅ Verificar que el comando pertenezca al juego activo
      if (!isCommandFromActiveGame(cmd)) continue;

      // Comparación exacta del texto del comentario
      if (cmd.event === 'comment' && cmd.commentText && comment === cmd.commentText.trim()) {
        console.log('[GTA V Integration] ✅ Comentario coincide! Ejecutando comando:', cmd.scriptId);
        await executeCommand(cmd, data);
      }
    }
  } catch (e) {
    console.error('[GTA V Integration] Error procesando comment:', e);
  }
}

function shouldProcessEvents() {
  if (!profileData) {
    console.log('[GTA V Integration] ⚠️ No profileData');
    return false;
  }

  const juegos = profileData.juegos || {};
  const enabled = juegos.enabled || {};
  const shouldProcess = enabled['gtav-koth'] || enabled['gtav-kaos'] || enabled['gtav-train'];

  console.log('[GTA V Integration] shouldProcessEvents:', shouldProcess, {
    kothEnabled: enabled['gtav-koth'],
    kaosEnabled: enabled['gtav-kaos'],
    trainEnabled: enabled['gtav-train']
  });

  return shouldProcess;
}

function getActiveCommands() {
  if (!profileData) return [];

  const juegos = profileData.juegos || {};
  const enabled = juegos.enabled || {};
  const gtavCommands = juegos.gtavCommands || {};

  let commands = [];

  // Agregar comandos de KOTH si está activo
  if (enabled['gtav-koth'] && Array.isArray(gtavCommands.koth)) {
    commands = commands.concat(gtavCommands.koth.map(cmd => ({ ...cmd, _game: 'koth' })));
  }

  // Agregar comandos de KAOS si está activo
  if (enabled['gtav-kaos'] && Array.isArray(gtavCommands.kaos)) {
    commands = commands.concat(gtavCommands.kaos.map(cmd => ({ ...cmd, _game: 'kaos' })));
  }

  // Agregar comandos de TRAIN si está activo
  if (enabled['gtav-train'] && Array.isArray(gtavCommands.train)) {
    commands = commands.concat(gtavCommands.train.map(cmd => ({ ...cmd, _game: 'train' })));
  }

  // ✅ Filtrar solo comandos activos (enabled !== false)
  return commands.filter(cmd => cmd.enabled !== false);
}

function isCommandFromActiveGame(cmd) {
  if (!profileData || !cmd._game) return true; // Si no hay info, permitir

  const juegos = profileData.juegos || {};
  const enabled = juegos.enabled || {};

  // Verificar que el juego del comando esté activo
  if (cmd._game === 'koth') {
    return enabled['gtav-koth'] === true;
  } else if (cmd._game === 'kaos') {
    return enabled['gtav-kaos'] === true;
  } else if (cmd._game === 'train') {
    return enabled['gtav-train'] === true;
  }

  return false;
}

async function executeCommand(cmd, eventData) {
  if (!cmd.scriptId) {
    console.warn('[GTA V Integration] Comando sin scriptId:', cmd);
    return;
  }

  if (!gtavChaosModule) {
    console.warn('[GTA V Integration] Módulo de GTA V no disponible');
    return;
  }

  try {
    const service = gtavChaosModule.getService();

    if (!service) {
      console.warn('[GTA V Integration] Servicio de GTA V no inicializado');
      return;
    }

    const status = typeof service.getStatus === 'function' ? service.getStatus() : {};
    const cmdIsKoth = isKothCommand(cmd.scriptId);
    const cmdIsChaos = isChaosCommand(cmd.scriptId);
    const cmdIsTrain = isTrainCommand(cmd.scriptId);
    const channelReady = cmdIsKoth
      ? status.httpKoth
      : (cmdIsTrain ? status.httpTrain : (cmdIsChaos ? status.httpChaos : false));

    if (!status.connected && !channelReady) {
      console.warn('[GTA V Integration] Conexión GTA V no confirmada, intentando de todos modos');
    }

    // Extraer nickname del usuario (si existe)
    const username = eventData?.uniqueId || eventData?.nickname || eventData?.userId || 'TikControlTest';

    // Construir el comando con cantidad y username
    let commandWithUsername = cmd.scriptId;
    const quantity = cmd.quantity || 1;

    // IMPORTANTE: La cantidad solo se agrega para comandos KOTH o Train
    // Chaos Mod NO usa cantidad en el comando (solo usa repetitions)
    const isKothCmd = isKothCommand(cmd.scriptId);
    const isTrainCmd = isTrainCommand(cmd.scriptId);
    const isChaosCmd = !isKothCmd && !isTrainCmd; // Si no es KOTH ni Train, es Chaos

    // Casos especiales para vehículos y props (KOTH)
    if (cmd.scriptId === 'spawn_on_ramp' && cmd.propId) {
      // Vehículo: usar el hash directamente con cantidad
      commandWithUsername = quantity > 1 ? `${cmd.propId}:${quantity}` : cmd.propId;
    } else if (cmd.scriptId === 'ramp_spawn_custom_prop' && cmd.propId) {
      // Prop: formato comando:hash:cantidad
      commandWithUsername = quantity > 1
        ? `${cmd.scriptId}:${cmd.propId}:${quantity}`
        : `${cmd.scriptId}:${cmd.propId}`;
    }
    // Agregar cantidad SOLO para otros comandos KOTH o Train
    else if ((isKothCmd || isTrainCmd) && quantity > 1) {
      // Si ya tiene parámetros (?...), insertar :N antes del ?
      if (commandWithUsername.includes('?')) {
        const [baseCmd, params] = commandWithUsername.split('?');
        commandWithUsername = `${baseCmd}:${quantity}?${params}`;
      } else {
        // Si no tiene parámetros, agregar :N directamente
        commandWithUsername = `${commandWithUsername}:${quantity}`;
      }
    }
    // Para Chaos, NO agregar :cantidad (el comando queda limpio)

    // Agregar username
    if (!commandWithUsername.includes('?')) {
      commandWithUsername += `?username=${username}`;
    } else if (!commandWithUsername.includes('username=')) {
      // Ya tiene parámetros pero no username
      commandWithUsername += `&username=${username}`;
    }
    // Si ya tiene username=, no modificar

    // ✅ Para comandos Train, añadir parámetros de efectos (percent, duration, speed, amount)
    const effectOpts = cmd.effectOptions || cmd.options?.gameEffectOptions || {};
    if (isTrainCmd && Object.keys(effectOpts).length > 0) {
      if (effectOpts.percent && !commandWithUsername.includes('percent=')) {
        commandWithUsername += `&percent=${effectOpts.percent}`;
      }
      if (effectOpts.duration && !commandWithUsername.includes('duration=')) {
        commandWithUsername += `&duration=${effectOpts.duration}`;
      }
      if (effectOpts.speed && !commandWithUsername.includes('speed=')) {
        commandWithUsername += `&speed=${effectOpts.speed}`;
      }
      if (effectOpts.amount && !commandWithUsername.includes('amount=')) {
        commandWithUsername += `&amount=${effectOpts.amount}`;
      }
    }

    // Ejecutar el script (con repeticiones si está configurado)
    const repetitions = cmd.repetitions || 1;
    console.log('[GTA V Integration] Ejecutando script:', commandWithUsername, 'para usuario:', username, `(${repetitions}x)`);
    const result = await service.executeScript(commandWithUsername, {
      trigger: cmd.event,
      eventData: eventData,
      repetitions: repetitions // Pasar repeticiones al servicio
    });

    if (!result || !result.success) {
      console.warn('[GTA V Integration] ❌ Error al ejecutar script:', result?.error || 'desconocido');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gtav:integration:error', {
          message: result?.error || 'Error ejecutando comando',
          command: cmd,
          event: eventData,
          details: result
        });
      }
      return;
    }

    console.log('[GTA V Integration] ✅ Script ejecutado correctamente');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gtav:integration:executed', {
        scriptId: cmd.scriptId,
        command: cmd,
        event: eventData,
        details: result
      });
    }
  } catch (e) {
    console.error('[GTA V Integration] Error ejecutando comando:', e);
  }
}

function updateProfile(profileId, data) {
  currentProfileId = profileId;
  profileData = data;
  eventCounters = { likes: 0 }; // Reset contadores al cambiar perfil
  comboTracker.clear(); // Limpiar tracker de combos al cambiar perfil
  console.log('[GTA V Integration] Perfil actualizado:', profileId);
}

function cleanup() {
  if (activeTik) {
    try {
      activeTik.removeListener('gift', handleGiftEvent);
      activeTik.removeListener('like', handleLikeEvent);
      activeTik.removeListener('follow', handleFollowEvent);
      activeTik.removeListener('share', handleShareEvent);
      activeTik.removeListener('member', handleMemberEvent);
    } catch (e) {
      console.error('[GTA V Integration] Error limpiando listeners:', e);
    }
  }

  mainWindow = null;
  gtavChaosModule = null;
  activeTik = null;
  currentProfileId = null;
  profileData = null;
  eventCounters = { likes: 0 };

  console.log('[GTA V Integration] Limpieza completada');
}

module.exports = {
  init,
  updateProfile,
  cleanup
};

