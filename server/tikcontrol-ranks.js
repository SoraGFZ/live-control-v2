import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getStorageDirectory } from './storage-paths.js'

export const DEFAULT_RANKS_CONFIG = {
  style: 'columns',
  tiers: [
    {
      name: 'Bronce',
      minDiamonds: 100,
      maxUsers: 10,
      showAvatars: true,
      showMinimum: true,
      image: '',
      imageType: 'url',
      textColor: '#cd7f32',
      showUserBg: true,
      userBgColor: 'rgba(205, 127, 50, 0.1)',
    },
    {
      name: 'Plata',
      minDiamonds: 500,
      maxUsers: 10,
      showAvatars: true,
      showMinimum: true,
      image: '',
      imageType: 'url',
      textColor: '#c0c0c0',
      showUserBg: true,
      userBgColor: 'rgba(192, 192, 192, 0.1)',
    },
    {
      name: 'Oro',
      minDiamonds: 1000,
      maxUsers: 10,
      showAvatars: true,
      showMinimum: true,
      image: '',
      imageType: 'url',
      textColor: '#ffd700',
      showUserBg: true,
      userBgColor: 'rgba(255, 215, 0, 0.1)',
    },
  ],
  tableWidth: 300,
  tableSpacing: 10,
  showBg: false,
  bgColor: '#0f172a',
  fontFamily: 'System Default',
  fontUrl: '',
  titleSize: 24,
  titleColor: '#f1f5f9',
  nameSize: 14,
  nameColor: '#f1f5f9',
  diamondsSize: 12,
  diamondsColor: '#fbbf24',
  minRequiredColor: '#94a3b8',
  textStrokeWidth: 1,
  textStrokeColor: '#000000',
  animPositionChange: 'slide',
  animTierUp: 'confetti',
  animNewUser: 'fade',
  animDuration: 800,
}

function getRanksStorePath() {
  const widgetsDir = path.join(getStorageDirectory(), 'widgets')
  if (!existsSync(widgetsDir)) {
    mkdirSync(widgetsDir, { recursive: true })
  }
  return path.join(widgetsDir, 'ranks.json')
}

function readRanksStore() {
  const storePath = getRanksStorePath()
  if (!existsSync(storePath)) {
    return {
      config: { ...DEFAULT_RANKS_CONFIG },
      users: {},
    }
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8'))
    return {
      config: { ...DEFAULT_RANKS_CONFIG, ...(parsed.config || {}) },
      users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
    }
  } catch {
    return {
      config: { ...DEFAULT_RANKS_CONFIG },
      users: {},
    }
  }
}

function writeRanksStore(state) {
  writeFileSync(getRanksStorePath(), JSON.stringify(state, null, 2), 'utf8')
}

function mergeConfigPatch(currentConfig, patch = {}) {
  const nextConfig = { ...currentConfig }

  if (Array.isArray(patch.tiers)) {
    nextConfig.tiers = patch.tiers
  }

  const scalarKeys = [
    'style',
    'tableWidth',
    'tableSpacing',
    'showBg',
    'bgColor',
    'fontFamily',
    'fontUrl',
    'titleSize',
    'titleColor',
    'nameSize',
    'nameColor',
    'diamondsSize',
    'diamondsColor',
    'minRequiredColor',
    'textStrokeWidth',
    'textStrokeColor',
    'animPositionChange',
    'animTierUp',
    'animNewUser',
    'animDuration',
  ]

  scalarKeys.forEach((key) => {
    if (patch[key] !== undefined) {
      nextConfig[key] = patch[key]
    }
  })

  return nextConfig
}

function buildGiftBatchEntry(event = {}) {
  const user = event.user || {}
  const userId =
    event.userId || event.uniqueId || user.userId || user.uniqueId || user.id || ''
  const nickname = event.nickname || user.nickname || event.uniqueId || user.uniqueId || userId
  const profilePictureUrl =
    event.profilePictureUrl ||
    user.profilePictureUrl ||
    event.avatarUrl ||
    user.avatarUrl ||
    ''

  const giftDetails = event.giftDetails || event.gift || event.giftInfo || {}
  const diamondCount =
    Number(
      event.diamondCount ||
        event.diamond_count ||
        event.diamonds ||
        event.giftCoins ||
        giftDetails.diamond_count ||
        giftDetails.diamondCount ||
        giftDetails.diamonds ||
        0,
    ) || 0

  const repeatCount = Math.max(1, Number(event.repeatCount || event.repeat_count || 1))
  const totalDiamonds = diamondCount * repeatCount

  if (!userId || totalDiamonds <= 0) {
    return null
  }

  return {
    userId,
    uniqueId: userId,
    nickname,
    profilePictureUrl,
    diamondCount,
    totalDiamonds,
    _giftDiamonds: diamondCount,
  }
}

export function createRanksWidgetService({ socketIo, broadcastOverlay }) {
  let state = readRanksStore()
  let giftQueue = []
  let flushTimer = null
  let isFlushing = false

  function persist() {
    writeRanksStore(state)
  }

  function emitConfig() {
    if (socketIo) {
      socketIo.emit('ranks:config', state.config)
    }
    broadcastOverlay?.({
      type: 'widget:configUpdated',
      widget: 'ranks',
      config: state.config,
    })
  }

  function flushGiftQueue() {
    if (!giftQueue.length || isFlushing) {
      return
    }

    isFlushing = true
    const batch = giftQueue.splice(0, 50)

    try {
      if (socketIo) {
        socketIo.emit('gift', { batch })
      }
      broadcastOverlay?.({
        type: 'gift',
        batch,
      })
    } catch (error) {
      console.warn('[ranks] Error emitiendo lote de gifts:', error.message)
    } finally {
      isFlushing = false
      if (giftQueue.length) {
        setTimeout(flushGiftQueue, giftQueue.length >= 50 ? 0 : 100)
      }
    }
  }

  function queueGiftBatchEntry(entry) {
    if (!entry) {
      return
    }

    const userId = entry.userId
    if (state.users[userId]) {
      if (entry.nickname) {
        state.users[userId].nickname = entry.nickname
      }
      if (entry.profilePictureUrl) {
        state.users[userId].profilePictureUrl = entry.profilePictureUrl
      }
      state.users[userId].totalDiamonds += entry.totalDiamonds
    } else {
      state.users[userId] = {
        userId,
        nickname: entry.nickname,
        profilePictureUrl: entry.profilePictureUrl,
        totalDiamonds: entry.totalDiamonds,
      }
    }

    persist()
    giftQueue.push({
      userId,
      nickname: state.users[userId].nickname,
      profilePictureUrl: state.users[userId].profilePictureUrl,
      totalDiamonds: state.users[userId].totalDiamonds,
      diamondCount: entry.diamondCount,
    })

    if (giftQueue.length >= 1000) {
      flushGiftQueue()
      return
    }

    if (giftQueue.length >= 50) {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      flushGiftQueue()
      return
    }

    if (!flushTimer && !isFlushing) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        flushGiftQueue()
      }, 500)
    }
  }

  function registerRoutes(app) {
    app.get('/api/ranks/config', (_request, response) => {
      response.json({ ok: true, config: state.config })
    })

    app.get('/api/ranks/data', (_request, response) => {
      response.json({ ok: true, users: state.users })
    })

    app.post('/api/ranks/config', (request, response) => {
      state.config = mergeConfigPatch(state.config, request.body || {})
      persist()
      emitConfig()
      response.json({ ok: true, config: state.config })
    })

    app.post('/api/ranks/config/reset', (_request, response) => {
      state.config = { ...DEFAULT_RANKS_CONFIG }
      persist()
      emitConfig()
      response.json({ ok: true, config: state.config })
    })

    app.post('/api/ranks/reset', (_request, response) => {
      state.users = {}
      persist()
      if (socketIo) {
        socketIo.emit('ranks:reset')
      }
      broadcastOverlay?.({ type: 'widget:reset', widget: 'ranks' })
      response.json({ ok: true })
    })

    app.post('/api/ranks/test', (_request, response) => {
      const batch = [
        {
          userId: 'test_alpha',
          uniqueId: 'test_alpha',
          nickname: 'TestAlpha',
          profilePictureUrl: '',
          totalDiamonds: 15000,
          diamondCount: 500,
        },
        {
          userId: 'test_beta',
          uniqueId: 'test_beta',
          nickname: 'Supporter',
          profilePictureUrl: '',
          totalDiamonds: 8500,
          diamondCount: 300,
        },
      ]

      batch.forEach((entry) => queueGiftBatchEntry(entry))
      flushGiftQueue()
      response.json({ ok: true, users: batch })
    })
  }

  return {
    registerRoutes,
    getConfig: () => state.config,
    getUsers: () => state.users,
    resetUsers() {
      state.users = {}
      persist()
    },
    onIncomingGiftEvent(event = {}) {
      const entry = buildGiftBatchEntry(event)
      queueGiftBatchEntry(entry)
    },
    onTikTokGiftPayload(payload = {}) {
      if (payload.type === 'gift-solo' || payload.type === 'gift') {
        const entry = buildGiftBatchEntry(payload.data || payload)
        queueGiftBatchEntry(entry)
      }
    },
  }
}