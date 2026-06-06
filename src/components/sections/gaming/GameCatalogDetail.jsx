import { useState } from 'react'
import { Plus, Sparkles, Wand2, Radio } from 'lucide-react'
import { buildCommandsForGame } from '../../../config/gamingCommandPacks'
import { getGamingCatalogEntry } from '../../../config/gamingCatalog'
import GameModDownloadPanel from './GameModDownloadPanel'

function GameCatalogDetail({
  game,
  chaosModCatalog,
  commandFeedback,
  commandSearch,
  commandsOverride = null,
  onCommandSearchChange,
  onCreateAction,
  onJump,
  onRunCommand,
  runningCommandId,
}) {
  const [linkFeedback, setLinkFeedback] = useState('')
  const catalogEntry = getGamingCatalogEntry(game.id) || game
  const gamePort = Number(catalogEntry.cloud?.port || 0)
  const gameProtocol = String(catalogEntry.cloud?.protocol || '').toUpperCase() || 'UDP'
  const baseCommands =
    Array.isArray(commandsOverride) && commandsOverride.length > 0
      ? commandsOverride
      : buildCommandsForGame(game.id, chaosModCatalog)
  const commands = baseCommands.filter((command) => {
    const needle = commandSearch.trim().toLowerCase()
    if (!needle) {
      return true
    }
    return `${command.name} ${command.category} ${command.commandText} ${command.note || ''}`
      .toLowerCase()
      .includes(needle)
  })

  const statusLabel =
    catalogEntry.status === 'native'
      ? 'Integrado'
      : catalogEntry.status === 'downloadable'
        ? 'Mod descargable'
        : catalogEntry.status === 'coming'
          ? 'Próximamente'
          : 'Catálogo TikControl'

  async function handleTestGameLink() {
    if (!gamePort) {
      setLinkFeedback('Este juego no usa puerto UDP/TCP. Usa «Probar» en un comando o el bridge nativo.')
      return
    }

    setLinkFeedback('Enviando ping al mod…')

    try {
      const response = await fetch('/api/gaming/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: catalogEntry.id,
          commandText: 'ping',
          port: gamePort,
          protocol: catalogEntry.cloud?.protocol || 'udp',
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Sin respuesta del juego')
      }
      if (payload.result?.warning) {
        setLinkFeedback(payload.result.warning)
      } else {
        setLinkFeedback(`Paquete enviado (${payload.result?.protocol || 'udp'}:${payload.result?.port || gamePort}).`)
      }
    } catch (error) {
      setLinkFeedback(error?.message || 'No se pudo contactar el mod. ¿Está el juego abierto?')
    }
  }

  return (
    <div className="steam-game-page">
      <div
        className="steam-hero-banner"
        style={{
          '--game-accent': catalogEntry.accent,
          '--game-banner-image': catalogEntry.coverUrl
            ? `url(${catalogEntry.coverUrl})`
            : 'none',
        }}
      >
        <div className="steam-hero-banner-inner">
          <span className="steam-hero-eyebrow">{catalogEntry.mode || 'Juego interactivo'}</span>
          <h2>{catalogEntry.name}</h2>
          <p>{catalogEntry.summary}</p>
          <div className="tag-row">
            <span className={`status-chip ${catalogEntry.status === 'native' ? 'ok' : 'off'}`}>
              {statusLabel}
            </span>
            {gamePort > 0 ? (
              <span className="muted-pill">
                {gameProtocol} · puerto {gamePort}
              </span>
            ) : null}
            {(catalogEntry.tags || []).map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
          {gamePort > 0 ? (
            <div className="card-actions">
              <button type="button" className="ghost-button compact-button" onClick={() => void handleTestGameLink()}>
                <Radio size={14} strokeWidth={2.1} />
                Probar enlace al mod
              </button>
            </div>
          ) : null}
          {linkFeedback ? <span className="feedback-pill">{linkFeedback}</span> : null}
          <div className="card-actions">
            <button type="button" className="primary-button" onClick={() => onJump('actions')}>
              <Plus size={16} strokeWidth={2.1} />
              Crear accion
            </button>
            <button type="button" className="secondary-button" onClick={() => onJump('overlay')}>
              <Sparkles size={16} strokeWidth={2.1} />
              Overlays
            </button>
          </div>
        </div>
      </div>

      <GameModDownloadPanel game={catalogEntry} />

      <div className="steam-game-toolbar">
        <input
          className="text-field steam-game-search"
          placeholder="Buscar comando..."
          value={commandSearch}
          onChange={(event) => onCommandSearchChange(event.target.value)}
        />
        <span className="muted-pill">{commands.length} comandos</span>
      </div>

      {commandFeedback ? <span className="feedback-pill">{commandFeedback}</span> : null}

      <div className="steam-command-grid">
        {commands.map((command) => (
          <article key={`${game.id}-${command.id}`} className="steam-command-card">
            <div className="steam-command-card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {command.imageUrl ? (
                  <img
                    src={command.imageUrl}
                    alt=""
                    style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }}
                  />
                ) : null}
                <strong>{command.name}</strong>
              </div>
              <span className="tag">{command.category}</span>
            </div>
            {command.note ? <p className="row-subcopy">{command.note}</p> : null}
            {command.commandText ? <code className="dense-code">{command.commandText}</code> : null}
            <div className="row-actions">
              {command.commandText ? (
                <button
                  type="button"
                  className="secondary-button compact-button"
                  disabled={runningCommandId === command.id}
                  onClick={() => onRunCommand(game, command)}
                >
                  <Wand2 size={14} strokeWidth={2.1} />
                  {runningCommandId === command.id ? 'Enviando...' : 'Probar'}
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => onCreateAction(command)}
              >
                Usar en accion
              </button>
            </div>
          </article>
        ))}
      </div>

      {catalogEntry.status === 'catalog' && !catalogEntry.cloud?.modPath ? (
        <div className="game-callout game-callout-info">
          <strong>Comandos en la nube</strong>
          <p>
            Los efectos se cargan desde TikControl.live. Descarga el mod del juego en TikControl oficial si
            necesitas la integracion completa en el PC del juego.
          </p>
        </div>
      ) : null}
    </div>
  )
}

export default GameCatalogDetail