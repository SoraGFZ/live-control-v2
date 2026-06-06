import {
  DEFAULT_APP_STATE,
  mergeStateWithDefaults,
  normalizeBaseUrl,
  sanitizeSlug,
} from './live-control'

export const APP_STORAGE_KEY = 'live-control-studio-cache-v4'
const DASHBOARD_KEY_STORAGE_KEY = 'live-control-dashboard-key-v1'

export function mergeServerStatus(incomingStatus) {
  const patch = incomingStatus && typeof incomingStatus === 'object' ? incomingStatus : {}

  return {
    ...DEFAULT_SERVER_STATUS,
    ...patch,
    server: {
      ...DEFAULT_SERVER_STATUS.server,
      ...(patch.server || {}),
    },
    profile: {
      ...DEFAULT_SERVER_STATUS.profile,
      ...(patch.profile || {}),
    },
    tikTok: {
      ...DEFAULT_SERVER_STATUS.tikTok,
      ...(patch.tikTok || {}),
    },
    smartBar: {
      ...DEFAULT_SERVER_STATUS.smartBar,
      ...(patch.smartBar || {}),
    },
    leaderboards: {
      ...DEFAULT_SERVER_STATUS.leaderboards,
      ...(patch.leaderboards || {}),
      topLikes: Array.isArray(patch.leaderboards?.topLikes)
        ? patch.leaderboards.topLikes
        : DEFAULT_SERVER_STATUS.leaderboards.topLikes,
      topGifts: Array.isArray(patch.leaderboards?.topGifts)
        ? patch.leaderboards.topGifts
        : DEFAULT_SERVER_STATUS.leaderboards.topGifts,
    },
    music: {
      ...DEFAULT_SERVER_STATUS.music,
      ...(patch.music || {}),
    },
    bridges: {
      ...DEFAULT_SERVER_STATUS.bridges,
      ...(patch.bridges || {}),
    },
    account: {
      ...DEFAULT_SERVER_STATUS.account,
      ...(patch.account || {}),
    },
    profiles: {
      ...DEFAULT_SERVER_STATUS.profiles,
      ...(patch.profiles || {}),
    },
  }
}

export const DEFAULT_SERVER_STATUS = {
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
  leaderboards: {
    sessionStartedAt: null,
    totalLikes: 0,
    totalCoins: 0,
    trackedLikers: 0,
    trackedGifters: 0,
    topLikes: [],
    topGifts: [],
  },
  music: {
    configured: false,
    enabled: false,
    provider: 'spotify',
    connected: false,
    accountLabel: '',
    accountProduct: '',
    requiresPremium: false,
    redirectUri: '',
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
  account: {
    plan: 'premium_internal',
    tier: 'founder_local',
    label: 'TikControl Premium (local)',
    isPremium: true,
    limits: 'unlimited',
  },
  integrations: {
    premium: { tier: 'founder_local', label: 'TikControl Premium (local)', unlimited: true },
    obs: { connected: false, sceneCount: 0 },
    streamerbot: { connected: false, actionCount: 0 },
    streamdeck: { running: false, clients: 0 },
  },
  profiles: {
    activeProfileId: 'default',
    profiles: [],
  },
  recentEvents: [],
  recentDispatches: [],
}

export const WORKSPACE_SECTIONS = [
  { id: 'overview', label: 'Inicio', token: 'HOME', description: 'Resumen y accesos del estudio.' },
  { id: 'live-hub', label: 'Centro LIVE', token: 'LIVE', description: 'Conexion, rankings y widgets activos.' },
  { id: 'live-ops', label: 'TikTok Live', token: 'TT', description: 'Sesion, gifts, emotes y telemetria.' },
  { id: 'actions', label: 'Acciones', token: 'AUTO', description: 'Automatizacion por gifts, chat y eventos.' },
  { id: 'sounds', label: 'Sonidos', token: 'SND', description: 'Alertas de audio por eventos (base TikControl).' },
  { id: 'tts', label: 'TTS', token: 'TTS', description: 'Texto a voz y cola de lectura.' },
  { id: 'widgets-gallery', label: 'Galeria overlays', token: 'GAL', description: 'Likes, monedas, chat y widgets TikControl.' },
  { id: 'overlay', label: 'Editor overlays', token: 'OBS', description: 'URLs, medios y configuracion avanzada.' },
  { id: 'music', label: 'Spotify', token: 'MUS', description: 'Song request y cola musical.' },
  { id: 'gifts-hub', label: 'Regalos', token: 'GFT', description: 'Catalogo de gifts y emotes.' },
  { id: 'community', label: 'Comunidad', token: 'COM', description: 'Puntos, ranks y rankings de viewers.' },
  { id: 'battles', label: 'Batallas', token: 'PK', description: 'PK TikTok, gift battle y overlays de duelo.' },
  { id: 'goals', label: 'Metas', token: 'GOL', description: 'Metas de likes, monedas, follows y shares.' },
  { id: 'events', label: 'Eventos', token: 'EVT', description: 'Campanas, timer y widgets de eventos.' },
  { id: 'games', label: 'Gaming', token: 'GAME', description: 'Biblioteca de juegos interactivos.' },
  { id: 'agencies', label: 'Agencias', token: 'AGN', description: 'Panel de agencia (cloud TikControl).' },
  { id: 'support', label: 'Soporte', token: 'SUP', description: 'Ayuda, logs y diagnostico.' },

  { id: 'account', label: 'Cuenta', token: 'USR', description: 'Plan, sesion y preferencias.' },
  { id: 'bridges', label: 'Integraciones', token: 'API', description: 'OBS, bridges y sockets locales.' },
  { id: 'storage', label: 'Almacenamiento', token: 'CLD', description: 'Archivos para alertas y overlays.' },
  { id: 'profiles', label: 'Perfiles', token: 'PRF', description: 'Perfiles y plantillas de setup.' },
]

export function getDesktopBridgeApi() {
  if (typeof window === 'undefined') {
    return null
  }

  const bridge = window.liveControlDesktop

  if (
    !bridge
    || typeof bridge.getContext !== 'function'
    || typeof bridge.startTikTokLogin !== 'function'
  ) {
    return null
  }

  return bridge
}

export function readStoredState() {
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

export function sanitizeStateForCache(state) {
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

export function sanitizeStateForBackup(state) {
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

export function readStoredDashboardAccessKey() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.sessionStorage.getItem(DASHBOARD_KEY_STORAGE_KEY) || ''
}

export function writeStoredDashboardAccessKey(value) {
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

export async function requestJson(url, options = {}, dashboardAccessKey = '') {
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

export function createSocketUrl(pathname, searchParams = {}) {
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

export function formatDateTime(value) {
  if (!value) {
    return 'Sin actividad'
  }

  return new Date(value).toLocaleString()
}

export function normalizeUserHandle(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

export function buildManualEmoteId(value) {
  const normalizedValue = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

  return normalizedValue ? `manual-${normalizedValue}` : `manual-${Date.now()}`
}

export function getStateRevision(state) {
  const numericValue = Number(state?.updatedAt || 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

export function createDashboardStatePayload(state) {
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
