'use strict';

/**
 * La pestaña Gaming llama siempre: setGamePath(profileId, gamePath).
 * Algunos preload antiguos solo enviaban la ruta (1 arg).
 */
function looksLikeFilesystemPath(s) {
  return typeof s === 'string' && (/[\\/]/.test(s) || /^[a-zA-Z]:/.test(s.trim()));
}

/**
 * @returns {{ profileId: *, path: string|null }}
 */
function resolveSetGamePathArgs(profileIdOrPath, maybePath) {
  if (maybePath !== undefined && maybePath !== null && String(maybePath).trim() !== '') {
    return { profileId: profileIdOrPath, path: String(maybePath).trim() };
  }
  const a = profileIdOrPath;
  if (a !== undefined && a !== null && typeof a === 'string' && looksLikeFilesystemPath(a)) {
    return { profileId: null, path: a.trim() };
  }
  return { profileId: a, path: null };
}

function getActiveProfileId() {
  try {
    const { app } = require('electron');
    const path = require('path');
    const fs = require('fs');
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.activeProfile || null;
    }
  } catch (_) {}
  return null;
}

module.exports = { resolveSetGamePathArgs, looksLikeFilesystemPath, getActiveProfileId };
