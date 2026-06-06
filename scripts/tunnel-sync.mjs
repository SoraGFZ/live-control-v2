import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const storageDirectory = path.join(projectRoot, 'storage')
const tunnelUrlFile = path.join(storageDirectory, 'active-tunnel-url.txt')
const tunnelPort = Number(process.env.TUNNEL_PORT || 5123)

export function persistTunnelUrl(publicBaseUrl) {
  const normalized = String(publicBaseUrl || '').trim().replace(/\/+$/, '')

  if (!normalized) {
    return ''
  }

  mkdirSync(storageDirectory, { recursive: true })
  writeFileSync(tunnelUrlFile, `${normalized}\n`, 'utf8')
  return normalized
}

export async function syncPublicUrl(publicBaseUrl) {
  const normalized = persistTunnelUrl(publicBaseUrl)

  if (!normalized) {
    return false
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${tunnelPort}/api/state`)

      if (!response.ok) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        continue
      }

      const state = await response.json()
      state.profile.publicBaseUrl = normalized

      await fetch(`http://127.0.0.1:${tunnelPort}/api/state`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      })

      return true
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }

  return false
}

export function extractTunnelUrlFromText(textChunk = '') {
  const matches = String(textChunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi) || []

  return matches.at(-1) || ''
}