import { useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import WidgetConfigModal from '../widgets/WidgetConfigModal.jsx'
import OverlayWidgetPreviewCard from '../widgets/OverlayWidgetPreviewCard.jsx'
import {
  WIDGET_CATEGORIES,
  TIKCONTROL_WIDGETS,
  TIKCONTROL_GOALS,
  buildWidgetOverlayUrl,
  buildGoalOverlayUrl,
  countWidgetsByStatus,
  getWidgetsByCategory,
} from '../../config/tikcontrolWidgetsCatalog'
import TikControlModuleShell from './TikControlModuleShell'

function WidgetsGallerySection({
  localOverlayUrl,
  onCopyUrl,
  onJump,
  onOpenOverlayWindow,
  onOpenSmartBarWindow,
  onOpenSongRequestWindow,
  onOpenTopGiftsWindow,
  onOpenTopLikesWindow,
  preferredOverlayUrl,
  profile,
  serverStatus,
  smartBar,
  widgets,
  music,
}) {
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')
  const [configWidget, setConfigWidget] = useState(null)

  const slug = profile?.overlaySlug || 'main-stage'
  const overlayKey = profile?.overlayKey || ''
  const baseUrl =
    (typeof window !== 'undefined' && window.location?.origin) ||
    (preferredOverlayUrl ? new URL(preferredOverlayUrl, 'http://localhost').origin : '') ||
    ''

  const widgetList = useMemo(() => {
    const list = getWidgetsByCategory(category)
    const needle = search.trim().toLowerCase()
    if (!needle) {
      return list
    }
    return list.filter((widget) =>
      `${widget.name} ${widget.description || ''} ${widget.category} ${widget.metric || ''}`
        .toLowerCase()
        .includes(needle),
    )
  }, [category, search])

  const filteredGoals = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) {
      return TIKCONTROL_GOALS
    }
    return TIKCONTROL_GOALS.filter((goal) =>
      `${goal.name} ${goal.metric}`.toLowerCase().includes(needle),
    )
  }, [search])

  const statusCounts = countWidgetsByStatus()
  const showGoals = category === 'all' || category === 'goals'
  const showWidgets = category !== 'goals'

  function resolveUrl(widget) {
    return buildWidgetOverlayUrl(widget, {
      slug,
      baseUrl: baseUrl || (typeof window !== 'undefined' ? window.location.origin : ''),
      overlayKey,
    })
  }

  async function handleCopy(url, label) {
    if (!url) {
      setCopyFeedback('Este widget aun no tiene URL publica.')
      return
    }
    if (onCopyUrl) {
      await onCopyUrl(url)
    } else {
      await navigator.clipboard.writeText(url)
    }
    setCopyFeedback(`Listo para OBS: ${label}`)
  }

  function handleOpen(widget, _goal, url) {
    if (!widget) {
      if (url && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
      return
    }

    if (widget.liveRoute === 'top-gifts') {
      onOpenTopGiftsWindow?.()
      return
    }
    if (widget.liveRoute === 'smart-bar') {
      onOpenSmartBarWindow?.()
      return
    }
    if (widget.liveRoute === 'song-request') {
      onOpenSongRequestWindow?.()
      return
    }
    if (widget.liveRoute === 'overlay') {
      onOpenOverlayWindow?.()
      return
    }

    const referenceUrl = resolveUrl(widget)
    if (referenceUrl && typeof window !== 'undefined') {
      window.open(referenceUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const previewProps = {
    overlayKey,
    smartBar,
    smartBarStatus: serverStatus?.smartBar,
    widgets,
    leaderboards: serverStatus?.leaderboards,
    music,
    musicStatus: serverStatus?.music,
    onCopy: handleCopy,
    onOpen: handleOpen,
    onConfig: setConfigWidget,
    onJump,
  }

  return (
    <TikControlModuleShell sectionId="widgets-gallery" onJump={onJump}>
      <div className="tc-widgets-stats">
        <div className="metric-card">
          <span className="metric-label">Plan</span>
          <strong>{serverStatus?.account?.label || 'Premium'}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Widgets TikControl</span>
          <strong>{TIKCONTROL_WIDGETS.length}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">HTML TikControl</span>
          <strong>{statusCounts.reference || 0}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Nativos React</span>
          <strong>{statusCounts.live || 0}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Likes sesion</span>
          <strong>{serverStatus?.leaderboards?.totalLikes ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Monedas sesion</span>
          <strong>{serverStatus?.leaderboards?.totalCoins ?? 0}</strong>
        </div>
      </div>

      <div className="picker-toolbar">
        <div className="picker-search">
          <input
            className="text-field"
            placeholder="Buscar widgets (likes, regalos, chat, metas...)"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="picker-categories">
          {WIDGET_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`category-pill ${category === item.id ? 'active' : ''}`}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {copyFeedback ? <span className="feedback-pill">{copyFeedback}</span> : null}

      <div className="surface-card tc-live-studio-guide">
        <div className="guide-header">
          <h3>Cómo usar los widgets en OBS</h3>
          <span className="guide-badge">TikControl Style</span>
        </div>
        <ol className="tc-live-studio-steps">
          <li>Explora las tarjetas con <strong>vista previa en vivo</strong>.</li>
          <li>Haz clic en <strong>Agregar a OBS</strong> para copiar la URL.</li>
          <li>En OBS / TikTok LIVE Studio: Fuentes → Añadir → Navegador → Pega la URL.</li>
          <li>Recomendado: Fondo transparente, tamaño aproximado 420×720 o el que necesites.</li>
          <li>Usa el botón <strong>Config</strong> en widgets que lo soporten (alertas de regalo, metas, subastas, etc).</li>
        </ol>
      </div>

      {showWidgets ? (
        <div className="tc-widget-gallery-grid tc-widget-gallery-grid--preview">
          {widgetList.map((widget) => (
            <OverlayWidgetPreviewCard
              key={widget.id}
              widget={widget}
              url={resolveUrl(widget)}
              featured={widget.featured}
              {...previewProps}
            />
          ))}
        </div>
      ) : null}

      {showGoals ? (
        <>
          <h3 className="section-inline-title">Metas TikControl (goals)</h3>
          <div className="tc-widget-gallery-grid tc-widget-gallery-grid--preview">
            {filteredGoals.map((goal) => (
              <OverlayWidgetPreviewCard
                key={goal.id}
                goal={goal}
                url={buildGoalOverlayUrl(goal, { baseUrl, overlayKey })}
                {...previewProps}
              />
            ))}
          </div>
        </>
      ) : null}

      <div className="game-callout game-callout-info">
        <strong>Widgets conectados al live</strong>
        <p>
          Chat, alertas, rankings y metas reciben eventos de TikTok via WebSocket local. Las vistas previa
          cargan al hacer scroll para no saturar la app.
        </p>
        <div className="card-actions">
          <button type="button" className="primary-button" onClick={() => onJump('live-hub')}>
            <Link2 size={16} strokeWidth={2.1} />
            Centro en vivo
          </button>
          <button type="button" className="secondary-button" onClick={() => onJump('overlay')}>
            Editor de overlays
          </button>
        </div>
        {localOverlayUrl ? <code className="dense-code">{localOverlayUrl}</code> : null}
      </div>

      {configWidget ? (
        <WidgetConfigModal
          widgetId={configWidget.id}
          widgetName={configWidget.name}
          onClose={() => setConfigWidget(null)}
        />
      ) : null}
    </TikControlModuleShell>
  )
}

export default WidgetsGallerySection