;(function () {
  'use strict'

  const params = new URLSearchParams(window.location.search)
  const overlayKey = params.get('key') || params.get('overlayKey') || ''
  const widgetUid = params.get('uid') || params.get('userId') || params.get('t') || 'live-control'

  class LiveControlWidgetBridge {
    constructor() {
      this.widgetName = ''
      this.options = { persistent: false, sessionBased: true, autoConnect: true }
      this.socket = null
      this.connected = false
      this.config = {}
      this.data = {}
      this.state = {}
      this.eventListeners = new Map()
      this.configCallbacks = []
      this.dataCallbacks = []
      this.reconnectAttempts = 0
      this._reconnectTimer = null
      this._stopReconnect = false
    }

    init(widgetName, options = {}) {
      this.widgetName = widgetName
      this.options = { ...this.options, ...options }

      if (this.options.autoConnect !== false) {
        this.connect()
      }

      return this
    }

    connect() {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        return this
      }

      const wsBase = window.__tcEnv?.ws?.() || `ws://127.0.0.1:5123/ws/overlay`
      const separator = wsBase.includes('?') ? '&' : '?'
      const socketUrl = `${wsBase}${separator}key=${encodeURIComponent(overlayKey)}&widget=${encodeURIComponent(this.widgetName)}&uid=${encodeURIComponent(widgetUid)}`

      try {
        this.socket = new WebSocket(socketUrl)
        this.socket.onopen = () => {
          this.connected = true
          this.reconnectAttempts = 0
          this._emit('connect')
        }
        this.socket.onclose = () => {
          this.connected = false
          this._emit('disconnect')
          this._scheduleReconnect()
        }
        this.socket.onerror = () => {
          this._emit('error')
        }
        this.socket.onmessage = (message) => {
          try {
            const payload = JSON.parse(message.data)
            this._handleServerMessage(payload)
          } catch {
            // ignore malformed payloads
          }
        }
      } catch (error) {
        console.error('[LiveControl Widget]', error)
        this._scheduleReconnect()
      }

      return this
    }

    _scheduleReconnect() {
      if (this._stopReconnect || this._reconnectTimer) {
        return
      }

      this.reconnectAttempts += 1
      const delay = Math.min(1000 * 2 ** Math.min(this.reconnectAttempts, 5), 30000)
      this._reconnectTimer = window.setTimeout(() => {
        this._reconnectTimer = null
        this.connect()
      }, delay)
    }

    _handleServerMessage(payload) {
      if (!payload || typeof payload !== 'object') {
        return
      }

      if (payload.type === 'pong') {
        return
      }

      if (payload.type === 'overlay-state') {
        const overlayPayload = payload.payload || {}
        const widgetConfig = overlayPayload.widgetConfig || {}
        const widgetData = overlayPayload.widgetData || {}
        if (widgetConfig && Object.keys(widgetConfig).length) {
          this._handleConfig(widgetConfig)
        }
        if (widgetData && Object.keys(widgetData).length) {
          this._handleData(widgetData)
        }
        return
      }

      if (
        payload.type === 'widget:config'
        || payload.type === 'widget:configUpdated'
        || payload.type === 'widgetConfig'
      ) {
        this._handleConfig(
          payload.config || payload.payload?.config || payload.data?.config || payload.data || {},
        )
        if (payload.data) {
          this._handleData(payload.data)
        }
        return
      }

      if (payload.type === 'widget:data') {
        this._handleData(payload.data || payload.payload?.data || {})
        return
      }

      if (payload.type === 'widget:reset' || payload.type === 'reset') {
        this._emit('reset')
        return
      }

      if (payload.type === 'widget:trigger') {
        const widgetName = payload.widget || payload.data?.widget
        if (!widgetName || widgetName === this.widgetName) {
          this._emit('gift', payload.data || payload.payload || {})
          this._emit('widget:trigger', payload.data || payload.payload || {})
        }
        return
      }

      if (payload.type === 'eventBatch' && Array.isArray(payload.events)) {
        payload.events.forEach((entry) => {
          if (!entry?.type) {
            return
          }
          const eventData = entry.data || entry
          this._emit(entry.type, eventData)
          this._emit('tiktok', { type: entry.type, data: eventData })
        })
        return
      }

      if (payload.type === 'incoming-event' || payload.type === 'tiktok') {
        const event = payload.payload || payload.data || {}
        const eventType = event.type || payload.eventType
        if (eventType) {
          this._emit(eventType, event.data || event)
          this._emit('tiktok', { type: eventType, data: event.data || event })
        }
        return
      }

      const passthroughType = payload.type
      if (passthroughType) {
        const passthroughData = payload.data ?? payload.payload ?? payload
        this._emit(passthroughType, passthroughData)
      }
    }

    _handleConfig(nextConfig) {
      this.config = { ...this.config, ...(nextConfig || {}) }
      this.configCallbacks.forEach((callback) => {
        try {
          callback(this.config)
        } catch {
          // ignore callback errors
        }
      })
    }

    _handleData(nextData) {
      this.data = { ...this.data, ...(nextData || {}) }
      this.dataCallbacks.forEach((callback) => {
        try {
          callback(this.data)
        } catch {
          // ignore callback errors
        }
      })
    }

    onConfig(callback) {
      if (typeof callback === 'function') {
        this.configCallbacks.push(callback)
        if (Object.keys(this.config).length) {
          callback(this.config)
        }
      }
      return this
    }

    onData(callback) {
      if (typeof callback === 'function') {
        this.dataCallbacks.push(callback)
        if (Object.keys(this.data).length) {
          callback(this.data)
        }
      }
      return this
    }

    on(eventName, callback) {
      const normalized = String(eventName || '').trim()
      if (!normalized || typeof callback !== 'function') {
        return this
      }

      const listeners = this.eventListeners.get(normalized) || []
      listeners.push(callback)
      this.eventListeners.set(normalized, listeners)
      return this
    }

    off(eventName, callback) {
      const listeners = this.eventListeners.get(eventName)
      if (!listeners) {
        return this
      }

      this.eventListeners.set(
        eventName,
        listeners.filter((listener) => listener !== callback),
      )
      return this
    }

    _emit(eventName, payload) {
      const listeners = this.eventListeners.get(eventName) || []
      listeners.forEach((callback) => {
        try {
          callback(payload)
        } catch {
          // ignore callback errors
        }
      })
    }

    saveData(nextData) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return this
      }

      try {
        this.socket.send(
          JSON.stringify({
            type: 'widget:saveData',
            widget: this.widgetName,
            data: nextData || {},
          }),
        )
      } catch {
        // ignore send errors
      }

      return this
    }
  }

  window.TikControl = new LiveControlWidgetBridge()
})()