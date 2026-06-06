import { useCallback, useEffect, useState } from 'react'
import { Settings, X } from 'lucide-react'
import { getWidgetConfigSchema } from '../../config/widgetConfigSchemas'

function FieldInput({ field, value, onChange }) {
  if (field.type === 'boolean') {
    return (
      <label className="tc-config-check">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    )
  }

  if (field.type === 'select') {
    return (
      <label className="tc-config-field">
        <span>{field.label}</span>
        <select
          className="text-field"
          value={value ?? field.options?.[0] ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (field.type === 'color') {
    return (
      <label className="tc-config-field">
        <span>{field.label}</span>
        <input
          type="color"
          className="tc-config-color"
          value={value || '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    )
  }

  return (
    <label className="tc-config-field">
      <span>{field.label}</span>
      <input
        className="text-field"
        type={field.type === 'number' ? 'number' : 'text'}
        min={field.min}
        max={field.max}
        value={value ?? ''}
        onChange={(e) =>
          onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)
        }
      />
    </label>
  )
}

export default function WidgetConfigModal({ widgetId, widgetName, onClose }) {
  const schema = getWidgetConfigSchema(widgetId)
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const loadConfig = useCallback(async () => {
    if (!widgetId || !schema) {
      return
    }
    setLoading(true)
    setError('')
    try {
      const configUrl =
        widgetId === 'auction'
          ? '/api/widgets/auction/config'
          : `/api/widgets/${encodeURIComponent(widgetId)}/config`
      const response = await fetch(configUrl)
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo cargar la configuracion')
      }
      setConfig(payload.config || {})
    } catch (err) {
      setError(err?.message || 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [widgetId, schema])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  async function handleSave() {
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      const configUrl =
        widgetId === 'auction'
          ? '/api/widgets/auction/config'
          : `/api/widgets/${encodeURIComponent(widgetId)}/config`
      const response = await fetch(configUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(widgetId === 'auction' ? { config } : config),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo guardar')
      }
      setConfig(payload.config || config)
      setFeedback('Guardado. El overlay recibira los cambios al instante.')
    } catch (err) {
      setError(err?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleAuctionControl(action) {
    try {
      const response = await fetch('/api/widgets/auction/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'Subasta error')
      }
      setFeedback(`Subasta: ${action}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleTimerControl(action) {
    const body = { action }
    if (action === 'reset' || action === 'start') {
      body.seconds = Number(config.duration || 300)
      body.totalSeconds = body.seconds
    }
    try {
      const response = await fetch('/api/widgets/timer/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'Timer error')
      }
      setFeedback(`Timer: ${action}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleResetRanking() {
    try {
      const response = await fetch(`/api/widgets/${encodeURIComponent(widgetId)}/reset`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error('No se pudo reiniciar el ranking')
      }
      setFeedback('Ranking reiniciado para esta sesion.')
    } catch (err) {
      setError(err.message)
    }
  }

  if (!schema) {
    return null
  }

  return (
    <div className="tc-config-overlay" role="dialog" aria-modal="true">
      <article className="tc-config-panel surface-card">
        <header className="tc-config-head">
          <div>
            <Settings size={18} />
            <strong>Configurar {schema.label || widgetName}</strong>
          </div>
          <button type="button" className="ghost-button compact-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        {loading ? <p className="support-copy">Cargando...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {feedback ? <p className="feedback-pill">{feedback}</p> : null}

        {!loading ? (
          <div className="tc-config-fields">
            {schema.fields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={config[field.key]}
                onChange={(next) => setConfig((prev) => ({ ...prev, [field.key]: next }))}
              />
            ))}
          </div>
        ) : null}

        {schema.timerControls && widgetId === 'timer' ? (
          <div className="section-actions-row">
            <button type="button" className="secondary-button compact-button" onClick={() => handleTimerControl('start')}>
              Iniciar
            </button>
            <button type="button" className="secondary-button compact-button" onClick={() => handleTimerControl('pause')}>
              Pausar
            </button>
            <button type="button" className="secondary-button compact-button" onClick={() => handleTimerControl('reset')}>
              Reiniciar
            </button>
          </div>
        ) : null}

        {schema.auctionControls && widgetId === 'auction' ? (
          <div className="section-actions-row">
            <button type="button" className="secondary-button compact-button" onClick={() => handleAuctionControl('start')}>
              Iniciar subasta
            </button>
            <button type="button" className="secondary-button compact-button" onClick={() => handleAuctionControl('pause')}>
              Pausar
            </button>
            <button type="button" className="secondary-button compact-button" onClick={() => handleAuctionControl('reset')}>
              Reiniciar
            </button>
          </div>
        ) : null}

        {['top-likes', 'top-donors', 'top-comments', 'top-combo', 'top-points'].includes(widgetId) ? (
          <button type="button" className="ghost-button" onClick={handleResetRanking}>
            Reiniciar ranking de sesion
          </button>
        ) : null}

        <footer className="tc-config-footer">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="primary-button" disabled={saving || loading} onClick={handleSave}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </footer>
      </article>
    </div>
  )
}