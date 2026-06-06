import { useState } from 'react'
import { createId } from '../live-control'

export function useAutomationWorkspace({ updateDashboardState }) {
  const [showActionModal, setShowActionModal] = useState(false)
  const [editingActionId, setEditingActionId] = useState('')
  const [showTriggerModal, setShowTriggerModal] = useState(false)
  const [editingTriggerId, setEditingTriggerId] = useState('')

  function addAction(actionDraft) {
    updateDashboardState((currentState) => ({
      ...currentState,
      actions: [{ ...actionDraft, id: createId('action') }, ...currentState.actions],
    }))
  }

  function updateAction(actionDraft) {
    updateDashboardState((currentState) => ({
      ...currentState,
      actions: currentState.actions.map((action) =>
        action.id === actionDraft.id ? { ...action, ...actionDraft } : action,
      ),
    }))
  }

  function removeAction(actionId) {
    updateDashboardState((currentState) => ({
      ...currentState,
      actions: currentState.actions.filter((action) => action.id !== actionId),
      triggers: currentState.triggers.filter((trigger) => trigger.actionId !== actionId),
    }))
  }

  function addTrigger(triggerDraft) {
    updateDashboardState((currentState) => ({
      ...currentState,
      triggers: [{ ...triggerDraft, id: createId('trigger') }, ...currentState.triggers],
    }))
  }

  function updateTrigger(triggerDraft) {
    updateDashboardState((currentState) => ({
      ...currentState,
      triggers: currentState.triggers.map((trigger) =>
        trigger.id === triggerDraft.id ? { ...trigger, ...triggerDraft } : trigger,
      ),
    }))
  }

  function removeTrigger(triggerId) {
    updateDashboardState((currentState) => ({
      ...currentState,
      triggers: currentState.triggers.filter((trigger) => trigger.id !== triggerId),
    }))
  }

  function openCreateActionModal() {
    setEditingActionId('')
    setShowActionModal(true)
  }

  function openEditActionModal(actionId) {
    setEditingActionId(actionId)
    setShowActionModal(true)
  }

  function closeActionModal() {
    setShowActionModal(false)
    setEditingActionId('')
  }

  function openCreateTriggerModal() {
    setEditingTriggerId('')
    setShowTriggerModal(true)
  }

  function openEditTriggerModal(triggerId) {
    setEditingTriggerId(triggerId)
    setShowTriggerModal(true)
  }

  function closeTriggerModal() {
    setShowTriggerModal(false)
    setEditingTriggerId('')
  }

  return {
    showActionModal,
    editingActionId,
    showTriggerModal,
    editingTriggerId,
    addAction,
    updateAction,
    removeAction,
    addTrigger,
    updateTrigger,
    removeTrigger,
    openCreateActionModal,
    openEditActionModal,
    closeActionModal,
    openCreateTriggerModal,
    openEditTriggerModal,
    closeTriggerModal,
  }
}