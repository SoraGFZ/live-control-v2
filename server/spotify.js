import { Buffer } from 'node:buffer'

const SPOTIFY_ACCOUNT_BASE_URL = 'https://accounts.spotify.com'
const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1'

export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state',
  'user-read-private',
]

function buildExpectedStatusSet(expectedStatus) {
  if (Array.isArray(expectedStatus)) {
    return new Set(expectedStatus)
  }

  return new Set([expectedStatus])
}

function buildBasicAuthHeader(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

export function getSpotifyAppConfig(runtimeEnv = globalThis.process?.env || {}) {
  return {
    clientId: String(runtimeEnv.SPOTIFY_CLIENT_ID || '').trim(),
    clientSecret: String(runtimeEnv.SPOTIFY_CLIENT_SECRET || '').trim(),
    redirectUri: String(runtimeEnv.SPOTIFY_REDIRECT_URI || '').trim(),
  }
}

export function isSpotifyConfigured(runtimeEnv = globalThis.process?.env || {}) {
  const config = getSpotifyAppConfig(runtimeEnv)
  return Boolean(config.clientId && config.clientSecret)
}

export function buildSpotifyAuthorizeUrl({ clientId, redirectUri, state, showDialog = true }) {
  const authorizeUrl = new URL('/authorize', SPOTIFY_ACCOUNT_BASE_URL)
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('scope', SPOTIFY_SCOPES.join(' '))
  authorizeUrl.searchParams.set('show_dialog', showDialog ? 'true' : 'false')
  return authorizeUrl.toString()
}

async function requestSpotifyToken(tokenPayload, { clientId, clientSecret }) {
  const response = await fetch(`${SPOTIFY_ACCOUNT_BASE_URL}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: buildBasicAuthHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(tokenPayload),
  })

  const responseText = await response.text()
  let parsedBody = null

  try {
    parsedBody = responseText ? JSON.parse(responseText) : null
  } catch {
    parsedBody = null
  }

  if (!response.ok) {
    const errorMessage =
      parsedBody?.error_description ||
      parsedBody?.error?.message ||
      parsedBody?.error ||
      response.statusText ||
      'Spotify rechazo la autenticacion.'
    const error = new Error(errorMessage)
    error.status = response.status
    throw error
  }

  return parsedBody
}

export async function exchangeSpotifyCode({ clientId, clientSecret, code, redirectUri }) {
  return requestSpotifyToken(
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    },
    { clientId, clientSecret },
  )
}

export async function refreshSpotifyAccessToken({
  clientId,
  clientSecret,
  refreshToken,
}) {
  return requestSpotifyToken(
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
    { clientId, clientSecret },
  )
}

export async function spotifyApiRequest({
  accessToken,
  path,
  method = 'GET',
  query = null,
  body = undefined,
  expectedStatus = 200,
}) {
  const requestUrl = new URL(path, `${SPOTIFY_API_BASE_URL}/`)

  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return
      }

      requestUrl.searchParams.set(key, String(value))
    })
  }

  const response = await fetch(requestUrl, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const expectedStatuses = buildExpectedStatusSet(expectedStatus)
  const responseText = await response.text()
  let parsedBody = null

  try {
    parsedBody = responseText ? JSON.parse(responseText) : null
  } catch {
    parsedBody = null
  }

  if (!expectedStatuses.has(response.status)) {
    const errorMessage =
      parsedBody?.error?.message ||
      parsedBody?.error_description ||
      response.statusText ||
      'Spotify devolvio un error.'
    const error = new Error(errorMessage)
    error.status = response.status
    error.responseBody = parsedBody
    throw error
  }

  return parsedBody
}
