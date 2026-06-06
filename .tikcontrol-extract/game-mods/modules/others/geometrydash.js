// Geometry Dash Integration Module
const { ipcMain, dialog } = require('electron');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

/** Último release estable de Geode (loader Windows en .zip plano). */
const GEODE_GITHUB_LATEST_API = 'https://api.github.com/repos/geode-sdk/geode/releases/latest';
/**
 * Paquete en S3: debe incluir el .geode de TikControl compilado para la misma API/SDK de Geode
 * que la app instala después (última release GitHub), o el juego puede arrancar pero el TCP
 * no abrirá (mod no carga). Si mod.zip solo trae Geode antigua, GD actual puede crashear →
 * por eso tras extraer se actualiza Geode salvo TIKCONTROL_SKIP_GEODE_UPDATE=1.
 */
const GD_MOD_ZIP_URL =
  process.env.TIKCONTROL_GD_MOD_URL ||
  'https://storage.tikcontrol.live/games/geometry-dash/mod.zip';
const {
  resolveDir,
  GD_TIKCONTROL_MARKER_FILENAME,
  writeGeometryDashTikControlMarker,
  isTikControlGeometryDashModInstalled
} = require('../steamDetect');
const { resolveSetGamePathArgs } = require('../setGamePathArgs');
const { execSync } = require('child_process');

let mainWindow = null;
let tcpClient = null;
let isConnected = false;
let reconnectTimer = null;
let effectsData = null;
let gamePath = null; // Ruta del ejecutable o carpeta del juego

function _looksLikeFilesystemPath(s) {
  return typeof s === 'string' && (/[\\/]/.test(s) || /^[a-zA-Z]:/.test(s.trim()));
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True si GeometryDash.exe está en ejecución (Windows). Evita EBUSY al tocar Geode.dll. */
function isGeometryDashRunning() {
  if (process.platform !== 'win32') {
    try {
      execSync('pgrep -x GeometryDash 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
      return true;
    } catch (_) {
      return false;
    }
  }
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq GeometryDash.exe" /FO CSV /NH', {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true
    });
    return /GeometryDash\.exe/i.test(out);
  } catch (_) {
    return false;
  }
}

function collectFilesRecursive(rootDir, baseRel = '') {
  const list = [];
  if (!rootDir || !fs.existsSync(rootDir)) return list;
  let names;
  try {
    names = fs.readdirSync(rootDir);
  } catch (_) {
    return list;
  }
  for (const name of names) {
    const full = path.join(rootDir, name);
    const rel = baseRel ? `${baseRel}/${name}` : name;
    let st;
    try {
      st = fs.statSync(full);
    } catch (_) {
      continue;
    }
    if (st.isDirectory()) list.push(...collectFilesRecursive(full, rel));
    else list.push({ full, rel });
  }
  return list;
}

/**
 * Copia árbol extraído en temp → carpeta del juego con reintentos (evita EBUSY si hubo cierre reciente).
 * @returns {Promise<{ failed: Array<{ rel: string, error: string, code?: string }> }>}
 */
async function copyExtractedTreeToGameDir(tempRoot, gameDir) {
  const files = collectFilesRecursive(tempRoot);
  const failed = [];
  for (const { full, rel } of files) {
    const dest = path.join(gameDir, rel);
    const destDir = path.dirname(dest);
    try {
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    } catch (e) {
      failed.push({ rel, error: e.message, code: e.code });
      continue;
    }
    let written = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        fs.copyFileSync(full, dest);
        written = true;
        break;
      } catch (e) {
        const c = e.code;
        if (c === 'EBUSY' || c === 'EPERM' || c === 'EACCES') {
          await sleepMs(250 * (attempt + 1));
        } else {
          failed.push({ rel, error: e.message, code: c });
          break;
        }
      }
    }
    if (!written && !failed.some((f) => f.rel === rel)) {
      failed.push({ rel, error: 'copy_failed_after_retries', code: 'EBUSY' });
    }
  }
  return { failed };
}

/**
 * Extrae zip en temp (nunca en Program Files directo) y copia al destino — evita EBUSY en Geode.dll.
 */
async function extractZipViaTempAndCopy(zipPath, gameDir) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(zipPath);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-mod-'));
  try {
    zip.extractAllTo(tempRoot, true);
    const { failed } = await copyExtractedTreeToGameDir(tempRoot, gameDir);
    const extractedFiles = zip.getEntries().map((e) => e.entryName);
    return { success: failed.length === 0, failed, extractedFiles };
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (_) {}
  }
}

function formatGeodeLockError(failed, gameRunning) {
  const names = (failed || []).map((f) => f.rel).join(', ');
  if (gameRunning) {
    return {
      code: 'geometrydash_game_running',
      message:
        'Geometry Dash está abierto. Ciérralo por completo (Steam → Salir del juego) e inténtalo de nuevo.'
    };
  }
  return {
    code: 'geometrydash_files_locked',
    message: `No se pudieron sobrescribir algunos archivos (${names || 'desconocidos'}). Cierra Geometry Dash, espera unos segundos y vuelve a intentar.`
  };
}

function uninstallTikControlGeodeMod(profileId) {
  const p = (profileId && resolveGeometryDashPath(profileId)) || gamePath;
  if (!p || !fs.existsSync(p)) {
    return { success: false, error: 'no_path', code: 'no_path', message: 'Configura la ruta del juego primero.' };
  }
  if (isGeometryDashRunning()) {
    return {
      success: false,
      error: 'geometrydash_game_running',
      code: 'geometrydash_game_running',
      message: 'Cierra Geometry Dash antes de desinstalar el mod.'
    };
  }
  const gameDir = resolveDir(p);
  const modsDir = path.join(gameDir, 'geode', 'mods');
  const removed = [];
  const failed = [];
  if (fs.existsSync(modsDir)) {
    let files = [];
    try {
      files = fs.readdirSync(modsDir);
    } catch (e) {
      return { success: false, error: e.message, code: 'read_error', message: e.message };
    }
    const markerPath = path.join(modsDir, GD_TIKCONTROL_MARKER_FILENAME);
    if (fs.existsSync(markerPath)) {
      try {
        fs.unlinkSync(markerPath);
        removed.push(GD_TIKCONTROL_MARKER_FILENAME);
      } catch (e) {
        failed.push({ file: GD_TIKCONTROL_MARKER_FILENAME, error: e.message, code: e.code });
      }
    }
    for (const f of files) {
      if (!f.endsWith('.geode')) continue;
      if (!/tikcontrol\.tikcontrolgd|tikcontrol|crowd|tcgd|tc[_-]?gd/i.test(f)) continue;
      const fp = path.join(modsDir, f);
      try {
        fs.unlinkSync(fp);
        removed.push(f);
      } catch (e) {
        failed.push({ file: f, error: e.message, code: e.code });
      }
    }
  }
  const uninstallerPath = path.join(gameDir, 'GeodeUninstaller.exe');
  let message =
    removed.length > 0
      ? `Mod TikControl eliminado (${removed.join(', ')}).`
      : 'No se encontró un .geode de TikControl en geode/mods (quizá ya estaba quitado).';
  if (failed.length) {
    return {
      success: false,
      error: 'geometrydash_uninstall_partial',
      code: 'geometrydash_uninstall_partial',
      removed,
      failed,
      message:
        'No se pudieron borrar algunos archivos. Cierra Geometry Dash y vuelve a intentar. ' +
        failed.map((x) => x.file).join(', ')
    };
  }
  if (fs.existsSync(uninstallerPath)) {
    message += ` Para quitar Geode por completo puedes ejecutar GeodeUninstaller.exe en la carpeta del juego.`;
  }
  return {
    success: true,
    removed,
    message,
    uninstallerPath: fs.existsSync(uninstallerPath) ? uninstallerPath : null
  };
}

/** Sincroniza con setConfigValue / perfil (misma clave que la pestaña Gaming). */
function persistGeometryDashPath(profileId, absolutePath) {
  if (!profileId || !absolutePath) return;
  try {
    if (!global.__CONFIG_STORE__) global.__CONFIG_STORE__ = new Map();
    global.__CONFIG_STORE__.set(`geometrydash_game_path_${profileId}`, absolutePath);
  } catch (_) {}
  try {
    const { app } = require('electron');
    const configPath = path.join(app.getPath('userData'), 'electron-config.json');
    let cfg = {};
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      if (raw.trim()) cfg = JSON.parse(raw);
    }
    cfg[`geometrydash_game_path_${profileId}`] = absolutePath;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Geometry Dash] ⚠️ No se pudo persistir la ruta:', e.message);
  }
}

/** Resuelve ruta guardada para un perfil (memoria + electron-config.json + perfil JSON). */
function resolveGeometryDashPath(profileId) {
  const { app } = require('electron');
  if (gamePath && fs.existsSync(gamePath)) return gamePath;

  if (profileId) {
    try {
      if (global.__CONFIG_STORE__) {
        const v = global.__CONFIG_STORE__.get(`geometrydash_game_path_${profileId}`);
        if (v && fs.existsSync(v)) return v;
      }
    } catch (_) {}
    try {
      const configPath = path.join(app.getPath('userData'), 'electron-config.json');
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const k = `geometrydash_game_path_${profileId}`;
        if (cfg[k] && fs.existsSync(cfg[k])) return cfg[k];
      }
    } catch (_) {}
    try {
      const profilesModule = require('../../../modules/profiles');
      const profileData = profilesModule.getProfileData(profileId);
      const storedPath = profileData?.juegos?.geometrydash?.gamePath;
      if (storedPath && fs.existsSync(storedPath)) return storedPath;
    } catch (_) {}
  }
  return null;
}

// ==================== INSTALACIÓN DEL MOD ====================

// Función para descargar archivo
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`[Geometry Dash] 📥 Descargando: ${url}`);
    console.log(`[Geometry Dash] 💾 Destino: ${destPath}`);

    const client = url.startsWith('https') ? https : http;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    };

    const request = client.get(url, options, (response) => {
      // Manejar redirecciones
      if (response.statusCode === 301 || response.statusCode === 302) {
        console.log(`[Geometry Dash] 🔀 Redirigiendo a: ${response.headers.location}`);
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      // Manejar compresión gzip automáticamente
      let stream = response;
      if (response.headers['content-encoding'] === 'gzip') {
        const zlib = require('zlib');
        stream = response.pipe(zlib.createGunzip());
      }

      const fileStream = fs.createWriteStream(destPath);
      const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
      let downloadedBytes = 0;

      stream.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const percent = Math.floor((downloadedBytes / totalBytes) * 100);
          console.log(`[Geometry Dash] 📊 Progreso: ${percent}%`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('geometrydash:install-progress', {
              message: `📥 Descargando... ${percent}%`
            });
          }
        }
      });

      stream.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`[Geometry Dash] ✅ Descarga completada: ${destPath}`);
        resolve(destPath);
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => { }); // Eliminar archivo parcial
        reject(err);
      });
    });

    request.on('error', (err) => {
      console.error('[Geometry Dash] ❌ Error en request:', err);
      fs.unlink(destPath, () => { }); // Eliminar archivo parcial
      reject(err);
    });

    request.setTimeout(120000, () => {
      request.abort();
      reject(new Error('Timeout de descarga (120s)'));
    });
  });
}

/** GET HTTPS y texto UTF-8 (GitHub API / redirecciones). */
function fetchHttpsText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': 'TikControl/1.13 (Geometry Dash; Geode auto-update)',
          Accept: 'application/vnd.github+json'
        }
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          const loc = res.headers.location;
          if (!loc) {
            reject(new Error('Redirección sin Location'));
            return;
          }
          fetchHttpsText(loc.startsWith('http') ? loc : new URL(loc, url).href)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );
    req.on('error', reject);
    req.setTimeout(45000, () => {
      req.destroy();
      reject(new Error('Timeout API GitHub (45s)'));
    });
  });
}

function pickGeodeWindowsZipAsset(release) {
  const assets = release && release.assets ? release.assets : [];
  let a = assets.find((x) => x && x.name && /^geode-v[\d.]+-win\.zip$/i.test(x.name));
  if (!a) {
    a = assets.find(
      (x) =>
        x &&
        x.name &&
        /-win\.zip$/i.test(x.name) &&
        /^geode-/i.test(x.name) &&
        !/android/i.test(x.name)
    );
  }
  return a || null;
}

/**
 * Descarga el último Geode loader para Windows (zip oficial) y lo aplica en la carpeta del juego.
 * Extrae en %TEMP% y copia archivo a archivo (evita EBUSY al escribir Geode.dll en uso).
 */
async function downloadLatestGeodeLoader(gameDir) {
  if (isGeometryDashRunning()) {
    const err = new Error(
      'Cierra Geometry Dash antes de actualizar Geode (si no, Geode.dll queda bloqueado).'
    );
    err.code = 'geometrydash_game_running';
    throw err;
  }
  const raw = await fetchHttpsText(GEODE_GITHUB_LATEST_API);
  let release;
  try {
    release = JSON.parse(raw);
  } catch (e) {
    throw new Error('Respuesta GitHub no es JSON válido');
  }
  const asset = pickGeodeWindowsZipAsset(release);
  if (!asset || !asset.browser_download_url) {
    throw new Error('No se encontró geode-*-win.zip en el último release');
  }
  const tag = release.tag_name || release.name || 'latest';
  const tempZip = path.join(os.tmpdir(), `geode-loader-${Date.now()}.zip`);
  try {
    await downloadFile(asset.browser_download_url, tempZip);
    const result = await extractZipViaTempAndCopy(tempZip, gameDir);
    if (!result.success && result.failed && result.failed.length) {
      const fe = formatGeodeLockError(result.failed, isGeometryDashRunning());
      const err = new Error(fe.message);
      err.code = fe.code;
      err.failedFiles = result.failed;
      throw err;
    }
    console.log(`[Geometry Dash] ✅ Geode loader actualizado → ${tag} (${asset.name})`);
    return { success: true, geodeTag: tag, geodeAsset: asset.name };
  } finally {
    try {
      if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
    } catch (_) {}
  }
}

// Función para extraer archivo ZIP (mod TikControl) — vía temp para no bloquear DLLs del juego.
async function extractZipFile(zipPath, destPath) {
  console.log(`[Geometry Dash] 📦 Extrayendo: ${zipPath}`);
  console.log(`[Geometry Dash] 📁 Destino: ${destPath}`);

  if (isGeometryDashRunning()) {
    return {
      success: false,
      code: 'geometrydash_game_running',
      error: 'Cierra Geometry Dash antes de instalar o actualizar el mod.'
    };
  }

  try {
    const result = await extractZipViaTempAndCopy(zipPath, destPath);
    if (!result.success && result.failed && result.failed.length) {
      const fe = formatGeodeLockError(result.failed, isGeometryDashRunning());
      return {
        success: false,
        code: fe.code,
        error: fe.message,
        failedFiles: result.failed
      };
    }
    console.log(`[Geometry Dash] ✅ Extracción completada`);
    return {
      success: true,
      extractedFiles: result.extractedFiles
    };
  } catch (zipError) {
    console.error('[Geometry Dash] ❌ Error con adm-zip:', zipError);

    try {
      const unrar = require('node-unrar-js');
      const buf = fs.readFileSync(zipPath);
      const extractor = unrar.createExtractorFromData({ data: buf });
      const extracted = extractor.extract();
      const files = [...extracted.files];

      const extractedFiles = [];
      for (const file of files) {
        if (file.extract && file.extract[1]) {
          const fileName = file.fileHeader.name;
          const fileData = file.extract[1];
          const fullPath = path.join(destPath, fileName);

          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.writeFileSync(fullPath, Buffer.from(fileData));
          extractedFiles.push(fileName);
        }
      }

      console.log(`[Geometry Dash] ✅ Extracción completada con node-unrar-js`);
      return {
        success: true,
        extractedFiles: extractedFiles
      };
    } catch (unrarError) {
      console.error('[Geometry Dash] ❌ Error con node-unrar-js:', unrarError);
      return {
        success: false,
        error: 'No se pudo extraer el archivo. Instala WinRAR o 7-Zip.',
        needsWinRAR: true,
        downloadUrl: 'https://www.win-rar.com/download.html',
        downloadUrl7Zip: 'https://www.7-zip.org/download.html'
      };
    }
  }
}

// Función principal de instalación
async function downloadAndInstallMod() {
  console.log('[Geometry Dash] 🎮 Iniciando instalación del mod...');

  // Intentar obtener la ruta desde el perfil activo
  if (!gamePath) {
    try {
      const { app } = require('electron');
      const profilesModule = require('../../../modules/profiles');

      // Obtener profileId activo desde el archivo de configuración
      const configPath = path.join(app.getPath('userData'), 'config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const activeProfileId = config.activeProfile;

        if (activeProfileId) {
          console.log('[Geometry Dash] 📋 Perfil activo:', activeProfileId);

          // Buscar la ruta en el perfil
          const profileData = profilesModule.getProfileData(activeProfileId);
          if (profileData && profileData.juegos && profileData.juegos.geometrydash) {
            const storedPath = profileData.juegos.geometrydash.gamePath;
            if (storedPath && fs.existsSync(storedPath)) {
              gamePath = storedPath;
              console.log('[Geometry Dash] ✅ Ruta cargada desde perfil:', gamePath);
            }
          }

          // Si no está en el perfil, buscar en electron-config.json (misma ruta que el resto de módulos)
          if (!gamePath) {
            const resolved = resolveGeometryDashPath(activeProfileId);
            if (resolved) {
              gamePath = resolved;
              console.log('[Geometry Dash] ✅ Ruta cargada (memoria / electron-config / perfil):', gamePath);
            }
          }
        }
      }
    } catch (e) {
      console.error('[Geometry Dash] ⚠️ Error cargando ruta desde configuración:', e);
    }
  }

  // Verificar que se haya configurado la ruta del juego
  if (!gamePath || !fs.existsSync(gamePath)) {
    console.error('[Geometry Dash] ❌ Ruta del juego no configurada');
    return {
      success: false,
      error: 'Por favor, configura la ruta del juego primero (botón "⚙️ Configurar Ruta")'
    };
  }

  if (isGeometryDashRunning()) {
    return {
      success: false,
      code: 'geometrydash_game_running',
      error: 'Cierra Geometry Dash antes de instalar el mod (evita archivos bloqueados).'
    };
  }

  const gameDir = resolveDir(gamePath);
  console.log('[Geometry Dash] 📁 Directorio del juego:', gameDir);

  const modUrl = GD_MOD_ZIP_URL;
  const tempZip = path.join(gameDir, 'GeometryDash_Mod_Temp.zip');

  try {
    // Descargar mod
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('geometrydash:install-progress', {
        message: '📥 Descargando mod... 0%'
      });
    }

    await downloadFile(modUrl, tempZip);

    // Extraer mod
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('geometrydash:install-progress', {
        message: '📦 Extrayendo archivos...'
      });
    }

    const extractResult = await extractZipFile(tempZip, gameDir);

    // Eliminar archivo temporal
    try {
      fs.unlinkSync(tempZip);
      console.log('[Geometry Dash] 🗑️ Archivo temporal eliminado');
    } catch (e) {
      console.warn('[Geometry Dash] ⚠️ No se pudo eliminar archivo temporal:', e);
    }

    if (extractResult.success) {
      writeGeometryDashTikControlMarker(gameDir);
      let geodeInfo = null;
      let geodeWarn = null;
      /**
       * Tras mod.zip: actualizar Geode desde GitHub por defecto.
       * - GD en Steam actualizado + Geode vieja del zip → crash (p. ej. CCFileUtils en Geode 4.x).
       * - Tras actualizar loader, el .geode de TikControl en mod.zip DEBE estar compilado para esa
       *   versión de Geode/SDK; si no, el juego abre pero TCP 33940 no responde → subir mod.zip nuevo.
       * Desactivar: TIKCONTROL_SKIP_GEODE_UPDATE=1 (conserva solo lo del zip).
       */
      const allowAutoGeode = process.env.TIKCONTROL_SKIP_GEODE_UPDATE !== '1';
      if (allowAutoGeode) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('geometrydash:install-progress', {
            message: '📥 Actualizando Geode (última versión desde GitHub)...'
          });
        }
        try {
          geodeInfo = await downloadLatestGeodeLoader(gameDir);
        } catch (ge) {
          geodeWarn = ge.message || String(ge);
          console.warn('[Geometry Dash] ⚠️ No se pudo actualizar Geode automáticamente:', geodeWarn);
        }
      } else {
        console.log(
          '[Geometry Dash] ℹ️ TIKCONTROL_SKIP_GEODE_UPDATE=1 → Geode del mod.zip sin sustituir (riesgo de crash con GD muy nuevo).'
        );
      }

      console.log(`[Geometry Dash] ✅ Mod instalado correctamente (${extractResult.extractedFiles.length} archivos)`);
      const baseMsg = `Mod instalado correctamente en ${gameDir}`;
      let message = baseMsg;
      if (geodeInfo) {
        message = `${baseMsg}. Geode actualizado a ${geodeInfo.geodeTag}.`;
      } else if (geodeWarn) {
        message = `${baseMsg}. Geode no se actualizó automáticamente: ${geodeWarn}`;
      } else if (!allowAutoGeode) {
        message = `${baseMsg}. Geode del paquete conservado (SKIP_GEODE).`;
      }
      return {
        success: true,
        message,
        filesExtracted: extractResult.extractedFiles.length,
        geode: geodeInfo || (geodeWarn ? { warning: geodeWarn } : null),
        geodeBundledKept: !allowAutoGeode && !geodeInfo
      };
    } else {
      return extractResult; // Retorna el error de extracción (needsWinRAR)
    }
  } catch (error) {
    console.error('[Geometry Dash] ❌ Error durante instalación:', error);

    // Eliminar archivo temporal si existe
    try {
      if (fs.existsSync(tempZip)) {
        fs.unlinkSync(tempZip);
      }
    } catch (e) { }

    return {
      success: false,
      error: `Error: ${error.message}`
    };
  }
}

// ==================== CONEXIÓN Y EFECTOS ====================


/** Ruta al JSON de efectos (el path antiguo apuntaba a game-mods/renderer/... y no existía). */
function resolveEffectsJsonPath() {
  const { app } = require('electron');
  const candidates = [
    path.join(__dirname, '../../../renderer/data/geometrydash-effects.json'),
    path.join(__dirname, '../../renderer/data/geometrydash-effects.json')
  ];
  try {
    if (app) {
      const ap = app.getAppPath();
      candidates.push(path.join(ap, 'renderer', 'data', 'geometrydash-effects.json'));
      if (app.isPackaged) {
        candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'renderer', 'data', 'geometrydash-effects.json'));
      }
    }
  } catch (_) {}
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch (_) {}
  }
  return null;
}

// Load effects from JSON
function loadEffects() {
  try {
    const effectsPath = resolveEffectsJsonPath();
    if (effectsPath) {
      const data = JSON.parse(fs.readFileSync(effectsPath, 'utf8'));
      effectsData = data;
      const n = Array.isArray(data.effects) ? data.effects.length : 0;
      console.log('[Geometry Dash] ✅ Efectos cargados:', n, `(${effectsPath})`);
      return n;
    }
    console.warn('[Geometry Dash] ⚠️ No se encontró geometrydash-effects.json (rutas probadas desde el módulo)');
  } catch (e) {
    console.error('[Geometry Dash] ❌ Error cargando efectos:', e);
  }
  return 0;
}

function getGeometryDashPort() {
  if (!effectsData) loadEffects();
  return effectsData?.port || 33941;
}

/** Comprueba si hay algo escuchando en host:port (el mod TikControl abre TCP en localhost). */
function probeTcpPort(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const finish = (ok) => {
      try {
        sock.destroy();
      } catch (_) {}
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
    sock.connect(port, host);
  });
}

/**
 * Revisa archivos Geode / mods .geode en la carpeta del juego (sin ejecutar GD).
 * @param {string} rawPath - Carpeta o ruta al .exe
 */
function diagnoseGeometryDashSetup(rawPath) {
  const port = getGeometryDashPort();
  const diag = {
    gameDir: null,
    pathExists: false,
    geodeDll: false,
    geodeLoaderDll: false,
    geodeFolder: false,
    modsDir: null,
    geodeMods: [],
    tikcontrolModLikely: false,
    port,
    hints: []
  };
  if (!rawPath || !fs.existsSync(rawPath)) {
    diag.hints.push('invalid_path');
    return diag;
  }
  diag.pathExists = true;
  const gameDir = resolveDir(rawPath);
  diag.gameDir = gameDir;
  diag.geodeDll = fs.existsSync(path.join(gameDir, 'Geode.dll'));
  diag.geodeLoaderDll = fs.existsSync(path.join(gameDir, 'GeodeLoader.dll'));
  diag.geodeFolder = fs.existsSync(path.join(gameDir, 'geode'));
  const modsDir = path.join(gameDir, 'geode', 'mods');
  diag.modsDir = modsDir;
  if (fs.existsSync(modsDir)) {
    try {
      diag.geodeMods = fs.readdirSync(modsDir).filter((f) => f.endsWith('.geode'));
      diag.tikcontrolModLikely = diag.geodeMods.some((f) =>
        /tikcontrol|crowd|tc[_-]?gd|tcgd/i.test(f)
      );
    } catch (e) {
      diag.modsReadError = e.message;
    }
  }
  diag.tikcontrolPackInstalled = isTikControlGeometryDashModInstalled(rawPath);
  if (!diag.geodeDll) diag.hints.push('no_geode_dll');
  if (!diag.geodeFolder) diag.hints.push('no_geode_folder');
  if (!diag.geodeMods.length) diag.hints.push('no_geode_mods');
  if (!diag.tikcontrolPackInstalled) diag.hints.push('tikcontrol_geode_not_found');
  return diag;
}

// ✅ CRITICAL: TikControl connects TO the mod (TikControl = CLIENT, Mod = SERVER)
/** @param {{ skipAutoReconnect?: boolean }} [opts] - si true, no programa reconexión (p. ej. durante ensureModConnection) */
function connectToMod(opts = {}) {
  const skipAutoReconnect = !!opts.skipAutoReconnect;

  if (tcpClient) {
    try {
      tcpClient.removeAllListeners();
      tcpClient.destroy();
    } catch (e) { }
    tcpClient = null;
  }

  if (!effectsData) loadEffects();
  const envPort = parseInt(process.env.TIKCONTROL_GD_TCP_PORT || '', 10);
  const PORT = Number.isFinite(envPort) && envPort > 0 ? envPort : getGeometryDashPort();
  const HOST = (process.env.TIKCONTROL_GD_HOST || '127.0.0.1').trim();

  console.log(`[Geometry Dash] 🔌 Conectando al mod en ${HOST}:${PORT}...`);

  tcpClient = new net.Socket();
  tcpClient.setKeepAlive(true);

  let buffer = '';

  tcpClient.connect(PORT, HOST, () => {
    isConnected = true;
    console.log('[Geometry Dash] ✅ Conectado al mod');

    // ✅ Send "ready" message immediately after connecting (SimpleTCPConnector protocol)
    try {
      const readyMessage = JSON.stringify({ type: 255 }) + '\n';
      tcpClient.write(readyMessage);
      console.log('[Geometry Dash] 📤 Enviado mensaje de inicialización (ready)');
    } catch (e) {
      console.error('[Geometry Dash] ❌ Error enviando mensaje ready:', e);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('geometrydash:connection', { connected: true });
    }

    // Clear reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  tcpClient.on('data', (data) => {
    buffer += data.toString();

    let lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line);
        if (parsed.status === 'ok') {
          console.log(`[Geometry Dash] ✅ Mod ACK: effect "${parsed.effect || 'handshake'}" applied`);
        } else if (parsed.status === 'error') {
          console.warn(`[Geometry Dash] ⚠️ Mod error: ${parsed.detail}`);
        } else {
          console.log('[Geometry Dash] 📨 Mod response:', parsed);
        }
      } catch (_) {
        console.log('[Geometry Dash] 📨 Mod response (text):', line);
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('geometrydash:response', { message: line });
      }
    }
  });

  tcpClient.on('error', (err) => {
    if (!skipAutoReconnect) {
      console.error('[Geometry Dash] ❌ Error de conexión:', err.message);
    }
    isConnected = false;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('geometrydash:connection', {
        connected: false,
        error: err.message
      });
    }

    if (!skipAutoReconnect && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        console.log('[Geometry Dash] 🔄 Intentando reconectar...');
        connectToMod();
      }, 3000);
    }
  });

  tcpClient.on('close', () => {
    if (!skipAutoReconnect) {
      console.log('[Geometry Dash] 🔌 Conexión cerrada');
    }
    isConnected = false;
    tcpClient = null;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('geometrydash:connection', { connected: false });
    }

    if (!skipAutoReconnect && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        console.log('[Geometry Dash] 🔄 Intentando reconectar...');
        connectToMod();
      }, 5000);
    }
  });
}

/**
 * Espera a tener socket TCP al mod (o inicia connectToMod y hace polling).
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
async function ensureModConnection(timeoutMs) {
  const defaultMs = parseInt(process.env.TIKCONTROL_GD_CONNECT_TIMEOUT_MS || '', 10);
  const ms =
    typeof timeoutMs === 'number' && timeoutMs > 0
      ? timeoutMs
      : Number.isFinite(defaultMs) && defaultMs > 0
        ? defaultMs
        : 25000;
  if (isConnected && tcpClient) return true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  console.log('[Geometry Dash] 🔌 Conectando al mod antes de enviar efecto...');
  connectToMod({ skipAutoReconnect: true });
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (isConnected && tcpClient) {
      console.log('[Geometry Dash] ✅ Listo para enviar efecto');
      return true;
    }
    await sleepMs(80);
  }
  const p = getGeometryDashPort();
  console.warn(
    `[Geometry Dash] ⚠️ Timeout (${ms}ms): nada escucha en TCP ${p}. ` +
      `Comprueba que el mod TikControl esté activo en Geode y GD reiniciado. ` +
      `Si la Geode es nueva pero el .geode de TikControl en mod.zip es antiguo, el mod no carga: ` +
      `hay que publicar un mod.zip con el .geode recompilado para esa SDK (ver docs/geometry-dash-tikcontrol.md).`
  );
  try {
    if (tcpClient) {
      tcpClient.removeAllListeners();
      tcpClient.destroy();
    }
  } catch (_) {}
  tcpClient = null;
  isConnected = false;
  return false;
}

async function sendEffectAsync(effectId, options = {}) {
  const ok = await ensureModConnection();
  if (!ok) {
    return { success: false, error: 'geometrydash_not_connected' };
  }
  return sendEffect(effectId, options);
}

// Send effect to game
function sendEffect(effectId, options = {}) {
  if (!isConnected || !tcpClient) {
    console.warn('[Geometry Dash] ⚠️ No conectado al juego');
    return { success: false, error: 'geometrydash_not_connected' };
  }

  try {
    // ✅ Find effect duration from effectsData
    let duration = 0;
    if (effectsData && effectsData.effects) {
      const effect = effectsData.effects.find(e => e.id === effectId);
      if (effect && effect.duration) {
        duration = effect.duration;
      }
    }

    // Override with custom duration if provided
    if (options.duration !== undefined) {
      duration = options.duration;
    }

    // ✅ SimpleTCPConnector protocol: JSON format
    const payload = {
      id: Math.floor(Math.random() * 1000000), // Request ID
      type: 0, // Effect type (0 = start effect)
      message: effectId, // Effect ID (e.g., "rotate3")
      viewer: options.viewer || "TikControl", // Viewer name
      duration: duration // Duration in seconds
    };

    const message = JSON.stringify(payload) + '\n';
    const bytesWritten = tcpClient.write(message);

    console.log(`[Geometry Dash] 📤 Efecto enviado:`, payload);
    console.log(`[Geometry Dash] 📤 Mensaje raw (${bytesWritten} bytes):`, JSON.stringify(message));
    return { success: true, effectId };
  } catch (e) {
    console.error('[Geometry Dash] ❌ Error enviando efecto:', e);
    return { success: false, error: e.message };
  }
}

// Disconnect from game
function disconnect() {
  console.log('[Geometry Dash] 🔌 Desconectando...');

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (tcpClient) {
    try {
      tcpClient.end();
      tcpClient.destroy();
    } catch (e) {
      console.error('[Geometry Dash] Error al cerrar conexión:', e);
    }
    tcpClient = null;
  }

  isConnected = false;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('geometrydash:connection', { connected: false });
  }
}

// Initialize IPC handlers
function registerIpcHandlers() {
  // Instalación: la pestaña Gaming llama installMod(profileId). Antes se confundía con ruta.
  ipcMain.handle('geometrydash:installMod', async (event, provided) => {
    if (provided && typeof provided === 'string') {
      if (_looksLikeFilesystemPath(provided) && fs.existsSync(provided)) {
        gamePath = provided;
        console.log('[Geometry Dash] ✅ installMod: ruta directa:', gamePath);
      } else {
        const resolved = resolveGeometryDashPath(provided);
        if (resolved) {
          gamePath = resolved;
          console.log('[Geometry Dash] ✅ installMod: ruta resuelta para perfil', provided, '→', gamePath);
        } else {
          console.warn('[Geometry Dash] ⚠️ installMod: sin ruta para perfil', provided);
        }
      }
    }
    return downloadAndInstallMod();
  });

  /** Solo actualiza Geode.dll / loader desde el último release de GitHub (sin re-descargar mod.zip). */
  ipcMain.handle('geometrydash:updateGeodeLoader', async (event, provided) => {
    if (provided && typeof provided === 'string') {
      if (_looksLikeFilesystemPath(provided) && fs.existsSync(provided)) {
        gamePath = provided;
        console.log('[Geometry Dash] ✅ updateGeodeLoader: ruta directa:', gamePath);
      } else {
        const resolved = resolveGeometryDashPath(provided);
        if (resolved) {
          gamePath = resolved;
          console.log('[Geometry Dash] ✅ updateGeodeLoader: perfil', provided, '→', gamePath);
        } else {
          console.warn('[Geometry Dash] ⚠️ updateGeodeLoader: sin ruta para perfil', provided);
        }
      }
    }
    if (!gamePath || !fs.existsSync(gamePath)) {
      return { success: false, error: 'Configura la ruta del juego primero (Gaming → Geometry Dash).' };
    }
    if (process.env.TIKCONTROL_SKIP_GEODE_UPDATE === '1') {
      return { success: false, error: 'Actualización de Geode desactivada (TIKCONTROL_SKIP_GEODE_UPDATE).' };
    }
    const gameDir = resolveDir(gamePath);
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('geometrydash:install-progress', {
          message: '📥 Actualizando Geode (GitHub)...'
        });
      }
      const geodeInfo = await downloadLatestGeodeLoader(gameDir);
      return { success: true, message: `Geode actualizado a ${geodeInfo.geodeTag}`, ...geodeInfo };
    } catch (e) {
      console.error('[Geometry Dash] ❌ updateGeodeLoader:', e);
      return {
        success: false,
        error: e.message || String(e),
        code: e.code
      };
    }
  });

  ipcMain.handle('geometrydash:uninstallMod', async (event, profileId) => {
    if (profileId && typeof profileId === 'string') {
      const resolved = resolveGeometryDashPath(profileId);
      if (resolved) gamePath = resolved;
    }
    try {
      const result = uninstallTikControlGeodeMod(profileId);
      if (!result.success) {
        console.warn('[Geometry Dash] ⚠️ uninstallMod:', result);
      } else {
        console.log('[Geometry Dash] ✅ uninstallMod:', result.message);
      }
      return result;
    } catch (e) {
      console.error('[Geometry Dash] ❌ uninstallMod:', e);
      return { success: false, error: e.message || String(e), code: 'uninstall_error' };
    }
  });

  ipcMain.handle('geometrydash:getPackStatus', async (event, profileId) => {
    let p = gamePath;
    if (profileId && typeof profileId === 'string') {
      const resolved = resolveGeometryDashPath(profileId);
      if (resolved) p = resolved;
    }
    if (!p || !fs.existsSync(p)) {
      return { installed: false, gamePath: null };
    }
    return {
      installed: isTikControlGeometryDashModInstalled(p),
      gamePath: resolveDir(p)
    };
  });

  ipcMain.handle('geometrydash:diagnose', async (event, profileId) => {
    let p = gamePath;
    if (profileId && typeof profileId === 'string') {
      const resolved = resolveGeometryDashPath(profileId);
      if (resolved) p = resolved;
    }
    if (!p || !fs.existsSync(p)) {
      return {
        success: false,
        error: 'no_path',
        message: 'Configura la ruta del juego primero (Gaming → Geometry Dash).'
      };
    }
    if (!effectsData) loadEffects();
    const diag = diagnoseGeometryDashSetup(p);
    const port = diag.port || 33941;
    diag.portAcceptsTcp = await probeTcpPort('127.0.0.1', port, 3000);
    diag.geometryDashRunning = isGeometryDashRunning();
    if (!diag.portAcceptsTcp) diag.hints.push('port_not_listening');
    if (!diag.portAcceptsTcp && !diag.geometryDashRunning) {
      diag.hints.push('start_geometry_dash_first');
    }
    if (!diag.portAcceptsTcp && diag.geometryDashRunning) {
      diag.hints.push('mod_tcp_dead_game_running');
    }
    console.log(
      '[Geometry Dash] 🔎 Diagnóstico:',
      JSON.stringify({
        gameDir: diag.gameDir,
        geodeDll: diag.geodeDll,
        geodeModsCount: diag.geodeMods?.length,
        tikcontrolModLikely: diag.tikcontrolModLikely,
        geometryDashRunning: diag.geometryDashRunning,
        port,
        portAcceptsTcp: diag.portAcceptsTcp
      })
    );
    return { success: true, diag };
  });

  ipcMain.handle('geometrydash:setGamePath', async (event, a, b) => {
    const { profileId, path: newPath } = resolveSetGamePathArgs(a, b);
    if (!newPath || typeof newPath !== 'string' || !fs.existsSync(newPath)) {
      console.error('[Geometry Dash] ❌ Ruta inválida o inexistente:', newPath);
      return { success: false, error: 'La ruta no existe' };
    }
    gamePath = newPath;
    console.log('[Geometry Dash] ✅ Ruta del juego guardada:', gamePath, profileId ? `(perfil ${profileId})` : '');
    if (profileId) persistGeometryDashPath(profileId, gamePath);
    return { success: true, path: gamePath };
  });

  ipcMain.handle('geometrydash:getGamePath', async (event, profileId) => {
    const resolved = resolveGeometryDashPath(profileId) || (gamePath && fs.existsSync(gamePath) ? gamePath : null);
    return { path: resolved };
  });

  ipcMain.handle('geometrydash:selectGamePath', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Seleccionar ejecutable de Geometry Dash',
        filters: [
          { name: 'Ejecutable', extensions: ['exe'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      gamePath = result.filePaths[0];
      console.log('[Geometry Dash] ✅ Ruta seleccionada:', gamePath);
      return { success: true, path: gamePath };
    } catch (e) {
      console.error('[Geometry Dash] ❌ Error seleccionando ruta:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('geometrydash:connect', async () => {
    try {
      connectToMod();
      return { success: true };
    } catch (e) {
      console.error('[Geometry Dash] Error al conectar:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('geometrydash:disconnect', async () => {
    try {
      disconnect();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('geometrydash:sendEffect', async (event, { effectId, viewer, duration }) => {
    return sendEffectAsync(effectId, { viewer, duration });
  });

  ipcMain.handle('geometrydash:getEffects', async () => {
    return {
      success: true,
      effects: effectsData?.effects || [],
      categories: effectsData?.categories || {},
      game: {
        name: effectsData?.game || 'Geometry Dash',
        modRequired: effectsData?.modRequired || true,
        modUrl: effectsData?.modUrl,
        uninstaller: effectsData?.uninstaller,
        guide: effectsData?.guide
      }
    };
  });

  ipcMain.handle('geometrydash:isConnected', async () => {
    return { connected: isConnected };
  });

  ipcMain.handle('geometrydash:launchGame', async () => {
    try {
      const { shell } = require('electron');
      await shell.openExternal('steam://rungameid/322170');
      return { success: true, method: 'steam' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  console.log('[Geometry Dash] ✅ IPC handlers registrados');
}

// Initialize module
function initialize(window) {
  console.log('[Geometry Dash] 🚀 Inicializando módulo...');
  mainWindow = window;

  const effectCount = loadEffects();
  registerIpcHandlers();

  // ❌ NO auto-conectar - el usuario debe conectarse manualmente desde la pestaña de juegos
  // connectToMod();

  console.log('[Geometry Dash] ✅ Módulo inicializado (esperando conexión manual)');
  console.log(`[Geometry Dash] 📊 ${effectCount} efectos disponibles`);

  return {
    name: 'Geometry Dash',
    effectCount,
    modRequired: true,
    modFramework: 'Geode SDK',
    protocol: 'TCP Client',
    port: effectsData?.port || 33941
  };
}

// Cleanup on app quit
function cleanup() {
  console.log('[Geometry Dash] 🧹 Limpiando recursos...');
  disconnect();
}

module.exports = {
  initialize,
  cleanup,
  connect: connectToMod,
  disconnect,
  sendEffect: sendEffectAsync,
  isConnected: () => isConnected
};
