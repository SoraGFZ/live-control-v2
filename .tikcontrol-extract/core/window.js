// Core: Gestión de ventana principal
const { app, BrowserWindow, nativeImage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

let mainWindow = null;
let splashWindow = null;
let gcInterval = null;

function decodeBase64Url(input) {
  const value = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(value + padding, 'base64').toString('utf8');
}

function extractStorageKeyFromDownloadToken(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const token = parsed.searchParams.get('token');
    if (!token) return null;
    const payload = JSON.parse(decodeBase64Url(token.split('.')[0]));
    return typeof payload.key === 'string' && payload.key ? payload.key : null;
  } catch (_e) {
    return null;
  }
}

function getStorageKeyFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname !== 'storage.tikcontrol.live') return null;
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch (_e) {
    return null;
  }
}

function hasStorageTokenParam(rawUrl) {
  try {
    return new URL(rawUrl).searchParams.has('token');
  } catch (_e) {
    return String(rawUrl || '').includes('token=');
  }
}

function isTokenGatedStorageKey(key) {
  return /^(public\/|users-data\/[^/]+\/(?:fonts|sounds|images|videos|gifs|audios)\/)/.test(String(key || ''));
}

async function getSignedStorageUrlForKey(key) {
  const cleanKey = String(key || '').replace(/^\/+/, '');
  if (!cleanKey) return null;
  if (!isTokenGatedStorageKey(cleanKey)) return `https://storage.tikcontrol.live/${cleanKey}`;

  try {
    const cloudRelay = require('../modules/integrations/cloudRelay');
    const cachedToken = typeof cloudRelay.getStorageToken === 'function'
      ? cloudRelay.getStorageToken(cleanKey)
      : null;
    if (cachedToken) {
      return `https://storage.tikcontrol.live/${cleanKey}?token=${encodeURIComponent(cachedToken)}`;
    }
    if (cloudRelay.connected && typeof cloudRelay.getDownloadUrl === 'function') {
      const signed = await cloudRelay.getDownloadUrl(cleanKey);
      if (signed && /^https?:\/\//i.test(signed)) return signed;
    }
  } catch (_e) { }

  return null;
}

async function normalizeLegacyStorageRequestUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === 'ws.tikcontrol.live' && parsed.pathname === '/storage/download') {
      const key = extractStorageKeyFromDownloadToken(rawUrl);
      if (key) return getSignedStorageUrlForKey(key);
    }
    if (parsed.hostname === 'storage.tikcontrol.live' && !parsed.searchParams.has('token')) {
      const key = getStorageKeyFromUrl(rawUrl);
      if (key && isTokenGatedStorageKey(key)) {
        return getSignedStorageUrlForKey(key);
      }
      if (rawUrl.includes('X-Amz-')) {
        return `${parsed.origin}${parsed.pathname}`;
      }
    }
  } catch (_e) { }
  return null;
}

function resolveIconPath() {
  try {
    const candidates = [
      process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'icons', 'icon.ico') : null,
      process.resourcesPath ? path.join(process.resourcesPath, 'build', 'icons', 'icon.ico') : null,
      process.resourcesPath ? path.join(process.resourcesPath, 'icons', 'icon.ico') : null,
      path.join(process.cwd(), 'build', 'icons', 'icon.ico'),
      path.join(__dirname, '..', 'build', 'icons', 'icon.ico'),
      path.join(process.cwd(), 'build', 'icon.ico'),
    ].filter(Boolean);

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } catch (e) {
    logger.warn('Window', 'No se pudo resolver icono:', e.message);
  }
  return null;
}

// ==================== SPLASH SCREEN ====================
let splashStartTime = null;
const SPLASH_MIN_DURATION = 4500; // 4.5 segundos mínimo

function resolveSplashPath() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'splash.mp4') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'resources', 'splash.mp4') : null,
    path.join(__dirname, '..', 'resources', 'splash.mp4'),
    path.join(process.cwd(), 'resources', 'splash.mp4'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      logger.info('Splash', '✅ Splash video encontrado:', p);
      return p;
    }
  }
  logger.warn('Splash', '⚠️ No se encontró splash video');
  return null;
}

async function createSplashWindow() {
  const splashVideoPath = resolveSplashPath();
  if (!splashVideoPath) {
    return null;
  }

  const iconPath = process.platform === 'win32' ? resolveIconPath() : null;

  splashWindow = new BrowserWindow({
    width: 700,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    icon: iconPath || undefined,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Necesario para cargar videos locales
    }
  });

  // Convertir ruta a URL file:// válida con encoding para espacios
  const videoUrl = `file:///${encodeURI(splashVideoPath.replace(/\\/g, '/'))}`;

  // Cargar el HTML del splash desde archivo
  const splashHtmlPath = path.join(__dirname, '..', 'renderer', 'splash.html');
  
  if (fs.existsSync(splashHtmlPath)) {
    // Cargar desde archivo HTML con el video como parámetro
    await splashWindow.loadFile(splashHtmlPath, {
      query: { video: videoUrl }
    });
  } else {
    // Fallback: HTML inline si no existe el archivo
    logger.warn('Splash', 'splash.html no encontrado, usando fallback');
    const splashHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: transparent;
          -webkit-app-region: drag;
        }
        .splash-container {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f1a 100%);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0,0,0,0.8);
        }
        .loading-fallback {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          color: white;
        }
        .logo {
          font-size: 48px;
          animation: pulse 1.5s ease-in-out infinite;
        }
        .brand {
          font-size: 28px;
          font-weight: 700;
          background: linear-gradient(135deg, #237BFF 0%, #A346FF 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .loader {
          width: 50px;
          height: 50px;
          border: 3px solid rgba(255,255,255,0.1);
          border-top: 3px solid #237BFF;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      </style>
    </head>
    <body>
      <div class="splash-container">
        <div class="loading-fallback" style="display:flex;">
          <div class="logo">
            <img src="file:///${path.join(__dirname, '..', 'renderer', 'logo.png').replace(/\\/g, '/')}" style="width: 80px; height: 80px; object-fit: contain;">
          </div>
          <div class="brand">TikControl</div>
          <div class="loader"></div>
        </div>
      </div>
    </body>
    </html>
  `;
    await splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
  }

  splashWindow.show();
  splashStartTime = Date.now();
  logger.info('Splash', '🎬 Splash screen mostrado');

  return splashWindow;
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
    logger.info('Splash', '✅ Splash cerrado');
  }
}

async function createWindow(httpUiUrl = null) {
  const iconPath = process.platform === 'win32' ? resolveIconPath() : null;

  mainWindow = new BrowserWindow({
    title: 'TikControl',
    width: 1200,
    height: 800,
    minWidth: 625,
    minHeight: 700,
    icon: iconPath || undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      devTools: !app.isPackaged, // ✅ DevTools SOLO en desarrollo
      disableBlinkFeatures: 'Auxclick',
      backgroundThrottling: false,
      offscreen: false,
      spellcheck: false,
      cache: false, // ✅ Deshabilitar cache
      // ✅ v1.10.583: Permitir drag & drop de archivos en app empaquetada
      enableRemoteModule: false,
      webSecurity: true, // Mantener seguridad pero permitir file://
    },
    skipTaskbar: false,
    focusable: true,
    acceptFirstMouse: true,
  });

  // Hacer mainWindow accesible globalmente
  global.mainWindow = mainWindow;

  // Content Security Policy for the main window.
  // En dev (USE_DEV_WORKER=1) añadimos http://localhost:* a las directivas
  // que no lo tenían ya (script-src, font-src) para poder cargar del worker
  // local de wrangler en lugar de ws.tikcontrol.live.
  const { session } = require('electron');
  const devWorkerActive = process.env.USE_DEV_WORKER === '1' || process.env.USE_DEV_WORKER === 'true';
  const devLocalhostSrc = devWorkerActive ? ' http://localhost:* http://127.0.0.1:*' : '';

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['https://ws.tikcontrol.live/storage/download*', 'https://storage.tikcontrol.live/*'] },
    (details, callback) => {
      normalizeLegacyStorageRequestUrl(details.url)
        .then(redirectURL => {
          if (redirectURL) callback({ redirectURL });
          else {
            const storageKey = getStorageKeyFromUrl(details.url);
            const hasToken = hasStorageTokenParam(details.url);
            if (
              details.url.includes('/storage/download?token=') ||
              (isTokenGatedStorageKey(storageKey) && !hasToken)
            ) callback({ cancel: true });
            else callback({});
          }
        })
        .catch(() => callback({}));
    }
  );
  try {
    session.defaultSession.clearCache().catch(() => {});
  } catch (_e) { }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self' https: wss: data: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://accounts.google.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://code.jquery.com https://cdn.socket.io https://storage.tikcontrol.live https://ws.tikcontrol.live https://static.cloudflareinsights.com" + devLocalhostSrc,
      "script-src-elem 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com https://accounts.google.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://code.jquery.com https://cdn.socket.io https://storage.tikcontrol.live https://ws.tikcontrol.live https://static.cloudflareinsights.com" + devLocalhostSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com",
      "font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://storage.tikcontrol.live https://ws.tikcontrol.live" + devLocalhostSrc,
      "img-src 'self' data: blob: https: http:",
      "media-src 'self' data: blob: https: http: sound-cache:",
      "connect-src 'self' https: wss: ws: https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com http://localhost:* http://127.0.0.1:*",
      "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://checkout.stripe.com https://tikcontrol.live https://*.tikcontrol.live https://storage.tikcontrol.live https://ws.tikcontrol.live http://localhost:* http://127.0.0.1:*",
    ].join('; ');
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });

  // Inject auth header into all localhost requests (second factor alongside cookie)
  if (global.__TC_AUTH_HEADER_TOKEN__) {
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['http://localhost:*/*', 'http://127.0.0.1:*/*'] },
      (details, callback) => {
        details.requestHeaders['X-TC-Token'] = global.__TC_AUTH_HEADER_TOKEN__;
        callback({ requestHeaders: details.requestHeaders });
      }
    );
  }

  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.control && (input.key === '-' || input.key === '+' || input.key === '=' || input.key === '0')) {
        event.preventDefault();
      }
    });
  }

  // Garbage collection periódico
  setupGarbageCollection();

  // Mejorar manejo del focus
  setupFocusHandling();

  // Mostrar ventana cuando esté lista
  mainWindow.once('ready-to-show', () => {
    // Calcular tiempo restante para mantener splash mínimo 4.5s
    let delay = 0;
    if (splashWindow && splashStartTime) {
      const elapsed = Date.now() - splashStartTime;
      delay = Math.max(0, SPLASH_MIN_DURATION - elapsed);
    }
    
    // Cerrar splash después del tiempo mínimo
    setTimeout(() => {
      closeSplashWindow();
      mainWindow.show();
      mainWindow.focus();
    }, delay);

    // ✅ Abrir DevTools SOLO en desarrollo
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
      logger.info('Window', '🔍 DevTools abiertas (modo desarrollo)');
    }

    if (process.platform === 'win32' && iconPath) {
      setTimeout(() => {
        try {
          mainWindow.setIcon(iconPath);
          mainWindow.setTitle('TikControl');
        } catch (e) {
          logger.warn('Window', 'Error actualizando propiedades:', e.message);
        }
      }, 1000);
    }
  });

  // Configurar cookie de autenticación para el servidor local
  // Se establece en ambos dominios porque el renderer usa tanto localhost como 127.0.0.1
  if (httpUiUrl && global.__TC_AUTH_TOKEN__) {
    try {
      const port = new URL(httpUiUrl).port || '43123';
      await Promise.all([
        session.defaultSession.cookies.set({
          url: `http://localhost:${port}`,
          name: '__tc_auth',
          value: global.__TC_AUTH_TOKEN__,
          httpOnly: true,
          sameSite: 'lax',
        }),
        session.defaultSession.cookies.set({
          url: `http://127.0.0.1:${port}`,
          name: '__tc_auth',
          value: global.__TC_AUTH_TOKEN__,
          httpOnly: true,
          sameSite: 'lax',
        }),
      ]);
      logger.info('Window', 'Auth cookies configuradas para localhost y 127.0.0.1');
    } catch (e) {
      logger.warn('Window', 'No se pudo configurar auth cookie:', e.message);
    }
  }

  // Cargar URL
  const remoteUrl = process.env.REMOTE_APP_URL && process.env.REMOTE_APP_URL.startsWith('http')
    ? process.env.REMOTE_APP_URL
    : null;

  if (remoteUrl) {
    logger.info('Window', 'Cargando UI remota:', remoteUrl);
    mainWindow.loadURL(remoteUrl);
  } else if (httpUiUrl) {
    logger.info('Window', 'Cargando UI local HTTP:', httpUiUrl);
    mainWindow.loadURL(httpUiUrl);
  } else {
    logger.info('Window', 'Cargando UI desde archivo');
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  // Ajustar BrowserViews en resize
  mainWindow.on('resize', () => {
    try {
      const { layout } = require('../modules/topLikesView');
      layout();
    } catch (_) { }
  });

  return mainWindow;
}

function setupGarbageCollection() {
  if (gcInterval) {
    clearInterval(gcInterval);
  }
  gcInterval = setInterval(() => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`
          if (window.gc) {
            window.gc();
          }
        `);
      }
      if (global.gc) {
        global.gc();
      }
    } catch (e) { }
  }, 2 * 60 * 1000);
  if (typeof gcInterval.unref === 'function') {
    gcInterval.unref();
  }
}

function setupFocusHandling() {
  mainWindow.on('focus', () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.focus();
      }
    } catch (e) { }
  });
}

function getMainWindow() {
  return mainWindow;
}

function updateTitle(title) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(title || 'TikControl');
    }
  } catch (_) { }
}

function cleanupWindowResources() {
  if (gcInterval) {
    clearInterval(gcInterval);
    gcInterval = null;
  }
}

module.exports = {
  createWindow,
  createSplashWindow,
  closeSplashWindow,
  getMainWindow,
  updateTitle,
  cleanupWindowResources,
  resolveIconPath
};

