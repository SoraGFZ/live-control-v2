/**
 * Búsqueda MyInstants (patrón TikControl): API JSON + fallback HTML.
 */

const MYINSTANTS_ORIGIN = 'https://www.myinstants.com'

function normalizeMyInstantsUrl(pathOrUrl) {
  const raw = String(pathOrUrl || '').trim()
  if (!raw) {
    return ''
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw
  }
  return `${MYINSTANTS_ORIGIN}${raw.startsWith('/') ? '' : '/'}${raw}`
}

function parseSoundsFromHtml(html) {
  const results = []
  const seen = new Set()

  try {
    const mediaPattern = /\/media\/sounds\/([^"']+\.mp3)/g
    let match = null

    while ((match = mediaPattern.exec(html)) !== null) {
      const fileName = match[1]
      const url = `${MYINSTANTS_ORIGIN}/media/sounds/${fileName}`

      if (seen.has(url)) {
        continue
      }

      seen.add(url)
      const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const nameMatch = html.match(
        new RegExp(`data-name="([^"]+)"[^>]*data-url="[^"]*${escaped}"`, 'i'),
      )
      let title = fileName.replace('.mp3', '').replace(/_/g, ' ').replace(/-/g, ' ').trim()
      if (nameMatch?.[1]) {
        title = nameMatch[1]
      }

      results.push({
        id: fileName.replace('.mp3', ''),
        title,
        name: title,
        url,
      })
    }

    const onclickPattern = /onclick="play\('([^']+)',\s*'([^']+)'/g
    while ((match = onclickPattern.exec(html)) !== null) {
      const title = match[1]
      const path = match[2]
      const url = normalizeMyInstantsUrl(path)

      if (!url.includes('.mp3') || seen.has(url)) {
        continue
      }

      seen.add(url)
      results.push({
        id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title,
        name: title,
        url,
      })
    }
  } catch (error) {
    console.warn('[myinstants] parse error:', error.message)
  }

  return results
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    throw new Error(`MyInstants HTTP ${response.status}`)
  }

  return response.text()
}

async function fetchJsonApi(query, page = 1) {
  const params = new URLSearchParams()
  if (query) {
    params.set('name', query)
  }
  params.set('page', String(page))

  const response = await fetch(`https://www.myinstants.com/api/v1/instant/?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })

  if (!response.ok) {
    return []
  }

  const payload = await response.json()
  const rows = Array.isArray(payload?.results) ? payload.results : []

  return rows
    .map((row) => {
      const soundPath = row?.sound || row?.url || ''
      const url = normalizeMyInstantsUrl(soundPath)
      if (!url) {
        return null
      }
      return {
        id: String(row.id || row.slug || url),
        title: String(row.name || 'Sonido'),
        name: String(row.name || 'Sonido'),
        url,
      }
    })
    .filter(Boolean)
}

export async function searchMyInstantsSounds(query = '', { page = 1, limit = 25 } = {}) {
  const needle = String(query || '').trim()
  let results = []

  if (needle) {
    try {
      results = await fetchJsonApi(needle, page)
    } catch {
      results = []
    }
  }

  if (!results.length) {
    const path = needle
      ? `/es/search/?name=${encodeURIComponent(needle)}`
      : '/es/index/es/'
    const html = await fetchHtml(`${MYINSTANTS_ORIGIN}${path}`)
    results = parseSoundsFromHtml(html)
  }

  return {
    ok: true,
    query: needle,
    results: results.slice(0, Math.max(1, Math.min(limit, 50))),
  }
}

export const POPULAR_SOUND_LIBRARY = {
  myinstants: {
    popular: [
      { title: 'Applause', url: `${MYINSTANTS_ORIGIN}/media/sounds/applause.mp3` },
      { title: 'Crickets', url: `${MYINSTANTS_ORIGIN}/media/sounds/crickets.mp3` },
      { title: 'Wrong Answer', url: `${MYINSTANTS_ORIGIN}/media/sounds/wrong-answer-sound-effect.mp3` },
      { title: 'Air Horn', url: `${MYINSTANTS_ORIGIN}/media/sounds/mlg-air-horn.mp3` },
      { title: 'Sad Violin', url: `${MYINSTANTS_ORIGIN}/media/sounds/sad-violin-the-meme-one.mp3` },
    ],
    tiktok_trends: [
      { title: 'Oh No', url: `${MYINSTANTS_ORIGIN}/media/sounds/oh-no-no-no-no.mp3` },
      { title: 'Vine Boom', url: `${MYINSTANTS_ORIGIN}/media/sounds/vine-boom.mp3` },
      { title: 'Emotional Damage', url: `${MYINSTANTS_ORIGIN}/media/sounds/emotional-damage-meme.mp3` },
    ],
  },
}