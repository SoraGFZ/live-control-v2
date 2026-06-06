import { useState } from 'react'

import { getEmoteSourceLabel, normalizeEmoteCatalogForPicker, normalizePickerText } from '../../dashboardViewHelpers'
import SectionHeader from '../common/SectionHeader'
import { SmilePlus } from 'lucide-react'

function EmoteLibrarySection({ emoteCatalog, onCreateEmote, onEditEmote, onRemoveEmote }) {
  return (
    <section className="panel-section" id="emotes">
      <SectionHeader
        eyebrow="Biblioteca de emotes"
        title="Emotes"
        description="Aqui guardas los emotes que ya viste y tambien los que quieras cargar a mano para trabajar offline."
        action={
          <button className="primary-button" onClick={onCreateEmote}>
            Agregar emote
          </button>
        }
      />

      <EmoteListTable
        emoteCatalog={emoteCatalog}
        onEditEmote={onEditEmote}
        onRemoveEmote={onRemoveEmote}
      />
    </section>
  )
}

function EmoteListTable({ emoteCatalog, onEditEmote, onRemoveEmote }) {
  const [searchQuery, setSearchQuery] = useState('')
  const normalizedEmoteCatalog = Array.isArray(emoteCatalog)
    ? emoteCatalog.map((emote, index) => normalizeEmoteCatalogForPicker(emote, index))
    : []
  const filteredEmotes = normalizedEmoteCatalog.filter((emote) =>
    normalizePickerText(`${emote.name} ${emote.id} ${emote.source}`).includes(
      normalizePickerText(searchQuery),
    ),
  )

  return (
    <div className="list-shell">
      <div className="list-toolbar">
        <input
          className="text-field list-search"
          placeholder="Buscar emotes..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <span className="muted-pill">
          {filteredEmotes.length} emote{filteredEmotes.length === 1 ? '' : 's'}
        </span>
      </div>

      {filteredEmotes.length === 0 ? (
        <div className="empty-state-card">
          <SmilePlus className="empty-state-icon" size={36} />
          <h4>Sin Emotes Registrados</h4>
          <p>Tu biblioteca está vacía. Añade tu primer emote de la lista.</p>
        </div>
      ) : (
        <>
          <div className="dense-table-head emotes-layout">
            <div>Emote</div>
            <div>Origen</div>
            <div>ID</div>
            <div />
          </div>

          <div className="dense-table">
            {filteredEmotes.map((emote) => (
              <article key={emote.id} className="dense-table-row emotes-layout">
                <div className="dense-cell" data-label="Emote">
                  <span className="gift-inline-pill">
                    {emote.imageUrl ? (
                      <img src={emote.imageUrl} alt={emote.name} className="gift-inline-image" />
                    ) : (
                      <span className="gift-inline-token" style={{ '--picker-accent': emote.accent }}>
                        {emote.token}
                      </span>
                    )}
                    <span>{emote.name}</span>
                  </span>
                </div>
                <div className="dense-cell" data-label="Origen">
                  <span className="bridge-badge">{getEmoteSourceLabel(emote.source)}</span>
                </div>
                <div className="dense-cell" data-label="ID">
                  <code className="dense-code">{emote.id}</code>
                </div>
                <div className="dense-cell" data-label="Acciones">
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() => onEditEmote(emote.id)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() => onRemoveEmote(emote.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default EmoteLibrarySection
