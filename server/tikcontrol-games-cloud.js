import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const TIKCONTROL_GAMES_BASE = 'https://tikcontrol.live/games'
export const TIKCONTROL_GAMES_MANIFEST_URL = `${TIKCONTROL_GAMES_BASE}/manifest.json`

const MANIFEST_TTL_MS = 15 * 60 * 1000

const NATIVE_MODULE_BY_ID = {
  minecraft: 'minecraft',
  'gtav-chaos': 'gta',
  'gtav-koth': 'gta',
  'gtav-train': 'gta',
  'gtav-prison': 'gta',
  'gtav-race': 'gta',
  'tikcontrol-bedrockbox': 'minecraft',
  'tikcontrol-oneblock': 'minecraft',
}

const MINECRAFT_IDS = new Set(['minecraft', 'tikcontrol-bedrockbox', 'tikcontrol-oneblock'])
const COOP_IDS = new Set(['lethal-company', 'repo', 'ghostwatchers', 'rvtheryet', 'peak'])

let manifestCache = { fetchedAt: 0, manifest: null }

function getGamesCacheRoot() {
  const base =
    process.env.LIVE_CONTROL_GAMES_CACHE
    || path.join(process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'), 'live-control-app', 'games-cache')
  return base
}

function getManifestCachePath() {
  return path.join(getGamesCacheRoot(), 'manifest.json')
}

function getGameCacheDir(gameId) {
  return path.join(getGamesCacheRoot(), 'games', sanitizeGameId(gameId))
}

function sanitizeGameId(gameId) {
  return String(gameId || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

function resolveGroup(gameId) {
  const id = String(gameId || '')
  if (MINECRAFT_IDS.has(id)) {
    return 'minecraft'
  }
  if (id.startsWith('gtav')) {
    return 'gta'
  }
  if (id.startsWith('tikcontrol')) {
    return 'tikcontrol'
  }
  if (COOP_IDS.has(id)) {
    return 'coop'
  }
  return 'steam'
}

function resolveAccent(group) {
  const accents = {
    featured: '#7a5cff',
    minecraft: '#7fd26b',
    gta: '#ff8a5b',
    tikcontrol: '#60a5fa',
    steam: '#74a7ff',
    coop: '#fb7185',
  }
  return accents[group] || '#7a5cff'
}

function buildCoverUrl(cloudGame) {
  if (cloudGame.cover) {
    return `${TIKCONTROL_GAMES_BASE}/${cloudGame.cover}`
  }
  return `https://tikcontrol.live/games/${sanitizeGameId(cloudGame.id)}.webp`
}

export function mapCloudGameToCatalogEntry(cloudGame) {
  const id = cloudGame.id
  const group = resolveGroup(id)
  const nativeModule = NATIVE_MODULE_BY_ID[id] || ''
  const hasMod = Boolean(cloudGame.mod)
  const featured = ['minecraft', 'gtav-chaos'].includes(id)

  let status = 'catalog'
  if (nativeModule) {
    status = 'native'
  } else if (cloudGame.status === 'coming' || cloudGame.status === 'beta') {
    status = 'coming'
  } else if (hasMod) {
    status = 'downloadable'
  }

  return {
    id,
    name: cloudGame.name || id,
    group: featured ? 'featured' : group,
    accent: resolveAccent(featured ? 'featured' : group),
    coverUrl: buildCoverUrl(cloudGame),
    status,
    nativeModule,
    tags: Array.isArray(cloudGame.tags) ? cloudGame.tags : [],
    summary: cloudGame.description || `Integracion TikControl para ${cloudGame.name || id}.`,
    mode: cloudGame.protocol || (hasMod ? 'Mod + comandos' : 'Comandos cloud'),
    cloud: {
      version: cloudGame.version || '1.0.0',
      modPath: cloudGame.mod || null,
      commandsPath: cloudGame.commands || null,
      port: cloudGame.port || 0,
      protocol: cloudGame.protocol || '',
      cloudStatus: cloudGame.status || 'stable',
      banner: cloudGame.banner ? `${TIKCONTROL_GAMES_BASE}/${cloudGame.banner}` : null,
    },
  }
}

export function mergeWithLocalCatalog(cloudEntries, localCatalog = []) {
  const localById = new Map(localCatalog.map((game) => [game.id, game]))
  const merged = new Map()

  for (const cloudEntry of cloudEntries) {
    const local = localById.get(cloudEntry.id)
    merged.set(cloudEntry.id, {
      ...cloudEntry,
      coverUrl: local?.coverUrl || cloudEntry.coverUrl,
      nativeModule: cloudEntry.nativeModule || local?.nativeModule || '',
      status: cloudEntry.nativeModule ? 'native' : cloudEntry.status,
      tags: [...new Set([...(cloudEntry.tags || []), ...(local?.tags || [])])],
    })
  }

  for (const local of localCatalog) {
    if (!merged.has(local.id)) {
      merged.set(local.id, local)
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

function downloadOnce(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http

    const requestUrl = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 6) {
        reject(new Error('Demasiadas redirecciones'))
        return
      }

      const req = client.get(currentUrl, { headers: { 'User-Agent': 'LiveControlStudio/1.0' } }, (response) => {
        const status = response.statusCode || 0

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume()
          requestUrl(new URL(response.headers.location, currentUrl).toString(), redirectCount + 1)
          return
        }

        if (status !== 200) {
          response.resume()
          reject(new Error(`HTTP ${status} al descargar`))
          return
        }

        ensureDir(path.dirname(destPath))
        const file = fs.createWriteStream(destPath)
        let bytes = 0

        response.on('data', (chunk) => {
          bytes += chunk.length
          onProgress?.(bytes)
        })
        response.on('error', reject)
        file.on('error', reject)
        file.on('finish', () => {
          file.close(() => resolve({ bytes, destPath }))
        })
        response.pipe(file)
      })

      req.on('error', reject)
      req.setTimeout(120000, () => {
        req.destroy(new Error('Timeout de descarga'))
      })
    }

    requestUrl(url)
  })
}

async function extractZipWindows(zipPath, destDir) {
  ensureDir(destDir)
  const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
  await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    timeout: 180000,
  })
}

export async function fetchTikcontrolGamesManifest({ force = false } = {}) {
  const cachePath = getManifestCachePath()
  const now = Date.now()

  if (!force && manifestCache.manifest && now - manifestCache.fetchedAt < MANIFEST_TTL_MS) {
    return manifestCache.manifest
  }

  if (!force && fs.existsSync(cachePath)) {
    const disk = readJsonFile(cachePath)
    if (disk?.games?.length && disk.cachedAt && now - disk.cachedAt < MANIFEST_TTL_MS) {
      manifestCache = { fetchedAt: now, manifest: disk }
      return disk
    }
  }

  const raw = await new Promise((resolve, reject) => {
    https
      .get(TIKCONTROL_GAMES_MANIFEST_URL, { headers: { 'User-Agent': 'LiveControlStudio/1.0' } }, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          https
            .get(response.headers.location, { headers: { 'User-Agent': 'LiveControlStudio/1.0' } }, handle)
            .on('error', reject)
          return
        }
        handle(response)
      })
      .on('error', reject)

    function handle(response) {
      if ((response.statusCode || 0) !== 200) {
        reject(new Error(`Manifest HTTP ${response.statusCode}`))
        return
      }
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
    }
  })

  const manifest = {
    ...raw,
    cachedAt: now,
    source: TIKCONTROL_GAMES_MANIFEST_URL,
  }

  writeJsonFile(cachePath, manifest)
  manifestCache = { fetchedAt: now, manifest }
  return manifest
}

export async function getMergedGamingCatalog(localCatalog = []) {
  const manifest = await fetchTikcontrolGamesManifest()
  const cloudEntries = (manifest.games || []).map(mapCloudGameToCatalogEntry)
  return {
    manifest,
    games: mergeWithLocalCatalog(cloudEntries, localCatalog),
  }
}

export function pickLocalizedName(nameField, locale = 'es') {
  if (typeof nameField === 'string') {
    return nameField
  }
  if (nameField && typeof nameField === 'object') {
    return nameField[locale] || nameField.es || nameField.en || Object.values(nameField).find((v) => typeof v === 'string') || 'Comando'
  }
  return 'Comando'
}

export function parseCloudCommands(payload, locale = 'es', { runnable = false } = {}) {
  const commands = []
  const seen = new Set()

  function pushCommand(id, raw = {}) {
    const key = String(id || '').trim()
    if (!key || seen.has(key)) {
      return
    }
    seen.add(key)
    commands.push({
      id: key,
      name: pickLocalizedName(raw.name, locale),
      category: Array.isArray(raw.category) ? raw.category[0] : raw.category || raw.type || 'efecto',
      commandText: raw.command || raw.commandText || raw.id || key,
      note: raw.description || raw.note || '',
      imageUrl: raw.image || raw.icon || '',
      runnable: Boolean(runnable),
    })
  }

  function walkEffects(node) {
    if (!node || typeof node !== 'object') {
      return
    }

    for (const [key, value] of Object.entries(node)) {
      if (['meta', 'variables', 'game', 'gamePackID'].includes(key)) {
        if (value && typeof value === 'object') {
          walkEffects(value)
        }
        continue
      }

      if (value && typeof value === 'object' && (value.name || value.description || value.command)) {
        pushCommand(key, value)
      } else if (value && typeof value === 'object') {
        walkEffects(value)
      }
    }
  }

  if (Array.isArray(payload?.commands)) {
    payload.commands.forEach((command, index) => {
      pushCommand(command.id || command.key || `cmd-${index}`, command)
    })
  }

  if (payload?.effects) {
    walkEffects(payload.effects)
  }

  if (Array.isArray(payload?.result?.data)) {
    payload.result.data.forEach((pack) => {
      walkEffects(pack?.effects)
    })
  }

  return commands
}

export async function fetchCloudGameCommands(cloudGame, locale = 'es') {
  if (!cloudGame?.commandsPath && !cloudGame?.cloud?.commandsPath) {
    return []
  }

  const commandsPath = cloudGame.commandsPath || cloudGame.cloud?.commandsPath
  const url = commandsPath.startsWith('http') ? commandsPath : `${TIKCONTROL_GAMES_BASE}/${commandsPath}`
  const cacheFile = path.join(getGameCacheDir(cloudGame.id || cloudGame.gameId), 'commands.json')

  try {
    if (fs.existsSync(cacheFile)) {
      const cached = readJsonFile(cacheFile)
      if (cached?.cachedAt && Date.now() - cached.cachedAt < MANIFEST_TTL_MS && cached.commands?.length) {
        return cached.commands
      }
    }
  } catch {
    // ignore
  }

  const payload = await new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client
      .get(url, { headers: { 'User-Agent': 'LiveControlStudio/1.0' } }, (response) => {
        if ((response.statusCode || 0) !== 200) {
          reject(new Error(`Comandos HTTP ${response.statusCode}`))
          return
        }
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (c) => {
          body += c
        })
        response.on('end', () => {
          try {
            resolve(JSON.parse(body))
          } catch (error) {
            reject(error)
          }
        })
      })
      .on('error', reject)
  })

  const gamePort = Number(cloudGame?.port || cloudGame?.cloud?.port || 0)
  const commands = parseCloudCommands(payload, locale, { runnable: gamePort > 0 })
  writeJsonFile(cacheFile, { cachedAt: Date.now(), commands, source: url })
  return commands
}

export function getGameInstallStatus(gameId) {
  const dir = getGameCacheDir(gameId)
  const metaPath = path.join(dir, 'install.json')
  const meta = readJsonFile(metaPath)

  if (meta?.installedAt) {
    return {
      installed: true,
      installPath: meta.installPath || dir,
      fileName: meta.fileName || '',
      version: meta.version || '',
      extracted: Boolean(meta.extracted),
    }
  }

  if (!fs.existsSync(dir)) {
    return { installed: false, installPath: dir }
  }

  const files = fs.readdirSync(dir).filter((name) => !name.endsWith('.json'))
  if (files.length > 0) {
    return {
      installed: true,
      installPath: dir,
      fileName: files[0],
      version: '',
      extracted: files.some((name) => name === 'mod' || name.endsWith('.jar')),
    }
  }

  return { installed: false, installPath: dir }
}

export async function downloadTikcontrolGameMod(gameId, { onProgress } = {}) {
  const manifest = await fetchTikcontrolGamesManifest()
  const cloudGame = (manifest.games || []).find((game) => game.id === gameId)

  if (!cloudGame?.mod) {
    throw new Error('Este juego no tiene mod descargable en TikControl.')
  }

  const dir = getGameCacheDir(gameId)
  ensureDir(dir)

  const fileName = path.basename(cloudGame.mod)
  const destPath = path.join(dir, fileName)
  const url = `${TIKCONTROL_GAMES_BASE}/${cloudGame.mod}`

  await downloadOnce(url, destPath, onProgress)

  let extracted = false
  let installPath = destPath

  if (fileName.toLowerCase().endsWith('.zip')) {
    const extractDir = path.join(dir, 'mod')
    await extractZipWindows(destPath, extractDir)
    extracted = true
    installPath = extractDir
  }

  const installMeta = {
    gameId,
    fileName,
    installPath,
    destPath,
    version: cloudGame.version || '1.0.0',
    modUrl: url,
    installedAt: Date.now(),
    extracted,
  }

  writeJsonFile(path.join(dir, 'install.json'), installMeta)
  writeJsonFile(path.join(dir, 'game-meta.json'), {
    gameId,
    name: cloudGame.name || gameId,
    port: Number(cloudGame.port || 0),
    protocol: String(cloudGame.protocol || 'udp').toLowerCase(),
    mod: cloudGame.mod || '',
    updatedAt: Date.now(),
  })

  return installMeta
}

export function getGamesCacheRootForApi() {
  return getGamesCacheRoot()
}