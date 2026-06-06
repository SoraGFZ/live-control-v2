import { formatDateTime } from '../../dashboardShared'
import SectionHeader from '../common/SectionHeader'
import { Radio, Activity, LogIn, RefreshCw, Unlink } from 'lucide-react'

function LiveOpsSection({
  emoteCatalogCount,
  isDesktopApp,
  isImportingTikTokSession,
  isSyncingEmoteCatalog,
  isSyncingGiftCatalog,
  isSavingState,
  onConnectTikTok,
  onImportTikTokSessionFromDesktop,
  onDisconnectTikTok,
  onSyncTikTokEmoteCatalog,
  onSyncTikTokGiftCatalog,
  profile,
  serverError,
  serverStatus,
  setTiktokUsernameDraft,
  tiktokUsernameDraft,
  updateProfileField,
}) {
  return (
    <section className="panel-section" id="live-ops">
      <SectionHeader
        eyebrow="Operacion en vivo"
        title="TikTok y backend"
        description="Conecta tu usuario, revisa si entran eventos y confirma que el backend sigue respondiendo."
      />

      <div className="ops-grid">
        <div className="surface-card ops-card">
          <div className="card-top">
            <div>
              <h3>TikTok LIVE</h3>
              <p>Conecta por username y deja que el backend escuche follows, gifts, emotes, comentarios y likes en tiempo real.</p>
            </div>
            <span className={`status-chip ${serverStatus.tikTok.connected ? 'ok' : serverStatus.tikTok.connecting ? 'warn' : 'off'}`}>
              {serverStatus.tikTok.connected
                ? 'Conectado'
                : serverStatus.tikTok.connecting
                  ? 'Conectando'
                  : 'Desconectado'}
            </span>
          </div>

          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="tiktok-username">Username del live</label>
              <input
                id="tiktok-username"
                className="text-field"
                placeholder="Ej: tu_usuario"
                value={tiktokUsernameDraft}
                onChange={(event) => setTiktokUsernameDraft(event.target.value)}
              />
            </div>

            <div className="auth-fields">
              <div>
                <label className="field-label" htmlFor="tiktok-session-id">sessionid (opcional)</label>
                <input
                  id="tiktok-session-id"
                  type="password"
                  className="text-field"
                  placeholder="Para datos autenticados (emotes, roles...)"
                  value={profile.tiktokSessionId || ''}
                  onChange={(event) => updateProfileField('tiktokSessionId', event.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="tiktok-target-idc">tt-target-idc</label>
                <input
                  id="tiktok-target-idc"
                  className="text-field"
                  placeholder="Debe venir con sessionid"
                  value={profile.tiktokTargetIdc || ''}
                  onChange={(event) => updateProfileField('tiktokTargetIdc', event.target.value)}
                />
              </div>
            </div>
          </div>

          <label className="option-card">
            <input
              type="checkbox"
              checked={Boolean(profile.tiktokAuthenticateWs)}
              onChange={(event) => updateProfileField('tiktokAuthenticateWs', event.target.checked)}
            />
            <div>
              <strong>Autenticar WebSocket con la sesión</strong>
              <span>Puede ayudar con emotes, roles y datos extra. Úsalo solo si pegás tus cookies.</span>
            </div>
          </label>

          <div className="card-actions liveops-actions">
            <button
              className="primary-button large liveops-connect-btn"
              onClick={onConnectTikTok}
              aria-label="Conectar TikTok Live"
            >
              {serverStatus.tikTok.connecting ? 'Conectando...' : 'Conectar TikTok Live'}
            </button>

            {isDesktopApp && (
              <button
                className="ae-op-btn liveops-login-btn"
                onClick={onImportTikTokSessionFromDesktop}
                disabled={isImportingTikTokSession}
              >
                <LogIn size={14} />
                {isImportingTikTokSession ? 'Abriendo login...' : 'Iniciar sesión con TikTok'}
              </button>
            )}

            <button
              className="ae-op-btn"
              onClick={onSyncTikTokGiftCatalog}
              disabled={isSyncingGiftCatalog}
            >
              <RefreshCw size={14} />
              {isSyncingGiftCatalog ? 'Sincronizando...' : 'Sincronizar Gifts'}
            </button>

            <button
              className="ae-op-btn"
              onClick={onSyncTikTokEmoteCatalog}
              disabled={isSyncingEmoteCatalog}
            >
              <RefreshCw size={14} />
              {isSyncingEmoteCatalog ? 'Sincronizando...' : 'Sincronizar Emotes'}
            </button>

            {serverStatus.tikTok.connected && (
              <button className="ae-op-btn danger" onClick={onDisconnectTikTok}>
                <Unlink size={14} /> Desconectar
              </button>
            )}
          </div>

          <div className="mini-grid">
            <div>
              <span className="snippet-label">Room ID</span>
              <p>{serverStatus.tikTok.roomId || 'Esperando conexion'}</p>
            </div>
            <div>
              <span className="snippet-label">Ultima conexion</span>
              <p>{formatDateTime(serverStatus.tikTok.lastConnectedAt)}</p>
            </div>
            <div>
              <span className="snippet-label">Catalogo de gifts</span>
              <p>{serverStatus.tikTok.giftCatalogCount || 0} regalos</p>
            </div>
            <div>
              <span className="snippet-label">Emotes vistos</span>
              <p>{serverStatus.tikTok.emoteCatalogCount || emoteCatalogCount || 0} emotes</p>
            </div>
            <div>
              <span className="snippet-label">Ultima sincronizacion</span>
              <p>{formatDateTime(serverStatus.tikTok.giftCatalogSyncedAt)}</p>
            </div>
            <div>
              <span className="snippet-label">Ultimo emote nuevo</span>
              <p>{formatDateTime(serverStatus.tikTok.emoteCatalogSyncedAt)}</p>
            </div>
            <div>
              <span className="snippet-label">Sesion autenticada</span>
              <p>{serverStatus.tikTok.authSessionEnabled ? 'Lista' : 'No configurada'}</p>
            </div>
            <div>
              <span className="snippet-label">WebSocket auth</span>
              <p>{serverStatus.tikTok.authenticateWs ? 'Activado' : 'Normal'}</p>
            </div>
          </div>

          <p className="support-copy">
            Si pegas `sessionid` y `tt-target-idc`, el conector intenta entrar con tu sesion de TikTok y suele devolver mas contexto del live. Ambos valores son sensibles.
          </p>
          <p className="support-copy">
            Con esa sesion hoy podemos sacar mejor contexto del live, roles de usuario, gifts y completar emotes cuando TikTok los manda. El boton de emotes vuelve a revisar todo lo que ya entro al backend; no existe un catalogo completo offline como el de gifts.
          </p>
          {isDesktopApp ? (
            <p className="support-copy">
              En la beta desktop puedes usar `Iniciar sesion con TikTok` y la app intentara guardar esas cookies por ti para no copiarlas a mano.
            </p>
          ) : null}

          {serverStatus.tikTok.lastError ? (
            <div className="error-box">{serverStatus.tikTok.lastError}</div>
          ) : null}
          {serverStatus.tikTok.giftCatalogLastError ? (
            <div className="error-box">{serverStatus.tikTok.giftCatalogLastError}</div>
          ) : null}
          {serverStatus.tikTok.emoteCatalogLastError ? (
            <div className="error-box">{serverStatus.tikTok.emoteCatalogLastError}</div>
          ) : null}
        </div>

        <div className="surface-card ops-card">
          <div className="card-top">
            <div>
              <h3>Backend local</h3>
              <p>Este proceso guarda la configuración y distribuye los eventos al overlay, al panel y a los juegos.</p>
            </div>
            <span className={`status-chip ${serverError ? 'warn' : 'ok'}`}>
              {serverError ? 'Atencion' : 'Activo'}
            </span>
          </div>

          <div className="mini-grid">
            <div>
              <span className="snippet-label">Puerto activo</span>
              <p>{serverStatus.server.port}</p>
            </div>
            <div>
              <span className="snippet-label">Guardado</span>
              <p>{isSavingState ? 'Sincronizando...' : 'Al dia'}</p>
            </div>
            <div>
              <span className="snippet-label">Overlay clients</span>
              <p>{serverStatus.bridges.overlayClients}</p>
            </div>
            <div>
              <span className="snippet-label">Dashboard clients</span>
              <p>{serverStatus.bridges.dashboardClients}</p>
            </div>
          </div>

          {serverError ? <div className="error-box">{serverError}</div> : null}
        </div>

        <div className="surface-card ops-card">
          <h3>Ultimos eventos del live</h3>
          <div className="event-log">
            {serverStatus.recentEvents.length === 0 ? (
              <div className="empty-state-card">
                <Radio className="empty-state-icon" size={32} />
                <h4>Bandeja en espera</h4>
                <p>Aún no recibimos eventos del live.</p>
              </div>
            ) : (
              serverStatus.recentEvents.map((eventItem) => (
                <div key={eventItem.id} className="event-item">
                  <span className="trigger-type">{eventItem.type}</span>
                  <strong>{eventItem.summary}</strong>
                  <span>{formatDateTime(eventItem.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="surface-card ops-card">
          <h3>Acciones despachadas</h3>
          <div className="event-log">
            {serverStatus.recentDispatches.length === 0 ? (
              <div className="empty-state-card">
                <Activity className="empty-state-icon" size={32} />
                <h4>Sin actividad local</h4>
                <p>Aún no se ha disparado ninguna acción hacia los módulos.</p>
              </div>
            ) : (
              serverStatus.recentDispatches.map((dispatchItem) => (
                <div key={dispatchItem.id} className="event-item">
                  <span className="bridge-badge">{dispatchItem.reason}</span>
                  <strong>{dispatchItem.actionName}</strong>
                  <span>{formatDateTime(dispatchItem.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default LiveOpsSection
