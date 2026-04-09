import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import { Rcon } from 'rcon-client'
import { buildChaosModCatalog, CHAOSMOD_EFFECTS_SOURCE_URL } from '../src/chaosmod.js'
import {
  buildWebSocketUrl,
  LOCAL_BRIDGE_DEFAULTS,
  normalizeBaseUrl,
} from '../src/live-control.js'

const runtimeProcess = globalThis.process
const projectRoot = runtimeProcess.cwd()
const CONFIG_PATH = path.join(projectRoot, 'bridge-config.json')
const CHAOSMOD_ACTIVATOR_PATH = path.join(projectRoot, 'bridge', 'activate-chaosmod-effect.ps1')
const CHAOSMOD_DEBUG_SOCKET_FEATURE_FLAG = '.enabledebugsocket'

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
    modPath: 'C:\\Program Files\\Epic Games\\GTAV\\chaosmod',
    autoEnableEffectMenu: true,
    autoEnableDebugSocket: true,
    preferDirectSocket: true,
    allowMenuFallback: false,
    assumeTopSelectionOnStartup: true,
    gtaProcessName: 'GTA5',
    debugSocketPort: 31819,
    debugSocketReconnectDelayMs: 3000,
    menuOpenDelayMs: 220,
    keyDelayMs: 35,
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
  const normalizedBaseUrl = normalizeBaseUrl(parsedConfig.serverBaseUrl)

  if (!normalizedBaseUrl || normalizedBaseUrl.includes('TU-APP.up.railway.app')) {
    throw new Error(
      'bridge-config.json necesita una serverBaseUrl real de Railway antes de arrancar.',
    )
  }

  return {
    ...parsedConfig,
    serverBaseUrl: normalizedBaseUrl,
    localDashboardBaseUrl: normalizeBaseUrl(parsedConfig.localDashboardBaseUrl),
    dashboardKey: String(parsedConfig.dashboardKey || '').trim(),
  }
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

function connectRemoteChannel(channelName, url, onMessage, reconnectDelayMs) {
  let socket = null
  let reconnectTimeoutId = null
  let isStopped = false

  function scheduleReconnect() {
    if (isStopped) {
      return
    }

    reconnectTimeoutId = setTimeout(connect, reconnectDelayMs)
  }

  function connect() {
    console.log(`[remote:${channelName}] conectando a ${url}`)
    socket = new WebSocket(url)

    socket.on('open', () => {
      console.log(`[remote:${channelName}] conectado`)
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
      console.log(`[remote:${channelName}] desconectado, reintentando...`)
      scheduleReconnect()
    })

    socket.on('error', (error) => {
      console.error(`[remote:${channelName}] error: ${error.message}`)
      socket.close()
    })
  }

  connect()

  return () => {
    isStopped = true
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

function ensureFeatureFlagFile(directoryPath, featureFlagName) {
  const featureFlagPath = path.join(directoryPath, featureFlagName)

  if (!existsSync(featureFlagPath)) {
    writeFileSync(featureFlagPath, '', 'utf8')
  }

  return featureFlagPath
}

async function fetchChaosModEffectsSource() {
  const response = await fetch(CHAOSMOD_EFFECTS_SOURCE_URL, {
    headers: {
      'User-Agent': 'live-control-app-chaosmod-bridge',
    },
  })

  if (!response.ok) {
    throw new Error(`No pude descargar el catalogo oficial (${response.status}).`)
  }

  return response.text()
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

async function prepareChaosModCatalog(chaosModConfig) {
  if (!chaosModConfig.enabled) {
    return {
      catalog: [],
      sourcePath: '',
      lastError: '',
    }
  }

  const normalizedModPath = path.resolve(String(chaosModConfig.modPath || '').trim())
  const effectsFilePath = path.join(normalizedModPath, 'configs', 'effects.ini')
  const configFilePath = path.join(normalizedModPath, 'configs', 'config.ini')

  if (!existsSync(effectsFilePath)) {
    return {
      catalog: [],
      sourcePath: normalizedModPath,
      lastError: 'No encontre configs/effects.ini en la carpeta de ChaosMod.',
    }
  }

  if (chaosModConfig.autoEnableEffectMenu && existsSync(configFilePath)) {
    updateIniValue(configFilePath, 'EnableDebugMenu', 1)
  }

  if (chaosModConfig.autoEnableDebugSocket) {
    ensureFeatureFlagFile(normalizedModPath, CHAOSMOD_DEBUG_SOCKET_FEATURE_FLAG)
  }

  const effectsIniText = readFileSync(effectsFilePath, 'utf8')
  let effectsSourceText = ''
  let lastError = ''

  try {
    effectsSourceText = await fetchChaosModEffectsSource()
  } catch (error) {
    lastError = `No pude bajar el catalogo oficial; usare nombres de respaldo. ${error.message}`
  }

  return {
    catalog: buildChaosModCatalog(effectsIniText, effectsSourceText),
    sourcePath: normalizedModPath,
    lastError,
  }
}

function getShortestMove(currentIndex, targetIndex, totalItems) {
  const normalizedTotal = Number(totalItems || 0)

  if (normalizedTotal <= 1 || currentIndex === targetIndex) {
    return {
      direction: 'down',
      count: 0,
    }
  }

  const moveDown = (targetIndex - currentIndex + normalizedTotal) % normalizedTotal
  const moveUp = (currentIndex - targetIndex + normalizedTotal) % normalizedTotal

  if (moveUp < moveDown) {
    return {
      direction: 'up',
      count: moveUp,
    }
  }

  return {
    direction: 'down',
    count: moveDown,
  }
}

function runPowerShellChaosModActivator({
  direction,
  keyDelayMs,
  menuOpenDelayMs,
  moveCount,
  processName,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        CHAOSMOD_ACTIVATOR_PATH,
        '-ProcessName',
        processName,
        '-Direction',
        direction,
        '-MoveCount',
        String(moveCount),
        '-OpenDelayMs',
        String(menuOpenDelayMs),
        '-KeyDelayMs',
        String(keyDelayMs),
      ],
      {
        windowsHide: true,
      },
    )
    let stderr = ''

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(stderr.trim() || `El activador de ChaosMod salio con codigo ${code}.`))
    })
  })
}

function createChaosModDebugSocketClient(chaosModConfig) {
  const socketUrl = `ws://127.0.0.1:${Number(chaosModConfig.debugSocketPort || 31819)}`
  let socket = null
  let reconnectTimeoutId = null
  let isStopped = false
  let hasLoggedFallback = false
  const state = {
    connected: false,
    lastError: '',
  }

  function scheduleReconnect() {
    if (isStopped) {
      return
    }

    reconnectTimeoutId = setTimeout(connect, Number(chaosModConfig.debugSocketReconnectDelayMs || 3000))
  }

  function connect() {
    socket = new WebSocket(socketUrl)

    socket.on('open', () => {
      state.connected = true
      state.lastError = ''
      hasLoggedFallback = false
      console.log(`[chaosmod] debug socket conectado en ${socketUrl}`)
    })

    socket.on('close', () => {
      state.connected = false

      if (!hasLoggedFallback) {
        const fallbackMessage = chaosModConfig.allowMenuFallback
          ? '[chaosmod] debug socket no disponible; usare el menu visual como fallback hasta que recargues el mod.'
          : '[chaosmod] debug socket no disponible; las acciones de ChaosMod quedaran pausadas hasta que recargues el mod o reinicies GTA.'
        console.log(fallbackMessage)
        hasLoggedFallback = true
      }

      scheduleReconnect()
    })

    socket.on('error', (error) => {
      state.lastError = error.message
      state.connected = false
      socket.close()
    })
  }

  connect()

  return {
    triggerEffect(effectId) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            command: 'trigger_effect',
            effect_id: effectId,
          }),
        )
        return true
      }

      state.connected = false
      return false
    },
    isConnected() {
      return state.connected
    },
    getLastError() {
      return state.lastError
    },
    stop() {
      isStopped = true
      clearTimeout(reconnectTimeoutId)
      socket?.close()
    },
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
    sourcePath: '',
    selectedIndex: bridgeConfig.chaosmod.assumeTopSelectionOnStartup ? 0 : null,
  }
  const chaosModDebugSocket =
    bridgeConfig.chaosmod.enabled && bridgeConfig.chaosmod.preferDirectSocket
      ? createChaosModDebugSocketClient(bridgeConfig.chaosmod)
      : null

  const chaosModCatalogPayload = await prepareChaosModCatalog(bridgeConfig.chaosmod)
  chaosModState.catalog = chaosModCatalogPayload.catalog
  chaosModState.sourcePath = chaosModCatalogPayload.sourcePath

  if (chaosModCatalogPayload.catalog.length > 0) {
    console.log(
      `[chaosmod] catalogo cargado (${chaosModCatalogPayload.catalog.length} efectos) desde ${chaosModCatalogPayload.sourcePath}`,
    )
  } else if (chaosModCatalogPayload.lastError) {
    console.log(`[chaosmod] ${chaosModCatalogPayload.lastError}`)
  }

  const syncTargets = buildChaosModSyncTargets(bridgeConfig)
  const syncPayload = {
    catalog: chaosModCatalogPayload.catalog,
    sourcePath: chaosModCatalogPayload.sourcePath,
    lastError: chaosModCatalogPayload.lastError,
  }

  await Promise.all(
    syncTargets.map(async (target) => {
      try {
        await syncChaosModCatalog(target.baseUrl, bridgeConfig.dashboardKey, syncPayload)
        console.log(`[chaosmod] catalogo sincronizado con ${target.label}: ${target.baseUrl}`)
      } catch (error) {
        console.error(
          `[chaosmod] no pude sincronizar el catalogo con ${target.label} (${target.baseUrl}): ${error.message}`,
        )
      }
    }),
  )

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
        const response = await rcon.send(message.payload.rawCommandText)
        console.log(`[rcon:minecraft] comando ejecutado: ${response || 'sin respuesta'}`)
      } catch (error) {
        console.error(`[rcon:minecraft] error: ${error.message}`)
      }
    }
  }

  async function executeChaosModEffect(messagePayload) {
    if (!bridgeConfig.chaosmod.enabled) {
      throw new Error('ChaosMod esta desactivado en bridge-config.json.')
    }

    if (!messagePayload.gtaChaosEffectId) {
      throw new Error('No llego gtaChaosEffectId en el evento de GTA.')
    }

    if (chaosModDebugSocket?.triggerEffect(messagePayload.gtaChaosEffectId)) {
      console.log(
        `[chaosmod] efecto disparado por debug socket: ${messagePayload.gtaChaosEffectName || messagePayload.gtaChaosEffectId}`,
      )
      return
    }

    if (bridgeConfig.chaosmod.preferDirectSocket && !bridgeConfig.chaosmod.allowMenuFallback) {
      const lastSocketError = chaosModDebugSocket?.getLastError()
      throw new Error(
        `El debug socket de ChaosMod no esta disponible. Recarga el mod o reinicia GTA para habilitar el disparo directo.${lastSocketError ? ` Ultimo error: ${lastSocketError}` : ''}`,
      )
    }

    const targetIndex = chaosModState.catalog.findIndex(
      (effect) => effect.id === messagePayload.gtaChaosEffectId,
    )

    if (targetIndex === -1) {
      throw new Error(
        `No encontre el efecto ${messagePayload.gtaChaosEffectId} dentro del catalogo local de ChaosMod.`,
      )
    }

    if (chaosModState.selectedIndex === null) {
      throw new Error(
        'La seleccion actual del menu de ChaosMod no esta sincronizada. Reinicia el bridge o recarga el mod para arrancar desde arriba.',
      )
    }

    const move = getShortestMove(
      chaosModState.selectedIndex,
      targetIndex,
      chaosModState.catalog.length,
    )

    await runPowerShellChaosModActivator({
      processName: bridgeConfig.chaosmod.gtaProcessName,
      direction: move.direction,
      moveCount: move.count,
      menuOpenDelayMs: Number(bridgeConfig.chaosmod.menuOpenDelayMs || 220),
      keyDelayMs: Number(bridgeConfig.chaosmod.keyDelayMs || 35),
    })

    chaosModState.selectedIndex = targetIndex
    console.log(
      `[chaosmod] efecto disparado: ${messagePayload.gtaChaosEffectName || messagePayload.gtaChaosEffectId}`,
    )
  }

  async function handleGtaMessage(message) {
    if (message.type !== 'gta-event') {
      return
    }

    console.log(`[remote:gta] ${message.payload.actionName} -> ${message.payload.commandText || 'sin payload'}`)

    gtaServer?.clients.forEach((clientSocket) => {
      safeJsonSend(clientSocket, message)
    })

    if (message.payload.gtaMode === 'chaosmod') {
      try {
        await executeChaosModEffect(message.payload)
      } catch (error) {
        console.error(`[chaosmod] error al activar efecto: ${error.message}`)
      }
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
  )
  const stopGta = connectRemoteChannel(
    'gta',
    remoteGtaUrl,
    handleGtaMessage,
    Number(bridgeConfig.reconnectDelayMs || 2500),
  )

  console.log(`[bridge] config cargada desde ${CONFIG_PATH}`)
  console.log(`[bridge] backend publico: ${bridgeConfig.serverBaseUrl}`)
  if (bridgeConfig.localDashboardBaseUrl) {
    console.log(`[bridge] panel local: ${bridgeConfig.localDashboardBaseUrl}`)
  }
  console.log('[bridge] listo para recibir acciones de Minecraft y GTA')

  const shutdown = async () => {
    stopMinecraft()
    stopGta()
    chaosModDebugSocket?.stop()
    minecraftServer?.server.close()
    gtaServer?.server.close()

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
