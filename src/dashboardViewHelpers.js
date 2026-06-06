import { LOCAL_BRIDGE_DEFAULTS, resolveActionType, truncateValue } from './live-control'
import { normalizeUserHandle } from './dashboardShared'
import {
  inferCategoryFromAction,
  outputsForCategory,
} from './config/tikcontrolActionTypes.js'

export const VISUAL_TRIGGER_OPTIONS = [
  { id: 'gift', label: 'Gift', note: 'Regalos y combos del live.', token: 'GF' },
  { id: 'emote', label: 'Emote', note: 'Stickers y emotes del live.', token: 'EM' },
  { id: 'like-burst', label: 'Likes', note: 'Rafagas y metas de likes.', token: 'LK' },
  { id: 'follow', label: 'Follow', note: 'Nuevo seguidor en directo.', token: 'FW' },
  { id: 'comment', label: 'Chat', note: 'Comandos del chat y mensajes.', token: 'CH' },
  { id: 'share', label: 'Share', note: 'Cuando comparten el live.', token: 'SH' },
]

export const EVENT_PLATFORM_OPTIONS = [
  { id: 'tiktok', label: 'TikTok', note: 'Disponible ahora', token: 'TT', disabled: false },
  { id: 'kick', label: 'Kick', note: 'Proximamente', token: 'KK', disabled: true },
]

export const TRIGGER_AUDIENCE_OPTIONS = [
  { id: 'any', label: 'Todos', note: 'Cualquiera que participe en el live puede activarlo.' },
  { id: 'followers', label: 'Seguidores', note: 'Solo viewers que ya siguen tu canal.' },
  { id: 'subscribers', label: 'Suscriptores', note: 'Ideal para perks de subs y fan club.' },
  { id: 'moderators', label: 'Moderadores', note: 'Solo moderadores del directo.' },
  { id: 'super-fans', label: 'Super Fans', note: 'Fan club o usuarios destacados del live.' },
  { id: 'specific-users', label: 'Usuario especifico', note: 'Uno o varios usernames concretos.' },
]

export const COMMENT_TRIGGER_OPTIONS = [
  {
    id: 'specific',
    label: 'Comentario exacto',
    note: 'Se activa solo si escriben ese comando o frase.',
  },
  {
    id: 'global',
    label: 'Comentario global',
    note: 'Cualquier comentario en el chat activará esta acción.',
  },
]

export const DEFAULT_TRIGGER_MATCHES = {
  gift: 'Rose x1',
  emote: 'Cualquier emote',
  follow: 'Cualquier follow',
  comment: '!chaos',
  share: 'Cualquier share',
  'like-burst': '100 likes',
}

export const CURATED_GIFT_CATALOG = [
  { name: 'Rose', coins: 1, token: 'RO', accent: '#ff6f91', tags: ['popular', 'starter'] },
  { name: 'GG', coins: 1, token: 'GG', accent: '#75d66f', tags: ['popular', 'badge'] },
  { name: 'TikTok', coins: 1, token: 'TT', accent: '#55e3d6', tags: ['popular', 'platform'] },
  { name: "You're awesome", coins: 1, token: 'YA', accent: '#f3b348', tags: ['popular'] },
  { name: 'Love you so much', coins: 1, token: 'LV', accent: '#ff8d6b', tags: ['popular'] },
  { name: 'Creeper', coins: 1, token: 'CR', accent: '#77c85d', tags: ['gaming'] },
  { name: 'Cake Slice', coins: 1, token: 'CK', accent: '#ffb1cc', tags: ['sweet'] },
  { name: 'Freestyle', coins: 1, token: 'FS', accent: '#74a7ff', tags: ['music'] },
  { name: 'Oldies', coins: 1, token: 'OL', accent: '#d08bff', tags: ['music'] },
  { name: 'Glow Stick', coins: 1, token: 'GL', accent: '#62d5ff', tags: ['party'] },
  { name: 'Wink wink', coins: 1, token: 'WK', accent: '#ff8fd2', tags: ['cute'] },
  { name: 'Ice Cream Cone', coins: 1, token: 'IC', accent: '#ffd66c', tags: ['sweet'] },
  { name: 'Heart Me', coins: 1, token: 'HM', accent: '#ff7260', tags: ['popular', 'cute'] },
  { name: 'Finger Heart', coins: 5, token: 'FH', accent: '#ff9276', tags: ['popular'] },
  { name: 'Perfume', coins: 20, token: 'PF', accent: '#c6a0ff', tags: ['premium'] },
  { name: 'Cap', coins: 99, token: 'CP', accent: '#f8cf63', tags: ['premium'] },
  { name: 'Swan', coins: 699, token: 'SW', accent: '#8fd9ff', tags: ['premium'] },
  { name: 'Lion', coins: 29999, token: 'LN', accent: '#ffc66b', tags: ['legend'] },
]

export const GIFT_CARD_ACCENTS = ['#ff6f91', '#55e3d6', '#f3b348', '#74a7ff', '#ff8d6b', '#c28cff']

export const CHAOSMOD_CATEGORY_ACCENTS = {
  player: '#ff7b54',
  vehicle: '#f3b348',
  vehs: '#f3b348',
  peds: '#79d28e',
  weather: '#69b0ff',
  world: '#55e3d6',
  meta: '#c28cff',
  misc: '#ff7fb4',
  teleport: '#8fdcf3',
  time: '#b8c26d',
  weapon: '#ff8f66',
}

export const GAME_SPOTLIGHT = {
  minecraft: {
    title: 'Minecraft',
    eyebrow: 'Sandbox survival',
    coverUrl: '/game-covers/minecraft.jpg',
    accent: '#7fd26b',
    summary: 'Comandos por RCON o mod local para convertir gifts y chat en gameplay.',
    shortTitle: 'Minecraft',
    versionLabel: 'Bridge listo',
    modeLabel: 'RCON / Mod local',
    availabilityLabel: 'Disponible ahora',
    primaryCta: 'Abrir acciones de Minecraft',
  },
  gta: {
    title: 'GTA V',
    eyebrow: 'Chaos y eventos',
    coverUrl: '/game-covers/gta-v-caratula-fan.jpg',
    accent: '#ff8a5b',
    summary: 'Bridge local con ChaosMod y acciones hechas para el directo.',
    shortTitle: 'GTA 5',
    versionLabel: 'Chaos bridge',
    modeLabel: 'ChaosMod',
    availabilityLabel: 'Disponible ahora',
    primaryCta: 'Abrir acciones de GTA V',
  },
}

export const BEDROCK_BOX_CATEGORY_ACCENTS = {
  setup: '#7fd26b',
  fill: '#55e3d6',
  chaos: '#ff8a5b',
  defense: '#c28cff',
  utility: '#f3b348',
}

export const BEDROCK_BOX_PRESETS = [
  {
    id: 'create_box',
    name: 'Crear arena',
    commandText: '/bedrock create',
    imageUrl: '/event-art/minecraft/llenarCubo.png',
    category: 'setup',
    note: 'Crea la Bedrock Box con el tamaño configurado en el plugin.',
  },
  {
    id: 'fill_row',
    name: 'Llenar 1 fila',
    commandText: '/bedrock fill 1',
    imageUrl: '/event-art/minecraft/aumentarFilas.png',
    category: 'fill',
    note: 'Rellena una fila de bloques dentro de la arena.',
  },
  {
    id: 'fill_three_rows',
    name: 'Llenar 3 filas',
    commandText: '/bedrock fill 3',
    imageUrl: '/event-art/minecraft/llenarCubo.png',
    category: 'fill',
    note: 'Acelera el reto agregando tres filas de golpe.',
  },
  {
    id: 'fill_block',
    name: 'Agregar 1 bloque',
    commandText: '/bedrock fillblock 1',
    imageUrl: '/event-art/minecraft/aumentarBloques.png',
    category: 'fill',
    note: 'Suma un bloque extra sin llenar una fila completa.',
  },
  {
    id: 'drop_tnt',
    name: 'TNT directa',
    commandText: '/bedrock tnt',
    imageUrl: '/event-art/minecraft/tnt.png',
    category: 'chaos',
    note: 'Lanza una TNT sobre la arena.',
  },
  {
    id: 'random_tnt',
    name: 'TNT random',
    commandText: '/bedrock randomtnt',
    imageUrl: '/event-art/minecraft/tntSky.png',
    category: 'chaos',
    note: 'Genera una TNT con fuerza aleatoria.',
  },
  {
    id: 'super_tnt',
    name: 'Super TNT',
    commandText: '/bedrock supertnt 3 4',
    imageUrl: '/event-art/minecraft/tntRain.png',
    category: 'chaos',
    note: 'Dispara varias TNT con fuerza media para momentos potentes.',
  },
  {
    id: 'glass_prison',
    name: 'Glass prison',
    commandText: '/bedrock glass_prison 10',
    imageUrl: '/event-art/minecraft/prision.png',
    category: 'defense',
    note: 'Encierra al jugador en una prision de cristal por 10 segundos.',
  },
  {
    id: 'set_timer',
    name: 'Timer a 15 seg',
    commandText: '/bedrock timer 15',
    category: 'setup',
    note: 'Ajusta el contador interno del plugin a 15 segundos.',
  },
  {
    id: 'teleport_top',
    name: 'Teleport al top',
    commandText: '/bedrock tp',
    category: 'utility',
    note: 'Lleva al jugador a la parte alta de la arena.',
  },
  {
    id: 'switch_glass',
    name: 'Modo glass',
    commandText: '/bedrock glass',
    category: 'utility',
    note: 'Convierte paredes y piso en cristal.',
  },
  {
    id: 'clear_box',
    name: 'Limpiar arena',
    commandText: '/bedrock clear',
    imageUrl: '/event-art/minecraft/liberar.png',
    category: 'utility',
    note: 'Vacia el contenido de la Bedrock Box.',
  },
].map((preset) => ({
  ...preset,
  integration: 'Bedrock Box',
  minecraftMode: 'bedrock-box',
}))

export const ONEBLOCK_CATEGORY_ACCENTS = {
  setup: '#7fd26b',
  mobs: '#ff8a5b',
  chaos: '#ef6f6c',
  loot: '#f3b348',
  platform: '#55e3d6',
  challenge: '#c28cff',
  utility: '#69b0ff',
}

export const ONEBLOCK_PRESETS = [
  {
    id: 'oneblock_create',
    name: 'Crear OneBlock',
    commandText: '/oneblock create',
    imageUrl: '/event-art/minecraft/llenarCubo.png',
    category: 'setup',
    note: 'Crea la partida/mundo OneBlock del plugin s2e-oneblock.',
  },
  {
    id: 'oneblock_start',
    name: 'Iniciar partida',
    commandText: '/oneblock start',
    category: 'setup',
    note: 'Activa la partida OneBlock ya creada.',
  },
  {
    id: 'oneblock_stop',
    name: 'Pausar partida',
    commandText: '/oneblock stop',
    category: 'setup',
    note: 'Detiene la partida OneBlock sin borrar el mundo.',
  },
  {
    id: 'oneblock_reset',
    name: 'Reset normal',
    commandText: '/oneblock reset',
    imageUrl: '/event-art/minecraft/liberar.png',
    category: 'utility',
    note: 'Reinicia la partida OneBlock.',
  },
  {
    id: 'oneblock_reset_thunder',
    name: 'Reset con truenos',
    commandText: '/oneblock reset_thunder',
    category: 'chaos',
    note: 'Reinicia el reto con tormenta/truenos.',
  },
  {
    id: 'oneblock_tnt',
    name: 'TNT cerca del jugador',
    commandText: '/oneblock tnt 60',
    imageUrl: '/event-art/minecraft/tnt.png',
    category: 'chaos',
    note: 'Invoca TNT cerca del jugador. El valor controla ticks.',
  },
  {
    id: 'oneblock_tntplatform',
    name: 'Plataforma TNT',
    commandText: '/oneblock tntplatform',
    imageUrl: '/event-art/minecraft/tntOneBlock.png',
    category: 'chaos',
    note: 'Genera bloques TNT alrededor del jugador y los detona.',
  },
  {
    id: 'oneblock_zombie',
    name: 'Zombie',
    commandText: '/oneblock zombie',
    category: 'mobs',
    note: 'Spawnea un zombie cerca del jugador.',
  },
  {
    id: 'oneblock_skeleton',
    name: 'Skeleton',
    commandText: '/oneblock skeleton',
    category: 'mobs',
    note: 'Spawnea un skeleton cerca del jugador.',
  },
  {
    id: 'oneblock_ghast',
    name: 'Ghast',
    commandText: '/oneblock ghast',
    category: 'mobs',
    note: 'Spawnea un ghast para un momento de alto caos.',
  },
  {
    id: 'oneblock_warden',
    name: 'Warden',
    commandText: '/oneblock warden',
    category: 'mobs',
    note: 'Spawnea un warden cerca del jugador.',
  },
  {
    id: 'oneblock_villager',
    name: 'Villager',
    commandText: '/oneblock villager',
    imageUrl: '/event-art/minecraft/aldeano.png',
    category: 'mobs',
    note: 'Spawnea un aldeano cerca del jugador.',
  },
  {
    id: 'oneblock_iron_golem',
    name: 'Iron Golem',
    commandText: '/oneblock iron_golem',
    category: 'mobs',
    note: 'Spawnea un golem de hierro como ayuda o caos.',
  },
  {
    id: 'oneblock_blaze',
    name: 'Blaze',
    commandText: '/oneblock blaze',
    category: 'mobs',
    note: 'Spawnea un blaze cerca del jugador.',
  },
  {
    id: 'oneblock_evoker',
    name: 'Evoker',
    commandText: '/oneblock evoker',
    category: 'mobs',
    note: 'Spawnea un evoker cerca del jugador.',
  },
  {
    id: 'oneblock_witch',
    name: 'Witch',
    commandText: '/oneblock witch',
    category: 'mobs',
    note: 'Spawnea una bruja cerca del jugador.',
  },
  {
    id: 'oneblock_wither_skeleton',
    name: 'Wither Skeleton',
    commandText: '/oneblock skeleton_wither',
    category: 'mobs',
    note: 'Spawnea un wither skeleton cerca del jugador.',
  },
  {
    id: 'oneblock_pig',
    name: 'Pig',
    commandText: '/oneblock pig',
    category: 'mobs',
    note: 'Spawnea un cerdo cerca del jugador.',
  },
  {
    id: 'oneblock_chest',
    name: 'Chest random',
    commandText: '/oneblock chest',
    category: 'loot',
    note: 'Genera un cofre con loot aleatorio cerca del jugador.',
  },
  {
    id: 'oneblock_ender_chest',
    name: 'Ender Chest',
    commandText: '/oneblock chestender',
    category: 'loot',
    note: 'Genera un ender chest cerca del jugador.',
  },
  {
    id: 'oneblock_randomblock_5',
    name: '5 bloques random',
    commandText: '/oneblock randomblock 5',
    imageUrl: '/event-art/minecraft/aumentarBloques.png',
    category: 'loot',
    note: 'Entrega bloques aleatorios cinco veces.',
  },
  {
    id: 'oneblock_platform_oak_3',
    name: 'Expandir plataforma',
    commandText: '/oneblock platform_player OAK_PLANKS 3',
    imageUrl: '/event-art/minecraft/aumentarFilas.png',
    category: 'platform',
    note: 'Extiende la plataforma alrededor del jugador con madera.',
  },
  {
    id: 'oneblock_island',
    name: 'Isla random',
    commandText: '/oneblock island',
    category: 'challenge',
    note: 'Genera una isla cerca del jugador.',
  },
  {
    id: 'oneblock_island_spider',
    name: 'Isla con boss spider',
    commandText: '/oneblock island_spider',
    category: 'challenge',
    note: 'Genera una isla con un boss spider.',
  },
  {
    id: 'oneblock_structure_random',
    name: 'Estructura random',
    commandText: '/oneblock structure -1',
    imageUrl: '/event-art/minecraft/dragon.png',
    category: 'challenge',
    note: 'Genera una estructura challenge aleatoria cerca del jugador.',
  },
  {
    id: 'oneblock_keep_tools',
    name: 'Keep tools',
    commandText: '/oneblock keep_tools',
    category: 'utility',
    note: 'Conserva herramientas del jugador tras morir.',
  },
].map((preset) => ({
  ...preset,
  integration: 'S2E OneBlock',
  minecraftMode: 'oneblock',
}))

export const MINECRAFT_PLUGIN_PRESETS = [
  ...BEDROCK_BOX_PRESETS,
  ...ONEBLOCK_PRESETS,
]

export const GTAV_WEBHOOK_COMMAND_OPTIONS = [
  {
    id: 'spawn_vehicle',
    label: 'Spawn vehicle',
    note: 'Invoca un vehiculo usando la capa GTAVWebhook.',
  },
  {
    id: 'replace_vehicle',
    label: 'Replace vehicle',
    note: 'Reemplaza el vehiculo actual del jugador.',
  },
  {
    id: 'toolup',
    label: 'Toolup',
    note: 'Entrega armas o loadout definido por el plugin.',
  },
  {
    id: 'props',
    label: 'Props',
    note: 'Genera props u objetos del sistema S2E.',
  },
  {
    id: 'parkour',
    label: 'Parkour',
    note: 'Inicia o reinicia un reto de parkour.',
  },
  {
    id: 'maps',
    label: 'Maps',
    note: 'Carga un mapa o decorado del webhook.',
  },
]

export function resolveDesktopPanelSection() {
  const fromQuery = readWorkspacePanelFromUrl()
  if (fromQuery) {
    return fromQuery
  }

  if (typeof window === 'undefined') {
    return 'live-hub'
  }

  const [first] = window.location.pathname.split('/').filter(Boolean)
  return first === 'overlay' ? 'overlay' : 'live-hub'
}

export function readWorkspacePanelFromUrl() {
  if (typeof window === 'undefined') {
    return null
  }

  const searchParams = new URLSearchParams(window.location.search)
  let panel = searchParams.get('panel')

  if (!panel && window.location.hash.startsWith('#panel=')) {
    panel = window.location.hash.slice('#panel='.length)
  }

  const allowed = new Set([
    'overview',
    'live-hub',
    'live-ops',
    'actions',
    'sounds',
    'tts',
    'widgets-gallery',
    'overlay',
    'music',
    'gifts-hub',
    'goals',
    'community',
    'games',
    'support',
    'account',
    'bridges',
    'storage',
    'profiles',
  ])

  return allowed.has(panel) ? panel : null
}

export function isOverlayWidgetView() {
  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get('view') === 'widget'
}

/** En Electron, nunca dejar la ventana principal en /overlay/... (vista OBS vacía). */
export function normalizeDesktopDashboardUrl() {
  if (typeof window === 'undefined' || !window.liveControlDesktop || isOverlayWidgetView()) {
    return false
  }

  const nextUrl = new URL(window.location.href)

  if (!nextUrl.pathname.startsWith('/overlay/')) {
    return false
  }

  const panel = readWorkspacePanelFromUrl() || 'overlay'
  nextUrl.pathname = '/'
  nextUrl.searchParams.set('panel', panel)
  nextUrl.searchParams.delete('view')
  window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`)
  return true
}

export function appendOverlayWidgetViewParam(url) {
  if (typeof window === 'undefined' || !url) {
    return url
  }

  try {
    const nextUrl = new URL(url, window.location.origin)
    nextUrl.searchParams.set('view', 'widget')
    return nextUrl.toString()
  } catch {
    const separator = String(url).includes('?') ? '&' : '?'
    return `${url}${separator}view=widget`
  }
}

export function getCurrentRoute() {
  if (typeof window === 'undefined') {
    return { kind: 'dashboard', slug: 'main-stage' }
  }

  const panelSection = readWorkspacePanelFromUrl()

  if (panelSection) {
    return { kind: 'dashboard', slug: 'main-stage', panelSection }
  }

  const [first, second, third] = window.location.pathname.split('/').filter(Boolean)
  const desktopApp = Boolean(window.liveControlDesktop)
  const widgetView = isOverlayWidgetView()

  if (first === 'overlay' && desktopApp && !widgetView) {
    return { kind: 'dashboard', slug: second || 'main-stage', panelSection: 'overlay' }
  }

  if (first === 'overlay' && third === 'smart-bar') {
    return { kind: 'smart-bar', slug: second || 'main-stage' }
  }

  if (first === 'overlay' && third === 'song-request') {
    return { kind: 'song-request', slug: second || 'main-stage' }
  }

  if (first === 'overlay' && third === 'top-likes') {
    return { kind: 'top-likes', slug: second || 'main-stage' }
  }

  if (first === 'overlay' && third === 'top-gifts') {
    return { kind: 'top-gifts', slug: second || 'main-stage' }
  }

  if (first === 'overlay') {
    return { kind: 'overlay', slug: second || 'main-stage' }
  }

  return { kind: 'dashboard', slug: 'main-stage' }
}

export function readOverlayAccessKeyFromUrl() {
  if (typeof window === 'undefined') {
    return ''
  }

  return new URLSearchParams(window.location.search).get('key') || ''
}

export function formatDurationClock(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export function formatCompactNumber(value) {
  const numericValue = Math.max(0, Number(value || 0))

  if (numericValue >= 1_000_000) {
    const formatted = numericValue / 1_000_000
    return `${formatted >= 10 ? Math.round(formatted) : formatted.toFixed(1).replace(/\.0$/, '')}M`
  }

  if (numericValue >= 10_000) {
    const formatted = numericValue / 1_000
    return `${formatted >= 100 ? Math.round(formatted) : formatted.toFixed(1).replace(/\.0$/, '')}K`
  }

  if (numericValue >= 1_000) {
    return numericValue.toLocaleString('es-ES')
  }

  return String(numericValue)
}

export function buildLeaderboardPreviewData(kind = 'likes') {
  if (kind === 'gifts') {
    return {
      totalCoins: 15420,
      topGifts: [
        { rank: 1, uniqueId: 'mega_donor', nickname: 'Mega Donor', totalCoins: 8998, giftCount: 2, topGiftName: 'Universe' },
        { rank: 2, uniqueId: 'rose_king', nickname: 'Rose King', totalCoins: 900, giftCount: 900, topGiftName: 'Rose' },
        { rank: 3, uniqueId: 'galaxy_fan', nickname: 'Galaxy Fan', totalCoins: 1000, giftCount: 1, topGiftName: 'Galaxy' },
      ],
    }
  }

  return {
    totalLikes: 12870,
    topLikes: [
      { rank: 1, uniqueId: 'luna_vip', nickname: 'Luna VIP', totalLikes: 4200 },
      { rank: 2, uniqueId: 'carlos_live', nickname: 'Carlos Live', totalLikes: 3100 },
      { rank: 3, uniqueId: 'ana_streams', nickname: 'Ana Streams', totalLikes: 2400 },
    ],
  }
}

export function getSmartBarGoalValue(smartBar) {
  const parsedGoal = Number.parseInt(String(smartBar?.winGoal || '0').replace(/[^\d]/g, ''), 10)
  return Number.isNaN(parsedGoal) || parsedGoal <= 0 ? 0 : parsedGoal
}

export function buildSmartBarMetrics(smartBar, smartBarStatus, now) {
  const metrics = []

  if (smartBar?.showCoins) {
    metrics.push({
      id: 'coins',
      label: 'Coins',
      value: String(smartBarStatus.receivedCoins || 0),
    })
  }

  if (smartBar?.showFollows) {
    metrics.push({
      id: 'follows',
      label: 'Follows',
      value: String(smartBarStatus.followCount || 0),
    })
  }

  if (smartBar?.showLiveDuration) {
    const liveDurationMs =
      smartBarStatus.connected && smartBarStatus.sessionStartedAt
        ? now - smartBarStatus.sessionStartedAt
        : smartBarStatus.liveDurationMs || 0

    metrics.push({
      id: 'live-duration',
      label: 'Tiempo',
      value: formatDurationClock(liveDurationMs),
    })
  }

  return metrics
}

export function createActionDraft(action = null) {
  const categoryId = inferCategoryFromAction(action)

  return {
    id: action?.id,
    scope: action?.scope || 'profile',
    screen: action?.screen || '1',
    duration: action?.duration ?? 10,
    categoryId,
    type: resolveActionType(action),
    name: action?.name || '',
    description: action?.description || '',
    outputs: action?.outputs?.length ? action.outputs : outputsForCategory(categoryId),
    commandText: action?.commandText || '',
    minecraftMode: action?.minecraftMode || 'generic',
    minecraftBedrockPresetId: action?.minecraftBedrockPresetId || '',
    minecraftBedrockPresetName: action?.minecraftBedrockPresetName || '',
    gtaMode: action?.gtaMode || 'generic',
    gtaChaosEffectId: action?.gtaChaosEffectId || '',
    gtaChaosEffectName: action?.gtaChaosEffectName || '',
    gtaWebhookCommand: action?.gtaWebhookCommand || '',
    gtaWebhookPayload: action?.gtaWebhookPayload || '',
    overlayText: action?.overlayText || '',
    mediaUrl: action?.mediaUrl || '',
    obsAction: action?.obsAction || '',
    obsScene: action?.obsScene || '',
    obsSource: action?.obsSource || '',
    streamerbotAction: action?.streamerbotAction || '',
    webhookUrl: action?.webhookUrl || '',
    webhookMethod: action?.webhookMethod || 'POST',
    webhookBody: action?.webhookBody || '',
    keystrokeKeys: action?.keystrokeKeys || '',
    delaySeconds: action?.delaySeconds ?? 1,
    gamingGameId: action?.gamingGameId || '',
    gamingGameName: action?.gamingGameName || '',
    gamingCommandId: action?.gamingCommandId || '',
    gamingCommandName: action?.gamingCommandName || '',
  }
}

export function createEmoteDraft(emote = null) {
  return {
    id: emote?.id || '',
    name: emote?.name || '',
    imageUrl: emote?.imageUrl || emote?.emoteImageUrl || '',
    source: emote?.source || 'manual',
    sortOrder: emote?.sortOrder,
  }
}

export function createTriggerDraft(trigger = null, actions = []) {
  return {
    id: trigger?.id,
    scope: trigger?.scope || 'profile',
    active: trigger?.active !== false,
    platform: trigger?.platform || 'tiktok',
    source: trigger?.source || 'gift',
    match: trigger?.match || DEFAULT_TRIGGER_MATCHES.gift,
    actionId: trigger?.actionId || actions[0]?.id || '',
    cooldownSeconds: String(trigger?.cooldownSeconds || '0'),
    audience: getTriggerAudienceValue(trigger),
    specificUsersText: stringifySpecificUsers(trigger?.specificUsers),
  }
}

export function normalizePickerText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export function buildGiftTriggerMatch(giftName, repeatCount = '1') {
  const normalizedGiftName = String(giftName || '').trim()
  const numericRepeatCount = Number.parseInt(String(repeatCount || '1').replace(/[^\d]/g, ''), 10)
  const safeRepeatCount = Number.isNaN(numericRepeatCount) || numericRepeatCount <= 0 ? 1 : numericRepeatCount

  if (!normalizedGiftName) {
    return ''
  }

  return `${normalizedGiftName} x${safeRepeatCount}`
}

export function parseGiftTriggerMatch(rule) {
  const trimmedRule = String(rule || '').trim()
  const parsedMatch = trimmedRule.match(/^(.*?)(?:\s*x(\d+))?$/i)

  if (!parsedMatch) {
    return { giftName: '', repeatCount: '1' }
  }

  return {
    giftName: String(parsedMatch[1] || '').trim(),
    repeatCount: parsedMatch[2] || '1',
  }
}

export function parseSpecificUsers(value) {
  const rawItems = Array.isArray(value) ? value : String(value || '').split(/[,\n]/)
  const seenUsers = new Set()

  return rawItems.reduce((users, rawValue) => {
    const normalizedUser = normalizeUserHandle(rawValue)

    if (!normalizedUser || seenUsers.has(normalizedUser)) {
      return users
    }

    seenUsers.add(normalizedUser)
    users.push(normalizedUser)
    return users
  }, [])
}

export function stringifySpecificUsers(value) {
  return parseSpecificUsers(value).join(', ')
}

export function getTriggerAudienceValue(trigger) {
  if (trigger?.audience) {
    return trigger.audience
  }

  if (Array.isArray(trigger?.specificUsers) && trigger.specificUsers.length > 0) {
    return 'specific-users'
  }

  if (trigger?.allowModerators) {
    return 'moderators'
  }

  if (trigger?.allowSubscribers) {
    return 'subscribers'
  }

  return 'any'
}

export function getTriggerAudienceMeta(audienceId) {
  return TRIGGER_AUDIENCE_OPTIONS.find((option) => option.id === audienceId) || TRIGGER_AUDIENCE_OPTIONS[0]
}

export function getTriggerAudienceSummary(trigger) {
  const audience = getTriggerAudienceValue(trigger)

  if (audience === 'specific-users') {
    const specificUsers = parseSpecificUsers(trigger?.specificUsers)
    return specificUsers.length > 0 ? `Usuarios: ${specificUsers.join(', ')}` : 'Usuario especifico'
  }

  return getTriggerAudienceMeta(audience).label
}

export function isGlobalCommentRule(match) {
  return [
    '',
    'cualquier comentario',
    'chat global',
    'comentario global',
    'any comment',
  ].includes(normalizePickerText(match))
}

export function createKeywordToken(value, fallback = 'FX') {
  const words = String(value || '')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (words.length === 0) {
    return fallback
  }

  return words.map((word) => word.slice(0, 1).toUpperCase()).join('')
}

export function normalizeRemoteAssetUrl(value) {
  const normalizedValue = String(value || '').trim()

  if (!normalizedValue) {
    return ''
  }

  if (normalizedValue.startsWith('//')) {
    return `https:${normalizedValue}`
  }

  if (/^http:\/\//i.test(normalizedValue)) {
    return normalizedValue.replace(/^http:\/\//i, 'https://')
  }

  if (/^www\./i.test(normalizedValue)) {
    return `https://${normalizedValue}`
  }

  if (/^webcast-[a-z0-9-]+\//i.test(normalizedValue)) {
    const edgeBucket = /^webcast-sg\//i.test(normalizedValue) ? 'alisg' : 'maliva'
    return `https://p16-webcast.tiktokcdn.com/img/${edgeBucket}/${normalizedValue}~tplv-obj.webp`
  }

  return normalizedValue
}

export function normalizeGiftCatalogForPicker(gift, index = 0) {
  const imageUrl = normalizeRemoteAssetUrl(
    gift?.picture ||
      gift?.image ||
      gift?.icon ||
      gift?.imageUrl ||
      gift?.animatedImageUrl ||
      gift?.pictureList?.[0] ||
      '',
  )

  return {
    id: String(gift?.id || gift?.giftId || gift?.name || index),
    name: String(gift?.name || `Gift ${index + 1}`),
    coins: Number(gift?.coins || gift?.diamond || gift?.diamondCount || 0),
    imageUrl,
    token: String(gift?.token || createKeywordToken(gift?.name, 'GF')),
    accent: String(gift?.accent || GIFT_CARD_ACCENTS[index % GIFT_CARD_ACCENTS.length]),
    tags: Array.isArray(gift?.tags) ? gift.tags : [],
  }
}

export function normalizeEmoteCatalogForPicker(emote, index = 0) {
  return {
    id: String(emote?.id || emote?.emoteId || index),
    name: String(emote?.name || `Emote ${emote?.id || emote?.emoteId || index + 1}`),
    imageUrl: normalizeRemoteAssetUrl(emote?.imageUrl || emote?.emoteImageUrl || ''),
    token: String(emote?.token || createKeywordToken(emote?.name || emote?.id, 'EM')),
    accent: String(emote?.accent || GIFT_CARD_ACCENTS[index % GIFT_CARD_ACCENTS.length]),
    source: String(emote?.source || 'manual'),
    sortOrder: emote?.sortOrder,
  }
}

export function getEmoteSourceLabel(source) {
  if (source === 'tiktok-live-connector') {
    return 'Live'
  }

  return 'Manual'
}

export function getChaosModCardMeta(effect) {
  const normalizedCategory = normalizePickerText(effect?.category || effect?.categoryLabel || 'misc')

  return {
    accent: CHAOSMOD_CATEGORY_ACCENTS[normalizedCategory] || '#55e3d6',
    token:
      normalizedCategory === 'vehicle' || normalizedCategory === 'vehs'
        ? 'VH'
        : normalizedCategory === 'player'
          ? 'PL'
          : normalizedCategory === 'peds'
            ? 'PD'
            : normalizedCategory === 'meta'
              ? 'MT'
              : createKeywordToken(effect?.name, 'FX'),
  }
}

export function getBedrockBoxCardMeta(preset) {
  const normalizedCategory = normalizePickerText(preset?.category || 'utility')

  return {
    accent: BEDROCK_BOX_CATEGORY_ACCENTS[normalizedCategory] || '#55e3d6',
    token:
      normalizedCategory === 'chaos'
        ? 'TN'
        : normalizedCategory === 'fill'
          ? 'FL'
          : normalizedCategory === 'setup'
            ? 'BX'
            : normalizedCategory === 'defense'
              ? 'GP'
              : createKeywordToken(preset?.name, 'BB'),
  }
}

export function getMinecraftPresetCardMeta(preset) {
  if (preset?.minecraftMode === 'oneblock') {
    const normalizedCategory = normalizePickerText(preset?.category || 'utility')

    return {
      accent: ONEBLOCK_CATEGORY_ACCENTS[normalizedCategory] || '#69b0ff',
      token:
        normalizedCategory === 'mobs'
          ? 'MB'
          : normalizedCategory === 'chaos'
            ? 'TN'
            : normalizedCategory === 'setup'
              ? 'OB'
              : normalizedCategory === 'loot'
                ? 'LT'
                : normalizedCategory === 'challenge'
                  ? 'CH'
                  : createKeywordToken(preset?.name, 'OB'),
    }
  }

  return getBedrockBoxCardMeta(preset)
}

export function getActionDetailLine(action) {
  if (resolveActionType(action) === 'gtavwebhook' && action.gtaWebhookPayload) {
    return `Payload: ${truncateValue(action.gtaWebhookPayload)}`
  }

  if (action.overlayText) {
    return `Overlay: ${action.overlayText}`
  }

  if (action.mediaUrl) {
    return `Media: ${truncateValue(action.mediaUrl)}`
  }

  return action.description || 'Sin nota extra.'
}

export function groupActionsByOutput(actions = [], outputId = '') {
  return actions.filter((action) => Array.isArray(action.outputs) && action.outputs.includes(outputId))
}

export function getTriggerRuleSummary(trigger) {
  if (!trigger?.match) {
    return 'Cualquier evento'
  }

  if (trigger.source === 'gift') {
    const parsedGift = parseGiftTriggerMatch(trigger.match)
    return parsedGift.giftName
      ? `${parsedGift.giftName} x${parsedGift.repeatCount || '1'}`
      : trigger.match
  }

  if (trigger.source === 'like-burst') {
    const likeThreshold = String(trigger.match).match(/\d+/)?.[0]
    return likeThreshold ? `${likeThreshold} likes` : trigger.match
  }

  return trigger.match
}

export { LOCAL_BRIDGE_DEFAULTS }
