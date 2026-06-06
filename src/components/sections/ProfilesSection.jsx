import { useCallback, useEffect, useState } from 'react'
import { Check, Plus, Sparkles, Trash2, Zap } from 'lucide-react'
import TikControlModuleShell from './TikControlModuleShell'

const PROFILE_COLORS = ['#a78bfa', '#c084fc', '#8b5cf6', '#e879f9', '#6366f1', '#22d3ee']

function ProfilesSection({ onJump, onProfileActivated }) {
  const [profiles, setProfiles] = useState([])
  const [activeProfileId, setActiveProfileId] = useState('')
  const [newName, setNewName] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const loadProfiles = useCallback(async () => {
    try {
      const response = await fetch('/api/profiles')
      const payload = await response.json()
      setProfiles(payload.profiles || [])
      setActiveProfileId(payload.activeProfileId || '')
    } catch (error) {
      setFeedback(error.message || 'No se pudieron cargar los perfiles.')
    }
  }, [])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  async function saveCurrentProfile() {
    const name = newName.trim()
    if (!name) {
      setFeedback('Escribe un nombre para el perfil.')
      return
    }

    setIsBusy(true)
    setFeedback('')

    try {
      const color = PROFILE_COLORS[profiles.length % PROFILE_COLORS.length]
      const response = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: 'Setup guardado desde Live Control', color }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Error guardando perfil')
      }
      setProfiles(payload.profiles || [])
      setActiveProfileId(payload.activeProfileId || '')
      setNewName('')
      setFeedback(`Perfil "${name}" guardado.`)
    } catch (error) {
      setFeedback(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function activateProfile(profileId) {
    setIsBusy(true)
    setFeedback('')

    try {
      const response = await fetch(`/api/profiles/${profileId}/activate`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo activar el perfil')
      }
      setActiveProfileId(payload.activeProfileId || profileId)
      setFeedback(`Perfil activo: ${payload.profile?.name || profileId}`)
      onProfileActivated?.()
    } catch (error) {
      setFeedback(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function removeProfile(profileId) {
    setIsBusy(true)
    try {
      const response = await fetch(`/api/profiles/${profileId}`, { method: 'DELETE' })
      const payload = await response.json()
      setProfiles(payload.profiles || [])
      setActiveProfileId(payload.activeProfileId || '')
      setFeedback('Perfil eliminado.')
    } catch (error) {
      setFeedback(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <TikControlModuleShell sectionId="profiles" onJump={onJump}>
      <article className="tc-premium-hero">
        <span className="tc-premium-badge">
          <Sparkles size={12} />
          Perfiles ilimitados
        </span>
        <h3>Cambia de setup en un clic</h3>
        <p>
          Guarda acciones, triggers, widgets y metas por tipo de directo — igual que TikControl Premium,
          sin limite de perfiles.
        </p>
      </article>

      <article className="surface-card">
        <h3>Nuevo perfil desde el estado actual</h3>
        <div className="picker-toolbar">
          <input
            className="text-field"
            placeholder="Nombre (ej. Gaming, IRL, Batalla...)"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <button
            type="button"
            className="primary-button compact-button"
            disabled={isBusy}
            onClick={saveCurrentProfile}
          >
            <Plus size={14} />
            Guardar perfil
          </button>
        </div>
      </article>

      {feedback ? <span className="feedback-pill">{feedback}</span> : null}

      <div className="tc-profile-grid">
        {profiles.length === 0 ? (
          <article className="empty-state-card">
            <h4>Sin perfiles guardados</h4>
            <p>Configura acciones y overlays, luego guarda tu primer perfil arriba.</p>
          </article>
        ) : (
          profiles.map((profile) => (
            <div
              key={profile.id}
              className={`tc-profile-card ${activeProfileId === profile.id ? 'is-active' : ''}`}
              style={{ '--profile-accent': profile.color || '#a78bfa' }}
            >
              <div className="profile-header">
                <span className="tc-profile-dot" />
                <strong>{profile.name}</strong>
                {activeProfileId === profile.id ? (
                  <span className="status-chip ok">Activo ahora</span>
                ) : null}
              </div>
              <p className="row-subcopy">
                {profile.counts?.actions ?? 0} acciones · {profile.counts?.triggers ?? 0} triggers · {profile.counts?.widgets ?? 0} widgets
              </p>
              <div className="row-actions">
                <button
                  type="button"
                  className="primary-button compact-button"
                  disabled={isBusy || activeProfileId === profile.id}
                  onClick={() => activateProfile(profile.id)}
                >
                  {activeProfileId === profile.id ? <Check size={14} /> : <Zap size={14} />}
                  {activeProfileId === profile.id ? 'En uso' : 'Activar'}
                </button>
                <button
                  type="button"
                  className="ghost-button compact-button danger-button"
                  disabled={isBusy}
                  onClick={() => removeProfile(profile.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <button type="button" className="secondary-button" onClick={() => onJump('overview')}>
        Resguardo JSON completo
      </button>
    </TikControlModuleShell>
  )
}

export default ProfilesSection