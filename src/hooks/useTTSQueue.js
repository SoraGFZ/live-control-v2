import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TTS_PROFILES_MAP,
  FALLBACK_PROFILE,
  DEFAULT_PROFILE_ASSIGNMENTS,
} from '../ttsProfiles'
import { createTTSEngine, createBrowserEngine } from '../ttsEngine'
import { DEFAULT_TTS_CONFIG } from '../config/ttsDefaults.js'

export { DEFAULT_TTS_CONFIG }

/** Clave de localStorage para la API key — no viaja al servidor */
const LS_EL_KEY = 'tts_el_apikey'

/* ─────────────────────────────────────────────────────────────
   Prioridades de eventos
   ───────────────────────────────────────────────────────────── */
const EVENT_PRIORITY = {
  gift: 0,
  follow: 1,
  'like-burst': 2,
  comment: 3,
  share: 4,
  emote: 5,
}

function getPriority(type) {
  return EVENT_PRIORITY[type] ?? 99
}

/* ─────────────────────────────────────────────────────────────
   Filtros de texto
   ───────────────────────────────────────────────────────────── */
const LINK_RE = /https?:\/\/\S+|www\.\S+/gi
const BOT_RE = /\bnightbot\b|\bstreamelements\b|\bmoobot\b|\bfossabot\b/i
const COMMAND_RE = /^[!/]/

function applyFilters(rawText, config) {
  if (!rawText || typeof rawText !== 'string') return null
  const text = rawText.trim()
  if (!text) return null
  if (config.skipLinks) { LINK_RE.lastIndex = 0; if (LINK_RE.test(text)) return null }
  if (config.skipBots) {
    BOT_RE.lastIndex = 0
    if (BOT_RE.test(text)) return null
    if (COMMAND_RE.test(text)) return null
  }
  return text.length > config.charLimit ? `${text.slice(0, config.charLimit - 3)}...` : text
}

/* ─────────────────────────────────────────────────────────────
   Construcción del texto hablado
   ───────────────────────────────────────────────────────────── */
function buildSpeechText(event, config) {
  const type = String(event?.type || '')
  const user = event?.uniqueId || event?.sourceLabel || 'alguien'
  const giftName = event?.giftName || event?.displayText || 'un regalo'
  const repeatCount = Number(event?.repeatCount || 1)

  switch (type) {
    case 'comment': {
      if (!config.readComments) return null
      const raw = event?.comment || event?.matchText || event?.displayText || ''
      return applyFilters(raw, config)
    }
    case 'gift': {
      if (!config.readGifts) return null
      return applyFilters(`${user} envió ${giftName}${repeatCount > 1 ? ` x${repeatCount}` : ''}`, config)
    }
    case 'follow':
      if (!config.readFollows) return null
      return applyFilters(`${user} acaba de seguirte`, config)
    case 'like-burst': {
      if (!config.readLikes) return null
      const n = event?.likeCount || event?.totalLikeCount || ''
      return applyFilters(n ? `${n} likes` : `${user} mandó likes`, config)
    }
    case 'share': return null
    case 'emote': {
      if (!config.readComments) return null
      const emoteName = event?.emoteName || event?.displayText || ''
      return emoteName ? applyFilters(`${user} usó ${emoteName}`, config) : null
    }
    default: return null
  }
}

/* ─────────────────────────────────────────────────────────────
   Cola con inserción por prioridad
   ───────────────────────────────────────────────────────────── */
function insertWithPriority(queue, newItem) {
  const i = queue.findIndex((item) => item.priority > newItem.priority)
  return i === -1 ? [...queue, newItem] : [...queue.slice(0, i), newItem, ...queue.slice(i)]
}

/* ─────────────────────────────────────────────────────────────
   Resolución de perfil y asignación
   ───────────────────────────────────────────────────────────── */
function resolveProfile(profileId) {
  return TTS_PROFILES_MAP[profileId] || FALLBACK_PROFILE
}

function resolveProfileForEvent(eventType, config) {
  return config.profileAssignments?.[eventType]
    || config.profileAssignments?.manual
    || FALLBACK_PROFILE.id
}

/* ─────────────────────────────────────────────────────────────
   Hook principal: useTTSQueue
   ───────────────────────────────────────────────────────────── */
export function useTTSQueue({ recentEvents = [], initialConfig = null, onConfigChange } = {}) {
  const [config, setConfig] = useState(() => ({
    ...DEFAULT_TTS_CONFIG,
    ...(initialConfig || {}),
    elevenLabsApiKey:
      (typeof localStorage !== 'undefined' ? localStorage.getItem(LS_EL_KEY) : '')
      || initialConfig?.elevenLabsApiKey
      || '',
  }))

  const [queue, setQueue] = useState([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [lastSpoken, setLastSpoken] = useState(null)
  const [ttsError, setTtsError] = useState('')
  const [engineStatus, setEngineStatus] = useState('idle') // 'idle'|'speaking'|'fallback'|'error'

  const queueRef = useRef([])
  const isSpeakingRef = useRef(false)
  const isMountedRef = useRef(true)
  const seenIdsRef = useRef(new Set())
  const cooldownRef = useRef(null)
  const configRef = useRef(config)
  const cancelCurrentRef = useRef(null)

  useEffect(() => { configRef.current = config }, [config])

  useEffect(() => {
    if (!initialConfig || typeof initialConfig !== 'object') {
      return
    }
    setConfig((prev) => ({
      ...prev,
      ...initialConfig,
      elevenLabsApiKey: prev.elevenLabsApiKey || initialConfig.elevenLabsApiKey || '',
    }))
  }, [initialConfig])

  const persistConfig = useCallback((nextConfig) => {
    if (!onConfigChange) {
      return
    }
    const { elevenLabsApiKey, ...persistable } = nextConfig
    onConfigChange(persistable)
  }, [onConfigChange])

  useEffect(() => {
    if (!onConfigChange) {
      return undefined
    }
    const timer = window.setTimeout(() => {
      persistConfig(configRef.current)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [config, onConfigChange, persistConfig])
  useEffect(() => { queueRef.current = queue }, [queue])

  /* Cleanup al desmontar */
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      window.clearTimeout(cooldownRef.current)
      cancelCurrentRef.current?.()
    }
  }, [])

  /* ─────────────────────────────────────────────────────────
     playNext
     Extrae el primer item de la cola, elige el engine correcto
     y lo envía a sintetizar. Si el engine externo falla,
     hace fallback automático al browser engine.
     ───────────────────────────────────────────────────────── */
  const playNextRef = useRef(() => {})

  const playNext = useCallback(() => {
    if (!isMountedRef.current) return
    if (isSpeakingRef.current) return
    if (!configRef.current.enabled) return
    if (queueRef.current.length === 0) return

    const cfg = configRef.current
    const primaryEngine = createTTSEngine(cfg.engineId, {
      apiKey: cfg.elevenLabsApiKey,
      serverVoice: cfg.serverVoice,
    })

    if (!primaryEngine.isAvailable) {
      setTtsError(`Motor "${cfg.engineId}" no disponible. ${cfg.engineId === 'elevenlabs' ? 'Verifica que la API Key esté configurada.' : 'Intenta con el motor de navegador.'}`)
      return
    }

    const [nextItem, ...rest] = queueRef.current
    isSpeakingRef.current = true
    setIsSpeaking(true)
    setQueue(rest)
    queueRef.current = rest
    setEngineStatus('speaking')

    /* El perfil se resolvió al encolar — lo leemos directamente */
    const profile = resolveProfile(nextItem.profileId)

    /* Parámetros comunes */
    const speakParams = {
      text: nextItem.text,
      volume: cfg.volume,
      rate: profile.rate,
      pitch: profile.pitch,
      lang: profile.lang || 'es-ES',
      voiceName: cfg.voiceName || '',
      profile,  // incluye elevenLabsVoiceId, stability, similarityBoost, style
    }

    /* Callback compartido de finalización exitosa */
    const onSuccess = () => {
      if (!isMountedRef.current) return
      isSpeakingRef.current = false
      setIsSpeaking(false)
      setEngineStatus('idle')
      setLastSpoken({
        text: nextItem.text,
        eventType: nextItem.eventType,
        profileId: nextItem.profileId,
        profileName: profile.name,
        profileEmoji: profile.emoji,
        spokenAt: Date.now(),
      })
      setTtsError('')
      cooldownRef.current = window.setTimeout(() => {
        if (isMountedRef.current) playNextRef.current()
      }, configRef.current.cooldownMs)
    }

    /* Fallback al browser engine si el engine principal falla */
    const onPrimaryError = (errorCode) => {
      if (!isMountedRef.current) return

      // Errores que NO deben activar fallback (son cancelaciones manuales)
      if (errorCode === 'canceled' || errorCode === 'interrupted') {
        isSpeakingRef.current = false
        setIsSpeaking(false)
        setEngineStatus('idle')
        return
      }

      // Si ya es el browser engine, no hay fallback posible
      if (cfg.engineId === 'browser') {
        isSpeakingRef.current = false
        setIsSpeaking(false)
        setEngineStatus('error')
        setTtsError(`Error TTS (${profile.name}): ${errorCode}`)
        cooldownRef.current = window.setTimeout(() => {
          if (isMountedRef.current) playNextRef.current()
        }, configRef.current.cooldownMs)
        return
      }

      // Fallback al browser engine
      setTtsError(`⚠️ ${cfg.engineId} falló (${errorCode}) — usando voz del navegador`)
      setEngineStatus('fallback')

      const browserEngine = createBrowserEngine()
      if (!browserEngine.isAvailable) {
        isSpeakingRef.current = false
        setIsSpeaking(false)
        setEngineStatus('error')
        cooldownRef.current = window.setTimeout(() => {
          if (isMountedRef.current) playNextRef.current()
        }, configRef.current.cooldownMs)
        return
      }

      cancelCurrentRef.current = browserEngine.speak({
        ...speakParams,
        onEnd: onSuccess,
        onError: () => {
          if (!isMountedRef.current) return
          isSpeakingRef.current = false
          setIsSpeaking(false)
          setEngineStatus('error')
          cooldownRef.current = window.setTimeout(() => {
            if (isMountedRef.current) playNextRef.current()
          }, configRef.current.cooldownMs)
        },
      })
    }

    cancelCurrentRef.current = primaryEngine.speak({
      ...speakParams,
      onEnd: onSuccess,
      onError: onPrimaryError,
    })
  }, [])

  useEffect(() => {
    playNextRef.current = playNext
  }, [playNext])

  /* ─────────────────────────────────────────────────────────
     enqueueTTS — añadir texto manualmente a la cola
     ───────────────────────────────────────────────────────── */
  const enqueueTTS = useCallback((text, eventType = 'manual', priority = 3, explicitProfileId = null) => {
    if (!text || typeof text !== 'string') return
    const trimmed = text.trim().slice(0, configRef.current.charLimit)
    if (!trimmed) return

    const profileId = explicitProfileId || resolveProfileForEvent(eventType, configRef.current)

    setQueue((prev) => {
      const next = insertWithPriority(prev, { id: `tts-m-${Date.now()}`, text: trimmed, eventType, profileId, priority })
      queueRef.current = next
      return next
    })
  }, [])

  /* Limpiar cola y parar audio */
  const clearQueue = useCallback(() => {
    window.clearTimeout(cooldownRef.current)
    cancelCurrentRef.current?.()
    createTTSEngine(configRef.current.engineId, {
      apiKey: configRef.current.elevenLabsApiKey,
      serverVoice: configRef.current.serverVoice,
    }).cancel()
    createBrowserEngine().cancel()
    isSpeakingRef.current = false
    setIsSpeaking(false)
    setEngineStatus('idle')
    setQueue([])
    queueRef.current = []
  }, [])

  /* Actualizar config — persiste elevenLabsApiKey en localStorage */
  const updateConfig = useCallback((partial) => {
    if ('elevenLabsApiKey' in partial && typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_EL_KEY, partial.elevenLabsApiKey || '')
    }
    setConfig((prev) => ({ ...prev, ...partial }))
  }, [])

  /* Asignar perfil a un tipo de evento */
  const updateProfileAssignment = useCallback((eventType, profileId) => {
    setConfig((prev) => ({
      ...prev,
      profileAssignments: { ...prev.profileAssignments, [eventType]: profileId },
    }))
  }, [])

  /* Parar todo al desactivar TTS */
  useEffect(() => {
    if (!config.enabled) {
      window.clearTimeout(cooldownRef.current)
      cancelCurrentRef.current?.()
      createBrowserEngine().cancel()
      isSpeakingRef.current = false
      setIsSpeaking(false)
      setEngineStatus('idle')
      setQueue([])
      queueRef.current = []
    }
  }, [config.enabled])

  /* Escuchar eventos del live */
  useEffect(() => {
    if (!config.enabled) return
    if (!Array.isArray(recentEvents) || recentEvents.length === 0) return

    const newItems = []
    for (const event of recentEvents) {
      const eventId = event?.id
      if (!eventId || seenIdsRef.current.has(eventId)) continue
      seenIdsRef.current.add(eventId)

      const text = buildSpeechText(event, config)
      if (!text) continue

      const eventType = event.type || 'live'
      newItems.push({
        id: `tts-ev-${eventId}`,
        text,
        eventType,
        profileId: resolveProfileForEvent(eventType, config),
        priority: getPriority(eventType),
      })
    }

    if (newItems.length === 0) return
    setQueue((prev) => {
      let next = prev
      for (const item of newItems) next = insertWithPriority(next, item)
      queueRef.current = next
      return next
    })
  }, [recentEvents, config])

  /* Worker — iniciar reproducción cuando hay items */
  useEffect(() => {
    if (config.enabled && queue.length > 0 && !isSpeakingRef.current) playNextRef.current()
  }, [queue, config.enabled, playNext])

  /* Marcar eventos actuales como vistos (al activar TTS) */
  const resetEventCursor = useCallback(() => {
    if (Array.isArray(recentEvents)) {
      recentEvents.forEach((ev) => { if (ev?.id) seenIdsRef.current.add(ev.id) })
    }
  }, [recentEvents])

  /* Limpiar registro de IDs (al desactivar TTS) */
  const flushSeenIds = useCallback(() => { seenIdsRef.current = new Set() }, [])

  /* Derivado: indica si el engine primario está listo */
  const engineIsAvailable = config.engineId === 'browser'
    ? (typeof window !== 'undefined' && Boolean(window?.speechSynthesis))
    : config.engineId === 'elevenlabs'
      ? Boolean(config.elevenLabsApiKey)
      : config.engineId === 'server'
        ? typeof fetch !== 'undefined'
        : false

  return {
    queue,
    isSpeaking,
    lastSpoken,
    ttsError,
    config,
    engineIsAvailable,
    engineStatus,
    enqueueTTS,
    clearQueue,
    updateConfig,
    updateProfileAssignment,
    resetEventCursor,
    flushSeenIds,
  }
}
