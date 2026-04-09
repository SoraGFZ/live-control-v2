import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import {
  buildOverlayUrl,
  createId,
  DEFAULT_APP_STATE,
  detectMediaKind,
  getOutputMeta,
  getTriggerLabel,
  isOverlayCapable,
  mergeStateWithDefaults,
  normalizeBaseUrl,
  OUTPUT_OPTIONS,
  sanitizeSlug,
  TRIGGER_OPTIONS,
  truncateValue,
} from './live-control'

const APP_STORAGE_KEY = 'live-control-studio-cache-v4'
const DASHBOARD_KEY_STORAGE_KEY = 'live-control-dashboard-key-v1'

const DEFAULT_SERVER_STATUS = {
  server: {
    port: 5123,
    startedAt: null,
    stateFile: '',
    hasStaticBuild: false,
  },
  profile: DEFAULT_APP_STATE.profile,
  tikTok: {
    connected: false,
    connecting: false,
    username: '',
    roomId: '',
    lastError: '',
    lastConnectedAt: null,
    lastEventAt: null,
  },
  bridges: {
    dashboardClients: 0,
    overlayClients: 0,
    minecraftClients: 0,
    gtaClients: 0,
    minecraftRconConnected: false,
    minecraftRconError: '',
  },
  recentEvents: [],
  recentDispatches: [],
}

function getCurrentRoute() {
  if (typeof window === 'undefined') {
    return { kind: 'dashboard', slug: 'main-stage' }
  }

  const [first, second] = window.location.pathname.split('/').filter(Boolean)

  if (first === 'overlay') {
    return { kind: 'overlay', slug: second || 'main-stage' }
  }

  return { kind: 'dashboard', slug: 'main-stage' }
}

function readStoredState() {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_STATE
  }

  try {
    const rawState = window.localStorage.getItem(APP_STORAGE_KEY)
    return rawState ? mergeStateWithDefaults(JSON.parse(rawState)) : DEFAULT_APP_STATE
  } catch {
    return DEFAULT_APP_STATE
  }
}

function sanitizeStateForCache(state) {
  return {
    ...state,
    profile: {
      ...state.profile,
      dashboardKey: '',
      overlayKey: '',
    },
  }
}

function readStoredDashboardAccessKey() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.sessionStorage.getItem(DASHBOARD_KEY_STORAGE_KEY) || ''
}

function writeStoredDashboardAccessKey(value) {
  if (typeof window === 'undefined') {
    return
  }

  const normalizedValue = String(value || '').trim()

  if (normalizedValue) {
    window.sessionStorage.setItem(DASHBOARD_KEY_STORAGE_KEY, normalizedValue)
    return
  }

  window.sessionStorage.removeItem(DASHBOARD_KEY_STORAGE_KEY)
}

async function requestJson(url, options = {}, dashboardAccessKey = '') {
  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData
  const response = await fetch(url, {
    headers: {
      ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
      ...(dashboardAccessKey ? { 'X-Live-Control-Key': dashboardAccessKey } : {}),
      ...(options.headers || {}),
    },
    ...options,
  })

  const responseText = await response.text()
  let parsedBody = null

  try {
    parsedBody = responseText ? JSON.parse(responseText) : null
  } catch {
    parsedBody = null
  }

  if (!response.ok) {
    const requestError = new Error(
      parsedBody?.error || `Request fallo con status ${response.status}`,
    )
    requestError.status = response.status
    throw requestError
  }

  return parsedBody
}

function createSocketUrl(pathname, searchParams = {}) {
  if (typeof window === 'undefined') {
    return pathname
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socketUrl = new URL(`${protocol}//${window.location.host}${pathname}`)

  Object.entries(searchParams).forEach(([key, value]) => {
    if (!value) {
      return
    }

    socketUrl.searchParams.set(key, value)
  })

  return socketUrl.toString()
}

function readOverlayAccessKeyFromUrl() {
  if (typeof window === 'undefined') {
    return ''
  }

  return new URLSearchParams(window.location.search).get('key') || ''
}

function formatDateTime(value) {
  if (!value) {
    return 'Sin actividad'
  }

  return new Date(value).toLocaleString()
}

function App() {
  const route = getCurrentRoute()

  if (route.kind === 'overlay') {
    return <OverlayScreen slug={route.slug} />
  }

  return <DashboardApp />
}

function DashboardApp() {
  const [appState, setAppState] = useState(() => readStoredState())
  const [showActionModal, setShowActionModal] = useState(false)
  const [showTriggerModal, setShowTriggerModal] = useState(false)
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
  const [tiktokUsernameDraft, setTiktokUsernameDraft] = useState('')
  const lastSyncedSnapshotRef = useRef('')
  const isMountedRef = useRef(true)

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

  const loadInitialState = useCallback(
    async (accessKey = dashboardAccessKey, preserveDraft = false) => {
      try {
        const [serverState, statusPayload, mediaPayload] = await Promise.all([
          requestJson('/api/state', {}, accessKey),
          requestJson('/api/status', {}, accessKey),
          requestJson('/api/media', {}, accessKey),
        ])
        const mergedState = mergeStateWithDefaults(serverState)
        const initialSnapshot = JSON.stringify(mergedState)

        if (!isMountedRef.current) {
          return
        }

        lastSyncedSnapshotRef.current = initialSnapshot
        setAppState(mergedState)
        setServerStatus(statusPayload)
        setMediaLibrary(mediaPayload)
        setTiktokUsernameDraft(mergedState.profile.tiktokUsername || '')
        setServerError('')
        setMediaLibraryError('')
        setDashboardAuthError('')
        setRequiresDashboardAuth(false)
        syncDashboardAccessKey(mergedState.profile.dashboardKey || accessKey)
      } catch (error) {
        if (!isMountedRef.current) {
          return
        }

        if (error?.status === 401) {
          handleDashboardUnauthorized(error.message, preserveDraft)
          return
        }

        const cachedState = readStoredState()
        lastSyncedSnapshotRef.current = JSON.stringify(cachedState)
        setAppState(cachedState)
        setTiktokUsernameDraft(cachedState.profile.tiktokUsername || '')
        setServerError(
          'No pude hablar con el backend. Ejecuta npm run dev para levantar toda la app.',
        )
        setMediaLibraryError('La biblioteca local necesita que el backend este corriendo.')
        setRequiresDashboardAuth(false)
      } finally {
        if (isMountedRef.current) {
          setIsHydrated(true)
        }
      }
    },
    [dashboardAccessKey, handleDashboardUnauthorized, syncDashboardAccessKey],
  )

  useEffect(() => {
    isMountedRef.current = true
    document.documentElement.dataset.route = 'dashboard'
    document.body.dataset.route = 'dashboard'

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(sanitizeStateForCache(appState)))
  }, [appState])

  useEffect(() => {
    loadInitialState()
  }, [loadInitialState])

  useEffect(() => {
    if (!isHydrated || requiresDashboardAuth) {
      return undefined
    }

    const snapshot = JSON.stringify(appState)

    if (snapshot === lastSyncedSnapshotRef.current) {
      return undefined
    }

    const timeoutId = window.setTimeout(async () => {
      const payload = mergeStateWithDefaults({
        ...appState,
        profile: {
          ...appState.profile,
          overlaySlug: sanitizeSlug(appState.profile.overlaySlug),
        },
      })

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
        setServerError('')
        syncDashboardAccessKey(savedState.profile.dashboardKey)

        if (savedSnapshot !== snapshot) {
          setAppState(savedState)
        }
      } catch (error) {
        handleProtectedRequestError(error, setServerError)
      } finally {
        setIsSavingState(false)
      }
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [
    appState,
    dashboardAccessKey,
    handleProtectedRequestError,
    isHydrated,
    requiresDashboardAuth,
    syncDashboardAccessKey,
  ])

  useEffect(() => {
    if (!isHydrated || requiresDashboardAuth) {
      return undefined
    }

    let socket
    let reconnectTimeoutId
    let isStopped = false

    function connectSocket() {
      socket = new WebSocket(createSocketUrl('/ws/app', { key: dashboardAccessKey }))

      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data)

          if (payload.type === 'status') {
            setServerStatus(payload.payload)
            setServerError('')
          }
        } catch {
          return
        }
      }

      socket.onclose = () => {
        if (isStopped) {
          return
        }

        reconnectTimeoutId = window.setTimeout(connectSocket, 1500)
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    connectSocket()

    return () => {
      isStopped = true
      window.clearTimeout(reconnectTimeoutId)
      socket?.close()
    }
  }, [dashboardAccessKey, isHydrated, requiresDashboardAuth])

  const overlaySlug = sanitizeSlug(appState.profile.overlaySlug)
  const localBaseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const localOverlayUrl = buildOverlayUrl(localBaseUrl, overlaySlug, appState.profile.overlayKey)
  const publicOverlayUrl = appState.profile.publicBaseUrl
    ? buildOverlayUrl(appState.profile.publicBaseUrl, overlaySlug, appState.profile.overlayKey)
    : ''
  const preferredOverlayUrl = publicOverlayUrl || localOverlayUrl

  const readyOutputs = new Set()
  appState.actions.forEach((action) => action.outputs.forEach((output) => readyOutputs.add(output)))

  function updateProfileField(field, value) {
    setAppState((currentState) => ({
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

  function addAction(actionDraft) {
    setAppState((currentState) => ({
      ...currentState,
      actions: [{ ...actionDraft, id: createId('action') }, ...currentState.actions],
    }))
  }

  function addTrigger(triggerDraft) {
    setAppState((currentState) => ({
      ...currentState,
      triggers: [{ ...triggerDraft, id: createId('trigger') }, ...currentState.triggers],
    }))
  }

  function removeAction(actionId) {
    setAppState((currentState) => ({
      ...currentState,
      actions: currentState.actions.filter((action) => action.id !== actionId),
      triggers: currentState.triggers.filter((trigger) => trigger.actionId !== actionId),
    }))
  }

  function removeTrigger(triggerId) {
    setAppState((currentState) => ({
      ...currentState,
      triggers: currentState.triggers.filter((trigger) => trigger.id !== triggerId),
    }))
  }

  function scrollToSection(sectionId) {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  async function copyOverlayUrl() {
    try {
      await navigator.clipboard.writeText(preferredOverlayUrl)
      setLinkFeedback(publicOverlayUrl ? 'URL publica copiada' : 'URL local copiada')
    } catch {
      setLinkFeedback('No se pudo copiar')
    }

    window.setTimeout(() => setLinkFeedback(''), 1800)
  }

  function openOverlayWindow() {
    window.open(localOverlayUrl, '_blank', 'noopener,noreferrer')
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

  async function previewAction(action) {
    try {
      await requestJson(
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
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }

    scrollToSection('overlay')
  }

  async function sendSampleEvent(sampleType) {
    const payload =
      sampleType === 'follow'
        ? {
            type: 'follow',
            userName: 'demo-follow',
          }
        : sampleType === 'gift'
          ? {
              type: 'gift',
              userName: 'demo-gifter',
              giftName: 'Rose',
              repeatCount: 1,
            }
          : {
              type: 'comment',
              userName: 'demo-chat',
            comment: '!voz',
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
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function connectTikTok() {
    try {
      const normalizedUsername = tiktokUsernameDraft.trim().replace(/^@/, '')
      const statusPayload = await requestJson(
        '/api/tiktok/connect',
        {
          method: 'POST',
          body: JSON.stringify({
            username: normalizedUsername,
          }),
        },
        dashboardAccessKey,
      )
      setAppState((currentState) => ({
        ...currentState,
        profile: {
          ...currentState.profile,
          tiktokUsername: normalizedUsername,
        },
      }))
      setTiktokUsernameDraft(normalizedUsername)
      setServerStatus(statusPayload)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function disconnectTikTok() {
    try {
      const statusPayload = await requestJson(
        '/api/tiktok/disconnect',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      setServerStatus(statusPayload)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function unlockDashboard() {
    const nextKey = dashboardAuthDraft.trim()
    writeStoredDashboardAccessKey(nextKey)
    setDashboardAccessKey(nextKey)
    setDashboardAuthError('')
    setIsHydrated(false)
    await loadInitialState(nextKey, true)
  }

  if (!isHydrated) {
    return <DashboardBootScreen />
  }

  if (requiresDashboardAuth) {
    return (
      <DashboardAccessGate
        dashboardAuthDraft={dashboardAuthDraft}
        dashboardAuthError={dashboardAuthError}
        onChangeDraft={setDashboardAuthDraft}
        onUnlock={unlockDashboard}
      />
    )
  }

  return (
    <div className="app-shell">
      <Sidebar onJump={scrollToSection} />

      <main className="main-panel">
        <HeroPanel
          overlayUrl={preferredOverlayUrl}
          onCreateAction={() => setShowActionModal(true)}
          onCreateTrigger={() => setShowTriggerModal(true)}
        />

        <LiveOpsSection
          isSavingState={isSavingState}
          onConnectTikTok={connectTikTok}
          onDisconnectTikTok={disconnectTikTok}
          serverError={serverError}
          serverStatus={serverStatus}
          setTiktokUsernameDraft={setTiktokUsernameDraft}
          tiktokUsernameDraft={tiktokUsernameDraft}
        />

        <MetricRow actionCount={appState.actions.length} bridgePort={serverStatus.server.port} readyOutputCount={readyOutputs.size} triggerCount={appState.triggers.length} />

        <RoadmapSection />

        <ActionsSection actions={appState.actions} onCreateAction={() => setShowActionModal(true)} onPreviewAction={previewAction} onRemoveAction={removeAction} />

        <TriggersSection actions={appState.actions} onCreateTrigger={() => setShowTriggerModal(true)} onRemoveTrigger={removeTrigger} triggers={appState.triggers} />

        <OverlaySection
          linkFeedback={linkFeedback}
          mediaLibrary={mediaLibrary}
          mediaLibraryError={mediaLibraryError}
          onDeleteMedia={removeMediaFile}
          onCopyOverlayUrl={copyOverlayUrl}
          onOpenOverlayWindow={openOverlayWindow}
          onRefreshMedia={refreshMediaLibrary}
          onSampleEvent={sendSampleEvent}
          onUploadMedia={uploadMediaFile}
          localOverlayUrl={localOverlayUrl}
          publicOverlayUrl={publicOverlayUrl}
          profile={appState.profile}
          serverPort={serverStatus.server.port}
          updateProfileField={updateProfileField}
          isUploadingMedia={isUploadingMedia}
        />

        <BridgesSection bridgePort={serverStatus.server.port} serverStatus={serverStatus} />
      </main>

      {showActionModal ? (
        <ActionModal
          isUploadingMedia={isUploadingMedia}
          mediaLibrary={mediaLibrary}
          mediaLibraryError={mediaLibraryError}
          onClose={() => setShowActionModal(false)}
          onSave={(actionDraft) => {
            addAction(actionDraft)
            setShowActionModal(false)
          }}
          onUploadMedia={uploadMediaFile}
        />
      ) : null}

      {showTriggerModal ? (
        <TriggerModal
          actions={appState.actions}
          onClose={() => setShowTriggerModal(false)}
          onSave={(triggerDraft) => {
            addTrigger(triggerDraft)
            setShowTriggerModal(false)
          }}
        />
      ) : null}
    </div>
  )
}

function DashboardBootScreen() {
  return (
    <div className="auth-shell">
      <article className="auth-card">
        <span className="eyebrow">Conectando panel</span>
        <h1>Estamos levantando tu centro de control.</h1>
        <p>
          Reviso el backend local, el estado guardado y la seguridad del panel antes de mostrarte
          todo.
        </p>
      </article>
    </div>
  )
}

function DashboardAccessGate({
  dashboardAuthDraft,
  dashboardAuthError,
  onChangeDraft,
  onUnlock,
}) {
  return (
    <div className="auth-shell">
      <article className="auth-card">
        <span className="eyebrow">Panel protegido</span>
        <h1>Ingresa la clave del dashboard.</h1>
        <p>
          Esta clave protege el panel, las APIs y los sockets internos cuando publicas la app con
          una URL real.
        </p>

        <label className="field-label" htmlFor="dashboard-access-key">
          Clave del panel
        </label>
        <input
          id="dashboard-access-key"
          type="password"
          className="text-field"
          placeholder="Tu clave actual"
          value={dashboardAuthDraft}
          onChange={(event) => onChangeDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onUnlock()
            }
          }}
        />

        {dashboardAuthError ? <div className="error-box">{dashboardAuthError}</div> : null}

        <div className="card-actions">
          <button className="primary-button" onClick={onUnlock}>
            Desbloquear panel
          </button>
        </div>
      </article>
    </div>
  )
}

function Sidebar({ onJump }) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <span className="brand-kicker">TikTok Live x Games</span>
        <div className="brand-title">Live Control</div>
        <p className="brand-copy">
          Unificamos triggers del live, acciones de juegos y overlay en una sola mesa de control.
        </p>
      </div>

      <nav className="sidebar-nav" aria-label="Secciones del panel">
        <button className="nav-button" onClick={() => onJump('overview')}>
          Resumen
        </button>
        <button className="nav-button" onClick={() => onJump('live-ops')}>
          Live Ops
        </button>
        <button className="nav-button" onClick={() => onJump('actions')}>
          Acciones
        </button>
        <button className="nav-button" onClick={() => onJump('triggers')}>
          Triggers
        </button>
        <button className="nav-button" onClick={() => onJump('overlay')}>
          Overlay
        </button>
        <button className="nav-button" onClick={() => onJump('bridges')}>
          Bridges
        </button>
      </nav>

      <div className="sidebar-card">
        <span className="sidebar-card-label">Estado del MVP</span>
        <strong>Control local funcional</strong>
        <p>Panel, backend, overlay y bridges websocket ya quedaron en la misma app.</p>
      </div>
    </aside>
  )
}

function HeroPanel({ overlayUrl, onCreateAction, onCreateTrigger }) {
  return (
    <section className="hero-panel" id="overview">
      <div className="hero-copy">
        <span className="eyebrow">MVP para tu app tipo TikFinity</span>
        <h1>Construimos el centro de control para tus lives caoticos.</h1>
        <p className="hero-text">
          Esta base ya ordena acciones, triggers y un overlay con link propio para empezar a probar alertas, medios y comandos de juego.
        </p>

        <div className="hero-actions">
          <button className="primary-button" onClick={onCreateAction}>
            Nueva accion
          </button>
          <button className="secondary-button" onClick={onCreateTrigger}>
            Nuevo trigger
          </button>
        </div>
      </div>

      <div className="hero-stack">
        <article className="signal-card">
          <span className="signal-label">Pipeline que vamos a cerrar</span>
          <div className="signal-flow">
            <span>TikTok Live</span>
            <span>Accion</span>
            <span>Juego / Overlay</span>
          </div>
          <p>El siguiente backend local solo tiene que escuchar eventos, resolver triggers y despachar la accion correcta.</p>
        </article>

        <article className="signal-card">
          <span className="signal-label">Overlay listo para pruebas</span>
          <code>{overlayUrl}</code>
          <p>Puedes abrirlo ya mismo en otra ventana para validar estilo, capas y tiempos de alerta.</p>
        </article>
      </div>
    </section>
  )
}

function LiveOpsSection({
  isSavingState,
  onConnectTikTok,
  onDisconnectTikTok,
  serverError,
  serverStatus,
  setTiktokUsernameDraft,
  tiktokUsernameDraft,
}) {
  return (
    <section className="panel-section" id="live-ops">
      <SectionHeader
        eyebrow="Operacion en vivo"
        title="Conexion real con TikTok y estado del backend"
        description="Desde aqui conectas el live, revisas eventos entrantes y confirmas que overlay y bridges estan vivos."
      />

      <div className="ops-grid">
        <article className="surface-card ops-card">
          <div className="card-top">
            <div>
              <h3>TikTok LIVE</h3>
              <p>Conecta por username y deja que el backend resuelva follows, gifts, comments y likes.</p>
            </div>
            <span className={`status-chip ${serverStatus.tikTok.connected ? 'ok' : serverStatus.tikTok.connecting ? 'warn' : 'off'}`}>
              {serverStatus.tikTok.connected
                ? 'Conectado'
                : serverStatus.tikTok.connecting
                  ? 'Conectando'
                  : 'Desconectado'}
            </span>
          </div>

          <label className="field-label" htmlFor="tiktok-username">
            Username del live
          </label>
          <input
            id="tiktok-username"
            className="text-field"
            placeholder="Ej: tu_usuario"
            value={tiktokUsernameDraft}
            onChange={(event) => setTiktokUsernameDraft(event.target.value)}
          />

          <div className="card-actions">
            <button className="primary-button" onClick={onConnectTikTok}>
              Conectar live
            </button>
            <button className="ghost-button" onClick={onDisconnectTikTok}>
              Desconectar
            </button>
          </div>

          <div className="mini-grid">
            <div>
              <span className="snippet-label">Room ID</span>
              <p>{serverStatus.tikTok.roomId || 'Esperando conexion'}</p>
            </div>
            <div>
              <span className="snippet-label">Ultima conexion</span>
              <p>{formatDateTime(serverStatus.tikTok.lastConnectedAt)}</p>
            </div>
          </div>

          {serverStatus.tikTok.lastError ? (
            <div className="error-box">{serverStatus.tikTok.lastError}</div>
          ) : null}
        </article>

        <article className="surface-card ops-card">
          <div className="card-top">
            <div>
              <h3>Backend local</h3>
              <p>Este proceso es el que persiste configuracion y reparte eventos a overlay, dashboard y juegos.</p>
            </div>
            <span className={`status-chip ${serverError ? 'warn' : 'ok'}`}>
              {serverError ? 'Atencion' : 'Activo'}
            </span>
          </div>

          <div className="mini-grid">
            <div>
              <span className="snippet-label">Puerto activo</span>
              <p>{serverStatus.server.port}</p>
            </div>
            <div>
              <span className="snippet-label">Guardado</span>
              <p>{isSavingState ? 'Sincronizando...' : 'Al dia'}</p>
            </div>
            <div>
              <span className="snippet-label">Overlay clients</span>
              <p>{serverStatus.bridges.overlayClients}</p>
            </div>
            <div>
              <span className="snippet-label">Dashboard clients</span>
              <p>{serverStatus.bridges.dashboardClients}</p>
            </div>
          </div>

          {serverError ? <div className="error-box">{serverError}</div> : null}
        </article>

        <article className="surface-card ops-card">
          <h3>Ultimos eventos del live</h3>
          <div className="event-log">
            {serverStatus.recentEvents.length === 0 ? (
              <p className="support-copy">Todavia no llegaron eventos al backend.</p>
            ) : (
              serverStatus.recentEvents.map((eventItem) => (
                <div key={eventItem.id} className="event-item">
                  <span className="trigger-type">{eventItem.type}</span>
                  <strong>{eventItem.summary}</strong>
                  <span>{formatDateTime(eventItem.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="surface-card ops-card">
          <h3>Acciones despachadas</h3>
          <div className="event-log">
            {serverStatus.recentDispatches.length === 0 ? (
              <p className="support-copy">Todavia no se disparo ninguna accion real.</p>
            ) : (
              serverStatus.recentDispatches.map((dispatchItem) => (
                <div key={dispatchItem.id} className="event-item">
                  <span className="bridge-badge">{dispatchItem.reason}</span>
                  <strong>{dispatchItem.actionName}</strong>
                  <span>{formatDateTime(dispatchItem.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  )
}

function MetricRow({ actionCount, bridgePort, readyOutputCount, triggerCount }) {
  return (
    <section className="metric-grid">
      <article className="metric-card">
        <span className="metric-label">Acciones creadas</span>
        <strong>{actionCount}</strong>
        <p>Biblioteca reutilizable para eventos del live.</p>
      </article>
      <article className="metric-card">
        <span className="metric-label">Triggers mapeados</span>
        <strong>{triggerCount}</strong>
        <p>Reglas que uniran follows, gifts y comentarios con acciones.</p>
      </article>
      <article className="metric-card">
        <span className="metric-label">Salidas modeladas</span>
        <strong>{readyOutputCount}</strong>
        <p>Overlay, audio y bridges de juego ya contemplados en la data.</p>
      </article>
      <article className="metric-card">
        <span className="metric-label">Bridge local planeado</span>
        <strong>{bridgePort}</strong>
        <p>Puerto sugerido para el servicio Node que hara de pegamento.</p>
      </article>
    </section>
  )
}

function RoadmapSection() {
  return (
    <section className="panel-section">
      <SectionHeader
        eyebrow="Roadmap operativo"
        title="Como se conecta todo"
        description="La idea del producto ya queda repartida en bloques claros para que avanzar no sea un salto al vacio."
      />

      <div className="pipeline-grid">
        <article className="surface-card pipeline-card">
          <span className="step-index">01</span>
          <h3>Ingesta del live</h3>
          <p>Un servicio local recibe follows, gifts, comentarios y likes desde TikTok.</p>
        </article>
        <article className="surface-card pipeline-card">
          <span className="step-index">02</span>
          <h3>Motor de triggers</h3>
          <p>Revisa reglas, cooldowns y decide que accion reusable debe dispararse.</p>
        </article>
        <article className="surface-card pipeline-card">
          <span className="step-index">03</span>
          <h3>Dispatcher de acciones</h3>
          <p>Ejecuta overlay, audio, TTS o comandos para Minecraft y GTA segun cada caso.</p>
        </article>
        <article className="surface-card pipeline-card">
          <span className="step-index">04</span>
          <h3>Salida al live</h3>
          <p>Tu overlay muestra alertas y los juegos reciben eventos desde mods o bridges.</p>
        </article>
      </div>
    </section>
  )
}

function ActionsSection({ actions, onCreateAction, onPreviewAction, onRemoveAction }) {
  return (
    <section className="panel-section" id="actions">
      <SectionHeader
        eyebrow="Biblioteca de acciones"
        title="Acciones reutilizables para el directo"
        description="Aqui defines lo que debe pasar cuando un trigger se active."
        action={
          <button className="primary-button" onClick={onCreateAction}>
            Crear accion
          </button>
        }
      />

      <div className="card-grid">
        {actions.map((action) => (
          <article key={action.id} className="surface-card action-card">
            <div className="card-top">
              <div>
                <h3>{action.name}</h3>
                <p>{action.description || 'Sin descripcion todavia.'}</p>
              </div>
              <span className="state-badge">
                {action.outputs.length} salida{action.outputs.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="tag-row">
              {action.outputs.map((output) => (
                <span key={output} className="tag">
                  {getOutputMeta(output)?.label || output}
                </span>
              ))}
            </div>

            {action.commandText ? (
              <div className="snippet-block">
                <span className="snippet-label">Comando / payload</span>
                <code>{action.commandText}</code>
              </div>
            ) : null}

            {action.overlayText ? (
              <p className="support-copy">
                <strong>Overlay:</strong> {action.overlayText}
              </p>
            ) : null}

            {action.mediaUrl ? (
              <p className="support-copy">
                <strong>Media:</strong> {truncateValue(action.mediaUrl)}
              </p>
            ) : null}

            <div className="card-actions">
              {isOverlayCapable(action) ? (
                <button className="secondary-button" onClick={() => onPreviewAction(action)}>
                  Enviar al overlay
                </button>
              ) : (
                <span className="muted-pill">Pendiente de bridge real</span>
              )}
              <button className="ghost-button" onClick={() => onRemoveAction(action.id)}>
                Eliminar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function TriggersSection({ actions, onCreateTrigger, onRemoveTrigger, triggers }) {
  return (
    <section className="panel-section" id="triggers">
      <SectionHeader
        eyebrow="Motor de disparo"
        title="Triggers del live"
        description="Mapea un evento de TikTok al comportamiento que quieras ejecutar."
        action={
          <button className="primary-button" onClick={onCreateTrigger} disabled={actions.length === 0}>
            Crear trigger
          </button>
        }
      />

      <div className="card-grid trigger-grid">
        {triggers.map((trigger) => {
          const linkedAction = actions.find((action) => action.id === trigger.actionId)

          return (
            <article key={trigger.id} className="surface-card trigger-card">
              <span className="trigger-type">{getTriggerLabel(trigger.source)}</span>
              <h3>{trigger.match}</h3>
              <p>
                Dispara <strong>{linkedAction?.name || 'Accion eliminada'}</strong>
              </p>
              <p className="support-copy">Cooldown: {trigger.cooldownSeconds || '0'} segundos</p>
              <button className="ghost-button" onClick={() => onRemoveTrigger(trigger.id)}>
                Eliminar
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function OverlaySection({
  linkFeedback,
  localOverlayUrl,
  mediaLibrary,
  mediaLibraryError,
  onDeleteMedia,
  onCopyOverlayUrl,
  onOpenOverlayWindow,
  onRefreshMedia,
  onSampleEvent,
  onUploadMedia,
  publicOverlayUrl,
  profile,
  serverPort,
  updateProfileField,
  isUploadingMedia,
}) {
  return (
    <section className="panel-section" id="overlay">
      <SectionHeader
        eyebrow="Salida visual"
        title="Overlay con URL propia"
        description="La ruta de overlay vive dentro de esta misma app para que ya puedas abrirla aparte y testear alertas."
      />

      <div className="overlay-grid">
        <article className="surface-card settings-card">
          <h3>Ajustes base</h3>

          <label className="field-label" htmlFor="project-name">
            Nombre del proyecto
          </label>
          <input
            id="project-name"
            className="text-field"
            value={profile.projectName}
            onChange={(event) => updateProfileField('projectName', event.target.value)}
          />

          <label className="field-label" htmlFor="streamer-name">
            Nombre del canal / creator
          </label>
          <input
            id="streamer-name"
            className="text-field"
            value={profile.streamerName}
            onChange={(event) => updateProfileField('streamerName', event.target.value)}
          />

          <label className="field-label" htmlFor="overlay-slug">
            Slug del overlay
          </label>
          <input
            id="overlay-slug"
            className="text-field"
            value={profile.overlaySlug}
            onChange={(event) => updateProfileField('overlaySlug', event.target.value)}
          />

          <label className="field-label" htmlFor="public-base-url">
            URL publica base
          </label>
          <input
            id="public-base-url"
            className="text-field"
            placeholder="https://tu-tunel.trycloudflare.com"
            value={profile.publicBaseUrl}
            onChange={(event) => updateProfileField('publicBaseUrl', event.target.value)}
          />

          <label className="field-label" htmlFor="overlay-duration">
            Duracion de alerta en ms
          </label>
          <input
            id="overlay-duration"
            className="text-field"
            value={profile.overlayDurationMs}
            onChange={(event) => updateProfileField('overlayDurationMs', event.target.value)}
          />

          <label className="field-label" htmlFor="dashboard-key">
            Clave del panel
          </label>
          <input
            id="dashboard-key"
            type="password"
            className="text-field"
            placeholder="Protege dashboard, APIs y sockets internos"
            value={profile.dashboardKey}
            onChange={(event) => updateProfileField('dashboardKey', event.target.value)}
          />

          <label className="field-label" htmlFor="overlay-key">
            Clave publica del overlay
          </label>
          <input
            id="overlay-key"
            type="password"
            className="text-field"
            placeholder="Opcional para proteger el browser source"
            value={profile.overlayKey}
            onChange={(event) => updateProfileField('overlayKey', event.target.value)}
          />

          <p className="support-copy">
            La URL publica base debe ser solo el dominio del tunel o tu sitio. Si configuras una
            clave de overlay, la app la agrega automaticamente al link final con `?key=...`.
          </p>
        </article>

        <article className="surface-card link-card">
          <span className="signal-label">Links del overlay</span>
          <div className="link-stack">
            <div>
              <span className="snippet-label">Local</span>
              <code className="overlay-link">{localOverlayUrl}</code>
            </div>
            <div>
              <span className="snippet-label">Publica</span>
              <code className="overlay-link">
                {publicOverlayUrl || 'Completa la URL publica base para generar el link real.'}
              </code>
            </div>
          </div>
          <p>
            Usa la URL publica en LIVE Studio. La local sigue sirviendo para pruebas rapidas dentro
            de tu PC.
          </p>
          <div className="card-actions">
            <button className="primary-button" onClick={onCopyOverlayUrl}>
              {publicOverlayUrl ? 'Copiar URL publica' : 'Copiar URL local'}
            </button>
            <button className="secondary-button" onClick={onOpenOverlayWindow}>
              Abrir overlay local
            </button>
          </div>
          {linkFeedback ? <span className="feedback-pill">{linkFeedback}</span> : null}
        </article>

        <article className="surface-card test-card">
          <h3>Pruebas rapidas</h3>
          <p className="test-card-copy">
            Estas demos ya pasan por el backend local, asi que validan overlay, triggers y logs de verdad.
          </p>
          <p>
            Estas demos sirven para validar diseño, timing y lectura del overlay antes de tener el bridge real de TikTok.
          </p>
          <div className="stacked-actions">
            <button className="secondary-button" onClick={() => onSampleEvent('follow')}>
              Probar alerta de follow
            </button>
            <button className="secondary-button" onClick={() => onSampleEvent('gift')}>
              Probar alerta de gift
            </button>
            <button className="secondary-button" onClick={() => onSampleEvent('tts')}>
              Probar comentario !voz
            </button>
          </div>
        </article>

        <article className="surface-card checklist-card">
          <h3>Backend local y tunel</h3>
          <label className="field-label" htmlFor="minecraft-host">
            Minecraft host
          </label>
          <input
            id="minecraft-host"
            className="text-field"
            value={profile.minecraftHost}
            onChange={(event) => updateProfileField('minecraftHost', event.target.value)}
          />

          <label className="field-label" htmlFor="minecraft-port">
            Minecraft RCON port
          </label>
          <input
            id="minecraft-port"
            className="text-field"
            value={profile.minecraftPort}
            onChange={(event) => updateProfileField('minecraftPort', event.target.value)}
          />

          <label className="field-label" htmlFor="minecraft-password">
            Minecraft RCON password
          </label>
          <input
            id="minecraft-password"
            type="password"
            className="text-field"
            value={profile.minecraftPassword}
            onChange={(event) => updateProfileField('minecraftPassword', event.target.value)}
          />

          <p className="support-copy">
            El backend corre en el puerto <strong>{serverPort}</strong>. Si completas el RCON, las acciones de Minecraft intentan enviar el comando real.
          </p>
          <div className="snippet-block">
            <span className="snippet-label">Comando rapido</span>
            <code>npm run public</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Tunel manual</span>
            <code>npm run tunnel</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Configurar ngrok</span>
            <code>npm run tunnel:auth -- TU_TOKEN</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Fallback LocalTunnel</span>
            <code>npm run tunnel:localtunnel</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Fallback Cloudflare</span>
            <code>npm run tunnel:cloudflare</code>
          </div>
          <ul className="checklist">
            <li>Guarda la configuracion en el server local.</li>
            <li>Expone una URL publica valida para LIVE Studio.</li>
            <li>Puede proteger panel y overlay con claves simples.</li>
            <li>Permite disparar comandos de Minecraft por RCON.</li>
            <li>Deja lista la conexion websocket para mods de GTA V.</li>
            <li>Mantiene el overlay en la misma app.</li>
          </ul>
        </article>

        <article className="surface-card media-library-card">
          <div className="card-top">
            <div>
              <h3>Biblioteca local</h3>
              <p>Sube videos, GIFs, imagenes o audios para reutilizarlos en cualquier accion.</p>
            </div>
            <span className="state-badge">{mediaLibrary.length} items</span>
          </div>

          <div className="card-actions">
            <label className="secondary-button upload-button">
              {isUploadingMedia ? 'Subiendo...' : 'Subir archivo'}
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
                    await onUploadMedia(file)
                  } finally {
                    event.target.value = ''
                  }
                }}
              />
            </label>
            <button className="ghost-button" onClick={onRefreshMedia}>
              Recargar biblioteca
            </button>
          </div>

          {mediaLibraryError ? <div className="error-box">{mediaLibraryError}</div> : null}

          <div className="media-grid">
            {mediaLibrary.length === 0 ? (
              <p className="support-copy">Todavia no cargaste archivos locales.</p>
            ) : (
              mediaLibrary.map((item) => (
                <article key={item.id} className="media-item">
                  <div className="media-item-head">
                    <span className="bridge-badge">{item.kind}</span>
                    <button className="ghost-button compact-button" onClick={() => onDeleteMedia(item.fileName)}>
                      Quitar
                    </button>
                  </div>
                  <strong>{item.fileName}</strong>
                  <code>{item.url}</code>
                </article>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  )
}

function BridgesSection({ bridgePort, serverStatus }) {
  return (
    <section className="panel-section" id="bridges">
      <SectionHeader
        eyebrow="Integraciones"
        title="Bridges para TikTok y juegos"
        description="Este bloque define el pegamento que vamos a construir a continuacion para que todo se mueva solo."
      />

      <div className="bridge-grid">
        <article className="surface-card bridge-card">
          <span className="bridge-badge">TikTok Live</span>
          <h3>Servicio local de ingesta</h3>
          <p>Ya escucha eventos del live y los convierte en triggers cuando conectas el username en el panel.</p>
          <div className="snippet-block">
            <span className="snippet-label">Estado actual</span>
            <code>{serverStatus.tikTok.connected ? `Conectado a @${serverStatus.tikTok.username}` : 'Esperando conexion de TikTok'}</code>
          </div>
        </article>

        <article className="surface-card bridge-card">
          <span className="bridge-badge">Minecraft</span>
          <h3>Comandos para mod o RCON</h3>
          <p>Las acciones de Minecraft se emiten por websocket y tambien intentan RCON cuando configuras host, port y password.</p>
          <div className="snippet-block">
            <span className="snippet-label">Socket / bridge</span>
            <code>ws://127.0.0.1:{bridgePort}/ws/minecraft</code>
          </div>
          <p className="support-copy">
            Clientes conectados: {serverStatus.bridges.minecraftClients}. RCON: {serverStatus.bridges.minecraftRconConnected ? 'activo' : serverStatus.bridges.minecraftRconError ? serverStatus.bridges.minecraftRconError : 'sin conexion'}
          </p>
        </article>

        <article className="surface-card bridge-card">
          <span className="bridge-badge">GTA V</span>
          <h3>Bridge local para tu mod</h3>
          <p>Tu mod puede conectarse a este socket y recibir payloads con actionId, commandText y contexto del evento.</p>
          <div className="snippet-block">
            <span className="snippet-label">Socket sugerido</span>
            <code>ws://127.0.0.1:{bridgePort}/ws/gta</code>
          </div>
          <p className="support-copy">Clientes conectados: {serverStatus.bridges.gtaClients}</p>
        </article>
      </div>
    </section>
  )
}

function OverlayScreen({ slug }) {
  const [appState, setAppState] = useState(() => readStoredState())
  const [currentEvent, setCurrentEvent] = useState(null)
  const [overlayError, setOverlayError] = useState('')
  const seenEventIds = useRef(new Set())
  const queuedEventsRef = useRef([])
  const isShowingEventRef = useRef(false)
  const audioRef = useRef(null)
  const overlayAccessKey = readOverlayAccessKeyFromUrl()

  function playNextEvent() {
    if (isShowingEventRef.current) {
      return
    }

    const nextEvent = queuedEventsRef.current.shift()

    if (!nextEvent) {
      return
    }

    isShowingEventRef.current = true
    setCurrentEvent(nextEvent)
  }

  useEffect(() => {
    document.documentElement.dataset.route = 'overlay'
    document.body.dataset.route = 'overlay'

    let socket
    let reconnectTimeoutId
    let isStopped = false
    let canConnectSocket = false

    function enqueueEvent(eventPayload) {
      if (!eventPayload?.id || seenEventIds.current.has(eventPayload.id)) {
        return
      }

      seenEventIds.current.add(eventPayload.id)
      queuedEventsRef.current.push(eventPayload)
      playNextEvent()
    }

    async function loadProfile() {
      try {
        const overlayProfile = await requestJson(
          `/api/overlay/${encodeURIComponent(slug)}${
            overlayAccessKey ? `?key=${encodeURIComponent(overlayAccessKey)}` : ''
          }`,
        )
        setAppState((currentState) =>
          mergeStateWithDefaults({
            ...currentState,
            profile: overlayProfile.profile,
          }),
        )
        setOverlayError('')
        canConnectSocket = true
      } catch (error) {
        if (error?.status === 401) {
          setOverlayError('Este overlay necesita la clave publica correcta en la URL.')
          return
        }

        if (error?.status === 404) {
          setOverlayError('No encontre ese slug de overlay. Revisa la URL publica.')
          return
        }

        setAppState(readStoredState())
        setOverlayError('')
      }
    }

    function connectSocket() {
      socket = new WebSocket(createSocketUrl('/ws/overlay', { key: overlayAccessKey }))

      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data)

          if (payload.type === 'overlay-state') {
            setAppState((currentState) =>
              mergeStateWithDefaults({
                ...currentState,
                profile: payload.payload.profile,
              }),
            )
          }

          if (payload.type === 'overlay-event') {
            enqueueEvent(payload.payload)
          }
        } catch {
          return
        }
      }

      socket.onclose = () => {
        if (isStopped) {
          return
        }

        reconnectTimeoutId = window.setTimeout(connectSocket, 1500)
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    async function bootOverlay() {
      await loadProfile()

      if (!isStopped && canConnectSocket) {
        connectSocket()
      }
    }

    bootOverlay()

    return () => {
      isStopped = true
      window.clearTimeout(reconnectTimeoutId)
      socket?.close()
    }
  }, [overlayAccessKey, slug])

  useEffect(() => {
    if (!currentEvent) {
      return undefined
    }

    if (currentEvent.ttsText && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(currentEvent.ttsText))
    }

    const audioUrl = currentEvent.audioUrl || ''

    if (audioUrl && detectMediaKind(audioUrl) === 'audio') {
      const audio = new Audio(audioUrl)
      audio.volume = 1
      audio.play().catch(() => {})
      audioRef.current = audio
    }

    const timeoutId = window.setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }

      isShowingEventRef.current = false
      setCurrentEvent(null)
      playNextEvent()
    }, currentEvent.durationMs || 5000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentEvent])

  const mediaKind = detectMediaKind(currentEvent?.mediaUrl)

  return (
    <div className="overlay-screen">
      <div className="overlay-anchor">
        <span>Overlay</span>
        <strong>{slug}</strong>
      </div>

      <div className="overlay-stage">
        {overlayError ? (
          <div className="overlay-idle">
            <span className="overlay-idle-label">Overlay bloqueado</span>
            <h1>{appState.profile.projectName}</h1>
            <p>{overlayError}</p>
          </div>
        ) : currentEvent ? (
          <article className={`overlay-card theme-${currentEvent.theme || 'ember'}`}>
            <div className="overlay-card-head">
              <span className="overlay-source">{currentEvent.sourceLabel || appState.profile.streamerName}</span>
              <span className="overlay-project">{appState.profile.projectName}</span>
            </div>

            <h1>{currentEvent.title}</h1>
            <p>{currentEvent.message}</p>

            {currentEvent.commandText ? (
              <code className="overlay-command">{currentEvent.commandText}</code>
            ) : null}

            {mediaKind === 'image' ? (
              <img className="overlay-media" src={currentEvent.mediaUrl} alt={currentEvent.title} />
            ) : null}

            {mediaKind === 'video' ? (
              <video className="overlay-media" src={currentEvent.mediaUrl} autoPlay muted loop />
            ) : null}
          </article>
        ) : (
          <div className="overlay-idle">
            <span className="overlay-idle-label">Esperando eventos</span>
            <h1>{appState.profile.projectName}</h1>
            <p>Deja esta ruta abierta y manda alertas desde el panel para revisar capas, timing y estilo del overlay.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="section-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

function ActionModal({
  isUploadingMedia,
  mediaLibrary,
  mediaLibraryError,
  onClose,
  onSave,
  onUploadMedia,
}) {
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    outputs: ['overlayAlert'],
    commandText: '',
    overlayText: '',
    mediaUrl: '',
  })
  const [errorMessage, setErrorMessage] = useState('')
  const selectedMediaItem =
    mediaLibrary.find((item) => item.url === draft.mediaUrl || item.fileName === draft.mediaUrl) || null

  function toggleOutput(outputId) {
    setDraft((currentDraft) => {
      const isSelected = currentDraft.outputs.includes(outputId)

      return {
        ...currentDraft,
        outputs: isSelected
          ? currentDraft.outputs.filter((output) => output !== outputId)
          : [...currentDraft.outputs, outputId],
      }
    })
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!draft.name.trim()) {
      setErrorMessage('Ponle un nombre a la accion.')
      return
    }

    if (draft.outputs.length === 0) {
      setErrorMessage('Selecciona al menos una salida.')
      return
    }

    onSave({
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      commandText: draft.commandText.trim(),
      overlayText: draft.overlayText.trim(),
      mediaUrl: draft.mediaUrl.trim(),
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Nueva accion</span>
            <h2>Define lo que debe ocurrir</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            x
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
            placeholder="Que efecto deberia provocar esta accion."
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />

          <div className="field-group">
            <span className="field-label">Salidas</span>
            <div className="option-grid">
              {OUTPUT_OPTIONS.map((option) => (
                <label key={option.id} className="option-card">
                  <input
                    type="checkbox"
                    checked={draft.outputs.includes(option.id)}
                    onChange={() => toggleOutput(option.id)}
                  />
                  <div>
                    <strong>{option.label}</strong>
                    <span>{option.note}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <label className="field-label" htmlFor="action-command">
            Comando o payload
          </label>
          <input
            id="action-command"
            className="text-field"
            placeholder="Ej: /summon creeper ~ ~1 ~"
            value={draft.commandText}
            onChange={(event) => setDraft({ ...draft, commandText: event.target.value })}
          />

          <label className="field-label" htmlFor="action-overlay">
            Texto para el overlay
          </label>
          <input
            id="action-overlay"
            className="text-field"
            placeholder="Mensaje que vera tu audiencia."
            value={draft.overlayText}
            onChange={(event) => setDraft({ ...draft, overlayText: event.target.value })}
          />

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

          <div className="card-actions">
            <label className="secondary-button upload-button">
              {isUploadingMedia ? 'Subiendo...' : 'Subir a biblioteca'}
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

          {errorMessage ? <div className="error-box">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              Guardar accion
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TriggerModal({ actions, onClose, onSave }) {
  const [draft, setDraft] = useState({
    source: 'gift',
    match: '',
    actionId: actions[0]?.id || '',
    cooldownSeconds: '0',
  })
  const [errorMessage, setErrorMessage] = useState('')

  function handleSubmit(event) {
    event.preventDefault()

    if (!draft.match.trim()) {
      setErrorMessage('Define que evento o patron debe activar el trigger.')
      return
    }

    if (!draft.actionId) {
      setErrorMessage('Selecciona una accion para este trigger.')
      return
    }

    onSave({
      ...draft,
      match: draft.match.trim(),
      cooldownSeconds: draft.cooldownSeconds.trim() || '0',
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Nuevo trigger</span>
            <h2>Conecta un evento con una accion</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            x
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="trigger-source">
            Fuente
          </label>
          <select
            id="trigger-source"
            className="text-field"
            value={draft.source}
            onChange={(event) => setDraft({ ...draft, source: event.target.value })}
          >
            {TRIGGER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="trigger-match">
            Que debe matchear
          </label>
          <input
            id="trigger-match"
            className="text-field"
            placeholder="Ej: Rose x1, !chaos, 100 likes..."
            value={draft.match}
            onChange={(event) => setDraft({ ...draft, match: event.target.value })}
          />

          <label className="field-label" htmlFor="trigger-action">
            Accion a disparar
          </label>
          <select
            id="trigger-action"
            className="text-field"
            value={draft.actionId}
            onChange={(event) => setDraft({ ...draft, actionId: event.target.value })}
          >
            {actions.map((action) => (
              <option key={action.id} value={action.id}>
                {action.name}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="trigger-cooldown">
            Cooldown en segundos
          </label>
          <input
            id="trigger-cooldown"
            className="text-field"
            value={draft.cooldownSeconds}
            onChange={(event) => setDraft({ ...draft, cooldownSeconds: event.target.value })}
          />

          {errorMessage ? <div className="error-box">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              Guardar trigger
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default App
