import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import TikControlModuleShell from './TikControlModuleShell'
import OverlayWidgetPreviewCard from '../widgets/OverlayWidgetPreviewCard.jsx'
import {
  TIKCONTROL_WIDGETS,
  buildTikcontrolWidgetUrl,
} from '../../config/tikcontrolWidgetsCatalog'
import { CURATED_GIFT_CATALOG, normalizeGiftCatalogForPicker } from '../../dashboardViewHelpers'

const GIFT_OVERLAY_IDS = ['gift-alert', 'gift-gallery', 'gift-cannon', 'gift-jar', 'top-gift']

function GiftsHubSection({
  onJump,
  profile,
  serverStatus,
  tikTokGiftCatalog = [],
  onSyncGiftCatalog,
}) {
  const overlayKey = profile?.overlayKey || ''
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const giftOverlayWidgets = TIKCONTROL_WIDGETS.filter((widget) => GIFT_OVERLAY_IDS.includes(widget.id))
  const [search, setSearch] = useState('')
  const [syncFeedback, setSyncFeedback] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)

  const catalog = useMemo(() => {
    const source = tikTokGiftCatalog.length > 0 ? tikTokGiftCatalog : CURATED_GIFT_CATALOG
    return source.map((gift, index) => normalizeGiftCatalogForPicker(gift, index))
  }, [tikTokGiftCatalog])

  const filteredCatalog = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) {
      return catalog
    }

    return catalog.filter((gift) =>
      `${gift.name} ${gift.id} ${gift.coins}`.toLowerCase().includes(needle),
    )
  }, [catalog, search])

  const withImages = catalog.filter((gift) => Boolean(gift.imageUrl)).length

  async function handleSyncCatalog() {
    if (!onSyncGiftCatalog) {
      onJump('live-ops')
      return
    }

    setIsSyncing(true)
    setSyncFeedback('')

    try {
      const result = await onSyncGiftCatalog({ force: true })
      setSyncFeedback(
        result?.count
          ? `Catalogo sincronizado: ${result.count} regalos con imagenes.`
          : 'Catalogo sincronizado.',
      )
    } catch (error) {
      setSyncFeedback(error?.message || 'No pude sincronizar el catalogo de regalos.')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <TikControlModuleShell sectionId="gifts-hub" onJump={onJump}>
      <div className="tc-widgets-stats">
        <div className="metric-card">
          <span className="metric-label">Gifts en catalogo</span>
          <strong>{catalog.length}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Con imagen</span>
          <strong>{withImages}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Recibidos sesion</span>
          <strong>{serverStatus?.leaderboards?.giftsReceived ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Monedas</span>
          <strong>{serverStatus?.leaderboards?.totalCoins ?? 0}</strong>
        </div>
      </div>

      <article className="surface-card">
        <p>
          Catalogo estilo TikControl: mismas imagenes oficiales de TikTok para alertas, galeria y
          seleccion en acciones. Sincroniza una vez con el live conectado.
        </p>
        <div className="card-actions">
          <button
            type="button"
            className="primary-button"
            disabled={isSyncing}
            onClick={() => void handleSyncCatalog()}
          >
            <RefreshCw size={16} strokeWidth={2.1} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar catalogo TikTok'}
          </button>
          <button type="button" className="secondary-button" onClick={() => onJump('live-ops')}>
            TikTok Live
          </button>
        </div>
        {syncFeedback ? <span className="feedback-pill">{syncFeedback}</span> : null}
        {serverStatus?.tikTok?.giftCatalogLastError ? (
          <p className="support-copy">{serverStatus.tikTok.giftCatalogLastError}</p>
        ) : null}
        <p className="support-copy">
          Tip: conecta TikTok en <strong>TikTok Live</strong> y pulsa sincronizar para cargar todas las
          imagenes oficiales de regalos de tu region.
        </p>
      </article>

      <h3 className="section-inline-title">Overlays de regalos (vista previa)</h3>
      <div className="tc-widget-gallery-grid tc-widget-gallery-grid--preview">
        {giftOverlayWidgets.map((widget) => (
          <OverlayWidgetPreviewCard
            key={widget.id}
            widget={widget}
            url={buildTikcontrolWidgetUrl(widget, { baseUrl, overlayKey })}
            overlayKey={overlayKey}
            leaderboards={serverStatus?.leaderboards}
            onCopy={async (url) => navigator.clipboard.writeText(url)}
            onOpen={(_w, _g, url) => window.open(url, '_blank', 'noopener,noreferrer')}
            onJump={onJump}
          />
        ))}
      </div>

      <div className="surface-card" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <strong style={{ fontSize: '1rem' }}>Catálogo de regalos TikTok</strong>
            <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#64748b' }}>({filteredCatalog.length} regalos)</span>
          </div>
          <div className="picker-search" style={{ maxWidth: 260 }}>
            <input
              className="text-field"
              placeholder="Buscar regalo..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="tc-gifts-catalog-grid">
          {filteredCatalog.map((gift) => (
            <article key={`${gift.id}-${gift.name}`} className="tc-gift-catalog-card">
              <div className="tc-gift-catalog-thumb">
                {gift.imageUrl ? (
                  <img src={gift.imageUrl} alt={gift.name} loading="lazy" />
                ) : (
                  <span className="tc-gift-catalog-fallback">{gift.token || '?'}</span>
                )}
              </div>
              <div className="tc-gift-info">
                <strong title={gift.name}>{gift.name}</strong>
                <div className="tc-gift-meta">
                  <span className="coin-badge">{gift.coins} 🪙</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </TikControlModuleShell>
  )
}

export default GiftsHubSection