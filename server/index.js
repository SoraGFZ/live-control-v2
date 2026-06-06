import { createServer } from 'node:http'
import net from 'node:net'
import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import { WebSocketServer } from 'ws'
import { Rcon } from 'rcon-client'
import {
  ControlEvent,
  TikTokLiveConnection,
  WebcastEvent,
} from 'tiktok-live-connector'
import {
  buildOverlayEvent,
  createId,
  createManualIncomingEvent,
  getActionCommandSummary,
  matchesTrigger,
  mergeStateWithDefaults,
  normalizeBaseUrl,
  normalizeMinecraftCommand,
  resolveActionType,
  sanitizeSlug,
} from '../src/live-control.js'
import {
  createStoredMediaName,
  detectMediaKindFromFileName,
  ensureMediaDirectory,
  getMediaDirectory,
  listMediaItems,
  removeMediaItem,
} from './media-library.js'
import { normalizeVideoFileForWeb } from './media-processing.js'
import {
  buildSpotifyAuthorizeUrl,
  exchangeSpotifyCode,
  getSpotifyAppConfig,
  isSpotifyConfigured,
  refreshSpotifyAccessToken,
  spotifyApiRequest,
} from './spotify.js'
import { SpotifySessionStore } from './spotify-session-store.js'
import { StateStore } from './state-store.js'
import { getStateFilePath } from './storage-paths.js'
import { loadProjectEnv } from './load-env.js'
import {
  deliverSpotifyTrack,
  pickSpotifyDeviceId,
} from './spotify-playback.js'
import { createLeaderboardTracker } from './leaderboards.js'
import { PRODUCT_INFO } from './product-info.js'
import { Server as SocketIoServer } from 'socket.io'
import {
  buildWidgetConfigForName,
  buildWidgetDataForName,
  buildWidgetOverlayPayload,
  mapIncomingEventToTikControlMessages,
  registerTikcontrolWidgetRoutes,
} from './tikcontrol-widget-bridge.js'
import { createWidgetRuntimeStore } from './widget-runtime-store.js'
import {
  enrichGiftEvent,
  fetchGiftCatalog,
  GIFT_REGIONS,
  normalizeCatalogGift,
  toTikControlApiGift,
} from './tikcontrol-gifts.js'
import { createRanksWidgetService } from './tikcontrol-ranks.js'
import { registerTikcontrolSoundsRoutes } from './tikcontrol-sounds-proxy.js'
import { registerTikcontrolGamingRoutes } from './tikcontrol-gaming-api.js'
import { registerTikcontrolTtsRoutes } from './tikcontrol-tts-api.js'
import {
  emitActionTtsPlayback,
  synthesizeActionTts,
} from './tikcontrol-tts-action.js'
import { registerTikcontrolPointsRoutes } from './tikcontrol-points.js'
import {
  emitBattleSocketEvent,
  registerTikcontrolBattlesRoutes,
} from './tikcontrol-battles.js'
import { createAuctionRuntime, registerTikcontrolAuctionRoutes } from './tikcontrol-auction.js'
import {
  createGoalsAccumulatorRuntime,
  createTimerRuntime,
  registerTikcontrolRuntimeExtras,
} from './tikcontrol-runtime-extras.js'
import { createStudioProfilesStore } from './studio-profiles-store.js'
import {
  bootstrapPremiumIntegrations,
  executePremiumOutputs,
  getPremiumIntegrationsSnapshot,
  registerPremiumIntegrationRoutes,
} from './integrations/register-routes.js'
import { sendGameBridgeCommand } from './integrations/gaming-bridge.js'

loadProjectEnv()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const runtimeProcess = globalThis.process
const projectRoot = path.resolve(__dirname, '..')
const distDirectory = path.join(projectRoot, 'dist')
const distIndexFile = path.join(distDirectory, 'index.html')

async function findAvailableServerPort(preferredPort) {
  const initialPort = Number(preferredPort || runtimeProcess.env.PORT || 5123)
  const maxPort = initialPort + 20
  let port = initialPort

  while (port <= maxPort) {
    const server = net.createServer()
    const available = await new Promise((resolve) => {
      server.once('error', (error) => {
        server.close(() => resolve(false))
      })
      server.once('listening', () => {
        server.close(() => resolve(true))
      })
      server.listen(port, '127.0.0.1')
    })

    if (available) {
      return port
    }

    port += 1
  }

  throw new Error(`No se encontro un puerto libre entre ${initialPort} y ${maxPort}`)
}

const serverPort = await findAvailableServerPort()
const desktopModeEnabled = String(runtimeProcess.env.LIVE_CONTROL_DESKTOP_MODE || '').trim() === '1'
const desktopBridgeToken = String(runtimeProcess.env.LIVE_CONTROL_DESKTOP_TOKEN || '').trim()
const recentLimit = 20
const musicHistoryLimit = 20
const cooldownTracker = new Map()
const serverStartedAt = Date.now()

const store = new StateStore()
await store.load()
const widgetRuntime = createWidgetRuntimeStore({
  getState: () => store.getState(),
  saveState: async (nextState) => store.setState(nextState),
})
const studioProfiles = createStudioProfilesStore({
  getState: () => store.getState(),
  setState: async (nextState) => {
    const savedState = await store.setState(nextState)
    broadcast('app', { type: 'state', payload: savedState })
    broadcastStatus()
    return savedState
  },
})
const spotifySessionStore = new SpotifySessionStore()
const persistedSpotifySession = await spotifySessionStore.load()
await ensureMediaDirectory()
const distIndexFileMtimeMs = existsSync(distIndexFile) ? (await fs.stat(distIndexFile)).mtimeMs : Date.now()
const staticAssetVersion = String(Math.round(distIndexFileMtimeMs))

const app = express()
app.use(express.json({ limit: '1mb' }))

async function buildGiftCatalogApiResponse(query = {}) {
  const state = store.getState()
  const region = String(query.region || '').trim().toUpperCase()
  const force = String(query.force || '') === '1'
  let catalog = Array.isArray(state.integrations?.tiktok?.giftCatalog)
    ? state.integrations.tiktok.giftCatalog
    : []

  if (force || !catalog.length) {
    try {
      const cleanUsername =
        normalizeTikTokUsername(tikTokStatus.username)
        || normalizeTikTokUsername(state.profile?.tiktokUsername)
      const canReuseConnection =
        tikTokConnection && normalizeTikTokUsername(tikTokStatus.username) === cleanUsername

      const fetched = await fetchGiftCatalog({
        projectRoot,
        region,
        roomId: tikTokStatus.roomId || '',
        connection: canReuseConnection ? tikTokConnection : null,
        force: true,
        extractImageUrl,
      })

      if (fetched.gifts.length) {
        await updateTikTokGiftCatalog({
          giftCatalog: fetched.gifts,
          lastError: '',
          sourceUsername: cleanUsername,
        })
        catalog = fetched.gifts
      }
    } catch (error) {
      if (!catalog.length) {
        return {
          ok: false,
          gifts: [],
          region,
          error: error.message,
        }
      }
    }
  }

  return {
    ok: true,
    gifts: catalog.map((gift) => toTikControlApiGift(gift)),
    region,
    count: catalog.length,
    syncedAt: state.integrations?.tiktok?.giftCatalogSyncedAt || null,
    source: state.integrations?.tiktok?.giftCatalogSourceUsername || '',
  }
}

buildGiftCatalogApiResponse.regions = () => ({
  ok: true,
  regions: GIFT_REGIONS,
})

registerTikcontrolSoundsRoutes(app)
registerTikcontrolTtsRoutes(app, { store })
registerTikcontrolGamingRoutes(app, {
  getChaosModCatalog: () => store.getState().integrations?.chaosmod?.catalog || [],
})

registerTikcontrolPointsRoutes(app)

registerPremiumIntegrationRoutes(app, {
  store,
  onStatusChange: () => broadcastStatus(),
})

// ✅ Log TEMPRANO - Captura todas las requests antes de cualquier middleware
app.use((request, response, next) => {
  if (request.url.includes('/api/')) {
    console.log(`\n[backend:EARLY] 🔵 REQUEST ENTRANDO: ${request.method} ${request.url}`)
  }
  next()
})

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: async (_request, _file, callback) => {
      try {
        callback(null, await ensureMediaDirectory())
      } catch (error) {
        callback(error)
      }
    },
    filename: (_request, file, callback) => {
      callback(null, createStoredMediaName(file.originalname))
    },
  }),
  limits: {
    fileSize: 250 * 1024 * 1024,
  },
})

const httpServer = createServer(app)
const socketIo = new SocketIoServer(httpServer, {
  cors: {
    origin: '*',
  },
})

registerTikcontrolBattlesRoutes(app, {
  socketIo,
  getActiveProfileId: () => store.getState().profiles?.activeProfileId || 'default',
})

const goalsAccumulatorRuntime = createGoalsAccumulatorRuntime(socketIo)
const timerRuntime = createTimerRuntime(socketIo)
const auctionRuntime = createAuctionRuntime(socketIo)
registerTikcontrolAuctionRoutes(app, { auctionRuntime })
registerTikcontrolRuntimeExtras(app, {
  socketIo,
  widgetRuntime,
  goalsAccumulator: goalsAccumulatorRuntime,
  timerRuntime,
  auctionRuntime,
})

registerTikcontrolWidgetRoutes(app, {
  projectRoot,
  readOverlayKey: getOverlayAccessKey,
  widgetRuntime,
  getGiftCatalogResponse: buildGiftCatalogApiResponse,
  getWidgetRuntimePayload: (widgetName) => {
    const state = store.getState()
    const widgets = buildPublicWidgetsFromSource(state.widgets || {})
    const leaderboards = buildLeaderboardsPayload(state)

    return buildWidgetOverlayPayload({
      widgetName,
      widgets,
      leaderboards,
      smartBar: buildSmartBarStatus(),
    })
  },
  onWidgetConfigSaved: (widgetName, payload) => {
    socketIo.emit('widget:configUpdated', {
      widget: widgetName,
      config: payload?.config || {},
    })
    broadcast('overlay', {
      type: 'widget:config',
      widget: widgetName,
      config: payload?.config || {},
    })
  },
  onGoalsConfigSaved: (payload) => {
    socketIo.emit('goals:configUpdated', payload)
    goalsAccumulatorRuntime?.emit?.('')
  },
})

socketIo.on('connection', (socket) => {
  socket.emit('connected', { ok: true, at: Date.now() })
})

const ranksWidgetService = createRanksWidgetService({
  socketIo,
  broadcastOverlay: (payload) => broadcast('overlay', payload),
})
ranksWidgetService.registerRoutes(app)
studioProfiles.registerRoutes(app)

const socketHubs = {
  app: new Set(),
  overlay: new Set(),
  minecraft: new Set(),
  gta: new Set(),
}

const webSocketServers = {
  app: new WebSocketServer({ noServer: true }),
  overlay: new WebSocketServer({ noServer: true }),
  minecraft: new WebSocketServer({ noServer: true }),
  gta: new WebSocketServer({ noServer: true }),
}

// Heartbeat: termina clientes zombie que no responden ping en 35s
const HEARTBEAT_INTERVAL_MS = 30000
const HEARTBEAT_TIMEOUT_MS = 35000

function startServerHeartbeat(wss, hubSet) {
  setInterval(() => {
    wss.clients.forEach((socket) => {
      if (socket._liveControlAlive === false) {
        hubSet.delete(socket)
        socket.terminate()
        return
      }

      socket._liveControlAlive = false
      socket.ping()
    })
  }, HEARTBEAT_INTERVAL_MS)
}

Object.keys(webSocketServers).forEach((channel) => {
  const wss = webSocketServers[channel]
  startServerHeartbeat(wss, socketHubs[channel])
})

let tikTokConnection = null
let tikTokStatus = {
  connected: false,
  connecting: false,
  username: store.getState().profile.tiktokUsername || '',
  roomId: '',
  lastError: '',
  lastConnectedAt: null,
  lastEventAt: null,
}
let minecraftRcon = null
let minecraftRconSignature = ''
let minecraftRconStatus = {
  connected: false,
  lastError: '',
  lastCommandAt: null,
}
let latestOverlayEvent = null
let smartBarRuntime = {
  sessionStartedAt: null,
  lastSessionDurationMs: 0,
  followCount: 0,
  receivedCoins: 0,
  giftsReceived: 0,
}
const liveLeaderboards = createLeaderboardTracker()
const recentEvents = []
const recentDispatches = []
let mediaLibraryCount = (await listMediaItems()).length
let spotifySyncInFlight = null
let spotifySession = {
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
  scope: '',
  authState: '',
  connectedAt: null,
  accountId: '',
  accountLabel: '',
  accountProduct: '',
  devices: [],
  currentPlayback: null,
  lastSyncAt: null,
  lastError: '',
}
spotifySession = {
  ...spotifySession,
  ...persistedSpotifySession,
}
let publicOverlayMirrorStatus = {
  configured: false,
  targetBaseUrl: '',
  lastSyncAt: null,
  lastError: '',
}
let publicOverlayMirrorQueue = Promise.resolve()
const publicMirrorMediaSyncCache = new Map()

function normalizeTikTokUsername(username) {
  return String(username || '').trim().replace(/^@/, '')
}

function resolveTikTokAuthConfig(config = {}) {
  const storedProfile = store.getState().profile || {}
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config || {}, key)
  const sessionId = String(
    hasOwn('sessionId') ? config.sessionId || '' : storedProfile.tiktokSessionId || '',
  ).trim()
  const ttTargetIdc = String(
    hasOwn('ttTargetIdc') ? config.ttTargetIdc || '' : storedProfile.tiktokTargetIdc || '',
  ).trim()
  const authenticateWs = Boolean(
    hasOwn('authenticateWs') ? config.authenticateWs : storedProfile.tiktokAuthenticateWs,
  )

  return {
    sessionId,
    ttTargetIdc,
    authenticateWs,
    hasAuthenticatedSession: Boolean(sessionId && ttTargetIdc),
  }
}

function createTikTokConnectionOptions(config = {}, { fetchRoomInfoOnConnect = true } = {}) {
  const authConfig = resolveTikTokAuthConfig(config)
  const options = {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    fetchRoomInfoOnConnect,
  }

  if (authConfig.hasAuthenticatedSession) {
    options.sessionId = authConfig.sessionId
    options.ttTargetIdc = authConfig.ttTargetIdc

    if (authConfig.authenticateWs) {
      options.authenticateWs = true
    }
  }

  return {
    ...authConfig,
    options,
  }
}

function broadcastSystemMessage(level, text) {
  broadcast('app', {
    type: 'system-message',
    payload: {
      id: createId('system'),
      level,
      text,
      createdAt: Date.now(),
    },
  })
}

function trimMusicHistory(history = []) {
  return history.slice(0, musicHistoryLimit)
}

function getMusicStateSnapshot() {
  return store.getState().music || mergeStateWithDefaults().music
}

function resolveBaseUrlFromRequest(request) {
  const forwardedProto = String(request?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
  const forwardedHost = String(request?.headers?.['x-forwarded-host'] || '')
    .split(',')[0]
    .trim()
  const host = forwardedHost || String(request?.headers?.host || '').trim()
  const protocol = forwardedProto || request?.protocol || 'http'

  if (!host) {
    return ''
  }

  return normalizeBaseUrl(`${protocol}://${host}`)
}

function getSpotifyRedirectUri(request = null) {
  const desktopDashboardUrl = normalizeBaseUrl(runtimeProcess.env.LIVE_CONTROL_DASHBOARD_URL || '')
  const localDashboardUrl = getLocalDashboardBaseUrl()
  const spotifyConfig = getSpotifyAppConfig(runtimeProcess.env)

  if (spotifyConfig.redirectUri) {
    return spotifyConfig.redirectUri
  }

  if (desktopModeEnabled && desktopDashboardUrl) {
    return `${desktopDashboardUrl}/api/music/spotify/callback`
  }

  if (desktopModeEnabled && localDashboardUrl) {
    return `${localDashboardUrl}/api/music/spotify/callback`
  }

  const configuredBaseUrl =
    normalizeBaseUrl(runtimeProcess.env.LIVE_CONTROL_PUBLIC_URL || '') ||
    normalizeBaseUrl(store.getState().profile.publicBaseUrl) ||
    resolveBaseUrlFromRequest(request) ||
    localDashboardUrl

  if (configuredBaseUrl) {
    return `${configuredBaseUrl}/api/music/spotify/callback`
  }

  return ''
}

function getLocalDashboardBaseUrl() {
  return (
    normalizeBaseUrl(runtimeProcess.env.LIVE_CONTROL_DASHBOARD_URL || '')
    || normalizeBaseUrl(`http://127.0.0.1:${serverPort}`)
  )
}

function resolvePublicOverlayMirrorTarget(state = store.getState()) {
  if (!desktopModeEnabled) {
    return null
  }

  const targetBaseUrl = normalizeBaseUrl(state.profile?.publicBaseUrl || '')
  const localBaseUrl = getLocalDashboardBaseUrl()

  if (!targetBaseUrl || (localBaseUrl && targetBaseUrl === localBaseUrl)) {
    return null
  }

  return {
    targetBaseUrl,
    localBaseUrl,
    accessKey: String(state.profile?.dashboardKey || state.profile?.overlayKey || '').trim(),
  }
}

function updatePublicOverlayMirrorStatus(patch = {}) {
  publicOverlayMirrorStatus = {
    ...publicOverlayMirrorStatus,
    ...patch,
  }
}

function buildPublicProfileFromSource(profile = {}) {
  return {
    projectName: String(profile?.projectName || store.getState().profile.projectName || '').trim(),
    streamerName: String(profile?.streamerName || store.getState().profile.streamerName || '').trim(),
    overlaySlug: sanitizeSlug(profile?.overlaySlug || store.getState().profile.overlaySlug),
    publicBaseUrl: normalizeBaseUrl(profile?.publicBaseUrl || store.getState().profile.publicBaseUrl),
    overlayDurationMs: String(
      profile?.overlayDurationMs || store.getState().profile.overlayDurationMs || '',
    ).trim(),
  }
}

function buildPublicWidgetsFromSource(widgets = {}) {
  return mergeStateWithDefaults({
    widgets,
  }).widgets
}

function buildSmartBarStatusSnapshot() {
  const liveDurationMs = smartBarRuntime.sessionStartedAt
    ? tikTokStatus.connected
      ? Date.now() - smartBarRuntime.sessionStartedAt
      : smartBarRuntime.lastSessionDurationMs || 0
    : smartBarRuntime.lastSessionDurationMs || 0

  return {
    connected: tikTokStatus.connected,
    sessionStartedAt: smartBarRuntime.sessionStartedAt,
    liveDurationMs,
    followCount: smartBarRuntime.followCount,
    receivedCoins: smartBarRuntime.receivedCoins,
    giftsReceived: smartBarRuntime.giftsReceived,
  }
}

function buildPublicMusicPayload(state = store.getState()) {
  return {
    ...(state.music || getMusicStateSnapshot()),
    ...buildMusicStatus(state),
  }
}

function getStoredOverlayMirrorPayload(state = store.getState()) {
  if (desktopModeEnabled) {
    return null
  }

  const storedMirror = state.integrations?.overlayMirror || {}

  if (!storedMirror.syncedAt) {
    return null
  }

  return {
    profile: buildPublicProfileFromSource(storedMirror.profile || state.profile),
    widgets: buildPublicWidgetsFromSource(storedMirror.widgets || state.widgets || {}),
    smartBar: {
      ...buildSmartBarStatusSnapshot(),
      ...(storedMirror.smartBar || {}),
    },
    music: {
      ...mergeStateWithDefaults({
        music: storedMirror.music || state.music || {},
      }).music,
      ...(storedMirror.music || {}),
    },
    syncedAt: storedMirror.syncedAt,
    sourceBaseUrl: normalizeBaseUrl(storedMirror.sourceBaseUrl || ''),
  }
}

function buildMirroredOverlayEvent(eventPayload = {}) {
  return {
    ...eventPayload,
    id: String(eventPayload?.id || createId('overlay-event')).trim(),
    title: String(eventPayload?.title || '').trim(),
    message: String(eventPayload?.message || '').trim(),
    mediaUrl: String(eventPayload?.mediaUrl || '').trim(),
    audioUrl: String(eventPayload?.audioUrl || '').trim(),
    commandText: String(eventPayload?.commandText || '').trim(),
    durationMs: Math.max(0, Number(eventPayload?.durationMs || 0)) || 5000,
    createdAt: Number(eventPayload?.createdAt || Date.now()),
  }
}

function rememberLatestOverlayEvent(eventPayload = {}) {
  const normalizedEvent = buildMirroredOverlayEvent(eventPayload)

  if (!normalizedEvent.id) {
    return null
  }

  latestOverlayEvent = normalizedEvent
  return normalizedEvent
}

function resolveMirroredMediaReference(mediaUrl) {
  const rawValue = String(mediaUrl || '').trim()

  if (!rawValue) {
    return null
  }

  try {
    const localBaseUrl = getLocalDashboardBaseUrl()
    const parsedUrl = rawValue.startsWith('http')
      ? new URL(rawValue)
      : new URL(rawValue, localBaseUrl || `http://127.0.0.1:${serverPort}`)
    const normalizedPath = decodeURIComponent(parsedUrl.pathname || '')

    if (!normalizedPath.startsWith('/media/')) {
      return null
    }

    const fileName = path.basename(normalizedPath)

    if (!fileName) {
      return null
    }

    return {
      fileName,
      mirroredUrl: `/media/${encodeURIComponent(fileName)}`,
      filePath: path.join(getMediaDirectory(), fileName),
    }
  } catch {
    return null
  }
}

async function uploadMirroredMediaAsset(target, mediaUrl) {
  const mediaReference = resolveMirroredMediaReference(mediaUrl)

  if (!mediaReference) {
    return String(mediaUrl || '').trim()
  }

  try {
    const fileStats = await fs.stat(mediaReference.filePath)
    const cacheKey = `${target.targetBaseUrl}|${mediaReference.fileName}`
    const fileSignature = `${fileStats.size}:${fileStats.mtimeMs}`

    if (publicMirrorMediaSyncCache.get(cacheKey) !== fileSignature) {
      const fileBuffer = await fs.readFile(mediaReference.filePath)
      const mirrorResponse = await fetch(
        `${target.targetBaseUrl}/api/mirror/media/${encodeURIComponent(mediaReference.fileName)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            ...(target.accessKey ? { 'X-Live-Control-Key': target.accessKey } : {}),
          },
          body: fileBuffer,
        },
      )

      if (!mirrorResponse.ok) {
        throw new Error(`La subida remota devolvio ${mirrorResponse.status}.`)
      }

      publicMirrorMediaSyncCache.set(cacheKey, fileSignature)
    }

    return mediaReference.mirroredUrl
  } catch (error) {
    updatePublicOverlayMirrorStatus({
      lastError: `No pude copiar el media ${mediaReference.fileName}: ${error.message}`,
    })
    return String(mediaUrl || '').trim()
  }
}

async function sendPublicOverlayMirrorState(reason = 'status') {
  const mirrorTarget = resolvePublicOverlayMirrorTarget()

  if (!mirrorTarget) {
    updatePublicOverlayMirrorStatus({
      configured: false,
      targetBaseUrl: '',
      lastError: '',
    })
    return false
  }

  updatePublicOverlayMirrorStatus({
    configured: true,
    targetBaseUrl: mirrorTarget.targetBaseUrl,
  })

  const payload = getPublicOverlayPayload()
  const mirrorResponse = await fetch(`${mirrorTarget.targetBaseUrl}/api/mirror/overlay/state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(mirrorTarget.accessKey ? { 'X-Live-Control-Key': mirrorTarget.accessKey } : {}),
    },
    body: JSON.stringify({
      reason,
      sourceBaseUrl: mirrorTarget.localBaseUrl,
      payload,
    }),
  })

  if (!mirrorResponse.ok) {
    let responseMessage = ''

    try {
      const responseBody = await mirrorResponse.json()
      responseMessage = String(responseBody?.error || '').trim()
    } catch {
      responseMessage = ''
    }

    throw new Error(responseMessage || `La sincronizacion remota devolvio ${mirrorResponse.status}.`)
  }

  updatePublicOverlayMirrorStatus({
    lastSyncAt: Date.now(),
    lastError: '',
  })
  return true
}

function queuePublicOverlayMirrorState(reason = 'status') {
  publicOverlayMirrorQueue = publicOverlayMirrorQueue
    .catch(() => {})
    .then(() => sendPublicOverlayMirrorState(reason))
    .catch((error) => {
      updatePublicOverlayMirrorStatus({
        configured: Boolean(resolvePublicOverlayMirrorTarget()),
        lastError: error.message,
      })
      return false
    })

  return publicOverlayMirrorQueue
}

async function sendPublicOverlayMirrorEvent(eventPayload) {
  const mirrorTarget = resolvePublicOverlayMirrorTarget()

  if (!mirrorTarget) {
    return false
  }

  const mirroredEvent = buildMirroredOverlayEvent(eventPayload)

  if (mirroredEvent.mediaUrl) {
    mirroredEvent.mediaUrl = await uploadMirroredMediaAsset(mirrorTarget, mirroredEvent.mediaUrl)
  }

  if (mirroredEvent.audioUrl) {
    mirroredEvent.audioUrl = await uploadMirroredMediaAsset(mirrorTarget, mirroredEvent.audioUrl)
  }

  const mirrorResponse = await fetch(`${mirrorTarget.targetBaseUrl}/api/mirror/overlay/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(mirrorTarget.accessKey ? { 'X-Live-Control-Key': mirrorTarget.accessKey } : {}),
    },
    body: JSON.stringify({
      sourceBaseUrl: mirrorTarget.localBaseUrl,
      event: mirroredEvent,
    }),
  })

  if (!mirrorResponse.ok) {
    let responseMessage = ''

    try {
      const responseBody = await mirrorResponse.json()
      responseMessage = String(responseBody?.error || '').trim()
    } catch {
      responseMessage = ''
    }

    throw new Error(responseMessage || `El evento remoto devolvio ${mirrorResponse.status}.`)
  }

  updatePublicOverlayMirrorStatus({
    configured: true,
    targetBaseUrl: mirrorTarget.targetBaseUrl,
    lastSyncAt: Date.now(),
    lastError: '',
  })
  return true
}

function hasDesktopBridgeAccess(request) {
  if (!desktopModeEnabled || !desktopBridgeToken) {
    return false
  }

  const incomingToken = String(request?.headers?.['x-live-control-desktop-token'] || '').trim()
  return Boolean(incomingToken && incomingToken === desktopBridgeToken)
}

function requireDesktopBridgeAccess(request, response, next) {
  if (!hasDesktopBridgeAccess(request)) {
    response.status(403).json({ error: 'Esta ruta interna solo puede usarla la app desktop.' })
    return
  }

  next()
}

function normalizeSpotifyTrack(track) {
  if (!track?.id) {
    return null
  }

  return {
    id: String(track.id),
    uri: String(track.uri || ''),
    name: String(track.name || ''),
    artists: Array.isArray(track.artists) ? track.artists.map((artist) => artist?.name).filter(Boolean) : [],
    imageUrl: extractImageUrl(track.album?.images?.[0]) || extractImageUrl(track.album?.images?.[1]) || '',
    durationMs: Number(track.duration_ms || 0),
    explicit: Boolean(track.explicit),
    albumName: String(track.album?.name || ''),
  }
}

function normalizeSpotifyDevice(device) {
  if (!device?.id && !device?.name) {
    return null
  }

  return {
    id: String(device.id || ''),
    name: String(device.name || 'Dispositivo activo'),
    type: String(device.type || ''),
    isActive: Boolean(device.is_active),
    volumePercent: Number(device.volume_percent || 0),
  }
}

function buildMusicStatus(state = store.getState()) {
  const music = state.music || getMusicStateSnapshot()
  const cooldownSeconds = Math.max(0, Number(music.cooldownSeconds || 0))
  const lastCommandAt = Number(music.lastCommandAt || 0)
  const cooldownUntil = cooldownSeconds > 0 && lastCommandAt ? lastCommandAt + cooldownSeconds * 1000 : null
  const accountProduct = String(spotifySession.accountProduct || '').trim().toLowerCase()
  const requiresPremium = Boolean(accountProduct && accountProduct !== 'premium')

  return {
    configured: isSpotifyConfigured(runtimeProcess.env),
    enabled: Boolean(music.enabled),
    provider: music.provider || 'spotify',
    connected: Boolean(spotifySession.refreshToken),
    accountLabel: spotifySession.accountLabel || '',
    accountProduct: spotifySession.accountProduct || '',
    requiresPremium,
    redirectUri: getSpotifyRedirectUri(),
    devices: spotifySession.devices || [],
    currentPlayback: spotifySession.currentPlayback,
    queue: Array.isArray(music.queue) ? music.queue : [],
    history: Array.isArray(music.history) ? music.history : [],
    queueCount: Array.isArray(music.queue) ? music.queue.length : 0,
    historyCount: Array.isArray(music.history) ? music.history.length : 0,
    currentRequestId: music.currentRequestId || '',
    selectedDeviceId: music.selectedDeviceId || '',
    selectedDeviceName: music.selectedDeviceName || '',
    cooldownSeconds,
    cooldownUntil,
    lastError: spotifySession.lastError || '',
    lastSyncAt: spotifySession.lastSyncAt || null,
    commands: {
      play: music.playCommand || '!play',
      skip: music.skipCommand || '!skip',
      remove: music.removeCommand || '!quitar',
    },
  }
}

async function persistSpotifySession() {
  await spotifySessionStore.setSession({
    accessToken: spotifySession.accessToken,
    refreshToken: spotifySession.refreshToken,
    expiresAt: spotifySession.expiresAt,
    scope: spotifySession.scope,
    authState: spotifySession.authState,
    connectedAt: spotifySession.connectedAt,
    accountId: spotifySession.accountId,
    accountLabel: spotifySession.accountLabel,
    accountProduct: spotifySession.accountProduct,
    devices: spotifySession.devices,
    currentPlayback: spotifySession.currentPlayback,
    lastSyncAt: spotifySession.lastSyncAt,
    lastError: spotifySession.lastError,
  })
}

async function persistMusicState(nextMusic) {
  const currentState = store.getState()
  const nextState = mergeStateWithDefaults({
    ...currentState,
    music: {
      ...currentState.music,
      ...nextMusic,
      queue: Array.isArray(nextMusic?.queue) ? nextMusic.queue : currentState.music.queue,
      history: trimMusicHistory(
        Array.isArray(nextMusic?.history) ? nextMusic.history : currentState.music.history,
      ),
    },
  })
  const savedState = await store.setState(nextState)
  broadcast('app', { type: 'state', payload: savedState })
  broadcastStatus()
  return savedState
}

function getSelectedSpotifyDeviceId(musicState, playback = null, devices = []) {
  const preferredId = String(musicState?.selectedDeviceId || '').trim()

  if (preferredId) {
    return preferredId
  }

  if (playback?.device?.id) {
    return playback.device.id
  }

  return devices.find((device) => device?.isActive)?.id || ''
}

function moveMusicRequestToHistory(musicState, requestId, patch = {}) {
  const queue = Array.isArray(musicState.queue) ? [...musicState.queue] : []
  const requestIndex = queue.findIndex((entry) => entry.id === requestId)

  if (requestIndex < 0) {
    return musicState
  }

  const [requestEntry] = queue.splice(requestIndex, 1)
  const nextHistory = trimMusicHistory([
    {
      ...requestEntry,
      ...patch,
    },
    ...(Array.isArray(musicState.history) ? musicState.history : []),
  ])

  return {
    ...musicState,
    queue,
    history: nextHistory,
    currentRequestId: musicState.currentRequestId === requestId ? '' : musicState.currentRequestId,
  }
}

async function ensureSpotifyAccessToken() {
  const spotifyConfig = getSpotifyAppConfig(runtimeProcess.env)

  if (!spotifyConfig.clientId || !spotifyConfig.clientSecret) {
    throw new Error('Faltan SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en el backend.')
  }

  if (spotifySession.accessToken && spotifySession.expiresAt - Date.now() > 60_000) {
    return spotifySession.accessToken
  }

  if (!spotifySession.refreshToken) {
    throw new Error('Spotify no esta conectado todavia.')
  }

  const refreshedToken = await refreshSpotifyAccessToken({
    clientId: spotifyConfig.clientId,
    clientSecret: spotifyConfig.clientSecret,
    refreshToken: spotifySession.refreshToken,
  })

  spotifySession = {
    ...spotifySession,
    accessToken: refreshedToken.access_token,
    refreshToken: refreshedToken.refresh_token || spotifySession.refreshToken,
    expiresAt: Date.now() + Number(refreshedToken.expires_in || 3600) * 1000,
    scope: refreshedToken.scope || spotifySession.scope,
    lastError: '',
  }
  await persistSpotifySession()

  return spotifySession.accessToken
}

async function syncSpotifyPlaybackState({ queueNextIfNeeded = true } = {}) {
  if (spotifySyncInFlight) {
    return spotifySyncInFlight
  }

  spotifySyncInFlight = (async () => {
    if (!spotifySession.refreshToken && !spotifySession.accessToken) {
      return buildMusicStatus()
    }

    const accessToken = await ensureSpotifyAccessToken()
    const [profileResult, devicesResult, playbackResult] = await Promise.allSettled([
      spotifyApiRequest({
        accessToken,
        path: 'me',
      }),
      spotifyApiRequest({
        accessToken,
        path: 'me/player/devices',
      }),
      spotifyApiRequest({
        accessToken,
        path: 'me/player',
        expectedStatus: [200, 204],
      }),
    ])

    if (profileResult.status === 'fulfilled') {
      spotifySession = {
        ...spotifySession,
        accountId: String(profileResult.value?.id || ''),
        accountLabel:
          String(profileResult.value?.display_name || '').trim() ||
          String(profileResult.value?.id || '').trim(),
        accountProduct: String(profileResult.value?.product || '').trim(),
      }
    }

    if (devicesResult.status !== 'fulfilled') {
      throw devicesResult.reason
    }

    const normalizedDevices = Array.isArray(devicesResult.value?.devices)
      ? devicesResult.value.devices.map(normalizeSpotifyDevice).filter(Boolean)
      : []
    const playbackPayload = playbackResult.status === 'fulfilled' ? playbackResult.value : null
    const normalizedPlayback = playbackPayload
      ? {
          isPlaying: Boolean(playbackPayload.is_playing),
          progressMs: Number(playbackPayload.progress_ms || 0),
          device: normalizeSpotifyDevice(playbackPayload.device),
          track: normalizeSpotifyTrack(playbackPayload.item),
        }
      : null

    spotifySession = {
      ...spotifySession,
      devices: normalizedDevices,
      currentPlayback: normalizedPlayback,
      lastSyncAt: Date.now(),
      lastError: '',
    }
    await persistSpotifySession()

    const originalMusicState = getMusicStateSnapshot()
    let musicState = {
      ...originalMusicState,
      queue: [...(originalMusicState.queue || [])],
      history: [...(originalMusicState.history || [])],
    }
    const currentTrackId = normalizedPlayback?.track?.id || ''
    const activeRequest = musicState.queue.find((entry) => entry.id === musicState.currentRequestId)

    if (activeRequest && activeRequest.trackId && currentTrackId && activeRequest.trackId !== currentTrackId) {
      musicState = moveMusicRequestToHistory(musicState, activeRequest.id, {
        status: 'completed',
        completedAt: Date.now(),
      })
    }

    const sentRequest = musicState.queue.find(
      (entry) => entry.status === 'sent' && entry.trackId && entry.trackId === currentTrackId,
    )

    if (sentRequest) {
      musicState = {
        ...musicState,
        currentRequestId: sentRequest.id,
        queue: musicState.queue.map((entry) =>
          entry.id === sentRequest.id
            ? {
                ...entry,
                status: 'playing',
                playedAt: entry.playedAt || Date.now(),
              }
            : entry,
        ),
      }
    }

    const hasSentPending = musicState.queue.some((entry) => entry.status === 'sent')
    const nextQueuedRequest = musicState.queue.find((entry) => entry.status === 'queued')
    const targetDeviceId = pickSpotifyDeviceId(musicState, normalizedDevices, normalizedPlayback)
    const currentDeviceId = normalizedPlayback?.device?.id || ''
    const isPlaybackActive = Boolean(
      normalizedPlayback?.isPlaying || normalizedPlayback?.track?.id,
    )

    if (queueNextIfNeeded && nextQueuedRequest && targetDeviceId && !hasSentPending) {
      const deliveryMode = await deliverSpotifyTrack(
        accessToken,
        targetDeviceId,
        nextQueuedRequest.uri,
        { isPlaybackActive, currentDeviceId },
      )

      musicState = {
        ...musicState,
        currentRequestId:
          deliveryMode === 'playing' ? nextQueuedRequest.id : musicState.currentRequestId,
        queue: musicState.queue.map((entry) =>
          entry.id === nextQueuedRequest.id
            ? {
                ...entry,
                status: deliveryMode === 'playing' ? 'playing' : 'sent',
                queuedAt: Date.now(),
                playedAt: deliveryMode === 'playing' ? Date.now() : entry.playedAt || null,
              }
            : entry,
        ),
      }
    }

    if (JSON.stringify(musicState) !== JSON.stringify(originalMusicState)) {
      await persistMusicState(musicState)
    } else {
      broadcastStatus()
    }
    return buildMusicStatus()
  })()
    .catch((error) => {
      spotifySession = {
        ...spotifySession,
        lastError: error.message,
      }
      void persistSpotifySession()
      broadcastStatus()
      throw error
    })
    .finally(() => {
      spotifySyncInFlight = null
    })

  return spotifySyncInFlight
}

async function searchSpotifyTrack(query, allowExplicit = false) {
  const accessToken = await ensureSpotifyAccessToken()
  const searchResponse = await spotifyApiRequest({
    accessToken,
    path: 'search',
    query: {
      q: query,
      type: 'track',
      limit: 5,
    },
  })

  const normalizedTracks = Array.isArray(searchResponse?.tracks?.items)
    ? searchResponse.tracks.items.map(normalizeSpotifyTrack).filter(Boolean)
    : []

  if (allowExplicit) {
    return normalizedTracks[0] || null
  }

  return normalizedTracks.find((track) => !track.explicit) || normalizedTracks[0] || null
}

function createMusicQueueEntry({ requester, query, track, source = 'comment' }) {
  return {
    id: createId('music-request'),
    requester: String(requester || 'chat').trim() || 'chat',
    source,
    query: String(query || '').trim(),
    trackId: track.id,
    uri: track.uri,
    name: track.name,
    artists: track.artists,
    imageUrl: track.imageUrl,
    durationMs: track.durationMs,
    explicit: Boolean(track.explicit),
    albumName: track.albumName || '',
    status: 'queued',
    createdAt: Date.now(),
    queuedAt: null,
    playedAt: null,
  }
}

function parseMusicCommentCommand(commentText, musicState) {
  const normalizedComment = String(commentText || '').trim()

  if (!normalizedComment || !musicState?.enabled) {
    return null
  }

  const playCommand = String(musicState.playCommand || '!play').trim()
  const skipCommand = String(musicState.skipCommand || '!skip').trim()
  const removeCommand = String(musicState.removeCommand || '!quitar').trim()
  const normalizedLowerCase = normalizedComment.toLowerCase()

  if (
    musicState.playEnabled &&
    playCommand &&
    normalizedLowerCase.startsWith(playCommand.toLowerCase())
  ) {
    return {
      type: 'play',
      query: normalizedComment.slice(playCommand.length).trim(),
    }
  }

  if (musicState.skipEnabled && skipCommand && normalizedLowerCase === skipCommand.toLowerCase()) {
    return { type: 'skip' }
  }

  if (
    musicState.removeEnabled &&
    removeCommand &&
    normalizedLowerCase.startsWith(removeCommand.toLowerCase())
  ) {
    return {
      type: 'remove',
      query: normalizedComment.slice(removeCommand.length).trim(),
    }
  }

  return null
}

function canUserUseMusicCommands(event, musicState) {
  const allowAllUsers = musicState?.allowAllUsers !== false
  const allowSubscribers = Boolean(musicState?.allowSubscribers)
  const allowModerators = Boolean(musicState?.allowModerators)

  if (allowAllUsers) {
    return true
  }

  if (allowModerators && event?.isModerator) {
    return true
  }

  if (allowSubscribers && (event?.isSubscriber || event?.isSuperFan)) {
    return true
  }

  return false
}

function buildMusicPermissionMessage(musicState) {
  const labels = []

  if (musicState?.allowAllUsers !== false) {
    labels.push('todos')
  }

  if (musicState?.allowSubscribers) {
    labels.push('super fans y suscriptores')
  }

  if (musicState?.allowModerators) {
    labels.push('mods')
  }

  if (!labels.length) {
    return 'El Song Request esta restringido en este momento.'
  }

  return `Este Song Request esta disponible solo para ${labels.join(', ')}.`
}

async function handleMusicPlayRequest(requester, query, musicState, source = 'comment') {
  const trimmedQuery = String(query || '').trim()

  if (!trimmedQuery) {
    broadcastSystemMessage('warn', 'Usa !play seguido del artista o nombre de la cancion.')
    return true
  }

  if (!isSpotifyConfigured(runtimeProcess.env)) {
    broadcastSystemMessage('warn', 'Spotify todavia no esta configurado en el backend.')
    return true
  }

  if (!spotifySession.refreshToken) {
    broadcastSystemMessage('warn', 'Conecta tu cuenta de Spotify en la seccion Musica antes de usar !play.')
    return true
  }

  const queue = Array.isArray(musicState.queue) ? musicState.queue : []
  const cooldownSeconds = Math.max(0, Number(musicState.cooldownSeconds || 0))
  const maxQueueLength = Math.max(1, Number(musicState.maxQueueLength || 10))
  const maxRequestsPerUser = Math.max(1, Number(musicState.maxRequestsPerUser || 2))
  const normalizedRequester = String(requester || 'chat').trim().toLowerCase()
  const requesterActiveItems = queue.filter(
    (entry) =>
      String(entry.requester || '').trim().toLowerCase() === normalizedRequester &&
      ['queued', 'sent', 'playing'].includes(entry.status),
  )

  if (queue.length >= maxQueueLength) {
    broadcastSystemMessage('warn', 'La cola de canciones ya llego al maximo configurado.')
    return true
  }

  if (cooldownSeconds > 0 && musicState.lastCommandAt) {
    const elapsedMs = Date.now() - Number(musicState.lastCommandAt || 0)
    const cooldownRemainingMs = cooldownSeconds * 1000 - elapsedMs

    if (cooldownRemainingMs > 0) {
      const remainingSeconds = Math.max(1, Math.ceil(cooldownRemainingMs / 1000))
      broadcastSystemMessage(
        'warn',
        `Espera ${remainingSeconds}s antes de pedir otra cancion con !play.`,
      )
      return true
    }
  }

  if (requesterActiveItems.length >= maxRequestsPerUser) {
    broadcastSystemMessage('warn', `${requester} ya llego al limite de canciones pendientes.`)
    return true
  }

  const selectedTrack = await searchSpotifyTrack(trimmedQuery, Boolean(musicState.allowExplicit))

  if (!selectedTrack) {
    broadcastSystemMessage('warn', `No encontre una cancion para "${trimmedQuery}".`)
    return true
  }

  if (selectedTrack.explicit && !musicState.allowExplicit) {
    broadcastSystemMessage('warn', 'La mejor coincidencia era explicita y ese contenido esta bloqueado.')
    return true
  }

  // Re-fetch fresh snapshot right before the final decision to add.
  // This catches concurrent requests (multiple !play or rapid simulator clicks) and prevents:
  // - Adding the exact same track multiple times (which would queue the same song repeatedly to Spotify)
  // - Exceeding per-user limits due to snapshot races
  const fresh = getMusicStateSnapshot()
  const freshQueue = Array.isArray(fresh.queue) ? fresh.queue : []
  const freshRequesterActiveItems = freshQueue.filter(
    (entry) =>
      String(entry.requester || '').trim().toLowerCase() === normalizedRequester &&
      ['queued', 'sent', 'playing'].includes(entry.status)
  )
  if (freshRequesterActiveItems.length >= maxRequestsPerUser) {
    broadcastSystemMessage('warn', `${requester} ya llego al limite de canciones pendientes.`)
    return true
  }
  const alreadyPendingSameTrack = freshQueue.some((entry) =>
    entry.trackId &&
    entry.trackId === selectedTrack.id &&
    ['queued', 'sent', 'playing'].includes(entry.status)
  )
  if (alreadyPendingSameTrack) {
    broadcastSystemMessage('warn', `La canción "${selectedTrack.name}" ya está en la cola de Spotify.`)
    return true
  }

  const nextRequest = createMusicQueueEntry({
    requester,
    query: trimmedQuery,
    track: selectedTrack,
    source,
  })

  await persistMusicState({
    ...fresh,
    queue: [...freshQueue, nextRequest],
    lastCommandAt: Date.now(),
  })
  broadcastSystemMessage(
    'info',
    `${nextRequest.requester} pidio ${nextRequest.name} · ${nextRequest.artists.join(', ')}`,
  )

  // Chatbot-style response in the live chat (like Tikfinity)
  // Only for real chat comments, not manual simulator tests
  if (source !== 'manual') {
    const songInfo = `${nextRequest.name} de ${Array.isArray(nextRequest.artists) ? nextRequest.artists.join(', ') : ''}`
    const chatMessage = `La cancion ${songInfo} se agrego correctamente a la fila de reproduccion usa !quitar si esa no era la que querias - @soragfz28`
    await sendTikTokLiveMessage(chatMessage)
  }

  await syncSpotifyPlaybackState({ queueNextIfNeeded: true })
  return true
}

async function handleMusicSkipRequest(requester, musicState) {
  if (!spotifySession.refreshToken) {
    broadcastSystemMessage('warn', 'Spotify no esta conectado, asi que no puedo usar !skip.')
    return true
  }

  await syncSpotifyPlaybackState({ queueNextIfNeeded: false })
  const accessToken = await ensureSpotifyAccessToken()
  const targetDeviceId = getSelectedSpotifyDeviceId(
    musicState,
    spotifySession.currentPlayback,
    spotifySession.devices,
  )

  await spotifyApiRequest({
    accessToken,
    path: 'me/player/next',
    method: 'POST',
    query: {
      device_id: targetDeviceId || undefined,
    },
    expectedStatus: 204,
  })

  let nextMusicState = {
    ...musicState,
    queue: [...(musicState.queue || [])],
    history: [...(musicState.history || [])],
  }

  if (nextMusicState.currentRequestId) {
    nextMusicState = moveMusicRequestToHistory(nextMusicState, nextMusicState.currentRequestId, {
      status: 'skipped',
      completedAt: Date.now(),
      skippedBy: String(requester || 'panel').trim() || 'panel',
    })
  }

  await persistMusicState(nextMusicState)
  broadcastSystemMessage('info', `${requester} salto la cancion actual.`)
  await syncSpotifyPlaybackState({ queueNextIfNeeded: true })
  return true
}

async function handleMusicRemoveRequest(requester, filterQuery, musicState) {
  const normalizedRequester = String(requester || 'chat').trim().toLowerCase()
  const normalizedFilter = String(filterQuery || '').trim().toLowerCase()
  const queue = Array.isArray(musicState.queue) ? [...musicState.queue] : []
  const removableEntries = queue.filter((entry) => {
    if (String(entry.requester || '').trim().toLowerCase() !== normalizedRequester) {
      return false
    }

    if (entry.status !== 'queued') {
      return false
    }

    if (!normalizedFilter) {
      return true
    }

    return `${entry.name} ${entry.artists?.join(' ')} ${entry.query}`
      .toLowerCase()
      .includes(normalizedFilter)
  })

  if (!removableEntries.length) {
    broadcastSystemMessage('warn', 'No encontre canciones pendientes tuyas para quitar.')
    return true
  }

  const removableIds = new Set(removableEntries.map((entry) => entry.id))
  await persistMusicState({
    ...musicState,
    queue: queue.filter((entry) => !removableIds.has(entry.id)),
    history: trimMusicHistory([
      ...removableEntries.map((entry) => ({
        ...entry,
        status: 'removed',
        completedAt: Date.now(),
      })),
      ...(musicState.history || []),
    ]),
    lastCommandAt: Date.now(),
  })
  broadcastSystemMessage(
    'info',
    `${requester} quito ${removableEntries.length} cancion${removableEntries.length === 1 ? '' : 'es'} de la cola.`,
  )
  await syncSpotifyPlaybackState({ queueNextIfNeeded: true })
  return true
}

async function sendTikTokLiveMessage(text) {
  if (!tikTokConnection || !text) return false
  try {
    if (typeof tikTokConnection.sendMessage === 'function') {
      // TikTok live comments have practical length limits ~100-200 chars
      const safeText = String(text).slice(0, 180).trim()
      await tikTokConnection.sendMessage(safeText)
      return true
    }
  } catch (err) {
    console.warn('[tiktok] No se pudo enviar mensaje al chat en vivo:', err?.message || err)
  }
  return false
}

async function handleMusicCommentCommand(event, state) {
  if (event?.type !== 'comment') {
    return false
  }

  const musicState = state.music || getMusicStateSnapshot()
  const parsedCommand = parseMusicCommentCommand(event.comment, musicState)

  if (!parsedCommand) {
    return false
  }

  const requester = String(event.uniqueId || event.userName || 'chat').trim() || 'chat'

  if (!canUserUseMusicCommands(event, musicState)) {
    broadcastSystemMessage('warn', buildMusicPermissionMessage(musicState))
    return true
  }

  if (parsedCommand.type === 'play') {
    await handleMusicPlayRequest(requester, parsedCommand.query, musicState)
    return true
  }

  if (parsedCommand.type === 'skip') {
    await handleMusicSkipRequest(requester, musicState)
    return true
  }

  if (parsedCommand.type === 'remove') {
    await handleMusicRemoveRequest(requester, parsedCommand.query, musicState)
    return true
  }

  return false
}

function normalizeRemoteImageUrl(imageUrl) {
  const normalizedValue = String(imageUrl || '').trim()

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

function extractImageUrl(imageValue, depth = 0) {
  if (!imageValue || depth > 4) {
    return ''
  }

  if (typeof imageValue === 'string') {
    return normalizeRemoteImageUrl(imageValue)
  }

  if (Array.isArray(imageValue)) {
    for (const nestedValue of imageValue) {
      const nestedUrl = extractImageUrl(nestedValue, depth + 1)

      if (nestedUrl) {
        return nestedUrl
      }
    }

    return ''
  }

  const directKeys = ['imageUrl', 'url', 'src', 'displayUrl', 'downloadUrl', 'webUri', 'open_web_url']

  for (const key of directKeys) {
    const directUrl = extractImageUrl(imageValue?.[key], depth + 1)

    if (directUrl) {
      return directUrl
    }
  }

  const listKeys = ['urlList', 'url_list', 'urls']

  for (const key of listKeys) {
    const listUrl = extractImageUrl(imageValue?.[key], depth + 1)

    if (listUrl) {
      return listUrl
    }
  }

  const fallbackKeys = ['uri']

  for (const key of fallbackKeys) {
    const fallbackUrl = extractImageUrl(imageValue?.[key], depth + 1)

    if (fallbackUrl) {
      return fallbackUrl
    }
  }

  const nestedKeys = [
    'image',
    'icon',
    'emoteImage',
    'emojiIcon',
    'emote',
    'emoteDetails',
    'thumbnail',
    'cover',
    'origin',
    'avatarThumb',
  ]

  for (const key of nestedKeys) {
    const nestedUrl = extractImageUrl(imageValue?.[key], depth + 1)

    if (nestedUrl) {
      return nestedUrl
    }
  }

  return ''
}

function normalizeEmoteCatalogEntry(emote, sortOrder = 0) {
  const sourceEmote = emote?.emote || emote?.emoteDetails || emote || {}
  const normalizedId = String(
    sourceEmote?.id ||
      sourceEmote?.emoteId ||
      sourceEmote?.emote_id ||
      sourceEmote?.uuid ||
      sortOrder,
  ).trim()
  const normalizedName = String(
    sourceEmote?.name ||
      sourceEmote?.label ||
      sourceEmote?.title ||
      sourceEmote?.displayName ||
      sourceEmote?.alias ||
      sourceEmote?.emoteName ||
      '',
  ).trim()
  const imageUrl =
    extractImageUrl(sourceEmote?.image) ||
    extractImageUrl(sourceEmote?.icon) ||
    extractImageUrl(sourceEmote?.emoteImage) ||
    extractImageUrl(sourceEmote?.emojiIcon) ||
    extractImageUrl(sourceEmote) ||
    sourceEmote?.emoteImageUrl ||
    sourceEmote?.imageUrl ||
    ''

  if (!normalizedId) {
    return null
  }

  return {
    id: normalizedId,
    name: normalizedName || `Emote ${normalizedId}`,
    imageUrl: String(imageUrl || '').trim(),
    source:
      String(sourceEmote?.source || emote?.source || 'tiktok-live-connector').trim()
      || 'tiktok-live-connector',
    category: String(sourceEmote?.category || emote?.category || '').trim(),
    sortOrder,
  }
}

function prettifyTikTokStickerName(rawName, fallbackId = '') {
  const normalized = String(rawName || '')
    .trim()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^webcast-va\//i, '')
    .replace(/^sticker[_-]?/i, '')
    .replace(/^emote[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return fallbackId ? `Sticker ${fallbackId}` : 'Sticker'
  }

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase())
}

function extractTikTokAuthenticatedEmoteEntries(payload = {}) {
  const sources = [
    ['default', payload?.emote_config?.default_emote_list],
    ['current', payload?.current_emote_detail?.emote_list],
    ['stable', payload?.stable_emote_detail?.emote_list],
    ['fans', payload?.fans_emote_detail?.emote_config?.default_emote_list],
    ['fans-bonus', payload?.fans_emote_detail?.fans_emote_detail?.emote_list],
    ['super-fan', payload?.super_fan_emote_detail?.fans_emote_detail?.emote_config?.default_emote_list],
    ['package', payload?.package_emote_list],
    ['private', payload?.private_emote_detail?.emote_list],
  ]

  const catalog = []
  const seenIds = new Set()

  sources.forEach(([category, collection]) => {
    if (!Array.isArray(collection)) {
      return
    }

    collection.forEach((rawEmote) => {
      const normalizedId = String(
        rawEmote?.emote_id
        || rawEmote?.emoteId
        || rawEmote?.id
        || rawEmote?.uuid
        || '',
      ).trim()

      if (!normalizedId || seenIds.has(normalizedId)) {
        return
      }

      const rawUri =
        String(rawEmote?.image?.uri || rawEmote?.uri || rawEmote?.image_url || '').trim()
      const rawFileName = rawUri ? path.posix.basename(rawUri) : ''
      const rawStem = rawFileName.replace(/\.[a-z0-9]+$/i, '')
      const normalizedEntry = normalizeEmoteCatalogEntry(
        {
          ...rawEmote,
          id: normalizedId,
          name: prettifyTikTokStickerName(
            rawEmote?.name || rawEmote?.label || rawEmote?.display_name || rawStem,
            normalizedId,
          ),
          image: rawEmote?.image,
          source: 'tiktok-authenticated',
          category,
        },
        catalog.length,
      )

      if (!normalizedEntry) {
        return
      }

      seenIds.add(normalizedId)
      catalog.push(normalizedEntry)
    })
  })

  return catalog
}

async function fetchTikTokAuthenticatedEmoteCatalog(
  sourceUsername = '',
  {
    sessionId = '',
    ttTargetIdc = '',
  } = {},
) {
  const cleanUsername =
    normalizeTikTokUsername(sourceUsername)
    || normalizeTikTokUsername(tikTokStatus.username)
    || normalizeTikTokUsername(store.getState().profile.tiktokUsername)
  const resolvedSessionId =
    String(sessionId || store.getState().profile.tiktokSessionId || '').trim()
  const resolvedTtTargetIdc =
    String(ttTargetIdc || store.getState().profile.tiktokTargetIdc || '').trim()

  if (!cleanUsername) {
    throw new Error('Necesito tu username de TikTok para buscar stickers autenticados.')
  }

  if (!resolvedSessionId || !resolvedTtTargetIdc) {
    throw new Error('Necesito una sesion valida de TikTok para obtener stickers sin prender el live.')
  }

  const connection = new TikTokLiveConnection(cleanUsername, {
    sessionId: resolvedSessionId,
    ttTargetIdc: resolvedTtTargetIdc,
    fetchRoomInfoOnConnect: false,
    processInitialData: false,
    authenticateWs: false,
  })

  let roomMeta = null

  try {
    roomMeta = await connection.webClient.fetchRoomInfoFromHtml({ uniqueId: cleanUsername })
  } catch {
    roomMeta = await connection.webClient.fetchRoomInfoFromApiLive({ uniqueId: cleanUsername })
  }

  const secAnchorId = String(
    roomMeta?.user?.secUid
    || roomMeta?.user?.sec_uid
    || roomMeta?.data?.user?.secUid
    || roomMeta?.data?.user?.sec_uid
    || '',
  ).trim()

  if (!secAnchorId) {
    throw new Error('No pude resolver el secUid del canal para pedir los stickers autenticados.')
  }

  const response = await fetch(
    `https://webcast.tiktok.com/webcast/sub/privilege/get_sub_emote_detail?aid=1988&sec_anchor_id=${encodeURIComponent(secAnchorId)}`,
    {
      headers: {
        accept: 'application/json, text/plain, */*',
        cookie: `sessionid=${resolvedSessionId}; tt-target-idc=${resolvedTtTargetIdc}`,
        referer: 'https://www.tiktok.com/',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      },
    },
  )

  if (!response.ok) {
    throw new Error(`TikTok devolvio ${response.status} al pedir los stickers autenticados.`)
  }

  const payload = await response.json()
  const entries = extractTikTokAuthenticatedEmoteEntries(payload?.data || payload || {})

  return {
    entries,
    secAnchorId,
    roomId: String(roomMeta?.user?.roomId || roomMeta?.data?.user?.roomId || '').trim(),
    sourceUsername: cleanUsername,
  }
}

function normalizeGiftCatalogEntry(gift, sortOrder = 0) {
  return normalizeCatalogGift(
    { ...gift, source: gift?.source || 'tiktok-live-connector' },
    sortOrder,
    extractImageUrl,
  )
}

async function updateTikTokGiftCatalog({
  giftCatalog = null,
  lastError = '',
  sourceUsername = '',
} = {}) {
  const previousState = store.getState()
  const previousIntegration = previousState.integrations?.tiktok || {}
  const nextState = mergeStateWithDefaults({
    ...previousState,
    integrations: {
      ...previousState.integrations,
      tiktok: {
        ...previousIntegration,
        giftCatalog:
          giftCatalog === null ? previousIntegration.giftCatalog || [] : giftCatalog,
        giftCatalogSourceUsername:
          sourceUsername || previousIntegration.giftCatalogSourceUsername || '',
        giftCatalogSyncedAt: Date.now(),
        giftCatalogLastError: String(lastError || '').trim(),
      },
    },
  })
  const savedState = await store.setState(nextState)

  broadcast('app', { type: 'state', payload: savedState })
  broadcastStatus()

  return savedState.integrations.tiktok
}

async function updateTikTokEmoteCatalog({
  emoteCatalog = null,
  lastError = '',
  sourceUsername = '',
} = {}) {
  const previousState = store.getState()
  const previousIntegration = previousState.integrations?.tiktok || {}
  const nextState = mergeStateWithDefaults({
    ...previousState,
    integrations: {
      ...previousState.integrations,
      tiktok: {
        ...previousIntegration,
        emoteCatalog:
          emoteCatalog === null ? previousIntegration.emoteCatalog || [] : emoteCatalog,
        emoteCatalogSourceUsername:
          sourceUsername || previousIntegration.emoteCatalogSourceUsername || '',
        emoteCatalogSyncedAt: Date.now(),
        emoteCatalogLastError: String(lastError || '').trim(),
      },
    },
  })
  const savedState = await store.setState(nextState)

  broadcast('app', { type: 'state', payload: savedState })
  broadcastStatus()

  return savedState.integrations.tiktok
}

async function observeTikTokEmotes(emotes = [], sourceUsername = '') {
  const normalizedEmotes = emotes
    .map((emote, index) => normalizeEmoteCatalogEntry(emote, index))
    .filter(Boolean)

  if (!normalizedEmotes.length) {
    return null
  }

  const previousState = store.getState()
  const previousIntegration = previousState.integrations?.tiktok || {}
  const previousCatalog = Array.isArray(previousIntegration.emoteCatalog)
    ? previousIntegration.emoteCatalog
    : []
  const catalogById = new Map(previousCatalog.map((emote) => [String(emote.id), emote]))
  let didChange = false

  normalizedEmotes.forEach((emote, index) => {
    const previousEntry = catalogById.get(emote.id)
    const placeholderName = `Emote ${emote.id}`
    const nextName =
      emote.name && emote.name !== placeholderName
        ? emote.name
        : previousEntry?.name || emote.name || placeholderName
    const nextEntry = previousEntry
      ? {
          ...previousEntry,
          name: nextName,
          imageUrl: previousEntry.imageUrl || emote.imageUrl,
          category: emote.category || previousEntry.category || '',
          sortOrder: Number.isFinite(Number(previousEntry.sortOrder))
            ? previousEntry.sortOrder
            : previousCatalog.length + index,
        }
      : {
          ...emote,
          sortOrder: previousCatalog.length + index,
        }

    if (
      !previousEntry
      || previousEntry.name !== nextEntry.name
      || previousEntry.imageUrl !== nextEntry.imageUrl
      || previousEntry.category !== nextEntry.category
    ) {
      didChange = true
    }

    catalogById.set(emote.id, nextEntry)
  })

  if (!didChange && sourceUsername === previousIntegration.emoteCatalogSourceUsername) {
    return previousCatalog
  }

  const nextCatalog = Array.from(catalogById.values()).sort(
    (left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0),
  )

  await updateTikTokEmoteCatalog({
    emoteCatalog: nextCatalog,
    lastError: '',
    sourceUsername: sourceUsername || previousIntegration.emoteCatalogSourceUsername || '',
  })

  return nextCatalog
}

function collectObservedTikTokEmotes(events = []) {
  return events.flatMap((event) => {
    const eventEmotes = Array.isArray(event?.emotes) ? event.emotes : []
    const primaryEmote =
      event?.emoteId || event?.emoteName || event?.emoteImageUrl
        ? [
            {
              id: event.emoteId,
              name: event.emoteName,
              imageUrl: event.emoteImageUrl,
            },
          ]
        : []

    return [...eventEmotes, ...primaryEmote]
  })
}

async function syncTikTokEmoteCatalogFromObservedEvents(sourceUsername = '') {
  const cleanUsername =
    normalizeTikTokUsername(sourceUsername)
    || normalizeTikTokUsername(tikTokStatus.username)
    || normalizeTikTokUsername(store.getState().profile.tiktokUsername)

  const observedEmotes = collectObservedTikTokEmotes(recentEvents)
  const nextCatalog = await observeTikTokEmotes(observedEmotes, cleanUsername)
  const integration =
    nextCatalog === null
      ? await updateTikTokEmoteCatalog({
          emoteCatalog: null,
          lastError: '',
          sourceUsername: cleanUsername,
        })
      : store.getState().integrations?.tiktok || {}

  return {
    integration,
    observedCount: observedEmotes.length,
    catalogCount: Array.isArray(integration?.emoteCatalog) ? integration.emoteCatalog.length : 0,
    sourceUsername: cleanUsername || integration?.emoteCatalogSourceUsername || '',
  }
}

async function syncTikTokEmoteCatalog(sourceUsername = '', authConfig = {}) {
  const cleanUsername =
    normalizeTikTokUsername(sourceUsername)
    || normalizeTikTokUsername(tikTokStatus.username)
    || normalizeTikTokUsername(store.getState().profile.tiktokUsername)
  let authenticatedCount = 0
  let authenticatedError = ''

  try {
    const authenticatedCatalog = await fetchTikTokAuthenticatedEmoteCatalog(cleanUsername, authConfig)
    authenticatedCount = authenticatedCatalog.entries.length
    if (authenticatedCount > 0) {
      await observeTikTokEmotes(authenticatedCatalog.entries, cleanUsername)
    }
  } catch (error) {
    authenticatedError = error.message
  }

  const observedResult = await syncTikTokEmoteCatalogFromObservedEvents(cleanUsername)
  const integration = store.getState().integrations?.tiktok || {}

  if (authenticatedError && !authenticatedCount && !observedResult.catalogCount) {
    await updateTikTokEmoteCatalog({
      emoteCatalog: integration.emoteCatalog || [],
      lastError: authenticatedError,
      sourceUsername: cleanUsername,
    })
  }

  return {
    ...observedResult,
    authenticatedCount,
    authenticatedError,
    catalogCount: Array.isArray(integration?.emoteCatalog) ? integration.emoteCatalog.length : observedResult.catalogCount,
  }
}

async function upsertTikTokEmoteCatalogEntry(emoteEntry) {
  const previousState = store.getState()
  const previousIntegration = previousState.integrations?.tiktok || {}
  const previousCatalog = Array.isArray(previousIntegration.emoteCatalog)
    ? previousIntegration.emoteCatalog
    : []
  const existingEntry = previousCatalog.find(
    (catalogEntry) => String(catalogEntry.id) === String(emoteEntry?.id || '').trim(),
  )
  const normalizedEntry = normalizeEmoteCatalogEntry(
    {
      ...existingEntry,
      ...emoteEntry,
    },
    existingEntry?.sortOrder ?? previousCatalog.length,
  )

  if (!normalizedEntry) {
    throw new Error('Necesito al menos un id o alias para guardar el emote.')
  }

  const nextCatalog = existingEntry
    ? previousCatalog.map((catalogEntry) =>
        String(catalogEntry.id) === normalizedEntry.id
          ? {
              ...catalogEntry,
              ...normalizedEntry,
              sortOrder: Number.isFinite(Number(catalogEntry.sortOrder))
                ? Number(catalogEntry.sortOrder)
                : normalizedEntry.sortOrder,
            }
          : catalogEntry,
      )
    : [
        ...previousCatalog,
        {
          ...normalizedEntry,
          sortOrder: previousCatalog.length,
        },
      ]

  await updateTikTokEmoteCatalog({
    emoteCatalog: nextCatalog,
    lastError: '',
    sourceUsername: previousIntegration.emoteCatalogSourceUsername || '',
  })

  return store.getState().integrations.tiktok
}

async function removeTikTokEmoteCatalogEntry(emoteId) {
  const previousState = store.getState()
  const previousIntegration = previousState.integrations?.tiktok || {}
  const previousCatalog = Array.isArray(previousIntegration.emoteCatalog)
    ? previousIntegration.emoteCatalog
    : []
  const nextCatalog = previousCatalog.filter(
    (catalogEntry) => String(catalogEntry.id) !== String(emoteId || '').trim(),
  )

  if (nextCatalog.length === previousCatalog.length) {
    return previousIntegration
  }

  await updateTikTokEmoteCatalog({
    emoteCatalog: nextCatalog.map((catalogEntry, index) => ({
      ...catalogEntry,
      sortOrder: index,
    })),
    lastError: '',
    sourceUsername: previousIntegration.emoteCatalogSourceUsername || '',
  })

  return store.getState().integrations.tiktok
}

async function syncTikTokGiftCatalog(username, connection = null, authConfig = {}) {
  const cleanUsername = normalizeTikTokUsername(username)

  if (!cleanUsername) {
    throw new Error('Necesitas un username de TikTok para sincronizar gifts.')
  }

  let ownedConnection = null

  try {
    const connectionConfig = createTikTokConnectionOptions(
      authConfig,
      {
        fetchRoomInfoOnConnect: false,
      },
    )
    const activeConnection =
      connection ||
      new TikTokLiveConnection(cleanUsername, connectionConfig.options)

    if (!connection) {
      ownedConnection = activeConnection
    }

    const fetched = await fetchGiftCatalog({
      projectRoot,
      region: String(authConfig?.region || '').trim().toUpperCase(),
      roomId: tikTokStatus.roomId || '',
      connection: activeConnection,
      force: true,
      extractImageUrl,
    })

    const giftCatalog = fetched.gifts.filter((gift) => gift.id && gift.name)

    await updateTikTokGiftCatalog({
      giftCatalog,
      lastError: '',
      sourceUsername: cleanUsername,
    })

    return giftCatalog
  } catch (error) {
    await updateTikTokGiftCatalog({
      giftCatalog: null,
      lastError: error.message,
      sourceUsername: cleanUsername,
    })
    throw error
  } finally {
    if (ownedConnection) {
      try {
        await ownedConnection.disconnect()
      } catch {
        // noop
      }
    }
  }
}

function getDashboardAccessKey() {
  return String(store.getState().profile.dashboardKey || '').trim()
}

function getOverlayAccessKey() {
  return String(store.getState().profile.overlayKey || '').trim()
}

function getPublicProfile() {
  const mirroredPayload = getStoredOverlayMirrorPayload()

  if (mirroredPayload) {
    return mirroredPayload.profile
  }

  return buildPublicProfileFromSource(store.getState().profile)
}

function getPublicWidgets() {
  const mirroredPayload = getStoredOverlayMirrorPayload()

  if (mirroredPayload) {
    return mirroredPayload.widgets
  }

  return buildPublicWidgetsFromSource(store.getState().widgets || {})
}

function buildSmartBarStatus() {
  const mirroredPayload = getStoredOverlayMirrorPayload()

  if (mirroredPayload) {
    return {
      ...buildSmartBarStatusSnapshot(),
      ...(mirroredPayload.smartBar || {}),
    }
  }

  return buildSmartBarStatusSnapshot()
}

function getPublicOverlayPayload(widgetName = '') {
  const mirroredPayload = getStoredOverlayMirrorPayload()
  const leaderboards = buildLeaderboardsPayload()
  const widgets = mirroredPayload
    ? buildPublicWidgetsFromSource(mirroredPayload.widgets || {})
    : getPublicWidgets()
  const normalizedWidget = String(widgetName || '').trim()
  const widgetRuntime = normalizedWidget
    ? buildWidgetOverlayPayload({
        widgetName: normalizedWidget,
        widgets,
        leaderboards,
        smartBar: buildSmartBarStatus(),
      })
    : null

  if (mirroredPayload) {
    return {
      ...mirroredPayload,
      smartBar: buildSmartBarStatus(),
      leaderboards,
      ...(widgetRuntime || {}),
    }
  }

  return {
    profile: getPublicProfile(),
    widgets,
    smartBar: buildSmartBarStatus(),
    music: buildPublicMusicPayload(),
    leaderboards,
    ...(widgetRuntime || {}),
  }
}

function broadcastTikControlWidgetSync() {
  const state = store.getState()
  const widgets = buildPublicWidgetsFromSource(state.widgets || {})
  const leaderboards = buildLeaderboardsPayload(state)
  const syncedWidgets = [
    'top-likes',
    'top-donors',
    'top-gift',
    'top-comments',
    'top-combo',
    'top-points',
    'top-rotation',
    'chat',
    'gift-gallery',
    'gift-alert',
    'gift-cannon',
    'gift-battle',
    'gift-jar',
    'gift-jar-premium',
    'event-notification',
    'battle-pk',
    'battle-overlay',
    'battle-scoreboard',
    'battle-gifts',
    'battle-alerts',
    'winlife',
    'ranks',
    'roulette',
    'auction',
    'level-up',
    'like-fountain',
    'firework',
    'firework-v2',
    'firework-premium',
    'timer',
    'poll',
    'pinned-message',
    'social-media-rotator',
    'gaming-hud',
    'mvp',
  ]

  syncedWidgets.forEach((widgetName) => {
    const sessionData = widgetRuntime.getWidgetSessionData(widgetName)
    const ranksData =
      widgetName === 'ranks'
        ? { users: ranksWidgetService.getUsers(), config: ranksWidgetService.getConfig() }
        : {}
    const auctionData =
      widgetName === 'auction'
        ? { state: auctionRuntime.getState(), config: auctionRuntime.getConfig() }
        : {}

    const data = {
      ...buildWidgetDataForName(widgetName, leaderboards),
      ...sessionData,
      ...ranksData,
      ...auctionData,
    }

    const widgetConfig =
      widgetName === 'auction'
        ? auctionRuntime.getConfig()
        : buildWidgetConfigForName(widgetName, widgets)

    broadcast('overlay', {
      type: 'widget:config',
      widget: widgetName,
      config: widgetConfig,
      data,
    })
    broadcast('overlay', {
      type: 'widget:data',
      widget: widgetName,
      data,
    })
  })
}

function emitTikTokSocketEvents(events = []) {
  events.forEach((eventPayload) => {
    socketIo.emit('tiktok:event', eventPayload)
  })
}

function sanitizeMinecraftMirrorText(value, maxLength = 180) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function sanitizeMinecraftMirrorTarget(value) {
  const cleanedValue = String(value || '')
    .trim()
    .split(/\s+/)[0]

  return cleanedValue || '@a'
}

function buildMinecraftChatMirrorCommand(event, profile = {}) {
  const normalizedComment = sanitizeMinecraftMirrorText(event?.comment, 180)

  if (!normalizedComment) {
    return ''
  }

  if (profile.minecraftChatMirrorSkipCommands && /^[!/]/.test(normalizedComment)) {
    return ''
  }

  const normalizedPrefix = sanitizeMinecraftMirrorText(profile.minecraftChatMirrorPrefix || '[TikTok]', 32)
  const normalizedUserName = sanitizeMinecraftMirrorText(
    event?.uniqueId || event?.userName || event?.sourceLabel || 'chat',
    28,
  )
  const normalizedTarget = sanitizeMinecraftMirrorTarget(profile.minecraftChatMirrorTarget || '@a')
  const payload = JSON.stringify({
    text: '',
    extra: [
      ...(normalizedPrefix ? [{ text: `${normalizedPrefix} `, color: 'light_purple' }] : []),
      { text: normalizedUserName || 'chat', color: 'gold' },
      { text: ': ', color: 'gray' },
      { text: normalizedComment, color: 'white' },
    ],
  })

  if (profile.minecraftChatMirrorMode === 'actionbar') {
    return `/title ${normalizedTarget} actionbar ${payload}`
  }

  return `/tellraw ${normalizedTarget} ${payload}`
}

function readAccessKey(request, requestUrl = null) {
  const requestKey =
    requestUrl?.searchParams.get('key') ||
    request.query?.key ||
    request.headers['x-live-control-key'] ||
    ''

  if (Array.isArray(requestKey)) {
    return String(requestKey[0] || '').trim()
  }

  return String(requestKey || '').trim()
}

function isAccessGranted(expectedKey, providedKey) {
  if (!expectedKey) {
    return true
  }

  return expectedKey === providedKey
}

function hasValidOverlaySlug(slug) {
  return sanitizeSlug(slug) === sanitizeSlug(store.getState().profile.overlaySlug)
}

function requireDashboardAccess(request, response, next) {
  try {
    const requestPath = String(request.originalUrl || request.url || '')
    if (/\/api\/health(\/|$)/.test(requestPath)) {
      next()
      return
    }

    const providedKey = readAccessKey(request)
    const expectedKey = getDashboardAccessKey()
    
    console.log(`[backend:AUTH] 🔐 AUTH CHECK para ${request.method} ${request.url}`)
    console.log(`[backend:AUTH]   - Clave esperada: ${expectedKey ? '✓ sí está' : '✗ no hay'}`)
    console.log(`[backend:AUTH]   - Clave proporcionada: ${providedKey ? '✓ sí hay' : '✗ no hay'}`)

    if (isAccessGranted(expectedKey, providedKey)) {
      console.log(`[backend:AUTH]   - ✅ ACCESO CONCEDIDO`)
      next()
      return
    }

    console.log(`[backend:AUTH]   - ❌ ACCESO DENEGADO - Devolviendo 401`)
    response.status(401).json({
      error: 'La clave del panel es obligatoria para abrir el dashboard y sus APIs.',
    })
  } catch (error) {
    console.error(`[backend:AUTH] ⚠️ ERROR en auth middleware:`, error.message)
    console.error(error.stack)
    response.status(500).json({error: 'Error interno en validación de acceso'})
  }
}

function requireMirrorAccess(request, response, next) {
  const providedKey = readAccessKey(request)
  const dashboardKey = getDashboardAccessKey()
  const overlayKey = getOverlayAccessKey()
  const hasDashboardKey = Boolean(dashboardKey)
  const hasOverlayKey = Boolean(overlayKey)

  if (
    (!hasDashboardKey && !hasOverlayKey)
    || (hasDashboardKey && dashboardKey === providedKey)
    || (hasOverlayKey && overlayKey === providedKey)
  ) {
    next()
    return
  }

  response.status(401).json({
    error: 'Necesitas la clave del panel o la clave publica del overlay para sincronizar.',
  })
}

function resetMinecraftRconConnection(previousState, nextState) {
  if (
    previousState.profile.minecraftHost !== nextState.profile.minecraftHost ||
    previousState.profile.minecraftPort !== nextState.profile.minecraftPort ||
    previousState.profile.minecraftPassword !== nextState.profile.minecraftPassword
  ) {
    if (minecraftRcon) {
      try {
        minecraftRcon.end()
      } catch {
        // noop
      }

      minecraftRcon = null
      minecraftRconSignature = ''
      setMinecraftRconStatus({
        connected: false,
        lastError: '',
      })
    }
  }
}

function requireOverlayAccess(request, response, next) {
  if (!hasValidOverlaySlug(request.params.slug)) {
    response.status(404).json({
      error: 'No encontre ese overlay.',
    })
    return
  }

  const providedKey = readAccessKey(request)

  if (isAccessGranted(getOverlayAccessKey(), providedKey)) {
    next()
    return
  }

  response.status(401).json({
    error: 'Este overlay necesita la clave publica configurada en el panel.',
  })
}

function rejectSocketUpgrade(socket, statusCode, statusText, message) {
  const body = JSON.stringify({ error: message })

  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n' +
      '\r\n' +
      body,
  )
  socket.destroy()
}

function pushRecent(list, entry) {
  list.unshift(entry)

  if (list.length > recentLimit) {
    list.length = recentLimit
  }
}

function safeJsonSend(socket, payload) {
  if (socket.readyState !== 1) {
    return
  }

  socket.send(JSON.stringify(payload))
}

function broadcast(channel, payload) {
  socketHubs[channel].forEach((socket) => {
    safeJsonSend(socket, payload)
  })
}

function buildStatus() {
  const state = store.getState()
  const tikTokIntegration = state.integrations?.tiktok || {}

  return {
    product: PRODUCT_INFO,
    server: {
      port: serverPort,
      startedAt: serverStartedAt,
      stateFile: getStateFilePath(),
      hasStaticBuild: existsSync(distIndexFile),
    },
    profile: state.profile,
    tikTok: {
      ...tikTokStatus,
      authSessionEnabled: Boolean(state.profile?.tiktokSessionId && state.profile?.tiktokTargetIdc),
      authenticateWs: Boolean(state.profile?.tiktokAuthenticateWs),
      giftCatalogCount: Array.isArray(tikTokIntegration.giftCatalog)
        ? tikTokIntegration.giftCatalog.length
        : 0,
      giftCatalogSyncedAt: tikTokIntegration.giftCatalogSyncedAt || null,
      giftCatalogLastError: tikTokIntegration.giftCatalogLastError || '',
      giftCatalogSourceUsername: tikTokIntegration.giftCatalogSourceUsername || '',
      emoteCatalogCount: Array.isArray(tikTokIntegration.emoteCatalog)
        ? tikTokIntegration.emoteCatalog.length
        : 0,
      emoteCatalogSyncedAt: tikTokIntegration.emoteCatalogSyncedAt || null,
      emoteCatalogLastError: tikTokIntegration.emoteCatalogLastError || '',
      emoteCatalogSourceUsername: tikTokIntegration.emoteCatalogSourceUsername || '',
    },
    bridges: {
      dashboardClients: socketHubs.app.size,
      overlayClients: socketHubs.overlay.size,
      minecraftClients: socketHubs.minecraft.size,
      gtaClients: socketHubs.gta.size,
      minecraftRconConnected: minecraftRconStatus.connected,
      minecraftRconError: minecraftRconStatus.lastError,
    },
    mediaLibrary: {
      count: mediaLibraryCount,
    },
    overlayMirror: publicOverlayMirrorStatus,
    music: buildMusicStatus(state),
    smartBar: buildSmartBarStatus(),
    leaderboards: buildLeaderboardsPayload(state),
    account: {
      plan: 'premium_internal',
      tier: 'founder_local',
      label: 'TikControl Premium (local)',
      isPremium: true,
      limits: 'unlimited',
    },
    integrations: getPremiumIntegrationsSnapshot(),
    profiles: studioProfiles.listProfiles(),
    recentEvents,
    recentDispatches,
  }
}

function resetSpotifySession() {
  spotifySession = {
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
    scope: '',
    authState: '',
    connectedAt: null,
    accountId: '',
    accountLabel: '',
    accountProduct: '',
    devices: [],
    currentPlayback: null,
    lastSyncAt: null,
    lastError: '',
  }
}

async function removeMusicQueueRequestById(requestId) {
  const musicState = getMusicStateSnapshot()
  const queue = Array.isArray(musicState.queue) ? [...musicState.queue] : []
  const targetRequest = queue.find((entry) => entry.id === requestId)

  if (!targetRequest) {
    throw new Error('No encontre esa solicitud en la cola.')
  }

  if (targetRequest.status !== 'queued') {
    throw new Error('Solo puedo quitar canciones que todavia no fueron enviadas a Spotify.')
  }

  await persistMusicState({
    ...musicState,
    queue: queue.filter((entry) => entry.id !== requestId),
    history: trimMusicHistory([
      {
        ...targetRequest,
        status: 'removed',
        completedAt: Date.now(),
      },
      ...(musicState.history || []),
    ]),
  })

  return targetRequest
}

async function clearMusicQueue() {
  const musicState = getMusicStateSnapshot()
  const queue = Array.isArray(musicState.queue) ? [...musicState.queue] : []
  const removableEntries = queue.filter((entry) => entry.status === 'queued')

  if (!removableEntries.length) {
    return { removedCount: 0 }
  }

  await persistMusicState({
    ...musicState,
    queue: queue.filter((entry) => entry.status !== 'queued'),
    history: trimMusicHistory([
      ...removableEntries.map((entry) => ({
        ...entry,
        status: 'removed',
        completedAt: Date.now(),
        removedBy: 'panel',
      })),
      ...(musicState.history || []),
    ]),
  })

  return { removedCount: removableEntries.length }
}

async function clearMusicHistory() {
  const musicState = getMusicStateSnapshot()
  const history = Array.isArray(musicState.history) ? musicState.history : []

  if (!history.length) {
    return { removedCount: 0 }
  }

  await persistMusicState({
    ...musicState,
    history: [],
  })

  return { removedCount: history.length }
}

function broadcastStatus() {
  const statusPayload = buildStatus()
  broadcast('app', { type: 'status', payload: statusPayload })
  broadcast('overlay', {
    type: 'overlay-state',
    payload: getPublicOverlayPayload(),
  })
  broadcastTikControlWidgetSync()

  if (desktopModeEnabled) {
    void queuePublicOverlayMirrorState('status')
  }
}

function setTikTokStatus(patch) {
  tikTokStatus = {
    ...tikTokStatus,
    ...patch,
  }

  broadcastStatus()
}

function setMinecraftRconStatus(patch) {
  minecraftRconStatus = {
    ...minecraftRconStatus,
    ...patch,
  }

  broadcastStatus()
}

function normalizeUserName(data) {
  return (
    data?.user?.uniqueId ||
    data?.uniqueId ||
    data?.nickname ||
    data?.user?.nickname ||
    'unknown-user'
  )
}

function extractTikTokUserProfile(data) {
  const user = data?.user || data?.userInfo || data?.event?.user || {}

  return {
    uniqueId: normalizeUserName(data),
    nickname:
      String(user?.nickname || data?.nickname || user?.displayId || '').trim() ||
      normalizeUserName(data),
    avatarUrl:
      extractImageUrl(user?.profilePictureUrl) ||
      extractImageUrl(user?.avatarThumb) ||
      extractImageUrl(user?.avatarMedium) ||
      extractImageUrl(data?.profilePictureUrl) ||
      extractImageUrl(data?.avatarThumb) ||
      '',
  }
}

function buildLeaderboardsPayload(state = store.getState()) {
  const widgets = state.widgets || mergeStateWithDefaults().widgets

  return liveLeaderboards.getSnapshot({
    likesLimit: Number(widgets?.topLikes?.maxVisible || 5),
    giftsLimit: Number(widgets?.topGifts?.maxVisible || 5),
  })
}

function extractTikTokEmotes(data) {
  const rawEmotes = Array.isArray(data?.emotes)
    ? data.emotes
    : Array.isArray(data?.emoteList)
      ? data.emoteList
      : data?.emote || data?.emoteDetails || data?.image || data?.emoteImage
        ? [data]
        : []

  return rawEmotes
    .map((emote, index) =>
      normalizeEmoteCatalogEntry(emote?.emote || emote?.emoteDetails || emote, index),
    )
    .filter(Boolean)
}

function extractTikTokUserAccessFlags(data) {
  const userData = data?.user || data?.userInfo || data?.event?.user || null
  const subscribeInfo = userData?.subscribeInfo || data?.subscribeInfo
  const followInfo = userData?.followInfo || data?.followInfo
  const fansClubInfo = userData?.fansClubInfo || data?.fansClubInfo
  const fansLevel = Number(fansClubInfo?.fansLevel || 0)

  return {
    isFollower: Boolean(
      data?.isFollowerOfAnchor ||
        userData?.isFollowerOfAnchor ||
        followInfo?.isFollowing ||
        Number(followInfo?.followStatus || 0) > 0,
    ),
    isSubscriber: Boolean(
      data?.isSubscriberOfAnchor ||
        userData?.isSubscriberOfAnchor ||
        subscribeInfo?.isSubscribedToAnchor,
    ),
    isModerator: Boolean(data?.isModeratorOfAnchor || userData?.isModeratorOfAnchor),
    isSuperFan: Boolean(fansClubInfo && (fansLevel > 0 || fansClubInfo?.fansClubName)),
  }
}

function normalizeTikTokEvent(type, data) {
  const userProfile = extractTikTokUserProfile(data)
  const uniqueId = userProfile.uniqueId
  const normalizedEmotes = extractTikTokEmotes(data)
  const accessFlags = extractTikTokUserAccessFlags(data)
  const baseEvent = {
    id: createId('incoming'),
    type,
    uniqueId,
    nickname: userProfile.nickname,
    avatarUrl: userProfile.avatarUrl,
    sourceLabel: userProfile.nickname || uniqueId,
    createdAt: Date.now(),
    summary: '',
    matchText: '',
    comment: '',
    giftName: '',
    giftCoins: 0,
    emoteId: '',
    emoteName: '',
    emoteImageUrl: '',
    emotes: normalizedEmotes,
    repeatCount: 1,
    likeCount: 0,
    totalLikeCount: 0,
    shareTarget: '',
    displayText: '',
    isFollower: accessFlags.isFollower,
    isSubscriber: accessFlags.isSubscriber,
    isModerator: accessFlags.isModerator,
    isSuperFan: accessFlags.isSuperFan,
  }

  if (type === 'comment') {
    baseEvent.comment = data?.comment || ''
    baseEvent.summary = `${uniqueId}: ${baseEvent.comment}`
    baseEvent.matchText = baseEvent.comment
    if (normalizedEmotes.length) {
      baseEvent.displayText = normalizedEmotes.map((emote) => emote.name).join(', ')
    }
    return baseEvent
  }

  if (type === 'gift') {
    baseEvent.giftId = String(
      data?.giftId || data?.gift_id || data?.gift?.id || data?.gift?.giftId || '',
    ).trim()
    baseEvent.giftName =
      data?.giftName ||
      data?.gift?.name ||
      data?.extendedGiftInfo?.name ||
      data?.describe ||
      `Gift ${baseEvent.giftId || 'unknown'}`
    baseEvent.repeatCount = Number(data?.repeatCount || 1)
    baseEvent.giftCoins = Number(
      data?.diamondCount ||
        data?.diamond_count ||
        data?.gift?.diamond_count ||
        data?.gift?.diamondCount ||
        data?.extendedGiftInfo?.diamond_count ||
        data?.extendedGiftInfo?.diamondCount ||
        0,
    )
    baseEvent.giftImageUrl =
      extractImageUrl(data?.giftImage) ||
      extractImageUrl(data?.giftPicture) ||
      extractImageUrl(data?.gift?.image) ||
      extractImageUrl(data?.gift?.icon) ||
      extractImageUrl(data?.extendedGiftInfo?.image) ||
      ''

    const catalog = store.getState().integrations?.tiktok?.giftCatalog || []
    const enriched = enrichGiftEvent(baseEvent, catalog, extractImageUrl)
    baseEvent.giftId = enriched.giftId
    baseEvent.giftName = enriched.giftName
    baseEvent.giftCoins = enriched.giftCoins
    baseEvent.giftImageUrl = enriched.giftImageUrl
    baseEvent.summary = `${uniqueId} envio ${baseEvent.giftName} x${baseEvent.repeatCount}`
    baseEvent.matchText = `${baseEvent.giftName} x${baseEvent.repeatCount}`
    baseEvent.displayText = baseEvent.giftName
    return baseEvent
  }

  if (type === 'emote') {
    const primaryEmote =
      normalizedEmotes[0] || normalizeEmoteCatalogEntry(data, 0) || { id: 'unknown-emote', name: 'Emote' }
    baseEvent.emoteId = primaryEmote.id
    baseEvent.emoteName = primaryEmote.name
    baseEvent.emoteImageUrl = primaryEmote.imageUrl || ''
    baseEvent.summary = `${uniqueId} envio ${baseEvent.emoteName}`
    baseEvent.matchText = baseEvent.emoteName
    baseEvent.displayText = baseEvent.emoteName
    baseEvent.emotes = [primaryEmote]
    return baseEvent
  }

  if (type === 'follow') {
    baseEvent.summary = `${uniqueId} empezo a seguir`
    baseEvent.matchText = uniqueId
    return baseEvent
  }

  if (type === 'share') {
    baseEvent.shareTarget = data?.shareTarget || ''
    baseEvent.summary = `${uniqueId} compartio el live`
    baseEvent.matchText = uniqueId
    return baseEvent
  }

  baseEvent.likeCount = Number(data?.likeCount || data?.count || 0)
  baseEvent.totalLikeCount = Number(data?.totalLikeCount || 0)
  baseEvent.summary = `${uniqueId} mando ${baseEvent.likeCount} likes`
  baseEvent.matchText = String(baseEvent.likeCount)
  return baseEvent
}

function findActionById(actionId) {
  return store.getState().actions.find((action) => action.id === actionId) || null
}

function buildBridgePayload(output, action, sourceEvent) {
  const actionType = resolveActionType(action)

  return {
    id: createId(`${output}-bridge`),
    output,
    actionId: action.id,
    actionName: action.name,
    actionType,
    commandText: getActionCommandSummary(action),
    rawCommandText: action.commandText,
    gtaMode: action.gtaMode || 'generic',
    gtaChaosEffectId: action.gtaChaosEffectId || '',
    gtaChaosEffectName: action.gtaChaosEffectName || '',
    gtaWebhookCommand: action.gtaWebhookCommand || '',
    gtaWebhookPayload: action.gtaWebhookPayload || '',
    message: action.overlayText || action.description || action.name,
    mediaUrl: action.mediaUrl,
    sourceEvent,
    createdAt: Date.now(),
  }
}

async function ensureMinecraftRcon(profile) {
  if (!profile.minecraftHost || !profile.minecraftPassword) {
    throw new Error('RCON no configurado')
  }

  const signature = `${profile.minecraftHost}:${profile.minecraftPort}:${profile.minecraftPassword}`

  if (minecraftRcon && minecraftRconSignature === signature && minecraftRconStatus.connected) {
    return minecraftRcon
  }

  if (minecraftRcon) {
    try {
      minecraftRcon.end()
    } catch {
      // noop
    }
  }

  minecraftRcon = await Rcon.connect({
    host: profile.minecraftHost,
    port: Number(profile.minecraftPort || 25575),
    password: profile.minecraftPassword,
  })
  minecraftRconSignature = signature

  minecraftRcon.on('end', () => {
    setMinecraftRconStatus({ connected: false })
  })
  minecraftRcon.on('error', (error) => {
    setMinecraftRconStatus({
      connected: false,
      lastError: error.message,
    })
  })

  setMinecraftRconStatus({
    connected: true,
    lastError: '',
  })

  return minecraftRcon
}

async function dispatchAction(action, sourceEvent, reason = 'manual') {
  const state = store.getState()
  const overlayEvent = buildOverlayEvent(action, state.profile, sourceEvent)
  const bridgeResults = {}

  rememberLatestOverlayEvent(overlayEvent)

  if (action.outputs.includes('tts') && overlayEvent.ttsText) {
    const ttsConfig = state.tts || {}
    void synthesizeActionTts(overlayEvent.ttsText, ttsConfig).then((ttsResult) => {
      if (!ttsResult?.text) {
        return
      }

      const playback = {
        text: ttsResult.text,
        audioUrl: ttsResult.audioUrl || '',
        mimeType: ttsResult.mimeType || '',
        method: ttsResult.method || ttsResult.mode || 'client',
        actionId: action.id,
        actionName: action.name,
        overlayEventId: overlayEvent.id,
        createdAt: Date.now(),
      }

      if (ttsResult.audioUrl) {
        overlayEvent.ttsAudioUrl = ttsResult.audioUrl
        rememberLatestOverlayEvent(overlayEvent)
        broadcast('overlay', { type: 'overlay-event', payload: { ...overlayEvent } })
        broadcast('app', { type: 'overlay-event', payload: { ...overlayEvent } })
      }

      emitActionTtsPlayback(broadcast, playback)
    })
  }

  broadcast('overlay', { type: 'overlay-event', payload: overlayEvent })
  broadcast('app', { type: 'overlay-event', payload: overlayEvent })

  if (desktopModeEnabled) {
    void sendPublicOverlayMirrorEvent(overlayEvent).catch((error) => {
      updatePublicOverlayMirrorStatus({
        configured: Boolean(resolvePublicOverlayMirrorTarget()),
        lastError: error.message,
      })
    })
  }

  if (action.outputs.includes('minecraft')) {
    const minecraftPayload = buildBridgePayload('minecraft', action, sourceEvent)
    broadcast('minecraft', { type: 'minecraft-command', payload: minecraftPayload })

    bridgeResults.minecraft = {
      deliveredToClients: socketHubs.minecraft.size,
      viaRcon: false,
    }

    if (action.commandText) {
      try {
        const rcon = await ensureMinecraftRcon(state.profile)
        const response = await rcon.send(normalizeMinecraftCommand(action.commandText))

        bridgeResults.minecraft = {
          deliveredToClients: socketHubs.minecraft.size,
          viaRcon: true,
          response,
        }

        setMinecraftRconStatus({
          connected: true,
          lastError: '',
          lastCommandAt: Date.now(),
        })
      } catch (error) {
        bridgeResults.minecraft = {
          deliveredToClients: socketHubs.minecraft.size,
          viaRcon: false,
          error: error.message,
        }

        setMinecraftRconStatus({
          connected: false,
          lastError: error.message,
          lastCommandAt: Date.now(),
        })
      }
    }
  }

  if (action.outputs.includes('gta')) {
    const gtaPayload = buildBridgePayload('gta', action, sourceEvent)
    // Siempre mandamos al bridge local via WebSocket — este es el canal real
    // El bridge es quien puede hablar con ChaosMod en localhost
    
    const gtaBridgeCount = socketHubs.gta.size
    console.log(`\n[backend] 📊 Estado GTA actual: ${gtaBridgeCount} bridge(s) conectado(s)`)
    console.log(`[backend] 📤 Enviando evento GTA...`)
    console.log(`[backend]   - Acción: ${gtaPayload.actionName}`)
    console.log(`[backend]   - Tipo: ${gtaPayload.actionType || 'sin tipo'}`)
    console.log(`[backend]   - Effect ID: ${gtaPayload.gtaChaosEffectId}`)
    console.log(`[backend]   - Webhook Command: ${gtaPayload.gtaWebhookCommand || 'n/a'}`)
    console.log(`[backend]   - Mode: ${gtaPayload.gtaMode}`)
    
    broadcast('gta', { type: 'gta-event', payload: gtaPayload })
    
    const hasGtaBridgeClients = gtaBridgeCount > 0
    bridgeResults.gta = {
      deliveredToClients: gtaBridgeCount,
      triggeredDirectly: false,
      hasGtaBridgeClients,
    }

    if (!hasGtaBridgeClients) {
      console.log(`[backend] ⚠️  ADVERTENCIA: No hay bridge GTA conectado`)
      console.log(`[backend]   → El evento se emitió pero nadie lo recibió`)
      console.log(`[backend]   → Inicia el bridge con: node bridge/index.js`)
      bridgeResults.gta.warning = 'El bridge local no esta conectado. Asegurate de correr: node bridge/index.js'
    } else {
      console.log(`[backend] ✅ Evento enviado a ${gtaBridgeCount} bridge(s) GTA`)
    }
  }

  if (action.outputs.includes('game')) {
    const gameId = String(action.gamingGameId || '').trim()
    const commandText = String(action.commandText || action.gamingCommandId || '').trim()
    const gameAction = { ...action, commandText }

    try {
      const udpResult = await sendGameBridgeCommand({
        gameId,
        commandText,
        port: action.gamingPort,
        protocol: action.gamingProtocol,
      })
      bridgeResults.gameUdp = udpResult
    } catch (error) {
      bridgeResults.gameUdp = { ok: false, error: error.message }
    }

    if (gameId.startsWith('gtav') || gameId.includes('gta')) {
      const gtaPayload = buildBridgePayload('gta', gameAction, sourceEvent)
      broadcast('gta', { type: 'gta-event', payload: gtaPayload })
      bridgeResults.game = {
        channel: 'gta',
        gameId,
        commandText,
        deliveredToClients: socketHubs.gta.size,
      }
    } else if (commandText) {
      const minecraftPayload = buildBridgePayload('minecraft', gameAction, sourceEvent)
      broadcast('minecraft', { type: 'minecraft-command', payload: minecraftPayload })
      bridgeResults.game = {
        channel: 'minecraft',
        gameId,
        commandText,
        deliveredToClients: socketHubs.minecraft.size,
      }
    } else {
      bridgeResults.game = { gameId, warning: 'Sin comando para ejecutar' }
    }
  }

  if (action.outputs.includes('webhook') && action.webhookUrl) {
    try {
      const response = await fetch(String(action.webhookUrl).trim(), {
        method: String(action.webhookMethod || 'POST').toUpperCase(),
        headers: { 'Content-Type': 'application/json' },
        body: action.webhookBody ? String(action.webhookBody) : JSON.stringify({
          action: action.name,
          gameId: action.gamingGameId,
          command: action.commandText,
          event: sourceEvent,
        }),
      })
      bridgeResults.webhook = { ok: response.ok, status: response.status }
    } catch (error) {
      bridgeResults.webhook = { ok: false, error: error.message }
    }
  }

  if (action.outputs.includes('delay')) {
    const delayMs = Math.max(0, Number(action.delaySeconds || 0)) * 1000
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    bridgeResults.delay = { seconds: action.delaySeconds || 0 }
  }

  await executePremiumOutputs(action, bridgeResults, { store })

  const dispatchRecord = {
    id: createId('dispatch'),
    actionId: action.id,
    actionName: action.name,
    outputs: [...action.outputs],
    reason,
    sourceEvent,
    bridgeResults,
    createdAt: Date.now(),
  }

  pushRecent(recentDispatches, dispatchRecord)
  broadcast('app', { type: 'dispatch', payload: dispatchRecord })
  broadcastStatus()

  return dispatchRecord
}

async function dispatchMinecraftBridgeCommand({
  name = 'Prueba Minecraft',
  commandText = '',
  sourceEvent = null,
  reason = 'manual-minecraft',
  minecraftMode = 'generic',
  minecraftBedrockPresetId = '',
  minecraftBedrockPresetName = '',
  description = '',
}) {
  const trimmedCommandText = String(commandText || '').trim()

  if (!trimmedCommandText) {
    throw new Error('Necesito un comando de Minecraft para disparar la prueba.')
  }

  const bridgeAction = {
    id: createId('minecraft-quick'),
    name: String(name || 'Prueba Minecraft').trim(),
    description: String(description || '').trim(),
    outputs: ['minecraft'],
    commandText: trimmedCommandText,
    minecraftMode: minecraftMode || 'generic',
    minecraftBedrockPresetId: String(minecraftBedrockPresetId || '').trim(),
    minecraftBedrockPresetName: String(minecraftBedrockPresetName || '').trim(),
    gtaMode: 'generic',
    gtaChaosEffectId: '',
    gtaChaosEffectName: '',
    overlayText: '',
    mediaUrl: '',
  }

  const minecraftPayload = buildBridgePayload('minecraft', bridgeAction, sourceEvent)
  broadcast('minecraft', { type: 'minecraft-command', payload: minecraftPayload })

  const dispatchRecord = {
    id: createId('dispatch'),
    actionId: bridgeAction.id,
    actionName: bridgeAction.name,
    outputs: ['minecraft'],
    reason,
    sourceEvent,
    bridgeResults: {
      minecraft: {
        deliveredToClients: socketHubs.minecraft.size,
        viaRcon: false,
        bridgeOnly: true,
        commandText: normalizeMinecraftCommand(trimmedCommandText),
      },
    },
    createdAt: Date.now(),
  }

  pushRecent(recentDispatches, dispatchRecord)
  broadcast('app', { type: 'dispatch', payload: dispatchRecord })
  broadcastStatus()

  return dispatchRecord
}

async function dispatchMinecraftChatMirrorEvent(
  event,
  state,
  reason = 'minecraft-chat-mirror',
  { allowWhenDisabled = false } = {},
) {
  if (event?.type !== 'comment') {
    return null
  }

  const profile = state?.profile || {}

  if (!allowWhenDisabled && !profile.minecraftChatMirrorEnabled) {
    return null
  }

  const commandText = buildMinecraftChatMirrorCommand(event, profile)

  if (!commandText) {
    return null
  }

  return dispatchMinecraftBridgeCommand({
    name: 'Chat espejo Minecraft',
    description: `Replica el chat de ${event.uniqueId || 'TikTok'} dentro del juego.`,
    commandText,
    sourceEvent: event,
    reason,
    minecraftMode: 'generic',
  })
}

async function processIncomingEvent(event, reason = 'tiktok') {
  const observedEmotes = [
    ...(Array.isArray(event.emotes) ? event.emotes : []),
    ...(event.emoteId || event.emoteName || event.emoteImageUrl
      ? [
          {
            id: event.emoteId,
            name: event.emoteName,
            imageUrl: event.emoteImageUrl,
          },
        ]
      : []),
  ].filter((emote) => emote?.id)

  if (observedEmotes.length) {
    await observeTikTokEmotes(observedEmotes, tikTokStatus.username || store.getState().profile.tiktokUsername || '')
  }

  pushRecent(recentEvents, event)
  setTikTokStatus({ lastEventAt: event.createdAt })
  broadcast('app', { type: 'incoming-event', payload: event })
  const state = store.getState()
  const giftCatalog = state.integrations?.tiktok?.giftCatalog || []
  const socketEvents = widgetRuntime.recordIncomingEvent(event)
  emitTikTokSocketEvents(socketEvents)
  mapIncomingEventToTikControlMessages(event, {
    giftCatalog,
    extractImageUrl,
  }).forEach((message) => {
    broadcast('overlay', message)
  })

  if (event.type === 'follow') {
    smartBarRuntime = {
      ...smartBarRuntime,
      followCount: smartBarRuntime.followCount + 1,
    }
  }

  if (event.type === 'gift') {
    const repeatCount = Number(event.repeatCount || 1)
    const fallbackGiftCoins =
      state.integrations?.tiktok?.giftCatalog?.find((gift) => gift.name === event.giftName)?.coins || 0
    const giftCoins = Number(event.giftCoins || fallbackGiftCoins || 0)

    smartBarRuntime = {
      ...smartBarRuntime,
      giftsReceived: smartBarRuntime.giftsReceived + repeatCount,
      receivedCoins: smartBarRuntime.receivedCoins + giftCoins * repeatCount,
    }

    liveLeaderboards.recordGift(event, {
      giftCoins,
      repeatCount,
    })
    ranksWidgetService.onIncomingGiftEvent(event)
    auctionRuntime?.recordGift?.(event)
  }

  if (event.type === 'like-burst') {
    liveLeaderboards.recordLike(event)
  }

  let handledMusicCommand = false

  if (event.type === 'comment') {
    try {
      await dispatchMinecraftChatMirrorEvent(event, state, `${reason}:mirror`)
    } catch (error) {
      console.warn(`[minecraft-chat-mirror] ${error.message}`)
    }

    try {
      handledMusicCommand = await handleMusicCommentCommand(event, state)
    } catch (error) {
      console.warn(`[music] ${error.message}`)
    }
  }

  const matchedTriggers = handledMusicCommand
    ? []
    : state.triggers.filter((trigger) => matchesTrigger(trigger, event))

  for (const trigger of matchedTriggers) {
    const cooldownMs = Number(trigger.cooldownSeconds || 0) * 1000
    const lastExecution = cooldownTracker.get(trigger.id) || 0

    if (cooldownMs > 0 && Date.now() - lastExecution < cooldownMs) {
      continue
    }

    cooldownTracker.set(trigger.id, Date.now())

    const action = state.actions.find((candidate) => candidate.id === trigger.actionId)

    if (action) {
      await dispatchAction(action, event, `${reason}:${trigger.id}`)
    }
  }

  broadcastStatus()
}

function bindTikTokEvents(connection) {
  connection.on(ControlEvent.DISCONNECTED, () => {
    if (tikTokConnection !== connection) {
      return
    }

    setTikTokStatus({
      connected: false,
      connecting: false,
      roomId: '',
    })
  })

  connection.on(ControlEvent.ERROR, (error) => {
    if (tikTokConnection !== connection) {
      return
    }

    setTikTokStatus({
      connected: false,
      connecting: false,
      lastError: error.message,
    })
  })

  connection.on(ControlEvent.STREAM_END, () => {
    if (tikTokConnection !== connection) {
      return
    }

    setTikTokStatus({
      connected: false,
      connecting: false,
      lastError: 'El live termino.',
    })
  })

  connection.on(WebcastEvent.CHAT, async (data) => {
    if (tikTokConnection !== connection) {
      return
    }

    await processIncomingEvent(normalizeTikTokEvent('comment', data))
  })

  connection.on(WebcastEvent.EMOTE, async (data) => {
    if (tikTokConnection !== connection) {
      return
    }

    await processIncomingEvent(normalizeTikTokEvent('emote', data))
  })

  connection.on(WebcastEvent.GIFT, async (data) => {
    if (tikTokConnection !== connection) {
      return
    }

    if (Number(data?.giftType) === 1 && !data?.repeatEnd) {
      return
    }

    await processIncomingEvent(normalizeTikTokEvent('gift', data))
  })

  connection.on(WebcastEvent.FOLLOW, async (data) => {
    if (tikTokConnection !== connection) {
      return
    }

    await processIncomingEvent(normalizeTikTokEvent('follow', data))
  })

  connection.on(WebcastEvent.SHARE, async (data) => {
    if (tikTokConnection !== connection) {
      return
    }

    await processIncomingEvent(normalizeTikTokEvent('share', data))
  })

  connection.on(WebcastEvent.LIKE, async (data) => {
    if (tikTokConnection !== connection) {
      return
    }

    await processIncomingEvent(normalizeTikTokEvent('like-burst', data))
  })

  const battleEventTypes = [
    WebcastEvent.LINK_MIC_BATTLE,
    WebcastEvent.LINK_MIC_ARMIES,
    WebcastEvent.LINK_MIC_BATTLE_TASK,
    WebcastEvent.LINK_MIC_BATTLE_PUNISH_FINISH,
    WebcastEvent.LINK_MIC_FAN_TICKET_METHOD,
    WebcastEvent.LINK_MIC_METHOD,
  ]

  battleEventTypes.forEach((eventName) => {
    connection.on(eventName, (data) => {
      if (tikTokConnection !== connection) {
        return
      }

      processBattleTikTokRawEvent(eventName, data)
    })
  })
}

function processBattleTikTokRawEvent(eventType, data = {}) {
  emitBattleSocketEvent(socketIo, eventType, data)
  broadcast('overlay', {
    type: 'tiktok:raw',
    eventType,
    data,
  })
}

async function disconnectTikTok() {
  const currentConnection = tikTokConnection
  tikTokConnection = null

  if (currentConnection) {
    try {
      await currentConnection.disconnect()
    } catch (error) {
      console.error('No se pudo cerrar la conexion de TikTok:', error)
    }
  }

  setTikTokStatus({
    connected: false,
    connecting: false,
    roomId: '',
  })

  smartBarRuntime = {
    ...smartBarRuntime,
    lastSessionDurationMs: smartBarRuntime.sessionStartedAt
      ? Date.now() - smartBarRuntime.sessionStartedAt
      : smartBarRuntime.lastSessionDurationMs,
  }

  liveLeaderboards.reset()
  widgetRuntime.resetSession()
  broadcastStatus()
}

async function connectTikTok(config = {}) {
  const requestedUsername = typeof config === 'string' ? config : config?.username
  const cleanUsername = normalizeTikTokUsername(requestedUsername)

  if (!cleanUsername) {
    throw new Error('Necesitas un username de TikTok para conectar.')
  }

  await disconnectTikTok()

  const authConfig = resolveTikTokAuthConfig(typeof config === 'string' ? {} : config)
  await store.updateProfile({
    tiktokUsername: cleanUsername,
    tiktokSessionId: authConfig.sessionId,
    tiktokTargetIdc: authConfig.ttTargetIdc,
    tiktokAuthenticateWs: authConfig.authenticateWs,
  })

  setTikTokStatus({
    connected: false,
    connecting: true,
    username: cleanUsername,
    roomId: '',
    lastError: '',
  })

  const connectionOptions = createTikTokConnectionOptions(typeof config === 'string' ? {} : config, {
    fetchRoomInfoOnConnect: true,
  })
  const connection = new TikTokLiveConnection(cleanUsername, connectionOptions.options)

  bindTikTokEvents(connection)

  try {
    const connectState = await connection.connect()
    tikTokConnection = connection
    smartBarRuntime = {
      sessionStartedAt: Date.now(),
      lastSessionDurationMs: 0,
      followCount: 0,
      receivedCoins: 0,
      giftsReceived: 0,
    }
    liveLeaderboards.reset()
    widgetRuntime.resetSession()

    setTikTokStatus({
      connected: true,
      connecting: false,
      username: cleanUsername,
      roomId: connectState.roomId || '',
      lastError: '',
      lastConnectedAt: Date.now(),
    })

    broadcast('app', {
      type: 'system-message',
      payload: {
        id: createId('system'),
        level: 'info',
        text: `Conectado a TikTok LIVE como ${cleanUsername}.`,
        createdAt: Date.now(),
      },
    })

    try {
      const syncedGifts = await syncTikTokGiftCatalog(cleanUsername, connection)

      broadcast('app', {
        type: 'system-message',
        payload: {
          id: createId('system'),
          level: 'info',
          text: `Catalogo de gifts sincronizado: ${syncedGifts.length} regalos.`,
          createdAt: Date.now(),
        },
      })
    } catch (giftError) {
      broadcast('app', {
        type: 'system-message',
        payload: {
          id: createId('system'),
          level: 'warn',
          text: `El live conecto, pero no pude sincronizar gifts: ${giftError.message}`,
          createdAt: Date.now(),
        },
      })
    }

    return {
      state: store.getState(),
      status: buildStatus(),
    }
  } catch (error) {
    tikTokConnection = null
    setTikTokStatus({
      connected: false,
      connecting: false,
      username: cleanUsername,
      lastError: error.message,
    })
    throw error
  }
}

app.get('/api/overlay/:slug', requireOverlayAccess, (_request, response) => {
  response.json(getPublicOverlayPayload())
})

app.get('/api/overlay/:slug/latest-event', requireOverlayAccess, (request, response) => {
  const afterCreatedAt = Number(request.query?.after || 0)
  const normalizedAfterCreatedAt = Number.isFinite(afterCreatedAt) ? afterCreatedAt : 0

  if (!latestOverlayEvent || Number(latestOverlayEvent.createdAt || 0) <= normalizedAfterCreatedAt) {
    response.json({
      event: null,
      cursor: normalizedAfterCreatedAt,
    })
    return
  }

  response.json({
    event: latestOverlayEvent,
    cursor: Number(latestOverlayEvent.createdAt || Date.now()),
  })
})

app.get('/overlay/:slug', requireOverlayAccess, (request, response, next) => {
  if (request.query.view !== 'widget') {
    next()
    return
  }

  response.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate')
  response.setHeader('Pragma', 'no-cache')
  response.setHeader('Expires', '0')
  response.type('html').send(renderStandaloneOverlayHtml(request.params.slug))
})

app.post('/api/mirror/overlay/state', requireMirrorAccess, async (request, response) => {
  const previousState = store.getState()
  const incomingPayload = request.body?.payload || request.body || {}

  if (!incomingPayload || typeof incomingPayload !== 'object') {
    response.status(400).json({
      error: 'Necesito un payload valido para reflejar el overlay publico.',
    })
    return
  }

  const nextMirror = {
    sourceBaseUrl:
      normalizeBaseUrl(request.body?.sourceBaseUrl || '')
      || normalizeBaseUrl(previousState.integrations?.overlayMirror?.sourceBaseUrl || ''),
    syncedAt: Date.now(),
    profile: buildPublicProfileFromSource(incomingPayload.profile || previousState.profile),
    widgets: buildPublicWidgetsFromSource(incomingPayload.widgets || previousState.widgets || {}),
    smartBar: {
      ...buildSmartBarStatusSnapshot(),
      ...(incomingPayload.smartBar || {}),
    },
    music: {
      ...mergeStateWithDefaults({
        music: incomingPayload.music || previousState.music || {},
      }).music,
      ...(incomingPayload.music || {}),
    },
  }

  const nextState = mergeStateWithDefaults({
    ...previousState,
    integrations: {
      ...previousState.integrations,
      overlayMirror: nextMirror,
    },
  })
  const savedState = await store.setState(nextState)

  broadcast('app', { type: 'state', payload: savedState })
  broadcast('overlay', { type: 'overlay-state', payload: getPublicOverlayPayload() })

  response.json({
    ok: true,
    syncedAt: nextMirror.syncedAt,
  })
})

app.post('/api/mirror/overlay/event', requireMirrorAccess, (request, response) => {
  const incomingEvent = rememberLatestOverlayEvent(request.body?.event || request.body || {})

  broadcast('overlay', { type: 'overlay-event', payload: incomingEvent })
  broadcast('app', { type: 'overlay-event', payload: incomingEvent })

  response.json({
    ok: true,
    eventId: incomingEvent.id,
  })
})

app.put(
  '/api/mirror/media/:fileName',
  requireMirrorAccess,
  express.raw({ type: () => true, limit: '250mb' }),
  async (request, response) => {
    const rawFileName = path.basename(decodeURIComponent(request.params.fileName || ''))

    if (!rawFileName) {
      response.status(400).json({
        error: 'Necesito un nombre de archivo para subir el media al overlay publico.',
      })
      return
    }

    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      response.status(400).json({
        error: 'El archivo remoto llego vacio.',
      })
      return
    }

    await ensureMediaDirectory()
    const targetFilePath = path.join(getMediaDirectory(), rawFileName)
    await fs.writeFile(targetFilePath, request.body)

    if (detectMediaKindFromFileName(rawFileName) === 'video') {
      try {
        await normalizeVideoFileForWeb(targetFilePath)
      } catch (error) {
        response.status(400).json({
          error: `No pude convertir ese video para el overlay publico: ${error.message}`,
        })
        return
      }
    }

    mediaLibraryCount = (await listMediaItems()).length
    broadcastStatus()

    response.json({
      ok: true,
      fileName: rawFileName,
      url: `/media/${encodeURIComponent(rawFileName)}`,
    })
  },
)

function renderSpotifyDesktopCallbackPage({ success, message }) {
  const accentColor = success ? '#7ee6be' : '#ff7a7a'
  const title = success ? 'Spotify ya quedo conectado.' : 'No pudimos conectar Spotify.'

  return `<!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Live Control Beta</title>
        <style>
          :root {
            color-scheme: dark;
            font-family: "Segoe UI", system-ui, sans-serif;
          }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background:
              radial-gradient(circle at top, rgba(18, 152, 116, 0.16), transparent 32%),
              linear-gradient(145deg, #071018 0%, #0b151d 50%, #04080d 100%);
            color: #f7f8fa;
          }
          main {
            width: min(560px, calc(100vw - 48px));
            padding: 32px;
            border-radius: 28px;
            background: rgba(8, 16, 24, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
          }
          .eyebrow {
            margin: 0 0 12px;
            font-size: 12px;
            letter-spacing: 0.24em;
            text-transform: uppercase;
            color: ${accentColor};
          }
          h1 {
            margin: 0 0 16px;
            font-size: clamp(28px, 4vw, 40px);
            line-height: 1.08;
          }
          p {
            margin: 0;
            line-height: 1.65;
            color: rgba(247, 248, 250, 0.8);
          }
        </style>
      </head>
      <body>
        <main>
          <p class="eyebrow">Live Control Beta</p>
          <h1>${title}</h1>
          <p>${message}</p>
        </main>
      </body>
    </html>`
}

async function renderDistIndexHtml() {
  const rawHtml = await fs.readFile(distIndexFile, 'utf8')

  return rawHtml
    .replace(/(\/assets\/[^"'?]+\.(?:js|css))(["'])/g, `$1?v=${staticAssetVersion}$2`)
    .replace(/(\/favicon\.svg)(["'])/g, `$1?v=${staticAssetVersion}$2`)
}

function renderStandaloneOverlayHtml(slug) {
  const serializedSlug = JSON.stringify(String(slug || 'main-stage'))

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Live Control Overlay</title>
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }

      body {
        font-family: "Space Grotesk", sans-serif;
        color: #fff;
      }

      #overlay-root {
        width: 100vw;
        height: 100vh;
        position: relative;
        overflow: hidden;
        background: transparent;
      }

      .overlay-card {
        position: absolute;
        left: 50%;
        bottom: 36px;
        transform: translateX(-50%);
        width: min(740px, calc(100vw - 48px));
        padding: 28px;
        border-radius: 30px;
        border: 1px solid rgba(255,255,255,0.12);
        background:
          linear-gradient(135deg, rgba(255, 112, 46, 0.28), rgba(11, 18, 24, 0.94) 55%),
          rgba(8, 12, 16, 0.88);
        box-shadow: 0 30px 80px rgba(0,0,0,0.36);
        backdrop-filter: blur(16px);
      }

      .overlay-card-head {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 12px;
      }

      .overlay-label {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: #dce8ea;
      }

      .overlay-card h1 {
        margin: 0 0 10px;
        font-size: clamp(2rem, 4vw, 3rem);
        line-height: 0.95;
        letter-spacing: -0.06em;
      }

      .overlay-card p {
        margin: 0;
        font-size: 1rem;
        color: #e8eef0;
      }

      .overlay-media-card {
        width: min(100%, 360px);
        margin-top: 18px;
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,0.16);
        display: block;
      }

      .overlay-media-clean {
        width: 100vw;
        height: 100vh;
        display: block;
        object-fit: contain;
        background: transparent;
      }
    </style>
  </head>
  <body>
    <div id="overlay-root"></div>
    <script>
      const overlaySlug = ${serializedSlug};
      const overlayRoot = document.getElementById('overlay-root');
      const query = new URLSearchParams(window.location.search);
      const overlayKey = query.get('key') || '';
      let latestCursor = Date.now();
      let latestEventId = '';
      let hideTimeoutId = null;

      function detectMediaKind(mediaUrl) {
        const value = String(mediaUrl || '').toLowerCase();
        if (/\\.(mp4|webm|ogg)(\\?|#|$)/.test(value)) return 'video';
        if (/\\.(gif|png|jpg|jpeg|webp|svg)(\\?|#|$)/.test(value)) return 'image';
        return 'none';
      }

      function buildApiPath(pathname, params = {}) {
        const search = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            search.set(key, String(value));
          }
        });
        const suffix = search.toString();
        return suffix ? pathname + '?' + suffix : pathname;
      }

      function clearOverlay() {
        window.clearTimeout(hideTimeoutId);
        hideTimeoutId = null;
        overlayRoot.innerHTML = '';
      }

      function scheduleHide(eventPayload, mediaKind) {
        window.clearTimeout(hideTimeoutId);
        const baseDuration = Math.max(0, Number(eventPayload?.durationMs || 0)) || 5000;
        const duration = mediaKind === 'video'
          ? Math.max(baseDuration, 12000)
          : mediaKind === 'image'
            ? Math.max(baseDuration, 6500)
            : baseDuration;
        hideTimeoutId = window.setTimeout(clearOverlay, duration);
      }

      function renderCleanImage(eventPayload) {
        const image = document.createElement('img');
        image.className = 'overlay-media-clean';
        image.alt = eventPayload.title || 'overlay media';
        image.src = eventPayload.mediaUrl;
        overlayRoot.innerHTML = '';
        overlayRoot.appendChild(image);
        scheduleHide(eventPayload, 'image');
      }

      function renderCleanVideo(eventPayload) {
        const video = document.createElement('video');
        video.className = 'overlay-media-clean';
        video.src = eventPayload.mediaUrl;
        video.autoplay = true;
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        overlayRoot.innerHTML = '';
        overlayRoot.appendChild(video);

        const beginPlayback = () => {
          try {
            video.currentTime = 0;
          } catch {}
          video.play().catch(() => {});
        };

        video.addEventListener('loadeddata', beginPlayback, { once: true });
        video.addEventListener('canplay', beginPlayback, { once: true });
        beginPlayback();
        scheduleHide(eventPayload, 'video');
      }

      function renderAlert(eventPayload, mediaKind) {
        const card = document.createElement('article');
        card.className = 'overlay-card';
        card.innerHTML = \`
          <div class="overlay-card-head">
            <span class="overlay-label">\${eventPayload.sourceLabel || ''}</span>
            <span class="overlay-label">Live Control Studio</span>
          </div>
          <h1>\${eventPayload.title || ''}</h1>
          <p>\${eventPayload.message || ''}</p>
        \`;

        if (mediaKind === 'image') {
          const image = document.createElement('img');
          image.className = 'overlay-media-card';
          image.alt = eventPayload.title || 'overlay media';
          image.src = eventPayload.mediaUrl;
          card.appendChild(image);
        } else if (mediaKind === 'video') {
          const video = document.createElement('video');
          video.className = 'overlay-media-card';
          video.src = eventPayload.mediaUrl;
          video.autoplay = true;
          video.muted = true;
          video.defaultMuted = true;
          video.loop = true;
          video.playsInline = true;
          video.preload = 'auto';
          card.appendChild(video);
          video.play().catch(() => {});
        }

        overlayRoot.innerHTML = '';
        overlayRoot.appendChild(card);
        scheduleHide(eventPayload, mediaKind);
      }

      function renderEvent(eventPayload) {
        if (!eventPayload?.id || eventPayload.id === latestEventId) {
          return;
        }

        latestEventId = eventPayload.id;
        latestCursor = Math.max(latestCursor, Number(eventPayload.createdAt || Date.now()));

        const outputs = Array.isArray(eventPayload.outputs) ? eventPayload.outputs : [];
        const mediaKind = detectMediaKind(eventPayload.mediaUrl);
        const shouldRenderCleanMedia =
          ['image', 'video'].includes(mediaKind)
          && outputs.includes('overlayMedia')
          && !outputs.includes('overlayAlert');

        if (shouldRenderCleanMedia) {
          if (mediaKind === 'image') {
            renderCleanImage(eventPayload);
            return;
          }

          if (mediaKind === 'video') {
            renderCleanVideo(eventPayload);
            return;
          }
        }

        renderAlert(eventPayload, mediaKind);
      }

      async function pollLatestEvent() {
        const requestPath = buildApiPath('/api/overlay/' + encodeURIComponent(overlaySlug) + '/latest-event', {
          after: latestCursor,
          key: overlayKey,
        });

        try {
          const response = await fetch(requestPath, { cache: 'no-store' });
          if (!response.ok) throw new Error('poll failed');

          const payload = await response.json();

          if (Number.isFinite(Number(payload?.cursor || 0)) && Number(payload.cursor) > 0) {
            latestCursor = Math.max(latestCursor, Number(payload.cursor));
          }

          if (payload?.event) {
            renderEvent(payload.event);
          }
        } catch {
          // noop
        } finally {
          window.setTimeout(pollLatestEvent, 800);
        }
      }

      pollLatestEvent();
    </script>
  </body>
</html>`
}

app.get('/api/music/spotify/callback', async (request, response) => {
  const desktopDashboardUrl = normalizeBaseUrl(runtimeProcess.env.LIVE_CONTROL_DASHBOARD_URL || '')
  const isDesktopMode = String(runtimeProcess.env.LIVE_CONTROL_DESKTOP_MODE || '').trim() === '1'
  const redirectBaseUrl =
    desktopDashboardUrl ||
    normalizeBaseUrl(store.getState().profile.publicBaseUrl) ||
    resolveBaseUrlFromRequest(request) ||
    'http://127.0.0.1:5123'

  try {
    const spotifyConfig = getSpotifyAppConfig(runtimeProcess.env)
    const redirectUri = getSpotifyRedirectUri(request)
    const returnedCode = String(request.query?.code || '').trim()
    const returnedState = String(request.query?.state || '').trim()
    const returnedError = String(request.query?.error || '').trim()

    if (returnedError) {
      throw new Error(`Spotify rechazo la autorizacion: ${returnedError}`)
    }

    if (!spotifyConfig.clientId || !spotifyConfig.clientSecret || !redirectUri) {
      throw new Error('Falta configurar Spotify en el backend antes de autorizar la cuenta.')
    }

    if (!returnedCode || !returnedState || returnedState !== spotifySession.authState) {
      throw new Error('La respuesta de Spotify no coincide con el estado esperado.')
    }

    const tokenPayload = await exchangeSpotifyCode({
      clientId: spotifyConfig.clientId,
      clientSecret: spotifyConfig.clientSecret,
      code: returnedCode,
      redirectUri,
    })

    spotifySession = {
      ...spotifySession,
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token || spotifySession.refreshToken,
      expiresAt: Date.now() + Number(tokenPayload.expires_in || 3600) * 1000,
      scope: tokenPayload.scope || '',
      authState: '',
      connectedAt: Date.now(),
      lastError: '',
    }
    await persistSpotifySession()

    await syncSpotifyPlaybackState({ queueNextIfNeeded: false })
    broadcastSystemMessage('info', 'Spotify quedo conectado y listo para Song Request.')
    broadcastStatus()
    if (isDesktopMode) {
      response
        .status(200)
        .type('html')
        .send(
          renderSpotifyDesktopCallbackPage({
            success: true,
            message:
              'Puedes volver a la app de escritorio. La sesion ya quedo lista para Song Request.',
          }),
        )
      return
    }

    response.redirect(`${redirectBaseUrl}/?spotify=connected#music`)
  } catch (error) {
    spotifySession = {
      ...spotifySession,
      authState: '',
      lastError: error.message,
    }
    await persistSpotifySession()
    if (isDesktopMode) {
      response
        .status(400)
        .type('html')
        .send(
          renderSpotifyDesktopCallbackPage({
            success: false,
            message: error.message,
          }),
        )
      return
    }

    response.redirect(`${redirectBaseUrl}/?spotify=error#music`)
  }
})

app.use('/api', requireDashboardAccess)

// Log todas las requests a /api para debug
app.use('/api', (request, response, next) => {
  console.log(`\n[backend] 📨 ${request.method} ${request.url}`)
  console.log(`[backend] Headers: ${JSON.stringify({
    'x-live-control-key': request.headers['x-live-control-key'] || 'NO PRESENTE',
    'content-type': request.headers['content-type'] || 'NO PRESENTE',
  })}`)
  if (request.body) {
    console.log(`[backend] Body: ${JSON.stringify(request.body).slice(0, 100)}`)
  }
  next()
})

app.get('/api/state', (_request, response) => {
  response.json(store.getState())
})

app.put('/api/state', async (request, response) => {
  const previousState = store.getState()
  const nextState = mergeStateWithDefaults({
    ...request.body,
    integrations: previousState.integrations,
  })
  nextState.profile.overlaySlug = sanitizeSlug(nextState.profile.overlaySlug)
  nextState.profile.publicBaseUrl = normalizeBaseUrl(nextState.profile.publicBaseUrl)
  nextState.profile.dashboardKey = String(nextState.profile.dashboardKey || '').trim()
  nextState.profile.overlayKey = String(nextState.profile.overlayKey || '').trim()
  const savedState = await store.setState(nextState)

  resetMinecraftRconConnection(previousState, savedState)

  broadcast('app', { type: 'state', payload: savedState })
  broadcast('overlay', { type: 'overlay-state', payload: getPublicOverlayPayload() })
  broadcastStatus()

  response.json(savedState)
})

app.post('/api/state/import', async (request, response) => {
  const previousState = store.getState()
  const importedPayload = request.body?.state || request.body || {}
  const importedState = mergeStateWithDefaults(importedPayload)
  const nextState = mergeStateWithDefaults({
    ...importedState,
    profile: {
      ...importedState.profile,
      tiktokSessionId: String(importedState.profile?.tiktokSessionId || previousState.profile.tiktokSessionId || '').trim(),
      tiktokTargetIdc: String(importedState.profile?.tiktokTargetIdc || previousState.profile.tiktokTargetIdc || '').trim(),
    },
    integrations: {
      ...previousState.integrations,
      ...(importedState.integrations || {}),
      spotify: {
        ...previousState.integrations.spotify,
        ...(importedState.integrations?.spotify || {}),
        accessToken:
          importedState.integrations?.spotify?.accessToken
          || previousState.integrations.spotify.accessToken
          || '',
        refreshToken:
          importedState.integrations?.spotify?.refreshToken
          || previousState.integrations.spotify.refreshToken
          || '',
        expiresAt: Number(
          importedState.integrations?.spotify?.expiresAt
          || previousState.integrations.spotify.expiresAt
          || 0,
        ),
        authState:
          importedState.integrations?.spotify?.authState
          || previousState.integrations.spotify.authState
          || '',
      },
    },
  })

  nextState.profile.overlaySlug = sanitizeSlug(nextState.profile.overlaySlug)
  nextState.profile.publicBaseUrl = normalizeBaseUrl(nextState.profile.publicBaseUrl)
  nextState.profile.dashboardKey = String(nextState.profile.dashboardKey || '').trim()
  nextState.profile.overlayKey = String(nextState.profile.overlayKey || '').trim()

  const savedState = await store.setState(nextState)
  resetMinecraftRconConnection(previousState, savedState)

  broadcast('app', { type: 'state', payload: savedState })
  broadcast('overlay', { type: 'overlay-state', payload: getPublicOverlayPayload() })
  broadcastStatus()

  response.json(savedState)
})

app.put('/api/integrations/chaosmod/catalog', async (request, response) => {
  const nextCatalog = Array.isArray(request.body?.catalog) ? request.body.catalog : []
  const nextSourcePath = String(request.body?.sourcePath || '').trim()
  const nextLastError = String(request.body?.lastError || '').trim()
  const nextState = mergeStateWithDefaults({
    ...store.getState(),
    integrations: {
      ...store.getState().integrations,
      chaosmod: {
        ...store.getState().integrations?.chaosmod,
        catalog: nextCatalog,
        sourcePath: nextSourcePath,
        syncedAt: Date.now(),
        lastError: nextLastError,
      },
    },
  })
  const savedState = await store.setState(nextState)

  broadcast('app', { type: 'state', payload: savedState })
  broadcastStatus()

  response.json(savedState.integrations.chaosmod)
})

app.get('/api/status', (_request, response) => {
  response.json(buildStatus())
})

app.post('/api/desktop/tiktok/session', requireDesktopBridgeAccess, async (request, response) => {
  try {
    const authConfig = resolveTikTokAuthConfig(request.body || {})

    if (!authConfig.hasAuthenticatedSession) {
      throw new Error('La sesion de TikTok necesita sessionid y tt-target-idc para quedar guardada.')
    }

    await store.updateProfile({
      tiktokSessionId: authConfig.sessionId,
      tiktokTargetIdc: authConfig.ttTargetIdc,
      tiktokAuthenticateWs: authConfig.authenticateWs,
    })

    response.json({
      ok: true,
      status: buildStatus(),
    })
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/music/spotify/connect', async (request, response) => {
  const spotifyConfig = getSpotifyAppConfig(runtimeProcess.env)
  const redirectUri = getSpotifyRedirectUri(request)

  if (!spotifyConfig.clientId || !spotifyConfig.clientSecret) {
    response.status(400).json({
      error: 'Faltan SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en el backend.',
    })
    return
  }

  if (!redirectUri) {
    response.status(400).json({
      error:
        'No pude resolver la URL de callback de Spotify. Configura SPOTIFY_REDIRECT_URI o una URL publica base.',
    })
    return
  }

  spotifySession = {
    ...spotifySession,
    authState: randomBytes(16).toString('hex'),
    lastError: '',
  }
  await persistSpotifySession()

  response.json({
    authorizationUrl: buildSpotifyAuthorizeUrl({
      clientId: spotifyConfig.clientId,
      redirectUri,
      state: spotifySession.authState,
    }),
    redirectUri,
  })
})

app.post('/api/music/spotify/disconnect', async (_request, response) => {
  resetSpotifySession()
  await spotifySessionStore.clear()
  broadcastSystemMessage('info', 'Spotify se desconecto del modulo de musica.')
  broadcastStatus()
  response.json(buildMusicStatus())
})

// Save Spotify Client ID + Secret directly into desktop.env (desktop app only)
app.post('/api/music/spotify/credentials', async (request, response) => {
  try {
    const { clientId, clientSecret } = request.body || {}

    if (!clientId?.trim() || !clientSecret?.trim()) {
      response.status(400).json({ error: 'Ingresa el Client ID y el Client Secret.' })
      return
    }

    const isDesktopMode = String(runtimeProcess.env.LIVE_CONTROL_DESKTOP_MODE || '').trim() === '1'
    const userDataDir = String(runtimeProcess.env.LIVE_CONTROL_USER_DATA || '').trim()

    if (!isDesktopMode || !userDataDir) {
      response.status(400).json({ error: 'Esta función solo está disponible en la app de escritorio instalada.' })
      return
    }

    const envPath = path.join(userDataDir, 'desktop.env')

    let lines = []
    if (existsSync(envPath)) {
      try {
        const content = await fs.readFile(envPath, 'utf8')
        lines = content.split(/\r?\n/)
      } catch {
        lines = []
      }
    }

    // Remove previous SPOTIFY_CLIENT_* lines so we don't leave old values
    lines = lines.filter((line) => {
      const upper = line.trim().toUpperCase()
      return !upper.startsWith('SPOTIFY_CLIENT_ID=') && !upper.startsWith('SPOTIFY_CLIENT_SECRET=')
    })

    lines.push(`SPOTIFY_CLIENT_ID=${clientId.trim()}`)
    lines.push(`SPOTIFY_CLIENT_SECRET=${clientSecret.trim()}`)

    // Ensure redirect URI is present (the desktop app normally writes it on boot)
    const hasRedirect = lines.some((l) => l.trim().toUpperCase().startsWith('SPOTIFY_REDIRECT_URI='))
    if (!hasRedirect) {
      const redirectUri = getSpotifyRedirectUri(request)
      if (redirectUri) {
        lines.push(`SPOTIFY_REDIRECT_URI=${redirectUri}`)
      }
    }

    const newContent = lines.filter((l) => l !== undefined && l !== null).join('\n').trim() + '\n'

    await fs.writeFile(envPath, newContent, 'utf8')

    response.json({
      success: true,
      message: 'Credenciales guardadas en desktop.env.',
      envPath,
    })
  } catch (error) {
    response.status(500).json({
      error: error?.message || 'No pude guardar las credenciales de Spotify.',
    })
  }
})

app.post('/api/leaderboards/reset', async (_request, response) => {
  liveLeaderboards.reset()
  widgetRuntime.resetSession()
  broadcastSystemMessage('info', 'Rankings de likes y gifts reiniciados para este live.')
  broadcastStatus()
  response.json(buildLeaderboardsPayload())
})

app.post('/api/leaderboards/demo', async (request, response) => {
  const mode = String(request.body?.mode || 'both').toLowerCase()

  if (mode === 'likes' || mode === 'both') {
    const likeSamples = [
      { userName: 'luna_vip', nickname: 'Luna VIP', likeCount: 4200 },
      { userName: 'carlos_live', nickname: 'Carlos Live', likeCount: 3100 },
      { userName: 'ana_streams', nickname: 'Ana Streams', likeCount: 2400 },
      { userName: 'tikfan99', nickname: 'TikFan 99', likeCount: 1650 },
      { userName: 'viewer_pro', nickname: 'Viewer Pro', likeCount: 980 },
      { userName: 'heart_squad', nickname: 'Heart Squad', likeCount: 640 },
    ]

    for (const sample of likeSamples) {
      liveLeaderboards.recordLike({
        uniqueId: sample.userName,
        nickname: sample.nickname,
        likeCount: sample.likeCount,
      })
    }
  }

  if (mode === 'gifts' || mode === 'both') {
    const giftSamples = [
      { userName: 'mega_donor', nickname: 'Mega Donor', giftName: 'Universe', giftCoins: 4499, repeatCount: 2 },
      { userName: 'rose_king', nickname: 'Rose King', giftName: 'Rose', giftCoins: 1, repeatCount: 900 },
      { userName: 'galaxy_fan', nickname: 'Galaxy Fan', giftName: 'Galaxy', giftCoins: 1000, repeatCount: 1 },
      { userName: 'lion_queen', nickname: 'Lion Queen', giftName: 'Lion', giftCoins: 299, repeatCount: 3 },
      { userName: 'coin_boss', nickname: 'Coin Boss', giftName: 'Confetti', giftCoins: 100, repeatCount: 5 },
    ]

    for (const sample of giftSamples) {
      liveLeaderboards.recordGift(
        {
          uniqueId: sample.userName,
          nickname: sample.nickname,
          giftName: sample.giftName,
        },
        {
          giftCoins: sample.giftCoins,
          repeatCount: sample.repeatCount,
        },
      )
    }
  }

  if (mode === 'likes' || mode === 'both') {
    broadcast('overlay', {
      type: 'widget:test',
      data: {
        widget: 'top-likes',
        type: 'TOP_LIKES_TEST',
      },
    })
  }

  broadcastSystemMessage('info', 'Datos de prueba cargados en Top Likes / Top Gifts.')
  broadcastStatus()
  response.json(buildLeaderboardsPayload())
})

app.post('/api/music/spotify/sync', async (_request, response) => {
  try {
    const musicStatus = await syncSpotifyPlaybackState({ queueNextIfNeeded: true })
    response.json(musicStatus)
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/music/test-play', async (request, response) => {
  try {
    const musicState = getMusicStateSnapshot()
    await handleMusicPlayRequest(
      request.body?.userName || 'demo-chat',
      request.body?.query || '',
      musicState,
      'manual',
    )
    response.json(buildMusicStatus())
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/music/skip', async (request, response) => {
  try {
    await handleMusicSkipRequest(request.body?.userName || 'panel', getMusicStateSnapshot())
    response.json(buildMusicStatus())
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.delete('/api/music/requests/:requestId', async (request, response) => {
  try {
    const removedRequest = await removeMusicQueueRequestById(request.params.requestId)
    response.json(removedRequest)
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/music/queue/clear', async (_request, response) => {
  try {
    const result = await clearMusicQueue()
    response.json({
      ...result,
      status: buildMusicStatus(),
    })
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/music/history/clear', async (_request, response) => {
  try {
    const result = await clearMusicHistory()
    response.json({
      ...result,
      status: buildMusicStatus(),
    })
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/tiktok/connect', async (request, response) => {
  try {
    const result = await connectTikTok(request.body || {})
    response.json(result.status)
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/tiktok/disconnect', async (_request, response) => {
  await disconnectTikTok()
  response.json(buildStatus())
})

app.post('/api/tiktok/gifts/sync', async (request, response) => {
  try {
    const requestedUsername =
      request.body?.username || store.getState().profile.tiktokUsername || tikTokStatus.username
    const cleanUsername = normalizeTikTokUsername(requestedUsername)
    const canReuseConnection =
      tikTokConnection && normalizeTikTokUsername(tikTokStatus.username) === cleanUsername
    const giftCatalog = await syncTikTokGiftCatalog(
      cleanUsername,
      canReuseConnection ? tikTokConnection : null,
      request.body || {},
    )

    response.json({
      count: giftCatalog.length,
      sourceUsername: cleanUsername,
      syncedAt: Date.now(),
    })
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/tiktok/emotes/sync', async (request, response) => {
  try {
    const requestedUsername =
      request.body?.username || store.getState().profile.tiktokUsername || tikTokStatus.username
    const syncResult = await syncTikTokEmoteCatalog(requestedUsername, {
      sessionId: request.body?.sessionId,
      ttTargetIdc: request.body?.ttTargetIdc,
    })
    const message =
      syncResult.authenticatedCount > 0
        ? `Sincronicé ${syncResult.authenticatedCount} stickers autenticados y además revisé ${syncResult.observedCount} emotes observados.`
        : syncResult.observedCount > 0
          ? `Revisé ${syncResult.observedCount} emotes vistos en el live y dejé el catálogo al día.`
          : syncResult.authenticatedError
            ? `No pude sacar stickers autenticados: ${syncResult.authenticatedError}`
            : 'No encontré stickers ni emotes nuevos para agregar al catálogo.'

    broadcastSystemMessage(
      syncResult.authenticatedCount > 0 || syncResult.observedCount > 0 ? 'info' : 'warn',
      message,
    )

    response.json({
      count: syncResult.catalogCount,
      observedCount: syncResult.observedCount,
      authenticatedCount: syncResult.authenticatedCount,
      sourceUsername: syncResult.sourceUsername,
      syncedAt: Date.now(),
      message,
    })
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/integrations/tiktok/emotes', async (request, response) => {
  try {
    const integration = await upsertTikTokEmoteCatalogEntry(request.body || {})
    response.status(201).json(integration)
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.delete('/api/integrations/tiktok/emotes/:emoteId', async (request, response) => {
  try {
    const integration = await removeTikTokEmoteCatalogEntry(request.params.emoteId)
    response.json(integration)
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post('/api/actions/:actionId/test', async (request, response) => {
  try {
    console.log(`\n${'▓'.repeat(80)}`)
    console.log(`[backend] 🎯 POST /api/actions/:actionId/test INGRESÓ AL ENDPOINT`)
    console.log(`[backend] Action ID buscado: ${request.params.actionId}`)
    
    const action = findActionById(request.params.actionId)

    if (!action) {
      const allActions = store.getState().actions || []
      console.log(`[backend] ❌ Acción NO encontrada con ID: ${request.params.actionId}`)
      console.log(`[backend] ℹ️  Acciones disponibles en BD:`)
      if (allActions.length === 0) {
        console.log(`[backend]    - (ninguna, la lista está vacía)`)
      } else {
        allActions.forEach((a, i) => {
          console.log(`[backend]    ${i+1}. ID: ${a.id} | Name: ${a.name}`)
        })
      }
      response.status(404).json({ error: 'No encontre esa accion.' })
      return
    }

    console.log(`${'▓'.repeat(80)}`)
    console.log(`[backend] 🎯 ETAPA 2: POST /api/actions/${action.id}/test`)
    console.log(`[backend] Acción: ${action.name}`)
    console.log(`[backend] Outputs: ${JSON.stringify(action.outputs)}`)
    console.log(`[backend] GTA Mode: ${action.gtaMode}`)
    console.log(`[backend] GTA Type: ${resolveActionType(action) || 'sin tipo'}`)
    console.log(`[backend] GTA Effect ID: ${action.gtaChaosEffectId}`)
    console.log(`[backend] GTA Webhook Command: ${action.gtaWebhookCommand || 'n/a'}`)
    console.log(`[backend] Usuario: ${request.body?.userName || 'manual-test'}`)
    console.log(`${'▓'.repeat(80)}\n`)

    const manualEvent = createManualIncomingEvent('comment', {
    userName: request.body?.userName || 'manual-test',
    comment: request.body?.comment || `Test manual para ${action.name}`,
  })

  const dispatchRecord = await dispatchAction(action, manualEvent, 'manual-test')
  
  console.log(`\n${'─'.repeat(80)}`)
  console.log(`[backend] 📤 Dispatch completado para acción: ${action.name}`)
  console.log(`[backend] Bridge clients (GTA): ${dispatchRecord.bridgeResults.gta?.deliveredToClients || 0}`)
  console.log(`[backend] Triggered Directly: ${dispatchRecord.bridgeResults.gta?.triggeredDirectly}`)
  if (dispatchRecord.bridgeResults.gta?.warning) {
    console.log(`[backend] ⚠️  WARNING: ${dispatchRecord.bridgeResults.gta.warning}`)
  }
  console.log(`${'─'.repeat(80)}\n`)
  
    response.json(dispatchRecord)
  } catch (error) {
    console.error(`[backend] ⚠️ ERROR en POST /api/actions/:actionId/test:`, error.message)
    console.error(error.stack)
    response.status(500).json({error: 'Error al procesar la acción de prueba'})
  }
})

app.post('/api/events/test', async (request, response) => {
  const eventType = request.body?.type || 'comment'
  const manualEvent = createManualIncomingEvent(eventType, request.body)
  await processIncomingEvent(manualEvent, 'manual-event')
  response.json(manualEvent)
})

app.post('/api/minecraft/test', async (request, response) => {
  const manualEvent = createManualIncomingEvent('comment', {
    userName: request.body?.userName || 'manual-minecraft',
    comment: request.body?.comment || request.body?.commandText || 'Prueba manual de Minecraft',
  })

  const dispatchRecord = await dispatchMinecraftBridgeCommand({
    name: request.body?.name || 'Prueba Minecraft',
    commandText: request.body?.commandText || '',
    description: request.body?.description || '',
    minecraftMode: request.body?.minecraftMode || 'generic',
    minecraftBedrockPresetId: request.body?.minecraftBedrockPresetId || '',
    minecraftBedrockPresetName: request.body?.minecraftBedrockPresetName || '',
    sourceEvent: manualEvent,
    reason: 'manual-minecraft',
  })

  response.json(dispatchRecord)
})

app.post('/api/gaming/quick-test', async (request, response) => {
  const gameId = String(request.body?.gameId || '').trim()
  const commandText = String(request.body?.commandText || '').trim()
  const gtaChaosEffectId = String(request.body?.gtaChaosEffectId || '').trim()
  const gtaChaosEffectName = String(request.body?.gtaChaosEffectName || '').trim()
  const commandName = String(request.body?.name || 'Prueba gaming').trim()
  const manualEvent = createManualIncomingEvent('comment', {
    userName: request.body?.userName || 'manual-gaming',
    comment: request.body?.comment || commandName,
  })

  const isGta =
    gameId === 'gtav-chaos' ||
    gameId === 'gta' ||
    Boolean(gtaChaosEffectId) ||
    (!commandText && gameId.startsWith('gta'))

  if (isGta) {
    const bridgeAction = {
      id: createId('gta-quick'),
      name: commandName,
      description: '',
      outputs: ['gta'],
      commandText: commandText || gtaChaosEffectId || 'chaos_random',
      gtaMode: gtaChaosEffectId ? 'chaos' : request.body?.gtaMode || 'generic',
      gtaChaosEffectId,
      gtaChaosEffectName,
      gtaWebhookCommand: request.body?.gtaWebhookCommand || '',
      gtaWebhookPayload: request.body?.gtaWebhookPayload || '',
      overlayText: '',
      mediaUrl: '',
    }

    const dispatchRecord = await dispatchAction(bridgeAction, manualEvent, 'manual-gaming')
    response.json(dispatchRecord)
    return
  }

  const isMinecraft =
    gameId === 'minecraft' ||
    gameId.startsWith('tikcontrol-') ||
    gameId.includes('minecraft') ||
    request.body?.minecraftMode

  if (isMinecraft) {
    if (!commandText) {
      response.status(400).json({ error: 'Falta commandText para probar Minecraft.' })
      return
    }

    const dispatchRecord = await dispatchMinecraftBridgeCommand({
      name: commandName,
      commandText,
      description: request.body?.description || '',
      minecraftMode: request.body?.minecraftMode || 'generic',
      minecraftBedrockPresetId: request.body?.minecraftBedrockPresetId || '',
      minecraftBedrockPresetName: request.body?.minecraftBedrockPresetName || '',
      sourceEvent: manualEvent,
      reason: 'manual-gaming',
    })

    response.json(dispatchRecord)
    return
  }

  if (!commandText) {
    response.status(400).json({ error: 'Falta commandText para probar este juego.' })
    return
  }

  try {
    const udpResult = await sendGameBridgeCommand({ gameId, commandText })
    response.json({
      ok: true,
      gameId,
      commandText,
      bridgeResults: { gameUdp: udpResult },
      sourceEvent: manualEvent,
    })
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message })
  }
})

app.post('/api/minecraft/chat-mirror/test', async (request, response) => {
  const manualEvent = createManualIncomingEvent('comment', {
    userName: request.body?.userName || 'demo-chat',
    comment: request.body?.comment || 'Hola Minecraft, este mensaje salio desde el panel.',
  })
  const dispatchRecord = await dispatchMinecraftChatMirrorEvent(
    manualEvent,
    store.getState(),
    'manual-minecraft-chat-mirror',
    { allowWhenDisabled: true },
  )

  if (!dispatchRecord) {
    response.status(400).json({
      error:
        'No pude construir el chat espejo. Revisa el prefijo, el target y que el mensaje no sea un comando filtrado.',
    })
    return
  }

  response.json(dispatchRecord)
})

app.get('/api/media', async (_request, response) => {
  const mediaItems = await listMediaItems()
  mediaLibraryCount = mediaItems.length
  response.json(mediaItems)
})

app.post('/api/media', mediaUpload.single('file'), async (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: 'No llego ningun archivo.' })
    return
  }

  if (detectMediaKindFromFileName(request.file.filename) === 'video') {
    try {
      await normalizeVideoFileForWeb(request.file.path)
    } catch (error) {
      response.status(400).json({
        error: `No pude preparar ese video para el overlay: ${error.message}`,
      })
      return
    }
  }

  const mediaItems = await listMediaItems()
  mediaLibraryCount = mediaItems.length
  broadcastStatus()
  response.status(201).json(mediaItems.find((item) => item.fileName === request.file.filename))
})

app.delete('/api/media/:fileName', async (request, response) => {
  try {
    await removeMediaItem(request.params.fileName)
    const mediaItems = await listMediaItems()
    mediaLibraryCount = mediaItems.length
    broadcastStatus()
    response.json({ ok: true })
  } catch (error) {
    response.status(404).json({ error: error.message })
  }
})

webSocketServers.app.on('connection', (socket) => {
  socketHubs.app.add(socket)
  safeJsonSend(socket, { type: 'state', payload: store.getState() })
  safeJsonSend(socket, { type: 'status', payload: buildStatus() })

  socket.on('close', () => {
    socketHubs.app.delete(socket)
    broadcastStatus()
  })

  broadcastStatus()
})

webSocketServers.overlay.on('connection', (socket, request) => {
  socketHubs.overlay.add(socket)

  let widgetName = ''

  try {
    const requestUrl = new URL(request?.url || '', `http://${request?.headers?.host || 'localhost'}`)
    widgetName = String(requestUrl.searchParams.get('widget') || '').trim()
  } catch {
    widgetName = ''
  }

  safeJsonSend(socket, {
    type: 'overlay-state',
    payload: getPublicOverlayPayload(widgetName),
  })

  if (widgetName) {
    const runtime = getPublicOverlayPayload(widgetName)
    safeJsonSend(socket, {
      type: 'widget:config',
      widget: widgetName,
      config: runtime.widgetConfig || buildWidgetConfigForName(widgetName, runtime.widgets || {}),
      data: runtime.widgetData || buildWidgetDataForName(widgetName, runtime.leaderboards || {}),
    })
  }

  socket.on('message', (rawMessage) => {
    try {
      const payload = JSON.parse(String(rawMessage || ''))
      if (payload?.type === 'ping') {
        safeJsonSend(socket, { type: 'pong', at: Date.now() })
        return
      }

      if (payload?.type === 'widget:saveData') {
        const saveWidget = String(payload.widget || widgetName || '').trim()
        if (saveWidget && widgetRuntime?.saveWidgetPersistedData) {
          widgetRuntime.saveWidgetPersistedData(saveWidget, payload.data || {})
        }
      }
    } catch {
      // ignore non-json messages from widgets
    }
  })

  socket.on('close', () => {
    socketHubs.overlay.delete(socket)
    broadcastStatus()
  })

  broadcastStatus()
})

function bindBridgeSocket(channel) {
  webSocketServers[channel].on('connection', (socket) => {
    socketHubs[channel].add(socket)
    console.log(`\n[bridge:${channel}] 🟢 Bridge conectado | Total conectados: ${socketHubs[channel].size}`)
    safeJsonSend(socket, {
      type: 'bridge-status',
      payload: {
        channel,
        connectedAt: Date.now(),
      },
    })

    socket.on('close', () => {
      socketHubs[channel].delete(socket)
      console.log(`[bridge:${channel}] 🔴 Bridge desconectado | Total conectados: ${socketHubs[channel].size}`)
      broadcastStatus()
    })

    broadcastStatus()
  })
}

bindBridgeSocket('minecraft')
bindBridgeSocket('gta')

// ============================================================================
// HEALTH CHECK ENDPOINTS - Monitorean estado del backend, bridge y GTA
// ============================================================================

/**
 * GET /api/health
 * Endpoint de salud global para verificar que el servidor está corriendo.
 * Usado para detectar si el backend se cayó.
 */
app.get('/api/health', (_request, response) => {
  response.status(200).json({
    ok: true,
    timestamp: Date.now(),
    uptime: Date.now() - serverStartedAt,
    server: {
      port: serverPort,
      isRunning: true,
    },
  })
})

/**
 * GET /api/health/bridge
 * Verifica el estado de conexión del bridge local (procesos hijo de Electron).
 * El bridge es un cliente WebSocket que se conecta a este servidor.
 * Si no hay bridge conectado, significa que no podemos enviar eventos a GTA/Minecraft.
 */
app.get('/api/health/bridge', (_request, response) => {
  const hasMinecraftClients = socketHubs.minecraft.size > 0
  const hasGtaClients = socketHubs.gta.size > 0
  const isBridgeConnected = hasMinecraftClients || hasGtaClients

  response.status(200).json({
    ok: true,
    timestamp: Date.now(),
    bridge: {
      online: isBridgeConnected,
      minecraftClientsConnected: socketHubs.minecraft.size,
      gtaClientsConnected: socketHubs.gta.size,
      totalClients: socketHubs.minecraft.size + socketHubs.gta.size,
      warning: !isBridgeConnected
        ? 'El bridge local no está conectado. Si usas Electron desktop, asegurate de ejecutar: node bridge/index.js'
        : null,
    },
  })
})

const DEFAULT_CHAOSMOD_HTTP_ENDPOINT = 'http://127.0.0.1:8888/'

async function readDesktopChaosModHttpConfig() {
  const stateChaos = store.getState().integrations?.chaosmod || {}
  const configCandidates = []

  const bridgeConfigPath = String(runtimeProcess.env.LIVE_CONTROL_BRIDGE_CONFIG || '').trim()
  if (bridgeConfigPath && existsSync(bridgeConfigPath)) {
    configCandidates.push(bridgeConfigPath)
  }

  configCandidates.push(
    path.join(projectRoot, 'bridge-config.json'),
    path.join(projectRoot, 'bridge-config.example.json'),
  )

  let fileChaos = {}
  for (const candidate of configCandidates) {
    if (!candidate || !existsSync(candidate)) continue
    try {
      const raw = await fs.readFile(candidate, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed?.chaosmod && typeof parsed.chaosmod === 'object') {
        fileChaos = parsed.chaosmod
        break
      }
    } catch {
      // ignore malformed bridge config
    }
  }

  const merged = { ...fileChaos, ...stateChaos }
  const enabled = merged.enabled !== false && merged.httpEnabled !== false
  const endpointUrl = String(
    merged.httpEndpoint
    || merged.endpointUrl
    || merged.httpUrl
    || merged.url
    || DEFAULT_CHAOSMOD_HTTP_ENDPOINT,
  ).trim()

  return {
    enabled,
    endpointUrl: endpointUrl.endsWith('/') ? endpointUrl : `${endpointUrl}/`,
  }
}

/**
 * GET /api/health/gta
 * Verifica la disponibilidad de GTA V y ChaosMod para disparar efectos.
 * Realiza un test de conexión al endpoint HTTP local de ChaosMod.
 */
app.get('/api/health/gta', async (_request, response) => {
  try {
    const hasGtaBridgeClient = socketHubs.gta.size > 0
    const chaosModConfig = await readDesktopChaosModHttpConfig()

    if (!chaosModConfig?.enabled) {
      return response.status(200).json({
        ok: true,
        timestamp: Date.now(),
        gta: {
          detected: false,
          chaosmod: {
            enabled: false,
            reachable: false,
            httpEndpoint: null,
          },
          warning: 'ChaosMod está deshabilitado en bridge-config.json',
        },
      })
    }

    if (!chaosModConfig.endpointUrl) {
      return response.status(200).json({
        ok: true,
        timestamp: Date.now(),
        gta: {
          detected: false,
          chaosmod: {
            enabled: false,
            reachable: false,
            httpEndpoint: null,
          },
          warning: 'No se configuró el endpoint HTTP de ChaosMod',
        },
      })
    }

    // Intenta conectar al endpoint de ChaosMod para verificar que está escuchando
    const testTimeoutMs = 2000
    const testAbortController = new AbortController()
    const testTimeoutId = setTimeout(() => testAbortController.abort(), testTimeoutMs)

    let isReachable = false
    let testError = ''

    try {
      const testResponse = await fetch(chaosModConfig.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: '_health_check_placeholder',
          sender: 'health-check',
        }),
        signal: testAbortController.signal,
      })

      // ChaosMod responde con 200 OK incluso si el effect ID es inválido
      // Eso es suficiente para verificar que está escuchando
      isReachable = testResponse.ok || testResponse.status === 200
    } catch (error) {
      testError = error?.message || 'Connection timeout o error'
    } finally {
      clearTimeout(testTimeoutId)
    }

    response.status(200).json({
      ok: true,
      timestamp: Date.now(),
      gta: {
        detected: isReachable,
        chaosmod: {
          enabled: true,
          reachable: isReachable,
          httpEndpoint: isReachable ? chaosModConfig.endpointUrl : null,
          testError: isReachable ? null : testError,
        },
        bridgeConnected: hasGtaBridgeClient,
        warning: !isReachable
          ? `ChaosMod HTTP no responde en ${chaosModConfig.endpointUrl}. ¿Tienes GTA V abierto con ChaosMod corriendo?`
          : !hasGtaBridgeClient
            ? 'Bridge local no conectado para GTA'
            : null,
      },
    })
  } catch (error) {
    response.status(200).json({
      ok: true,
      timestamp: Date.now(),
      gta: {
        detected: false,
        chaosmod: {
          enabled: false,
          reachable: false,
          httpEndpoint: null,
        },
        error: error.message,
      },
    })
  }
})

const spotifyPollingIntervalId = setInterval(() => {
  if (!spotifySession.refreshToken) {
    return
  }

  void syncSpotifyPlaybackState({ queueNextIfNeeded: true }).catch((error) => {
    spotifySession = {
      ...spotifySession,
      lastError: error.message,
    }
    void persistSpotifySession()
    broadcastStatus()
  })
}, 1500)

if (spotifySession.refreshToken) {
  void syncSpotifyPlaybackState({ queueNextIfNeeded: false }).catch(() => {
    // noop
  })
}

const overlayMirrorIntervalId = desktopModeEnabled
  ? setInterval(() => {
      void queuePublicOverlayMirrorState('keepalive')
    }, 30000)
  : null

httpServer.on('upgrade', (request, socket, head) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  const pathname = requestUrl.pathname
  const providedKey = readAccessKey(request, requestUrl)

  let targetChannel = null

  if (pathname === '/ws/app') {
    targetChannel = 'app'
  } else if (pathname === '/ws/overlay') {
    targetChannel = 'overlay'
  } else if (pathname === '/ws/minecraft') {
    targetChannel = 'minecraft'
  } else if (pathname === '/ws/gta') {
    targetChannel = 'gta'
  }

  if (!targetChannel) {
    socket.destroy()
    return
  }

  if (targetChannel === 'overlay') {
    if (!isAccessGranted(getOverlayAccessKey(), providedKey)) {
      rejectSocketUpgrade(
        socket,
        401,
        'Unauthorized',
        'Este overlay necesita la clave publica configurada en el panel.',
      )
      return
    }
  } else if (!isAccessGranted(getDashboardAccessKey(), providedKey)) {
    rejectSocketUpgrade(
      socket,
      401,
      'Unauthorized',
      'La clave del panel es obligatoria para usar este websocket.',
    )
    return
  }

  webSocketServers[targetChannel].handleUpgrade(request, socket, head, (clientSocket) => {
    clientSocket._liveControlAlive = true
    clientSocket.on('pong', () => {
      clientSocket._liveControlAlive = true
    })
    webSocketServers[targetChannel].emit('connection', clientSocket, request)
  })
})

app.use('/media', express.static(getMediaDirectory()))

if (existsSync(distIndexFile)) {
  app.use((request, response, next) => {
    const requestPath = String(request.path || '')
    const isHtmlShellRequest =
      request.method === 'GET'
      && !requestPath.startsWith('/api')
      && !requestPath.startsWith('/ws')
      && !requestPath.startsWith('/media/')
      && !path.extname(requestPath)

    if (isHtmlShellRequest) {
      response.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate')
      response.setHeader('Pragma', 'no-cache')
      response.setHeader('Expires', '0')
    }

    next()
  })

  app.use(
    express.static(distDirectory, {
      etag: false,
      maxAge: 0,
      setHeaders: (response, filePath) => {
        if (String(filePath || '').includes(`${path.sep}assets${path.sep}`)) {
          response.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate')
          response.setHeader('Pragma', 'no-cache')
          response.setHeader('Expires', '0')
        }
      },
    }),
  )

  app.get(/^(?!\/api).*/, async (_request, response) => {
    response.type('html').send(await renderDistIndexHtml())
  })
} else {
  app.get('/', (_request, response) => {
    response.json({
      ok: true,
      message: 'Servidor local activo. Ejecuta npm run dev para abrir el panel.',
      port: serverPort,
    })
  })
}

function startHttpServerWithRetry(attempt = 0) {
  const nextAttempt = Number(attempt || 0)

  const handleListening = () => {
    httpServer.off('error', handleError)
    const bindHost =
      String(runtimeProcess.env.LIVE_CONTROL_BIND_HOST || '').trim()
      || (runtimeProcess.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')
    console.log(`Live Control backend activo en http://${bindHost}:${serverPort}`)

    if (desktopModeEnabled) {
      void queuePublicOverlayMirrorState('startup')
    }

    void bootstrapPremiumIntegrations({
      store,
      dispatchActionById: (action) => dispatchAction(action, createManualIncomingEvent('streamdeck'), 'streamdeck'),
      onStatusChange: () => broadcastStatus(),
    })
  }

  const handleError = (error) => {
    httpServer.off('listening', handleListening)

    if (error?.code === 'EADDRINUSE' && nextAttempt < 20) {
      const retryInMs = 500
      console.warn(
        `El puerto ${serverPort} sigue ocupado o en espera. Reintentando en ${retryInMs}ms (${nextAttempt + 1}/20)...`,
      )
      setTimeout(() => {
        startHttpServerWithRetry(nextAttempt + 1)
      }, retryInMs)
      return
    }

    throw error
  }

  const bindHost =
    String(runtimeProcess.env.LIVE_CONTROL_BIND_HOST || '').trim()
    || (runtimeProcess.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')

  httpServer.once('listening', handleListening)
  httpServer.once('error', handleError)
  httpServer.listen(serverPort, bindHost)
}

startHttpServerWithRetry()

async function shutdown() {
  await disconnectTikTok()
  clearInterval(spotifyPollingIntervalId)

  if (overlayMirrorIntervalId) {
    clearInterval(overlayMirrorIntervalId)
  }

  if (minecraftRcon) {
    try {
      minecraftRcon.end()
    } catch {
      // noop
    }
  }

  httpServer.close(() => {
    runtimeProcess.exit(0)
  })
}

runtimeProcess.on('SIGINT', shutdown)
runtimeProcess.on('SIGTERM', shutdown)
