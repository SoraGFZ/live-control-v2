import { spotifyApiRequest } from './spotify.js'

export function pickSpotifyDeviceId(musicState, devices = [], playback = null) {
  const preferredId = String(musicState?.selectedDeviceId || '').trim()

  if (preferredId) {
    return preferredId
  }

  if (playback?.device?.id) {
    return playback.device.id
  }

  const activeDevice = devices.find((device) => device?.isActive)
  if (activeDevice?.id) {
    return activeDevice.id
  }

  const computerDevice = devices.find((device) => String(device?.type || '').toLowerCase() === 'computer')
  if (computerDevice?.id) {
    return computerDevice.id
  }

  return devices.find((device) => device?.id)?.id || ''
}

export async function transferSpotifyPlayback(accessToken, deviceId, { play = false } = {}) {
  if (!deviceId) {
    return
  }

  await spotifyApiRequest({
    accessToken,
    path: 'me/player',
    method: 'PUT',
    body: {
      device_ids: [deviceId],
      play: !!play,
    },
    expectedStatus: [204, 202],
  })
}

export async function startSpotifyPlayback(accessToken, deviceId, uri) {
  await spotifyApiRequest({
    accessToken,
    path: 'me/player/play',
    method: 'PUT',
    query: {
      device_id: deviceId,
    },
    body: {
      uris: [uri],
    },
    expectedStatus: [204, 202],
  })
}

export async function queueSpotifyTrack(accessToken, deviceId, uri) {
  await spotifyApiRequest({
    accessToken,
    path: 'me/player/queue',
    method: 'POST',
    query: {
      uri,
      device_id: deviceId,
    },
    expectedStatus: [204, 202],
  })
}

/**
 * Entrega una pista a Spotify: reproduce de inmediato si no hay nada sonando;
 * si ya hay reproduccion activa, la agrega a la cola de Spotify.
 */
export async function deliverSpotifyTrack(accessToken, deviceId, uri, { isPlaybackActive = false, currentDeviceId = '' } = {}) {
  if (!deviceId) {
    throw new Error(
      'No hay un dispositivo de Spotify disponible. Abre Spotify en tu PC o elige un dispositivo en Musica.',
    )
  }

  if (!uri) {
    throw new Error('La pista no tiene URI de Spotify.')
  }

  // Defensive dedup at Spotify level: if this exact uri is already the current track or in Spotify's upcoming queue,
  // don't queue it again (prevents duplicates even if app queue had races for the same track).
  try {
    const queueInfo = await spotifyApiRequest({
      accessToken,
      path: 'me/player/queue',
      expectedStatus: [200],
    })
    const currentUri = queueInfo?.currently_playing?.uri
    const upcoming = Array.isArray(queueInfo?.queue) ? queueInfo.queue : []
    const alreadyQueuedInSpotify = (currentUri && currentUri === uri) || upcoming.some((t) => t?.uri === uri)
    if (alreadyQueuedInSpotify) {
      // Still return appropriate mode so the app marks it 'sent'/'playing' without re-queuing the uri
      return isPlaybackActive ? 'queued' : 'playing'
    }
  } catch {
    // If we can't fetch the queue, proceed (better to possibly dup than fail the request)
  }

  // Only transfer if we actually need to switch devices.
  // When switching while something is playing, use play:true so the current song keeps going.
  // When nothing playing, use play:false to activate the device silently before starting our track.
  if (deviceId && deviceId !== currentDeviceId) {
    await transferSpotifyPlayback(accessToken, deviceId, { play: !!isPlaybackActive })
  }

  if (isPlaybackActive) {
    await queueSpotifyTrack(accessToken, deviceId, uri)
    return 'queued'
  }

  await startSpotifyPlayback(accessToken, deviceId, uri)
  return 'playing'
}