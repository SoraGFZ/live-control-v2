import { useCallback, useEffect, useRef, useState } from 'react'
import { Heart, Play, Search, Sparkles, Volume2 } from 'lucide-react'
import TikControlModuleShell from './TikControlModuleShell'

function SoundsSection({ onJump }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [popular, setPopular] = useState([])
  const [favorites, setFavorites] = useState([])
  const [feedback, setFeedback] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const audioRef = useRef(null)

  const loadLibrary = useCallback(async () => {
    try {
      const response = await fetch('/api/sounds/library')
      const payload = await response.json()
      const rows = [
        ...(payload.myinstants?.popular || []),
        ...(payload.myinstants?.tiktok_trends || []),
      ].map((item, index) => ({
        id: `pop-${index}`,
        title: item.title || item.name || 'Sonido',
        url: item.url,
      }))
      setPopular(rows)
      setFavorites(
        (payload.favorites || []).map((item, index) => ({
          id: item.id || `fav-${index}`,
          title: item.title || item.name || 'Favorito',
          url: item.url,
        })),
      )
    } catch {
      setPopular([])
    }
  }, [])

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  async function runSearch(searchTerm = query) {
    const needle = String(searchTerm || '').trim()
    setIsSearching(true)
    setFeedback('')

    try {
      const response = await fetch(
        `/api/sounds/search?q=${encodeURIComponent(needle)}`,
      )
      const payload = await response.json()
      const rows = (payload.results || []).map((item, index) => ({
        id: String(item.id || `sound-${index}`),
        title: item.title || item.name || 'Sonido',
        url: item.url,
      }))
      setResults(rows)
      if (!rows.length) {
        setFeedback(needle ? 'Sin resultados. Prueba otra palabra.' : 'Escribe para buscar en MyInstants.')
      }
    } catch (error) {
      setResults([])
      setFeedback(error.message || 'Error buscando sonidos.')
    } finally {
      setIsSearching(false)
    }
  }

  async function playSound(url) {
    if (!url) {
      return
    }

    try {
      const cached = await fetch(`/api/sounds/cached?url=${encodeURIComponent(url)}`)
      const payload = await cached.json()
      const playUrl = payload.url || url

      if (!audioRef.current) {
        audioRef.current = new Audio()
      }

      audioRef.current.src = playUrl
      await audioRef.current.play()
    } catch {
      setFeedback('No se pudo reproducir este sonido.')
    }
  }

  async function toggleFavorite(sound) {
    const isFavorite = favorites.some((item) => item.url === sound.url)

    try {
      if (isFavorite) {
        await fetch(`/api/sounds/favorites?url=${encodeURIComponent(sound.url)}`, {
          method: 'DELETE',
        })
      } else {
        await fetch('/api/sounds/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sound),
        })
      }
      await loadLibrary()
    } catch {
      setFeedback('No se pudo actualizar favoritos.')
    }
  }

  function renderSoundCard(sound) {
    const isFavorite = favorites.some((item) => item.url === sound.url)

    return (
      <article key={`${sound.id}-${sound.url}`} className="tc-sound-card">
        <Volume2 size={18} strokeWidth={2} color="#c4b5fd" />
        <strong>{sound.title}</strong>
        <div className="tc-sound-card-actions">
          <button
            type="button"
            className="primary-button compact-button"
            onClick={() => playSound(sound.url)}
          >
            <Play size={14} />
            Escuchar
          </button>
          <button
            type="button"
            className={isFavorite ? 'secondary-button compact-button' : 'ghost-button compact-button'}
            onClick={() => toggleFavorite(sound)}
          >
            <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
            {isFavorite ? 'Guardado' : 'Favorito'}
          </button>
        </div>
      </article>
    )
  }

  const displayList = query.trim() ? results : [...favorites, ...popular]

  return (
    <TikControlModuleShell sectionId="sounds" onJump={onJump}>
      <article className="tc-premium-hero">
        <span className="tc-premium-badge">
          <Sparkles size={12} />
          Premium · Sin limite
        </span>
        <h3>Biblioteca de sonidos TikControl</h3>
        <p>
          Busca efectos en MyInstants, guarda favoritos y usalos en acciones o widgets como Roulette.
          Todo ilimitado en Live Control Premium.
        </p>
      </article>

      <div className="picker-toolbar">
        <input
          className="text-field"
          placeholder="Buscar sonido (viral, applause, horn...)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              runSearch()
            }
          }}
        />
        <button
          type="button"
          className="primary-button compact-button"
          disabled={isSearching}
          onClick={() => runSearch()}
        >
          <Search size={14} />
          {isSearching ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {feedback ? <span className="feedback-pill">{feedback}</span> : null}

      {!query.trim() && favorites.length > 0 ? (
        <>
          <span className="snippet-label">Favoritos</span>
          <div className="tc-sound-grid">{favorites.map(renderSoundCard)}</div>
        </>
      ) : null}

      <span className="snippet-label">
        {query.trim() ? `Resultados (${results.length})` : 'Populares y tendencias'}
      </span>
      <div className="tc-sound-grid">
        {(query.trim() ? results : displayList).map(renderSoundCard)}
      </div>

      <div className="row-actions">
        <button type="button" className="secondary-button" onClick={() => onJump('actions')}>
          Vincular a acciones
        </button>
        <button type="button" className="ghost-button" onClick={() => onJump('overlay')}>
          Subir MP3 propio
        </button>
      </div>
    </TikControlModuleShell>
  )
}

export default SoundsSection