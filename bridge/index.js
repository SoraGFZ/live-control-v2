import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import { Rcon } from 'rcon-client'
import {
  buildWebSocketUrl,
  LOCAL_BRIDGE_DEFAULTS,
  normalizeBaseUrl,
} from '../src/live-control.js'

const runtimeProcess = globalThis.process
const CONFIG_PATH = path.join(runtimeProcess.cwd(), 'bridge-config.json')

const DEFAULT_CONFIG = {
  serverBaseUrl: 'https://TU-APP.up.railway.app',
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

async function main() {
  const bridgeConfig = readConfigFile()
  const minecraftServer = bridgeConfig.minecraft.enabled
    ? createLocalBridgeServer('minecraft', bridgeConfig.minecraft)
    : null
  const gtaServer = bridgeConfig.gta.enabled
    ? createLocalBridgeServer('gta', bridgeConfig.gta)
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
      message.payload.commandText
    ) {
      try {
        const rcon = await ensureMinecraftRcon(bridgeConfig.minecraft)
        const response = await rcon.send(message.payload.commandText)
        console.log(`[rcon:minecraft] comando ejecutado: ${response || 'sin respuesta'}`)
      } catch (error) {
        console.error(`[rcon:minecraft] error: ${error.message}`)
      }
    }
  }

  async function handleGtaMessage(message) {
    if (message.type !== 'gta-event') {
      return
    }

    console.log(`[remote:gta] ${message.payload.actionName} -> ${message.payload.commandText || 'sin payload'}`)

    gtaServer?.clients.forEach((clientSocket) => {
      safeJsonSend(clientSocket, message)
    })
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
  console.log('[bridge] listo para recibir acciones de Minecraft y GTA')

  const shutdown = async () => {
    stopMinecraft()
    stopGta()
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
