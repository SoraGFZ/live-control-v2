import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { getStorageDirectory } from './storage-paths.js'

function getProfilesFilePath() {
  const directory = getStorageDirectory()
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }
  return path.join(directory, 'studio-profiles.json')
}

function readStore() {
  const filePath = getProfilesFilePath()
  if (!existsSync(filePath)) {
    return { activeProfileId: 'default', profiles: [] }
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    return {
      activeProfileId: parsed.activeProfileId || 'default',
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
    }
  } catch {
    return { activeProfileId: 'default', profiles: [] }
  }
}

function writeStore(store) {
  writeFileSync(getProfilesFilePath(), JSON.stringify(store, null, 2), 'utf8')
}

function createProfileId() {
  return `prf_${randomBytes(6).toString('hex')}`
}

export function buildStateSnapshot(state = {}) {
  return {
    profile: state.profile || {},
    actions: Array.isArray(state.actions) ? state.actions : [],
    triggers: Array.isArray(state.triggers) ? state.triggers : [],
    widgets: state.widgets || {},
    goals: state.goals || {},
    music: state.music || {},
    integrations: {
      tiktok: {
        giftCatalog: state.integrations?.tiktok?.giftCatalog || [],
      },
    },
  }
}

export function createStudioProfilesStore({ getState, setState }) {
  function listProfiles() {
    const store = readStore()
    return {
      ok: true,
      activeProfileId: store.activeProfileId,
      profiles: store.profiles,
      limit: Infinity,
    }
  }

  function saveProfileFromCurrent({ name, description = '', color = '#a78bfa' } = {}) {
    const label = String(name || '').trim()
    if (!label) {
      throw new Error('El perfil necesita un nombre.')
    }

    const store = readStore()
    const state = getState()
    const profile = {
      id: createProfileId(),
      name: label,
      description: String(description || '').trim(),
      color: String(color || '#a78bfa'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      snapshot: buildStateSnapshot(state),
      counts: {
        actions: state.actions?.length || 0,
        triggers: state.triggers?.length || 0,
      },
    }

    store.profiles.unshift(profile)
    writeStore(store)

    return { ok: true, profile, ...listProfiles() }
  }

  async function activateProfile(profileId) {
    const store = readStore()
    const match = store.profiles.find((item) => item.id === profileId)

    if (!match?.snapshot) {
      throw new Error('Perfil no encontrado.')
    }

    const current = getState()
    const snapshot = match.snapshot

    const nextState = {
      ...current,
      profile: {
        ...current.profile,
        ...snapshot.profile,
        dashboardKey: current.profile?.dashboardKey || snapshot.profile?.dashboardKey || '',
        overlayKey: current.profile?.overlayKey || snapshot.profile?.overlayKey || '',
        tiktokSessionId: current.profile?.tiktokSessionId || '',
        tiktokTargetIdc: current.profile?.tiktokTargetIdc || '',
      },
      actions: snapshot.actions || [],
      triggers: snapshot.triggers || [],
      widgets: snapshot.widgets || current.widgets,
      goals: snapshot.goals || current.goals,
      music: {
        ...current.music,
        ...snapshot.music,
      },
      integrations: {
        ...current.integrations,
        tiktok: {
          ...current.integrations?.tiktok,
          giftCatalog:
            current.integrations?.tiktok?.giftCatalog?.length
              ? current.integrations.tiktok.giftCatalog
              : snapshot.integrations?.tiktok?.giftCatalog || [],
        },
      },
    }

    store.activeProfileId = profileId
    writeStore(store)
    await setState(nextState)

    return { ok: true, activeProfileId: profileId, profile: match }
  }

  function deleteProfile(profileId) {
    const store = readStore()
    store.profiles = store.profiles.filter((item) => item.id !== profileId)

    if (store.activeProfileId === profileId) {
      store.activeProfileId = store.profiles[0]?.id || 'default'
    }

    writeStore(store)
    return listProfiles()
  }

  function registerRoutes(app) {
    app.get('/api/profiles', (_request, response) => {
      response.json(listProfiles())
    })

    app.post('/api/profiles', (request, response) => {
      try {
        response.json(saveProfileFromCurrent(request.body || {}))
      } catch (error) {
        response.status(400).json({ ok: false, error: error.message })
      }
    })

    app.post('/api/profiles/:profileId/activate', async (request, response) => {
      try {
        const payload = await activateProfile(String(request.params.profileId || ''))
        response.json(payload)
      } catch (error) {
        response.status(400).json({ ok: false, error: error.message })
      }
    })

    app.delete('/api/profiles/:profileId', (request, response) => {
      response.json(deleteProfile(String(request.params.profileId || '')))
    })
  }

  return {
    registerRoutes,
    listProfiles,
    saveProfileFromCurrent,
    activateProfile,
    deleteProfile,
  }
}