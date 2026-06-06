import { useLayoutEffect } from 'react'
import './App.css'
import DashboardApp from './pages/DashboardApp'
import {
  getCurrentRoute,
  isOverlayWidgetView,
  normalizeDesktopDashboardUrl,
  resolveDesktopPanelSection,
} from './dashboardViewHelpers'
import {
  OverlayScreen,
  SmartBarScreen,
  SongRequestScreen,
  TopLikesScreen,
  TopGiftsScreen,
} from './components/overlay/OverlayScreens'

function AppShell() {
  const isDesktopShell =
    typeof window !== 'undefined' && Boolean(window.liveControlDesktop) && !isOverlayWidgetView()

  useLayoutEffect(() => {
    normalizeDesktopDashboardUrl()
  }, [])

  if (isDesktopShell) {
    return <DashboardApp initialPanelSection={resolveDesktopPanelSection()} />
  }

  const route = getCurrentRoute()

  if (route.kind === 'overlay') {
    return <OverlayScreen slug={route.slug} />
  }

  if (route.kind === 'smart-bar') {
    return <SmartBarScreen slug={route.slug} />
  }

  if (route.kind === 'song-request') {
    return <SongRequestScreen slug={route.slug} />
  }

  if (route.kind === 'top-likes') {
    return <TopLikesScreen slug={route.slug} />
  }

  if (route.kind === 'top-gifts') {
    return <TopGiftsScreen slug={route.slug} />
  }

  return <DashboardApp initialPanelSection={route.panelSection || null} />
}

function App() {
  return <AppShell />
}

export default App
