import { createElement } from 'react'
import { PRODUCT } from '../../config/product'
import { WORKSPACE_SECTIONS } from '../../dashboardShared'
import { ArrowLeft, Link2, Plus, Sparkles } from 'lucide-react'
import { getSectionIcon } from '../../dashboardIcons'

function WorkspaceHeader({
  activeSection,
  onCreateAction,
  onCreateTrigger,
  onSelectSection,
  overlayUrl,
}) {
  const currentSection =
    WORKSPACE_SECTIONS.find((section) => section.id === activeSection) || WORKSPACE_SECTIONS[0]

  const CurrentSectionIcon = getSectionIcon(currentSection.id)

  return (
    <section className="workspace-header premium-workspace-header">
      <div className="workspace-header-main">
        <div className="workspace-header-copy">
          <span className="eyebrow">{PRODUCT.name}</span>

          <div className="workspace-title-row">
            <span className="workspace-section-icon">
              {createElement(CurrentSectionIcon, { size: 22, strokeWidth: 2.1 })}
            </span>

            <div className="workspace-title-stack">
              <h1>{currentSection.label}</h1>
              <span className="workspace-title-tag">{currentSection.token}</span>
            </div>
          </div>

          <p>
            {activeSection === 'overview'
              ? 'Resumen ejecutivo del estudio: conecta, automatiza y lanza overlays con un flujo pensado para vender y escalar.'
              : currentSection.description}
          </p>
        </div>

        <div className="workspace-header-actions">
          {activeSection !== 'overview' ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => onSelectSection('overview')}
            >
              <ArrowLeft size={16} strokeWidth={2.1} />
              Volver al inicio
            </button>
          ) : null}

          <button type="button" className="secondary-button" onClick={onCreateTrigger}>
            <Sparkles size={16} strokeWidth={2.1} />
            Nuevo evento
          </button>

          <button type="button" className="primary-button" onClick={onCreateAction}>
            <Plus size={16} strokeWidth={2.1} />
            Nueva acción
          </button>
        </div>
      </div>

      <div className="workspace-header-link">
        <div className="workspace-link-head">
          <span className="snippet-label workspace-link-label">
            <Link2 size={14} strokeWidth={2.1} />
            Overlay principal
          </span>

          <span className="workspace-link-state">Disponible</span>
        </div>

        <code className="overlay-link">{overlayUrl}</code>
      </div>
    </section>
  )
}

export default WorkspaceHeader