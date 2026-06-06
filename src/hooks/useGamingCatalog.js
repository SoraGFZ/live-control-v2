import { useCallback, useEffect, useState } from 'react'

export function useGamingCatalog({ enabled = true } = {}) {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/gaming/catalog')
      const payload = await response.json()

      if (payload?.ok && Array.isArray(payload.games)) {
        setGames(payload.games)
      } else {
        setGames([])
        setError(payload?.error || 'No se pudo cargar la biblioteca de juegos.')
      }
    } catch (fetchError) {
      setGames([])
      setError(fetchError?.message || 'Error de red al cargar juegos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    void reload()
    return undefined
  }, [enabled, reload])

  return { games, loading, error, reload }
}