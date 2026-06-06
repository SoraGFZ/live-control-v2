import { useEffect, useRef, useState } from 'react'
import { PRODUCT } from '../../config/product'
import {
  STREAMING_NAV,
  findNavGroupForSection,
  sectionBelongsToNavGroup,
} from '../../config/streamingNav'

function connectionState(tikTokStatus) {
  if (tikTokStatus?.connected) {
    return 'live'
  }
  if (tikTokStatus?.connecting) {
    return 'connecting'
  }
  return 'offline'
}

function StreamingHeader({
  activeSection,
  onSelectSection,
  onQuickConnectTikTok,
  tikTokStatus,
  tiktokUsernameDraft,
  setTiktokUsernameDraft,
}) {
  const [openGroupId, setOpenGroupId] = useState(null)
  const navRef = useRef(null)

  useEffect(() => {
    function handlePointerDown(event) {
      if (!navRef.current?.contains(event.target)) {
        setOpenGroupId(null)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const activeGroup = findNavGroupForSection(activeSection)
  const czState = connectionState(tikTokStatus)
  const connectBtnClass = [
    'cz-connect-btn',
    tikTokStatus?.connected ? 'connected' : '',
    tikTokStatus?.connecting ? 'connecting' : '',
  ]
    .filter(Boolean)
    .join(' ')

  function jump(sectionId) {
    setOpenGroupId(null)
    onSelectSection(sectionId)
  }

  function toggleGroup(groupId) {
    setOpenGroupId((current) => (current === groupId ? null : groupId))
  }

  return (
    <header className="streaming-header">
      <div className="brand">
        <button
          type="button"
          className="brand-logo"
          onClick={() => jump('overview')}
          aria-label={`${PRODUCT.shortName} inicio`}
        >
          <span className="brand-logo-mark" aria-hidden="true">
            LC
          </span>
        </button>
        <div className="brand-meta">
          <span className="brand-name">{PRODUCT.shortName}</span>
          <div className="brand-version-row">
            <small>v{PRODUCT.version}</small>
            <span className="brand-edition-tag">{PRODUCT.edition}</span>
          </div>
        </div>
      </div>

      <nav className="nav" ref={navRef} aria-label="Modulos del estudio">
        {STREAMING_NAV.map((group) => {
          if (group.type === 'item') {
            const isActive = activeSection === group.sectionId
            return (
              <button
                key={group.id}
                type="button"
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => jump(group.sectionId)}
              >
                <span>{group.label}</span>
              </button>
            )
          }

          const isGroupActive = sectionBelongsToNavGroup(group, activeSection)
          const isOpen = openGroupId === group.id

          return (
            <div
              key={group.id}
              className={`nav-group ${isGroupActive ? 'active' : ''} ${isOpen ? 'dropdown-open' : ''}`}
            >
              <button
                type="button"
                className="nav-group-trigger"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
              >
                <span>{group.label}</span>
              </button>
              <div className="nav-dropdown">
                <div>
                  {group.items.map((item) => (
                    <button
                      key={item.sectionId}
                      type="button"
                      className={`nav-item ${activeSection === item.sectionId ? 'active' : ''}`}
                      onClick={() => jump(item.sectionId)}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </nav>

      <div className="header-right">
        <div
          className="connection-zone"
          data-state={czState}
          title={
            activeGroup?.label
              ? `Modulo: ${activeGroup.label}`
              : 'Conexion TikTok LIVE'
          }
        >
          <span className="cz-at">@</span>
          <input
            id="streaming-username"
            className="cz-username"
            placeholder="nombredeusuario"
            value={tiktokUsernameDraft}
            onChange={(event) => setTiktokUsernameDraft(event.target.value)}
            disabled={Boolean(tikTokStatus?.connected)}
          />
          <button
            type="button"
            className={connectBtnClass}
            onClick={onQuickConnectTikTok}
            disabled={tikTokStatus?.connecting}
          >
            <span className="cz-btn-text">
              {tikTokStatus?.connected
                ? 'Desconectar'
                : tikTokStatus?.connecting
                  ? 'Conectando'
                  : 'Conectar'}
            </span>
          </button>
          <div className="cz-divider" aria-hidden="true" />
          <div className="cz-status" id="statusBadge">
            {tikTokStatus?.connected ? (
              <>
                <span className="cz-status-dot live" aria-hidden="true" />
                <span className="cz-status-label live">LIVE</span>
              </>
            ) : tikTokStatus?.connecting ? (
              <span className="cz-status-label connecting">Conectando...</span>
            ) : (
              <span className="cz-status-label offline">Offline</span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export default StreamingHeader