import { synthesizeToFile } from './tikcontrol-tts-service.js'

function mapRateToPercent(rate) {
  const numeric = Number(rate)
  if (!Number.isFinite(numeric)) {
    return 0
  }
  return Math.round((numeric - 1) * 100)
}

function mapPitchToSemi(pitch) {
  const numeric = Number(pitch)
  if (!Number.isFinite(numeric)) {
    return 0
  }
  return Math.round((numeric - 1) * 12)
}

export function shouldSynthesizeActionOnServer(ttsConfig = {}) {
  if (ttsConfig.actionTtsEnabled === false) {
    return false
  }
  const engineId = String(ttsConfig.engineId || 'server').toLowerCase()
  return engineId === 'server' || engineId === 'edge'
}

export async function synthesizeActionTts(text, ttsConfig = {}) {
  const trimmed = String(text || '').trim().slice(0, Number(ttsConfig.charLimit || 3000))
  if (!trimmed) {
    return null
  }

  if (!shouldSynthesizeActionOnServer(ttsConfig)) {
    return { mode: 'client', text: trimmed }
  }

  try {
    const file = await synthesizeToFile({
      text: trimmed,
      voice: ttsConfig.serverVoice || 'es-ES-ElviraNeural',
      ratePct: mapRateToPercent(ttsConfig.rate),
      pitchSemi: mapPitchToSemi(ttsConfig.pitch),
      volumePct: Math.round(Math.max(0, Math.min(1, Number(ttsConfig.volume ?? 0.8))) * 100),
      baseName: 'action',
    })

    return {
      mode: 'server',
      text: trimmed,
      audioUrl: file.url,
      mimeType: file.mimeType,
      method: file.method,
      voice: file.voice,
    }
  } catch (error) {
    console.warn('[tts-action] synthesize failed:', error.message)
    return { mode: 'client', text: trimmed, error: error.message }
  }
}

export function emitActionTtsPlayback(broadcast, payload) {
  if (typeof broadcast !== 'function' || !payload?.text) {
    return
  }

  broadcast('app', { type: 'tts:play', payload })
  broadcast('overlay', { type: 'tts:play', payload })
}