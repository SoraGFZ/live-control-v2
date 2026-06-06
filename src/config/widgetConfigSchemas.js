/**
 * Campos de configuracion por widget (paridad con paneles TikControl).
 * type: number | text | color | boolean | select
 */
export const WIDGET_CONFIG_SCHEMAS = {
  timer: {
    label: 'Timer',
    fields: [
      { key: 'fontSize', label: 'Tamano texto', type: 'number', min: 24, max: 200 },
      { key: 'textColor', label: 'Color texto', type: 'color' },
      { key: 'showLabels', label: 'Mostrar etiquetas', type: 'boolean' },
      { key: 'showDays', label: 'Mostrar dias', type: 'boolean' },
      { key: 'duration', label: 'Duracion (segundos)', type: 'number', min: 10, max: 86400 },
    ],
    timerControls: true,
  },
  'gift-alert': {
    label: 'Gift Alert',
    fields: [
      { key: 'minCoins', label: 'Monedas minimas', type: 'number', min: 0 },
      { key: 'durationMs', label: 'Duracion alerta (ms)', type: 'number', min: 1000 },
      { key: 'showGiftPicture', label: 'Mostrar imagen regalo', type: 'boolean' },
    ],
  },
  'gift-battle': {
    label: 'Gift Battle',
    fields: [
      { key: 'teamAName', label: 'Equipo A', type: 'text' },
      { key: 'teamBName', label: 'Equipo B', type: 'text' },
      { key: 'enabled', label: 'Activo', type: 'boolean' },
    ],
  },
  'battle-pk': {
    label: 'Battle PK',
    fields: [
      { key: 'widgetType', label: 'Tipo', type: 'select', options: ['full', 'score-only'] },
      { key: 'transparentBg', label: 'Fondo transparente', type: 'boolean' },
      { key: 'hidePoints', label: 'Ocultar puntos', type: 'boolean' },
      { key: 'textColor', label: 'Color texto', type: 'color' },
    ],
  },
  winlife: {
    label: 'Win / Life',
    fields: [
      { key: 'wins', label: 'Victorias', type: 'number', min: 0 },
      { key: 'lives', label: 'Vidas', type: 'number', min: 0 },
      { key: 'maxLives', label: 'Vidas max', type: 'number', min: 1 },
    ],
  },
  chat: {
    label: 'Chat overlay',
    fields: [
      { key: 'maxMessages', label: 'Mensajes visibles', type: 'number', min: 3, max: 50 },
      { key: 'fontSize', label: 'Tamano fuente', type: 'number', min: 12, max: 36 },
      { key: 'showAvatars', label: 'Avatares', type: 'boolean' },
      { key: 'showBadges', label: 'Badges', type: 'boolean' },
    ],
  },
  'top-likes': {
    label: 'Top Likes',
    fields: [
      { key: 'title', label: 'Titulo', type: 'text' },
      { key: 'rows', label: 'Filas', type: 'number', min: 3, max: 20 },
      { key: 'showAvatars', label: 'Avatares', type: 'boolean' },
    ],
  },
  'top-donors': {
    label: 'Top Gifts',
    fields: [
      { key: 'title', label: 'Titulo', type: 'text' },
      { key: 'rows', label: 'Filas', type: 'number', min: 3, max: 20 },
      { key: 'showAvatars', label: 'Avatares', type: 'boolean' },
    ],
  },
  'top-gift': {
    label: 'Top Gift',
    fields: [
      { key: 'title', label: 'Titulo', type: 'text' },
      { key: 'showBg', label: 'Fondo tarjeta', type: 'boolean' },
      { key: 'giftSize', label: 'Tamano imagen', type: 'number', min: 48, max: 140 },
      { key: 'showGiftName', label: 'Nombre regalo', type: 'boolean' },
      { key: 'showNickname', label: 'Nickname', type: 'boolean' },
    ],
  },
  'event-notification': {
    label: 'Event Notification',
    fields: [
      { key: 'showFollow', label: 'Follows', type: 'boolean' },
      { key: 'showGift', label: 'Regalos', type: 'boolean' },
      { key: 'showShare', label: 'Shares', type: 'boolean' },
      { key: 'enabled', label: 'Activo', type: 'boolean' },
    ],
  },
  'gift-jar-premium': {
    label: 'Gift Jar Premium',
    fields: [
      { key: 'showGiftPictures', label: 'Imagenes regalo', type: 'boolean' },
      { key: 'enabled', label: 'Activo', type: 'boolean' },
    ],
  },
  ranks: {
    label: 'Ranks',
    fields: [
      { key: 'title', label: 'Titulo', type: 'text' },
      { key: 'enabled', label: 'Activo', type: 'boolean' },
    ],
  },
  roulette: {
    label: 'Ruleta',
    fields: [{ key: 'enabled', label: 'Activo', type: 'boolean' }],
  },
  poll: {
    label: 'Encuesta',
    fields: [
      { key: 'question', label: 'Pregunta', type: 'text' },
      { key: 'enabled', label: 'Activo', type: 'boolean' },
    ],
  },
  auction: {
    label: 'Subasta',
    auctionControls: true,
    fields: [
      { key: 'title', label: 'Titulo', type: 'text' },
      { key: 'durationSec', label: 'Duracion (seg)', type: 'number', min: 5, max: 3600 },
      { key: 'minCoins', label: 'Monedas minimas por gift', type: 'number', min: 1 },
      { key: 'visibleWinners', label: 'Ganadores visibles', type: 'number', min: 1, max: 3 },
      { key: 'showBg', label: 'Mostrar fondo', type: 'boolean' },
    ],
  },
}

export const GOAL_METRIC_EDITOR = [
  { id: 'likes', prefix: 'goallikes', label: 'Likes', defaultTarget: 5000 },
  { id: 'coins', prefix: 'goalcoins', label: 'Monedas', defaultTarget: 500 },
  { id: 'follows', prefix: 'goalfollows', label: 'Follows', defaultTarget: 100 },
  { id: 'gifts', prefix: 'goalgifts', label: 'Regalos', defaultTarget: 50 },
  { id: 'shares', prefix: 'goalshares', label: 'Shares', defaultTarget: 30 },
  { id: 'subscribers', prefix: 'goalsubscribers', label: 'Subs', defaultTarget: 10 },
]

export function getWidgetConfigSchema(widgetId) {
  if (widgetId === 'top-gifts') {
    return WIDGET_CONFIG_SCHEMAS['top-donors']
  }
  return WIDGET_CONFIG_SCHEMAS[widgetId] || null
}

export function widgetSupportsConfig(widgetId) {
  return Boolean(getWidgetConfigSchema(widgetId))
}