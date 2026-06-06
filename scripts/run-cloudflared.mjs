import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { extractTunnelUrlFromText, persistTunnelUrl, syncPublicUrl } from './tunnel-sync.mjs'

const tunnelUrl = process.env.TUNNEL_URL || 'http://127.0.0.1:5123'

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
    'No encontre cloudflared. Instala con: winget install Cloudflare.cloudflared',
  )
  console.error('Luego ejecuta: npm run tunnel:cloudflare')
  process.exit(1)
}

console.log('Abriendo tunel Cloudflare (sin pagina "Visit Site" de ngrok)...')
console.log('Mantén Live Control abierto en el puerto 5123.')

const childProcess = spawn(cloudflaredPath, ['tunnel', '--url', tunnelUrl], {
  stdio: ['inherit', 'pipe', 'pipe'],
})

let bufferedOutput = ''
let latestPublicUrl = ''

function handleOutputChunk(chunk, stream) {
  const textChunk = chunk.toString()
  stream.write(textChunk)
  bufferedOutput += textChunk

  const matchedUrl = extractTunnelUrlFromText(bufferedOutput)

  if (!matchedUrl || matchedUrl === latestPublicUrl) {
    return
  }

  latestPublicUrl = matchedUrl
  persistTunnelUrl(matchedUrl)
  console.log(`\nPublic URL (Cloudflare): ${matchedUrl}`)
  console.log('Copia esa URL en Overlay → URL publica base.\n')
  void syncPublicUrl(matchedUrl)
}

childProcess.stdout.on('data', (chunk) => handleOutputChunk(chunk, process.stdout))
childProcess.stderr.on('data', (chunk) => handleOutputChunk(chunk, process.stderr))

childProcess.on('error', (error) => {
  console.error(`No pude abrir cloudflared: ${error.message}`)
  process.exit(1)
})

childProcess.on('exit', (code) => {
  process.exit(code ?? 0)
})

process.on('SIGINT', () => {
  if (!childProcess.killed) {
    childProcess.kill('SIGTERM')
  }
})

process.on('SIGTERM', () => {
  if (!childProcess.killed) {
    childProcess.kill('SIGTERM')
  }
})