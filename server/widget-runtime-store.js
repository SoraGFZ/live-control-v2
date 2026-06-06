import { schedulePointsSyncFromSession } from './tikcontrol-runtime-extras.js'

const MAX_CHAT_MESSAGES = 80
const MAX_GIFT_GALLERY = 40
const MAX_COMMENT_TRACKED = 500

const GOAL_METRIC_KEYS = {
  likes: 'goallikes',
  coins: 'goalcoins',
  follows: 'goalfollows',
  gifts: 'goalgifts',
  shares: 'goalshares',
  subscribers: 'goalsubscribers',
}

const DEFAULT_GOAL_SETTINGS = {
  likes: { title: 'likes', target: 5000, whenReached: 'keep' },
  coins: { title: 'coins', target: 500, whenReached: 'keep' },
  follows: { title: 'follows', target: 100, whenReached: 'keep' },
  gifts: { title: 'gifts', target: 50, whenReached: 'keep' },
  shares: { title: 'shares', target: 30, whenReached: 'keep' },
  subscribers: { title: 'subs', target: 10, whenReached: 'keep' },
}

const DEFAULT_WIDGET_RUNTIME_CONFIG = {
  chat: {
    enabled: true,
    maxMessages: 12,
    showAvatars: true,
    showBadges: true,
    fontSize: 18,
    backgroundEnabled: false,
  },
  'gift-alert': {
    enabled: true,
    minCoins: 1,
    durationMs: 5000,
    showGiftPicture: true,
    fontFamily: 'System Default',
    fontUrl: '',
  },
  'gift-gallery': {
    enabled: true,
    maxVisible: 8,
    showGiftPicture: true,
  },
  'gift-cannon': {
    enabled: true,
    minCoins: 1,
    showGiftPictures: true,
  },
  'gift-battle': {
    enabled: true,
    teamAName: 'Equipo A',
    teamBName: 'Equipo B',
  },
  'battle-pk': {
    enabled: true,
    widgetType: 'full',
    transparentBg: true,
  },
  'battle-overlay': { enabled: true },
  'battle-scoreboard': { enabled: true },
  'battle-gifts': { enabled: true },
  'battle-alerts': { enabled: true },
  'event-notification': {
    enabled: true,
    showFollow: true,
    showGift: true,
    showShare: true,
  },
  'gift-jar-premium': {
    enabled: true,
    showGiftPictures: true,
  },
  firework: {
    firework_soundEnabled: true,
    firework_soundVolume: 80,
    fontFamily: 'System Default',
  },
  'firework-v2': {
    firework_soundEnabled: true,
    firework_soundVolume: 80,
  },
  'firework-premium': {
    firework_soundEnabled: true,
    firework_soundVolume: 80,
  },
  timer: {
    fontSize: 72,
    textColor: '#ffffff',
    showLabels: true,
    showDays: false,
  },
  roulette: {
    enabled: true,
  },
  poll: {
    enabled: true,
    question: '¿Cuál eliges?',
    options: ['A', 'B', 'C'],
  },
  'pinned-message': {
    enabled: false,
    message: '',
    showProfilePic: true,
  },
  winlife: {
    wins: 0,
    lives: 3,
    maxLives: 3,
  },
  'gaming-hud': {
    enabled: true,
    title: 'Gaming HUD',
  },
  ranks: {
    enabled: true,
    title: 'Ranks',
  },
  'like-fountain': {
    enabled: true,
  },
  'level-up': {
    enabled: true,
  },
  'top-comments': {
    title: 'TOP CHAT',
    rows: 5,
    showAvatars: true,
  },
  'top-combo': {
    title: 'TOP COMBO',
    rows: 5,
  },
  'top-points': {
    title: 'TOP PUNTOS',
    rows: 5,
  },
  'top-rotation': {
    title: 'TOP ROTACION',
    rows: 5,
    rotationIntervalMs: 8000,
  },
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function flattenGoalConfig(goalsState = {}) {
  const timestamp = Number(goalsState._timestamp || Date.now())
  const flat = { _timestamp: timestamp }

  Object.entries(GOAL_METRIC_KEYS).forEach(([metricId, prefix]) => {
    const source = {
      ...DEFAULT_GOAL_SETTINGS[metricId],
      ...(goalsState[metricId] || {}),
    }

    flat[`${prefix}_title`] = source.title
    flat[`${prefix}_value`] = Number(source.target || 0)
    flat[`${prefix}_originalValue`] = Number(source.originalTarget || source.target || 0)
    flat[`${prefix}_whenReached`] = source.whenReached || 'keep'
    flat[`${prefix}_progress1Color`] = source.progress1Color || '#ff0099'
    flat[`${prefix}_progress2Color`] = source.progress2Color || '#2cb2d4'
    flat[`${prefix}_widgetType`] = source.widgetType || 'bar'
    flat[`${prefix}_textColor`] = source.textColor || '#ffffff'
    flat[`${prefix}_avatarFlipEnabled`] = source.avatarFlipEnabled !== false
    flat[`${prefix}_avatarFlipEvery`] = Number(source.avatarFlipEvery || (metricId === 'coins' ? 1 : 100))
  })

  return flat
}

function parseGoalPatch(patch = {}) {
  const nextGoals = { _timestamp: Date.now() }

  Object.entries(GOAL_METRIC_KEYS).forEach(([metricId, prefix]) => {
    const hasMetricPatch = Object.keys(patch).some((key) => key.startsWith(`${prefix}_`))

    if (!hasMetricPatch) {
      return
    }

    nextGoals[metricId] = {
      ...(DEFAULT_GOAL_SETTINGS[metricId] || {}),
    }

    if (patch[`${prefix}_title`] !== undefined) {
      nextGoals[metricId].title = patch[`${prefix}_title`]
    }
    if (patch[`${prefix}_value`] !== undefined) {
      nextGoals[metricId].target = Number(patch[`${prefix}_value`] || 0)
    }
    if (patch[`${prefix}_originalValue`] !== undefined) {
      nextGoals[metricId].originalTarget = Number(patch[`${prefix}_originalValue`] || 0)
    }
    if (patch[`${prefix}_whenReached`] !== undefined) {
      nextGoals[metricId].whenReached = patch[`${prefix}_whenReached`]
    }
    if (patch[`${prefix}_progress1Color`] !== undefined) {
      nextGoals[metricId].progress1Color = patch[`${prefix}_progress1Color`]
    }
    if (patch[`${prefix}_progress2Color`] !== undefined) {
      nextGoals[metricId].progress2Color = patch[`${prefix}_progress2Color`]
    }
    if (patch[`${prefix}_widgetType`] !== undefined) {
      nextGoals[metricId].widgetType = patch[`${prefix}_widgetType`]
    }
  })

  if (patch._timestamp) {
    nextGoals._timestamp = Number(patch._timestamp) || Date.now()
  }

  return nextGoals
}

export function createWidgetRuntimeStore({ getState, saveState }) {
  const session = {
    chatMessages: [],
    commentCounts: new Map(),
    giftGallery: [],
    comboByUser: new Map(),
    pointsByUser: new Map(),
    lastGiftAlert: null,
    winlife: { wins: 0, lives: 3 },
    persistedWidgetData: {},
  }

  let goalsAccumulator = null

  function getGoalsState() {
    const state = getState()
    return {
      ...DEFAULT_GOAL_SETTINGS,
      ...(state.goals || {}),
      _timestamp: state.goals?._timestamp || Date.now(),
    }
  }

  function getWidgetRuntimeConfig(widgetName) {
    const state = getState()
    const widgets = state.widgets || {}
    const storageKey = widgetName.replace(/-/g, '')

    return {
      ...(DEFAULT_WIDGET_RUNTIME_CONFIG[widgetName] || {}),
      ...(widgets[widgetName] || {}),
      ...(widgets[storageKey] || {}),
    }
  }

  function recordChat(event = {}) {
    const entry = {
      id: event.id || `${Date.now()}-${event.uniqueId}`,
      uniqueId: event.uniqueId,
      nickname: event.nickname || event.uniqueId,
      comment: event.comment || '',
      avatarUrl: event.avatarUrl || '',
      createdAt: event.createdAt || Date.now(),
    }

    session.chatMessages.unshift(entry)
    session.chatMessages.splice(MAX_CHAT_MESSAGES)

    const key = normalizeKey(event.uniqueId)
    if (key) {
      const previous = session.commentCounts.get(key) || {
        uniqueId: event.uniqueId,
        nickname: entry.nickname,
        avatarUrl: entry.avatarUrl,
        count: 0,
      }
      previous.count += 1
      previous.nickname = entry.nickname
      previous.avatarUrl = entry.avatarUrl || previous.avatarUrl
      session.commentCounts.set(key, previous)

      if (session.commentCounts.size > MAX_COMMENT_TRACKED) {
        const oldestKey = [...session.commentCounts.entries()].sort(
          (left, right) => left[1].count - right[1].count,
        )[0]?.[0]
        if (oldestKey) {
          session.commentCounts.delete(oldestKey)
        }
      }
    }
  }

  function recordGift(event = {}, { giftCatalog = [] } = {}) {
    const repeatCount = Math.max(1, Number(event.repeatCount || 1))
    const giftCoins = Number(event.giftCoins || 0)
    const catalogGift =
      giftCatalog.find((gift) => String(gift.id) === String(event.giftId || '')) ||
      giftCatalog.find((gift) => gift.name === event.giftName)
    const imageUrl =
      event.giftImageUrl ||
      event.giftPictureUrl ||
      catalogGift?.picture ||
      catalogGift?.imageUrl ||
      catalogGift?.animatedImageUrl ||
      ''

    const galleryEntry = {
      id: event.id || `${Date.now()}-${event.uniqueId}-${event.giftName}`,
      uniqueId: event.uniqueId,
      nickname: event.nickname || event.uniqueId,
      avatarUrl: event.avatarUrl || '',
      giftName: event.giftName || 'Gift',
      giftCoins,
      repeatCount,
      imageUrl,
      createdAt: event.createdAt || Date.now(),
    }

    session.giftGallery.unshift(galleryEntry)
    session.giftGallery.splice(MAX_GIFT_GALLERY)
    session.lastGiftAlert = galleryEntry

    const key = normalizeKey(event.uniqueId)
    if (key) {
      const previousCombo = session.comboByUser.get(key) || {
        uniqueId: event.uniqueId,
        nickname: galleryEntry.nickname,
        avatar: galleryEntry.avatarUrl,
        combo: 0,
        giftName: galleryEntry.giftName,
      }
      previousCombo.combo += repeatCount
      previousCombo.giftName = galleryEntry.giftName
      session.comboByUser.set(key, previousCombo)

      const previousPoints = session.pointsByUser.get(key) || {
        uniqueId: event.uniqueId,
        nickname: galleryEntry.nickname,
        avatar: galleryEntry.avatarUrl,
        points: 0,
      }
      previousPoints.points += giftCoins * repeatCount
      previousPoints.coins = previousPoints.points
      session.pointsByUser.set(key, previousPoints)
    }

    goalsAccumulator?.bump?.('coins', giftCoins * repeatCount)
    goalsAccumulator?.bump?.('gifts', repeatCount)
  }

  function buildTikTokSocketEvent(event = {}) {
    const base = {
      type: event.type,
      data: {
        uniqueId: event.uniqueId,
        nickname: event.nickname,
        user: {
          uniqueId: event.uniqueId,
          nickname: event.nickname,
          profilePictureUrl: event.avatarUrl || '',
        },
      },
    }

    if (event.type === 'like-burst') {
      base.type = 'like'
      base.data.likeCount = Number(event.likeCount || 1)
      base.data.totalLikeCount = Number(event.totalLikes || event.likeCount || 1)
    }

    if (event.type === 'gift') {
      const picture = event.giftImageUrl || event.giftPictureUrl || ''
      base.type = 'gift'
      base.data.giftId = event.giftId
      base.data.giftName = event.giftName
      base.data.giftCoins = Number(event.giftCoins || 0)
      base.data.giftImageUrl = picture
      base.data.giftPictureUrl = picture
      base.data.repeatCount = Number(event.repeatCount || 1)
      base.data.gift = {
        id: event.giftId,
        giftId: event.giftId,
        name: event.giftName,
        giftName: event.giftName,
        diamondCount: Number(event.giftCoins || 0),
        image: picture,
        icon: picture,
        picture,
      }
    }

    if (event.type === 'comment') {
      base.type = 'chat'
      base.data.comment = event.comment
    }

    if (event.type === 'follow') {
      base.type = 'follow'
    }

    if (event.type === 'share') {
      base.type = 'share'
    }

    return base
  }

  return {
    attachGoalsAccumulator(runtime) {
      goalsAccumulator = runtime
    },

    resetSession() {
      session.persistedWidgetData = {}
      session.chatMessages = []
      session.commentCounts.clear()
      session.giftGallery = []
      session.comboByUser.clear()
      session.pointsByUser.clear()
      session.lastGiftAlert = null
      session.winlife = { wins: 0, lives: 3 }
      goalsAccumulator?.reset?.()
    },

    resetWidgetSession(widgetName) {
      const normalized = String(widgetName || '').trim()
      if (normalized === 'top-likes') {
        delete session.persistedWidgetData['top-likes']
      }
      if (normalized === 'chat') {
        session.chatMessages = []
      }
      if (normalized === 'gift-gallery') {
        session.giftGallery = []
      }
      if (normalized === 'top-comments') {
        session.commentCounts.clear()
      }
      if (normalized === 'top-combo') {
        session.comboByUser.clear()
      }
      if (normalized === 'top-points') {
        session.pointsByUser.clear()
      }
    },

    getGoalsAccumulatorSnapshot() {
      return goalsAccumulator?.getSnapshot?.() || {
        isActive: false,
        likes: 0,
        coins: 0,
        gifts: 0,
        follows: 0,
        shares: 0,
        subscribers: 0,
      }
    },

    recordIncomingEvent(event = {}) {
      const state = getState()
      const giftCatalog = state.integrations?.tiktok?.giftCatalog || []
      const socketEvents = []

      if (event.type === 'comment') {
        recordChat(event)
        socketEvents.push(buildTikTokSocketEvent(event))
      }

      if (event.type === 'gift') {
        recordGift(event, { giftCatalog })
        const giftEvent = buildTikTokSocketEvent(event)
        socketEvents.push(giftEvent)
        socketEvents.push({ ...giftEvent, type: 'gift-solo' })
      }

      if (event.type === 'like-burst') {
        goalsAccumulator?.bump?.('likes', Number(event.likeCount || 1))
        socketEvents.push(buildTikTokSocketEvent(event))
      }

      if (event.type === 'follow') {
        goalsAccumulator?.bump?.('follows', 1)
        socketEvents.push(buildTikTokSocketEvent(event))
      }

      if (event.type === 'share') {
        goalsAccumulator?.bump?.('shares', 1)
        socketEvents.push(buildTikTokSocketEvent(event))
      }

      if (session.pointsByUser.size > 0) {
        schedulePointsSyncFromSession(session.pointsByUser)
      }

      return socketEvents
    },

    getGoalsApiConfig() {
      return {
        ok: true,
        config: flattenGoalConfig(getGoalsState()),
        accumulator: goalsAccumulator?.getSnapshot?.() || {
          isActive: false,
          likes: 0,
          coins: 0,
          gifts: 0,
          follows: 0,
          shares: 0,
          subscribers: 0,
        },
      }
    },

    async mergeGoalsApiConfig(patch = {}) {
      const state = getState()
      const parsedPatch = parseGoalPatch(patch)
      const nextGoals = {
        ...(state.goals || {}),
        ...parsedPatch,
        _timestamp: Date.now(),
      }

      if (typeof saveState === 'function') {
        await saveState({
          ...state,
          goals: nextGoals,
        })
      }

      return {
        ok: true,
        config: flattenGoalConfig(nextGoals),
      }
    },

    getWidgetApiConfig(widgetName) {
      return {
        ok: true,
        widget: widgetName,
        config: getWidgetRuntimeConfig(widgetName),
      }
    },

    async mergeWidgetApiConfig(widgetName, patch = {}) {
      const state = getState()
      const widgets = { ...(state.widgets || {}) }
      widgets[widgetName] = {
        ...(widgets[widgetName] || {}),
        ...(patch || {}),
      }

      if (typeof saveState === 'function') {
        await saveState({
          ...state,
          widgets,
        })
      }

      return {
        ok: true,
        widget: widgetName,
        config: getWidgetRuntimeConfig(widgetName),
      }
    },

    saveWidgetPersistedData(widgetName, data = {}) {
      const normalizedName = String(widgetName || '').trim()
      if (!normalizedName) {
        return
      }

      session.persistedWidgetData[normalizedName] = {
        ...(session.persistedWidgetData[normalizedName] || {}),
        ...(data || {}),
      }
    },

    getWidgetPersistedData(widgetName) {
      return session.persistedWidgetData[String(widgetName || '').trim()] || {}
    },

    getWidgetSessionData(widgetName) {
      if (widgetName === 'top-likes') {
        const persisted = session.persistedWidgetData['top-likes'] || {}
        if (persisted.users && typeof persisted.users === 'object') {
          return { users: persisted.users }
        }
        return {}
      }

      if (widgetName === 'chat') {
        return {
          messages: [...session.chatMessages],
        }
      }

      if (widgetName === 'gift-gallery') {
        return {
          gifts: [...session.giftGallery],
        }
      }

      if (widgetName === 'top-comments') {
        const users = Object.fromEntries(
          [...session.commentCounts.values()]
            .sort((left, right) => right.count - left.count)
            .slice(0, 20)
            .map((entry) => [
              entry.uniqueId,
              {
                uniqueId: entry.uniqueId,
                nickname: entry.nickname,
                avatar: entry.avatarUrl,
                comments: entry.count,
              },
            ]),
        )
        return { users }
      }

      if (widgetName === 'top-combo') {
        const users = Object.fromEntries(
          [...session.comboByUser.values()]
            .sort((left, right) => right.combo - left.combo)
            .slice(0, 20)
            .map((entry) => [
              entry.uniqueId,
              {
                uniqueId: entry.uniqueId,
                nickname: entry.nickname,
                avatar: entry.avatar,
                combo: entry.combo,
                giftName: entry.giftName,
              },
            ]),
        )
        return { users }
      }

      if (widgetName === 'top-points') {
        const users = Object.fromEntries(
          [...session.pointsByUser.values()]
            .sort((left, right) => right.points - left.points)
            .slice(0, 20)
            .map((entry) => [
              entry.uniqueId,
              {
                uniqueId: entry.uniqueId,
                nickname: entry.nickname,
                avatar: entry.avatar,
                points: entry.points,
              },
            ]),
        )
        return { users }
      }

      if (widgetName === 'winlife') {
        const config = getWidgetRuntimeConfig('winlife')
        return {
          wins: Number(config.wins ?? session.winlife.wins),
          lives: Number(config.lives ?? session.winlife.lives),
        }
      }

      return {}
    },

    buildGiftCatalogResponse() {
      const state = getState()
      const catalog = Array.isArray(state.integrations?.tiktok?.giftCatalog)
        ? state.integrations.tiktok.giftCatalog
        : []

      return {
        ok: true,
        gifts: catalog.map((gift) => ({
          id: gift.id,
          giftId: gift.id,
          name: gift.name,
          diamond: gift.coins,
          diamondCount: gift.coins,
          coins: gift.coins,
          picture: gift.picture || gift.imageUrl || '',
          image: gift.picture || gift.imageUrl || '',
          icon: gift.picture || gift.imageUrl || '',
          pictureList: gift.pictureList || (gift.imageUrl ? [gift.imageUrl] : []),
          imageUrl: gift.imageUrl || gift.picture || '',
          type: gift.type || 0,
          describe: gift.describe || '',
          category: gift.category || 'basic',
        })),
      }
    },
  }
}