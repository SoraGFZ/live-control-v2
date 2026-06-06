import {
  Activity,
  AlertCircle,
  Circle,
  Cpu,
  Network,
  Zap,
} from 'lucide-react'
import '../styles/service-status-indicator.css'

/**
 * ServiceStatusIndicator Component
 * Muestra el estado visual de los servicios internos (Backend, Bridge, GTA).
 * Utiliza indicadores de color y tooltips para feedback inmediato.
 *
 * Props:
 * - health: objeto de salud del hook useServiceHealth
 * - compact: boolean - si true, muestra versión compacta (solo iconos)
 * - showDetails: boolean - si true, muestra información detallada
 */
export function ServiceStatusIndicator({ health = {}, compact = false, showDetails = false }) {
  const {
    server = {},
    bridge = {},
    gta = {},
    isHealthy = false,
  } = health

  const getStatusIcon = (isOnline) => {
    return isOnline ? (
      <Circle className="status-icon status-online" fill="currentColor" />
    ) : (
      <Circle className="status-icon status-offline" fill="currentColor" />
    )
  }

  const renderServerStatus = () => {
    const isOnline = server.online === true
    const icon = getStatusIcon(isOnline)
    const title = isOnline ? 'Backend online' : 'Backend offline'
    const label = 'Server'

    if (compact) {
      return (
        <div className="service-status-item compact" title={title}>
          {icon}
        </div>
      )
    }

    return (
      <div className={`service-status-item ${isOnline ? 'online' : 'offline'}`} title={title}>
        <div className="status-icon-wrapper">
          <Activity size={16} />
          {icon}
        </div>
        <div className="status-content">
          <p className="status-label">{label}</p>
          <p className="status-value">{isOnline ? 'Online' : 'Offline'}</p>
          {showDetails && server.uptime && <p className="status-detail">Uptime: {
            Math.round(server.uptime / 1000)
          }s</p>}
          {server.lastError && <p className="status-error">{server.lastError}</p>}
        </div>
      </div>
    )
  }

  const renderBridgeStatus = () => {
    const isOnline = bridge.online === true
    const icon = getStatusIcon(isOnline)
    const gtaCount = bridge.gtaClientsConnected || 0
    const minecraftCount = bridge.minecraftClientsConnected || 0
    const title = isOnline
      ? `Bridge online (${minecraftCount} Minecraft, ${gtaCount} GTA)`
      : 'Bridge offline'
    const label = 'Bridge'

    if (compact) {
      return (
        <div className="service-status-item compact" title={title}>
          {icon}
          {isOnline && bridge.totalClients > 0 && (
            <span className="badge">{bridge.totalClients}</span>
          )}
        </div>
      )
    }

    return (
      <div className={`service-status-item ${isOnline ? 'online' : 'offline'}`} title={title}>
        <div className="status-icon-wrapper">
          <Network size={16} />
          {icon}
        </div>
        <div className="status-content">
          <p className="status-label">{label}</p>
          <p className="status-value">
            {isOnline
              ? `Online (${minecraftCount}M + ${gtaCount}G)`
              : 'Offline'}
          </p>
          {showDetails && bridge.warning && <p className="status-warning">{bridge.warning}</p>}
          {bridge.lastError && <p className="status-error">{bridge.lastError}</p>}
        </div>
      </div>
    )
  }

  const renderGtaStatus = () => {
    const isDetected = gta.detected === true
    const chaosmodReachable = gta.chaosmod?.reachable === true
    const icon = getStatusIcon(isDetected)
    const title = isDetected ? 'GTA V + ChaosMod detected' : 'GTA V + ChaosMod not detected'
    const label = 'GTA / ChaosMod'

    if (compact) {
      return (
        <div className="service-status-item compact" title={title}>
          {icon}
        </div>
      )
    }

    return (
      <div className={`service-status-item ${isDetected ? 'online' : 'offline'}`} title={title}>
        <div className="status-icon-wrapper">
          <Zap size={16} />
          {icon}
        </div>
        <div className="status-content">
          <p className="status-label">{label}</p>
          <p className="status-value">
            {isDetected && chaosmodReachable ? 'Detected' : 'Not detected'}
          </p>
          {showDetails && (
            <>
              {gta.chaosmod?.enabled && (
                <p className="status-detail">ChaosMod: {gta.chaosmod.reachable ? 'Reachable' : 'Unreachable'}</p>
              )}
              {gta.warning && <p className="status-warning">{gta.warning}</p>}
            </>
          )}
          {gta.lastError && <p className="status-error">{gta.lastError}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className={`service-status-indicator ${compact ? 'compact' : 'expanded'}`}>
      <div className="services-grid">
        {renderServerStatus()}
        {renderBridgeStatus()}
        {renderGtaStatus()}
      </div>

      {!isHealthy && (
        <div className="health-warning">
          <AlertCircle size={14} />
          <span>Services initializing...</span>
        </div>
      )}

      {showDetails && (
        <div className="health-details">
          <div className="detail-line">
            <span className="detail-label">Overall status:</span>
            <span className={`detail-value ${isHealthy ? 'healthy' : 'unhealthy'}`}>
              {isHealthy ? '✓ Healthy' : '✗ Unhealthy'}
            </span>
          </div>
          <div className="detail-line">
            <span className="detail-label">Last check:</span>
            <span className="detail-value">
              {server.lastCheck
                ? new Date(server.lastCheck).toLocaleTimeString()
                : 'Never'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
