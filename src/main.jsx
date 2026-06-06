import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installPremiumLimits } from './config/premiumLimits.js'
import App from './App.jsx'

installPremiumLimits(typeof window !== 'undefined' ? window : globalThis)

function syncOverlayRouteDataset() {
  if (typeof window === 'undefined') {
    return
  }

  if (window.location.pathname.startsWith('/overlay/')) {
    document.documentElement.dataset.route = 'overlay'
    document.body.dataset.route = 'overlay'
  }
}

syncOverlayRouteDataset()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
