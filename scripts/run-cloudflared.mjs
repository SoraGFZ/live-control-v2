import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const tunnelUrl = process.env.TUNNEL_URL || 'http://localhost:5123'

const candidatePaths = [
  process.env.CLOUDFLARED_PATH,
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
  'cloudflared',
].filter(Boolean)

function resolveCloudflaredPath() {
  for (const candidatePath of candidatePaths) {
    if (candidatePath === 'cloudflared' || existsSync(candidatePath)) {
      return candidatePath
    }
  }

  return null
}

const cloudflaredPath = resolveCloudflaredPath()

if (!cloudflaredPath) {
  console.error(
    'No encontre cloudflared. Instala Cloudflare.cloudflared o define CLOUDFLARED_PATH.',
  )
  process.exit(1)
}

const childProcess = spawn(cloudflaredPath, ['tunnel', '--url', tunnelUrl], {
  stdio: 'inherit',
})

childProcess.on('error', (error) => {
  console.error(`No pude abrir cloudflared: ${error.message}`)
  process.exit(1)
})

childProcess.on('exit', (code) => {
  process.exit(code ?? 0)
})
