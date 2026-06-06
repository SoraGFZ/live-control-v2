import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {}
  }

  const fileContents = readFileSync(filePath, 'utf8')

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
      (rawValue.startsWith('"') && rawValue.endsWith('"'))
      || (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue

    if (key) {
      envMap[key] = normalizedValue
    }

    return envMap
  }, {})
}

/**
 * Carga `.env` del proyecto y `desktop.env` (Electron) sin pisar variables ya definidas.
 */
export function loadProjectEnv(runtimeEnv = globalThis.process?.env || {}) {
  const candidates = [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, 'desktop.env'),
  ]

  const userDataRoot = String(runtimeEnv.LIVE_CONTROL_USER_DATA || '').trim()
  if (userDataRoot) {
    candidates.push(path.join(userDataRoot, 'desktop.env'))
  }

  for (const filePath of candidates) {
    const parsedEnv = parseEnvFile(filePath)

    Object.entries(parsedEnv).forEach(([key, value]) => {
      if (runtimeEnv[key] === undefined || runtimeEnv[key] === '') {
        runtimeEnv[key] = value
      }
    })
  }
}