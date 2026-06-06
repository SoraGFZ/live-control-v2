const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron')
const { randomBytes } = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')
const { spawn, execSync } = require('node:child_process')

const APP_HOST = '127.0.0.1'
let APP_PORT = Number(process.env.LIVE_CONTROL_DESKTOP_PORT || 5123)
let APP_URL = `http://${APP_HOST}:${APP_PORT}`
const WINDOW_BACKGROUND = '#071018'
const PRODUCT_NAME = 'Live Control Beta'
const DESKTOP_BRIDGE_TOKEN = randomBytes(24).toString('hex')
const TIKTOK_PARTITION = 'persist:live-control-tiktok'

let mainWindow = null
let backendService = null
let bridgeService = null
let tikTokLoginWindow = null
let tikTokLoginPromise = null
let isShuttingDown = false

function isRunningAsAdministrator() {
  try {
    execSync('net session', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function ensureAdministratorPrivileges() {
  if (process.platform !== 'win32') {
    return
  }

  if (!isRunningAsAdministrator()) {
    dialog.showErrorBox(
      PRODUCT_NAME,
      'Esta aplicación necesita ejecutarse como administrador para controlar ChaosMod y el bridge local.\n\nPor favor, reinicia la aplicación como administrador.',
    )
    app.quit()
  }
}

function getUserDataPath(...segments) {
  return path.join(app.getPath('userData'), ...segments)
}

function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(null)
      } else {
        reject(err)
      }
    })

    server.once('listening', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })

    server.listen(startPort, APP_HOST)
  })
}

async function ensureAvailablePort() {
  const initialPort = Number(process.env.LIVE_CONTROL_DESKTOP_PORT || 5123)
  let port = initialPort
  const maxPort = initialPort + 20

  while (port <= maxPort) {
    const available = await findAvailablePort(port)
    if (available) {
      APP_PORT = available
      APP_URL = `http://${APP_HOST}:${APP_PORT}`
      return
    }
    port += 1
  }

  throw new Error(
    `No se pudo encontrar un puerto libre para la app desktop entre ${initialPort} y ${maxPort}.`,
  )
}

function getAppRoot() {
  // In packaged app with proper asarUnpack config, unpacked directory should exist
  const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked')
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath
  }

  // Fallback for development or misconfigured packaged app
  return path.resolve(__dirname, '..')
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.cjs')
}

function getWindowIconPath() {
  const packagedDistIconPath = path.join(getAppRoot(), 'dist', 'favicon.png')
  const sourcePublicIconPath = path.join(getAppRoot(), 'public', 'favicon.png')

  if (fs.existsSync(packagedDistIconPath)) {
    return packagedDistIconPath
  }

  if (fs.existsSync(sourcePublicIconPath)) {
    return sourcePublicIconPath
  }

  return undefined
}

function getDefaultWebPreferences(extraPreferences = {}) {
  return {
    preload: getPreloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    ...extraPreferences,
  }
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true })
}

function copyDirectoryIfMissing(sourceDirectory, targetDirectory) {
  if (!fs.existsSync(sourceDirectory) || fs.existsSync(targetDirectory)) {
    return
  }

  fs.cpSync(sourceDirectory, targetDirectory, {
    recursive: true,
    force: false,
  })
}

function seedStorageIfNeeded() {
  const targetStorageDirectory = getUserDataPath('storage')
  const targetStateFile = path.join(targetStorageDirectory, 'live-control-state.json')

  ensureDirectory(targetStorageDirectory)

  if (fs.existsSync(targetStateFile)) {
    return
  }

  copyDirectoryIfMissing(path.join(getAppRoot(), 'storage'), targetStorageDirectory)
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const fileContents = fs.readFileSync(filePath, 'utf8')

  return fileContents.split(/\r?\n/).reduce((envMap, line) => {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return envMap
    }

    const separatorIndex = trimmedLine.indexOf('=')

    if (separatorIndex === -1) {
      return envMap
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim()
    const normalizedValue =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue

    if (key) {
      envMap[key] = normalizedValue
    }

    return envMap
  }, {})
}

function getDesktopRuntimeEnv() {
  const rootEnv = readEnvFile(path.join(getAppRoot(), '.env'))
  const userEnv = readEnvFile(getUserDataPath('desktop.env'))

  return {
    ...rootEnv,
    ...userEnv,
  }
}

function getEnhancedChaosModDefaults() {
  return {
    modPath: 'C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod',
    gtaProcessName: 'GTA5_Enhanced',
  }
}

function hasEnhancedChaosModInstall() {
  const { modPath } = getEnhancedChaosModDefaults()
  return fs.existsSync(path.join(modPath, 'configs', 'effects.ini'))
}

function normalizeBridgeConfigForDesktop(nextConfig = {}) {
  const normalizedConfig = {
    ...nextConfig,
    serverBaseUrl: APP_URL,
    localDashboardBaseUrl: APP_URL,
  }

  const currentChaosMod = {
    ...(normalizedConfig.chaosmod || {}),
  }
  const enhancedDefaults = getEnhancedChaosModDefaults()
  const configuredModPath = String(currentChaosMod.modPath || '').trim()
  const configuredEffectsPath = configuredModPath
    ? path.join(configuredModPath, 'configs', 'effects.ini')
    : ''
  const shouldPromoteEnhancedInstall =
    hasEnhancedChaosModInstall()
    && (!configuredModPath || !fs.existsSync(configuredEffectsPath) || configuredModPath !== enhancedDefaults.modPath)

  if (shouldPromoteEnhancedInstall) {
    normalizedConfig.chaosmod = {
      ...currentChaosMod,
      modPath: enhancedDefaults.modPath,
      gtaProcessName: enhancedDefaults.gtaProcessName,
    }
  } else if (Object.keys(currentChaosMod).length > 0) {
    normalizedConfig.chaosmod = currentChaosMod
  }

  return normalizedConfig
}

function seedBridgeConfigIfNeeded() {
  const targetBridgeConfigPath = getUserDataPath('bridge-config.json')
  let nextConfig = {}

  if (fs.existsSync(targetBridgeConfigPath)) {
    try {
      nextConfig = readJsonFile(targetBridgeConfigPath)
    } catch {
      nextConfig = {}
    }
  } else {
    const sourceCandidates = [
      path.join(getAppRoot(), 'bridge-config.json'),
      path.join(getAppRoot(), 'bridge-config.example.json'),
    ]
    const sourcePath = sourceCandidates.find((candidate) => fs.existsSync(candidate))
    nextConfig = sourcePath ? readJsonFile(sourcePath) : {}
  }

  writeJsonFile(targetBridgeConfigPath, normalizeBridgeConfigForDesktop(nextConfig))
}

function ensureRuntimeFiles() {
  ensureDirectory(getUserDataPath('runtime-logs'))
  seedStorageIfNeeded()
  seedBridgeConfigIfNeeded()
}

function getServiceLogPaths(serviceName) {
  return {
    output: getUserDataPath('runtime-logs', `${serviceName}.log`),
    error: getUserDataPath('runtime-logs', `${serviceName}.err.log`),
  }
}

function appendLine(stream, text) {
  stream.write(`[${new Date().toISOString()}] ${text}\n`)
}

function startNodeService(serviceName, relativeScriptPath, extraEnv = {}) {
  const scriptPath = path.join(getAppRoot(), relativeScriptPath)
  const logPaths = getServiceLogPaths(serviceName)
  const outputStream = fs.createWriteStream(logPaths.output, { flags: 'a' })
  const errorStream = fs.createWriteStream(logPaths.error, { flags: 'a' })

  appendLine(outputStream, `Arrancando ${serviceName} con ${scriptPath}`)

  const child = spawn(process.execPath, [scriptPath], {
    cwd: getAppRoot(),
    env: {
      ...process.env,
      ...getDesktopRuntimeEnv(),
      ...extraEnv,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout.on('data', (chunk) => {
    outputStream.write(chunk)
  })

  child.stderr.on('data', (chunk) => {
    errorStream.write(chunk)
  })

  child.on('exit', (code, signal) => {
    appendLine(outputStream, `${serviceName} termino con code=${code ?? 'null'} signal=${signal ?? 'null'}`)

    if (!isShuttingDown && serviceName === 'backend') {
      dialog.showErrorBox(
        PRODUCT_NAME,
        `El backend desktop se cerro de forma inesperada.\n\nRevisa:\n${logPaths.output}\n${logPaths.error}`,
      )
    }
  })

  return {
    name: serviceName,
    child,
    outputStream,
    errorStream,
  }
}

function stopNodeService(service) {
  if (!service) {
    return
  }

  try {
    service.child.kill()
  } catch {
    // noop
  }

  try {
    service.outputStream.end()
  } catch {
    // noop
  }

  try {
    service.errorStream.end()
  } catch {
    // noop
  }
}

function waitForBridgeReady(timeoutMs = 12000) {
  const startedAt = Date.now()

  return new Promise((resolve) => {
    function attempt() {
      const request = http.get(`${APP_URL}/api/health/bridge`, (response) => {
        response.resume()

        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
          resolve()
          return
        }

        scheduleRetry()
      })

      request.on('error', scheduleRetry)

      function scheduleRetry() {
        if (Date.now() - startedAt >= timeoutMs) {
          resolve()
          return
        }

        setTimeout(attempt, 500)
      }
    }

    attempt()
  })
}

function waitForBackendReady(timeoutMs = 30000) {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    function attempt() {
      const request = http.get(`${APP_URL}/api/status`, (response) => {
        response.resume()

        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
          resolve()
          return
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error('El backend desktop no respondio a tiempo.'))
          return
        }

        setTimeout(attempt, 500)
      })

      request.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error('No se pudo conectar con el backend desktop.'))
          return
        }

        setTimeout(attempt, 500)
      })
    }

    attempt()
  })
}

function isInternalAppUrl(targetUrl) {
  return targetUrl.startsWith(APP_URL)
}

async function postDesktopInternalJson(pathname, payload) {
  const response = await fetch(`${APP_URL}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-live-control-desktop-token': DESKTOP_BRIDGE_TOKEN,
    },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(body?.error || `No pude completar ${pathname} desde la app desktop.`)
  }

  return body
}

function getTikTokPartitionSession() {
  return session.fromPartition(TIKTOK_PARTITION)
}

async function readTikTokAuthCookies() {
  const cookies = await getTikTokPartitionSession().cookies.get({})
  const cookieMap = new Map(
    cookies.map((cookie) => [String(cookie.name || '').toLowerCase(), String(cookie.value || '')]),
  )

  return {
    sessionId: cookieMap.get('sessionid') || '',
    ttTargetIdc: cookieMap.get('tt-target-idc') || '',
  }
}

async function syncTikTokAuthCookiesToBackend(overrides = {}) {
  const authCookies = await readTikTokAuthCookies()

  if (!authCookies.sessionId || !authCookies.ttTargetIdc) {
    return {
      imported: false,
      missingCookies: true,
    }
  }

  const payload = await postDesktopInternalJson('/api/desktop/tiktok/session', {
    ...authCookies,
    ...overrides,
  })

  return {
    imported: true,
    status: payload.status,
    sessionId: authCookies.sessionId,
    ttTargetIdc: authCookies.ttTargetIdc,
  }
}

async function restoreDesktopTikTokSession() {
  try {
    return await syncTikTokAuthCookiesToBackend()
  } catch (error) {
    return {
      imported: false,
      error: error.message,
    }
  }
}

function createStandardWindow(options = {}) {
  return new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BACKGROUND,
    icon: getWindowIconPath(),
    webPreferences: getDefaultWebPreferences(options.webPreferences || {}),
    ...options,
  })
}

function attachWindowRouting(windowInstance) {
  windowInstance.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalAppUrl(url)) {
      const childWindow = createStandardWindow({
        width: 1280,
        height: 820,
        minWidth: 960,
        minHeight: 600,
      })

      attachWindowRouting(childWindow)
      childWindow.loadURL(url)
      return { action: 'deny' }
    }

    shell.openExternal(url)
    return { action: 'deny' }
  })

  windowInstance.webContents.on('will-navigate', (event, url) => {
    if (!isInternalAppUrl(url)) {
      event.preventDefault()
      shell.openExternal(url)
      return
    }

    try {
      const parsedUrl = new URL(url)
      const isMainWindow = windowInstance === mainWindow
      const isOverlayPath = parsedUrl.pathname.startsWith('/overlay/')
      const isWidgetView = parsedUrl.searchParams.get('view') === 'widget'

      if (isMainWindow && isOverlayPath && !isWidgetView) {
        event.preventDefault()
        const panel = parsedUrl.searchParams.get('panel') || 'overlay'
        const nextPanel = panel && panel !== 'live-hub' ? panel : 'overlay'
        void windowInstance.loadURL(
          nextPanel === 'live-hub' ? `${APP_URL}/` : `${APP_URL}/?panel=${encodeURIComponent(nextPanel)}`,
        )
      }
    } catch {
      // Ignore malformed URLs and allow default navigation.
    }
  })
}

function createLoadingWindow() {
  const nextWindow = createStandardWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    show: true,
  })

  const loadingMarkup = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${PRODUCT_NAME}</title>
        <style>
          :root {
            color-scheme: dark;
            font-family: "Segoe UI", system-ui, sans-serif;
          }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background:
              radial-gradient(circle at top, rgba(18, 152, 116, 0.18), transparent 35%),
              linear-gradient(145deg, #071018 0%, #0b151d 50%, #04080d 100%);
            color: #f7f8fa;
          }
          .panel {
            width: min(560px, calc(100vw - 64px));
            padding: 32px;
            border-radius: 28px;
            background: rgba(8, 16, 24, 0.88);
            border: 1px solid rgba(126, 230, 190, 0.18);
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
          }
          .eyebrow {
            margin: 0 0 12px;
            font-size: 12px;
            letter-spacing: 0.26em;
            text-transform: uppercase;
            color: #7ee6be;
          }
          h1 {
            margin: 0 0 16px;
            font-size: clamp(32px, 4vw, 44px);
            line-height: 1.06;
          }
          p {
            margin: 0;
            line-height: 1.6;
            color: rgba(247, 248, 250, 0.8);
          }
        </style>
      </head>
      <body>
        <main class="panel">
          <p class="eyebrow">Beta Cerrada</p>
          <h1>Estamos levantando tu centro de control.</h1>
          <p>En un solo clic: backend, bridge (Minecraft/GTA) y panel web. No hace falta abrir terminales aparte.</p>
          <p style="margin-top:12px;font-size:0.92rem;">1. Backend · 2. Bridge local · 3. Panel listo</p>
        </main>
      </body>
    </html>
  `

  nextWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingMarkup)}`)
  attachWindowRouting(nextWindow)
  return nextWindow
}

function openTikTokLoginWindow(options = {}) {
  if (tikTokLoginPromise) {
    if (tikTokLoginWindow && !tikTokLoginWindow.isDestroyed()) {
      tikTokLoginWindow.focus()
    }

    return tikTokLoginPromise
  }

  tikTokLoginPromise = new Promise((resolve, reject) => {
    const loginSession = getTikTokPartitionSession()
    let settled = false
    let checkTimer = null

    const cleanup = () => {
      loginSession.cookies.removeListener('changed', handleCookieChange)

      if (checkTimer) {
        clearInterval(checkTimer)
        checkTimer = null
      }
    }

    const finish = (callback, value) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      callback(value)
    }

    const completeImport = async () => {
      try {
        const result = await syncTikTokAuthCookiesToBackend({
          authenticateWs: Boolean(options.authenticateWs),
        })

        if (!result.imported) {
          return
        }

        const currentWindow = tikTokLoginWindow
        tikTokLoginWindow = null
        finish(resolve, result)

        if (currentWindow && !currentWindow.isDestroyed()) {
          currentWindow.close()
        }
      } catch (error) {
        finish(reject, error)
      }
    }

    const handleCookieChange = async (_event, cookie, cause, removed) => {
      const normalizedName = String(cookie?.name || '').toLowerCase()

      if (removed || (normalizedName !== 'sessionid' && normalizedName !== 'tt-target-idc')) {
        return
      }

      await completeImport()
    }

    tikTokLoginWindow = createStandardWindow({
      width: 1120,
      height: 820,
      minWidth: 920,
      minHeight: 680,
      show: true,
      title: 'TikTok Login',
      parent: mainWindow || undefined,
      modal: Boolean(mainWindow),
      webPreferences: getDefaultWebPreferences({
        partition: TIKTOK_PARTITION,
      }),
    })

    tikTokLoginWindow.once('ready-to-show', () => {
      tikTokLoginWindow?.show()
    })

    tikTokLoginWindow.on('closed', () => {
      tikTokLoginWindow = null

      if (!settled) {
        finish(reject, new Error('Cerraste la ventana antes de terminar el login de TikTok.'))
      }
    })

    tikTokLoginWindow.webContents.on('did-finish-load', () => {
      void completeImport()
    })

    tikTokLoginWindow.webContents.on('did-navigate', () => {
      void completeImport()
    })

    tikTokLoginWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })

    loginSession.cookies.on('changed', handleCookieChange)
    checkTimer = setInterval(() => {
      void completeImport()
    }, 1200)

    tikTokLoginWindow.loadURL('https://www.tiktok.com/login?lang=es')
    void completeImport()
  }).finally(() => {
    tikTokLoginPromise = null
  })

  return tikTokLoginPromise
}

function updateDesktopSpotifyRedirectUri() {
  const desktopEnvPath = getUserDataPath('desktop.env')
  const existingEnv = readEnvFile(desktopEnvPath)
  const redirectUri = `${APP_URL}/api/music/spotify/callback`
  const nextEnv = {
    ...existingEnv,
    SPOTIFY_REDIRECT_URI: redirectUri,
  }

  const serializedEnv = Object.entries(nextEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  fs.writeFileSync(desktopEnvPath, `${serializedEnv}\n`, 'utf8')
}

async function bootDesktopApp() {
  ensureRuntimeFiles()
  await ensureAvailablePort()
  updateDesktopSpotifyRedirectUri()
  console.log(`Seleccionado puerto desktop ${APP_PORT}`)

  const desktopRuntimeEnv = getDesktopRuntimeEnv()
  backendService = startNodeService('backend', path.join('server', 'index.js'), {
    PORT: String(APP_PORT),
    LIVE_CONTROL_STORAGE_DIR: getUserDataPath('storage'),
    LIVE_CONTROL_USER_DATA: getUserDataPath(),
    LIVE_CONTROL_DASHBOARD_URL: APP_URL,
    LIVE_CONTROL_DESKTOP_MODE: '1',
    LIVE_CONTROL_DESKTOP_TOKEN: DESKTOP_BRIDGE_TOKEN,
    SPOTIFY_CLIENT_ID: desktopRuntimeEnv.SPOTIFY_CLIENT_ID || '',
    SPOTIFY_CLIENT_SECRET: desktopRuntimeEnv.SPOTIFY_CLIENT_SECRET || '',
    SPOTIFY_REDIRECT_URI: desktopRuntimeEnv.SPOTIFY_REDIRECT_URI || `${APP_URL}/api/music/spotify/callback`,
  })

  await waitForBackendReady()
  await restoreDesktopTikTokSession()

  bridgeService = startNodeService('bridge', path.join('bridge', 'index.js'), {
    LIVE_CONTROL_BRIDGE_CONFIG: getUserDataPath('bridge-config.json'),
    LIVE_CONTROL_BACKEND_URL: APP_URL,
    LIVE_CONTROL_DASHBOARD_URL: APP_URL,
  })

  await waitForBridgeReady()
}

async function createMainWindow() {
  mainWindow = createLoadingWindow()

  try {
    await bootDesktopApp()
    await mainWindow.loadURL(`${APP_URL}/?panel=live-hub`)

    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        mainWindow.webContents.toggleDevTools()
      }
    })

    mainWindow.webContents.on('did-finish-load', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return
      }

      mainWindow.webContents
        .executeJavaScript(
          `(function () {
            if (!window.liveControlDesktop) return;
            if (new URLSearchParams(location.search).get('view') === 'widget') return;
            if (!location.pathname.startsWith('/overlay/')) return;
            const next = new URL(location.href);
            const panel = new URLSearchParams(location.search).get('panel') || 'overlay';
            next.pathname = '/';
            next.searchParams.set('panel', panel);
            next.searchParams.delete('view');
            history.replaceState({}, '', next.pathname + next.search);
          })();`,
        )
        .catch(() => {})
    })
  } catch (error) {
    dialog.showErrorBox(
      PRODUCT_NAME,
      `${error.message}\n\nRevisa los logs en:\n${getUserDataPath('runtime-logs')}`,
    )
  }
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }

      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  app.setAppUserModelId('io.soragfz.livecontrol.beta')
  ipcMain.handle('desktop:get-context', () => ({
    isDesktopApp: true,
  }))
  ipcMain.handle('desktop:open-external', async (_event, url) => {
    const nextUrl = String(url || '').trim()

    if (!/^https?:\/\//i.test(nextUrl)) {
      throw new Error('Solo puedo abrir enlaces http o https desde la app desktop.')
    }

    await shell.openExternal(nextUrl)
    return { opened: true }
  })
  ipcMain.handle('desktop:open-path', async (_event, targetPath) => {
    const nextPath = String(targetPath || '').trim()

    if (!nextPath) {
      throw new Error('Ruta vacia.')
    }

    const openResult = await shell.openPath(nextPath)
    if (openResult) {
      throw new Error(openResult)
    }

    return { opened: true, path: nextPath }
  })
  ipcMain.handle('desktop:start-tiktok-login', async (_event, options = {}) => {
    return openTikTokLoginWindow(options || {})
  })
  await createMainWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
    }
  })
})

app.on('before-quit', () => {
  isShuttingDown = true
  stopNodeService(bridgeService)
  stopNodeService(backendService)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
