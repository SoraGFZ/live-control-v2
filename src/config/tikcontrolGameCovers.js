/**
 * Portadas de juegos desde CDN TikControl (misma fuente que la app oficial).
 */
const COVER_OVERRIDES = {
  minecraft: '/game-covers/minecraft.jpg',
  'gtav-chaos': '/game-covers/gta-v-caratula-fan.jpg',
  gtav: '/game-covers/gta-v-caratula-fan.jpg',
  'tikcontrol-bedrockbox': '/game-covers/minecraft.jpg',
  'tikcontrol-oneblock': '/game-covers/minecraft.jpg',
  lethalcompany: 'lethal-company',
  'lethal-company': 'lethal-company',
  'supermarket-together': 'supermarket',
  supermarketsimulator: 'supermarketsimulator',
  'supermarket-simulator': 'supermarketsimulator',
  'geometry-dash': 'geometrydash',
  'bloons-td6': 'bloonstd6',
  'risk-of-rain-2': 'ror2',
  'resident-evil-4': 're4',
  'schedule-1': 'schedule1',
  'ghost-watchers': 'ghostwatchers',
  'rv-there-yet': 'rvtheryet',
  'water-park-simulator': 'waterparksimulator',
  'left-4-dead-2': 'left4dead2',
  'hollow-knight-silksong': 'hksilksong',
  'card-shop-simulator': 'cardshopsimulator',
  'ranch-simulator': 'ranchsimulator',
  'roadside-research': 'roadsideresearch',
  'egg-ing-on': 'eggingon',
  'two-point-hospital': 'twopointedit',
  'retro-rewind': 'retrorewind',
  hytale: 'hytale-survival',
  'hytale-survival': 'hytale-survival',
}

function normalizeGameAssetId(gameId) {
  return String(gameId || '')
    .trim()
    .toLowerCase()
    .replace(/^gaming\s*[:_-]\s*/i, '')
    .replace(/[^a-z0-9]+/g, '')
}

export function getTikControlGameCoverUrl(gameId, fallback = '') {
  const raw = String(gameId || '').trim().toLowerCase()
  if (COVER_OVERRIDES[raw]?.startsWith('/')) {
    return COVER_OVERRIDES[raw]
  }

  const mapped = COVER_OVERRIDES[raw] || raw
  const assetId = normalizeGameAssetId(mapped)

  if (!assetId) {
    return fallback
  }

  return `https://tikcontrol.live/games/${assetId}.webp`
}

export function withTikControlGameCover(entry) {
  if (!entry || typeof entry !== 'object') {
    return entry
  }

  if (entry.coverUrl) {
    return entry
  }

  return {
    ...entry,
    coverUrl: getTikControlGameCoverUrl(entry.id, entry.coverUrl || ''),
  }
}