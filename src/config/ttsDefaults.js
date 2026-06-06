import { DEFAULT_PROFILE_ASSIGNMENTS } from '../ttsProfiles.js'

export const DEFAULT_TTS_CONFIG = {
  enabled: false,
  volume: 0.8,
  rate: 1.0,
  pitch: 1.0,
  charLimit: 120,
  cooldownMs: 800,
  readComments: true,
  readGifts: true,
  readFollows: false,
  readLikes: false,
  skipLinks: true,
  skipBots: true,
  engineId: 'browser',
  voiceName: '',
  serverVoice: 'es-ES-ElviraNeural',
  actionTtsEnabled: true,
  profileAssignments: { ...DEFAULT_PROFILE_ASSIGNMENTS },
}

export function sanitizeTtsConfigForStorage(config = {}) {
  const next = { ...DEFAULT_TTS_CONFIG, ...config }
  delete next.elevenLabsApiKey
  return next
}