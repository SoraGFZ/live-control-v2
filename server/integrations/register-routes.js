import { mergeStateWithDefaults } from '../../src/live-control.js'
import { obsIntegration } from './obs-service.js'
import { streamerbotIntegration } from './streamerbot-service.js'
import { streamdeckIntegration } from './streamdeck-service.js'
import { executeKeystroke } from './keystroke-service.js'

function readIntegrationConfig(store) {
  return store.getState().integrations || {}
}

async function persistIntegrationConfig(store, patch) {
  const state = store.getState()
  const nextState = mergeStateWithDefaults({
    ...state,
    integrations: {
      ...state.integrations,
      ...patch,
      obs: { ...(state.integrations?.obs || {}), ...(patch.obs || {}) },
      streamerbot: { ...(state.integrations?.streamerbot || {}), ...(patch.streamerbot || {}) },
      streamdeck: { ...(state.integrations?.streamdeck || {}), ...(patch.streamdeck || {}) },
    },
    updatedAt: Date.now(),
  })

  await store.setState(nextState)
  return nextState.integrations
}

async function ensureObsReady(store) {
  if (obsIntegration.connected) {
    return true
  }

  const config = readIntegrationConfig(store).obs || {}
  if (!config.url) {
    return false
  }

  const result = await obsIntegration.connect(config)
  return Boolean(result?.ok)
}

async function ensureStreamerbotReady(store) {
  if (streamerbotIntegration.connected) {
    return true
  }

  const config = readIntegrationConfig(store).streamerbot || {}
  if (!config.url) {
    return false
  }

  const result = await streamerbotIntegration.connect(config)
  return Boolean(result?.ok)
}

export function getPremiumIntegrationsSnapshot() {
  return {
    premium: {
      tier: 'founder_local',
      label: 'TikControl Premium (local)',
      unlimited: true,
      cloudAccountRequired: false,
    },
    obs: obsIntegration.getStatus(),
    streamerbot: streamerbotIntegration.getStatus(),
    streamdeck: streamdeckIntegration.getStatus(),
  }
}

export async function bootstrapPremiumIntegrations({ store, dispatchActionById, onStatusChange }) {
  const notify = () => {
    onStatusChange?.()
  }

  obsIntegration.on('status', notify)
  obsIntegration.on('resources', notify)
  streamerbotIntegration.on('status', notify)
  streamerbotIntegration.on('resources', notify)
  streamdeckIntegration.on('status', notify)

  streamdeckIntegration.configure({
    getActionsList: () => store.getState().actions || [],
    executeActionById: async (actionId) => {
      const action = (store.getState().actions || []).find((entry) => entry.id === actionId)
      if (!action) {
        return { ok: false, error: 'Accion no encontrada' }
      }
      await dispatchActionById(action)
      return { ok: true, actionId }
    },
  })

  const integrations = readIntegrationConfig(store)
  const streamdeckConfig = integrations.streamdeck || {}

  if (streamdeckConfig.enabled === true) {
    const streamdeckResult = streamdeckIntegration.start({
      port: streamdeckConfig.port || 9091,
      host: streamdeckConfig.host || '127.0.0.1',
    })
    if (!streamdeckResult?.ok) {
      console.warn('[integrations] StreamDeck hub no iniciado:', streamdeckResult?.error || 'desconocido')
    }
  }

  if (integrations.obs?.autoConnect !== false) {
    await obsIntegration.connect(integrations.obs || {})
  }

  if (integrations.streamerbot?.autoConnect !== false) {
    await streamerbotIntegration.connect(integrations.streamerbot || {})
  }
}

export async function executePremiumOutputs(action, bridgeResults, { store } = {}) {
  if (action.outputs.includes('obs')) {
    try {
      if (!obsIntegration.connected && store) {
        await ensureObsReady(store)
      }
      bridgeResults.obs = {
        ok: true,
        result: await obsIntegration.executeAction(action),
      }
    } catch (error) {
      bridgeResults.obs = { ok: false, error: error?.message || 'OBS error' }
    }
  }

  if (action.outputs.includes('streamerbot')) {
    try {
      if (!streamerbotIntegration.connected && store) {
        await ensureStreamerbotReady(store)
      }
      bridgeResults.streamerbot = {
        ok: true,
        result: streamerbotIntegration.runAction(action.streamerbotAction),
      }
    } catch (error) {
      bridgeResults.streamerbot = { ok: false, error: error?.message || 'Streamer.bot error' }
    }
  }

  if (action.outputs.includes('keystroke')) {
    try {
      bridgeResults.keystroke = await executeKeystroke(action.keystrokeKeys)
    } catch (error) {
      bridgeResults.keystroke = { ok: false, error: error?.message || 'Keystroke error' }
    }
  }
}

export function registerPremiumIntegrationRoutes(app, { store, onStatusChange }) {
  app.get('/api/integrations/status', (_request, response) => {
    response.json({ ok: true, ...getPremiumIntegrationsSnapshot() })
  })

  app.get('/api/integrations/config', (_request, response) => {
    response.json({ ok: true, integrations: readIntegrationConfig(store) })
  })

  app.post('/api/integrations/config', async (request, response) => {
    const integrations = await persistIntegrationConfig(store, request.body || {})
    onStatusChange?.()
    response.json({ ok: true, integrations })
  })

  app.post('/api/integrations/obs/connect', async (request, response) => {
    const config = request.body || readIntegrationConfig(store).obs || {}
    const result = await obsIntegration.connect(config)
    await persistIntegrationConfig(store, { obs: { ...config, autoConnect: true, lastConnectedAt: Date.now() } })
    onStatusChange?.()
    response.json(result)
  })

  app.post('/api/integrations/obs/disconnect', async (_request, response) => {
    const result = await obsIntegration.disconnect()
    onStatusChange?.()
    response.json(result)
  })

  app.get('/api/integrations/obs/resources', async (_request, response) => {
    if (obsIntegration.connected) {
      await obsIntegration.refreshResources()
    }
    response.json({
      ok: true,
      status: obsIntegration.getStatus(),
      resources: obsIntegration.getResources(),
    })
  })

  app.post('/api/integrations/streamerbot/connect', async (request, response) => {
    const config = request.body || readIntegrationConfig(store).streamerbot || {}
    const result = await streamerbotIntegration.connect(config)
    await persistIntegrationConfig(store, {
      streamerbot: { ...config, autoConnect: true, lastConnectedAt: Date.now() },
    })
    onStatusChange?.()
    response.json(result)
  })

  app.post('/api/integrations/streamerbot/disconnect', async (_request, response) => {
    const result = await streamerbotIntegration.disconnect()
    onStatusChange?.()
    response.json(result)
  })

  app.get('/api/integrations/streamerbot/resources', (_request, response) => {
    if (streamerbotIntegration.connected) {
      streamerbotIntegration.refreshResources()
    }
    response.json({
      ok: true,
      status: streamerbotIntegration.getStatus(),
      resources: streamerbotIntegration.getResources(),
    })
  })

  app.post('/api/integrations/streamdeck/start', async (request, response) => {
    const config = request.body || readIntegrationConfig(store).streamdeck || {}
    const result = streamdeckIntegration.start(config)
    await persistIntegrationConfig(store, { streamdeck: { ...config, enabled: true } })
    onStatusChange?.()
    response.json(result)
  })

  app.post('/api/integrations/streamdeck/stop', async (_request, response) => {
    const result = streamdeckIntegration.stop()
    onStatusChange?.()
    response.json(result)
  })
}