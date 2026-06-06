/**
 * ttsEngine.js
 * Abstracción del motor de síntesis de voz.
 *
 * ─── Para conectar un proveedor nuevo en el futuro ────────────
 *  1. Crea una función createXxxEngine(options) que retorne { id, isAvailable, speak, cancel }
 *  2. La firma de speak() DEBE respetar la interfaz definida abajo
 *  3. Agrega un case en createTTSEngine() y un engine-row en TTSSection.jsx
 * ─────────────────────────────────────────────────────────────
 *
 * Interfaz de speak(params):
 *   params.text          string   — texto a sintetizar
 *   params.volume        number   — 0-1 (volumen maestro)
 *   params.rate          number   — velocidad (solo browser; EL usa stability/style)
 *   params.pitch         number   — tono (solo browser)
 *   params.lang          string   — 'es-ES', 'en-US', etc.
 *   params.voiceName     string   — nombre de voz del sistema (solo browser)
 *   params.profile       object   — perfil TTS completo (incluye elevenLabsVoiceId, etc.)
 *   params.onEnd         () => void
 *   params.onError       (errorCode: string) => void
 *
 * Retorna: () => void  — función de cancelación
 */

/* ═══════════════════════════════════════════════════════════════
   MOTOR: Web Speech API (browser / Electron)
   ═══════════════════════════════════════════════════════════════ */

export function createBrowserEngine() {
  const isAvailable = typeof window !== 'undefined' && Boolean(window.speechSynthesis)

  function cancel() {
    if (isAvailable) window.speechSynthesis.cancel()
  }

  function speak({ text, volume, rate, pitch, lang, voiceName, onEnd, onError }) {
    if (!isAvailable) {
      onError?.('not-available')
      return () => {}
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.volume = Math.max(0, Math.min(1, volume ?? 0.8))
    utterance.rate = Math.max(0.1, Math.min(10, rate ?? 1.0))
    utterance.pitch = Math.max(0, Math.min(2, pitch ?? 1.0))
    utterance.lang = lang || 'es-ES'

    if (voiceName) {
      const voices = window.speechSynthesis.getVoices()
      const match = voices.find((v) => v.name === voiceName)
      if (match) utterance.voice = match
    }

    utterance.onend = () => onEnd?.()
    utterance.onerror = (ev) => onError?.(ev.error || 'unknown')

    window.speechSynthesis.speak(utterance)
    return () => window.speechSynthesis.cancel()
  }

  return { id: 'browser', isAvailable, speak, cancel }
}

/* ═══════════════════════════════════════════════════════════════
   MOTOR: ElevenLabs via REST + AudioContext
   ═══════════════════════════════════════════════════════════════
   Modelo: eleven_turbo_v2_5 →  multilingual, ~250ms latencia
   Endpoint: POST /v1/text-to-speech/{voice_id}
   Auth: xi-api-key header

   Cada perfil incluye:
     - elevenLabsVoiceId      (string)   voz pre-made del catálogo EL
     - elevenLabsStability    (0-1)      más alto = más consistente, menos expresivo
     - elevenLabsSimilarityBoost (0-1)   fidelidad a la voz original
     - elevenLabsStyle        (0-1)      expresividad adicional (turbo_v2_5)
   ═══════════════════════════════════════════════════════════════ */

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1'
const ELEVENLABS_MODEL = 'eleven_turbo_v2_5'   // más rápido, multilingual
const ELEVENLABS_TIMEOUT_MS = 10_000           // 10s de timeout

export function createElevenLabsEngine(apiKey) {
  const isAvailable = Boolean(apiKey && typeof fetch !== 'undefined')

  /** Cancelación del request en curso */
  let activeController = null
  /** Elemento de audio en curso */
  let activeAudio = null

  function cancel() {
    activeController?.abort()
    activeController = null
    if (activeAudio) {
      activeAudio.pause()
      if (activeAudio.src) URL.revokeObjectURL(activeAudio.src)
      activeAudio = null
    }
  }

  function speak({ text, volume, profile, onEnd, onError }) {
    if (!isAvailable) {
      onError?.('no-api-key')
      return () => {}
    }

    // Cancelar cualquier petición anterior
    cancel()

    const controller = new AbortController()
    activeController = controller

    const timeoutId = window.setTimeout(() => {
      controller.abort()
    }, ELEVENLABS_TIMEOUT_MS)

    // Usar la voz y parámetros del perfil, con fallbacks razonables
    const voiceId = profile?.elevenLabsVoiceId || 'EXAVITQu4vr4xnSDxMaL'
    const stability = profile?.elevenLabsStability ?? 0.5
    const similarityBoost = profile?.elevenLabsSimilarityBoost ?? 0.75
    const style = profile?.elevenLabsStyle ?? 0.0

    const requestBody = {
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: true,
      },
    }

    fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
      .then(async (response) => {
        window.clearTimeout(timeoutId)

        if (!response.ok) {
          // Parsear el mensaje de error de la API si existe
          let errMessage = `api-${response.status}`
          try {
            const errJson = await response.json()
            errMessage = errJson?.detail?.message || errJson?.detail || errMessage
          } catch { /* ignore */ }
          throw new Error(errMessage)
        }

        return response.blob()
      })
      .then((blob) => {
        if (controller.signal.aborted) return  // fue cancelado mientras descargábamos

        const blobUrl = URL.createObjectURL(blob)
        const audio = new Audio(blobUrl)
        audio.volume = Math.max(0, Math.min(1, volume ?? 0.8))
        activeAudio = audio

        audio.onended = () => {
          URL.revokeObjectURL(blobUrl)
          activeAudio = null
          activeController = null
          onEnd?.()
        }

        audio.onerror = (ev) => {
          URL.revokeObjectURL(blobUrl)
          activeAudio = null
          activeController = null
          onError?.(`audio-error:${ev.type}`)
        }

        audio.play().catch((err) => {
          URL.revokeObjectURL(blobUrl)
          activeAudio = null
          onError?.(`play-blocked:${err.message}`)
        })
      })
      .catch((err) => {
        window.clearTimeout(timeoutId)
        activeController = null
        activeAudio = null

        if (err.name === 'AbortError') {
          // Abortado manualmente o por timeout — no es fatal, reportar como 'canceled'
          onError?.('canceled')
          return
        }

        onError?.(err.message || 'fetch-error')
      })

    return () => cancel()
  }

  return { id: 'elevenlabs', isAvailable, speak, cancel }
}

/* ═══════════════════════════════════════════════════════════════
   MOTOR: Servidor (Edge TTS / Windows SAPI via /api/tts)
   ═══════════════════════════════════════════════════════════════ */

const SERVER_TTS_TIMEOUT_MS = 18_000

export function createServerEngine(options = {}) {
  const isAvailable = typeof fetch !== 'undefined'
  let activeAudio = null
  let activeController = null

  function cancel() {
    activeController?.abort()
    activeController = null
    if (activeAudio) {
      activeAudio.pause()
      if (activeAudio.src?.startsWith('blob:')) {
        URL.revokeObjectURL(activeAudio.src)
      }
      activeAudio = null
    }
  }

  function speak({ text, volume, rate, pitch, profile, voiceName, onEnd, onError }) {
    if (!isAvailable) {
      onError?.('not-available')
      return () => {}
    }

    cancel()

    const controller = new AbortController()
    activeController = controller

    const timeoutId = window.setTimeout(() => {
      controller.abort()
    }, SERVER_TTS_TIMEOUT_MS)

    const profileRate = profile?.rate ?? 1
    const ratePct = Math.round(((Number(rate ?? profileRate) || 1) - 1) * 100)
    const pitchSemi = Math.round(((Number(pitch ?? profile?.pitch) || 1) - 1) * 12)
    const volumePct = Math.round(Math.max(0, Math.min(1, volume ?? 0.8)) * 100)
    const voice =
      options.voice ||
      voiceName ||
      profile?.edgeVoice ||
      'es-ES-ElviraNeural'

    fetch('/api/tts/speak-buffer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice,
        ratePct,
        pitchSemi,
        volumePct,
        baseName: profile?.id || 'live',
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        window.clearTimeout(timeoutId)
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload?.error || `api-${response.status}`)
        }
        return response.json()
      })
      .then((payload) => {
        if (controller.signal.aborted) {
          return
        }

        let src = ''
        if (payload?.audioBase64) {
          const mime = payload.mimeType || 'audio/mpeg'
          src = `data:${mime};base64,${payload.audioBase64}`
        } else if (payload?.url) {
          src = payload.url.startsWith('http') ? payload.url : `${window.location.origin}${payload.url}`
        } else {
          throw new Error('Respuesta TTS vacia')
        }

        const audio = new Audio(src)
        audio.volume = Math.max(0, Math.min(1, volume ?? 0.8))
        activeAudio = audio

        audio.onended = () => {
          if (src.startsWith('blob:')) {
            URL.revokeObjectURL(src)
          }
          activeAudio = null
          activeController = null
          onEnd?.()
        }

        audio.onerror = () => {
          activeAudio = null
          onError?.('audio-error')
        }

        audio.play().catch((err) => onError?.(`play-blocked:${err.message}`))
      })
      .catch((err) => {
        window.clearTimeout(timeoutId)
        activeController = null
        activeAudio = null
        if (err.name === 'AbortError') {
          onError?.('canceled')
          return
        }
        onError?.(err.message || 'server-tts-error')
      })

    return () => cancel()
  }

  return { id: 'server', isAvailable, speak, cancel }
}

/* ═══════════════════════════════════════════════════════════════
   MOTOR: OpenAI TTS (placeholder — implementar cuando se agregue)
   Endpoint: POST https://api.openai.com/v1/audio/speech
   ═══════════════════════════════════════════════════════════════ */
export function createOpenAIEngine(_apiKey) {
  return {
    id: 'openai',
    isAvailable: false,
    speak({ onError }) {
      /*
       * TODO: implementar
       * body: { model: 'tts-1', input: text, voice: 'alloy', response_format: 'mp3', speed: 1.0 }
       * Misma lógica de blob URL + Audio element que ElevenLabs
       */
      onError?.('not-implemented')
      return () => {}
    },
    cancel() {},
  }
}

/* ═══════════════════════════════════════════════════════════════
   MOTOR: Azure Cognitive Speech (placeholder)
   ═══════════════════════════════════════════════════════════════ */
export function createAzureEngine(_subscriptionKey, _region) {
  return {
    id: 'azure',
    isAvailable: false,
    speak({ onError }) {
      /*
       * TODO: implementar
       * Requiere token rotation (POST /sts/v1.0/issueToken cada 9min)
       * Luego usar SDK de Azure o SSML + REST endpoint TTS
       */
      onError?.('not-implemented')
      return () => {}
    },
    cancel() {},
  }
}

/* ═══════════════════════════════════════════════════════════════
   Factory principal
   ═══════════════════════════════════════════════════════════════ */
export function createTTSEngine(engineId = 'browser', options = {}) {
  switch (engineId) {
    case 'elevenlabs': return createElevenLabsEngine(options.apiKey || '')
    case 'server':     return createServerEngine({ voice: options.serverVoice || '' })
    case 'openai':     return createOpenAIEngine(options.apiKey || '')
    case 'azure':      return createAzureEngine(options.apiKey || '', options.region || '')
    case 'browser':
    default:           return createBrowserEngine()
  }
}
