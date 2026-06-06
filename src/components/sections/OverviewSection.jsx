import { 
  Play, 
  Plus, 
  Activity, 
  Zap, 
  LayoutTemplate, 
  Network, 
  Copy, 
  CheckCircle2, 
  CircleDashed, 
  AlertTriangle, 
  DownloadCloud, 
  UploadCloud, 
  Wifi, 
  WifiOff, 
  Smartphone, 
  Gamepad2, 
  DatabaseBackup, 
  MonitorPlay,
  Settings
} from 'lucide-react'

function HeroPanel({
  overlayUrl,
  onCreateAction,
  onCreateTrigger,
}) {
  return (
    <section className="hero-panel-v2" style={{ animation: 'card-enter 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards' }}>
      <div className="hero-panel-grid">
        <div className="hero-main-column">
          <div className="hero-topbar">
            <div className="hero-live-pill" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="live-dot" style={{ background: '#ef4444', boxShadow: '0 0 10px #ef4444' }} />
              <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>Centro de control</span>
            </div>

            <div className="hero-status-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <CheckCircle2 size={14} /> Todo listo
            </div>
          </div>

          <div className="hero-copy">
            <span className="hero-eyebrow" style={{ color: '#22d3ee', fontWeight: 700, letterSpacing: '0.1em' }}>
              LIVE CONTROL STUDIO
            </span>
            <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', lineHeight: 1.1, marginTop: '0.8rem', letterSpacing: '-0.02em' }}>
              El estudio para tu<br />
              <span style={{ color: 'transparent', WebkitBackgroundClip: 'text', backgroundClip: 'text', backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a78bfa 100%)' }}>
                TikTok LIVE
              </span>
            </h1>
            <p style={{ fontSize: '1.05rem', color: '#94a3b8', maxWidth: '500px', lineHeight: 1.6 }}>
              Producto listo para escalar: automatizacion, overlays interactivos, musica y
              juegos con una experiencia premium inspirada en los mejores paneles del mercado.
            </p>
          </div>

          <div className="hero-actions" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="primary-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 1.5rem', fontSize: '1rem' }} onClick={onCreateAction}>
              <Plus size={18} />
              <span>Nueva acción</span>
            </button>

            <button type="button" className="secondary-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 1.5rem', fontSize: '1rem' }} onClick={onCreateTrigger}>
              <Zap size={18} />
              <span>Nuevo evento</span>
            </button>
          </div>
        </div>

        <aside className="hero-side-column" style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '1.5rem' }}>
          <div className="hero-side-card">
            <span className="hero-side-kicker" style={{ color: '#8b5cf6', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em' }}>RESUMEN RÁPIDO</span>
            <h3 style={{ marginTop: '0.3rem', marginBottom: '1.2rem', color: '#f8fafc' }}>Flujo principal</h3>

            <div className="hero-flow-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div className="hero-flow-item" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <span className="hero-flow-index" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>1</span>
                <div>
                  <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: '0.2rem' }}>Conecta tu live</strong>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.4 }}>Enlaza TikTok y deja el panel listo para recibir eventos reales.</p>
                </div>
              </div>

              <div className="hero-flow-item" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <span className="hero-flow-index" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>2</span>
                <div>
                  <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: '0.2rem' }}>Crea acciones</strong>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.4 }}>Define respuestas, overlays, sonidos o comandos para cada caso.</p>
                </div>
              </div>

              <div className="hero-flow-item" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <span className="hero-flow-index" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>3</span>
                <div>
                  <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: '0.2rem' }}>Activa eventos</strong>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.4 }}>Conecta gifts, follows, comentarios y emotes con tus acciones.</p>
                </div>
              </div>

              <div className="hero-flow-item" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <span className="hero-flow-index" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>4</span>
                <div>
                  <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: '0.2rem' }}>Pega widgets en LIVE Studio</strong>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.4 }}>Galeria → Copiar URL → fuente Enlace. Metas y batallas PK igual.</p>
                </div>
              </div>

              <div className="hero-flow-item" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <span className="hero-flow-index" style={{ background: 'rgba(34, 211, 238, 0.1)', color: '#22d3ee', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>5</span>
                <div>
                  <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: '0.2rem' }}>Prueba en vivo</strong>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.4 }}>Simulaciones o live real: gift → accion, overlay y gaming.</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="hero-link-card hero-link-card-v2" style={{ marginTop: '1.5rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '12px', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.8rem', borderRadius: '10px', color: '#3b82f6' }}>
            <MonitorPlay size={24} />
          </div>
          <div>
            <div className="hero-link-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
              <span className="hero-link-label" style={{ fontWeight: 600, color: '#f8fafc' }}>OVERLAY PRINCIPAL</span>
              <span className="hero-link-pill" style={{ fontSize: '0.65rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '0.1rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700 }}>LISTO PARA OBS</span>
            </div>
            <div className="hero-link-box" style={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: '0.9rem' }}>
              {overlayUrl}
            </div>
          </div>
        </div>
        <button 
          className="secondary-button compact-button" 
          onClick={() => navigator.clipboard.writeText(overlayUrl)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem' }}
        >
          <Copy size={16} /> Copiar URL
        </button>
      </div>
    </section>
  )
}

function MetricRow({ actionCount, bridgePort, readyOutputCount, triggerCount }) {
  const metrics = [
    { label: 'Acciones', value: actionCount, desc: 'Biblioteca base de respuestas', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: Activity },
    { label: 'Eventos', value: triggerCount, desc: 'Reglas activas del flujo', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: Zap },
    { label: 'Salidas', value: readyOutputCount, desc: 'Overlays o juegos preparados', color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: LayoutTemplate },
    { label: 'Red / Puerto', value: bridgePort, desc: 'Backend de sesión actual', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', icon: Network }
  ]

  return (
    <section className="metric-grid-v2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginTop: '2rem' }}>
      {metrics.map((metric, index) => {
        const Icon = metric.icon
        const delay = index * 0.05
        return (
          <article 
            key={metric.label} 
            className="metric-card metric-card-v2" 
            style={{ 
              background: 'rgba(30, 41, 59, 0.4)', 
              border: '1px solid rgba(255, 255, 255, 0.05)', 
              borderRadius: '14px', 
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              opacity: 0,
              animation: 'card-enter 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
              animationDelay: `${delay}s`,
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{ position: 'absolute', top: 0, right: 0, width: '60px', height: '60px', background: metric.bg, filter: 'blur(30px)', borderRadius: '50%' }} />
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span className="metric-label" style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 500 }}>{metric.label}</span>
              <div style={{ color: metric.color, background: metric.bg, padding: '0.4rem', borderRadius: '8px', display: 'flex' }}>
                <Icon size={18} />
              </div>
            </div>
            
            <strong style={{ fontSize: '1.8rem', color: '#f8fafc', fontWeight: 700, lineHeight: 1 }}>{metric.value}</strong>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, marginTop: '0.2rem' }}>{metric.desc}</p>
          </article>
        )
      })}
    </section>
  )
}

function OverviewSection({
  actionCount,
  backupFeedback,
  bridgePort,
  isDesktopApp,
  isImportingBackup,
  _onConnectSpotify,
  onConnectTikTokQuick,
  onCreateAction,
  onCreateTrigger,
  onExportBackup,
  onImportBackup,
  onJumpToSection,
  onToggleOnboardingGuide,
  overlayUrl,
  profile,
  readyOutputCount,
  serverError,
  serverStatus,
  triggerCount,
}) {
  const diagnostics = [
    {
      label: 'TikTok LIVE',
      value: serverStatus.tikTok.connected ? 'Conectado' : serverStatus.tikTok.connecting ? 'Conectando' : 'Apagado',
      tone: serverStatus.tikTok.connected ? 'ok' : serverStatus.tikTok.connecting ? 'warn' : 'off',
      detail: serverStatus.tikTok.lastError || (serverStatus.tikTok.roomId ? `Room ${serverStatus.tikTok.roomId}` : 'Sin live enlazado'),
      icon: Smartphone
    },
    {
      label: 'Spotify',
      value: serverStatus.music.connected ? 'Conectado' : serverStatus.music.configured ? 'Listo' : 'Falta configurar',
      tone: serverStatus.music.connected ? 'ok' : serverStatus.music.configured ? 'warn' : 'off',
      detail: serverStatus.music.lastError || serverStatus.music.accountLabel || 'Song Request opcional',
      icon: Play
    },
    {
      label: 'Overlay',
      value: serverStatus.bridges.overlayClients > 0 ? 'Activo' : 'En espera',
      tone: serverStatus.bridges.overlayClients > 0 ? 'ok' : 'off',
      detail: serverStatus.bridges.overlayClients > 0 ? `${serverStatus.bridges.overlayClients} cliente(s)` : 'Abre la URL del overlay para probarlo',
      icon: MonitorPlay
    },
    {
      label: 'Minecraft',
      value: serverStatus.bridges.minecraftRconConnected ? 'RCON activo' : serverStatus.bridges.minecraftClients > 0 ? 'Bridge activo' : 'Pendiente',
      tone: serverStatus.bridges.minecraftRconConnected || serverStatus.bridges.minecraftClients > 0 ? 'ok' : 'off',
      detail: serverStatus.bridges.minecraftRconError || `Clientes: ${serverStatus.bridges.minecraftClients}`,
      icon: Gamepad2
    },
    {
      label: 'Modo app',
      value: isDesktopApp ? 'Desktop' : 'Web',
      tone: 'ok',
      detail: isDesktopApp ? 'Beta empaquetada' : 'Panel de navegador',
      icon: Settings
    },
  ]

  const exportedBackupRecently = /backup exportado/i.test(String(backupFeedback || ''))

  const setupChecklist = [
    {
      id: 'public-overlay',
      label: 'Configura el overlay público',
      complete: Boolean(serverStatus.overlayMirror?.configured),
      detail: serverStatus.overlayMirror?.configured
        ? serverStatus.overlayMirror?.targetBaseUrl || 'Overlay público listo para LIVE Studio.'
        : 'Completa la URL pública base y usa el main-stage en LIVE Studio.',
      actionLabel: 'Ir a Overlay',
      onAction: () => onJumpToSection('overlay'),
    },
    {
      id: 'tiktok-live',
      label: 'Conecta tu LIVE de TikTok',
      complete: Boolean(serverStatus.tikTok.connected),
      detail: serverStatus.tikTok.connected
        ? `Live enlazado${serverStatus.tikTok.roomId ? ` · Room ${serverStatus.tikTok.roomId}` : ''}`
        : 'Conecta el username del live para recibir follows, gifts, emotes y comentarios.',
      actionLabel: serverStatus.tikTok.connected ? 'Ir a TikTok' : 'Conectar live',
      onAction: () => (serverStatus.tikTok.connected ? onJumpToSection('live-ops') : onConnectTikTokQuick()),
    },
    {
      id: 'first-action',
      label: 'Crea tu primera acción',
      complete: actionCount > 0,
      detail: actionCount > 0
        ? `${actionCount} acción(es) lista(s) para reutilizar.`
        : 'Define qué debe pasar cuando se active un regalo, comentario o evento del live.',
      actionLabel: actionCount > 0 ? 'Ver acciones' : 'Nueva acción',
      onAction: () => (actionCount > 0 ? onJumpToSection('actions') : onCreateAction()),
    },
    {
      id: 'first-event',
      label: 'Conecta un evento real',
      complete: triggerCount > 0,
      detail: triggerCount > 0
        ? `${triggerCount} evento(s) listo(s) para disparar acciones.`
        : 'Crea al menos un evento de follow, gift, comentario o emote para completar el flujo.',
      actionLabel: triggerCount > 0 ? 'Ver eventos' : 'Nuevo evento',
      onAction: () => (triggerCount > 0 ? onJumpToSection('actions') : onCreateTrigger()),
    },
    {
      id: 'backup',
      label: 'Guarda un backup',
      optional: true,
      complete: exportedBackupRecently,
      detail: exportedBackupRecently
        ? 'Ya exportaste un backup reciente de esta sesión.'
        : 'Recomendado: exporta tu configuración para no perder progreso.',
      actionLabel: 'Exportar backup',
      onAction: onExportBackup,
    },
  ]

  const requiredSetupSteps = setupChecklist.filter((step) => !step.optional)
  const completedRequiredSteps = requiredSetupSteps.filter((step) => step.complete).length
  const setupProgressRatio = requiredSetupSteps.length > 0
    ? completedRequiredSteps / requiredSetupSteps.length
    : 1
  const showOnboardingGuide = profile?.showOnboardingGuide !== false

  return (
    <div className="workspace-stage-stack" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <HeroPanel
        overlayUrl={overlayUrl}
        onCreateAction={onCreateAction}
        onCreateTrigger={onCreateTrigger}
      />

      <MetricRow
        actionCount={actionCount}
        bridgePort={bridgePort}
        readyOutputCount={readyOutputCount}
        triggerCount={triggerCount}
      />

      {showOnboardingGuide ? (
        <article className="surface-card overview-card onboarding-card" style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '1.5rem', opacity: 0, animation: 'card-enter 0.5s 0.2s forwards' }}>
          <div className="card-top onboarding-head" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', color: '#f8fafc', marginBottom: '0.3rem' }}>Guía de lanzamiento (Beta)</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Te marca lo mínimo para tener todo el flujo preparado y salir en vivo.</p>
            </div>
            <div className="onboarding-head-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span className={`status-chip ${completedRequiredSteps === requiredSetupSteps.length ? 'ok' : 'warn'}`} style={{ padding: '0.4rem 0.8rem', borderRadius: '20px', background: completedRequiredSteps === requiredSetupSteps.length ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: completedRequiredSteps === requiredSetupSteps.length ? '#10b981' : '#f59e0b', fontWeight: 600, fontSize: '0.85rem' }}>
                {completedRequiredSteps}/{requiredSetupSteps.length} pasos
              </span>
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => onToggleOnboardingGuide(false)}
              >
                Ocultar guía
              </button>
            </div>
          </div>

          <div className="onboarding-progress" style={{ marginBottom: '2rem' }}>
            <div className="onboarding-progress-track" style={{ background: 'rgba(0,0,0,0.3)', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.6rem' }}>
              <div
                className="onboarding-progress-fill"
                style={{ width: `${Math.max(8, Math.round(setupProgressRatio * 100))}%`, background: completedRequiredSteps === requiredSetupSteps.length ? '#10b981' : '#3b82f6', height: '100%', transition: 'width 0.5s ease-out, background 0.5s' }}
              />
            </div>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              {completedRequiredSteps === requiredSetupSteps.length
                ? '¡Felicidades! Todo listo para la fase de pruebas o el directo.'
                : 'Completa estos pasos para evitar problemas técnicos en vivo.'}
            </span>
          </div>

          <div className="onboarding-step-list" style={{ display: 'grid', gap: '1rem' }}>
            {setupChecklist.map((step, _index) => (
              <article
                key={step.id}
                className={`onboarding-step ${step.complete ? 'complete' : ''}`}
                style={{
                  background: step.complete ? 'rgba(16, 185, 129, 0.03)' : 'rgba(15, 23, 42, 0.4)',
                  border: `1px solid ${step.complete ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)'}`,
                  borderRadius: '12px',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  transition: 'all 0.3s ease'
                }}
              >
                <div style={{ color: step.complete ? '#10b981' : step.optional ? '#64748b' : '#3b82f6', marginTop: '2px' }}>
                  {step.complete ? <CheckCircle2 size={24} /> : <CircleDashed size={24} />}
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h4 style={{ fontSize: '1.05rem', color: step.complete ? '#e2e8f0' : '#f8fafc', margin: 0, textDecoration: step.complete ? 'line-through' : 'none', opacity: step.complete ? 0.6 : 1 }}>{step.label}</h4>
                    {step.optional && !step.complete && <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#94a3b8' }}>Opcional</span>}
                  </div>
                  <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: '0.4rem 0 1rem 0' }}>{step.detail}</p>
                  
                  <button 
                    type="button" 
                    className={step.complete ? "ghost-button compact-button" : "secondary-button compact-button"} 
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} 
                    onClick={step.onAction}
                  >
                    {step.actionLabel}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>
      ) : null}

      <div className="overview-support-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        <article className="surface-card overview-card backup-card-pro" style={{ background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '16px', padding: '1.5rem', opacity: 0, animation: 'card-enter 0.5s 0.3s forwards', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'rgba(139, 92, 246, 0.1)', filter: 'blur(50px)', borderRadius: '50%' }} />
          
          <div className="card-top backup-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              <span className="section-kicker" style={{ color: '#8b5cf6', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><DatabaseBackup size={14} /> RESGUARDO</span>
              <h3 style={{ fontSize: '1.2rem', color: '#f8fafc', marginTop: '0.4rem' }}>Backup del proyecto</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '300px' }}>Guarda tu configuración antes de cambiar de build o PC.</p>
            </div>
            <span className="status-chip ok" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>Seguro</span>
          </div>

          <div className="backup-actions-pro" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <button className="primary-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, justifyContent: 'center' }} onClick={onExportBackup}>
              <DownloadCloud size={18} /> Exportar backup
            </button>
            <button className="secondary-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, justifyContent: 'center' }} onClick={onImportBackup}>
              <UploadCloud size={18} /> {isImportingBackup ? 'Importando...' : 'Importar backup'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: '#f8fafc', fontWeight: 500 }}>Incluye</span>
              <span style={{ color: '#94a3b8' }}>Acciones, eventos, catálogos locales</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: '#f8fafc', fontWeight: 500 }}>No incluye</span>
              <span style={{ color: '#94a3b8' }}>Cookies o tokens sensibles de sesión</span>
            </div>
          </div>
          {backupFeedback ? <div className="success-box" style={{ marginTop: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderLeft: '4px solid #10b981', color: '#34d399', padding: '0.8rem', borderRadius: '4px' }}>{backupFeedback}</div> : null}
        </article>

        <article className="surface-card overview-card" style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '1.5rem', opacity: 0, animation: 'card-enter 0.5s 0.4s forwards' }}>
          <div className="card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', color: '#f8fafc' }}>Diagnóstico de Sistema</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Estado en tiempo real de los puentes interconectados.</p>
            </div>
            <div style={{ background: serverError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: serverError ? '#ef4444' : '#10b981', padding: '0.5rem', borderRadius: '50%', display: 'flex' }}>
              {serverError ? <AlertTriangle size={20} /> : <Activity size={20} />}
            </div>
          </div>

          <div className="diagnostic-grid" style={{ display: 'grid', gap: '0.8rem' }}>
            {diagnostics.map((item) => {
              const IconData = item.icon
              const tagColor = item.tone === 'ok' ? '#10b981' : item.tone === 'warn' ? '#f59e0b' : '#64748b'
              const bgTagColor = item.tone === 'ok' ? 'rgba(16, 185, 129, 0.1)' : item.tone === 'warn' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.05)'
              
              return (
                <div key={item.label} className="diagnostic-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(15, 23, 42, 0.3)', padding: '0.8rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.02)' }}>
                  <div style={{ color: tagColor, background: bgTagColor, padding: '0.5rem', borderRadius: '8px', display: 'flex' }}>
                    <IconData size={16} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: '#e2e8f0', fontSize: '0.95rem' }}>{item.label}</strong>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: tagColor, textTransform: 'uppercase', background: bgTagColor, padding: '2px 8px', borderRadius: '12px' }}>{item.value}</span>
                    </div>
                    <span style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.1rem' }}>{item.detail}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {serverError ? <div className="error-box" style={{ marginTop: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid #ef4444', color: '#fca5a5', padding: '0.8rem', borderRadius: '4px' }}>{serverError}</div> : null}
        </article>
      </div>
    </div>
  )
}

export default OverviewSection