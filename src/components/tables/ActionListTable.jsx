import React, { useMemo, useState } from 'react'
import {
  getActionCommandSummary,
  getOutputMeta,
  isOverlayCapable,
} from '../../live-control'
import { getActionDetailLine, normalizePickerText } from '../../dashboardViewHelpers'
import { 
  Search, TerminalSquare, Info, Play, Edit2, Trash2,
  Gamepad2, Volume2, Layers, Box, SearchX
} from 'lucide-react'

// Utilidades enganchables con theme-overrides.css nativo
function getActionTone(action) {
  if (action.outputs.includes('overlay')) return 'accent'
  if (action.outputs.includes('gta') || action.outputs.includes('minecraft')) return 'game'
  if (action.outputs.includes('audio') || action.outputs.includes('tts')) return 'media'
  return 'default'
}

function getToneIcon(tone) {
  switch (tone) {
    case 'accent': return <Layers size={18} />
    case 'game': return <Gamepad2 size={18} />
    case 'media': return <Volume2 size={18} />
    default: return <Box size={18} />
  }
}

function ActionListTable({ actions, onEditAction, onPreviewAction, onRemoveAction }) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredActions = useMemo(
    () =>
      actions.filter((action) =>
        normalizePickerText(
          `${action.name} ${action.description} ${getActionCommandSummary(action)} ${action.outputs.join(' ')} ${action.overlayText} ${action.mediaUrl}`,
        ).includes(normalizePickerText(searchQuery)),
      ),
    [actions, searchQuery],
  )

  return (
    <div className="action-library-shell">
      <div className="action-library-toolbar">
        <div className="action-library-search-wrap" style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            className="list-search"
            style={{ width: '100%', paddingLeft: '2.8rem', paddingRight: '1rem', color: '#f8fafc', outline: 'none' }}
            placeholder="Buscar acciones por nombre, comando o detalle..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        
        <div className="action-library-meta">
          <span className="action-card-badge">
            {filteredActions.length} acción{filteredActions.length !== 1 ? 'es' : ''}
          </span>
        </div>
      </div>

      {filteredActions.length === 0 ? (
        <div className="empty-state-card">
          <SearchX className="empty-state-icon" size={36} />
          <h4>Ninguna coincidencia</h4>
          <p>No se han encontrado acciones que coincidan con la búsqueda o el filtro actual.</p>
        </div>
      ) : (
        <div className="action-card-grid">
          {filteredActions.map((action, index) => {
            const tone = getActionTone(action)
            const commandSummary = getActionCommandSummary(action) || 'Sin comando'
            const detailLine = getActionDetailLine(action)
            const delay = (index % 12) * 0.04

            return (
              <article
                key={action.id}
                className={`action-card action-card-${tone}`}
                style={{
                  animationDelay: `${delay}s`,
                  opacity: 0,
                  animationName: 'card-enter',
                  animationDuration: '0.4s',
                  animationFillMode: 'forwards',
                  animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}
              >
                <div className="action-card-top">
                  <div className="action-card-headline">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ color: 'var(--theme-accent)' }}>
                        {getToneIcon(tone)}
                      </div>
                      <h3 className="action-card-title">{action.name}</h3>
                    </div>
                    <div className="action-card-chip-row">
                      {action.outputs.map((output) => (
                        <span key={output} className="tag action-output-chip">
                          {getOutputMeta(output)?.label || output}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="action-card-description" title={action.description || 'Sin descripción.'}>
                    {action.description || 'Sin descripción.'}
                  </p>
                </div>

                <div className="action-card-info-grid">
                  <div className="action-info-block">
                    <span className="action-info-label">
                      <TerminalSquare size={12} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                      Comando / Payload
                    </span>
                    <code className="dense-code action-code">{commandSummary}</code>
                  </div>
                  <div className="action-info-block">
                    <span className="action-info-label">
                      <Info size={12} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                      Detalle extra
                    </span>
                    <span className="action-detail-copy">{detailLine}</span>
                  </div>
                </div>

                <div className="action-card-actions">
                  <button
                    className="primary-button compact-button"
                    style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                    onClick={() => onPreviewAction(action)}
                  >
                    {isOverlayCapable(action) ? (
                      <><Play size={16} /> Probar</>
                    ) : (
                      <><Play size={16} /> Probar</>
                    )}
                  </button>

                  <button
                    className="secondary-button compact-button"
                    style={{ padding: '0 14px', display: 'flex', alignItems: 'center' }}
                    onClick={() => onEditAction(action.id)}
                    title="Editar acción"
                  >
                    <Edit2 size={16} />
                  </button>

                  <button
                    className="danger-button compact-button"
                    style={{ padding: '0 14px', display: 'flex', alignItems: 'center', background: 'rgba(239, 68, 68, 0.05)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                    onClick={() => onRemoveAction(action.id)}
                    title="Eliminar acción"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ActionListTable