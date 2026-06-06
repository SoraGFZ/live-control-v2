import { useCallback, useEffect, useState } from 'react'
import { Copy, Play, Pause, RotateCcw } from 'lucide-react'
import { buildTikcontrolWidgetUrl } from '../../config/tikcontrolWidgetsCatalog'

async function postJson(url, body = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error || 'Error de API')
  }
  return payload
}

export default function EventLiveControls({ profile }) {
  const overlayKey = profile?.overlayKey || ''
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const timerUrl = buildTikcontrolWidgetUrl('timer.html', { baseUrl, overlayKey })
  const auctionUrl = buildTikcontrolWidgetUrl('auction.html', { baseUrl, overlayKey })

  const [timerState, setTimerState] = useState(null)
  const [auctionState, setAuctionState] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [timerRes, auctionRes] = await Promise.all([
        fetch('/api/widgets/timer/state'),
        fetch('/api/widgets/auction/state'),
      ])
      const timerPayload = await timerRes.json()
      const auctionPayload = await auctionRes.json()
      if (timerPayload?.ok) {
        setTimerState(timerPayload.state || null)
      }
      if (auctionPayload?.ok) {
        setAuctionState(auctionPayload.state || null)
      }
      setError('')
    } catch (err) {
      setError(err?.message || 'No se pudo leer estado')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    const interval = window.setInterval(refresh, 2000)
    return () => window.clearInterval(interval)
  }, [refresh])

  async function runTimer(action) {
    try {
      await postJson('/api/widgets/timer/control', { action })
      setFeedback(`Timer: ${action}`)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function runAuction(action) {
    try {
      await postJson('/api/widgets/auction/control', { action })
      setFeedback(`Subasta: ${action}`)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function copyUrl(url, label) {
    try {
      await navigator.clipboard.writeText(url)
      setFeedback(`URL copiada (${label})`)
    } catch {
      setError('No se pudo copiar la URL')
    }
  }

  const timerRemaining = timerState?.remainingSeconds ?? '—'
  const auctionLeader = auctionState?.leaderId
    ? `${auctionState.participants?.[auctionState.leaderId]?.nickname || auctionState.leaderId} (${auctionState.leaderCoins || 0} monedas)`
    : 'Sin lider'

  return (
    <article className="surface-card tc-event-live-controls">
      <h4>Control en vivo (Timer y Subasta)</h4>
      <p className="support-copy">
        Pega las URLs en TikTok LIVE Studio. Desde aqui inicias, pausas o reinicias sin tocar archivos.
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {feedback ? <p className="feedback-pill">{feedback}</p> : null}

      <div className="tc-event-controls-grid">
        <section className="tc-event-control-block">
          <div className="card-top">
            <strong>Timer</strong>
            <span className="muted-pill">{timerState?.isRunning ? 'En marcha' : 'Parado'} · {timerRemaining}s</span>
          </div>
          <code className="dense-code">{timerUrl}</code>
          <div className="row-actions">
            <button type="button" className="secondary-button compact-button" onClick={() => runTimer('start')}>
              <Play size={14} /> Iniciar
            </button>
            <button type="button" className="secondary-button compact-button" onClick={() => runTimer('pause')}>
              <Pause size={14} /> Pausar
            </button>
            <button type="button" className="secondary-button compact-button" onClick={() => runTimer('reset')}>
              <RotateCcw size={14} /> Reiniciar
            </button>
            <button type="button" className="ghost-button compact-button" onClick={() => copyUrl(timerUrl, 'timer')}>
              <Copy size={14} /> URL
            </button>
          </div>
        </section>

        <section className="tc-event-control-block">
          <div className="card-top">
            <strong>Subasta</strong>
            <span className="muted-pill">
              {auctionState?.running ? (auctionState.paused ? 'Pausada' : 'Activa') : 'Parada'} · {auctionLeader}
            </span>
          </div>
          <code className="dense-code">{auctionUrl}</code>
          <div className="row-actions">
            <button type="button" className="secondary-button compact-button" onClick={() => runAuction('start')}>
              <Play size={14} /> Iniciar
            </button>
            <button type="button" className="secondary-button compact-button" onClick={() => runAuction('pause')}>
              <Pause size={14} /> Pausar
            </button>
            <button type="button" className="secondary-button compact-button" onClick={() => runAuction('reset')}>
              <RotateCcw size={14} /> Reiniciar
            </button>
            <button type="button" className="ghost-button compact-button" onClick={() => copyUrl(auctionUrl, 'subasta')}>
              <Copy size={14} /> URL
            </button>
          </div>
        </section>
      </div>
    </article>
  )
}