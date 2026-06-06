import { useMemo, useState } from 'react'
import {
  ACTION_SCOPE_GLOBAL,
  ACTION_SCOPE_PROFILE,
  filterByScope,
  getActionScope,
  getTriggerActive,
} from '../../config/actionsEventsHelpers'
import TikControlActionsTable from '../tables/TikControlActionsTable'
import TikControlEventsTable from '../tables/TikControlEventsTable'
import ActionsScreensPanel from './ActionsScreensPanel'
import SimulationsSection from './SimulationsSection'

function ActionsIntroBanner({ collapsed, onToggle }) {
  return (
    <div className={`tab-intro-banner${collapsed ? ' is-collapsed' : ''}`} data-tab-intro="acciones">
      <div className="tab-intro-banner-bg" aria-hidden="true" />
      <div className="tab-intro-banner-inner">
        <div className="tab-intro-icon-box" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 65 60" fill="none" aria-hidden="true">
            <path
              fill="#fff"
              d="M50.07,23.99c-.25-.61-.85-1.01-1.51-1.01h-12.88l9.25-17.68c.27-.5.25-1.12-.04-1.61-.29-.49-.83-.79-1.4-.79h-20.17c-.76,0-1.41.52-1.59,1.26l-7.04,29.74c-.12.49,0,1,.31,1.39.31.39.78.62,1.28.62h6.84l-6.98,19.02c-.26.73,0,1.52.66,1.94.27.17.58.26.88.26.42,0,.84-.17,1.15-.48l30.87-30.87c.47-.47.61-1.17.35-1.78Z"
            />
          </svg>
        </div>
        <div className="tab-intro-content">
          <div className="tab-intro-head-row">
            <h2 className="tab-intro-title">Acciones y eventos</h2>
            <button
              type="button"
              className="tab-intro-btn tab-intro-toggle"
              aria-expanded={!collapsed}
              onClick={onToggle}
            >
              <svg
                className="tab-intro-chevron"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
          <div className="tab-intro-body">
            <p className="tab-intro-desc">
              <span className="tab-intro-ul">Haz que tu LIVE cobre vida automáticamente.</span> Con{' '}
              <strong>Live Control Studio</strong> decides qué lo activa <strong>(Evento)</strong>, qué
              sucede <strong>(Acción)</strong> y dónde se muestra <strong>(Pantalla)</strong>.
            </p>
            <div className="tab-intro-flow" aria-hidden="true">
              <div className="tab-intro-chip">
                <span>Evento</span>
              </div>
              <span className="tab-intro-arrow">→</span>
              <div className="tab-intro-chip">
                <span>Acción</span>
              </div>
              <span className="tab-intro-arrow">→</span>
              <div className="tab-intro-chip">
                <span>Pantalla</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionsEventsHub({
  actions,
  triggers,
  profile,
  localOverlayUrl,
  overlayScreens,
  emoteCatalog,
  giftCatalog,
  addAction,
  updateTrigger,
  onCreateAction,
  onEditAction,
  onPreviewAction,
  onRemoveAction,
  onCreateTrigger,
  onEditTrigger,
  onRemoveTrigger,
  onSampleEvent,
  onCopyOverlayUrl,
}) {
  const [introCollapsed, setIntroCollapsed] = useState(false)
  const [scope, setScope] = useState(ACTION_SCOPE_PROFILE)

  const scopedActions = useMemo(() => filterByScope(actions, scope), [actions, scope])
  const scopedTriggers = useMemo(() => filterByScope(triggers, scope), [triggers, scope])

  const scopeHint =
    scope === ACTION_SCOPE_GLOBAL
      ? 'Configuración global: se mantiene activa en cualquier perfil.'
      : 'Configuración de este perfil: solo se aplica mientras el perfil esté activo.'

  function duplicateAction(source, options = {}) {
    if (!source) {
      return
    }

    const { id: _id, ...rest } = source
    addAction({
      ...rest,
      name: options.asImport ? rest.name || 'Acción importada' : `${rest.name || 'Acción'} (copia)`,
      scope,
    })
  }

  function handleBatchRemoveActions(ids) {
    ids.forEach((id) => onRemoveAction(id))
  }

  function handleBatchRemoveTriggers(ids) {
    ids.forEach((id) => onRemoveTrigger(id))
  }

  function handleToggleTrigger(trigger) {
    updateTrigger({
      ...trigger,
      active: !getTriggerActive(trigger),
      scope: getActionScope(trigger),
    })
  }

  function moveSelectedToGlobal() {
    // Improved UX: just switch to global scope with a hint
    setScope(ACTION_SCOPE_GLOBAL)
  }

  return (
    <section className="view-acciones-lcs panel-section" id="acciones">
      <ActionsIntroBanner
        collapsed={introCollapsed}
        onToggle={() => setIntroCollapsed((value) => !value)}
      />

      <div className="ae-subtabs" role="tablist" aria-label="Ámbito de acciones y eventos">
        <button
          type="button"
          className={`ae-subtab-btn${scope === ACTION_SCOPE_PROFILE ? ' active' : ''}`}
          role="tab"
          aria-selected={scope === ACTION_SCOPE_PROFILE}
          onClick={() => setScope(ACTION_SCOPE_PROFILE)}
        >
          <span>Este perfil</span>
        </button>
        <button
          type="button"
          className={`ae-subtab-btn${scope === ACTION_SCOPE_GLOBAL ? ' active' : ''}`}
          role="tab"
          aria-selected={scope === ACTION_SCOPE_GLOBAL}
          onClick={() => setScope(ACTION_SCOPE_GLOBAL)}
        >
          <span>Global</span>
          <span className="premium-badge">Premium</span>
        </button>
      </div>
      <p className="ae-scope-hint">{scopeHint}</p>

      <TikControlActionsTable
        actions={scopedActions}
        profile={profile}
        onCreateAction={onCreateAction}
        onEditAction={onEditAction}
        onPreviewAction={onPreviewAction}
        onRemoveAction={onRemoveAction}
        onDuplicateAction={duplicateAction}
        onBatchRemove={handleBatchRemoveActions}
      />

      <TikControlEventsTable
        actions={scopedActions}
        triggers={scopedTriggers}
        onCreateTrigger={onCreateTrigger}
        onEditTrigger={onEditTrigger}
        onRemoveTrigger={onRemoveTrigger}
        onToggleTrigger={handleToggleTrigger}
        onBatchRemove={handleBatchRemoveTriggers}
      />

      <ActionsScreensPanel
        localOverlayUrl={localOverlayUrl}
        overlayScreens={overlayScreens}
        profile={profile}
        onCopyOverlayUrl={onCopyOverlayUrl}
      />

      <div className="tc-ae-card">
        <div className="tc-ae-card-header">
          <div className="tc-ae-card-title">
            <span className="section-num">4.</span>
            <span>Pruebas rápidas</span>
          </div>
        </div>
        <div className="tc-ae-card-body">
          <SimulationsSection
            emoteCatalog={emoteCatalog}
            giftCatalog={giftCatalog}
            onSampleEvent={onSampleEvent}
            title=""
            description="Envía gifts, chat o likes de prueba por el mismo backend del live."
          />
        </div>
      </div>

      {scope === ACTION_SCOPE_PROFILE && scopedActions.some((action) => action.scope === ACTION_SCOPE_PROFILE) ? (
        <div style={{ display: 'none' }} aria-hidden="true">
          <button type="button" onClick={moveSelectedToGlobal}>
            Mover al global
          </button>
        </div>
      ) : null}
    </section>
  )
}

export default ActionsEventsHub