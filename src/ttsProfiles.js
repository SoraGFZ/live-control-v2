/**
 * ttsProfiles.js
 * Definición de perfiles de voz predefinidos para el módulo TTS.
 *
 * VOCES DE ELEVENLABS:
 * Cada perfil incluye un elevenLabsVoiceId con una voz pre-made del catálogo
 * gratuito de ElevenLabs. El modelo eleven_turbo_v2_5 soporta español con
 * cualquier voz (multilingual). Los parámetros stability/similarityBoost/style
 * controlan la expresividad del personaje.
 *
 * Para cambiar la voz de un perfil:
 *   1. Ve a elevenlabs.io → Voice Library → copia el Voice ID
 *   2. Reemplaza el elevenLabsVoiceId del perfil deseado
 */

export const TTS_PROFILES = [
  {
    id: 'anime-hero',
    name: 'Anime Hero',
    emoji: '⚡',
    tagline: 'Energético y apasionado',
    description: 'Voz rápida y emocionada, perfecta para celebrar momentos épicos del live.',
    color: '#ff6b9d',
    colorBg: 'rgba(255, 107, 157, 0.08)',
    colorBorder: 'rgba(255, 107, 157, 0.22)',
    // Browser (web speech API)
    rate: 1.3,
    pitch: 1.4,
    lang: 'es-ES',
    // ElevenLabs — Elli (femenina, joven y enérgica)
    elevenLabsVoiceId: 'MF3mGyEYCl7XYWbV9V6O',
    elevenLabsStability: 0.28,
    elevenLabsSimilarityBoost: 0.85,
    elevenLabsStyle: 0.60,
    sampleText: '¡Increíble! ¡Gracias por el regalo, eres el mejor del live!',
  },
  {
    id: 'epic-narrator',
    name: 'Epic Narrator',
    emoji: '🎙️',
    tagline: 'Profundo y cinematográfico',
    description: 'Voz lenta y grave. Ideal para anunciar nuevos seguidores y regalos importantes.',
    color: '#a78bfa',
    colorBg: 'rgba(167, 139, 250, 0.08)',
    colorBorder: 'rgba(167, 139, 250, 0.22)',
    // Browser
    rate: 0.78,
    pitch: 0.65,
    lang: 'es-ES',
    // ElevenLabs — Josh (masculino, profundo y dramático)
    elevenLabsVoiceId: 'TxGEqnHWrfWFTfGW9XjX',
    elevenLabsStability: 0.72,
    elevenLabsSimilarityBoost: 0.88,
    elevenLabsStyle: 0.25,
    sampleText: 'Un nuevo seguidor se une a la leyenda. Bienvenido, guerrero.',
  },
  {
    id: 'cyber-droid',
    name: 'Cyber Droid',
    emoji: '🤖',
    tagline: 'Robótico y preciso',
    description: 'Voz mecánica y monótona. Perfecta para eventos automáticos y notificaciones.',
    color: '#67e8f9',
    colorBg: 'rgba(103, 232, 249, 0.08)',
    colorBorder: 'rgba(103, 232, 249, 0.22)',
    // Browser
    rate: 0.88,
    pitch: 0.45,
    lang: 'es-ES',
    // ElevenLabs — Antoni (masculino, claro y neutro)
    elevenLabsVoiceId: 'ErXwobaYiN019PkySvjV',
    elevenLabsStability: 0.92,
    elevenLabsSimilarityBoost: 0.72,
    elevenLabsStyle: 0.0,
    sampleText: 'Alerta de sistema: nuevo don recibido. Procesando recompensa.',
  },
  {
    id: 'chaos-goblin',
    name: 'Chaos Goblin',
    emoji: '👺',
    tagline: 'Frenético y caótico',
    description: 'Ultra rápido y agudo. El caos total cuando el chat se vuelve loco.',
    color: '#4ade80',
    colorBg: 'rgba(74, 222, 128, 0.08)',
    colorBorder: 'rgba(74, 222, 128, 0.22)',
    // Browser
    rate: 1.6,
    pitch: 1.85,
    lang: 'es-ES',
    // ElevenLabs — Domi (femenina, fuerte y errática)
    elevenLabsVoiceId: 'AZnzlk1XvdvUeBnXmlld',
    elevenLabsStability: 0.18,
    elevenLabsSimilarityBoost: 0.95,
    elevenLabsStyle: 0.85,
    sampleText: '¡EL CHAT HA DESPERTADO AL GOBLIN! ¡CAOOOS CAOOOS CAOOOS!',
  },
  {
    id: 'kawaii-ai',
    name: 'Kawaii AI',
    emoji: '🌸',
    tagline: 'Dulce y amigable',
    description: 'Voz suave y melódica. Ideal para dar la bienvenida y mensajes positivos.',
    color: '#f9a8d4',
    colorBg: 'rgba(249, 168, 212, 0.08)',
    colorBorder: 'rgba(249, 168, 212, 0.22)',
    // Browser
    rate: 1.1,
    pitch: 1.55,
    lang: 'es-ES',
    // ElevenLabs — Rachel (femenina, cálida y amigable)
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    elevenLabsStability: 0.50,
    elevenLabsSimilarityBoost: 0.80,
    elevenLabsStyle: 0.40,
    sampleText: '¡Hola hola! ¡Bienvenida al stream, me alegra mucho que estés aquí!',
  },
  {
    id: 'dark-villain',
    name: 'Dark Villain',
    emoji: '💀',
    tagline: 'Misterioso y amenazante',
    description: 'Voz grave y lenta con presencia intimidante. Para los momentos más dramáticos.',
    color: '#818cf8',
    colorBg: 'rgba(129, 140, 248, 0.08)',
    colorBorder: 'rgba(129, 140, 248, 0.22)',
    // Browser
    rate: 0.72,
    pitch: 0.38,
    lang: 'es-ES',
    // ElevenLabs — Arnold (masculino, grave y amenazante)
    elevenLabsVoiceId: 'VR6AewLTigWG4xSOukaG',
    elevenLabsStability: 0.80,
    elevenLabsSimilarityBoost: 0.92,
    elevenLabsStyle: 0.30,
    sampleText: 'Otro incauto se une... Nadie escapa de este stream. Nadie.',
  },
]

/** Mapa id → perfil para acceso en O(1) */
export const TTS_PROFILES_MAP = Object.fromEntries(TTS_PROFILES.map((p) => [p.id, p]))

/** Perfil de fallback si el id no existe */
export const FALLBACK_PROFILE = TTS_PROFILES[0]

/** Asignaciones por defecto de tipo de evento → perfil */
export const DEFAULT_PROFILE_ASSIGNMENTS = {
  comment: 'anime-hero',
  gift: 'epic-narrator',
  follow: 'kawaii-ai',
  'like-burst': 'chaos-goblin',
  share: 'cyber-droid',
  emote: 'cyber-droid',
  manual: 'epic-narrator',
}

/** Eventos asignables en la UI */
export const ASSIGNABLE_EVENTS = [
  { id: 'comment',    label: 'Comentarios del chat', icon: '💬' },
  { id: 'gift',       label: 'Regalos',              icon: '🎁' },
  { id: 'follow',     label: 'Nuevos seguidores',    icon: '🫂' },
  { id: 'like-burst', label: 'Ráfaga de likes',      icon: '❤️' },
  { id: 'share',      label: 'Compartidos',           icon: '↗️' },
]
