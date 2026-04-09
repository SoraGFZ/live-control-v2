import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import {
  buildOverlayUrl,
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
  TRIGGER_OPTIONS,
  truncateValue,
} from './live-control'

const APP_STORAGE_KEY = 'live-control-studio-cache-v4'
const DASHBOARD_KEY_STORAGE_KEY = 'live-control-dashboard-key-v1'

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
    category: 'setup',
    note: 'Crea la Bedrock Box con el tamano configurado en el plugin.',
  },
  {
    id: 'fill_row',
    name: 'Llenar 1 fila',
    commandText: '/bedrock fill 1',
    category: 'fill',
    note: 'Rellena una fila de bloques dentro de la arena.',
  },
  {
    id: 'fill_three_rows',
    name: 'Llenar 3 filas',
    commandText: '/bedrock fill 3',
    category: 'fill',
    note: 'Acelera el reto agregando tres filas de golpe.',
  },
  {
    id: 'fill_block',
    name: 'Agregar 1 bloque',
    commandText: '/bedrock fillblock 1',
    category: 'fill',
    note: 'Suma un bloque extra sin llenar una fila completa.',
  },
  {
    id: 'drop_tnt',
    name: 'TNT directa',
    commandText: '/bedrock tnt',
    category: 'chaos',
    note: 'Lanza una TNT sobre la arena.',
  },
  {
    id: 'random_tnt',
    name: 'TNT random',
    commandText: '/bedrock randomtnt',
    category: 'chaos',
    note: 'Genera una TNT con fuerza aleatoria.',
  },
  {
    id: 'super_tnt',
    name: 'Super TNT',
    commandText: '/bedrock supertnt 3 4',
    category: 'chaos',
    note: 'Dispara varias TNT con fuerza media para momentos potentes.',
  },
  {
    id: 'glass_prison',
    name: 'Glass prison',
    commandText: '/bedrock glass_prison 10',
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
    category: 'utility',
    note: 'Vacía el contenido de la Bedrock Box.',
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
    source: trigger?.source || 'gift',
    match: trigger?.match || DEFAULT_TRIGGER_MATCHES.gift,
    actionId: trigger?.actionId || actions[0]?.id || '',
    cooldownSeconds: String(trigger?.cooldownSeconds || '0'),
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

function normalizeGiftCatalogForPicker(gift, index = 0) {
  return {
    id: String(gift?.id || gift?.name || index),
    name: String(gift?.name || `Gift ${index + 1}`),
    coins: Number(gift?.coins || 0),
    imageUrl: String(gift?.imageUrl || gift?.animatedImageUrl || ''),
    token: String(gift?.token || createKeywordToken(gift?.name, 'GF')),
    accent: String(gift?.accent || GIFT_CARD_ACCENTS[index % GIFT_CARD_ACCENTS.length]),
    tags: Array.isArray(gift?.tags) ? gift.tags : [],
  }
}

function normalizeEmoteCatalogForPicker(emote, index = 0) {
  return {
    id: String(emote?.id || emote?.emoteId || index),
    name: String(emote?.name || `Emote ${emote?.id || emote?.emoteId || index + 1}`),
    imageUrl: String(emote?.imageUrl || emote?.emoteImageUrl || ''),
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
  const [serverStatus, setServerStatus] = useState(DEFAULT_SERVER_STATUS)
  const [serverError, setServerError] = useState('')
  const [isHydrated, setIsHydrated] = useState(false)
  const [isSavingState, setIsSavingState] = useState(false)
  const [tiktokUsernameDraft, setTiktokUsernameDraft] = useState('')
  const lastSyncedSnapshotRef = useRef('')
  const isMountedRef = useRef(true)

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
  const preferredOverlayUrl = publicOverlayUrl || localOverlayUrl
  const chaosModCatalog = appState.integrations?.chaosmod?.catalog || []
  const tikTokGiftCatalog = Array.isArray(appState.integrations?.tiktok?.giftCatalog)
    ? appState.integrations.tiktok.giftCatalog
    : []
  const tikTokEmoteCatalog = Array.isArray(appState.integrations?.tiktok?.emoteCatalog)
    ? appState.integrations.tiktok.emoteCatalog
    : []
  const editingAction =
    appState.actions.find((action) => action.id === editingActionId) || null
  const editingEmote =
    tikTokEmoteCatalog.find((emote) => String(emote.id) === editingEmoteId) || null
  const editingTrigger =
    appState.triggers.find((trigger) => trigger.id === editingTriggerId) || null

  const readyOutputs = new Set()
  appState.actions.forEach((action) => action.outputs.forEach((output) => readyOutputs.add(output)))

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
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
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

  function openOverlayWindow() {
    window.open(localOverlayUrl, '_blank', 'noopener,noreferrer')
  }

  function openSmartBarWindow() {
    window.open(localSmartBarUrl, '_blank', 'noopener,noreferrer')
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
      const normalizedUsername = tiktokUsernameDraft.trim().replace(/^@/, '')
      await requestJson(
        '/api/tiktok/connect',
        {
          method: 'POST',
          body: JSON.stringify({
            username: normalizedUsername,
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

  async function syncTikTokGiftCatalog() {
    try {
      setIsSyncingGiftCatalog(true)
      await requestJson(
        '/api/tiktok/gifts/sync',
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
      setIsSyncingGiftCatalog(false)
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

  return (
    <div className="app-shell">
      <Sidebar onJump={scrollToSection} />

      <main className="main-panel">
        <HeroPanel
          overlayUrl={preferredOverlayUrl}
          onCreateAction={openCreateActionModal}
          onCreateTrigger={openCreateTriggerModal}
        />

        <MetricRow
          actionCount={appState.actions.length}
          bridgePort={serverStatus.server.port}
          readyOutputCount={readyOutputs.size}
          triggerCount={appState.triggers.length}
        />

        <LiveOpsSection
          emoteCatalogCount={tikTokEmoteCatalog.length}
          isSyncingGiftCatalog={isSyncingGiftCatalog}
          isSavingState={isSavingState}
          onConnectTikTok={connectTikTok}
          onDisconnectTikTok={disconnectTikTok}
          onSyncTikTokGiftCatalog={syncTikTokGiftCatalog}
          serverError={serverError}
          serverStatus={serverStatus}
          setTiktokUsernameDraft={setTiktokUsernameDraft}
          tiktokUsernameDraft={tiktokUsernameDraft}
        />

        <GamesSection
          actions={appState.actions}
          chaosModCatalog={chaosModCatalog}
          chaosModSourcePath={appState.integrations?.chaosmod?.sourcePath || ''}
          onJump={scrollToSection}
          serverStatus={serverStatus}
          triggers={appState.triggers}
        />

        <EmoteLibrarySection
          emoteCatalog={tikTokEmoteCatalog}
          onCreateEmote={openCreateEmoteModal}
          onEditEmote={openEditEmoteModal}
          onRemoveEmote={removeEmoteCatalogEntry}
        />

        <SimulationsSection
          emoteCatalog={tikTokEmoteCatalog}
          giftCatalog={tikTokGiftCatalog}
          onSampleEvent={sendSampleEvent}
        />

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
          triggers={appState.triggers}
        />

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

        <BridgesSection
          dashboardKey={appState.profile.dashboardKey}
          remoteBaseUrl={remoteBaseUrl}
          serverStatus={serverStatus}
          chaosModCatalog={chaosModCatalog}
          chaosModSourcePath={appState.integrations?.chaosmod?.sourcePath || ''}
        />
      </main>

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

function Sidebar({ onJump }) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <span className="brand-kicker">TikTok Live x Games</span>
        <div className="brand-title">Live Control</div>
        <p className="brand-copy">Configura gifts, comandos y overlay desde un solo panel.</p>
      </div>

      <nav className="sidebar-nav" aria-label="Secciones del panel">
        <button className="nav-button" onClick={() => onJump('overview')}>
          Resumen
        </button>
        <button className="nav-button" onClick={() => onJump('live-ops')}>
          Live Ops
        </button>
        <button className="nav-button" onClick={() => onJump('games')}>
          Juegos
        </button>
        <button className="nav-button" onClick={() => onJump('emotes')}>
          Emotes
        </button>
        <button className="nav-button" onClick={() => onJump('simulations')}>
          Pruebas
        </button>
        <button className="nav-button" onClick={() => onJump('actions')}>
          Acciones
        </button>
        <button className="nav-button" onClick={() => onJump('triggers')}>
          Triggers
        </button>
        <button className="nav-button" onClick={() => onJump('overlay')}>
          Overlay
        </button>
        <button className="nav-button" onClick={() => onJump('bridges')}>
          Bridges
        </button>
      </nav>

      <div className="sidebar-card">
        <span className="sidebar-card-label">Estado</span>
        <strong>Base funcional</strong>
        <p>Panel, overlay publico, gifts reales y bridge local ya estan conectados.</p>
      </div>
    </aside>
  )
}

function HeroPanel({ overlayUrl, onCreateAction, onCreateTrigger }) {
  return (
    <section className="hero-panel" id="overview">
      <div className="hero-copy">
        <span className="eyebrow">Panel principal</span>
        <h1>Acciones, triggers y overlay en un solo lugar.</h1>
        <p className="hero-text">
          Conecta tu live, arma reglas y prueba todo desde aqui sin perderte entre ventanas.
        </p>

        <div className="hero-actions">
          <button className="primary-button" onClick={onCreateAction}>
            Nueva accion
          </button>
          <button className="secondary-button" onClick={onCreateTrigger}>
            Nuevo trigger
          </button>
        </div>
      </div>

      <div className="hero-stack">
        <article className="signal-card">
          <span className="signal-label">Flujo</span>
          <div className="signal-flow">
            <span>TikTok Live</span>
            <span>Trigger</span>
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
  isSyncingGiftCatalog,
  isSavingState,
  onConnectTikTok,
  onDisconnectTikTok,
  onSyncTikTokGiftCatalog,
  serverError,
  serverStatus,
  setTiktokUsernameDraft,
  tiktokUsernameDraft,
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

          <div className="card-actions">
            <button className="primary-button" onClick={onConnectTikTok}>
              Conectar live
            </button>
            <button className="secondary-button" onClick={onSyncTikTokGiftCatalog}>
              {isSyncingGiftCatalog ? 'Sincronizando gifts...' : 'Sincronizar gifts'}
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
          </div>

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
        <span className="metric-label">Triggers</span>
        <strong>{triggerCount}</strong>
        <p>Reglas activas entre eventos y acciones.</p>
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
  serverStatus,
  triggers,
}) {
  const minecraftActions = actions.filter((action) => action.outputs.includes('minecraft'))
  const gtaActions = actions.filter((action) => action.outputs.includes('gta'))
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

  const [selectedGameId, setSelectedGameId] = useState(() => gameCards[0]?.id || 'gta')
  const selectedGame = gameCards.find((game) => game.id === selectedGameId) || gameCards[0]

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
      </article>
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

function SimulationsSection({ emoteCatalog, giftCatalog, onSampleEvent }) {
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
        title="Simular eventos"
        description="Estas pruebas entran por el backend y recorren la misma logica que un evento real del live."
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
  triggers,
}) {
  return (
    <section className="panel-section" id="triggers">
      <SectionHeader
        eyebrow="Motor de disparo"
        title="Triggers"
        description="Cada regla une un evento del live con una accion."
        action={
          <button className="primary-button" onClick={onCreateTrigger} disabled={actions.length === 0}>
            Crear trigger
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
      `${trigger.source} ${trigger.match} ${linkedAction?.name || ''} ${linkedAction?.description || ''}`,
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
          placeholder="Buscar triggers..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <span className="muted-pill">
          {filteredTriggers.length} trigger{filteredTriggers.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="dense-table">
        <div className="dense-table-head triggers-layout">
          <span>Activador</span>
          <span>Regla</span>
          <span>Accion</span>
          <span>Cooldown</span>
          <span>Controles</span>
        </div>

        {filteredTriggers.length === 0 ? (
          <div className="empty-list">No encontre triggers con ese filtro.</div>
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

                <div className="dense-cell" data-label="Cooldown">
                  <span className="row-subcopy">{trigger.cooldownSeconds || '0'} seg</span>
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

  return (
    <div className="overlay-screen">
      <div className="overlay-stage">
        {overlayError ? (
          <div className="overlay-idle">
            <span className="overlay-idle-label">Overlay bloqueado</span>
            <h1>{appState.profile.projectName}</h1>
            <p>{overlayError}</p>
          </div>
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
                          <span
                            className="command-picker-thumb"
                            style={{ '--picker-accent': presetVisual.accent }}
                          >
                            {presetVisual.token}
                          </span>
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

function TriggerModal({ actions, emoteCatalog, giftCatalog, initialTrigger, onClose, onSave }) {
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
  const giftRuleState = parseGiftTriggerMatch(draft.match)
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

  function handleSubmit(event) {
    event.preventDefault()

    if (!draft.match.trim()) {
      setErrorMessage('Define que evento o patron debe activar el trigger.')
      return
    }

    if (!draft.actionId) {
      setErrorMessage('Selecciona una accion para este trigger.')
      return
    }

    onSave({
      ...draft,
      match: draft.match.trim(),
      cooldownSeconds: draft.cooldownSeconds.trim() || '0',
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{isEditing ? 'Editar trigger' : 'Nuevo trigger'}</span>
            <h2>{isEditing ? 'Ajusta la regla y la accion' : 'Conecta un evento con una accion'}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            x
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <span className="field-label">Activador</span>
            <div className="source-picker-grid">
              {VISUAL_TRIGGER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`source-picker-card ${draft.source === option.id ? 'selected' : ''}`}
                  onClick={() => handleSourceChange(option.id)}
                >
                  <span className="source-picker-token">{option.token}</span>
                  <strong>{option.label}</strong>
                  <span>{option.note}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="field-label" htmlFor="trigger-source">
            Fuente
          </label>
          <select
            id="trigger-source"
            className="text-field picker-native-select"
            value={draft.source}
            onChange={(event) => handleSourceChange(event.target.value)}
          >
            {TRIGGER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          {draft.source === 'gift' ? (
            <div className="field-group">
              <div className="picker-toolbar">
                <input
                  className="text-field"
                  placeholder="Busca un gift"
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
              <div className="gift-picker-grid">
                {filteredGiftCatalog.length === 0 ? (
                  <p className="support-copy">No encontre gifts con ese filtro.</p>
                ) : (
                  filteredGiftCatalog.map((gift) => (
                    <button
                      key={gift.name}
                      type="button"
                      className={`gift-picker-card ${
                        normalizePickerText(giftRuleState.giftName) === normalizePickerText(gift.name)
                          ? 'selected'
                          : ''
                      }`}
                      onClick={() => handleGiftSelect(gift)}
                    >
                      {gift.imageUrl ? (
                        <img className="gift-picker-image" src={gift.imageUrl} alt={gift.name} />
                      ) : (
                        <span
                          className="gift-picker-thumb"
                          style={{ '--picker-accent': gift.accent }}
                        >
                          {gift.token}
                        </span>
                      )}
                      <strong>{gift.name}</strong>
                      <span>{gift.coins} coin{gift.coins === 1 ? '' : 's'}</span>
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
            <div className="field-group">
              <input
                className="text-field"
                placeholder="Busca un emote"
                value={emoteSearch}
                onChange={(event) => setEmoteSearch(event.target.value)}
              />
              <div className="gift-picker-grid">
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
                      className={`gift-picker-card ${
                        selectedEmote?.id === emote.id ? 'selected' : ''
                      }`}
                      onClick={() => handleEmoteSelect(emote)}
                    >
                      {emote.imageUrl ? (
                        <img className="gift-picker-image" src={emote.imageUrl} alt={emote.name} />
                      ) : (
                        <span
                          className="gift-picker-thumb"
                          style={{ '--picker-accent': emote.accent }}
                        >
                          {emote.token}
                        </span>
                      )}
                      <strong>{emote.name}</strong>
                      <span>{emote.id}</span>
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

          <label className="field-label" htmlFor="trigger-match">
            Regla final del trigger
          </label>
          <input
            id="trigger-match"
            className="text-field"
            placeholder={
              draft.source === 'gift'
                ? 'Ej: Rose x1'
                : draft.source === 'emote'
                  ? 'Ej: Emote 123456'
                : draft.source === 'comment'
                  ? 'Ej: !chaos'
                  : draft.source === 'like-burst'
                    ? 'Ej: 100 likes'
                    : `Ej: ${DEFAULT_TRIGGER_MATCHES[draft.source] || 'Cualquier evento'}`
            }
            value={draft.match}
            onChange={(event) => setDraft({ ...draft, match: event.target.value })}
          />
          <p className="support-copy">
            <strong>{selectedTriggerMeta.label}:</strong> {selectedTriggerMeta.note}
          </p>

          <label className="field-label" htmlFor="trigger-action">
            Accion a disparar
          </label>
          <div className="action-picker-grid">
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
          <select
            id="trigger-action"
            className="text-field picker-native-select"
            value={draft.actionId}
            onChange={(event) => setDraft({ ...draft, actionId: event.target.value })}
          >
            {actions.map((action) => (
              <option key={action.id} value={action.id}>
                {action.name}
              </option>
            ))}
          </select>
          {selectedAction ? (
            <p className="support-copy">
              <strong>Accion elegida:</strong> {selectedAction.name}
            </p>
          ) : null}

          <label className="field-label" htmlFor="trigger-cooldown">
            Cooldown en segundos
          </label>
          <input
            id="trigger-cooldown"
            className="text-field"
            value={draft.cooldownSeconds}
            onChange={(event) => setDraft({ ...draft, cooldownSeconds: event.target.value })}
          />

          {errorMessage ? <div className="error-box">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              {isEditing ? 'Guardar cambios' : 'Guardar trigger'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default App
