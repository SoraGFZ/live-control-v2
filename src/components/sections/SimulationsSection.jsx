import { useState } from 'react'
import {
  CURATED_GIFT_CATALOG,
  normalizeEmoteCatalogForPicker,
  normalizeGiftCatalogForPicker,
  normalizePickerText,
} from '../../dashboardViewHelpers'
import SectionHeader from '../common/SectionHeader'
import { Gift, Smile } from 'lucide-react'

function SimulationsSection({
  emoteCatalog,
  giftCatalog,
  onSampleEvent,
  title = 'Simular eventos',
  description = 'Estas pruebas entran por el backend y recorren la misma logica que un evento real del live.',
}) {
  const availableGiftCatalog = (giftCatalog.length ? giftCatalog : CURATED_GIFT_CATALOG).map(
    (gift, index) => normalizeGiftCatalogForPicker(gift, index),
  )
  const availableEmoteCatalog = Array.isArray(emoteCatalog)
    ? emoteCatalog.map((emote, index) => normalizeEmoteCatalogForPicker(emote, index))
    : []
  const [demoUser, setDemoUser] = useState('demo-live')
  const [likeCount, setLikeCount] = useState('100')
  const [commentText, setCommentText] = useState('!voz')
  const [giftSearch, setGiftSearch] = useState('')
  const [giftRepeatCount, setGiftRepeatCount] = useState('1')
  const [emoteSearch, setEmoteSearch] = useState('')
  const [selectedGiftId, setSelectedGiftId] = useState(() => availableGiftCatalog[0]?.id || '')
  const [selectedEmoteId, setSelectedEmoteId] = useState(() => availableEmoteCatalog[0]?.id || '')
  const filteredGiftCatalog = availableGiftCatalog.filter((gift) =>
    normalizePickerText(`${gift.name} ${gift.coins} ${gift.token}`).includes(
      normalizePickerText(giftSearch),
    ),
  )
  const selectedGift =
    filteredGiftCatalog.find((gift) => gift.id === selectedGiftId)
    || availableGiftCatalog.find((gift) => gift.id === selectedGiftId)
    || filteredGiftCatalog[0]
    || availableGiftCatalog[0]
    || null
  const filteredEmoteCatalog = availableEmoteCatalog.filter((emote) =>
    normalizePickerText(`${emote.name} ${emote.id} ${emote.token}`).includes(
      normalizePickerText(emoteSearch),
    ),
  )
  const selectedEmote =
    filteredEmoteCatalog.find((emote) => emote.id === selectedEmoteId)
    || availableEmoteCatalog.find((emote) => emote.id === selectedEmoteId)
    || filteredEmoteCatalog[0]
    || availableEmoteCatalog[0]
    || null

  return (
    <section className={title ? 'panel-section' : ''} id="simulations">
      {title ? (
        <SectionHeader eyebrow="Pruebas" title={title} description={description} />
      ) : description ? (
        <p className="muted-copy" style={{ margin: '0 0 12px' }}>
          {description}
        </p>
      ) : null}

      <div className="sim-grid">
        <article className="surface-card sim-card">
          <div className="card-top">
            <div>
              <h3>Disparar prueba</h3>
              <p>Ideal para revisar triggers, overlay y logs antes de salir en vivo.</p>
            </div>
            <span className="state-badge">Backend real</span>
          </div>

          <label className="field-label" htmlFor="sim-demo-user">
            Usuario de prueba
          </label>
          <input
            id="sim-demo-user"
            className="text-field"
            value={demoUser}
            onChange={(event) => setDemoUser(event.target.value)}
          />

          <div className="sim-button-grid">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onSampleEvent({
                  type: 'follow',
                  userName: demoUser || 'demo-follow',
                  isFollower: true,
                })
              }
            >
              Simular follow
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onSampleEvent({ type: 'share', userName: demoUser || 'demo-share' })}
            >
              Simular share
            </button>
          </div>

          <div className="sim-inline-fields">
            <input
              className="text-field"
              inputMode="numeric"
              value={likeCount}
              onChange={(event) => setLikeCount(event.target.value)}
              placeholder="100"
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onSampleEvent({
                  type: 'like-burst',
                  userName: demoUser || 'demo-likes',
                  likeCount: Number.parseInt(likeCount || '0', 10) || 0,
                })
              }
            >
              Simular likes
            </button>
          </div>

          <div className="sim-inline-fields">
            <input
              className="text-field"
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder="Ej: !voz"
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onSampleEvent({
                  type: 'comment',
                  userName: demoUser || 'demo-chat',
                  comment: commentText || '!voz',
                })
              }
            >
              Simular chat
            </button>
          </div>

          <div className="sim-gift-controls">
            <div className="sim-inline-fields">
              <input
                className="text-field"
                value={giftSearch}
                onChange={(event) => setGiftSearch(event.target.value)}
                placeholder="Buscar gift"
              />
              <input
                className="text-field sim-count-field"
                inputMode="numeric"
                value={giftRepeatCount}
                onChange={(event) => setGiftRepeatCount(event.target.value)}
                placeholder="x1"
              />
            </div>

            <div className="sim-gift-picker">
              {filteredGiftCatalog.length === 0 ? (
                <div className="sim-empty">No hay gifts que coincidan</div>
              ) : (
                filteredGiftCatalog.slice(0, 12).map((gift) => (
                  <button
                    key={gift.id}
                    type="button"
                    className={`sim-gift-item ${selectedGift?.id === gift.id ? 'selected' : ''}`}
                    onClick={() => setSelectedGiftId(gift.id)}
                    title={`${gift.name} - ${gift.coins} coins`}
                  >
                    {gift.imageUrl ? (
                      <img src={gift.imageUrl} alt={gift.name} className="sim-gift-thumb" />
                    ) : (
                      <div className="sim-gift-fallback">{gift.token || '🎁'}</div>
                    )}
                    <div className="sim-gift-info">
                      <strong>{gift.name}</strong>
                      <span>{gift.coins} 🪙</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              className="primary-button sim-action-btn"
              onClick={() =>
                onSampleEvent({
                  type: 'gift',
                  userName: demoUser || 'demo-gift',
                  giftId: selectedGift?.id || 'rose',
                  giftName: selectedGift?.name || 'Rose',
                  giftCoins: Number(selectedGift?.coins || 0),
                  repeatCount: Number.parseInt(giftRepeatCount || '1', 10) || 1,
                  displayText: selectedGift?.name || 'Rose',
                })
              }
            >
              🎁 Simular gift {giftRepeatCount > 1 ? `x${giftRepeatCount}` : ''}
            </button>
          </div>

          <div className="sim-gift-controls">
            <div className="sim-inline-fields">
              <input
                className="text-field"
                value={emoteSearch}
                onChange={(event) => setEmoteSearch(event.target.value)}
                placeholder="Buscar emote"
              />
            </div>

            <div className="sim-emote-picker">
              {filteredEmoteCatalog.length === 0 ? (
                <div className="sim-empty">No hay emotes que coincidan</div>
              ) : (
                filteredEmoteCatalog.slice(0, 12).map((emote) => (
                  <button
                    key={emote.id}
                    type="button"
                    className={`sim-emote-item ${selectedEmote?.id === emote.id ? 'selected' : ''}`}
                    onClick={() => setSelectedEmoteId(emote.id)}
                    title={emote.name}
                  >
                    {emote.imageUrl ? (
                      <img src={emote.imageUrl} alt={emote.name} className="sim-emote-thumb" />
                    ) : (
                      <div className="sim-emote-fallback">😊</div>
                    )}
                    <span className="sim-emote-name">{emote.name}</span>
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              className="primary-button sim-action-btn"
              onClick={() =>
                onSampleEvent({
                  type: 'emote',
                  userName: demoUser || 'demo-emote',
                  emoteId: selectedEmote?.id || 'demo-emote',
                  emoteName: selectedEmote?.name || 'Emote demo',
                  emoteImageUrl: selectedEmote?.imageUrl || '',
                  emotes: selectedEmote
                    ? [
                        {
                          id: selectedEmote.id,
                          name: selectedEmote.name,
                          imageUrl: selectedEmote.imageUrl || '',
                        },
                      ]
                    : [],
                })
              }
              disabled={!selectedEmote}
            >
              😊 Simular emote
            </button>
          </div>
        </article>

        <article className="surface-card sim-card">
          <div className="card-top">
            <div>
              <h3>Catalogo activo</h3>
              <p>Gifts y emotes reales que ya vio tu live y quedaron guardados en el panel.</p>
            </div>
            <div className="tag-row">
              <span className="bridge-badge">
                {availableGiftCatalog.length} regalo{availableGiftCatalog.length === 1 ? '' : 's'}
              </span>
              <span className="bridge-badge">
                {availableEmoteCatalog.length} emote{availableEmoteCatalog.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {selectedGift ? (
            <div className="sim-gift-preview">
              {selectedGift.imageUrl ? (
                <img src={selectedGift.imageUrl} alt={selectedGift.name} className="gift-picker-image" />
              ) : (
                <span className="gift-picker-thumb" style={{ '--picker-accent': selectedGift.accent }}>
                  {selectedGift.token}
                </span>
              )}
              <div>
                <strong>{selectedGift.name}</strong>
                <p>
                  {selectedGift.coins} coin{selectedGift.coins === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          ) : (
            <div className="empty-state-card">
              <Gift className="empty-state-icon" size={32} />
              <h4>Sin actividad local</h4>
              <p>Todavía no hay regalos registrados.</p>
            </div>
          )}

          {selectedEmote ? (
            <div className="sim-gift-preview">
              {selectedEmote.imageUrl ? (
                <img
                  src={selectedEmote.imageUrl}
                  alt={selectedEmote.name}
                  className="gift-picker-image"
                />
              ) : (
                <span className="gift-picker-thumb" style={{ '--picker-accent': selectedEmote.accent }}>
                  {selectedEmote.token}
                </span>
              )}
              <div>
                <strong>{selectedEmote.name}</strong>
                <p>{selectedEmote.id}</p>
              </div>
            </div>
          ) : (
            <div className="empty-state-card">
              <Smile className="empty-state-icon" size={32} />
              <h4>Bandeja en espera</h4>
              <p>Todavía no vimos emotes en el live. Se sumarán aquí cuando lleguen.</p>
            </div>
          )}

          <div className="sim-note-list">
            <div className="sim-note-item">
              <strong>Follow y share</strong>
              <span>Sirven para verificar si la acción entra, hace match y se despacha correctamente.</span>
            </div>
            <div className="sim-note-item">
              <strong>Likes</strong>
              <span>Respeta reglas por cantidad, por ejemplo `100 likes`.</span>
            </div>
            <div className="sim-note-item">
              <strong>Chat</strong>
              <span>Perfecto para probar comandos como `!voz` o `!chaos`.</span>
            </div>
            <div className="sim-note-item">
              <strong>Gift</strong>
              <span>Usa el mismo nombre que luego llega desde TikTok.</span>
            </div>
            <div className="sim-note-item">
              <strong>Emote</strong>
              <span>Puede venir del live o de tu biblioteca local para configurarlo offline.</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}

export default SimulationsSection
