/**
 * Navegacion 1:1 con TikControl (header horizontal).
 */
export const STREAMING_NAV = [
  { type: 'item', id: 'home', label: 'Inicio', sectionId: 'overview' },
  {
    type: 'group',
    id: 'alerts',
    label: 'Alertas',
    items: [
      { sectionId: 'actions', label: 'Acciones' },
      { sectionId: 'sounds', label: 'Sonidos' },
      { sectionId: 'tts', label: 'TTS' },
    ],
  },
  {
    type: 'group',
    id: 'overlays',
    label: 'Overlays',
    items: [
      { sectionId: 'widgets-gallery', label: 'Galeria y previews' },
      { sectionId: 'overlay', label: 'Editor' },
      { sectionId: 'music', label: 'Spotify' },
      { sectionId: 'gifts-hub', label: 'Regalos' },
      { sectionId: 'goals', label: 'Metas' },
    ],
  },
  { type: 'item', id: 'community', label: 'Comunidad', sectionId: 'community' },
  { type: 'item', id: 'battles', label: 'Batallas', sectionId: 'battles' },
  { type: 'item', id: 'gaming', label: 'Gaming', sectionId: 'games' },
  { type: 'item', id: 'events', label: 'Eventos', sectionId: 'events' },
  { type: 'item', id: 'agencies', label: 'Agencias', sectionId: 'agencies' },
  {
    type: 'group',
    id: 'settings',
    label: 'Ajustes',
    items: [
      { sectionId: 'account', label: 'Cuenta' },
      { sectionId: 'bridges', label: 'Integraciones' },
      { sectionId: 'storage', label: 'Almacenamiento' },
      { sectionId: 'profiles', label: 'Perfiles' },
    ],
  },
  { type: 'item', id: 'support', label: 'Soporte', sectionId: 'support' },
  { type: 'item', id: 'live', label: 'Centro LIVE', sectionId: 'live-hub' },
]

export function sectionBelongsToNavGroup(group, sectionId) {
  if (group.type === 'item') {
    return group.sectionId === sectionId
  }
  return group.items?.some((item) => item.sectionId === sectionId)
}

export function findNavGroupForSection(sectionId) {
  return STREAMING_NAV.find((group) => sectionBelongsToNavGroup(group, sectionId)) || null
}