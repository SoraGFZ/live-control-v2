import { useEffect, useState } from 'react'

import { getActionCommandSummary, LOCAL_BRIDGE_DEFAULTS } from '../../../live-control'
import {
  BEDROCK_BOX_PRESETS,
  GAME_SPOTLIGHT,
  MINECRAFT_PLUGIN_PRESETS,
  getBedrockBoxCardMeta,
  getMinecraftPresetCardMeta,
  groupActionsByOutput,
  normalizePickerText,
} from '../../../dashboardViewHelpers'
import SectionHeader from '../../common/SectionHeader'

export function GamesSectionCore({
  actions,
  chaosModCatalog,
  chaosModSourcePath,
  embedded = false,
  forcedGameId = null,
  onJump,
  onPreviewAction,
  onRunMinecraftPreset,
  onTestMinecraftChatMirror,
  profile,
  serverStatus,
  triggers,
  updateProfileField,
}) {
  const minecraftActions = groupActionsByOutput(actions, 'minecraft')
  const gtaActions = groupActionsByOutput(actions, 'gta')
  const bedrockBoxActions = minecraftActions.filter((action) => action.minecraftMode === 'bedrock-box')
  const oneBlockActions = minecraftActions.filter((action) => action.minecraftMode === 'oneblock')
  const genericMinecraftActions = minecraftActions.filter((action) =>
    !['bedrock-box', 'oneblock'].includes(action.minecraftMode),
  )
  const minecraftTriggerCount = triggers.filter((trigger) =>
    minecraftActions.some((action) => action.id === trigger.actionId),
  ).length
  const gtaTriggerCount = triggers.filter((trigger) =>
    gtaActions.some((action) => action.id === trigger.actionId),
  ).length
  const localMinecraftSocket = `ws://127.0.0.1:${LOCAL_BRIDGE_DEFAULTS.minecraftPort}`
  const localGtaSocket = `ws://127.0.0.1:${LOCAL_BRIDGE_DEFAULTS.gtaPort}`

  const gameCards = [
    {
      id: 'gta',
      eyebrow: GAME_SPOTLIGHT.gta.eyebrow,
      title: GAME_SPOTLIGHT.gta.title,
      shortTitle: GAME_SPOTLIGHT.gta.shortTitle,
      coverUrl: GAME_SPOTLIGHT.gta.coverUrl,
      coverAlt: 'Portada de GTA V',
      accent: GAME_SPOTLIGHT.gta.accent,
      summary: GAME_SPOTLIGHT.gta.summary,
      versionLabel: GAME_SPOTLIGHT.gta.versionLabel,
      modeLabel: GAME_SPOTLIGHT.gta.modeLabel,
      availabilityLabel: GAME_SPOTLIGHT.gta.availabilityLabel,
      primaryCta: GAME_SPOTLIGHT.gta.primaryCta,
      statusLabel: serverStatus.bridges.gtaClients > 0 ? 'Bridge enlazado' : 'Esperando bridge',
      statusTone: serverStatus.bridges.gtaClients > 0 ? 'ok' : 'off',
      actionsCount: gtaActions.length,
      triggerCount: gtaTriggerCount,
      stats: [
        { label: 'Acciones listas', value: String(gtaActions.length) },
        { label: 'Triggers activos', value: String(gtaTriggerCount) },
        { label: 'ChaosMod', value: `${chaosModCatalog.length} efectos` },
      ],
      heroSummary:
        'El flujo de GTA V está optimizado para ChaosMod y conexión local, así que el enfoque principal es monitorear si el juego está enlazado y acceder rápidamente a tus acciones.',
      instructions: [
        'Deja el bridge corriendo con `npm run bridge:start`.',
        'Abre GTA V y deja ChaosMod cargado antes de probar eventos.',
      ],
      recommendation: chaosModSourcePath
        ? `ChaosMod detectado en ${chaosModSourcePath}.`
        : 'Si instalas ChaosMod, el bridge sube el catalogo automaticamente para elegir efectos desde el panel.',
      checklist: ['Bridge local activo', 'ChaosMod listo', 'Socket local'],
      endpointLabel: 'Socket local',
      endpointValue: localGtaSocket,
      extraNote:
        'Desde aqui centralizamos GTA V y luego podremos sumar variantes o mods distintos sin tocar el resto del panel.',
    },
    {
      id: 'minecraft',
      eyebrow: GAME_SPOTLIGHT.minecraft.eyebrow,
      title: GAME_SPOTLIGHT.minecraft.title,
      shortTitle: GAME_SPOTLIGHT.minecraft.shortTitle,
      coverUrl: GAME_SPOTLIGHT.minecraft.coverUrl,
      coverAlt: 'Portada de Minecraft',
      accent: GAME_SPOTLIGHT.minecraft.accent,
      summary: GAME_SPOTLIGHT.minecraft.summary,
      versionLabel: GAME_SPOTLIGHT.minecraft.versionLabel,
      modeLabel: GAME_SPOTLIGHT.minecraft.modeLabel,
      availabilityLabel: GAME_SPOTLIGHT.minecraft.availabilityLabel,
      primaryCta: GAME_SPOTLIGHT.minecraft.primaryCta,
      statusLabel: serverStatus.bridges.minecraftRconConnected
        ? 'RCON enlazado'
        : serverStatus.bridges.minecraftClients > 0
          ? 'Mod enlazado'
          : 'Esperando bridge',
      statusTone:
        serverStatus.bridges.minecraftRconConnected || serverStatus.bridges.minecraftClients > 0
          ? 'ok'
          : 'off',
      actionsCount: minecraftActions.length,
      triggerCount: minecraftTriggerCount,
      stats: [
        { label: 'Acciones listas', value: String(minecraftActions.length) },
        { label: 'Triggers activos', value: String(minecraftTriggerCount) },
        {
          label: 'RCON',
          value: serverStatus.bridges.minecraftRconConnected ? 'Activo' : 'Pendiente',
        },
      ],
      heroSummary:
        'Minecraft queda listo tanto para RCON como para mod local, asi que el foco es que puedas lanzar caos, summons o presets sin navegar entre secciones.',
      instructions: [
        'Si usas RCON, revisa host, puerto y password en tu bridge local.',
        'Si usas mod propio, escucha el socket local del bridge y mapea los eventos que quieras.',
      ],
      recommendation: serverStatus.bridges.minecraftRconError
        ? `RCON reporto: ${serverStatus.bridges.minecraftRconError}`
        : 'Puedes combinar comandos directos con overlay sin depender de un mod adicional.',
      checklist: ['Bridge local activo', 'RCON opcional', 'Socket local'],
      endpointLabel: 'Socket local',
      endpointValue: localMinecraftSocket,
      extraNote:
        'La idea es que Minecraft termine siendo un modulo completo con presets por mobs, clima, items y minijuegos.',
    },
  ]
  const minecraftPresetCategories = [
    'all',
    ...Array.from(new Set(MINECRAFT_PLUGIN_PRESETS.map((preset) => preset.category))).sort(
      (left, right) => left.localeCompare(right),
    ),
  ]

  const [selectedGameId, setSelectedGameId] = useState(
    () => forcedGameId || gameCards[0]?.id || 'gta',
  )

  useEffect(() => {
    if (forcedGameId) {
      setSelectedGameId(forcedGameId)
    }
  }, [forcedGameId])
  const [minecraftPresetSearch, setMinecraftPresetSearch] = useState('')
  const [minecraftPresetCategory, setMinecraftPresetCategory] = useState('all')
  const [minecraftPresetFeedback, setMinecraftPresetFeedback] = useState('')
  const [runningMinecraftPresetId, setRunningMinecraftPresetId] = useState('')
  const [minecraftChatMirrorFeedback, setMinecraftChatMirrorFeedback] = useState('')
  const [minecraftChatMirrorPreviewUser, setMinecraftChatMirrorPreviewUser] = useState('demo-chat')
  const [minecraftChatMirrorPreviewMessage, setMinecraftChatMirrorPreviewMessage] = useState(
    'Hola Minecraft, este mensaje salio desde el panel.',
  )
  const [isTestingMinecraftChatMirror, setIsTestingMinecraftChatMirror] = useState(false)
  const selectedGame = gameCards.find((game) => game.id === selectedGameId) || gameCards[0]
  const minecraftChatMirrorMode =
    profile.minecraftChatMirrorMode === 'actionbar' ? 'actionbar' : 'tellraw'
  const minecraftChatMirrorTarget = String(profile.minecraftChatMirrorTarget || '@a').trim() || '@a'
  const minecraftChatMirrorPrefix = String(profile.minecraftChatMirrorPrefix || '[TikTok]').trim()
  const minecraftChatMirrorPreviewCommand = `${
    minecraftChatMirrorMode === 'actionbar' ? 'title' : 'tellraw'
  } ${minecraftChatMirrorTarget} ${minecraftChatMirrorPrefix || '[TikTok]'} ${
    minecraftChatMirrorPreviewUser || 'demo-chat'
  }: ${minecraftChatMirrorPreviewMessage || 'Mensaje de ejemplo'}`
  const visibleMinecraftPresets = MINECRAFT_PLUGIN_PRESETS.filter((preset) => {
    const matchesSearch = !normalizePickerText(minecraftPresetSearch)
      || normalizePickerText(`${preset.name} ${preset.integration} ${preset.category} ${preset.commandText} ${preset.note}`).includes(
        normalizePickerText(minecraftPresetSearch),
      )
    const matchesCategory = minecraftPresetCategory === 'all' || preset.category === minecraftPresetCategory

    return matchesSearch && matchesCategory
  })
  const featuredMinecraftActions = [...minecraftActions].sort((left, right) => {
    const leftScore = left.minecraftMode === 'bedrock-box' ? 0 : 1
    const rightScore = right.minecraftMode === 'bedrock-box' ? 0 : 1

    return leftScore - rightScore || left.name.localeCompare(right.name)
  })

  async function handleRunMinecraftPreset(preset) {
    setRunningMinecraftPresetId(preset.id)

    try {
      await onRunMinecraftPreset(preset)
      setMinecraftPresetFeedback(`Preset enviado: ${preset.name}. Si el bridge esta activo, deberias verlo en Minecraft al instante.`)
    } catch (error) {
      setMinecraftPresetFeedback(error?.message || 'No pude disparar ese preset de Minecraft.')
    } finally {
      setRunningMinecraftPresetId('')
    }
  }

  async function handleTestMinecraftChatMirror() {
    setIsTestingMinecraftChatMirror(true)

    try {
      await onTestMinecraftChatMirror({
        userName: minecraftChatMirrorPreviewUser,
        comment: minecraftChatMirrorPreviewMessage,
      })
      setMinecraftChatMirrorFeedback(
        'Chat espejo enviado. Si el bridge y RCON estan listos, ya deberias verlo en Minecraft.',
      )
    } catch (error) {
      setMinecraftChatMirrorFeedback(
        error?.message || 'No pude mandar el chat espejo a Minecraft desde el panel.',
      )
    } finally {
      setIsTestingMinecraftChatMirror(false)
    }
  }

  const workspace = (
    <article className={`surface-card game-detail-shell ${embedded ? 'game-detail-shell-embedded' : ''}`}>
        <div className="game-detail-header">
          <span className="eyebrow" style={{ color: selectedGame.accent }}>
            {selectedGame.title}
          </span>
          <h3>{selectedGame.summary}</h3>
          <p>{selectedGame.heroSummary}</p>
        </div>

        <div className="game-detail-hero">
          <aside className="game-detail-aside">
            <img className="game-detail-poster" src={selectedGame.coverUrl} alt={selectedGame.coverAlt} />
            <strong>{selectedGame.title}</strong>
            <span className="game-detail-subtitle">{selectedGame.modeLabel}</span>
            <div className="game-detail-meta">
              <span className="bridge-badge game-kicker" style={{ '--game-accent': selectedGame.accent }}>
                {selectedGame.availabilityLabel}
              </span>
              <span className={`status-chip ${selectedGame.statusTone}`}>{selectedGame.statusLabel}</span>
            </div>
          </aside>

          <div
            className="game-detail-banner"
            style={{ '--game-banner-image': `url(${selectedGame.coverUrl})`, '--game-accent': selectedGame.accent }}
          >
            <div className="game-detail-banner-inner">
              <div className="tag-row">
                {selectedGame.checklist.map((chip) => (
                  <span key={`${selectedGame.id}-${chip}`} className="tag">
                    {chip}
                  </span>
                ))}
              </div>

              <div className="game-stat-grid">
                {selectedGame.stats.map((stat) => (
                  <div key={`${selectedGame.id}-${stat.label}`} className="game-stat-card">
                    <span className="snippet-label">{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>

              <div className="card-actions">
                <button className="primary-button" onClick={() => onJump('actions')}>
                  {selectedGame.primaryCta}
                </button>
                <button className="secondary-button" onClick={() => onJump('triggers')}>
                  Ver triggers
                </button>
                <button className="ghost-button" onClick={() => onJump('bridges')}>
                  Ver bridge tecnico
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="game-detail-columns">
          <div className="game-callout game-callout-info">
            <strong>Flujo recomendado</strong>
            {selectedGame.instructions.map((instruction) => (
              <p key={`${selectedGame.id}-${instruction}`}>{instruction}</p>
            ))}
          </div>

          <div className="game-callout game-callout-warn">
            <strong>Recomendacion</strong>
            <p>{selectedGame.recommendation}</p>
          </div>
        </div>

        <div className="game-detail-footer">
          <div className="snippet-block">
            <span className="snippet-label">{selectedGame.endpointLabel}</span>
            <code>{selectedGame.endpointValue}</code>
          </div>
          <p className="support-copy">{selectedGame.extraNote}</p>
        </div>

        {selectedGame.id === 'minecraft' ? (
          <div className="game-mode-grid">
            <article className="surface-card game-mode-card">
              <div className="card-top">
                <div>
                  <h3>Modos de Minecraft</h3>
                  <p>Bedrock Box se incluye como modo integral del juego, ofreciendo presets rápidos para probar eventos sin necesidad de crear una acción previamente.</p>
                </div>
                <div className="tag-row">
                  <span className="bridge-badge">Bedrock Box</span>
                  <span className="bridge-badge">{BEDROCK_BOX_PRESETS.length} presets</span>
                </div>
              </div>

              <div className="picker-toolbar">
                <input
                  className="text-field"
                  placeholder="Busca por nombre, categoria o comando"
                  value={minecraftPresetSearch}
                  onChange={(event) => setMinecraftPresetSearch(event.target.value)}
                />
                <select
                  className="text-field picker-filter"
                  value={minecraftPresetCategory}
                  onChange={(event) => setMinecraftPresetCategory(event.target.value)}
                >
                  {minecraftPresetCategories.map((category) => (
                    <option key={category} value={category}>
                      {category === 'all' ? 'Todas las categorias' : category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="command-gallery-grid game-mode-preset-grid">
                {visibleMinecraftPresets.length === 0 ? (
                  <div className="empty-state-card" style={{ gridColumn: '1 / -1' }}>
                    <Gamepad2 className="empty-state-icon" size={32} />
                    <h4>No hay modos disponibles</h4>
                    <p>No se encontraron presets para la categoría seleccionada.</p>
                  </div>
                ) : (
                  visibleMinecraftPresets.map((preset) => {
                    const meta = getBedrockBoxCardMeta(preset)
                    const linkedActionCount = bedrockBoxActions.filter(
                      (action) => action.minecraftBedrockPresetId === preset.id,
                    ).length

                    return (
                      <article
                        key={preset.id}
                        className="command-picker-card game-mode-preset-card"
                        style={{ '--picker-accent': meta.accent }}
                      >
                        <div className="picker-card-head">
                          {preset.imageUrl ? (
                            <img className="gift-picker-image" src={preset.imageUrl} alt={preset.name} />
                          ) : (
                            <span className="gift-picker-thumb">{meta.token}</span>
                          )}
                          <span className="tag">{preset.category}</span>
                        </div>
                        <strong>{preset.name}</strong>
                        <span className="row-subcopy">{preset.note}</span>
                        <code className="dense-code">{preset.commandText}</code>
                        <div className="tag-row">
                          {linkedActionCount > 0 ? (
                            <span className="muted-pill">
                              {linkedActionCount} acción{linkedActionCount === 1 ? '' : 'es'}
                            </span>
                          ) : (
                            <span className="muted-pill">Sin acciones vinculadas</span>
                          )}
                        </div>
                        <div className="row-actions">
                          <button
                            className="secondary-button compact-button"
                            onClick={() => handleRunMinecraftPreset(preset)}
                            disabled={runningMinecraftPresetId === preset.id}
                          >
                            {runningMinecraftPresetId === preset.id ? 'Enviando...' : 'Probar ahora'}
                          </button>
                        </div>
                      </article>
                    )
                  })
                )}
              </div>

              {minecraftPresetFeedback ? <span className="feedback-pill">{minecraftPresetFeedback}</span> : null}
            </article>

            <div className="game-mode-stack">
              <article className="surface-card game-mode-card">
                <div className="card-top">
                  <div>
                    <h3>Chat espejo de TikTok</h3>
                    <p>Replica comentarios del live dentro de Minecraft usando el mismo bridge local.</p>
                  </div>
                  <span
                    className={`status-chip ${profile.minecraftChatMirrorEnabled ? 'ok' : 'off'}`}
                  >
                    {profile.minecraftChatMirrorEnabled ? 'Activo' : 'Apagado'}
                  </span>
                </div>

                <div className="option-grid">
                  <label className="option-card">
                    <input
                      type="checkbox"
                      checked={Boolean(profile.minecraftChatMirrorEnabled)}
                      onChange={(event) =>
                        updateProfileField('minecraftChatMirrorEnabled', event.target.checked)
                      }
                    />
                    <div>
                      <strong>Activar chat espejo</strong>
                      <span>Manda comentarios normales del live al chat del juego.</span>
                    </div>
                  </label>

                  <label className="option-card">
                    <input
                      type="checkbox"
                      checked={Boolean(profile.minecraftChatMirrorSkipCommands)}
                      onChange={(event) =>
                        updateProfileField('minecraftChatMirrorSkipCommands', event.target.checked)
                      }
                    />
                    <div>
                      <strong>Ocultar comandos</strong>
                      <span>Ignora mensajes que arrancan con `!` o `/` para no ensuciar el juego.</span>
                    </div>
                  </label>
                </div>

                <div className="mini-grid">
                  <div>
                    <label className="field-label" htmlFor="minecraft-chat-mirror-mode">
                      Salida dentro del juego
                    </label>
                    <select
                      id="minecraft-chat-mirror-mode"
                      className="text-field"
                      value={minecraftChatMirrorMode}
                      onChange={(event) =>
                        updateProfileField('minecraftChatMirrorMode', event.target.value)
                      }
                    >
                      <option value="tellraw">Chat normal</option>
                      <option value="actionbar">Action bar</option>
                    </select>
                  </div>

                  <div>
                    <label className="field-label" htmlFor="minecraft-chat-mirror-target">
                      Objetivo en Minecraft
                    </label>
                    <input
                      id="minecraft-chat-mirror-target"
                      className="text-field"
                      value={profile.minecraftChatMirrorTarget || '@a'}
                      onChange={(event) =>
                        updateProfileField('minecraftChatMirrorTarget', event.target.value)
                      }
                      placeholder="@a"
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="minecraft-chat-mirror-prefix">
                      Prefijo
                    </label>
                    <input
                      id="minecraft-chat-mirror-prefix"
                      className="text-field"
                      value={profile.minecraftChatMirrorPrefix || ''}
                      onChange={(event) =>
                        updateProfileField('minecraftChatMirrorPrefix', event.target.value)
                      }
                      placeholder="[TikTok]"
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="minecraft-chat-mirror-sample-user">
                      Usuario de prueba
                    </label>
                    <input
                      id="minecraft-chat-mirror-sample-user"
                      className="text-field"
                      value={minecraftChatMirrorPreviewUser}
                      onChange={(event) => setMinecraftChatMirrorPreviewUser(event.target.value)}
                      placeholder="demo-chat"
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label" htmlFor="minecraft-chat-mirror-sample-message">
                    Mensaje de prueba
                  </label>
                  <input
                    id="minecraft-chat-mirror-sample-message"
                    className="text-field"
                    value={minecraftChatMirrorPreviewMessage}
                    onChange={(event) => setMinecraftChatMirrorPreviewMessage(event.target.value)}
                    placeholder="Hola Minecraft, este mensaje salio desde el panel."
                  />
                </div>

                <div className="snippet-block">
                  <span className="snippet-label">Vista rapida</span>
                  <code>{minecraftChatMirrorPreviewCommand}</code>
                </div>

                <div className="row-actions">
                  <button
                    className="secondary-button compact-button"
                    onClick={handleTestMinecraftChatMirror}
                    disabled={isTestingMinecraftChatMirror}
                  >
                    {isTestingMinecraftChatMirror ? 'Enviando...' : 'Probar chat espejo'}
                  </button>
                  <button className="ghost-button compact-button" onClick={() => onJump('bridges')}>
                    Ver bridge
                  </button>
                </div>

                {minecraftChatMirrorFeedback ? (
                  <span className="feedback-pill">{minecraftChatMirrorFeedback}</span>
                ) : null}
              </article>

              <article className="surface-card game-mode-card">
                <div className="card-top">
                  <div>
                    <h3>Acciones ya conectadas</h3>
                    <p>Aquí tienes acceso a las acciones de Minecraft que ya están guardadas en tu panel.</p>
                  </div>
                  <span className="state-badge">{minecraftActions.length} listas</span>
                </div>

                {featuredMinecraftActions.length === 0 ? (
                  <div className="empty-state-card" style={{ gridColumn: '1 / -1' }}>
                    <Gamepad2 className="empty-state-icon" size={32} />
                    <h4>Sin acciones de juego</h4>
                    <p>Todavía no has creado acciones para Minecraft. Puedes comenzar usando un preset de Bedrock Box o dirigirte a la biblioteca.</p>
                  </div>
                ) : (
                  <div className="game-linked-actions">
                    {featuredMinecraftActions.slice(0, 5).map((action) => (
                      <div key={action.id} className="game-linked-action">
                        <div className="row-title-wrap">
                          <strong className="row-title">{action.name}</strong>
                          <span className="row-subcopy">{getActionCommandSummary(action)}</span>
                        </div>
                        <button className="ghost-button compact-button" onClick={() => onPreviewAction(action)}>
                          Probar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="card-actions">
                  <button className="primary-button" onClick={() => onJump('actions')}>
                    Gestionar acciones
                  </button>
                  <button className="secondary-button" onClick={() => onJump('triggers')}>
                    Ver triggers
                  </button>
                </div>
              </article>

              <article className="surface-card game-mode-card">
                <div className="card-top">
                  <div>
                    <h3>Estado rápido</h3>
                    <p>Resumen de como esta quedando hoy tu modulo de Minecraft.</p>
                  </div>
                  <span className={`status-chip ${serverStatus.bridges.minecraftRconConnected ? 'ok' : 'off'}`}>
                    {serverStatus.bridges.minecraftRconConnected ? 'RCON activo' : 'RCON en espera'}
                  </span>
                </div>

                <div className="mini-grid game-mode-status-grid">
                  <div>
                    <span className="snippet-label">Bedrock Box</span>
                    <p>{bedrockBoxActions.length} acción{bedrockBoxActions.length === 1 ? '' : 'es'}</p>
                  </div>
                  <div>
                    <span className="snippet-label">Generico</span>
                    <p>{genericMinecraftActions.length} acción{genericMinecraftActions.length === 1 ? '' : 'es'}</p>
                  </div>
                  <div>
                    <span className="snippet-label">Bridge local</span>
                    <p>{serverStatus.bridges.minecraftClients} cliente{serverStatus.bridges.minecraftClients === 1 ? '' : 's'}</p>
                  </div>
                  <div>
                    <span className="snippet-label">Triggers</span>
                    <p>{minecraftTriggerCount} activos</p>
                  </div>
                  <div>
                    <span className="snippet-label">Chat espejo</span>
                    <p>{profile.minecraftChatMirrorEnabled ? 'Activo' : 'Apagado'}</p>
                  </div>
                  <div>
                    <span className="snippet-label">Salida</span>
                    <p>{minecraftChatMirrorMode === 'actionbar' ? 'Action bar' : 'Chat'}</p>
                  </div>
                </div>

                <div className="snippet-block">
                  <span className="snippet-label">Comando base</span>
                  <code>bedrock create | fill | tnt | randomtnt | glass_prison</code>
                </div>

                <p className="support-copy">
                  Siguiente paso natural: sumar presets por mobs, clima e items para que Minecraft quede tan completo como GTA.
                </p>
              </article>
            </div>
          </div>
        ) : null}
      </article>
  )

  if (embedded) {
    return workspace
  }

  return (
    <section className="panel-section" id="games">
      <SectionHeader
        eyebrow="Juegos"
        title="Catalogo de juegos"
        description="La idea aqui es que cada juego viva como un modulo propio. Hoy ya tienes GTA V y Minecraft, y mas adelante sumamos el resto sin romper el flujo."
      />

      <div className="game-launcher-grid">
        {gameCards.map((game) => (
          <button
            key={game.id}
            type="button"
            className={`game-launcher-card ${selectedGame.id === game.id ? 'selected' : ''}`}
            style={{ '--game-accent': game.accent }}
            onClick={() => setSelectedGameId(game.id)}
          >
            <img className="game-launcher-cover" src={game.coverUrl} alt={game.coverAlt} />
            <div className="game-launcher-overlay" />
            <div className="game-launcher-content">
              <span className="game-launcher-title">{game.shortTitle}</span>
              <span className="game-launcher-pill">{game.versionLabel}</span>
              <div className="game-launcher-meta">
                <span>{game.actionsCount} acciones</span>
                <span>{game.triggerCount} triggers</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {workspace}
    </section>
  )
}

export default GamesSectionCore
