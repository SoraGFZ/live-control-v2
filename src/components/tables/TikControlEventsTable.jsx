import { useMemo, useState } from 'react'
import { Edit2, Trash2 } from 'lucide-react'
import { getTriggerAudienceSummary, getTriggerRuleSummary } from '../../dashboardViewHelpers'
import {
  getLinkedActionName,
  getTriggerActive,
  getTriggerTypeLabel,
} from '../../config/actionsEventsHelpers'

function TikControlEventsTable({
  actions,
  triggers,
  onCreateTrigger,
  onEditTrigger,
  onRemoveTrigger,
  onToggleTrigger,
  onBatchRemove,
}) {
  const [selected, setSelected] = useState(() => new Set())

  const selectedCount = useMemo(
    () => triggers.filter((trigger) => selected.has(trigger.id)).length,
    [triggers, selected],
  )

  function toggleOne(triggerId) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(triggerId)) {
        next.delete(triggerId)
      } else {
        next.add(triggerId)
      }
      return next
    })
  }

  function toggleAll() {
    if (selectedCount === triggers.length) {
      setSelected(new Set())
      return
    }

    setSelected(new Set(triggers.map((trigger) => trigger.id)))
  }

  function handleExport() {
    const payload = triggers.filter((trigger) => selected.has(trigger.id))
    const blob = new Blob([JSON.stringify(payload.length ? payload : triggers, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'live-control-eventos.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleBatchDelete() {
    const ids = triggers.filter((trigger) => selected.has(trigger.id)).map((trigger) => trigger.id)
    if (!ids.length) {
      return
    }

    if (!window.confirm(`¿Eliminar ${ids.length} evento(s)?`)) {
      return
    }

    onBatchRemove?.(ids)
    setSelected(new Set())
  }

  return (
    <div className="tc-ae-card" id="card-events">
      <div className="tc-ae-card-header">
        <div className="tc-ae-card-title">
          <span className="section-num">2.</span>
          <span>Eventos</span>
        </div>
        <div className="tc-ae-batch-pill">
          Seleccionadas: <strong>{selectedCount}</strong>
        </div>
        <div className="tc-ae-toolbar">
          <button type="button" className="ghost-button compact-button" onClick={toggleAll}>
            Seleccionar todo
          </button>
          {selectedCount > 0 ? (
            <button type="button" className="ghost-button compact-button" onClick={handleBatchDelete}>
              Borrar
            </button>
          ) : null}
          <button type="button" className="ghost-button compact-button" onClick={handleExport}>
            Exportar
          </button>
          <button
            type="button"
            className="primary-button compact-button"
            onClick={onCreateTrigger}
            disabled={actions.length === 0}
          >
            Nuevo evento
          </button>
        </div>
      </div>
      <div className="tc-ae-card-body">
        <div className="ev-table-wrap" style={{ overflow: 'auto', borderRadius: 14 }}>
          {triggers.length === 0 ? (
            <div className="ae-table-empty">
              <p>
                {actions.length === 0
                  ? 'Crea al menos una acción antes de configurar eventos.'
                  : 'Sin eventos todavía. Pulsa Nuevo evento para vincular gifts, chat o follows.'}
              </p>
            </div>
          ) : (
            <table className="tbl-events">
              <colgroup>
                <col style={{ width: '7%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Sel</th>
                  <th>Estado</th>
                  <th>Audiencia</th>
                  <th>Trigger / Tipo</th>
                  <th>Acciones</th>
                  <th>Aleatorias</th>
                  <th>Ops</th>
                </tr>
              </thead>
              <tbody>
                {triggers.map((trigger) => (
                  <tr key={trigger.id}>
                    <td>
                      <div className="ae-sel-cell">
                        <input
                          type="checkbox"
                          checked={selected.has(trigger.id)}
                          onChange={() => toggleOne(trigger.id)}
                        />
                      </div>
                    </td>
                    <td>
                      <label className="ev-switch" title="Activar evento">
                        <input
                          type="checkbox"
                          checked={getTriggerActive(trigger)}
                          onChange={() => onToggleTrigger?.(trigger)}
                        />
                        <span className="ev-switch-slider" />
                      </label>
                    </td>
                    <td className="ae-cell-muted">{getTriggerAudienceSummary(trigger)}</td>
                    <td className="ae-cell-muted" title={getTriggerRuleSummary(trigger)}>
                      {getTriggerTypeLabel(trigger)}
                    </td>
                    <td className="ae-cell-muted">{getLinkedActionName(trigger, actions)}</td>
                    <td className="ae-cell-muted">—</td>
                    <td>
                      <div className="ae-ops">
                        <button type="button" className="ae-op-btn" onClick={() => onEditTrigger(trigger.id)}>
                          <Edit2 size={14} /> Editar
                        </button>
                        <button
                          type="button"
                          className="ae-op-btn danger"
                          onClick={() => onRemoveTrigger(trigger.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default TikControlEventsTable