import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, parse as parseUrl } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'
import { Rcon } from 'rcon-client'
import {
  parseChaosModEffectsIni,
  inferChaosModCategory,
  formatChaosModFallbackName,
  getChaosModCategoryLabel,
} from '../src/chaosmod.js'
import {
  buildWebSocketUrl,
  LOCAL_BRIDGE_DEFAULTS,
  normalizeBaseUrl,
  normalizeMinecraftCommand,
} from '../src/live-control.js'

const runtimeProcess = globalThis.process
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const CONFIG_PATH = String(runtimeProcess.env.LIVE_CONTROL_BRIDGE_CONFIG || '').trim()
  ? path.resolve(String(runtimeProcess.env.LIVE_CONTROL_BRIDGE_CONFIG || '').trim())
  : path.join(projectRoot, 'bridge-config.json')
const GTAV_WEBHOOK_EVENT_HINTS = [
  'toolup',
  'parkour',
  'sky parkour',
  'pointtopoint',
  'point to point',
  'chiliad',
  'prop',
  'map',
  'spawn vehicle',
  'replace vehicle',
  'vehicle replace',
]
const CHAOSMOD_INSTALL_CANDIDATES = [
  {
    modPath: 'C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod',
    processName: 'GTA5_Enhanced',
    label: 'GTAVEnhanced',
  },
  {
    modPath: 'C:\\Program Files (x86)\\Epic Games\\GTAVEnhanced\\chaosmod',
    processName: 'GTA5_Enhanced',
    label: 'GTAVEnhanced x86',
  },
  {
    modPath: 'C:\\Program Files\\Epic Games\\GTAV\\chaosmod',
    processName: 'GTA5',
    label: 'GTAV',
  },
  {
    modPath: 'C:\\Program Files (x86)\\Epic Games\\GTAV\\chaosmod',
    processName: 'GTA5',
    label: 'GTAV x86',
  },
]

const DEFAULT_CONFIG = {
  serverBaseUrl: 'https://TU-APP.up.railway.app',
  localDashboardBaseUrl: 'http://127.0.0.1:5123',
  dashboardKey: '',
  reconnectDelayMs: 2500,
  minecraft: {
    enabled: true,
    localBridgeHost: '127.0.0.1',
    localBridgePort: LOCAL_BRIDGE_DEFAULTS.minecraftPort,
    useRcon: false,
    rconHost: '127.0.0.1',
    rconPort: 25575,
    rconPassword: '',
  },
  gta: {
    enabled: true,
    localBridgeHost: '127.0.0.1',
    localBridgePort: LOCAL_BRIDGE_DEFAULTS.gtaPort,
  },
  chaosmod: {
    enabled: true,
    modPath: 'C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod',
    gtaProcessName: 'GTA5_Enhanced',
    preferShortcutTrigger: true,
    allowMenuFallback: true,
    shortcutReloadDelayMs: 850,
    shortcutPostReloadDelayMs: 1400,
    shortcutKeyDelayMs: 45,
    menuOpenDelayMs: 220,
    keyDelayMs: 35,
  },
  s4eBridge: {
    enabled: true,
    localHttpHost: '127.0.0.1',
    localHttpPort: 3087,
    wsPort: 7704,
  },
}

function mergeBridgeConfig(parsedConfig = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...parsedConfig,
    minecraft: {
      ...DEFAULT_CONFIG.minecraft,
      ...(parsedConfig.minecraft || {}),
    },
    gta: {
      ...DEFAULT_CONFIG.gta,
      ...(parsedConfig.gta || {}),
    },
    chaosmod: {
      ...DEFAULT_CONFIG.chaosmod,
      ...(parsedConfig.chaosmod || {}),
    },
  }
}

function ensureConfigFile() {
  if (existsSync(CONFIG_PATH)) {
    return
  }

  writeFileSync(CONFIG_PATH, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8')
  console.log(`Cree ${CONFIG_PATH}. Completa serverBaseUrl y vuelve a correr npm run bridge:start.`)
  runtimeProcess.exit(0)
}

function readConfigFile() {
  ensureConfigFile()
  const rawConfig = readFileSync(CONFIG_PATH, 'utf8')
  const parsedConfig = mergeBridgeConfig(JSON.parse(rawConfig))
  
  // Allow environment variable override for backend URL
  let serverBaseUrl = String(runtimeProcess.env.LIVE_CONTROL_BACKEND_URL || '').trim()
  if (!serverBaseUrl) {
    serverBaseUrl = parsedConfig.serverBaseUrl
  }
  
  const normalizedBaseUrl = normalizeBaseUrl(serverBaseUrl)

  if (!normalizedBaseUrl || normalizedBaseUrl.includes('TU-APP.up.railway.app')) {
    throw new Error(
      'bridge-config.json necesita una serverBaseUrl real. Configura LIVE_CONTROL_BACKEND_URL o edita bridge-config.json.',
    )
  }

  return {
    ...parsedConfig,
    serverBaseUrl: normalizedBaseUrl,
    localDashboardBaseUrl: normalizeBaseUrl(parsedConfig.localDashboardBaseUrl),
    dashboardKey: String(parsedConfig.dashboardKey || '').trim(),
  }
}

function inferChaosModProcessName(modPath) {
  const normalizedPath = String(modPath || '').toLowerCase()

  if (normalizedPath.includes('gtavenhanced')) {
    return 'GTA5_Enhanced'
  }

  return 'GTA5'
}

function buildChaosModRuntimeCandidates(chaosModConfig) {
  const configuredModPath = String(chaosModConfig.modPath || '').trim()
  const configuredProcessName = String(chaosModConfig.gtaProcessName || '').trim()
  const candidates = []
  const seenPaths = new Set()

  // Si hay un processName explícito, filtramos los candidatos estaticos para que solo
  // queden los que coincidan — así GTAVEnhanced y GTAV no se cruzan nunca.
  const staticCandidates = configuredProcessName
    ? CHAOSMOD_INSTALL_CANDIDATES.filter(
        (c) => c.processName.toLowerCase() === configuredProcessName.toLowerCase(),
      )
    : CHAOSMOD_INSTALL_CANDIDATES

  ;[
    configuredModPath
      ? {
          modPath: configuredModPath,
          processName: configuredProcessName || inferChaosModProcessName(configuredModPath),
          label: 'configurado',
        }
      : null,
    ...staticCandidates,
  ]
    .filter(Boolean)
    .forEach((candidate) => {
      const normalizedModPath = path.resolve(String(candidate.modPath || '').trim())

      if (!normalizedModPath || seenPaths.has(normalizedModPath)) {
        return
      }

      seenPaths.add(normalizedModPath)
      candidates.push({
        ...candidate,
        modPath: normalizedModPath,
        effectsFilePath: path.join(normalizedModPath, 'configs', 'effects.ini'),
        configFilePath: path.join(normalizedModPath, 'configs', 'config.ini'),
        chaosLogFilePath: path.join(normalizedModPath, 'chaoslog.txt'),
      })
    })

  return candidates.filter((candidate) => existsSync(candidate.effectsFilePath))
}

function findRunningChaosModProcessName(candidates) {
  const processNames = Array.from(
    new Set(candidates.map((candidate) => String(candidate.processName || '').trim()).filter(Boolean)),
  )

  if (processNames.length === 0) {
    return ''
  }

  const taskListResult = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
    windowsHide: true,
  })

  if (taskListResult.status !== 0) {
    return ''
  }

  const processListText = String(taskListResult.stdout || '').toLowerCase()

  return processNames.find((processName) =>
    processListText.includes(`"${String(processName).toLowerCase()}.exe"`),
  ) || ''
}

function resolveChaosModRuntime(chaosModConfig) {
  const candidates = buildChaosModRuntimeCandidates(chaosModConfig)
  const fallbackModPath = path.resolve(String(chaosModConfig.modPath || '').trim())
  const fallbackRuntime = {
    label: 'configurado',
    modPath: fallbackModPath,
    processName: String(chaosModConfig.gtaProcessName || '').trim() || inferChaosModProcessName(fallbackModPath),
    effectsFilePath: path.join(fallbackModPath, 'configs', 'effects.ini'),
    configFilePath: path.join(fallbackModPath, 'configs', 'config.ini'),
    chaosLogFilePath: path.join(fallbackModPath, 'chaoslog.txt'),
  }

  if (candidates.length === 0) {
    return fallbackRuntime
  }

  const runningProcessName = findRunningChaosModProcessName(candidates)
  const runtimeFromRunningProcess = candidates.find(
    (candidate) => candidate.processName.toLowerCase() === runningProcessName.toLowerCase(),
  )

  if (runtimeFromRunningProcess) {
    return runtimeFromRunningProcess
  }

  const configuredRuntime = candidates.find((candidate) => candidate.modPath === fallbackModPath)

  if (configuredRuntime) {
    return configuredRuntime
  }

  const preferredEnhancedRuntime = candidates.find((candidate) => candidate.processName === 'GTA5_Enhanced')

  return preferredEnhancedRuntime || candidates[0]
}

function safeJsonSend(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) {
    return
  }

  socket.send(JSON.stringify(payload))
}

function createLocalBridgeServer(channelName, channelConfig) {
  const clients = new Set()
  const server = new WebSocketServer({
    host: channelConfig.localBridgeHost,
    port: Number(channelConfig.localBridgePort),
  })

  server.on('connection', (socket) => {
    clients.add(socket)
    console.log(
      `[local:${channelName}] cliente conectado en ws://${channelConfig.localBridgeHost}:${channelConfig.localBridgePort}`,
    )
    safeJsonSend(socket, {
      type: 'bridge-status',
      payload: {
        channel: channelName,
        connectedAt: Date.now(),
      },
    })

    socket.on('close', () => {
      clients.delete(socket)
      console.log(`[local:${channelName}] cliente desconectado`)
    })
  })

  console.log(
    `[local:${channelName}] escuchando en ws://${channelConfig.localBridgeHost}:${channelConfig.localBridgePort}`,
  )

  return {
    server,
    clients,
  }
}

let s4eLauncherSocket = null
let s4eCommandBuffer = []
const s4eConnectionInfo = {
  isConnected: false,
  isLauncher: false,
  clientInfo: null,
  launcherInfo: null,
  connectedAt: null,
}

function trackS4eOutgoingFrame(frame, note = '') {
  const rawOutgoing = JSON.stringify(frame)
  console.log(
    `[s4e] mensaje websocket saliente${note ? ` (${note})` : ''}: ${rawOutgoing.slice(0, 500)}`,
  )
  s4eCommandBuffer.push({
    at: new Date().toISOString(),
    direction: 'outgoing',
    note,
    raw: rawOutgoing,
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createS4eBridgeWebSocketServer(bridgeConfig) {
  const wsPort = Number(bridgeConfig.s4eBridge?.wsPort || 7704)
  const wsServer = new WebSocketServer({ port: wsPort })

  wsServer.on('connection', (socket, req) => {
    if (s4eLauncherSocket && s4eLauncherSocket.readyState === WebSocket.OPEN) {
      console.log('[s4e] rechazando nueva conexion, ya existe un cliente conectado')
      socket.close(1000, 'Server already has a client')
      return
    }

    s4eLauncherSocket = socket
    s4eConnectionInfo.isConnected = true
    s4eConnectionInfo.clientInfo = {
      ip: req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      connectedAt: new Date().toISOString(),
    }
    s4eConnectionInfo.connectedAt = new Date().toISOString()

    console.log(`[s4e] socket conectado en ws://127.0.0.1:${wsPort}`)

    socket.on('message', (message) => {
      const rawMessage = message.toString()
      console.log(`[s4e] mensaje websocket recibido: ${rawMessage.slice(0, 500)}`)
      s4eCommandBuffer.push({
        at: new Date().toISOString(),
        direction: 'incoming',
        raw: rawMessage,
      })
      try {
        const msgObj = JSON.parse(rawMessage)

        if (msgObj?.type === 'launcher_connect') {
          console.log('[s4e] handshake launcher_connect recibido')
          s4eConnectionInfo.isLauncher = true
          s4eConnectionInfo.launcherInfo = {
            ip: req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            connectedAt: new Date().toISOString(),
          }
          socket.send(JSON.stringify({ type: 'launcher_connected', success: true }))
          return
        }

        if (msgObj?.type === 'win' || msgObj?.type === 'lose') {
          console.log(`[s4e] comando de juego recibido: ${msgObj.type}`)
          return
        }

        if (msgObj?.type === 'get_minecraft_status') {
          socket.send(JSON.stringify({ type: 'minecraft_status', isRunning: false }))
          return
        }

        console.log(`[s4e] mensaje websocket sin manejar: ${JSON.stringify(msgObj)}`)
      } catch (error) {
        console.log('[s4e] mensaje invalido recibido:', error.message)
      }
    })

    socket.on('close', () => {
      console.log('[s4e] socket desconectado')
      s4eLauncherSocket = null
      s4eConnectionInfo.isConnected = false
      s4eConnectionInfo.isLauncher = false
    })

    socket.on('error', (error) => {
      console.error('[s4e] error de websocket:', error.message)
      s4eLauncherSocket = null
      s4eConnectionInfo.isConnected = false
      s4eConnectionInfo.isLauncher = false
    })
  })

  return wsServer
}

function createS4eBridgeHttpServer(bridgeConfig) {
  const host = String(bridgeConfig.s4eBridge?.localHttpHost || '127.0.0.1').trim() || '127.0.0.1'
  const port = Number(bridgeConfig.s4eBridge?.localHttpPort || 3087)

  const server = http.createServer(async (req, res) => {
    const parsedUrl = parseUrl(req.url || '', true)
    const method = req.method

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    const sendJson = (statusCode, payload) => {
      const body = JSON.stringify(payload)
      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body, 'utf8'),
      })
      res.end(body)
    }

    const readRequestBody = () =>
      new Promise((resolve, reject) => {
        let rawBody = ''
        req.on('data', (chunk) => {
          rawBody += chunk
        })
        req.on('end', () => {
          if (!rawBody) {
            resolve({})
            return
          }
          try {
            resolve(JSON.parse(rawBody))
          } catch {
            reject(new Error('Invalid JSON body'))
          }
        })
        req.on('error', reject)
      })

    if (method === 'GET' && parsedUrl.pathname === '/commands') {
      const response = [...s4eCommandBuffer]
      s4eCommandBuffer = []
      sendJson(200, response)
      return
    }

    if (method === 'GET' && parsedUrl.pathname === '/connection-info') {
      sendJson(200, {
        success: true,
        connected: s4eConnectionInfo.isConnected,
        socketConnectionInfo: s4eConnectionInfo,
      })
      return
    }

    if (method === 'POST' && parsedUrl.pathname === '/win') {
      sendJson(200, { success: true, message: 'Win event handled' })
      return
    }

    if (method === 'POST' && parsedUrl.pathname === '/lose') {
      sendJson(200, { success: true, message: 'Lose event handled' })
      return
    }

    if (method === 'POST' && parsedUrl.pathname === '/s4e-bridge') {
      try {
        const body = await readRequestBody()
        if (!s4eLauncherSocket || s4eLauncherSocket.readyState !== WebSocket.OPEN) {
          sendJson(503, { success: false, error: 'Launcher socket not connected' })
          return
        }

        const payload = body.raw || { type: 's4e-bridge', payload: body.message ?? body }
        const launcherConnectFrame = { type: 'launcher_connect' }
        trackS4eOutgoingFrame(launcherConnectFrame, 'handshake')
        s4eLauncherSocket.send(JSON.stringify(launcherConnectFrame))
        await sleep(150)
        trackS4eOutgoingFrame(payload, 'command')
        s4eLauncherSocket.send(JSON.stringify(payload))
        sendJson(200, {
          success: true,
          handshakeSent: launcherConnectFrame,
          forwarded: payload,
        })
      } catch (error) {
        sendJson(400, { success: false, error: error.message })
      }
      return
    }

    sendJson(404, {
      success: false,
      error: 'Endpoint not found. Available endpoints: GET /commands, GET /connection-info, POST /win, POST /lose, POST /s4e-bridge',
    })
  })

  server.listen(port, host, () => {
    console.log(`[s4e] HTTP bridge escuchando en http://${host}:${port}`)
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[s4e] puerto ${port} en uso. No se puede iniciar el HTTP bridge.`)
    } else {
      console.error('[s4e] error de HTTP bridge:', err.message)
    }
  })

  return server
}

let minecraftRcon = null
let minecraftRconSignature = ''

async function ensureMinecraftRcon(minecraftConfig) {
  const signature = `${minecraftConfig.rconHost}:${minecraftConfig.rconPort}:${minecraftConfig.rconPassword}`

  if (minecraftRcon && minecraftRconSignature === signature) {
    return minecraftRcon
  }

  if (minecraftRcon) {
    try {
      await minecraftRcon.end()
    } catch {
      // noop
    }
  }

  minecraftRcon = await Rcon.connect({
    host: minecraftConfig.rconHost,
    port: Number(minecraftConfig.rconPort || 25575),
    password: minecraftConfig.rconPassword,
  })
  minecraftRconSignature = signature
  return minecraftRcon
}

function connectRemoteChannel(channelName, url, onMessage, reconnectDelayMs, onOpen) {
  let socket = null
  let reconnectTimeoutId = null
  let heartbeatIntervalId = null
  let isStopped = false
  let attempt = 0
  const MAX_BACKOFF_MS = 30000

  function scheduleReconnect() {
    if (isStopped) {
      return
    }

    // Exponential backoff: 2500, 5000, 10000, 20000, 30000 ms max
    const backoff = Math.min(reconnectDelayMs * Math.pow(2, attempt), MAX_BACKOFF_MS)
    attempt++
    console.log(`[remote:${channelName}] reintentando en ${Math.round(backoff / 1000)}s...`)
    reconnectTimeoutId = setTimeout(connect, backoff)
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatIntervalId = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.ping()
      }
    }, 25000)
  }

  function stopHeartbeat() {
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId)
      heartbeatIntervalId = null
    }
  }

  function connect() {
    const isLocal = url.includes('127.0.0.1') || url.includes('localhost')
    const prefix = isLocal ? '🟢' : '🔵'
    console.log(`\n${prefix} [remote:${channelName}] Conectando a ${url}`)
    socket = new WebSocket(url)

    socket.on('open', () => {
      attempt = 0
      console.log(`${prefix} [remote:${channelName}] ✅ Conectado exitosamente`)
      startHeartbeat()
      Promise.resolve(onOpen?.()).catch((error) => {
        console.error(`[remote:${channelName}] no pude correr onOpen: ${error.message}`)
      })
    })

    socket.on('pong', () => {
      // conexion sigue viva
    })

    socket.on('message', async (rawMessage) => {
      try {
        const parsedMessage = JSON.parse(String(rawMessage))
        await onMessage(parsedMessage)
      } catch (error) {
        console.error(`[remote:${channelName}] no pude procesar el mensaje: ${error.message}`)
      }
    })

    socket.on('close', () => {
      stopHeartbeat()
      console.log(`[remote:${channelName}] ❌ Desconectado | Reintentando en ${reconnectDelayMs}ms...`)
      scheduleReconnect()
    })

    socket.on('error', (error) => {
      console.error(`[remote:${channelName}] 🔴 Error de conexión: ${error.message}`)
      socket.close()
    })
  }

  connect()

  return () => {
    isStopped = true
    stopHeartbeat()
    clearTimeout(reconnectTimeoutId)
    socket?.close()
  }
}

function updateIniValue(filePath, key, value) {
  const iniContent = readFileSync(filePath, 'utf8')
  const normalizedLine = `${key}=${value}`

  if (new RegExp(`^${key}=`, 'm').test(iniContent)) {
    const nextContent = iniContent.replace(new RegExp(`^${key}=.*$`, 'm'), normalizedLine)

    if (nextContent !== iniContent) {
      writeFileSync(filePath, nextContent, 'utf8')
    }

    return
  }

  writeFileSync(filePath, `${iniContent.trimEnd()}\n${normalizedLine}\n`, 'utf8')
}

function isBusyFileError(error) {
  return ['EBUSY', 'EPERM', 'EACCES'].includes(String(error?.code || '').toUpperCase())
}

/**
 * Lee un archivo INI con tolerancia a bloqueos
 * Reintentos: 3 intentos con 100ms de espera entre cada uno
 */
function readEffectsIniWithRetry(filePath, maxRetries = 3, retryDelayMs = 100) {
  let lastError = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const content = readFileSync(filePath, 'utf8')
      if (attempt > 1) {
        console.log(`[bridge:chaosmod] ✅ Lectura de effects.ini exitosa en intento ${attempt}`)
      }
      return content
    } catch (error) {
      lastError = error
      
      if (!isBusyFileError(error)) {
        throw error // No es bloqueo, lanzar error directamente
      }
      
      console.warn(`[bridge:chaosmod] ⚠️ [EBUSY] Intento ${attempt}/${maxRetries} falló: ${error.message}`)
      
      // Esperar antes de reintentar (excepto en el último)
      if (attempt < maxRetries) {
        const endTime = Date.now() + retryDelayMs
        while (Date.now() < endTime) {
          // Spin-wait para mantener CPU ocupada sin bloquear
        }
      }
    }
  }

  // Si todos los reintentos fallaron
  console.error(`[bridge:chaosmod] ❌ [EBUSY] FALLO PERMANENTE: effects.ini está bloqueado después de ${maxRetries} intentos`)
  console.error(`[bridge:chaosmod]    Error original: ${lastError.message}`)
  console.error(`[bridge:chaosmod]    Causa probable: GTA5 o ChaosMod UI tiene el archivo abierto`)
  console.error(`[bridge:chaosmod]    Solución: Cierra GTA5 y ChaosMod, espera 2 segundos, reintenta`)
  
  throw new Error(
    `[EBUSY-BLOQUEADO] effects.ini está permanentemente bloqueado. ${lastError.message}`
  )
}

function tryUpdateIniValue(filePath, key, value, contextLabel = filePath) {
  try {
    updateIniValue(filePath, key, value)
    return true
  } catch (error) {
    if (isBusyFileError(error)) {
      console.warn(
        `[chaosmod] no pude actualizar ${contextLabel} (${key}) porque el archivo esta bloqueado: ${error.message}`,
      )
      return false
    }

    throw error
  }
}

function parseCommaSeparatedValues(valueText) {
  const values = []
  let currentValue = ''
  let isInsideQuotes = false

  for (const character of String(valueText || '')) {
    if (character === '"') {
      isInsideQuotes = !isInsideQuotes
      currentValue += character
      continue
    }

    if (character === ',' && !isInsideQuotes) {
      values.push(currentValue)
      currentValue = ''
      continue
    }

    currentValue += character
  }

  values.push(currentValue)
  return values
}

function buildChaosModCatalogFromEffectsIni(effectsIniText) {
  return parseChaosModEffectsIni(effectsIniText)
    .filter((entry) => entry.enabled)
    .map((entry) => {
      const category = inferChaosModCategory(entry.id)

      return {
        id: entry.id,
        name: formatChaosModFallbackName(entry.id),
        category,
        categoryLabel: getChaosModCategoryLabel(category),
        source: 'effects.ini',
      }
    })
}

function readChaosModExactCatalog(effectsFilePath) {
  if (!effectsFilePath || !existsSync(effectsFilePath)) {
    return []
  }

  return buildChaosModCatalogFromEffectsIni(readEffectsIniWithRetry(effectsFilePath))
}

function resolveGtavWebhookPaths(chaosModState, bridgeConfig) {
  const chaosModBasePath = chaosModState?.sourcePath || bridgeConfig?.chaosmod?.modPath || ''
  const gameBasePath = chaosModBasePath ? path.resolve(chaosModBasePath, '..') : ''

  return {
    gameBasePath,
    dllPath: gameBasePath ? path.join(gameBasePath, 'scripts', 'GTAVWebhook.dll') : '',
    logPath: gameBasePath ? path.join(gameBasePath, 'GTAVWebhook.log') : '',
    configPath: gameBasePath ? path.join(gameBasePath, 'scripts', 'config.yml') : '',
  }
}

function inspectGtavWebhookRuntime(chaosModState, bridgeConfig) {
  const paths = resolveGtavWebhookPaths(chaosModState, bridgeConfig)
  const logText = paths.logPath && existsSync(paths.logPath) ? readFileSync(paths.logPath, 'utf8') : ''
  const wsPort = Number(bridgeConfig?.s4eBridge?.wsPort || 7704)
  const httpHost = String(bridgeConfig?.s4eBridge?.localHttpHost || '127.0.0.1').trim() || '127.0.0.1'
  const httpPort = Number(bridgeConfig?.s4eBridge?.localHttpPort || 3087)

  return {
    ...paths,
    dllExists: Boolean(paths.dllPath && existsSync(paths.dllPath)),
    logExists: Boolean(paths.logPath && existsSync(paths.logPath)),
    configExists: Boolean(paths.configPath && existsSync(paths.configPath)),
    httpServerStarted: /HttpServer started/i.test(logText),
    webSocketConnected: /Connected to WebSocket server/i.test(logText),
    probableWsUrl: `ws://127.0.0.1:${wsPort}`,
    probableHttpBaseUrl: `http://${httpHost}:${httpPort}`,
    launcherSocketOpen: Boolean(s4eLauncherSocket && s4eLauncherSocket.readyState === WebSocket.OPEN),
  }
}

async function runGtavWebhookTransportProbe(diagnostic) {
  const baseUrl = diagnostic?.probableHttpBaseUrl

  if (!baseUrl) {
    return { httpProbeSkipped: true }
  }

  const probeResults = {}

  for (const endpoint of ['/connection-info', '/commands']) {
    const probeUrl = `${baseUrl}${endpoint}`
    try {
      const response = await fetch(probeUrl, { method: 'GET' })
      const responseText = await response.text().catch(() => '')
      probeResults[endpoint] = {
        status: response.status,
        body: responseText.slice(0, 500),
      }
    } catch (error) {
      probeResults[endpoint] = {
        error: error.message,
      }
    }
  }

  return probeResults
}

function buildGtavWebhookCandidateRequest(pathname, command, payload, eventName) {
  const safePayload =
    payload === null || typeof payload === 'undefined'
      ? {}
      : payload

  return {
    command,
    payload: safePayload,
    actionName: eventName || command,
  }
}

function gtavWebhookCommandRequiresPayload(command) {
  return ['replace_vehicle', 'spawn_vehicle', 'toolup', 'props', 'parkour', 'maps'].includes(
    String(command || '').trim().toLowerCase(),
  )
}

function buildGtavWebhookPlaceholderContext(payload = {}, eventName = '') {
  const sourceEvent = payload?.sourceEvent || {}
  const nickname =
    sourceEvent?.uniqueId
    || sourceEvent?.userName
    || sourceEvent?.sourceLabel
    || sourceEvent?.displayText
    || 'unknown-user'

  return {
    nickname,
    username: nickname,
    uniqueId: sourceEvent?.uniqueId || nickname,
    userName: sourceEvent?.userName || nickname,
    sourceLabel: sourceEvent?.sourceLabel || nickname,
    displayText: sourceEvent?.displayText || '',
    comment: sourceEvent?.comment || '',
    giftName: sourceEvent?.giftName || '',
    giftCoins: sourceEvent?.giftCoins ?? 0,
    emoteName: sourceEvent?.emoteName || '',
    emoteId: sourceEvent?.emoteId || '',
    repeatCount: sourceEvent?.repeatCount ?? 1,
    likeCount: sourceEvent?.likeCount ?? 0,
    totalLikeCount: sourceEvent?.totalLikeCount ?? 0,
    eventName: payload?.actionName || eventName || '',
    command: payload?.gtaWebhookCommand || '',
  }
}

function resolveGtavWebhookPlaceholders(value, context) {
  if (typeof value === 'string') {
    return value.replace(/\{\{?\s*([a-zA-Z0-9_.-]+)\s*\}?\}/g, (match, key) => {
      if (!Object.prototype.hasOwnProperty.call(context, key)) {
        return match
      }

      const resolved = context[key]
      return resolved === null || typeof resolved === 'undefined' ? '' : String(resolved)
    })
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveGtavWebhookPlaceholders(entry, context))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        resolveGtavWebhookPlaceholders(entryValue, context),
      ]),
    )
  }

  return value
}

function normalizeGtavWebhookPayload(rawPayload, context) {
  const originalPayload = rawPayload
  let parsedPayload = rawPayload

  if (typeof parsedPayload === 'string') {
    const trimmedPayload = parsedPayload.trim()

    if (!trimmedPayload) {
      return {
        originalPayload,
        resolvedPayload: {},
      }
    }

    try {
      parsedPayload = JSON.parse(trimmedPayload)
    } catch {
      const placeholderOnlyMatch = trimmedPayload.match(/^\{\s*([a-zA-Z0-9_.-]+)\s*\}$/)
      if (placeholderOnlyMatch) {
        const key = placeholderOnlyMatch[1]
        const resolvedValue = Object.prototype.hasOwnProperty.call(context, key) ? context[key] : trimmedPayload
        return {
          originalPayload,
          resolvedPayload: {
            [key]: resolvedValue,
          },
        }
      }

      parsedPayload = trimmedPayload
    }
  }

  const resolvedPayload = resolveGtavWebhookPlaceholders(parsedPayload, context)

  return {
    originalPayload,
    resolvedPayload:
      resolvedPayload === null || typeof resolvedPayload === 'undefined' ? {} : resolvedPayload,
  }
}

function applyGtavWebhookCommandPayloadFallback(command, resolvedPayload) {
  const normalizedCommand = String(command || '').trim().toLowerCase()
  const safePayload =
    resolvedPayload && typeof resolvedPayload === 'object' && !Array.isArray(resolvedPayload)
      ? resolvedPayload
      : {}

  if (normalizedCommand === 'replace_vehicle' && Object.keys(safePayload).length === 0) {
    return {
      hash: '0x18606535',
    }
  }

  return resolvedPayload
}

async function discoverGtavWebhookExecutionRoute(baseUrl, command, payload, eventName) {
  const candidatePaths = ['/commands', '/command', '/execute', '/action', '/trigger', '/s4e-bridge']

  for (const pathname of candidatePaths) {
    const requestBody = buildGtavWebhookCandidateRequest(pathname, command, payload, eventName)
    const requestUrl = `${baseUrl}${pathname}`

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
      const responseText = await response.text().catch(() => '')

      console.log(
        `[gtavwebhook] probe POST ${pathname} -> ${response.status}${responseText ? ` ${responseText}` : ''}`,
      )

      if (response.ok) {
        return {
          url: requestUrl,
          pathname,
          body: requestBody,
          status: response.status,
          responseText,
        }
      }
    } catch (error) {
      console.log(`[gtavwebhook] probe POST ${pathname} -> ERR ${error.message}`)
    }
  }

  return null
}

function looksLikeGtavWebhookEvent(messagePayload) {
  const haystack = [
    messagePayload?.actionType,
    messagePayload?.actionName,
    messagePayload?.gtaChaosEffectId,
    messagePayload?.gtaChaosEffectName,
    messagePayload?.gtaWebhookCommand,
    messagePayload?.gtaWebhookPayload,
    messagePayload?.commandText,
    messagePayload?.rawCommandText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return GTAV_WEBHOOK_EVENT_HINTS.some((hint) => haystack.includes(hint))
}

function resolveGtaExecutionSystem(messagePayload, chaosModState) {
  const explicitType = String(messagePayload?.actionType || '').trim().toLowerCase()
  const exactChaosCatalog = readChaosModExactCatalog(chaosModState?.effectsFilePath)
  const exactChaosEntry =
    exactChaosCatalog.find((effect) => effect.id === messagePayload?.gtaChaosEffectId) || null
  const eventName =
    messagePayload?.actionName
    || messagePayload?.gtaChaosEffectName
    || messagePayload?.gtaChaosEffectId
    || 'evento-gta'

  if (explicitType === 'gtavwebhook') {
    return {
      system: 'gtavwebhook',
      eventName,
      chaosEntry: null,
    }
  }

  if (explicitType === 'chaosmod') {
    return {
      system: 'chaosmod',
      eventName,
      chaosEntry: exactChaosEntry,
    }
  }

  if (exactChaosEntry) {
    return {
      system: 'chaosmod',
      eventName,
      chaosEntry: exactChaosEntry,
    }
  }

  if (looksLikeGtavWebhookEvent(messagePayload)) {
    return {
      system: 'gtavwebhook',
      eventName,
      chaosEntry: null,
    }
  }

  return {
    system: 'chaosmod',
    eventName,
    chaosEntry: null,
  }
}

async function syncChaosModCatalog(serverBaseUrl, dashboardKey, payload) {
  const response = await fetch(`${serverBaseUrl}/api/integrations/chaosmod/catalog`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(dashboardKey ? { 'X-Live-Control-Key': dashboardKey } : {}),
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(`No pude sincronizar ChaosMod con el panel (${response.status}): ${responseText}`)
  }
}

function buildChaosModSyncTargets(bridgeConfig) {
  const targets = []
  const seenUrls = new Set()

  ;[
    { label: 'panel publico', baseUrl: bridgeConfig.serverBaseUrl },
    { label: 'panel local', baseUrl: bridgeConfig.localDashboardBaseUrl },
  ].forEach((target) => {
    const normalizedBaseUrl = normalizeBaseUrl(target.baseUrl)

    if (!normalizedBaseUrl || seenUrls.has(normalizedBaseUrl)) {
      return
    }

    seenUrls.add(normalizedBaseUrl)
    targets.push({
      ...target,
      baseUrl: normalizedBaseUrl,
    })
  })

  return targets
}

async function syncChaosModCatalogTargets(syncTargets, dashboardKey, payload, reason = 'sin motivo') {
  await Promise.all(
    syncTargets.map(async (target) => {
      try {
        await syncChaosModCatalog(target.baseUrl, dashboardKey, payload)
        console.log(
          `[chaosmod] catalogo sincronizado con ${target.label}: ${target.baseUrl} (${reason})`,
        )
      } catch (error) {
        console.error(
          `[chaosmod] no pude sincronizar el catalogo con ${target.label} (${target.baseUrl}) (${reason}): ${error.message}`,
        )
      }
    }),
  )
}

async function prepareChaosModCatalog(chaosModConfig) {
  if (!chaosModConfig.enabled) {
    return {
      catalog: [],
      sourcePath: '',
      effectsFilePath: '',
      processName: '',
      lastError: '',
    }
  }

  const resolvedRuntime = resolveChaosModRuntime(chaosModConfig)
  const normalizedModPath = resolvedRuntime.modPath
  const effectsFilePath = resolvedRuntime.effectsFilePath
  const configFilePath = resolvedRuntime.configFilePath
  if (!existsSync(effectsFilePath)) {
    return {
      catalog: [],
      sourcePath: normalizedModPath,
      effectsFilePath,
      processName: resolvedRuntime.processName,
      lastError: 'No encontre configs/effects.ini en la carpeta de ChaosMod.',
    }
  }

  if (chaosModConfig.autoEnableEffectMenu && existsSync(configFilePath)) {
    tryUpdateIniValue(configFilePath, 'EnableDebugMenu', 1, 'config.ini')
  }

  console.log(`[chaosmod] runtime elegido (${resolvedRuntime.label}): ${normalizedModPath}`)
  console.log(`[chaosmod] effects.ini encontrado en: ${effectsFilePath}`)

  const effectsIniText = readEffectsIniWithRetry(effectsFilePath)
  const exactCatalog = buildChaosModCatalogFromEffectsIni(effectsIniText)

  return {
    catalog: exactCatalog,
    menuCatalog: exactCatalog,
    sourcePath: normalizedModPath,
    effectsFilePath,
    processName: resolvedRuntime.processName,
    lastError: '',
  }
}

async function triggerChaosModDirectHttp(effectId) {
  const response = await fetch('http://localhost:8082/trigger_effect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Superdupertoken: 'glory to ukraine',
    },
    body: JSON.stringify({
      effect_id: effectId,
      sender: 'StreamToEarn',
    }),
  })

  if (!response.ok) {
    const responseText = await response.text().catch(() => '')
    throw new Error(
      `ChaosMod HTTP respondio ${response.status}${responseText ? `: ${responseText}` : ''}`,
    )
  }
}


async function main() {
  const bridgeConfig = readConfigFile()
  const minecraftServer = bridgeConfig.minecraft.enabled
    ? createLocalBridgeServer('minecraft', bridgeConfig.minecraft)
    : null
  const gtaServer = bridgeConfig.gta.enabled
    ? createLocalBridgeServer('gta', bridgeConfig.gta)
    : null
  const chaosModState = {
    catalog: [],
    menuCatalog: [],
    sourcePath: '',
    effectsFilePath: '',
    processName: bridgeConfig.chaosmod.gtaProcessName,
  }
  const s4eBridgeWs =
    bridgeConfig.s4eBridge.enabled ? createS4eBridgeWebSocketServer(bridgeConfig) : null
  const s4eBridgeHttp =
    bridgeConfig.s4eBridge.enabled ? createS4eBridgeHttpServer(bridgeConfig) : null

  const chaosModCatalogPayload = await prepareChaosModCatalog(bridgeConfig.chaosmod)
  chaosModState.catalog = chaosModCatalogPayload.catalog
  chaosModState.menuCatalog = chaosModCatalogPayload.menuCatalog
  chaosModState.sourcePath = chaosModCatalogPayload.sourcePath
  chaosModState.effectsFilePath = chaosModCatalogPayload.effectsFilePath
  chaosModState.processName = chaosModCatalogPayload.processName || bridgeConfig.chaosmod.gtaProcessName

  if (chaosModCatalogPayload.catalog.length > 0) {
    console.log(
      `[chaosmod] catalogo cargado (${chaosModCatalogPayload.catalog.length} efectos) desde ${chaosModCatalogPayload.sourcePath} usando proceso ${chaosModState.processName}`,
    )
  } else if (chaosModCatalogPayload.lastError) {
    console.log(`[chaosmod] ${chaosModCatalogPayload.lastError}`)
  }

  const syncTargets = buildChaosModSyncTargets(bridgeConfig)
  const syncPayload = {
    catalog: chaosModCatalogPayload.catalog,
    sourcePath: chaosModCatalogPayload.sourcePath,
    processName: chaosModState.processName,
    lastError: chaosModCatalogPayload.lastError,
  }
  let catalogSyncInFlight = null
  const syncChaosModCatalogNow = async (reason) => {
    if (catalogSyncInFlight) {
      return catalogSyncInFlight
    }

    catalogSyncInFlight = syncChaosModCatalogTargets(
      syncTargets,
      bridgeConfig.dashboardKey,
      syncPayload,
      reason,
    ).finally(() => {
      catalogSyncInFlight = null
    })

    return catalogSyncInFlight
  }

  await syncChaosModCatalogNow('arranque')

  const catalogResyncIntervalMs = Number(bridgeConfig.chaosmod.catalogResyncIntervalMs || 30000)
  const catalogResyncIntervalId =
    syncTargets.length > 0 && syncPayload.catalog.length > 0 && catalogResyncIntervalMs > 0
      ? setInterval(() => {
          void syncChaosModCatalogNow('resincronizacion periodica')
        }, catalogResyncIntervalMs)
      : null

  async function handleMinecraftMessage(message) {
    if (message.type !== 'minecraft-command') {
      return
    }

    console.log(
      `[remote:minecraft] ${message.payload.actionName} -> ${message.payload.commandText || 'sin commandText'}`,
    )

    minecraftServer?.clients.forEach((clientSocket) => {
      safeJsonSend(clientSocket, message)
    })

    if (
      bridgeConfig.minecraft.useRcon &&
      bridgeConfig.minecraft.rconPassword &&
      message.payload.rawCommandText
    ) {
      try {
        const rcon = await ensureMinecraftRcon(bridgeConfig.minecraft)
        const response = await rcon.send(normalizeMinecraftCommand(message.payload.rawCommandText))
        console.log(`[rcon:minecraft] comando ejecutado: ${response || 'sin respuesta'}`)
      } catch (error) {
        console.error(`[rcon:minecraft] error: ${error.message}`)
      }
    }
  }

  async function executeChaosModEffect(messagePayload) {
    if (!bridgeConfig.chaosmod.enabled) {
      throw new Error('ChaosMod desactivado en bridge-config.json.')
    }

    if (!messagePayload.gtaChaosEffectId) {
      throw new Error('No llego gtaChaosEffectId en el evento de GTA.')
    }

    const currentEffectsIniText =
      chaosModState.effectsFilePath && existsSync(chaosModState.effectsFilePath)
        ? readEffectsIniWithRetry(chaosModState.effectsFilePath)
        : ''
    const exactCatalog = currentEffectsIniText ? buildChaosModCatalogFromEffectsIni(currentEffectsIniText) : []
    const resolvedSlot = exactCatalog.findIndex((effect) => effect.id === messagePayload.gtaChaosEffectId)
    const resolvedEntry = resolvedSlot >= 0 ? exactCatalog[resolvedSlot] : null
    const resolvedName = resolvedEntry?.name || messagePayload.gtaChaosEffectId

    console.log(`[chaosmod] indice: ${resolvedSlot >= 0 ? resolvedSlot : 'n/a'}`)
    console.log(`[chaosmod] effectId: ${messagePayload.gtaChaosEffectId}`)
    console.log(`[chaosmod] nombre: ${resolvedName}`)

    if (resolvedSlot < 0) {
      throw new Error(`No encontre ${messagePayload.gtaChaosEffectId} en effects.ini.`)
    }

    try {
      await triggerChaosModDirectHttp(messagePayload.gtaChaosEffectId)
      console.log('[chaosmod] metodo usado: direct')
      return 'direct'
    } catch (directError) {
      console.error(`[chaosmod] direct fallo: ${directError.message}`)
      throw new Error(
        `No pude disparar el efecto exacto ${messagePayload.gtaChaosEffectId} por HTTP directo.`,
      )
    }
  }

async function executeViaWebhook(effectId, payload) {
  const diagnostic = inspectGtavWebhookRuntime(chaosModState, bridgeConfig)
  const command =
    String(payload?.gtaWebhookCommand || effectId || payload?.rawCommandText || '').trim()
    || 'evento-gta'
  const eventName =
    payload?.actionName || payload?.gtaChaosEffectName || command || payload?.gtaMode || 'evento-gta'
  const configuredUrl = String(
    payload?.gtavWebhookUrl
    || runtimeProcess.env.LIVE_CONTROL_GTAV_WEBHOOK_URL
    || `${diagnostic.probableHttpBaseUrl}/s4e-bridge`,
  ).trim()
  const placeholderContext = buildGtavWebhookPlaceholderContext(payload, eventName)
  const { originalPayload, resolvedPayload: normalizedPayload } = normalizeGtavWebhookPayload(
    payload?.gtaWebhookPayload || null,
    placeholderContext,
  )
  const resolvedPayload = applyGtavWebhookCommandPayloadFallback(command, normalizedPayload)

  const requestPayload = {
    actionType: payload?.actionType || 'gtavwebhook',
    eventName,
    command,
    effectId: effectId || null,
    payload: resolvedPayload,
    gtaMode: payload?.gtaMode || null,
  }

    console.log(`[gtavwebhook] payload original: ${JSON.stringify(originalPayload)}`)
    console.log(`[gtavwebhook] payload resuelto: ${JSON.stringify(resolvedPayload)}`)
    console.log(`[gtavwebhook] request enviada: ${JSON.stringify(requestPayload)}`)

    if (String(command).trim().toLowerCase() === 'replace_vehicle') {
      const executorUrl = 'http://127.0.0.1:3095/commands'
      const executorBody = {
        command: 'replace_vehicle',
        actionName: eventName,
        payload: resolvedPayload,
      }

      console.log(`[gta-executor] request enviada: POST ${executorUrl} ${JSON.stringify(executorBody)}`)

      const executorResponse = await fetch(executorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(executorBody),
      })
      const executorResponseText = await executorResponse.text().catch(() => '')

      console.log(
        `[gta-executor] status: ${executorResponse.status}${executorResponseText ? ` body: ${executorResponseText}` : ''}`,
      )

      if (!executorResponse.ok) {
        throw new Error(
          `Executor local respondio ${executorResponse.status}${executorResponseText ? `: ${executorResponseText}` : ''}`,
        )
      }

      return 'local-executor-http'
    }

    const discoveredRoute = await discoverGtavWebhookExecutionRoute(
      diagnostic.probableHttpBaseUrl,
      command,
      resolvedPayload,
      eventName,
    )
    const finalUrl = discoveredRoute?.url || configuredUrl
    const finalPathname = discoveredRoute?.pathname || parseUrl(finalUrl).pathname || '/s4e-bridge'
    const finalBody =
      discoveredRoute?.body
      || buildGtavWebhookCandidateRequest(finalPathname, command, resolvedPayload, eventName)

    if (
      gtavWebhookCommandRequiresPayload(command)
      && finalBody?.payload
      && typeof finalBody.payload === 'object'
      && !Array.isArray(finalBody.payload)
      && Object.keys(finalBody.payload).length === 0
    ) {
      throw new Error(`GTAVWebhook requiere payload para ${command}, pero llego vacio.`)
    }

    console.log(`[gtavwebhook] body final enviado a ${finalPathname}: ${JSON.stringify(finalBody)}`)

    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(finalBody),
    })
    const responseText = await response.text().catch(() => '')

    console.log(
      `[gtavwebhook] POST ${finalPathname} -> ${response.status}${responseText ? ` ${responseText}` : ''}`,
    )

    if (!response.ok) {
      throw new Error(`GTAVWebhook respondio ${response.status}${responseText ? `: ${responseText}` : ''}`)
    }

    return 'http'
  }

  async function handleGtaMessage(message) {
    if (message.type !== 'gta-event') {
      return
    }

    console.log(`\n${'═'.repeat(80)}`)
    console.log(`[bridge:gta] 📥 RECIBIÓ EVENTO GTA`)
    console.log(`[bridge:gta] Acción: ${message.payload.actionName}`)
    console.log(`[bridge:gta] Effect ID: ${message.payload.gtaChaosEffectId}`)
    console.log(`[bridge:gta] Effect Name: ${message.payload.gtaChaosEffectName}`)
    console.log(`[bridge:gta] Mode: ${message.payload.gtaMode}`)
    console.log(`[bridge:gta] Reenviando a ${gtaServer?.clients.size || 0} clientes GTA locales conectados`)
    console.log(`${'═'.repeat(80)}\n`)

    gtaServer?.clients.forEach((clientSocket) => {
      safeJsonSend(clientSocket, message)
    })

    const executionTarget = resolveGtaExecutionSystem(message.payload, chaosModState)
    console.log(`[bridge:gta] sistema elegido: ${executionTarget.system}`)
    console.log(`[bridge:gta] nombre del evento: ${executionTarget.eventName}`)
    console.log(`[bridge:gta] tipo de acción ejecutada: ${message.payload.actionType || 'legacy'}`)
    console.log(
      `[bridge:gta] comando enviado: ${
        message.payload.gtaWebhookCommand
        || message.payload.gtaChaosEffectId
        || message.payload.rawCommandText
        || 'n/a'
      }`,
    )

    try {
      let finalMethod = 'none'

      if (executionTarget.system === 'chaosmod') {
        finalMethod = await executeChaosModEffect(message.payload)
      } else if (executionTarget.system === 'gtavwebhook') {
        finalMethod = await executeViaWebhook(
          message.payload.gtaWebhookCommand || message.payload.gtaChaosEffectId || executionTarget.eventName,
          message.payload,
        )
      }

      console.log(`[bridge:gta] metodo final: ${finalMethod}`)
    } catch (error) {
      console.error(`[${executionTarget.system}] error al activar evento: ${error.message}`)
    }
  }

  const remoteMinecraftUrl = buildWebSocketUrl(
    bridgeConfig.serverBaseUrl,
    '/ws/minecraft',
    bridgeConfig.dashboardKey,
  )
  const remoteGtaUrl = buildWebSocketUrl(
    bridgeConfig.serverBaseUrl,
    '/ws/gta',
    bridgeConfig.dashboardKey,
  )

  const stopMinecraft = connectRemoteChannel(
    'minecraft',
    remoteMinecraftUrl,
    handleMinecraftMessage,
    Number(bridgeConfig.reconnectDelayMs || 2500),
    () => syncChaosModCatalogNow('reconexion remota'),
  )
  const stopGta = connectRemoteChannel(
    'gta',
    remoteGtaUrl,
    handleGtaMessage,
    Number(bridgeConfig.reconnectDelayMs || 2500),
    () => syncChaosModCatalogNow('reconexion remota'),
  )

  console.log(`\n[bridge] 📋 Configuración cargada:`)
  console.log(`[bridge] Archivo: ${CONFIG_PATH}`)
  
  const isLocalBackend = bridgeConfig.serverBaseUrl.includes('127.0.0.1') || bridgeConfig.serverBaseUrl.includes('localhost')
  if (isLocalBackend) {
    console.log(`[bridge] 🟢 Modo DESARROLLO: Conectando a backend local`)
    console.log(`[bridge]    Backend: ${bridgeConfig.serverBaseUrl}`)
  } else {
    console.log(`[bridge] 🔵 Modo PRODUCCIÓN: Conectando a backend remoto`)
    console.log(`[bridge]    Backend: ${bridgeConfig.serverBaseUrl}`)
  }
  
  if (bridgeConfig.localDashboardBaseUrl) {
    console.log(`[bridge] Panel local: ${bridgeConfig.localDashboardBaseUrl}`)
  }
  console.log('[bridge] Esperando eventos de Minecraft y GTA...\n')

  const shutdown = async () => {
    stopMinecraft()
    stopGta()
    clearInterval(catalogResyncIntervalId)
    minecraftServer?.server.close()
    gtaServer?.server.close()
    s4eBridgeWs?.close()
    s4eBridgeHttp?.close()

    if (minecraftRcon) {
      try {
        await minecraftRcon.end()
      } catch {
        // noop
      }
    }

    runtimeProcess.exit(0)
  }

  runtimeProcess.on('SIGINT', shutdown)
  runtimeProcess.on('SIGTERM', shutdown)
  runtimeProcess.stdin.resume()
}

main().catch((error) => {
  console.error(`[bridge] ${error.message}`)
  runtimeProcess.exit(1)
})
