import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Volume2,
  Zap,
  MessageSquare,
  Gift,
  UserPlus,
  Heart,
  Play,
  RotateCcw,
  Sparkles,
  Loader2,
  Trash2,
  CheckCircle2,
  Square,
  Settings2,
  AlignLeft,
  Radio,
  ChevronDown,
  Eye,
  EyeOff,
  Key,
  Wifi,
  WifiOff,
} from 'lucide-react'
import SectionHeader from '../common/SectionHeader'
import { useTTSQueue } from '../../hooks/useTTSQueue'
import { createBrowserEngine } from '../../ttsEngine'
import {
  TTS_PROFILES,
  TTS_PROFILES_MAP,
  ASSIGNABLE_EVENTS,
} from '../../ttsProfiles'

/* ══════════════════════════════════════════════════════════════
   Sub-componentes reutilizables
   ══════════════════════════════════════════════════════════════ */

function ToggleSwitch({ checked, onChange, id }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="tts-toggle"
      data-active={checked}
    >
      <span className="tts-toggle-thumb" />
    </button>
  )
}

function SliderField({ label, id, value, onChange, min = 0, max = 100, step = 1, suffix = '' }) {
  return (
    <div className="tts-slider-group">
      <div className="tts-slider-head">
        <label className="field-label" htmlFor={id}>{label}</label>
        <span className="tts-slider-value">{value}{suffix}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tts-range"
      />
    </div>
  )
}

function TriggerRow({ icon: Icon, label, description, checked, onChange, id }) {
  return (
    <label className="tts-trigger-row">
      <span className="tts-trigger-icon"><Icon size={16} /></span>
      <div className="tts-trigger-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} id={id} />
    </label>
  )
}

/* ──────────────────────────────────────────────────────────────
   Tarjeta de perfil de voz
   ────────────────────────────────────────────────────────────── */
function ProfileCard({ profile, isSelected, onSelect, onTest, isTesting }) {
  return (
    <div
      className="tts-profile-card"
      data-selected={isSelected}
      style={{
        '--profile-color': profile.color,
        '--profile-bg': profile.colorBg,
        '--profile-border': profile.colorBorder,
      }}
    >
      <div className="tts-profile-header">
        <span className="tts-profile-emoji">{profile.emoji}</span>
        <div className="tts-profile-title">
          <strong>{profile.name}</strong>
          <span className="tts-profile-tagline">{profile.tagline}</span>
        </div>
        {isSelected && <span className="tts-profile-active-badge">En uso</span>}
      </div>

      <p className="tts-profile-desc">{profile.description}</p>

      <div className="tts-profile-params">
        <span className="tts-param-chip">
          <span>Vel</span>
          <strong>{profile.rate}x</strong>
        </span>
        <span className="tts-param-chip">
          <span>Tono</span>
          <strong>{profile.pitch}x</strong>
        </span>
      </div>

      <div className="tts-profile-actions">
        <button
          type="button"
          className={`tts-profile-select-btn ${isSelected ? 'active' : ''}`}
          onClick={() => onSelect(profile.id)}
        >
          {isSelected ? '✓ Seleccionado' : 'Seleccionar'}
        </button>
        <button
          type="button"
          className="tts-profile-test-btn"
          onClick={() => onTest(profile)}
          disabled={isTesting}
          title="Probar esta voz"
        >
          {isTesting ? <Loader2 size={13} className="tts-spin" /> : <Play size={13} />}
        </button>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Panel de asignación evento → perfil
   ────────────────────────────────────────────────────────────── */
function EventProfileAssignment({ assignments, onUpdate }) {
  return (
    <div className="tts-assignment-grid">
      {ASSIGNABLE_EVENTS.map((ev) => {
        const assignedId = assignments[ev.id] || ''
        const assignedProfile = TTS_PROFILES_MAP[assignedId]

        return (
          <div key={ev.id} className="tts-assignment-row">
            <span className="tts-assignment-icon">{ev.icon}</span>
            <span className="tts-assignment-label">{ev.label}</span>

            <div className="tts-assignment-select-wrap">
              {assignedProfile && (
                <span
                  className="tts-assignment-preview"
                  style={{ color: assignedProfile.color }}
                >
                  {assignedProfile.emoji}
                </span>
              )}
              <select
                className="text-field tts-assignment-select"
                value={assignedId}
                onChange={(e) => onUpdate(ev.id, e.target.value)}
              >
                <option value="">Sin perfil (global)</option>
                {TTS_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.emoji} {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="tts-select-arrow" style={{ right: '10px' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Hook de voces del sistema
   ────────────────────────────────────────────────────────────── */
function useSystemVoices() {
  const [voices, setVoices] = useState([])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    function loadVoices() {
      const available = window.speechSynthesis.getVoices()
      if (available.length > 0) {
        const sorted = [...available].sort((a, b) => {
          const aEs = a.lang.startsWith('es') ? 0 : 1
          const bEs = b.lang.startsWith('es') ? 0 : 1
          return aEs - bEs
        })
        setVoices(sorted)
      }
    }

    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [])

  return voices
}

/* ══════════════════════════════════════════════════════════════
   Datos estáticos
   ══════════════════════════════════════════════════════════════ */

const TTS_ENGINES = [
  { id: 'server', label: 'Servidor (Edge / Windows)', note: 'TTS local vía backend — estilo TikControl' },
  { id: 'browser', label: 'Navegador (Web Speech API)', note: 'Sin configuración, gratis' },
  { id: 'elevenlabs', label: 'ElevenLabs', note: 'API Key requerida — alta calidad' },
  { id: 'openai', label: 'OpenAI TTS', note: 'API Key requerida' },
  { id: 'azure', label: 'Azure Cognitive Speech', note: 'Configuración avanzada' },
]

/* ══════════════════════════════════════════════════════════════
   Componente principal
   ══════════════════════════════════════════════════════════════ */

function TTSSection({ serverStatus, ttsConfig = null, onTtsConfigChange }) {
  const recentEvents = serverStatus?.recentEvents || []
  const systemVoices = useSystemVoices()
  const hasSpeechSupport = typeof window !== 'undefined' && Boolean(window.speechSynthesis)

  /* ── Hook TTS ── */
  const {
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
  } = useTTSQueue({
    recentEvents,
    initialConfig: ttsConfig,
    onConfigChange: onTtsConfigChange,
  })

  /* ── Estado local de UI ── */
  const [globalProfileId, setGlobalProfileId] = useState('epic-narrator')
  const [showApiKey, setShowApiKey] = useState(false)
  const [serverVoices, setServerVoices] = useState([])
  const [serverTtsStatus, setServerTtsStatus] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadServerTtsMeta() {
      try {
        const [statusRes, voicesRes] = await Promise.all([
          fetch('/api/tts/status'),
          fetch('/api/tts/voices'),
        ])
        const statusPayload = await statusRes.json()
        const voicesPayload = await voicesRes.json()
        if (cancelled) {
          return
        }
        if (statusPayload?.ok) {
          setServerTtsStatus(statusPayload)
        }
        if (voicesPayload?.ok && Array.isArray(voicesPayload.voices)) {
          setServerVoices(voicesPayload.voices)
        }
      } catch {
        if (!cancelled) {
          setServerTtsStatus(null)
        }
      }
    }

    loadServerTtsMeta()
    return () => {
      cancelled = true
    }
  }, [])

  // Test de voz
  const [testText, setTestText] = useState('¡Hola! Bienvenido al live, gracias por conectarte.')
  const [testFeedback, setTestFeedback] = useState('')
  const [testingProfileId, setTestingProfileId] = useState(null)
  const feedbackTimerRef = useRef(null)

  /* ── Valores derivados ── */
  const currentEngine = TTS_ENGINES.find((e) => e.id === config.engineId)
  const volumePct = Math.round(config.volume * 100)

  const connectionStatus = !config.enabled ? 'off'
    : isSpeaking ? 'speaking'
    : queue.length > 0 ? 'queued'
    : 'idle'

  const statusChipClass = { speaking: 'warn', queued: 'warn', idle: 'ok', off: 'off' }[connectionStatus]
  const statusLabel = {
    speaking: '🔊 Reproduciendo',
    queued: `⏳ ${queue.length} en cola`,
    idle: 'Activo · en espera',
    off: 'Apagado',
  }[connectionStatus]

  /* ── Handlers ── */
  function handleToggleTTS(value) {
    if (value) { resetEventCursor() } else { flushSeenIds() }
    updateConfig({ enabled: value })
  }

  /* Prueba de voz directa usando un perfil específico */
  const handleTestProfile = useCallback((profile) => {
    if (!testText.trim()) return

    createBrowserEngine().cancel()
    setTestingProfileId(profile.id)
    setTestFeedback('')

    const text = (testText || profile.sampleText).slice(0, config.charLimit)
    const baseParams = {
      text,
      volume: config.volume,
      rate: profile.rate,
      pitch: profile.pitch,
      lang: profile.lang || 'es-ES',
      voiceName: config.voiceName || '',
      profile,
    }

    const onEnd = () => {
      setTestingProfileId(null)
      setTestFeedback('ok')
      window.clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = window.setTimeout(() => setTestFeedback(''), 3000)
    }
    const onError = (code) => {
      if (code === 'canceled' || code === 'interrupted') { setTestingProfileId(null); return }
      setTestingProfileId(null)
      setTestFeedback(`error:${code}`)
    }

    if (config.engineId === 'server') {
      import('../../ttsEngine').then(({ createServerEngine }) => {
        createServerEngine({ voice: config.serverVoice }).speak({
          ...baseParams,
          onEnd,
          onError: (code) => {
            if (code === 'canceled' || code === 'interrupted') { setTestingProfileId(null); return }
            setTestFeedback('fallback')
            createBrowserEngine().speak({ ...baseParams, onEnd, onError })
          },
        })
      })
      return
    }

    if (config.engineId === 'elevenlabs' && config.elevenLabsApiKey) {
      import('../../ttsEngine').then(({ createElevenLabsEngine }) => {
        createElevenLabsEngine(config.elevenLabsApiKey).speak({
          ...baseParams,
          onEnd,
          onError: (code) => {
            if (code === 'canceled' || code === 'interrupted') { setTestingProfileId(null); return }
            setTestFeedback('fallback')
            createBrowserEngine().speak({ ...baseParams, onEnd, onError })
          },
        })
      })
      return
    }

    createBrowserEngine().speak({ ...baseParams, onEnd, onError })
  }, [testText, config])

  function handleStopTest() {
    createBrowserEngine().cancel()
    if (config.engineId === 'server') {
      import('../../ttsEngine').then(({ createServerEngine }) => {
        createServerEngine({ voice: config.serverVoice }).cancel()
      })
    }
    if (config.engineId === 'elevenlabs' && config.elevenLabsApiKey) {
      import('../../ttsEngine').then(({ createElevenLabsEngine }) => {
        createElevenLabsEngine(config.elevenLabsApiKey).cancel()
      })
    }
    setTestingProfileId(null)
    setTestFeedback('')
  }

  useEffect(() => {
    return () => {
      window.clearTimeout(feedbackTimerRef.current)
      createBrowserEngine().cancel()
    }
  }, [])


  /* ════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════ */
  return (
    <section className="panel-section" id="tts">

      {/* ── Header ── */}
      <SectionHeader
        eyebrow="TTS"
        title="Texto a voz"
        description="Convierte eventos del live en audio con personalidad. Cada tipo de evento puede tener su propia voz y carácter."
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className={`status-chip ${statusChipClass}`}>{statusLabel}</span>
            <ToggleSwitch checked={config.enabled} onChange={handleToggleTTS} id="tts-master" />
          </div>
        }
      />

      {/* ── Status bar (solo activo) ── */}
      {config.enabled && (
        <div className="tts-status-bar">
          <div className="tts-status-left">
            {isSpeaking ? (
              <><Loader2 size={14} className="tts-spin" /><span>Reproduciendo...</span></>
            ) : (
              <><Volume2 size={14} /><span>Escuchando el live — {queue.length} en cola</span></>
            )}
          </div>
          {lastSpoken && (
            <span className="muted-pill" style={{ fontSize: '0.76rem' }}>
              {lastSpoken.profileEmoji} &quot;{lastSpoken.text.slice(0, 36)}{lastSpoken.text.length > 36 ? '...' : ''}&quot;
            </span>
          )}
          {queue.length > 0 && (
            <button type="button" className="ghost-button compact-button" onClick={clearQueue}>
              <Trash2 size={13} />Limpiar ({queue.length})
            </button>
          )}
        </div>
      )}

      {ttsError && (
        <div className="tts-api-notice tts-notice-error">
          <Zap size={14} /><span>{ttsError}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SECCIÓN: PERFILES DE VOZ
          ══════════════════════════════════════════════════════ */}
      <article className="surface-card">
        <div className="card-top">
          <div>
            <span className="eyebrow">Perfiles de voz</span>
            <h3>Personajes TTS</h3>
            <p>Cada perfil tiene velocidad, tono y personalidad propia. Puedes asignar distintos perfiles a distintos tipos de eventos.</p>
          </div>
          <span className="bridge-badge">
            <Sparkles size={13} />
            {TTS_PROFILES.length} perfiles
          </span>
        </div>

        {/* Grid de tarjetas de perfiles */}
        <div className="tts-profiles-grid">
          {TTS_PROFILES.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              isSelected={globalProfileId === profile.id}
              onSelect={setGlobalProfileId}
              onTest={handleTestProfile}
              isTesting={testingProfileId === profile.id}
            />
          ))}
        </div>

        {/* Textarea de texto de prueba compartida */}
        <div className="tts-profiles-test-bar">
          <div style={{ flex: 1, minWidth: 0 }}>
            <label className="field-label" htmlFor="tts-profile-test-text">
              Texto de prueba — haz clic en ▶ en cualquier perfil para escucharlo
            </label>
            <input
              id="tts-profile-test-text"
              type="text"
              className="text-field"
              style={{ marginTop: '6px' }}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              maxLength={config.charLimit}
              placeholder="Escribe el texto de prueba..."
            />
          </div>
          {testingProfileId && (
            <button type="button" className="ghost-button" onClick={handleStopTest}>
              <Square size={14} />Parar
            </button>
          )}
        </div>

        {testFeedback === 'ok' && (
          <div className="tts-feedback-ok">
            <CheckCircle2 size={14} />
            <span>Reproducción completada{config.engineId === 'elevenlabs' ? ' · ElevenLabs' : ''}</span>
          </div>
        )}
        {testFeedback === 'fallback' && (
          <div className="tts-feedback-fallback">
            <Zap size={14} />
            <span>ElevenLabs no disponible en este momento — reproduciendo con voz del navegador</span>
          </div>
        )}
        {testFeedback.startsWith('error:') && (
          <div className="tts-api-notice tts-notice-error">
            <Zap size={13} /><span>{testFeedback.replace('error:', '')}</span>
          </div>
        )}
        {!engineIsAvailable && config.engineId === 'browser' && (
          <div className="tts-api-notice">
            <Zap size={14} /><span>speechSynthesis no detectado. Usa Chrome, Edge o la app desktop.</span>
          </div>
        )}
      </article>

      {/* ══════════════════════════════════════════════════════
          SECCIÓN: ASIGNACIÓN DE PERFILES POR EVENTO
          ══════════════════════════════════════════════════════ */}
      <div className="tts-top-grid">

        <article className="surface-card">
          <div className="card-top">
            <div>
              <span className="eyebrow">Asignación</span>
              <h3>¿Qué voz habla cuándo?</h3>
              <p>Asigna un perfil de voz a cada tipo de evento del live.</p>
            </div>
          </div>

          <EventProfileAssignment
            assignments={config.profileAssignments}
            onUpdate={updateProfileAssignment}
          />

          <div className="tts-api-notice" style={{ marginTop: '4px' }}>
            <Sparkles size={14} />
            <span>El regalo llega en épica voz de narrador; el chat suena como un héroe de anime. Así de flexible es el sistema.</span>
          </div>
        </article>

        {/* ── Triggers del live ── */}
        <article className="surface-card">
          <div className="card-top">
            <div>
              <span className="eyebrow">Activadores</span>
              <h3>¿Qué eventos disparan TTS?</h3>
            </div>
          </div>

          <div className="tts-triggers-list">
            <TriggerRow
              icon={MessageSquare}
              label="Comentarios del chat"
              description="Lee en voz alta los mensajes de los espectadores."
              checked={config.readComments}
              onChange={(v) => updateConfig({ readComments: v })}
              id="trigger-comments"
            />
            <TriggerRow
              icon={Gift}
              label="Regalos recibidos"
              description="Anuncia el regalo al recibirlo (prioridad máxima en cola)."
              checked={config.readGifts}
              onChange={(v) => updateConfig({ readGifts: v })}
              id="trigger-gifts"
            />
            <TriggerRow
              icon={UserPlus}
              label="Nuevos seguidores"
              description="Da la bienvenida a quien te empiece a seguir."
              checked={config.readFollows}
              onChange={(v) => updateConfig({ readFollows: v })}
              id="trigger-follows"
            />
            <TriggerRow
              icon={Heart}
              label="Ráfagas de likes"
              description="Notifica cuando el chat explota en likes."
              checked={config.readLikes}
              onChange={(v) => updateConfig({ readLikes: v })}
              id="trigger-likes"
            />
          </div>
        </article>
      </div>

      {/* ══════════════════════════════════════════════════════
          SECCIÓN: CONFIG GLOBAL + MOTOR
          ══════════════════════════════════════════════════════ */}
      <div className="tts-top-grid">

        {/* Motor */}
        <article className="surface-card tts-engine-card">
          <div className="card-top">
            <div>
              <span className="eyebrow">Motor</span>
              <h3>Engine TTS</h3>
            </div>
            <span className="tts-engine-badge">
              <Radio size={14} />
              {currentEngine?.note}
            </span>
          </div>

          <div className="tts-engine-list">
            {TTS_ENGINES.map((engine) => (
              <button
                key={engine.id}
                type="button"
                className={`tts-engine-row ${config.engineId === engine.id ? 'active' : ''}`}
                onClick={() => updateConfig({ engineId: engine.id })}
              >
                <span className="tts-engine-dot" />
                <div className="tts-engine-copy">
                  <strong>{engine.label}</strong>
                  <span>{engine.note}</span>
                </div>
                {config.engineId === engine.id && (
                  <span className="status-chip ok" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    {engine.id === 'server'
                      ? (serverTtsStatus?.preferred ? `Listo (${serverTtsStatus.preferred})` : 'Listo')
                      : engineIsAvailable
                        ? 'Listo'
                        : 'Sin key'}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="tts-apikey-section" style={{ marginTop: config.engineId === 'server' ? 0 : '12px' }}>
            <TriggerRow
              icon={Zap}
              label="TTS en acciones del live"
              description="Cuando una accion tiene salida TTS (gifts, !voz), el servidor genera el audio aunque el TTS del chat este apagado."
              checked={config.actionTtsEnabled !== false}
              onChange={(value) => updateConfig({ actionTtsEnabled: value })}
              id="tts-action-output"
            />
          </div>

          {config.engineId === 'server' && (
            <div className="tts-apikey-section">
              <label className="field-label" htmlFor="tts-server-voice">
                Voz Edge (servidor)
              </label>
              <select
                id="tts-server-voice"
                className="text-field"
                style={{ marginTop: '6px' }}
                value={config.serverVoice || 'es-ES-ElviraNeural'}
                onChange={(event) => updateConfig({ serverVoice: event.target.value })}
              >
                {(serverVoices.length ? serverVoices : [{ key: 'es-ES-ElviraNeural', label: 'Elvira (ES)' }]).map(
                  (voice) => (
                    <option key={voice.key} value={voice.key}>
                      {voice.label || voice.key}
                    </option>
                  ),
                )}
              </select>
              <p className="support-copy" style={{ marginTop: '8px' }}>
                {serverTtsStatus?.edge
                  ? 'Motor Edge TTS activo (npx edge-tts).'
                  : serverTtsStatus?.windowsSapi
                    ? 'Edge no detectado; se usará Windows SAPI como respaldo.'
                    : 'Comprueba que el backend esté en marcha (puerto 5123).'}
              </p>
            </div>
          )}

          {/* Campo API Key — solo visible cuando se selecciona ElevenLabs */}
          {config.engineId === 'elevenlabs' && (
            <div className="tts-apikey-section">
              <div className="tts-apikey-header">
                <span className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Key size={13} style={{ flexShrink: 0 }} />
                  API Key de ElevenLabs
                </span>
                {engineIsAvailable ? (
                  <span className="status-chip ok" style={{ fontSize: '0.72rem' }}>
                    <Wifi size={11} style={{ marginRight: '4px' }} />
                    Configurada
                  </span>
                ) : (
                  <span className="status-chip off" style={{ fontSize: '0.72rem' }}>
                    <WifiOff size={11} style={{ marginRight: '4px' }} />
                    Sin configurar
                  </span>
                )}
              </div>

              <div className="tts-apikey-input-wrap">
                <input
                  id="tts-el-apikey"
                  type={showApiKey ? 'text' : 'password'}
                  className="text-field"
                  placeholder="sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={config.elevenLabsApiKey || ''}
                  onChange={(e) => updateConfig({ elevenLabsApiKey: e.target.value.trim() })}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="tts-apikey-eye"
                  onClick={() => setShowApiKey((v) => !v)}
                  title={showApiKey ? 'Ocultar' : 'Mostrar'}
                >
                  {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              <p className="support-copy" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                Obtén tu API Key en{' '}
                <a
                  href="https://elevenlabs.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#7addcf', textDecoration: 'none' }}
                >
                  elevenlabs.io
                </a>{' '}
                → Profile → API Keys. Se guarda solo en tu dispositivo.
              </p>

              {/* Indicador de fallback activo */}
              {engineStatus === 'fallback' && (
                <div className="tts-api-notice" style={{ marginTop: '4px' }}>
                  <Zap size={13} />
                  <span>ElevenLabs falló — usando voz del navegador como respaldo automático</span>
                </div>
              )}
            </div>
          )}

          {/* Selector de voz del sistema (browser) */}
          {config.engineId === 'browser' && (
            <div className="tts-voice-selector-row">
              <label className="field-label" htmlFor="tts-voice-select">
                Voz base del sistema
                {systemVoices.length > 0 && (
                  <span className="tts-voice-count">{systemVoices.length} disponibles</span>
                )}
              </label>
              <div className="tts-select-wrap">
                <select
                  id="tts-voice-select"
                  className="text-field"
                  value={config.voiceName || ''}
                  onChange={(e) => updateConfig({ voiceName: e.target.value })}
                >
                  <option value="">Voz predeterminada del sistema</option>
                  {systemVoices.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="tts-select-arrow" />
              </div>
            </div>
          )}

          {!engineIsAvailable && config.engineId === 'browser' && (
            <div className="tts-api-notice tts-notice-error">
              <Zap size={14} />
              <span>speechSynthesis no disponible. Usa Chrome, Edge o la app desktop.</span>
            </div>
          )}
        </article>

        {/* Config global */}
        <article className="surface-card tts-config-card">
          <div className="card-top">
            <div>
              <span className="eyebrow">Parámetros globales</span>
              <h3>Ajustes de audio</h3>
              <p>El volumen aplica a todos los perfiles. Rate y pitch son de respaldo si no hay perfil asignado.</p>
            </div>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={() => updateConfig({ volume: 0.8, rate: 1.0, pitch: 1.0, charLimit: 120, cooldownMs: 800 })}
            >
              <RotateCcw size={14} />Reset
            </button>
          </div>

          <div className="tts-sliders-grid">
            <SliderField
              label="Volumen maestro"
              id="tts-volume"
              value={volumePct}
              onChange={(v) => updateConfig({ volume: v / 100 })}
              min={0} max={100} step={5} suffix="%"
            />
            <SliderField
              label="Velocidad (fallback)"
              id="tts-speed"
              value={config.rate}
              onChange={(v) => updateConfig({ rate: v })}
              min={0.5} max={2.0} step={0.1} suffix="x"
            />
            <SliderField
              label="Tono (fallback)"
              id="tts-pitch"
              value={config.pitch}
              onChange={(v) => updateConfig({ pitch: v })}
              min={0.5} max={2.0} step={0.1} suffix="x"
            />
          </div>

          <div className="tts-char-limit">
            <div className="tts-slider-head">
              <label className="field-label" htmlFor="tts-char-limit">
                <AlignLeft size={14} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
                Límite de caracteres
              </label>
              <span className="tts-slider-value">{config.charLimit} chars</span>
            </div>
            <input
              id="tts-char-limit"
              type="range"
              min={20} max={300} step={10}
              value={config.charLimit}
              onChange={(e) => updateConfig({ charLimit: Number(e.target.value) })}
              className="tts-range"
            />
          </div>

          <div className="tts-slider-group">
            <div className="tts-slider-head">
              <label className="field-label" htmlFor="tts-cooldown">
                <Settings2 size={14} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
                Cooldown entre mensajes
              </label>
              <span className="tts-slider-value">{config.cooldownMs}ms</span>
            </div>
            <input
              id="tts-cooldown"
              type="range"
              min={0} max={3000} step={100}
              value={config.cooldownMs}
              onChange={(e) => updateConfig({ cooldownMs: Number(e.target.value) })}
              className="tts-range"
            />
          </div>

          {/* Resumen de config en tiempo real */}
          <div className="tts-config-summary">
            <div className="tts-summary-row">
              <span className="tts-summary-label">Volumen</span>
              <div className="tts-summary-bar">
                <div className="tts-summary-fill" style={{ width: `${volumePct}%` }} />
              </div>
              <span className="tts-summary-value">{volumePct}%</span>
            </div>
            <div className="tts-summary-row">
              <span className="tts-summary-label">Cooldown</span>
              <div className="tts-summary-bar">
                <div className="tts-summary-fill" style={{ width: `${(config.cooldownMs / 3000) * 100}%` }} />
              </div>
              <span className="tts-summary-value">{config.cooldownMs}ms</span>
            </div>
            <div className="tts-summary-row">
              <span className="tts-summary-label">Estado</span>
              <span className={`status-chip ${statusChipClass}`} style={{ fontSize: '0.72rem', padding: '3px 8px', marginLeft: 'auto' }}>
                {statusLabel}
              </span>
            </div>
          </div>

          {/* Cola del live */}
          {config.enabled && queue.length > 0 && (
            <div className="tts-queue-preview">
              <span className="snippet-label">Cola del live — {queue.length} pendiente{queue.length !== 1 ? 's' : ''}</span>
              {queue.slice(0, 4).map((item, index) => {
                const profileId = config.profileAssignments?.[item.source] || ''
                const profile = TTS_PROFILES_MAP[profileId]
                return (
                  <div key={item.id} className="surface-card tts-queue-item">
                    <span className="tts-queue-index">{index + 1}</span>
                    {profile && <span style={{ fontSize: '0.8rem' }}>{profile.emoji}</span>}
                    <span className="tts-queue-text">{item.text.slice(0, 50)}{item.text.length > 50 ? '...' : ''}</span>
                    <span className="tts-queue-source" style={{ color: item.priority === 0 ? '#f9a853' : item.priority === 1 ? '#7addcf' : '#64748b' }}>
                      {item.source}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}

export default TTSSection
