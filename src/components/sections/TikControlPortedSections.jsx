import { useCallback, useEffect, useState } from 'react'
import TikControlModuleShell from './TikControlModuleShell'
import {
  TIKCONTROL_GOALS,
  TIKCONTROL_WIDGETS,
  buildGoalOverlayUrl,
  buildTikcontrolWidgetUrl,
} from '../../config/tikcontrolWidgetsCatalog'
import GoalsConfigPanel from '../widgets/GoalsConfigPanel.jsx'
import EventLiveControls from '../widgets/EventLiveControls.jsx'
import OverlayWidgetPreviewCard from '../widgets/OverlayWidgetPreviewCard.jsx'

export { default as GiftsHubSection } from './GiftsHubSection.jsx'
export { default as SoundsSection } from './SoundsSection.jsx'
export { default as ProfilesSection } from './ProfilesSection.jsx'

export function CommunitySection({ onJump, serverStatus, profile }) {
  const overlayKey = profile?.overlayKey || ''
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const ranksWidget = TIKCONTROL_WIDGETS.find((entry) => entry.id === 'ranks')
  const topPointsWidget = TIKCONTROL_WIDGETS.find((entry) => entry.id === 'top-points')
  const ranksUrl = buildTikcontrolWidgetUrl('ranks.html', { baseUrl, overlayKey })
  const topPointsUrl = buildTikcontrolWidgetUrl('top-points.html', { baseUrl, overlayKey })

  async function copyOverlayUrl(url, label) {
    if (!url) {
      return
    }
    await navigator.clipboard.writeText(url)
  }
  const [pointsStats, setPointsStats] = useState(null)
  const [pointsUsers, setPointsUsers] = useState([])
  const [pointsError, setPointsError] = useState('')

  const loadPoints = useCallback(async () => {
    try {
      const [statsRes, loadRes] = await Promise.all([
        fetch('/api/points/stats'),
        fetch('/api/points/load'),
      ])
      const stats = await statsRes.json()
      const data = await loadRes.json()
      if (!statsRes.ok || !loadRes.ok) {
        throw new Error(stats?.error || data?.error || 'No se pudo cargar puntos')
      }
      setPointsStats(stats)
      setPointsUsers(Array.isArray(data.users) ? data.users : [])
      setPointsError('')
    } catch (error) {
      setPointsError(error?.message || 'Error de puntos')
    }
  }, [])

  useEffect(() => {
    loadPoints()
  }, [loadPoints])

  const topPoints = [...pointsUsers]
    .sort((a, b) => Number(b.points || 0) - Number(a.points || 0))
    .slice(0, 8)

  return (
    <TikControlModuleShell sectionId="community" onJump={onJump} hideIntro>
      <div className="tc-premium-hero">
        <div>
          <span className="tc-premium-badge">Comunidad y Puntos</span>
          <h3>Puntos, Rankings y Moderación</h3>
          <p>
            Sistema local de puntos inspirado en TikControl. Los viewers acumulan puntos por likes, gifts y chat.
            Usa los widgets de Ranks y Top Puntos en OBS.
          </p>
        </div>
      </div>

      <div className="tc-widgets-stats">
        <div className="metric-card">
          <span className="metric-label">Viewers con puntos</span>
          <strong>{pointsStats?.totalUsers ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Puntos totales</span>
          <strong>{pointsStats?.totalPoints ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Monedas</span>
          <strong>{pointsStats?.totalCoins ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Gifters rastreados</span>
          <strong>{serverStatus?.leaderboards?.trackedGifters ?? 0}</strong>
        </div>
      </div>

      {pointsError && <p className="form-error">{pointsError}</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="secondary-button" onClick={loadPoints}>
          Recargar datos
        </button>
        <button className="secondary-button" onClick={() => onJump('widgets-gallery')}>
          Widgets de comunidad
        </button>
      </div>

      {topPoints.length > 0 && (
        <div className="surface-card">
          <h4 style={{ marginTop: 4, marginBottom: 12 }}>Top viewers con puntos</h4>
          <div style={{ display: 'grid', gap: 4 }}>
            {topPoints.map((user, index) => (
              <div key={index} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.25)',
                borderRadius: 8,
                fontSize: '0.9rem'
              }}>
                <span><strong>#{index + 1}</strong> {user.nickname || user.uniqueId}</span>
                <strong style={{ color: '#c4b5fd' }}>{user.points || 0} pts</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tc-widget-gallery-grid tc-widget-gallery-grid--preview">
        {ranksWidget && (
          <OverlayWidgetPreviewCard
            widget={ranksWidget}
            url={ranksUrl}
            overlayKey={overlayKey}
            leaderboards={serverStatus?.leaderboards}
            onCopy={copyOverlayUrl}
            onOpen={(_w, _g, url) => window.open(url, '_blank', 'noopener,noreferrer')}
            onJump={onJump}
          />
        )}
        {topPointsWidget && (
          <OverlayWidgetPreviewCard
            widget={topPointsWidget}
            url={topPointsUrl}
            overlayKey={overlayKey}
            leaderboards={serverStatus?.leaderboards}
            onCopy={copyOverlayUrl}
            onOpen={(_w, _g, url) => window.open(url, '_blank', 'noopener,noreferrer')}
            onJump={onJump}
          />
        )}
      </div>
    </TikControlModuleShell>
  )
}

export function SupportSection({ onJump }) {
  return (
    <TikControlModuleShell sectionId="support" onJump={onJump} hideIntro>
      <div className="tc-premium-hero">
        <div>
          <span className="tc-premium-badge">Soporte y Diagnóstico</span>
          <h3>Centro de Ayuda</h3>
          <p>
            Todo lo que necesitas para diagnosticar problemas está disponible localmente. 
            Esta sección reemplaza el soporte cloud de TikControl.
          </p>
        </div>
      </div>

      <div className="surface-card" style={{ padding: '20px 22px' }}>
        <h4 style={{ marginTop: 0 }}>Ubicación de Logs</h4>
        <code style={{ 
          display: 'block', 
          background: 'rgba(0,0,0,0.4)', 
          padding: '10px 14px', 
          borderRadius: 8, 
          fontSize: '0.82rem',
          marginBottom: 16
        }}>
          %AppData%\live-control-app\runtime-logs\
        </code>

        <div style={{ display: 'grid', gap: 10 }}>
          <button className="secondary-button" onClick={() => onJump('bridges')}>
            Revisar Integraciones y Bridges
          </button>
          <button className="secondary-button" onClick={() => onJump('live-ops')}>
            Estado de TikTok Live
          </button>
          <button className="secondary-button" onClick={() => onJump('account')}>
            Información de Cuenta y Perfil
          </button>
        </div>
      </div>

      <div className="empty-state-card">
        <h4>¿Necesitas ayuda más avanzada?</h4>
        <p>
          Podemos agregar un sistema de reportes automáticos, visor de logs dentro del panel, 
          y un botón para copiar información de diagnóstico.
        </p>
      </div>
    </TikControlModuleShell>
  )
}

export function AccountSection({ onJump, profile, serverStatus }) {
  const account = serverStatus?.account || {}
  const planLabel = account.label || 'Live Control Studio — Founder'
  const username = serverStatus?.tikTok?.username || profile?.tiktokUsername || '—'
  const connected = serverStatus?.tikTok?.connected

  return (
    <TikControlModuleShell sectionId="account" onJump={onJump} hideIntro>
      <div className="tc-premium-hero">
        <div>
          <span className="tc-premium-badge">Tu Plan</span>
          <h3>{planLabel}</h3>
          <p>
            Estás usando la versión <strong>Founder Local</strong>. Todo el poder de TikControl Premium
            sin suscripción, corriendo 100% en tu máquina.
          </p>
        </div>
      </div>

      <div className="tc-widgets-stats">
        <div className="metric-card">
          <span className="metric-label">Plan actual</span>
          <strong>Founder</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Usuario TikTok</span>
          <strong>@{username}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Estado del live</span>
          <strong style={{ color: connected ? '#4ade80' : '#f87171' }}>
            {connected ? 'En vivo' : 'Desconectado'}
          </strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Perfiles locales</span>
          <strong>{serverStatus?.profiles?.profiles?.length ?? 1}</strong>
        </div>
      </div>

      <div className="surface-card">
        <h4 style={{ marginTop: 4 }}>Funciones desbloqueadas</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px 16px', marginTop: 12 }}>
          {[
            'Widgets ilimitados',
            'Acciones y triggers',
            'Sonidos + TTS avanzado',
            'Catálogo de gifts',
            'Integraciones (OBS, Streamer.bot, etc)',
            'Spotify Song Request',
            'Gaming (GTA + Minecraft)',
            'Perfiles múltiples',
            'Almacenamiento local',
            'Bridge local para juegos',
          ].map((feat, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', color: '#c7d2fe' }}>
              <span style={{ color: '#67e8f9' }}>●</span> {feat}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="primary-button" onClick={() => onJump('profiles')}>
          Gestionar Perfiles
        </button>
        <button className="secondary-button" onClick={() => onJump('bridges')}>
          Ver Integraciones
        </button>
        <button className="secondary-button" onClick={() => onJump('storage')}>
          Almacenamiento
        </button>
      </div>
    </TikControlModuleShell>
  )
}

export function StorageSection({ onJump, mediaLibrary = [], onJumpToOverlay }) {
  const items = Array.isArray(mediaLibrary) ? mediaLibrary : []
  const usedMb = Math.round(
    items.reduce((sum, item) => sum + Number(item.sizeBytes || item.size || 0), 0) / (1024 * 1024),
  )
  const usagePercent = Math.min(Math.round((usedMb / 5120) * 100), 100)

  return (
    <TikControlModuleShell sectionId="storage" onJump={onJump} hideIntro>
      <div className="tc-premium-hero">
        <div>
          <span className="tc-premium-badge">Almacenamiento Local</span>
          <h3>Biblioteca de Medios</h3>
          <p>
            Tus archivos para alertas, overlays y widgets viven localmente en tu PC. Sin límites reales de nube.
            (Simulamos el plan Premium de 5 GB de TikControl para mantener la misma experiencia).
          </p>
        </div>
      </div>

      <div className="tc-widgets-stats">
        <div className="metric-card">
          <span className="metric-label">Archivos subidos</span>
          <strong>{items.length}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Espacio usado</span>
          <strong>{usedMb} MB</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Límite simulado</span>
          <strong>5 GB</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Uso</span>
          <strong>{usagePercent}%</strong>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="surface-card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong style={{ fontSize: '0.95rem' }}>Archivos recientes</strong>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{items.length} archivos</span>
          </div>
          <div className="tc-storage-grid">
            {items.slice(0, 18).map((item) => (
              <article key={item.id || item.name} className="tc-storage-thumb" style={{ aspectRatio: '16/10' }}>
                {item.kind === 'video' ? (
                  <video src={item.url} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                  <img src={item.url} alt={item.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                )}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state-card">
          <h4>Aún no tienes medios</h4>
          <p>Sube imágenes, GIFs y videos desde el Editor de Overlays para usarlos en tus alertas.</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="primary-button" onClick={onJumpToOverlay || (() => onJump('overlay'))}>
          Abrir Editor de Medios
        </button>
        <button className="secondary-button" onClick={() => onJump('overlay')}>
          Ir al Editor de Overlays
        </button>
      </div>
    </TikControlModuleShell>
  )
}

export function GoalsSection({ onJump, profile }) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const overlayKey = profile?.overlayKey || ''

  return (
    <TikControlModuleShell sectionId="goals" onJump={onJump} hideIntro>
      <div className="tc-premium-hero">
        <div>
          <span className="tc-premium-badge">Metas del Live</span>
          <h3>Goals / Barras de Progreso</h3>
          <p>
            El sistema clásico de metas de TikControl. Likes, monedas, follows, regalos, shares y suscriptores.
            Totalmente funcional en local.
          </p>
        </div>
      </div>

      <GoalsConfigPanel />

      <div style={{ marginTop: 8 }}>
        <div className="tc-related-label" style={{ marginBottom: 10 }}>Metas disponibles</div>
        <div className="tc-widget-gallery-grid tc-widget-gallery-grid--preview">
          {TIKCONTROL_GOALS.map((goal) => {
            const url = buildGoalOverlayUrl(goal, { baseUrl, overlayKey })
            return (
              <OverlayWidgetPreviewCard
                key={goal.id}
                goal={goal}
                url={url}
                overlayKey={overlayKey}
                onCopy={async (nextUrl) => navigator.clipboard.writeText(nextUrl)}
                onOpen={(_w, _g, nextUrl) => window.open(nextUrl, '_blank', 'noopener,noreferrer')}
                onJump={onJump}
              />
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="secondary-button" onClick={() => onJump('widgets-gallery')}>
          Ver todos los widgets
        </button>
        <button className="secondary-button" onClick={() => onJump('events')}>
          Ir a Eventos
        </button>
      </div>
    </TikControlModuleShell>
  )
}