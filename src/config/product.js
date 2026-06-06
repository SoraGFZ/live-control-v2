import packageJson from '../../package.json'

export const PRODUCT = {
  name: 'Live Control Studio',
  shortName: 'Live Control',
  edition: 'Founder Edition (local)',
  version: packageJson.version,
  tagline: 'Automatiza tu TikTok LIVE como un estudio profesional.',
  description:
    'Overlays interactivos, acciones por gifts, musica, juegos y TTS en un panel unificado para creadores.',
  company: 'Live Control',
  supportEmail: 'support@livecontrol.app',
  websiteUrl: 'https://livecontrol.app',
  license: {
    tier: 'creator-preview',
    label: 'Licencia Creator (preview)',
    seats: 1,
  },
}

/** Grupos legacy; navegacion principal = STREAMING_NAV (TikControl). */
export const WORKSPACE_NAV_GROUPS = [
  { id: 'home', label: 'Inicio', sectionIds: ['overview', 'live-hub'] },
  { id: 'alerts', label: 'Alertas', sectionIds: ['actions', 'sounds', 'tts'] },
  {
    id: 'overlays',
    label: 'Overlays',
    sectionIds: ['widgets-gallery', 'overlay', 'music', 'gifts-hub', 'goals'],
  },
  { id: 'gaming', label: 'Gaming', sectionIds: ['games'] },
  { id: 'settings', label: 'Ajustes', sectionIds: ['account', 'bridges', 'storage', 'profiles'] },
  { id: 'live', label: 'TikTok', sectionIds: ['live-ops'] },
]