import { readOverlayAccessKeyFromUrl } from '../../dashboardViewHelpers'

/**
 * Embebe un widget HTML de TikControl tal cual (OBS / preview / ruta overlay).
 */
function TikControlWidgetFrame({
  widgetFile = '',
  goalFile = '',
  overlayKey: overlayKeyProp = '',
  uid = 'live-control',
  className = '',
}) {
  const overlayKey = overlayKeyProp || readOverlayAccessKeyFromUrl()
  const params = new URLSearchParams()

  params.set('uid', uid)
  if (overlayKey) {
    params.set('key', overlayKey)
  }

  if (typeof window !== 'undefined' && window.location.port) {
    params.set('wsPort', window.location.port)
  }

  const assetPath = goalFile ? `/goals/${goalFile}` : `/widgets/${widgetFile}`
  const src = `${assetPath}?${params.toString()}`

  return (
    <iframe
      title={`TikControl ${goalFile || widgetFile}`}
      className={`tikcontrol-widget-frame ${className}`.trim()}
      src={src}
      allow="autoplay"
    />
  )
}

export default TikControlWidgetFrame