import TikControlWidgetFrame from '../overlay/TikControlWidgetFrame.jsx'
import WidgetErrorBoundary from '../common/WidgetErrorBoundary.jsx'
import { SmartBarWidget, SongRequestWidget } from '../overlay/OverlayWidgets.jsx'
import { DEFAULT_SERVER_STATUS } from '../../dashboardShared.js'

function WidgetPreviewContent({
  widget,
  goal,
  overlayKey = '',
  smartBar,
  smartBarStatus,
  widgets,
  leaderboards,
  music,
  musicStatus,
}) {
  if (goal?.file) {
    return (
      <TikControlWidgetFrame
        goalFile={goal.file}
        overlayKey={overlayKey}
        className="tikcontrol-widget-frame--gallery-preview"
      />
    )
  }

  if (!widget) {
    return null
  }

  if (widget.tikcontrolFile && widget.status === 'reference') {
    return (
      <TikControlWidgetFrame
        widgetFile={widget.tikcontrolFile}
        overlayKey={overlayKey}
        className="tikcontrol-widget-frame--gallery-preview"
      />
    )
  }

  const safeSmartBarStatus = smartBarStatus || DEFAULT_SERVER_STATUS.smartBar
  const safeLeaderboards = leaderboards || DEFAULT_SERVER_STATUS.leaderboards

  switch (widget.id) {
    case 'smart-bar':
      return (
        <div className="tc-widget-preview-react">
          <WidgetErrorBoundary resetKey="preview-smartbar">
            <SmartBarWidget smartBar={smartBar} smartBarStatus={safeSmartBarStatus} compact />
          </WidgetErrorBoundary>
        </div>
      )
    case 'top-gifts':
      return (
        <TikControlWidgetFrame
          widgetFile="top-donors.html"
          overlayKey={overlayKey}
          className="tikcontrol-widget-frame--gallery-preview"
        />
      )
    case 'top-likes':
      return (
        <TikControlWidgetFrame
          widgetFile="top-likes.html"
          overlayKey={overlayKey}
          className="tikcontrol-widget-frame--gallery-preview"
        />
      )
    case 'song-request':
      return (
        <div className="tc-widget-preview-react">
          <SongRequestWidget music={music} musicStatus={musicStatus} preview />
        </div>
      )
    case 'overlay-main':
      return (
        <TikControlWidgetFrame
          widgetFile="overlay-preview.html"
          overlayKey={overlayKey}
          className="tikcontrol-widget-frame--gallery-preview"
        />
      )
    default:
      if (widget.tikcontrolFile) {
        return (
          <TikControlWidgetFrame
            widgetFile={widget.tikcontrolFile}
            overlayKey={overlayKey}
            className="tikcontrol-widget-frame--gallery-preview"
          />
        )
      }
      return (
        <div className="tc-widget-preview-placeholder">
          <span>{widget.name}</span>
          <small>Abre el editor para configurar</small>
        </div>
      )
  }
}

export default WidgetPreviewContent