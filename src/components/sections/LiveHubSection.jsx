import { formatDateTime } from '../../dashboardShared'
import { PRODUCT } from '../../config/product'
import { TopGiftsWidget, SongRequestWidget } from '../overlay/OverlayScreens'
import TikControlWidgetFrame from '../overlay/TikControlWidgetFrame'
import SectionHeader from '../common/SectionHeader'

function LiveHubSection({
  appState,
  leaderboards,
  localOverlayUrl,
  localSmartBarUrl,
  localSongRequestUrl,
  localTopLikesUrl,
  localTopGiftsUrl,
  music,
  musicStatus,
  onConnectSpotify,
  onConnectTikTok,
  onCopyTopGiftsUrl,
  onCopyTopLikesUrl,
  onDisconnectTikTok,
  onJump,
  onOpenSongRequestWindow,
  onOpenTopGiftsWindow,
  onOpenTopLikesWindow,
  onResetLeaderboards,
  profile,
  recentEvents,
  serverStatus,
  tiktokUsernameDraft,
  updateTopGiftsWidgetField,
  updateTopLikesWidgetField,
  setTiktokUsernameDraft,
}) {
  const tikTokConnected = Boolean(serverStatus.tikTok.connected)
  const topLikes = leaderboards?.topLikes || []
  const topGifts = leaderboards?.topGifts || []

  return (
    <section className="panel-section" id="live-hub">
      <SectionHeader
        eyebrow="Centro en vivo"
        title="Tu directo, un solo panel"
        description="Flujo tipo estudio profesional: conecta TikTok, activa widgets y automatiza reacciones sin salir de Live Control."
      />

      <div className="commercial-hero-strip">
        <div className="hero-content">
          <div className="hero-badge">Centro de Operaciones</div>
          <h3>Tu directo, todo en un solo lugar</h3>
          <p>
            Conecta TikTok, monitorea rankings en tiempo real, activa widgets y controla todo sin salir del panel.
          </p>
        </div>

        <div className="commercial-quick-grid">
          <button type="button" className="commercial-quick-card" onClick={() => onJump('live-ops')}>
            <div className="quick-icon">📡</div>
            <div>
              <strong>Conectar TikTok</strong>
              <span>Sesión del live, gifts y emotes</span>
            </div>
          </button>
          <button type="button" className="commercial-quick-card" onClick={() => onJump('widgets-gallery')}>
            <div className="quick-icon">🖼️</div>
            <div>
              <strong>Galería de Overlays</strong>
              <span>Likes, regalos, chat y más</span>
            </div>
          </button>
          <button type="button" className="commercial-quick-card" onClick={() => onJump('overlay')}>
            <div className="quick-icon">✏️</div>
            <div>
              <strong>Editor de Overlays</strong>
              <span>URLs, medios y configuración</span>
            </div>
          </button>
          <button type="button" className="commercial-quick-card" onClick={() => onJump('actions')}>
            <div className="quick-icon">⚡</div>
            <div>
              <strong>Automatizaciones</strong>
              <span>Acciones y triggers por evento</span>
            </div>
          </button>
          <button type="button" className="commercial-quick-card" onClick={() => onJump('music')}>
            <div className="quick-icon">🎵</div>
            <div>
              <strong>Música</strong>
              <span>Spotify Song Request</span>
            </div>
          </button>
        </div>
      </div>

      <div className="live-hub-grid">
        <div className="live-hub-hero surface-card">
          <div className="card-top">
            <div>
              <h3>Estado del live</h3>
              <p>Conecta TikTok y deja los overlays listos antes de abrir LIVE Studio.</p>
            </div>
            <span className={`status-chip ${tikTokConnected ? 'ok' : 'warn'}`}>
              {tikTokConnected ? 'TikTok conectado' : 'TikTok pendiente'}
            </span>
          </div>

          <div className="live-hub-status-grid">
            <div className="live-hub-status-card">
              <div className="status-row">
                <span className="snippet-label">TikTok</span>
                <span className={`status-dot ${tikTokConnected ? 'ok' : 'off'}`}></span>
              </div>
              <strong>{serverStatus.tikTok.username || profile.tiktokUsername || 'Sin usuario'}</strong>
              <p className="status-sub">{tikTokConnected ? `Room ${serverStatus.tikTok.roomId || 'activo'}` : 'Desconectado'}</p>
            </div>
            <div className="live-hub-status-card">
              <div className="status-row">
                <span className="snippet-label">Spotify</span>
                <span className={`status-dot ${musicStatus.connected ? 'ok' : 'off'}`}></span>
              </div>
              <strong>{musicStatus.connected ? musicStatus.accountLabel : 'Sin conectar'}</strong>
              <p className="status-sub">{music.enabled ? 'Song Request activo' : 'Song Request apagado'}</p>
            </div>
            <div className="live-hub-status-card metric">
              <span className="snippet-label">Likes del live</span>
              <strong>{leaderboards?.totalLikes || 0}</strong>
              <p className="status-sub">{leaderboards?.trackedLikers || 0} viewers con likes</p>
            </div>
            <div className="live-hub-status-card metric">
              <span className="snippet-label">Coins de gifts</span>
              <strong>{leaderboards?.totalCoins || 0}</strong>
              <p className="status-sub">{leaderboards?.trackedGifters || 0} gifters</p>
            </div>
          </div>

          <div className="row-actions">
            <input
              className="text-field"
              placeholder="Usuario de TikTok"
              value={tiktokUsernameDraft}
              onChange={(event) => setTiktokUsernameDraft(event.target.value)}
            />
            {tikTokConnected ? (
              <button className="ghost-button" onClick={onDisconnectTikTok}>
                Desconectar TikTok
              </button>
            ) : (
              <button className="primary-button" onClick={onConnectTikTok}>
                Conectar TikTok Live
              </button>
            )}
            {!musicStatus.connected ? (
              <button className="secondary-button" onClick={onConnectSpotify}>
                Conectar Spotify
              </button>
            ) : null}
            <button className="ghost-button" onClick={onResetLeaderboards}>
              Reiniciar rankings
            </button>
          </div>
        </div>

        <div className="surface-card">
          <div className="card-top">
            <div>
              <h3>Widgets para OBS / Live Studio</h3>
              <p>Agrega cada URL como fuente de navegador. Son transparentes y se actualizan solos.</p>
            </div>
          </div>

          <div className="live-hub-widget-grid">
            <div className="live-hub-widget-card">
              <strong>Alertas generales</strong>
              <code className="overlay-link">{localOverlayUrl}</code>
              <button className="secondary-button compact-button" onClick={() => onJump('overlay')}>
                Configurar overlay
              </button>
            </div>
            <div className="live-hub-widget-card">
              <strong>Smart Bar</strong>
              <code className="overlay-link">{localSmartBarUrl}</code>
              <button className="secondary-button compact-button" onClick={() => onJump('overlay')}>
                Ver smart bar
              </button>
            </div>
            <div className="live-hub-widget-card">
              <strong>Song Request</strong>
              <code className="overlay-link">{localSongRequestUrl}</code>
              <button className="secondary-button compact-button" onClick={onOpenSongRequestWindow}>
                Abrir widget
              </button>
            </div>
            <div className="live-hub-widget-card">
              <strong>Top Likes</strong>
              <code className="overlay-link">{localTopLikesUrl}</code>
              <div className="row-actions">
                <button className="secondary-button compact-button" onClick={onCopyTopLikesUrl}>
                  Copiar URL
                </button>
                <button className="ghost-button compact-button" onClick={onOpenTopLikesWindow}>
                  Abrir
                </button>
              </div>
            </div>
            <div className="live-hub-widget-card">
              <strong>Top Gifts</strong>
              <code className="overlay-link">{localTopGiftsUrl}</code>
              <div className="row-actions">
                <button className="secondary-button compact-button" onClick={onCopyTopGiftsUrl}>
                  Copiar URL
                </button>
                <button className="ghost-button compact-button" onClick={onOpenTopGiftsWindow}>
                  Abrir
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="live-hub-preview-row">
          <div className="surface-card">
            <div className="card-top">
              <h3>Vista previa Top Likes</h3>
              <span className="state-badge">{topLikes.length}</span>
            </div>
            <div className="tikcontrol-widget-preview-shell compact">
              <TikControlWidgetFrame widgetFile="top-likes.html" className="tikcontrol-widget-frame--preview" />
            </div>
          </div>

          <div className="surface-card">
            <div className="card-top">
              <h3>Vista previa Top Gifts</h3>
              <span className="state-badge">{topGifts.length}</span>
            </div>
            <TopGiftsWidget widgets={appState.widgets} leaderboards={leaderboards} preview />
          </div>
        </div>

        <div className="live-hub-preview-row">
          <div className="surface-card">
            <div className="card-top">
              <h3>Song Request</h3>
              <span className={`status-chip ${musicStatus.connected ? 'ok' : 'off'}`}>
                {musicStatus.connected ? 'Spotify listo' : 'Pendiente'}
              </span>
            </div>
            <SongRequestWidget music={music} musicStatus={musicStatus} preview />
            <button className="secondary-button" onClick={() => onJump('music')}>
              Ir a configuracion de musica
            </button>
          </div>

          <div className="surface-card">
            <div className="card-top">
              <h3>Ultimos eventos del live</h3>
              <span className="state-badge">{recentEvents.length}</span>
            </div>
            <div className="live-hub-events-list">
              {recentEvents.length === 0 ? (
                <div className="empty-state-card">
                  <p>Cuando conectes TikTok, aqui veras gifts, likes, follows y comentarios en tiempo real.</p>
                </div>
              ) : (
                recentEvents.slice(0, 12).map((eventItem) => (
                  <div key={eventItem.id} className="live-hub-event-row">
                    <strong>{eventItem.summary || eventItem.type}</strong>
                    <span className="row-subcopy">
                      {eventItem.type} · {formatDateTime(eventItem.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
            <button className="secondary-button" onClick={() => onJump('live-ops')}>
              Ir a TikTok Live
            </button>
          </div>
        </div>

        <div className="surface-card">
          <div className="card-top">
            <h3>Ajustes rapidos de rankings</h3>
          </div>
          <div className="mini-grid">
            <div>
              <label className="field-label" htmlFor="top-likes-title">
                Titulo Top Likes
              </label>
              <input
                id="top-likes-title"
                className="text-field"
                value={appState.widgets?.topLikes?.title || 'Top Likes'}
                onChange={(event) => updateTopLikesWidgetField('title', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="top-likes-visible">
                Posiciones visibles
              </label>
              <input
                id="top-likes-visible"
                className="text-field"
                value={appState.widgets?.topLikes?.maxVisible || '5'}
                onChange={(event) => updateTopLikesWidgetField('maxVisible', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="top-gifts-title">
                Titulo Top Gifts
              </label>
              <input
                id="top-gifts-title"
                className="text-field"
                value={appState.widgets?.topGifts?.title || 'Top Gifts'}
                onChange={(event) => updateTopGiftsWidgetField('title', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="top-gifts-visible">
                Posiciones visibles
              </label>
              <input
                id="top-gifts-visible"
                className="text-field"
                value={appState.widgets?.topGifts?.maxVisible || '5'}
                onChange={(event) => updateTopGiftsWidgetField('maxVisible', event.target.value)}
              />
            </div>
          </div>
          <p className="support-copy">
            Slug actual del overlay: <strong>{profile.overlaySlug || 'main-stage'}</strong>. Los widgets usan ese slug en
            la URL.
          </p>
        </div>
      </div>
    </section>
  )
}

export default LiveHubSection