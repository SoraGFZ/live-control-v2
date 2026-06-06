import path from 'node:path'
import { existsSync } from 'node:fs'
import express from 'express'
import { buildTikControlGiftPayload } from './tikcontrol-gifts.js'

const WIDGET_FILE_ALIASES = {
  'top-gifts': 'top-donors',
}

const WIDGET_CONFIG_KEYS = {
  'top-likes': 'topLikes',
  'top-donors': 'topGifts',
  'top-gift': 'topGifts',
  'top-comments': 'topComments',
  'top-combo': 'topCombo',
  'top-points': 'topPoints',
  'top-rotation': 'topRotation',
  'gift-alert': 'giftAlert',
  'gift-gallery': 'giftGallery',
  'gift-battle': 'giftBattle',
  'chat': 'chat',
  'timer': 'timer',
  'roulette': 'roulette',
  'poll': 'poll',
  'ranks': 'ranks',
  'winlife': 'winlife',
  'gaming-hud': 'gamingHud',
  'smart-bar': 'smartBar',
}

export function resolveWidgetStorageKey(widgetName) {
  return WIDGET_CONFIG_KEYS[widgetName] || widgetName
}

export function buildTopLikesWidgetConfig(widgets = {}) {
  const source = widgets.topLikes || {}
  const accent = source.accentColor || '#ff4d6d'
  const rows = Number.parseInt(String(source.maxVisible || source.rows || '5'), 10) || 5

  return {
    title: source.title || 'TOP LIKES',
    showTitle: source.showTitle !== false,
    rows,
    maxDisplay: rows,
    showAvatars: source.showAvatar !== false,
    showNicknames: source.showUsername !== false,
    showUsername: source.showUsername !== false,
    showMedals: source.showRank !== false,
    showCrown: source.showCrown === true,
    showRowBg: source.showRowBg !== false,
    showBg: source.showBg === true,
    compactMode: source.compactMode === true,
    avatarFrameStyle: source.avatarFrameStyle || 'classic',
    valueColor: accent,
    titleColor: source.titleColor || '#ffffff',
    textColor: source.textColor || '#ffffff',
    colorTop1: source.colorTop1 || '#ffd700',
    colorTop2: source.colorTop2 || '#c0c0c0',
    colorTop3: source.colorTop3 || '#cd7f32',
    fontSize: Number.parseInt(String(source.fontSize || '22'), 10) || 22,
    titleSize: Number.parseInt(String(source.titleSize || '34'), 10) || 34,
    nameMaxLen: Number.parseInt(String(source.nameMaxLen || '20'), 10) || 20,
    strokeEnabled: source.strokeEnabled === true,
    strokeColor: source.strokeColor || '#000000',
    strokeWidth: Number.parseInt(String(source.strokeWidth || '2'), 10) || 2,
    animIcon: source.animIcon || source.animHeart || 'none',
    animTop1: source.animTop1 || 'none',
    titleEffect: source.titleEffect || source.effectTitle || 'none',
    effectText: source.effectText || source.animText || 'none',
    fontFamily: source.fontFamily || '',
    fontUrl: source.fontUrl || '',
  }
}

export function buildTopDonorsWidgetConfig(widgets = {}) {
  const source = widgets.topGifts || {}
  const accent = source.accentColor || '#ffd978'
  const rows = Number.parseInt(String(source.maxVisible || source.rows || '5'), 10) || 5

  return {
    title: source.title || 'TOP GIFTS',
    showTitle: source.showTitle !== false,
    rows,
    maxDisplay: rows,
    showAvatars: source.showAvatar !== false,
    showNicknames: source.showUsername !== false,
    showUsername: source.showUsername !== false,
    showMedals: source.showRank !== false,
    showCrown: source.showCrown === true,
    showRowBg: source.showRowBg !== false,
    showBg: source.showBg === true,
    compactMode: source.compactMode === true,
    avatarFrameStyle: source.avatarFrameStyle || 'classic',
    valueColor: accent,
    titleColor: source.titleColor || '#fff9eb',
    textColor: source.textColor || '#f8fafc',
    colorTop1: source.colorTop1 || '#ffd700',
    colorTop2: source.colorTop2 || '#c0c0c0',
    colorTop3: source.colorTop3 || '#cd7f32',
    fontSize: Number.parseInt(String(source.fontSize || '22'), 10) || 22,
    titleSize: Number.parseInt(String(source.titleSize || '34'), 10) || 34,
    nameMaxLen: Number.parseInt(String(source.nameMaxLen || '20'), 10) || 20,
    strokeEnabled: source.strokeEnabled === true,
    strokeColor: source.strokeColor || '#000000',
    strokeWidth: Number.parseInt(String(source.strokeWidth || '2'), 10) || 2,
    animIcon: source.animIcon || source.animCoin || 'none',
    animTop1: source.animTop1 || 'none',
    titleEffect: source.titleEffect || source.effectTitle || 'none',
    effectText: source.effectText || source.animText || 'none',
    fontFamily: source.fontFamily || '',
    fontUrl: source.fontUrl || '',
  }
}

export function buildWidgetConfigForName(widgetName, widgets = {}) {
  if (widgetName === 'top-likes') {
    return buildTopLikesWidgetConfig(widgets)
  }

  if (widgetName === 'top-donors' || widgetName === 'top-gift') {
    return buildTopDonorsWidgetConfig(widgets)
  }

  if (widgetName === 'top-comments') {
    const source = widgets.topComments || {}
    return {
      title: source.title || 'TOP CHAT',
      rows: Number.parseInt(String(source.maxVisible || source.rows || '5'), 10) || 5,
      showAvatars: source.showAvatar !== false,
      showNicknames: true,
    }
  }

  if (widgetName === 'smart-bar') {
    const source = widgets.smartBar || {}
    return {
      title: source.title || 'Marcador del live',
      showWins: source.showWins !== false,
      showCoins: source.showCoins !== false,
      showFollows: source.showFollows !== false,
      showLiveDuration: source.showLiveDuration !== false,
      winGoal: source.winGoal || '5',
    }
  }

  const storageKey = resolveWidgetStorageKey(widgetName)
  const source = widgets?.[storageKey] || widgets?.[widgetName] || {}

  return {
    title: source.title || widgetName,
    ...source,
  }
}

export function leaderboardUsersFromTopLikes(topLikes = []) {
  return Object.fromEntries(
    topLikes.map((entry) => [
      entry.uniqueId,
      {
        uniqueId: entry.uniqueId,
        nickname: entry.nickname || entry.uniqueId,
        avatar: entry.avatarUrl || '',
        likes: Number(entry.totalLikes || 0),
        lastUpdate: Date.now(),
      },
    ]),
  )
}

export function leaderboardUsersFromTopGifts(topGifts = []) {
  return Object.fromEntries(
    topGifts.map((entry) => [
      entry.uniqueId,
      {
        uniqueId: entry.uniqueId,
        nickname: entry.nickname || entry.uniqueId,
        avatar: entry.avatarUrl || '',
        coins: Number(entry.totalCoins || 0),
        gifts: Number(entry.giftCount || 0),
        topGiftName: entry.topGiftName || '',
        lastUpdate: Date.now(),
      },
    ]),
  )
}

export function buildWidgetDataForName(widgetName, leaderboards = {}) {
  if (widgetName === 'top-likes') {
    return {
      users: leaderboardUsersFromTopLikes(leaderboards.topLikes || []),
    }
  }

  if (widgetName === 'top-donors') {
    return {
      users: leaderboardUsersFromTopGifts(leaderboards.topGifts || []),
    }
  }

  if (widgetName === 'top-gift') {
    const [topEntry] = leaderboards.topGifts || []
    return {
      topGift: topEntry
        ? {
            nickname: topEntry.nickname,
            giftName: topEntry.topGiftName,
            coins: topEntry.totalCoins,
          }
        : null,
    }
  }

  return {}
}

export function buildTikTokLikeEvent(event = {}) {
  return {
    type: 'like',
    data: {
      uniqueId: event.uniqueId,
      nickname: event.nickname,
      likeCount: Number(event.likeCount || 1),
      user: {
        uniqueId: event.uniqueId,
        nickname: event.nickname,
        profilePictureUrl: event.avatarUrl || '',
        avatarUrl: event.avatarUrl || '',
      },
    },
  }
}

export function buildTikTokGiftEvent(event = {}, catalog = [], extractImageUrl = null) {
  if (typeof extractImageUrl === 'function') {
    return buildTikControlGiftPayload(event, catalog, extractImageUrl)
  }

  const picture = event.giftImageUrl || event.giftPictureUrl || event.gift?.picture || ''

  return {
    type: 'gift',
    data: {
      uniqueId: event.uniqueId,
      nickname: event.nickname,
      giftId: event.giftId,
      giftName: event.giftName,
      giftCoins: Number(event.giftCoins || 0),
      giftImageUrl: picture,
      giftPictureUrl: picture,
      repeatCount: Number(event.repeatCount || 1),
      user: {
        uniqueId: event.uniqueId,
        nickname: event.nickname,
        profilePictureUrl: event.avatarUrl || '',
        avatarUrl: event.avatarUrl || '',
      },
      gift: {
        id: event.giftId,
        giftId: event.giftId,
        name: event.giftName,
        giftName: event.giftName,
        diamondCount: Number(event.giftCoins || 0),
        image: picture,
        icon: picture,
        picture,
      },
    },
  }
}

export function buildTikTokChatEvent(event = {}) {
  return {
    type: 'chat',
    data: {
      uniqueId: event.uniqueId,
      nickname: event.nickname,
      comment: event.comment,
      user: {
        uniqueId: event.uniqueId,
        nickname: event.nickname,
        profilePictureUrl: event.avatarUrl || '',
      },
    },
  }
}

export function buildTikTokFollowEvent(event = {}) {
  return {
    type: 'follow',
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
}

export function buildTikTokShareEvent(event = {}) {
  return {
    type: 'share',
    data: event,
  }
}

export function mapIncomingEventToTikControlMessages(event = {}, options = {}) {
  const { giftCatalog = [], extractImageUrl = null } = options
  const messages = []

  switch (event.type) {
    case 'like-burst':
      messages.push(buildTikTokLikeEvent(event))
      break
    case 'gift':
      messages.push(buildTikTokGiftEvent(event, giftCatalog, extractImageUrl))
      messages.push({
        type: 'widget:trigger',
        widget: 'gift-alert',
        data: buildTikTokGiftEvent(event).data,
      })
      messages.push({
        type: 'widget:trigger',
        widget: 'gift-cannon',
        data: buildTikTokGiftEvent(event).data,
      })
      messages.push({
        type: 'widget:trigger',
        widget: 'firework',
        data: buildTikTokGiftEvent(event).data,
      })
      break
    case 'comment':
      messages.push(buildTikTokChatEvent(event))
      break
    case 'follow':
      messages.push(buildTikTokFollowEvent(event))
      break
    case 'share':
      messages.push(buildTikTokShareEvent(event))
      break
    default:
      break
  }

  return messages
}

export function buildWidgetOverlayPayload({
  widgetName,
  widgets,
  leaderboards,
  smartBar,
}) {
  return {
    widgetConfig: buildWidgetConfigForName(widgetName, widgets),
    widgetData: buildWidgetDataForName(widgetName, leaderboards),
    smartBar,
    leaderboards,
  }
}

function patchWidgetHtml(html, { overlayKey = '' } = {}) {
  let nextHtml = String(html || '')

  nextHtml = nextHtml.replace(
    /<script src="\/widgets\/core\/env\.js[^"]*"><\/script>/i,
    '<script src="/widgets/core/live-control-env.js"></script>',
  )

  nextHtml = nextHtml.replace(
    /<script src="(?:\/widgets\/)?core\/tikcontrol-widget\.js[^"]*"><\/script>/gi,
    '<script src="/widgets/core/live-control-tikcontrol-widget.js"></script>',
  )

  nextHtml = nextHtml.replace(
    /<script src="(?:\/widgets\/)?tikcontrol-widget-base\.js[^"]*"><\/script>/gi,
    '<script src="/widgets/core/live-control-tikcontrol-widget.js"></script>',
  )

  if (overlayKey && !nextHtml.includes('live-control-widget-key')) {
    nextHtml = nextHtml.replace(
      '</head>',
      `<script id="live-control-widget-key">window.__lcOverlayKey=${JSON.stringify(overlayKey)};</script></head>`,
    )
  }

  return nextHtml
}

function patchGoalsHtml(html) {
  let nextHtml = String(html || '')

  if (!nextHtml.includes('live-control-goals-bridge')) {
    nextHtml = nextHtml.replace(
      /<head>/i,
      '<head><script src="/goals/live-control-goals-bridge.js"></script>',
    )
  }

  return nextHtml
}

export function registerTikcontrolWidgetRoutes(app, options = {}) {
  const {
    projectRoot,
    readOverlayKey = () => '',
    widgetRuntime = null,
    getWidgetRuntimePayload = () => ({}),
    getGiftCatalogResponse = null,
    onWidgetConfigSaved = null,
    onGoalsConfigSaved = null,
  } = options

  const widgetsDirectory = path.join(projectRoot, 'public', 'widgets')
  const goalsDirectory = path.join(projectRoot, 'public', 'goals')
  const distWidgetsDirectory = path.join(projectRoot, 'dist', 'widgets')
  const distGoalsDirectory = path.join(projectRoot, 'dist', 'goals')

  app.get('/goals/:goalFile', (request, response, next) => {
    const goalFile = String(request.params.goalFile || '').trim()

    if (!goalFile.endsWith('.html')) {
      next()
      return
    }

    const sourceDirectory = existsSync(distGoalsDirectory) ? distGoalsDirectory : goalsDirectory
    const sourcePath = path.join(sourceDirectory, goalFile)

    if (!existsSync(sourcePath)) {
      response.status(404).send(`Goal no encontrado: ${goalFile}`)
      return
    }

    import('node:fs/promises')
      .then(({ readFile }) => readFile(sourcePath, 'utf8'))
      .then((html) => {
        response
          .type('html')
          .setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate')
          .send(patchGoalsHtml(html))
      })
      .catch((error) => {
        response.status(500).send(error.message)
      })
  })

  app.get('/widgets/:widgetFile', (request, response, next) => {
    const widgetFile = String(request.params.widgetFile || '').trim()

    if (!widgetFile.endsWith('.html')) {
      next()
      return
    }

    const widgetName = widgetFile.replace(/\.html$/i, '')
    const resolvedName = WIDGET_FILE_ALIASES[widgetName] || widgetName
    const sourceDirectory = existsSync(distWidgetsDirectory) ? distWidgetsDirectory : widgetsDirectory
    const sourcePath = path.join(sourceDirectory, `${resolvedName}.html`)

    if (!existsSync(sourcePath)) {
      response.status(404).send(`Widget no encontrado: ${widgetName}`)
      return
    }

    import('node:fs/promises')
      .then(({ readFile }) => readFile(sourcePath, 'utf8'))
      .then((html) => {
        const overlayKey = String(request.query.key || readOverlayKey() || '').trim()
        response
          .type('html')
          .setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate')
          .send(patchWidgetHtml(html, { overlayKey }))
      })
      .catch((error) => {
        response.status(500).send(error.message)
      })
  })

  app.use('/widgets', express.static(existsSync(distWidgetsDirectory) ? distWidgetsDirectory : widgetsDirectory))
  app.use('/goals', express.static(existsSync(distGoalsDirectory) ? distGoalsDirectory : goalsDirectory))

  app.get('/api/goals/config', (_request, response) => {
    if (widgetRuntime) {
      response.json(widgetRuntime.getGoalsApiConfig())
      return
    }

    response.json({ ok: true, config: { _timestamp: Date.now() } })
  })

  app.post('/api/goals/config', async (request, response) => {
    if (!widgetRuntime) {
      response.status(503).json({ ok: false, error: 'Goals runtime no disponible.' })
      return
    }

    const payload = await widgetRuntime.mergeGoalsApiConfig(request.body || {})
    options.onGoalsConfigSaved?.(payload)
    response.json(payload)
  })

  app.get('/api/goals/styles', (_request, response) => {
    response.json({
      ok: true,
      styles: [
        { id: 'cleanneon', name: 'Clean Neon', file: 'cleanneon.png' },
        { id: 'army', name: 'Army', file: 'army.png' },
        { id: 'aurous', name: 'Aurous', file: 'aurous.png' },
        { id: 'clarity', name: 'Clarity', file: 'clarity.png' },
        { id: 'pure', name: 'Pure', file: 'pure.png' },
        { id: 'quantum', name: 'Quantum', file: 'quantum.png' },
        { id: 'raven', name: 'Raven', file: 'raven.png' },
      ].map((style) => ({
        ...style,
        url: `https://tikcontrol.live/goals/styles/${style.file}`,
      })),
    })
  })

  app.get('/api/gifts/regions', (_request, response) => {
    if (typeof getGiftCatalogResponse === 'function' && getGiftCatalogResponse.regions) {
      response.json(getGiftCatalogResponse.regions())
      return
    }

    import('./tikcontrol-gifts.js')
      .then(({ GIFT_REGIONS }) => {
        response.json({ ok: true, regions: GIFT_REGIONS })
      })
      .catch(() => {
        response.json({ ok: true, regions: [] })
      })
  })

  app.get('/api/gifts/catalog', async (request, response) => {
    if (typeof getGiftCatalogResponse === 'function') {
      try {
        const payload = await getGiftCatalogResponse(request.query || {})
        response.json(payload)
        return
      } catch (error) {
        response.status(500).json({ ok: false, error: error.message })
        return
      }
    }

    if (widgetRuntime) {
      response.json(widgetRuntime.buildGiftCatalogResponse())
      return
    }

    response.json({ ok: true, gifts: [] })
  })

  app.get('/api/widgets/chat/v2/config', (_request, response) => {
    if (widgetRuntime) {
      response.json(widgetRuntime.getWidgetApiConfig('chat'))
      return
    }

    response.json({ ok: true, config: {} })
  })

  app.get('/api/widgets/:widgetName/config', (request, response) => {
    const widgetName = String(request.params.widgetName || '').trim()

    if (widgetRuntime) {
      const runtime = getWidgetRuntimePayload(widgetName)
      response.json({
        ok: true,
        widget: widgetName,
        config:
          runtime.widgetConfig ||
          widgetRuntime.getWidgetApiConfig(widgetName).config ||
          buildWidgetConfigForName(widgetName, runtime.widgets || {}),
        data: {
          ...(runtime.widgetData || buildWidgetDataForName(widgetName, runtime.leaderboards || {})),
          ...widgetRuntime.getWidgetSessionData(widgetName),
        },
      })
      return
    }

    const runtime = getWidgetRuntimePayload(widgetName)
    response.json({
      ok: true,
      widget: widgetName,
      config: runtime.widgetConfig || buildWidgetConfigForName(widgetName, runtime.widgets || {}),
      data: runtime.widgetData || buildWidgetDataForName(widgetName, runtime.leaderboards || {}),
    })
  })

  app.post('/api/widgets/:widgetName/config', async (request, response) => {
    const widgetName = String(request.params.widgetName || '').trim()

    if (!widgetRuntime) {
      response.status(503).json({ ok: false, error: 'Widget runtime no disponible.' })
      return
    }

    const payload = await widgetRuntime.mergeWidgetApiConfig(widgetName, request.body || {})
    onWidgetConfigSaved?.(widgetName, payload)
    response.json(payload)
  })

  app.get('/api/widgets/catalog', (_request, response) => {
    response.json({
      ok: true,
      widgetsDirectory: '/widgets/',
      goalsDirectory: '/goals/',
    })
  })
}