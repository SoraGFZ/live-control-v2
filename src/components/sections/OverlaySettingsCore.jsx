import SectionHeader from '../common/SectionHeader'

/**
 * Núcleo mínimo del panel Overlay (sin widgets embebidos).
 * Se muestra siempre; el resto de opciones se cargan encima.
 */
function OverlaySettingsCore({
  linkFeedback,
  localOverlayUrl,
  profile,
  publicOverlayUrl,
  updateProfileField,
  onCopyOverlayUrl,
  onOpenOverlayWindow,
}) {
  const safeProfile = profile || {}

  return (
    <section
      className="panel-section workspace-overlay-panel overlay-settings-core"
      id="overlay-settings"
      data-overlay-panel="core"
    >
      <SectionHeader
        eyebrow="Salida visual"
        title="Overlay"
        description="Configura URLs, claves y enlaces para OBS / TikTok Live Studio."
      />

      <article className="surface-card settings-card">
        <h3>Ajustes base</h3>

        <label className="field-label" htmlFor="overlay-project-name">
          Nombre del proyecto
        </label>
        <input
          id="overlay-project-name"
          className="text-field"
          value={safeProfile.projectName || ''}
          onChange={(event) => updateProfileField?.('projectName', event.target.value)}
        />

        <label className="field-label" htmlFor="overlay-streamer-name">
          Nombre del canal / creator
        </label>
        <input
          id="overlay-streamer-name"
          className="text-field"
          value={safeProfile.streamerName || ''}
          onChange={(event) => updateProfileField?.('streamerName', event.target.value)}
        />

        <label className="field-label" htmlFor="overlay-slug-core">
          Slug del overlay
        </label>
        <input
          id="overlay-slug-core"
          className="text-field"
          value={safeProfile.overlaySlug || ''}
          onChange={(event) => updateProfileField?.('overlaySlug', event.target.value)}
        />

        <label className="field-label" htmlFor="overlay-public-base">
          URL publica base
        </label>
        <input
          id="overlay-public-base"
          className="text-field"
          placeholder="https://tu-tunel.trycloudflare.com"
          value={safeProfile.publicBaseUrl || ''}
          onChange={(event) => updateProfileField?.('publicBaseUrl', event.target.value)}
        />
        <p className="support-copy">
          LIVE Studio no acepta localhost. Tampoco suele aceptar tuneles temporales (trycloudflare,
          loca.lt). Usa ngrok (<code>ngrok-free.app</code>) o un dominio fijo (Render, dominio propio).
          En el panel Overlay usa &quot;Copiar para LIVE Studio&quot;.
        </p>
      </article>

      <article className="surface-card link-card">
        <span className="signal-label">Links del overlay</span>
        <div className="link-stack">
          <div>
            <span className="snippet-label">Local</span>
            <code className="overlay-link">{localOverlayUrl || 'Generando URL local...'}</code>
          </div>
          <div>
            <span className="snippet-label">Publica</span>
            <code className="overlay-link">
              {publicOverlayUrl || 'Completa la URL publica base para generar el link real.'}
            </code>
          </div>
        </div>
        <div className="card-actions">
          <button type="button" className="primary-button" onClick={onCopyOverlayUrl}>
            {publicOverlayUrl ? 'Copiar URL publica' : 'Copiar URL local'}
          </button>
          <button type="button" className="secondary-button" onClick={onOpenOverlayWindow}>
            Abrir overlay en navegador
          </button>
        </div>
        {linkFeedback ? <span className="feedback-pill">{linkFeedback}</span> : null}
      </article>
    </section>
  )
}

export default OverlaySettingsCore