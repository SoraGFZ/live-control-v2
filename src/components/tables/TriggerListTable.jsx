import React, { useMemo, useState } from 'react'
import { getTriggerLabel } from '../../live-control'
import {
  CURATED_GIFT_CATALOG,
  getTriggerAudienceSummary,
  getTriggerRuleSummary,
  normalizeEmoteCatalogForPicker,
  normalizeGiftCatalogForPicker,
  normalizePickerText,
  parseGiftTriggerMatch,
} from '../../dashboardViewHelpers'
import {
  Search, Edit2, Trash2, Box, Gift, SmilePlus, MessageSquare, ThumbsUp, Link as LinkIcon, Users, SearchX
} from 'lucide-react'

// Utilidades para tonos
function getTriggerTone(trigger) {
  if (trigger.source === 'gift') return 'gift'
  if (trigger.source === 'emote') return 'emote'
  if (trigger.source === 'comment') return 'chat'
  if (trigger.source === 'like') return 'like'
  return 'default'
}

function getToneIcon(tone) {
  switch (tone) {
    case 'gift': return <Gift size={18} />
    case 'emote': return <SmilePlus size={18} />
    case 'chat': return <MessageSquare size={18} />
    case 'like': return <ThumbsUp size={18} />
    default: return <Box size={18} />
  }
}

function TriggerListTable({
  actions,
  emoteCatalog,
  giftCatalog,
  onEditTrigger,
  onRemoveTrigger,
  triggers,
}) {
  const [searchQuery, setSearchQuery] = useState('')

  const normalizedGiftCatalog = ((giftCatalog && giftCatalog.length) ? giftCatalog : CURATED_GIFT_CATALOG).map(
    (gift, index) => normalizeGiftCatalogForPicker(gift, index),
  )

  const normalizedEmoteCatalog = Array.isArray(emoteCatalog)
    ? emoteCatalog.map((emote, index) => normalizeEmoteCatalogForPicker(emote, index))
    : []

  const filteredTriggers = useMemo(() => {
    return triggers.filter((trigger) => {
      const linkedAction = actions.find((action) => action.id === trigger.actionId)

      return normalizePickerText(
        `${trigger.source} ${trigger.match} ${linkedAction?.name || ''} ${linkedAction?.description || ''} ${getTriggerAudienceSummary(trigger)}`,
      ).includes(normalizePickerText(searchQuery))
    })
  }, [actions, searchQuery, triggers])

  function renderTriggerVisual(trigger) {
    if (trigger.source === 'gift') {
      const parsedGift = parseGiftTriggerMatch(trigger.match)
      const linkedGift = normalizedGiftCatalog.find(
        (gift) => normalizePickerText(gift.name) === normalizePickerText(parsedGift.giftName),
      )

      if (!linkedGift) {
        return <span className="trigger-card-pill">{getTriggerLabel(trigger.source)}</span>
      }

      return (
        <span className="trigger-card-pill rich">
          {linkedGift.imageUrl ? (
            <img src={linkedGift.imageUrl} alt={linkedGift.name} className="gift-inline-image" />
          ) : (
            <span className="gift-inline-token" style={{ background: linkedGift.accent || 'rgba(255, 255, 255, 0.08)' }}>
              {linkedGift.token}
            </span>
          )}
          <span style={{ marginLeft: '4px' }}>{linkedGift.name}</span>
        </span>
      )
    }

    if (trigger.source === 'emote') {
      const linkedEmote = normalizedEmoteCatalog.find(
        (emote) =>
          normalizePickerText(emote.name) === normalizePickerText(trigger.match)
          || normalizePickerText(emote.id) === normalizePickerText(trigger.match),
      )

      if (!linkedEmote) {
        return <span className="trigger-card-pill">{getTriggerLabel(trigger.source)}</span>
      }

      return (
        <span className="trigger-card-pill rich">
          {linkedEmote.imageUrl ? (
            <img src={linkedEmote.imageUrl} alt={linkedEmote.name} className="gift-inline-image" />
          ) : (
            <span className="gift-inline-token" style={{ background: linkedEmote.accent || 'rgba(255, 255, 255, 0.08)' }}>
              {linkedEmote.token}
            </span>
          )}
          <span style={{ marginLeft: '4px' }}>{linkedEmote.name}</span>
        </span>
      )
    }

    return <span className="trigger-card-pill">{getTriggerLabel(trigger.source)}</span>
  }

  return (
    <div className="trigger-library-shell">
      <div className="trigger-library-toolbar">
        <div className="trigger-library-search-wrap" style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            className="list-search"
            style={{ width: '100%', paddingLeft: '2.8rem', paddingRight: '1rem', color: '#f8fafc', outline: 'none' }}
            placeholder="Buscar eventos por nombre, regla o acción..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <div className="trigger-library-meta">
          <span className="trigger-card-source" style={{ minHeight: 'auto', padding: '6px 14px' }}>
            {filteredTriggers.length} evento{filteredTriggers.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {filteredTriggers.length === 0 ? (
        <div className="empty-state-card">
          <SearchX className="empty-state-icon" size={36} />
          <h4>Ninguna coincidencia</h4>
          <p>No se han encontrado eventos que coincidan con la búsqueda o el filtro actual.</p>
        </div>
      ) : (
        <div className="trigger-card-grid">
          {filteredTriggers.map((trigger, index) => {
            const linkedAction = actions.find((action) => action.id === trigger.actionId)
            const tone = getTriggerTone(trigger)
            const delay = (index % 12) * 0.04

            return (
              <article
                key={trigger.id}
                className={`trigger-card trigger-card-${tone}`}
                style={{
                  animationDelay: `${delay}s`,
                  opacity: 0,
                  animationName: 'card-enter',
                  animationDuration: '0.4s',
                  animationFillMode: 'forwards',
                  animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}
              >
                <div className="trigger-card-top">
                  <div className="trigger-card-headline">
                    {renderTriggerVisual(trigger)}
                    <div style={{ color: 'var(--theme-text-soft)', display: 'flex', opacity: 0.8 }}>
                       {getToneIcon(tone)}
                    </div>
                  </div>
                  
                  <div className="trigger-card-rule-wrap" style={{ marginTop: '0.4rem' }}>
                    <span className="trigger-card-source" style={{ minHeight: 'auto', padding: '4px 10px' }}>
                      {getTriggerLabel(trigger.source)}
                    </span>
                    <strong className="trigger-card-rule">
                      {getTriggerRuleSummary(trigger)}
                    </strong>
                  </div>
                </div>

                <div className="trigger-card-info-grid">
                  <div className="trigger-info-block">
                    <span className="trigger-info-label">
                      <LinkIcon size={12} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                      Acción Vinculada
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <strong className="trigger-linked-action">
                        {linkedAction?.name || 'Acción eliminada'}
                      </strong>
                      <span style={{ fontSize: '0.8rem', color: 'rgba(204, 214, 223, 0.6)' }}>
                         {linkedAction?.description || 'Sin descripción o enlace roto.'}
                      </span>
                    </div>
                  </div>

                  <div className="trigger-info-block">
                    <span className="trigger-info-label">
                      <Users size={12} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                      Audiencia y Límite
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <strong className="trigger-linked-action">
                        {getTriggerAudienceSummary(trigger)}
                      </strong>
                      <span style={{ fontSize: '0.8rem', color: 'rgba(204, 214, 223, 0.6)' }}>
                        {trigger.cooldownSeconds || '0'} seg de cooldown global.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="trigger-card-actions">
                  <button
                    className="secondary-button compact-button"
                    style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                    onClick={() => onEditTrigger(trigger.id)}
                  >
                    <Edit2 size={16} /> Editar
                  </button>

                  <button
                    className="danger-button compact-button"
                    style={{ padding: '0 14px', display: 'flex', alignItems: 'center', background: 'rgba(239, 68, 68, 0.05)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                    onClick={() => onRemoveTrigger(trigger.id)}
                    title="Eliminar evento"
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

export default TriggerListTable