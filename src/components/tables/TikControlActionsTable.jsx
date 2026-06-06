import { useMemo, useState } from 'react'
import { Play, Edit2, Copy, Trash2 } from 'lucide-react'
import {
  getActionAudioSummary,
  getActionDurationLabel,
  getActionIntegrationSummary,
  getActionOverlaySummary,
  getActionScreenLabel,
} from '../../config/actionsEventsHelpers'

function TikControlActionsTable({
  actions,
  profile,
  onCreateAction,
  onEditAction,
  onPreviewAction,
  onRemoveAction,
  onDuplicateAction,
  onBatchRemove,
}) {
  const [selected, setSelected] = useState(() => new Set())

  const selectedCount = useMemo(
    () => actions.filter((action) => selected.has(action.id)).length,
    [actions, selected],
  )

  function toggleOne(actionId) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(actionId)) {
        next.delete(actionId)
      } else {
        next.add(actionId)
      }
      return next
    })
  }

  function toggleAll() {
    if (selectedCount === actions.length) {
      setSelected(new Set())
      return
    }

    setSelected(new Set(actions.map((action) => action.id)))
  }

  function handleExport() {
    const payload = actions.filter((action) => selected.has(action.id))
    const blob = new Blob([JSON.stringify(payload.length ? payload : actions, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'live-control-acciones.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result || '[]'))
        if (Array.isArray(imported)) {
          imported.forEach((action) => {
            if (action?.name) {
              onDuplicateAction?.(action, { asImport: true })
            }
          })
        }
      } catch {
        window.alert('El archivo JSON no es válido.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function handleBatchDelete() {
    const ids = actions.filter((action) => selected.has(action.id)).map((action) => action.id)
    if (!ids.length) {
      return
    }

    if (!window.confirm(`¿Eliminar ${ids.length} acción(es) seleccionada(s)?`)) {
      return
    }

    onBatchRemove?.(ids)
    setSelected(new Set())
  }

  return (
    <div className="tc-ae-card" id="card-actions">
      <div className="tc-ae-card-header">
        <div className="tc-ae-card-title">
          <span className="section-num">1.</span>
          <span>Acciones</span>
        </div>
        <div className="tc-ae-batch-pill">
          Seleccionadas: <strong>{selectedCount}</strong>
        </div>
        <div className="tc-ae-toolbar">
          <button type="button" className="ghost-button compact-button" onClick={toggleAll}>
            Seleccionar todo
          </button>
          {selectedCount > 0 ? (
            <>
              <button type="button" className="ghost-button compact-button" onClick={handleBatchDelete}>
                Borrar
              </button>
            </>
          ) : null}
          <button type="button" className="ghost-button compact-button" onClick={handleExport}>
            Exportar
          </button>
          <label className="ghost-button compact-button" style={{ cursor: 'pointer' }}>
            Importar
            <input type="file" accept="application/json" hidden onChange={handleImport} />
          </label>
          <button type="button" className="primary-button compact-button" onClick={onCreateAction}>
            Nueva acción
          </button>
        </div>
      </div>
      <div className="tc-ae-card-body">
        <div className="ae-table-wrap" style={{ overflow: 'auto', borderRadius: 14 }}>
          {actions.length === 0 ? (
            <div className="ae-table-empty">
              <p>No hay acciones en este ámbito. Pulsa <strong>Nueva acción</strong> para empezar.</p>
            </div>
          ) : (
            <table className="tbl-actions">
              <colgroup>
                <col style={{ width: '7%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Sel</th>
                  <th>Nombre</th>
                  <th>Pantalla</th>
                  <th>Dur</th>
                  <th>Overlay</th>
                  <th>Audio</th>
                  <th>Integ.</th>
                  <th>Ops</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((action) => (
                  <tr key={action.id}>
                    <td>
                      <div className="ae-sel-cell">
                        <input
                          type="checkbox"
                          checked={selected.has(action.id)}
                          onChange={() => toggleOne(action.id)}
                          aria-label={`Seleccionar ${action.name}`}
                        />
                      </div>
                    </td>
                    <td>
                      <span className="ae-name" title={action.name}>
                        {action.name}
                      </span>
                    </td>
                    <td className="ae-cell-muted">{getActionScreenLabel(action, profile)}</td>
                    <td className="ae-cell-muted">{getActionDurationLabel(action, profile)}</td>
                    <td className="ae-cell-muted">{getActionOverlaySummary(action)}</td>
                    <td className="ae-cell-muted">{getActionAudioSummary(action)}</td>
                    <td className="ae-cell-muted">{getActionIntegrationSummary(action)}</td>
                    <td>
                      <div className="ae-ops">
                        <button type="button" className="ae-op-btn" title="Probar acción" onClick={() => onPreviewAction(action)}>
                          <Play size={14} /> Probar
                        </button>
                        <button type="button" className="ae-op-btn" title="Editar" onClick={() => onEditAction(action.id)}>
                          <Edit2 size={14} /> Editar
                        </button>
                        <button type="button" className="ae-op-btn" title="Duplicar" onClick={() => onDuplicateAction?.(action)}>
                          <Copy size={14} /> Copiar
                        </button>
                        <button
                          type="button"
                          className="ae-op-btn danger"
                          title="Eliminar"
                          onClick={() => onRemoveAction(action.id)}
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

export default TikControlActionsTable