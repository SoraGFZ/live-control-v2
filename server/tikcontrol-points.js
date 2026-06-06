import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getStorageDirectory } from './storage-paths.js'

function getPointsStorePath() {
  const dataDir = path.join(getStorageDirectory(), 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  return path.join(dataDir, 'points-data.json')
}

export function loadPointsData() {
  const storePath = getPointsStorePath()
  if (!existsSync(storePath)) {
    return { users: [], ui: {}, config: {} }
  }

  try {
    return JSON.parse(readFileSync(storePath, 'utf8'))
  } catch {
    return { users: [], ui: {}, config: {} }
  }
}

export function savePointsData(payload) {
  const storePath = getPointsStorePath()
  writeFileSync(storePath, JSON.stringify(payload, null, 2), 'utf8')
  return true
}

export function registerTikcontrolPointsRoutes(app) {
  app.post('/api/points/save', (request, response) => {
    try {
      const body = request.body
      if (!body || !Array.isArray(body.users)) {
        response.status(400).json({ ok: false, error: 'Invalid data format' })
        return
      }

      savePointsData(body)
      response.json({ ok: true, users: body.users.length, timestamp: Date.now() })
    } catch (error) {
      response.status(500).json({ ok: false, error: error.message })
    }
  })

  app.get('/api/points/load', (_request, response) => {
    try {
      response.json(loadPointsData())
    } catch (error) {
      response.status(500).json({ ok: false, error: error.message })
    }
  })

  app.get('/api/points/stats', (_request, response) => {
    try {
      const users = loadPointsData().users || []
      response.json({
        totalUsers: users.length,
        totalPoints: users.reduce((sum, user) => sum + Number(user.points || 0), 0),
        totalCoins: users.reduce((sum, user) => sum + Number(user.coins || 0), 0),
        topByPoints: [...users]
          .sort((a, b) => Number(b.points || 0) - Number(a.points || 0))
          .slice(0, 10)
          .map((user) => ({
            uniqueId: user.uniqueId,
            nickname: user.nickname,
            points: user.points || 0,
          })),
        topByCoins: [...users]
          .sort((a, b) => Number(b.coins || 0) - Number(a.coins || 0))
          .slice(0, 10)
          .map((user) => ({
            uniqueId: user.uniqueId,
            nickname: user.nickname,
            coins: user.coins || 0,
          })),
      })
    } catch (error) {
      response.status(500).json({ ok: false, error: error.message })
    }
  })
}