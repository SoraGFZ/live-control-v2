import { useCallback, useEffect, useRef, useState } from 'react'

import {
  buildLiveStudioOverlayAlertsUrl,
  buildLiveStudioTopGiftsUrl,
  buildLiveStudioTopLikesUrl,
  buildOverlayUrl,
  buildTopGiftsUrl,
  buildTopLikesUrl,
  buildSongRequestUrl,
  buildSmartBarUrl,
  isLiveStudioRejectedTunnel,
  mergeStateWithDefaults,
  normalizeBaseUrl,
  sanitizeSlug,
} from '../live-control'
import { useTikTokLiveOps } from './useTikTokLiveOps'
import { useAutomationWorkspace } from './useAutomationWorkspace'
import { useServiceHealth } from './useServiceHealth'
import {
  APP_STORAGE_KEY,
  buildManualEmoteId,
  createDashboardStatePayload,
  createSocketUrl,
  DEFAULT_SERVER_STATUS,
  mergeServerStatus,
  getDesktopBridgeApi,
  getStateRevision,
  normalizeUserHandle,
  readStoredDashboardAccessKey,
  readStoredState,
  requestJson,
  sanitizeStateForBackup,
  sanitizeStateForCache,
  writeStoredDashboardAccessKey,
  WORKSPACE_SECTIONS,
} from '../dashboardShared'
import {
  appendOverlayWidgetViewParam,
  normalizeDesktopDashboardUrl,
  readWorkspacePanelFromUrl,
} from '../dashboardViewHelpers'
import { buildOverlayScreens } from '../config/actionsEventsHelpers'

function resolveInitialWorkspaceSection(initialPanelSection) {
  const fromUrl = readWorkspacePanelFromUrl()
  const candidate = initialPanelSection || fromUrl || 'live-hub'
  const allowed = new Set(WORKSPACE_SECTIONS.map((section) => section.id))

  return allowed.has(candidate) ? candidate : 'live-hub'
}

export function useDashboardController({ initialPanelSection = null } = {}) {
  const [appState, setAppState] = useState(() => readStoredState())
  const [showEmoteModal, setShowEmoteModal] = useState(false)
  const [editingEmoteId, setEditingEmoteId] = useState('')
  const [dashboardAccessKey, setDashboardAccessKey] = useState(() => readStoredDashboardAccessKey())
  const [dashboardAuthDraft, setDashboardAuthDraft] = useState(() => readStoredDashboardAccessKey())
  const [dashboardAuthError, setDashboardAuthError] = useState('')
  const [requiresDashboardAuth, setRequiresDashboardAuth] = useState(false)
  const [linkFeedback, setLinkFeedback] = useState('')
  const [mediaLibrary, setMediaLibrary] = useState([])
  const [mediaLibraryError, setMediaLibraryError] = useState('')
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [serverStatus, setServerStatus] = useState(DEFAULT_SERVER_STATUS)
  const [serverError, setServerError] = useState('')
  const [isHydrated, setIsHydrated] = useState(false)
  const [isSavingState, setIsSavingState] = useState(false)
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState(() =>
    resolveInitialWorkspaceSection(initialPanelSection),
  )
  const [desktopContext, setDesktopContext] = useState({
    isDesktopApp: false,
  })
  const [backupFeedback, setBackupFeedback] = useState('')
  const [isImportingBackup, setIsImportingBackup] = useState(false)
  const lastSyncedSnapshotRef = useRef('')
  const isMountedRef = useRef(true)
  const backupImportInputRef = useRef(null)
  const effectiveWorkspaceSection =
    activeWorkspaceSection === 'triggers' || activeWorkspaceSection === 'simulations'
      ? 'actions'
      : activeWorkspaceSection

  const syncDashboardAccessKey = useCallback((value) => {
    const normalizedValue = String(value || '').trim()
    writeStoredDashboardAccessKey(normalizedValue)
    setDashboardAccessKey(normalizedValue)
    setDashboardAuthDraft(normalizedValue)
  }, [])

  const handleDashboardUnauthorized = useCallback((message, preserveDraft = false) => {
    writeStoredDashboardAccessKey('')
    setDashboardAccessKey('')
    setRequiresDashboardAuth(true)
    setDashboardAuthError(message || 'Necesitas la clave del panel para continuar.')

    if (!preserveDraft) {
      setDashboardAuthDraft('')
    }
  }, [])

  const handleProtectedRequestError = useCallback((error, fallbackSetter) => {
    if (error?.status === 401) {
      handleDashboardUnauthorized(error.message)
      return true
    }

    fallbackSetter(error.message)
    return false
  }, [handleDashboardUnauthorized])

  function updateDashboardState(updater) {
    setAppState((currentState) => {
      const nextState = typeof updater === 'function' ? updater(currentState) : updater

      return {
        ...nextState,
        updatedAt: Date.now(),
      }
    })
  }

  const loadInitialState = useCallback(
    async (accessKey = dashboardAccessKey, preserveDraft = false) => {
      const cachedState = readStoredState()

      try {
        const [serverState, statusPayload, mediaPayload] = await Promise.all([
          requestJson('/api/state', {}, accessKey),
          requestJson('/api/status', {}, accessKey),
          requestJson('/api/media', {}, accessKey),
        ])
        const mergedServerState = mergeStateWithDefaults(serverState)
        const initialSnapshot = JSON.stringify(mergedServerState)
        const shouldPreferCachedState =
          getStateRevision(cachedState) > getStateRevision(mergedServerState)
        const preferredState = shouldPreferCachedState
          ? mergeStateWithDefaults({
              ...cachedState,
              profile: {
                ...cachedState.profile,
                dashboardKey: mergedServerState.profile.dashboardKey,
                overlayKey: mergedServerState.profile.overlayKey,
              },
              integrations: {
                ...mergedServerState.integrations,
                tiktok: {
                  ...mergedServerState.integrations?.tiktok,
                  emoteCatalog:
                    cachedState.integrations?.tiktok?.emoteCatalog?.length > 0
                      ? cachedState.integrations.tiktok.emoteCatalog
                      : mergedServerState.integrations?.tiktok?.emoteCatalog || [],
                },
              },
              music: mergedServerState.music,
              widgets: mergedServerState.widgets,
            })
          : mergedServerState

        setAppState(preferredState)
        setServerStatus(mergeServerStatus(statusPayload))
        setMediaLibrary(mediaPayload)
        setMediaLibraryError('')
        setServerError('')
        setRequiresDashboardAuth(false)
        lastSyncedSnapshotRef.current = shouldPreferCachedState
          ? JSON.stringify(preferredState)
          : initialSnapshot
        syncDashboardAccessKey(preferredState.profile.dashboardKey || accessKey)
        if (!preserveDraft) {
          setDashboardAuthDraft(preferredState.profile.dashboardKey || accessKey || '')
        }
      } catch (error) {
        if (error?.status === 401) {
          handleDashboardUnauthorized(error.message, preserveDraft)
        } else {
          setServerError(
            error.message
            || 'No pude hablar con el backend. Ejecuta npm run dev para levantar toda la app.',
          )
          setMediaLibraryError('La biblioteca local necesita que el backend este corriendo.')
          setRequiresDashboardAuth(false)
        }
      } finally {
        if (isMountedRef.current) {
          setIsHydrated(true)
        }
      }
    },
    [dashboardAccessKey, handleDashboardUnauthorized, syncDashboardAccessKey],
  )

  const {
    showActionModal,
    editingActionId,
    showTriggerModal,
    editingTriggerId,
    addAction,
    updateAction,
    removeAction,
    addTrigger,
    updateTrigger,
    removeTrigger,
    openCreateActionModal,
    openEditActionModal,
    closeActionModal,
    openCreateTriggerModal,
    openEditTriggerModal,
    closeTriggerModal,
  } = useAutomationWorkspace({
    updateDashboardState,
  })

  const {
    tiktokUsernameDraft,
    setTiktokUsernameDraft,
    isImportingTikTokSession,
    isSyncingGiftCatalog,
    isSyncingEmoteCatalog,
    connectTikTok,
    disconnectTikTok,
    importTikTokSessionFromDesktop,
    syncTikTokGiftCatalog,
    syncTikTokEmoteCatalog,
  } = useTikTokLiveOps({
    appState,
    dashboardAccessKey,
    loadInitialState,
    updateDashboardState,
    handleProtectedRequestError,
    setServerError,
    getDesktopBridgeApi,
    requestJson,
  })

  // Monitorea la salud de los servicios (backend, bridge, GTA)
  const { health: serviceHealth, canTestActions } = useServiceHealth(dashboardAccessKey, {
    pollingIntervalMs: 3000,
  })

  useEffect(() => {
    setTiktokUsernameDraft(String(appState.profile.tiktokUsername || ''))
  }, [appState.profile.tiktokUsername, setTiktokUsernameDraft])

  useEffect(() => {
    isMountedRef.current = true
    document.documentElement.dataset.route = 'dashboard'
    document.body.dataset.route = 'dashboard'

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    function syncWorkspaceSectionFromUrl() {
      normalizeDesktopDashboardUrl()
      const panel = readWorkspacePanelFromUrl()

      if (!panel) {
        return
      }

      setActiveWorkspaceSection((currentSection) =>
        currentSection === panel ? currentSection : panel,
      )
    }

    syncWorkspaceSectionFromUrl()
    window.addEventListener('popstate', syncWorkspaceSectionFromUrl)

    return () => {
      window.removeEventListener('popstate', syncWorkspaceSectionFromUrl)
    }
  }, [])

  useEffect(() => {
    const desktopBridge = getDesktopBridgeApi()

    if (!desktopBridge) {
      return undefined
    }

    let isCancelled = false

    desktopBridge
      .getContext()
      .then((context) => {
        if (!isCancelled) {
          setDesktopContext({
            isDesktopApp: Boolean(context?.isDesktopApp),
          })
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setDesktopContext({ isDesktopApp: false })
        }
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(sanitizeStateForCache(appState)))
  }, [appState])

  useEffect(() => {
    loadInitialState()
  }, [loadInitialState])

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const spotifyResult = params.get('spotify')

    if (!spotifyResult) {
      return
    }

    if (spotifyResult === 'connected') {
      setLinkFeedback('Spotify conectado. Ya puedes elegir dispositivo y activar Song Request.')
      void loadInitialState(dashboardAccessKey, true)
      setActiveWorkspaceSection('music')
    } else if (spotifyResult === 'error') {
      setLinkFeedback('Spotify no autorizo la sesion. Revisa Client ID, Secret y Redirect URI.')
      setActiveWorkspaceSection('music')
    }

    params.delete('spotify')
    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || '#music'}`
    window.history.replaceState({}, '', nextUrl)
  }, [isHydrated, dashboardAccessKey, loadInitialState])

  useEffect(() => {
    if (!isHydrated || requiresDashboardAuth) {
      return undefined
    }

    const snapshot = JSON.stringify(appState)

    if (snapshot === lastSyncedSnapshotRef.current) {
      return undefined
    }

    const timeoutId = window.setTimeout(async () => {
      const payload = createDashboardStatePayload(appState)
      try {
        setIsSavingState(true)
        const savedState = await requestJson(
          '/api/state',
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          },
          dashboardAccessKey,
        )
        const savedSnapshot = JSON.stringify(savedState)
        lastSyncedSnapshotRef.current = savedSnapshot
        setAppState((currentState) =>
          getStateRevision(currentState) > getStateRevision(savedState) ? currentState : savedState,
        )
        setServerError('')
      } catch (error) {
        handleProtectedRequestError(error, setServerError)
      } finally {
        if (isMountedRef.current) {
          setIsSavingState(false)
        }
      }
    }, 350)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [appState, dashboardAccessKey, handleProtectedRequestError, isHydrated, requiresDashboardAuth])

  useEffect(() => {
    function flushPendingState() {
      const snapshot = JSON.stringify(appState)

      if (!isHydrated || requiresDashboardAuth || snapshot === lastSyncedSnapshotRef.current) {
        return
      }

      const requestUrl = dashboardAccessKey
        ? `/api/state?key=${encodeURIComponent(dashboardAccessKey)}`
        : '/api/state'

      navigator.sendBeacon(
        requestUrl,
        new Blob([JSON.stringify(createDashboardStatePayload(appState))], {
          type: 'application/json',
        }),
      )
    }

    window.addEventListener('beforeunload', flushPendingState)
    return () => {
      window.removeEventListener('beforeunload', flushPendingState)
    }
  }, [appState, dashboardAccessKey, isHydrated, requiresDashboardAuth])

  useEffect(() => {
    if (requiresDashboardAuth) {
      return undefined
    }

    const socketUrl = createSocketUrl('/api/stream')
    let socket
    let reconnectTimeoutId
    let isStopped = false

    function connectSocket() {
      if (isStopped) {
        return
      }

      socket = new WebSocket(socketUrl)
      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data)

          if (payload.type === 'status' || payload.type === 'server-status') {
            const statusPatch = payload.payload || payload.data || payload.status
            if (statusPatch) {
              setServerStatus((currentStatus) => mergeServerStatus({ ...currentStatus, ...statusPatch }))
            }
          } else if (payload.type === 'overlay-event') {
            const overlayEvent = payload.payload || payload.data || null
            setServerStatus((currentStatus) => ({
              ...currentStatus,
              overlays: {
                ...currentStatus.overlays,
                lastEvent: overlayEvent,
              },
            }))

            const ttsText = String(overlayEvent?.ttsText || '').trim()
            const ttsAudioUrl = String(overlayEvent?.ttsAudioUrl || '').trim()
            if (ttsText || ttsAudioUrl) {
              window.dispatchEvent(
                new CustomEvent('live-control:action-tts', {
                  detail: { text: ttsText, audioUrl: ttsAudioUrl },
                }),
              )
            }
          } else if (payload.type === 'tts:play') {
            const ttsPayload = payload.payload || payload.data || {}
            const ttsText = String(ttsPayload.text || '').trim()
            const ttsAudioUrl = String(ttsPayload.audioUrl || '').trim()
            if (ttsText || ttsAudioUrl) {
              window.dispatchEvent(
                new CustomEvent('live-control:action-tts', {
                  detail: { text: ttsText, audioUrl: ttsAudioUrl },
                }),
              )
            }
          } else if (payload.type === 'state-updated' || payload.type === 'state') {
            const mergedState = mergeStateWithDefaults(payload.data || payload.payload)
            const mergedSnapshot = JSON.stringify(mergedState)
            lastSyncedSnapshotRef.current = mergedSnapshot
            setAppState(mergedState)
          } else if (payload.type === 'spotify-session') {
            setServerStatus((currentStatus) => ({
              ...currentStatus,
              music: {
                ...currentStatus.music,
                connected: Boolean(payload.connected),
              },
            }))
          }
        } catch {
          // Ignore malformed socket payloads.
        }
      }
      socket.onclose = () => {
        if (!isStopped) {
          reconnectTimeoutId = window.setTimeout(connectSocket, 1400)
        }
      }
    }

    const initialConnectTimeoutId = window.setTimeout(connectSocket, 600)

    return () => {
      isStopped = true
      window.clearTimeout(initialConnectTimeoutId)
      window.clearTimeout(reconnectTimeoutId)
      socket?.close()
    }
  }, [requiresDashboardAuth])

  const overlaySlug = sanitizeSlug(appState.profile.overlaySlug)
  const localBaseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const remoteBaseUrl = appState.profile.publicBaseUrl || localBaseUrl
  const localOverlayUrl = buildOverlayUrl(localBaseUrl, overlaySlug, appState.profile.overlayKey)
  const publicOverlayUrl = appState.profile.publicBaseUrl
    ? buildOverlayUrl(appState.profile.publicBaseUrl, overlaySlug, appState.profile.overlayKey)
    : ''
  const localSmartBarUrl = buildSmartBarUrl(localBaseUrl, overlaySlug, appState.profile.overlayKey)
  const publicSmartBarUrl = appState.profile.publicBaseUrl
    ? buildSmartBarUrl(appState.profile.publicBaseUrl, overlaySlug, appState.profile.overlayKey)
    : ''
  // For OBS / Live Studio links: automatically use the public base if set, so all widget URLs
  // switch to the new public address (e.g. Render) without the user having to manually pick "public" versions.
  // The true localBase is kept only for "open local preview" buttons where possible.
  const effectiveBase = appState.profile.publicBaseUrl || localBaseUrl
  const localSongRequestUrl = buildSongRequestUrl(
    effectiveBase,
    overlaySlug,
    appState.profile.overlayKey,
  )
  const publicSongRequestUrl = appState.profile.publicBaseUrl
    ? buildSongRequestUrl(appState.profile.publicBaseUrl, overlaySlug, appState.profile.overlayKey)
    : ''
  const localTopLikesUrl = buildTopLikesUrl(effectiveBase, overlaySlug, appState.profile.overlayKey)
  const publicTopLikesUrl = appState.profile.publicBaseUrl
    ? buildTopLikesUrl(appState.profile.publicBaseUrl, overlaySlug, appState.profile.overlayKey)
    : ''
  const localTopGiftsUrl = buildTopGiftsUrl(effectiveBase, overlaySlug, appState.profile.overlayKey)
  const publicTopGiftsUrl = appState.profile.publicBaseUrl
    ? buildTopGiftsUrl(appState.profile.publicBaseUrl, overlaySlug, appState.profile.overlayKey)
    : ''
  const liveStudioTopLikesUrl = appState.profile.publicBaseUrl
    ? buildLiveStudioTopLikesUrl(
        appState.profile.publicBaseUrl,
        overlaySlug,
        appState.profile.overlayKey,
      )
    : ''
  const liveStudioTopGiftsUrl = appState.profile.publicBaseUrl
    ? buildLiveStudioTopGiftsUrl(
        appState.profile.publicBaseUrl,
        overlaySlug,
        appState.profile.overlayKey,
      )
    : ''
  const liveStudioOverlayUrl = appState.profile.publicBaseUrl
    ? buildLiveStudioOverlayAlertsUrl(
        appState.profile.publicBaseUrl,
        overlaySlug,
        appState.profile.overlayKey,
      )
    : ''
  const liveStudioTunnelRejected = isLiveStudioRejectedTunnel(appState.profile.publicBaseUrl)
  const preferredOverlayUrl = publicOverlayUrl || localOverlayUrl

  // Preferred URLs for OBS / Live Studio: automatically use publicBaseUrl if set,
  // so all widget links switch to the new public address (e.g. Render) without manual copy of "public" versions.
  const songRequestUrl = publicSongRequestUrl || localSongRequestUrl
  const topLikesUrl = publicTopLikesUrl || localTopLikesUrl
  const topGiftsUrl = publicTopGiftsUrl || localTopGiftsUrl
  const smartBarUrl = publicSmartBarUrl || localSmartBarUrl
  const overlayUrl = publicOverlayUrl || localOverlayUrl

  // Screen overlays (the 10 ?screen=N variants used in Acciones y Eventos > Pantallas)
  // Use effectiveBase so that when publicBaseUrl is set, all pantalla URLs already have the user's domain (no 127).
  const overlayScreens = buildOverlayScreens(effectiveBase, appState.profile)

  const chaosModCatalog = appState.integrations?.chaosmod?.catalog || []
  const tikTokGiftCatalog = Array.isArray(appState.integrations?.tiktok?.giftCatalog)
    ? appState.integrations.tiktok.giftCatalog
    : []
  const tikTokEmoteCatalog = Array.isArray(appState.integrations?.tiktok?.emoteCatalog)
    ? appState.integrations.tiktok.emoteCatalog
    : []
  const knownLiveUsers = Array.from(
    new Set(
      (serverStatus.tikTok?.recentUsers || [])
        .map((user) => normalizeUserHandle(user?.uniqueId || user?.nickname || user))
        .filter(Boolean),
    ),
  )
  const editingAction =
    appState.actions.find((action) => action.id === editingActionId) || null
  const editingEmote =
    tikTokEmoteCatalog.find((emote) => String(emote.id) === editingEmoteId) || null
  const editingTrigger =
    appState.triggers.find((trigger) => trigger.id === editingTriggerId) || null

  const readyOutputs = new Set()
  appState.actions.forEach((action) => action.outputs.forEach((output) => readyOutputs.add(output)))
  const workspaceSections = WORKSPACE_SECTIONS.map((section) => {
    if (section.id === 'live-hub') {
      return {
        ...section,
        meta: serverStatus.tikTok?.connected ? 'Live activo' : 'Listo para conectar',
      }
    }

    if (section.id === 'overview') {
      return {
        ...section,
        meta: `${appState.actions.length} acciones · ${appState.triggers.length} triggers`,
      }
    }

    if (section.id === 'live-ops') {
      return {
        ...section,
        meta: serverStatus.tikTok?.connected ? 'Live conectado' : 'Esperando live',
      }
    }

    if (section.id === 'games') {
      const gameActions = appState.actions.filter(
        (action) => action.outputs.includes('minecraft') || action.outputs.includes('gta'),
      ).length

      return {
        ...section,
        meta: `${gameActions} acciones de juego`,
      }
    }

    if (section.id === 'music') {
      return {
        ...section,
        meta: serverStatus.music?.connected ? 'Spotify conectado' : 'Spotify opcional',
      }
    }

    if (section.id === 'actions') {
      return {
        ...section,
        meta: `${appState.actions.length} guardadas`,
      }
    }

    if (section.id === 'triggers') {
      return {
        ...section,
        meta: `${appState.triggers.length} activas`,
      }
    }

    if (section.id === 'overlay') {
      return {
        ...section,
        meta: serverStatus.bridges?.overlayClients
          ? `${serverStatus.bridges.overlayClients} overlay activo`
          : 'Listo para LIVE Studio',
      }
    }

    if (section.id === 'tts') {
      return {
        ...section,
        meta: 'Texto a voz',
      }
    }

    if (section.id === 'simulations') {
      return {
        ...section,
        meta: 'Tests del backend',
      }
    }

    const totalBridgeClients =
      Number(serverStatus.bridges?.minecraftClients || 0) + Number(serverStatus.bridges?.gtaClients || 0)

    return {
      ...section,
      meta: totalBridgeClients ? `${totalBridgeClients} bridge activo` : 'Panel tecnico',
    }
  })

  function updateProfileField(field, value) {
    updateDashboardState((currentState) => ({
      ...currentState,
      profile: {
        ...currentState.profile,
        [field]:
          field === 'overlaySlug'
            ? sanitizeSlug(value)
            : field === 'publicBaseUrl'
              ? normalizeBaseUrl(value)
              : value,
      },
    }))
  }

  function updateTtsField(field, value) {
    updateDashboardState((currentState) => ({
      ...currentState,
      tts: {
        ...currentState.tts,
        [field]: value,
      },
    }))
  }

  function updateTtsConfig(partialConfig = {}) {
    updateDashboardState((currentState) => ({
      ...currentState,
      tts: {
        ...currentState.tts,
        ...partialConfig,
      },
    }))
  }

  function updateMusicField(field, value) {
    updateDashboardState((currentState) => ({
      ...currentState,
      music: {
        ...currentState.music,
        [field]: typeof value === 'string' ? value : value,
      },
    }))
  }

  function updateSmartBarField(field, value) {
    updateDashboardState((currentState) => ({
      ...currentState,
      widgets: {
        ...currentState.widgets,
        smartBar: {
          ...currentState.widgets?.smartBar,
          [field]: value,
        },
      },
    }))
  }

  function updateTopLikesWidgetField(field, value) {
    updateDashboardState((currentState) => ({
      ...currentState,
      widgets: {
        ...currentState.widgets,
        topLikes: {
          ...currentState.widgets?.topLikes,
          [field]: value,
        },
      },
    }))
  }

  function updateTopGiftsWidgetField(field, value) {
    updateDashboardState((currentState) => ({
      ...currentState,
      widgets: {
        ...currentState.widgets,
        topGifts: {
          ...currentState.widgets?.topGifts,
          [field]: value,
        },
      },
    }))
  }

  async function resetLeaderboards() {
    try {
      await requestJson(
        '/api/leaderboards/reset',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      await refreshServerStatus()
      setLinkFeedback('Rankings reiniciados')
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function refreshServerStatus() {
    const statusPayload = await requestJson('/api/status', {}, dashboardAccessKey)
    setServerStatus((currentStatus) => mergeServerStatus({ ...currentStatus, ...statusPayload }))
  }

  async function seedLeaderboardDemo(mode) {
    try {
      await requestJson(
        '/api/leaderboards/demo',
        {
          method: 'POST',
          body: JSON.stringify({ mode }),
        },
        dashboardAccessKey,
      )
      await refreshServerStatus()
      setLinkFeedback(
        mode === 'likes'
          ? 'Prueba de Top Likes cargada'
          : mode === 'gifts'
            ? 'Prueba de Top Gifts cargada'
            : 'Prueba de rankings cargada',
      )
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      setLinkFeedback('No pude cargar la prueba del ranking.')
    }
  }

  function testTopLikesWidget() {
    return seedLeaderboardDemo('likes')
  }

  function testTopGiftsWidget() {
    return seedLeaderboardDemo('gifts')
  }

  function warnNgrokPublicUrl(publicUrl) {
    if (publicUrl && /ngrok/i.test(publicUrl)) {
      setLinkFeedback('URL ngrok: TikTok muestra Visit Site. Usa hosting fijo u OBS como puente.')
      window.setTimeout(() => setLinkFeedback(''), 4200)
      return true
    }

    return false
  }

  function warnLiveStudioTunnel(publicUrl) {
    if (publicUrl && isLiveStudioRejectedTunnel(publicUrl)) {
      setLinkFeedback(
        'TikTok no acepta trycloudflare/loca.lt. Usa ngrok o despliega en Render/dominio propio.',
      )
      window.setTimeout(() => setLinkFeedback(''), 4800)
      return true
    }

    return false
  }

  async function copyLiveStudioTopLikesUrl() {
    const targetUrl = liveStudioTopLikesUrl || localTopLikesUrl

    if (warnLiveStudioTunnel(liveStudioTopLikesUrl)) {
      return
    }

    try {
      await navigator.clipboard.writeText(targetUrl)
      setLinkFeedback('Link corto Top Likes copiado para LIVE Studio')
    } catch {
      setLinkFeedback('No pude copiar el link de LIVE Studio.')
    }

    window.setTimeout(() => setLinkFeedback(''), 2200)
  }

  async function copyLiveStudioTopGiftsUrl() {
    const targetUrl = liveStudioTopGiftsUrl || localTopGiftsUrl

    if (warnLiveStudioTunnel(liveStudioTopGiftsUrl)) {
      return
    }

    try {
      await navigator.clipboard.writeText(targetUrl)
      setLinkFeedback('Link corto Top Gifts copiado para LIVE Studio')
    } catch {
      setLinkFeedback('No pude copiar el link de LIVE Studio.')
    }

    window.setTimeout(() => setLinkFeedback(''), 2200)
  }

  async function copyTopLikesUrl() {
    const targetUrl = publicTopLikesUrl || localTopLikesUrl

    if (warnNgrokPublicUrl(publicTopLikesUrl)) {
      return
    }

    try {
      await navigator.clipboard.writeText(targetUrl)
      setLinkFeedback(publicTopLikesUrl ? 'Top Likes publico copiado' : 'Top Likes local copiado')
    } catch {
      setLinkFeedback('No pude copiar el link de Top Likes.')
    }
  }

  async function copyTopGiftsUrl() {
    const targetUrl = publicTopGiftsUrl || localTopGiftsUrl

    if (warnNgrokPublicUrl(publicTopGiftsUrl)) {
      return
    }

    try {
      await navigator.clipboard.writeText(targetUrl)
      setLinkFeedback(publicTopGiftsUrl ? 'Top Gifts publico copiado' : 'Top Gifts local copiado')
    } catch {
      setLinkFeedback('No pude copiar el link de Top Gifts.')
    }
  }

  function openTopLikesWindow() {
    window.open(appendOverlayWidgetViewParam(localTopLikesUrl), '_blank', 'noopener,noreferrer')
  }

  function openTopGiftsWindow() {
    window.open(appendOverlayWidgetViewParam(localTopGiftsUrl), '_blank', 'noopener,noreferrer')
  }

  function adjustSmartBarWins(delta) {
    updateDashboardState((currentState) => {
      const currentWins = Number(currentState.widgets?.smartBar?.currentWins || 0)

      return {
        ...currentState,
        widgets: {
          ...currentState.widgets,
          smartBar: {
            ...currentState.widgets?.smartBar,
            currentWins: Math.max(0, currentWins + delta),
          },
        },
      }
    })
  }

  function resetSmartBarWins() {
    updateSmartBarField('currentWins', 0)
  }

  function openCreateEmoteModal() {
    setEditingEmoteId('')
    setShowEmoteModal(true)
  }

  function openEditEmoteModal(emoteId) {
    setEditingEmoteId(String(emoteId || ''))
    setShowEmoteModal(true)
  }

  function closeEmoteModal() {
    setShowEmoteModal(false)
    setEditingEmoteId('')
  }

  function scrollToSection(sectionId) {
    const normalizedSectionId = String(sectionId || '').trim()
    const allowed = new Set(WORKSPACE_SECTIONS.map((section) => section.id))
    const nextSection = allowed.has(normalizedSectionId) ? normalizedSectionId : 'live-hub'

    setActiveWorkspaceSection(nextSection)
    document.documentElement.dataset.route = 'dashboard'
    document.body.dataset.route = 'dashboard'

    if (typeof window === 'undefined') {
      return
    }

    normalizeDesktopDashboardUrl()

    const nextUrl = new URL(window.location.href)

    if (nextUrl.pathname.startsWith('/overlay/')) {
      const panelParam =
        nextSection && nextSection !== 'live-hub' ? `?panel=${encodeURIComponent(nextSection)}` : ''
      window.history.replaceState({}, '', `/${panelParam}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    if (nextSection && nextSection !== 'live-hub') {
      nextUrl.searchParams.set('panel', nextSection)
    } else {
      nextUrl.searchParams.delete('panel')
    }

    nextUrl.searchParams.delete('view')
    nextUrl.hash = ''

    const nextPath = `${nextUrl.pathname || '/'}${nextUrl.search}`
    window.history.replaceState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function copyOverlayUrl() {
    if (warnNgrokPublicUrl(publicOverlayUrl)) {
      return
    }

    try {
      await navigator.clipboard.writeText(preferredOverlayUrl)
      setLinkFeedback(publicOverlayUrl ? 'URL publica copiada' : 'URL local copiada')
    } catch {
      setLinkFeedback('No se pudo copiar')
    }

    window.setTimeout(() => setLinkFeedback(''), 1800)
  }

  async function copySmartBarUrl() {
    const targetUrl = publicSmartBarUrl || localSmartBarUrl

    try {
      await navigator.clipboard.writeText(targetUrl)
      setLinkFeedback(publicSmartBarUrl ? 'Smart bar publica copiada' : 'Smart bar local copiada')
    } catch {
      setLinkFeedback('No se pudo copiar')
    }

    window.setTimeout(() => setLinkFeedback(''), 1800)
  }

  async function copySongRequestUrl() {
    const targetUrl = publicSongRequestUrl || localSongRequestUrl

    try {
      await navigator.clipboard.writeText(targetUrl)
      setLinkFeedback(
        publicSongRequestUrl ? 'Widget de musica publico copiado' : 'Widget de musica local copiado',
      )
    } catch {
      setLinkFeedback('No se pudo copiar')
    }

    window.setTimeout(() => setLinkFeedback(''), 1800)
  }

  function openOverlayWindow() {
    window.open(appendOverlayWidgetViewParam(localOverlayUrl), '_blank', 'noopener,noreferrer')
  }

  function openSmartBarWindow() {
    window.open(appendOverlayWidgetViewParam(localSmartBarUrl), '_blank', 'noopener,noreferrer')
  }

  function openSongRequestWindow() {
    window.open(appendOverlayWidgetViewParam(localSongRequestUrl), '_blank', 'noopener,noreferrer')
  }

  async function refreshMediaLibrary() {
    try {
      const mediaPayload = await requestJson('/api/media', {}, dashboardAccessKey)
      setMediaLibrary(mediaPayload)
      setMediaLibraryError('')
      return mediaPayload
    } catch (error) {
      handleProtectedRequestError(error, setMediaLibraryError)
      return []
    }
  }

  async function uploadMediaFile(file) {
    if (!file) {
      return null
    }

    const formData = new FormData()
    formData.append('file', file)

    try {
      setIsUploadingMedia(true)
      const response = await fetch('/api/media', {
        method: 'POST',
        headers: dashboardAccessKey ? { 'X-Live-Control-Key': dashboardAccessKey } : {},
        body: formData,
      })
      const responseText = await response.text()
      let parsedBody = null

      try {
        parsedBody = responseText ? JSON.parse(responseText) : null
      } catch {
        parsedBody = null
      }

      if (!response.ok) {
        const uploadError = new Error(parsedBody?.error || 'No se pudo subir el archivo.')
        uploadError.status = response.status
        throw uploadError
      }

      setMediaLibrary((currentLibrary) => [
        parsedBody,
        ...currentLibrary.filter((item) => item.fileName !== parsedBody.fileName),
      ])
      setMediaLibraryError('')
      return parsedBody
    } catch (error) {
      handleProtectedRequestError(error, setMediaLibraryError)
      return null
    } finally {
      setIsUploadingMedia(false)
    }
  }

  async function removeMediaFile(fileName) {
    try {
      await requestJson(
        `/api/media/${encodeURIComponent(fileName)}`,
        {
          method: 'DELETE',
        },
        dashboardAccessKey,
      )
      setMediaLibrary((currentLibrary) =>
        currentLibrary.filter((item) => item.fileName !== fileName),
      )
      setMediaLibraryError('')
    } catch (error) {
      handleProtectedRequestError(error, setMediaLibraryError)
    }
  }

  async function saveEmoteCatalogEntry(emoteDraft) {
    const nextDraft = {
      ...emoteDraft,
      id: String(emoteDraft.id || '').trim() || buildManualEmoteId(emoteDraft.name),
      name: String(emoteDraft.name || '').trim(),
      imageUrl: String(emoteDraft.imageUrl || '').trim(),
      source: emoteDraft.source || 'manual',
    }

    try {
      let integration = await requestJson(
        '/api/integrations/tiktok/emotes',
        {
          method: 'POST',
          body: JSON.stringify(nextDraft),
        },
        dashboardAccessKey,
      )

      if (editingEmote && editingEmote.id && editingEmote.id !== nextDraft.id) {
        integration = await requestJson(
          `/api/integrations/tiktok/emotes/${encodeURIComponent(editingEmote.id)}`,
          { method: 'DELETE' },
          dashboardAccessKey,
        )
      }

      updateDashboardState((currentState) => ({
        ...currentState,
        integrations: {
          ...currentState.integrations,
          tiktok: integration,
        },
      }))
      setServerError('')
      closeEmoteModal()
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function removeEmoteCatalogEntry(emoteId) {
    try {
      const integration = await requestJson(
        `/api/integrations/tiktok/emotes/${encodeURIComponent(emoteId)}`,
        {
          method: 'DELETE',
        },
        dashboardAccessKey,
      )
      updateDashboardState((currentState) => ({
        ...currentState,
        integrations: {
          ...currentState.integrations,
          tiktok: integration,
        },
      }))
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function previewAction(action) {
    try {
      if (import.meta.env.DEV) console.log(`[frontend] 🎬 ETAPA 1: Click botón Probar | action={id:${action.id}, name:${action.name}, gtaMode:${action.gtaMode}, gtaChaosEffectId:${action.gtaChaosEffectId}}`)
      const dispatchRecord = await requestJson(
        `/api/actions/${action.id}/test`,
        {
          method: 'POST',
          body: JSON.stringify({
            userName: 'manual-preview',
            comment: `Preview manual para ${action.name}`,
          }),
        },
        dashboardAccessKey,
      )
      if (import.meta.env.DEV) console.log(`[frontend] 📨 Respuesta GTA:`, dispatchRecord.bridgeResults?.gta || {})
      setServerError('')

      // Avisar si el bridge no estaba conectado o si hubo un warning directo de ChaosMod
      const gtaResult = dispatchRecord?.bridgeResults?.gta
      if (gtaResult?.directError) {
        setServerError(gtaResult.directError)
        return
      }
      if (gtaResult?.directWarning) {
        setServerError(gtaResult.directWarning)
        return
      }
      if (gtaResult && gtaResult.deliveredToClients === 0 && gtaResult.warning) {
        setServerError(gtaResult.warning)
        return
      }
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      return
    }

    scrollToSection('overlay')
  }

  async function runMinecraftPreset(preset) {
    try {
      const mode = preset?.minecraftMode || (preset?.id?.includes('oneblock') ? 'oneblock' : 'bedrock-box')
      const dispatchRecord = await requestJson(
        '/api/minecraft/test',
        {
          method: 'POST',
          body: JSON.stringify({
            name: preset?.name || 'Prueba Minecraft',
            description: preset?.note || '',
            commandText: preset?.commandText || '',
            minecraftMode: mode,
            minecraftBedrockPresetId: preset?.id || '',
            minecraftBedrockPresetName: preset?.name || '',
            userName: 'manual-minecraft',
            comment: `Prueba ${mode === 'oneblock' ? 'OneBlock' : 'Bedrock Box'}: ${preset?.name || 'preset'}`,
          }),
        },
        dashboardAccessKey,
      )
      setServerError('')
      return dispatchRecord
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function testMinecraftChatMirror(payload = {}) {
    try {
      const dispatchRecord = await requestJson(
        '/api/minecraft/chat-mirror/test',
        {
          method: 'POST',
          body: JSON.stringify({
            userName: payload.userName || 'demo-chat',
            comment: payload.comment || 'Hola Minecraft, este mensaje salio desde el panel.',
          }),
        },
        dashboardAccessKey,
      )
      setServerError('')
      return dispatchRecord
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function runGamingQuickTest({ game, command }) {
    const gameId = game?.id || ''
    const nativeModule = game?.nativeModule || ''

    try {
      const dispatchRecord = await requestJson(
        '/api/gaming/quick-test',
        {
          method: 'POST',
          body: JSON.stringify({
            gameId,
            name: command?.name || 'Prueba gaming',
            commandText: command?.commandText || '',
            description: command?.note || '',
            gtaChaosEffectId: command?.gtaChaosEffectId || '',
            gtaChaosEffectName: command?.gtaChaosEffectName || '',
            gtaWebhookCommand: command?.commandText || '',
            minecraftMode:
              command?.minecraftMode ||
              (gameId === 'tikcontrol-oneblock' ? 'oneblock' : 'bedrock-box'),
            minecraftBedrockPresetId: command?.id || '',
            minecraftBedrockPresetName: command?.name || '',
            userName: 'manual-gaming',
            comment: `Gaming: ${command?.name || gameId}`,
          }),
        },
        dashboardAccessKey,
      )

      const gtaResult = dispatchRecord?.bridgeResults?.gta
      const udpResult = dispatchRecord?.bridgeResults?.gameUdp
      if (gtaResult?.directError) {
        setServerError(gtaResult.directError)
      } else if (gtaResult?.warning) {
        setServerError(gtaResult.warning)
      } else if (udpResult?.warning) {
        setServerError(udpResult.warning)
      } else if (
        nativeModule === 'gta' &&
        gtaResult &&
        gtaResult.deliveredToClients === 0
      ) {
        setServerError('Bridge GTA no conectado. Ejecuta el bridge local.')
      } else {
        setServerError('')
      }

      return dispatchRecord
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function connectSpotifyMusic() {
    try {
      setLinkFeedback('Preparando inicio de sesion con Spotify...')
      const payload = await requestJson(
        '/api/music/spotify/connect',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )

      if (!payload?.authorizationUrl) {
        throw new Error('No pude generar la autorizacion de Spotify.')
      }

      if (payload.redirectUri) {
        setLinkFeedback(
          `Abre Spotify y autoriza. Redirect URI: ${payload.redirectUri}`,
        )
      }

      const desktopBridge = getDesktopBridgeApi()

      if (desktopBridge && typeof desktopBridge.openExternal === 'function') {
        await desktopBridge.openExternal(payload.authorizationUrl)
        setLinkFeedback('Ventana de Spotify abierta. Al terminar, vuelve a Musica y pulsa Sincronizar.')
        return
      }

      const popup = window.open(payload.authorizationUrl, '_blank', 'noopener,noreferrer')

      if (!popup) {
        window.location.href = payload.authorizationUrl
        return
      }

      setLinkFeedback('Completa el login en la ventana de Spotify y vuelve aqui.')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function disconnectSpotifyMusic() {
    try {
      await requestJson(
        '/api/music/spotify/disconnect',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function syncSpotifyMusic() {
    try {
      await requestJson(
        '/api/music/spotify/sync',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function testMusicPlayRequest(payload = {}) {
    try {
      await requestJson(
        '/api/music/test-play',
        {
          method: 'POST',
          body: JSON.stringify({
            userName: payload.userName || 'demo-chat',
            query: payload.query || '',
          }),
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function skipMusicTrack(payload = {}) {
    try {
      await requestJson(
        '/api/music/skip',
        {
          method: 'POST',
          body: JSON.stringify({
            userName: payload.userName || 'panel',
          }),
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function removeMusicRequest(requestId) {
    try {
      await requestJson(
        `/api/music/requests/${encodeURIComponent(requestId)}`,
        {
          method: 'DELETE',
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function saveSpotifyCredentials({ clientId, clientSecret }) {
    try {
      const result = await requestJson(
        '/api/music/spotify/credentials',
        {
          method: 'POST',
          body: JSON.stringify({
            clientId: clientId?.trim(),
            clientSecret: clientSecret?.trim(),
          }),
        },
        dashboardAccessKey,
      )
      setLinkFeedback(result?.message || 'Credenciales guardadas. Reinicia la aplicación para aplicar los cambios.')
      // We can't hot-reload the server env, so we just inform the user.
      // Optionally refresh status (it will still show not configured until restart).
      await loadInitialState(dashboardAccessKey, true)
      return result
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function clearMusicQueue() {
    try {
      await requestJson(
        '/api/music/queue/clear',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function clearMusicHistory() {
    try {
      await requestJson(
        '/api/music/history/clear',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  async function sendSampleEvent(sampleEvent, payloadOverrides = {}) {
    const payload =
      typeof sampleEvent === 'string'
        ? sampleEvent === 'follow'
          ? {
              type: 'follow',
              userName: 'demo-follow',
              ...payloadOverrides,
            }
          : sampleEvent === 'gift'
            ? {
                type: 'gift',
                userName: 'demo-gifter',
                giftName: 'Rose',
                repeatCount: 1,
                ...payloadOverrides,
              }
            : {
                type: 'comment',
                userName: 'demo-chat',
                comment: '!voz',
                ...payloadOverrides,
              }
        : sampleEvent

    if (!Array.isArray(appState.triggers) || appState.triggers.length === 0) {
      setServerError(
        'No tienes eventos creados todavía. Selecciona "Simular follow" una vez que hayas creado un evento que conecte el follow con una acción.',
      )
      return
    }

    try {
      await requestJson(
        '/api/events/test',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    }
  }

  function exportConfigurationBackup() {
    try {
      const backupPayload = {
        schema: 'live-control-backup-v1',
        exportedAt: new Date().toISOString(),
        state: sanitizeStateForBackup(appState),
      }
      const blob = new Blob([`${JSON.stringify(backupPayload, null, 2)}\n`], {
        type: 'application/json',
      })
      const objectUrl = window.URL.createObjectURL(blob)
      const downloadLink = document.createElement('a')
      const timeStamp = new Date().toISOString().replace(/[:.]/g, '-')

      downloadLink.href = objectUrl
      downloadLink.download = `live-control-backup-${timeStamp}.json`
      document.body.appendChild(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      window.URL.revokeObjectURL(objectUrl)
      setBackupFeedback('Backup exportado. El archivo incluye tu configuración, acciones, eventos y catálogos locales aprendidos.')
    } catch (error) {
      setBackupFeedback(error?.message || 'No pude exportar el backup de esta app.')
    }
  }

  function openBackupImportPicker() {
    backupImportInputRef.current?.click()
  }

  async function handleBackupImport(event) {
    const selectedFile = event.target.files?.[0]

    if (!selectedFile) {
      return
    }

    try {
      setIsImportingBackup(true)
      setBackupFeedback('')
      const fileContents = await selectedFile.text()
      const parsedPayload = JSON.parse(fileContents)
      const importedState = mergeStateWithDefaults(parsedPayload?.state || parsedPayload || {})
      const savedState = await requestJson(
        '/api/state/import',
        {
          method: 'POST',
          body: JSON.stringify(importedState),
        },
        dashboardAccessKey,
      )

      setAppState(savedState)
      await loadInitialState(dashboardAccessKey, true)
      setBackupFeedback(`Backup importado desde ${selectedFile.name}.`)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      setBackupFeedback(error?.message || 'No pude importar ese backup. Revisa que sea un JSON valido de Live Control.')
    } finally {
      event.target.value = ''
      setIsImportingBackup(false)
    }
  }

  async function quickConnectTikTokFromHeader() {
    const normalizedUsername =
      tiktokUsernameDraft.trim().replace(/^@/, '')
      || String(appState.profile.tiktokUsername || '').trim().replace(/^@/, '')

    if (serverStatus.tikTok.connected || serverStatus.tikTok.connecting) {
      scrollToSection('live-ops')
      return
    }

    if (!normalizedUsername) {
      scrollToSection('live-ops')
      return
    }

    await connectTikTok()
  }

  async function unlockDashboard() {
    const nextKey = dashboardAuthDraft.trim()
    writeStoredDashboardAccessKey(nextKey)
    setDashboardAccessKey(nextKey)
    setDashboardAuthError('')
    setIsHydrated(false)
    await loadInitialState(nextKey, true)
  }

  return {
    activeWorkspaceSection,
    addAction,
    addTrigger,
    adjustSmartBarWins,
    appState,
    backupFeedback,
    backupImportInputRef,
    chaosModCatalog,
    clearMusicHistory,
    clearMusicQueue,
    closeActionModal,
    closeEmoteModal,
    closeTriggerModal,
    connectSpotifyMusic,
    connectTikTok,
    copyOverlayUrl,
    copySmartBarUrl,
    copySongRequestUrl,
    copyLiveStudioTopGiftsUrl,
    copyLiveStudioTopLikesUrl,
    copyTopGiftsUrl,
    copyTopLikesUrl,
    dashboardAuthDraft,
    dashboardAuthError,
    desktopContext,
    disconnectSpotifyMusic,
    disconnectTikTok,
    editingAction,
    editingEmote,
    editingTrigger,
    effectiveWorkspaceSection,
    exportConfigurationBackup,
    handleBackupImport,
    importTikTokSessionFromDesktop,
    isHydrated,
    isImportingBackup,
    isImportingTikTokSession,
    isSavingState,
    isSyncingEmoteCatalog,
    isSyncingGiftCatalog,
    isUploadingMedia,
    knownLiveUsers,
    linkFeedback,
    localOverlayUrl,
    localSmartBarUrl,
    localSongRequestUrl,
    localTopGiftsUrl,
    localTopLikesUrl,
    overlayScreens,
    mediaLibrary,
    mediaLibraryError,
    openBackupImportPicker,
    openCreateActionModal,
    openCreateEmoteModal,
    openCreateTriggerModal,
    openEditActionModal,
    openEditEmoteModal,
    openEditTriggerModal,
    openOverlayWindow,
    openSmartBarWindow,
    openSongRequestWindow,
    openTopGiftsWindow,
    openTopLikesWindow,
    preferredOverlayUrl,
    previewAction,
    publicOverlayUrl,
    publicSmartBarUrl,
    publicSongRequestUrl,
    publicTopGiftsUrl,
    publicTopLikesUrl,
    liveStudioOverlayUrl,
    liveStudioTopGiftsUrl,
    liveStudioTopLikesUrl,
    liveStudioTunnelRejected,
    quickConnectTikTokFromHeader,
    readyOutputs,
    refreshMediaLibrary,
    refreshServerStatus,
    remoteBaseUrl,
    removeAction,
    removeEmoteCatalogEntry,
    removeMediaFile,
    removeMusicRequest,
    removeTrigger,
    requiresDashboardAuth,
    saveSpotifyCredentials,
    resetLeaderboards,
    testTopGiftsWidget,
    testTopLikesWidget,
    resetSmartBarWins,
    runGamingQuickTest,
    runMinecraftPreset,
    saveEmoteCatalogEntry,
    scrollToSection,
    sendSampleEvent,
    serverError,
    serverStatus,
    serviceHealth,
    canTestActions,
    setDashboardAuthDraft,
    setTiktokUsernameDraft,
    showActionModal,
    showEmoteModal,
    showTriggerModal,
    skipMusicTrack,
    syncSpotifyMusic,
    syncTikTokEmoteCatalog,
    syncTikTokGiftCatalog,
    testMinecraftChatMirror,
    testMusicPlayRequest,
    tikTokEmoteCatalog,
    tikTokGiftCatalog,
    tiktokUsernameDraft,
    unlockDashboard,
    updateAction,
    updateMusicField,
    updateTtsConfig,
    updateTtsField,
    updateProfileField,
    updateSmartBarField,
    updateTopGiftsWidgetField,
    updateTopLikesWidgetField,
    updateTrigger,
    uploadMediaFile,
    workspaceSections,
  }
}
