import { useState } from 'react'

import { formatDateTime } from '../../dashboardShared'
import { formatDurationClock } from '../../dashboardViewHelpers'
import { SongRequestWidget } from '../overlay/OverlayScreens'
import SectionHeader from '../common/SectionHeader'
import { Disc3, ListMusic, History, LogIn, RefreshCw, Unlink, SkipForward, Trash2, Play } from 'lucide-react'

function MusicSection({
  localSongRequestUrl,
  music,
  musicStatus,
  onClearHistory,
  onClearQueue,
  onConnectSpotify,
  onCopySongRequestUrl,
  onDisconnectSpotify,
  onOpenSongRequestWindow,
  onRemoveRequest,
  onSaveSpotifyCredentials,
  onSkipTrack,
  onSyncSpotify,
  onTestPlayRequest,
  publicSongRequestUrl,
  updateMusicField,
}) {
  const [requesterDraft, setRequesterDraft] = useState('demo-chat')
  const [queryDraft, setQueryDraft] = useState('')
  const [musicFeedback, setMusicFeedback] = useState('')
  const [isSubmittingMusicRequest, setIsSubmittingMusicRequest] = useState(false)
  const [isSkippingTrack, setIsSkippingTrack] = useState(false)
  const [isClearingQueue, setIsClearingQueue] = useState(false)
  const [isClearingHistory, setIsClearingHistory] = useState(false)

  // Spotify credentials form (for desktop.env auto-write)
  const [spotifyClientIdDraft, setSpotifyClientIdDraft] = useState('')
  const [spotifyClientSecretDraft, setSpotifyClientSecretDraft] = useState('')
  const [isSavingSpotifyCreds, setIsSavingSpotifyCreds] = useState(false)
  const [spotifyCredsSaved, setSpotifyCredsSaved] = useState(false)
  const queue = Array.isArray(music.queue) ? music.queue : []
  const history = Array.isArray(music.history) ? music.history : []
  const devices = Array.isArray(musicStatus.devices) ? musicStatus.devices : []
  const currentTrack = musicStatus.currentPlayback?.track || null
  const cooldownRemainingSeconds =
    musicStatus.cooldownUntil && musicStatus.cooldownUntil > Date.now()
      ? Math.max(1, Math.ceil((musicStatus.cooldownUntil - Date.now()) / 1000))
      : 0

  async function handleSubmitMusicRequest() {
    setIsSubmittingMusicRequest(true)

    try {
      await onTestPlayRequest({
        userName: requesterDraft,
        query: queryDraft,
      })
      setMusicFeedback('Solicitud enviada. Si hay reproducción activa se encoló en Spotify (se reproducirá después de la pista actual).')
      setQueryDraft('')
    } catch (error) {
      setMusicFeedback(error?.message || 'No pude procesar esa solicitud de musica.')
    } finally {
      setIsSubmittingMusicRequest(false)
    }
  }

  async function handleSkipTrack() {
    setIsSkippingTrack(true)

    try {
      await onSkipTrack({
        userName: 'panel',
      })
      setMusicFeedback('Spotify salto a la siguiente pista.')
    } catch (error) {
      setMusicFeedback(error?.message || 'No pude saltar la pista actual.')
    } finally {
      setIsSkippingTrack(false)
    }
  }

  async function handleRemoveRequest(requestId) {
    try {
      await onRemoveRequest(requestId)
      setMusicFeedback('Solicitud quitada de la cola.')
    } catch (error) {
      setMusicFeedback(error?.message || 'No pude quitar esa solicitud.')
    }
  }

  async function handleClearQueue() {
    setIsClearingQueue(true)

    try {
      await onClearQueue()
      setMusicFeedback('Se limpiaron los pedidos pendientes de la cola.')
    } catch (error) {
      setMusicFeedback(error?.message || 'No pude limpiar la cola pendiente.')
    } finally {
      setIsClearingQueue(false)
    }
  }

  async function handleClearHistory() {
    setIsClearingHistory(true)

    try {
      await onClearHistory()
      setMusicFeedback('Historial de canciones limpiado.')
    } catch (error) {
      setMusicFeedback(error?.message || 'No pude limpiar el historial.')
    } finally {
      setIsClearingHistory(false)
    }
  }

  async function handleSaveSpotifyCredentials() {
    if (!onSaveSpotifyCredentials) return
    setIsSavingSpotifyCreds(true)
    setSpotifyCredsSaved(false)

    try {
      await onSaveSpotifyCredentials({
        clientId: spotifyClientIdDraft,
        clientSecret: spotifyClientSecretDraft,
      })
      setSpotifyCredsSaved(true)
      // Clear drafts for security
      setSpotifyClientIdDraft('')
      setSpotifyClientSecretDraft('')
    } catch {
      // error is already handled in controller (setServerError / feedback)
    } finally {
      setIsSavingSpotifyCreds(false)
    }
  }

  return (
    <section className="panel-section" id="music">
      <SectionHeader
        eyebrow="Música"
        title="Song Request"
        description="El chat pide temas con !play; tú ves la cola en overlay y Spotify reproduce en el dispositivo que elijas. Sin tocar tu integración actual."
      />

      <article className="surface-card music-quickstart-card">
        <div className="card-top">
          <div>
            <h3>Configuración rápida</h3>
            <p>Sigue estos pasos una vez y el módulo queda listo para cada live.</p>
          </div>
          <span className={`status-chip ${music.enabled && musicStatus.connected ? 'ok' : 'warn'}`}>
            {music.enabled && musicStatus.connected ? 'Listo para live' : 'Pendiente'}
          </span>
        </div>
        <ol className="music-quickstart-steps">
          <li className={musicStatus.configured ? 'done' : ''}>
            Crea una app en Spotify Developer y agrega la Redirect URI que ves abajo.
          </li>
          <li className={musicStatus.connected ? 'done' : ''}>Inicia sesion con Spotify Premium.</li>
          <li className={music.selectedDeviceId || musicStatus.currentPlayback?.device?.id ? 'done' : ''}>
            Elige el dispositivo donde suena tu musica (PC, movil abierto, etc.).
          </li>
          <li className={music.enabled ? 'done' : ''}>Activa Song Request y conecta TikTok Live.</li>
          <li>Agrega el widget de musica a OBS / TikTok Live Studio.</li>
        </ol>
        {musicStatus.redirectUri ? (
          <div className="snippet-block music-redirect-snippet">
            <span className="snippet-label">Redirect URI (Spotify Dashboard)</span>
            <code>{musicStatus.redirectUri}</code>
            <button
              type="button"
              className="ae-op-btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(musicStatus.redirectUri)
                  setMusicFeedback('Redirect URI copiada. Pégala en Spotify Developer → Redirect URIs.')
                } catch {
                  setMusicFeedback('No pude copiar la URI. Seleccionala manualmente del recuadro.')
                }
              }}
            >
              Copiar Redirect URI
            </button>
          </div>
        ) : null}
      </article>

      <div className="game-mode-grid music-grid">
        <article className="surface-card game-mode-card spotify-connect-card">
          <div className="card-top">
            <div>
              <h3>Spotify</h3>
              <p>Conecta tu cuenta Premium para usar <code>!play</code>, <code>!skip</code> y <code>!quitar</code> en el chat.</p>
            </div>
            <span
              className={`status-chip ${
                musicStatus.connected ? 'ok' : musicStatus.configured ? 'warn' : 'off'
              }`}
            >
              {musicStatus.connected
                ? 'Conectado'
                : musicStatus.configured
                  ? 'Listo para login'
                  : 'Falta configurar'}
            </span>
          </div>

          <div className="mini-grid">
            <div>
              <span className="snippet-label">Cuenta</span>
              <p className="value-strong">{musicStatus.accountLabel || 'Sin conectar'}</p>
            </div>
            <div>
              <span className="snippet-label">Plan</span>
              <p>{musicStatus.accountProduct || 'No disponible'}</p>
            </div>
            <div>
              <span className="snippet-label">Dispositivos</span>
              <p>{devices.length}</p>
            </div>
            <div>
              <span className="snippet-label">Ultimo sync</span>
              <p>{formatDateTime(musicStatus.lastSyncAt)}</p>
            </div>
          </div>

          <div className="field music-device-field">
            <label className="field-label" htmlFor="music-device-select">
              Dispositivo preferido
            </label>
            <select
              id="music-device-select"
              className="text-field"
              value={music.selectedDeviceId || ''}
              onChange={(event) => {
                const nextDevice = devices.find((device) => device.id === event.target.value)
                updateMusicField('selectedDeviceId', event.target.value)
                updateMusicField('selectedDeviceName', nextDevice?.name || '')
              }}
            >
              <option value="">Usar el dispositivo activo</option>
              {devices.map((device) => (
                <option key={device.id || device.name} value={device.id}>
                  {device.name}
                  {device.isActive ? ' · activo' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="spotify-actions">
            {musicStatus.connected ? (
              <>
                <button
                  className="ae-op-btn"
                  onClick={onSyncSpotify}
                  title="Sincronizar estado y dispositivos de Spotify"
                >
                  <RefreshCw size={14} /> Sincronizar
                </button>
                <button
                  className="ae-op-btn danger"
                  onClick={onDisconnectSpotify}
                  title="Desconectar cuenta de Spotify"
                >
                  <Unlink size={14} /> Desconectar
                </button>
              </>
            ) : (
              <button
                className="primary-button spotify-connect-btn"
                onClick={onConnectSpotify}
                disabled={!musicStatus.configured}
              >
                <LogIn size={16} />
                Iniciar sesión con Spotify
              </button>
            )}
          </div>

          {!musicStatus.configured ? (
            <div className="spotify-credentials-form">
              <div className="form-head">
                <strong>Configura Spotify (un solo paso)</strong>
                <span className="form-sub">La app escribe el archivo por vos</span>
              </div>

              <div className="spotify-creds-grid">
                <div>
                  <label className="field-label">Client ID</label>
                  <input
                    className="text-field"
                    placeholder="Ej: 27694382631a4807bc78..."
                    value={spotifyClientIdDraft}
                    onChange={(e) => setSpotifyClientIdDraft(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="field-label">Client Secret</label>
                  <input
                    className="text-field"
                    type="password"
                    placeholder="Pega el Client Secret aquí"
                    value={spotifyClientSecretDraft}
                    onChange={(e) => setSpotifyClientSecretDraft(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>

              <button
                type="button"
                className="primary-button spotify-save-btn"
                onClick={handleSaveSpotifyCredentials}
                disabled={
                  isSavingSpotifyCreds ||
                  !spotifyClientIdDraft.trim() ||
                  !spotifyClientSecretDraft.trim() ||
                  !onSaveSpotifyCredentials
                }
              >
                {isSavingSpotifyCreds ? 'Guardando en desktop.env...' : 'Guardar credenciales (escribe desktop.env por mí)'}
              </button>

              {spotifyCredsSaved && (
                <div className="spotify-save-success">
                  ✅ Credenciales guardadas. <strong>Reinicia completamente la aplicación</strong> para que tome efecto.
                </div>
              )}

              <details className="manual-fallback">
                <summary>Preferís hacerlo manualmente</summary>
                <div className="manual-instructions">
                  <p>
                    Copiá el <strong>Redirect URI</strong> de arriba y pégalo en Spotify Developer → Redirect URIs.
                  </p>
                  <p>
                    Luego creá el archivo <code>desktop.env</code> en:
                  </p>
                  <code className="path-hint">%APPDATA%\Live Control Studio\desktop.env</code>
                  <p className="small">
                    Con el contenido:
                    <br />
                    SPOTIFY_CLIENT_ID=tu_id
                    <br />
                    SPOTIFY_CLIENT_SECRET=tu_secret
                  </p>
                </div>
              </details>
            </div>
          ) : null}

          {musicStatus.requiresPremium ? (
            <div className="error-box">
              Song Request necesita Spotify Premium. La cuenta conectada no tiene plan compatible con la API
              de reproduccion.
            </div>
          ) : null}

          {musicStatus.connected && devices.length === 0 ? (
            <div className="hint-box">
              Abre Spotify en tu PC o teléfono y reproduce cualquier playlist. Luego pulsa <strong>Sincronizar</strong>
              para detectar dispositivos.
            </div>
          ) : null}

          {musicStatus.lastError ? <div className="error-box">{musicStatus.lastError}</div> : null}
        </article>

        <article className="surface-card game-mode-card">
          <div className="card-top">
            <div>
              <h3>Comandos del chat</h3>
              <p>Estos comandos se leen directo desde TikTok y usan una cola propia para poder moderar mejor.</p>
            </div>
            <span className={`status-chip ${music.enabled ? 'ok' : 'off'}`}>
              {music.enabled ? 'Módulo activo' : 'Módulo apagado'}
            </span>
          </div>

          <div className="option-grid">
            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.enabled)}
                onChange={(event) => updateMusicField('enabled', event.target.checked)}
              />
              <div>
                <strong>Activar Song Request</strong>
                <span>Permite que el chat use los comandos de musica en vivo.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.allowExplicit)}
                onChange={(event) => updateMusicField('allowExplicit', event.target.checked)}
              />
              <div>
                <strong>Permitir explicitas</strong>
                <span>Si esta apagado, la app intenta evitar tracks marcados como explicit.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.playEnabled)}
                onChange={(event) => updateMusicField('playEnabled', event.target.checked)}
              />
              <div>
                <strong>Habilitar play</strong>
                <span>Comando para pedir una cancion desde el chat.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.skipEnabled)}
                onChange={(event) => updateMusicField('skipEnabled', event.target.checked)}
              />
              <div>
                <strong>Habilitar skip</strong>
                <span>Permite saltar la pista actual desde el chat o el panel.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.removeEnabled)}
                onChange={(event) => updateMusicField('removeEnabled', event.target.checked)}
              />
              <div>
                <strong>Habilitar quitar</strong>
                <span>Deja que el usuario quite sus pedidos pendientes antes de enviarlos a Spotify.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.allowAllUsers)}
                onChange={(event) => updateMusicField('allowAllUsers', event.target.checked)}
              />
              <div>
                <strong>All users</strong>
                <span>Si esta activo, cualquier viewer puede usar los comandos de musica.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.allowSubscribers)}
                onChange={(event) => updateMusicField('allowSubscribers', event.target.checked)}
              />
              <div>
                <strong>Super Fans / Suscriptores</strong>
                <span>Permite usar comandos a viewers con fan club o suscripcion activa.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.allowModerators)}
                onChange={(event) => updateMusicField('allowModerators', event.target.checked)}
              />
              <div>
                <strong>Mods</strong>
                <span>Habilita Song Request para moderadores del live.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.overlayShowQueue)}
                onChange={(event) => updateMusicField('overlayShowQueue', event.target.checked)}
              />
              <div>
                <strong>Mostrar cola en widget</strong>
                <span>Muestra lo que se reproducirá después de la pista actual.</span>
              </div>
            </label>

            <label className="option-card">
              <input
                type="checkbox"
                checked={Boolean(music.overlayShowRequester)}
                onChange={(event) => updateMusicField('overlayShowRequester', event.target.checked)}
              />
              <div>
                <strong>Mostrar quien la pidio</strong>
                <span>Agrega el nombre del viewer en la cola del widget.</span>
              </div>
            </label>
          </div>

          <div className="mini-grid">
            <div>
              <label className="field-label" htmlFor="music-play-command">
                Comando play
              </label>
              <input
                id="music-play-command"
                className="text-field"
                value={music.playCommand || '!play'}
                onChange={(event) => updateMusicField('playCommand', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-skip-command">
                Comando skip
              </label>
              <input
                id="music-skip-command"
                className="text-field"
                value={music.skipCommand || '!skip'}
                onChange={(event) => updateMusicField('skipCommand', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-remove-command">
                Comando quitar
              </label>
              <input
                id="music-remove-command"
                className="text-field"
                value={music.removeCommand || '!quitar'}
                onChange={(event) => updateMusicField('removeCommand', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-queue-limit">
                Cola maxima
              </label>
              <input
                id="music-queue-limit"
                className="text-field"
                value={music.maxQueueLength || '10'}
                onChange={(event) => updateMusicField('maxQueueLength', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-user-limit">
                Maximo por usuario
              </label>
              <input
                id="music-user-limit"
                className="text-field"
                value={music.maxRequestsPerUser || '2'}
                onChange={(event) => updateMusicField('maxRequestsPerUser', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-cooldown-seconds">
                Cooldown global
              </label>
              <input
                id="music-cooldown-seconds"
                className="text-field"
                value={music.cooldownSeconds || '10'}
                onChange={(event) => updateMusicField('cooldownSeconds', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-overlay-title">
                Titulo del widget
              </label>
              <input
                id="music-overlay-title"
                className="text-field"
                value={music.overlayTitle || 'Song Request'}
                onChange={(event) => updateMusicField('overlayTitle', event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="music-overlay-max-visible">
                Canciones visibles
              </label>
              <input
                id="music-overlay-max-visible"
                className="text-field"
                value={music.overlayMaxVisible || '3'}
                onChange={(event) => updateMusicField('overlayMaxVisible', event.target.value)}
              />
            </div>
          </div>

          <div className="snippet-block">
            <span className="snippet-label">Comandos activos</span>
            <code>
              {music.playCommand || '!play'} artista cancion · {music.skipCommand || '!skip'} ·{' '}
              {music.removeCommand || '!quitar'}
            </code>
          </div>

          <div className="snippet-block">
            <span className="snippet-label">Disponibles para</span>
            <code>
              {[
                music.allowAllUsers ? 'All users' : null,
                music.allowSubscribers ? 'Super Fans / Suscriptores' : null,
                music.allowModerators ? 'Mods' : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Nadie'}
            </code>
          </div>
        </article>

        <article className="surface-card game-mode-card music-span-2">
          <div className="card-top">
            <div>
              <h3>Cola y reproducción</h3>
              <p>La app mantiene su propia cola para poder quitar pedidos antes de que entren al queue de Spotify.</p>
            </div>
            <div className="tag-row">
              <span className="bridge-badge">{musicStatus.queueCount} en cola</span>
              <span className="bridge-badge">{musicStatus.historyCount} en historial</span>
              {cooldownRemainingSeconds > 0 ? (
                <span className="bridge-badge">Cooldown {cooldownRemainingSeconds}s</span>
              ) : null}
            </div>
          </div>

          <div className="music-spotify-preview-shell">
            <span className="snippet-label">Vista previa del overlay (OBS / LIVE Studio)</span>
            <SongRequestWidget music={music} musicStatus={musicStatus} preview />
          </div>

          <div className="link-stack music-links">
            <div>
              <span className="snippet-label">Widget local</span>
              <code className="overlay-link">{localSongRequestUrl}</code>
            </div>
            <div>
              <span className="snippet-label">Widget público</span>
              <code className="overlay-link">
                {publicSongRequestUrl || 'Completa la URL pública base para generar el link real.'}
              </code>
            </div>
          </div>

          <div className="card-actions music-widget-actions">
            <button className="ae-op-btn" onClick={onCopySongRequestUrl}>
              Copiar widget {publicSongRequestUrl ? 'público' : 'local'}
            </button>
            <button className="ae-op-btn" onClick={onOpenSongRequestWindow}>
              Abrir en ventana
            </button>
          </div>

          {currentTrack ? (
            <div className="music-now-playing premium-music-track">
              <div className="music-cover-wrap">
                {currentTrack.imageUrl ? (
                  <img src={currentTrack.imageUrl} alt={currentTrack.name} className="music-cover-large" />
                ) : (
                  <div className="music-cover-large music-cover-fallback">
                    <Disc3 size={42} />
                  </div>
                )}
              </div>
              <div className="music-now-meta">
                <div className="now-playing-label">
                  <Disc3 size={14} /> SONANDO AHORA
                </div>
                <strong className="music-song-title-large">{currentTrack.name}</strong>
                <div className="music-artists">{Array.isArray(currentTrack.artists) ? currentTrack.artists.join(', ') : ''}</div>
                <div className="music-album-line">
                  {currentTrack.albumName || 'Spotify'} · {formatDurationClock(currentTrack.durationMs || 0)}
                </div>
              </div>
              <div className="music-now-actions">
                <button
                  className="ae-op-btn music-skip-btn"
                  onClick={handleSkipTrack}
                  disabled={isSkippingTrack || !musicStatus.connected}
                  title="Saltar a la siguiente pista en Spotify"
                >
                  <SkipForward size={15} />
                  {isSkippingTrack ? 'Saltando...' : 'Skip'}
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state-card music-empty-current">
              <Disc3 className="empty-state-icon" size={36} />
              <h4>Ninguna pista activa</h4>
              <p>Reproduce algo en Spotify o simula un pedido para empezar.</p>
            </div>
          )}

          <div className="music-tester">
            <div className="tester-header">
              <Play size={15} />
              <span>Probar song request (simula !play del chat)</span>
            </div>
            <div className="tester-row">
              <input
                className="text-field tester-user"
                placeholder="Usuario de prueba"
                value={requesterDraft}
                onChange={(event) => setRequesterDraft(event.target.value)}
              />
              <input
                className="text-field tester-query"
                placeholder="Artista - Canción (ej: coldplay yellow)"
                value={queryDraft}
                onChange={(event) => setQueryDraft(event.target.value)}
              />
              <button
                className="primary-button music-test-btn"
                onClick={handleSubmitMusicRequest}
                disabled={isSubmittingMusicRequest || !musicStatus.connected}
              >
                {isSubmittingMusicRequest ? 'Buscando...' : 'Simular !play'}
              </button>
            </div>
            {musicFeedback ? <div className="music-feedback">{musicFeedback}</div> : null}
          </div>

          <div className="music-queue-layout">
            <div className="list-shell">
              <div className="card-top music-list-header">
                <h3>Pedidos pendientes</h3>
                <div className="row-actions">
                  <span className="state-badge">{queue.length}</span>
                  <button
                    className="ae-op-btn"
                    onClick={handleClearQueue}
                    disabled={isClearingQueue || queue.length === 0}
                  >
                    {isClearingQueue ? 'Limpiando...' : 'Limpiar cola'}
                  </button>
                </div>
              </div>

              {queue.length === 0 ? (
                <div className="empty-state-card">
                  <ListMusic className="empty-state-icon" size={32} />
                  <h4>Cola vacía</h4>
                  <p>Aún no hay pedidos pendientes. Los espectadores pueden usar el comando play.</p>
                </div>
              ) : (
                <div className="music-queue-list">
                  {queue.map((requestItem) => (
                    <div key={requestItem.id} className="surface-card music-queue-item">
                      {requestItem.imageUrl ? (
                        <img
                          src={requestItem.imageUrl}
                          alt={requestItem.name}
                          className="music-thumb-mini"
                        />
                      ) : (
                        <div className="music-thumb-mini music-thumb-fallback">
                          <Disc3 size={18} />
                        </div>
                      )}
                      <div className="music-item-body">
                        <div className="music-item-title">{requestItem.name}</div>
                        <div className="music-item-artist">
                          {Array.isArray(requestItem.artists) ? requestItem.artists.join(', ') : ''}
                        </div>
                        <div className="music-item-meta">
                          <span className="requester">@{requestItem.requester}</span>
                          {requestItem.query ? <span className="query">· {requestItem.query}</span> : null}
                          {requestItem.explicit ? <span className="explicit">explicit</span> : null}
                        </div>
                      </div>
                      <div className="music-item-right">
                        <div className="music-item-duration">{formatDurationClock(requestItem.durationMs || 0)}</div>
                        <span
                          className={`status-chip status-${requestItem.status || 'queued'}`}
                        >
                          {requestItem.status || 'queued'}
                        </span>
                        {requestItem.status === 'queued' ? (
                          <button
                            className="ae-op-btn danger"
                            onClick={() => handleRemoveRequest(requestItem.id)}
                            title="Quitar este pedido de la cola"
                          >
                            <Trash2 size={13} /> Quitar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="list-shell">
              <div className="card-top music-list-header">
                <h3>Historial reciente</h3>
                <div className="row-actions">
                  <span className="state-badge">{history.length}</span>
                  <button
                    className="ae-op-btn"
                    onClick={handleClearHistory}
                    disabled={isClearingHistory || history.length === 0}
                  >
                    {isClearingHistory ? 'Limpiando...' : 'Limpiar historial'}
                  </button>
                </div>
              </div>

              {history.length === 0 ? (
                <div className="empty-state-card">
                  <History className="empty-state-icon" size={32} />
                  <h4>Historial vacío</h4>
                  <p>Todavía no hay canciones reproducidas en esta sesión.</p>
                </div>
              ) : (
                <div className="music-history-list">
                  {history.slice(0, 8).map((requestItem) => (
                    <div key={requestItem.id} className="music-history-row surface-card">
                      {requestItem.imageUrl ? (
                        <img
                          src={requestItem.imageUrl}
                          alt={requestItem.name}
                          className="music-thumb-mini music-thumb-history"
                        />
                      ) : (
                        <div className="music-thumb-mini music-thumb-fallback music-thumb-history">
                          <Disc3 size={16} />
                        </div>
                      )}
                      <div className="music-history-body">
                        <div className="music-history-title">{requestItem.name}</div>
                        <div className="music-history-sub">
                          {Array.isArray(requestItem.artists) ? requestItem.artists.join(', ') : ''} · @{requestItem.requester}
                        </div>
                      </div>
                      <div className="music-history-time">
                        {formatDateTime(requestItem.completedAt || requestItem.playedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}

export default MusicSection
