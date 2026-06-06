import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

class StreamdeckIntegrationService extends EventEmitter {
  constructor() {
    super()
    this.server = null
    this.httpServer = null
    this.clients = new Set()
    this.config = { port: 9091, host: '127.0.0.1' }
    this.lastError = ''
    this.getActionsList = () => []
    this.executeActionById = async () => ({ ok: false })
  }

  getStatus() {
    return {
      type: 'streamdeck',
      running: Boolean(this.server),
      clients: this.clients.size,
      port: this.config.port,
      host: this.config.host,
      lastError: this.lastError,
    }
  }

  configure({ getActionsList, executeActionById } = {}) {
    if (typeof getActionsList === 'function') {
      this.getActionsList = getActionsList
    }
    if (typeof executeActionById === 'function') {
      this.executeActionById = executeActionById
    }
  }

  start(config = {}) {
    if (this.server) {
      return { ok: true, status: this.getStatus() }
    }

    this.config = {
      port: Number(config.port || this.config.port) || 9091,
      host: String(config.host || this.config.host) || '127.0.0.1',
    }
    this.lastError = ''

    try {
      const httpServer = createServer()
      this.httpServer = httpServer

      httpServer.on('error', (error) => {
        this.lastError = error?.message || 'Error en hub StreamDeck'
        console.warn('[streamdeck]', this.lastError)
        this.stop()
        this.emit('status', this.getStatus())
      })

      this.server = new WebSocketServer({ server: httpServer })

      this.server.on('error', (error) => {
        this.lastError = error?.message || 'Error en hub StreamDeck'
        console.warn('[streamdeck]', this.lastError)
        this.stop()
        this.emit('status', this.getStatus())
      })

      httpServer.listen(this.config.port, this.config.host)

      this.server.on('connection', (socket) => {
        this.clients.add(socket)

        socket.send(
          JSON.stringify({
            type: 'welcome',
            message: 'Live Control Studio — StreamDeck',
            version: '1.0',
            capabilities: ['execute_action', 'get_actions_list'],
          }),
        )

        socket.on('message', async (raw) => {
          let message

          try {
            message = JSON.parse(raw.toString())
          } catch {
            return
          }

          await this._handleClientMessage(socket, message)
        })

        socket.on('close', () => {
          this.clients.delete(socket)
          this.emit('status', this.getStatus())
        })
      })

      this.emit('status', this.getStatus())
      return { ok: true, status: this.getStatus() }
    } catch (error) {
      return { ok: false, error: error?.message || 'No se pudo iniciar StreamDeck hub' }
    }
  }

  stop() {
    for (const socket of this.clients) {
      try {
        socket.terminate()
      } catch {
        // ignore
      }
    }

    this.clients.clear()

    if (this.server) {
      try {
        this.server.close()
      } catch {
        // ignore
      }
      this.server = null
    }

    if (this.httpServer) {
      try {
        this.httpServer.close()
      } catch {
        // ignore
      }
      this.httpServer = null
    }

    this.emit('status', this.getStatus())
    return { ok: true }
  }

  async _handleClientMessage(socket, message) {
    const { type, action, data } = message

    if (type === 'get_actions_list' || action === 'get_actions_list') {
      const actions = this.getActionsList().map((entry) => ({
        id: entry.id,
        name: entry.name,
      }))

      socket.send(JSON.stringify({ type: 'actions_list', data: actions }))
      return
    }

    if (type === 'execute_action' || action === 'execute_action') {
      const actionId = data?.actionId || data?.id || message.actionId
      const result = await this.executeActionById(actionId)
      socket.send(JSON.stringify({ type: 'action_executed', actionId, result }))
    }
  }
}

export const streamdeckIntegration = new StreamdeckIntegrationService()