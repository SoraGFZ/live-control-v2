const MAX_TRACKED_USERS = 800

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function upsertUserEntry(store, key, patch) {
  if (!key) {
    return
  }

  const previousEntry = store.get(key) || {
    uniqueId: patch.uniqueId || key,
    nickname: patch.nickname || patch.uniqueId || key,
    avatarUrl: '',
    totalLikes: 0,
    likeEvents: 0,
    totalCoins: 0,
    giftCount: 0,
    topGiftName: '',
    topGiftCount: 0,
    updatedAt: 0,
  }

  const nextEntry = {
    ...previousEntry,
    ...patch,
    uniqueId: patch.uniqueId || previousEntry.uniqueId,
    nickname: patch.nickname || previousEntry.nickname,
    avatarUrl: patch.avatarUrl || previousEntry.avatarUrl,
    updatedAt: Date.now(),
  }

  store.set(key, nextEntry)

  if (store.size > MAX_TRACKED_USERS) {
    const oldestKey = [...store.entries()].sort((left, right) => left[1].updatedAt - right[1].updatedAt)[0]?.[0]

    if (oldestKey) {
      store.delete(oldestKey)
    }
  }
}

function sortTopLikes(entries, limit) {
  return [...entries]
    .sort((left, right) => {
      if (right.totalLikes !== left.totalLikes) {
        return right.totalLikes - left.totalLikes
      }

      return right.updatedAt - left.updatedAt
    })
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      uniqueId: entry.uniqueId,
      nickname: entry.nickname,
      avatarUrl: entry.avatarUrl,
      totalLikes: entry.totalLikes,
      likeEvents: entry.likeEvents,
    }))
}

function sortTopGifts(entries, limit) {
  return [...entries]
    .sort((left, right) => {
      if (right.totalCoins !== left.totalCoins) {
        return right.totalCoins - left.totalCoins
      }

      if (right.giftCount !== left.giftCount) {
        return right.giftCount - left.giftCount
      }

      return right.updatedAt - left.updatedAt
    })
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      uniqueId: entry.uniqueId,
      nickname: entry.nickname,
      avatarUrl: entry.avatarUrl,
      totalCoins: entry.totalCoins,
      giftCount: entry.giftCount,
      topGiftName: entry.topGiftName,
    }))
}

export function createLeaderboardTracker() {
  const likeUsers = new Map()
  const giftUsers = new Map()
  let sessionStartedAt = null

  return {
    reset() {
      likeUsers.clear()
      giftUsers.clear()
      sessionStartedAt = Date.now()
    },

    markSessionStart() {
      sessionStartedAt = Date.now()
    },

    recordLike(event = {}) {
      const key = normalizeKey(event.uniqueId)

      if (!key) {
        return
      }

      const likeAmount = Math.max(1, Number(event.likeCount || 1))

      const previousEntry = likeUsers.get(key)
      upsertUserEntry(likeUsers, key, {
        uniqueId: event.uniqueId || key,
        nickname: event.nickname || event.uniqueId || key,
        avatarUrl: event.avatarUrl || previousEntry?.avatarUrl || '',
        totalLikes: Number(previousEntry?.totalLikes || 0) + likeAmount,
        likeEvents: Number(previousEntry?.likeEvents || 0) + 1,
      })
    },

    recordGift(event = {}, { giftCoins = 0, repeatCount = 1 } = {}) {
      const key = normalizeKey(event.uniqueId)

      if (!key) {
        return
      }

      const normalizedRepeat = Math.max(1, Number(repeatCount || 1))
      const normalizedCoins = Math.max(0, Number(giftCoins || 0))
      const coinValue = normalizedCoins * normalizedRepeat
      const giftName = String(event.giftName || event.displayText || '').trim()
      const previousEntry = giftUsers.get(key)
      const previousTopGiftCount = Number(previousEntry?.topGiftCount || 0)
      const nextTopGiftName =
        giftName && normalizedRepeat >= previousTopGiftCount ? giftName : previousEntry?.topGiftName || giftName

      upsertUserEntry(giftUsers, key, {
        uniqueId: event.uniqueId || key,
        nickname: event.nickname || event.uniqueId || key,
        avatarUrl: event.avatarUrl || previousEntry?.avatarUrl || '',
        totalCoins: Number(previousEntry?.totalCoins || 0) + coinValue,
        giftCount: Number(previousEntry?.giftCount || 0) + normalizedRepeat,
        topGiftName: nextTopGiftName,
        topGiftCount: Math.max(previousTopGiftCount, normalizedRepeat),
      })
    },

    getSnapshot({ likesLimit = 5, giftsLimit = 5 } = {}) {
      const normalizedLikesLimit = Math.max(1, Math.min(20, Number(likesLimit || 5)))
      const normalizedGiftsLimit = Math.max(1, Math.min(20, Number(giftsLimit || 5)))
      const likeEntries = [...likeUsers.values()]
      const giftEntries = [...giftUsers.values()]

      return {
        sessionStartedAt,
        totalLikes: likeEntries.reduce((sum, entry) => sum + Number(entry.totalLikes || 0), 0),
        totalCoins: giftEntries.reduce((sum, entry) => sum + Number(entry.totalCoins || 0), 0),
        trackedLikers: likeEntries.length,
        trackedGifters: giftEntries.length,
        topLikes: sortTopLikes(likeEntries, normalizedLikesLimit),
        topGifts: sortTopGifts(giftEntries, normalizedGiftsLimit),
      }
    },
  }
}