import { ActionModal, EmoteCatalogModal, TriggerModal } from './DashboardModals.jsx'

function DashboardModalLayer({ controller }) {
  const {
    addAction,
    addTrigger,
    appState,
    backupImportInputRef,
    chaosModCatalog,
    closeActionModal,
    closeEmoteModal,
    closeTriggerModal,
    editingAction,
    editingEmote,
    editingTrigger,
    handleBackupImport,
    isUploadingMedia,
    knownLiveUsers,
    mediaLibrary,
    mediaLibraryError,
    saveEmoteCatalogEntry,
    showActionModal,
    showEmoteModal,
    showTriggerModal,
    tikTokEmoteCatalog,
    tikTokGiftCatalog,
    updateAction,
    updateTrigger,
    uploadMediaFile,
  } = controller

  return (
    <>
      <input
        ref={backupImportInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only-input"
        onChange={handleBackupImport}
      />

      {showActionModal ? (
        <ActionModal
          chaosModCatalog={chaosModCatalog}
          initialAction={editingAction}
          isUploadingMedia={isUploadingMedia}
          mediaLibrary={mediaLibrary}
          mediaLibraryError={mediaLibraryError}
          onClose={closeActionModal}
          onSave={(actionDraft) => {
            if (actionDraft.id) {
              updateAction(actionDraft)
            } else {
              addAction(actionDraft)
            }

            closeActionModal()
          }}
          onUploadMedia={uploadMediaFile}
        />
      ) : null}

      {showEmoteModal ? (
        <EmoteCatalogModal
          initialEmote={editingEmote}
          isUploadingMedia={isUploadingMedia}
          onClose={closeEmoteModal}
          onSave={saveEmoteCatalogEntry}
          onUploadMedia={uploadMediaFile}
        />
      ) : null}

      {showTriggerModal ? (
        <TriggerModal
          key={editingTrigger?.id || 'new-trigger'}
          actions={appState.actions}
          emoteCatalog={tikTokEmoteCatalog}
          giftCatalog={tikTokGiftCatalog}
          initialTrigger={editingTrigger}
          knownUsers={knownLiveUsers}
          onClose={closeTriggerModal}
          onSave={(triggerDraft) => {
            if (triggerDraft.id) {
              updateTrigger(triggerDraft)
            } else {
              addTrigger(triggerDraft)
            }

            closeTriggerModal()
          }}
        />
      ) : null}
    </>
  )
}

export default DashboardModalLayer
