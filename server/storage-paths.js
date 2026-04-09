import path from 'node:path'

export function getStorageDirectory() {
  const configuredDirectory = String(globalThis.process.env.LIVE_CONTROL_STORAGE_DIR || '').trim()

  if (configuredDirectory) {
    return path.resolve(configuredDirectory)
  }

  return path.join(globalThis.process.cwd(), 'storage')
}

export function getMediaDirectoryPath() {
  return path.join(getStorageDirectory(), 'media')
}

export function getStateFilePath() {
  return path.join(getStorageDirectory(), 'live-control-state.json')
}
