import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { persistTunnelUrl, syncPublicUrl } from './tunnel-sync.mjs'

const projectRoot = path.resolve(import.meta.dirname, '..')
const tunnelPort = Number(process.env.TUNNEL_PORT || 5123)

const candidatePaths = [
  process.env.NGROK_PATH,
  path.join(
    process.env.LOCALAPPDATA || '',
    'Microsoft',
    'WinGet',
    'Packages',
    'Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe',
    'ngrok.exe',
  ),
  'ngrok',
].filter(Boolean)

function resolveNgrokPath() {
  return (
    candidatePaths.find((candidatePath) => candidatePath === 'ngrok' || existsSync(candidatePath)) ||
    'ngrok'
  )
}

console.log(
  'Nota: ngrok gratis muestra "Visit Site" en TikTok LIVE Studio. Si te molesta, usa: npm run tunnel:cloudflare',
)

const ngrokProcess = spawn(resolveNgrokPath(), ['http', String(tunnelPort), '--log', 'stdout'], {
  cwd: projectRoot,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
})

let bufferedStdout = ''
let latestPublicUrl = ''

function handleStdoutChunk(chunk) {
  const textChunk = chunk.toString()
  process.stdout.write(textChunk)
  bufferedStdout += textChunk

  const lines = bufferedStdout.split(/\r?\n/)
  bufferedStdout = lines.pop() || ''

  lines.forEach((line) => {
    const matchedUrl =
      line.match(/https:\/\/[a-z0-9-]+\.ngrok-free\.app/i)?.[0] ||
      line.match(/https:\/\/[a-z0-9-]+\.ngrok\.app/i)?.[0]

    if (!matchedUrl || matchedUrl === latestPublicUrl) {
      return
    }

    latestPublicUrl = matchedUrl
    persistTunnelUrl(matchedUrl)
    console.log(`Public URL (ngrok): ${matchedUrl}`)
    void syncPublicUrl(matchedUrl)
  })
}

ngrokProcess.stdout.on('data', handleStdoutChunk)
ngrokProcess.stderr.on('data', (chunk) => {
  const textChunk = chunk.toString()
  process.stderr.write(textChunk)

  if (/ERR_NGROK_4018|authtoken/i.test(textChunk)) {
    console.error(
      'Ngrok necesita tu authtoken. Ejecuta: npm run tunnel:auth -- <TU_TOKEN>',
    )
  }
})

function closeTunnel(signalCode = 0) {
  if (!ngrokProcess.killed) {
    ngrokProcess.kill('SIGTERM')
  }

  process.exit(signalCode)
}

process.on('SIGINT', () => closeTunnel(0))
process.on('SIGTERM', () => closeTunnel(0))

ngrokProcess.on('error', (error) => {
  console.error(`No pude iniciar ngrok: ${error.message}`)
  process.exit(1)
})

ngrokProcess.on('exit', (code) => {
  process.exit(code ?? 0)
})
