import { useState } from 'react'

export function useTikTokLiveOps({
  appState,
  dashboardAccessKey,
  loadInitialState,
  updateDashboardState,
  handleProtectedRequestError,
  setServerError,
  getDesktopBridgeApi,
  requestJson,
}) {
  const [tiktokUsernameDraft, setTiktokUsernameDraft] = useState('')
  const [isImportingTikTokSession, setIsImportingTikTokSession] = useState(false)
  const [isSyncingGiftCatalog, setIsSyncingGiftCatalog] = useState(false)
  const [isSyncingEmoteCatalog, setIsSyncingEmoteCatalog] = useState(false)

  async function connectTikTok() {
    try {
      const normalizedUsername =
        tiktokUsernameDraft.trim().replace(/^@/, '') ||
        String(appState.profile.tiktokUsername || '').trim().replace(/^@/, '')

      await requestJson(
        '/api/tiktok/connect',
        {
          method: 'POST',
          body: JSON.stringify({
            username: normalizedUsername,
            sessionId: String(appState.profile.tiktokSessionId || '').trim(),
            ttTargetIdc: String(appState.profile.tiktokTargetIdc || '').trim(),
            authenticateWs: Boolean(appState.profile.tiktokAuthenticateWs),
          }),
        },
        dashboardAccessKey,
      )

      updateDashboardState((currentState) => ({
        ...currentState,
        profile: {
          ...currentState.profile,
          tiktokUsername: normalizedUsername,
        },
      }))

      setTiktokUsernameDraft(normalizedUsername)
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function disconnectTikTok() {
    try {
      await requestJson(
        '/api/tiktok/disconnect',
        {
          method: 'POST',
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    }
  }

  async function importTikTokSessionFromDesktop() {
    const desktopBridge = getDesktopBridgeApi()

    if (!desktopBridge) {
      setServerError('El login embebido de TikTok solo esta disponible dentro de la app desktop.')
      return
    }

    try {
      setIsImportingTikTokSession(true)
      setServerError('')
      await desktopBridge.startTikTokLogin({
        authenticateWs: Boolean(appState.profile.tiktokAuthenticateWs),
      })
      await loadInitialState(dashboardAccessKey, true)
    } catch (error) {
      setServerError(error?.message || 'No pude importar la sesion de TikTok desde la app desktop.')
    } finally {
      setIsImportingTikTokSession(false)
    }
  }

  async function syncTikTokGiftCatalog(options = {}) {
    try {
      setIsSyncingGiftCatalog(true)
      const syncResult = await requestJson(
        '/api/tiktok/gifts/sync',
        {
          method: 'POST',
          body: JSON.stringify({
            username: tiktokUsernameDraft.trim().replace(/^@/, ''),
            sessionId: String(appState.profile.tiktokSessionId || '').trim(),
            ttTargetIdc: String(appState.profile.tiktokTargetIdc || '').trim(),
            authenticateWs: Boolean(appState.profile.tiktokAuthenticateWs),
            region: options.region || '',
            force: options.force !== false,
          }),
        },
        dashboardAccessKey,
      )
      await requestJson(
        `/api/gifts/catalog?force=1${options.region ? `&region=${encodeURIComponent(options.region)}` : ''}`,
        {},
        dashboardAccessKey,
      ).catch(() => null)
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
      return syncResult
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
      throw error
    } finally {
      setIsSyncingGiftCatalog(false)
    }
  }

  async function syncTikTokEmoteCatalog() {
    try {
      setIsSyncingEmoteCatalog(true)
      await requestJson(
        '/api/tiktok/emotes/sync',
        {
          method: 'POST',
          body: JSON.stringify({
            username: tiktokUsernameDraft.trim().replace(/^@/, ''),
            sessionId: String(appState.profile.tiktokSessionId || '').trim(),
            ttTargetIdc: String(appState.profile.tiktokTargetIdc || '').trim(),
          }),
        },
        dashboardAccessKey,
      )
      await loadInitialState(dashboardAccessKey, true)
      setServerError('')
    } catch (error) {
      handleProtectedRequestError(error, setServerError)
    } finally {
      setIsSyncingEmoteCatalog(false)
    }
  }

  return {
    tiktokUsernameDraft,
    setTiktokUsernameDraft,
    isImportingTikTokSession,
    isSyncingGiftCatalog,
    isSyncingEmoteCatalog,
    connectTikTok,
    disconnectTikTok,
    importTikTokSessionFromDesktop,
    syncTikTokGiftCatalog,
    syncTikTokEmoteCatalog,
  }
}
