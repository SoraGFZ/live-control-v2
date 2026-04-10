import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import {
  buildOverlayUrl,
  buildSongRequestUrl,
  buildSmartBarUrl,
  buildWebSocketUrl,
  createId,
  DEFAULT_APP_STATE,
  detectMediaKind,
  getActionCommandSummary,
  getOutputMeta,
  getTriggerLabel,
  isOverlayCapable,
  LOCAL_BRIDGE_DEFAULTS,
  mergeStateWithDefaults,
  normalizeBaseUrl,
  OUTPUT_OPTIONS,
  sanitizeSlug,
  truncateValue,
} from './live-control'

const APP_STORAGE_KEY = 'live-control-studio-cache-v4'
const DASHBOARD_KEY_STORAGE_KEY = 'live-control-dashboard-key-v1'

function getDesktopBridgeApi() {
  if (typeof window === 'undefined') {
    return null
  }

  const bridge = window.liveControlDesktop

  if (!bridge || typeof bridge.getContext !== 'function' || typeof bridge.startTikTokLogin !== 'function') {
    return null
  }

  return bridge
}

const DEFAULT_SERVER_STATUS = {
  server: {
    port: 5123,
    startedAt: null,
    stateFile: '',
    hasStaticBuild: false,
  },
  profile: DEFAULT_APP_STATE.profile,
  tikTok: {
    connected: false,
    connecting: false,
    username: '',
    roomId: '',
    lastError: '',
    lastConnectedAt: null,
    lastEventAt: null,
    authSessionEnabled: false,
    authenticateWs: false,
    giftCatalogCount: 0,
    giftCatalogSyncedAt: null,
    giftCatalogLastError: '',
    giftCatalogSourceUsername: '',
    emoteCatalogCount: 0,
    emoteCatalogSyncedAt: null,
    emoteCatalogLastError: '',
    emoteCatalogSourceUsername: '',
  },
  smartBar: {
    connected: false,
    sessionStartedAt: null,
    liveDurationMs: 0,
    followCount: 0,
    receivedCoins: 0,
    giftsReceived: 0,
  },
  music: {
    configured: false,
    enabled: false,
    provider: 'spotify',
    connected: false,
    accountLabel: '',
    accountProduct: '',
    devices: [],
    currentPlayback: null,
    queue: [],
    history: [],
    queueCount: 0,
    historyCount: 0,
    currentRequestId: '',
    selectedDeviceId: '',
    selectedDeviceName: '',
    cooldownSeconds: 0,
    cooldownUntil: null,
    lastError: '',
    lastSyncAt: null,
    commands: {
      play: '!play',
      skip: '!skip',
      remove: '!quitar',
    },
  },
  bridges: {
    dashboardClients: 0,
    overlayClients: 0,
    minecraftClients: 0,
    gtaClients: 0,
    minecraftRconConnected: false,
    minecraftRconError: '',
  },
  recentEvents: [],
  recentDispatches: [],
}

const VISUAL_TRIGGER_OPTIONS = [
  { id: 'gift', label: 'Gift', note: 'Regalos y combos del live.', token: 'GF' },
  { id: 'emote', label: 'Emote', note: 'Stickers y emotes del live.', token: 'EM' },
  { id: 'like-burst', label: 'Likes', note: 'Rafagas y metas de likes.', token: 'LK' },
  { id: 'follow', label: 'Follow', note: 'Nuevo seguidor en directo.', token: 'FW' },
  { id: 'comment', label: 'Chat', note: 'Comandos del chat y mensajes.', token: 'CH' },
  { id: 'share', label: 'Share', note: 'Cuando comparten el live.', token: 'SH' },
]

const EVENT_PLATFORM_OPTIONS = [
  { id: 'tiktok', label: 'TikTok', note: 'Disponible ahora', token: 'TT', disabled: false },
  { id: 'kick', label: 'Kick', note: 'Proximamente', token: 'KK', disabled: true },
]

const TRIGGER_AUDIENCE_OPTIONS = [
  { id: 'any', label: 'Todos', note: 'Cualquiera que participe en el live puede activarlo.' },
  { id: 'followers', label: 'Seguidores', note: 'Solo viewers que ya siguen tu canal.' },
  { id: 'subscribers', label: 'Suscriptores', note: 'Ideal para perks de subs y fan club.' },
  { id: 'moderators', label: 'Moderadores', note: 'Solo moderadores del directo.' },
  { id: 'super-fans', label: 'Super Fans', note: 'Fan club o usuarios destacados del live.' },
  { id: 'specific-users', label: 'Usuario especifico', note: 'Uno o varios usernames concretos.' },
]

const COMMENT_TRIGGER_OPTIONS = [
  {
    id: 'specific',
    label: 'Comentario exacto',
    note: 'Se activa solo si escriben ese comando o frase.',
  },
  {
    id: 'global',
    label: 'Comentario global',
    note: 'Cualquier comentario del chat puede disparar la accion.',
  },
]

const DEFAULT_TRIGGER_MATCHES = {
  gift: 'Rose x1',
  emote: 'Cualquier emote',
  follow: 'Cualquier follow',
  comment: '!chaos',
  share: 'Cualquier share',
  'like-burst': '100 likes',
}

const CURATED_GIFT_CATALOG = [
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

const GIFT_CARD_ACCENTS = ['#ff6f91', '#55e3d6', '#f3b348', '#74a7ff', '#ff8d6b', '#c28cff']

const CHAOSMOD_CATEGORY_ACCENTS = {
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

const GAME_SPOTLIGHT = {
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

const BEDROCK_BOX_CATEGORY_ACCENTS = {
  setup: '#7fd26b',
  fill: '#55e3d6',
  chaos: '#ff8a5b',
  defense: '#c28cff',
  utility: '#f3b348',
}

const BEDROCK_BOX_PRESETS = [
  {
    id: 'create_box',
    name: 'Crear arena',
    commandText: '/bedrock create',
    imageUrl: '/event-art/minecraft/llenarCubo.png',
    category: 'setup',
    note: 'Crea la Bedrock Box con el tamano configurado en el plugin.',
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
    note: 'Vacía el contenido de la Bedrock Box.',
  },
]

const WORKSPACE_SECTIONS = [
  {
    id: 'overview',
    label: 'Inicio',
    token: 'IN',
    description: 'Vista general, accesos rapidos y estado del proyecto.',
  },
  {
    id: 'live-ops',
    label: 'TikTok',
    token: 'TT',
    description: 'Conexion del live, gifts, emotes y backend.',
  },
  {
    id: 'games',
    label: 'Juegos',
    token: 'JG',
    description: 'GTA V, Minecraft y futuras integraciones.',
  },
  {
    id: 'music',
    label: 'Musica',
    token: 'MU',
    description: 'Spotify, comandos del chat y cola de canciones.',
  },
  {
    id: 'actions',
    label: 'Acciones y eventos',
    token: 'AC',
    description: 'Acciones, eventos del live y pruebas en una sola vista.',
  },
  {
    id: 'overlay',
    label: 'Overlay',
    token: 'OV',
    description: 'Links, smart bar, media local y widgets.',
  },
  {
    id: 'emotes',
    label: 'Emotes',
    token: 'EM',
    description: 'Biblioteca offline y emotes aprendidos desde el live.',
  },
  {
    id: 'bridges',
    label: 'Bridges',
    token: 'BR',
    description: 'Conexiones locales y estado tecnico del proyecto.',
  },
]

function getCurrentRoute() {
  if (typeof window === 'undefined') {
    return { kind: 'dashboard', slug: 'main-stage' }
  }

  const [first, second, third] = window.location.pathname.split('/').filter(Boolean)

  if (first === 'overlay' && third === 'smart-bar') {
    return { kind: 'smart-bar', slug: second || 'main-stage' }
  }

  if (first === 'overlay' && third === 'song-request') {
    return { kind: 'song-request', slug: second || 'main-stage' }
  }

  if (first === 'overlay') {
    return { kind: 'overlay', slug: second || 'main-stage' }
  }

  return { kind: 'dashboard', slug: 'main-stage' }
}

function readStoredState() {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_STATE
  }

  try {
    const rawState = window.localStorage.getItem(APP_STORAGE_KEY)
    return rawState ? mergeStateWithDefaults(JSON.parse(rawState)) : DEFAULT_APP_STATE
  } catch {
    return DEFAULT_APP_STATE
  }
}

function sanitizeStateForCache(state) {
  return {
    ...state,
    profile: {
      ...state.profile,
      dashboardKey: '',
      overlayKey: '',
      tiktokSessionId: '',
      tiktokTargetIdc: '',
    },
  }
}

function sanitizeStateForBackup(state) {
  return {
    ...mergeStateWithDefaults(state),
    profile: {
      ...state.profile,
      tiktokSessionId: '',
      tiktokTargetIdc: '',
    },
    integrations: {
      ...state.integrations,
      spotify: {
        ...(state.integrations?.spotify || {}),
        accessToken: '',
        refreshToken: '',
        expiresAt: 0,
        authState: '',
        lastError: '',
      },
    },
  }
}

function readStoredDashboardAccessKey() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.sessionStorage.getItem(DASHBOARD_KEY_STORAGE_KEY) || ''
}

function writeStoredDashboardAccessKey(value) {
  if (typeof window === 'undefined') {
    return
  }

  const normalizedValue = String(value || '').trim()

  if (normalizedValue) {
    window.sessionStorage.setItem(DASHBOARD_KEY_STORAGE_KEY, normalizedValue)
    return
  }

  window.sessionStorage.removeItem(DASHBOARD_KEY_STORAGE_KEY)
}

async function requestJson(url, options = {}, dashboardAccessKey = '') {
  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData
  const response = await fetch(url, {
    headers: {
      ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
      ...(dashboardAccessKey ? { 'X-Live-Control-Key': dashboardAccessKey } : {}),
      ...(options.headers || {}),
    },
    ...options,
  })

  const responseText = await response.text()
  let parsedBody = null

  try {
    parsedBody = responseText ? JSON.parse(responseText) : null
  } catch {
    parsedBody = null
  }

  if (!response.ok) {
    const requestError = new Error(
      parsedBody?.error || `Request fallo con status ${response.status}`,
    )
    requestError.status = response.status
    throw requestError
  }

  return parsedBody
}

function createSocketUrl(pathname, searchParams = {}) {
  if (typeof window === 'undefined') {
    return pathname
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socketUrl = new URL(`${protocol}//${window.location.host}${pathname}`)

  Object.entries(searchParams).forEach(([key, value]) => {
    if (!value) {
      return
    }

    socketUrl.searchParams.set(key, value)
  })

  return socketUrl.toString()
}

function readOverlayAccessKeyFromUrl() {
  if (typeof window === 'undefined') {
    return ''
  }

  return new URLSearchParams(window.location.search).get('key') || ''
}

function formatDateTime(value) {
  if (!value) {
    return 'Sin actividad'
  }

  return new Date(value).toLocaleString()
}

function formatDurationClock(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function getSmartBarGoalValue(smartBar) {
  const parsedGoal = Number.parseInt(String(smartBar?.winGoal || '0').replace(/[^\d]/g, ''), 10)
  return Number.isNaN(parsedGoal) || parsedGoal <= 0 ? 0 : parsedGoal
}

function buildSmartBarMetrics(smartBar, smartBarStatus, now) {
  const metrics = []

  if (smartBar.showCoins) {
    metrics.push({
      id: 'coins',
      label: 'Coins',
      value: String(smartBarStatus.receivedCoins || 0),
    })
  }

  if (smartBar.showFollows) {
    metrics.push({
      id: 'follows',
      label: 'Follows',
      value: String(smartBarStatus.followCount || 0),
    })
  }

  if (smartBar.showLiveDuration) {
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

function createActionDraft(action = null) {
  return {
    id: action?.id,
    name: action?.name || '',
    description: action?.description || '',
    outputs: action?.outputs?.length ? action.outputs : ['overlayAlert'],
    commandText: action?.commandText || '',
    minecraftMode: action?.minecraftMode || 'generic',
    minecraftBedrockPresetId: action?.minecraftBedrockPresetId || '',
    minecraftBedrockPresetName: action?.minecraftBedrockPresetName || '',
    gtaMode: action?.gtaMode || 'generic',
    gtaChaosEffectId: action?.gtaChaosEffectId || '',
    gtaChaosEffectName: action?.gtaChaosEffectName || '',
    overlayText: action?.overlayText || '',
    mediaUrl: action?.mediaUrl || '',
  }
}

function createEmoteDraft(emote = null) {
  return {
    id: emote?.id || '',
    name: emote?.name || '',
    imageUrl: emote?.imageUrl || emote?.emoteImageUrl || '',
    source: emote?.source || 'manual',
    sortOrder: emote?.sortOrder,
  }
}

function createTriggerDraft(trigger = null, actions = []) {
  return {
    id: trigger?.id,
    platform: trigger?.platform || 'tiktok',
    source: trigger?.source || 'gift',
    match: trigger?.match || DEFAULT_TRIGGER_MATCHES.gift,
    actionId: trigger?.actionId || actions[0]?.id || '',
    cooldownSeconds: String(trigger?.cooldownSeconds || '0'),
    audience: getTriggerAudienceValue(trigger),
    specificUsersText: stringifySpecificUsers(trigger?.specificUsers),
  }
}

function normalizePickerText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function buildGiftTriggerMatch(giftName, repeatCount = '1') {
  const normalizedGiftName = String(giftName || '').trim()
  const numericRepeatCount = Number.parseInt(String(repeatCount || '1').replace(/[^\d]/g, ''), 10)
  const safeRepeatCount = Number.isNaN(numericRepeatCount) || numericRepeatCount <= 0 ? 1 : numericRepeatCount

  if (!normalizedGiftName) {
    return ''
  }

  return `${normalizedGiftName} x${safeRepeatCount}`
}

function parseGiftTriggerMatch(rule) {
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

function normalizeUserHandle(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

function parseSpecificUsers(value) {
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

function stringifySpecificUsers(value) {
  return parseSpecificUsers(value).join(', ')
}

function getTriggerAudienceValue(trigger) {
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

function getTriggerAudienceMeta(audienceId) {
  return TRIGGER_AUDIENCE_OPTIONS.find((option) => option.id === audienceId) || TRIGGER_AUDIENCE_OPTIONS[0]
}

function getTriggerAudienceSummary(trigger) {
  const audience = getTriggerAudienceValue(trigger)

  if (audience === 'specific-users') {
    const specificUsers = parseSpecificUsers(trigger?.specificUsers)

    return specificUsers.length > 0 ? `Usuarios: ${specificUsers.join(', ')}` : 'Usuario especifico'
  }

  return getTriggerAudienceMeta(audience).label
}

function isGlobalCommentRule(match) {
  return [
    '',
    'cualquier comentario',
    'chat global',
    'comentario global',
    'any comment',
  ].includes(normalizePickerText(match))
}

function createKeywordToken(value, fallback = 'FX') {
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

function buildManualEmoteId(value) {
  const normalizedValue = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

  return normalizedValue ? `manual-${normalizedValue}` : `manual-${Date.now()}`
}

function normalizeRemoteAssetUrl(value) {
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

function normalizeGiftCatalogForPicker(gift, index = 0) {
  return {
    id: String(gift?.id || gift?.name || index),
    name: String(gift?.name || `Gift ${index + 1}`),
    coins: Number(gift?.coins || 0),
    imageUrl: normalizeRemoteAssetUrl(gift?.imageUrl || gift?.animatedImageUrl || ''),
    token: String(gift?.token || createKeywordToken(gift?.name, 'GF')),
    accent: String(gift?.accent || GIFT_CARD_ACCENTS[index % GIFT_CARD_ACCENTS.length]),
    tags: Array.isArray(gift?.tags) ? gift.tags : [],
  }
}

function normalizeEmoteCatalogForPicker(emote, index = 0) {
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

function getEmoteSourceLabel(source) {
  if (source === 'tiktok-live-connector') {
    return 'Live'
  }

  return 'Manual'
}

function getChaosModCardMeta(effect) {
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

function getBedrockBoxCardMeta(preset) {
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

function getStateRevision(state) {
  const numericValue = Number(state?.updatedAt || 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function getActionDetailLine(action) {
  if (action.overlayText) {
    return `Overlay: ${action.overlayText}`
  }

  if (action.mediaUrl) {
    return `Media: ${truncateValue(action.mediaUrl)}`
  }

  return action.description || 'Sin nota extra.'
}

function groupActionsByOutput(actions = [], outputId = '') {
  return actions.filter((action) => Array.isArray(action.outputs) && action.outputs.includes(outputId))
}

function getTriggerRuleSummary(trigger) {
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

function createDashboardStatePayload(state) {
  return {
    updatedAt: getStateRevision(state),
    profile: {
      ...state.profile,
      overlaySlug: sanitizeSlug(state.profile.overlaySlug),
      publicBaseUrl: normalizeBaseUrl(state.profile.publicBaseUrl),
      dashboardKey: String(state.profile.dashboardKey || '').trim(),
      overlayKey: String(state.profile.overlayKey || '').trim(),
    },
    music: state.music,
    actions: state.actions,
    triggers: state.triggers,
    widgets: state.widgets,
  }
}

function App() {
  const route = getCurrentRoute()

  if (route.kind === 'overlay') {
    return <OverlayScreen slug={route.slug} />
  }

  if (route.kind === 'smart-bar') {
    return <SmartBarScreen slug={route.slug} />
  }

  if (route.kind === 'song-request') {
    return <SongRequestScreen slug={route.slug} />
  }

  return <DashboardApp />
}

function DashboardApp() {
  const [appState, setAppState] = useState(() => readStoredState())
  const [showActionModal, setShowActionModal] = useState(false)
  const [editingActionId, setEditingActionId] = useState('')
  const [showEmoteModal, setShowEmoteModal] = useState(false)
  const [editingEmoteId, setEditingEmoteId] = useState('')
  const [showTriggerModal, setShowTriggerModal] = useState(false)
  const [editingTriggerId, setEditingTriggerId] = useState('')
  const [dashboardAccessKey, setDashboardAccessKey] = useState(() => readStoredDashboardAccessKey())
  const [dashboardAuthDraft, setDashboardAuthDraft] = useState(() => readStoredDashboardAccessKey())
  const [dashboardAuthError, setDashboardAuthError] = useState('')
  const [requiresDashboardAuth, setRequiresDashboardAuth] = useState(false)
  const [linkFeedback, setLinkFeedback] = useState('')
  const [mediaLibrary, setMediaLibrary] = useState([])
  const [mediaLibraryError, setMediaLibraryError] = useState('')
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [isSyncingGiftCatalog, setIsSyncingGiftCatalog] = useState(false)
  const [isSyncingEmoteCatalog, setIsSyncingEmoteCatalog] = useState(false)
  const [serverStatus, setServerStatus] = useState(DEFAULT_SERVER_STATUS)
  const [serverError, setServerError] = useState('')
  const [isHydrated, setIsHydrated] = useState(false)
  const [isSavingState, setIsSavingState] = useState(false)
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState('overview')
  const [tiktokUsernameDraft, setTiktokUsernameDraft] = useState('')
  const [desktopContext, setDesktopContext] = useState({
    isDesktopApp: false,
  })
  const [isImportingTikTokSession, setIsImportingTikTokSession] = useState(false)
  const [backupFeedback, setBackupFeedback] = useState('')
  const [isImportingBackup, setIsImportingBackup] = useState(false)
  const lastSyncedSnapshotRef = useRef('')
  const isMountedRef = useRef(true)
  const backupImportInputRef = useRef(null)
  const effectiveWorkspaceSection =
    activeWorkspaceSection === 'triggers' || activeWorkspaceSection === 'simulations'
      ? 'actions'
      : activeWorkspaceSection

  const syncDashboardAccessKey = useCallback((value) => {
    const normalizedValue = String(value || '').trim()
    writeStoredDashboardAccessKey(normalizedValue)
    setDashboardAccessKey(normalizedValue)
    setDashboardAuthDraft(normalizedValue)
  }, [])

  const handleDashboardUnauthorized = useCallback((message, preserveDraft = false) => {
    writeStoredDashboardAccessKey('')
    setDashboardAccessKey('')
    setRequiresDashboardAuth(true)
    setDashboardAuthError(message || 'Necesitas la clave del panel para continuar.')

    if (!preserveDraft) {
      setDashboardAuthDraft('')
    }
  }, [])

  const handleProtectedRequestError = useCallback((error, fallbackSetter) => {
    if (error?.status === 401) {
      handleDashboardUnauthorized(error.message)
      return true
    }

    fallbackSetter(error.message)
    return false
  }, [handleDashboardUnauthorized])

  const loadInitialState = useCallback(
    async (accessKey = dashboardAccessKey, preserveDraft = false) => {
      const cachedState = readStoredState()

      try {
        const [serverState, statusPayload, mediaPayload] = await Promise.all([
          requestJson('/api/state', {}, accessKey),
          requestJson('/api/status', {}, accessKey),
          requestJson('/api/media', {}, accessKey),
        ])
        const mergedServerState = mergeStateWithDefaults(serverState)
        const initialSnapshot = JSON.stringify(mergedServerState)
        const shouldPreferCachedState =
          getStateRevision(cachedState) > getStateRevision(mergedServerState)
        const preferredState = shouldPreferCachedState
          ? mergeStateWithDefaults({
              ...cachedState,
              profile: {
                ...cachedState.profile,
                dashboardKey: mergedServerState.profile.dashboardKey,
                overlayKey: mergedServerState.profile.overlayKey,
              },
              integrations: mergedServerState.integrations,
            })
          : mergedServerState

        if (!isMountedRef.current) {
          return
        }

        lastSyncedSnapshotRef.current = initialSnapshot
        setAppState(preferredState)
        setServerStatus(statusPayload)
        setMediaLibrary(mediaPayload)
        setTiktokUsernameDraft(preferredState.profile.tiktokUsername || '')
        setServerError('')
        setMediaLibraryError('')
        setDashboardAuthError('')
        setRequiresDashboardAuth(false)
        syncDashboardAccessKey(preferredState.profile.dashboardKey || accessKey)
      } catch (error) {
        if (!isMountedRef.current) {
          return
        }

        if (error?.status === 401) {
          handleDashboardUnauthorized(error.message, preserveDraft)
          return
        }
        lastSyncedSnapshotRef.current = JSON.stringify(cachedState)
        setAppState(cachedState)
        setTiktokUsernameDraft(cachedState.profile.tiktokUsername || '')
        setServerError(
          'No pude hablar con el backend. Ejecuta npm run dev para levantar toda la app.',
        )
        setMediaLibraryError('La biblioteca local necesita que el backend este corriendo.')
        setRequiresDashboardAuth(false)
      } finally {
        if (isMountedRef.current) {
          setIsHydrated(true)
        }
      }
    },
    [dashboardAccessKey, handleDashboardUnauthorized, syncDashboardAccessKey],
  )

  function updateDashboardState(updater) {
    setAppState((currentState) => {
      const nextState = typeof updater === 'function' ? updater(currentState) : updater

      return {
        ...nextState,
        updatedAt: Date.now(),
      }
    })
  }

  useEffect(() => {
    isMountedRef.current = true
    document.documentElement.dataset.route = 'dashboard'
    document.body.dataset.route = 'dashboard'

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const desktopBridge = getDesktopBridgeApi()

    if (!desktopBridge) {
      return undefined
    }

    let isCancelled = false

    desktopBridge
      .getContext()
      .then((context) => {
        if (!isCancelled) {
          setDesktopContext({
            isDesktopApp: Boolean(context?.isDesktopApp),
          })
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setDesktopContext({ isDesktopApp: false })
        }
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(sanitizeStateForCache(appState)))
  }, [appState])

  useEffect(() => {
    loadInitialState()
  }, [loadInitialState])

  useEffect(() => {
    if (!isHydrated || requiresDashboardAuth) {
      return undefined
    }

    const snapshot = JSON.stringify(appState)

    if (snapshot === lastSyncedSnapshotRef.current) {
      return undefined
    }

    const timeoutId = window.setTimeout(async () => {
      const payload = createDashboardStatePayload(appState)

      try {
        setIsSavingState(true)
        const savedState = await requestJson(
          '/api/state',
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          },
          dashboardAccessKey,
        )
        const savedSnapshot = JSON.stringify(savedState)
        lastSyncedSnapshotRef.current = savedSnapshot
        setServerError('')
        syncDashboardAccessKey(savedState.profile.dashboardKey)

        if (savedSnapshot !== snapshot) {
          setAppState(savedState)
        }
      } catch (error) {
        handleProtectedRequestError(error, setServerError)
      } finally {
        setIsSavingState(false)
      }
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [
    appState,
    dashboardAccessKey,
    handleProtectedRequestError,
    isHydrated,
    requiresDashboardAuth,
    syncDashboardAccessKey,
  ])

  useEffect(() => {
    if (!isHydrated || requiresDashboardAuth) {
      return undefined
    }

    function flushPendingState() {
      const snapshot = JSON.stringify(appState)

      if (snapshot === lastSyncedSnapshotRef.current) {
        return
      }

      const requestUrl = dashboardAccessKey
        ? `/api/state?key=${encodeURIComponent(dashboardAccessKey)}`
        : '/api/state'

      fetch(requestUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createDashboardStatePayload(appState)),
        keepalive: true,
      }).catch(() => {})
    }

    window.addEventListener('pagehide', flushPendingState)

    return () => {
      window.removeEventListener('pagehide', flushPendingState)
    }
  }, [appState, dashboardAccessKey, isHydrated, requiresDashboardAuth])

  useEffect(() => {
    if (!isHydrated || requiresDashboardAuth) {
      return undefined
    }

    let socket
    let reconnectTimeoutId
    let isStopped = false

    function connectSocket() {
      socket = new WebSocket(createSocketUrl('/ws/app', { key: dashboardAccessKey }))

      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data)

          if (payload.type === 'status') {
            setServerStatus(payload.payload)
            setServerError('')
          }
        } catch {
          return
        }
      }

      socket.onclose = () => {
        if (isStopped) {
          return
        }

        reconnectTimeoutId = window.setTimeout(connectSocket, 1500)
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    connectSocket()

    return () => {
      isStopped = true
      window.clearTimeout(reconnectTimeoutId)
      socket?.close()
    }
  }, [dashboardAccessKey, isHydrated, requiresDashboardAuth])

  const overlaySlug = sanitizeSlug(appState.profile.overlaySlug)
  const localBaseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const remoteBaseUrl = appState.profile.publicBaseUrl || localBaseUrl
  const localOverlayUrl = buildOverlayUrl(localBaseUrl, overlaySlug, appState.profile.overlayKey)
  const publicOverlayUrl = appState.profile.publicBaseUrl
    ? buildOverlayUrl(appState.profile.publicBaseUrl, overlaySlug, appState.profile.overlayKey)
    : ''
  const localSmartBarUrl = buildSmartBarUrl(localBaseUrl, overlaySlug, appState.profile.overlayKey)
  const publicSmartBarUrl = appState.profile.publicBaseUrl
    ? buildSmartBarUrl(appState.profile.publicBaseUrl, overlaySlug, appState.profile.overlayKey)
    : ''
  const localSongRequestUrl = buildSongRequestUrl(
    localBaseUrl,
    overlaySlug,
    appState.profile.overlayKey,
  )
  const publicSongRequestUrl = appState.profile.publicBaseUrl
    ? buildSongRequestUrl(appState.profile.publicBaseUrl, overlaySlug, appState.profile.overlayKey)
    : ''
  const preferredOverlayUrl = publicOverlayUrl || localOverlayUrl
  const chaosModCatalog = appState.integrations?.chaosmod?.catalog || []
  const tikTokGiftCatalog = Array.isArray(appState.integrations?.tiktok?.giftCatalog)
    ? appState.integrations.tiktok.giftCatalog
    : []
  const tikTokEmoteCatalog = Array.isArray(appState.integrations?.tiktok?.emoteCatalog)
    ? appState.integrations.tiktok.emoteCatalog
    : []
  const knownLiveUsers = Array.from(
    new Set(
      (serverStatus.recentEvents || [])
        .map((eventItem) => normalizeUserHandle(eventItem?.uniqueId || eventItem?.sourceLabel || ''))
        .filter(Boolean),
    ),
  ).slice(0, 40)
  const editingAction =
    appState.actions.find((action) => action.id === editingActionId) || null
  const editingEmote =
    tikTokEmoteCatalog.find((emote) => String(emote.id) === editingEmoteId) || null
  const editingTrigger =
    appState.triggers.find((trigger) => trigger.id === editingTriggerId) || null

  const readyOutputs = new Set()
  appState.actions.forEach((action) => action.outputs.forEach((output) => readyOutputs.add(output)))
  const workspaceSections = WORKSPACE_SECTIONS.map((section) => {
    if (section.id === 'overview') {
      return {
        ...section,
        meta: `${appState.actions.length} acciones · ${appState.triggers.length} triggers`,
      }
    }

    if (section.id === 'live-ops') {
      return {
        ...section,
        meta: serverStatus.tikTok.connected ? 'Live conectado' : 'Esperando live',
      }
    }

    if (section.id === 'games') {
      const gameActions = appState.actions.filter(
        (action) => action.outputs.includes('minecraft') || action.outputs.includes('gta'),
      ).length

      return {
        ...section,
        meta: `${gameActions} acciones de juego`,
      }
    }

    if (section.id === 'music') {
      return {
        ...section,
        meta: serverStatus.music.connected ? 'Spotify conectado' : 'Spotify opcional',
      }
    }

    if (section.id === 'actions') {
      return {
        ...section,
        meta: `${appState.actions.length} guardadas`,
      }
    }

    if (section.id === 'triggers') {
      return {
        ...section,
        meta: `${appState.triggers.length} activas`,
      }
    }

    if (section.id === 'overlay') {
      return {
        ...section,
        meta: serverStatus.bridges.overlayClients
          ? `${serverStatus.bridges.overlayClients} overlay activo`
          : 'Listo para LIVE Studio',
      }
    }

    if (section.id === 'emotes') {
      return {
        ...section,
        meta: `${tikTokEmoteCatalog.length} en catalogo`,
      }
    }

    if (section.id === 'simulations') {
      return {
        ...section,
        meta: 'Tests del backend',
      }
    }

    const totalBridgeClients = serverStatus.bridges.minecraftClients + serverStatus.bridges.gtaClients

    return {
      ...section,
      meta: totalBridgeClients ? `${totalBridgeClients} bridge activo` : 'Panel tecnico',
    }
  })

  function updateProfileField(field, value) {
    updateDashboardState((currentState) => ({
      ...currentState,
      profile: {
        ...currentState.profile,
        [field]:
          field === 'overlaySlug'
            ? sanitizeSlug(value)
            : field === 'publicBaseUrl'
              ? normalizeBaseUrl(value)
              : value,
      },
    }))
  }

  function updateMusicField(field, value) {
    updateDashboardState((currentState) => ({
      ...currentState,
      music: {
        ...currentState.music,
        [field]: typeof value === 'string' ? value : value,
      },
    }))
  }

  function updateSmartBarField(field, value) {
    updateDashboardState((currentState) => ({
      ...currentState,
      widgets: {
        ...currentState.widgets,
        smartBar: {
          ...currentState.widgets?.smartBar,
          [field]: value,
        },
      },
    }))
  }

  function adjustSmartBarWins(delta) {
    updateDashboardState((currentState) => {
      const currentWins = Number(currentState.widgets?.smartBar?.currentWins || 0)

      return {
        ...currentState,
        widgets: {
          ...currentState.widgets,
          smartBar: {
            ...currentState.widgets?.smartBar,
            currentWins: Math.max(0, currentWins + delta),
          },
        },
      }
    })
  }

  function resetSmartBarWins() {
    updateSmartBarField('currentWins', 0)
  }

  function addAction(actionDraft) {
    updateDashboardState((currentState) => ({
      ...currentState,
      actions: [{ ...actionDraft, id: createId('action') }, ...currentState.actions],
    }))
  }

  function updateAction(actionDraft) {
    updateDashboardState((currentState) => ({
      ...currentState,
      actions: currentState.actions.map((action) =>
        action.id === actionDraft.id ? { ...action, ...actionDraft } : action,
      ),
    }))
  }

  function addTrigger(triggerDraft) {
    updateDashboardState((currentState) => ({
      ...currentState,
      triggers: [{ ...triggerDraft, id: createId('trigger') }, ...currentState.triggers],
    }))
  }

  function updateTrigger(triggerDraft) {
    updateDashboardState((currentState) => ({
      ...currentState,
      triggers: currentState.triggers.map((trigger) =>
        trigger.id === triggerDraft.id ? { ...trigger, ...triggerDraft } : trigger,
      ),
    }))
  }

  function removeAction(actionId) {
    updateDashboardState((currentState) => ({
      ...currentState,
      actions: currentState.actions.filter((action) => action.id !== actionId),
      triggers: currentState.triggers.filter((trigger) => trigger.actionId !== actionId),
    }))
  }

  function removeTrigger(triggerId) {
    updateDashboardState((currentState) => ({
      ...currentState,
      triggers: currentState.triggers.filter((trigger) => trigger.id !== triggerId),
    }))
  }

  function openCreateActionModal() {
    setEditingActionId('')
    setShowActionModal(true)
  }

  function openCreateEmoteModal() {
    setEditingEmoteId('')
    setShowEmoteModal(true)
  }

  function openEditActionModal(actionId) {
    setEditingActionId(actionId)
    setShowActionModal(true)
  }

  function openEditEmoteModal(emoteId) {
    setEditingEmoteId(String(emoteId || ''))
    setShowEmoteModal(true)
  }

  function closeActionModal() {
    setShowActionModal(false)
    setEditingActionId('')
  }

  function closeEmoteModal() {
    setShowEmoteModal(false)
    setEditingEmoteId('')
  }

  function openCreateTriggerModal() {
    setEditingTriggerId('')
    setShowTriggerModal(true)
  }

  function openEditTriggerModal(triggerId) {
    setEditingTriggerId(triggerId)
    setShowTriggerModal(true)
  }

  function closeTriggerModal() {
    setShowTriggerModal(false)
    setEditingTriggerId('')
  }

  function scrollToSection(sectionId) {
    setActiveWorkspaceSection(sectionId)

    if (typeof window !== 'undefined') {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }
  }

  async function copyOverlayUrl() {
    try {
      await navigator.clipboard.writeText(preferredOverlayUrl)
      setLinkFeedback(publicOverlayUrl ? 'URL publica copiada' : 'URL local copiada')
    } catch {
      setLinkFeedback('No se pudo copiar')
    }

    window.setTimeout(() => setLinkFeedback(''), 1800)
  }

  async function copySmartBarUrl() {
    const targetUrl = publicSmartBarUrl || localSmartBarUrl

    try {
      await navigator.clipboard.writeText(targetUrl)
      setLinkFeedback(publicSmartBarUrl ? 'Smart bar publica copiada' : 'Smart bar local copiada')
    } catch {
      setLinkFeedback('No se pudo copiar')
    }

    window.setTimeout(() => setLinkFeedback(''), 1800)
  }

  async function copySongRequestUrl() {
    const targetUrl = publicSongRequestUrl || localSongRequestUrl

    try {
      await navigator.clipboard.writeText(targetUrl)
      setLinkFeedback(
        publicSongRequestUrl ? 'Widget de musica publico copiado' : 'Widget de musica local copiado',
      )
    } catch {
      setLinkFeedback('No se pudo copiar')
    }

    window.setTimeout(() => setLinkFeedback(''), 1800)
  }

  function openOverlayWindow() {
    window.open(localOverlayUrl, '_blank', 'noopener,noreferrer')
  }

  function openSmartBarWindow() {
    window.open(localSmartBarUrl, '_blank', 'noopener,noreferrer')
  }

  function openSongRequestWindow() {
    window.open(localSongRequestUrl, '_blank', 'noopener,noreferrer')
  }

  async function refreshMediaLibrary() {
    try {
      const mediaPayload = await requestJson('/api/media', {}, dashboardAccessKey)
      setMediaLibrary(mediaPayload)
      setMediaLibraryError('')
      return mediaPayload
    } catch (error) {
      handleProtectedRequestError(error, setMediaLibraryError)
      return []
    }
  }

  async function uploadMediaFile(file) {
    if (!file) {
      return null
    }

    const formData = new FormData()
    formData.append('file', file)

    try {
      setIsUploadingMedia(true)
      const response = await fetch('/api/media', {
        method: 'POST',
        headers: dashboardAccessKey ? { 'X-Live-Control-Key': dashboardAccessKey } : {},
        body: formData,
      })
      const responseText = await response.text()
      let parsedBody = null

      try {
        parsedBody = responseText ? JSON.parse(responseText) : null
      } catch {
        parsedBody = null
      }

      if (!response.ok) {
        const uploadError = new Error(parsedBody?.error || 'No se pudo subir el archivo.')
        uploadError.status = response.status
        throw uploadError
      }

      setMediaLibrary((currentLibrary) => [
        parsedBody,
        ...currentLibrary.filter((item) => item.fileName !== parsedBody.fileName),
      ])
      setMediaLibraryError('')
      return parsedBody
    } catch (error) {
      handleProtectedRequestError(error, setMediaLibraryError)
      return null
    } finally {
      setIsUploadingMedia(false)
    }
  }

  async function removeMediaFile(fileName) {
    try {
      await requestJson(
        `/api/media/${encodeURIComponent(fileName)}`,
        {
          method: 'DELETE',
        },
        dashboardAccessKey,
      )
      setMediaLibrary((currentLibrary) =>
        currentLibrary.filter((item) => item.fileName !== fileName),
      )
      setMediaLibraryError('')
    } catch (error) {
      handleProtectedRequestError(error, setMediaLibraryError)
    }
  }

  async function saveEmoteCatalogEntry(emoteDraft) {
    const nextDraft = {
      ...emoteDraft,
      id: String(emoteDraft.id || '').trim() || buildManualEmoteId(emoteDraft.name),
      name: String(emoteDraft.name || '').trim(),
      imageUrl: String(emoteDraft.imageUrl || '').trim(),
      source: emoteDraft.source || 'manual',
    }

    try {
      let integration = await requestJson(
        '/api/integrations/tiktok/emotes',
        {
          method: 'POST',
          body: JSON.stringify(nextDraft),
        },
        dashboardAccessKey,
      )

      if (editingEmote && editingEmote.id && editingEmote.id !== nextDraft.id) {
        integration = await requestJson(
          `/api/integrations/tiktok/emotes/${encodeURIComponent(editingEmote.id)}`,
          { method: 'DELETE' },
          dashboardAccessKey,
        )
      }

      updateDashboardState((currentState) => ({
        ...currentState,
        integrations: {
          ...currentState.integrations,
          tiktok: integration,
        },
      }))
      setServerError('')
      closeEmoteModal()
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function removeEmoteCatalogEntry(emoteId) {
    try {
      const integration = await requestJson(
        `/api/integrations/tiktok/emotes/${encodeURIComponent(emoteId)}`,
        {
          method: 'DELETE',
        },
        dashboardAccessKey,
      )
      updateDashboardState((currentState) => ({
        ...currentState,
        integrations: {
          ...currentState.integrations,
          tiktok: integration,
        },
      }))
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function previewAction(action) {
    try {
      await requestJson(
        `/api/actions/${action.id}/test`,
        {
          method: 'POST',
          body: JSON.stringify({
            userName: 'manual-preview',
            comment: `Preview manual para ${action.name}`,
          }),
        },
        dashboardAccessKey,
      )
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }

    scrollToSection('overlay')
  }

  async function runMinecraftPreset(preset) {
    try {
      const dispatchRecord = await requestJson(
        '/api/minecraft/test',
        {
          method: 'POST',
          body: JSON.stringify({
            name: preset?.name || 'Prueba Minecraft',
            description: preset?.note || '',
            commandText: preset?.commandText || '',
            minecraftMode: 'bedrock-box',
            minecraftBedrockPresetId: preset?.id || '',
            minecraftBedrockPresetName: preset?.name || '',
            userName: 'manual-minecraft',
            comment: `Prueba Bedrock Box: ${preset?.name || 'preset'}`,
          }),
        },
        dashboardAccessKey,
      )
      setServerError('')
      return dispatchRecord
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function testMinecraftChatMirror(payload = {}) {
    try {
      const dispatchRecord = await requestJson(
        '/api/minecraft/chat-mirror/test',
        {
          method: 'POST',
          body: JSON.stringify({
            userName: payload.userName || 'demo-chat',
            comment: payload.comment || 'Hola Minecraft, este mensaje salio desde el panel.',
          }),
        },
        dashboardAccessKey,
      )
      setServerError('')
      return dispatchRecord
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function connectSpotifyMusic() {
    try {
      const payload = await requestJson(
        '/api/music/spotify/connect',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )

      if (!payload?.authorizationUrl) {
        throw new Error('No pude generar la autorizacion de Spotify.')
      }

      const desktopBridge = getDesktopBridgeApi()

      if (desktopBridge && typeof desktopBridge.openExternal === 'function') {
        await desktopBridge.openExternal(payload.authorizationUrl)
        return
      }

      const popup = window.open(payload.authorizationUrl, '_blank', 'noopener,noreferrer')

      if (!popup) {
        window.location.href = payload.authorizationUrl
      }
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function disconnectSpotifyMusic() {
    try {
      await requestJson(
        '/api/music/spotify/disconnect',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function syncSpotifyMusic() {
    try {
      await requestJson(
        '/api/music/spotify/sync',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function testMusicPlayRequest(payload = {}) {
    try {
      await requestJson(
        '/api/music/test-play',
        {
          method: 'POST',
          body: JSON.stringify({
            userName: payload.userName || 'demo-chat',
            query: payload.query || '',
          }),
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function skipMusicTrack(payload = {}) {
    try {
      await requestJson(
        '/api/music/skip',
        {
          method: 'POST',
          body: JSON.stringify({
            userName: payload.userName || 'panel',
          }),
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function removeMusicRequest(requestId) {
    try {
      await requestJson(
        `/api/music/requests/${encodeURIComponent(requestId)}`,
        {
          method: 'DELETE',
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function clearMusicQueue() {
    try {
      await requestJson(
        '/api/music/queue/clear',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function clearMusicHistory() {
    try {
      await requestJson(
        '/api/music/history/clear',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function sendSampleEvent(sampleEvent, payloadOverrides = {}) {
    const payload =
      typeof sampleEvent === 'string'
        ? sampleEvent === 'follow'
          ? {
              type: 'follow',
              userName: 'demo-follow',
              ...payloadOverrides,
            }
          : sampleEvent === 'gift'
            ? {
                type: 'gift',
                userName: 'demo-gifter',
                giftName: 'Rose',
                repeatCount: 1,
                ...payloadOverrides,
              }
            : {
                type: 'comment',
                userName: 'demo-chat',
                comment: '!voz',
                ...payloadOverrides,
              }
        : sampleEvent

    try {
      await requestJson(
        '/api/events/test',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        dashboardAccessKey,
      )
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function connectTikTok() {
    try {
      const normalizedUsername =
        tiktokUsernameDraft.trim().replace(/^@/, '')
        || String(appState.profile.tiktokUsername || '').trim().replace(/^@/, '')
      await requestJson(
        '/api/tiktok/connect',
        {
          method: 'POST',
          body: JSON.stringify({
            username: normalizedUsername,
            sessionId: String(appState.profile.tiktokSessionId || '').trim(),
            ttTargetIdc: String(appState.profile.tiktokTargetIdc || '').trim(),
            authenticateWs: Boolean(appState.profile.tiktokAuthenticateWs),
          }),
        },
        dashboardAccessKey,
      )
      updateDashboardState((currentState) => ({
        ...currentState,
        profile: {
          ...currentState.profile,
          tiktokUsername: normalizedUsername,
        },
      }))
      setTiktokUsernameDraft(normalizedUsername)
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function disconnectTikTok() {
    try {
      const statusPayload = await requestJson(
        '/api/tiktok/disconnect',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      setServerStatus(statusPayload)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function importTikTokSessionFromDesktop() {
    const desktopBridge = getDesktopBridgeApi()

    if (!desktopBridge) {
      setServerError('El login embebido de TikTok solo esta disponible dentro de la app desktop.')
      return
    }

    try {
      setIsImportingTikTokSession(true)
      setServerError('')
      await desktopBridge.startTikTokLogin({
        authenticateWs: Boolean(appState.profile.tiktokAuthenticateWs),
      })
      await loadInitialState(dashboardAccessKey, true)
    } catch (error) {
      setServerError(error?.message || 'No pude importar la sesion de TikTok desde la app desktop.')
    } finally {
      setIsImportingTikTokSession(false)
    }
  }

  function exportConfigurationBackup() {
    try {
      const backupPayload = {
        schema: 'live-control-backup-v1',
        exportedAt: new Date().toISOString(),
        state: sanitizeStateForBackup(appState),
      }
      const blob = new Blob([`${JSON.stringify(backupPayload, null, 2)}\n`], {
        type: 'application/json',
      })
      const objectUrl = window.URL.createObjectURL(blob)
      const downloadLink = document.createElement('a')
      const timeStamp = new Date().toISOString().replace(/[:.]/g, '-')

      downloadLink.href = objectUrl
      downloadLink.download = `live-control-backup-${timeStamp}.json`
      document.body.appendChild(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      window.URL.revokeObjectURL(objectUrl)
      setBackupFeedback('Backup exportado. El archivo incluye tu configuracion, acciones, eventos y catalogos aprendidos.')
    } catch (error) {
      setBackupFeedback(error?.message || 'No pude exportar el backup de esta app.')
    }
  }

  function openBackupImportPicker() {
    backupImportInputRef.current?.click()
  }

  async function handleBackupImport(event) {
    const selectedFile = event.target.files?.[0]

    if (!selectedFile) {
      return
    }

    try {
      setIsImportingBackup(true)
      setBackupFeedback('')
      const fileContents = await selectedFile.text()
      const parsedPayload = JSON.parse(fileContents)
      const importedState = mergeStateWithDefaults(parsedPayload?.state || parsedPayload || {})
      const savedState = await requestJson(
        '/api/state/import',
        {
          method: 'POST',
          body: JSON.stringify(importedState),
        },
        dashboardAccessKey,
      )

      setAppState(savedState)
      await loadInitialState(dashboardAccessKey, true)
      setBackupFeedback(`Backup importado desde ${selectedFile.name}.`)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      setBackupFeedback(error?.message || 'No pude importar ese backup. Revisa que sea un JSON valido de Live Control.')
    } finally {
      event.target.value = ''
      setIsImportingBackup(false)
    }
  }

  async function quickConnectTikTokFromHeader() {
    const normalizedUsername =
      tiktokUsernameDraft.trim().replace(/^@/, '')
      || String(appState.profile.tiktokUsername || '').trim().replace(/^@/, '')

    if (serverStatus.tikTok.connected || serverStatus.tikTok.connecting) {
      scrollToSection('live-ops')
      return
    }

    if (!normalizedUsername) {
      scrollToSection('live-ops')
      return
    }

    await connectTikTok()
  }

  async function syncTikTokGiftCatalog() {
    try {
      setIsSyncingGiftCatalog(true)
      await requestJson(
        '/api/tiktok/gifts/sync',
        {
          method: 'POST',
          body: JSON.stringify({
            username: tiktokUsernameDraft.trim().replace(/^@/, ''),
            sessionId: String(appState.profile.tiktokSessionId || '').trim(),
            ttTargetIdc: String(appState.profile.tiktokTargetIdc || '').trim(),
            authenticateWs: Boolean(appState.profile.tiktokAuthenticateWs),
          }),
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    } finally {
      setIsSyncingGiftCatalog(false)
    }
  }

  async function syncTikTokEmoteCatalog() {
    try {
      setIsSyncingEmoteCatalog(true)
      await requestJson(
        '/api/tiktok/emotes/sync',
        {
          method: 'POST',
          body: JSON.stringify({
            username: tiktokUsernameDraft.trim().replace(/^@/, ''),
          }),
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    } finally {
      setIsSyncingEmoteCatalog(false)
    }
  }

  async function unlockDashboard() {
    const nextKey = dashboardAuthDraft.trim()
    writeStoredDashboardAccessKey(nextKey)
    setDashboardAccessKey(nextKey)
    setDashboardAuthError('')
    setIsHydrated(false)
    await loadInitialState(nextKey, true)
  }

  if (!isHydrated) {
    return <DashboardBootScreen />
  }

  if (requiresDashboardAuth) {
    return (
      <DashboardAccessGate
        dashboardAuthDraft={dashboardAuthDraft}
        dashboardAuthError={dashboardAuthError}
        onChangeDraft={setDashboardAuthDraft}
        onUnlock={unlockDashboard}
      />
    )
  }

  let renderedWorkspace = (
    <OverviewSection
      actionCount={appState.actions.length}
      backupFeedback={backupFeedback}
      bridgePort={serverStatus.server.port}
      isDesktopApp={desktopContext.isDesktopApp}
      isImportingBackup={isImportingBackup}
      onCreateAction={openCreateActionModal}
      onCreateTrigger={openCreateTriggerModal}
      onExportBackup={exportConfigurationBackup}
      onImportBackup={openBackupImportPicker}
      overlayUrl={preferredOverlayUrl}
      readyOutputCount={readyOutputs.size}
      serverError={serverError}
      serverStatus={serverStatus}
      triggerCount={appState.triggers.length}
    />
  )

  if (effectiveWorkspaceSection === 'live-ops') {
    renderedWorkspace = (
      <LiveOpsSection
        emoteCatalogCount={tikTokEmoteCatalog.length}
        isSyncingEmoteCatalog={isSyncingEmoteCatalog}
        isSyncingGiftCatalog={isSyncingGiftCatalog}
        isSavingState={isSavingState}
        onConnectTikTok={connectTikTok}
        onImportTikTokSessionFromDesktop={importTikTokSessionFromDesktop}
        onDisconnectTikTok={disconnectTikTok}
        onSyncTikTokEmoteCatalog={syncTikTokEmoteCatalog}
        onSyncTikTokGiftCatalog={syncTikTokGiftCatalog}
        isDesktopApp={desktopContext.isDesktopApp}
        isImportingTikTokSession={isImportingTikTokSession}
        profile={appState.profile}
        serverError={serverError}
        serverStatus={serverStatus}
        setTiktokUsernameDraft={setTiktokUsernameDraft}
        tiktokUsernameDraft={tiktokUsernameDraft}
        updateProfileField={updateProfileField}
      />
    )
  } else if (effectiveWorkspaceSection === 'games') {
    renderedWorkspace = (
      <GamesSection
        actions={appState.actions}
        chaosModCatalog={chaosModCatalog}
        chaosModSourcePath={appState.integrations?.chaosmod?.sourcePath || ''}
        onJump={scrollToSection}
        onPreviewAction={previewAction}
        onRunMinecraftPreset={runMinecraftPreset}
        onTestMinecraftChatMirror={testMinecraftChatMirror}
        profile={appState.profile}
        serverStatus={serverStatus}
        triggers={appState.triggers}
        updateProfileField={updateProfileField}
      />
    )
  } else if (effectiveWorkspaceSection === 'music') {
    renderedWorkspace = (
      <MusicSection
        localSongRequestUrl={localSongRequestUrl}
        music={appState.music}
        musicStatus={serverStatus.music}
        onClearHistory={clearMusicHistory}
        onClearQueue={clearMusicQueue}
        onConnectSpotify={connectSpotifyMusic}
        onCopySongRequestUrl={copySongRequestUrl}
        onDisconnectSpotify={disconnectSpotifyMusic}
        onOpenSongRequestWindow={openSongRequestWindow}
        onSkipTrack={skipMusicTrack}
        onSyncSpotify={syncSpotifyMusic}
        onTestPlayRequest={testMusicPlayRequest}
        onRemoveRequest={removeMusicRequest}
        publicSongRequestUrl={publicSongRequestUrl}
        updateMusicField={updateMusicField}
      />
    )
  } else if (effectiveWorkspaceSection === 'emotes') {
    renderedWorkspace = (
      <EmoteLibrarySection
        emoteCatalog={tikTokEmoteCatalog}
        onCreateEmote={openCreateEmoteModal}
        onEditEmote={openEditEmoteModal}
        onRemoveEmote={removeEmoteCatalogEntry}
      />
    )
  } else if (effectiveWorkspaceSection === 'actions') {
    renderedWorkspace = (
      <div className="workspace-stage-stack">
        <ActionsSection
          actions={appState.actions}
          onCreateAction={openCreateActionModal}
          onEditAction={openEditActionModal}
          onPreviewAction={previewAction}
          onRemoveAction={removeAction}
        />
        <TriggersSection
          actions={appState.actions}
          emoteCatalog={tikTokEmoteCatalog}
          giftCatalog={tikTokGiftCatalog}
          onCreateTrigger={openCreateTriggerModal}
          onEditTrigger={openEditTriggerModal}
          onRemoveTrigger={removeTrigger}
          title="Eventos del live"
          triggers={appState.triggers}
        />
        <SimulationsSection
          emoteCatalog={tikTokEmoteCatalog}
          giftCatalog={tikTokGiftCatalog}
          onSampleEvent={sendSampleEvent}
          title="Pruebas rapidas"
        />
      </div>
    )
  } else if (effectiveWorkspaceSection === 'overlay') {
    renderedWorkspace = (
      <OverlaySection
        linkFeedback={linkFeedback}
        localSmartBarUrl={localSmartBarUrl}
        mediaLibrary={mediaLibrary}
        mediaLibraryError={mediaLibraryError}
        onAdjustSmartBarWins={adjustSmartBarWins}
        onCopySmartBarUrl={copySmartBarUrl}
        onDeleteMedia={removeMediaFile}
        onCopyOverlayUrl={copyOverlayUrl}
        onOpenOverlayWindow={openOverlayWindow}
        onOpenSmartBarWindow={openSmartBarWindow}
        onRefreshMedia={refreshMediaLibrary}
        onResetSmartBarWins={resetSmartBarWins}
        onUploadMedia={uploadMediaFile}
        localOverlayUrl={localOverlayUrl}
        publicOverlayUrl={publicOverlayUrl}
        publicSmartBarUrl={publicSmartBarUrl}
        profile={appState.profile}
        serverPort={serverStatus.server.port}
        serverStatus={serverStatus}
        smartBar={appState.widgets?.smartBar || {}}
        updateSmartBarField={updateSmartBarField}
        updateProfileField={updateProfileField}
        isUploadingMedia={isUploadingMedia}
      />
    )
  } else if (effectiveWorkspaceSection === 'bridges') {
    renderedWorkspace = (
      <BridgesSection
        dashboardKey={appState.profile.dashboardKey}
        remoteBaseUrl={remoteBaseUrl}
        serverStatus={serverStatus}
        chaosModCatalog={chaosModCatalog}
        chaosModSourcePath={appState.integrations?.chaosmod?.sourcePath || ''}
      />
    )
  }

  return (
    <div className="app-shell">
      <Sidebar activeSection={effectiveWorkspaceSection} onJump={scrollToSection} />

      <main className="main-panel">
        <WorkspaceHeader
          activeSection={effectiveWorkspaceSection}
          onCreateAction={openCreateActionModal}
          onCreateTrigger={openCreateTriggerModal}
          onQuickConnectTikTok={quickConnectTikTokFromHeader}
          onSelectSection={scrollToSection}
          overlayUrl={preferredOverlayUrl}
          tikTokStatus={serverStatus.tikTok}
          tikTokUsername={
            tiktokUsernameDraft.trim().replace(/^@/, '')
            || String(appState.profile.tiktokUsername || '').trim().replace(/^@/, '')
          }
        />

        <WorkspaceLauncher
          activeSection={effectiveWorkspaceSection}
          onSelectSection={scrollToSection}
          sections={workspaceSections}
        />

        <div className="workspace-stage">
          {renderedWorkspace}
        </div>
      </main>

      <input
        ref={backupImportInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only-input"
        onChange={handleBackupImport}
      />

      {showActionModal ? (
        <ActionModal
          chaosModCatalog={chaosModCatalog}
          initialAction={editingAction}
          isUploadingMedia={isUploadingMedia}
          mediaLibrary={mediaLibrary}
          mediaLibraryError={mediaLibraryError}
          onClose={closeActionModal}
          onSave={(actionDraft) => {
            if (actionDraft.id) {
              updateAction(actionDraft)
            } else {
              addAction(actionDraft)
            }

            closeActionModal()
          }}
          onUploadMedia={uploadMediaFile}
        />
      ) : null}

      {showEmoteModal ? (
        <EmoteCatalogModal
          initialEmote={editingEmote}
          isUploadingMedia={isUploadingMedia}
          onClose={closeEmoteModal}
          onSave={saveEmoteCatalogEntry}
          onUploadMedia={uploadMediaFile}
        />
      ) : null}

      {showTriggerModal ? (
        <TriggerModal
          key={editingTrigger?.id || 'new-trigger'}
          actions={appState.actions}
          emoteCatalog={tikTokEmoteCatalog}
          giftCatalog={tikTokGiftCatalog}
          initialTrigger={editingTrigger}
          knownUsers={knownLiveUsers}
          onClose={closeTriggerModal}
          onSave={(triggerDraft) => {
            if (triggerDraft.id) {
              updateTrigger(triggerDraft)
            } else {
              addTrigger(triggerDraft)
            }

            closeTriggerModal()
          }}
        />
      ) : null}
    </div>
  )
}

function DashboardBootScreen() {
  return (
    <div className="auth-shell">
      <article className="auth-card">
        <span className="eyebrow">Cargando panel</span>
        <h1>Un segundo, ya te muestro todo.</h1>
        <p>Estoy trayendo la configuracion guardada, el estado del backend y las claves del panel.</p>
      </article>
    </div>
  )
}

function DashboardAccessGate({
  dashboardAuthDraft,
  dashboardAuthError,
  onChangeDraft,
  onUnlock,
}) {
  return (
    <div className="auth-shell">
      <article className="auth-card">
        <span className="eyebrow">Panel protegido</span>
        <h1>Ingresa la clave del panel.</h1>
        <p>
          Esta clave protege el panel, las APIs y los sockets internos cuando lo publicas con una
          URL real.
        </p>

        <label className="field-label" htmlFor="dashboard-access-key">
          Clave del panel
        </label>
        <input
          id="dashboard-access-key"
          type="password"
          className="text-field"
          placeholder="Tu clave actual"
          value={dashboardAuthDraft}
          onChange={(event) => onChangeDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onUnlock()
            }
          }}
        />

        {dashboardAuthError ? <div className="error-box">{dashboardAuthError}</div> : null}

        <div className="card-actions">
          <button className="primary-button" onClick={onUnlock}>
            Desbloquear panel
          </button>
        </div>
      </article>
    </div>
  )
}

function Sidebar({ activeSection, onJump }) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <span className="brand-kicker">TikTok Live x Games</span>
        <div className="brand-title">Live Control</div>
        <p className="brand-copy">Abre cada modulo solo cuando lo necesites y trabaja mas limpio en vivo.</p>
      </div>

      <nav className="sidebar-nav" aria-label="Secciones del panel">
        {WORKSPACE_SECTIONS.map((section) => (
          <button
            key={section.id}
            className={`nav-button ${activeSection === section.id ? 'active' : ''}`}
            onClick={() => onJump(section.id)}
          >
            <span>{section.label}</span>
            <small>{section.token}</small>
          </button>
        ))}
      </nav>
    </aside>
  )
}

function WorkspaceHeader({
  activeSection,
  onCreateAction,
  onCreateTrigger,
  onQuickConnectTikTok,
  onSelectSection,
  overlayUrl,
  tikTokStatus,
  tikTokUsername,
}) {
  const currentSection =
    WORKSPACE_SECTIONS.find((section) => section.id === activeSection) || WORKSPACE_SECTIONS[0]
  const liveButtonLabel = tikTokStatus?.connected
    ? tikTokStatus?.username
      ? `TikTok @${tikTokStatus.username}`
      : 'Live conectado'
    : tikTokStatus?.connecting
      ? 'Conectando live...'
      : tikTokUsername
        ? `Conectar @${tikTokUsername}`
        : 'Conectar live'

  return (
    <section className="workspace-header">
      <div className="workspace-header-top">
        <button
          className={`live-connect-button ${tikTokStatus?.connected ? 'connected' : tikTokStatus?.connecting ? 'connecting' : ''}`}
          onClick={onQuickConnectTikTok}
        >
          {liveButtonLabel}
        </button>
        <span
          className={`status-chip ${tikTokStatus?.connected ? 'ok' : tikTokStatus?.connecting ? 'warn' : 'off'}`}
        >
          {tikTokStatus?.connected
            ? 'LIVE conectado'
            : tikTokStatus?.connecting
              ? 'Conectando'
              : 'LIVE apagado'}
        </span>
      </div>

      <div className="workspace-header-main">
        <div className="workspace-header-copy">
          <span className="eyebrow">Workspace</span>
          <h1>{currentSection.label}</h1>
          <p>
            {activeSection === 'overview'
              ? 'Tu panel ya tiene varias piezas fuertes. Desde aqui eliges el modulo que quieras usar y trabajas mas limpio.'
              : currentSection.description}
          </p>
        </div>

        <div className="workspace-header-actions">
          {activeSection !== 'overview' ? (
            <button type="button" className="ghost-button" onClick={() => onSelectSection('overview')}>
              Volver al inicio
            </button>
          ) : null}
          <button type="button" className="secondary-button" onClick={onCreateTrigger}>
            Nuevo evento
          </button>
          <button type="button" className="primary-button" onClick={onCreateAction}>
            Nueva accion
          </button>
        </div>
      </div>

      <div className="workspace-header-link">
        <span className="snippet-label">Overlay principal</span>
        <code className="overlay-link">{overlayUrl}</code>
      </div>
    </section>
  )
}

function WorkspaceLauncher() {
  return null
}

function HeroPanel({ overlayUrl, onCreateAction, onCreateTrigger }) {
  return (
    <section className="hero-panel" id="overview">
      <div className="hero-copy">
        <span className="eyebrow">Panel principal</span>
        <h1>Acciones, eventos y overlay en un solo lugar.</h1>
        <p className="hero-text">
          Conecta tu live, arma reglas y prueba todo desde aqui sin perderte entre ventanas.
        </p>

        <div className="hero-actions">
          <button className="primary-button" onClick={onCreateAction}>
            Nueva accion
          </button>
          <button className="secondary-button" onClick={onCreateTrigger}>
            Nuevo evento
          </button>
        </div>
      </div>

      <div className="hero-stack">
        <article className="signal-card">
          <span className="signal-label">Flujo</span>
          <div className="signal-flow">
            <span>TikTok Live</span>
            <span>Evento</span>
            <span>Accion</span>
            <span>Juego / Overlay</span>
          </div>
          <p>Entra un evento, se revisa la regla y se despacha la accion al overlay o al juego.</p>
        </article>

        <article className="signal-card">
          <span className="signal-label">Overlay</span>
          <code>{overlayUrl}</code>
          <p>Ese link es el que usas para probar alertas o pegar el widget en LIVE Studio.</p>
        </article>
      </div>
    </section>
  )
}

function LiveOpsSection({
  emoteCatalogCount,
  isDesktopApp,
  isImportingTikTokSession,
  isSyncingEmoteCatalog,
  isSyncingGiftCatalog,
  isSavingState,
  onConnectTikTok,
  onImportTikTokSessionFromDesktop,
  onDisconnectTikTok,
  onSyncTikTokEmoteCatalog,
  onSyncTikTokGiftCatalog,
  profile,
  serverError,
  serverStatus,
  setTiktokUsernameDraft,
  tiktokUsernameDraft,
  updateProfileField,
}) {
  return (
    <section className="panel-section" id="live-ops">
      <SectionHeader
        eyebrow="Operacion en vivo"
        title="TikTok y backend"
        description="Conecta tu usuario, revisa si entran eventos y confirma que el backend sigue respondiendo."
      />

      <div className="ops-grid">
        <article className="surface-card ops-card">
          <div className="card-top">
            <div>
              <h3>TikTok LIVE</h3>
              <p>Conecta por username y deja que el backend escuche follows, gifts, emotes, comentarios y likes.</p>
            </div>
            <span className={`status-chip ${serverStatus.tikTok.connected ? 'ok' : serverStatus.tikTok.connecting ? 'warn' : 'off'}`}>
              {serverStatus.tikTok.connected
                ? 'Conectado'
                : serverStatus.tikTok.connecting
                  ? 'Conectando'
                  : 'Desconectado'}
            </span>
          </div>

          <label className="field-label" htmlFor="tiktok-username">
            Username del live
          </label>
          <input
            id="tiktok-username"
            className="text-field"
            placeholder="Ej: tu_usuario"
            value={tiktokUsernameDraft}
            onChange={(event) => setTiktokUsernameDraft(event.target.value)}
          />

          <label className="field-label" htmlFor="tiktok-session-id">
            sessionid de TikTok
          </label>
          <input
            id="tiktok-session-id"
            type="password"
            className="text-field"
            placeholder="Opcional. Mejora acceso a datos autenticados."
            value={profile.tiktokSessionId || ''}
            onChange={(event) => updateProfileField('tiktokSessionId', event.target.value)}
          />

          <label className="field-label" htmlFor="tiktok-target-idc">
            tt-target-idc
          </label>
          <input
            id="tiktok-target-idc"
            className="text-field"
            placeholder="Opcional. Debe venir junto con sessionid."
            value={profile.tiktokTargetIdc || ''}
            onChange={(event) => updateProfileField('tiktokTargetIdc', event.target.value)}
          />

          <label className="option-card">
            <input
              type="checkbox"
              checked={Boolean(profile.tiktokAuthenticateWs)}
              onChange={(event) => updateProfileField('tiktokAuthenticateWs', event.target.checked)}
            />
            <div>
              <strong>Autenticar websocket con la sesion</strong>
              <span>Puede ayudar con emotes, roles y datos extra del live. Activalo solo si vas a usar tus cookies.</span>
            </div>
          </label>

          <div className="card-actions">
            <button className="primary-button" onClick={onConnectTikTok}>
              Conectar live
            </button>
            {isDesktopApp ? (
              <button className="secondary-button" onClick={onImportTikTokSessionFromDesktop}>
                {isImportingTikTokSession ? 'Abriendo login de TikTok...' : 'Iniciar sesion con TikTok'}
              </button>
            ) : null}
            <button className="secondary-button" onClick={onSyncTikTokGiftCatalog}>
              {isSyncingGiftCatalog ? 'Sincronizando gifts...' : 'Sincronizar gifts'}
            </button>
            <button className="secondary-button" onClick={onSyncTikTokEmoteCatalog}>
              {isSyncingEmoteCatalog ? 'Revisando emotes...' : 'Sincronizar emotes'}
            </button>
            <button className="ghost-button" onClick={onDisconnectTikTok}>
              Desconectar
            </button>
          </div>

          <div className="mini-grid">
            <div>
              <span className="snippet-label">Room ID</span>
              <p>{serverStatus.tikTok.roomId || 'Esperando conexion'}</p>
            </div>
            <div>
              <span className="snippet-label">Ultima conexion</span>
              <p>{formatDateTime(serverStatus.tikTok.lastConnectedAt)}</p>
            </div>
            <div>
              <span className="snippet-label">Catalogo de gifts</span>
              <p>{serverStatus.tikTok.giftCatalogCount || 0} regalos</p>
            </div>
            <div>
              <span className="snippet-label">Emotes vistos</span>
              <p>{serverStatus.tikTok.emoteCatalogCount || emoteCatalogCount || 0} emotes</p>
            </div>
            <div>
              <span className="snippet-label">Ultima sincronizacion</span>
              <p>{formatDateTime(serverStatus.tikTok.giftCatalogSyncedAt)}</p>
            </div>
            <div>
              <span className="snippet-label">Ultimo emote nuevo</span>
              <p>{formatDateTime(serverStatus.tikTok.emoteCatalogSyncedAt)}</p>
            </div>
            <div>
              <span className="snippet-label">Sesion autenticada</span>
              <p>{serverStatus.tikTok.authSessionEnabled ? 'Lista' : 'No configurada'}</p>
            </div>
            <div>
              <span className="snippet-label">WebSocket auth</span>
              <p>{serverStatus.tikTok.authenticateWs ? 'Activado' : 'Normal'}</p>
            </div>
          </div>

          <p className="support-copy">
            Si pegas `sessionid` y `tt-target-idc`, el conector intenta entrar con tu sesion de TikTok y suele devolver mas contexto del live. Ambos valores son sensibles.
          </p>
          <p className="support-copy">
            Con esa sesion hoy podemos sacar mejor contexto del live, roles de usuario, gifts y completar emotes cuando TikTok los manda. El boton de emotes vuelve a revisar todo lo que ya entro al backend; no existe un catalogo completo offline como el de gifts.
          </p>
          {isDesktopApp ? (
            <p className="support-copy">
              En la beta desktop puedes usar `Iniciar sesion con TikTok` y la app intentara guardar esas cookies por ti para no copiarlas a mano.
            </p>
          ) : null}

          {serverStatus.tikTok.lastError ? (
            <div className="error-box">{serverStatus.tikTok.lastError}</div>
          ) : null}
          {serverStatus.tikTok.giftCatalogLastError ? (
            <div className="error-box">{serverStatus.tikTok.giftCatalogLastError}</div>
          ) : null}
          {serverStatus.tikTok.emoteCatalogLastError ? (
            <div className="error-box">{serverStatus.tikTok.emoteCatalogLastError}</div>
          ) : null}
        </article>

        <article className="surface-card ops-card">
          <div className="card-top">
            <div>
              <h3>Backend local</h3>
              <p>Este proceso guarda la configuracion y reparte eventos a overlay, panel y juegos.</p>
            </div>
            <span className={`status-chip ${serverError ? 'warn' : 'ok'}`}>
              {serverError ? 'Atencion' : 'Activo'}
            </span>
          </div>

          <div className="mini-grid">
            <div>
              <span className="snippet-label">Puerto activo</span>
              <p>{serverStatus.server.port}</p>
            </div>
            <div>
              <span className="snippet-label">Guardado</span>
              <p>{isSavingState ? 'Sincronizando...' : 'Al dia'}</p>
            </div>
            <div>
              <span className="snippet-label">Overlay clients</span>
              <p>{serverStatus.bridges.overlayClients}</p>
            </div>
            <div>
              <span className="snippet-label">Dashboard clients</span>
              <p>{serverStatus.bridges.dashboardClients}</p>
            </div>
          </div>

          {serverError ? <div className="error-box">{serverError}</div> : null}
        </article>

        <article className="surface-card ops-card">
          <h3>Ultimos eventos del live</h3>
          <div className="event-log">
            {serverStatus.recentEvents.length === 0 ? (
              <p className="support-copy">Todavia no llegaron eventos al backend.</p>
            ) : (
              serverStatus.recentEvents.map((eventItem) => (
                <div key={eventItem.id} className="event-item">
                  <span className="trigger-type">{eventItem.type}</span>
                  <strong>{eventItem.summary}</strong>
                  <span>{formatDateTime(eventItem.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="surface-card ops-card">
          <h3>Acciones despachadas</h3>
          <div className="event-log">
            {serverStatus.recentDispatches.length === 0 ? (
              <p className="support-copy">Todavia no se disparo ninguna accion real.</p>
            ) : (
              serverStatus.recentDispatches.map((dispatchItem) => (
                <div key={dispatchItem.id} className="event-item">
                  <span className="bridge-badge">{dispatchItem.reason}</span>
                  <strong>{dispatchItem.actionName}</strong>
                  <span>{formatDateTime(dispatchItem.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  )
}

function MetricRow({ actionCount, bridgePort, readyOutputCount, triggerCount }) {
  return (
    <section className="metric-grid">
      <article className="metric-card">
        <span className="metric-label">Acciones</span>
        <strong>{actionCount}</strong>
        <p>Tu biblioteca de respuestas para el live.</p>
      </article>
      <article className="metric-card">
        <span className="metric-label">Eventos</span>
        <strong>{triggerCount}</strong>
        <p>Reglas activas entre el live y tus acciones.</p>
      </article>
      <article className="metric-card">
        <span className="metric-label">Salidas</span>
        <strong>{readyOutputCount}</strong>
        <p>Overlay, audio y juegos listos para usar.</p>
      </article>
      <article className="metric-card">
        <span className="metric-label">Puerto del backend</span>
        <strong>{bridgePort}</strong>
        <p>Donde esta corriendo el backend ahora mismo.</p>
      </article>
    </section>
  )
}

function GamesSection({
  actions,
  chaosModCatalog,
  chaosModSourcePath,
  onJump,
  onPreviewAction,
  onRunMinecraftPreset,
  onTestMinecraftChatMirror,
  profile,
  serverStatus,
  triggers,
  updateProfileField,
}) {
  const minecraftActions = groupActionsByOutput(actions, 'minecraft')
  const gtaActions = groupActionsByOutput(actions, 'gta')
  const bedrockBoxActions = minecraftActions.filter((action) => action.minecraftMode === 'bedrock-box')
  const genericMinecraftActions = minecraftActions.filter((action) => action.minecraftMode !== 'bedrock-box')
  const minecraftTriggerCount = triggers.filter((trigger) =>
    minecraftActions.some((action) => action.id === trigger.actionId),
  ).length
  const gtaTriggerCount = triggers.filter((trigger) =>
    gtaActions.some((action) => action.id === trigger.actionId),
  ).length
  const localMinecraftSocket = `ws://127.0.0.1:${LOCAL_BRIDGE_DEFAULTS.minecraftPort}`
  const localGtaSocket = `ws://127.0.0.1:${LOCAL_BRIDGE_DEFAULTS.gtaPort}`

  const gameCards = [
    {
      id: 'gta',
      eyebrow: GAME_SPOTLIGHT.gta.eyebrow,
      title: GAME_SPOTLIGHT.gta.title,
      shortTitle: GAME_SPOTLIGHT.gta.shortTitle,
      coverUrl: GAME_SPOTLIGHT.gta.coverUrl,
      coverAlt: 'Portada de GTA V',
      accent: GAME_SPOTLIGHT.gta.accent,
      summary: GAME_SPOTLIGHT.gta.summary,
      versionLabel: GAME_SPOTLIGHT.gta.versionLabel,
      modeLabel: GAME_SPOTLIGHT.gta.modeLabel,
      availabilityLabel: GAME_SPOTLIGHT.gta.availabilityLabel,
      primaryCta: GAME_SPOTLIGHT.gta.primaryCta,
      statusLabel: serverStatus.bridges.gtaClients > 0 ? 'Bridge enlazado' : 'Esperando bridge',
      statusTone: serverStatus.bridges.gtaClients > 0 ? 'ok' : 'off',
      actionsCount: gtaActions.length,
      triggerCount: gtaTriggerCount,
      stats: [
        { label: 'Acciones listas', value: String(gtaActions.length) },
        { label: 'Triggers activos', value: String(gtaTriggerCount) },
        { label: 'ChaosMod', value: `${chaosModCatalog.length} efectos` },
      ],
      heroSummary:
        'Tu flujo de GTA ya esta pensado para ChaosMod y bridge local, asi que aqui lo importante es ver rapido si el juego esta listo y saltar a sus acciones.',
      instructions: [
        'Deja el bridge corriendo con `npm run bridge:start`.',
        'Abre GTA V y deja ChaosMod cargado antes de probar eventos.',
      ],
      recommendation: chaosModSourcePath
        ? `ChaosMod detectado en ${chaosModSourcePath}.`
        : 'Si instalas ChaosMod, el bridge sube el catalogo automaticamente para elegir efectos desde el panel.',
      checklist: ['Bridge local activo', 'ChaosMod listo', 'Socket local'],
      endpointLabel: 'Socket local',
      endpointValue: localGtaSocket,
      extraNote:
        'Desde aqui centralizamos GTA V y luego podremos sumar variantes o mods distintos sin tocar el resto del panel.',
    },
    {
      id: 'minecraft',
      eyebrow: GAME_SPOTLIGHT.minecraft.eyebrow,
      title: GAME_SPOTLIGHT.minecraft.title,
      shortTitle: GAME_SPOTLIGHT.minecraft.shortTitle,
      coverUrl: GAME_SPOTLIGHT.minecraft.coverUrl,
      coverAlt: 'Portada de Minecraft',
      accent: GAME_SPOTLIGHT.minecraft.accent,
      summary: GAME_SPOTLIGHT.minecraft.summary,
      versionLabel: GAME_SPOTLIGHT.minecraft.versionLabel,
      modeLabel: GAME_SPOTLIGHT.minecraft.modeLabel,
      availabilityLabel: GAME_SPOTLIGHT.minecraft.availabilityLabel,
      primaryCta: GAME_SPOTLIGHT.minecraft.primaryCta,
      statusLabel: serverStatus.bridges.minecraftRconConnected
        ? 'RCON enlazado'
        : serverStatus.bridges.minecraftClients > 0
          ? 'Mod enlazado'
          : 'Esperando bridge',
      statusTone:
        serverStatus.bridges.minecraftRconConnected || serverStatus.bridges.minecraftClients > 0
          ? 'ok'
          : 'off',
      actionsCount: minecraftActions.length,
      triggerCount: minecraftTriggerCount,
      stats: [
        { label: 'Acciones listas', value: String(minecraftActions.length) },
        { label: 'Triggers activos', value: String(minecraftTriggerCount) },
        {
          label: 'RCON',
          value: serverStatus.bridges.minecraftRconConnected ? 'Activo' : 'Pendiente',
        },
      ],
      heroSummary:
        'Minecraft queda listo tanto para RCON como para mod local, asi que el foco es que puedas lanzar caos, summons o presets sin navegar entre secciones.',
      instructions: [
        'Si usas RCON, revisa host, puerto y password en tu bridge local.',
        'Si usas mod propio, escucha el socket local del bridge y mapea los eventos que quieras.',
      ],
      recommendation: serverStatus.bridges.minecraftRconError
        ? `RCON reporto: ${serverStatus.bridges.minecraftRconError}`
        : 'Puedes combinar comandos directos con overlay sin depender de un mod adicional.',
      checklist: ['Bridge local activo', 'RCON opcional', 'Socket local'],
      endpointLabel: 'Socket local',
      endpointValue: localMinecraftSocket,
      extraNote:
        'La idea es que Minecraft termine siendo un modulo completo con presets por mobs, clima, items y minijuegos.',
    },
  ]
  const minecraftPresetCategories = [
    'all',
    ...Array.from(new Set(BEDROCK_BOX_PRESETS.map((preset) => preset.category))).sort(
      (left, right) => left.localeCompare(right),
    ),
  ]

  const [selectedGameId, setSelectedGameId] = useState(() => gameCards[0]?.id || 'gta')
  const [minecraftPresetSearch, setMinecraftPresetSearch] = useState('')
  const [minecraftPresetCategory, setMinecraftPresetCategory] = useState('all')
  const [minecraftPresetFeedback, setMinecraftPresetFeedback] = useState('')
  const [runningMinecraftPresetId, setRunningMinecraftPresetId] = useState('')
  const [minecraftChatMirrorFeedback, setMinecraftChatMirrorFeedback] = useState('')
  const [minecraftChatMirrorPreviewUser, setMinecraftChatMirrorPreviewUser] = useState('demo-chat')
  const [minecraftChatMirrorPreviewMessage, setMinecraftChatMirrorPreviewMessage] = useState(
    'Hola Minecraft, este mensaje salio desde el panel.',
  )
  const [isTestingMinecraftChatMirror, setIsTestingMinecraftChatMirror] = useState(false)
  const selectedGame = gameCards.find((game) => game.id === selectedGameId) || gameCards[0]
  const minecraftChatMirrorMode =
    profile.minecraftChatMirrorMode === 'actionbar' ? 'actionbar' : 'tellraw'
  const minecraftChatMirrorTarget = String(profile.minecraftChatMirrorTarget || '@a').trim() || '@a'
  const minecraftChatMirrorPrefix = String(profile.minecraftChatMirrorPrefix || '[TikTok]').trim()
  const minecraftChatMirrorPreviewCommand = `${
    minecraftChatMirrorMode === 'actionbar' ? 'title' : 'tellraw'
  } ${minecraftChatMirrorTarget} ${minecraftChatMirrorPrefix || '[TikTok]'} ${
    minecraftChatMirrorPreviewUser || 'demo-chat'
  }: ${minecraftChatMirrorPreviewMessage || 'Mensaje de ejemplo'}`
  const visibleMinecraftPresets = BEDROCK_BOX_PRESETS.filter((preset) => {
    const matchesSearch = !normalizePickerText(minecraftPresetSearch)
      || normalizePickerText(`${preset.name} ${preset.category} ${preset.commandText} ${preset.note}`).includes(
        normalizePickerText(minecraftPresetSearch),
      )
    const matchesCategory = minecraftPresetCategory === 'all' || preset.category === minecraftPresetCategory

    return matchesSearch && matchesCategory
  })
  const featuredMinecraftActions = [...minecraftActions].sort((left, right) => {
    const leftScore = left.minecraftMode === 'bedrock-box' ? 0 : 1
    const rightScore = right.minecraftMode === 'bedrock-box' ? 0 : 1

    return leftScore - rightScore || left.name.localeCompare(right.name)
  })

  async function handleRunMinecraftPreset(preset) {
    setRunningMinecraftPresetId(preset.id)

    try {
      await onRunMinecraftPreset(preset)
      setMinecraftPresetFeedback(`Preset enviado: ${preset.name}. Si el bridge esta activo, deberias verlo en Minecraft al instante.`)
    } catch (error) {
      setMinecraftPresetFeedback(error?.message || 'No pude disparar ese preset de Minecraft.')
    } finally {
      setRunningMinecraftPresetId('')
    }
  }

  async function handleTestMinecraftChatMirror() {
    setIsTestingMinecraftChatMirror(true)

    try {
      await onTestMinecraftChatMirror({
        userName: minecraftChatMirrorPreviewUser,
        comment: minecraftChatMirrorPreviewMessage,
      })
      setMinecraftChatMirrorFeedback(
        'Chat espejo enviado. Si el bridge y RCON estan listos, ya deberias verlo en Minecraft.',
      )
    } catch (error) {
      setMinecraftChatMirrorFeedback(
        error?.message || 'No pude mandar el chat espejo a Minecraft desde el panel.',
      )
    } finally {
      setIsTestingMinecraftChatMirror(false)
    }
  }

  return (
    <section className="panel-section" id="games">
      <SectionHeader
        eyebrow="Juegos"
        title="Catalogo de juegos"
        description="La idea aqui es que cada juego viva como un modulo propio. Hoy ya tienes GTA V y Minecraft, y mas adelante sumamos el resto sin romper el flujo."
      />

      <div className="game-launcher-grid">
        {gameCards.map((game) => (
          <button
            key={game.id}
            type="button"
            className={`game-launcher-card ${selectedGame.id === game.id ? 'selected' : ''}`}
            style={{ '--game-accent': game.accent }}
            onClick={() => setSelectedGameId(game.id)}
          >
            <img className="game-launcher-cover" src={game.coverUrl} alt={game.coverAlt} />
            <div className="game-launcher-overlay" />
            <div className="game-launcher-content">
              <span className="game-launcher-title">{game.shortTitle}</span>
              <span className="game-launcher-pill">{game.versionLabel}</span>
            </div>
          </button>
        ))}
      </div>

      <article className="surface-card game-detail-shell">
        <div className="game-detail-header">
          <span className="eyebrow" style={{ color: selectedGame.accent }}>
            {selectedGame.title}
          </span>
          <h3>{selectedGame.summary}</h3>
          <p>{selectedGame.heroSummary}</p>
        </div>

        <div className="game-detail-hero">
          <aside className="game-detail-aside">
            <img className="game-detail-poster" src={selectedGame.coverUrl} alt={selectedGame.coverAlt} />
            <strong>{selectedGame.title}</strong>
            <span className="game-detail-subtitle">{selectedGame.modeLabel}</span>
            <div className="game-detail-meta">
              <span className="bridge-badge game-kicker" style={{ '--game-accent': selectedGame.accent }}>
                {selectedGame.availabilityLabel}
              </span>
              <span className={`status-chip ${selectedGame.statusTone}`}>{selectedGame.statusLabel}</span>
            </div>
          </aside>

          <div
            className="game-detail-banner"
            style={{ '--game-banner-image': `url(${selectedGame.coverUrl})`, '--game-accent': selectedGame.accent }}
          >
            <div className="game-detail-banner-inner">
              <div className="tag-row">
                {selectedGame.checklist.map((chip) => (
                  <span key={`${selectedGame.id}-${chip}`} className="tag">
                    {chip}
                  </span>
                ))}
              </div>

              <div className="game-stat-grid">
                {selectedGame.stats.map((stat) => (
                  <div key={`${selectedGame.id}-${stat.label}`} className="game-stat-card">
                    <span className="snippet-label">{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>

              <div className="card-actions">
                <button className="primary-button" onClick={() => onJump('actions')}>
                  {selectedGame.primaryCta}
                </button>
                <button className="secondary-button" onClick={() => onJump('triggers')}>
                  Ver triggers
                </button>
                <button className="ghost-button" onClick={() => onJump('bridges')}>
                  Ver bridge tecnico
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="game-detail-columns">
          <div className="game-callout game-callout-info">
            <strong>Flujo recomendado</strong>
            {selectedGame.instructions.map((instruction) => (
              <p key={`${selectedGame.id}-${instruction}`}>{instruction}</p>
            ))}
          </div>

          <div className="game-callout game-callout-warn">
            <strong>Recomendacion</strong>
            <p>{selectedGame.recommendation}</p>
          </div>
        </div>

        <div className="game-detail-footer">
          <div className="snippet-block">
            <span className="snippet-label">{selectedGame.endpointLabel}</span>
            <code>{selectedGame.endpointValue}</code>
          </div>
          <p className="support-copy">{selectedGame.extraNote}</p>
        </div>

        {selectedGame.id === 'minecraft' ? (
          <div className="game-mode-grid">
            <article className="surface-card game-mode-card">
              <div className="card-top">
                <div>
                  <h3>Modos de Minecraft</h3>
                  <p>Bedrock Box ya vive aqui como modo real del juego, con presets rapidos para probar sin crear una accion antes.</p>
                </div>
                <div className="tag-row">
                  <span className="bridge-badge">Bedrock Box</span>
                  <span className="bridge-badge">{BEDROCK_BOX_PRESETS.length} presets</span>
                </div>
              </div>

              <div className="picker-toolbar">
                <input
                  className="text-field"
                  placeholder="Busca por nombre, categoria o comando"
                  value={minecraftPresetSearch}
                  onChange={(event) => setMinecraftPresetSearch(event.target.value)}
                />
                <select
                  className="text-field picker-filter"
                  value={minecraftPresetCategory}
                  onChange={(event) => setMinecraftPresetCategory(event.target.value)}
                >
                  {minecraftPresetCategories.map((category) => (
                    <option key={category} value={category}>
                      {category === 'all' ? 'Todas las categorias' : category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="command-gallery-grid game-mode-preset-grid">
                {visibleMinecraftPresets.length === 0 ? (
                  <div className="empty-list">No encontre presets de Bedrock Box con ese filtro.</div>
                ) : (
                  visibleMinecraftPresets.map((preset) => {
                    const meta = getBedrockBoxCardMeta(preset)
                    const linkedActionCount = bedrockBoxActions.filter(
                      (action) => action.minecraftBedrockPresetId === preset.id,
                    ).length

                    return (
                      <article
                        key={preset.id}
                        className="command-picker-card game-mode-preset-card"
                        style={{ '--picker-accent': meta.accent }}
                      >
                        <div className="picker-card-head">
                          {preset.imageUrl ? (
                            <img className="gift-picker-image" src={preset.imageUrl} alt={preset.name} />
                          ) : (
                            <span className="gift-picker-thumb">{meta.token}</span>
                          )}
                          <span className="tag">{preset.category}</span>
                        </div>
                        <strong>{preset.name}</strong>
                        <span className="row-subcopy">{preset.note}</span>
                        <code className="dense-code">{preset.commandText}</code>
                        <div className="tag-row">
                          {linkedActionCount > 0 ? (
                            <span className="muted-pill">
                              {linkedActionCount} accion{linkedActionCount === 1 ? '' : 'es'}
                            </span>
                          ) : (
                            <span className="muted-pill">Sin acciones ligadas</span>
                          )}
                        </div>
                        <div className="row-actions">
                          <button
                            className="secondary-button compact-button"
                            onClick={() => handleRunMinecraftPreset(preset)}
                            disabled={runningMinecraftPresetId === preset.id}
                          >
                            {runningMinecraftPresetId === preset.id ? 'Enviando...' : 'Probar ahora'}
                          </button>
                        </div>
                      </article>
                    )
                  })
                )}
              </div>

              {minecraftPresetFeedback ? <span className="feedback-pill">{minecraftPresetFeedback}</span> : null}
            </article>

            <div className="game-mode-stack">
              <article className="surface-card game-mode-card">
                <div className="card-top">
                  <div>
                    <h3>Chat espejo de TikTok</h3>
                    <p>Replica comentarios del live dentro de Minecraft usando el mismo bridge local.</p>
                  </div>
                  <span
                    className={`status-chip ${profile.minecraftChatMirrorEnabled ? 'ok' : 'off'}`}
                  >
                    {profile.minecraftChatMirrorEnabled ? 'Activo' : 'Apagado'}
                  </span>
                </div>

                <div className="option-grid">
                  <label className="option-card">
                    <input
                      type="checkbox"
                      checked={Boolean(profile.minecraftChatMirrorEnabled)}
                      onChange={(event) =>
                        updateProfileField('minecraftChatMirrorEnabled', event.target.checked)
                      }
                    />
                    <div>
                      <strong>Activar chat espejo</strong>
                      <span>Manda comentarios normales del live al chat del juego.</span>
                    </div>
                  </label>

                  <label className="option-card">
                    <input
                      type="checkbox"
                      checked={Boolean(profile.minecraftChatMirrorSkipCommands)}
                      onChange={(event) =>
                        updateProfileField('minecraftChatMirrorSkipCommands', event.target.checked)
                      }
                    />
                    <div>
                      <strong>Ocultar comandos</strong>
                      <span>Ignora mensajes que arrancan con `!` o `/` para no ensuciar el juego.</span>
                    </div>
                  </label>
                </div>

                <div className="mini-grid">
                  <div>
                    <label className="field-label" htmlFor="minecraft-chat-mirror-mode">
                      Salida dentro del juego
                    </label>
                    <select
                      id="minecraft-chat-mirror-mode"
                      className="text-field"
                      value={minecraftChatMirrorMode}
                      onChange={(event) =>
                        updateProfileField('minecraftChatMirrorMode', event.target.value)
                      }
                    >
                      <option value="tellraw">Chat normal</option>
                      <option value="actionbar">Action bar</option>
                    </select>
                  </div>

                  <div>
                    <label className="field-label" htmlFor="minecraft-chat-mirror-target">
                      Objetivo en Minecraft
                    </label>
                    <input
                      id="minecraft-chat-mirror-target"
                      className="text-field"
                      value={profile.minecraftChatMirrorTarget || '@a'}
                      onChange={(event) =>
                        updateProfileField('minecraftChatMirrorTarget', event.target.value)
                      }
                      placeholder="@a"
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="minecraft-chat-mirror-prefix">
                      Prefijo
                    </label>
                    <input
                      id="minecraft-chat-mirror-prefix"
                      className="text-field"
                      value={profile.minecraftChatMirrorPrefix || ''}
                      onChange={(event) =>
                        updateProfileField('minecraftChatMirrorPrefix', event.target.value)
                      }
                      placeholder="[TikTok]"
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="minecraft-chat-mirror-sample-user">
                      Usuario de prueba
                    </label>
                    <input
                      id="minecraft-chat-mirror-sample-user"
                      className="text-field"
                      value={minecraftChatMirrorPreviewUser}
                      onChange={(event) => setMinecraftChatMirrorPreviewUser(event.target.value)}
                      placeholder="demo-chat"
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label" htmlFor="minecraft-chat-mirror-sample-message">
                    Mensaje de prueba
                  </label>
                  <input
                    id="minecraft-chat-mirror-sample-message"
                    className="text-field"
                    value={minecraftChatMirrorPreviewMessage}
                    onChange={(event) => setMinecraftChatMirrorPreviewMessage(event.target.value)}
                    placeholder="Hola Minecraft, este mensaje salio desde el panel."
                  />
                </div>

                <div className="snippet-block">
                  <span className="snippet-label">Vista rapida</span>
                  <code>{minecraftChatMirrorPreviewCommand}</code>
                </div>

                <div className="row-actions">
                  <button
                    className="secondary-button compact-button"
                    onClick={handleTestMinecraftChatMirror}
                    disabled={isTestingMinecraftChatMirror}
                  >
                    {isTestingMinecraftChatMirror ? 'Enviando...' : 'Probar chat espejo'}
                  </button>
                  <button className="ghost-button compact-button" onClick={() => onJump('bridges')}>
                    Ver bridge
                  </button>
                </div>

                {minecraftChatMirrorFeedback ? (
                  <span className="feedback-pill">{minecraftChatMirrorFeedback}</span>
                ) : null}
              </article>

              <article className="surface-card game-mode-card">
                <div className="card-top">
                  <div>
                    <h3>Acciones ya conectadas</h3>
                    <p>Aqui tienes a mano las acciones de Minecraft que ya guardaste en tu panel.</p>
                  </div>
                  <span className="state-badge">{minecraftActions.length} listas</span>
                </div>

                {featuredMinecraftActions.length === 0 ? (
                  <p className="support-copy">Todavia no creaste acciones para Minecraft. Puedes arrancar con un preset Bedrock Box o ir a la biblioteca de acciones.</p>
                ) : (
                  <div className="game-linked-actions">
                    {featuredMinecraftActions.slice(0, 5).map((action) => (
                      <div key={action.id} className="game-linked-action">
                        <div className="row-title-wrap">
                          <strong className="row-title">{action.name}</strong>
                          <span className="row-subcopy">{getActionCommandSummary(action)}</span>
                        </div>
                        <button className="ghost-button compact-button" onClick={() => onPreviewAction(action)}>
                          Probar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="card-actions">
                  <button className="primary-button" onClick={() => onJump('actions')}>
                    Gestionar acciones
                  </button>
                  <button className="secondary-button" onClick={() => onJump('triggers')}>
                    Ver triggers
                  </button>
                </div>
              </article>

              <article className="surface-card game-mode-card">
                <div className="card-top">
                  <div>
                    <h3>Estado rapido</h3>
                    <p>Resumen de como esta quedando hoy tu modulo de Minecraft.</p>
                  </div>
                  <span className={`status-chip ${serverStatus.bridges.minecraftRconConnected ? 'ok' : 'off'}`}>
                    {serverStatus.bridges.minecraftRconConnected ? 'RCON activo' : 'RCON en espera'}
                  </span>
                </div>

                <div className="mini-grid game-mode-status-grid">
                  <div>
                    <span className="snippet-label">Bedrock Box</span>
                    <p>{bedrockBoxActions.length} accion{bedrockBoxActions.length === 1 ? '' : 'es'}</p>
                  </div>
                  <div>
                    <span className="snippet-label">Generico</span>
                    <p>{genericMinecraftActions.length} accion{genericMinecraftActions.length === 1 ? '' : 'es'}</p>
                  </div>
                  <div>
                    <span className="snippet-label">Bridge local</span>
                    <p>{serverStatus.bridges.minecraftClients} cliente{serverStatus.bridges.minecraftClients === 1 ? '' : 's'}</p>
                  </div>
                  <div>
                    <span className="snippet-label">Triggers</span>
                    <p>{minecraftTriggerCount} activos</p>
                  </div>
                  <div>
                    <span className="snippet-label">Chat espejo</span>
                    <p>{profile.minecraftChatMirrorEnabled ? 'Activo' : 'Apagado'}</p>
                  </div>
                  <div>
                    <span className="snippet-label">Salida</span>
                    <p>{minecraftChatMirrorMode === 'actionbar' ? 'Action bar' : 'Chat'}</p>
                  </div>
                </div>

                <div className="snippet-block">
                  <span className="snippet-label">Comando base</span>
                  <code>bedrock create | fill | tnt | randomtnt | glass_prison</code>
                </div>

                <p className="support-copy">
                  Siguiente paso natural: sumar presets por mobs, clima e items para que Minecraft quede tan completo como GTA.
                </p>
              </article>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  )
}

function OverviewSection({
  actionCount,
  backupFeedback,
  bridgePort,
  isDesktopApp,
  isImportingBackup,
  onCreateAction,
  onCreateTrigger,
  onExportBackup,
  onImportBackup,
  overlayUrl,
  readyOutputCount,
  serverError,
  serverStatus,
  triggerCount,
}) {
  const diagnostics = [
    {
      label: 'TikTok LIVE',
      value: serverStatus.tikTok.connected ? 'Conectado' : serverStatus.tikTok.connecting ? 'Conectando' : 'Apagado',
      tone: serverStatus.tikTok.connected ? 'ok' : serverStatus.tikTok.connecting ? 'warn' : 'off',
      detail: serverStatus.tikTok.lastError || (serverStatus.tikTok.roomId ? `Room ${serverStatus.tikTok.roomId}` : 'Sin live enlazado'),
    },
    {
      label: 'Spotify',
      value: serverStatus.music.connected ? 'Conectado' : serverStatus.music.configured ? 'Listo' : 'Falta configurar',
      tone: serverStatus.music.connected ? 'ok' : serverStatus.music.configured ? 'warn' : 'off',
      detail: serverStatus.music.lastError || serverStatus.music.accountLabel || 'Song Request opcional',
    },
    {
      label: 'Overlay',
      value: serverStatus.bridges.overlayClients > 0 ? 'Activo' : 'En espera',
      tone: serverStatus.bridges.overlayClients > 0 ? 'ok' : 'off',
      detail: serverStatus.bridges.overlayClients > 0 ? `${serverStatus.bridges.overlayClients} cliente(s)` : 'Abre la URL del overlay para probarlo',
    },
    {
      label: 'Minecraft',
      value: serverStatus.bridges.minecraftRconConnected ? 'RCON activo' : serverStatus.bridges.minecraftClients > 0 ? 'Bridge activo' : 'Pendiente',
      tone: serverStatus.bridges.minecraftRconConnected || serverStatus.bridges.minecraftClients > 0 ? 'ok' : 'off',
      detail: serverStatus.bridges.minecraftRconError || `Clientes: ${serverStatus.bridges.minecraftClients}`,
    },
    {
      label: 'GTA V',
      value: serverStatus.bridges.gtaClients > 0 ? 'Bridge activo' : 'Pendiente',
      tone: serverStatus.bridges.gtaClients > 0 ? 'ok' : 'off',
      detail: serverStatus.bridges.gtaClients > 0 ? `${serverStatus.bridges.gtaClients} cliente(s)` : 'Esperando mod o bridge local',
    },
    {
      label: 'Overlay publico',
      value: serverStatus.overlayMirror?.configured
        ? serverStatus.overlayMirror?.lastError
          ? 'Revisar'
          : serverStatus.overlayMirror?.lastSyncAt
            ? 'Sincronizado'
            : 'Preparando'
        : 'Sin configurar',
      tone: serverStatus.overlayMirror?.configured
        ? serverStatus.overlayMirror?.lastError
          ? 'warn'
          : 'ok'
        : 'off',
      detail:
        serverStatus.overlayMirror?.lastError
        || serverStatus.overlayMirror?.targetBaseUrl
        || 'Completa la URL publica base para LIVE Studio.',
    },
    {
      label: 'Modo app',
      value: isDesktopApp ? 'Desktop' : 'Web',
      tone: 'ok',
      detail: isDesktopApp ? 'Beta empaquetada lista para pruebas cerradas' : 'Panel web / navegador',
    },
  ]

  return (
    <div className="workspace-stage-stack">
      <HeroPanel
        overlayUrl={overlayUrl}
        onCreateAction={onCreateAction}
        onCreateTrigger={onCreateTrigger}
      />

      <MetricRow
        actionCount={actionCount}
        bridgePort={bridgePort}
        readyOutputCount={readyOutputCount}
        triggerCount={triggerCount}
      />

      <div className="overview-support-grid">
        <article className="surface-card overview-card">
          <div className="card-top">
            <div>
              <h3>Backups y restauracion</h3>
              <p>Exporta tu configuracion actual y vuelve a cargarla si cambias de PC o pruebas una beta nueva.</p>
            </div>
            <span className="bridge-badge">Beta segura</span>
          </div>

          <div className="row-actions">
            <button className="primary-button" onClick={onExportBackup}>
              Exportar backup
            </button>
            <button className="secondary-button" onClick={onImportBackup}>
              {isImportingBackup ? 'Importando...' : 'Importar backup'}
            </button>
          </div>

          <p className="support-copy">
            El backup incluye acciones, eventos, widgets, musica, juegos y catalogos aprendidos. No mete de nuevo las cookies de TikTok ni los tokens sensibles de Spotify.
          </p>
          {backupFeedback ? <div className="success-box">{backupFeedback}</div> : null}
        </article>

        <article className="surface-card overview-card">
          <div className="card-top">
            <div>
              <h3>Diagnostico rapido</h3>
              <p>Te deja ver enseguida que modulo esta sano y cual necesita atencion antes de salir en vivo.</p>
            </div>
            <span className={`status-chip ${serverError ? 'warn' : 'ok'}`}>
              {serverError ? 'Revisar' : 'Saludable'}
            </span>
          </div>

          <div className="diagnostic-grid">
            {diagnostics.map((item) => (
              <div key={item.label} className="diagnostic-card">
                <div className="diagnostic-head">
                  <span className="snippet-label">{item.label}</span>
                  <span className={`status-chip ${item.tone}`}>{item.value}</span>
                </div>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>

          {serverError ? <div className="error-box">{serverError}</div> : null}
        </article>
      </div>
    </div>
  )
}

function MusicSection({
  localSongRequestUrl,
  music,
  musicStatus,
  onClearHistory,
  onClearQueue,
  onConnectSpotify,
  onCopySongRequestUrl,
  onDisconnectSpotify,
  onOpenSongRequestWindow,
  onSkipTrack,
  onSyncSpotify,
  onTestPlayRequest,
  onRemoveRequest,
  publicSongRequestUrl,
  updateMusicField,
}) {
  const [requesterDraft, setRequesterDraft] = useState('demo-chat')
  const [queryDraft, setQueryDraft] = useState('')
  const [musicFeedback, setMusicFeedback] = useState('')
  const [isSubmittingMusicRequest, setIsSubmittingMusicRequest] = useState(false)
  const [isSkippingTrack, setIsSkippingTrack] = useState(false)
  const [isClearingQueue, setIsClearingQueue] = useState(false)
  const [isClearingHistory, setIsClearingHistory] = useState(false)
  const queue = Array.isArray(music.queue) ? music.queue : []
  const history = Array.isArray(music.history) ? music.history : []
  const devices = Array.isArray(musicStatus.devices) ? musicStatus.devices : []
  const currentTrack = musicStatus.currentPlayback?.track || null
  const cooldownRemainingSeconds =
    musicStatus.cooldownUntil && musicStatus.cooldownUntil > Date.now()
      ? Math.max(1, Math.ceil((musicStatus.cooldownUntil - Date.now()) / 1000))
      : 0

  async function handleSubmitMusicRequest() {
    setIsSubmittingMusicRequest(true)

    try {
      await onTestPlayRequest({
        userName: requesterDraft,
        query: queryDraft,
      })
      setMusicFeedback('Solicitud enviada. Si Spotify tiene un dispositivo activo, la cola ya deberia moverse.')
      setQueryDraft('')
    } catch (error) {
      setMusicFeedback(error?.message || 'No pude procesar esa solicitud de musica.')
    } finally {
      setIsSubmittingMusicRequest(false)
    }
  }

  async function handleSkipTrack() {
    setIsSkippingTrack(true)

    try {
      await onSkipTrack({
        userName: 'panel',
      })
      setMusicFeedback('Spotify salto a la siguiente pista.')
    } catch (error) {
      setMusicFeedback(error?.message || 'No pude saltar la pista actual.')
    } finally {
      setIsSkippingTrack(false)
    }
  }

  async function handleRemoveRequest(requestId) {
    try {
      await onRemoveRequest(requestId)
      setMusicFeedback('Solicitud quitada de la cola.')
    } catch (error) {
      setMusicFeedback(error?.message || 'No pude quitar esa solicitud.')
    }
  }

  async function handleClearQueue() {
    setIsClearingQueue(true)

    try {
      await onClearQueue()
      setMusicFeedback('Se limpiaron los pedidos pendientes de la cola.')
    } catch (error) {
      setMusicFeedback(error?.message || 'No pude limpiar la cola pendiente.')
    } finally {
      setIsClearingQueue(false)
    }
  }

  async function handleClearHistory() {
    setIsClearingHistory(true)

    try {
      await onClearHistory()
      setMusicFeedback('Historial de canciones limpiado.')
    } catch (error) {
      setMusicFeedback(error?.message || 'No pude limpiar el historial.')
    } finally {
      setIsClearingHistory(false)
    }
  }

  return (
    <section className="panel-section" id="music">
      <SectionHeader
        eyebrow="Musica"
        title="Song Request"
        description="Aqui configuras Spotify, los comandos del chat y la cola de canciones que manejaremos desde la app."
      />

      <div className="game-mode-grid music-grid">
        <article className="surface-card game-mode-card">
          <div className="card-top">
            <div>
              <h3>Spotify</h3>
              <p>Conecta tu cuenta Premium para usar `!play`, `!skip` y `!quitar` en el chat.</p>
            </div>
            <span
              className={`status-chip ${
                musicStatus.connected ? 'ok' : musicStatus.configured ? 'warn' : 'off'
              }`}
            >
              {musicStatus.connected
                ? 'Conectado'
                : musicStatus.configured
                  ? 'Listo para login'
                  : 'Falta configurar'}
            </span>
          </div>

          <div className="mini-grid">
            <div>
              <span className="snippet-label">Cuenta</span>
              <p>{musicStatus.accountLabel || 'Sin conectar'}</p>
            </div>
            <div>
              <span className="snippet-label">Plan</span>
              <p>{musicStatus.accountProduct || 'No disponible'}</p>
            </div>
            <div>
              <span className="snippet-label">Dispositivos</span>
              <p>{devices.length}</p>
            </div>
            <div>
              <span className="snippet-label">Ultimo sync</span>
              <p>{formatDateTime(musicStatus.lastSyncAt)}</p>
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="music-device-select">
              Dispositivo preferido
            </label>
            <select
              id="music-device-select"
              className="text-field"
              value={music.selectedDeviceId || ''}
              onChange={(event) => {
                const nextDevice = devices.find((device) => device.id === event.target.value)
                updateMusicField('selectedDeviceId', event.target.value)
                updateMusicField('selectedDeviceName', nextDevice?.name || '')
              }}
            >
              <option value="">Usar el dispositivo activo</option>
              {devices.map((device) => (
                <option key={device.id || device.name} value={device.id}>
                  {device.name}
                  {device.isActive ? ' · activo' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="row-actions">
            {musicStatus.connected ? (
              <>
                <button className="primary-button" onClick={onSyncSpotify}>
                  Sincronizar Spotify
                </button>
                <button className="ghost-button" onClick={onDisconnectSpotify}>
                  Desconectar
                </button>
              </>
            ) : (
              <button className="primary-button" onClick={onConnectSpotify}>
                Iniciar sesion con Spotify
              </button>
            )}
          </div>

          {!musicStatus.configured ? (
            <div className="error-box">
              En la beta desktop, Spotify necesita claves locales. Crea un archivo `.env` en
              `C:\Users\soraf\Desktop\APPTIKTOK\live-control-app` o `desktop.env` en la carpeta de
              datos de la app con `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` y
              `SPOTIFY_REDIRECT_URI=http://127.0.0.1:5123/api/music/spotify/callback`.
            </div>
          ) : null}

          {musicStatus.lastError ? <div className="error-box">{musicStatus.lastError}</div> : null}
        </article>

        <article className="surface-card game-mode-card">
          <div className="card-top">
            <div>
              <h3>Comandos del chat</h3>
              <p>Estos comandos se leen directo desde TikTok y usan una cola propia para poder moderar mejor.</p>
            </div>
            <span className={`status-chip ${music.enabled ? 'ok' : 'off'}`}>
              {music.enabled ? 'Modulo activo' : 'Modulo apagado'}
            </span>
          </div>

          <div className="option-grid">
            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.enabled)}
                onChange={(event) => updateMusicField('enabled', event.target.checked)}
              />
              <div>
                <strong>Activar Song Request</strong>
                <span>Permite que el chat use los comandos de musica en vivo.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.allowExplicit)}
                onChange={(event) => updateMusicField('allowExplicit', event.target.checked)}
              />
              <div>
                <strong>Permitir explicitas</strong>
                <span>Si esta apagado, la app intenta evitar tracks marcados como explicit.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.playEnabled)}
                onChange={(event) => updateMusicField('playEnabled', event.target.checked)}
              />
              <div>
                <strong>Habilitar play</strong>
                <span>Comando para pedir una cancion desde el chat.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.skipEnabled)}
                onChange={(event) => updateMusicField('skipEnabled', event.target.checked)}
              />
              <div>
                <strong>Habilitar skip</strong>
                <span>Permite saltar la pista actual desde el chat o el panel.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.removeEnabled)}
                onChange={(event) => updateMusicField('removeEnabled', event.target.checked)}
              />
              <div>
                <strong>Habilitar quitar</strong>
                <span>Deja que el usuario quite sus pedidos pendientes antes de enviarlos a Spotify.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.allowAllUsers)}
                onChange={(event) => updateMusicField('allowAllUsers', event.target.checked)}
              />
              <div>
                <strong>All users</strong>
                <span>Si esta activo, cualquier viewer puede usar los comandos de musica.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.allowSubscribers)}
                onChange={(event) => updateMusicField('allowSubscribers', event.target.checked)}
              />
              <div>
                <strong>Super Fans / Suscriptores</strong>
                <span>Permite usar comandos a viewers con fan club o suscripcion activa.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.allowModerators)}
                onChange={(event) => updateMusicField('allowModerators', event.target.checked)}
              />
              <div>
                <strong>Mods</strong>
                <span>Habilita Song Request para moderadores del live.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.overlayShowQueue)}
                onChange={(event) => updateMusicField('overlayShowQueue', event.target.checked)}
              />
              <div>
                <strong>Mostrar cola en widget</strong>
                <span>Enseña lo que viene despues de la pista actual.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.overlayShowRequester)}
                onChange={(event) => updateMusicField('overlayShowRequester', event.target.checked)}
              />
              <div>
                <strong>Mostrar quien la pidio</strong>
                <span>Agrega el nombre del viewer en la cola del widget.</span>
              </div>
            </label>
          </div>

          <div className="mini-grid">
            <div>
              <label className="field-label" htmlFor="music-play-command">
                Comando play
              </label>
              <input
                id="music-play-command"
                className="text-field"
                value={music.playCommand || '!play'}
                onChange={(event) => updateMusicField('playCommand', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-skip-command">
                Comando skip
              </label>
              <input
                id="music-skip-command"
                className="text-field"
                value={music.skipCommand || '!skip'}
                onChange={(event) => updateMusicField('skipCommand', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-remove-command">
                Comando quitar
              </label>
              <input
                id="music-remove-command"
                className="text-field"
                value={music.removeCommand || '!quitar'}
                onChange={(event) => updateMusicField('removeCommand', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-queue-limit">
                Cola maxima
              </label>
              <input
                id="music-queue-limit"
                className="text-field"
                value={music.maxQueueLength || '10'}
                onChange={(event) => updateMusicField('maxQueueLength', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-user-limit">
                Maximo por usuario
              </label>
              <input
                id="music-user-limit"
                className="text-field"
                value={music.maxRequestsPerUser || '2'}
                onChange={(event) => updateMusicField('maxRequestsPerUser', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-cooldown-seconds">
                Cooldown global
              </label>
              <input
                id="music-cooldown-seconds"
                className="text-field"
                value={music.cooldownSeconds || '10'}
                onChange={(event) => updateMusicField('cooldownSeconds', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-overlay-title">
                Titulo del widget
              </label>
              <input
                id="music-overlay-title"
                className="text-field"
                value={music.overlayTitle || 'Song Request'}
                onChange={(event) => updateMusicField('overlayTitle', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-overlay-max-visible">
                Canciones visibles
              </label>
              <input
                id="music-overlay-max-visible"
                className="text-field"
                value={music.overlayMaxVisible || '3'}
                onChange={(event) => updateMusicField('overlayMaxVisible', event.target.value)}
              />
            </div>
          </div>

          <div className="snippet-block">
            <span className="snippet-label">Comandos activos</span>
            <code>
              {music.playCommand || '!play'} artista cancion · {music.skipCommand || '!skip'} ·{' '}
              {music.removeCommand || '!quitar'}
            </code>
          </div>

          <div className="snippet-block">
            <span className="snippet-label">Disponibles para</span>
            <code>
              {[
                music.allowAllUsers ? 'All users' : null,
                music.allowSubscribers ? 'Super Fans / Suscriptores' : null,
                music.allowModerators ? 'Mods' : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Nadie'}
            </code>
          </div>
        </article>

        <article className="surface-card game-mode-card music-span-2">
          <div className="card-top">
            <div>
              <h3>Cola y reproduccion</h3>
              <p>La app mantiene su propia cola para poder quitar pedidos antes de que entren al queue de Spotify.</p>
            </div>
            <div className="tag-row">
              <span className="bridge-badge">{musicStatus.queueCount} en cola</span>
              <span className="bridge-badge">{musicStatus.historyCount} en historial</span>
              {cooldownRemainingSeconds > 0 ? (
                <span className="bridge-badge">Cooldown {cooldownRemainingSeconds}s</span>
              ) : null}
            </div>
          </div>

          <div className="smartbar-preview-shell">
            <span className="snippet-label">Widget de musica</span>
            <SongRequestWidget music={music} musicStatus={musicStatus} preview />
          </div>

          <div className="link-stack">
            <div>
              <span className="snippet-label">Widget local</span>
              <code className="overlay-link">{localSongRequestUrl}</code>
            </div>
            <div>
              <span className="snippet-label">Widget publico</span>
              <code className="overlay-link">
                {publicSongRequestUrl || 'Completa la URL publica base para generar el link real.'}
              </code>
            </div>
          </div>

          <div className="card-actions">
            <button className="primary-button" onClick={onCopySongRequestUrl}>
              {publicSongRequestUrl ? 'Copiar widget publico' : 'Copiar widget local'}
            </button>
            <button className="secondary-button" onClick={onOpenSongRequestWindow}>
              Abrir widget local
            </button>
          </div>

          {currentTrack ? (
            <div className="music-current-track">
              {currentTrack.imageUrl ? (
                <img src={currentTrack.imageUrl} alt={currentTrack.name} className="music-track-cover" />
              ) : (
                <div className="music-track-cover music-track-cover-fallback">SP</div>
              )}
              <div className="music-track-copy">
                <span className="snippet-label">Sonando ahora</span>
                <strong>{currentTrack.name}</strong>
                <span>{Array.isArray(currentTrack.artists) ? currentTrack.artists.join(', ') : ''}</span>
                <span className="row-subcopy">
                  {currentTrack.albumName || 'Spotify'} · {formatDurationClock(currentTrack.durationMs || 0)}
                </span>
              </div>
              <div className="row-actions">
                <button
                  className="secondary-button compact-button"
                  onClick={handleSkipTrack}
                  disabled={isSkippingTrack || !musicStatus.connected}
                >
                  {isSkippingTrack ? 'Saltando...' : 'Saltar pista'}
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-list">Todavia no hay una pista activa detectada en Spotify.</div>
          )}

          <div className="picker-toolbar">
            <input
              className="text-field"
              placeholder="Usuario de prueba"
              value={requesterDraft}
              onChange={(event) => setRequesterDraft(event.target.value)}
            />
            <button
              className="primary-button"
              onClick={handleSubmitMusicRequest}
              disabled={isSubmittingMusicRequest || !musicStatus.connected}
            >
              {isSubmittingMusicRequest ? 'Buscando...' : 'Simular !play'}
            </button>
          </div>
          <input
            className="text-field"
            placeholder="Escribe artista y cancion, por ejemplo: coldplay yellow"
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
          />

          {musicFeedback ? <span className="feedback-pill">{musicFeedback}</span> : null}

          <div className="music-queue-layout">
            <div className="list-shell">
              <div className="card-top">
                <h3>Pedidos pendientes</h3>
                <div className="row-actions">
                  <span className="state-badge">{queue.length}</span>
                  <button
                    className="ghost-button compact-button"
                    onClick={handleClearQueue}
                    disabled={isClearingQueue || queue.length === 0}
                  >
                    {isClearingQueue ? 'Limpiando...' : 'Limpiar cola'}
                  </button>
                </div>
              </div>

              {queue.length === 0 ? (
                <div className="empty-list">Aun no hay pedidos en cola.</div>
              ) : (
                <div className="game-linked-actions">
                  {queue.map((requestItem) => (
                    <div key={requestItem.id} className="music-request-row">
                      {requestItem.imageUrl ? (
                        <img
                          src={requestItem.imageUrl}
                          alt={requestItem.name}
                          className="music-track-cover music-track-cover-mini"
                        />
                      ) : (
                        <div className="music-track-cover music-track-cover-fallback music-track-cover-mini">
                          SP
                        </div>
                      )}
                      <div className="row-title-wrap">
                        <strong className="row-title">{requestItem.name}</strong>
                        <span className="row-subcopy">
                          {Array.isArray(requestItem.artists) ? requestItem.artists.join(', ') : ''}
                        </span>
                        <span className="row-subcopy">
                          {requestItem.requester} · {requestItem.query}
                        </span>
                        <span className="row-subcopy">
                          {formatDurationClock(requestItem.durationMs || 0)}
                          {requestItem.explicit ? ' · explicit' : ''}
                        </span>
                      </div>
                      <div className="row-actions">
                        <span
                          className={`status-chip ${
                            requestItem.status === 'playing'
                              ? 'ok'
                              : requestItem.status === 'sent'
                                ? 'warn'
                                : 'off'
                          }`}
                        >
                          {requestItem.status}
                        </span>
                        {requestItem.status === 'queued' ? (
                          <button
                            className="ghost-button compact-button"
                            onClick={() => handleRemoveRequest(requestItem.id)}
                          >
                            Quitar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="list-shell">
              <div className="card-top">
                <h3>Historial reciente</h3>
                <div className="row-actions">
                  <span className="state-badge">{history.length}</span>
                  <button
                    className="ghost-button compact-button"
                    onClick={handleClearHistory}
                    disabled={isClearingHistory || history.length === 0}
                  >
                    {isClearingHistory ? 'Limpiando...' : 'Limpiar historial'}
                  </button>
                </div>
              </div>

              {history.length === 0 ? (
                <div className="empty-list">Todavia no hay historial de canciones pedidas.</div>
              ) : (
                <div className="game-linked-actions">
                  {history.slice(0, 6).map((requestItem) => (
                    <div key={requestItem.id} className="music-request-row">
                      {requestItem.imageUrl ? (
                        <img
                          src={requestItem.imageUrl}
                          alt={requestItem.name}
                          className="music-track-cover music-track-cover-mini"
                        />
                      ) : (
                        <div className="music-track-cover music-track-cover-fallback music-track-cover-mini">
                          SP
                        </div>
                      )}
                      <div className="row-title-wrap">
                        <strong className="row-title">{requestItem.name}</strong>
                        <span className="row-subcopy">
                          {Array.isArray(requestItem.artists) ? requestItem.artists.join(', ') : ''}
                        </span>
                        <span className="row-subcopy">
                          {requestItem.requester} · {requestItem.status}
                        </span>
                        <span className="row-subcopy">
                          {formatDateTime(requestItem.completedAt || requestItem.playedAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}

function EmoteLibrarySection({ emoteCatalog, onCreateEmote, onEditEmote, onRemoveEmote }) {
  return (
    <section className="panel-section" id="emotes">
      <SectionHeader
        eyebrow="Biblioteca de emotes"
        title="Emotes"
        description="Aqui guardas los emotes que ya viste y tambien los que quieras cargar a mano para trabajar offline."
        action={
          <button className="primary-button" onClick={onCreateEmote}>
            Agregar emote
          </button>
        }
      />

      <EmoteListTable
        emoteCatalog={emoteCatalog}
        onEditEmote={onEditEmote}
        onRemoveEmote={onRemoveEmote}
      />
    </section>
  )
}

function EmoteListTable({ emoteCatalog, onEditEmote, onRemoveEmote }) {
  const [searchQuery, setSearchQuery] = useState('')
  const normalizedEmoteCatalog = Array.isArray(emoteCatalog)
    ? emoteCatalog.map((emote, index) => normalizeEmoteCatalogForPicker(emote, index))
    : []
  const filteredEmotes = normalizedEmoteCatalog.filter((emote) =>
    normalizePickerText(`${emote.name} ${emote.id} ${emote.source}`).includes(
      normalizePickerText(searchQuery),
    ),
  )

  return (
    <div className="list-shell">
      <div className="list-toolbar">
        <input
          className="text-field list-search"
          placeholder="Buscar emotes..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <span className="muted-pill">
          {filteredEmotes.length} emote{filteredEmotes.length === 1 ? '' : 's'}
        </span>
      </div>

      {filteredEmotes.length === 0 ? (
        <div className="empty-list">
          Todavia no hay emotes guardados. Puedes agregarlos a mano y luego el live ira sumando los
          que aparezcan.
        </div>
      ) : (
        <>
          <div className="dense-table-head emotes-layout">
            <div>Emote</div>
            <div>Origen</div>
            <div>ID</div>
            <div />
          </div>

          <div className="dense-table">
            {filteredEmotes.map((emote) => (
              <article key={emote.id} className="dense-table-row emotes-layout">
                <div className="dense-cell" data-label="Emote">
                  <span className="gift-inline-pill">
                    {emote.imageUrl ? (
                      <img src={emote.imageUrl} alt={emote.name} className="gift-inline-image" />
                    ) : (
                      <span className="gift-inline-token" style={{ '--picker-accent': emote.accent }}>
                        {emote.token}
                      </span>
                    )}
                    <span>{emote.name}</span>
                  </span>
                </div>
                <div className="dense-cell" data-label="Origen">
                  <span className="bridge-badge">{getEmoteSourceLabel(emote.source)}</span>
                </div>
                <div className="dense-cell" data-label="ID">
                  <code className="dense-code">{emote.id}</code>
                </div>
                <div className="dense-cell" data-label="Acciones">
                  <div className="row-actions">
                    <button
                      className="ghost-button compact-button"
                      onClick={() => onEditEmote(emote.id)}
                    >
                      Editar
                    </button>
                    <button
                      className="ghost-button compact-button"
                      onClick={() => onRemoveEmote(emote.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SimulationsSection({
  emoteCatalog,
  giftCatalog,
  onSampleEvent,
  title = 'Simular eventos',
  description = 'Estas pruebas entran por el backend y recorren la misma logica que un evento real del live.',
}) {
  const availableGiftCatalog = (giftCatalog.length ? giftCatalog : CURATED_GIFT_CATALOG).map(
    (gift, index) => normalizeGiftCatalogForPicker(gift, index),
  )
  const availableEmoteCatalog = Array.isArray(emoteCatalog)
    ? emoteCatalog.map((emote, index) => normalizeEmoteCatalogForPicker(emote, index))
    : []
  const [demoUser, setDemoUser] = useState('demo-live')
  const [likeCount, setLikeCount] = useState('100')
  const [commentText, setCommentText] = useState('!voz')
  const [giftSearch, setGiftSearch] = useState('')
  const [giftRepeatCount, setGiftRepeatCount] = useState('1')
  const [emoteSearch, setEmoteSearch] = useState('')
  const [selectedGiftId, setSelectedGiftId] = useState(() => availableGiftCatalog[0]?.id || '')
  const [selectedEmoteId, setSelectedEmoteId] = useState(() => availableEmoteCatalog[0]?.id || '')
  const filteredGiftCatalog = availableGiftCatalog.filter((gift) =>
    normalizePickerText(`${gift.name} ${gift.coins} ${gift.token}`).includes(
      normalizePickerText(giftSearch),
    ),
  )
  const selectedGift =
    filteredGiftCatalog.find((gift) => gift.id === selectedGiftId)
    || availableGiftCatalog.find((gift) => gift.id === selectedGiftId)
    || filteredGiftCatalog[0]
    || availableGiftCatalog[0]
    || null
  const filteredEmoteCatalog = availableEmoteCatalog.filter((emote) =>
    normalizePickerText(`${emote.name} ${emote.id} ${emote.token}`).includes(
      normalizePickerText(emoteSearch),
    ),
  )
  const selectedEmote =
    filteredEmoteCatalog.find((emote) => emote.id === selectedEmoteId)
    || availableEmoteCatalog.find((emote) => emote.id === selectedEmoteId)
    || filteredEmoteCatalog[0]
    || availableEmoteCatalog[0]
    || null

  return (
    <section className="panel-section" id="simulations">
      <SectionHeader
        eyebrow="Pruebas"
        title={title}
        description={description}
      />

      <div className="sim-grid">
        <article className="surface-card sim-card">
          <div className="card-top">
            <div>
              <h3>Disparar prueba</h3>
              <p>Ideal para revisar triggers, overlay y logs antes de salir en vivo.</p>
            </div>
            <span className="state-badge">Backend real</span>
          </div>

          <label className="field-label" htmlFor="sim-demo-user">
            Usuario de prueba
          </label>
          <input
            id="sim-demo-user"
            className="text-field"
            value={demoUser}
            onChange={(event) => setDemoUser(event.target.value)}
          />

          <div className="sim-button-grid">
            <button
              className="secondary-button"
              onClick={() => onSampleEvent({ type: 'follow', userName: demoUser || 'demo-follow' })}
            >
              Simular follow
            </button>
            <button
              className="secondary-button"
              onClick={() => onSampleEvent({ type: 'share', userName: demoUser || 'demo-share' })}
            >
              Simular share
            </button>
          </div>

          <div className="sim-inline-fields">
            <input
              className="text-field"
              inputMode="numeric"
              value={likeCount}
              onChange={(event) => setLikeCount(event.target.value)}
              placeholder="100"
            />
            <button
              className="secondary-button"
              onClick={() =>
                onSampleEvent({
                  type: 'like-burst',
                  userName: demoUser || 'demo-likes',
                  likeCount: Number.parseInt(likeCount || '0', 10) || 0,
                })
              }
            >
              Simular likes
            </button>
          </div>

          <div className="sim-inline-fields">
            <input
              className="text-field"
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder="Ej: !voz"
            />
            <button
              className="secondary-button"
              onClick={() =>
                onSampleEvent({
                  type: 'comment',
                  userName: demoUser || 'demo-chat',
                  comment: commentText || '!voz',
                })
              }
            >
              Simular chat
            </button>
          </div>

          <div className="sim-gift-controls">
            <div className="sim-inline-fields">
              <input
                className="text-field"
                value={giftSearch}
                onChange={(event) => setGiftSearch(event.target.value)}
                placeholder="Buscar gift"
              />
              <input
                className="text-field sim-count-field"
                inputMode="numeric"
                value={giftRepeatCount}
                onChange={(event) => setGiftRepeatCount(event.target.value)}
                placeholder="x1"
              />
            </div>

            <select
              className="text-field"
              value={selectedGift?.id || ''}
              onChange={(event) => setSelectedGiftId(event.target.value)}
            >
              {filteredGiftCatalog.map((gift) => (
                <option key={gift.id} value={gift.id}>
                  {gift.name} - {gift.coins} coin{gift.coins === 1 ? '' : 's'}
                </option>
              ))}
            </select>

            <button
              className="secondary-button"
              onClick={() =>
                onSampleEvent({
                  type: 'gift',
                  userName: demoUser || 'demo-gift',
                  giftName: selectedGift?.name || 'Rose',
                  repeatCount: Number.parseInt(giftRepeatCount || '1', 10) || 1,
                })
              }
            >
              Simular gift
            </button>
          </div>

          <div className="sim-gift-controls">
            <div className="sim-inline-fields">
              <input
                className="text-field"
                value={emoteSearch}
                onChange={(event) => setEmoteSearch(event.target.value)}
                placeholder="Buscar emote"
              />
              <button
                className="secondary-button"
                onClick={() =>
                  onSampleEvent({
                    type: 'emote',
                    userName: demoUser || 'demo-emote',
                    emoteId: selectedEmote?.id || 'demo-emote',
                    emoteName: selectedEmote?.name || 'Emote demo',
                    emoteImageUrl: selectedEmote?.imageUrl || '',
                  })
                }
                disabled={!selectedEmote}
              >
                Simular emote
              </button>
            </div>

            <select
              className="text-field"
              value={selectedEmote?.id || ''}
              onChange={(event) => setSelectedEmoteId(event.target.value)}
            >
              {filteredEmoteCatalog.length === 0 ? (
                <option value="">Todavia no hay emotes cargados</option>
              ) : (
                filteredEmoteCatalog.map((emote) => (
                  <option key={emote.id} value={emote.id}>
                    {emote.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </article>

        <article className="surface-card sim-card">
          <div className="card-top">
            <div>
              <h3>Catalogo activo</h3>
              <p>Gifts y emotes reales que ya vio tu live y quedaron guardados en el panel.</p>
            </div>
            <div className="tag-row">
              <span className="bridge-badge">
                {availableGiftCatalog.length} regalo{availableGiftCatalog.length === 1 ? '' : 's'}
              </span>
              <span className="bridge-badge">
                {availableEmoteCatalog.length} emote{availableEmoteCatalog.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {selectedGift ? (
            <div className="sim-gift-preview">
              {selectedGift.imageUrl ? (
                <img src={selectedGift.imageUrl} alt={selectedGift.name} className="gift-picker-image" />
              ) : (
                <span className="gift-picker-thumb" style={{ '--picker-accent': selectedGift.accent }}>
                  {selectedGift.token}
                </span>
              )}
              <div>
                <strong>{selectedGift.name}</strong>
                <p>
                  {selectedGift.coins} coin{selectedGift.coins === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          ) : (
            <p className="support-copy">Todavia no hay gifts cargados en el panel.</p>
          )}

          {selectedEmote ? (
            <div className="sim-gift-preview">
              {selectedEmote.imageUrl ? (
                <img
                  src={selectedEmote.imageUrl}
                  alt={selectedEmote.name}
                  className="gift-picker-image"
                />
              ) : (
                <span className="gift-picker-thumb" style={{ '--picker-accent': selectedEmote.accent }}>
                  {selectedEmote.token}
                </span>
              )}
              <div>
                <strong>{selectedEmote.name}</strong>
                <p>{selectedEmote.id}</p>
              </div>
            </div>
          ) : (
            <p className="support-copy">
              Todavia no vimos emotes en el live. Cuando alguien mande uno, se sumara aca.
            </p>
          )}

          <div className="sim-note-list">
            <div className="sim-note-item">
              <strong>Follow y share</strong>
              <span>Sirven para ver si la accion entra, hace match y se despacha.</span>
            </div>
            <div className="sim-note-item">
              <strong>Likes</strong>
              <span>Respeta reglas por cantidad, por ejemplo `100 likes`.</span>
            </div>
            <div className="sim-note-item">
              <strong>Chat</strong>
              <span>Perfecto para probar comandos como `!voz` o `!chaos`.</span>
            </div>
            <div className="sim-note-item">
              <strong>Gift</strong>
              <span>Usa el mismo nombre que luego llega desde TikTok.</span>
            </div>
            <div className="sim-note-item">
              <strong>Emote</strong>
              <span>Puede venir del live o de tu biblioteca local para configurarlo offline.</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}

function ActionsSection({
  actions,
  onCreateAction,
  onEditAction,
  onPreviewAction,
  onRemoveAction,
}) {
  return (
    <section className="panel-section" id="actions">
      <SectionHeader
        eyebrow="Biblioteca de acciones"
        title="Acciones"
        description="Aqui guardas todo lo que puede pasar despues: overlay, audio, GTA, Minecraft o TTS."
        action={
          <button className="primary-button" onClick={onCreateAction}>
            Crear accion
          </button>
        }
      />

      <ActionListTable
        actions={actions}
        onEditAction={onEditAction}
        onPreviewAction={onPreviewAction}
        onRemoveAction={onRemoveAction}
      />
    </section>
  )
}

function ActionListTable({ actions, onEditAction, onPreviewAction, onRemoveAction }) {
  const [searchQuery, setSearchQuery] = useState('')
  const filteredActions = actions.filter((action) =>
    normalizePickerText(
      `${action.name} ${action.description} ${getActionCommandSummary(action)} ${action.outputs.join(' ')} ${action.overlayText} ${action.mediaUrl}`,
    ).includes(normalizePickerText(searchQuery)),
  )

  return (
    <div className="list-shell">
      <div className="list-toolbar">
        <input
          className="text-field list-search"
          placeholder="Buscar acciones..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <span className="muted-pill">
          {filteredActions.length} accion{filteredActions.length === 1 ? '' : 'es'}
        </span>
      </div>

      <div className="dense-table">
        <div className="dense-table-head actions-layout">
          <span>Accion</span>
          <span>Salidas</span>
          <span>Comando</span>
          <span>Detalle</span>
          <span>Controles</span>
        </div>

        {filteredActions.length === 0 ? (
          <div className="empty-list">No encontre acciones con ese filtro.</div>
        ) : (
          filteredActions.map((action) => (
            <article key={action.id} className="dense-table-row actions-layout">
              <div className="dense-cell" data-label="Accion">
                <div className="row-title-wrap">
                  <strong className="row-title">{action.name}</strong>
                  <span className="row-subcopy">{action.description || 'Sin descripcion.'}</span>
                </div>
              </div>

              <div className="dense-cell" data-label="Salidas">
                <div className="output-chip-row">
                  {action.outputs.map((output) => (
                    <span key={output} className="tag">
                      {getOutputMeta(output)?.label || output}
                    </span>
                  ))}
                </div>
              </div>

              <div className="dense-cell" data-label="Comando">
                <code className="dense-code">{getActionCommandSummary(action) || 'Sin comando'}</code>
              </div>

              <div className="dense-cell" data-label="Detalle">
                <span className="row-subcopy">{getActionDetailLine(action)}</span>
              </div>

              <div className="dense-cell" data-label="Controles">
                <div className="row-actions">
                  <button className="secondary-button compact-button" onClick={() => onPreviewAction(action)}>
                    {isOverlayCapable(action) ? 'Probar' : 'Bridge'}
                  </button>
                  <button className="ghost-button compact-button" onClick={() => onEditAction(action.id)}>
                    Editar
                  </button>
                  <button className="ghost-button compact-button" onClick={() => onRemoveAction(action.id)}>
                    Eliminar
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}

function TriggersSection({
  actions,
  emoteCatalog,
  giftCatalog,
  onCreateTrigger,
  onEditTrigger,
  onRemoveTrigger,
  title = 'Eventos del live',
  description = 'Cada evento une una accion con un follow, gift, chat, emote o share.',
  triggers,
}) {
  return (
    <section className="panel-section" id="triggers">
      <SectionHeader
        eyebrow="Eventos"
        title={title}
        description={description}
        action={
          <button type="button" className="primary-button" onClick={onCreateTrigger} disabled={actions.length === 0}>
            Crear evento
          </button>
        }
      />

      <TriggerListTable
        actions={actions}
        emoteCatalog={emoteCatalog}
        giftCatalog={giftCatalog}
        onEditTrigger={onEditTrigger}
        onRemoveTrigger={onRemoveTrigger}
        triggers={triggers}
      />
    </section>
  )
}

function TriggerListTable({ actions, emoteCatalog, giftCatalog, onEditTrigger, onRemoveTrigger, triggers }) {
  const [searchQuery, setSearchQuery] = useState('')
  const normalizedGiftCatalog = (giftCatalog.length ? giftCatalog : CURATED_GIFT_CATALOG).map(
    (gift, index) => normalizeGiftCatalogForPicker(gift, index),
  )
  const normalizedEmoteCatalog = Array.isArray(emoteCatalog)
    ? emoteCatalog.map((emote, index) => normalizeEmoteCatalogForPicker(emote, index))
    : []
  const filteredTriggers = triggers.filter((trigger) => {
    const linkedAction = actions.find((action) => action.id === trigger.actionId)
    return normalizePickerText(
      `${trigger.source} ${trigger.match} ${linkedAction?.name || ''} ${linkedAction?.description || ''} ${getTriggerAudienceSummary(trigger)}`,
    ).includes(normalizePickerText(searchQuery))
  })

  function renderTriggerVisual(trigger) {
    if (trigger.source === 'gift') {
      const parsedGift = parseGiftTriggerMatch(trigger.match)
      const linkedGift = normalizedGiftCatalog.find(
        (gift) => normalizePickerText(gift.name) === normalizePickerText(parsedGift.giftName),
      )

      if (!linkedGift) {
        return <span className="trigger-type">{getTriggerLabel(trigger.source)}</span>
      }

      return (
        <span className="gift-inline-pill">
          {linkedGift.imageUrl ? (
            <img src={linkedGift.imageUrl} alt={linkedGift.name} className="gift-inline-image" />
          ) : (
            <span className="gift-inline-token" style={{ '--picker-accent': linkedGift.accent }}>
              {linkedGift.token}
            </span>
          )}
          <span>{linkedGift.name}</span>
        </span>
      )
    }

    if (trigger.source === 'emote') {
      const linkedEmote = normalizedEmoteCatalog.find(
        (emote) =>
          normalizePickerText(emote.name) === normalizePickerText(trigger.match)
          || normalizePickerText(emote.id) === normalizePickerText(trigger.match),
      )

      if (!linkedEmote) {
        return <span className="trigger-type">{getTriggerLabel(trigger.source)}</span>
      }

      return (
        <span className="gift-inline-pill">
          {linkedEmote.imageUrl ? (
            <img src={linkedEmote.imageUrl} alt={linkedEmote.name} className="gift-inline-image" />
          ) : (
            <span className="gift-inline-token" style={{ '--picker-accent': linkedEmote.accent }}>
              {linkedEmote.token}
            </span>
          )}
          <span>{linkedEmote.name}</span>
        </span>
      )
    }

    if (trigger.source !== 'gift') {
      return <span className="trigger-type">{getTriggerLabel(trigger.source)}</span>
    }

    return <span className="trigger-type">{getTriggerLabel(trigger.source)}</span>
  }

  return (
    <div className="list-shell">
      <div className="list-toolbar">
        <input
          className="text-field list-search"
          placeholder="Buscar eventos..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <span className="muted-pill">
          {filteredTriggers.length} evento{filteredTriggers.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="dense-table">
        <div className="dense-table-head triggers-layout">
          <span>Activador</span>
          <span>Regla</span>
          <span>Accion</span>
          <span>Acceso</span>
          <span>Controles</span>
        </div>

        {filteredTriggers.length === 0 ? (
          <div className="empty-list">No encontre eventos con ese filtro.</div>
        ) : (
          filteredTriggers.map((trigger) => {
            const linkedAction = actions.find((action) => action.id === trigger.actionId)

            return (
              <article key={trigger.id} className="dense-table-row triggers-layout">
                <div className="dense-cell" data-label="Activador">
                  {renderTriggerVisual(trigger)}
                </div>

                <div className="dense-cell" data-label="Regla">
                  <div className="row-title-wrap">
                    <strong className="row-title">{getTriggerRuleSummary(trigger)}</strong>
                    <span className="row-subcopy">{getTriggerLabel(trigger.source)}</span>
                  </div>
                </div>

                <div className="dense-cell" data-label="Accion">
                  <div className="row-title-wrap">
                    <strong className="row-title">{linkedAction?.name || 'Accion eliminada'}</strong>
                    <span className="row-subcopy">{linkedAction?.description || 'Sin descripcion.'}</span>
                  </div>
                </div>

                <div className="dense-cell" data-label="Acceso">
                  <div className="row-title-wrap">
                    <strong className="row-title">{getTriggerAudienceSummary(trigger)}</strong>
                    <span className="row-subcopy">{trigger.cooldownSeconds || '0'} seg de cooldown</span>
                  </div>
                </div>

                <div className="dense-cell" data-label="Controles">
                  <div className="row-actions">
                    <button className="ghost-button compact-button" onClick={() => onEditTrigger(trigger.id)}>
                      Editar
                    </button>
                    <button className="ghost-button compact-button" onClick={() => onRemoveTrigger(trigger.id)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}

function OverlaySection({
  linkFeedback,
  localOverlayUrl,
  localSmartBarUrl,
  mediaLibrary,
  mediaLibraryError,
  onAdjustSmartBarWins,
  onCopySmartBarUrl,
  onDeleteMedia,
  onCopyOverlayUrl,
  onOpenOverlayWindow,
  onOpenSmartBarWindow,
  onRefreshMedia,
  onResetSmartBarWins,
  onUploadMedia,
  publicOverlayUrl,
  publicSmartBarUrl,
  profile,
  serverPort,
  serverStatus,
  smartBar,
  updateSmartBarField,
  updateProfileField,
  isUploadingMedia,
}) {
  return (
    <section className="panel-section" id="overlay">
      <SectionHeader
        eyebrow="Salida visual"
        title="Overlay"
        description="Aqui dejas la URL, las claves y tu biblioteca local para las alertas."
      />

      <div className="overlay-grid">
        <article className="surface-card settings-card">
          <h3>Ajustes base</h3>

          <label className="field-label" htmlFor="project-name">
            Nombre del proyecto
          </label>
          <input
            id="project-name"
            className="text-field"
            value={profile.projectName}
            onChange={(event) => updateProfileField('projectName', event.target.value)}
          />

          <label className="field-label" htmlFor="streamer-name">
            Nombre del canal / creator
          </label>
          <input
            id="streamer-name"
            className="text-field"
            value={profile.streamerName}
            onChange={(event) => updateProfileField('streamerName', event.target.value)}
          />

          <label className="field-label" htmlFor="overlay-slug">
            Slug del overlay
          </label>
          <input
            id="overlay-slug"
            className="text-field"
            value={profile.overlaySlug}
            onChange={(event) => updateProfileField('overlaySlug', event.target.value)}
          />

          <label className="field-label" htmlFor="public-base-url">
            URL publica base
          </label>
          <input
            id="public-base-url"
            className="text-field"
            placeholder="https://tu-tunel.trycloudflare.com"
            value={profile.publicBaseUrl}
            onChange={(event) => updateProfileField('publicBaseUrl', event.target.value)}
          />

          <label className="field-label" htmlFor="overlay-duration">
            Duracion de alerta en ms
          </label>
          <input
            id="overlay-duration"
            className="text-field"
            value={profile.overlayDurationMs}
            onChange={(event) => updateProfileField('overlayDurationMs', event.target.value)}
          />

          <label className="field-label" htmlFor="dashboard-key">
            Clave del panel
          </label>
          <input
            id="dashboard-key"
            type="password"
            className="text-field"
            placeholder="Protege dashboard, APIs y sockets internos"
            value={profile.dashboardKey}
            onChange={(event) => updateProfileField('dashboardKey', event.target.value)}
          />

          <label className="field-label" htmlFor="overlay-key">
            Clave publica del overlay
          </label>
          <input
            id="overlay-key"
            type="password"
            className="text-field"
            placeholder="Opcional para proteger el browser source"
            value={profile.overlayKey}
            onChange={(event) => updateProfileField('overlayKey', event.target.value)}
          />

          <p className="support-copy">
            La URL publica base debe ser solo el dominio del tunel o tu sitio. Si configuras una
            clave de overlay, la app la agrega automaticamente al link final con `?key=...`.
          </p>
        </article>

        <article className="surface-card link-card">
          <span className="signal-label">Links del overlay</span>
          <div className="link-stack">
            <div>
              <span className="snippet-label">Local</span>
              <code className="overlay-link">{localOverlayUrl}</code>
            </div>
            <div>
              <span className="snippet-label">Publica</span>
              <code className="overlay-link">
                {publicOverlayUrl || 'Completa la URL publica base para generar el link real.'}
              </code>
            </div>
          </div>
          <p>Usa la URL publica en LIVE Studio. La local te sirve para ver el overlay en tu PC.</p>
          <div className="card-actions">
            <button className="primary-button" onClick={onCopyOverlayUrl}>
              {publicOverlayUrl ? 'Copiar URL publica' : 'Copiar URL local'}
            </button>
            <button className="secondary-button" onClick={onOpenOverlayWindow}>
              Abrir overlay local
            </button>
          </div>
          {linkFeedback ? <span className="feedback-pill">{linkFeedback}</span> : null}
        </article>

        <article className="surface-card settings-card">
          <h3>Smart bar</h3>

          <div className="smartbar-preview-shell">
            <span className="snippet-label">Vista previa</span>
            <SmartBarWidget smartBar={smartBar} smartBarStatus={serverStatus.smartBar} compact />
          </div>

          <label className="field-label" htmlFor="smartbar-title">
            Titulo
          </label>
          <input
            id="smartbar-title"
            className="text-field"
            value={smartBar.title || ''}
            onChange={(event) => updateSmartBarField('title', event.target.value)}
          />

          <label className="field-label" htmlFor="smartbar-goal">
            Meta de victorias
          </label>
          <input
            id="smartbar-goal"
            className="text-field"
            value={smartBar.winGoal || ''}
            onChange={(event) => updateSmartBarField('winGoal', event.target.value)}
          />

          <div className="smartbar-counter">
            <button className="secondary-button" onClick={() => onAdjustSmartBarWins(-1)}>
              -
            </button>
            <div className="smartbar-counter-value">
              <span className="snippet-label">Victorias</span>
              <strong>{Number(smartBar.currentWins || 0)}</strong>
            </div>
            <button className="primary-button" onClick={() => onAdjustSmartBarWins(1)}>
              +
            </button>
          </div>

          <div className="card-actions">
            <button className="ghost-button compact-button" onClick={onResetSmartBarWins}>
              Reset wins
            </button>
          </div>

          <div className="option-grid">
            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(smartBar.showWins)}
                onChange={(event) => updateSmartBarField('showWins', event.target.checked)}
              />
              <div>
                <strong>Mostrar wins</strong>
                <span>Contador manual para retos y metas del directo.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(smartBar.showCoins)}
                onChange={(event) => updateSmartBarField('showCoins', event.target.checked)}
              />
              <div>
                <strong>Mostrar coins</strong>
                <span>Suma los coins reales que entran por gifts.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(smartBar.showFollows)}
                onChange={(event) => updateSmartBarField('showFollows', event.target.checked)}
              />
              <div>
                <strong>Mostrar follows</strong>
                <span>Cuenta nuevos follows en la sesion actual.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(smartBar.showLiveDuration)}
                onChange={(event) => updateSmartBarField('showLiveDuration', event.target.checked)}
              />
              <div>
                <strong>Mostrar tiempo</strong>
                <span>Reloj del live desde que conectas TikTok.</span>
              </div>
            </label>
          </div>

          <div className="mini-grid">
            <div>
              <span className="snippet-label">Coins recibidos</span>
              <p>{serverStatus.smartBar.receivedCoins}</p>
            </div>
            <div>
              <span className="snippet-label">Follows nuevos</span>
              <p>{serverStatus.smartBar.followCount}</p>
            </div>
            <div>
              <span className="snippet-label">Tiempo en live</span>
              <p>{formatDurationClock(serverStatus.smartBar.liveDurationMs)}</p>
            </div>
            <div>
              <span className="snippet-label">Sesion</span>
              <p>{serverStatus.smartBar.connected ? 'En vivo' : 'Stand by'}</p>
            </div>
          </div>

          <div className="link-stack">
            <div>
              <span className="snippet-label">Smart bar local</span>
              <code className="overlay-link">{localSmartBarUrl}</code>
            </div>
            <div>
              <span className="snippet-label">Smart bar publica</span>
              <code className="overlay-link">
                {publicSmartBarUrl || 'Completa la URL publica base para generar el link real.'}
              </code>
            </div>
          </div>

          <div className="card-actions">
            <button className="primary-button" onClick={onCopySmartBarUrl}>
              {publicSmartBarUrl ? 'Copiar smart bar publica' : 'Copiar smart bar local'}
            </button>
            <button className="secondary-button" onClick={onOpenSmartBarWindow}>
              Abrir smart bar local
            </button>
          </div>

          <p className="support-copy">
            Este widget combina victorias manuales con follows, coins y tiempo real del live.
          </p>
        </article>

        <article className="surface-card checklist-card">
          <h3>Backend local y tunel</h3>
          <label className="field-label" htmlFor="minecraft-host">
            Minecraft host
          </label>
          <input
            id="minecraft-host"
            className="text-field"
            value={profile.minecraftHost}
            onChange={(event) => updateProfileField('minecraftHost', event.target.value)}
          />

          <label className="field-label" htmlFor="minecraft-port">
            Minecraft RCON port
          </label>
          <input
            id="minecraft-port"
            className="text-field"
            value={profile.minecraftPort}
            onChange={(event) => updateProfileField('minecraftPort', event.target.value)}
          />

          <label className="field-label" htmlFor="minecraft-password">
            Minecraft RCON password
          </label>
          <input
            id="minecraft-password"
            type="password"
            className="text-field"
            value={profile.minecraftPassword}
            onChange={(event) => updateProfileField('minecraftPassword', event.target.value)}
          />

          <p className="support-copy">
            El backend corre en el puerto <strong>{serverPort}</strong>. Si completas el RCON, las
            acciones de Minecraft intentan enviar el comando real.
          </p>
          <div className="snippet-block">
            <span className="snippet-label">Comando rapido</span>
            <code>npm run public</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Tunel manual</span>
            <code>npm run tunnel</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Configurar ngrok</span>
            <code>npm run tunnel:auth -- TU_TOKEN</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Fallback LocalTunnel</span>
            <code>npm run tunnel:localtunnel</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Fallback Cloudflare</span>
            <code>npm run tunnel:cloudflare</code>
          </div>
          <ul className="checklist">
            <li>Guarda la configuracion en el server local.</li>
            <li>Expone una URL publica valida para LIVE Studio.</li>
            <li>Puede proteger panel y overlay con claves simples.</li>
            <li>Permite disparar comandos de Minecraft por RCON.</li>
            <li>Deja lista la conexion websocket para mods de GTA V.</li>
            <li>Mantiene el overlay en la misma app.</li>
          </ul>
        </article>

        <article className="surface-card media-library-card">
          <div className="card-top">
            <div>
              <h3>Biblioteca local</h3>
              <p>Sube videos, GIFs, imagenes o audios para reutilizarlos en cualquier accion.</p>
            </div>
            <span className="state-badge">{mediaLibrary.length} items</span>
          </div>

          <div className="card-actions">
            <label className="secondary-button upload-button">
              {isUploadingMedia ? 'Subiendo...' : 'Subir archivo'}
              <input
                type="file"
                hidden
                accept="image/*,video/*,audio/*,.gif,.webm,.mp4,.mp3,.wav,.png,.jpg,.jpeg,.webp,.svg"
                onChange={async (event) => {
                  const file = event.target.files?.[0]

                  if (!file) {
                    return
                  }

                  try {
                    await onUploadMedia(file)
                  } finally {
                    event.target.value = ''
                  }
                }}
              />
            </label>
            <button className="ghost-button" onClick={onRefreshMedia}>
              Recargar biblioteca
            </button>
          </div>

          {mediaLibraryError ? <div className="error-box">{mediaLibraryError}</div> : null}

          <div className="media-grid">
            {mediaLibrary.length === 0 ? (
              <p className="support-copy">Todavia no cargaste archivos locales.</p>
            ) : (
              mediaLibrary.map((item) => (
                <article key={item.id} className="media-item">
                  <div className="media-item-head">
                    <span className="bridge-badge">{item.kind}</span>
                    <button className="ghost-button compact-button" onClick={() => onDeleteMedia(item.fileName)}>
                      Quitar
                    </button>
                  </div>
                  <strong>{item.fileName}</strong>
                  <code>{item.url}</code>
                </article>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  )
}

function BridgesSection({
  chaosModCatalog,
  chaosModSourcePath,
  dashboardKey,
  remoteBaseUrl,
  serverStatus,
}) {
  const remoteMinecraftSocket = buildWebSocketUrl(remoteBaseUrl, '/ws/minecraft', dashboardKey)
  const remoteGtaSocket = buildWebSocketUrl(remoteBaseUrl, '/ws/gta', dashboardKey)
  const localMinecraftSocket = `ws://127.0.0.1:${LOCAL_BRIDGE_DEFAULTS.minecraftPort}`
  const localGtaSocket = `ws://127.0.0.1:${LOCAL_BRIDGE_DEFAULTS.gtaPort}`

  return (
    <section className="panel-section" id="bridges">
      <SectionHeader
        eyebrow="Integraciones"
        title="Bridge local para juegos"
        description="El overlay ya corre publico. Los juegos necesitan un agente local en tu PC para ejecutar lo que llega desde Railway."
      />

      <div className="bridge-grid">
        <article className="surface-card bridge-card">
          <span className="bridge-badge">Bridge local</span>
          <h3>Agente para tu PC gamer</h3>
          <p>Ejecuta este proceso en la misma PC donde estan Minecraft, GTA o tu mod local.</p>
          <div className="snippet-block">
            <span className="snippet-label">Comando</span>
            <code>npm run bridge:start</code>
          </div>
          <p className="support-copy">
            La primera vez te crea `bridge-config.json`. Ahi pones la URL publica de Railway,
            el `dashboardKey` si lo usas, y los datos de RCON/local sockets.
          </p>
        </article>

        <article className="surface-card bridge-card">
          <span className="bridge-badge">Feed remoto</span>
          <h3>Canales que escucha el bridge</h3>
          <p>Tu bridge local se conecta a estos sockets del backend publico y recibe eventos listos para ejecutar.</p>
          <div className="snippet-block">
            <span className="snippet-label">Minecraft remoto</span>
            <code>{remoteMinecraftSocket}</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">GTA remoto</span>
            <code>{remoteGtaSocket}</code>
          </div>
          <p className="support-copy">Clientes remotos conectados ahora: Minecraft {serverStatus.bridges.minecraftClients}, GTA {serverStatus.bridges.gtaClients}.</p>
        </article>

        <article className="surface-card bridge-card">
          <span className="bridge-badge">Salidas locales</span>
          <h3>Donde se conectan tus juegos</h3>
          <p>El bridge levanta sockets locales para tus mods y, si quieres, tambien manda comandos por RCON a Minecraft.</p>
          <div className="snippet-block">
            <span className="snippet-label">Minecraft local / mod</span>
            <code>{localMinecraftSocket}</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">GTA local / mod</span>
            <code>{localGtaSocket}</code>
          </div>
          <p className="support-copy">Si activas RCON en el config local, Minecraft tambien recibe `commandText` directo sin mod adicional.</p>
        </article>

        <article className="surface-card bridge-card">
          <span className="bridge-badge">ChaosMod</span>
          <h3>Catalogo para GTA V</h3>
          <p>
            Si el bridge encuentra tu carpeta de ChaosMod, sube el catalogo a la app y te deja
            elegir efectos desde el modal de acciones.
          </p>
          <div className="snippet-block">
            <span className="snippet-label">Efectos sincronizados</span>
            <code>{chaosModCatalog.length}</code>
          </div>
          {chaosModSourcePath ? (
            <div className="snippet-block">
              <span className="snippet-label">Carpeta detectada</span>
              <code>{chaosModSourcePath}</code>
            </div>
          ) : null}
          <p className="support-copy">
            Para dispararlos directo, el bridge usa el menu interno de ChaosMod. Conviene dejar
            `Enable effects menu` activo y evitar mover ese menu manualmente mientras juegas.
          </p>
        </article>
      </div>
    </section>
  )
}

function OverlayScreen({ slug }) {
  const [appState, setAppState] = useState(() => readStoredState())
  const [currentEvent, setCurrentEvent] = useState(null)
  const [overlayError, setOverlayError] = useState('')
  const seenEventIds = useRef(new Set())
  const queuedEventsRef = useRef([])
  const isShowingEventRef = useRef(false)
  const audioRef = useRef(null)
  const overlayAccessKey = readOverlayAccessKeyFromUrl()

  function playNextEvent() {
    if (isShowingEventRef.current) {
      return
    }

    const nextEvent = queuedEventsRef.current.shift()

    if (!nextEvent) {
      return
    }

    isShowingEventRef.current = true
    setCurrentEvent(nextEvent)
  }

  useEffect(() => {
    document.documentElement.dataset.route = 'overlay'
    document.body.dataset.route = 'overlay'

    let socket
    let reconnectTimeoutId
    let isStopped = false
    let canConnectSocket = false

    function enqueueEvent(eventPayload) {
      if (!eventPayload?.id || seenEventIds.current.has(eventPayload.id)) {
        return
      }

      seenEventIds.current.add(eventPayload.id)
      queuedEventsRef.current.push(eventPayload)
      playNextEvent()
    }

    async function loadProfile() {
      try {
        const overlayProfile = await requestJson(
          `/api/overlay/${encodeURIComponent(slug)}${
            overlayAccessKey ? `?key=${encodeURIComponent(overlayAccessKey)}` : ''
          }`,
        )
        setAppState((currentState) =>
          mergeStateWithDefaults({
            ...currentState,
            profile: overlayProfile.profile,
            widgets: overlayProfile.widgets,
          }),
        )
        setOverlayError('')
        canConnectSocket = true
      } catch (error) {
        if (error?.status === 401) {
          setOverlayError('Este overlay necesita la clave publica correcta en la URL.')
          return
        }

        if (error?.status === 404) {
          setOverlayError('No encontre ese slug de overlay. Revisa la URL publica.')
          return
        }

        setAppState(readStoredState())
        setOverlayError('')
      }
    }

    function connectSocket() {
      socket = new WebSocket(createSocketUrl('/ws/overlay', { key: overlayAccessKey }))

      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data)

          if (payload.type === 'overlay-state') {
            setAppState((currentState) =>
              mergeStateWithDefaults({
                ...currentState,
                profile: payload.payload.profile,
                widgets: payload.payload.widgets,
              }),
            )
          }

          if (payload.type === 'overlay-event') {
            enqueueEvent(payload.payload)
          }
        } catch {
          return
        }
      }

      socket.onclose = () => {
        if (isStopped) {
          return
        }

        reconnectTimeoutId = window.setTimeout(connectSocket, 1500)
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    async function bootOverlay() {
      await loadProfile()

      if (!isStopped && canConnectSocket) {
        connectSocket()
      }
    }

    bootOverlay()

    return () => {
      isStopped = true
      window.clearTimeout(reconnectTimeoutId)
      socket?.close()
    }
  }, [overlayAccessKey, slug])

  useEffect(() => {
    if (!currentEvent) {
      return undefined
    }

    if (currentEvent.ttsText && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(currentEvent.ttsText))
    }

    const audioUrl = currentEvent.audioUrl || ''

    if (audioUrl && detectMediaKind(audioUrl) === 'audio') {
      const audio = new Audio(audioUrl)
      audio.volume = 1
      audio.play().catch(() => {})
      audioRef.current = audio
    }

    const timeoutId = window.setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }

      isShowingEventRef.current = false
      setCurrentEvent(null)
      playNextEvent()
    }, currentEvent.durationMs || 5000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentEvent])

  const mediaKind = detectMediaKind(currentEvent?.mediaUrl)
  const shouldRenderCleanMedia =
    Boolean(currentEvent)
    && ['image', 'video'].includes(mediaKind)
    && currentEvent.outputs?.includes('overlayMedia')
    && !currentEvent.outputs?.includes('overlayAlert')

  return (
    <div className="overlay-screen">
      <div className={`overlay-stage ${shouldRenderCleanMedia ? 'clean-media' : ''}`}>
        {overlayError ? (
          <div className="overlay-idle">
            <span className="overlay-idle-label">Overlay bloqueado</span>
            <h1>{appState.profile.projectName}</h1>
            <p>{overlayError}</p>
          </div>
        ) : shouldRenderCleanMedia ? (
          <>
            {mediaKind === 'image' ? (
              <img
                className="overlay-media overlay-media-clean"
                src={currentEvent.mediaUrl}
                alt={currentEvent.title || 'Overlay media'}
              />
            ) : null}

            {mediaKind === 'video' ? (
              <video
                className="overlay-media overlay-media-clean"
                src={currentEvent.mediaUrl}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
              />
            ) : null}
          </>
        ) : currentEvent ? (
          <article className={`overlay-card theme-${currentEvent.theme || 'ember'}`}>
            <div className="overlay-card-head">
              <span className="overlay-source">{currentEvent.sourceLabel || appState.profile.streamerName}</span>
              <span className="overlay-project">{appState.profile.projectName}</span>
            </div>

            <h1>{currentEvent.title}</h1>
            <p>{currentEvent.message}</p>

            {currentEvent.commandText ? (
              <code className="overlay-command">{currentEvent.commandText}</code>
            ) : null}

            {mediaKind === 'image' ? (
              <img className="overlay-media" src={currentEvent.mediaUrl} alt={currentEvent.title} />
            ) : null}

            {mediaKind === 'video' ? (
              <video className="overlay-media" src={currentEvent.mediaUrl} autoPlay muted loop />
            ) : null}
          </article>
        ) : null}
      </div>
    </div>
  )
}

function SmartBarWidget({ smartBar, smartBarStatus, compact = false }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  const wins = Math.max(0, Number(smartBar?.currentWins || 0))
  const goal = getSmartBarGoalValue(smartBar)
  const progressPercent = goal > 0 ? Math.min(100, Math.round((wins / goal) * 100)) : 0
  const secondaryMetrics = buildSmartBarMetrics(smartBar || {}, smartBarStatus || {}, now)

  return (
    <article className={`smartbar-card ${compact ? 'compact' : ''}`}>
      <div className="smartbar-topline">
        <div className="smartbar-brand">
          <span className="smartbar-kicker">Live widget</span>
          <strong className="smartbar-title">{smartBar?.title || 'Marcador del live'}</strong>
        </div>
        <span className={`status-chip ${smartBarStatus?.connected ? 'ok' : 'off'}`}>
          {smartBarStatus?.connected ? 'LIVE' : 'Stand by'}
        </span>
      </div>

      <div className="smartbar-body">
        {smartBar?.showWins ? (
          <div className="smartbar-primary">
            <div className="smartbar-primary-head">
              <span className="smartbar-primary-token">W</span>
              <div className="smartbar-primary-copy">
                <span className="smartbar-primary-label">Victorias</span>
                <strong>
                  {wins}
                  {goal > 0 ? ` / ${goal}` : ''}
                </strong>
              </div>
            </div>

            <div className="smartbar-progress">
              <div
                className="smartbar-progress-bar"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <span className="smartbar-progress-label">
              {goal > 0 ? `${progressPercent}% de la meta` : 'Sin meta definida'}
            </span>
          </div>
        ) : null}

        <div className="smartbar-secondary">
          {secondaryMetrics.length === 0 ? (
            <div className="smartbar-metric">
              <span className="smartbar-metric-label">Panel</span>
              <strong>Activa coins, follows o tiempo para completar la barra.</strong>
            </div>
          ) : (
            secondaryMetrics.map((metric) => (
              <div key={metric.id} className="smartbar-metric">
                <span className="smartbar-metric-label">{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))
          )}
        </div>
      </div>
    </article>
  )
}

function SongRequestWidget({ music, musicStatus, preview = false }) {
  const queue = Array.isArray(music?.queue)
    ? music.queue
    : Array.isArray(musicStatus?.queue)
      ? musicStatus.queue
      : []
  const currentTrack = musicStatus?.currentPlayback?.track || null
  const maxVisible = Math.max(1, Number.parseInt(String(music?.overlayMaxVisible || '3'), 10) || 3)
  const visibleQueue = music?.overlayShowQueue
    ? queue.filter((entry) => ['queued', 'sent'].includes(entry.status)).slice(0, maxVisible)
    : []

  if (!preview && !currentTrack && visibleQueue.length === 0) {
    return null
  }

  return (
    <article className={`songrequest-card ${preview ? 'compact' : ''}`}>
      <div className="songrequest-topline">
        <div className="songrequest-brand">
          <span className="songrequest-kicker">Music widget</span>
          <strong className="songrequest-title">{music?.overlayTitle || 'Song Request'}</strong>
        </div>
        <span className={`status-chip ${musicStatus?.connected ? 'ok' : 'off'}`}>
          {musicStatus?.connected ? 'Spotify listo' : 'Sin conexion'}
        </span>
      </div>

      {currentTrack ? (
        <div className="songrequest-current">
          {currentTrack.imageUrl ? (
            <img src={currentTrack.imageUrl} alt={currentTrack.name} className="songrequest-cover" />
          ) : (
            <div className="songrequest-cover songrequest-cover-fallback">SP</div>
          )}
          <div className="songrequest-copy">
            <span className="songrequest-label">Sonando ahora</span>
            <strong>{currentTrack.name}</strong>
            <span>{Array.isArray(currentTrack.artists) ? currentTrack.artists.join(', ') : ''}</span>
            <span className="row-subcopy">
              {currentTrack.albumName || 'Spotify'} · {formatDurationClock(currentTrack.durationMs || 0)}
            </span>
          </div>
        </div>
      ) : preview ? (
        <div className="songrequest-current empty">
          <div className="songrequest-cover songrequest-cover-fallback">♪</div>
          <div className="songrequest-copy">
            <span className="songrequest-label">Sonando ahora</span>
            <strong>Tu proxima cancion aparecera aqui</strong>
            <span>Conecta Spotify y deja el widget listo para el directo.</span>
          </div>
        </div>
      ) : null}

      {music?.overlayShowQueue ? (
        <div className="songrequest-queue">
          <div className="card-top">
            <h3>Lo que sigue</h3>
            <span className="state-badge">{visibleQueue.length}</span>
          </div>

          {visibleQueue.length === 0 ? (
            preview ? <div className="empty-list">La cola visible aparecera aqui.</div> : null
          ) : (
            <div className="songrequest-list">
              {visibleQueue.map((requestItem, index) => (
                <div key={requestItem.id} className="songrequest-row">
                  <span className="songrequest-row-index">{index + 1}</span>
                  <div className="songrequest-row-copy">
                    <strong>{requestItem.name}</strong>
                    <span>{Array.isArray(requestItem.artists) ? requestItem.artists.join(', ') : ''}</span>
                    {music?.overlayShowRequester ? (
                      <span className="row-subcopy">Pedido por {requestItem.requester}</span>
                    ) : null}
                  </div>
                  <span className="songrequest-row-duration">
                    {formatDurationClock(requestItem.durationMs || 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </article>
  )
}

function SmartBarScreen({ slug }) {
  const [appState, setAppState] = useState(() => readStoredState())
  const [smartBarStatus, setSmartBarStatus] = useState(DEFAULT_SERVER_STATUS.smartBar)
  const [overlayError, setOverlayError] = useState('')
  const overlayAccessKey = readOverlayAccessKeyFromUrl()

  useEffect(() => {
    document.documentElement.dataset.route = 'overlay'
    document.body.dataset.route = 'overlay'

    let socket
    let reconnectTimeoutId
    let isStopped = false
    let canConnectSocket = false

    async function loadOverlayState() {
      try {
        const overlayPayload = await requestJson(
          `/api/overlay/${encodeURIComponent(slug)}${
            overlayAccessKey ? `?key=${encodeURIComponent(overlayAccessKey)}` : ''
          }`,
        )

        setAppState((currentState) =>
          mergeStateWithDefaults({
            ...currentState,
            profile: overlayPayload.profile,
            widgets: overlayPayload.widgets,
          }),
        )
        setSmartBarStatus(overlayPayload.smartBar || DEFAULT_SERVER_STATUS.smartBar)
        setOverlayError('')
        canConnectSocket = true
      } catch (error) {
        if (error?.status === 401) {
          setOverlayError('Este widget necesita la clave publica correcta en la URL.')
          return
        }

        setOverlayError('No pude cargar el smart bar desde el backend.')
      }
    }

    function connectSocket() {
      socket = new WebSocket(createSocketUrl('/ws/overlay', { key: overlayAccessKey }))

      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data)

          if (payload.type === 'overlay-state') {
            setAppState((currentState) =>
              mergeStateWithDefaults({
                ...currentState,
                profile: payload.payload.profile,
                widgets: payload.payload.widgets,
              }),
            )
            setSmartBarStatus(payload.payload.smartBar || DEFAULT_SERVER_STATUS.smartBar)
          }
        } catch {
          return
        }
      }

      socket.onclose = () => {
        if (isStopped) {
          return
        }

        reconnectTimeoutId = window.setTimeout(connectSocket, 1500)
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    async function bootSmartBar() {
      await loadOverlayState()

      if (!isStopped && canConnectSocket) {
        connectSocket()
      }
    }

    bootSmartBar()

    return () => {
      isStopped = true
      window.clearTimeout(reconnectTimeoutId)
      socket?.close()
    }
  }, [overlayAccessKey, slug])

  const smartBar = appState.widgets?.smartBar || {}

  if (overlayError) {
    return (
      <div className="overlay-screen">
        <div className="overlay-stage">
          <div className="overlay-idle">
            <span className="overlay-idle-label">Smart bar bloqueado</span>
            <h1>{appState.profile.projectName}</h1>
            <p>{overlayError}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="overlay-screen smartbar-screen">
      <div className="smartbar-stage">
        <SmartBarWidget smartBar={smartBar} smartBarStatus={smartBarStatus} />
      </div>
    </div>
  )
}

function SongRequestScreen({ slug }) {
  const [appState, setAppState] = useState(() => readStoredState())
  const [musicStatus, setMusicStatus] = useState(DEFAULT_SERVER_STATUS.music)
  const [overlayError, setOverlayError] = useState('')
  const overlayAccessKey = readOverlayAccessKeyFromUrl()

  useEffect(() => {
    document.documentElement.dataset.route = 'overlay'
    document.body.dataset.route = 'overlay'

    let socket = null
    let reconnectTimeoutId = 0
    let isStopped = false
    let canConnectSocket = false

    async function loadOverlayState() {
      try {
        const overlayPayload = await requestJson(
          `/api/overlay/${encodeURIComponent(slug)}${
            overlayAccessKey ? `?key=${encodeURIComponent(overlayAccessKey)}` : ''
          }`,
        )
        setAppState((currentState) =>
          mergeStateWithDefaults({
            ...currentState,
            profile: overlayPayload.profile,
            widgets: overlayPayload.widgets,
            music: {
              ...currentState.music,
              ...(overlayPayload.music || currentState.music || {}),
            },
          }),
        )
        setMusicStatus(overlayPayload.music || DEFAULT_SERVER_STATUS.music)
        setOverlayError('')
        canConnectSocket = true
      } catch (error) {
        if (error?.status === 401) {
          setOverlayError('Este widget necesita la clave publica correcta en la URL.')
          return
        }

        if (error?.status === 404) {
          setOverlayError('No encontre ese slug de overlay. Revisa la URL publica.')
          return
        }

        setOverlayError('No pude cargar el widget de musica.')
      }
    }

    function connectSocket() {
      const socketUrl = buildWebSocketUrl(window.location.origin, '/ws/overlay', overlayAccessKey)
      socket = new WebSocket(socketUrl)

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)

          if (payload.type === 'overlay-state') {
            setAppState((currentState) =>
              mergeStateWithDefaults({
                ...currentState,
                profile: {
                  ...currentState.profile,
                  ...(payload.payload?.profile || {}),
                },
                widgets: {
                  ...currentState.widgets,
                  ...(payload.payload?.widgets || {}),
                },
                music: {
                  ...currentState.music,
                  ...(payload.payload?.music || {}),
                },
              }),
            )
            setMusicStatus(payload.payload?.music || DEFAULT_SERVER_STATUS.music)
          }
        } catch {
          return
        }
      }

      socket.onclose = () => {
        if (!isStopped) {
          reconnectTimeoutId = window.setTimeout(connectSocket, 1500)
        }
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    async function bootSongRequest() {
      await loadOverlayState()

      if (!isStopped && canConnectSocket) {
        connectSocket()
      }
    }

    bootSongRequest()

    return () => {
      isStopped = true
      window.clearTimeout(reconnectTimeoutId)
      socket?.close()
    }
  }, [overlayAccessKey, slug])

  const music = appState.music || DEFAULT_APP_STATE.music

  if (overlayError) {
    return (
      <div className="overlay-screen">
        <div className="overlay-stage">
          <div className="overlay-idle">
            <span className="overlay-idle-kicker">Widget bloqueado</span>
            <strong>{overlayError}</strong>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="overlay-screen songrequest-screen">
      <div className="songrequest-stage">
        <SongRequestWidget music={music} musicStatus={musicStatus} />
      </div>
    </div>
  )
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="section-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

function ActionModal({
  chaosModCatalog,
  initialAction,
  isUploadingMedia,
  mediaLibrary,
  mediaLibraryError,
  onClose,
  onSave,
  onUploadMedia,
}) {
  const [draft, setDraft] = useState(() => createActionDraft(initialAction))
  const [errorMessage, setErrorMessage] = useState('')
  const [gtaCommandSearch, setGtaCommandSearch] = useState('')
  const [gtaCommandCategory, setGtaCommandCategory] = useState('all')
  const [minecraftCommandSearch, setMinecraftCommandSearch] = useState('')
  const [minecraftCommandCategory, setMinecraftCommandCategory] = useState('all')
  const isEditing = Boolean(initialAction?.id)
  const selectedMediaItem =
    mediaLibrary.find((item) => item.url === draft.mediaUrl || item.fileName === draft.mediaUrl) || null
  const selectedBedrockBoxPreset =
    BEDROCK_BOX_PRESETS.find((item) => item.id === draft.minecraftBedrockPresetId) || null
  const selectedChaosModEffect =
    chaosModCatalog.find((item) => item.id === draft.gtaChaosEffectId) || null
  const usesMinecraftOutput = draft.outputs.includes('minecraft')
  const usesGtaOutput = draft.outputs.includes('gta')
  const usesBedrockBox = usesMinecraftOutput && draft.minecraftMode === 'bedrock-box'
  const usesChaosMod = usesGtaOutput && draft.gtaMode === 'chaosmod'
  const availableBedrockBoxCategories = [
    'all',
    ...Array.from(new Set(BEDROCK_BOX_PRESETS.map((item) => item.category || '').filter(Boolean))).sort(
      (left, right) => left.localeCompare(right),
    ),
  ]
  const visibleBedrockBoxPresets = BEDROCK_BOX_PRESETS.filter((preset) => {
    const matchesSearch = !normalizePickerText(minecraftCommandSearch)
      || normalizePickerText(`${preset.name} ${preset.category} ${preset.commandText}`).includes(
        normalizePickerText(minecraftCommandSearch),
      )
    const matchesCategory = minecraftCommandCategory === 'all' || preset.category === minecraftCommandCategory

    return matchesSearch && matchesCategory
  })
  const availableChaosModCategories = [
    'all',
    ...Array.from(
      new Set(
        chaosModCatalog
          .map((item) => item.categoryLabel || item.category || '')
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right)),
  ]
  const visibleChaosModEffects = chaosModCatalog.filter((effect) => {
    const matchesSearch = !normalizePickerText(gtaCommandSearch)
      || normalizePickerText(`${effect.name} ${effect.categoryLabel} ${effect.category}`).includes(
        normalizePickerText(gtaCommandSearch),
      )
    const effectCategory = effect.categoryLabel || effect.category || ''
    const matchesCategory = gtaCommandCategory === 'all' || effectCategory === gtaCommandCategory

    return matchesSearch && matchesCategory
  })

  useEffect(() => {
    setDraft(createActionDraft(initialAction))
    setErrorMessage('')
    setGtaCommandSearch('')
    setGtaCommandCategory('all')
    setMinecraftCommandSearch('')
    setMinecraftCommandCategory('all')
  }, [initialAction])

  function toggleOutput(outputId) {
    setDraft((currentDraft) => {
      const isSelected = currentDraft.outputs.includes(outputId)

      return {
        ...currentDraft,
        outputs: isSelected
          ? currentDraft.outputs.filter((output) => output !== outputId)
          : [...currentDraft.outputs, outputId],
      }
    })
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!draft.name.trim()) {
      setErrorMessage('Ponle un nombre a la accion.')
      return
    }

    if (draft.outputs.length === 0) {
      setErrorMessage('Selecciona al menos una salida.')
      return
    }

    if (usesChaosMod && !draft.gtaChaosEffectId.trim()) {
      setErrorMessage('Elige un efecto de ChaosMod para esta accion.')
      return
    }

    if (usesBedrockBox && !draft.minecraftBedrockPresetId.trim()) {
      setErrorMessage('Elige un preset de Bedrock Box para esta accion.')
      return
    }

    onSave({
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      commandText: draft.commandText.trim(),
      minecraftBedrockPresetId: draft.minecraftBedrockPresetId.trim(),
      minecraftBedrockPresetName: draft.minecraftBedrockPresetName.trim(),
      gtaChaosEffectId: draft.gtaChaosEffectId.trim(),
      gtaChaosEffectName: draft.gtaChaosEffectName.trim(),
      overlayText: draft.overlayText.trim(),
      mediaUrl: draft.mediaUrl.trim(),
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{isEditing ? 'Editar accion' : 'Nueva accion'}</span>
            <h2>{isEditing ? 'Ajusta lo que debe ocurrir' : 'Define lo que debe ocurrir'}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            x
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="action-name">
            Nombre
          </label>
          <input
            id="action-name"
            className="text-field"
            placeholder="Ej: Gift que invoca zombie"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />

          <label className="field-label" htmlFor="action-description">
            Descripcion
          </label>
          <textarea
            id="action-description"
            className="text-area"
            placeholder="Que efecto deberia provocar esta accion."
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />

          <div className="field-group">
            <span className="field-label">Salidas</span>
            <div className="option-grid">
              {OUTPUT_OPTIONS.map((option) => (
                <label key={option.id} className="option-card">
                  <input
                    type="checkbox"
                    checked={draft.outputs.includes(option.id)}
                    onChange={() => toggleOutput(option.id)}
                  />
                  <div>
                    <strong>{option.label}</strong>
                    <span>{option.note}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <label className="field-label" htmlFor="action-command">
            {usesChaosMod
              ? 'Payload opcional / nota'
              : usesBedrockBox
                ? 'Comando de Bedrock Box'
                : 'Comando o payload'}
          </label>
          <input
            id="action-command"
            className="text-field"
            placeholder={
              usesChaosMod
                ? 'Opcional. Lo puedes usar como nota o payload adicional.'
                : usesBedrockBox
                  ? 'El preset completa este comando automaticamente, pero puedes ajustarlo.'
                  : 'Ej: /summon creeper ~ ~1 ~'
            }
            value={draft.commandText}
            onChange={(event) => setDraft({ ...draft, commandText: event.target.value })}
          />

          {usesMinecraftOutput ? (
            <>
              <label className="field-label" htmlFor="action-minecraft-mode">
                Integracion Minecraft
              </label>
              <select
                id="action-minecraft-mode"
                className="text-field"
                value={draft.minecraftMode}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    minecraftMode: event.target.value,
                    minecraftBedrockPresetId:
                      event.target.value === 'bedrock-box'
                        ? currentDraft.minecraftBedrockPresetId
                        : '',
                    minecraftBedrockPresetName:
                      event.target.value === 'bedrock-box'
                        ? currentDraft.minecraftBedrockPresetName
                        : '',
                  }))
                }
              >
                <option value="generic">RCON / bridge generico</option>
                <option value="bedrock-box">Bedrock Box</option>
              </select>

              {draft.minecraftMode === 'bedrock-box' ? (
                <>
                  <label className="field-label" htmlFor="action-bedrock-box-preset">
                    Preset de Bedrock Box
                  </label>
                  <div className="picker-toolbar">
                    <input
                      className="text-field"
                      placeholder="Busca por nombre, categoria o comando"
                      value={minecraftCommandSearch}
                      onChange={(event) => setMinecraftCommandSearch(event.target.value)}
                    />
                    <select
                      className="text-field picker-filter"
                      value={minecraftCommandCategory}
                      onChange={(event) => setMinecraftCommandCategory(event.target.value)}
                    >
                      <option value="all">Todas las categorias</option>
                      {availableBedrockBoxCategories
                        .filter((category) => category !== 'all')
                        .map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="command-gallery-grid">
                    {visibleBedrockBoxPresets.map((preset) => {
                      const presetVisual = getBedrockBoxCardMeta(preset)

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`command-picker-card ${
                            draft.minecraftBedrockPresetId === preset.id ? 'selected' : ''
                          }`}
                          onClick={() =>
                            setDraft((currentDraft) => ({
                              ...currentDraft,
                              minecraftBedrockPresetId: preset.id,
                              minecraftBedrockPresetName: preset.name,
                              commandText: preset.commandText,
                            }))
                          }
                        >
                          {preset.imageUrl ? (
                            <img className="gift-picker-image" src={preset.imageUrl} alt={preset.name} />
                          ) : (
                            <span
                              className="command-picker-thumb"
                              style={{ '--picker-accent': presetVisual.accent }}
                            >
                              {presetVisual.token}
                            </span>
                          )}
                          <strong>{preset.name}</strong>
                          <span>{preset.note}</span>
                        </button>
                      )
                    })}
                  </div>
                  <select
                    id="action-bedrock-box-preset"
                    className="text-field picker-native-select"
                    value={draft.minecraftBedrockPresetId}
                    onChange={(event) => {
                      const nextPreset =
                        BEDROCK_BOX_PRESETS.find((item) => item.id === event.target.value) || null

                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        minecraftBedrockPresetId: event.target.value,
                        minecraftBedrockPresetName: nextPreset?.name || '',
                        commandText: nextPreset?.commandText || currentDraft.commandText,
                      }))
                    }}
                  >
                    <option value="">Selecciona un preset</option>
                    {BEDROCK_BOX_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name} · {preset.category}
                      </option>
                    ))}
                  </select>

                  {selectedBedrockBoxPreset ? (
                    <p className="support-copy">
                      <strong>Seleccionado:</strong> {selectedBedrockBoxPreset.name}. Comando:
                      {' '}
                      <code>{selectedBedrockBoxPreset.commandText}</code>
                    </p>
                  ) : (
                    <p className="support-copy">
                      Estos presets salen de los comandos reales del plugin `s2e-bedrock-box` para
                      que no tengas que memorizar sintaxis ni escribirlos a mano en cada accion.
                    </p>
                  )}
                </>
              ) : null}
            </>
          ) : null}

          {usesGtaOutput ? (
            <>
              <label className="field-label" htmlFor="action-gta-mode">
                Integracion GTA
              </label>
              <select
                id="action-gta-mode"
                className="text-field"
                value={draft.gtaMode}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    gtaMode: event.target.value,
                  }))
                }
              >
                <option value="generic">Bridge generico / mod propio</option>
                <option value="chaosmod">ChaosMod effect menu</option>
              </select>

              {draft.gtaMode === 'chaosmod' ? (
                <>
                  <label className="field-label" htmlFor="action-chaosmod-effect">
                    Efecto de ChaosMod
                  </label>
                  <div className="picker-toolbar">
                    <input
                      className="text-field"
                      placeholder="Busca por nombre o categoria"
                      value={gtaCommandSearch}
                      onChange={(event) => setGtaCommandSearch(event.target.value)}
                    />
                    <select
                      className="text-field picker-filter"
                      value={gtaCommandCategory}
                      onChange={(event) => setGtaCommandCategory(event.target.value)}
                    >
                      <option value="all">Todas las categorias</option>
                      {availableChaosModCategories
                        .filter((category) => category !== 'all')
                        .map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="command-gallery-grid">
                    {visibleChaosModEffects.slice(0, 120).map((effect) => {
                      const effectVisual = getChaosModCardMeta(effect)

                      return (
                        <button
                          key={effect.id}
                          type="button"
                          className={`command-picker-card ${
                            draft.gtaChaosEffectId === effect.id ? 'selected' : ''
                          }`}
                          onClick={() =>
                            setDraft((currentDraft) => ({
                              ...currentDraft,
                              gtaChaosEffectId: effect.id,
                              gtaChaosEffectName: effect.name,
                            }))
                          }
                        >
                          <span
                            className="command-picker-thumb"
                            style={{ '--picker-accent': effectVisual.accent }}
                          >
                            {effectVisual.token}
                          </span>
                          <strong>{effect.name}</strong>
                          <span>{effect.categoryLabel || effect.category || 'General'}</span>
                        </button>
                      )
                    })}
                  </div>
                  <select
                    id="action-chaosmod-effect"
                    className="text-field picker-native-select"
                    value={draft.gtaChaosEffectId}
                    onChange={(event) => {
                      const nextEffect =
                        chaosModCatalog.find((item) => item.id === event.target.value) || null

                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        gtaChaosEffectId: event.target.value,
                        gtaChaosEffectName: nextEffect?.name || '',
                      }))
                    }}
                  >
                    <option value="">
                      {chaosModCatalog.length === 0
                        ? 'Todavia no llego el catalogo de ChaosMod'
                        : 'Selecciona un efecto'}
                    </option>
                    {chaosModCatalog.map((effect) => (
                      <option key={effect.id} value={effect.id}>
                        {effect.name} · {effect.categoryLabel}
                      </option>
                    ))}
                  </select>

                  {selectedChaosModEffect ? (
                    <p className="support-copy">
                      <strong>Seleccionado:</strong> {selectedChaosModEffect.name} (
                      {selectedChaosModEffect.categoryLabel || selectedChaosModEffect.category})
                    </p>
                  ) : (
                    <p className="support-copy">
                      El bridge local lee la carpeta de ChaosMod y sube esta lista al panel para
                      que no tengas que memorizar ids. Si luego quieres, le sumamos iconos propios
                      a estas tarjetas.
                    </p>
                  )}
                </>
              ) : null}
            </>
          ) : null}

          <label className="field-label" htmlFor="action-overlay">
            Texto para el overlay
          </label>
          <input
            id="action-overlay"
            className="text-field"
            placeholder="Mensaje que vera tu audiencia."
            value={draft.overlayText}
            onChange={(event) => setDraft({ ...draft, overlayText: event.target.value })}
          />

          <label className="field-label" htmlFor="action-media">
            Biblioteca local o URL manual
          </label>
          <input
            id="action-media"
            className="text-field"
            placeholder="Opcional. URL directa o selecciona un archivo local."
            value={draft.mediaUrl}
            onChange={(event) => setDraft({ ...draft, mediaUrl: event.target.value })}
          />

          <div className="card-actions">
            <label className="secondary-button upload-button">
              {isUploadingMedia ? 'Subiendo...' : 'Subir a biblioteca'}
              <input
                type="file"
                hidden
                accept="image/*,video/*,audio/*,.gif,.webm,.mp4,.mp3,.wav,.png,.jpg,.jpeg,.webp,.svg"
                onChange={async (event) => {
                  const file = event.target.files?.[0]

                  if (!file) {
                    return
                  }

                  try {
                    const uploadedItem = await onUploadMedia(file)

                    if (uploadedItem) {
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        mediaUrl: uploadedItem.url,
                      }))
                    }
                  } catch {
                    return
                  } finally {
                    event.target.value = ''
                  }
                }}
              />
            </label>
            {selectedMediaItem ? (
              <span className="feedback-pill">Seleccionado: {selectedMediaItem.fileName}</span>
            ) : null}
          </div>

          {mediaLibraryError ? <div className="error-box">{mediaLibraryError}</div> : null}

          <div className="media-picker-grid">
            {mediaLibrary.length === 0 ? (
              <p className="support-copy">No hay archivos locales todavia.</p>
            ) : (
              mediaLibrary.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`media-picker-item ${draft.mediaUrl === item.url ? 'selected' : ''}`}
                  onClick={() => setDraft({ ...draft, mediaUrl: item.url })}
                >
                  <span className="bridge-badge">{item.kind}</span>
                  <strong>{item.fileName}</strong>
                  <code>{item.url}</code>
                </button>
              ))
            )}
          </div>

          {errorMessage ? <div className="error-box">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              {isEditing ? 'Guardar cambios' : 'Guardar accion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EmoteCatalogModal({ initialEmote, isUploadingMedia, onClose, onSave, onUploadMedia }) {
  const [draft, setDraft] = useState(() => createEmoteDraft(initialEmote))
  const [errorMessage, setErrorMessage] = useState('')
  const isEditing = Boolean(initialEmote?.id)

  async function handleSubmit(event) {
    event.preventDefault()

    if (!draft.name.trim()) {
      setErrorMessage('Ponle un nombre al emote para reconocerlo despues.')
      return
    }

    try {
      await onSave({
        ...draft,
        id: draft.id.trim() || buildManualEmoteId(draft.name),
        name: draft.name.trim(),
        imageUrl: draft.imageUrl.trim(),
      })
    } catch (error) {
      setErrorMessage(error.message || 'No pude guardar el emote.')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{isEditing ? 'Editar emote' : 'Nuevo emote'}</span>
            <h2>{isEditing ? 'Ajusta tu emote local' : 'Carga un emote para usarlo offline'}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            x
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="emote-name">
            Nombre visible
          </label>
          <input
            id="emote-name"
            className="text-field"
            placeholder="Ej: Corazon neon"
            value={draft.name}
            onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, name: event.target.value }))}
          />

          <label className="field-label" htmlFor="emote-id">
            ID o alias
          </label>
          <input
            id="emote-id"
            className="text-field"
            placeholder="Opcional. Si lo dejas vacio te genero uno manual."
            value={draft.id}
            onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, id: event.target.value }))}
          />

          <label className="field-label" htmlFor="emote-image-url">
            Imagen del emote
          </label>
          <input
            id="emote-image-url"
            className="text-field"
            placeholder="Pega una URL o sube la imagen a la biblioteca."
            value={draft.imageUrl}
            onChange={(event) =>
              setDraft((currentDraft) => ({ ...currentDraft, imageUrl: event.target.value }))
            }
          />

          <div className="card-actions">
            <label className="secondary-button upload-button">
              {isUploadingMedia ? 'Subiendo...' : 'Subir imagen'}
              <input
                type="file"
                hidden
                accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg"
                onChange={async (event) => {
                  const file = event.target.files?.[0]

                  if (!file) {
                    return
                  }

                  try {
                    const uploadedItem = await onUploadMedia(file)

                    if (uploadedItem) {
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        imageUrl: uploadedItem.url,
                      }))
                    }
                  } finally {
                    event.target.value = ''
                  }
                }}
              />
            </label>
            <span className="feedback-pill">{getEmoteSourceLabel(draft.source)}</span>
          </div>

          {draft.imageUrl ? (
            <div className="sim-gift-preview">
              <img src={draft.imageUrl} alt={draft.name || 'Emote'} className="gift-picker-image" />
              <div>
                <strong>{draft.name || 'Vista previa'}</strong>
                <p>{draft.id || 'ID manual pendiente'}</p>
              </div>
            </div>
          ) : null}

          <p className="support-copy">
            Esto te deja configurar triggers de emotes aun cuando no haya live. Si despues TikTok
            reporta ese mismo emote, el catalogo se sigue completando solo.
          </p>

          {errorMessage ? <div className="error-box">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              {isEditing ? 'Guardar emote' : 'Agregar emote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TriggerModal({
  actions,
  emoteCatalog,
  giftCatalog,
  initialTrigger,
  knownUsers = [],
  onClose,
  onSave,
}) {
  const [draft, setDraft] = useState(() => createTriggerDraft(initialTrigger, actions))
  const [emoteSearch, setEmoteSearch] = useState('')
  const [giftSearch, setGiftSearch] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const isEditing = Boolean(initialTrigger?.id)
  const hasLiveGiftCatalog = Array.isArray(giftCatalog) && giftCatalog.length > 0
  const hasLiveEmoteCatalog = Array.isArray(emoteCatalog) && emoteCatalog.length > 0
  const availableGiftCatalog = (hasLiveGiftCatalog ? giftCatalog : CURATED_GIFT_CATALOG).map(
    (gift, index) => normalizeGiftCatalogForPicker(gift, index),
  )
  const availableEmoteCatalog = (hasLiveEmoteCatalog ? emoteCatalog : []).map((emote, index) =>
    normalizeEmoteCatalogForPicker(emote, index),
  )
  const selectedAction = actions.find((action) => action.id === draft.actionId) || null
  const selectedTriggerMeta =
    VISUAL_TRIGGER_OPTIONS.find((option) => option.id === draft.source) || VISUAL_TRIGGER_OPTIONS[0]
  const selectedAudienceMeta = getTriggerAudienceMeta(draft.audience)
  const isGlobalComment = draft.source === 'comment' && isGlobalCommentRule(draft.match)
  const giftRuleState = parseGiftTriggerMatch(draft.match)
  const selectedSpecificUsers = parseSpecificUsers(draft.specificUsersText)
  const availableKnownUsers = Array.from(
    new Set((knownUsers || []).map((userName) => normalizeUserHandle(userName)).filter(Boolean)),
  ).filter((userName) => !selectedSpecificUsers.includes(userName))
  const selectedEmote =
    availableEmoteCatalog.find(
      (emote) =>
        normalizePickerText(emote.name) === normalizePickerText(draft.match)
        || normalizePickerText(emote.id) === normalizePickerText(draft.match),
    ) || null
  const filteredGiftCatalog = availableGiftCatalog.filter((gift) => {
    const searchText = normalizePickerText(giftSearch)

    if (!searchText) {
      return true
    }

    return normalizePickerText(
      `${gift.name} ${gift.token} ${(gift.tags || []).join(' ')} ${gift.coins}`,
    ).includes(searchText)
  })
  const filteredEmoteCatalog = availableEmoteCatalog.filter((emote) => {
    const searchText = normalizePickerText(emoteSearch)

    if (!searchText) {
      return true
    }

    return normalizePickerText(`${emote.name} ${emote.id} ${emote.token}`).includes(searchText)
  })

  function handleSourceChange(nextSource) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      source: nextSource,
      match: DEFAULT_TRIGGER_MATCHES[nextSource] || currentDraft.match,
    }))
  }

  function handleGiftSelect(gift) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      source: 'gift',
      match: buildGiftTriggerMatch(gift.name, giftRuleState.repeatCount),
    }))
  }

  function handleGiftRepeatChange(nextValue) {
    const activeGiftName = giftRuleState.giftName || 'Rose'

    setDraft((currentDraft) => ({
      ...currentDraft,
      source: 'gift',
      match: buildGiftTriggerMatch(activeGiftName, nextValue),
    }))
  }

  function handleEmoteSelect(emote) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      source: 'emote',
      match: emote.name || emote.id,
    }))
  }

  function handleAudienceChange(nextAudience) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      audience: nextAudience,
    }))
  }

  function handleCommentModeChange(nextMode) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      source: 'comment',
      match: nextMode === 'global' ? 'Cualquier comentario' : currentDraft.match === 'Cualquier comentario' ? '' : currentDraft.match,
    }))
  }

  function appendSpecificUser(userName) {
    const normalizedUser = normalizeUserHandle(userName)

    if (!normalizedUser) {
      return
    }

    const nextUsers = Array.from(new Set([...selectedSpecificUsers, normalizedUser]))

    setDraft((currentDraft) => ({
      ...currentDraft,
      audience: 'specific-users',
      specificUsersText: nextUsers.join(', '),
    }))
  }

  function removeSpecificUser(userName) {
    const normalizedUser = normalizeUserHandle(userName)
    const nextUsers = selectedSpecificUsers.filter((currentUser) => currentUser !== normalizedUser)

    setDraft((currentDraft) => ({
      ...currentDraft,
      specificUsersText: nextUsers.join(', '),
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    const normalizedSpecificUsers = parseSpecificUsers(draft.specificUsersText)

    if (draft.audience === 'specific-users' && normalizedSpecificUsers.length === 0) {
      setErrorMessage('Agrega al menos un username si el evento es para usuario especifico.')
      return
    }

    if (!draft.match.trim()) {
      setErrorMessage('Define que evento o patron debe activar el trigger.')
      return
    }

    if (!draft.actionId) {
      setErrorMessage('Selecciona una accion para este trigger.')
      return
    }

    const restDraft = { ...draft }
    delete restDraft.specificUsersText

    onSave({
      ...restDraft,
      platform: 'tiktok',
      match: draft.match.trim(),
      cooldownSeconds: draft.cooldownSeconds.trim() || '0',
      audience: draft.audience,
      specificUsers: normalizedSpecificUsers,
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card event-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{isEditing ? 'Editar evento' : 'Nuevo evento'}</span>
            <h2>{isEditing ? 'Ajusta quien lo activa y que pasa despues' : 'Conecta un evento con una accion'}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            x
          </button>
        </div>

        <form className="modal-form event-modal-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <span className="field-label">Plataforma</span>
            <div className="event-platform-toggle">
              {EVENT_PLATFORM_OPTIONS.map((platform) => (
                <button
                  key={platform.id}
                  type="button"
                  className={`event-platform-chip ${draft.platform === platform.id ? 'selected' : ''}`}
                  disabled={platform.disabled}
                  onClick={() => !platform.disabled && setDraft({ ...draft, platform: platform.id })}
                >
                  <span className="source-picker-token">{platform.token}</span>
                  <strong>{platform.label}</strong>
                  <span>{platform.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="event-modal-grid">
            <section className="event-modal-panel">
              <div className="event-panel-copy">
                <h3>¿Quien puede activar el evento?</h3>
                <p>Define si entra cualquiera o si quieres restringirlo por rol o por usuario.</p>
              </div>

              <div className="event-option-list">
                {TRIGGER_AUDIENCE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`event-option-row ${draft.audience === option.id ? 'selected' : ''}`}
                    onClick={() => handleAudienceChange(option.id)}
                  >
                    <span className="event-option-radio" />
                    <span className="event-option-copy">
                      <strong>{option.label}</strong>
                      <span>{option.note}</span>
                    </span>
                  </button>
                ))}
              </div>

              {draft.audience === 'specific-users' ? (
                <div className="event-user-manager">
                  {availableKnownUsers.length > 0 ? (
                    <select
                      className="text-field"
                      value=""
                      onChange={(event) => {
                        appendSpecificUser(event.target.value)
                      }}
                    >
                      <option value="">Selecciona una opcion</option>
                      {availableKnownUsers.map((userName) => (
                        <option key={userName} value={userName}>
                          {userName}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <div className="event-inline-actions">
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() => setDraft((currentDraft) => ({ ...currentDraft, specificUsersText: '' }))}
                    >
                      Vaciar lista usuarios
                    </button>
                  </div>

                  <textarea
                    className="text-field event-users-input"
                    placeholder="ej. user1, user2, user3"
                    value={draft.specificUsersText}
                    onChange={(event) =>
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        specificUsersText: event.target.value,
                      }))
                    }
                  />

                  {selectedSpecificUsers.length > 0 ? (
                    <div className="event-user-chip-row">
                      {selectedSpecificUsers.map((userName) => (
                        <button
                          key={userName}
                          type="button"
                          className="event-user-chip"
                          onClick={() => removeSpecificUser(userName)}
                        >
                          <span>{userName}</span>
                          <span>x</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="support-copy">Si no aparece en la lista, agrega el username manualmente arriba.</p>
                  )}
                </div>
              ) : null}

              <div className="event-panel-copy">
                <h3>¿Por que se activara el evento?</h3>
                <p>Elige si quieres escuchar un gift, un emote, un comentario, un follow o una meta de likes.</p>
              </div>

              <div className="event-option-list">
                {VISUAL_TRIGGER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`event-option-row ${draft.source === option.id ? 'selected' : ''}`}
                    onClick={() => handleSourceChange(option.id)}
                  >
                    <span className="event-option-radio" />
                    <span className="event-option-copy">
                      <strong>{option.label}</strong>
                      <span>{option.note}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="event-modal-panel">
              <div className="event-panel-copy">
                <h3>Detalle del activador</h3>
                <p>
                  <strong>{selectedTriggerMeta.label}:</strong> {selectedTriggerMeta.note}
                </p>
              </div>

              {draft.source === 'gift' ? (
                <div className="asset-picker-shell">
                  <div className="picker-toolbar">
                    <input
                      className="text-field"
                      placeholder="Buscar regalo"
                      value={giftSearch}
                      onChange={(event) => setGiftSearch(event.target.value)}
                    />
                    <input
                      className="text-field picker-filter"
                      inputMode="numeric"
                      placeholder="x1"
                      value={giftRuleState.repeatCount}
                      onChange={(event) => handleGiftRepeatChange(event.target.value)}
                    />
                  </div>
                  <div className="asset-picker-list">
                    {filteredGiftCatalog.length === 0 ? (
                      <p className="support-copy">No encontre regalos con ese filtro.</p>
                    ) : (
                      filteredGiftCatalog.map((gift) => (
                        <button
                          key={gift.id}
                          type="button"
                          className={`asset-picker-row ${
                            normalizePickerText(giftRuleState.giftName) === normalizePickerText(gift.name)
                              ? 'selected'
                              : ''
                          }`}
                          onClick={() => handleGiftSelect(gift)}
                        >
                          {gift.imageUrl ? (
                            <img className="gift-picker-image" src={gift.imageUrl} alt={gift.name} />
                          ) : (
                            <span className="gift-picker-thumb" style={{ '--picker-accent': gift.accent }}>
                              {gift.token}
                            </span>
                          )}
                          <span className="asset-picker-copy">
                            <strong>{gift.name}</strong>
                            <span>
                              {gift.coins} coin{gift.coins === 1 ? '' : 's'} · ID:{gift.id}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <p className="support-copy">
                    {hasLiveGiftCatalog
                      ? 'Catalogo real sincronizado desde TikTok.'
                      : 'Usando una lista curada temporal hasta que sincronices gifts reales.'}
                  </p>
                </div>
              ) : null}

              {draft.source === 'emote' ? (
                <div className="asset-picker-shell">
                  <input
                    className="text-field"
                    placeholder="Buscar emote"
                    value={emoteSearch}
                    onChange={(event) => setEmoteSearch(event.target.value)}
                  />
                  <div className="asset-picker-list">
                    {filteredEmoteCatalog.length === 0 ? (
                      <p className="support-copy">
                        {hasLiveEmoteCatalog
                          ? 'No encontre emotes con ese filtro.'
                          : 'Los emotes van a aparecer aqui cuando alguien los mande en tu live.'}
                      </p>
                    ) : (
                      filteredEmoteCatalog.map((emote) => (
                        <button
                          key={emote.id}
                          type="button"
                          className={`asset-picker-row ${selectedEmote?.id === emote.id ? 'selected' : ''}`}
                          onClick={() => handleEmoteSelect(emote)}
                        >
                          {emote.imageUrl ? (
                            <img className="gift-picker-image" src={emote.imageUrl} alt={emote.name} />
                          ) : (
                            <span className="gift-picker-thumb" style={{ '--picker-accent': emote.accent }}>
                              {emote.token}
                            </span>
                          )}
                          <span className="asset-picker-copy">
                            <strong>{emote.name}</strong>
                            <span>{emote.id}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <p className="support-copy">
                    {hasLiveEmoteCatalog
                      ? 'Catalogo de emotes aprendido desde tu live.'
                      : 'Todavia no vimos emotes en este live. Puedes agregarlos antes desde la biblioteca local.'}
                  </p>
                </div>
              ) : null}

              {draft.source === 'comment' ? (
                <div className="asset-picker-shell">
                  <div className="event-option-list compact">
                    {COMMENT_TRIGGER_OPTIONS.map((option) => {
                      const selected = option.id === 'global' ? isGlobalComment : !isGlobalComment

                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`event-option-row ${selected ? 'selected' : ''}`}
                          onClick={() => handleCommentModeChange(option.id)}
                        >
                          <span className="event-option-radio" />
                          <span className="event-option-copy">
                            <strong>{option.label}</strong>
                            <span>{option.note}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {isGlobalComment ? (
                    <div className="support-copy">
                      Cualquier comentario del chat va a activar esta accion. Ideal para overlays reactivos o filtros amplios.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <label className="field-label" htmlFor="trigger-match">
                Regla final del evento
              </label>
              <input
                id="trigger-match"
                className="text-field"
                disabled={isGlobalComment}
                placeholder={
                  draft.source === 'gift'
                    ? 'Ej: Rose x1'
                    : draft.source === 'emote'
                      ? 'Ej: Heart Me'
                      : draft.source === 'comment'
                        ? 'Ej: !chaos'
                        : draft.source === 'like-burst'
                          ? 'Ej: 100 likes'
                          : `Ej: ${DEFAULT_TRIGGER_MATCHES[draft.source] || 'Cualquier evento'}`
                }
                value={draft.match}
                onChange={(event) => setDraft({ ...draft, match: event.target.value })}
              />

              <label className="field-label" htmlFor="trigger-action">
                Activar esta accion
              </label>
              <div className="action-picker-grid event-action-picker-grid">
                {actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={`action-picker-card ${draft.actionId === action.id ? 'selected' : ''}`}
                    onClick={() => setDraft({ ...draft, actionId: action.id })}
                  >
                    <strong>{action.name}</strong>
                    <span>{action.description || 'Sin descripcion todavia.'}</span>
                    <div className="tag-row">
                      {action.outputs.map((output) => (
                        <span key={output} className="tag">
                          {getOutputMeta(output)?.label || output}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
              {selectedAction ? (
                <p className="support-copy">
                  <strong>Accion elegida:</strong> {selectedAction.name}
                </p>
              ) : null}

              <label className="field-label" htmlFor="trigger-cooldown">
                Global cooldown
              </label>
              <input
                id="trigger-cooldown"
                className="text-field"
                value={draft.cooldownSeconds}
                onChange={(event) => setDraft({ ...draft, cooldownSeconds: event.target.value })}
              />
              <p className="support-copy">
                <strong>Acceso:</strong> {selectedAudienceMeta.label}
              </p>
            </section>
          </div>

          {errorMessage ? <div className="error-box">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              {isEditing ? 'Guardar evento' : 'Crear evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default App
