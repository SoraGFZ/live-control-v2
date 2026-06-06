import { Coins, Heart } from 'lucide-react'
import { formatCompactNumber } from '../../dashboardViewHelpers'

function LeaderboardHeartStack() {
  return (
    <span className="leaderboard-icon-stack hearts" aria-hidden="true">
      <Heart className="leaderboard-heart-icon heart-1" size={14} strokeWidth={2.4} fill="currentColor" />
      <Heart className="leaderboard-heart-icon heart-2" size={11} strokeWidth={2.4} fill="currentColor" />
      <Heart className="leaderboard-heart-icon heart-3" size={9} strokeWidth={2.4} fill="currentColor" />
    </span>
  )
}

function LeaderboardCoinStack() {
  return (
    <span className="leaderboard-icon-stack coins" aria-hidden="true">
      <Coins className="leaderboard-coin-icon coin-1" size={15} strokeWidth={2.2} />
      <Coins className="leaderboard-coin-icon coin-2" size={12} strokeWidth={2.2} />
    </span>
  )
}

export function LeaderboardLikesMetric({ value, showIcons = true }) {
  return (
    <div className="leaderboard-metric likes-metric">
      <strong className="leaderboard-metric-value">{formatCompactNumber(value)}</strong>
      {showIcons ? <LeaderboardHeartStack /> : null}
    </div>
  )
}

export function LeaderboardGiftsMetric({ value, showCoins = true, showIcons = true }) {
  return (
    <div className="leaderboard-metric gifts-metric">
      <strong className="leaderboard-metric-value">{formatCompactNumber(value)}</strong>
      {showIcons ? <LeaderboardCoinStack /> : null}
      {showCoins ? <span className="leaderboard-metric-suffix">coins</span> : null}
    </div>
  )
}