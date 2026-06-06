import { useEffect } from 'react'
import { useTTSQueue } from '../hooks/useTTSQueue'

/**
 * Mantiene la cola TTS activa en todo el panel y reproduce textos de acciones
 * (overlay-event con ttsText) aunque no estés en la pestaña TTS.
 */
export default function ActionTTSBridge({ recentEvents = [] }) {
  const { enqueueTTS, config } = useTTSQueue({ recentEvents })

  useEffect(() => {
    function onActionTts(event) {
      const text = String(event?.detail?.text || '').trim()
      const audioUrl = String(event?.detail?.audioUrl || '').trim()

      if (!text) {
        return
      }

      if (audioUrl) {
        const audio = new Audio(
          audioUrl.startsWith('http') ? audioUrl : `${window.location.origin}${audioUrl}`,
        )
        audio.volume = Math.max(0, Math.min(1, config.volume ?? 0.8))
        audio.play().catch(() => {})
        return
      }

      if (!config.enabled && !config.actionTtsEnabled) {
        return
      }

      enqueueTTS(text, 'action', 0)
    }

    window.addEventListener('live-control:action-tts', onActionTts)
    return () => window.removeEventListener('live-control:action-tts', onActionTts)
  }, [config.actionTtsEnabled, config.enabled, config.volume, enqueueTTS])

  return null
}