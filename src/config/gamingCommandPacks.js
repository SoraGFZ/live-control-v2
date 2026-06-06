import { MINECRAFT_PLUGIN_PRESETS } from '../dashboardViewHelpers.js'

/** Comandos de referencia (estilo TikControl) para juegos sin mod nativo aun. */
const GENERIC_COMMAND_TEMPLATES = {
  'supermarket-together': [
    { id: 'smash_shelf', name: 'Tumbar estanteria', category: 'caos', commandText: 'smash_shelf' },
    { id: 'spawn_customer', name: 'Cliente loco', category: 'evento', commandText: 'spawn_customer_wave' },
    { id: 'discount_99', name: 'Descuento 99%', category: 'economia', commandText: 'set_discount 99' },
  ],
  subnautica: [
    { id: 'spawn_crabsquid', name: 'Crabsquid', category: 'criatura', commandText: 'spawn_crabsquid' },
    { id: 'oxygen_zero', name: 'Oxigeno a cero', category: 'caos', commandText: 'oxygen 0' },
    { id: 'day_night', name: 'Cambiar ciclo', category: 'tiempo', commandText: 'toggle_daynight' },
  ],
  re4: [
    { id: 'give_shotgun', name: 'Escopeta', category: 'arma', commandText: 'giveweap_shotgun' },
    { id: 'spawn_enemy', name: 'Spawn enemigo', category: 'oleada', commandText: 'spawn_enemy_horde' },
    { id: 'heal_full', name: 'Curar', category: 'util', commandText: 'heal_player' },
  ],
  repo: [
    { id: 'lights_off', name: 'Apagar luces', category: 'terror', commandText: 'lights_off' },
    { id: 'spawn_monster', name: 'Monstruo', category: 'oleada', commandText: 'spawn_monster' },
    { id: 'drop_item', name: 'Soltar item', category: 'caos', commandText: 'force_drop_item' },
  ],
  schedule1: [
    { id: 'add_cash', name: 'Sumar dinero', category: 'economia', commandText: 'add_money 500' },
    { id: 'police_raid', name: 'Redada', category: 'caos', commandText: 'trigger_police' },
    { id: 'speed_boost', name: 'Velocidad', category: 'buff', commandText: 'speed_boost' },
  ],
  megabonk: [
    { id: 'add_level', name: 'Subir nivel', category: 'progreso', commandText: 'add_level 1' },
    { id: 'random_weapon', name: 'Arma aleatoria', category: 'loot', commandText: 'random_weapon' },
    { id: 'boss_wave', name: 'Oleada boss', category: 'oleada', commandText: 'spawn_boss' },
  ],
  'lethal-company': [
    { id: 'spawn_outside', name: 'Enemigo afuera', category: 'terror', commandText: 'spawn_outside_entity' },
    { id: 'kill_power', name: 'Apagar energia', category: 'caos', commandText: 'cut_power' },
    { id: 'teleport_ship', name: 'TP a nave', category: 'util', commandText: 'teleport_ship' },
  ],
}

function mapMinecraftPresets(gameId) {
  if (gameId === 'tikcontrol-oneblock') {
    return MINECRAFT_PLUGIN_PRESETS.filter((preset) => preset.minecraftMode === 'oneblock').map(
      (preset) => ({
        id: preset.id,
        name: preset.name,
        category: preset.category,
        commandText: preset.commandText,
        note: preset.note,
        imageUrl: preset.imageUrl || '',
        runnable: true,
      }),
    )
  }

  if (gameId === 'tikcontrol-bedrockbox' || gameId === 'minecraft') {
    return MINECRAFT_PLUGIN_PRESETS.filter(
      (preset) => !preset.minecraftMode || preset.minecraftMode === 'bedrock-box',
    ).map((preset) => ({
      id: preset.id,
      name: preset.name,
      category: preset.category,
      commandText: preset.commandText,
      note: preset.note,
      imageUrl: preset.imageUrl || '',
      runnable: true,
    }))
  }

  return []
}

export function buildCommandsForGame(gameId, chaosModCatalog = []) {
  if (gameId === 'gtav-chaos' && Array.isArray(chaosModCatalog) && chaosModCatalog.length > 0) {
    return chaosModCatalog.slice(0, 120).map((effect) => ({
      id: effect.id || effect.name,
      name: effect.name || effect.id,
      category: effect.category || 'chaos',
      commandText: effect.id || '',
      note: effect.description || 'Efecto ChaosMod',
      runnable: true,
      gtaChaosEffectId: effect.id,
      gtaChaosEffectName: effect.name,
    }))
  }

  if (gameId === 'gtav-chaos') {
    return [
      { id: 'chaos_random', name: 'Efecto aleatorio', category: 'chaos', commandText: '', runnable: true },
      { id: 'spawn_vehicle', name: 'Spawn vehiculo', category: 'webhook', commandText: 'spawn_vehicle', runnable: true },
      { id: 'toolup', name: 'Toolup', category: 'webhook', commandText: 'toolup', runnable: true },
    ]
  }

  const minecraftCommands = mapMinecraftPresets(gameId)
  if (minecraftCommands.length > 0) {
    return minecraftCommands
  }

  const templates = GENERIC_COMMAND_TEMPLATES[gameId]
  if (templates) {
    return templates.map((command) => ({ ...command, runnable: false }))
  }

  if (gameId.startsWith('tikcontrol-')) {
    return [
      {
        id: 'demo_event',
        name: 'Evento demo',
        category: 'demo',
        commandText: 'trigger_demo',
        note: 'Integracion del mod en desarrollo. Crea una accion manual mientras tanto.',
        runnable: false,
      },
    ]
  }

  return [
    {
      id: 'coming_soon',
      name: 'Paquete de comandos',
      category: 'info',
      commandText: '',
      note: 'Este juego aparece en la biblioteca TikControl. Proxima actualizacion traera comandos importados.',
      runnable: false,
    },
  ]
}