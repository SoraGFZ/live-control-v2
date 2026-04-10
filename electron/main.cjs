const { app, BrowserWindow, Menu, dialog, shell } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { spawn } = require('node:child_process')

const APP_HOST = '127.0.0.1'
const APP_PORT = Number(process.env.LIVE_CONTROL_DESKTOP_PORT || 5123)
const APP_URL = `http://${APP_HOST}:${APP_PORT}`
const WINDOW_BACKGROUND = '#071018'
const PRODUCT_NAME = 'Live Control Beta'

let mainWindow = null
let backendService = null
let bridgeService = null
let isShuttingDown = false

function getAppRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : path.resolve(__dirname, '..')
}

function getUserDataPath(...segments) {
  return path.join(app.getPath('userData'), ...segments)
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

function attachWindowRouting(windowInstance) {
  windowInstance.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalAppUrl(url)) {
      const childWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 960,
        minHeight: 600,
        autoHideMenuBar: true,
        backgroundColor: WINDOW_BACKGROUND,
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
  const nextWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BACKGROUND,
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

async function bootDesktopApp() {
  ensureRuntimeFiles()

  backendService = startNodeService('backend', path.join('server', 'index.js'), {
    PORT: String(APP_PORT),
    LIVE_CONTROL_STORAGE_DIR: getUserDataPath('storage'),
    LIVE_CONTROL_DASHBOARD_URL: APP_URL,
    LIVE_CONTROL_DESKTOP_MODE: '1',
  })

  await waitForBackendReady()

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
