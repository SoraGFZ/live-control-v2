import { useEffect, useState } from 'react'
import {
  buildLeaderboardPreviewData,
  buildSmartBarMetrics,
  formatCompactNumber,
  formatDurationClock,
  getSmartBarGoalValue,
} from '../../dashboardViewHelpers'
import { LeaderboardGiftsMetric, LeaderboardLikesMetric } from './LeaderboardMetric.jsx'

function getLeaderboardInitials(value) {
  return (
    String(value || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((chunk) => chunk.charAt(0).toUpperCase())
      .join('') || '?'
  )
}

function SmartBarWidget({ smartBar, smartBarStatus, compact = false }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  const wins = Math.max(0, Number(smartBar?.currentWins || 0))
  const goal = getSmartBarGoalValue(smartBar)
  const progressPercent = goal > 0 ? Math.min(100, Math.round((wins / goal) * 100)) : 0
  const secondaryMetrics = buildSmartBarMetrics(smartBar || {}, smartBarStatus || {}, now)

  return (
    <article className={`smartbar-card ${compact ? 'compact' : ''}`}>
      <div className="smartbar-topline">
        <div className="smartbar-brand">
          <span className="smartbar-kicker">Live widget</span>
          <strong className="smartbar-title">{smartBar?.title || 'Marcador del live'}</strong>
        </div>
        <span className={`status-chip ${smartBarStatus?.connected ? 'ok' : 'off'}`}>
          {smartBarStatus?.connected ? 'LIVE' : 'Stand by'}
        </span>
      </div>

      <div className="smartbar-body">
        {smartBar?.showWins ? (
          <div className="smartbar-primary">
            <div className="smartbar-primary-head">
              <span className="smartbar-primary-token">W</span>
              <div className="smartbar-primary-copy">
                <span className="smartbar-primary-label">Victorias</span>
                <strong>
                  {wins}
                  {goal > 0 ? ` / ${goal}` : ''}
                </strong>
              </div>
            </div>

            <div className="smartbar-progress">
              <div className="smartbar-progress-bar" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        ) : null}

        <div className="smartbar-secondary">
          {secondaryMetrics.length === 0 ? (
            <div className="smartbar-metric">
              <span className="smartbar-metric-label">Panel</span>
              <strong>Activa coins, follows o tiempo para completar la barra.</strong>
            </div>
          ) : (
            secondaryMetrics.map((metric) => (
              <div key={metric.id} className="smartbar-metric">
                <span className="smartbar-metric-label">{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))
          )}
        </div>
      </div>
    </article>
  )
}

function SongRequestWidget({ music, musicStatus, preview = false }) {
  const [tick, setTick] = useState(() => Date.now())
  const [lastProgressBase, setLastProgressBase] = useState({ ms: 0, at: Date.now() })

  const queue = Array.isArray(music?.queue)
    ? music.queue
    : Array.isArray(musicStatus?.queue)
      ? musicStatus.queue
      : []
  const playback = musicStatus?.currentPlayback || null
  const currentTrack = playback?.track || null
  const maxVisible = Math.max(1, Number.parseInt(String(music?.overlayMaxVisible || '3'), 10) || 3)
  const visibleQueue = music?.overlayShowQueue
    ? queue.filter((entry) => ['queued', 'sent'].includes(entry.status)).slice(0, maxVisible)
    : []
  const title = music?.overlayTitle || 'Pedidos del chat'
  const showQueue = music?.overlayShowQueue !== false
  const showRequester = music?.overlayShowRequester !== false
  const isConnected = Boolean(musicStatus?.connected)
  const isPlaying = Boolean(playback?.isPlaying)
  const durationMs = Number(currentTrack?.durationMs || 0)
  const snapshotProgressMs = Number(playback?.progressMs || 0)

  // Reset base when we receive a fresh progress or a new track (so live calc starts from accurate server value)
  useEffect(() => {
    if (playback) {
      setLastProgressBase({
        ms: snapshotProgressMs,
        at: Date.now(),
      })
    }
  }, [snapshotProgressMs, currentTrack?.id, playback?.track?.id])

  // Live progress: use last known server progress + wall time since last update.
  // This makes the bar and times advance smoothly every second between backend polls.
  const liveProgressMs = isPlaying && durationMs > 0
    ? Math.min(durationMs, lastProgressBase.ms + Math.max(0, Date.now() - lastProgressBase.at))
    : snapshotProgressMs
  const progressPercent =
    durationMs > 0 ? Math.min(100, Math.round((liveProgressMs / durationMs) * 100)) : 0

  useEffect(() => {
    if (!isPlaying || preview) {
      return undefined
    }
    const intervalId = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [isPlaying, preview])

  void tick

  if (!preview && !currentTrack && visibleQueue.length === 0) {
    return null
  }

  const artistsLabel = Array.isArray(currentTrack?.artists)
    ? currentTrack.artists.join(' · ')
    : ''
  const accentStyle = {
    '--spotify-accent': music?.overlayAccentColor || '#1ed760',
  }

  return (
    <article
      className={`spotify-overlay ${preview ? 'spotify-overlay--compact' : ''}`}
      style={accentStyle}
    >
      <header className="spotify-overlay-header">
        <div className="spotify-overlay-brand">
          <span className="spotify-overlay-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.24 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56z" />
            </svg>
          </span>
          <div>
            <span className="spotify-overlay-eyebrow">Spotify · Song Request</span>
            <strong className="spotify-overlay-title">{title}</strong>
          </div>
        </div>
        <span className={`spotify-overlay-pill ${isConnected ? 'is-on' : ''}`}>
          {isConnected ? (isPlaying ? 'En vivo' : 'Conectado') : 'Sin sesión'}
        </span>
      </header>

      <div className={`spotify-now-playing ${currentTrack ? '' : 'is-idle'}`}>
        <div className="spotify-art-wrap">
          {currentTrack?.imageUrl ? (
            <img src={currentTrack.imageUrl} alt="" className="spotify-art" />
          ) : (
            <div className="spotify-art spotify-art--placeholder" aria-hidden="true">
              <span>♪</span>
            </div>
          )}
          {isPlaying ? <span className="spotify-art-glow" aria-hidden="true" /> : null}
        </div>

        <div className="spotify-track-meta">
          <span className="spotify-track-label">
            {currentTrack ? 'Reproduciendo ahora' : 'En espera'}
          </span>
          <strong className="spotify-track-name">
            {currentTrack?.name || (preview ? 'La cola aparece cuando conectes Spotify' : '—')}
          </strong>
          <span className="spotify-track-artists">
            {artistsLabel || (preview ? 'Tus viewers piden con !play en el chat' : 'Spotify')}
          </span>
          {currentTrack ? (
            <>
              <div className="spotify-progress">
                <div className="spotify-progress-bar" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="spotify-track-times">
                <span>{formatDurationClock(liveProgressMs)}</span>
                <span>{formatDurationClock(durationMs)}</span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {showQueue ? (
        <section className="spotify-queue">
          <div className="spotify-queue-head">
            <h3>Siguiente en cola</h3>
            <span className="spotify-queue-count">{visibleQueue.length}</span>
          </div>

          {visibleQueue.length === 0 ? (
            <p className="spotify-queue-empty">
              {preview ? 'Aquí verás los pedidos del chat.' : 'Nadie en cola por ahora.'}
            </p>
          ) : (
            <ul className="spotify-queue-list">
              {visibleQueue.map((requestItem, index) => (
                <li key={requestItem.id} className="spotify-queue-item">
                  <span className="spotify-queue-rank">{index + 1}</span>
                  {requestItem.imageUrl ? (
                    <img src={requestItem.imageUrl} alt="" className="spotify-queue-thumb" />
                  ) : (
                    <span className="spotify-queue-thumb spotify-queue-thumb--empty" aria-hidden="true" />
                  )}
                  <div className="spotify-queue-copy">
                    <strong>{requestItem.name}</strong>
                    <span>
                      {Array.isArray(requestItem.artists) ? requestItem.artists.join(' · ') : ''}
                    </span>
                    {showRequester && requestItem.requester ? (
                      <em>@{requestItem.requester}</em>
                    ) : null}
                  </div>
                  <span className="spotify-queue-time">
                    {formatDurationClock(requestItem.durationMs || 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </article>
  )
}

function resolveLeaderboardAccentStyle(accentColor, fallback) {
  const normalized = String(accentColor || '').trim()

  if (!normalized) {
    return { '--leaderboard-accent': fallback }
  }

  return { '--leaderboard-accent': normalized }
}

function TopLikesWidget({ widgets, leaderboards, preview = false }) {
  const config = widgets?.topLikes || {}
  const maxVisible = Math.max(1, Number.parseInt(String(config.maxVisible || '5'), 10) || 5)
  const liveEntries = Array.isArray(leaderboards?.topLikes) ? leaderboards.topLikes : []
  const previewSample = preview && liveEntries.length === 0 ? buildLeaderboardPreviewData('likes') : null
  const entries = previewSample?.topLikes || liveEntries
  // Ensure sorted by rank for correct display (fix for potential unsorted data from backend)
  const sortedEntries = [...entries].sort((a, b) => (a.rank || 99) - (b.rank || 99))
  const visibleEntries = sortedEntries.slice(0, maxVisible)
  const totalLikes = previewSample?.totalLikes ?? leaderboards?.totalLikes ?? 0
  const showHeartIcons = config.showHeartIcons !== false
  const showUsername = config.showUsername !== false
  const cardStyle = resolveLeaderboardAccentStyle(config.accentColor, '#ff6b9d')

  return (
    <article
      className={`leaderboard-card likes-theme ${preview ? 'compact' : ''}`}
      style={cardStyle}
    >
      <div className="leaderboard-header">
        <div>
          <span className="leaderboard-kicker">{config.kicker || 'TikTok Live'}</span>
          <strong className="leaderboard-title">{config.title || 'Top Likes'}</strong>
        </div>
        <span className="status-chip ok leaderboard-total-chip">
          {formatCompactNumber(totalLikes)} likes
        </span>
      </div>

      {visibleEntries.length === 0 ? (
        <div className="leaderboard-empty">Los likes del chat apareceran aqui en cuanto empiece el live.</div>
      ) : (
        <div className="leaderboard-list">
          {visibleEntries.map((entry) => (
            <div key={`${entry.uniqueId}-${entry.rank}`} className={`leaderboard-row rank-${entry.rank}`}>
              {config.showRank !== false ? <span className="leaderboard-rank">#{entry.rank}</span> : <span />}
              {config.showAvatar !== false && entry.avatarUrl ? (
                <img src={entry.avatarUrl} alt={entry.nickname} className="leaderboard-avatar" />
              ) : config.showAvatar !== false ? (
                <div className="leaderboard-avatar-fallback">{getLeaderboardInitials(entry.nickname)}</div>
              ) : (
                <span />
              )}
              <div className="leaderboard-copy">
                <strong>{entry.nickname || entry.uniqueId}</strong>
                {showUsername ? <span>@{entry.uniqueId}</span> : null}
              </div>
              <LeaderboardLikesMetric value={entry.totalLikes} showIcons={showHeartIcons} />
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function TopGiftsWidget({ widgets, leaderboards, preview = false }) {
  const config = widgets?.topGifts || {}
  const maxVisible = Math.max(1, Number.parseInt(String(config.maxVisible || '5'), 10) || 5)
  const liveEntries = Array.isArray(leaderboards?.topGifts) ? leaderboards.topGifts : []
  const previewSample = preview && liveEntries.length === 0 ? buildLeaderboardPreviewData('gifts') : null
  const entries = previewSample?.topGifts || liveEntries
  // Ensure sorted by rank for correct display (fix for potential unsorted data from backend)
  const sortedEntries = [...entries].sort((a, b) => (a.rank || 99) - (b.rank || 99))
  const visibleEntries = sortedEntries.slice(0, maxVisible)
  const totalCoins = previewSample?.totalCoins ?? leaderboards?.totalCoins ?? 0
  const showCoinIcons = config.showCoinIcons !== false
  const showUsername = config.showUsername !== false
  const showCoins = config.showCoins !== false
  const cardStyle = resolveLeaderboardAccentStyle(config.accentColor, '#ffc457')

  return (
    <article
      className={`leaderboard-card gifts-theme ${preview ? 'compact' : ''}`}
      style={cardStyle}
    >
      <div className="leaderboard-header">
        <div>
          <span className="leaderboard-kicker">{config.kicker || 'TikTok Live'}</span>
          <strong className="leaderboard-title">{config.title || 'Top Gifts'}</strong>
        </div>
        <span className="status-chip ok leaderboard-total-chip">
          {formatCompactNumber(totalCoins)} coins
        </span>
      </div>

      {visibleEntries.length === 0 ? (
        <div className="leaderboard-empty">Los regalos del live se mostraran aqui automaticamente.</div>
      ) : (
        <div className="leaderboard-list">
          {visibleEntries.map((entry) => (
            <div key={`${entry.uniqueId}-${entry.rank}`} className={`leaderboard-row rank-${entry.rank}`}>
              {config.showRank !== false ? <span className="leaderboard-rank">#{entry.rank}</span> : <span />}
              {config.showAvatar !== false && entry.avatarUrl ? (
                <img src={entry.avatarUrl} alt={entry.nickname} className="leaderboard-avatar" />
              ) : config.showAvatar !== false ? (
                <div className="leaderboard-avatar-fallback">{getLeaderboardInitials(entry.nickname)}</div>
              ) : (
                <span />
              )}
              <div className="leaderboard-copy">
                <strong>{entry.nickname || entry.uniqueId}</strong>
                {showUsername ? (
                  <span>
                    {entry.topGiftName ? `${entry.topGiftName} · ` : ''}@{entry.uniqueId}
                  </span>
                ) : entry.topGiftName ? (
                  <span>{entry.topGiftName}</span>
                ) : null}
              </div>
              {showCoins ? (
                <LeaderboardGiftsMetric
                  value={entry.totalCoins}
                  showCoins={false}
                  showIcons={showCoinIcons}
                />
              ) : (
                <span className="leaderboard-metric gifts-metric">
                  <strong className="leaderboard-metric-value">{entry.giftCount}</strong>
                  <span className="leaderboard-metric-suffix">gifts</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { SmartBarWidget, SongRequestWidget, TopLikesWidget, TopGiftsWidget, getLeaderboardInitials }