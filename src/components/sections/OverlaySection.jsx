import { formatDurationClock } from '../../dashboardViewHelpers'
import { Trash2 } from 'lucide-react'
import { DEFAULT_SERVER_STATUS } from '../../dashboardShared'
import { SmartBarWidget, TopLikesWidget } from '../overlay/OverlayWidgets'
import TikControlWidgetFrame from '../overlay/TikControlWidgetFrame'
import SectionHeader from '../common/SectionHeader'
import WidgetErrorBoundary from '../common/WidgetErrorBoundary'

function OverlaySection({
  linkFeedback,
  localOverlayUrl,
  localSmartBarUrl,
  localTopGiftsUrl,
  localTopLikesUrl,
  leaderboards,
  mediaLibrary,
  mediaLibraryError,
  onAdjustSmartBarWins,
  onCopySmartBarUrl,
  onDeleteMedia,
  onCopyOverlayUrl,
  onOpenOverlayWindow,
  onOpenSmartBarWindow,
  onOpenTopGiftsWindow,
  onOpenTopLikesWindow,
  onCopyLiveStudioTopGiftsUrl,
  onCopyLiveStudioTopLikesUrl,
  onCopyTopGiftsUrl,
  onCopyTopLikesUrl,
  onRefreshMedia,
  onResetLeaderboards,
  onResetSmartBarWins,
  onTestTopGifts,
  onTestTopLikes,
  onUploadMedia,
  publicOverlayUrl,
  publicSmartBarUrl,
  publicTopGiftsUrl,
  publicTopLikesUrl,
  liveStudioTopGiftsUrl,
  liveStudioTopLikesUrl,
  liveStudioTunnelRejected,
  profile,
  serverPort,
  serverStatus,
  smartBar,
  widgets,
  updateSmartBarField,
  updateTopGiftsWidgetField,
  updateTopLikesWidgetField,
  updateProfileField,
  isUploadingMedia,
  showCorePanel = true,
}) {
  const topLikes = widgets?.topLikes || {}
  const topGifts = widgets?.topGifts || {}
  const smartBarStatus = serverStatus?.smartBar || DEFAULT_SERVER_STATUS.smartBar
  const leaderboardState = serverStatus?.leaderboards || DEFAULT_SERVER_STATUS.leaderboards
  const safeProfile = profile || DEFAULT_SERVER_STATUS.profile
  const safeMediaLibrary = Array.isArray(mediaLibrary) ? mediaLibrary : []
  const serverPortLabel = serverStatus?.server?.port || DEFAULT_SERVER_STATUS.server.port

  const sectionClassName = showCorePanel
    ? 'panel-section workspace-overlay-panel'
    : 'panel-section workspace-overlay-panel workspace-overlay-extras'

  return (
    <section
      className={sectionClassName}
      id={showCorePanel ? 'overlay-settings' : 'overlay-settings-extras'}
    >
      {showCorePanel ? (
        <>
          <SectionHeader
            eyebrow="Salida visual"
            title="Overlay"
            description="Aqui dejas la URL, las claves y tu biblioteca local para las alertas."
          />

          <div className="overlay-grid">
            <div className="surface-card settings-card">
              <h3>Ajustes base</h3>

              <div className="form-grid two-col">
                <div>
                  <label className="field-label" htmlFor="project-name">Nombre del proyecto</label>
                  <input
                    id="project-name"
                    className="text-field"
                    value={safeProfile.projectName || ''}
                    onChange={(event) => updateProfileField('projectName', event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="streamer-name">Nombre del streamer</label>
                  <input
                    id="streamer-name"
                    className="text-field"
                    value={safeProfile.streamerName || ''}
                    onChange={(event) => updateProfileField('streamerName', event.target.value)}
                  />
                </div>
              </div>

              <label className="field-label" htmlFor="overlay-slug">
                Slug del overlay
              </label>
              <input
                id="overlay-slug"
                className="text-field"
                value={safeProfile.overlaySlug || ''}
                onChange={(event) => updateProfileField('overlaySlug', event.target.value)}
              />

              <label className="field-label" htmlFor="public-base-url">
                URL publica base
              </label>
              <input
                id="public-base-url"
                className="text-field"
                placeholder="https://tu-tunel.trycloudflare.com"
                value={safeProfile.publicBaseUrl || ''}
                onChange={(event) => updateProfileField('publicBaseUrl', event.target.value)}
              />

              <label className="field-label" htmlFor="overlay-duration">
                Duracion de alerta en ms
              </label>
              <input
                id="overlay-duration"
                className="text-field"
                value={safeProfile.overlayDurationMs || ''}
                onChange={(event) => updateProfileField('overlayDurationMs', event.target.value)}
              />

              <label className="field-label" htmlFor="dashboard-key">
                Clave del panel
              </label>
              <input
                id="dashboard-key"
                type="password"
                className="text-field"
                placeholder="Protege dashboard, APIs y sockets internos"
                value={safeProfile.dashboardKey || ''}
                onChange={(event) => updateProfileField('dashboardKey', event.target.value)}
              />

              <label className="field-label" htmlFor="overlay-key">
                Clave publica del overlay
              </label>
              <input
                id="overlay-key"
                type="password"
                className="text-field"
                placeholder="Opcional para proteger el browser source"
                value={safeProfile.overlayKey || ''}
                onChange={(event) => updateProfileField('overlayKey', event.target.value)}
              />

              <p className="support-copy">
                La URL publica base debe ser solo el dominio del tunel o tu sitio. Si configuras una
                clave de overlay, la app la agrega automaticamente al link final con `?key=...`.
              </p>
              <p className="support-copy">
                Publicacion en la nube para LIVE Studio: la configuraremos en una proxima version.
                Por ahora usa los links locales en OBS o previsualiza widgets desde este panel.
              </p>
            </div>

            <div className="surface-card link-card premium-link-card">
              <div className="link-card-header">
                <span className="signal-label">Links del overlay</span>
                <span className="premium-badge">Listo para OBS</span>
              </div>

              <div className="link-stack">
                <div className="link-item">
                  <div className="link-meta">
                    <span className="snippet-label">Local (PC)</span>
                    <span className="link-badge ok">Rápido</span>
                  </div>
                  <div className="url-display">
                    <code className="overlay-link">{localOverlayUrl}</code>
                  </div>
                </div>

                <div className="link-item">
                  <div className="link-meta">
                    <span className="snippet-label">Pública (LIVE Studio)</span>
                    <span className="link-badge">Cloud / Tunel</span>
                  </div>
                  <div className="url-display">
                    <code className="overlay-link">
                      {publicOverlayUrl || 'Configura URL pública base arriba para generar el link real.'}
                    </code>
                  </div>
                </div>
              </div>

              <p className="link-hint">
                Usa la pública en OBS / TikTok LIVE Studio como fuente de navegador (fondo transparente recomendado).
              </p>

              <div className="card-actions">
                <button type="button" className="primary-button" onClick={onCopyOverlayUrl}>
                  {publicOverlayUrl ? 'Copiar URL pública' : 'Copiar URL local'}
                </button>
                <button type="button" className="secondary-button" onClick={onOpenOverlayWindow}>
                  Previsualizar overlay
                </button>
              </div>

              {linkFeedback ? <span className="feedback-pill success">{linkFeedback}</span> : null}
            </div>


          </div>
        </>
      ) : null}

      <div className="overlay-grid">
        {!showCorePanel ? (
          <div className="surface-card settings-card">
            <h3>Claves y duracion</h3>

            <label className="field-label" htmlFor="overlay-duration-extra">
              Duracion de alerta en ms
            </label>
            <input
              id="overlay-duration-extra"
              className="text-field"
              value={safeProfile.overlayDurationMs || ''}
              onChange={(event) => updateProfileField('overlayDurationMs', event.target.value)}
            />

            <label className="field-label" htmlFor="dashboard-key-extra">
              Clave del panel
            </label>
            <input
              id="dashboard-key-extra"
              type="password"
              className="text-field"
              placeholder="Protege dashboard, APIs y sockets internos"
              value={safeProfile.dashboardKey || ''}
              onChange={(event) => updateProfileField('dashboardKey', event.target.value)}
            />

            <label className="field-label" htmlFor="overlay-key-extra">
              Clave publica del overlay
            </label>
            <input
              id="overlay-key-extra"
              type="password"
              className="text-field"
              placeholder="Opcional para proteger el browser source"
              value={safeProfile.overlayKey || ''}
              onChange={(event) => updateProfileField('overlayKey', event.target.value)}
            />
          </div>
        ) : null}

        <div className="surface-card settings-card">
          <h3>Smart bar</h3>

          <div className="smartbar-preview-shell">
            <span className="snippet-label">Vista previa</span>
            <WidgetErrorBoundary resetKey={`smartbar-${smartBar?.title || ''}`}>
              <SmartBarWidget smartBar={smartBar} smartBarStatus={smartBarStatus} compact />
            </WidgetErrorBoundary>
          </div>

          <label className="field-label" htmlFor="smartbar-title">
            Titulo
          </label>
          <input
            id="smartbar-title"
            className="text-field"
            value={smartBar.title || ''}
            onChange={(event) => updateSmartBarField('title', event.target.value)}
          />

          <label className="field-label" htmlFor="smartbar-goal">
            Meta de victorias
          </label>
          <input
            id="smartbar-goal"
            className="text-field"
            value={smartBar.winGoal || ''}
            onChange={(event) => updateSmartBarField('winGoal', event.target.value)}
          />

          <div className="smartbar-counter">
            <button className="secondary-button" onClick={() => onAdjustSmartBarWins(-1)}>
              -
            </button>
            <div className="smartbar-counter-value">
              <span className="snippet-label">Victorias</span>
              <strong>{Number(smartBar.currentWins || 0)}</strong>
            </div>
            <button className="primary-button" onClick={() => onAdjustSmartBarWins(1)}>
              +
            </button>
          </div>

          <div className="card-actions">
            <button className="ghost-button compact-button" onClick={onResetSmartBarWins}>
              Reset wins
            </button>
          </div>

          <div className="option-grid">
            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(smartBar.showWins)}
                onChange={(event) => updateSmartBarField('showWins', event.target.checked)}
              />
              <div>
                <strong>Mostrar wins</strong>
                <span>Contador manual para retos y metas del directo.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(smartBar.showCoins)}
                onChange={(event) => updateSmartBarField('showCoins', event.target.checked)}
              />
              <div>
                <strong>Mostrar coins</strong>
                <span>Suma los coins reales que entran por gifts.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(smartBar.showFollows)}
                onChange={(event) => updateSmartBarField('showFollows', event.target.checked)}
              />
              <div>
                <strong>Mostrar follows</strong>
                <span>Cuenta nuevos follows en la sesion actual.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(smartBar.showLiveDuration)}
                onChange={(event) => updateSmartBarField('showLiveDuration', event.target.checked)}
              />
              <div>
                <strong>Mostrar tiempo</strong>
                <span>Reloj del live desde que conectas TikTok.</span>
              </div>
            </label>
          </div>

          <div className="mini-grid">
            <div>
              <span className="snippet-label">Coins recibidos</span>
              <p>{smartBarStatus.receivedCoins}</p>
            </div>
            <div>
              <span className="snippet-label">Follows nuevos</span>
              <p>{smartBarStatus.followCount}</p>
            </div>
            <div>
              <span className="snippet-label">Tiempo en live</span>
              <p>{formatDurationClock(smartBarStatus.liveDurationMs)}</p>
            </div>
            <div>
              <span className="snippet-label">Sesion</span>
              <p>{smartBarStatus.connected ? 'En vivo' : 'Stand by'}</p>
            </div>
          </div>

          <div className="link-stack">
            <div>
              <span className="snippet-label">Smart bar local</span>
              <code className="overlay-link">{localSmartBarUrl}</code>
            </div>
            <div>
              <span className="snippet-label">Smart bar publica</span>
              <code className="overlay-link">
                {publicSmartBarUrl || 'Completa la URL publica base para generar el link real.'}
              </code>
            </div>
          </div>

          <div className="card-actions">
            <button className="primary-button" onClick={onCopySmartBarUrl}>
              {publicSmartBarUrl ? 'Copiar smart bar publica' : 'Copiar smart bar local'}
            </button>
            <button className="secondary-button" onClick={onOpenSmartBarWindow}>
              Abrir smart bar local
            </button>
          </div>

          <p className="support-copy">
            Este widget combina victorias manuales con follows, coins y tiempo real del live.
          </p>
        </div>

        <div className="surface-card settings-card">
          <h3>Top Likes</h3>
          <p className="support-copy">
            Configura el ranking de likes del live. Los cambios se reflejan en tiempo real en la preview y en el widget de OBS.
          </p>

          {/* Live preview using the real component (Tikfinity / premium style) */}
          <div className="music-spotify-preview-shell" style={{ marginBottom: '16px' }}>
            <span className="snippet-label">Preview en vivo (cambios instantáneos)</span>
            <TopLikesWidget
              widgets={{ topLikes }}
              leaderboards={leaderboards || leaderboardState}
              preview
            />
          </div>

          <div className="form-grid two-col">
            <div>
              <label className="field-label" htmlFor="top-likes-overlay-title">Título</label>
              <input
                id="top-likes-overlay-title"
                className="text-field"
                value={topLikes.title || 'Top Likes'}
                onChange={(event) => updateTopLikesWidgetField('title', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="top-likes-overlay-kicker">Subtítulo / kicker</label>
              <input
                id="top-likes-overlay-kicker"
                className="text-field"
                value={topLikes.kicker || 'TikTok Live'}
                onChange={(event) => updateTopLikesWidgetField('kicker', event.target.value)}
              />
            </div>
          </div>

          <div className="form-grid two-col">
            <div>
              <label className="field-label" htmlFor="top-likes-overlay-visible">Posiciones visibles (1-20)</label>
              <input
                id="top-likes-overlay-visible"
                className="text-field"
                type="number"
                min="1"
                max="20"
                value={topLikes.maxVisible || '5'}
                onChange={(event) => updateTopLikesWidgetField('maxVisible', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="top-likes-accent-color">Color de acento</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={topLikes.accentColor || '#ff6b9d'}
                  onChange={(event) => updateTopLikesWidgetField('accentColor', event.target.value)}
                  style={{ width: '48px', height: '38px', padding: 0, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', background: 'transparent' }}
                />
                <input
                  id="top-likes-accent-color"
                  className="text-field"
                  placeholder="#ff6b9d"
                  value={topLikes.accentColor || ''}
                  onChange={(event) => updateTopLikesWidgetField('accentColor', event.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <div className="field-label" style={{ marginBottom: '8px' }}>Mostrar en el ranking</div>
            <div className="leaderboard-widget-toggles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
              <label className="leaderboard-widget-toggle">
                <input
                  type="checkbox"
                  checked={topLikes.showRank !== false}
                  onChange={(event) => updateTopLikesWidgetField('showRank', event.target.checked)}
                />
                Posición (#)
              </label>
              <label className="leaderboard-widget-toggle">
                <input
                  type="checkbox"
                  checked={topLikes.showAvatar !== false}
                  onChange={(event) => updateTopLikesWidgetField('showAvatar', event.target.checked)}
                />
                Avatar
              </label>
              <label className="leaderboard-widget-toggle">
                <input
                  type="checkbox"
                  checked={topLikes.showUsername !== false}
                  onChange={(event) => updateTopLikesWidgetField('showUsername', event.target.checked)}
                />
                @usuario
              </label>
              <label className="leaderboard-widget-toggle">
                <input
                  type="checkbox"
                  checked={topLikes.showHeartIcons !== false}
                  onChange={(event) => updateTopLikesWidgetField('showHeartIcons', event.target.checked)}
                />
                Íconos de corazones
              </label>
            </div>
          </div>

          <div className="link-stack" style={{ marginTop: '16px' }}>
            <div>
              <span className="snippet-label">Widget para OBS / Live Studio</span>
              <code className="overlay-link">{localTopLikesUrl}</code>
            </div>
            <div>
              <span className="snippet-label">Widget público</span>
              <code className="overlay-link">
                {publicTopLikesUrl || 'Configura la URL pública base para generar el link.'}
              </code>
            </div>
          </div>

          <div className="card-actions">
            <button type="button" className="ae-op-btn" onClick={onTestTopLikes}>
              Probar con datos demo
            </button>
            <button type="button" className="ae-op-btn" onClick={onCopyTopLikesUrl}>
              {publicTopLikesUrl ? 'Copiar público' : 'Copiar local'}
            </button>
            <button type="button" className="ae-op-btn" onClick={onOpenTopLikesWindow}>
              Abrir preview
            </button>
          </div>

          <p className="support-copy" style={{ marginTop: '8px' }}>
            Usa el link de arriba como Browser Source en OBS. La preview de arriba se actualiza al instante con tus cambios.
          </p>
        </div>

        <div className="surface-card settings-card">
          <h3>Top Gifts (TikControl)</h3>
          <p className="support-copy">
            Mismo motor que TikControl (monedas, corona, medallas y moneda SVG). Acabado dorado
            Live Control — ideal para OBS con fondo transparente.
          </p>
          <div className="tikcontrol-widget-preview-shell">
            <TikControlWidgetFrame widgetFile="top-donors.html" className="tikcontrol-widget-frame--preview" />
          </div>
          <label className="field-label" htmlFor="top-gifts-overlay-title">
            Titulo
          </label>
          <input
            id="top-gifts-overlay-title"
            className="text-field"
            value={topGifts.title || 'TOP GIFTS'}
            onChange={(event) => updateTopGiftsWidgetField('title', event.target.value)}
          />
          <label className="field-label" htmlFor="top-gifts-overlay-kicker">
            Subtitulo (kicker)
          </label>
          <input
            id="top-gifts-overlay-kicker"
            className="text-field"
            value={topGifts.kicker || 'TikTok Live'}
            onChange={(event) => updateTopGiftsWidgetField('kicker', event.target.value)}
          />
          <label className="field-label" htmlFor="top-gifts-overlay-visible">
            Posiciones visibles
          </label>
          <input
            id="top-gifts-overlay-visible"
            className="text-field"
            value={topGifts.maxVisible || '5'}
            onChange={(event) => updateTopGiftsWidgetField('maxVisible', event.target.value)}
          />
          <label className="field-label" htmlFor="top-gifts-accent-color">
            Color de acento
          </label>
          <input
            id="top-gifts-accent-color"
            className="text-field"
            placeholder="#ffd978"
            value={topGifts.accentColor || ''}
            onChange={(event) => updateTopGiftsWidgetField('accentColor', event.target.value)}
          />
          <div className="leaderboard-widget-toggles">
            <label className="leaderboard-widget-toggle">
              <input
                type="checkbox"
                checked={topGifts.showRank !== false}
                onChange={(event) => updateTopGiftsWidgetField('showRank', event.target.checked)}
              />
              Mostrar posicion
            </label>
            <label className="leaderboard-widget-toggle">
              <input
                type="checkbox"
                checked={topGifts.showAvatar !== false}
                onChange={(event) => updateTopGiftsWidgetField('showAvatar', event.target.checked)}
              />
              Mostrar avatar
            </label>
            <label className="leaderboard-widget-toggle">
              <input
                type="checkbox"
                checked={topGifts.showUsername !== false}
                onChange={(event) => updateTopGiftsWidgetField('showUsername', event.target.checked)}
              />
              Mostrar @usuario
            </label>
            <label className="leaderboard-widget-toggle">
              <input
                type="checkbox"
                checked={topGifts.showCoins !== false}
                onChange={(event) => updateTopGiftsWidgetField('showCoins', event.target.checked)}
              />
              Mostrar coins (no gifts)
            </label>
            <label className="leaderboard-widget-toggle">
              <input
                type="checkbox"
                checked={topGifts.showCoinIcons !== false}
                onChange={(event) => updateTopGiftsWidgetField('showCoinIcons', event.target.checked)}
              />
              Iconos de monedas
            </label>
          </div>
          <div className="link-stack">
            <div>
              <span className="snippet-label">Top Gifts local</span>
              <code className="overlay-link">{localTopGiftsUrl}</code>
            </div>
            <div>
              <span className="snippet-label">Top Gifts publica</span>
              <code className="overlay-link">
                {publicTopGiftsUrl || 'Completa la URL publica base para generar el link real.'}
              </code>
            </div>
          </div>
          <div className="card-actions">
            <button type="button" className="primary-button" onClick={onTestTopGifts}>
              Probar Top Gifts
            </button>
            <button type="button" className="secondary-button" onClick={onCopyTopGiftsUrl}>
              {publicTopGiftsUrl ? 'Copiar Top Gifts publico' : 'Copiar Top Gifts local'}
            </button>
            <button type="button" className="secondary-button" onClick={onOpenTopGiftsWindow}>
              Abrir Top Gifts
            </button>
          </div>
          <p className="support-copy">
            &quot;Probar Top Gifts&quot; inyecta datos de demostración en el widget, igual que Top Likes.
          </p>
        </div>

        <div className="surface-card settings-card">
          <h3>Pruebas de rankings</h3>
          <p className="support-copy">
            Carga datos de demostracion en el servidor o reinicia el ranking del live actual.
          </p>
          <div className="card-actions">
            <button type="button" className="secondary-button" onClick={() => onTestTopLikes?.()}>
              Demo Top Likes
            </button>
            <button type="button" className="secondary-button" onClick={() => onTestTopGifts?.()}>
              Demo Top Gifts
            </button>
            <button type="button" className="secondary-button" onClick={onResetLeaderboards}>
              Reiniciar rankings
            </button>
          </div>
        </div>

        <div className="surface-card checklist-card">
          <h3>Backend local y tunel</h3>
          <label className="field-label" htmlFor="minecraft-host">
            Minecraft host
          </label>
          <input
            id="minecraft-host"
            className="text-field"
            value={safeProfile.minecraftHost || ''}
            onChange={(event) => updateProfileField('minecraftHost', event.target.value)}
          />

          <label className="field-label" htmlFor="minecraft-port">
            Minecraft RCON port
          </label>
          <input
            id="minecraft-port"
            className="text-field"
            value={safeProfile.minecraftPort || ''}
            onChange={(event) => updateProfileField('minecraftPort', event.target.value)}
          />

          <label className="field-label" htmlFor="minecraft-password">
            Minecraft RCON password
          </label>
          <input
            id="minecraft-password"
            type="password"
            className="text-field"
            value={safeProfile.minecraftPassword || ''}
            onChange={(event) => updateProfileField('minecraftPassword', event.target.value)}
          />

          <p className="support-copy">
            El backend corre en el puerto <strong>{serverPortLabel}</strong>. Si completas el RCON, las
            acciones de Minecraft intentarán enviar el comando de prueba.
          </p>
          <div className="snippet-block">
            <span className="snippet-label">Comando rápido</span>
            <code>npm run public</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Tunel manual</span>
            <code>npm run tunnel</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Configurar ngrok</span>
            <code>npm run tunnel:auth -- TU_TOKEN</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Fallback LocalTunnel</span>
            <code>npm run tunnel:localtunnel</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Fallback Cloudflare</span>
            <code>npm run tunnel:cloudflare</code>
          </div>
          <ul className="checklist">
            <li>Almacena la configuración en el servidor local.</li>
            <li>Expone una URL publica valida para LIVE Studio.</li>
            <li>Puede proteger panel y overlay con claves simples.</li>
            <li>Permite disparar comandos de Minecraft por RCON.</li>
            <li>Deja lista la conexion websocket para mods de GTA V.</li>
            <li>Mantiene el overlay en la misma app.</li>
          </ul>
        </div>

        <div className="surface-card media-library-card">
          <div className="card-top">
            <div>
              <h3>Biblioteca local</h3>
              <p>Sube videos, GIFs, imágenes o audios para reutilizarlos en cualquier acción.</p>
            </div>
            <span className="state-badge">{safeMediaLibrary.length} items</span>
          </div>

          <div className="card-actions">
            <label className="secondary-button upload-button">
              {isUploadingMedia ? 'Subiendo...' : 'Subir archivo'}
              <input
                type="file"
                hidden
                accept="image/*,video/*,audio/*,.gif,.webm,.mp4,.mp3,.wav,.png,.jpg,.jpeg,.webp,.svg"
                onChange={async (event) => {
                  const file = event.target.files?.[0]

                  if (!file) {
                    return
                  }

                  try {
                    await onUploadMedia(file)
                  } finally {
                    event.target.value = ''
                  }
                }}
              />
            </label>
            <button className="ghost-button" onClick={onRefreshMedia}>
              Recargar biblioteca
            </button>
          </div>

          {mediaLibraryError ? <div className="error-box">{mediaLibraryError}</div> : null}

          <div className="media-grid">
            {safeMediaLibrary.length === 0 ? (
              <div className="empty-state-card" style={{ gridColumn: '1 / -1' }}>
                <span className="empty-state-icon" aria-hidden="true">
                  📁
                </span>
                <h4>Galería vacía</h4>
                <p>Todavía no has subido archivos locales a tu repositorio multimedia.</p>
              </div>
            ) : (
              safeMediaLibrary.map((item) => (
                <div key={item.id} className="media-thumb-card">
                  <div className="media-thumb">
                    {item.kind === 'video' ? (
                      <video src={item.url} muted playsInline />
                    ) : (
                      <img src={item.url} alt={item.fileName} loading="lazy" />
                    )}
                  </div>
                  <div className="media-info">
                    <strong title={item.fileName}>{item.fileName}</strong>
                    <span className="media-kind">{item.kind}</span>
                  </div>
                  <button className="ae-op-btn danger compact" onClick={() => onDeleteMedia(item.fileName)}>
                    <Trash2 size={13} /> Quitar
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}


export default OverlaySection
