import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getStorageDirectory } from './storage-paths.js'

const DEFAULT_AUCTION_CONFIG = {
  title: 'Subasta',
  durationSec: 120,
  minCoins: 1,
  visibleWinners: 3,
  showBg: true,
  titleColor: '#ffffff',
  timerColor: '#ffffff',
  minBadgeBg: 'linear-gradient(135deg, #ffcf5a, #ffa500)',
  minBadgeTextColor: '#ffffff',
  widgetScale: 1,
  _schemaVAuction: 3,
}

function getWidgetsDir() {
  const dir = path.join(getStorageDirectory(), 'widgets')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function readWidgetJson(fileName) {
  const filePath = path.join(getWidgetsDir(), fileName)
  if (!existsSync(filePath)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeWidgetJson(fileName, value) {
  writeFileSync(path.join(getWidgetsDir(), fileName), JSON.stringify(value, null, 2), 'utf8')
}

function normalizeDurationSec(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_AUCTION_CONFIG.durationSec
  }
  return Math.max(5, Math.floor(numeric))
}

function normalizeVisibleWinners(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return DEFAULT_AUCTION_CONFIG.visibleWinners
  }
  return Math.min(3, Math.max(1, Math.round(numeric)))
}

function normalizeConfig(patch = {}) {
  return {
    ...DEFAULT_AUCTION_CONFIG,
    ...patch,
    durationSec: normalizeDurationSec(patch.durationSec),
    visibleWinners: normalizeVisibleWinners(patch.visibleWinners),
    minCoins: Math.max(1, Number(patch.minCoins || 1)),
    _schemaVAuction: 3,
    _updatedAt: Date.now(),
  }
}

export function createAuctionRuntime(socketIo) {
  let config = normalizeConfig(readWidgetJson('auction.json') || {})
  const auction = {
    running: false,
    paused: false,
    pausedAt: 0,
    pausedTimeRemaining: 0,
    endsAt: 0,
    startedAt: 0,
    participants: {},
    leaderId: null,
    leaderCoins: 0,
  }

  let tickTimer = null

  function emitConfig() {
    if (!socketIo) {
      return
    }
    socketIo.emit('widget:configUpdated', { widget: 'auction', config })
    socketIo.emit('auction', { config })
  }

  function emitState() {
    if (!socketIo) {
      return
    }
    socketIo.emit('auction:state', { ...auction })
    socketIo.emit('auction', { state: { ...auction } })
  }

  function emitControl(action, extra = {}) {
    if (!socketIo) {
      return
    }
    const payload = { _control: action, action, state: { ...auction }, ...extra }
    socketIo.emit('auction:control', payload)
    socketIo.emit('auction', payload)
  }

  function refreshLeader() {
    const entries = Object.entries(auction.participants)
    if (!entries.length) {
      auction.leaderId = null
      auction.leaderCoins = 0
      return
    }
    entries.sort((left, right) => Number(right[1].coins || 0) - Number(left[1].coins || 0))
    const [leaderId, leader] = entries[0]
    auction.leaderId = leaderId
    auction.leaderCoins = Number(leader.coins || 0)
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  function startTick() {
    stopTick()
    if (!auction.running || auction.paused) {
      return
    }
    tickTimer = setInterval(() => {
      if (!auction.running || auction.paused) {
        stopTick()
        return
      }
      if (Date.now() >= auction.endsAt) {
        auction.running = false
        auction.paused = false
        stopTick()
        emitState()
        emitControl('ended')
        return
      }
      emitState()
    }, 1000)
  }

  function startAuction() {
    const durationMs = normalizeDurationSec(config.durationSec) * 1000
    auction.running = true
    auction.paused = false
    auction.pausedAt = 0
    auction.pausedTimeRemaining = 0
    auction.startedAt = Date.now()
    auction.endsAt = Date.now() + durationMs
    auction.participants = {}
    auction.leaderId = null
    auction.leaderCoins = 0
    startTick()
  }

  function pauseAuction() {
    if (!auction.running || auction.paused) {
      return false
    }
    auction.paused = true
    auction.pausedAt = Date.now()
    auction.pausedTimeRemaining = Math.max(0, auction.endsAt - Date.now())
    stopTick()
    return true
  }

  function resumeAuction() {
    if (!auction.running || !auction.paused) {
      return false
    }
    auction.paused = false
    auction.endsAt = Date.now() + Math.max(0, Number(auction.pausedTimeRemaining || 0))
    auction.pausedAt = 0
    auction.pausedTimeRemaining = 0
    startTick()
    return true
  }

  function resetAuction() {
    stopTick()
    auction.running = false
    auction.paused = false
    auction.pausedAt = 0
    auction.pausedTimeRemaining = 0
    auction.endsAt = 0
    auction.startedAt = 0
    auction.participants = {}
    auction.leaderId = null
    auction.leaderCoins = 0
  }

  return {
    getConfig: () => ({ ...config }),
    getState: () => ({ ...auction }),
    setConfig(patch = {}) {
      config = normalizeConfig({ ...config, ...patch })
      writeWidgetJson('auction.json', config)
      emitConfig()
      return config
    },
    control(body = {}) {
      const action = String(body.action || '').trim().toLowerCase()
      if (action === 'reset') {
        resetAuction()
        emitControl('reset', { commandId: body.commandId || null })
        emitState()
        return { ok: true, action, state: { ...auction } }
      }
      if (action === 'start') {
        if (auction.running && auction.paused) {
          resumeAuction()
          emitControl('resume', { commandId: body.commandId || null })
        } else if (!auction.running) {
          startAuction()
          emitControl('start', { commandId: body.commandId || null })
        }
        emitState()
        return { ok: true, action: auction.paused ? 'resume' : 'start', state: { ...auction } }
      }
      if (action === 'pause') {
        if (!pauseAuction()) {
          return { ok: false, error: 'not_running_or_already_paused', state: { ...auction } }
        }
        emitControl('pause', { commandId: body.commandId || null })
        emitState()
        return { ok: true, action: 'pause', state: { ...auction } }
      }
      if (action === 'resume') {
        if (!resumeAuction()) {
          return { ok: false, error: 'not_paused', state: { ...auction } }
        }
        emitControl('resume', { commandId: body.commandId || null })
        emitState()
        return { ok: true, action: 'resume', state: { ...auction } }
      }
      return { ok: false, error: 'invalid_action', state: { ...auction } }
    },
    patchState(patch = {}) {
      if (patch.running !== undefined) {
        auction.running = Boolean(patch.running)
      }
      if (patch.paused !== undefined) {
        auction.paused = Boolean(patch.paused)
      }
      if (patch.endsAt !== undefined) {
        auction.endsAt = Number(patch.endsAt) || 0
      }
      if (patch.participants && typeof patch.participants === 'object') {
        auction.participants = { ...patch.participants }
      }
      refreshLeader()
      emitState()
      return { ...auction }
    },
    recordGift(event = {}) {
      if (!auction.running || auction.paused) {
        return false
      }
      const uniqueId = String(event.uniqueId || event.userName || '').trim()
      if (!uniqueId) {
        return false
      }
      const giftCoins = Math.max(0, Number(event.giftCoins || 0))
      const repeatCount = Math.max(1, Number(event.repeatCount || 1))
      const coins = giftCoins * repeatCount
      if (coins < Math.max(1, Number(config.minCoins || 1))) {
        return false
      }

      const previous = auction.participants[uniqueId] || {
        id: uniqueId,
        nickname: event.nickname || uniqueId,
        avatar: event.avatarUrl || '',
        coins: 0,
      }
      previous.nickname = event.nickname || previous.nickname
      previous.avatar = event.avatarUrl || previous.avatar
      previous.coins = Number(previous.coins || 0) + coins
      auction.participants[uniqueId] = previous
      refreshLeader()
      emitState()
      return true
    },
    loadPersisted() {
      const saved = readWidgetJson('auction-state.json')
      if (saved && typeof saved === 'object') {
        Object.assign(auction, saved, { running: false, paused: false })
      }
      const savedConfig = readWidgetJson('auction.json')
      if (savedConfig) {
        config = normalizeConfig(savedConfig)
      }
      emitConfig()
      emitState()
    },
    persistState() {
      writeWidgetJson('auction-state.json', auction)
    },
  }
}

export function registerTikcontrolAuctionRoutes(app, { auctionRuntime } = {}) {
  if (!auctionRuntime) {
    return
  }

  auctionRuntime.loadPersisted?.()

  const route = (method, url, handler) => {
    app[method](url, handler)
  }

  route('get', '/api/widgets/auction/config', (_req, res) => {
    res.json({ ok: true, config: auctionRuntime.getConfig(), version: 3 })
  })

  route('post', '/api/widgets/auction/config', (req, res) => {
    const config = auctionRuntime.setConfig(req.body?.config || req.body || {})
    res.json({ ok: true, config, version: 3 })
  })

  route('get', '/api/widgets/auction/state', (_req, res) => {
    res.json({ ok: true, state: auctionRuntime.getState() })
  })

  route('post', '/api/widgets/auction/state', (req, res) => {
    const state = auctionRuntime.patchState(req.body || {})
    auctionRuntime.persistState?.()
    res.json({ ok: true, state })
  })

  route('post', '/api/widgets/auction/control', (req, res) => {
    const result = auctionRuntime.control(req.body || {})
    auctionRuntime.persistState?.()
    if (result.ok) {
      res.json(result)
      return
    }
    res.status(result.error === 'invalid_action' ? 400 : 409).json(result)
  })

  route('post', '/api/widgets/auction/config/reset', (_req, res) => {
    const config = auctionRuntime.setConfig({ ...DEFAULT_AUCTION_CONFIG })
    res.json({ ok: true, config, version: 3 })
  })

  route('get', '/api/auction/v2/config', (_req, res) => {
    res.json({ ok: true, config: auctionRuntime.getConfig(), version: 3 })
  })

  route('post', '/api/auction/v2/config', (req, res) => {
    const config = auctionRuntime.setConfig(req.body || {})
    res.json({ ok: true, config, version: 3 })
  })

  route('get', '/api/auction/v2/state', (_req, res) => {
    res.json({ ok: true, state: auctionRuntime.getState() })
  })

  route('post', '/api/auction/control', (req, res) => {
    const result = auctionRuntime.control(req.body || {})
    auctionRuntime.persistState?.()
    if (result.ok) {
      res.json(result)
      return
    }
    res.status(400).json(result)
  })
}