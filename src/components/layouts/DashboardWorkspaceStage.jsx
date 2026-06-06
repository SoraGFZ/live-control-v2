import StreamingHeader from './StreamingHeader'
import WorkspaceHeader from './WorkspaceHeader'
import { DashboardAccessGate, DashboardBootScreen } from './DashboardShellBits.jsx'
import LiveOpsSection from '../sections/LiveOpsSection'
import ActionsSection from '../sections/ActionsSection'

import TTSSection from '../sections/TTSSection.jsx'
import GamesSection from '../sections/GamesSection.jsx'
import OverviewSection from '../sections/OverviewSection.jsx'
import LiveHubSection from '../sections/LiveHubSection.jsx'
import MusicSection from '../sections/MusicSection.jsx'
import { lazy, Suspense, useLayoutEffect } from 'react'
import OverlaySettingsCore from '../sections/OverlaySettingsCore.jsx'
import SectionErrorBoundary from '../common/SectionErrorBoundary.jsx'

const OverlaySection = lazy(() => import('../sections/OverlaySection.jsx'))
import BridgesSection from '../sections/BridgesSection.jsx'

import WidgetsGallerySection from '../sections/WidgetsGallerySection.jsx'
import GiftsHubSection from '../sections/GiftsHubSection.jsx'
import SoundsSection from '../sections/SoundsSection.jsx'
import ProfilesSection from '../sections/ProfilesSection.jsx'
import {
  AccountSection,
  CommunitySection,
  StorageSection,
  GoalsSection,
  SupportSection,
} from '../sections/TikControlPortedSections.jsx'

function DashboardWorkspaceStage({ controller }) {
  const {
    appState,
    backupFeedback,
    chaosModCatalog,
    clearMusicHistory,
    clearMusicQueue,
    connectSpotifyMusic,
    connectTikTok,
    copyOverlayUrl,
    copySmartBarUrl,
    copySongRequestUrl,
    copyTopGiftsUrl,
    copyTopLikesUrl,
    desktopContext,
    disconnectSpotifyMusic,
    disconnectTikTok,
    effectiveWorkspaceSection,
    exportConfigurationBackup,
    importTikTokSessionFromDesktop,
    isHydrated,
    isImportingBackup,
    isImportingTikTokSession,
    isSavingState,
    isSyncingEmoteCatalog,
    isSyncingGiftCatalog,
    isUploadingMedia,
    linkFeedback,
    localOverlayUrl,
    localSmartBarUrl,
    localSongRequestUrl,
    localTopGiftsUrl,
    localTopLikesUrl,
    overlayScreens,
    mediaLibrary,
    mediaLibraryError,
    openBackupImportPicker,
    openCreateActionModal,
    _openCreateEmoteModal,
    openCreateTriggerModal,
    openEditActionModal,
    _openEditEmoteModal,
    openEditTriggerModal,
    openOverlayWindow,
    openSmartBarWindow,
    openSongRequestWindow,
    openTopGiftsWindow,
    openTopLikesWindow,
    resetLeaderboards,
    preferredOverlayUrl,
    previewAction,
    publicOverlayUrl,
    publicSmartBarUrl,
    publicSongRequestUrl,
    _publicTopGiftsUrl,
    _publicTopLikesUrl,
    quickConnectTikTokFromHeader,
    readyOutputs,
    refreshMediaLibrary,
    refreshServerStatus,
    remoteBaseUrl,
    removeAction,
    _removeEmoteCatalogEntry,
    removeMediaFile,
    removeTrigger,
    requiresDashboardAuth,
    resetSmartBarWins,
    runGamingQuickTest,
    runMinecraftPreset,
    scrollToSection,
    sendSampleEvent,
    serverError,
    serverStatus,
    setDashboardAuthDraft,
    setTiktokUsernameDraft,
    syncSpotifyMusic,
    saveSpotifyCredentials,
    syncTikTokEmoteCatalog,
    syncTikTokGiftCatalog,
    testMinecraftChatMirror,
    testMusicPlayRequest,
    tikTokEmoteCatalog,
    tikTokGiftCatalog,
    tiktokUsernameDraft,
    unlockDashboard,
    updateMusicField,
    updateProfileField,
    updateSmartBarField,
    updateTopGiftsWidgetField,
    updateTopLikesWidgetField,
    _workspaceSections,
  } = controller

  useLayoutEffect(() => {
    document.documentElement.dataset.route = 'dashboard'
    document.body.dataset.route = 'dashboard'
  }, [effectiveWorkspaceSection])

  if (!isHydrated) {
    return <DashboardBootScreen />
  }

  if (requiresDashboardAuth) {
    return (
      <DashboardAccessGate
        dashboardAuthDraft={controller.dashboardAuthDraft}
        dashboardAuthError={controller.dashboardAuthError}
        onChangeDraft={setDashboardAuthDraft}
        onUnlock={unlockDashboard}
      />
    )
  }

  let renderedWorkspace

  if (effectiveWorkspaceSection === 'live-hub') {
    renderedWorkspace = (
      <LiveHubSection
        appState={appState}
        leaderboards={serverStatus.leaderboards}
        localOverlayUrl={localOverlayUrl}
        localSmartBarUrl={localSmartBarUrl}
        localSongRequestUrl={localSongRequestUrl}
        localTopLikesUrl={localTopLikesUrl}
        localTopGiftsUrl={localTopGiftsUrl}
        music={appState.music}
        musicStatus={serverStatus.music}
        onConnectSpotify={connectSpotifyMusic}
        onConnectTikTok={connectTikTok}
        onCopyTopGiftsUrl={copyTopGiftsUrl}
        onCopyTopLikesUrl={copyTopLikesUrl}
        onDisconnectTikTok={disconnectTikTok}
        onJump={scrollToSection}
        onOpenSongRequestWindow={openSongRequestWindow}
        onOpenTopGiftsWindow={openTopGiftsWindow}
        onOpenTopLikesWindow={openTopLikesWindow}
        onResetLeaderboards={resetLeaderboards}
        profile={appState.profile}
        recentEvents={serverStatus.recentEvents}
        serverStatus={serverStatus}
        tiktokUsernameDraft={tiktokUsernameDraft}
        setTiktokUsernameDraft={setTiktokUsernameDraft}
        updateTopGiftsWidgetField={updateTopGiftsWidgetField}
        updateTopLikesWidgetField={updateTopLikesWidgetField}
      />
    )
  } else if (effectiveWorkspaceSection === 'overview') {
    renderedWorkspace = (
    <OverviewSection
      actionCount={appState.actions.length}
      backupFeedback={backupFeedback}
      bridgePort={serverStatus.server.port}
      isDesktopApp={desktopContext.isDesktopApp}
      isImportingBackup={isImportingBackup}
      onConnectSpotify={connectSpotifyMusic}
      onConnectTikTokQuick={quickConnectTikTokFromHeader}
      onCreateAction={openCreateActionModal}
      onCreateTrigger={openCreateTriggerModal}
      onExportBackup={exportConfigurationBackup}
      onImportBackup={openBackupImportPicker}
      onJumpToSection={scrollToSection}
      onToggleOnboardingGuide={(nextValue) => updateProfileField('showOnboardingGuide', nextValue)}
      overlayUrl={preferredOverlayUrl}
      profile={appState.profile}
      readyOutputCount={readyOutputs.size}
      serverError={serverError}
      serverStatus={serverStatus}
      triggerCount={appState.triggers.length}
    />
    )
  } else if (effectiveWorkspaceSection === 'live-ops') {
    renderedWorkspace = (
      <LiveOpsSection
        emoteCatalogCount={tikTokEmoteCatalog.length}
        isDesktopApp={desktopContext.isDesktopApp}
        isImportingTikTokSession={isImportingTikTokSession}
        isSavingState={isSavingState}
        isSyncingEmoteCatalog={isSyncingEmoteCatalog}
        isSyncingGiftCatalog={isSyncingGiftCatalog}
        onConnectTikTok={connectTikTok}
        onDisconnectTikTok={disconnectTikTok}
        onImportTikTokSessionFromDesktop={importTikTokSessionFromDesktop}
        onSyncTikTokEmoteCatalog={syncTikTokEmoteCatalog}
        onSyncTikTokGiftCatalog={syncTikTokGiftCatalog}
        profile={appState.profile}
        serverError={serverError}
        serverStatus={serverStatus}
        setTiktokUsernameDraft={setTiktokUsernameDraft}
        tiktokUsernameDraft={tiktokUsernameDraft}
        updateProfileField={updateProfileField}
      />
    )
  } else if (effectiveWorkspaceSection === 'games') {
    renderedWorkspace = (
      <SectionErrorBoundary resetKey="games" sectionId="games">
        <GamesSection
          actions={appState.actions}
          chaosModCatalog={chaosModCatalog}
          chaosModSourcePath={appState.integrations?.chaosmod?.sourcePath || ''}
          localOverlayUrl={localOverlayUrl}
          onCreateAction={openCreateActionModal}
          onJump={scrollToSection}
          onPreviewAction={previewAction}
          onRunGamingCommand={runGamingQuickTest}
          onRunMinecraftPreset={runMinecraftPreset}
          onTestMinecraftChatMirror={testMinecraftChatMirror}
          profile={appState.profile}
          serverStatus={serverStatus}
          triggers={appState.triggers}
          updateProfileField={updateProfileField}
        />
      </SectionErrorBoundary>
    )
  } else if (effectiveWorkspaceSection === 'music') {
    renderedWorkspace = (
      <MusicSection
        localSongRequestUrl={localSongRequestUrl}
        music={appState.music}
        musicStatus={serverStatus.music}
        onClearHistory={clearMusicHistory}
        onClearQueue={clearMusicQueue}
        onConnectSpotify={connectSpotifyMusic}
        onCopySongRequestUrl={copySongRequestUrl}
        onDisconnectSpotify={disconnectSpotifyMusic}
        onOpenSongRequestWindow={openSongRequestWindow}
        onRemoveRequest={controller.removeMusicRequest}
        onSaveSpotifyCredentials={saveSpotifyCredentials}
        onSkipTrack={controller.skipMusicTrack}
        onSyncSpotify={syncSpotifyMusic}
        onTestPlayRequest={testMusicPlayRequest}
        publicSongRequestUrl={publicSongRequestUrl}
        updateMusicField={updateMusicField}
      />
    )
  } else if (effectiveWorkspaceSection === 'tts') {
    renderedWorkspace = (
      <TTSSection
        serverStatus={serverStatus}
        ttsConfig={appState.tts}
        onTtsConfigChange={controller.updateTtsConfig}
      />
    )
  } else if (effectiveWorkspaceSection === 'widgets-gallery') {
    renderedWorkspace = (
      <WidgetsGallerySection
        localOverlayUrl={localOverlayUrl}
        onCopyUrl={(url) => navigator.clipboard.writeText(url)}
        onJump={scrollToSection}
        onOpenOverlayWindow={openOverlayWindow}
        onOpenSmartBarWindow={openSmartBarWindow}
        onOpenSongRequestWindow={openSongRequestWindow}
        onOpenTopGiftsWindow={openTopGiftsWindow}
        onOpenTopLikesWindow={openTopLikesWindow}
        preferredOverlayUrl={preferredOverlayUrl}
        profile={appState.profile}
        serverStatus={serverStatus}
        smartBar={appState.smartBar}
        widgets={appState.widgets}
        music={appState.music}
      />
    )
  } else if (effectiveWorkspaceSection === 'sounds') {
    renderedWorkspace = <SoundsSection onJump={scrollToSection} />
  } else if (effectiveWorkspaceSection === 'gifts-hub') {
    renderedWorkspace = (
      <GiftsHubSection
        onJump={scrollToSection}
        profile={appState.profile}
        serverStatus={serverStatus}
        tikTokGiftCatalog={tikTokGiftCatalog}
        onSyncGiftCatalog={syncTikTokGiftCatalog}
      />
    )
  } else if (effectiveWorkspaceSection === 'goals') {
    renderedWorkspace = <GoalsSection onJump={scrollToSection} profile={appState.profile} />
  } else if (effectiveWorkspaceSection === 'community') {
    renderedWorkspace = (
      <CommunitySection
        onJump={scrollToSection}
        profile={appState.profile}
        serverStatus={serverStatus}
      />
    )
  } else if (effectiveWorkspaceSection === 'support') {
    renderedWorkspace = <SupportSection onJump={scrollToSection} />
  } else if (effectiveWorkspaceSection === 'account') {
    renderedWorkspace = (
      <AccountSection
        onJump={scrollToSection}
        profile={appState.profile}
        serverStatus={serverStatus}
      />
    )
  } else if (effectiveWorkspaceSection === 'storage') {
    renderedWorkspace = (
      <StorageSection
        mediaLibrary={mediaLibrary}
        onJump={scrollToSection}
        onJumpToOverlay={() => scrollToSection('overlay')}
      />
    )
  } else if (effectiveWorkspaceSection === 'profiles') {
    renderedWorkspace = (
      <ProfilesSection
        onJump={scrollToSection}
        onProfileActivated={refreshServerStatus}
      />
    )
  } else if (effectiveWorkspaceSection === 'actions') {
    renderedWorkspace = (
      <ActionsSection
        actions={appState.actions}
        triggers={appState.triggers}
        profile={appState.profile}
        localOverlayUrl={localOverlayUrl}
        overlayScreens={overlayScreens}
        emoteCatalog={tikTokEmoteCatalog}
        giftCatalog={tikTokGiftCatalog}
        addAction={controller.addAction}
        updateTrigger={controller.updateTrigger}
        onCreateAction={openCreateActionModal}
        onEditAction={openEditActionModal}
        onPreviewAction={previewAction}
        onRemoveAction={removeAction}
        onCreateTrigger={openCreateTriggerModal}
        onEditTrigger={openEditTriggerModal}
        onRemoveTrigger={removeTrigger}
        onSampleEvent={sendSampleEvent}
        onCopyOverlayUrl={copyOverlayUrl}
      />
    )
  } else if (effectiveWorkspaceSection === 'overlay') {
    renderedWorkspace = (
      <div className="workspace-overlay-shell" data-workspace-panel="overlay">
        <OverlaySettingsCore
          linkFeedback={linkFeedback}
          localOverlayUrl={localOverlayUrl}
          profile={appState.profile}
          publicOverlayUrl={publicOverlayUrl}
          updateProfileField={updateProfileField}
          onCopyOverlayUrl={copyOverlayUrl}
          onOpenOverlayWindow={openOverlayWindow}
        />

        <SectionErrorBoundary resetKey={`${effectiveWorkspaceSection}-extras`} sectionId="overlay-extras">
          <Suspense
            fallback={
              <div className="surface-card" style={{ padding: 20 }}>
                <strong>Cargando widgets y biblioteca...</strong>
                <p style={{ margin: '8px 0 0', color: '#94a3b8' }}>
                  Las opciones avanzadas del overlay apareceran en un momento.
                </p>
              </div>
            }
          >
            <OverlaySection
              isUploadingMedia={isUploadingMedia}
              leaderboards={serverStatus.leaderboards}
              linkFeedback={linkFeedback}
              localOverlayUrl={localOverlayUrl}
              localSmartBarUrl={localSmartBarUrl}
              localTopGiftsUrl={localTopGiftsUrl}
              localTopLikesUrl={localTopLikesUrl}
              mediaLibrary={mediaLibrary}
              mediaLibraryError={mediaLibraryError}
              onAdjustSmartBarWins={controller.adjustSmartBarWins}
              onCopyOverlayUrl={copyOverlayUrl}
              onCopySmartBarUrl={copySmartBarUrl}
              onCopyLiveStudioTopGiftsUrl={controller.copyLiveStudioTopGiftsUrl}
              onCopyLiveStudioTopLikesUrl={controller.copyLiveStudioTopLikesUrl}
              onCopyTopGiftsUrl={copyTopGiftsUrl}
              onCopyTopLikesUrl={copyTopLikesUrl}
              liveStudioTopGiftsUrl={controller.liveStudioTopGiftsUrl}
              liveStudioTopLikesUrl={controller.liveStudioTopLikesUrl}
              liveStudioTunnelRejected={controller.liveStudioTunnelRejected}
              onDeleteMedia={removeMediaFile}
              onOpenOverlayWindow={openOverlayWindow}
              onOpenSmartBarWindow={openSmartBarWindow}
              onOpenTopGiftsWindow={openTopGiftsWindow}
              onOpenTopLikesWindow={openTopLikesWindow}
              onRefreshMedia={refreshMediaLibrary}
              onResetLeaderboards={resetLeaderboards}
              onResetSmartBarWins={resetSmartBarWins}
              onTestTopGifts={controller.testTopGiftsWidget}
              onTestTopLikes={controller.testTopLikesWidget}
              onUploadMedia={controller.uploadMediaFile}
              profile={appState.profile}
              publicOverlayUrl={publicOverlayUrl}
              publicSmartBarUrl={publicSmartBarUrl}
              publicTopGiftsUrl={controller.publicTopGiftsUrl}
              publicTopLikesUrl={controller.publicTopLikesUrl}
              serverPort={serverStatus.server.port}
              serverStatus={serverStatus}
              smartBar={appState.widgets?.smartBar || {}}
              widgets={appState.widgets}
              updateProfileField={updateProfileField}
              updateSmartBarField={updateSmartBarField}
              updateTopGiftsWidgetField={updateTopGiftsWidgetField}
              updateTopLikesWidgetField={updateTopLikesWidgetField}
              showCorePanel={false}
            />
          </Suspense>
        </SectionErrorBoundary>
      </div>
    )
  } else if (effectiveWorkspaceSection === 'bridges') {
    renderedWorkspace = (
      <BridgesSection
        chaosModCatalog={chaosModCatalog}
        chaosModSourcePath={appState.integrations?.chaosmod?.sourcePath || ''}
        dashboardKey={appState.profile.dashboardKey}
        onJump={scrollToSection}
        remoteBaseUrl={remoteBaseUrl}
        serverStatus={serverStatus}
      />
    )
  } else {
    renderedWorkspace = (
      <OverviewSection
        actionCount={appState.actions.length}
        backupFeedback={backupFeedback}
        bridgePort={serverStatus.server.port}
        isDesktopApp={desktopContext.isDesktopApp}
        isImportingBackup={isImportingBackup}
        onConnectSpotify={connectSpotifyMusic}
        onConnectTikTokQuick={quickConnectTikTokFromHeader}
        onCreateAction={openCreateActionModal}
        onCreateTrigger={openCreateTriggerModal}
        onExportBackup={exportConfigurationBackup}
        onImportBackup={openBackupImportPicker}
        onJumpToSection={scrollToSection}
        onToggleOnboardingGuide={(nextValue) => updateProfileField('showOnboardingGuide', nextValue)}
        overlayUrl={preferredOverlayUrl}
        profile={appState.profile}
        readyOutputCount={readyOutputs.size}
        serverError={serverError}
        serverStatus={serverStatus}
        triggerCount={appState.triggers.length}
      />
    )
  }

  return (
    <div className="app-shell tc-shell">
      <StreamingHeader
        activeSection={effectiveWorkspaceSection}
        onSelectSection={scrollToSection}
        onQuickConnectTikTok={quickConnectTikTokFromHeader}
        setTiktokUsernameDraft={setTiktokUsernameDraft}
        tikTokStatus={serverStatus.tikTok}
        tiktokUsernameDraft={tiktokUsernameDraft}
      />

      <main className="main-panel">
        <WorkspaceHeader
          activeSection={effectiveWorkspaceSection}
          onCreateAction={openCreateActionModal}
          onCreateTrigger={openCreateTriggerModal}
          onSelectSection={scrollToSection}
          overlayUrl={preferredOverlayUrl}
        />

        <div
          className={`workspace-stage ${
            effectiveWorkspaceSection === 'overlay' ? 'workspace-stage-overlay' : ''
          }`}
        >
          {renderedWorkspace}
        </div>
      </main>
    </div>
  )
}

export default DashboardWorkspaceStage
