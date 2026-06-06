import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getStorageDirectory } from './storage-paths.js'
import { POPULAR_SOUND_LIBRARY, searchMyInstantsSounds } from './myinstants-search.js'

function getFavoritesPath() {
  const directory = path.join(getStorageDirectory(), 'sounds')
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }
  return path.join(directory, 'favorites.json')
}

function readFavorites() {
  const filePath = getFavoritesPath()
  if (!existsSync(filePath)) {
    return []
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeFavorites(items) {
  writeFileSync(getFavoritesPath(), JSON.stringify(items, null, 2), 'utf8')
}

export function registerTikcontrolSoundsRoutes(app) {
  app.get('/api/sounds/cached', (request, response) => {
    const sourceUrl = String(request.query.url || '').trim()

    if (!sourceUrl) {
      response.status(400).json({ success: false, error: 'url requerida', url: null })
      return
    }

    response.json({
      success: true,
      url: sourceUrl,
      cached: false,
    })
  })

  app.get('/api/sounds/library', (_request, response) => {
    response.json({
      ok: true,
      ...POPULAR_SOUND_LIBRARY,
      favorites: readFavorites(),
    })
  })

  app.get('/api/sounds/favorites', (_request, response) => {
    response.json({ ok: true, results: readFavorites() })
  })

  app.post('/api/sounds/favorites', (request, response) => {
    const sound = request.body || {}
    const url = String(sound.url || '').trim()

    if (!url) {
      response.status(400).json({ ok: false, error: 'URL requerida' })
      return
    }

    const favorites = readFavorites()
    if (!favorites.some((item) => item.url === url)) {
      favorites.unshift({
        id: String(sound.id || url),
        title: String(sound.title || sound.name || 'Sonido'),
        url,
        addedAt: new Date().toISOString(),
      })
      writeFavorites(favorites.slice(0, 200))
    }

    response.json({ ok: true, results: readFavorites() })
  })

  app.delete('/api/sounds/favorites', (request, response) => {
    const url = String(request.query.url || request.body?.url || '').trim()
    const favorites = readFavorites().filter((item) => item.url !== url)
    writeFavorites(favorites)
    response.json({ ok: true, results: favorites })
  })

  app.get('/api/sounds/search', async (request, response) => {
    const query = String(request.query.q || request.query.name || '').trim()
    const page = Math.max(1, Number(request.query.page || 1))

    try {
      const payload = await searchMyInstantsSounds(query, { page, limit: 30 })
      response.json(payload)
    } catch (error) {
      response.status(500).json({ ok: false, error: error.message, results: [] })
    }
  })

  app.get('/api/sounds/viral', async (_request, response) => {
    try {
      const payload = await searchMyInstantsSounds('viral', { limit: 20 })
      response.json(payload)
    } catch (error) {
      response.json({ ok: true, results: POPULAR_SOUND_LIBRARY.myinstants.tiktok_trends })
    }
  })
}