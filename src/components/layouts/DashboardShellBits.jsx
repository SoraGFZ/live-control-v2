import { PRODUCT } from '../../config/product'

function DashboardBootScreen() {
  return (
    <div className="auth-shell commercial-boot">
      <article className="auth-card commercial-boot-card premium-boot">
        <div className="commercial-boot-logo">LC</div>
        <span className="eyebrow">{PRODUCT.name}</span>
        <h1>Preparando tu estudio...</h1>
        <p>
          Cargando configuracion, conexiones y modulos del workspace. Un momento y tendras el panel
          listo para tu proximo live.
        </p>
        <div className="commercial-boot-progress" aria-hidden="true">
          <span />
        </div>
        <div className="boot-hint">Todo local • Sin límites • Listo para directo</div>
      </article>
    </div>
  )
}

function DashboardAccessGate({
  dashboardAuthDraft,
  dashboardAuthError,
  onChangeDraft,
  onUnlock,
}) {
  return (
    <div className="auth-shell commercial-boot">
      <article className="auth-card commercial-boot-card">
        <div className="commercial-boot-logo">LC</div>
        <span className="eyebrow">Acceso seguro</span>
        <h1>Desbloquea tu panel</h1>
        <p>
          Protege el dashboard y las APIs cuando publiques tu instancia. Ideal para equipos y
          despliegues comerciales.
        </p>

        <label className="field-label" htmlFor="dashboard-access-key">
          Clave del panel
        </label>
        <input
          id="dashboard-access-key"
          type="password"
          className="text-field"
          placeholder="Tu clave actual"
          value={dashboardAuthDraft}
          onChange={(event) => onChangeDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onUnlock()
            }
          }}
        />

        {dashboardAuthError ? <div className="error-box">{dashboardAuthError}</div> : null}

        <div className="card-actions">
          <button type="button" className="primary-button" onClick={onUnlock}>
            Entrar al estudio
          </button>
        </div>
      </article>
    </div>
  )
}

function WorkspaceLauncher() {
  return null
}

export { DashboardBootScreen, DashboardAccessGate, WorkspaceLauncher }