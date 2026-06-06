/**
 * Catalogo de widgets/overlays de TikControl (base visual + URLs para OBS).
 * status: live = React nativo | reference = HTML TikControl con bridge local | catalog = sin archivo
 */
export const WIDGET_CATEGORIES = [
  { id: 'all', label: 'Todos' },
  { id: 'rankings', label: 'Rankings y metas' },
  { id: 'gifts', label: 'Regalos y alertas' },
  { id: 'chat', label: 'Chat y comunidad' },
  { id: 'games', label: 'Gaming HUD' },
  { id: 'effects', label: 'Efectos y animacion' },
  { id: 'utility', label: 'Utilidad' },
  { id: 'goals', label: 'Metas (goals)' },
]

export const TIKCONTROL_GOALS = [
  { id: 'goals-likes', name: 'Meta de likes', file: 'goals-likes.html', metric: 'likes' },
  { id: 'goals-coins', name: 'Meta de monedas', file: 'goals-coins.html', metric: 'coins' },
  { id: 'goals-gifts', name: 'Meta de regalos', file: 'goals-gifts.html', metric: 'gifts' },
  { id: 'goals-follows', name: 'Meta de follows', file: 'goals-follows.html', metric: 'follows' },
  { id: 'goals-shares', name: 'Meta de shares', file: 'goals-shares.html', metric: 'shares' },
  { id: 'goals-subscribers', name: 'Meta de subs', file: 'goals-subscribers.html', metric: 'subscribers' },
  { id: 'goals-rotation', name: 'Rotacion de metas', file: 'goals-rotation.html', metric: 'rotation' },
]

function withReferenceStatus(widget) {
  if (widget.status === 'live' || !widget.tikcontrolFile) {
    return widget
  }

  return {
    ...widget,
    status: 'reference',
  }
}

const RAW_WIDGETS = [
  {
    id: 'top-likes',
    name: 'Top Likes',
    category: 'rankings',
    tikcontrolFile: 'top-likes.html',
    metric: 'likes',
    description: 'Ranking de likes en vivo — acabado Live Control (rosa/coral, filas glass).',
    status: 'reference',
    featured: true,
  },
  {
    id: 'top-gifts',
    name: 'Top Gifts',
    category: 'rankings',
    tikcontrolFile: 'top-donors.html',
    metric: 'coins',
    description: 'Ranking de donadores por monedas — motor TikControl con acabado Live Control (dorado).',
    status: 'reference',
    featured: true,
  },
  {
    id: 'top-gift',
    name: 'Top Gift',
    category: 'gifts',
    tikcontrolFile: 'top-gift.html',
    metric: 'gift',
    description: 'Mayor regalo de la sesion — tarjeta dorada Live Control (misma logica TikControl).',
    status: 'reference',
  },
  {
    id: 'top-comments',
    name: 'Top Comentarios',
    category: 'chat',
    tikcontrolFile: 'top-comments.html',
    description: 'Usuarios mas activos en el chat.',
    status: 'reference',
  },
  {
    id: 'top-combo',
    name: 'Top Combo',
    category: 'gifts',
    tikcontrolFile: 'top-combo.html',
    description: 'Mejor combo de regalos.',
    status: 'reference',
  },
  {
    id: 'top-points',
    name: 'Top Puntos',
    category: 'rankings',
    tikcontrolFile: 'top-points.html',
    description: 'Ranking por puntos de comunidad.',
    status: 'reference',
  },
  {
    id: 'top-rotation',
    name: 'Top Rotacion',
    category: 'rankings',
    tikcontrolFile: 'top-rotation.html',
    description: 'Rota entre varios rankings en pantalla.',
    status: 'reference',
  },
  {
    id: 'smart-bar',
    name: 'Smart Bar',
    category: 'rankings',
    liveRoute: 'smart-bar',
    metric: 'wins',
    description: 'Barra de victorias / metas del directo.',
    status: 'live',
  },
  {
    id: 'song-request',
    name: 'Song Request',
    category: 'utility',
    liveRoute: 'song-request',
    description: 'Cola de canciones Spotify visible en overlay.',
    status: 'live',
  },
  {
    id: 'overlay-main',
    name: 'Overlay principal',
    category: 'effects',
    tikcontrolFile: 'overlay-preview.html',
    liveRoute: 'overlay',
    description: 'Pantalla de alertas y eventos generales.',
    status: 'live',
  },
  {
    id: 'chat',
    name: 'Chat overlay',
    category: 'chat',
    tikcontrolFile: 'chat.html',
    description: 'Chat del live en pantalla.',
    status: 'reference',
  },
  {
    id: 'gift-alert',
    name: 'Gift Alert',
    category: 'gifts',
    tikcontrolFile: 'gift-alert.html',
    description: 'Alerta animada por regalo.',
    status: 'reference',
  },
  {
    id: 'gift-gallery',
    name: 'Gift Gallery',
    category: 'gifts',
    tikcontrolFile: 'gift-gallery.html',
    description: 'Galeria de regalos recibidos en el live.',
    status: 'reference',
  },

  {
    id: 'gift-cannon',
    name: 'Gift Cannon',
    category: 'gifts',
    tikcontrolFile: 'gift-cannon.html',
    description: 'Canon de regalos en pantalla.',
    status: 'reference',
  },
  {
    id: 'gift-jar',
    name: 'Gift Jar',
    category: 'gifts',
    tikcontrolFile: 'gift-jar.html',
    description: 'Frasco que se llena con regalos.',
    status: 'reference',
  },
  {
    id: 'gift-jar-premium',
    name: 'Gift Jar Premium',
    category: 'gifts',
    tikcontrolFile: 'gift-jar-premium.html',
    description: 'Frasco premium con marcos animados (TikControl).',
    status: 'reference',
    featured: true,
  },
  {
    id: 'event-notification',
    name: 'Event Notification',
    category: 'utility',
    tikcontrolFile: 'event-notification.html',
    description: 'Notificaciones de follow, gift, share y eventos especiales.',
    status: 'reference',
    featured: true,
  },
  {
    id: 'level-up',
    name: 'Level Up',
    category: 'effects',
    tikcontrolFile: 'level-up.html',
    description: 'Subida de nivel de viewers.',
    status: 'reference',
  },
  {
    id: 'like-fountain',
    name: 'Like Fountain',
    category: 'effects',
    tikcontrolFile: 'like-fountain.html',
    description: 'Fuentes de likes animadas.',
    status: 'reference',
  },
  {
    id: 'firework',
    name: 'Firework',
    category: 'effects',
    tikcontrolFile: 'firework.html',
    description: 'Fuegos artificiales por eventos.',
    status: 'reference',
  },
  {
    id: 'firework-v2',
    name: 'Firework V2',
    category: 'effects',
    tikcontrolFile: 'firework-v2.html',
    status: 'reference',
  },
  {
    id: 'firework-premium',
    name: 'Firework Premium',
    category: 'effects',
    tikcontrolFile: 'firework-premium.html',
    status: 'reference',
  },
  {
    id: 'animation',
    name: 'Animacion',
    category: 'effects',
    tikcontrolFile: 'animation.html',
    description: 'Animaciones genericas por evento del live.',
    status: 'reference',
  },
  {
    id: 'widget-demo',
    name: 'Widget demo',
    category: 'utility',
    tikcontrolFile: 'widget-demo.html',
    description: 'Vista previa de estilos TikControl.',
    status: 'reference',
  },
  {
    id: 'timer',
    name: 'Timer',
    category: 'utility',
    tikcontrolFile: 'timer.html',
    description: 'Cuenta regresiva para retos.',
    status: 'reference',
  },
  {
    id: 'roulette',
    name: 'Roulette',
    category: 'utility',
    tikcontrolFile: 'roulette.html',
    status: 'reference',
  },
  {
    id: 'poll',
    name: 'Poll',
    category: 'utility',
    tikcontrolFile: 'poll.html',
    status: 'reference',
  },
  {
    id: 'pinned-message',
    name: 'Mensaje fijado',
    category: 'chat',
    tikcontrolFile: 'pinned-message.html',
    status: 'reference',
  },
  {
    id: 'social-media-rotator',
    name: 'Redes sociales',
    category: 'utility',
    tikcontrolFile: 'social-media-rotator.html',
    status: 'reference',
  },
  {
    id: 'ranks',
    name: 'Ranks',
    category: 'rankings',
    tikcontrolFile: 'ranks.html',
    status: 'reference',
  },
  {
    id: 'mvp',
    name: 'MVP',
    category: 'rankings',
    tikcontrolFile: 'mvp.html',
    status: 'reference',
  },
  {
    id: 'winlife',
    name: 'Win / Life',
    category: 'games',
    tikcontrolFile: 'winlife.html',
    description: 'Contador wins vs vidas para retos.',
    status: 'reference',
  },
  {
    id: 'gaming-hud',
    name: 'Gaming HUD',
    category: 'games',
    tikcontrolFile: 'gaming-hud.html',
    status: 'reference',
  },

  {
    id: 'auction',
    name: 'Subasta',
    category: 'utility',
    tikcontrolFile: 'auction.html',
    status: 'reference',
  },
  {
    id: 'roblox-climb-hud',
    name: 'Roblox Climb HUD',
    category: 'games',
    tikcontrolFile: 'roblox-climb-hud.html',
    status: 'reference',
  },
  {
    id: 'battle-overlay',
    name: 'Battle Overlay',
    category: 'effects',
    tikcontrolFile: 'battle-overlay.html',
    description: 'Overlay de batallas TikTok (premium).',
    status: 'reference',
  },
  {
    id: 'battle-pk',
    name: 'Battle PK',
    category: 'effects',
    tikcontrolFile: 'battle-pk.html',
    description: 'Marcador PK en batallas.',
    status: 'reference',
  },
  {
    id: 'battle-scoreboard',
    name: 'Battle Scoreboard',
    category: 'rankings',
    tikcontrolFile: 'battle-scoreboard.html',
    description: 'Tablero de puntos en batalla.',
    status: 'reference',
  },
  {
    id: 'battle-gifts',
    name: 'Battle Gifts',
    category: 'gifts',
    tikcontrolFile: 'battle-gifts.html',
    description: 'Regalos destacados en batalla.',
    status: 'reference',
  },
  {
    id: 'battle-alerts',
    name: 'Battle Alerts',
    category: 'gifts',
    tikcontrolFile: 'battle-alerts.html',
    description: 'Alertas de batalla en overlay.',
    status: 'reference',
  },
  {
    id: 'gift-battle',
    name: 'Gift Battle',
    category: 'gifts',
    tikcontrolFile: 'gift-battle.html',
    description: 'Duelo de regalos entre equipos.',
    status: 'reference',
  },
  {
    id: 'level_up',
    name: 'Level Up (alt)',
    category: 'effects',
    tikcontrolFile: 'level_up.html',
    description: 'Variante level up TikControl.',
    status: 'reference',
  },
]

export const TIKCONTROL_WIDGETS = RAW_WIDGETS.map(withReferenceStatus)

export function buildTikcontrolWidgetUrl(widgetOrFile, { baseUrl, overlayKey = '' } = {}) {
  const fileName =
    typeof widgetOrFile === 'string'
      ? widgetOrFile
      : widgetOrFile?.tikcontrolFile || `${widgetOrFile?.id || ''}.html`

  if (!fileName || !fileName.endsWith('.html')) {
    return ''
  }

  const normalizedBase = String(baseUrl || '').replace(/\/$/, '')
  const params = new URLSearchParams()

  if (overlayKey) {
    params.set('key', overlayKey)
  }

  params.set('uid', 'live-control')
  const query = params.toString()
  const path = `/widgets/${fileName}${query ? `?${query}` : ''}`

  return normalizedBase ? `${normalizedBase}${path}` : path
}

export function buildGoalOverlayUrl(goal, { baseUrl, overlayKey = '' } = {}) {
  if (!goal?.file) {
    return ''
  }

  const normalizedBase = String(baseUrl || '').replace(/\/$/, '')
  const params = new URLSearchParams()

  if (overlayKey) {
    params.set('key', overlayKey)
  }

  params.set('uid', 'live-control')
  const query = params.toString()
  const path = `/goals/${goal.file}${query ? `?${query}` : ''}`

  return normalizedBase ? `${normalizedBase}${path}` : path
}

export function buildWidgetOverlayUrl(widget, { slug, baseUrl, overlayKey = '' }) {
  if (!slug) {
    return ''
  }

  if (widget?.tikcontrolFile && widget.status === 'reference') {
    return buildTikcontrolWidgetUrl(widget, { baseUrl, overlayKey })
  }

  if (!widget?.liveRoute) {
    return ''
  }

  const normalizedBase = String(baseUrl || '').replace(/\/$/, '')
  const params = new URLSearchParams()

  if (overlayKey) {
    params.set('key', overlayKey)
  }

  const query = params.toString() ? `?${params.toString()}` : ''
  const path =
    widget.liveRoute === 'overlay'
      ? `/overlay/${encodeURIComponent(slug)}${query}`
      : `/${widget.liveRoute}/${encodeURIComponent(slug)}${query}`

  return normalizedBase ? `${normalizedBase}${path}` : path
}

export function getWidgetsByCategory(categoryId) {
  if (!categoryId || categoryId === 'all') {
    return TIKCONTROL_WIDGETS
  }

  if (categoryId === 'goals') {
    return []
  }

  return TIKCONTROL_WIDGETS.filter((widget) => widget.category === categoryId)
}

export function countWidgetsByStatus() {
  return TIKCONTROL_WIDGETS.reduce(
    (counts, widget) => {
      counts[widget.status] = (counts[widget.status] || 0) + 1
      return counts
    },
    { live: 0, reference: 0, catalog: 0 },
  )
}