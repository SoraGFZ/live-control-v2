;(function () {
  'use strict'

  const params = new URLSearchParams(window.location.search)
  const wsPort = params.get('wsPort') || window.location.port || '5123'
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.hostname || '127.0.0.1'

  window.__tcEnv = {
    ws() {
      return `${protocol}//${host}:${wsPort}/ws/overlay`
    },
    st() {
      return window.location.origin
    },
  }
})()