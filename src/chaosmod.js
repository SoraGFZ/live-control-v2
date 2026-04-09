const CATEGORY_LABELS = {
  player: 'Player',
  vehicle: 'Vehiculo',
  peds: 'Peds',
  screen: 'Pantalla',
  time: 'Tiempo',
  weather: 'Clima',
  misc: 'Misc',
  meta: 'Meta',
  unknown: 'Otro',
}

export const CHAOSMOD_EFFECTS_SOURCE_URL =
  'https://raw.githubusercontent.com/gta-chaos-mod/ChaosModV/master/ConfigApp/Effects.cs'

export function formatChaosModFallbackName(effectId) {
  return String(effectId || '')
    .trim()
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

export function inferChaosModCategory(effectId) {
  const normalizedId = String(effectId || '').trim().toLowerCase()

  if (!normalizedId) {
    return 'unknown'
  }

  if (normalizedId.startsWith('spawn_') || normalizedId.startsWith('tp_')) {
    return 'player'
  }

  if (normalizedId.startsWith('veh_')) {
    return 'vehicle'
  }

  if (normalizedId.startsWith('world_') || normalizedId.startsWith('cocktail_')) {
    return 'misc'
  }

  const [prefix] = normalizedId.split('_')

  return {
    player: 'player',
    peds: 'peds',
    vehs: 'vehicle',
    screen: 'screen',
    time: 'time',
    weather: 'weather',
    misc: 'misc',
    meta: 'meta',
    render: 'unknown',
  }[prefix] || 'unknown'
}

export function getChaosModCategoryLabel(category) {
  return CATEGORY_LABELS[String(category || '').toLowerCase()] || CATEGORY_LABELS.unknown
}

export function sortChaosModCatalog(catalog) {
  return [...catalog].sort((leftItem, rightItem) =>
    String(leftItem.name || '').localeCompare(String(rightItem.name || ''), undefined, {
      sensitivity: 'base',
    }),
  )
}

export function parseChaosModEffectsSource(sourceText) {
  const effectMap = new Map()
  const effectPattern =
    /\{\s*"([^"]+)",\s*new EffectInfo\("([^"]+)",\s*EffectCategory\.([A-Za-z]+)/g

  for (const match of String(sourceText || '').matchAll(effectPattern)) {
    const [, id, name, category] = match

    effectMap.set(id, {
      id,
      name,
      category: String(category || 'unknown').toLowerCase(),
      categoryLabel: getChaosModCategoryLabel(category),
      source: 'official',
    })
  }

  return effectMap
}

export function parseChaosModEffectsIni(effectsIniText) {
  const parsedLines = []

  for (const rawLine of String(effectsIniText || '').split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#') || line.startsWith(';') || !line.includes('=')) {
      continue
    }

    const [rawId, rawConfig] = line.split('=', 2)
    const effectId = rawId.trim()
    const [rawEnabled] = String(rawConfig || '').split(',', 2)

    parsedLines.push({
      id: effectId,
      enabled: String(rawEnabled || '').trim() !== '0',
    })
  }

  return parsedLines
}

export function buildChaosModCatalog(effectsIniText, sourceText = '') {
  const sourceEffects = parseChaosModEffectsSource(sourceText)

  return sortChaosModCatalog(
    parseChaosModEffectsIni(effectsIniText)
      .filter((entry) => entry.enabled)
      .map((entry) => {
        const sourceEffect = sourceEffects.get(entry.id)
        const category = sourceEffect?.category || inferChaosModCategory(entry.id)

        return {
          id: entry.id,
          name: sourceEffect?.name || formatChaosModFallbackName(entry.id),
          category,
          categoryLabel: getChaosModCategoryLabel(category),
          source: sourceEffect?.source || 'fallback',
        }
      }),
  )
}
