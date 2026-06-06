import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getStorageDirectory } from './storage-paths.js'
import { loadPointsData, savePointsData } from './tikcontrol-points.js'


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

export function createGoalsAccumulatorRuntime(socketIo) {
  const accumulator = {
    isActive: false,
    likes: 0,
    coins: 0,
    gifts: 0,
    follows: 0,
    shares: 0,
    subscribers: 0,
    startedAt: 0,
  }

  function snapshot(metric = '') {
    return {
      ...accumulator,
      metric,
      current: metric ? Number(accumulator[metric] || 0) : 0,
    }
  }

  function emit(metric) {
    if (!socketIo) {
      return
    }
    socketIo.emit('goals:accumulator:update', snapshot(metric))
  }

  function bump(metric, amount = 1) {
    if (!metric) {
      return
    }
    if (!accumulator.isActive) {
      accumulator.isActive = true
      accumulator.startedAt = Date.now()
    }
    accumulator[metric] = Number(accumulator[metric] || 0) + Number(amount || 0)
    emit(metric)
  }

  function reset() {
    accumulator.isActive = false
    accumulator.likes = 0
    accumulator.coins = 0
    accumulator.gifts = 0
    accumulator.follows = 0
    accumulator.shares = 0
    accumulator.subscribers = 0
    accumulator.startedAt = 0
    emit('')
  }

  return {
    getSnapshot: () => ({ ...accumulator }),
    bump,
    reset,
    emit,
  }
}

export function createTimerRuntime(socketIo) {
  const state = {
    isRunning: false,
    totalSeconds: 300,
    remainingSeconds: 300,
    updatedAt: Date.now(),
  }

  let config = readWidgetJson('timer.json') || {
    fontSize: 72,
    textColor: '#ffffff',
    showLabels: true,
    showDays: false,
  }

  let tickTimer = null

  function broadcast() {
    if (!socketIo) {
      return
    }
    socketIo.emit('timer', { config, state: { ...state } })
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  function startTick() {
    stopTick()
    if (!state.isRunning) {
      return
    }
    tickTimer = setInterval(() => {
      if (!state.isRunning) {
        stopTick()
        return
      }
      state.remainingSeconds = Math.max(0, Number(state.remainingSeconds || 0) - 1)
      state.updatedAt = Date.now()
      broadcast()
      if (state.remainingSeconds <= 0) {
        state.isRunning = false
        stopTick()
      }
    }, 1000)
  }

  return {
    getConfig: () => ({ ...config }),
    getState: () => ({ ...state }),
    setConfig(patch = {}) {
      config = { ...config, ...(patch || {}) }
      writeWidgetJson('timer.json', config)
      broadcast()
      return config
    },
    control(command = {}, body = {}) {
      const action = String(command.action || body.action || '').trim().toLowerCase()

      if (action === 'start' || action === 'resume') {
        state.isRunning = true
        if (body.seconds !== undefined) {
          state.remainingSeconds = Number(body.seconds)
        }
        if (body.totalSeconds !== undefined) {
          state.totalSeconds = Number(body.totalSeconds)
        }
        startTick()
      } else if (action === 'pause' || action === 'stop') {
        state.isRunning = false
        stopTick()
      } else if (action === 'reset') {
        state.isRunning = false
        state.remainingSeconds = Number(body.seconds ?? config.duration ?? state.totalSeconds ?? 300)
        state.totalSeconds = Number(body.totalSeconds ?? state.remainingSeconds)
        stopTick()
      } else if (body.remainingSeconds !== undefined) {
        state.remainingSeconds = Number(body.remainingSeconds)
        state.totalSeconds = Number(body.totalSeconds ?? state.totalSeconds)
      }

      state.updatedAt = Date.now()
      writeWidgetJson('timer-state.json', state)
      broadcast()
      return { config, state: { ...state } }
    },
    loadPersisted() {
      const saved = readWidgetJson('timer-state.json')
      if (saved && typeof saved === 'object') {
        Object.assign(state, saved)
        state.isRunning = false
      }
      broadcast()
    },
  }
}

let pointsSyncTimer = null

export function schedulePointsSyncFromSession(sessionPointsByUser) {
  if (pointsSyncTimer) {
    return
  }
  pointsSyncTimer = setTimeout(() => {
    pointsSyncTimer = null
    try {
      const store = loadPointsData()
      const users = Array.isArray(store.users) ? [...store.users] : []
      const byId = new Map(users.map((user) => [String(user.uniqueId || '').toLowerCase(), user]))

      for (const entry of sessionPointsByUser.values()) {
        const key = String(entry.uniqueId || '').toLowerCase()
        if (!key) {
          continue
        }
        const previous = byId.get(key) || {
          uniqueId: entry.uniqueId,
          nickname: entry.nickname,
          points: 0,
          coins: 0,
        }
        previous.nickname = entry.nickname || previous.nickname
        previous.points = Math.max(Number(previous.points || 0), Number(entry.points || 0))
        previous.coins = Math.max(Number(previous.coins || 0), Number(entry.points || 0))
        byId.set(key, previous)
      }

      savePointsData({
        ...store,
        users: Array.from(byId.values()),
      })
    } catch (error) {
      console.warn('[points] sync:', error.message)
    }
  }, 2000)
}

export function registerTikcontrolRuntimeExtras(
  app,
  { socketIo, widgetRuntime, goalsAccumulator, timerRuntime, auctionRuntime } = {},
) {
  app.get('/api/goals/accumulator', (_request, response) => {
    response.json({
      ok: true,
      accumulator: goalsAccumulator?.getSnapshot?.() || {},
    })
  })

  app.post('/api/goals/accumulator/reset', (_request, response) => {
    goalsAccumulator?.reset?.()
    response.json({ ok: true })
  })

  app.get('/api/widgets/timer/state', (_request, response) => {
    response.json({
      ok: true,
      config: timerRuntime?.getConfig?.() || {},
      state: timerRuntime?.getState?.() || {},
    })
  })

  app.post('/api/widgets/timer/control', (request, response) => {
    const payload = timerRuntime?.control?.(request.body || {}, request.body || {}) || {}
    response.json({ ok: true, ...payload })
  })

  app.get('/api/widgets/timer/config', (_request, response) => {
    response.json({ ok: true, config: timerRuntime?.getConfig?.() || {} })
  })

  app.post('/api/widgets/timer/config', (request, response) => {
    const config = timerRuntime?.setConfig?.(request.body?.config || request.body || {})
    response.json({ ok: true, config })
  })

  const rankingWidgets = ['top-likes', 'top-donors', 'top-comments', 'top-combo', 'top-points', 'top-gift']

  rankingWidgets.forEach((widgetId) => {
    app.post(`/api/widgets/${widgetId}/reset`, (_request, response) => {
      if (widgetRuntime?.resetWidgetSession) {
        widgetRuntime.resetWidgetSession(widgetId)
      }
      writeWidgetJson(`${widgetId}.json`, { config: {}, data: {}, comments: {}, resetAt: Date.now() })
      response.json({ ok: true, widget: widgetId })
    })

    app.get(`/api/widgets/${widgetId}/data`, (_request, response) => {
      const data = widgetRuntime?.getWidgetSessionData?.(widgetId) || {}
      response.json({ ok: true, widget: widgetId, data })
    })
  })

  if (timerRuntime?.loadPersisted) {
    timerRuntime.loadPersisted()
  }

  if (socketIo && widgetRuntime?.attachGoalsAccumulator) {
    widgetRuntime.attachGoalsAccumulator(goalsAccumulator)
  }

}