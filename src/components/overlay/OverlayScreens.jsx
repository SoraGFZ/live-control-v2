import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildWebSocketUrl,
  DEFAULT_APP_STATE,
  detectMediaKind,
  mergeStateWithDefaults,
} from '../../live-control'
import {
  createSocketUrl,
  DEFAULT_SERVER_STATUS,
  readStoredState,
  requestJson,
} from '../../dashboardShared'
import {
  formatDurationClock,
  readOverlayAccessKeyFromUrl,
} from '../../dashboardViewHelpers'
import { SmartBarWidget, SongRequestWidget, TopLikesWidget, TopGiftsWidget } from './OverlayWidgets'
import TikControlWidgetFrame from './TikControlWidgetFrame'

function OverlayScreen({ slug }) {
  const [appState, setAppState] = useState(() => readStoredState())
  const [currentEvent, setCurrentEvent] = useState(null)
  const [overlayError, setOverlayError] = useState('')
  const [mediaReady, setMediaReady] = useState(false)
  const seenEventIds = useRef(new Set())
  const latestEventCursorRef = useRef(Date.now())
  const queuedEventsRef = useRef([])
  const isShowingEventRef = useRef(false)
  const audioRef = useRef(null)
  const videoRef = useRef(null)
  const overlayAccessKey = readOverlayAccessKeyFromUrl()
  const mediaKind = detectMediaKind(currentEvent?.mediaUrl)
  const shouldRenderCleanMedia =
    Boolean(currentEvent)
    && ['image', 'video'].includes(mediaKind)
    && currentEvent.outputs?.includes('overlayMedia')
    && !currentEvent.outputs?.includes('overlayAlert')

  const playNextEvent = useCallback(() => {
    if (isShowingEventRef.current) {
      return
    }

    const nextEvent = queuedEventsRef.current.shift()

    if (!nextEvent) {
      return
    }

    isShowingEventRef.current = true
    setMediaReady(false)
    setCurrentEvent(nextEvent)
  }, [])

  const enqueueEvent = useCallback((eventPayload) => {
    if (!eventPayload?.id || seenEventIds.current.has(eventPayload.id)) {
      return
    }

    seenEventIds.current.add(eventPayload.id)

    const eventCreatedAt = Number(eventPayload.createdAt || 0)

    if (Number.isFinite(eventCreatedAt) && eventCreatedAt > 0) {
      latestEventCursorRef.current = Math.max(latestEventCursorRef.current, eventCreatedAt)
    } else {
      latestEventCursorRef.current = Date.now()
    }

    queuedEventsRef.current.push(eventPayload)
    playNextEvent()
  }, [playNextEvent])

  useEffect(() => {
    document.documentElement.dataset.route = 'overlay'
    document.body.dataset.route = 'overlay'

    let socket
    let reconnectTimeoutId
    let isStopped = false
    let canConnectSocket = false

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
            widgets: overlayProfile.widgets,
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
                widgets: payload.payload.widgets,
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

    void bootOverlay()

    return () => {
      isStopped = true
      window.clearTimeout(reconnectTimeoutId)
      socket?.close()
    }
  }, [enqueueEvent, overlayAccessKey, slug])

  useEffect(() => {
    let pollTimeoutId
    let cancelled = false

    async function pollLatestEvent() {
      const searchParams = new URLSearchParams()
      searchParams.set('after', String(latestEventCursorRef.current || Date.now()))

      if (overlayAccessKey) {
        searchParams.set('key', overlayAccessKey)
      }

      try {
        const payload = await requestJson(
          `/api/overlay/${encodeURIComponent(slug)}/latest-event?${searchParams.toString()}`,
        )

        if (payload?.event) {
          enqueueEvent(payload.event)
        }

        if (Number.isFinite(Number(payload?.cursor || 0)) && Number(payload.cursor) > 0) {
          latestEventCursorRef.current = Math.max(
            latestEventCursorRef.current,
            Number(payload.cursor),
          )
        }
      } catch {
        return
      } finally {
        if (!cancelled) {
          pollTimeoutId = window.setTimeout(pollLatestEvent, 1200)
        }
      }
    }

    pollTimeoutId = window.setTimeout(pollLatestEvent, 900)

    return () => {
      cancelled = true
      window.clearTimeout(pollTimeoutId)
    }
  }, [enqueueEvent, overlayAccessKey, slug])

  useEffect(() => {
    if (!currentEvent) {
      return undefined
    }

    const ttsAudioUrl = currentEvent.ttsAudioUrl || ''
    if (ttsAudioUrl) {
      const audio = new Audio(
        ttsAudioUrl.startsWith('http') ? ttsAudioUrl : `${window.location.origin}${ttsAudioUrl}`,
      )
      audio.volume = 1
      audio.play().catch(() => {})
      audioRef.current = audio
    } else if (currentEvent.ttsText && 'speechSynthesis' in window) {
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

    if (shouldRenderCleanMedia && mediaKind === 'video' && !mediaReady) {
      return undefined
    }

    const baseDurationMs = Number(currentEvent.durationMs || 5000)
    const timeoutDurationMs = shouldRenderCleanMedia
      ? mediaKind === 'video'
        ? Math.max(baseDurationMs, 12000)
        : Math.max(baseDurationMs, 6500)
      : baseDurationMs

    const timeoutId = window.setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }

      isShowingEventRef.current = false
      setMediaReady(false)
      setCurrentEvent(null)
      playNextEvent()
    }, timeoutDurationMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentEvent, mediaKind, mediaReady, playNextEvent, shouldRenderCleanMedia])

  useEffect(() => {
    if (!shouldRenderCleanMedia || mediaKind !== 'video' || !currentEvent) {
      return undefined
    }

    const videoElement = videoRef.current

    if (!videoElement) {
      return undefined
    }

    let cancelled = false

    async function ensureVideoPlayback() {
      try {
        videoElement.muted = true
        videoElement.defaultMuted = true
        videoElement.playsInline = true
        videoElement.currentTime = 0
        await videoElement.play()

        if (!cancelled) {
          setMediaReady(true)
        }
      } catch {
        if (!cancelled) {
          window.setTimeout(() => {
            if (!cancelled) {
              void ensureVideoPlayback()
            }
          }, 350)
        }
      }
    }

    void ensureVideoPlayback()

    return () => {
      cancelled = true
    }
  }, [currentEvent, mediaKind, shouldRenderCleanMedia])

  return (
    <div className="overlay-screen">
      <div className={`overlay-stage ${shouldRenderCleanMedia ? 'clean-media' : ''}`}>
        {overlayError ? (
          <div className="overlay-idle">
            <span className="overlay-idle-label">Overlay bloqueado</span>
            <h1>{appState.profile.projectName}</h1>
            <p>{overlayError}</p>
          </div>
        ) : shouldRenderCleanMedia ? (
          <>
            {mediaKind === 'image' ? (
              <img
                className="overlay-media overlay-media-clean"
                src={currentEvent.mediaUrl}
                alt={currentEvent.title || 'Overlay media'}
                onLoad={() => setMediaReady(true)}
              />
            ) : null}

            {mediaKind === 'video' ? (
              <video
                ref={videoRef}
                className="overlay-media overlay-media-clean"
                src={currentEvent.mediaUrl}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                onLoadedData={() => setMediaReady(true)}
                onCanPlay={() => setMediaReady(true)}
              />
            ) : null}
          </>
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
        ) : null}
      </div>
    </div>
  )
}

function SmartBarScreen({ slug }) {
  const [appState, setAppState] = useState(() => readStoredState())
  const [smartBarStatus, setSmartBarStatus] = useState(DEFAULT_SERVER_STATUS.smartBar)
  const [overlayError, setOverlayError] = useState('')
  const overlayAccessKey = readOverlayAccessKeyFromUrl()

  useEffect(() => {
    document.documentElement.dataset.route = 'overlay'
    document.body.dataset.route = 'overlay'

    let socket
    let reconnectTimeoutId
    let isStopped = false
    let canConnectSocket = false

    async function loadOverlayState() {
      try {
        const overlayPayload = await requestJson(
          `/api/overlay/${encodeURIComponent(slug)}${
            overlayAccessKey ? `?key=${encodeURIComponent(overlayAccessKey)}` : ''
          }`,
        )

        setAppState((currentState) =>
          mergeStateWithDefaults({
            ...currentState,
            profile: overlayPayload.profile,
            widgets: overlayPayload.widgets,
          }),
        )
        setSmartBarStatus(overlayPayload.smartBar || DEFAULT_SERVER_STATUS.smartBar)
        setOverlayError('')
        canConnectSocket = true
      } catch (error) {
        if (error?.status === 401) {
          setOverlayError('Este widget necesita la clave publica correcta en la URL.')
          return
        }

        setOverlayError('No pude cargar el smart bar desde el backend.')
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
                widgets: payload.payload.widgets,
              }),
            )
            setSmartBarStatus(payload.payload.smartBar || DEFAULT_SERVER_STATUS.smartBar)
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

    async function bootSmartBar() {
      await loadOverlayState()

      if (!isStopped && canConnectSocket) {
        connectSocket()
      }
    }

    void bootSmartBar()

    return () => {
      isStopped = true
      window.clearTimeout(reconnectTimeoutId)
      socket?.close()
    }
  }, [overlayAccessKey, slug])

  const smartBar = appState.widgets?.smartBar || {}

  if (overlayError) {
    return (
      <div className="overlay-screen">
        <div className="overlay-stage">
          <div className="overlay-idle">
            <span className="overlay-idle-label">Smart bar bloqueado</span>
            <h1>{appState.profile.projectName}</h1>
            <p>{overlayError}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="overlay-screen smartbar-screen">
      <div className="smartbar-stage">
        <SmartBarWidget smartBar={smartBar} smartBarStatus={smartBarStatus} />
      </div>
    </div>
  )
}

function SongRequestScreen({ slug }) {
  const [appState, setAppState] = useState(() => readStoredState())
  const [musicStatus, setMusicStatus] = useState(DEFAULT_SERVER_STATUS.music)
  const [overlayError, setOverlayError] = useState('')
  const overlayAccessKey = readOverlayAccessKeyFromUrl()

  useEffect(() => {
    document.documentElement.dataset.route = 'overlay'
    document.body.dataset.route = 'overlay'

    let socket = null
    let reconnectTimeoutId = 0
    let isStopped = false
    let canConnectSocket = false

    async function loadOverlayState() {
      try {
        const overlayPayload = await requestJson(
          `/api/overlay/${encodeURIComponent(slug)}${
            overlayAccessKey ? `?key=${encodeURIComponent(overlayAccessKey)}` : ''
          }`,
        )
        setAppState((currentState) =>
          mergeStateWithDefaults({
            ...currentState,
            profile: overlayPayload.profile,
            widgets: overlayPayload.widgets,
            music: {
              ...currentState.music,
              ...(overlayPayload.music || currentState.music || {}),
            },
          }),
        )
        setMusicStatus(overlayPayload.music || DEFAULT_SERVER_STATUS.music)
        setOverlayError('')
        canConnectSocket = true
      } catch (error) {
        if (error?.status === 401) {
          setOverlayError('Este widget necesita la clave publica correcta en la URL.')
          return
        }

        if (error?.status === 404) {
          setOverlayError('No encontre ese slug de overlay. Revisa la URL publica.')
          return
        }

        setOverlayError('No pude cargar el widget de musica.')
      }
    }

    function connectSocket() {
      const socketUrl = buildWebSocketUrl(window.location.origin, '/ws/overlay', overlayAccessKey)
      socket = new WebSocket(socketUrl)

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)

          if (payload.type === 'overlay-state') {
            setAppState((currentState) =>
              mergeStateWithDefaults({
                ...currentState,
                profile: {
                  ...currentState.profile,
                  ...(payload.payload?.profile || {}),
                },
                widgets: {
                  ...currentState.widgets,
                  ...(payload.payload?.widgets || {}),
                },
                music: {
                  ...currentState.music,
                  ...(payload.payload?.music || {}),
                },
              }),
            )
            setMusicStatus(payload.payload?.music || DEFAULT_SERVER_STATUS.music)
          }
        } catch {
          return
        }
      }

      socket.onclose = () => {
        if (!isStopped) {
          reconnectTimeoutId = window.setTimeout(connectSocket, 1500)
        }
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    async function bootSongRequest() {
      await loadOverlayState()

      if (!isStopped && canConnectSocket) {
        connectSocket()
      }
    }

    void bootSongRequest()

    return () => {
      isStopped = true
      window.clearTimeout(reconnectTimeoutId)
      socket?.close()
    }
  }, [overlayAccessKey, slug])

  const music = appState.music || DEFAULT_APP_STATE.music
  const hasSongRequestContent =
    Boolean(musicStatus?.currentPlayback?.track)
    || (music?.overlayShowQueue
      && Array.isArray(music?.queue)
      && music.queue.some((entry) => ['queued', 'sent'].includes(entry.status)))

  if (overlayError) {
    return (
      <div className="overlay-screen">
        <div className="overlay-stage">
          <div className="overlay-idle">
            <span className="overlay-idle-kicker">Widget bloqueado</span>
            <strong>{overlayError}</strong>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="overlay-screen songrequest-screen">
      <div className="songrequest-stage">
        {hasSongRequestContent ? (
          <SongRequestWidget music={music} musicStatus={musicStatus} />
        ) : (
          <SongRequestWidget music={music} musicStatus={musicStatus} preview />
        )}
      </div>
    </div>
  )
}

function useLeaderboardOverlay(slug) {
  const [appState, setAppState] = useState(() => readStoredState())
  const [leaderboards, setLeaderboards] = useState(DEFAULT_SERVER_STATUS.leaderboards)
  const [overlayError, setOverlayError] = useState('')
  const overlayAccessKey = readOverlayAccessKeyFromUrl()

  useEffect(() => {
    document.documentElement.dataset.route = 'overlay'
    document.body.dataset.route = 'overlay'

    let socket = null
    let reconnectTimeoutId = 0
    let isStopped = false
    let canConnectSocket = false

    async function loadOverlayState() {
      try {
        const overlayPayload = await requestJson(
          `/api/overlay/${encodeURIComponent(slug)}${
            overlayAccessKey ? `?key=${encodeURIComponent(overlayAccessKey)}` : ''
          }`,
        )
        setAppState((currentState) =>
          mergeStateWithDefaults({
            ...currentState,
            profile: overlayPayload.profile,
            widgets: overlayPayload.widgets,
          }),
        )
        setLeaderboards(overlayPayload.leaderboards || DEFAULT_SERVER_STATUS.leaderboards)
        setOverlayError('')
        canConnectSocket = true
      } catch (error) {
        if (error?.status === 401) {
          setOverlayError('Este widget necesita la clave publica correcta en la URL.')
          return
        }

        if (error?.status === 404) {
          setOverlayError('No encontre ese slug de overlay. Revisa la URL publica.')
          return
        }

        setOverlayError('No pude cargar el widget de rankings.')
      }
    }

    function connectSocket() {
      const socketUrl = buildWebSocketUrl(window.location.origin, '/ws/overlay', overlayAccessKey)
      socket = new WebSocket(socketUrl)

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)

          if (payload.type === 'overlay-state') {
            setAppState((currentState) =>
              mergeStateWithDefaults({
                ...currentState,
                profile: {
                  ...currentState.profile,
                  ...(payload.payload?.profile || {}),
                },
                widgets: {
                  ...currentState.widgets,
                  ...(payload.payload?.widgets || {}),
                },
              }),
            )
            setLeaderboards(payload.payload?.leaderboards || DEFAULT_SERVER_STATUS.leaderboards)
          }
        } catch {
          return
        }
      }

      socket.onclose = () => {
        if (!isStopped) {
          reconnectTimeoutId = window.setTimeout(connectSocket, 1500)
        }
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    async function bootOverlay() {
      await loadOverlayState()

      if (!isStopped && canConnectSocket) {
        connectSocket()
      }
    }

    void bootOverlay()

    return () => {
      isStopped = true
      window.clearTimeout(reconnectTimeoutId)
      socket?.close()
    }
  }, [overlayAccessKey, slug])

  return {
    appState,
    leaderboards,
    overlayError,
  }
}

function TopLikesScreen() {
  return (
    <div className="overlay-screen tikcontrol-widget-screen">
      <TikControlWidgetFrame widgetFile="top-likes.html" className="tikcontrol-widget-frame--fullscreen" />
    </div>
  )
}

function TopGiftsScreen() {
  return (
    <div className="overlay-screen tikcontrol-widget-screen">
      <TikControlWidgetFrame widgetFile="top-donors.html" className="tikcontrol-widget-frame--fullscreen" />
    </div>
  )
}

export {
  OverlayScreen,
  SmartBarWidget,
  SongRequestWidget,
  TopLikesWidget,
  TopGiftsWidget,
  SmartBarScreen,
  SongRequestScreen,
  TopLikesScreen,
  TopGiftsScreen,
}
