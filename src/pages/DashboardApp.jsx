import DashboardWorkspaceStage from '../components/layouts/DashboardWorkspaceStage.jsx'
import DashboardModalLayer from '../components/modals/DashboardModalLayer.jsx'
import ActionTTSBridge from '../components/ActionTTSBridge.jsx'
import { useDashboardController } from '../hooks/useDashboardController'

function DashboardApp({ initialPanelSection = null }) {
  const controller = useDashboardController({ initialPanelSection })

  return (
    <>
      <ActionTTSBridge recentEvents={controller.recentEvents} />
      <DashboardWorkspaceStage controller={controller} />
      <DashboardModalLayer controller={controller} />
    </>
  )
}

export default DashboardApp
