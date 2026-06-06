import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageFile = path.resolve(__dirname, '..', 'package.json')

function readPackageMetadata() {
  try {
    const packageJson = JSON.parse(readFileSync(packageFile, 'utf8'))

    return {
      id: 'live-control-studio',
      name: 'Live Control Studio',
      shortName: 'Live Control',
      edition: 'Creator Edition',
      version: String(packageJson.version || '0.0.0'),
      channel: 'commercial-preview',
      readyForLicensing: true,
    }
  } catch {
    return {
      id: 'live-control-studio',
      name: 'Live Control Studio',
      shortName: 'Live Control',
      edition: 'Creator Edition',
      version: '0.2.0-beta.8',
      channel: 'commercial-preview',
      readyForLicensing: true,
    }
  }
}

export const PRODUCT_INFO = readPackageMetadata()