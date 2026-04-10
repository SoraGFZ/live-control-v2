import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getSpotifySessionFilePath } from './storage-paths.js'

const DEFAULT_SPOTIFY_SESSION = {
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
  scope: '',
  authState: '',
  connectedAt: null,
  accountId: '',
  accountLabel: '',
  accountProduct: '',
  devices: [],
  currentPlayback: null,
  lastSyncAt: null,
  lastError: '',
}

export class SpotifySessionStore {
  constructor(filePath = getSpotifySessionFilePath()) {
    this.filePath = filePath
    this.session = { ...DEFAULT_SPOTIFY_SESSION }
    this.writeQueue = Promise.resolve()
  }

  async load() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })

    try {
      const rawSession = await fs.readFile(this.filePath, 'utf8')
      this.session = {
        ...DEFAULT_SPOTIFY_SESSION,
        ...JSON.parse(rawSession),
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('No se pudo leer la sesion de Spotify:', error)
      }

      await this.save(this.session)
    }

    return this.getSession()
  }

  getSession() {
    return structuredClone(this.session)
  }

  async setSession(nextSession) {
    this.session = {
      ...DEFAULT_SPOTIFY_SESSION,
      ...(nextSession || {}),
    }

    await this.save(this.session)
    return this.getSession()
  }

  async clear() {
    this.session = { ...DEFAULT_SPOTIFY_SESSION }
    await this.save(this.session)
    return this.getSession()
  }

  async save(nextSession) {
    const serializedSession = JSON.stringify(nextSession, null, 2)

    this.writeQueue = this.writeQueue.then(() => fs.writeFile(this.filePath, serializedSession, 'utf8'))
    await this.writeQueue
  }
}
