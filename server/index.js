import { createServer } from 'node:http'
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
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
  sanitizeSlug,
} from '../src/live-control.js'
import {
  createStoredMediaName,
  ensureMediaDirectory,
  getMediaDirectory,
  listMediaItems,
  removeMediaItem,
} from './media-library.js'
import { StateStore } from './state-store.js'
import { getStateFilePath } from './storage-paths.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const runtimeProcess = globalThis.process
const projectRoot = path.resolve(__dirname, '..')
const distDirectory = path.join(projectRoot, 'dist')
const distIndexFile = path.join(distDirectory, 'index.html')
const serverPort = Number(runtimeProcess.env.PORT || 5123)
const recentLimit = 20
const cooldownTracker = new Map()
const serverStartedAt = Date.now()

const store = new StateStore()
await store.load()
await ensureMediaDirectory()

const app = express()
app.use(express.json({ limit: '1mb' }))

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
const recentEvents = []
const recentDispatches = []
let mediaLibraryCount = (await listMediaItems()).length

function normalizeTikTokUsername(username) {
  return String(username || '').trim().replace(/^@/, '')
}

function extractImageUrl(imageValue) {
  if (!imageValue) {
    return ''
  }

  if (typeof imageValue === 'string') {
    return imageValue
  }

  if (Array.isArray(imageValue.urlList) && imageValue.urlList[0]) {
    return String(imageValue.urlList[0])
  }

  if (Array.isArray(imageValue.url_list) && imageValue.url_list[0]) {
    return String(imageValue.url_list[0])
  }

  if (Array.isArray(imageValue.urls) && imageValue.urls[0]) {
    return String(imageValue.urls[0])
  }

  if (imageValue.url) {
    return String(imageValue.url)
  }

  return ''
}

function normalizeGiftCatalogEntry(gift, sortOrder = 0) {
  const normalizedName = String(
    gift?.name || gift?.describe || gift?.displayName || gift?.giftName || '',
  ).trim()
  const normalizedId = String(gift?.id || gift?.giftId || gift?.gift_id || normalizedName || sortOrder)
  const normalizedCoins = Number(
    gift?.diamond_count || gift?.diamondCount || gift?.coins || gift?.price || 0,
  )
  const staticImageUrl =
    extractImageUrl(gift?.giftImage) ||
    extractImageUrl(gift?.gift_image) ||
    extractImageUrl(gift?.previewImage) ||
    extractImageUrl(gift?.preview_image) ||
    extractImageUrl(gift?.image) ||
    extractImageUrl(gift?.icon) ||
    extractImageUrl(gift?.giftLabelIcon) ||
    extractImageUrl(gift?.gift_label_icon)
  const animatedImageUrl =
    extractImageUrl(gift?.animatedImage) ||
    extractImageUrl(gift?.animated_image) ||
    extractImageUrl(gift?.gifImage) ||
    extractImageUrl(gift?.gif_image) ||
    extractImageUrl(gift?.dynamicImage) ||
    extractImageUrl(gift?.dynamic_image)

  return {
    id: normalizedId,
    name: normalizedName || `Gift ${normalizedId}`,
    coins: Number.isFinite(normalizedCoins) ? normalizedCoins : 0,
    imageUrl: staticImageUrl || animatedImageUrl,
    animatedImageUrl,
    source: 'tiktok-live-connector',
    sortOrder,
  }
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
        sourceUsername: sourceUsername || previousIntegration.sourceUsername || '',
        syncedAt: Date.now(),
        lastError: String(lastError || '').trim(),
      },
    },
  })
  const savedState = await store.setState(nextState)

  broadcast('app', { type: 'state', payload: savedState })
  broadcastStatus()

  return savedState.integrations.tiktok
}

async function syncTikTokGiftCatalog(username, connection = null) {
  const cleanUsername = normalizeTikTokUsername(username)

  if (!cleanUsername) {
    throw new Error('Necesitas un username de TikTok para sincronizar gifts.')
  }

  let ownedConnection = null

  try {
    const activeConnection =
      connection ||
      new TikTokLiveConnection(cleanUsername, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        fetchRoomInfoOnConnect: false,
      })

    if (!connection) {
      ownedConnection = activeConnection
    }

    const availableGifts = await activeConnection.fetchAvailableGifts()
    const giftCatalog = Array.isArray(availableGifts)
      ? availableGifts
          .map((gift, index) => normalizeGiftCatalogEntry(gift, index))
          .filter((gift) => gift.id && gift.name)
      : []

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
  const profile = store.getState().profile

  return {
    projectName: profile.projectName,
    streamerName: profile.streamerName,
    overlaySlug: sanitizeSlug(profile.overlaySlug),
    publicBaseUrl: normalizeBaseUrl(profile.publicBaseUrl),
    overlayDurationMs: profile.overlayDurationMs,
  }
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
  const providedKey = readAccessKey(request)

  if (isAccessGranted(getDashboardAccessKey(), providedKey)) {
    next()
    return
  }

  response.status(401).json({
    error: 'La clave del panel es obligatoria para abrir el dashboard y sus APIs.',
  })
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
    server: {
      port: serverPort,
      startedAt: serverStartedAt,
      stateFile: getStateFilePath(),
      hasStaticBuild: existsSync(distIndexFile),
    },
    profile: state.profile,
    tikTok: {
      ...tikTokStatus,
      giftCatalogCount: Array.isArray(tikTokIntegration.giftCatalog)
        ? tikTokIntegration.giftCatalog.length
        : 0,
      giftCatalogSyncedAt: tikTokIntegration.syncedAt || null,
      giftCatalogLastError: tikTokIntegration.lastError || '',
      giftCatalogSourceUsername: tikTokIntegration.sourceUsername || '',
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
    recentEvents,
    recentDispatches,
  }
}

function broadcastStatus() {
  const statusPayload = buildStatus()
  broadcast('app', { type: 'status', payload: statusPayload })
  broadcast('overlay', {
    type: 'overlay-state',
    payload: {
      profile: getPublicProfile(),
    },
  })
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

function normalizeTikTokEvent(type, data) {
  const uniqueId = normalizeUserName(data)
  const baseEvent = {
    id: createId('incoming'),
    type,
    uniqueId,
    sourceLabel: uniqueId,
    createdAt: Date.now(),
    summary: '',
    matchText: '',
    comment: '',
    giftName: '',
    repeatCount: 1,
    likeCount: 0,
    totalLikeCount: 0,
    shareTarget: '',
    displayText: '',
  }

  if (type === 'comment') {
    baseEvent.comment = data?.comment || ''
    baseEvent.summary = `${uniqueId}: ${baseEvent.comment}`
    baseEvent.matchText = baseEvent.comment
    return baseEvent
  }

  if (type === 'gift') {
    baseEvent.giftName =
      data?.giftName ||
      data?.extendedGiftInfo?.name ||
      data?.describe ||
      `Gift ${data?.giftId || 'unknown'}`
    baseEvent.repeatCount = Number(data?.repeatCount || 1)
    baseEvent.summary = `${uniqueId} envio ${baseEvent.giftName} x${baseEvent.repeatCount}`
    baseEvent.matchText = `${baseEvent.giftName} x${baseEvent.repeatCount}`
    baseEvent.displayText = baseEvent.giftName
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
  return {
    id: createId(`${output}-bridge`),
    output,
    actionId: action.id,
    actionName: action.name,
    commandText: getActionCommandSummary(action),
    rawCommandText: action.commandText,
    gtaMode: action.gtaMode || 'generic',
    gtaChaosEffectId: action.gtaChaosEffectId || '',
    gtaChaosEffectName: action.gtaChaosEffectName || '',
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

  broadcast('overlay', { type: 'overlay-event', payload: overlayEvent })
  broadcast('app', { type: 'overlay-event', payload: overlayEvent })

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
        const response = await rcon.send(action.commandText)

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
    broadcast('gta', { type: 'gta-event', payload: gtaPayload })
    bridgeResults.gta = {
      deliveredToClients: socketHubs.gta.size,
    }
  }

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

async function processIncomingEvent(event, reason = 'tiktok') {
  pushRecent(recentEvents, event)
  setTikTokStatus({ lastEventAt: event.createdAt })
  broadcast('app', { type: 'incoming-event', payload: event })

  const state = store.getState()
  const matchedTriggers = state.triggers.filter((trigger) => matchesTrigger(trigger, event))

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
}

async function connectTikTok(username) {
  const cleanUsername = normalizeTikTokUsername(username)

  if (!cleanUsername) {
    throw new Error('Necesitas un username de TikTok para conectar.')
  }

  await disconnectTikTok()

  await store.updateProfile({
    tiktokUsername: cleanUsername,
  })

  setTikTokStatus({
    connected: false,
    connecting: true,
    username: cleanUsername,
    roomId: '',
    lastError: '',
  })

  const connection = new TikTokLiveConnection(cleanUsername, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    fetchRoomInfoOnConnect: true,
  })

  bindTikTokEvents(connection)

  try {
    const connectState = await connection.connect()
    tikTokConnection = connection

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
  response.json({
    profile: getPublicProfile(),
  })
})

app.use('/api', requireDashboardAccess)

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

  if (
    previousState.profile.minecraftHost !== savedState.profile.minecraftHost ||
    previousState.profile.minecraftPort !== savedState.profile.minecraftPort ||
    previousState.profile.minecraftPassword !== savedState.profile.minecraftPassword
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

  broadcast('app', { type: 'state', payload: savedState })
  broadcast('overlay', { type: 'overlay-state', payload: { profile: getPublicProfile() } })
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

app.post('/api/tiktok/connect', async (request, response) => {
  try {
    const result = await connectTikTok(request.body?.username)
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

app.post('/api/actions/:actionId/test', async (request, response) => {
  const action = findActionById(request.params.actionId)

  if (!action) {
    response.status(404).json({ error: 'No encontre esa accion.' })
    return
  }

  const manualEvent = createManualIncomingEvent('comment', {
    userName: request.body?.userName || 'manual-test',
    comment: request.body?.comment || `Test manual para ${action.name}`,
  })

  const dispatchRecord = await dispatchAction(action, manualEvent, 'manual-test')
  response.json(dispatchRecord)
})

app.post('/api/events/test', async (request, response) => {
  const eventType = request.body?.type || 'comment'
  const manualEvent = createManualIncomingEvent(eventType, request.body)
  await processIncomingEvent(manualEvent, 'manual-event')
  response.json(manualEvent)
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

webSocketServers.overlay.on('connection', (socket) => {
  socketHubs.overlay.add(socket)
  safeJsonSend(socket, {
    type: 'overlay-state',
    payload: {
      profile: getPublicProfile(),
    },
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
    safeJsonSend(socket, {
      type: 'bridge-status',
      payload: {
        channel,
        connectedAt: Date.now(),
      },
    })

    socket.on('close', () => {
      socketHubs[channel].delete(socket)
      broadcastStatus()
    })

    broadcastStatus()
  })
}

bindBridgeSocket('minecraft')
bindBridgeSocket('gta')

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
    webSocketServers[targetChannel].emit('connection', clientSocket, request)
  })
})

app.use('/media', express.static(getMediaDirectory()))

if (existsSync(distIndexFile)) {
  app.use(express.static(distDirectory))

  app.get(/^(?!\/api).*/, (_request, response) => {
    response.sendFile(distIndexFile)
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

httpServer.listen(serverPort, () => {
  console.log(`Live Control backend activo en http://127.0.0.1:${serverPort}`)
})

async function shutdown() {
  await disconnectTikTok()

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
