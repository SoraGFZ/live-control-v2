// Módulo principal para gestionar GTA V Chaos Mod
// Maneja la conexión, instalación y configuración del mod

const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { exec, execFile } = require('child_process');
const GTAVChaosService = require('./gtavChaosService');

let chaosService = null;
let mainWindow = null;

// Rutas de instalación - Descarga desde Cloudflare R2
const MOD_DOWNLOAD_URL = 'https://storage.tikcontrol.live/games/gtav-chaos/ChaosMod.zip?v=v78';
const MOD_FILE_NAME = 'ChaosMod.zip';
const MOD_VERSION = 'v78';

// URL de fallback para descarga manual
const MOD_MANUAL_DOWNLOAD_URL = 'https://storage.tikcontrol.live/games/gtav-chaos/ChaosMod.zip?v=v78';

// ScriptHook V - Descarga desde nuestro storage
const SCRIPTHOOK_DOWNLOAD_URL = 'https://storage.tikcontrol.live/games/gtav-chaos/ScriptHookV.zip';
const SCRIPTHOOK_MANUAL_URL = 'http://www.dev-c.com/gtav/scripthookv/';
const SCRIPTHOOK_FILES = ['ScriptHookV.dll', 'dinput8.dll'];

// Archivos clave del mod para detectar instalación
const MOD_KEY_FILES = [
  'ChaosMod.asi',
  'ScriptHookV.dll',
  'dinput8.dll',
  'ScriptHookVDotNet.asi',
  'ScriptHookVDotNet2.dll',
  'ScriptHookVDotNet3.dll',
  'scripts/GTAVWebhook.dll',
  'scripts/System.Net.Http.dll',
  'scripts/System.Web.dll'
];

const MOD_PACKAGE_FILES = [
  ...MOD_KEY_FILES,
  'ScriptHookVDotNet.ini',
  'ScriptHookVDotNet.pdb',
  'ScriptHookVDotNet2.pdb',
  'ScriptHookVDotNet3.pdb',
  'xinput1_4.dll',
  'MinHook.x64.dll',
  'Menyoo.asi',
  'NativeTrainer.asi',
  'OpenRPF.asi',
  'README.txt',
  'License.txt',
  'args.txt',
  'changelogs.txt',
  'menyooLog.txt',
  'ScriptHookV.log',
  'ScriptHookVDotNet.log',
  'scripts/config.yml',
  'scripts/gameconfig.xml',
  'scripts/TikControlPlateFix.dll.disable'
];

const MOD_PACKAGE_DIRECTORIES = [
  'chaosmod',
  'Docs',
  'Licenses',
  'menyooStuff'
];

const MOD_EMPTY_DIRECTORIES = [
  'scripts/maps',
  'scripts/parkour',
  'scripts'
];

function ascii(codes) {
  return String.fromCharCode(...codes);
}

const LEGACY_BRAND = ascii([83, 116, 114, 101, 97, 109, 84, 111, 69, 97, 114, 110]);
const LEGACY_BRAND_DOT_IO = `${LEGACY_BRAND}.io`;
const LEGACY_BRAND_DOT_IO_LOWER = ascii([115, 116, 114, 101, 97, 109, 116, 111, 101, 97, 114, 110, 46, 105, 111]);
const LEGACY_SHORT_NAME = ascii([83, 50, 69]);
const LEGACY_SHORT_NAME_LOWER = ascii([115, 50, 101]);

const LEGACY_INFO_FILES = [
  ascii([115, 50, 101, 95, 105, 110, 102, 111, 46, 106, 115, 111, 110]),
  ascii([115, 50, 101, 95, 103, 116, 97, 53, 95, 99, 104, 97, 111, 115, 95, 105, 110, 102, 111, 46, 106, 115, 111, 110])
];

const MOD_METADATA_FILES = [
  'TikControl_ChaosModManifest.json',
  'TikControl_GTA5_info.json',
  'TikControl_GTA5Chaos_info.json',
  ...LEGACY_INFO_FILES
];

function getGamePathStorePath() {
  return path.join(app.getPath('userData'), 'gtav-game-paths.json');
}

function readGamePathStore() {
  try {
    const file = getGamePathStorePath();
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writeGamePathStore(data) {
  const file = getGamePathStorePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data || {}, null, 2));
}

function normalizeProfileId(profileId) {
  return profileId ? String(profileId) : 'default';
}

function getKnownGTAVPath() {
  const store = readGamePathStore();
  const candidates = [
    store.default,
    ...Object.values(store || {}),
    'C:\\Program Files\\Epic Games\\GTAV',
    'C:\\Program Files (x86)\\Epic Games\\GTAV',
    'C:\\Program Files\\Rockstar Games\\Grand Theft Auto V',
    'C:\\Program Files (x86)\\Rockstar Games\\Grand Theft Auto V',
    'C:\\Program Files\\Steam\\steamapps\\common\\Grand Theft Auto V',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto V',
    'D:\\Program Files\\Epic Games\\GTAV',
    'D:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V',
    'E:\\Program Files\\Epic Games\\GTAV',
    'E:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V'
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const normalized = String(candidate).replace(/[/\\]GTA5\.exe$/i, '');
      if (fs.existsSync(path.join(normalized, 'GTA5.exe'))) return normalized;
    } catch (_) {}
  }

  return '';
}

function getGTAVRuntimeIssue() {
  try {
    const gamePath = getKnownGTAVPath();
    if (!gamePath) return null;

    const shvdnLog = path.join(gamePath, 'ScriptHookVDotNet.log');
    if (!fs.existsSync(shvdnLog)) return null;

    const content = fs.readFileSync(shvdnLog, 'utf8');
    const startNeedle = 'Started script GTAVWebhook.GTAVWebHookScript';
    const abortNeedle = 'Aborted script GTAVWebhook.GTAVWebHookScript';
    const exceptionNeedle = 'The exception was thrown while executing the script GTAVWebhook.GTAVWebHookScript';
    const lastStart = content.lastIndexOf(startNeedle);
    const lastAbort = content.lastIndexOf(abortNeedle);
    const lastException = content.lastIndexOf(exceptionNeedle);

    if (lastAbort > -1 && lastAbort > lastStart) {
      return {
        code: 'gtav_webhook_aborted',
        gamePath,
        logPath: shvdnLog,
        message: 'GTAVWebhook se ha caido dentro de GTA V. Reinicia GTA V para volver a cargar el script.',
        detail: abortNeedle
      };
    }

    if (lastException > -1 && lastException > lastStart) {
      return {
        code: 'gtav_webhook_exception',
        gamePath,
        logPath: shvdnLog,
        message: 'GTAVWebhook lanzo una excepcion dentro de GTA V. Reinicia GTA V si los comandos no hacen efecto.',
        detail: exceptionNeedle
      };
    }
  } catch (e) {
    return {
      code: 'gtav_runtime_check_failed',
      message: `No se pudo revisar el estado interno de GTA V: ${e.message}`
    };
  }

  return null;
}

function hasGTAVHttpBridge(status) {
  return !!(
    status &&
    (
      status.httpChaos ||
      status.httpKoth ||
      status.httpTrain ||
      status.httpPrison ||
      status.httpRace
    )
  );
}

function withRuntimeHealth(status) {
  const runtimeIssue = getGTAVRuntimeIssue();
  if (!runtimeIssue) {
    return { ...status, runtimeHealthy: true, runtimeIssue: null, runtimeIssueWarning: null };
  }

  if (hasGTAVHttpBridge(status)) {
    return {
      ...status,
      connected: true,
      runtimeHealthy: true,
      runtimeIssue: null,
      runtimeIssueWarning: runtimeIssue
    };
  }

  return {
    ...status,
    connected: false,
    runtimeHealthy: false,
    runtimeIssue,
    runtimeIssueWarning: null
  };
}

function readGTAVManifest(gtavPath) {
  try {
    const manifestPath = path.join(gtavPath, 'TikControl_ChaosModManifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function getVersionRank(version) {
  const match = String(version || '').match(/(\d+)/g);
  if (!match || match.length === 0) return null;
  return Number(match[match.length - 1]);
}

function isOutdatedGTAVVersion(installedVersion, targetVersion) {
  if (!installedVersion) return true;
  if (installedVersion === targetVersion) return false;

  const installedRank = getVersionRank(installedVersion);
  const targetRank = getVersionRank(targetVersion);
  if (installedRank !== null && targetRank !== null) {
    return installedRank < targetRank;
  }

  return true;
}

function getGTAVModInstallState(gtavPath) {
  if (!gtavPath) {
    return { installed: false, valid: false, error: 'No se proporciono ruta del juego' };
  }

  const normalizedPath = String(gtavPath).replace(/[/\\]GTA5\.exe$/i, '');
  const gtavExe = path.join(normalizedPath, 'GTA5.exe');
  if (!fs.existsSync(gtavExe)) {
    return { installed: false, valid: false, error: 'No se encontro GTA5.exe' };
  }

  const installedFiles = [];
  const missingFiles = [];
  for (const file of MOD_KEY_FILES) {
    const filePath = path.join(normalizedPath, file);
    if (fs.existsSync(filePath)) installedFiles.push(file);
    else missingFiles.push(file);
  }

  const manifest = readGTAVManifest(normalizedPath);
  const installed = missingFiles.length === 0;
  const partialInstall = installedFiles.length > 0 && missingFiles.length > 0;
  const installedVersion = manifest?.version || (installed ? 'legacy' : null);
  const targetVersion = MOD_VERSION;
  const needsUpdate = installed && isOutdatedGTAVVersion(installedVersion, targetVersion);

  return {
    installed,
    valid: true,
    path: normalizedPath,
    installedFiles,
    missingFiles,
    manifest,
    fullInstall: installed,
    partialInstall,
    installedVersion,
    targetVersion,
    needsUpdate,
    updateAvailable: needsUpdate
  };
}

function normalizeRelativeInstallPath(relativePath) {
  return String(relativePath || '')
    .replace(/^[\\/]+/, '')
    .replace(/[\\/]+$/, '');
}

function uniqueRelativePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const raw of paths || []) {
    const normalized = normalizeRelativeInstallPath(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function resolveSafeGTAVTarget(gtavPath, relativePath) {
  const base = path.resolve(gtavPath);
  const target = path.resolve(base, relativePath);
  if (target !== base && target.startsWith(base + path.sep)) return target;
  throw new Error(`Ruta fuera de GTA V bloqueada: ${relativePath}`);
}

function isRecursiveGTAVPackageDir(relativePath) {
  const normalized = normalizeRelativeInstallPath(relativePath).toLowerCase();
  return MOD_PACKAGE_DIRECTORIES.some(dir => {
    const root = dir.toLowerCase();
    return normalized === root || normalized.startsWith(root + path.sep.toLowerCase()) || normalized.startsWith(root + '/');
  });
}

function getGTAVUninstallTargets(manifest) {
  return uniqueRelativePaths([
    ...(Array.isArray(manifest?.files) ? manifest.files : []),
    ...MOD_PACKAGE_FILES,
    ...MOD_METADATA_FILES,
    ...MOD_PACKAGE_DIRECTORIES,
    ...MOD_EMPTY_DIRECTORIES
  ]).sort((a, b) => b.split(/[\\/]+/).length - a.split(/[\\/]+/).length);
}

function deleteGTAVTarget(gtavPath, relativePath) {
  const fullPath = resolveSafeGTAVTarget(gtavPath, relativePath);
  if (!fs.existsSync(fullPath)) return { deleted: false, missing: true };

  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) {
    if (isRecursiveGTAVPackageDir(relativePath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      return { deleted: true };
    }

    const contents = fs.readdirSync(fullPath);
    if (contents.length === 0) {
      fs.rmdirSync(fullPath);
      return { deleted: true };
    }

    return { deleted: false, skipped: true, reason: 'directory_not_empty' };
  }

  fs.rmSync(fullPath, { force: true });
  return { deleted: true };
}

function writeJsonIfPossible(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.warn('[GTA V Chaos] No se pudo escribir metadata TikControl:', filePath, e.message);
    return false;
  }
}

function replaceTextIfPossible(filePath, replacements) {
  try {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    for (const [from, to] of replacements) {
      content = content.split(from).join(to);
    }
    if (content === original) return false;
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (e) {
    console.warn('[GTA V Chaos] No se pudo limpiar texto legacy:', filePath, e.message);
    return false;
  }
}

function patchBinaryAsciiString(filePath, from, to) {
  try {
    if (!fs.existsSync(filePath) || to.length > from.length) return false;
    const buffer = fs.readFileSync(filePath);
    const fromBuffer = Buffer.from(from, 'ascii');
    let index = buffer.indexOf(fromBuffer);
    if (index === -1) return false;

    const toBuffer = Buffer.alloc(fromBuffer.length, 0);
    Buffer.from(to, 'ascii').copy(toBuffer);
    let patched = false;
    while (index !== -1) {
      toBuffer.copy(buffer, index);
      patched = true;
      index = buffer.indexOf(fromBuffer, index + fromBuffer.length);
    }

    if (!patched) return false;
    fs.writeFileSync(filePath, buffer);
    return true;
  } catch (e) {
    console.warn('[GTA V Chaos] No se pudo parchear branding legacy:', filePath, e.message);
    return false;
  }
}

function patchBinaryUtf16String(filePath, from, to) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const fromBuffer = Buffer.from(from, 'utf16le');
    if (to.length > from.length) return false;
    const buffer = fs.readFileSync(filePath);
    let index = buffer.indexOf(fromBuffer);
    if (index === -1) return false;

    const toBuffer = Buffer.alloc(fromBuffer.length, 0);
    Buffer.from(to, 'utf16le').copy(toBuffer);
    let patched = false;
    while (index !== -1) {
      toBuffer.copy(buffer, index);
      patched = true;
      index = buffer.indexOf(fromBuffer, index + fromBuffer.length);
    }

    if (!patched) return false;
    fs.writeFileSync(filePath, buffer);
    return true;
  } catch (e) {
    console.warn('[GTA V Chaos] No se pudo parchear branding UTF-16:', filePath, e.message);
    return false;
  }
}

function runNetshUrlAcl(url, user) {
  return new Promise((resolve) => {
    execFile('netsh', ['http', 'add', 'urlacl', `url=${url}`, `user=${user}`], { windowsHide: true }, (error, stdout = '', stderr = '') => {
      const output = `${stdout}\n${stderr}`.trim();
      if (!error || /already exists|ya existe|existe|cannot create a file when that file already exists/i.test(output)) {
        resolve({ success: true, url, user, output });
        return;
      }
      resolve({ success: false, url, user, error: output || error.message });
    });
  });
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))];
}

function getCurrentWindowsUserCandidates() {
  const username = process.env.USERNAME;
  const userDomain = process.env.USERDOMAIN;
  const computerName = process.env.COMPUTERNAME;

  return uniqueStrings([
    userDomain && username ? `${userDomain}\\${username}` : '',
    computerName && username ? `${computerName}\\${username}` : '',
    username || ''
  ]);
}

function httpAccessNeedsAdmin(warnings = []) {
  return warnings.some(({ attempts = [] }) =>
    attempts.some(({ error = '' }) =>
      /elevated|administrador|administrator|access is denied|acceso denegado|privileg|740/i.test(String(error))
    )
  );
}

async function configureGTAVHttpAccess() {
  const ports = [6720, 6721, 6722, 6723];
  const hosts = ['127.0.0.1', 'localhost'];
  const users = uniqueStrings([
    ...getCurrentWindowsUserCandidates(),
    'Everyone',
    'Todos',
    'Users',
    'Usuarios'
  ]);
  const result = { success: true, configured: [], warnings: [], needsAdmin: false };

  for (const port of ports) {
    for (const host of hosts) {
      const url = `http://${host}:${port}/`;
      let configured = false;
      const attempts = [];

      for (const user of users) {
        const attempt = await runNetshUrlAcl(url, user);
        attempts.push(attempt);
        if (attempt.success) {
          result.configured.push({ url, user });
          configured = true;
          break;
        }
      }

      if (!configured) {
        result.success = false;
        result.warnings.push({ url, attempts });
      }
    }
  }

  result.needsAdmin = httpAccessNeedsAdmin(result.warnings);
  return result;
}

function sanitizeGTAVModInstall(gtavPath) {
  const result = {
    removedLegacyFiles: [],
    writtenMetadata: [],
    patchedFiles: []
  };

  if (!gtavPath || !fs.existsSync(gtavPath)) return result;

  const removeLegacyBackups = (directory) => {
    let entries = [];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        removeLegacyBackups(entryPath);
        continue;
      }

      if (!entry.name.endsWith('.tikcontrol.bak')) continue;

      try {
        fs.unlinkSync(entryPath);
        result.removedLegacyFiles.push(path.relative(gtavPath, entryPath));
      } catch (e) {
        console.warn('[GTA V Chaos] No se pudo eliminar backup legacy:', entryPath, e.message);
      }
    }
  };

  removeLegacyBackups(gtavPath);

  const infoPath = path.join(gtavPath, 'TikControl_GTA5_info.json');
  if (writeJsonIfPossible(infoPath, {
    versionName: 'TikControl',
    info: 'tikcontrol.live',
    game: 'GTA5'
  })) {
    result.writtenMetadata.push(path.basename(infoPath));
  }

  const chaosInfoPath = path.join(gtavPath, 'TikControl_GTA5Chaos_info.json');
  if (writeJsonIfPossible(chaosInfoPath, {
    versionName: 'TikControl',
    info: 'tikcontrol.live',
    game: 'GTA5Chaos'
  })) {
    result.writtenMetadata.push(path.basename(chaosInfoPath));
  }

  for (const legacyInfoFile of LEGACY_INFO_FILES) {
    const metadataPath = path.join(gtavPath, legacyInfoFile);
    if (!fs.existsSync(metadataPath)) continue;
    try {
      fs.unlinkSync(metadataPath);
      result.removedLegacyFiles.push(legacyInfoFile);
    } catch (e) {
      console.warn('[GTA V Chaos] No se pudo eliminar metadata legacy:', metadataPath, e.message);
    }
  }

  const textReplacements = [
    [LEGACY_BRAND_DOT_IO, 'TikControl'],
    [LEGACY_BRAND_DOT_IO_LOWER, 'tikcontrol.live'],
    [LEGACY_BRAND, 'TikControl'],
    [LEGACY_SHORT_NAME, 'TikControl'],
    [LEGACY_SHORT_NAME_LOWER, 'TikControl']
  ];

  for (const relativePath of [
    'README.txt',
    'changelogs.txt',
    path.join('scripts', 'config.yml'),
    path.join('chaosmod', 'README', 'credits.txt')
  ]) {
    const filePath = path.join(gtavPath, relativePath);
    if (replaceTextIfPossible(filePath, textReplacements)) {
      result.patchedFiles.push(relativePath);
    }
  }

  const binaryReplacements = [
    [`https://app.${LEGACY_BRAND_DOT_IO_LOWER}`, 'https://tikcontrol.live'],
    [LEGACY_BRAND_DOT_IO_LOWER, 'tikcontrol.live'],
    [`${LEGACY_BRAND_DOT_IO} edition`, 'TikControl edition'],
    [`${ascii([84, 105, 107, 84, 111, 107])} ${ascii([105, 110, 116, 101, 114, 97, 99, 116, 105, 118, 101])}`, 'TikControl command'],
    [`"${LEGACY_SHORT_NAME_LOWER}`, '"TIK'],
    [`"${LEGACY_SHORT_NAME}`, '"TIK'],
    ['TC-GTAV\0', 'TIK-GTAV'],
    [`${LEGACY_SHORT_NAME}-GTAV`, 'TIK-GTAV']
  ];

  const binaryUtf16Replacements = [
    [`https://app.${LEGACY_BRAND_DOT_IO_LOWER}`, 'https://tikcontrol.live'],
    [LEGACY_BRAND_DOT_IO_LOWER, 'tikcontrol.live'],
    [`${ascii([84, 105, 107, 84, 111, 107])} ${ascii([105, 110, 116, 101, 114, 97, 99, 116, 105, 118, 101])}`, 'TikControl command']
  ];

  for (const relativePath of [
    'ChaosMod.asi',
    'GTAVWebhook.dll',
    path.join('scripts', 'GTAVWebhook.dll')
  ]) {
    const filePath = path.join(gtavPath, relativePath);
    let patchedFile = false;
    for (const [from, to] of binaryReplacements) {
      patchedFile = patchBinaryAsciiString(filePath, from, to) || patchedFile;
    }
    for (const [from, to] of binaryUtf16Replacements) {
      patchedFile = patchBinaryUtf16String(filePath, from, to) || patchedFile;
    }
    if (patchedFile) {
      result.patchedFiles.push(relativePath);
    }
  }

  return result;
}

function init(mainWin) {
  mainWindow = mainWin;
  
  // Inicializar servicio
  chaosService = new GTAVChaosService();
  
  // Reenviar eventos al renderer
  chaosService.on('status', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gtav:status', status);
    }
  });
  
  chaosService.on('connected', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gtav:connected', data);
    }
  });
  
  chaosService.on('disconnected', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gtav:disconnected', data);
    }
  });
  
  chaosService.on('scriptsAvailable', (scripts) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gtav:scriptsAvailable', scripts);
    }
  });
  
  chaosService.on('message', (message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gtav:message', message);
    }
  });
  
  chaosService.on('debug', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gtav:debug', data);
    }
  });
  
  // Handlers IPC
  setupIPCHandlers();
  
  console.log('[GTA V Chaos] Módulo inicializado');
}

function setupIPCHandlers() {
  ipcMain.handle('gtav:launchGame', async () => {
    try {
      const { shell } = require('electron');
      await shell.openExternal('steam://rungameid/271590');
      return { success: true, method: 'steam' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('gtav:setGamePath', async (event, profileIdOrPath, maybePath) => {
    try {
      const profileId = maybePath ? normalizeProfileId(profileIdOrPath) : 'default';
      const gamePath = maybePath || profileIdOrPath;
      if (!gamePath || typeof gamePath !== 'string') {
        return { success: false, error: 'No se proporcionó ruta de GTA V' };
      }
      const normalizedPath = gamePath.replace(/[/\\]GTA5\.exe$/i, '');
      if (!fs.existsSync(path.join(normalizedPath, 'GTA5.exe'))) {
        return { success: false, error: 'No se encontró GTA5.exe en esa carpeta' };
      }
      const store = readGamePathStore();
      store[profileId] = normalizedPath;
      store.default = normalizedPath;
      writeGamePathStore(store);
      return { success: true, gamePath: normalizedPath, path: normalizedPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('gtav:getGamePath', async (event, profileId = 'default') => {
    try {
      const store = readGamePathStore();
      const gamePath = store[normalizeProfileId(profileId)] || store.default || '';
      if (!gamePath) return { success: false, gamePath: '', path: '' };
      return { success: true, gamePath, path: gamePath };
    } catch (e) {
      return { success: false, error: e.message, gamePath: '', path: '' };
    }
  });

  // Conectar al mod
  ipcMain.handle('gtav:connect', async (event, config) => {
    try {
      const result = await chaosService.connect(config || {});
      return { success: result };
    } catch (e) {
      console.error('[GTA V Chaos] Error al conectar:', e);
      return { success: false, error: e.message };
    }
  });
  
  // Desconectar
  ipcMain.handle('gtav:disconnect', async () => {
    try {
      chaosService.disconnect();
      return { success: true };
    } catch (e) {
      console.error('[GTA V Chaos] Error al desconectar:', e);
      return { success: false, error: e.message };
    }
  });
  
  // Obtener estado
  ipcMain.handle('gtav:getStatus', async () => {
    return withRuntimeHealth(chaosService.getStatus());
  });
  
  // Ejecutar script
  ipcMain.handle('gtav:executeScript', async (event, scriptId, params) => {
    try {
      const runtimeIssue = getGTAVRuntimeIssue();
      const result = await chaosService.executeScript(scriptId, params);
      if (!runtimeIssue || !result || typeof result !== 'object') return result;

      return {
        ...result,
        runtimeIssue: result.success ? null : runtimeIssue,
        runtimeIssueWarning: result.success ? runtimeIssue : null,
        error: result.success ? result.error : (result.error || runtimeIssue.message)
      };
    } catch (e) {
      console.error('[GTA V Chaos] Error ejecutando script:', e);
      return { success: false, error: e.message };
    }
  });
  
  // Obtener scripts/comandos disponibles
  ipcMain.handle('gtav:getScripts', async (event, options = {}) => {
    try {
      const mode = options.mode || 'chaos'; // 'chaos' o 'koth'
      
      if (mode === 'koth') {
        // ✅ SIEMPRE recargar comandos de KOTH desde el JSON actualizado
        const fs = require('fs');
        const path = require('path');
        const commandsPath = path.join(__dirname, '..', 'renderer', 'data', 'tikcontrol-gtav-koth-commands.json');
        
        if (fs.existsSync(commandsPath)) {
          const commandsData = fs.readFileSync(commandsPath, 'utf8');
          const data = JSON.parse(commandsData);
          
          if (data.commands && Array.isArray(data.commands)) {
            // Formatear para el frontend, manteniendo el objeto multiidioma
            const scripts = data.commands.map(cmd => ({
              id: cmd.command,
              name: cmd.name, // ✅ Mantener el objeto multiidioma completo
              description: cmd.description || '',
              category: cmd.category || 'Misc'
            }));
            
            console.log('[GTA V KOTH] ✅ Comandos recargados desde JSON:', scripts.length);
            return { success: true, scripts };
          }
        }
        
        console.warn('[GTA V KOTH] ⚠️ Archivo de comandos no encontrado');
        return { success: true, scripts: [] };
      } else {
        // ✅ Modo Chaos - SIEMPRE recargar desde el JSON actualizado
        const fs = require('fs');
        const path = require('path');
        const commandsPath = path.join(__dirname, '..', 'renderer', 'data', 'tikcontrol-gtav-chaos-commands.json');
        
        let scripts = [];
        
        if (fs.existsSync(commandsPath)) {
          try {
            const commandsData = fs.readFileSync(commandsPath, 'utf8');
            const data = JSON.parse(commandsData);
            
            if (data.commands && Array.isArray(data.commands)) {
              // Formatear para el frontend, manteniendo el objeto multiidioma
              scripts = data.commands.map(cmd => ({
                id: cmd.command,
                name: cmd.name, // ✅ Mantener el objeto multiidioma completo
                description: cmd.description || '',
                category: cmd.category || 'Misc'
              }));
              
              console.log('[GTA V Chaos] ✅ Comandos recargados desde JSON:', scripts.length);
            }
          } catch (readError) {
            console.error('[GTA V Chaos] ❌ Error recargando comandos:', readError);
            // Fallback al servicio si falla la recarga
            scripts = chaosService.getAvailableScripts();
          }
        } else {
          // Fallback al servicio si no existe el archivo
          scripts = chaosService.getAvailableScripts();
        }
        
        // Si aún no hay scripts, intentar cargar desde los archivos locales antiguos
        if (!scripts || scripts.length === 0) {
          scripts = await loadScriptsFromLocal();
        }
        
        return { success: true, scripts };
      }
    } catch (e) {
      console.error('[GTA V] Error obteniendo scripts/comandos:', e);
      return { success: false, error: e.message, scripts: [] };
    }
  });
  
  // Solicitar scripts al mod
  ipcMain.handle('gtav:requestScripts', async () => {
    try {
      chaosService.requestAvailableScripts();
      return { success: true };
    } catch (e) {
      console.error('[GTA V Chaos] Error solicitando scripts:', e);
      return { success: false, error: e.message };
    }
  });
  
  // Detener todos los efectos
  ipcMain.handle('gtav:stopAll', async () => {
    try {
      const result = typeof chaosService.stopAllEffects === 'function'
        ? chaosService.stopAllEffects()
        : chaosService.stopAllScripts();
      return { success: result };
    } catch (e) {
      console.error('[GTA V Chaos] Error deteniendo efectos:', e);
      return { success: false, error: e.message };
    }
  });
  
  // Verificar si GTA V está ejecutándose
  async function isGTAVRunning() {
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      exec('tasklist /FI "IMAGENAME eq GTA5.exe"', (error, stdout) => {
        resolve(stdout.toLowerCase().includes('gta5.exe'));
      });
    });
  }
  
  // Descargar mod
  ipcMain.handle('gtav:downloadMod', async () => {
    try {
      // Verificar que la URL esté configurada
      if (!MOD_DOWNLOAD_URL || MOD_DOWNLOAD_URL.includes('USUARIO') || MOD_DOWNLOAD_URL.includes('XXXXXXX')) {
        return {
          success: false,
          error: 'URL de descarga no configurada. Por favor, configura MOD_DOWNLOAD_URL en modules/gtavChaos.js',
          needsConfiguration: true
        };
      }
      
      // Verificar si GTA V está corriendo
      const gtavRunning = await isGTAVRunning();
      if (gtavRunning) {
        const msgResult = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: '⚠️ GTA V está ejecutándose',
          message: 'Debes cerrar GTA V antes de instalar el mod',
          detail: 'Los archivos del juego están siendo utilizados y no se pueden modificar mientras el juego está abierto.\n\n' +
                  'Por favor:\n' +
                  '1. Cierra GTA V completamente\n' +
                  '2. Espera unos segundos\n' +
                  '3. Intenta instalar el mod de nuevo',
          buttons: ['Entendido'],
          defaultId: 0
        });
        
        return { 
          success: false, 
          error: 'GTA V está ejecutándose. Cierra el juego e intenta de nuevo.',
          gtavRunning: true
        };
      }
      
      let gtavPath = getKnownGTAVPath();
      if (!gtavPath) {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Seleccionar carpeta de GTA V',
          properties: ['openDirectory'],
          message: 'Selecciona la carpeta raiz donde esta instalado GTA V'
        });
      
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { success: false, canceled: true };
        }
      
        gtavPath = result.filePaths[0];
      }

      gtavPath = gtavPath.replace(/[/\\]GTA5\.exe$/i, '');
      
      // Verificar que sea una carpeta válida de GTA V
      const gtavExe = path.join(gtavPath, 'GTA5.exe');
      if (!fs.existsSync(gtavExe)) {
        return { 
          success: false, 
          error: 'La carpeta seleccionada no parece ser una instalación válida de GTA V (no se encontró GTA5.exe)' 
        };
      }
      
      const store = readGamePathStore();
      store.default = gtavPath;
      writeGamePathStore(store);

      // Descargar el mod desde TikControl
      const tempPath = path.join(app.getPath('temp'), MOD_FILE_NAME);
      
      // Notificar inicio de descarga
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gtav:downloadProgress', { 
          status: 'downloading', 
          message: 'Descargando mod...' 
        });
      }
      
      await downloadFileFromGitHub(MOD_DOWNLOAD_URL, tempPath);
      
      // Extraer automáticamente el ZIP
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gtav:downloadProgress', { 
          status: 'extracting', 
          message: 'Extrayendo archivos...' 
        });
      }
      
      const extractResult = await extractArchive(tempPath, gtavPath);
      
      if (!extractResult.success) {
        // Si falla, mostrar instrucciones de extracción manual
        if (extractResult.error && extractResult.error.includes('Acceso denegado')) {
          await dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: '❌ Error de Permisos',
            message: 'No se pudo instalar el mod por falta de permisos',
            detail: 'El juego está instalado en una carpeta protegida (Program Files).\n\n' +
                    'Soluciones:\n\n' +
                    '1. RECOMENDADO: Ejecuta TikControl como Administrador:\n' +
                    '   - Cierra TikControl\n' +
                    '   - Clic derecho en TikControl.exe\n' +
                    '   - "Ejecutar como administrador"\n' +
                    '   - Intenta instalar de nuevo\n\n' +
                    '2. ALTERNATIVA: Extracción manual:\n' +
                    '   - El archivo está en: ' + tempPath + '\n' +
                    '   - Extrae manualmente con WinRAR/7-Zip\n' +
                    '   - Copia los archivos a la carpeta de GTA V',
            buttons: ['Entendido']
          });
        }
        
        return {
          success: false,
          error: `Descarga completada pero falló la extracción: ${extractResult.error}`,
          downloadPath: tempPath,
          needsAdmin: extractResult.error && extractResult.error.includes('Acceso denegado')
        };
      }
      
      const sanitizeResult = sanitizeGTAVModInstall(gtavPath);
      const httpAccess = await configureGTAVHttpAccess();
      if (!httpAccess.success) {
        console.log('[GTA V Chaos] Permisos HTTP directos no configurados (opcional). La instalacion continua.');
      }

      // Guardar manifiesto de archivos instalados
      const manifestPath = path.join(gtavPath, 'TikControl_ChaosModManifest.json');
      const manifest = {
        installedDate: new Date().toISOString(),
        files: extractResult.extractedFiles || [],
        sanitized: sanitizeResult,
        httpAccess: { ...httpAccess, optional: true },
        needsAdminForHttp: false,
        httpAccessOptional: !httpAccess.success,
        version: MOD_VERSION,
        source: MOD_DOWNLOAD_URL
      };
      
      try {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log('[GTA V Chaos] Manifiesto guardado:', manifestPath);
      } catch (e) {
        console.warn('[GTA V Chaos] No se pudo guardar el manifiesto:', e);
      }
      
      // Eliminar el archivo RAR temporal
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        console.warn('[GTA V Chaos] No se pudo eliminar el archivo temporal:', e);
      }
      
      return { 
        success: true, 
        downloadPath: tempPath,
        gtavPath: gtavPath,
        sanitized: sanitizeResult,
        httpAccess: { ...httpAccess, optional: true },
        needsAdminForHttp: false,
        httpAccessOptional: !httpAccess.success,
        extractedFiles: extractResult.extractedFiles.length,
        message: `Mod instalado correctamente. ${extractResult.extractedFiles.length} archivos extraídos en la carpeta de GTA V.`
      };
      
    } catch (e) {
      console.error('[GTA V Chaos] Error descargando mod:', e);
      return { 
        success: false, 
        error: e.message,
        manualUrl: MOD_MANUAL_DOWNLOAD_URL
      };
    }
  });
  
  // Instalar mod (llama a la lógica de descarga e instalación)
  ipcMain.handle('gtav:installMod', async () => {
    try {
      // Verificar que la URL esté configurada
      if (!MOD_DOWNLOAD_URL || MOD_DOWNLOAD_URL.includes('USUARIO') || MOD_DOWNLOAD_URL.includes('XXXXXXX')) {
        return {
          success: false,
          error: 'URL de descarga no configurada',
          needsConfiguration: true
        };
      }
      
      // Verificar si GTA V está corriendo
      const gtavRunning = await isGTAVRunning();
      if (gtavRunning) {
        await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: '⚠️ GTA V está ejecutándose',
          message: 'Debes cerrar GTA V antes de instalar el mod',
          detail: 'Cierra GTA V completamente e intenta de nuevo.',
          buttons: ['Entendido']
        });
        return { success: false, error: 'GTA V está ejecutándose', gtavRunning: true };
      }
      
      // Usar la carpeta ya configurada; solo preguntar si todavia no hay una.
      let gtavPath = getKnownGTAVPath();
      if (!gtavPath) {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Seleccionar carpeta de GTA V',
          properties: ['openDirectory'],
          message: 'Selecciona la carpeta donde esta instalado GTA V (donde esta GTA5.exe)'
        });
      
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { success: false, canceled: true };
        }
      
        gtavPath = result.filePaths[0];
      }

      gtavPath = gtavPath.replace(/[/\\]GTA5\.exe$/i, '');
      
      // Verificar que sea una carpeta válida de GTA V
      const gtavExe = path.join(gtavPath, 'GTA5.exe');
      if (!fs.existsSync(gtavExe)) {
        return { success: false, error: 'No se encontró GTA5.exe en esa carpeta' };
      }

      const store = readGamePathStore();
      store.default = gtavPath;
      writeGamePathStore(store);
      
      // Descargar el mod desde TikControl
      const tempPath = path.join(app.getPath('temp'), MOD_FILE_NAME);
      
      console.log('[GTA V Chaos] 📥 Descargando mod desde TikControl:', MOD_DOWNLOAD_URL);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gtav:downloadProgress', { status: 'downloading', message: 'Descargando mod desde TikControl...' });
      }
      
      await downloadFileFromGitHub(MOD_DOWNLOAD_URL, tempPath);
      
      console.log('[GTA V Chaos] 📦 Extrayendo mod en:', gtavPath);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gtav:downloadProgress', { status: 'extracting', message: 'Extrayendo archivos...' });
      }
      
      const extractResult = await extractArchive(tempPath, gtavPath);
      
      if (!extractResult.success) {
        return { success: false, error: extractResult.error };
      }
      
      const sanitizeResult = sanitizeGTAVModInstall(gtavPath);
      const httpAccess = await configureGTAVHttpAccess();
      if (!httpAccess.success) {
        console.log('[GTA V Chaos] Permisos HTTP directos no configurados (opcional). La instalacion continua.');
      }

      // Guardar manifiesto
      const manifestPath = path.join(gtavPath, 'TikControl_ChaosModManifest.json');
      const manifest = {
        installedDate: new Date().toISOString(),
        files: extractResult.extractedFiles || [],
        sanitized: sanitizeResult,
        httpAccess: { ...httpAccess, optional: true },
        needsAdminForHttp: false,
        httpAccessOptional: !httpAccess.success,
        version: MOD_VERSION,
        source: MOD_DOWNLOAD_URL
      };
      
      try {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      } catch (e) {}
      
      // Eliminar archivo temporal
      try { fs.unlinkSync(tempPath); } catch (e) {}
      
      console.log('[GTA V Chaos] ✅ Mod instalado correctamente');
      
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '✅ Mod Instalado',
        message: 'El mod de GTA V Chaos se instaló correctamente',
        detail: `Se extrajeron ${extractResult.extractedFiles?.length || 0} archivos en:\n${gtavPath}`,
        buttons: ['Aceptar']
      });
      
      return { 
        success: true, 
        gtavPath,
        sanitized: sanitizeResult,
        httpAccess: { ...httpAccess, optional: true },
        needsAdminForHttp: false,
        httpAccessOptional: !httpAccess.success,
        extractedFiles: extractResult.extractedFiles?.length || 0,
        message: 'Mod instalado correctamente'
      };
      
    } catch (e) {
      console.error('[GTA V Chaos] Error instalando mod:', e);
      return { success: false, error: e.message };
    }
  });
  
  // Verificar si el mod está instalado en una ruta específica
  ipcMain.handle('gtav:checkModInstalled', async (event, gtavPath) => {
    try {
      return getGTAVModInstallState(gtavPath);

      if (!gtavPath) {
        return { installed: false, error: 'No se proporcionó ruta del juego' };
      }
      
      // Verificar que sea una carpeta válida de GTA V
      const gtavExe = path.join(gtavPath, 'GTA5.exe');
      if (!fs.existsSync(gtavExe)) {
        return { installed: false, valid: false, error: 'No se encontró GTA5.exe' };
      }
      
      // Verificar archivos clave del mod
      const installedFiles = [];
      const missingFiles = [];
      
      for (const file of MOD_KEY_FILES) {
        const filePath = path.join(gtavPath, file);
        if (fs.existsSync(filePath)) {
          installedFiles.push(file);
        } else {
          missingFiles.push(file);
        }
      }
      
      // Verificar manifiesto de TikControl
      const manifestPath = path.join(gtavPath, 'TikControl_ChaosModManifest.json');
      let manifest = null;
      if (fs.existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        } catch (e) {}
      }
      
      const installed = missingFiles.length === 0;
      
      return {
        installed,
        valid: true,
        path: gtavPath,
        installedFiles,
        missingFiles,
        manifest,
        fullInstall: installed,
        partialInstall: installedFiles.length > 0 && missingFiles.length > 0
      };
    } catch (e) {
      console.error('[GTA V Chaos] Error verificando instalación:', e);
      return { installed: false, error: e.message };
    }
  });
  
  // Buscar automáticamente la instalación de GTA V
  ipcMain.handle('gtav:findInstallation', async () => {
    try {
      const possiblePaths = [
        'C:\\Program Files\\Rockstar Games\\Grand Theft Auto V',
        'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto V',
        'D:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V',
        'E:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V',
        'C:\\Program Files\\Epic Games\\GTAV',
        'D:\\Program Files\\Epic Games\\GTAV',
        'D:\\Games\\Grand Theft Auto V',
        'E:\\Games\\Grand Theft Auto V'
      ];
      
      for (const testPath of possiblePaths) {
        const gtavExe = path.join(testPath, 'GTA5.exe');
        if (fs.existsSync(gtavExe)) {
          // Verificar si el mod está instalado
          const modInstalled = MOD_KEY_FILES.every(file => 
            fs.existsSync(path.join(testPath, file))
          );
          
          return {
            found: true,
            path: testPath,
            modInstalled
          };
        }
      }
      
      return { found: false };
    } catch (e) {
      console.error('[GTA V Chaos] Error buscando instalación:', e);
      return { found: false, error: e.message };
    }
  });
  
  // Diagnóstico de conexión
  ipcMain.handle('gtav:diagnose', async () => {
    const results = {
      timestamp: new Date().toISOString(),
      tests: []
    };
    
    // Test 1: Verificar si hay algo escuchando en los puertos comunes
    const portsToCheck = [8082, 6720, 6721, 6722, 6723, 7704, 3698, 8080];
    
    for (const port of portsToCheck) {
      const portTest = {
        name: `Puerto ${port}`,
        port: port,
        status: 'checking'
      };
      
      try {
        // Intentar conexión TCP al puerto
        const net = require('net');
        const testResult = await new Promise((resolve) => {
          const socket = new net.Socket();
          const timeout = setTimeout(() => {
            socket.destroy();
            resolve({ listening: false, error: 'Timeout' });
          }, 2000);
          
          socket.on('connect', () => {
            clearTimeout(timeout);
            socket.destroy();
            resolve({ listening: true });
          });
          
          socket.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ listening: false, error: err.message });
          });
          
          socket.connect(port, 'localhost');
        });
        
        portTest.listening = testResult.listening;
        portTest.status = testResult.listening ? 'success' : 'not_listening';
        portTest.error = testResult.error;
        
      } catch (e) {
        portTest.status = 'error';
        portTest.error = e.message;
        portTest.listening = false;
      }
      
      results.tests.push(portTest);
    }
    
    // Test 2: Verificar archivos del mod instalados
    const modFilesTest = {
      name: 'Archivos del Mod',
      status: 'checking',
      files: {}
    };
    
    // Pedir carpeta de GTA V para verificar
    const folderResult = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar carpeta de GTA V para diagnóstico',
      properties: ['openDirectory'],
      message: 'Selecciona la carpeta donde está instalado GTA V'
    });
    
    if (!folderResult.canceled && folderResult.filePaths && folderResult.filePaths.length > 0) {
      const gtavPath = folderResult.filePaths[0];
      
      // Verificar archivos clave
      const filesToCheck = [
        'GTA5.exe',
        'ScriptHookV.dll',
        'dinput8.dll',
        'ChaosMod.asi',
        'chaosmod',
        'scripts',
        path.join('scripts', 'GTAVWebhook.dll'),
        'ScriptHookVDotNet.asi',
        'ScriptHookVDotNet.ini',
        path.join('scripts', 'System.Net.Http.dll'),
        path.join('scripts', 'System.Web.dll')
      ];
      
      for (const file of filesToCheck) {
        const fullPath = path.join(gtavPath, file);
        modFilesTest.files[file] = {
          exists: fs.existsSync(fullPath),
          path: fullPath
        };
        
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          modFilesTest.files[file].isDirectory = stats.isDirectory();
          modFilesTest.files[file].size = stats.size;
        }
      }
      
      // Buscar archivos de configuración
      const configFiles = [];
      const chaosModDir = path.join(gtavPath, 'chaosmod');
      if (fs.existsSync(chaosModDir)) {
        try {
          const files = fs.readdirSync(chaosModDir);
          for (const file of files) {
            if (file.endsWith('.ini') || file.endsWith('.toml') || file.endsWith('.cfg') || file.endsWith('.config')) {
              configFiles.push(file);
              
              // Leer contenido del archivo de config
              try {
                const configPath = path.join(chaosModDir, file);
                const content = fs.readFileSync(configPath, 'utf8');
                modFilesTest.files[`config_${file}`] = {
                  exists: true,
                  path: configPath,
                  preview: content.substring(0, 500) // Primeros 500 caracteres
                };
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
      
      modFilesTest.configFiles = configFiles;
      modFilesTest.status = 'completed';
    } else {
      modFilesTest.status = 'skipped';
    }
    
    results.tests.push(modFilesTest);
    
    // Test 3: Intentar conexión WebSocket
    const wsTest = {
      name: 'Conexión WebSocket',
      status: 'checking'
    };
    
    try {
      const connected = await chaosService.connect({ url: 'ws://localhost:8082' });
      wsTest.status = connected ? 'success' : 'failed';
      wsTest.connected = connected;
      
      if (connected) {
        // Desconectar inmediatamente
        setTimeout(() => chaosService.disconnect(), 1000);
      }
    } catch (e) {
      wsTest.status = 'error';
      wsTest.error = e.message;
    }
    
    results.tests.push(wsTest);
    
    // Generar recomendaciones
    results.recommendations = [];
    
    const listeningPorts = results.tests
      .filter(t => t.port && t.listening)
      .map(t => t.port);
    
    if (listeningPorts.length === 0) {
      results.recommendations.push({
        type: 'critical',
        title: 'No hay servidor escuchando',
        message: 'No se detecto ningun servidor en los puertos de GTA V (8082, 6720, 6721, 6722, 6723). El mod probablemente NO esta ejecutandose o NO tiene el servidor habilitado.',
        actions: [
          'Verifica que GTA V esté ejecutándose con el mod cargado',
          'El mod usa GTAVWebhook.dll para abrir los puertos 6720-6723 y ChaosMod.asi para el puerto 8082',
          'Verifica que GTAVWebhook.dll esté en la carpeta scripts/',
          'Reinicia GTA V para aplicar los cambios'
        ]
      });
    } else {
      results.recommendations.push({
        type: 'info',
        title: `Servidor detectado en puerto(s): ${listeningPorts.join(', ')}`,
        message: 'Se detectó un servidor, pero podría ser el puerto incorrecto.',
        actions: [
          `Intenta cambiar el puerto en TikControl a: ${listeningPorts[0]}`,
          'Verifica la configuración del mod para confirmar el puerto'
        ]
      });
    }
    
    const hasModFiles = modFilesTest.files && modFilesTest.files['ChaosMod.asi']?.exists && modFilesTest.files[path.join('scripts', 'GTAVWebhook.dll')]?.exists;
    if (!hasModFiles) {
      results.recommendations.push({
        type: 'warning',
        title: 'Archivos del mod no encontrados',
        message: 'No se encontro ChaosMod.asi o scripts/GTAVWebhook.dll en la carpeta seleccionada.',
        actions: [
          'Verifica que el mod esté instalado correctamente',
          'Reinstala el mod usando el botón "Descargar Mod"'
        ]
      });
    }
    
    return results;
  });
  
  // Borrar/Desinstalar mod
  ipcMain.handle('gtav:uninstallMod', async (event, profileIdOrPath) => {
    try {
      // Verificar si GTA V está corriendo
      const gtavRunning = await isGTAVRunning();
      if (gtavRunning) {
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: '⚠️ GTA V está ejecutándose',
          message: 'Debes cerrar GTA V antes de desinstalar el mod',
          detail: 'Los archivos del juego están siendo utilizados y no se pueden eliminar mientras el juego está abierto.\n\n' +
                  'Por favor:\n' +
                  '1. Cierra GTA V completamente\n' +
                  '2. Espera unos segundos\n' +
                  '3. Intenta desinstalar el mod de nuevo',
          buttons: ['Entendido'],
          defaultId: 0
        });
        
        return { 
          success: false, 
          error: 'GTA V está ejecutándose. Cierra el juego e intenta de nuevo.',
          gtavRunning: true
        };
      }

      {
      let gtavPath = '';
      if (profileIdOrPath && /[\\/]/.test(String(profileIdOrPath))) {
        gtavPath = String(profileIdOrPath).replace(/[/\\]GTA5\.exe$/i, '');
      } else if (profileIdOrPath) {
        const store = readGamePathStore();
        gtavPath = String(store[normalizeProfileId(profileIdOrPath)] || store.default || '').replace(/[/\\]GTA5\.exe$/i, '');
      }
      if (!gtavPath) gtavPath = getKnownGTAVPath();
      if (!gtavPath) {
        const folderResult = await dialog.showOpenDialog(mainWindow, {
          title: 'Seleccionar carpeta de GTA V',
          properties: ['openDirectory'],
          message: 'Selecciona la carpeta donde esta instalado GTA V con el mod de TikControl'
        });

        if (folderResult.canceled || !folderResult.filePaths || folderResult.filePaths.length === 0) {
          return { success: false, canceled: true };
        }

        gtavPath = folderResult.filePaths[0].replace(/[/\\]GTA5\.exe$/i, '');
      }

      const installState = getGTAVModInstallState(gtavPath);
      if (!installState.valid) {
        return { success: false, error: installState.error || 'Ruta de GTA V no valida' };
      }

      const targets = getGTAVUninstallTargets(installState.manifest);
      const confirmResult = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Confirmar Desinstalacion',
        message: 'Quieres desinstalar por completo el mod de GTA V de TikControl?',
        detail: `Se eliminaran los archivos del mod en:\n${gtavPath}\n\nVersion instalada: ${installState.installedVersion || 'desconocida'}\nVersion actual: ${installState.targetVersion}\n\nEsta accion no se puede deshacer.`,
        buttons: ['Desinstalar', 'Cancelar'],
        defaultId: 1,
        cancelId: 1
      });

      if (confirmResult.response !== 0) {
        return { success: false, canceled: true };
      }

      const deletedFiles = [];
      const failedFiles = [];
      const skippedFiles = [];

      for (const file of targets) {
        try {
          const result = deleteGTAVTarget(gtavPath, file);
          if (result.deleted) deletedFiles.push(file);
          else if (result.skipped) skippedFiles.push({ file, reason: result.reason });
        } catch (e) {
          console.error(`[GTA V Chaos] Error eliminando ${file}:`, e);
          failedFiles.push({ file, error: e.message });
        }
      }

      const store = readGamePathStore();
      for (const [key, value] of Object.entries(store || {})) {
        if (value === gtavPath) delete store[key];
      }
      writeGamePathStore(store);

      await dialog.showMessageBox(mainWindow, {
        type: failedFiles.length === 0 ? 'info' : 'warning',
        title: 'Desinstalacion Completada',
        message: `Archivos eliminados: ${deletedFiles.length}`,
        detail: failedFiles.length > 0
          ? `No se pudieron eliminar ${failedFiles.length} archivos. Cierra GTA V y vuelve a intentarlo.`
          : (skippedFiles.length > 0 ? `Algunas carpetas no se borraron porque tenian archivos ajenos al mod: ${skippedFiles.map(s => s.file).join(', ')}` : 'El mod de GTA V de TikControl se elimino por completo.'),
        buttons: ['Aceptar']
      });

      return {
        success: failedFiles.length === 0,
        deleted: deletedFiles.length,
        failed: failedFiles.length,
        skipped: skippedFiles.length,
        total: targets.length,
        gtavPath
      };
      }
      
      // Pedir carpeta de GTA V
      const folderResult = await dialog.showOpenDialog(mainWindow, {
        title: 'Seleccionar carpeta de GTA V',
        properties: ['openDirectory'],
        message: 'Selecciona la carpeta donde está instalado GTA V con el Chaos Mod'
      });
      
      if (folderResult.canceled || !folderResult.filePaths || folderResult.filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      
      const gtavPath = folderResult.filePaths[0];
      const manifestPath = path.join(gtavPath, 'TikControl_ChaosModManifest.json');
      
      // Verificar si existe el manifiesto
      if (!fs.existsSync(manifestPath)) {
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Manifiesto no encontrado',
          message: 'No se encontró el registro de instalación del mod',
          detail: 'No se puede desinstalar automáticamente porque no hay registro de qué archivos se instalaron.\n\n' +
                  '¿Deseas abrir la carpeta de GTA V para eliminar manualmente los archivos del mod?\n\n' +
                  'Archivos típicos del Chaos Mod:\n' +
                  '- ChaosMod.asi\n' +
                  '- chaosmod/ (carpeta)\n' +
                  '- scripts/ (carpeta)\n' +
                  '- TikControl_ChaosModManifest.json',
          buttons: ['Abrir carpeta', 'Cancelar'],
          defaultId: 0,
          cancelId: 1
        });
        
        if (result.response === 0) {
          require('electron').shell.openPath(gtavPath);
          return { success: true, opened: true, manual: true };
        }
        
        return { success: false, canceled: true };
      }
      
      // Leer manifiesto
      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch (e) {
        return { 
          success: false, 
          error: 'Error leyendo el manifiesto: ' + e.message 
        };
      }
      
      // Confirmar desinstalación
      const confirmResult = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Confirmar Desinstalación',
        message: `¿Deseas desinstalar el Chaos Mod?`,
        detail: `Se eliminarán ${manifest.files.length} archivos instalados el ${new Date(manifest.installedDate).toLocaleString()}.\n\n` +
                `Esta acción NO se puede deshacer.`,
        buttons: ['Desinstalar', 'Cancelar'],
        defaultId: 1,
        cancelId: 1
      });
      
      if (confirmResult.response !== 0) {
        return { success: false, canceled: true };
      }
      
      // Eliminar archivos
      const deletedFiles = [];
      const failedFiles = [];
      
      // Ordenar archivos: primero archivos individuales, luego carpetas (más profundas primero)
      const sortedFiles = [...manifest.files].sort((a, b) => {
        const aDepth = a.split(path.sep).length;
        const bDepth = b.split(path.sep).length;
        return bDepth - aDepth; // Más profundo primero
      });
      
      for (const file of sortedFiles) {
        const fullPath = path.join(gtavPath, file);
        
        try {
          if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
              // Verificar si la carpeta está vacía antes de eliminarla
              const contents = fs.readdirSync(fullPath);
              if (contents.length === 0) {
                fs.rmdirSync(fullPath);
                deletedFiles.push(file);
              }
            } else {
              fs.unlinkSync(fullPath);
              deletedFiles.push(file);
            }
          }
        } catch (e) {
          console.error(`[GTA V Chaos] Error eliminando ${file}:`, e);
          failedFiles.push({ file, error: e.message });
        }
      }
      
      // Eliminar el manifiesto
      try {
        fs.unlinkSync(manifestPath);
      } catch (e) {
        console.warn('[GTA V Chaos] No se pudo eliminar el manifiesto:', e);
      }
      
      // Mostrar resultado
      let message = `Desinstalación completada.\n\n`;
      message += `Archivos eliminados: ${deletedFiles.length}/${manifest.files.length}\n`;
      
      if (failedFiles.length > 0) {
        message += `\nNo se pudieron eliminar ${failedFiles.length} archivos.`;
      }
      
      await dialog.showMessageBox(mainWindow, {
        type: failedFiles.length === 0 ? 'info' : 'warning',
        title: 'Desinstalación Completada',
        message: message,
        buttons: ['Aceptar']
      });
      
      return { 
        success: true, 
        deleted: deletedFiles.length,
        failed: failedFiles.length,
        total: manifest.files.length
      };
      
    } catch (e) {
      console.error('[GTA V Chaos] Error en desinstalación:', e);
      return { success: false, error: e.message };
    }
  });

  // Actualizar ScriptHook V
  ipcMain.handle('gtav:updateScriptHook', async () => {
    try {
      const gtavRunning = await isGTAVRunning();
      if (gtavRunning) {
        await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'GTA V está ejecutándose',
          message: 'Debes cerrar GTA V antes de actualizar ScriptHook V',
          detail: 'Cierra GTA V completamente e intenta de nuevo.',
          buttons: ['Entendido']
        });
        return { success: false, error: 'GTA V está ejecutándose', gtavRunning: true };
      }

      // Buscar ruta de GTA V automáticamente o pedir al usuario
      let gtavPath = null;
      const possiblePaths = [
        'C:\\Program Files\\Rockstar Games\\Grand Theft Auto V',
        'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto V',
        'D:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V',
        'E:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V',
        'C:\\Program Files\\Epic Games\\GTAV',
        'D:\\Program Files\\Epic Games\\GTAV',
        'D:\\Games\\Grand Theft Auto V',
        'E:\\Games\\Grand Theft Auto V'
      ];

      for (const testPath of possiblePaths) {
        if (fs.existsSync(path.join(testPath, 'GTA5.exe'))) {
          gtavPath = testPath;
          break;
        }
      }

      if (!gtavPath) {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Seleccionar carpeta de GTA V',
          properties: ['openDirectory'],
          message: 'Selecciona la carpeta donde está instalado GTA V (donde está GTA5.exe)'
        });
        if (result.canceled || !result.filePaths?.length) return { success: false, canceled: true };
        gtavPath = result.filePaths[0];
        if (!fs.existsSync(path.join(gtavPath, 'GTA5.exe'))) {
          return { success: false, error: 'No se encontró GTA5.exe en esa carpeta' };
        }
      }

      // Comprobar versión actual
      const currentDll = path.join(gtavPath, 'ScriptHookV.dll');
      let currentVersion = null;
      if (fs.existsSync(currentDll)) {
        try {
          const { execSync } = require('child_process');
          const versionInfo = execSync(`powershell -Command "(Get-Item '${currentDll.replace(/'/g, "''")}').VersionInfo.ProductVersion"`, { encoding: 'utf8' }).trim();
          currentVersion = versionInfo;
        } catch (e) {}
      }

      console.log('[GTA V] ScriptHook V actual:', currentVersion || 'no instalado');

      // Descargar desde S3
      const tempPath = path.join(app.getPath('temp'), 'ScriptHookV.zip');

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gtav:scripthook-progress', { status: 'downloading', message: 'Descargando ScriptHook V...' });
      }

      let downloaded = false;
      try {
        await downloadFileFromGitHub(SCRIPTHOOK_DOWNLOAD_URL, tempPath);
        downloaded = true;
      } catch (e) {
        console.error('[GTA V] Error descargando ScriptHook V desde S3:', e.message);
      }

      if (!downloaded) {
        // Fallback: abrir web oficial
        const { shell } = require('electron');
        await shell.openExternal(SCRIPTHOOK_MANUAL_URL);
        return {
          success: false,
          error: 'No se pudo descargar automáticamente. Se abrió la web oficial para descarga manual.',
          manualDownload: true
        };
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gtav:scripthook-progress', { status: 'extracting', message: 'Instalando ScriptHook V...' });
      }

      // Extraer solo ScriptHookV.dll y dinput8.dll en la carpeta de GTA V
      const extractResult = await extractArchive(tempPath, gtavPath);

      if (!extractResult.success) {
        return { success: false, error: extractResult.error };
      }

      // Verificar que se copiaron los archivos clave
      const installed = SCRIPTHOOK_FILES.every(f => fs.existsSync(path.join(gtavPath, f)));

      // Limpiar temporal
      try { fs.unlinkSync(tempPath); } catch (e) {}

      if (!installed) {
        return { success: false, error: 'Los archivos de ScriptHook V no se extrajeron correctamente' };
      }

      // Leer nueva versión
      let newVersion = null;
      try {
        const { execSync } = require('child_process');
        const versionInfo = execSync(`powershell -Command "(Get-Item '${currentDll.replace(/'/g, "''")}').VersionInfo.ProductVersion"`, { encoding: 'utf8' }).trim();
        newVersion = versionInfo;
      } catch (e) {}

      console.log('[GTA V] ScriptHook V actualizado:', newVersion);

      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'ScriptHook V Actualizado',
        message: 'ScriptHook V se actualizó correctamente',
        detail: (currentVersion ? `Versión anterior: ${currentVersion}\n` : '') +
                (newVersion ? `Versión nueva: ${newVersion}\n` : '') +
                `Ruta: ${gtavPath}`,
        buttons: ['Aceptar']
      });

      return {
        success: true,
        gtavPath,
        previousVersion: currentVersion,
        newVersion,
        message: 'ScriptHook V actualizado correctamente'
      };

    } catch (e) {
      console.error('[GTA V] Error actualizando ScriptHook V:', e);
      return { success: false, error: e.message };
    }
  });
}

// Función auxiliar para descargar archivos desde GitHub Releases
function downloadFileFromGitHub(url, dest) {
  return new Promise((resolve, reject) => {
    console.log('[GTA V Chaos] Iniciando descarga desde GitHub Releases...');
    
    downloadDirectFromGitHub(url, dest, resolve, reject);
  });
}

// Función para realizar la descarga directa desde GitHub con manejo de redirecciones
function downloadDirectFromGitHub(downloadUrl, dest, resolve, reject) {
  const file = fs.createWriteStream(dest);
  let downloadedBytes = 0;
  
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  };
  
  const followRedirect = (currentUrl, redirectCount = 0) => {
    if (redirectCount > 10) {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      return reject(new Error('Demasiadas redirecciones. Verifica que el enlace de descarga sea correcto.'));
    }
    
    const protocol = currentUrl.startsWith('https://') ? https : http;
    
    protocol.get(currentUrl, options, (response) => {
      // Manejar redirecciones (GitHub usa redirecciones para sus releases)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = response.headers.location;
        const nextUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, currentUrl).href;
        
        console.log('[GTA V Chaos] Redirigiendo... (intento ' + (redirectCount + 1) + ')');
        
        return followRedirect(nextUrl, redirectCount + 1);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return reject(new Error(`Error HTTP ${response.statusCode}: No se pudo descargar el archivo`));
      }
      
      // Verificar tipo de contenido
      const contentType = response.headers['content-type'] || '';
      const contentLength = parseInt(response.headers['content-length'] || '0');
      
      // Si es HTML, probablemente es una página de error
      if (contentType.includes('text/html')) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return reject(new Error('El enlace de descarga no es válido o el archivo no está disponible. Verifica el enlace de GitHub Releases.'));
      }
      
      console.log('[GTA V Chaos] Descarga iniciada...');
      console.log('[GTA V Chaos] Tamaño: ' + (contentLength > 0 ? Math.round(contentLength / 1024 / 1024) + ' MB' : 'Desconocido'));
      
      let lastProgressUpdate = Date.now();
      
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        
        // Actualizar progreso cada 500ms
        const now = Date.now();
        if (contentLength > 0 && now - lastProgressUpdate > 500) {
          lastProgressUpdate = now;
          const progress = Math.round((downloadedBytes / contentLength) * 100);
          
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('gtav:downloadProgress', {
              status: 'downloading',
              progress: progress,
              downloaded: downloadedBytes,
              total: contentLength
            });
          }
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(() => {
          // Verificar que el archivo se descargó correctamente
          if (fs.existsSync(dest)) {
            const stats = fs.statSync(dest);
            if (stats.size < 1000) {
              // Archivo muy pequeño, probablemente es un error
              fs.unlinkSync(dest);
              return reject(new Error('El archivo descargado es demasiado pequeño. Puede que la descarga haya fallado.'));
            }
            
            console.log('[GTA V Chaos] ✅ Descarga completada: ' + Math.round(stats.size / 1024 / 1024) + ' MB');
            
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('gtav:downloadProgress', {
                status: 'completed',
                progress: 100
              });
            }
            
            resolve();
          } else {
            reject(new Error('Error: El archivo no se guardó correctamente'));
          }
        });
      });
      
      file.on('error', (err) => {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
      
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  };
  
  followRedirect(downloadUrl);
}

// Función para extraer archivos ZIP/RAR
async function extractArchive(archivePath, destPath) {
  return new Promise((resolve) => {
    const isZip = archivePath.toLowerCase().endsWith('.zip');
    console.log(`[GTA V Chaos] Extrayendo ${isZip ? 'ZIP' : 'RAR'}:`, archivePath, 'a', destPath);
    
    if (isZip) {
      // Usar extracción nativa de ZIP con adm-zip o 7-Zip
      extractZipFile(archivePath, destPath, resolve);
    } else {
      // Fallback para RAR
      extractRarFile(archivePath, destPath, resolve);
    }
  });
}

// Función para extraer ZIP
async function extractZipFile(zipPath, destPath, resolve) {
  // Verificar permisos de escritura
  try {
    const testFile = path.join(destPath, '.tikcontrol_test_write');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (e) {
    console.error('[GTA V Chaos] Sin permisos de escritura en:', destPath);
    return resolve({
      success: false,
      error: 'Acceso denegado. Ejecuta TikControl como Administrador para instalar en esta carpeta.'
    });
  }
  
  // Tomar snapshot de archivos antes de extraer
  const beforeFiles = new Set();
  try {
    const scanBefore = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(destPath, fullPath);
        beforeFiles.add(relativePath);
        if (entry.isDirectory()) {
          try { scanBefore(fullPath); } catch (e) {}
        }
      }
    };
    scanBefore(destPath);
  } catch (e) {}
  
  // Intentar con adm-zip primero (incluido en el proyecto)
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    
    console.log('[GTA V Chaos] ✅ Usando adm-zip para extraer');
    
    zip.extractAllTo(destPath, true);
    
    // Escanear archivos nuevos
    const afterFiles = new Set();
    const scanAfter = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(destPath, fullPath);
          if (entry.name !== 'TikControl_ChaosModManifest.json') {
            afterFiles.add(relativePath);
          }
          if (entry.isDirectory()) {
            try { scanAfter(fullPath); } catch (e) {}
          }
        }
      } catch (e) {}
    };
    scanAfter(destPath);
    
    const newFiles = [...afterFiles].filter(f => !beforeFiles.has(f));
    
    console.log('[GTA V Chaos] ✅ Extracción completada:', newFiles.length, 'archivos');
    
    return resolve({
      success: true,
      extractedFiles: newFiles.length > 0 ? newFiles : ['ChaosMod.asi', 'chaosmod/', 'scripts/']
    });
    
  } catch (admZipError) {
    console.warn('[GTA V Chaos] adm-zip no disponible, intentando 7-Zip:', admZipError.message);
    
    // Fallback a 7-Zip
    trySevenZipForZip(zipPath, destPath, beforeFiles, resolve);
  }
}

// Fallback para ZIP con 7-Zip
function trySevenZipForZip(zipPath, destPath, beforeFiles, resolve) {
  const possibleSevenZipPaths = [
    path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
    path.join(process.resourcesPath || __dirname, 'app.asar.unpacked', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe'
  ];
  
  let sevenZipCmd = null;
  
  for (const testPath of possibleSevenZipPaths) {
    if (fs.existsSync(testPath)) {
      sevenZipCmd = `"${testPath}" x -y "-o${destPath}" "${zipPath}"`;
      console.log('[GTA V Chaos] ✅ Usando 7-Zip:', testPath);
      break;
    }
  }
  
  if (!sevenZipCmd) {
    return resolve({
      success: false,
      error: 'No se encontró herramienta de extracción (adm-zip o 7-Zip)'
    });
  }
  
  exec(sevenZipCmd, (error, stdout, stderr) => {
    if (error) {
      console.error('[GTA V Chaos] Error con 7-Zip:', error);
      return resolve({
        success: false,
        error: error.message.includes('Acceso denegado') 
          ? 'Acceso denegado. Ejecuta TikControl como Administrador.'
          : 'Error extrayendo archivo: ' + error.message
      });
    }
    
    // Escanear archivos nuevos
    const afterFiles = new Set();
    const scanAfter = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(destPath, fullPath);
          if (entry.name !== 'TikControl_ChaosModManifest.json') {
            afterFiles.add(relativePath);
          }
          if (entry.isDirectory()) {
            try { scanAfter(fullPath); } catch (e) {}
          }
        }
      } catch (e) {}
    };
    scanAfter(destPath);
    
    const newFiles = [...afterFiles].filter(f => !beforeFiles.has(f));
    
    resolve({
      success: true,
      extractedFiles: newFiles.length > 0 ? newFiles : ['ChaosMod.asi', 'chaosmod/', 'scripts/']
    });
  });
}

// Función para extraer archivos RAR usando herramientas del sistema
function extractRarFile(rarPath, destPath, resolve) {
  console.log('[GTA V Chaos] Extrayendo RAR:', rarPath, 'a', destPath);
  
  // Verificar permisos de escritura en la carpeta destino
  try {
    const testFile = path.join(destPath, '.tikcontrol_test_write');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (e) {
    console.error('[GTA V Chaos] Sin permisos de escritura en:', destPath);
    return resolve({
      success: false,
      error: 'Acceso denegado. Ejecuta TikControl como Administrador para instalar en esta carpeta.'
    });
  }
    
    // Lista de archivos extraídos
    const extractedFiles = [];
    
    // Función para escanear recursivamente los archivos extraídos
    const scanExtractedFiles = (dir, baseDir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(baseDir, fullPath);
          
          // Ignorar archivos del sistema
          if (entry.name === 'TikControl_ChaosModManifest.json') continue;
          
          extractedFiles.push(relativePath);
          
          if (entry.isDirectory()) {
            scanExtractedFiles(fullPath, baseDir);
          }
        }
      } catch (e) {
        console.error('[GTA V Chaos] Error escaneando archivos:', e);
      }
    };
    
    // Tomar snapshot de archivos antes de extraer
    const beforeFiles = new Set();
    try {
      const scanBefore = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(destPath, fullPath);
          beforeFiles.add(relativePath);
          if (entry.isDirectory()) {
            try {
              scanBefore(fullPath);
            } catch (e) {
              // Ignorar errores de acceso
            }
          }
        }
      };
      scanBefore(destPath);
    } catch (e) {
      console.warn('[GTA V Chaos] Error escaneando archivos previos:', e);
    }
    
    // Intentar usar WinRAR
    const winrarPath = 'C:\\Program Files\\WinRAR\\UnRAR.exe';
    const winrar64Path = 'C:\\Program Files (x86)\\WinRAR\\UnRAR.exe';
    
    let unrarCmd = null;
    if (fs.existsSync(winrarPath)) {
      unrarCmd = `"${winrarPath}" x -y "${rarPath}" "${destPath}\\"`;
    } else if (fs.existsSync(winrar64Path)) {
      unrarCmd = `"${winrar64Path}" x -y "${rarPath}" "${destPath}\\"`;
    }
    
    if (unrarCmd) {
      console.log('[GTA V Chaos] Usando WinRAR para extraer');
      
      exec(unrarCmd, (error, stdout, stderr) => {
        if (error) {
          console.error('[GTA V Chaos] Error con WinRAR:', error);
          
          // Verificar si es error de permisos
          if (error.message && (error.message.includes('Acceso denegado') || error.message.includes('no tiene acceso'))) {
            return resolve({
              success: false,
              error: 'Acceso denegado. Ejecuta TikControl como Administrador.'
            });
          }
          
          // Intentar con 7-Zip como fallback
          trySevenZip();
          return;
        }
        
        console.log('[GTA V Chaos] Extracción con WinRAR completada');
        
        // Escanear archivos nuevos
        try {
          const afterFiles = new Set();
          const scanAfter = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              const relativePath = path.relative(destPath, fullPath);
              if (entry.name !== 'TikControl_ChaosModManifest.json') {
                afterFiles.add(relativePath);
              }
              if (entry.isDirectory()) {
                try {
                  scanAfter(fullPath);
                } catch (e) {}
              }
            }
          };
          scanAfter(destPath);
          
          // Encontrar archivos nuevos
          const newFiles = [...afterFiles].filter(f => !beforeFiles.has(f));
          
          resolve({
            success: true,
            extractedFiles: newFiles.length > 0 ? newFiles : ['ChaosMod.asi', 'chaosmod/', 'scripts/']
          });
        } catch (e) {
          console.error('[GTA V Chaos] Error escaneando archivos extraídos:', e);
          resolve({
            success: true,
            extractedFiles: ['ChaosMod.asi', 'chaosmod/', 'scripts/']
          });
        }
      });
    } else {
      // Intentar con 7-Zip
      trySevenZip();
    }
    
    function trySevenZip() {
      // 🔥 PRIORIDAD 1: Usar 7zip de node_modules (siempre disponible con electron-builder)
      const possibleSevenZipPaths = [
        // Para desarrollo
        path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
        // Para app empaquetada (asar)
        path.join(process.resourcesPath || __dirname, 'app.asar.unpacked', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
        // Para app empaquetada (sin asar)
        path.join(process.resourcesPath || __dirname, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
      ];
      
      // PRIORIDAD 2: Buscar instalaciones del sistema
      const sevenZipPath = 'C:\\Program Files\\7-Zip\\7z.exe';
      const sevenZip64Path = 'C:\\Program Files (x86)\\7-Zip\\7z.exe';
      
      let sevenZipCmd = null;
      let usedPath = null;
      
      // Intentar con 7zip de node_modules primero
      for (const testPath of possibleSevenZipPaths) {
        if (fs.existsSync(testPath)) {
          console.log('[GTA V Chaos] ✅ Usando 7-Zip incluido:', testPath);
          sevenZipCmd = `"${testPath}" x -y "-o${destPath}" "${rarPath}"`;
          usedPath = testPath;
          break;
        }
      }
      
      // Fallback a instalaciones del sistema
      if (!sevenZipCmd) {
        if (fs.existsSync(sevenZipPath)) {
          console.log('[GTA V Chaos] Usando 7-Zip del sistema');
          sevenZipCmd = `"${sevenZipPath}" x -y "-o${destPath}" "${rarPath}"`;
          usedPath = sevenZipPath;
        } else if (fs.existsSync(sevenZip64Path)) {
          console.log('[GTA V Chaos] Usando 7-Zip del sistema (x86)');
          sevenZipCmd = `"${sevenZip64Path}" x -y "-o${destPath}" "${rarPath}"`;
          usedPath = sevenZip64Path;
        }
      }
      
      if (sevenZipCmd) {
        console.log('[GTA V Chaos] Usando 7-Zip para extraer');
        
        exec(sevenZipCmd, (error, stdout, stderr) => {
          if (error) {
            console.error('[GTA V Chaos] Error con 7-Zip:', error);
            
            // Verificar si es error de permisos
            if (error.message && (error.message.includes('Acceso denegado') || error.message.includes('no tiene acceso'))) {
              return resolve({
                success: false,
                error: 'Acceso denegado. Ejecuta TikControl como Administrador para instalar en esta carpeta.'
              });
            }
            
            resolve({
              success: false,
              error: 'No se pudo extraer el archivo. Verifica que WinRAR o 7-Zip estén instalados y que tengas permisos.'
            });
            return;
          }
          
          console.log('[GTA V Chaos] Extracción con 7-Zip completada');
          
          // Escanear archivos nuevos
          try {
            const afterFiles = new Set();
            const scanAfter = (dir) => {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.relative(destPath, fullPath);
                if (entry.name !== 'TikControl_ChaosModManifest.json') {
                  afterFiles.add(relativePath);
                }
                if (entry.isDirectory()) {
                  try {
                    scanAfter(fullPath);
                  } catch (e) {}
                }
              }
            };
            scanAfter(destPath);
            
            // Encontrar archivos nuevos
            const newFiles = [...afterFiles].filter(f => !beforeFiles.has(f));
            
            resolve({
              success: true,
              extractedFiles: newFiles.length > 0 ? newFiles : ['ChaosMod.asi', 'chaosmod/', 'scripts/']
            });
          } catch (e) {
            console.error('[GTA V Chaos] Error escaneando archivos extraídos:', e);
            resolve({
              success: true,
              extractedFiles: ['ChaosMod.asi', 'chaosmod/', 'scripts/']
            });
          }
        });
      } else {
        // No se encontró ninguna herramienta (esto NO debería pasar ya que 7zip-bin está en node_modules)
        console.error('[GTA V Chaos] ❌ ERROR CRÍTICO: No se encontró 7-Zip en ninguna ubicación');
        console.error('[GTA V Chaos] Rutas verificadas:');
        possibleSevenZipPaths.forEach((p, i) => console.error(`  [${i + 1}] ${p} - ${fs.existsSync(p) ? '✓' : '✗'}`));
        console.error(`  Sistema: ${sevenZipPath} - ${fs.existsSync(sevenZipPath) ? '✓' : '✗'}`);
        console.error(`  Sistema (x86): ${sevenZip64Path} - ${fs.existsSync(sevenZip64Path) ? '✓' : '✗'}`);
        
        resolve({
          success: false,
          error: 'No se pudo encontrar 7-Zip. Esto es inusual. Por favor, instala 7-Zip manualmente o extrae el archivo RAR de forma manual en la carpeta de GTA V.'
        });
      }
    }
}

// Cargar scripts desde archivos locales del mod instalado
async function loadScriptsFromLocal() {
  try {
    // Rutas posibles donde puede estar instalado GTA V
    const possiblePaths = [
      'C:\\Program Files\\Epic Games\\GTAV\\chaosmod\\scripts',
      'C:\\Program Files (x86)\\Epic Games\\GTAV\\chaosmod\\scripts',
      'C:\\Program Files\\Rockstar Games\\Grand Theft Auto V\\chaosmod\\scripts',
      'C:\\Program Files (x86)\\Rockstar Games\\Grand Theft Auto V\\chaosmod\\scripts',
      'C:\\Program Files\\Steam\\steamapps\\common\\Grand Theft Auto V\\chaosmod\\scripts',
      'D:\\Program Files\\Epic Games\\GTAV\\chaosmod\\scripts',
      'D:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V\\chaosmod\\scripts',
      'E:\\Program Files\\Epic Games\\GTAV\\chaosmod\\scripts',
      'E:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V\\chaosmod\\scripts',
    ];
    
    let scriptsPath = null;
    
    // Buscar en las rutas posibles
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        scriptsPath = testPath;
        console.log('[GTA V Chaos] ✅ Scripts encontrados en:', scriptsPath);
        break;
      }
    }
    
    if (!scriptsPath) {
      console.warn('[GTA V Chaos] ⚠️ No se encontró la carpeta de scripts en ninguna ruta común');
      console.warn('[GTA V Chaos] Rutas buscadas:', possiblePaths);
      return [];
    }
    
    const files = fs.readdirSync(scriptsPath).filter(f => f.endsWith('.lua'));
    console.log('[GTA V Chaos] 📜 Archivos .lua encontrados:', files.length);
    
    const scripts = [];
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(scriptsPath, file), 'utf8');
        
        // Parsear ScriptInfo básico del Lua
        const nameMatch = content.match(/Name\s*=\s*["']([^"']+)["']/);
        const idMatch = content.match(/ScriptId\s*=\s*["']([^"']+)["']/);
        
        if (nameMatch && idMatch) {
          scripts.push({
            id: idMatch[1],
            name: nameMatch[1],
            file: file
          });
          console.log('[GTA V Chaos] ✅ Script cargado:', nameMatch[1], '(', idMatch[1], ')');
        } else {
          // Si no tiene metadata, usar el nombre del archivo
          const scriptName = file.replace('.lua', '');
          scripts.push({
            id: scriptName,
            name: scriptName,
            file: file
          });
          console.log('[GTA V Chaos] ℹ️ Script sin metadata, usando nombre de archivo:', scriptName);
        }
      } catch (fileError) {
        console.warn('[GTA V Chaos] Error leyendo archivo:', file, fileError.message);
      }
    }
    
    console.log('[GTA V Chaos] 📊 Total de scripts cargados:', scripts.length);
    return scripts;
  } catch (e) {
    console.error('[GTA V Chaos] Error cargando scripts locales:', e);
    return [];
  }
}

function cleanup() {
  if (chaosService) {
    chaosService.disconnect();
    chaosService = null;
  }
}

module.exports = {
  init,
  cleanup,
  getService: () => chaosService
};

