import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getStorageDirectory } from './storage-paths.js'

const BATTLE_WIDGET_IDS = [
  'battle-pk',
  'battle-overlay',
  'battle-scoreboard',
  'battle-gifts',
  'battle-alerts',
  'gift-battle',
]

function getWidgetsDir() {
  const dir = path.join(getStorageDirectory(), 'widgets')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function readWidgetStore(widgetId, profileId = '_default') {
  const filePath = path.join(getWidgetsDir(), `${widgetId}.json`)
  if (!existsSync(filePath)) {
    return {}
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    return parsed[profileId] || parsed._default || parsed || {}
  } catch {
    return {}
  }
}

function writeWidgetStore(widgetId, profileId, value) {
  const filePath = path.join(getWidgetsDir(), `${widgetId}.json`)
  let root = {}

  if (existsSync(filePath)) {
    try {
      root = JSON.parse(readFileSync(filePath, 'utf8'))
    } catch {
      root = {}
    }
  }

  root[profileId] = value
  writeFileSync(filePath, JSON.stringify(root, null, 2), 'utf8')
}

let battleSession = {
  isActive: false,
  battleId: '',
  updatedAt: 0,
  lastPayload: null,
}

export function getBattleSessionSnapshot() {
  return { ...battleSession }
}

export function recordBattleTikTokEvent(eventType, data = {}) {
  battleSession = {
    isActive: eventType !== 'linkMicBattleEnd' && eventType !== 'linkMicBattlePunishFinish',
    battleId: String(data?.battleId || data?.battle_id || battleSession.battleId || ''),
    updatedAt: Date.now(),
    lastPayload: { type: eventType, data },
  }

  return battleSession
}

export function registerTikcontrolBattlesRoutes(app, { socketIo, getActiveProfileId = () => '_default' } = {}) {
  app.get('/api/battle-pk/state', (_request, response) => {
    response.json({ ok: true, session: getBattleSessionSnapshot() })
  })

  app.get('/api/battle-pk/config', (request, response) => {
    const profileId = String(request.query.profileId || getActiveProfileId() || '_default')
    response.json({
      ok: true,
      config: readWidgetStore('battle-pk', profileId),
    })
  })

  app.post('/api/battle-pk/config', (request, response) => {
    const profileId = String(request.body?.profileId || getActiveProfileId() || '_default')
    writeWidgetStore('battle-pk', profileId, request.body?.config || request.body || {})
    response.json({ ok: true })
  })

  app.get('/api/gift-battle/config', (request, response) => {
    const profileId = String(request.query.profileId || getActiveProfileId() || '_default')
    response.json({
      ok: true,
      config: readWidgetStore('gift-battle', profileId),
    })
  })

  app.post('/api/gift-battle/config', (request, response) => {
    const profileId = String(request.body?.profileId || getActiveProfileId() || '_default')
    writeWidgetStore('gift-battle', profileId, request.body?.config || request.body || {})
    response.json({ ok: true })
  })

  BATTLE_WIDGET_IDS.forEach((widgetId) => {
    app.get(`/api/widgets/${widgetId}/config`, (request, response) => {
      const profileId = String(request.query.profileId || getActiveProfileId() || '_default')
      response.json({
        ok: true,
        widget: widgetId,
        config: readWidgetStore(widgetId, profileId),
      })
    })

    app.post(`/api/widgets/${widgetId}/config`, (request, response) => {
      const profileId = String(request.body?.profileId || getActiveProfileId() || '_default')
      writeWidgetStore(widgetId, profileId, request.body?.config || request.body || {})
      response.json({ ok: true, widget: widgetId })
    })
  })

  if (socketIo) {
    app.post('/api/battle-pk/broadcast', (request, response) => {
      const payload = request.body || {}
      socketIo.emit('tiktok:event', {
        type: payload.type || 'battle:data',
        data: payload.data || payload,
      })
      response.json({ ok: true })
    })
  }
}

export function emitBattleSocketEvent(socketIo, eventType, data = {}) {
  if (!socketIo) {
    return
  }

  recordBattleTikTokEvent(eventType, data)
  socketIo.emit('tiktok:event', { type: eventType, data })
}