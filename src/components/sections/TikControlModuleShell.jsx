import { ArrowRight, Sparkles } from 'lucide-react'
import { getTikcontrolModule } from '../../config/tikcontrolModules'
import { WORKSPACE_SECTIONS } from '../../dashboardShared'
import SectionHeader from '../common/SectionHeader'

function TikControlModuleShell({
  sectionId,
  onJump,
  children,
  extraActions = null,
  hideIntro = false,
}) {
  const module = getTikcontrolModule(sectionId)
  const sectionMeta = WORKSPACE_SECTIONS.find((section) => section.id === sectionId)
  const related = (module?.relatedSectionIds || [])
    .map((id) => WORKSPACE_SECTIONS.find((section) => section.id === id))
    .filter(Boolean)

  const isImplemented = module?.implemented !== false

  return (
    <section className="panel-section tc-module-shell" id={sectionId}>
      <SectionHeader
        eyebrow={`TikControl • ${module?.tikcontrolId || sectionId}`}
        title={module?.title || sectionMeta?.label || sectionId}
        description={module?.lead || sectionMeta?.description || ''}
      />

      {!hideIntro && (
        <div className="tc-intro-banner">
          <div className="tc-intro-content">
            <div className="tc-intro-header">
              <div className="tc-intro-badge">
                <Sparkles size={14} strokeWidth={2.5} />
                <span>{isImplemented ? 'Integrado' : 'En desarrollo'}</span>
              </div>
              <h3 className="tc-intro-title">
                {module?.title || 'Módulo TikControl'}
              </h3>
            </div>
            <p className="tc-intro-description">
              Experiencia local completa basada en TikControl. Funcionalidad real, sin dependencias de nube.
            </p>
          </div>
        </div>
      )}

      {module?.features?.length ? (
        <div className="tc-feature-grid">
          {module.features.map((feature, index) => (
            <div key={index} className="tc-feature-card">
              <div className="tc-feature-icon">
                <Sparkles size={15} strokeWidth={2.2} />
              </div>
              <span>{feature}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="tc-module-content">
        {children}
      </div>

      {related.length > 0 && (
        <div className="tc-related-section">
          <div className="tc-related-label">Explorar relacionados</div>
          <div className="tc-related-buttons">
            {related.map((section) => (
              <button
                key={section.id}
                type="button"
                className="tc-related-button"
                onClick={() => onJump(section.id)}
              >
                {section.label}
                <ArrowRight size={13} strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </div>
      )}

      {extraActions}
    </section>
  )
}

export default TikControlModuleShell