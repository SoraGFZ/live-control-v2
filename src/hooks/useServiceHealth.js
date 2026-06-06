import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeBaseUrl } from '../live-control'

/**
 * useServiceHealth Hook
 * Monitorea continuamente la salud de los servicios internos:
 * - Backend (Express server)
 * - Bridge (WebSocket bridge client)
 * - GTA V / ChaosMod (HTTP endpoint local)
 *
 * Realiza health checks periódicos y mantiene estado visual de disponibilidad.
 * Detecta reconexiones automáticas cuando servicios se recupearn.
 */
export function useServiceHealth(dashboardAccessKey = '', { pollingIntervalMs = 3000 } = {}) {
  // Estado de salud de los servicios
  const [health, setHealth] = useState({
    server: {
      online: false,
      uptime: 0,
      port: null,
      lastCheck: null,
      lastError: null,
    },
    bridge: {
      online: false,
      minecraftClientsConnected: 0,
      gtaClientsConnected: 0,
      totalClients: 0,
      warning: null,
      lastCheck: null,
      lastError: null,
    },
    gta: {
      detected: false,
      chaosmod: {
        enabled: false,
        reachable: false,
        httpEndpoint: null,
        testError: null,
      },
      bridgeConnected: false,
      warning: null,
      lastCheck: null,
      lastError: null,
    },
    // Estado agregado para conveniencia
    isHealthy: false, // true si: server online AND (bridge online OR gta detected)
    lastStatusChange: null, // timestamp cuando cambió el estado de isHealthy
  })

  // Refs para tracking
  const isMountedRef = useRef(true)
  const pollingIntervalIdRef = useRef(null)
  const previousIsHealthyRef = useRef(false)
  const baseUrlRef = useRef('')

  // Detecte cambios en dashboardAccessKey y reinicia polling
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Función para hacer request a un health endpoint
  const checkHealthEndpoint = useCallback(
    async (pathname) => {
      if (!baseUrlRef.current) {
        // Intenta determinar la URL base del backend
        try {
          const urlString = String(import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '').trim()
          if (urlString) {
            baseUrlRef.current = normalizeBaseUrl(urlString)
          } else {
            baseUrlRef.current = window.location.origin
          }
        } catch {
          baseUrlRef.current = window.location.origin
        }
      }

      const targetUrl = `${baseUrlRef.current}${pathname}`
      const searchParams = new URLSearchParams()
      if (dashboardAccessKey) {
        searchParams.set('key', dashboardAccessKey)
      }
      const urlWithQuery = searchParams.toString()
        ? `${targetUrl}?${searchParams.toString()}`
        : targetUrl

      try {
        const response = await fetch(urlWithQuery, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(dashboardAccessKey ? { 'x-live-control-key': dashboardAccessKey } : {}),
          },
          cache: 'no-store',
        })

        if (!response.ok && response.status !== 404) {
          throw new Error(`HTTP ${response.status}`)
        }

        const body = await response.json().catch(() => ({}))
        return {
          ok: true,
          data: body,
          error: null,
        }
      } catch (error) {
        return {
          ok: false,
          data: null,
          error: error?.message || 'Error desconocido',
        }
      }
    },
    [dashboardAccessKey],
  )

  // Función principal para hacer polling de toda la salud
  const performHealthCheck = useCallback(async () => {
    if (!isMountedRef.current) {
      return
    }

    const now = Date.now()
    const updates = {}

    // Verificar backend
    const serverCheck = await checkHealthEndpoint('/api/health')
    if (serverCheck.ok && serverCheck.data?.ok) {
      updates.server = {
        online: true,
        uptime: serverCheck.data.uptime || 0,
        port: serverCheck.data.server?.port || null,
        lastCheck: now,
        lastError: null,
      }
    } else {
      updates.server = {
        online: false,
        uptime: 0,
        port: null,
        lastCheck: now,
        lastError: serverCheck.error || 'No responde',
      }
    }

    // Verificar bridge
    const bridgeCheck = await checkHealthEndpoint('/api/health/bridge')
    if (bridgeCheck.ok && bridgeCheck.data?.ok) {
      updates.bridge = {
        online: bridgeCheck.data.bridge?.online || false,
        minecraftClientsConnected:
          bridgeCheck.data.bridge?.minecraftClientsConnected || 0,
        gtaClientsConnected: bridgeCheck.data.bridge?.gtaClientsConnected || 0,
        totalClients: bridgeCheck.data.bridge?.totalClients || 0,
        warning: bridgeCheck.data.bridge?.warning || null,
        lastCheck: now,
        lastError: null,
      }
    } else {
      updates.bridge = {
        online: false,
        minecraftClientsConnected: 0,
        gtaClientsConnected: 0,
        totalClients: 0,
        warning: null,
        lastCheck: now,
        lastError: bridgeCheck.error || 'No responde',
      }
    }

    // Verificar GTA
    const gtaCheck = await checkHealthEndpoint('/api/health/gta')
    if (gtaCheck.ok && gtaCheck.data?.ok) {
      updates.gta = {
        detected: gtaCheck.data.gta?.detected || false,
        chaosmod: gtaCheck.data.gta?.chaosmod || {
          enabled: false,
          reachable: false,
          httpEndpoint: null,
          testError: null,
        },
        bridgeConnected: gtaCheck.data.gta?.bridgeConnected || false,
        warning: gtaCheck.data.gta?.warning || null,
        lastCheck: now,
        lastError: null,
      }
    } else {
      updates.gta = {
        detected: false,
        chaosmod: {
          enabled: false,
          reachable: false,
          httpEndpoint: null,
          testError: null,
        },
        bridgeConnected: false,
        warning: null,
        lastCheck: now,
        lastError: gtaCheck.error || 'No responde',
      }
    }

    // Calcula isHealthy: true si server está online Y (bridge online O gta detectado)
    const nextIsHealthy = updates.server.online && (updates.bridge.online || updates.gta.detected)
    const healthChanged = previousIsHealthyRef.current !== nextIsHealthy

    updates.isHealthy = nextIsHealthy
    if (healthChanged) {
      updates.lastStatusChange = now
      previousIsHealthyRef.current = nextIsHealthy
    }

    setHealth((currentHealth) => ({
      ...currentHealth,
      ...updates,
      lastStatusChange: healthChanged ? now : currentHealth.lastStatusChange,
    }))
  }, [checkHealthEndpoint])

  // Configura polling
  useEffect(() => {
    // Realiza check inmediato al montar
    void performHealthCheck()

    // Configura polling periódico
    pollingIntervalIdRef.current = setInterval(() => {
      void performHealthCheck()
    }, pollingIntervalMs)

    return () => {
      if (pollingIntervalIdRef.current) {
        clearInterval(pollingIntervalIdRef.current)
        pollingIntervalIdRef.current = null
      }
    }
  }, [performHealthCheck, pollingIntervalMs])

  // Funciones auxiliares para consultar estado
  const isServerReady = useCallback(() => health.server.online, [health.server.online])

  const isBridgeReady = useCallback(() => health.bridge.online, [health.bridge.online])

  const isGtaReady = useCallback(
    () => health.gta.detected && health.gta.chaosmod.reachable,
    [health.gta.detected, health.gta.chaosmod.reachable],
  )

  const canTestActions = useCallback(
    () => health.isHealthy,
    [health.isHealthy],
  )

  const getTestButtonDisabledReason = useCallback(() => {
    if (!health.server.online) {
      return 'Backend no responde - reiniciando...'
    }
    if (!health.isHealthy) {
      return 'Servicios inicializándose...'
    }
    return null
  }, [health.server.online, health.isHealthy])

  return {
    health,
    isServerReady,
    isBridgeReady,
    isGtaReady,
    canTestActions,
    getTestButtonDisabledReason,
  }
}
