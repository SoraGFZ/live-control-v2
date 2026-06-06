import { createElement } from 'react'
import { Activity, Crown, Layers3, Sparkles } from 'lucide-react'
import { PRODUCT, WORKSPACE_NAV_GROUPS } from '../../config/product'
import { WORKSPACE_SECTIONS } from '../../dashboardShared'
import { getSectionIcon } from '../../dashboardIcons'

const sectionMap = Object.fromEntries(WORKSPACE_SECTIONS.map((section) => [section.id, section]))

function Sidebar({ activeSection, onJump, tikTokConnected = false }) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-badge">
          <Sparkles size={14} strokeWidth={2.4} />
          <span>{PRODUCT.edition}</span>
        </div>

        <div className="brand-headline">
          <h1 className="brand-title">{PRODUCT.shortName}</h1>
          <p className="brand-copy">{PRODUCT.tagline}</p>
        </div>

        <div className="sidebar-stats">
          <div className="sidebar-stat-pill">
            <Layers3 size={14} strokeWidth={2.1} />
            <span>{WORKSPACE_SECTIONS.length} modulos</span>
          </div>
          <div className={`sidebar-stat-pill ${tikTokConnected ? 'active' : ''}`}>
            <Activity size={14} strokeWidth={2.1} />
            <span>{tikTokConnected ? 'Live activo' : 'Standby'}</span>
          </div>
        </div>
      </div>

      <div className="sidebar-nav-groups">
        {WORKSPACE_NAV_GROUPS.map((group) => (
          <div key={group.id} className="sidebar-nav-group">
            <span className="sidebar-nav-group-label">{group.label}</span>
            <nav className="sidebar-nav" aria-label={group.label}>
              {group.sectionIds.map((sectionId) => {
                const section = sectionMap[sectionId]
                if (!section) {
                  return null
                }

                const SectionIcon = getSectionIcon(section.id)
                const isActive = activeSection === section.id

                return (
                  <button
                    key={section.id}
                    type="button"
                    className={`nav-button ${isActive ? 'active' : ''}`}
                    onClick={() => onJump(section.id)}
                  >
                    <span className="nav-button-main">
                      <span className="nav-button-icon">
                        {createElement(SectionIcon, { size: 18, strokeWidth: 2.1 })}
                      </span>
                      <span className="nav-button-copy">
                        <span className="nav-button-row">
                          <strong>{section.label}</strong>
                          <small className="nav-button-token">{section.token}</small>
                        </span>
                        <small>{section.description}</small>
                      </span>
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="sidebar-card sidebar-commercial-card premium-sidebar-card">
        <span className="sidebar-card-label">
          <Crown size={12} strokeWidth={2.2} />
          Founder Edition
        </span>
        <strong>{PRODUCT.name}</strong>
        <p>
          Todo el poder de un estudio pro, 100% local. Overlays, triggers, música, gaming y más sin límites.
        </p>
        <p className="sidebar-product-meta">
          v{PRODUCT.version} · {PRODUCT.license.label}
        </p>
      </div>
    </aside>
  )
}

export default Sidebar