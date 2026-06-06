import { useCallback, useEffect, useState } from 'react'
import { GOAL_METRIC_EDITOR } from '../../config/widgetConfigSchemas'

export default function GoalsConfigPanel() {
  const [config, setConfig] = useState({})
  const [accumulator, setAccumulator] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/goals/config')
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'Error goals')
      }
      setConfig(payload.config || {})
      setAccumulator(payload.accumulator || null)
    } catch (err) {
      setError(err?.message || 'Error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function updateMetric(prefix, key, value) {
    setConfig((prev) => ({
      ...prev,
      [`${prefix}_${key}`]: value,
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      const response = await fetch('/api/goals/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, _timestamp: Date.now() }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'No guardado')
      }
      setConfig(payload.config || config)
      setAccumulator(payload.accumulator || accumulator)
      setFeedback('Metas guardadas. Los overlays goals se actualizan solos.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleResetAccumulator() {
    try {
      await fetch('/api/goals/accumulator/reset', { method: 'POST' })
      setFeedback('Contador de sesion reiniciado (likes, monedas, etc.).')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <article className="surface-card tc-goals-config">
      <h4>Configurar metas del live</h4>
      <p className="support-copy">
        Misma API que TikControl. El progreso en vivo viene del acumulador de la sesion conectada.
      </p>

      {accumulator ? (
        <div className="tc-widgets-stats">
          <div className="metric-card">
            <span className="metric-label">Likes sesion</span>
            <strong>{accumulator.likes ?? 0}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Monedas sesion</span>
            <strong>{accumulator.coins ?? 0}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Follows</span>
            <strong>{accumulator.follows ?? 0}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Regalos</span>
            <strong>{accumulator.gifts ?? 0}</strong>
          </div>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {feedback ? <p className="feedback-pill">{feedback}</p> : null}

      {loading ? (
        <p className="support-copy">Cargando metas...</p>
      ) : (
        <div className="tc-goals-config-grid">
          {GOAL_METRIC_EDITOR.map((metric) => (
            <div key={metric.id} className="tc-goal-metric-card">
              <strong>{metric.label}</strong>
              <label className="tc-config-field">
                <span>Titulo en barra</span>
                <input
                  className="text-field"
                  value={config[`${metric.prefix}_title`] || metric.label}
                  onChange={(e) => updateMetric(metric.prefix, 'title', e.target.value)}
                />
              </label>
              <label className="tc-config-field">
                <span>Meta (objetivo)</span>
                <input
                  className="text-field"
                  type="number"
                  min={1}
                  value={config[`${metric.prefix}_value`] ?? metric.defaultTarget}
                  onChange={(e) => updateMetric(metric.prefix, 'value', Number(e.target.value))}
                />
              </label>
              <label className="tc-config-field">
                <span>Color barra</span>
                <input
                  type="color"
                  className="tc-config-color"
                  value={config[`${metric.prefix}_progress1Color`] || '#ff0099'}
                  onChange={(e) => updateMetric(metric.prefix, 'progress1Color', e.target.value)}
                />
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="section-actions-row">
        <button type="button" className="secondary-button" onClick={handleResetAccumulator}>
          Reiniciar contadores sesion
        </button>
        <button type="button" className="primary-button" disabled={saving || loading} onClick={handleSave}>
          {saving ? 'Guardando...' : 'Guardar metas'}
        </button>
      </div>
    </article>
  )
}