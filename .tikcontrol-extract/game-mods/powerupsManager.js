/**
 * PowerUps Manager
 * Gestiona los potenciadores manuales de batalla para MVPs
 * 
 * Funcionalidades:
 * - Añadir potenciadores a usuarios (duración 5 días cada uno)
 * - Acumular potenciadores del mismo tipo
 * - Detectar si un usuario con potenciador participó en una batalla
 * - Marcar potenciadores como usados
 */

const fs = require('fs');
const path = require('path');
const dataPath = require('../modules/dataPath');

const DURATION_DAYS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Tipos por defecto - siempre disponibles aunque no exista el archivo
const DEFAULT_TYPES = {
  glove: {
    id: 'glove',
    name: 'Guante Potenciador',
    nameEn: 'Boosting Glove',
    emoji: '\u{1F94A}',
    description: '30% de x5 puntos por 30s',
    durationDays: 5,
    image: 'powerups/glove.png',
    hasImage: true
  },
  fog: {
    id: 'fog',
    name: 'Niebla M\u00e1gica',
    nameEn: 'Magic Mist',
    emoji: '\u{1F32B}\u{FE0F}',
    description: 'Oculta puntos del rival por 30s',
    durationDays: 5,
    image: 'powerups/fog.png',
    hasImage: true
  },
  chrono: {
    id: 'chrono',
    name: 'Cron\u00f3metro',
    nameEn: 'Time-Maker',
    emoji: '\u{23F1}\u{FE0F}',
    description: '+10 segundos (m\u00e1x 3 por batalla)',
    durationDays: 5,
    image: 'powerups/chrono.png',
    hasImage: true
  },
  hammer: {
    id: 'hammer',
    name: 'Martillo Aturdidor',
    nameEn: 'Stun Hammer',
    emoji: '\u{1F528}',
    description: 'Efectos visuales al rival por 30s',
    durationDays: 5,
    image: null,
    hasImage: false
  }
};

let data = null;
let resolvedDataPath = null;

/**
 * Obtener la ruta del archivo de datos (usando dataPath.js)
 */
function getDataFilePath() {
  if (resolvedDataPath) return resolvedDataPath;
  try {
    const dataDir = dataPath.getDataDir();
    resolvedDataPath = path.join(dataDir, 'powerups.json');
    // console.log('[PowerUps] Data path:', resolvedDataPath);
  } catch (e) {
    // Fallback si dataPath no esta inicializado (e.g. app aun no esta ready)
    resolvedDataPath = path.join(process.cwd(), 'data', 'powerups.json');
    console.warn('[PowerUps] Usando fallback path:', resolvedDataPath);
  }
  return resolvedDataPath;
}

/**
 * Cargar datos desde el archivo JSON
 */
function loadData() {
  const filePath = getDataFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      data = JSON.parse(content);
      // Asegurar que los tipos siempre esten presentes
      if (!data.types || Object.keys(data.types).length === 0) {
        data.types = { ...DEFAULT_TYPES };
        saveData();
      }
    } else {
      data = {
        _info: { description: 'Potenciadores manuales', version: '1.1.0', lastUpdated: null },
        types: { ...DEFAULT_TYPES },
        users: {}
      };
      saveData();
    }
  } catch (e) {
    console.error('[PowerUps] Error cargando datos:', e.message);
    data = { _info: {}, types: { ...DEFAULT_TYPES }, users: {} };
  }
  return data;
}

/**
 * Guardar datos al archivo JSON
 */
function saveData() {
  const filePath = getDataFilePath();
  try {
    if (data) {
      data._info.lastUpdated = new Date().toISOString();
      // Asegurar que el directorio exista
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('[PowerUps] Error guardando datos:', e.message);
  }
}

/**
 * Obtener todos los tipos de potenciadores
 */
function getPowerUpTypes() {
  if (!data) loadData();
  return data.types || {};
}

/**
 * Añadir un potenciador a un usuario
 * @param {string} uniqueId - ID único del usuario (TikTok uniqueId)
 * @param {string} nickname - Nickname del usuario
 * @param {string} powerUpType - Tipo de potenciador (glove, fog, chrono, hammer, shield)
 * @param {string} avatar - URL del avatar (opcional)
 */
function addPowerUp(uniqueId, nickname, powerUpType, avatar = null) {
  if (!data) loadData();
  
  const typeInfo = data.types[powerUpType];
  if (!typeInfo) {
    console.error('[PowerUps] Tipo de potenciador no válido:', powerUpType);
    return null;
  }
  
  // Normalizar uniqueId
  const oderId = uniqueId.toLowerCase().replace('@', '');
  
  // Crear entrada de usuario si no existe
  if (!data.users[oderId]) {
    data.users[oderId] = {
      oderId,
      nickname,
      avatar,
      powerUps: []
    };
  } else {
    // Actualizar nickname y avatar si vienen
    if (nickname) data.users[oderId].nickname = nickname;
    if (avatar) data.users[oderId].avatar = avatar;
  }
  
  const now = Date.now();
  const expiresAt = now + (DURATION_DAYS * MS_PER_DAY);
  
  // Crear el nuevo potenciador
  const newPowerUp = {
    id: `${powerUpType}_${now}_${Math.random().toString(36).substr(2, 9)}`,
    type: powerUpType,
    name: typeInfo.name,
    emoji: typeInfo.emoji,
    image: typeInfo.image,
    hasImage: typeInfo.hasImage,
    addedAt: now,
    expiresAt,
    used: false,
    usedAt: null,
    usedInBattle: null
  };
  
  data.users[oderId].powerUps.push(newPowerUp);
  saveData();
  
  // console.log(`[PowerUps] ✅ Añadido ${typeInfo.emoji} ${typeInfo.name} a @${nickname} (expira: ${new Date(expiresAt).toLocaleDateString()})`);
  
  return newPowerUp;
}

/**
 * Obtener potenciadores activos de un usuario
 * @param {string} oderId - ID único del usuario
 * @param {boolean} includeExpired - Incluir potenciadores expirados
 */
function getUserPowerUps(oderId, includeExpired = false) {
  if (!data) loadData();
  
  const normalizedId = oderId.toLowerCase().replace('@', '');
  const user = data.users[normalizedId];
  
  if (!user) return [];
  
  const now = Date.now();
  
  if (includeExpired) {
    return user.powerUps;
  }
  
  // Filtrar solo los activos (no usados y no expirados)
  return user.powerUps.filter(p => !p.used && p.expiresAt > now);
}

/**
 * Obtener todos los usuarios con potenciadores activos
 */
function getAllUsersWithPowerUps() {
  if (!data) loadData();
  
  const now = Date.now();
  const result = [];
  
  for (const [oderId, userData] of Object.entries(data.users)) {
    const activePowerUps = userData.powerUps.filter(p => !p.used && p.expiresAt > now);
    
    if (activePowerUps.length > 0) {
      result.push({
        oderId,
        nickname: userData.nickname,
        avatar: userData.avatar,
        powerUps: activePowerUps,
        totalActive: activePowerUps.length
      });
    }
  }
  
  return result;
}

/**
 * Marcar potenciador como usado
 * @param {string} oderId - ID único del usuario
 * @param {string} powerUpId - ID del potenciador específico
 * @param {object} battleInfo - Info de la batalla donde se usó
 */
function markPowerUpAsUsed(oderId, powerUpId, battleInfo = null) {
  if (!data) loadData();
  
  const normalizedId = oderId.toLowerCase().replace('@', '');
  const user = data.users[normalizedId];
  
  if (!user) return false;
  
  const powerUp = user.powerUps.find(p => p.id === powerUpId);
  if (!powerUp) return false;
  
  powerUp.used = true;
  powerUp.usedAt = Date.now();
  powerUp.usedInBattle = battleInfo;
  
  saveData();
  
  // console.log(`[PowerUps] ✅ Marcado como usado: ${powerUp.emoji} ${powerUp.name} de @${user.nickname}`);
  
  return true;
}

/**
 * Eliminar potenciador específico o todos los del usuario
 * @param {string} oderId - ID del usuario
 * @param {string|null} powerUpId - ID del potenciador, o null para eliminar todos
 */
function removePowerUp(oderId, powerUpId) {
  if (!data) loadData();
  
  const normalizedId = oderId.toLowerCase().replace('@', '');
  const user = data.users[normalizedId];
  
  if (!user) return false;
  
  // Si powerUpId es null, eliminar todos los potenciadores del usuario
  if (powerUpId === null || powerUpId === undefined) {
    const count = user.powerUps.length;
    user.powerUps = [];
    saveData();
    // console.log(`[PowerUps] 🗑️ Eliminados ${count} potenciadores de @${user.nickname}`);
    return true;
  }
  
  // Eliminar potenciador específico
  const index = user.powerUps.findIndex(p => p.id === powerUpId);
  if (index === -1) return false;
  
  const removed = user.powerUps.splice(index, 1)[0];
  saveData();
  
  // console.log(`[PowerUps] 🗑️ Eliminado: ${removed.emoji} ${removed.name} de @${user.nickname}`);
  
  return true;
}

/**
 * Normalizar nickname para comparación (quitar emojis y caracteres especiales)
 */
function normalizeNickname(str) {
  if (!str) return '';
  // Quitar emojis, banderas, símbolos especiales y normalizar
  return str
    .toLowerCase()
    .replace(/@/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '') // Emojis
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Símbolos misc
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Más emojis
    .replace(/[🇦-🇿]/gu, '')                // Banderas
    .replace(/[⚜️✯💎🔥🩷🧀]/gu, '')          // Símbolos comunes
    .replace(/[^\w\s.-]/g, '')               // Solo alfanuméricos
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verificar qué usuarios con potenciadores participaron en una batalla
 * @param {Array} participants - Lista de participantes (con oderId/uniqueId/nickname)
 * @returns {Array} - Usuarios que participaron y tienen potenciadores activos
 */
function checkParticipantsWithPowerUps(participants) {
  if (!data) loadData();
  
  const now = Date.now();
  const result = [];
  const alreadyMatched = new Set(); // Evitar duplicados
  
  // console.log(`[PowerUps] 🔍 Verificando ${participants.length} participantes...`);
  // console.log(`[PowerUps] 🔍 Usuarios con potenciadores guardados: ${Object.keys(data.users).length}`);
  
  // Debug: mostrar usuarios guardados
  Object.entries(data.users).forEach(([key, u]) => {
    const activeCount = u.powerUps.filter(p => !p.used && p.expiresAt > now).length;
    if (activeCount > 0) {
      // console.log(`[PowerUps]   📦 Guardado: ${key} -> @${u.nickname} (${activeCount} activos)`);
    }
  });
  
  for (const participant of participants) {
    // Normalizar todos los posibles identificadores
    const oderId = (participant.oderId || participant.uniqueId || participant.userId || '').toString().toLowerCase().replace('@', '');
    const nickname = (participant.nickname || '').toString().toLowerCase().replace('@', '');
    const normalizedNick = normalizeNickname(participant.nickname);
    
    // console.log(`[PowerUps] 🔍 Buscando: oderId=${oderId}, nickname=${nickname}, normalized=${normalizedNick}`);
    
    if (!oderId && !nickname) continue;
    
    // Buscar por oderId O por nickname
    let user = null;
    let matchedKey = null;
    
    // MÉTODO 1: Buscar por oderId exacto
    if (oderId && data.users[oderId]) {
      user = data.users[oderId];
      matchedKey = oderId;
      // console.log(`[PowerUps]   ✓ Match por oderId exacto: ${oderId}`);
    }
    
    // MÉTODO 2: Buscar por nickname exacto
    if (!user && nickname) {
      for (const [key, userData] of Object.entries(data.users)) {
        const savedNickname = (userData.nickname || '').toLowerCase().replace('@', '');
        if (savedNickname === nickname || key === nickname) {
          user = userData;
          matchedKey = key;
          // console.log(`[PowerUps]   ✓ Match por nickname exacto: ${nickname}`);
          break;
        }
      }
    }
    
    // MÉTODO 3: Buscar por nickname normalizado (sin emojis)
    if (!user && normalizedNick) {
      for (const [key, userData] of Object.entries(data.users)) {
        const savedNormalizedNick = normalizeNickname(userData.nickname);
        if (savedNormalizedNick && (
          savedNormalizedNick === normalizedNick ||
          savedNormalizedNick.includes(normalizedNick) ||
          normalizedNick.includes(savedNormalizedNick)
        )) {
          user = userData;
          matchedKey = key;
          // console.log(`[PowerUps]   ✓ Match por nickname normalizado: "${normalizedNick}" ~ "${savedNormalizedNick}"`);
          break;
        }
      }
    }
    
    if (!user || alreadyMatched.has(matchedKey)) {
      if (!user) console.log(`[PowerUps]   ✗ No encontrado: @${nickname}`);
      continue;
    }
    
    const activePowerUps = user.powerUps.filter(p => !p.used && p.expiresAt > now);
    
    if (activePowerUps.length > 0) {
      alreadyMatched.add(matchedKey);
      // console.log(`[PowerUps] ✅ ENCONTRADO @${user.nickname} con ${activePowerUps.length} potenciadores activos`);
      result.push({
        oderId: matchedKey,
        nickname: user.nickname || participant.nickname,
        avatar: user.avatar || participant.avatar,
        powerUps: activePowerUps,
        participant
      });
    }
  }
  
  return result;
}

/**
 * Calcular tiempo restante formateado
 * @param {number} expiresAt - Timestamp de expiración
 */
function formatTimeRemaining(expiresAt) {
  const now = Date.now();
  const remaining = expiresAt - now;
  
  if (remaining <= 0) return 'Expirado';
  
  const days = Math.floor(remaining / MS_PER_DAY);
  const hours = Math.floor((remaining % MS_PER_DAY) / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Limpiar potenciadores expirados (más de 30 días)
 */
function cleanupExpired() {
  if (!data) loadData();
  
  const cutoff = Date.now() - (30 * MS_PER_DAY);
  let cleaned = 0;
  
  for (const user of Object.values(data.users)) {
    const before = user.powerUps.length;
    user.powerUps = user.powerUps.filter(p => p.expiresAt > cutoff || p.used);
    cleaned += before - user.powerUps.length;
  }
  
  if (cleaned > 0) {
    saveData();
    // console.log(`[PowerUps] 🧹 Limpiados ${cleaned} potenciadores expirados`);
  }
  
  return cleaned;
}

/**
 * Obtener estadísticas
 */
function getStats() {
  if (!data) loadData();
  
  const now = Date.now();
  let totalUsers = 0;
  let totalActive = 0;
  let totalUsed = 0;
  let totalExpired = 0;
  const byType = {};
  
  for (const user of Object.values(data.users)) {
    if (user.powerUps.length > 0) totalUsers++;
    
    for (const p of user.powerUps) {
      if (!byType[p.type]) byType[p.type] = { active: 0, used: 0, expired: 0 };
      
      if (p.used) {
        totalUsed++;
        byType[p.type].used++;
      } else if (p.expiresAt <= now) {
        totalExpired++;
        byType[p.type].expired++;
      } else {
        totalActive++;
        byType[p.type].active++;
      }
    }
  }
  
  return { totalUsers, totalActive, totalUsed, totalExpired, byType };
}

// Cargar datos al iniciar
loadData();

// Limpiar expirados cada hora
setInterval(cleanupExpired, 60 * 60 * 1000);

module.exports = {
  loadData,
  saveData,
  getPowerUpTypes,
  addPowerUp,
  getUserPowerUps,
  getAllUsersWithPowerUps,
  markPowerUpAsUsed,
  removePowerUp,
  checkParticipantsWithPowerUps,
  formatTimeRemaining,
  cleanupExpired,
  getStats,
  DURATION_DAYS,
  MS_PER_DAY
};
