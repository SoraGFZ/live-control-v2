import { EventEmitter } from 'node:events'

let OBSWebSocketClass = null

async function loadObsLibrary() {
  if (OBSWebSocketClass !== null) {
    return OBSWebSocketClass
  }

  try {
    const mod = await import('obs-websocket-js')
    OBSWebSocketClass = mod.default || mod.OBSWebSocket || mod
  } catch {
    OBSWebSocketClass = false
  }

  return OBSWebSocketClass
}

class ObsIntegrationService extends EventEmitter {
  constructor() {
    super()
    this.client = null
    this.connected = false
    this.lastError = ''
    this.config = {
      url: 'ws://127.0.0.1:4455',
      password: '',
    }
    this.resources = { scenes: [], sourcesByScene: {} }
    this._refreshing = false
  }

  getStatus() {
    return {
      type: 'obs',
      connected: this.connected,
      lastError: this.lastError,
      config: { ...this.config, password: this.config.password ? '***' : '' },
      sceneCount: this.resources.scenes?.length || 0,
    }
  }

  getResources() {
    return this.resources
  }

  async connect(config = {}) {
    const OBSWebSocket = await loadObsLibrary()

    if (!OBSWebSocket) {
      this.lastError = 'obs-websocket-js no instalado. Ejecuta npm install en el proyecto.'
      this.connected = false
      return { ok: false, error: this.lastError }
    }

    this.config = {
      url: String(config.url || this.config.url).trim() || 'ws://127.0.0.1:4455',
      password: String(config.password || ''),
    }

    if (this.connected) {
      await this.disconnect()
    }

    this.client = new OBSWebSocket()

    try {
      await this.client.connect(this.config.url, this.config.password || undefined)
      this.connected = true
      this.lastError = ''
      await this.refreshResources()
      this.emit('status', this.getStatus())
      return { ok: true, status: this.getStatus() }
    } catch (error) {
      this.connected = false
      this.lastError = error?.message || 'No se pudo conectar a OBS'
      this.emit('status', this.getStatus())
      return { ok: false, error: this.lastError }
    }
  }

  async disconnect() {
    try {
      await this.client?.disconnect()
    } catch {
      // ignore
    }

    this.client = null
    this.connected = false
    this.emit('status', this.getStatus())
    return { ok: true }
  }

  async refreshResources() {
    if (!this.connected || !this.client || this._refreshing) {
      return this.resources
    }

    this._refreshing = true

    try {
      const sceneList = await this.client.call('GetSceneList')
      const scenes = (sceneList?.scenes || []).map((scene) => scene.sceneName)
      const sourcesByScene = {}

      for (const sceneName of scenes) {
        try {
          const items = await this.client.call('GetSceneItemList', { sceneName })
          sourcesByScene[sceneName] = (items?.sceneItems || []).map((item) => item.sourceName)
        } catch {
          sourcesByScene[sceneName] = []
        }
      }

      this.resources = { scenes, sourcesByScene }
      this.emit('resources', this.resources)
    } catch (error) {
      this.lastError = error?.message || 'Error leyendo escenas OBS'
    } finally {
      this._refreshing = false
    }

    return this.resources
  }

  async executeAction({ obsAction, obsScene, obsSource }) {
    if (!this.connected || !this.client) {
      throw new Error('OBS no conectado')
    }

    const action = String(obsAction || '').trim()

    switch (action) {
      case 'scene-switch':
        if (!obsScene) {
          throw new Error('Falta nombre de escena OBS')
        }
        await this.client.call('SetCurrentProgramScene', { sceneName: obsScene })
        return { action, scene: obsScene }

      case 'scene-visible':
        if (!obsScene) {
          throw new Error('Falta nombre de escena OBS')
        }
        await this.client.call('SetCurrentProgramScene', { sceneName: obsScene })
        return { action, scene: obsScene }

      case 'source-show':
        await this.setSourceVisible(obsSource, true)
        return { action, source: obsSource }

      case 'source-hide':
        await this.setSourceVisible(obsSource, false)
        return { action, source: obsSource }

      case 'source-toggle':
        await this.toggleSource(obsSource)
        return { action, source: obsSource }

      case 'source-solo':
        await this.soloSource(obsSource)
        return { action, source: obsSource }

      default:
        throw new Error(`Acción OBS desconocida: ${action}`)
    }
  }

  async setSourceVisible(sourceName, visible) {
    for (const [sceneName, sources] of Object.entries(this.resources.sourcesByScene || {})) {
      if (!sources.includes(sourceName)) {
        continue
      }

      const sceneItems = await this.client.call('GetSceneItemList', { sceneName })
      const item = (sceneItems?.sceneItems || []).find((entry) => entry.sourceName === sourceName)

      if (item) {
        await this.client.call('SetSceneItemEnabled', {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: visible,
        })
        return
      }
    }

    throw new Error(`Fuente OBS no encontrada: ${sourceName}`)
  }

  async toggleSource(sourceName) {
    for (const [sceneName, sources] of Object.entries(this.resources.sourcesByScene || {})) {
      if (!sources.includes(sourceName)) {
        continue
      }

      const sceneItems = await this.client.call('GetSceneItemList', { sceneName })
      const item = (sceneItems?.sceneItems || []).find((entry) => entry.sourceName === sourceName)

      if (item) {
        await this.client.call('SetSceneItemEnabled', {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: !item.sceneItemEnabled,
        })
        return
      }
    }

    throw new Error(`Fuente OBS no encontrada: ${sourceName}`)
  }

  async soloSource(sourceName) {
    for (const [sceneName, sources] of Object.entries(this.resources.sourcesByScene || {})) {
      if (!sources.includes(sourceName)) {
        continue
      }

      const sceneItems = await this.client.call('GetSceneItemList', { sceneName })
      for (const item of sceneItems?.sceneItems || []) {
        await this.client.call('SetSceneItemEnabled', {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: item.sourceName === sourceName,
        })
      }
      return
    }

    throw new Error(`Fuente OBS no encontrada: ${sourceName}`)
  }
}

export const obsIntegration = new ObsIntegrationService()