import { useEffect, useMemo, useState } from 'react'
import { Crown, Gamepad2, X, Save, UploadCloud } from 'lucide-react'
import {
  OBS_ACTION_OPTIONS,
  TIKCONTROL_ACTION_CATEGORIES,
  getCategoryMeta,
  outputsForCategory,
} from '../../config/tikcontrolActionTypes.js'

const PremiumModalStyles = () => (
  <style>{`
    /* Premium Modal Overrides */
    .modal-backdrop {
      background: rgba(15, 23, 42, 0.7) !important;
      backdrop-filter: blur(8px) !important;
      animation: modal-fade-in 0.3s ease-out forwards !important;
    }
    .modal-card {
      background: #1e293b !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(59, 130, 246, 0.05) !important;
      border-radius: 16px !important;
      animation: modal-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
    }
    .modal-head {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
      padding-bottom: 1rem !important;
      margin-bottom: 1.5rem !important;
    }
    .eyebrow {
      color: #3b82f6 !important;
      font-weight: 600 !important;
      letter-spacing: 0.05em !important;
      text-transform: uppercase !important;
      font-size: 0.75rem !important;
    }
    .modal-head h2 {
      color: #f8fafc !important;
      font-size: 1.25rem !important;
      margin-top: 0.25rem !important;
    }
    .icon-button {
      background: rgba(255, 255, 255, 0.05) !important;
      border: 1px solid rgba(255,255,255,0.05) !important;
      border-radius: 50% !important;
      width: 36px !important;
      height: 36px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: #94a3b8 !important;
      transition: all 0.2s !important;
    }
    .icon-button:hover {
      background: rgba(239, 68, 68, 0.1) !important;
      border-color: rgba(239, 68, 68, 0.2) !important;
      color: #ef4444 !important;
      transform: rotate(90deg) scale(1.1) !important;
    }
    .text-field, .text-area, .picker-native-select {
      background: rgba(15, 23, 42, 0.5) !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      border-radius: 8px !important;
      color: #f8fafc !important;
      transition: all 0.2s !important;
      padding: 0.65rem 1rem !important;
    }
    .text-field:focus, .text-area:focus, .picker-native-select:focus {
      border-color: #3b82f6 !important;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2) !important;
      background: rgba(15, 23, 42, 0.8) !important;
      outline: none !important;
    }
    .field-label {
      color: #cbd5e1 !important;
      font-weight: 500 !important;
      font-size: 0.9rem !important;
      margin-bottom: 0.4rem !important;
      margin-top: 1rem !important;
      display: block !important;
    }
    .option-card, .command-picker-card, .asset-picker-row, .media-picker-item, .event-option-row, .action-picker-card, .event-platform-chip {
      background: rgba(30, 41, 59, 0.3) !important;
      border: 1px solid rgba(255, 255, 255, 0.05) !important;
      border-radius: 12px !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      cursor: pointer !important;
    }
    .option-card:hover, .command-picker-card:hover, .asset-picker-row:hover, .media-picker-item:hover, .event-option-row:hover, .action-picker-card:hover, .event-platform-chip:not(:disabled):hover {
      transform: translateY(-2px) !important;
      background: rgba(30, 41, 59, 0.7) !important;
      border-color: rgba(255, 255, 255, 0.15) !important;
      box-shadow: 0 8px 16px -4px rgba(0,0,0,0.3) !important;
    }
    .option-card.selected, .command-picker-card.selected, .asset-picker-row.selected, .media-picker-item.selected, .event-option-row.selected, .action-picker-card.selected, .event-platform-chip.selected {
      border-color: #3b82f6 !important;
      background: rgba(59, 130, 246, 0.1) !important;
      box-shadow: inset 0 0 0 1px #3b82f6 !important;
    }
    .primary-button {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
      color: white !important;
      border: none !important;
      border-radius: 8px !important;
      padding: 0.65rem 1.4rem !important;
      font-weight: 500 !important;
      font-size: 0.9rem !important;
      transition: all 0.2s !important;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3) !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0.5rem !important;
      cursor: pointer !important;
    }
    .primary-button:hover {
      transform: translateY(-1px) !important;
      box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4) !important;
    }
    .primary-button:active {
      transform: scale(0.97) !important;
    }
    .ghost-button {
      background: transparent !important;
      color: #94a3b8 !important;
      transition: all 0.2s !important;
      border-radius: 8px !important;
      padding: 0.65rem 1.4rem !important;
      font-size: 0.9rem !important;
      border: 1px solid transparent !important;
      cursor: pointer !important;
    }
    .ghost-button:hover {
      color: #f8fafc !important;
      background: rgba(255, 255, 255, 0.05) !important;
      border-color: rgba(255, 255, 255, 0.05) !important;
    }
    .secondary-button {
      background: rgba(255, 255, 255, 0.05) !important;
      color: #e2e8f0 !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      border-radius: 8px !important;
      transition: all 0.2s !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0.5rem !important;
      padding: 0.65rem 1.4rem !important;
      cursor: pointer !important;
      font-size: 0.9rem !important;
      font-weight: 500 !important;
    }
    .secondary-button:hover {
      background: rgba(255, 255, 255, 0.1) !important;
      border-color: rgba(255, 255, 255, 0.2) !important;
      color: #ffffff !important;
    }
    .error-box {
      background: rgba(239, 68, 68, 0.1) !important;
      border-left: 4px solid #ef4444 !important;
      color: #fca5a5 !important;
      padding: 0.8rem 1rem !important;
      border-radius: 4px !important;
      animation: modal-slide-up 0.3s forwards !important;
      margin-top: 1rem !important;
    }
    .support-copy {
      color: #94a3b8 !important;
      font-size: 0.85rem !important;
      margin-top: 0.6rem !important;
      line-height: 1.4 !important;
    }
    .modal-actions {
      display: flex !important;
      justify-content: flex-end !important;
      gap: 1rem !important;
      margin-top: 2rem !important;
      padding-top: 1.5rem !important;
      border-top: 1px dashed rgba(255, 255, 255, 0.1) !important;
    }
    @keyframes modal-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes modal-slide-up { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  `}</style>
)

import { OUTPUT_OPTIONS, getOutputMeta } from '../../live-control'
import { useGamingCatalog } from '../../hooks/useGamingCatalog.js'
import { buildManualEmoteId, normalizeUserHandle } from '../../dashboardShared'
import {
  BEDROCK_BOX_PRESETS,
  buildGiftTriggerMatch,
  COMMENT_TRIGGER_OPTIONS,
  createActionDraft,
  createEmoteDraft,
  createTriggerDraft,
  CURATED_GIFT_CATALOG,
  DEFAULT_TRIGGER_MATCHES,
  getBedrockBoxCardMeta,
  getChaosModCardMeta,
  getEmoteSourceLabel,
  GTAV_WEBHOOK_COMMAND_OPTIONS,
  getTriggerAudienceMeta,
  isGlobalCommentRule,
  normalizeEmoteCatalogForPicker,
  normalizeGiftCatalogForPicker,
  normalizePickerText,
  parseGiftTriggerMatch,
  parseSpecificUsers,
  TRIGGER_AUDIENCE_OPTIONS,
  VISUAL_TRIGGER_OPTIONS,
} from '../../dashboardViewHelpers'

function ActionModal({
  chaosModCatalog = [],
  initialAction,
  isUploadingMedia,
  mediaLibrary = [],
  mediaLibraryError,
  onClose,
  onSave,
  onUploadMedia,
}) {
  const [draft, setDraft] = useState(() => createActionDraft(initialAction))
  const [errorMessage, setErrorMessage] = useState('')
  const [gtaCommandSearch, setGtaCommandSearch] = useState('')
  const [gtaCommandCategory, setGtaCommandCategory] = useState('all')
  const [minecraftCommandSearch, setMinecraftCommandSearch] = useState('')
  const [minecraftCommandCategory, setMinecraftCommandCategory] = useState('all')
  const [gamingCommands, setGamingCommands] = useState([])
  const [gamingGameSearch, setGamingGameSearch] = useState('')
  const [gamingCommandSearch, setGamingCommandSearch] = useState('')
  const {
    games: gamingCatalog,
    loading: catalogLoading,
    error: gamingCatalogError,
    reload: reloadGamingCatalog,
  } = useGamingCatalog({ enabled: true })
  const [obsResources, setObsResources] = useState({ scenes: [], sourcesByScene: {} })
  const [streamerbotActions, setStreamerbotActions] = useState([])
  const isEditing = Boolean(initialAction?.id)
  const selectedCategory = getCategoryMeta(draft.categoryId || 'alert')
  const selectedMediaItem =
    mediaLibrary.find((item) => item.url === draft.mediaUrl || item.fileName === draft.mediaUrl) || null
  const selectedBedrockBoxPreset =
    BEDROCK_BOX_PRESETS.find((item) => item.id === draft.minecraftBedrockPresetId) || null
  const selectedChaosModEffect =
    chaosModCatalog.find((item) => item.id === draft.gtaChaosEffectId) || null
  const usesMinecraftOutput = draft.categoryId === 'minecraft' || draft.outputs.includes('minecraft')
  const usesGtaOutput = draft.categoryId === 'gta' || draft.outputs.includes('gta')
  const usesGameOutput = draft.categoryId === 'game' || draft.outputs.includes('game')
  const usesObsOutput = draft.categoryId === 'obs' || draft.outputs.includes('obs')
  const usesWebhookOutput = draft.categoryId === 'webhook' || draft.outputs.includes('webhook')
  const usesKeystrokeOutput = draft.categoryId === 'keystroke' || draft.outputs.includes('keystroke')
  const usesDelayOutput = draft.categoryId === 'delay' || draft.outputs.includes('delay')
  const usesStreamerbotOutput = draft.categoryId === 'streamerbot' || draft.outputs.includes('streamerbot')
  const usesAlertOutput = draft.outputs.includes('overlayAlert')
  const usesMediaOutput = draft.outputs.includes('overlayMedia')
  const usesAudioOutput = draft.outputs.includes('audio')
  const usesTtsOutput = draft.outputs.includes('tts')
  const usesBedrockBox = usesMinecraftOutput && draft.minecraftMode === 'bedrock-box'
  const selectedGtaActionType = draft.type || 'chaosmod'
  const usesChaosMod = usesGtaOutput && selectedGtaActionType === 'chaosmod'
  const usesGtavWebhook = usesGtaOutput && selectedGtaActionType === 'gtavwebhook'
  const selectedGtavWebhookCommand =
    GTAV_WEBHOOK_COMMAND_OPTIONS.find((item) => item.id === draft.gtaWebhookCommand) || null
  const availableBedrockBoxCategories = [
    'all',
    ...Array.from(new Set(BEDROCK_BOX_PRESETS.map((item) => item.category || '').filter(Boolean))).sort(
      (left, right) => left.localeCompare(right),
    ),
  ]
  const visibleBedrockBoxPresets = BEDROCK_BOX_PRESETS.filter((preset) => {
    const matchesSearch = !normalizePickerText(minecraftCommandSearch)
      || normalizePickerText(`${preset.name} ${preset.category} ${preset.commandText}`).includes(
        normalizePickerText(minecraftCommandSearch),
      )
    const matchesCategory = minecraftCommandCategory === 'all' || preset.category === minecraftCommandCategory

    return matchesSearch && matchesCategory
  })
  const availableChaosModCategories = [
    'all',
    ...Array.from(
      new Set(
        chaosModCatalog
          .map((item) => item.categoryLabel || item.category || '')
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right)),
  ]
  const visibleChaosModEffects = chaosModCatalog.filter((effect) => {
    const matchesSearch = !normalizePickerText(gtaCommandSearch)
      || normalizePickerText(`${effect.name} ${effect.categoryLabel} ${effect.category}`).includes(
        normalizePickerText(gtaCommandSearch),
      )
    const effectCategory = effect.categoryLabel || effect.category || ''
    const matchesCategory = gtaCommandCategory === 'all' || effectCategory === gtaCommandCategory

    return matchesSearch && matchesCategory
  })

  useEffect(() => {
    setDraft(createActionDraft(initialAction))
    setErrorMessage('')
    setGtaCommandSearch('')
    setGtaCommandCategory('all')
    setMinecraftCommandSearch('')
    setMinecraftCommandCategory('all')
    setGamingGameSearch('')
    setGamingCommandSearch('')
  }, [initialAction])

  useEffect(() => {
    if (!usesGameOutput || !draft.gamingGameId) {
      setGamingCommands([])
      return
    }

    let cancelled = false

    async function loadCommands() {
      try {
        const response = await fetch(`/api/gaming/commands/${encodeURIComponent(draft.gamingGameId)}`)
        const payload = await response.json()
        if (!cancelled && payload?.ok && Array.isArray(payload.commands)) {
          setGamingCommands(payload.commands)
        }
      } catch {
        if (!cancelled) {
          setGamingCommands([])
        }
      }
    }

    loadCommands()
    return () => {
      cancelled = true
    }
  }, [draft.gamingGameId, usesGameOutput])

  useEffect(() => {
    if (!usesObsOutput) {
      return
    }

    async function loadObsResources() {
      try {
        const response = await fetch('/api/integrations/obs/resources')
        const payload = await response.json()
        if (payload?.resources) {
          setObsResources(payload.resources)
        }
      } catch {
        setObsResources({ scenes: [], sourcesByScene: {} })
      }
    }

    loadObsResources()
  }, [usesObsOutput])

  useEffect(() => {
    if (!usesStreamerbotOutput) {
      return
    }

    async function loadStreamerbotActions() {
      try {
        const response = await fetch('/api/integrations/streamerbot/resources')
        const payload = await response.json()
        if (payload?.resources?.actions) {
          setStreamerbotActions(payload.resources.actions)
        }
      } catch {
        setStreamerbotActions([])
      }
    }

    loadStreamerbotActions()
  }, [usesStreamerbotOutput])

  const obsSceneOptions = obsResources.scenes || []
  const obsSourceOptions = draft.obsScene
    ? obsResources.sourcesByScene?.[draft.obsScene] || []
    : Object.values(obsResources.sourcesByScene || {}).flat()

  const filteredGamingCatalog = useMemo(() => {
    const needle = gamingGameSearch.trim().toLowerCase()
    if (!needle) {
      return gamingCatalog
    }
    return gamingCatalog.filter((game) =>
      `${game.name} ${game.summary || ''}`.toLowerCase().includes(needle),
    )
  }, [gamingCatalog, gamingGameSearch])

  const visibleGamingCommands = useMemo(() => {
    const needle = gamingCommandSearch.trim().toLowerCase()
    if (!needle) {
      return gamingCommands
    }
    return gamingCommands.filter((command) =>
      `${command.name} ${command.category || ''} ${command.commandText || ''}`.toLowerCase().includes(needle),
    )
  }, [gamingCommandSearch, gamingCommands])

  function selectCategory(categoryId) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      categoryId,
      outputs: outputsForCategory(categoryId),
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!draft.name.trim()) {
      setErrorMessage('Ingresa un nombre para la acción.')
      return
    }

    if (draft.outputs.length === 0) {
      setErrorMessage('Selecciona un tipo de acción.')
      return
    }

    if (usesGameOutput && !draft.gamingGameId) {
      setErrorMessage('Elige un juego de la biblioteca TikControl.')
      return
    }

    if (usesGameOutput && !draft.gamingCommandId && !draft.commandText.trim()) {
      setErrorMessage('Elige un comando del juego o escribe uno manual.')
      return
    }

    if (usesObsOutput && !draft.obsAction) {
      setErrorMessage('Selecciona una acción OBS.')
      return
    }

    if (usesWebhookOutput && !draft.webhookUrl.trim()) {
      setErrorMessage('Ingresa la URL del webhook.')
      return
    }

    if (usesChaosMod && !draft.gtaChaosEffectId.trim()) {
      setErrorMessage('Selecciona un efecto de ChaosMod para esta acción.')
      return
    }

    if (usesGtavWebhook && !draft.gtaWebhookCommand.trim()) {
      setErrorMessage('Elige o escribe un comando de GTAVWebhook para esta acción.')
      return
    }

    if (usesBedrockBox && !draft.minecraftBedrockPresetId.trim()) {
      setErrorMessage('Elige un preset de Bedrock Box para esta acción.')
      return
    }

    onSave({
      ...draft,
      type: usesGtaOutput ? selectedGtaActionType : draft.type,
      name: draft.name.trim(),
      description: draft.description.trim(),
      commandText: draft.commandText.trim(),
      minecraftBedrockPresetId: draft.minecraftBedrockPresetId.trim(),
      minecraftBedrockPresetName: draft.minecraftBedrockPresetName.trim(),
      gtaMode:
        usesGtaOutput && selectedGtaActionType === 'gtavwebhook'
          ? 'gtavwebhook'
          : usesGtaOutput && selectedGtaActionType === 'chaosmod'
            ? 'chaosmod'
            : draft.gtaMode,
      gtaChaosEffectId: draft.gtaChaosEffectId.trim(),
      gtaChaosEffectName: draft.gtaChaosEffectName.trim(),
      gtaWebhookCommand: draft.gtaWebhookCommand.trim(),
      gtaWebhookPayload: draft.gtaWebhookPayload.trim(),
      overlayText: draft.overlayText.trim(),
      mediaUrl: draft.mediaUrl.trim(),
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <PremiumModalStyles />
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{isEditing ? 'Editar acción' : 'Nueva acción'} · TikControl Premium</span>
            <h2>{isEditing ? 'Ajusta lo que debe ocurrir' : 'Define lo que debe ocurrir'}</h2>
            <p className="support-copy" style={{ marginTop: '0.35rem' }}>
              <Crown size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
              Founder Edition local — todas las categorías desbloqueadas.
            </p>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="action-name">
            Nombre
          </label>
          <input
            id="action-name"
            className="text-field"
            placeholder="Ej: Gift que invoca zombie"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />

          <label className="field-label" htmlFor="action-description">
            Descripcion
          </label>
          <textarea
            id="action-description"
            className="text-area"
            placeholder="Define el comportamiento principal de esta acción."
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />

          <div className="field-group tc-action-type-section">
            <span className="field-label">Tipo de acción (TikControl)</span>
            <p className="support-copy">
              Categoría activa: <strong>{selectedCategory.label}</strong> — {selectedCategory.description}
            </p>
            <div className="tc-action-type-grid">
              {TIKCONTROL_ACTION_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`tc-action-type-card ${draft.categoryId === category.id ? 'selected' : ''}`}
                  onClick={() => selectCategory(category.id)}
                >
                  <span className="tc-action-type-icon" aria-hidden="true">
                    {category.icon}
                  </span>
                  <strong>{category.label}</strong>
                  <span>{category.description}</span>
                  {category.founder ? <span className="tc-founder-pill">Founder</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="field-group tc-action-meta-row">
            <label className="field-label" htmlFor="action-scope">
              Ámbito
            </label>
            <select
              id="action-scope"
              className="text-field"
              value={draft.scope}
              onChange={(event) => setDraft({ ...draft, scope: event.target.value })}
            >
              <option value="profile">Este perfil</option>
              <option value="global">Global</option>
            </select>
            <label className="field-label" htmlFor="action-screen">
              Pantalla overlay
            </label>
            <select
              id="action-screen"
              className="text-field"
              value={draft.screen}
              onChange={(event) => setDraft({ ...draft, screen: event.target.value })}
            >
              {Array.from({ length: 10 }, (_, index) => {
                const screen = String(index + 1)
                return (
                  <option key={screen} value={screen}>
                    Pantalla {screen}
                  </option>
                )
              })}
            </select>
            <label className="field-label" htmlFor="action-duration">
              Duración (seg)
            </label>
            <input
              id="action-duration"
              type="number"
              min={1}
              className="text-field"
              value={draft.duration}
              onChange={(event) =>
                setDraft({ ...draft, duration: Number(event.target.value) || 10 })
              }
            />
          </div>

          {usesGameOutput ? (
            <div className="field-group tc-game-action-panel">
              <span className="field-label">
                <Gamepad2 size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                Biblioteca de juegos TikControl
              </span>
              {catalogLoading ? (
                <p className="support-copy">Cargando catálogo TikControl en vivo…</p>
              ) : null}
              {gamingCatalogError ? (
                <div className="error-box">
                  {gamingCatalogError}
                  <button type="button" className="ghost-button compact-button" onClick={() => reloadGamingCatalog()}>
                    Reintentar
                  </button>
                </div>
              ) : null}
              {!catalogLoading && !gamingCatalogError && filteredGamingCatalog.length === 0 ? (
                <p className="support-copy">No hay juegos en el catálogo. Comprueba la conexión o abre la pestaña Gaming.</p>
              ) : null}
              <input
                className="text-field"
                placeholder="Buscar juego…"
                value={gamingGameSearch}
                onChange={(event) => setGamingGameSearch(event.target.value)}
              />
              <div className="tc-game-pick-grid">
                {filteredGamingCatalog.map((game) => (
                  <button
                    key={game.id}
                    type="button"
                    className={`tc-game-pick-card ${draft.gamingGameId === game.id ? 'selected' : ''}`}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        gamingGameId: game.id,
                        gamingGameName: game.name,
                        gamingCommandId: '',
                        gamingCommandName: '',
                      }))
                    }
                  >
                    {game.coverUrl ? (
                      <img src={game.coverUrl} alt="" className="tc-game-pick-cover" />
                    ) : (
                      <span className="tc-game-pick-cover tc-game-pick-fallback">{game.name.slice(0, 1)}</span>
                    )}
                    <span className="tc-game-pick-name">{game.name}</span>
                  </button>
                ))}
              </div>
              {draft.gamingGameId ? (
                <>
                  <input
                    className="text-field"
                    placeholder="Buscar comando…"
                    value={gamingCommandSearch}
                    onChange={(event) => setGamingCommandSearch(event.target.value)}
                  />
                  <div className="command-gallery-grid">
                    {visibleGamingCommands.slice(0, 60).map((command) => (
                      <button
                        key={command.id}
                        type="button"
                        className={`command-picker-card ${
                          draft.gamingCommandId === command.id ? 'selected' : ''
                        }`}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            gamingCommandId: command.id,
                            gamingCommandName: command.name,
                            commandText: command.commandText || command.id || '',
                          }))
                        }
                      >
                        <strong>{command.name}</strong>
                        <span>{command.category || 'comando'}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {usesObsOutput ? (
            <>
              <label className="field-label" htmlFor="action-obs-action">
                Acción OBS
              </label>
              <select
                id="action-obs-action"
                className="text-field"
                value={draft.obsAction}
                onChange={(event) => setDraft({ ...draft, obsAction: event.target.value })}
              >
                <option value="">Selecciona…</option>
                {OBS_ACTION_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="field-label" htmlFor="action-obs-scene">
                Escena OBS
              </label>
              {obsSceneOptions.length > 0 ? (
                <select
                  id="action-obs-scene"
                  className="text-field"
                  value={draft.obsScene}
                  onChange={(event) => setDraft({ ...draft, obsScene: event.target.value })}
                >
                  <option value="">Selecciona escena…</option>
                  {obsSceneOptions.map((scene) => (
                    <option key={scene} value={scene}>
                      {scene}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="action-obs-scene"
                  className="text-field"
                  placeholder="Conecta OBS en Integraciones primero"
                  value={draft.obsScene}
                  onChange={(event) => setDraft({ ...draft, obsScene: event.target.value })}
                />
              )}
              <label className="field-label" htmlFor="action-obs-source">
                Fuente OBS
              </label>
              {obsSourceOptions.length > 0 ? (
                <select
                  id="action-obs-source"
                  className="text-field"
                  value={draft.obsSource}
                  onChange={(event) => setDraft({ ...draft, obsSource: event.target.value })}
                >
                  <option value="">Selecciona fuente…</option>
                  {obsSourceOptions.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="action-obs-source"
                  className="text-field"
                  placeholder="Nombre de fuente OBS"
                  value={draft.obsSource}
                  onChange={(event) => setDraft({ ...draft, obsSource: event.target.value })}
                />
              )}
            </>
          ) : null}

          {usesStreamerbotOutput ? (
            <>
              <label className="field-label" htmlFor="action-streamerbot">
                Acción Streamer.bot
              </label>
              {streamerbotActions.length > 0 ? (
                <select
                  id="action-streamerbot"
                  className="text-field"
                  value={draft.streamerbotAction}
                  onChange={(event) => setDraft({ ...draft, streamerbotAction: event.target.value })}
                >
                  <option value="">Selecciona acción…</option>
                  {streamerbotActions.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="action-streamerbot"
                  className="text-field"
                  placeholder="Conecta Streamer.bot en Integraciones"
                  value={draft.streamerbotAction}
                  onChange={(event) => setDraft({ ...draft, streamerbotAction: event.target.value })}
                />
              )}
            </>
          ) : null}

          {usesWebhookOutput ? (
            <>
              <label className="field-label" htmlFor="action-webhook-url">
                URL webhook
              </label>
              <input
                id="action-webhook-url"
                className="text-field"
                placeholder="https://…"
                value={draft.webhookUrl}
                onChange={(event) => setDraft({ ...draft, webhookUrl: event.target.value })}
              />
              <label className="field-label" htmlFor="action-webhook-body">
                Cuerpo JSON (opcional)
              </label>
              <textarea
                id="action-webhook-body"
                className="text-area"
                placeholder='{"event":"gift"}'
                value={draft.webhookBody}
                onChange={(event) => setDraft({ ...draft, webhookBody: event.target.value })}
              />
            </>
          ) : null}

          {usesKeystrokeOutput ? (
            <>
              <label className="field-label" htmlFor="action-keystroke">
                Teclas / combo
              </label>
              <input
                id="action-keystroke"
                className="text-field"
                placeholder="Ej: ctrl+shift+p o F5"
                value={draft.keystrokeKeys}
                onChange={(event) => setDraft({ ...draft, keystrokeKeys: event.target.value })}
              />
            </>
          ) : null}

          {usesDelayOutput ? (
            <>
              <label className="field-label" htmlFor="action-delay">
                Segundos de espera
              </label>
              <input
                id="action-delay"
                type="number"
                min={0}
                className="text-field"
                value={draft.delaySeconds}
                onChange={(event) =>
                  setDraft({ ...draft, delaySeconds: Number(event.target.value) || 0 })
                }
              />
            </>
          ) : null}

          <label className="field-label" htmlFor="action-command">
            {usesChaosMod
              ? 'Payload opcional / nota'
              : usesGtavWebhook
                ? 'Nota opcional'
              : usesBedrockBox
                ? 'Comando de Bedrock Box'
                : 'Comando o payload'}
          </label>
          <input
            id="action-command"
            className="text-field"
            placeholder={
              usesChaosMod
                ? 'Opcional. Lo puedes usar como nota o payload adicional.'
                : usesGtavWebhook
                  ? 'Opcional. Puedes dejar una nota o texto auxiliar para la acción.'
                : usesBedrockBox
                  ? 'El preset completa este comando automaticamente, pero puedes ajustarlo.'
                  : 'Ej: /summon creeper ~ ~1 ~'
            }
            value={draft.commandText}
            onChange={(event) => setDraft({ ...draft, commandText: event.target.value })}
          />

          {usesMinecraftOutput ? (
            <>
              <label className="field-label" htmlFor="action-minecraft-mode">
                Integracion Minecraft
              </label>
              <select
                id="action-minecraft-mode"
                className="text-field"
                value={draft.minecraftMode}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    minecraftMode: event.target.value,
                    minecraftBedrockPresetId:
                      event.target.value === 'bedrock-box'
                        ? currentDraft.minecraftBedrockPresetId
                        : '',
                    minecraftBedrockPresetName:
                      event.target.value === 'bedrock-box'
                        ? currentDraft.minecraftBedrockPresetName
                        : '',
                  }))
                }
              >
                <option value="generic">RCON / bridge generico</option>
                <option value="bedrock-box">Bedrock Box</option>
              </select>

              {draft.minecraftMode === 'bedrock-box' ? (
                <>
                  <label className="field-label" htmlFor="action-bedrock-box-preset">
                    Preset de Bedrock Box
                  </label>
                  <div className="picker-toolbar">
                    <input
                      className="text-field"
                      placeholder="Busca por nombre, categoria o comando"
                      value={minecraftCommandSearch}
                      onChange={(event) => setMinecraftCommandSearch(event.target.value)}
                    />
                    <select
                      className="text-field picker-filter"
                      value={minecraftCommandCategory}
                      onChange={(event) => setMinecraftCommandCategory(event.target.value)}
                    >
                      <option value="all">Todas las categorias</option>
                      {availableBedrockBoxCategories
                        .filter((category) => category !== 'all')
                        .map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="command-gallery-grid">
                    {visibleBedrockBoxPresets.map((preset) => {
                      const presetVisual = getBedrockBoxCardMeta(preset)

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`command-picker-card ${
                            draft.minecraftBedrockPresetId === preset.id ? 'selected' : ''
                          }`}
                          onClick={() =>
                            setDraft((currentDraft) => ({
                              ...currentDraft,
                              minecraftBedrockPresetId: preset.id,
                              minecraftBedrockPresetName: preset.name,
                              commandText: preset.commandText,
                            }))
                          }
                        >
                          {preset.imageUrl ? (
                            <img className="gift-picker-image" src={preset.imageUrl} alt={preset.name} />
                          ) : (
                            <span
                              className="command-picker-thumb"
                              style={{ '--picker-accent': presetVisual.accent }}
                            >
                              {presetVisual.token}
                            </span>
                          )}
                          <strong>{preset.name}</strong>
                          <span>{preset.note}</span>
                        </button>
                      )
                    })}
                  </div>
                  <select
                    id="action-bedrock-box-preset"
                    className="text-field picker-native-select"
                    value={draft.minecraftBedrockPresetId}
                    onChange={(event) => {
                      const nextPreset =
                        BEDROCK_BOX_PRESETS.find((item) => item.id === event.target.value) || null

                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        minecraftBedrockPresetId: event.target.value,
                        minecraftBedrockPresetName: nextPreset?.name || '',
                        commandText: nextPreset?.commandText || currentDraft.commandText,
                      }))
                    }}
                  >
                    <option value="">Selecciona un preset</option>
                    {BEDROCK_BOX_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name} Â· {preset.category}
                      </option>
                    ))}
                  </select>

                  {selectedBedrockBoxPreset ? (
                    <p className="support-copy">
                      <strong>Seleccionado:</strong> {selectedBedrockBoxPreset.name}. Comando:
                      {' '}
                      <code>{selectedBedrockBoxPreset.commandText}</code>
                    </p>
                  ) : (
                    <p className="support-copy">
                      Estos presets salen de los comandos reales del plugin `s2e-bedrock-box` para
                      que no tengas que memorizar sintaxis ni escribirlos a mano en cada acción.
                    </p>
                  )}
                </>
              ) : null}
            </>
          ) : null}

          {usesGtaOutput ? (
            <>
              <label className="field-label" htmlFor="action-gta-mode">
                Integracion GTA
              </label>
              <select
                id="action-gta-mode"
                className="text-field"
                value={draft.type || 'chaosmod'}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    type: event.target.value,
                    gtaMode: event.target.value,
                    gtaChaosEffectId: event.target.value === 'chaosmod' ? currentDraft.gtaChaosEffectId : '',
                    gtaChaosEffectName:
                      event.target.value === 'chaosmod' ? currentDraft.gtaChaosEffectName : '',
                    gtaWebhookCommand:
                      event.target.value === 'gtavwebhook' ? currentDraft.gtaWebhookCommand : '',
                    gtaWebhookPayload:
                      event.target.value === 'gtavwebhook' ? currentDraft.gtaWebhookPayload : '',
                  }))
                }
              >
                <option value="chaosmod">Chaos Mod</option>
                <option value="gtavwebhook">GTAVWebhook / S2E</option>
              </select>

              {usesChaosMod ? (
                <>
                  <label className="field-label" htmlFor="action-chaosmod-effect">
                    Efecto de ChaosMod
                  </label>
                  <div className="picker-toolbar">
                    <input
                      className="text-field"
                      placeholder="Busca por nombre o categoria"
                      value={gtaCommandSearch}
                      onChange={(event) => setGtaCommandSearch(event.target.value)}
                    />
                    <select
                      className="text-field picker-filter"
                      value={gtaCommandCategory}
                      onChange={(event) => setGtaCommandCategory(event.target.value)}
                    >
                      <option value="all">Todas las categorias</option>
                      {availableChaosModCategories
                        .filter((category) => category !== 'all')
                        .map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="command-gallery-grid">
                    {visibleChaosModEffects.slice(0, 120).map((effect) => {
                      const effectVisual = getChaosModCardMeta(effect)

                      return (
                        <button
                          key={effect.id}
                          type="button"
                          className={`command-picker-card ${
                            draft.gtaChaosEffectId === effect.id ? 'selected' : ''
                          }`}
                          onClick={() =>
                            setDraft((currentDraft) => ({
                              ...currentDraft,
                              gtaChaosEffectId: effect.id,
                              gtaChaosEffectName: effect.name,
                            }))
                          }
                        >
                          <span
                            className="command-picker-thumb"
                            style={{ '--picker-accent': effectVisual.accent }}
                          >
                            {effectVisual.token}
                          </span>
                          <strong>{effect.name}</strong>
                          <span>{effect.categoryLabel || effect.category || 'General'}</span>
                        </button>
                      )
                    })}
                  </div>
                  <select
                    id="action-chaosmod-effect"
                    className="text-field picker-native-select"
                    value={draft.gtaChaosEffectId}
                    onChange={(event) => {
                      const nextEffect =
                        chaosModCatalog.find((item) => item.id === event.target.value) || null

                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        gtaChaosEffectId: event.target.value,
                        gtaChaosEffectName: nextEffect?.name || '',
                      }))
                    }}
                  >
                    <option value="">
                      {chaosModCatalog.length === 0
                        ? 'Todavia no llego el catalogo de ChaosMod'
                        : 'Selecciona un efecto'}
                    </option>
                    {chaosModCatalog.map((effect) => (
                      <option key={effect.id} value={effect.id}>
                        {effect.name} Â· {effect.categoryLabel}
                      </option>
                    ))}
                  </select>

                  {selectedChaosModEffect ? (
                    <p className="support-copy">
                      <strong>Seleccionado:</strong> {selectedChaosModEffect.name} (
                      {selectedChaosModEffect.categoryLabel || selectedChaosModEffect.category})
                    </p>
                  ) : (
                    <p className="support-copy">
                      El bridge local lee la carpeta de ChaosMod y sube esta lista al panel para
                      que no tengas que memorizar ids. Si luego quieres, le sumamos iconos propios
                      a estas tarjetas.
                    </p>
                  )}
                </>
              ) : null}

              {usesGtavWebhook ? (
                <>
                  <label className="field-label" htmlFor="action-gtavwebhook-preset">
                    Acciones sugeridas de GTAVWebhook
                  </label>
                  <select
                    id="action-gtavwebhook-preset"
                    className="text-field"
                    value={draft.gtaWebhookCommand}
                    onChange={(event) =>
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        gtaWebhookCommand: event.target.value,
                      }))
                    }
                  >
                    <option value="">Selecciona una acción sugerida</option>
                    {GTAV_WEBHOOK_COMMAND_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <label className="field-label" htmlFor="action-gtavwebhook-command">
                    Comando GTAVWebhook
                  </label>
                  <input
                    id="action-gtavwebhook-command"
                    className="text-field"
                    placeholder="Ej: spawn_vehicle"
                    value={draft.gtaWebhookCommand}
                    onChange={(event) =>
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        gtaWebhookCommand: event.target.value,
                      }))
                    }
                  />

                  <label className="field-label" htmlFor="action-gtavwebhook-payload">
                    Payload opcional
                  </label>
                  <textarea
                    id="action-gtavwebhook-payload"
                    className="text-area"
                    placeholder='Ej: {"vehicle":"adder"}'
                    value={draft.gtaWebhookPayload}
                    onChange={(event) =>
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        gtaWebhookPayload: event.target.value,
                      }))
                    }
                  />

                  {selectedGtavWebhookCommand ? (
                    <p className="support-copy">
                      <strong>Seleccionado:</strong> {selectedGtavWebhookCommand.label}.{' '}
                      {selectedGtavWebhookCommand.note}
                    </p>
                  ) : (
                    <p className="support-copy">
                      GTAVWebhook usa su propio sistema y no se mezcla con el catálogo de Chaos Mod.
                      Aquí definimos el comando y, si hace falta, un payload opcional.
                    </p>
                  )}
                </>
              ) : null}
            </>
          ) : null}

          {usesAlertOutput || usesTtsOutput ? (
            <>
              <label className="field-label" htmlFor="action-overlay">
                Texto para el overlay
              </label>
              <input
                id="action-overlay"
                className="text-field"
                placeholder="Mensaje que vera tu audiencia. Placeholders: {user}, {gift}, {coins}"
                value={draft.overlayText}
                onChange={(event) => setDraft({ ...draft, overlayText: event.target.value })}
              />
            </>
          ) : null}

          {usesMediaOutput || usesAudioOutput ? (
            <>
          <label className="field-label" htmlFor="action-media">
            Biblioteca local o URL manual
          </label>
          <input
            id="action-media"
            className="text-field"
            placeholder="Opcional. URL directa o selecciona un archivo local."
            value={draft.mediaUrl}
            onChange={(event) => setDraft({ ...draft, mediaUrl: event.target.value })}
          />

          <div className="card-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.4rem' }}>
            <label className="secondary-button upload-button">
              <UploadCloud size={18} /> {isUploadingMedia ? 'Subiendo...' : 'Subir a biblioteca'}
              <input
                type="file"
                hidden
                accept="image/*,video/*,audio/*,.gif,.webm,.mp4,.mp3,.wav,.png,.jpg,.jpeg,.webp,.svg"
                onChange={async (event) => {
                  const file = event.target.files?.[0]

                  if (!file) {
                    return
                  }

                  try {
                    const uploadedItem = await onUploadMedia(file)

                    if (uploadedItem) {
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        mediaUrl: uploadedItem.url,
                      }))
                    }
                  } catch {
                    return
                  } finally {
                    event.target.value = ''
                  }
                }}
              />
            </label>
            {selectedMediaItem ? (
              <span className="feedback-pill">Seleccionado: {selectedMediaItem.fileName}</span>
            ) : null}
          </div>

          {mediaLibraryError ? <div className="error-box">{mediaLibraryError}</div> : null}

          <div className="media-picker-grid">
            {mediaLibrary.length === 0 ? (
              <p className="support-copy">No hay archivos locales todavia.</p>
            ) : (
              mediaLibrary.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`media-picker-item ${draft.mediaUrl === item.url ? 'selected' : ''}`}
                  onClick={() => setDraft({ ...draft, mediaUrl: item.url })}
                >
                  <span className="bridge-badge">{item.kind}</span>
                  <strong>{item.fileName}</strong>
                  <code>{item.url}</code>
                </button>
              ))
            )}
          </div>
            </>
          ) : null}

          {errorMessage ? <div className="error-box">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              <Save size={18} /> {isEditing ? 'Guardar cambios' : 'Guardar acción'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EmoteCatalogModal({ initialEmote, isUploadingMedia, onClose, onSave, onUploadMedia }) {
  const [draft, setDraft] = useState(() => createEmoteDraft(initialEmote))
  const [errorMessage, setErrorMessage] = useState('')
  const isEditing = Boolean(initialEmote?.id)

  async function handleSubmit(event) {
    event.preventDefault()

    if (!draft.name.trim()) {
      setErrorMessage('Asigna un nombre al emote para identificarlo después.')
      return
    }

    try {
      await onSave({
        ...draft,
        id: draft.id.trim() || buildManualEmoteId(draft.name),
        name: draft.name.trim(),
        imageUrl: draft.imageUrl.trim(),
      })
    } catch (error) {
      setErrorMessage(error.message || 'No pude guardar el emote.')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <PremiumModalStyles />
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{isEditing ? 'Editar emote' : 'Nuevo emote'}</span>
            <h2>{isEditing ? 'Ajusta tu emote local' : 'Carga un emote para usarlo offline'}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="emote-name">
            Nombre visible
          </label>
          <input
            id="emote-name"
            className="text-field"
            placeholder="Ej: Corazon neon"
            value={draft.name}
            onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, name: event.target.value }))}
          />

          <label className="field-label" htmlFor="emote-id">
            ID o alias
          </label>
          <input
            id="emote-id"
            className="text-field"
            placeholder="Opcional. Si lo dejas vacio te genero uno manual."
            value={draft.id}
            onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, id: event.target.value }))}
          />

          <label className="field-label" htmlFor="emote-image-url">
            Imagen del emote
          </label>
          <input
            id="emote-image-url"
            className="text-field"
            placeholder="Pega una URL o sube la imagen a la biblioteca."
            value={draft.imageUrl}
            onChange={(event) =>
              setDraft((currentDraft) => ({ ...currentDraft, imageUrl: event.target.value }))
            }
          />

          <div className="card-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.4rem' }}>
            <label className="secondary-button upload-button">
              <UploadCloud size={18} /> {isUploadingMedia ? 'Subiendo...' : 'Subir imagen'}
              <input
                type="file"
                hidden
                accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg"
                onChange={async (event) => {
                  const file = event.target.files?.[0]

                  if (!file) {
                    return
                  }

                  try {
                    const uploadedItem = await onUploadMedia(file)

                    if (uploadedItem) {
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        imageUrl: uploadedItem.url,
                      }))
                    }
                  } finally {
                    event.target.value = ''
                  }
                }}
              />
            </label>
            <span className="feedback-pill">{getEmoteSourceLabel(draft.source)}</span>
          </div>

          {draft.imageUrl ? (
            <div className="sim-gift-preview">
              <img src={draft.imageUrl} alt={draft.name || 'Emote'} className="gift-picker-image" />
              <div>
                <strong>{draft.name || 'Vista previa'}</strong>
                <p>{draft.id || 'ID manual pendiente'}</p>
              </div>
            </div>
          ) : null}

          <p className="support-copy">
            Esto te permite configurar eventos de emotes de forma preventiva. Si después TikTok
            reporta ese mismo emote, el catalogo se sigue completando solo.
          </p>

          {errorMessage ? <div className="error-box">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              <Save size={18} /> {isEditing ? 'Guardar emote' : 'Agregar emote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TriggerModal({
  actions = [],
  emoteCatalog = [],
  giftCatalog = [],
  initialTrigger,
  knownUsers = [],
  onClose,
  onSave,
}) {
  const [draft, setDraft] = useState(() => createTriggerDraft(initialTrigger, actions))
  const [emoteSearch, setEmoteSearch] = useState('')
  const [giftSearch, setGiftSearch] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const isEditing = Boolean(initialTrigger?.id)
  const hasLiveGiftCatalog = Array.isArray(giftCatalog) && giftCatalog.length > 0
  const hasLiveEmoteCatalog = Array.isArray(emoteCatalog) && emoteCatalog.length > 0
  const availableGiftCatalog = (hasLiveGiftCatalog ? giftCatalog : CURATED_GIFT_CATALOG).map(
    (gift, index) => normalizeGiftCatalogForPicker(gift, index),
  )
  const availableEmoteCatalog = (hasLiveEmoteCatalog ? emoteCatalog : []).map((emote, index) =>
    normalizeEmoteCatalogForPicker(emote, index),
  )
  const selectedAction = actions.find((action) => action.id === draft.actionId) || null
  const selectedTriggerMeta =
    VISUAL_TRIGGER_OPTIONS.find((option) => option.id === draft.source) || VISUAL_TRIGGER_OPTIONS[0]
  const selectedAudienceMeta = getTriggerAudienceMeta(draft.audience)
  const isGlobalComment = draft.source === 'comment' && isGlobalCommentRule(draft.match)
  const giftRuleState = parseGiftTriggerMatch(draft.match)
  const selectedSpecificUsers = parseSpecificUsers(draft.specificUsersText)
  const availableKnownUsers = Array.from(
    new Set((knownUsers || []).map((userName) => normalizeUserHandle(userName)).filter(Boolean)),
  ).filter((userName) => !selectedSpecificUsers.includes(userName))
  const selectedEmote =
    availableEmoteCatalog.find(
      (emote) =>
        normalizePickerText(emote.name) === normalizePickerText(draft.match)
        || normalizePickerText(emote.id) === normalizePickerText(draft.match),
    ) || null
  const filteredGiftCatalog = availableGiftCatalog.filter((gift) => {
    const searchText = normalizePickerText(giftSearch)

    if (!searchText) {
      return true
    }

    return normalizePickerText(
      `${gift.name} ${gift.token} ${(gift.tags || []).join(' ')} ${gift.coins}`,
    ).includes(searchText)
  })
  const filteredEmoteCatalog = availableEmoteCatalog.filter((emote) => {
    const searchText = normalizePickerText(emoteSearch)

    if (!searchText) {
      return true
    }

    return normalizePickerText(`${emote.name} ${emote.id} ${emote.token}`).includes(searchText)
  })

  function handleSourceChange(nextSource) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      source: nextSource,
      match: DEFAULT_TRIGGER_MATCHES[nextSource] || currentDraft.match,
    }))
  }

  function handleGiftSelect(gift) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      source: 'gift',
      match: buildGiftTriggerMatch(gift.name, giftRuleState.repeatCount),
    }))
  }

  function handleGiftRepeatChange(nextValue) {
    const activeGiftName = giftRuleState.giftName || 'Rose'

    setDraft((currentDraft) => ({
      ...currentDraft,
      source: 'gift',
      match: buildGiftTriggerMatch(activeGiftName, nextValue),
    }))
  }

  function handleEmoteSelect(emote) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      source: 'emote',
      match: emote.name || emote.id,
    }))
  }

  function handleAudienceChange(nextAudience) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      audience: nextAudience,
    }))
  }

  function handleCommentModeChange(nextMode) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      source: 'comment',
      match: nextMode === 'global' ? 'Cualquier comentario' : currentDraft.match === 'Cualquier comentario' ? '' : currentDraft.match,
    }))
  }

  function appendSpecificUser(userName) {
    const normalizedUser = normalizeUserHandle(userName)

    if (!normalizedUser) {
      return
    }

    const nextUsers = Array.from(new Set([...selectedSpecificUsers, normalizedUser]))

    setDraft((currentDraft) => ({
      ...currentDraft,
      audience: 'specific-users',
      specificUsersText: nextUsers.join(', '),
    }))
  }

  function removeSpecificUser(userName) {
    const normalizedUser = normalizeUserHandle(userName)
    const nextUsers = selectedSpecificUsers.filter((currentUser) => currentUser !== normalizedUser)

    setDraft((currentDraft) => ({
      ...currentDraft,
      specificUsersText: nextUsers.join(', '),
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    const normalizedSpecificUsers = parseSpecificUsers(draft.specificUsersText)

    if (draft.audience === 'specific-users' && normalizedSpecificUsers.length === 0) {
      setErrorMessage('Agrega al menos un username si el evento es para usuario especifico.')
      return
    }

    if (!draft.match.trim()) {
      setErrorMessage('Define que evento o patron debe activar el trigger.')
      return
    }

    if (!draft.actionId) {
      setErrorMessage('Selecciona una acción para asignar a este evento.')
      return
    }

    const restDraft = { ...draft }
    delete restDraft.specificUsersText

    onSave({
      ...restDraft,
      platform: 'tiktok',
      match: draft.match.trim(),
      cooldownSeconds: draft.cooldownSeconds.trim() || '0',
      audience: draft.audience,
      specificUsers: normalizedSpecificUsers,
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <PremiumModalStyles />
      <div className="modal-card event-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{isEditing ? 'Editar evento' : 'Nuevo evento'}</span>
            <h2>{isEditing ? 'Ajusta quién lo activa y su comportamiento' : 'Conecta un evento con una acción'}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form className="modal-form event-modal-form" onSubmit={handleSubmit}>
          <p className="support-copy event-platform-hint">
            <span className="source-picker-token">TT</span> TikTok Live — el evento escucha tu directo conectado en Centro LIVE.
          </p>

          <div className="event-panel-copy event-panel-copy-primary">
            <h3>¿Qué debe activar este evento?</h3>
            <p>Elige el tipo (regalos, likes, follow, chat…) como en TikControl.</p>
          </div>

          <div className="event-type-grid">
            {VISUAL_TRIGGER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`event-type-card ${draft.source === option.id ? 'selected' : ''}`}
                onClick={() => handleSourceChange(option.id)}
              >
                <span className="event-type-token">{option.token}</span>
                <strong>{option.label}</strong>
                <span>{option.note}</span>
              </button>
            ))}
          </div>

          <section className="event-modal-panel event-modal-panel-single">
              <div className="event-panel-copy">
                <h3>Detalle — {selectedTriggerMeta.label}</h3>
                <p>{selectedTriggerMeta.note}</p>
              </div>

              {draft.source === 'gift' ? (
                <div className="asset-picker-shell">
                  <div className="picker-toolbar">
                    <input
                      className="text-field"
                      placeholder="Buscar regalo"
                      value={giftSearch}
                      onChange={(event) => setGiftSearch(event.target.value)}
                    />
                    <input
                      className="text-field picker-filter"
                      inputMode="numeric"
                      placeholder="x1"
                      value={giftRuleState.repeatCount}
                      onChange={(event) => handleGiftRepeatChange(event.target.value)}
                    />
                  </div>
                  <div className="asset-picker-list">
                    {filteredGiftCatalog.length === 0 ? (
                      <p className="support-copy">No encontre regalos con ese filtro.</p>
                    ) : (
                      filteredGiftCatalog.map((gift) => (
                        <button
                          key={gift.id}
                          type="button"
                          className={`asset-picker-row ${
                            normalizePickerText(giftRuleState.giftName) === normalizePickerText(gift.name)
                              ? 'selected'
                              : ''
                          }`}
                          onClick={() => handleGiftSelect(gift)}
                        >
                          {gift.imageUrl ? (
                            <img className="gift-picker-image" src={gift.imageUrl} alt={gift.name} />
                          ) : (
                            <span className="gift-picker-thumb" style={{ '--picker-accent': gift.accent }}>
                              {gift.token}
                            </span>
                          )}
                          <span className="asset-picker-copy">
                            <strong>{gift.name}</strong>
                            <span>
                              {gift.coins} coin{gift.coins === 1 ? '' : 's'} Â· ID:{gift.id}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <p className="support-copy">
                    {hasLiveGiftCatalog
                      ? 'Catalogo real sincronizado desde TikTok.'
                      : 'Usando una lista curada temporal hasta que sincronices gifts reales.'}
                  </p>
                </div>
              ) : null}

              {draft.source === 'emote' ? (
                <div className="asset-picker-shell">
                  <input
                    className="text-field"
                    placeholder="Buscar emote"
                    value={emoteSearch}
                    onChange={(event) => setEmoteSearch(event.target.value)}
                  />
                  <div className="asset-picker-list">
                    {filteredEmoteCatalog.length === 0 ? (
                      <p className="support-copy">
                        {hasLiveEmoteCatalog
                          ? 'No encontre emotes con ese filtro.'
                          : 'Los emotes van a aparecer aqui cuando alguien los mande en tu live.'}
                      </p>
                    ) : (
                      filteredEmoteCatalog.map((emote) => (
                        <button
                          key={emote.id}
                          type="button"
                          className={`asset-picker-row ${selectedEmote?.id === emote.id ? 'selected' : ''}`}
                          onClick={() => handleEmoteSelect(emote)}
                        >
                          {emote.imageUrl ? (
                            <img className="gift-picker-image" src={emote.imageUrl} alt={emote.name} />
                          ) : (
                            <span className="gift-picker-thumb" style={{ '--picker-accent': emote.accent }}>
                              {emote.token}
                            </span>
                          )}
                          <span className="asset-picker-copy">
                            <strong>{emote.name}</strong>
                            <span>{emote.id}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <p className="support-copy">
                    {hasLiveEmoteCatalog
                      ? 'Catalogo de emotes aprendido desde tu live.'
                      : 'Todavia no vimos emotes en este live. Puedes agregarlos antes desde la biblioteca local.'}
                  </p>
                </div>
              ) : null}

              {draft.source === 'comment' ? (
                <div className="asset-picker-shell">
                  <div className="event-option-list compact">
                    {COMMENT_TRIGGER_OPTIONS.map((option) => {
                      const selected = option.id === 'global' ? isGlobalComment : !isGlobalComment

                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`event-option-row ${selected ? 'selected' : ''}`}
                          onClick={() => handleCommentModeChange(option.id)}
                        >
                          <span className="event-option-radio" />
                          <span className="event-option-copy">
                            <strong>{option.label}</strong>
                            <span>{option.note}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {isGlobalComment ? (
                    <div className="support-copy">
                      Cualquier comentario en el chat activará esta acción. Es ideal para overlays reactivos o filtros globales.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <label className="field-label" htmlFor="trigger-match">
                Regla final del evento
              </label>
              <input
                id="trigger-match"
                className="text-field"
                disabled={isGlobalComment}
                placeholder={
                  draft.source === 'gift'
                    ? 'Ej: Rose x1'
                    : draft.source === 'emote'
                      ? 'Ej: Heart Me'
                      : draft.source === 'comment'
                        ? 'Ej: !chaos'
                        : draft.source === 'like-burst'
                          ? 'Ej: 100 likes'
                          : `Ej: ${DEFAULT_TRIGGER_MATCHES[draft.source] || 'Cualquier evento'}`
                }
                value={draft.match}
                onChange={(event) => setDraft({ ...draft, match: event.target.value })}
              />

              <label className="field-label" htmlFor="trigger-action">
                Activar esta acción
              </label>
              <div className="action-picker-grid event-action-picker-grid">
                {actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={`action-picker-card ${draft.actionId === action.id ? 'selected' : ''}`}
                    onClick={() => setDraft({ ...draft, actionId: action.id })}
                  >
                    <strong>{action.name}</strong>
                    <span>{action.description || 'Sin descripcion todavia.'}</span>
                    <div className="tag-row">
                      {action.outputs.map((output) => (
                        <span key={output} className="tag">
                          {getOutputMeta(output)?.label || output}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
              {selectedAction ? (
                <p className="support-copy">
                  <strong>Accion elegida:</strong> {selectedAction.name}
                </p>
              ) : null}

              <details className="event-audience-details">
                <summary>¿Quién puede activarlo? (opcional — por defecto: todos)</summary>
                <div className="event-option-list compact">
                  {TRIGGER_AUDIENCE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`event-option-row ${draft.audience === option.id ? 'selected' : ''}`}
                      onClick={() => handleAudienceChange(option.id)}
                    >
                      <span className="event-option-radio" />
                      <span className="event-option-copy">
                        <strong>{option.label}</strong>
                        <span>{option.note}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {draft.audience === 'specific-users' ? (
                  <div className="event-user-manager">
                    {availableKnownUsers.length > 0 ? (
                      <select
                        className="text-field"
                        value=""
                        onChange={(event) => appendSpecificUser(event.target.value)}
                      >
                        <option value="">Añadir usuario conocido…</option>
                        {availableKnownUsers.map((userName) => (
                          <option key={userName} value={userName}>
                            {userName}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <textarea
                      className="text-field event-users-input"
                      placeholder="user1, user2"
                      value={draft.specificUsersText}
                      onChange={(event) =>
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          specificUsersText: event.target.value,
                        }))
                      }
                    />
                    {selectedSpecificUsers.length > 0 ? (
                      <div className="event-user-chip-row">
                        {selectedSpecificUsers.map((userName) => (
                          <button
                            key={userName}
                            type="button"
                            className="event-user-chip"
                            onClick={() => removeSpecificUser(userName)}
                          >
                            <span>{userName}</span>
                            <span>×</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </details>

              <label className="field-label" htmlFor="trigger-cooldown">
                Cooldown global (segundos)
              </label>
              <input
                id="trigger-cooldown"
                className="text-field"
                inputMode="numeric"
                value={draft.cooldownSeconds}
                onChange={(event) => setDraft({ ...draft, cooldownSeconds: event.target.value })}
              />
            </section>

          {errorMessage ? <div className="error-box">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              <Save size={18} /> {isEditing ? 'Guardar evento' : 'Crear evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export { ActionModal, EmoteCatalogModal, TriggerModal }
