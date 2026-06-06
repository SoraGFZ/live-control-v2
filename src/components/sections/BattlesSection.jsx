import { useCallback, useEffect, useState } from 'react'
import TikControlModuleShell from './TikControlModuleShell'
import { TIKCONTROL_WIDGETS, buildTikcontrolWidgetUrl } from '../../config/tikcontrolWidgetsCatalog'

const BATTLE_WIDGET_IDS = [
  'battle-pk',
  'battle-overlay',
  'battle-scoreboard',
  'battle-gifts',
  'battle-alerts',
  'gift-battle',
]

export default function BattlesSection({ onJump, profile, serverStatus }) {
  const overlayKey = profile?.overlayKey || ''
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const [battleSession, setBattleSession] = useState(null)
  const [loadError, setLoadError] = useState('')

  const battleWidgets = TIKCONTROL_WIDGETS.filter((widget) => BATTLE_WIDGET_IDS.includes(widget.id))

  const refreshBattleState = useCallback(async () => {
    try {
      const response = await fetch('/api/battle-pk/state')
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo leer el estado de batalla')
      }
      setBattleSession(payload.session || null)
      setLoadError('')
    } catch (error) {
      setLoadError(error?.message || 'Error de batallas')
    }
  }, [])

  useEffect(() => {
    refreshBattleState()
    const timer = window.setInterval(refreshBattleState, 4000)
    return () => window.clearInterval(timer)
  }, [refreshBattleState, serverStatus?.tikTok?.connected])

  return (
    <TikControlModuleShell sectionId="battles" onJump={onJump}>
      <article className="tc-premium-hero">
        <span className="tc-premium-badge">Batallas TikTok LIVE</span>
        <h3>PK, regalos en duelo y overlays de batalla</h3>
        <p>
          Paridad TikControl: escucha <code>linkMicBattle</code> y <code>linkMicArmies</code> del live y
          alimenta los widgets de batalla en OBS / LIVE Studio.
        </p>
      </article>

      <div className="tc-widgets-stats">
        <div className="metric-card">
          <span className="metric-label">Live conectado</span>
          <strong>{serverStatus?.tikTok?.connected ? 'Si' : 'No'}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Batalla activa</span>
          <strong>{battleSession?.isActive ? 'Si' : 'No'}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Battle ID</span>
          <strong>{battleSession?.battleId || '—'}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Ultimo evento</span>
          <strong>{battleSession?.lastPayload?.type || '—'}</strong>
        </div>
      </div>

      {loadError ? <p className="form-error">{loadError}</p> : null}

      <div className="section-actions-row">
        <button type="button" className="secondary-button" onClick={refreshBattleState}>
          Actualizar estado
        </button>
        <button type="button" className="secondary-button" onClick={() => onJump('widgets-gallery')}>
          Galeria de widgets
        </button>
        <button type="button" className="primary-button" onClick={() => onJump('live-hub')}>
          Centro LIVE
        </button>
      </div>

      <div className="tc-widget-gallery-grid">
        {battleWidgets.map((widget) => {
          const url = buildTikcontrolWidgetUrl(widget.tikcontrolFile, { baseUrl, overlayKey })
          return (
            <article key={widget.id} className="tc-widget-card is-live">
              <strong>{widget.name}</strong>
              <p>{widget.description}</p>
              <code className="dense-code">{url}</code>
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => navigator.clipboard.writeText(url)}
              >
                Copiar URL
              </button>
            </article>
          )
        })}
      </div>
    </TikControlModuleShell>
  )
}