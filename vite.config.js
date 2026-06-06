import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5123',
        changeOrigin: true,
        // Preserve all headers including auth headers
        headers: {},
        // Log proxy requests for debugging
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log(`[vite:proxy] ${req.method} ${req.url} → http://127.0.0.1:5123${req.url}`)
          })
          proxy.on('error', (err, req, res) => {
            console.error(`[vite:proxy:error] ${req.method} ${req.url}:`, err.message)
          })
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:5123',
        ws: true,
      },
      '/media': {
        target: 'http://127.0.0.1:5123',
        changeOrigin: true,
      },
      '/widgets': {
        target: 'http://127.0.0.1:5123',
        changeOrigin: true,
      },
      '/goals': {
        target: 'http://127.0.0.1:5123',
        changeOrigin: true,
      },
    },
  },
})
