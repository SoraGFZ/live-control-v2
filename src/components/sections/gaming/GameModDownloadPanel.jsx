import { useCallback, useEffect, useState } from 'react'
import { Download, FolderOpen, CheckCircle2, Package, Loader2 } from 'lucide-react'

function GameModDownloadPanel({ game }) {
  const [installStatus, setInstallStatus] = useState({ installed: false, loading: true })
  const [downloadState, setDownloadState] = useState({ busy: false, message: '' })

  const modPath = game?.cloud?.modPath
  const hasDownload = Boolean(modPath)
  const isJar = String(modPath || '').toLowerCase().endsWith('.jar')

  const refreshStatus = useCallback(async () => {
    if (!game?.id) {
      return
    }

    setInstallStatus((current) => ({ ...current, loading: true }))

    try {
      const response = await fetch(`/api/gaming/install-status/${encodeURIComponent(game.id)}`)
      const payload = await response.json()
      setInstallStatus({
        loading: false,
        installed: Boolean(payload.installed),
        installPath: payload.installPath || '',
        fileName: payload.fileName || '',
        version: payload.version || game?.cloud?.version || '',
        extracted: Boolean(payload.extracted),
      })
    } catch {
      setInstallStatus({ loading: false, installed: false })
    }
  }, [game?.cloud?.version, game?.id])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  async function handleDownload() {
    setDownloadState({ busy: true, message: 'Descargando desde TikControl...' })

    try {
      const response = await fetch(`/api/gaming/download/${encodeURIComponent(game.id)}`, {
        method: 'POST',
      })
      const payload = await response.json()

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'No se pudo descargar el mod')
      }

      setDownloadState({
        busy: false,
        message: isJar
          ? 'Plugin descargado. Copialo a la carpeta plugins de tu servidor Minecraft.'
          : 'Mod descargado y extraido. Revisa la carpeta de instalacion.',
      })
      await refreshStatus()
    } catch (error) {
      setDownloadState({ busy: false, message: error?.message || 'Error de descarga' })
    }
  }

  async function handleOpenFolder() {
    if (!game?.id) {
      return
    }

    if (window.liveControlDesktop?.openPath && installStatus.installPath) {
      await window.liveControlDesktop.openPath(installStatus.installPath)
      return
    }

    try {
      const response = await fetch(`/api/gaming/open-folder/${encodeURIComponent(game.id)}`, {
        method: 'POST',
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'No se pudo abrir la carpeta')
      }
      setDownloadState({
        busy: false,
        message: payload.folderPath
          ? `Carpeta abierta: ${payload.folderPath}`
          : 'Carpeta abierta en el explorador.',
      })
    } catch (error) {
      const folderPath = installStatus.installPath
      if (!folderPath) {
        setDownloadState({ busy: false, message: error?.message || 'Sin ruta de instalacion' })
        return
      }
      try {
        await navigator.clipboard.writeText(folderPath)
        setDownloadState({ busy: false, message: 'Ruta copiada al portapapeles.' })
      } catch {
        window.prompt('Carpeta del mod:', folderPath)
      }
    }
  }

  if (!hasDownload) {
    return (
      <div className="gaming-mod-panel gaming-mod-panel--info">
        <Package size={18} />
        <div>
          <strong>Sin paquete de mod</strong>
          <p>Este juego usa comandos en la nube de TikControl. Crea acciones y vincululas a triggers del live.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="gaming-mod-panel">
      <div className="gaming-mod-panel-head">
        <div>
          <strong>Paquete oficial</strong>
          <p className="row-subcopy">
            v{installStatus.version || game?.cloud?.version || '1.0.0'}
            {game?.cloud?.port ? ` · puerto ${game.cloud.port}` : ''}
          </p>
        </div>
        {installStatus.installed ? (
          <span className="gaming-mod-badge installed">
            <CheckCircle2 size={14} />
            Instalado
          </span>
        ) : (
          <span className="gaming-mod-badge pending">Pendiente</span>
        )}
      </div>

      <p className="gaming-mod-hint">
        {isJar
          ? 'Copia el .jar en la carpeta plugins/ de tu servidor Paper o Spigot y reinicia.'
          : 'Descarga, extrae en la ruta del juego y arranca el título con el mod activo antes de probar comandos.'}
      </p>

      <div className="row-actions">
        <button
          type="button"
          className="primary-button compact-button"
          disabled={downloadState.busy}
          onClick={handleDownload}
        >
          {downloadState.busy ? (
            <Loader2 size={16} className="spin-icon" />
          ) : (
            <Download size={16} />
          )}
          {installStatus.installed ? 'Actualizar descarga' : 'Descargar mod'}
        </button>

        {installStatus.installed ? (
          <button type="button" className="secondary-button compact-button" onClick={handleOpenFolder}>
            <FolderOpen size={16} />
            Abrir carpeta
          </button>
        ) : null}
      </div>

      {downloadState.message ? <p className="support-copy">{downloadState.message}</p> : null}
      {installStatus.installPath ? (
        <code className="dense-code gaming-mod-path">{installStatus.installPath}</code>
      ) : null}
    </div>
  )
}

export default GameModDownloadPanel