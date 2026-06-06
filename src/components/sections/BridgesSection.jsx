import { useCallback, useEffect, useState } from 'react'
import { Crown, Plug, RefreshCw } from 'lucide-react'
import { buildWebSocketUrl, LOCAL_BRIDGE_DEFAULTS } from '../../live-control'
import { requestJson } from '../../dashboardShared'
import SectionHeader from '../common/SectionHeader'

const DEFAULT_CONFIG = {
  obs: { url: 'ws://127.0.0.1:4455', password: '', autoConnect: true },
  streamerbot: { url: 'ws://127.0.0.1:8080', password: '', autoConnect: true },
  streamdeck: { enabled: true, host: '127.0.0.1', port: 9091 },
}

function BridgesSection({
  chaosModCatalog,
  chaosModSourcePath,
  dashboardKey,
  onJump,
  remoteBaseUrl,
  serverStatus,
}) {
  const integrationStatus = serverStatus?.integrations || {}
  const premium = integrationStatus.premium || {}
  const obsStatus = integrationStatus.obs || {}
  const streamerbotStatus = integrationStatus.streamerbot || {}
  const streamdeckStatus = integrationStatus.streamdeck || {}

  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState('')

  const remoteMinecraftSocket = buildWebSocketUrl(remoteBaseUrl, '/ws/minecraft', dashboardKey)
  const remoteGtaSocket = buildWebSocketUrl(remoteBaseUrl, '/ws/gta', dashboardKey)
  const localMinecraftSocket = `ws://127.0.0.1:${LOCAL_BRIDGE_DEFAULTS.minecraftPort}`
  const localGtaSocket = `ws://127.0.0.1:${LOCAL_BRIDGE_DEFAULTS.gtaPort}`

  const loadConfig = useCallback(async () => {
    try {
      const payload = await requestJson('/api/integrations/config', {}, dashboardKey)
      if (payload?.ok && payload.integrations) {
        setConfig({
          obs: { ...DEFAULT_CONFIG.obs, ...(payload.integrations.obs || {}) },
          streamerbot: { ...DEFAULT_CONFIG.streamerbot, ...(payload.integrations.streamerbot || {}) },
          streamdeck: { ...DEFAULT_CONFIG.streamdeck, ...(payload.integrations.streamdeck || {}) },
        })
      }
    } catch {
      // ignore
    }
  }, [dashboardKey])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  async function saveConfig(patch) {
    const next = {
      obs: { ...config.obs, ...(patch.obs || {}) },
      streamerbot: { ...config.streamerbot, ...(patch.streamerbot || {}) },
      streamdeck: { ...config.streamdeck, ...(patch.streamdeck || {}) },
    }
    setConfig(next)

    await requestJson(
      '/api/integrations/config',
      { method: 'POST', body: JSON.stringify(patch) },
      dashboardKey,
    )
  }

  async function persistCurrentConfig() {
    await requestJson(
      '/api/integrations/config',
      { method: 'POST', body: JSON.stringify(config) },
      dashboardKey,
    )
  }

  async function runIntegration(action) {
    setBusy(action)
    setFeedback('')

    try {
      await persistCurrentConfig()

      const payload = await requestJson(
        `/api/integrations/${action}`,
        {
          method: 'POST',
          body: JSON.stringify(
            action.startsWith('obs')
              ? config.obs
              : action.startsWith('streamerbot')
                ? config.streamerbot
                : config.streamdeck,
          ),
        },
        dashboardKey,
      )
      setFeedback(payload?.error || payload?.ok === false ? payload.error : `Listo: ${action}`)
    } catch (error) {
      setFeedback(error?.message || 'Error de integracion')
    } finally {
      setBusy('')
    }
  }

  async function toggleAutoConnect(integrationId, enabled) {
    const patch =
      integrationId === 'obs'
        ? { obs: { ...config.obs, autoConnect: enabled } }
        : { streamerbot: { ...config.streamerbot, autoConnect: enabled } }

    setConfig((current) => ({
      ...current,
      ...patch,
      obs: patch.obs || current.obs,
      streamerbot: patch.streamerbot || current.streamerbot,
    }))

    await saveConfig(patch)
  }

  return (
    <section className="panel-section view-integraciones-lcs" id="bridges">
      <SectionHeader
        eyebrow="Conexiones"
        title="Integraciones del estudio"
        description="OBS, Streamer.bot, Stream Deck y bridges locales para Minecraft y GTA. Todo con el acabado premium que esperas de un estudio profesional."
      />

      <div className="tab-intro-banner integraciones-premium-banner">
        <div className="tab-intro-banner-inner">
          <span className="integraciones-premium-icon" aria-hidden="true">
            <Crown size={22} />
          </span>
          <div>
            <strong>{premium.label || 'TikControl Premium (local)'}</strong>
            <p>
              Tier <code>{premium.tier || 'founder_local'}</code> — límites{' '}
              {serverStatus?.account?.limits || 'unlimited'}. Gaming cloud, acciones Founder y widgets
              premium activos.
            </p>
          </div>
        </div>
      </div>

      {feedback ? <p className="support-copy integraciones-feedback">{feedback}</p> : null}

      <div className="integraciones-grid">
        <article className="surface-card integracion-card" data-ig="obs">
          <div className="integracion-card-head">
            <Plug size={18} />
            <h3>OBS WebSocket</h3>
            <span className={`status-chip ${obsStatus.connected ? 'ok' : 'off'}`}>
              {obsStatus.connected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          <p>Cambiar escenas y fuentes desde acciones (paridad TikControl).</p>
          <label className="field-label">URL</label>
          <input
            className="text-field"
            value={config.obs.url}
            onChange={(event) => setConfig((current) => ({ ...current, obs: { ...current.obs, url: event.target.value } }))}
          />
          <label className="field-label">Contraseña OBS</label>
          <input
            className="text-field"
            type="password"
            value={config.obs.password}
            onChange={(event) =>
              setConfig((current) => ({ ...current, obs: { ...current.obs, password: event.target.value } }))
            }
          />
          <p className="support-copy">
            Escenas detectadas: <strong>{obsStatus.sceneCount || 0}</strong>
            {obsStatus.lastError ? ` — ${obsStatus.lastError}` : ''}
          </p>
          <label className="field-label integracion-autoconnect">
            <input
              type="checkbox"
              checked={config.obs.autoConnect !== false}
              onChange={(event) => toggleAutoConnect('obs', event.target.checked)}
            />
            Conectar OBS al iniciar Live Control
          </label>
          <div className="card-actions">
            <button
              type="button"
              className="primary-button"
              disabled={busy === 'obs/connect'}
              onClick={() => runIntegration('obs/connect')}
            >
              Conectar OBS
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={busy === 'obs/disconnect'}
              onClick={() => runIntegration('obs/disconnect')}
            >
              Desconectar
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => runIntegration('obs/resources')}
            >
              <RefreshCw size={14} />
              Refrescar escenas
            </button>
          </div>
        </article>

        <article className="surface-card integracion-card" data-ig="streamerbot">
          <div className="integracion-card-head">
            <Plug size={18} />
            <h3>Streamer.bot</h3>
            <span className={`status-chip ${streamerbotStatus.connected ? 'ok' : 'off'}`}>
              {streamerbotStatus.connected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          <p>Ejecuta acciones de Streamer.bot desde gifts y eventos del live.</p>
          <label className="field-label">WebSocket URL</label>
          <input
            className="text-field"
            value={config.streamerbot.url}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                streamerbot: { ...current.streamerbot, url: event.target.value },
              }))
            }
          />
          <label className="field-label">Password (opcional)</label>
          <input
            className="text-field"
            type="password"
            value={config.streamerbot.password}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                streamerbot: { ...current.streamerbot, password: event.target.value },
              }))
            }
          />
          <p className="support-copy">
            Acciones en SB: <strong>{streamerbotStatus.actionCount || 0}</strong>
          </p>
          <label className="field-label integracion-autoconnect">
            <input
              type="checkbox"
              checked={config.streamerbot.autoConnect !== false}
              onChange={(event) => toggleAutoConnect('streamerbot', event.target.checked)}
            />
            Conectar Streamer.bot al iniciar
          </label>
          <div className="card-actions">
            <button
              type="button"
              className="primary-button"
              disabled={busy === 'streamerbot/connect'}
              onClick={() => runIntegration('streamerbot/connect')}
            >
              Conectar Streamer.bot
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => runIntegration('streamerbot/disconnect')}
            >
              Desconectar
            </button>
          </div>
        </article>

        <article className="surface-card integracion-card" data-ig="streamdeck">
          <div className="integracion-card-head">
            <Plug size={18} />
            <h3>Stream Deck</h3>
            <span className={`status-chip ${streamdeckStatus.running ? 'ok' : 'off'}`}>
              {streamdeckStatus.running ? 'Hub activo' : 'Detenido'}
            </span>
          </div>
          <p>Hub WebSocket compatible con plugins StreamDeck (puerto TikControl 9091).</p>
          <label className="field-label">Puerto</label>
          <input
            className="text-field"
            type="number"
            value={config.streamdeck.port}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                streamdeck: { ...current.streamdeck, port: Number(event.target.value) || 9091 },
              }))
            }
          />
          <p className="support-copy">
            Clientes conectados: <strong>{streamdeckStatus.clients || 0}</strong> — ws://
            {config.streamdeck.host}:{config.streamdeck.port}
          </p>
          <div className="card-actions">
            <button type="button" className="primary-button" onClick={() => runIntegration('streamdeck/start')}>
              Iniciar hub StreamDeck
            </button>
            <button type="button" className="ghost-button" onClick={() => runIntegration('streamdeck/stop')}>
              Detener
            </button>
          </div>
        </article>

        <article className="surface-card integracion-card" data-ig="minecraft">
          <div className="integracion-card-head">
            <h3>Minecraft + GTA bridge</h3>
            <span className={`status-chip ${serverStatus.bridges.minecraftRconConnected ? 'ok' : 'off'}`}>
              RCON {serverStatus.bridges.minecraftRconConnected ? 'OK' : '—'}
            </span>
          </div>
          <p>Agente local para mods y ChaosMod (misma PC del juego).</p>
          <div className="snippet-block">
            <span className="snippet-label">Comando bridge</span>
            <code>npm run bridge:start</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">Minecraft local</span>
            <code>{localMinecraftSocket}</code>
          </div>
          <div className="snippet-block">
            <span className="snippet-label">GTA local</span>
            <code>{localGtaSocket}</code>
          </div>
          <p className="support-copy">
            Remoto: MC {serverStatus.bridges.minecraftClients} · GTA {serverStatus.bridges.gtaClients} clientes.
          </p>
        </article>

        <article className="surface-card integracion-card" data-ig="gaming">
          <div className="integracion-card-head">
            <h3>Gaming cloud</h3>
            <span className="status-chip ok">Premium</span>
          </div>
          <p>
            Catálogo TikControl en vivo, descarga de mods y comandos UDP/TCP al puerto del juego cuando el mod
            lo expone.
          </p>
          <div className="card-actions">
            <button type="button" className="secondary-button" onClick={() => onJump?.('games')}>
              Abrir biblioteca gaming
            </button>
          </div>
        </article>

        <article className="surface-card integracion-card" data-ig="chaosmod">
          <div className="integracion-card-head">
            <h3>ChaosMod GTA</h3>
            <span className="status-chip ok">{chaosModCatalog.length} efectos</span>
          </div>
          {chaosModSourcePath ? (
            <div className="snippet-block">
              <span className="snippet-label">Carpeta</span>
              <code>{chaosModSourcePath}</code>
            </div>
          ) : (
            <p className="support-copy">Inicia el bridge para sincronizar el catálogo ChaosMod.</p>
          )}
        </article>
      </div>

      <details className="surface-card integraciones-advanced">
        <summary>URLs remotas del bridge (Railway / tunnel)</summary>
        <div className="snippet-block">
          <span className="snippet-label">Minecraft remoto</span>
          <code>{remoteMinecraftSocket}</code>
        </div>
        <div className="snippet-block">
          <span className="snippet-label">GTA remoto</span>
          <code>{remoteGtaSocket}</code>
        </div>
      </details>
    </section>
  )
}

export default BridgesSection