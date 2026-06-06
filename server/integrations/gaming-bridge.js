import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import dgram from 'node:dgram'
import net from 'node:net'
import { fetchTikcontrolGamesManifest } from '../tikcontrol-games-cloud.js'

function readCachedGameMeta(gameId) {
  try {
    const base =
      process.env.LIVE_CONTROL_GAMES_CACHE
      || path.join(process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'), 'live-control-app', 'games-cache')
    const safeId = String(gameId || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-')
    const metaPath = path.join(base, 'games', safeId, 'game-meta.json')

    if (!fs.existsSync(metaPath)) {
      return null
    }

    return JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  } catch {
    return null
  }
}

function sendUdp(host, port, payload) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4')
    const buffer = Buffer.from(payload, 'utf8')

    client.send(buffer, port, host, (error) => {
      client.close()
      if (error) {
        reject(error)
      } else {
        resolve({ protocol: 'udp', host, port, bytes: buffer.length })
      }
    })
  })
}

function sendTcp(host, port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write(payload)
      socket.end()
      resolve({ protocol: 'tcp', host, port, bytes: Buffer.byteLength(payload) })
    })

    socket.setTimeout(5000, () => {
      socket.destroy(new Error('Timeout TCP gaming'))
    })
    socket.on('error', reject)
  })
}

export async function resolveGamePort(gameId) {
  try {
    const manifest = await fetchTikcontrolGamesManifest()
    const cloudGame = (manifest.games || []).find((game) => game.id === gameId)
    return {
      port: Number(cloudGame?.port || 0),
      protocol: String(cloudGame?.protocol || 'udp').toLowerCase(),
      name: cloudGame?.name || gameId,
    }
  } catch {
    return { port: 0, protocol: 'udp', name: gameId }
  }
}

export async function sendGameBridgeCommand({
  gameId = '',
  commandText = '',
  port = 0,
  protocol = '',
  host = '127.0.0.1',
} = {}) {
  const text = String(commandText || '').trim()

  if (!text) {
    throw new Error('Comando de juego vacio')
  }

  let resolvedPort = Number(port) || 0
  let resolvedProtocol = String(protocol || '').toLowerCase()

  if (!resolvedPort && gameId) {
    const cached = readCachedGameMeta(gameId)
    if (cached?.port) {
      resolvedPort = Number(cached.port) || 0
      resolvedProtocol = resolvedProtocol || String(cached.protocol || 'udp').toLowerCase()
    }

    if (!resolvedPort) {
      const meta = await resolveGamePort(gameId)
      resolvedPort = meta.port
      resolvedProtocol = resolvedProtocol || meta.protocol
    }
  }

  const payload = text.endsWith('\n') ? text : `${text}\n`

  if (resolvedPort > 0) {
    if (resolvedProtocol.includes('tcp')) {
      return sendTcp(host, resolvedPort, payload)
    }
    return sendUdp(host, resolvedPort, payload)
  }

  return {
    protocol: 'bridge-only',
    warning: 'Juego sin puerto en manifest; usa bridge Minecraft/GTA o configura el mod local.',
    commandText: text,
  }
}