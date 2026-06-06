import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { sendGameBridgeCommand } from './integrations/gaming-bridge.js'
import {
  downloadTikcontrolGameMod,
  fetchCloudGameCommands,
  fetchTikcontrolGamesManifest,
  getGameInstallStatus,
  getGamesCacheRootForApi,
  getMergedGamingCatalog,
  mapCloudGameToCatalogEntry,
} from './tikcontrol-games-cloud.js'

const execFileAsync = promisify(execFile)

async function loadCatalogModule() {
  const catalogModule = await import('../src/config/gamingCatalog.js')
  return {
    GAMING_CATALOG: catalogModule.GAMING_CATALOG,
    groupCatalogEntries: catalogModule.groupCatalogEntries,
  }
}

async function loadCommandPacksModule() {
  const commandsModule = await import('../src/config/gamingCommandPacks.js')
  return {
    buildCommandsForGame: commandsModule.buildCommandsForGame,
  }
}

let catalogModulePromise = null
let commandPacksModulePromise = null

function getCatalogModule() {
  if (!catalogModulePromise) {
    catalogModulePromise = loadCatalogModule()
  }
  return catalogModulePromise
}

function getCommandPacksModule() {
  if (!commandPacksModulePromise) {
    commandPacksModulePromise = loadCommandPacksModule()
  }
  return commandPacksModulePromise
}

export function registerTikcontrolGamingRoutes(app, { getChaosModCatalog = () => [] } = {}) {
  app.get('/api/gaming/manifest', async (_request, response) => {
    try {
      const manifest = await fetchTikcontrolGamesManifest()
      response.json({ ok: true, manifest, count: manifest.games?.length || 0 })
    } catch (error) {
      console.error('[gaming-api] manifest:', error)
      response.status(500).json({ ok: false, error: error?.message || 'Manifest no disponible' })
    }
  })

  app.get('/api/gaming/catalog', async (_request, response) => {
    try {
      const { GAMING_CATALOG, groupCatalogEntries } = await getCatalogModule()
      const { manifest, games } = await getMergedGamingCatalog(GAMING_CATALOG)

      response.json({
        ok: true,
        games,
        groups: groupCatalogEntries(games),
        cloudCount: manifest.games?.length || 0,
        premium: true,
        cacheRoot: getGamesCacheRootForApi(),
      })
    } catch (error) {
      console.error('[gaming-api] catalog:', error)
      response.status(500).json({
        ok: false,
        error: error?.message || 'No se pudo cargar el catalogo gaming',
      })
    }
  })

  app.get('/api/gaming/install-status/:gameId', async (request, response) => {
    const gameId = String(request.params.gameId || '').trim()
    if (!gameId) {
      response.status(400).json({ ok: false, error: 'gameId requerido' })
      return
    }

    try {
      const status = getGameInstallStatus(gameId)
      response.json({ ok: true, gameId, ...status })
    } catch (error) {
      response.status(500).json({ ok: false, error: error?.message })
    }
  })

  app.post('/api/gaming/download/:gameId', async (request, response) => {
    const gameId = String(request.params.gameId || '').trim()
    if (!gameId) {
      response.status(400).json({ ok: false, error: 'gameId requerido' })
      return
    }

    try {
      const installMeta = await downloadTikcontrolGameMod(gameId)
      response.json({ ok: true, gameId, install: installMeta })
    } catch (error) {
      console.error('[gaming-api] download:', error)
      response.status(500).json({ ok: false, error: error?.message || 'Descarga fallida' })
    }
  })

  app.get('/api/gaming/commands/:gameId', async (request, response) => {
    const gameId = String(request.params.gameId || '').trim()
    if (!gameId) {
      response.status(400).json({ ok: false, error: 'gameId requerido' })
      return
    }

    try {
      const { GAMING_CATALOG } = await getCatalogModule()
      const { buildCommandsForGame } = await getCommandPacksModule()
      const chaosModCatalog = getChaosModCatalog()
      const manifest = await fetchTikcontrolGamesManifest()
      const cloudRaw = (manifest.games || []).find((game) => game.id === gameId)
      const catalogGame =
        GAMING_CATALOG.find((entry) => entry.id === gameId)
        || (cloudRaw ? mapCloudGameToCatalogEntry(cloudRaw) : null)

      let commands = []
      let source = 'local'

      if (cloudRaw?.commands) {
        try {
          const cloudCommands = await fetchCloudGameCommands({ id: gameId, commandsPath: cloudRaw.commands })
          if (cloudCommands.length > 0) {
            commands = cloudCommands
            source = 'tikcontrol-cloud'
          }
        } catch (cloudError) {
          console.warn('[gaming-api] cloud commands fallback:', cloudError.message)
        }
      }

      if (commands.length === 0) {
        commands = buildCommandsForGame(gameId, chaosModCatalog)
        source = 'local-pack'
      }

      const gamePort = Number(cloudRaw?.port || catalogGame?.cloud?.port || 0)
      const commandsWithRunnable = commands.map((command) => ({
        ...command,
        runnable: command.runnable || gamePort > 0,
      }))

      response.json({
        ok: true,
        gameId,
        game: catalogGame,
        commands: commandsWithRunnable,
        count: commandsWithRunnable.length,
        source,
        port: gamePort,
        protocol: cloudRaw?.protocol || catalogGame?.cloud?.protocol || '',
      })
    } catch (error) {
      console.error('[gaming-api] commands:', error)
      response.status(500).json({
        ok: false,
        error: error?.message || 'No se pudieron cargar los comandos',
      })
    }
  })

  app.post('/api/gaming/run', async (request, response) => {
    const gameId = String(request.body?.gameId || '').trim()
    const commandText = String(request.body?.commandText || '').trim()

    if (!gameId || !commandText) {
      response.status(400).json({ ok: false, error: 'gameId y commandText requeridos' })
      return
    }

    try {
      const result = await sendGameBridgeCommand({
        gameId,
        commandText,
        port: request.body?.port,
        protocol: request.body?.protocol,
        host: request.body?.host || '127.0.0.1',
      })
      response.json({ ok: true, gameId, commandText, result })
    } catch (error) {
      console.error('[gaming-api] run:', error)
      response.status(500).json({ ok: false, error: error?.message || 'No se pudo enviar el comando' })
    }
  })

  app.post('/api/gaming/open-folder/:gameId', async (request, response) => {
    const gameId = String(request.params.gameId || '').trim()
    if (!gameId) {
      response.status(400).json({ ok: false, error: 'gameId requerido' })
      return
    }

    const status = getGameInstallStatus(gameId)
    const folderPath = status.installPath

    if (!status.installed || !folderPath) {
      response.status(404).json({ ok: false, error: 'Mod no instalado todavia' })
      return
    }

    if (process.platform === 'win32') {
      try {
        await execFileAsync('explorer.exe', [folderPath], { windowsHide: true })
        response.json({ ok: true, gameId, folderPath })
        return
      } catch (error) {
        response.status(500).json({ ok: false, error: error?.message || 'No se pudo abrir la carpeta' })
        return
      }
    }

    response.json({ ok: true, gameId, folderPath, note: 'Abre la ruta manualmente en este sistema.' })
  })
}