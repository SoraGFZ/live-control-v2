/**
 * Categorías del editor de acciones (paridad TikControl Premium / Founder).
 * Cada categoría define las salidas (outputs) que ejecuta el motor local.
 */
export const TIKCONTROL_ACTION_CATEGORIES = [
  {
    id: 'alert',
    label: 'Alerta overlay',
    icon: '🔔',
    description: 'Texto animado, fuentes y efectos en pantalla del live.',
    outputs: ['overlayAlert'],
    founder: true,
  },
  {
    id: 'media',
    label: 'Video / imagen',
    icon: '🖼️',
    description: 'GIF, imagen o clip en una pantalla OBS.',
    outputs: ['overlayMedia'],
    founder: true,
  },
  {
    id: 'sound',
    label: 'Sonido',
    icon: '🔊',
    description: 'Efecto o música desde biblioteca local o URL.',
    outputs: ['audio'],
    founder: false,
  },
  {
    id: 'tts',
    label: 'TTS',
    icon: '🗣️',
    description: 'Lee el mensaje del viewer con voz sintética.',
    outputs: ['tts', 'overlayAlert'],
    founder: true,
  },
  {
    id: 'obs',
    label: 'OBS',
    icon: '🎥',
    description: 'Cambiar escena, fuente o visibilidad en OBS.',
    outputs: ['obs'],
    founder: true,
  },
  {
    id: 'streamerbot',
    label: 'Streamer.bot',
    icon: '🤖',
    description: 'Dispara una acción remota de Streamer.bot.',
    outputs: ['streamerbot'],
    founder: true,
  },
  {
    id: 'game',
    label: 'Comando de juego',
    icon: '🎮',
    description: 'Biblioteca TikControl: 60+ juegos, mods y comandos cloud.',
    outputs: ['game'],
    founder: true,
  },
  {
    id: 'minecraft',
    label: 'Minecraft',
    icon: '⛏️',
    description: 'RCON, Bedrock Box, OneBlock y bridge local.',
    outputs: ['minecraft'],
    founder: true,
  },
  {
    id: 'gta',
    label: 'GTA V',
    icon: '🚗',
    description: 'ChaosMod y GTAVWebhook / S2E.',
    outputs: ['gta'],
    founder: true,
  },
  {
    id: 'webhook',
    label: 'Webhook',
    icon: '🔗',
    description: 'POST JSON a URL personalizada.',
    outputs: ['webhook'],
    founder: true,
  },
  {
    id: 'keystroke',
    label: 'Teclado / ratón',
    icon: '⌨️',
    description: 'Simula teclas o movimiento (local).',
    outputs: ['keystroke'],
    founder: true,
  },
  {
    id: 'delay',
    label: 'Espera',
    icon: '⏱️',
    description: 'Pausa antes de la siguiente acción en cadena.',
    outputs: ['delay'],
    founder: false,
  },
]

export const OBS_ACTION_OPTIONS = [
  { id: 'scene-switch', label: 'Cambiar escena' },
  { id: 'scene-visible', label: 'Mostrar escena' },
  { id: 'source-show', label: 'Mostrar fuente' },
  { id: 'source-hide', label: 'Ocultar fuente' },
  { id: 'source-toggle', label: 'Alternar fuente' },
  { id: 'source-solo', label: 'Solo esta fuente' },
]

export function inferCategoryFromAction(action) {
  if (!action) {
    return 'alert'
  }

  if (action.categoryId) {
    return action.categoryId
  }

  const outputs = Array.isArray(action.outputs) ? action.outputs : []

  if (outputs.includes('game')) {
    return 'game'
  }
  if (outputs.includes('minecraft')) {
    return 'minecraft'
  }
  if (outputs.includes('gta')) {
    return 'gta'
  }
  if (outputs.includes('obs')) {
    return 'obs'
  }
  if (outputs.includes('streamerbot')) {
    return 'streamerbot'
  }
  if (outputs.includes('webhook')) {
    return 'webhook'
  }
  if (outputs.includes('keystroke')) {
    return 'keystroke'
  }
  if (outputs.includes('delay')) {
    return 'delay'
  }
  if (outputs.includes('tts')) {
    return 'tts'
  }
  if (outputs.includes('audio')) {
    return 'sound'
  }
  if (outputs.includes('overlayMedia')) {
    return 'media'
  }

  return 'alert'
}

export function getCategoryMeta(categoryId) {
  return TIKCONTROL_ACTION_CATEGORIES.find((item) => item.id === categoryId) || TIKCONTROL_ACTION_CATEGORIES[0]
}

export function outputsForCategory(categoryId) {
  return [...(getCategoryMeta(categoryId).outputs || ['overlayAlert'])]
}