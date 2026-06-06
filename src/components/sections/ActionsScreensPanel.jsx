import { useState } from 'react'
import { buildOverlayScreens } from '../../config/actionsEventsHelpers'
import { Copy, ExternalLink } from 'lucide-react'

function ActionsScreensPanel({ localOverlayUrl, overlayScreens, profile, onCopyOverlayUrl }) {
  // Prefer precomputed overlayScreens from controller (uses effectiveBase / publicBaseUrl when set).
  // This makes the "Pantallas" cards in Acciones y Eventos show the user's public domain instead of 127.0.0.1.
  const screens = Array.isArray(overlayScreens) && overlayScreens.length > 0
    ? overlayScreens
    : buildOverlayScreens(localOverlayUrl, profile)
  const [copiedScreen, setCopiedScreen] = useState(null)

  async function copyScreenUrl(screen, url) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedScreen(screen)
      onCopyOverlayUrl?.(url)
      setTimeout(() => setCopiedScreen(null), 1600)
    } catch {
      window.prompt('Copia esta URL de pantalla:', url)
    }
  }

  return (
    <div className="tc-ae-card">
      <div className="tc-ae-card-header">
        <div className="tc-ae-card-title">
          <span className="section-num">3.</span>
          <span>Pantallas</span>
        </div>
        <span className="ae-cell-muted" style={{ fontSize: 11 }}>
          10 URLs para OBS / Browser Source
        </span>
      </div>
      <div className="tc-ae-card-body">
        <div className="pantallas-grid" id="pantallas-list">
          {screens.map((screen) => (
            <article key={screen.screen} className="pantalla-card">
              <div className="pantalla-card-head">
                <strong className="pantalla-card-title">{screen.label}</strong>
                <span className="pantalla-card-badge">OBS</span>
              </div>
              <div className="pantalla-card-url-row">
                <span className="pantalla-card-badge">#{screen.screen}</span>
                <input
                  className="pantalla-card-input"
                  readOnly
                  value={screen.url}
                  onFocus={(event) => event.target.select()}
                />
                <button
                  type="button"
                  className="pantalla-card-icon-btn"
                  title="Copiar URL"
                  onClick={() => copyScreenUrl(screen.screen, screen.url)}
                >
                  <Copy size={16} />
                </button>
                <a
                  className="pantalla-card-icon-btn"
                  href={screen.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir pantalla"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
              {copiedScreen === screen.screen ? (
                <span style={{ fontSize: 11, color: '#7dd3fc' }}>URL copiada</span>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ActionsScreensPanel