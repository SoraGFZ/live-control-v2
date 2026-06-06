import { buildOverlayUrl, getOutputMeta, resolveActionType } from '../live-control'
import { getTriggerAudienceSummary, getTriggerRuleSummary } from '../dashboardViewHelpers.js'

export const ACTION_SCOPE_PROFILE = 'profile'
export const ACTION_SCOPE_GLOBAL = 'global'

export const OVERLAY_SCREEN_COUNT = 10

export function getActionScope(action) {
  return action?.scope === ACTION_SCOPE_GLOBAL ? ACTION_SCOPE_GLOBAL : ACTION_SCOPE_PROFILE
}

export function filterByScope(items = [], scope = ACTION_SCOPE_PROFILE) {
  return items.filter((item) => getActionScope(item) === scope)
}

export function getActionScreenLabel(action, profile = {}) {
  const screen = action?.screen || action?.overlayScreen || profile?.defaultScreen || '1'
  return `Pantalla ${screen}`
}

export function getActionDurationLabel(action, profile = {}) {
  const seconds = Number(
    action?.duration
      ?? action?.durationSeconds
      ?? (Number(profile?.overlayDurationMs) ? Math.round(Number(profile.overlayDurationMs) / 1000) : 0)
      ?? 5,
  )

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '—'
  }

  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`
}

export function getActionOverlaySummary(action) {
  if (!action?.outputs?.length) {
    return '—'
  }

  const parts = []

  if (action.outputs.includes('overlayAlert')) {
    parts.push(action.overlayText ? `Alerta: ${truncate(action.overlayText, 28)}` : 'Alerta')
  }

  if (action.outputs.includes('overlayMedia')) {
    parts.push(action.mediaUrl ? 'Media' : 'Media vacía')
  }

  return parts.length ? parts.join(' · ') : '—'
}

export function getActionAudioSummary(action) {
  const parts = []

  if (action?.outputs?.includes('audio')) {
    parts.push('Audio')
  }

  if (action?.outputs?.includes('tts')) {
    parts.push('TTS')
  }

  return parts.length ? parts.join(' + ') : '—'
}

export function getActionIntegrationSummary(action) {
  const parts = []

  if (action?.outputs?.includes('minecraft')) {
    parts.push('Minecraft')
  }

  if (action?.outputs?.includes('gta')) {
    parts.push(resolveActionType(action) === 'chaosmod' ? 'ChaosMod' : 'GTA')
  }

  if (action?.outputs?.includes('game')) {
    parts.push(action.gamingGameName || action.gamingGameId || 'Juego')
  }

  if (action?.outputs?.includes('obs')) {
    parts.push('OBS')
  }

  if (action?.outputs?.includes('webhook')) {
    parts.push('Webhook')
  }

  return parts.length ? parts.join(' · ') : '—'
}

export function getActionOutputTags(action) {
  return (action?.outputs || []).map((output) => getOutputMeta(output)?.label || output)
}

export function buildOverlayScreenUrl(baseUrl, slug, screenIndex, overlayKey = '') {
  const url = buildOverlayUrl(baseUrl, slug, overlayKey)

  try {
    const parsed = new URL(url, baseUrl || window.location.origin)
    parsed.searchParams.set('screen', String(screenIndex))
    return parsed.toString()
  } catch {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}screen=${screenIndex}`
  }
}

export function buildOverlayScreens(baseUrl, profile = {}) {
  const slug = profile?.overlaySlug || 'main-stage'
  const overlayKey = profile?.overlayKey || ''

  return Array.from({ length: OVERLAY_SCREEN_COUNT }, (_, index) => {
    const screen = index + 1
    return {
      screen,
      label: `Pantalla ${screen}`,
      url: buildOverlayScreenUrl(baseUrl, slug, screen, overlayKey),
    }
  })
}

export function getTriggerActive(trigger) {
  return trigger?.active !== false
}

export function getTriggerTypeLabel(trigger) {
  const source = trigger?.source || 'gift'
  const rule = getTriggerRuleSummary(trigger)

  const labels = {
    gift: 'Gift',
    emote: 'Emote',
    follow: 'Follow',
    comment: 'Comando',
    share: 'Share',
    'like-burst': 'Likes',
  }

  return `${labels[source] || source}: ${rule}`
}

export function getLinkedActionName(trigger, actions = []) {
  const linked = actions.find((action) => action.id === trigger?.actionId)
  return linked?.name || 'Sin acción'
}

export function summarizeTriggerRow(trigger, actions = []) {
  return {
    active: getTriggerActive(trigger),
    audience: getTriggerAudienceSummary(trigger),
    typeLabel: getTriggerTypeLabel(trigger),
    actionName: getLinkedActionName(trigger, actions),
    randomLabel: '—',
  }
}

function truncate(value, max = 40) {
  const text = String(value || '').trim()
  if (text.length <= max) {
    return text
  }

  return `${text.slice(0, max - 1)}…`
}