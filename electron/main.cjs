const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron')
const { randomBytes } = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { spawn } = require('node:child_process')

const APP_HOST = '127.0.0.1'
const APP_PORT = Number(process.env.LIVE_CONTROL_DESKTOP_PORT || 5123)
const APP_URL = `http://${APP_HOST}:${APP_PORT}`
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

function getAppRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : path.resolve(__dirname, '..')
}

function getUserDataPath(...segments) {
  return path.join(app.getPath('userData'), ...segments)
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.cjs')
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

function seedBridgeConfigIfNeeded() {
  const targetBridgeConfigPath = getUserDataPath('bridge-config.json')

  if (fs.existsSync(targetBridgeConfigPath)) {
    return
  }

  const sourceCandidates = [
    path.join(getAppRoot(), 'bridge-config.json'),
    path.join(getAppRoot(), 'bridge-config.example.json'),
  ]
  const sourcePath = sourceCandidates.find((candidate) => fs.existsSync(candidate))
  const nextConfig = sourcePath ? readJsonFile(sourcePath) : {}

  writeJsonFile(targetBridgeConfigPath, {
    ...nextConfig,
    serverBaseUrl: APP_URL,
    localDashboardBaseUrl: APP_URL,
  })
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
    if (isInternalAppUrl(url)) {
      return
    }

    event.preventDefault()
    shell.openExternal(url)
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
          <p>Panel, backend y bridge local se están preparando para abrir la app completa.</p>
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
      show: false,
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

async function bootDesktopApp() {
  ensureRuntimeFiles()

  backendService = startNodeService('backend', path.join('server', 'index.js'), {
    PORT: String(APP_PORT),
    LIVE_CONTROL_STORAGE_DIR: getUserDataPath('storage'),
    LIVE_CONTROL_DASHBOARD_URL: APP_URL,
    LIVE_CONTROL_DESKTOP_MODE: '1',
    LIVE_CONTROL_DESKTOP_TOKEN: DESKTOP_BRIDGE_TOKEN,
  })

  await waitForBackendReady()
  await restoreDesktopTikTokSession()

  bridgeService = startNodeService('bridge', path.join('bridge', 'index.js'), {
    LIVE_CONTROL_BRIDGE_CONFIG: getUserDataPath('bridge-config.json'),
  })
}

async function createMainWindow() {
  mainWindow = createLoadingWindow()

  try {
    await bootDesktopApp()
    await mainWindow.loadURL(APP_URL)
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
