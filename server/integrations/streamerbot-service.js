import { EventEmitter } from 'node:events'
import WebSocket from 'ws'

class StreamerbotIntegrationService extends EventEmitter {
  constructor() {
    super()
    this.ws = null
    this.connected = false
    this.authenticated = false
    this.lastError = ''
    this.config = {
      url: 'ws://127.0.0.1:8080',
      password: '',
    }
    this.resources = { actions: [] }
    this._reqId = 0
    this._pending = new Map()
  }

  getStatus() {
    return {
      type: 'streamerbot',
      connected: this.connected,
      authenticated: this.authenticated,
      lastError: this.lastError,
      config: { ...this.config, password: this.config.password ? '***' : '' },
      actionCount: this.resources.actions.length,
    }
  }

  getResources() {
    return this.resources
  }

  _nextId(prefix) {
    this._reqId += 1
    return `${prefix}-${this._reqId}`
  }

  connect(config = {}) {
    if (typeof config === 'string') {
      config = { url: config }
    }

    if (config.port && !config.url) {
      config.url = `ws://127.0.0.1:${config.port}`
    }

    this.config = {
      url: String(config.url || this.config.url).trim() || 'ws://127.0.0.1:8080',
      password: String(config.password || ''),
    }

    if (this.connected) {
      return this.disconnect().then(() => this.connect(this.config))
    }

    return new Promise((resolve) => {
      let settled = false
      const finish = (result) => {
        if (settled) {
          return
        }
        settled = true
        resolve(result)
      }

      const connectionTimeout = setTimeout(() => {
        this.lastError = 'Timeout conectando a Streamer.bot'
        this._closeSocket()
        finish({ ok: false, error: this.lastError })
      }, 6000)

      try {
        this.ws = new WebSocket(this.config.url)

        this.ws.on('open', () => {
          this.connected = true
          this.lastError = ''
          this._send({ request: 'GetActions', id: this._nextId('lcs-validate') })

          const validationTimeout = setTimeout(() => {
            clearTimeout(connectionTimeout)
            this.authenticated = !this.config.password
            if (!this.config.password) {
              this._postAuth()
            }
            finish({ ok: true, status: this.getStatus() })
          }, 4000)

          const onMessage = (data) => {
            try {
              const message = JSON.parse(data.toString())
              if (message.id?.includes('lcs-validate') || message.actions) {
                clearTimeout(validationTimeout)
                clearTimeout(connectionTimeout)
                this.ws?.off('message', onMessage)
                if (this.config.password) {
                  this._send({
                    request: 'Authenticate',
                    id: this._nextId('lcs-auth'),
                    password: this.config.password,
                  })
                } else {
                  this.authenticated = true
                  this._postAuth()
                }
                finish({ ok: true, status: this.getStatus() })
              }
            } catch {
              // ignore
            }
          }

          this.ws.on('message', onMessage)
        })

        this.ws.on('close', () => {
          this.connected = false
          this.authenticated = false
          this.emit('status', this.getStatus())
        })

        this.ws.on('error', (error) => {
          this.lastError = error?.message || 'Error WebSocket Streamer.bot'
          finish({ ok: false, error: this.lastError })
        })

        this.ws.on('message', (data) => this._handleMessage(data))
      } catch (error) {
        clearTimeout(connectionTimeout)
        this.lastError = error?.message || 'No se pudo abrir WebSocket'
        finish({ ok: false, error: this.lastError })
      }
    })
  }

  disconnect() {
    try {
      this.ws?.close()
    } catch {
      // ignore
    }

    this._closeSocket()
    return Promise.resolve({ ok: true, status: this.getStatus() })
  }

  _closeSocket() {
    this.ws = null
    this.connected = false
    this.authenticated = false
    this.emit('status', this.getStatus())
  }

  _postAuth() {
    this._enumerateActions()
    this.emit('status', this.getStatus())
  }

  _send(payload) {
    if (!this.connected || !this.ws) {
      return false
    }

    try {
      this.ws.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }

  _enumerateActions() {
    this._send({ request: 'GetActions', id: this._nextId('lcs-actions') })
  }

  refreshResources() {
    if (this.connected) {
      this._enumerateActions()
    }
    return this.resources
  }

  _handleMessage(data) {
    let message

    try {
      message = JSON.parse(data.toString())
    } catch {
      return
    }

    if (message.id?.includes('lcs-auth')) {
      if (message.status === 'Ok') {
        this.authenticated = true
        this._postAuth()
      } else {
        this.lastError = `Auth Streamer.bot: ${message.error || 'failed'}`
      }
      return
    }

    if (message.id?.includes('lcs-actions') || Array.isArray(message.actions)) {
      const actions = (message.actions || []).map((entry) => ({
        id: entry.id || entry.name,
        name: entry.name || entry.id,
      }))

      if (actions.length > 0 || this.resources.actions.length === 0) {
        this.resources = { actions }
        this.emit('resources', this.resources)
        this.emit('status', this.getStatus())
      }
    }

    const pending = this._pending.get(message.id)
    if (pending) {
      pending.resolve(message)
      clearTimeout(pending.timeout)
      this._pending.delete(message.id)
    }
  }

  runAction(actionRef, args = {}) {
    if (!this.connected) {
      throw new Error('Streamer.bot no conectado')
    }

    const trimmed = String(actionRef || '').trim()
    if (!trimmed) {
      throw new Error('Falta acción de Streamer.bot')
    }

    const byId = this.resources.actions.find((entry) => entry.id === trimmed)
    const byName = byId ? null : this.resources.actions.find((entry) => entry.name === trimmed)
    const action = byId ? { id: byId.id } : byName ? { id: byName.id } : { name: trimmed }

    const id = this._nextId('lcs-run')
    this._send({
      request: 'DoAction',
      id,
      action,
      ...(Object.keys(args).length ? { args } : {}),
    })

    return { queued: true, action: trimmed }
  }
}

export const streamerbotIntegration = new StreamerbotIntegrationService()