/**
 * Límites TikControl — en Live Control Studio el tier efectivo es siempre PREMIUM
 * (Spotify sigue usando el token/plan del usuario, no este módulo).
 */
export const BASIC_WIDGETS = Object.freeze([
  'top-likes',
  'top-donors',
  'top-gift',
  'top-combo',
  'top-points',
  'like-fountain',
  'gift-cannon',
  'firework',
  'social-media-rotator',
])

export const PREMIUM_BLOCKED_ON_FREE = Object.freeze([
  'gift-alert',
  'level_up',
  'level-up',
  'gift-battle',
  'top-comments',
  'winlife',
  'auction',
  'ranks',
  'roulette',
  'gift-gallery',
])

export const LIMITS = Object.freeze({
  FREE: {
    actions: 5,
    events: 5,
    sounds: 5,
    profiles: 1,
    storageMB: 100,
    ttsVoicesPerLanguage: 1,
    gameCommands: 5,
    gamingCommands: 5,
    soundsRandomDisabled: true,
    ttsMultipleSelectionDisabled: true,
    ttsFilterWordsDisabled: true,
    overlayEditorDisabled: true,
    overlayDisabled: true,
    blockedWidgets: PREMIUM_BLOCKED_ON_FREE,
    allowedWidgets: BASIC_WIDGETS,
    spotifyDisabled: true,
    communityDisabled: true,
    battleHubDisabled: true,
    gamingLibraryDisabled: false,
    gamingOverlayDisabled: true,
    onelinkDisabled: true,
    streamdeckDisabled: true,
    obsDisabled: true,
    streamerbotDisabled: true,
    minecraftIntegrationDisabled: true,
  },
  PREMIUM: {
    actions: Infinity,
    events: Infinity,
    sounds: Infinity,
    profiles: Infinity,
    storageMB: 5120,
    ttsVoicesPerLanguage: Infinity,
    gameCommands: Infinity,
    gamingCommands: Infinity,
    soundsRandomDisabled: false,
    ttsMultipleSelectionDisabled: false,
    ttsFilterWordsDisabled: false,
    overlayEditorDisabled: false,
    overlayDisabled: false,
    blockedWidgets: [],
    allowedWidgets: null,
    spotifyDisabled: false,
    communityDisabled: false,
    battleHubDisabled: false,
    gamingLibraryDisabled: false,
    gamingOverlayDisabled: false,
    onelinkDisabled: false,
    streamdeckDisabled: false,
    obsDisabled: false,
    streamerbotDisabled: false,
    minecraftIntegrationDisabled: false,
  },
})

const LIVE_CONTROL_PLAN = 'premium_internal'

export function getCurrentPlan() {
  return LIVE_CONTROL_PLAN
}

export function isPremium() {
  return true
}

export function isPerformance() {
  return false
}

export function isPaid() {
  return true
}

export function getTier() {
  return 'premium'
}

export function getLimits() {
  return LIMITS.PREMIUM
}

export function isWidgetAvailable(widgetId) {
  const limits = getLimits()
  const id = String(widgetId || '').trim()

  if (!id) {
    return true
  }

  if (limits.allowedWidgets === null) {
    return true
  }

  if (Array.isArray(limits.allowedWidgets)) {
    return limits.allowedWidgets.includes(id)
  }

  return !(limits.blockedWidgets || []).includes(id)
}

export function isLimitReached() {
  return false
}

export function canAdd() {
  return { allowed: true, limit: Infinity, message: '' }
}

export function filterByLimit(items) {
  return Array.isArray(items) ? items : []
}

export function showLimitMessage() {}

export function showUpgradeModal() {}

export function renderPremiumWall(container) {
  if (container) {
    const wall = container.querySelector(':scope > .tc-premium-wall')
    if (wall) {
      wall.remove()
    }
  }
  return null
}

export function removePremiumWall(container) {
  if (!container) {
    return
  }
  const wall = container.querySelector(':scope > .tc-premium-wall')
  if (wall) {
    wall.remove()
  }
}

export const PremiumLimitsApi = {
  LIMITS,
  BASIC_WIDGETS,
  PREMIUM_PLANS: [LIVE_CONTROL_PLAN],
  getCurrentPlan,
  isPremium,
  isPerformance,
  isPaid,
  getTier,
  getLimits,
  isWidgetAvailable,
  isLimitReached,
  canAdd,
  filterByLimit,
  showLimitMessage,
  showUpgradeModal,
  renderPremiumWall,
  removePremiumWall,
}

export function installPremiumLimits(target = globalThis) {
  if (!target || typeof target !== 'object') {
    return PremiumLimitsApi
  }

  target.PremiumLimits = PremiumLimitsApi
  target.premiumManager = {
    getCurrentPlan,
    showPurchase: showUpgradeModal,
  }
  target.subscriptionManager = {
    getCurrentPlan,
    openModal: showUpgradeModal,
  }

  try {
    target.dispatchEvent?.(new CustomEvent('user:plan-changed'))
    target.dispatchEvent?.(new CustomEvent('premium:plan-updated'))
  } catch {
    // ignore in non-DOM environments
  }

  return PremiumLimitsApi
}