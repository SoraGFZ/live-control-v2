import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const CACHE_TTL_MS = 5 * 60 * 1000
const memoryCache = new Map()

export const GIFT_REGIONS = [
  { code: '', label: 'Global', flag: '🌍' },
  { code: 'ES', label: 'España', flag: '🇪🇸' },
  { code: 'US', label: 'Estados Unidos', flag: '🇺🇸' },
  { code: 'MX', label: 'México', flag: '🇲🇽' },
  { code: 'AR', label: 'Argentina', flag: '🇦🇷' },
  { code: 'CO', label: 'Colombia', flag: '🇨🇴' },
  { code: 'BR', label: 'Brasil', flag: '🇧🇷' },
  { code: 'GB', label: 'Reino Unido', flag: '🇬🇧' },
  { code: 'DE', label: 'Alemania', flag: '🇩🇪' },
  { code: 'FR', label: 'Francia', flag: '🇫🇷' },
]

const REGION_META = {
  ES: { tz: 'Europe/Madrid', lang: 'es' },
  US: { tz: 'America/New_York', lang: 'en' },
  MX: { tz: 'America/Mexico_City', lang: 'es' },
  AR: { tz: 'America/Argentina/Buenos_Aires', lang: 'es' },
  CO: { tz: 'America/Bogota', lang: 'es' },
  BR: { tz: 'America/Sao_Paulo', lang: 'pt' },
  GB: { tz: 'Europe/London', lang: 'en' },
  DE: { tz: 'Europe/Berlin', lang: 'de' },
  FR: { tz: 'Europe/Paris', lang: 'fr' },
}

const TIKFINITY_LANG = {
  ES: 'es-ES',
  US: 'en-US',
  MX: 'es-MX',
  AR: 'es-AR',
  CO: 'es-CO',
  BR: 'pt-BR',
  GB: 'en-GB',
  DE: 'de-DE',
  FR: 'fr-FR',
}

const WEBCAST_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  referer: 'https://www.tiktok.com/',
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? ''
}

function giftCategory(entry = {}) {
  const type = Number(entry.type || 0)
  const diamonds = Number(entry.coins || entry.diamond || 0)

  if (type === 2 || type === 7) {
    return 'animated'
  }
  if (type === 4 || diamonds >= 1000) {
    return 'premium'
  }
  if (type === 5) {
    return 'subscriber'
  }
  if (type === 6 || type === 9) {
    return 'event'
  }
  if (diamonds >= 100) {
    return 'featured'
  }

  return 'basic'
}

export function normalizeCatalogGift(rawGift = {}, sortOrder = 0, extractImageUrl = () => '') {
  const normalizedName = String(
    firstDefined(rawGift.name, rawGift.gift_name, rawGift.giftName, rawGift.describe, rawGift.display_name),
  ).trim()
  const normalizedId = String(
    firstDefined(rawGift.id, rawGift.giftId, rawGift.gift_id, normalizedName, sortOrder),
  ).trim()
  const normalizedCoins = Number(
    firstDefined(
      rawGift.diamond_count,
      rawGift.diamondCount,
      rawGift.diamond,
      rawGift.diamonds,
      rawGift.coins,
      rawGift.price,
      0,
    ),
  )

  const pictureList = []
  const pushPicture = (value) => {
    const url = typeof value === 'string' ? extractImageUrl(value) : extractImageUrl(value)
    if (url && !pictureList.includes(url)) {
      pictureList.push(url)
    }
  }

  if (Array.isArray(rawGift.pictureList)) {
    rawGift.pictureList.forEach(pushPicture)
  }
  if (Array.isArray(rawGift.image?.url_list)) {
    rawGift.image.url_list.forEach(pushPicture)
  }
  if (Array.isArray(rawGift.icon?.url_list)) {
    rawGift.icon.url_list.forEach(pushPicture)
  }

  const staticImageUrl =
    extractImageUrl(rawGift.picture) ||
    extractImageUrl(rawGift.image) ||
    extractImageUrl(rawGift.icon) ||
    extractImageUrl(rawGift.giftImage) ||
    extractImageUrl(rawGift.gift_image) ||
    extractImageUrl(rawGift.previewImage) ||
    extractImageUrl(rawGift.preview_image) ||
    extractImageUrl(rawGift.giftLabelIcon) ||
    extractImageUrl(rawGift.gift_label_icon) ||
    pictureList[0] ||
    ''

  const animatedImageUrl =
    extractImageUrl(rawGift.animatedImage) ||
    extractImageUrl(rawGift.animated_image) ||
    extractImageUrl(rawGift.gifImage) ||
    extractImageUrl(rawGift.dynamicImage) ||
    ''

  const picture = staticImageUrl || animatedImageUrl

  return {
    id: normalizedId,
    giftId: normalizedId,
    name: normalizedName || `Gift ${normalizedId}`,
    coins: Number.isFinite(normalizedCoins) ? normalizedCoins : 0,
    diamond: Number.isFinite(normalizedCoins) ? normalizedCoins : 0,
    diamondCount: Number.isFinite(normalizedCoins) ? normalizedCoins : 0,
    imageUrl: picture,
    picture,
    pictureList: pictureList.length ? pictureList : picture ? [picture] : [],
    animatedImageUrl,
    type: Number(rawGift.type || rawGift.gift_type || 0),
    describe: String(rawGift.describe || rawGift.description || '').trim(),
    category: giftCategory({ type: rawGift.type, coins: normalizedCoins }),
    isGlobal: rawGift.isGlobal !== false,
    source: rawGift.source || 'catalog',
    sortOrder,
  }
}

export function toTikControlApiGift(entry = {}) {
  const picture = entry.picture || entry.imageUrl || ''

  return {
    id: entry.id,
    giftId: entry.id,
    name: entry.name,
    diamond: entry.coins,
    diamondCount: entry.coins,
    diamond_value: entry.coins,
    coins: entry.coins,
    picture,
    image: picture,
    icon: picture,
    pictureList: entry.pictureList?.length ? entry.pictureList : picture ? [picture] : [],
    imageUrl: entry.imageUrl || picture,
    animatedImageUrl: entry.animatedImageUrl || '',
    type: entry.type || 0,
    describe: entry.describe || '',
    category: entry.category || 'basic',
    isGlobal: entry.isGlobal !== false,
    source: entry.source || 'catalog',
  }
}

export function resolveGiftInCatalog({ giftId = '', giftName = '' } = {}, catalog = []) {
  const normalizedId = String(giftId || '').trim()
  const normalizedName = String(giftName || '').trim().toLowerCase()

  if (!Array.isArray(catalog) || !catalog.length) {
    return null
  }

  if (normalizedId) {
    const byId = catalog.find((gift) => String(gift.id || gift.giftId) === normalizedId)
    if (byId) {
      return byId
    }
  }

  if (normalizedName) {
    return (
      catalog.find(
        (gift) => String(gift.name || '').trim().toLowerCase() === normalizedName,
      ) || null
    )
  }

  return null
}

function cacheKey(region = '') {
  return String(region || '').trim().toUpperCase() || 'GLOBAL'
}

function getCacheDir(projectRoot) {
  return path.join(projectRoot, 'data', 'gifts')
}

function readDiskCache(projectRoot, region = '') {
  const filePath = path.join(getCacheDir(projectRoot), `gifts-${cacheKey(region)}.json`)

  try {
    if (!existsSync(filePath)) {
      return null
    }

    const payload = JSON.parse(readFileSync(filePath, 'utf8'))
    if (!Array.isArray(payload?.data) || !payload.data.length) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

function writeDiskCache(projectRoot, region = '', gifts = []) {
  try {
    const directory = getCacheDir(projectRoot)
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
    }

    const filePath = path.join(directory, `gifts-${cacheKey(region)}.json`)
    writeFileSync(
      filePath,
      JSON.stringify({ at: Date.now(), data: gifts }, null, 0),
      'utf8',
    )
  } catch {
    // ignore disk errors
  }
}

function rememberCache(region, gifts, source) {
  const key = cacheKey(region)
  memoryCache.set(key, { at: Date.now(), gifts, source })
  return gifts
}

function readMemoryCache(region, maxAgeMs = CACHE_TTL_MS) {
  const cached = memoryCache.get(cacheKey(region))
  if (!cached) {
    return null
  }

  if (Date.now() - cached.at > maxAgeMs) {
    return null
  }

  return cached
}

function mergeGiftLists(lists = [], extractImageUrl) {
  const byId = new Map()

  lists.flat().forEach((rawGift, index) => {
    const normalized = normalizeCatalogGift(rawGift, index, extractImageUrl)
    if (!normalized.id || !normalized.name) {
      return
    }

    const previous = byId.get(normalized.id)
    if (!previous) {
      byId.set(normalized.id, normalized)
      return
    }

    byId.set(normalized.id, {
      ...previous,
      ...normalized,
      picture: normalized.picture || previous.picture,
      imageUrl: normalized.imageUrl || previous.imageUrl,
      pictureList: normalized.pictureList.length ? normalized.pictureList : previous.pictureList,
      coins: normalized.coins || previous.coins,
      name: normalized.name || previous.name,
    })
  })

  return Array.from(byId.values()).sort(
    (left, right) => Number(left.coins || 0) - Number(right.coins || 0),
  )
}

function buildWebcastGiftListUrl(region = '', roomId = '') {
  const meta = REGION_META[region] || { tz: 'America/New_York', lang: 'en' }
  const params = new URLSearchParams({
    aid: '1988',
    cursor: '0',
    count: '2000',
    device_platform: 'web_pc',
    app_name: 'tiktok_web',
    app_language: meta.lang,
    webcast_language: meta.lang,
    browser_language: `${meta.lang}-${region || 'US'}`,
    tz_name: meta.tz,
    screen_width: '1920',
    screen_height: '1080',
    browser_name: 'Mozilla',
    browser_version: '131.0.0.0',
  })

  if (region) {
    params.set('region', region)
    params.set('priority_region', region)
  }

  if (roomId) {
    params.set('room_id', roomId)
  }

  return `https://webcast.tiktok.com/webcast/gift/list/?${params.toString()}`
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 12000),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

function parseGiftListPayload(payload = {}) {
  const list =
    payload?.data?.gifts ||
    payload?.data?.gift_list ||
    payload?.gifts ||
    payload?.gift_list ||
    []

  return Array.isArray(list) ? list : []
}

async function fetchFromTikfinity(region = '', roomId = '') {
  const lang = TIKFINITY_LANG[region] || TIKFINITY_LANG.ES
  const url = new URL('https://tikfinity.zerody.one/api/getAllGifts')
  url.searchParams.set('lang', lang)
  if (roomId) {
    url.searchParams.set('room_id', roomId)
  }

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': WEBCAST_HEADERS['user-agent'] },
  })

  const gifts = Array.isArray(payload) ? payload : []
  return gifts.map((gift) => ({
    id: gift.id,
    name: gift.name,
    diamond_count: gift.diamond_count,
    type: gift.type,
    describe: gift.describe,
    image: gift.image,
    icon: gift.icon,
    source: 'tikfinity',
  }))
}

async function fetchFromWebcast(region = '', roomId = '') {
  const aids = ['1988', '1233']
  const collected = []

  for (const aid of aids) {
    try {
      const url = buildWebcastGiftListUrl(region, roomId).replace('aid=1988', `aid=${aid}`)
      const payload = await fetchJson(url, { headers: WEBCAST_HEADERS })
      collected.push(...parseGiftListPayload(payload))
    } catch {
      // try next aid
    }
  }

  return collected.map((gift) => ({ ...gift, source: 'webcast' }))
}

async function fetchFromConnection(connection, extractImageUrl) {
  if (!connection || typeof connection.fetchAvailableGifts !== 'function') {
    return []
  }

  const availableGifts = await connection.fetchAvailableGifts()
  if (!Array.isArray(availableGifts)) {
    return []
  }

  return availableGifts.map((gift, index) =>
    normalizeCatalogGift({ ...gift, source: 'tiktok-live-connector' }, index, extractImageUrl),
  )
}

export async function fetchGiftCatalog({
  projectRoot,
  region = '',
  roomId = '',
  connection = null,
  force = false,
  extractImageUrl = () => '',
} = {}) {
  const normalizedRegion = String(region || '').trim().toUpperCase()

  if (!force) {
    const memory = readMemoryCache(normalizedRegion)
    if (memory?.gifts?.length) {
      return {
        gifts: memory.gifts,
        region: normalizedRegion,
        source: memory.source,
        cached: true,
      }
    }

    const disk = readDiskCache(projectRoot, normalizedRegion)
    if (disk && Date.now() - Number(disk.at || 0) < CACHE_TTL_MS * 6) {
      const gifts = mergeGiftLists([disk.data], extractImageUrl)
      rememberCache(normalizedRegion, gifts, 'disk')
      return { gifts, region: normalizedRegion, source: 'disk', cached: true }
    }
  }

  const rawLists = []

  if (connection) {
    try {
      const connectorGifts = await fetchFromConnection(connection, extractImageUrl)
      if (connectorGifts.length) {
        rawLists.push(connectorGifts)
      }
    } catch {
      // fallback below
    }
  }

  try {
    const tikfinityGifts = await fetchFromTikfinity(normalizedRegion, roomId)
    if (tikfinityGifts.length) {
      rawLists.push(tikfinityGifts)
    }
  } catch {
    // continue
  }

  try {
    const webcastGifts = await fetchFromWebcast(normalizedRegion, roomId)
    if (webcastGifts.length) {
      rawLists.push(webcastGifts)
    }
  } catch {
    // continue
  }

  let gifts = mergeGiftLists(rawLists, extractImageUrl)
  let source = 'merged'

  if (!gifts.length) {
    const disk = readDiskCache(projectRoot, normalizedRegion) || readDiskCache(projectRoot, '')
    if (disk?.data?.length) {
      gifts = mergeGiftLists([disk.data], extractImageUrl)
      source = 'disk-fallback'
    }
  }

  if (gifts.length) {
    writeDiskCache(projectRoot, normalizedRegion, gifts)
    rememberCache(normalizedRegion, gifts, source)
  }

  return {
    gifts,
    region: normalizedRegion,
    source,
    cached: false,
  }
}

export function enrichGiftEvent(event = {}, catalog = [], extractImageUrl = () => '') {
  const giftId = String(
    firstDefined(event.giftId, event.gift_id, event.gift?.id, event.gift?.giftId),
  ).trim()
  const giftName = String(
    firstDefined(event.giftName, event.gift?.name, event.gift?.giftName),
  ).trim()
  const catalogGift = resolveGiftInCatalog({ giftId, giftName }, catalog)
  const picture =
    extractImageUrl(event.giftImageUrl) ||
    extractImageUrl(event.giftPictureUrl) ||
    extractImageUrl(event.gift?.image) ||
    extractImageUrl(event.gift?.icon) ||
    catalogGift?.picture ||
    catalogGift?.imageUrl ||
    ''

  const coins = Number(
    firstDefined(
      event.giftCoins,
      event.gift?.diamondCount,
      event.gift?.diamond_count,
      catalogGift?.coins,
      0,
    ),
  )

  return {
    ...event,
    giftId: giftId || catalogGift?.id || '',
    giftName: giftName || catalogGift?.name || event.giftName,
    giftCoins: coins,
    giftImageUrl: picture,
    giftPictureUrl: picture,
    gift: {
      ...(event.gift || {}),
      id: giftId || catalogGift?.id,
      giftId: giftId || catalogGift?.id,
      name: giftName || catalogGift?.name,
      giftName: giftName || catalogGift?.name,
      diamondCount: coins,
      diamond_count: coins,
      image: picture,
      icon: picture,
      picture,
      pictureList: catalogGift?.pictureList || (picture ? [picture] : []),
    },
  }
}

export function buildTikControlGiftPayload(event = {}, catalog = [], extractImageUrl = () => '') {
  const enriched = enrichGiftEvent(event, catalog, extractImageUrl)
  const picture = enriched.giftImageUrl || ''

  return {
    type: 'gift',
    data: {
      uniqueId: enriched.uniqueId,
      nickname: enriched.nickname,
      giftId: enriched.giftId,
      giftName: enriched.giftName,
      giftCoins: Number(enriched.giftCoins || 0),
      giftImageUrl: picture,
      giftPictureUrl: picture,
      profilePictureUrl: enriched.avatarUrl || '',
      repeatCount: Number(enriched.repeatCount || 1),
      user: {
        uniqueId: enriched.uniqueId,
        nickname: enriched.nickname,
        profilePictureUrl: enriched.avatarUrl || '',
        avatarUrl: enriched.avatarUrl || '',
      },
      gift: {
        id: enriched.giftId,
        giftId: enriched.giftId,
        name: enriched.giftName,
        giftName: enriched.giftName,
        diamondCount: Number(enriched.giftCoins || 0),
        image: picture,
        icon: picture,
        picture,
        pictureList: enriched.gift?.pictureList || (picture ? [picture] : []),
      },
    },
  }
}