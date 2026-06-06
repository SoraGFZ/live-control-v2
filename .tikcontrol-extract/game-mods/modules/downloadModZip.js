const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const AdmZip = require('adm-zip');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function unlinkQuiet(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

function resolveRedirect(location, currentUrl) {
  try {
    return new URL(location, currentUrl).toString();
  } catch (_) {
    return location;
  }
}

function downloadOnce(url, destPath, options = {}) {
  const timeoutMs = options.timeoutMs || 45000;
  const userAgent = options.userAgent || 'TikControl/1.0';

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result);
    };

    const requestUrl = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        finish(new Error('Demasiadas redirecciones al descargar el mod'));
        return;
      }

      const client = currentUrl.startsWith('https') ? https : http;
      const req = client.get(currentUrl, { headers: { 'User-Agent': userAgent } }, (response) => {
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          requestUrl(resolveRedirect(response.headers.location, currentUrl), redirectCount + 1);
          return;
        }

        if (status !== 200) {
          response.resume();
          finish(new Error(`Error HTTP ${status} al descargar el mod`));
          return;
        }

        const file = fs.createWriteStream(destPath);
        let bytes = 0;
        const expectedBytes = Number(response.headers['content-length'] || 0) || null;

        response.on('data', (chunk) => {
          bytes += chunk.length;
        });
        response.on('error', (err) => {
          file.destroy();
          finish(err);
        });
        file.on('error', (err) => {
          response.destroy();
          finish(err);
        });
        file.on('finish', () => {
          file.close(() => {
            if (expectedBytes && bytes !== expectedBytes) {
              finish(new Error(`Descarga incompleta (${bytes}/${expectedBytes} bytes)`));
              return;
            }
            finish(null, { bytes });
          });
        });

        response.pipe(file);
      });

      req.on('error', (err) => finish(err));
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('Timeout descargando el mod'));
      });
    };

    requestUrl(url);
  });
}

function normalizeEntryName(name) {
  return String(name || '').replace(/\\/g, '/').toLowerCase();
}

function validateZip(zipPath, options = {}) {
  const minBytes = options.minBytes || 1024;
  const expectedEntries = options.expectedEntries || [];
  const stat = fs.statSync(zipPath);

  if (stat.size < minBytes) {
    throw new Error(`El paquete descargado es demasiado pequeno (${stat.size} bytes)`);
  }

  const fd = fs.openSync(zipPath, 'r');
  try {
    const sig = Buffer.alloc(4);
    fs.readSync(fd, sig, 0, 4, 0);
    if (sig[0] !== 0x50 || sig[1] !== 0x4b) {
      throw new Error('El paquete descargado no es un ZIP valido');
    }
  } finally {
    fs.closeSync(fd);
  }

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  if (!entries.length) {
    throw new Error('El paquete del mod esta vacio');
  }

  if (expectedEntries.length) {
    const available = new Set(entries.map((entry) => normalizeEntryName(entry.entryName)));
    const missing = expectedEntries.filter((entryName) => !available.has(normalizeEntryName(entryName)));
    if (missing.length) {
      throw new Error(`El paquete del mod no contiene: ${missing.join(', ')}`);
    }
  }

  if (options.validateEntryData !== false) {
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      try {
        entry.getData();
      } catch (error) {
        throw new Error(`El paquete descargado esta incompleto o danado (${entry.entryName}: ${error.message})`);
      }
    }
  }

  return { entries };
}

async function downloadModZip(url, zipPath, options = {}) {
  const retries = options.retries == null ? 2 : options.retries;
  ensureDir(path.dirname(zipPath));
  unlinkQuiet(zipPath);

  let lastError = null;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const partPath = `${zipPath}.part-${process.pid}-${Date.now()}-${attempt}`;
    try {
      if (typeof options.onAttempt === 'function') options.onAttempt(attempt);
      const result = await downloadOnce(url, partPath, options);
      const validation = validateZip(partPath, options);
      unlinkQuiet(zipPath);
      fs.renameSync(partPath, zipPath);
      return {
        zipPath,
        bytes: result.bytes,
        entries: validation.entries.length,
        attempts: attempt
      };
    } catch (error) {
      lastError = error;
      unlinkQuiet(partPath);
      if (attempt <= retries && typeof options.onRetry === 'function') {
        options.onRetry(attempt, error);
      }
    }
  }

  throw new Error(`No se pudo descargar un ZIP valido del mod: ${lastError ? lastError.message : 'error desconocido'}`);
}

module.exports = {
  downloadModZip,
  validateZip
};
