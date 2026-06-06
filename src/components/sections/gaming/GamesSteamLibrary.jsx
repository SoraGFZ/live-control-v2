import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, Gamepad2, Home, LayoutTemplate, Library, Search } from 'lucide-react'
import { buildTikcontrolWidgetUrl } from '../../../config/tikcontrolWidgetsCatalog'
import {
  GAMING_CATALOG as FALLBACK_GAMING_CATALOG,
  getGamingCatalogEntry,
  groupCatalogEntries,
} from '../../../config/gamingCatalog'
import GamesSectionCore from './GamesSectionCore'
import GameCatalogDetail from './GameCatalogDetail'
import WidgetPreviewFrame from '../../widgets/WidgetPreviewFrame.jsx'
import TikControlWidgetFrame from '../../overlay/TikControlWidgetFrame.jsx'

function resolveNativeGameId(catalogEntry) {
  if (!catalogEntry?.nativeModule) {
    return null
  }
  return catalogEntry.nativeModule
}

function GamesSteamLibrary({
  actions,
  chaosModCatalog,
  chaosModSourcePath,
  localOverlayUrl = '',
  onCreateAction,
  onJump,
  onPreviewAction,
  onRunGamingCommand,
  onRunMinecraftPreset,
  onTestMinecraftChatMirror,
  profile,
  serverStatus,
  triggers,
  updateProfileField,
}) {
  const [selectedGameId, setSelectedGameId] = useState('minecraft')
  const [subTab, setSubTab] = useState('library')
  const [librarySearch, setLibrarySearch] = useState('')
  const [commandSearch, setCommandSearch] = useState('')
  const [commandFeedback, setCommandFeedback] = useState('')
  const [runningCommandId, setRunningCommandId] = useState('')
  const [remoteCommands, setRemoteCommands] = useState(null)
  const [catalogGames, setCatalogGames] = useState(FALLBACK_GAMING_CATALOG)
  const [catalogSource, setCatalogSource] = useState('local')
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [installMap, setInstallMap] = useState({})
  const [hudCopyFeedback, setHudCopyFeedback] = useState('')

  const overlayOrigin =
    (typeof window !== 'undefined' && window.location?.origin) ||
    (localOverlayUrl ? new URL(localOverlayUrl, 'http://127.0.0.1:5123').origin : '') ||
    `http://127.0.0.1:${serverStatus?.server?.port || 5123}`

  const gamingHudUrl = buildTikcontrolWidgetUrl('gaming-hud.html', {
    baseUrl: overlayOrigin,
    overlayKey: profile?.overlayKey || '',
  })

  useEffect(() => {
    let cancelled = false

    async function loadCloudCatalog() {
      setCatalogLoading(true)
      setCatalogError('')

      try {
        const response = await fetch('/api/gaming/catalog')
        const payload = await response.json()
        if (cancelled) {
          return
        }

        if (payload?.ok && Array.isArray(payload.games) && payload.games.length > 0) {
          setCatalogGames(payload.games)
          setCatalogSource(`tikcontrol (${payload.cloudCount || payload.games.length} juegos)`)
        } else {
          setCatalogGames(FALLBACK_GAMING_CATALOG)
          setCatalogSource('local (respaldo)')
          setCatalogError(payload?.error || 'Catálogo cloud vacío; usando lista local.')
        }
      } catch (error) {
        if (!cancelled) {
          setCatalogGames(FALLBACK_GAMING_CATALOG)
          setCatalogSource('local (sin conexión)')
          setCatalogError(error?.message || 'No se pudo contactar /api/gaming/catalog')
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false)
        }
      }
    }

    loadCloudCatalog()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredCatalog = useMemo(() => {
    const needle = librarySearch.trim().toLowerCase()
    if (!needle) {
      return catalogGames
    }
    return catalogGames.filter((game) =>
      `${game.name} ${game.summary} ${game.mode} ${(game.tags || []).join(' ')}`
        .toLowerCase()
        .includes(needle),
    )
  }, [catalogGames, librarySearch])

  const groupedCatalog = useMemo(() => groupCatalogEntries(filteredCatalog), [filteredCatalog])
  const selectedGame =
    catalogGames.find((game) => game.id === selectedGameId)
    || getGamingCatalogEntry(selectedGameId)
    || catalogGames[0]
  const nativeGameId = resolveNativeGameId(selectedGame)

  useEffect(() => {
    if (!selectedGame?.id || nativeGameId) {
      setRemoteCommands(null)
      return
    }

    let cancelled = false

    async function loadRemoteCommands() {
      try {
        const response = await fetch(`/api/gaming/commands/${encodeURIComponent(selectedGame.id)}`)
        const payload = await response.json()
        if (!cancelled && payload?.ok && Array.isArray(payload.commands)) {
          setRemoteCommands(payload.commands)
        }
      } catch {
        if (!cancelled) {
          setRemoteCommands(null)
        }
      }
    }

    loadRemoteCommands()
    return () => {
      cancelled = true
    }
  }, [nativeGameId, selectedGame?.id])

  useEffect(() => {
    const downloadable = catalogGames.filter((game) => game.cloud?.modPath)
    if (!downloadable.length) {
      return
    }

    let cancelled = false

    async function loadInstallStates() {
      const entries = await Promise.all(
        downloadable.map(async (game) => {
          try {
            const response = await fetch(`/api/gaming/install-status/${encodeURIComponent(game.id)}`)
            const payload = await response.json()
            return [game.id, Boolean(payload.installed)]
          } catch {
            return [game.id, false]
          }
        }),
      )

      if (!cancelled) {
        setInstallMap(Object.fromEntries(entries))
      }
    }

    loadInstallStates()
    return () => {
      cancelled = true
    }
  }, [catalogGames])

  async function handleCopyHudUrl() {
    if (!gamingHudUrl) {
      setHudCopyFeedback('No hay URL del HUD disponible.')
      return
    }

    try {
      await navigator.clipboard.writeText(gamingHudUrl)
      setHudCopyFeedback('URL del Gaming HUD copiada.')
    } catch {
      setHudCopyFeedback('No se pudo copiar la URL.')
    }
  }

  async function handleRunCommand(game, command) {
    setRunningCommandId(command.id)
    setCommandFeedback('')

    try {
      if (!command.commandText) {
        setCommandFeedback('Este comando es de referencia. Crea una acción y enlázala a un trigger.')
        onJump('actions')
        return
      }

      const gamePort = Number(game?.cloud?.port || command.port || 0)
      const shouldSendUdp = command.runnable !== false && gamePort > 0 && !game?.nativeModule

      if (shouldSendUdp) {
        const response = await fetch('/api/gaming/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: game.id,
            commandText: command.commandText,
            port: gamePort,
            protocol: game.cloud?.protocol || command.protocol || 'udp',
          }),
        })
        const payload = await response.json()

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'No se pudo enviar al juego')
        }

        if (payload.result?.warning) {
          setCommandFeedback(payload.result.warning)
        } else {
          setCommandFeedback(
            `Enviado a ${game.name} · ${payload.result?.protocol || 'udp'} puerto ${payload.result?.port || gamePort}`,
          )
        }
        return
      }

      if (onRunGamingCommand) {
        const record = await onRunGamingCommand({ game, command })
        const udpWarning = record?.bridgeResults?.gameUdp?.warning
        const gtaWarning = record?.bridgeResults?.gta?.warning
        setCommandFeedback(
          udpWarning || gtaWarning || `Listo: ${command.name}`,
        )
      } else {
        setCommandFeedback('Crea una acción con este comando y vincúlala a un trigger del live.')
        onJump('actions')
      }
    } catch (error) {
      setCommandFeedback(error?.message || 'No se pudo ejecutar el comando.')
    } finally {
      setRunningCommandId('')
    }
  }

  function handleCreateActionFromCommand(command) {
    onCreateAction?.(command)
    onJump('actions')
  }

  return (
    <section className="panel-section gaming-steam-root" id="games">
      <div className="gaming-intro-strip">
        <div className="gaming-intro-icon" aria-hidden="true">
          <Gamepad2 size={22} strokeWidth={2.1} />
        </div>
        <div>
          <h2>Juegos interactivos</h2>
          <p>
            Catálogo sincronizado ({catalogSource}). Descarga el mod oficial, prueba comandos al vuelo y
            enlaza regalos del live con más de 60 títulos — sin salir del panel.
          </p>
          {catalogLoading ? <p className="support-copy">Sincronizando catálogo…</p> : null}
          {catalogError ? <p className="support-copy catalog-error-hint">{catalogError}</p> : null}
        </div>
      </div>

      <div className="gaming-subtabs">
        <button
          type="button"
          className={`gaming-subtab-btn ${subTab === 'library' ? 'active' : ''}`}
          onClick={() => setSubTab('library')}
        >
          <Library size={14} strokeWidth={2.1} />
          Biblioteca
        </button>
        <button
          type="button"
          className={`gaming-subtab-btn ${subTab === 'overlay' ? 'active' : ''}`}
          onClick={() => setSubTab('overlay')}
        >
          <LayoutTemplate size={14} strokeWidth={2.1} />
          Overlay HUD
        </button>
      </div>

      {subTab === 'overlay' ? (
        <div className="gaming-overlay-panel surface-card">
          <h3>Gaming HUD para OBS / LIVE Studio</h3>
          <p>
            El HUD de TikControl muestra estado del juego y eventos del live. Añádelo como fuente de
            navegador transparente junto a tus otros overlays.
          </p>
          <WidgetPreviewFrame className="gaming-hud-preview-stage">
            <TikControlWidgetFrame
              widgetFile="gaming-hud.html"
              overlayKey={profile?.overlayKey || ''}
              className="tikcontrol-widget-frame--gallery-preview"
            />
          </WidgetPreviewFrame>
          <div className="snippet-block">
            <span className="snippet-label">URL Gaming HUD</span>
            <code className="overlay-link">{gamingHudUrl}</code>
          </div>
          {hudCopyFeedback ? <p className="support-copy">{hudCopyFeedback}</p> : null}
          <div className="card-actions">
            <button type="button" className="primary-button" onClick={handleCopyHudUrl}>
              <Copy size={16} strokeWidth={2.1} />
              Copiar URL HUD
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                if (gamingHudUrl && typeof window !== 'undefined') {
                  window.open(gamingHudUrl, '_blank', 'noopener,noreferrer')
                }
              }}
            >
              <ExternalLink size={16} strokeWidth={2.1} />
              Abrir HUD
            </button>
            <button type="button" className="secondary-button" onClick={() => onJump('widgets-gallery')}>
              Galeria completa
            </button>
            <button type="button" className="ghost-button" onClick={() => onJump('live-hub')}>
              Centro LIVE
            </button>
          </div>
        </div>
      ) : (
        <div id="gaming-root" className="steam-library">
          <aside className="steam-sidebar">
            <button
              type="button"
              className="steam-sidebar-header"
              onClick={() => setSelectedGameId('minecraft')}
            >
              <span className="steam-home-icon">
                <Home size={18} strokeWidth={2.1} />
              </span>
              <span className="steam-sidebar-title">Biblioteca</span>
              <span className="steam-sidebar-count">{filteredCatalog.length}</span>
            </button>

            <div className="steam-sidebar-search-wrap">
              <span className="steam-sidebar-search-icon">
                <Search size={14} strokeWidth={2.1} />
              </span>
              <input
                className="steam-sidebar-search"
                placeholder="Buscar juego..."
                value={librarySearch}
                onChange={(event) => setLibrarySearch(event.target.value)}
              />
            </div>

            <div className="steam-sidebar-list">
              {filteredCatalog.length === 0 ? (
                <p className="support-copy steam-sidebar-empty">
                  {catalogLoading
                    ? 'Cargando juegos…'
                    : 'No hay juegos con ese filtro. Borra la búsqueda o reinicia el servidor.'}
                </p>
              ) : null}
              {groupedCatalog.map((group) => (
                <div key={group.id} className="steam-sidebar-group-block">
                  <div className="steam-sidebar-group-label">{group.label}</div>
                  {group.games.map((game) => {
                    const isActive = game.id === selectedGameId
                    const dotClass =
                      game.status === 'native' || installMap[game.id]
                        ? 'steam-dot-installed'
                        : game.status === 'downloadable' || game.cloud?.modPath
                          ? 'steam-dot-update'
                          : game.status === 'coming'
                            ? 'steam-dot-update'
                            : 'steam-dot-detected'

                    return (
                      <button
                        key={game.id}
                        type="button"
                        className={`steam-sidebar-item ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedGameId(game.id)
                          setCommandSearch('')
                          setCommandFeedback('')
                        }}
                      >
                        {game.coverUrl ? (
                          <img className="steam-sidebar-thumb" src={game.coverUrl} alt="" />
                        ) : (
                          <span
                            className="steam-sidebar-thumb steam-sidebar-thumb-fallback"
                            style={{ background: game.accent }}
                          >
                            {game.name.slice(0, 1)}
                          </span>
                        )}
                        <span className="steam-sidebar-name">{game.name}</span>
                        <span className={`steam-sidebar-dot ${dotClass}`} aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </aside>

          <main className="steam-main">
            {nativeGameId ? (
              <GamesSectionCore
                embedded
                forcedGameId={nativeGameId}
                actions={actions}
                chaosModCatalog={chaosModCatalog}
                chaosModSourcePath={chaosModSourcePath}
                onJump={onJump}
                onPreviewAction={onPreviewAction}
                onRunMinecraftPreset={onRunMinecraftPreset}
                onTestMinecraftChatMirror={onTestMinecraftChatMirror}
                profile={profile}
                serverStatus={serverStatus}
                triggers={triggers}
                updateProfileField={updateProfileField}
              />
            ) : (
              <GameCatalogDetail
                game={selectedGame}
                chaosModCatalog={chaosModCatalog}
                commandFeedback={commandFeedback}
                commandSearch={commandSearch}
                commandsOverride={remoteCommands}
                onCommandSearchChange={setCommandSearch}
                onCreateAction={handleCreateActionFromCommand}
                onJump={onJump}
                onRunCommand={handleRunCommand}
                runningCommandId={runningCommandId}
              />
            )}
          </main>
        </div>
      )}
    </section>
  )
}

export default GamesSteamLibrary