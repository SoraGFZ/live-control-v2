import { Copy, ExternalLink, Plus, Settings } from 'lucide-react'
import WidgetPreviewFrame from './WidgetPreviewFrame.jsx'
import WidgetPreviewContent from './WidgetPreviewContent.jsx'
import { widgetSupportsConfig } from '../../config/widgetConfigSchemas.js'

function statusChipClass(status) {
  if (status === 'live') {
    return 'ok'
  }
  if (status === 'reference') {
    return 'warn'
  }
  return 'off'
}

function statusLabel(status) {
  if (status === 'live') {
    return 'Nativo'
  }
  if (status === 'reference') {
    return 'TikControl'
  }
  return 'Catalogo'
}

function OverlayWidgetPreviewCard({
  widget,
  goal,
  url = '',
  overlayKey = '',
  smartBar,
  smartBarStatus,
  widgets,
  leaderboards,
  music,
  musicStatus,
  onCopy,
  onOpen,
  onConfig,
  onJump,
  featured = false,
}) {
  const title = goal?.name || widget?.name || 'Widget'
  const status = goal ? 'reference' : widget?.status
  const category = goal ? 'goals' : widget?.category
  const metric = goal?.metric || widget?.metric
  const description = widget?.description
  const isReady = Boolean(url)
  const supportsConfig = widget && widgetSupportsConfig(widget.id)

  return (
    <article
      className={`tc-widget-card tc-widget-card--preview ${isReady ? 'is-live' : ''} ${featured ? 'is-featured' : ''}`}
    >
      <WidgetPreviewFrame>
        <WidgetPreviewContent
          widget={widget}
          goal={goal}
          overlayKey={overlayKey}
          smartBar={smartBar}
          smartBarStatus={smartBarStatus}
          widgets={widgets}
          leaderboards={leaderboards}
          music={music}
          musicStatus={musicStatus}
        />
      </WidgetPreviewFrame>

      <div className="tc-widget-card-body">
        <div className="tc-widget-card-head">
          <strong>{title}</strong>
          <span className={`status-chip ${statusChipClass(status)}`}>{statusLabel(status)}</span>
        </div>

        {category ? <span className="tag">{category}</span> : null}
        {description ? <p className="row-subcopy">{description}</p> : null}
        {metric ? <span className="muted-pill">Metrica: {metric}</span> : null}

        <div className="row-actions tc-widget-card-actions">
          {isReady ? (
            <>
              <button
                type="button"
                className="primary-button compact-button"
                onClick={() => onCopy?.(url, title)}
                title="Copia la URL para pegarla en OBS o LIVE Studio"
              >
                <Plus size={14} strokeWidth={2.1} />
                Agregar a OBS
              </button>
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => onCopy?.(url, title)}
              >
                <Copy size={14} strokeWidth={2.1} />
                Copiar URL
              </button>
              {supportsConfig ? (
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={() => onConfig?.(widget)}
                >
                  <Settings size={14} strokeWidth={2.1} />
                  Config
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => onOpen?.(widget, goal, url)}
              >
                <ExternalLink size={14} strokeWidth={2.1} />
                Abrir
              </button>
            </>
          ) : (
            <button type="button" className="ghost-button compact-button" onClick={() => onJump?.('overlay')}>
              Ver editor
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export default OverlayWidgetPreviewCard