;(function () {
  'use strict'

  const origin = window.location.origin || 'http://127.0.0.1:5123'
  window.__TC_LOCAL_BASE = origin

  const params = new URLSearchParams(window.location.search)
  if (!params.get('uid')) {
    params.set('uid', 'live-control')
    const nextUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState({}, '', nextUrl)
  }
})()