import { DEFAULT_TTS_CONFIG } from './config/ttsDefaults.js'

export const OUTPUT_OPTIONS = [
  { id: 'overlayAlert', label: 'Overlay alert', note: 'Texto animado para follows, gifts o eventos.' },
  { id: 'overlayMedia', label: 'Overlay media', note: 'Imagen, GIF o video en una escena del live.' },
  { id: 'audio', label: 'Audio local', note: 'Jingle, efecto o sonido corto en tu PC.' },
  { id: 'tts', label: 'TTS', note: 'Lee mensajes en voz alta desde el panel.' },
  { id: 'obs', label: 'OBS', note: 'Escenas y fuentes via WebSocket OBS.' },
  { id: 'streamerbot', label: 'Streamer.bot', note: 'Accion remota en Streamer.bot.' },
  { id: 'game', label: 'Juego (TikControl)', note: 'Comando de la biblioteca gaming cloud.' },
  { id: 'minecraft', label: 'Minecraft', note: 'Comando o acción para bridge con RCON/mod.' },
  { id: 'gta', label: 'GTA V', note: 'Evento para un mod local o bridge websocket.' },
  { id: 'webhook', label: 'Webhook', note: 'HTTP POST a URL externa.' },
  { id: 'keystroke', label: 'Teclado', note: 'Simulacion de teclas locales.' },
  { id: 'delay', label: 'Espera', note: 'Pausa en segundos entre acciones.' },
]

export const TRIGGER_OPTIONS = [
  { id: 'follow', label: 'Nuevo follow' },
  { id: 'gift', label: 'Gift' },
  { id: 'emote', label: 'Emote' },
  { id: 'comment', label: 'Comentario' },
  { id: 'share', label: 'Compartido' },
  { id: 'like-burst', label: 'Rafaga de likes' },
]

export const LOCAL_BRIDGE_DEFAULTS = {
  minecraftPort: 6135,
  gtaPort: 6136,
}

export const DEFAULT_INTEGRATIONS = {
  overlayMirror: {
    sourceBaseUrl: '',
    syncedAt: null,
    profile: null,
    widgets: null,
    smartBar: null,
    music: null,
  },
  chaosmod: {
    catalog: [],
    sourcePath: '',
    syncedAt: null,
    lastError: '',
  },
  spotify: {
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
    scope: '',
    authState: '',
    accountId: '',
    accountLabel: '',
    accountProduct: '',
    connectedAt: null,
    lastSyncAt: null,
    lastError: '',
    devices: [],
    currentPlayback: null,
  },
  obs: {
    url: 'ws://127.0.0.1:4455',
    password: '',
    autoConnect: true,
    lastConnectedAt: null,
    lastError: '',
  },
  streamerbot: {
    url: 'ws://127.0.0.1:8080',
    password: '',
    autoConnect: true,
    lastConnectedAt: null,
    lastError: '',
  },
  streamdeck: {
    enabled: false,
    host: '127.0.0.1',
    port: 9091,
  },
  tiktok: {
    giftCatalog: [],
    giftCatalogSourceUsername: '',
    giftCatalogSyncedAt: null,
    giftCatalogLastError: '',
    emoteCatalog: [],
    emoteCatalogSourceUsername: '',
    emoteCatalogSyncedAt: null,
    emoteCatalogLastError: '',
  },
}

export const DEFAULT_WIDGETS = {
  smartBar: {
    title: 'Marcador del live',
    winGoal: '5',
    currentWins: 0,
    showWins: true,
    showCoins: true,
    showFollows: true,
    showLiveDuration: true,
  },
  topLikes: {
    title: 'Top Likes',
    kicker: 'TikTok Live',
    maxVisible: '5',
    showAvatar: true,
    showRank: true,
    showUsername: true,
    showHeartIcons: true,
    accentColor: '',
  },
  topGifts: {
    title: 'TOP GIFTS',
    kicker: 'TikTok Live',
    maxVisible: '5',
    showAvatar: true,
    showCoins: true,
    showRank: true,
    showUsername: true,
    showCoinIcons: true,
    accentColor: '#ffd978',
  },
  topComments: {
    title: 'Top Comentarios',
    maxVisible: '5',
    showAvatar: true,
  },
  chat: {
    maxMessages: 12,
    showAvatars: true,
    fontSize: 18,
  },
  giftAlert: {
    minCoins: 1,
    durationMs: 5000,
  },
}

export const DEFAULT_GOALS = {
  likes: { title: 'likes', target: 5000, whenReached: 'keep' },
  coins: { title: 'coins', target: 500, whenReached: 'keep' },
  follows: { title: 'follows', target: 100, whenReached: 'keep' },
  gifts: { title: 'gifts', target: 50, whenReached: 'keep' },
  shares: { title: 'shares', target: 30, whenReached: 'keep' },
  subscribers: { title: 'subs', target: 10, whenReached: 'keep' },
  _timestamp: 0,
}

export const DEFAULT_APP_STATE = {
  updatedAt: 0,
  profile: {
    projectName: 'Live Control Studio',
    streamerName: 'Tu canal de TikTok',
    overlaySlug: 'main-stage',
    publicBaseUrl: '',
    bridgePort: '5123',
    overlayDurationMs: '5200',
    tiktokUsername: '',
    tiktokSessionId: '',
    tiktokTargetIdc: '',
    tiktokAuthenticateWs: false,
    minecraftHost: '127.0.0.1',
    minecraftPort: '25575',
    minecraftPassword: '',
    minecraftChatMirrorEnabled: false,
    minecraftChatMirrorMode: 'tellraw',
    minecraftChatMirrorTarget: '@a',
    minecraftChatMirrorPrefix: '[TikTok]',
    minecraftChatMirrorSkipCommands: true,
    showOnboardingGuide: true,
    dashboardKey: '',
    overlayKey: '',
  },
  music: {
    enabled: false,
    provider: 'spotify',
    playCommand: '!play',
    skipCommand: '!skip',
    removeCommand: '!quitar',
    playEnabled: true,
    skipEnabled: true,
    removeEnabled: true,
    allowAllUsers: true,
    allowSubscribers: false,
    allowModerators: false,
    allowExplicit: false,
    cooldownSeconds: '10',
    maxQueueLength: '10',
    maxRequestsPerUser: '2',
    selectedDeviceId: '',
    selectedDeviceName: '',
    overlayTitle: 'Song Request',
    overlayShowQueue: true,
    overlayShowRequester: true,
    overlayMaxVisible: '3',
    queue: [],
    history: [],
    currentRequestId: '',
    lastCommandAt: null,
  },
  actions: [
    {
      id: 'action-follow-alert',
      type: '',
      name: 'Alerta de nuevo follow',
      description: 'Lanza una alerta corta con audio para nuevos seguidores.',
      outputs: ['overlayAlert', 'audio'],
      commandText: '',
      minecraftMode: 'generic',
      minecraftBedrockPresetId: '',
      minecraftBedrockPresetName: '',
      gtaMode: 'generic',
      gtaChaosEffectId: '',
      gtaChaosEffectName: '',
      gtaWebhookCommand: '',
      gtaWebhookPayload: '',
      overlayText: 'Gracias por unirte al live.',
      mediaUrl: '',
    },
    {
      id: 'action-minecraft-chaos',
      type: '',
      name: 'Caos en Minecraft',
      description: 'Invoca una criatura y lo anuncia en el overlay.',
      outputs: ['minecraft', 'overlayAlert'],
      commandText: '/summon zombie ~ ~1 ~',
      minecraftMode: 'generic',
      minecraftBedrockPresetId: '',
      minecraftBedrockPresetName: '',
      gtaMode: 'generic',
      gtaChaosEffectId: '',
      gtaChaosEffectName: '',
      gtaWebhookCommand: '',
      gtaWebhookPayload: '',
      overlayText: 'Zombie invocado por el chat.',
      mediaUrl: '',
    },
    {
      id: 'action-gta-boost',
      type: 'chaosmod',
      name: 'Evento en GTA V',
      description: 'Dispara un evento en tu mod local y deja un aviso visual.',
      outputs: ['gta', 'overlayMedia'],
      commandText: '',
      minecraftMode: 'generic',
      minecraftBedrockPresetId: '',
      minecraftBedrockPresetName: '',
      gtaMode: 'chaosmod',
      gtaChaosEffectId: 'misc_replacevehicle',
      gtaChaosEffectName: 'Replace Current Vehicle',
      gtaWebhookCommand: '',
      gtaWebhookPayload: '',
      overlayText: 'El chat acaba de activar caos en GTA.',
      mediaUrl: '',
    },
    {
      id: 'action-voice-tts',
      type: '',
      name: 'Mensaje del chat en voz',
      description: 'Lee un mensaje del chat y lo muestra en overlay.',
      outputs: ['tts', 'overlayAlert'],
      commandText: '',
      minecraftMode: 'generic',
      minecraftBedrockPresetId: '',
      minecraftBedrockPresetName: '',
      gtaMode: 'generic',
      gtaChaosEffectId: '',
      gtaChaosEffectName: '',
      gtaWebhookCommand: '',
      gtaWebhookPayload: '',
      overlayText: 'El chat tomo el micro.',
      mediaUrl: '',
    },
  ],
  triggers: [
    {
      id: 'trigger-follow-default',
      source: 'follow',
      match: 'Cualquier follow',
      actionId: 'action-follow-alert',
      cooldownSeconds: '0',
      audience: 'any',
      specificUsers: [],
    },
    {
      id: 'trigger-gift-rose',
      source: 'gift',
      match: 'Rose x1',
      actionId: 'action-minecraft-chaos',
      cooldownSeconds: '5',
      audience: 'any',
      specificUsers: [],
    },
    {
      id: 'trigger-comment-chaos',
      source: 'comment',
      match: '!chaos',
      actionId: 'action-gta-boost',
      cooldownSeconds: '8',
      audience: 'any',
      specificUsers: [],
    },
    {
      id: 'trigger-comment-voice',
      source: 'comment',
      match: '!voz',
      actionId: 'action-voice-tts',
      cooldownSeconds: '4',
      audience: 'any',
      specificUsers: [],
    },
  ],
  widgets: DEFAULT_WIDGETS,
  goals: DEFAULT_GOALS,
  tts: { ...DEFAULT_TTS_CONFIG },
  integrations: DEFAULT_INTEGRATIONS,
}

export function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`
}

export function normalizeMinecraftCommand(commandText) {
  return String(commandText || '')
    .trim()
    .replace(/^\/+/, '')
}

export function resolveActionType(action) {
  const declaredType = String(action?.type || '').trim().toLowerCase()

  if (declaredType === 'chaosmod' || declaredType === 'gtavwebhook') {
    return declaredType
  }

  const outputs = Array.isArray(action?.outputs) ? action.outputs : []
  const hasGtaOutput = outputs.includes('gta')

  if (!hasGtaOutput) {
    return ''
  }

  if (
    String(action?.gtaMode || '').trim().toLowerCase() === 'chaosmod'
    || String(action?.gtaChaosEffectId || '').trim()
  ) {
    return 'chaosmod'
  }

  if (
    String(action?.gtaMode || '').trim().toLowerCase() === 'gtavwebhook'
    || String(action?.gtaWebhookCommand || '').trim()
    || (
      String(action?.gtaMode || '').trim().toLowerCase() === 'generic'
      && String(action?.commandText || '').trim()
    )
  ) {
    return 'gtavwebhook'
  }

  return ''
}

export function mergeStateWithDefaults(parsedState) {
  const parsedUpdatedAt = Number(parsedState?.updatedAt || 0)
  const mergedActions = Array.isArray(parsedState?.actions)
    ? parsedState.actions
    : DEFAULT_APP_STATE.actions
  const mergedTriggers = Array.isArray(parsedState?.triggers)
    ? parsedState.triggers
    : DEFAULT_APP_STATE.triggers

  return {
    ...DEFAULT_APP_STATE,
    updatedAt: Number.isFinite(parsedUpdatedAt) ? parsedUpdatedAt : DEFAULT_APP_STATE.updatedAt,
    profile: {
      ...DEFAULT_APP_STATE.profile,
      ...(parsedState?.profile || {}),
    },
    music: {
      ...DEFAULT_APP_STATE.music,
      ...(parsedState?.music || {}),
      queue: Array.isArray(parsedState?.music?.queue)
        ? parsedState.music.queue
        : DEFAULT_APP_STATE.music.queue,
      history: Array.isArray(parsedState?.music?.history)
        ? parsedState.music.history
        : DEFAULT_APP_STATE.music.history,
    },
    actions: mergedActions.map((action) => ({
      type: resolveActionType(action),
      categoryId: action?.categoryId || 'alert',
      scope: action?.scope || 'profile',
      screen: action?.screen || '1',
      duration: action?.duration ?? 10,
      minecraftMode: 'generic',
      minecraftBedrockPresetId: '',
      minecraftBedrockPresetName: '',
      gtaMode: 'generic',
      gtaChaosEffectId: '',
      gtaChaosEffectName: '',
      gtaWebhookCommand: '',
      gtaWebhookPayload: '',
      obsAction: '',
      obsScene: '',
      obsSource: '',
      streamerbotAction: '',
      webhookUrl: '',
      webhookMethod: 'POST',
      webhookBody: '',
      keystrokeKeys: '',
      delaySeconds: 1,
      gamingGameId: '',
      gamingGameName: '',
      gamingCommandId: '',
      gamingCommandName: '',
      ...action,
      ...(action?.id === 'action-gta-boost'
        && String(action?.gtaMode || '') === 'generic'
        && String(action?.commandText || '').trim() === 'spawn-chaos-car'
        ? {
            type: 'chaosmod',
            commandText: '',
            gtaMode: 'chaosmod',
            gtaChaosEffectId: 'misc_replacevehicle',
            gtaChaosEffectName: 'Replace Current Vehicle',
            gtaWebhookCommand: '',
            gtaWebhookPayload: '',
          }
        : {}),
    })),
    triggers: mergedTriggers.map((trigger) => {
      const normalizedSpecificUsers = Array.isArray(trigger?.specificUsers) ? trigger.specificUsers : []

      return {
        audience: 'any',
        specificUsers: normalizedSpecificUsers,
        ...trigger,
      }
    }),
    widgets: {
      ...DEFAULT_WIDGETS,
      ...(parsedState?.widgets || {}),
      smartBar: {
        ...DEFAULT_WIDGETS.smartBar,
        ...(parsedState?.widgets?.smartBar || {}),
      },
      topLikes: {
        ...DEFAULT_WIDGETS.topLikes,
        ...(parsedState?.widgets?.topLikes || {}),
      },
      topGifts: {
        ...DEFAULT_WIDGETS.topGifts,
        ...(parsedState?.widgets?.topGifts || {}),
      },
    },
    goals: {
      ...DEFAULT_GOALS,
      ...(parsedState?.goals || {}),
    },
    tts: {
      ...DEFAULT_TTS_CONFIG,
      ...(parsedState?.tts || {}),
      profileAssignments: {
        ...DEFAULT_TTS_CONFIG.profileAssignments,
        ...(parsedState?.tts?.profileAssignments || {}),
      },
    },
    integrations: {
      ...DEFAULT_INTEGRATIONS,
      ...(parsedState?.integrations || {}),
      overlayMirror: {
        ...DEFAULT_INTEGRATIONS.overlayMirror,
        ...(parsedState?.integrations?.overlayMirror || {}),
      },
      spotify: {
        ...DEFAULT_INTEGRATIONS.spotify,
        ...(parsedState?.integrations?.spotify || {}),
        devices: Array.isArray(parsedState?.integrations?.spotify?.devices)
          ? parsedState.integrations.spotify.devices
          : DEFAULT_INTEGRATIONS.spotify.devices,
      },
      chaosmod: {
        ...DEFAULT_INTEGRATIONS.chaosmod,
        ...(parsedState?.integrations?.chaosmod || {}),
        catalog: Array.isArray(parsedState?.integrations?.chaosmod?.catalog)
          ? parsedState.integrations.chaosmod.catalog
          : DEFAULT_INTEGRATIONS.chaosmod.catalog,
      },
      obs: {
        ...DEFAULT_INTEGRATIONS.obs,
        ...(parsedState?.integrations?.obs || {}),
      },
      streamerbot: {
        ...DEFAULT_INTEGRATIONS.streamerbot,
        ...(parsedState?.integrations?.streamerbot || {}),
      },
      streamdeck: {
        ...DEFAULT_INTEGRATIONS.streamdeck,
        ...(parsedState?.integrations?.streamdeck || {}),
      },
      tiktok: {
        ...DEFAULT_INTEGRATIONS.tiktok,
        ...(parsedState?.integrations?.tiktok || {}),
        giftCatalog: Array.isArray(parsedState?.integrations?.tiktok?.giftCatalog)
          ? parsedState.integrations.tiktok.giftCatalog
          : DEFAULT_INTEGRATIONS.tiktok.giftCatalog,
        giftCatalogSourceUsername:
          parsedState?.integrations?.tiktok?.giftCatalogSourceUsername
          || parsedState?.integrations?.tiktok?.sourceUsername
          || DEFAULT_INTEGRATIONS.tiktok.giftCatalogSourceUsername,
        giftCatalogSyncedAt:
          parsedState?.integrations?.tiktok?.giftCatalogSyncedAt
          || parsedState?.integrations?.tiktok?.syncedAt
          || DEFAULT_INTEGRATIONS.tiktok.giftCatalogSyncedAt,
        giftCatalogLastError:
          parsedState?.integrations?.tiktok?.giftCatalogLastError
          || parsedState?.integrations?.tiktok?.lastError
          || DEFAULT_INTEGRATIONS.tiktok.giftCatalogLastError,
        emoteCatalog: Array.isArray(parsedState?.integrations?.tiktok?.emoteCatalog)
          ? parsedState.integrations.tiktok.emoteCatalog
          : DEFAULT_INTEGRATIONS.tiktok.emoteCatalog,
        emoteCatalogSourceUsername:
          parsedState?.integrations?.tiktok?.emoteCatalogSourceUsername
          || DEFAULT_INTEGRATIONS.tiktok.emoteCatalogSourceUsername,
        emoteCatalogSyncedAt:
          parsedState?.integrations?.tiktok?.emoteCatalogSyncedAt
          || DEFAULT_INTEGRATIONS.tiktok.emoteCatalogSyncedAt,
        emoteCatalogLastError:
          parsedState?.integrations?.tiktok?.emoteCatalogLastError
          || DEFAULT_INTEGRATIONS.tiktok.emoteCatalogLastError,
      },
    },
  }
}

export function getOutputMeta(outputId) {
  return OUTPUT_OPTIONS.find((option) => option.id === outputId)
}

export function getTriggerLabel(triggerId) {
  return TRIGGER_OPTIONS.find((option) => option.id === triggerId)?.label || triggerId
}

export function isOverlayCapable(action) {
  return action.outputs.some((output) =>
    ['overlayAlert', 'overlayMedia', 'audio', 'tts'].includes(output),
  )
}

export function truncateValue(value) {
  if (!value || value.length <= 72) {
    return value || ''
  }

  return `${value.slice(0, 69)}...`
}

export function detectMediaKind(mediaUrl) {
  if (!mediaUrl) {
    return 'none'
  }

  const lowerMediaUrl = mediaUrl.toLowerCase()

  if (/\.(mp4|webm|ogg)(\?|#|$)/.test(lowerMediaUrl)) {
    return 'video'
  }

  if (/\.(mp3|wav|m4a|aac|flac)(\?|#|$)/.test(lowerMediaUrl)) {
    return 'audio'
  }

  if (/\.(gif|png|jpg|jpeg|webp|svg)(\?|#|$)/.test(lowerMediaUrl)) {
    return 'image'
  }

  return 'none'
}

export function sanitizeSlug(value) {
  const baseValue = String(value || '').trim().toLowerCase()
  const normalized = baseValue
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || DEFAULT_APP_STATE.profile.overlaySlug
}

export function normalizeBaseUrl(value) {
  const rawValue = String(value || '').trim()

  if (!rawValue) {
    return ''
  }

  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`

  try {
    const parsedUrl = new URL(withProtocol)
    return `${parsedUrl.protocol}//${parsedUrl.host}`
  } catch {
    return rawValue.replace(/\/+$/, '')
  }
}

export function buildOverlayUrl(baseUrl, slug, overlayKey = '') {
  return buildNamedOverlayUrl(`/overlay/${sanitizeSlug(slug)}`, baseUrl, overlayKey)
}

export function buildSmartBarUrl(baseUrl, slug, overlayKey = '') {
  return buildNamedOverlayUrl(`/overlay/${sanitizeSlug(slug)}/smart-bar`, baseUrl, overlayKey)
}

export function isNgrokPublicHost(hostname = '') {
  const host = String(hostname || '').trim().toLowerCase()

  return host.endsWith('.ngrok-free.app') || host.endsWith('.ngrok.app') || host.endsWith('.ngrok.io')
}

export function isEphemeralTunnelHost(hostname = '') {
  const host = String(hostname || '').trim().toLowerCase()

  return (
    host.endsWith('.trycloudflare.com')
    || host.endsWith('.loca.lt')
    || host.endsWith('.localtunnel.me')
    || isNgrokPublicHost(host)
  )
}

export function isBlockedTunnelBaseUrl(value = '') {
  try {
    const host = new URL(normalizeBaseUrl(value)).hostname.toLowerCase()

    return isNgrokPublicHost(host)
  } catch {
    return /ngrok/i.test(String(value || ''))
  }
}

export function isLiveStudioRejectedTunnel(value = '') {
  try {
    const host = new URL(normalizeBaseUrl(value)).hostname.toLowerCase()

    return (
      host.endsWith('.trycloudflare.com')
      || host.endsWith('.loca.lt')
      || host.endsWith('.localtunnel.me')
    )
  } catch {
    return /trycloudflare|loca\.lt|localtunnel/i.test(String(value || ''))
  }
}

/** URLs cortas sin ?view=widget para el campo Link de TikTok LIVE Studio. */
export function buildLiveStudioOverlayUrl(pathName, baseUrl, overlayKey = '') {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  if (!normalizedBaseUrl) {
    if (!overlayKey) {
      return pathName
    }

    return `${pathName}?key=${encodeURIComponent(String(overlayKey))}`
  }

  try {
    const overlayUrl = new URL(pathName, normalizedBaseUrl)

    if (overlayKey) {
      overlayUrl.searchParams.set('key', overlayKey)
    }

    return overlayUrl.toString()
  } catch {
    return pathName
  }
}

function appendOverlayUrlParams(searchParams, { overlayKey = '', baseUrl = '' } = {}) {
  searchParams.set('view', 'widget')

  if (overlayKey) {
    searchParams.set('key', String(overlayKey))
  }

  try {
    const host = baseUrl ? new URL(baseUrl).hostname : ''

    if (isNgrokPublicHost(host)) {
      searchParams.set('ngrok-skip-browser-warning', '1')
    }
  } catch {
    return searchParams
  }

  return searchParams
}

function buildNamedOverlayUrl(pathName, baseUrl, overlayKey = '') {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  if (!normalizedBaseUrl) {
    const params = appendOverlayUrlParams(new URLSearchParams(), { overlayKey })
    const query = params.toString()
    return query ? `${pathName}?${query}` : pathName
  }

  try {
    const overlayUrl = new URL(pathName, normalizedBaseUrl)
    appendOverlayUrlParams(overlayUrl.searchParams, { overlayKey, baseUrl: overlayUrl.origin })

    return overlayUrl.toString()
  } catch {
    const params = appendOverlayUrlParams(new URLSearchParams(), { overlayKey, baseUrl: normalizedBaseUrl })
    const query = params.toString()
    return query ? `${pathName}?${query}` : pathName
  }
}

export function buildTopLikesUrl(baseUrl, slug, overlayKey = '') {
  const normalizedBase = normalizeBaseUrl(baseUrl)
  const params = new URLSearchParams()
  params.set('uid', 'live-control')
  if (overlayKey) {
    params.set('key', overlayKey)
  }
  const path = `/widgets/top-likes.html?${params.toString()}`
  if (!normalizedBase) {
    return path
  }
  try {
    return new URL(path, normalizedBase).toString()
  } catch {
    return `${normalizedBase.replace(/\/$/, '')}${path}`
  }
}

export function buildTopGiftsUrl(baseUrl, slug, overlayKey = '') {
  const normalizedBase = normalizeBaseUrl(baseUrl)
  const params = new URLSearchParams()
  params.set('uid', 'live-control')
  if (overlayKey) {
    params.set('key', overlayKey)
  }
  const path = `/widgets/top-donors.html?${params.toString()}`
  if (!normalizedBase) {
    return path
  }
  try {
    return new URL(path, normalizedBase).toString()
  } catch {
    return `${normalizedBase.replace(/\/$/, '')}${path}`
  }
}

export function buildSongRequestUrl(baseUrl, slug, overlayKey = '') {
  return buildNamedOverlayUrl(`/overlay/${sanitizeSlug(slug)}/song-request`, baseUrl, overlayKey)
}

export function buildLiveStudioTopLikesUrl(baseUrl, slug, overlayKey = '') {
  return buildTopLikesUrl(baseUrl, slug, overlayKey)
}

export function buildLiveStudioTopGiftsUrl(baseUrl, slug, overlayKey = '') {
  return buildTopGiftsUrl(baseUrl, slug, overlayKey)
}

export function buildLiveStudioOverlayAlertsUrl(baseUrl, slug, overlayKey = '') {
  return buildLiveStudioOverlayUrl(`/overlay/${sanitizeSlug(slug)}`, baseUrl, overlayKey)
}

export function buildWebSocketUrl(baseUrl, pathname, accessKey = '') {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  if (!normalizedBaseUrl) {
    return pathname
  }

  const socketUrl = new URL(pathname, normalizedBaseUrl)
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'

  if (accessKey) {
    socketUrl.searchParams.set('key', accessKey)
  }

  return socketUrl.toString()
}

export function getActionCommandSummary(action) {
  if (!action) {
    return ''
  }

  const actionType = resolveActionType(action)

  if (action.minecraftMode === 'bedrock-box' && action.minecraftBedrockPresetName) {
    return `Bedrock Box: ${action.minecraftBedrockPresetName}`
  }

  if (action.minecraftMode === 'bedrock-box' && action.minecraftBedrockPresetId) {
    return `Bedrock Box: ${action.minecraftBedrockPresetId}`
  }

  if (action.minecraftMode === 'oneblock' && action.minecraftBedrockPresetName) {
    return `S2E OneBlock: ${action.minecraftBedrockPresetName}`
  }

  if (action.minecraftMode === 'oneblock' && action.minecraftBedrockPresetId) {
    return `S2E OneBlock: ${action.minecraftBedrockPresetId}`
  }

  if (actionType === 'chaosmod' && action.gtaChaosEffectName) {
    return `ChaosMod: ${action.gtaChaosEffectName}`
  }

  if (actionType === 'chaosmod' && action.gtaChaosEffectId) {
    return `ChaosMod: ${action.gtaChaosEffectId}`
  }

  if (actionType === 'gtavwebhook' && action.gtaWebhookCommand) {
    return `GTAVWebhook: ${action.gtaWebhookCommand}`
  }

  return action.commandText || ''
}

export function resolveActionTtsText(action, sourceEvent = null) {
  if (!action?.outputs?.includes('tts')) {
    return ''
  }

  const user = String(
    sourceEvent?.uniqueId || sourceEvent?.userName || sourceEvent?.sourceLabel || '',
  ).trim()
  const comment = String(sourceEvent?.comment || sourceEvent?.matchText || '').trim()
  const eventType = String(sourceEvent?.type || '')

  if (eventType === 'comment' && comment) {
    return user ? `${user}: ${comment}` : comment
  }

  if (eventType === 'gift') {
    const giftName = sourceEvent?.giftName || sourceEvent?.displayText || 'un regalo'
    const repeat = Number(sourceEvent?.repeatCount || 1)
    return `${user || 'Alguien'} envio ${giftName}${repeat > 1 ? ` x${repeat}` : ''}`.trim()
  }

  if (eventType === 'follow') {
    return `${user || 'Alguien'} acaba de seguirte`
  }

  return String(action.overlayText || action.description || action.name || '').trim()
}

export function buildOverlayEvent(action, profile, sourceEvent = null) {
  const ttsText = resolveActionTtsText(action, sourceEvent)

  return {
    id: createId('overlay-event'),
    actionId: action.id,
    title: action.name,
    message: action.overlayText || action.description || 'Evento disparado manualmente desde el panel.',
    commandText: getActionCommandSummary(action),
    mediaUrl: action.mediaUrl,
    outputs: [...action.outputs],
    sourceLabel: sourceEvent?.sourceLabel || sourceEvent?.uniqueId || profile.streamerName,
    durationMs: Number(profile.overlayDurationMs || 5200),
    theme: action.outputs.includes('minecraft')
      ? 'forest'
      : action.outputs.includes('gta')
        ? 'neon'
        : 'ember',
    ttsText,
    ttsAudioUrl: '',
    audioUrl: action.outputs.includes('audio') ? action.mediaUrl : '',
    createdAt: Date.now(),
  }
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeViewerHandle(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

function getSpecificUsersList(trigger) {
  if (Array.isArray(trigger?.specificUsers)) {
    return trigger.specificUsers
      .map((userName) => normalizeViewerHandle(userName))
      .filter(Boolean)
  }

  return []
}

function getTriggerAudience(trigger) {
  if (trigger?.audience) {
    return trigger.audience
  }

  if (getSpecificUsersList(trigger).length > 0) {
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

function matchesTriggerAudience(trigger, event) {
  const audience = getTriggerAudience(trigger)

  if (audience === 'any') {
    return true
  }

  if (audience === 'specific-users') {
    const normalizedUser = normalizeViewerHandle(event?.uniqueId || event?.sourceLabel || '')

    return normalizedUser
      ? getSpecificUsersList(trigger).includes(normalizedUser)
      : false
  }

  if (audience === 'followers') {
    return Boolean(event?.isFollower)
  }

  if (audience === 'subscribers') {
    return Boolean(event?.isSubscriber)
  }

  if (audience === 'moderators') {
    return Boolean(event?.isModerator)
  }

  if (audience === 'super-fans') {
    return Boolean(event?.isSuperFan)
  }

  return true
}

function isAnyMatchRule(ruleText) {
  return [
    '',
    'any',
    'cualquier',
    'cualquier follow',
    'cualquier comentario',
    'comentario global',
    'chat global',
    'cualquier gift',
    'cualquier regalo',
    'cualquier share',
    'cualquier emote',
  ].includes(ruleText)
}

function collectEventCandidates(event) {
  const candidates = [
    event.summary,
    event.matchText,
    event.uniqueId,
    event.comment,
    event.giftId,
    event.giftName,
    String(event.giftCoins || ''),
    event.emoteName,
    event.emoteId,
    event.shareTarget,
    event.displayText,
  ]

  if (event.giftName) {
    candidates.push(`${event.giftName} x${event.repeatCount || 1}`)
  }

  if (Array.isArray(event.emotes)) {
    event.emotes.forEach((emote) => {
      candidates.push(emote?.name, emote?.id)
    })
  }

  return candidates
    .map((value) => normalizeText(value))
    .filter(Boolean)
}

function eventCarriesEmotes(event) {
  return Boolean(
    event?.type === 'emote'
      || event?.emoteId
      || event?.emoteName
      || (Array.isArray(event?.emotes) && event.emotes.some((emote) => emote?.id || emote?.name)),
  )
}

export function matchesTrigger(trigger, event) {
  if (!trigger || !event) {
    return false
  }

  if (trigger.active === false) {
    return false
  }

  if (!matchesTriggerAudience(trigger, event)) {
    return false
  }

  if (trigger.source !== event.type) {
    if (!(trigger.source === 'emote' && eventCarriesEmotes(event))) {
      return false
    }
  }

  if (trigger.source === 'emote' && !eventCarriesEmotes(event)) {
    return false
  }

  const rule = normalizeText(trigger.match)

  if (isAnyMatchRule(rule)) {
    return true
  }

  if (event.type === 'like-burst') {
    const threshold = Number.parseInt(rule.replace(/[^\d]/g, ''), 10)

    if (!Number.isNaN(threshold)) {
      return Number(event.likeCount || 0) >= threshold || Number(event.totalLikeCount || 0) >= threshold
    }
  }

  return collectEventCandidates(event).some((candidate) => candidate === rule || candidate.includes(rule))
}

export function createManualIncomingEvent(type, payload = {}) {
  const now = Date.now()
  const uniqueId = payload.uniqueId || payload.userName || 'manual-trigger'
  const event = {
    id: createId('incoming'),
    type,
    uniqueId,
    nickname: String(payload.nickname || payload.userName || uniqueId).trim(),
    sourceLabel: uniqueId,
    createdAt: now,
    summary: '',
    matchText: '',
    comment: payload.comment || '',
    giftId: payload.giftId || '',
    giftName: payload.giftName || '',
    giftCoins: Number(payload.giftCoins || 0),
    emoteId: payload.emoteId || '',
    emoteName: payload.emoteName || '',
    emoteImageUrl: payload.emoteImageUrl || '',
    emotes: Array.isArray(payload.emotes) ? payload.emotes : [],
    repeatCount: Number(payload.repeatCount || 1),
    likeCount: Number(payload.likeCount || 0),
    totalLikeCount: Number(payload.totalLikeCount || payload.likeCount || 0),
    shareTarget: payload.shareTarget || '',
    displayText: payload.displayText || '',
    isFollower: Boolean(payload.isFollower),
    isSubscriber: Boolean(payload.isSubscriber),
    isModerator: Boolean(payload.isModerator),
    isSuperFan: Boolean(payload.isSuperFan),
  }

  if (type === 'follow') {
    event.summary = `${uniqueId} empezo a seguir`
    event.matchText = uniqueId
    event.displayText = uniqueId
    return event
  }

  if (type === 'gift') {
    event.summary = `${uniqueId} envio ${event.giftName || 'gift'} x${event.repeatCount}`
    event.matchText = `${event.giftName || 'gift'} x${event.repeatCount}`
    event.displayText = event.giftName || event.giftId || 'gift'
    return event
  }

  if (type === 'comment') {
    event.summary = `${uniqueId}: ${event.comment}`
    event.matchText = event.comment
    return event
  }

  if (type === 'emote') {
    event.summary = `${uniqueId} envio ${event.emoteName || event.emoteId || 'un emote'}`
    event.matchText = event.emoteName || event.emoteId
    event.displayText = event.emoteName || event.emoteId
    return event
  }

  if (type === 'share') {
    event.summary = `${uniqueId} compartio el live`
    event.matchText = uniqueId
    event.displayText = uniqueId
    return event
  }

  event.summary = `${uniqueId} mando ${event.likeCount} likes`
  event.matchText = String(event.likeCount)
  return event
}
